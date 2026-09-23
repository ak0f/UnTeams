// Einstieg: warten bis Teams geladen ist, dann Knopf + Fenster einfügen
(async () => {
  if (window.__unteams) return;
  window.__unteams = { version: UNTEAMS_VERSION };
  await waitFor(() => document.querySelector('.fui-FluentProvider') && document.head, 120000, 500);
  createUI();
  console.log('[UnTeams] geladen, v' + UNTEAMS_VERSION);
})();
