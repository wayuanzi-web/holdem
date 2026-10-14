/* ===== 45-cfr：兩人翻牌後 GTO 求解器（Discounted CFR，向量化） =====
   - 每個決策點、每一手牌一組 regret 和累積策略；同一個樣板節點在不同發牌下各有一份
     （全域編號 inst：第 1 層＝第一張發的牌在牌堆裡的位置 i，第 2 層＝i × D ＋ j；實際存放的位置用 lmap 換算）。
   - 同構（花色互換）：公牌上「點數集合一樣」的花色可以互換（例如兩張紅心的翻牌，黑桃和梅花沒出現，可以互換）。
     雙方範圍也對稱的時候，只算每一組裡的代表牌，其他的牌把結果的手牌對調就好：省時間也省記憶體。
   - 壓縮（cfg.compress）：regret 用 16 位元整數、累積策略用 16 位元無號整數，每一塊（一個節點的一份）一個比例；記憶體減半。
   - 分工（cfg.part = {k, i}）：第一個發牌點以下的子樹（翻牌求解＝每一張轉牌）分給 k 個背景執行緒，第 i 個只存、只算自己的；
     cfg.role = 'coord' 的只存第 0 層（47-par 的協調者用）。
   - 攤牌：雙方手牌照牌力排好，一次掃過，O(n)。
   - DCFR（α 1.5、β 0.5 倍、γ 3、累積策略在 4 的次方重新開始）。
   - 價值的單位：這一局（從開始的節點算）贏回來的籌碼 − 這一局自己投進去的；兩人加起來等於開始的底池。 */
const M_CFR = 0, M_BR = 1, M_EV = 2;

