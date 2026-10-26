/* ===== 50-game：牌局（首頁、牌桌、教練框、上一步／下一步、動作列、一手結束的檢討與重看） ===== */
const SAVE_KEY = 'dezhou-game-1';
/* flow：auto 電腦自己出牌、輪到你才停（預設）；step 每一件事都停，按「下一步」。speed：1 慢、2 中、3 快、4 超快（電腦幾乎不停；你棄牌就直接跳到這一手結束，停在結果讓你決定要不要再來一手） */
const GS = { n: 6, flow: 'auto', speed: 2, coach: 'champ', level: 2, peek: false, seen: [], hands: 0, net: 0, won: 0, seenTermHint: false, gtoCoach: true, train: false, autoPre: false, trainStats: null };
function gsLoad() {
  try { Object.assign(GS, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 沒有存檔 */ }
  if (GS.flow !== 'auto' && GS.flow !== 'step') GS.flow = 'auto';     // 舊版的 teach／play 都改成自動
  if (!(GS.speed >= 1 && GS.speed <= 4)) GS.speed = 2;
  if (GS.coach !== 'champ' && GS.coach !== 'solid') GS.coach = 'champ';
}
function gsSave() {
  if (G.ctx) GS.seen = [...G.ctx.seen];
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(GS)); } catch (e) { /* 存不了也能玩 */ }
}
const G = { T: null, H: null, steps: [], view: -1, ctx: null, rng: null, timer: 0, waitingHero: false, adv: null, review: [], replay: false, over: false, pendingAI: null, lastRender: null, oddsTok: 0, paused: false, flash: null, gto: null, gtoAdv: null, waitAI: null };
const LEVEL_ZH = { 1: '新手', 2: '普通', 3: '高手', 4: 'GTO' };
const SPEED_ZH = { 1: '慢', 2: '中', 3: '快', 4: '超快' };
const COACH_ZH = { champ: '冠軍', solid: '穩健' };
const COACH_NOTE = { champ: '冠軍教練：看人打。每個動作都算「成功率」（他棄牌＋被跟時你贏）和平均賺賠，選賺最多的；會偷盲、詐唬岩石、對跟注站只拿好牌收錢、對瘋子跟到底。輪到你時先給一步估算，約 1.5 秒內再用「整手模擬」（每個選項照每個人的出牌習慣把這一手打完幾百次）更新。模擬同樣的牌：普通桌每 100 手比穩健教練多贏約 85 個大盲、高手桌約 80；GTO 電腦沒有漏洞可抓，冠軍教練改照書打。', solid: '穩健教練：照書打（翻牌前照圖表、翻牌後照勝率和賠率），偏緊、不容易出錯，適合剛學。實戰考核、大師之路一律照課程評分。' };
/* 冠軍教練的整手模擬：在自己的背景執行緒跑（約 1.5 秒），算好就換掉一步估算的數字和建議 */
let CW_ = null;
function CW() {
  if (CW_) return CW_;
  const src = $('engine').textContent + '\n' + $('workersrc').textContent;
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  w.onmessage = (e) => { if (e.data.cmd === 'champ-ans') champSimAns(e.data); };
  w.onerror = (e) => { console.error(e); };
  CW_ = { send(m) { w.postMessage(m); } };
  return CW_;
}
function champSimStart() {
  const adv = G.adv;
  G.champJob = null;
  if (!adv || !adv.champ || G.exam || !champNeedSim(adv)) return;
  const H = JSON.parse(JSON.stringify(G.H));
  for (const q of H.players) if (q.seat !== 0) q.cards = [];           // 不偷看：對手（含棄牌的人）的牌、還沒發的牌，模擬裡都重抽
  H.deck = [];
  const tok = (G.champTok || 0) + 1;
  G.champTok = tok; G.champJob = { tok, adv };
  try { CW().send({ cmd: 'champ-roll', token: tok, H, seat: 0, level: G.T.level, cands: champSimCands(adv), N: 800, budgetMs: 1500 }); } catch (e) { G.champJob = null; }
}
function champSimAns(m) {
  const J = G.champJob;
  if (!J || m.token !== J.tok) return;
  G.champJob = null;
  if (m.error || !m.sim || G.adv !== J.adv || !G.waitingHero) return;   // 已經按了：這一步照一步估算評分
  const nw = champMerge(J.adv, m.sim, G.H);
  const st = G.steps[G.steps.length - 1];
  G.adv = nw;
  if (st && st.kind === 'hero' && st.adv === J.adv) st.adv = nw;
  if (!$('vTable').hidden && atHead() && !G.replay) renderCur();
}
/* 輪到你：照你選的教練（考核一律用課程的教練） */
function advise(H) { return GS.coach === 'champ' && !G.exam ? champAdvice(H, G.rng, G.T.level) : coachAdvice(H, G.rng); }
const SPEED_NOTE = { 1: '電腦每個動作停久一點，適合邊看邊學。', 2: '一般速度。', 3: '電腦動作比較快。', 4: '電腦幾乎不停；你棄牌就直接跳到這一手結束，停在結果，由你決定要不要再來一手。實戰考核不受影響。' };

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
  $('hS').innerHTML = [1, 2, 3, 4].map((k) => '<button type="button" data-s="' + k + '" aria-pressed="' + (k === GS.speed) + '">' + SPEED_ZH[k] + '</button>').join('');
  $('hSNote').textContent = SPEED_NOTE[GS.speed]; renderSpeedChip();
  $('hC').innerHTML = ['champ', 'solid'].map((k) => '<button type="button" data-coach="' + k + '" aria-pressed="' + (k === GS.coach) + '">' + COACH_ZH[k] + '教練</button>').join('');
  $('hCNote').textContent = COACH_NOTE[GS.coach];
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
  $('hC').addEventListener('click', (e) => { const b = e.target.closest('button[data-coach]'); if (!b) return; GS.coach = b.dataset.coach; gsSave(); renderHome(); });
  $('bStart').addEventListener('click', () => newGame(false));
  $('bTrain').addEventListener('click', () => newGame(true));
  $('bTour').addEventListener('click', () => newGame('tourney'));
  $('hTn').addEventListener('click', (e) => { const b = e.target.closest('button[data-tn]'); if (!b) return; GS.tn = +b.dataset.tn; gsSave(); renderHome(); });
  $('hGto').addEventListener('change', (e) => { GS.gtoCoach = e.target.checked; gsSave(); });
  $('hAutoPre').addEventListener('change', (e) => { GS.autoPre = e.target.checked; gsSave(); });
  $('bResume').addEventListener('click', () => { showView('table'); renderCur(); scheduleAuto(); });
}

