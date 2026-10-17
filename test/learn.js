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
    if (gen === 'pushFold' && kp[0] === 'pf') { const B = +kp[1], bb = +kp[2], g = +kp[3]; if ((ans === '全下') !== (E.PUSH_PCT[g] < E.pushPct(bb, B))) fail('pushFold 錯 ' + q.key); }
    if (gen === 'callShove' && kp[0] === 'cs') { const B = +kp[1], st = +kp[2], g = +kp[3], eq = E.eqVsTop(g, E.pushPct(st, B)), need = (st - 1) / (2 * st + 0.5); if ((ans === '跟注') !== (eq >= need)) fail('callShove 錯 ' + q.key); }
    if (gen === 'vs3bet' && kp[0] === 'v3') { const key = '6/vs3bet/' + kp[1], g = +kp[2], r = E.chartFreq(key, g, 'raise'), c = E.chartFreq(key, g, 'call'); const exp = r >= 0.75 ? '4-bet' : c >= 0.75 ? '跟注' : '棄牌'; if (ans !== exp || E.chartFreq('6/rfi/' + E.OG_RFI6[kp[1]], g) < 0.75) fail('vs3bet 錯 ' + q.key); }
    if (gen === 'setMine' && kp[0] === 'sm') { const r = +kp[2] / +kp[1]; if ((ans === '棄牌') !== (r < 20) || (r > 10 && r < 20)) fail('setMine 錯 ' + q.key); }
    if (gen === 'outsRand' && kp[0] === 'or') { const r = E.drawOuts(q.vis.hole, q.vis.board); if (!r || +ans !== r.n) fail('outsRand 錯 ' + q.key); }
    if (gen === 'madeHand' && kp[0] === 'mh') {
      if (ans !== E.CATG[E.handCategory(q.vis.hole[0], q.vis.hole[1], q.vis.board)]) fail('madeHand 錯 ' + q.key);
      // 錯的選項不能也成立：有同花聽牌就不能拿「同花聽牌」當錯的
      const all = q.vis.hole.concat(q.vis.board), sc = [0, 0, 0, 0]; for (const x of all) sc[x & 3]++;
      const fd = sc[q.vis.hole[0] & 3] === 4 || sc[q.vis.hole[1] & 3] === 4;
      if (fd && ans !== '同花聽牌' && q.opts.some((o) => !o.ok && o.t === '同花聽牌')) fail('madeHand 兩個答案都對 ' + q.key);
    }
    if (gen === 'textureType') {
      if (ans !== E.flopTexture(q.vis.board).type) fail('textureType 錯 ' + q.key);
      // 照課文的定義再檢查一次：乾＝三種花色、任兩張差 3 點以上；濕＝兩張同花又有兩張差 2 點以內，或三張擠在 5 點以內
      const rs = q.vis.board.map((c) => c >> 2).sort((a, b) => a - b), ns = new Set(q.vis.board.map((c) => c & 3)).size, gaps = [rs[1] - rs[0], rs[2] - rs[1]];
      if (ans === '乾' && !(ns === 3 && gaps.every((x) => x >= 3) && !(rs[2] === 12 && rs[0] <= 1))) fail('乾的定義不對 ' + q.key);
      if (ans === '濕' && !(ns < 3 && gaps.some((x) => x <= 2 && x > 0)) && !(rs[2] - rs[0] <= 4 && gaps.every((x) => x > 0))) fail('濕的定義不對 ' + q.key);
    }
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
    if (gen === 'gtoRiver' && kp[0] === 'gr') {
      const S = E.GTO_RIVER.find((x) => x.bs === kp[1]), r = S.rows.find((x) => x.h.join(',') === kp[2]);
      if (ans !== E.gtoRowWord(r)) fail('gtoRiver 錯 ' + q.key);
      const w = E.gtoRowWhy(r).split('——')[1];
      if ((r.f <= 30 && /下注拿價值|拿來詐唬/.test(w)) || (r.f >= 70 && /過牌/.test(w))) fail('gtoRiver 解釋跟答案相反 ' + q.key);
    }
    if (gen === 'gtoPolar' && kp[0] === 'gp') {
      const S = E.GTO_RIVER.find((x) => x.bs === kp[1]), hs = kp[2].split(',').map((t) => t.split('.').join(',')), rows = hs.map((h) => S.rows.find((x) => x.h.join(',') === h)), bluff = kp[3] === 'true';
      const i = +ans.match(/\d/)[0] - 1, r = rows[i];
      if (bluff ? !(r.e <= 15 && r.f >= 75) : !(r.f <= 15 && r.e >= 25)) fail('gtoPolar 錯 ' + q.key);
      if (rows.filter((x) => (bluff ? x.e <= 15 && x.f >= 75 : x.f <= 15)).length !== 1) fail('gtoPolar 不只一個答案 ' + q.key);
    }
    if (gen === 'bluffRatio') { const fr = E.BET_FR.find((x) => x[2] === kp[1]), f = fr[0] / fr[1]; if (ans !== Math.round(f / (1 + 2 * f) * 100) + '%') fail('bluffRatio 錯'); }
    if (gen === 'rngPick' && kp[0] === 'rp') {
      const acts = kp[1].split('~'), fs = kp[2].split(',').map(Number), n = +kp[3];
      if (fs.reduce((a, b) => a + b, 0) !== 100) fail('rngPick 頻率加起來不是 100');
      let lo = 0, exp = ''; acts.forEach((t, k) => { if (n >= lo && n < lo + fs[k]) exp = t; lo += fs[k]; });
      if (ans !== exp) fail('rngPick 錯 ' + q.key);
    }
    if (gen === 'shapeOf') { const g = +kp[1]; if (ans !== E.SHAPE_ZH[E.handShape(g).k]) fail('shapeOf 錯 ' + q.key); }
    if (gen === 'trapPair' && kp[0] === 'tp') { const t = +kp[1], m = +kp[2]; if (ans !== E.className(m).replace('T', '10') && ans !== E.NAMEZH(m)) fail('trapPair 答案錯 ' + q.key); if (!(E.PRE_RANK[m] < E.PRE_RANK[t] && E.handInfo(t).eq1 > E.handInfo(m).eq1)) fail('trapPair 不是陷阱 ' + q.key); }
    if (gen === 'showdownTrap' && kp[0] === 'sdt') { const h = kp[1].split(',').map(Number), b = kp[2].split(',').map(Number), B = E.topPairBreak(h, b); if (ans !== Math.max(5, Math.round(B.strongEq * 100 / 5) * 5) + '%') fail('showdownTrap 錯 ' + q.key + ' ' + B.strongEq); }
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
for (const l of ls.filter((x) => x.exam)) { const X = E.EXAMS[l.exam]; if (!X || (X.spots && !E.EXAM_SPOTS[X.spots]) || !(X.need > 0 && X.pass > 0 && X.pass < 1)) fail(l.id + ' 考核設定不對'); }
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
// 河牌 GTO 的資料：兩極化（最強、最弱下注多，中間過牌）
for (const S of E.GTO_RIVER) {
  if (S.rows.length < 30 || S.rows.some((r) => !(r.f >= 0 && r.f <= 100 && r.e >= 0 && r.e <= 100) || r.h.length !== 2 || r.h.some((c) => S.board.indexOf(c) >= 0))) fail('GTO_RIVER 資料怪 ' + S.bs);
  if (!(S.bk[9] >= 90 && S.bk[0] >= 90 && S.bk[4] <= 10 && S.bk[5] <= 10)) fail('GTO_RIVER 不是兩極 ' + S.bs);
}
// 畢業考
{
  const gq = E.makeGradQuiz(rng);
  if (gq.length !== 30) fail('畢業考筆試不是 30 題：' + gq.length);
  for (let s2 = 1; s2 <= 8; s2++) if (!gq.some((q) => q.stage === s2)) fail('畢業考筆試沒有第 ' + s2 + ' 階');
  const L3 = E.learnBlank(); L3.exam = {};
  L3.gradW = { s: 27, n: 30, pass: true };
  if (E.gradCheck(L3)) fail('只有筆試就畢業了');
  L3.exam['8-5'] = { score: 0.84, pass: true, n: 25, good: 20, ok: 2, bad: 3 };
  if (E.gradCheck(L3)) fail('課沒上完就畢業了');
  for (let k = 1; k <= 7; k++) L3.skip[k] = true;
  for (const id of ['8-1', '8-2', '8-3']) L3.done[id] = { s: 8, n: 8 };
  if (E.gradCheck(L3) || E.gradMissing(L3).map((l) => l.id).join() !== '8-4') fail('8-4 沒完成應該不能畢業');
  L3.done['8-4'] = { s: 80, n: 100, pct: true };
  if (!E.gradCheck(L3) || !L3.grad || !L3.done['8-5']) fail('兩部分都過、課都上完沒有畢業');
  if (E.gradCheck(L3)) fail('畢業兩次');
  if (E.lessonDone(L3, '8-5') !== true) fail('畢業沒有標成完成');
  if (!E.NO_SKIP[8]) fail('第 8 階應該不能跳級');
  // 算分：GTO 訓練場只算 GTO 評分；畢業考不算明顯該棄的爛牌
  const rv = [{ grade: { mark: 'good', src: 'GTO' } }, { grade: { mark: 'bad' } }, { grade: { mark: 'good', src: 'chart' }, trivial: true }];
  if (E.examMarks(E.examNew('8-4', rng), rv).join() !== 'good') fail('GTO 訓練場算分錯');
  if (E.examMarks(E.examNew('8-5', rng), rv).join() !== 'good,bad') fail('畢業考算分錯');
  if (E.examNew('8-5', rng).spots !== null || E.examNew('8-5', rng).n !== 6) fail('畢業考設定錯');
}
// 陷阱牌：四種樣子跟圖表一致；題目答案照 handShape、排名、精確列舉
{
  const T = E.shapeTable(), by = {}; for (const r of T) by[r.k] = r;
  if (by.pair.co !== 13 || by.bigbig.co !== 20 || by.aces.co !== 8) fail('對子、兩張都大、同花 A 應該關煞位全開');
  if (by.junk.btn !== 0 || by.bigsmall.utg > 2) fail('垃圾按鈕不開、大配小槍口幾乎不開');
  if (T.reduce((a, r) => a + r.n, 0) !== 169) fail('四種樣子沒有涵蓋 169 種');
  const TG = E.trapGems();
  if (TG.traps.some((x) => !E.handShape(x.g).trap) || TG.gems.some((x) => E.handShape(x.g).k !== 'sconn')) fail('陷阱榜、遺珠榜跟樣子不一致');
  const hero = E.parseCards('Ks6s'), B = E.topPairBreak(hero, E.parseCards('Kh8d3c'));
  if (!(B.strongEq < 0.3 && B.all > 0.7)) fail('K6s 翻牌中頂對的數字怪 ' + B.strongEq + ' ' + B.all);
  const B2 = E.topPairBreak(E.parseCards('KsJs'), E.parseCards('Kh8d3c'));
  if (!(B2.strongEq > 0.45)) fail('KJs 翻牌中頂對的數字怪 ' + B2.strongEq);
}
// 範圍透視：每個局面都解得開；比例加起來是 1；動作會縮小範圍
{
  const sp = E.lensSpots();
  if (sp.length < 40) fail('範圍透視的局面太少 ' + sp.length);
  for (const x of sp) { const w = E.lensPreflop(x.id); if (!w || E.lensStats(w, 1).combos < 10) fail('範圍透視解不開 ' + x.id); }
  const w = E.lensPreflop('6/rfi/UTG#raise'), st = E.lensStats(w, 8), sh = E.lensShapes(w);
  if (Math.abs(sh.reduce((a, x) => a + x.share, 0) - 1) > 1e-6 || !(st.top.reduce((a, x) => a + x.share, 0) > 0.3 && st.top[0].share < 0.06)) fail('範圍透視的比例怪');
  const board = E.parseCards('Kh8d3c'), hero = E.parseCards('Ks6s'), B = E.lensBoard(w, board, hero);
  if (Math.abs(B.rows.reduce((a, r) => a + r.share, 0) - 1) > 1e-6 || !(B.all > 0.6 && B.all < 0.9)) fail('範圍透視翻牌的數字怪');
  const w2 = E.lensNarrow(w, board, 'bet', 'tag'), B2 = E.lensBoard(w2, board, hero);
  if (!(E.lensStats(w2, 1).combos < st.combos && B2.strongShare > B.strongShare)) fail('下注之後範圍應該變強、變小');
  if (E.lensRangeTable().length !== 7) fail('範圍表不是 7 列');
  // GTO 縮小：6 人桌的局面都配得出另一邊；每種線都對得到下注樹
  let paired = 0;
  for (const x of sp) { const pr = E.lensPair(x.id); if (!pr) { if (x.id.indexOf('6/') === 0 && x.id.indexOf('vs4bet') < 0) fail('配不出對手 ' + x.id); continue; } paired++;
    for (const acts of [{ 1: 'bet', 2: 'bet' }, { 1: 'check', 2: 'call' }, { 1: '', 2: 'check', 3: 'bet' }, { 1: 'bet', 2: '', 3: 'call' }]) {
      const b5 = E.parseCards('Kh8d3c2s7d'), S = E.lensSolveCfg(pr, acts[3] ? b5 : b5.slice(0, 4), acts, 'tag');
      if (!S || !S.path || !S.before || S.path.length <= S.before.length) { fail('GTO 的線對不到 ' + x.id + ' ' + JSON.stringify(acts)); break; }
      if (!(S.cfg.ranges[0].some((v) => v > 0) && S.cfg.ranges[1].some((v) => v > 0))) { fail('GTO 的範圍是空的 ' + x.id); break; }
    }
  }
  if (paired < 30) fail('配得出對手的局面太少 ' + paired);
  if (E.lensLine('bet', true).steps.length !== 3 || E.lensLine('bet', false).readAt !== 1) fail('lensLine 錯');
}
// 做過的題目
{
  const L4 = E.learnBlank();
  for (let i = 0; i < 320; i++) { const q = E.makeQ(i % 2 ? 'potOdds' : 'gtoRiver', rng); E.histAdd(L4, q, 0, i % 3 === 0, '測試', E.genStage(q.gen)); }
  if (L4.hist.length !== E.HIST_MAX) fail('做過的題目沒有限制在 ' + E.HIST_MAX + ' 題');
  const all = E.histList(L4, 'all'), wr = E.histList(L4, 'wrong'), s8 = E.histList(L4, 8);
  if (all[0].at < all[all.length - 1].at || wr.some((x) => x.ok) || !s8.length || s8.some((x) => x.stage !== 8)) fail('做過的題目篩選錯');
  if (E.genStage('potOdds') !== 5 || E.genStage('gtoRiver') !== 8 || E.genStage('whoWins') !== 1) fail('genStage 錯');
  const ss = E.histSession(all, 10, rng);
  if (ss.length !== 10 || new Set(ss.map((q) => q.key)).size !== 10 || ss.some((q) => q.opts.filter((o) => o.ok).length !== 1)) fail('抽題再考錯');
  if (JSON.stringify(L4).length > 1500000) fail('做過的題目太大：' + JSON.stringify(L4).length);
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
