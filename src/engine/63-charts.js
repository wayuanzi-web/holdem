/* ===== 63-charts：翻牌前圖表（100 大盲現金桌，常見 GTO 圖表的簡化近似） =====
   三套：'9'（7–9 人桌）、'6'（3–6 人桌）、'2'（單挑）。
   - rfi[位置]：沒人加注時開牌（加注）的範圍
   - vsOpen[防守的人][開牌的人]：面對一個加注：raise＝再加注（3-bet）、call＝跟注
       防守的人：BB、SB、IP（不是盲注、比開牌的人晚說話）；開牌的人分組：EP（前位）、MP（劫位）、CO、BTN、SB
   - vs3bet[開牌的人]：開牌後被 3-bet：raise＝4-bet、call＝跟注
   - vs4bet：被 4-bet：raise＝全下（5-bet）、call＝跟注
   範圍文字可以帶權重（AKo:0.5＝一半的時候）。raise 優先；call 只算剩下的（1 − raise）。
   位置照「後面還有幾個人說話」（B）對應：9 人桌 UTG 8、UTG1 7、MP 6、LJ 5、HJ 4、CO 3、BTN 2、SB 1；6 人桌 UTG 5、HJ 4、CO 3、BTN 2、SB 1。 */
const CHART_POS = {
  '9': ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'],
  '6': ['UTG', 'HJ', 'CO', 'BTN', 'SB'],
  '2': ['SB'],
};
const CHART_B = { '9': { UTG: 8, UTG1: 7, MP: 6, LJ: 5, HJ: 4, CO: 3, BTN: 2, SB: 1 }, '6': { UTG: 5, HJ: 4, CO: 3, BTN: 2, SB: 1 }, '2': { SB: 1 } };
const OPENER_GROUPS = ['EP', 'MP', 'CO', 'BTN', 'SB'];
const OPENER_ZH = { EP: '前位（槍口、中位）', MP: '劫位', CO: '關煞位', BTN: '按鈕', SB: '小盲' };
const DEFENDER_ZH = { BB: '大盲', SB: '小盲', IP: '後面的位置（非盲注）' };
const VS_OPEN_DEF = {
  BB: {
    EP: { raise: 'QQ+,AKs,AKo,A5s:0.5,A4s:0.5', call: '22-JJ,A2s-AQs,K9s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,65s,54s,AJo-AQo,KQo,KJo:0.5' },
    MP: { raise: 'JJ+,AQs+,AKo,A5s-A4s,KQs:0.5', call: '22-TT,A2s-AJs,K8s+,Q9s+,J8s+,T8s+,97s+,86s+,75s+,64s+,54s,ATo-AQo,KJo+,QJo' },
    CO: { raise: 'TT+,AJs+,AQo+,A5s-A3s,KQs,K9s:0.5,76s:0.5,65s:0.5', call: '22-99,A2s-ATs,K6s-KJs,Q8s+,J8s+,T7s+,96s+,86s+,75s+,64s+,53s+,A8o-AJo,KTo+,QTo+,JTo' },
    BTN: { raise: 'TT+,AJs+,AQo+,A5s-A2s,K9s,Q9s,J9s,T8s,76s,65s,54s', call: '22-99,A6s-ATs,K2s-K8s,KTs-KQs,Q4s-Q8s,QTs+,J6s-J8s,JTs,T6s-T7s,T9s,96s+,85s+,74s+,63s+,53s+,43s,A2o-AJo,K7o-KQo,Q8o-QJo,J8o-JTo,T8o+,98o,87o,76o' },
    SB: { raise: 'TT+,A9s+,ATo+,KTs+,QTs+,JTs,A5s-A2s,K9s:0.5,76s:0.5,65s:0.5', call: '22-99,A2s-A8s,K2s-K9s,Q2s-Q9s,J4s-J9s,T6s-T9s,96s+,85s+,74s+,63s+,53s+,43s,A2o-A9o,K5o+,Q8o+,J8o+,T8o+,97o+,87o' },
  },
  SB: {
    EP: { raise: 'QQ+,AKs,AKo,AQs:0.5,A5s:0.5', call: 'JJ:0.5,TT:0.5,AQs:0.5,AJs:0.3,KQs:0.3' },
    MP: { raise: 'JJ+,AQs+,AKo,A5s-A4s,KQs', call: 'TT-99,AJs,KJs:0.5,QJs:0.5' },
    CO: { raise: 'TT+,AJs+,AQo+,A5s-A3s,KQs,KJs,QJs:0.5', call: '99-77,ATs,KTs,QTs,JTs' },
    BTN: { raise: '99+,ATs+,AJo+,A5s-A2s,KTs+,QTs+,JTs,K9s:0.5,T9s:0.5,98s:0.5,87s:0.5,KQo', call: '88-66,A9s-A6s' },
  },
  IP: {
    EP: { raise: 'QQ+,AKs,AKo,A5s:0.5', call: 'JJ-77,AJs-AQs,KQs,QJs,JTs,T9s:0.5' },
    MP: { raise: 'JJ+,AQs+,AKo,A5s-A4s', call: 'TT-66,ATs-AJs,KJs+,QJs,JTs,T9s,98s:0.5,AQo:0.5' },
    CO: { raise: 'TT+,AJs+,AQo+,A5s-A3s,KQs,K9s:0.5,76s:0.5', call: '99-55,A9s-ATs,KTs-KJs,QTs+,JTs,T9s,98s,87s,AJo:0.5,KQo:0.5' },
  },
};
const VS3_DEF = {
  EP: { raise: 'KK+,AKs,AKo:0.3,A5s:0.3', call: 'QQ-99,AQs-AJs,KQs,AKo' },
  MP: { raise: 'KK+,AKs,AKo:0.4,A5s:0.5,A4s:0.3', call: 'QQ-88,AQs-ATs,KQs,KJs,QJs,JTs,AKo,AQo:0.5' },
  CO: { raise: 'QQ+,AKs,AKo:0.5,A5s:0.5,A4s:0.5,K9s:0.3', call: 'JJ-77,AQs-ATs,KQs-KTs,QJs,QTs,JTs,T9s,98s,AKo,AQo' },
  BTN: { raise: 'QQ+,AKs,AKo:0.6,A5s:0.5,A4s:0.5,A3s:0.5,K8s:0.3,Q9s:0.3', call: 'JJ-66,AQs-A9s,KQs-K9s,QJs-Q9s,J9s+,T8s+,98s,87s,76s,AKo,AQo,AJo:0.5,KQo:0.5' },
  SB: { raise: 'QQ+,AKs,AKo:0.6,A5s:0.5,A4s:0.5', call: 'JJ-55,AQs-A8s,KQs-K9s,QJs-QTs,JTs,T9s,98s,AKo,AQo,AJo:0.5,KQo:0.5' },
};
const VS4_DEF = { raise: 'KK+,AKs,AKo:0.5', call: 'QQ,JJ:0.5,AKo,AQs:0.5' };
const CHART_DEF = {
  '9': {
    rfi: {
      UTG: '77+,ATs+,KTs+,QTs+,JTs,T9s,98s,AJo+,KQo',
      UTG1: '66+,A9s+,A5s,KTs+,QTs+,JTs,T9s,98s,87s,AJo+,KQo',
      MP: '55+,A8s+,A5s-A4s,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,ATo+,KJo+,QJo',
      LJ: '44+,A2s+,K9s+,Q9s+,J9s+,T8s+,98s,87s,76s,65s,ATo+,KJo+,QJo',
      HJ: '33+,A2s+,K7s+,Q9s+,J9s+,T8s+,97s+,87s,76s,65s,54s,A9o+,KTo+,QTo+,JTo',
      CO: '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,96s+,85s+,75s+,64s+,54s,A7o+,A5o,K9o+,Q9o+,J9o+,T9o',
      BTN: RANGE_BTN_OPEN,
      SB: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,74s+,64s+,53s+,43s,A2o+,K7o+,Q8o+,J8o+,T8o+,98o,87o',
    },
    vsOpen: VS_OPEN_DEF, vs3bet: VS3_DEF, vs4bet: VS4_DEF,
  },
  '6': {
    rfi: {
      UTG: '44+,A2s+,K9s+,Q9s+,J9s+,T8s+,98s,87s,76s,65s,ATo+,KJo+,QJo',
      HJ: '33+,A2s+,K7s+,Q9s+,J9s+,T8s+,97s+,87s,76s,65s,54s,A9o+,KTo+,QTo+,JTo',
      CO: '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,96s+,85s+,75s+,64s+,54s,A7o+,A5o,K9o+,Q9o+,J9o+,T9o',
      BTN: RANGE_BTN_OPEN,
      SB: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,74s+,64s+,53s+,43s,A2o+,K7o+,Q8o+,J8o+,T8o+,98o,87o',
    },
    vsOpen: VS_OPEN_DEF, vs3bet: VS3_DEF, vs4bet: VS4_DEF,
  },
  '2': {
    rfi: { SB: '22+,A2+,K2s+,K4o+,Q2s+,Q7o+,J3s+,J7o+,T5s+,T7o+,95s+,97o+,84s+,87o,74s+,76o,63s+,65o,53s+,43s' },
    vsOpen: { BB: { SB: { raise: '88+,A8s+,ATo+,KTs+,KQo,QJs,A5s-A2s,K7s:0.5,J9s:0.5,T8s:0.5,97s:0.5,86s:0.5,75s:0.5,64s:0.5',
      call: '22-77,A2s-A7s,A2o-A9o,K2s-K9s,K2o-KJo,Q2s-QTs,Q5o-QJo,J4s-JTs,J7o+,T5s-T9s,T7o+,95s+,97o+,85s+,87o,74s+,76o,63s+,65o,53s+,43s' } } },
    vs3bet: { SB: { raise: 'TT+,AJs+,AQo+,A5s:0.5,A4s:0.5,K9s:0.3', call: '99-22,ATs-A2s,KQs-K8s,QJs-Q9s,JTs-J9s,T9s,98s,87s,76s,65s,AJo-A9o,KQo,KJo,QJo' } },
    vs4bet: VS4_DEF,
  },
};

