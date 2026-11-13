/* «See the screens» (gallery.html): every state of every app screen as a small live phone, in three sections by who
   sees it — Before signing in, Parent, Kid (a state's «for», else the role of the person it is seen through) — and
   inside each, grouped by flow in the flow docs' order (WB.index.flowTitles), then the catalog's. Each thumbnail is a still of the real screen (sim.js
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
    var role = function (id) { var p = people.find(function (x) { return x.id === id; }); return p && p.role === 'kid' ? 'kid' : 'adult'; };
    var SECTIONS = [{ key: 'anyone', title: 'Before signing in' }, { key: 'adult', title: 'Parent' }, { key: 'kid', title: 'Kid' }];
    var sections = {};   // section → flow title → { order, items }
    Object.keys(screens).map(function (id) { return screens[id]; })
      .filter(function (d) { return !/^dev\./.test(d.id) && !d.hidden; })
      .sort(function (a, b) { return a.n - b.n; })
      .forEach(function (d) {
        var g = titles[d.flow] || { title: 'Other', order: 100 };
        d.states.forEach(function (st) {
          var as = viewer(st), sec = (sections[st.for || role(as)] = sections[st.for || role(as)] || {});
          var params = Object.assign({}, st.params || {}, st.drive ? { estado: st.id } : {});
          var still = WB.href(d.id, Object.assign({}, params, { still: 1, as: as }));
          var q = new URLSearchParams(params).toString(), open = 'app.html#' + d.id + (q ? '?' + q : '');
          (sec[g.title] = sec[g.title] || { title: g.title, order: g.order, items: [] }).items.push(
            '<a class="gal-item" href="' + esc(open) + '" data-testid="gal-item" data-screen="' + esc(d.id) + '" data-state="' + esc(st.id) + '">'
            + '<span class="gal-phone"><iframe src="' + esc(still) + '" loading="lazy" tabindex="-1" aria-hidden="true" title=""></iframe></span>'
            + '<b>' + esc(d.title) + '</b><small>' + esc(st.title || st.id) + '</small></a>');
        });
      });
    var html = SECTIONS.filter(function (s) { return sections[s.key]; }).map(function (s) {
      var groups = Object.keys(sections[s.key]).map(function (k) { return sections[s.key][k]; }).sort(function (a, b) { return a.order - b.order; });
      return '<section class="gal-section" data-testid="gal-section" data-for="' + s.key + '"><h2>' + esc(s.title) + '</h2>'
        + groups.map(function (g) {
          return '<div class="gal-group" data-testid="gal-group"><h3>' + esc(g.title) + '</h3><div class="gal-grid">' + g.items.join('') + '</div></div>';
        }).join('') + '</section>';
    }).join('');
    document.getElementById('sh-gallery').innerHTML = html;
  });
})();
