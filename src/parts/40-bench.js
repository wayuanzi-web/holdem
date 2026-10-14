/* ===== 40-bench：效能測試 ===== */
const BENCH = { res: [], running: false, t0: 0 };

function devText() {
  const n = navigator;
  return '裝置：' + (n.userAgent || '') + '；邏輯核心 ' + (n.hardwareConcurrency || '?') + (n.deviceMemory ? '；記憶體約 ' + n.deviceMemory + ' GB' : '')
    + '；螢幕 ' + screen.width + '×' + screen.height + '@' + (window.devicePixelRatio || 1);
}
function benchRow(r) {
  let v, sub = '';
  if (r.key === 'eval' || r.key === 'mc') v = fmt(r.value, r.key === 'eval' ? 2 : 0) + ' ' + r.unit;
  else if (r.key === 'exact') v = fmt(r.value, 0) + ' 毫秒';
  else if (r.value === null) v = '—';
  else v = fmt(r.value, 1) + ' ' + r.unit;
  if (r.key === 'river' || r.key === 'turn' || r.key === 'turnBig') {
    sub = '迭代 ' + r.iters + ' 次（每次 ' + fmt(r.perIter, 1) + ' 毫秒），可剝削度 ' + fmt(r.pct, 2) + '%；記憶體 ' + Math.max(1, Math.round(r.mem)) + ' MB；手牌 ' + r.hands.join('／') + '<br>' + esc(r.tree || '');
  } else if (r.key === 'flop') {
    sub = '沒有真的跑：用轉牌的實測速度推估。需要記憶體 ' + Math.round(r.mem) + ' MB；每次迭代約 ' + fmt(r.perIter / 1000, 1) + ' 秒，到 0.5% 約 ' + (r.value > 120 ? fmt(r.value / 60, 0) + ' 分鐘' : fmt(r.value, 0) + ' 秒') + '<br>' + esc(r.tree || '');
    v = r.value > 120 ? fmt(r.value / 60, 0) + ' 分鐘（估）' : fmt(r.value, 0) + ' 秒（估）';
  } else if (r.key === 'par' && r.value !== null) {
    v = fmt(r.value, 0) + ' 秒（估）';
    sub = '每次迭代：1 個執行緒 ' + fmt(r.per1 / 1000, 2) + ' 秒' + (r.perK ? '，' + r.k + ' 個執行緒 ' + fmt(r.perK / 1000, 2) + ' 秒（快 ' + fmt(r.per1 / r.perK, 1) + ' 倍）' : '（這台裝置只用 1 個執行緒）') + '；到 1% 大約 100 次；記憶體 ' + Math.round(r.mem) + ' MB<br>' + esc(r.tree || '');
  } else sub = esc(r.note || '');
  return '<tr><td>' + esc(r.name) + '</td><td class="v num">' + v + '</td><td class="sub">' + sub + '</td></tr>';
}
function renderBench() { $('benchTab').tBodies[0].innerHTML = BENCH.res.map(benchRow).join(''); }
function benchText() {
  const L = ['德州軍師 效能測試（第四版）', devText()];
  for (const r of BENCH.res) {
    if (r.key === 'eval') L.push('評牌器 ' + fmt(r.value, 2) + ' 百萬手/秒');
    else if (r.key === 'mc') L.push('蒙地卡羅 9 人 ' + fmt(r.value, 0) + ' 千次/秒');
    else if (r.key === 'exact') L.push('精確勝率翻牌 ' + fmt(r.value, 0) + ' ms');
    else if (r.key === 'flop') L.push('翻牌（估）每次 ' + fmt(r.perIter / 1000, 2) + ' 秒，記憶體 ' + Math.round(r.mem) + ' MB');
    else if (r.key === 'par' && r.value !== null) L.push('翻牌3bet 每次 1執行緒 ' + fmt(r.per1 / 1000, 2) + ' 秒' + (r.perK ? '、' + r.k + '執行緒 ' + fmt(r.perK / 1000, 2) + ' 秒' : ''));
    else if (r.value !== null) L.push(r.name + ' ' + fmt(r.value, 2) + ' 秒，' + r.iters + ' 次，每次 ' + fmt(r.perIter, 1) + ' ms，' + fmt(r.pct, 2) + '%，' + Math.round(r.mem) + ' MB');
    else L.push(r.name + '：' + (r.note || '失敗'));
  }
  L.push('總時間 ' + fmt((Date.now() - BENCH.t0) / 1000, 0) + ' 秒');
  return L.join('\n');
}
W.on('bench-item', (m) => { BENCH.res.push(m.r); renderBench(); benchCalibrate(m.r); });
/* 用效能測試的翻牌（3-bet 底池）速度，校正工作室和多翻牌報告的時間估計（不用先真的解一次） */
function benchCalibrate(r) {
  if (!r || r.key !== 'par' || !(r.per1 > 0)) return;
  try {
    const est = estimateSolve(presetCfg('flop3bet', { maxMB: 0 }));
    const ratio = r.per1 / (est.work * SPEED.k + SPEED.c);
    if (ratio > 0.05 && ratio < 50) { ST.ratio = ratio; localStorage.setItem(SPEED_KEY, String(ratio)); }
    if (r.perK > 0 && r.k >= 2) { const pe = Math.max(0.2, Math.min(1, r.per1 / r.perK / r.k)); SPEED.par = pe; localStorage.setItem(PAR_KEY, String(pe)); }
    BENCH.calibrated = true;
  } catch (e) { /* 估不出來就算了 */ }
}
W.on('bench-step', (m) => { $('benchMsg').textContent = m.key === 'flop3bet' ? '正在測翻牌（好幾個執行緒一起算）…' : '正在解' + (PRESETS[m.key] ? PRESETS[m.key].name : '') + '：第 ' + m.t + ' 次，可剝削度 ' + fmt(m.pct, 2) + '%'; });
W.on('bench-done', () => {
  BENCH.running = false;
  $('bBench').disabled = false; $('bCopy').disabled = false;
  $('benchMsg').textContent = '跑完了，總共 ' + fmt((Date.now() - BENCH.t0) / 1000, 0) + ' 秒。' + (BENCH.calibrated ? 'GTO 工作室的時間估計已經照這台裝置的速度更新。' : '') + '按「複製結果」貼回對話。';
});

function initBench() {
  $('devInfo').textContent = devText();
  $('bBench').addEventListener('click', () => {
    if (BENCH.running) return;
    if (ST.running) { $('benchMsg').textContent = 'GTO 工作室正在算（求解或多翻牌報告）：先等它算完或停下來，測出來的速度才準。'; return; }
    BENCH.running = true; BENCH.res = []; BENCH.t0 = Date.now();
    renderBench();
    $('bBench').disabled = true; $('bCopy').disabled = true;
    $('benchMsg').textContent = '測試中…';
    const k = autoThreads(); W.helpers(k >= 2 ? k : 0);
    W.send({ cmd: 'bench', big: $('bigChk').checked });
  });
  $('bCopy').addEventListener('click', async () => {
    const t = benchText();
    try { await navigator.clipboard.writeText(t); $('benchMsg').textContent = '已複製，貼回對話就可以。'; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.width = '100%'; ta.rows = 8;
      $('benchMsg').textContent = '這個瀏覽器不能自動複製，請長按下面的文字全選複製：';
      $('benchMsg').after(ta); ta.select();
    }
  });
}
