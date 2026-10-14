/* ===== 30-studio：GTO 工作室（設定局面 → 求解 → 看結果；範圍編輯器；分享連結；從牌局帶入） ===== */
const ST_KEY = 'dezhou-studio-1', SPEED_KEY = 'dezhou-speed', MINE_KEY = 'dezhou-ranges';
const ST = {
  spot: null, treeKey: 'simple', target: 0.5, slot: 0,
  running: false, curId: 0, tag: 0, solved: null, solvedCfg: null, est: null,
  path: [], labels: [], view: null, sel: -1, req: 0, mode: 'strat', catSel: -1, catCache: new Map(),
  ro: null, roReq: 0, linePath: null, lineLabels: null, ratio: 1, firstPct: 0, autoGo: false,
  threads: 0, compress: false, locks: new Map(), lockEdit: null, round: false, resuming: false,
};
const autoThreads = () => Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1));
/* 這個局面用幾個執行緒：河牌沒有發牌點，分不開 */
function threadsFor(sp) { const n = parseCards(sp.board || '').length; const k = ST.threads || autoThreads(); return n <= 4 ? k : 1; }
const TARGETS = [[1, '快（1%）'], [0.5, '標準（0.5%）'], [0.3, '精細（0.3%）']];
const GRID_MODES = [['strat', '策略'], ['ev', 'EV'], ['eq', '勝率'], ['range', '範圍']];
const STREET3 = ['翻牌', '轉牌', '河牌'];
const unitOf = (sp) => (sp && sp.unit) || '大盲';
const deviceMB = () => {
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const dm = navigator.deviceMemory || (coarse ? 3 : 8);
  return Math.max(250, Math.min(coarse ? 700 : 1600, dm * 1024 * 0.3));
};

/* ===== 存讀 ===== */
function stSave() { try { localStorage.setItem(ST_KEY, JSON.stringify({ spot: ST.spot, treeKey: ST.treeKey, target: ST.target, threads: ST.threads })); } catch (e) { /* 忽略 */ } }
function stLoad() {
  try {
    const o = JSON.parse(localStorage.getItem(ST_KEY) || 'null');
    if (o && o.spot && o.spot.board) { ST.spot = o.spot; ST.treeKey = o.treeKey || 'custom'; ST.target = o.target || 0.5; }
    if (o && o.threads >= 0) ST.threads = o.threads;
    const r = +localStorage.getItem(SPEED_KEY);
    if (r > 0.05 && r < 50) ST.ratio = r;
  } catch (e) { /* 忽略 */ }
  if (!ST.spot) { ST.spot = presetSpot('river'); ST.treeKey = 'custom'; ST.target = ST.spot.target; }
  normTree();
  ST.slot = boardCards().length;
}
function boardCards() { return parseCards(ST.spot.board || ''); }
/* 樹要有「從公牌那條街到河牌」每一條街的設定 */
function normTree() {
  const sp = ST.spot, n = boardCards().length;
  if (n < 3 || n > 5) return;
  const tr = sp.tree || (sp.tree = treeFromPreset('simple', n));
  const def = treeFromPreset(ST.treeKey === 'custom' ? 'simple' : ST.treeKey, n);
  tr.bet = tr.bet || {}; tr.raise = tr.raise || {};
  for (let s = 0; s < 3; s++) {
    const k = STREET_KEYS[s];
    if (s < n - 3) { delete tr.bet[k]; delete tr.raise[k]; continue; }
    if (!tr.bet[k]) tr.bet[k] = def.bet[k];
    if (!tr.raise[k]) tr.raise[k] = def.raise[k];
  }
  if (!tr.cap) tr.cap = 2;
  if (tr.allin === undefined) tr.allin = 0.67;
  if (tr.addAllin === undefined) tr.addAllin = true;
}

/* ===== 設定畫面 ===== */
function stProblems() {
  const sp = ST.spot, out = [], b = boardCards();
  const slotsOk = (sp.board || '').length / 2 === b.length;
  if (b.length < 3 || !slotsOk) out.push('公牌要放 3 到 5 張（由左到右放）。');
  if (!(+sp.pot > 0)) out.push('底池要大於 0。');
  if (!(+sp.stack > 0)) out.push('剩下的籌碼要大於 0。');
  for (let p = 0; p < 2; p++) if (!rangeCombos(parseRange(sp.ranges[p]))) out.push((p ? '位置內' : '位置外') + '的範圍是空的。');
  const tr = sp.tree;
  for (const k of Object.keys(tr.bet || {})) for (let p = 0; p < 2; p++) {
    if (!tr.bet[k][p] || !tr.raise[k] || !tr.raise[k][p]) out.push('下注選項有一格看不懂。');
  }
  return out;
}
function renderSetup() {
  const sp = ST.spot;
  // 範例
  const ex = [['', '換一個範例…'], ['river', PRESETS.river.name], ['turn', PRESETS.turn.name], ['flop3bet', PRESETS.flop3bet.name + '（要幾分鐘）']];
  $('stExample').innerHTML = ex.map(([k, t]) => '<option value="' + k + '">' + esc(t) + '</option>').join('');
  renderStBoard();
  $('stPot').value = sp.pot; $('stStack').value = sp.stack; $('stUnit').textContent = '單位：' + unitOf(sp);
  renderRangeCards();
  renderTreeSetup();
  $('stTarget').innerHTML = TARGETS.map(([x, t]) => '<button type="button" data-t="' + x + '" aria-pressed="' + (x === ST.target) + '">' + t + '</button>').join('');
  const au = autoThreads();
  $('stThreads').innerHTML = '<option value="0">自動（' + au + ' 個）</option>' + [1, 2, 3, 4, 6, 8].filter((x) => x <= Math.max(au, 2) * 2).map((x) => '<option value="' + x + '">' + x + ' 個</option>').join('');
  $('stThreads').value = String(ST.threads || 0);
  $('stThreadNote').textContent = '這台裝置有 ' + (navigator.hardwareConcurrency || '?') + ' 個核心；翻牌、轉牌才分得開。';
  stEstimate();
}
function renderStBoard() {
  const b = boardCards(), used = new Uint8Array(52);
  for (const c of b) used[c] = 1;
  let h = '';
  for (let i = 0; i < 5; i++) {
    const c = i < b.length ? b[i] : -1;
    h += (i === 3 || i === 4 ? '<span class="gap"></span>' : '') + '<span role="button" tabindex="0" data-slot="' + i + '" aria-label="' + ['翻牌 1', '翻牌 2', '翻牌 3', '轉牌', '河牌'][i] + (c >= 0 ? '：' + cardTxt(c) : '：空') + '">' + cardHTML(c, i === ST.slot ? 'on' : '') + '</span>';
  }
  $('stSlots').innerHTML = h;
  $('stDeck').innerHTML = deckButtons(DECK_ORDER, used);
  const spr = (+ST.spot.stack) / Math.max(0.01, +ST.spot.pot);
  $('stSpr').innerHTML = b.length >= 3 ? '從' + STREET3[b.length - 3] + '開始。' + glossify('SPR') + ' ' + fmt(spr, 1) + '（剩下的籌碼是底池的 ' + fmt(spr, 1) + ' 倍' + (spr < 1.5 ? '，很容易全下' : spr > 6 ? '，籌碼很深' : '') + '）' : '';
}
function setBoard(arr) {
  ST.spot.board = arr.filter((c) => c >= 0).map(cardStr).join('');
  normTree(); stChanged(true);
}
function stBoardClick(i) {
  const b = boardCards();
  if (i < b.length) { b.splice(i); ST.slot = i; setBoard(b); return; }   // 拿掉這張和後面的
  ST.slot = Math.min(i, b.length);
  renderStBoard();
}
function stDeckClick(c) {
  const b = boardCards();
  if (b.indexOf(c) >= 0 || b.length >= 5) return;
  b.push(c);
  ST.slot = b.length;
  setBoard(b);
}

