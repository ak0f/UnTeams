// Baut dist/unteams.js aus src/ (keine Pakete nötig): node build.js
const fs = require('fs');
const path = require('path');

const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const { version } = require('./package.json');

const code = ['utils.js', 'teams.js', 'deleter.js', 'ui.js', 'main.js']
  .map((f) => `// ---- ${f} ----\n${src(f)}`)
  .join('\n')
  .replace('__CSS__', JSON.stringify(src('ui.css')));

const out = `/* UnTeams v${version} – eigene Microsoft-Teams-Nachrichten löschen. Gebaut aus src/, nicht direkt bearbeiten. */
(() => {
'use strict';
const UNTEAMS_VERSION = ${JSON.stringify(version)};
${code}
})();
`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'unteams.js'), out);
console.log(`dist/unteams.js gebaut (${(out.length / 1024).toFixed(1)} KB)`);
