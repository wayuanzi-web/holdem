/* ===== 50-game：牌局（首頁、牌桌、教練框、上一步／下一步、動作列、一手結束的檢討與重看） ===== */
const SAVE_KEY = 'dezhou-game-1';
const GS = { n: 6, mode: 'teach', level: 2, peek: false, auto: false, seen: [], hands: 0, net: 0, won: 0, seenTermHint: false };
function gsLoad() { try { Object.assign(GS, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 沒有存檔 */ } }
function gsSave() {
  if (G.ctx) GS.seen = [...G.ctx.seen];
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(GS)); } catch (e) { /* 存不了也能玩 */ }
}
const G = { T: null, H: null, steps: [], view: -1, ctx: null, rng: null, timer: 0, waitingHero: false, adv: null, review: [], replay: false, over: false, pendingAI: null, lastRender: null, oddsTok: 0 };
const LEVEL_ZH = { 1: '新手', 2: '普通', 3: '高手' };

/* 文字裡的 {c數字} 換成有顏色的牌 */
function rich(s) { return esc(s).replace(/\{c(\d+)\}/g, (m, c) => cardSpan(+c)); }

/* ===== 畫面切換 ===== */
function showView(v) {
  for (const k of ['Home', 'Table', 'Tools']) $('v' + k).hidden = k.toLowerCase() !== v;
  document.body.classList.toggle('intable', v === 'table');
  $('nHome').hidden = v === 'home';
  $('nGame').hidden = v === 'table' || !G.H;
  $('subTitle').textContent = v === 'tools' ? '工具：勝率計算機、求解器、效能測試' : '德州撲克教練：一步一步帶你打';
  if (v !== 'table') clearTimeout(G.timer);
  if (v === 'home') renderHome();
  window.scrollTo(0, 0);
}

/* ===== 首頁 ===== */
function renderHome() {
  let h = '';
  for (let k = 2; k <= 9; k++) h += '<button type="button" data-n="' + k + '" aria-pressed="' + (k === GS.n) + '">' + k + '</button>';
  $('hN').innerHTML = h;
  $('hL').innerHTML = [1, 2, 3].map((k) => '<button type="button" data-l="' + k + '" aria-pressed="' + (k === GS.level) + '">' + LEVEL_ZH[k] + '</button>').join('');
  $('hMode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === GS.mode)));
  $('bResume').hidden = !G.H;
  $('homeStats').textContent = GS.hands ? '你總共打了 ' + GS.hands + ' 手，' + (GS.net >= 0 ? '贏了 ' : '輸了 ') + Math.abs(GS.net) + ' 籌碼（' + (GS.net / GAME_BB >= 0 ? '+' : '') + (GS.net / GAME_BB).toFixed(0) + ' 個大盲）。' : '';
}
function initHome() {
  $('hN').addEventListener('click', (e) => { const b = e.target.closest('button[data-n]'); if (!b) return; GS.n = +b.dataset.n; gsSave(); renderHome(); });
  $('hL').addEventListener('click', (e) => { const b = e.target.closest('button[data-l]'); if (!b) return; GS.level = +b.dataset.l; gsSave(); renderHome(); });
  $('hMode').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (!b) return; GS.mode = b.dataset.m; gsSave(); renderHome(); });
  $('bStart').addEventListener('click', newGame);
  $('bResume').addEventListener('click', () => { showView('table'); renderCur(); scheduleAuto(); });
}

/* ===== 開新的一桌、新的一手 ===== */
function newGame() {
  G.rng = makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const opp = makeOpponents(GS.n, GS.level, G.rng);
  G.T = newTable({ n: GS.n, names: ['你'].concat(opp.map((o) => o.name)), styles: ['tag'].concat(opp.map((o) => o.style)), level: GS.level, button: (G.rng() * GS.n) | 0 });
  G.ctx = { hero: 0, seen: new Set(GS.seen) };
  showView('table');
  nextHand();
}
function nextHand() {
  clearTimeout(G.timer);
  G.H = newHand(G.T, G.rng);
  G.steps = []; G.view = -1; G.review = []; G.over = false; G.replay = false; G.waitingHero = false; G.pendingAI = null; G.adv = null; G.lastRender = null;
  $('cOdds').open = false;
  forward();
}

