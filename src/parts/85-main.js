/* ===== 85-main：分頁、開始 ===== */
function showTab(id) {
  for (const [t, p] of [['tCalc', 'pCalc'], ['tSolve', 'pSolve'], ['tBench', 'pBench']]) {
    const on = t === id;
    $(t).setAttribute('aria-selected', String(on)); $(p).hidden = !on;
  }
  try { localStorage.setItem('dz-tab', id); } catch (e) { /* 沒有儲存空間也沒關係 */ }
}
document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button[role="tab"]'); if (b) showTab(b.id); });
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const ids = ['tCalc', 'tSolve', 'tBench'], i = ids.indexOf(document.activeElement.id);
  if (i < 0) return;
  const j = (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
  showTab(ids[j]); $(ids[j]).focus();
});
initCalc();
initSolver();
initBench();
try { const t = localStorage.getItem('dz-tab'); if (t && $(t)) showTab(t); } catch (e) { /* 忽略 */ }
