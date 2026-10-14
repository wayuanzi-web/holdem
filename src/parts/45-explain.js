/* ===== 45-explain：深入說明（勝率怎麼算、名詞解釋）。頁面右上「深入說明」可以關掉 ===== */
const EXPLAIN = { on: true };
try { const v = localStorage.getItem('dezhou-explain'); if (v !== null) EXPLAIN.on = v === '1'; } catch (e) { /* 沒有儲存空間 */ }
function setExplain(on) {
  EXPLAIN.on = !!on;
  try { localStorage.setItem('dezhou-explain', on ? '1' : '0'); } catch (e) { /* 忽略 */ }
  document.body.classList.toggle('noexplain', !EXPLAIN.on);
  document.querySelectorAll('.explainChk').forEach((x) => { x.checked = EXPLAIN.on; });
}

/* 名詞解釋：教練的文字裡出現這些詞，就可以點開看 */
const GLOSS = {
  '底池賠率': '要跟的錢 ÷ 跟完之後的底池。例如跟 4、跟完底池是 15：4÷15＝27%。你的勝率高過 27%，長期跟注會賺；低於就會虧。',
  '勝率要': '這就是「底池賠率」：要跟的錢 ÷ 跟完之後的底池。你的勝率比它高，長期跟注會賺；比它低，長期會虧。',
  '對隨機手牌': '假設對手拿的是任意兩張牌，不管他之前怎麼打。這是最基本的算法，但通常會高估你的勝率：還留在牌局裡的人，牌一般比隨機的好。',
  '照他們的動作估': '對手加注、跟注、下注，都會透露他的牌大概在哪裡。教練把他比較可能拿的牌加重、不太可能的減輕，再算你的勝率，通常比「對隨機手牌」準。',
  '照他的動作估': '對手加注、跟注、下注，都會透露他的牌大概在哪裡。教練把他比較可能拿的牌加重、不太可能的減輕，再算你的勝率，通常比「對隨機手牌」準。',
  '範圍': '一個人在這個情況下「可能拿著的所有手牌」。例如「前 20%」就是 169 種起手牌裡最好的那 20%。',
  '有位置': '翻牌後比對手晚說話。你看得到他怎麼做再決定，資訊比較多，所以比較有利。',
  '沒位置': '翻牌後比對手先說話。你得先做決定，對手看了再反應，所以比較吃虧。',
  '打折': '勝率是「一路打到攤牌」的數字。沒位置、或牌不好打（不同花、不相連）的時候，常常還沒攤牌就被逼著棄牌，實際拿得到的會比較少，所以要打個折。',
  '隱含賠率': '現在跟注的價錢有點貴，但如果中了大牌，對手之後還會再付錢給你。把這些之後會贏的錢算進去，跟注可能就划算。',
  '半詐唬': '還沒成牌、但有聽牌時下注：對手棄牌你直接贏；對手跟了，你還有機會補到牌。',
  '價值下注': '你的牌很可能比對手好的時候下注，讓比你差的牌付錢跟你。',
  '沉沒成本': '已經放進底池的錢，不管接下來怎麼做都拿不回來，所以不應該影響接下來的判斷。',
  '出牌': '下一張公牌如果是這些牌，你的牌會明顯變強。',
  '2–4 法則': '出牌數 × 4 ≈ 翻牌時「到河牌至少中一次」的機率；出牌數 × 2 ≈「下一張就中」的機率。不用算，心算就好。',
  '跛入': '翻牌前只跟大盲、不加注。',
  '3-bet': '翻牌前有人加注之後再加注。（第一次加注算 2-bet。）',
  '踢腳': '兩個人牌型一樣大時，比剩下最大的牌，那張牌叫踢腳。',
  '起手牌': '一開始發給你的兩張牌。169 種是把花色不重要的組合合併後的數量（例如 A♠K♠、A♥K♥ 都算「AK 同花」）。',
  '聽牌': '差一張就成牌，例如同花差一張（同花聽牌）、順子差一張（順子聽牌）。',
  '詐唬': '牌不好卻下注或加注，想讓比你好的牌棄牌。',
  '位置': '翻牌後說話的先後順序。按鈕位最後說話最有利，小盲、大盲最先說話最吃虧。',
  '緊凶': '電腦對手的打法之一：牌好才玩，玩就積極下注。它下注、加注通常是真的有牌。',
  '鬆凶': '電腦對手的打法之一：玩很多手牌，常常主動下注、加注，裡面有不少詐唬。',
  '岩石': '電腦對手的打法之一：很少玩，一下大注通常是大牌。',
  '跟注站': '電腦對手的打法之一：什麼都跟、很少棄牌，也很少加注。對它少詐唬、多價值下注。',
  '瘋子': '電腦對手的打法之一：一直加注，常常是詐唬。牌不錯就可以跟它打到底。',
  'GTO': '賽局理論最佳解（Game Theory Optimal）：雙方都照它打的時候，誰改打法都只會更差。它不針對對手的弱點，但也不會被對手針對。',
  '可剝削度': '求解器還沒算到完美的程度：最懂得針對的對手，最多能從這個策略多贏底池的百分之幾。0.5% 已經非常接近 GTO。',
  'EV': '期望值：同樣的情況打很多次，平均每次拿回多少（單位大盲，包含底池裡已經有的錢）。EV 越高越好。',
  '位置外': '翻牌後先說話的人（OOP）。',
  '位置內': '翻牌後後說話的人（IP），比較有利。',
  '下注樹': '求解器只考慮你設定的下注大小（例如 33%、75%、全下），把所有可能的下注順序展開成一棵樹，再在樹上算最佳解。尺寸越多越準，但越慢、越吃記憶體。',
  '權重': '這手牌在範圍裡的比例：1（100%）是一定在，0.5 是一半的時候在（例如一半的時候加注、一半的時候跟注）。',
  'SPR': '籌碼底池比：剩下的籌碼 ÷ 底池。越小越容易全下，越大越需要小心。',
};
const GLOSS_KEYS = Object.keys(GLOSS).sort((a, b) => b.length - a.length);
const GLOSS_RE = new RegExp(GLOSS_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|'), 'g');
/* 把一段 HTML 裡的名詞換成可以點的按鈕（只換標籤外的文字；同一塊畫面每個詞只換第一次；長的詞優先，所以「半詐唬」不會被拆成「詐唬」） */
function glossify(html, used) {
  if (!EXPLAIN.on) return html;
  used = used || new Set();
  let inBtn = false;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) { if (/^<button/.test(part)) inBtn = true; else if (/^<\/button/.test(part)) inBtn = false; return part; }
    if (inBtn) return part;
    return part.replace(GLOSS_RE, (k) => {
      if (used.has(k)) return k;
      used.add(k);
      return '<button type="button" class="term" data-term="' + k + '">' + k + '</button>';
    });
  }).join('');
}
/* 點名詞：在那一段後面打開／收起解釋 */
document.addEventListener('click', (e) => {
  const b = e.target.closest('button.term'); if (!b) return;
  const host = b.closest('li, p, td, div');
  const next = host && host.nextElementSibling;
  if (next && next.classList.contains('gdef') && next.dataset.term === b.dataset.term) { next.remove(); return; }
  const d = document.createElement(host && host.tagName === 'LI' ? 'li' : 'div');
  d.className = 'gdef'; d.dataset.term = b.dataset.term;
  d.innerHTML = '<b>' + esc(b.dataset.term) + '</b>：' + esc(GLOSS[b.dataset.term]);
  host.after(d);
});

