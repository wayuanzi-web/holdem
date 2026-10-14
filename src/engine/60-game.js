/* ===== 60-game：無限注德州撲克的一手牌（2–9 人、盲注、下注輪、邊池、攤牌） =====
   一手牌是一連串的「階段」，每呼叫一次 gameStep 只做一件事、回傳一個事件（教學模式一步一步播就是靠這個）：
     blinds（下盲注）→ deal（發手牌）→ bet（下注輪，要等某個人的動作：applyAction）→ street（發翻牌／轉牌／河牌）
     → … → showdown（亮牌）→ award（分底池）→ done
   籌碼都是整數：小盲 1、大盲 2、每人 200（100 個大盲）。座位 0 永遠是玩家自己。 */
const GAME_SB = 1, GAME_BB = 2, GAME_STACK = 200;
const STREET_NAME = ['翻牌前', '翻牌', '轉牌', '河牌'];
const POS_ZH = { BTN: '按鈕', SB: '小盲', BB: '大盲', UTG: '槍口', UTG1: '槍口+1', MP: '中位', LJ: '低劫位', HJ: '劫位', CO: '關煞位', BTNSB: '按鈕（小盲）' };

/* 位置：從按鈕算起第 k 個座位叫什麼 */
function posCodes(n) {
  if (n === 2) return ['BTNSB', 'BB'];
  const k = n - 3, mid = ['UTG1', 'MP', 'LJ', 'HJ'];
  let rest = [];
  if (k === 1) rest = ['UTG'];
  else if (k >= 2) rest = ['UTG'].concat(mid.slice(mid.length - (k - 2)), ['CO']);
  return ['BTN', 'SB', 'BB'].concat(rest);
}
/* 位置的類別（給 AI、教練用）：early 前位、middle 中位、late 後位（關煞、按鈕）、sb、bb */
function posClass(code) {
  if (code === 'BTN' || code === 'CO' || code === 'BTNSB') return 'late';
  if (code === 'SB') return 'sb';
  if (code === 'BB') return 'bb';
  if (code === 'UTG' || code === 'UTG1') return 'early';
  return 'middle';
}

function newTable(opt) {
  const n = opt.n;
  const seats = [];
  for (let i = 0; i < n; i++) seats.push({ name: opt.names[i], style: opt.styles[i], stack: GAME_STACK, hero: i === 0 });
  return { n, seats, button: (opt.button === undefined ? n - 1 : opt.button), handNo: 0, level: opt.level || 1 };
}

function shuffled(rng) {
  const d = [];
  for (let c = 0; c < 52; c++) d.push(c);
  for (let i = 51; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = d[i]; d[i] = d[j]; d[j] = t; }
  return d;
}

/* 開一手新牌：按鈕往左移一位、補滿輸光的人 */
function newHand(T, rng) {
  T.handNo++;
  const n = T.n;
  const rebuy = [];
  for (let i = 0; i < n; i++) if (T.seats[i].stack <= 0) { T.seats[i].stack = GAME_STACK; rebuy.push(i); }
  T.button = (T.button + 1) % n;
  const codes = posCodes(n);
  const players = T.seats.map((s, i) => ({
    seat: i, name: s.name, style: s.style, hero: s.hero, start: s.stack, stack: s.stack,
    bet: 0, total: 0, cards: [], folded: false, allin: false, acted: false, canRaise: true,
    pos: codes[(i - T.button + n) % n],
  }));
  const H = {
    no: T.handNo, n, button: T.button, sb: GAME_SB, bb: GAME_BB, players, board: [], deck: shuffled(rng), dp: 0,
    street: 0, curBet: 0, minRaise: GAME_BB, toAct: -1, phase: 'blinds', log: [], rebuy,
    sbSeat: n === 2 ? T.button : (T.button + 1) % n, bbSeat: -1, runout: false, result: null, aggressor: -1,
  };
  H.bbSeat = (H.sbSeat + 1) % n;
  H.log.push({ k: 'start', button: H.button, sbSeat: H.sbSeat, bbSeat: H.bbSeat, rebuy });
  return H;
}

function nextSeat(H, i) { return (i + 1) % H.n; }
function potTotal(H) { let s = 0; for (const p of H.players) s += p.total; return s; }
function potCollected(H) { let s = 0; for (const p of H.players) s += p.total - p.bet; return s; }
function activePlayers(H) { return H.players.filter((p) => !p.folded); }
function putChips(H, p, amt) {
  amt = Math.min(amt, p.stack);
  p.stack -= amt; p.bet += amt; p.total += amt;
  if (p.stack === 0) p.allin = true;
  return amt;
}

