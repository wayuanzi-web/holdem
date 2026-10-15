/* ===== 70-learn：大師之路（課表、起手牌五層、起手牌字典、題目產生器、分級測驗、進度） =====
   題目都由程式產生，答案用引擎算（評牌、圖表、勝率表），所以題目無限、答案一定和牌局教練一致。
   文字裡的 [AsKs] 會換成有顏色的牌（{c數字}），畫面再用 rich() 畫出來。 */

/* ===== 起手牌五層 ===== */
const TIER_NAME = ['', '頂級', '強牌', '中堅', '投機', '邊緣與垃圾'];
const TIER_SHORT = ['', '頂級', '強牌', '中堅', '投機', '邊緣垃圾'];
const TIER_DEF = {
  1: 'AA,KK,QQ,AKs,AKo',
  2: 'JJ,TT,99,AQs,AQo,AJs,KQs',
  3: '88,77,ATs,KJs,KTs,QJs,QTs,JTs,AJo,ATo,KQo,KJo,QJo',
  4: '66,55,44,33,22,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,T9s,98s,87s,76s,65s,54s,K9s,Q9s,J9s,T8s,97s,86s,75s,64s',
};
const HAND_TIER = (function () {
  const t = new Uint8Array(169).fill(5);
  for (const k of [4, 3, 2, 1]) { const w = parseRange(TIER_DEF[k]); for (let g = 0; g < 169; g++) if (w[CLASS_COMBOS[g][0]] > 0) t[g] = k; }
  return t;
})();
function tierOf(g) { return HAND_TIER[g]; }
/* 一格在某張圖表裡加注（或跟注）的平均比例 */
function chartFreq(key, g, which) { const R = chartRanges(key); if (!R) return 0; const cs = CLASS_COMBOS[g]; let s = 0; for (const k of cs) s += R[which || 'raise'][k]; return s / cs.length; }
/* 第 5 層再分：邊緣（6 人桌按鈕會開）／垃圾（幾乎不玩） */
function isMarginal(g) { return HAND_TIER[g] === 5 && chartFreq('6/rfi/BTN', g) >= 0.5; }
function tierHands(t) { const out = []; for (let g = 0; g < 169; g++) if (HAND_TIER[g] === t) out.push(g); return out.sort((a, b) => PRE_RANK[a] - PRE_RANK[b]); }
function classByName(n) { const m = String(n).match(/^([2-9TJQKA])([2-9TJQKA])([so])?$/); if (!m) return -1; return classIndex(RANKS.indexOf(m[1]), RANKS.indexOf(m[2]), m[3] === 's'); }
/* 一格起手牌的代表兩張牌（畫面用）：對子 ♠♥、同花 ♠♠、不同花 ♠♥ */
function classCards(g) {
  const n = className(g), a = RANKS.indexOf(n[0]), b = RANKS.indexOf(n[1]);
  if (a === b) return [cardOf(a, 0), cardOf(b, 1)];
  return n[2] === 's' ? [cardOf(a, 0), cardOf(b, 0)] : [cardOf(a, 0), cardOf(b, 1)];
}
/* 從排名找格子 */
const RANK_ORDER = []; function rankOrder() { if (!RANK_ORDER.length) { for (let g = 0; g < 169; g++) RANK_ORDER.push(g); RANK_ORDER.sort((a, b) => PRE_RANK[a] - PRE_RANK[b]); } return RANK_ORDER; }

/* ===== 每一層的玩法、每一手的註解（手寫；數字都用程式算過） ===== */
const TIER_NOTE = {
  1: '任何位置都加注開局；別人加注就再加注（3-bet）。被 3-bet 時 AA、KK、AKs 再加注（4-bet）；QQ、AKo 從槍口開被 3-bet 多半只跟注，從後面的位置就 4-bet（照圖表）。這 5 手只占全部組合的 2.6%，拿到就要讓底池變大。',
  2: '任何位置都可以開牌。面對前位的加注多半跟注（不同花的 AQ 除了在大盲，常常棄牌），面對後位的加注常常再加注。小心被更大的牌壓制，翻牌出現比自己大的牌時要放慢。',
  3: '6 人桌任何位置都開；9 人桌的不同花 ATo、KJo、QJo 從中位才開。開牌沒問題，難的是被加注之後：不同花的大牌很容易被 AK、AQ、KQ 壓制，面對加注多半跟注或棄牌，很少再加注。',
  4: '靠「中大牌」賺錢：小對子等中三條、同花連張等順子和同花、同花 A 等堅果同花。要便宜進場，對手籌碼要深（最好是跟注額的 15 倍以上），越多人跟越好。',
  5: '邊緣的牌只在中後面的位置（劫位、關煞位、按鈕）和小盲、沒人加注時開牌，被加注就棄；垃圾牌幾乎永遠棄牌（只有小盲在前面都棄牌時，圖表會開其中一些，例如 Q8o、98o、K7o）。這一層是新手最常虧錢的地方：「看起來還可以」的不同花弱 A、弱 K 中了也常常輸給更好的牌。',
};
const HAND_NOTES = {
  AA: '最強的起手牌：對任何一手牌都約 77% 以上（最怕同花連張，對 KK 約 82%）。翻牌前怎麼加都不嫌多；翻牌後一對 A 在多人底池、公牌很濕（同花、順子都可能）時要小心，別一路全下到底。',
  KK: '第二強，只怕 AA。一個對手拿 AA 的機率只有約 0.5%（200 次 1 次），翻牌前幾乎不要棄 KK。翻牌出現 A 的機率約 23%，出現時要放慢。',
  QQ: '很強，但翻牌出現 A 或 K 的機率約 41%。面對 4-bet 時要看對手：很緊的人 4-bet 常常是 AA、KK。',
  AKs: '還沒成牌的最強牌：翻牌只有約 32% 中一對，但中了就是頂對最好踢腳。全下時對 QQ 約 46%、對 AQ 約 74%（壓制）。同花比不同花多約 2–3% 勝率。',
  AKo: '跟 AKs 一樣是頂級，但少了同花的機會。翻牌沒中時（約 68%）只剩 A 高，不要硬打到底。',
  JJ: '強，但很難打：翻牌出現比 J 大的牌（A、K、Q）的機率約 57%。前位開牌、面對加注多半跟注；遇到大額 4-bet 常常要放手。',
  TT: '翻牌出現比 10 大的牌的機率約 70%。開牌沒問題，翻牌後如果公牌都比你大，要願意放手。',
  99: '強牌的尾巴。翻牌有高牌時多半只剩「抓詐唬」的價值，靠中三條（約 12%）賺大錢。',
  AQs: '常被 AK 壓制（對 AK 約 30%）：面對很緊的人 3-bet 要小心。對大部分範圍仍然很強，後位可以再加注。',
  AQo: '跟 AQs 一樣怕被 AK 壓制（對 AK 約 26%），而且沒有同花的機會。任何位置都能開；面對槍口加注只有在大盲跟注，其他位置棄牌；面對後面位置的加注就再加注。',
  AJs: '同花讓它比 AJo 好打很多：中 A 有不錯的踢腳，還有堅果同花的機會。',
  KQs: '同花的大牌連張：順子、同花、頂對都有機會。但遇到 AK、AQ 會被壓制（對 AK 約 30%）。',
  88: '中等對子：開牌沒問題，面對 3-bet 多半靠中三條。翻牌有高牌時小心。',
  77: '跟 88 類似，更靠中三條。前位可以開，被大額加注時常常要放。',
  ATs: '同花 A：有堅果同花的機會，可以開牌、偶爾再加注。',
  KJs: '同花大牌：不錯，但遇到 KQ、AK 會被壓制。',
  QJs: '同花連張的大牌：順子、同花的機會多，後位很好打。',
  JTs: '能組成最多種順子的同花牌之一（7-8-9、8-9-Q、9-Q-K…）。後位開牌、跟注都好打。',
  AJo: '任何位置都能開，但被前位的人 3-bet 時常常被 AK、AQ 壓制（AJ 對 AK 約 26%），多半棄牌。',
  ATo: '比 AJo 更容易被壓制：9 人桌從中位才開，6 人桌可以開；被 3-bet 幾乎都棄。',
  KQo: '不同花的 KQ：開牌可以，但被前位的 3-bet 時多半要棄牌（常被 AK、AQ、KK 壓制）。',
  KJo: '最典型的「被壓制陷阱」：中 K 會輸給 KQ、AK，中 J 會輸給 AJ、QJ。KJ 對 KQ 只有約 27%。9 人桌從中位才開；被加注時多半棄牌。',
  QJo: '跟 KJo 一樣容易被壓制：9 人桌從中位才開，被加注多半棄牌。',
  66: '小對子靠中三條（翻牌約 12%，大約 8.5 次中 1 次）。要便宜進場、對手籌碼夠深。',
  55: '小對子：價值幾乎全靠中三條（約 12%）。被加注時要看價錢：便宜、對手籌碼深才跟。',
  44: '小對子：只在便宜、對手籌碼深的時候玩。',
  33: '小對子：多半在後位開或便宜跟注。',
  22: '最小的對子：對隨機牌仍有約 50%，但翻牌後幾乎都是「沒中就放」。',
  A5s: '最好的 3-bet 詐唬牌：擋住對手的 A（他拿 AA、AK 的機率變小），中了還有 A-2-3-4-5 順子和堅果同花。對 KK 也有約 33%。',
  A4s: '跟 A5s 類似，是很好的詐唬再加注牌。',
  A3s: '同花小 A：靠堅果同花和小順子。',
  A2s: '同花小 A：靠堅果同花，也可以當詐唬再加注。',
  A9s: '同花 A 裡比較尷尬的一手：中 A 踢腳普通，主要靠同花。',
  T9s: '同花連張的代表：翻牌直接成順子約 1.3%、出現 8 張出牌以上的順子聽牌約 10%、同花聽牌以上約 12%。中了常常是對手很難看穿的大牌。',
  '98s': '同花連張：跟 T9s 類似，對 AK 全下約 39%，不怕「大牌」。',
  '87s': '同花連張：便宜進場、多人底池最好。對 AK 全下約 40%。',
  '76s': '同花連張：便宜進場、等中順子或同花；被大額加注時多半棄。',
  '65s': '同花連張：便宜進場最好；不要因為「同花」就花大錢跟大注。',
  '54s': '最小的常用同花連張：劫位以後才開，或很便宜時玩。',
  KTo: '不同花，容易被壓制：劫位以後才開，被加注就棄。',
  QTo: '不同花，容易被壓制：劫位以後才開，被加注就棄。',
  JTo: '不同花的連張：順子機會不錯，但少了同花。劫位以後才開。',
  A9o: '不同花的弱 A：最常見的虧錢牌之一。中 A 常輸給更好的 A（A9 對 AJ 約 27%）。劫位以後才開，被加注就棄。',
  A8o: '不同花的弱 A：關煞位以後才開。',
  A5o: '不同花的小 A：關煞位以後才開；有 A-2-3-4-5 順子的機會，比 A6o 好一點。',
  K9o: '弱 K：關煞位以後才開。',
  '72o': '公認最差的起手牌：沒有順子、同花的可能，對隨機牌只有約 35%。永遠棄牌（除了大盲沒人加注時免費看）。',
  '32o': '在排名最後：點數最小、只能組最小的順子。',
};

