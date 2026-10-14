/* 翻牌前圖表與推或棄：每張圖都讀得懂、加注優先；2–9 人每個座位、隨機動作都查得到合理的情況；審查找到的情況 */
const E = require('./engine');
let bad = 0;
const fail = (m) => { bad++; if (bad <= 12) console.log('✗', m); };
// 1. 每張圖都解析得出來，raise＋call ≤ 1
let nCharts = 0;
for (const t of ['2', '6', '9']) {
  const keys = [];
  for (const pos of E.CHART_POS[t]) keys.push(t + '/rfi/' + pos);
  for (const d of ['BB', 'SB', 'IP']) for (const g of E.OPENER_GROUPS) keys.push(t + '/vsOpen/' + d + '/' + g);
  for (const g of E.OPENER_GROUPS) keys.push(t + '/vs3bet/' + g);
  keys.push(t + '/vs4bet');
  for (const k of keys) {
    if (!E.chartText(k)) continue;
    const R = E.chartRanges(k); nCharts++;
    if (!R) { fail('讀不出來 ' + k); continue; }
    for (let c = 0; c < E.NCOMBO; c++) if (R.raise[c] + R.call[c] > 1 + 1e-6 || R.raise[c] < 0 || R.call[c] < 0) { fail('比例錯 ' + k); break; }
  }
  for (const pos of E.CHART_POS[t]) if (!E.chartText(t + '/rfi/' + pos)) fail('沒有開牌圖 ' + t + ' ' + pos);
}
// 2. 隨機牌局：每個座位查圖表、推或棄；動作要合法
const rng = E.makeRng(5);
let spots = 0, shorts = 0;
for (let i = 0; i < 300; i++) {
  const n = 2 + (i % 8);
  const T = E.newTable({ n, names: Array(n).fill('x'), styles: Array(n).fill('gto'), level: 4, button: i % n });
  T.seats.forEach((s) => { s.stack = E.GAME_BB * (rng() < 0.3 ? 3 + ((rng() * 12) | 0) : 100); });
  const H = E.newHand(T, rng);
  let g = 0;
  while (H.phase !== 'done' && g++ < 400) {
    const r = E.gameStep(H);
    if (r.need === undefined) continue;
    if (H.street === 0) {
      const ch = E.chartSpot(H, r.need), sh = E.shortSpot(H, r.need);
      if (ch) { spots++; if (!(ch.raise >= 0 && ch.call >= 0 && ch.fold >= -1e-6)) fail('chartSpot 比例錯'); }
      if (sh) { shorts++; if (sh.kind === 'call' && !(sh.need > 0 && sh.need < 1 && sh.eq >= 0 && sh.eq <= 1)) fail('shortSpot call 數字錯 ' + JSON.stringify(sh)); }
      const adv = E.coachAdvice(H, rng), L = E.legalActions(H);
      if (adv.act.t === 'r' && !L.canRaise) fail('教練建議不能做的加注');
      if (adv.act.t === 'x' && !L.canCheck) fail('教練建議不能做的過牌');
    }
    E.applyAction(H, E.aiDecide(H, rng, 4));
  }
}
if (spots < 200 || shorts < 30) fail('查到的情況太少 ' + spots + ' / ' + shorts);
// 3. 審查找到的情況
function hand(n, button, stacksBB) {
  const T = E.newTable({ n, names: Array(n).fill('x'), styles: Array(n).fill('tag'), level: 2, button });
  T.seats.forEach((s, i) => { s.stack = E.GAME_BB * stacksBB[i]; });
  const H = E.newHand(T, E.makeRng(1));
  while (H.phase !== 'bet') E.gameStep(H);
  return H;
}
const bb = E.GAME_BB;
{ // 沒進池時面對「開牌＋3-bet」：不能當成被 4-bet
  const H = hand(6, 5, [100, 100, 100, 100, 100, 100]);
  E.applyAction(H, { t: 'r', to: 2.5 * bb }); E.applyAction(H, { t: 'r', to: 8 * bb });
  if (E.chartSpot(H, H.toAct)) fail('冷 4-bet 情況不該查 vs4bet');
}
{ // 面對 100bb 全下：不用開牌圖
  const H = hand(6, 5, [100, 100, 100, 100, 100, 100]);
  while (H.toAct !== H.button) E.applyAction(H, { t: 'f' });
  E.applyAction(H, { t: 'r', to: 100 * bb });
  E.applyAction(H, { t: 'f' });
  if (E.chartSpot(H, H.toAct)) fail('面對全下不該查圖表');
}
{ // 很便宜的跟注（短碼全下只多 1 個大盲）：要跟
  const H = hand(6, 5, [100, 100, 100, 100, 100, 100]);
  const hero = H.toAct;
  E.applyAction(H, { t: 'r', to: 2.5 * bb });
  while (H.toAct !== H.bbSeat) E.applyAction(H, { t: 'f' });
  H.players[H.bbSeat].stack = 2.5 * bb - H.players[H.bbSeat].bet + 0.5 * bb;   // 大盲剩 3 個大盲：全下多一點點
  E.applyAction(H, { t: 'r', to: 3 * bb });
  H.players[hero].cards = E.parseCards('Kc7d');
  const adv = E.coachAdvice(H, E.makeRng(2));
  if (adv.act.t === 'f') fail('只差一點點的全下，K7o 不該棄牌（' + adv.label + '）');
}
{ // 短碼面對開牌：用推或棄
  const H = hand(9, 6, [100, 100, 100, 100, 100, 100, 100, 100, 10]);
  E.applyAction(H, { t: 'r', to: 2.5 * bb });
  while (H.toAct !== 8) E.applyAction(H, { t: 'f' });
  H.players[8].cards = E.parseCards('AhAd');
  const sh = E.shortSpot(H, 8), adv = E.coachAdvice(H, E.makeRng(3));
  if (!sh || sh.kind !== 'reshove' || adv.act.t !== 'r' || adv.act.to !== E.legalActions(H).maxTo) fail('短碼 AA 面對開牌要全下');
}
// 4. 對前 v% 的勝率表：AA 最強；越寬的範圍勝率越高（大致）
for (const v of [0.03, 0.1, 0.5, 1]) { const aa = E.eqVsTop(0, v); for (let g = 1; g < 169; g++) if (E.eqVsTop(g, v) > aa + 1e-9) { fail('AA 不是最強 ' + v); break; } }
if (!(E.eqVsTop(E.classIndex(5, 0, false), 1) > E.eqVsTop(E.classIndex(5, 0, false), 0.03))) fail('72o 對寬範圍應該比較好');
console.log(bad ? '圖表：' + bad + ' 個錯' : '圖表 ' + nCharts + ' 張、查了 ' + spots + ' 次圖表、' + shorts + ' 次推或棄 OK');
process.exit(bad ? 1 : 0);
