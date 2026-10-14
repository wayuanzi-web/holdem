/* ===== 71-learn-b：大師之路第二段（第 3–5 階：翻牌前進攻、翻牌前防守、數學課；快答訓練場） ===== */

/* ===== 題目產生器 ===== */
const pctT = (x) => Math.round(x * 100) + '%';
function pctOpts(ans, cands, rng) { return numOpts(ans, cands.map((x) => Math.round(x)).filter((x) => x > 0 && x < 100), rng).map((o) => ({ t: o.t + '%', ok: o.ok })); }
/* 開牌加注到多少 */
QGEN.openSize = (rng) => {
  const bb = pickOne([2, 2, 10, 20], rng), sb = rng() < 0.25, limp = sb ? 0 : pickOne([0, 0, 1, 2], rng);
  const pos = sb ? '小盲' : pickOne(['槍口', '劫位', '關煞位', '按鈕'], rng);
  const xbb = sb ? 3 : 2.5 + limp, ans = xbb * bb;
  return { gen: 'openSize', prompt: '盲注 ' + bb / 2 + '／' + bb + '，你在' + pos + '，前面' + (limp ? '有 ' + limp + ' 個人跛入（只跟大盲）' : '都棄牌') + '。照標準，加注到多少？', vis: null,
    opts: numOpts(ans, [2 * bb, 3 * bb, 2.5 * bb, (xbb + 1) * bb, 4 * bb, 5 * bb].map((x) => Math.round(x)), rng),
    explain: '標準開牌 2.5 個大盲' + (limp ? '；前面每多一個跛入的人多加 1 個大盲（底池已經比較大，也讓他們付更多）：2.5 ＋ ' + limp + ' ＝ ' + xbb + ' 個大盲' : '') + (sb ? '；小盲開牌用 3 個大盲（翻牌後沒位置，加大一點）' : '') + '，就是 ' + ans + '。', key: 'osz|' + bb + '|' + limp + '|' + sb };
};
/* 偷盲：大家棄牌的機率要多少才立刻划算 */
QGEN.stealMath = (rng) => {
  const r = pickOne([2, 2.2, 2.5, 3], rng), need = r / (r + 1.5);
  return { gen: 'stealMath', prompt: '你在按鈕加注到 ' + r + ' 個大盲想偷盲（兩個盲注共 1.5 個大盲）。只看這一次：兩個盲注都棄牌的機率至少要多少，才算馬上划算（就算你的牌很爛）？', vis: null,
    opts: pctOpts(Math.round(need * 100), [r / 1.5 * 100 / 2, 50, need * 100 + 12, need * 100 - 15, 75], rng),
    explain: '你冒 ' + r + ' 去搶 1.5：要成功 ' + r + ' ÷ (' + r + ' ＋ 1.5) ≈ ' + pctT(need) + ' 才打平。實際上被跟了還能打，所以按鈕可以開得很寬。', key: 'steal|' + r };
};
/* 大盲防守的價錢 */
QGEN.bbOdds = (rng) => {
  const x = pickOne([2, 2.2, 2.5, 3, 3.5], rng), call = x - 1, pot = 0.5 + 1 + x, need = call / (pot + call);
  return { gen: 'bbOdds', prompt: '按鈕開牌加注到 ' + x + ' 個大盲，小盲棄牌。你在大盲要跟注，勝率至少要多少？', vis: null,
    opts: pctOpts(Math.round(need * 100), [call / pot * 100, x / (pot + x) * 100, need * 100 + 10, 50], rng),
    explain: '底池 ＝ 小盲 0.5 ＋ 你的 1 ＋ 他的 ' + x + ' ＝ ' + fmt1(pot) + '。你只要再補 ' + fmt1(call) + '，跟完的底池是 ' + fmt1(pot + call) + '：' + fmt1(call) + ' ÷ ' + fmt1(pot + call) + ' ≈ ' + pctT(need) + '。這就是大盲可以防守很寬的原因（但翻牌後沒位置，勝率要打折，所以圖表沒有防到這麼寬）。', key: 'bbo|' + x };
};
/* 3-bet 加到多少 */
QGEN.threeBetSize = (rng) => {
  const bb = pickOne([2, 10, 20], rng), open = bb * pickOne([2, 2.5, 3], rng), ip = rng() < 0.5;
  const ans = Math.round(open * (ip ? 3 : 3.5));
  const who = ip ? '你在他後面的按鈕（有位置）' : '你在大盲（沒位置）';
  return { gen: 'threeBetSize', prompt: '盲注 ' + bb / 2 + '／' + bb + '，關煞位開牌加注到 ' + open + '。' + who + '想用 AA 再加注（3-bet），照標準加到多少？', vis: null,
    opts: numOpts(ans, [open * 2, Math.round(open * 3), Math.round(open * 3.5), open * 4, open * 5].map(Math.round), rng),
    explain: '3-bet 的標準：有位置加到他開牌的 3 倍，沒位置加到 3.5 倍左右（翻牌後要先說話，讓他跟起來貴一點）。' + open + ' × ' + (ip ? 3 : 3.5) + ' ≈ ' + ans + '。用 AA 和用詐唬的牌都加一樣大，對手才猜不到。', key: 'tbs|' + open + '|' + ip };
};
/* 你開牌被 3-bet */
const OG_RFI6 = { EP: 'UTG', MP: 'HJ', CO: 'CO', BTN: 'BTN', SB: 'SB' };
QGEN.vs3bet = (rng) => {
  for (let i = 0; i < 600; i++) {
    const og = pickOne(['EP', 'MP', 'CO', 'BTN'], rng), key = '6/vs3bet/' + og;
    const g = (rng() * 169) | 0;
    if (chartFreq('6/rfi/' + OG_RFI6[og], g) < 0.75) continue;          // 只出你會開的牌
    const r = chartFreq(key, g, 'raise'), c = chartFreq(key, g, 'call'), f = 1 - r - c;
    const best = r >= 0.75 ? '4-bet' : c >= 0.75 ? '跟注' : f >= 0.85 ? '棄牌' : null;
    if (!best || (best === '棄牌' && rng() < 0.5)) continue;
    return { gen: 'vs3bet', prompt: '6 人桌，你在' + openerZh('6', og) + '開牌，後面的人再加注（3-bet），其他人棄牌。你拿 ' + NAMEZH(g) + '：', vis: { k: 'cls', g }, opts: ['4-bet', '跟注', '棄牌'].map((x) => ({ t: x, ok: x === best })),
      explain: '圖表：' + NAMEZH(g) + ' 在' + openerZh('6', og) + '開牌被 3-bet 時，4-bet ' + Math.round(r * 100) + '%、跟注 ' + Math.round(c * 100) + '%、棄牌 ' + Math.round(Math.max(0, f) * 100) + '%。' + (best === '棄牌' ? '開牌的牌大多不夠好打 3-bet 底池，放掉開牌的錢沒關係。' : best === '跟注' ? '夠好、又好打（對子、同花大牌），跟注看翻牌。' : '比他大部分的 3-bet 都好，4-bet 讓底池更大。'), key: 'v3|' + og + '|' + g };
  }
  return QGEN.combos(rng);
};
/* 被 4-bet */
QGEN.vs4bet = (rng) => {
  const key = '6/vs4bet', pool = parseRange('22+,A2s+,KTs+,QTs+,JTs,ATo+,KQo'), list = [];
  for (let g = 0; g < 169; g++) if (pool[CLASS_COMBOS[g][0]] > 0) list.push(g);
  for (let i = 0; i < 300; i++) {
    const g = pickOne(list, rng), r = chartFreq(key, g, 'raise'), c = chartFreq(key, g, 'call'), f = 1 - r - c;
    const best = r >= 0.75 ? '全下' : c >= 0.75 ? '跟注' : f >= 0.85 ? '棄牌' : null;
    if (!best || (best === '棄牌' && rng() < 0.4)) continue;
    return { gen: 'vs4bet', prompt: '你 3-bet 之後，對手再加注（4-bet）。100 個大盲深，你拿 ' + NAMEZH(g) + '：', vis: { k: 'cls', g }, opts: ['全下', '跟注', '棄牌'].map((x) => ({ t: x, ok: x === best })),
      explain: '被 4-bet 時範圍非常窄：KK 以上、AKs 全下；AK 不同花一半全下、一半跟；QQ 跟；JJ、AQs 有時跟；其他（包括拿來詐唬 3-bet 的牌）都棄。圖表：' + NAMEZH(g) + ' 全下 ' + Math.round(r * 100) + '%、跟 ' + Math.round(c * 100) + '%。', key: 'v4|' + g };
  }
  return QGEN.combos(rng);
};
/* 下注是底池的幾分之幾 → 要多少勝率 */
const BET_FR = [[1, 4, '1/4 底池'], [1, 3, '1/3 底池'], [1, 2, '半個底池'], [2, 3, '2/3 底池'], [3, 4, '3/4 底池'], [1, 1, '一個底池'], [3, 2, '1.5 倍底池'], [2, 1, '2 倍底池']];
const fmtF = (x) => (+x.toFixed(2)).toString();
QGEN.betNeed = (rng) => {
  const [a, b, t] = pickOne(BET_FR, rng), f = a / b, need = f / (1 + 2 * f);
  return { gen: 'betNeed', prompt: '對手下注' + (/^\d/.test(t) ? ' ' : '') + t + '。你要跟注，勝率至少要多少？', vis: null,
    opts: pctOpts(Math.round(need * 100), [f / (1 + f) * 100, f * 100 / 2, need * 100 + 8, need * 100 - 7, 50], rng),
    explain: '把底池當 1：他下 ' + fmtF(f) + '，你跟 ' + fmtF(f) + '，跟完底池 ＝ 1 ＋ ' + fmtF(f) + ' ＋ ' + fmtF(f) + ' ＝ ' + fmtF(1 + 2 * f) + '；' + fmtF(f) + ' ÷ ' + fmtF(1 + 2 * f) + ' ≈ ' + pctT(need) + '。背三個：1/3 底池要 20%、半個底池要 25%、一個底池要 33%。', key: 'bn|' + t };
};
/* 給勝率：跟還是棄（期望值） */
QGEN.callOrFold = (rng) => {
  for (let i = 0; i < 50; i++) {
    const pot = 10 * (3 + ((rng() * 15) | 0)), [a, b] = pickOne(BET_FR, rng), bet = Math.round(pot * a / b), need = bet / (pot + 2 * bet);
    const eq = Math.round((need + (rng() < 0.5 ? 1 : -1) * (0.04 + rng() * 0.15)) * 100) / 100;
    if (eq <= 0.03 || eq >= 0.97) continue;
    const ev = eq * (pot + 2 * bet) - bet, ans = ev > 0 ? '跟注' : '棄牌';
    return { gen: 'callOrFold', prompt: '底池 ' + pot + '，對手下注 ' + bet + '。你算過自己的勝率約 ' + Math.round(eq * 100) + '%（之後不會再下注）。', vis: null, opts: [{ t: '跟注', ok: ans === '跟注' }, { t: '棄牌', ok: ans === '棄牌' }],
      explain: '要的勝率 ＝ ' + bet + ' ÷ ' + (pot + 2 * bet) + ' ≈ ' + pctT(need) + '；你有 ' + Math.round(eq * 100) + '%，' + (ev > 0 ? '比較高，跟。' : '不夠，棄。') + '期望值 ＝ 勝率 × 跟完的底池 − 要跟的 ＝ ' + Math.round(eq * 100) + '% × ' + (pot + 2 * bet) + ' − ' + bet + ' ≈ ' + (ev >= 0 ? '+' : '') + fmt1(ev) + '。', key: 'cof|' + pot + '|' + bet + '|' + eq };
  }
  return QGEN.betNeed(rng);
};
/* 隨機的聽牌：數成順子或同花的出牌 */
function drawOuts(hole, board) {
  const dead = new Set(hole.concat(board)), cur = evalCards(hole.concat(board)) >>> 26, st = [], fl = [];
  if (cur >= 4) return null;
  for (let c = 0; c < 52; c++) {
    if (dead.has(c)) continue;
    const cat = evalCards(hole.concat(board, [c])) >>> 26;
    if (cat === 5 || cat === 8) fl.push(c); else if (cat === 4) st.push(c);
  }
  return { st, fl, n: st.length + fl.length };
}
QGEN.outsRand = (rng) => {
  const want = pickOne([4, 8, 8, 9, 9, 12, 15], rng);
  for (let i = 0; i < 4000; i++) {
    const cs = dealN(rng, 5), hole = cs.slice(0, 2), board = cs.slice(2);
    const r = drawOuts(hole, board);
    if (!r || r.n !== want) continue;
    if ((evalCards(hole.concat(board)) >>> 26) >= 2) continue;            // 避開已經兩對以上的局面
    return { gen: 'outsRand', prompt: '翻牌後，下一張有幾張牌會讓你成<b>順子或同花</b>？', vis: { k: 'hand', hole, board },
      opts: numOpts(r.n, [4, 6, 8, 9, 12, 15, 2], rng),
      explain: (r.fl.length ? '成同花：' + cardsTok(r.fl) + '（' + r.fl.length + ' 張）' : '') + (r.fl.length && r.st.length ? '；' : '') + (r.st.length ? '成順子' + (r.fl.length ? '（不重複算同花的）' : '') + '：' + cardsTok(r.st) + '（' + r.st.length + ' 張）' : '') + '。一共 ' + r.n + ' 張，到河牌約 ' + Math.min(100, r.n * 4 - Math.max(0, r.n - 8)) + '%。', key: 'or|' + cs.join(',') };
  }
  return QGEN.outs(rng);
};
/* 2–4 法則 */
function exactHit(n, street) { if (street === 1) { const miss = (47 - n) / 47 * (46 - n) / 46; return 1 - miss; } return n / 46; }
QGEN.rule24 = (rng) => {
  const n = pickOne([4, 6, 8, 9, 12, 15], rng), flop = rng() < 0.6;
  const ans = flop ? n * 4 - Math.max(0, n - 8) : n * 2, ex = exactHit(n, flop ? 1 : 2);
  return { gen: 'rule24', prompt: (flop ? '翻牌' : '轉牌') + '時你有 ' + n + ' 張出牌，' + (flop ? '到河牌' : '河牌') + '中的機率大約多少？（心算）', vis: null,
    opts: pctOpts(ans, [n * 2, n * 4, n * 3, ans + 10, ans - 8, n], rng),
    explain: (flop ? '翻牌時 × 4' + (n > 8 ? '，出牌超過 8 張再減（出牌 − 8）：' + n + ' × 4 − ' + (n - 8) + ' ＝ ' + ans + '%' : '：' + n + ' × 4 ＝ ' + ans + '%') : '轉牌時只剩一張，× 2：' + n + ' × 2 ＝ ' + ans + '%') + '。實際是 ' + (ex * 100).toFixed(1) + '%。', key: 'r24|' + n + '|' + flop };
};
/* 小對子挖三條：籌碼夠不夠深 */
QGEN.setMine = (rng) => {
  for (let i = 0; i < 50; i++) {
    const call = pickOne([2, 2.5, 3, 4, 6, 8], rng), stack = pickOne([20, 30, 40, 60, 80, 100, 150, 200], rng), ratio = stack / call;
    if (ratio > 10 && ratio < 20) continue;
    const ans = ratio >= 20 ? '跟注（挖三條）' : '棄牌';
    const pair = pickOne(['22', '33', '44', '55', '66'], rng);
    return { gen: 'setMine', prompt: '對手加注，你要再跟 ' + call + ' 個大盲。你拿 ' + pair + '，你和對手後面都還有約 ' + stack + ' 個大盲。只靠「中三條」的話，這個跟注划算嗎？', vis: null, opts: [{ t: '跟注（挖三條）', ok: ans !== '棄牌' }, { t: '棄牌', ok: ans === '棄牌' }],
      explain: '中三條約 12%（7.5 次沒中、1 次中）。中了要從對手身上多贏很多才划算；經驗法則：籌碼至少是跟注額的 15–20 倍。這裡是 ' + stack + ' ÷ ' + call + ' ≈ ' + Math.round(ratio) + ' 倍，' + (ratio >= 20 ? '夠深，可以跟。' : '太淺，中了也贏不夠，棄。'), key: 'sm|' + call + '|' + stack };
  }
  return QGEN.betNeed(rng);
};
/* 勝率打折 */
const REAL_FAC = [[0.92, '有位置'], [0.8, '沒位置'], [0.9, '不同花'], [0.78, '不同花又不相連'], [0.95, '多人底池'], [0.95, '後面還有人沒說話']];
QGEN.effEq = (rng) => {
  const est = 0.3 + ((rng() * 30) | 0) / 100, pos = rng() < 0.5 ? REAL_FAC[0] : REAL_FAC[1];
  const fs = [pos].concat(rng() < 0.6 ? [pickOne([REAL_FAC[2], REAL_FAC[3]], rng)] : []).concat(rng() < 0.4 ? [REAL_FAC[5]] : []);
  const eff = fs.reduce((a, f) => a * f[0], est), ans = Math.round(eff * 100);
  return { gen: 'effEq', prompt: '你的牌「一路比到攤牌」的勝率是 ' + Math.round(est * 100) + '%。這手' + fs.map((f) => f[1]).join('、') + '。照教練的折數，打折後大約多少？', vis: null,
    opts: pctOpts(ans, [est * 100, ans + 6, ans - 7, est * 90, est * 70], rng),
    explain: Math.round(est * 100) + '% ' + fs.map((f) => '× ' + f[0].toFixed(2) + '（' + f[1] + '）').join(' ') + ' ≈ ' + ans + '%。記住：有位置 ×0.92、沒位置 ×0.80；不同花 ×0.90、不同花又不相連 ×0.78；多人或後面還有人 ×0.95；全下、河牌不打折。', key: 'eff|' + est + '|' + fs.map((f) => f[1]).join() };
};
/* 短碼推或棄 */
const PUSH_POS = { 5: '槍口', 4: '劫位', 3: '關煞位', 2: '按鈕', 1: '小盲' };
QGEN.pushFold = (rng) => {
  for (let i = 0; i < 400; i++) {
    const B = 1 + ((rng() * 5) | 0), bb = pickOne([3, 4, 5, 6, 7, 8, 9, 10, 11, 12], rng), p = pushPct(bb, B);
    const g = (rng() * 169) | 0, x = PRE_PCT[g];
    if (!(x < p * 0.8 || x > p * 1.25)) continue;
    const ans = x < p ? '全下' : '棄牌';
    if (ans === '棄牌' && x > 0.95) continue;
    return { gen: 'pushFold', prompt: '6 人桌，你只剩 ' + bb + ' 個大盲，在' + PUSH_POS[B] + '，前面都棄牌。拿 ' + NAMEZH(g) + '：', vis: { k: 'cls', g, pos: PUSH_POS[B] }, opts: [{ t: '全下', ok: ans === '全下' }, { t: '棄牌', ok: ans === '棄牌' }],
      explain: '這個籌碼、這個位置大約推前 ' + pctT(p) + ' 的牌；' + NAMEZH(g) + ' 排在前 ' + pctT(x) + '，' + (ans === '全下' ? '在裡面，全下。' : '不在裡面，棄牌。') + '籌碼越短、越後面的位置，推得越寬。', key: 'pf|' + B + '|' + bb + '|' + g };
  }
  return QGEN.betNeed(rng);
};
/* 面對短碼全下：給勝率，算價錢 */
QGEN.callShove = (rng) => {
  for (let i = 0; i < 400; i++) {
    const B = 2 + ((rng() * 4) | 0), s = pickOne([4, 5, 6, 8, 10, 12], rng), v = pushPct(s, B);
    const g = (rng() * 169) | 0, eq = eqVsTop(g, v), need = (s - 1) / (2 * s + 0.5);
    if (Math.abs(eq - need) < 0.04) continue;
    const ans = eq >= need ? '跟注' : '棄牌';
    return { gen: 'callShove', prompt: PUSH_POS[B] + '只剩 ' + s + ' 個大盲，全下（他大約推前 ' + pctT(v) + ' 的牌）。小盲棄牌，你在大盲拿 ' + NAMEZH(g) + '，對他的範圍勝率約 ' + pctT(eq) + '：', vis: { k: 'cls', g }, opts: [{ t: '跟注', ok: ans === '跟注' }, { t: '棄牌', ok: ans === '棄牌' }],
      explain: '你已經放了 1 個大盲，再補 ' + (s - 1) + ' 就能搶 ' + s + ' ＋ 0.5 ＋ 1 ＝ ' + fmt1(s + 1.5) + '：要 ' + (s - 1) + ' ÷ ' + fmt1(2 * s + 0.5) + ' ≈ ' + pctT(need) + '。你的 ' + pctT(eq) + (ans === '跟注' ? ' 夠，跟。' : ' 不夠，棄。') + '短碼全下的範圍很寬，所以很多看起來普通的牌都夠跟。', key: 'cs|' + B + '|' + s + '|' + g };
  }
  return QGEN.betNeed(rng);
};
/* 觀念題 */
function addStatic(k, list) {
  STATIC_Q[k] = list;
  QGEN[k] = (rng) => { const q = pickOne(STATIC_Q[k], rng); return { gen: k, prompt: LTXT(q.prompt), vis: null, opts: shuffleArr(q.opts.map((t, i) => ({ t, ok: i === q.ans })), rng), explain: LTXT(q.explain), key: k + '|' + q.prompt.slice(0, 14) }; };
}
addStatic('s3a', [
  { prompt: '前面都棄牌，你想玩這手牌。為什麼建議加注開局、不要只跟大盲（跛入）？', opts: ['可能直接贏下盲注，翻牌後也有主動權', '跛入比較省錢，所以比較好', '加注是為了讓更多人跟進來', '規則規定第一個人要加注'], ans: 0,
    explain: '加注有三個好處：別人都棄牌就直接贏；翻牌後你可以繼續下注；好牌讓底池變大、人變少。跛入讓大盲免費看翻牌，常常變成多人底池。' },
  { prompt: '同一個位置，好牌加大一點、普通的牌加小一點，好不好？', opts: ['不好，對手會從大小看出你的牌', '好，好牌就該多收錢', '好，普通的牌加小可以省錢', '看心情'], ans: 0,
    explain: '加注大小固定（例如都是 2.5 個大盲），對手就沒辦法從大小猜你的牌。' },
  { prompt: '你拿 [Ah7d]（A7 不同花）在槍口，前面沒人。6 人桌圖表的打法是？', opts: ['棄牌', '加注', '跛入', '全下'], ans: 0,
    explain: '6 人桌槍口只開不同花的 ATo 以上；A7o 從關煞位才開。前位開了常常被更大的 A 壓制。' },
]);
addStatic('s3c', [
  { prompt: '為什麼按鈕可以開得最寬？', opts: ['翻牌後永遠最後說話，後面只剩兩個盲注', '按鈕的牌比較好', '按鈕不用放盲注所以比較便宜', '規則規定'], ans: 0,
    explain: '只剩兩個盲注沒說話，他們翻牌後又都要先說話；你有最好的位置，所以很多普通的牌在按鈕都能賺錢。' },
  { prompt: '你在按鈕偷盲，被大盲 3-bet。你拿 [Kh5h]（K5 同花），通常？', opts: ['棄牌', '跟注', '4-bet', '全下'], ans: 0,
    explain: '偷盲的牌大多不夠好打 3-bet 底池，被 3-bet 就棄；只有比較好的牌（對子、同花大牌、AK、AQ）才繼續。' },
]);
addStatic('s3d', [
  { prompt: '大家都棄牌到小盲，只剩大盲沒說話。6 人桌圖表裡小盲的打法是？', opts: ['加注或棄牌，幾乎不跛入', '一定跛入', '只用 AA、KK 加注', '一定棄牌'], ans: 0,
    explain: '小盲開得很寬（約 48%），但一律加注（3 個大盲）或棄牌：加注有機會直接贏，跛入讓大盲便宜地看牌，翻牌後你又沒位置。' },
  { prompt: '按鈕開牌，你在小盲（大盲還沒說話）。跟大盲比，小盲應該？', opts: ['防守得更緊，多半 3-bet 或棄牌', '防守得更寬，因為已經放了錢', '一定跟注', '一定全下'], ans: 0,
    explain: '小盲翻牌後沒位置，後面大盲還可能再加注，跟注很難打；圖表裡小盲面對按鈕大部分是 3-bet 或棄牌。' },
]);
addStatic('s4a', [
  { prompt: '同樣是大盲，面對「槍口開牌」和「按鈕開牌」，防守範圍應該？', opts: ['面對槍口要緊很多', '一樣寬', '面對槍口要更寬', '都只用 AA'], ans: 0,
    explain: '槍口只開約 19% 的好牌，按鈕開約 42%。對手越緊，你要越好的牌才繼續：6 人桌圖表大盲面對槍口防約 19%，面對按鈕防約一半。' },
  { prompt: '面對加注，「跟注」最適合哪一種牌？', opts: ['有位置、翻牌後能中大牌的（對子、同花連張、同花大牌）', '不同花的弱 A', '任何牌，因為只是跟注', '只有 AA'], ans: 0,
    explain: '跟注之後要打翻牌：有位置、能中大牌、不怕被壓制的牌最適合。不同花的弱牌被壓制、又難中大牌，棄。' },
]);
addStatic('s4c', [
  { prompt: '對槍口（很緊）的開牌，哪一組是標準的「價值 3-bet」？', opts: ['QQ 以上、AK', 'JJ、TT、AQ', '小對子', '同花連張'], ans: 0,
    explain: '價值 3-bet 要比他會跟的牌好。槍口範圍很緊，所以只剩 QQ 以上、AK；對按鈕這種寬的開牌，TT、AJs、AQ 也可以。' },
]);
addStatic('s4d', [
  { prompt: '為什麼 A5s 常被拿來當 3-bet 的詐唬牌？', opts: ['擋住對手的 A，被跟了還有同花和小順子', '因為 A5s 是頂級牌', '因為它最常中三條', '因為對手一定會棄牌'], ans: 0,
    explain: '你拿一張 A，對手拿 AA、AK 的機會變小（阻擋）；被跟了還有堅果同花、A-2-3-4-5 順子。不同花的弱牌被跟就沒戲，不適合詐唬。' },
  { prompt: '你用 A4s 詐唬 3-bet，對手 4-bet。通常？', opts: ['棄牌', '跟注', '全下', '再加注'], ans: 0,
    explain: '詐唬的 3-bet 被 4-bet 就放手：對手 4-bet 的範圍很強，你的 A4s 打不過。' },
]);
addStatic('s5c', [
  { prompt: '哪一種情況「隱含賠率」最好？', opts: ['小對子或同花連張，你和對手籌碼都很深', '不同花的弱 A，籌碼很淺', '已經全下了', '對手是很緊、中了也不付錢的人'], ans: 0,
    explain: '隱含賠率來自「中了之後還能從對手身上多贏」：要有能中大牌的牌、深的籌碼、還有會付錢的對手。' },
  { prompt: '你聽同花，河牌真的來了第三張同花色（公牌三張同花）。對手看到後通常會？', opts: ['比較不會付錢', '更愛付錢', '一定全下', '跟這張牌無關'], ans: 0,
    explain: '公牌很明顯能成同花時，對手會小心，你中了也贏得少——隱含賠率比你想的小。' },
]);
addStatic('s5d', [
  { prompt: '哪一種情況勝率打折最多？', opts: ['沒位置、不同花又不相連', '有位置、口袋對子', '全下', '河牌'], ans: 0,
    explain: '沒位置 ×0.80、不同花不相連 ×0.78，加起來只剩六成多；全下和河牌之後沒有下注，不用打折。' },
]);

