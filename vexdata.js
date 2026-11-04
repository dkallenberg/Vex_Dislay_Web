/* VEX Event Display - browser data layer (no server needed). once
   JavaScript version of the data code in Vex_Event_Display.py: events.vex.com fetch + parsing, demo event,
   lunch break, qualification -> rankings -> bracket phases, and settings <-> URL. Used by index.html and display.html. */
(function (global) {
'use strict';
const API_BASE_DEFAULT = 'https://events.vex.com/api/v2';
const SKU_RE = /RE-[A-Z0-9]+-\d{2}-\d{4}/i;

/* ======================= settings <-> URL ======================= */
const DEFAULT_CFG = {
  view: 'single',
  hs: {sku: '', demo: false, phase: 'auto', fields: 3, division: '', lunchAfter: 0, lunchMins: 0, lunchResume: ''},
  ms: {sku: '', demo: false, phase: 'auto', fields: 2, division: '', lunchAfter: 0, lunchMins: 0, lunchResume: ''},
  rankWait: 300, poll: 15, scroll: 8, apiBase: API_BASE_DEFAULT, token: ''
};
const clone = o => JSON.parse(JSON.stringify(o));
function clamp(v, lo, hi, d) { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); }

function sanitize(c) {
  const out = clone(DEFAULT_CFG);
  c = c || {};
  for (const d of ['hs', 'ms']) {
    const s = c[d] || {};
    out[d].sku = String(s.sku || '').trim().slice(0, 500);
    out[d].demo = !!s.demo;
    out[d].fields = clamp(s.fields, 1, 4, d === 'hs' ? 3 : 2);
    out[d].division = String(s.division || '').trim().slice(0, 60);
    out[d].lunchAfter = clamp(s.lunchAfter, 0, 999, 0);
    out[d].lunchMins = clamp(s.lunchMins, 0, 600, 0);
    const rs = String(s.lunchResume || '').trim();
    out[d].lunchResume = /^\d{1,2}:\d{2}$/.test(rs) ? rs : '';
    out[d].phase = ['auto', 'quals', 'rankings', 'bracket'].includes(s.phase) ? s.phase : 'auto';
  }
  out.rankWait = clamp(c.rankWait, 0, 3600, 300);
  out.poll = clamp(c.poll, 5, 300, 15);
  out.scroll = clamp(c.scroll, 3, 120, 8);
  out.view = c.view === 'double' ? 'double' : 'single';
  const base = String(c.apiBase || '').trim().replace(/\/+$/, '');
  out.apiBase = /^https?:\/\//.test(base) ? base : API_BASE_DEFAULT;
  out.token = String(c.token || '').trim();
  return out;
}

/* Query string holds the event settings (only values that differ from the defaults, to keep links short).
   The API token goes in the #fragment: browsers never send that part to the web server (GitHub). */
function toUrl(base, cfg, withToken) {
  cfg = sanitize(cfg);
  const p = new URLSearchParams(), D = DEFAULT_CFG;
  if (cfg.view !== D.view) p.set('view', cfg.view);
  for (const d of (cfg.view === 'double' ? ['hs', 'ms'] : ['hs'])) {
    const e = cfg[d], de = D[d];
    if (e.sku) p.set(d, (e.sku.match(SKU_RE) || [e.sku])[0].toUpperCase());
    if (e.demo) p.set(d + 'demo', '1');
    if (e.division) p.set(d + 'div', e.division);
    if (e.fields !== de.fields) p.set(d + 'f', e.fields);
    if (e.lunchAfter) p.set(d + 'lunch', e.lunchAfter);
    if (e.lunchMins) p.set(d + 'lmin', e.lunchMins);
    if (e.lunchResume) p.set(d + 'lat', e.lunchResume);
    if (e.phase !== 'auto') p.set(d + 'ph', e.phase);
  }
  if (cfg.rankWait !== D.rankWait) p.set('wait', cfg.rankWait);
  if (cfg.poll !== D.poll) p.set('poll', cfg.poll);
  if (cfg.scroll !== D.scroll) p.set('scroll', cfg.scroll);
  if (cfg.apiBase !== D.apiBase) p.set('api', cfg.apiBase);
  const q = p.toString();
  return base + (q ? '?' + q : '') + (withToken && cfg.token ? '#t=' + encodeURIComponent(cfg.token) : '');
}

function fromUrl(loc) {
  loc = loc || global.location;
  const p = new URLSearchParams(loc.search), h = new URLSearchParams((loc.hash || '').replace(/^#/, ''));
  const c = {view: p.get('view') || 'single', rankWait: p.get('wait'), poll: p.get('poll'), scroll: p.get('scroll'),
             apiBase: p.get('api') || '', token: h.get('t') || ''};
  for (const d of ['hs', 'ms']) c[d] = {
    sku: p.get(d) || '', demo: p.get(d + 'demo') === '1', division: p.get(d + 'div') || '', fields: p.get(d + 'f'),
    lunchAfter: p.get(d + 'lunch'), lunchMins: p.get(d + 'lmin'), lunchResume: p.get(d + 'lat') || '', phase: p.get(d + 'ph') || 'auto'};
  const cfg = sanitize(c);
  cfg.configured = ['hs', 'ms'].some(d => p.has(d) || p.has(d + 'demo'));
  return cfg;
}

function tokenInfo(tok) {
  try {
    const part = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4))).exp;
    if (!exp) return {};
    return {exp: new Date(exp * 1000).toISOString().slice(0, 10), expired: exp * 1000 < Date.now()};
  } catch (e) { return {}; }
}

