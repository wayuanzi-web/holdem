/* ===== 30-solver：求解器測試（第三步會變成完整的工作室） ===== */
const SOLV = { preset: 'river', running: false, path: [], labels: [], view: null, sel: -1, req: 0, solvedId: 0, firstPct: 0, names: ['BB', 'BTN'] };
const PRESET_TABS = [['river', '河牌'], ['turn', '轉牌'], ['turnBig', '轉牌（大樹）']];

function specText() {
  const p = PRESETS[SOLV.preset];
  return esc(p.name) + '。BB 用大盲的跟注範圍，BTN 用按鈕位的開牌範圍；底池 ' + p.pot + '、雙方各剩 ' + p.stack + '（單位：大盲）。<br>下注樹：' + esc(p.tree)
    + '。解到可剝削度低於底池的 ' + p.target + '% 就停。' + (SOLV.preset === 'turnBig' ? '<br>這棵樹比較大，手機可能要好幾分鐘。' : '');
}
function renderPresetSeg() {
  $('presetSeg').innerHTML = PRESET_TABS.map(([k, t]) => '<button type="button" data-k="' + k + '" aria-pressed="' + (k === SOLV.preset) + '">' + t + '</button>').join('');
  $('spec').innerHTML = specText();
}
function solveStart() {
  SOLV.running = true; SOLV.path = []; SOLV.labels = []; SOLV.sel = -1; SOLV.firstPct = 0;
  $('bSolve').hidden = true; $('bStop').hidden = false;
  $('prog').hidden = false; $('progTxt').textContent = '建樹中…'; $('progBar').style.width = '0'; $('progTime').textContent = '';
  W.send({ cmd: 'solve', preset: SOLV.preset });
}
W.on('solve-error', (m) => { SOLV.running = false; $('bSolve').hidden = false; $('bStop').hidden = true; $('progTxt').textContent = m.msg; });
W.on('solve-start', (m) => {
  SOLV.curId = m.id;
  $('progTxt').textContent = '樹：' + (m.stats.act[0] + m.stats.act[1] + m.stats.act[2]) + ' 個決策點，記憶體 ' + Math.max(1, Math.round(m.mem)) + ' MB；開始迭代…';
});
W.on('solve-progress', (m) => {
  if (m.id !== SOLV.curId) return;
  if (!SOLV.firstPct) SOLV.firstPct = m.pct;
  const tgt = PRESETS[SOLV.preset].target;
  const f = Math.max(0, Math.min(1, Math.log(SOLV.firstPct / m.pct) / Math.log(SOLV.firstPct / tgt)));
  $('progBar').style.width = (f * 100).toFixed(1) + '%';
  $('progTxt').textContent = '第 ' + m.t + ' 次，可剝削度 ' + fmt(m.pct, 2) + '%（目標 ' + tgt + '%）';
  $('progTime').textContent = fmt(m.ms / 1000, 1) + ' 秒';
});
W.on('solve-done', (m) => {
  if (m.id !== SOLV.curId) return;
  SOLV.running = false; SOLV.solvedId = m.id;
  $('bSolve').hidden = false; $('bStop').hidden = true;
  $('progBar').style.width = '100%';
  $('progTxt').textContent = (m.stopped ? '停在' : '完成：') + '第 ' + m.t + ' 次，可剝削度 ' + fmt(m.pct, 3) + '% 底池；EV：BB ' + fmt(m.ev[0], 2) + '、BTN ' + fmt(m.ev[1], 2);
  $('progTime').textContent = fmt(m.ms / 1000, 1) + ' 秒';
  $('sview').hidden = false;
  requestView();
});
function requestView() {
  SOLV.req++;
  $('nodeHead').innerHTML = '<p class="note">計算這個節點…</p>';
  W.send({ cmd: 'view', path: SOLV.path, req: SOLV.req });
}
W.on('view', (v) => { if (v.req !== SOLV.req || v.none) return; SOLV.view = v; renderView(); });

