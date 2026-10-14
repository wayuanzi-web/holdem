/* ===== 62-ranges：起手牌排名、照公開動作估對手的範圍、對範圍的勝率 =====
   只用公開的資訊（位置、風格、每個人做過的動作、公牌），不偷看別人的牌。AI 和教練用同一套。 */

/* 起手牌排名：對 1 家和對 3 家勝率的名次平均，再把對子、同花連張往前調（多人底池好打）。
   PRE_PCT[格] ＝ 這一格在所有 1326 組合裡排到前百分之幾（0 最好）；PRE_RANK[格] ＝ 第幾名（1–169） */
const PRE_PCT = new Float32Array(169), PRE_RANK = new Int16Array(169);
(function initPreRank() {
  if (typeof PREFLOP === 'undefined') return;
  const n = 169, e1 = [], e3 = [];
  for (let g = 0; g < n; g++) { const p = preflopLookup(g); e1.push(p.eq[0]); e3.push(p.eq[2]); }
  const rk = (a) => { const o = [...a.keys()].sort((x, y) => a[y] - a[x]); const r = new Array(n); o.forEach((g, i) => { r[g] = i; }); return r; };
  const r1 = rk(e1), r3 = rk(e3);
  const score = [];
  for (let g = 0; g < n; g++) {
    const row = (g / 13) | 0, col = g % 13;
    let s = (r1[g] + r3[g]) / 2;
    if (row === col) s -= Math.max(0, 40 - row);
    else if (row < col) { const hi = 12 - row, lo = 12 - col, gap = hi - lo; if (gap === 1 && lo >= 3) s -= 22; else if (gap === 2 && lo >= 3) s -= 12; }
    score.push(s);
  }
  const ord = [...Array(n).keys()].sort((a, b) => score[a] - score[b]);
  let cum = 0;
  ord.forEach((g, i) => { const sz = classSize(g); PRE_PCT[g] = (cum + sz / 2) / NCOMBO; cum += sz; PRE_RANK[g] = i + 1; });
})();
function comboPct(k) { return PRE_PCT[CLASS_OF[k]]; }

/* 風格：鬆緊（loose，越大玩越多手）、積極（aggr）、詐唬（bluff）、黏（sticky：跟注時少要求幾 % 勝率） */
const STYLES = {
  tag: { zh: '緊凶', loose: 1.0, aggr: 0.65, bluff: 0.10, sticky: 0.0, note: '牌好才玩，玩就積極下注' },
  lag: { zh: '鬆凶', loose: 1.45, aggr: 0.75, bluff: 0.2, sticky: 0.02, note: '玩很多手，常常主動下注、加注' },
  rock: { zh: '岩石', loose: 0.62, aggr: 0.35, bluff: 0.03, sticky: -0.02, note: '很少玩，一下大注通常是大牌' },
  station: { zh: '跟注站', loose: 1.9, aggr: 0.15, bluff: 0.03, sticky: 0.12, note: '什麼都跟，很少棄牌，也很少加注' },
  maniac: { zh: '瘋子', loose: 2.3, aggr: 0.9, bluff: 0.35, sticky: 0.05, note: '一直加注，常常是詐唬' },
};
/* 各位置建議開牌的範圍（前百分之幾），以緊凶為準 */
const OPEN_PCT = { early: 0.15, middle: 0.2, late: 0.33, sb: 0.3, bb: 0.3 };
function openThr(posCode, loose, n) {
  // 人少的桌子每個位置都放寬一點
  const widen = n <= 3 ? 1.6 : n <= 4 ? 1.3 : n <= 6 ? 1.0 : 0.9;
  return Math.min(0.9, OPEN_PCT[posClass(posCode)] * loose * widen);
}