/* ======================= events.vex.com parsing ======================= */
function lk(d, ...names) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const low = {};
  for (const k of Object.keys(d)) low[k.toLowerCase().replace(/_/g, '')] = k;
  for (const n of names) {
    const k = low[n.toLowerCase().replace(/_/g, '')];
    if (k !== undefined && d[k] !== null && d[k] !== undefined) return d[k];
  }
  return null;
}
function teamName(v) {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'string' || typeof v === 'number') { const s = String(v).trim(); return s || null; }
  if (typeof v === 'object' && !Array.isArray(v)) {
    for (const k of ['number', 'teamNumber', 'name', 'team']) {
      const x = lk(v, k);
      if (x !== null) { const r = teamName(x); if (r) return r; }
    }
  }
  return null;
}
function allianceTeams(a) {
  if (a && typeof a === 'object' && !Array.isArray(a)) a = lk(a, 'teams', 'members') || [];
  const out = [];
  if (Array.isArray(a)) for (const t of a) {
    if (t && typeof t === 'object' && [true, 1].includes(lk(t, 'sitting'))) continue;
    const n = teamName(t); if (n) out.push(n);
  }
  return out;
}
function toNum(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const f = Number(v); if (!isFinite(f)) return null;
  return Number.isInteger(f) ? f : Math.round(f * 100) / 100;
}
function matchKind(m) {
  let rnd = lk(m, 'round'); if (typeof rnd === 'boolean') rnd = null;
  if (typeof rnd === 'number') { const r = Math.trunc(rnd); return r <= 1 ? 'skip' : (r === 2 ? 'qual' : 'elim'); }
  const nm = String(lk(m, 'name') || '').trim().toLowerCase();
  if (nm.startsWith('p ') || nm.startsWith('practice')) return 'skip';
  if (nm.startsWith('qf')) return 'elim';
  if (nm.startsWith('q')) return 'qual';
  return nm ? 'elim' : 'qual';
}
function parseMatch(m) {
  let red = null, blue = null, rs = null, bs = null;
  const al = lk(m, 'alliances');
  if (Array.isArray(al)) for (const a of al) {
    const c = String(lk(a, 'color') || '').toLowerCase();
    if (c === 'red') { red = allianceTeams(a); rs = lk(a, 'score'); }
    else if (c === 'blue') { blue = allianceTeams(a); bs = lk(a, 'score'); }
  }
  if (red === null) { const r = lk(m, 'red', 'redalliance', 'redteams'); if (r !== null) { red = allianceTeams(r); rs = (r && typeof r === 'object' && !Array.isArray(r)) ? lk(r, 'score') : null; } }
  if (blue === null) { const b = lk(m, 'blue', 'bluealliance', 'blueteams'); if (b !== null) { blue = allianceTeams(b); bs = (b && typeof b === 'object' && !Array.isArray(b)) ? lk(b, 'score') : null; } }
  if (red === null) red = ['red1', 'red2', 'red3'].map(k => teamName(lk(m, k))).filter(Boolean);
  if (blue === null) blue = ['blue1', 'blue2', 'blue3'].map(k => teamName(lk(m, k))).filter(Boolean);
  if (rs === null) rs = lk(m, 'redscore');
  if (bs === null) bs = lk(m, 'bluescore');
  rs = toNum(rs); bs = toNum(bs);
  let num = toNum(lk(m, 'matchnum', 'matchnumber', 'number'));
  if (num === null) { const mm = String(lk(m, 'name') || '').match(/(\d+)\s*$/); num = mm ? parseInt(mm[1], 10) : null; }
  if (num === null) return null;
  const flag = lk(m, 'scored', 'finished', 'completed', 'played');
  const scored = rs !== null && bs !== null && (!!flag || (rs + bs) > 0);
  let fld = lk(m, 'field', 'fieldname');
  if (fld && typeof fld === 'object') fld = lk(fld, 'name');
  return {num: Math.trunc(num), inst: toNum(lk(m, 'instance')) || 1, field: fld !== null && fld !== undefined ? String(fld) : '',
          red, blue, rs: scored ? rs : null, bs: scored ? bs : null, scored,
          rnd: String(lk(m, 'round') ?? ''), label: String(lk(m, 'name') || '')};
}
const ELIM_RE = /\b(R16|QF|SF|FINALS?|F)\b\s*#?\s*(\d+)?(?:\s*-\s*(\d+))?/i;
const KIND_BASE = {R16: 0, QF: 8, SF: 12, FINAL: 14}, KIND_MAX = {R16: 8, QF: 4, SF: 2, FINAL: 1}, RND_KIND = {6: 'R16', 3: 'QF', 4: 'SF', 5: 'FINAL'};
function elimSlot(m) {
  let kind = null, n = null, inst = null;
  const mm = (m.label || '').match(ELIM_RE);
  if (mm) {
    const k = mm[1].toUpperCase(); kind = k.startsWith('F') ? 'FINAL' : k;
    n = parseInt(mm[2] || '1', 10); inst = mm[3] ? parseInt(mm[3], 10) : m.inst;
  } else {
    kind = RND_KIND[Math.trunc(parseFloat(m.rnd))] || null;
    if (kind) { n = m.num; inst = m.inst; }
  }
  if (!kind) return null;
  if (kind === 'FINAL') n = 1;
  if (n < 1 || n > KIND_MAX[kind]) return null;
  return [KIND_BASE[kind] + n, inst];
}
function assignSlots(elims) {
  const best = {};
  for (const m of elims) {
    const r = elimSlot(m); if (!r) continue;
    m.slot = r[0]; m.inst = r[1];
    if (!best[r[0]] || r[1] >= best[r[0]].inst) best[r[0]] = m;   // later instance (replay) wins
  }
  return Object.values(best).sort((a, b) => a.slot - b.slot);
}
function parseRank(r) {
  return {rank: toNum(lk(r, 'rank')) || 0, team: teamName(lk(r, 'team', 'teamnumber', 'teamname')),
          w: toNum(lk(r, 'wins', 'w')) || 0, l: toNum(lk(r, 'losses', 'l')) || 0, t: toNum(lk(r, 'ties', 't')) || 0,
          wp: toNum(lk(r, 'wp')), ap: toNum(lk(r, 'ap')), sp: toNum(lk(r, 'sp')),
          avg: toNum(lk(r, 'averagepoints', 'avgscore', 'averagescore', 'avg', 'avgpoints'))};
}
function fillAverages(rankings, matches) {
  const sums = {}, cnt = {};
  for (const m of matches) {
    if (!m.scored) continue;
    for (const [teams, sc] of [[m.red, m.rs], [m.blue, m.bs]]) for (const t of teams) { sums[t] = (sums[t] || 0) + (sc || 0); cnt[t] = (cnt[t] || 0) + 1; }
  }
  for (const r of rankings) {
    if (r.avg === null) r.avg = cnt[r.team] ? Math.round(sums[r.team] / cnt[r.team] * 10) / 10 : 0;
    for (const k of ['wp', 'ap', 'sp']) if (r[k] === null) r[k] = 0;
  }
}

