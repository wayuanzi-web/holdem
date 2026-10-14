/* ===== 50-game：牌局（首頁、牌桌、教練框、上一步／下一步、動作列、一手結束的檢討與重看） ===== */
const SAVE_KEY = 'dezhou-game-1';
/* flow：auto 電腦自己出牌、輪到你才停（預設）；step 每一件事都停，按「下一步」。speed：1 慢、2 中、3 快 */
const GS = { n: 6, flow: 'auto', speed: 2, level: 2, peek: false, seen: [], hands: 0, net: 0, won: 0, seenTermHint: false, gtoCoach: true, train: false, autoPre: false, trainStats: null };
function gsLoad() {
  try { Object.assign(GS, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 沒有存檔 */ }
  if (GS.flow !== 'auto' && GS.flow !== 'step') GS.flow = 'auto';     // 舊版的 teach／play 都改成自動
  if (!(GS.speed >= 1 && GS.speed <= 3)) GS.speed = 2;
}
function gsSave() {
  if (G.ctx) GS.seen = [...G.ctx.seen];
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(GS)); } catch (e) { /* 存不了也能玩 */ }
}
const G = { T: null, H: null, steps: [], view: -1, ctx: null, rng: null, timer: 0, waitingHero: false, adv: null, review: [], replay: false, over: false, pendingAI: null, lastRender: null, oddsTok: 0, paused: false, flash: null, gto: null, gtoAdv: null, waitAI: null };
const LEVEL_ZH = { 1: '新手', 2: '普通', 3: '高手', 4: 'GTO' };

/* 文字裡的 {c數字} 換成有顏色的牌 */
function rich(s) { return esc(s).replace(/\{c(\d+)\}/g, (m, c) => cardSpan(+c)); }

/* ===== 畫面切換 ===== */
function showView(v) {
  for (const k of ['Home', 'Table', 'Tools', 'Learn']) $('v' + k).hidden = k.toLowerCase() !== v;
  $('nLearn').classList.toggle('on', v === 'learn');
  document.body.classList.toggle('intable', v === 'table');
  $('nHome').hidden = v === 'home';
  $('nGame').hidden = v === 'table' || !G.H;
  $('subTitle').textContent = v === 'tools' ? '工具：勝率計算機、翻牌前圖表、GTO 工作室、效能測試' : v === 'learn' ? '大師之路：一課一課練到大師' : '德州撲克教練：一步一步帶你打';
  if (v !== 'learn' && typeof clearLnTimers === 'function') clearLnTimers();
  if (v !== 'table') clearTimeout(G.timer);
  if (v === 'home') { renderHome(); renderLearnHome(); }
  window.scrollTo(0, 0);
}

