/* The first open: the splash, then the intro slides (like Wirebit's retail onboarding). Draft, throwaway spike. */
(function () {
  var q = function (doc, id) { return doc.querySelector('[data-od-id="' + id + '"]'); };

  /* app.splash — the egg hatches into the golden hen (the screen's own animation, ≈ 5.4 s); when it is over
     («splash:done»), signed out → the slides (DECISIONS F6) */
  WB.wire('app.splash', function (WB, doc) {
    WB.setScreenState('default');
    var next = function () { setTimeout(function () { WB.go('app.onboarding', { desde: 'splash' }); }, 400); };   // ponytail: the real app waits on its boot too
    if (doc.documentElement.getAttribute('data-splash') === 'done') next(); else doc.addEventListener('splash:done', next, { once: true });
  });

  /* app.onboarding — four slides (the carousel and the growing bird are the screen's own, window.CSWelcome), a fixed button; the last one opens sign-up, «Inicia sesión» sign-in, both through app.access */
  WB.wire('app.onboarding', function (WB, doc) {
    var welcome = doc.defaultView.CSWelcome, cta = q(doc, 'onboarding-cta'), label = cta.querySelector('.wb-cta-label');
    welcome.onChange(function (i) {
      label.textContent = i === 0 ? 'Comenzar' : 'Continuar';
      WB.setScreenState('slide-' + (i + 1));
    });
    cta.onclick = function () {
      var i = welcome.index();
      if (i < welcome.count - 1) welcome.go(i + 1); else WB.go('app.access');
    };
    q(doc, 'onboarding-sign-in').onclick = function () { WB.go('app.access', { modo: 'entrar' }); return false; };
    var start = Number(String(WB.params.estado || '').replace('slide-', '')) || 1;
    if (WB.params.desde === 'splash') welcome.handoff(); else welcome.set(start - 1);
  });

  /* app.access — who uses this phone, then the adult's sign-up or sign-in, or the kid's code (the steps are the screen's own,
     window.CSAccess). Accounts are pretend: every adult enters as Mamá (DECISIONS F7); a code belongs to one kid (familia R12). */
  WB.wire('app.access', function (WB, doc) {
    var CODES = { '482936': 'p-sofia', '735924': 'p-mateo' };   // ponytail: fixed codes; R12's expiry, single use and attempt limit come with pairing
    function kid(id) { return WB.state.get('people', id); }
    doc.defaultView.CSAccess.connect({
      intent: WB.params.modo === 'entrar' ? 'entrar' : 'crear',
      start: WB.params.estado || 'rol',
      hold: !!WB.still,   // a still stays on its step («preparando» moves on by itself)
      verifyCode: '123456',
      wrongPass: 'incorrecta',
      isTaken: function (email) { return WB.state.list('people', function (p) { return p.email === email; }).length > 0; },
      kidFor: function (code) { return CODES[code] ? kid(CODES[code]) : null; },
      previewKid: function () { return kid('p-sofia'); },
      onChange: function (id) { WB.setScreenState(id); },
      leave: function () { WB.go('app.onboarding'); },
      enterAdult: function () { WB.session.signIn('p-mama'); WB.go('app.today'); },
      enterKid: function (k) { WB.session.signIn(k.id); WB.go('app.kid', { kid: k.id }); }
    });
  });
})();
