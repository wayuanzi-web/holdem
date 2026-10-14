/* ===== 45-cfr：兩人翻牌後 GTO 求解器（Discounted CFR，向量化） =====
   - 每個決策點、每一手牌一組 regret 和累積策略（Float32Array）；同一個樣板節點在不同發牌下各有一份
     （第 inst 份：inst = 發過的牌在剩下的牌堆裡的位置，D 進位）。
   - 一次走一個玩家（交替更新）：traverser 的節點算各動作的價值、更新 regret；對手的節點照對手現在的策略分配到達機率。
   - 攤牌：雙方手牌照牌力排好，一次掃過算「贏過、輸給、平手」的對手到達機率（扣掉跟自己撞牌的），O(n)。
   - DCFR(α 1.5, β 0, γ 2)：正 regret 乘 t^1.5/(t^1.5+1)、負的乘 1/2，累積策略的權重 ∝ t²。
   - 價值的單位：這一局（從現在開始）贏回來的籌碼 − 這一局自己投進去的；兩人加起來永遠等於開始的底池。 */
const M_CFR = 0, M_BR = 1, M_EV = 2;

function Solver(cfg) {
  this.cfg = cfg;
  this.board = cfg.board.slice();
  this.P0 = cfg.pot;
  const tree = buildTree(cfg);
  this.tree = tree; this.root = tree.root; this.nodes = tree.nodes;
  const dead = new Uint8Array(52);
  for (const c of this.board) dead[c] = 1;
  // 雙方的手牌（權重 > 0、不跟公牌撞）
  this.H = []; this.W = []; this.HA = []; this.HB = []; this.n = [];
  for (let p = 0; p < 2; p++) {
    const w = cfg.ranges[p], hs = [], ws = [];
    for (let k = 0; k < NCOMBO; k++) if (w[k] > 0 && !dead[COMBO_A[k]] && !dead[COMBO_B[k]]) { hs.push(k); ws.push(w[k]); }
    if (!hs.length) throw new Error((p ? 'IP' : 'OOP') + ' 的範圍是空的');
    this.H.push(Int16Array.from(hs)); this.W.push(Float32Array.from(ws));
    this.HA.push(Uint8Array.from(hs, (k) => COMBO_A[k])); this.HB.push(Uint8Array.from(hs, (k) => COMBO_B[k]));
    this.n.push(hs.length);
  }
  // 同一手牌在對方清單裡的位置；含某張牌的手牌清單
  this.same = []; this.withCard = [];
  for (let p = 0; p < 2; p++) {
    const idx = new Int32Array(NCOMBO).fill(-1);
    this.H[1 - p].forEach((k, i) => { idx[k] = i; });
    this.same.push(Int32Array.from(this.H[p], (k) => idx[k]));
    const wc = [];
    for (let c = 0; c < 52; c++) wc.push([]);
    for (let i = 0; i < this.n[p]; i++) { wc[this.HA[p][i]].push(i); wc[this.HB[p][i]].push(i); }
    this.withCard.push(wc.map((a) => Int16Array.from(a)));
  }
  // 牌堆
  const deck = [];
  for (let c = 0; c < 52; c++) if (!dead[c]) deck.push(c);
  this.deck = Uint8Array.from(deck); this.D = deck.length;
  this.pos = new Int8Array(52).fill(-1);
  deck.forEach((c, i) => { this.pos[c] = i; });
  // 儲存空間
  let total = 0, kmax = 1, depth = 0;
  for (const nd of this.nodes) {
    if (nd.kind !== N_ACT) continue;
    nd.k = nd.acts.length; nd.nh = this.n[nd.p];
    nd.inst = Math.pow(this.D, nd.level);
    nd.off = total;
    total += nd.inst * nd.k * nd.nh;
    if (nd.k > kmax) kmax = nd.k;
  }
  const dep = (nd) => nd.kids ? 1 + Math.max(0, ...nd.kids.map(dep)) : 1;
  depth = dep(this.root);
  this.floats = total;
  this.memMB = (total * 8 + 52 * 52 * 0) / 1048576;
  if (cfg.maxMB && this.memMB > cfg.maxMB) { const e = new Error('記憶體不夠：這棵樹要 ' + Math.round(this.memMB) + ' MB'); e.mem = this.memMB; throw e; }
  this.R = new Float32Array(total);
  this.S = new Float32Array(total);
  const nmax = Math.max(this.n[0], this.n[1]);
  this.scr = new Float32Array((depth + 2) * (2 * kmax * nmax + 6 * nmax) + 64);
  this.sp = 0;
  this.cw = new Float64Array(52); this.ct = new Float64Array(52);
  this.tmp64 = new Float64Array(nmax); this.tmp64b = new Float64Array(nmax);
  this.strCache = new Map();
  this.t = 0;
  this.reachW = !(cfg.dcfr && cfg.dcfr.reachW === false);
  this.out = [new Float32Array(this.n[0]), new Float32Array(this.n[1])];
  // 兩人的手牌「不撞牌」的配對總權重（算期望值時要除）
  this.Z = this.pairWeight(this.W[0], this.W[1]);
}

