/* ===== 20-calc：勝率計算機 ===== */
const CALC = {
  slots: [cardOf(1, 0), cardOf(2, 0), cardOf(11, 2), cardOf(3, 3), cardOf(4, 1), -1, -1],   // 3♠4♠，K♦5♣6♥（使用者舉的例子）
  active: 5, nOpp: 1, sent: 0, res: null, mc: null,
};
const CAT_SHORT = CAT_NAMES;

function calcHero() { const s = CALC.slots; return s[0] >= 0 && s[1] >= 0 ? [s[0], s[1]] : null; }
function calcBoard() { return CALC.slots.slice(2).filter((c) => c >= 0); }

function renderSlots() {
  const s = CALC.slots;
  const slot = (i) => '<span role="button" tabindex="0" data-slot="' + i + '" aria-label="' + (i < 2 ? '手牌第 ' + (i + 1) + ' 張' : '公牌第 ' + (i - 1) + ' 張') + (s[i] >= 0 ? '：' + cardTxt(s[i]) : '：空') + '">'
    + cardHTML(s[i], i === CALC.active ? 'on' : '') + '</span>';
  $('slots').innerHTML = '<div><h3>你的手牌</h3><div class="row">' + slot(0) + slot(1) + '</div></div>'
    + '<div><h3>公牌</h3><div class="row">' + slot(2) + slot(3) + slot(4) + '<span class="gap"></span>' + slot(5) + '<span class="gap"></span>' + slot(6) + '</div></div>';
  const used = new Uint8Array(52);
  for (const c of s) if (c >= 0) used[c] = 1;
  $('deck').innerHTML = deckButtons(DECK_ORDER, used);
}
function nextActive() {
  const s = CALC.slots;
  for (let k = 1; k <= 7; k++) { const i = (CALC.active + k) % 7; if (s[i] < 0) { CALC.active = i; return; } }
  CALC.active = -1;
}
function slotClick(i) {
  if (CALC.slots[i] >= 0) CALC.slots[i] = -1;
  CALC.active = i;
  calcChanged();
}
function deckClick(c) {
  if (CALC.slots.indexOf(c) >= 0) return;
  if (CALC.active < 0) nextActive();
  if (CALC.active < 0) return;
  CALC.slots[CALC.active] = c;
  nextActive();
  calcChanged();
}
function randomFree() {
  const used = new Set(CALC.slots.filter((c) => c >= 0));
  const free = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) free.push(c);
  return free[(Math.random() * free.length) | 0];
}

function calcChanged() {
  renderSlots();
  const hero = calcHero(), board = calcBoard();
  CALC.res = null; CALC.mc = null;
  if (!hero) { calcMsg('先放兩張手牌。'); return; }
  if (board.length === 1 || board.length === 2) { calcMsg('公牌要放到 3 張（翻牌）才能算翻牌後的機率。'); return; }
  CALC.sent++;
  W.send({ cmd: 'calc', hero, board, maxOpp: 8 });
  $('bigEq').textContent = '…';
}
function calcMsg(t) {
  $('bigEq').textContent = '—';
  $('handTxt').textContent = t; $('handSub').textContent = '';
  $('eqTab').innerHTML = ''; $('catTab').innerHTML = ''; $('outsBox').innerHTML = ''; $('eqNote').textContent = '';
}

W.on('calc', (m) => { if (m.token !== CALC.sent) return; CALC.res = m; CALC.mc = null; renderCalc(); });
W.on('calcmc', (m) => { if (m.token !== CALC.sent) return; CALC.mc = m; renderCalc(); });

