/* ===== 90-worker：背景執行緒（勝率、求解、效能測試都在這裡跑，畫面不會卡） ===== */
let SOL = null, SOL_ID = 0, stopFlag = false, calcToken = 0;
const tick = () => new Promise((r) => setTimeout(r, 0));

function drawsOf(o) {
  if (!o) return '';
  const st = o.groups.filter((g) => g.strong);
  const fl = st.find((g) => g.cat === 5), sr = st.find((g) => g.cat === 4);
  const parts = [];
  if (fl && fl.cards.length >= 8) parts.push('同花聽牌');
  if (sr) parts.push(sr.cards.length >= 8 ? '兩頭順聽牌' : '卡順聽牌');
  return parts.join('＋');
}

async function doCalc(m) {
  const token = ++calcToken;
  const hero = m.hero, board = m.board, maxOpp = m.maxOpp || 8;
  const out = { cmd: 'calc', token, hero, board };
  if (board.length === 0) {
    const g = preflopClassOf(hero);
    out.pre = preflopLookup(g);
    out.cls = g;
    out.final = true;
    postMessage(out);
    return;
  }
  const all = hero.concat(board);
  const v = evalCards(all);
  out.cur = { cat: handCat(v), txt: describeHand(v) };
  out.exact = exactHU(hero, board, null);
  const cd = catDistExact(hero, board);
  out.cat = cd ? Array.from(cd.cat) : null;
  out.outs = outsInfo(hero, board);
  out.draws = drawsOf(out.outs);
  postMessage(out);
  // 多人：蒙地卡羅，一段一段加，隨時可以被新的計算取代
  const acc = { n: 0, win: new Float64Array(maxOpp + 1), tie: new Float64Array(maxOpp + 1), tieP: new Float64Array(maxOpp + 1), cat: new Float64Array(9) };
  const total = m.mcIters || 300000;
  let seed = 1 + (Date.now() & 0xffff);
  while (acc.n < total) {
    await tick();
    if (token !== calcToken) return;
    mcEquity(hero, board, maxOpp, 25000, seed++, acc);
    postMessage({ cmd: 'calcmc', token, n: acc.n, win: Array.from(acc.win), tie: Array.from(acc.tie), tieP: Array.from(acc.tieP), done: acc.n >= total });
  }
}

/* ===== 幫手（別的背景執行緒）：畫面建好後把 MessagePort 交給這裡 ===== */
let PORTS = [], REQ = 0;
const PENDING = new Map();
function setPorts(ports) {
  PORTS = ports;
  for (const pt of ports) pt.onmessage = (e) => { const f = PENDING.get(e.data.req); if (f) { PENDING.delete(e.data.req); f(e.data.r); } };
}
function sendHelper(i, msg) {
  return new Promise((res) => { const req = ++REQ; PENDING.set(req, res); PORTS[i].postMessage({ req, msg }); });
}
/* 這個背景執行緒當幫手 */
function beHelper(port) {
  port.onmessage = (e) => {
    let r;
    try { r = helperHandle(e.data.msg); } catch (err) { r = { error: String((err && err.message) || err) }; }
    port.postMessage({ req: e.data.req, r });
  };
}

