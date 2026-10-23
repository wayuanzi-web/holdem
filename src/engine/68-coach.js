/* ===== 68-coach：教練（每一步的解說、輪到你時的建議和原因、你按完以後的評分） =====
   文字裡的牌寫成 {c數字}，畫面再換成有顏色的牌。教練只用你看得到的資訊（自己的牌、公牌、公開的動作、對手的風格標籤）。 */
const CARD_TOK = (c) => '{c' + c + '}';
const CARDS_TOK = (arr) => arr.map(CARD_TOK).join('');
const PCT0 = (x) => Math.round(x * 100) + '%';
const fmt1 = (x) => (Math.round(x * 10) / 10).toString();
let COACH_STYLE_AWARE = false;
let COACH_NO_DISCOUNT = false;   // 算勝率時把每個對手都當一般的緊凶玩家（實測比照風格估更穩）；風格只用在說明文字
const STYLE_READ = {
  tag: { open: '緊凶型只用好牌開局', bet: '緊凶型下注通常是有東西', raise: '緊凶型加注很少是詐唬' },
  lag: { open: '鬆凶型開局的牌很寬，不一定很強', bet: '鬆凶型常常主動下注，裡面有不少詐唬', raise: '鬆凶型加注有時是半詐唬' },
  rock: { open: '岩石型很少玩，他加注多半是大牌', bet: '岩石型下注幾乎都是真的有牌', raise: '岩石型加注要非常小心' },
  station: { open: '跟注站很少加注，他加注要小心', bet: '跟注站很少主動下注，他下注通常是好牌', raise: '跟注站加注幾乎一定是很大的牌' },
  maniac: { open: '瘋子什麼牌都會加注，不用太怕', bet: '瘋子常常亂下注，很多是詐唬', raise: '瘋子加注很常是詐唬' },
  gto: { open: 'GTO 電腦照圖表開局，牌不算緊', bet: 'GTO 電腦下注有價值也有詐唬，比例剛好讓你很難應對', raise: 'GTO 電腦加注是平衡的：大牌和詐唬都有' },
};
function styleZh(k) { return (STYLES[k] || STYLES.tag).zh; }
function sortedCards(cards) { return cards.slice().sort((a, b) => (b >> 2) - (a >> 2) || (a & 3) - (b & 3)); }
function heroCls(cards) { return classIndex(cards[0] >> 2, cards[1] >> 2, (cards[0] & 3) === (cards[1] & 3)); }
function clsWords(g) {
  const n = className(g).replace(/T/g, '10');
  if (n.length === 2 || (n.length === 4 && n.startsWith('10') && n.endsWith('10'))) return n + '（口袋對子）';
  if (/s$/.test(n)) return n.slice(0, -1) + ' 同花';
  return n.slice(0, -1) + ' 不同花';
}
function strengthWord(pct, rank) {
  if (rank <= 10) return '頂級好牌';
  if (pct < 0.08) return '很強的牌';
  if (pct < 0.2) return '不錯的牌';
  if (pct < 0.4) return '普通的牌';
  return '偏弱的牌，多半要棄牌';
}
function posWhy(code) {
  const c = posClass(code);
  if (c === 'late') return '位置很好：翻牌後你最後說話，看得到別人怎麼做再決定';
  if (c === 'early') return '位置最前面：後面還有很多人沒說話，要用比較好的牌才玩';
  if (c === 'middle') return '中間的位置：開牌的牌要中等偏緊';
  if (c === 'sb') return '小盲已經放了 1，但翻牌後要第一個說話，位置很差';
  return '大盲已經放了 2，沒人加注的話可以免費看翻牌';
}
function actWord(ev, H) {
  const amt = ev.to !== undefined ? ev.to : ev.add;
  switch (ev.t) {
    case 'f': return '棄牌';
    case 'x': return '過牌';
    case 'c': return '跟注 ' + ev.add;
    case 'b': return '下注 ' + ev.to;
    case 'r': return '加注到 ' + ev.to;
    default: return ev.callAll ? '全下跟注 ' + ev.add : '全下 ' + (ev.to !== undefined ? ev.to : amt);
  }
}

/* 你的牌型怎麼講：公牌自己就有的牌型（例如公牌一對）要講清楚，不然會以為自己中了 */
function handWords(cards, board) {
  const v = evalCards(cards.concat(board)), bv = evalCards(board);
  const cat = v >>> 26, desc = describeHand(v);
  if (cat === (bv >>> 26)) {
    if (v === bv && board.length === 5) return '公牌本身就是' + desc + '，你的兩張沒有用到';
    if (cat >= 1 && cat <= 3 && (v >> 13) === (bv >> 13)) return desc + '（是公牌自己的' + CAT_NAMES[cat] + '，你的兩張只當踢腳）';
    if (cat === 0 && TOPBIT[v & 8191] === TOPBIT[bv & 8191]) return '什麼都沒中（最大的牌是公牌的 ' + RANK_TXT[TOPBIT[bv & 8191]] + '）';
  }
  return desc;
}
/* ===== 你的牌現在多強（給教練、勝率表用） ===== */
function stateRng(H) { return makeRng(H.no * 7919 + H.log.length * 104729 + H.board.length); }
function heroInfo(H, seat, rng, iters) {
  rng = stateRng(H); iters = 3000;
  const p = H.players[seat];
  const g = heroCls(p.cards);
  let opps = H.players.filter((q) => q !== p && !q.folded);
  // 翻牌前有人加注：只跟「已經把錢放進來」的人比（加注、跟注的人）；後面還沒說話的人多半會棄牌，另外算（behind）
  let behind = [];
  if (H.street === 0 && preflopRaises(H) > 0) {
    const acted = new Set(H.log.filter((e) => e.k === 'act' && e.street === 0 && e.t !== 'f').map((e) => e.seat));
    const inPot = opps.filter((q) => acted.has(q.seat));
    if (inPot.length) { behind = opps.filter((q) => !acted.has(q.seat)); opps = inPot; }
  }
  const info = { g, rank: PRE_RANK[g], pct: PRE_PCT[g], nOpp: opps.length, opps: opps.map((q) => q.seat), behind: behind.map((q) => q.seat), iters: 3000 };
  if (!opps.length) return info;
  const ws = opps.map((q) => rangeWeights(H, q.seat, COACH_STYLE_AWARE ? q.style : 'tag'));
  info.ws = ws;
  info.oppTop = ws.map(rangeTopPct);
  info.est = mcVsRanges(p.cards, H.board, ws, iters || 3000, rng).eq;
  info.rand = mcVsRandom(p.cards, H.board, opps.length, iters || 3000, rng).eq;
  if (H.board.length) {
    const v = evalCards(p.cards.concat(H.board));
    info.cat = v >>> 26; info.desc = handWords(p.cards, H.board);
    info.outs = H.board.length < 5 ? outsInfo(p.cards, H.board) : null;
    const st = info.outs ? info.outs.groups.filter((x) => x.strong) : [];
    const fl = st.find((x) => x.cat === 5), sr = st.find((x) => x.cat === 4);
    const d = [];
    if (fl && fl.cards.length >= 8) d.push('同花聽牌');
    if (sr) d.push(sr.cards.length >= 8 ? '兩頭順聽牌' : '卡順聽牌');
    info.draws = d.join('＋');
  }
  return info;
}

