/* ===== 47-par：好幾個背景執行緒一起解 =====
   協調者（Solver role 'coord'）只存第 0 層（翻牌求解＝翻牌那條街）；第一個發牌點以下的子樹（每一張轉牌）分給 k 個幫手（cfg.part）。
   每次走樹分三段：
     A. 協調者由上往下走一次，記下每個第 0 層發牌點的雙方到達機率（不更新）
     B. 幫手各自算自己那幾張牌的子樹（同時更新自己存的 regret），回傳加總
     C. 協調者用回傳的值再走一次，更新第 0 層
   send(i, 訊息) 回傳 Promise(回覆)。瀏覽器裡是 MessagePort，Node 測試裡直接呼叫 helperHandle。 */
function ParSolver(cfg, k, send) {
  this.cfg = cfg; this.k = k; this.send = send;
  const s = this.S = new Solver(Object.assign({}, cfg, { role: 'coord', part: { k, i: -1 } }));   // 協調者也要知道每張牌歸誰
  this.P0 = s.P0; this.t = 0; this.n = s.n; this.H = s.H; this.tree = s.tree; this.nodes = s.nodes;
  this.memMB = 0;
  s.remote = (nd, t, own, opp, out) => {
    if (s.collecting) { this.items.push({ id: nd.id, own: Float32Array.from(own), opp: Float32Array.from(opp) }); out.fill(0); return; }
    const v = this.vals.get(nd.id);
    if (v) out.set(v); else out.fill(0);
  };
}
ParSolver.prototype.all = function (msgFn) { const ps = []; for (let i = 0; i < this.k; i++) ps.push(this.send(i, msgFn(i))); return Promise.all(ps); };
ParSolver.prototype.init = async function () {
  const plain = Object.assign({}, this.cfg);
  delete plain.locks;
  const r = await this.all((i) => ({ cmd: 'h-init', cfg: plain, part: { k: this.k, i } }));
  for (const x of r) if (x.error) { const e = new Error(x.error); e.mem = x.mem; throw e; }
  this.memMB = r.reduce((s, x) => s + x.mem, 0) + this.S.memMB;
  if (this.cfg.locks) for (const L of this.cfg.locks) this.S.setLock(L.id, L.strat);
};
/* 從 start 這個節點走一次（mode、走的人 t），第 0 層的發牌點交給幫手 */
ParSolver.prototype.parWalk = async function (mode, t, start, inst, ca, cb, own, opp, out, params) {
  const s = this.S;
  s.collecting = true; this.items = []; s.sp = 0;
  s.walk(mode, start, inst, ca, cb, t, own, opp, out);
  s.collecting = false;
  const items = this.items;
  this.vals = new Map();
  if (items.length) {
    const rep = await this.all(() => ({ cmd: 'h-walk', mode, t, params, items: items.map((x) => ({ id: x.id, own: x.own, opp: x.opp })) }));
    const f = 1 / (52 - s.board.length - 4);
    items.forEach((x, q) => {
      const v = new Float32Array(s.n[t]);
      for (const r of rep) { const a = r.out[q]; for (let h = 0; h < v.length; h++) v[h] += a[h]; }
      for (let h = 0; h < v.length; h++) v[h] *= f;
      this.vals.set(x.id, v);
    });
  }
  s.sp = 0;
  s.walk(mode, start, inst, ca, cb, t, own, opp, out);
};
ParSolver.prototype.iterate = async function (iters) {
  const s = this.S;
  for (let i = 0; i < (iters || 1); i++) {
    this.t++; s.t = this.t;
    const params = s.setParams(this.t);
    for (let p = 0; p < 2; p++) await this.parWalk(M_CFR, p, s.root, 0, -1, -1, s.W[p], s.W[1 - p], s.out[p], params);
  }
};
ParSolver.prototype.value = async function (mode, p) {
  const s = this.S;
  await this.parWalk(mode, p, s.root, 0, -1, -1, s.W[p], s.W[1 - p], s.out[p], null);
  let v = 0;
  for (let h = 0; h < s.n[p]; h++) v += s.W[p][h] * s.out[p][h];
  return v / s.Z;
};
ParSolver.prototype.exploit = async function () {
  const b0 = await this.value(M_BR, 0), b1 = await this.value(M_BR, 1);
  const chips = (b0 + b1 - this.P0) / 2;
  return { br: [b0, b1], chips, pct: chips / this.P0 * 100 };
};
ParSolver.prototype.evs = async function () { return [await this.value(M_EV, 0), await this.value(M_EV, 1)]; };
ParSolver.prototype.setLock = function (id, strat) { return this.S.setLock(id, strat); };
/* 從協調者的位置交給擁有那張牌的幫手 */
ParSolver.prototype.handoff = function (L) {
  const j = this.S.iso0.canon[L.pending.i];
  return { owner: this.S.owner1[j], init: { id: L.nd.id, inst: L.inst, ca: L.ca, cb: L.cb, reach: [L.reach[0], L.reach[1]], sig: L.sig } };
};
ParSolver.prototype.nodeView = async function (path) {
  const s = this.S, L = s.locate(path);
  if (L.pending) {
    const h = this.handoff(L);
    return (await this.send(h.owner, { cmd: 'h-view', init: h.init, rest: path.slice(L.used) })).view;
  }
  if (L.nd.kind !== N_ACT) return s.viewAt(L);
  const { v, strat, comp } = s.viewAt(L, true);
  const nd = L.nd, p = nd.p, o = 1 - p, n = nd.nh, k = nd.k;
  const evA = new Float32Array(k * n), tmp = new Float32Array(n);
  for (let a = 0; a < k; a++) {
    await this.parWalk(M_EV, p, nd.kids[a], L.inst, L.ca, L.cb, L.reach[p], L.reach[o], tmp, null);
    for (let h = 0; h < n; h++) evA[a * n + h] = comp[h] > 0 ? tmp[h] / comp[h] : 0;
  }
  s.finishView(v, L, strat, evA, comp);
  return v;
};
ParSolver.prototype.runouts = async function (path) {
  const s = this.S, L = s.locate(path);
  if (L.pending) {
    const h = this.handoff(L);
    return (await this.send(h.owner, { cmd: 'h-runouts', init: h.init, rest: path.slice(L.used) })).data;
  }
  if (L.nd.kind !== N_CHANCE) return null;
  const init = { id: L.nd.id, inst: L.inst, ca: L.ca, cb: L.cb, reach: [L.reach[0], L.reach[1]], sig: L.sig };
  const rep = await this.all(() => ({ cmd: 'h-runouts', init, rest: [], mine: true }));
  const res = s.runoutsAt(L, () => false);                 // 只要表頭（誰先說話、有哪些動作）
  for (const r of rep) res.cards.push(...r.data.cards);
  return res;
};

