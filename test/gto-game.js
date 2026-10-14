/* 第五步：牌局裡的 GTO。亂打很多手，單挑的轉牌、河牌建局面、解一點點、把實際動作對到樹上、河牌接轉牌解出來的範圍 */
const E = require('./engine');
const HANDS = +(process.argv[2] || 300), SEED = +(process.argv[3] || 7), IT = +(process.argv[4] || 20);
const rng = E.makeRng(SEED);
const n = 6, opp = E.makeOpponents(n, 4, rng);
const T = E.newTable({ n, names: ['你'].concat(opp.map((o) => o.name)), styles: ['tag'].concat(opp.map((o) => o.style)), level: 4 });
let errs = 0, setups = [0, 0, 0, 0], mapped = 0, mapFail = 0, carried = 0, ms = [[], [], [], []];
const bad = (m) => { errs++; console.log('✗', m); };
for (let hnd = 0; hnd < HANDS; hnd++) {
  const H = E.newHand(T, rng);
  let G = null;                                               // { s, street, seats, path, nd }
  while (H.phase !== 'done') {
    const r = E.gameStep(H);
    if (r.need === undefined) {
      if (r.k === 'street' && r.street >= 2 && !r.runout) {
        let carry = null;
        if (G && G.street === r.street - 1 && G.nd && G.nd.kind === E.N_CHANCE) {
          const L = G.s.locate(G.path.concat([{ c: r.cards[0] }]));
          if (L.used === G.path.length + 1) {
            carry = [0, 1].map((p) => { const rr = G.s.unperm(p, L.sig, L.reach[p]), w = new Float32Array(E.NCOMBO); for (let h = 0; h < G.s.n[p]; h++) w[G.s.H[p][h]] = rr[h]; return w; });
            carried++;
          }
        }
        const S = E.gtoStreetSetup(H, r.street, carry);
        G = null;
        if (S) {
          setups[r.street]++;
          const t0 = Date.now();
          const s = new E.Solver(S.cfg);
          s.iterate(IT);
          ms[r.street].push(Date.now() - t0);
          // 每個人的實際手牌都要在自己的範圍裡
          S.seats.forEach((k, p) => { const c = E.comboOf(H.players[k].cards[0], H.players[k].cards[1]); if (s.idx[p][c] < 0) bad('手牌不在範圍 ' + E.comboTxt(c)); });
          G = { s, street: r.street, seats: S.seats, path: [], nd: s.root };
        }
      } else if (r.k === 'street') G = null;
      continue;
    }
    const ev = E.applyAction(H, E.aiDecide(H, rng, 4));
    if (G && ev.street === G.street && G.nd) {
      const a = E.gtoMapAct(G.nd, ev);
      if (a < 0) { mapFail++; G.nd = null; continue; }
      mapped++;
      // 查詢：輪到的人在這裡的策略（跟 gQuery 一樣的算法）
      const L = G.s.locate(G.path);
      if (L.used !== G.path.length || L.nd.kind !== E.N_ACT) bad('路徑走不到');
      else if (L.nd.p !== G.seats.indexOf(ev.seat)) bad('輪到的人不一樣');
      G.path.push({ a }); G.nd = G.nd.kids[a];
    }
  }
  E.endHand(T, H);
}
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : '-');
console.log('建局面：轉牌', setups[2], '河牌', setups[3], '（河牌用轉牌的解帶範圍', carried, '次）；動作對到樹上', mapped, '次、對不到', mapFail, '次；',
  IT, '次迭代的時間中位數：轉牌', med(ms[2]), 'ms、河牌', med(ms[3]), 'ms');
console.log(errs ? '牌局 GTO 有錯 ' + errs : '牌局 GTO OK');
if (errs) process.exit(1);
