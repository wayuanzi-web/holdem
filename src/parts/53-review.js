/* ===== 53-review：一手結束的逐步檢討——每個決定當時猜的範圍、他實際的牌有沒有猜到、你的決定對在哪裡／錯在哪裡、該去看哪一課 ===== */
const REV_ACT_ZH = { shove: '全下', open: '加注開局', reraise: '再加注', callRaise: '跟注加注', limp: '跛入', check: '過牌' };
/* 這一手你做過的決定：每個「輪到你」的步驟和你按的那一步 */
function reviewDecisions() {
  const out = [];
  for (let i = 0; i < G.steps.length; i++) {
    const st = G.steps[i];
    if (!st.grade || !st.ev) continue;
    let hs = null;
    for (let j = i - 1; j >= 0; j--) { const x = G.steps[j]; if (x.kind === 'hero') { hs = x; break; } if (x.ev && x.ev.k === 'act' && x.ev.seat === 0) break; }
    if (!hs) continue;
    out.push({ st, hs });
  }
  return out;
}
/* 一個對手：當時估的範圍 vs 他實際的牌 */
function reviewOpp(o, hero, board, H) {
  const p = H.players[o.seat], cards = p.cards.slice(), k = comboOf(cards[0], cards[1]);
  const w = parseRange(o.range), weight = w[k] || 0, stats = lensStats(w, 1);
  let stronger = 0, tot = 0;
  if (board.length >= 3) {
    const S = boardStrength(board), mine = S[k];
    for (let c = 0; c < NCOMBO; c++) if (w[c] > 0 && c !== k && !board.includes(COMBO_A[c]) && !board.includes(COMBO_B[c]) && !hero.includes(COMBO_A[c]) && !hero.includes(COMBO_B[c])) { tot += w[c]; if (S[c] > mine) stronger += w[c]; }
  } else {
    const mine = PRE_PCT[CLASS_OF[k]];
    for (let c = 0; c < NCOMBO; c++) if (w[c] > 0 && c !== k) { tot += w[c]; if (PRE_PCT[CLASS_OF[c]] < mine) stronger += w[c]; }
  }
  const pctStronger = tot ? stronger / tot : 0;
  let eqActual;
  if (board.length >= 3) { const one = new Float32Array(NCOMBO); one[k] = 1; eqActual = exactHU(hero, board, one).eq; }
  else { const wa = new Float32Array(NCOMBO); wa[comboOf(hero[0], hero[1])] = 1; const wb = new Float32Array(NCOMBO); wb[k] = 1; eqActual = rangeVsRange([], wa, wb, { iters: 2000 }).total; }
  const cat = board.length >= 3 ? CATG[handCategory(cards[0], cards[1], board)] : clsWords(CLASS_OF[k]);
  const hit = weight >= 0.5 ? 'hit' : weight > 0 ? 'edge' : 'miss';
  const st = STYLES[p.style] || STYLES.tag, agg = o.act === 'open' || o.act === 'reraise' || o.act === 'shove';
  let why = '';
  if (hit === 'miss' || hit === 'edge') {
    const c = board.length >= 3 ? handCategory(cards[0], cards[1], board) : -1;
    if (st.loose >= 1.4) why = '他是' + st.zh + '：會用比估計更差的牌' + (agg ? '加注' : '跟注') + '。教練一律照緊凶估範圍（實測比照風格估還穩），所以鬆的對手常常「不在範圍裡」。';
    else if (c >= 13 && agg) why = '他在詐唬：沒中卻' + (agg ? '加注' : '下注') + '。估計把這種牌的份量壓得很低，但不是零——GTO 也會帶一些詐唬。';
    else if (c >= 0 && c <= 5 && !agg) why = '他慢打：很強的牌只過牌或跟注，估計以為他沒那麼強。';
    else if (st.aggr <= 0.35 && agg) why = '他是' + st.zh + '，很少主動下注；一旦下注，牌比估計的更強。';
    else why = '估計是照位置和動作的機率分布，本來就不會每次都中；要看的是分布對不對，不是單一手牌。';
  }
  return { name: p.name, style: p.style, cards, folded: p.folded, cat, weight, pctStronger, eqActual, hit, why, combos: stats.combos, top: o.top, act: o.act };
}
/* 這一步該去看哪一課 */
function reviewLesson(adv, street, hero) {
  const ids = [];
  const g = hero.length === 2 ? heroCls(hero) : -1;
  if (adv.short) ids.push('5-5');
  else if (street === 0 && adv.chart) {
    const kind = adv.chart.kind, key = adv.chart.key || '';
    if (g >= 0 && handShape(g).trap) ids.push('2-8');
    if (kind === 'rfi') ids.push(/\/(UTG|UTG1|MP|LJ|HJ)$/.test(key) ? '3-2' : /\/SB$/.test(key) ? '3-4' : '3-3');
    else if (kind === 'vsOpen') ids.push(/\/BB\//.test(key) ? '4-2' : '4-1');
    else ids.push('4-5');
  } else if (street === 0) { ids.push('5-1'); if (adv.detail && adv.detail.fac && adv.detail.fac.length) ids.push('5-4'); }
  else {
    const d = adv.detail;
    if (d && d.call > 0) { ids.push('6-5'); if (d.outs && d.outs.total) ids.push('5-2'); }
    else ids.push(street === 1 ? '6-3' : '6-6');
    ids.push('6-4');
  }
  return ids.map((id) => lessonById(id)).filter((l) => l && l.ready).slice(0, 2);
}
function reviewHTML() {
  const H = G.H, D = reviewDecisions();
  if (!H || !G.over) return '<p class="note">這一手還沒結束。</p>';
  if (!D.length) return '<p class="note">這一手你沒有做決定。</p>';
  const net = H.result ? H.result.net[0] : 0, marks = D.map((x) => x.st.grade.mark);
  const good = marks.filter((m) => m === 'good').length, bad = marks.filter((m) => m === 'bad').length;
  let h = '<p class="revsum"><b>' + (net > 0 ? '贏了 ' + net : net < 0 ? '輸了 ' + (-net) : '沒輸沒贏') + '</b>・' + D.length + ' 個決定：✓ ' + good + '、△ ' + (D.length - good - bad) + '、✗ ' + bad + '。'
    + (net < 0 && bad === 0 ? '決定都對還是輸：這很正常，對的決定是「長期」賺錢，單一手的輸贏大部分是牌運。' : net > 0 && bad > 0 ? '贏了但有決定是錯的：這種贏長期會還回去，檢討看決定，不看結果。' : '') + '</p>';
  let guessN = 0, guessHit = 0, idx = 0;
  const cards = [];
  for (const { st, hs } of D) {
    idx++;
    const S = hs.snap, adv = hs.adv, board = S.board.slice(), hero = S.players[0].cards.slice(), pot = potTotal(S), L = legalSnapshot(S);
    const g = st.grade, mk = MK[g.mark];
    h += '<div class="revd ' + g.mark + '"><div class="revh"><span class="mk">' + mk + '</span><b>第 ' + idx + ' 個決定・' + STREET_NAME[st.ev.street] + '</b><span class="note">底池 ' + pot + (L.toCall > 0 ? '・要跟 ' + L.toCall : '') + '</span></div>';
    h += '<div class="revrow"><span class="lbl">你的牌</span>' + sortedCards(hero).map((c) => cardHTML(c, 'sm')).join('') + (board.length ? '<span class="lbl">公牌</span>' + board.map((c) => cardHTML(c, 'sm')).join('') : '') + '</div>';
    h += '<p><b>你：' + esc(actWord(st.ev, H).replace(/^你/, '')) + '</b>　教練建議：' + esc(adv.label) + (g.src === 'GTO' ? '　<span class="srcg">GTO 評分</span>' : '') + '<br><span class="' + (g.mark === 'good' ? 'ok' : 'no') + '">' + esc(g.text) + '</span></p>';
    // 當時猜的範圍 vs 他實際的牌
    const opps = adv.detail && adv.detail.opps ? adv.detail.opps : [];
    if (opps.length) {
      h += '<div class="revg"><b>當時猜他有什麼</b>';
      for (const o of opps) {
        const r = reviewOpp(o, hero, board, H);
        guessN++; if (r.hit !== 'miss') guessHit++;
        const w = parseRange(o.range);
        let bd = '';
        if (board.length >= 3) { const B = lensBoard(w, board, hero); bd = '；這個公牌上頂對以上 ' + Math.round(B.strongShare * 100) + '%'; }
        h += '<div class="revo"><div>' + esc(r.name) + '（' + esc(styleZh(r.style)) + '）' + (o.act && REV_ACT_ZH[o.act] ? REV_ACT_ZH[o.act] + '：' : '：') + '估他是前 <b>' + Math.round(o.top * 100) + '%</b> 的牌（約 ' + Math.round(r.combos) + ' 個組合）' + bd + '。你對這個範圍的勝率 <b>' + Math.round(adv.detail.est * 100) + '%</b>。</div>'
          + '<div class="revact"><span class="lbl">他實際</span>' + sortedCards(r.cards).map((c) => cardHTML(c, 'sm')).join('') + '<span>' + esc(r.cat) + (r.folded ? '（後來棄牌）' : '') + '</span></div>'
          + '<div class="revverdict ' + r.hit + '">' + (r.hit === 'hit' ? '✓ 猜到了：這手牌在估計範圍裡（份量 ' + Math.round(r.weight * 100) + '%），範圍裡比它強的牌佔 ' + Math.round(r.pctStronger * 100) + '%。' : r.hit === 'edge' ? '△ 在範圍邊緣（份量只有 ' + Math.round(r.weight * 100) + '%）。' : '✗ 沒猜到：估計範圍裡沒有這手牌。') + (r.why ? ' ' + esc(r.why) : '') + ' 你對他實際這手牌的勝率 <b>' + Math.round(r.eqActual * 100) + '%</b>（對估計範圍 ' + Math.round(adv.detail.est * 100) + '%）。</div></div>';
      }
      h += '</div>';
    } else if (adv.chart) h += '<p class="note">翻牌前照圖表（' + esc(adv.chart.name) + '）決定，不用猜對手的牌。</p>';
    // 為什麼
    h += '<details class="revwhy"><summary>為什麼建議「' + esc(adv.label) + '」</summary><ol>' + adv.reasons.map((x) => '<li>' + rich(x) + '</li>').join('') + '</ol>' + (adv.more && adv.more.length ? adv.more.map((x) => '<p class="note">' + rich(x) + '</p>').join('') : '') + '</details>';
    const ls = reviewLesson(adv, st.ev.street, hero);
    if (ls.length) h += '<p class="revls">相關的課：' + ls.map((l) => '<button type="button" class="linkbtn" data-rev-lesson="' + l.id + '">' + esc(l.id + ' ' + l.title) + '</button>').join('　') + '</p>';
    h += '</div>';
    cards.push(idx);
  }
  if (guessN) h = h.replace('</p>', '　猜對手的牌：' + guessHit + '／' + guessN + ' 次在估計範圍裡。</p>');
  h += '<p class="note">「猜」＝教練照對手的位置、動作估的範圍（機率分布），不是猜一手牌；猜對的標準是他的牌在範圍裡。對手實際的牌是結束後才看得到（棄牌的也會顯示）。</p>';
  return h;
}
function openReview() {
  $('revBody').innerHTML = reviewHTML();
  $('revModal').hidden = false; $('revClose').focus();
  $('revModal').querySelector('.mbox').scrollTop = 0;
}
function initReview() {
  $('revClose').addEventListener('click', () => { $('revModal').hidden = true; });
  $('revModal').addEventListener('click', (e) => {
    if (e.target === $('revModal')) { $('revModal').hidden = true; return; }
    const b = e.target.closest('[data-rev-lesson]');
    if (b) { const l = lessonById(b.dataset.revLesson); if (l && l.ready) { $('revModal').hidden = true; LN.ret = null; clearTimeout(G.timer); openLearn('lesson', l); } }
  });
}