/* 雙方的範圍小卡 */
function miniGridHTML(w) {
  let h = '';
  for (let g = 0; g < 169; g++) {
    const cs = CLASS_COMBOS[g];
    let s = 0;
    for (const k of cs) s += w[k];
    const x = s / cs.length;
    h += '<i style="opacity:' + (x > 0 ? (0.25 + 0.75 * x).toFixed(2) : 0) + '"></i>';
  }
  return '<div class="mini13" aria-hidden="true">' + h + '</div>';
}
function rangeStat(w) {
  const dead = new Set(boardCards());
  let s = 0;
  for (let k = 0; k < NCOMBO; k++) if (!dead.has(COMBO_A[k]) && !dead.has(COMBO_B[k])) s += w[k];
  return fmt(rangeCombos(w), 0) + ' 個組合（' + pct(rangeCombos(w) / NCOMBO, 0) + '% 的起手牌）' + (dead.size ? '；跟公牌不撞的 ' + fmt(s, 0) : '');
}
function renderRangeCards() {
  const sp = ST.spot;
  const lib = '<option value="">從範圍庫選…</option>' + RANGE_LIB.map((r) => '<option value="' + r.key + '">' + esc(r.name) + '</option>').join('');
  let h = '';
  for (let p = 0; p < 2; p++) {
    const w = parseRange(sp.ranges[p]);
    h += '<div class="rcard"><div class="rchead"><b>' + (p ? '位置內（後說話）' : '位置外（先說話）') + '</b><input type="text" class="rname" data-p="' + p + '" value="' + esc(sp.names[p]) + '" maxlength="12" aria-label="名字"></div>'
      + '<button type="button" class="minibtn" data-edit="' + p + '" aria-label="編輯範圍">' + miniGridHTML(w) + '</button>'
      + '<div class="note">' + rangeStat(w) + '</div>'
      + '<div class="strow"><button class="btn sm" data-edit="' + p + '">編輯</button><select data-lib="' + p + '" aria-label="範圍庫">' + lib + '</select></div></div>';
  }
  $('stRanges').innerHTML = h;
}

/* 下注樹 */
function renderTreeSetup() {
  const sp = ST.spot, tr = sp.tree, n = boardCards().length;
  $('stTreeSeg').innerHTML = Object.keys(TREE_PRESETS).map((k) => '<button type="button" data-k="' + k + '" aria-pressed="' + (k === ST.treeKey) + '">' + TREE_PRESETS[k].name + '</button>').join('')
    + '<button type="button" data-k="custom" aria-pressed="' + (ST.treeKey === 'custom') + '" disabled>自訂</button>';
  let h = '<thead><tr><th></th><th>' + esc(sp.names[0]) + '<small>位置外</small></th><th>' + esc(sp.names[1]) + '<small>位置內</small></th></tr></thead><tbody>';
  if (n >= 3 && n <= 5) for (let s = n - 3; s < 3; s++) {
    const k = STREET_KEYS[s];
    for (const kind of ['bet', 'raise']) {
      h += '<tr><th>' + STREET3[s] + (kind === 'bet' ? '下注' : '加注') + '</th>';
      for (let p = 0; p < 2; p++) h += '<td><input type="text" data-k="' + k + '" data-kind="' + kind + '" data-p="' + p + '" value="' + esc(sizesText(tr[kind][k][p])) + '" spellcheck="false" aria-label="' + STREET3[s] + (kind === 'bet' ? '下注' : '加注') + '尺寸"></td>';
      h += '</tr>';
    }
  }
  $('stTree').innerHTML = h + '</tbody>';
  $('stCap').value = String(tr.cap);
  $('stAddAllin').checked = tr.addAllin !== false;
}

/* 估計：決策點、記憶體、時間 */
let estTimer = 0;
function stChanged(full) {
  stSave();
  if (full) { renderStBoard(); renderRangeCards(); renderTreeSetup(); }
  clearTimeout(estTimer); estTimer = setTimeout(stEstimate, 120);
}
function stEstimate() {
  const probs = stProblems(), box = $('stEst');
  ST.est = null;
  if (probs.length) { box.innerHTML = '<p class="bad">' + probs.map(esc).join('<br>') + '</p>'; $('bSolve').disabled = true; return; }
  let est;
  try { est = estimateSolve(spotCfg(ST.spot)); } catch (e) { box.innerHTML = '<p class="bad">' + esc(e.message) + '</p>'; $('bSolve').disabled = true; return; }
  ST.est = est;
  const maxMB = deviceMB();
  ST.compress = est.mb > maxMB * 0.6;                       // 記憶體吃緊才壓縮（壓縮大約慢 40%）
  const mb = ST.compress ? est.mb / 2 : est.mb, k = threadsFor(ST.spot);
  const tm = estimateTime(est, ST.target, k, ST.compress), sec = tm.ms * ST.ratio / 1000;
  const nAct = est.stats.act[0] + est.stats.act[1] + est.stats.act[2];
  const tooBig = mb > maxMB;
  const tStr = sec < 60 ? Math.max(1, Math.round(sec)) + ' 秒' : sec < 3600 ? Math.round(sec / 60) + ' 分鐘' : (sec / 3600).toFixed(1) + ' 小時';
  let h = '<p>' + glossify('下注樹') + '：' + nAct + ' 個決策點；手牌 ' + est.n[0] + '／' + est.n[1] + ' 個組合；記憶體約 ' + Math.max(1, Math.round(mb)) + ' MB' + (ST.compress ? '（壓縮儲存）' : '') + '。'
    + (est.iso ? '花色對稱：' + est.iso.split('/')[1] + ' 張' + (boardCards().length === 3 ? '轉牌' : '河牌') + '只要算 ' + est.iso.split('/')[0] + ' 張。' : '') + '</p>';
  if (tooBig) h += '<p class="bad">太大了：這台裝置最多用 ' + Math.round(maxMB) + ' MB。請減少下注尺寸、縮小範圍（範圍編輯器的「去掉權重低於 20% 的牌」），或多放一張公牌（從轉牌開始）。</p>';
  else h += '<p>用 ' + k + ' 個執行緒，這台裝置大約要 <b>' + tStr + '</b>' + (ST.ratio === 1 ? '（第一次是估的，跑過一次就會照這台裝置的速度算）' : '') + '。' + (sec > 900 ? '<span class="bad">很久：建議用「簡單」的下注選項、縮小範圍、或從轉牌開始。</span>' : '') + '</p>';
  if (ST.running && typeof BT !== 'undefined' && BT.running) h += '<p class="bad">「③ 多翻牌報告」正在算：到 ③ 按「停下來」，或等它算完，才能在這裡求解。</p>';
  box.innerHTML = h;
  $('bSolve').disabled = tooBig || ST.running;
}