/* ===== 一步一步 ===== */
function snap(H) { return JSON.parse(JSON.stringify(H)); }
function pushStep(st) { st.snap = snap(G.H); G.steps.push(st); }
function eventStep(ev, extra) {
  const x = narrate(ev, G.H, G.ctx);
  return Object.assign({ kind: 'event', ev, title: x.title, lines: x.lines, tip: x.tip }, extra || {});
}
/* 讓引擎往前走一件事，做成一個步驟 */
function produce() {
  const H = G.H;
  if (H.phase === 'done') {
    endHand(G.T, H);
    const net = H.result.net[0];
    GS.hands++; GS.net += net; if (net > 0) GS.won++;
    gsSave();
    G.over = true;
    G.steps.push({ kind: 'summary', snap: snap(H) });
    return;
  }
  const r = gameStep(H);
  if (r.need === undefined) {
    if (r.k === 'street' && !H.players[0].folded) G.ctx.info = heroInfo(H, 0); else if (r.k === 'deal') G.ctx.info = null;
    pushStep(eventStep(r));
    return;
  }
  if (r.need === 0) {
    G.adv = coachAdvice(H, G.rng);
    G.waitingHero = true;
    pushStep({ kind: 'hero', adv: G.adv, title: '輪到你', lines: [] });
    return;
  }
  const decide = () => { if (G.pendingAI && G.pendingAI.seat === H.toAct) { const a = G.pendingAI.a; G.pendingAI = null; return a; } return aiDecide(H, G.rng, G.T.level); };
  const ev = applyAction(H, decide());
  if (ev.t === 'f' && GS.mode === 'teach') {
    const folds = [ev.seat];
    while (H.phase === 'bet' && H.toAct > 0) {
      const a = aiDecide(H, G.rng, G.T.level);
      if (a.t !== 'f' || legalActions(H).canCheck) { G.pendingAI = { seat: H.toAct, a }; break; }
      folds.push(applyAction(H, a).seat);
    }
    if (folds.length > 1) { pushStep(eventStep({ k: 'folds', seats: folds })); return; }
  }
  pushStep(eventStep(ev));
}
function atHead() { return G.view === G.steps.length - 1; }
function forward() {
  clearTimeout(G.timer);
  if (G.view < G.steps.length - 1) { G.view++; renderCur(); scheduleAuto(); return; }
  if (G.waitingHero) return;
  if (G.over) { nextHand(); return; }
  produce();
  G.view = G.steps.length - 1;
  renderCur();
  scheduleAuto();
}
/* 你已經棄牌：直接跳到這一手結束 */
function skipToEnd() {
  clearTimeout(G.timer);
  let guard = 0;
  while (!G.over && !G.waitingHero && guard++ < 300) produce();
  G.view = G.steps.length - 1;
  renderCur();
}
function back() {
  clearTimeout(G.timer);
  if (G.view > 0) { G.view--; renderCur(); }
}
function scheduleAuto() {
  clearTimeout(G.timer);
  if (!atHead() || G.waitingHero || G.over || G.replay || $('vTable').hidden) return;
  const st = G.steps[G.view];
  let d = 0;
  if (GS.mode === 'play') {
    const k = st.ev ? st.ev.k : st.kind;
    d = k === 'act' ? (st.ev.seat === 0 ? 500 : 750) : k === 'street' ? 900 : k === 'win' ? 1600 : k === 'show' ? 1400 : k === 'folds' ? 600 : 500;
  } else if (GS.auto) {
    const len = (st.title || '').length + (st.lines || []).join('').length + (st.tip || '').length;
    d = Math.min(7000, 1600 + len * 35);
  } else return;
  G.timer = setTimeout(forward, d);
}
/* 你按了動作 */
function heroAct(a) {
  if (!G.waitingHero || !atHead() || G.replay) return;
  const H = G.H, adv = G.adv;
  const ev = applyAction(H, a);
  const g = gradeAction(adv, ev);
  G.review.push({ street: ev.street, label: actWord(ev, H), grade: g, adv: adv.label });
  G.waitingHero = false;
  pushStep(eventStep(ev, { grade: g, adv }));
  G.view = G.steps.length - 1;
  renderCur();
  if (GS.mode === 'play') G.timer = setTimeout(forward, g.mark === 'good' ? 700 : 1800);
  else scheduleAuto();
}