/* 輪到誰：從 from 的下一位開始找「還沒棄牌、沒全下、還沒說話或要跟注」的人 */
function findToAct(H, from) {
  for (let k = 1; k <= H.n; k++) {
    const i = (from + k) % H.n, p = H.players[i];
    if (p.folded || p.allin) continue;
    if (!p.acted || p.bet < H.curBet) return i;
  }
  return -1;
}

/* 現在輪到的人能做什麼 */
function legalActions(H) {
  const p = H.players[H.toAct];
  const toCall = Math.max(0, H.curBet - p.bet);
  const callAmt = Math.min(toCall, p.stack);
  const others = H.players.filter((q) => q !== p && !q.folded && !q.allin).length;
  const maxTo = p.bet + p.stack;
  let minTo = H.curBet === 0 ? Math.max(H.bb, H.minRaise) : H.curBet + H.minRaise;
  if (minTo > maxTo) minTo = maxTo;
  const canRaise = p.stack > toCall && p.canRaise && others > 0;
  return { seat: p.seat, toCall, callAmt, canCheck: toCall === 0, canRaise, minTo, maxTo, isBet: H.curBet === 0 };
}

/* 下注輪結束了嗎；結束就決定下一個階段 */
function afterAction(H) {
  const act = activePlayers(H);
  if (act.length === 1) { H.toAct = -1; H.phase = 'award'; return; }
  const can = act.filter((p) => !p.allin);
  const pending = can.filter((p) => !p.acted || p.bet < H.curBet);
  if (pending.length === 0 || (can.length === 1 && can[0].bet >= H.curBet)) {
    H.toAct = -1;
    if (can.length <= 1) H.runout = true;
    H.phase = H.street === 3 ? 'showdown' : 'street';
    return;
  }
  H.toAct = findToAct(H, H.toAct);
}

/* a = { t: 'f' | 'x' | 'c' | 'r', to }（r 包含下注；to 是這條街自己總共下到多少） */
function applyAction(H, a) {
  const L = legalActions(H), p = H.players[H.toAct];
  const potBefore = potTotal(H);
  const ev = { k: 'act', seat: p.seat, street: H.street, toCall: L.toCall, potBefore, curBefore: H.curBet };
  if (a.t === 'f' && L.toCall === 0) a = { t: 'x' };                       // 不用跟注時棄牌＝過牌
  if (a.t === 'x' && L.toCall > 0) a = { t: 'c' };
  if (a.t === 'r' && !L.canRaise) a = { t: L.toCall > 0 ? 'c' : 'x' };
  if (a.t === 'f') { p.folded = true; ev.t = 'f'; }
  else if (a.t === 'x') { ev.t = 'x'; }
  else if (a.t === 'c') { ev.add = putChips(H, p, L.toCall); ev.t = p.allin ? 'a' : 'c'; ev.callAll = p.allin; }
  else {
    let to = Math.round(a.to);
    if (to < L.minTo) to = L.minTo;
    if (to > L.maxTo) to = L.maxTo;
    const inc = to - H.curBet;
    ev.add = putChips(H, p, to - p.bet);
    ev.to = p.bet;
    ev.t = p.allin ? 'a' : (H.curBet === 0 ? 'b' : 'r');
    ev.raise = H.curBet > 0;
    if (inc >= H.minRaise) {                                               // 完整的加注：大家重新有加注的權利
      H.minRaise = inc;
      for (const q of H.players) if (q !== p && !q.folded && !q.allin) q.canRaise = true;
      ev.full = true;
    }
    if (p.bet > H.curBet) {
      H.curBet = p.bet;
      for (const q of H.players) if (q !== p && !q.folded && !q.allin) q.acted = false;
      H.aggressor = p.seat;
    }
  }
  p.acted = true; p.canRaise = false;
  p.last = ev.t;
  ev.potAfter = potTotal(H);
  H.log.push(ev);
  afterAction(H);
  return ev;
}

