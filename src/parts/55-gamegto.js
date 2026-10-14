/* ===== 55-gamegto：牌局裡的 GTO（第五步） =====
   單挑的轉牌、河牌：一發牌就在另一個背景執行緒（GW）開始求解，邊算邊用。
   - 你：輪到你時顯示 GTO 用你這手牌怎麼打、每個動作的 EV；按完用 GTO 評分（少賺多少）
   - GTO 電腦（風格 gto）：照解抽一個動作；解還太粗就多等一下，等太久就照原本的打法
   - 河牌的範圍從轉牌的解接過來（雙方都照解打的話，到河牌各自還剩哪些牌） */
const GT = { key: 0, req: 0, cbs: new Map() };
function gtoActive() { return G.gto && !G.gto.lost && G.gto.ready; }
function gtoReset() { if (G.gto) GW().send({ cmd: 'g-stop' }); G.gto = null; G.gtoAdv = null; G.waitAI = null; }
function gtoAsk(msg, cb) { const req = ++GT.req; GT.cbs.set(req, cb); GW().send(Object.assign({ cmd: 'g-query', req }, msg)); }
function gtoInit() {
  GW().on('g-ans', (m) => { const f = GT.cbs.get(m.req); if (f) { GT.cbs.delete(m.req); f(m); } });
  GW().on('g-progress', (m) => {
    const g = G.gto;
    if (!g || g.key !== m.key) return;
    if (m.error) { g.lost = true; return; }
    g.t = m.t; g.pct = m.pct; g.done = m.done; g.ready = true;
    // 輪到你：還沒有可用的建議、或剛算完，才重新問（不要一直重畫動作鈕）
    if (G.waitingHero && atHead() && !G.replay && g.seats.indexOf(0) >= 0 && (!gtoAdvUsable() || m.done)) gtoHeroTurn(true);
  });
}
/* 需要 GTO 嗎：單挑、你在裡面（而且開著 GTO 教練）或有 GTO 電腦 */
function gtoWanted(seats) {
  if (seats.indexOf(0) >= 0 && GS.gtoCoach) return true;
  return seats.some((k) => G.H.players[k].style === 'gto');
}
/* 發了轉牌或河牌 */
function gtoOnStreet(ev) {
  const H = G.H, prev = G.gto;
  G.gtoAdv = null; G.waitAI = null;
  if (ev.street < 2 || ev.runout) { gtoReset(); return; }
  const start = (carry) => {
    const S = gtoStreetSetup(H, ev.street, carry);
    if (!S || !gtoWanted(S.seats)) { gtoReset(); return; }
    const key = ++GT.key;
    G.gto = { key, street: ev.street, seats: S.seats, tree: buildTree(S.cfg), path: [], nd: null, t: 0, pct: 999, done: false, ready: false, lost: false, carried: !!carry, pot: S.cfg.pot };
    G.gto.nd = G.gto.tree.root;
    GW().send({ cmd: 'g-start', key, cfg: S.cfg });
  };
  // 河牌：前一條街的解如果一路對得上，就把那裡的雙方範圍接過來
  if (prev && !prev.lost && prev.street === ev.street - 1 && prev.nd && prev.nd.kind === N_CHANCE && prev.ready) {
    const key = prev.key;
    gtoAsk({ key, path: prev.path.concat([{ c: ev.cards[0] }]), reach: true }, (m) => {
      if (G.H !== H || H.street !== ev.street) return;
      start(m.none ? null : m.reach);
    });
    return;
  }
  start(null);
}
/* 某個人做了動作：在樹上往下走 */
function gtoOnAct(ev) {
  const g = G.gto;
  if (!g || g.lost || ev.street !== g.street) return;
  const p = g.seats.indexOf(ev.seat);
  if (p < 0 || !g.nd || g.nd.kind !== N_ACT || g.nd.p !== p) { g.lost = true; return; }
  const a = gtoMapAct(g.nd, ev);
  if (a < 0) { g.lost = true; return; }
  const ta = g.nd.acts[a];
  g.approx = (ta.t === 'b' || ta.t === 'r') && Math.abs(ta.to - ev.to) > 0.12 * (g.pot + 1) ? { tree: ta.to, real: ev.to } : null;
  g.path.push({ a }); g.nd = g.nd.kids[a];
}