/* ===== 畫牌桌 ===== */
const STREETBAR = ['發手牌', '翻牌前', '翻牌', '轉牌', '河牌', '攤牌'];
/* 座位排在橢圓上：自己在正下方，順時針（往左）是下一位。半徑照牌桌實際大小算，座位才不會超出去 */
function feltGeom() {
  const f = $('felt'), fw = f.clientWidth || 800, fh = f.clientHeight || 520;
  const small = fw < 520, short = fh < 340;
  let halfW = small ? 42 : 58, halfTop = small ? 56 : 64, halfBot = small ? 68 : 78;
  if (short) { halfW = 40; halfTop = 24; halfBot = 46; }
  G.geom = { rx: Math.max(28, (fw / 2 - halfW) / fw * 100), ryT: Math.max(26, (fh / 2 - halfTop) / fh * 100), ryB: Math.max(26, (fh / 2 - halfBot) / fh * 100) };
}
function seatXY(n, i, r) {
  const a = Math.PI / 2 + i * 2 * Math.PI / n;
  const g = G.geom || { rx: 43, ryT: 41, ryB: 41 };
  const rx = g.rx * r, ry = (Math.sin(a) > 0 ? g.ryB : g.ryT) * r;
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
}
function cardEl(c, cls, anim) {
  if (c === undefined || c < 0) return '<span class="cd back ' + cls + (anim ? ' deal' : '') + '"></span>';
  const s = c & 3;
  return '<span class="cd c' + s + ' ' + cls + (anim ? ' deal' : '') + '" data-s="' + SUIT_SYM[s] + '"><span class="r">' + RANK_TXT[c >> 2] + '</span><span class="s">' + SUIT_SYM[s] + '</span><span class="big">' + SUIT_SYM[s] + '</span></span>';
}
function lastActs(S) {
  const out = {};
  for (const ev of S.log) {
    if (ev.k === 'street') { for (const k in out) if (out[k] !== '棄牌') delete out[k]; }
    else if (ev.k === 'act') out[ev.seat] = ev.t === 'f' ? '棄牌' : ev.t === 'x' ? '過牌' : ev.t === 'c' ? '跟注 ' + ev.add : ev.t === 'b' ? '下注 ' + ev.to : ev.t === 'r' ? '加注到 ' + ev.to : (ev.callAll ? '全下跟注' : '全下 ' + ev.to);
    else if (ev.k === 'blinds') { out[ev.sb.seat] = '小盲 ' + ev.sb.amt; out[ev.bb.seat] = '大盲 ' + ev.bb.amt; }
  }
  return out;
}
function renderTable(st) {
  const S = st.snap, n = S.n;
  feltGeom();
  const prev = G.lastRender;
  const showdown = S.log.some((e) => e.k === 'show');
  const acts = lastActs(S);
  const won = S.result ? S.result.won : null;
  const animDeal = st.ev && st.ev.k === 'deal' && (!prev || prev.view < G.view);
  let h = '';
  for (let k = 0; k < n; k++) {
    const p = S.players[k], hero = k === 0;
    const xy = seatXY(n, k, 1);
    const open = hero || G.replay || (GS.peek && GS.mode === 'teach') || (showdown && !p.folded);
    let cards = '';
    if (p.cards.length === 2 && !(p.folded && !hero && !G.replay)) {
      const cls = hero ? 'heroc' : 'small';
      const cs = hero ? sortedCards(p.cards) : p.cards;
      cards = cs.map((c) => cardEl(open ? c : -1, cls, animDeal)).join('');
    }
    const toAct = S.phase === 'bet' && S.toAct === k && st.kind !== 'summary';
    const cls = ['seat', hero ? 'hero' : '', p.folded ? 'folded' : '', toAct ? 'toact' : '', won && won[k] > 0 ? 'won' : ''].join(' ');
    const bubble = acts[k] ? '<span class="bubble">' + esc(acts[k]) + '</span>' : '';
    const sty = hero ? POS_ZH[p.pos] : styleZh(p.style) + '・' + POS_ZH[p.pos];
    h += '<div class="' + cls + '" style="left:' + xy.x.toFixed(1) + '%;top:' + xy.y.toFixed(1) + '%">'
      + '<div class="hc">' + cards + '</div>'
      + '<div class="plate">' + (k === S.button ? '<span class="dbtn" title="按鈕（莊家位）：翻牌後最後說話">D</span>' : '') + '<b>' + esc(p.name) + '</b><span class="sty">' + esc(sty) + '</span><br><span class="stk num">' + p.stack + '</span></div>'
      + bubble + '</div>';
    if (p.bet > 0) { const b = seatXY(n, k, hero ? 0.4 : 0.58); h += '<div class="betchip num" style="left:' + b.x.toFixed(1) + '%;top:' + b.y.toFixed(1) + '%"><i></i>' + p.bet + '</div>'; }
  }
  $('seats').innerHTML = h;
  // 公牌
  const prevBoard = prev && prev.view < G.view ? prev.board : S.board.length;
  let bh = '';
  for (let i = 0; i < 5; i++) bh += i < S.board.length ? cardEl(S.board[i], '', i >= prevBoard) : '<span class="slot"></span>';
  $('board').innerHTML = bh;
  const coll = potCollected(S), tot = potTotal(S);
  $('potTxt').textContent = tot > 0 ? '底池 ' + tot : '';
  void coll;
  const live = S.players.filter((p) => !p.folded).length;
  $('liveTxt').textContent = '還在牌局：' + live + ' 人' + (S.players[0].folded ? '' : '（含你）');
  // 進度：發手牌 → 翻牌前 → 翻牌 → 轉牌 → 河牌 → 攤牌
  let si;
  if (S.result || showdown) si = 5;
  else if (!S.log.some((e) => e.k === 'deal') || (st.ev && st.ev.k === 'deal')) si = 0;
  else si = S.street + 1;
  $('streetBar').innerHTML = STREETBAR.map((t, i) => '<li class="' + (i === si ? 'on' : i < si ? 'done' : '') + '">' + (i === 5 && S.result && S.result.uncontested ? '結束' : t) + '</li>').join('');
  G.lastRender = { view: G.view, board: S.board.length };
}

