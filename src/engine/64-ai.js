/* ===== 64-ai：電腦對手 =====
   只看自己的兩張牌和公開資訊（公牌、底池、每個人做過的動作）。
   翻牌前照起手牌排名和位置；翻牌後照「對其他人可能範圍的勝率」對比底池賠率，再依風格決定下注、詐唬、跟注。
   強度（level）：1 新手（判斷誤差大、亂跟）、2 普通、3 高手（誤差小、下注大小較好） */
const AI_LEVEL = {
  1: { noise: 0.09, iters: 500, mistake: 0.10 },
  2: { noise: 0.05, iters: 900, mistake: 0.04 },
  3: { noise: 0.025, iters: 1500, mistake: 0.01 },
  4: { noise: 0.02, iters: 1500, mistake: 0.0 },            // GTO 桌：求解器用不到的地方（翻牌前、翻牌、多人）照高手打
};
function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/* 下注（加注）到多少：底池的 frac 倍（加注時用「跟完之後的底池」），取整數；剩下的很少就乾脆全下 */
function sizeTo(H, L, frac) {
  const pot = potTotal(H);
  let to = L.isBet ? Math.round(pot * frac) : H.curBet + Math.round((pot + L.toCall) * frac);
  to = Math.max(L.minTo, Math.min(L.maxTo, to));
  if (L.maxTo - to < (pot + to) * 0.25) to = L.maxTo;
  return to;
}
function preflopRaises(H) { let r = 0; for (const ev of H.log) if (ev.k === 'act' && ev.street === 0 && (ev.t === 'r' || ev.t === 'b' || (ev.t === 'a' && ev.to > ev.curBefore))) r++; return r; }
function preflopLimpers(H) { let r = 0; for (const ev of H.log) if (ev.k === 'act' && ev.street === 0 && ev.t === 'c' && ev.curBefore === H.bb) r++; return r; }