/* 不配置記憶體，先估這棵樹要多少：決策點數、MB */
function estimateSolve(cfg) {
  const tree = buildTree(cfg);
  const dead = new Uint8Array(52);
  for (const c of cfg.board) dead[c] = 1;
  const n = [0, 0];
  for (let p = 0; p < 2; p++) for (let k = 0; k < NCOMBO; k++) if (cfg.ranges[p][k] > 0 && !dead[COMBO_A[k]] && !dead[COMBO_B[k]]) n[p]++;
  const D = 52 - cfg.board.length;
  let floats = 0, work = 0;
  for (const nd of tree.nodes) {
    const inst = Math.pow(D, nd.level);
    if (nd.kind === N_ACT) { floats += inst * nd.acts.length * n[nd.p]; work += inst * nd.acts.length * (n[0] + n[1]); }
    else if (nd.kind !== N_CHANCE) work += inst * (n[0] + n[1]) * 2;
  }
  // work：每次迭代大約要做的「手牌 × 動作」運算量，拿來從一個樹的實測時間推估另一個樹
  return { mb: floats * 8 / 1048576, n, stats: treeStats(tree), work, tree };
}

Solver.prototype.alloc = function (len) { const a = this.scr.subarray(this.sp, this.sp + len); this.sp += len; return a; };

/* 給 p 的每手牌：對手（到達機率 r）裡不跟它撞牌的總和 */
Solver.prototype.compat = function (p, r, out) {
  const o = 1 - p, HAo = this.HA[o], HBo = this.HB[o], ct = this.ct;
  ct.fill(0);
  let tot = 0;
  for (let j = 0, n = this.n[o]; j < n; j++) { const x = r[j]; if (x === 0) continue; tot += x; ct[HAo[j]] += x; ct[HBo[j]] += x; }
  const HA = this.HA[p], HB = this.HB[p], sm = this.same[p];
  for (let h = 0, n = this.n[p]; h < n; h++) { const s = sm[h]; out[h] = tot - ct[HA[h]] - ct[HB[h]] + (s >= 0 ? r[s] : 0); }
  return out;
};
Solver.prototype.pairWeight = function (w0, w1) {
  const c = this.compat(0, w1, new Float32Array(this.n[0]));
  let z = 0;
  for (let h = 0; h < this.n[0]; h++) z += w0[h] * c[h];
  return z;
};

/* 一個完整公牌（開始的公牌＋發的 ca、cb）的牌力排序 */
Solver.prototype.strengths = function (ca, cb) {
  const key = ca < 0 ? -1 : cb < 0 ? ca : (ca < cb ? ca * 52 + cb : cb * 52 + ca);
  let t = this.strCache.get(key);
  if (t) return t;
  const B = boardState(this.board);
  if (ca >= 0) boardAdd(B, ca);
  if (cb >= 0) boardAdd(B, cb);
  t = { ord: [], val: [] };
  for (let p = 0; p < 2; p++) {
    const HA = this.HA[p], HB = this.HB[p], idx = [], val = [];
    for (let h = 0; h < this.n[p]; h++) {
      const a = HA[h], b = HB[h];
      if (a === ca || a === cb || b === ca || b === cb) continue;
      idx.push(h); val.push(evalAdd2(B, a, b));
    }
    const ord = idx.map((h, i) => i).sort((x, y) => val[x] - val[y]);
    t.ord.push(Int16Array.from(ord, (i) => idx[i]));
    t.val.push(Int32Array.from(ord, (i) => val[i]));
  }
  this.strCache.set(key, t);
  return t;
};