/* ===== 首頁 ===== */
function renderHome() {
  let h = '';
  for (let k = 2; k <= 9; k++) h += '<button type="button" data-n="' + k + '" aria-pressed="' + (k === GS.n) + '">' + k + '</button>';
  $('hN').innerHTML = h;
  $('hL').innerHTML = [1, 2, 3, 4].map((k) => '<button type="button" data-l="' + k + '" aria-pressed="' + (k === GS.level) + '">' + LEVEL_ZH[k] + '</button>').join('');
  $('hMode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === GS.flow)));
  $('hS').innerHTML = [[1, '慢'], [2, '中'], [3, '快']].map(([k, t]) => '<button type="button" data-s="' + k + '" aria-pressed="' + (k === GS.speed) + '">' + t + '</button>').join('');
  $('bResume').hidden = !G.H;
  $('hGto').checked = GS.gtoCoach; $('hAutoPre').checked = GS.autoPre;
  $('trainStats').textContent = trainStatsText();
  $('hTn').innerHTML = [6, 9].map((k) => '<button type="button" data-tn="' + k + '" aria-pressed="' + (k === (GS.tn || 6)) + '">' + k + ' 人</button>').join('');
  $('homeStats').textContent = GS.hands ? '一般桌你總共打了 ' + GS.hands + ' 手，' + (GS.net >= 0 ? '贏了 ' : '輸了 ') + Math.abs(GS.net) + ' 籌碼（' + (GS.net / GAME_BB >= 0 ? '+' : '') + (GS.net / GAME_BB).toFixed(0) + ' 個大盲）。詳細的數字在上面的「統計」。' : '';
}
function initHome() {
  $('hN').addEventListener('click', (e) => { const b = e.target.closest('button[data-n]'); if (!b) return; GS.n = +b.dataset.n; gsSave(); renderHome(); });
  $('hL').addEventListener('click', (e) => { const b = e.target.closest('button[data-l]'); if (!b) return; GS.level = +b.dataset.l; gsSave(); renderHome(); });
  $('hMode').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (!b) return; GS.flow = b.dataset.m; gsSave(); renderHome(); });
  $('hS').addEventListener('click', (e) => { const b = e.target.closest('button[data-s]'); if (!b) return; GS.speed = +b.dataset.s; gsSave(); renderHome(); });
  $('bStart').addEventListener('click', () => newGame(false));
  $('bTrain').addEventListener('click', () => newGame(true));
  $('bTour').addEventListener('click', () => newGame('tourney'));
  $('hTn').addEventListener('click', (e) => { const b = e.target.closest('button[data-tn]'); if (!b) return; GS.tn = +b.dataset.tn; gsSave(); renderHome(); });
  $('hGto').addEventListener('change', (e) => { GS.gtoCoach = e.target.checked; gsSave(); });
  $('hAutoPre').addEventListener('change', (e) => { GS.autoPre = e.target.checked; gsSave(); });
  $('bResume').addEventListener('click', () => { showView('table'); renderCur(); scheduleAuto(); });
}

