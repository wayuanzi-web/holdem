/* ===== 57-stats：你的統計（存在這台裝置） ===== */
const STATS_KEY = 'dezhou-stats-1';
/* 分開記：一般桌、錦標賽、GTO 訓練（單挑）；數字的意思不一樣，混在一起會失真 */
const STATS_MODES = [['cash', '一般桌'], ['tour', '錦標賽'], ['train', 'GTO 訓練']];
let STATS = null, STATS_ALL = null, STATS_VIEW = 'cash';
function statsBlank() { return { hands: 0, vpip: 0, pfr: 0, tbOpp: 0, tb: 0, flop: 0, sd: 0, sdWon: 0, agg: 0, calls: 0, net: 0, pos: {}, marks: { rule: [0, 0, 0], chart: [0, 0, 0], GTO: [0, 0, 0] }, hist: [], since: Date.now() }; }
function statsLoad() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(STATS_KEY) || 'null'); } catch (e) { o = null; }
  if (o && o.marks) o = { cash: o };                                 // 舊版：只有一份，算一般桌
  STATS_ALL = o || {};
  for (const [k] of STATS_MODES) if (!STATS_ALL[k] || !STATS_ALL[k].marks) STATS_ALL[k] = statsBlank();
  STATS = STATS_ALL[STATS_VIEW];
}
function statsSave() { try { localStorage.setItem(STATS_KEY, JSON.stringify(STATS_ALL)); } catch (e) { /* 忽略 */ } }
function statsMode() { return G.T && G.T.tourney ? 'tour' : GS.train ? 'train' : 'cash'; }
/* 一手結束：從紀錄算這一手的數字 */
function statsHand(H, review) {
  if (!STATS_ALL) statsLoad();
  const S = STATS_ALL[statsMode()], me = H.players[0];
  S.hands++;
  let vpip = false, pfr = false, tbOpp = false, tb = false, raisesBefore = 0, sawFlop = false;
  for (const e of H.log) {
    if (e.k === 'street' && e.street === 1 && !me.foldedAt0) sawFlop = true;
    if (e.k !== 'act') continue;
    const raise = e.t === 'r' || e.t === 'b' || (e.t === 'a' && e.to > e.curBefore);
    if (e.street === 0) {
      if (e.seat === 0) {
        if (raisesBefore === 1 && e.canRaiseBefore !== false) tbOpp = true;
        if (raise) { pfr = true; vpip = true; if (raisesBefore === 1) tb = true; } else if (e.t === 'c' || e.t === 'a') vpip = true;
        if (e.t === 'f') me.foldedAt0 = true;
      }
      if (raise) raisesBefore++;
    } else if (e.seat === 0) { if (raise) S.agg++; else if (e.t === 'c' || e.t === 'a') S.calls++; }
  }
  sawFlop = sawFlop && H.log.some((e) => e.k === 'street' && e.street === 1) && !H.log.some((e) => e.k === 'act' && e.seat === 0 && e.t === 'f' && e.street === 0);
  const sd = !me.folded && H.log.some((e) => e.k === 'show');
  const net = H.result ? H.result.net[0] : 0;
  if (vpip) S.vpip++; if (pfr) S.pfr++; if (tbOpp) S.tbOpp++; if (tb) S.tb++; if (sawFlop) S.flop++;
  if (sd) { S.sd++; if (H.result && H.result.won && H.result.won[0] > 0) S.sdWon++; }   // 拿回任何一個底池（含平分）就算贏
  S.net += net / H.bb;
  const pz = POS_ZH[me.pos] || me.pos;
  const P = S.pos[pz] || (S.pos[pz] = { hands: 0, net: 0 });
  P.hands++; P.net += net / H.bb;
  if (!S.marks.champ) S.marks.champ = [0, 0, 0];
  for (const x of review || []) { const k = x.grade.src === 'GTO' ? 'GTO' : x.grade.src === 'chart' ? 'chart' : x.grade.src === 'champ' ? 'champ' : 'rule'; S.marks[k][{ good: 0, ok: 1, bad: 2 }[x.grade.mark]]++; }
  const cm = (review || []).filter((x) => x.grade.src === 'champ');           // 有照冠軍教練打的手、沒照的手，各自輸贏多少
  if (cm.length) { const k = cm.every((x) => x.grade.mark === 'good') ? 'yes' : 'no', Fw = S.follow || (S.follow = { yes: [0, 0], no: [0, 0] }); Fw[k][0]++; Fw[k][1] += net / H.bb; }
  S.hist.push(Math.round(S.net * 10) / 10);
  if (S.hist.length > 1000) S.hist.splice(0, S.hist.length - 1000);
  statsSave();
}
function statsHTML() {
  if (!STATS_ALL) statsLoad();
  STATS = STATS_ALL[STATS_VIEW];
  const S = STATS, n = S.hands;
  const seg = '<div class="seg" id="statsSeg">' + STATS_MODES.map(([k, t]) => '<button type="button" data-k="' + k + '" aria-pressed="' + (k === STATS_VIEW) + '">' + t + '（' + STATS_ALL[k].hands + '）</button>').join('') + '</div>';
  if (!n) return seg + '<p>' + (STATS_VIEW === 'cash' ? '還沒有紀錄。打幾手牌之後再來看。' : '這一種還沒有紀錄。') + '</p>';
  const r = (a, b) => (b ? pct(a / b, 0) + '%' : '—');
  const row = (k, v, note) => '<tr><td>' + k + '</td><td class="r num"><b>' + v + '</b></td><td class="note">' + note + '</td></tr>';
  let h = seg + '<table class="stt">'
    + row('打了幾手', n, '從 ' + new Date(S.since).toLocaleDateString() + ' 開始')
    + row('輸贏', (S.net >= 0 ? '+' : '') + fmt(S.net, 1) + ' 大盲', n >= 100 ? '每百手 ' + (S.net >= 0 ? '+' : '') + fmt(S.net / n * 100, 1) + ' 大盲' : '手數還少，運氣影響很大（100 手以上再看每百手）')
    + row('入池率（VPIP）', r(S.vpip, n), '翻牌前自己花錢玩的比例。6 人桌一般 20–28%')
    + row('翻牌前加注（PFR）', r(S.pfr, n), '翻牌前加注的比例。跟入池率差越小越積極')
    + row('再加注（3-bet）', r(S.tb, S.tbOpp), '有人開牌時你再加注的比例。一般 6–10%')
    + row('看到翻牌', r(S.flop, n), '')
    + row('攤牌率', r(S.sd, S.flop), '看到翻牌之後打到攤牌的比例。一般 25–32%')
    + row('攤牌贏的比例', r(S.sdWon, S.sd), '一般 50% 上下')
    + row('翻牌後積極度', S.calls ? fmt(S.agg / S.calls, 1) : (S.agg ? '∞' : '—'), '（下注＋加注）÷ 跟注。2–3 算積極')
    + '</table>';
  const ord = ['按鈕', '關煞位', '劫位', '低劫位', '中位', '槍口+1', '槍口', '小盲', '大盲', '按鈕（小盲）'];
  const ps = Object.keys(S.pos).sort((a, b) => ord.indexOf(a) - ord.indexOf(b));
  h += '<h3 class="sth" style="margin-top:14px">各位置的輸贏（大盲）</h3><table class="stt">' + ps.map((k) => { const P = S.pos[k]; return '<tr><td>' + k + '</td><td class="r num">' + P.hands + ' 手</td><td class="r num"><b>' + (P.net >= 0 ? '+' : '') + fmt(P.net, 1) + '</b></td></tr>'; }).join('') + '</table>';
  const M = S.marks, mt = (a) => a[0] + a[1] + a[2];
  h += '<h3 class="sth" style="margin-top:14px">你的決定</h3><table class="stt">'
    + [['冠軍教練', M.champ || [0, 0, 0]], ['教練（規則）', M.rule], ['翻牌前圖表', M.chart], ['GTO 求解', M.GTO]].filter((x) => mt(x[1])).map(([k, a]) => '<tr><td>' + k + '評的</td><td class="r num">' + mt(a) + ' 次</td><td>✓ ' + a[0] + '　△ ' + a[1] + '　✗ ' + a[2] + '（✓ ' + pct(a[0] / mt(a), 0) + '%）</td></tr>').join('') + '</table>';
  const Fw = S.follow;
  if (Fw && Fw.yes[0] + Fw.no[0]) {
    const avg = (a) => (a[0] ? (a[1] / a[0] >= 0 ? '+' : '') + fmt(a[1] / a[0], 2) + ' 大盲／手' : '—');
    h += '<h3 class="sth" style="margin-top:14px">照冠軍教練打的成績</h3><table class="stt">'
      + '<tr><td>每個決定都照冠軍打的手</td><td class="r num">' + Fw.yes[0] + ' 手</td><td class="r num"><b>' + avg(Fw.yes) + '</b></td></tr>'
      + '<tr><td>有沒照的手</td><td class="r num">' + Fw.no[0] + ' 手</td><td class="r num"><b>' + avg(Fw.no) + '</b></td></tr></table>'
      + '<p class="note">只算冠軍教練有給建議的手。手數少時運氣影響很大，幾百手以後比較準。</p>';
  }
  h += '<h3 class="sth" style="margin-top:14px">累計輸贏（大盲，最近 ' + S.hist.length + ' 手）</h3>' + statsChart(S.hist);
  return h;
}
/* 簡單的折線圖（SVG） */
function statsChart(hist) {
  if (hist.length < 2) return '<p class="note">至少要 2 手。</p>';
  const W = 520, Hh = 160, pad = 28;
  let lo = Math.min(0, ...hist), hi = Math.max(0, ...hist);
  if (hi - lo < 10) { hi += 5; lo -= 5; }
  const x = (i) => pad + (W - pad - 6) * i / (hist.length - 1), y = (v) => 6 + (Hh - 26) * (hi - v) / (hi - lo);
  const pts = hist.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const last = hist[hist.length - 1];
  return '<svg class="stchart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="累計輸贏折線圖，目前 ' + last + ' 個大盲">'
    + '<line x1="' + pad + '" x2="' + (W - 6) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="zero"/>'
    + '<text x="2" y="' + (y(hi) + 4) + '">' + Math.round(hi) + '</text><text x="2" y="' + (y(lo) + 4) + '">' + Math.round(lo) + '</text><text x="2" y="' + (y(0) + 4) + '">0</text>'
    + '<polyline points="' + pts + '" class="' + (last >= 0 ? 'up' : 'down') + '"/></svg>';
}
let statsFocus = null;
function openStats() {
  if ($('statsModal').hidden) {
    statsFocus = document.activeElement;
    if (!$('vTable').hidden) clearTimeout(G.timer);                 // 看統計時，背後的牌局先停
    STATS_VIEW = G.T && G.H && !$('vTable').hidden ? statsMode() : STATS_VIEW;
  }
  $('statsReset').dataset.sure = ''; $('statsReset').textContent = '清除這一種的統計';
  $('statsBody').innerHTML = statsHTML();
  $('statsModal').hidden = false;
  $('statsClose').focus();
}
function closeStats() {
  if ($('statsModal').hidden) return;
  $('statsModal').hidden = true;
  if (statsFocus && statsFocus.focus) statsFocus.focus();
  if (!$('vTable').hidden && G.H) scheduleAuto();
}
function initStats() {
  statsLoad();
  $('nStats').addEventListener('click', openStats);
  $('statsClose').addEventListener('click', closeStats);
  $('statsModal').addEventListener('click', (e) => {
    if (e.target === $('statsModal')) { closeStats(); return; }
    const b = e.target.closest('#statsSeg button[data-k]');
    if (b) { STATS_VIEW = b.dataset.k; openStats(); }
  });
  $('statsReset').addEventListener('click', () => {
    if ($('statsReset').dataset.sure !== '1') { $('statsReset').dataset.sure = '1'; $('statsReset').textContent = '再按一次確定清除'; return; }
    STATS_ALL[STATS_VIEW] = statsBlank(); statsSave(); openStats();
  });
}