/* ======================= API ======================= */
class ApiError extends Error {}
async function apiGet(base, token, path, diag) {
  const url = base.replace(/\/+$/, '') + path, rec = {url, status: null, ms: null, note: ''};
  diag.push(rec);
  const t0 = Date.now(), ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
  let r;
  try {
    r = await fetch(url, {headers: {Authorization: 'Bearer ' + token, Accept: 'application/json'}, signal: ctl.signal, cache: 'no-store'});
  } catch (e) {
    rec.note = e.name === 'AbortError' ? 'Timed out' : 'Request blocked or no internet (' + e.message + ')';
    throw new ApiError('Could not reach events.vex.com (check the internet connection)');
  } finally { clearTimeout(to); }
  rec.status = r.status; rec.ms = Date.now() - t0;
  if (!r.ok) {
    const bad = 'API token rejected (invalid or expired): create a new display link with a fresh token';
    rec.note = {401: bad, 403: bad, 404: 'Not found', 429: 'Rate limited by events.vex.com'}[r.status] || 'HTTP ' + r.status;
    throw new ApiError(rec.note);
  }
  try { const j = await r.json(); rec.note = 'OK'; return j; }
  catch (e) { rec.note = 'Response was not valid JSON'; throw new ApiError(rec.note); }
}
async function apiAll(base, token, path, diag) {
  let rows = [], page = 1, last = 1;
  while (page <= last && page <= 20) {
    const j = await apiGet(base, token, path + (path.includes('?') ? '&' : '?') + 'per_page=250&page=' + page, diag);
    rows = rows.concat((j && j.data) || []);
    last = parseInt(((j && j.meta) || {}).last_page || 1, 10);
    page++;
  }
  return rows;
}
function pickDivision(divs, want) {
  want = String(want || '').trim().toLowerCase();
  if (want) for (const d of divs) if ([d.id, d.name, d.order].map(x => String(x ?? '').toLowerCase()).includes(want)) return d;
  return divs.slice().sort((a, b) => (typeof a.order === 'number' ? a.order : 0) - (typeof b.order === 'number' ? b.order : 0))[0];
}
const EVENT_CACHE = {};
async function fetchLive(entry, cfg) {
  const diag = [], m = (entry.sku || '').match(SKU_RE);
  if (!m) return {res: null, diag, err: 'Enter an event SKU such as RE-V5RC-26-1234'};
  const sku = m[0].toUpperCase(), token = cfg.token, base = cfg.apiBase || API_BASE_DEFAULT;
  if (!token) return {res: null, diag, err: 'No API token in this link (create the link again on the admin page with a token)'};
  const now = Date.now();
  let evo, div, rawMatches, rawRanks;
  try {
    const hit = EVENT_CACHE[sku];
    if (hit && now - hit[0] < 600000) evo = hit[1];
    else {
      const ev = await apiGet(base, token, '/events?sku[]=' + encodeURIComponent(sku), diag);
      if (!ev || !ev.data || !ev.data.length) throw new ApiError('No event found for SKU ' + sku);
      evo = ev.data[0]; EVENT_CACHE[sku] = [now, evo];
    }
    const divs = evo.divisions && evo.divisions.length ? evo.divisions : [{id: 1, name: 'Division 1'}];
    div = pickDivision(divs, entry.division);
    const root = '/events/' + evo.id + '/divisions/' + div.id;
    rawMatches = await apiAll(base, token, root + '/matches', diag);
    try { rawRanks = await apiAll(base, token, root + '/rankings', diag); }
    catch (e) { if (diag.length && diag[diag.length - 1].status === 404) rawRanks = []; else throw e; }
    evo._divs = divs;
  } catch (e) {
    if (e instanceof ApiError) return {res: null, diag, err: e.message};
    return {res: null, diag, err: 'Unexpected response from events.vex.com (' + e.message + ')'};
  }
  const quals = [], elimsRaw = [];
  for (const rm of rawMatches) {
    const kind = matchKind(rm); if (kind === 'skip') continue;
    const pm = parseMatch(rm); if (pm) (kind === 'qual' ? quals : elimsRaw).push(pm);
  }
  const rankings = rawRanks.map(parseRank).filter(x => x.team);
  quals.sort((a, b) => a.num - b.num || a.inst - b.inst);
  rankings.sort((a, b) => (a.rank || 9999) - (b.rank || 9999));
  const elims = assignSlots(elimsRaw);
  fillAverages(rankings, quals);
  return {res: {name: evo.name || sku, sku, matches: quals, elims, alliances: [], rankings,
                divisions: evo._divs.map(d => ({id: d.id, name: d.name || ''})), division: div.name || div.id}, diag, err: ''};
}

