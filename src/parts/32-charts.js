/* ===== 32-charts：翻牌前圖表（看、改、存） ===== */
const CH_KEY = 'dezhou-charts';
const CH = { t: '6', kind: 'rfi', pos: 'BTN', def: 'BB', og: 'BTN', edit: null, brush: 'raise', sel: -1 };
const CH_COL = { raise: '#c9462e', call: '#3f9d6a' };
const CH_KINDS = [['rfi', '開牌'], ['vsOpen', '面對加注'], ['vs3bet', '面對 3-bet'], ['vs4bet', '面對 4-bet']];
const CH_BRUSH = [['raise', '加注 100%', 1, 0], ['call', '跟注 100%', 0, 1], ['fold', '棄牌', 0, 0], ['mix', '加注、跟注各半', 0.5, 0.5], ['half', '加注 50%（其他棄牌）', 0.5, 0]];
const CH_UI_KEY = 'dezhou-charts-ui';
function chLoad() {
  try { setChartOverrides(JSON.parse(localStorage.getItem(CH_KEY) || '{}')); } catch (e) { /* 沒有 */ }
  try { const o = JSON.parse(localStorage.getItem(CH_UI_KEY) || 'null'); if (o) for (const k of ['t', 'kind', 'pos', 'def', 'og']) if (typeof o[k] === 'string') CH[k] = o[k]; } catch (e) { /* 沒有 */ }
}
function chUiSave() { try { localStorage.setItem(CH_UI_KEY, JSON.stringify({ t: CH.t, kind: CH.kind, pos: CH.pos, def: CH.def, og: CH.og })); } catch (e) { /* 忽略 */ } }
function chSave() { try { localStorage.setItem(CH_KEY, JSON.stringify(CHART_OVR)); } catch (e) { /* 忽略 */ } }
function chKey() {
  if (CH.kind === 'rfi') return CH.t + '/rfi/' + CH.pos;
  if (CH.kind === 'vsOpen') return CH.t + '/vsOpen/' + CH.def + '/' + CH.og;
  if (CH.kind === 'vs3bet') return CH.t + '/vs3bet/' + CH.og;
  return CH.t + '/vs4bet';
}
/* 這張桌型、這個情況有哪些選項 */
function chOptions() {
  const t = CH.t;
  if (CH.kind === 'rfi') return { pos: CHART_POS[t] };
  if (CH.kind === 'vsOpen') {
    const defs = t === '2' ? ['BB'] : ['BB', 'SB', 'IP'];
    if (defs.indexOf(CH.def) < 0) CH.def = defs[0];
    const ogs = OPENER_GROUPS.filter((g) => chartText(t + '/vsOpen/' + CH.def + '/' + g));
    return { defs, ogs };
  }
  if (CH.kind === 'vs3bet') return { ogs: OPENER_GROUPS.filter((g) => chartText(t + '/vs3bet/' + g)) };
  return {};
}
function chPosZh(pos) { return CH.t === '2' ? '按鈕（小盲）' : (POS_ZH[pos] || pos); }
function renderCharts() {
  $('chT').innerHTML = [['6', '6 人桌'], ['9', '9 人桌'], ['2', '單挑']].map(([k, t]) => '<button type="button" data-t="' + k + '" aria-pressed="' + (k === CH.t) + '">' + t + '</button>').join('');
  $('chK').innerHTML = CH_KINDS.map(([k, t]) => '<button type="button" data-k="' + k + '" aria-pressed="' + (k === CH.kind) + '">' + t + '</button>').join('');
  const o = chOptions();
  let h = '';
  if (o.pos) { if (o.pos.indexOf(CH.pos) < 0) CH.pos = o.pos.indexOf('BTN') >= 0 ? 'BTN' : o.pos[0]; h += '<span class="note">開牌的位置</span><div class="pills">' + o.pos.map((p) => '<button type="button" data-pos="' + p + '" aria-pressed="' + (p === CH.pos) + '">' + esc(chPosZh(p)) + '</button>').join('') + '</div>'; }
  if (o.defs) h += '<span class="note">你在</span><div class="pills">' + o.defs.map((d) => '<button type="button" data-def="' + d + '" aria-pressed="' + (d === CH.def) + '">' + esc(DEFENDER_ZH[d]) + '</button>').join('') + '</div>';
  if (o.ogs) { if (o.ogs.indexOf(CH.og) < 0) CH.og = o.ogs[o.ogs.length - 1]; h += '<span class="note">開牌的人在</span><div class="pills">' + o.ogs.map((g) => '<button type="button" data-og="' + g + '" aria-pressed="' + (g === CH.og) + '">' + esc(openerZh(CH.t, g)) + '</button>').join('') + '</div>'; }
  $('chPos').innerHTML = h;
  chUiSave();
  renderChartGrid();
}
function chCur() {
  if (CH.edit) return CH.edit;
  const R = chartRanges(chKey());
  return R ? { raise: R.raise, call: R.call } : null;
}
function renderChartGrid() {
  const key = chKey(), R = chCur();
  const title = { rfi: (CH.t === '2' ? '單挑' : CH.t + ' 人桌') + '・' + chPosZh(CH.pos) + '開牌', vsOpen: DEFENDER_ZH[CH.def] + '面對' + openerZh(CH.t, CH.og) + '開牌', vs3bet: openerZh(CH.t, CH.og) + '開牌，被再加注（3-bet）', vs4bet: '被 4-bet（再再加注）' }[CH.kind];
  $('chTitle').textContent = title + (CHART_OVR[key] ? '（你改過）' : '');
  if (!R) { $('chGrid').innerHTML = ''; $('chStat').textContent = '這張桌型沒有這個情況。'; return; }
  let gh = '';
  for (let g = 0; g < 169; g++) {
    const cs = CLASS_COMBOS[g];
    let r = 0, c = 0;
    for (const k of cs) { r += R.raise[k]; c += R.call[k]; }
    r /= cs.length; c /= cs.length;
    gh += '<button type="button" class="cell' + (g === CH.sel ? ' sel' : '') + '" data-g="' + g + '"><div class="fill">' + (r > 0.004 ? '<i style="width:' + (r * 100).toFixed(1) + '%;background:' + CH_COL.raise + '"></i>' : '') + (c > 0.004 ? '<i style="width:' + (c * 100).toFixed(1) + '%;background:' + CH_COL.call + '"></i>' : '') + '</div><span>' + className(g) + '</span></button>';
  }
  $('chGrid').innerHTML = gh;
  $('chGrid').classList.toggle('edit', !!CH.edit);
  let sr = 0, sc = 0;
  for (let k = 0; k < NCOMBO; k++) { sr += R.raise[k]; sc += R.call[k]; }
  const rw = CH.kind === 'rfi' ? '開牌加注' : CH.kind === 'vsOpen' ? '再加注（3-bet）' : CH.kind === 'vs3bet' ? '4-bet' : '全下';
  $('chLegend').innerHTML = '<span><i style="background:' + CH_COL.raise + '"></i>' + rw + '</span>' + (CH.kind !== 'rfi' ? '<span><i style="background:' + CH_COL.call + '"></i>跟注</span>' : '') + '<span>空白＝棄牌</span>';
  $('chStat').innerHTML = rw + ' <b>' + pct(sr / NCOMBO, 1) + '%</b>' + (CH.kind !== 'rfi' ? '、跟注 <b>' + pct(sc / NCOMBO, 1) + '%</b>' : '') + '（全部 1,326 種組合裡的比例）';
  renderChartCell();
  renderChartEdit();
}
function renderChartCell() {
  const g = CH.sel, R = chCur();
  if (g < 0 || !R) { $('chCell').textContent = CH.edit ? '' : '點一格看那手牌怎麼打。'; return; }
  const cs = CLASS_COMBOS[g];
  let r = 0, c = 0;
  for (const k of cs) { r += R.raise[k]; c += R.call[k]; }
  r /= cs.length; c /= cs.length;
  const rw = CH.kind === 'rfi' ? '加注' : CH.kind === 'vsOpen' ? '3-bet' : CH.kind === 'vs3bet' ? '4-bet' : '全下';
  $('chCell').innerHTML = '<b>' + classTxt(g) + '</b>：' + [r > 0.004 ? rw + ' ' + pct(r, 0) + '%' : '', c > 0.004 ? '跟注 ' + pct(c, 0) + '%' : '', 1 - r - c > 0.004 ? '棄牌 ' + pct(1 - r - c, 0) + '%' : ''].filter(Boolean).join('、');
}
function renderChartEdit() {
  const box = $('chEdit'), key = chKey();
  if (!chartText(key)) { box.innerHTML = ''; return; }
  if (!CH.edit) {
    box.innerHTML = '<div class="strow"><button class="btn sm" data-ce="edit">改這張圖</button>' + (CHART_OVR[key] ? '<button class="btn sm" data-ce="reset">回到預設</button>' : '') + '</div>';
    CH.sureReset = false;
    return;
  }
  const brushes = CH_BRUSH.filter((b) => CH.kind !== 'rfi' || b[0] === 'raise' || b[0] === 'fold' || b[0] === 'half');
  box.innerHTML = '<p class="note">選一種，再點或拖曳格子：</p><div class="brushes">' + brushes.map(([k, t, r, c]) => '<button type="button" data-cb="' + k + '" aria-pressed="' + (k === CH.brush) + '"><i class="sw" style="background:' + (r && c ? 'linear-gradient(90deg,' + CH_COL.raise + ' 50%,' + CH_COL.call + ' 50%)' : r ? CH_COL.raise : c ? CH_COL.call : '#1c2a25') + '"></i>' + esc(t) + '</button>').join('') + '</div>'
    + '<div class="strow"><button class="btn sm main" data-ce="save">存起來</button><button class="btn sm" data-ce="cancel">取消</button></div>';
}
function chPaint(g) {
  const b = CH_BRUSH.find((x) => x[0] === CH.brush), E = CH.edit;
  for (const k of CLASS_COMBOS[g]) { E.raise[k] = b[2]; E.call[k] = b[3]; }
}
function initCharts() {
  chLoad();
  const busy = () => { if (!CH.edit) return false; toast('正在改這張圖：先按「存起來」或「取消」再換。'); return true; };
  $('chT').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b || busy()) return; CH.t = b.dataset.t; renderCharts(); });
  $('chK').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b || busy()) return; CH.kind = b.dataset.k; renderCharts(); });
  $('chPos').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || busy()) return;
    if (b.dataset.pos) CH.pos = b.dataset.pos; else if (b.dataset.def) CH.def = b.dataset.def; else if (b.dataset.og) CH.og = b.dataset.og; else return;
    CH.edit = null; renderCharts();
  });
  $('chEdit').addEventListener('click', (e) => {
    const br = e.target.closest('[data-cb]');
    if (br) { CH.brush = br.dataset.cb; renderChartEdit(); return; }
    const b = e.target.closest('[data-ce]'); if (!b) return;
    const key = chKey(), c = b.dataset.ce;
    if (c === 'edit') { const R = chartRanges(key); CH.edit = { raise: Float32Array.from(R.raise), call: Float32Array.from(R.call) }; CH.brush = 'raise'; }
    else if (c === 'cancel') CH.edit = null;
    else if (c === 'reset') {
      if (!CH.sureReset) { CH.sureReset = true; b.textContent = '再按一次：丟掉你改的、回到預設'; return; }
      delete CHART_OVR[key]; setChartOverrides(CHART_OVR); chSave(); toast('回到預設的圖表了。');
    }
    else if (c === 'save') { CHART_OVR[key] = { raise: rangeText(CH.edit.raise), call: rangeText(CH.edit.call) }; setChartOverrides(CHART_OVR); chSave(); CH.edit = null; toast('存好了：牌局裡的教練和 GTO 電腦會照這張圖。'); }
    renderChartGrid();
  });
  // 點格子：看；編輯時點或拖曳塗色
  let painting = false, last = -1;
  const grid = $('chGrid');
  grid.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const g = +b.dataset.g;
    if (!CH.edit) { CH.sel = g; grid.querySelectorAll('.cell').forEach((x) => x.classList.toggle('sel', x === b)); renderChartCell(); return; }
    e.preventDefault(); painting = true; last = g; chPaint(g); renderChartGrid();
  });
  grid.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), b = el && el.closest('#chGrid [data-g]');
    if (b && +b.dataset.g !== last) { last = +b.dataset.g; chPaint(last); renderChartGrid(); }
  });
  window.addEventListener('pointerup', () => { painting = false; });
  window.addEventListener('pointercancel', () => { painting = false; });
  // 鍵盤（Enter／空白）：看那一格；編輯時塗色
  grid.addEventListener('click', (e) => {
    if (e.detail !== 0) return;                                   // 滑鼠、觸控已經在 pointerdown 處理
    const b = e.target.closest('[data-g]'); if (!b) return;
    const g = +b.dataset.g;
    if (!CH.edit) { CH.sel = g; renderChartGrid(); } else { chPaint(g); renderChartGrid(); }
    const nb = grid.querySelector('[data-g="' + g + '"]'); if (nb) nb.focus();
  });
  renderCharts();
}
