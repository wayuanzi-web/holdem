'use strict';
/* ===== 10-cards：牌、1326 種兩張組合、169 種起手牌、範圍文字、亂數 =====
   牌的編號 c = 點數 × 4 + 花色；點數 0＝2 … 12＝A；花色 0♠ 1♥ 2♦ 3♣ */
const RANKS = '23456789TJQKA';
const SUITS = 'shdc';
const SUIT_SYM = ['♠', '♥', '♦', '♣'];
const RANK_TXT = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function cardOf(r, s) { return (r << 2) | s; }
function cardStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }          // 'Kd'
function cardTxt(c) { return RANK_TXT[c >> 2] + SUIT_SYM[c & 3]; }     // 'K♦'
function parseCard(t) {
  t = String(t).trim();
  if (t.length < 2) return -1;
  let rs = t.slice(0, -1).toUpperCase();
  const ss = t.slice(-1);
  if (rs === '10') rs = 'T';
  const r = rs.length === 1 ? RANKS.indexOf(rs) : -1;
  let s = SUITS.indexOf(ss.toLowerCase());
  if (s < 0) s = SUIT_SYM.indexOf(ss);
  return (r < 0 || s < 0) ? -1 : cardOf(r, s);
}
function parseCards(str) {
  const out = [], re = /(10|[2-9TJQKAtjqka])([shdcSHDC♠♥♦♣])/g;
  let m;
  while ((m = re.exec(String(str)))) { const c = parseCard(m[1] + m[2]); if (c >= 0 && out.indexOf(c) < 0) out.push(c); }
  return out;
}

/* 1326 種兩張牌組合：k ↔ (a, b)，a < b */
const NCOMBO = 1326;
const COMBO_A = new Uint8Array(NCOMBO), COMBO_B = new Uint8Array(NCOMBO);
const COMBO_OF = new Int16Array(52 * 52).fill(-1);
(function initCombos() {
  let k = 0;
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
    COMBO_A[k] = a; COMBO_B[k] = b; COMBO_OF[a * 52 + b] = k; COMBO_OF[b * 52 + a] = k; k++;
  }
})();
function comboOf(a, b) { return COMBO_OF[a * 52 + b]; }
function comboTxt(k) { const a = COMBO_A[k], b = COMBO_B[k]; return (a >> 2) >= (b >> 2) ? cardTxt(a) + cardTxt(b) : cardTxt(b) + cardTxt(a); }

/* 169 種起手牌，排成 13×13 格：第 0 列、第 0 欄是 A。
   對角線是口袋對；右上（列 < 欄）同花；左下（列 > 欄）不同花 */
function classIndex(r1, r2, suited) {
  const hi = r1 > r2 ? r1 : r2, lo = r1 > r2 ? r2 : r1;
  const ih = 12 - hi, il = 12 - lo;
  if (hi === lo) return ih * 13 + ih;
  return suited ? ih * 13 + il : il * 13 + ih;
}
function className(g) {
  const row = (g / 13) | 0, col = g % 13;
  if (row === col) return RANKS[12 - row] + RANKS[12 - row];
  return row < col ? RANKS[12 - row] + RANKS[12 - col] + 's' : RANKS[12 - col] + RANKS[12 - row] + 'o';
}
function classTxt(g) { return className(g).replace(/T/g, '10'); }
const CLASS_OF = new Uint8Array(NCOMBO);
const CLASS_COMBOS = [];
(function initClasses() {
  for (let g = 0; g < 169; g++) CLASS_COMBOS.push([]);
  for (let k = 0; k < NCOMBO; k++) {
    const a = COMBO_A[k], b = COMBO_B[k];
    const g = classIndex(a >> 2, b >> 2, (a & 3) === (b & 3));
    CLASS_OF[k] = g; CLASS_COMBOS[g].push(k);
  }
})();
function classSize(g) { return CLASS_COMBOS[g].length; }   // 對子 6、同花 4、不同花 12

/* ===== 範圍文字 =====
   支援：AA、TT+、99-66、AKs、AKo、AK、A2s+、K9s-K6s、AsKs（指定花色）、權重 AQo:0.5 或 AQo@50 */