/* ===== 花色互換 ===== */
function suitMasks(board) { const m = [0, 0, 0, 0]; for (const c of board) m[c & 3] |= 1 << (c >> 2); return m; }
function swapSuitCard(c, a, b) { const s = c & 3; return s === a ? (c & ~3) | b : s === b ? (c & ~3) | a : c; }
function applySig(sig, c) { return (c & ~3) | sig[c & 3]; }
function invSig(sig) { const r = [0, 0, 0, 0]; for (let s = 0; s < 4; s++) r[sig[s]] = s; return r; }

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
  this.idx = [];                                       // 組合編號 → 這個人清單裡的位置
  for (let p = 0; p < 2; p++) { const a = new Int32Array(NCOMBO).fill(-1); this.H[p].forEach((k, i) => { a[k] = i; }); this.idx.push(a); }
  this.same = []; this.withCard = [];
  for (let p = 0; p < 2; p++) {
    const other = this.idx[1 - p];
    this.same.push(Int32Array.from(this.H[p], (k) => other[k]));
    const wc = [];
    for (let c = 0; c < 52; c++) wc.push([]);
    for (let i = 0; i < this.n[p]; i++) { wc[this.HA[p][i]].push(i); wc[this.HB[p][i]].push(i); }
    this.withCard.push(wc.map((a) => Int16Array.from(a)));
  }
  const deck = [];
  for (let c = 0; c < 52; c++) if (!dead[c]) deck.push(c);
  this.deck = Uint8Array.from(deck); this.D = deck.length;
  this.pos = new Int8Array(52).fill(-1);
  deck.forEach((c, i) => { this.pos[c] = i; });
  // 同構
  this.useIso = cfg.iso !== false;
  this.symCache = new Map(); this.permCache = new Map(); this.isoCache = new Map();
  this.iso0 = this.isoFor(this.board);
  // 儲存位置：第 1 層、第 2 層的 inst → 本地編號
  const D = this.D, part = cfg.part, coord = cfg.role === 'coord';
  const maxLevel = 3 - (this.board.length - 3) - 1;      // 翻牌 2、轉牌 1、河牌 0
  this.maxLevel = maxLevel;
  const canon1 = [];
  if (maxLevel >= 1) for (let i = 0; i < D; i++) if (this.iso0.canon[i] === i) canon1.push(i);
  this.canon1 = canon1;
  // 分工：照子樹大小（第 2 層的代表牌數）貪心分配，大家算出來一樣
  const size1 = canon1.map((i) => (maxLevel >= 2 ? this.isoFor(this.board.concat([deck[i]])).nCanon : 1));
  this.owner1 = new Int8Array(D).fill(-1);
  if (part) {
    const load = new Float64Array(part.k), ord = canon1.map((i, q) => q).sort((x, y) => size1[y] - size1[x] || canon1[x] - canon1[y]);
    for (const q of ord) { let best = 0; for (let w = 1; w < part.k; w++) if (load[w] < load[best]) best = w; load[best] += size1[q]; this.owner1[canon1[q]] = best; }
  }
  const mine = (i) => !coord && (!part || this.owner1[i] === part.i);
  this.lmap1 = new Int32Array(Math.max(1, D)).fill(-1);
  this.lmap2 = maxLevel >= 2 ? new Int32Array(D * D).fill(-1) : null;
  let c1 = 0, c2 = 0;
  for (const i of canon1) {
    if (!mine(i)) continue;
    this.lmap1[i] = c1++;
    if (maxLevel >= 2) { const inf = this.isoFor(this.board.concat([deck[i]])); for (let j = 0; j < D; j++) if (j !== i && inf.canon[j] === j) this.lmap2[i * D + j] = c2++; }
  }
  this.cnt = [1, c1, c2];
  this.compress = !!cfg.compress;
  let total = 0, kmax = 1, blocks = 0, work = 0;
  const nWalk = [1, 0, 0];                              // 一次迭代實際走的份數（不分工時）
  for (const i of canon1) { nWalk[1]++; if (maxLevel >= 2) nWalk[2] += this.isoFor(this.board.concat([deck[i]])).nCanon; }
  for (const nd of this.nodes) {
    const nw = nWalk[nd.level];
    if (nd.kind === N_ACT) {
      nd.k = nd.acts.length; nd.nh = this.n[nd.p];
      nd.off = total; nd.blk = blocks;
      total += this.cnt[nd.level] * nd.k * nd.nh;
      blocks += this.cnt[nd.level];
      if (nd.k > kmax) kmax = nd.k;
      work += nw * nd.k * (this.n[0] + this.n[1]);
    } else if (nd.kind !== N_CHANCE) work += nw * (this.n[0] + this.n[1]) * 2;
  }
  const dep = (nd) => nd.kids ? 1 + Math.max(0, ...nd.kids.map(dep)) : 1;
  const depth = dep(this.root);
  this.floats = total; this.blocks = blocks; this.work = work;
  this.memMB = total * (this.compress ? 4 : 8) / 1048576;
  if (cfg.maxMB && this.memMB > cfg.maxMB) { const e = new Error('記憶體不夠：這棵樹要 ' + Math.round(this.memMB) + ' MB'); e.mem = this.memMB; throw e; }
  this.locks = new Map();                               // 節點鎖定：節點編號 → Float32Array(k × n) 固定策略
  if (cfg.dryRun) return;
  if (this.compress) {
    this.R16 = new Int16Array(total); this.S16 = new Uint16Array(total);
    this.Rs = new Float32Array(blocks); this.Ss = new Float32Array(blocks);
  } else { this.R = new Float32Array(total); this.S = new Float32Array(total); }
  const nmax = Math.max(this.n[0], this.n[1]);
  this.scr = new Float32Array((depth + 2) * (3 * kmax * nmax + 6 * nmax) + 64);
  this.sp = 0;
  this.cw = new Float64Array(52); this.ct = new Float64Array(52);
  this.tmp64 = new Float64Array(nmax); this.tmp64b = new Float64Array(nmax);
  this.strCache = new Map();
  this.t = 0;
  this.reachW = !(cfg.dcfr && cfg.dcfr.reachW === false);
  this.out = [new Float32Array(this.n[0]), new Float32Array(this.n[1])];
  this.Z = this.pairWeight(this.W[0], this.W[1]);
  if (cfg.locks) for (const L of cfg.locks) this.setLock(L.id, L.strat);
}

