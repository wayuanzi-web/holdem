/* ===== 60-learn：大師之路（課程表、上課、練習、測驗、分級、跳級、起手牌字典） ===== */
const LN_KEY = 'dezhou-learn-1';
let LP = null;                                                 // 進度（存在這台裝置）
const LN = { mode: 'map', lesson: null, phase: 'read', qs: [], qi: 0, res: [], answered: false, timer: 0, t0: 0, sec: 0, rng: null, kind: '', stage: 0, dictG: -1, autoT: 0 };
function lpLoad() { try { LP = Object.assign(learnBlank(), JSON.parse(localStorage.getItem(LN_KEY) || 'null') || {}); } catch (e) { LP = learnBlank(); } }
function lpSave() { if (LP && !LP.grad && typeof gradCheck === 'function') gradCheck(LP); try { localStorage.setItem(LN_KEY, JSON.stringify(LP)); } catch (e) { /* 存不了也能上課 */ } }
const lnRng = () => makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
const TIER_COL = ['', '#c9462e', '#d98a2b', '#c9b13a', '#3f9d6a', '#3b5a50'];
/* 課程文字是程式裡寫好的（可信），可以有 <b> 等標記；只把 {c數字} 換成牌 */
const richH = (s) => String(s).replace(/\{c(\d+)\}/g, (m, c) => cardSpan(+c));

