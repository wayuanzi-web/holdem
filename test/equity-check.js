/* 勝率、牌型機率、出牌數：跟先前用 treys（Python）算的數字比 */
const E = require('./engine');
const P = (s) => E.parseCards(s);
const pct = (x) => (x * 100).toFixed(1);
function mc(h, b, iters) {
  const t0 = Date.now(); const a = E.mcEquity(P(h), P(b), 8, iters, 12345);
  const eq = [1, 2, 3, 5, 8].map((N) => pct((a.win[N] + a.tie[N]) / a.n));
  return { eq, ms: Date.now() - t0, cat: Array.from(a.cat).map((x) => pct(x / a.n)) };
}
const cases = [
  ['3s4h', '', '34.9 22.5 16.4 10.7 7.6'],
  ['3s4s', '', '38.5 26.5 20.5 14.8 11.3'],
  ['3s4s', 'Kd5c6h', '39.3 31.8 28.0 23.9 20.3'],
  ['3s4s', 'Kd5c6h9h', '21.9 16.2 13.5 10.6 8.2'],
  ['3s4s', 'Kd5c6h9h2d', '97.9 95.8 93.8 89.8 84.2'],
  ['AsAh', '', '85.2(HU)'],
];
for (const [h, b, ref] of cases) {
  const r = mc(h, b, 200000);
  console.log(h, b || '(翻牌前)', '→', r.eq.join(' '), ' 參考', ref, ' ', r.ms + 'ms');
}
let t0 = Date.now();
const ex = E.exactHU(P('3s4s'), P('Kd5c6h'));
console.log('精確（對 1 家）翻牌', pct(ex.eq), Date.now() - t0 + 'ms');
t0 = Date.now();
const ex2 = E.exactHU(P('3s4s'), P('Kd5c6h9h'));
console.log('精確（對 1 家）轉牌', pct(ex2.eq), Date.now() - t0 + 'ms');
const cd = E.catDistExact(P('3s4s'), P('Kd5c6h'));
console.log('牌型（翻牌）', Array.from(cd.cat).map(pct).join(' '), 'n', cd.n, '參考 高 22.2 一對 36.6 兩對 8.3 三條 1.4 順 31.5');
const o = E.outsInfo(P('3s4s'), P('Kd5c6h'));
console.log('outs', o.total, o.groups.map((g) => g.name + ':' + g.cards.map(E.cardTxt).join('')).join('  '), '轉牌', pct(o.pNext), '到河牌', pct(o.pRiver));
console.log(E.describeHand(E.evalCards(P('3s4sKd5c6h9h2d'))), '|', E.describeHand(E.evalCards(P('AsKsQsJsTs2h3h'))), '|', E.describeHand(E.evalCards(P('KdKc5c5h9h2d3s'))));
const w = E.parseRange('22+,A2s+,K9s-K6s,AKo,QJ:0.5,AsKd@25');
console.log('範圍組合數', E.rangeCombos(w), '壞的', w.bad, E.rangeText(w).slice(0, 120));
