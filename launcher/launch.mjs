// UnTeams Launcher: startet die Teams-Desktop-App mit Debug-Port und fügt UnTeams ein.
// Läuft weiter, solange Teams offen ist, und fügt UnTeams nach einem Neuladen wieder ein.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.UNTEAMS_PORT) || 9222;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'dist', 'unteams.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toLocaleTimeString('de-CH')}]`, ...a);

async function getTargets() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(2000) });
    return await r.json();
  } catch {
    return null;
  }
}

function teamsExe() {
  const loc = execSync('powershell -NoProfile -Command "(Get-AppxPackage MSTeams | Select-Object -First 1).InstallLocation"')
    .toString().trim();
  if (!loc) throw new Error('Das neue Microsoft Teams (MSTeams) ist nicht installiert.');
  return path.join(loc, 'ms-teams.exe');
}

function teamsRunning() {
  try {
    return execSync('tasklist /FI "IMAGENAME eq ms-teams.exe" /NH').toString().includes('ms-teams.exe');
  } catch {
    return false;
  }
}

async function startTeams() {
  const exe = teamsExe();
  if (teamsRunning()) {
    log('Teams läuft ohne Debug-Port → wird neu gestartet …');
    try { execSync('taskkill /IM ms-teams.exe /F', { stdio: 'ignore' }); } catch {}
    for (let i = 0; i < 20 && teamsRunning(); i++) await sleep(500);
    await sleep(1500);
  }
  log('Starte Teams …');
  spawn(exe, [], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  }).unref();
}

function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      resolve(m.result?.result?.value);
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('websocket')); };
  });
}

async function main() {
  console.log('UnTeams – eigene Teams-Nachrichten löschen\n');
  if (!fs.existsSync(SCRIPT)) throw new Error('dist/unteams.js fehlt. Zuerst "node build.js" ausführen.');

  if (!(await getTargets())) {
    await startTeams();
    log('Warte auf Teams …');
    for (let i = 0; i < 90 && !(await getTargets()); i++) await sleep(1000);
    if (!(await getTargets())) throw new Error('Teams hat keinen Debug-Port geöffnet. Teams ganz schliessen und nochmals versuchen.');
  } else {
    log('Teams läuft bereits mit Debug-Port.');
  }

  log('Verbunden. UnTeams wird in Teams eingefügt, sobald Teams fertig geladen ist.');
  log('Dieses Fenster offen lassen (minimieren ist ok). Schliessen beendet nur UnTeams, nicht Teams.\n');

  const injected = new Set();
  let missing = 0;
  for (;;) {
    const targets = await getTargets();
    if (!targets) {
      if (++missing >= 5) { log('Teams wurde geschlossen. UnTeams beendet.'); return; }
    } else {
      missing = 0;
      for (const t of targets) {
        if (t.type !== 'page' || !t.url.startsWith('https://teams.microsoft.com/v2') || !t.title.includes(' | ')) continue;
        try {
          const has = await evaluate(t.webSocketDebuggerUrl, '!!window.__unteams');
          if (!has) {
            await evaluate(t.webSocketDebuggerUrl, fs.readFileSync(SCRIPT, 'utf8'));
            log(injected.has(t.id) ? 'Teams wurde neu geladen → UnTeams wieder eingefügt.' : 'UnTeams eingefügt ✔  Unten rechts in Teams auf 🗑️ klicken.');
            injected.add(t.id);
          }
        } catch { /* Seite lädt gerade */ }
      }
    }
    await sleep(3000);
  }
}

main().catch((e) => {
  console.error('\nFehler: ' + e.message);
  process.exitCode = 1;
});
