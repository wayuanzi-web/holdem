/* ===== 69-champ：冠軍教練（10/25）——看人打 =====
   每個能按的動作都估「成功率」（他棄牌＋被跟時你贏）和「平均賺賠」，選平均賺最多的。
   對手會怎麼回應：照他的風格（電腦實際的出牌規則）算他棄牌、跟注、加注的比例；
   被跟的話：你對他「會跟的那些牌」的勝率，再乘上「實現率」（之後還有下注，勝率拿不滿）。
   穩健教練（68-coach）照書打、偏緊；冠軍教練對每個人下不同的藥。短碼推或棄照穩健教練（那已經是標準解）。 */
const CHAMP = {
  rIP: 0.95, rOOP: 0.82, rPreIP: 0.9, rPreOOP: 0.75, rMulti: 0.85,   // 實現率：有位置、沒位置、多人
  runs: 14, K: 6, iters: 700, margin: 0.25, marginPre: 0.3,        // margin：翻牌後主動的動作要比被動的多賺這麼多個大盲才選（少冒險）
  styleRanges: true, keepChart: 0.3,                                                   // 估對手範圍時照他的風格（false：一律當緊凶）
};
let CHAMP_CLS = null;                                                  // 每一種起手牌的組合編號
function champCls() {
  if (CHAMP_CLS) return CHAMP_CLS;
  CHAMP_CLS = Array.from({ length: 169 }, () => []);
  for (let k = 0; k < NCOMBO; k++) CHAMP_CLS[CLASS_OF[k]].push(k);
  return CHAMP_CLS;
}
function champPhi(x) {                                                 // 標準常態分布累積機率
  const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - q : q;
}
function champClone(H) { return JSON.parse(JSON.stringify(H)); }
/* A 的每一手（照組合編號）對 B 範圍的勝率；翻牌抽 runs 種轉牌＋河牌、轉牌抽 runs 張河牌（全部算太慢），河牌精確。沒有可比的：-1 */
function champEqPer(board, wA, wB, runs, rng) {
  const eq = new Float32Array(NCOMBO).fill(-1);
  if (board.length >= 5) { const r = rangeVsRange(board, wA, wB); r.hands.forEach((k, i) => { if (r.comp[i] > 0) eq[k] = r.eq[i]; }); return eq; }
  const sum = new Float64Array(NCOMBO), cnt = new Uint16Array(NCOMBO), dead = new Uint8Array(52);
  for (const c of board) dead[c] = 1;
  const deck = [];
  for (let c = 0; c < 52; c++) if (!dead[c]) deck.push(c);
  for (let t = 0; t < runs; t++) {
    const i = (rng() * deck.length) | 0;
    let j = (rng() * (deck.length - 1)) | 0;
    if (j >= i) j++;
    const r = rangeVsRange(board.length === 4 ? board.concat([deck[i]]) : board.concat([deck[i], deck[j]]), wA, wB);
    r.hands.forEach((k, h) => { if (r.comp[h] > 0) { sum[k] += r.eq[h]; cnt[k]++; } });
  }
  for (let k = 0; k < NCOMBO; k++) if (cnt[k]) eq[k] = sum[k] / cnt[k];
  return eq;
}
function champOne(cards) { const w = new Float32Array(NCOMBO); w[comboOf(cards[0], cards[1])] = 1; return w; }
function champBB(H, x) { return x / H.bb; }
/* 這個人翻牌後會不會被嚇跑：照 aiDecide「面對下注」那一段，每個組合算棄、跟、加注的機率
   eqBot：他自己估的勝率（他把你當成一般緊凶玩家，看你剛才下注就把你的範圍往強的移） */
