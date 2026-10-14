/* ===== 72-learn-c：大師之路第三段（第 6–7 階：翻牌後基礎、範圍思維；指定牌局、實戰考核） ===== */

/* ===== 指定牌局：把牌堆排好，讓某個座位拿到指定的手牌、公牌照指定的發 =====
   要在 newHand 之後、發牌（gameStep 的 deal）之前呼叫。發牌順序：按鈕左邊第一位開始一人一張發兩輪，之後公牌依序 */
function stackDeck(H, seat, hole, board) {
  const n = H.n, k = ((seat - H.button + n) % n) || n;          // 這個座位是第幾個拿到牌的（1..n）
  const want = [[k - 1, hole[0]], [n + k - 1, hole[1]]];
  (board || []).forEach((c, i) => want.push([2 * n + i, c]));
  for (const [pos, c] of want) {
    const j = H.deck.indexOf(c);
    if (j < 0 || j === pos) continue;
    const t = H.deck[pos]; H.deck[pos] = c; H.deck[j] = t;
  }
}

/* ===== 翻牌的質地 ===== */
function flopTexture(board) {
  const rs = board.map((c) => c >> 2), ss = board.map((c) => c & 3);
  const nSuit = new Set(ss).size, paired = new Set(rs).size < rs.length;
  const suit = nSuit === 1 ? 'm' : nSuit === 2 ? 't' : 'r';
  const set = new Set(rs); if (set.has(12)) set.add(-1);
  let conn = 0;
  for (let lo = -1; lo <= 8; lo++) { let c = 0; for (let x = lo; x < lo + 5; x++) if (set.has(x) && !(x === -1 && lo > -1)) c++; conn = Math.max(conn, Math.min(3, c)); }
  const uniq = new Set(rs).size;
  if (conn > uniq) conn = uniq;
  const high = Math.max(...rs);
  const wet = (suit === 'm' ? 3 : suit === 't' ? 1.5 : 0) + (conn >= 3 ? 2 : conn === 2 ? 1 : 0) - (paired ? 1 : 0);
  const type = suit === 'm' ? '單色' : paired ? '有對子' : (suit === 'r' && conn <= 1) || (suit === 'r' && conn === 2 && high >= 10) ? '乾' : (suit === 't' && conn >= 2) || conn >= 3 ? '濕' : '';
  return { suit, paired, conn, high, wet, type };
}
function textureWords(b) {
  const t = flopTexture(b);
  return [t.suit === 'm' ? '三張同花' : t.suit === 't' ? '兩張同花（有同花聽牌）' : '三種花色（沒有同花聽牌）', t.paired ? '有對子' : t.conn >= 3 ? '三張很連（很多順子、聽牌）' : t.conn === 2 ? '有兩張比較近（有一些順子聽牌）' : '點數分散（順子很難）'].join('、');
}
function randFlop(rng, test, tries) { for (let i = 0; i < (tries || 3000); i++) { const b = dealN(rng, 3).sort((x, y) => y - x); if (!test || test(flopTexture(b), b)) return b; } return null; }