/* ===== 求解 ===== */
function solveStart() {
  if (ST.running || !ST.est) return;
  if (BENCH.running) { toast('效能測試還在跑：等它跑完再求解。'); return; }
  const cfg = spotCfg(ST.spot, { maxMB: deviceMB(), target: ST.target, maxIters: 2000, compress: ST.compress });
  let k = threadsFor(ST.spot);
  if (k >= 2) k = W.helpers(k); else W.helpers(0);
  ST.running = true; ST.firstPct = 0; ST.tag++; ST.resuming = false;
  ST.pending = { spot: JSON.parse(JSON.stringify(ST.spot)), cfg, est: ST.est, k, compress: ST.compress };
  $('bSolve').hidden = true; $('bStop').hidden = false; $('bSolve').disabled = true;
  $('prog').hidden = false; $('progTxt').textContent = '建樹中…'; $('progBar').style.width = '0'; $('progTime').textContent = '';
  W.send({ cmd: 'solve', cfg, tag: ST.tag, threads: k });
}
/* 鎖定之後接著算（從現在的結果繼續） */
function solveResume() {
  if (ST.running || !ST.solved) return;
  ST.running = true; ST.firstPct = 0; ST.tag++; ST.resuming = true;
  $('bSolve').disabled = true; $('bStop').hidden = false;
  $('prog').hidden = false; $('progTxt').textContent = '照鎖定的策略重新算…'; $('progBar').style.width = '0'; $('progTime').textContent = '';
  W.send({ cmd: 'solve', resume: true, target: ST.target, maxIters: 1500, tag: ST.tag });
}
function solveEnded() { ST.running = false; $('bSolve').hidden = false; $('bStop').hidden = true; if (!$('stSetup').hidden) stEstimate(); else $('bSolve').disabled = false; }
W.on('solve-error', (m) => { if (m.tag !== ST.tag) return; solveEnded(); $('progTxt').textContent = m.msg; });
W.on('solve-start', (m) => {
  if (m.tag !== ST.tag) return;
  ST.curId = m.id;
  if (!m.resumed) $('progTxt').textContent = '樹：' + (m.stats.act[0] + m.stats.act[1] + m.stats.act[2]) + ' 個決策點，記憶體 ' + Math.max(1, Math.round(m.mem)) + ' MB，' + m.threads + ' 個執行緒；開始算…';
});
W.on('solve-progress', (m) => {
  if (m.tag !== ST.tag) return;
  if (!ST.firstPct) ST.firstPct = Math.max(m.pct, ST.target * 1.01);
  const f = Math.max(0, Math.min(1, Math.log(ST.firstPct / m.pct) / Math.log(ST.firstPct / ST.target)));
  $('progBar').style.width = (f * 100).toFixed(1) + '%';
  $('progTxt').innerHTML = '第 ' + m.t + ' 次，' + glossify('可剝削度') + ' ' + fmt(m.pct, 2) + '%（目標 ' + ST.target + '%）';
  const per = m.ms / Math.max(1, m.t - (m.t0 || 0)), left = f > 0.05 ? (m.ms / f - m.ms) : null;
  $('progTime').textContent = fmt(m.ms / 1000, 0) + ' 秒' + (left !== null && f < 0.98 ? '，大約還要 ' + Math.max(1, Math.round(left / 1000)) + ' 秒' : '');
  ST.lastPer = per;
});
W.on('solve-done', (m) => {
  if (m.tag !== ST.tag) return;
  solveEnded();
  $('progBar').style.width = '100%';
  $('progTxt').innerHTML = (m.stopped ? '停在' : '算好了：') + '算了 ' + m.t + ' 次，' + glossify('可剝削度') + ' ' + fmt(m.pct, 2) + '% 底池' + (m.threads > 1 ? '（' + m.threads + ' 個執行緒）' : '');
  $('progTime').textContent = fmt(m.ms / 1000, 1) + ' 秒';
  if (ST.resuming) {                                          // 鎖定後重新算：留在原來的節點
    ST.resuming = false;
    ST.solvedInfo = { t: m.t, pct: m.pct, ev: m.ev, stopped: m.stopped };
    stShow('result'); requestView();
    return;
  }
  // 照這次的速度修正之後的估計
  const P = ST.pending;
  if (P && m.t >= 10 && P.est && P.est.work > 1e6) {         // 小的樹時間都花在固定開銷上，拿來推估大樹不準
    const pred = (P.est.work * SPEED.k + SPEED.c) * (P.compress ? 1.4 : 1) / (P.k >= 2 ? P.k * 0.8 : 1), act = m.ms / m.t / 1.1;
    const r = act / pred;
    if (r > 0.05 && r < 50) { ST.ratio = ST.ratio === 1 ? r : ST.ratio * 0.5 + r * 0.5; try { localStorage.setItem(SPEED_KEY, String(ST.ratio)); } catch (e) { /* 忽略 */ } }
  }
  ST.solved = P.spot; ST.solvedCfg = P.cfg; ST.solvedInfo = { t: m.t, pct: m.pct, ev: m.ev, stopped: m.stopped };
  ST.path = []; ST.labels = []; ST.sel = -1; ST.catSel = -1; ST.ro = null; ST.locks = new Map(); ST.lockEdit = null;
  buildLine();
  if (!$('stBatch').hidden) { $('stTabs').querySelector('[data-v="result"]').disabled = false; toast('「① 設定局面」算好了，到「② 看結果」看。'); }   // 正在看報告：不要跳走
  else stShow('result');
  requestView();
});