function renderView() {
  const v = SOLV.view, N = SOLV.names;
  // 路徑
  let cr = '<button type="button" data-step="0">開始</button>';
  SOLV.labels.forEach((t, i) => { cr += '<span>›</span><button type="button" data-step="' + (i + 1) + '">' + t + '</button>'; });
  $('crumbs').innerHTML = cr;
  $('sBoard').innerHTML = v.board.map((c) => cardHTML(c)).join('') + '<span class="note" style="margin-left:8px">底池 ' + fmt(v.pot, 1) + '，BB 剩 ' + fmt(v.stack - v.inv[0], 1) + '、BTN 剩 ' + fmt(v.stack - v.inv[1], 1) + '</span>';
  $('chancePick').hidden = true; $('gridWrap').hidden = false; $('acts').innerHTML = ''; $('sideBox').hidden = false;
  if (v.kind === 1) {                                     // 發牌
    $('nodeHead').innerHTML = '<p>' + (v.board.length === 3 ? '發轉牌' : '發河牌') + '：選一張看下一條街。</p>';
    const used = new Uint8Array(52);
    for (const c of v.board) used[c] = 1;
    $('cardPick').innerHTML = deckButtons(DECK_ORDER, used);
    $('chancePick').hidden = false; $('gridWrap').hidden = true; $('sideBox').hidden = true;
    return;
  }
  if (v.kind === 2 || v.kind === 3) {
    const last = SOLV.labels[SOLV.labels.length - 1] || '';
    $('nodeHead').innerHTML = '<p>這一手到這裡結束（' + last + '）。點上面的路徑回去。</p>';
    $('gridWrap').hidden = true; $('sideBox').hidden = true;
    return;
  }
  const p = v.p, n = v.n[p], k = v.acts.length, hands = v.hands[p], reach = v.reach[p];
  const cols = actColors(v.acts);
  // 整體頻率、EV
  let tot = 0, totC = 0, evS = 0, eqS = 0;
  const fr = new Float64Array(k);
  for (let h = 0; h < n; h++) {
    const r = reach[h]; if (!r) continue;
    tot += r;
    for (let a = 0; a < k; a++) fr[a] += r * v.strat[a * n + h];
    const w = r * v.comp[h]; totC += w; evS += w * v.ev[h]; eqS += w * v.eq[h];
  }
  $('nodeHead').innerHTML = '<p style="margin:0">輪到 <b>' + N[p] + '</b>（' + (p ? '位置內' : '位置外') + '）' + (v.facing > 0 ? '，要跟 ' + fmt(v.facing, 1) : '') + '。點一個動作往下走。</p>';
  $('acts').innerHTML = v.acts.map((a, i) => '<button type="button" data-a="' + i + '"><i class="sw" style="background:' + cols[i] + '"></i>' + esc(a.label) + '<span class="note num">' + (tot ? pct(fr[i] / tot, 0) : 0) + '%</span></button>').join('');
  $('freqTab').innerHTML = v.acts.map((a, i) => '<tr><td style="width:7.5em">' + esc(a.label) + '</td><td><div class="bar"><i style="width:' + (tot ? fr[i] / tot * 100 : 0).toFixed(1) + '%;background:' + cols[i] + '"></i></div></td><td>' + (tot ? pct(fr[i] / tot) : '0') + '%</td></tr>').join('');
  $('nodeNums').textContent = N[p] + ' 的範圍到這裡還有 ' + fmt(tot, 1) + ' 個組合；平均勝率 ' + (totC ? pct(eqS / totC) : '—') + '%，平均 EV ' + (totC ? fmt(evS / totC, 2) : '—') + '（底池 ' + fmt(v.pot, 1) + '）。';
  // 13×13 格
  const sumR = new Float64Array(169), sumA = new Float64Array(169 * k);
  for (let h = 0; h < n; h++) {
    const r = reach[h]; if (!r) continue;
    const g = CLASS_OF[hands[h]];
    sumR[g] += r;
    for (let a = 0; a < k; a++) sumA[g * k + a] += r * v.strat[a * n + h];
  }
  let gh = '';
  for (let g = 0; g < 169; g++) {
    const fill = Math.min(1, sumR[g] / classSize(g));
    let segs = '';
    if (sumR[g] > 0) for (let a = 0; a < k; a++) { const f = sumA[g * k + a] / sumR[g]; if (f > 0.001) segs += '<i style="width:' + (f * 100).toFixed(1) + '%;background:' + cols[a] + '"></i>'; }
    gh += '<button type="button" class="cell' + (g === SOLV.sel ? ' sel' : '') + '" data-g="' + g + '" aria-label="' + classTxt(g) + '"><div class="fill" style="height:' + (fill * 100).toFixed(0) + '%">' + segs + '</div><span>' + className(g) + '</span></button>';
  }
  $('grid13').innerHTML = gh;
  $('legend').innerHTML = v.acts.map((a, i) => '<span><i style="background:' + cols[i] + '"></i>' + esc(a.label) + '</span>').join('') + '<span>格子的高度＝這一格還在範圍裡的比例</span>';
  renderCell();
}
function renderCell() {
  const v = SOLV.view, g = SOLV.sel;
  if (!v || v.kind !== 0 || g < 0) { $('cellTitle').textContent = '點左邊的格子看每個組合'; $('cellBox').innerHTML = ''; return; }
  const p = v.p, n = v.n[p], k = v.acts.length, hands = v.hands[p], reach = v.reach[p], cols = actColors(v.acts);
  $('cellTitle').textContent = classTxt(g) + ' 的每個組合';
  let rows = '';
  for (let h = 0; h < n; h++) {
    if (CLASS_OF[hands[h]] !== g) continue;
    const r = reach[h];
    let bar = '';
    for (let a = 0; a < k; a++) { const f = v.strat[a * n + h]; if (f > 0.001) bar += '<i style="width:' + (f * 100).toFixed(1) + '%;background:' + cols[a] + '" title="' + esc(v.acts[a].label) + ' ' + pct(f, 0) + '%"></i>'; }
    let best = 0;
    for (let a = 1; a < k; a++) if (v.strat[a * n + h] > v.strat[best * n + h]) best = a;
    rows += '<tr' + (r < 1e-6 ? ' style="opacity:.4"' : '') + '><td>' + comboSpan(hands[h]) + '</td><td><div class="sbarh">' + bar + '</div><div class="note">' + esc(v.acts[best].label) + ' ' + pct(v.strat[best * n + h], 0) + '%</div></td><td class="r num">' + fmt(v.ev[h], 2) + '</td><td class="r num">' + pct(v.eq[h]) + '%</td><td class="r num">' + fmt(r, 2) + '</td></tr>';
  }
  $('cellBox').innerHTML = rows ? '<table class="combos"><thead><tr><th>組合</th><th>策略</th><th class="r">EV</th><th class="r">勝率</th><th class="r">權重</th></tr></thead><tbody>' + rows + '</tbody></table><p class="note">權重：這個組合打到這裡的機率（1＝一定在）。勝率是對對手現在的範圍。</p>'
    : '<p class="note">這一格不在 ' + SOLV.names[p] + ' 的範圍裡（或跟公牌撞牌）。</p>';
}