/* ===== 你 ===== */
function gtoHeroTurn(refresh) {
  const g = G.gto, H = G.H;
  if (!g || g.lost || !g.ready || g.seats.indexOf(0) < 0 || !GS.gtoCoach) return;
  const pathLen = g.path.length, view = G.view;
  const combo = comboOf(H.players[0].cards[0], H.players[0].cards[1]);
  if (refresh && G.gtoAdv && G.gtoAdv.pathLen === pathLen && G.gtoAdv.done) return;
  if (g.asking) return;
  g.asking = true;
  gtoAsk({ key: g.key, path: g.path.slice(), p: g.seats.indexOf(0), combo, ev: true }, (m) => {
    g.asking = false;
    if (G.gto !== g || !G.waitingHero || g.path.length !== pathLen || m.none) return;
    G.gtoAdv = { pathLen, acts: m.acts, freq: m.freq, ev: m.ev, pct: m.pct, t: m.t, done: m.done, eq: m.eq, street: g.street };
    if (G.view === view || atHead()) { renderCtrl(G.steps[G.view]); if (G.steps[G.view].kind === 'hero') renderCoach(G.steps[G.view]); }
  });
}
/* GTO 的建議夠不夠準可以拿來用、評分 */
function gtoAdvUsable() {
  const a = G.gtoAdv, g = G.gto;
  return a && g && !g.lost && a.pathLen === g.path.length && (a.done || a.pct <= 3);
}
/* GTO 最常用的動作 → 動作列的哪一顆 */
function gtoBest() {
  const a = G.gtoAdv;
  let b = 0;
  for (let i = 1; i < a.freq.length; i++) if (a.freq[i] > a.freq[b]) b = i;
  return b;
}
function gtoActBtn(ta, L) {
  if (ta.t === 'f') return 'f';
  if (ta.t === 'x') return 'x';
  if (ta.t === 'c') return 'c';
  if (ta.t === 'a' || Math.round(ta.to) >= L.maxTo) return 'allin';
  return 'size';
}
function gtoLine() {
  const a = G.gtoAdv, cols = actColors(a.acts);
  return a.acts.map((t, i) => ({ t, i, f: a.freq[i] })).filter((x) => x.f >= 0.005).sort((x, y) => y.f - x.f)
    .map((x) => '<span class="hchip"><i class="sw" style="background:' + cols[x.i] + '"></i>' + esc(gtoLabel(x.t)) + ' ' + pct(x.f, 0) + '%</span>').join(' ');
}
function gtoLabel(t) { return t.t === 'b' ? '下注 ' + Math.round(t.add) : t.t === 'r' ? '加注到 ' + Math.round(t.to) : t.t === 'a' ? '全下' : actLabel(t); }
/* 你按完：用 GTO 評分（有的話） */
function gtoGrade(ev) {
  if (!gtoAdvUsable()) return null;
  const g = G.gto, a = G.gtoAdv, i = gtoMapAct(g.nd, ev);
  if (i < 0) return null;
  let best = 0;
  for (let q = 1; q < a.ev.length; q++) if (a.ev[q] > a.ev[best]) best = q;
  const f = a.freq[i], loss = Math.max(0, a.ev[best] - a.ev[i]), pot = potTotal(G.H) - (ev.add || 0);
  const mark = f >= 0.25 || loss <= 0.01 * pot ? 'good' : loss <= 0.04 * pot ? 'ok' : 'bad';
  const mine = gtoLabel(a.acts[i]), top = gtoLabel(a.acts[gtoBest()]);
  const text = mark === 'good' ? '這手牌 GTO 有 ' + pct(f, 0) + '% 的時候' + mine + '，打得好。'
    : mark === 'ok' ? '這手牌 GTO 很少' + mine + '（' + pct(f, 0) + '%），不過只少賺 ' + fmt(loss, 1) + '，差不多。'
      : '這手牌 GTO 幾乎不會' + mine + '（' + pct(f, 0) + '%），平均少賺 ' + fmt(loss, 1) + ' 籌碼（約 ' + fmt(loss / G.H.bb, 1) + ' 個大盲）。';
  return { mark, text, src: 'GTO', loss, adv: top, freq: f };
}
/* 教練框裡的 GTO 區塊 */
function gtoBoxHTML() {
  const g = G.gto;
  if (!g || g.lost || g.seats.indexOf(0) < 0 || !GS.gtoCoach) return '';
  if (!G.gtoAdv) return '<div class="gtob"><b>GTO 求解</b>：計算中…（單挑的' + STREET_NAME[g.street] + '，在另一個背景執行緒算）</div>';
  const a = G.gtoAdv, cols = actColors(a.acts);
  let h = '<div class="gtob"><b>GTO 求解</b>（' + glossify('可剝削度') + ' ' + (a.pct < 900 ? fmt(a.pct, 1) + '%' : '—') + (a.done ? '' : '，還在算') + (g.carried ? '；範圍接著上一條街的解' : '') + '）<table>';
  a.acts.forEach((t, i) => {
    h += '<tr><td><i class="sw" style="background:' + cols[i] + '"></i>' + esc(gtoLabel(t)) + '</td><td class="r num">' + pct(a.freq[i], 0) + '%</td><td class="r num">EV ' + fmt(Math.abs(a.ev[i]) < 0.05 ? 0 : a.ev[i], 1) + '</td></tr>';
  });
  h += '</table><div class="note">EV：從現在算、平均拿回多少籌碼。' + (gtoAdvUsable() ? '動作鈕的「建議」照 GTO 最常用的動作。' : '還不夠準，先照教練的建議。') + (g.approx ? '（有人下的大小不在樹上，照最接近的 ' + Math.round(g.approx.tree) + ' 算）' : '') + '</div></div>';
  return h;
}