/* ===== 出牌明細（10/23）：每一張出牌是什麼、中了變成什麼、中了以後對他的範圍還領先多少 =====
   ws：每個對手的範圍權重（教練估的）。中了也常常輸的出牌要「打折」：例如公牌已經有一對時配到你的牌只是小兩對。
   回傳 groups：[{ cat, name, cards:[{ c, share }], n, eff, beat:[會輸給的牌型] }]；eff＝打折後相當於幾張乾淨的出牌 */
function outsTable(hero, board, ws) {
  const o = outsInfo(hero, board);
  if (!o || !o.total) return null;
  const dead = new Uint8Array(52);
  for (const c of hero.concat(board)) dead[c] = 1;
  const nb = board.length + 1, hb = new Array(nb + 2), ob = new Array(nb + 2);
  const groups = [];
  let eff = 0;
  for (const g of o.groups) {
    if (!g.strong) continue;
    const out = { cat: g.cat, name: g.name, cards: [], n: 0, eff: 0, beat: [] };
    const beat = new Float64Array(9);
    for (const c of g.cards) {
      hb[0] = hero[0]; hb[1] = hero[1];
      for (let i = 0; i < board.length; i++) { hb[2 + i] = board[i]; ob[2 + i] = board[i]; }
      hb[nb + 1] = c; ob[nb + 1] = c;
      const hv = evalCards(hb, nb + 2);
      let share = 1;
      for (const w of ws || []) {
        let tot = 0, win = 0;
        const bt = new Float64Array(9);
        for (let k = 0; k < NCOMBO; k++) {
          const x = w[k];
          if (!(x > 0)) continue;
          const a = COMBO_A[k], b = COMBO_B[k];
          if (dead[a] || dead[b] || a === c || b === c) continue;
          ob[0] = a; ob[1] = b;
          const ov = evalCards(ob, nb + 2);
          tot += x;
          if (hv > ov) win += x; else if (hv === ov) win += x / 2; else bt[handCat(ov)] += x;
        }
        if (tot > 0) { share *= win / tot; for (let i = 0; i < 9; i++) beat[i] += bt[i] / tot; }
      }
      out.cards.push({ c, share });
      out.eff += share;
    }
    out.n = out.cards.length;
    const bs = beat.reduce((s, x) => s + x, 0);
    out.beat = [...beat.keys()].filter((i) => bs > 0 && beat[i] / bs >= 0.2).sort((i, j) => beat[j] - beat[i]).slice(0, 2).map((i) => CAT_NAMES[i]);
    eff += out.eff;
    groups.push(out);
  }
  const left = o.left, flop = board.length === 3;
  const pr = (n) => flop ? 1 - ((left - n) / left) * ((left - 1 - n) / (left - 1)) : n / left;
  return { total: o.total, weak: o.weak, left, flop, groups, eff, pNext: o.total / left, pRiver: pr(o.total), pNextEff: eff / left, pRiverEff: pr(eff) };
}
/* 出牌的機率和「要不要賭」：給教練框的明細用。ctx：{ toCall, pot, stack, oppStack, label, est } */
function outsAdviceLines(T, ctx) {
  const L = [], n = T.total, e = T.eff, dirty = e < n - 0.5;
  const er = (x) => Math.round(x * 10) / 10;
  L.push('下一張就中：' + n + '／' + T.left + '＝' + PCT0(T.pNext) + (dirty ? '；只算中了真的會領先的（約 ' + er(e) + ' 張）是 ' + PCT0(T.pNextEff) : '') + '。');
  if (T.flop) L.push('轉牌、河牌兩張都看得到時，至少中一張：' + PCT0(T.pRiver) + (dirty ? '（可靠的 ' + PCT0(T.pRiverEff) + '）' : '') + '。');
  L.push('好記的算法：出牌 × 2 ≈ 下一張中的機率（' + n + ' × 2 ＝ ' + n * 2 + '%）' + (T.flop ? '；翻牌時 × 4 ≈ 到河牌（' + n + ' × 4 ＝ ' + n * 4 + '%' + (n > 9 ? '，張數多時會高估一點' : '') + '）' : '') + '。');
  const allin = ctx.toCall > 0 && ctx.toCall >= ctx.stack;
  if (ctx.toCall > 0) {
    const need = ctx.toCall / (ctx.pot + ctx.toCall), useRiver = allin && T.flop;
    const p = useRiver ? T.pRiverEff : T.pNextEff;
    const head = '要不要賭：跟 ' + ctx.toCall + '，勝率要 ' + PCT0(need) + '。' + (useRiver ? '跟了就是全下，兩張都看得到，用 ' + PCT0(p) : '他下一條街多半還會再下注，所以先只算下一張：' + PCT0(p));
    if (p >= need) L.push(head + ' ≥ ' + PCT0(need) + '，只靠出牌就夠，跟注划算。');
    else if (useRiver) L.push(head + ' < ' + PCT0(need) + '，只靠出牌不夠。');
    else {
      const F = Math.max(0, Math.ceil((1 - p) * ctx.toCall / Math.max(p, 0.01) - ctx.pot));
      L.push(head + ' < ' + PCT0(need) + '，只靠出牌不夠：中了以後還要再從他那裡多贏 ' + F + ' 以上才不虧（隱含賠率）' + (ctx.oppStack > F * 1.5 ? '；他後面還有 ' + ctx.oppStack + '，有機會。' : '；他後面只剩 ' + ctx.oppStack + '，很難。'));
    }
  } else L.push('要不要賭：現在不用付錢。過牌＝免費看下一張（' + PCT0(T.pNextEff) + ' 會中）；下注＝半詐唬：他棄牌你直接贏，被跟還有 ' + PCT0(T.flop ? T.pRiverEff : T.pNextEff) + ' 會中。');
  if (ctx.label) L.push('教練最後的建議「' + ctx.label + '」看的是整體勝率約 ' + PCT0(ctx.est) + '：連你沒中、他也沒中的時候都算進去，所以不一定跟只算出牌一樣。');
  return L;
}