/* 不配置記憶體，先估：決策點數、MB、一次迭代的運算量 */
function estimateSolve(cfg) {
  const s = new Solver(Object.assign({}, cfg, { dryRun: true, maxMB: 0 }));
  return { mb: s.memMB, n: s.n.slice(), stats: treeStats(s.tree), work: s.work, tree: s.tree, iso: s.canon1.length < s.D && s.maxLevel >= 1 ? s.canon1.length + '/' + s.D : '' };
}

/* 雙方範圍在花色 a、b 互換之下對稱嗎 */
Solver.prototype.symOK = function (a, b) {
  const key = a * 4 + b;
  let v = this.symCache.get(key);
  if (v !== undefined) return v;
  v = true;
  for (let p = 0; p < 2 && v; p++) {
    const H = this.H[p], W = this.W[p], idx = this.idx[p];
    for (let h = 0; h < H.length; h++) {
      const k = H[h], k2 = comboOf(swapSuitCard(COMBO_A[k], a, b), swapSuitCard(COMBO_B[k], a, b)), j = idx[k2];
      if (j < 0 || Math.abs(W[j] - W[h]) > 1e-6) { v = false; break; }
    }
  }
  this.symCache.set(key, v);
  return v;
};
/* 手牌對調表：花色排列 sig 之後，第 h 手牌變成清單裡的第幾手 */
Solver.prototype.permFor = function (p, sig) {
  const key = p + ':' + sig.join('');
  let a = this.permCache.get(key);
  if (a) return a;
  const H = this.H[p], idx = this.idx[p];
  a = new Int32Array(H.length);
  for (let h = 0; h < H.length; h++) { const k = H[h]; a[h] = idx[comboOf(applySig(sig, COMBO_A[k]), applySig(sig, COMBO_B[k]))]; }
  this.permCache.set(key, a);
  return a;
};
Solver.prototype.permPair = function (p, a, b) { const sig = [0, 1, 2, 3]; sig[a] = b; sig[b] = a; return this.permFor(p, sig); };
/* 一組公牌下：牌堆裡每張牌的代表牌（canon[i]）、要互換的花色（pa、pb）、代表牌的同類（images） */
Solver.prototype.isoFor = function (board) {
  const key = board.slice().sort((x, y) => x - y).join(',');
  let r = this.isoCache.get(key);
  if (r) return r;
  const D = this.D, m = suitMasks(board), on = new Uint8Array(52);
  for (const c of board) on[c] = 1;
  r = { canon: new Int16Array(D), pa: new Int8Array(D).fill(-1), pb: new Int8Array(D).fill(-1), images: [], nCanon: 0 };
  for (let i = 0; i < D; i++) {
    r.images.push(null);
    const c = this.deck[i];
    r.canon[i] = i;
    if (on[c]) continue;
    if (!this.useIso) continue;
    const s = c & 3;
    let s0 = -1;
    for (let t = 0; t < s; t++) if (m[t] === m[s]) { s0 = t; break; }
    if (s0 < 0 || !this.symOK(s0, s)) continue;
    const c0 = (c & ~3) | s0, j = this.pos[c0];
    if (j < 0 || on[c0]) continue;
    r.canon[i] = j; r.pa[i] = s0; r.pb[i] = s;
  }
  for (let i = 0; i < D; i++) {
    if (on[this.deck[i]]) continue;
    if (r.canon[i] === i) { r.nCanon++; continue; }
    const j = r.canon[i];
    (r.images[j] = r.images[j] || []).push(i);
  }
  this.isoCache.set(key, r);
  return r;
};
/* 本地存放位置（沒有就 −1） */
Solver.prototype.lslot = function (level, inst) {
  if (level === 0) return 0;
  if (level === 1) return this.lmap1[inst];
  return this.lmap2[inst];
};

Solver.prototype.alloc = function (len) { const a = this.scr.subarray(this.sp, this.sp + len); this.sp += len; return a; };

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

