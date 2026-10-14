/* 同構（花色互換）與壓縮：結果要跟不用的時候一樣（壓縮只差一點點） */
const E = require('./engine');
const P = E.parseCards;
let bad = 0;
/* 同構在數學上一樣，但浮點數的加法順序不同，DCFR 會把 1e-7 的差放大（本來是 0 的 regret 變成正負一點點）：
   所以「完全一樣」只比前 3 次；跑久一點只比收斂的程度 */
function run(name, base, iters) {
  const res = {};
  {
    const a = new E.Solver(Object.assign({}, base, { iso: false })), b = new E.Solver(base);
    a.iterate(3); b.iterate(3);
    const ea = a.evs(), eb = b.evs(), xa = a.exploit(), xb = b.exploit();
    const d = Math.max(Math.abs(ea[0] - eb[0]), Math.abs(xa.br[0] - xb.br[0]), Math.abs(xa.br[1] - xb.br[1]));
    if (d > 1e-5) { bad++; console.log(name, '前 3 次就不一樣', d); }
  }
  for (const [tag, over] of [['plain', { iso: false }], ['iso', {}], ['iso+16bit', { compress: true }]]) {
    const cfg = Object.assign({}, base, over);
    const s = new E.Solver(cfg);
    const t0 = Date.now();
    s.iterate(iters);
    const ex = s.exploit(), ev = s.evs();
    res[tag] = { ex, ev, ms: Date.now() - t0, mb: s.memMB, canon: s.canon1.length + '/' + s.D };
    // 隨便看一個河牌節點：用實際的牌走過去，非代表牌也要看得到
    const path = [];
    let nd = s.root;
    while (nd.kind !== E.N_SHOW && nd.kind !== E.N_FOLD) {
      if (nd.kind === E.N_CHANCE) { const c = s.deck.find((x) => (x & 3) === 3 && !path.some((q) => q.c === x)); path.push({ c }); nd = nd.kids[0]; continue; }
      if (nd.kids.length < 2) break;
      const a = nd.acts.findIndex((q) => q.t === 'x' || q.t === 'c'); path.push({ a }); nd = nd.kids[a];
      if (nd.kind === E.N_ACT && nd.level === s.maxLevel) break;
    }
    const v = s.nodeView(path);
    res[tag].view = v.ev ? Array.from(v.ev).slice(0, 6).map((x) => x.toFixed(4)).join(' ') : v.kind;
    res[tag].board = v.board.map(E.cardTxt).join('');
  }
  const a = res.plain, b = res.iso, c = res['iso+16bit'];
  const ok = Math.abs(a.ex.pct - b.ex.pct) < Math.max(0.1, a.ex.pct * 0.05) && Math.abs(a.ev[0] - b.ev[0]) < 0.02 * base.pot;
  if (!ok) bad++;
  console.log(name, ok ? 'OK' : '✗', '代表牌', b.canon, '| 不用同構', a.ex.pct.toFixed(3) + '%', a.ms + 'ms', a.mb.toFixed(1) + 'MB',
    '| 同構', b.ex.pct.toFixed(3) + '%', b.ms + 'ms', b.mb.toFixed(1) + 'MB', '| 壓縮', c.ex.pct.toFixed(3) + '%', c.mb.toFixed(1) + 'MB', '| 節點', b.board);
  if (!ok) console.log('  ev', a.ev, b.ev, '\n  view', a.view, '\n       ', b.view);
  if (!/\d/.test(b.view)) { bad++; console.log('  看不到非代表牌的節點'); }
  if (Math.abs(c.ex.pct - a.ex.pct) > Math.max(0.3, a.ex.pct * 0.15)) { bad++; console.log('  壓縮差太多'); }
}
const R0 = E.parseRange('22-99,A2s-AJs,K9s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,64s+,53s+,A9o-AJo,KTo+');
const R1 = E.parseRange('22+,A2s+,K5s+,Q8s+,J8s+,T7s+,96s+,85s+,74s+,64s+,53s+,A8o+,KTo+,QTo+,JTo');
run('轉牌 兩張方塊兩張紅心', { board: P('Kd5d6h9h'), pot: 10, stack: 40, ranges: [R0, R1], bet: { turn: [[66], [66]], river: [[75], [75]] }, raise: { turn: [['a'], ['a']], river: [['a'], ['a']] }, cap: 2 }, 40);
run('翻牌 單一花色', { board: P('Kd5d6d'), pot: 10, stack: 20, ranges: [E.parseRange('66,55,K9s,87s,A5s,QJs,T9s'), E.parseRange('KK,AKs,QQ,98s,AQs,J9s')], bet: { flop: [[50], [50]], turn: [[75], [75]], river: [[100], [100]] }, raise: { flop: [['a'], ['a']], turn: [[], []], river: [[], []] }, cap: 2 }, 10);
run('翻牌 兩色', { board: P('Kd5d6h'), pot: 10, stack: 20, ranges: [E.parseRange('66,55,K9s,87s,A5s'), E.parseRange('KK,AKs,QQ,98s,AQs')], bet: { flop: [[50], [50]], turn: [[75], [75]], river: [[100], [100]] }, raise: { flop: [['a'], ['a']], turn: [[], []], river: [[], []] }, cap: 2 }, 10);
console.log(bad ? '同構／壓縮有錯 ' + bad : '同構／壓縮 OK');
if (bad) process.exit(1);