/* ===== 教練框 ===== */
function renderCoach(st) {
  const S = st.snap;
  $('handNo').textContent = '第 ' + S.no + ' 手' + (G.replay ? '・重看中' : '') + (G.steps.length > 1 ? '・第 ' + (G.view + 1) + ' 步' : '');
  $('peekWrap').hidden = GS.mode !== 'teach' || G.replay;
  $('peekChk').checked = GS.peek;
  $('autoChk').checked = GS.auto;
  $('autoChk').parentElement.hidden = GS.mode !== 'teach' || G.replay;
  let h = '';
  if (st.kind === 'summary') h = summaryHTML(S);
  else if (st.kind === 'hero') h = heroHTML(st, S);
  else {
    h += '<h3>' + rich(st.title) + '</h3>';
    if (st.grade) {
      const mk = { good: '✓', ok: '△', bad: '✗' }[st.grade.mark];
      h += '<div class="grade ' + st.grade.mark + '"><span class="mk">' + mk + '</span><div>' + esc(st.grade.text) + (st.grade.mark !== 'good' ? '<br><span class="note">教練的建議是：' + esc(st.adv.label) + '</span>' : '') + '</div></div>';
    }
    const used = new Set();
    for (const l of st.lines) h += '<p>' + glossify(rich(l), used) + '</p>';
    if (st.tip) h += '<div class="tip"><b>第一次遇到，說明一下</b>' + glossify(rich(st.tip), used) + '</div>';
  }
  if (!atHead() && !G.replay) h += '<p class="note">你在看前面的步驟；按「下一步」回到現在。</p>';
  $('cBody').innerHTML = h;
  $('cBody').scrollTop = 0;
  // 下一步按鈕
  const nb = $('bNext');
  $('bPrev').disabled = G.view <= 0;
  if (atHead() && G.waitingHero && !G.replay) { nb.disabled = true; nb.textContent = '輪到你：請選一個動作'; }
  else if (atHead() && G.over) { nb.disabled = false; nb.textContent = '再來一手 ▶'; }
  else { nb.disabled = false; nb.textContent = '下一步 ▶'; }
  $('cNav').classList.toggle('playmode', GS.mode === 'play');
  $('bSkip').hidden = !(atHead() && !G.over && !G.replay && S.players[0].folded);
}
function heroHTML(st, S) {
  const adv = st.adv, L = legalSnapshot(S);
  let h = '<h3>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '：可以過牌') + '</h3>';
  if (atHead() && !G.replay) h += '<p class="note">' + (GS.mode === 'teach' ? '先看看教練的建議和原因，再選一個動作；有黃框的那顆是建議。' : '選一個動作；有黃框的那顆是建議。') + '</p>';
  const used = new Set();
  h += '<div class="adv"><div class="rec">建議：' + esc(adv.label) + '</div><ol>' + adv.reasons.map((r) => '<li>' + glossify(rich(r), used) + '</li>').join('') + '</ol>';
  if (adv.more && adv.more.length) h += '<details><summary>為什麼？更多說明</summary>' + adv.more.map((r) => '<p>' + glossify(rich(r), used) + '</p>').join('') + '</details>';
  if (EXPLAIN.on && atHead() && !G.replay && !GS.seenTermHint) h += '<p class="note">底下有虛線的詞可以點，會跳出解釋；不需要的話，右上角「深入說明」可以關掉。</p>';
  h += '</div>';
  return h;
}
function legalSnapshot(S) { const p = S.players[S.toAct]; return { toCall: Math.max(0, S.curBet - p.bet) }; }
function summaryHTML(S) {
  const r = S.result, net = r.net[0];
  let h = '<h3>' + (net > 0 ? '你贏了 ' + net + '！' : net < 0 ? '你輸了 ' + (-net) : '這一手你沒輸沒贏') + '</h3>';
  const win = narrate({ k: 'win', res: r }, S, { hero: 0, seen: new Set(['x']) });
  h += '<p>' + rich(win.title) + '。</p>';
  if (!r.uncontested) {
    for (const p of S.players) if (!p.folded) h += '<p>' + esc(p.seat === 0 ? '你' : p.name) + '：' + rich(CARDS_TOK(sortedCards(p.cards))) + ' → ' + esc(describeHand(evalCards(p.cards.concat(S.board)))) + '</p>';
  }
  if (G.review.length) {
    h += '<p style="margin-top:10px"><b>這一手你的每個決定</b></p><ul class="review">';
    for (const x of G.review) {
      const mk = { good: '✓', ok: '△', bad: '✗' }[x.grade.mark];
      h += '<li class="' + x.grade.mark + '"><span class="mk">' + mk + '</span><div><b>' + STREET_NAME[x.street] + '　' + esc(x.label) + '</b><br>' + esc(x.grade.text) + (x.grade.mark !== 'good' ? '（建議：' + esc(x.adv) + '）' : '') + '</div></li>';
    }
    h += '</ul>';
  } else h += '<p class="note">這一手你不用做決定。</p>';
  h += '<div class="endbtns"><button class="btn main" data-end="next">再來一手</button><button class="btn" data-end="replay">從頭一步一步重看</button><button class="btn" data-end="home">回首頁</button></div>';
  return h;
}