/* ===== 結果 ===== */
function stShow(v) {
  $('stSetup').hidden = v !== 'setup'; $('stResult').hidden = v !== 'result'; $('stBatch').hidden = v !== 'batch';
  $('stTabs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  $('stTabs').querySelector('[data-v="result"]').disabled = !ST.solved;
  $('stIntro').hidden = v !== 'setup';
  const sp = v === 'result' && ST.solved ? ST.solved : ST.spot;
  $('stSub').innerHTML = v === 'batch' ? '多翻牌報告' : esc(sp.title || '') + (v === 'result' && ST.solvedInfo ? '　精度：' + glossify('可剝削度') + ' ' + fmt(ST.solvedInfo.pct, 2) + '% 底池' : '');
  if (v === 'setup') renderSetup();
  if (v === 'batch') renderBatch();
}
function requestView() {
  ST.req++;
  $('nodeHead').innerHTML = '<p class="note">計算這個節點…</p>';
  W.send({ cmd: 'view', path: ST.path, req: ST.req });
}
W.on('view', (v) => { if (v.req !== ST.req || v.none) return; ST.view = v; renderView(); });
W.on('runouts', (m) => { if (m.req !== ST.roReq || m.none) return; ST.ro = m.data; renderRunouts(); });
W.on('error', (m) => { if (m.of === 'view' && m.req === ST.req) $('nodeHead').innerHTML = '<p class="bad">' + esc(m.msg) + '</p>'; });

function goPath(path, labels) { ST.path = path; ST.labels = labels; ST.ro = null; requestView(); }
function catsFor(board) {
  const key = board.join(',');
  let c = ST.catCache.get(key);
  if (!c) {
    c = new Int8Array(NCOMBO).fill(-1);
    const dead = new Set(board);
    for (let k = 0; k < NCOMBO; k++) if (!dead.has(COMBO_A[k]) && !dead.has(COMBO_B[k])) c[k] = handCategory(COMBO_A[k], COMBO_B[k], board);
    ST.catCache.set(key, c);
  }
  return c;
}
function heroCombo() {
  const sp = ST.solved;
  if (!sp || !sp.hero) return -1;
  const c = parseCards(sp.hero.cards);
  return c.length === 2 ? comboOf(c[0], c[1]) : -1;
}
/* 顯示用的策略（每手牌 k 個比例） */
function dispStrat(v) {
  if (ST.lockEdit && ST.lockEdit.id === v.id) return ST.lockEdit.strat;
  if (!ST.round) return v.strat;
  const k = v.acts.length, n = v.n[v.p], out = new Float32Array(k * n);
  for (let h = 0; h < n; h++) {
    let sum = 0, best = 0;
    for (let a = 0; a < k; a++) { const x = Math.round(v.strat[a * n + h] * 4) / 4; out[a * n + h] = x; sum += x; if (v.strat[a * n + h] > v.strat[best * n + h]) best = a; }
    if (sum <= 0) { out[best * n + h] = 1; sum = 1; }
    for (let a = 0; a < k; a++) out[a * n + h] /= sum;
  }
  return out;
}
function renderView() {
  const v = ST.view, N = ST.solved.names;
  let cr = '<button type="button" data-step="0">開始</button>';
  ST.labels.forEach((t, i) => { cr += '<span>›</span><button type="button" data-step="' + (i + 1) + '">' + t + '</button>'; });
  $('crumbs').innerHTML = cr;
  $('sBoard').innerHTML = v.board.map((c) => cardHTML(c)).join('') + '<span class="note" style="margin-left:8px">底池 ' + fmt(v.pot, 1) + '；' + esc(N[0]) + ' 剩 ' + fmt(v.stack - v.inv[0], 1) + '、' + esc(N[1]) + ' 剩 ' + fmt(v.stack - v.inv[1], 1) + '</span>';
  $('chancePick').hidden = true; $('gridWrap').hidden = false; $('acts').innerHTML = ''; $('sideBox').hidden = false; $('heroBox').innerHTML = '';
  $('sview').classList.toggle('solo', v.kind !== 0);
  renderLine();
  if (v.kind === 1) {                                     // 發牌
    $('nodeHead').innerHTML = '<p>' + (v.board.length === 3 ? '發轉牌' : '發河牌') + '：每一張可能的牌都算好了。點一張牌，看下一條街怎麼打。</p>';
    $('chancePick').hidden = false; $('gridWrap').hidden = true; $('sideBox').hidden = true;
    $('roHead').textContent = '計算每一張牌…';
    $('roGrid').innerHTML = ''; $('roBest').innerHTML = '';
    ST.roReq++;
    W.send({ cmd: 'runouts', path: ST.path, req: ST.roReq });
    return;
  }
  if (v.kind === 2 || v.kind === 3) {
    const last = ST.labels[ST.labels.length - 1] || '';
    $('nodeHead').innerHTML = '<p>這一手到這裡結束（' + last + '）' + (v.kind === 3 ? '，攤牌比大小' : '') + '。點上面的路徑回去。</p>';
    $('gridWrap').hidden = true; $('sideBox').hidden = true;
    return;
  }
  const p = v.p, n = v.n[p], k = v.acts.length, hands = v.hands[p], reach = v.reach[p];
  const cols = actColors(v.acts), ds = v.ds = dispStrat(v);
  let tot = 0, totC = 0, evS = 0, eqS = 0;
  const fr = new Float64Array(k);
  for (let h = 0; h < n; h++) {
    const r = reach[h]; if (!r) continue;
    tot += r;
    for (let a = 0; a < k; a++) fr[a] += r * ds[a * n + h];
    const w = r * v.comp[h]; totC += w; evS += w * (v.ev[h] + v.inv[p]); eqS += w * v.eq[h];
  }
  $('nodeHead').innerHTML = '<p style="margin:0">輪到 <b>' + esc(N[p]) + '</b>（' + glossify(p ? '位置內' : '位置外') + '）' + (v.facing > 0 ? '，要跟 ' + fmt(v.facing, 1) : '') + '。下面的按鈕是 GTO 用各動作的頻率；點一個往下走。</p>';
  $('acts').innerHTML = v.acts.map((a, i) => '<button type="button" data-a="' + i + '"><i class="sw" style="background:' + cols[i] + '"></i>' + esc(a.label) + '<span class="note num">' + (tot ? pct(fr[i] / tot, 0) : 0) + '%</span></button>').join('');
  $('freqTab').innerHTML = v.acts.map((a, i) => '<tr><td style="width:7.5em">' + esc(a.label) + '</td><td><div class="bar"><i style="width:' + (tot ? fr[i] / tot * 100 : 0).toFixed(1) + '%;background:' + cols[i] + '"></i></div></td><td>' + (tot ? pct(fr[i] / tot) : '0') + '%</td></tr>').join('');
  $('nodeNums').innerHTML = esc(N[p]) + ' 的範圍到這裡還有 ' + fmt(tot, 1) + ' 個組合；平均勝率 ' + (totC ? pct(eqS / totC) : '—') + '%，平均 ' + glossify('EV') + ' ' + (totC ? fmt(evS / totC, 2) : '—') + '（底池 ' + fmt(v.pot, 1) + '）。';
  $('gridMode').innerHTML = GRID_MODES.map(([m, t]) => '<button type="button" data-m="' + m + '" aria-pressed="' + (m === ST.mode) + '">' + t + '</button>').join('');
  renderHero();
  renderLock();
  renderGrid();
  renderCats();
  renderCell();
  renderRangeOut();
}
/* 13×13 格：策略（顏色條）、EV、勝率、範圍 */
function renderGrid() {
  const v = ST.view, p = v.p, n = v.n[p], k = v.acts.length, hands = v.hands[p], reach = v.reach[p], cols = actColors(v.acts);
  const sumR = new Float64Array(169), sumA = new Float64Array(169 * k), sumW = new Float64Array(169), sumEv = new Float64Array(169), sumEq = new Float64Array(169), inCat = new Uint8Array(169);
  const cats = catsFor(v.board), hc = heroCombo(), hcCell = hc >= 0 && ST.solved.hero.p === p ? CLASS_OF[hc] : -1;
  for (let h = 0; h < n; h++) {
    const r = reach[h]; if (!r) continue;
    const g = CLASS_OF[hands[h]];
    sumR[g] += r;
    for (let a = 0; a < k; a++) sumA[g * k + a] += r * v.ds[a * n + h];
    const w = r * v.comp[h]; sumW[g] += w; sumEv[g] += w * (v.ev[h] + v.inv[p]); sumEq[g] += w * v.eq[h];
    if (ST.catSel >= 0 && cats[hands[h]] === ST.catSel) inCat[g] = 1;
  }
  let lo = Infinity, hi = -Infinity;
  if (ST.mode === 'ev') for (let g = 0; g < 169; g++) if (sumW[g] > 0) { const x = sumEv[g] / sumW[g]; if (x < lo) lo = x; if (x > hi) hi = x; }
  let gh = '';
  for (let g = 0; g < 169; g++) {
    const fill = Math.min(1, sumR[g] / classSize(g));
    let inner = '', style = '', val = '';
    if (sumR[g] > 0) {
      if (ST.mode === 'strat') {
        let segs = '';
        for (let a = 0; a < k; a++) { const f = sumA[g * k + a] / sumR[g]; if (f > 0.001) segs += '<i style="width:' + (f * 100).toFixed(1) + '%;background:' + cols[a] + '"></i>'; }
        inner = '<div class="fill" style="height:' + (fill * 100).toFixed(0) + '%">' + segs + '</div>';
      } else if (ST.mode === 'range') {
        inner = '<div class="fill" style="height:' + (fill * 100).toFixed(0) + '%"><i style="width:100%;background:#4f9a7a"></i></div>';
      } else if (sumW[g] > 0) {
        const x = ST.mode === 'ev' ? sumEv[g] / sumW[g] : sumEq[g] / sumW[g];
        const t = ST.mode === 'ev' ? (hi > lo ? (x - lo) / (hi - lo) : 0.5) : x;
        const c = heatColor(t);
        style = 'background:' + c.bg + ';color:' + c.fg;
        val = '<em>' + (ST.mode === 'ev' ? fmt(x, Math.abs(x) < 10 ? 1 : 0) : Math.round(x * 100)) + '</em>';
      }
    }
    const cls = 'cell' + (g === ST.sel ? ' sel' : '') + (ST.catSel >= 0 ? (inCat[g] ? ' cf' : ' dim') : '') + (g === hcCell ? ' hero' : '') + (ST.mode === 'ev' || ST.mode === 'eq' ? ' heat' : '');
    gh += '<button type="button" class="' + cls + '" data-g="' + g + '" style="' + style + '" aria-label="' + classTxt(g) + '">' + inner + '<span>' + className(g) + '</span>' + val + '</button>';
  }
  $('grid13').innerHTML = gh;
  $('grid13').classList.toggle('lockedit', !!(ST.lockEdit && ST.lockEdit.id === v.id));
  const hint = { strat: '顏色＝各動作的比例；格子的高度＝這一格還在範圍裡的比例', ev: '越亮 EV 越高（數字是平均 EV，單位' + unitOf(ST.solved) + '）', eq: '越亮勝率越高（數字是對對手現在範圍的勝率 %）', range: '高度＝這一格還有多少組合打到這裡' }[ST.mode];
  $('gridHint').innerHTML = hint + (hcCell >= 0 ? '；外框是你的牌' : '');
  $('legend').innerHTML = ST.mode === 'strat' ? v.acts.map((a, i) => '<span><i style="background:' + cols[i] + '"></i>' + esc(a.label) + '</span>').join('') : '';
}
/* 牌型分類 */
function renderCats() {
  const v = ST.view, p = v.p, n = v.n[p], k = v.acts.length, hands = v.hands[p], reach = v.reach[p], cols = actColors(v.acts);
  const cats = catsFor(v.board), C = CATG.length;
  const R = new Float64Array(C), A = new Float64Array(C * k), Wt = new Float64Array(C), EV = new Float64Array(C), EQ = new Float64Array(C);
  let tot = 0;
  for (let h = 0; h < n; h++) {
    const r = reach[h]; if (!r) continue;
    const c = cats[hands[h]]; if (c < 0) continue;
    tot += r; R[c] += r;
    for (let a = 0; a < k; a++) A[c * k + a] += r * v.ds[a * n + h];
    const w = r * v.comp[h]; Wt[c] += w; EV[c] += w * (v.ev[h] + v.inv[p]); EQ[c] += w * v.eq[h];
  }
  let h = '<thead><tr><th>牌型</th><th class="r">組合</th><th class="r">勝率</th><th>怎麼打</th><th class="r">EV</th></tr></thead><tbody>';
  for (let c = 0; c < C; c++) {
    if (R[c] < 1e-3) continue;
    let bar = '';
    for (let a = 0; a < k; a++) { const f = A[c * k + a] / R[c]; if (f > 0.005) bar += '<i style="width:' + (f * 100).toFixed(1) + '%;background:' + cols[a] + '" title="' + esc(v.acts[a].label) + ' ' + pct(f, 0) + '%"></i>'; }
    h += '<tr data-c="' + c + '" class="' + (c === ST.catSel ? 'on' : '') + '" title="' + esc(CATG_NOTE[c]) + '"><td>' + CATG[c] + '</td><td class="r num">' + fmt(R[c], 1) + '<small>' + pct(R[c] / tot, 0) + '%</small></td><td class="r num">' + (Wt[c] ? pct(EQ[c] / Wt[c], 0) + '%' : '—') + '</td><td><div class="sbarh">' + bar + '</div></td><td class="r num">' + (Wt[c] ? fmt(EV[c] / Wt[c], 1) : '—') + '</td></tr>';
  }
  $('catTab2').innerHTML = h + '</tbody>';
}
function renderCell() {
  const v = ST.view, g = ST.sel;
  if (!v || v.kind !== 0 || g < 0) { $('cellTitle').textContent = '點左邊的格子看每個組合'; $('cellBox').innerHTML = ''; return; }
  const p = v.p, n = v.n[p], k = v.acts.length, hands = v.hands[p], reach = v.reach[p], cols = actColors(v.acts), cats = catsFor(v.board), hc = heroCombo();
  $('cellTitle').textContent = classTxt(g) + ' 的每個組合';
  let rows = '';
  for (let h = 0; h < n; h++) {
    if (CLASS_OF[hands[h]] !== g) continue;
    const r = reach[h];
    let bar = '';
    for (let a = 0; a < k; a++) { const f = v.ds[a * n + h]; if (f > 0.001) bar += '<i style="width:' + (f * 100).toFixed(1) + '%;background:' + cols[a] + '" title="' + esc(v.acts[a].label) + ' ' + pct(f, 0) + '%"></i>'; }
    let best = 0;
    for (let a = 1; a < k; a++) if (v.ds[a * n + h] > v.ds[best * n + h]) best = a;
    rows += '<tr class="' + (r < 1e-6 ? 'gone' : '') + (hands[h] === hc && ST.solved.hero.p === p ? ' heror' : '') + '"><td>' + comboSpan(hands[h]) + '<div class="note">' + (cats[hands[h]] >= 0 ? CATG[cats[hands[h]]] : '') + '</div></td><td><div class="sbarh">' + bar + '</div><div class="note">' + esc(v.acts[best].label) + ' ' + pct(v.ds[best * n + h], 0) + '%</div></td><td class="r num">' + fmt(v.ev[h] + v.inv[p], 2) + '</td><td class="r num">' + pct(v.eq[h]) + '%</td><td class="r num">' + fmt(r, 2) + '</td></tr>';
  }
  $('cellBox').innerHTML = rows ? '<table class="combos"><thead><tr><th>組合</th><th>策略</th><th class="r">EV</th><th class="r">勝率</th><th class="r">權重</th></tr></thead><tbody>' + rows + '</tbody></table><p class="note">' + glossify('權重') + '：這個組合打到這裡的機率（1＝一定在）。勝率是對對手現在的範圍；EV 是從現在算、平均拿回多少（單位' + unitOf(ST.solved) + '，底池裡已經有的錢也算）。</p>'
    : '<p class="note">這一格不在 ' + esc(ST.solved.names[p]) + ' 的範圍裡（或跟公牌撞牌）。</p>';
}
/* 你的牌（從牌局帶入時） */
function renderHero() {
  const v = ST.view, sp = ST.solved, hc = heroCombo();
  if (hc < 0 || v.kind !== 0) { $('heroBox').innerHTML = ''; return; }
  const hp = sp.hero.p, N = sp.names;
  const hi = v.hands[hp].indexOf(hc);
  const cats = catsFor(v.board);
  const hand = comboSpan(hc) + '（' + (cats[hc] >= 0 ? CATG[cats[hc]] : '') + '）';
  if (hi < 0 || !(v.reach[hp][hi] > 1e-9)) { $('heroBox').innerHTML = '<div class="herob"><b>你的牌 ' + hand + '</b>：照 GTO，你的牌不會走到這裡。</div>'; return; }
  let h = '<div class="herob">';
  if (v.p === hp) {
    const n = v.n[hp], k = v.acts.length, cols = actColors(v.acts);
    let best = 0;
    for (let a = 1; a < k; a++) if (v.evA[a * n + hi] > v.evA[best * n + hi]) best = a;
    h += '<b>你的牌 ' + hand + '</b>：GTO 這樣打 ';
    h += v.acts.map((a, i) => ({ a, i, f: v.strat[i * n + hi] })).filter((x) => x.f > 0.005).sort((x, y) => y.f - x.f).map((x) => '<span class="hchip"><i class="sw" style="background:' + cols[x.i] + '"></i>' + esc(x.a.label) + ' ' + pct(x.f, 0) + '%</span>').join(' ');
    h += '<div class="note">各動作的 EV：' + v.acts.map((a, i) => esc(a.label) + ' ' + fmt(v.evA[i * n + hi] + v.inv[hp], 2)).join('、') + '（從現在算，平均拿回多少）</div>';
    // 照實際打法走到這裡：比較你實際的動作
    const li = lineIndexHere();
    if (li >= 0 && ST.solved.line[li].p === hp) {
      const a = ST.linePath[li].a, f = v.strat[a * n + hi], loss = v.evA[best * n + hi] - v.evA[a * n + hi];
      const mark = f >= 0.25 ? 'good' : loss <= 0.03 * v.pot ? 'ok' : 'bad';
      const txt = mark === 'good' ? 'GTO 也常這樣打' : mark === 'ok' ? 'GTO 很少這樣打，但 EV 幾乎一樣，差不多' : 'GTO 幾乎不這樣打，平均少賺 ' + fmt(loss, 2) + ' ' + unitOf(ST.solved);
      h += '<div class="grade ' + mark + '"><span class="mk">' + { good: '✓', ok: '△', bad: '✗' }[mark] + '</span><div>你在牌局裡：<b>' + esc(v.acts[a].label) + '</b>。GTO 用這個動作的比例 ' + pct(f, 0) + '%；' + txt + '。</div></div>';
    }
  } else {
    const o = 1 - v.p;
    h += '<b>你的牌 ' + hand + '</b>：輪到 ' + esc(N[v.p]) + '。你對他現在範圍的勝率 ' + (v.eqO ? pct(v.eqO[hi]) : '—') + '%。';
    void o;
  }
  $('heroBox').innerHTML = h + '</div>';
}
/* ===== 實際的打法（從牌局帶入） ===== */
function buildLine() {
  ST.linePath = null; ST.lineLabels = null;
  const sp = ST.solved;
  if (!sp || !sp.line || !sp.line.length) return;
  const tree = buildTree(ST.solvedCfg);
  let nd = tree.root;
  const path = [], labels = [];
  for (const st of sp.line) {
    if (nd.kind === N_CHANCE) {
      if (st.c === undefined) break;
      const c = parseCard(st.c);
      path.push({ c }); labels.push((nd.street === 0 ? '轉牌 ' : '河牌 ') + cardSpan(c));
      nd = nd.kids[0]; continue;
    }
    if (nd.kind !== N_ACT || st.c !== undefined || st.p !== nd.p) break;
    const a = matchAct(nd.acts, st);
    if (a < 0) break;
    path.push({ a }); labels.push(esc(sp.names[nd.p]) + ' ' + esc(actLabel(nd.acts[a])));
    nd = nd.kids[a];
  }
  if (path.length) { ST.linePath = path; ST.lineLabels = labels; }
}
function samePrefix(a, b, n) { for (let i = 0; i < n; i++) { if (!a[i] || !b[i] || a[i].a !== b[i].a || a[i].c !== b[i].c) return false; } return true; }
/* 現在的位置是不是「實際打法」的第幾步之前（是的話回傳那一步的編號） */
function lineIndexHere() {
  if (!ST.linePath) return -1;
  const L = ST.path.length;
  return L < ST.linePath.length && samePrefix(ST.path, ST.linePath, L) ? L : -1;
}
function renderLine() {
  const box = $('stLineBox');
  if (!ST.linePath) { box.hidden = true; return; }
  box.hidden = false;
  const L = ST.path.length, on = samePrefix(ST.path, ST.linePath, Math.min(L, ST.linePath.length)) && L <= ST.linePath.length;
  const chips = ST.lineLabels.map((t, i) => '<button type="button" data-li="' + i + '" class="lchip' + (on && i < L ? ' done' : '') + (on && i === L ? ' cur' : '') + '">' + t + '</button>').join('<span class="arrow">›</span>');
  const sp = ST.solved;
  box.innerHTML = '<div class="strow"><b>這一手實際的打法</b><span class="note">你拿 ' + parseCards(sp.hero.cards).map(cardSpan).join('') + '，坐' + esc(sp.hero.pos || sp.names[sp.hero.p]) + '。點一步，看那時候 GTO 怎麼打。</span></div><div class="lchips">' + chips + '</div>'
    + '<div class="strow"><button class="btn sm main" id="lNext"' + (on && L < ST.linePath.length ? '' : ' disabled') + '>照實際走下一步 ▶</button><button class="btn sm" id="lHome">回到開始</button></div>';
}

/* ===== 下一張牌報告 ===== */
function renderRunouts() {
  const R = ST.ro, v = ST.view, N = ST.solved.names;
  if (!R || !v || v.kind !== 1) return;
  const cols = actColors(R.acts);
  $('roHead').innerHTML = (R.p >= 0 ? '色條：下一條街 <b>' + esc(N[R.p]) + '</b> 先說話的策略（' + R.acts.map((a, i) => '<span class="lg"><i style="background:' + cols[i] + '"></i>' + esc(a.label) + '</span>').join(' ') + '）。' : '') + '數字：' + esc(N[0]) + ' 的平均勝率。點一張牌走過去。';
  const byC = new Map(R.cards.map((x) => [x.c, x]));
  let h = '';
  for (const c of DECK_ORDER) {
    const x = byC.get(c);
    if (!x) { h += '<span class="rot used"></span>'; continue; }
    let bar = '';
    if (x.freq) x.freq.forEach((f, i) => { if (f > 0.005) bar += '<i style="width:' + (f * 100).toFixed(1) + '%;background:' + cols[i] + '"></i>'; });
    h += '<button type="button" class="rot" data-c="' + c + '" title="' + cardTxt(c) + '：' + esc(N[0]) + ' 勝率 ' + pct(x.eq0) + '%、EV ' + fmt(x.ev[0] + v.inv[0], 1) + '；' + esc(N[1]) + ' EV ' + fmt(x.ev[1] + v.inv[1], 1) + '">' + cardSpan(c) + '<div class="sbarh">' + bar + '</div><span class="num">' + pct(x.eq0, 0) + '</span></button>';
  }
  $('roGrid').innerHTML = h;
  const s = R.cards.slice().sort((a, b) => b.eq0 - a.eq0);
  const avg = R.cards.reduce((t, x) => t + x.eq0, 0) / R.cards.length;
  $('roBest').innerHTML = '<p>' + esc(N[0]) + ' 的平均勝率 ' + pct(avg) + '%。對他最好的牌：' + s.slice(0, 5).map((x) => cardSpan(x.c) + ' ' + pct(x.eq0, 0) + '%').join('、')
    + '；最差的：' + s.slice(-5).reverse().map((x) => cardSpan(x.c) + ' ' + pct(x.eq0, 0) + '%').join('、') + '。</p>';
}

/* ===== 範圍編輯器 ===== */
const RM = { p: 0, w: null, brush: 1, painting: false, val: 1, last: -1 };
function mineList() { try { return JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); } catch (e) { return []; } }
function openRange(p) {
  openRangeEditor('編輯範圍：' + ST.spot.names[p] + '（' + (p ? '位置內' : '位置外') + '）', ST.spot.ranges[p], (txt) => { ST.spot.ranges[p] = txt; stChanged(true); });
}
/* 範圍編輯器（工作室、範圍對範圍共用）：onOk(文字) */
function openRangeEditor(title, text, onOk) {
  RM.onOk = onOk; RM.w = parseRange(text);
  $('rmTitle').textContent = title;
  $('rmLib').innerHTML = '<option value="">選一個…</option>' + RANGE_LIB.map((r) => '<option value="' + r.key + '">' + esc(r.name) + '</option>').join('');
  $('rmBrush').innerHTML = [1, 0.75, 0.5, 0.25].map((x) => '<button type="button" data-b="' + x + '" aria-pressed="' + (x === RM.brush) + '">' + (x * 100) + '%</button>').join('');
  renderMine();
  rmRender(true);
  const pc = Math.round(rangeCombos(RM.w) / NCOMBO * 100);
  $('rmTop').value = pc; $('rmTopTxt').textContent = pc + '%';
  $('rangeModal').hidden = false;
}
function renderMine() {
  const L = mineList();
  $('rmMine').innerHTML = '<option value="">' + (L.length ? '選一個…' : '（還沒有）') + '</option>' + L.map((x, i) => '<option value="' + i + '">' + esc(x.name) + '</option>').join('');
}
function rmCellAvg(g) { const cs = CLASS_COMBOS[g]; let s = 0; for (const k of cs) s += RM.w[k]; return s / cs.length; }
function rmRender(text) {
  let h = '';
  for (let g = 0; g < 169; g++) {
    const x = rmCellAvg(g);
    h += '<button type="button" class="cell rm" data-g="' + g + '" style="--w:' + x.toFixed(2) + '"><div class="fill" style="height:' + (x * 100).toFixed(0) + '%"><i style="width:100%;background:#d0a84e"></i></div><span>' + className(g) + '</span></button>';
  }
  $('rmGrid').innerHTML = h;
  rmStat();
  if (text) { $('rmText').value = rangeText(RM.w); $('rmBad').textContent = ''; }
}
function rmStat() {
  const s = rangeCombos(RM.w);
  $('rmStat').textContent = fmt(s, 1) + ' 個組合，全部起手牌的 ' + pct(s / NCOMBO, 1) + '%';
}
function rmPaint(g) {
  if (g === RM.last) return;
  RM.last = g;
  rangeAddClass(RM.w, g, RM.val);
  const el = $('rmGrid').querySelector('[data-g="' + g + '"] .fill');
  if (el) el.style.height = (RM.val * 100).toFixed(0) + '%';
  rmStat();
}
function initRangeModal() {
  const grid = $('rmGrid');
  grid.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    e.preventDefault();
    const g = +b.dataset.g;
    RM.val = Math.abs(rmCellAvg(g) - RM.brush) < 1e-3 ? 0 : RM.brush;
    RM.painting = true; RM.last = -1;
    rmPaint(g);
  });
  grid.addEventListener('pointermove', (e) => {
    if (!RM.painting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), b = el && el.closest('#rmGrid [data-g]');
    if (b) rmPaint(+b.dataset.g);
  });
  const end = () => { if (RM.painting) { RM.painting = false; $('rmText').value = rangeText(RM.w); $('rmBad').textContent = ''; } };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  $('rmBrush').addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; RM.brush = +b.dataset.b; $('rmBrush').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  $('rmLib').addEventListener('change', (e) => { const r = RANGE_LIB.find((x) => x.key === e.target.value); if (r) { RM.w = parseRange(r.text); rmRender(true); } e.target.value = ''; });
  $('rmTop').addEventListener('input', (e) => {
    const x = +e.target.value / 100;
    $('rmTopTxt').textContent = Math.round(x * 100) + '%';
    RM.w = new Float32Array(NCOMBO);
    for (let g = 0; g < 169; g++) if (PRE_PCT[g] < x) rangeAddClass(RM.w, g, 1);
    rmRender(true);
  });
  let tt = 0;
  $('rmText').addEventListener('input', () => {
    clearTimeout(tt);
    tt = setTimeout(() => { const w = parseRange($('rmText').value); RM.w = w; rmRender(false); $('rmBad').textContent = w.bad.length ? '看不懂：' + w.bad.join('、') : ''; }, 250);
  });
  $('rmClear').addEventListener('click', () => { RM.w = new Float32Array(NCOMBO); rmRender(true); });
  $('rmTrim').addEventListener('click', () => { for (let k = 0; k < NCOMBO; k++) if (RM.w[k] < 0.2) RM.w[k] = 0; rmRender(true); });
  $('rmSave').addEventListener('click', () => {
    const L = mineList(), name = ($('rmName').value || '').trim() || ('我的範圍 ' + (L.length + 1));
    const i = L.findIndex((x) => x.name === name);
    if (i >= 0) L[i].text = rangeText(RM.w); else L.push({ name, text: rangeText(RM.w) });
    try { localStorage.setItem(MINE_KEY, JSON.stringify(L)); } catch (e) { /* 忽略 */ }
    renderMine(); $('rmName').value = '';
    $('rmSave').textContent = '存好了'; setTimeout(() => { $('rmSave').textContent = '存成我的範圍'; }, 1500);
  });
  $('rmMine').addEventListener('change', (e) => { const x = mineList()[+e.target.value]; if (x) { RM.w = parseRange(x.text); rmRender(true); } });
  $('rmDel').addEventListener('click', () => {
    const i = $('rmMine').value; if (i === '') return;
    const L = mineList(); L.splice(+i, 1);
    try { localStorage.setItem(MINE_KEY, JSON.stringify(L)); } catch (e) { /* 忽略 */ }
    renderMine();
  });
  $('rmOk').addEventListener('click', () => {
    $('rangeModal').hidden = true;
    if (RM.onOk) RM.onOk(rangeText(RM.w));
  });
  $('rmCancel').addEventListener('click', () => { $('rangeModal').hidden = true; });
  $('rangeModal').addEventListener('click', (e) => { if (e.target === $('rangeModal')) $('rangeModal').hidden = true; });
}

