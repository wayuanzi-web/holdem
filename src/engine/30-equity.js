/* ===== 30-equity：勝率、到河牌的牌型機率、出牌數（Outs） ===== */

/* 剩下的牌（排除 dead 裡的牌） */
function deckWithout(dead) {
  const used = new Uint8Array(52);
  for (const c of dead) used[c] = 1;
  const out = [];
  for (let c = 0; c < 52; c++) if (!used[c]) out.push(c);
  return new Uint8Array(out);
}

/* 蒙地卡羅：hero 兩張、公牌 0–5 張，一次發 maxOpp 個對手；
   「對 N 家」用前 N 個對手算（同一批模擬，N 越多越嚴格）。
   回傳 win[N]（獨贏的次數）、tie[N]（平手時分到的份數）、tieP[N]（平手的次數）、到河牌時 hero 的牌型次數 cat[0..8]；
   勝率（equity）＝ (win + tie) / n */
function mcEquity(hero, board, maxOpp, iters, seed, acc) {
  const rng = makeRng(seed || 1);
  const deck = deckWithout(hero.concat(board));
  const nd = deck.length, nb = 5 - board.length, need = nb + 2 * maxOpp;
  if (!acc) acc = { n: 0, win: new Float64Array(maxOpp + 1), tie: new Float64Array(maxOpp + 1), tieP: new Float64Array(maxOpp + 1), cat: new Float64Array(9) };
  const B0 = boardState(board), B = new Int32Array(8), ov = new Int32Array(maxOpp);
  const h1 = hero[0], h2 = hero[1];
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < need; i++) {                       // 部分洗牌：只洗要用到的前幾張
      const j = i + ((rng() * (nd - i)) | 0);
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    B.set(B0);
    for (let i = 0; i < nb; i++) boardAdd(B, deck[i]);
    const hv = evalAdd2(B, h1, h2);
    acc.cat[hv >>> 26]++;
    for (let o = 0, k = nb; o < maxOpp; o++, k += 2) ov[o] = evalAdd2(B, deck[k], deck[k + 1]);
    let best = -1, nEq = 0;
    for (let o = 0; o < maxOpp; o++) {
      const v = ov[o];
      if (v > best) { best = v; nEq = 1; } else if (v === best) nEq++;
      const N = o + 1;
      if (hv > best) acc.win[N]++;
      else if (hv === best) { acc.tie[N] += 1 / (nEq + 1); acc.tieP[N]++; }
    }
  }
  acc.n += iters;
  return acc;
}

/* 兩人、對手是隨機手牌或指定範圍（oppW：1326 格權重）的精確勝率：所有發牌 × 所有對手手牌 */
function exactHU(hero, board, oppW) {
  const dead = new Uint8Array(52);
  for (const c of hero) dead[c] = 1;
  for (const c of board) dead[c] = 1;
  const opp = [], ow = [];
  for (let k = 0; k < NCOMBO; k++) {
    const a = COMBO_A[k], b = COMBO_B[k];
    if (dead[a] || dead[b]) continue;
    const w = oppW ? oppW[k] : 1;
    if (w > 0) { opp.push(k); ow.push(w); }
  }
  const deck = deckWithout(hero.concat(board));
  const nb = 5 - board.length;
  const B0 = boardState(board), B = new Int32Array(8), used = new Uint8Array(52);
  let win = 0, tie = 0, tot = 0;
  const run = [];
  const leaf = () => {
    B.set(B0);
    for (const c of run) { boardAdd(B, c); used[c] = 1; }
    const hv = evalAdd2(B, hero[0], hero[1]);
    for (let i = 0; i < opp.length; i++) {
      const k = opp[i], a = COMBO_A[k], b = COMBO_B[k];
      if (used[a] || used[b]) continue;
      const v = evalAdd2(B, a, b), w = ow[i];
      tot += w;
      if (hv > v) win += w; else if (hv === v) tie += w;
    }
    for (const c of run) used[c] = 0;
  };
  const rec = (start, left) => {
    if (!left) { leaf(); return; }
    for (let i = start; i < deck.length; i++) { run.push(deck[i]); rec(i + 1, left - 1); run.pop(); }
  };
  if (nb > 2) return null;                                  // 翻牌前用預先算好的表
  rec(0, nb);
  return tot ? { win: win / tot, tie: tie / tot, lose: 1 - (win + tie) / tot, eq: (win + tie / 2) / tot } : null;
}

