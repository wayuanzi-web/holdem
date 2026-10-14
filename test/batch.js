/* 多翻牌報告：代表翻牌的權重、分類、一列的彙整（EV 加起來是底池、比例加起來是 1） */
const E = require('./engine');
let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.log('✗', msg); } };
for (const k of Object.keys(E.BATCH_SETS)) {
  const fl = E.BATCH_SETS[k].flops, w = E.flopWeights(fl);
  ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9, k + ' 權重加起來不是 1');
  ok(w.every((x) => x > 0.005), k + ' 有代表翻牌幾乎沒有權重');
  ok(new Set(fl).size === fl.length && fl.every((b) => E.parseCards(b).length === 3 && new Set(E.parseCards(b)).size === 3), k + ' 翻牌寫錯');
}
const g = E.flopGroups('As5d5s');
ok(g.high === 'A 高' && g.pair === '有對子' && g.suit === '兩張同花', '分類錯 ' + JSON.stringify(g));
ok(E.flopGroups('8s6s4s').suit === '單色（三張同花）' && E.flopGroups('8s6s4s').high === '10 以下', '單色分類錯');
(async () => {
  for (const b of ['Kh9s4c', '8s6s4s', '7s7d2c']) {
    const cfg = E.presetCfg('flop3bet', { board: b });
    cfg.ranges = [E.parseRange('AA,AKs,76s'), E.parseRange('QQ,AQs')];
    const s = new E.Solver(cfg);
    s.solve({ target: 3, maxIters: 30 });
    const r = await E.batchRow(s);
    ok(Math.abs(r.ev[0] + r.ev[1] - r.pot) < 0.01 * r.pot, b + ' EV 加起來不是底池');
    for (const nd of [r.oop, r.ipx]) ok(nd && Math.abs(nd.freq.reduce((a, x) => a + x, 0) - 1) < 1e-3, b + ' 動作比例加起來不是 1');
    ok(r.eq0 > 0 && r.eq0 < 1 && E.betFreq(r.oop) >= 0 && E.betFreq(r.oop) <= 1.0001, b + ' 數字超出範圍');
    const a = E.batchAvg([{ w: 0.3, row: r }, { w: 0.7, row: r }]);
    ok(Math.abs(a.bet0 - E.betFreq(r.oop)) < 1e-9 && Math.abs(a.ev0 + a.ev1 - 1) < 0.01, b + ' 加權平均錯');
  }
  console.log(bad ? '多翻牌報告：' + bad + ' 個錯' : '多翻牌報告 OK');
  process.exit(bad ? 1 : 0);
})();
