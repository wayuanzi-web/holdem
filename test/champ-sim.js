/* 冠軍教練 vs 穩健教練 vs 電腦：同樣的發牌、同樣的電腦亂數（每一手各自的種子），比每百手贏幾個大盲
   用法：node test/champ-sim.js 手數 種子 等級 [模式...]（模式：coach、champ、champ2（加整手模擬）、ai）；CHAMP_OPTS='{"runs":16}' 調參數；SIM_N 模擬次數
   兩個模式時另外印：兩邊第一個不一樣的決定（街・穩健→冠軍）分類的差 */
const E = require('./engine');
const HANDS = +(process.argv[2] || 400), SEED = +(process.argv[3] || 7), LEVEL = +(process.argv[4] || 2);
const MODES = process.argv.slice(5).length ? process.argv.slice(5) : ['coach', 'champ'];
if (process.env.CHAMP_OPTS) Object.assign(E.CHAMP, JSON.parse(process.env.CHAMP_OPTS));
const ST = ['pre', 'flop', 'turn', 'river'];
function run(mode) {
  const rng0 = E.makeRng(SEED);
  const n = 6, opp = E.makeOpponents(n, LEVEL, rng0);
  const T = E.newTable({ n, names: ['你'].concat(opp.map((o) => o.name)), styles: ['tag'].concat(opp.map((o) => o.style)), level: LEVEL });
  let ms = 0, nAdv = 0;
  const acts = { f: 0, x: 0, c: 0, r: 0 }, nets = [], seqs = [];
  for (let h = 0; h < HANDS; h++) {
    for (const s of T.seats) s.stack = 200;                           // 每手都 100 大盲
    const H = E.newHand(T, E.makeRng(SEED * 100003 + h * 7919));
    const rng = E.makeRng(SEED * 7777 + h * 31 + 5);
    const seq = [];
    while (H.phase !== 'done') {
      const r = E.gameStep(H);
      if (r.need === undefined) continue;
      let a;
      if (r.need === 0) {
        const t0 = Date.now();
        if (mode === 'ai') a = E.aiDecide(H, rng, 3);
        else if (mode === 'champ') a = E.champAdvice(H, rng, LEVEL).act;
        else if (mode === 'champ2') {                                   // 冠軍＋整手模擬
          const adv = E.champAdvice(H, rng, LEVEL);
          a = adv.act;
          if (E.champNeedSim(adv)) a = E.champMerge(adv, E.champRollout(H, 0, LEVEL, E.champSimCands(adv), { N: +(process.env.SIM_N || 150) }), H).act;
        }
        else a = E.coachAdvice(H, rng).act;
        ms += Date.now() - t0; nAdv++;
        const t = a.t === 'r' ? 'r' : a.t;
        acts[t]++; seq.push(ST[H.street] + ':' + t);
      } else a = E.aiDecide(H, rng, LEVEL);
      E.applyAction(H, a);
    }
    E.endHand(T, H);
    nets.push(H.result.net[0]); seqs.push(seq);
  }
  const net = nets.reduce((a, b) => a + b, 0), mean = net / HANDS;
  const sd = Math.sqrt(nets.reduce((s, x) => s + (x - mean) ** 2, 0) / HANDS);
  return { mode, bb100: net / 2 / HANDS * 100, se: sd / 2 / Math.sqrt(HANDS) * 100, ms: ms / Math.max(1, nAdv), acts, nets, seqs };
}
const res = MODES.map(run);
for (const r of res) console.log(r.mode.padEnd(6), (r.bb100 >= 0 ? '+' : '') + r.bb100.toFixed(1), '大盲/百手（±' + r.se.toFixed(1) + '）', '每次 ' + r.ms.toFixed(1) + ' ms', JSON.stringify(r.acts));
if (res.length >= 2) {
  const A = res[0], B = res[1];
  const d = B.nets.map((x, i) => x - A.nets[i]), m = d.reduce((a, b) => a + b, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / d.length);
  console.log(B.mode + ' − ' + A.mode + '：' + (m / 2 * 100).toFixed(1) + ' 大盲/百手（±' + (sd / 2 / Math.sqrt(d.length) * 100).toFixed(1) + '）');
  const cat = {};
  for (let i = 0; i < d.length; i++) {
    const a = A.seqs[i], b = B.seqs[i];
    let j = 0;
    while (j < a.length && j < b.length && a[j] === b[j]) j++;
    if (j === a.length && j === b.length) continue;
    const key = (b[j] || a[j]).split(':')[0] + ' ' + (a[j] ? a[j].split(':')[1] : '-') + '→' + (b[j] ? b[j].split(':')[1] : '-');
    (cat[key] = cat[key] || { n: 0, s: 0 }).n++; cat[key].s += d[i];
  }
  console.log('CAT ' + JSON.stringify(Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, [v.n, Math.round(v.s)]]))));
}
