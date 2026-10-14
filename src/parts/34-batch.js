/* ===== 34-batch：GTO 工作室的「多翻牌報告」（同一組範圍、下注選項，套到很多個翻牌） ===== */
const BT_KEY = 'dezhou-batch-1';
const BT = { src: '3bet', set: 'small', target: 2, rows: [], sig: '', store: {}, names: ['', ''], running: false, tag: 0, est: null, compress: false, sortK: '', sortDir: -1, done: false };
const BT_SRC = [['3bet', '3-bet 底池範例'], ['mine', '用 ① 的設定']];
const BT_TARGETS = [[2, '粗（2%）'], [1, '標準（1%）']];

function btLoad() {
  try {
    const o = JSON.parse(localStorage.getItem(BT_KEY) || 'null');
    if (o) {
      BT.src = o.src || BT.src; BT.set = o.set || BT.set; BT.target = o.target || BT.target;
      BT.store = o.store || {};
      if (o.rows && o.sig) BT.store[o.sig] = { rows: o.rows, at: Date.now() };   // 舊版只存一份
    }
  } catch (e) { /* 沒有 */ }
}
/* 每一種設定（範圍、下注、翻牌組、精度）的結果分開存，切換再切回來還在；最多留 8 份 */
function btSave() {
  if (BT.sig && BT.rows.some((r) => r)) BT.store[BT.sig] = { rows: BT.rows, at: Date.now() };
  const keys = Object.keys(BT.store).sort((a, b) => BT.store[b].at - BT.store[a].at);
  for (const k of keys.slice(8)) delete BT.store[k];
  try { localStorage.setItem(BT_KEY, JSON.stringify({ src: BT.src, set: BT.set, target: BT.target, store: BT.store })); } catch (e) { /* 忽略 */ }
}

/* 要算的局面（不含公牌）：範例或 ① 的設定；① 不是翻牌的話，下注選項用「簡單」 */
function btSpot() {
  if (BT.src === '3bet') return presetSpot('flop3bet');
  const sp = JSON.parse(JSON.stringify(ST.spot));
  if (boardCards().length !== 3) sp.tree = treeFromPreset(ST.treeKey === 'custom' ? 'simple' : ST.treeKey, 3);
  return sp;
}
function btSig(sp) { return JSON.stringify([BT.set, BT.target, sp.ranges, +sp.pot, +sp.stack, sp.tree]); }
function btFlops() { return BATCH_SETS[BT.set].flops; }
const BT_W = {};
function btAssign() { return BT_W[BT.set] || (BT_W[BT.set] = flopAssign(btFlops())); }
function btWeights() { return btAssign().w; }
function btSrcNote(sp) {
  const tr = sp.tree, b = tr.bet || {};
  const sz = (k) => (b[k] ? sizesText(b[k][0]) : '');
  return '位置外：' + esc(sp.names[0]) + '；位置內：' + esc(sp.names[1]) + '；底池 ' + fmt(+sp.pot, 1) + '、每人剩 ' + fmt(+sp.stack, 1) + '；下注：翻牌 ' + sz('flop') + '、轉牌 ' + sz('turn') + '、河牌 ' + sz('river') + (tr.addAllin !== false ? '，另加全下' : '') + '。';
}
function btCfg(sp, board) { return spotCfg(Object.assign({}, sp, { board }), { maxMB: deviceMB(), target: BT.target, maxIters: BT.target <= 1 ? 250 : 150, compress: BT.compress }); }

