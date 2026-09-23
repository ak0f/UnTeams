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
  style.textContent = __CSS__;
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