/* 使用者改過的圖表（畫面存在瀏覽器，啟動時交給這裡）：{ '6/rfi/BTN': {raise, call}, … } */
let CHART_OVR = {};
function setChartOverrides(o) { CHART_OVR = o || {}; CHART_CACHE.clear(); }
const CHART_CACHE = new Map();
/* 圖表的一格：key＝'6/rfi/BTN'、'6/vsOpen/BB/CO'、'6/vs3bet/BTN'、'6/vs4bet' → { raise, call }（文字） */
function chartText(key) {
  if (CHART_OVR[key]) return CHART_OVR[key];
  const [t, kind, a, b] = key.split('/'), C = CHART_DEF[t];
  if (!C) return null;
  if (kind === 'rfi') return C.rfi[a] ? { raise: C.rfi[a], call: '' } : null;
  if (kind === 'vsOpen') return C.vsOpen[a] && C.vsOpen[a][b] ? C.vsOpen[a][b] : null;
  if (kind === 'vs3bet') return C.vs3bet[a] || null;
  if (kind === 'vs4bet') return C.vs4bet || null;
  return null;
}
/* 解析好的：{ raise: Float32Array(1326), call: … }（call 已經扣掉 raise） */
function chartRanges(key) {
  let r = CHART_CACHE.get(key);
  if (r) return r;
  const t = chartText(key);
  if (!t) return null;
  const R = parseRange(t.raise || ''), C = parseRange(t.call || ''), call = new Float32Array(NCOMBO);
  for (let k = 0; k < NCOMBO; k++) call[k] = Math.max(0, Math.min(C[k], 1 - R[k]));
  r = { raise: R, call };
  CHART_CACHE.set(key, r);
  return r;
}
/* ===== 起手牌強度排名（全站共用：教練說的「排第幾名」、範圍編輯器的「最好的前 x%」、電腦開牌、估對手範圍、大師之路） =====
   照預設圖表的「開牌順序」：在越多位置開牌（9 人桌、6 人桌、單挑的開牌圖加總）越強；一樣時照勝率（對 1 家、對 3 家的平均）。
   使用者自己改圖表不會改這個排名。（62-ranges 原本的排名先算，這裡覆蓋） */