/* ======================= demo event ======================= */
function rng(seed) {   // small seeded PRNG (mulberry32)
  return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const randint = (r, a, b) => a + Math.floor(r() * (b - a + 1));
function sample(r, arr, k) { const a = arr.slice(); for (let i = 0; i < k; i++) { const j = i + Math.floor(r() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); }
const SEEDS16 = {1: [1, 16], 2: [8, 9], 3: [4, 13], 4: [5, 12], 5: [2, 15], 6: [7, 10], 7: [3, 14], 8: [6, 11]};
const FEEDS16 = {9: [1, 2], 10: [3, 4], 11: [5, 6], 12: [7, 8], 13: [9, 10], 14: [11, 12], 15: [13, 14]};
function simBracket(alliances, nscored, r) {
  const A = {}; alliances.forEach(a => { A[a.n] = a.teams; });
  const res = {}, out = [];
  for (let slot = 1; slot <= 15; slot++) {
    let sa = randint(r, 60, 220), sb = randint(r, 60, 220); if (sa === sb) sa++;
    let red, blue;
    if (slot <= 8) { red = A[SEEDS16[slot][0]]; blue = A[SEEDS16[slot][1]]; }
    else { const f = FEEDS16[slot]; red = res[f[0]] || null; blue = res[f[1]] || null; }
    if (!red || !blue) continue;
    const sc = Object.keys(res).length < nscored;
    if (sc) res[slot] = sa > sb ? red : blue;
    const label = slot <= 8 ? 'R16 #' + slot + '-1' : slot <= 12 ? 'QF #' + (slot - 8) + '-1' : slot <= 14 ? 'SF #' + (slot - 12) + '-1' : 'Final #1-1';
    out.push({num: slot, inst: 1, field: '', red, blue, rs: sc ? sa : null, bs: sc ? sb : null, scored: sc, rnd: 'elim', label, slot});
  }
  return out;
}
const DEMO_LUNCH_AFTER = 30, DEMO_LUNCH_LEN = 45;
const DEMO_QUAL_END = 3 * (60 - 2) + DEMO_LUNCH_LEN, DEMO_CYCLE = DEMO_QUAL_END + 15 + 5 + 3 * 15 + 15;
const DEMO_START = {hs: Date.now() / 1000, ms: Date.now() / 1000};   // demo timeline starts when the page opens
function demoData(div, now) {
  const r = rng(div === 'hs' ? 7 : 11), nTeams = div === 'hs' ? 50 : 32;
  const teams = []; for (let i = 0; i < nTeams; i++) teams.push((1000 + i * 41 + (div === 'hs' ? 0 : 9000)) + 'ABCDEFG'[i % 7]);
  const fields = div === 'hs' ? ['Field 1', 'Field 2', 'Field 3'] : ['Field 1', 'Field 2'];
  const matches = [];
  for (let n = 1; n <= 60; n++) { const four = sample(r, teams, 4);
    matches.push({num: n, inst: 1, field: fields[(n - 1) % fields.length], red: four.slice(0, 2), blue: four.slice(2), _rs: randint(r, 18, 96), _bs: randint(r, 18, 96)}); }
  const clock = ((now - DEMO_START[div]) % DEMO_CYCLE + DEMO_CYCLE) % DEMO_CYCLE, lunchAt = 3 * (DEMO_LUNCH_AFTER - 2);
  const done = clock < lunchAt ? 2 + Math.floor(clock / 3) : clock < lunchAt + DEMO_LUNCH_LEN ? DEMO_LUNCH_AFTER
             : Math.min(60, DEMO_LUNCH_AFTER + Math.floor((clock - lunchAt - DEMO_LUNCH_LEN) / 3));
  for (const m of matches) { const sc = m.num <= done; m.scored = sc; m.rs = sc ? m._rs : null; m.bs = sc ? m._bs : null;
    delete m._rs; delete m._bs; m.rnd = '2'; m.label = 'Q ' + m.num; }
  const stats = {}; teams.forEach(t => { stats[t] = {w: 0, l: 0, t: 0, wp: 0, ap: 0, sp: 0, pts: 0, n: 0}; });
  for (const m of matches) { if (!m.scored) continue;
    for (const [side, own, opp] of [['red', m.rs, m.bs], ['blue', m.bs, m.rs]]) for (const t of m[side]) {
      const st = stats[t]; st.n++; st.pts += own; st.ap += Math.floor(own / 6); st.sp += Math.floor(own / 3);
      if (own > opp) { st.w++; st.wp += 2; } else if (own < opp) st.l++; else { st.t++; st.wp += 1; } } }
  const order = teams.slice().sort((a, b) => stats[b].wp - stats[a].wp || stats[b].ap - stats[a].ap || stats[b].sp - stats[a].sp || (a < b ? -1 : 1));
  const rankings = order.map((t, i) => { const st = stats[t];
    return {rank: i + 1, team: t, w: st.w, l: st.l, t: st.t, wp: st.wp, ap: st.ap, sp: st.sp, avg: st.n ? Math.round(st.pts / st.n * 10) / 10 : 0}; });
  let alliances = [], elims = [];
  if (clock >= DEMO_QUAL_END + 15) {
    for (let i = 0; i < 16; i++) alliances.push({n: i + 1, teams: [order[i], order[31 - i]]});
    const since = clock - DEMO_QUAL_END - 15 - 5;
    elims = simBracket(alliances, since < 0 ? 0 : Math.min(15, Math.floor(since / 3) + 1), rng(5));
  }
  return {name: 'Demo ' + (div === 'hs' ? 'High School' : 'Middle School') + ' Championship', sku: 'DEMO', matches, rankings,
          elims, alliances, fields: fields.length};
}
function restartDemo() { DEMO_START.hs = DEMO_START.ms = Date.now() / 1000; }

/* ======================= phases, lunch (state kept per device) ======================= */
const STATE = {};
function stateKey(div, entry) { return 'vexdisp:' + div + ':' + (entry.demo ? 'DEMO' : ((entry.sku.match(SKU_RE) || [''])[0].toUpperCase() + ':' + entry.division)); }
function getState(div, entry) {
  const k = stateKey(div, entry);
  if (!STATE[k]) { let s = {}; if (!entry.demo) try { s = JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) {} STATE[k] = s; }
  return STATE[k];
}
function saveState(div, entry) { if (!entry.demo) try { localStorage.setItem(stateKey(div, entry), JSON.stringify(getState(div, entry))); } catch (e) {} }

function lunchEnd(entry, start) {
  const mm = String(entry.lunchResume || '').match(/^(\d{1,2}):(\d{2})$/);
  if (mm && +mm[1] < 24 && +mm[2] < 60) { const d = new Date(start * 1000); d.setHours(+mm[1], +mm[2], 0, 0); return d.getTime() / 1000; }
  return start + 60 * (entry.lunchMins || 0);
}
function lunchState(div, entry, out, now) {
  const demo = !!entry.demo, la = demo ? DEMO_LUNCH_AFTER : (entry.lunchAfter || 0);
  if (la <= 0) return null;
  const quals = out.matches || [], at = quals.find(m => m.num === la), st = getState(div, entry);
  const resumed = quals.some(m => m.num > la && m.scored);
  if (!(at && at.scored) || resumed) {
    if (st.lunch_start && !(at && at.scored)) { st.lunch_start = 0; saveState(div, entry); }
    return null;
  }
  if (!st.lunch_start) { st.lunch_start = now; saveState(div, entry); }
  const start = st.lunch_start, end = demo ? start + DEMO_LUNCH_LEN : lunchEnd(entry, start), left = end - now;
  if (end <= start || left <= 0) return null;
  const [tRank, tQueue] = demo ? [25, 5] : [300, 30];
  if (left > tRank) return {state: 'rank', end};
  if (left > tQueue) return {state: 'queue', end};
  return null;
}
function computePhase(div, entry, out, wait, now) {
  const quals = out.matches || [], elims = out.elims || [];
  const allDone = quals.length > 0 && quals.every(m => m.scored), st = getState(div, entry);
  if (allDone) { if (!st.done_at) { st.done_at = now; saveState(div, entry); } }
  else if (quals.length && st.done_at) { st.done_at = 0; saveState(div, entry); }
  const left = allDone ? Math.max(0, Math.floor((st.done_at || 0) + wait - now)) : null;
  const bracketReady = (allDone && (out.alliances || []).length >= 2) || elims.some(m => (m.red && m.red.length) || (m.blue && m.blue.length));
  let ph;
  if (['quals', 'rankings', 'bracket'].includes(entry.phase)) ph = entry.phase;
  else if (bracketReady) ph = 'bracket';
  else if (allDone && left === 0) ph = 'rankings';
  else {
    ph = 'quals';
    const lu = lunchState(div, entry, out, now);
    if (lu) { ph = 'lunch_' + lu.state; out.lunchEnd = lu.end; }
  }
  return [ph, left];
}
/* lunch: from the pre-lunch score until play resumes, events.vex.com is not called */
function lunchPaused(div, entry, now) {
  if (entry.demo || !entry.lunchAfter || !LAST_GOOD[div]) return false;
  const start = getState(div, entry).lunch_start;
  return !!start && start <= now && now < lunchEnd(entry, start);
}

const LAST_GOOD = {}, RATE_BLOCK = {};
async function getDivision(cfg, div, force) {
  const entry = cfg[div], now = Date.now() / 1000;
  let res = null, err = '', diag = [];
  const paused = !force && lunchPaused(div, entry, now);
  if (entry.demo) res = demoData(div, now);
  else if (paused) res = null;
  else if ((RATE_BLOCK[div] || 0) > now) err = 'Rate limited by events.vex.com; retrying shortly';
  else {
    const r = await fetchLive(entry, cfg); res = r.res; diag = r.diag; err = r.err;
    if (err.includes('Rate limited')) RATE_BLOCK[div] = now + 60;
  }
  let out;
  if (res) { out = Object.assign({}, res, {online: true, error: '', fetchedAt: Math.floor(now), stale: false, demo: entry.demo}); LAST_GOOD[div] = out; }
  else if (paused) out = Object.assign({}, LAST_GOOD[div], {online: true, error: '', stale: false});
  else if (LAST_GOOD[div]) out = Object.assign({}, LAST_GOOD[div], {online: false, error: err, stale: true});
  else out = {name: entry.sku ? entry.sku : 'Not configured', sku: entry.sku, matches: [], rankings: [], elims: [], alliances: [],
              online: false, error: err, fetchedAt: Math.floor(now), stale: false, demo: false};
  const wait = entry.demo ? 0 : cfg.rankWait;
  delete out.lunchEnd;
  [out.phase, out.rankingsIn] = computePhase(div, entry, out, wait, now);
  if (!entry.demo && entry.phase === 'auto') {
    if (!SKU_RE.test(entry.sku || '') || !cfg.token) out.phase = 'setup';
    else if (out.online && !out.matches.length && !out.elims.length) out.phase = 'nosched';
    else if (!out.online && !LAST_GOOD[div] && /token|SKU|reach/i.test(out.error)) out.phase = 'nodata';   // never loaded: say why
  }
  out.lunchAfter = entry.demo ? DEMO_LUNCH_AFTER : (entry.lunchAfter || 0);
  out.lunchPause = paused;
  out.serverTime = now;
  out.rankWait = wait;
  out.diag = diag;
  return out;
}

global.VEX = {DEFAULT_CFG, sanitize, toUrl, fromUrl, tokenInfo, getDivision, restartDemo, SKU_RE};
})(window);
