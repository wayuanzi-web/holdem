/* 冠軍教練：隨機打一些手，檢查建議的格式、機率在 0–1、評分；再看一個指定的偷盲情境 */
const E = require('./engine');
let bad = 0, n = 0, nSim = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('錯：', m); } };
const rng0 = E.makeRng(3), opp = E.makeOpponents(6, 2, rng0);
const T = E.newTable({ n: 6, names: ['你'].concat(opp.map((o) => o.name)), styles: ['tag'].concat(opp.map((o) => o.style)), level: 2 });
const rng = E.makeRng(9);
for (let h = 0; h < 40; h++) {
  for (const s of T.seats) s.stack = 200;
  const H = E.newHand(T, rng);
  while (H.phase !== 'done') {
    const r = E.gameStep(H);
    if (r.need === undefined) continue;
    if (r.need !== 0) { E.applyAction(H, E.aiDecide(H, rng, 2)); continue; }
    const adv = E.champAdvice(H, rng, 2), C = adv.champ;
    n++;
    ok(C && Array.isArray(C.read), '有讀牌');
    if (C.options.length) {
      ok(C.options.includes(C.best), '最好的選項在表裡');
      ok(C.options.every((o) => o.win >= -1e-9 && o.win <= 1 + 1e-9 && Number.isFinite(o.ev)), '成功率在 0–1、平均是數字：' + C.options.map((o) => o.label + ' ' + o.win + ' ' + o.ev).join('；'));
      ok(adv.act === C.best.act && adv.label === C.best.label, '建議＝最好的選項');
      ok(adv.reasons.length >= 2 && adv.reasons.every((x) => typeof x === 'string' && x.length), '有原因');
      const L = E.legalActions(H);
      ok(C.options.every((o) => o.act.t !== 'r' || (o.act.to >= L.minTo && o.act.to <= L.maxTo)), '加注大小合法');
    }
    let use = adv;
    if (h % 4 === 0 && E.champNeedSim(adv)) {                         // 整手模擬（少量次數）：格式、不偷看、併回去
      const Hs = JSON.parse(JSON.stringify(H));
      for (const q of Hs.players) if (q.seat !== 0) q.cards = [];
      Hs.deck = [];
      const sim = E.champRollout(Hs, 0, 2, E.champSimCands(adv), { N: 30 });
      ok(sim.n === 30 && sim.res.every((r) => Number.isFinite(r.ev) && r.win >= 0 && r.win <= 1), '整手模擬的結果是數字');
      use = E.champMerge(adv, sim, H);
      ok(use.champ.sim && use.champ.options.includes(use.champ.best) && use.act === use.champ.best.act, '模擬併回：最好的選項＝建議');
      nSim++;
    }
    const ev = E.applyAction(H, use.act);
    if (C.options.length) { const g = E.gradeAction(use, ev); ok(g.mark === 'good' && g.src === 'champ', '照冠軍打就是 ✓：' + g.text); }
  }
  E.endHand(T, H);
}
{ // 偷盲：按鈕、前面都棄牌，盲注是兩個岩石：爛牌也偷
  const T2 = E.newTable({ n: 6, names: ['你', 'a', 'b', 'c', 'd', 'e'], styles: ['tag', 'rock', 'rock', 'tag', 'tag', 'tag'], level: 2, button: 5 });
  // 按鈕在 0：newHand 會把按鈕往後移一位，所以先放在 5
  const H = E.newHand(T2, E.makeRng(5));
  H.players[0].cards = E.parseCards('9d4c');
  let r;
  while ((r = E.gameStep(H)).need !== 0) if (r.need !== undefined) E.applyAction(H, { t: 'f' });
  const adv = E.champAdvice(H, E.makeRng(1), 2);
  ok(H.players[0].pos === 'BTN', '你在按鈕（實際 ' + H.players[0].pos + '）');
  ok(adv.act.t === 'r' && adv.champ.best.foldAll > 0.6, '按鈕對兩個岩石偷盲（' + adv.label + '，全部棄牌 ' + Math.round(adv.champ.best.foldAll * 100) + '%）');
  ok(E.coachAdvice(H, E.makeRng(1)).act.t === 'f', '穩健教練照圖表棄 94o');
}
console.log('冠軍教練 ' + n + ' 個決定（整手模擬 ' + nSim + ' 次）' + (bad ? '，錯 ' + bad : ' OK'));
process.exit(bad ? 1 : 0);