function barRow(label, x, hl, txt, zero) {
  return '<tr class="' + (hl ? 'hl' : '') + (zero ? ' zero' : '') + '"><td>' + label + '</td><td><div class="bar"><i style="width:' + Math.max(0, Math.min(100, x * 100)).toFixed(1) + '%"></i></div></td><td>' + txt + '</td></tr>';
}
/* 對 N 家的勝率（0–1）；還沒算好回傳 null */
function eqFor(N) {
  const r = CALC.res;
  if (!r) return null;
  if (r.pre) return r.pre.eq[N - 1];
  if (N === 1 && r.exact) return r.exact.eq;
  const m = CALC.mc;
  return m ? (m.win[N] + m.tie[N]) / m.n : null;
}
function renderCalc() {
  const r = CALC.res;
  if (!r) return;
  const N = CALC.nOpp, hero = r.hero;
  const e = eqFor(N);
  $('bigEq').innerHTML = e === null ? '…' : pct(e) + '<small>%</small>';
  const hand = cardSpan(hero[0]) + cardSpan(hero[1]);
  let rows = '';
  for (let k = 1; k <= 8; k++) { const x = eqFor(k); rows += barRow('對 ' + k + ' 家', x || 0, k === N, x === null ? '…' : pct(x) + '%'); }
  $('eqTab').innerHTML = rows;
  if (r.pre) {
    const g = r.cls;
    $('handTxt').innerHTML = hand + '（' + esc(classTxt(g)) + '）';
    $('handSub').textContent = '翻牌前；對 ' + N + ' 家在 169 種起手牌裡排第 ' + r.pre.rank[N - 1] + ' 名';
    $('eqNote').textContent = '翻牌前的數字是預先算好的（每手模擬 100 萬次）。';
    $('catTitle').textContent = '到河牌時的牌型機率';
    $('catTab').innerHTML = r.pre.cat.map((x, i) => barRow(CAT_SHORT[i], x, false, x < 0.0005 && x > 0 ? '<0.1%' : pct(x) + '%', x === 0)).reverse().join('');
    $('outsBox').innerHTML = '';
  } else {
    $('handTxt').innerHTML = hand + '：' + esc(r.cur.txt);
    const st = ['', '', '', '翻牌', '轉牌', '河牌'][r.board.length];
    $('handSub').textContent = st + (r.draws ? '，' + r.draws : '') + '；對 ' + N + ' 家';
    const mc = CALC.mc;
    let note = '對 1 家是精確值（所有發牌、所有對手手牌都算過）。';
    if (mc) {
      const x = eqFor(Math.max(2, N)), moe = 1.96 * Math.sqrt(Math.max(1e-6, x * (1 - x)) / mc.n);
      note += '2 家以上是模擬 ' + mc.n.toLocaleString() + ' 次的結果（誤差約 ±' + pct(moe, 2) + '%）' + (mc.done ? '。' : '，還在加。');
    } else note += '2 家以上模擬中…';
    $('eqNote').textContent = note;
    if (r.board.length === 5) {
      $('catTitle').textContent = '牌型（河牌已經定了）';
      $('catTab').innerHTML = barRow(CAT_SHORT[r.cur.cat], 1, true, '100%');
    } else {
      $('catTitle').textContent = '到河牌時的牌型機率（精確）';
      $('catTab').innerHTML = r.cat.map((x, i) => barRow(CAT_SHORT[i], x, i === r.cur.cat, x === 0 ? '0' : x < 0.0005 ? '<0.1%' : pct(x) + '%', x === 0)).reverse().join('');
    }
    const o = r.outs;
    if (o) {
      let h = '<h3>出牌數（下一張讓你升級的牌）</h3>';
      if (!o.groups.length) h += '<p class="note" style="margin:0">沒有能讓你明顯升級的牌。</p>';
      for (const g of o.groups) h += '<div class="grp' + (g.strong ? '' : ' weak') + '"><b>' + (g.strong ? '' : '弱：') + esc(g.name) + ' ' + g.cards.length + ' 張</b>' + g.cards.map(cardSpan).join(' ') + '</div>';
      if (o.total) h += '<p class="note" style="margin:6px 0 0">共 ' + o.total + ' 張出牌：下一張就中 ' + pct(o.pNext) + '%' + (r.board.length === 3 ? '，到河牌至少中一張 ' + pct(o.pRiver) + '%（2–4 法則：' + o.total + ' × 4 ≈ ' + Math.min(100, o.total * 4) + '%）' : '（法則：' + o.total + ' × 2 ≈ ' + o.total * 2 + '%）') + '。</p>';
      if (o.weak) h += '<p class="note" style="margin:2px 0 0">「弱」是配成中對、底對，不算進出牌數。</p>';
      $('outsBox').innerHTML = h;
    } else $('outsBox').innerHTML = '';
  }
  renderHeat();
}