/* ===== 畫面切換 ===== */
function openLearn(mode, arg) {
  clearLnTimers();
  LN.mode = mode || 'map';
  LN.phase = 'read'; LN.answered = false; LN.vi = null; LN.browsing = false;   // 離開題目畫面：鍵盤不會再答到看不見的題目
  if (LN.mode === 'lesson') LN.lesson = arg;
  if (LN.mode === 'dict') LN.dictG = arg === undefined ? (LN.dictG >= 0 ? LN.dictG : 0) : arg;
  showView('learn');
  renderLearn();
  window.scrollTo(0, 0);
}
function clearLnTimers() { clearInterval(LN.timer); clearTimeout(LN.autoT); LN.timer = 0; LN.autoT = 0; }
function renderLearn() {
  const R = $('lnRoot');
  if (LN.browsing) { R.innerHTML = '<div class="lnbar"><button type="button" class="btn sm" data-ln="unbrowse">← 回到結果</button><div class="lnttl"><b>逐題看解釋</b></div></div>' + qHTML(); return; }
  if (LN.mode === 'map') R.innerHTML = mapHTML();
  else if (LN.mode === 'lesson') R.innerHTML = lessonHTML();
  else if (LN.mode === 'dict') { R.innerHTML = dictHTML(); }
  else if (LN.mode === 'cert') { R.innerHTML = certHTML(); drawCert(); }
  else if (LN.mode === 'hist') R.innerHTML = histHTML();
  else R.innerHTML = testHTML();
  if (LN.mode === 'dict' && LN.dictScroll) { LN.dictScroll = false; const d = $('lnDictDetail'); if (d && window.innerWidth < 900) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ===== 課程表 ===== */
const SKIP_OK = {};
function canSkipTest(sid) { if (NO_SKIP[sid]) return false; if (!(sid in SKIP_OK)) SKIP_OK[sid] = !!STAGE_GENS[sid] && makeQuiz(STAGE_GENS[sid], 8, makeRng(1)).length >= 8; return SKIP_OK[sid]; }
function mapHTML() {
  const c = learnCount(LP), nx = learnNext(LP);
  let h = '<div class="lnhead"><h2>大師之路</h2><p class="note">從規則到 GTO 分八階，每一課：短講解 → 練習 → 過關測驗。進度存在這台裝置，隨時接著上。</p>'
    + '<div class="lnprog"><div class="track"><i style="width:' + (c.done / c.total * 100).toFixed(1) + '%"></i></div><span class="num">' + c.done + '／' + c.total + ' 課</span></div>';
  if (nx) h += '<button class="btn main big lngo" data-ln="go" data-id="' + nx.id + '">' + (c.done ? '繼續' : '開始') + '：第 ' + nx.stage + ' 階・' + esc(nx.title) + ' ▶</button>' + (nx.ready ? '' : '<p class="note">這一課還在製作中（下一批更新），可以先做下面的練習、查起手牌字典，或用跳級測驗往後走。</p>');
  else h += '<p class="lndone">🏆 全部完成！</p>';
  if (LP.grad) h += '<div class="strow"><button class="btn main lncertb" data-ln="cert">🎓 已畢業：看結業證書</button></div>';
  h += '<div class="strow"><button class="btn" data-ln="place">' + (LP.place ? '重新做分級測驗' : '分級測驗：找到你的起點（12 題）') + '</button><button class="btn" data-ln="dict">起手牌字典（169 手）</button></div>';
  if (LP.place) h += '<p class="note">分級測驗建議從第 ' + LP.place.start + ' 階開始。</p>';
  const nw = (LP.wrong || []).length;
  if (nw) h += '<div class="strow"><button class="btn lnwbtn" data-ln="review">📕 錯題本（' + nw + ' 題）：複習答錯過的題目</button></div>';
  const nh = (LP.hist || []).length;
  if (nh) h += '<div class="strow"><button class="btn lnwbtn" data-ln="hist">📜 做過的題目（' + nh + ' 題）：回頭看解釋、抽題再考</button></div>';
  h += '<details class="lndrills"><summary>⚡ 快答訓練場：計時練速度，記最好成績</summary><div class="lndgrid">' + DRILLS.map((d) => { const b = LP.best[d.id]; return '<button type="button" class="lndr" data-ln="drill" data-d="' + d.id + '"><b>' + esc(d.name) + '</b><span class="note">20 題・每題 ' + d.sec + ' 秒' + (b ? '<br>最好 ' + b.ok + '／' + b.n + '・' + fmt(b.ms / 1000, 1) + ' 秒' : '') + '</span></button>'; }).join('') + '</div></details>';
  h += '</div>';
  for (const s of COURSE) {
    const tot = s.lessons.length, done = s.lessons.filter((l) => lessonDone(LP, l.id)).length, ready = s.lessons.some((l) => l.ready);
    const open = nx && nx.stage === s.id;
    h += '<details class="lnstage' + (done === tot ? ' done' : '') + '"' + (open ? ' open' : '') + '><summary><span class="lnsn">第 ' + s.id + ' 階</span><b>' + esc(s.name) + '</b><span class="lnsc num">' + (LP.skip[s.id] ? '已跳過' : done + '／' + tot) + '</span></summary>'
      + '<p class="note">' + esc(s.goal) + '</p><ol class="lnlist">';
    for (const l of s.lessons) {
      const d = lessonDone(LP, l.id), cur = nx && nx.id === l.id, sc = LP.done[l.id];
      h += '<li class="' + (d ? 'd' : '') + (cur ? ' cur' : '') + '">' + (l.ready ? '<button type="button" data-ln="lesson" data-id="' + l.id + '">' : '<span class="nr">')
        + '<span class="mk">' + (d ? '✓' : cur ? '▶' : '○') + '</span><span class="lt">' + esc(l.id + '　' + l.title) + '</span>'
        + (l.ready ? (sc ? '<span class="ls num">' + (sc.pct ? sc.s + '%' : sc.s + '／' + sc.n) + '</span>' : '') : '<span class="ls">製作中</span>') + (l.ready ? '</button>' : '</span>') + '</li>';
    }
    h += '</ol>';
    if (done < tot && !LP.skip[s.id] && canSkipTest(s.id)) h += '<div class="strow"><button class="btn sm" data-ln="skip" data-s="' + s.id + '">跳級測驗：8 題答對 7 題，這一階直接通過</button></div>';
    if (!ready) h += '<p class="note">這一階的課程下一批上線。</p>';
    h += '</details>';
  }
  return h;
}

/* ===== 上課：講解 → 練習 → 過關測驗 ===== */
function lessonHTML() {
  const l = LN.lesson, s = COURSE.find((x) => x.id === l.stage);
  if (l.grad) return gradLessonHTML(l, s);
  if (l.exam) return examLessonHTML(l, s);
  const steps = [['read', '講解'], ['practice', '練習'], ['quiz', '過關測驗']];
  const curI = LN.phase === 'result' ? 2 : steps.findIndex((x) => x[0] === LN.phase);
  let h = '<div class="lnbar"><button type="button" class="btn sm" data-ln="map">← 課程表</button><div class="lnttl"><span class="note">第 ' + s.id + ' 階　' + esc(s.name) + '</span><b>' + esc(l.id + '　' + l.title) + '</b></div></div>'
    + '<ol class="lnsteps">' + steps.map(([k, t], i) => '<li class="' + (i < curI ? 'd' : i === curI ? 'on' : '') + '">' + t + '</li>').join('') + '</ol>';
  if (LN.phase === 'read') {
    h += '<div class="panel lnread">' + l.read.map(blockHTML).join('') + '</div>'
      + '<div class="lngo2"><button class="btn main big" data-ln="practice">開始練習（' + l.practice.n + ' 題，不計分）▶</button><button type="button" class="linkbtn" data-ln="quiz">直接過關測驗</button></div>';
  } else if (LN.phase === 'practice' || LN.phase === 'quiz') h += qHTML();
  else if (LN.phase === 'pdone') {
    const ok = LN.res.filter((r) => r.ok).length;
    h += '<div class="panel lnres"><p>練習完了：答對 <b>' + ok + '／' + LN.res.length + '</b>。</p><p>過關測驗：' + l.quiz.n + ' 題答對 ' + l.quiz.pass + ' 題過關' + (l.quiz.sec ? '，每題 <b>' + l.quiz.sec + ' 秒</b>內要答' : '') + '。</p>'
      + '<div class="lngo2"><button class="btn main big" data-ln="quiz">開始過關測驗 ▶</button><button class="btn" data-ln="practice">再練一次</button>' + browseBtn() + '<button type="button" class="linkbtn" data-ln="reread">回去看講解</button></div></div>';
  } else if (LN.phase === 'result') h += resultHTML();
  return h;
}
/* 實戰考核的課：講解 → 到牌桌；回來看上一次的成績 */
function examLessonHTML(l, s) {
  const X = EXAMS[l.exam], R = (LP.exam || {})[l.exam];
  let h = '<div class="lnbar"><button type="button" class="btn sm" data-ln="map">← 課程表</button><div class="lnttl"><span class="note">第 ' + s.id + ' 階　' + esc(s.name) + '</span><b>' + esc(l.id + '　' + l.title) + '</b></div></div>'
    + '<ol class="lnsteps"><li class="' + (R ? 'd' : 'on') + '">講解</li><li class="' + (R ? 'on' : '') + '">實戰考核</li></ol>';
  h += examResumeHTML(l.exam);
  if (R) {
    h += '<div class="panel lnres"><p class="lnbig">' + (R.pass ? '🎉 考核過關' : '上一次還差一點') + '</p><p>' + R.n + ' 個決定：✓ ' + R.good + '、△ ' + R.ok + '、✗ ' + R.bad + '，平均 <b>' + Math.round(R.score * 100) + '%</b>（要 ' + Math.round(X.pass * 100) + '%）。</p>';
    const nx = learnNext(LP);
    if (R.pass && nx && nx.id !== l.id) h += '<div class="lngo2">' + (nx.ready ? '<button class="btn main big" data-ln="go" data-id="' + nx.id + '">下一課：' + esc(nx.title) + ' ▶</button>' : '') + '<button class="btn" data-ln="exam" data-id="' + l.id + '">再考一次</button><button class="btn" data-ln="map">課程表</button></div>' + (nx.ready ? '' : '<p class="note">下一課「' + esc(nx.title) + '」還在製作中，下一批更新會上線。</p>');
    else h += '<div class="lngo2"><button class="btn main big" data-ln="exam" data-id="' + l.id + '">' + (R.pass ? '再考一次' : '再考一次（新的牌）') + ' ▶</button><button class="btn" data-ln="map">課程表</button></div>';
    h += '</div>';
  }
  h += '<div class="panel lnread">' + l.read.map(blockHTML).join('') + '</div>';
  if (!R) h += '<div class="lngo2"><button class="btn main big" data-ln="exam" data-id="' + l.id + '">開始實戰考核（到牌桌）▶</button></div>';
  return h;
}
/* 考到一半離開了：回到牌桌接著考 */
function examResumeHTML(id) {
  const E = typeof G !== 'undefined' && G.exam;
  if (!E || E.id !== id || E.done || !G.H) return '';
  return '<div class="lngo2"><button class="btn main big" data-ln="resume">回到考核（已評 ' + E.grades.length + '／' + E.need + '）▶</button></div>';
}
/* 畢業考：筆試、實戰兩部分，都過就畢業 */
function gradLessonHTML(l, s) {
  const W = LP.gradW, P = (LP.exam || {})['8-5'], X = EXAMS['8-5'];
  const st = (ok, has) => (ok ? '<span class="lnok">✓ 通過</span>' : has ? '<span class="lnno">還沒過</span>' : '<span class="note">還沒考</span>');
  let h = '<div class="lnbar"><button type="button" class="btn sm" data-ln="map">← 課程表</button><div class="lnttl"><span class="note">第 ' + s.id + ' 階　' + esc(s.name) + '</span><b>' + esc(l.id + '　' + l.title) + '</b></div></div>';
  const miss = gradMissing(LP);
  if (!LP.grad && miss.length) h += '<p class="note lnmiss">畢業還要完成其他 ' + miss.length + ' 課（' + miss.slice(0, 4).map((x) => x.id).join('、') + (miss.length > 4 ? '…' : '') + '）；兩部分的成績會先記著，課上完就自動畢業。</p>';
  h += examResumeHTML('8-5');
  if (LP.grad) h += '<div class="panel lnres"><p class="lnbig">🎓 畢業了！</p><p>筆試 ' + LP.grad.w + '／' + LP.grad.wn + '、實戰 ' + LP.grad.p + '%。</p><div class="lngo2"><button class="btn main big" data-ln="cert">看結業證書 ▶</button></div></div>';
  h += '<div class="lngrad">'
    + '<div class="panel"><h4 class="lnh4">第一部分　筆試 ' + st(W && W.pass, W) + '</h4><p class="note">30 題（第 1–8 階）、每題 ' + GRAD_W.sec + ' 秒，答對 ' + GRAD_W.pass + ' 題通過。' + (W ? '<br>' + (W.pass ? '通過的成績' : '最好成績') + '：' + W.s + '／' + W.n + (W.last !== undefined && W.last !== W.s ? '（上一次 ' + W.last + '）' : '') : '') + '</p><button class="btn' + (W && W.pass ? '' : ' main') + '" data-ln="gradw">' + (W ? '再考筆試' : '開始筆試') + ' ▶</button></div>'
    + '<div class="panel"><h4 class="lnh4">第二部分　實戰 ' + st(P && P.pass, P) + '</h4><p class="note">6 人桌、高手等級，評 ' + X.need + ' 個決定、平均 ' + Math.round(X.pass * 100) + '%。' + (P ? '<br>' + (P.pass ? '通過的成績' : '上一次') + '：' + Math.round(P.score * 100) + '%（✓ ' + P.good + '、△ ' + P.ok + '、✗ ' + P.bad + '）' : '') + '</p><button class="btn' + (P && P.pass ? '' : ' main') + '" data-ln="exam" data-id="' + l.id + '">' + (P ? '再考實戰' : '開始實戰（到牌桌）') + ' ▶</button></div></div>';
  h += '<div class="panel lnread">' + l.read.map(blockHTML).join('') + '</div>';
  return h;
}
/* ===== 結業證書 ===== */
function certHTML() {
  const G2 = LP.grad;
  let h = '<div class="lnbar"><button type="button" class="btn sm" data-ln="map">← 課程表</button><div class="lnttl"><b>結業證書</b></div></div>';
  if (!G2) return h + '<div class="panel lnres"><p>還沒畢業：通過第 8-5 課的筆試和實戰就會拿到證書。</p></div>';
  h += '<div class="panel lncert"><label class="lnname2">證書上的名字 <input id="lnCertName" maxlength="16" placeholder="寫上你的名字" value="' + esc(LP.name || '') + '"></label>'
    + '<canvas id="lnCertCv" width="1200" height="850" hidden></canvas><img id="lnCertImg" alt="結業證書">'
    + '<div class="lngo2"><a class="btn main" id="lnCertDl" download="德州軍師-結業證書.png">存成圖片 ▼</a></div><p class="note">手機可以長按圖片存到相簿。名字只存在這台裝置。</p></div>';
  return h;
}
function drawCert() {
  const cv = $('lnCertCv'), G2 = LP.grad;
  if (!cv || !G2) return;
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, serif = '"Noto Serif TC", "Songti TC", "PMingLiU", serif', sans = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  x.fillStyle = '#fbf8f1'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#17392f'; x.lineWidth = 14; x.strokeRect(22, 22, W - 44, H - 44);
  x.strokeStyle = '#d0a84e'; x.lineWidth = 3; x.strokeRect(46, 46, W - 92, H - 92);
  x.textAlign = 'center'; x.fillStyle = '#17392f';
  x.font = '600 30px ' + sans; x.fillText('德州軍師・大師之路', W / 2, 130);
  x.font = '700 84px ' + serif; x.fillText('結 業 證 書', W / 2, 235);
  x.fillStyle = '#3b4a44'; x.font = '400 30px ' + serif; x.fillText('茲證明', W / 2, 320);
  const nm = (LP.name || '').trim();
  x.fillStyle = '#0e1d19'; x.font = '700 64px ' + serif; x.fillText(nm || '＿＿＿＿＿＿', W / 2, 405);
  const uw = Math.max(200, Math.min(900, x.measureText(nm || '＿＿＿＿＿＿').width + 80)) / 2;
  x.strokeStyle = '#d0a84e'; x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2 - uw, 425); x.lineTo(W / 2 + uw, 425); x.stroke();
  x.fillStyle = '#3b4a44'; x.font = '400 30px ' + serif;
  x.fillText('完成大師之路八階課程，通過畢業考', W / 2, 490);
  x.fillText('筆試 ' + G2.w + '／' + G2.wn + '　・　實戰 ' + G2.p + '%', W / 2, 540);
  x.fillText('特頒此證。', W / 2, 590);
  x.fillStyle = '#6b7a74'; x.font = '400 21px ' + sans;
  x.fillText(COURSE.map((c) => c.name).join('・'), W / 2, 660);
  const d = new Date(G2.at);
  x.textAlign = 'left'; x.fillStyle = '#3b4a44'; x.font = '400 26px ' + serif;
  x.fillText(d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日', 110, 760);
  // 朱印
  x.save(); x.translate(W - 190, 738); x.rotate(-0.06);                 // 跟標題的印一樣：上排德州、下排軍師
  x.fillStyle = '#c8372d'; x.fillRect(-60, -60, 120, 120);
  x.strokeStyle = '#fbf8f1'; x.lineWidth = 3; x.strokeRect(-52, -52, 104, 104);
  x.fillStyle = '#fbf8f1'; x.font = '700 40px ' + serif; x.textAlign = 'center';
  x.fillText('德', -21, -6); x.fillText('州', 21, -6); x.fillText('軍', -21, 38); x.fillText('師', 21, 38);
  x.restore();
  const url = cv.toDataURL('image/png');
  $('lnCertImg').src = url; $('lnCertDl').href = url;
}
function startQs(kind) {
  const l = LN.lesson;
  clearLnTimers();
  LN.rng = lnRng(); LN.kind = kind; LN.phase = kind;
  const cfg = kind === 'practice' ? l.practice : l.quiz;
  LN.qs = makeQuiz(cfg.gens, cfg.n, LN.rng); LN.qi = 0; LN.res = []; LN.answered = false; LN.vi = null; LN.browsing = false;
  LN.sec = kind === 'quiz' ? (cfg.sec || 0) : 0;
  renderLearn(); startQTimer();
  window.scrollTo(0, 0);
}
/* 題目畫面（上課、分級、跳級共用） */
/* 一題的內容（題目、圖、選項、解釋）：r＝作答結果 {pick, ok, timeout}；hide＝先遮住答案（自己想） */
function qBodyHTML(q, r, live, hide) {
  let h = '<p class="lnprompt">' + richH(q.prompt) + '</p>' + visHTML(q.vis);
  const show = r && !hide;
  h += '<div class="lnopts' + (q.opts.length > 3 ? ' many' : '') + '">' + q.opts.map((o, i) => {
    let cls = '';
    if (show) cls = o.ok ? ' right' : r.pick === i ? ' wrong' : ' dim';
    return '<button type="button" class="lnopt' + cls + '"' + (live ? ' data-ln="ans" data-i="' + i + '"' : '') + (r || !live ? ' disabled' : '') + '><span class="k">' + (i + 1) + '</span>' + esc(o.t) + (show && r.pick === i && !live ? '<small class="lnmine">你選的</small>' : '') + '</button>';
  }).join('') + '</div>';
  if (show) h += '<div class="lnfb ' + (r.ok ? 'ok' : 'no') + '"><b>' + (r.ok ? '✓ 對了' : r.timeout ? '⏰ 時間到' : r.pick < 0 ? '答案' : '✗ 不對') + '</b>　' + richH(q.explain) + '</div>';
  return h;
}
function qHTML() {
  const n = LN.qs.length, ok = LN.res.filter((r) => r.ok).length;
  if (LN.vi !== null && LN.vi !== undefined) {                     // 回頭看前面做過的題目
    const i = LN.vi, q = LN.qs[i], r = LN.res[i], last = LN.browsing ? LN.res.length - 1 : LN.qi - 1;
    return '<div class="panel lnq lnpast"><div class="lnqtop"><span class="num">第 ' + (i + 1) + '／' + n + ' 題・回頭看</span><span class="num">' + (r.ok ? '✓ 答對' : '✗ 答錯') + '</span></div>' + qBodyHTML(q, r, false)
      + '<div class="lngo2">' + (i > 0 ? '<button class="btn" data-ln="qprev">◀ 上一題</button>' : '') + '<button class="btn main" id="lnNext" data-ln="qnext">' + (i < last ? '下一題 ▶' : LN.browsing ? '回到結果 ▶' : '回到第 ' + (LN.qi + 1) + ' 題 ▶') + '</button></div></div>';
  }
  const q = LN.qs[LN.qi];
  let h = '<div class="panel lnq"><div class="lnqtop"><span class="num">第 ' + (LN.qi + 1) + '／' + n + ' 題</span><span class="num">✓ ' + ok + '</span></div>';
  if (LN.sec) h += '<div class="lntime"><i id="lnTimeBar"></i></div>';
  const r = LN.answered ? LN.res[LN.res.length - 1] : null;
  h += qBodyHTML(q, r, true);
  const back = LN.qi > 0 && (r || !LN.sec) ? '<button class="btn" data-ln="qprev">◀ 上一題</button>' : '';   // 計時中不能回頭看
  if (r) h += '<div class="lngo2">' + back + '<button class="btn main" id="lnNext" data-ln="next">' + (LN.qi + 1 < n ? '下一題 ▶' : '看結果 ▶') + '</button></div>';
  else if (back) h += '<div class="lngo2">' + back + '</div>';
  return h + '</div>';
}
/* 結果頁：逐題看每一題的解釋 */
function browseBtn() { return LN.res && LN.res.length ? '<button class="btn" data-ln="browse">📖 逐題看解釋（' + LN.res.length + ' 題）</button>' : ''; }
function qNav(d) {
  if (d < 0) {
    if (LN.vi === null || LN.vi === undefined) { if (LN.qi < 1 || (LN.sec && !LN.answered)) return; clearInterval(LN.timer); LN.vi = LN.qi - 1; }
    else if (LN.vi > 0) LN.vi--;
  } else {
    if (LN.vi === null || LN.vi === undefined) return;
    const last = LN.browsing ? LN.res.length - 1 : LN.qi - 1;
    if (LN.vi < last) LN.vi++;
    else { LN.vi = null; if (LN.browsing) LN.browsing = false; }
  }
  renderLearn(); window.scrollTo(0, 0);
  const nb = $('lnNext'); if (nb) nb.focus({ preventScroll: true });
}

/* ===== 做過的題目：照時間倒著看，可以篩選、先遮住答案、抽題再考 ===== */
function histFilters() {
  const H = LP.hist || [], st = new Set(H.map((x) => x.stage).filter(Boolean));
  return [['all', '全部'], ['wrong', '答錯的'], ['right', '答對的']].concat([...st].sort((a, b) => a - b).map((s) => [s, '第 ' + s + ' 階']));
}
function histHTML() {
  const list = histList(LP, LN.hf === undefined ? 'all' : LN.hf), H = LP.hist || [];
  const nw = H.filter((x) => !x.ok).length;
  let h = '<div class="lnbar"><button type="button" class="btn sm" data-ln="map">← 課程表</button><div class="lnttl"><b>📜 做過的題目</b><span class="note">最近 ' + H.length + ' 題（最多 ' + HIST_MAX + ' 題）：答對 ' + (H.length - nw) + '、答錯 ' + nw + '</span></div></div>';
  h += '<div class="lnchips lnhf">' + histFilters().map(([k, t]) => '<button type="button" class="chip' + ((LN.hf === undefined ? 'all' : LN.hf) === k ? ' on' : '') + '" data-ln="hf" data-f="' + k + '">' + t + '</button>').join('') + '</div>';
  if (!list.length) return h + '<div class="panel lnres"><p>這裡還沒有題目。</p></div>';
  const i = Math.min(LN.hi || 0, list.length - 1), x = list[i], d = new Date(x.at);
  const hide = !!LP.histHide && !LN.hshow;
  h += '<div class="panel lnq lnpast"><div class="lnqtop"><span class="num">第 ' + (i + 1) + '／' + list.length + ' 題</span><span class="note">' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '・' + esc(x.src) + (hide ? '' : '・' + (x.ok ? '✓ 答對' : '✗ 答錯')) + '</span></div>'
    + qBodyHTML(x.q, { pick: x.pick, ok: x.ok, timeout: x.pick < 0 && !x.ok }, false, hide)
    + (hide ? '<div class="lngo2"><button class="btn main" data-ln="hshow">看答案和解釋</button></div>' : '')
    + '<div class="lngo2">' + (i > 0 ? '<button class="btn" data-ln="hprev">◀ 上一題</button>' : '') + (i + 1 < list.length ? '<button class="btn' + (hide ? '' : ' main') + '" id="lnNext" data-ln="hnext">下一題 ▶</button>' : '') + '</div>'
    + '<label class="lnhide"><input type="checkbox" id="lnHistHide"' + (LP.histHide ? ' checked' : '') + '> 先遮住答案（自己想好再看）</label></div>';
  h += '<div class="lngo2"><button class="btn" data-ln="redo">🔁 從' + (LN.hf === undefined || LN.hf === 'all' ? '全部' : '這些') + '題目抽 ' + Math.min(10, new Set(list.map((y) => y.q.key)).size) + ' 題再考一次</button></div>';
  return h;
}
function histGo(d) {
  const n = histList(LP, LN.hf === undefined ? 'all' : LN.hf).length;
  LN.hi = Math.max(0, Math.min(n - 1, (LN.hi || 0) + d)); LN.hshow = false;
  renderLearn(); window.scrollTo(0, 0);
}
function startQTimer() {
  clearInterval(LN.timer);
  if (!LN.sec || LN.answered) return;
  LN.t0 = Date.now();
  LN.timer = setInterval(() => {
    const f = (Date.now() - LN.t0) / (LN.sec * 1000), bar = $('lnTimeBar');
    if (bar) bar.style.width = Math.min(100, f * 100).toFixed(1) + '%';
    if (f >= 1) { clearInterval(LN.timer); answerQ(-1); }
  }, 50);
}
function answerQ(i) {
  if (LN.answered) return;
  clearInterval(LN.timer);
  const q = LN.qs[LN.qi], ok = i >= 0 && q.opts[i].ok;
  LN.answered = true;
  LN.res.push({ ok, pick: i, timeout: i < 0, key: q.key, stage: q.stage, ms: LN.sec ? Date.now() - LN.t0 : 0 });
  if (LN.mode === 'review') wrongResult(LP, q.key, ok);
  else if (!ok && LN.mode !== 'place') wrongAdd(LP, q);
  histAdd(LP, q, i, ok, histSrc(), LN.mode === 'lesson' ? LN.lesson.stage : q.stage || genStage(q.gen));
  lpSave();
  renderLearn();
  const nb = $('lnNext');
  if (nb) nb.focus({ preventScroll: true });                       // 答對、答錯都停下來讓你看解釋，自己按「下一題」
}
function histSrc() {
  const m = LN.mode;
  return m === 'lesson' ? LN.lesson.id + ' ' + (LN.kind === 'practice' ? '練習' : '測驗') : m === 'place' ? '分級測驗' : m === 'skip' ? '第 ' + LN.stage + ' 階跳級測驗' : m === 'drill' ? '快答：' + LN.drill.name : m === 'review' ? '錯題本' : m === 'grad' ? '畢業考筆試' : m === 'redo' ? '再考一次' : '';
}
function nextQ() {
  clearLnTimers();
  if (!LN.answered) return;
  if (LN.qi + 1 < LN.qs.length) { LN.qi++; LN.answered = false; renderLearn(); startQTimer(); return; }
  finishQs();
}
function finishQs() {
  const ok = LN.res.filter((r) => r.ok).length;
  if (LN.mode === 'lesson') {
    if (LN.kind === 'practice') { LN.phase = 'pdone'; renderLearn(); window.scrollTo(0, 0); return; }
    const l = LN.lesson, pass = ok >= l.quiz.pass;
    if (pass) { const prev = LP.done[l.id]; if (!prev || prev.s < ok) LP.done[l.id] = { s: ok, n: LN.res.length, at: Date.now() }; lpSave(); }
    LN.phase = 'result'; LN.pass = pass; renderLearn(); window.scrollTo(0, 0); return;
  }
  if (LN.mode === 'place') {
    const P = placementStart(LN.res);
    LN.placeRes = P; LN.phase = 'result'; renderLearn(); window.scrollTo(0, 0); return;
  }
  if (LN.mode === 'skip') { LN.pass = ok >= 7; if (LN.pass) { LP.skip[LN.stage] = true; (LP.tskip = LP.tskip || {})[LN.stage] = true; lpSave(); } LN.phase = 'result'; renderLearn(); window.scrollTo(0, 0); }
  if (LN.mode === 'drill') {
    const timed = LN.res.filter((r) => r.ms > 0), avg = timed.length ? timed.reduce((a, r) => a + r.ms, 0) / timed.length : 0;
    const b = LP.best[LN.drill.id];
    LN.newBest = !b || ok > b.ok || (ok === b.ok && avg < b.ms);
    if (LN.newBest) { LP.best[LN.drill.id] = { ok, n: LN.res.length, ms: Math.round(avg), at: Date.now() }; lpSave(); }
    LN.avg = avg; LN.phase = 'result'; renderLearn(); window.scrollTo(0, 0);
  }
  if (LN.mode === 'review' || LN.mode === 'redo') { LN.phase = 'result'; renderLearn(); window.scrollTo(0, 0); }
  if (LN.mode === 'grad') {
    const n = LN.res.length, prev = LP.gradW, best = !prev || ok > prev.s ? ok : prev.s;   // 記最好的成績
    LN.pass = ok >= GRAD_W.pass;
    LP.gradW = { s: best, n, pass: best >= GRAD_W.pass, last: ok, at: Date.now() };
    LN.justGrad = gradCheck(LP);
    lpSave(); LN.phase = 'result'; renderLearn(); window.scrollTo(0, 0);
  }
}
function resultHTML() {
  const ok = LN.res.filter((r) => r.ok).length, l = LN.lesson;
  const timed = LN.res.filter((r) => r.ms > 0), avg = timed.length ? timed.reduce((a, r) => a + r.ms, 0) / timed.length / 1000 : 0;
  let h = '<div class="panel lnres"><p class="lnbig">' + (LN.pass ? '🎉 過關！' : '還差一點') + '</p><p>答對 <b>' + ok + '／' + LN.res.length + '</b>（要 ' + l.quiz.pass + ' 題）' + (avg ? '，平均每題 ' + fmt(avg, 1) + ' 秒' : '') + '。</p>';
  h += '<div class="lngo2">' + browseBtn() + '</div>';
  const nx = learnNext(LP);
  if (LN.pass) h += '<div class="lngo2">' + (nx && nx.ready ? '<button class="btn main big" data-ln="go" data-id="' + nx.id + '">下一課：' + esc(nx.title) + ' ▶</button>' : '') + '<button class="btn" data-ln="map">課程表</button><button class="btn" data-ln="quiz">再考一次（新題目）</button></div>'
    + (nx && !nx.ready ? '<p class="note">下一課「' + esc(nx.title) + '」還在製作中，下一批更新會上線。</p>' : '');
  else h += '<div class="lngo2"><button class="btn main big" data-ln="quiz">再試一次（新題目）▶</button><button class="btn" data-ln="practice">先多練習</button><button type="button" class="linkbtn" data-ln="reread">回去看講解</button></div>';
  return h + '</div>';
}

/* ===== 分級測驗、跳級測驗 ===== */
function startTest(mode, stage) {
  clearLnTimers();
  LN.mode = mode; LN.stage = typeof stage === 'number' ? stage : 0; LN.phase = 'intro'; LN.rng = lnRng(); LN.sec = 0; LN.kind = 'quiz';
  if (mode === 'drill') LN.drill = DRILLS.find((d) => d.id === stage) || DRILLS[0];
  showView('learn'); renderLearn(); window.scrollTo(0, 0);
}
function testHTML() {
  const isP = LN.mode === 'place', s = COURSE.find((x) => x.id === LN.stage);
  const title = isP ? '分級測驗' : LN.mode === 'drill' ? '⚡ 快答：' + LN.drill.name : LN.mode === 'review' ? '📕 錯題本' : LN.mode === 'redo' ? '📜 做過的題目・再考一次' : LN.mode === 'grad' ? '🎓 畢業考・筆試' : '第 ' + s.id + ' 階跳級測驗：' + esc(s.name);
  let h = '<div class="lnbar"><button type="button" class="btn sm" data-ln="map">← 課程表</button><div class="lnttl"><b>' + title + '</b></div></div>';
  if (LN.mode === 'drill' || LN.mode === 'review' || LN.mode === 'redo') return h + drillHTML();
  if (LN.mode === 'grad') return h + gradTestHTML();
  if (LN.phase === 'intro') {
    h += '<div class="panel lnres">' + (isP ? '<p>12 題，大約 3 分鐘：從規則、起手牌、翻牌前、數學、翻牌後、範圍到 GTO，每一階 1–2 題。</p><p>不會的直接按「不知道」，不扣分——第一個答錯的地方，就是你該開始的地方。</p>'
      : '<p>8 題，答對 7 題這一階就直接算通過（課程表上標成「已跳過」，之後還是可以回來上）。</p>')
      + '<div class="lngo2"><button class="btn main big" data-ln="tstart">開始 ▶</button></div></div>';
    return h;
  }
  if (LN.phase === 'q') return h + qHTML();
  // 結果
  const ok = LN.res.filter((r) => r.ok).length;
  if (isP) {
    const P = LN.placeRes;
    h += '<div class="panel lnres"><p class="lnbig">建議從第 ' + P.start + ' 階開始</p><p>答對 ' + ok + '／' + LN.res.length + '。各階的結果：</p><ol class="lnplace">'
      + COURSE.map((c) => { const b = P.by[c.id]; return '<li class="' + (b && b.ok === b.n ? 'ok' : 'no') + '">第 ' + c.id + ' 階 ' + esc(c.name) + '：' + (b ? b.ok + '／' + b.n : '—') + '</li>'; }).join('') + '</ol>'
      + '<div class="lngo2">' + (P.start > 1 ? '<button class="btn main big" data-ln="pstart" data-s="' + P.start + '">從第 ' + P.start + ' 階開始（前面 ' + (P.start - 1) + ' 階標成已通過）▶</button>' : '') + '<button class="btn' + (P.start > 1 ? '' : ' main big') + '" data-ln="pstart" data-s="1">從第 1 階開始</button></div>'
      + '<div class="lngo2">' + browseBtn() + '</div></div>';
    return h;
  }
  h += '<div class="panel lnres"><p class="lnbig">' + (LN.pass ? '🎉 第 ' + s.id + ' 階直接通過！' : '這一階先上課比較好') + '</p><p>答對 ' + ok + '／' + LN.res.length + '（要 7 題）。</p>'
    + '<div class="lngo2"><button class="btn main big" data-ln="map">回課程表</button>' + (LN.pass ? '' : '<button class="btn" data-ln="skip" data-s="' + s.id + '">再考一次</button>') + browseBtn() + '</div></div>';
  return h;
}
/* 畢業考的筆試 */
function gradTestHTML() {
  if (LN.phase === 'intro') return '<div class="panel lnres"><p>30 題：第 1 到第 8 階都有，照階段排；每題 <b>' + GRAD_W.sec + ' 秒</b>。答對 <b>' + GRAD_W.pass + ' 題</b>通過。</p><div class="lngo2"><button class="btn main big" data-ln="tstart">開始 ▶</button></div></div>';
  if (LN.phase === 'q') return qHTML();
  const ok = LN.res.filter((r) => r.ok).length;
  let h = '<div class="panel lnres"><p class="lnbig">' + (LP.grad && LN.justGrad ? '🎓 畢業了！' : LN.pass ? '🎉 筆試通過' : '還差一點') + '</p><p>答對 <b>' + ok + '／' + LN.res.length + '</b>（要 ' + GRAD_W.pass + ' 題）。</p>';
  const by = {}; LN.res.forEach((r, i) => { const st = LN.qs[i].stage; by[st] = by[st] || [0, 0]; by[st][1]++; if (r.ok) by[st][0]++; });
  h += '<ol class="lnplace">' + COURSE.map((c) => { const b = by[c.id]; return b ? '<li class="' + (b[0] === b[1] ? 'ok' : 'no') + '">第 ' + c.id + ' 階 ' + esc(c.name) + '：' + b[0] + '／' + b[1] + '</li>' : ''; }).join('') + '</ol>';
  h += '<div class="lngo2">' + browseBtn() + (LP.grad && LN.justGrad ? '<button class="btn main big" data-ln="cert">看結業證書 ▶</button>' : '<button class="btn main big" data-ln="lesson" data-id="8-5">回畢業考 ▶</button>') + (LN.pass ? '' : '<button class="btn" data-ln="gradw">再考一次</button>') + '</div></div>';
  return h;
}
/* 快答訓練場、錯題本 */
function drillHTML() {
  const isD = LN.mode === 'drill';
  if (LN.phase === 'intro') {
    const b = isD && LP.best[LN.drill.id];
    return '<div class="panel lnres">' + (isD ? '<p>20 題，每題 <b>' + LN.drill.sec + ' 秒</b>。目標：全部答對、越快越好。</p>' + (b ? '<p class="note">你的最好成績：' + b.ok + '／' + b.n + '，平均 ' + fmt(b.ms / 1000, 1) + ' 秒。</p>' : '')
      : LN.mode === 'redo' ? '<p>從「做過的題目」（' + esc(LN.redoName || '全部') + '）抽 ' + Math.min(10, LN.redoN || 10) + ' 題再考一次，不限時。答錯的會放進錯題本。</p>'
      : '<p>錯題本有 ' + (LP.wrong || []).length + ' 題：之前答錯的題目，一題答對兩次就會拿掉。這一次複習最舊的 ' + Math.min(15, (LP.wrong || []).length) + ' 題，不限時。</p>')
      + '<div class="lngo2"><button class="btn main big" data-ln="tstart">開始 ▶</button></div></div>';
  }
  if (LN.phase === 'q') return qHTML();
  const ok = LN.res.filter((r) => r.ok).length;
  let h = '<div class="panel lnres">';
  if (isD) h += '<p class="lnbig">' + (LN.newBest ? '🏅 新紀錄！' : '完成') + '</p><p>答對 <b>' + ok + '／' + LN.res.length + '</b>，平均每題 ' + fmt(LN.avg / 1000, 1) + ' 秒。</p>';
  else if (LN.mode === 'redo') h += '<p class="lnbig">考完了</p><p>答對 <b>' + ok + '／' + LN.res.length + '</b>。</p>';
  else h += '<p class="lnbig">複習完了</p><p>答對 <b>' + ok + '／' + LN.res.length + '</b>。錯題本還有 ' + (LP.wrong || []).length + ' 題。</p>';
  h += '<div class="lngo2"><button class="btn main big" data-ln="' + (isD ? 'drill" data-d="' + LN.drill.id : LN.mode === 'redo' ? 'redo' : 'review') + '">再一次 ▶</button>' + browseBtn() + '<button class="btn" data-ln="' + (LN.mode === 'redo' ? 'hist' : 'map') + '">' + (LN.mode === 'redo' ? '做過的題目' : '課程表') + '</button></div></div>';
  return h;
}
function testStart() {
  if (LN.mode === 'drill') { LN.qs = makeQuiz(LN.drill.gens, 20, LN.rng); LN.sec = LN.drill.sec; }
  else if (LN.mode === 'review') { LN.qs = wrongSession(LP, LN.rng); LN.sec = 0; if (!LN.qs.length) { openLearn('map'); return; } }
  else if (LN.mode === 'grad') { LN.qs = makeGradQuiz(LN.rng); LN.sec = GRAD_W.sec; }
  else if (LN.mode === 'redo') { LN.qs = histSession(histList(LP, LN.redoF), 10, LN.rng); LN.sec = 0; if (!LN.qs.length) { openLearn('hist'); return; } }
  else if (LN.mode === 'place') {
    LN.qs = makePlacement(LN.rng);
    for (const q of LN.qs) q.opts.push({ t: '不知道', ok: false });
  } else {
    const gens = STAGE_GENS[LN.stage];
    LN.qs = makeQuiz(gens, 8, LN.rng);
    for (const q of LN.qs) q.stage = LN.stage;
  }
  LN.qi = 0; LN.res = []; LN.answered = false; LN.phase = 'q'; LN.vi = null; LN.browsing = false;
  renderLearn(); window.scrollTo(0, 0); startQTimer();
}

/* ===== 題目的圖 ===== */
function visHTML(v) {
  if (!v) return '';
  if (v.k === 'hand') return '<div class="lnvis">' + (v.hole.length ? '<div class="lnrow"><span class="lbl">你的牌</span>' + v.hole.map((c) => cardHTML(c)).join('') + '</div>' : '') + (v.board && v.board.length ? '<div class="lnrow"><span class="lbl">公牌</span>' + v.board.map((c) => cardHTML(c, 'sm')).join('') + '</div>' : '') + '</div>';
  if (v.k === 'two') return '<div class="lnvis"><div class="lnrow"><span class="lbl">A</span>' + v.a.map((c) => cardHTML(c, 'sm')).join('') + '<span class="lbl">B</span>' + v.b.map((c) => cardHTML(c, 'sm')).join('') + '</div><div class="lnrow"><span class="lbl">公牌</span>' + v.board.map((c) => cardHTML(c, 'sm')).join('') + '</div></div>';
  if (v.k === 'cls') return '<div class="lnvis"><div class="lnrow">' + (v.pos ? '<span class="lbl">' + esc(v.pos) + '</span>' : '') + classCards(v.g).map((c) => cardHTML(c)).join('') + '<span class="lnname">' + esc(NAMEZH(v.g)) + '<small>' + esc(clsWords(v.g)) + '</small></span></div></div>';
  if (v.k === 'cls2') return '<div class="lnvis lnpair">' + [v.a, v.b].map((g) => '<div class="lnrow">' + classCards(g).map((c) => cardHTML(c, 'sm')).join('') + '<span class="lnname">' + esc(NAMEZH(g)) + '</span></div>').join('<span class="vs">vs</span>') + '</div>';
  if (v.k === 'seats') return seatsHTML(v.n, v.btn, v.hero, false);
  if (v.k === 'hands3') return '<div class="lnvis">' + v.hs.map((h, i) => '<div class="lnrow"><span class="lbl">第 ' + (i + 1) + ' 手</span>' + h.map((c) => cardHTML(c, 'sm')).join('') + '</div>').join('') + '<div class="lnrow"><span class="lbl">公牌</span>' + v.board.map((c) => cardHTML(c, 'sm')).join('') + '</div></div>';
  if (v.k === 'flops') return '<div class="lnvis">' + v.fs.map((b, i) => '<div class="lnrow"><span class="lbl">第 ' + (i + 1) + ' 個</span>' + b.map((c) => cardHTML(c, 'sm')).join('') + '</div>').join('') + '</div>';
  return '';
}
/* 座位圖：順時針，D 是按鈕；label＝標位置名稱 */
function seatsHTML(n, btn, hero, label) {
  const W = 300, H = 190, cx = W / 2, cy = H / 2, rx = 120, ry = 70;
  const codes = posCodes(n);
  let s = '<svg class="lnseats" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + n + ' 人桌座位圖"><ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx - 28) + '" ry="' + (ry - 22) + '" class="felt"/>';
  for (let i = 0; i < n; i++) {
    const th = Math.PI / 2 + 2 * Math.PI * i / n, x = cx + rx * Math.cos(th), y = cy + ry * Math.sin(th);
    const code = codes[(i - btn + n) % n], me = i === hero;
    s += '<g class="lseat' + (me ? ' me' : '') + '"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="16"/><text x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) + '">' + (me ? '★' : label ? '' : SEAT_L[i]) + '</text>';
    if (label) s += '<text class="pl" x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) + '">' + (n === 2 && code === 'BTNSB' ? '按鈕' : POS_ZH[code]) + '</text>';
    if (i === btn) { const dx = cx + (rx - 34) * Math.cos(th), dy = cy + (ry - 26) * Math.sin(th); s += '<circle class="dbtn" cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="9"/><text class="dt" x="' + dx.toFixed(1) + '" y="' + (dy + 4).toFixed(1) + '">D</text>'; }
    s += '</g>';
  }
  return '<div class="lnvis">' + s + '</svg></div>';
}

/* ===== 講解的區塊 ===== */
function blockHTML(b) {
  if (typeof b === 'string') return '<p>' + glossify(richH(b)) + '</p>';
  if (b.k === 'tip') return '<div class="lntip">' + richH(b.html) + '</div>';
  if (b.k === 'cats') return '<table class="lncats"><thead><tr><th>牌型</th><th>例子</th><th class="r">打到河牌</th></tr></thead><tbody>' + CARD_CATS.map(([c, cs, name, note, p]) => '<tr><td><b>' + name + '</b><small>' + esc(note) + '</small></td><td class="cs">' + parseCards(cs).map((x) => cardSpan(x)).join('') + '</td><td class="r num">' + (p < 0.1 ? p.toFixed(2) : p < 1 ? p.toFixed(1) : p.toFixed(1)) + '%</td></tr>').join('') + '</tbody></table>';
  if (b.k === 'seats') return seatsHTML(b.n, b.btn, -1, b.label);
  if (b.k === 'grid') return tierGridHTML('lnGridR') + tierLegend();
  if (b.k === 'tier') return tierBlockHTML(b.t);
  if (b.k === 'chart') return chartBlockHTML(b.key, b.title);
  if (b.k === 'defStats') return defStatsHTML();
  if (b.k === 'betTable') return '<table class="stt lnt"><tr><th>對手下注</th><th class="r">勝率至少要</th></tr>' + BET_FR.map(([a, c, t]) => { const f = a / c; return '<tr><td>' + t + '</td><td class="r num"><b>' + Math.round(f / (1 + 2 * f) * 100) + '%</b></td></tr>'; }).join('') + '</table>';
  if (b.k === 'outsTable') return '<table class="stt lnt"><tr><th>出牌</th><th class="r">翻牌→河牌<br><small>心算／實際</small></th><th class="r">轉牌→河牌<br><small>心算／實際</small></th></tr>' + [2, 4, 6, 8, 9, 12, 15].map((n) => '<tr><td>' + n + ' 張</td><td class="r num">' + (n * 4 - Math.max(0, n - 8)) + '%／' + Math.round(exactHit(n, 1) * 100) + '%</td><td class="r num">' + n * 2 + '%／' + Math.round(exactHit(n, 2) * 100) + '%</td></tr>').join('') + '</table>';
  if (b.k === 'pushTable') return '<div class="tscroll"><table class="stt lnt"><tr><th>位置＼籌碼</th>' + PUSH_BB.map((x) => '<th class="r">' + x + ' 大盲</th>').join('') + '</tr>' + [5, 4, 3, 2, 1].map((B) => '<tr><td>' + PUSH_POS[B] + '</td>' + PUSH_BB.map((x) => '<td class="r num">' + Math.round(pushPct(x, B) * 100) + '%</td>').join('') + '</tr>').join('') + '</table></div><p class="note">數字是「前百分之幾的牌全下」（6 人桌，前面都棄牌）。</p>';
  if (b.k === 'cats2') return '<table class="lncats"><thead><tr><th>牌力</th><th>例子（手牌｜公牌）</th></tr></thead><tbody>' + CATG_GRP.map(([cs, gn]) => '<tr class="lngrp"><td colspan="2">' + esc(gn) + '</td></tr>' + cs.map((c) => '<tr><td><b>' + CATG[c] + '</b><small>' + esc(CATG_NOTE[c]) + '</small></td><td class="cs">' + parseCards(CATG_EX[c][0]).map((x) => cardSpan(x)).join('') + '｜' + parseCards(CATG_EX[c][1]).map((x) => cardSpan(x)).join('') + '</td></tr>').join('')).join('') + '</tbody></table>';
  if (b.k === 'radvTable') return '<div class="tscroll"><table class="stt lnt lnradv"><tr><th>翻牌</th><th class="r">按鈕勝率</th><th class="r">兩對以上<br><small>按鈕／大盲</small></th></tr>' + RANGE_ADV.slice().sort((x, y) => y[1] - x[1]).map(([f, e, nb, nbb]) => '<tr><td class="cs">' + parseCards(f).map((x) => cardSpan(x)).join('') + '</td><td class="r num"><span class="' + (e >= 0.535 ? 'rz' : e <= 0.505 ? 'cz' : '') + '">' + Math.round(e * 100) + '%</span></td><td class="r num">' + (nb > nbb ? '<b>' + pct(nb, 1) + '%</b>' : pct(nb, 1) + '%') + '／' + (nbb > nb ? '<b>' + pct(nbb, 1) + '%</b>' : pct(nbb, 1) + '%') + '</td></tr>').join('') + '</table></div><p class="note">照 6 人桌圖表的範圍（按鈕開牌、大盲跟注）一手一手算到攤牌。紅＝按鈕明顯有利，綠＝接近或大盲有利；粗體＝那一邊的大牌比較多。</p>';
  if (b.k === 'gtoTable') return '<table class="stt lnt"><tr><th>對手下注</th><th class="r">跟注要的勝率<br><small>＝他的下注裡詐唬可以佔</small></th><th class="r">你最少要繼續</th></tr>' + BET_FR.map(([a, c, t]) => { const f = a / c; return '<tr><td>' + t + '</td><td class="r num"><b>' + Math.round(f / (1 + 2 * f) * 100) + '%</b></td><td class="r num">' + Math.round(100 / (1 + f)) + '%</td></tr>'; }).join('') + '</table>';
  if (b.k === 'polarTable') return '<div class="tscroll"><table class="stt lnt lnpolar"><tr><th>勝率</th>' + GTO_RIVER.map((S) => '<th class="r cs">' + S.board.slice(0, 3).map((c) => cardSpan(c)).join('') + '<br>' + S.board.slice(3).map((c) => cardSpan(c)).join('') + '</th>').join('') + '</tr>' + [9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((i) => '<tr><td>' + i * 10 + '–' + (i + 1) * 10 + '%</td>' + GTO_RIVER.map((S) => { const x = S.bk[i]; return x < 0 ? '<td class="r note">—</td>' : '<td class="r num" style="background:rgba(201,70,46,' + (x / 100 * 0.75).toFixed(2) + ')">' + x + '%</td>'; }).join('') + '</tr>').join('') + '<tr><td><b>整體</b></td>' + GTO_RIVER.map((S) => '<td class="r num"><b>' + S.ip + '%</b></td>').join('') + '</tr></table></div><p class="note">每一格＝那一組牌平均下注多少（紅色越深下注越多）。最上面（最強）和最下面（最弱）都下注，中間幾乎都過牌。</p>';
  if (b.k === 'studio') return '<div class="lngo2"><button class="btn" data-ln="studio">打開 GTO 工作室：河牌範例 ▶</button></div>';
  if (b.k === 'openDiff') return '<ol class="lndiff">' + openDiffs(b.t).map((d) => '<li><b>' + esc(POS_ZH[d.pos]) + '</b><span class="note">（開 ' + Math.round(d.pct * 100) + '%）</span>' + (d.pos === 'UTG' ? '：' : '：多開 ') + d.add.map((g) => '<button type="button" class="lnh t' + HAND_TIER[g] + '" data-ln="hand" data-g="' + g + '">' + NAMEZH(g) + '</button>').join('') + '</li>').join('') + '</ol>';
  return '';
}
/* 一張圖表的 13×13（紅＝加注、綠＝跟注）＋範圍文字 */
function chartBlockHTML(key, title) {
  const R = chartRanges(key), T = chartText(key);
  if (!R) return '';
  let h = '<div class="lnchart"><div class="lnct"><b>' + esc(title || key) + '</b>', sr = 0, sc = 0;
  for (let k = 0; k < NCOMBO; k++) { sr += R.raise[k]; sc += R.call[k]; }
  h += '<span class="note">　' + (sc > 0.5 ? '加注 ' + pct(sr / NCOMBO, 0) + '%、跟注 ' + pct(sc / NCOMBO, 0) + '%' : '開 ' + pct(sr / NCOMBO, 0) + '%') + '</span></div><div class="grid13 lncg">';
  for (let g = 0; g < 169; g++) {
    const cs = CLASS_COMBOS[g]; let r = 0, c = 0;
    for (const k of cs) { r += R.raise[k]; c += R.call[k]; }
    r = r / cs.length * 100; c = c / cs.length * 100;
    const bg = r + c < 0.5 ? '' : 'background:linear-gradient(90deg,#c9462e ' + r.toFixed(0) + '%,#3f9d6a ' + r.toFixed(0) + '% ' + (r + c).toFixed(0) + '%,#1c2a25 ' + (r + c).toFixed(0) + '%)';
    h += '<button type="button" class="cell" data-ln="hand" data-g="' + g + '" style="' + bg + '"><span>' + className(g) + '</span></button>';
  }
  h += '</div><p class="note lnrt">' + (T.raise ? (sc > 0.5 ? '加注：' : '') + esc(T.raise) : '') + (T.call ? '<br>跟注：' + esc(T.call) : '') + '</p></div>';
  return h;
}
function defStatsHTML() {
  const rows = [['BB', 'EP'], ['BB', 'CO'], ['BB', 'BTN'], ['BB', 'SB'], ['SB', 'BTN'], ['IP', 'EP'], ['IP', 'CO']];
  return '<table class="stt lnt"><tr><th>6 人桌</th><th class="r">3-bet</th><th class="r">跟注</th></tr>' + rows.map(([d, o]) => {
    const R = chartRanges('6/vsOpen/' + d + '/' + o); if (!R) return '';
    let r = 0, c = 0; for (let k = 0; k < NCOMBO; k++) { r += R.raise[k]; c += R.call[k]; }
    return '<tr><td>' + DEFENDER_ZH[d].replace('（非盲注）', '') + '面對' + openerZh('6', o) + '</td><td class="r num">' + pct(r / NCOMBO, 0) + '%</td><td class="r num">' + pct(c / NCOMBO, 0) + '%</td></tr>';
  }).join('') + '</table>';
}
function tierLegend() { return '<div class="lnleg">' + [1, 2, 3, 4, 5].map((t) => '<span><i style="background:' + TIER_COL[t] + '"></i>' + TIER_NAME[t] + '</span>').join('') + '</div>'; }
function tierGridHTML(id, sel) {
  let h = '<div class="grid13 lngrid" id="' + id + '">';
  for (let g = 0; g < 169; g++) h += '<button type="button" class="cell t' + HAND_TIER[g] + (g === sel ? ' sel' : '') + '" data-ln="hand" data-g="' + g + '" title="' + NAMEZH(g) + '：第 ' + PRE_RANK[g] + ' 名，' + TIER_NAME[HAND_TIER[g]] + '"><span>' + className(g) + '</span></button>';
  return h + '</div>';
}
/* 一層：照強度順序，一手一張卡 */
function tierBlockHTML(t) {
  const hs = tierHands(t);
  let combos = 0; for (const g of hs) combos += classSize(g);
  let h = '<p><b>' + TIER_NAME[t] + '</b>：' + hs.length + ' 種起手牌、' + combos + ' 個組合（全部的 ' + pct(combos / NCOMBO, 1) + '%）。' + esc(TIER_NOTE[t]) + '</p>';
  if (t === 5) {
    const mg = hs.filter((g) => isMarginal(g)), tr = hs.filter((g) => !isMarginal(g));
    h += '<h4 class="lnh4">邊緣（' + mg.length + ' 種）：後面的位置沒人加注時才開</h4><div class="lnchips">' + mg.map((g) => { const i = handInfo(g); return '<button type="button" class="lnh t5" data-ln="hand" data-g="' + g + '">' + NAMEZH(g) + '<small>' + esc(POS_ZH[i.early6] || '') + '起</small></button>'; }).join('') + '</div>';
    h += '<p class="note">「起」＝6 人桌從這個位置開始開。這些牌點開都有說明；最常見的虧錢牌是不同花的弱 A（' + ['A9o', 'A8o', 'A5o'].map((n) => NAMEZH(classByName(n))).join('、') + '）。</p>';
    h += '<h4 class="lnh4">垃圾（' + tr.length + ' 種）：幾乎永遠棄牌</h4><div class="lnchips">' + tr.map((g) => '<button type="button" class="lnh t5 tr" data-ln="hand" data-g="' + g + '">' + NAMEZH(g) + '</button>').join('') + '</div>';
    return h;
  }
  h += '<ol class="lnhands">';
  for (const g of hs) {
    const i = handInfo(g);
    h += '<li><button type="button" class="lnhand" data-ln="hand" data-g="' + g + '"><span class="hc">' + classCards(g).map((c) => cardHTML(c, 'sm')).join('') + '</span><span class="hb"><b>' + NAMEZH(g) + '</b><span class="note">　第 ' + i.rank + ' 名・對 1 家 ' + pct(i.eq1, 0) + '%・對 3 家 ' + pct(i.eq3, 0) + '%</span><br><span class="hl">' + esc(openLine(i)) + '</span>' + (i.note ? '<br>' + esc(i.note) : '') + '</span></button></li>';
  }
  return h + '</ol>';
}

/* ===== 起手牌字典 ===== */
function dictHTML() {
  const g = LN.dictG;
  let h = '<div class="lnbar"><button type="button" class="btn sm" data-ln="map">← 課程表</button><div class="lnttl"><b>起手牌字典</b><span class="note">169 種起手牌：點一格看詳細；照強度排名可以一直往下看</span></div></div>';
  h += '<div class="lndict"><div class="panel">' + tierGridHTML('lnGrid', g) + tierLegend() + '</div><div class="panel" id="lnDictDetail">' + handDetailHTML(g) + '</div></div>';
  return h;
}
function freqChip(pos, f) { const c = f >= 0.75 ? 'y' : f >= 0.25 ? 'm' : 'n'; return '<span class="fc ' + c + '">' + esc(POS_ZH[pos] || pos) + (f > 0 && f < 0.99 ? ' ' + Math.round(f * 100) + '%' : '') + '</span>'; }
function topPct(i) { const x = i.pct + i.combos / NCOMBO / 2; return x < 0.1 ? pct(x, 1) : pct(x, 0); }
function handDetailHTML(g) {
  const i = handInfo(g), ord = rankOrder(), k = i.rank - 1, prev = k > 0 ? ord[k - 1] : -1, next = k < 168 ? ord[k + 1] : -1;
  let h = '<div class="hdtop"><span class="hc">' + classCards(g).map((c) => cardHTML(c)).join('') + '</span><div><h3>' + NAMEZH(g) + '<small>' + (i.name.length === 2 ? '口袋對子' : i.name[2] === 's' ? '同花' : '不同花') + '</small></h3><p><b>第 ' + i.rank + ' 名</b>（前 ' + topPct(i) + '%）・<span class="tierb t' + i.tier + '">' + TIER_NAME[i.tier] + (i.tier === 5 ? (i.marginal ? '：邊緣' : '：垃圾') : '') + '</span>・' + i.combos + ' 個組合</p></div></div>';
  h += '<table class="stt"><tr><td>對 1 家隨機牌</td><td class="r num"><b>' + pct(i.eq1, 1) + '%</b></td></tr><tr><td>對 3 家隨機牌</td><td class="r num">' + pct(i.eq3, 1) + '%</td></tr><tr><td>對「前 22% 的好牌」</td><td class="r num">' + pct(i.eqTop22, 1) + '%</td></tr><tr><td>對「前 10% 的強牌」</td><td class="r num">' + pct(i.eqTop10, 1) + '%</td></tr></table>';
  h += '<h4 class="lnh4">沒人加注時開不開</h4><p class="hl">' + esc(openLine(i)) + '</p><div class="fcs"><span class="note">6 人桌</span>' + i.r6.map((x) => freqChip(x.pos, x.f)).join('') + '</div><div class="fcs"><span class="note">9 人桌</span>' + i.r9.map((x) => freqChip(x.pos, x.f)).join('') + '</div>';
  const row = (lbl, x) => (x ? '<tr><td>' + lbl + '</td><td class="r num">' + (x.r > 0.004 ? '<span class="rz">3-bet ' + Math.round(x.r * 100) + '%</span> ' : '') + (x.c > 0.004 ? '<span class="cz">跟 ' + Math.round(x.c * 100) + '%</span> ' : '') + (x.f > 0.004 ? '<span class="fz">棄 ' + Math.round(x.f * 100) + '%</span>' : '') + '</td></tr>' : '');
  h += '<h4 class="lnh4">面對加注（6 人桌）</h4><table class="stt">' + i.def.map((d) => row(DEFENDER_ZH[d.d].replace('（非盲注）', '') + '面對' + openerZh('6', d.o) + '開牌', d.x)).join('') + '</table>';
  h += '<h4 class="lnh4">你開牌後被 3-bet（6 人桌）</h4><table class="stt">' + i.v3.map((d) => row('從' + openerZh('6', d.o) + '開牌', d.x && { r: d.x.r, c: d.x.c, f: d.x.f })).join('').replace(/3-bet/g, '4-bet') + '</table>';
  h += '<h4 class="lnh4">怎麼打</h4>' + (i.note ? '<p>' + esc(i.note) + '</p>' : '') + '<p class="note">' + esc(TIER_NAME[i.tier]) + '：' + esc(i.tierNote) + '</p>';
  h += '<div class="lngo2 hdnav">' + (prev >= 0 ? '<button class="btn" data-ln="hand" data-g="' + prev + '">◀ 第 ' + (i.rank - 1) + ' 名 ' + NAMEZH(prev) + '</button>' : '') + (next >= 0 ? '<button class="btn" data-ln="hand" data-g="' + next + '">第 ' + (i.rank + 1) + ' 名 ' + NAMEZH(next) + ' ▶</button>' : '') + '</div>';
  return h;
}
/* 上課時點一手牌：用視窗看，不離開課程 */
function openHandModal(g) {
  $('lnModalBody').innerHTML = handDetailHTML(g);
  $('lnModal').hidden = false; $('lnModalClose').focus();
}

/* ===== 首頁卡片 ===== */
function renderLearnHome() {
  if (!LP) lpLoad();
  const c = learnCount(LP), nx = learnNext(LP);
  $('hLearnTxt').textContent = LP.grad ? '🎓 已畢業（筆試 ' + LP.grad.w + '／' + LP.grad.wn + '、實戰 ' + LP.grad.p + '%）：可以回去複習、做快答、看證書。' : c.done ? '已完成 ' + c.done + '／' + c.total + ' 課' + (nx ? '，下一課：' + nx.title : '') : '八階課程，從規則練到 GTO；可以先做分級測驗找起點。';
  $('bLearn').textContent = c.done ? '繼續上課 ▶' : '開始 ▶';
}

function initLearn() {
  lpLoad();
  if (/[?&]lntest/.test(location.search)) { window.__LN = LN; window.__G = G; window.__GT = GT; }          // 自動測試用
  $('nLearn').addEventListener('click', () => { const l = LN.ret; LN.ret = null; if (l && $('vLearn').hidden) openLearn('lesson', l); else openLearn('map'); });   // 從某一課打開工作室或考核：按「大師之路」回到那一課
  $('bLearn').addEventListener('click', () => openLearn('map'));
  $('lnModalClose').addEventListener('click', () => { $('lnModal').hidden = true; });
  $('lnModal').addEventListener('click', (e) => {
    if (e.target === $('lnModal')) { $('lnModal').hidden = true; return; }
    const b = e.target.closest('[data-ln="hand"]');
    if (b) { $('lnModalBody').innerHTML = handDetailHTML(+b.dataset.g); $('lnModal').querySelector('.mbox').scrollTop = 0; }
  });
  let certT = 0;
  $('lnRoot').addEventListener('change', (e) => { if (e.target.id === 'lnHistHide') { LP.histHide = e.target.checked; LN.hshow = false; lpSave(); renderLearn(); } });
  $('lnRoot').addEventListener('input', (e) => { if (e.target.id === 'lnCertName') { LP.name = e.target.value.slice(0, 16); clearTimeout(certT); certT = setTimeout(() => { lpSave(); drawCert(); }, 350); } });
  $('lnRoot').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ln]');
    if (!b) return;
    const a = b.dataset.ln;
    if (a === 'map') openLearn('map');
    else if (a === 'go' || a === 'lesson') { const l = lessonById(b.dataset.id); if (l && l.ready) openLearn('lesson', l); }
    else if (a === 'practice') startQs('practice');
    else if (a === 'exam') { const l = lessonById(b.dataset.id); if (l && l.exam) { LN.ret = l; newGame('exam', l.exam); } }
    else if (a === 'gradw') startTest('grad');
    else if (a === 'resume') { LN.ret = LN.lesson; showView('table'); G.lastRender = null; renderCur(); scheduleAuto(); }
    else if (a === 'cert') openLearn('cert');
    else if (a === 'studio') LN.ret = LN.lesson, studioLoad(presetSpot('river'), '大師之路 8-3：河牌範例（K♦5♣6♥9♥2♦，大盲跟注 vs 按鈕開牌的範圍）。算完點格子看每一種牌怎麼打；看完按上面的「大師之路」回課程。', true);
    else if (a === 'quiz') startQs('quiz');
    else if (a === 'reread') { clearLnTimers(); LN.phase = 'read'; renderLearn(); window.scrollTo(0, 0); }
    else if (a === 'ans') answerQ(+b.dataset.i);
    else if (a === 'next') nextQ();
    else if (a === 'qprev') qNav(-1);
    else if (a === 'qnext') qNav(1);
    else if (a === 'browse') { clearLnTimers(); LN.browsing = true; LN.vi = 0; renderLearn(); window.scrollTo(0, 0); }
    else if (a === 'unbrowse') { LN.browsing = false; LN.vi = null; renderLearn(); window.scrollTo(0, 0); }
    else if (a === 'hist') { openLearn('hist'); LN.hi = 0; LN.hshow = false; renderLearn(); }
    else if (a === 'hf') { const f = b.dataset.f; LN.hf = /^\d+$/.test(f) ? +f : f; LN.hi = 0; LN.hshow = false; renderLearn(); }
    else if (a === 'hprev') histGo(-1);
    else if (a === 'hnext') histGo(1);
    else if (a === 'hshow') { LN.hshow = true; renderLearn(); }
    else if (a === 'redo') { const f = LN.mode === 'hist' ? (LN.hf === undefined ? 'all' : LN.hf) : LN.redoF; const nm = (histFilters().find((x) => x[0] === f) || [0, '全部'])[1]; startTest('redo'); LN.redoF = f; LN.redoName = nm; LN.redoN = new Set(histList(LP, f).map((y) => y.q.key)).size; renderLearn(); }
    else if (a === 'dict') openLearn('dict');
    else if (a === 'place') startTest('place');
    else if (a === 'skip') startTest('skip', +b.dataset.s);
    else if (a === 'drill') startTest('drill', b.dataset.d);
    else if (a === 'review') startTest('review');
    else if (a === 'tstart') testStart();
    else if (a === 'pstart') {                                    // 分級的起點：換掉上一次分級標的「已通過」，跳級測驗過的保留
      const s = +b.dataset.s, ts = LP.tskip || {};
      LP.place = { start: s, at: Date.now() };
      for (const k of Object.keys(LP.pskip || {})) if (!ts[k]) delete LP.skip[k];
      LP.pskip = {};
      for (let k = 1; k < s; k++) { LP.skip[k] = true; LP.pskip[k] = true; }
      lpSave(); openLearn('map');
    }
    else if (a === 'hand') {
      const g = +b.dataset.g;
      if (LN.mode === 'dict') { LN.dictG = g; LN.dictScroll = true; renderLearn(); }
      else openHandModal(g);
    }
  });
  // 鍵盤：1–5 選答案，Enter／空白／→ 下一題
  document.addEventListener('keydown', (e) => {
    if ($('vLearn').hidden || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea,select')) return;
    if (!$('lnModal').hidden) { if (e.key === 'Escape') $('lnModal').hidden = true; return; }
    if (document.querySelector('.modal:not([hidden])')) return;          // 其他視窗開著（牌型、統計）：不要答到後面的題目
    if (LN.mode === 'hist') { if (e.key === 'ArrowLeft') { e.preventDefault(); histGo(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); histGo(1); } return; }
    if (LN.vi !== null && LN.vi !== undefined) {                   // 回頭看：只能換題
      if (e.key === 'ArrowLeft') { e.preventDefault(); qNav(-1); } else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); qNav(1); }
      return;
    }
    const inQ = (LN.mode === 'lesson' && (LN.phase === 'practice' || LN.phase === 'quiz')) || (['place', 'skip', 'drill', 'review', 'grad', 'redo'].indexOf(LN.mode) >= 0 && LN.phase === 'q');
    if (!inQ) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); qNav(-1); return; }
    if (!LN.answered && /^[1-6]$/.test(e.key)) { const i = +e.key - 1; if (LN.qs[LN.qi] && i < LN.qs[LN.qi].opts.length) { e.preventDefault(); answerQ(i); } }
    else if (LN.answered && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) { e.preventDefault(); nextQ(); }
  });
  renderLearnHome();
}
