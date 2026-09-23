// Alles, was direkt von der Teams-Oberfläche abhängt. Bei einem Teams-Update meistens nur hier anpassen.
const SEL = {
  message: '[data-tid="chat-pane-message"]',
  myMessageClass: 'ChatMyMessage',
  tombstone: '[data-tid="message-tombstone"]',
  content: '[data-message-content]',
  deleteItem: '[data-tid="message-actions-delete"]',
  menuItem: '[role="menuitem"]',
  viewport: '[data-tid="message-pane-list-viewport"]',
  chatTitle: '[data-tid="chat-title"]',
  chatItem: '[role="treeitem"][data-item-type]',
  chatItemTitle: '[id^="title-chat-list-item_"]',
  file: '[data-tid*="file" i], [data-tid*="attachment" i], [data-tid*="image" i], img[data-gallery-src]',
};

const Teams = {
  viewport: () => document.querySelector(SEL.viewport),

  currentChatName: () => document.querySelector(SEL.chatTitle)?.textContent.trim() || '',

  // Alle aktuell geladenen Nachrichten, als einfache Objekte
  messages() {
    return [...document.querySelectorAll(SEL.message)].map((el) => {
      const content = el.querySelector(SEL.content);
      return {
        el,
        mid: el.dataset.mid,
        time: Number(el.dataset.mid) || 0,
        mine: el.className.includes(SEL.myMessageClass),
        deleted: !!el.querySelector(SEL.tombstone),
        text: content ? content.innerText.trim() : '',
        hasLink: !!content?.querySelector('a[href^="http"]'),
        hasFile: !!el.querySelector(SEL.file),
      };
    });
  },

  findMessage: (mid) => document.querySelector(`${SEL.message}[data-mid="${CSS.escape(mid)}"]`),

  closeMenu() {
    const t = document.activeElement || document.body;
    for (const type of ['keydown', 'keyup']) t.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  },

  // Öffnet das Kontextmenü einer Nachricht und klickt "Löschen".
  // Rückgabe: 'ok' | 'no-delete' (kein Löschen im Menü) | 'no-menu' | 'timeout'
  async deleteMessage(mid) {
    let el = Teams.findMessage(mid);
    if (!el) return 'gone';
    el.scrollIntoView({ block: 'center' });
    await sleep(150);
    el = Teams.findMessage(mid);
    if (!el) return 'gone';
    const target = el.querySelector(SEL.content) || el;
    const r = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, button: 2, buttons: 2,
      clientX: r.x + Math.min(20, r.width / 2), clientY: r.y + Math.min(10, r.height / 2),
    }));
    const menu = await waitFor(() => document.querySelector(SEL.menuItem), 2500);
    if (!menu) return 'no-menu';
    const del = document.querySelector(SEL.deleteItem);
    if (!del) { Teams.closeMenu(); await sleep(200); return 'no-delete'; }
    del.click();
    const ok = await waitFor(() => {
      const m = Teams.findMessage(mid);
      return !m || m.querySelector(SEL.tombstone);
    }, 6000);
    return ok ? 'ok' : 'timeout';
  },

  // Lädt ältere Nachrichten (hochscrollen). true, wenn neue dazugekommen sind.
  async loadOlder() {
    const vp = Teams.viewport();
    if (!vp) return false;
    const first = document.querySelector(SEL.message)?.dataset.mid;
    vp.scrollTop = 0;
    const changed = await waitFor(() => document.querySelector(SEL.message)?.dataset.mid !== first, 4000, 150);
    return !!changed;
  },

  scrollToBottom() {
    const vp = Teams.viewport();
    if (vp) vp.scrollTop = vp.scrollHeight;
  },

  // Chats aus der linken Liste (nur die, die Teams gerade geladen hat)
  chatList() {
    const seen = new Map();
    for (const item of document.querySelectorAll(SEL.chatItem)) {
      const t = item.querySelector(SEL.chatItemTitle);
      if (!t) continue;
      const id = t.id.replace('title-chat-list-item_', '');
      if (!seen.has(id)) seen.set(id, { id, name: t.textContent.trim(), type: item.dataset.itemType });
    }
    return [...seen.values()];
  },

  chatListScroller() {
    let el = document.querySelector(SEL.chatItem);
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  },

  // Chat-Liste ganz durchscrollen, damit Teams alle Einträge lädt
  async loadFullChatList(onProgress) {
    const sc = Teams.chatListScroller();
    const all = new Map(Teams.chatList().map((c) => [c.id, c]));
    if (!sc) return [...all.values()];
    sc.scrollTop = 0;
    await sleep(400);
    let same = 0;
    while (same < 4) {
      const before = all.size;
      sc.scrollTop += sc.clientHeight * 0.8;
      await sleep(500);
      for (const c of Teams.chatList()) all.set(c.id, c);
      onProgress && onProgress(all.size);
      same = all.size === before && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5 ? same + 1 : 0;
    }
    sc.scrollTop = 0;
    return [...all.values()];
  },

  async openChat(id) {
    const find = () => document.getElementById('title-chat-list-item_' + id)?.closest(SEL.chatItem);
    let item = find();
    const sc = Teams.chatListScroller();
    if (!item && sc) {
      sc.scrollTop = 0;
      await sleep(300);
      while (!item && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 5) {
        sc.scrollTop += sc.clientHeight * 0.8;
        await sleep(400);
        item = find();
      }
    }
    if (!item) return false;
    const before = document.querySelector(SEL.message)?.dataset.mid;
    item.scrollIntoView({ block: 'center' });
    item.click();
    await waitFor(() => document.querySelector(SEL.message)?.dataset.mid !== before, 5000);
    await sleep(1200);
    return true;
  },
};