(function rankByCharts() {
  if (typeof PREFLOP === 'undefined') return;
  const score = new Float64Array(169);
  for (const t of ['9', '6', '2']) for (const pos of Object.keys(CHART_DEF[t].rfi)) {
    const w = parseRange(CHART_DEF[t].rfi[pos]);
    for (let g = 0; g < 169; g++) { const cs = CLASS_COMBOS[g]; let x = 0; for (const k of cs) x += w[k]; score[g] += x / cs.length; }
  }
  const eq = [];
  for (let g = 0; g < 169; g++) { const q = preflopLookup(g); eq.push((q.eq[0] + q.eq[2]) / 2); }
  const ord = [...Array(169).keys()].sort((a, b) => (score[b] - score[a]) || (eq[b] - eq[a]));
  let cum = 0;
  ord.forEach((g, i) => { const sz = classSize(g); PRE_PCT[g] = (cum + sz / 2) / NCOMBO; cum += sz; PRE_RANK[g] = i + 1; });
})();
/* 這張桌子用哪一套 */
function chartTable(n) { return n <= 2 ? '2' : n <= 6 ? '6' : '9'; }
/* 座位翻牌前後面還有幾個人說話（大盲 0） */
function seatBehind(H, seat) { const n = H.n; return n - 1 - ((seat - (H.bbSeat + 1) + n * 2) % n); }
function chartPosName(t, B) { const L = CHART_POS[t]; for (const k of L) if (CHART_B[t][k] === B) return k; return B > CHART_B[t][L[0]] ? L[0] : null; }
function openerZh(t, g) { return t === '6' && g === 'EP' ? '槍口' : OPENER_ZH[g]; }
function openerGroup(B) { return B >= 5 ? 'EP' : B === 4 ? 'MP' : B === 3 ? 'CO' : B === 2 ? 'BTN' : 'SB'; }

