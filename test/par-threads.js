/* 真的開背景執行緒（worker_threads）跑分工求解，量一個人算 vs k 個幫手的速度
   node test/par-threads.js [k] [迭代次數] [局面：flop3bet|flop|turn] */
const { Worker } = require('worker_threads');
const E = require('./engine');
const K = +(process.argv[2] || 2), IT = +(process.argv[3] || 10), KEY = process.argv[4] || 'flop3bet';
const src = E.engineSource() + `
const { parentPort } = require('worker_threads');
parentPort.on('message', (m) => { let r; try { r = helperHandle(m.msg); } catch (e) { r = { error: e.message }; } parentPort.postMessage({ req: m.req, r }); });`;
(async () => {
  const cfg = E.presetCfg(KEY, { maxMB: 0 });
  const t0 = Date.now();
  const one = new E.Solver(cfg); one.iterate(IT);
  const ms1 = Date.now() - t0;
  const x1 = one.exploit();
  const ws = [], pend = new Map(); let req = 0;
  for (let i = 0; i < K; i++) {
    const w = new Worker(src, { eval: true });
    w.on('message', (m) => { const f = pend.get(m.req); pend.delete(m.req); f(m.r); });
    ws.push(w);
  }
  const send = (i, msg) => new Promise((res) => { const q = ++req; pend.set(q, res); ws[i].postMessage({ req: q, msg }); });
  const par = new E.ParSolver(cfg, K, send);
  await par.init();
  const t1 = Date.now();
  await par.iterate(IT);
  const ms2 = Date.now() - t1;
  const x2 = await par.exploit();
  console.log(KEY, 'n', one.n.join('/'), '｜一個人', IT, '次', ms1, 'ms，可剝削度', x1.pct.toFixed(2) + '%', '｜', K, '個幫手', ms2, 'ms，可剝削度', x2.pct.toFixed(2) + '%', '｜快', (ms1 / ms2).toFixed(2), '倍');
  for (const w of ws) w.terminate();
  if (Math.abs(x1.pct - x2.pct) > Math.max(0.5, x1.pct * 0.1)) { console.log('結果差太多'); process.exit(1); }
})();
