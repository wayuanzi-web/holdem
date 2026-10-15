/* ===== 36-lens：工具「範圍透視」——對手的範圍（廢牌拿掉之後剩什麼）、你的牌對它的勝率、公牌和動作怎麼把它縮小 ===== */
const LS = { spot: '6/rfi/UTG#raise', custom: null, slots: [-1, -1, -1, -1, -1, -1, -1], active: 0, acts: { 1: '', 2: '', 3: '' }, style: 'tag', ret: null };
const LS_ACT_ZH = { '': '還沒動作／不知道', check: '過牌', bet: '下注或加注', call: '跟注' };
function lsHero() { const s = LS.slots; return s[0] >= 0 && s[1] >= 0 ? [s[0], s[1]] : null; }
function lsBoard() { const b = LS.slots.slice(2).filter((c) => c >= 0); return b.length >= 3 ? b : []; }
/* 現在的範圍：翻牌前的起點，再照每條街的公牌和動作縮小 */
function lsWeights() {
  let w = LS.custom ? LS.custom.w : lensPreflop(LS.spot);
  if (!w) return null;
  const b = lsBoard(), steps = [];
  if (!LS.custom) for (let st = 1; st <= 3; st++) { const n = st + 2; if (b.length >= n && LS.acts[st]) { w = lensNarrow(w, b.slice(0, n), LS.acts[st], LS.style); steps.push(st); } }
  return { w, steps };
}
function lensGridHTML(w) {
  let h = '<div class="grid13 lsgrid">';
  for (let g = 0; g < 169; g++) {
    const cs = CLASS_COMBOS[g]; let s = 0; for (const k of cs) s += w[k]; const x = s / cs.length;
    h += '<div class="cell" style="background:' + (x > 0.005 ? 'rgba(208,168,78,' + (0.15 + 0.85 * Math.min(1, x)).toFixed(2) + ')' : '') + '" title="' + className(g) + (x > 0.005 ? ' ' + Math.round(x * 100) + '%' : '') + '"><span>' + className(g) + '</span></div>';
  }
  return h + '</div>';
}
function renderLens() {
  const sel = $('lsSpot');
  if (!sel.options.length) {
    let grp = '', h = '';
    for (const s of lensSpots()) { if (s.grp !== grp) { if (grp) h += '</optgroup>'; grp = s.grp; h += '<optgroup label="' + esc(grp) + '">'; } h += '<option value="' + s.id + '">' + esc(s.zh) + '</option>'; }
    sel.innerHTML = h + '</optgroup>';
  }
  sel.value = LS.spot; sel.disabled = !!LS.custom;
  $('lsCustom').hidden = !LS.custom;
  if (LS.custom) $('lsCustom').innerHTML = '牌局帶入：<b>' + esc(LS.custom.name) + '</b>的估計範圍（教練照他到現在每一條街的動作估的，公牌和動作已經算進去）。<button type="button" class="linkbtn" data-ls="uncustom">改用圖表的範圍</button>';
  const W = lsWeights();
  if (!W) { $('lsSummary').innerHTML = '<p class="note">沒有這個圖表。</p>'; return; }
  const w0 = LS.custom ? LS.custom.w : lensPreflop(LS.spot), st0 = lensStats(w0, 8), st = lensStats(W.w, 8), sh = lensShapes(W.w);
  // 範圍的摘要
  let h = '<div class="lsnum"><div><b>' + pct(st0.pct, 0) + '%</b><small>的起手牌</small></div><div><b>' + Math.round(st0.combos) + '</b><small>個組合</small></div><div><b>' + st0.classes + '</b><small>種牌</small></div><div><b>' + pct(st0.top[0].share, 1) + '%</b><small>最可能的一種（' + NAMEZH(st0.top[0].g) + '）</small></div></div>';
  h += '<p class="note">1,326 個組合裡他只會有這 ' + Math.round(st0.combos) + ' 個（廢牌都拿掉了），但還是分散在 ' + st0.classes + ' 種牌上：你猜不中「哪一手」，猜得到的是<b>分布</b>——下面的樣子和類別。</p>';
  h += '<div class="lsshape">' + sh.map((x) => '<div class="' + (x.k === 'bigsmall' ? 'tr' : x.k === 'junk' ? 'dim' : '') + '"><span>' + x.zh + '</span><i style="width:' + (x.share * 100).toFixed(1) + '%"></i><b>' + Math.round(x.share * 100) + '%</b></div>').join('') + '</div>';
  h += '<p class="note">最可能的幾種：' + st.top.map((x) => '<button type="button" class="lnh t' + HAND_TIER[x.g] + '" data-ln="hand" data-g="' + x.g + '">' + NAMEZH(x.g) + ' ' + pct(x.share, 1) + '%</button>').join('') + '</p>';
  h += lensGridHTML(W.w) + '<p class="note">13×13：越亮越可能（右上同花、左下不同花、斜線對子）。' + (W.steps.length ? '已經照' + W.steps.map((s) => STREET_NAME[s] + '「' + LS_ACT_ZH[LS.acts[s]] + '」').join('、') + '縮小：剩約 ' + Math.round(st.combos) + ' 個組合的份量。' : '') + '</p>';
  $('lsSummary').innerHTML = h;
  // 你的牌、公牌
  const s = LS.slots;
  const slot = (i) => '<span role="button" tabindex="0" data-lslot="' + i + '">' + cardHTML(s[i], i === LS.active ? 'on' : '') + '</span>';
  $('lsSlots').innerHTML = '<div><h3>你的牌</h3><div class="row">' + slot(0) + slot(1) + '</div></div><div><h3>公牌</h3><div class="row">' + slot(2) + slot(3) + slot(4) + '<span class="gap"></span>' + slot(5) + '<span class="gap"></span>' + slot(6) + '</div></div>';
  const used = new Uint8Array(52); for (const c of s) if (c >= 0) used[c] = 1;
  $('lsDeck').innerHTML = deckButtons(DECK_ORDER, used);
  const b = lsBoard(), hero = lsHero();
  // 翻牌後的動作
  let ah = '';
  if (b.length >= 3 && !LS.custom) {
    ah = '<p>他在每一條街做了什麼？（照教練估範圍的公式縮小）</p><div class="lsacts">';
    for (let stI = 1; stI <= 3; stI++) { if (b.length < stI + 2) break; ah += '<label>' + STREET_NAME[stI] + '<select data-lsact="' + stI + '">' + Object.keys(LS_ACT_ZH).map((k) => '<option value="' + k + '"' + (LS.acts[stI] === k ? ' selected' : '') + '>' + LS_ACT_ZH[k] + '</option>').join('') + '</select></label>'; }
    ah += '<label>他的風格<select id="lsStyle">' + ['tag', 'lag', 'rock', 'station', 'maniac'].map((k) => '<option value="' + k + '"' + (LS.style === k ? ' selected' : '') + '>' + STYLES[k].zh + '</option>').join('') + '</select></label></div>';
  }
  $('lsActs').innerHTML = ah;
  // 結果
  let r = '';
  if (b.length >= 3) {
    const B = lensBoard(W.w, b, hero);
    r += '<h3>公牌 ' + b.map((c) => cardSpan(c)).join('') + ' 上，他的範圍裡有什麼</h3><table class="stt lnt lsres"><tr><th>類別</th><th class="r">佔他範圍</th><th class="r">組合</th>' + (hero ? '<th class="r">你的勝率</th>' : '') + '</tr>'
      + B.rows.map((x) => '<tr class="' + (x.name === '兩對以上' || x.name === '超對' || x.name === '頂對' ? 'st' : '') + '"><td>' + x.name + '</td><td class="r num">' + Math.round(x.share * 100) + '%</td><td class="r num">' + Math.round(x.combos) + '</td>' + (hero ? '<td class="r num"><b>' + Math.round(x.eq * 100) + '%</b></td>' : '') + '</tr>').join('')
      + '<tr class="lnsum"><td><b>頂對以上</b><small>會跟你打到底的牌</small></td><td class="r num"><b>' + Math.round(B.strongShare * 100) + '%</b></td><td class="r num">' + Math.round(B.strongShare * B.combos) + '</td>' + (hero ? '<td class="r num"><b>' + Math.round(B.strongEq * 100) + '%</b></td>' : '') + '</tr></table>';
    if (hero) r += '<p>你拿 ' + hero.map((c) => cardSpan(c)).join('') + '：對他<b>整個範圍</b> <b>' + Math.round(B.all * 100) + '%</b>（對隨機牌 ' + Math.round(B.rand * 100) + '%）；只看會跟你打到底的頂對以上 <b>' + Math.round(B.strongEq * 100) + '%</b>。' + (B.strongEq < 0.4 && B.all > 0.6 ? '典型的「贏小輸大」：他沒中會棄，中了比你大才跟。' : '') + '</p>';
    r += '<p class="note">類別照工作室的牌力分級（第 6-1 課）。要算「他下注之後」，在上面選那條街的動作。</p>';
  } else if (hero) {
    const pe = lensPreEq(W.w, hero, lnRng());
    r += '<h3>翻牌前</h3><p>你拿 ' + hero.map((c) => cardSpan(c)).join('') + '：對這個範圍的勝率約 <b>' + Math.round(pe.eq * 100) + '%</b>（模擬 3,000 次），對隨機牌 ' + Math.round(pe.rand * 100) + '%。' + (pe.rand - pe.eq > 0.08 ? '差這麼多，就是「對手不是隨機牌」的意思（第 2-8 課）。' : '') + '</p><p class="note">放 3 張公牌，就能看翻牌上他的範圍變成什麼。</p>';
  } else r += '<p class="note">放你的兩張牌可以算勝率；放 3 張以上公牌可以看他在這個公牌上有什麼。</p>';
  $('lsResult').innerHTML = r;
}
function lsNextActive() { for (let k = 1; k <= 7; k++) { const i = (LS.active + k) % 7; if (LS.slots[i] < 0) { LS.active = i; return; } } LS.active = -1; }
/* 從課程或牌局帶入 */
function lensLoad(o) {
  LS.custom = o.custom || null;
  if (o.spot) LS.spot = o.spot;
  LS.slots = [-1, -1, -1, -1, -1, -1, -1];
  (o.hero || []).forEach((c, i) => { LS.slots[i] = c; });
  (o.board || []).forEach((c, i) => { LS.slots[2 + i] = c; });
  LS.acts = Object.assign({ 1: '', 2: '', 3: '' }, o.acts || {});
  LS.active = LS.slots.indexOf(-1);
  showView('tools'); showTab('tLens');
  renderLens();
  window.scrollTo(0, 0);
}
function lensFromGame(d) {
  if (!d || !d.opps.length) return;
  const o = d.opps[0];
  lensLoad({ custom: { w: parseRange(o.range), name: o.name + '（' + styleZh(o.style) + '）' }, hero: d.cards.slice(), board: d.board.slice() });
}
function initLens() {
  $('lsSpot').addEventListener('change', (e) => { LS.spot = e.target.value; renderLens(); });
  $('pLens').addEventListener('click', (e) => {
    const sl = e.target.closest('[data-lslot]');
    if (sl) { const i = +sl.dataset.lslot; if (LS.slots[i] >= 0) LS.slots[i] = -1; LS.active = i; renderLens(); return; }
    const dk = e.target.closest('#lsDeck button[data-c]');
    if (dk) { const c = +dk.dataset.c; if (LS.slots.indexOf(c) >= 0) return; if (LS.active < 0) lsNextActive(); if (LS.active < 0) return; LS.slots[LS.active] = c; lsNextActive(); renderLens(); return; }
    const b = e.target.closest('[data-ls]');
    if (b) {
      const a = b.dataset.ls;
      if (a === 'clear') { LS.slots = [-1, -1, -1, -1, -1, -1, -1]; LS.active = 0; LS.acts = { 1: '', 2: '', 3: '' }; }
      else if (a === 'flop') { const used = new Set(LS.slots.filter((c) => c >= 0)); const rng = lnRng(); for (let i = 2; i < 5; i++) if (LS.slots[i] < 0) { let c; do { c = (rng() * 52) | 0; } while (used.has(c)); used.add(c); LS.slots[i] = c; } LS.active = LS.slots.indexOf(-1); }
      else if (a === 'uncustom') LS.custom = null;
      renderLens(); return;
    }
    const hb = e.target.closest('[data-ln="hand"]');
    if (hb) openHandModal(+hb.dataset.g);
  });
  $('pLens').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.lsact) { LS.acts[+t.dataset.lsact] = t.value; renderLens(); }
    else if (t.id === 'lsStyle') { LS.style = t.value; renderLens(); }
  });
  renderLens();
}