function btEstimate(sp) {
  const flops = btFlops(), box = $('btEst');
  BT.est = null;
  for (let p = 0; p < 2; p++) if (!rangeCombos(parseRange(sp.ranges[p]))) { box.innerHTML = '<p class="bad">' + (p ? '位置內' : '位置外') + '的範圍是空的。</p>'; return; }
  let work = 0, mb = 0;
  try {
    const pick = [0, flops.length >> 1, flops.length - 1];
    for (const i of pick) { const e = estimateSolve(btCfg(sp, flops[i])); work += e.work / pick.length; mb = Math.max(mb, e.mb); }
  } catch (e) { box.innerHTML = '<p class="bad">' + esc(e.message) + '</p>'; return; }
  const maxMB = deviceMB();
  BT.compress = mb > maxMB * 0.6;
  const k = threadsFor({ board: flops[0] }), iters = BT.target <= 1 ? 100 : 60;
  const per = iters * (work * SPEED.k + SPEED.c) * 1.1 * 1.09 * (BT.compress ? 1.4 : 1) / (k >= 2 ? Math.max(1, k * SPEED.par) : 1) * ST.ratio / 1000;
  const left = flops.length - btFilled(), tot = per * left;
  const ts = (s) => (s < 60 ? Math.max(1, Math.round(s)) + ' 秒' : s < 3600 ? Math.round(s / 60) + ' 分鐘' : (s / 3600).toFixed(1) + ' 小時');
  BT.est = { per, tot, k, mb: BT.compress ? mb / 2 : mb };
  if (BT.est.mb > maxMB) { box.innerHTML = '<p class="bad">太大了：一個翻牌就要大約 ' + Math.round(BT.est.mb) + ' MB（這台裝置最多 ' + Math.round(maxMB) + ' MB）。請縮小範圍或減少下注尺寸。</p>'; BT.est = null; return; }
  box.innerHTML = '<p>每個翻牌大約 <b>' + ts(per) + '</b>，' + (left < flops.length ? '剩下 ' + left + ' 個' : '全部 ' + flops.length + ' 個') + '大約 <b>' + ts(tot) + '</b>（' + k + ' 個執行緒' + (ST.ratio === 1 ? '；第一次是估的' : '') + '）。'
    + (tot > 1800 ? '<span class="bad">很久：建議先用「精簡」、範圍窄一點，或下注選項用「簡單」。</span>' : '') + (ST.solved ? '<br><span class="note">開始以後，「② 看結果」裡現在的解會清掉。</span>' : '')
    + (ST.running && !BT.running ? '<br><span class="bad">「① 設定局面」正在求解：算完（或在上面按「先停在這裡」）才能開始。</span>' : '') + '</p>';
}
/* 從第一個翻牌往後，連續算好了幾個 */
function btFilled() { let i = 0; while (BT.rows[i] && BT.rows[i].row) i++; return i; }

function renderBatch() {
  const sp = btSpot(), sig = btSig(sp);
  BT.names = sp.names;
  if (sig !== BT.sig && !BT.running) { btSave(); BT.sig = sig; BT.rows = BT.store[sig] ? BT.store[sig].rows.slice() : []; }
  $('btSrc').innerHTML = BT_SRC.map(([k, t]) => '<button type="button" data-k="' + k + '" aria-pressed="' + (k === BT.src) + '"' + (BT.running ? ' disabled' : '') + '>' + t + '</button>').join('');
  $('btSet').innerHTML = Object.keys(BATCH_SETS).map((k) => '<button type="button" data-k="' + k + '" aria-pressed="' + (k === BT.set) + '"' + (BT.running ? ' disabled' : '') + '>' + BATCH_SETS[k].name + '</button>').join('');
  $('btTarget').innerHTML = BT_TARGETS.map(([k, t]) => '<button type="button" data-k="' + k + '" aria-pressed="' + (k === BT.target) + '"' + (BT.running ? ' disabled' : '') + '>' + t + '</button>').join('');
  $('btSrcNote').innerHTML = btSrcNote(sp);
  if (!BT.running) btEstimate(sp);
  const n = btFilled(), all = btFlops().length;
  $('btGo').hidden = BT.running;
  $('btGo').textContent = n > 0 && n < all ? '接著算（還有 ' + (all - n) + ' 個）' : n >= all ? '重新算一次' : '開始';
  $('btGo').disabled = !BT.est || (ST.running && !BT.running);
  $('btStop').hidden = !BT.running;
  $('btCsv').hidden = !BT.rows.some((r) => r && r.row);
  renderBatchOut();
}

