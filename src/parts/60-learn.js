/* ===== 60-learn：大師之路（課程表、上課、練習、測驗、分級、跳級、起手牌字典） ===== */
const LN_KEY = 'dezhou-learn-1';
let LP = null;                                                 // 進度（存在這台裝置）
const LN = { mode: 'map', lesson: null, phase: 'read', qs: [], qi: 0, res: [], answered: false, timer: 0, t0: 0, sec: 0, rng: null, kind: '', stage: 0, dictG: -1, autoT: 0 };
function lpLoad() { try { LP = Object.assign(learnBlank(), JSON.parse(localStorage.getItem(LN_KEY) || 'null') || {}); } catch (e) { LP = learnBlank(); } }
function lpSave() { try { localStorage.setItem(LN_KEY, JSON.stringify(LP)); } catch (e) { /* 存不了也能上課 */ } }
const lnRng = () => makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
const TIER_COL = ['', '#c9462e', '#d98a2b', '#c9b13a', '#3f9d6a', '#3b5a50'];
/* 課程文字是程式裡寫好的（可信），可以有 <b> 等標記；只把 {c數字} 換成牌 */
const richH = (s) => String(s).replace(/\{c(\d+)\}/g, (m, c) => cardSpan(+c));

/* ===== 畫面切換 ===== */
function openLearn(mode, arg) {
  clearLnTimers();
  LN.mode = mode || 'map';
  if (LN.mode === 'lesson') { LN.lesson = arg; LN.phase = 'read'; }
  if (LN.mode === 'dict') LN.dictG = arg === undefined ? (LN.dictG >= 0 ? LN.dictG : 0) : arg;
  showView('learn');
  renderLearn();
  window.scrollTo(0, 0);
}
function clearLnTimers() { clearInterval(LN.timer); clearTimeout(LN.autoT); LN.timer = 0; LN.autoT = 0; }
function renderLearn() {
  const R = $('lnRoot');
  if (LN.mode === 'map') R.innerHTML = mapHTML();
  else if (LN.mode === 'lesson') R.innerHTML = lessonHTML();
  else if (LN.mode === 'dict') { R.innerHTML = dictHTML(); }
  else if (LN.mode === 'place' || LN.mode === 'skip') R.innerHTML = testHTML();
  if (LN.mode === 'dict' && LN.dictScroll) { LN.dictScroll = false; const d = $('lnDictDetail'); if (d && window.innerWidth < 900) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ===== 課程表 ===== */
const SKIP_OK = {};
function canSkipTest(sid) { if (!(sid in SKIP_OK)) SKIP_OK[sid] = !!STAGE_GENS[sid] && makeQuiz(STAGE_GENS[sid], 8, makeRng(1)).length >= 8; return SKIP_OK[sid]; }
function mapHTML() {
  const c = learnCount(LP), nx = learnNext(LP);
  let h = '<div class="lnhead"><h2>大師之路</h2><p class="note">從規則到 GTO 分八階，每一課：短講解 → 練習 → 過關測驗。進度存在這台裝置，隨時接著上。</p>'
    + '<div class="lnprog"><div class="track"><i style="width:' + (c.done / c.total * 100).toFixed(1) + '%"></i></div><span class="num">' + c.done + '／' + c.total + ' 課</span></div>';
  if (nx) h += '<button class="btn main big lngo" data-ln="go" data-id="' + nx.id + '">' + (c.done ? '繼續' : '開始') + '：第 ' + nx.stage + ' 階・' + esc(nx.title) + ' ▶</button>' + (nx.ready ? '' : '<p class="note">這一課還在製作中（下一批更新），可以先做下面的練習、查起手牌字典，或用跳級測驗往後走。</p>');
  else h += '<p class="lndone">🏆 全部完成！</p>';
  h += '<div class="strow"><button class="btn" data-ln="place">' + (LP.place ? '重新做分級測驗' : '分級測驗：找到你的起點（12 題）') + '</button><button class="btn" data-ln="dict">起手牌字典（169 手）</button></div>';
  if (LP.place) h += '<p class="note">分級測驗建議從第 ' + LP.place.start + ' 階開始。</p>';
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
        + (l.ready ? (sc ? '<span class="ls num">' + sc.s + '／' + sc.n + '</span>' : '') : '<span class="ls">製作中</span>') + (l.ready ? '</button>' : '</span>') + '</li>';
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
      + '<div class="lngo2"><button class="btn main big" data-ln="quiz">開始過關測驗 ▶</button><button class="btn" data-ln="practice">再練一次</button><button type="button" class="linkbtn" data-ln="reread">回去看講解</button></div></div>';
  } else if (LN.phase === 'result') h += resultHTML();
  return h;
}
function startQs(kind) {
  const l = LN.lesson;
  clearLnTimers();
  LN.rng = lnRng(); LN.kind = kind; LN.phase = kind;
  const cfg = kind === 'practice' ? l.practice : l.quiz;
  LN.qs = makeQuiz(cfg.gens, cfg.n, LN.rng); LN.qi = 0; LN.res = []; LN.answered = false;
  LN.sec = kind === 'quiz' ? (cfg.sec || 0) : 0;
  renderLearn(); startQTimer();
  window.scrollTo(0, 0);
}
/* 題目畫面（上課、分級、跳級共用） */
function qHTML() {
  const q = LN.qs[LN.qi], n = LN.qs.length, ok = LN.res.filter((r) => r.ok).length;
  let h = '<div class="panel lnq"><div class="lnqtop"><span class="num">第 ' + (LN.qi + 1) + '／' + n + ' 題</span><span class="num">✓ ' + ok + '</span></div>';
  if (LN.sec) h += '<div class="lntime"><i id="lnTimeBar"></i></div>';
  h += '<p class="lnprompt">' + richH(q.prompt) + '</p>' + visHTML(q.vis);
  const r = LN.answered ? LN.res[LN.res.length - 1] : null;
  h += '<div class="lnopts' + (q.opts.length > 3 ? ' many' : '') + '">' + q.opts.map((o, i) => {
    let cls = '';
    if (r) cls = o.ok ? ' right' : r.pick === i ? ' wrong' : ' dim';
    return '<button type="button" class="lnopt' + cls + '" data-ln="ans" data-i="' + i + '"' + (r ? ' disabled' : '') + '><span class="k">' + (i + 1) + '</span>' + esc(o.t) + '</button>';
  }).join('') + '</div>';
  if (r) {
    h += '<div class="lnfb ' + (r.ok ? 'ok' : 'no') + '"><b>' + (r.ok ? '✓ 對了' : r.timeout ? '⏰ 時間到' : '✗ 不對') + '</b>　' + richH(q.explain) + '</div>'
      + '<div class="lngo2"><button class="btn main" id="lnNext" data-ln="next">' + (LN.qi + 1 < n ? '下一題 ▶' : '看結果 ▶') + '</button></div>';
  }
  return h + '</div>';
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
  renderLearn();
  const nb = $('lnNext');
  if (nb) nb.focus({ preventScroll: true });
  if (ok) LN.autoT = setTimeout(nextQ, LN.sec ? 900 : 1600);        // 答對自動下一題；答錯讓你看完解釋再按
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
  if (LN.mode === 'skip') { LN.pass = ok >= 7; if (LN.pass) { LP.skip[LN.stage] = true; lpSave(); } LN.phase = 'result'; renderLearn(); window.scrollTo(0, 0); }
}
function resultHTML() {
  const ok = LN.res.filter((r) => r.ok).length, l = LN.lesson;
  const timed = LN.res.filter((r) => r.ms > 0), avg = timed.length ? timed.reduce((a, r) => a + r.ms, 0) / timed.length / 1000 : 0;
  let h = '<div class="panel lnres"><p class="lnbig">' + (LN.pass ? '🎉 過關！' : '還差一點') + '</p><p>答對 <b>' + ok + '／' + LN.res.length + '</b>（要 ' + l.quiz.pass + ' 題）' + (avg ? '，平均每題 ' + fmt(avg, 1) + ' 秒' : '') + '。</p>';
  const wrong = LN.res.map((r, i) => (r.ok ? null : LN.qs[i])).filter(Boolean);
  if (wrong.length) h += '<details class="lnwrong"><summary>看答錯的 ' + wrong.length + ' 題</summary>' + wrong.map((q) => '<div class="lnw"><p>' + richH(q.prompt) + '</p><p class="note">答案：' + esc(q.opts.find((o) => o.ok).t) + '。' + richH(q.explain) + '</p></div>').join('') + '</details>';
  const nx = learnNext(LP);
  if (LN.pass) h += '<div class="lngo2">' + (nx && nx.ready ? '<button class="btn main big" data-ln="go" data-id="' + nx.id + '">下一課：' + esc(nx.title) + ' ▶</button>' : '') + '<button class="btn" data-ln="map">課程表</button><button class="btn" data-ln="quiz">再考一次（新題目）</button></div>'
    + (nx && !nx.ready ? '<p class="note">下一課「' + esc(nx.title) + '」還在製作中，下一批更新會上線。</p>' : '');
  else h += '<div class="lngo2"><button class="btn main big" data-ln="quiz">再試一次（新題目）▶</button><button class="btn" data-ln="practice">先多練習</button><button type="button" class="linkbtn" data-ln="reread">回去看講解</button></div>';
  return h + '</div>';
}

/* ===== 分級測驗、跳級測驗 ===== */
function startTest(mode, stage) {
  clearLnTimers();
  LN.mode = mode; LN.stage = stage || 0; LN.phase = 'intro'; LN.rng = lnRng(); LN.sec = 0; LN.kind = 'quiz';
  showView('learn'); renderLearn(); window.scrollTo(0, 0);
}
function testHTML() {
  const isP = LN.mode === 'place', s = COURSE.find((x) => x.id === LN.stage);
  let h = '<div class="lnbar"><button type="button" class="btn sm" data-ln="map">← 課程表</button><div class="lnttl"><b>' + (isP ? '分級測驗' : '第 ' + s.id + ' 階跳級測驗：' + esc(s.name)) + '</b></div></div>';
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
      + (COURSE[P.start - 1].lessons.some((l) => l.ready) ? '' : '<p class="note">第 ' + P.start + ' 階的課程還在製作中；可以先把前面的課當複習，或用起手牌字典和第 2 階的快答練速度。</p>') + '</div>';
    return h;
  }
  h += '<div class="panel lnres"><p class="lnbig">' + (LN.pass ? '🎉 第 ' + s.id + ' 階直接通過！' : '這一階先上課比較好') + '</p><p>答對 ' + ok + '／' + LN.res.length + '（要 7 題）。</p>'
    + '<div class="lngo2"><button class="btn main big" data-ln="map">回課程表</button>' + (LN.pass ? '' : '<button class="btn" data-ln="skip" data-s="' + s.id + '">再考一次</button>') + '</div></div>';
  return h;
}
function testStart() {
  if (LN.mode === 'place') {
    LN.qs = makePlacement(LN.rng);
    for (const q of LN.qs) q.opts.push({ t: '不知道', ok: false });
  } else {
    const gens = STAGE_GENS[LN.stage];
    LN.qs = makeQuiz(gens, 8, LN.rng);
    for (const q of LN.qs) q.stage = LN.stage;
  }
  LN.qi = 0; LN.res = []; LN.answered = false; LN.phase = 'q';
  renderLearn(); window.scrollTo(0, 0);
}

