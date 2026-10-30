/* The doors (index.html): «Use the app» offers «Continue» once the app was used — its saved last screen, the splash
   alone does not count (a Reset leaves it there) — otherwise just «Start». An old link to the simulator (/simulator/#app.kid?kid=…) goes on to the app. */
(function () {
  'use strict';
  if (location.hash.length > 1) { location.replace('app.html' + location.hash); return; }
  var WB = window.WB;
  WB.ready(function () {
    // 'wb-shell/v1' is shell.js's prefs: lastApp, the screen the app last showed
    var last = null; try { last = (JSON.parse(localStorage.getItem('wb-shell/v1')) || {}).lastApp; } catch (e) {}
    var inUse = !!(last && last.id && last.id !== 'app.splash');
    document.querySelector('[data-testid="door-continue"]').hidden = !inUse;
    var start = document.querySelector('[data-testid="door-start"]');
    start.textContent = inUse ? 'Start from the splash' : 'Start';
    document.querySelector(inUse ? '[data-testid="door-continue"]' : '[data-testid="door-start"]').classList.add('primary');
    document.documentElement.setAttribute('data-theme', WB.theme.get());
  });
})();
