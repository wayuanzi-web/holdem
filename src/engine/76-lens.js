/* ===== 76-lens：範圍透視——「廢牌拿掉之後剩什麼」：對手的範圍（照圖表的位置與動作），翻牌後照公牌和動作縮小 ===== */

/* 可以選的局面：翻牌前照圖表 */
function lensSpots() {
  const out = [];
  for (const t of ['6', '9']) for (const pos of Object.keys(CHART_B[t])) out.push({ id: t + '/rfi/' + pos + '#raise', zh: t + ' 人桌・' + POS_ZH[pos] + '開牌加注', grp: t + ' 人桌開牌' });
  for (const d of ['BB', 'SB', 'IP']) for (const o of OPENER_GROUPS) {
    const key = '6/vsOpen/' + d + '/' + o;
    if (!chartText(key)) continue;
    const who = DEFENDER_ZH[d].replace('（非盲注）', '') + '面對' + openerZh('6', o) + '開牌';
    out.push({ id: key + '#call', zh: who + ' → 跟注', grp: '6 人桌面對開牌' });
    out.push({ id: key + '#raise', zh: who + ' → 3-bet', grp: '6 人桌面對開牌' });
  }
  for (const o of OPENER_GROUPS) { const key = '6/vs3bet/' + o; if (!chartText(key)) continue; out.push({ id: key + '#call', zh: '從' + openerZh('6', o) + '開牌、被 3-bet → 跟注', grp: '6 人桌被 3-bet' }); out.push({ id: key + '#raise', zh: '從' + openerZh('6', o) + '開牌、被 3-bet → 4-bet', grp: '6 人桌被 3-bet' }); }
  out.push({ id: '6/vs4bet#call', zh: '3-bet 之後被 4-bet → 跟注', grp: '6 人桌被 4-bet' }, { id: '6/vs4bet#raise', zh: '3-bet 之後被 4-bet → 全下', grp: '6 人桌被 4-bet' });
  return out;
}
function lensPreflop(spotId) {
  const [key, which] = spotId.split('#'), R = chartRanges(key);
  if (!R) return null;
  return Float32Array.from(R[which || 'raise']);
}
/* 一個範圍的基本數字：組合數、佔全部的比例、有幾種牌、最可能的幾種牌 */
function lensStats(w, topN) {
  let combos = 0, classes = 0;
  const cls = [];
  for (let g = 0; g < 169; g++) { let s = 0; for (const k of CLASS_COMBOS[g]) s += w[k]; if (s > 0.001) { classes++; cls.push({ g, c: s }); } combos += s; }
  cls.sort((a, b) => b.c - a.c);
  return { combos, pct: combos / NCOMBO, classes, top: cls.slice(0, topN || 8).map((x) => ({ g: x.g, share: x.c / combos, combos: x.c })) };
}
/* 四種樣子各佔多少 */
function lensShapes(w) {
  const by = {}; let tot = 0;
  for (let g = 0; g < 169; g++) { let s = 0; for (const k of CLASS_COMBOS[g]) s += w[k]; if (!(s > 0)) continue; const sh = handShape(g).k; by[sh] = (by[sh] || 0) + s; tot += s; }
  return SHAPE_ORDER.map((k) => ({ k, zh: SHAPE_ZH[k], share: tot ? (by[k] || 0) / tot : 0, combos: by[k] || 0 }));
}
/* 翻牌後照動作縮小：跟教練估對手範圍的公式一樣（62-ranges rangeWeights） */
function lensNarrow(w, board, act, styleKey) {
  const st = STYLES[styleKey] || STYLES.tag, S = boardStrength(board), out = new Float32Array(NCOMBO), base = 0.12 + st.bluff * 0.6;
  for (let k = 0; k < NCOMBO; k++) {
    const s = S[k];
    let f;
    if (act === 'bet') f = base + (1 - base) * s * s;
    else if (act === 'call') f = 0.15 + st.sticky * 2 + 0.85 * Math.min(1, s / 0.6);
    else if (act === 'check') f = 1 - 0.6 * s * s * s * s;
    else f = 1;
    out[k] = w[k] * f;
  }
  return out;
}
/* 公牌上：範圍裡每一類牌的比例（與你的牌對那一類的勝率） */
const LENS_CATS = [['兩對以上', (c) => c <= 5], ['超對', (c) => c === 6], ['頂對', (c) => c === 7], ['中對', (c) => c === 8], ['弱對', (c) => c === 9], ['同花聽牌', (c) => c === 10], ['順子聽牌', (c) => c === 11 || c === 12], ['沒中（高牌）', (c) => c >= 13]];
function lensBoard(w, board, hero) {
  const dead = new Set(board.concat(hero || [])), wt = {}, ws = {};
  let tot = 0;
  for (let k = 0; k < NCOMBO; k++) {
    if (!(w[k] > 0)) continue;
    const a = COMBO_A[k], b = COMBO_B[k];
    if (dead.has(a) || dead.has(b)) continue;
    const c = handCategory(a, b, board);
    const name = LENS_CATS.find((x) => x[1](c))[0];
    (wt[name] = wt[name] || new Float32Array(NCOMBO))[k] = w[k]; ws[name] = (ws[name] || 0) + w[k]; tot += w[k];
  }
  const rows = [];
  let sw = 0, se = 0;
  for (const [name] of LENS_CATS) {
    if (!ws[name]) continue;
    const r = { name, share: ws[name] / tot, combos: ws[name] };
    if (hero) r.eq = exactHU(hero, board, wt[name]).eq;
    rows.push(r);
    if (name === '兩對以上' || name === '超對' || name === '頂對') { sw += r.share; if (hero) se += r.share * r.eq; }
  }
  const all = new Float32Array(NCOMBO); for (let k = 0; k < NCOMBO; k++) if (w[k] > 0 && !dead.has(COMBO_A[k]) && !dead.has(COMBO_B[k])) all[k] = w[k];
  const res = { rows, combos: tot, strongShare: sw };
  if (hero) { res.all = exactHU(hero, board, all).eq; res.strongEq = sw ? se / sw : 0; const ones = new Float32Array(NCOMBO).fill(1); res.rand = exactHU(hero, board, ones).eq; }
  return res;
}
/* 翻牌前：你的牌對這個範圍的勝率（模擬）與對隨機牌 */
function lensPreEq(w, hero, rng) {
  const wA = new Float32Array(NCOMBO); wA[comboOf(hero[0], hero[1])] = 1;
  const r = rangeVsRange([], wA, w, { iters: 3000, rng });
  const q = preflopLookup(preflopClassOf(hero));
  return { eq: r.total, rand: q ? q.eq[0] : 0 };
}

