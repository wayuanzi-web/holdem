/* 在 Node 跑同一套效能測試（這台雲端機器的數字，給手機、電腦的數字當參考） */
const E = require('./engine');
const flop = process.argv.includes('flop');
E.runBench({ big: process.argv.includes("big"), maxMB: 3000 }, (r) => {
  const f = (x, d = 1) => (x === null || x === undefined) ? '—' : (+x).toFixed(d);
  if (r.key === 'eval' || r.key === 'mc' || r.key === 'exact') console.log(r.name.padEnd(16), f(r.value, 2), r.unit);
  else console.log(r.name, '| 秒', f(r.value, 2), '| 迭代', r.iters, '| 可剝削度', f(r.pct, 3) + '%', '| 每次', f(r.perIter, 1) + 'ms',
    '| 記憶體', f(r.mem, 0) + 'MB', '| 手牌', r.hands && r.hands.join('/'), '| 決策點', r.nodes && r.nodes.act.join('/'), r.est300 ? '| 估 300 次 ' + f(r.est300, 0) + ' 秒' : '', r.note || '');
});
