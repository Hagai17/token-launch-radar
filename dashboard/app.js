'use strict';
/* Token Launch Radar — renders window.RADAR (written by main.ts beside this page). No network. */
const R = window.RADAR;
const rows = R.rows;
const live = R.live;
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const app = document.getElementById('app');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmtUsd(n) {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n;
}
const fmtFull = (n) => (n === null || n === undefined ? '—' : '$' + n.toLocaleString('en-US'));
const fmtPct = (n) => (n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + (Math.round(n * 100) / 100) + '%');
const fmtAge = (d) => (d === null || d === undefined ? '—' : d.toLocaleString('en-US') + ' d');
const fmtMult = (n) => 'x' + (Math.round(n * 10000) / 10000);
const pctClass = (n) => (n === null || n === undefined || n === 0 ? 'mut' : n > 0 ? 'pos' : 'neg');
const chainsShort = (chains) =>
  chains.length <= 2 ? esc(chains.join(', ')) : esc(chains.slice(0, 2).join(', ')) + ' +' + (chains.length - 2);
const badge = (r) =>
  r.watchlist ? '<span class="badge w">WATCHLIST</span>' : '<span class="badge e">EARLY</span>';

function header(active) {
  return (
    '<div class="top"><div class="brand"><h1>Token Launch Radar</h1>' +
    '<span class="chip model">model ' + esc(R.model_version) + '</span></div>' +
    '<nav class="nav"><a href="#/board"' + (active === 'board' ? ' class="on"' : '') + '>Board</a>' +
    '<a href="#/live"' + (active === 'live' ? ' class="on"' : '') + '>Live tokens</a></nav></div>' +
    '<p class="sub">Snapshot of ' + esc(R.as_of) + ' · ' + esc(R.source) + ' · watchlist floor ' + fmtUsd(R.floor_usd) + '</p>'
  );
}
const foot =
  '<p class="foot">Every figure on this page is derived from the one sealed snapshot named above. ' +
  'Implied values are a model\u2019s ranking device, not a price quote and not financial advice.</p>';

/* ---------------- board ---------------- */
const state = { q: '', chain: '', cat: '', watchOnly: false, key: 'rank', dir: 1 };
const COLUMNS = [
  { key: 'rank', label: '#', numeric: true },
  { key: 'name', label: 'Protocol', numeric: false },
  { key: 'category', label: 'Category', numeric: false, nosort: true },
  { key: 'chains', label: 'Chains', numeric: false, nosort: true },
  { key: 'tvl', label: 'TVL', numeric: true },
  { key: 'change', label: '7d %', numeric: true },
  { key: 'age', label: 'Age', numeric: true },
  { key: 'implied', label: 'Implied', numeric: true },
  { key: 'pool', label: 'Est. pool', numeric: true },
  { key: 'efficiency', label: 'Pool/$1', numeric: true },
];
const sortVal = (r, key) =>
  key === 'rank' ? r.rank
  : key === 'name' ? r.name.toLowerCase()
  : key === 'tvl' ? r.tvl_usd
  : key === 'change' ? (r.change_7d ?? -Infinity)
  : key === 'age' ? (r.age_days ?? -1)
  : key === 'implied' ? r.implied_value_usd
  : key === 'pool' ? r.airdrop_pool_usd
  : r.pool_per_cost_usd;

function filtered() {
  const q = state.q.trim().toLowerCase();
  let out = rows.filter(
    (r) =>
      (!state.watchOnly || r.watchlist) &&
      (state.chain === '' || r.chains.includes(state.chain)) &&
      (state.cat === '' || (r.category ?? '') === state.cat) &&
      (q === '' || r.name.toLowerCase().includes(q) || r.slug.includes(q)),
  );
  out.sort((a, b) => {
    const va = sortVal(a, state.key), vb = sortVal(b, state.key);
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return cmp * state.dir || a.rank - b.rank;
  });
  return out;
}