/* ===== 輪到你：建議和原因 =====
   回傳 { act: {t, to}, label, reasons: [...], more: [...], need, eq } */
/* 教練的建議：翻牌前有圖表的情況照圖表（原本照勝率算的原因留在「更多說明」） */
function coachAdvice(H, rng) {
  const adv = coachAdviceRule(H, rng);
  if (H.street !== 0) return adv;
  const L = legalActions(H);
  const sh = shortSpot(H, L.seat);
  if (sh) {                                            // 短碼：推或棄
    const pc = PUSH_PCT[adv.info.g], go = sh.kind === 'push' ? pc < sh.pct : sh.kind === 'reshove' ? sh.ev > 0 : sh.eq >= sh.need, p = H.players[L.seat];
    const head = adv.reasons[0];
    adv.more.unshift('（照勝率估的看法：建議「' + adv.label + '」。' + (sh.kind === 'call' ? '面對全下以底池賠率為準。' : '短碼時以推或棄為準。') + '）');
    adv.reasons.length = 0;
    adv.reasons.push(head);
    if (sh.kind === 'push') {
      adv.reasons.push('你和對手的有效籌碼只有 ' + fmt1(sh.eff) + ' 個大盲：籌碼這麼短，翻牌後沒有空間慢慢打，標準打法是「推或棄」：要嘛全下，要嘛棄牌。');
      adv.reasons.push('在這個位置、這個籌碼，大約前 ' + PCT0(sh.pct) + ' 的牌可以全下；你的牌在推或棄的排名是前 ' + PCT0(pc) + '（對子、帶 A 的牌比較前面），' + (go ? '在裡面，全下。對手棄牌你就贏下盲注。' : '不在裡面，棄牌等更好的機會。'));
    } else if (sh.kind === 'reshove') {
      adv.reasons.push('你只剩 ' + fmt1(sh.eff) + ' 個大盲，面對加注：標準打法是「推或棄」，跟注之後翻牌幾乎沒空間打。');
      adv.reasons.push('他開牌大約是前 ' + PCT0(sh.v) + ' 的牌，你全下時他大概只用最好的前 ' + PCT0(sh.vc) + ' 跟（約 ' + PCT0(sh.c) + ' 的時候）。你的牌對那些牌勝率約 ' + PCT0(sh.eq) + '；連他棄牌的時候一起算，全下平均' + (sh.ev > 0 ? '多賺 ' + fmt1(sh.ev) + '，全下。' : '少 ' + fmt1(-sh.ev) + '，棄牌。') + '（這裡大約前 ' + PCT0(sh.pct) + ' 的牌可以推）');
    } else {
      adv.reasons.push('對手全下（或跟了就差不多全下）：照他的位置和籌碼，他大約拿前 ' + PCT0(sh.v) + ' 的牌' + (sh.opp >= 2 ? '，而且已經有 ' + sh.opp + ' 個人在底池裡' : '') + '。');
      adv.reasons.push('你要再付 ' + sh.toCall + '，贏了可以拿 ' + (sh.pot + sh.toCall) + '：勝率要 ' + PCT0(sh.need) + ' 以上才划算。你的牌對他的範圍大約 ' + PCT0(sh.eq) + '，' + (go ? '夠了，跟。' : '不夠，棄牌。') + '（這個賠率大約前 ' + PCT0(sh.pct) + ' 的牌可以跟）');
    }
    if (go) adv.act = sh.kind === 'push' ? { t: 'r', to: L.maxTo } : (L.callAmt >= p.stack || !L.canRaise ? { t: 'c' } : { t: 'r', to: L.maxTo });
    else adv.act = { t: L.canCheck ? 'x' : 'f' };
    adv.label = adv.act.t === 'r' ? '全下 ' + L.maxTo : adv.act.t === 'c' ? '跟注 ' + L.callAmt : adv.act.t === 'x' ? '過牌' : '棄牌';
    adv.short = sh;
    if (sh.kind === 'call') {                                    // 面對全下：用查表的勝率講底池賠率
      const last = H.players[lastAggressorSeat(H)], w = new Float32Array(NCOMBO);
      for (let k = 0; k < NCOMBO; k++) w[k] = PRE_PCT[CLASS_OF[k]] < sh.v ? 1 : 0;
      adv.detail = { street: 0, call: sh.toCall, pot: sh.pot, need: sh.need, est: sh.eq, rand: adv.rand, iters: 40000, eff: sh.eq, fac: [], allin: true, implied: 0, lookup: true,
        opps: last ? [{ seat: last.seat, name: last.name, style: last.style, top: sh.v, act: 'shove', range: rangeText(w) }] : [], behind: [], cards: p.cards.slice(), board: [] };
    } else delete adv.detail;                                    // 推、再推：照推牌表，不是底池賠率
    return adv;
  }
  const ch = chartSpot(H, L.seat);
  if (!ch) return adv;
  adv.chart = ch; ch.canRaise = L.canRaise;
  const best = ch.raise >= ch.call && ch.raise >= ch.fold && L.canRaise ? 'raise' : ch.call >= ch.fold ? 'call' : 'fold';
  const line = '照「' + ch.name + '」的圖表，這手牌：' + chartMixText(ch) + '。' + (Math.max(ch.raise, ch.call, ch.fold) < 0.85 ? '比例混著用，選最常的那個就好。' : '');
  let act, label;
  if (best === 'raise') {
    const to = adv.act.t === 'r' && Math.abs(adv.act.to - chartRaiseTo(H, L, ch)) <= H.bb ? adv.act.to : chartRaiseTo(H, L, ch);
    act = { t: 'r', to }; label = to >= L.maxTo ? '全下 ' + to : (L.isBet ? '下注 ' : '加注到 ') + to;
  } else if (best === 'call') { act = { t: L.canCheck ? 'x' : 'c' }; label = L.canCheck ? '過牌' : '跟注 ' + L.callAmt; }
  else { act = { t: L.canCheck ? 'x' : 'f' }; label = L.canCheck ? '過牌' : '棄牌'; }
  const same = actFamily(act.t) === actFamily(adv.act.t);
  if (same) { adv.reasons.splice(1, 0, line); adv.act = act; adv.label = label; return adv; }
  if (adv.detail) adv.detail.chartDiff = true;
  const head = adv.reasons[0];
  adv.more.unshift('（另外照勝率估的看法：' + adv.reasons.slice(1).join(' ') + '建議是「' + adv.label + '」，跟圖表不一樣時以圖表為準。）');
  adv.reasons.length = 0;
  adv.reasons.push(head, line);
  if (act.t === 'c') adv.reasons.push('要跟 ' + L.callAmt + '：勝率要 ' + PCT0(adv.need) + ' 以上；圖表已經把位置、之後還能贏多少算進去了。');
  if (act.t === 'f') adv.reasons.push(H.players[L.seat].bet > 0 ? '已經放進去的盲注是沉沒成本，不要因為它勉強玩。' : '棄牌不用花錢，等下一手。');
  if (act.t === 'r') adv.reasons.push(ch.kind === 'rfi' ? '主動加注開局：大家都棄牌你就贏下盲注，被跟也有主動權。' : '再加注讓比你差的牌付更多錢，也有一部分是當詐唬用（例如 A5 同花擋住對手的 A）。');
  adv.act = act; adv.label = label;
  return adv;
}
function coachAdviceRule(H, rng) {
  const L = legalActions(H), p = H.players[L.seat];
  const I = heroInfo(H, L.seat, rng, 3000);
  const pot = potTotal(H), need = L.callAmt > 0 ? L.callAmt / (pot + L.callAmt) : 0;
  const R = [], M = [];
  let effNow = null;                                   // 打折後的勝率（有算的話），控制列的一行建議用
  const mk = (act, label) => ({ act, label, reasons: R, more: M, need, eq: I.est, eff: effNow === null ? I.est : effNow, rand: I.rand, info: I });
  const sizeLbl = (to) => (L.isBet ? '下注 ' : '加注到 ') + to;
  if (H.street === 0) {
    const raises = preflopRaises(H), limpers = preflopLimpers(H);
    const thr = openThr(p.pos, 1.0, H.n), pc = posClass(p.pos);
    const head = '你的 ' + CARDS_TOK(sortedCards(p.cards)) + '（' + clsWords(I.g) + '）在 169 種起手牌排第 ' + I.rank + ' 名，大約是前 ' + PCT0(I.pct) + '：' + strengthWord(I.pct, I.rank) + '。';
    if (raises === 0) {
      if (I.pct < thr && L.canRaise) {
        const to = Math.min(L.maxTo, Math.round(H.bb * (2.5 + limpers) + (pc === 'sb' ? H.bb * 0.5 : 0)));
        R.push(head);
        R.push('你在' + POS_ZH[p.pos] + '，' + posWhy(p.pos) + '；這裡建議用前 ' + PCT0(thr) + ' 的牌主動加注開局。');
        R.push('加注到 ' + to + '（' + (to / H.bb) + ' 個大盲' + (limpers ? '，前面有 ' + limpers + ' 個人跛入，每人多加 1 個大盲' : '') + '）：讓後面的人要付更多才能看翻牌，大家都棄牌的話你直接贏下盲注。');
        M.push('對 ' + I.nOpp + ' 家隨機手牌，你的勝率是 ' + PCT0(I.rand) + '。');
        return mk({ t: 'r', to }, '加注到 ' + to);
      }
      if (L.canCheck) {
        R.push(head);
        R.push('沒有人加注，你在大盲不用再花錢就能看翻牌。');
        R.push(I.pct < 0.15 ? '你的牌很強，也可以加注到 ' + (H.bb * (3 + limpers)) + '，但過牌也不差。' : '牌不夠強去加注，過牌免費看三張公牌。');
        return mk({ t: 'x' }, '過牌');
      }
      if (pc === 'sb' && limpers > 0 && I.pct < 0.5) {
        R.push(head);
        R.push('前面有人跛入，你在小盲只要再補 1 就能看翻牌，價錢很便宜。');
        R.push('翻牌後你要第一個說話，所以只建議便宜地跟，不建議加注。');
        return mk({ t: 'c' }, '跟注 ' + L.callAmt);
      }
      R.push(head);
      R.push('你在' + POS_ZH[p.pos] + '，' + posWhy(p.pos) + '；這裡建議只玩前 ' + PCT0(thr) + ' 的牌，你的不在裡面。');
      R.push(p.bet > 0 ? '你在盲注已經放進去的 ' + p.bet + ' 是沉沒成本：不管棄不棄都拿不回來，不要因為它勉強玩。' : '棄牌不用花任何錢，等下一手好牌。');
      return mk({ t: 'f' }, '棄牌');
    }
    // 前面有人加注
    const ag = H.players[H.aggressor >= 0 ? H.aggressor : lastAggressorSeat(H)];
    const agTop = ag ? rangeTopPct(rangeWeights(H, ag.seat, COACH_STYLE_AWARE ? ag.style : 'tag')) : 0.2;
    const who = ag ? ag.name + '（' + styleZh(ag.style) + '）' : '對手';
    const big = L.callAmt > p.stack * 0.4;
    const cn = className(I.g), isPair = cn[0] === cn[1], suited = /s$/.test(cn);
    const pairOrSc = isPair || (suited && Math.abs(RANKS.indexOf(cn[0]) - RANKS.indexOf(cn[1])) <= 2);
    const implied = !big && pairOrSc && p.stack > 15 * L.callAmt ? 0.04 : 0;
    // 勝率打折：沒位置（翻牌後先說話）的牌很難把勝率「打出來」；不同花又不相連的牌更難
    const ip = ag && postflopOrder(H, p.seat) > postflopOrder(H, ag.seat);
    const play = isPair ? 0.95 : suited ? (pairOrSc ? 1 : 0.88) : (RANKS.indexOf(cn[1]) >= 8 ? 0.9 : 0.78);
    const allin = big || L.callAmt >= p.stack;              // 全下就沒有之後的街，不用打折
    const nBehind = (I.behind || []).length;
    const fac = [];
    if (!allin) {
      fac.push(ip ? { x: 0.92, s: '有位置只打 ×0.92（沒位置要 ×0.80）', t: '有位置（翻牌後你比他晚說話，能先看他怎麼做）：打的折比較少；沒位置要 ×0.80' } : { x: 0.8, s: '沒位置 ×0.80（有位置只要 ×0.92）', t: '沒位置（翻牌後你要先說話，看不到他怎麼做）：比較難把勝率打出來；有位置只要 ×0.92' });
      if (play < 1) { const w = isPair ? '口袋對子' : suited ? '同花但不相連' : play < 0.85 ? '不同花、有一張小牌' : '不同花的大牌'; fac.push({ x: play, s: w + ' ×' + play.toFixed(2), t: w + '：' + (isPair ? '沒中三條時翻牌後不好打' : '中牌的方式少，常常只中一對') }); }
      if (I.nOpp > 1) fac.push({ x: 0.95, s: '多人底池 ×0.95', t: '已經有 ' + I.nOpp + ' 個人在底池裡：多人底池更難贏' });
      if (nBehind) fac.push({ x: 0.95, s: '後面 ' + nBehind + ' 人沒說話 ×0.95', t: '後面還有 ' + nBehind + ' 個人沒說話：他們可能再加注，你就得棄牌' });
    }
    const real = fac.reduce((a, f) => a * f.x, 1);
    const eff = I.est * real;
    effNow = eff;
    const mkDetail = () => ({ street: 0, call: L.callAmt, pot, need, est: I.est, rand: I.rand, iters: I.iters, eff, fac, allin, implied,
      opps: I.opps.map((s, i) => ({ seat: s, name: H.players[s].name, style: H.players[s].style, top: rangeTopPct(I.ws[i]), act: preflopActKind(H.log.filter((e) => e.k === 'act' && e.street === 0 && e.seat === s).pop() || {}, H), range: rangeText(I.ws[i]) })),
      behind: (I.behind || []).map((s) => H.players[s].name), cards: p.cards.slice(), board: H.board.slice() });
    R.push(head);
    if (raises >= 2 && I.pct < 0.032 && L.canRaise) {
      const to = big ? L.maxTo : Math.min(L.maxTo, Math.round(H.curBet * 2.4));
      R.push(who + '再加注了，這時候只有最頂級的牌適合繼續；你的牌就是（前 ' + PCT0(I.pct) + '）。');
      R.push('照大家的動作估，你的勝率約 ' + PCT0(I.est) + '。' + (to >= L.maxTo ? '直接全下：' : '再加注到 ' + to + '：') + '讓比你差的牌付錢，比你好的牌非常少。');
      return mk({ t: 'r', to }, to >= L.maxTo ? '全下 ' + to : '加注到 ' + to);
    }
    if (I.pct < 0.056 && L.canRaise && raises === 1) {
      const to = Math.min(L.maxTo, Math.round(H.curBet * (pc === 'bb' || pc === 'sb' ? 3.5 : 3)));
      R.push(who + '加注了；' + (ag ? (STYLE_READ[ag.style] || STYLE_READ.tag).open + '，' : '') + '他的範圍大約是前 ' + PCT0(agTop) + '。你的牌比他絕大部分的牌都好。');
      R.push('照大家的動作估，你的勝率約 ' + PCT0(I.est) + '。再加注（3-bet）到 ' + to + '，讓比你差的牌付更多錢。');
      return mk({ t: 'r', to }, '加注到 ' + to);
    }
    R.push('要跟 ' + L.callAmt + '，跟完底池是 ' + (pot + L.callAmt) + '：勝率要 ' + L.callAmt + '÷' + (pot + L.callAmt) + '＝' + PCT0(need) + ' 以上才划算。');
    const others = I.nOpp > 1 ? '（另外 ' + (I.nOpp - 1) + ' 個跟注的人也照動作估）' : '';
    R.push(who + '加注了（' + (ag ? (STYLE_READ[ag.style] || STYLE_READ.tag).open : '') + '），照他的動作估範圍大約是前 ' + PCT0(agTop) + others + '；把你的牌跟這些牌一路比到攤牌，勝率約 ' + PCT0(I.est) + '（如果他是隨便拿的牌是 ' + PCT0(I.rand) + '）。');
    if (allin) R.push('跟了就全下，之後沒有下注，勝率不用打折。');
    else R.push('但 ' + PCT0(I.est) + ' 是「一定看到攤牌」的勝率；翻牌後還會下注，沒中牌常常得棄牌，實際拿得到的比較少，要打折：' + fac.map((f) => f.s).join('、') + '。打折後大約 ' + PCT0(eff) + '。');
    const out = (a, l) => { const r = mk(a, l); r.detail = mkDetail(); return r; };
    if (I.pct < 0.6 && (eff >= need + 0.02 || eff + implied >= need + 0.02)) {
      if (eff < need + 0.02) R.push('打折後差一點，但你的牌（對子、同花連張）中了大牌時常常能贏很多，這叫「隱含賠率」，可以跟。');
      else R.push(PCT0(eff) + ' ＞ ' + PCT0(need) + '，跟注划算。');
      return out({ t: 'c' }, '跟注 ' + L.callAmt);
    }
    R.push(PCT0(eff) + (eff < need + 0.02 ? ' 不夠 ' + PCT0(need) : ' 雖然接近，但這手牌太弱') + '，跟下去長期會虧，棄牌。');
    if (p.bet > 0) M.push('已經放進去的 ' + p.bet + ' 是沉沒成本，不影響這個判斷。');
    return out({ t: 'f' }, '棄牌');
  }
  // ===== 翻牌後 =====
  const nO = I.nOpp;
  const status = '你現在：' + I.desc + (I.draws ? '，' + I.draws : '') + '。';
  const ta = nO > 1 ? '他們' : '他';
  const eqLine = '還有 ' + nO + ' 個對手；照' + ta + '的動作估，你的勝率約 ' + PCT0(I.est) + '（如果' + ta + '是隨機手牌，是 ' + PCT0(I.rand) + '）。';
  const o = I.outs, outsN = o ? o.total : 0;
  const T = outsN ? outsTable(p.cards, H.board, I.ws) : null;          // 出牌明細：每一張是什麼、中了還領先多少（教練框列出來）
  I.outsT = T;
  const dirty = T && T.eff < outsN - 0.5;
  R.push(status);
  if (L.toCall === 0) {
    const mk0 = (a, l) => { const r = mk(a, l); r.detail = postDetail(H, I, L, pot, 0, I.est, [], 0, p); return r; };
    const valueThr = 0.56 + 0.05 * (nO - 1) + (H.street === 3 ? 0.04 : 0);
    R.push(eqLine);
    if (I.est >= valueThr && L.canRaise) {
      const to = sizeTo(H, L, I.est > 0.8 ? 0.75 : 0.6);
      R.push('你很可能領先：下注讓比你差的牌付錢給你（價值下注）。下注 ' + to + '，大約是底池的 ' + Math.round(to / pot * 100) + '%。');
      return mk0({ t: 'r', to }, sizeLbl(to));
    }
    if (I.draws && outsN >= 8 && H.street < 3 && nO <= 2 && L.canRaise) {
      const to = sizeTo(H, L, 0.5);
      R.push('你有 ' + outsN + ' 張出牌' + (dirty ? '（扣掉中了也常輸的，約 ' + Math.round(T.eff) + ' 張）' : '') + '。下注叫「半詐唬」：對手棄牌你直接贏；被跟的話還有 ' + PCT0(T ? T.pRiverEff : o.pRiver) + ' 的機會成牌（各是哪些牌，看下面的「出牌明細」）。');
      M.push('過牌也可以：免費看下一張。');
      return mk0({ t: 'r', to }, sizeLbl(to));
    }
    R.push(H.street === 3 ? '牌力不夠去下注：比你大的牌會跟，比你小的牌會棄。過牌，直接攤牌比大小。' : '勝率還不夠高去下注。過牌，免費看下一張牌。');
    if (outsN) M.push('下一張有 ' + outsN + ' 張牌讓你明顯變強（' + PCT0(o.pNext) + (dirty ? '；扣掉中了也常輸的是 ' + PCT0(T.pNextEff) : '') + '）。');
    return mk0({ t: 'x' }, '過牌');
  }
  const implied = I.draws && H.street === 1 && p.stack > pot ? 0.05 : I.draws && H.street === 2 && p.stack > pot ? 0.03 : 0;
  R.push('要跟 ' + L.callAmt + '，跟完底池是 ' + (pot + L.callAmt) + '：勝率要 ' + L.callAmt + '÷' + (pot + L.callAmt) + '＝' + PCT0(need) + ' 以上才划算。');
  R.push(eqLine);
  if (I.est > 0.73 && L.canRaise) {
    const to = sizeTo(H, L, 0.8);
    R.push('你很可能是最大的牌：加注到 ' + to + '，讓對手付更多。');
    return mk({ t: 'r', to }, '加注到 ' + to);
  }
  const ipNow = p.seat === lastToActSeat(H);
  const noDisc = H.street === 3 || COACH_NO_DISCOUNT || L.callAmt >= p.stack;
  const fac = noDisc ? [] : [ipNow ? { x: 0.97, s: '你最後說話 ×0.97', t: '你最後說話：之後比較不會被加注，只打一點點折' } : { x: 0.9, s: '後面還有人說話 ×0.90', t: '你後面還有人說話：之後可能被加注、被逼棄牌' }];
  const eff = fac.reduce((a, f) => a * f.x, I.est);
  effNow = eff;
  const out = (a, l) => { const r = mk(a, l); r.detail = postDetail(H, I, L, pot, need, eff, fac, implied, p); return r; };
  if (eff >= need) { R.push(PCT0(I.est) + (eff < I.est - 0.005 ? '（打個折，約 ' + PCT0(eff) + '）' : '') + ' ≥ ' + PCT0(need) + '，跟注划算。'); return out({ t: 'c' }, '跟注 ' + L.callAmt); }
  if (eff + implied >= need) {
    R.push('勝率差一點，但你在聽牌：中了的時候對手常常還會再付錢（隱含賠率），可以跟。');
    return out({ t: 'c' }, '跟注 ' + L.callAmt);
  }
  R.push(PCT0(eff) + (eff < I.est - 0.005 ? '（打折後）' : '') + ' < ' + PCT0(need) + '，跟下去長期會虧，棄牌。');
  return out({ t: 'f' }, '棄牌');
}
/* 詳細解說用的資料（翻牌後） */
function postDetail(H, I, L, pot, need, eff, fac, implied, p) {
  return { street: H.street, call: L.callAmt, pot, need, est: I.est, rand: I.rand, iters: I.iters, eff, fac, allin: L.callAmt >= p.stack, implied,
    opps: I.opps.map((s, i) => ({ seat: s, name: H.players[s].name, style: H.players[s].style, top: rangeTopPct(I.ws[i]), range: rangeText(I.ws[i]) })),
    behind: [], cards: p.cards.slice(), board: H.board.slice(), outs: I.outs ? { total: I.outs.total, pNext: I.outs.pNext, pRiver: I.outs.pRiver } : null };
}
/* 翻牌後說話的順序（數字越大越晚說話） */
function postflopOrder(H, seat) { return (seat - H.button - 1 + H.n) % H.n; }
function lastAggressorSeat(H) {
  for (let i = H.log.length - 1; i >= 0; i--) { const e = H.log[i]; if (e.k === 'act' && (e.t === 'r' || e.t === 'b' || (e.t === 'a' && e.to > e.curBefore))) return e.seat; }
  return -1;
}

