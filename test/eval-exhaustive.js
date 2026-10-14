/* 評牌器全列舉檢查：
   5 張牌 2,598,960 手：牌型次數、不同的值剛好 7462 種；
   7 張牌 133,784,560 手：牌型次數跟公認的數字一樣（從最好的 5 張算） */
const E = require('./engine');
const K5 = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40];
const K7 = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584];
let ok = true;
{
  const cnt = new Array(9).fill(0), vals = new Set(), h = [0, 0, 0, 0, 0];
  for (h[0] = 0; h[0] < 52; h[0]++) for (h[1] = h[0] + 1; h[1] < 52; h[1]++) for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
    for (h[3] = h[2] + 1; h[3] < 52; h[3]++) for (h[4] = h[3] + 1; h[4] < 52; h[4]++) {
      const v = E.evalCards(h, 5); cnt[E.handCat(v)]++; vals.add(v);
    }
  const good = cnt.every((x, i) => x === K5[i]) && vals.size === 7462;
  console.log('5 張：', cnt.join(' '), '不同的值', vals.size, good ? 'OK' : '錯');
  ok = ok && good;
}
{
  const t0 = Date.now(), cnt = new Float64Array(9);
  const B = [];
  for (let i = 0; i < 7; i++) B.push(new Int32Array(8));
  for (let a = 0; a < 52; a++) { B[0].fill(0); E.boardAdd(B[0], a);
    for (let b = a + 1; b < 52; b++) { B[1].set(B[0]); E.boardAdd(B[1], b);
      for (let c = b + 1; c < 52; c++) { B[2].set(B[1]); E.boardAdd(B[2], c);
        for (let d = c + 1; d < 52; d++) { B[3].set(B[2]); E.boardAdd(B[3], d);
          for (let e = d + 1; e < 52; e++) { B[4].set(B[3]); E.boardAdd(B[4], e);
            for (let f = e + 1; f < 52; f++) {
              const B4 = B[4];
              for (let g = f + 1; g < 52; g++) cnt[E.evalAdd2(B4, f, g) >>> 26]++;
            } } } } } }
  const good = Array.from(cnt).every((x, i) => x === K7[i]);
  console.log('7 張：', Array.from(cnt).join(' '), good ? 'OK' : '錯', ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
  ok = ok && good;
}
process.exit(ok ? 0 : 1);
