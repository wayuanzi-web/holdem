/* 決定價值實驗（改冠軍的策略前先跑）：node test/champ-dv.js 手數 種子 等級 M 模擬次數 全下標準誤
   一條牌局照冠軍（整手模擬）走；每個決定比較「整手模擬不准換全下」和「准換（河牌）」兩種規則，
   兩種不一樣時用真的手牌把兩個動作各打 M 次（之後電腦照真正的等級打、你照冠軍一步估算打——你之後亂打的話，不全下的打法會被低估），
   差多少就是這個決定值多少。輸出：每百手多贏幾個大盲（±標準誤）和每個不一樣的決定。要改別的規則，改 C.simAllin 那兩行。 */
const E = require('./engine.js');
const HANDS = +process.argv[2], SEED = +process.argv[3], LEVEL = +(process.argv[4] || 2), M = +(process.argv[5] || 200), NS = +(process.argv[6] || 150), SE = +(process.argv[7] || 1);
const C = E.CHAMP;
const key = (a) => a.t + ':' + (a.to || 0);
function playTrue(H, act, cards, deck, seed) {
  const H1 = E.champClone(H);
  for (const q of H1.players) if (q.seat !== 0) q.cards = cards[q.seat];
  H1.deck = deck; H1.dp = 0;
  const rng = E.makeRng(seed), before = H.players[0].total;
  E.applyAction(H1, act);
  let g = 0;
  while (H1.phase !== 'done' && g++ < 300) {
    const r = E.gameStep(H1);
    if (r.need === undefined) continue;
    E.applyAction(H1, r.need === 0 ? E.champAdvice(H1, rng, LEVEL).act : E.aiDecide(H1, rng, LEVEL));
  }
  return H1.result.net[0] + before;
}
function trueEV(H, act, h, d) {
  if (act.t === 'f') return { m: 0, v: 0 };
  const known = new Uint8Array(52), cards = {};
  for (const q of H.players) { for (const c of q.cards) known[c] = 1; if (q.seat !== 0) cards[q.seat] = q.cards; }
  for (const c of H.board) known[c] = 1;
  const rest = []; for (let c = 0; c < 52; c++) if (!known[c]) rest.push(c);
  const rng = E.makeRng(SEED * 4111 + h * 97 + d * 13 + 7), xs = [];
  for (let i = 0; i < M; i++) {
    const deck = rest.slice();
    for (let x = deck.length - 1; x > 0; x--) { const y = (rng() * (x + 1)) | 0; const t = deck[x]; deck[x] = deck[y]; deck[y] = t; }
    xs.push(playTrue(H, act, cards, deck, (rng() * 4294967296) >>> 0));
  }
  const m = xs.reduce((a, b) => a + b, 0) / M;
  return { m, v: xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (M - 1) / M };
}
const rng0 = E.makeRng(SEED), n = 6, opp = E.makeOpponents(n, LEVEL, rng0);
const T = E.newTable({ n, names: ['你'].concat(opp.map((o) => o.name)), styles: ['tag'].concat(opp.map((o) => o.style)), level: LEVEL });
const D = []; let nDec = 0; const t0 = Date.now();
for (let h = 0; h < HANDS; h++) {
  for (const s of T.seats) s.stack = 200;
  const H = E.newHand(T, E.makeRng(SEED * 100003 + h * 7919));
  const brng = E.makeRng(SEED * 7777 + h * 31 + 5);
  let d = 0;
  while (H.phase !== 'done') {
    const r = E.gameStep(H);
    if (r.need === undefined) continue;
    if (r.need !== 0) { E.applyAction(H, E.aiDecide(H, brng, LEVEL)); continue; }
    nDec++; d++;
    const adv = E.champAdvice(H, E.makeRng(SEED * 999331 + h * 131 + d * 17 + 3), LEVEL);
    let base = adv.act;
    if (E.champNeedSim(adv)) {
      const sim = E.champRollout(H, 0, LEVEL, E.champSimCands(adv), { N: NS, seed: SEED * 31 + h * 7 + d });
      C.simAllin = false; base = E.champMerge(adv, sim, H).act;
      C.simAllin = true; C.allinSe = SE; const a = E.champMerge(adv, sim, H).act; C.simAllin = false;
      if (key(a) !== key(base)) {
        const x = trueEV(H, a, h, d), y = trueEV(H, base, h, d), dd = (x.m - y.m) / H.bb;
        D.push({ d: dd, v: (x.v + y.v) / H.bb / H.bb, txt: `h${h} ${['pre', 'flop', 'turn', 'river'][H.street]} ${key(base)}→${key(a)} ${dd.toFixed(2)} ±${(Math.sqrt(x.v + y.v) / H.bb).toFixed(2)}` });
      }
    }
    E.applyAction(H, base);
  }
  E.endHand(T, H);
  if ((h + 1) % 500 === 0) { const s = D.reduce((a, b) => a + b.d, 0); console.error(`${h + 1} hands, ${D.length} diffs, per100 ${(s / (h + 1) * 100).toFixed(2)}, ${Math.round((Date.now() - t0) / 1000)}s`); }
}
const s = D.reduce((a, b) => a + b.d, 0), s2 = D.reduce((a, b) => a + b.d * b.d, 0);
console.log(JSON.stringify({ hands: HANDS, seed: SEED, level: LEVEL, se: SE, dec: nDec, sec: Math.round((Date.now() - t0) / 1000), n: D.length, per100: +(s / HANDS * 100).toFixed(2), se100: +(Math.sqrt(s2) / HANDS * 100).toFixed(2) }));
console.log(D.map((x) => x.txt).join('\n'));
