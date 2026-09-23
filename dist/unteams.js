/* UnTeams v1.0.0 – eigene Microsoft-Teams-Nachrichten löschen. Gebaut aus src/, nicht direkt bearbeiten. */
(() => {
'use strict';
const UNTEAMS_VERSION = "1.0.0";
// ---- utils.js ----
// Kleine Helfer
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 3000, step = 100) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

function fmtDuration(ms) {
  if (!isFinite(ms) || ms < 0) return '–';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtDate(ms) {
  return new Date(ms).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
}


// ---- teams.js ----
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

// ---- deleter.js ----
// Kernlogik (wie UndiscordCore): Nachrichten suchen → filtern → einzeln löschen
class UnTeamsCore {
  constructor(log, onProgress) {
    this.log = log;
    this.onProgress = onProgress;
    this.running = false;
    this.stopRequested = false;
  }

  stop() { this.stopRequested = true; }

  matches(m, o) {
    if (!m.mine || m.deleted || !m.mid) return false;
    if (o.minTime && m.time < o.minTime) return false;
    if (o.maxTime && m.time > o.maxTime) return false;
    if (o.hasLink && !m.hasLink) return false;
    if (o.hasFile && !m.hasFile) return false;
    if (o.pattern) {
      if (o.regex) { if (!o.regex.test(m.text)) return false; }
      else if (!m.text.toLowerCase().includes(o.pattern.toLowerCase())) return false;
    }
    return true;
  }

  // o: { chats: [{id,name}] | null (= aktueller Chat), dryRun, delay, pattern, regex, minTime, maxTime, hasLink, hasFile }
  async run(o) {
    this.running = true;
    this.stopRequested = false;
    this.stats = { found: 0, deleted: 0, failed: 0, skipped: 0, chatsDone: 0, chatsTotal: o.chats ? o.chats.length : 1, start: Date.now() };
    this.delay = this.baseDelay = o.delay;
    document.querySelectorAll(SEL.message).forEach((el) => { el.style.outline = ''; });
    try {
      if (!o.chats) {
        await this.runChat(Teams.currentChatName() || 'Aktueller Chat', o);
      } else {
        for (const chat of o.chats) {
          if (this.stopRequested) break;
          this.log('info', `Öffne Chat „${chat.name}“ …`);
          if (!(await Teams.openChat(chat.id))) {
            this.log('warn', `Chat „${chat.name}“ nicht gefunden, übersprungen.`);
            this.stats.chatsDone++;
            continue;
          }
          await this.runChat(chat.name, o);
          this.stats.chatsDone++;
        }
      }
    } catch (e) {
      this.log('error', 'Fehler: ' + e.message);
      console.error('[UnTeams]', e);
    }
    this.running = false;
    this.onProgress(this.stats, true);
    const s = this.stats;
    if (o.dryRun) this.log('success', `Vorschau fertig: ${s.found} Nachrichten würden gelöscht.`);
    else this.log('success', `Fertig: ${s.deleted} gelöscht, ${s.failed} Fehler, ${s.skipped} übersprungen (${fmtDuration(Date.now() - s.start)}).`);
    return s;
  }

  async runChat(name, o) {
    const handled = new Set();
    let emptyRounds = 0;
    let foundHere = 0;
    this.log('info', `Durchsuche „${name}“ …`);
    Teams.scrollToBottom();
    await sleep(500);

    while (!this.stopRequested) {
      const msgs = Teams.messages();
      const todo = msgs.filter((m) => !handled.has(m.mid) && this.matches(m, o)).reverse(); // neueste zuerst

      if (todo.length) {
        emptyRounds = 0;
        for (const m of todo) {
          if (this.stopRequested) break;
          handled.add(m.mid);
          this.stats.found++;
          foundHere++;
          if (o.dryRun) {
            m.el.style.outline = '2px dashed #c4314b';
            m.el.style.outlineOffset = '2px';
            this.log('preview', `${fmtDate(m.time)}  ${m.text.slice(0, 80) || '(ohne Text)'}`);
            this.onProgress(this.stats);
            continue;
          }
          await this.deleteOne(m);
          this.onProgress(this.stats);
          await sleep(this.delay + Math.random() * this.delay * 0.3);
        }
        continue; // gleiche Ansicht nochmal prüfen, dann hochscrollen
      }

      // Älteste geladene Nachricht schon vor dem "Von"-Datum? Dann nicht weiter hochscrollen.
      const oldest = msgs.find((m) => m.time)?.time;
      if (o.minTime && oldest && oldest < o.minTime) break;

      const more = await Teams.loadOlder();
      if (!more && ++emptyRounds >= 3) break;
      if (more) emptyRounds = 0;
    }
    this.log('info', `„${name}“: ${foundHere} passende Nachrichten.`);
  }

  async deleteOne(m) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await Teams.deleteMessage(m.mid);
      if (res === 'ok') {
        this.stats.deleted++;
        this.log('delete', `Gelöscht: ${fmtDate(m.time)}  ${m.text.slice(0, 80) || '(ohne Text)'}`);
        // nach Erfolg Pause langsam wieder Richtung Einstellung senken
        this.delay = Math.max(this.baseDelay, Math.round(this.delay * 0.9));
        return;
      }
      if (res === 'gone') { this.stats.skipped++; return; }
      if (res === 'no-delete') {
        this.stats.skipped++;
        this.log('warn', `Kann nicht gelöscht werden (kein „Löschen“ im Menü): ${m.text.slice(0, 60)}`);
        return;
      }
      // no-menu / timeout: Teams ist langsam oder bremst → warten, Pause erhöhen
      Teams.closeMenu();
      this.delay = Math.min(this.delay * 2, 30000);
      this.log('warn', `Teams reagiert nicht (${res}), warte ${fmtDuration(this.delay)} (Versuch ${attempt}/3) …`);
      await sleep(this.delay);
    }
    this.stats.failed++;
    this.log('error', `Fehlgeschlagen: ${m.text.slice(0, 60)}`);
  }
}

