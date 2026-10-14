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

async function doSolve(m) {
  stopFlag = false;
  const cfg = m.preset ? presetCfg(m.preset, { maxMB: m.maxMB || 1200 }) : m.cfg;
  let s;
  const t0 = nowMs();
  try { s = new Solver(cfg); } catch (e) { postMessage({ cmd: 'solve-error', msg: e.message, mem: e.mem }); return; }
  SOL = s; SOL_ID++;
  const id = SOL_ID;
  postMessage({ cmd: 'solve-start', id, mem: s.memMB, stats: treeStats(s.tree), hands: s.n, build: nowMs() - t0, target: cfg.target, maxIters: cfg.maxIters });
  const target = m.target || cfg.target || 0.5, maxIters = m.maxIters || cfg.maxIters || 1000;
  const t1 = nowMs();
  let ex = null, lastYield = nowMs();
  while (s.t < maxIters) {
    s.iterate(1);
    if (s.t % 10 === 0 || s.t === maxIters) {
      ex = s.exploit();
      postMessage({ cmd: 'solve-progress', id, t: s.t, pct: ex.pct, ms: nowMs() - t1 });
      if (ex.pct <= target) break;
    }
    if (nowMs() - lastYield > 150) { await tick(); lastYield = nowMs(); if (stopFlag || id !== SOL_ID) break; }
  }
  if (!ex) ex = s.exploit();
  const evs = s.evs();
  postMessage({ cmd: 'solve-done', id, t: s.t, pct: ex.pct, ms: nowMs() - t1, ev: evs, stopped: stopFlag });
}

function doView(m) {
  if (!SOL) { postMessage({ cmd: 'view', req: m.req, none: true }); return; }
  const t0 = nowMs();
  const v = SOL.nodeView(m.path || []);
  v.cmd = 'view'; v.req = m.req; v.ms = nowMs() - t0;
  v.hands = [Array.from(SOL.H[0]), Array.from(SOL.H[1])];
  v.reach = [Array.from(v.reach[0]), Array.from(v.reach[1])];
  for (const k of ['strat', 'evA', 'ev', 'comp', 'eq', 'eqO']) if (v[k]) v[k] = Array.from(v[k]);
  v.P0 = SOL.P0; v.stack = SOL.cfg.stack;
  postMessage(v);
}

async function doBench(m) {
  postMessage({ cmd: 'bench-start' });
  await tick();
  const res = runBench({ big: !!m.big, maxMB: m.maxMB || 1200, onStep: (key, t, e) => postMessage({ cmd: 'bench-step', key, t, pct: e.pct }) },
    (r) => postMessage({ cmd: 'bench-item', r }));
  postMessage({ cmd: 'bench-done', res });
}

onmessage = (e) => {
  const m = e.data;
  try {
    if (m.cmd === 'calc') doCalc(m);
    else if (m.cmd === 'solve') doSolve(m);
    else if (m.cmd === 'stop') stopFlag = true;
    else if (m.cmd === 'view') doView(m);
    else if (m.cmd === 'bench') doBench(m);
  } catch (err) { postMessage({ cmd: 'error', msg: String((err && err.message) || err) }); }
};
postMessage({ cmd: 'ready' });