/* 現在這個情況查哪一張圖：回傳 { key, kind, name（說明）, raise, call, fold（這手牌的比例） } 或 null（跛入的底池等等，圖表沒有） */
function chartSpot(H, seat) {
  if (H.street !== 0) return null;
  const t = chartTable(H.n), p = H.players[seat], B = seatBehind(H, seat);
  const acts = H.log.filter((e) => e.k === 'act' && e.street === 0);
  const raisers = [];
  let limp = false, selfLimp = false;
  for (const e of acts) {
    if (e.t === 'r' || e.t === 'b' || (e.t === 'a' && e.to > e.curBefore)) raisers.push(e.seat);
    else if (e.t === 'c' && !raisers.length) { if (e.seat === seat) selfLimp = true; else limp = true; }
  }
  if (limp && !raisers.length) return null;
  if (selfLimp) return null;                                   // 自己跛入過：圖表沒有這種情況
  if (raisers.length) {                                        // 面對全下或很大的注：圖表是照一般大小算的，改用勝率和底池賠率
    const last = H.players[raisers[raisers.length - 1]], toCall = H.curBet - p.bet;
    if (last.allin || toCall >= p.stack * 0.4) return null;
  }
  let key, name;
  if (!raisers.length) {
    if (B === 0) return null;                                   // 大盲沒人加注：過牌
    const pos = chartPosName(t, B);
    if (!pos) return null;
    key = t + '/rfi/' + pos; name = (t === '2' ? '單挑' : t + ' 人桌') + '・' + POS_ZH_CHART(t, pos) + '開牌';
  } else if (raisers.length === 1 && raisers[0] !== seat) {
    const og = openerGroup(seatBehind(H, raisers[0]));
    const def = t === '2' ? 'BB' : B === 0 ? 'BB' : B === 1 ? 'SB' : 'IP';
    key = t + '/vsOpen/' + def + '/' + og;
    if (!chartText(key)) return null;
    name = (t === '2' ? '單挑' : t + ' 人桌') + '・' + DEFENDER_ZH[def] + '面對' + openerZh(t, og) + '開牌';
  } else if (raisers.length === 2 && raisers[0] === seat) {
    const og = openerGroup(B);
    key = t + '/vs3bet/' + og;
    if (!chartText(key)) return null;
    name = (t === '2' ? '單挑' : t + ' 人桌') + '・' + openerZh(t, og) + '開牌後被再加注（3-bet）';
  } else if (raisers.length >= 3 && raisers[raisers.length - 2] === seat) {
    key = t + '/vs4bet';
    name = '被 4-bet 以上（' + (raisers.length) + ' 次加注）';
  } else return null;                                          // 例如沒進池時面對「開牌＋3-bet」：圖表沒有
  const R = chartRanges(key);
  if (!R) return null;
  const c = comboOf(p.cards[0], p.cards[1]);
  const raise = R.raise[c], call = R.call[c];
  return { key, kind: key.split('/')[1], name, raise, call, fold: Math.max(0, 1 - raise - call), raisers: raisers.length };
}
function POS_ZH_CHART(t, pos) { return t === '2' ? '按鈕（小盲）' : (POS_ZH[pos] || pos); }
/* 圖表裡這個範圍整體占幾 %（畫面用） */
function chartPct(R) { let s = 0, sc = 0; for (let k = 0; k < NCOMBO; k++) { s += R.raise[k]; sc += R.call[k]; } return { raise: s / NCOMBO, call: sc / NCOMBO }; }