/* ===== 題目的圖 ===== */
function visHTML(v) {
  if (!v) return '';
  if (v.k === 'hand') return '<div class="lnvis"><div class="lnrow"><span class="lbl">你的牌</span>' + v.hole.map((c) => cardHTML(c)).join('') + '</div>' + (v.board && v.board.length ? '<div class="lnrow"><span class="lbl">公牌</span>' + v.board.map((c) => cardHTML(c, 'sm')).join('') + '</div>' : '') + '</div>';
  if (v.k === 'two') return '<div class="lnvis"><div class="lnrow"><span class="lbl">A</span>' + v.a.map((c) => cardHTML(c, 'sm')).join('') + '<span class="lbl">B</span>' + v.b.map((c) => cardHTML(c, 'sm')).join('') + '</div><div class="lnrow"><span class="lbl">公牌</span>' + v.board.map((c) => cardHTML(c, 'sm')).join('') + '</div></div>';
  if (v.k === 'cls') return '<div class="lnvis"><div class="lnrow">' + (v.pos ? '<span class="lbl">' + esc(v.pos) + '</span>' : '') + classCards(v.g).map((c) => cardHTML(c)).join('') + '<span class="lnname">' + esc(NAMEZH(v.g)) + '<small>' + esc(clsWords(v.g)) + '</small></span></div></div>';
  if (v.k === 'cls2') return '<div class="lnvis lnpair">' + [v.a, v.b].map((g) => '<div class="lnrow">' + classCards(g).map((c) => cardHTML(c, 'sm')).join('') + '<span class="lnname">' + esc(NAMEZH(g)) + '</span></div>').join('<span class="vs">vs</span>') + '</div>';
  if (v.k === 'seats') return seatsHTML(v.n, v.btn, v.hero, false);
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
  if (b.k === 'openDiff') return '<ol class="lndiff">' + openDiffs(b.t).map((d) => '<li><b>' + esc(POS_ZH[d.pos]) + '</b><span class="note">（開 ' + Math.round(d.pct * 100) + '%）</span>' + (d.pos === 'UTG' ? '：' : '：多開 ') + d.add.map((g) => '<button type="button" class="lnh t' + HAND_TIER[g] + '" data-ln="hand" data-g="' + g + '">' + NAMEZH(g) + '</button>').join('') + '</li>').join('') + '</ol>';
  return '';
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
function handDetailHTML(g) {
  const i = handInfo(g), ord = rankOrder(), k = i.rank - 1, prev = k > 0 ? ord[k - 1] : -1, next = k < 168 ? ord[k + 1] : -1;
  let h = '<div class="hdtop"><span class="hc">' + classCards(g).map((c) => cardHTML(c)).join('') + '</span><div><h3>' + NAMEZH(g) + '<small>' + esc(i.words) + '</small></h3><p><b>第 ' + i.rank + ' 名</b>（前 ' + pct(i.pct + i.combos / NCOMBO / 2, 0) + '%）・<span class="tierb t' + i.tier + '">' + TIER_NAME[i.tier] + (i.tier === 5 ? (i.marginal ? '：邊緣' : '：垃圾') : '') + '</span>・' + i.combos + ' 個組合</p></div></div>';
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
  $('hLearnTxt').textContent = c.done ? '已完成 ' + c.done + '／' + c.total + ' 課' + (nx ? '，下一課：' + nx.title : '') : '八階課程，從規則練到 GTO；可以先做分級測驗找起點。';
  $('bLearn').textContent = c.done ? '繼續上課 ▶' : '開始 ▶';
}

function initLearn() {
  lpLoad();
  if (/[?&]lntest/.test(location.search)) window.__LN = LN;          // 自動測試用
  $('nLearn').addEventListener('click', () => openLearn('map'));
  $('bLearn').addEventListener('click', () => openLearn('map'));
  $('lnModalClose').addEventListener('click', () => { $('lnModal').hidden = true; });
  $('lnModal').addEventListener('click', (e) => {
    if (e.target === $('lnModal')) { $('lnModal').hidden = true; return; }
    const b = e.target.closest('[data-ln="hand"]');
    if (b) { $('lnModalBody').innerHTML = handDetailHTML(+b.dataset.g); $('lnModal').querySelector('.mbox').scrollTop = 0; }
  });
  $('lnRoot').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ln]');
    if (!b) {                                                   // 答完題目：點空白也能下一題
      if (LN.answered && e.target.closest('.lnfb')) nextQ();
      return;
    }
    const a = b.dataset.ln;
    if (a === 'map') openLearn('map');
    else if (a === 'go' || a === 'lesson') { const l = lessonById(b.dataset.id); if (l && l.ready) openLearn('lesson', l); }
    else if (a === 'practice') startQs('practice');
    else if (a === 'quiz') startQs('quiz');
    else if (a === 'reread') { clearLnTimers(); LN.phase = 'read'; renderLearn(); window.scrollTo(0, 0); }
    else if (a === 'ans') answerQ(+b.dataset.i);
    else if (a === 'next') nextQ();
    else if (a === 'dict') openLearn('dict');
    else if (a === 'place') startTest('place');
    else if (a === 'skip') startTest('skip', +b.dataset.s);
    else if (a === 'tstart') testStart();
    else if (a === 'pstart') { const s = +b.dataset.s; LP.place = { start: s, at: Date.now() }; for (let k = 1; k < s; k++) LP.skip[k] = true; lpSave(); openLearn('map'); }
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
    const inQ = (LN.mode === 'lesson' && (LN.phase === 'practice' || LN.phase === 'quiz')) || ((LN.mode === 'place' || LN.mode === 'skip') && LN.phase === 'q');
    if (!inQ) return;
    if (!LN.answered && /^[1-6]$/.test(e.key)) { const i = +e.key - 1; if (LN.qs[LN.qi] && i < LN.qs[LN.qi].opts.length) { e.preventDefault(); answerQ(i); } }
    else if (LN.answered && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) { e.preventDefault(); nextQ(); }
  });
  renderLearnHome();
}
