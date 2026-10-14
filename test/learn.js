/* 大師之路：每一種題目都只有一個正確答案、答案跟引擎一致；課表、分級、進度、字典資料 */
const E = require('./engine');
let bad = 0;
const fail = (m) => { bad++; if (bad <= 15) console.log('✗', m); };
const rng = E.makeRng(2026);
const N = +(process.argv[2] || 200);
let nq = 0;
for (const gen of Object.keys(E.QGEN)) {
  for (let i = 0; i < N; i++) {
    const q = E.makeQ(gen, rng); nq++;
    const oks = q.opts.filter((o) => o.ok).length, texts = new Set(q.opts.map((o) => o.t));
    if (oks !== 1) { fail(gen + ' 正確答案不是剛好一個：' + JSON.stringify(q.opts)); continue; }
    if (texts.size !== q.opts.length) fail(gen + ' 選項重複：' + q.opts.map((o) => o.t).join('/'));
    if (!q.prompt || !q.explain) fail(gen + ' 題目或解釋是空的');
    const ans = q.opts.find((o) => o.ok).t;
    if (gen === 'whoWins') {
      const va = E.evalCards(q.vis.a.concat(q.vis.board)), vb = E.evalCards(q.vis.b.concat(q.vis.board));
      if (ans !== (va > vb ? 'A 贏' : vb > va ? 'B 贏' : '平分')) fail('whoWins 答案錯');
    }
    if (gen === 'handType' && ans !== E.CAT_NAMES[E.evalCards(q.vis.hole.concat(q.vis.board)) >>> 26]) fail('handType 答案錯');
    if (gen === 'openOrFold' && q.key.startsWith('open|')) {
      const [, t, pos, g] = q.key.split('|'), f = E.chartFreq(t + '/rfi/' + pos, +g);
      if ((ans === '加注') !== (f >= 0.75) || (f > 0.1 && f < 0.75)) fail('openOrFold 跟圖表不一致 ' + q.key + ' ' + f);
    }
    if (gen === 'defend' && q.key.startsWith('def|')) {
      const parts = q.key.split('|'), key = parts[1], g = +parts[2];
      const r = E.chartFreq(key, g, 'raise'), c = E.chartFreq(key, g, 'call');
      const exp = r >= 0.75 ? '再加注（3-bet）' : c >= 0.75 ? '跟注' : '棄牌';
      if (ans !== exp) fail('defend 跟圖表不一致 ' + q.key);
    }
    if (gen === 'potOdds') {
      const m = q.prompt.match(/底池有 (\d+)，對手下注 (\d+)/), pot = +m[1], bet = +m[2];
      if (ans !== Math.round(bet / (pot + 2 * bet) * 100) + '%') fail('potOdds 答案錯 ' + q.prompt);
    }
    if (gen === 'firstAct' || gen === 'posName') { if (!q.vis || q.vis.k !== 'seats') fail(gen + ' 沒有座位圖'); }
    const kp = (q.key || '').split('|');
    if (gen === 'betNeed') { const fr = E.BET_FR.find((x) => q.prompt.indexOf(x[2]) >= 0), f = fr[0] / fr[1]; if (ans !== Math.round(f / (1 + 2 * f) * 100) + '%') fail('betNeed 錯 ' + q.prompt); }
    if (gen === 'bbOdds') { const x = +kp[1], need = (x - 1) / (0.5 + 2 * x); if (ans !== Math.round(need * 100) + '%') fail('bbOdds 錯 ' + x); }
    if (gen === 'stealMath') { const r = +kp[1]; if (ans !== Math.round(r / (r + 1.5) * 100) + '%') fail('stealMath 錯'); }
    if (gen === 'openSize') { const bb = +kp[1], limp = +kp[2], sb = kp[3] === 'true'; if (+ans !== (sb ? 3 : 2.5 + limp) * bb) fail('openSize 錯 ' + q.key); }
    if (gen === 'callOrFold' && kp[0] === 'cof') { const pot = +kp[1], bet = +kp[2], eq = +kp[3], ev = eq * (pot + 2 * bet) - bet; if ((ans === '跟注') !== (ev > 0)) fail('callOrFold 錯 ' + q.key); }
    if (gen === 'pushFold' && kp[0] === 'pf') { const B = +kp[1], bb = +kp[2], g = +kp[3]; if ((ans === '全下') !== (E.PRE_PCT[g] < E.pushPct(bb, B))) fail('pushFold 錯 ' + q.key); }
    if (gen === 'callShove' && kp[0] === 'cs') { const B = +kp[1], st = +kp[2], g = +kp[3], eq = E.eqVsTop(g, E.pushPct(st, B)), need = (st - 1) / (2 * st + 0.5); if ((ans === '跟注') !== (eq >= need)) fail('callShove 錯 ' + q.key); }
    if (gen === 'vs3bet' && kp[0] === 'v3') { const key = '6/vs3bet/' + kp[1], g = +kp[2], r = E.chartFreq(key, g, 'raise'), c = E.chartFreq(key, g, 'call'); const exp = r >= 0.75 ? '4-bet' : c >= 0.75 ? '跟注' : '棄牌'; if (ans !== exp || E.chartFreq('6/rfi/' + E.OG_RFI6[kp[1]], g) < 0.75) fail('vs3bet 錯 ' + q.key); }
    if (gen === 'setMine' && kp[0] === 'sm') { const r = +kp[2] / +kp[1]; if ((ans === '棄牌') !== (r < 20) || (r > 10 && r < 20)) fail('setMine 錯 ' + q.key); }
    if (gen === 'outsRand' && kp[0] === 'or') { const r = E.drawOuts(q.vis.hole, q.vis.board); if (!r || +ans !== r.n) fail('outsRand 錯 ' + q.key); }
    if (gen === 'madeHand' && kp[0] === 'mh') { if (ans !== E.CATG[E.handCategory(q.vis.hole[0], q.vis.hole[1], q.vis.board)]) fail('madeHand 錯 ' + q.key); }
    if (gen === 'textureType') { if (ans !== E.flopTexture(q.vis.board).type) fail('textureType 錯 ' + q.key); }
    if (gen === 'texture' && kp[0] === 'tx') { const ws = q.vis.fs.map((b) => E.flopTexture(b).wet); if (ans !== '第 ' + (ws.indexOf(Math.max(...ws)) + 1) + ' 個') fail('texture 錯'); }
    if (gen === 'cbet' && kp[0] === 'cb') { if (ans !== E.CBET_OPT[E.cbetRule(q.vis.board)]) fail('cbet 錯 ' + q.key); }
    if (gen === 'mdf') { const fr = E.BET_FR.find((x) => x[2] === kp[1]), f = fr[0] / fr[1]; if (ans !== Math.round(100 / (1 + f)) + '%') fail('mdf 錯 ' + q.key); }
    if (gen === 'rangeAdv' && kp[0] === 'ra') { const a = E.RANGE_ADV.find((x) => x[0] === kp[1]), b = E.RANGE_ADV.find((x) => x[0] === kp[2]); if (ans !== (a[1] > b[1] ? '第 1 個' : '第 2 個')) fail('rangeAdv 錯'); }
    if (gen === 'combosOnBoard' && kp[0] === 'cob') {
      const nm = kp[1], r1 = E.RANKS.indexOf(nm[0]), r2 = E.RANKS.indexOf(nm[1]), dead = new Set(q.vis.board); let n = 0;
      for (let x = 0; x < 52; x++) for (let y = x + 1; y < 52; y++) { if (dead.has(x) || dead.has(y)) continue; const a = x >> 2, b = y >> 2; if ((a === r1 && b === r2) || (a === r2 && b === r1)) n++; }
      if (+ans !== n) fail('combosOnBoard 錯 ' + q.key + ' ' + n);
    }
    if (gen === 'faceBet' && kp[0] === 'fb' && ['棄牌', '跟注', '加注'].indexOf(ans) < 0) fail('faceBet 答案怪');
    if (gen === 'rule24') { const n = +kp[1], flop = kp[2] === 'true'; if (ans !== (flop ? n * 4 - Math.max(0, n - 8) : n * 2) + '%') fail('rule24 錯'); }
  }
}
// 出牌數：照引擎數一次
for (const [h, b, n] of E.OUTS_SPOTS) {
  const hole = E.parseCards(h.replace(/\s/g, '')), board = E.parseCards(b);
  const dead = new Set(hole.concat(board)); let cnt = 0;
  for (let c = 0; c < 52; c++) {
    if (dead.has(c)) continue;
    const cat = E.evalCards(hole.concat(board, [c])) >>> 26;
    if ((hole[0] >> 2) === (hole[1] >> 2)) { if (cat === 3) cnt++; }                 // 口袋對子：中三條
    else if (n === 6) { if (hole.some((x) => (x >> 2) === (c >> 2))) cnt++; }          // 兩張高牌：中頂對
    else if (cat >= 4) cnt++;                                                          // 聽牌：成順子或同花
  }
  if (cnt !== n) fail('出牌數 ' + h + ' ' + b + '：說 ' + n + '，實際 ' + cnt);
}
// 起手牌五層、字典
const tierN = [0, 0, 0, 0, 0, 0];
for (let g = 0; g < 169; g++) tierN[E.tierOf(g)]++;
if (tierN.reduce((a, b) => a + b, 0) !== 169 || tierN[1] !== 5) fail('五層加起來不對 ' + tierN);
for (let t = 1; t <= 5; t++) { const hs = E.tierHands(t); for (let i = 1; i < hs.length; i++) if (E.PRE_RANK[hs[i]] < E.PRE_RANK[hs[i - 1]]) fail('第 ' + t + ' 層沒有照排名'); }
for (let g = 0; g < 169; g++) {
  const i = E.handInfo(g);
  if (!(i.eq1 > 0.3 && i.eq1 < 0.9) || i.rank < 1 || i.rank > 169 || !E.openLine(i)) { fail('字典資料怪 ' + E.className(g)); break; }
}
const ranks = new Set(); for (let g = 0; g < 169; g++) ranks.add(E.PRE_RANK[g]);
if (ranks.size !== 169) fail('排名有重複');
if (E.PRE_RANK[E.classByName('AA')] !== 1 || E.PRE_RANK[E.classByName('72o')] < 150) fail('排名頭尾不對');
// 每個位置多開的牌：往後只會變多
for (const t of ['6', '9']) { const d = E.openDiffs(t); for (let i = 1; i < d.length; i++) if (d[i].n < d[i - 1].n) fail(t + ' 人桌開牌數往後變少'); }
// 課表
const ls = E.allLessons(), ids = new Set(ls.map((l) => l.id));
if (ids.size !== ls.length) fail('課號重複');
for (const l of ls.filter((x) => x.exam)) if (!E.EXAMS[l.exam] || !E.EXAM_SPOTS[E.EXAMS[l.exam].spots]) fail(l.id + ' 考核設定不見了');
for (const l of ls.filter((x) => x.ready && !x.exam)) {
  const a = E.makeQuiz(l.practice.gens, l.practice.n, rng), b = E.makeQuiz(l.quiz.gens, l.quiz.n, rng);
  if (a.length !== l.practice.n || b.length !== l.quiz.n) fail(l.id + ' 題目不夠');
  if (l.quiz.pass > l.quiz.n) fail(l.id + ' 過關門檻比題數多');
  for (const blk of l.read) if (typeof blk === 'string' && /\[[2-9TJQKA][shdc]/.test(blk)) fail(l.id + ' 有牌沒換成符號');
}
// 牌力分級表的例子
E.CATG_EX.forEach(([h, b], i) => { const H = E.parseCards(h), B = E.parseCards(b); if (E.handCategory(H[0], H[1], B) !== i) fail('牌力分級例子錯：' + E.CATG[i]); });
// 指定牌局：任何人數、任何按鈕位置，指定的座位拿到指定的牌、公牌照指定的發
for (let t = 0; t < 300; t++) {
  const n = 2 + (t % 8), seat = (rng() * n) | 0, cs = E.dealN(rng, 7), hole = cs.slice(0, 2), board = cs.slice(2);
  const T = E.newTable({ n, names: Array(n).fill('x'), styles: Array(n).fill('station'), level: 2, button: (rng() * n) | 0 });
  const H = E.newHand(T, rng);
  E.stackDeck(H, seat, hole, board);
  let guard = 0;
  while (H.phase !== 'done' && guard++ < 500) { if (H.phase === 'bet') { const L = E.legalActions(H); E.applyAction(H, L.canCheck ? { t: 'x' } : { t: 'c' }); } else E.gameStep(H); }
  const got = H.players[seat].cards;
  if (got.length !== 2 || got[0] !== hole[0] || got[1] !== hole[1] || H.board.join() !== board.join()) { fail('指定牌局發錯 n=' + n + ' seat=' + seat); break; }
  const all = new Set(H.board); for (const p of H.players) for (const c of p.cards) all.add(c);
  if (all.size !== 5 + 2 * n) { fail('指定牌局有重複的牌'); break; }
}
// 實戰考核：題庫的牌不重複；分數
for (const k of Object.keys(E.EXAM_SPOTS)) for (const [h, b] of E.EXAM_SPOTS[k]) { const c = E.parseCards(h + b); if (c.length !== 7 || new Set(c).size !== 7) fail('考核題庫牌不對 ' + h + ' ' + b); }
{
  const X = E.examNew('6-7', rng);
  if (X.spots.length !== 16) fail('考核題庫不是 16 個');
  const seen = new Set(); for (let i = 0; i < 16; i++) seen.add(E.examNextSpot(X, rng)); if (seen.size !== 16) fail('考核前 16 手有重複');
  E.examNextSpot(X, rng);
  if (E.examAdd(X, Array(12).fill('good'))) fail('12 個就結束了');
  if (!E.examAdd(X, ['good', 'good', 'good', 'ok', 'ok', 'bad', 'bad', 'bad', 'bad']) || X.grades.length !== 21) fail('評滿沒結束');
  if (Math.abs(X.score - 16 / 21) > 1e-9 || !X.pass) fail('考核分數算錯 ' + X.score);
  if (E.examAdd(X, ['good'])) fail('結束了還在加');
  if (E.examScore(['ok', 'ok', 'bad', 'good']) !== 0.5) fail('examScore 錯');
}
// 分級
const pl = E.makePlacement(rng);
if (pl.length !== 12) fail('分級測驗不是 12 題');
const st = (oks) => E.placementStart(pl.map((q, i) => ({ stage: q.stage, ok: oks(q, i) }))).start;
if (st(() => true) !== 8) fail('全對應該從第 8 階');
if (st(() => false) !== 1) fail('全錯應該從第 1 階');
if (st((q) => q.stage <= 2) !== 3) fail('前兩階對應該從第 3 階');
// 錯題本
{
  const L2 = E.learnBlank(), q = E.makeQ('whoWins', rng);
  E.wrongAdd(L2, q); E.wrongAdd(L2, q);
  if (L2.wrong.length !== 1) fail('錯題本重複加');
  E.wrongResult(L2, q.key, true); if (L2.wrong.length !== 1) fail('答對一次就拿掉了');
  E.wrongResult(L2, q.key, false); E.wrongResult(L2, q.key, true); E.wrongResult(L2, q.key, true);
  if (L2.wrong.length !== 0) fail('連對兩次沒拿掉');
  for (let i = 0; i < 100; i++) E.wrongAdd(L2, E.makeQ('outsRand', rng));
  if (L2.wrong.length > 80) fail('錯題本超過 80 題');
  if (E.wrongSession(L2, rng).length !== 15) fail('一次複習應該 15 題');
}
for (const d of E.DRILLS) if (E.makeQuiz(d.gens, 20, rng).length !== 20) fail('快答 ' + d.id + ' 不夠 20 題');
// 進度
const LP = E.learnBlank();
if (E.learnNext(LP).id !== '1-1') fail('第一課不是 1-1');
LP.skip[1] = true; LP.done['2-1'] = { s: 8, n: 8 };
if (E.learnNext(LP).id !== '2-2') fail('跳過第 1 階、上完 2-1，下一課應該是 2-2');
if (E.learnCount(LP).done !== 4) fail('完成數應該是 4');
console.log(bad ? '大師之路：' + bad + ' 個錯' : '大師之路 ' + nq + ' 題、' + ls.length + ' 課 OK');
process.exit(bad ? 1 : 0);
