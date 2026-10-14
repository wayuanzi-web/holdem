/* ===== 46-studio：工作室用的東西（範圍庫、牌型分類、下一張牌報告、局面、從牌局帶入） ===== */

/* 範圍庫：6 人桌 100 大盲常見的近似範圍（不是解出來的，拿來當起點） */
const RANGE_LIB = [
  { key: 'utg', name: '槍口開牌（約 15%）', text: '66+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,65s,ATo+,KJo+,QJo' },
  { key: 'hj', name: '劫位開牌（約 20%）', text: '44+,A2s+,K7s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,65s,54s,A9o+,KTo+,QTo+,JTo' },
  { key: 'co', name: '關煞位開牌（約 27%）', text: '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,96s+,85s+,75s+,64s+,54s,A7o+,A5o,K9o+,Q9o+,J9o+,T9o' },
  { key: 'btn', name: '按鈕開牌（約 44%）', text: RANGE_BTN_OPEN },
  { key: 'sb', name: '小盲開牌（約 40%）', text: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,74s+,64s+,53s+,43s,A2o+,K7o+,Q8o+,J8o+,T8o+,98o,87o' },
  { key: 'bbVbtn', name: '大盲跟按鈕的開牌', text: RANGE_BB_CALL },
  { key: 'bbVco', name: '大盲跟關煞位的開牌', text: '22-TT,A2s-AJs,K6s-KJs,Q8s-QJs,J8s-JTs,T7s-T9s,96s+,86s+,75s+,64s+,54s,A8o-AJo,KTo-KJo,QTo-QJo,JTo' },
  { key: 'bbVutg', name: '大盲跟槍口的開牌', text: '22-TT,A2s-AQs,K9s-KQs,Q9s-QJs,J9s-JTs,T8s+,97s+,86s+,76s,65s,54s,AJo-AQo,KJo-KQo,QJo' },
  { key: 'btnVco', name: '按鈕跟關煞位的開牌', text: '22-TT,A2s-AJs,K8s-KQs,Q9s-QJs,J8s-JTs,T8s-T9s,97s+,86s+,76s,65s,ATo-AJo,KJo,QJo' },
  { key: 'bb3', name: '大盲對按鈕再加注（3-bet）', text: 'TT+,AQs+,AKo,A5s-A4s,K9s,Q9s,J9s,T8s,76s,65s,54s' },
  { key: 'btnV3', name: '按鈕跟大盲的 3-bet', text: '77-JJ,ATs-AQs,A5s-A4s,KTs-KQs,QTs+,JTs,T9s,98s,87s,AQo,KQo' },
  { key: 'any', name: '任意兩張（100%）', text: '22+,A2+,K2+,Q2+,J2+,T2+,92+,82+,72+,62+,52+,42+,32' },
];

/* ===== 翻牌後的牌型分類（Pio 的 hand classes 簡化版） ===== */
const CATG = ['同花順・四條', '葫蘆', '同花', '順子', '三條', '兩對', '超對', '頂對', '中對', '弱對', '同花聽牌', '兩頭順聽牌', '卡順聽牌', '高牌', '只用公牌'];
const CATG_NOTE = [
  '幾乎是最大的牌', '三條＋一對', '五張同花色', '五張連續', '三張一樣（自己口袋對配到公牌，或一張配到公牌的對子）',
  '兩張手牌各配到一張公牌', '口袋對比公牌最大的還大', '配到公牌最大的那張', '配到第二大的公牌，或口袋對在公牌中間',
  '配到比較小的公牌，或口袋對比公牌都小', '再一張同花色就成同花', '兩頭都能成順（8 張出牌左右）', '中間缺一張才成順（4 張出牌左右）',
  '什麼都沒中', '最好的五張都是公牌，手牌沒有用到',
];
function straightOuts(M, BM) {             // 加哪一個點數能成順（而且要用到手牌）
  let n = 0;
  for (let r = 0; r < 13; r++) {
    const b = 1 << r;
    if (M & b) continue;
    if (STRAIGHT_TOP[M | b] >= 0 && STRAIGHT_TOP[BM | b] < 0 && STRAIGHT_TOP[M] < 0) n++;
  }
  return n;
}
/* 一手牌（兩張）在這組公牌上屬於哪一類（CATG 的編號） */
function handCategory(a, b, board) {
  const all = [a, b].concat(board);
  const v = evalCards(all), c = handCat(v);
  const bv = evalCards(board), bc = handCat(bv);
  if (board.length === 5 && v === bv) return 14;
  const ra = a >> 2, rb = b >> 2;
  const bRanks = [];
  let BM = 0;
  for (const x of board) { const r = x >> 2; if (!(BM & (1 << r))) bRanks.push(r); BM |= 1 << r; }
  bRanks.sort((x, y) => y - x);
  const pairClass = (pr, pocket) => {
    if (pocket) return pr > bRanks[0] ? 6 : (bRanks.length < 2 || pr > bRanks[1]) ? 8 : 9;
    return pr === bRanks[0] ? 7 : pr === bRanks[1] ? 8 : 9;
  };
  if (c >= 7) return 0;
  if (c === 6) return 1;
  if (c === 5) return 2;
  if (c === 4) return 3;
  if (c === 3 && bc < 3) return 4;
  if (c === 2) {
    if (bc === 0) return 5;
    // 公牌本身有對子：其實只有自己的一對
    if (ra === rb) return pairClass(ra, true);
    const hit = [ra, rb].filter((r) => BM & (1 << r));
    if (hit.length) return pairClass(Math.max(...hit), false);
  }
  if (c === 1 && bc === 0) {
    if (ra === rb) return pairClass(ra, true);
    const hit = [ra, rb].filter((r) => BM & (1 << r));
    if (hit.length) return pairClass(Math.max(...hit), false);
  }
  if (board.length < 5) {
    const suits = [0, 0, 0, 0];
    for (const x of all) suits[x & 3]++;
    if ((suits[a & 3] === 4) || (suits[b & 3] === 4)) return 10;
    const so = straightOuts(BM | (1 << ra) | (1 << rb), BM);
    if (so >= 2) return 11;
    if (so === 1) return 12;
  }
  return 13;
}

/* ===== 下注樹的預設 =====
   簡單：每條街一種尺寸＋全下（轉牌大約半分鐘）；標準：兩種尺寸；細：三種尺寸（只建議河牌） */
const TREE_PRESETS = {
  simple: { name: '簡單', bet: { flop: [50], turn: [66], river: [75] }, raise: ['a'], cap: 2 },
  standard: { name: '標準', bet: { flop: [33, 75], turn: [50, 100], river: [33, 75] }, raise: ['2.5x'], cap: 3 },
  fine: { name: '細', bet: { flop: [25, 50, 100], turn: [33, 66, 125], river: [25, 66, 150] }, raise: ['2.5x', 'a'], cap: 3 },
};
function treeFromPreset(key, boardLen) {
  const P = TREE_PRESETS[key] || TREE_PRESETS.simple;
  const bet = {}, raise = {};
  for (let s = boardLen - 3; s < 3; s++) {
    const k = STREET_KEYS[s];
    bet[k] = [P.bet[k].slice(), P.bet[k].slice()];
    raise[k] = [P.raise.slice(), P.raise.slice()];
  }
  return { bet, raise, cap: P.cap, allin: 0.67, addAllin: true };
}
/* 「33 75 全下 2.5x e」→ 尺寸陣列；看不懂的回傳 null */
function parseSizes(txt) {
  const out = [];
  for (let t of String(txt || '').split(/[\s,，、]+/).filter(Boolean)) {
    t = t.replace(/%$/, '');
    if (/^(a|allin|全下)$/i.test(t)) out.push('a');
    else if (/^(e|幾何)$/i.test(t)) out.push('e');
    else if (/^\d+(\.\d+)?x$/i.test(t)) out.push(t.toLowerCase());
    else if (/^\d+(\.\d+)?$/.test(t) && +t > 0 && +t <= 1000) out.push(+t);
    else return null;
  }
  return out;
}
function sizesText(arr) { return (arr || []).map((s) => (s === 'a' ? '全下' : s === 'e' ? '幾何' : String(s))).join(' '); }

/* ===== 局面（spot）：工作室的設定，可以存成分享連結 =====
   { board:'Kd5c6h9h', pot, stack, names:[OOP,IP], ranges:[文字,文字], tree:{bet,raise,cap,allin,addAllin}, target,
     title?, hero?:{p, cards:'JhTh'}, line?:[{p,t,to}|{c:'2d'}] } */
function spotCfg(spot, over) {
  const cfg = {
    board: parseCards(spot.board), pot: +spot.pot, stack: +spot.stack,
    ranges: [parseRange(spot.ranges[0]), parseRange(spot.ranges[1])],
    bet: spot.tree.bet, raise: spot.tree.raise, cap: spot.tree.cap, allin: spot.tree.allin, addAllin: spot.tree.addAllin !== false,
    target: spot.target || 0.5, maxIters: spot.maxIters || 1500,
  };
  return Object.assign(cfg, over || {});
}
function presetSpot(key) {
  const p = PRESETS[key];
  const tree = { bet: {}, raise: {}, cap: p.cap, allin: 0.67, addAllin: true };
  for (const k of Object.keys(p.bet)) { tree.bet[k] = p.bet[k].map((x) => x.slice()); tree.raise[k] = p.raise[k].map((x) => x.slice()); }
  return { board: p.board, pot: p.pot, stack: p.stack, names: p.names || ['BB', 'BTN'], ranges: [p.oop || RANGE_BB_CALL, p.ip || RANGE_BTN_OPEN], tree, target: p.target, title: p.name };
}

/* 估計一次迭代要多久（毫秒）：用這台機器實測的「運算量 → 時間」比例；之後用效能測試或實際跑的速度修正 */
const SPEED = { k: 1.9e-5, c: 1 };          // 一次迭代 ≈ work × k ＋ c 毫秒（雲端測試機）；工作室跑過一次就換成這台裝置實際的速度
/* threads：幾個背景執行緒一起算（翻牌、轉牌才分得開）；compress：16 位元儲存大約慢 40% */
function estimateTime(est, target, threads, compress) {
  const iters = target <= 0.3 ? 330 : target <= 0.5 ? 220 : 140;
  const sp = threads >= 2 ? threads * 0.8 : 1;
  return { iters, ms: iters * (est.work * SPEED.k + SPEED.c) * 1.1 * (compress ? 1.4 : 1) / sp };
}

/* ===== 從牌局帶入：一手牌的某一條街開始（只能兩個人） =====
   street：1 翻牌、2 轉牌、3 河牌。回傳 spot，或 { error } */
function spotFromHand(H, street) {
  const idx = H.log.findIndex((e) => e.k === 'street' && e.street === street);
  if (idx < 0) return { error: '這一手沒有到' + STREET_NAME[street] + '。' };
  const n = H.n, put = new Array(n).fill(0), folded = new Array(n).fill(false);
  for (let i = 0; i < idx; i++) {
    const e = H.log[i];
    if (e.k === 'blinds') { put[e.sb.seat] += e.sb.amt; put[e.bb.seat] += e.bb.amt; }
    else if (e.k === 'act') { if (e.t === 'f') folded[e.seat] = true; if (e.add) put[e.seat] += e.add; }
  }
  const live = [];
  for (let k = 0; k < n; k++) if (!folded[k]) live.push(k);
  if (live.length !== 2) return { error: STREET_NAME[street] + '開始時還有 ' + live.length + ' 個人；GTO 求解只能算兩個人。' };
  if (live.indexOf(0) < 0) return { error: '你在' + STREET_NAME[street] + '之前就棄牌了。' };
  const left = live.map((k) => H.players[k].start - put[k]);
  if (Math.min(left[0], left[1]) <= 0) return { error: STREET_NAME[street] + '開始時已經有人全下，沒有東西可以算。' };
  const dist = (k) => ((k - H.button + n) % n) || n;          // 按鈕最後說話
  const [oop, ip] = dist(live[0]) < dist(live[1]) ? live : [live[1], live[0]];
  const seats = [oop, ip];
  const r2 = (x) => Math.round(x * 100) / 100;                // 單位用籌碼，跟牌局畫面一樣
  const pot = put.reduce((s, x) => s + x, 0);
  const board = H.board.slice(0, street === 1 ? 3 : street === 2 ? 4 : 5);
  const dead = new Set(board);
  const ranges = seats.map((k) => {
    const p = H.players[k];
    const w = rangeWeights(H, k, k === 0 ? 'tag' : p.style, idx);
    let mx = 0;
    for (let c = 0; c < NCOMBO; c++) if (!dead.has(COMBO_A[c]) && !dead.has(COMBO_B[c]) && w[c] > mx) mx = w[c];
    const q = new Float32Array(NCOMBO);
    for (let c = 0; c < NCOMBO; c++) {
      if (dead.has(COMBO_A[c]) || dead.has(COMBO_B[c]) || !mx) continue;
      const x = Math.round(w[c] / mx * 20) / 20;                // 以 5% 為一格，太小的拿掉（範圍小、求解快）
      if (x >= 0.1) q[c] = x;
    }
    const own = comboOf(p.cards[0], p.cards[1]);
    if (!(q[own] >= 0.05)) q[own] = 0.05;                       // 實際的手牌一定要在範圍裡
    return rangeText(q);
  });
  // 實際的打法：之後的每一個動作、每一張公牌；同時收集實際用到的尺寸
  const line = [], used = { bet: {}, raise: {} };
  let st = street, raises = 0, maxRaises = 0;
  for (let i = idx + 1; i < H.log.length; i++) {
    const e = H.log[i];
    if (e.k === 'street') { line.push({ c: cardStr(e.cards[0]) }); st = e.street; raises = 0; continue; }
    if (e.k !== 'act') continue;
    const p = seats.indexOf(e.seat);
    if (p < 0) continue;
    const key = STREET_KEYS[st - 1];
    if (e.t === 'b' || e.t === 'r' || (e.t === 'a' && e.to > e.curBefore)) {
      if (e.curBefore === 0) { const pc = Math.round(e.add / Math.max(1, e.potBefore) * 100); if (e.t !== 'a') ((used.bet[key] = used.bet[key] || [[], []])[p]).push(pc); }
      else if (e.t !== 'a') ((used.raise[key] = used.raise[key] || [[], []])[p]).push((Math.round(e.to / e.curBefore * 10) / 10) + 'x');
      raises++; maxRaises = Math.max(maxRaises, raises);
      line.push({ p, t: e.t === 'a' ? 'a' : e.curBefore === 0 ? 'b' : 'r', to: r2(e.to) });
    } else line.push({ p, t: e.t === 'a' ? 'c' : e.t, to: e.to ? r2(e.to) : 0 });
    if (e.t === 'f') break;
  }
  const tree = treeFromPreset('simple', board.length);
  for (const key of Object.keys(tree.bet)) for (let p = 0; p < 2; p++) {
    const add = (arr, list) => { for (const s of list || []) if (!arr.some((x) => typeof x === 'number' && typeof s === 'number' && Math.abs(x - s) <= 3) && arr.indexOf(s) < 0) arr.push(s); };
    add(tree.bet[key][p], used.bet[key] && used.bet[key][p]);
    add(tree.raise[key][p], used.raise[key] && used.raise[key][p]);
    tree.bet[key][p].sort((x, y) => (x === 'a') - (y === 'a') || x - y);
  }
  if (maxRaises >= 3) tree.cap = 3;
  const nm = (k) => (k === 0 ? '你' : H.players[k].name) + '・' + POS_ZH[H.players[k].pos];
  const heroP = seats.indexOf(0);
  return {
    board: board.map(cardStr).join(''), pot: r2(pot), stack: r2(Math.min(left[0], left[1])), unit: '籌碼',
    names: seats.map(nm), ranges, tree, target: 0.5,
    title: '第 ' + H.no + ' 手・從' + STREET_NAME[street] + '開始',
    hero: { p: heroP, cards: H.players[0].cards.map(cardStr).join(''), pos: POS_ZH[H.players[0].pos] },
    line,
  };
}
/* 這一手可以從哪幾條街帶進工作室（翻牌、轉牌、河牌各自可不可以） */
function importableStreets(H) {
  const out = [];
  for (let s = 1; s <= 3; s++) { const sp = spotFromHand(H, s); out.push({ street: s, ok: !sp.error, error: sp.error, spot: sp.error ? null : sp }); }
  return out;
}

/* 把實際的動作對到樹上最接近的動作編號 */
function matchAct(acts, step) {
  if (step.t === 'f' || step.t === 'x' || step.t === 'c') {
    const i = acts.findIndex((a) => a.t === step.t);
    if (i >= 0) return i;
    if (step.t === 'x') return acts.findIndex((a) => a.t === 'c');
    return -1;
  }
  let best = -1, bd = Infinity;
  acts.forEach((a, i) => {
    if (a.t !== 'b' && a.t !== 'r' && a.t !== 'a') return;
    const d = Math.abs(a.to - step.to) + (step.t === 'a' && a.t !== 'a' ? 1000 : 0);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