/* ===== 起手牌字典：一格的完整資料 ===== */
const DICT_POS6 = ['UTG', 'HJ', 'CO', 'BTN', 'SB'], DICT_POS9 = ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'];
function handInfo(g) {
  const name = className(g), q = preflopLookup(g);
  const rfi = (t, list) => list.map((pos) => ({ pos, f: chartFreq(t + '/rfi/' + pos, g) }));
  const r6 = rfi('6', DICT_POS6), r9 = rfi('9', DICT_POS9);
  const earliest = (arr) => { const x = arr.find((o) => o.f >= 0.5); return x ? x.pos : null; };
  const vs = (key) => { if (!chartText(key)) return null; const r = chartFreq(key, g, 'raise'), c = chartFreq(key, g, 'call'); return { r, c, f: Math.max(0, 1 - r - c) }; };
  return {
    g, name, words: clsWords(g), rank: PRE_RANK[g], pct: PRE_PCT[g], combos: classSize(g), tier: HAND_TIER[g], marginal: isMarginal(g),
    eq1: q ? q.eq[0] : 0, eq2: q ? q.eq[1] : 0, eq3: q ? q.eq[2] : 0, eqTop10: eqVsTop(g, 0.1), eqTop22: eqVsTop(g, 0.22),
    r6, r9, early6: earliest(r6), early9: earliest(r9),
    def: [['BB', 'EP'], ['BB', 'CO'], ['BB', 'BTN'], ['BB', 'SB'], ['SB', 'BTN'], ['IP', 'CO']].map(([d, o]) => ({ d, o, x: vs('6/vsOpen/' + d + '/' + o) })),
    v3: [['EP'], ['CO'], ['BTN']].map(([o]) => ({ o, x: vs('6/vs3bet/' + o) })),
    note: HAND_NOTES[name] || '', tierNote: TIER_NOTE[HAND_TIER[g]],
  };
}
/* 每個位置比前一個位置多開哪些牌（6 人桌：槍口 → 劫位 → 關煞位 → 按鈕 → 小盲） */
function openDiffs(t) {
  const list = t === '9' ? DICT_POS9 : DICT_POS6, out = [];
  let prev = new Set();
  for (const pos of list) {
    const now = new Set(), add = [];
    for (let g = 0; g < 169; g++) if (chartFreq(t + '/rfi/' + pos, g) >= 0.5) { now.add(g); if (!prev.has(g)) add.push(g); }
    add.sort((a, b) => PRE_RANK[a] - PRE_RANK[b]);
    let combos = 0; for (const g of now) combos += classSize(g);
    out.push({ pos, add, n: now.size, pct: combos / NCOMBO });
    prev = now;
  }
  return out;
}
/* 一句話：這手牌怎麼開 */
function openLine(info) {
  const zh = (p) => POS_ZH[p] || p;
  if (info.early6 === 'UTG') return '6 人桌任何位置都開' + (info.early9 === 'UTG' ? '（9 人桌也是）' : info.early9 ? '（9 人桌從' + zh(info.early9) + '開始）' : '');
  if (info.early6) return '6 人桌從' + zh(info.early6) + '開始開' + (info.early9 ? '；9 人桌從' + zh(info.early9) : '');
  return '6 人桌沒人加注時也不開（大盲免費看除外）';
}

