/* ===== 53-review：一手結束的逐步檢討——每個決定當時猜的範圍、他實際的牌有沒有猜到、你的決定對在哪裡／錯在哪裡、該去看哪一課 ===== */
const REV_ACT_ZH = { shove: '全下', open: '加注開局', reraise: '再加注', callRaise: '跟注加注', limp: '跛入', check: '過牌', bet: '下注', raise: '加注', call: '跟注' };
/* 這一手你做過的決定：每個「輪到你」的步驟和你按的那一步 */
function reviewDecisions(steps) {
  const out = [];
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (!st.grade || !st.ev) continue;
    let hs = null;
    for (let j = i - 1; j >= 0; j--) { const x = steps[j]; if (x.kind === 'hero') { hs = x; break; } if (x.ev && x.ev.k === 'act' && x.ev.seat === 0) break; }
    if (!hs) continue;
    out.push({ st, hs, i });
  }
  return out;
}
/* 一個對手：當時估的範圍 vs 他實際的牌 */
function reviewOpp(o, hero, board, H, styled) {
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
  const st = STYLES[p.style] || STYLES.tag, agg = o.act === 'open' || o.act === 'reraise' || o.act === 'shove' || o.act === 'bet' || o.act === 'raise';
  let why = '';
  if (hit === 'miss' || hit === 'edge') {
    const c = board.length >= 3 ? handCategory(cards[0], cards[1], board) : -1;
    if (st.loose >= 1.4) why = '他是' + st.zh + '：會用比估計更差的牌' + (agg ? '加注' : '跟注') + '。' + (styled ? '冠軍教練已經照他的風格把範圍放寬，他這次還是比估計更鬆。' : '穩健教練一律照緊凶估範圍（實測比照風格估還穩），所以鬆的對手常常「不在範圍裡」。');
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
/* 份量怎麼來的：從 100% 開始，他每做一個動作就乘一次（跟教練估範圍用的是同一套：rangeWeights） */
function reviewTrail(S, seat, k, style) {
  style = style || (typeof COACH_STYLE_AWARE !== 'undefined' && COACH_STYLE_AWARE ? S.players[seat].style : 'tag');
  const out = [];
  let prev = 1;
  S.log.forEach((ev, i) => {
    if (ev.k !== 'act' || ev.seat !== seat || ev.t === 'f') return;
    const w = rangeWeights(S, seat, style, i + 1)[k];
    const f = prev > 1e-9 ? w / prev : 0;
    prev = w;
    const kind = ev.street === 0 ? preflopActKind(ev, S) : null;
    const word = ev.street === 0 ? (REV_ACT_ZH[kind] || (ev.t === 'c' ? '跟注' : ev.t === 'x' ? '過牌' : '加注'))
      : ev.t === 'b' ? '下注' : ev.t === 'r' ? '加注' : ev.t === 'c' ? '跟注' : ev.t === 'x' ? '過牌' : ev.callAll ? '全下跟注' : '全下';
    out.push({ street: ev.street, word, f, w });
  });
  return out;
}
const revPct = (x) => (x > 0 && x < 0.005 ? '不到 1%' : Math.round(x * 100) + '%');
function reviewTrailHTML(r) {
  if (r.shove) {
    const t = Math.round(r.top * 100) + '%';
    const how = r.shove === 'push' ? '他是短碼全下：範圍照推牌表估（他這個位置、這個籌碼會推的前 ' + t + ' 的牌）'
      : r.shove === 'reraise' ? '這是再加注以上' + (r.act === 'shove' ? '的全下' : '') + '：教練一律估成前 ' + t + ' 的強牌'
      : (r.act === 'shove' ? '他籌碼很深還全下' : '你是短碼、他加注') + '：教練一律估成前 ' + t + ' 的強牌';
    return '<details class="revtrail"><summary>份量 ' + revPct(r.weight) + ' 怎麼算的？</summary><p>' + how + '（你的籌碼短，只能推或棄，教練用固定的估法），在裡面就是 100%、不在就是 0%，不是一步一步乘。</p></details>';
  }
  if (!r.trail || !r.trail.length) return '';
  const pct = revPct;
  return '<details class="revtrail"><summary>份量 ' + pct(r.weight) + ' 怎麼算的？</summary><p>一開始每手牌都是 100%。他每做一個動作，教練就照「拿這手牌會不會這樣做」乘一個數：</p><p class="trailrow">100%'
    + r.trail.map((t) => ' → ' + STREET_NAME[t.street] + '<b>' + t.word + '</b> ×' + t.f.toFixed(2)).join('') + ' ＝ <b>' + pct(r.trail[r.trail.length - 1].w) + '</b></p>'
    + '<p class="note">×1.00＝拿這手牌一定會這樣做；×0.30＝三成的時候會這樣做；×0.04＝幾乎不會。翻牌前看這手牌在不在他這個位置、這種動作的範圍裡；翻牌後看這手牌在這個公牌上有多強（越強越會下注、加注，越弱越常過牌或棄牌）。份量 50% 以上算「猜到了」，比 0 大、不到 50% 是「範圍邊緣」，0% 是「沒猜到」。</p></details>';
}
/* 結局：你最後一個決定之後發生的事、攤牌、輸贏是決定還是運氣 */
/* 你最後一個決定時，對還在的人實際的牌：每個人的勝率（剩 1–2 張公牌精確算，翻牌前抽 4,000 次；平手照人數分） */
function reviewEqAll(hands, board) {
  const used = new Uint8Array(52);
  for (const h of hands) for (const c of h) used[c] = 1;
  for (const c of board) used[c] = 1;
  const deck = [];
  for (let c = 0; c < 52; c++) if (!used[c]) deck.push(c);
  const need = 5 - board.length, eq = new Float64Array(hands.length);
  let n = 0;
  const score = (b) => {
    let best = -1, win = [];
    hands.forEach((h, i) => { const v = evalCards(h.concat(b)); if (v > best) { best = v; win = [i]; } else if (v === best) win.push(i); });
    for (const i of win) eq[i] += 1 / win.length;
    n++;
  };
  if (need === 0) score(board);
  else if (need === 1) for (const c of deck) score(board.concat([c]));
  else if (need === 2) { for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) score(board.concat([deck[i], deck[j]])); }
  else {
    const rng = makeRng(12345);
    for (let t = 0; t < 4000; t++) {
      const d = deck.slice();
      for (let x = 0; x < need; x++) { const y = x + ((rng() * (d.length - x)) | 0); const tmp = d[x]; d[x] = d[y]; d[y] = tmp; }
      score(board.concat(d.slice(0, need)));
    }
  }
  return Array.from(eq, (x) => x / n);
}
/* 底池裡你拿到多少（不算多出來退回給你的） */
function revWon(res, seat) {
  let r = 0;
  for (const p of res.pots) if (p.refund && p.winners[0] === seat) r += p.amt;
  return { won: res.won[seat] - r, refund: r };
}
function reviewEndHTML(H, R, D, lastEq) {
  const last = D[D.length - 1], after = R.steps.slice(last.i + 1).filter((st) => st.title && st.kind !== 'hero' && st.kind !== 'summary');
  const res = H.result, net = res ? res.net[0] : 0;
  let h = '<div class="revd revend"><div class="revh"><b>結局：你最後一個決定之後</b></div>';
  if (H.board.length) h += '<div class="revrow"><span class="lbl">最後的公牌</span>' + H.board.map((c) => cardHTML(c, 'sm')).join('') + '</div>';
  if (after.length) h += '<ol class="revafter">' + after.map((st) => '<li>' + rich(st.title) + '</li>').join('') + '</ol>';
  if (res && !res.uncontested) {
    h += '<p><b>攤牌</b></p>' + H.players.filter((p) => !p.folded).map((p) => { const w = revWon(res, p.seat); return '<div class="revrow"><span class="lbl">' + esc(p.seat === 0 ? '你' : p.name) + '</span>' + sortedCards(p.cards).map((c) => cardHTML(c, 'sm')).join('') + '<span>' + esc(describeHand(evalCards(p.cards.concat(H.board)))) + (w.won > 0 ? '　<b>贏 ' + w.won + '</b>' : '') + (w.refund > 0 ? '（多下的 ' + w.refund + ' 沒人跟，退回）' : '') + '</span></div>'; }).join('');
  } else if (res) {
    const w = H.players.find((p) => res.won[p.seat] > 0);
    h += '<p>' + (w ? (w.seat === 0 ? '其他人都棄牌，你不用亮牌就贏了 ' + res.won[0] + '。' : esc(w.name) + ' 不用亮牌就贏了（其他人都棄牌）。') : '') + '</p>';
  }
  h += '<p><b>這一手你' + (net > 0 ? '贏了 ' + net : net < 0 ? '輸了 ' + (-net) : '沒輸沒贏') + '。</b>';
  if (lastEq && res && !res.uncontested && !H.players[0].folded) {
    const e = Math.round(lastEq.eq * 100), multi = lastEq.names.length > 1, fav = lastEq.fav, even = lastEq.even;
    const split = res.pots.some((p) => !p.refund && p.winners.length > 1 && p.winners.includes(0));
    const who = multi ? '還在的 ' + lastEq.names.length + ' 個人（' + lastEq.names.map(esc).join('、') + '）' : esc(lastEq.names[0]);
    h += '你最後一個決定時，對' + who + '實際的牌，你的勝率 <b>' + e + '%</b>（同樣的情況打 100 次，你大約贏 ' + e + ' 次' + (multi ? '；' + (even ? '你跟機會最大的人差不多' : fav ? '你是最可能贏的人' : '有人比你更可能贏') : '') + '）。'
      + (split || net === 0 ? '這次' + (split ? '平分底池' : '打平') + (split && net !== 0 ? '（' + (net > 0 ? '多贏的 ' + net + ' 是棄牌的人留在底池裡的錢、邊池或零頭' : '少的 ' + (-net) + ' 是你沒分到的邊池或零頭') + '）' : '') + '。' : even ? '你們的機會本來就差不多，這次' + (net > 0 ? '贏' : '輸') + '是運氣。' : net < 0 && fav ? '這次輸是運氣不好：後面的牌幫了' + (multi ? '別人' : '他') + '。長期這樣打是賺的，不用改。' : net > 0 && !fav ? '這次贏是運氣好：後面的牌幫了你。長期這樣打不一定賺，看上面每一步的評分。' : net < 0 ? (multi ? '你本來就不是最大的牌' : '他的牌本來就比較大') + '，輸是正常的；要看的是前面該不該把錢放進去。' : '你的牌本來就比較大，贏是應該的。');
  }
  h += '</p></div>';
  return h;
}
/* R：要檢討的那一手（預設＝現在這一手；超快模式棄牌後是上一手） */
function reviewHTML(R) {
  R = R || { H: G.H, steps: G.steps, over: G.over };
  const H = R.H, D = reviewDecisions(R.steps);
  if (!H || !R.over) return '<p class="note">這一手還沒結束。</p>';
  if (!D.length) return '<p class="note">這一手你沒有做決定。</p>';
  const net = H.result ? H.result.net[0] : 0, marks = D.map((x) => x.st.grade.mark);
  const good = marks.filter((m) => m === 'good').length, bad = marks.filter((m) => m === 'bad').length;
  let head = '<p class="revsum"><b>' + (net > 0 ? '贏了 ' + net : net < 0 ? '輸了 ' + (-net) : '沒輸沒贏') + '</b>・' + D.length + ' 個決定：✓ ' + good + '、△ ' + (D.length - good - bad) + '、✗ ' + bad + '。'
    + (net < 0 && bad === 0 ? '沒有錯的決定還是輸：這很正常，對的決定是「長期」賺錢，單一手的輸贏大部分是牌運。' : net > 0 && bad > 0 ? '贏了但有決定是錯的：這種贏長期會還回去，檢討看決定，不看結果。' : '') + '</p>';
  let h = '', guessN = 0, guessHit = 0, guessEdge = 0, idx = 0, lastEq = null;
  for (const { st, hs } of D) {
    idx++;
    const S = hs.snap, adv = hs.adv, board = S.board.slice(), hero = S.players[0].cards.slice(), pot = potTotal(S), L = legalSnapshot(S);
    const g = st.grade, mk = MK[g.mark], used = new Set();
    lastEq = null;                                                       // 結局只講最後一個決定時的勝率
    let c = '<div class="revd ' + g.mark + '"><div class="revh"><span class="mk">' + mk + '</span><b>第 ' + idx + ' 個決定・' + STREET_NAME[st.ev.street] + '</b><span class="note">底池 ' + pot + (L.toCall > 0 ? '・要跟 ' + L.toCall : '') + '</span></div>';
    c += '<div class="revrow"><span class="lbl">你的牌</span>' + sortedCards(hero).map((x) => cardHTML(x, 'sm')).join('') + (board.length ? '<span class="lbl">公牌</span>' + board.map((x) => cardHTML(x, 'sm')).join('') : '') + '</div>';
    const CH = adv.champ && adv.champ.options && adv.champ.options.length ? adv.champ : null;
    c += glossify('<p><b>你：' + esc(actWord(st.ev, H).replace(/^你/, '')) + '</b>　' + (CH ? '冠軍教練：' : '教練建議：') + esc(adv.label) + (g.src === 'GTO' ? '　<span class="srcg">GTO 評分</span>' : '') + '<br><span class="' + (g.mark === 'good' ? 'ok' : 'no') + '">' + esc(g.text) + '</span></p>', used);
    // 當時猜的範圍 vs 他實際的牌
    const champR = CH && CH.read.length && CH.read.every((r) => r.range !== undefined);   // 冠軍教練：照他自己估的範圍（照每個人的風格）檢討，數字跟當時教練框一樣
    const opps = champR ? CH.read : adv.detail && adv.detail.opps ? adv.detail.opps : [];
    const estAll = champR && CH.eq !== undefined ? CH.eq : adv.detail ? adv.detail.est : 0;
    if (opps.length) {
      c += '<div class="revg"><b>當時猜他有什麼</b>' + (champR ? '<span class="note">（冠軍教練照每個人的風格估）</span>' : '');
      opps.forEach((o, oi) => {
        let oo = o;
        if (board.length >= 3 && !o.act) {                             // 翻牌後：照他到這一步為止的動作（有沒有主動下注、加注）
          const evs = S.log.filter((e) => e.k === 'act' && e.seat === o.seat && e.street > 0);
          const ag = evs.filter((e) => e.t === 'b' || e.t === 'r' || (e.t === 'a' && !e.callAll)).pop(), lastE = evs[evs.length - 1];
          const kind = (e) => (e.t === 'b' ? 'bet' : e.t === 'r' || e.t === 'a' ? (e.t === 'a' && e.callAll ? 'call' : 'raise') : e.t === 'c' ? 'call' : e.t === 'x' ? 'check' : undefined);
          if (ag || lastE) oo = Object.assign({}, o, { act: kind(ag || lastE) });
        }
        const r = reviewOpp(oo, hero, board, H, champR);
        r.shove = !champR && adv.short && o.src ? o.src : false;
        r.trail = o.seat !== undefined && !r.shove ? reviewTrail(S, o.seat, comboOf(r.cards[0], r.cards[1]), champR ? o.rstyle : undefined) : [];
        if (r.trail.length) {                                          // 份量用算出來的（不用範圍文字四捨五入過的），跟下面的「怎麼算的」一致
          const w0 = r.trail[r.trail.length - 1].w, h0 = w0 >= 0.5 ? 'hit' : w0 > 1e-4 ? 'edge' : 'miss';
          r.weight = w0; if (h0 === 'hit') r.why = ''; r.hit = h0;
        }
        guessN++; if (r.hit === 'hit') guessHit++; else if (r.hit === 'edge') guessEdge++;
        const w = parseRange(o.range);
        let bd = '';
        if (board.length >= 3) { const B = lensBoard(w, board, hero); bd = '；這個公牌上頂對以上 ' + Math.round(B.strongShare * 100) + '%'; }
        const wp = revPct(r.weight);
        const verdict = r.hit === 'hit' ? '✓ 猜到了：這手牌在估計範圍裡（份量 ' + wp + '），範圍裡比它強的牌佔 ' + Math.round(r.pctStronger * 100) + '%。'
          : r.hit === 'edge' ? '△ 在範圍邊緣：份量 ' + wp + '——照估計，他拿這手牌大約只有 ' + wp + ' 的時候會一路這樣打（其他時候會棄牌或換打法），算「可能、但不是主要的牌」。'
          : '✗ 沒猜到：照估計，他拿這手牌幾乎不會這樣打（份量 0%）。';
        c += '<div class="revo">' + glossify('<div>' + esc(r.name) + '（' + esc(styleZh(r.style)) + '）' + (r.act && REV_ACT_ZH[r.act] ? REV_ACT_ZH[r.act] + '：' : '：') + '估他是前 <b>' + Math.round(o.top * 100) + '%</b> 的牌（約 ' + Math.round(r.combos) + ' 個組合）' + bd + '。你對' + (opps.length > 1 ? '他們的範圍' : '這個範圍') + '的勝率 <b>' + Math.round(estAll * 100) + '%</b>。</div>', used)
          + '<div class="revact"><span class="lbl">他實際</span>' + sortedCards(r.cards).map((x) => cardHTML(x, 'sm')).join('') + '<span>' + glossify(esc(r.cat), used) + (r.folded ? '（後來棄牌）' : '') + '</span></div>'
          + glossify('<div class="revverdict ' + r.hit + '">' + verdict + (r.why ? ' ' + esc(r.why) : '') + ' 你對他實際這手牌的勝率 <b>' + Math.round(r.eqActual * 100) + '%</b>' + (opps.length > 1 ? '' : '（對估計範圍 ' + Math.round(estAll * 100) + '%）') + '。</div>', used)
          + reviewTrailHTML(r) + '</div>';
      });
      c += '</div>';
    }
    if (idx === D.length) {                                              // 結局用：最後一個決定時還在、最後也沒棄牌的人，實際的牌
      const alive = S.players.filter((q) => q.seat !== 0 && !q.folded && !H.players[q.seat].folded);
      if (alive.length) { const eqs = reviewEqAll([hero].concat(alive.map((q) => H.players[q.seat].cards)), board), top = Math.max(...eqs.slice(1)); lastEq = { eq: eqs[0], fav: eqs[0] > top + 0.005, even: Math.abs(eqs[0] - top) <= 0.005, names: alive.map((q) => q.name) }; }
    }
    if (!opps.length && adv.chart) c += glossify('<p class="note">翻牌前照圖表（' + esc(adv.chart.name) + '）決定，不用猜對手的牌。</p>', used);
    // 為什麼（標題不加名詞按鈕：點了會收合）
    c += '<details class="revwhy"><summary>為什麼建議「' + esc(adv.label) + '」' + (CH ? '（每個選項的成功率）' : '') + '</summary>' + glossify('<ol>' + adv.reasons.map((x) => '<li>' + rich(x) + '</li>').join('') + '</ol>', used) + (CH ? champTableHTML(CH) : '') + (adv.more && adv.more.length ? glossify(adv.more.map((x) => '<p class="note">' + rich(x) + '</p>').join(''), used) : '') + '</details>';
    const ls = reviewLesson(adv, st.ev.street, hero);
    if (ls.length) c += '<p class="revls">相關的課：' + ls.map((l) => '<button type="button" class="linkbtn" data-rev-lesson="' + l.id + '">' + esc(l.id + ' ' + l.title) + '</button>').join('　') + '</p>';
    c += '</div>';
    h += c;
  }
  if (guessN) head = head.replace('</p>', '　猜對手的牌：' + guessHit + '／' + guessN + ' 次猜到' + (guessEdge ? '、' + guessEdge + ' 次在範圍邊緣' : '') + '。</p>');
  h = head + h + reviewEndHTML(H, R, D, lastEq);
  h += glossify('<p class="note">「猜」＝教練照對手的位置、動作估的範圍（機率分布），不是猜一手牌；猜對的標準是他的牌在範圍裡（份量 50% 以上）。對手實際的牌是結束後才看得到（棄牌的也會顯示）。虛線底的詞可以點開看解釋。</p>', new Set());
  return h;
}
function openReview(R) {
  $('revBody').innerHTML = reviewHTML(R);
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
