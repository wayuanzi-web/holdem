/* ===== 20-eval：評牌器 =====
   任意 1–7 張牌 → 一個整數，越大越好；牌型在第 26 位以上（0 高牌 … 8 同花順）。
   做法：每張牌依點數記進四個 13 位元遮罩（出現 1、2、3、4 次），每個花色一個遮罩；
   順子、取最高幾張都查 8192 格的表。不配置記憶體，一次約幾十奈秒。 */
const CAT_NAMES = ['高牌', '一對', '兩對', '三條', '順子', '同花', '葫蘆', '四條', '同花順'];
const CAT_SHIFT = 26;
const POP13 = new Uint8Array(8192);
const TOPBIT = new Int8Array(8192);
const STRAIGHT_TOP = new Int8Array(8192);
const KEEP1 = new Uint16Array(8192), KEEP2 = new Uint16Array(8192), KEEP3 = new Uint16Array(8192), KEEP5 = new Uint16Array(8192);
(function initEvalTables() {
  for (let m = 0; m < 8192; m++) {
    let p = 0, top = -1;
    for (let r = 0; r < 13; r++) if (m & (1 << r)) { p++; top = r; }
    POP13[m] = p; TOPBIT[m] = top;
    let st = -1;
    for (let t = 12; t >= 4; t--) { const w = 0x1f << (t - 4); if ((m & w) === w) { st = t; break; } }
    if (st < 0 && (m & 0x100f) === 0x100f) st = 3;                 // A2345：5 高
    STRAIGHT_TOP[m] = st;
    const keep = (k) => { let x = 0, n = 0; for (let r = 12; r >= 0 && n < k; r--) if (m & (1 << r)) { x |= 1 << r; n++; } return x; };
    KEEP1[m] = keep(1); KEEP2[m] = keep(2); KEEP3[m] = keep(3); KEEP5[m] = keep(5);
  }
})();

function evalMasks(m1, m2, m3, m4, s0, s1, s2, s3) {
  let fm = 0;
  if (POP13[s0] >= 5) fm = s0; else if (POP13[s1] >= 5) fm = s1; else if (POP13[s2] >= 5) fm = s2; else if (POP13[s3] >= 5) fm = s3;
  if (fm) { const st = STRAIGHT_TOP[fm]; if (st >= 0) return (8 << CAT_SHIFT) | st; }
  if (m4) return (7 << CAT_SHIFT) | (m4 << 13) | KEEP1[m1 & ~m4];
  if (m3) {
    const t = KEEP1[m3], p = KEEP1[m2 & ~t];
    if (p) return (6 << CAT_SHIFT) | (TOPBIT[t] << 4) | TOPBIT[p];
  }
  if (fm) return (5 << CAT_SHIFT) | KEEP5[fm];
  const st = STRAIGHT_TOP[m1];
  if (st >= 0) return (4 << CAT_SHIFT) | st;
  if (m3) { const t = KEEP1[m3]; return (3 << CAT_SHIFT) | (t << 13) | KEEP2[m1 & ~t]; }
  if (m2) {
    if (POP13[m2] >= 2) { const tp = KEEP2[m2]; return (2 << CAT_SHIFT) | (tp << 13) | KEEP1[m1 & ~tp]; }
    return (1 << CAT_SHIFT) | (m2 << 13) | KEEP3[m1 & ~m2];
  }
  return KEEP5[m1];
}

/* 一般用：cards 是陣列（或 typed array），從 off 開始取 n 張 */
function evalCards(cards, n, off) {
  if (n === undefined) n = cards.length;
  off = off | 0;
  let m1 = 0, m2 = 0, m3 = 0, m4 = 0, s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  for (let i = off, e = off + n; i < e; i++) {
    const c = cards[i], b = 1 << (c >> 2);
    switch (c & 3) { case 0: s0 |= b; break; case 1: s1 |= b; break; case 2: s2 |= b; break; default: s3 |= b; }
    if (m1 & b) { if (m2 & b) { if (m3 & b) m4 |= b; else m3 |= b; } else m2 |= b; } else m1 |= b;
  }
  return evalMasks(m1, m2, m3, m4, s0, s1, s2, s3);
}