/* ===== 文字工具 ===== */
const LTXT = (s) => String(s).replace(/\[((?:[2-9TJQKA][shdc])+)\]/g, (m, cs) => parseCards(cs).map((c) => '{c' + c + '}').join(''));
const NAMEZH = (g) => className(g);                     // 起手牌一律用撲克的寫法：T ＝ 10
function shuffleArr(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pickOne(a, rng) { return a[(rng() * a.length) | 0]; }
function dealN(rng, n, used) { const u = new Set(used || []), out = []; while (out.length < n) { const c = (rng() * 52) | 0; if (!u.has(c)) { u.add(c); out.push(c); } } return out; }
/* 7 張裡最好的 5 張（照重要性排好：組成牌型的在前） */
function best5(cards) {
  let best = -1, bc = cards.slice(0, 5);
  if (cards.length === 5) best = evalCards(cards);
  else {
    const n = cards.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const five = cards.filter((x, k) => k !== a && k !== b);
      const v = evalCards(five);
      if (v > best) { best = v; bc = five; }
    }
  }
  const cnt = {};
  for (const c of bc) cnt[c >> 2] = (cnt[c >> 2] || 0) + 1;
  const cat = best >>> 26;
  bc.sort((x, y) => (cnt[y >> 2] - cnt[x >> 2]) || ((y >> 2) - (x >> 2)));
  if ((cat === 4 || cat === 8) && bc.some((c) => (c >> 2) === 12) && bc.some((c) => (c >> 2) === 0)) bc.push(bc.shift());   // A-2-3-4-5：A 當最小
  return { v: best, cat, cards: bc };
}
function cardsTok(arr) { return arr.map((c) => '{c' + c + '}').join(''); }
/* 選項：正確答案＋幾個錯的，打亂 */
function mkOpts(correct, wrongs, rng, keepOrder) {
  const o = [{ t: correct, ok: true }].concat(wrongs.filter((w) => w !== correct).map((w) => ({ t: w, ok: false })));
  const seen = new Set(), u = o.filter((x) => (seen.has(x.t) ? false : (seen.add(x.t), true)));
  return keepOrder ? u : shuffleArr(u, rng);
}
function numOpts(correct, cands, rng, n) {
  const ws = [...new Set(cands.filter((x) => x !== correct && x > 0))];
  shuffleArr(ws, rng);
  const pick = ws.slice(0, (n || 4) - 1).concat([correct]).sort((a, b) => a - b);
  return pick.map((x) => ({ t: String(x), ok: x === correct }));
}

