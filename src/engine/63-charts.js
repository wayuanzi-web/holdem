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
/* 每一格起手牌對「前 v% 的牌」的勝率（翻牌前，發完五張；離線用 rangeVsRange 算 4 萬次，存成兩位數的百分比） */
const EQ_TOP_V = [0.03, 0.06, 0.1, 0.15, 0.22, 0.32, 0.5, 1.0];
const EQ_TOP_TXT = ["80434038363231313032323131397038363431272828282828273735603532292625262625252535333150312825242324232323333129284026232322222121212927252423302222212019191827232220191820212019181616272421201918171921211918162724221918171617192221191728252220171615171819222119282422191714131517181920192824211917141214151716191827232118161412121315141418", "81494644424039383637363635467444413937343433323131314340663937353331302929282841383559383533312928282827393634345435333129272827273733313232483331292726262535312929303043312927262424343027272827273829272624233329262526252525332726242333282524242323232328262523332825242422222222222724233227252423222021202120262232272423232220191919191826", "83565044413838373637363635547443404038363635353534344739673939363533333232313141373660383534323130303029373735345537353432303030303534333233513634333130302934333130323248353332302929333329293031314433323029283232292728293030413231302833312827262728282938323129333128262726262728283730283230282626262526262726362832302725262625242525252436", "84615652484443424142414040597546424038373736363535345344694039373635353434333349393763393736353333333232453736365838363534323231314135343434543736353331313139333332333351363534323131383331313132334936343332303832313030313232463534323138323129282930313244353332383130292828282930314232313731302828282728283028403037302928272727262728272740", "85646057545047464545444443627650474541394039393838385847704341383736363535343455444065403836363534343333524237376138373635333333324738353534563737363433323244363333333453373635333232423632323233345137363433324136323131323334493735343242353231293031323347363533413531302929303132334534334134313029292829303130443240343029292828282930292943", "85666360595553504949484747647753514946434241414040406151724645413938383837373658484468434039383636363535564742406540393837353535345243383737603938373534343350403635353557393736343333473935343434355538373534334638343333333435533836353446383433313232343450373635453733323130313233344835344437333231302931313231463344363331313029293031303045", "85676463615957555453525251657958565552504947464645446256755150484543424241414061544971484543414039393838595347456844424039383737365650454241644140393736363555474240393861403937363434534640383736375839383735345144393636353536553938363451433836343334353653393735504238353432323334355136354942373533323132323433493448413734333130303132313147", "85676665656362616060595857658263626260585857565554536461806059585654535352515063605877585654525150494847636057567554525149474746456158555351725149474644434260565451504869484645434140595552504846456645444240385854514846454342634341393858535047444341414060424038575249464441393938385739375651484543403737363635543655504744423937353434333250"];
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
    for (let h = 0; h < 169; h++) if (PRE_PCT[h] < vo) { rt += classSize(h); if (eqVsTop(h, Math.min(1, vo * 1.2)) >= needO) rc += classSize(h); }
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
