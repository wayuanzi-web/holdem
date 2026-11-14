/* 冠軍教練：隨機打一些手，檢查建議的格式、機率在 0–1、評分；再看一個指定的偷盲情境 */
const E = require('./engine');
let bad = 0, n = 0, nSim = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('錯：', m); } };
/* 詳細解說印出來的算式要算得出表上的平均、成功率（跟 champCalcHTML 用同一套數字） */
function calcOk(o) {
  const c = o.calc, tol = Math.max(0.6, 0.01 * Math.abs(o.ev));
  if (!c || c.k === 'fold') return true;
  if (c.k === 'check') return Math.abs(c.eq * c.R * c.pot - o.ev) < tol;
  if (c.k === 'checkOOP') return Math.abs(c.PB * Math.max(0, c.callEV) + (1 - c.PB) * c.eqVK * c.Rk * c.pot - o.ev) < tol;
  if (c.k === 'call') return Math.abs((c.sq > 0.01 ? 1 - c.sq : 1) * (c.eq * c.R + (c.imp || 0)) * c.pot - c.cost - o.ev) < tol + (c.sq > 0 && c.sq <= 0.01 ? c.eq * c.pot * 0.011 : 0);
  if (c.k === 'raise') {
    if (Math.abs(c.evF + c.evC + c.evR - o.ev) > tol) return false;
    if (Math.abs(c.F + c.pC * c.eqC + (c.winR || 0) - o.win) > 0.015) return false;
    if (!c.avg && c.pC > 0.005 && Math.abs(c.pC * (c.eqC * (c.R !== undefined ? c.R : 1) * c.potC - (c.costC !== undefined ? c.costC : c.cost)) - c.evC) > tol) return false;
    return true;
  }
  return true;
}
let nGradeAll = 0, nGradeMid = 0, nAllin = 0;
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
      for (const o of C.options) ok(calcOk(o), '算式對得上：' + o.label + ' ' + JSON.stringify(o.calc) + ' ev ' + o.ev + ' win ' + o.win);
      const rs = C.options.filter((o) => o.act.t === 'r').sort((a, b) => a.act.to - b.act.to), pot = E.potTotal(H);
      if (rs.length) {
        ok(rs[rs.length - 1].act.to === L.maxTo, '全下也算了');
        const all = rs[rs.length - 1];
        if (all !== C.best && all.ev < C.best.ev - Math.max(1.5 * H.bb, 0.1 * pot) - 1) {   // 全下明顯比較差：評分不能是 ✓
          const g = E.champGrade(adv, { t: 'a', to: L.maxTo, potBefore: pot }); nGradeAll++;
          ok(g.mark === 'bad', '亂全下要評 ✗：' + g.text);
        }
        if (rs.length >= 2) {                                          // 兩個算過的大小中間：照比例估，不能說「一樣」
          const a = rs[rs.length - 2], b = rs[rs.length - 1], mid = Math.round((a.act.to + b.act.to) / 2);
          if (b.act.to - a.act.to > 0.2 * pot + 4) { const g = E.champGrade(adv, { t: 'r', to: mid, potBefore: pot }); nGradeMid++; ok(!/一樣/.test(g.text) && /中間估/.test(g.text), '中間的大小：' + g.text); }
        }
      }
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
      ok(!use.champ.best.extra || H.street === 3, '多算的全下只有河牌才會變成建議');
      { // 河牌：多算的全下在模擬裡明顯更好（每個世界都多贏 10 個大盲）就換；翻牌不換
        const all = sim.res.find((r) => r.act.t === 'r' && r.act.to >= adv.champ.maxTo), bestR = sim.res.find((r) => r.act.t === use.champ.best.act.t && (r.act.to || 0) === (use.champ.best.act.to || 0));
        const ex = adv.champ.options.find((o) => o.extra);
        if (all && ex && bestR && !use.champ.best.extra) {
          const fake = { n: sim.n, ms: 0, res: sim.res.map((r) => (r === all ? Object.assign({}, r, { xs: bestR.xs.map((x) => x + 10 * H.bb), ev: bestR.ev + 10 * H.bb }) : r)) };
          const u2 = E.champMerge(adv, fake, H);
          ok(H.street === 3 ? u2.champ.best.extra : !u2.champ.best.extra, '全下明顯更好：河牌換、河牌以前不換（街 ' + H.street + '）');
          nAllin++;
        }
      }
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
{ // 多下的沒人跟、退回：不算贏（成功率）；平分算一半
  const res = { pots: [{ amt: 200, winners: [1], elig: [0, 1], refund: false }, { amt: 500, winners: [0], elig: [0], refund: true }], won: [500, 200] };
  ok(E.champShare(res, 0) === 0 && E.champShare(res, 1) === 1, '退回的不算贏');
  ok(E.champShare({ pots: [{ amt: 100, winners: [0, 1], elig: [0, 1], refund: false }], won: [50, 50] }, 0) === 0.5, '平分算一半');
}
console.log('冠軍教練 ' + n + ' 個決定（整手模擬 ' + nSim + ' 次；亂全下評分 ' + nGradeAll + '、中間大小 ' + nGradeMid + '、模擬換全下 ' + nAllin + '）' + (bad ? '，錯 ' + bad : ' OK'));
process.exit(bad ? 1 : 0);