/* ===== 讀寫 regret、累積策略（壓縮的話解碼） ===== */
Solver.prototype.base = function (nd, inst) {
  const s = this.lslot(nd.level, inst);
  if (s < 0) throw new Error('這一份資料不在這個執行緒（節點 ' + nd.id + '）');
  return s;
};
/* regret matching：先按動作一列一列加（記憶體連續，比較快），再除 */
Solver.prototype.curStrat = function (nd, inst, buf) {
  const k = nd.k, n = nd.nh;
  const lk = this.locks.get(nd.id);
  if (lk && nd.level === 0) { buf.set(lk); return; }
  const slot = this.base(nd, inst), base = nd.off + slot * k * n;
  const R = this.compress ? this.R16 : this.R;
  const sum = this.sumBuf || (this.sumBuf = new Float64Array(Math.max(this.n[0], this.n[1])));
  for (let h = 0; h < n; h++) sum[h] = 0;
  for (let a = 0; a < k; a++) { const o = base + a * n; for (let h = 0; h < n; h++) { const x = R[o + h]; if (x > 0) sum[h] += x; } }
  for (let h = 0; h < n; h++) sum[h] = sum[h] > 0 ? 1 / sum[h] : -1;
  const u = 1 / k;
  for (let a = 0; a < k; a++) {
    const o = base + a * n, ao = a * n;
    for (let h = 0; h < n; h++) { const iv = sum[h]; if (iv < 0) buf[ao + h] = u; else { const x = R[o + h]; buf[ao + h] = x > 0 ? x * iv : 0; } }
  }
};
Solver.prototype.avgStrat = function (nd, inst, buf) {
  const k = nd.k, n = nd.nh;
  const lk = this.locks.get(nd.id);
  if (lk && nd.level === 0) { buf.set(lk); return; }
  const slot = this.base(nd, inst), base = nd.off + slot * k * n;
  const S = this.compress ? this.S16 : this.S;
  const sum = this.sumBuf || (this.sumBuf = new Float64Array(Math.max(this.n[0], this.n[1])));
  for (let h = 0; h < n; h++) sum[h] = 0;
  for (let a = 0; a < k; a++) { const o = base + a * n; for (let h = 0; h < n; h++) sum[h] += S[o + h]; }
  for (let h = 0; h < n; h++) sum[h] = sum[h] > 0 ? 1 / sum[h] : -1;
  const u = 1 / k;
  for (let a = 0; a < k; a++) {
    const o = base + a * n, ao = a * n;
    for (let h = 0; h < n; h++) { const iv = sum[h]; buf[ao + h] = iv < 0 ? u : S[o + h] * iv; }
  }
};
/* 更新一個節點的 regret 與累積策略：vals（k × n）、strat、own、out（這個節點的價值） */
Solver.prototype.update = function (nd, inst, vals, strat, own, out) {
  if (this.locks.has(nd.id) && nd.level === 0) return;     // 鎖定的節點不學
  const k = nd.k, n = nd.nh, slot = this.base(nd, inst), base = nd.off + slot * k * n;
  const dp = this.dPos, dn = this.dNeg, ds = this.dStr, rw = this.reachW;
  if (!this.compress) {
    const R = this.R, S = this.S;
    for (let a = 0; a < k; a++) {
      const ofs = base + a * n, ao = a * n;
      for (let h = 0; h < n; h++) {
        let r = R[ofs + h];
        r = r > 0 ? r * dp : r * dn;
        r += vals[ao + h] - out[h];
        R[ofs + h] = (r > 1e-25 || r < -1e-25) ? r : 0;
        const x = S[ofs + h] * ds + (rw ? own[h] * strat[ao + h] : strat[ao + h]);
        S[ofs + h] = x > 1e-25 ? x : 0;
      }
    }
    return;
  }
  // 壓縮：先解碼成浮點數算好，再找最大值、重新編碼
  const R = this.R16, S = this.S16, b = nd.blk + slot, rs = this.Rs[b], ss = this.Ss[b];
  const tmpR = this.cmpR || (this.cmpR = new Float32Array(this.scr.length)), tmpS = this.cmpS || (this.cmpS = new Float32Array(this.scr.length));
  let mr = 0, ms = 0;
  for (let a = 0; a < k; a++) {
    const ofs = base + a * n, ao = a * n;
    for (let h = 0; h < n; h++) {
      let r = R[ofs + h] * rs;
      r = r > 0 ? r * dp : r * dn;
      r += vals[ao + h] - out[h];
      tmpR[ao + h] = r;
      const ar = r < 0 ? -r : r; if (ar > mr) mr = ar;
      const x = S[ofs + h] * ss * ds + (rw ? own[h] * strat[ao + h] : strat[ao + h]);
      tmpS[ao + h] = x; if (x > ms) ms = x;
    }
  }
  const qr = mr > 0 ? 32767 / mr : 0, qs = ms > 0 ? 65535 / ms : 0;
  this.Rs[b] = mr > 0 ? mr / 32767 : 0; this.Ss[b] = ms > 0 ? ms / 65535 : 0;
  for (let i = 0, kn = k * n; i < kn; i++) { R[base + i] = Math.round(tmpR[i] * qr); S[base + i] = Math.round(tmpS[i] * qs); }
};
/* 節點鎖定：只鎖第 0 層（從開始到第一張發的牌之前）的節點 */
Solver.prototype.setLock = function (id, strat) {
  const nd = this.nodes[id];
  if (!nd || nd.kind !== N_ACT || nd.level !== 0) return false;
  if (!strat) { this.locks.delete(id); return true; }
  this.locks.set(id, Float32Array.from(strat));
  return true;
};