async function doSolve(m) {
  stopFlag = false;
  if (m.resume && SOL) return runSolve(SOL, m, true);
  const cfg = m.preset ? presetCfg(m.preset, { maxMB: m.maxMB || 1200 }) : m.cfg;
  let s;
  const t0 = nowMs();
  SOL = null; SOL_ID++;                                        // 先放掉舊的，記憶體才夠
  const k = Math.min(PORTS.length, m.threads || PORTS.length);
  try {
    if (k >= 2 && cfg.board.length <= 4) {
      const total = estimateSolve(cfg).mb;
      if (cfg.maxMB && total > cfg.maxMB) { const e = new Error('記憶體不夠：這棵樹要 ' + Math.round(total) + ' MB'); e.mem = total; throw e; }
      s = new ParSolver(cfg, k, sendHelper);
      await s.init();
    } else s = new Solver(cfg);
  } catch (e) { postMessage({ cmd: 'solve-error', tag: m.tag, msg: e.message, mem: e.mem }); return; }
  SOL = s;
  postMessage({ cmd: 'solve-start', id: SOL_ID, tag: m.tag, mem: s.memMB, stats: treeStats(s.tree), hands: s.n, build: nowMs() - t0, threads: s.k || 1, target: cfg.target, maxIters: cfg.maxIters });
  return runSolve(s, m, false);
}
async function runSolve(s, m, resumed) {
  const id = resumed ? SOL_ID : SOL_ID;
  const cfg = s.cfg;
  const target = m.target || cfg.target || 0.5, maxIters = s.t + (m.maxIters || cfg.maxIters || 1000);
  const t1 = nowMs(), t0 = s.t;
  let ex = null, lastYield = nowMs();
  if (resumed) postMessage({ cmd: 'solve-start', id, tag: m.tag, mem: s.memMB, stats: treeStats(s.tree), hands: s.n, build: 0, threads: s.k || 1, resumed: true });
  while (s.t < maxIters) {
    await s.iterate(1);
    if ((s.t - t0) % 10 === 0 || s.t === maxIters) {
      ex = await s.exploit();
      postMessage({ cmd: 'solve-progress', id, tag: m.tag, t: s.t, t0, pct: ex.pct, ms: nowMs() - t1 });
      if (ex.pct <= target) break;
    }
    if (s.k || nowMs() - lastYield > 150) { if (!s.k) await tick(); lastYield = nowMs(); if (stopFlag || id !== SOL_ID) break; }
  }
  if (!ex) ex = await s.exploit();
  const evs = await s.evs();
  postMessage({ cmd: 'solve-done', id, tag: m.tag, t: s.t, t0, pct: ex.pct, ms: nowMs() - t1, ev: evs, stopped: stopFlag, threads: s.k || 1 });
}

/* ===== 多翻牌報告：一個翻牌一個翻牌算，每算好一個回報一列（會清掉工作室現在的解） ===== */
async function doBatch(m) {
  stopFlag = false;
  SOL = null; const id = ++SOL_ID;
  const k = Math.min(PORTS.length, m.threads || 0);
  for (let i = m.from || 0; i < m.flops.length; i++) {
    if (stopFlag || id !== SOL_ID) break;
    const cfg = Object.assign({}, m.cfg, { board: parseCards(m.flops[i]) });
    const t0 = nowMs();
    let s;
    try {
      if (k >= 2) { s = new ParSolver(cfg, k, sendHelper); await s.init(); } else s = new Solver(cfg);
    } catch (e) { postMessage({ cmd: 'batch-row', tag: m.tag, i, error: e.message }); continue; }
    let ex = null, lastYield = nowMs();
    while (s.t < cfg.maxIters) {
      await s.iterate(1);
      if (s.t % 10 === 0 || s.t === cfg.maxIters) {
        ex = await s.exploit();
        postMessage({ cmd: 'batch-prog', tag: m.tag, i, t: s.t, pct: ex.pct, ms: nowMs() - t0 });
        if (ex.pct <= cfg.target) break;
      }
      if (s.k || nowMs() - lastYield > 150) { if (!s.k) await tick(); lastYield = nowMs(); if (stopFlag || id !== SOL_ID) break; }
    }
    if (stopFlag || id !== SOL_ID) break;                       // 算到一半停：這一個不算數
    if (!ex) ex = await s.exploit();
    const row = await batchRow(s);
    postMessage({ cmd: 'batch-row', tag: m.tag, i, row, pct: ex.pct, t: s.t, ms: nowMs() - t0, threads: s.k || 1 });
    s = null;
  }
  postMessage({ cmd: 'batch-done', tag: m.tag, stopped: stopFlag });
}

async function doRunouts(m) {
  if (!SOL) { postMessage({ cmd: 'runouts', req: m.req, none: true }); return; }
  const t0 = nowMs();
  const r = await SOL.runouts(m.path || []);
  postMessage({ cmd: 'runouts', req: m.req, ms: nowMs() - t0, data: r });
}