function champBotPost(H, o, X, heroBet, eqBot, level, nLive) {
  const p = H.players[o], st = STYLES[p.style] || STYLES.tag, lv = AI_LEVEL[level || 2] || AI_LEVEL[2];
  const potAfter = potTotal(H) + (X - heroBet), callAmt = Math.min(X - p.bet, p.stack);
  const need = callAmt / (potAfter + callAmt);
  const S = boardStrength(H.board), canRaise = p.stack > callAmt;
  const sigma = Math.sqrt(lv.noise * lv.noise + lv.mistake * 0.0133);
  const thrR = 0.78 - st.aggr * 0.08, pR = 0.35 + st.aggr * 0.5, bl = nLive === 2 && canRaise ? st.bluff * 0.12 : 0;
  const f = new Float32Array(NCOMBO), c = new Float32Array(NCOMBO), r = new Float32Array(NCOMBO);
  const m = Math.max(1, nLive - 1);
  for (let k = 0; k < NCOMBO; k++) {
    let e = eqBot[k];
    if (e < 0) continue;
    if (m > 1) e = Math.pow(e, m);
    let implied = 0;
    if (H.street < 3 && S[k] >= 0.42 && evalCards([COMBO_A[k], COMBO_B[k]].concat(H.board)) >>> 26 <= 1 && p.stack > potAfter) implied = H.street === 1 ? 0.05 : 0.025;
    const pr = canRaise ? champPhi((e - thrR) / sigma) * pR : 0;
    const ok = champPhi((e + implied + (st.sticky || 0) - need) / sigma);
    r[k] = pr + (1 - ok) * bl;
    f[k] = (1 - ok) * (1 - bl);
    c[k] = Math.max(0, 1 - r[k] - f[k]);
  }
  return { f, c, r, need, callAmt };
}
/* 你過牌以後他會不會下注（照 aiDecide「沒人下注」那一段）：每個組合下注的機率 */
function champBotBet(H, o, eqBot, level, nLive, late) {
  const p = H.players[o], st = STYLES[p.style] || STYLES.tag, lv = AI_LEVEL[level || 2] || AI_LEVEL[2];
  const sigma = Math.sqrt(lv.noise * lv.noise + lv.mistake * 0.0133), m = Math.max(1, nLive - 1);
  const vt = 0.56 + 0.05 * (m - 1) + (H.street === 3 ? 0.04 : 0), pv = 0.5 + 0.45 * st.aggr, pd = st.aggr * 0.55, pb = m <= 2 ? st.bluff * (late ? 1.6 : 1) : 0;
  const S = boardStrength(H.board), out = new Float32Array(NCOMBO);
  for (let k = 0; k < NCOMBO; k++) {
    let e = eqBot[k];
    if (e < 0) continue;
    if (m > 1) e = Math.pow(e, m);
    const v = champPhi((e - vt) / sigma);
    const draw = H.street < 3 && S[k] >= 0.42 && evalCards([COMBO_A[k], COMBO_B[k]].concat(H.board)) >>> 26 <= 1 ? pd : 0;
    out[k] = v * pv + (1 - v) * (draw + (1 - draw) * champPhi((0.35 - e) / sigma) * pb);
  }
  return out;
}
/* 實現率：之後還有下注，勝率拿不滿；牌越強拿得越多（強牌會被付錢、弱牌常被逼棄） */
function champReal(H, ip, eq, multi) {
  if (H.street === 3) return 1;
  const b = (ip ? CHAMP.rIP : CHAMP.rOOP) * (multi ? CHAMP.rMulti : 1);
  return Math.max(0.55, Math.min(1.08, b * (0.8 + 0.4 * eq)));
}
/* 你下注（或加注）時，對手眼中你的範圍：一般緊凶玩家的範圍，再照「下注」往強的牌移（跟 rangeWeights 一樣的公式） */
function champHeroAggRange(H, seat) {
  const w = rangeWeights(H, seat, 'tag'), S = boardStrength(H.board), base = 0.12 + STYLES.tag.bluff * 0.6;
  for (let k = 0; k < NCOMBO; k++) if (w[k] > 0) w[k] *= base + (1 - base) * S[k] * S[k];
  return w;
}
/* 翻牌前：你做了動作以後，後面每個人會怎麼回應（直接用電腦的出牌規則，每種起手牌試 K 次；假設前面的人都棄牌） */
function champPreResp(H, heroSeat, act, level) {
  const H1 = champClone(H);
  applyAction(H1, act);
  const out = [], cls = champCls(), hero = H.players[heroSeat].cards;
  const rng = makeRng(H.no * 131 + H.log.length * 17 + (act.to || 0));
  let guard = 0;
  while (H1.phase === 'bet' && H1.toAct >= 0 && H1.toAct !== heroSeat && guard++ < 12) {
    const j = H1.toAct, pj = H1.players[j], wPrior = rangeWeights(H, j, CHAMP.styleRanges ? pj.style : 'tag');
    const res = { seat: j, name: pj.name, style: pj.style, bet: pj.bet, f: 0, c: 0, r: 0, raiseTo: 0, wCall: new Float32Array(NCOMBO), wRaise: new Float32Array(NCOMBO) };
    const save = pj.cards;
    let W = 0, rtS = 0;
    for (let g = 0; g < 169; g++) {
      let wg = 0, rep = -1;
      for (const k of cls[g]) { if (hero.includes(COMBO_A[k]) || hero.includes(COMBO_B[k]) || !(wPrior[k] > 0)) continue; wg += wPrior[k]; if (rep < 0) rep = k; }
      if (!wg) continue;
      pj.cards = [COMBO_A[rep], COMBO_B[rep]];
      let f = 0, c = 0, r = 0;
      for (let s = 0; s < CHAMP.K; s++) {
        const a = aiDecide(H1, rng, level);
        if (a.t === 'r' && a.to > H1.curBet) { r++; rtS += a.to * wg; } else if (a.t === 'f') f++; else c++;
      }
      res.f += wg * f / CHAMP.K; res.c += wg * c / CHAMP.K; res.r += wg * r / CHAMP.K;
      for (const k of cls[g]) if (wPrior[k] > 0 && !hero.includes(COMBO_A[k]) && !hero.includes(COMBO_B[k])) { res.wCall[k] = wPrior[k] * c / CHAMP.K; res.wRaise[k] = wPrior[k] * r / CHAMP.K; }
      W += wg;
    }
    pj.cards = save;
    if (W > 0) { res.f /= W; res.c /= W; res.r /= W; }
    res.raiseTo = res.r > 0 ? Math.round(rtS / (res.r * W * CHAMP.K)) : 0;
    out.push(res);
    applyAction(H1, { t: 'f' });
  }
  return out;
}
/* 翻牌後你和他誰先說話：你比他晚說話＝有位置 */
function champIP(H, heroSeat, seats) { const me = postflopOrder(H, heroSeat); return seats.every((s) => postflopOrder(H, s) < me); }

