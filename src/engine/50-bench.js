/* ===== 50-bench：預設局面、效能測試 =====
   預設局面：6 人桌 100 大盲，按鈕位（BTN）開牌 2.5、大盲（BB）跟注；底池 5.5、剩 97.5（單位：大盲）。
   範圍是常見的近似，不是解出來的。 */
const RANGE_BTN_OPEN = '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,54s,A2o+,K8o+,Q9o+,J9o+,T9o';
const RANGE_BB_CALL = '22-JJ,A2s-AJs,K2s-KJs,Q4s-QJs,J6s-JTs,T6s-T9s,96s+,85s+,74s+,63s+,53s+,43s,A2o-AJo,K7o-KJo,Q8o-QJo,J8o-JTo,T8o+,98o,87o,76o';

const PRESETS = {
  river: {
    name: '河牌 K♦5♣6♥9♥2♦', board: 'Kd5c6h9h2d', pot: 5.5, stack: 97.5, tree: '下注 33%、75%、全下；加注 2.5 倍',
    bet: { river: [[33, 75], [33, 75]] }, raise: { river: [['2.5x'], ['2.5x']] }, cap: 3, target: 0.3, maxIters: 2000,
  },
  turn: {
    name: '轉牌 K♦5♣6♥9♥', board: 'Kd5c6h9h', pot: 5.5, stack: 97.5, tree: '每街一種尺寸（轉牌 66%、河牌 75%）＋全下',
    bet: { turn: [[66], [66]], river: [[75], [75]] }, raise: { turn: [['a'], ['a']], river: [['a'], ['a']] }, cap: 2, target: 0.5, maxIters: 1000,
  },
  turnBig: {
    name: '轉牌 K♦5♣6♥9♥（大樹）', board: 'Kd5c6h9h', pot: 5.5, stack: 97.5, tree: '每街兩種尺寸（轉牌 50%、100%；河牌 33%、75%）＋全下；加注 2.5 倍',
    bet: { turn: [[50, 100], [50, 100]], river: [[33, 75], [33, 75]] }, raise: { turn: [['2.5x'], ['2.5x']], river: [['2.5x'], ['2.5x']] }, cap: 3, target: 0.5, maxIters: 1000,
  },
  flop: {
    name: '翻牌 K♦5♣6♥', board: 'Kd5c6h', pot: 5.5, stack: 97.5, tree: '每街一種尺寸（翻牌 50%、轉牌 75%、河牌 75%）＋全下',
    bet: { flop: [[50], [50]], turn: [[75], [75]], river: [[75], [75]] }, raise: { flop: [['a'], ['a']], turn: [['a'], ['a']], river: [['a'], ['a']] }, cap: 2, target: 0.5, maxIters: 400,
  },
};
function presetCfg(key, over) {
  const p = Object.assign({}, PRESETS[key], over || {});
  return {
    board: parseCards(p.board), pot: p.pot, stack: p.stack,
    ranges: [parseRange(p.oop || RANGE_BB_CALL), parseRange(p.ip || RANGE_BTN_OPEN)],
    bet: p.bet, raise: p.raise, cap: p.cap, allin: 0.67, addAllin: true, maxMB: p.maxMB,
    target: p.target, maxIters: p.maxIters, name: p.name,
  };
}
function nowMs() { return (typeof performance !== 'undefined' ? performance : Date).now(); }

/* 效能測試：一項一項跑，每跑完一項呼叫 report(項目) */
function runBench(opt, report) {
  const res = [];
  const add = (r) => { res.push(r); if (report) report(r, res); };
  const rng = makeRng(2026);
  // 1. 評牌器：一百萬手隨機 7 張牌
  {
    const N = 1000000, buf = new Uint8Array(N * 7), deck = new Uint8Array(52);
    for (let c = 0; c < 52; c++) deck[c] = c;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < 7; j++) { const r = j + ((rng() * (52 - j)) | 0); const t = deck[j]; deck[j] = deck[r]; deck[r] = t; buf[i * 7 + j] = deck[j]; }
    }
    let x = 0;
    const t0 = nowMs();
    for (let i = 0; i < N; i++) x ^= evalCards(buf, 7, i * 7);
    const ms = nowMs() - t0;
    add({ key: 'eval', name: '評牌器', value: N / ms / 1000, unit: '百萬手／秒', ms, note: '隨機 7 張牌 100 萬手' + (x === -1 ? '' : '') });
  }
  // 2. 蒙地卡羅：A♠K♠ 對 8 家，20 萬次
  {
    const t0 = nowMs();
    mcEquity(parseCards('AsKs'), [], 8, 200000, 7);
    const ms = nowMs() - t0;
    add({ key: 'mc', name: '蒙地卡羅（9 人桌）', value: 200000 / ms, unit: '千次／秒', ms, note: '每次發 9 手牌比大小' });
  }
  // 3. 精確勝率：翻牌對 1 家，所有發牌 × 所有對手手牌
  {
    const t0 = nowMs();
    exactHU(parseCards('3s4s'), parseCards('Kd5c6h'));
    const ms = nowMs() - t0;
    add({ key: 'exact', name: '精確勝率（翻牌對 1 家）', value: ms, unit: '毫秒', ms, note: '1,081 種發牌 × 990 種對手手牌' });
  }
  // 4、5. 求解：河牌、轉牌（加大樹的話再一個）
  const solves = opt.big ? ['river', 'turn', 'turnBig'] : ['river', 'turn'];
  let turnRef = null;
  for (const key of solves) {
    const cfg = presetCfg(key, { maxMB: opt.maxMB || 900 });
    let s;
    const t0 = nowMs();
    try { s = new Solver(cfg); } catch (e) {
      add({ key, name: PRESETS[key].name, value: null, unit: '', note: e.message, mem: e.mem });
      continue;
    }
    const tb = nowMs() - t0;
    const st = treeStats(s.tree);
    const t1 = nowMs();
    const ex = s.solve({ target: cfg.target, maxIters: cfg.maxIters, every: 10, onStep: opt.onStep ? (t, e) => opt.onStep(key, t, e) : null });
    const ms = nowMs() - t1;
    const r = { key, name: PRESETS[key].name, tree: PRESETS[key].tree, value: ms / 1000, unit: '秒', ms, iters: s.t, pct: ex.pct, target: cfg.target, perIter: ms / s.t,
      mem: s.memMB, nodes: st, hands: s.n, build: tb };
    if (key === 'turn') turnRef = { per: r.perIter, work: estimateSolve(cfg).work, iters: s.t };
    add(r);
  }
  // 6. 翻牌：只估（用轉牌實測的每單位運算時間推）
  if (turnRef) {
    const cfg = presetCfg('flop');
    const e = estimateSolve(cfg);
    const per = turnRef.per * e.work / turnRef.work;
    add({ key: 'flop', name: PRESETS.flop.name, tree: PRESETS.flop.tree, value: per * turnRef.iters / 1000, unit: '秒（估計）', perIter: per, iters: turnRef.iters,
      mem: e.mb, nodes: e.stats, hands: e.n, estimate: true, note: '照轉牌實測推估：記憶體 ' + Math.round(e.mb) + ' MB、每次約 ' + (per / 1000).toFixed(1) + ' 秒' });
  }
  return res;
}
