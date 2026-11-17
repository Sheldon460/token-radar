// radar-2's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts, from the same board as board.json) and renders five views: the
// ranked board, a per-protocol detail, a filter, the comparable evidence and
// a model sandbox. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var root = document.getElementById('app');
  var state = { view: 'board', q: '', category: 'all', floor: 0, sort: 'implied', dir: -1, slug: null, sandboxScale: 1, sandboxGrowth: 0.5 };

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function age(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.round(days) + 'd';
  }
  function mult(n) { return n.toFixed(2) + 'x'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function rowBySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }
  function catStat(category) {
    for (var i = 0; i < DATA.categories.length; i++) if (DATA.categories[i].category === category) return DATA.categories[i];
    return null;
  }
  function isWatchlist(r) { return !!r.watchlist; }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    var parts = {};
    hash.split('&').forEach(function (kv) {
      var eq = kv.indexOf('=');
      if (eq > 0) parts[decodeURIComponent(kv.slice(0, eq))] = decodeURIComponent(kv.slice(eq + 1));
    });
    state.slug = parts.p || null;
    state.category = parts.category || 'all';
    if (state.slug) state.view = 'detail';
    else if (parts.view) state.view = parts.view;
    else if (parts.category) state.view = 'filter';
    else state.view = 'board';
  }

  function go(view, extra) {
    var h = '#view=' + view;
    if (extra) h += '&' + extra;
    if (window.location.hash === h) render();
    else window.location.hash = h;
  }

  // ------------------------------------------------------------ shared bits

  function header() {
    return el('header', { class: 'mast' },
      el('div', { class: 'mast-title' },
        el('span', { class: 'dot' }),
        el('h1', { text: 'TOKEN RADAR' }),
        el('span', { class: 'tag' }, 'radar-2 · implied launch value')),
      el('p', { class: 'mast-sub' }, 'Pre-token protocols, ranked by what a launch would be worth — priced from the snapshot itself, not from a list of names. Snapshot as of ' + DATA.as_of + ' · DefiLlama · ' + DATA.watchlist_size + ' watchlist protocols · ' + DATA.board_size + ' rows.'));
  }

  function nav() {
    var views = [['board', 'Board'], ['filter', 'Filter'], ['comps', 'Comparables'], ['sandbox', 'Model sandbox']];
    return el('nav', { class: 'tabs' }, views.map(function (v) {
      return el('button', {
        type: 'button', class: 'tab' + (state.view === v[0] || (state.view === 'detail' && v[0] === 'board') ? ' on' : ''),
        onclick: function () { go(v[0]); },
      }, v[1]);
    }));
  }

  function statCards() {
    var top = DATA.rows[0];
    var cards = [
      ['Watchlist', String(DATA.watchlist_size), 'protocols at or above the $50M floor, no token'],
      ['Board rows', String(DATA.board_size), DATA.early_size + ' early rows below the floor'],
      ['Top implied value', top ? usd(top.implied_value_usd) : 'n/a', top ? top.name + ' · rank 1' : ''],
      ['Global median mcap/TVL', mult(DATA.global_median), 'fallback when a category has under 3 live comps'],
    ];
    return el('section', { class: 'stats' }, cards.map(function (c) {
      return el('div', { class: 'stat' }, el('div', { class: 'stat-v' }, c[1]), el('div', { class: 'stat-k' }, c[0]), el('div', { class: 'stat-s' }, c[2]));
    }));
  }

  function modelLine() {
    return el('p', { class: 'model' },
      'Model radar-2: implied = TVL × category multiple × growth × maturity. ',
      'Category multiple = median mcap/TVL of live-token protocols in the same category (winsorized 0.05–1.50; ',
      'global median ' + mult(DATA.global_median) + ' when fewer than 3 comparables). ',
      'Growth = 1 + clamp(7d change, −60, +120)% × 0.5. ',
      'Maturity = 0.6 + min(age, 1095d) ÷ 1095 × 0.4 (unknown age: 365d). ',
      'Live-token protocols are shown at the market’s own value, never ranked.');
  }

  // ------------------------------------------------------------ board table

  function sortKey(r, key) {
    if (key === 'implied') return r.implied_value_usd;
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'growth') return r.change_7d === null ? -9999 : r.change_7d;
    if (key === 'age') return r.age_days === null ? -1 : r.age_days;
    if (key === 'name') return r.name.toLowerCase();
    return r.rank;
  }

  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var x = sortKey(a, key), y = sortKey(b, key);
      var c = (x < y ? -1 : x > y ? 1 : 0) * state.dir;
      if (c !== 0) return c;
      return a.rank - b.rank;
    });
  }

  function sortHead(key, label) {
    return el('th', {},
      el('button', {
        type: 'button', class: 'srt',
        onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); },
      }, label, state.sort === key ? el('span', { text: state.dir < 0 ? ' ▼' : ' ▲' }) : null));
  }

  function boardTable(list) {
    var rows = sortedRows(list).map(function (r) {
      var g = r.change_7d === null ? 'n/a' : pct(r.change_7d);
      var gcls = r.change_7d === null ? '' : (r.change_7d >= 0 ? ' up' : ' down');
      return el('tr', { class: r.rank <= 10 ? 'top10' : '' },
        el('td', { class: 'num' }, String(r.rank)),
        el('td', {}, el('a', { href: '#p=' + encodeURIComponent(r.slug), class: 'name' }, r.name), isWatchlist(r) ? el('span', { class: 'wl' }, ' W') : null),
        el('td', {}, r.category || '—'),
        el('td', { class: 'chains' }, (r.chains || []).slice(0, 3).join(', ') || '—'),
        el('td', { class: 'num' }, usd(r.tvl_usd)),
        el('td', { class: 'num' + gcls }, g),
        el('td', { class: 'num' }, age(r.age_days)),
        el('td', { class: 'num imp' }, usd(r.implied_value_usd)));
    });
    return el('table', { class: 'board' },
      el('thead', {}, el('tr', {},
        sortHead('rank', '#'), sortHead('name', 'Protocol'), sortHead('category', 'Category'),
        el('th', { text: 'Chains' }), sortHead('tvl', 'TVL'), sortHead('growth', '7d'), sortHead('age', 'Age'), sortHead('implied', 'Implied value'))),
      el('tbody', {}, rows));
  }

  // ------------------------------------------------------------ views

  function boardView() {
    return el('div', {},
      statCards(), modelLine(),
      el('p', { class: 'hint' }, 'Click a protocol for its model breakdown and farm plan. Sort by any column. Top 10 highlighted. “W” marks the watchlist.'),
      boardTable(DATA.rows));
  }

  function stepItem(step) {
    var m = step.match(/^(.*) \(Cost: (.*); time: (.*)\.\)$/);
    if (!m) return el('li', { text: step });
    return el('li', {}, el('span', { text: m[1] }), el('span', { class: 'step-meta' }, 'Cost: ' + m[2] + ' · Time: ' + m[3]));
  }

  function detailView() {
    var r = rowBySlug(state.slug);
    if (!r) return el('p', { class: 'empty' }, 'No protocol with that slug on this board.');
    var stat = catStat(r.category || '(uncategorised)');
    var growthPct = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, r.change_7d === null ? 0 : r.change_7d));
    var eq = [
      ['TVL', usdFull(r.tvl_usd)],
      ['× category multiple', mult(r.category_multiple) + (r.comparable_fallback ? ' (global fallback)' : ' (' + r.comparable_count + ' live comps)')],
      ['× growth', mult(r.growth_multiplier) + '  (7d ' + pct(growthPct) + ')'],
      ['× maturity', mult(r.maturity_multiplier) + '  (age ' + age(r.age_days) + ')'],
      ['= implied value', usdFull(r.implied_value_usd)],
    ];
    return el('div', {},
      el('p', {}, el('a', { href: '#view=board', class: 'back' }, '← Back to the board')),
      el('h2', { class: 'd-name' }, 'Rank ' + r.rank + ' · ' + r.name),
      el('p', { class: 'd-sub' }, (r.category || 'Uncategorised') + ' · ' + ((r.chains || []).join(', ') || 'no chain listed') + ' · TVL ' + usd(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · age ' + age(r.age_days) + (isWatchlist(r) ? ' · watchlist' : ' · early row')),
      el('h3', { text: 'Model breakdown — radar-2' }),
      el('div', { class: 'eq' }, eq.map(function (e) {
        return el('div', { class: 'eq-row' }, el('span', { class: 'eq-k' }, e[0]), el('span', { class: 'eq-v' }, e[1]));
      })),
      el('h3', { text: 'Category comparables — the evidence behind the multiple' }),
      stat ? el('p', { class: 'comp-line' },
        'Live-token ' + esc(r.category || '') + ' protocols: n=' + stat.comparable_count +
        ' · p25 ' + mult(stat.p25) + ' · median ' + mult(stat.median) + ' · p75 ' + mult(stat.p75) +
        ' · multiple used ' + mult(stat.multiple) + (stat.fallback ? ' · fallback: fewer than 3 comparables, global median ' + mult(DATA.global_median) + ' applied' : '') + '.')
        : el('p', { class: 'comp-line' }, 'No live comparables in this category: global median ' + mult(DATA.global_median) + ' applied.'),
      el('h3', { text: 'Farm plan — six steps, derived from this protocol’s own record' }),
      el('ol', { class: 'farm' }, (r.farm_steps || []).map(stepItem)),
      el('p', { class: 'risk' }, 'Points are never guaranteed. Never pay to claim, and never connect a wallet that holds funds you cannot afford to lose.'));
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || '(uncategorised)') !== state.category) return false;
      if (state.floor > 0 && r.tvl_usd < state.floor) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
  }

  function filterView() {
    var counts = {};
    DATA.rows.forEach(function (r) { var c = r.category || '(uncategorised)'; counts[c] = (counts[c] || 0) + 1; });
    var cats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var list = filteredRows();
    var chips = [el('button', {
      type: 'button', class: 'chip' + (state.category === 'all' ? ' on' : ''),
      onclick: function () { state.category = 'all'; render(); },
    }, 'All (' + DATA.rows.length + ')')].concat(cats.map(function (c) {
      return el('button', {
        type: 'button', class: 'chip' + (state.category === c ? ' on' : ''),
        onclick: function () { state.category = c; render(); },
      }, c + ' (' + counts[c] + ')');
    }));
    var floors = [[0, 'Any TVL'], [50e6, '$50M+'], [100e6, '$100M+'], [500e6, '$500M+'], [1e9, '$1B+']];
    return el('div', {},
      el('h2', { text: 'Filter by category, name or TVL' }),
      el('div', { class: 'chips' }, chips),
      el('div', { class: 'controls' },
        el('input', {
          type: 'search', placeholder: 'Search name or slug…', value: state.q,
          oninput: function (e) { state.q = e.target.value; render(); },
        }),
        el('select', { onchange: function (e) { state.floor = Number(e.target.value); render(); } },
          floors.map(function (f) { return el('option', { value: String(f[0]), selected: state.floor === f[0] ? 'selected' : null }, f[1]); }))),
      el('p', { class: 'hint' }, 'Filter state: category ' + (state.category === 'all' ? 'all' : state.category) + ' · TVL ' + (state.floor === 0 ? 'any' : '≥ ' + usd(state.floor)) + (state.q ? ' · search “' + state.q + '”' : '') + ' · ' + list.length + ' of ' + DATA.rows.length + ' rows.'),
      list.length ? boardTable(list) : el('p', { class: 'empty' }, 'Nothing matches this filter.'));
  }

  function compsView() {
    var catRows = DATA.categories.map(function (s) {
      return el('tr', {},
        el('td', {}, s.category),
        el('td', { class: 'num' }, String(s.comparable_count)),
        el('td', { class: 'num' }, mult(s.p25)),
        el('td', { class: 'num' }, mult(s.median)),
        el('td', { class: 'num' }, mult(s.p75)),
        el('td', { class: 'num imp' }, mult(s.multiple)),
        el('td', {}, s.fallback ? 'global fallback' : 'own median'));
    });
    var liveRows = DATA.live.map(function (p) {
      return el('tr', {},
        el('td', {}, p.name),
        el('td', {}, p.category || '—'),
        el('td', { class: 'num' }, usd(p.tvl_usd)),
        el('td', { class: 'num' }, usd(p.mcap_usd)),
        el('td', { class: 'num imp' }, mult(p.mcap_tvl_ratio)));
    });
    return el('div', {},
      el('h2', { text: 'Comparables — the model’s evidence' }),
      el('p', { class: 'hint' }, 'Each category’s multiple is the median mcap/TVL of its live-token protocols (winsorized 0.05–1.50). Under 3 comparables, the global median ' + mult(DATA.global_median) + ' is used instead. CEX tokens are excluded: an exchange’s token prices a business, not a protocol.'),
      el('table', { class: 'board' },
        el('thead', {}, el('tr', {}, ['Category', 'Live comps', 'p25', 'Median', 'p75', 'Multiple used', 'Source'].map(function (h) { return el('th', { text: h }); }))),
        el('tbody', {}, catRows)),
      el('h3', { text: 'Live-token protocols — the market’s own values (top ' + DATA.live.length + ' by market cap)' }),
      el('table', { class: 'board' },
        el('thead', {}, el('tr', {}, ['Protocol', 'Category', 'TVL', 'Market cap', 'mcap/TVL'].map(function (h) { return el('th', { text: h }); }))),
        el('tbody', {}, liveRows)),
      el('p', { class: 'hint' }, 'These protocols already trade. They price the comparables; they are never ranked on this board.'));
  }

  function sandboxImplied(r, scale, growthWeight) {
    var g = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, r.change_7d === null ? 0 : r.change_7d));
    var gm = 1 + (g / 100) * growthWeight;
    return Math.max(1, Math.round(r.tvl_usd * r.category_multiple * scale * gm * r.maturity_multiplier));
  }

  function sandboxView() {
    var ranked = DATA.rows.map(function (r) { return { r: r, v: sandboxImplied(r, state.sandboxScale, state.sandboxGrowth) }; })
      .sort(function (a, b) { return b.v - a.v || a.r.rank - b.r.rank; }).slice(0, 10);
    var rows = ranked.map(function (x, i) {
      var moved = x.r.rank - (i + 1);
      return el('tr', {},
        el('td', { class: 'num' }, String(i + 1)),
        el('td', {}, x.r.name),
        el('td', { class: 'num' }, usd(x.v)),
        el('td', { class: 'num' }, 'board #' + x.r.rank + (moved > 0 ? ' ↑' + moved : moved < 0 ? ' ↓' + (-moved) : ' —')));
    });
    return el('div', {},
      el('h2', { text: 'Model sandbox — explore, don’t submit' }),
      el('p', { class: 'hint' }, 'Change the constants and watch the top 10 re-rank live. This is exploration only: it never changes board.json or the submitted ranking.'),
      el('div', { class: 'sandbox' },
        el('label', {}, 'Category-multiple scale ',
          el('input', {
            type: 'range', min: '0.5', max: '2', step: '0.05', value: String(state.sandboxScale),
            oninput: function (e) { state.sandboxScale = Number(e.target.value); render(); },
          }),
          el('span', { class: 'sb-v' }, state.sandboxScale.toFixed(2) + 'x')),
        el('label', {}, 'Growth weight ',
          el('input', {
            type: 'range', min: '0', max: '1', step: '0.05', value: String(state.sandboxGrowth),
            oninput: function (e) { state.sandboxGrowth = Number(e.target.value); render(); },
          }),
          el('span', { class: 'sb-v' }, state.sandboxGrowth.toFixed(2)))),
      el('table', { class: 'board' },
        el('thead', {}, el('tr', {}, ['Sandbox rank', 'Protocol', 'Sandbox implied', 'Board rank'].map(function (h) { return el('th', { text: h }); }))),
        el('tbody', {}, rows)),
      el('p', { class: 'hint' }, 'Submitted model: scale 1.00x, growth weight ' + DATA.model.growth_weight + '.'));
  }

  // ------------------------------------------------------------ render

  function render() {
    root.setAttribute('aria-busy', 'false');
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(header());
    root.appendChild(nav());
    var view;
    if (state.view === 'detail') view = detailView();
    else if (state.view === 'filter') view = filterView();
    else if (state.view === 'comps') view = compsView();
    else if (state.view === 'sandbox') view = sandboxView();
    else view = boardView();
    root.appendChild(view);
    root.appendChild(el('footer', { class: 'foot' },
      'Token Radar · model radar-2 · snapshot ' + DATA.as_of + ' from DefiLlama (' + DATA.source + '). ',
      'Implied values are this entry’s own claim from the snapshot’s figures; they predict nothing about whether or when a token launches. ',
      'Farm plans are steps to consider, not advice; points are never guaranteed.'));
  }

  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  render();
})();