/* ===== 你按完以後的評分 ===== */
function actFamily(t) { return t === 'f' ? 'f' : (t === 'x' || t === 'c') ? 'p' : 'a'; }
function gradeAction(adv, ev) {
  const rf = actFamily(adv.act.t), af = actFamily(ev.t === 'a' ? (ev.to !== undefined && !ev.callAll ? 'r' : 'c') : ev.t);
  if (adv.chart) {                                     // 翻牌前照圖表評：這個動作在圖表裡的比例
    const ch = adv.chart, rz = ch.canRaise === false ? ch.raise : 0;
    const f = af === 'a' ? ch.raise : af === 'p' ? (ev.t === 'x' ? ch.call + ch.fold : ch.call + rz) : ch.fold;
    const word = af === 'a' ? '加注' : af === 'p' ? (ev.t === 'x' ? '過牌' : '跟注') : '棄牌';
    if (f >= 0.25) return { mark: 'good', text: '圖表裡這手牌有 ' + Math.round(f * 100) + '% 的時候' + word + '，打得對。', src: 'chart' };
    if (f >= 0.05) return { mark: 'ok', text: '圖表裡這手牌很少' + word + '（' + Math.round(f * 100) + '%），偶爾可以。', src: 'chart' };
    if (af === 'f' && ch.cls !== undefined && PRE_PCT[ch.cls] <= 0.08) return { mark: 'bad', text: '棄掉了強牌：這手牌在前 ' + Math.max(1, Math.round(PRE_PCT[ch.cls] * 100)) + '%，圖表裡不會棄牌（建議：' + adv.label + '）。', src: 'chart' };   // 前 8%（77+、ATs+、KJs+、AJo+）棄掉＝大錯；其他照圖表該玩的牌棄掉＝保守
    return { mark: af === 'f' ? 'ok' : 'bad', text: '圖表裡這手牌不會' + word + '（建議：' + adv.label + '）。' + (af === 'f' ? '保守了。' : ''), src: 'chart' };
  }
  const eq = adv.eq || 0, need = adv.need || 0;
  if (rf === af) {
    if (af === 'a' && adv.act.to && ev.to && Math.abs(ev.to - adv.act.to) > Math.max(4, adv.act.to * 0.5)) return { mark: 'ok', text: '方向對，大小跟建議（' + adv.act.to + '）差比較多。' };
    return { mark: 'good', text: '跟教練的建議一樣。' };
  }
  if (af === 'f') {
    if (eq >= need + 0.1) return { mark: 'bad', text: '棄掉了有利可圖的牌：勝率 ' + PCT0(eq) + ' 比需要的 ' + PCT0(need) + ' 高不少。' };
    return { mark: 'ok', text: '保守了一點，建議是「' + adv.label + '」。' };
  }
  if (rf === 'f') {
    if (af === 'p') return eq >= need - 0.05 ? { mark: 'ok', text: '勉強：勝率 ' + PCT0(eq) + '，需要 ' + PCT0(need) + '，差一點點。' } : { mark: 'bad', text: '勝率 ' + PCT0(eq) + ' 低於需要的 ' + PCT0(need) + '，這樣跟長期會虧。' };
    return { mark: 'bad', text: '很冒險：牌不夠強還加注，被比你大的牌跟就麻煩了。' };
  }
  if (rf === 'a' && af === 'p') return { mark: 'ok', text: '保守了一點：建議「' + adv.label + '」，你的牌值得多收一點錢。' };
  if (rf === 'p' && af === 'a') return eq >= 0.5 ? { mark: 'ok', text: '積極了一點，牌不差，可以接受。' } : { mark: 'bad', text: '勝率只有 ' + PCT0(eq) + '，下注、加注很容易被比你好的牌跟。偶爾詐唬可以，但不要太常。' };
  return { mark: 'ok', text: '建議是「' + adv.label + '」。' };
}

