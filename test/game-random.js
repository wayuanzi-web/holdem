/* 牌局引擎：亂下合法動作跑很多手，檢查規則不會壞
   - 籌碼守恆、沒有負數、每一手都會結束
   - 每個人贏到的不超過他有資格拿的（邊池）、贏的人牌一定最大
   - 輪到的人一定是還在、沒全下的人；最小加注照規則 */
const E = require('./engine');
const N = +(process.argv[2] || 20000);
const rng = E.makeRng(99);
let bad = 0, hands = 0, sidepots = 0, showdowns = 0, uncontested = 0, steps = 0, allins = 0;
const fail = (m, H) => { if (bad++ < 5) console.log('錯：', m, JSON.stringify(H.log.slice(-6))); };
for (let t = 0; t < N; t++) {
  const n = 2 + ((rng() * 8) | 0);
  const T = E.newTable({ n, names: [...Array(n).keys()].map((i) => 'P' + i), styles: new Array(n).fill('tag') });
  for (const s of T.seats) s.stack = 1 + ((rng() * 300) | 0);
  T.button = (rng() * n) | 0;
  const before = T.seats.reduce((a, s) => a + s.stack, 0);
  const H = E.newHand(T, rng);
  let guard = 0;
  while (H.phase !== 'done' && guard++ < 500) {
    const r = E.gameStep(H);
    if (r.need !== undefined) {
      const p = H.players[r.need];
      if (p.folded || p.allin) { fail('輪到不能說話的人', H); break; }
      const L = E.legalActions(H);
      const x = rng();
      let a;
      if (x < 0.2) a = { t: 'f' };
      else if (x < 0.6) a = { t: L.toCall ? 'c' : 'x' };
      else if (L.canRaise) {
        const to = x < 0.85 ? L.minTo : x < 0.95 ? Math.round(L.minTo + (L.maxTo - L.minTo) * rng()) : L.maxTo;
        a = { t: 'r', to };
        if (to < L.minTo || to > L.maxTo) fail('加注超出範圍', H);
      } else a = { t: 'c' };
      const prevMin = H.minRaise, prevCur = H.curBet;
      const ev = E.applyAction(H, a);
      if ((ev.t === 'r' || ev.t === 'b') && ev.to - prevCur < prevMin && ev.t !== 'a') fail('加注不夠', H);
      steps++;
    }
  }
  if (H.phase !== 'done') { fail('沒有結束', H); continue; }
  E.endHand(T, H);
  const after = T.seats.reduce((a, s) => a + s.stack, 0);
  if (after !== before) fail('籌碼不守恆 ' + before + ' → ' + after, H);
  if (T.seats.some((s) => s.stack < 0)) fail('負的籌碼', H);
  const res = H.result;
  if (res.uncontested) uncontested++; else showdowns++;
  if (res.pots.filter((x) => !x.refund).length > 1) sidepots++;
  if (H.players.some((p) => p.allin)) allins++;
  // 有資格拿的上限
  for (const p of H.players) {
    if (p.folded && res.won[p.seat] > 0) fail('棄牌的人贏錢', H);
    const cap = H.players.reduce((a, q) => a + Math.min(q.total, p.total), 0);
    if (res.won[p.seat] > cap) fail('贏太多 ' + p.seat, H);
  }
  if (!res.uncontested) {
    for (const pot of res.pots) {
      const vals = pot.elig.map((s) => E.evalCards(H.players[s].cards.concat(H.board)));
      const best = Math.max(...vals);
      for (const w of pot.winners) if (E.evalCards(H.players[w].cards.concat(H.board)) !== best) fail('贏的人不是最大', H);
    }
    if (H.board.length !== 5) fail('攤牌時公牌不是 5 張', H);
  }
  hands++;
}
console.log('跑了', hands, '手，動作', steps, '次；攤牌', showdowns, '、沒人跟就贏', uncontested, '、有全下', allins, '、有邊池', sidepots, '；錯誤', bad);
process.exit(bad ? 1 : 0);
