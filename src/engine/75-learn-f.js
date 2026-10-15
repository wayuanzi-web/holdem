/* ===== 75-learn-f：陷阱牌（看起來好的垃圾、看起來弱的遺珠）——四種樣子、對手不是隨機、壓制與贏小輸大 ===== */

/* ===== 四種樣子：能玩的牌只有四種樣子，其他是「大配小」或垃圾 ===== */
const SHAPE_ZH = { pair: '對子', bigbig: '兩張都大', aces: '同花 A', sconn: '同花連張', bigsmall: '大配小', junk: '其他（垃圾）' };
const SHAPE_ORDER = ['bigbig', 'pair', 'sconn', 'aces', 'bigsmall', 'junk'];
const R_T = RANKS.indexOf('T'), R_A = RANKS.indexOf('A');
function handShape(g) {
  const n = className(g), r1 = RANKS.indexOf(n[0]), r2 = RANKS.indexOf(n[1]), s = n[2] === 's';
  let k;
  if (r1 === r2) k = 'pair';
  else if (r2 >= R_T) k = 'bigbig';
  else if (s && r1 - r2 <= 3) k = 'sconn';
  else if (s && r1 === R_A) k = 'aces';
  else if (r1 >= R_T) k = 'bigsmall';
  else k = 'junk';
  return { k, zh: SHAPE_ZH[k], suited: s, trap: k === 'bigsmall', gem: k === 'sconn' || (k === 'pair' && r1 <= RANKS.indexOf('5')) };
}
/* 一句話：這種樣子為什麼好或不好，加上圖表從哪裡開 */
function shapeLine(g) {
  const sh = handShape(g), i = handInfo(g), open = openLine(i);
  const why = {
    pair: '對子：本身就是一對，中三條（翻牌約 12%）就是大牌，兩條路都有',
    bigbig: '兩張都大：中頂對踢腳也大，兩張都能中，還常常有順子的機會',
    aces: '同花 A：堅果同花，手上的 A 又擋住對手的 AA、AK；後位能開、也能拿來 3-bet 詐唬',
    sconn: '同花連張：順子、同花兩條路，沒中就乾脆放棄——輸小贏大',
    bigsmall: '大配小：中了頂對踢腳輸，沒中頂對什麼都沒有，順子幾乎不可能——看起來不錯，其實是最常虧錢的牌' + (sh.suited ? '（同花只多一條同花的路，所以後位偷盲可以開）' : ''),
    junk: '兩張都小又不連：一條路都沒有',
  }[sh.k];
  return why + '。' + open + '。';
}
/* 四種樣子各有幾種牌、6 人桌各位置開幾種（照圖表即時算） */
function shapeTable() {
  const out = {};
  for (const k of SHAPE_ORDER) out[k] = { k, zh: SHAPE_ZH[k], n: 0, combos: 0, utg: 0, co: 0, btn: 0, hands: [] };
  for (let g = 0; g < 169; g++) {
    const r = out[handShape(g).k];
    r.n++; r.combos += classSize(g); r.hands.push(g);
    if (chartFreq('6/rfi/UTG', g) >= 0.5) r.utg++;
    if (chartFreq('6/rfi/CO', g) >= 0.5) r.co++;
    if (chartFreq('6/rfi/BTN', g) >= 0.5) r.btn++;
  }
  return SHAPE_ORDER.map((k) => out[k]);
}