/* ===== 每個選項的成功率與平均賺賠（單位：籌碼；相對於現在棄牌） ===== */
function champOptionsPre(H, level, I, rng) {
  const L = legalActions(H), seat = L.seat, p = H.players[seat], pot0 = potTotal(H), hb = p.bet;
  const raises = preflopRaises(H), limpers = preflopLimpers(H), pc = posClass(p.pos);
  const opts = [];
  const inPot = H.players.filter((q) => q.seat !== seat && !q.folded && H.log.some((e) => e.k === 'act' && e.street === 0 && e.seat === q.seat && e.t !== 'f'));
  // 棄牌／過牌
  if (L.canCheck) {
    const ws = inPot.map((q) => rangeWeights(H, q.seat, CHAMP.styleRanges ? q.style : 'tag'));
    const eq = ws.length ? mcVsRanges(p.cards, [], ws, CHAMP.iters, rng).eq : 0.5;
    const R = ws.length > 1 ? CHAMP.rMulti * CHAMP.rPreOOP : CHAMP.rPreOOP;
    opts.push({ act: { t: 'x' }, label: '過牌', ev: eq * R * pot0, win: eq, eq, calc: { k: 'check', eq, R, pot: pot0, pre: true } });
  } else opts.push({ act: { t: 'f' }, label: '棄牌', ev: 0, win: 0, calc: { k: 'fold' } });
  // 跟注（前面有人加注）
  if (!L.canCheck && raises > 0) {
    const ws = inPot.map((q) => rangeWeights(H, q.seat, CHAMP.styleRanges ? q.style : 'tag'));
    const eq = mcVsRanges(p.cards, [], ws, CHAMP.iters, rng).eq;
    const behind = champPreResp(H, seat, { t: 'c' }, level);
    const sq = 1 - behind.reduce((a, b) => a * (1 - b.r), 1);       // 後面有人再加注（擠壓），你多半要棄
    const ip = champIP(H, seat, inPot.map((q) => q.seat));
    const R = (ip ? CHAMP.rPreIP : CHAMP.rPreOOP) * (ws.length > 1 ? CHAMP.rMulti : 1);
    const potC = pot0 + L.callAmt;
    opts.push({ act: { t: 'c' }, label: '跟注 ' + L.callAmt, ev: (1 - sq) * eq * R * potC - L.callAmt, win: (1 - sq) * eq, eq, sq, calc: { k: 'call', eq, R, pot: potC, cost: L.callAmt, sq, ip, pre: true } });
  }
  // 跛入（沒人加注時只跟大盲）：後面有人加注你就棄
  if (!L.canCheck && raises === 0) {
    const resp = champPreResp(H, seat, { t: 'c' }, level);
    const pr = 1 - resp.reduce((a, b) => a * (1 - b.r), 1);
    const ws = inPot.map((q) => rangeWeights(H, q.seat, CHAMP.styleRanges ? q.style : 'tag')).concat(resp.filter((x) => x.c > 0.02).map((x) => x.wCall));
    const eq = ws.length ? mcVsRanges(p.cards, [], ws, CHAMP.iters, rng).eq : 0.5;
    const potF = pot0 + L.callAmt + resp.reduce((s, x) => s + x.c * (H.curBet - x.bet), 0);
    const Rl = CHAMP.rPreOOP * (ws.length > 1 ? CHAMP.rMulti : 1);
    opts.push({ act: { t: 'c' }, label: '跟注 ' + L.callAmt + '（跛入）', ev: (1 - pr) * eq * Rl * potF - L.callAmt, win: (1 - pr) * eq, eq, sq: pr, calc: { k: 'call', eq, R: Rl, pot: potF, cost: L.callAmt, sq: pr, limp: true, pre: true } });
  }
  // 加注（開局、再加注）
  if (L.canRaise) {
    let to;
    if (raises === 0) to = Math.round(H.bb * (2.5 + limpers) + (pc === 'sb' ? H.bb * 0.5 : 0));
    else if (raises === 1) to = Math.round(H.curBet * (pc === 'bb' || pc === 'sb' ? 3.5 : 3));
    else to = Math.round(H.curBet * 2.4);
    to = Math.max(L.minTo, Math.min(L.maxTo, to));
    if (L.maxTo - to < (pot0 + to) * 0.3) to = L.maxTo;
    const resp = champPreResp(H, seat, { t: 'r', to }, level);
    const a = to - hb;
    let reach = 1, ev = 0, win = 0, pC = 0, pR = 0, evC = 0, evR = 0, eqCs = 0, potCs = 0;
    for (const x of resp) {
      if (x.c > 0.005) {
        const eqC = mcVsRanges(p.cards, [], [x.wCall], CHAMP.iters, rng).eq, ip = champIP(H, seat, [x.seat]);
        const potC = pot0 + a + Math.min(to, H.players[x.seat].bet + H.players[x.seat].stack) - x.bet;
        const e1 = reach * x.c * (eqC * (ip ? CHAMP.rPreIP : CHAMP.rPreOOP) * potC - a);
        ev += e1; win += reach * x.c * eqC; evC += e1; pC += reach * x.c; eqCs += reach * x.c * eqC; potCs += reach * x.c * potC;
        x.eqC = eqC;
      }
      if (x.r > 0.005) {
        const eqR = mcVsRanges(p.cards, [], [x.wRaise], CHAMP.iters, rng).eq, Y = Math.min(x.raiseTo || to * 3, p.bet + p.stack);
        const potR = pot0 + (Y - hb) + (Y - x.bet), cont = eqR * CHAMP.rPreIP * potR - (Y - hb);
        ev += reach * x.r * Math.max(-a, cont); win += reach * x.r * (cont > -a ? eqR : 0); evR += reach * x.r * Math.max(-a, cont); pR += reach * x.r;
        x.eqR = eqR;
      }
      reach *= x.f;
    }
    ev += reach * pot0; win += reach;
    opts.push({ act: { t: 'r', to }, label: (L.isBet ? '下注 ' : to >= L.maxTo ? '全下 ' : '加注到 ') + to, ev, win, foldAll: reach, resp,
      calc: { k: 'raise', pot0, cost: a, F: reach, pC, pR, eqC: pC ? eqCs / pC : 0, potC: pC ? potCs / pC : 0, evF: reach * pot0, evC, evR, pre: true } });
  }
  return opts;
}
function champOptionsPost(H, level, I, rng) {
  const L = legalActions(H), seat = L.seat, p = H.players[seat], pot0 = potTotal(H), hb = p.bet;
  const opps = H.players.filter((q) => q.seat !== seat && !q.folded);
  const live = opps.filter((q) => !q.allin);
  const nLive = opps.length + 1;
  const ws = opps.map((q) => rangeWeights(H, q.seat, CHAMP.styleRanges ? q.style : 'tag'));
  const heroW = champOne(p.cards);
  const heq = ws.map((w) => { const e = champEqPer(H.board, w, heroW, CHAMP.runs, rng); for (let k = 0; k < NCOMBO; k++) if (e[k] >= 0) e[k] = 1 - e[k]; return e; });
  const avgEq = (w, e, x) => { let s = 0, t = 0; for (let k = 0; k < NCOMBO; k++) if (e[k] >= 0 && w[k] > 0) { const ww = w[k] * (x ? x[k] : 1); s += ww * e[k]; t += ww; } return t > 0 ? s / t : 0; };
  const est = opps.length === 1 ? avgEq(ws[0], heq[0]) : mcVsRanges(p.cards, H.board, ws, CHAMP.iters, rng).eq;
  const ip = champIP(H, seat, opps.map((q) => q.seat)), river = H.street === 3;
  const R = river ? 1 : (ip ? CHAMP.rIP : CHAMP.rOOP) * (opps.length > 1 ? CHAMP.rMulti : 1);
  const opts = [];
  if (L.canCheck) {
    const nxt = opps.filter((q) => !q.allin && postflopOrder(H, q.seat) > postflopOrder(H, seat));   // 你過牌以後還會說話的人
    if (opps.length === 1 && nxt.length === 1) {                      // 單挑、你先說話：他可能下注，你再決定跟或棄
      const o = opps[0], w = ws[0], e = heq[0];
      const wChk = rangeWeights(H, seat, 'tag'), S = boardStrength(H.board);
      for (let k = 0; k < NCOMBO; k++) if (wChk[k] > 0) wChk[k] *= 1 - 0.6 * S[k] * S[k] * S[k] * S[k];
      const eqB = champEqPer(H.board, w, wChk, CHAMP.runs, rng), pb = champBotBet(H, o.seat, eqB, level, nLive, true);
      let W = 0, PB = 0;
      for (let k = 0; k < NCOMBO; k++) if (w[k] > 0 && e[k] >= 0 && eqB[k] >= 0) { W += w[k]; PB += w[k] * pb[k]; }
      PB = W ? PB / W : 0;
      const notB = new Float32Array(NCOMBO); for (let k = 0; k < NCOMBO; k++) notB[k] = 1 - pb[k];
      const eqVB = avgEq(w, e, pb), eqVK = avgEq(w, e, notB), b = Math.min(o.stack, Math.max(H.bb, Math.round(pot0 * 0.65)));
      const callEV = eqVB * champReal(H, false, eqVB, false) * (pot0 + 2 * b) - b;
      const ev = PB * Math.max(0, callEV) + (1 - PB) * eqVK * champReal(H, true, eqVK, false) * pot0;
      opts.push({ act: { t: 'x' }, label: '過牌', ev, win: PB * (callEV > 0 ? eqVB : 0) + (1 - PB) * eqVK, eq: est, pBet: PB, callVsBet: callEV > 0,
        calc: { k: 'checkOOP', PB, eqVB, b, callEV, eqVK, Rk: champReal(H, true, eqVK, false), pot: pot0 } });
    } else opts.push({ act: { t: 'x' }, label: '過牌', ev: est * champReal(H, ip, est, opps.length > 1) * pot0, win: est, eq: est, closes: !nxt.length, nAfter: nxt.length, river, calc: { k: 'check', eq: est, R: champReal(H, ip, est, opps.length > 1), pot: pot0, closes: !nxt.length, river } });
  }
  else {
    opts.push({ act: { t: 'f' }, label: '棄牌', ev: 0, win: 0, calc: { k: 'fold' } });
    const imp = I.draws && !river && p.stack > pot0 ? (H.street === 1 ? 0.04 : 0.02) : 0;
    const Rc = L.callAmt >= p.stack ? 1 : champReal(H, ip, est, opps.length > 1);
    opts.push({ act: { t: 'c' }, label: (L.callAmt >= p.stack ? '全下跟注 ' : '跟注 ') + L.callAmt, ev: (est * Rc + imp) * (pot0 + L.callAmt) - L.callAmt, win: est, eq: est,
      calc: { k: 'call', eq: est, R: Rc, imp, pot: pot0 + L.callAmt, cost: L.callAmt, allin: L.callAmt >= p.stack, river } });
  }
  if (L.canRaise && live.length) {
    const wHero = champHeroAggRange(H, seat);
    const eqBot = ws.map((w) => champEqPer(H.board, w, wHero, CHAMP.runs, rng));
    const sizes = [];
    if (L.isBet) for (const fr of [0.33, 0.5, 0.75, 1]) sizes.push(sizeTo(H, L, fr));
    else for (const fr of [0.7, 1]) sizes.push(sizeTo(H, L, fr));
    const uniq = [...new Set(sizes)].filter((x) => x >= L.minTo && x <= L.maxTo);
    for (const X of uniq) {
      const a = X - hb;
      let ev = 0, win = 0, reachAll = 1, calcO = null;
      const detail = [];
      if (opps.length === 1) {
        const o = opps[0], w = ws[0], e = heq[0];
        if (o.allin) continue;
        const resp = champBotPost(H, o.seat, X, hb, eqBot[0], level, nLive);
        let W = 0, F = 0, C = 0, Rr = 0;
        for (let k = 0; k < NCOMBO; k++) if (w[k] > 0 && e[k] >= 0 && eqBot[0][k] >= 0) { W += w[k]; F += w[k] * resp.f[k]; C += w[k] * resp.c[k]; Rr += w[k] * resp.r[k]; }
        if (!W) continue;
        F /= W; C /= W; Rr /= W;
        const eqC = avgEq(w, e, resp.c), eqR = avgEq(w, e, resp.r);
        const callTo = Math.min(X, o.bet + o.stack), potC = pot0 + a + (callTo - o.bet);
        const H1 = champClone(H); applyAction(H1, { t: 'r', to: X });
        const Y = H1.toAct >= 0 && H1.phase === 'bet' ? sizeTo(H1, legalActions(H1), 0.8) : X;
        const potR = pot0 + (Y - hb) + (Math.min(Y, o.bet + o.stack) - o.bet), contR = eqR * (river ? 1 : CHAMP.rIP) * potR - (Y - hb);
        const Rc = champReal(H, ip, eqC, false);
        ev = F * pot0 + C * (eqC * Rc * potC - a) + Rr * Math.max(-a, contR);
        win = F + C * eqC + Rr * (contR > -a ? eqR : 0);
        reachAll = F;
        calcO = { k: 'raise', pot0, cost: a, F, pC: C, pR: Rr, eqC, R: Rc, potC, evF: F * pot0, evC: C * (eqC * Rc * potC - a), evR: Rr * Math.max(-a, contR), Y, eqR, contR, river };
        detail.push({ seat: o.seat, name: o.name, style: o.style, f: F, c: C, r: Rr, eqC });
      } else {
        const conts = [];
        let potC = pot0 + a;
        opps.forEach((o, i) => {
          if (o.allin) { conts.push(ws[i]); return; }
          const resp = champBotPost(H, o.seat, X, hb, eqBot[i], level, nLive);
          let W = 0, F = 0;
          const wc = new Float32Array(NCOMBO);
          for (let k = 0; k < NCOMBO; k++) if (ws[i][k] > 0 && eqBot[i][k] >= 0) { W += ws[i][k]; F += ws[i][k] * resp.f[k]; wc[k] = ws[i][k] * (1 - resp.f[k]); }
          F = W ? F / W : 1;
          reachAll *= F;
          potC += (1 - F) * (Math.min(X, o.bet + o.stack) - o.bet);
          conts.push(wc);
          detail.push({ seat: o.seat, name: o.name, style: o.style, f: F, c: 1 - F, r: 0 });
        });
        const eqM = mcVsRanges(p.cards, H.board, conts, CHAMP.iters, rng).eq;
        const Rm = champReal(H, ip, eqM, true);
        ev = reachAll * pot0 + (1 - reachAll) * (eqM * Rm * potC - a);
        win = reachAll + (1 - reachAll) * eqM;
        calcO = { k: 'raise', pot0, cost: a, F: reachAll, pC: 1 - reachAll, pR: 0, eqC: eqM, R: Rm, potC, evF: reachAll * pot0, evC: (1 - reachAll) * (eqM * Rm * potC - a), evR: 0, multi: true, river };
        detail.forEach((d) => { d.eqC = eqM; });
      }
      opts.push({ act: { t: 'r', to: X }, label: (X >= L.maxTo ? '全下 ' : L.isBet ? '下注 ' : '加注到 ') + X, ev, win, foldAll: reachAll, resp: detail, frac: a / pot0, calc: calcO });
    }
  }
  return { opts, est };
}
/* 讀牌：每個還在的對手，照他的風格和動作，他大概拿什麼 */
function champRead(H, seat) {
  const out = [];
  for (const q of H.players) {
    if (q.seat === seat || q.folded) continue;
    if (H.street === 0 && !H.log.some((e) => e.k === 'act' && e.street === 0 && e.seat === q.seat && e.t !== 'f' && e.t !== 'x')) continue;   // 翻牌前還沒放錢的人：沒東西可讀
    const w = rangeWeights(H, q.seat, CHAMP.styleRanges ? q.style : 'tag'), hero = H.players[seat].cards;
    const byCls = new Float64Array(169);
    let tot = 0;
    for (let k = 0; k < NCOMBO; k++) {
      if (!(w[k] > 0) || hero.includes(COMBO_A[k]) || hero.includes(COMBO_B[k]) || H.board.includes(COMBO_A[k]) || H.board.includes(COMBO_B[k])) continue;
      byCls[CLASS_OF[k]] += w[k]; tot += w[k];
    }
    const top = [...byCls.keys()].filter((g) => byCls[g] > 0).sort((a, b) => byCls[b] - byCls[a]).slice(0, 4).map((g) => ({ g, share: byCls[g] / tot }));
    const r = { seat: q.seat, name: q.name, style: q.style, pos: q.pos, top: rangeTopPct(w), combos: tot, likely: top };
    if (H.board.length >= 3) {                                           // 只要比例：不傳你的牌（傳了會每一類都算勝率，很慢），撞到你的牌先拿掉
      const w2 = Float32Array.from(w);
      for (let k = 0; k < NCOMBO; k++) if (hero.includes(COMBO_A[k]) || hero.includes(COMBO_B[k])) w2[k] = 0;
      r.cats = lensBoard(w2, H.board, null).rows.map((x) => ({ name: x.name, share: x.share }));
    }
    out.push(r);
  }
  return out;
}
/* ===== 冠軍教練的建議：跟 coachAdvice 一樣的格式，多一個 champ（選項表、讀牌、穩健教練怎麼說） ===== */
function champAdvice(H, rng, level) {
  const base = coachAdvice(H, rng);
  const L = legalActions(H), seat = L.seat, p = H.players[seat];
  const read = champRead(H, seat);
  const keep = { label: base.label, act: base.act };
  if (base.short) { base.champ = { read, options: [], base: keep, same: true, short: true }; return base; }
  if (H.players.some((q) => q.seat !== seat && !q.folded && q.style === 'gto')) {   // GTO 電腦很難剝削（模擬：硬要偷反而輸）：照穩健教練（翻牌前照圖表，單挑轉牌、河牌有 GTO 求解）
    base.champ = { read, options: [], base: keep, same: true, gto: true };
    base.reasons = base.reasons.concat(['對手是 GTO 電腦：照圖表、求解器打，沒有漏洞可以抓，冠軍教練也照書打。']);
    return base;
  }
  const I = base.info;
  let opts, est;
  if (H.street === 0) opts = champOptionsPre(H, level, I, rng);
  else { const r = champOptionsPost(H, level, I, rng); opts = r.opts; est = r.est; }
  if (!opts.length) { base.champ = { read, options: [], base: keep, same: true }; return base; }
  for (const o of opts) o.bb = champBB(H, o.ev);
  const passive = opts.filter((o) => o.act.t !== 'r'), aggr = opts.filter((o) => o.act.t === 'r');
  const bestP = passive.reduce((a, b) => (b.ev > a.ev ? b : a), passive[0]);
  const bestA = aggr.length ? aggr.reduce((a, b) => (b.ev > a.ev ? b : a), aggr[0]) : null;
  let best = bestP;
  if (bestA && (!bestP || bestA.ev > bestP.ev + (H.street ? CHAMP.margin : CHAMP.marginPre) * H.bb)) best = bestA;
  if (best.act.t === 'c' && best.ev < 0) best = opts.find((o) => o.act.t === 'f') || best;
  if (H.street === 0 && base.act.t === 'r' && best.act.t !== 'r' && bestA && bestA.ev > -CHAMP.keepChart * H.bb) best = bestA;   // 圖表會加注的牌照樣加注（冠軍只會比圖表多偷，不會少開）
  const adv = Object.assign({}, base);
  adv.act = best.act; adv.label = best.label;
  adv.eq = est !== undefined ? est : base.eq; adv.eff = adv.eq;
  adv.reasons = champReasons(H, seat, best, opts, read, base);
  adv.more = base.reasons.length ? ['穩健教練（照書打）的看法：' + base.label + '。' + base.reasons.slice(-1)[0]] : [];
  const eqOpt = read.length ? opts.find((o) => o.eq !== undefined && !(o.calc && o.calc.limp)) : null;   // 勝率：翻牌前只有已經有人進池時才講（對誰）
  adv.champ = { read, options: opts.sort((a, b) => b.ev - a.ev), best, base: keep, same: best.act.t === base.act.t, bb: H.bb, eq: est !== undefined ? est : eqOpt ? eqOpt.eq : undefined, rand: read.length || H.street ? base.rand : undefined, baseEq: base.eq, baseEff: base.eff, baseNeed: base.need, street: H.street };
  return adv;
}
const CHAMP_STYLE_TIP = {
  rock: '岩石很緊：沒好牌就棄，他一下大注通常是真的大牌',
  station: '跟注站很愛跟：有一點點牌就跟到底，所以有牌要下大一點收錢；完全沒中時他才會棄',
  maniac: '瘋子一直加注、常常詐唬：中等的牌可以跟到底，不要被嚇跑',
  lag: '鬆凶玩很多手、常主動下注：他的下注不一定是好牌',
  tag: '緊凶牌好才玩：他主動下注多半有東西',
  gto: 'GTO 電腦照圖表、求解器打，很難剝削：照勝率和賠率打',
};
function champReasons(H, seat, best, opts, read, base) {
  const R = [], p = H.players[seat];
  R.push(base.reasons[0]);
  const bb = (x) => (x >= 0 ? '+' : '') + fmt1(x / H.bb) + ' 個大盲';
  for (const r of read.slice(0, 2)) {
    let s = r.name + '（' + styleZh(r.style) + '）：照他的風格和動作，他大概是前 ' + PCT0(r.top) + ' 的牌';
    if (r.cats) s += '，' + r.cats.filter((x) => x.share >= 0.08).slice(0, 4).map((x) => x.name + ' ' + PCT0(x.share)).join('、');
    if (r.likely.length) s += r.top > 0.35 ? '（範圍很寬，什麼牌都可能）' : '（最可能：' + r.likely.slice(0, 3).map((x) => className(x.g)).join('、') + '）';
    R.push(s + '。');
  }
  let line = '冠軍的打法：' + best.label + '。成功率 ' + PCT0(best.win);
  if (best.act.t === 'r' && best.foldAll !== undefined) line += '（' + (best.resp && best.resp.length === 1 ? '他' : '大家都') + '棄牌 ' + PCT0(best.foldAll) + (best.foldAll < 0.98 ? '＋被跟時你贏的機會' : '') + '）';
  line += '，平均 ' + bb(best.ev) + '。';
  const alt = opts.filter((o) => o !== best).sort((a, b) => b.ev - a.ev)[0];
  if (alt) line += '其次是' + alt.label + '（平均 ' + bb(alt.ev) + '）。';
  R.push(line);
  if (H.street === 0 && best.act.t === 'r' && best.resp && best.foldAll >= 0.4) {
    const callers = best.resp.filter((x) => x.c + x.r >= 0.15).sort((a, b) => b.c + b.r - a.c - a.r);
    R.push((preflopRaises(H) ? '再加注搶底池' : '偷盲') + '：後面的人 ' + PCT0(best.foldAll) + ' 的時候全部棄牌' + (callers.length ? '；最可能不棄的是 ' + callers.slice(0, 2).map((x) => x.name + '（' + styleZh(x.style) + '，' + PCT0(x.c + x.r) + '）').join('、') : '') + '。');
  } else if (H.street > 0 && best.act.t === 'r' && best.resp && best.resp.length === 1) {
    const x = best.resp[0];
    R.push(x.f >= 0.45 ? '他有 ' + PCT0(x.f) + ' 的時候會棄牌：就算你沒有最好的牌，下注也賺。' : '他多半會跟（' + PCT0(x.c) + '），但你對他會跟的牌勝率 ' + PCT0(x.eqC) + '：下注是收錢（價值下注）。');
  }
  if ((best.act.t === 'x' || best.act.t === 'c') && best.nx && best.nx.n >= 10) {
    const x = best.nx, who = read.length > 1 ? '下一個人' : '他', when = x.next > 0.5 ? '下一條街' : '接著';
    R.push('你' + (best.act.t === 'x' ? '過牌' : '跟注') + '以後，' + who + when + '下注 ' + PCT0(x.r) + '、過牌 ' + PCT0(x.x) + (x.f >= 0.02 ? '、棄牌 ' + PCT0(x.f) : '') + '：'
      + (x.r >= 0.4 ? '讓他自己下注（他的牌有不少是在詐唬或拿差一點的牌下注），你再跟比你先下注賺得多。'
        : x.r < 0.25 ? (best.act.t === 'x' ? '他多半也不下注：便宜看下一張、控制底池，不讓比你大的牌加注把你趕走。' : '跟了之後他常常不再下注，你可以便宜看牌。')
        : '他有時會下注：你先過牌，被下注時再看賠率決定；你自己下注反而會趕走比你差的牌、只被比你好的牌跟。'));
  }
  const main = read[0];
  if (main && CHAMP_STYLE_TIP[main.style]) R.push(CHAMP_STYLE_TIP[main.style] + '。');
  if (best.act.t !== base.act.t) R.push('穩健教練會說「' + base.label + '」——照書打不會錯，但對這桌的人太' + (best.act.t === 'f' || best.act.t === 'x' ? '冒險' : '保守') + '。');
  void p;
  return R;
}
/* 照冠軍教練評分：你按的跟最好的選項平均差多少 */
function champGrade(adv, ev) {
  const C = adv.champ, opts = C.options, bb = C.bb || 2, best = C.best;
  const fam = (t) => (t === 'f' ? 'f' : t === 'x' ? 'x' : t === 'c' ? 'c' : 'r');
  const et = ev.t === 'a' ? (ev.callAll ? 'c' : 'r') : ev.t;
  let mine = opts.filter((o) => fam(o.act.t) === fam(et));
  if (fam(et) === 'r' && mine.length > 1) mine = [mine.reduce((a, b) => (Math.abs(b.act.to - ev.to) < Math.abs(a.act.to - ev.to) ? b : a))];
  if (!mine.length) return { mark: 'ok', text: '冠軍教練沒有算這個動作。建議：' + adv.label + '。', src: 'champ' };
  const m = mine[0], loss = Math.max(0, best.ev - m.ev), pot = ev.potBefore || 1, lbb = fmt1(loss / bb);
  if (m === best || loss <= Math.max(0.3 * bb, 0.05 * pot)) return { mark: 'good', text: m === best ? '跟冠軍的打法一樣（成功率 ' + PCT0(best.win) + '）。' : '差不多：跟冠軍的打法只差一點點。', src: 'champ' };
  if (loss <= Math.max(1.5 * bb, 0.15 * pot)) return { mark: 'ok', text: '可以，但平均少賺 ' + lbb + ' 個大盲（成功率 ' + PCT0(m.win) + '，冠軍的打法 ' + PCT0(best.win) + '）。', src: 'champ' };
  return { mark: 'bad', text: '平均少賺 ' + lbb + ' 個大盲：成功率 ' + PCT0(m.win) + '，冠軍的打法「' + best.label + '」' + PCT0(best.win) + '。', src: 'champ' };
}

