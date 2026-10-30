/* «See the screens» (gallery.html): every state of every app screen as a small live phone, grouped by flow — the
   flow docs' order (WB.index.flowTitles), then the catalog's. Each thumbnail is a still of the real screen (sim.js
   ?still=1&as=<person>): the standard family, seen as that state's person, never moving on, never saving. A click
   opens the screen at that state in «Use the app» (app.html), with the visitor's own data. */
(function () {
  'use strict';
  var WB = window.WB;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  WB.ready(function () {
    document.documentElement.setAttribute('data-theme', WB.theme.get());
    var screens = WB.index.screens || {}, titles = WB.index.flowTitles || {};
    var people = ((WB.index.scenarios[WB.index.defaultScenario] || {}).data || {}).people || [];
    // whose eyes: the state's own «as», else the kid in its params when that kid has a phone, else Mamá
    var viewer = function (st) {
      if (st.as) return st.as;
      var kid = (st.params && st.params.kid) && people.find(function (p) { return p.id === st.params.kid; });
      return kid && kid.paired ? kid.id : 'p-mama';
    };
    var groups = {};
    Object.keys(screens).map(function (id) { return screens[id]; })
      .filter(function (d) { return !/^dev\./.test(d.id) && !d.hidden; })
      .sort(function (a, b) { return a.n - b.n; })
      .forEach(function (d) {
        var g = titles[d.flow] || { title: 'Other', order: 100 };
        (groups[g.title] = groups[g.title] || { title: g.title, order: g.order, screens: [] }).screens.push(d);
      });
    var html = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a.order - b.order; }).map(function (g) {
      var items = [];
      g.screens.forEach(function (d) {
        d.states.forEach(function (st) {
          var params = Object.assign({}, st.params || {}, st.drive ? { estado: st.id } : {});
          var still = WB.href(d.id, Object.assign({}, params, { still: 1, as: viewer(st) }));
          var q = new URLSearchParams(params).toString(), open = 'app.html#' + d.id + (q ? '?' + q : '');
          items.push('<a class="gal-item" href="' + esc(open) + '" data-testid="gal-item" data-screen="' + esc(d.id) + '" data-state="' + esc(st.id) + '">'
            + '<span class="gal-phone"><iframe src="' + esc(still) + '" loading="lazy" tabindex="-1" aria-hidden="true" title=""></iframe></span>'
            + '<b>' + esc(d.title) + '</b><small>' + esc(st.title || st.id) + '</small></a>');
        });
      });
      return '<section class="gal-group" data-testid="gal-group"><h2>' + esc(g.title) + '</h2><div class="gal-grid">' + items.join('') + '</div></section>';
    }).join('');
    document.getElementById('sh-gallery').innerHTML = html;
  });
})();