function aiDecide(H, rng, level) {
  const L = legalActions(H), p = H.players[L.seat];
  const st = STYLES[p.style] || STYLES.tag, lv = AI_LEVEL[level || 2];
  const g = classIndex(p.cards[0] >> 2, p.cards[1] >> 2, (p.cards[0] & 3) === (p.cards[1] & 3));
  if (H.street === 0) {                                       // 短碼：推或棄（照風格鬆緊放寬或收緊）
    const sh = shortSpot(H, L.seat);
    if (sh) {
      let go;
      if (sh.kind === 'push') go = PRE_PCT[g] + gauss(rng) * lv.noise * 0.3 < Math.min(0.95, sh.pct * Math.sqrt(st.loose));
      else if (sh.kind === 'reshove') go = sh.ev / Math.max(1, sh.pot) + gauss(rng) * lv.noise * 0.6 + (st.loose - 1) * 0.15 > 0;
      else go = sh.eq + gauss(rng) * lv.noise * 0.06 + (st.loose - 1) * 0.04 + (st.sticky || 0) >= sh.need;
      if (go) return sh.kind === 'push' || (L.canRaise && L.maxTo > H.curBet && p.stack + p.bet > H.curBet) ? { t: 'r', to: L.maxTo } : { t: 'c' };
      return { t: L.canCheck ? 'x' : 'f' };
    }
  }
  if (H.street === 0 && p.style === 'gto') {                // GTO 電腦：翻牌前照圖表的比例
    const ch = chartSpot(H, L.seat);
    if (ch) return chartAct(H, L, ch, rng);
  }
  if (H.street === 0) {
    let pct = PRE_PCT[g] + gauss(rng) * lv.noise * 0.4;
    const raises = preflopRaises(H), limpers = preflopLimpers(H);
    const pc = posClass(p.pos);
    if (raises === 0) {
      const thr = openThr(p.pos, st.loose, H.n);
      const raiseThr = thr * (st.aggr < 0.3 ? 0.35 : 1);
      if (pct < raiseThr && L.canRaise) return { t: 'r', to: Math.min(L.maxTo, Math.round(H.bb * (2.5 + limpers) + (pc === 'sb' ? H.bb * 0.5 : 0))) };
      if (L.canCheck) return { t: 'x' };
      if (pct < thr) return { t: 'c' };                                   // 跟注站：跛入
      if (pc === 'sb' && pct < Math.min(0.9, 0.5 * st.loose) && limpers > 0) return { t: 'c' };
      return { t: 'f' };
    }
    // 前面有人加注
    const pot = potTotal(H), price = L.callAmt / (pot + L.callAmt);
    const big = L.callAmt > p.stack * 0.4;                                // 要跟的很大（全下或接近）
    if (raises === 1 && !big) {
      const t3 = 0.045 * Math.sqrt(st.loose) * (0.6 + st.aggr);
      if (pct < t3 && L.canRaise) return { t: 'r', to: Math.round(H.curBet * (p.pos === 'BB' || p.pos === 'SB' ? 3.5 : 3)) };
      if (L.canRaise && pct > 0.3 && pct < 0.55 && rng() < st.bluff * 0.25) return { t: 'r', to: Math.round(H.curBet * 3) };
      let tc = Math.min(0.85, (pc === 'bb' ? 0.34 : 0.17) * st.loose * (1 + st.sticky * 3));
      tc *= Math.max(0.5, Math.min(1.4, 0.12 / Math.max(0.05, price)));      // 越便宜跟越寬
      if (pct < tc) return { t: 'c' };
      return L.canCheck ? { t: 'x' } : { t: 'f' };
    }
    // 面對再加注或很大的注
    const t4 = 0.025 * Math.sqrt(st.loose) * (0.6 + st.aggr);
    if (pct < t4 && L.canRaise) return { t: 'r', to: big ? L.maxTo : Math.round(H.curBet * 2.4) };
    const tcall = (big ? 0.05 : 0.08) * st.loose * (1 + st.sticky * 3);
    if (pct < tcall) return { t: 'c' };
    return L.canCheck ? { t: 'x' } : { t: 'f' };
  }
  // ===== 翻牌後 =====
  const opps = H.players.filter((q) => q !== p && !q.folded);
  const ws = opps.map((q) => rangeWeights(H, q.seat, 'tag'));          // 不管對手實際是誰，都當成一般的緊凶玩家來估
  let eq = mcVsRanges(p.cards, H.board, ws, lv.iters, rng).eq + gauss(rng) * lv.noise;
  const S = boardStrength(H.board);
  const mine = S[comboOf(p.cards[0], p.cards[1])];
  const draw = H.street < 3 && mine >= 0.42 && evalCards(p.cards.concat(H.board)) >>> 26 <= 1;
  const pot = potTotal(H);
  const late = p.seat === lastToActSeat(H);
  if (rng() < lv.mistake) eq += (rng() - 0.5) * 0.4;                     // 偶爾看錯
  if (L.toCall === 0) {
    const valueThr = 0.56 + 0.05 * (opps.length - 1) + (H.street === 3 ? 0.04 : 0);
    if (eq > valueThr && L.canRaise && rng() < 0.5 + 0.45 * st.aggr) return { t: 'r', to: sizeTo(H, L, eq > 0.8 ? 0.75 : 0.6) };
    if (draw && L.canRaise && rng() < st.aggr * 0.55) return { t: 'r', to: sizeTo(H, L, 0.55) };
    if (eq < 0.35 && opps.length <= 2 && L.canRaise && rng() < st.bluff * (late ? 1.6 : 1)) return { t: 'r', to: sizeTo(H, L, 0.5) };
    return { t: 'x' };
  }
  const need = L.callAmt / (pot + L.callAmt);
  const implied = draw && H.street === 1 && p.stack > pot ? 0.05 : draw && H.street === 2 && p.stack > pot ? 0.025 : 0;
  if (eq > 0.78 - st.aggr * 0.08 && L.canRaise && rng() < 0.35 + st.aggr * 0.5) return { t: 'r', to: sizeTo(H, L, 0.8) };
  if (eq + implied + st.sticky >= need) return { t: 'c' };
  if (opps.length === 1 && L.canRaise && rng() < st.bluff * 0.12) return { t: 'r', to: sizeTo(H, L, 0.8) };
  return { t: 'f' };
}
/* 這條街最後說話的人（有位置的人） */
function lastToActSeat(H) {
  let last = -1;
  for (let k = 1; k <= H.n; k++) { const i = (H.button + k) % H.n, q = H.players[i]; if (!q.folded && !q.allin) last = i; }
  return last;
}

/* 桌上的電腦對手：名字、風格（依強度挑風格的比例） */
const AI_NAMES = ['阿忠', '小美', '老王', '阿明', '大頭', '阿芬', '小陳', '阿德', '美玲', '志明', '春嬌', '阿伯'];
function makeOpponents(n, level, rng) {
  const pool = level === 1 ? ['station', 'station', 'rock', 'maniac', 'tag', 'lag']
    : level === 3 ? ['tag', 'tag', 'lag', 'lag', 'tag', 'rock'] : level === 4 ? ['gto'] : ['tag', 'lag', 'rock', 'station', 'maniac', 'tag'];
  const names = AI_NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = names[i]; names[i] = names[j]; names[j] = t; }
  const out = [];
  for (let i = 0; i < n - 1; i++) out.push({ name: names[i], style: pool[(i + ((rng() * pool.length) | 0)) % pool.length] });
  return out;
}
