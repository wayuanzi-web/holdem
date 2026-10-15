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
