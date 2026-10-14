/* ===== 61-exam：實戰考核（大師之路）：牌桌發設計好的牌，教練先不說話，按完評分，評滿就算成績 ===== */
/* 換下一手之前：兩邊籌碼補回 100 大盲、換對手風格 */
function examPrep() {
  const E = G.exam;
  for (const s of G.T.seats) s.stack = GAME_STACK;
  if (E.villains) G.T.seats[1].style = examVillain(E);
}
/* newHand 之後、發牌之前：把指定的牌排進牌堆 */
function examDeal(H) {
  if (!G.exam.spots) return;                                       // 畢業考、GTO 訓練場：隨機發牌
  const sp = examNextSpot(G.exam, G.rng);
  stackDeck(H, 0, sp.hole, sp.board);
}
/* 現在是不是「考核中、輪到你、還沒按」：這時候不給任何建議 */
function examHiding() { return !!(G.exam && !G.exam.done && G.waitingHero && atHead() && !G.replay); }
/* GTO 訓練場：翻牌前、翻牌教練代打 */
function examAutoNow() { return !!(G.exam && G.exam.autoEarly && !G.exam.done && G.H && G.H.street <= 1); }
/* GTO 訓練場：轉牌、河牌要等解算好才能按（才能用 GTO 評分） */
function examWaitGto() {
  const E = G.exam, g = G.gto;
  if (!(E && E.gto && !E.done && G.waitingHero && G.H && G.H.street >= 2 && g && !g.lost && !g.heroFail && g.seats.indexOf(0) >= 0 && !gtoAdvUsable())) return false;
  if (!g.lockSince) g.lockSince = Date.now();
  return Date.now() - g.lockSince < 90000;                           // 等太久（90 秒）就放行：這一個決定不算 GTO 評分
}
/* 鎖著的時候：每 3 秒重畫一次（更新進度、檢查等太久）；解已經算好但還沒拿到建議（例如剛才在看前面的步驟）就再問一次 */
function examLockTick() {
  clearTimeout(G.lockT);
  if (!examHiding() || !examWaitGto()) return;
  const g = G.gto;
  if (g.ready && !g.asking && (!G.gtoAdv || G.gtoAdv.pathLen !== g.path.length || (g.done && !G.gtoAdv.done))) gtoHeroTurn(true);
  G.lockT = setTimeout(() => { if (G.waitingHero && atHead() && G.steps[G.view]) renderCtrl(G.steps[G.view]); }, 3000);
}
function examLockBtns() { return examHiding() && (examAutoNow() || examWaitGto()); }
/* 一手結束：記分；評滿就存成績 */
function examHandEnd() {
  const E = G.exam;
  if (!E || E.done) return;
  if (!examAdd(E, examMarks(E, G.review))) return;
  if (!LP) lpLoad();
  const c = examCounts(E.grades);
  LP.exam = LP.exam || {};
  const prev = LP.exam[E.id];
  const rec = { score: E.score, n: E.grades.length, good: c.good, ok: c.ok, bad: c.bad, pass: E.pass, at: Date.now() };
  LP.exam[E.id] = prev && prev.pass && (!E.pass || prev.score > E.score) ? Object.assign({}, prev, { last: E.score }) : rec;   // 之前過了、這次沒過或比較低：保留最好的過關成績
  if (E.final) E.graduated = gradCheck(LP);                        // 畢業考：筆試也過了才算畢業
  else if (E.pass) {
    const s = Math.round(E.score * 100), d = LP.done[E.id];
    if (!d || d.s < s) LP.done[E.id] = { s, n: 100, pct: true, at: Date.now() };
  }
  lpSave();
}
/* 牌桌上方那一條：進度 */
function examBarHTML() {
  const E = G.exam, n = E.grades.length, c = examCounts(E.grades);
  if (E.done) return '<b>' + (E.final ? '畢業考・實戰' : E.gto ? 'GTO 訓練場' : '實戰考核') + '結束</b>・平均 ' + Math.round(E.score * 100) + '%（要 ' + Math.round(E.passAt * 100) + '%）・' + (E.pass ? '過關' : '還差一點');
  return '<b>' + (E.final ? '畢業考・實戰' : E.gto ? 'GTO 訓練場' : '實戰考核 ' + esc(E.id)) + '</b>・' + (E.gto ? 'GTO 已評 ' : '已評 ') + n + '／' + E.need + '・✓ ' + c.good + '　△ ' + c.ok + '　✗ ' + c.bad + (n ? '・目前 ' + Math.round(examScore(E.grades) * 100) + '%' : '') + '・要 ' + Math.round(E.passAt * 100) + '%';
}
/* 輪到你：教練框只放提醒（past＝看的是前面已經做完的決定：這一手結束前不給建議） */
function examHeroHTML(S, past) {
  const L = legalSnapshot(S);
  if (past) return '<h3>你在這裡做過決定了</h3><p class="note">考核中：每一步的建議和勝率，這一手結束後重看才會顯示。下一步會看到評分。</p>';
  if (examAutoNow()) return '<h3>教練代打' + STREET_NAME[G.H.street] + '</h3><p class="note">GTO 訓練場只評轉牌、河牌；翻牌前和翻牌由教練照建議打。</p>';
  return '<h3>輪到你' + (L.toCall > 0 ? '：要跟 ' + L.toCall : '：可以過牌') + '</h3><div class="adv"><div class="rec">考核中：教練先不說話</div><ol>'
    + '<li>我的牌在哪一級？（兩對以上、超對頂對、中弱對、聽牌、沒中）</li><li>他的動作代表什麼範圍？（看他的位置、風格、下注大小）</li><li>價錢：要跟的 ÷ 跟完的底池。</li><li>勝率夠不夠？夠就跟，很強就下注、加注，不夠就棄。</li></ol>'
    + '<p class="note">按完會馬上評分（✓、△、✗），並告訴你教練的建議。</p></div>';
}
/* 一手結束時教練框的考核區塊 */
function examSummaryHTML() {
  const E = G.exam, c = examCounts(E.grades);
  if (!E.done) return '<p class="note" style="margin-top:10px">' + (E.gto ? 'GTO 訓練場：GTO 評分 ' : E.final ? '畢業考：已評 ' : '實戰考核：已評 ') + E.grades.length + '／' + E.need + ' 個決定（✓ ' + c.good + '、△ ' + c.ok + '、✗ ' + c.bad + '）' + (E.gto ? '；翻牌前、翻牌是教練代打，不算分' : E.skipTrivial ? '；明顯該棄的爛牌不算' : '') + '。</p>';
  if (E.final && E.pass) return '<div class="studiooffer"><b>' + (E.graduated || (LP && LP.grad) ? '🎓 畢業了！' : '🎉 實戰通過！') + '</b><p>' + E.grades.length + ' 個決定：✓ ' + c.good + '、△ ' + c.ok + '、✗ ' + c.bad + '，平均 <b>' + Math.round(E.score * 100) + '%</b>（要 ' + Math.round(E.passAt * 100) + '%）。</p><p class="note">' + (LP && LP.grad ? '筆試和實戰都通過了：回大師之路拿結業證書。' : !(LP.gradW && LP.gradW.pass) ? '還要通過筆試（30 題）才畢業。' : '還要完成其他 ' + gradMissing(LP).length + ' 課才畢業（成績先記著）。') + '</p></div>';
  return '<div class="studiooffer"><b>' + (E.pass ? '🎉 實戰考核過關！' : '實戰考核：還差一點') + '</b><p>' + E.grades.length + ' 個決定：✓ ' + c.good + '、△ ' + c.ok + '、✗ ' + c.bad + '，平均 <b>' + Math.round(E.score * 100) + '%</b>（要 ' + Math.round(E.passAt * 100) + '%）。</p>'
    + '<p class="note">' + (E.pass ? '回大師之路繼續下一課。' : '✗ 的決定在每一手的檢討裡都有教練的建議；把第 ' + E.stage + ' 階的課再看一次，再考一次（牌會重新洗）。') + '</p></div>';
}
/* 控制列：一手結束 */
function examOverCtrl(net, marks) {
  const E = G.exam;
  const res = '<b>' + (net > 0 ? '你贏了 ' + net : net < 0 ? '你輸了 ' + (-net) : '沒輸沒贏') + '</b>' + (marks ? '　這手：' + marks : '');
  if (!E.done) return { m: res + '　<span class="why">考核：已評 ' + E.grades.length + '／' + E.need + '</span>', b: '<button class="btn main" data-c="nexthand" id="bNext">下一手 ▶</button><button class="btn" data-c="replay">重看這一手</button>' };
  const grad = E.final && LP && LP.grad;
  return { m: '<b>' + (grad ? '🎓 畢業了！' : E.pass ? '🎉 ' + (E.final ? '實戰通過！' : '考核過關！') : '考核結束：還差一點') + '</b>　平均 ' + Math.round(E.score * 100) + '%（要 ' + Math.round(E.passAt * 100) + '%）<button type="button" class="linkbtn" data-c="why">看結果</button>',
    b: '<button class="btn main" data-c="' + (grad ? 'cert' : 'learn') + '" id="bNext">' + (grad ? '看結業證書 ▶' : '回大師之路 ▶') + '</button><button class="btn" data-c="exam">再考一次</button><button class="btn" data-c="replay">重看這一手</button>' };
}