/* ===== 幫手這一邊（在背景執行緒裡） ===== */
let HELP = null;
function setHelper(h) { HELP = h; }                    // 測試：同一個行程裡輪流扮演好幾個幫手
function getHelper() { return HELP; }
function helperHandle(m) {
  if (m.cmd === 'h-init') {
    HELP = null;
    try { HELP = new Solver(Object.assign({}, m.cfg, { part: m.part, maxMB: 0 })); } catch (e) { return { error: e.message, mem: e.mem }; }
    return { mem: HELP.memMB };
  }
  const s = HELP;
  if (!s) return { error: '幫手還沒準備好' };
  if (m.cmd === 'h-walk') {
    if (m.params) { s.dPos = m.params.dPos; s.dNeg = m.params.dNeg; s.dStr = m.params.dStr; }
    const t = m.t, mine = (i) => s.lmap1[i] >= 0;
    const out = m.items.map((x) => {
      const nd = s.nodes[x.id], o = new Float32Array(s.n[t]);
      s.sp = 0;
      s.chanceLoop(m.mode, nd, 0, -1, -1, t, x.own, x.opp, o, mine);
      return o;
    });
    return { out };
  }
  if (m.cmd === 'h-view') return { view: s.nodeView(m.rest, m.init) };
  if (m.cmd === 'h-runouts') {
    const L = s.locate(m.rest, m.init);
    if (L.nd.kind !== N_CHANCE) return { data: null };
    return { data: s.runoutsAt(L, m.mine ? (i) => s.lmap1[i] >= 0 : null) };
  }
  return { error: '看不懂的指令 ' + m.cmd };
}
