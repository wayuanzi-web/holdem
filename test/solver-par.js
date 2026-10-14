/* 分工求解（協調者＋幫手）要跟一個人算的一樣（前 3 次逐位比；之後只比收斂） */
const E = require('./engine');
const P = E.parseCards;
let bad = 0;
async function run(name, base, K, iters) {
  // 在同一個行程裡模擬 K 個幫手：每個幫手一個獨立的 Solver
  const helpers = [];
  const send = async (i, m) => {
    E.setHelper(helpers[i] || null);
    const r = E.helperHandle(structuredClone(m));     // 跟瀏覽器的 postMessage 一樣複製一份
    helpers[i] = E.getHelper();
    return structuredClone(r);
  };
  const one = new E.Solver(base), par = new E.ParSolver(base, K, send);
  await par.init();
  one.iterate(3); await par.iterate(3);
  const e1 = one.evs(), e2 = await par.evs(), x1 = one.exploit(), x2 = await par.exploit();
  let d = Math.max(Math.abs(e1[0] - e2[0]), Math.abs(x1.br[0] - x2.br[0]), Math.abs(x1.br[1] - x2.br[1]));
  // 節點：第 0 層、走過第一張牌、再走第二張牌；下一張牌報告
  const paths = [[], [{ a: 0 }], [{ a: 0 }, { a: 0 }, { c: base.board.length === 3 ? P('3c')[0] : P('2s')[0] }]];
  if (base.board.length === 3) paths.push([{ a: 0 }, { a: 0 }, { c: P('3c')[0] }, { a: 0 }, { a: 0 }, { c: P('2h')[0] }]);
  for (const path of paths) {
    const v1 = one.nodeView(path), v2 = await par.nodeView(path);
    for (const k of ['strat', 'evA', 'ev', 'eq', 'eqO']) if (v1[k]) for (let i = 0; i < v1[k].length; i++) d = Math.max(d, Math.abs(v1[k][i] - v2[k][i]));
    if (v1.board.join() !== v2.board.join()) { d = 9; console.log('board', v1.board, v2.board); }
  }
  const r1 = one.runouts([{ a: 0 }, { a: 0 }]), r2 = await par.runouts([{ a: 0 }, { a: 0 }]);
  const m = new Map(r1.cards.map((x) => [x.c, x]));
  if (r2.cards.length !== r1.cards.length) { d = 9; console.log('runouts 張數', r1.cards.length, r2.cards.length); }
  for (const x of r2.cards) { const y = m.get(x.c); d = Math.max(d, Math.abs(x.eq0 - y.eq0), Math.abs(x.ev[0] - y.ev[0]), ...x.freq.map((f, i) => Math.abs(f - y.freq[i]))); }
  const ok3 = d < (base.compress ? 2e-3 * base.pot : 2e-5 * (base.pot + 2 * base.stack));   // float32 加法順序不同；壓縮另外有 16 位元的誤差
  // 跑久一點：收斂程度差不多
  one.iterate(iters - 3); await par.iterate(iters - 3);
  const y1 = one.exploit(), y2 = await par.exploit();
  const okN = Math.abs(y1.pct - y2.pct) < Math.max(0.1, y1.pct * 0.08);
  if (!ok3 || !okN) bad++;
  console.log(name, 'K=' + K, ok3 && okN ? 'OK' : '✗', '前 3 次最大差', d.toExponential(2), '｜', iters, '次：一個人', y1.pct.toFixed(3) + '%', '分工', y2.pct.toFixed(3) + '%', '｜記憶體', one.memMB.toFixed(1), 'MB →', par.memMB.toFixed(1), 'MB（全部幫手）');
}
(async () => {
  const R0 = E.parseRange('22-99,A2s-AJs,K9s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,64s+,53s+,A9o-AJo,KTo+');
  const R1 = E.parseRange('22+,A2s+,K5s+,Q8s+,J8s+,T7s+,96s+,85s+,74s+,64s+,53s+,A8o+,KTo+,QTo+,JTo');
  await run('轉牌', { board: P('Kd5c6h9h'), pot: 10, stack: 40, ranges: [R0, R1], bet: { turn: [[66], [66]], river: [[75], [75]] }, raise: { turn: [['a'], ['a']], river: [['a'], ['a']] }, cap: 2 }, 3, 30);
  await run('翻牌 兩色（同構）', { board: P('Kd5d6h'), pot: 10, stack: 20, ranges: [E.parseRange('66,55,K9s,87s,A5s'), E.parseRange('KK,AKs,QQ,98s,AQs')], bet: { flop: [[50], [50]], turn: [[75], [75]], river: [[100], [100]] }, raise: { flop: [['a'], ['a']], turn: [[], []], river: [[], []] }, cap: 2 }, 4, 12);
  await run('翻牌 彩虹＋壓縮', { board: P('Kd5c6h'), pot: 10, stack: 20, compress: true, ranges: [E.parseRange('66,55,K9s,87s,A5s'), E.parseRange('KK,AKs,QQ,98s,AQs')], bet: { flop: [[50], [50]], turn: [[75], [75]], river: [[100], [100]] }, raise: { flop: [['a'], ['a']], turn: [[], []], river: [[], []] }, cap: 2 }, 2, 12);
  console.log(bad ? '分工有錯 ' + bad : '分工求解 OK');
  if (bad) process.exit(1);
})();