/* ===== 分享連結：局面 → JSON → 壓縮 → base64url，放在網址的 #s= 後面 ===== */
function b64u(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(t) { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
async function pipeBytes(bytes, stream) { const r = new Response(new Blob([bytes]).stream().pipeThrough(stream)); return new Uint8Array(await r.arrayBuffer()); }
async function encodeSpot(sp) {
  const keep = { board: sp.board, pot: sp.pot, stack: sp.stack, names: sp.names, ranges: sp.ranges, tree: sp.tree, target: sp.target, title: sp.title, hero: sp.hero, line: sp.line, unit: sp.unit };
  const raw = new TextEncoder().encode(JSON.stringify(keep));
  if (typeof CompressionStream !== 'undefined') { try { return 'z' + b64u(await pipeBytes(raw, new CompressionStream('deflate-raw'))); } catch (e) { /* 用不壓縮的 */ } }
  return 'j' + b64u(raw);
}
async function decodeSpot(t) {
  let bytes = unb64u(t.slice(1));
  if (t[0] === 'z') bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
  const sp = JSON.parse(new TextDecoder().decode(bytes));
  if (!sp || typeof sp.board !== 'string' || !Array.isArray(sp.ranges) || sp.ranges.length !== 2) throw new Error('連結格式不對');
  sp.names = Array.isArray(sp.names) && sp.names.length === 2 ? sp.names.map((x) => String(x).slice(0, 12)) : ['位置外', '位置內'];
  sp.ranges = sp.ranges.map(String);
  sp.pot = +sp.pot; sp.stack = +sp.stack;
  if (sp.unit !== undefined) sp.unit = String(sp.unit).slice(0, 4);
  return sp;
}
async function shareSpot() {
  const code = await encodeSpot(ST.spot);
  const url = location.origin + location.pathname + '?openExternalBrowser=1#s=' + code;
  const box = $('stShareBox');
  box.value = url; box.hidden = false; box.select();
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { /* 有些瀏覽器不給寫剪貼簿 */ }
  $('stShare').textContent = ok ? '已複製連結 ✓' : '連結在下面，請自己複製';
  setTimeout(() => { $('stShare').textContent = '複製分享連結'; }, 2500);
}
/* 開頁面時：網址有 #s= 就載入那個局面 */
async function studioFromHash() {
  const m = location.hash.match(/^#s=([zj][A-Za-z0-9_-]+)/);
  if (!m) return;
  try {
    const sp = await decodeSpot(m[1]);
    studioLoad(sp, '這是別人分享給你的局面' + (sp.title ? '（' + esc(sp.title) + '）' : '') + '。看一下設定，按「開始求解」。', false);
  } catch (e) {
    studioLoad(ST.spot, '分享連結壞掉了，打不開（' + esc(e.message) + '）。', false);
  }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 忽略 */ }
}
/* 把一個局面放進工作室（分享連結、從牌局帶入都走這裡） */
function studioLoad(sp, banner, autoGo) {
  ST.spot = JSON.parse(JSON.stringify(sp));
  ST.treeKey = 'custom'; ST.target = sp.target || 0.5;
  normTree(); stSave();
  showView('tools'); showTab('tSolve');
  stShow('setup');
  $('stBanner').innerHTML = banner || ''; $('stBanner').hidden = !banner;
  if (autoGo && ST.est && !ST.running) {
    const sec = estimateTime(ST.est, ST.target).ms * ST.ratio / 1000;
    if (sec < 120 && ST.est.mb < deviceMB()) solveStart();
  }
  window.scrollTo(0, 0);
}
/* 從牌局帶入：一手結束的檢討畫面按的 */
function studioFromGame(street) {
  const sp = spotFromHand(G.H, street);
  if (sp.error) return;
  studioLoad(sp, '從牌局帶入：' + esc(sp.title) + '。你坐' + esc(sp.hero.pos || sp.names[sp.hero.p]) + '，拿 ' + parseCards(sp.hero.cards).map(cardSpan).join('') + '。雙方的範圍是照每個人在這一手的動作估的（可以再改）；下注選項包含你們實際用的大小。' + (street === 1 ? '<br><b>從翻牌開始要算幾分鐘</b>（電腦會用好幾個執行緒一起算）；手機記憶體不夠的話，可以多放一張轉牌改從轉牌開始。' : ''), true);
}

function initStudio() {
  stLoad();
  initRangeModal();
  $('stTabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b || b.disabled) return; stShow(b.dataset.v); });
  $('stExample').addEventListener('change', (e) => { const k = e.target.value; if (!k) return; ST.spot = presetSpot(k); ST.treeKey = 'custom'; ST.target = ST.spot.target; normTree(); $('stBanner').hidden = true; stSave(); renderSetup(); });
  $('stSlots').addEventListener('click', (e) => { const t = e.target.closest('[data-slot]'); if (t) stBoardClick(+t.dataset.slot); });
  $('stSlots').addEventListener('keydown', (e) => { const t = e.target.closest('[data-slot]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); stBoardClick(+t.dataset.slot); } });
  $('stDeck').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (b && !b.classList.contains('used')) stDeckClick(+b.dataset.c); });
  const num = (id, key) => $(id).addEventListener('input', () => { ST.spot[key] = +$(id).value; stChanged(false); renderStBoardSpr(); });
  const renderStBoardSpr = () => { const b = boardCards(), spr = (+ST.spot.stack) / Math.max(0.01, +ST.spot.pot); if (b.length >= 3) $('stSpr').innerHTML = '從' + STREET3[b.length - 3] + '開始。' + glossify('SPR') + ' ' + fmt(spr, 1) + '（剩下的籌碼是底池的 ' + fmt(spr, 1) + ' 倍）'; };
  num('stPot', 'pot'); num('stStack', 'stack');
  $('stRanges').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) openRange(+b.dataset.edit); });
  $('stRanges').addEventListener('change', (e) => {
    const s = e.target.closest('select[data-lib]');
    if (s) { const r = RANGE_LIB.find((x) => x.key === s.value); if (r) { ST.spot.ranges[+s.dataset.lib] = r.text; stChanged(true); } return; }
  });
  $('stRanges').addEventListener('input', (e) => { const t = e.target.closest('input.rname'); if (t) { ST.spot.names[+t.dataset.p] = t.value || (t.dataset.p === '1' ? '位置內' : '位置外'); stSave(); } });
  $('stTreeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b || b.dataset.k === 'custom') return;
    ST.treeKey = b.dataset.k;
    const n = boardCards().length;
    if (n >= 3) { const keep = ST.spot.tree; ST.spot.tree = treeFromPreset(ST.treeKey, n); ST.spot.tree.allin = keep.allin; }
    stChanged(true);
  });
  $('stTree').addEventListener('input', (e) => {
    const t = e.target.closest('input[data-k]'); if (!t) return;
    const arr = parseSizes(t.value);
    t.classList.toggle('badin', !arr);
    const tr = ST.spot.tree;
    tr[t.dataset.kind][t.dataset.k][+t.dataset.p] = arr;
    if (ST.treeKey !== 'custom') { ST.treeKey = 'custom'; $('stTreeSeg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.k === 'custom'))); }
    stChanged(false);
  });
  $('stCap').addEventListener('change', () => { ST.spot.tree.cap = +$('stCap').value; ST.treeKey = 'custom'; stChanged(true); });
  $('stAddAllin').addEventListener('change', () => { ST.spot.tree.addAllin = $('stAddAllin').checked; ST.treeKey = 'custom'; stChanged(true); });
  $('stTarget').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (!b) return; ST.target = +b.dataset.t; $('stTarget').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); stChanged(false); });
  $('bSolve').addEventListener('click', solveStart);
  $('bStop').addEventListener('click', () => W.send({ cmd: 'stop' }));
  $('stShare').addEventListener('click', shareSpot);
  // 結果
  $('acts').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (!b || !ST.view) return;
    const a = +b.dataset.a, v = ST.view;
    goPath(ST.path.concat([{ a }]), ST.labels.concat([esc(ST.solved.names[v.p]) + ' ' + esc(v.acts[a].label)]));
  });
  $('roGrid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]'); if (!b) return;
    const c = +b.dataset.c;
    goPath(ST.path.concat([{ c }]), ST.labels.concat([(ST.view.board.length === 3 ? '轉牌 ' : '河牌 ') + cardSpan(c)]));
  });
  $('crumbs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-step]'); if (!b) return;
    const s = +b.dataset.step;
    goPath(ST.path.slice(0, s), ST.labels.slice(0, s));
  });
  $('stLineBox').addEventListener('click', (e) => {
    const c = e.target.closest('[data-li]');
    if (c) { const i = +c.dataset.li; goPath(ST.linePath.slice(0, i), ST.lineLabels.slice(0, i)); return; }
    if (e.target.id === 'lNext') { const L = ST.path.length; goPath(ST.linePath.slice(0, L + 1), ST.lineLabels.slice(0, L + 1)); }
    if (e.target.id === 'lHome') goPath([], []);
  });
  $('gridMode').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (!b) return; ST.mode = b.dataset.m; $('gridMode').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderGrid(); });
  $('grid13').addEventListener('click', (e) => {
    if (ST.lockEdit && ST.view && ST.lockEdit.id === ST.view.id) return;
    const b = e.target.closest('button[data-g]'); if (!b) return;
    ST.sel = +b.dataset.g;
    $('grid13').querySelectorAll('.cell').forEach((x) => x.classList.toggle('sel', x === b));
    renderCell();
    if (window.innerWidth <= 900) $('cellTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('catTab2').addEventListener('click', (e) => {
    const r = e.target.closest('tr[data-c]'); if (!r) return;
    const c = +r.dataset.c;
    ST.catSel = ST.catSel === c ? -1 : c;
    renderGrid(); renderCats();
  });
  initStudio2();
  stShow('setup');
}