/* 到河牌時 hero 的牌型機率（翻牌、轉牌精確列舉；河牌就是現在的牌型） */
function catDistExact(hero, board) {
  const cat = new Float64Array(9);
  const nb = 5 - board.length;
  if (nb > 2) return null;
  const deck = deckWithout(hero.concat(board));
  const all = hero.concat(board);
  const B = boardState(all);
  let n = 0;
  if (nb === 0) { cat[evalCards(all) >>> 26] = 1; return { cat, n: 1 }; }
  if (nb === 1) { for (let i = 0; i < deck.length; i++) { cat[evalAdd1(B, deck[i]) >>> 26]++; n++; } }
  else for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) { cat[evalAdd2(B, deck[i], deck[j]) >>> 26]++; n++; }
  for (let i = 0; i < 9; i++) cat[i] /= n;
  return { cat, n };
}

/* 出牌數：下一張牌讓 hero 的牌型升級（公牌自己升級的不算，例如公牌成對）。
   兩對以上、或配成頂對（比公牌最大的牌還大）才算「出牌」；配成中對、底對的列為「弱出牌」，不算進張數 */
function outsInfo(hero, board) {
  if (board.length < 3 || board.length > 4) return null;
  const cur = handCat(evalCards(hero.concat(board)));
  const deck = deckWithout(hero.concat(board));
  let topBoard = 0;
  for (const c of board) topBoard = Math.max(topBoard, c >> 2);
  const groups = new Map();
  let total = 0, weak = 0;
  for (const c of deck) {
    const v = evalCards(hero.concat(board, [c]));
    const cat = handCat(v), bc = handCat(evalCards(board.concat([c])));
    if (!(cat > cur && cat > bc)) continue;
    const strong = cat >= 2 || (cat === 1 && TOPBIT[(v >> 13) & 8191] > topBoard);
    const key = cat * 2 + (strong ? 1 : 0);
    if (!groups.has(key)) groups.set(key, { cat, name: CAT_NAMES[cat], strong, cards: [] });
    groups.get(key).cards.push(c);
    if (strong) total++; else weak++;
  }
  const list = [...groups.values()].sort((a, b) => (b.strong - a.strong) || (b.cat - a.cat));
  const left = deck.length;
  const pNext = total / left;                                             // 下一張就中
  const pRiver = board.length === 3 ? 1 - ((left - total) / left) * ((left - 1 - total) / (left - 1)) : pNext;   // 翻牌時：到河牌至少中一張
  return { cur, groups: list, total, weak, left, pNext, pRiver };
}

/* 翻牌前查表（35-preflop-data 預先算好） */
function preflopClassOf(hero) { return classIndex(hero[0] >> 2, hero[1] >> 2, (hero[0] & 3) === (hero[1] & 3)); }
function preflopLookup(g) {
  if (typeof PREFLOP === 'undefined') return null;
  const n = PREFLOP.N;
  const eq = [], win = [], tie = [];
  for (let k = 0; k < n; k++) {
    win.push(PREFLOP.win[g * n + k] / 1e4); tie.push(PREFLOP.tie[g * n + k] / 1e4);
    eq.push((PREFLOP.win[g * n + k] + PREFLOP.tie[g * n + k]) / 1e4);   // tie 存的是平手分到的份數
  }
  const cat = [];
  for (let i = 0; i < 9; i++) cat.push(PREFLOP.cat[g * 9 + i] / 1e4);
  return { eq, win, tie, cat, rank: PREFLOP.rank ? PREFLOP.rank.slice(g * n, g * n + n) : null };
}

/* ===== 範圍對範圍（第六步）：A 的每一手牌對 B 整個範圍的勝率 =====
   公牌 3–5 張：把剩下的公牌每一種發法都算（精確）；翻牌前：隨機抽 iters 組 5 張公牌（不偏：每一對手牌避開公牌的機率一樣）。
   每一組公牌：雙方手牌照牌力排好，一次掃過（扣掉跟自己撞牌的對手手牌），跟求解器的攤牌一樣。 */
