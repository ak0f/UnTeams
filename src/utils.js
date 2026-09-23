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