/* ===== 開新的一桌、新的一手 ===== */
/* kind：false 一般、true GTO 訓練、'tourney' 錦標賽、'exam' 實戰考核（examId＝哪一次考核） */
function newGame(kind, examId) {
  clearTimeout(G.timer); clearTimeout(G.autoHero); clearTimeout(G.botT); clearTimeout(G.lockT);
  gtoReset(); G.pendingAI = null;                                      // 上一桌沒做完的 GTO 電腦、代打都清掉
  G.rng = makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const train = kind === true, tour = kind === 'tourney', exam = kind === 'exam';
  GS.train = train; gsSave();
  G.exam = exam ? examNew(examId, G.rng) : null;
  const n = exam ? G.exam.n : train ? 2 : tour ? GS.tn || 6 : GS.n, level = train ? 4 : exam ? G.exam.level : GS.level;
  const opp = makeOpponents(n, level, G.rng);
  if (exam && G.exam.villains) opp[0].style = examVillain(G.exam);
  G.T = newTable({ n, names: ['你'].concat(opp.map((o) => o.name)), styles: ['tag'].concat(opp.map((o) => o.style)), level, button: (G.rng() * n) | 0, tourney: tour });
  G.tEnd = null;
  G.ctx = { hero: 0, seen: new Set(GS.seen), exam: exam };
  showView('table');
  nextHand();
}
function nextHand() {
  clearTimeout(G.timer); clearTimeout(G.autoHero); clearTimeout(G.botT); clearTimeout(G.lockT);
  if (G.tEnd || (G.exam && G.exam.done)) return;
  gtoReset();
  if (G.exam) examPrep();
  G.H = newHand(G.T, G.rng);
  if (G.exam) examDeal(G.H);
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
    if (!G.T.tourney && !GS.train && !G.exam) { GS.hands++; GS.net += net; if (net > 0) GS.won++; }   // 首頁的數字只算一般桌
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
    if (G.exam) examHandEnd();
    else try { statsHand(H, G.review); } catch (e) { console.error(e); }
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
    G.adv = advise(H);
    G.waitingHero = true; G.gtoAdv = null;
    pushStep({ kind: 'hero', adv: G.adv, title: '輪到你', lines: [] });
    gtoHeroTurn(false);
    champSimStart();
    armAutoHero();
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
/* 翻牌前（GTO 訓練的自動打翻牌前）、GTO 訓練場的翻牌前和翻牌：教練代打。離開再回來也會重新排上 */
function autoHeroWanted() { return G.waitingHero && G.H && G.H.street <= 1 && ((GS.train && GS.autoPre) || examAutoNow()); }
function armAutoHero() {
  if (!autoHeroWanted() || G.autoArmed === G.steps.length) return;
  clearTimeout(G.autoHero);
  G.autoArmed = G.steps.length;
  G.autoHero = setTimeout(() => {
    G.autoArmed = -1;
    if (!autoHeroWanted()) return;
    if (atHead() && !G.replay && !$('vTable').hidden) heroAct(G.adv.act, true);
    else G.autoArmed = -1;                                               // 不在現在這一步：回來時（renderCtrl）再排
  }, 350);
}
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
  d *= [0, 1.6, 1, 0.55, 0.25][GS.speed];
  if (st.snap.players[0].folded && !st.grade) d = Math.min(d, GS.speed === 4 ? 120 : 280);   // 你棄牌了：快轉
  return d;
}
function scheduleAuto() {
  clearTimeout(G.timer);
  if (!isRunning() || $('vTable').hidden) return;
  if (G.waitAI) { botPoll(); return; }                                 // GTO 電腦在等解：過一下再問（離開牌桌再回來也接得上）
  G.timer = setTimeout(() => { forward(); }, stepDelay(G.steps[G.view]));
}
/* 跳過：一路做到輪到你或這一手結束 */
function skipAhead() {
  clearTimeout(G.timer);
  let guard = 0;
  while (!G.over && !G.waitingHero && !G.waitAI && guard++ < 400) produce();
  G.view = G.steps.length - 1;
  renderCur(); scheduleAuto();
  if (G.waitAI && !G.waitAI.asking) afterBot();
}
/* 超快模式：你棄牌就不用看這一手剩下的，直接跳到結束（停在結果，由你按「再來一手」）。考核不用：要看評分；逐步解說也不用 */
function fastFoldOn() { return GS.speed === 4 && GS.flow === 'auto' && !G.exam; }
/* 你按了動作 */
function heroAct(a, auto) {
  if (!G.waitingHero || !atHead() || G.replay || (!auto && examLockBtns())) return;
  clearTimeout(G.autoHero);
  const H = G.H, adv = G.adv;
  const ev = applyAction(H, a);
  const gg = gtoGrade(ev);
  const g = gg || gradeAction(adv, ev);
  gtoOnAct(ev);
  G.gtoAdv = null;
  if (gg && GS.train) { trainAdd(gg); gsSave(); }
  if (!auto) G.review.push({ street: ev.street, label: actWord(ev, H), grade: g, adv: gg ? gg.adv : adv.label, trivial: ev.street === 0 && ev.t === 'f' && !!adv.chart && adv.chart.fold >= 0.95 });
  G.waitingHero = false;
  pushStep(eventStep(ev, auto ? {} : { grade: g, adv: gg ? { label: gg.adv } : adv }));
  G.view = G.steps.length - 1;
  G.flash = auto ? null : { mark: g.mark, text: g.text, adv: gg ? gg.adv : adv.label, view: G.view, src: g.src };
  G.sizerStep = -1;
  if (ev.t === 'f' && fastFoldOn()) { skipAhead(); return; }        // 照規則跑完（統計、錦標賽名次照算），停在結果
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
    const open = hero || G.replay || peekOn() || (showdown && !p.folded);
    let cards = '';
    if (p.cards.length === 2 && !(p.folded && !hero && !G.replay && !peekOn())) {      // 偷看打開：棄牌的人的牌也看得到
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
  } else if (G.exam) { tb.hidden = false; tb.innerHTML = examBarHTML(); tb.title = ''; }
  else tb.hidden = true;
  tb.classList.toggle('exam', !!G.exam);
  $('streetBar').innerHTML = STREETBAR.map((t, i) => '<li class="' + (i === si ? 'on' : i < si ? 'done' : '') + '">' + (i === 5 && S.result && S.result.uncontested ? '結束' : t) + '</li>').join('');
  G.lastRender = { view: G.view, board: S.board.length };
}