/* 表格 */
function btBar(node) {
  if (!node) return '<span class="note">—</span>';
  const cols = actColors(node.acts);
  let h = '';
  node.acts.forEach((a, i) => { if (a.t !== 'x' && a.t !== 'c' && node.freq[i] > 0.002) h += '<i style="width:' + (node.freq[i] * 100).toFixed(1) + '%;background:' + cols[i] + '" title="' + esc(a.label) + ' ' + pct(node.freq[i], 0) + '%"></i>'; });
  return '<div class="bbw"><div class="sbarh" title="' + esc(node.acts.map((a, i) => a.label + ' ' + pct(node.freq[i], 0) + '%').join('、')) + '">' + h + '</div><span>' + pct(betFreq(node), 0) + '%</span></div>';
}
function btCards(b) { return parseCards(b).map((c) => cardSpan(c)).join(''); }
function renderBatchOut() {
  const flops = btFlops(), A = btAssign(), w = A.w, N = BT.names;
  const have = BT.rows.some((r) => r && r.row);
  $('btOut').hidden = !have && !BT.running;
  if ($('btOut').hidden) return;
  // 整體與分類（分類的平均：照「屬於這一類的翻牌分給哪個代表」加權）
  const items = flops.map((b, i) => ({ b, w: w[i], row: BT.rows[i] && BT.rows[i].row, g: flopGroups(b) }));
  const sumRow = (label, its, cls) => {
    const a = batchAvg(its);
    const tw = its.reduce((s, x) => s + x.w, 0);
    if (!a) return '<tr class="wait"><td>' + esc(label) + '</td><td class="hw">' + pct(tw, 0) + '%</td><td colspan="4" class="btmsg">還沒算到這一類的代表翻牌</td></tr>';
    return '<tr class="' + (cls || '') + '"><td>' + esc(label) + '</td><td class="hw">' + pct(tw, 0) + '%</td><td>' + pct(a.bet0, 0) + '%</td><td>' + pct(a.bet1, 0) + '%</td><td>' + pct(a.eq0, 0) + '%</td><td>' + pct(a.ev0, 0) + '%</td></tr>';
  };
  let sh = '<thead><tr><th>翻牌</th><th class="hw">占比</th><th>' + esc(N[0]) + '<small>先下注</small></th><th>' + esc(N[1]) + '<small>被過牌後下注</small></th><th>' + esc(N[0]) + '<small>勝率</small></th><th>' + esc(N[0]) + '<small>拿到底池</small></th></tr></thead><tbody>';
  const done = items.filter((x) => x.row);
  sh += sumRow('整體' + (done.length < items.length ? '（已算 ' + done.length + '／' + items.length + '）' : ''), items, 'all');
  const ORDER = { high: ['A 高', 'K 高', 'Q、J 高', '10 以下'], suit: ['彩虹（三種花色）', '兩張同花', '單色（三張同花）'], pair: ['沒有對子', '有對子'] };
  for (const [gk, title] of [['high', '最大的牌'], ['suit', '花色'], ['pair', '對子']]) {
    sh += '<tr class="grp"><td colspan="6">' + title + '</td></tr>';
    for (const k of ORDER[gk]) { const gw = A.grp[gk][k]; if (gw) sh += sumRow(k, items.map((x, i) => ({ w: gw[i], row: x.row }))); }
  }
  $('btSum').innerHTML = sh + '</tbody>';
  // 每個翻牌
  const cols = [['b', '翻牌'], ['w', '權重'], ['bet0', esc(N[0]) + '<small>先下注</small>'], ['bet1', esc(N[1]) + '<small>被過牌後</small>'], ['eq0', esc(N[0]) + '<small>勝率</small>'], ['ev0', esc(N[0]) + '<small>拿到底池</small>']];
  let th = '<thead><tr>' + cols.map(([k, t]) => '<th' + (k !== 'b' ? ' data-sort="' + k + '" tabindex="0" role="button" aria-label="照這一欄排序"' : '') + (k === 'w' ? ' class="hw"' : '') + '>' + t + (BT.sortK === k ? (BT.sortDir < 0 ? ' ▼' : ' ▲') : '') + '</th>').join('') + '</tr></thead><tbody>';
  const val = (x, k) => (k === 'w' ? x.w : !x.row ? -1 : k === 'bet0' ? betFreq(x.row.oop) : k === 'bet1' ? betFreq(x.row.ipx) : k === 'eq0' ? x.row.eq0 : x.row.ev[0] / x.row.pot);
  const order = items.map((x, i) => Object.assign({ i }, x));
  if (BT.sortK) order.sort((a, b) => (val(a, BT.sortK) - val(b, BT.sortK)) * BT.sortDir);
  for (const x of order) {
    const r = BT.rows[x.i];
    if (r && r.row) th += '<tr data-i="' + x.i + '" tabindex="0" title="帶到「① 設定局面」仔細算"><td>' + btCards(x.b) + '<small>' + esc(x.g.suit.replace(/（.*）/, '')) + (r.pct > BT.target * 1.05 ? '・精度 ' + fmt(r.pct, 1) + '%' : '') + '</small></td><td class="hw">' + pct(x.w, 1) + '%</td><td class="bb">' + btBar(r.row.oop) + '</td><td class="bb">' + btBar(r.row.ipx) + '</td><td>' + pct(r.row.eq0, 0) + '%</td><td>' + pct(r.row.ev[0] / r.row.pot, 0) + '%</td></tr>';
    else th += '<tr class="wait"><td>' + btCards(x.b) + '</td><td class="hw">' + pct(x.w, 1) + '%</td><td colspan="4" class="btmsg">' + (r && r.error ? '<span class="bad">' + esc(r.error) + '</span>' : BT.running && x.i === BT.cur ? '算到這裡…' : '還沒算') + '</td></tr>';
  }
  $('btTab').innerHTML = th + '</tbody>';
}