/* ===== 題目產生器：每一種回傳 { gen, prompt, vis, opts:[{t,ok}], explain } ===== */
const QGEN = {};
/* 第 1 階 */
QGEN.handType = (rng) => {
  const target = pickOne([1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 0, 7], rng);
  let cards = null;
  for (let i = 0; i < 6000; i++) { const cs = dealN(rng, 7); if ((evalCards(cs) >>> 26) === target) { cards = cs; break; } }
  if (!cards) cards = dealN(rng, 7);
  const b = best5(cards), name = CAT_NAMES[b.cat];
  const near = [b.cat - 2, b.cat - 1, b.cat + 1, b.cat + 2].filter((x) => x >= 0 && x <= 8).map((x) => CAT_NAMES[x]);
  const opts = mkOpts(name, shuffleArr(near, rng).slice(0, 3), rng).sort((x, y) => CAT_NAMES.indexOf(y.t) - CAT_NAMES.indexOf(x.t));
  return { gen: 'handType', prompt: '你的兩張手牌加上五張公牌，最大的牌型是什麼？', vis: { k: 'hand', hole: cards.slice(0, 2), board: cards.slice(2) }, opts,
    explain: '最好的 5 張是 ' + cardsTok(b.cards) + '：' + describeHand(b.v) + '。' + (b.cat === 5 ? '同花只看花色一樣的 5 張，不用連續。' : b.cat === 4 ? '順子只看點數連續，花色不用一樣。' : b.cat === 2 ? '7 張裡就算有三對，也只算最大的兩對加一張踢腳。' : '') };
};
QGEN.whoWins = (rng) => {
  let hole, board, va, vb;
  const wantSame = rng() < 0.65;
  for (let i = 0; i < 60; i++) {
    const cs = dealN(rng, 9);
    hole = [cs.slice(0, 2), cs.slice(2, 4)]; board = cs.slice(4);
    va = evalCards(hole[0].concat(board)); vb = evalCards(hole[1].concat(board));
    if (!wantSame || (va >>> 26) === (vb >>> 26)) break;
  }
  const A = best5(hole[0].concat(board)), B = best5(hole[1].concat(board));
  const ans = va > vb ? 'A 贏' : vb > va ? 'B 贏' : '平分';
  let why;
  if (A.cat !== B.cat) why = (va > vb ? 'A' : 'B') + ' 的' + CAT_NAMES[Math.max(A.cat, B.cat)] + '比' + CAT_NAMES[Math.min(A.cat, B.cat)] + '大。';
  else if (va === vb) why = '兩個人最好的 5 張點數完全一樣（常常是公牌本身最大），平分底池。花色不分大小。';
  else {
    let i = 0;
    while (i < 5 && (A.cards[i] >> 2) === (B.cards[i] >> 2)) i++;
    const ra = RANK_TXT[A.cards[Math.min(i, 4)] >> 2], rb = RANK_TXT[B.cards[Math.min(i, 4)] >> 2];
    why = '都是' + CAT_NAMES[A.cat] + '：照順序一張一張比，第一個不一樣的是 ' + (va > vb ? ra + ' 比 ' + rb : rb + ' 比 ' + ra) + ' 大' + (i >= (A.cat === 1 ? 2 : A.cat === 2 ? 4 : A.cat === 3 ? 3 : 5) ? '（比的是「踢腳」）' : '') + '。';
  }
  return { gen: 'whoWins', prompt: '攤牌了，誰贏？', vis: { k: 'two', a: hole[0], b: hole[1], board }, opts: mkOpts(ans, ['A 贏', 'B 贏', '平分'], rng, true).sort((x, y) => ['A 贏', 'B 贏', '平分'].indexOf(x.t) - ['A 贏', 'B 贏', '平分'].indexOf(y.t)),
    explain: 'A 最好的 5 張：' + cardsTok(A.cards) + '（' + describeHand(va) + '）；B：' + cardsTok(B.cards) + '（' + describeHand(vb) + '）。' + why };
};
const SEAT_L = 'ABCDEFGHI';
QGEN.firstAct = (rng) => {
  const n = pickOne([2, 3, 4, 5, 6, 6, 6, 9, 9], rng), btn = (rng() * n) | 0, pre = rng() < 0.5;
  const sb = n === 2 ? btn : (btn + 1) % n, bb = (sb + 1) % n;
  const ans = pre ? (n === 2 ? btn : (bb + 1) % n) : (n === 2 ? bb : sb);
  const cands = [btn, sb, bb, (bb + 1) % n, (btn + n - 1) % n].filter((x, i, a) => a.indexOf(x) === i);
  const opts = mkOpts(SEAT_L[ans], shuffleArr(cands.map((x) => SEAT_L[x]), rng).slice(0, 4), rng).sort((x, y) => x.t.localeCompare(y.t));
  const ex = n === 2 ? '單挑時按鈕同時是小盲：翻牌前按鈕（小盲）先說話，翻牌後大盲先說話、按鈕最後。'
    : '按鈕（D）在 ' + SEAT_L[btn] + '，往左一位 ' + SEAT_L[sb] + ' 是小盲、再一位 ' + SEAT_L[bb] + ' 是大盲。' + (pre ? '翻牌前從大盲的下一位開始說話（' + SEAT_L[ans] + '），大盲最後。' : '翻牌後從小盲（' + SEAT_L[sb] + '）開始，按鈕最後。');
  return { gen: 'firstAct', prompt: n + ' 人桌，' + (pre ? '翻牌前' : '翻牌後（大家都還在）') + '哪個座位第一個說話？', vis: { k: 'seats', n, btn }, opts, explain: ex };
};
QGEN.posName = (rng) => {
  const n = pickOne([6, 6, 9], rng), btn = (rng() * n) | 0, hero = (rng() * n) | 0;
  const codes = posCodes(n), code = codes[(hero - btn + n) % n];
  const others = shuffleArr(codes.filter((c) => c !== code), rng).slice(0, 3);
  const opts = mkOpts(POS_ZH[code], others.map((c) => POS_ZH[c]), rng);
  const k = (hero - btn + n) % n;
  return { gen: 'posName', prompt: n + ' 人桌，你坐在 ★ 的位置，是什麼位置？', vis: { k: 'seats', n, btn, hero }, opts,
    explain: '從按鈕往左數：按鈕、小盲、大盲，接著是' + (n === 6 ? '槍口、劫位、關煞位' : '槍口、槍口+1、中位、低劫位、劫位、關煞位') + '。你在按鈕往左第 ' + k + ' 位：' + POS_ZH[code] + '。' + (code === 'BTN' ? '翻牌後永遠最後說話，最好的位置。' : code === 'SB' || code === 'BB' ? '盲注翻牌後最先說話，位置最差。' : '') };
};
QGEN.minRaise = (rng) => {
  const bb = pickOne([2, 2, 10, 20, 50], rng), sb = bb / 2;
  const kind = pickOne([0, 1, 1, 2], rng);
  if (kind === 0) {
    const ans = bb * 2;
    return { gen: 'minRaise', prompt: '盲注 ' + sb + '／' + bb + '，前面都棄牌，你想加注：最少要加注到多少？', vis: null, opts: numOpts(ans, [bb, bb * 1.5, bb * 3, bb * 2.5].map(Math.round), rng),
      explain: '加注至少要多一個大盲：' + bb + ' ＋ ' + bb + ' ＝ ' + ans + '。（大盲本身就算一次下注）' };
  }
  const x = bb * pickOne([2.5, 3, 4], rng), y = kind === 2 ? x + (x - bb) + bb * pickOne([1, 2, 4], rng) : null;
  if (kind === 1) {
    const ans = x + (x - bb);
    return { gen: 'minRaise', prompt: '盲注 ' + sb + '／' + bb + '，有人加注到 ' + x + '。你想再加注：最少要加注到多少？', vis: null, opts: numOpts(ans, [x * 2, x + bb, x + sb * 2 + bb, ans + bb], rng),
      explain: '他從 ' + bb + ' 加到 ' + x + '，多加了 ' + (x - bb) + '。再加注至少要多加一樣多：' + x + ' ＋ ' + (x - bb) + ' ＝ ' + ans + '。' };
  }
  const ans = y + (y - x);
  return { gen: 'minRaise', prompt: '盲注 ' + sb + '／' + bb + '，A 加注到 ' + x + '，B 再加注到 ' + y + '。輪到你：最少要加注到多少？', vis: null, opts: numOpts(ans, [y * 2, y + x, y + (x - bb), ans + bb], rng),
    explain: '看「上一次」加注多加了多少：B 從 ' + x + ' 加到 ' + y + '，多了 ' + (y - x) + '。所以最少要到 ' + y + ' ＋ ' + (y - x) + ' ＝ ' + ans + '。' };
};
QGEN.sidePot = (rng) => {
  const a = 10 * (5 + ((rng() * 10) | 0)), b = a + 10 * (3 + ((rng() * 10) | 0)), c = b + 10 * (2 + ((rng() * 10) | 0));
  const main = 3 * a, side = 2 * (b - a), back = c - b, k = pickOne([0, 1, 2], rng);
  const head = '三個人都全下：A 有 ' + a + '、B 有 ' + b + '、C 有 ' + c + '。';
  const ex = '主池：每人放 ' + a + '（A 有多少就比多少），' + a + ' × 3 ＝ ' + main + '，三人都能贏。邊池：B、C 再各放 ' + (b - a) + '，(' + b + ' − ' + a + ') × 2 ＝ ' + side + '，只有 B、C 能贏。C 多出來的 ' + back + ' 沒人跟，退回給 C。';
  if (k === 0) return { gen: 'sidePot', prompt: head + '如果 A 的牌最大，A 最多贏多少（含自己的）？', vis: null, opts: numOpts(main, [a, a * 2, a + b + c, main + side], rng), explain: ex };
  if (k === 1) return { gen: 'sidePot', prompt: head + '如果 B 的牌最大，B 拿走多少（含自己的）？', vis: null, opts: numOpts(main + side, [main, b * 3, a + b + c, side], rng), explain: ex };
  return { gen: 'sidePot', prompt: head + '如果 A 的牌最大、B 第二、C 最小，C 拿回多少？', vis: null, opts: numOpts(back, [0, c - a, side, c], rng).map((o) => o), explain: ex + '主池給 A，邊池給 B，C 只拿回沒人跟的 ' + back + '。' };
};
/* 第 2 階 */
QGEN.combos = (rng) => {
  const k = pickOne(['pair', 's', 'o', 'all'], rng);
  const r1 = 1 + ((rng() * 12) | 0), r2 = (rng() * r1) | 0;
  if (k === 'pair') { const n = RANK_TXT[r1] + RANK_TXT[r1]; return { gen: 'combos', prompt: '起手牌「' + n + '」（一對）有幾種組合？', vis: null, opts: numOpts(6, [4, 12, 16, 8], rng), explain: '4 種花色挑 2 張：4 × 3 ÷ 2 ＝ 6 種。所以 13 種對子一共 78 種組合。' }; }
  const nm = RANK_TXT[r1] + RANK_TXT[r2];
  if (k === 's') return { gen: 'combos', prompt: '「' + nm + ' 同花」有幾種組合？', vis: null, opts: numOpts(4, [6, 12, 16, 8], rng), explain: '同花就是兩張花色一樣：♠♠、♥♥、♦♦、♣♣，一共 4 種。' };
  if (k === 'o') return { gen: 'combos', prompt: '「' + nm + ' 不同花」有幾種組合？', vis: null, opts: numOpts(12, [4, 6, 16, 8], rng), explain: '第一張 4 種花色 × 第二張 4 種 ＝ 16，扣掉同花的 4 種，剩 12 種。' };
  return { gen: 'combos', prompt: '「' + nm + '」（同花加不同花）一共幾種組合？', vis: null, opts: numOpts(16, [4, 6, 12, 8], rng), explain: '4 × 4 ＝ 16：同花 4 種＋不同花 12 種。所以一手「不同花」出現的機率是同花的 3 倍。' };
};
function poolFromTiers(tiers) { const out = []; for (let g = 0; g < 169; g++) if (!tiers || tiers.indexOf(HAND_TIER[g]) >= 0) out.push(g); return out; }
QGEN.tierOf = (rng, o) => {
  const g = pickOne(poolFromTiers(o && o.tiers), rng), t = HAND_TIER[g];
  const opts = [1, 2, 3, 4, 5].map((k) => ({ t: TIER_NAME[k], ok: k === t }));
  return { gen: 'tierOf', prompt: '「' + NAMEZH(g) + '」屬於哪一層？', vis: { k: 'cls', g }, opts,
    explain: NAMEZH(g) + ' 是' + TIER_NAME[t] + (t === 5 ? '（' + (isMarginal(g) ? '邊緣：只有後位沒人加注時開' : '垃圾：幾乎不玩') + '）' : '') + '，強度排第 ' + PRE_RANK[g] + ' 名。' + (typeof shapeLine === 'function' ? '樣子是' + shapeLine(g) + ' ' : '') + (HAND_NOTES[className(g)] || (t === 5 ? '' : TIER_NOTE[t])) };
};
QGEN.stronger = (rng, o) => {
  const pool = poolFromTiers(o && o.tiers);
  let a, b;
  for (let i = 0; i < 50; i++) { a = pickOne(pool, rng); b = pickOne(rng() < 0.5 ? pool : poolFromTiers(), rng); if (a !== b && Math.abs(PRE_RANK[a] - PRE_RANK[b]) >= 12) break; }
  const s = PRE_RANK[a] < PRE_RANK[b] ? a : b, w = s === a ? b : a;
  const opts = shuffleArr([{ t: NAMEZH(a), ok: a === s }, { t: NAMEZH(b), ok: b === s }], rng);
  return { gen: 'stronger', prompt: '哪一手起手牌比較強？', vis: { k: 'cls2', a, b }, opts,
    explain: NAMEZH(s) + ' 排第 ' + PRE_RANK[s] + ' 名（' + TIER_NAME[HAND_TIER[s]] + '），' + NAMEZH(w) + ' 排第 ' + PRE_RANK[w] + ' 名（' + TIER_NAME[HAND_TIER[w]] + '）。排名照「能在幾個位置開牌」，一樣時看勝率。' + (HAND_TIER[s] > HAND_TIER[w] ? '（層是照「怎麼打」分的：投機牌靠中大牌賺錢，排名比較後面不代表不能玩。）' : '') };
};
/* 沒人加注：開不開（只出明確的題：圖表 ≥ 75% 加注，或 ≤ 10%） */
QGEN.openOrFold = (rng, o) => {
  const t = (o && o.t) || pickOne(['6', '6', '9'], rng), poss = CHART_POS[t].filter((p) => (!(o && o.late) || ['CO', 'BTN', 'SB', 'HJ'].indexOf(p) >= 0) && (!(o && o.pos) || o.pos.indexOf(p) >= 0));
  const pool = poolFromTiers(o && o.tiers);
  for (let i = 0; i < 200; i++) {
    const pos = pickOne(poss, rng), key = t + '/rfi/' + pos;
    let g;
    if (o && o.tiers) g = pickOne(pool, rng);
    else {                                                  // 挑接近界線的牌，比較有學習價值
      const R = chartRanges(key); let tot = 0; for (let k = 0; k < NCOMBO; k++) tot += R.raise[k];
      const edge = Math.max(4, Math.round(169 * Math.min(0.9, tot / NCOMBO))), ord = rankOrder();
      const lo = Math.max(0, edge - 30), hi = Math.min(168, edge + 30);
      g = ord[lo + ((rng() * (hi - lo + 1)) | 0)];
    }
    const f = chartFreq(key, g);
    if (f > 0.1 && f < 0.75) continue;
    const ans = f >= 0.75 ? '加注' : '棄牌';
    const info = handInfo(g);
    const R = chartRanges(key); let tot = 0; for (let k = 0; k < NCOMBO; k++) tot += R.raise[k];
    return { gen: 'openOrFold', prompt: (t === '9' ? '9' : '6') + ' 人桌，前面都棄牌，你在' + POS_ZH[pos] + '拿 ' + NAMEZH(g) + '：', vis: { k: 'cls', g, pos: POS_ZH[pos] }, opts: [{ t: '加注', ok: ans === '加注' }, { t: '棄牌', ok: ans === '棄牌' }],
      explain: POS_ZH[pos] + '大約開前 ' + Math.round(tot / NCOMBO * 100) + '% 的牌；' + NAMEZH(g) + '（第 ' + PRE_RANK[g] + ' 名，' + TIER_NAME[HAND_TIER[g]] + '）在圖表裡' + (f >= 0.75 ? '加注' : f > 0 ? '只有 ' + Math.round(f * 100) + '% 加注' : '不開') + '。' + openLine(info) + '。', key: 'open|' + t + '|' + pos + '|' + g };
  }
  return QGEN.combos(rng);
};
/* 第 4 階：大盲（或小盲）面對開牌 */
/* o：{ spots:[[防守的人, 開牌的人]], want:'raise'|'call'|'fold'（只出這種答案）, hands:'A5s,A4s'（只出這些牌） } */
QGEN.defend = (rng, o) => {
  const spots = (o && o.spots) || [['BB', 'BTN'], ['BB', 'CO'], ['BB', 'EP'], ['BB', 'SB'], ['SB', 'BTN'], ['IP', 'CO']];
  const only = o && o.hands ? (function () { const w = parseRange(o.hands), a = []; for (let g = 0; g < 169; g++) if (w[CLASS_COMBOS[g][0]] > 0) a.push(g); return a; })() : null;
  const wantMap = { raise: '再加注（3-bet）', call: '跟注', fold: '棄牌' };
  for (let i = 0; i < 600; i++) {
    const [d, og] = pickOne(spots, rng), key = '6/vsOpen/' + d + '/' + og;
    if (!chartText(key)) continue;
    const g = only ? pickOne(only, rng) : (rng() * 169) | 0, r = chartFreq(key, g, 'raise'), c = chartFreq(key, g, 'call'), f = 1 - r - c;
    const best = r >= 0.75 ? '再加注（3-bet）' : c >= 0.75 ? '跟注' : f >= 0.85 ? '棄牌' : null;
    if (!best || (o && o.want && wantMap[o.want] !== best) || (!(o && o.want) && !only && best === '棄牌' && rng() < 0.6)) continue;
    const ogZh = openerZh('6', og);
    let dTot = 0; { const R = chartRanges(key); for (let k = 0; k < NCOMBO; k++) dTot += R.raise[k] + R.call[k]; }
    const why = og === 'EP' ? '槍口開牌範圍很緊，要更好的牌才繼續。' : (og === 'BTN' || og === 'SB') && best !== '棄牌' ? '後位開牌範圍很寬，可以防守得寬一點。' : d === 'SB' ? '小盲沒位置、價錢也不便宜：這裡只防守約 ' + Math.round(dTot / NCOMBO * 100) + '% 的牌，大多是 3-bet 或棄牌。' : best === '棄牌' ? '這裡一共只防守約 ' + Math.round(dTot / NCOMBO * 100) + '% 的牌，這手不夠。' : '';
    return { gen: 'defend', prompt: '6 人桌，' + ogZh + '加注開局，到你之前的人都棄牌。你在' + DEFENDER_ZH[d] + '拿 ' + NAMEZH(g) + '：', vis: { k: 'cls', g }, opts: ['再加注（3-bet）', '跟注', '棄牌'].map((x) => ({ t: x, ok: x === best })),
      explain: '圖表：' + NAMEZH(g) + ' 在這裡 3-bet ' + Math.round(r * 100) + '%、跟注 ' + Math.round(c * 100) + '%、棄牌 ' + Math.round(Math.max(0, f) * 100) + '%。' + (d === 'BB' && best !== '棄牌' ? '大盲已經放了 1 個大盲，跟注比較便宜，所以防守得比較寬。' : '') + why, key: 'def|' + key + '|' + g };
  }
  return QGEN.combos(rng);
};
/* 第 5 階：底池賠率、出牌數 */
QGEN.potOdds = (rng) => {
  const pot = 10 * (2 + ((rng() * 15) | 0)), fr = pickOne([[1, 3], [1, 2], [2, 3], [1, 1], [3, 4]], rng), bet = Math.round(pot * fr[0] / fr[1]);
  const need = bet / (pot + 2 * bet), ans = Math.round(need * 100);
  const cands = [Math.round(bet / pot * 100), Math.round(bet / (pot + bet) * 100), ans + 10, ans - 8, 50].filter((x) => x > 0 && x < 100);
  return { gen: 'potOdds', prompt: '底池有 ' + pot + '，對手下注 ' + bet + '。你要跟 ' + bet + '：勝率至少要多少才划算？', vis: null,
    opts: numOpts(ans, cands, rng).map((x) => ({ t: x.t + '%', ok: x.ok })),
    explain: '跟完之後底池是 ' + pot + ' ＋ ' + bet + '（他的）＋ ' + bet + '（你的）＝ ' + (pot + 2 * bet) + '。要跟的 ÷ 跟完的底池 ＝ ' + bet + ' ÷ ' + (pot + 2 * bet) + ' ≈ ' + ans + '%。常用：下注 1/3 底池要 20%、半個底池要 25%、一個底池要 33%。', key: 'po|' + fr.join('/') };
};
const OUTS_SPOTS = [
  ['AhTh', 'Kh7h2c', 9, '同花聽牌：13 張紅心扣掉看得到的 4 張，剩 9 張'],
  ['Js Tc', '9h8d2s', 8, '兩頭順聽牌：7 或 Q 都成順子，各 4 張，共 8 張'],
  ['9s8c', 'Jd7h2c', 4, '卡順（中間缺一張）：只有 10 能成順子，4 張'],
  ['JhTh', '9h8h2c', 15, '同花聽牌加兩頭順：9 張紅心＋7、Q 裡不是紅心的 6 張，共 15 張'],
  ['AsKd', '8h5c2d', 6, '兩張比公牌大的牌（高張）：中 A 或 K 變成頂對，各 3 張，共 6 張（不一定贏）'],
  ['7s7d', 'AhKc2d', 2, '口袋對子等三條：只剩 2 張 7'],
  ['QcJc', 'Tc9d3c', 15, '同花聽牌加兩頭順：9 張梅花＋8、K 裡不是梅花的 6 張，共 15 張'],
  ['6h5h', 'AsKh4h', 9, '同花聽牌：紅心剩 9 張（順子還差兩張，不算）'],
];
QGEN.outs = (rng) => {
  const [h, b, n, why] = pickOne(OUTS_SPOTS, rng);
  const hole = parseCards(h.replace(/\s/g, '')), board = parseCards(b);
  return { gen: 'outs', prompt: '翻牌後你的牌還不夠強。下一張有幾張牌會讓你變強（出牌數）？', vis: { k: 'hand', hole, board }, opts: numOpts(n, [2, 4, 6, 8, 9, 12, 15], rng),
    explain: why + '。2–4 法則：翻牌時出牌數 × 4 ≈ 到河牌中的機率（' + n + ' × 4 ≈ ' + Math.min(100, n * 4) + '%）；只看下一張 × 2（≈ ' + n * 2 + '%）。', key: 'outs|' + h };
};
/* 第 7 階：組合數與阻擋牌 */
QGEN.blockCombos = (rng) => {
  const spots = [
    ['公牌有一張 A，對手拿 AK（同花、不同花都算）還剩幾種組合？', 12, [16, 9, 8, 6], '本來 4 × 4 ＝ 16 種；公牌用掉一張 A，剩 3 張 A × 4 張 K ＝ 12 種。'],
    ['你手上有一張 K，對手拿 KK 還剩幾種組合？', 3, [6, 4, 2, 1], 'KK 本來 6 種；你拿走一張 K，剩 3 張 K 挑 2 張 ＝ 3 種。這就是「阻擋牌」。'],
    ['公牌有一張 A、一張 K，對手拿 AK 還剩幾種組合？', 9, [16, 12, 6, 4], '剩 3 張 A × 3 張 K ＝ 9 種。'],
    ['公牌有兩張 7，對手拿 77 還剩幾種組合？', 1, [6, 3, 2, 0], '7 只剩 2 張，2 張挑 2 張只有 1 種。'],
    ['你手上有 A♠K♠，對手拿 AA 還剩幾種組合？', 3, [6, 4, 2, 1], 'A 只剩 3 張，挑 2 張 ＝ 3 種（本來 6 種，少了一半）。所以 AK 讓對手拿 AA、AK 的機率都變小。'],
  ];
  const [q, ans, w, ex] = pickOne(spots, rng);
  return { gen: 'blockCombos', prompt: q, vis: null, opts: numOpts(ans, w, rng), explain: ex, key: 'blk|' + q.slice(0, 8) };
};
/* 第 6、8 階：觀念題（分級測驗用） */
const STATIC_Q = {
  s6: [
    { prompt: '你翻牌前在按鈕加注，大盲跟注。翻牌 [As7d2c]，大盲過牌給你。通常最好的打法？', opts: ['小注持續下注（約 1/3 底池）', '過牌', '全下', '下注兩倍底池'], ans: 0,
      explain: '乾燥、A 高的翻牌對翻牌前加注的人有利（你的範圍裡 A 比較多），小注就能讓很多牌棄牌，被跟也不虧太多。' },
    { prompt: '你拿 [8h8d]，翻牌 [AsKcQd]，對手下注半個底池。通常？', opts: ['棄牌', '跟注', '加注', '全下'], ans: 0,
      explain: '三張公牌都比你大，對手很可能中了；你幾乎只剩 2 張 8 能翻身，跟注長期會虧。' },
  ],
  s8: [
    { prompt: 'GTO 策略最主要的特點是什麼？', opts: ['對手怎麼調整都沒辦法占你便宜', '每一手都贏最多錢', '專門針對對手的弱點', '從來不詐唬'], ans: 0,
      explain: 'GTO 是「不會被剝削」的打法：對手怎麼改都不會比較好。它不一定贏最多，對很弱的對手時，針對他的弱點（剝削）通常賺更多。' },
    { prompt: '對手在河牌下注一個底池。照 GTO，他的下注裡大約多少是詐唬，你跟注和棄牌才一樣好？', opts: ['約 1/3', '約 1/2', '約 2/3', '0（不該詐唬）'], ans: 0,
      explain: '你跟 1 份錢要搶 2 份（底池＋他的下注），需要 33% 勝率；他的下注裡 1/3 是詐唬時，你跟注剛好打平。' },
  ],
};
for (const k of Object.keys(STATIC_Q)) QGEN[k] = (rng) => {
  const q = pickOne(STATIC_Q[k], rng);
  return { gen: k, prompt: LTXT(q.prompt), vis: null, opts: shuffleArr(q.opts.map((t, i) => ({ t, ok: i === q.ans })), rng), explain: LTXT(q.explain), key: k + '|' + q.prompt.slice(0, 10) };
};
function makeQ(spec, rng) {
  const [gen, opt] = Array.isArray(spec) ? spec : [spec];
  const q = QGEN[gen](rng, opt);
  if (!q.key) q.key = gen + '|' + q.prompt + '|' + JSON.stringify(q.vis || null);
  q.prompt = LTXT(q.prompt); q.explain = LTXT(q.explain);
  return q;
}
/* 一組題目：照 gens 輪流出、同一題不重複 */
function makeQuiz(gens, n, rng) {
  const out = [], seen = new Set();
  for (let i = 0, tries = 0; out.length < n && tries < n * 40; tries++, i++) {     // 題庫用完的種類會自動換下一種
    const q = makeQ(gens[i % gens.length], rng);
    if (seen.has(q.key)) continue;
    seen.add(q.key); out.push(q);
  }
  return out;
}