/* 攤牌：贏拿 win、輸拿 lose、平手拿 tie（乘上對手的到達機率）。
   雙方手牌照牌力由小到大掃一次：每一組同樣牌力的手牌，記下「比它弱」和「不比它強」的對手總和（扣掉撞牌的） */
Solver.prototype.showdownCore = function (t, ca, cb, opp, out, win, lose, tie) {
  const tb = this.strengths(ca, cb), o = 1 - t;
  const ordT = tb.ord[t], valT = tb.val[t], ordO = tb.ord[o], valO = tb.val[o];
  const HAo = this.HA[o], HBo = this.HB[o], HAt = this.HA[t], HBt = this.HB[t], sm = this.same[t];
  const cw = this.cw, lt = this.tmp64, le = this.tmp64b;
  const nT = ordT.length, nO = ordO.length;
  out.fill(0);
  cw.fill(0);
  let s = 0, i = 0, j = 0;
  while (i < nT) {
    const v = valT[i];
    while (j < nO && valO[j] < v) { const g = ordO[j], x = opp[g]; if (x !== 0) { s += x; cw[HAo[g]] += x; cw[HBo[g]] += x; } j++; }
    let i2 = i;
    while (i2 < nT && valT[i2] === v) { const h = ordT[i2]; lt[h] = s - cw[HAt[h]] - cw[HBt[h]]; i2++; }
    while (j < nO && valO[j] === v) { const g = ordO[j], x = opp[g]; if (x !== 0) { s += x; cw[HAo[g]] += x; cw[HBo[g]] += x; } j++; }
    for (let q = i; q < i2; q++) { const h = ordT[q], m = sm[h]; le[h] = s - cw[HAt[h]] - cw[HBt[h]] + (m >= 0 ? opp[m] : 0); }
    i = i2;
  }
  while (j < nO) { const g = ordO[j], x = opp[g]; if (x !== 0) { s += x; cw[HAo[g]] += x; cw[HBo[g]] += x; } j++; }
  // win·lt + tie·(le − lt) + lose·(comp − le) ＝ (win − tie)·lt + (tie − lose)·le + lose·comp
  const kw = win - tie, kt = tie - lose;
  for (let q = 0; q < nT; q++) {
    const h = ordT[q], m = sm[h];
    const comp = s - cw[HAt[h]] - cw[HBt[h]] + (m >= 0 ? opp[m] : 0);
    out[h] = kw * lt[h] + kt * le[h] + lose * comp;
  }
};

Solver.prototype.terminal = function (nd, ca, cb, t, opp, out) {
  if (nd.kind === N_SHOW) {
    const inv = nd.inv0;
    this.showdownCore(t, ca, cb, opp, out, this.P0 + inv, -inv, this.P0 / 2);
  } else {
    const f = nd.p, invf = f ? nd.inv1 : nd.inv0;
    const pay = t === f ? -invf : this.P0 + invf;
    this.compat(t, opp, out);
    for (let h = 0, n = this.n[t]; h < n; h++) out[h] *= pay;
  }
};

/* 現在的策略（regret matching）、平均策略：寫進 buf（k × n） */
Solver.prototype.curStrat = function (nd, inst, buf) {
  const k = nd.k, n = nd.nh, R = this.R, base = nd.off + inst * k * n;
  for (let h = 0; h < n; h++) {
    let sum = 0;
    for (let a = 0; a < k; a++) { const x = R[base + a * n + h]; if (x > 0) sum += x; }
    if (sum > 0) { const inv = 1 / sum; for (let a = 0; a < k; a++) { const x = R[base + a * n + h]; buf[a * n + h] = x > 0 ? x * inv : 0; } }
    else { const u = 1 / k; for (let a = 0; a < k; a++) buf[a * n + h] = u; }
  }
};
Solver.prototype.avgStrat = function (nd, inst, buf) {
  const k = nd.k, n = nd.nh, S = this.S, base = nd.off + inst * k * n;
  for (let h = 0; h < n; h++) {
    let sum = 0;
    for (let a = 0; a < k; a++) sum += S[base + a * n + h];
    if (sum > 0) { const inv = 1 / sum; for (let a = 0; a < k; a++) buf[a * n + h] = S[base + a * n + h] * inv; }
    else { const u = 1 / k; for (let a = 0; a < k; a++) buf[a * n + h] = u; }
  }
};