/* ===== 動作列 ===== */
function renderActBar(st) {
  const show = st.kind === 'hero' && atHead() && G.waitingHero && !G.replay;
  $('actBar').hidden = !show;
  if (!show) return;
  const H = G.H, L = legalActions(H), adv = G.adv, p = H.players[0];
  const recF = adv.act.t === 'f', recP = adv.act.t === 'x' || adv.act.t === 'c', recA = adv.act.t === 'r';
  const allinRec = recA && adv.act.to >= L.maxTo;
  let h = '';
  if (!L.canCheck) h += '<button type="button" class="fold' + (recF ? ' rec' : '') + '" data-a="f">棄牌</button>';
  h += '<button type="button" class="' + (recP ? 'rec' : '') + '" data-a="' + (L.canCheck ? 'x' : 'c') + '">' + (L.canCheck ? '過牌' : (L.callAmt >= p.stack ? '全下跟注 ' : '跟注 ') + L.callAmt) + '</button>';
  if (L.canRaise) {
    if (L.maxTo > L.minTo) h += '<button type="button" class="' + (recA && !allinRec ? 'rec' : '') + '" data-a="size">' + (L.isBet ? '下注…' : '加注…') + '</button>';
    h += '<button type="button" class="' + (allinRec ? 'rec' : '') + '" data-a="allin">全下 ' + L.maxTo + '</button>';
  }
  $('actBtns').innerHTML = h;
  if (G.sizerStep === G.view) { const v = +$('sizeRange').value; openSizer(); if (v) { $('sizeRange').value = v; sizerLabel(); } }   // 重畫時保持打開
  else $('sizer').hidden = true;
}
function openSizer() {
  const H = G.H, L = legalActions(H), adv = G.adv;
  const pot = potTotal(H);
  const opts = [];
  if (L.isBet) for (const f of [0.33, 0.5, 0.66, 1]) opts.push([Math.round(f * 100) + '% 底池', Math.round(pot * f)]);
  else { opts.push(['最小', L.minTo]); opts.push(['2.5 倍', Math.round(H.curBet * 2.5)]); opts.push(['3 倍', H.curBet * 3]); opts.push(['底池', H.curBet + pot + L.toCall]); }
  const recTo = adv.act.t === 'r' ? adv.act.to : 0;
  const clamp = (x) => Math.max(L.minTo, Math.min(L.maxTo, Math.round(x)));
  let h = opts.map(([t, v]) => '<button type="button" data-to="' + clamp(v) + '">' + t + '：' + clamp(v) + '</button>').join('');
  if (recTo) h += '<button type="button" class="rec" data-to="' + recTo + '">建議：' + recTo + '</button>';
  $('presets').innerHTML = h;
  const rg = $('sizeRange');
  rg.min = L.minTo; rg.max = L.maxTo; rg.step = 1; rg.value = recTo || clamp(L.isBet ? pot * 0.66 : H.curBet * 2.5);
  sizerLabel();
  $('sizer').hidden = false;
  G.sizerStep = G.view;
}
function sizerLabel() { const L = legalActions(G.H), v = +$('sizeRange').value; $('bBetGo').textContent = (v >= L.maxTo ? '全下 ' : L.isBet ? '下注 ' : '加注到 ') + v; }

