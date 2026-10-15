/* ===== 52-deep：教練的「詳細解說」——底池賠率、勝率怎麼算、為什麼打折，用這一手的實際數字一步一步講 ===== */
const ACT_KIND_ZH = { shove: '全下', open: '加注開局', reraise: '再加注', callRaise: '跟注別人的加注', limp: '跛入（只跟大盲）', check: '過牌' };
const P1 = (x) => Math.round(x * 100);

/* 勝率條：打折後的勝率（填色）和打平線（直線） */
function deepBar(eff, need) {
  const ok = eff >= need;
  return '<div class="eqbar" role="img" aria-label="你的勝率 ' + P1(eff) + '%，打平要 ' + P1(need) + '%">'
    + '<i class="fill ' + (ok ? 'ok' : 'no') + '" style="width:' + Math.min(100, eff * 100).toFixed(1) + '%"></i>'
    + '<b class="mark" style="left:' + Math.min(100, need * 100).toFixed(1) + '%"></b></div>'
    + '<div class="eqlegend"><span><i class="sw ' + (ok ? 'ok' : 'no') + '"></i>你的勝率（打折後）' + P1(eff) + '%</span><span><i class="sw mk"></i>打平線 ' + P1(need) + '%</span></div>';
}

function deepHTML(d) {
  if (!d) return '';
  let h = '';
  if (d.chartDiff) h += '<p class="note">這手的建議照翻牌前圖表（圖表把之後每一條街能贏多少都算進去了）。下面是用勝率和底池賠率算的另一個角度，兩個不一樣時以圖表為準。</p>';
  if (d.lookup) h += '<p class="note">這是短碼面對全下的情況：勝率用事先模擬好的表查（每種起手牌對「前 v% 的牌」各模擬 4 萬次）。</p>';
  const after = d.pot + d.call;
  // 1. 底池賠率
  if (d.call > 0) {
    const n = 100, win = Math.round(d.eff * 100), back = win * after, pay = d.call * n, diff = back - pay;
    const evOne = d.eff * after - d.call;
    h += '<h4>① 為什麼勝率要 ' + P1(d.need) + '% 以上才划算？</h4>'
      + '<p>現在底池有 <b>' + d.pot + '</b>。你跟 <b>' + d.call + '</b> 之後，底池變成 <b>' + after + '</b>（你放進去的 ' + d.call + ' 也在裡面）。贏了就把這 ' + after + ' 全部拿走；輸了，你的 ' + d.call + ' 就沒了。</p>'
      + '<p>想像<b>一模一樣的情況打 100 次</b>，每次都跟：</p>'
      + '<table class="dtab"><tr><td>一共付出</td><td class="r">' + d.call + ' × 100 ＝ <b>' + pay + '</b></td></tr>'
      + '<tr><td>勝率剛好 ' + P1(d.need) + '% 時</td><td class="r">贏 ' + P1(d.need) + ' 次 × ' + after + ' ＝ ' + Math.round(d.need * 100) * after + '（≈ 付出的，打平）</td></tr>'
      + '<tr><td>你的勝率 ' + win + '% 時</td><td class="r">贏 ' + win + ' 次 × ' + after + ' ＝ <b>' + back + '</b>，' + (diff >= 0 ? '多賺 ' + diff : '<span class="neg">少了 ' + (-diff) + '</span>') + '</td></tr></table>'
      + '<p>所以「打平要的勝率」＝ 要跟的 ÷ 跟完的底池 ＝ ' + d.call + ' ÷ ' + after + ' ＝ <b>' + P1(d.need) + '%</b>。這叫<b>底池賠率</b>。勝率比它高，長期跟注會賺；比它低，長期會虧（照你的勝率，平均每跟一次' + (evOne >= 0 ? '賺' : '虧') + '約 ' + fmt(Math.abs(evOne), 1) + '）。</p>'
      + deepBar(d.eff, d.need)
      + '<p class="note">底池越大、要跟的越少，打平線就越低：例如跟 5 搶 100 的底池，只要 5 ÷ 105 ≈ 5% 就划算。</p>';
  }
  // 2. 勝率怎麼算
  h += '<h4>' + (d.call > 0 ? '②' : '①') + ' 你的勝率 ' + P1(d.est) + '% 是怎麼算的？</h4>';
  h += '<p><b>第 1 步：猜對手可能拿什麼牌（範圍）。</b>看不到他的牌，只能照他的位置和動作猜：</p><ul class="dopp">';
  for (const o of d.opps) {
    const w = parseRange(o.range);
    h += '<li><div class="dmini">' + miniGridHTML(w) + '</div><div><b>' + esc(o.name) + '</b>（' + esc(styleZh(o.style)) + '）'
      + (d.street === 0 ? (o.act && ACT_KIND_ZH[o.act] ? ACT_KIND_ZH[o.act] : '有動作') + '：' : '照他到現在每一條街的動作：')
      + '估計他手上是最好的<b>前 ' + P1(o.top) + '%</b> 的牌（左邊的格子，越亮越可能；右上同花、左下不同花、斜線是對子）。</div></li>';
  }
  h += '</ul>';
  if (d.behind && d.behind.length) h += '<p>後面還沒說話的 ' + d.behind.map(esc).join('、') + '：大多會棄牌，所以先不算進去（他們可能再加注，第 ' + (d.call > 0 ? '③' : '②') + ' 段會打一點折）。</p>';
  h += '<p class="note">教練一律先當對手是一般的緊凶玩家來估範圍（實測比照風格估還穩），風格只用在說明。</p>';
  const left = 5 - d.board.length;
  h += '<p><b>第 2 步：電腦模擬 ' + (d.iters || 3000).toLocaleString() + ' 次。</b>每一次：照範圍幫對手抽一手牌（越可能的牌越常被抽到，跟你的牌或公牌撞到的不會抽）'
    + (left > 0 ? '，再把剩下的 ' + left + ' 張公牌隨機發完' : '') + '，比大小；你贏算 1 次、平手算半次。全部平均起來，你贏的比例約 <b>' + P1(d.est) + '%</b>。</p>';
  h += '<p><b>對照：</b>如果他是隨便拿的牌，你的勝率是 ' + P1(d.rand) + '%。' + (d.rand - d.est > 0.05 ? '他只用好牌' + (d.street === 0 ? '加注' : '這樣打') + '，所以你的勝率低很多——這就是「看動作猜範圍」的意思。' : d.est - d.rand > 0.05 ? '他的動作看起來牌不強，所以你的勝率比對隨便的牌還高。' : '') + '</p>';
  if (d.outs && d.outs.total) h += '<p>你還有 ' + d.outs.total + ' 張「出牌」（下一張出來就明顯變強）：下一張中的機率約 ' + P1(d.outs.pNext) + '%' + (d.outs.pRiver !== undefined && d.board.length === 3 ? '，到河牌約 ' + P1(d.outs.pRiver) + '%' : '') + '。模擬已經把這些算進去了。</p>';
  // 3. 打折
  if (d.call > 0) {
    const sec = '③';
    if (d.allin) h += '<h4>' + sec + ' 不用打折</h4><p>你跟了就全下，之後沒有人能再下注，一定看到攤牌：勝率就是 ' + P1(d.est) + '%。</p>';
    else if (!d.fac.length) h += '<h4>' + sec + ' 不用打折</h4><p>' + (d.street === 3 ? '河牌之後沒有牌、也沒有下一條街，跟了就直接攤牌：' : '') + '勝率就是 ' + P1(d.est) + '%。</p>';
    else {
      h += '<h4>' + sec + ' 為什麼還要打折？</h4><p>' + P1(d.est) + '% 是「<b>一定看到最後、攤牌比大小</b>」的勝率。但之後大家還會下注：你沒中牌時常常只能棄牌，那一部分勝率就拿不到。實際拿得到的比較少，這叫<b>勝率實現</b>。這手打的折：</p><ul>';
      for (const f of d.fac) h += '<li>× ' + f.x.toFixed(2) + '　' + esc(f.t) + '</li>';
      h += '</ul><p>' + P1(d.est) + '% ' + d.fac.map((f) => '× ' + f.x.toFixed(2)).join(' ') + ' ≈ <b>' + P1(d.eff) + '%</b>。</p>'
        + '<p class="note">這些折數是教練的經驗值（參考 GTO 解的平均），不是精確計算。要把之後每一條街都真的算進去，要用「工具 → GTO 工作室」求解。</p>';
      if (d.implied > 0) h += '<p>另外，對子、同花連張這種牌中了大牌時常常能多贏很多（隱含賠率），教練會再寬鬆約 ' + P1(d.implied) + '%。</p>';
    }
    h += '<h4>結論</h4><p><b>' + P1(d.eff) + '% ' + (d.eff >= d.need ? '≥' : '＜') + ' ' + P1(d.need) + '%</b>：' + (d.eff >= d.need ? '跟注長期會賺。' : d.eff + (d.implied || 0) >= d.need ? '差一點，但有隱含賠率，可以跟。' : '跟下去長期會虧，棄牌。') + '</p>';
  }
  h += '<div class="strow"><button type="button" class="btn sm" data-deep="lens">🔍 範圍透視：他現在可能有什麼</button><button type="button" class="btn sm" data-deep="rvr">用「範圍對範圍」自己算一次</button></div>'
    + '<p class="note">範圍透視會列出' + esc(d.opps[0] ? d.opps[0].name : '對手') + '的估計範圍裡每一類牌佔多少、你對每一類的勝率；範圍對範圍會打開勝率計算機自己模擬。看完按上面的「回到牌局」接著打。</p>';
  return h;
}

/* 帶到範圍對範圍 */
function deepToRvr(d) {
  if (!d || !d.opps.length) return;
  RV.a = d.cards.map(cardStr).join('');
  RV.b = d.opps[0].range;
  RV.names = ['你的牌', d.opps[0].name + '的估計範圍'];
  RV.board = d.board.slice();
  showView('tools'); showTab('tCalc');
  rvMode(true);
  window.scrollTo(0, 0);
}
