/* The first open: the splash, then the intro slides (like Wirebit's retail onboarding). Draft, throwaway spike. */
(function () {
  var q = function (doc, id) { return doc.querySelector('[data-od-id="' + id + '"]'); };

  /* app.splash — the egg hatches into the golden hen (the screen's own animation, ≈ 5.4 s); when it is over
     («splash:done»), signed out → the slides (DECISIONS F6) */
  WB.wire('app.splash', function (WB, doc) {
    WB.setScreenState('default');
    var next = function () { setTimeout(function () { WB.go('app.onboarding'); }, 400); };   // ponytail: the real app waits on its boot too
    if (doc.documentElement.getAttribute('data-splash') === 'done') next(); else doc.addEventListener('splash:done', next, { once: true });
  });

  /* app.onboarding — four slides, a fixed button; the last one would lead to sign-up. Until sign-up and sign-in exist
     both enter as Mamá and open her home (DECISIONS F7) */
  WB.wire('app.onboarding', function (WB, doc) {
    var pager = q(doc, 'onboarding-pager'), cta = q(doc, 'onboarding-cta'), dots = q(doc, 'onboarding-steps').children;
    var n = dots.length, at = function () { return Math.round(pager.scrollLeft / pager.clientWidth); };
    function paint() {
      var i = at();
      for (var k = 0; k < n; k++) dots[k].className = k === i ? 'on' : '';
      cta.textContent = i === 0 ? 'Comenzar' : 'Continuar';
      WB.setScreenState('slide-' + (i + 1));
    }
    pager.addEventListener('scroll', paint);
    cta.onclick = function () {
      var i = at();
      if (i < n - 1) pager.scrollTo({ left: (i + 1) * pager.clientWidth, behavior: 'smooth' });
      else enter();
    };
    q(doc, 'onboarding-sign-in').onclick = enter;
    function enter() { WB.session.signIn('p-mama'); WB.go('app.today'); }   // ponytail: a stand-in for sign-up and sign-in
    var start = Number(String(WB.params.estado || '').replace('slide-', '')) || 1;
    pager.scrollLeft = (start - 1) * pager.clientWidth;
    paint();
  });
})();