/* ===== 開新的一桌、新的一手 ===== */
/* kind：false 一般、true GTO 訓練、'tourney' 錦標賽 */
function newGame(kind) {
  G.rng = makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const train = kind === true, tour = kind === 'tourney';
  GS.train = train; gsSave();
  const n = train ? 2 : tour ? GS.tn || 6 : GS.n, level = train ? 4 : GS.level;
  const opp = makeOpponents(n, level, G.rng);
  G.T = newTable({ n, names: ['你'].concat(opp.map((o) => o.name)), styles: ['tag'].concat(opp.map((o) => o.style)), level, button: (G.rng() * n) | 0, tourney: tour });
  G.tEnd = null;
  G.ctx = { hero: 0, seen: new Set(GS.seen) };
  showView('table');
  nextHand();
}
function nextHand() {
  clearTimeout(G.timer);
  if (G.tEnd) return;
  G.H = newHand(G.T, G.rng);
  G.steps = []; G.view = -1; G.review = []; G.over = false; G.replay = false; G.waitingHero = false; G.pendingAI = null; G.adv = null; G.lastRender = null; G.flash = null; G.paused = false;
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
    gtoReset();
    endHand(G.T, H);
    const net = H.result.net[0];
    if (!G.T.tourney && !GS.train) { GS.hands++; GS.net += net; if (net > 0) GS.won++; }   // 首頁的數字只算一般桌
    gsSave();
    if (G.T.tourney) {
      const alive = G.T.seats.filter((x) => x.stack > 0).length, R = G.T.tourney;
      const prize = (pl) => (pl <= R.pay.length ? Math.round(R.start * 100 * R.pay[pl - 1] / 100) : 0);
      if (G.T.seats[0].stack <= 0) {
        // 同一手出局的人：這手開始時籌碼多的名次比較前面
        const me = H.players[0].start, better = H.players.filter((q) => q.seat !== 0 && G.T.seats[q.seat].stack <= 0 && q.start > me).length;
        const pl = alive + 1 + better;
        G.tEnd = { place: pl, prize: prize(pl), n: R.start };
      }
      else if (alive === 1) G.tEnd = { place: 1, prize: prize(1), n: R.start };
    }
    try { statsHand(H, G.review); } catch (e) { console.error(e); }
    G.over = true;
    G.steps.push({ kind: 'summary', snap: snap(H) });
    return;
  }
  const r = gameStep(H);
  if (r.need === undefined) {
    if (r.k === 'street' && !H.players[0].folded) G.ctx.info = heroInfo(H, 0); else if (r.k === 'deal') { G.ctx.info = null; gtoReset(); }
    pushStep(eventStep(r));
    if (r.k === 'street') gtoOnStreet(r);
    return;
  }
  if (r.need === 0) {
    G.adv = coachAdvice(H, G.rng);
    G.waitingHero = true; G.gtoAdv = null;
    pushStep({ kind: 'hero', adv: G.adv, title: '輪到你', lines: [] });
    gtoHeroTurn(false);
    if (GS.train && GS.autoPre && H.street <= 1) G.autoHero = setTimeout(() => { if (G.waitingHero && atHead() && !G.replay) heroAct(G.adv.act, true); }, 350);
    return;
  }
  if (gtoBotWait(H.toAct)) return;
  const decide = () => { if (G.pendingAI && G.pendingAI.seat === H.toAct) { const a = G.pendingAI.a; G.pendingAI = null; return a; } return aiDecide(H, G.rng, G.T.level); };
  const ev = applyAction(H, decide());
  gtoOnAct(ev);
  if (ev.t === 'f') {
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
function back() {
  clearTimeout(G.timer);
  if (G.view > 0) { G.view--; renderCur(); }
}
/* 自動模式：電腦的動作照速度一件一件播；你已經棄牌就快轉 */
function isRunning() { return GS.flow === 'auto' && !G.paused && !G.replay && atHead() && !G.waitingHero && !G.over; }
function stepDelay(st) {
  const k = st.ev ? st.ev.k : st.kind;
  let d = k === 'act' ? (st.ev.seat === 0 ? 450 : 750) : k === 'street' ? 950 : k === 'win' ? 1500 : k === 'show' ? 1500 : k === 'folds' ? 650 : k === 'deal' ? 700 : 450;
  if (st.grade) d = st.grade.mark === 'good' ? 800 : 2200;                // 你剛做完決定：讓評分停久一點
  if (st.tip) d += 2500;                                                   // 第一次遇到的規則說明
  d *= [0, 1.6, 1, 0.55][GS.speed];
  if (st.snap.players[0].folded && !st.grade) d = Math.min(d, 280);        // 你棄牌了：快轉
  return d;
}
function scheduleAuto() {
  clearTimeout(G.timer);
  if (!isRunning() || $('vTable').hidden || G.waitAI) return;
  G.timer = setTimeout(() => { forward(); }, stepDelay(G.steps[G.view]));
}
/* 跳過：一路做到輪到你或這一手結束 */
function skipAhead() {
  clearTimeout(G.timer);
  let guard = 0;
  while (!G.over && !G.waitingHero && !G.waitAI && guard++ < 400) produce();
  G.view = G.steps.length - 1;
  renderCur(); scheduleAuto();
}
/* 你按了動作 */
function heroAct(a, auto) {
  if (!G.waitingHero || !atHead() || G.replay) return;
  clearTimeout(G.autoHero);
  const H = G.H, adv = G.adv;
  const ev = applyAction(H, a);
  const gg = gtoGrade(ev);
  const g = gg || gradeAction(adv, ev);
  gtoOnAct(ev);
  G.gtoAdv = null;
  if (gg && GS.train) { trainAdd(gg); gsSave(); }
  if (!auto) G.review.push({ street: ev.street, label: actWord(ev, H), grade: g, adv: gg ? gg.adv : adv.label });
  G.waitingHero = false;
  pushStep(eventStep(ev, auto ? {} : { grade: g, adv: gg ? { label: gg.adv } : adv }));
  G.view = G.steps.length - 1;
  G.flash = auto ? null : { mark: g.mark, text: g.text, adv: gg ? gg.adv : adv.label, view: G.view, src: g.src };
  G.sizerStep = -1;
  renderCur();
  scheduleAuto();
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
    const open = hero || G.replay || GS.peek || (showdown && !p.folded);
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
  const tb = $('tInfo');
  if (G.T && G.T.tourney) {
    const R = G.T.tourney, lv = Math.min(TOURNEY_LEVELS.length - 1, Math.floor((S.no - 1) / R.per)), rem = R.per - ((S.no - 1) % R.per + 1);
    const alive = S.players.length;
    const order = 1 + S.players.filter((x) => x.start > S.players[0].start).length;
    tb.hidden = false;
    tb.innerHTML = ['盲注 ' + S.sb + '／' + S.bb, lv >= TOURNEY_LEVELS.length - 1 ? '最高級' : rem ? rem + ' 手後升級' : '下一手升級', '剩 ' + alive + ' 人', '你排第 ' + order + '（' + fmt(S.players[0].start / S.bb, 0) + ' 大盲）'].map((x) => '<span>' + x + '</span>').join('・');
    tb.title = '錦標賽第 ' + (lv + 1) + ' 級；盲注每 ' + R.per + ' 手升一級';
    if (G.tEnd && G.over && G.view === G.steps.length - 1) tb.textContent = G.tEnd.place === 1 ? '錦標賽結束：你拿到第 1 名' : '錦標賽結束：你第 ' + G.tEnd.place + ' 名出局';
  } else tb.hidden = true;
  $('streetBar').innerHTML = STREETBAR.map((t, i) => '<li class="' + (i === si ? 'on' : i < si ? 'done' : '') + '">' + (i === 5 && S.result && S.result.uncontested ? '結束' : t) + '</li>').join('');
  G.lastRender = { view: G.view, board: S.board.length };
}

/* ===== 教練框 ===== */
function renderCoach(st) {
  const S = st.snap;
  $('handNo').textContent = (GS.train ? 'GTO 訓練・' : G.T && G.T.tourney ? '錦標賽・' : '') + '第 ' + S.no + ' 手' + (G.replay ? '・重看中' : '');
  $('peekWrap').hidden = G.replay;
  $('peekChk').checked = GS.peek;
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
  $('cBody').innerHTML = h;
  $('cBody').scrollTop = 0;
  renderLog();
}
/* 這一手的過程：每一步一行（自動模式播很快，想看再看） */
function renderLog() {
  let h = '';
  const last = Math.min(G.view, G.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const st = G.steps[i];
    if (st.kind === 'hero' || st.kind === 'summary') continue;
    const mk = st.grade ? '<span class="lmk ' + st.grade.mark + '">' + { good: '✓', ok: '△', bad: '✗' }[st.grade.mark] + '</span>' : '';
    h += '<li class="' + (i === G.view ? 'cur' : '') + (st.ev && st.ev.k === 'street' ? ' st' : '') + '" data-i="' + i + '">' + mk + rich(st.title) + '</li>';
  }
  $('logList').innerHTML = h;
  const box = $('logList');
  box.scrollTop = box.scrollHeight;
}
function heroHTML(st, S) {
  const adv = st.adv, L = legalSnapshot(S);
  let h = '<h3>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '：可以過牌') + '</h3>';
  const used = new Set();
  h += gtoBoxHTML();
  h += '<div class="adv"><div class="rec">' + (gtoAdvUsable() ? '教練（規則）的建議：' : '建議：') + esc(adv.label) + '</div><ol>' + adv.reasons.map((r) => '<li>' + glossify(rich(r), used) + '</li>').join('') + '</ol>';
  if (adv.detail) {
    const d = adv.detail;
    const q = d.call > 0 ? '為什麼要 ' + Math.round(d.need * 100) + '%？你的勝率怎麼算的？' : '你的勝率 ' + Math.round(d.est * 100) + '% 怎麼算的？';
    h += '<details class="deep"' + (GS.deepOpen ? ' open' : '') + '><summary>📖 詳細解說：' + q + '</summary><div class="deepbody">' + deepHTML(d) + '</div></details>';
  }
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
      h += '<li class="' + x.grade.mark + '"><span class="mk">' + mk + '</span><div><b>' + STREET_NAME[x.street] + '　' + esc(x.label) + '</b>' + (x.grade.src === 'GTO' ? ' <span class="srcg">GTO 評分</span>' : '') + '<br>' + esc(x.grade.text) + (x.grade.mark !== 'good' ? '（' + (x.grade.src === 'GTO' ? 'GTO 最常' : '建議') + '：' + esc(x.adv) + '）' : '') + '</div></li>';
    }
    h += '</ul>';
  } else h += '<p class="note">這一手你不用做決定。</p>';
  h += studioOfferHTML();
  return h;
}

