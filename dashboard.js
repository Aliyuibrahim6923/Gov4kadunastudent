/* Kaduna Student Voice: Directorate dashboard.
 * Tabs: Overview, Map, Responses (data table), Comments. Filters apply to every tab.
 * No external libraries: charts and the LGA map are drawn as HTML/SVG. */
(function () {
  'use strict';
  var C = window.KSV;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var KEY_STORE = 'ksv-admin-key';
  var TABS = ['overview', 'map', 'responses', 'comments'];

  var S = {
    all: [], rows: [], tab: 'overview', loadedAt: null, timer: null,
    table: { q: '', sort: 'created_at', dir: -1, page: 1, size: 25, view: [] },
    comments: { q: '', type: '', shown: 30 },
    map: { metric: 'count', sector: 'edu' },
    geo: null, wards: null, drawerIdx: -1
  };

  /* ---------- Utilities ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tc(s) { return String(s == null ? '' : s).toLowerCase().replace(/(^|[\s\/(.-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  function label(list, v) { for (var i = 0; i < list.length; i++) { var o = list[i]; if ((o.v || o) === v) return o.l || o; } return v; }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function pct(n, d) { return d ? Math.round(n / d * 100) + '%' : '–'; }
  function num(n) { return Number(n || 0).toLocaleString(); }
  function f2(x) { return x == null ? '–' : x.toFixed(2); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(t, withTime) {
    var d = new Date(t);
    var s = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return withTime ? s + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : s;
  }
  function uniq(rows, k) { var m = {}; rows.forEach(function (r) { if (r[k]) m[r[k]] = 1; }); return Object.keys(m).sort(); }
  function netScore(rows) {
    var rated = rows.filter(function (r) { return r.overall >= 1; });
    if (!rated.length) return null;
    var hi = rated.filter(function (r) { return r.overall >= 4; }).length, lo = rated.filter(function (r) { return r.overall <= 2; }).length;
    return Math.round((hi - lo) / rated.length * 100);
  }
  function signed(n) { return n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }
  var NOTES = [['commend_note', 'Commend'], ['shortfall_note', 'Fix'], ['strengthen_note', 'Strengthen'], ['message', 'Message'],
    ['nelfund_issue', 'NELFUND'], ['other_sch_issue', 'Scholarship']];
  function hasNote(r) { return NOTES.some(function (k) { return r[k[0]]; }); }

  /* ---------- Colour scales ---------- */
  // Sequential (magnitude): one green hue, light to dark.
  var SEQ = ['#e3f3e8', '#b4dfc1', '#78c28f', '#3a9a58', '#1d6b34'];
  // Diverging (ratings): orange = poor, neutral grey = middle, blue = good. Colour-blind safe.
  var DIV = ['#b8460b', '#ec9a5c', '#d7d7d2', '#6aa8d4', '#1f5f99'];
  function seqColor(v, max) { if (!v) return null; return SEQ[Math.min(4, Math.floor(v / max * 5 - 1e-9))]; }
  function rateColor(v) { if (v == null) return null; return DIV[Math.max(0, Math.min(4, Math.round(v) - 1))]; }
  function netColor(v) { if (v == null) return null; return DIV[v <= -40 ? 0 : v < -10 ? 1 : v <= 10 ? 2 : v < 40 ? 3 : 4]; }
  function inkOn(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14201a' : '#ffffff';
  }

  /* ---------- Tooltip ---------- */
  var tip = $('#tip');
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('show'); return; }
    tip.innerHTML = t.getAttribute('data-tip');
    tip.classList.add('show');
  });
  document.addEventListener('mousemove', function (e) {
    if (!tip.classList.contains('show')) return;
    var x = e.clientX + 14, y = e.clientY + 14, w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  document.addEventListener('scroll', function () { tip.classList.remove('show'); }, true);

  /* ---------- Theme ---------- */
  $('#themeBtn').addEventListener('click', function () {
    var root = document.documentElement;
    var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ksv-theme', next); } catch (e) {}
  });

  /* ---------- Auth + loading ---------- */
  function getKey() { try { return sessionStorage.getItem(KEY_STORE) || window.__k || ''; } catch (e) { return window.__k || ''; } }
  function setKey(k) { window.__k = k; try { sessionStorage.setItem(KEY_STORE, k); } catch (e) {} }
  function clearKey() { window.__k = ''; try { sessionStorage.removeItem(KEY_STORE); } catch (e) {} }

  function load(key) {
    return fetch('api/responses', { headers: { 'x-admin-key': key }, cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) throw new Error('That admin key is not correct. Check it matches ADMIN_KEY in Vercel exactly (capital letters matter).');
        if (!r.ok || !j.ok) throw new Error(j.error || 'Could not load responses.');
        return j.rows;
      });
    });
  }
  function ingest(rows) {
    rows.forEach(function (r) { r._t = Date.parse(r.created_at) || 0; });
    rows.sort(function (a, b) { return b._t - a._t; });
    S.all = rows;
    S.loadedAt = new Date();
  }
  function open(rows) {
    ingest(rows);
    $('#loginWrap').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#logoutBtn').classList.remove('hidden');
    buildFilters();
    showTab(tabFromHash(), true);
  }
  function refresh(quiet) {
    var b = $('#refreshBtn');
    if (!quiet) { b.disabled = true; b.textContent = 'Loading…'; }
    return load(getKey()).then(function (rows) { ingest(rows); buildFilters(); render(); })
      .catch(function (x) { toast(x.message); })
      .then(function () { b.disabled = false; b.textContent = 'Refresh'; });
  }
  $('#login').addEventListener('submit', function (e) {
    e.preventDefault();
    var key = $('#key').value.trim(), btn = $('#loginBtn'), err = $('#loginError');
    if (!key) return;
    btn.disabled = true; btn.textContent = 'Checking…'; err.classList.add('hidden');
    load(key).then(function (rows) { setKey(key); open(rows); })
      .catch(function (x) { err.textContent = x.message; err.classList.remove('hidden'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Open dashboard'; });
  });
  $('#logoutBtn').addEventListener('click', function () { clearKey(); location.hash = ''; location.reload(); });
  $('#refreshBtn').addEventListener('click', function () { refresh(false); });
  $('#autoRefresh').addEventListener('change', function () {
    clearInterval(S.timer);
    if (this.checked) S.timer = setInterval(function () { refresh(true); }, 60000);
  });
  if (getKey()) load(getKey()).then(open).catch(function () { clearKey(); });

  /* ---------- Tabs ---------- */
  function tabFromHash() { var h = location.hash.replace('#', ''); return TABS.indexOf(h) !== -1 ? h : 'overview'; }
  function showTab(t, force) {
    if (t === S.tab && !force) return;
    S.tab = t;
    $$('.dash-tab').forEach(function (a) { a.setAttribute('aria-selected', String(a.getAttribute('data-tab') === t)); });
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + t); });
    render();
  }
  window.addEventListener('hashchange', function () { showTab(tabFromHash()); });

  /* ---------- Filters ---------- */
  var F = { range: $('#fRange'), inst: $('#fInst'), lga: $('#fLga'), ward: $('#fWard'), gender: $('#fGender'), level: $('#fLevel'), from: $('#fFrom'), to: $('#fTo') };
  function options(sel, values, all, fmt) {
    var cur = sel.value;
    sel.innerHTML = '<option value="">' + esc(all) + '</option>' + values.map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(fmt ? fmt(v) : v) + '</option>';
    }).join('');
    if (values.indexOf(cur) !== -1) sel.value = cur;
  }
  function buildFilters() {
    var inst = C.INSTITUTIONS.concat(uniq(S.all, 'institution').filter(function (i) { return C.INSTITUTIONS.indexOf(i) === -1; }));
    options(F.inst, inst, 'All institutions');
    options(F.lga, C.LGAS.concat(S.all.some(function (r) { return r.lga === C.OUTSIDE_LGA; }) ? [C.OUTSIDE_LGA] : []), 'All LGAs', tc);
    options(F.gender, C.GENDER, 'All');
    options(F.level, C.LEVELS, 'All levels');
    buildWardFilter();
  }
  function buildWardFilter() {
    var lga = F.lga.value;
    F.ward.disabled = !lga;
    var wards = lga ? (S.wards && S.wards[lga] ? S.wards[lga] : uniq(S.all.filter(function (r) { return r.lga === lga; }), 'ward')) : [];
    options(F.ward, wards, lga ? 'All wards' : 'Choose an LGA first', tc);
  }
  function dateWindow() {
    var v = F.range.value, now = new Date(), start = null, end = null;
    if (v === 'today') start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    else if (v === '7' || v === '30') start = Date.now() - Number(v) * 864e5;
    else if (v === 'custom') {
      if (F.from.value) start = new Date(F.from.value + 'T00:00:00').getTime();
      if (F.to.value) end = new Date(F.to.value + 'T23:59:59').getTime();
    }
    return { start: start, end: end };
  }
  function filterRows(ignoreGeo) {
    var w = dateWindow(), inst = F.inst.value, lga = F.lga.value, ward = F.ward.value, g = F.gender.value, lv = F.level.value;
    return S.all.filter(function (r) {
      if (w.start && r._t < w.start) return false;
      if (w.end && r._t > w.end) return false;
      if (inst && r.institution !== inst) return false;
      if (!ignoreGeo && lga && r.lga !== lga) return false;
      if (!ignoreGeo && ward && r.ward !== ward) return false;
      if (g && r.gender !== g) return false;
      if (lv && r.level !== lv) return false;
      return true;
    });
  }
  function renderChips() {
    var chips = [];
    var rangeText = { today: 'Today', '7': 'Last 7 days', '30': 'Last 30 days' }[F.range.value];
    if (rangeText) chips.push(['range', rangeText]);
    if (F.range.value === 'custom' && (F.from.value || F.to.value)) chips.push(['range', (F.from.value || '…') + ' to ' + (F.to.value || '…')]);
    if (F.inst.value) chips.push(['inst', F.inst.value]);
    if (F.lga.value) chips.push(['lga', tc(F.lga.value)]);
    if (F.ward.value) chips.push(['ward', 'Ward: ' + tc(F.ward.value)]);
    if (F.gender.value) chips.push(['gender', F.gender.value]);
    if (F.level.value) chips.push(['level', F.level.value]);
    $('#chips').innerHTML = chips.map(function (c) {
      return '<span class="chip">' + esc(c[1]) + '<button type="button" data-clear="' + c[0] + '" aria-label="Remove filter ' + esc(c[1]) + '">×</button></span>';
    }).join('') + (chips.length > 1 ? '<button class="btn btn-ghost btn-sm" type="button" data-clear="all">Clear all</button>' : '');
  }
  function clearFilter(k) {
    if (k === 'all' || k === 'range') { F.range.value = 'all'; F.from.value = ''; F.to.value = ''; $('#customDates').classList.add('hidden'); }
    if (k === 'all' || k === 'inst') F.inst.value = '';
    if (k === 'all' || k === 'lga') { F.lga.value = ''; F.ward.value = ''; buildWardFilter(); }
    if (k === 'all' || k === 'ward') F.ward.value = '';
    if (k === 'all' || k === 'gender') F.gender.value = '';
    if (k === 'all' || k === 'level') F.level.value = '';
    S.table.page = 1; S.comments.shown = 30;
    render();
  }
  $('#chips').addEventListener('click', function (e) { var b = e.target.closest('[data-clear]'); if (b) clearFilter(b.getAttribute('data-clear')); });
  function setLga(lga) {
    F.lga.value = lga || ''; F.ward.value = ''; buildWardFilter();
    S.table.page = 1; render();
  }
  ['range', 'inst', 'gender', 'level', 'ward', 'from', 'to'].forEach(function (k) {
    F[k].addEventListener('change', function () {
      if (k === 'range') $('#customDates').classList.toggle('hidden', F.range.value !== 'custom');
      S.table.page = 1; S.comments.shown = 30; render();
    });
  });
  F.lga.addEventListener('change', function () { setLga(F.lga.value); });

  /* ---------- Bar helpers ---------- */
  function bars(el, items, opts) {
    opts = opts || {};
    if (!items.length) { el.innerHTML = '<div class="empty">No answers yet.</div>'; return; }
    var max = opts.max || Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
    el.innerHTML = '<div class="bars">' + items.map(function (i) {
      var w = Math.max(0, Math.min(100, i.value / max * 100));
      return '<div class="bar' + (i.bad ? ' bad' : '') + '" data-tip="' + esc('<b>' + esc(i.label) + '</b>' + esc(i.tip || i.text)) + '">' +
        '<span class="name">' + esc(i.label) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + w + '%;display:block"></span></span>' +
        '<span class="val">' + esc(i.text) + '</span></div>';
    }).join('') + '</div>';
  }
  function countBy(rows, fn) {
    var m = {};
    rows.forEach(function (r) {
      var v = fn(r); if (v === null || v === undefined || v === '') return;
      (Array.isArray(v) ? v : [v]).forEach(function (x) { m[x] = (m[x] || 0) + 1; });
    });
    return m;
  }
  function countBars(el, rows, fn, list, opts) {
    opts = opts || {};
    var m = countBy(rows, fn), base = opts.base || rows.length;
    var keys = list ? list.map(function (o) { return o.v || o; }) : Object.keys(m).sort(function (a, b) { return m[b] - m[a]; });
    if (opts.sortByCount) keys.sort(function (a, b) { return (m[b] || 0) - (m[a] || 0); });
    if (opts.limit) keys = keys.slice(0, opts.limit);
    var items = keys.filter(function (k) { return list ? true : m[k]; }).map(function (k) {
      var n = m[k] || 0;
      return { label: opts.fmt ? opts.fmt(k) : (list ? label(list, k) : k), value: n, text: num(n) + ' · ' + pct(n, base),
        tip: num(n) + ' of ' + num(base) + ' respondents (' + pct(n, base) + ')' };
    });
    if (list && !items.some(function (i) { return i.value; })) items = [];
    bars(el, items);
  }

  /* ---------- Render dispatcher ---------- */
  function render() {
    if (!S.all) return;
    S.rows = filterRows(false);
    renderChips();
    $('#countResponses').textContent = num(S.rows.length);
    $('#countComments').textContent = num(S.rows.filter(hasNote).length);
    $('#loadedAt').textContent = num(S.rows.length) + ' of ' + num(S.all.length) + ' responses shown · updated ' +
      (S.loadedAt ? S.loadedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
    if (S.tab === 'overview') renderOverview();
    else if (S.tab === 'map') renderMap();
    else if (S.tab === 'responses') renderTable();
    else if (S.tab === 'comments') renderComments();
  }

  /* ---------- Overview ---------- */
  function renderOverview() {
    var rows = S.rows, n = rows.length;
    var overall = avg(rows.map(function (r) { return r.overall; }).filter(Boolean));
    var net = netScore(rows);
    var pvcYes = rows.filter(function (r) { return r.pvc === 'yes'; }).length;
    var pvcPlan = rows.filter(function (r) { return r.pvc === 'plan'; }).length;
    var vols = rows.filter(function (r) { return r.volunteer; }).length;
    var phones = {}, wa = 0; rows.forEach(function (r) { if (r.phone) phones[r.phone] = 1; if (r.whatsapp) wa++; });
    var instN = uniq(rows, 'institution').filter(function (i) { return C.INSTITUTIONS.indexOf(i) !== -1; }).length;
    var lgaN = uniq(rows, 'lga').filter(function (l) { return C.LGAS.indexOf(l) !== -1; }).length;
    var wardSet = {}; rows.forEach(function (r) { if (C.LGAS.indexOf(r.lga) !== -1) wardSet[r.lga + '|' + r.ward] = 1; });
    var wardTotal = S.wards ? Object.keys(S.wards).reduce(function (a, k) { return a + S.wards[k].length; }, 0) : 255;
    var wk = Date.now() - 7 * 864e5, wk2 = Date.now() - 14 * 864e5;
    var last7 = rows.filter(function (r) { return r._t >= wk; }).length, prev7 = rows.filter(function (r) { return r._t >= wk2 && r._t < wk; }).length;
    var trend = prev7 ? Math.round((last7 - prev7) / prev7 * 100) : null;
    var tiles = [
      ['Responses', num(n), num(last7) + ' in the last 7 days' + (trend != null ? ' <span class="' + (trend >= 0 ? 'up' : 'down') + '">' + (trend >= 0 ? '▲ ' : '▼ ') + Math.abs(trend) + '%</span>' : '')],
      ['Average overall rating', overall ? overall.toFixed(2) : '–', 'out of 5'],
      ['Net satisfaction', signed(net), '% rating 4–5 minus % rating 1–2'],
      ['Have a PVC', pct(pvcYes, n), num(pvcPlan) + ' more plan to register'],
      ['Volunteers', num(vols), pct(vols, n) + ' of respondents'],
      ['Contacts collected', num(Object.keys(phones).length), 'unique phone numbers · ' + num(wa) + ' WhatsApp'],
      ['Institutions covered', instN + ' / ' + C.INSTITUTIONS.length, 'listed institutions with responses'],
      ['LGAs and wards covered', lgaN + ' / ' + C.LGAS.length, num(Object.keys(wardSet).length) + ' of ' + num(wardTotal) + ' wards']
    ];
    $('#kpis').innerHTML = tiles.map(function (t) {
      return '<div class="kpi"><div class="k">' + t[0] + '</div><div class="v">' + t[1] + '</div><div class="s">' + t[2] + '</div></div>';
    }).join('');

    timeline($('#pTimeline'), rows);

    var sectors = C.SECTORS.map(function (s) {
      var vals = rows.map(function (r) { return r['rate_' + s.v]; }).filter(function (v) { return v >= 1; });
      var a = avg(vals);
      return { label: s.l, value: a || 0, text: a ? a.toFixed(2) : 'no ratings', tip: a ? a.toFixed(2) + ' out of 5 from ' + num(vals.length) + ' ratings' : 'No ratings yet', bad: a !== null && a < 2.5, has: a !== null };
    }).sort(function (x, y) { return (x.has ? x.value : 9) - (y.has ? y.value : 9); });
    bars($('#pSectors'), n ? sectors : [], { max: 5 });

    $('#overallSub').textContent = overall ? 'Average ' + overall.toFixed(2) + ' out of 5 · net satisfaction ' + signed(net) : 'No ratings yet';
    var dist = countBy(rows, function (r) { return r.overall; });
    bars($('#pOverall'), n ? [5, 4, 3, 2, 1].map(function (k) {
      var c = dist[k] || 0;
      return { label: k + (k === 5 ? ' · Excellent' : k === 1 ? ' · Very poor' : ''), value: c, text: num(c) + ' · ' + pct(c, n), bad: k <= 2 };
    }) : []);
    countBars($('#pPriorities'), rows, function (r) { return r.priorities; }, C.SECTORS, { sortByCount: true, limit: 8 });

    heatmap(rows);

    countBars($('#pNelfund'), rows, function (r) { return r.nelfund; }, C.NELFUND);
    countBars($('#pNelfundReason'), rows.filter(function (r) { return r.nelfund === 'not_applied'; }), function (r) { return r.nelfund_reason; }, C.NELFUND_REASON, { sortByCount: true });
    countBars($('#pNelfundWait'), rows.filter(function (r) { return r.nelfund === 'waiting' || r.nelfund === 'rejected'; }), function (r) { return r.nelfund_wait; }, C.NELFUND_WAIT);

    countBars($('#pTransport'), rows, function (r) { return r.transport; }, C.TRANSPORT);
    var tr = avg(rows.map(function (r) { return r.transport_rate; }).filter(Boolean));
    if (tr) $('#pTransport').insertAdjacentHTML('beforeend', '<p class="small muted" style="margin-top:6px">Average rating from users: <b>' + tr.toFixed(2) + '</b> / 5</p>');
    countBars($('#pScholarship'), rows, function (r) { return r.scholarship; }, C.SCHOLARSHIP);
    var other = rows.filter(function (r) { return r.other_sch === 'yes'; });
    countBars($('#pOtherSch'), other, function (r) { return r.other_sch_name ? r.other_sch_name.trim().toUpperCase() : 'NAME NOT GIVEN'; }, null, { limit: 8, fmt: tc, base: n });
    countBars($('#pEmpower'), rows.filter(function (r) { return r.empower === 'yes'; }),
      function (r) { return r.empower_name ? r.empower_name.trim().toUpperCase() : 'NAME NOT GIVEN'; }, null, { limit: 8, fmt: tc, base: n });

    countBars($('#pIncentives'), rows, function (r) { return r.incentives; }, C.INCENTIVES, { sortByCount: true });
    countBars($('#pWantShort'), rows, function (r) { return r.want_short; }, C.WANT_SHORT, { sortByCount: true });
    countBars($('#pWantLong'), rows, function (r) { return r.want_long; }, C.WANT_LONG, { sortByCount: true });
    countBars($('#pCommend'), rows, function (r) { return r.commend; }, C.SECTORS, { sortByCount: true, limit: 8 });
    countBars($('#pShortfalls'), rows, function (r) { return r.shortfalls; }, C.SECTORS, { sortByCount: true, limit: 8 });

    countBars($('#pGender'), rows, function (r) { return r.gender; }, C.GENDER);
    countBars($('#pAge'), rows, function (r) { return r.age; }, C.AGE);
    countBars($('#pPvc'), rows, function (r) { return r.pvc; }, C.PVC);
    countBars($('#pLevel'), rows, function (r) { return r.level; }, null, { limit: 8 });

    $('#instSub').textContent = instN + ' of ' + C.INSTITUTIONS.length + ' listed institutions have responses';
    countBars($('#pInst'), rows, function (r) { return r.institution; }, null, { limit: 13 });
    var lga = F.lga.value;
    $('#wardTitle').textContent = lga ? 'Wards in ' + tc(lga) : 'Top 15 wards';
    countBars($('#pWard'), rows, function (r) { return lga ? r.ward : r.ward + ' · ' + r.lga; }, null, { limit: lga ? 0 : 15, fmt: tc });
  }

  function timeline(el, rows) {
    if (!rows.length) { el.innerHTML = '<div class="empty">No responses in this period.</div>'; return; }
    var w = dateWindow();
    var first = w.start || rows[rows.length - 1]._t, last = w.end ? Math.min(w.end, Date.now()) : Date.now();
    var spanDays = Math.max(1, Math.ceil((last - first) / 864e5) + 1);
    var weekly = spanDays > 92;
    var step = weekly ? 7 : 1;
    var start = new Date(first); start.setHours(0, 0, 0, 0);
    if (weekly) start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
    var buckets = [], idx = {};
    for (var t = start.getTime(); t <= last; t += step * 864e5) { idx[dayKey(t)] = buckets.length; buckets.push({ t: t, n: 0 }); }
    rows.forEach(function (r) {
      var d = new Date(r._t); d.setHours(0, 0, 0, 0);
      if (weekly) d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      var i = idx[dayKey(d.getTime())]; if (i !== undefined) buckets[i].n++;
    });
    $('#tlSub').textContent = (weekly ? 'Weekly' : 'Daily') + ' submissions · ' + num(rows.length) + ' in total';
    var Wd = 900, H = 220, L = 36, R = 8, T = 10, B = 28;
    var max = Math.max.apply(null, buckets.map(function (b) { return b.n; })) || 1;
    var nice = max <= 5 ? 5 : Math.ceil(max / 4) * 4;
    var bw = (Wd - L - R) / buckets.length, gap = Math.min(4, bw * 0.25);
    var y = function (v) { return T + (H - T - B) * (1 - v / nice); };
    var svg = '<svg class="chart-svg" viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="Responses over time">';
    for (var g = 0; g <= 4; g++) {
      var gv = nice / 4 * g, gy = y(gv);
      svg += '<line class="grid" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + gy + '" y2="' + gy + '"/>' +
        '<text class="axis" x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + Math.round(gv) + '</text>';
    }
    buckets.forEach(function (b, i) {
      var x = L + i * bw, h = (H - T - B) * (b.n / nice), bwi = Math.max(1, bw - gap);
      var tipTxt = '<b>' + (weekly ? 'Week of ' : '') + esc(fmtDate(b.t)) + '</b>' + num(b.n) + ' response' + (b.n === 1 ? '' : 's');
      if (b.n) svg += '<path class="bar" d="M' + x + ',' + (H - B) + 'V' + (H - B - h + Math.min(4, h)) + 'q0,-' + Math.min(4, h) + ' ' + Math.min(4, bwi / 2) + ',-' + Math.min(4, h) +
        'H' + (x + bwi - Math.min(4, bwi / 2)) + 'q' + Math.min(4, bwi / 2) + ',0 ' + Math.min(4, bwi / 2) + ',' + Math.min(4, h) + 'V' + (H - B) + 'Z"/>';
      svg += '<rect class="hit" x="' + x + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" data-tip="' + esc(tipTxt) + '"/>';
    });
    var labels = [0, Math.floor(buckets.length / 2), buckets.length - 1].filter(function (v, i, a) { return a.indexOf(v) === i; });
    labels.forEach(function (i, k) {
      var x = L + i * bw + bw / 2, anchor = k === 0 ? 'start' : k === labels.length - 1 ? 'end' : 'middle';
      if (k === 0) x = L; if (k === labels.length - 1 && labels.length > 1) x = Wd - R;
      svg += '<text class="axis" x="' + x + '" y="' + (H - 8) + '" text-anchor="' + anchor + '">' + esc(fmtDate(buckets[i].t)) + '</text>';
    });
    el.innerHTML = svg + '</svg>';
  }

  function heatmap(rows) {
    var byLga = {};
    rows.forEach(function (r) { if (C.LGAS.indexOf(r.lga) !== -1) (byLga[r.lga] = byLga[r.lga] || []).push(r); });
    var lgas = Object.keys(byLga).sort(function (a, b) { return byLga[b].length - byLga[a].length; });
    if (!lgas.length) { $('#pHeat').innerHTML = '<div class="empty">No responses from Kaduna LGAs yet.</div>'; $('#heatLegend').innerHTML = ''; return; }
    var h = '<table class="heat"><thead><tr><th style="writing-mode:initial;transform:none;height:auto">LGA</th><th>Responses</th>' +
      C.SECTORS.map(function (s) { return '<th scope="col">' + esc(s.l) + '</th>'; }).join('') + '</tr></thead><tbody>';
    lgas.forEach(function (l) {
      var list = byLga[l];
      h += '<tr><th scope="row">' + esc(tc(l)) + '</th><td class="n">' + num(list.length) + '</td>';
      C.SECTORS.forEach(function (s) {
        var vals = list.map(function (r) { return r['rate_' + s.v]; }).filter(function (v) { return v >= 1; });
        var a = avg(vals);
        if (a == null) { h += '<td class="na" data-tip="' + esc('<b>' + esc(tc(l)) + ' · ' + esc(s.l) + '</b>No ratings') + '">–</td>'; return; }
        var bg = rateColor(a);
        h += '<td style="background:' + bg + ';color:' + inkOn(bg) + '" data-tip="' + esc('<b>' + esc(tc(l)) + ' · ' + esc(s.l) + '</b>' + a.toFixed(2) + ' out of 5 from ' + num(vals.length) + ' rating' + (vals.length === 1 ? '' : 's')) + '">' + a.toFixed(1) + '</td>';
      });
      h += '</tr>';
    });
    $('#pHeat').innerHTML = h + '</tbody></table>';
    $('#heatLegend').innerHTML = ratingLegend();
  }
  function ratingLegend() {
    return '<span>Poor</span><span class="sw">' + DIV.map(function (c, i) { return '<i style="background:' + c + '" title="' + (i + 1) + '"></i>'; }).join('') +
      '</span><span>Good</span><span style="margin-left:10px">1 → 5</span>';
  }

  /* ---------- Map ---------- */
  function ensureGeo() {
    var jobs = [];
    if (!S.geo) jobs.push(fetch('data/kaduna-lgas.json').then(function (r) { return r.json(); }).then(function (g) { S.geo = g; }));
    if (!S.wards) jobs.push(fetch('data/wards.json').then(function (r) { return r.json(); }).then(function (w) { S.wards = w; buildWardFilter(); }));
    return Promise.all(jobs);
  }
  function lgaStats(rows) {
    var st = {};
    C.LGAS.forEach(function (l) { st[l] = { rows: [] }; });
    rows.forEach(function (r) { if (st[r.lga]) st[r.lga].rows.push(r); });
    Object.keys(st).forEach(function (l) {
      var rr = st[l].rows, n = rr.length;
      st[l].n = n;
      st[l].overall = avg(rr.map(function (r) { return r.overall; }).filter(Boolean));
      st[l].net = netScore(rr);
      st[l].pvc = n ? rr.filter(function (r) { return r.pvc === 'yes'; }).length / n * 100 : null;
      st[l].vol = rr.filter(function (r) { return r.volunteer; }).length;
      var sv = rr.map(function (r) { return r['rate_' + S.map.sector]; }).filter(function (v) { return v >= 1; });
      st[l].sector = avg(sv); st[l].sectorN = sv.length;
    });
    return st;
  }
  function metricValue(s) {
    switch (S.map.metric) {
      case 'count': return s.n;
      case 'overall': return s.overall;
      case 'net': return s.net;
      case 'pvc': return s.pvc;
      case 'volunteers': return s.vol;
      case 'sector': return s.sector;
    }
  }
  function metricText(v) {
    if (v == null) return 'no data';
    switch (S.map.metric) {
      case 'count': case 'volunteers': return num(v);
      case 'overall': case 'sector': return v.toFixed(2) + ' / 5';
      case 'net': return signed(v);
      case 'pvc': return Math.round(v) + '%';
    }
  }
  function metricName() {
    var m = S.map.metric;
    if (m === 'sector') return 'Rating: ' + label(C.SECTORS, S.map.sector);
    return { count: 'Responses', overall: 'Average overall rating', net: 'Net satisfaction', pvc: 'Share with a PVC', volunteers: 'Volunteers' }[m];
  }
  function fillFor(v, max) {
    var m = S.map.metric;
    if (v == null || (m !== 'net' && v === 0 && (m === 'count' || m === 'volunteers'))) return null;
    if (m === 'overall' || m === 'sector') return rateColor(v);
    if (m === 'net') return netColor(v);
    if (m === 'pvc') return SEQ[Math.min(4, Math.floor(v / 20 - 1e-9))] || SEQ[0];
    return seqColor(v, max);
  }

  var mapBuilt = false;
  function buildMapSvg() {
    var feats = S.geo.features, minX = 180, maxX = -180, minY = 90, maxY = -90;
    function each(geom, fn) {
      var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      polys.forEach(function (p) { p.forEach(function (ring) { fn(ring); }); });
    }
    feats.forEach(function (f) { each(f.geometry, function (ring) { ring.forEach(function (c) {
      if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0]; if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1]; }); }); });
    var k = Math.cos((minY + maxY) / 2 * Math.PI / 180), W = 800, sc = W / ((maxX - minX) * k), H = Math.round((maxY - minY) * sc);
    var px = function (c) { return [((c[0] - minX) * k * sc), ((maxY - c[1]) * sc)]; };
    var svg = '<svg class="map" viewBox="-6 -6 ' + (W + 12) + ' ' + (H + 12) + '" role="img" aria-label="Map of Kaduna State LGAs">' +
      '<defs><pattern id="nodata" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--surface-2)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--line)" stroke-width="3"/></pattern></defs><g id="lgaShapes">';
    var labels = '';
    feats.forEach(function (f) {
      var d = '', best = null, bestA = 0;
      each(f.geometry, function (ring) {
        var pts = ring.map(px);
        d += 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L') + 'Z';
        var a = 0, cx = 0, cy = 0;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          var cr = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; a += cr; cx += (pts[j][0] + pts[i][0]) * cr; cy += (pts[j][1] + pts[i][1]) * cr;
        }
        a /= 2; if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cx / (6 * a), cy / (6 * a)]; }
      });
      var lga = f.properties.lga;
      svg += '<path d="' + d + '" data-lga="' + esc(lga) + '" tabindex="0" role="button" aria-label="' + esc(tc(lga)) + '"/>';
      if (bestA > 1500 && best) labels += '<text x="' + best[0].toFixed(1) + '" y="' + best[1].toFixed(1) + '" text-anchor="middle">' + esc(tc(lga)) + '</text>';
    });
    $('#mapBox').innerHTML = svg + '</g><g>' + labels + '</g></svg>';
    $('#mapBox svg').addEventListener('click', function (e) {
      var p = e.target.closest('path[data-lga]'); if (!p) return;
      var l = p.getAttribute('data-lga'); setLga(F.lga.value === l ? '' : l);
    });
    $('#mapBox svg').addEventListener('keydown', function (e) {
      var p = e.target.closest('path[data-lga]'); if (!p || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault(); var l = p.getAttribute('data-lga'); setLga(F.lga.value === l ? '' : l);
    });
    mapBuilt = true;
  }

  function renderMap() {
    ensureGeo().then(function () {
      if (!mapBuilt) buildMapSvg();
      var rows = filterRows(true), st = lgaStats(rows), sel = F.lga.value;
      var vals = C.LGAS.map(function (l) { return metricValue(st[l]); }).filter(function (v) { return v != null; });
      var max = Math.max.apply(null, vals.concat([1]));
      $$('#lgaShapes path').forEach(function (p) {
        var l = p.getAttribute('data-lga'), s = st[l], v = metricValue(s), fill = fillFor(v, max);
        p.setAttribute('fill', fill || 'url(#nodata)');
        p.classList.toggle('sel', sel === l);
        var extra = S.map.metric === 'sector' ? ' (' + num(s.sectorN) + ' ratings)' : '';
        // setAttribute stores the text as-is, so the tooltip HTML is built from escaped parts only.
        p.setAttribute('data-tip', '<b>' + esc(tc(l)) + '</b>' +
          (S.map.metric !== 'count' ? esc(metricName()) + ': ' + esc(metricText(v)) + extra + '<br>' : '') +
          'Responses: ' + num(s.n) + (s.n ? '<br>Avg overall: ' + f2(s.overall) + ' · PVC: ' + (s.pvc == null ? '–' : Math.round(s.pvc) + '%') + ' · Volunteers: ' + num(s.vol) : '') +
          '<br><i>' + (sel === l ? 'Click to clear the filter' : 'Click to see wards') + '</i>');
      });
      mapLegend(max);
      rankTable(st);
      wardPanel(rows);
    }).catch(function () { $('#mapBox').innerHTML = '<div class="empty-state">The map could not be loaded. Check your connection and press Refresh.</div>'; });
  }
  function mapLegend(max) {
    var m = S.map.metric, h;
    if (m === 'overall' || m === 'sector') h = ratingLegend();
    else if (m === 'net') h = '<span>Negative</span><span class="sw">' + DIV.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span><span>Positive</span><span style="margin-left:10px">−100 → +100</span>';
    else if (m === 'pvc') h = '<span class="sw">' + SEQ.map(function (c, i) { return '<i style="background:' + c + '" title="' + (i * 20) + '–' + ((i + 1) * 20) + '%"></i>'; }).join('') + '</span><span>0% → 100% with a PVC</span>';
    else h = '<span class="sw">' + SEQ.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span><span>1 → ' + num(max) + ' ' + (m === 'count' ? 'responses' : 'volunteers') + '</span>';
    $('#mapLegend').innerHTML = h + '<span style="margin-left:10px"><span class="nodata"></span> No data</span>';
  }
  function rankTable(st) {
    var sel = F.lga.value, m = S.map.metric;
    var list = C.LGAS.slice().sort(function (a, b) {
      var va = metricValue(st[a]), vb = metricValue(st[b]);
      if (va == null && vb == null) return st[b].n - st[a].n;
      if (va == null) return 1; if (vb == null) return -1; return vb - va;
    });
    var max = Math.max.apply(null, C.LGAS.map(function (l) { return metricValue(st[l]) || 0; }).concat([1]));
    var covered = C.LGAS.filter(function (l) { return st[l].n; }).length;
    $('#rankSub').textContent = 'Sorted by ' + metricName().toLowerCase() + ' · ' + covered + ' of ' + C.LGAS.length + ' LGAs have responses';
    $('#rankTable').innerHTML = '<table class="rank"><thead><tr><th>#</th><th>LGA</th><th class="num">Responses</th>' + (m !== 'count' ? '<th class="num">' + esc(metricName()) + '</th>' : '') + '</tr></thead><tbody>' +
      list.map(function (l, i) {
        var s = st[l], v = metricValue(s), c = fillFor(v, max);
        return '<tr class="row' + (sel === l ? ' sel' : '') + (s.n ? '' : ' zero') + '" data-lga="' + esc(l) + '" tabindex="0"><td>' + (i + 1) + '</td><td><span class="dot" style="background:' + (c || 'var(--surface-2)') + '"></span>' + esc(tc(l)) +
          '</td><td class="num">' + num(s.n) + '</td>' + (m !== 'count' ? '<td class="num">' + esc(metricText(v)) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  $('#rankTable').addEventListener('click', function (e) { var r = e.target.closest('tr[data-lga]'); if (r) { var l = r.getAttribute('data-lga'); setLga(F.lga.value === l ? '' : l); } });
  $('#rankTable').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var r = e.target.closest('tr[data-lga]'); if (r) setLga(r.getAttribute('data-lga')); } });

  function wardPanel(rows) {
    var lga = F.lga.value, clear = $('#clearLga');
    clear.classList.toggle('hidden', !lga);
    if (!lga || !S.wards || !S.wards[lga]) {
      $('#wardPanelTitle').textContent = 'Wards';
      $('#wardPanelSub').textContent = 'Select an LGA on the map to see every ward, including wards with no responses yet.';
      $('#wardTable').innerHTML = '';
      return;
    }
    var inLga = rows.filter(function (r) { return r.lga === lga; });
    var by = {}; S.wards[lga].forEach(function (w) { by[w] = []; });
    inLga.forEach(function (r) { (by[r.ward] = by[r.ward] || []).push(r); });
    var names = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length || a.localeCompare(b); });
    var reached = names.filter(function (w) { return by[w].length; }).length;
    $('#wardPanelTitle').textContent = 'Wards in ' + tc(lga);
    $('#wardPanelSub').textContent = reached + ' of ' + names.length + ' wards have responses · ' + num(inLga.length) + ' responses in total. Click a ward to filter.';
    $('#wardTable').innerHTML = '<table class="rank"><thead><tr><th>Ward</th><th class="num">Resp.</th><th class="num">Avg</th><th class="num">PVC</th><th class="num">Vol.</th></tr></thead><tbody>' +
      names.map(function (w) {
        var rr = by[w], n = rr.length, a = avg(rr.map(function (r) { return r.overall; }).filter(Boolean));
        var pv = rr.filter(function (r) { return r.pvc === 'yes'; }).length, vo = rr.filter(function (r) { return r.volunteer; }).length;
        return '<tr class="row' + (n ? '' : ' zero') + (F.ward.value === w ? ' sel' : '') + '" data-ward="' + esc(w) + '" tabindex="0"><td>' + esc(tc(w)) + '</td><td class="num">' + num(n) + '</td><td class="num">' + f2(a) +
          '</td><td class="num">' + (n ? pct(pv, n) : '–') + '</td><td class="num">' + num(vo) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  $('#wardTable').addEventListener('click', function (e) {
    var r = e.target.closest('tr[data-ward]'); if (!r) return;
    var w = r.getAttribute('data-ward'); F.ward.value = F.ward.value === w ? '' : w; S.table.page = 1; render();
  });
  $('#clearLga').addEventListener('click', function () { setLga(''); });
  $('#mMetric').addEventListener('change', function () {
    S.map.metric = this.value; $('#mSectorWrap').classList.toggle('hidden', this.value !== 'sector'); renderMap();
  });
  $('#mSector').innerHTML = C.SECTORS.map(function (s) { return '<option value="' + s.v + '">' + esc(s.l) + '</option>'; }).join('');
  $('#mSector').addEventListener('change', function () { S.map.sector = this.value; renderMap(); });

  /* ---------- Responses table ---------- */
  var COLS = [
    { k: 'created_at', l: 'Date', sort: function (r) { return r._t; } },
    { k: 'name', l: 'Name' },
    { k: 'phone', l: 'Phone' },
    { k: 'institution', l: 'Institution' },
    { k: 'level', l: 'Level' },
    { k: 'lga', l: 'LGA' },
    { k: 'ward', l: 'Ward' },
    { k: 'overall', l: 'Overall' },
    { k: 'pvc', l: 'PVC' },
    { k: 'volunteer', l: 'Volunteer', sort: function (r) { return r.volunteer ? 1 : 0; } }
  ];
  function tableRows() {
    var q = S.table.q.trim().toLowerCase();
    var vol = $('#tVol').checked, pv = $('#tPvc').checked, notes = $('#tNotes').checked, low = $('#tLow').checked;
    var list = S.rows.filter(function (r) {
      if (vol && !r.volunteer) return false;
      if (pv && r.pvc !== 'yes') return false;
      if (notes && !hasNote(r)) return false;
      if (low && !(r.overall <= 2)) return false;
      if (!q) return true;
      var hay = [r.name, r.phone, r.whatsapp, r.email, r.institution, r.level, r.lga, r.ward, r.pu]
        .concat(NOTES.map(function (k) { return r[k[0]]; })).join(' ').toLowerCase();
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
    });
    var col = COLS.filter(function (c) { return c.k === S.table.sort; })[0] || COLS[0];
    var get = col.sort || function (r) { var v = r[col.k]; return v == null ? '' : typeof v === 'string' ? v.toLowerCase() : v; };
    var dir = S.table.dir;
    return list.slice().sort(function (a, b) { var x = get(a), y = get(b); return x < y ? -dir : x > y ? dir : b._t - a._t; });
  }
  function renderTable() {
    var list = S.table.view = tableRows(), size = S.table.size, pages = Math.max(1, Math.ceil(list.length / size));
    if (S.table.page > pages) S.table.page = pages;
    var from = (S.table.page - 1) * size, slice = list.slice(from, from + size);
    $('#dataTable thead').innerHTML = '<tr>' + COLS.map(function (c) {
      var on = S.table.sort === c.k;
      return '<th' + (on ? ' aria-sort="' + (S.table.dir > 0 ? 'ascending' : 'descending') + '"' : '') + '><button type="button" data-sort="' + c.k + '">' + esc(c.l) +
        '<span class="arrow">' + (on ? (S.table.dir > 0 ? '▲' : '▼') : '↕') + '</span></button></th>';
    }).join('') + '</tr>';
    $('#dataTable tbody').innerHTML = slice.length ? slice.map(function (r, i) {
      var bg = rateColor(r.overall);
      var wa = (r.whatsapp || r.phone || '').replace(/^\+/, '').replace(/^0/, '234');
      return '<tr tabindex="0" data-idx="' + (from + i) + '">' +
        '<td class="nowrap">' + esc(fmtDate(r._t)) + '</td>' +
        '<td><b>' + esc(r.name) + '</b>' + (hasNote(r) ? ' <span class="pill" title="Wrote a comment">💬</span>' : '') + '</td>' +
        '<td class="nowrap"><a href="tel:' + esc(r.phone) + '" onclick="event.stopPropagation()">' + esc(r.phone) + '</a>' +
          (wa ? '<a class="wa-link" href="https://wa.me/' + esc(wa) + '" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp ' + esc(r.name) + '" onclick="event.stopPropagation()">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12z"/></svg></a>' : '') + '</td>' +
        '<td>' + esc(r.institution) + '</td><td class="nowrap">' + esc(r.level) + '</td><td class="nowrap">' + esc(tc(r.lga)) + '</td><td>' + esc(tc(r.ward)) + '</td>' +
        '<td>' + (r.overall ? '<span class="rating" style="background:' + bg + ';color:' + inkOn(bg) + '">' + r.overall + '</span>' : '–') + '</td>' +
        '<td>' + (r.pvc === 'yes' ? '<span class="pill ok">Yes</span>' : r.pvc === 'plan' ? '<span class="pill warn">Plans to</span>' : r.pvc === 'no' ? '<span class="pill">No</span>' : '–') + '</td>' +
        '<td>' + (r.volunteer ? '<span class="pill ok">Yes</span>' : '<span class="muted">No</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="' + COLS.length + '"><div class="empty-state">No responses match.</div></td></tr>';
    $('#pager').innerHTML = '<span>' + (list.length ? 'Showing ' + num(from + 1) + '–' + num(from + slice.length) + ' of ' + num(list.length) : '0 responses') + '</span>' +
      '<span class="pg"><label for="pgSize" class="small">Rows</label><select id="pgSize">' + [25, 50, 100].map(function (s) { return '<option' + (s === size ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-page="prev"' + (S.table.page <= 1 ? ' disabled' : '') + '>‹ Prev</button>' +
      '<span>Page ' + S.table.page + ' of ' + pages + '</span>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-page="next"' + (S.table.page >= pages ? ' disabled' : '') + '>Next ›</button></span>';
  }
  $('#dataTable thead').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sort]'); if (!b) return;
    var k = b.getAttribute('data-sort');
    if (S.table.sort === k) S.table.dir = -S.table.dir; else { S.table.sort = k; S.table.dir = k === 'created_at' || k === 'overall' ? -1 : 1; }
    renderTable();
  });
  $('#dataTable tbody').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-idx]'); if (tr) openDrawer(Number(tr.getAttribute('data-idx'))); });
  $('#dataTable tbody').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var tr = e.target.closest('tr[data-idx]'); if (tr) openDrawer(Number(tr.getAttribute('data-idx'))); } });
  $('#pager').addEventListener('click', function (e) {
    var b = e.target.closest('[data-page]'); if (!b) return;
    S.table.page += b.getAttribute('data-page') === 'next' ? 1 : -1; renderTable();
    $('.tbl-wrap').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $('#pager').addEventListener('change', function (e) { if (e.target.id === 'pgSize') { S.table.size = Number(e.target.value); S.table.page = 1; renderTable(); } });
  var searchT;
  $('#tSearch').addEventListener('input', function () {
    clearTimeout(searchT); var v = this.value;
    searchT = setTimeout(function () { S.table.q = v; S.table.page = 1; renderTable(); }, 150);
  });
  ['#tVol', '#tPvc', '#tNotes', '#tLow'].forEach(function (id) { $(id).addEventListener('change', function () { S.table.page = 1; renderTable(); }); });

  /* ---------- Detail drawer ---------- */
  var lastFocus = null;
  function kv(pairs) {
    return '<dl class="kv">' + pairs.filter(function (p) { return p[1] !== undefined && p[1] !== null && p[1] !== ''; }).map(function (p) {
      return '<dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd>';
    }).join('') + '</dl>';
  }
  function tags(arr, list) {
    if (!arr || !arr.length) return '<span class="muted">None chosen</span>';
    return '<div class="tags">' + arr.map(function (v) { return '<span class="pill ok">' + esc(label(list, v)) + '</span>'; }).join('') + '</div>';
  }
  function rateCell(v) {
    if (!v) return '<span class="muted">Not rated</span>';
    var bg = rateColor(v); return '<span class="rating" style="background:' + bg + ';color:' + inkOn(bg) + '">' + v + '</span> / 5';
  }
  function openDrawer(i) {
    var list = S.table.view, r = list[i]; if (!r) return;
    S.drawerIdx = i; lastFocus = lastFocus || document.activeElement;
    var wa = (r.whatsapp || r.phone || '').replace(/^\+/, '').replace(/^0/, '234');
    $('#drawerTitle').textContent = r.name + ' (' + (i + 1) + ' of ' + list.length + ')';
    var notes = NOTES.filter(function (k) { return r[k[0]]; });
    $('#drawerBody').innerHTML =
      '<section class="dsec"><h4>About</h4>' + kv([
        ['Submitted', esc(fmtDate(r._t, true))],
        ['Phone', '<a href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a>' + (wa ? ' · <a href="https://wa.me/' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp</a>' : '')],
        ['WhatsApp', esc(r.whatsapp)], ['Email', r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : ''],
        ['Institution', esc(r.institution)], ['Level', esc(r.level)], ['LGA', esc(tc(r.lga))], ['Ward', esc(tc(r.ward))],
        ['Polling unit', esc(r.pu ? tc(r.pu) + (r.pu_code ? ' (' + r.pu_code + ')' : '') : '')],
        ['Gender', esc(r.gender)], ['Age', esc(r.age)], ['PVC', esc(r.pvc ? label(C.PVC, r.pvc) : '')],
        ['Volunteer', r.volunteer ? '<span class="pill ok">Yes</span>' : 'No']
      ]) + '</section>' +
      '<section class="dsec"><h4>Ratings</h4>' + kv([['Overall', rateCell(r.overall)]].concat(C.SECTORS.map(function (s) { return [s.l, rateCell(r['rate_' + s.v])]; }))) + '</section>' +
      '<section class="dsec"><h4>Programmes</h4>' + kv([
        ['NELFUND', esc(r.nelfund ? label(C.NELFUND, r.nelfund) : '')],
        ['Why not applied', esc(r.nelfund_reason ? label(C.NELFUND_REASON, r.nelfund_reason) : '')],
        ['Waiting time', esc(r.nelfund_wait ? label(C.NELFUND_WAIT, r.nelfund_wait) : '')],
        ['NELFUND rating', r.nelfund_rate ? rateCell(r.nelfund_rate) : ''],
        ['State scholarship', esc(r.scholarship ? label(C.SCHOLARSHIP, r.scholarship) : '')],
        ['Other scholarship', esc(r.other_sch === 'yes' ? 'Applied, not received' + (r.other_sch_name ? ': ' + r.other_sch_name : '') : r.other_sch === 'no' ? 'No' : '')],
        ['Free transport', esc(r.transport ? label(C.TRANSPORT, r.transport) : '')],
        ['Transport rating', r.transport_rate ? rateCell(r.transport_rate) : ''],
        ['Empowerment', esc(r.empower === 'yes' ? 'Yes' + (r.empower_name ? ': ' + r.empower_name : '') : r.empower === 'no' ? 'No' : '')]
      ]) + '</section>' +
      '<section class="dsec"><h4>Commend and correct</h4>' + kv([['Commends', tags(r.commend, C.SECTORS)], ['Shortfalls', tags(r.shortfalls, C.SECTORS)]]) + '</section>' +
      '<section class="dsec"><h4>What they want</h4>' + kv([
        ['Incentives', tags(r.incentives, C.INCENTIVES)], ['Short term', tags(r.want_short, C.WANT_SHORT)],
        ['Long term', tags(r.want_long, C.WANT_LONG)], ['Top priorities', tags(r.priorities, C.SECTORS)]
      ]) + '</section>' +
      (notes.length ? '<section class="dsec"><h4>Written comments</h4>' + notes.map(function (k) {
        return '<p class="small muted" style="margin:0 0 2px">' + k[1] + '</p><p class="quote">' + esc(r[k[0]]) + '</p>';
      }).join('') + '</section>' : '');
    $('#dPrev').disabled = i <= 0; $('#dNext').disabled = i >= list.length - 1;
    $('#drawer').classList.add('open'); $('#drawerBg').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
    $('#drawerBody').scrollTop = 0;
    $('#dClose').focus();
  }
  function closeDrawer() {
    $('#drawer').classList.remove('open'); $('#drawerBg').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
    if (lastFocus && lastFocus.focus) lastFocus.focus(); lastFocus = null;
  }
  $('#dClose').addEventListener('click', closeDrawer);
  $('#drawerBg').addEventListener('click', closeDrawer);
  $('#dPrev').addEventListener('click', function () { openDrawer(S.drawerIdx - 1); });
  $('#dNext').addEventListener('click', function () { openDrawer(S.drawerIdx + 1); });
  document.addEventListener('keydown', function (e) {
    if (!$('#drawer').classList.contains('open')) return;
    if (e.key === 'Escape') closeDrawer();
    else if (e.key === 'ArrowLeft' && S.drawerIdx > 0) openDrawer(S.drawerIdx - 1);
    else if (e.key === 'ArrowRight' && S.drawerIdx < S.table.view.length - 1) openDrawer(S.drawerIdx + 1);
  });

  /* ---------- Comments ---------- */
  $('#cType').innerHTML = '<option value="">All comment types</option>' + NOTES.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + '</option>'; }).join('');
  function renderComments() {
    var q = S.comments.q.trim().toLowerCase(), type = S.comments.type, items = [];
    S.rows.forEach(function (r) {
      NOTES.forEach(function (k) {
        if (!r[k[0]] || (type && type !== k[0])) return;
        if (q && (r[k[0]] + ' ' + r.name + ' ' + r.institution + ' ' + r.lga).toLowerCase().indexOf(q) === -1) return;
        items.push({ r: r, k: k });
      });
    });
    $('#cMeta').textContent = num(items.length) + ' comment' + (items.length === 1 ? '' : 's') + ', newest first';
    var shown = items.slice(0, S.comments.shown);
    $('#cFeed').innerHTML = shown.length ? shown.map(function (it) {
      var r = it.r;
      return '<div class="comment"><div class="who"><b>' + esc(r.name) + '</b> · ' + esc(r.institution) + ' · ' + esc(r.level) + ' · ' +
        esc(tc(r.lga)) + ' · ' + esc(fmtDate(r._t)) + '</div><p><span class="tag">' + it.k[1] + '</span>' + esc(r[it.k[0]]) + '</p></div>';
    }).join('') : '<div class="empty-state">No comments match.</div>';
    $('#cMore').classList.toggle('hidden', items.length <= S.comments.shown);
  }
  var cT;
  $('#cSearch').addEventListener('input', function () { clearTimeout(cT); var v = this.value; cT = setTimeout(function () { S.comments.q = v; S.comments.shown = 30; renderComments(); }, 150); });
  $('#cType').addEventListener('change', function () { S.comments.type = this.value; S.comments.shown = 30; renderComments(); });
  $('#cMore').addEventListener('click', function () { S.comments.shown += 30; renderComments(); });

  /* ---------- CSV ---------- */
  var CSV_COLS = ['created_at', 'name', 'phone', 'whatsapp', 'email', 'institution', 'level', 'lga', 'ward', 'pu', 'pu_code', 'gender', 'age', 'pvc', 'overall']
    .concat(C.SECTORS.map(function (s) { return 'rate_' + s.v; }))
    .concat(['nelfund', 'nelfund_reason', 'nelfund_wait', 'nelfund_issue', 'nelfund_rate', 'scholarship', 'other_sch', 'other_sch_name', 'other_sch_issue',
      'transport', 'transport_rate', 'empower', 'empower_name', 'commend', 'commend_note', 'shortfalls', 'shortfall_note', 'want_short', 'want_long',
      'incentives', 'priorities', 'strengthen_note', 'message', 'volunteer', 'consent']);
  function cell(v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) v = v.join('; ');
    v = String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // spreadsheets must not run values as formulas
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function download(rows, suffix) {
    var text = [CSV_COLS.join(',')].concat(rows.map(function (r) { return CSV_COLS.map(function (c) { return cell(r[c]); }).join(','); })).join('\r\n');
    var blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kaduna-student-voice-' + suffix + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast(num(rows.length) + ' responses downloaded');
  }
  $('#csvBtn').addEventListener('click', function () { download(S.rows, 'filtered'); });
  $('#tCsv').addEventListener('click', function () { download(tableRows(), 'table'); });

  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2800);
  }

  // Load ward list early so the ward filter shows every ward, not only wards with responses.
  fetch('data/wards.json').then(function (r) { return r.json(); }).then(function (w) { S.wards = w; if (S.all.length) buildWardFilter(); }).catch(function () {});
})();
