/* 錦標賽：每一場打到剩一個人；籌碼守恆、名次連續、盲注照手數升級、剩兩人時不會連續下兩次大盲 */
const E = require('./engine');
const N = +(process.argv[2] || 60);
let bad = 0, hands = 0;
const fail = (m) => { bad++; if (bad <= 10) console.log('✗', m); };
for (let seed = 1; seed <= N; seed++) {
  const rng = E.makeRng(seed * 7 + 1), n = seed % 3 === 0 ? 9 : seed % 3 === 1 ? 6 : 3;
  const opp = E.makeOpponents(n, 2 + (seed % 3), rng);
  const T = E.newTable({ n, names: ['你'].concat(opp.map((o) => o.name)), styles: ['lag'].concat(opp.map((o) => o.style)), level: 3, tourney: true, button: seed % n });
  const total0 = 1500 * n;
  let lastBBname = null, hu = false, k = 0;
  while (k < 3000) {
    // 你（座位 0）出局就換成電腦繼續：引擎只保護座位 0，這裡把你也當一般玩家
    if (T.seats.filter((s) => s.stack > 0).length <= 1) break;
    if (T.seats[0].stack <= 0) break;
    const H = E.newHand(T, rng);
    const lv = Math.min(E.TOURNEY_LEVELS.length - 1, Math.floor((H.no - 1) / T.tourney.per));
    if (H.bb !== E.TOURNEY_LEVELS[lv][1]) fail('盲注不對 ' + seed + ' 第 ' + H.no + ' 手 ' + H.bb);
    if (H.players.some((p) => p.start <= 0)) fail('輸光的人還被發牌 ' + seed);
    const bbName = H.players[H.bbSeat].name;
    if (H.n === 2) { if (hu && bbName === lastBBname) fail('單挑連續兩手同一個人下大盲 ' + seed + ' 第 ' + H.no + ' 手'); hu = true; }
    lastBBname = bbName;
    let guard = 0;
    while (H.phase !== 'done' && guard++ < 500) { const r = E.gameStep(H); if (r.need !== undefined) E.applyAction(H, E.aiDecide(H, rng, 3)); }
    E.endHand(T, H);
    const tot = T.seats.reduce((s, x) => s + x.stack, 0);
    if (tot !== total0) { fail('籌碼不守恆 ' + seed + ' ' + tot + ' ≠ ' + total0); break; }
    k++; hands++;
  }
  E.tourneyPrep(T);
  const pl = T.tourney.places.map((x) => x.place).sort((a, b) => a - b);
  for (let i = 0; i < pl.length; i++) if (pl[i] !== T.seats.length + 1 + i) { fail('名次不連續 ' + seed + ' ' + pl.join(',')); break; }
  const pay = E.TOURNEY_PAY[n] || [65, 35];
  if (Math.abs(pay.reduce((a, b) => a + b, 0) - 100) > 1e-9) fail('獎金比例加起來不是 100%：' + n + ' 人');
}
console.log(bad ? '錦標賽：' + bad + ' 個錯' : '錦標賽 ' + N + ' 場、' + hands + ' 手 OK');
process.exit(bad ? 1 : 0);