/* 快速版：先把公牌記成狀態 B（Int32Array(8)），每個玩家只加兩張 */
function boardState(cards, n, B) {
  if (n === undefined) n = cards.length;
  if (!B) B = new Int32Array(8);
  B.fill(0);
  for (let i = 0; i < n; i++) boardAdd(B, cards[i]);
  return B;
}
function boardAdd(B, c) {
  const b = 1 << (c >> 2);
  B[4 + (c & 3)] |= b;
  if (B[0] & b) { if (B[1] & b) { if (B[2] & b) B[3] |= b; else B[2] |= b; } else B[1] |= b; } else B[0] |= b;
}
function evalAdd2(B, c1, c2) {
  let m1 = B[0], m2 = B[1], m3 = B[2], m4 = B[3], s0 = B[4], s1 = B[5], s2 = B[6], s3 = B[7];
  let b = 1 << (c1 >> 2);
  switch (c1 & 3) { case 0: s0 |= b; break; case 1: s1 |= b; break; case 2: s2 |= b; break; default: s3 |= b; }
  if (m1 & b) { if (m2 & b) { if (m3 & b) m4 |= b; else m3 |= b; } else m2 |= b; } else m1 |= b;
  b = 1 << (c2 >> 2);
  switch (c2 & 3) { case 0: s0 |= b; break; case 1: s1 |= b; break; case 2: s2 |= b; break; default: s3 |= b; }
  if (m1 & b) { if (m2 & b) { if (m3 & b) m4 |= b; else m3 |= b; } else m2 |= b; } else m1 |= b;
  return evalMasks(m1, m2, m3, m4, s0, s1, s2, s3);
}
function evalAdd1(B, c1) {
  let m1 = B[0], m2 = B[1], m3 = B[2], m4 = B[3], s0 = B[4], s1 = B[5], s2 = B[6], s3 = B[7];
  const b = 1 << (c1 >> 2);
  switch (c1 & 3) { case 0: s0 |= b; break; case 1: s1 |= b; break; case 2: s2 |= b; break; default: s3 |= b; }
  if (m1 & b) { if (m2 & b) { if (m3 & b) m4 |= b; else m3 |= b; } else m2 |= b; } else m1 |= b;
  return evalMasks(m1, m2, m3, m4, s0, s1, s2, s3);
}

function handCat(v) { return v >>> CAT_SHIFT; }
function bitRanks(m) { const out = []; for (let r = 12; r >= 0; r--) if (m & (1 << r)) out.push(r); return out; }
/* 牌型的中文描述：「一對 K」「兩對 K 和 5」「順子（7 高）」 */
function describeHand(v) {
  const cat = v >>> CAT_SHIFT, x = v & ((1 << CAT_SHIFT) - 1), R = RANK_TXT;
  switch (cat) {
    case 0: return '高牌 ' + R[TOPBIT[x & 8191]];
    case 1: return '一對 ' + R[TOPBIT[x >> 13]];
    case 2: { const p = bitRanks(x >> 13); return '兩對 ' + R[p[0]] + ' 和 ' + R[p[1]]; }
    case 3: return '三條 ' + R[TOPBIT[x >> 13]];
    case 4: return '順子（' + R[x] + ' 高）';
    case 5: return '同花（' + R[TOPBIT[x]] + ' 高）';
    case 6: return '葫蘆（' + R[x >> 4] + ' 帶 ' + R[x & 15] + '）';
    case 7: return '四條 ' + R[TOPBIT[x >> 13]];
    default: return x === 12 ? '皇家同花順' : '同花順（' + R[x] + ' 高）';
  }
}