function boardView() {
  const combined = rows.reduce((s, r) => s + r.implied_value_usd, 0);
  const combinedPool = rows.reduce((s, r) => s + r.airdrop_pool_usd, 0);
  const covered = rows.filter((r) => r.watchlist).length;
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  const cats = [...new Set(rows.map((r) => r.category ?? ''))].sort();
  const m = R.model;
  let h = header('board');
  h +=
    '<div class="tiles">' +
    '<div class="tile"><span>Pre-token ranked</span><b>' + R.board_size + '</b><small>every rankable protocol in the snapshot</small></div>' +
    '<div class="tile"><span>Watchlist covered</span><b>' + covered + '/' + R.watchlist_size + '</b><small>at or above the ' + fmtUsd(R.floor_usd) + ' floor</small></div>' +
    '<div class="tile"><span>Early finds</span><b>' + R.early_size + '</b><small>pre-token, below the floor or off the list</small></div>' +
    '<div class="tile"><span>Combined implied value</span><b>' + fmtUsd(combined) + '</b><small>est. airdrop pools ' + fmtUsd(combinedPool) + ' in total</small></div></div>';
  h +=
    '<section class="card"><h3>How the radar prices a protocol with no token</h3><p>' + esc(m.summary) + '</p>' +
    '<dl class="kv">' +
    '<dt>Candidates</dt><dd>Candidates follow the watchlist\u2019s own rule at every size: a ranked protocol records no token, and it is not a wrapped, staked or bridged product of a token that already trades.</dd>' +
    '<dt>Peer multiple</dt><dd>' + esc(m.peer_multiple) + ' This snapshot: global median <b class="num">' + fmtMult(m.global_peer_multiple) + '</b>.</dd>' +
    '<dt>Momentum</dt><dd>' + esc(m.momentum) + '</dd>' +
    '<dt>Maturity</dt><dd>' + esc(m.maturity) + '</dd>' +
    '<dt>Breadth</dt><dd>' + esc(m.breadth) + '</dd>' +
    '<dt>Airdrop pool</dt><dd>The family share of implied value: lending, CDP and Dexs ' + m.alloc_share['lending, CDP and Dexs'] * 100 +
    '%, bridges ' + m.alloc_share['bridges'] * 100 + '%, staking and restaking ' + m.alloc_share['staking and restaking'] * 100 +
    '%, most others ' + m.alloc_share['everything else'] * 100 + '%. The board\u2019s last column divides that pool by the farm plan\u2019s gas cost: pool per $1 of cost, the cheapest attention first.</dd></dl></section>';
  h +=
    '<div class="controls"><label>Search <input type="search" id="q" placeholder="name or slug" value="' + esc(state.q) + '"></label>' +
    '<label>Chain <select id="chain"><option value="">All chains</option>' +
    chains.map((c) => '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
    '</select></label>' +
    '<label>Category <select id="cat"><option value="">All categories</option>' +
    cats.map((c) => '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c === '' ? 'Uncategorised' : c) + '</option>').join('') +
    '</select></label>' +
    '<label><input type="checkbox" id="watch"' + (state.watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
    '<span class="count" id="count"></span></div>';
  h += '<div class="tblwrap"><table><thead><tr>' +
    COLUMNS.map(
      (c) =>
        '<th class="' + (c.numeric ? 'n ' : '') + (c.nosort ? '' : 'sortable') + '" data-key="' + c.key + '">' +
        c.label + (state.key === c.key ? ' <span class="arr">' + (state.dir === 1 ? '▲' : '▼') + '</span>' : '') + '</th>',
    ).join('') +
    '</tr></thead><tbody id="tbody"></tbody></table></div>' + foot;
  app.innerHTML = h;
  app.setAttribute('aria-busy', 'false');
  const paint = () => {
    const list = filtered();
    document.getElementById('count').textContent = 'Showing ' + list.length + ' of ' + rows.length;
    document.getElementById('tbody').innerHTML = list
      .map(
        (r) =>
          '<tr data-slug="' + esc(r.slug) + '"><td class="n">' + r.rank + '</td>' +
          '<td class="name">' + esc(r.name) + badge(r) + '</td>' +
          '<td>' + esc(r.category ?? '—') + '</td>' +
          '<td>' + chainsShort(r.chains) + '</td>' +
          '<td class="n">' + fmtUsd(r.tvl_usd) + '</td>' +
          '<td class="n ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
          '<td class="n">' + fmtAge(r.age_days) + '</td>' +
          '<td class="n">' + fmtUsd(r.implied_value_usd) + '</td>' +
          '<td class="n">' + fmtUsd(r.airdrop_pool_usd) + '</td>' +
          '<td class="n">' + fmtUsd(r.pool_per_cost_usd) + '</td></tr>',
      )
      .join('');
    for (const tr of document.querySelectorAll('#tbody tr')) {
      tr.addEventListener('click', () => { location.hash = '#/protocol/' + tr.dataset.slug; });
    }
  };
  document.getElementById('q').addEventListener('input', (e) => { state.q = e.target.value; paint(); });
  document.getElementById('chain').addEventListener('change', (e) => { state.chain = e.target.value; paint(); });
  document.getElementById('cat').addEventListener('change', (e) => { state.cat = e.target.value; paint(); });
  document.getElementById('watch').addEventListener('change', (e) => { state.watchOnly = e.target.checked; paint(); });
  for (const th of document.querySelectorAll('th.sortable')) {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (state.key === key) state.dir *= -1;
      else { state.key = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
      boardView();
    });
  }
  paint();
}

/* ---------------- detail ---------------- */
function whyRank(r) {
  const g = R.model.global_peer_multiple;
  const rel = r.peer_multiple > g * 1.05 ? 'above' : r.peer_multiple < g * 0.95 ? 'below' : 'in line with';
  const parts = ['Ranked #' + r.rank + ' of ' + R.board_size + '.'];
  parts.push(
    'Its ' + (r.category ?? 'uncategorised') + ' peer multiple is ' + fmtMult(r.peer_multiple) + ' from ' + r.peer_count +
    ' token-bearing peer' + (r.peer_count === 1 ? '' : 's') + ', ' + rel + ' the field median of ' + fmtMult(g) + '.',
  );
  if (r.change_7d !== null) {
    parts.push('TVL ' + (r.change_7d >= 0 ? 'grew ' : 'fell ') + fmtPct(r.change_7d) + ' in the last 7 days, so momentum counts ' + fmtMult(r.momentum_mult) + '.');
  } else {
    parts.push('The snapshot reports no 7-day change, so momentum counts a neutral ' + fmtMult(r.momentum_mult) + '.');
  }
  parts.push(
    r.age_days === null
      ? 'No listing date is recorded, so maturity uses the model\u2019s 365-day default.'
      : 'It has been tracked for ' + r.age_days.toLocaleString('en-US') + ' days (listed ' + r.listed_at + '), earning a maturity factor of ' + fmtMult(r.maturity_mult) + '.',
  );
  parts.push('It counts TVL on ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '.');
  return parts.join(' ');
}

function detailView(slug) {
  const r = bySlug.get(slug);
  if (!r) { location.hash = '#/board'; return; }
  let h = header('board');
  h += '<a class="back" href="#/board">&larr; Back to the board</a>';
  h += '<h2>' + esc(r.name) + badge(r) + '<span class="badge c">PRE-TOKEN</span></h2>';
  h += '<p class="sub">' + esc(r.category ?? 'Uncategorised') + ' · ' + esc(r.chains.join(', ')) + '</p>';
  h +=
    '<div class="tiles">' +
    '<div class="tile"><span>TVL</span><b>' + fmtUsd(r.tvl_usd) + '</b><small>' + fmtFull(r.tvl_usd) + '</small></div>' +
    '<div class="tile"><span>7d change</span><b class="' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</b><small>of TVL</small></div>' +
    '<div class="tile"><span>Listed</span><b>' + esc(r.listed_at ?? '—') + '</b><small>age ' + fmtAge(r.age_days) + '</small></div>' +
    '<div class="tile"><span>Implied value</span><b>' + fmtUsd(r.implied_value_usd) + '</b><small>rank #' + r.rank + ' of ' + R.board_size + '</small></div></div>';
  h +=
    '<div class="grid2"><section class="card"><h3>Implied value, step by step</h3><div class="breakdown">' +
    '<div class="row"><span>Base: TVL ' + fmtUsd(r.tvl_usd) + ' x peer multiple ' + fmtMult(r.peer_multiple) + '</span><b>' + fmtUsd(r.base_usd) + '</b></div>' +
    '<div class="row"><span class="why">the multiple the market pays for ' + esc(r.category ?? 'uncategorised') + ' TVL, from ' + r.peer_count + ' token peers</span><span></span></div>' +
    '<div class="row"><span>x momentum (7d change ' + fmtPct(r.change_7d) + ')</span><b>' + fmtMult(r.momentum_mult) + '</b></div>' +
    '<div class="row"><span>x maturity (age ' + fmtAge(r.age_days) + ')</span><b>' + fmtMult(r.maturity_mult) + '</b></div>' +
    '<div class="row"><span>x breadth (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</span><b>' + fmtMult(r.breadth_mult) + '</b></div>' +
    '<div class="row total"><span>Implied value</span><b>' + fmtFull(r.implied_value_usd) + '</b></div></div>' +
    '<p style="margin-top:12px">' + esc(whyRank(r)) + '</p></section>';
  h +=
    '<section class="card"><h3>The farm, in numbers</h3><div class="breakdown">' +
    '<div class="row"><span>Estimated airdrop pool</span><b>' + fmtFull(r.airdrop_pool_usd) + '</b></div>' +
    '<div class="row"><span>Estimated plan cost (gas and fees)</span><b>' + fmtFull(r.plan_cost_usd) + '</b></div>' +
    '<div class="row"><span>Pool per $1 of plan cost</span><b>' + fmtFull(r.pool_per_cost_usd) + '</b></div></div>' +
    '<p class="why" style="margin-top:12px">The pool is the share of implied value a launch of this kind typically reserves for early users. ' +
    'It is an estimate for ranking farms against each other, not a promise by the protocol.</p></section></div>';
  h +=
    '<section class="card"><h3>Farm plan</h3><ol class="steps">' +
    r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') +
    '</ol></section>' + foot;
  app.innerHTML = h;
  app.setAttribute('aria-busy', 'false');
}

/* ---------------- live ---------------- */
function liveView() {
  let h = header('live');
  h +=
    '<section class="card"><h3>Already tokenised — set aside, never ranked</h3>' +
    '<p>These protocols already record a token in the snapshot, so the radar does not score them: there is no launch left to catch early. ' +
    'They are shown at the market\u2019s own market cap, never at a model value. Their multiples are the evidence the board\u2019s peer multiples are built from.</p></section>';
  h +=
    '<div class="tblwrap"><table><thead><tr><th>Protocol</th><th>Category</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">7d %</th></tr></thead><tbody>' +
    live
      .map(
        (p) =>
          '<tr><td class="name">' + esc(p.name) + '</td><td>' + esc(p.category ?? '—') + '</td>' +
          '<td class="n">' + fmtUsd(p.tvl_usd) + '</td><td class="n">' + fmtUsd(p.mcap_usd) + '</td>' +
          '<td class="n ' + pctClass(p.change_7d) + '">' + fmtPct(p.change_7d) + '</td></tr>',
      )
      .join('') +
    '</tbody></table></div>' + foot;
  app.innerHTML = h;
  app.setAttribute('aria-busy', 'false');
}

/* ---------------- router ---------------- */
function route() {
  const hash = location.hash || '#/board';
  if (hash.startsWith('#/protocol/')) detailView(decodeURIComponent(hash.slice('#/protocol/'.length)));
  else if (hash.startsWith('#/live')) liveView();
  else boardView();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