/* ===== 節點鎖定（只能鎖第一條街的節點）：自己決定這裡怎麼打，再讓對手重新針對 ===== */
function renderLock() {
  const v = ST.view, box = $('lockBox');
  if (!v || v.kind !== 0 || v.level !== 0) { box.innerHTML = ''; return; }
  const N = ST.solved.names, cols = actColors(v.acts), E = ST.lockEdit && ST.lockEdit.id === v.id ? ST.lockEdit : null;
  if (E) {
    box.innerHTML = '<div class="lockb on"><b>鎖定 ' + esc(N[v.p]) + ' 在這裡的打法</b><div class="note">選一個動作，再點或拖曳格子：那一格的牌都改成 100% 這個動作。</div>'
      + '<div class="brushes">' + v.acts.map((a, i) => '<button type="button" data-lb="' + i + '" aria-pressed="' + (i === E.brush) + '"><i class="sw" style="background:' + cols[i] + '"></i>' + esc(a.label) + '</button>').join('') + '</div>'
      + '<div class="strow"><button class="btn sm" data-lk="all">整個範圍都改成這個動作</button><button class="btn sm" data-lk="reset">回到 GTO 的打法</button></div>'
      + '<div class="strow"><button class="btn sm main" data-lk="apply">鎖定並重新算</button><button class="btn sm" data-lk="cancel">取消</button></div></div>';
  } else if (v.locked) {
    box.innerHTML = '<div class="lockb on">🔒 這個節點已經鎖定（' + esc(N[v.p]) + ' 照你設定的打）。其他地方是對手針對這個打法的最佳解。<div class="strow"><button class="btn sm" data-lk="edit">改鎖定</button><button class="btn sm" data-lk="unlock">解除鎖定並重新算</button></div></div>';
  } else {
    box.innerHTML = '<div class="lockb"><button type="button" class="linkbtn" data-lk="edit" style="padding:0">🔒 鎖定這個節點</button><span class="note">：如果 ' + esc(N[v.p]) + ' 在這裡不照 GTO 打（例如每次都下注），對手該怎麼應對？</span></div>';
  }
}
function lockPaint(g) {
  const v = ST.view, E = ST.lockEdit, n = v.n[v.p], k = v.acts.length, hands = v.hands[v.p];
  for (let h = 0; h < n; h++) {
    if (CLASS_OF[hands[h]] !== g) continue;
    for (let a = 0; a < k; a++) E.strat[a * n + h] = a === E.brush ? 1 : 0;
  }
}
function lockCmd(c) {
  const v = ST.view;
  if (c === 'edit') { ST.lockEdit = { id: v.id, brush: 0, strat: Float32Array.from(v.strat) }; renderView(); return; }
  if (c === 'cancel') { ST.lockEdit = null; renderView(); return; }
  if (c === 'reset') { ST.lockEdit.strat = Float32Array.from(v.strat); renderView(); return; }
  if (c === 'all') { const E = ST.lockEdit, n = v.n[v.p], k = v.acts.length; for (let h = 0; h < n; h++) for (let a = 0; a < k; a++) E.strat[a * n + h] = a === E.brush ? 1 : 0; renderView(); return; }
  if (c === 'apply') { const E = ST.lockEdit; ST.lockEdit = null; ST.locks.set(E.id, E.strat); W.send({ cmd: 'lock', id: E.id, strat: Array.from(E.strat) }); solveResume(); return; }
  if (c === 'unlock') { ST.locks.delete(v.id); W.send({ cmd: 'lock', id: v.id, strat: null }); solveResume(); }
}
/* ===== 匯出：這個節點每個組合（CSV）、某個動作的範圍（文字，可以貼回範圍編輯器或 PioSOLVER） ===== */
function exportCsv() {
  const v = ST.view;
  if (!v || v.kind !== 0) return;
  const p = v.p, n = v.n[p], k = v.acts.length, hands = v.hands[p], cats = catsFor(v.board);
  const rows = [['組合', '牌型', '權重'].concat(v.acts.map((a) => a.label + ' %'), ['EV', '勝率 %'])];
  for (let h = 0; h < n; h++) {
    const r = v.reach[p][h]; if (!(r > 1e-6)) continue;
    rows.push([comboTxt(hands[h]), cats[hands[h]] >= 0 ? CATG[cats[hands[h]]] : '', r.toFixed(4)].concat(v.acts.map((a, i) => (v.strat[i * n + h] * 100).toFixed(1)), [(v.ev[h] + v.inv[p]).toFixed(3), (v.eq[h] * 100).toFixed(1)]));
  }
  const csv = '﻿' + rows.map((r) => r.map((x) => (/[",\n]/.test(x) ? '"' + String(x).replace(/"/g, '""') + '"' : x)).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'gto-' + v.board.map(cardStr).join('') + '-' + (ST.labels.length ? 'n' + ST.path.length : 'root') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function renderRangeOut() {
  const v = ST.view, el = $('rangeOut');
  if (!v || v.kind !== 0) { el.innerHTML = ''; return; }
  el.innerHTML = '<option value="">複製某個動作的範圍…</option><option value="all">' + esc(ST.solved.names[v.p]) + ' 現在的整個範圍</option>' + v.acts.map((a, i) => '<option value="' + i + '">' + esc(ST.solved.names[v.p]) + ' ' + esc(a.label) + ' 的範圍</option>').join('');
}
function copyRange(sel) {
  const v = ST.view, p = v.p, n = v.n[p], hands = v.hands[p], w = new Float32Array(NCOMBO);
  for (let h = 0; h < n; h++) { const x = v.reach[p][h] * (sel === 'all' ? 1 : v.strat[+sel * n + h]); if (x > 0.005) w[hands[h]] = Math.min(1, Math.round(x * 1000) / 1000); }
  const txt = rangeText(w);
  const done = () => toast('已複製（' + fmt(rangeCombos(w), 1) + ' 個組合）。可以貼到範圍編輯器的文字框。');
  try { navigator.clipboard.writeText(txt).then(done, () => { prompt('複製這段文字', txt); }); } catch (e) { done(); }
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function initStudio2() {
  $('lockBox').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]');
    if (b) { ST.lockEdit.brush = +b.dataset.lb; renderLock(); return; }
    const c = e.target.closest('[data-lk]'); if (c) lockCmd(c.dataset.lk);
  });
  // 鎖定編輯：點或拖曳格子
  let painting = false, last = -1;
  const grid = $('grid13');
  grid.addEventListener('pointerdown', (e) => {
    if (!(ST.lockEdit && ST.view && ST.lockEdit.id === ST.view.id)) return;
    const b = e.target.closest('[data-g]'); if (!b) return;
    e.preventDefault(); painting = true; last = +b.dataset.g; lockPaint(last); renderGrid(); renderCats();
  });
  grid.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), b = el && el.closest('#grid13 [data-g]');
    if (b && +b.dataset.g !== last) { last = +b.dataset.g; lockPaint(last); renderGrid(); }
  });
  window.addEventListener('pointerup', () => { if (painting) { painting = false; renderView(); } });
  $('roundChk').addEventListener('change', (e) => { ST.round = e.target.checked; if (ST.view) renderView(); });
  $('bCsv').addEventListener('click', exportCsv);
  $('rangeOut').addEventListener('change', (e) => { if (e.target.value !== '') copyRange(e.target.value); e.target.value = ''; });
  $('stThreads').addEventListener('change', (e) => { ST.threads = +e.target.value; stSave(); stEstimate(); });
}