/* 開始／接著算 */
function btStart() {
  if (ST.running || !BT.est) return;
  if (BENCH.running) { toast('效能測試還在跑：等它跑完再開始。'); return; }
  const sp = btSpot(), flops = btFlops();
  let from = btFilled();
  if (from >= flops.length) { BT.rows = []; from = 0; }
  BT.sig = btSig(sp);
  const cfg = btCfg(sp, flops[0]);
  let k = BT.est.k;
  if (k >= 2) k = W.helpers(k); else W.helpers(0);
  BT.running = true; BT.cur = from; BT.tag++; BT.t0 = Date.now(); BT.from = from;
  ST.running = true; ST.solved = null; ST.solvedInfo = null;
  $('stTabs').querySelector('[data-v="result"]').disabled = true;
  $('btProg').hidden = false; $('btProgTxt').innerHTML = btNextTxt(from); $('btProgBar').style.width = '0'; $('btProgTime').textContent = '';
  W.send({ cmd: 'batch', cfg, flops, from, threads: k, tag: BT.tag });
  renderBatch();
}
function btNextTxt(i) { const f = btFlops(); return i < f.length ? '第 ' + (i + 1) + '／' + f.length + ' 個翻牌 ' + btCards(f[i]) + '：開始算…' : ''; }
function btEnded() {
  BT.running = false; ST.running = false;
  if (!$('stBatch').hidden) renderBatch();
  if (!$('stSetup').hidden) stEstimate();
}
W.on('batch-prog', (m) => {
  if (m.tag !== BT.tag) return;
  const flops = btFlops(), n = flops.length;
  if (m.i !== BT.cur) { BT.cur = m.i; renderBatchOut(); }
  $('btProgTxt').innerHTML = '第 ' + (m.i + 1) + '／' + n + ' 個翻牌 ' + btCards(flops[m.i]) + '：算了 ' + m.t + ' 次，' + glossify('可剝削度') + ' ' + fmt(m.pct, 1) + '%';
  const f = (m.i - BT.from + Math.min(0.95, Math.max(0, Math.log(30 / m.pct) / Math.log(30 / BT.target)))) / (n - BT.from);
  $('btProgBar').style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%';
  const sec = (Date.now() - BT.t0) / 1000;
  $('btProgTime').textContent = fmt(sec, 0) + ' 秒' + (f > 0.03 ? '，大約還要 ' + Math.max(1, Math.round(sec / f - sec)) + ' 秒' : '');
});
W.on('batch-row', (m) => {
  if (m.tag !== BT.tag) return;
  BT.rows[m.i] = m.error ? { error: m.error } : { row: m.row, pct: m.pct, t: m.t, ms: m.ms };
  btSave();
  if (m.i + 1 < btFlops().length) { BT.cur = m.i + 1; $('btProgTxt').innerHTML = btNextTxt(m.i + 1); }
  if (!$('stBatch').hidden) renderBatchOut();
  $('btCsv').hidden = false;
});
W.on('batch-done', (m) => {
  if (m.tag !== BT.tag) return;
  const n = btFilled(), all = btFlops().length;
  $('btProgTxt').textContent = m.error ? '出錯了：' + m.error : n >= all ? '全部算好了：' + all + ' 個翻牌' : '停在這裡：算好 ' + n + '／' + all + ' 個（按「接著算」從下一個開始）';
  $('btProgBar').style.width = (n / all * 100).toFixed(1) + '%';
  $('btProgTime').textContent = fmt((Date.now() - BT.t0) / 1000, 0) + ' 秒';
  btEnded();
});