/* 一個發牌點：把每張代表牌的子樹走一次，同類的牌把結果的手牌對調後加上去 */
Solver.prototype.chanceLoop = function (mode, nd, inst, ca, cb, t, own, opp, out, only) {
  const o = 1 - t, nT = this.n[t], nO = this.n[o];
  const sp0 = this.sp;
  const cOwn = this.alloc(nT), cOpp = this.alloc(nO), cOut = this.alloc(nT);
  out.fill(0);
  const child = nd.kids[0], D = this.D, deck = this.deck, wT = this.withCard[t], wO = this.withCard[o];
  const info = nd.level === 0 ? this.iso0 : this.isoFor(this.board.concat([ca]));
  for (let i = 0; i < D; i++) {
    const c = deck[i];
    if (c === ca || c === cb || info.canon[i] !== i) continue;
    if (only && !only(i)) continue;
    cOwn.set(own); const lt = wT[c]; for (let q = 0; q < lt.length; q++) cOwn[lt[q]] = 0;
    cOpp.set(opp); const lo = wO[c]; for (let q = 0; q < lo.length; q++) cOpp[lo[q]] = 0;
    this.walk(mode, child, inst * D + i, ca < 0 ? c : ca, ca < 0 ? -1 : c, t, cOwn, cOpp, cOut);
    for (let q = 0; q < lt.length; q++) cOut[lt[q]] = 0;
    for (let h = 0; h < nT; h++) out[h] += cOut[h];
    const im = info.images[i];
    if (im) for (const i2 of im) { const pm = this.permPair(t, info.pa[i2], info.pb[i2]); for (let h = 0; h < nT; h++) out[h] += cOut[pm[h]]; }
  }
  this.sp = sp0;
};