/* 第 7-1 課的表：6 人桌各位置「廢牌拿掉之後剩什麼」 */
function lensRangeTable() {
  return [['UTG', '槍口開牌'], ['HJ', '劫位開牌'], ['CO', '關煞位開牌'], ['BTN', '按鈕開牌'], ['SB', '小盲開牌'], ['BB/BTN', '大盲跟按鈕'], ['BB/EP', '大盲跟槍口']].map(([k, zh]) => {
    const w = k.indexOf('/') > 0 ? chartRanges('6/vsOpen/' + k).call : chartRanges('6/rfi/' + k).raise;
    const st = lensStats(w, 3), sh = lensShapes(w);
    return { zh, pct: st.pct, combos: st.combos, classes: st.classes, top: st.top, shapes: sh };
  });
}

/* ===== GTO 縮小：把局面配成單挑（對手的範圍＋我方的範圍、誰有位置、底池、籌碼），轉牌／河牌交給求解器，照他的動作讀出 GTO 的範圍 ===== */
const LENS_RFI6 = { UTG: 'EP', HJ: 'MP', CO: 'CO', BTN: 'BTN', SB: 'SB' };
const LENS_OPEN6 = { EP: 'UTG', MP: 'HJ', CO: 'CO', BTN: 'BTN', SB: 'SB' };
/* 單位：大盲。回傳 null＝這個局面配不出對手（9 人桌、被 4-bet） */
function lensPair(spotId) {
  const [key, which] = spotId.split('#'), parts = key.split('/'), t = parts[0], kind = parts[1];
  if (t !== '6') return null;
  const R = chartRanges(key); if (!R) return null;
  const opp = Float32Array.from(R[which || 'raise']);
  if (kind === 'rfi') {
    const pos = parts[2], g = LENS_RFI6[pos], me = chartRanges('6/vsOpen/BB/' + g); if (!me) return null;
    return { opp, me: Float32Array.from(me.call), oppIP: pos !== 'SB', pot: pos === 'SB' ? 5 : 5.5, stack: 97.5, who: POS_ZH[pos] + '開牌，大盲跟注', meZh: '大盲' };
  }
  if (kind === 'vsOpen') {
    const d = parts[2], o = parts[3], opener = LENS_OPEN6[o];
    const oppIP = d === 'IP' || (d === 'BB' && o === 'SB');
    if (which === 'call') {
      const me = chartRanges('6/rfi/' + opener); if (!me) return null;
      const pot = d === 'IP' ? 6.5 : d === 'SB' ? 6 : o === 'SB' ? 5 : 5.5;
      return { opp, me: Float32Array.from(me.raise), oppIP, pot, stack: 97.5, who: openerZh('6', o) + '開牌，' + DEFENDER_ZH[d].replace('（非盲注）', '') + '跟注', meZh: openerZh('6', o) };
    }
    const me = chartRanges('6/vs3bet/' + o); if (!me) return null;
    const to = d === 'IP' ? 7.5 : 8.75, pot = 2 * to + (d === 'IP' ? 1.5 : d === 'SB' ? 1 : o === 'SB' ? 0 : 0.5);
    return { opp, me: Float32Array.from(me.call), oppIP, pot, stack: 100 - to, who: openerZh('6', o) + '開牌，' + DEFENDER_ZH[d].replace('（非盲注）', '') + ' 3-bet，' + openerZh('6', o) + '跟注', meZh: openerZh('6', o) };
  }
  if (kind === 'vs3bet') {
    const o = parts[2], bb = chartRanges('6/vsOpen/BB/' + o); if (!bb) return null;
    const oppIP = o !== 'SB';
    if (which === 'call') return { opp, me: Float32Array.from(bb.raise), oppIP, pot: 2 * 8.75 + (o === 'SB' ? 0 : 0.5), stack: 100 - 8.75, who: openerZh('6', o) + '開牌，大盲 3-bet，' + openerZh('6', o) + '跟注', meZh: '大盲' };
    const v4 = chartRanges('6/vs4bet'); if (!v4) return null;
    return { opp, me: Float32Array.from(v4.call), oppIP, pot: 2 * 22 + (o === 'SB' ? 0 : 0.5), stack: 78, who: openerZh('6', o) + '開牌，大盲 3-bet，' + openerZh('6', o) + ' 4-bet，大盲跟注', meZh: '大盲' };
  }
  return null;
}
/* 一條街的線：他做了什麼（sel），我方照最被動的打法補上。回傳 [{p, t}]，和「讀他範圍」的位置（做完第幾個動作） */
function lensLine(sel, oppIP) {
  const O = oppIP ? 1 : 0, M = 1 - O;
  if (oppIP) {
    if (sel === 'bet') return { steps: [{ p: M, t: 'x' }, { p: O, t: 'b' }, { p: M, t: 'c' }], readAt: 2 };
    if (sel === 'call') return { steps: [{ p: M, t: 'b' }, { p: O, t: 'c' }], readAt: 2 };
    return { steps: [{ p: M, t: 'x' }, { p: O, t: 'x' }], readAt: 2 };
  }
  if (sel === 'bet') return { steps: [{ p: O, t: 'b' }, { p: M, t: 'c' }], readAt: 1 };
  if (sel === 'call') return { steps: [{ p: O, t: 'x' }, { p: M, t: 'b' }, { p: O, t: 'c' }], readAt: 3 };
  return { steps: [{ p: O, t: 'x' }, { p: M, t: 'x' }], readAt: 1 };
}
/* 求解的設定：board 4–5 張；acts {1,2,3}；翻牌（和不求解的轉牌）先用教練的公式縮小雙方的範圍 */
function lensSolveCfg(pair, board, acts, styleKey, fromStreet) {
  const nb = board.length;
  if (nb < 4) return null;
  const st = fromStreet || (nb === 5 && !acts[2] ? 3 : 2);
  let wO = pair.opp, wM = pair.me;
  const assumeMe = (sel) => (sel === 'bet' ? 'call' : sel === 'call' ? 'bet' : 'check');
  for (let s = 1; s < st; s++) {
    const b = board.slice(0, s + 2), sel = acts[s] || '';
    if (sel) { wO = lensNarrow(wO, b, sel, styleKey); wM = lensNarrow(wM, b, assumeMe(sel), 'tag'); }
  }
  const dead = new Set(board);
  const clean = (w) => { let mx = 0; for (let c = 0; c < NCOMBO; c++) if (!dead.has(COMBO_A[c]) && !dead.has(COMBO_B[c]) && w[c] > mx) mx = w[c]; const q = new Float32Array(NCOMBO); for (let c = 0; c < NCOMBO; c++) { if (dead.has(COMBO_A[c]) || dead.has(COMBO_B[c]) || !mx) continue; const x = w[c] / mx; if (x >= 0.04) q[c] = Math.round(x * 100) / 100 || 0.01; } return q; };
  const oppP = pair.oppIP ? 1 : 0, ranges = []; ranges[oppP] = clean(wO); ranges[1 - oppP] = clean(wM);
  const T = GTO_TREE[st], unit = GAME_BB;
  const cfg = { board: board.slice(0, st === 2 ? 4 : 5), pot: Math.round(pair.pot * unit), stack: Math.round(pair.stack * unit), ranges, bet: T.bet, raise: T.raise, cap: T.cap, allin: 0.67, addAllin: true, target: T.target, maxIters: T.maxIters };
  // 路徑：這條街（和河牌）的線
  const tree = buildTree(cfg), path = [], before = [];
  let nd = tree.root, readPath = null, readBefore = null;
  for (let s = st; s <= 3; s++) {
    if (board.length < s + 2) break;
    if (s > st) { if (!nd || nd.kind !== N_CHANCE) return null; path.push({ c: board[s + 1] }); nd = nd.kids[0]; }
    const L = lensLine(acts[s] || '', pair.oppIP);
    for (let i = 0; i < L.steps.length; i++) {
      const sp = L.steps[i];
      if (!nd || nd.kind !== N_ACT || nd.p !== sp.p) return null;
      const a = matchAct(nd.acts, sp.t === 'b' ? { t: 'b', to: nd.acts.find((x) => x.t === 'b') ? nd.acts.find((x) => x.t === 'b').to : 0 } : { t: sp.t });
      if (a < 0) return null;
      if (i + 1 === L.readAt) readBefore = path.slice();
      path.push({ a }); nd = nd.kids[a];
      if (i + 1 === L.readAt) readPath = path.slice();
    }
  }
  return { cfg, oppP, street: st, path: readPath, before: readBefore, tree };
}