/* ===== 第 3–5 階的課 ===== */
function lessonFinish(l, stage) { l.stage = stage; l.ready = !!l.quiz; if (l.read) l.read = l.read.map((b) => (typeof b === 'string' ? LTXT(b) : b.html ? Object.assign({}, b, { html: LTXT(b.html) }) : b)); return l; }
const OPEN_EARLY = [['openOrFold', { t: '6', pos: ['UTG', 'HJ'] }], ['openOrFold', { t: '9', pos: ['UTG', 'UTG1', 'MP', 'LJ'] }]];
const OPEN_LATE = [['openOrFold', { t: '6', pos: ['CO', 'BTN'] }], ['openOrFold', { t: '9', pos: ['HJ', 'CO', 'BTN'] }]];
COURSE[2].lessons = [
  { id: '3-1', title: '為什麼加注、不跛入', sum: '加注的三個好處、標準的加注大小。', read: [
    '沒人加注時你有三個選擇：棄牌、<b>跛入</b>（只跟一個大盲）、<b>加注開局</b>。好的玩家幾乎不跛入：<b>要玩就加注，不玩就棄</b>。',
    '加注的三個好處：① <b>可能直接贏</b>——後面都棄牌，盲注就是你的；② <b>拿到主動權</b>——翻牌後你可以繼續下注，對手沒中就得放棄；③ <b>好牌讓底池變大</b>，而且後面的人要付更多才能看翻牌，人比較少、比較好打。',
    '跛入的壞處：沒機會直接贏；大盲可以免費看翻牌；常常變成很多人的底池，你的牌很難贏。',
    { k: 'tip', html: '<b>標準加注大小</b>：開牌加到 <b>2.5 個大盲</b>；前面每有一個人跛入，<b>多加 1 個大盲</b>；在<b>小盲</b>開牌加到 <b>3 個大盲</b>。牌局裡的教練也是這樣建議。' },
    '加注大小<b>不要</b>跟著牌的好壞變：好牌加大、普通的加小，對手很快就看得出來。',
  ], practice: { gens: ['openSize', 's3a'], n: 6 }, quiz: { gens: ['openSize', 's3a', 'openSize'], n: 8, pass: 7 } },
  { id: '3-2', title: '前位開牌', sum: '後面越多人，越要緊：前位的範圍和常見錯誤。', read: [
    '前位（6 人桌的槍口、劫位；9 人桌的槍口到低劫位）開牌最緊：<b>後面越多人沒說話，越可能有人拿到比你好的牌</b>，而且翻牌後你常常要先說話。',
    { k: 'chart', key: '6/rfi/UTG', title: '6 人桌・槍口開牌' },
    { k: 'chart', key: '9/rfi/UTG', title: '9 人桌・槍口開牌' },
    '範圍的寫法：<b>＋ 代表「以上」</b>，44+ 是 44 到 AA；A2s+ 是 A2s 到 AKs；K9s+ 是 K9s 到 KQs。',
    '前位最常見的錯：開了不同花的弱牌（A9o、KTo）、小對子以為能中三條。被後面的人 3-bet 時這些牌只能棄，白白丟掉開牌的錢。',
  ], practice: { gens: OPEN_EARLY, n: 8 }, quiz: { gens: OPEN_EARLY, n: 8, pass: 7 } },
  { id: '3-3', title: '後位開牌與偷盲', sum: '關煞位、按鈕開得寬；偷盲的數學。', read: [
    '關煞位和按鈕是賺最多錢的位置：後面只剩一兩個人（加上盲注），翻牌後常常最後說話。',
    { k: 'chart', key: '6/rfi/CO', title: '6 人桌・關煞位開牌' },
    { k: 'chart', key: '6/rfi/BTN', title: '6 人桌・按鈕開牌' },
    '<b>偷盲</b>：在後位用普通的牌加注，目標是讓盲注棄牌。',
    { k: 'tip', html: '算一下：在按鈕加到 2.5 個大盲，想搶的是盲注 1.5 個大盲。只要兩個盲注都棄牌的機率超過 2.5 ÷ (2.5 ＋ 1.5) ≈ <b>63%</b>，就算爛牌也馬上划算——而且被跟了還能打。' },
    '但後位不是什麼都開：被 3-bet 時大部分偷盲的牌要棄；遇到很愛防守的盲注（常跟、常 3-bet），要開得緊一點。',
  ], practice: { gens: OPEN_LATE.concat(['stealMath', 's3c']), n: 8 }, quiz: { gens: OPEN_LATE.concat(['stealMath', 's3c']), n: 8, pass: 7 } },
  { id: '3-4', title: '小盲怎麼打', sum: '加注或棄牌，開 3 個大盲；被加注時要緊。', read: [
    '小盲最難打：已經放了半個大盲，但翻牌後<b>永遠第一個說話</b>，後面還有大盲。',
    { k: 'chart', key: '6/rfi/SB', title: '6 人桌・小盲開牌（前面都棄牌）' },
    '圖表的打法：<b>加注或棄牌</b>，幾乎不跛入，開牌加到 <b>3 個大盲</b>。開得比按鈕還寬，因為只要過大盲一關；但翻牌後沒位置，所以要挑能打的牌（同花、連張、帶 A 的比較好）。',
    '前面有人加注時，小盲要比大盲<b>緊很多</b>：大盲還在後面可能再加注，你翻牌後又沒位置。圖表裡小盲面對按鈕開牌，大部分是 3-bet 或棄牌，很少跟注。',
  ], practice: { gens: [['openOrFold', { t: '6', pos: ['SB'] }], 'openSize', 's3d'], n: 6 }, quiz: { gens: [['openOrFold', { t: '6', pos: ['SB'] }], 's3d', ['openOrFold', { t: '9', pos: ['SB'] }]], n: 8, pass: 7 } },
  { id: '3-5', title: '開牌口訣與快答', sum: '6 人桌、9 人桌每個位置多開哪些牌；3 秒快答。', read: [
    '<b>記法</b>：先記槍口的範圍，之後每往後一個位置，只記「多開的那幾手」。點任何一手牌都能看說明。',
    '<b>6 人桌</b>：',
    { k: 'openDiff', t: '6' },
    '<b>9 人桌</b>：',
    { k: 'openDiff', t: '9' },
    '結業測驗：6 人桌和 9 人桌混著出，20 題答對 16 題，每題 3 秒。',
  ], practice: { gens: [['openOrFold', { t: '6' }], ['openOrFold', { t: '9' }]], n: 8 }, quiz: { gens: [['openOrFold', { t: '6' }], ['openOrFold', { t: '9' }]], n: 20, pass: 16, sec: 3 } },
].map((l) => lessonFinish(l, 3));
const DEF_ALL = [['BB', 'EP'], ['BB', 'CO'], ['BB', 'BTN'], ['BB', 'SB'], ['SB', 'BTN'], ['IP', 'EP'], ['IP', 'CO']];
COURSE[3].lessons = [
  { id: '4-1', title: '面對加注三選一', sum: '先看他從哪裡開、再看你的位置。', read: [
    '有人加注開局時，你有三個選擇：<b>再加注（3-bet）</b>、<b>跟注</b>、<b>棄牌</b>。',
    '<b>先看他從哪裡開</b>：槍口開的牌最緊（6 人桌約 19%），按鈕、小盲開得很寬（42–48%）。他越緊，你要越好的牌才繼續。',
    '<b>再看你的位置</b>：在他後面（有位置）可以多跟一些；在盲注（沒位置）跟注很難打，所以除了大盲，常常是「3-bet 或棄牌」。',
    '<b>3-bet</b> 的牌分兩種：價值（比他大部分的牌都好，例如 QQ 以上、AK）和詐唬（擋牌又好打，例如 A5s）。<b>跟注</b>的牌：有位置或價錢便宜、翻牌後能中大牌的（對子、同花連張、同花大牌）。不同花的弱牌——棄。',
    { k: 'defStats' },
  ], practice: { gens: [['defend', { spots: DEF_ALL }], 's4a'], n: 8 }, quiz: { gens: [['defend', { spots: DEF_ALL }], 's4a', ['defend', { spots: DEF_ALL }]], n: 8, pass: 7 } },
  { id: '4-2', title: '大盲防守', sum: '價錢最便宜，所以防最寬；但沒位置要打折。', read: [
    '大盲已經放了 1 個大盲，面對加注只要補差額，<b>價錢最便宜</b>，所以防守最寬。',
    { k: 'tip', html: '算一下：按鈕開到 2.5，小盲棄牌，底池 ＝ 0.5 ＋ 1 ＋ 2.5 ＝ 4。你補 1.5 就能搶 5.5：勝率只要 1.5 ÷ 5.5 ≈ <b>27%</b>。他開 2 個大盲只要 22%，開 3 個大盲要 31%。' },
    { k: 'chart', key: '6/vsOpen/BB/BTN', title: '大盲面對按鈕開牌（紅＝3-bet、綠＝跟注）' },
    { k: 'chart', key: '6/vsOpen/BB/EP', title: '大盲面對槍口開牌' },
    '但大盲翻牌後沒位置，勝率打得出來的比較少，所以不是「27% 就跟」：圖表把這些都算進去了——面對按鈕防大約一半的牌，面對槍口只防兩成。',
  ], practice: { gens: ['bbOdds', ['defend', { spots: [['BB', 'BTN'], ['BB', 'CO'], ['BB', 'EP'], ['BB', 'SB']] }]], n: 8 }, quiz: { gens: ['bbOdds', ['defend', { spots: [['BB', 'BTN'], ['BB', 'CO'], ['BB', 'EP'], ['BB', 'SB']] }], ['defend', { spots: [['BB', 'BTN'], ['BB', 'SB']] }]], n: 8, pass: 7 } },
  { id: '4-3', title: '3-bet 的價值牌', sum: '哪些牌 3-bet 收錢、加到多少。', read: [
    '<b>價值 3-bet</b>：你的牌比他「會跟你的牌」還好，讓底池變大。',
    '對前位（緊）的開牌，價值牌很窄：<b>QQ 以上、AK</b>；對後位（寬）的開牌，<b>TT 以上、AJs 以上、AQ</b> 也可以。',
    { k: 'tip', html: '<b>3-bet 大小</b>：有位置（在他後面）加到他開牌的 <b>3 倍</b>；沒位置（盲注）加到 <b>3.5 倍</b>左右——翻牌後要先說話，讓他跟起來貴一點。拿 AA 和拿詐唬的牌都加一樣大。' },
  ], practice: { gens: ['threeBetSize', ['defend', { spots: DEF_ALL, want: 'raise' }], 's4c'], n: 6 }, quiz: { gens: ['threeBetSize', ['defend', { spots: DEF_ALL }], 's4c', ['defend', { spots: DEF_ALL, want: 'raise' }]], n: 8, pass: 7 } },
  { id: '4-4', title: '3-bet 的詐唬牌', sum: '為什麼要混詐唬、該用哪些牌。', read: [
    '只用價值牌 3-bet，對手很快就讀得出來：你一 3-bet 他就棄。所以要混一些<b>詐唬 3-bet</b>。',
    '好的詐唬牌：<b>A5s–A2s</b>（擋住他的 A，他拿 AA、AK 的機會變小；被跟還有同花、小順子）、<b>同花連張、同花隔張</b>（被跟了翻牌也能中東西）。不好的詐唬牌：不同花的弱牌（被跟就沒戲）。',
    '比例大約：<b>價值 2 份、詐唬 1 份</b>。對手很少 4-bet、常常棄牌時可以多詐唬；對手很愛 4-bet 時少詐唬。',
    '詐唬的 3-bet 被 4-bet：<b>直接棄</b>，不要跟。',
  ], practice: { gens: [['defend', { spots: [['BB', 'BTN'], ['BB', 'SB']], hands: 'A5s,A4s,A3s,A2s,K9s,Q9s,J9s,T8s,76s,65s,54s' }], 's4d'], n: 6 }, quiz: { gens: [['defend', { spots: [['BB', 'BTN'], ['BB', 'SB'], ['IP', 'CO']] }], 's4d', ['defend', { spots: [['BB', 'BTN']], hands: 'A5s,A4s,A3s,A2s,K9s,Q9s,J9s,T8s,76s,65s,54s,K7o,Q8o,J8o,T8o,A8o,A7o' }]], n: 8, pass: 7 } },
  { id: '4-5', title: '面對 3-bet 與 4-bet', sum: '開牌被 3-bet、3-bet 被 4-bet 怎麼辦。', read: [
    '你開牌被 3-bet：<b>大部分開牌的牌都要棄</b>。被 3-bet 時，對手的範圍比你開牌的範圍強很多。',
    { k: 'chart', key: '6/vs3bet/BTN', title: '從按鈕開牌被 3-bet（紅＝4-bet、綠＝跟注）' },
    '<b>4-bet</b>：KK 以上、AKs（從後位開牌時 QQ 也 4-bet；AK 不同花有時 4-bet、有時跟），加一些 A5s、A4s 當詐唬；大小約 3-bet 的 2.3 倍。<b>跟注</b>：中等對子、同花大牌、AQ——位置越後，跟得越多。',
    '被 4-bet：<b>KK 以上、AKs</b> 全下；AK 不同花一半全下、一半跟；QQ 跟；JJ、AQs 有時跟；其他（包括詐唬的牌）都棄。',
  ], practice: { gens: ['vs3bet', 'vs4bet'], n: 8 }, quiz: { gens: ['vs3bet', 'vs3bet', 'vs4bet'], n: 8, pass: 7 } },
  { id: '4-6', title: '防守快答', sum: '面對開牌、被 3-bet：4 秒內決定。', read: [
    '最後練速度：面對開牌（3-bet／跟／棄）和開牌被 3-bet（4-bet／跟／棄）混著出，<b>每題 4 秒</b>，20 題答對 16 題過關。',
    { k: 'tip', html: '快速判斷：① 他從哪裡開（緊或寬）？② 我有沒有位置（盲注常常 3-bet 或棄）？③ 我的牌是價值、詐唬（A5s 這類）、能跟的（對子、同花大牌），還是棄？' },
  ], practice: { gens: [['defend', { spots: DEF_ALL }], 'vs3bet'], n: 8 }, quiz: { gens: [['defend', { spots: DEF_ALL }], 'vs3bet'], n: 20, pass: 16, sec: 4 } },
].map((l) => lessonFinish(l, 4));
COURSE[4].lessons = [
  { id: '5-1', title: '底池賠率', sum: '要多少勝率才跟：公式、常用數字、期望值。', read: [
    '<b>底池賠率</b>：要跟的錢 ÷ 跟完之後的底池 ＝ 打平要的勝率。勝率比它高就跟，比較低就棄。',
    { k: 'betTable' },
    { k: 'tip', html: '背三個就好：<b>1/3 底池要 20%、半個底池要 25%、一個底池要 33%</b>。' },
    '<b>期望值</b>（平均每次賺多少）：勝率 × 跟完的底池 − 要跟的錢。大於 0 就是賺。',
    '牌局裡輪到你時，按教練框的「📖 詳細解說」，就會用那一手的實際數字算給你看。',
  ], practice: { gens: ['betNeed', 'potOdds', 'callOrFold'], n: 8 }, quiz: { gens: ['betNeed', 'potOdds', 'callOrFold'], n: 8, pass: 7 } },
  { id: '5-2', title: '出牌數與 2–4 法則', sum: '數出牌、心算中牌機率。', read: [
    '<b>出牌</b>：下一張出來會讓你成牌（或明顯變強）的牌。常見的：同花聽牌 <b>9</b>、兩頭順 <b>8</b>、卡順 <b>4</b>、兩張高牌 <b>6</b>、同花＋兩頭順 <b>15</b>、口袋對子等三條 <b>2</b>。',
    { k: 'tip', html: '<b>2–4 法則</b>：翻牌時出牌 × 4 ≈ 到河牌中的機率；轉牌時 × 2 ≈ 河牌中的機率。出牌超過 8 張，翻牌時 × 4 再減 (出牌 − 8)：15 張 → 60 − 7 ＝ 53%（實際 54%）。' },
    { k: 'outsTable' },
    '小心「髒出牌」：有些出牌雖然讓你成牌，對手卻更大（例如你聽順子，那張牌同時讓公牌出現三張同花）。保守時少算幾張。',
  ], practice: { gens: ['outs', 'outsRand', 'rule24'], n: 8 }, quiz: { gens: ['outsRand', 'rule24', 'outs'], n: 8, pass: 7 } },
  { id: '5-3', title: '隱含賠率', sum: '中了之後還能贏多少；挖三條的 15–20 倍法則。', read: [
    '底池賠率只算「現在」的錢。<b>隱含賠率</b>算的是：中了大牌之後，對手還會再付多少。',
    '小對子挖三條：翻牌中三條約 12%（7.5 次沒中、1 次中）。只靠現在的底池幾乎永遠不夠，要靠中了之後多贏。經驗法則：<b>你和對手剩下的籌碼都至少是跟注額的 15–20 倍</b>，才值得跟。',
    '聽牌也一樣：同花、順子成牌時對手常常還會付錢。但牌面很明顯（例如公牌出現第三張同花），對手就付得少。',
    '反過來還有<b>反向隱含賠率</b>：你中了但不是最大（例如中了小同花、頂對踢腳很差），反而輸更多。',
  ], practice: { gens: ['setMine', 's5c'], n: 6 }, quiz: { gens: ['setMine', 's5c', 'setMine'], n: 8, pass: 7 } },
  { id: '5-4', title: '勝率實現與打折', sum: '「一路比到攤牌」的勝率要打折才是實際拿得到的。', read: [
    '算出來的勝率是「<b>一定看到最後、攤牌比大小</b>」的勝率。但之後大家還會下注，你沒中牌時常常只能棄——那部分勝率拿不到。實際拿得到的比例叫<b>勝率實現</b>。',
    { k: 'tip', html: '教練用的折數：<b>有位置 ×0.92、沒位置 ×0.80</b>；不同花 ×0.90、不同花又不相連 ×0.78；多人底池、後面還有人沒說話各 ×0.95；<b>全下、河牌不打折</b>。' },
    '例：勝率 40%，有位置、不同花、後面還有人沒說話：40% × 0.92 × 0.90 × 0.95 ≈ <b>31%</b>。要跟的價錢要 38% 的話——棄。',
    '這些折數是經驗值（參考 GTO 解的平均）。要把之後每一條街都真的算進去，要用 GTO 工作室求解（第 8 階）。',
  ], practice: { gens: ['effEq', 's5d'], n: 6 }, quiz: { gens: ['effEq', 's5d', 'effEq'], n: 8, pass: 7 } },
  { id: '5-5', title: '短碼推或棄', sum: '12 個大盲以下：全下或棄；面對全下怎麼算。', read: [
    '籌碼剩 <b>12 個大盲以下</b>：加注之後就沒什麼空間打翻牌了，打法簡化成<b>全下或棄牌</b>。',
    { k: 'pushTable' },
    '看表：<b>籌碼越短、位置越後，推得越寬</b>（小盲 4 個大盲時推九成的牌）。表裡是「前百分之幾的牌」，排名就是第 2 階教的強度排名。',
    '面對別人全下：先算你要的勝率（大盲跟短碼全下，價錢通常很好），再估你的牌對他範圍的勝率。短碼全下的範圍很寬，所以 A 高、K 高常常就夠跟。',
  ], practice: { gens: ['pushFold', 'callShove'], n: 8 }, quiz: { gens: ['pushFold', 'callShove'], n: 8, pass: 7 } },
  { id: '5-6', title: '心算快答', sum: '賠率、出牌、推或棄：5 秒內答。', read: [
    '最後練速度：底池賠率、出牌數、2–4 法則、推或棄混著出，<b>每題 5 秒</b>，20 題答對 16 題過關。',
    { k: 'tip', html: '三個一定要秒答的：① 1/3 底池 20%、半個 25%、一個 33%；② 同花聽牌 9 張、兩頭順 8 張；③ 翻牌 × 4、轉牌 × 2。' },
  ], practice: { gens: ['betNeed', 'rule24', 'outsRand', 'pushFold'], n: 8 }, quiz: { gens: ['betNeed', 'rule24', 'outsRand', 'pushFold', 'potOdds'], n: 20, pass: 16, sec: 5 } },
].map((l) => lessonFinish(l, 5));