/* ===== 教練框 ===== */
function renderCoach(st) {
  const S = st.snap;
  $('handNo').textContent = (G.exam ? (G.exam.final ? '畢業考・' : G.exam.gto ? 'GTO 訓練場・' : '實戰考核・') : GS.train ? 'GTO 訓練・' : G.T && G.T.tourney ? '錦標賽・' : '') + '第 ' + S.no + ' 手' + (G.replay ? '・重看中' : '');
  $('peekWrap').hidden = G.replay || !!G.exam;
  $('peekChk').checked = GS.peek;
  let h = '';
  if (st.kind === 'summary') h = summaryHTML(S);
  else if (st.kind === 'hero') h = G.exam && !G.over && !G.replay ? examHeroHTML(S, st !== G.steps[G.steps.length - 1] || !G.waitingHero) : heroHTML(st, S);   // 考核中：這一手結束前都不顯示建議
  else {
    h += '<h3>' + rich(st.title) + '</h3>';
    if (st.grade) {
      const mk = { good: '✓', ok: '△', bad: '✗' }[st.grade.mark];
      h += '<div class="grade ' + st.grade.mark + '"><span class="mk">' + mk + '</span><div>' + esc(st.grade.text) + (st.grade.mark !== 'good' ? '<br><span class="note">教練的建議是：' + esc(st.adv.label) + '</span>' : '') + '</div></div>';
    }
    const used = new Set();
    for (const l of st.lines) h += '<p>' + glossify(rich(l), used) + '</p>';
    const pk = peekFoldHTML(st);
    if (pk) h += '<div class="peek"><b>👀 偷看：他為什麼棄牌</b>' + pk + '</div>';
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
  const C = adv.champ && adv.champ.options && adv.champ.options.length ? adv.champ : null;
  h += '<div class="adv"><div class="rec">' + (C ? '🏆 冠軍教練：' : gtoAdvUsable() ? '教練（規則）的建議：' : '建議：') + esc(adv.label) + (C ? '<span class="champsub">成功率 ' + PCT0(C.best.win) + '・平均 ' + champBBtxt(C.best.ev, C.bb) + (C.sim ? '・整手模擬 ' + C.sim.n + ' 次' : G.champJob && G.champJob.adv === adv ? '・<span class="thinking">整手模擬中…</span>' : '') + '</span>' : '') + '</div><ol>' + adv.reasons.map((r) => '<li>' + glossify(rich(r), used) + '</li>').join('') + '</ol>';
  if (C) h += champTableHTML(C);
  h += outsBoxHTML(adv, S);
  if (C) h += '<details class="deep"' + (GS.deepOpen ? ' open' : '') + '><summary>📖 詳細解說：成功率 ' + PCT0(C.best.win) + '、平均 ' + champBBtxt(C.best.ev, C.bb) + ' 怎麼算的？勝率跟成功率差在哪？</summary><div class="deepbody">' + champDeepHTML(adv, C) + '</div></details>';
  if (adv.detail) {
    const d = adv.detail;
    const q = d.call > 0 ? '為什麼要 ' + Math.round(d.need * 100) + '%？你的勝率怎麼算的？' : '你的勝率 ' + Math.round(d.est * 100) + '% 怎麼算的？';
    h += C ? '<details class="deep2"><summary>📘 穩健教練的算法：' + q + '</summary><div class="deepbody">' + deepHTML(d) + '</div></details>'
      : '<details class="deep"' + (GS.deepOpen ? ' open' : '') + '><summary>📖 詳細解說：' + q + '</summary><div class="deepbody">' + deepHTML(d) + '</div></details>';
  }
  if (adv.more && adv.more.length) h += '<details><summary>為什麼？更多說明</summary>' + adv.more.map((r) => '<p>' + glossify(rich(r), used) + '</p>').join('') + '</details>';
  if (EXPLAIN.on && atHead() && !G.replay && !GS.seenTermHint) h += '<p class="note">底下有虛線的詞可以點，會跳出解釋；不需要的話，右上角「深入說明」可以關掉。</p>';
  h += '</div>';
  return h;
}
/* ===== 冠軍教練：每個選項的成功率、平均賺賠、他會怎麼回應 ===== */
function champBBtxt(ev, bb) { const x = ev / (bb || 2); return (x >= 0.05 ? '+' : x <= -0.05 ? '−' : '') + fmt(Math.abs(x), 1) + ' 大盲'; }
function champTableHTML(C) {
  let h = '<table class="champt"><tr><th>動作</th><th class="r">成功率</th><th class="r">平均</th><th>他們會</th></tr>';
  for (const o of C.options) {
    let who = '';
    const one = C.read.length <= 1, he = one ? '他' : '下一個人';
    if (o.nx && o.act.t !== 'f') {                                       // 整手模擬算出來的：你這樣做之後，對手的第一個動作
      const x = o.nx;
      if (o.act.t === 'r') who = one ? '棄 ' + PCT0(x.f) + '・跟 ' + PCT0(x.c) + (x.r >= 0.01 ? '・加注 ' + PCT0(x.r) : '') : '大家都棄 ' + PCT0(x.allFold);
      else if (x.n >= 5) who = (x.next > 0.5 ? '下一條街' + he : he) + '下注 ' + PCT0(x.r) + '・過牌 ' + PCT0(x.x) + (x.f >= 0.02 ? '・棄 ' + PCT0(x.f) : '') + (x.c >= 0.02 ? '・跟 ' + PCT0(x.c) : '');
      else who = '直接攤牌比大小';
    }
    else if (o.resp && o.resp.length === 1) { const x = o.resp[0]; who = '棄 ' + PCT0(x.f) + '・跟 ' + PCT0(x.c) + (x.r >= 0.01 ? '・加注 ' + PCT0(x.r) : ''); }
    else if (o.resp && o.resp.length) who = '大家都棄 ' + PCT0(o.foldAll);
    else if (o.pBet !== undefined) who = '他下注 ' + PCT0(o.pBet) + (o.pBet > 0.05 ? (o.callVsBet ? '（你再跟）' : '（你就棄）') : '');
    else if (o.closes) who = o.river ? '直接攤牌比大小' : (one ? '他' : '大家') + '已經過牌：這條街結束，免費看下一張';
    else if (o.nAfter) who = '後面還有 ' + o.nAfter + ' 人會說話';
    else if (o.sq !== undefined && o.sq > 0.03) who = '後面再加注 ' + PCT0(o.sq);
    h += '<tr class="' + (o === C.best ? 'best' : '') + '"><td>' + (o === C.best ? '★ ' : '') + esc(o.label) + '</td><td class="r">' + PCT0(o.win) + '</td><td class="r ' + (o.ev >= 0 ? 'pos' : 'neg') + '">' + champBBtxt(o.ev, C.bb) + '</td><td><small>' + who + '</small></td></tr>';
  }
  h += '</table><p class="note">成功率＝贏下這個底池的機會（他棄牌，加上被跟時你贏）。平均＝長期每做一次賺賠幾個大盲（跟現在棄牌比）。「他們會」＝你這樣做之後對手的下一個動作' + (C.sim ? '（整手模擬裡實際發生的比例）' : '（照每個人的風格估）') + '。'
    + (C.options[0] !== C.best ? (C.sim ? '★ 不是平均最高的那一個：差距還在模擬的誤差內（每次模擬結果會有一點不同），冠軍維持原來的判斷。' : '★ 不是平均最高的那一個：主動下注、加注要多賺一點（0.25 個大盲以上）才值得冒險，只差一點點就選比較穩的。') : '') + '</p>';
  return h;
}
/* ===== 冠軍教練的詳細解說：勝率、成功率、平均是什麼，每個選項怎麼算出來的 ===== */
function champCalcHTML(o, bb) {
  const c = o.calc;
  if (!c) return '';
  const B = (x) => champBBtxt(x, bb), P = PCT0, n = (x) => Math.round(x), n1 = (x) => (x < -0.05 ? '−' : '') + fmt(Math.abs(x), 1);
  const R = (r) => '×' + r.toFixed(2);
  if (c.k === 'fold') return '不再放錢。這一手已經放進去的拿不回來（那是「沉沒成本」，不影響現在的判斷），所以平均就是 0，成功率 0%。';
  if (c.k === 'check') {
    const lead = c.closes ? (c.river ? '大家都過牌就直接攤牌。' : '大家都過牌，這條街結束，免費看下一張。') : '不用再放錢，但後面的人還可以下注。';
    return lead + '你的勝率 ' + P(c.eq) + '；' + (c.R < 0.999 ? '之後還有下注，沒中時常常得棄牌，實際拿得到約 ' + P(c.eq) + ' ' + R(c.R) + ' ≈ ' + P(c.eq * c.R) + '（實現率）。' : '')
      + '平均 ≈ ' + P(c.eq * c.R) + ' × 底池 ' + n(c.pot) + ' ＝ ' + n1(c.eq * c.R * c.pot) + ' 籌碼 ≈ ' + B(c.eq * c.R * c.pot) + '。';
  }
  if (c.k === 'checkOOP') {
    return '你先過牌，他接著有 <b>' + P(c.PB) + '</b> 會下注（約 ' + c.b + '）。他下注的牌比較強，你對它們的勝率 ' + P(c.eqVB) + '，' + (c.callEV > 0 ? '跟下去還划算（平均 ' + B(c.callEV) + '），你就跟。' : '跟下去不划算，你就棄（這部分算 0）。')
      + '他過牌（' + P(1 - c.PB) + '）時多半牌不強，你對它們的勝率 ' + P(c.eqVK) + '，實際拿得到約 ' + P(c.eqVK * c.Rk) + '。'
      + '平均 ≈ ' + P(c.PB) + ' × ' + n(Math.max(0, c.callEV)) + ' ＋ ' + P(1 - c.PB) + ' × ' + P(c.eqVK * c.Rk) + ' × 底池 ' + n(c.pot) + ' ≈ ' + B(o.ev1 !== undefined ? o.ev1 : o.ev) + '。';
  }
  if (c.k === 'call') {
    return '跟 ' + c.cost + ' 之後底池 ' + n(c.pot) + '。你的勝率 ' + P(c.eq)
      + (c.sq > 0.01 ? '；後面的人有 ' + P(c.sq) + ' 會再加注，那時你多半要棄' : '')
      + (c.R < 0.999 ? '；' + (c.allin ? '' : '之後還有下注，' + (c.ip ? '你有位置' : c.pre ? '你沒位置' : '') + '實際拿得到約 ' + R(c.R)) : '；' + (c.allin ? '跟了就全下，一定看到攤牌' : '河牌跟了就直接攤牌'))
      + '。成功率 ≈ ' + (c.sq > 0.01 ? '（1 − ' + P(c.sq) + '）× ' + P(c.eq) + ' ＝ ' + P(o.win1 !== undefined ? o.win1 : o.win) : '勝率 ' + P(c.eq)) + '。'
      + '平均 ≈ ' + (c.sq > 0.01 ? '（1 − ' + P(c.sq) + '）× ' : '') + P(c.eq) + ' ' + (c.R < 0.999 ? R(c.R) + ' ' : '') + '× ' + n(c.pot) + (c.imp ? '（＋聽牌的隱含賠率 ' + P(c.imp) + '）' : '') + ' − ' + c.cost + ' ≈ ' + B(o.ev1 !== undefined ? o.ev1 : o.ev) + '。';
  }
  if (c.k === 'raise') {
    const all = c.multi || c.pre ? '大家都棄' : '他棄牌';
    let h = '你要再放 ' + n(c.cost) + '。<ul class="cmath">'
      + '<li>' + all + ' <b>' + P(c.F) + '</b>：你直接拿走現在的底池 ' + n(c.pot0) + '，不用亮牌。→ ' + P(c.F) + ' × ' + n(c.pot0) + ' ＝ ' + n1(c.evF) + '</li>';
    if (c.pC > 0.005) h += '<li>被跟 <b>' + P(c.pC) + '</b>：你對「會跟的那些牌」的勝率 ' + P(c.eqC) + (c.R && c.R < 0.999 ? '，之後還有下注，實際約 ' + R(c.R) : '') + '，底池約 ' + n(c.potC) + '。→ ' + P(c.pC) + ' ×（' + P(c.eqC) + (c.R && c.R < 0.999 ? ' ' + R(c.R) : '') + ' × ' + n(c.potC) + ' − ' + n(c.cost) + '）＝ ' + n1(c.evC) + '</li>';
    if (c.pR > 0.005) h += '<li>被再加注 <b>' + P(c.pR) + '</b>：' + (c.contR !== undefined && c.contR > -c.cost ? '你的牌夠強，跟下去' : '你多半只能棄，輸掉放進去的 ' + n(c.cost)) + '。→ ' + n1(c.evR) + '</li>';
    h += '</ul>平均 ≈ ' + n1(c.evF) + (c.pC > 0.005 ? ' ' + (c.evC >= 0 ? '＋ ' : '− ') + fmt(Math.abs(c.evC), 1) : '') + (c.pR > 0.005 ? ' ' + (c.evR >= 0 ? '＋ ' : '− ') + fmt(Math.abs(c.evR), 1) : '') + ' ＝ ' + n1(c.evF + c.evC + c.evR) + ' 籌碼 ≈ ' + B(c.evF + c.evC + c.evR) + '。'
      + '成功率 ≈ ' + P(c.F) + (c.pC > 0.005 ? ' ＋ ' + P(c.pC) + ' × ' + P(c.eqC) : '') + ' ≈ ' + P(o.win1 !== undefined ? o.win1 : o.win) + '。';
    return h;
  }
  return '';
}
function champDeepHTML(adv, C) {
  const bb = C.bb || 2, P = PCT0;
  let h = '<h4>① 勝率、成功率、平均，有什麼不一樣？</h4><ul>';
  h += '<li><b>勝率</b>：兩邊都打到最後亮牌比大小，你贏的比例。' + (C.eq !== undefined ? '照' + (C.read.length ? C.read.map((r) => esc(r.name) + '（' + esc(styleZh(r.style)) + '）').join('、') + '的風格和動作' : '動作') + '估' + (C.read.length > 1 ? '他們' : '他') + '的範圍，你的勝率約 <b>' + P(C.eq) + '</b>' + (C.rand !== undefined ? '；如果' + (C.read.length > 1 ? '他們' : '他') + '是隨便拿的牌是 ' + P(C.rand) + '——不是隨便拿牌，這個只是對照' : '') + '。' : '還沒人進池，勝率要看誰會跟（下面每個選項分開算）。') + '</li>';
  h += '<li><b>打折後的勝率（實現率）</b>：勝率是「一定看到攤牌」的比例。之後還會下注，你沒中常常得棄牌，那部分就拿不到，所以要打折。</li>';
  h += '<li><b>成功率</b>：照這個動作打，這一手最後你拿到底池的比例＝他棄牌的時候（不用亮牌）＋被跟時你贏的時候。下注、加注的成功率常比勝率高（多了他棄牌）；跟注、過牌最多就是勝率。</li>';
  h += '<li><b>平均</b>：長期每做一次賺賠多少＝贏的時候拿到的 − 你要再放進去的，跟現在棄牌（0）比，正的才賺。冠軍選<b>平均最高</b>的，不是成功率最高的（例如全下成功率高，但輸的時候輸很多）。</li></ul>';
  h += '<h4>② 每個選項怎麼算' + (C.sim ? '（先用一步估算）' : '') + '</h4>';
  const shown = C.options.slice(0, 4);
  for (const o of shown) h += '<p><b>' + (o === C.best ? '★ ' : '') + esc(o.label) + '</b>：' + champCalcHTML(o, bb) + '</p>';
  if (C.options.length > shown.length) h += '<p class="note">其他選項平均都比較低，就不一一列出。</p>';
  if (C.sim) {
    h += '<h4>③ 整手模擬 ' + C.sim.n + ' 次</h4><p>上面是「只看下一步」的估算（之後的街用實現率打折）。整手模擬直接把這一手照每個人的出牌習慣打完 ' + C.sim.n + ' 次（對手的牌照他的範圍抽、之後的公牌隨機發），數最後的結果：</p>'
      + '<table class="dtab"><tr><th>選項</th><th class="r">一步估算</th><th class="r">模擬：成功率</th><th class="r">模擬：平均</th></tr>'
      + C.options.map((o) => '<tr><td>' + (o === C.best ? '★ ' : '') + esc(o.label) + '</td><td class="r">' + (o.ev1 !== undefined ? champBBtxt(o.ev1, bb) : '—') + '</td><td class="r">' + P(o.win) + '</td><td class="r">' + champBBtxt(o.ev, bb) + '</td></tr>').join('') + '</table>'
      + '<p>兩個不一樣時以模擬為準：它把之後每一條街的下注、你被逼棄牌、他再付錢都算進去了。模擬也有誤差（次數有限），差一點點時冠軍維持原來的判斷。</p>';
  }
  if (adv.detail && C.baseEq !== undefined) {
    h += '<h4>' + (C.sim ? '④' : '③') + ' 跟下面「穩健教練的算法」的關係</h4><p>下面是穩健教練的算法：它一律把對手當一般的緊凶玩家來估範圍，勝率 ' + P(C.baseEq)
      + (C.baseEff !== undefined && C.baseEff < C.baseEq - 0.005 ? '、打折後 ' + P(C.baseEff) : '') + (C.baseNeed > 0 ? '，再跟「打平要的勝率」（底池賠率）' + P(C.baseNeed) + ' 比' : '') + '。'
      + '冠軍照每個人實際的風格估範圍' + (C.eq !== undefined && Math.abs(C.eq - C.baseEq) > 0.02 ? '，所以勝率不一樣（' + P(C.eq) + '）' : '') + '，而且多算了他會不會棄牌、之後還會怎麼下注。</p>';
  }
  return h;
}
/* ===== 出牌明細：每一張出牌、中了變成什麼、打不打折、機率、要不要賭 ===== */
function outsBoxHTML(adv, S) {
  const T = adv.info && adv.info.outsT;
  if (!T || (G.exam && !G.over && !G.replay) || !(adv.eq < 0.7 && (adv.info.draws || adv.eq < 0.5))) return '';   // 有聽牌、或現在落後才列（已經大幅領先時「出牌」沒意義）
  const p = S.players[0], L = legalSnapshot(S), er = (x) => Math.round(x * 10) / 10;
  const opp = S.players.filter((q) => !q.folded && q.seat !== 0), oppStack = opp.length ? Math.max(...opp.map((q) => q.stack)) : 0;
  let h = '<div class="outsbox"><b>出牌明細：' + T.total + ' 張' + (T.eff < T.total - 0.5 ? '（中了真的會領先的約 ' + er(T.eff) + ' 張）' : '') + '</b>';
  h += '<table class="outst"><tr><th>中了變成</th><th>哪幾張</th><th class="r">張數</th></tr>';
  for (const g of T.groups) {
    const avg = g.n ? g.eff / g.n : 0;
    const q = avg >= 0.8 ? '✓ 乾淨' : avg >= 0.5 ? '△ 要打折' : '✗ 中了也常輸';
    h += '<tr><td><b>' + esc(g.name) + '</b><small>' + q + '（中了領先 ' + PCT0(avg) + (avg < 0.8 && g.beat.length ? '，會輸給' + g.beat.join('、') : '') + '）</small></td><td>'
      + g.cards.map((x) => '<span class="oc ' + (x.share >= 0.8 ? 'ok' : x.share >= 0.5 ? 'half' : 'bad') + '" title="中了領先 ' + PCT0(x.share) + '">' + cardSpan(x.c) + '</span>').join('') + '</td><td class="r">' + g.n + '</td></tr>';
  }
  h += '</table>';
  if (T.weak) h += '<p class="note">另外 ' + T.weak + ' 張只讓你變成比公牌小的對子，不算出牌。</p>';
  h += '<ul>' + outsAdviceLines(T, { toCall: L.toCall, pot: potTotal(S), stack: p.stack, oppStack, label: adv.label, est: adv.eq }).map((x) => '<li>' + rich(x) + '</li>').join('') + '</ul>';
  h += '<p class="note">「中了領先」＝這張牌發出來以後，你的牌比教練估的他的範圍大的比例。劃掉的牌中了也常輸；虛線底的要打折。</p></div>';
  return h;
}
/* ===== 偷看（打開「偷看對手的牌」、不是考核）：棄牌的人拿什麼、為什麼棄 ===== */
function peekOn() { return !!(GS.peek && !G.exam); }
function foldWhy(S, seat) {
  const p = S.players[seat], c = p.cards;
  if (!c || c.length !== 2) return '';
  const nm = '<b>' + esc(p.name) + '</b>（' + esc(styleZh(p.style)) + '・' + POS_ZH[p.pos] + '）', toCall = Math.max(0, S.curBet - p.bet);
  const cards = rich(CARDS_TOK(sortedCards(c)));
  if (!S.board.length) {
    const g = heroCls(c), pct = PRE_PCT[g];
    let why;
    if (!preflopRaises(S)) { const thr = openThr(p.pos, (STYLES[p.style] || STYLES.tag).loose, S.n); why = pct < thr ? '在他平常會玩的範圍邊緣（約前 ' + PCT0(thr) + '），這次沒玩' : styleZh(p.style) + '在這個位置大約只玩前 ' + PCT0(thr) + ' 的牌，不在裡面'; }
    else { const st = STYLES[p.style] || STYLES.tag; why = '面對加注到 ' + S.curBet + '（要再付 ' + toCall + '）：' + (pct > 0.2 ? '這手牌不夠強' : st.loose < 0.9 ? '牌其實可以玩，但' + st.zh + '打得緊，面對加注只玩更好的牌' : '牌其實可以玩，他這次選擇保守'); }
    return nm + '：' + cards + '（' + esc(clsWords(g)) + '，起手牌前 ' + PCT0(pct) + '）——' + esc(why) + '。';
  }
  const need = toCall > 0 ? toCall / (potTotal(S) + toCall) : 0;
  let h = nm + '：' + cards + ' → ' + esc(CATG[handCategory(c[0], c[1], S.board)]);
  const o = S.board.length < 5 ? outsInfo(c, S.board) : null;
  if (o && o.total) h += '（' + o.total + ' 張出牌）';
  if (toCall > 0) h += '。面對下注要跟 ' + toCall + '，勝率要 ' + PCT0(need);
  const hero = S.players[0];
  if (!hero.folded && toCall > 0 && hero.cards.length === 2) {
    const one = new Float32Array(NCOMBO); one[comboOf(hero.cards[0], hero.cards[1])] = 1;
    const eq = exactHU(c, S.board, one).eq;
    h += '；對你的牌他其實有 ' + PCT0(eq) + '：' + (eq >= need ? '棄得太早（被你嚇跑了）' : '棄對了');
  }
  return h + '。';
}
/* 這一步有人棄牌：他拿什麼、為什麼 */
function peekFoldHTML(st) {
  if (!peekOn() || !st.ev) return '';
  const seats = st.ev.k === 'folds' ? st.ev.seats : st.ev.k === 'act' && st.ev.t === 'f' ? [st.ev.seat] : [];
  const ss = seats.filter((s) => s !== 0);
  if (!ss.length) return '';
  if (!st.peekH) st.peekH = ss.map((s) => '<p>' + foldWhy(st.snap, s) + '</p>').join('');
  return st.peekH;
}
/* 一手結束：所有棄牌的人 */
function peekSummaryHTML() {
  if (!peekOn()) return '';
  let h = '';
  for (const st of G.steps) { const x = peekFoldHTML(st); if (x) h += x.replace(/<p>/g, '<p>' + STREET_NAME[st.ev.street !== undefined ? st.ev.street : st.snap.street] + '・'); }
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
  const pk = peekSummaryHTML();
  if (pk) h += '<div class="peek"><b>👀 偷看：棄牌的人拿什麼</b>' + pk + '</div>';
  if (G.review.length) {
    h += '<p style="margin-top:10px"><b>這一手你的每個決定</b></p><ul class="review">';
    for (const x of G.review) {
      const mk = { good: '✓', ok: '△', bad: '✗' }[x.grade.mark];
      h += '<li class="' + x.grade.mark + '"><span class="mk">' + mk + '</span><div><b>' + STREET_NAME[x.street] + '　' + esc(x.label) + '</b>' + (x.grade.src === 'GTO' ? ' <span class="srcg">GTO 評分</span>' : '') + '<br>' + esc(x.grade.text) + (x.grade.mark !== 'good' ? '（' + (x.grade.src === 'GTO' ? 'GTO 最常' : '建議') + '：' + esc(x.adv) + '）' : '') + '</div></li>';
    }
    h += '</ul>';
    h += '<div class="strow"><button type="button" class="btn sm main" data-c="review">📝 逐步檢討：當時猜的範圍、他實際的牌、每一步對不對</button></div>';
  } else h += '<p class="note">這一手你不用做決定。</p>';
  if (G.exam) h += examSummaryHTML();
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
  const ab = $('actBtns'), wasHidden = ab.hidden;
  ab.hidden = !heroTurn;
  if (heroTurn && wasHidden) {                                          // 動作鈕剛出現：0.45 秒內點不到（連按「跳到輪到你」不會按到動作）
    ab.classList.add('arm'); clearTimeout(G.armT);
    G.armT = setTimeout(() => ab.classList.remove('arm'), 450);
  }
  let m = '', b = '';
  // 你剛做完決定：評分留在控制列上，直到下一次輪到你
  const fl = G.flash && !G.replay && (G.flash.view === G.view || (isRunning() && G.flash.view < G.view)) ? '<span class="flash ' + G.flash.mark + '"><b>' + MK[G.flash.mark] + '</b> ' + esc(G.flash.text) + (G.flash.mark !== 'good' ? '（' + (G.flash.src === 'GTO' ? 'GTO 最常' : '建議') + '：' + esc(G.flash.adv) + '）' : '') + '</span>' : '';
  if (G.replay) {
    m = '重看：第 ' + (G.view + 1) + ' 步／共 ' + G.steps.length + ' 步。' + (st.title ? rich(st.title) : '');
    b = '<button class="btn" data-c="prev"' + (G.view <= 0 ? ' disabled' : '') + '>◀ 上一步</button><button class="btn main" data-c="next" id="bNext"' + (atHead() ? ' disabled' : '') + '>下一步 ▶</button><button class="btn" data-c="endreplay">結束重看</button>';
  } else if (heroTurn) {
    const adv = st.adv, L = legalSnapshot(st.snap);
    const e = adv.eff === undefined ? adv.eq : adv.eff;
    armAutoHero();
    examLockTick();
    const why = adv.need > 0 ? '你的勝率約 ' + PCT0(e) + (e < adv.eq - 0.005 ? '（打折後）' : '') + '，跟注要 ' + PCT0(adv.need) + ' 以上' : '你的勝率約 ' + PCT0(e);
    if (examHiding() && examAutoNow()) m = '<b>教練代打' + STREET_NAME[G.H.street] + '</b>　<span class="why">GTO 訓練場只評轉牌、河牌</span>';
    else if (examHiding() && examWaitGto()) m = '<b>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '') + '</b>　<span class="why">GTO 計算中…算好才能按（' + (G.gto.ready && G.gto.pct < 900 ? '可剝削度 ' + fmt(G.gto.pct, 1) + '%，要 3% 以下' : '準備中') + '）</span>';
    else if (examHiding()) m = '<b>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '') + '</b>　<span class="why">考核中：自己決定，按完評分（已評 ' + G.exam.grades.length + '／' + G.exam.need + '）</span>';
    else if (gtoAdvUsable()) m = '<b>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '') + '</b>　<b class="rec">GTO</b> ' + gtoLine() + '<button type="button" class="linkbtn" data-c="why">為什麼？</button>';
    else if (adv.champ && adv.champ.best) m = '<b>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '') + '</b>　🏆 <b class="rec">' + esc(adv.label) + '</b><span class="why">（成功率 ' + PCT0(adv.champ.best.win) + '，平均 ' + champBBtxt(adv.champ.best.ev, adv.champ.bb) + (G.champJob && G.champJob.adv === adv ? '；整手模擬中…' : '') + '）</span>'
      + (G.gto && !G.gto.lost && G.gto.seats.indexOf(0) >= 0 && GS.gtoCoach ? '<span class="why">　GTO 計算中…</span>' : '') + '<button type="button" class="linkbtn" data-c="why">為什麼？</button>';
    else m = '<b>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '') + '</b>　建議 <b class="rec">' + esc(adv.label) + '</b><span class="why">（' + why + '）</span>'
      + (G.gto && !G.gto.lost && G.gto.seats.indexOf(0) >= 0 && GS.gtoCoach ? '<span class="why">　GTO 計算中…</span>' : '') + '<button type="button" class="linkbtn" data-c="why">為什麼？</button>';
  } else if (G.over && atHead()) {
    const net = st.snap.result ? st.snap.result.net[0] : 0;
    const marks = G.review.map((x) => MK[x.grade.mark]).join('');
    m = '<b>' + (net > 0 ? '你贏了 ' + net + '！' : net < 0 ? '你輸了 ' + (-net) : '沒輸沒贏') + '</b>' + (marks ? '　你的決定：' + marks : '') + '<button type="button" class="linkbtn" data-c="why">檢討</button>'
      + (GS.train ? '<div class="why">' + esc(trainStatsText()) + '</div>' : '');
    b = '<button class="btn main" data-c="nexthand" id="bNext">再來一手 ▶</button>' + (G.review.length ? '<button class="btn" data-c="review">逐步檢討</button>' : '') + '<button class="btn" data-c="replay">重看這一手</button>' + (studioBest() ? '<button class="btn" data-c="gto">GTO 分析</button>' : '');
    if (G.tEnd) {
      const E = G.tEnd;
      m = '<b>' + (E.place === 1 ? '🏆 你拿到第 1 名！' : '你在第 ' + E.place + ' 名出局') + '</b>（' + E.n + ' 人）' + (E.prize ? '　獎金 ' + E.prize + ' 點（每人報名 100 點）' : '　沒有進獎金圈（前 ' + G.T.tourney.pay.length + ' 名）') + (marks ? '　這手：' + marks : '') + '<button type="button" class="linkbtn" data-c="why">檢討</button>';
      b = '<button class="btn main" data-c="newtourney" id="bNext">再開一場 ▶</button><button class="btn" data-c="replay">重看這一手</button><button class="btn" data-c="home">回首頁</button>';
    }
    if (G.exam) { const x = examOverCtrl(net, marks); m = x.m; b = x.b; }
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
  const overNow = !G.replay && G.over && atHead();
  if (overNow && !G.overShown) {                                       // 結果剛出現：0.45 秒內點不到（剛按完棄牌，連按不會直接開下一手）
    btns.classList.add('arm'); clearTimeout(G.armT2);
    G.armT2 = setTimeout(() => btns.classList.remove('arm'), 450);
  }
  G.overShown = overNow;
  if (heroTurn) renderActBtns(st);
  else $('sizer').hidden = true;
}
function renderActBtns(st) {
  const H = G.H, L = legalActions(H), adv = G.adv, p = H.players[0];
  let recF = adv.act.t === 'f', recP = adv.act.t === 'x' || adv.act.t === 'c', recA = adv.act.t === 'r';
  let allinRec = recA && adv.act.to >= L.maxTo;
  G.recTo = recA ? adv.act.to : 0;
  if (examHiding()) { recF = recP = recA = allinRec = false; G.recTo = 0; }
  const lock = examLockBtns();
  if (gtoAdvUsable() && !examHiding()) {                   // GTO 最常用的動作（考核中不顯示）
    const ta = G.gtoAdv.acts[gtoBest()], b = gtoActBtn(ta, L);
    recF = b === 'f'; recP = b === 'x' || b === 'c'; recA = b === 'size' || b === 'allin'; allinRec = b === 'allin';
    G.recTo = b === 'allin' ? L.maxTo : b === 'size' ? Math.max(L.minTo, Math.min(L.maxTo, Math.round(ta.to))) : 0;
  }
  void allinRec;
  let h = '';
  if (!L.canCheck) h += '<button type="button" class="fold' + (recF ? ' rec' : '') + '" data-a="f">棄牌</button>';
  h += '<button type="button" class="' + (recP ? 'rec' : '') + '" data-a="' + (L.canCheck ? 'x' : 'c') + '">' + (L.canCheck ? '過牌' : (L.callAmt >= p.stack ? '全下跟注 ' : '跟注 ') + L.callAmt) + '</button>';
  // 全下不放在這一排（連按「跳到輪到你」容易按到）：在「加注…」打開的框裡，要再按一次確定
  if (L.canRaise) h += '<button type="button" class="' + (recA ? 'rec' : '') + '" data-a="size">' + (L.maxTo > L.minTo ? (L.isBet ? '下注…' : '加注…') : '全下 ' + L.maxTo + '…') + '</button>';
  // 內容一樣就不重畫（GTO 算好時只換「建議」的框，按到一半的按鈕不會不見）
  const box = $('actBtns');
  if (box.dataset.h !== h) {
    const tmp = document.createElement('div'); tmp.innerHTML = h;
    const nw = [...tmp.children], old = [...box.children];
    if (old.length === nw.length && old.every((b, i) => b.dataset.a === nw[i].dataset.a)) old.forEach((b, i) => { b.className = nw[i].className; b.textContent = nw[i].textContent; });
    else box.innerHTML = h;
    box.dataset.h = h;
  }
  box.querySelectorAll('button').forEach((b) => { b.disabled = lock; });
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
  else if (c === 'exam' && G.exam) newGame('exam', G.exam.id);
  else if (c === 'learn' && G.exam) { const l = lessonById(G.exam.id); openLearn('lesson', l); }
  else if (c === 'cert') openLearn('cert');
  else if (c === 'review') { if (G.over) openReview(); }
  else if (c === 'speed') { GS.speed = GS.speed % 4 + 1; gsSave(); renderSpeedChip(); if (isRunning()) scheduleAuto(); }
  else if (c === 'coach') {                                             // 換教練：輪到你的話，這一步的建議馬上重算
    GS.coach = GS.coach === 'champ' ? 'solid' : 'champ'; gsSave(); renderSpeedChip();
    if (G.waitingHero && atHead() && !G.replay && G.H && !G.exam) { const st = G.steps[G.view]; G.adv = advise(G.H); if (st && st.kind === 'hero') st.adv = G.adv; champSimStart(); renderCur(); }
  }
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
  const only = L.maxTo <= L.minTo;                                    // 籌碼不夠加注更多：只能全下
  const seen = new Set();
  let h = only ? '<span class="note">籌碼只夠全下：按右邊確定</span>' : opts.map(([t, v]) => { const x = clamp(v); if (x >= L.maxTo || seen.has(x)) return ''; seen.add(x); return '<button type="button" data-to="' + x + '">' + t + '：' + x + '</button>'; }).join('');
  if (recTo && !only) h += '<button type="button" class="rec" data-to="' + recTo + '">建議：' + (recTo >= L.maxTo ? '全下 ' : '') + recTo + '</button>';
  if (!only) h += '<button type="button" class="allin" data-to="' + L.maxTo + '">全下：' + L.maxTo + '</button>';
  $('presets').innerHTML = h;
  const rg = $('sizeRange');
  rg.min = L.minTo; rg.max = L.maxTo; rg.step = 1; rg.value = only ? L.maxTo : recTo || clamp(L.isBet ? pot * 0.66 : H.curBet * 2.5);
  rg.hidden = only;
  sizerLabel();
  $('sizer').hidden = false;
  G.sizerStep = G.view;
}
function sizerLabel() { const L = legalActions(G.H), v = +$('sizeRange').value, all = v >= L.maxTo; $('bBetGo').textContent = (all ? '確定全下 ' : L.isBet ? '下注 ' : '加注到 ') + v; $('bBetGo').classList.toggle('allin', all); }

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
  $('cOdds').hidden = (st.snap.players[0].folded || (G.exam && !G.over)) && !G.replay;
}

/* ===== 牌型大小 ===== */
function renderRanks() {
  const ex = [['皇家同花順', 'AsKsQsJsTs'], ['同花順', '9h8h7h6h5h'], ['四條', 'KcKdKhKs7d'], ['葫蘆', 'QsQhQd4c4s'], ['同花', 'AdJd8d6d2d'],
    ['順子', 'Tc9d8h7s6c'], ['三條', '7s7h7dKc2s'], ['兩對', 'JsJd5c5hAs'], ['一對', 'TsThKd6c3s'], ['高牌', 'AhQd8s5c3d']];
  $('ranksList').innerHTML = ex.map(([nm, cs]) => '<div class="rk"><span class="nm">' + nm + '</span><span class="cds">' + parseCards(cs).map((c) => cardHTML(c)).join('') + '</span></div>').join('');
}

/* 牌桌上的速度鈕：按一下換下一檔（慢→中→快→超快） */
function renderSpeedChip() {
  const b = $('spdChip'); b.textContent = '速度：' + SPEED_ZH[GS.speed]; b.title = SPEED_NOTE[GS.speed] + '（按一下換速度）'; b.classList.toggle('on', GS.speed === 4);
  const c = $('coachChip'); c.textContent = '教練：' + COACH_ZH[GS.coach]; c.title = COACH_NOTE[GS.coach] + '（按一下換教練）'; c.classList.toggle('on', GS.coach === 'champ');
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
    else if (a === 'size') { void L; openSizer(); }
  });
  $('presets').addEventListener('click', (e) => { const b = e.target.closest('button[data-to]'); if (!b) return; $('sizeRange').value = b.dataset.to; sizerLabel(); });
  $('sizeRange').addEventListener('input', sizerLabel);
  $('bBetGo').addEventListener('click', () => heroAct({ t: 'r', to: +$('sizeRange').value }));
  $('bBetCancel').addEventListener('click', () => { $('sizer').hidden = true; G.sizerStep = -1; });
  $('spdChip').addEventListener('click', () => ctrlCmd('speed'));
  $('coachChip').addEventListener('click', () => ctrlCmd('coach'));
  renderSpeedChip();
  $('cBody').addEventListener('click', (e) => {
    const sb = e.target.closest('button[data-studio]');
    if (sb) studioFromGame(+sb.dataset.studio);
    if (e.target.closest('button[data-c="review"]')) ctrlCmd('review');    // 一手結束的總結裡那顆「逐步檢討」（原本只有控制列的那顆有作用）
    if (e.target.closest('button[data-deep="rvr"]')) { const st = G.steps[G.view]; if (st && st.adv) { clearTimeout(G.timer); deepToRvr(st.adv.detail); } }
    if (e.target.closest('button[data-deep="lens"]')) { const st = G.steps[G.view]; if (st && st.adv) { clearTimeout(G.timer); lensFromGame(st.adv.detail); } }
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
  // 鍵盤：→／空白＝下一步或再來一手；←＝上一步；輪到你時 F 棄牌、C 過牌／跟注、B 下注／加注、A 全下（打開加注框，Enter 確定）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('ranksModal').hidden = true; $('rangeModal').hidden = true; $('revModal').hidden = true; closeStats(); if (!$('sizer').hidden && !document.querySelector('.modal:not([hidden])')) { $('sizer').hidden = true; G.sizerStep = -1; } }
    if (document.querySelector('.modal:not([hidden])')) return;     // 有視窗開著：按鍵不動背後的牌局
    if ($('vTable').hidden || e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!$('actBtns').hidden) {
      if (k === 'a') {                                                   // A：打開加注框、直接拉到全下；再按 Enter 才確定
        const sb = $('actBtns').querySelector('[data-a="size"]');
        if (sb && !sb.disabled) { e.preventDefault(); openSizer(); $('sizeRange').value = legalActions(G.H).maxTo; sizerLabel(); $('bBetGo').focus(); }
        return;
      }
      if (e.key === 'Enter' && !$('sizer').hidden && e.target === document.body) { e.preventDefault(); $('bBetGo').click(); return; }
      const pick = { f: 'f', c: 'c', x: 'x', b: 'size', r: 'size' }[k];
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