function rangeVsRange(board, wA, wB, opt) {
  opt = opt || {};
  const dead = new Uint8Array(52);
  for (const c of board) dead[c] = 1;
  const mk = (w) => { const hs = [], ws = []; for (let k = 0; k < NCOMBO; k++) if (w[k] > 0 && !dead[COMBO_A[k]] && !dead[COMBO_B[k]]) { hs.push(k); ws.push(w[k]); } return { hs, ws }; };
  const A = mk(wA), B = mk(wB), nA = A.hs.length, nB = B.hs.length;
  const out = { nA, nB, eq: new Float64Array(nA), comp: new Float64Array(nA), boards: 0, total: -1, cls: new Array(169).fill(-1), hands: A.hs };
  if (!nA || !nB) return out;
  const aA = A.hs.map((k) => COMBO_A[k]), aB = A.hs.map((k) => COMBO_B[k]), bA = B.hs.map((k) => COMBO_A[k]), bB = B.hs.map((k) => COMBO_B[k]);
  const vA = new Int32Array(nA), vB = new Int32Array(nB), oA = new Int32Array(nA), oB = new Int32Array(nB);
  const cw = new Float64Array(52), lt = new Float64Array(nA), le = new Float64Array(nA);
  const idxB = new Int32Array(NCOMBO).fill(-1);
  B.hs.forEach((k, j) => { idxB[k] = j; });
  const same = A.hs.map((k) => idxB[k]);
  const one = (full) => {                                   // full：5 張公牌
    const st = boardState(full), used = new Uint8Array(52);
    for (const c of full) used[c] = 1;
    let na = 0, nb = 0;
    for (let i = 0; i < nA; i++) { if (used[aA[i]] || used[aB[i]]) continue; vA[i] = evalAdd2(st, aA[i], aB[i]); oA[na++] = i; }
    for (let j = 0; j < nB; j++) { if (used[bA[j]] || used[bB[j]]) continue; vB[j] = evalAdd2(st, bA[j], bB[j]); oB[nb++] = j; }
    const sa = oA.subarray(0, na).sort((x, y) => vA[x] - vA[y]), sb = oB.subarray(0, nb).sort((x, y) => vB[x] - vB[y]);
    cw.fill(0);
    let s = 0, i = 0, j = 0;
    while (i < na) {
      const v = vA[sa[i]];
      while (j < nb && vB[sb[j]] < v) { const g = sb[j], x = B.ws[g]; s += x; cw[bA[g]] += x; cw[bB[g]] += x; j++; }
      let i2 = i;
      while (i2 < na && vA[sa[i2]] === v) { const h = sa[i2]; lt[h] = s - cw[aA[h]] - cw[aB[h]]; i2++; }
      while (j < nb && vB[sb[j]] === v) { const g = sb[j], x = B.ws[g]; s += x; cw[bA[g]] += x; cw[bB[g]] += x; j++; }
      for (let q = i; q < i2; q++) { const h = sa[q], m = same[h]; le[h] = s - cw[aA[h]] - cw[aB[h]] + (m >= 0 && !used[bA[m]] ? B.ws[m] : 0); }
      i = i2;
    }
    while (j < nb) { const g = sb[j], x = B.ws[g]; s += x; cw[bA[g]] += x; cw[bB[g]] += x; j++; }
    for (let q = 0; q < na; q++) {
      const h = sa[q], m = same[h];
      const comp = s - cw[aA[h]] - cw[aB[h]] + (m >= 0 ? B.ws[m] : 0);
      out.eq[h] += (lt[h] + le[h]) / 2 * 1;                  // 贏的算 1、平手算一半：(lt + le)/2 ＝ lt + (le − lt)/2
      out.comp[h] += comp;
    }
    out.boards++;
  };
  if (board.length >= 3) {
    const rest = [];
    for (let c = 0; c < 52; c++) if (!dead[c]) rest.push(c);
    const need = 5 - board.length;
    if (need === 0) one(board);
    else if (need === 1) for (const c of rest) one(board.concat([c]));
    else for (let x = 0; x < rest.length; x++) for (let y = x + 1; y < rest.length; y++) one(board.concat([rest[x], rest[y]]));
  } else {
    const rng = makeRng(opt.seed || 12345), iters = opt.iters || 3000, deck = [];
    for (let c = 0; c < 52; c++) if (!dead[c]) deck.push(c);
    for (let t = 0; t < iters; t++) {
      for (let q = 0; q < 5 - board.length; q++) { const r = q + ((rng() * (deck.length - q)) | 0); const tmp = deck[q]; deck[q] = deck[r]; deck[r] = tmp; }
      one(board.concat(deck.slice(0, 5 - board.length)));
    }
  }
  // 每一手、每一格、整體
  let tot = 0, totW = 0;
  const cls = new Float64Array(169), clsW = new Float64Array(169);
  for (let h = 0; h < nA; h++) {
    const e = out.comp[h] > 0 ? out.eq[h] / out.comp[h] : 0, w = A.ws[h] * out.comp[h];
    tot += e * w; totW += w;
    cls[CLASS_OF[A.hs[h]]] += e * w; clsW[CLASS_OF[A.hs[h]]] += w;
    out.eq[h] = e;
  }
  out.total = totW ? tot / totW : -1;                          // -1：A 的每一手都被 B 撞掉，沒有可以比的
  out.cls = Array.from(cls, (x, g) => (clsW[g] ? x / clsW[g] : -1));
  out.hands = A.hs;
  return out;
}