/* 一手結束：可以送去 GTO 工作室的話，給按鈕（兩個人的轉牌、河牌最快；翻牌很慢） */
function studioOfferHTML() {
  if (!G.H || G.replay) return '';
  const xs = importableStreets(G.H), ok = xs.filter((x) => x.ok);
  if (!ok.length) {
    const why = xs.find((x) => x.error && !/沒有到/.test(x.error));
    return why ? '<p class="note" style="margin-top:12px">GTO 工作室：' + esc(why.error) + '</p>' : '';
  }
  const best = ok.find((x) => x.street >= 2) || ok[0];
  let h = '<div class="studiooffer" id="studioOffer"><b>用 GTO 工作室分析這一手</b><p class="note">照每個人的動作估雙方的範圍，算出這個局面的 GTO 打法，再一步一步對照你實際怎麼打。</p><div class="endbtns">';
  for (const x of ok) h += '<button class="btn' + (x === best ? ' main' : '') + '" data-studio="' + x.street + '">從' + STREET_NAME[x.street] + '開始' + (x.street === 1 ? '（要幾分鐘）' : '') + '</button>';
  return h + '</div></div>';
}
/* 這一手可以送去工作室的話，回傳最好的那條街 */
function studioBest() {
  if (!G.H || G.replay || !G.over) return 0;
  const ok = importableStreets(G.H).filter((x) => x.ok);
  return ok.length ? (ok.find((x) => x.street >= 2) || ok[0]).street : 0;
}