Solver.prototype.walk = function (mode, nd, inst, ca, cb, t, own, opp, out) {
  const kind = nd.kind;
  if (kind === N_FOLD || kind === N_SHOW) { this.terminal(nd, ca, cb, t, opp, out); return; }
  const sp0 = this.sp, o = 1 - t, nT = this.n[t], nO = this.n[o];
  if (kind === N_CHANCE) {
    if (this.remote && nd.level === 0) { this.remote(nd, t, own, opp, out); return; }   // 47-par：交給背景執行緒
    this.chanceLoop(mode, nd, inst, ca, cb, t, own, opp, out);
    const rem = 52 - this.board.length - nd.level;
    const f = 1 / (rem - 4);
    for (let h = 0; h < nT; h++) out[h] *= f;
    return;
  }
  const k = nd.k, kids = nd.kids;
  if (nd.p === t) {
    const n = nT, vals = this.alloc(k * n), strat = this.alloc(k * n), reach = this.alloc(n);
    if (mode === M_BR && !(this.locks.has(nd.id) && nd.level === 0)) {
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
    if (mode === M_CFR && !this.collecting) this.update(nd, inst, vals, strat, own, out);
    this.sp = sp0;
    return;
  }
  const n = nO, strat = this.alloc(k * n), reach = this.alloc(n), tmp = this.alloc(nT);
  if (mode === M_CFR) this.curStrat(nd, inst, strat); else this.avgStrat(nd, inst, strat);
  out.fill(0);
  for (let a = 0; a < k; a++) {
    const sa = strat.subarray(a * n, a * n + n);
    let any = false;
    for (let h = 0; h < n; h++) { const x = opp[h] * sa[h]; reach[h] = x; if (x !== 0) any = true; }
    if (!any) continue;
    this.walk(mode, kids[a], inst, ca, cb, t, own, reach, tmp);
    for (let h = 0; h < nT; h++) out[h] += tmp[h];
  }
  this.sp = sp0;
};

/* 這一次迭代的折扣：正 regret × t^1.5/(t^1.5+1)、負 × 0.5；累積策略每到 4 的次方重新開始，權重 ((t−p)/(t−p+1))^3 */
Solver.prototype.setParams = function (t) {
  const o = this.cfg.dcfr || {};
  const alpha = o.alpha === undefined ? 1.5 : o.alpha, gamma = o.gamma === undefined ? 3 : o.gamma, reset = o.reset !== false;
  const tp = t - 1, pa = Math.pow(tp, alpha);
  this.dPos = tp > 0 ? pa / (pa + 1) : 0;
  this.dNeg = 0.5;
  if (reset) {
    let p4 = 1;
    while (p4 * 4 <= t) p4 *= 4;
    const tg = t - p4;
    this.dStr = Math.pow(tg / (tg + 1), gamma);
  } else this.dStr = tp > 0 ? Math.pow(tp / t, gamma) : 0;
  return { dPos: this.dPos, dNeg: this.dNeg, dStr: this.dStr };
};
Solver.prototype.iterate = function (iters) {
  for (let i = 0; i < (iters || 1); i++) {
    this.t++;
    this.setParams(this.t);
    for (let p = 0; p < 2; p++) { this.sp = 0; this.walk(M_CFR, this.root, 0, -1, -1, p, this.W[p], this.W[1 - p], this.out[p]); }
  }
};
Solver.prototype.value = function (mode, p) {
  this.sp = 0;
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

/* ===== 瀏覽 =====
   path：[{a: 動作編號} 或 {c: 實際的牌}]。內部一律換成代表牌的世界：sig 是「實際花色 → 代表的花色」，
   到達機率也在代表的世界裡。init 是從別的執行緒接手時的起點 */
Solver.prototype.locate = function (path, init) {
  let nd = init ? this.nodes[init.id] : this.root, inst = init ? init.inst : 0, ca = init ? init.ca : -1, cb = init ? init.cb : -1;
  let sig = init ? init.sig.slice() : [0, 1, 2, 3];
  const reach = init ? [Float32Array.from(init.reach[0]), Float32Array.from(init.reach[1])] : [Float32Array.from(this.W[0]), Float32Array.from(this.W[1])];
  const buf = new Float32Array(16 * Math.max(this.n[0], this.n[1]));
  let used = 0;
  for (const st of path || []) {
    if (nd.kind === N_ACT) {
      const a = st.a, n = nd.nh;
      if (!(a >= 0 && a < nd.k)) break;
      this.avgStrat(nd, inst, buf);
      const r = reach[nd.p];
      for (let h = 0; h < n; h++) r[h] *= buf[a * n + h];
      nd = nd.kids[a];
    } else if (nd.kind === N_CHANCE) {
      let c = applySig(sig, st.c);
      let i = this.pos[c];
      if (!(i >= 0) || c === ca || c === cb) break;
      if (this.remote && nd.level === 0) return { nd, inst, ca, cb, reach, sig, pending: { c, i }, used };
      const info = nd.level === 0 ? this.iso0 : this.isoFor(this.board.concat([ca]));
      if (info.canon[i] !== i) {
        const a = info.pa[i], b = info.pb[i];
        for (let p = 0; p < 2; p++) { const pm = this.permPair(p, a, b), old = reach[p], nw = new Float32Array(old.length); for (let h = 0; h < old.length; h++) nw[h] = old[pm[h]]; reach[p] = nw; }
        const tr = [0, 1, 2, 3]; tr[a] = b; tr[b] = a;
        sig = sig.map((s) => tr[s]);
        i = info.canon[i]; c = this.deck[i];
      }
      for (let p = 0; p < 2; p++) { const l = this.withCard[p][c]; for (let q = 0; q < l.length; q++) reach[p][l[q]] = 0; }
      inst = inst * this.D + i;
      if (ca < 0) ca = c; else cb = c;
      nd = nd.kids[0];
    } else break;
    used++;
  }
  return { nd, inst, ca, cb, reach, sig, used };
};
/* 代表世界的陣列 → 實際世界（hand 編號照 sig 對調） */
Solver.prototype.unperm = function (p, sig, arr, k) {
  if (sig[0] === 0 && sig[1] === 1 && sig[2] === 2 && sig[3] === 3) return arr;
  const pm = this.permFor(p, sig), n = this.n[p], out = new Float32Array(arr.length);
  for (let a = 0; a < (k || 1); a++) for (let h = 0; h < n; h++) out[a * n + h] = arr[a * n + pm[h]];
  return out;
};
Solver.prototype.nodeView = function (path, init) {
  const L = this.locate(path, init);
  return this.viewAt(L);
};
/* 一個節點的資料：雙方到達機率、輪到的人每手牌的策略、每個動作的 EV、每手牌的 EV 與勝率（都換回實際的花色） */
Solver.prototype.viewAt = function (L, noEv) {
  const nd = L.nd, inv = invSig(L.sig);
  const board = this.board.slice();
  if (L.ca >= 0) board.push(applySig(inv, L.ca));
  if (L.cb >= 0) board.push(applySig(inv, L.cb));
  const v = { kind: nd.kind, id: nd.id, level: nd.level, board, hands: this.H, reach: [this.unperm(0, L.sig, L.reach[0]), this.unperm(1, L.sig, L.reach[1])], pot: this.P0 + nd.inv0 + nd.inv1, inv: [nd.inv0, nd.inv1], street: nd.street, n: this.n };
  if (nd.kind === N_CHANCE) {
    const ok = [];
    for (let i = 0; i < this.D; i++) { const c = this.deck[i]; if (c !== L.ca && c !== L.cb) ok.push(applySig(inv, c)); }
    v.cards = ok;
    return v;
  }
  if (nd.kind !== N_ACT) return v;
  const p = nd.p, o = 1 - p, n = nd.nh, k = nd.k;
  v.p = p; v.acts = nd.acts.map((a) => ({ t: a.t, add: a.add, to: a.to, label: actLabel(a) })); v.facing = nd.facing;
  v.locked = this.locks.has(nd.id);
  const strat = new Float32Array(k * n);
  this.avgStrat(nd, L.inst, strat);
  const comp = this.compat(p, L.reach[o], new Float32Array(n));
  if (noEv) return { v, strat, comp };                 // 47-par：EV 要分給背景執行緒算
  const evA = new Float32Array(k * n), tmp = new Float32Array(n);
  for (let a = 0; a < k; a++) {
    this.sp = 0;
    this.walk(M_EV, nd.kids[a], L.inst, L.ca, L.cb, p, L.reach[p], L.reach[o], tmp);
    for (let h = 0; h < n; h++) evA[a * n + h] = comp[h] > 0 ? tmp[h] / comp[h] : 0;
  }
  this.finishView(v, L, strat, evA, comp);
  return v;
};
Solver.prototype.finishView = function (v, L, strat, evA, comp) {
  const nd = L.nd, p = nd.p, o = 1 - p, n = nd.nh, k = nd.k;
  const ev = new Float32Array(n);
  for (let h = 0; h < n; h++) { let s = 0; for (let a = 0; a < k; a++) s += strat[a * n + h] * evA[a * n + h]; ev[h] = s; }
  const eq = this.equityAt(p, L.ca, L.cb, nd.level, L.reach[o]);
  const eqO = this.equityAt(o, L.ca, L.cb, nd.level, L.reach[p]);
  v.strat = this.unperm(p, L.sig, strat, k); v.evA = this.unperm(p, L.sig, evA, k); v.ev = this.unperm(p, L.sig, ev);
  v.comp = this.unperm(p, L.sig, comp); v.eq = this.unperm(p, L.sig, eq); v.eqO = this.unperm(o, L.sig, eqO);
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

/* ===== 下一張牌報告（Pio 的 runouts）：發牌點的每一張可能的牌 =====
   回傳每張牌：下一個說話的人的整體策略、雙方平均 EV、位置外（OOP）的平均勝率 */
Solver.prototype.runoutRow = function (L, i, c) {
  const nd = L.nd, child = nd.kids[0], D = this.D, n0 = this.n[0], n1 = this.n[1];
  const r = [Float32Array.from(L.reach[0]), Float32Array.from(L.reach[1])], out = [new Float32Array(n0), new Float32Array(n1)];
  for (let p = 0; p < 2; p++) { const l = this.withCard[p][c]; for (let q = 0; q < l.length; q++) r[p][l[q]] = 0; }
  const inst = L.inst * D + i, ca = L.ca < 0 ? c : L.ca, cb = L.ca < 0 ? -1 : c;
  const row = { c, freq: null, ev: [0, 0], eq0: 0 };
  if (child.kind === N_ACT) {
    const p = child.p, n = child.nh, k = child.k, buf = new Float32Array(k * n);
    this.avgStrat(child, inst, buf);
    const f = new Float64Array(k);
    let tot = 0;
    for (let h = 0; h < n; h++) { const x = r[p][h]; if (!x) continue; tot += x; for (let a = 0; a < k; a++) f[a] += x * buf[a * n + h]; }
    row.freq = Array.from(f, (x) => (tot ? x / tot : 0));
  }
  for (let t = 0; t < 2; t++) {
    this.sp = 0;
    this.walk(M_EV, child, inst, ca, cb, t, r[t], r[1 - t], out[t]);
    const comp = this.compat(t, r[1 - t], new Float32Array(this.n[t]));
    let s = 0, z = 0;
    for (let h = 0; h < this.n[t]; h++) { s += r[t][h] * out[t][h]; z += r[t][h] * comp[h]; }
    row.ev[t] = z ? s / z : 0;
  }
  const eq = this.equityAt(0, ca, cb, nd.level + 1, r[1]);
  const comp0 = this.compat(0, r[1], new Float32Array(n0));
  let s = 0, z = 0;
  for (let h = 0; h < n0; h++) { const w = r[0][h] * comp0[h]; s += w * eq[h]; z += w; }
  row.eq0 = z ? s / z : 0;
  return row;
};
/* 發牌點 L 的報告；only(i) 限定只算哪些代表牌（分工時用） */
Solver.prototype.runoutsAt = function (L, only) {
  const nd = L.nd, child = nd.kids[0], inv = invSig(L.sig);
  const res = { p: child.kind === N_ACT ? child.p : -1, acts: child.kind === N_ACT ? child.acts.map((a) => ({ t: a.t, add: a.add, to: a.to, label: actLabel(a) })) : [], cards: [] };
  const info = nd.level === 0 ? this.iso0 : this.isoFor(this.board.concat([L.ca]));
  for (let i = 0; i < this.D; i++) {
    const c = this.deck[i];
    if (c === L.ca || c === L.cb || info.canon[i] !== i) continue;
    if (only && !only(i)) continue;
    const row = this.runoutRow(L, i, c);
    row.c = applySig(inv, c);
    res.cards.push(row);
    if (info.images[i]) for (const i2 of info.images[i]) res.cards.push(Object.assign({}, row, { c: applySig(inv, this.deck[i2]) }));   // 同類的牌：整體數字一樣
  }
  return res;
};
Solver.prototype.runouts = function (path) {
  const L = this.locate(path);
  if (L.nd.kind !== N_CHANCE) return null;
  return this.runoutsAt(L);
};
