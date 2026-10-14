/* 解析解對照：河牌，IP 只有「堅果」（KK 三條）和「空氣」（65），OOP 只有抓詐唬的 QQ。
   OOP 不能下注；IP 過牌或下注一個底池；OOP 跟或棄。
   均衡：IP 詐唬組合數 = 價值組合數 × B/(P+B) = 3 × 0.5 = 1.5；OOP 跟注頻率 = P/(P+B) = 0.5 */
const E = require('./engine');
const P = E.parseCards;
const cfg = {
  board: P('Ks7d2c4h9s'), pot: 10, stack: 100,
  ranges: [E.parseRange('QQ'), E.parseRange('KK,65')],
  bet: { river: [[], [100]] }, raise: { river: [[], []] }, addAllin: false, cap: 1,
};
const s = new E.Solver(cfg);
const t0 = Date.now();
const ex = s.solve({ target: 0.01, maxIters: 3000, every: 50 });
console.log('迭代', s.t, '可剝削度', ex.pct.toFixed(4) + '% 底池', (Date.now() - t0) + 'ms');
// IP 在 OOP 過牌之後的策略
const v = s.nodeView([{ a: 0 }]);
const H = v.hands[1];
let bluff = 0, value = 0;
for (let h = 0; h < v.n[1]; h++) {
  const name = E.comboTxt(H[h]);
  const bet = v.strat[1 * v.n[1] + h] * v.reach[1][h];
  if (/^K/.test(name)) value += bet; else bluff += bet;
}
console.log('IP 下注：價值', value.toFixed(3), '組合，詐唬', bluff.toFixed(3), '組合（理論 3、1.5）');
const v2 = s.nodeView([{ a: 0 }, { a: 1 }]);
let call = 0, tot = 0;
for (let h = 0; h < v2.n[0]; h++) { call += v2.strat[1 * v2.n[0] + h] * v2.reach[0][h]; tot += v2.reach[0][h]; }
console.log('OOP 跟注頻率', (call / tot).toFixed(3), '（理論 0.5）');
const evs = s.evs();
console.log('EV OOP', evs[0].toFixed(3), 'IP', evs[1].toFixed(3), '合計', (evs[0] + evs[1]).toFixed(3), '（= 底池 10）');
// 堅果的 EV：一半被跟 20、一半對手棄牌 10 → 15
const kk = [...H].findIndex((k) => /^K/.test(E.comboTxt(k)));
console.log('KK 的 EV', v.ev[kk].toFixed(3), '（理論 15）');
