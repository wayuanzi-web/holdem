'use strict';
/* ===== 10-ui：共用的小工具、牌的畫法、背景執行緒 ===== */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x, d) => (x * 100).toFixed(d === undefined ? 1 : d);
const fmt = (x, d) => (+x).toFixed(d === undefined ? 1 : d);

/* 牌：大張（有花色大字）、文字（四色） */
function cardHTML(c, extra) {
  if (c < 0 || c === undefined) return '<span class="cd empty ' + (extra || '') + '"></span>';
  const s = c & 3;
  return '<span class="cd c' + s + ' ' + (extra || '') + '"><span class="r">' + RANK_TXT[c >> 2] + '</span><span class="s">' + SUIT_SYM[s] + '</span><span class="big">' + SUIT_SYM[s] + '</span></span>';
}
function cardSpan(c) { return '<span class="ct c' + (c & 3) + '">' + RANK_TXT[c >> 2] + SUIT_SYM[c & 3] + '</span>'; }
function comboSpan(k) {
  let a = COMBO_A[k], b = COMBO_B[k];
  if ((a >> 2) < (b >> 2) || ((a >> 2) === (b >> 2) && a > b)) { const t = a; a = b; b = t; }
  return cardSpan(a) + cardSpan(b);
}
function deckButtons(cards, used) {
  return cards.map((c) => '<button type="button" data-c="' + c + '" class="c' + (c & 3) + (used && used[c] ? ' used' : '') + '" aria-label="' + cardTxt(c) + '">'
    + RANK_TXT[c >> 2] + '<span>' + SUIT_SYM[c & 3] + '</span></button>').join('');
}
/* 52 張依花色一列：♠ ♥ ♦ ♣，每列 A→2 */
const DECK_ORDER = [];
for (let s = 0; s < 4; s++) for (let r = 12; r >= 0; r--) DECK_ORDER.push(cardOf(r, s));

/* ===== 背景執行緒 =====
   引擎的程式碼就在頁面的 <script id="engine"> 裡，拿它加上 worker 的主程式做成一個 Blob */
const W = (function makeWorker() {
  const src = $('engine').textContent + '\n' + $('workersrc').textContent;
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  const subs = {};
  w.onmessage = (e) => { const m = e.data; (subs[m.cmd] || []).forEach((f) => f(m)); };
  w.onerror = (e) => { console.error(e); };
  return {
    on(cmd, f) { (subs[cmd] = subs[cmd] || []).push(f); },
    send(m) { w.postMessage(m); },
  };
})();

/* 動作的顏色：棄牌藍、過牌／跟注綠、下注依大小由黃到深紅 */
const BET_COLS = ['#e2a23b', '#dc7132', '#c9462e', '#a8302c', '#7d2230'];
function actColors(acts) {
  const bets = acts.filter((a) => a.t === 'b' || a.t === 'r' || a.t === 'a');
  return acts.map((a) => {
    if (a.t === 'f') return '#4c7bc4';
    if (a.t === 'x' || a.t === 'c') return '#3f9d6a';
    const i = bets.indexOf(a), n = bets.length;
    return BET_COLS[Math.min(BET_COLS.length - 1, Math.round(i * (BET_COLS.length - 1) / Math.max(1, n - 1)) + (n === 1 ? 1 : 0))];
  });
}