/* 做下一件不用人決定的事；要等人決定時回傳 { need: 座位 } */
function gameStep(H) {
  if (H.phase === 'blinds') {
    const s = H.players[H.sbSeat], b = H.players[H.bbSeat];
    const sa = putChips(H, s, H.sb), ba = putChips(H, b, H.bb);
    H.curBet = Math.max(s.bet, b.bet); H.minRaise = H.bb;
    H.phase = 'deal';
    const ev = { k: 'blinds', sb: { seat: s.seat, amt: sa }, bb: { seat: b.seat, amt: ba } };
    H.log.push(ev); return ev;
  }
  if (H.phase === 'deal') {
    for (let r = 0; r < 2; r++) for (let k = 1; k <= H.n; k++) H.players[(H.button + k) % H.n].cards.push(H.deck[H.dp++]);
    H.phase = 'bet';
    const first = H.n === 2 ? H.button : (H.bbSeat + 1) % H.n;
    H.toAct = -1;
    // 第一個說話的人：從 first 開始（含）找能說話的
    for (let k = 0; k < H.n; k++) { const i = (first + k) % H.n, p = H.players[i]; if (!p.folded && !p.allin) { H.toAct = i; break; } }
    const ev = { k: 'deal' };
    H.log.push(ev);
    if (H.toAct < 0) { H.phase = 'street'; H.runout = true; }
    else {
      // 只有一個人能說話、而且已經不用跟：直接發牌
      const can = H.players.filter((p) => !p.folded && !p.allin);
      if (can.length === 1 && can[0].bet >= H.curBet) { H.toAct = -1; H.phase = 'street'; H.runout = true; }
    }
    return ev;
  }
  if (H.phase === 'bet') return { need: H.toAct };
  if (H.phase === 'street') {
    for (const p of H.players) p.bet = 0;
    H.street++;
    const nc = H.street === 1 ? 3 : 1, cards = [];
    for (let i = 0; i < nc; i++) { const c = H.deck[H.dp++]; H.board.push(c); cards.push(c); }
    H.curBet = 0; H.minRaise = H.bb; H.aggressor = -1;
    for (const p of H.players) { p.acted = false; p.canRaise = true; }
    const can = H.players.filter((p) => !p.folded && !p.allin);
    if (H.runout || can.length <= 1) { H.runout = true; H.phase = H.street === 3 ? 'showdown' : 'street'; H.toAct = -1; }
    else {
      H.phase = 'bet';
      H.toAct = findToAct(H, H.button);
    }
    const ev = { k: 'street', street: H.street, cards, runout: H.runout };
    H.log.push(ev); return ev;
  }
  if (H.phase === 'showdown') {
    for (const p of H.players) p.bet = 0;
    const hands = activePlayers(H).map((p) => { const v = evalCards(p.cards.concat(H.board)); return { seat: p.seat, cards: p.cards.slice(), val: v, desc: describeHand(v) }; });
    H.phase = 'award';
    const ev = { k: 'show', hands };
    H.log.push(ev); return ev;
  }
  if (H.phase === 'award') {
    for (const p of H.players) p.bet = 0;
    const act = activePlayers(H);
    const res = { pots: [], uncontested: act.length === 1, won: new Array(H.n).fill(0) };
    const vals = {};
    for (const p of act) vals[p.seat] = act.length > 1 ? evalCards(p.cards.concat(H.board)) : 0;
    const levels = [...new Set(act.map((p) => p.total))].sort((a, b) => a - b);
    let prev = 0;
    for (const L of levels) {
      let amt = 0;
      for (const p of H.players) amt += Math.max(0, Math.min(p.total, L) - Math.min(p.total, prev));
      const elig = act.filter((p) => p.total >= L);
      prev = L;
      if (amt <= 0) continue;
      let best = -1;
      for (const p of elig) best = Math.max(best, vals[p.seat]);
      const win = elig.filter((p) => vals[p.seat] === best).map((p) => p.seat);
      // 奇數籌碼：從按鈕左邊開始依序給
      win.sort((a, b) => ((a - H.button - 1 + H.n) % H.n) - ((b - H.button - 1 + H.n) % H.n));
      const share = Math.floor(amt / win.length);
      let rem = amt - share * win.length;
      for (const s of win) { const x = share + (rem > 0 ? 1 : 0); if (rem > 0) rem--; res.won[s] += x; }
      res.pots.push({ amt, winners: win, elig: elig.map((p) => p.seat), refund: elig.length === 1 && res.pots.length > 0, desc: act.length > 1 ? describeHand(best) : '' });
    }
    // 保險：照理不會有剩（棄牌的人投進去的不會超過還在的人），有的話給最後一個底池的贏家
    let given = 0;
    for (const x of res.won) given += x;
    const left = potTotal(H) - given;
    if (left > 0 && res.pots.length) res.won[res.pots[res.pots.length - 1].winners[0]] += left;
    for (const p of H.players) p.stack += res.won[p.seat];
    res.net = H.players.map((p) => p.stack - p.start);
    H.result = res;
    H.phase = 'done';
    const ev = { k: 'win', res };
    H.log.push(ev); return ev;
  }
  return { done: true };
}

/* 一手結束：把籌碼寫回桌子 */
function endHand(T, H) { for (const p of H.players) T.seats[p.seat].stack = p.stack; }