/* ===== 陷阱榜、遺珠榜：對隨機牌的勝率排名 vs 實戰排名 ===== */
let TRAP_CACHE = null;
function trapGems() {
  if (TRAP_CACHE) return TRAP_CACHE;
  const byRand = []; for (let g = 0; g < 169; g++) byRand.push(g);
  byRand.sort((a, b) => handInfo(b).eq1 - handInfo(a).eq1);
  const rankRand = new Int16Array(169); byRand.forEach((g, i) => { rankRand[g] = i + 1; });
  const rows = []; for (let g = 0; g < 169; g++) rows.push({ g, rnd: rankRand[g], real: PRE_RANK[g], d: PRE_RANK[g] - rankRand[g], eq1: handInfo(g).eq1 });
  const traps = rows.filter((x) => x.eq1 >= 0.5).sort((a, b) => b.d - a.d).slice(0, 12);
  const gems = rows.filter((x) => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 12);
  TRAP_CACHE = { traps, gems, rankRand };
  return TRAP_CACHE;
}
/* 對隨機牌 vs 對「會跟你打的牌」的勝率（離線用 rangeVsRange 各 2 萬次算好；對前 x% 用開牌排名） */
const TRAP_EQ = [['K6s', 57, 48, 43, 40, 34], ['K6o', 54, 45, 39, 36, 30], ['Q7o', 52, 41, 35, 34, 27], ['A8o', 60, 55, 49, 45, 36], ['KTo', 60, 53, 47, 42, 34], ['A5s', 60, 53, 49, 46, 39],
  ['22', 50, 47, 44, 42, 39], ['76s', 45, 40, 39, 37, 33], ['54s', 41, 39, 37, 36, 34], ['JTs', 58, 49, 43, 41, 35], ['AJo', 64, 60, 57, 53, 43], ['AKo', 65, 65, 63, 61, 57]];

/* ===== 翻牌中頂對之後：對手範圍裡每一類牌的比例、你對那一類的勝率（精確列舉） ===== */
const TP_CLASSES = ['兩對以上', '頂對・踢腳比你大', '頂對・踢腳跟你一樣', '頂對・踢腳比你小', '口袋對子（比頂對小）', '中對、弱對', '什麼都沒中'];
function topPairBreak(hero, board, rangeKey, which) {
  const R0 = chartRanges(rangeKey || '6/vsOpen/BB/BTN'), R = R0[which || 'call'];
  const dead = new Set(hero.concat(board)), top = Math.max(...board.map((c) => c >> 2));
  const myKick = hero.map((c) => c >> 2).filter((r) => r !== top)[0];
  const wt = {}, w = {};
  for (let k = 0; k < NCOMBO; k++) {
    if (!(R[k] > 0)) continue;
    const a = COMBO_A[k], b = COMBO_B[k];
    if (dead.has(a) || dead.has(b)) continue;
    const c = handCategory(a, b, board), ra = a >> 2, rb = b >> 2;
    let name;
    if (c <= 5) name = TP_CLASSES[0];
    else if (c === 7) { const kick = ra === top ? rb : ra; name = kick > myKick ? TP_CLASSES[1] : kick === myKick ? TP_CLASSES[2] : TP_CLASSES[3]; }
    else if (ra === rb) name = TP_CLASSES[4];
    else if (c === 8 || c === 9) name = TP_CLASSES[5];
    else name = TP_CLASSES[6];
    (wt[name] = wt[name] || new Float32Array(NCOMBO))[k] = R[k]; w[name] = (w[name] || 0) + R[k];
  }
  let tot = 0; for (const n in w) tot += w[n];
  const all = new Float32Array(NCOMBO); for (let k = 0; k < NCOMBO; k++) if (!dead.has(COMBO_A[k]) && !dead.has(COMBO_B[k])) all[k] = R[k];
  const rows = [], strongN = TP_CLASSES.slice(0, 4);
  let sw = 0, se = 0;
  for (const n of TP_CLASSES) {
    if (!w[n]) continue;
    const eq = exactHU(hero, board, wt[n]).eq, share = w[n] / tot;
    rows.push({ name: n, share, eq });
    if (strongN.indexOf(n) >= 0) { sw += share; se += share * eq; }
  }
  return { rows, all: exactHU(hero, board, all).eq, strongShare: sw, strongEq: sw ? se / sw : 0 };
}

