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