/* 走一次樹。mode：M_CFR 訓練、M_BR 最佳反應（traverser 每手牌挑最好的動作，對手用平均策略）、M_EV 雙方都用平均策略 */
Solver.prototype.walk = function (mode, nd, inst, ca, cb, t, own, opp, out) {
  const kind = nd.kind;
  if (kind === N_FOLD || kind === N_SHOW) { this.terminal(nd, ca, cb, t, opp, out); return; }
  const sp0 = this.sp, o = 1 - t, nT = this.n[t], nO = this.n[o];
  if (kind === N_CHANCE) {
    const cOwn = this.alloc(nT), cOpp = this.alloc(nO), cOut = this.alloc(nT);
    out.fill(0);
    const child = nd.kids[0], D = this.D, deck = this.deck, wT = this.withCard[t], wO = this.withCard[o];
    for (let i = 0; i < D; i++) {
      const c = deck[i];
      if (c === ca || c === cb) continue;
      cOwn.set(own); const lt = wT[c]; for (let q = 0; q < lt.length; q++) cOwn[lt[q]] = 0;
      cOpp.set(opp); const lo = wO[c]; for (let q = 0; q < lo.length; q++) cOpp[lo[q]] = 0;
      this.walk(mode, child, inst * D + i, ca < 0 ? c : ca, ca < 0 ? -1 : c, t, cOwn, cOpp, cOut);
      for (let q = 0; q < lt.length; q++) cOut[lt[q]] = 0;
      for (let h = 0; h < nT; h++) out[h] += cOut[h];
    }
    const rem = 52 - this.board.length - nd.level;
    const f = 1 / (rem - 4);
    for (let h = 0; h < nT; h++) out[h] *= f;
    this.sp = sp0;
    return;
  }
  const k = nd.k, kids = nd.kids;
  if (nd.p === t) {
    const n = nT, vals = this.alloc(k * n), strat = this.alloc(k * n), reach = this.alloc(n);
    if (mode === M_BR) {
      for (let a = 0; a < k; a++) this.walk(mode, kids[a], inst, ca, cb, t, own, opp, vals.subarray(a * n, a * n + n));
      for (let h = 0; h < n; h++) { let m = vals[h]; for (let a = 1; a < k; a++) { const x = vals[a * n + h]; if (x > m) m = x; } out[h] = m; }
      this.sp = sp0; return;
    }
    if (mode === M_CFR) this.curStrat(nd, inst, strat); else this.avgStrat(nd, inst, strat);
    out.fill(0);
    for (let a = 0; a < k; a++) {
      const sa = strat.subarray(a * n, a * n + n), va = vals.subarray(a * n, a * n + n);
      for (let h = 0; h < n; h++) reach[h] = own[h] * sa[h];
      this.walk(mode, kids[a], inst, ca, cb, t, reach, opp, va);
      for (let h = 0; h < n; h++) out[h] += sa[h] * va[h];
    }
    if (mode === M_CFR) {
      const R = this.R, S = this.S, base = nd.off + inst * k * n, dp = this.dPos, dn = this.dNeg, ds = this.dStr;
      const rw = this.reachW;
      for (let a = 0; a < k; a++) {
        const ofs = base + a * n, ao = a * n;
        for (let h = 0; h < n; h++) {
          let r = R[ofs + h];
          r = r > 0 ? r * dp : r * dn;
          r += vals[ao + h] - out[h];
          R[ofs + h] = (r > 1e-25 || r < -1e-25) ? r : 0;          // 太小的直接歸零（避免 Float32 的次正規數拖慢）
          const x = S[ofs + h] * ds + (rw ? own[h] * strat[ao + h] : strat[ao + h]);
          S[ofs + h] = x > 1e-25 ? x : 0;
        }
      }
    }
    this.sp = sp0;
    return;
  }
  // 對手的節點
  const n = nO, strat = this.alloc(k * n), reach = this.alloc(n), tmp = this.alloc(nT);
  if (mode === M_CFR) this.curStrat(nd, inst, strat); else this.avgStrat(nd, inst, strat);
  out.fill(0);
  for (let a = 0; a < k; a++) {
    const sa = strat.subarray(a * n, a * n + n);
    let any = false;
    for (let h = 0; h < n; h++) { const x = opp[h] * sa[h]; reach[h] = x; if (x !== 0) any = true; }
    if (!any) continue;                                 // 對手不會走這條：價值是 0
    this.walk(mode, kids[a], inst, ca, cb, t, own, reach, tmp);
    for (let h = 0; h < nT; h++) out[h] += tmp[h];
  }
  this.sp = sp0;
};