async function doView(m) {
  if (!SOL) { postMessage({ cmd: 'view', req: m.req, none: true }); return; }
  const t0 = nowMs();
  const v = await SOL.nodeView(m.path || []);
  v.cmd = 'view'; v.req = m.req; v.ms = nowMs() - t0;
  v.hands = [Array.from(SOL.H[0]), Array.from(SOL.H[1])];
  v.reach = [Array.from(v.reach[0]), Array.from(v.reach[1])];
  for (const k of ['strat', 'evA', 'ev', 'comp', 'eq', 'eqO']) if (v[k]) v[k] = Array.from(v[k]);
  v.P0 = SOL.P0; v.stack = SOL.cfg.stack;
  postMessage(v);
}
/* ===== 牌局用的解（第五步）：另外一個背景執行緒專門算，邊算邊回答「這手牌在這裡怎麼打」 ===== */
let GSOL = null;
async function gStart(m) {
  const me = GSOL = { key: m.key, s: null, pct: 999, done: false, target: m.cfg.target, maxIters: m.cfg.maxIters };
  try { me.s = new Solver(m.cfg); } catch (e) { postMessage({ cmd: 'g-progress', key: m.key, error: e.message }); return; }
  const s = me.s;
  let last = nowMs();
  const t0 = nowMs();
  while (GSOL === me && !me.done) {
    s.iterate(1);
    if (s.t === 5 || s.t % 10 === 0) {
      const ex = s.exploit();
      me.pct = ex.pct;
      if (ex.pct <= me.target || s.t >= me.maxIters) me.done = true;
      postMessage({ cmd: 'g-progress', key: me.key, t: s.t, pct: ex.pct, done: me.done, ms: nowMs() - t0 });
    }
    if (nowMs() - last > 50) { await tick(); last = nowMs(); }
  }
}
/* 問：path 走到的節點，第 p 個人拿 combo 這手牌的策略（ev:true 再加每個動作的 EV）；reach:true 回傳雙方的範圍 */
function gQuery(m) {
  const me = GSOL, base = { cmd: 'g-ans', req: m.req, key: m.key };
  if (!me || me.key !== m.key || !me.s || me.s.t < 1) { postMessage(Object.assign(base, { none: true, why: 'notready' })); return; }
  const s = me.s, L = s.locate(m.path);
  if (L.used !== m.path.length) { postMessage(Object.assign(base, { none: true, why: 'path' })); return; }
  const info = { t: s.t, pct: me.pct, done: me.done };
  if (m.reach) {
    const out = [0, 1].map((p) => { const r = s.unperm(p, L.sig, L.reach[p]), w = new Float32Array(NCOMBO); for (let h = 0; h < s.n[p]; h++) w[s.H[p][h]] = r[h]; return w; });
    postMessage(Object.assign(base, info, { reach: out }));
    return;
  }
  const nd = L.nd;
  if (nd.kind !== N_ACT || nd.p !== m.p) { postMessage(Object.assign(base, { none: true, why: 'node' })); return; }
  const p = nd.p, h = s.idx[p][m.combo];
  if (h < 0) { postMessage(Object.assign(base, { none: true, why: 'combo' })); return; }
  const acts = nd.acts.map((a) => ({ t: a.t, add: a.add, to: a.to, label: actLabel(a) }));
  const k = nd.k, n = nd.nh;
  let freq, ev = null;
  if (m.ev) {
    const v = s.viewAt(L);
    freq = []; ev = [];
    for (let a = 0; a < k; a++) { freq.push(v.strat[a * n + h]); ev.push(v.evA[a * n + h] + v.inv[p]); }
    info.eq = v.eq[h];
  } else {
    const buf = new Float32Array(k * n), hc = s.permFor(p, L.sig)[h];
    s.avgStrat(nd, L.inst, buf);
    freq = []; for (let a = 0; a < k; a++) freq.push(buf[a * n + hc]);
  }
  postMessage(Object.assign(base, info, { p, acts, freq, ev, pot: s.P0 + nd.inv0 + nd.inv1 }));
}