// ---- ui.js ----
// Schwebendes Fenster in Teams (wie das Undiscord-Fenster)
// Teams erzwingt Trusted Types (kein innerHTML) → Elemente direkt bauen
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'hidden' || k === 'checked' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...kids.flat());
  return el;
}

const hint = (text) => h('span', { class: 'ut-hint' }, text);

function buildPanel() {
  const input = (props) => h('input', props);
  const field = (label, props) => h('label', {}, label, input(props));
  const check = (name, label, style = 'flex-direction:row;flex:0 0 auto') => h('label', { style }, input({ type: 'checkbox', name }), ' ' + label);
  return [
    h('div', { class: 'ut-head' },
      h('span', {}, '🗑️'), h('b', {}, 'UnTeams'), h('small', { class: 'ut-ver' }),
      h('button', { class: 'ut-x', title: 'Schliessen' }, '×')),
    h('div', { class: 'ut-body' },
      h('fieldset', {},
        h('legend', {}, 'Wo löschen?'),
        h('label', {}, input({ type: 'radio', name: 'ut-where', value: 'current', checked: true }), ' Nur im offenen Chat ', h('small', { class: 'ut-cur' })),
        h('label', {}, input({ type: 'radio', name: 'ut-where', value: 'list' }), ' In ausgewählten Chats'),
        h('div', { class: 'ut-listbox', hidden: true },
          h('div', { class: 'ut-mini' },
            h('button', { class: 'ut-b small', 'data-a': 'load' }, 'Chat-Liste laden'),
            h('button', { class: 'ut-b small', 'data-a': 'all' }, 'Alle'),
            h('button', { class: 'ut-b small', 'data-a': 'none' }, 'Keine'),
            input({ type: 'text', class: 'ut-search', placeholder: 'Suchen …', style: 'flex:1;min-width:90px' })),
          h('div', { class: 'ut-chats' }, hint('„Chat-Liste laden“ drücken.')))),
      h('fieldset', {},
        h('legend', {}, 'Filter (optional)'),
        h('div', { class: 'ut-row' },
          field('Text enthält', { type: 'text', name: 'pattern', placeholder: 'z.B. hallo' }),
          check('isRegex', 'Regex', 'flex-direction:row;flex:0 0 auto;align-self:flex-end')),
        h('div', { class: 'ut-row' },
          field('Von', { type: 'datetime-local', name: 'from' }),
          field('Bis', { type: 'datetime-local', name: 'to' })),
        h('div', { class: 'ut-row', style: 'gap:14px' },
          check('hasLink', 'nur mit Link'),
          check('hasFile', 'nur mit Datei/Bild'))),
      h('fieldset', {},
        h('legend', {}, 'Tempo'),
        h('div', { class: 'ut-row' },
          field('Pause zwischen Löschungen (ms)', { type: 'number', name: 'delay', value: '1200', min: '300', step: '100' })),
        hint('Kleiner = schneller, aber Teams kann bremsen. Bei Problemen wird die Pause automatisch erhöht.')),
      h('div', { class: 'ut-actions' },
        h('button', { class: 'ut-b', 'data-a': 'preview' }, '🔍 Vorschau'),
        h('button', { class: 'ut-b primary', 'data-a': 'start' }, 'Löschen starten'),
        h('button', { class: 'ut-b', 'data-a': 'stop', disabled: true }, '■ Stopp')),
      h('div', { class: 'ut-progress' }, h('div')),
      h('div', { class: 'ut-stats' }, h('span', { class: 'ut-s1' }, 'Bereit.'), h('span', { class: 'ut-s2' })),
      h('div', { class: 'ut-log' })),
  ];
}
function createUI() {
  const style = document.createElement('style');
  style.id = 'unteams-style';
  style.textContent = "#unteams-btn {\n  position: fixed; right: 18px; bottom: 96px; z-index: 99998;\n  width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;\n  background: #c4314b; color: #fff; font-size: 20px; line-height: 44px;\n  box-shadow: 0 4px 14px rgba(0,0,0,.35);\n}\n#unteams-btn:hover { background: #a4262c; }\n\n#unteams {\n  --ut-bg: var(--colorNeutralBackground1, #fff);\n  --ut-bg2: var(--colorNeutralBackground3, #f5f5f5);\n  --ut-fg: var(--colorNeutralForeground1, #242424);\n  --ut-fg2: var(--colorNeutralForeground3, #616161);\n  --ut-border: var(--colorNeutralStroke2, #e0e0e0);\n  --ut-accent: var(--colorBrandBackground, #5b5fc7);\n  --ut-danger: #c4314b;\n  position: fixed; right: 18px; top: 56px; z-index: 99999;\n  width: 420px; max-width: calc(100vw - 36px); max-height: calc(100vh - 72px);\n  display: flex; flex-direction: column;\n  background: var(--ut-bg); color: var(--ut-fg); border: 1px solid var(--ut-border);\n  border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.35);\n  font: 13px/1.4 \"Segoe UI\", system-ui, sans-serif;\n}\n#unteams[hidden] { display: none; }\n#unteams * { box-sizing: border-box; }\n#unteams .ut-head {\n  display: flex; align-items: center; gap: 8px; padding: 10px 12px;\n  border-bottom: 1px solid var(--ut-border); cursor: move; user-select: none;\n}\n#unteams .ut-head b { flex: 1; font-size: 14px; }\n#unteams .ut-x { background: none; border: none; color: var(--ut-fg2); font-size: 18px; cursor: pointer; }\n#unteams .ut-body { overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }\n#unteams fieldset { border: 1px solid var(--ut-border); border-radius: 8px; padding: 8px 10px; margin: 0; display: flex; flex-direction: column; gap: 6px; }\n#unteams legend { padding: 0 4px; font-weight: 600; }\n#unteams label { display: flex; align-items: center; gap: 6px; }\n#unteams .ut-row { display: flex; gap: 8px; }\n#unteams .ut-row > label { flex: 1; flex-direction: column; align-items: stretch; gap: 2px; color: var(--ut-fg2); font-size: 12px; }\n#unteams input[type=text], #unteams input[type=number], #unteams input[type=datetime-local] {\n  width: 100%; padding: 5px 7px; border-radius: 5px; border: 1px solid var(--ut-border);\n  background: var(--ut-bg2); color: var(--ut-fg); font: inherit;\n}\n#unteams .ut-chats { max-height: 150px; overflow: auto; border: 1px solid var(--ut-border); border-radius: 5px; padding: 4px 6px; }\n#unteams .ut-chats label { padding: 1px 0; }\n#unteams .ut-chats small { color: var(--ut-fg2); }\n#unteams .ut-mini { display: flex; gap: 6px; flex-wrap: wrap; }\n#unteams button.ut-b {\n  padding: 6px 12px; border-radius: 5px; border: 1px solid var(--ut-border); cursor: pointer;\n  background: var(--ut-bg2); color: var(--ut-fg); font: inherit;\n}\n#unteams button.ut-b.small { padding: 2px 8px; font-size: 12px; }\n#unteams button.ut-b.primary { background: var(--ut-danger); border-color: var(--ut-danger); color: #fff; font-weight: 600; }\n#unteams button.ut-b:disabled { opacity: .5; cursor: default; }\n#unteams .ut-actions { display: flex; gap: 8px; }\n#unteams .ut-actions button { flex: 1; }\n#unteams .ut-progress { height: 6px; background: var(--ut-bg2); border-radius: 3px; overflow: hidden; }\n#unteams .ut-progress div { height: 100%; width: 0; background: var(--ut-danger); transition: width .3s; }\n#unteams .ut-stats { display: flex; justify-content: space-between; color: var(--ut-fg2); font-size: 12px; }\n#unteams .ut-log {\n  height: 150px; min-height: 90px; flex-shrink: 0; overflow: auto; padding: 6px 8px; border-radius: 5px;\n  background: var(--ut-bg2); font: 11.5px/1.45 Consolas, monospace; white-space: pre-wrap; word-break: break-word;\n}\n#unteams .ut-log .info { color: var(--ut-fg2); }\n#unteams .ut-log .warn { color: #c19c00; }\n#unteams .ut-log .error { color: #d13438; }\n#unteams .ut-log .success { color: #13a10e; font-weight: 600; }\n#unteams .ut-log .delete { color: var(--ut-fg); }\n#unteams .ut-log .preview { color: #c4314b; }\n#unteams .ut-hint { color: var(--ut-fg2); font-size: 12px; }\n";
  document.head.appendChild(style);

  const host = document.querySelector('.fui-FluentProvider') || document.body; // für Teams-Farben (hell/dunkel)
  const btn = document.createElement('button');
  btn.id = 'unteams-btn';
  btn.title = 'UnTeams – eigene Nachrichten löschen';
  btn.textContent = '🗑️';
  const panel = document.createElement('div');
  panel.id = 'unteams';
  panel.hidden = true;
  panel.append(...buildPanel());
  host.append(btn, panel);

  const $ = (s) => panel.querySelector(s);
  const $$ = (s) => [...panel.querySelectorAll(s)];
  $('.ut-ver').textContent = 'v' + UNTEAMS_VERSION;

  // Teams soll unsere Tasten nicht abfangen (Shortcuts)
  for (const ev of ['keydown', 'keyup', 'keypress']) panel.addEventListener(ev, (e) => e.stopPropagation());

  const logBox = $('.ut-log');
  const log = (type, text) => {
    const line = document.createElement('div');
    line.className = type;
    line.textContent = `[${new Date().toLocaleTimeString('de-CH')}] ${text}`;
    logBox.appendChild(line);
    while (logBox.childElementCount > 1000) logBox.firstChild.remove();
    logBox.scrollTop = logBox.scrollHeight;
  };

  const bar = $('.ut-progress div');
  const onProgress = (s, done) => {
    const dry = core.dryRun;
    const perChat = s.chatsTotal > 1 ? ` · Chat ${Math.min(s.chatsDone + 1, s.chatsTotal)}/${s.chatsTotal}` : '';
    $('.ut-s1').textContent = dry ? `Gefunden: ${s.found}${perChat}` : `Gelöscht: ${s.deleted} · Fehler: ${s.failed} · Übersprungen: ${s.skipped}${perChat}`;
    const elapsed = Date.now() - s.start;
    $('.ut-s2').textContent = done ? fmtDuration(elapsed) : dry ? '' : `${(s.deleted / Math.max(elapsed / 60000, 0.01)).toFixed(0)}/min`;
    bar.style.width = s.chatsTotal > 1 ? (100 * s.chatsDone / s.chatsTotal) + '%' : done ? '100%' : '50%';
  };
  const core = new UnTeamsCore(log, onProgress);

  // Öffnen/Schliessen
  btn.onclick = () => { panel.hidden = !panel.hidden; refreshCurrent(); };
  $('.ut-x').onclick = () => { panel.hidden = true; };
  const refreshCurrent = () => { const n = Teams.currentChatName(); $('.ut-cur').textContent = n ? `(${n})` : ''; };
  setInterval(() => { if (!panel.hidden) refreshCurrent(); }, 2000);

  // Verschieben
  $('.ut-head').addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => {
      panel.style.left = Math.max(0, ev.clientX - dx) + 'px';
      panel.style.top = Math.max(0, ev.clientY - dy) + 'px';
      panel.style.right = panel.style.bottom = 'auto';
    };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });

  // Chat-Auswahl
  let chats = [];
  const selected = new Set();
  const renderChats = () => {
    const q = $('.ut-search').value.toLowerCase();
    const box = $('.ut-chats');
    const shown = chats.filter((c) => c.name.toLowerCase().includes(q));
    box.replaceChildren(...(shown.length ? [] : [hint('Keine Chats.')]));
    for (const c of shown) {
      const cb = h('input', { type: 'checkbox', checked: selected.has(c.id) });
      cb.onchange = () => { cb.checked ? selected.add(c.id) : selected.delete(c.id); };
      box.appendChild(h('label', {}, cb, ' ' + c.name + ' ', h('small', {}, c.type === 'chat' ? '' : c.type)));
    }
  };
  $$('input[name="ut-where"]').forEach((r) => r.onchange = () => { $('.ut-listbox').hidden = r.value !== 'list' || !r.checked; });
  $('.ut-search').oninput = renderChats;
  panel.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'load') {
      e.target.disabled = true;
      $('.ut-chats').replaceChildren(hint('Lade Chats …'));
      chats = await Teams.loadFullChatList((n) => { $('.ut-chats').replaceChildren(hint(`Lade Chats … ${n}`)); });
      e.target.disabled = false;
      log('info', `${chats.length} Chats in der Liste gefunden.`);
      renderChats();
    }
    if (a === 'all') { chats.forEach((c) => selected.add(c.id)); renderChats(); }
    if (a === 'none') { selected.clear(); renderChats(); }
    if (a === 'preview') start(true);
    if (a === 'start') start(false);
    if (a === 'stop') { core.stop(); log('warn', 'Stopp angefordert …'); }
  });

  const val = (n) => panel.querySelector(`[name="${n}"]`);
  let armed = false, armTimer = null;
  async function start(dryRun) {
    if (core.running) return;
    const where = panel.querySelector('input[name="ut-where"]:checked').value;
    let list = null;
    if (where === 'list') {
      list = chats.filter((c) => selected.has(c.id));
      if (!list.length) return log('error', 'Keine Chats ausgewählt.');
    } else if (!Teams.viewport()) {
      return log('error', 'Kein Chat offen. Bitte zuerst einen Chat öffnen.');
    }
    const pattern = val('pattern').value.trim();
    let regex = null;
    if (pattern && val('isRegex').checked) {
      try { regex = new RegExp(pattern, 'i'); } catch (err) { return log('error', 'Ungültige Regex: ' + err.message); }
    }
    const o = {
      chats: list, dryRun, pattern, regex,
      delay: Math.max(300, Number(val('delay').value) || 1200),
      minTime: val('from').value ? new Date(val('from').value).getTime() : 0,
      maxTime: val('to').value ? new Date(val('to').value).getTime() : 0,
      hasLink: val('hasLink').checked, hasFile: val('hasFile').checked,
    };
    if (!dryRun && !armed) {
      // Sicherheitsabfrage: zweiter Klick innert 5 Sekunden
      const b = $('[data-a="start"]');
      const target = list ? `${list.length} Chat(s)` : `„${Teams.currentChatName() || 'aktueller Chat'}“`;
      armed = true;
      b.textContent = '⚠️ Sicher? Nochmals klicken';
      log('warn', `Nochmals klicken, um eigene Nachrichten in ${target} zu löschen.`);
      armTimer = setTimeout(() => { armed = false; b.textContent = 'Löschen starten'; }, 5000);
      return;
    }
    clearTimeout(armTimer);
    armed = false;
    $('[data-a="start"]').textContent = 'Löschen starten';
    core.dryRun = dryRun;
    $('[data-a="start"]').disabled = $('[data-a="preview"]').disabled = true;
    $('[data-a="stop"]').disabled = false;
    bar.style.width = '0';
    log('info', dryRun ? '— Vorschau startet (es wird nichts gelöscht) —' : '— Löschen startet —');
    await core.run(o);
    $('[data-a="start"]').disabled = $('[data-a="preview"]').disabled = false;
    $('[data-a="stop"]').disabled = true;
  }

  log('info', 'UnTeams bereit. Chat öffnen → Vorschau → Löschen starten.');
}

// ---- main.js ----
// Einstieg: warten bis Teams geladen ist, dann Knopf + Fenster einfügen
(async () => {
  if (window.__unteams) return;
  window.__unteams = { version: UNTEAMS_VERSION };
  await waitFor(() => document.querySelector('.fui-FluentProvider') && document.head, 120000, 500);
  createUI();
  console.log('[UnTeams] geladen, v' + UNTEAMS_VERSION);
})();

})();
