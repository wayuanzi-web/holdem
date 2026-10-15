/* ===== 74-learn-e：做過的題目（歷史紀錄）：每一題都記下來，可以回頭看解釋、再抽題考一次 ===== */
const HIST_MAX = 300;
/* 記一題：題目、你選的、對不對、從哪裡來的（課、快答、測驗……） */
function histAdd(LP, q, pick, ok, src, stage) {
  LP.hist = LP.hist || [];
  LP.hist.push({ q: { gen: q.gen, prompt: q.prompt, vis: q.vis, opts: q.opts, explain: q.explain, key: q.key }, pick, ok: !!ok, at: Date.now(), src: src || '', stage: stage || 0 });
  if (LP.hist.length > HIST_MAX) LP.hist.splice(0, LP.hist.length - HIST_MAX);
}
/* 篩選（新的在前）：'all' 全部、'wrong' 答錯的、'right' 答對的、數字＝第幾階 */
function histList(LP, f) {
  const a = (LP.hist || []).slice().reverse();
  if (f === 'wrong') return a.filter((h) => !h.ok);
  if (f === 'right') return a.filter((h) => h.ok);
  if (typeof f === 'number') return a.filter((h) => h.stage === f);
  return a;
}
/* 從一串做過的題目抽 n 題再考一次（同一題只出一次；選項重新打亂） */
function histSession(list, n, rng) {
  const seen = new Set(), uniq = [];
  for (const h of list) if (!seen.has(h.q.key)) { seen.add(h.q.key); uniq.push(h); }
  return shuffleArr(uniq, rng).slice(0, n).map((h) => Object.assign({}, h.q, { opts: shuffleArr(h.q.opts.slice(), rng), stage: h.stage }));
}
/* 這種題目是第幾階教的（快答、錯題本的題目用來分階篩選） */
let GEN_STAGE = null;
function genStage(gen) {
  if (!GEN_STAGE) {
    GEN_STAGE = {};
    for (const s of COURSE) for (const l of s.lessons) for (const c of [l.practice, l.quiz]) if (c) for (const g of c.gens) { const k = Array.isArray(g) ? g[0] : g; if (!(k in GEN_STAGE)) GEN_STAGE[k] = s.id; }
  }
  return GEN_STAGE[gen] || 0;
}
