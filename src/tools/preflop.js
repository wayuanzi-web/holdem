/* 預先算好翻牌前 169 手起手牌的資料，寫成 src/engine/35-preflop-data.js
   - 對 1–8 家隨機手牌：獨贏機率、平手分到的份數（蒙地卡羅，每手 TRIALS 次）
   - 到河牌的牌型機率（精確：所有 C(50,5) 種公牌）
   - 對 N 家的名次（1 最好）
   node src/tools/preflop.js [每手模擬次數，預設 1000000] */
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path'), fs = require('fs'), os = require('os');
const E = require(path.join(__dirname, '..', '..', 'test', 'engine'));
const N = 8;

function heroOf(g) {                       // 這一格的一手代表牌（花色不影響對隨機手牌的勝率）
  const row = (g / 13) | 0, col = g % 13;
  if (row === col) { const r = 12 - row; return [E.cardOf(r, 0), E.cardOf(r, 1)]; }
  if (row < col) return [E.cardOf(12 - row, 0), E.cardOf(12 - col, 0)];
  return [E.cardOf(12 - col, 0), E.cardOf(12 - row, 1)];
}
function work(g, trials) {
  const hero = heroOf(g);
  const a = E.mcEquity(hero, [], N, trials, 1000 + g * 7919);
  const win = [], tie = [];
  for (let k = 1; k <= N; k++) { win.push(a.win[k] / a.n); tie.push(a.tie[k] / a.n); }
  // 牌型：精確列舉 5 張公牌
  const deck = E.deckWithout(hero), cat = new Float64Array(9), B = new Int32Array(8), d = deck, n = d.length;
  const H = E.boardState(hero);
  let tot = 0;
  const B1 = new Int32Array(8), B2 = new Int32Array(8), B3 = new Int32Array(8);
  for (let i = 0; i < n; i++) { B1.set(H); E.boardAdd(B1, d[i]);
    for (let j = i + 1; j < n; j++) { B2.set(B1); E.boardAdd(B2, d[j]);
      for (let k = j + 1; k < n; k++) { B3.set(B2); E.boardAdd(B3, d[k]);
        for (let l = k + 1; l < n; l++) for (let m = l + 1; m < n; m++) { cat[E.evalAdd2(B3, d[l], d[m]) >>> 26]++; tot++; } } } }
  return { g, win, tie, cat: Array.from(cat, (x) => x / tot) };
}

if (isMainThread) {
  const trials = +(process.argv[2] || 1000000);
  const nw = Math.max(1, os.cpus().length);
  const res = new Array(169);
  let next = 0, done = 0;
  const t0 = Date.now();
  const finish = () => {
    const I = (x) => Math.round(x * 1e4);
    const win = [], tie = [], cat = [], rank = new Array(169 * N);
    for (let g = 0; g < 169; g++) { win.push(...res[g].win.map(I)); tie.push(...res[g].tie.map(I)); cat.push(...res[g].cat.map(I)); }
    for (let k = 0; k < N; k++) {
      const order = [...Array(169).keys()].sort((a, b) => (res[b].win[k] + res[b].tie[k]) - (res[a].win[k] + res[a].tie[k]));
      order.forEach((g, i) => { rank[g * N + k] = i + 1; });
    }
    const out = '/* ===== 35-preflop-data：翻牌前 169 手起手牌的預算資料（src/tools/preflop.js 產生，不要手改） =====\n' +
      '   win／tie：對 1–8 家隨機手牌的獨贏機率、平手分到的份數（× 10000，每手模擬 ' + trials + ' 次）；\n' +
      '   cat：到河牌的牌型機率（× 10000，精確列舉）；rank：對 N 家的名次（1 最好） */\n' +
      'const PREFLOP = {N: ' + N + ', trials: ' + trials + ',\n' +
      'win: [' + win.join(',') + '],\n' +
      'tie: [' + tie.join(',') + '],\n' +
      'cat: [' + cat.join(',') + '],\n' +
      'rank: [' + rank.join(',') + ']};\n';
    fs.writeFileSync(path.join(__dirname, '..', 'engine', '35-preflop-data.js'), out);
    console.log('寫好了', out.length, 'bytes，', ((Date.now() - t0) / 1000).toFixed(0), '秒');
  };
  for (let w = 0; w < nw; w++) {
    const wk = new Worker(__filename, { workerData: { trials } });
    const feed = () => { if (next < 169) wk.postMessage(next++); else wk.terminate(); };
    wk.on('message', (r) => { res[r.g] = r; done++; if (done % 20 === 0) console.log(done, '/ 169'); if (done === 169) finish(); feed(); });
    feed();
  }
} else {
  parentPort.on('message', (g) => parentPort.postMessage(work(g, workerData.trials)));
}