/* ===== 控制列：永遠在牌桌下面（手機固定在畫面底部）。輪到你＝動作鈕；電腦在動＝暫停／跳過；結束＝再來一手 ===== */
const MK = { good: '✓', ok: '△', bad: '✗' };
function renderCtrl(st) {
  const msg = $('ctrlMsg'), btns = $('ctrlBtns');
  const heroTurn = st.kind === 'hero' && atHead() && G.waitingHero && !G.replay;
  $('actBtns').hidden = !heroTurn;
  let m = '', b = '';
  // 你剛做完決定：評分留在控制列上，直到下一次輪到你
  const fl = G.flash && !G.replay && G.flash.view === G.view ? '<span class="flash ' + G.flash.mark + '"><b>' + MK[G.flash.mark] + '</b> ' + esc(G.flash.text) + (G.flash.mark !== 'good' ? '（' + (G.flash.src === 'GTO' ? 'GTO 最常' : '建議') + '：' + esc(G.flash.adv) + '）' : '') + '</span>' : '';
  if (G.replay) {
    m = '重看：第 ' + (G.view + 1) + ' 步／共 ' + G.steps.length + ' 步。' + (st.title ? rich(st.title) : '');
    b = '<button class="btn" data-c="prev"' + (G.view <= 0 ? ' disabled' : '') + '>◀ 上一步</button><button class="btn main" data-c="next" id="bNext"' + (atHead() ? ' disabled' : '') + '>下一步 ▶</button><button class="btn" data-c="endreplay">結束重看</button>';
  } else if (heroTurn) {
    const adv = st.adv, L = legalSnapshot(st.snap);
    const e = adv.eff === undefined ? adv.eq : adv.eff;
    const why = adv.need > 0 ? '你的勝率約 ' + PCT0(e) + (e < adv.eq - 0.005 ? '（打折後）' : '') + '，跟注要 ' + PCT0(adv.need) + ' 以上' : '你的勝率約 ' + PCT0(e);
    if (gtoAdvUsable()) m = '<b>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '') + '</b>　<b class="rec">GTO</b> ' + gtoLine() + '<button type="button" class="linkbtn" data-c="why">為什麼？</button>';
    else m = '<b>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '') + '</b>　建議 <b class="rec">' + esc(adv.label) + '</b><span class="why">（' + why + '）</span>'
      + (G.gto && !G.gto.lost && G.gto.seats.indexOf(0) >= 0 && GS.gtoCoach ? '<span class="why">　GTO 計算中…</span>' : '') + '<button type="button" class="linkbtn" data-c="why">為什麼？</button>';
  } else if (G.over && atHead()) {
    const net = st.snap.result ? st.snap.result.net[0] : 0;
    const marks = G.review.map((x) => MK[x.grade.mark]).join('');
    m = '<b>' + (net > 0 ? '你贏了 ' + net + '！' : net < 0 ? '你輸了 ' + (-net) : '沒輸沒贏') + '</b>' + (marks ? '　你的決定：' + marks : '') + '<button type="button" class="linkbtn" data-c="why">檢討</button>'
      + (GS.train ? '<div class="why">' + esc(trainStatsText()) + '</div>' : '');
    b = '<button class="btn main" data-c="nexthand" id="bNext">再來一手 ▶</button><button class="btn" data-c="replay">重看這一手</button>' + (studioBest() ? '<button class="btn" data-c="gto">GTO 分析</button>' : '');
    if (G.tEnd) {
      const E = G.tEnd;
      m = '<b>' + (E.place === 1 ? '🏆 你拿到第 1 名！' : '你在第 ' + E.place + ' 名出局') + '</b>（' + E.n + ' 人）' + (E.prize ? '　獎金 ' + E.prize + ' 點（每人報名 100 點）' : '　沒有進獎金圈（前 ' + G.T.tourney.pay.length + ' 名）') + (marks ? '　這手：' + marks : '') + '<button type="button" class="linkbtn" data-c="why">檢討</button>';
      b = '<button class="btn main" data-c="newtourney" id="bNext">再開一場 ▶</button><button class="btn" data-c="replay">重看這一手</button><button class="btn" data-c="home">回首頁</button>';
    }
  } else if (!atHead()) {
    m = '你在看前面的步驟（第 ' + (G.view + 1) + ' 步）。';
    b = '<button class="btn" data-c="prev"' + (G.view <= 0 ? ' disabled' : '') + '>◀</button><button class="btn main" data-c="next" id="bNext">下一步 ▶</button><button class="btn" data-c="now">回到現在</button>';
  } else {
    m = fl || rich(st.title || '');
    if (G.waitAI) m = esc(G.H.players[G.waitAI.seat].name) + ' 思考中…（GTO 計算中）';
    const folded = st.snap.players[0].folded;
    if (isRunning()) b = '<button class="btn" data-c="pause">⏸ 暫停</button><button class="btn" data-c="skip">⏭ ' + (folded ? '跳到這一手結束' : '跳到輪到你') + '</button>';
    else b = '<button class="btn" data-c="prev"' + (G.view <= 0 ? ' disabled' : '') + '>◀</button><button class="btn main" data-c="next" id="bNext">下一步 ▶</button><button class="btn" data-c="play">▶ 自動</button>';
  }
  msg.innerHTML = m;
  btns.innerHTML = b;
  btns.hidden = !b;
  if (heroTurn) renderActBtns(st);
  else $('sizer').hidden = true;
}
function renderActBtns(st) {
  const H = G.H, L = legalActions(H), adv = G.adv, p = H.players[0];
  let recF = adv.act.t === 'f', recP = adv.act.t === 'x' || adv.act.t === 'c', recA = adv.act.t === 'r';
  let allinRec = recA && adv.act.to >= L.maxTo;
  G.recTo = recA ? adv.act.to : 0;
  if (gtoAdvUsable()) {                                     // GTO 最常用的動作
    const ta = G.gtoAdv.acts[gtoBest()], b = gtoActBtn(ta, L);
    recF = b === 'f'; recP = b === 'x' || b === 'c'; recA = b === 'size' || b === 'allin'; allinRec = b === 'allin';
    G.recTo = b === 'size' ? Math.max(L.minTo, Math.min(L.maxTo, Math.round(ta.to))) : 0;
  }
  let h = '';
  if (!L.canCheck) h += '<button type="button" class="fold' + (recF ? ' rec' : '') + '" data-a="f">棄牌</button>';
  h += '<button type="button" class="' + (recP ? 'rec' : '') + '" data-a="' + (L.canCheck ? 'x' : 'c') + '">' + (L.canCheck ? '過牌' : (L.callAmt >= p.stack ? '全下跟注 ' : '跟注 ') + L.callAmt) + '</button>';
  if (L.canRaise) {
    if (L.maxTo > L.minTo) h += '<button type="button" class="' + (recA && !allinRec ? 'rec' : '') + '" data-a="size">' + (L.isBet ? '下注…' : '加注…') + '</button>';
    h += '<button type="button" class="' + (allinRec ? 'rec' : '') + '" data-a="allin">全下 ' + L.maxTo + '</button>';
  }
  // 內容一樣就不重畫（GTO 算好時只換「建議」的框，按到一半的按鈕不會不見）
  const box = $('actBtns');
  if (box.dataset.h !== h) {
    const tmp = document.createElement('div'); tmp.innerHTML = h;
    const nw = [...tmp.children], old = [...box.children];
    if (old.length === nw.length && old.every((b, i) => b.dataset.a === nw[i].dataset.a)) old.forEach((b, i) => { b.className = nw[i].className; b.textContent = nw[i].textContent; });
    else box.innerHTML = h;
    box.dataset.h = h;
  }
  if (G.sizerStep === G.view) { const v = +$('sizeRange').value; openSizer(); if (v) { $('sizeRange').value = v; sizerLabel(); } }   // 重畫時保持打開
  else $('sizer').hidden = true;
}
/* 控制列的按鈕 */
function ctrlCmd(c) {
  if (c === 'next') { G.paused = GS.flow === 'step' ? G.paused : true; forward(); }
  else if (c === 'prev') { G.paused = true; back(); }
  else if (c === 'now') { G.view = G.steps.length - 1; G.paused = GS.flow === 'step'; renderCur(); scheduleAuto(); }
  else if (c === 'pause') { G.paused = true; clearTimeout(G.timer); renderCur(); }
  else if (c === 'play') { G.paused = false; if (GS.flow === 'step') { GS.flow = 'auto'; gsSave(); } G.view = G.steps.length - 1; renderCur(); forward(); }
  else if (c === 'skip') skipAhead();
  else if (c === 'nexthand') nextHand();
  else if (c === 'newtourney') newGame('tourney');
  else if (c === 'home') showView('home');
  else if (c === 'replay') { G.replay = true; G.view = 0; G.lastRender = null; clearTimeout(G.timer); renderCur(); }
  else if (c === 'endreplay') { G.replay = false; G.view = G.steps.length - 1; G.lastRender = null; renderCur(); }
  else if (c === 'gto') { const s = studioBest(); if (s) studioFromGame(s); }
  else if (c === 'why') { const t = $('coach'); t.classList.add('pulse'); setTimeout(() => t.classList.remove('pulse'), 900); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
function openSizer() {
  const H = G.H, L = legalActions(H), adv = G.adv;
  const pot = potTotal(H);
  const opts = [];
  if (L.isBet) for (const f of [0.33, 0.5, 0.66, 1]) opts.push([Math.round(f * 100) + '% 底池', Math.round(pot * f)]);
  else { opts.push(['最小', L.minTo]); opts.push(['2.5 倍', Math.round(H.curBet * 2.5)]); opts.push(['3 倍', H.curBet * 3]); opts.push(['底池', H.curBet + pot + L.toCall]); }
  const recTo = G.recTo !== undefined ? G.recTo : adv.act.t === 'r' ? adv.act.to : 0;
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
  renderCtrl(st);
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
  $('ctrl').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) ctrlCmd(b.dataset.c); });
  if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--ctrlH', ($('ctrl').offsetHeight + 14) + 'px')).observe($('ctrl'));
  $('cLog').open = !!GS.logOpen;
  $('cLog').addEventListener('toggle', () => { GS.logOpen = $('cLog').open; gsSave(); if ($('cLog').open) renderLog(); });
  $('logList').addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; G.paused = true; clearTimeout(G.timer); G.view = +li.dataset.i; renderCur(); });
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
    const sb = e.target.closest('button[data-studio]');
    if (sb) studioFromGame(+sb.dataset.studio);
    if (e.target.closest('button[data-deep="rvr"]')) { const st = G.steps[G.view]; if (st && st.adv) { clearTimeout(G.timer); deepToRvr(st.adv.detail); } }
  });
  // 詳細解說打開或收起：記住，下一次照你上次的習慣
  $('cBody').addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('deep')) { GS.deepOpen = e.target.open; gsSave(); } }, true);
  $('nHome').addEventListener('click', () => showView('home'));
  $('bHomeSeal').addEventListener('click', () => showView('home'));
  $('nTools').addEventListener('click', () => showView('tools'));
  $('nGame').addEventListener('click', () => { showView('table'); G.lastRender = null; renderCur(); scheduleAuto(); });
  $('bResetTips').addEventListener('click', () => { GS.seen = []; if (G.ctx) G.ctx.seen = new Set(); gsSave(); $('bResetTips').textContent = '好了，下一手開始會再說明一次'; });
  $('nRanks').addEventListener('click', () => { renderRanks(); $('ranksModal').hidden = false; $('ranksClose').focus(); });
  $('ranksClose').addEventListener('click', () => { $('ranksModal').hidden = true; });
  $('ranksModal').addEventListener('click', (e) => { if (e.target === $('ranksModal')) $('ranksModal').hidden = true; });
  // 鍵盤：→／空白＝下一步或再來一手；←＝上一步；輪到你時 F 棄牌、C 過牌／跟注、B 下注／加注、A 全下
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('ranksModal').hidden = true; $('rangeModal').hidden = true; closeStats(); }
    if (document.querySelector('.modal:not([hidden])')) return;     // 有視窗開著：按鍵不動背後的牌局
    if ($('vTable').hidden || e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!$('actBtns').hidden) {
      const pick = { f: 'f', c: 'c', x: 'x', b: 'size', r: 'size', a: 'allin' }[k];
      let btn = pick && $('actBtns').querySelector('[data-a="' + pick + '"]');
      if (!btn && (k === 'c' || k === 'x')) btn = $('actBtns').querySelector('[data-a="x"],[data-a="c"]');
      if (btn) { e.preventDefault(); btn.click(); }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === ' ' || (e.key === 'Enter' && e.target === document.body)) { const nb = $('bNext'); if (nb && !nb.disabled) { e.preventDefault(); nb.click(); } }
    else if (e.key === 'ArrowLeft') ctrlCmd('prev');
  });
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('vTable').hidden && G.H && G.steps[G.view]) { G.lastRender = { view: G.view, board: G.steps[G.view].snap.board.length }; renderTable(G.steps[G.view]); } /* 只重畫桌面：教練框裡打開的解釋、下注框都保留 */ }, 150); });
  showView('home');
}