function initSolver() {
  renderPresetSeg();
  $('presetSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (!b || SOLV.running) return; SOLV.preset = b.dataset.k; renderPresetSeg(); });
  $('bSolve').addEventListener('click', solveStart);
  $('bStop').addEventListener('click', () => W.send({ cmd: 'stop' }));
  $('acts').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (!b || !SOLV.view) return;
    const a = +b.dataset.a, v = SOLV.view;
    SOLV.path.push({ a }); SOLV.labels.push(SOLV.names[v.p] + ' ' + v.acts[a].label);
    requestView();
  });
  $('cardPick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]'); if (!b || b.classList.contains('used')) return;
    const c = +b.dataset.c;
    SOLV.path.push({ c }); SOLV.labels.push((SOLV.view.board.length === 3 ? '轉牌 ' : '河牌 ') + cardSpan(c));
    requestView();
  });
  $('crumbs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-step]'); if (!b) return;
    const s = +b.dataset.step;
    SOLV.path = SOLV.path.slice(0, s); SOLV.labels = SOLV.labels.slice(0, s);
    requestView();
  });
  $('grid13').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-g]'); if (!b) return;
    SOLV.sel = +b.dataset.g;
    $('grid13').querySelectorAll('.cell').forEach((x) => x.classList.toggle('sel', x === b));
    renderCell();
  });
}
