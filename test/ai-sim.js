/* 電腦對電腦打很多手：看每種風格的入池率（VPIP）、翻牌前加注率（PFR）、攤牌率、贏多少，以及每次決定花多久 */
const E = require('./engine');
const HANDS = +(process.argv[2] || 2000), n = +(process.argv[3] || 6), level = +(process.argv[4] || 2);
const rng = E.makeRng(7);
const styles = ['tag', 'lag', 'rock', 'station', 'maniac', 'tag', 'lag', 'rock', 'station'].slice(0, n);
const T = E.newTable({ n, names: styles.map((s, i) => s + i), styles });
const st = styles.map(() => ({ hands: 0, vpip: 0, pfr: 0, sd: 0, net: 0, bets: 0, calls: 0 }));
let decisions = 0, ms = 0, bad = 0;
for (let h = 0; h < HANDS; h++) {
  const H = E.newHand(T, rng);
  const vp = new Set(), pf = new Set();
  let guard = 0;
  while (H.phase !== 'done' && guard++ < 400) {
    const r = E.gameStep(H);
    if (r.need === undefined) continue;
    const t0 = process.hrtime.bigint();
    const a = E.aiDecide(H, rng, level);
    ms += Number(process.hrtime.bigint() - t0) / 1e6; decisions++;
    const ev = E.applyAction(H, a);
    const s = st[ev.seat];
    if (ev.street === 0) {
      if ((ev.t === 'c' || ev.t === 'r' || ev.t === 'a' || ev.t === 'b') && !(ev.t === 'c' && ev.toCall === 0)) vp.add(ev.seat);
      if (ev.t === 'r' || ev.t === 'b' || (ev.t === 'a' && ev.to > ev.curBefore)) pf.add(ev.seat);
    } else { if (ev.t === 'b' || ev.t === 'r') s.bets++; if (ev.t === 'c') s.calls++; }
  }
  if (H.phase !== 'done') { bad++; continue; }
  E.endHand(T, H);
  H.players.forEach((p, i) => { st[i].hands++; st[i].net += H.result.net[i]; if (vp.has(i)) st[i].vpip++; if (pf.has(i)) st[i].pfr++; if (!H.result.uncontested && !p.folded) st[i].sd++; });
}
console.log(n + ' 人桌、強度 ' + level + '、' + HANDS + ' 手；每次決定平均 ' + (ms / decisions).toFixed(2) + ' 毫秒；沒結束的 ' + bad);
console.log('風格       入池%  加注%  攤牌%  積極度  贏（大盲/百手）');
styles.forEach((k, i) => { const s = st[i]; console.log((E.STYLES[k].zh + '      ').slice(0, 6), (s.vpip / s.hands * 100).toFixed(0).padStart(5), (s.pfr / s.hands * 100).toFixed(0).padStart(6), (s.sd / s.hands * 100).toFixed(0).padStart(6), (s.bets / Math.max(1, s.calls)).toFixed(2).padStart(7), (s.net / 2 / s.hands * 100).toFixed(1).padStart(10)); });
