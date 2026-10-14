/* 工作室：從牌局帶入、範圍大小、樹、求解一點點、照實際打法走、下一張牌報告、牌型分類 */
const E = require('./engine');
const HANDS = +(process.argv[2] || 400), SOLVE = +(process.argv[3] || 3), SEED = +(process.argv[4] || 5);
const rng = E.makeRng(SEED);
const n = 6, opp = E.makeOpponents(n, 2, rng);
const T = E.newTable({ n, names: ['你'].concat(opp.map((o) => o.name)), styles: ['tag'].concat(opp.map((o) => o.style)) });
let ok = [0, 0, 0, 0], errs = 0, solved = 0, sizes = [], lineFail = 0, lines = 0;
const assert = (c, m) => { if (!c) { errs++; console.log('✗', m); } };
for (let h = 0; h < HANDS; h++) {
  const H = E.newHand(T, rng);
  while (H.phase !== 'done') {
    const r = E.gameStep(H);
    if (r.need !== undefined) E.applyAction(H, E.aiDecide(H, rng, 2));
  }
  E.endHand(T, H);
  for (const x of E.importableStreets(H)) {
    if (!x.ok) continue;
    ok[x.street]++;
    const sp = x.spot;
    // 檢查：公牌張數、範圍不空、實際手牌在範圍裡、籌碼合理
    assert(sp.board.length === 2 * (x.street + 2), 'board ' + sp.board);
    const cfg = E.spotCfg(sp);
    const hero = E.parseCards(sp.hero.cards);
    assert(cfg.ranges[sp.hero.p][E.comboOf(hero[0], hero[1])] > 0, 'hero combo in range');
    assert(sp.pot > 0 && sp.stack > 0, 'pot/stack');
    const est = E.estimateSolve(cfg);
    sizes.push(est.n[0], est.n[1]);
    // 照實際打法對到樹上（只有轉牌、河牌）
    if (x.street >= 2) {
      const tree = est.tree;
      let nd = tree.root;
      lines++;
      for (const st of sp.line) {
        if (nd.kind === E.N_CHANCE) { if (st.c === undefined) { lineFail++; break; } nd = nd.kids[0]; continue; }
        if (nd.kind !== E.N_ACT) break;
        if (st.c !== undefined) { lineFail++; break; }
        if (st.p !== nd.p) { lineFail++; console.log('順序不對', sp.title, JSON.stringify(sp.line)); break; }
        const a = E.matchAct(nd.acts, st);
        if (a < 0) { lineFail++; console.log('對不到', JSON.stringify(st), nd.acts.map(E.actLabel).join('/')); break; }
        nd = nd.kids[a];
      }
    }
    if (x.street === 3 && solved < SOLVE) {
      solved++;
      const s = new E.Solver(cfg);
      const t0 = Date.now();
      const ex = s.solve({ target: 0.5, maxIters: 600, every: 20 });
      console.log(sp.title, sp.names.join(' vs '), sp.board, '底池', sp.pot, '籌碼', sp.stack, '手牌數', s.n.join('/'), '→', s.t, '次', ex.pct.toFixed(2) + '%', (Date.now() - t0) + 'ms');
      const v = s.nodeView([]);
      assert(v.kind === E.N_ACT, 'root act');
    }
    if (x.street === 2 && solved < SOLVE + 1 && ok[2] === 3) {
      const s = new E.Solver(cfg);
      const t0 = Date.now();
      s.solve({ target: 1.5, maxIters: 120, every: 20 });
      const ms = Date.now() - t0;
      // 找第一個發牌點、做下一張牌報告
      const path = [];
      let nd = s.root;
      while (nd.kind === E.N_ACT) { const a = nd.acts.findIndex((q) => q.t === 'x' || q.t === 'c'); path.push({ a }); nd = nd.kids[a]; }
      const t1 = Date.now();
      const ro = s.runouts(path);
      console.log('轉牌', sp.board, '手牌數', s.n.join('/'), s.t + ' 次 ' + ms + 'ms', '下一張牌報告', ro.cards.length, '張', (Date.now() - t1) + 'ms', 'EV 加總(應≈底池)', (ro.cards[0].ev[0] + ro.cards[0].ev[1]).toFixed(2), sp.pot);
      const evs = ro.cards.map((c) => c.ev[0] + c.ev[1]);
      assert(evs.every((x) => Math.abs(x - sp.pot) < 0.05 * sp.pot + 0.05), 'runout ev sum');
      solved++;
    }
  }
}
sizes.sort((a, b) => a - b);
console.log('可帶入：翻牌', ok[1], '轉牌', ok[2], '河牌', ok[3], '／', HANDS, '手；範圍手牌數 中位數', sizes[sizes.length >> 1], '最大', sizes[sizes.length - 1]);
console.log('照實際打法走：', lines - lineFail, '/', lines, '成功');
// 牌型分類：每一組公牌每一手牌都要有分類
const brd = E.parseCards('Ts9s8d');
const cnt = new Array(E.CATG.length).fill(0);
for (let k = 0; k < E.NCOMBO; k++) { const a = E.COMBO_A[k], b = E.COMBO_B[k]; if (brd.includes(a) || brd.includes(b)) continue; cnt[E.handCategory(a, b, brd)]++; }
console.log('T♠9♠8♦ 上的分類：', E.CATG.map((c, i) => c + ' ' + cnt[i]).join('、'));
console.log(errs ? '有錯 ' + errs : '工作室 OK');
if (errs) process.exit(1);