/* 跑 iters 次（每次兩個玩家各更新一次）。
   折扣：正 regret × t^1.5/(t^1.5+1)、負 regret × 0.5；
   累積策略照 postflop-solver 的做法：每到 4 的次方（1、4、16、64、256…）重新開始累積，權重 ((t−p)/(t−p+1))^3 */
Solver.prototype.iterate = function (iters) {
  const o = this.cfg.dcfr || {};
  const alpha = o.alpha === undefined ? 1.5 : o.alpha, gamma = o.gamma === undefined ? 3 : o.gamma, reset = o.reset !== false;
  for (let i = 0; i < (iters || 1); i++) {
    this.t++;
    const t = this.t, tp = t - 1, pa = Math.pow(tp, alpha);
    this.dPos = tp > 0 ? pa / (pa + 1) : 0;
    this.dNeg = 0.5;
    if (reset) {
      let p4 = 1;
      while (p4 * 4 <= t) p4 *= 4;
      const tg = t - p4;
      this.dStr = Math.pow(tg / (tg + 1), gamma);
    } else this.dStr = tp > 0 ? Math.pow(tp / t, gamma) : 0;
    for (let p = 0; p < 2; p++) this.walk(M_CFR, this.root, 0, -1, -1, p, this.W[p], this.W[1 - p], this.out[p]);
  }
};

/* 期望值（平均策略）與可剝削度 */
Solver.prototype.value = function (mode, p) {
  this.walk(mode, this.root, 0, -1, -1, p, this.W[p], this.W[1 - p], this.out[p]);
  let v = 0;
  const w = this.W[p], out = this.out[p];
  for (let h = 0; h < this.n[p]; h++) v += w[h] * out[h];
  return v / this.Z;
};
Solver.prototype.exploit = function () {
  const b0 = this.value(M_BR, 0), b1 = this.value(M_BR, 1);
  const chips = (b0 + b1 - this.P0) / 2;
  return { br: [b0, b1], chips, pct: chips / this.P0 * 100 };
};
Solver.prototype.evs = function () { return [this.value(M_EV, 0), this.value(M_EV, 1)]; };

/* 解到可剝削度低於 targetPct（% 底池）或跑滿 maxIters；每 every 次檢查一次。onStep 回傳 false 就停 */
Solver.prototype.solve = function (opt) {
  const target = opt.target === undefined ? 0.5 : opt.target, maxIters = opt.maxIters || 1000, every = opt.every || 10;
  let ex = null;
  while (this.t < maxIters) {
    this.iterate(Math.min(every, maxIters - this.t));
    ex = this.exploit();
    if (opt.onStep && opt.onStep(this.t, ex) === false) break;
    if (ex.pct <= target) break;
  }
  return ex;
};

/* ===== 瀏覽：照路徑走到某個節點 =====
   path：[{a: 動作編號} 或 {c: 牌}]。回傳節點、這份資料的編號、發的牌、雙方到這裡的到達機率（平均策略） */
Solver.prototype.locate = function (path) {
  let nd = this.root, inst = 0, ca = -1, cb = -1;
  const reach = [Float32Array.from(this.W[0]), Float32Array.from(this.W[1])];
  const buf = new Float32Array(16 * Math.max(this.n[0], this.n[1]));
  for (const st of path || []) {
    if (nd.kind === N_ACT) {
      const a = st.a, n = nd.nh;
      if (!(a >= 0 && a < nd.k)) break;
      this.avgStrat(nd, inst, buf);
      const r = reach[nd.p];
      for (let h = 0; h < n; h++) r[h] *= buf[a * n + h];
      nd = nd.kids[a];
    } else if (nd.kind === N_CHANCE) {
      const c = st.c;
      if (!(c >= 0) || this.pos[c] < 0 || c === ca || c === cb) break;
      for (let p = 0; p < 2; p++) { const l = this.withCard[p][c]; for (let q = 0; q < l.length; q++) reach[p][l[q]] = 0; }
      inst = inst * this.D + this.pos[c];
      if (ca < 0) ca = c; else cb = c;
      nd = nd.kids[0];
    } else break;
  }
  return { nd, inst, ca, cb, reach };
};