/* 範圍對範圍 */
function doRvr(m) {
  const t0 = nowMs();
  const r = rangeVsRange(m.board, Float32Array.from(m.a), Float32Array.from(m.b), { iters: m.iters || 3000 });
  postMessage({ cmd: 'rvr', req: m.req, total: r.total, cls: r.cls, nA: r.nA, nB: r.nB, boards: r.boards, ms: nowMs() - t0 });
}

function doLock(m) {
  if (!SOL) return;
  const ok = SOL.setLock(m.id, m.strat ? Float32Array.from(m.strat) : null);
  postMessage({ cmd: 'locked', id: m.id, ok, on: !!m.strat });
}

async function doBench(m) {
  postMessage({ cmd: 'bench-start' });
  await tick();
  const res = runBench({ big: !!m.big, maxMB: m.maxMB || 1200, onStep: (key, t, e) => postMessage({ cmd: 'bench-step', key, t, pct: e.pct }) },
    (r) => postMessage({ cmd: 'bench-item', r }));
  // 翻牌 3-bet 底池：一個執行緒 vs 好幾個一起算（各跑 3 次迭代）
  try {
    const cfg = presetCfg('flop3bet', { maxMB: 0 }), IT = 3;
    postMessage({ cmd: 'bench-step', key: 'flop3bet', t: 0, pct: 0 });
    const one = new Solver(cfg);
    let t0 = nowMs(); one.iterate(IT); const per1 = (nowMs() - t0) / IT;
    const r = { key: 'par', name: PRESETS.flop3bet.name, tree: PRESETS.flop3bet.tree, per1, k: PORTS.length, mem: one.memMB, hands: one.n };
    SOL = null;
    if (PORTS.length >= 2) {
      const par = new ParSolver(cfg, PORTS.length, sendHelper);
      await par.init();
      t0 = nowMs(); await par.iterate(IT); r.perK = (nowMs() - t0) / IT;
    }
    r.value = (r.perK || r.per1) * 100 / 1000;                  // 到 1% 大約 100 次
    res.push(r); postMessage({ cmd: 'bench-item', r });
  } catch (e) { postMessage({ cmd: 'bench-item', r: { key: 'par', name: '翻牌分工', value: null, note: e.message } }); }
  postMessage({ cmd: 'bench-done', res });
}

onmessage = (e) => {
  const m = e.data;
  try {
    if (m.cmd === 'calc') doCalc(m);
    else if (m.cmd === 'solve') doSolve(m).catch((err) => postMessage({ cmd: 'solve-error', tag: m.tag, msg: String((err && err.message) || err) }));
    else if (m.cmd === 'stop') stopFlag = true;
    else if (m.cmd === 'view') doView(m).catch((err) => postMessage({ cmd: 'error', req: m.req, of: 'view', msg: String((err && err.message) || err) }));
    else if (m.cmd === 'runouts') doRunouts(m).catch((err) => postMessage({ cmd: 'error', req: m.req, of: 'runouts', msg: String((err && err.message) || err) }));
    else if (m.cmd === 'lock') doLock(m);
    else if (m.cmd === 'rvr') doRvr(m);
    else if (m.cmd === 'batch') doBatch(m).catch((err) => postMessage({ cmd: 'batch-done', tag: m.tag, error: String((err && err.message) || err) }));
    else if (m.cmd === 'g-start') gStart(m).catch((err) => postMessage({ cmd: 'g-progress', key: m.key, error: String((err && err.message) || err) }));
    else if (m.cmd === 'g-query') gQuery(m);
    else if (m.cmd === 'g-stop') GSOL = null;
    else if (m.cmd === 'ports') setPorts(m.ports);
    else if (m.cmd === 'helper') beHelper(m.port);
    else if (m.cmd === 'bench') doBench(m);
  } catch (err) { postMessage({ cmd: 'error', req: m.req, of: m.cmd, msg: String((err && err.message) || err) }); }
};
postMessage({ cmd: 'ready' });