/* 169 格熱圖 */
const HEAT_STOPS = [[0x16, 0x2f, 0x28], [0x2b, 0x5e, 0x49], [0x6e, 0x9e, 0x63], [0xd6, 0xb4, 0x5a], [0xff, 0xef, 0xc0]];
function heatColor(t) {
  t = Math.max(0, Math.min(1, t)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(t)), f = t - i, a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1];
  const c = a.map((x, k) => Math.round(x + (b[k] - x) * f));
  return { bg: 'rgb(' + c.join(',') + ')', fg: (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) > 140 ? '#1b1608' : '#e6eee9' };
}
function renderHeat() {
  const N = CALC.nOpp;
  $('heatTitle').textContent = '起手牌強度：對 ' + N + ' 家';
  const eq = [];
  for (let g = 0; g < 169; g++) { const p = preflopLookup(g); eq.push(p.eq[N - 1]); }
  const lo = Math.min(...eq), hi = Math.max(...eq);
  const hero = calcHero(), me = hero ? preflopClassOf(hero) : -1;
  let h = '';
  for (let g = 0; g < 169; g++) {
    const c = heatColor((eq[g] - lo) / (hi - lo));
    h += '<button type="button" data-g="' + g + '" class="' + (g === me ? 'me' : '') + '" style="background:' + c.bg + ';color:' + c.fg + '" title="' + classTxt(g) + '：' + pct(eq[g]) + '%">' + className(g) + '</button>';
  }
  $('heat').innerHTML = h;
}
function heatClick(g) {
  const board = calcBoard();
  const dead = new Set(board);
  const k = CLASS_COMBOS[g].find((x) => !dead.has(COMBO_A[x]) && !dead.has(COMBO_B[x]));
  if (k === undefined) return;
  const a = COMBO_A[k], b = COMBO_B[k];
  CALC.slots[0] = Math.max(a, b); CALC.slots[1] = Math.min(a, b);
  calcChanged();
}

function initCalc() {
  let ob = '';
  for (let k = 1; k <= 8; k++) ob += '<button type="button" data-n="' + k + '" aria-pressed="' + (k === CALC.nOpp) + '">' + k + '</button>';
  $('opps').insertAdjacentHTML('beforeend', ob);
  $('opps').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-n]'); if (!b) return;
    CALC.nOpp = +b.dataset.n;
    $('opps').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderCalc(); renderHeat();
  });
  $('slots').addEventListener('click', (e) => { const t = e.target.closest('[data-slot]'); if (t) slotClick(+t.dataset.slot); });
  $('slots').addEventListener('keydown', (e) => { const t = e.target.closest('[data-slot]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); slotClick(+t.dataset.slot); } });
  $('deck').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (b) deckClick(+b.dataset.c); });
  $('heat').addEventListener('click', (e) => { const b = e.target.closest('button[data-g]'); if (b) heatClick(+b.dataset.g); });
  $('bDeal').addEventListener('click', () => {
    const s = CALC.slots;
    let i = 2;
    while (i < 7 && s[i] >= 0) i++;
    if (i >= 7) return;
    if (i === 2) { s[2] = randomFree(); s[3] = randomFree(); s[4] = randomFree(); } else s[i] = randomFree();
    CALC.active = -1; nextActive();
    calcChanged();
  });
  $('bNewHand').addEventListener('click', () => { CALC.slots[0] = -1; CALC.slots[1] = -1; CALC.slots[0] = randomFree(); CALC.slots[1] = randomFree(); calcChanged(); });
  $('bClearBoard').addEventListener('click', () => { for (let i = 2; i < 7; i++) CALC.slots[i] = -1; CALC.active = 2; calcChanged(); });
  calcChanged();
}