/* 一個節點的完整資料（給畫面用）：雙方到達機率、輪到的人每手牌的策略、每個動作的 EV、每手牌的 EV 與勝率 */
Solver.prototype.nodeView = function (path) {
  const L = this.locate(path), nd = L.nd;
  const board = this.board.slice();
  if (L.ca >= 0) board.push(L.ca);
  if (L.cb >= 0) board.push(L.cb);
  const v = { kind: nd.kind, board, reach: L.reach, pot: this.P0 + nd.inv0 + nd.inv1, inv: [nd.inv0, nd.inv1], street: nd.street,
    hands: this.H, n: this.n };
  if (nd.kind === N_CHANCE) {
    const ok = [];
    for (let i = 0; i < this.D; i++) { const c = this.deck[i]; if (c !== L.ca && c !== L.cb) ok.push(c); }
    v.cards = ok;
    return v;
  }
  if (nd.kind !== N_ACT) return v;
  const p = nd.p, o = 1 - p, n = nd.nh, k = nd.k;
  v.p = p; v.acts = nd.acts.map((a) => ({ t: a.t, add: a.add, to: a.to, label: actLabel(a) })); v.facing = nd.facing;
  const strat = new Float32Array(k * n);
  this.avgStrat(nd, L.inst, strat);
  v.strat = strat;
  // 每個動作的 EV（每手牌）、整體 EV：對手照平均策略、自己之後也照平均策略
  const comp = this.compat(p, L.reach[o], new Float32Array(n));
  const evA = new Float32Array(k * n), tmp = new Float32Array(n);
  this.sp = 0;
  for (let a = 0; a < k; a++) {
    this.walk(M_EV, nd.kids[a], L.inst, L.ca, L.cb, p, L.reach[p], L.reach[o], tmp);
    for (let h = 0; h < n; h++) evA[a * n + h] = comp[h] > 0 ? tmp[h] / comp[h] : 0;
  }
  const ev = new Float32Array(n);
  for (let h = 0; h < n; h++) { let s = 0; for (let a = 0; a < k; a++) s += strat[a * n + h] * evA[a * n + h]; ev[h] = s; }
  v.evA = evA; v.ev = ev; v.comp = comp;
  v.eq = this.equityAt(p, L.ca, L.cb, nd.level, L.reach[o]);
  // 對手那一邊也算勝率（看範圍對範圍用）
  v.eqO = this.equityAt(o, L.ca, L.cb, nd.level, L.reach[p]);
  return v;
};

/* 每手牌對「對手現在的範圍」的勝率（發完所有牌、攤牌） */
Solver.prototype.equityAt = function (t, ca, cb, level, opp) {
  const n = this.n[t], out = new Float32Array(n);
  const rec = (ca, cb, level, oppR, res) => {
    if (this.board.length + level >= 5) { this.showdownCore(t, ca, cb, oppR, res, 1, 0, 0.5); return; }
    res.fill(0);
    const cO = new Float32Array(oppR.length), cR = new Float32Array(n);
    for (let i = 0; i < this.D; i++) {
      const c = this.deck[i];
      if (c === ca || c === cb) continue;
      cO.set(oppR); const lo = this.withCard[1 - t][c]; for (let q = 0; q < lo.length; q++) cO[lo[q]] = 0;
      rec(ca < 0 ? c : ca, ca < 0 ? -1 : c, level + 1, cO, cR);
      const lt = this.withCard[t][c]; for (let q = 0; q < lt.length; q++) cR[lt[q]] = 0;
      for (let h = 0; h < n; h++) res[h] += cR[h];
    }
    const f = 1 / (52 - this.board.length - level - 4);
    for (let h = 0; h < n; h++) res[h] *= f;
  };
  rec(ca, cb, level, opp, out);
  const comp = this.compat(t, opp, new Float32Array(n));
  for (let h = 0; h < n; h++) out[h] = comp[h] > 0 ? out[h] / comp[h] : 0;
  return out;
};