/* ===== 整手模擬（10/25 升級）：每個選項把這一手打完很多次 =====
   對手的牌照他的範圍抽、之後的公牌照剩下的牌抽（每個選項用同一批「世界」，比較才準）；
   之後每個人（包括你）都照電腦的出牌規則打完。平均賺賠＝你這一手最後的輸贏，扣掉現在棄牌會輸的。
   棄牌的人的牌、還沒發的牌：你看不到，一律重抽（不偷看）。 */
function champLevelFast(level) {
  const k = 'r' + (level || 2);
  if (!AI_LEVEL[k]) {                                                  // 模擬裡電腦算勝率用比較少次（快），雜訊扣掉這一部分，總雜訊跟原本差不多
    const b = AI_LEVEL[level || 2] || AI_LEVEL[2];
    AI_LEVEL[k] = { noise: Math.sqrt(Math.max(0, b.noise * b.noise - 0.04 * 0.04)), iters: 150, mistake: b.mistake };
  }
  return k;
}
function champWorlds(H, seat, N, rng) {
  const opps = H.players.filter((q) => q.seat !== seat && !q.folded);
  const ws = opps.map((q) => rangeWeights(H, q.seat, CHAMP.styleRanges ? q.style : 'tag'));
  const known = new Uint8Array(52);
  for (const c of H.players[seat].cards.concat(H.board)) known[c] = 1;
  const cdfs = ws.map((w) => { const cdf = new Float64Array(NCOMBO); let s = 0; for (let k = 0; k < NCOMBO; k++) { if (!known[COMBO_A[k]] && !known[COMBO_B[k]]) s += w[k]; cdf[k] = s; } return cdf; });
  const out = [];
  for (let i = 0; i < N; i++) {
    const used = Uint8Array.from(known), cards = {};
    opps.forEach((q, j) => {
      const cdf = cdfs[j], tot = cdf[NCOMBO - 1];
      let k = -1;
      for (let t = 0; t < 60 && tot > 0; t++) {
        const u = rng() * tot;
        let lo = 0, hi = NCOMBO - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] > u) hi = mid; else lo = mid + 1; }
        if (!used[COMBO_A[lo]] && !used[COMBO_B[lo]]) { k = lo; break; }
      }
      if (k < 0) { for (let t = 0; t < 400; t++) { const x = (rng() * NCOMBO) | 0; if (!used[COMBO_A[x]] && !used[COMBO_B[x]]) { k = x; break; } } }
      cards[q.seat] = [COMBO_A[k], COMBO_B[k]]; used[COMBO_A[k]] = 1; used[COMBO_B[k]] = 1;
    });
    const deck = [];
    for (let c = 0; c < 52; c++) if (!used[c]) deck.push(c);
    for (let x = deck.length - 1; x > 0; x--) { const y = (rng() * (x + 1)) | 0; const t = deck[x]; deck[x] = deck[y]; deck[y] = t; }
    out.push({ cards, deck, seed: (rng() * 4294967296) >>> 0 });
  }
  return out;
}
function champPlay(H, seat, act, world, lvF) {
  const H1 = champClone(H);
  for (const q of H1.players) if (q.seat !== seat) q.cards = world.cards[q.seat] || [];
  H1.deck = world.deck; H1.dp = 0;
  const rng = makeRng(world.seed), before = H.players[seat].total, st0 = H1.street;
  applyAction(H1, act);
  let guard = 0, first = null;
  while (H1.phase !== 'done' && guard++ < 300) {
    const r = gameStep(H1);
    if (r.need === undefined) continue;
    const ev = applyAction(H1, aiDecide(H1, rng, lvF));
    if (!first && ev.seat !== seat) first = { t: ev.t === 'f' ? 'f' : ev.t === 'x' ? 'x' : ev.t === 'c' || (ev.t === 'a' && ev.callAll) ? 'c' : 'r', next: H1.street !== st0 };   // 你動作之後，對手的第一個動作
  }
  if (!H1.result) return { ev: 0, won: false, first: null, allFold: false };
  return { ev: H1.result.net[seat] + before, won: H1.result.won[seat] > 0, first, allFold: H1.result.uncontested && H1.result.won[seat] > 0 && H1.street === st0 };
}
/* cands：[{ act, label }]；回傳每個選項的平均賺賠、成功率、標準誤，和每個世界的結果（配對比較用） */
function champRollout(H, seat, level, cands, opt) {
  opt = opt || {};
  const N = opt.N || 200, budget = opt.budgetMs || 0, t0 = Date.now();
  const rng = makeRng(opt.seed || (H.no * 7919 + H.log.length * 31 + 1));
  const worlds = champWorlds(H, seat, N, rng), lvF = champLevelFast(level);
  const res = cands.map((c) => ({ act: c.act, label: c.label, xs: [], wins: 0, nx: { f: 0, x: 0, c: 0, r: 0, n: 0, next: 0, allFold: 0 } }));
  let n = 0;
  for (let i = 0; i < N; i++) {
    for (const r of res) {
      if (r.act.t === 'f') { r.xs.push(0); continue; }
      const o = champPlay(H, seat, r.act, worlds[i], lvF);
      r.xs.push(o.ev); if (o.won) r.wins++;
      if (o.first) { r.nx[o.first.t]++; r.nx.n++; if (o.first.next) r.nx.next++; }
      if (o.allFold) r.nx.allFold++;
    }
    n++;
    if (budget && n >= 40 && Date.now() - t0 > budget) break;
  }
  for (const r of res) {
    const m = r.xs.reduce((a, b) => a + b, 0) / n;
    r.ev = m; r.win = r.act.t === 'f' ? 0 : r.wins / n;
    r.se = Math.sqrt(r.xs.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, n - 1) / n);
    const X = r.nx, k = Math.max(1, X.n);                                // 對手接下來的動作（比例）：有動作的世界裡算；allFold 是全部世界裡算
    r.nx = { f: X.f / k, x: X.x / k, c: X.c / k, r: X.r / k, n: X.n, acted: X.n / n, next: X.next / k, allFold: X.allFold / n };
  }
  return { n, ms: Date.now() - t0, res };
}
/* 這一步值不值得模擬：翻牌前明顯要棄（每個不棄的選項平均都 < −0.5 大盲）就不用 */
function champNeedSim(adv) {
  const C = adv.champ;
  if (!C || !C.options || C.options.length < 2 || C.gto || C.short) return false;
  return C.options.some((o) => o.act.t !== 'f' && o.ev > -0.5 * (C.bb || 2));
}
/* 要模擬的選項：棄／過、跟，加注最多 3 種大小（一步估算最好的那幾個） */
function champSimCands(adv) {
  const o = adv.champ.options, pas = o.filter((x) => x.act.t !== 'r'), ag = o.filter((x) => x.act.t === 'r').sort((a, b) => b.ev - a.ev).slice(0, 3);
  return pas.concat(ag).map((x) => ({ act: x.act, label: x.label }));
}
/* 模擬的結果併回建議：選項的平均和成功率換成模擬的，重新挑最好的 */
function champMerge(adv, sim, H) {
  const C = adv.champ, bb = C.bb || 2;
  const key = (a) => a.t + ':' + (a.to || 0);
  const by = new Map(sim.res.map((r) => [key(r.act), r]));
  const opts = C.options.filter((o) => by.has(key(o.act))).map((o) => { const r = by.get(key(o.act)); return Object.assign({}, o, { ev1: o.ev, win1: o.win, ev: r.ev, win: r.win, se: r.se, xs: r.xs, nx: r.nx }); });
  if (!opts.length) return adv;
  // 先照一步估算的選擇；模擬（同一批世界配對比較）明顯更好的才換：多賺要超過門檻，也要超過 1 個標準誤（模擬次數有限，有雜訊）
  let best = opts.find((o) => key(o.act) === key(C.best.act)) || opts[0];
  let bestD = 0;
  for (const o of opts) {
    if (o === best) continue;
    const n = Math.min(o.xs.length, best.xs.length);
    let s = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const d = o.xs[i] - best.xs[i]; s += d; s2 += d * d; }
    const m = s / n, se = Math.sqrt(Math.max(0, s2 / n - m * m) / Math.max(1, n - 1));
    const need = (o.act.t === 'r' && best.act.t !== 'r' ? (H.street ? CHAMP.margin : CHAMP.marginPre) : 0.1) * bb;
    if (m > need && m > se && m > bestD) { bestD = m; o.dSe = se; o.d = m; best.swapTo = o; }
  }
  if (best.swapTo) { const x = best.swapTo; delete best.swapTo; best = x; }
  if (best.act.t === 'c' && best.ev < 0) best = opts.find((o) => o.act.t === 'f') || best;
  for (const o of opts) { o.bb = o.ev / bb; delete o.xs; }
  const out = Object.assign({}, adv);
  out.act = best.act; out.label = best.label;
  out.champ = Object.assign({}, C, { options: opts.sort((a, b) => b.ev - a.ev), best, sim: { n: sim.n, ms: sim.ms }, same: best.act.t === C.base.act.t, oneStep: { label: C.best.label } });
  out.reasons = champReasons(H, H.toAct, best, opts, C.read, { reasons: adv.reasons.slice(0, 1), act: C.base.act, label: C.base.label });
  out.reasons.splice(1 + Math.min(2, C.read.length), 0, '整手模擬 ' + sim.n + ' 次：每個選項都照每個人的出牌習慣把這一手打完（對手的牌照他的範圍抽），看最後平均輸贏。');
  return out;
}