/* ===== 勝率表（看勝率表打開時才算） ===== */
function renderOdds() {
  const box = $('oddsBox');
  if (!$('cOdds').open || !G.H) return;
  const st = G.steps[G.view];
  const S = st.snap, hero = S.players[0];
  if (hero.folded) { box.innerHTML = '<p class="note">你已經棄牌了。</p>'; return; }
  const live = S.players.filter((p) => !p.folded).length - 1;
  if (live < 1) { box.innerHTML = '<p class="note">只剩你了。</p>'; return; }
  if (!box.querySelector('table')) box.innerHTML = '<p class="note">計算中…</p>';
  G.oddsTok = W.nextCalc();
  G.oddsLive = live;
  W.send({ cmd: 'calc', hero: hero.cards, board: S.board, maxOpp: 8, mcIters: 120000 });
}
function oddsHTML(m, mc) {
  const live = G.oddsLive;
  const eqN = (N) => m.pre ? m.pre.eq[N - 1] : N === 1 && m.exact ? m.exact.eq : mc ? (mc.win[N] + mc.tie[N]) / mc.n : null;
  const method = (N) => m.pre ? '事先算好' : N === 1 ? '精確計算' : mc ? '模擬' + (mc.done ? '' : '中') : '模擬中';
  let h = '<p style="margin:4px 0">對隨機手牌的勝率（還在的對手：' + live + ' 個，標黃的那一行）</p>';
  h += eqTableHTML(eqN, Math.max(3, Math.min(8, live + 1)), live, method);
  const cat = m.pre ? m.pre.cat : m.cat;
  if (cat) {
    h += '<p style="margin:8px 0 4px">到河牌時的牌型機率</p><table>';
    for (let i = 8; i >= 0; i--) if (cat[i] > 0.0005) h += '<tr class="' + (m.cur && m.cur.cat === i ? 'hl' : '') + '"><td>' + CAT_NAMES[i] + '</td><td style="width:50%"><div class="bar"><i style="width:' + (cat[i] * 100).toFixed(1) + '%"></i></div></td><td class="r">' + pct(cat[i]) + '%</td></tr>';
    h += '</table>';
  }
  if (m.outs && m.outs.total) h += '<p style="margin:8px 0 0">' + glossify('出牌') + ' ' + m.outs.total + ' 張：' + m.outs.groups.filter((g) => g.strong).map((g) => g.name + ' ' + g.cards.map(cardSpan).join('')).join('；') + '</p>';
  const st = G.steps[G.view];
  if (st.adv) h += '<p class="note" style="margin-top:6px">教練是照對手的動作估他們可能的牌：勝率約 ' + pct(st.adv.eq, 0) + '%（比對隨機手牌更準）。</p>';
  if (EXPLAIN.on) h += eqHowHTML({ pre: !!m.pre, e1: eqN(1), e2: eqN(2), board: m.pre ? 0 : (m.board || []).length, mcN: mc ? mc.n : 0, est: st.adv ? st.adv.eq : null });
  return h;
}
let ODDS_RES = null;
function setOdds(html) {   // 模擬一直在更新、換步驟也會重算：保持「怎麼算的」打開的狀態
  const box = $('oddsBox'), top = box.scrollTop;
  box.innerHTML = html;
  if (G.howOpen) { const d = box.querySelector('details.how'); if (d) d.open = true; }
  box.scrollTop = top;
}
W.on('calc', (m) => { if (m.token !== G.oddsTok) return; ODDS_RES = m; setOdds(oddsHTML(m, null)); });
W.on('calcmc', (m) => { if (m.token !== G.oddsTok || !ODDS_RES) return; setOdds(oddsHTML(ODDS_RES, m)); });