/* ===== 題目 ===== */
QGEN.shapeOf = (rng) => {
  const g = (rng() * 169) | 0, sh = handShape(g);
  return { gen: 'shapeOf', prompt: '照「四種樣子」，「' + NAMEZH(g) + '」是哪一種？', vis: { k: 'cls', g },
    opts: SHAPE_ORDER.map((k) => ({ t: SHAPE_ZH[k], ok: k === sh.k })), explain: NAMEZH(g) + '：' + shapeLine(g), key: 'shp|' + g };
};
/* 兩手牌：對隨機牌的勝率高的那一手，實戰反而弱（陷阱 vs 遺珠或小對子） */
QGEN.trapPair = (rng) => {
  const TG = trapGems();
  for (let i = 0; i < 100; i++) {
    const t = pickOne(TG.traps, rng).g, m = rng() < 0.75 ? pickOne(TG.gems, rng).g : classByName(pickOne(['22', '33', '44', '55'], rng));
    if (!(handInfo(t).eq1 > handInfo(m).eq1 + 0.02 && PRE_RANK[m] < PRE_RANK[t] - 10)) continue;
    const flip = rng() < 0.5, a = flip ? m : t, b = flip ? t : m;
    const e = (g) => Math.round(handInfo(g).eq1 * 100) + '%';
    return { gen: 'trapPair', prompt: '對隨機牌的勝率：A ' + e(a) + '、B ' + e(b) + '。實戰上（6 人桌開牌圖表）哪一手比較強？', vis: { k: 'cls2', a, b },
      opts: shuffleArr([{ t: NAMEZH(a), ok: a === m }, { t: NAMEZH(b), ok: b === m }], rng),
      explain: NAMEZH(m) + ' 實戰排第 ' + PRE_RANK[m] + ' 名，' + NAMEZH(t) + ' 排第 ' + PRE_RANK[t] + ' 名——對隨機牌的勝率反過來。' + NAMEZH(t) + ' 是' + shapeLine(t) + ' ' + NAMEZH(m) + ' 是' + shapeLine(m) + ' 對手不會拿隨機牌跟你打：會跟你打到底的都是好牌，所以「對隨機牌的勝率」不算數。', key: 'tp|' + t + '|' + m };
  }
  return QGEN.shapeOf(rng);
};
/* 翻牌中頂對：對「會跟你打到底的牌」你剩多少勝率 */
QGEN.showdownTrap = (rng) => {
  let topR, kick, suited;
  for (let i = 0; i < 50; i++) {                                           // 只出按鈕圖表真的會開的牌（題目說你在按鈕開牌）
    topR = pickOne([R_A, RANKS.indexOf('K'), RANKS.indexOf('K'), RANKS.indexOf('Q')], rng);
    kick = pickOne([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((r) => r < topR), rng); suited = rng() < 0.5;
    if (chartFreq('6/rfi/BTN', classIndex(topR, kick, suited)) >= 0.5) break;
  }
  const sTop = (rng() * 4) | 0, sK = suited ? sTop : (sTop + 1 + ((rng() * 3) | 0)) % 4;
  const hero = [topR * 4 + sTop, kick * 4 + sK];
  let board = null;
  for (let i = 0; i < 100 && !board; i++) {
    const lo = dealN(rng, 2, hero).map((c) => c), rs = lo.map((c) => c >> 2);
    if (rs[0] === rs[1] || rs.some((r) => r >= topR || r === kick) || rs.some((r) => r > RANKS.indexOf('9'))) continue;
    const sB = (sTop + 2) % 4, b0 = topR * 4 + sB;
    if (b0 === hero[0]) continue;
    const ss = [sB, lo[0] & 3, lo[1] & 3]; if (new Set(ss).size < 3) continue;   // 三種花色
    if (lo.some((c) => c === hero[0] || c === hero[1])) continue;
    board = [b0, lo[0], lo[1]];
  }
  if (!board) return QGEN.shapeOf(rng);
  const g = classIndex(topR, kick, suited), B = topPairBreak(hero, board);
  const ans = Math.max(5, Math.round(B.strongEq * 100 / 5) * 5), all = Math.round(B.all * 100);
  const rowsTxt = B.rows.filter((r) => r.share >= 0.005).map((r) => r.name + ' ' + Math.round(r.share * 100) + '%（你 ' + Math.round(r.eq * 100) + '%）').join('；');
  return { gen: 'showdownTrap', prompt: '你在按鈕開牌、大盲跟注。翻牌你中了頂對：對他整個範圍你有 ' + all + '%。但會跟你打到底的是他「頂對以上」的牌（約佔 ' + Math.round(B.strongShare * 100) + '%）——只看這些牌，你的勝率大約？', vis: { k: 'hand', hole: sortedCards(hero), board },
    opts: pctOpts(ans, [ans + 20, ans - 20, ans + 35, ans - 35, all, 50].map((x) => Math.round(x / 5) * 5), rng),
    explain: '照大盲跟注的範圍一手一手算：' + rowsTxt + '。只看頂對以上：' + Math.round(B.strongEq * 100) + '%。' + (B.strongEq < 0.4 ? '這就是「贏小輸大」：對手沒中會棄牌（你贏小底池），中了比你大才跟到底（你輸大底池）。踢腳 ' + RANK_TXT[kick] + ' 太小，頂對常常是第二好的頂對。' : '踢腳 ' + RANK_TXT[kick] + ' 夠大：被跟到底時多半還是你贏，可以放心下注收錢。') + ' 這手牌是' + shapeLine(g), key: 'sdt|' + hero.join(',') + '|' + board.join(',') };
};
addStatic('s2t', [
  { prompt: 'K6s 對隨機牌的勝率 57%、76s 只有 45%，為什麼圖表 76s 槍口就開、K6s 要到關煞位才開？', opts: ['對手不會拿隨機牌跟你打：對會打的牌，K6s 只剩三四成，而且中頂對常被踢腳壓制', '圖表算錯了', '因為 76s 比較難被看出來', '因為 K6s 容易被 3-bet'], ans: 0,
    explain: '勝率要看「會跟你打的牌」：對前 20% 的牌，K6s 40%、76s 37%，差不多；但 K6s 中頂對會被更大的 K 壓制、沒有順子的路，76s 中了是順子同花、沒中就棄——輸小贏大。' },
  { prompt: '「贏小輸大」是什麼意思？', opts: ['你中頂對時，對手沒中會棄牌（你只贏小底池），對手比你大才跟到底（你輸大底池）', '小注贏、大注輸', '贏的次數少、輸的次數多', '籌碼少的人會輸'], ans: 0,
    explain: '踢腳小的頂對最典型：你贏的時候對手手上沒東西、很快棄牌；你輸的時候對手是更大的頂對或兩對，跟你打到底。平均起來是虧的——這叫反向隱含賠率。' },
  { prompt: '你拿 K♠6♠，翻牌 K♥8♦3♣。對手（大盲跟注的範圍）也有一張 K 的時候，他的踢腳比你大的機率大約？', opts: ['八成以上', '一半', '兩成', '幾乎不會'], ans: 0,
    explain: '會跟注開牌的範圍裡，K 配的都是比較大的牌（KQ、KJ、KT、K9……）；配 5 以下的只有同花的少數幾手。所以「都中頂對」的時候你幾乎都是輸的那個。' },
  { prompt: '哪一手牌是「大配小」的陷阱牌？', opts: ['Q8o', 'QJo', '88', '87s'], ans: 0,
    explain: 'Q8o：一張大牌配一張小牌，不同花、不連。QJo 兩張都大，88 是對子，87s 是同花連張——這三種都有兩條路，Q8o 一條都沒有。' },
  { prompt: '同樣是「大配小」，K6s 按鈕可以開、K6o 按鈕不開，差在哪裡？', opts: ['同花多了一條同花的路（翻牌同花聽牌約 11%），偷盲被跟還有機會', '同花的勝率高很多', '同花比較不會被 3-bet', '規則規定同花比較大'], ans: 0,
    explain: '同花只比不同花多約 3% 的勝率，差別不在勝率，在「路」：K6s 有同花這條路，被跟了還有辦法贏大的；K6o 被跟就只剩踢腳小的頂對。' },
  { prompt: '跟遊戲裡「新手」「普通」等級的電腦打，亂開大配小的牌常常也會贏。這代表？', opts: ['對手太弱、會付錢，不代表這些牌好；對會打的人就會被懲罰', '圖表是錯的', '大配小其實是好牌', '應該永遠亂開'], ans: 0,
    explain: '弱的對手用更差的牌跟你打到底、很少加注，陷阱牌就能贏。圖表是對會打的對手算出來的；練習時照圖表，對弱的對手再有意識地放寬。' },
]);

/* ===== 課：第 2 階最後一課 ===== */
COURSE[1].lessons.push(lessonFinish({ id: '2-8', title: '陷阱牌：看起來好的垃圾、看起來弱的遺珠', sum: '為什麼 K6s 是垃圾、76s 能玩：對手不是隨機、壓制、贏小輸大；四種樣子口訣。', read: [
  '上一課背了每個位置開哪些牌，這一課講<b>為什麼</b>。最常見的疑問：K6s 對隨機牌的勝率 <b>57%</b>，比 76s 的 <b>45%</b> 高很多，為什麼圖表裡 76s 槍口就開、K6s 要到關煞位（倒數第二個位置）才開？因為「對隨機牌的勝率」看的是錯的東西。',
  '<b>原理一：對手不是隨機牌。</b>會跟你打的人手上都是好牌（差的早就棄了），所以要看的是「對會打的牌」的勝率：',
  { k: 'trapEq' },
  '對會打的牌，K6s 只剩三四成，跟 76s 差不多；但接下來兩個原理會讓 K6s 更慘。',
  '<b>原理二：壓制——贏小輸大。</b>你拿 K6s 翻牌中了頂對 K，看起來很好；但對手範圍裡的 K 幾乎都配比 6 大的牌。下面是你在按鈕開牌、大盲跟注，翻牌 [Kh8d3c]，照大盲跟注的範圍一手一手精確算的：',
  { k: 'topPairBreak' },
  { k: 'tip', html: '對<b>整個範圍</b>兩手牌差不多（79% 對 84%）；但對手<b>沒中的牌會棄牌</b>，只有頂對以上才會跟你打到底——只看那些牌，K6s 剩 <b>20%</b>、KJs 有 <b>53%</b>。贏的時候贏小底池，輸的時候輸大底池，這就是<b>反向隱含賠率</b>。' },
  '<b>原理三：只有一條路。</b>好的起手牌要有兩條贏大錢的路：① 中頂對、踢腳也大；② 中大牌（三條、順子、同花）。K-6 差 7 點，<b>一個順子都湊不出來</b>；同花要翻牌中同花聽牌（約 11%）再補到（約 35%）；頂對的路又被壓制。76s 相反：頂對的路不好，但順子、同花兩條路都寬，沒中就棄、輸得少。',
  { k: 'tip', html: '<b>口訣：大配小，最會騙。</b>能玩的牌只有四種樣子：<b>兩張都大</b>（都 10 以上）、<b>對子</b>、<b>同花連張</b>（差 3 以內）、<b>同花 A</b>。一張大牌配一張小牌（K6、Q7、A8o、J8）看起來有頭有臉，其實是垃圾：不同花的幾乎永遠棄（只有 A 配中張、9 配大牌在後位），同花的 K-x、Q-x 要到後面兩個位置偷盲才開。下表是四種樣子照圖表的實際數字：' },
  { k: 'shapes' },
  '<b>牌桌上的三秒檢查</b>：兩張都 10 以上？→ 可以（越前面要越大）。對子？→ 可以。同花又差 3 以內、或同花帶 A？→ 中後位可以。都不是？→ <b>棄</b>，除非在關煞位、按鈕偷盲（同花的 K-x、Q-x 才考慮）。',
  '<b>陷阱榜、遺珠榜</b>（對隨機牌的勝率排名和實戰排名差最多的牌，點開可以看詳細）：',
  { k: 'trapGems' },
  '<b>一個誠實的提醒</b>：跟遊戲裡「新手」「普通」等級的電腦打，亂開大配小的牌常常也會贏——因為它們會用更差的牌付錢。圖表是對會打的對手算的；練習時照圖表養習慣，遇到很弱的對手再有意識地放寬。',
], practice: { gens: ['shapeOf', 'trapPair', 'showdownTrap', 's2t'], n: 8 }, quiz: { gens: ['shapeOf', 'trapPair', 'showdownTrap', 's2t', 'trapPair'], n: 8, pass: 7 } }, 2));

STAGE_GENS[2].push('shapeOf', 'trapPair');
DRILLS.push({ id: 'trap', name: '陷阱牌：看樣子', gens: ['shapeOf', 'trapPair'], sec: 3 });
