/* ===== 22-rvr：範圍對範圍（勝率計算機的第二個模式） ===== */
const RV = { a: RANGE_BTN_OPEN, b: RANGE_BB_CALL, names: ['範圍 A', '範圍 B'], board: [], req: 0, res: null };
const RV_KEY = 'dezhou-rvr';
function rvSave() { try { localStorage.setItem(RV_KEY, JSON.stringify({ a: RV.a, b: RV.b, board: RV.board, on: RV.on })); } catch (e) { /* 忽略 */ } }
function rvLoad() { try { const o = JSON.parse(localStorage.getItem(RV_KEY) || 'null'); if (o) { RV.a = o.a || RV.a; RV.b = o.b || RV.b; RV.board = Array.isArray(o.board) ? o.board : []; RV.on = !!o.on; } } catch (e) { /* 忽略 */ } }
function rvMode(rv) {
  RV.on = rv;
  $('calcMode').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.m === 'rvr') === rv)));
  $('rvrBox').hidden = !rv; document.querySelector('#pCalc .calc').hidden = rv;
  if (rv) renderRvr(); else rvSave();
}
function renderRvr() {
  const lib = '<option value="">從範圍庫選…</option>' + RANGE_LIB.map((r) => '<option value="' + r.key + '">' + esc(r.name) + '</option>').join('');
  $('rvRanges').innerHTML = ['a', 'b'].map((k, i) => {
    const w = parseRange(RV[k]);
    return '<div class="rcard"><div class="rchead"><b>' + RV.names[i] + '</b></div><button type="button" class="minibtn" data-rv="' + k + '" aria-label="編輯">' + miniGridHTML(w) + '</button>'
      + '<div class="note">' + fmt(rangeCombos(w), 0) + ' 個組合（' + pct(rangeCombos(w) / NCOMBO, 0) + '%）</div><div class="strow"><button class="btn sm" data-rv="' + k + '">編輯</button><select data-rvlib="' + k + '" aria-label="範圍庫">' + lib + '</select></div></div>';
  }).join('');
  const used = new Uint8Array(52);
  for (const c of RV.board) used[c] = 1;
  let h = '';
  for (let i = 0; i < 5; i++) h += (i === 3 || i === 4 ? '<span class="gap"></span>' : '') + '<span role="button" tabindex="0" data-rs="' + i + '">' + cardHTML(i < RV.board.length ? RV.board[i] : -1, i === RV.board.length ? 'on' : '') + '</span>';
  $('rvSlots').innerHTML = h;
  $('rvDeck').innerHTML = deckButtons(DECK_ORDER, used);
  rvCalc();
}
function rvCalc() {
  const n = RV.board.length;
  $('rvBig').textContent = '…'; $('rvLine').textContent = '計算中…';
  if (n === 1 || n === 2) {
    RV.req++;                                                  // 還在算的舊結果不要了
    $('rvBig').textContent = '—'; $('rvTxt').textContent = '公牌要 0 張或 3 到 5 張。'; $('rvSub').textContent = '';
    $('rvGrid').innerHTML = ''; $('rvCats').innerHTML = ''; $('rvNote').textContent = ''; $('rvLine').textContent = '公牌放 3 張（或拿掉）才會算';
    rvSave(); return;
  }
  RV.req++;
  W.send({ cmd: 'rvr', req: RV.req, board: RV.board, a: Array.from(parseRange(RV.a)), b: Array.from(parseRange(RV.b)), iters: 4000 });
  rvSave();
}
W.on('rvr', (m) => {
  if (m.req !== RV.req) return;
  RV.res = m;
  const ok = m.nA && m.nB && m.total >= 0;
  $('rvBig').innerHTML = ok ? pct(m.total) + '<small>%</small>' : '—';
  $('rvTxt').textContent = ok ? '範圍 A 對範圍 B 的勝率（B 是 ' + pct(1 - m.total) + '%）' : !m.nA || !m.nB ? '有一個範圍是空的（或全部跟公牌撞）' : 'A 的每一手都跟 B 的牌撞，沒辦法比';
  $('rvLine').innerHTML = ok ? 'A 勝率 <b>' + pct(m.total, 1) + '%</b>　B ' + pct(1 - m.total, 1) + '%' : esc($('rvTxt').textContent);
  $('rvSub').textContent = RV.board.length ? (RV.board.length === 5 ? '公牌已經發完，' : '剩下的公牌每一種發法都算過（' + m.boards.toLocaleString() + ' 種），') + '精確值' : '翻牌前：隨機發 ' + m.boards.toLocaleString() + ' 組公牌模擬，誤差約 ±0.5%';
  let gh = '';
  for (let g = 0; g < 169; g++) {
    const x = m.cls[g];
    if (x < 0) { gh += '<button type="button" class="cell" disabled><span>' + className(g) + '</span></button>'; continue; }
    const c = heatColor(x);
    gh += '<button type="button" class="cell heat" style="background:' + c.bg + ';color:' + c.fg + '" title="' + classTxt(g) + '：' + pct(x) + '%"><span>' + className(g) + '</span><em>' + Math.round(x * 100) + '</em></button>';
  }
  $('rvGrid').innerHTML = gh;
  $('rvNote').textContent = '數字是 A 這一格的平均勝率（%），越亮越強；暗的格子不在 A 的範圍裡。';
  // 牌型分佈（有翻牌以上才有）
  if (RV.board.length >= 3) {
    const cats = (w) => { const c = new Float64Array(CATG.length); let tot = 0; const dead = new Set(RV.board); for (let k = 0; k < NCOMBO; k++) { if (!(w[k] > 0) || dead.has(COMBO_A[k]) || dead.has(COMBO_B[k])) continue; c[handCategory(COMBO_A[k], COMBO_B[k], RV.board)] += w[k]; tot += w[k]; } return Array.from(c, (x) => (tot ? x / tot : 0)); };
    const ca = cats(parseRange(RV.a)), cb = cats(parseRange(RV.b));
    let h = '<h3 class="sth" style="margin-top:14px">在這組公牌上的牌型分佈</h3><table class="cats"><thead><tr><th>牌型</th><th class="r">A</th><th class="r">B</th></tr></thead><tbody>';
    for (let i = 0; i < CATG.length; i++) if (ca[i] > 0.001 || cb[i] > 0.001) h += '<tr title="' + esc(CATG_NOTE[i]) + '"><td>' + CATG[i] + '</td><td class="r num">' + pct(ca[i], 1) + '%</td><td class="r num">' + pct(cb[i], 1) + '%</td></tr>';
    $('rvCats').innerHTML = h + '</tbody></table>';
  } else $('rvCats').innerHTML = '';
});
function initRvr() {
  rvLoad();
  $('calcMode').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) rvMode(b.dataset.m === 'rvr'); });
  if (RV.on) rvMode(true);
  $('rvSlots').addEventListener('keydown', (e) => { const t = e.target.closest('[data-rs]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); } });
  $('rvRanges').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rv]'); if (!b) return;
    const k = b.dataset.rv;
    openRangeEditor('編輯' + RV.names[k === 'a' ? 0 : 1], RV[k], (txt) => { RV[k] = txt; renderRvr(); });
  });
  $('rvRanges').addEventListener('change', (e) => { const s = e.target.closest('select[data-rvlib]'); if (!s) return; const r = RANGE_LIB.find((x) => x.key === s.value); if (r) { RV[s.dataset.rvlib] = r.text; renderRvr(); } });
  $('rvSlots').addEventListener('click', (e) => { const t = e.target.closest('[data-rs]'); if (!t) return; const i = +t.dataset.rs; if (i < RV.board.length) { RV.board.splice(i); renderRvr(); } });
  $('rvDeck').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (!b || b.classList.contains('used') || RV.board.length >= 5) return; RV.board.push(+b.dataset.c); renderRvr(); });
  $('rvClear').addEventListener('click', () => { RV.board = []; renderRvr(); });
  $('rvSwap').addEventListener('click', () => { const t = RV.a; RV.a = RV.b; RV.b = t; renderRvr(); });
}