/* 照圖表加注要加到多少 */
function chartRaiseTo(H, L, ch) {
  const p = H.players[L.seat];
  let to;
  if (ch.kind === 'rfi') to = Math.round(H.bb * (seatBehind(H, L.seat) === 1 && H.n > 2 ? 3 : 2.5));
  else if (ch.kind === 'vsOpen') { const oop = seatBehind(H, L.seat) <= 1 && H.n > 2; to = Math.round(H.curBet * (oop ? 3.5 : 3)); }
  else if (ch.kind === 'vs3bet') to = Math.round(H.curBet * 2.3);
  else to = L.maxTo;
  to = Math.max(L.minTo, Math.min(L.maxTo, to));
  if (L.maxTo - to < to * 0.35) to = L.maxTo;                  // 剩下的不多：直接全下
  void p;
  return to;
}
/* 照圖表的比例抽一個動作（GTO 電腦用） */
function chartAct(H, L, ch, rng) {
  const r = rng();
  if (r < ch.raise) return L.canRaise ? { t: 'r', to: chartRaiseTo(H, L, ch) } : ch.raise >= 0.5 ? { t: 'c' } : { t: L.canCheck ? 'x' : 'f' };
  if (r < ch.raise + ch.call) return { t: L.canCheck ? 'x' : 'c' };
  return { t: L.canCheck ? 'x' : 'f' };
}
/* 這手牌在圖表裡的比例，用文字講 */
function chartMixText(ch) {
  const parts = [];
  if (ch.raise >= 0.03) parts.push((ch.kind === 'rfi' ? '開牌加注' : ch.kind === 'vsOpen' ? '再加注（3-bet）' : ch.kind === 'vs3bet' ? '4-bet' : '全下') + ' ' + Math.round(ch.raise * 100) + '%');
  if (ch.call >= 0.03) parts.push('跟注 ' + Math.round(ch.call * 100) + '%');
  if (ch.fold >= 0.03) parts.push('棄牌 ' + Math.round(ch.fold * 100) + '%');
  return parts.join('、');
}

/* ===== 短碼（有效籌碼 ≤ 12 個大盲）：翻牌前「推或棄」 =====
   近似 Nash 推牌範圍：照後面還有幾個人（B）和有效籌碼（大盲）內插；面對全下的跟注範圍比推牌範圍緊 */
const PUSH_BB = [4, 6, 8, 10, 12];
const PUSH_TBL = { 1: [0.9, 0.75, 0.62, 0.55, 0.48], 2: [0.7, 0.55, 0.45, 0.38, 0.32], 3: [0.55, 0.42, 0.34, 0.28, 0.24], 4: [0.45, 0.34, 0.27, 0.22, 0.19], 5: [0.38, 0.27, 0.21, 0.17, 0.14] };
function pushPct(bb, B) {
  const T = PUSH_TBL[Math.max(1, Math.min(5, B))];
  if (bb <= PUSH_BB[0]) return T[0];
  for (let i = 1; i < PUSH_BB.length; i++) if (bb <= PUSH_BB[i]) { const f = (bb - PUSH_BB[i - 1]) / (PUSH_BB[i] - PUSH_BB[i - 1]); return T[i - 1] + (T[i] - T[i - 1]) * f; }
  return T[T.length - 1];
}
/* 推或棄的排名（跟開牌的排名不一樣）：照「被跟的時候的勝率」排——對前 10%、15%、22%、32% 的牌的平均勝率。對子、帶 A 的牌比較前面，同花連張比較後面。
   短碼全下、面對全下都用這個排名（電腦、教練、課程一致）。離線算好：169 個格子編號，36 進位各兩字 */