function rangeAddClass(w, g, x) { const cs = CLASS_COMBOS[g]; for (let i = 0; i < cs.length; i++) w[cs[i]] = x; }
function parseRange(text) {
  const w = new Float32Array(NCOMBO);
  const toks = String(text || '').split(/[\s,;]+/).filter(Boolean);
  const bad = [];
  for (let tok of toks) {
    let x = 1;
    const mw = tok.match(/^(.*?)(?:[:](\d*\.?\d+)|@(\d*\.?\d+))$/);
    if (mw) { tok = mw[1]; x = mw[2] !== undefined ? +mw[2] : +mw[3] / 100; }
    if (!(x >= 0)) x = 0;
    if (x > 1) x = 1;
    const T = tok.replace(/10/g, 'T');
    let m;
    if ((m = T.match(/^([2-9TJQKA])([shdc])([2-9TJQKA])([shdc])$/i))) {          // 指定兩張
      const a = parseCard(m[1] + m[2]), b = parseCard(m[3] + m[4]);
      if (a >= 0 && b >= 0 && a !== b) { w[comboOf(a, b)] = x; continue; }
    }
    const U = T.toUpperCase();
    if ((m = U.match(/^([2-9TJQKA])\1(\+)?$/))) {                                   // 對子
      const r = RANKS.indexOf(m[1]);
      for (let q = r; q <= (m[2] ? 12 : r); q++) rangeAddClass(w, classIndex(q, q, false), x);
      continue;
    }
    if ((m = U.match(/^([2-9TJQKA])\1-([2-9TJQKA])\2$/))) {                          // 99-66
      let r1 = RANKS.indexOf(m[1]), r2 = RANKS.indexOf(m[2]);
      if (r1 < r2) { const t = r1; r1 = r2; r2 = t; }
      for (let q = r2; q <= r1; q++) rangeAddClass(w, classIndex(q, q, false), x);
      continue;
    }
    if ((m = U.match(/^([2-9TJQKA])([2-9TJQKA])([SO])?(\+)?$/))) {                    // AKs、A2s+、AK
      let hi = RANKS.indexOf(m[1]), lo = RANKS.indexOf(m[2]);
      if (hi === lo) { bad.push(tok); continue; }
      if (hi < lo) { const t = hi; hi = lo; lo = t; }
      const kinds = m[3] === 'S' ? [true] : m[3] === 'O' ? [false] : [true, false];
      for (let q = lo; q <= (m[4] ? hi - 1 : lo); q++) for (const s of kinds) rangeAddClass(w, classIndex(hi, q, s), x);
      continue;
    }
    if ((m = U.match(/^([2-9TJQKA])([2-9TJQKA])([SO])?-([2-9TJQKA])([2-9TJQKA])([SO])?$/)) && m[1] === m[4]) {   // K9s-K6s
      const hi = RANKS.indexOf(m[1]);
      let a = RANKS.indexOf(m[2]), b = RANKS.indexOf(m[5]);
      if (a < b) { const t = a; a = b; b = t; }
      const kinds = m[3] === 'S' ? [true] : m[3] === 'O' ? [false] : [true, false];
      for (let q = b; q <= a; q++) if (q !== hi) for (const s of kinds) rangeAddClass(w, classIndex(hi, q, s), x);
      continue;
    }
    bad.push(tok);
  }
  w.bad = bad;
  return w;
}
/* 範圍 → 文字（每一格一個；整格同權重才合併） */
function rangeText(w) {
  const out = [];
  for (let g = 0; g < 169; g++) {
    const cs = CLASS_COMBOS[g];
    const x = w[cs[0]];
    let same = true;
    for (let i = 1; i < cs.length; i++) if (Math.abs(w[cs[i]] - x) > 1e-4) { same = false; break; }
    if (same) { if (x > 1e-4) out.push(className(g) + (x < 0.9999 ? ':' + (+x.toFixed(3)) : '')); continue; }
    for (const k of cs) if (w[k] > 1e-4) out.push(cardStr(Math.max(COMBO_A[k], COMBO_B[k])) + cardStr(Math.min(COMBO_A[k], COMBO_B[k])) + (w[k] < 0.9999 ? ':' + (+w[k].toFixed(3)) : ''));
  }
  return out.join(',');
}
function rangeCombos(w) { let s = 0; for (let k = 0; k < NCOMBO; k++) s += w[k]; return s; }

/* 亂數（可重現）：mulberry32 */
function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
