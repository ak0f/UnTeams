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