/* ===== 題目產生器 ===== */
/* 中了什麼（照工作室的牌型分類） */
const MADE_GROUP = [[0, 1, 2, 3, 4, 5], [6, 7], [8, 9], [10, 11, 12], [13, 14]];
QGEN.madeHand = (rng) => {
  const target = pickOne([5, 6, 7, 7, 8, 9, 10, 11, 12, 13, 4], rng);
  for (let i = 0; i < 5000; i++) {
    const cs = dealN(rng, 5), hole = cs.slice(0, 2), board = cs.slice(2), c = handCategory(hole[0], hole[1], board);
    if (c !== target) continue;
    const near = [c - 2, c - 1, c + 1, c + 2, 13].filter((x) => x >= 0 && x <= 13 && x !== c);
    const opts = mkOpts(CATG[c], shuffleArr(near, rng).slice(0, 3).map((x) => CATG[x]), rng);
    return { gen: 'madeHand', prompt: '翻牌後，你的牌算是哪一種？', vis: { k: 'hand', hole, board }, opts,
      explain: CATG[c] + '：' + CATG_NOTE[c] + '。' + (c <= 5 ? '這是很強的牌。' : c <= 7 ? '通常是領先的好牌，可以下注拿價值。' : c <= 9 ? '有一點價值，但很怕大注。' : c <= 12 ? '還沒成牌，看價錢和出牌數決定。' : '幾乎沒有攤牌價值。'), key: 'mh|' + cs.join(',') };
  }
  return QGEN.outsRand(rng);
};
/* 哪一個翻牌最濕 */
QGEN.texture = (rng) => {
  for (let i = 0; i < 300; i++) {
    const fs = [randFlop(rng), randFlop(rng), randFlop(rng)];
    const ws = fs.map((b) => flopTexture(b).wet), mx = Math.max(...ws), sorted = ws.slice().sort((a, b) => b - a);
    if (sorted[0] - sorted[1] < 1.5) continue;
    const ans = ws.indexOf(mx);
    return { gen: 'texture', prompt: '哪一個翻牌最「濕」（同花、順子的可能最多，牌力最容易變）？', vis: { k: 'flops', fs }, opts: fs.map((b, k) => ({ t: '第 ' + (k + 1) + ' 個', ok: k === ans })),
      explain: fs.map((b, k) => '第 ' + (k + 1) + ' 個 ' + cardsTok(b) + '：' + textureWords(b)).join('；') + '。同花聽牌和順子聽牌越多，越濕；三種花色、點數分散的叫「乾」。', key: 'tx|' + fs.map((b) => b.join(',')).join('|') };
  }
  return QGEN.madeHand(rng);
};
QGEN.textureType = (rng) => {
  const want = pickOne(['乾', '濕', '有對子', '單色'], rng);
  const b = randFlop(rng, (t) => t.type === want);
  if (!b) return QGEN.texture(rng);
  return { gen: 'textureType', prompt: '這個翻牌屬於哪一種？', vis: { k: 'hand', hole: [], board: b }, opts: ['乾', '濕', '有對子', '單色'].map((x) => ({ t: x, ok: x === want })),
    explain: cardsTok(b) + '：' + textureWords(b) + '。乾＝三種花色、點數分散（像 K-7-2）；濕＝有同花聽牌又很連（像 J-10-9 兩張同花）；有對子的翻牌中東西的人比較少；單色＝三張同花。', key: 'tt|' + b.join(',') };
};
/* 持續下注的一般原則（按鈕開、大盲跟，大盲過牌給你） */
const CBET_OPT = ['小注、常常下（約 1/3 底池）', '大注、只用強牌和好的聽牌下', '大多過牌'];
function cbetRule(b) {
  const t = flopTexture(b);
  if (t.suit === 'm') return -1;
  if (t.paired) return 0;
  if (t.high >= 11 && t.conn <= 2 && t.suit === 'r') return 0;                 // A、K 高的乾翻牌
  if (t.high >= 11 && t.conn <= 1) return 0;
  if (t.high >= 6 && t.high <= 8 && t.conn >= 3) return 2;                    // 中間的連張（8、9、10 高）：大盲有利
  if (t.high >= 9 && t.high <= 10 && t.conn >= 3 && t.suit === 't') return 1;  // J、Q 高又很連、有同花
  return -1;
}
QGEN.cbet = (rng) => {
  const want = pickOne([0, 0, 1, 2], rng);
  const b = randFlop(rng, (t, bb) => cbetRule(bb) === want, 6000);
  if (!b) return QGEN.textureType(rng);
  const why = ['這種翻牌對開牌的人有利（你的範圍裡大牌、超對比較多，大盲的範圍很少中東西），小注就能讓很多牌棄牌，用整個範圍常常下注。',
    'J、Q 高又很連、有同花聽牌：雙方都常中東西，牌力會一直變。下注就要下大一點，用強牌和好的聽牌下，其他過牌。',
    '中間的連張（像 9-8-7、8-6-5）對大盲有利：大盲跟注的範圍裡 9-8、8-7、7-6 這些同花連張和小對子比較多，你的範圍是大牌。大多過牌，只用很強的牌下注。'][want];
  return { gen: 'cbet', prompt: '6 人桌，你在按鈕開牌，大盲跟注（單挑）。翻牌下來，大盲過牌給你。一般原則是？', vis: { k: 'hand', hole: [], board: b }, opts: CBET_OPT.map((x, k) => ({ t: x, ok: k === want })),
    explain: cardsTok(b) + '：' + textureWords(b) + '。' + why + '（這是一般原則；要看每一手牌的比例，用 GTO 工作室解。）', key: 'cb|' + b.join(',') };
};
/* 最少防守比例 */
QGEN.mdf = (rng) => {
  const [a, c, t] = pickOne(BET_FR, rng), f = a / c, ans = Math.round(1 / (1 + f) * 100);
  return { gen: 'mdf', prompt: '對手下注' + (/^\d/.test(t) ? ' ' : '') + t + '。如果你棄牌太多，他用任何牌詐唬都會賺。你至少要繼續（跟或加注）多少比例的範圍？', vis: null,
    opts: pctOpts(ans, [f / (1 + 2 * f) * 100, 100 - f / (1 + 2 * f) * 100, ans + 10, ans - 12, 50], rng),
    explain: '最少防守比例 ＝ 底池 ÷ (底池 ＋ 他的下注) ＝ 1 ÷ (1 ＋ ' + fmtF(f) + ') ≈ ' + ans + '%。他下注越大，你可以棄越多；小注就要防很多。這是對「範圍」說的，不是每一手牌都要跟。', key: 'mdf|' + t };
};
/* 面對下注：用牌局教練（勝率對範圍＋底池賠率）出題 */
function faceBetHand(rng, hole, board, frac) {
  const T = newTable({ n: 2, names: ['你', '對手'], styles: ['tag', 'tag'], level: 2, button: 0 });   // newHand 會移到 1：對手是按鈕
  const H = newHand(T, rng);
  const used = new Set(hole.concat(board)), rest = []; for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  stackDeck(H, 0, hole, board);
  while (H.phase !== 'bet') gameStep(H);
  applyAction(H, { t: 'r', to: Math.round(H.bb * 2.5) });                  // 按鈕開牌
  applyAction(H, { t: 'c' });                                              // 你在大盲跟
  while (H.phase !== 'bet') gameStep(H);
  applyAction(H, { t: 'x' });                                              // 你過牌
  const pot = potTotal(H), bet = Math.max(H.bb, Math.round(pot * frac));
  applyAction(H, { t: 'r', to: bet });                                     // 他下注
  return H;
}
QGEN.faceBet = (rng) => {
  for (let i = 0; i < 25; i++) {
    const cs = dealN(rng, 5), hole = cs.slice(0, 2), board = cs.slice(2), cat = handCategory(hole[0], hole[1], board);
    if (cat <= 4 || cat === 14) continue;                                   // 太強的牌沒什麼好想
    const [a, c, t] = pickOne(BET_FR.slice(1, 6), rng);
    const H = faceBetHand(rng, hole, board, a / c);
    if (H.toAct !== 0) continue;
    const adv = coachAdvice(H, rng), e = adv.eff === undefined ? adv.eq : adv.eff;
    if (Math.abs(e - adv.need) < 0.08 && adv.act.t !== 'r') continue;       // 太接近的不出
    const fam = adv.act.t === 'f' ? '棄牌' : adv.act.t === 'r' ? '加注' : '跟注';
    const L = legalActions(H);
    return { gen: 'faceBet', prompt: '你在大盲跟了按鈕的開牌。翻牌你過牌，他下注 ' + L.callAmt + '（' + t + '，底池原本 ' + (potTotal(H) - L.callAmt) + '）。你：', vis: { k: 'hand', hole, board },
      opts: ['棄牌', '跟注', '加注'].map((x) => ({ t: x, ok: x === fam })),
      explain: '你現在：' + CATG[cat] + '。' + adv.reasons.slice(1).join('') + '（教練照他的動作估範圍、算勝率，再跟底池賠率比。）', key: 'fb|' + cs.join(',') + '|' + t };
  }
  return QGEN.madeHand(rng);
};
/* 範圍在翻牌中東西的比例 */
QGEN.rangeHit = (rng) => {
  const who = pickOne([['按鈕開牌', '6/rfi/BTN', 'raise'], ['槍口開牌', '6/rfi/UTG', 'raise'], ['大盲跟按鈕', '6/vsOpen/BB/BTN', 'call']], rng);
  const b = randFlop(rng, (t) => !t.paired && t.suit !== 'm');
  const W = chartRanges(who[1])[who[2]], dead = new Set(b);
  let tot = 0, hit = 0, strong = 0;
  for (let k = 0; k < NCOMBO; k++) { const w = W[k]; if (!(w > 0) || dead.has(COMBO_A[k]) || dead.has(COMBO_B[k])) continue; tot += w; const c = handCategory(COMBO_A[k], COMBO_B[k], b); if (c <= 9) hit += w; if (c <= 7) strong += w; }
  const ans = Math.round(hit / tot * 100 / 5) * 5;
  return { gen: 'rangeHit', prompt: '「' + who[0] + '」的整個範圍，在這個翻牌上至少中一對（或更好）的比例大約多少？', vis: { k: 'hand', hole: [], board: b },
    opts: pctOpts(ans, [ans + 15, ans - 15, ans + 30, ans - 25, 50].map((x) => Math.round(x / 5) * 5), rng),
    explain: '照圖表的範圍一手一手算：至少一對 ' + Math.round(hit / tot * 100) + '%（頂對以上 ' + Math.round(strong / tot * 100) + '%）。大部分的翻牌，任何範圍都只有三四成中東西——這就是為什麼「沒中」是常態，下注和棄牌都要看整個範圍。', key: 'rh|' + who[0] + '|' + b.join(',') };
};
/* 範圍優勢：按鈕開牌 vs 大盲跟注（離線算好：勝率、兩對以上的比例） */
const RANGE_ADV = [['AsKd7c', 0.556, 0.063, 0.045], ['As7d2c', 0.555, 0.056, 0.045], ['Ks8d3c', 0.505, 0.04, 0.035], ['Kd9s4c', 0.549, 0.041, 0.031], ['QsJd5c', 0.553, 0.041, 0.029], ['Js8d3c', 0.51, 0.022, 0.031], ['Ts9d6c', 0.504, 0.053, 0.073], ['9s8d7c', 0.498, 0.078, 0.105], ['8s6d5c', 0.492, 0.037, 0.043], ['7s5d4c', 0.517, 0.033, 0.042], ['6s5d2c', 0.539, 0.021, 0.025], ['5s4d3c', 0.539, 0.059, 0.072], ['AsAd7c', 0.554, 0.221, 0.156], ['KsKd4c', 0.555, 0.131, 0.121], ['8s8d3c', 0.503, 0.066, 0.131], ['5s5d2c', 0.568, 0.046, 0.038], ['7s7d2c', 0.534, 0.054, 0.093], ['Qs3d3c', 0.55, 0.027, 0.03], ['AhKh7h', 0.54, 0.11, 0.086], ['Js9s4s', 0.53, 0.099, 0.076], ['8h7h2c', 0.5, 0.023, 0.037], ['9d8d6c', 0.502, 0.048, 0.063], ['Kc7d2c', 0.537, 0.028, 0.037], ['Ah9c4d', 0.576, 0.057, 0.046]];
QGEN.rangeAdv = (rng) => {
  for (let i = 0; i < 100; i++) {
    const a = pickOne(RANGE_ADV, rng), b = pickOne(RANGE_ADV, rng);
    if (a === b || Math.abs(a[1] - b[1]) < 0.035) continue;
    const best = a[1] > b[1] ? a : b;
    return { gen: 'rangeAdv', prompt: '按鈕開牌、大盲跟注。哪一個翻牌對按鈕（開牌的人）比較有利？', vis: { k: 'flops', fs: [parseCards(a[0]), parseCards(b[0])] }, opts: [{ t: '第 1 個', ok: best === a }, { t: '第 2 個', ok: best === b }],
      explain: '把兩邊的範圍一路比到攤牌：' + [a, b].map((x, k) => '第 ' + (k + 1) + ' 個按鈕勝率 ' + Math.round(x[1] * 100) + '%（兩對以上：按鈕 ' + Math.round(x[2] * 100) + '%、大盲 ' + Math.round(x[3] * 100) + '%）').join('；') + '。一般來說 A、K、Q 高的翻牌按鈕比較有利（大盲把 AK、AQ 這些拿去 3-bet 了）；中間的連張（9-8-7、8-6-5）和中等對子的翻牌（8-8、7-7）大盲比較有利。但要看兩邊範圍實際中了多少——例如 K-8-3，大盲跟注的範圍裡 8 很多，差距就小。', key: 'ra|' + a[0] + '|' + b[0] };
  }
  return QGEN.rangeHit(rng);
};
/* 公牌上剩幾種組合 */
QGEN.combosOnBoard = (rng) => {
  const names = ['AK', 'AQ', 'KQ', 'AJ', 'KJ', 'QJ', 'AA', 'KK', 'QQ', 'JJ'];
  for (let i = 0; i < 200; i++) {
    const nm = pickOne(names, rng), r1 = RANKS.indexOf(nm[0]), r2 = RANKS.indexOf(nm[1]);
    const b = dealN(rng, 3), hasR = b.some((c) => (c >> 2) === r1 || (c >> 2) === r2);
    if (!hasR && rng() < 0.8) continue;
    const dead = new Set(b);
    let n = 0;
    for (let k = 0; k < NCOMBO; k++) { const x = COMBO_A[k], y = COMBO_B[k]; const ok = (r1 === r2) ? ((x >> 2) === r1 && (y >> 2) === r1) : (((x >> 2) === r1 && (y >> 2) === r2) || ((x >> 2) === r2 && (y >> 2) === r1)); if (ok && !dead.has(x) && !dead.has(y)) n++; }
    const full = r1 === r2 ? 6 : 16;
    return { gen: 'combosOnBoard', prompt: '公牌是這三張。對手拿「' + nm + '」（同花、不同花都算）還剩幾種組合？', vis: { k: 'hand', hole: [], board: b }, opts: numOpts(n, [full, full / 2, n + 3, n - 3, 9, 4, 1].filter((x) => x >= 0).map(Math.round), rng),
      explain: (r1 === r2 ? '對子本來 6 種（4 張挑 2 張）' : '本來 4 × 4 ＝ 16 種') + '；公牌用掉的牌不能在他手上：' + (r1 === r2 ? '剩 ' + (4 - b.filter((c) => (c >> 2) === r1).length) + ' 張 ' + nm[0] + ' 挑 2 張 ＝ ' + n + ' 種' : '剩 ' + (4 - b.filter((c) => (c >> 2) === r1).length) + ' 張 ' + nm[0] + ' × ' + (4 - b.filter((c) => (c >> 2) === r2).length) + ' 張 ' + nm[1] + ' ＝ ' + n + ' 種') + '。', key: 'cob|' + nm + '|' + b.join(',') };
  }
  return QGEN.blockCombos(rng);
};
/* 觀念題 */
addStatic('s6c', [
  { prompt: '多人底池（3 個人以上看翻牌），持續下注應該？', opts: ['下得比單挑少，用比較強的牌下', '一樣常下', '更常下，人多才要嚇他們', '永遠不下'], ans: 0,
    explain: '人越多，越可能有人中東西；用整個範圍小注亂下會被跟到底。多人底池下注要更有牌。' },
  { prompt: '你翻牌前加注，翻牌完全沒中，對手是很愛跟注的人（跟注站）。持續下注？', opts: ['少詐唬，等有牌再下', '多詐唬，他會棄', '一定全下', '跟平常一樣'], ans: 0,
    explain: '詐唬要對手會棄才有用。對跟注站少詐唬、有牌就多下注收錢。' },
]);
addStatic('s6d', [
  { prompt: '價值下注的目的？', opts: ['讓比你差的牌跟你', '讓比你好的牌棄牌', '保護自己不輸', '看看對手有什麼'], ans: 0,
    explain: '價值下注要「比你差的牌會跟」。如果只有比你好的牌會跟，就不是價值下注。' },
  { prompt: '河牌你拿中等的牌（例如中對），對手過牌。通常？', opts: ['過牌，直接攤牌比大小', '大注下注', '全下', '一定要下注才會贏'], ans: 0,
    explain: '中等的牌下注時，比你差的牌多半會棄、比你好的牌會跟——賺不到。有攤牌價值的牌，河牌常常過牌。' },
  { prompt: '詐唬最好的牌是？', opts: ['沒攤牌價值、但擋住對手好牌的牌', '中等的對子', '頂對', '任何牌都一樣'], ans: 0,
    explain: '詐唬用「攤牌一定輸」的牌，最好還能擋住對手的強牌（例如河牌沒中的同花聽牌，手上有那個花色的 A）。中等的牌留著攤牌。' },
]);
addStatic('s6e', [
  { prompt: '翻牌你持續下注被跟，轉牌來一張大牌（例如 A），你翻牌前是加注的人。這張牌？', opts: ['通常對你有利，可以繼續下注', '對跟注的人有利', '跟誰都無關', '一定要過牌'], ans: 0,
    explain: '翻牌前加注的人範圍裡 A 比較多；轉牌來 A，他的範圍變得更強，可以繼續施壓（第二槍）。' },
  { prompt: '轉牌補到同花、順子的聽牌（例如第三張同花），你是翻牌下注的人，手上只有一對。通常？', opts: ['放慢，過牌或小注控制底池', '加大下注', '全下', '棄牌'], ans: 0,
    explain: '聽牌成了，對手的範圍變強，你的一對變得很難打；放慢讓底池別太大。' },
]);
addStatic('s7a', [
  { prompt: '「範圍」是什麼？', opts: ['對手在這個情況下可能拿著的所有手牌', '對手最可能的那一手牌', '你的籌碼數', '牌型大小的排名'], ans: 0,
    explain: '你看不到他的牌，但他的位置和每一個動作，會讓某些牌比較可能、某些牌不可能——那一整組可能的牌就是範圍。' },
  { prompt: '對手在槍口加注、翻牌 K 高，他大注下注。跟「按鈕加注、同樣下注」比，他的範圍？', opts: ['更強', '更弱', '一樣', '看不出來'], ans: 0,
    explain: '槍口開牌範圍比按鈕緊很多（約 19% 對 42%），大牌比例高，同樣的下注代表更強的牌。' },
]);
addStatic('s7d', [
  { prompt: '翻牌前跟注、翻牌過牌跟注、轉牌突然大加注。這種對手最常是？', opts: ['很強的牌（兩對、三條、順子）', '純詐唬', '什麼都沒中', '只有一對'], ans: 0,
    explain: '被動的人突然轉為大額加注，通常是中了大牌（或轉牌成了聽牌）。範圍要一步一步縮小：每個動作都在去掉一些牌。' },
  { prompt: '對手翻牌前 3-bet、翻牌 [Kh7c2d] 小注下注。他的範圍最可能？', opts: ['很多大牌：超對、AK、KQ，也有一些沒中的 AQ', '主要是小對子', '主要是同花連張', '全部都是詐唬'], ans: 0,
    explain: '3-bet 範圍以大牌為主；K 高的乾翻牌對 3-bet 的人很好，小注常常用整個範圍下注。' },
]);