const PUSH_ORD_TXT = '000e0s16010d1k020q1y032c13042q0f1g05340r060g3i071t093w0h080a0b4a260c140t4o2j0i0u39173m1h2w3z4c150j0k0v1l0l0m181i0n1u1j0o1m1z0w190p2d0x200y2r350z1n2e3j271v2k101a1o2x1w1x212s11363a1b1c122f3n1d3k2b28402a1e1q1p222t3x2p294d2g371f1r2o331s3l2l2n23242u2y2m32253h3v3y3b312h3o384b303g2i3u2z413f2v3c4e3p483e3d3q3t49424f3s47434l4g3r464m444h4k4n454i4j';
const PUSH_PCT = new Float32Array(169), PUSH_RANK = new Int16Array(169);
(function () { let cum = 0; for (let i = 0; i < 169; i++) { const g = parseInt(PUSH_ORD_TXT.substr(i * 2, 2), 36), sz = classSize(g); PUSH_PCT[g] = (cum + sz / 2) / NCOMBO; cum += sz; PUSH_RANK[g] = i + 1; } })();
/* 每一格起手牌對「推或棄排名前 v% 的牌」的勝率（翻牌前，發完五張；離線用 rangeVsRange 每格算 6000 次，存成兩位數的百分比） */
const EQ_TOP_V = [0.03, 0.06, 0.1, 0.15, 0.22, 0.32, 0.5, 1.0];
const EQ_TOP_TXT = ["84433329303030302931313130406329272726252525262625252925472830282726262726262625222536282726252324242323272326243428282625242424242622242325332827272624242426212322242433282827252424262122212324253329282625232621221921232425322928262527222320212223242533292826272122202020222324263228262721221920202021232425322627202119202020192122222231", "84524235343231313032323231507035353532303030313130303932603434312928282929282831323053343230292828282827303231314833313029282828282829272830423129292827262627262526282737292928272525272624252626263529282725242627242425252525342928272628272524242424252635302927282725242423232325273429272826242424222122232526342728262423242221202223232333", "85595346423837363536363636577240373635343332333332325137653636353332313131303043333359363534323031313030393333335536353331303030303432313133503633323130303033303031323247343332312929322928283030314433323129283129272627282929403231302933292827272828292940333130332927272727272728293932303328272626262525262828382932282626262625242526262538", "85615651484342403939393838597343403937363535353433335440683939373634343433323249373663393737353333333232463636366039383634333332324134343436563836353432313139323334353553373634333031373231323333345136353331303531303031313232483533323036313030303031313146343331353030292928292930314333303429282828272727282929403034292828282727262628272639", "86646057545047454343424241627346434239383737363635355843694142393836363535343455403865413938363534343333523938376341403836353434334736363538594037373533333345343434363656383736343232423432323434355437363433314033323133333434513635343240333231313232333350363433393231303130303131324734323831302930292829303131443138313029302928272829282842", "86666361595553504849484747647651494844424140404039386149714544414038373737363659464268424039373636353434574541396542403836353534345341383638604038373634333350393636373758393837353333483835343535365638373634324637343233333535533736353346373432323333343452373634453633323231323233345036334435323131302930313232473344353230302929292930302945", "85676563625958565454535352657958565552504847464544446356745050474543424241404061534871474443413939393838605247446845444239383837375750444142644340393836363655474240404061413938373435534540383837385939393735345144393636363636563837363452433936353535353554383735514238353533333434355137355041373434323131323333493449413634343231303032313047", "85676766656363616060605958668364626260585756565554536562806060585654535352515064605878575554525049494847636058557555535148474746456158555352725149474644434361565451514969484645434040595552494846456645444240385854504746444342634241393758535047454342413961424038575249464441403938385739375751484543403736353636543656514744423937343334333250"];
let EQ_TOP = null;
function eqVsTop(g, v) {
  if (!EQ_TOP) EQ_TOP = EQ_TOP_TXT.map((t) => { const a = new Float32Array(169); for (let i = 0; i < 169; i++) a[i] = +t.substr(i * 2, 2) / 100; return a; });
  const V = EQ_TOP_V;
  if (v <= V[0]) return EQ_TOP[0][g];
  for (let i = 1; i < V.length; i++) if (v <= V[i]) { const f = (v - V[i - 1]) / (V[i] - V[i - 1]); return EQ_TOP[i - 1][g] + (EQ_TOP[i][g] - EQ_TOP[i - 1][g]) * f; }
  return EQ_TOP[V.length - 1][g];
}
/* 回傳 null（不是短碼「推或棄」的情況），或
   { kind:'push', pct, eff }：沒人加注，前 pct 的牌全下；
   { kind:'call', eq, need, v, opp, pct, eff }：面對全下（或跟了就差不多全下）：你的牌對對方範圍（前 v）的勝率 eq 跟底池賠率要的 need 比；
   { kind:'reshove', eq, v, vc, c, ev, pct, eff }：短碼面對一般加注，全下的期望值 ev（對方前 vc 的牌會跟，跟的機率 c） */
