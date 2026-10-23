/* 牌局規則的幾個指定情境 */
const E = require('./engine');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('錯：', m); } else console.log('對：', m); };
function table(n, stacks, button) {
  const T = E.newTable({ n, names: [...Array(n).keys()].map((i) => 'P' + i), styles: new Array(n).fill('tag'), button: button - 1 });
  stacks.forEach((s, i) => { T.seats[i].stack = s; });
  return T;
}
function start(T) { const H = E.newHand(T, E.makeRng(5)); E.gameStep(H); E.gameStep(H); return H; }
{ // 6 人：按鈕在 0，小盲 1、大盲 2，槍口 3 先說話；大家跟注時大盲可以再說話
  const H = start(table(6, [200, 200, 200, 200, 200, 200], 0));
  ok(H.sbSeat === 1 && H.bbSeat === 2 && H.toAct === 3, '6 人：槍口（3 號）先說話');
  ok(H.players[3].pos === 'UTG' && H.players[4].pos === 'HJ' && H.players[5].pos === 'CO' && H.players[0].pos === 'BTN', '6 人的位置：槍口、劫位、關煞位、按鈕');
  for (let i = 0; i < 5; i++) E.applyAction(H, { t: 'c' });
  ok(H.toAct === 2 && E.legalActions(H).canCheck && E.legalActions(H).canRaise, '大家跟注以後，大盲還可以過牌或加注');
  E.applyAction(H, { t: 'x' });
  ok(H.phase === 'street', '大盲過牌，翻牌前結束');
  E.gameStep(H);
  ok(H.board.length === 3 && H.toAct === 1, '翻牌：小盲（按鈕左邊）先說話');
}
{ // 兩人：按鈕下小盲、翻牌前先說話；翻牌後大盲先說話
  const H = start(table(2, [200, 200], 0));
  ok(H.sbSeat === 0 && H.bbSeat === 1 && H.toAct === 0, '兩人：按鈕兼小盲，翻牌前先說話');
  E.applyAction(H, { t: 'c' }); E.applyAction(H, { t: 'x' }); E.gameStep(H);
  ok(H.toAct === 1, '兩人：翻牌後大盲先說話');
}
{ // 不完整的加注：A 加注到 6（加了 4），B 全下到 9（只多 3，不算完整加注）；A 已經說過話，只能跟或棄
  const T = table(3, [200, 200, 9], 0);   // 按鈕 0、小盲 1、大盲 2（大盲只有 9）
  const H = start(T);
  ok(H.toAct === 0, '三人：按鈕先說話');
  E.applyAction(H, { t: 'r', to: 6 });                 // 0 加注到 6
  E.applyAction(H, { t: 'f' });                        // 1 棄牌
  E.applyAction(H, { t: 'r', to: 9 });                 // 2 全下到 9（不完整）
  const L = E.legalActions(H);
  ok(H.toAct === 0 && L.toCall === 3 && !L.canRaise, '不完整的全下加注：已經說過話的人只能跟或棄');
}
{ // 邊池：A 全下 50、B、C 各 200 都全下；A 牌最大只拿主池
  const T = table(3, [50, 200, 200], 2);
  const H = E.newHand(T, E.makeRng(1));
  E.gameStep(H);
  // 指定手牌和公牌
  H.deck = E.parseCards('AsAh KsKh QsQh 2c7d9hJcTc 3d4d5d6d8c').concat(H.deck.filter((c) => !E.parseCards('AsAhKsKhQsQh2c7d9hJcTc3d4d5d6d8c').includes(c)));
  H.dp = 0;
  // 發牌順序是從按鈕左邊開始：0、1、2、0、1、2 → 0 拿 As Ks？改成直接指定
  E.gameStep(H);
  H.players[0].cards = E.parseCards('AsAh'); H.players[1].cards = E.parseCards('KsKh'); H.players[2].cards = E.parseCards('QsQh');
  H.deck = E.parseCards('2c7d9hJc3d').concat([0, 1, 2, 3, 4]); H.dp = 0;
  while (H.phase !== 'done') { const r = E.gameStep(H); if (r.need !== undefined) E.applyAction(H, { t: 'r', to: 9999 }); }
  const w = H.result.won;
  ok(w[0] === 150 && w[1] === 300 && w[2] === 0, '邊池：AA 拿主池 150、KK 拿邊池 300（實際 ' + w.join('/') + '）');
}
{ // 平分：兩人同樣的順子，底池平分，奇數籌碼給按鈕左邊的人
  const T = table(3, [200, 200, 200], 0);
  const H = start(T);
  H.players[0].cards = E.parseCards('2c3d'); H.players[1].cards = E.parseCards('2d3c'); H.players[2].cards = E.parseCards('2h7c');
  H.deck = E.parseCards('AsKsQhJdTc'); H.dp = 0;
  E.applyAction(H, { t: 'c' }); E.applyAction(H, { t: 'c' }); E.applyAction(H, { t: 'x' });
  while (H.phase !== 'done') { const r = E.gameStep(H); if (r.need !== undefined) E.applyAction(H, { t: 'x' }); }
  ok(H.result.won.join('/') === '2/2/2', '公牌是 A 高順子，三個人平分 6（實際 ' + H.result.won.join('/') + '）');
}
{ // 出牌明細（10/23）：公牌自己成對變成的兩對不算出牌；配到手牌的兩對在有對子的公牌上要打折
  const P = E.parseCards;
  const kk = E.outsInfo(P('KhKd'), P('3d7cTs'));
  ok(kk.total === 2 && kk.groups.filter((g) => g.strong).every((g) => g.cat === 3), 'KK 在 3-7-10：出牌只有 2 張 K（公牌成對的兩對不算），實際 ' + kk.total);
  const ak = E.outsInfo(P('AsKc'), P('Kd7h2c'));
  ok(ak.total === 5, 'AK 在 K-7-2：出牌 5 張（2 張 K 三條、3 張 A 兩對），實際 ' + ak.total);
  const w = new Float32Array(E.NCOMBO);
  for (let k = 0; k < E.NCOMBO; k++) w[k] = E.PRE_PCT[E.CLASS_OF[k]] < 0.25 ? 1 : 0;
  const T = E.outsTable(P('7s6s'), P('8h8d5c'), [w, w]);             // 兩個對手：都要贏
  const st = T.groups.find((g) => g.cat === 4), tp = T.groups.find((g) => g.cat === 2);
  ok(T.total === 14 && st.n === 8 && tp.n === 6, '76 在 8-8-5：順子 8 張＋兩對 6 張');
  ok(st.eff / st.n > 0.85 && tp.eff / tp.n < 0.72 && T.eff < 12, '順子乾淨、兩對要打折（' + (st.eff / st.n).toFixed(2) + '、' + (tp.eff / tp.n).toFixed(2) + '），打折後 ' + T.eff.toFixed(1) + ' 張');
  ok(Math.abs(T.pNext - 14 / 47) < 1e-9 && Math.abs(T.pRiver - (1 - 33 / 47 * 32 / 46)) < 1e-9, '下一張 14/47、到河牌 1 − 33/47 × 32/46');
  const L1 = E.outsAdviceLines(T, { toCall: 8, pot: 20, stack: 180, oppStack: 190, label: '跟注 8', est: 0.32 });
  ok(L1.some((x) => /勝率要 29%/.test(x) && /隱含賠率/.test(x)), '要跟 8、底池 20：要 29%，只靠出牌不夠時講隱含賠率');
  const L2 = E.outsAdviceLines(T, { toCall: 180, pot: 200, stack: 180, oppStack: 190, label: '跟注 180', est: 0.4 });
  ok(L2.some((x) => /全下，兩張都看得到/.test(x)), '翻牌全下：用到河牌的機率');
}
process.exit(bad ? 1 : 0);
