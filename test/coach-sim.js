/* 讓「你」照教練的建議打很多手：檢查解說、建議、評分都不會出錯；印一手完整的解說看文字 */
const E = require('./engine');
const HANDS = +(process.argv[2] || 300), SHOW = +(process.argv[3] || 1), MODE = process.argv[4] || 'coach', SEED = +(process.argv[5] || 11);
const rng = E.makeRng(SEED);
const n = 6, opp = E.makeOpponents(n, 2, rng);
const T = E.newTable({ n, names: ['你'].concat(opp.map((o) => o.name)), styles: ['tag'].concat(opp.map((o) => o.style)) });
const ctx = { hero: 0, seen: new Set() };
let advMs = 0, advN = 0, shown = 0, heroNet = 0;
const marks = { good: 0, ok: 0, bad: 0 };
const strip = (s) => s.replace(/\{c(\d+)\}/g, (m, c) => E.cardTxt(+c));
for (let h = 0; h < HANDS; h++) {
  const H = E.newHand(T, rng);
  const out = [];
  const say = (ev) => { const x = E.narrate(ev, H, ctx); out.push('■ ' + strip(x.title)); x.lines.forEach((l) => out.push('   ' + strip(l))); if (x.tip) out.push('   〔說明〕' + strip(x.tip)); };
  while (H.phase !== 'done') {
    const r = E.gameStep(H);
    if (r.need === undefined) {
      if (r.k === 'street' && !H.players[0].folded) ctx.info = E.heroInfo(H, 0, rng, 1500);
      say(r); continue;
    }
    if (r.need === 0 && MODE === 'ai') { say(E.applyAction(H, E.aiDecide(H, rng, 3))); continue; }
    if (r.need === 0) {
      const t0 = Date.now(); const adv = E.coachAdvice(H, rng); advMs += Date.now() - t0; advN++;
      out.push('   ▶ 輪到你。建議：' + adv.label); adv.reasons.forEach((x) => out.push('      ・' + strip(x)));
      const ev = E.applyAction(H, adv.act);
      const g = E.gradeAction(adv, ev); marks[g.mark]++;
      say(ev);
    } else say(E.applyAction(H, E.aiDecide(H, rng, 2)));
  }
  E.endHand(T, H);
  heroNet += H.result.net[0];
  if (shown < SHOW && !H.players[0].folded && H.board.length >= 4) { console.log(out.join('\n')); console.log('------'); shown++; }
}
console.log(MODE + ' ' + HANDS + ' 手；你贏了 ' + heroNet + '（' + (heroNet / 2 / HANDS * 100).toFixed(1) + ' 大盲/百手）；教練每次 ' + (advMs / advN).toFixed(1) + ' 毫秒；評分', JSON.stringify(marks));