/* ===== GTO 電腦 ===== */
/* 輪到 GTO 電腦而且有解可以用：先問解（非同步），回來再出牌。回傳 true＝要等 */
function gtoBotWait(seat) {
  const H = G.H, pl = H.players[seat], g = G.gto;
  if (pl.style !== 'gto' || !g || g.lost || g.seats.indexOf(seat) < 0) return false;
  if (G.pendingAI && G.pendingAI.seat === seat) return false;
  const cap = [0, 4000, 2500, 1500][GS.speed || 2];
  if (!G.waitAI || G.waitAI.seat !== seat) G.waitAI = { seat, since: Date.now() };
  const W8 = G.waitAI;
  if (W8.asking) return true;
  const fallback = () => { G.pendingAI = { seat, a: aiDecide(H, G.rng, G.T.level), why: 'rule' }; G.waitAI = null; afterBot(); };
  if (!g.ready) {
    if (Date.now() - W8.since > cap) { fallback(); return false; }
    setTimeout(() => { if (G.waitAI === W8) afterBot(); }, 300);
    return true;
  }
  W8.asking = true;
  const p = g.seats.indexOf(seat), combo = comboOf(pl.cards[0], pl.cards[1]), pathLen = g.path.length;
  gtoAsk({ key: g.key, path: g.path.slice(), p, combo }, (m) => {
    W8.asking = false;
    if (G.waitAI !== W8 || G.gto !== g || g.path.length !== pathLen) return;
    const good = !m.none && (m.done || m.pct <= 5 || m.t >= 60);
    if (!good && Date.now() - W8.since < cap && !m.none) { setTimeout(() => { if (G.waitAI === W8) afterBot(); }, 350); return; }
    if (m.none) { fallback(); return; }
    // 照解抽一個動作
    let r = G.rng(), i = 0;
    for (; i < m.freq.length - 1; i++) { r -= m.freq[i]; if (r <= 0) break; }
    const ta = m.acts[i], L = legalActions(H);
    let a;
    if (ta.t === 'f') a = { t: L.canCheck ? 'x' : 'f' };
    else if (ta.t === 'x' || ta.t === 'c') a = { t: L.canCheck ? 'x' : 'c' };
    else a = { t: 'r', to: ta.t === 'a' ? L.maxTo : Math.max(L.minTo, Math.min(L.maxTo, Math.round(ta.to))) };
    G.pendingAI = { seat, a, why: 'gto' };
    G.waitAI = null;
    afterBot();
  });
  return true;
}
/* 解回來了（或等太久）：自動模式就接著往下 */
function afterBot() {
  if ($('vTable').hidden || !G.H) return;
  if (atHead() && !G.replay && !G.over && (isRunning() || GS.flow === 'step')) { clearTimeout(G.timer); forward(); }   // 是「下一步」或自動播放叫它出牌的，就接著出
  else renderCtrl(G.steps[G.view]);
}

/* ===== GTO 訓練（單挑）：累計評分 ===== */
function trainStatsText() {
  const t = GS.trainStats || { n: 0, good: 0, ok: 0, bad: 0, loss: 0 };
  if (!t.n) return 'GTO 評分還沒有紀錄（轉牌、河牌單挑時才有）。';
  return 'GTO 評分 ' + t.n + ' 次：✓ ' + t.good + '、△ ' + t.ok + '、✗ ' + t.bad + '；一共少賺 ' + fmt(t.loss / GAME_BB, 1) + ' 個大盲（平均每次 ' + fmt(t.loss / GAME_BB / t.n, 2) + '）';
}
function trainAdd(gr) {
  const t = GS.trainStats || (GS.trainStats = { n: 0, good: 0, ok: 0, bad: 0, loss: 0 });
  t.n++; t[gr.mark]++; t.loss += (gr.loss || 0) * GAME_BB / ((G.H && G.H.bb) || GAME_BB); /* 換算成標準盲注的籌碼 */
}