function renderCur() {
  const st = G.steps[G.view];
  if (!st) return;
  renderTable(st);
  renderCoach(st);
  renderActBar(st);
  if ($('cOdds').open) renderOdds();
  $('cOdds').hidden = st.snap.players[0].folded && !G.replay;
}

/* ===== 牌型大小 ===== */
function renderRanks() {
  const ex = [['皇家同花順', 'AsKsQsJsTs'], ['同花順', '9h8h7h6h5h'], ['四條', 'KcKdKhKs7d'], ['葫蘆', 'QsQhQd4c4s'], ['同花', 'AdJd8d6d2d'],
    ['順子', 'Tc9d8h7s6c'], ['三條', '7s7h7dKc2s'], ['兩對', 'JsJd5c5hAs'], ['一對', 'TsThKd6c3s'], ['高牌', 'AhQd8s5c3d']];
  $('ranksList').innerHTML = ex.map(([nm, cs]) => '<div class="rk"><span class="nm">' + nm + '</span><span class="cds">' + parseCards(cs).map((c) => cardHTML(c)).join('') + '</span></div>').join('');
}

function initGame() {
  gsLoad();
  initHome();
  $('bNext').addEventListener('click', forward);
  $('bPrev').addEventListener('click', back);
  $('bSkip').addEventListener('click', skipToEnd);
  $('autoChk').addEventListener('change', (e) => { GS.auto = e.target.checked; gsSave(); scheduleAuto(); });
  $('peekChk').addEventListener('change', (e) => { GS.peek = e.target.checked; gsSave(); renderCur(); });
  $('cOdds').addEventListener('toggle', () => { if ($('cOdds').open) renderOdds(); });
  $('oddsBox').addEventListener('toggle', (e) => { if (e.target.matches('details.how')) G.howOpen = e.target.open; }, true);
  $('coach').addEventListener('click', (e) => { if (e.target.closest('button.term') && !GS.seenTermHint) { GS.seenTermHint = true; gsSave(); } });
  document.querySelectorAll('.explainChk').forEach((x) => x.addEventListener('change', (e) => {
    setExplain(e.target.checked);
    if (G.H && G.steps[G.view]) renderCur();
    if (CALC.res) renderCalc();
  }));
  setExplain(EXPLAIN.on);
  $('actBtns').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const L = legalActions(G.H), a = b.dataset.a;
    if (a === 'f') heroAct({ t: 'f' });
    else if (a === 'x') heroAct({ t: 'x' });
    else if (a === 'c') heroAct({ t: 'c' });
    else if (a === 'allin') heroAct({ t: 'r', to: L.maxTo });
    else if (a === 'size') openSizer();
  });
  $('presets').addEventListener('click', (e) => { const b = e.target.closest('button[data-to]'); if (!b) return; $('sizeRange').value = b.dataset.to; sizerLabel(); });
  $('sizeRange').addEventListener('input', sizerLabel);
  $('bBetGo').addEventListener('click', () => heroAct({ t: 'r', to: +$('sizeRange').value }));
  $('bBetCancel').addEventListener('click', () => { $('sizer').hidden = true; G.sizerStep = -1; });
  $('cBody').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-end]'); if (!b) return;
    if (b.dataset.end === 'next') nextHand();
    else if (b.dataset.end === 'home') showView('home');
    else if (b.dataset.end === 'replay') { G.replay = true; G.view = 0; G.lastRender = null; renderCur(); }
  });
  // 重看時按到最後一步：回到檢討畫面
  $('nHome').addEventListener('click', () => showView('home'));
  $('bHomeSeal').addEventListener('click', () => showView('home'));
  $('nTools').addEventListener('click', () => showView('tools'));
  $('nGame').addEventListener('click', () => { showView('table'); G.lastRender = null; renderCur(); scheduleAuto(); });
  $('bResetTips').addEventListener('click', () => { GS.seen = []; if (G.ctx) G.ctx.seen = new Set(); gsSave(); $('bResetTips').textContent = '好了，下一手開始會再說明一次'; });
  $('nRanks').addEventListener('click', () => { renderRanks(); $('ranksModal').hidden = false; $('ranksClose').focus(); });
  $('ranksClose').addEventListener('click', () => { $('ranksModal').hidden = true; });
  $('ranksModal').addEventListener('click', (e) => { if (e.target === $('ranksModal')) $('ranksModal').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('ranksModal').hidden = true;
    if ($('vTable').hidden || e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter' && e.target === document.body) { if (!$('bNext').disabled) forward(); }
    else if (e.key === 'ArrowLeft') back();
  });
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('vTable').hidden && G.H && G.steps[G.view]) { G.lastRender = { view: G.view, board: G.steps[G.view].snap.board.length }; renderTable(G.steps[G.view]); } /* 只重畫桌面：教練框裡打開的解釋、下注框都保留 */ }, 150); });
  showView('home');
}