/* 跳級、分級測驗的題庫（第 3–5 階補齊） */
STAGE_GENS[3] = OPEN_EARLY.concat(OPEN_LATE, ['openSize', 'stealMath', 's3a', 's3c']);
STAGE_GENS[4] = [['defend', { spots: DEF_ALL }], 'vs3bet', 'bbOdds', 'threeBetSize', 's4a', 's4d'];
STAGE_GENS[5] = ['potOdds', 'betNeed', 'outsRand', 'rule24', 'pushFold', 'setMine', 'effEq'];
PLACEMENT[3] = [3, 'openSize']; PLACEMENT[4] = [3, ['openOrFold', { t: '9', pos: ['UTG', 'UTG1', 'MP'] }]];
PLACEMENT[5] = [4, ['defend', { spots: DEF_ALL }]]; PLACEMENT[6] = [4, 'vs3bet'];
PLACEMENT[7] = [5, 'betNeed']; PLACEMENT[8] = [5, 'outsRand'];

/* ===== 快答訓練場：隨時練、記最好成績 ===== */
const DRILLS = [
  { id: 'open6', name: '開牌（6 人桌）', gens: [['openOrFold', { t: '6' }]], sec: 3 },
  { id: 'open9', name: '開牌（9 人桌）', gens: [['openOrFold', { t: '9' }]], sec: 3 },
  { id: 'def', name: '防守與被 3-bet', gens: [['defend', { spots: DEF_ALL }], 'vs3bet'], sec: 4 },
  { id: 'math', name: '賠率與出牌', gens: ['betNeed', 'potOdds', 'rule24', 'outsRand'], sec: 6 },
  { id: 'push', name: '推或棄', gens: ['pushFold', 'callShove'], sec: 5 },
  { id: 'hands', name: '起手牌強弱', gens: [['stronger'], ['tierOf']], sec: 4 },
];
/* 錯題本：答錯的題目存下來，複習答對兩次才拿掉（最多 80 題） */
function wrongAdd(LP, q) {
  LP.wrong = LP.wrong || [];
  const i = LP.wrong.findIndex((w) => w.q.key === q.key);
  const item = { q: { gen: q.gen, prompt: q.prompt, vis: q.vis, opts: q.opts, explain: q.explain, key: q.key }, ok: 0, at: Date.now() };
  if (i >= 0) LP.wrong[i] = item; else LP.wrong.push(item);
  if (LP.wrong.length > 80) LP.wrong.splice(0, LP.wrong.length - 80);
}
function wrongResult(LP, key, ok) {
  const i = (LP.wrong || []).findIndex((w) => w.q.key === key);
  if (i < 0) return;
  if (!ok) { LP.wrong[i].ok = 0; return; }
  LP.wrong[i].ok++;
  if (LP.wrong[i].ok >= 2) LP.wrong.splice(i, 1);
}
/* 這一次複習要出哪些（最舊的先，最多 15 題；選項重新打亂） */
function wrongSession(LP, rng) {
  return (LP.wrong || []).slice(0, 15).map((w) => Object.assign({}, w.q, { opts: shuffleArr(w.q.opts.slice(), rng), review: true }));
}
