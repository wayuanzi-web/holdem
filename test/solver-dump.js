/* 解一個局面（不一定解完），把樹、雙方手牌、平均策略、JS 算的最佳反應值和 EV 寫成 JSON，給 Python 獨立重算 */
const E = require('./engine'), fs = require('fs');
const [, , which, outFile] = process.argv;
const P = E.parseCards;
const spots = {
  river: { board: P('Kd5c6h9h2d'), pot: 5.5, stack: 97.5,
    ranges: [E.parseRange('22-99,A2s-AJs,K9s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,64s+,53s+,43s,A9o-AJo,KTo+,QTo+'),
             E.parseRange('22+,A2s+,K5s+,Q8s+,J8s+,T7s+,96s+,85s+,74s+,64s+,53s+,A8o+,KTo+,QTo+,JTo')],
    bet: { river: [[33, 75], [33, 75]] }, raise: { river: [['2.5x'], ['2.5x']] }, cap: 3, iters: 60 },
  turn: { board: P('Kd5c6h9h'), pot: 5.5, stack: 30,
    ranges: [E.parseRange('99,66,55,K9s,76s,87s,A5s,43s,T8s'), E.parseRange('KK,AK,KQs,QQ,JTs,98s,A4s,77')],
    bet: { turn: [[50], [50, 100]], river: [[75], [75]] }, raise: { turn: [['3x'], ['3x']], river: [['a'], ['a']] }, cap: 2, iters: 25 },
  flop: { board: P('Kd5c6h'), pot: 5.5, stack: 20,
    ranges: [E.parseRange('66,K9s,87s,43s'), E.parseRange('KK,AKs,QQ,98s')],
    bet: { flop: [[50], [50]], turn: [[75], [75]], river: [[100], [100]] }, raise: { flop: [['a'], ['a']], turn: [[], []], river: [[], []] }, cap: 2, iters: 12 },
};
const cfg = spots[which];
const s = new E.Solver(cfg);
s.iterate(cfg.iters);
const ex = s.exploit(), ev = s.evs();
const strat = {};
for (const nd of s.nodes) {
  if (nd.kind !== E.N_ACT) continue;
  const arr = [], buf = new Float32Array(nd.k * nd.nh);
  const cnt = Math.pow(s.D, nd.level);
  for (let i = 0; i < cnt; i++) {
    if (s.lslot(nd.level, i) < 0) { arr.push(new Array(nd.k * nd.nh).fill(+(1 / nd.k).toFixed(7))); continue; }   // 不可能的發牌（同一張牌兩次）
    s.avgStrat(nd, i, buf); arr.push(Array.from(buf, (x) => +x.toFixed(7)));
  }
  strat[nd.id] = arr;
}
const dump = {
  board: s.board, pot: s.P0, deck: Array.from(s.deck),
  hands: [0, 1].map((p) => Array.from(s.H[p], (k) => [E.COMBO_A[k], E.COMBO_B[k]])),
  w: [0, 1].map((p) => Array.from(s.W[p])),
  nodes: s.nodes.map((nd) => ({ id: nd.id, kind: nd.kind, p: nd.p, level: nd.level, inv0: nd.inv0, inv1: nd.inv1, k: nd.k, kids: nd.kids ? nd.kids.map((x) => x.id) : [] })),
  strat, js: { br: ex.br, ev, pct: ex.pct, iters: s.t },
};
fs.writeFileSync(outFile, JSON.stringify(dump));
console.log(which, '節點', s.nodes.length, '手牌', s.n, '迭代', s.t, 'JS 最佳反應', ex.br.map((x) => x.toFixed(6)), 'EV', ev.map((x) => x.toFixed(6)), '可剝削度', ex.pct.toFixed(3) + '%');