/* ===== 實戰考核：到牌桌打指定的牌（單挑，教練先不給建議，按完評分） ===== */
const EXAM_SPOTS = {
  6: [['AsKd', 'Kc7h2s9d4c'], ['QhQd', '9s7s3cKd2h'], ['AhJh', 'Kh7h2c5dTs'], ['9c8c', '7d6s2hKhAc'], ['KsTs', 'Jd8c3h2s6d'], ['7d7c', 'Qs7h2d5cJs'], ['AdTc', 'Ts9s8h3c2d'], ['KhQh', '5c4d2s8hJc'],
    ['JsTs', 'Jh5c4dAd9c'], ['6s6h', 'AdKc9h4s2c'], ['Ac5c', 'Kc8c3d2hQs'], ['Qd9d', 'Qs8h2c7c4c'], ['AhQc', 'Ad6c6h9sKd'], ['8s8h', 'Jc9d4sQh3c'], ['KdJd', 'Kh9c3cTd2s'], ['Td9d', '8c7h2sAsKh']],
  7: [['AsQs', 'Qh8d3c4s9h'], ['KhKs', 'Ad7c2h5sJd'], ['9h9d', '8h7h6c2dKs'], ['AcJd', 'Jh6s6d3cAh'], ['QsJs', 'Ts9c2hKd4s'], ['5d5c', 'Kh5h4h9c2d'], ['AhKh', '7c4d2sJsQc'], ['Tc8c', 'Jc9h3c2dAs'],
    ['KcQd', 'Kd8h8c3s7h'], ['Jh9h', '9s5c2dQhTc'], ['As4s', 'Ks9s6d7c3h'], ['TsTh', 'Ad9c5h4d2s'], ['8d7d', '6c5h2s9dKc'], ['AdKc', 'Ac9s9h4d3c'], ['QhTh', 'Jc8d2h9s5h'], ['6h5h', '7h4c2d3sKh']],
};
const EXAMS = {
  '6-7': { stage: 6, need: 20, pass: 0.75, spots: 6, villains: ['station', 'tag'] },
  '7-5': { stage: 7, need: 25, pass: 0.8, spots: 7, villains: ['tag', 'lag', 'station'] },
};
/* 考核分數：✓ 算 1、△ 算一半 */
function examScore(grades) { let s = 0; for (const g of grades) s += g === 'good' ? 1 : g === 'ok' ? 0.5 : 0; return grades.length ? s / grades.length : 0; }
function examCounts(grades) { const c = { good: 0, ok: 0, bad: 0 }; for (const g of grades) c[g]++; return c; }
/* 開始一次考核：題庫洗牌；對手的風格每兩手換一次 */
function examNew(id, rng) {
  const X = EXAMS[id];
  const spots = shuffleArr(EXAM_SPOTS[X.spots].map(([h, b]) => ({ hole: parseCards(h), board: parseCards(b) })), rng);
  return { id, stage: X.stage, need: X.need, passAt: X.pass, villains: X.villains.slice(), spots, i: 0, hands: 0, grades: [], done: false, score: 0, pass: false };
}
function examNextSpot(E, rng) { if (E.i >= E.spots.length) { shuffleArr(E.spots, rng); E.i = 0; } return E.spots[E.i++]; }
function examVillain(E) { return E.villains[Math.floor(E.hands / 2) % E.villains.length]; }
/* 一手結束：把這一手的評分加進去；夠了就算分數 */
function examAdd(E, marks) {
  if (E.done) return false;
  for (const m of marks) E.grades.push(m);
  E.hands++;
  if (E.grades.length >= E.need) { E.done = true; E.score = examScore(E.grades); E.pass = E.score >= E.passAt - 1e-9; }
  return E.done;
}