/* ===== 公牌上每個組合有多強（0–1，1 最強），聽牌另外加分 ===== */
const BOARD_STR = new Map();
function boardStrength(board) {
  const key = board.join(',');
  let s = BOARD_STR.get(key);
  if (s) return s;
  if (BOARD_STR.size > 64) BOARD_STR.clear();
  s = new Float32Array(NCOMBO);
  const dead = new Uint8Array(52);
  for (const c of board) dead[c] = 1;
  const B = boardState(board);
  const ks = [], vs = [];
  for (let k = 0; k < NCOMBO; k++) { const a = COMBO_A[k], b = COMBO_B[k]; if (dead[a] || dead[b]) continue; ks.push(k); vs.push(evalAdd2(B, a, b)); }
  const ord = ks.map((k, i) => i).sort((x, y) => vs[x] - vs[y]);
  // 同樣大的取平均名次
  let i = 0;
  while (i < ord.length) {
    let j = i;
    while (j + 1 < ord.length && vs[ord[j + 1]] === vs[ord[i]]) j++;
    const pr = ((i + j) / 2 + 0.5) / ord.length;
    for (let q = i; q <= j; q++) s[ks[ord[q]]] = pr;
    i = j + 1;
  }
  if (board.length < 5) {
    const suitCnt = [0, 0, 0, 0];
    let bm = 0;
    for (const c of board) { suitCnt[c & 3]++; bm |= 1 << (c >> 2); }
    const bst = STRAIGHT_TOP[bm];
    for (const k of ks) {
      const a = COMBO_A[k], b = COMBO_B[k];
      const sc = suitCnt.slice(); sc[a & 3]++; sc[b & 3]++;
      const fd = Math.max(sc[0], sc[1], sc[2], sc[3]) === 4 && (sc[a & 3] === 4 || sc[b & 3] === 4);
      const m = bm | (1 << (a >> 2)) | (1 << (b >> 2));
      let outs = 0;
      if (STRAIGHT_TOP[m] < 0) for (let r = 0; r < 13; r++) if (!(m & (1 << r)) && STRAIGHT_TOP[m | (1 << r)] >= 0 && STRAIGHT_TOP[bm | (1 << r)] < 0) outs++;
      const oesd = outs >= 2, gut = outs === 1;
      let d = 0;
      if (fd && (oesd || gut)) d = 0.8; else if (fd) d = 0.64; else if (oesd) d = 0.58; else if (gut) d = 0.42;
      if (bst >= 0) d *= 0.6;
      if (d > s[k]) s[k] = d;
    }
  }
  BOARD_STR.set(key, s);
  return s;
}

/* ===== 照動作估範圍 =====
   ctx：這個人在那個時間點面對什麼（翻牌前前面有幾次加注、要跟多少、公牌）。回傳 1326 格的權重（還沒扣掉撞牌） */
function preflopActKind(ev, H) {
  const ag = ev.t === 'r' || ev.t === 'b' || (ev.t === 'a' && ev.to > ev.curBefore);
  if (ag) return ev.curBefore > H.bb ? 'reraise' : 'open';
  if (ev.t === 'c' || ev.t === 'a') return ev.curBefore > H.bb ? 'callRaise' : 'limp';
  if (ev.t === 'x') return 'check';
  return 'fold';
}
function rangeWeights(H, seat, styleKey, upto) {
  const st = STYLES[styleKey] || STYLES.tag;
  const w = new Float32Array(NCOMBO).fill(1);
  const log = upto === undefined ? H.log : H.log.slice(0, upto);
  const p = H.players[seat];
  let board = [], street = 0, raises = 0, opens = 0;
  for (const ev of log) {
    if (ev.k === 'street') { board = H.board.slice(0, ev.street === 1 ? 3 : ev.street === 2 ? 4 : 5); street = ev.street; continue; }
    if (ev.k !== 'act') continue;
    if (street === 0) {
      const kind = preflopActKind(ev, H);
      if (ev.seat === seat) {
        const thrO = openThr(p.pos, st.loose, H.n) * (st.aggr < 0.3 ? 0.35 : 1);   // 很被動的人只用最好的一部分加注
        for (let k = 0; k < NCOMBO; k++) {
          const x = PRE_PCT[CLASS_OF[k]];
          let f = 1;
          if (kind === 'open') f = x < thrO ? 1 : x < thrO * 1.5 ? 0.3 : 0.04;
          else if (kind === 'reraise') { const t3 = (raises >= 2 ? 0.03 : 0.06) * Math.sqrt(st.loose) * (0.6 + st.aggr); f = x < t3 ? 1 : x < t3 * 2 ? 0.3 : 0.03; }
          else if (kind === 'callRaise') { const tc = Math.min(0.85, 0.28 * st.loose); f = x < 0.03 ? 0.4 : x < tc ? 1 : x < tc * 1.4 ? 0.35 : 0.06; }
          else if (kind === 'limp') f = x < 0.06 ? 0.3 : x < Math.min(0.9, 0.55 * st.loose) ? 1 : 0.35;
          else if (kind === 'check') f = x < 0.06 ? 0.4 : 1;
          w[k] *= f;
        }
      }
      if (kind === 'open' || kind === 'reraise') { raises++; opens++; }
    } else if (ev.seat === seat && ev.t !== 'f') {
      const S = boardStrength(board);
      const ag = ev.t === 'b' || ev.t === 'r' || (ev.t === 'a' && ev.to > ev.curBefore);
      const base = 0.12 + st.bluff * 0.6;
      for (let k = 0; k < NCOMBO; k++) {
        const s = S[k];
        let f;
        if (ag) f = base + (1 - base) * s * s;
        else if (ev.t === 'c' || ev.t === 'a') f = 0.15 + st.sticky * 2 + 0.85 * Math.min(1, s / 0.6);
        else f = 1 - 0.6 * s * s * s * s;                      // 過牌：很強的牌比較少過牌
        w[k] *= f;
      }
    }
  }
  return w;
}

