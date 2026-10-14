/* 範圍對範圍：翻牌、轉牌、河牌跟暴力列舉一樣；空範圍不會壞 */
const E = require('./engine');
let bad = 0;
const fail = (m) => { bad++; console.log('✗', m); };
const rng = E.makeRng(42);
function randRange(nc) { const w = new Float32Array(E.NCOMBO); let k = 0; while (k < nc) { const c = (rng() * E.NCOMBO) | 0; if (w[c] > 0) continue; w[c] = [1, 0.5, 0.25][(rng() * 3) | 0]; k++; } return w; }
function ref(board, wA, wB) {
  const dead = new Set(board), rest = []; for (let c = 0; c < 52; c++) if (!dead.has(c)) rest.push(c);
  const need = 5 - board.length, runs = [];
  if (need === 0) runs.push([]); else if (need === 1) for (const c of rest) runs.push([c]); else for (let x = 0; x < rest.length; x++) for (let y = x + 1; y < rest.length; y++) runs.push([rest[x], rest[y]]);
  let T = 0, TW = 0;
  for (let h = 0; h < E.NCOMBO; h++) {
    if (!(wA[h] > 0)) continue;
    const a = E.COMBO_A[h], b = E.COMBO_B[h];
    if (dead.has(a) || dead.has(b)) continue;
    let num = 0, den = 0;
    for (const r of runs) {
      if (r.includes(a) || r.includes(b)) continue;
      const full = board.concat(r), va = E.evalCards([a, b].concat(full));
      for (let g = 0; g < E.NCOMBO; g++) {
        if (!(wB[g] > 0)) continue;
        const c = E.COMBO_A[g], d = E.COMBO_B[g];
        if (c === a || c === b || d === a || d === b || full.includes(c) || full.includes(d)) continue;
        const vb = E.evalCards([c, d].concat(full));
        den += wB[g]; num += wB[g] * (va > vb ? 1 : va === vb ? 0.5 : 0);
      }
    }
    if (den) { T += wA[h] * num; TW += wA[h] * den; }
  }
  return TW ? T / TW : -1;
}
for (const [b, na, nb] of [['Kh9s4c7d2s', 40, 40], ['Kh9s4c7d', 14, 14], ['AsKs2d', 6, 6]]) {
  const board = E.parseCards(b), wA = randRange(na), wB = randRange(nb);
  const r = E.rangeVsRange(board, wA, wB), x = ref(board, wA, wB);
  if (Math.abs(r.total - x) > 1e-9) fail(b + ' 不一樣：' + r.total + ' vs ' + x);
}
const aa = E.parseRange('AA'), kk = E.parseRange('KK'), empty = new Float32Array(E.NCOMBO);
const pre = E.rangeVsRange([], aa, kk, { iters: 4000, seed: 3 });
if (!(pre.total > 0.79 && pre.total < 0.845)) fail('AA 對 KK 翻牌前應該約 0.82：' + pre.total);
const e1 = E.rangeVsRange(E.parseCards('AsAhAd'), aa, kk);
if (e1.total !== -1 || e1.cls.length !== 169) fail('AA 全部被公牌擋掉：應該回傳 total −1 和 169 格');
const e2 = E.rangeVsRange([], empty, kk);
if (e2.total !== -1 || e2.cls.length !== 169) fail('空範圍應該回傳 total −1');
console.log(bad ? '範圍對範圍：' + bad + ' 個錯' : '範圍對範圍 OK');
process.exit(bad ? 1 : 0);