/* 第 6-1 課的牌力分級表：每一級一個例子（測試會用 handCategory 檢查） */
const CATG_EX = [['7s7d', '7h7c2d'], ['KsKd', 'Kh7c7d'], ['AhTh', 'Kh7h2h'], ['9c8d', 'Ts7h6c'], ['5s5d', 'Kc5h2d'], ['KsQd', 'KhQc4s'], ['QsQd', 'Jh7c2d'], ['AhKc', 'Kd8s3h'],
  ['Ts9s', 'Kd9c3h'], ['Ac3c', 'KdTh3s'], ['AhJh', 'Kh7h2c'], ['JcTd', '9h8s2c'], ['KsJd', 'Qc9h4s'], ['AsQd', '9h6c2s'], ['3c2d', 'AhAsKdKcQh']];
const CATG_GRP = [[[0, 1, 2, 3, 4, 5], '很強：讓底池變大'], [[6, 7], '通常領先：下注收錢'], [[8, 9], '有一點價值：怕大注'], [[10, 11, 12], '聽牌：看價錢和出牌數'], [[13, 14], '沒中：幾乎沒有攤牌價值']];

/* ===== 第 6–7 階的課 ===== */
COURSE[5].lessons = [
  { id: '6-1', title: '中了什麼：牌力分級', sum: '翻牌後先分清楚自己的牌在哪一級。', read: [
    '翻牌後的第一步：<b>你的牌在哪一級</b>。教練、工作室都用同一套分類：',
    { k: 'cats2' },
    { k: 'tip', html: '大方向：<b>兩對以上</b>是很強的牌，要讓底池變大；<b>超對、頂對</b>通常領先，可以下注收錢；<b>中對、弱對</b>有一點價值，但很怕大注；<b>聽牌</b>看價錢和出牌數；<b>高牌</b>幾乎沒有攤牌價值。' },
    '注意「公牌自己的牌型」：公牌有對子時，你的「兩對」可能只是一對；最好的五張都是公牌時，你的手牌沒有用到。',
  ], practice: { gens: ['madeHand'], n: 8 }, quiz: { gens: ['madeHand'], n: 8, pass: 7 } },
  { id: '6-2', title: '公牌質地', sum: '乾、濕、有對子、單色：牌力多容易變。', read: [
    '同樣是頂對，在不同的翻牌上價值差很多。看翻牌的「質地」：',
    { k: 'tip', html: '<b>乾</b>：三種花色、點數分散（像 [Ks7d2c]）——牌力不太會變，誰領先通常一路領先。<br><b>濕</b>：有同花聽牌又很連（像 [JhTh9c]）——很多聽牌，下一張就可能翻盤。<br><b>有對子</b>（像 [8s8d3c]）：中東西的人少。<br><b>單色</b>（像 [Ah9h4h]）：已經可能有同花。' },
    '乾的翻牌：領先的牌可以慢慢收錢，詐唬小注就有效。濕的翻牌：領先的牌要「收費」——讓聽牌的人付錢，不要讓他們免費看下一張。',
  ], practice: { gens: ['textureType', 'texture'], n: 6 }, quiz: { gens: ['textureType', 'texture'], n: 8, pass: 7 } },
  { id: '6-3', title: '持續下注', sum: '翻牌前加注的人，翻牌要不要繼續下注。', read: [
    '<b>持續下注</b>（c-bet）：翻牌前加注的人，翻牌繼續下注。為什麼有效：對手大部分時候沒中（第 2 階：不是對子的牌翻牌中一對只有約 32%）。',
    { k: 'tip', html: '<b>一般原則</b>（按鈕開、大盲跟、大盲過牌給你）：<br>① <b>A、K 高的乾翻牌、有對子的翻牌</b>：小注（約 1/3 底池）、常常下——這些翻牌對開牌的人有利。<br>② <b>J、Q 高又很連、有同花</b>：下注就下大一點，只用強牌和好的聽牌，其他過牌。<br>③ <b>中間的連張</b>（9-8-7、8-6-5）：大多過牌——這些翻牌對大盲有利。' },
    '再加兩條：<b>多人底池少下</b>（人越多越可能有人中）；<b>對很愛跟的人少詐唬</b>。',
  ], practice: { gens: ['cbet', 's6c'], n: 6 }, quiz: { gens: ['cbet', 's6c', 'cbet'], n: 8, pass: 7 } },
  { id: '6-4', title: '下注大小', sum: '小注、大注各為了什麼；最少防守比例。', read: [
    '下注大小跟著目的走：',
    { k: 'tip', html: '<b>小注（1/4–1/3 底池）</b>：用很多牌下（範圍下注），乾的翻牌、你的範圍有優勢時。<br><b>中大注（2/3–1 個底池）</b>：濕的翻牌、要讓聽牌付錢，或你的牌很兩極（很強或詐唬）。<br><b>超過底池</b>：河牌你很強、對手的範圍被限制住時。' },
    '<b>最少防守比例</b>：對手下注時，你至少要繼續（跟或加注）底池 ÷ (底池 ＋ 他的下注) 的範圍，否則他用任何牌詐唬都會賺。半個底池要防 67%、一個底池 50%。',
    '<b>價值下注</b>要「比你差的牌會跟」；<b>詐唬</b>要「比你好的牌會棄」。中等的牌兩個都做不到——常常過牌就好。',
  ], practice: { gens: ['mdf', 's6d', 'betNeed'], n: 6 }, quiz: { gens: ['mdf', 's6d', 'betNeed'], n: 8, pass: 7 } },
  { id: '6-5', title: '面對下注的框架', sum: '牌力 → 他的範圍 → 價錢 → 決定。', read: [
    '面對下注，照四步想（牌局教練也是這樣算的）：',
    { k: 'tip', html: '① <b>我的牌在哪一級</b>（第 6-1 課）。<br>② <b>他的下注代表什麼</b>：照他的位置、翻牌前的動作、這次下注的大小，估他的範圍。<br>③ <b>價錢</b>：要跟的 ÷ 跟完的底池（第 5 階）。<br>④ <b>勝率打折後夠不夠</b>：夠就跟，很強就加注，不夠就棄（聽牌再加上隱含賠率）。' },
    '這一課的題目都是牌局教練真的算過的局面：你在大盲跟了按鈕的開牌，翻牌你過牌、他下注。答完看解釋，裡面就是教練的四步。',
    '牌局裡輪到你時，教練框的「📖 詳細解說」會用那一手的實際數字，把這四步再算一次。',
  ], practice: { gens: ['faceBet'], n: 6 }, quiz: { gens: ['faceBet'], n: 8, pass: 6 } },
  { id: '6-6', title: '轉牌與河牌的計畫', sum: '第二槍、放慢、河牌價值與詐唬。', read: [
    '翻牌下注之前，先想好<b>轉牌怎麼辦</b>：',
    { k: 'tip', html: '<b>繼續下注（第二槍）</b>：轉牌讓你的範圍更強（例如來 A、K）、或你補到聽牌、或你很強。<br><b>放慢</b>：轉牌讓對手的範圍變強（聽牌成了、低的連張），你只有一對時，過牌或小注控制底池。<br><b>河牌</b>：很強的牌下注收錢；沒攤牌價值、又擋住對手好牌的牌拿來詐唬；<b>中等的牌過牌攤牌</b>。' },
    '每一街都問：「我下注，比我差的會跟嗎？比我好的會棄嗎？」兩個都不會，就過牌。',
  ], practice: { gens: ['s6e', 's6d'], n: 5 }, quiz: { gens: ['s6e', 's6d', 's6c'], n: 6, pass: 5 } },
  { id: '6-7', title: '實戰考核', sum: '到牌桌打指定的牌：教練先不說話，評 20 個決定。', exam: '6-7', read: [
    '<b>實戰考核</b>：到牌桌上和一個電腦單挑，<b>發給你的牌和公牌都是設計好的</b>（頂對、超對、聽牌、三條、沒中……第 6 階教過的情況）。',
    '考核時教練<b>先不給建議</b>，你按完才評分（✓、△、✗）。評滿 <b>20 個決定</b>，✓ 算 1 分、△ 算半分，平均 <b>75%</b> 以上過關。',
    { k: 'tip', html: '每一個決定前，照第 6-5 課的四步想：我的牌哪一級 → 他的範圍 → 價錢 → 勝率夠不夠。' },
  ] },
].map((l) => lessonFinish(l, 6));
COURSE[6].lessons = [
  { id: '7-1', title: '用範圍思考', sum: '對手不是「一手牌」，是一整組牌。', read: [
    '新手猜「他是不是拿 AK」；高手想「<b>他可能拿的所有牌</b>」——這叫<b>範圍</b>。每個動作都會讓範圍變窄：開牌的位置、跟注還是加注、翻牌下注的大小。',
    '範圍很少是「全部都很強」或「全部都詐唬」，通常是混在一起。所以決定不是「他有沒有」，而是「<b>對他整個範圍，我這樣做平均賺不賺</b>」。',
    { k: 'tip', html: '一個重要事實：大部分的翻牌，<b>任何範圍都只有三四成中一對以上</b>。所以沒中是常態，下注、跟注、棄牌都要看整個範圍。' },
  ], practice: { gens: ['rangeHit', 's7a'], n: 6 }, quiz: { gens: ['rangeHit', 's7a', 'rangeHit'], n: 8, pass: 6 } },
  { id: '7-2', title: '範圍優勢與堅果優勢', sum: '哪一個翻牌對誰有利；誰有比較多的大牌。', read: [
    '<b>範圍優勢</b>：把兩邊整個範圍一路比到攤牌，誰的勝率高。<b>堅果優勢</b>：誰的範圍裡「最強的牌」（兩對、三條、順子）比較多。',
    { k: 'radvTable' },
    { k: 'tip', html: '規律：<b>A、K、Q 高的翻牌</b>多半對開牌的人有利（大盲把 AK、AQ 拿去 3-bet，跟注的範圍裡大牌少）；<b>中間的連張</b>（9-8-7、8-6-5）大盲比較有利；<b>中等對子的翻牌</b>（8-8-3、7-7-2）大盲的三條比較多（堅果優勢）；很低的翻牌（5-4-3）按鈕的超對多、勝率還是比較高，但大盲的兩對、順子比較多。上表就是照圖表範圍實際算出來的。' },
    '有範圍優勢的人可以小注、常常下注（第 6-3 課）；有堅果優勢的人可以下大注。',
  ], practice: { gens: ['rangeAdv'], n: 6 }, quiz: { gens: ['rangeAdv'], n: 8, pass: 7 } },
  { id: '7-3', title: '組合數與阻擋牌', sum: '數組合，比猜「他是不是有」準。', read: [
    '每一種牌的組合數不一樣：對子 6 種、不是對子 16 種（同花 4、不同花 12）。公牌和你手上的牌會<b>拿走</b>一些組合：',
    { k: 'tip', html: '公牌有一張 K：KK 剩 3 種、AK 剩 12 種。<br>公牌有 K 又有 7：K7 剩 9 種。<br>你手上有 A：對手 AA 剩 3 種（少一半）。這就是<b>阻擋牌</b>。' },
    '用法：河牌對手全下，他的強牌（例如三條 7）只剩 1–3 種、詐唬的牌卻有十幾種，跟注常常比你想的划算；反過來，你手上的牌擋住他的強牌時，詐唬更容易成功。',
  ], practice: { gens: ['combosOnBoard', 'blockCombos'], n: 6 }, quiz: { gens: ['combosOnBoard', 'blockCombos'], n: 8, pass: 7 } },
  { id: '7-4', title: '從動作還原範圍', sum: '每個動作都在刪掉一些牌。', read: [
    '一步一步縮小對手的範圍：',
    { k: 'tip', html: '① <b>翻牌前</b>：從哪個位置開、跟還是 3-bet（圖表）。<br>② <b>翻牌</b>：下注代表有東西或詐唬；過牌跟注常是中等的牌或聽牌；加注很少是空氣。<br>③ <b>轉牌、河牌</b>：被動的人突然大加注，幾乎都是大牌。' },
    '牌局裡你可以看到教練怎麼估：輪到你時打開「📖 詳細解說」，有對手範圍的小格子圖（照他的每一個動作算的）；或到「範圍對範圍」自己算。',
  ], practice: { gens: ['s7d', 's7a', 'rangeHit'], n: 5 }, quiz: { gens: ['s7d', 's7a', 'rangeAdv', 'combosOnBoard'], n: 8, pass: 7 } },
  { id: '7-5', title: '實戰考核', sum: '指定的牌、不同風格的對手：評 25 個決定，80% 過關。', exam: '7-5', read: [
    '第二次<b>實戰考核</b>：一樣是設計好的牌，對手的風格會換（緊凶、鬆凶、跟注站），要用範圍思考對付不同的人。',
    '評滿 <b>25 個決定</b>，平均 <b>80%</b> 以上過關（✓ 1 分、△ 半分）。',
    { k: 'tip', html: '對手的風格寫在他的名牌上：緊凶的人下注通常有牌；鬆凶的人常常詐唬；跟注站很少棄牌——對他少詐唬、有牌多下注。' },
  ] },
].map((l) => lessonFinish(l, 7));
for (const id of Object.keys(EXAMS)) { const l = lessonById(id); l.ready = true; }

STAGE_GENS[6] = ['madeHand', 'textureType', 'texture', 'cbet', 'mdf', 'faceBet', 's6c', 's6d'];
STAGE_GENS[7] = ['rangeHit', 'rangeAdv', 'combosOnBoard', 'blockCombos', 's7a', 's7d'];
PLACEMENT[9] = [6, 'madeHand']; PLACEMENT[10] = [7, 'combosOnBoard'];
DRILLS.push({ id: 'post', name: '翻牌後：中了什麼、質地', gens: ['madeHand', 'textureType'], sec: 5 });