function shortSpot(H, seat) {
  if (H.street !== 0) return null;
  const p = H.players[seat], bb = H.bb;
  const mine = (p.stack + p.bet) / bb;
  const acts = H.log.filter((e) => e.k === 'act' && e.street === 0);
  const raises = acts.filter((e) => e.t === 'r' || e.t === 'b' || (e.t === 'a' && e.to > e.curBefore));
  const B = seatBehind(H, seat);
  if (!raises.length) {
    let maxO = 0;
    for (const q of H.players) if (q !== p && !q.folded) maxO = Math.max(maxO, (q.stack + q.bet) / bb);
    const eff = Math.min(mine, maxO);
    if (eff > 12 || B === 0) return null;                       // 大盲沒人加注：過牌就好
    return { kind: 'push', pct: pushPct(eff, B), eff };
  }
  const last = raises[raises.length - 1], rp = H.players[last.seat];
  const toCall = Math.min(H.curBet - p.bet, p.stack);
  if (!(toCall > 0)) return null;
  const allinish = rp.allin || toCall >= p.stack * 0.5;
  const gH = classIndex(p.cards[0] >> 2, p.cards[1] >> 2, (p.cards[0] & 3) === (p.cards[1] & 3));
  if (!allinish) {
    const effR = Math.min(mine, (rp.stack + rp.bet) / bb);
    if (effR > 12) return null;                                // 不是短碼：照圖表或一般的勝率規則
    // 短碼面對一般加注：全下（再推）或棄牌。對方範圍照他開牌的位置；他範圍裡對你的全下勝率夠的牌會跟
    const t = chartTable(H.n), pos = chartPosName(t, seatBehind(H, last.seat)), R = raises.length === 1 && pos ? chartRanges(t + '/rfi/' + pos) : null;
    const vo = R ? Math.max(0.05, chartPct(R).raise) : raises.length >= 2 ? 0.05 : 0.15;
    const heroAll = p.stack + p.bet, add = Math.max(0, Math.min(heroAll, rp.stack + rp.bet) - rp.bet);
    const pot0 = potTotal(H), potF = pot0 + p.stack + add, needO = add / potF;
    let rc = 0, rt = 0;
    for (let h = 0; h < 169; h++) if (PRE_PCT[h] < vo) { rt += classSize(h); if (eqVsTop(h, Math.min(1, vo * 1.2)) >= needO) rc += classSize(h); }   // 他開牌的範圍照開牌排名；跟不跟照勝率
    const c = rt ? Math.max(0.2, rc / rt) : 1, vc = Math.max(0.03, vo * c);
    const evOf = (e) => (1 - c) * pot0 + c * (e * potF - p.stack);
    const eq = eqVsTop(gH, vc);
    let pct = 0;
    for (let h = 0; h < 169; h++) if (evOf(eqVsTop(h, vc)) > 0) pct += classSize(h);
    return { kind: 'reshove', eq, v: vo, vc, c, ev: evOf(eq), pct: pct / NCOMBO, eff: effR, pot: pot0 };
  }
  const shoveBB = (rp.stack + rp.bet) / bb, eff = Math.min(mine, shoveBB);
  // 對方的範圍：短碼先推照推牌表；再加注或深籌碼全下都很緊
  const v = raises.length >= 2 ? 0.06 : shoveBB > 25 ? 0.05 : pushPct(Math.min(12, shoveBB), Math.max(1, seatBehind(H, last.seat)));
  const pot = potTotal(H), need = toCall / (pot + toCall);
  const opp = H.players.filter((q) => q !== p && !q.folded && q.total > 0 && (q.allin || q.bet >= H.curBet)).length;   // 已經在這個底池裡、要跟你比牌的人
  let eq = eqVsTop(gH, v);
  if (opp >= 2) eq = Math.pow(eq, 1 + 0.7 * (opp - 1));       // 多人：粗略打折
  let pct = 0;                                                 // 照這個賠率，大約前幾 % 的牌可以跟
  for (let h = 0; h < 169; h++) { let e = eqVsTop(h, v); if (opp >= 2) e = Math.pow(e, 1 + 0.7 * (opp - 1)); if (e >= need) pct += classSize(h); }
  return { kind: 'call', eq, need, v, opp, pct: pct / NCOMBO, eff, toCall, pot };
}