function btCsv() {
  const flops = btFlops(), w = btWeights(), N = BT.names;
  const lines = [['翻牌', '權重%', '最大的牌', '花色', '對子', N[0] + ' 動作', N[0] + ' 下注%', N[1] + ' 被過牌後下注%', N[0] + ' 勝率%', N[0] + ' 拿到底池%', N[1] + ' 拿到底池%', '可剝削度%'].join(',')];
  flops.forEach((b, i) => {
    const r = BT.rows[i]; if (!r || !r.row) return;
    const g = flopGroups(b), R = r.row;
    lines.push([b, (w[i] * 100).toFixed(2), g.high, g.suit, g.pair, '"' + R.oop.acts.map((a, j) => a.label + ' ' + pct(R.oop.freq[j], 1) + '%').join('；') + '"', pct(betFreq(R.oop), 1), pct(betFreq(R.ipx), 1), pct(R.eq0, 1), pct(R.ev[0] / R.pot, 1), pct(R.ev[1] / R.pot, 1), fmt(r.pct, 2)].join(','));
  });
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = '多翻牌報告.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function initBatch() {
  btLoad();
  const seg = (id, f) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (!b || b.disabled || BT.running) return; f(b.dataset.k); btSave(); renderBatch(); });
  seg('btSrc', (k) => { BT.src = k; });
  seg('btSet', (k) => { BT.set = k; });
  seg('btTarget', (k) => { BT.target = +k; });
  $('btGo').addEventListener('click', btStart);
  $('btStop').addEventListener('click', () => W.send({ cmd: 'stop' }));
  $('btCsv').addEventListener('click', btCsv);
  $('btTab').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const t = e.target.closest('th[data-sort],tr[data-i]'); if (t) { e.preventDefault(); t.click(); } } });
  $('btTab').addEventListener('click', (e) => {
    const s = e.target.closest('th[data-sort]');
    if (s) { const k = s.dataset.sort; if (BT.sortK === k) BT.sortDir = -BT.sortDir; else { BT.sortK = k; BT.sortDir = -1; } renderBatchOut(); const nh = $('btTab').querySelector('th[data-sort="' + k + '"]'); if (nh) nh.focus(); return; }
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    if (ST.running) { toast(BT.running ? '報告還在算：先按「停下來」。' : '「① 設定局面」正在求解：先等它算完或停下來。'); return; }
    const sp = btSpot(), b = btFlops()[+tr.dataset.i];
    sp.board = b; sp.title = '翻牌 ' + parseCards(b).map(cardTxt).join('') + '（從多翻牌報告）'; sp.target = 0.5;
    studioLoad(sp, '從多翻牌報告帶進來：同樣的範圍和下注選項，這個翻牌算到 0.5% 的精度，算好就到「② 看結果」看每手牌怎麼打。', true);
  });
}