const r100 = (x) => Math.round(+(x * 100).toFixed(1));   // 跟表上顯示的小數一致（59.49 顯示 59.5，就說 60）
/* 勝率的白話：「100 次贏約 34 次」＋（N≥2）「要同時贏過 N 人」＋算法 */
function eqPlain(x, N, method) {
  if (x === null || x === undefined) return '…';
  return '<span class="nw">100 次贏約 <b>' + r100(x) + '</b> 次</span>' + (N > 1 ? '<small>要同時贏過 ' + N + ' 人</small>' : '<small>&nbsp;</small>') + (method ? '<span class="mth">' + method + '</span>' : '');
}
/* 勝率表：對 1–N 家，多一欄「白話」（深入說明關掉時藏起來） */
function eqTableHTML(eqAt, maxN, hlN, method) {
  let h = '<table class="eqx"><thead><tr><th>對手</th><th></th><th class="r">勝率</th><th class="xp">白話</th></tr></thead><tbody>';
  for (let N = 1; N <= maxN; N++) {
    const x = eqAt(N);
    h += '<tr class="' + (N === hlN ? 'hl' : '') + '"><td>對 ' + N + ' 家</td><td class="bc"><div class="bar"><i style="width:' + ((x || 0) * 100).toFixed(1) + '%"></i></div></td><td class="r num">'
      + (x === null ? '…' : pct(x) + '%') + '</td><td class="xp">' + eqPlain(x, N, method ? method(N) : '') + '</td></tr>';
  }
  return h + '</tbody></table>';
}
/* 「這些機率怎麼算的？」：用現在這一手的數字講 */
function eqHowHTML(o) {
  // o = { pre: 翻牌前？, e1, e2, board: 張數, mcN, est }
  const p = r100;
  const has = (x) => x !== null && x !== undefined;
  let h = '<details class="how"><summary>這些機率怎麼算的？</summary>';
  h += '<p><b>勝率</b>：把還沒發的公牌、對手可能拿的牌都發完，數你贏的比例；平手時算你分到的那一份。' + (has(o.e1) ? '對 1 家 ' + p(o.e1) + '% 的意思是：同樣的情況打 100 次，你大約贏 ' + p(o.e1) + ' 次。' : '') + '</p>';
  if (has(o.e1) && has(o.e2)) {
    const ind = o.e1 * o.e1;
    h += '<p><b>為什麼對 2 家會變低</b>：你要「同時」贏過每一個人才算贏。對 1 家時 100 次贏 ' + p(o.e1) + ' 次；多一個對手，這 ' + p(o.e1) + ' 次裡有一部分會輸給第二個人，剩下約 ' + p(o.e2) + ' 次，所以是 ' + p(o.e2) + '%。'
      + '粗略心算：兩個人都要贏 ≈ ' + p(o.e1) + '% × ' + p(o.e1) + '% ≈ ' + p(ind) + '%；實際算出來是 ' + p(o.e2) + '%，'
      + (Math.abs(o.e2 - ind) < 0.015 ? '很接近。' : o.e2 > ind ? '比心算高，因為兩個對手共用同一組公牌：公牌幫你成大牌的那幾次，常常是兩個人一起贏。' : '比心算低一點，因為平手時要好幾個人分。')
      + '人越多，「至少有一個人拿到比你大的牌」的機會就越高。</p>';
  }
  h += '<p><b>怎麼算出來的</b>：</p><ul>';
  if (o.pre) h += '<li>翻牌前：事先算好。169 種起手牌，每一種都模擬發牌 100 萬次（隨機發對手的牌和 5 張公牌，數你贏了幾次），誤差大約 ±0.1%。</li>';
  else {
    const runs = o.board === 3 ? '1,081 種（還有 2 張要發）' : o.board === 4 ? '46 種（還有 1 張要發）' : '1 種（公牌已經發完）';
    h += '<li>對 1 家：精確計算。剩下的公牌有 ' + runs + '發法，對手的兩張牌大約有 1,000 種，每一種組合都比過一次再算比例，沒有誤差。</li>';
    h += '<li>對 2 家以上：組合太多，用模擬' + (o.mcN ? ' ' + o.mcN.toLocaleString() + ' 次' : '') + '：每次隨機發每個對手兩張牌、再把公牌發完，數你贏了幾次。模擬越多次越準' + (o.mcN && o.e2 ? '，現在誤差大約 ±' + (196 * Math.sqrt(o.e2 * (1 - o.e2) / o.mcN)).toFixed(1) + '%' : '') + '。</li>';
  }
  h += '</ul>';
  h += '<p><b>到河牌的牌型機率</b>：只看你自己的牌，把剩下的公牌每一種發法都算過，看你最後湊成什麼牌型；跟對手的牌無關。</p>';
  if (o.est !== undefined && o.est !== null) h += '<p><b>為什麼教練的數字不一樣</b>：上面的表假設對手拿任意兩張牌。還留在牌局裡的人通常牌比較好（不好的早就棄了），所以教練另外照每個人的動作估他可能的牌，算出你的勝率約 ' + p(o.est) + '%，用這個數字給建議。</p>';
  return h + '</details>';
}