/* ===== 對「每個對手各自的範圍」的勝率（蒙地卡羅）=====
   oppW：每個對手一個 1326 格權重；回傳 { eq, win, tie, n } */
function mcVsRanges(hero, board, oppW, iters, rng) {
  const dead = new Uint8Array(52);
  for (const c of hero) dead[c] = 1;
  for (const c of board) dead[c] = 1;
  const cdfs = oppW.map((w) => {
    const cdf = new Float64Array(NCOMBO);
    let s = 0;
    for (let k = 0; k < NCOMBO; k++) { if (!dead[COMBO_A[k]] && !dead[COMBO_B[k]]) s += w[k]; cdf[k] = s; }
    if (s <= 0) { s = 0; for (let k = 0; k < NCOMBO; k++) { if (!dead[COMBO_A[k]] && !dead[COMBO_B[k]]) s += 1; cdf[k] = s; } }
    return cdf;
  });
  const used = new Uint8Array(52);
  const B0 = boardState(board), B = new Int32Array(8);
  const nb = 5 - board.length;
  const deck = deckWithout(hero.concat(board));
  const pick = new Int16Array(oppW.length), ov = new Int32Array(oppW.length);
  let win = 0, tie = 0, n = 0;
  for (let it = 0; it < iters; it++) {
    used.fill(0);
    let ok = true;
    for (let o = 0; o < oppW.length; o++) {
      const cdf = cdfs[o], tot = cdf[NCOMBO - 1];
      let k = -1;
      for (let tr = 0; tr < 30; tr++) {
        const u = rng() * tot;
        let lo = 0, hi = NCOMBO - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] > u) hi = mid; else lo = mid + 1; }
        if (!used[COMBO_A[lo]] && !used[COMBO_B[lo]] && !dead[COMBO_A[lo]] && !dead[COMBO_B[lo]]) { k = lo; break; }
      }
      if (k < 0) { ok = false; break; }
      pick[o] = k; used[COMBO_A[k]] = 1; used[COMBO_B[k]] = 1;
    }
    if (!ok) continue;
    B.set(B0);
    let need = nb;
    while (need > 0) {
      const c = deck[(rng() * deck.length) | 0];
      if (used[c]) continue;
      used[c] = 1; boardAdd(B, c); need--;
    }
    const hv = evalAdd2(B, hero[0], hero[1]);
    let best = -1, nEq = 0;
    for (let o = 0; o < oppW.length; o++) { const v = evalAdd2(B, COMBO_A[pick[o]], COMBO_B[pick[o]]); ov[o] = v; if (v > best) { best = v; nEq = 1; } else if (v === best) nEq++; }
    if (hv > best) win++;
    else if (hv === best) tie += 1 / (nEq + 1);
    n++;
  }
  return n ? { eq: (win + tie) / n, win: win / n, tie: tie / n, n } : { eq: 0, win: 0, tie: 0, n: 0 };
}
/* 對隨機手牌（每個對手權重都是 1） */
function mcVsRandom(hero, board, nOpp, iters, rng) {
  const ones = new Float32Array(NCOMBO).fill(1);
  const w = [];
  for (let i = 0; i < nOpp; i++) w.push(ones);
  return mcVsRanges(hero, board, w, iters, rng);
}
/* 一個範圍大約是「前百分之幾」的牌（給教練講話用） */
function rangeTopPct(w) {
  let s = 0;
  for (let k = 0; k < NCOMBO; k++) s += w[k];
  return s / NCOMBO;
}