/* ===== 課表 ===== */
const CARD_CATS = [
  [8, 'AsKsQsJsTs', '同花順', '同花又是順子。A 開頭的叫皇家同花順，最大。', 0.03],
  [7, '9s9h9d9c2h', '四條', '四張一樣的點數。', 0.17],
  [6, 'KsKhKd7c7h', '葫蘆', '三條＋一對。先比三條的點數。', 2.6],
  [5, 'AhJh8h5h3h', '同花', '五張同花色，不用連續。先比最大的那張。', 3.0],
  [4, '9s8h7d6c5s', '順子', '五張點數連續，花色不限。A 可以當最小（A-2-3-4-5）。', 4.6],
  [3, 'QsQhQd8c4s', '三條', '三張一樣的點數。', 4.8],
  [2, 'JsJhAdAc5s', '兩對', '兩個對子。先比大的對子、再比小的、再比踢腳。', 23.5],
  [1, 'TsTh9dAc4s', '一對', '一個對子。一樣時比踢腳。', 43.8],
  [0, 'AsQh9d6c2s', '高牌', '什麼都沒中，比最大的牌。', 17.4],
];
const COURSE = [
  { id: 1, name: '新手村', goal: '牌型大小、位置與盲注、下注規則和邊池：打牌一定要會的規則。', lessons: [
    { id: '1-1', title: '牌型大小', sum: '7 張挑最好的 5 張；一樣的牌型怎麼比。', read: [
      '德州撲克用你的 <b>2 張手牌</b>加 <b>5 張公牌</b>，7 張裡挑<b>最好的 5 張</b>比大小。手牌可以用 2 張、1 張，甚至都不用（公牌本身最大時大家平分）。',
      { k: 'cats' },
      { k: 'tip', html: '口訣：<b>越難湊到的越大</b>。同花比順子難湊，所以同花 > 順子；葫蘆又比同花難。最後一欄是 7 張牌打到河牌時湊到的機率（例外是高牌：7 張牌要完全湊不出一對其實不容易，但它還是最小的牌型）。' },
      '<b>一樣的牌型怎麼比</b>：先比組成牌型的牌（兩對先比大的那對、再比小的那對），還一樣就比剩下最大的牌——叫<b>踢腳</b>。5 張點數完全一樣就平分。<b>花色不分大小</b>。',
      '<b>常見陷阱</b>：① 公牌本身就是順子或同花時，你的手牌可能根本沒用到；② A 可以當最小組成 [5s4h3d2cAs] 這種最小的順子，但不能繞圈（Q-K-A-2-3 不是順子）；③ 最多只用 5 張：7 張裡有三對，也只算最大的兩對加最大的踢腳。',
    ], practice: { gens: ['handType', 'whoWins'], n: 6 }, quiz: { gens: ['whoWins', 'handType', 'whoWins'], n: 8, pass: 7 } },
    { id: '1-2', title: '位置與盲注', sum: '誰先說話、為什麼越晚說話越好。', read: [
      '每手牌開始前，按鈕（<b>D</b>）左邊第一位放<b>小盲</b>、第二位放<b>大盲</b>（強制下注，大盲通常是小盲的 2 倍），讓底池一開始就有錢可搶。按鈕每手往左移一位。',
      { k: 'seats', n: 6, btn: 3, label: true },
      '<b>說話順序</b>：翻牌前從大盲的下一位（<b>槍口</b>）開始，大盲最後；翻牌後從小盲開始（還在牌局裡的第一個），<b>按鈕最後</b>。',
      '<b>為什麼位置重要</b>：越晚說話，越能先看到別人怎麼做再決定。按鈕翻牌後永遠最後說話，是最好的位置；盲注翻牌後最先說話，最吃虧。所以<b>越前面的位置，要玩越好的牌</b>（第 2、3 階會用圖表講清楚）。',
      '<b>位置名稱</b>（6 人桌，從按鈕往左）：按鈕 → 小盲 → 大盲 → 槍口 → 劫位 → 關煞位。9 人桌在槍口和劫位之間多了槍口+1、中位、低劫位。',
      { k: 'tip', html: '單挑（2 人）特例：按鈕同時是小盲，<b>翻牌前先說話、翻牌後最後說話</b>。' },
    ], practice: { gens: ['posName', 'firstAct'], n: 6 }, quiz: { gens: ['posName', 'firstAct'], n: 8, pass: 7 } },
    { id: '1-3', title: '下注規則與邊池', sum: '最小加注、全下時錢怎麼分。', read: [
      '輪到你時可以：<b>過牌</b>（沒人下注時，不花錢）、<b>下注</b>、<b>跟注</b>（補到跟最高的一樣）、<b>加注</b>、<b>棄牌</b>；<b>全下</b>＝把籌碼全部推出去。',
      '<b>最小加注</b>：至少要多加「上一次加注的幅度」。例如盲注 1/2，有人加注到 6（多加了 4），再加注最少要到 6 ＋ 4 ＝ <b>10</b>。沒人加注時第一次加注，至少到 2 個大盲。',
      '<b>邊池</b>：全下的人籌碼比較少時，他只能贏「每個人都跟他放一樣多」的部分（<b>主池</b>）；多出來的錢另外做<b>邊池</b>，只有付了那些錢的人能搶。',
      { k: 'tip', html: '例：A 有 100、B 有 300、C 有 500，三人都全下。<br>主池 100 × 3 ＝ <b>300</b>（三人都能贏）；邊池 (300 − 100) × 2 ＝ <b>400</b>（只有 B、C 能贏）；C 多的 200 沒人跟，<b>退回給 C</b>。' },
      '所以<b>短碼全下時，最多只能從每個對手身上贏到跟自己籌碼一樣多</b>；錦標賽裡短碼全下的道理就在這裡。',
    ], practice: { gens: ['minRaise', 'sidePot'], n: 6 }, quiz: { gens: ['minRaise', 'sidePot'], n: 8, pass: 7 } },
  ] },
  { id: 2, name: '起手牌大師', goal: '169 種起手牌分五層，照強度順序一手一手講；練到看牌 3 秒就知道玩不玩。', lessons: [
    { id: '2-1', title: '169 種起手牌怎麼分', sum: '組合數、同花和對子的真正價值、五層地圖。', read: [
      '兩張牌一共有 <b>1,326 種組合</b>，但花色本身不分大小，可以合併成 <b>169 種起手牌</b>：13 種對子（每種 6 個組合）、78 種同花（每種 4 個）、78 種不同花（每種 12 個）。13 × 6 ＋ 78 × 4 ＋ 78 × 12 ＝ 1,326。',
      '<b>寫法</b>：AKs ＝ A、K 同花（s＝suited），AKo ＝ 不同花（o＝offsuit），AA ＝ 一對 A，<b>T ＝ 10</b>（KTs 就是 K、10 同花）。下面的 13 × 13 格：<b>右上是同花、左下是不同花、斜線是對子</b>。',
      { k: 'grid' },
      '格子照<b>五層</b>上色：頂級、強牌、中堅、投機、邊緣與垃圾。層是照「<b>怎麼打</b>」分的：前三層是大牌（照強度），第 4 層投機牌靠中大牌賺錢（小對子、同花連張），排名不一定比第 5 層的邊緣牌前面。接下來五課一層一層講，每一手都能點開看詳細（也可以從「起手牌字典」查）。',
      '<b>強度排名怎麼來的</b>：照常見 GTO 開牌圖，一手牌能在越多位置開牌就越強；一樣時看勝率。牌局裡教練說的「排第幾名」就是這個排名。',
      { k: 'tip', html: '三個一定要記的數字：<br>① <b>同花</b>只比不同花多約 2–3% 勝率（AKs 對隨機牌 67%、AKo 65%）——同花是加分，不是理由。<br>② <b>對子</b>翻牌中三條約 12%（8.5 次中 1 次）。<br>③ <b>不是對子</b>的牌，翻牌中至少一對約 32%（3 次中 1 次）——大部分時候你什麼都沒中。' },
    ], practice: { gens: ['combos', 'stronger'], n: 6 }, quiz: { gens: ['combos', 'stronger'], n: 8, pass: 7 } },
    { id: '2-2', title: '第 1 層：頂級', sum: 'AA、KK、QQ、AK：任何位置都打大底池。', read: [{ k: 'tier', t: 1 }],
      practice: { gens: [['tierOf', { tiers: [1, 2, 3] }], ['openOrFold', { tiers: [1] }], ['stronger', { tiers: [1, 2] }]], n: 6 },
      quiz: { gens: [['tierOf', { tiers: [1, 2, 3] }], ['stronger', { tiers: [1, 2, 3] }]], n: 8, pass: 7 } },
    { id: '2-3', title: '第 2 層：強牌', sum: 'JJ–99、AQ、AJs、KQs：強，但小心被壓制。', read: [{ k: 'tier', t: 2 }],
      practice: { gens: [['tierOf', { tiers: [1, 2, 3] }], ['openOrFold', { tiers: [2] }], ['stronger', { tiers: [2, 3] }]], n: 6 },
      quiz: { gens: [['tierOf', { tiers: [1, 2, 3, 4] }], ['stronger', { tiers: [1, 2, 3] }], ['openOrFold', { tiers: [1, 2] }]], n: 8, pass: 7 } },
    { id: '2-4', title: '第 3 層：中堅', sum: '同花大牌和不同花的大牌：位置決定能不能玩。', read: [{ k: 'tier', t: 3 }],
      practice: { gens: [['tierOf', { tiers: [2, 3, 4] }], ['openOrFold', { tiers: [3] }], ['stronger', { tiers: [3, 4] }]], n: 6 },
      quiz: { gens: [['tierOf', { tiers: [2, 3, 4, 5] }], ['openOrFold', { tiers: [2, 3] }], ['stronger', { tiers: [2, 3, 4] }]], n: 8, pass: 7 } },
    { id: '2-5', title: '第 4 層：投機', sum: '小對子、同花 A、同花連張：便宜進場、等中大牌。', read: [{ k: 'tier', t: 4 }],
      practice: { gens: [['tierOf', { tiers: [3, 4, 5] }], ['openOrFold', { tiers: [4] }], ['stronger', { tiers: [4, 5] }]], n: 6 },
      quiz: { gens: [['tierOf', { tiers: [2, 3, 4, 5] }], ['openOrFold', { tiers: [3, 4] }], ['stronger', { tiers: [3, 4, 5] }]], n: 8, pass: 7 } },
    { id: '2-6', title: '第 5 層：邊緣與垃圾', sum: '只在後位偷盲的牌，和永遠棄的牌。', read: [{ k: 'tier', t: 5 }],
      practice: { gens: [['tierOf', { tiers: [4, 5] }], ['openOrFold', { tiers: [5] }], ['stronger', { tiers: [4, 5] }]], n: 6 },
      quiz: { gens: [['tierOf']], n: 8, pass: 7 } },
    { id: '2-7', title: '結業：3 秒快答', sum: '隨機位置、隨機牌：3 秒內答加注或棄牌。', read: [
      '最後一關練<b>速度</b>：6 人桌隨機位置、隨機牌，沒人加注，<b>3 秒內</b>按「加注」或「棄牌」。出的都是圖表裡答案明確的牌，而且大多在「開不開」的界線附近——這些就是實戰最常卡住的地方。',
      '<b>6 人桌開牌口訣</b>：從槍口開始，每往後一個位置多開哪些牌（照圖表自動列出，跟牌局教練一樣）：',
      { k: 'openDiff', t: '6' },
      { k: 'tip', html: '頂級、強牌、中堅：6 人桌任何位置都開。投機、邊緣的牌：越後面開越多。垃圾：永遠棄。' },
      '先在「練習」不限時做幾題，熟了再開始計時的結業測驗：20 題答對 16 題過關。',
    ], practice: { gens: [['openOrFold', { t: '6' }]], n: 8 }, quiz: { gens: [['openOrFold', { t: '6' }]], n: 20, pass: 16, sec: 3 } },
  ] },
  { id: 3, name: '翻牌前進攻', goal: '各位置的開牌範圍，背成口訣。', lessons: [
    { id: '3-1', title: '為什麼加注、不跛入' }, { id: '3-2', title: '前位開牌' }, { id: '3-3', title: '後位開牌與偷盲' }, { id: '3-4', title: '小盲怎麼打' }, { id: '3-5', title: '開牌口訣與快答' }] },
  { id: 4, name: '翻牌前防守', goal: '面對加注：再加注、跟注、棄牌怎麼選。', lessons: [
    { id: '4-1', title: '面對加注三選一' }, { id: '4-2', title: '大盲防守' }, { id: '4-3', title: '3-bet 的價值牌' }, { id: '4-4', title: '3-bet 的詐唬牌' }, { id: '4-5', title: '面對 3-bet 與 4-bet' }, { id: '4-6', title: '防守快答' }] },
  { id: 5, name: '數學課', goal: '底池賠率、出牌數、隱含賠率、推或棄：心算到不用想。', lessons: [
    { id: '5-1', title: '底池賠率' }, { id: '5-2', title: '出牌數與 2–4 法則' }, { id: '5-3', title: '隱含賠率' }, { id: '5-4', title: '勝率實現與打折' }, { id: '5-5', title: '短碼推或棄' }, { id: '5-6', title: '心算快答' }] },
  { id: 6, name: '翻牌後基礎', goal: '中了什麼、公牌質地、下注與面對下注。', lessons: [
    { id: '6-1', title: '中了什麼：牌力分級' }, { id: '6-2', title: '公牌質地' }, { id: '6-3', title: '持續下注' }, { id: '6-4', title: '下注大小' }, { id: '6-5', title: '面對下注的框架' }, { id: '6-6', title: '轉牌與河牌的計畫' }, { id: '6-7', title: '實戰考核' }] },
  { id: 7, name: '範圍思維', goal: '不猜一手牌，想一整個範圍。', lessons: [
    { id: '7-1', title: '用範圍思考' }, { id: '7-2', title: '範圍優勢與堅果優勢' }, { id: '7-3', title: '組合數與阻擋牌' }, { id: '7-4', title: '從動作還原範圍' }, { id: '7-5', title: '實戰考核' }] },
  { id: 8, name: 'GTO 大師', goal: '頻率、混合策略、用工作室研究；GTO 訓練場達標畢業。', lessons: [
    { id: '8-1', title: 'GTO 是什麼、什麼時候偏離' }, { id: '8-2', title: '頻率與混合策略' }, { id: '8-3', title: 'GTO 工作室導讀' }, { id: '8-4', title: 'GTO 訓練場' }, { id: '8-5', title: '畢業考' }] },
];
for (const s of COURSE) for (const l of s.lessons) { l.stage = s.id; l.ready = !!(l.quiz); if (l.read) l.read = l.read.map((b) => (typeof b === 'string' ? LTXT(b) : b.html ? Object.assign({}, b, { html: LTXT(b.html) }) : b)); }
function lessonById(id) { for (const s of COURSE) for (const l of s.lessons) if (l.id === id) return l; return null; }
function allLessons() { const out = []; for (const s of COURSE) for (const l of s.lessons) out.push(l); return out; }
/* 每一階的跳級測驗、分級測驗用的題目 */
const STAGE_GENS = {
  1: ['whoWins', 'handType', 'minRaise', 'sidePot', 'firstAct', 'posName'],
  2: ['combos', ['tierOf'], ['stronger'], ['openOrFold', { t: '6' }]],
  3: [['openOrFold', { t: '6' }], ['openOrFold', { t: '9' }]],
  4: ['defend'],
  5: ['potOdds', 'outs'],
  6: ['s6'],
  7: ['blockCombos'],
  8: ['s8'],
};
const PLACEMENT = [[1, 'whoWins'], [2, ['stronger']], [2, 'combos'], [3, ['openOrFold', { t: '6' }]], [3, ['openOrFold', { t: '9' }]], [4, 'defend'], [4, 'defend'], [5, 'potOdds'], [5, 'outs'], [6, 's6'], [7, 'blockCombos'], [8, 's8']];
function makePlacement(rng) {
  const out = [], seen = new Set();
  for (const [st, spec] of PLACEMENT) {
    let q;
    for (let i = 0; i < 20; i++) { q = makeQ(spec, rng); if (!seen.has(q.key)) break; }
    seen.add(q.key); q.stage = st; out.push(q);
  }
  return out;
}
/* 分級結果：第一個有錯的階段就是起點（全對＝第 8 階） */
function placementStart(results) {
  const by = {};
  for (const r of results) { by[r.stage] = by[r.stage] || { n: 0, ok: 0 }; by[r.stage].n++; if (r.ok) by[r.stage].ok++; }
  for (let s = 1; s <= 8; s++) if (by[s] && by[s].ok < by[s].n) return { start: s, by };
  return { start: 8, by };
}
/* ===== 進度 =====
   LP = { done: { '1-1': { s: 分數, n: 題數, at } }, skip: { 1: true }, place: { start, at }, best: { 快答連對 } } */
function learnBlank() { return { done: {}, skip: {}, place: null, best: {} }; }
function lessonDone(LP, id) { const l = lessonById(id); return !!(LP.done[id] || (l && LP.skip[l.stage])); }
function learnNext(LP) {
  for (const s of COURSE) {
    if (LP.skip[s.id]) continue;
    for (const l of s.lessons) if (!LP.done[l.id]) return l.ready ? l : { id: l.id, title: l.title, stage: l.stage, ready: false };
  }
  return null;
}
function learnCount(LP) { let d = 0, n = 0; for (const l of allLessons()) { n++; if (lessonDone(LP, l.id)) d++; } return { done: d, total: n }; }