/* ===== 每一步的解說 =====
   ctx = { hero: 座位, seen: Set（第一次才講的規則說明）, peek: 看不看得到對手的牌 }
   回傳 { title, lines: [...], tip: '第一次才講的說明' } */
function tipOnce(ctx, key, text) { if (ctx.seen.has(key)) return ''; ctx.seen.add(key); return text; }
function interpretAct(ev, H) {
  const p = H.players[ev.seat], sr = STYLE_READ[p.style] || STYLE_READ.tag;
  if (ev.street === 0) {
    const kind = preflopActKind(ev, H);
    if (kind === 'open') return sr.open + '（大約前 ' + PCT0(openThr(p.pos, (STYLES[p.style] || STYLES.tag).loose, H.n)) + ' 的牌）。';
    if (kind === 'reraise') return '再加注（3-bet）通常代表很強的牌；' + sr.raise + '。';
    if (kind === 'callRaise') return '跟注加注：牌不錯，但不想把底池弄得更大。';
    if (kind === 'limp') return '只跟大盲（跛入）：通常是中等的牌，想便宜看翻牌。';
    if (kind === 'check') return '大盲過牌：沒人加注，免費看翻牌。';
    return '';
  }
  if (ev.t === 'b') return sr.bet + '。';
  if (ev.t === 'r') return sr.raise + '。';
  if (ev.t === 'a') return ev.callAll ? '用全部籌碼跟注。' : '全部籌碼推進去，壓力很大；' + sr.raise + '。';
  if (ev.t === 'c') return '跟注：可能是中等的牌，或在等聽牌。';
  if (ev.t === 'x') return '過牌：可能牌不強，也可能想設陷阱。';
  return '';
}
function narrate(ev, H, ctx) {
  const hero = H.players[ctx.hero];
  const name = (s) => (s === ctx.hero ? '你' : H.players[s].name);
  const L = [];
  let title = '', tip = '';
  if (ev.k === 'blinds') {
    title = '第 ' + H.no + ' 手開始';
    L.push('按鈕（D）在' + name(H.button) + '。' + name(ev.sb.seat) + '下小盲 ' + ev.sb.amt + '、' + name(ev.bb.seat) + '下大盲 ' + ev.bb.amt + '。');
    L.push('你坐在' + POS_ZH[hero.pos] + '：' + posWhy(hero.pos) + '。');
    if (H.rebuy && H.rebuy.indexOf(ctx.hero) >= 0) L.push('你上一手籌碼輸光了，自動補回 ' + GAME_STACK + '。');
    if (H.tourney) L.push('盲注 ' + H.sb + '／' + H.bb + '。');
    tip = tipOnce(ctx, 'blinds', '小盲、大盲是每手牌強制先下的錢，讓每一手都有東西可以搶。按鈕每手往左移一位，大家輪流當盲注。');
  } else if (ev.k === 'deal') {
    title = '發手牌';
    const g = heroCls(hero.cards);
    L.push('每人兩張，只有自己看得到。你拿到 ' + CARDS_TOK(sortedCards(hero.cards)) + '（' + clsWords(g) + '）' + (ctx.exam ? '。' : '：在 169 種起手牌排第 ' + PRE_RANK[g] + ' 名，' + strengthWord(PRE_PCT[g], PRE_RANK[g]) + '。'));
    if (!ctx.exam && typeof handShape === 'function') {
      const sh = handShape(g);
      if (sh.trap) L.push('⚠ 這是「大配小」的陷阱牌：一張大牌配一張小牌，看起來不錯，其實中了頂對踢腳輸、沒中就什麼都沒有' + (sh.suited ? '；同花只多一條同花的路，要到後位偷盲才開' : '，順子也湊不出來') + '（第 2-8 課）。');
      else if (sh.k === 'sconn') L.push('💎 同花連張：對隨機牌的勝率不高，但順子、同花兩條路都寬，沒中就棄、輸得少——實戰比看起來強。');
    }
    if (H.toAct >= 0) L.push('翻牌前從' + name(H.toAct) + '開始說話' + (H.n > 2 ? '（大盲左邊那一位）' : '（兩人時按鈕先說話）') + '，順時針一個一個來。');
    tip = tipOnce(ctx, 'deal', '之後中間會陸續發 5 張公牌，大家共用。最後每個人用自己 2 張加 5 張公牌，挑最好的 5 張比大小。說話時可以：棄牌（放棄這一手）、跟注（跟到目前最高的注）、加注（下更多）。');
    if (!tip && !ctx.exam && typeof handShape === 'function' && handShape(g).trap) tip = tipOnce(ctx, 'shape', '能玩的起手牌只有四種樣子：兩張都大（都 10 以上）、對子、同花連張、同花 A。「大配小」是最常見的虧錢牌：對手會跟你打到底的都是好牌，你中頂對時他的踢腳幾乎都比你大——贏小輸大。');
  } else if (ev.k === 'act') {
    const p = H.players[ev.seat];
    if (ev.seat === ctx.hero) { title = '你' + actWord(ev, H); }
    else {
      title = p.name + '（' + styleZh(p.style) + '）' + actWord(ev, H);
      const it = interpretAct(ev, H);
      if (it) L.push(it);
    }
    if (ev.t !== 'f' && ev.t !== 'x') L.push('底池現在 ' + ev.potAfter + '。');
  } else if (ev.k === 'folds') {
    title = ev.seats.map(name).join('、') + ' 棄牌';
    L.push(ev.seats.length > 1 ? '這幾位都退出這一手。' : '退出這一手。');
  } else if (ev.k === 'street') {
    title = '發' + STREET_NAME[ev.street] + '：' + CARDS_TOK(ev.cards);
    if (ev.runout) L.push('能下注的人都全下了，不用再下注，直接把公牌發完。');
    const live = H.players.filter((q) => !q.folded);
    if (!hero.folded) {
      const v = evalCards(hero.cards.concat(H.board));
      if (!ctx.exam) L.push('你現在：' + handWords(hero.cards, H.board) + '。');      // 實戰考核：牌力、勝率都自己判斷
      void v;
      if (ctx.info && !ctx.exam) {
        const I = ctx.info;
        if (I.draws) L.push('你有' + I.draws + '：下一張有 ' + I.outs.total + ' 張牌讓你變強。');
        const ta = live.length - 1 > 1 ? '他們' : '他';
        L.push('還有 ' + (live.length - 1) + ' 個對手（' + live.filter((q) => q !== hero).map((q) => q.name).join('、') + '）。照' + ta + '的動作估，你的勝率約 ' + PCT0(I.est) + '；對隨機手牌是 ' + PCT0(I.rand) + '。');
      }
    } else L.push('你已經棄牌了，看看還在的 ' + live.length + ' 個人怎麼打。');
    if (ev.street === 1) tip = tipOnce(ctx, 'flop', '翻牌一次發三張。翻牌後從按鈕左邊還沒棄牌的人開始說話；沒人下注時可以「過牌」（不下注，把說話的機會交給下一位）。');
    else if (ev.street === 2) tip = tipOnce(ctx, 'turn', '轉牌是第四張公牌，發完一樣再下注一輪。');
    else tip = tipOnce(ctx, 'river', '河牌是最後一張公牌。下完這一輪注，還沒棄牌的人就要亮牌比大小（攤牌）。');
  } else if (ev.k === 'show') {
    title = '攤牌：亮牌比大小';
    for (const h of ev.hands) L.push(name(h.seat) + '：' + CARDS_TOK(sortedCards(h.cards)) + ' → ' + h.desc);
    tip = tipOnce(ctx, 'show', '比的是自己 2 張加公牌 5 張裡最好的 5 張。牌型大小可以按右上角的「牌型」看。');
  } else if (ev.k === 'win') {
    const r = ev.res;
    if (r.uncontested) {
      const w = r.pots[0] ? r.pots[0].winners[0] : -1;
      const tot = r.won[w];
      title = name(w) + '贏得 ' + tot;
      L.push('其他人都棄牌了，' + (w === ctx.hero ? '你' : name(w)) + '不用亮牌就拿走底池。');
    } else {
      const main = r.pots.filter((x) => !x.refund);
      const ws = [...new Set(main.flatMap((x) => x.winners))];
      title = ws.map(name).join('、') + '贏得 ' + ws.map((s) => r.won[s]).reduce((a, b) => a + b, 0);
      main.forEach((x, i) => {
        const lbl = main.length > 1 ? (i === 0 ? '主池' : '邊池' + (main.length > 2 ? i : '')) : '底池';
        L.push(lbl + ' ' + x.amt + '：' + x.winners.map(name).join('、') + (x.winners.length > 1 ? '平分' : '') + '（' + x.desc + '）。');
      });
      if (main.length > 1) L.push('全下的人只能贏到「自己投入多少、每個對手就拿多少」的部分，超過的另外成為邊池。');
    }
    r.pots.filter((x) => x.refund).forEach((x) => L.push('沒人跟的 ' + x.amt + ' 退回給' + name(x.winners[0]) + '。'));
    const net = r.net[ctx.hero];
    L.push('你這一手' + (net > 0 ? '贏了 ' + net : net < 0 ? '輸了 ' + (-net) : '不輸不贏') + '。');
  }
  return { title, lines: L, tip };
}
function setCoachStyleAware(x) { COACH_STYLE_AWARE = !!x; }
function setCoachNoDiscount(x) { COACH_NO_DISCOUNT = !!x; }
