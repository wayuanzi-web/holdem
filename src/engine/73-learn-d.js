/* ===== 73-learn-d：大師之路第四段（第 8 階 GTO 大師、GTO 訓練場、畢業考與結業證書） ===== */

/* ===== 河牌的 GTO 解：離線用工作室的求解器算好 =====
   大盲跟注 vs 按鈕開牌的範圍（翻牌、轉牌都過牌）、底池 5.5、籌碼 97.5、下注 33%／75%／全下、加注 2.5 倍；可剝削度 ≤ 0.2%。
   看的是「大盲過牌之後，按鈕怎麼打」。每一列：手牌 4 字＋下注頻率％（36 進位 2 字）＋對大盲過牌範圍的勝率％（36 進位 2 字）。
   bk：照勝率分 10 組（0–10%…90–100%），那一組的牌平均下注多少％（-1＝沒有這種牌） */
const GTO_RIVER_BK = [[100, 74, -1, 0, 1, 0, 0, 14, 63, 100], [98, 11, 0, 0, 0, 0, 0, 30, 100, 100], [100, 100, 57, 0, 0, 0, 3, 0, 78, 100], [100, 3, 0, 0, 3, 0, 0, 53, 100, 100]];
const GTO_RIVER = [
  ['Kd5c6h9h2d', 52, 39, '7sTs2s008sJs2s03TdJs2s057hQh2s0bThQh2s0dJsQc110h3hAs000v4hAs000v3sAh000w7hAd00138sAd04168cAc0116TcAs0019JdAs001dQdAh001f2sAd001j3h3d001o5sQs001v5d8d001w6sTs0d286s7s1g286cAd00296c8c1n297s7d2s2eQsQc2s2e9cAc002e9sJs1t2e9dTh1o2e9dJd1r2e9cTh1p2e9cQs1t2eJsJh2s2f3cKc2s2h8sKs2s2jTsKs2s2jJsKs2s2jQsKh2s2jKsAh2s2j5d6d2s2k6sKs2s2l9cKc2s2l7c8c2s2r'],
  ['As8d3c7h2s', 52, 33, '4s6s2s006dTd2s009dTd2s029sJc2s06TsJs2k09TcJh2k094sQs1q0e4cQc1o0e5cQc1r0e6sQs000f9dQh000fThQd000jJsQc000o4hKh000x9sKh000zTsKs0013TcKd0013JdKc0017QdKh00194s4h001h6s6h001m7c9c001t6c8c00225c8c1622KsKd00258cKc0e269h9d1s26QsQh1a26QhQc1a26TdTc1s274dAd2s2c5dAc2s2c6cAh2s2c9cAc2s2cJsAh2s2gKsAd2s2gQsAc2s2h2hAd2s2m3hAc2s2n2h2d2s2p3s3d2s2q4c5c2s2s'],
  ['QsJd4c9h2c', 54, 36, '5s6s2s025h8h2s0a6dTd2s0f3hKh2s0h8hKh2s0k3cAs0f0q3dAh0e0r5dAd000u6hAc000y7hAs00118sAd00178cAc0017TcAs001dKhAh001e2hAs001h3d3c021l4hAh031r5h5c0b1v7d7c001x8s9s00289cAc00296cJc2s2a9sTs162a9sTc162a9sKd1a2a9dTh162a9dKh192a9cTs162a9cTc152a9cKc1g2aJsKs2s2bTsJc2s2cAhAd2s2c8dQd2s2fQcAc2s2fTsQc2s2hQdKh2s2h4hQh2s2jJhQh2s2l9s9c2s2oTsKh2s2rTcKc2s2r'],
  ['8c7c3d2hKs', 54, 42, '4s5s2s006h9h2s009dTs2s029hJs2s05TsJd2s084sQs010d9sQd000fTcQs000jTdQd000kJdQc000p4dAd00125hAs00176hAd021b9sAc001eTsAh001kTcAc001kJcAh001pQdAc001q2cAh001u3cAc00216s6c0g257sAs15257sAh15257sAc15257hAs15257hAd15257hAc15257dAh15257dAc15256h7h2n267sJs2s278hAc2f278dTd2s28QsQd2s295dKd2s2g9cKh2s2iJsKh2s2mJhKc2s2nQcKc2s2n7d8d2s2o8hKc2s2qKdKc2s2s']
].map(([b, ip, oop, s], i) => {
  const rows = [];
  for (let k = 0; k < s.length; k += 8) rows.push({ h: parseCards(s.slice(k, k + 4)), f: parseInt(s.slice(k + 4, k + 6), 36), e: parseInt(s.slice(k + 6, k + 8), 36) });
  return { bs: b, board: parseCards(b), ip, oop, rows, bk: GTO_RIVER_BK[i] };
});
const GTO_RIVER_PROMPT = '河牌單挑：底池 5.5、雙方還有 97.5（翻牌、轉牌都過牌）。大盲過牌給你（按鈕）。';
function gtoRowWord(r) { return r.f >= 70 ? '大多下注' : r.f <= 30 ? '大多過牌' : '混合（一半一半）'; }
/* 照「勝率 e、下注頻率 f」一起解釋（不能只看勝率：有些強牌 GTO 反而過牌） */
function gtoRowWhy(r) {
  let k;
  if (r.f > 30 && r.f < 70) k = '混合：下注和過牌差不多好，照頻率做';
  else if (r.f >= 70) k = r.e >= 60 ? '很強的牌：下注拿價值' : r.e <= 25 ? '攤牌幾乎一定輸：拿來詐唬（不下注就一定輸）' : '勝率不高還下注：這裡 GTO 把它當詐唬用';
  else k = r.e >= 60 ? '夠強，但下注時只有比它好的牌會跟：過牌攤牌（或抓詐唬）' : r.e <= 25 ? '最弱的牌，但詐唬已經夠多了：過牌放棄' : '中等的牌：過牌攤牌（下注的話，比你差的會棄、比你好的會跟）';
  return 'GTO 下注 ' + r.f + '%；這手牌對大盲過牌範圍的勝率 ' + r.e + '%——' + k + '。';
}
/* 這手牌 GTO 怎麼打（只出明確的：≥ 70%、≤ 30%、或 40–60% 混合） */
QGEN.gtoRiver = (rng) => {
  for (let i = 0; i < 100; i++) {
    const S = pickOne(GTO_RIVER, rng), r = pickOne(S.rows, rng);
    if ((r.f > 30 && r.f < 40) || (r.f > 60 && r.f < 70)) continue;
    const ans = gtoRowWord(r);
    return { gen: 'gtoRiver', prompt: GTO_RIVER_PROMPT + '照 GTO 的解，這手牌通常怎麼打？', vis: { k: 'hand', hole: sortedCards(r.h), board: S.board },
      opts: ['大多下注', '大多過牌', '混合（一半一半）'].map((t) => ({ t, ok: t === ans })),
      explain: gtoRowWhy(r) + '整個範圍是<b>兩極化</b>的：按鈕下注的大多是最強的牌和最弱的牌，中間的牌過牌（整個範圍下注約 ' + S.ip + '%；個別的牌會有例外）。', key: 'gr|' + S.bs + '|' + r.h.join(',') };
  }
  return QGEN.bluffRatio(rng);
};
/* 三手牌裡，哪一手 GTO 幾乎都過牌／哪一手是拿來詐唬的 */
QGEN.gtoPolar = (rng) => {
  for (let i = 0; i < 200; i++) {
    const S = pickOne(GTO_RIVER, rng);
    const val = S.rows.filter((r) => r.e >= 75 && r.f >= 75), mid = S.rows.filter((r) => r.e >= 25 && r.e <= 70 && r.f <= 15), air = S.rows.filter((r) => r.e <= 15 && r.f >= 75);
    if (!val.length || !mid.length || !air.length) continue;
    const three = shuffleArr([pickOne(val, rng), pickOne(mid, rng), pickOne(air, rng)], rng);
    const askBluff = rng() < 0.5, ans = three.findIndex((r) => (askBluff ? r.e <= 15 : r.e >= 25 && r.e <= 70));
    return { gen: 'gtoPolar', prompt: GTO_RIVER_PROMPT + '這三手牌裡，' + (askBluff ? '哪一手是 GTO 拿來<b>詐唬</b>的？' : '哪一手 GTO <b>幾乎都過牌</b>？'), vis: { k: 'hands3', hs: three.map((r) => sortedCards(r.h)), board: S.board },
      opts: three.map((r, k) => ({ t: '第 ' + (k + 1) + ' 手', ok: k === ans })),
      explain: three.map((r, k) => '第 ' + (k + 1) + ' 手 ' + cardsTok(sortedCards(r.h)) + '：' + gtoRowWhy(r)).join('<br>') + '<br>最強的牌拿價值、最弱的牌詐唬，中等的牌過牌——兩極化。', key: 'gp|' + S.bs + '|' + three.map((r) => r.h.join('.')).join(',') + '|' + askBluff };
  }
  return QGEN.gtoRiver(rng);
};
/* 河牌兩極下注：詐唬可以佔多少 */
QGEN.bluffRatio = (rng) => {
  const [a, c, t] = pickOne(BET_FR, rng), f = a / c, ans = Math.round(f / (1 + 2 * f) * 100);
  return { gen: 'bluffRatio', prompt: '河牌，GTO 下注 ' + t + '，用的是兩極的範圍（很強的牌＋詐唬）。要讓你抓詐唬的牌跟或棄一樣好，他下注的牌裡詐唬大約佔多少？', vis: null,
    opts: pctOpts(ans, [100 / (1 + f), f / (1 + f) * 100, ans + 10, ans - 8, 50], rng),
    explain: '你跟注付 ' + fmtF(f) + '（以底池＝1 算），抓到詐唬贏 1 ＋ ' + fmtF(f) + '。詐唬比例 b 讓你剛好打平：b × (1 ＋ ' + fmtF(f) + ') ＝ (1 − b) × ' + fmtF(f) + ' → b ＝ 下注 ÷ (底池 ＋ 2 × 下注) ≈ ' + ans + '%。跟「跟注要的勝率」是同一個數字。下注越大，可以帶越多詐唬：1/3 底池 20%、半個底池 25%、一個底池 33%、兩倍底池 40%。', key: 'br|' + t };
};
/* 照頻率做：隨機數 */
const RNG_ACTS = [['下注', '過牌'], ['跟注', '棄牌'], ['加注', '跟注', '棄牌'], ['下注 1/3 底池', '下注 3/4 底池', '過牌'], ['過牌', '下注']];
QGEN.rngPick = (rng) => {
  const acts = pickOne(RNG_ACTS, rng);
  for (let i = 0; i < 50; i++) {
    const fs = [];
    let left = 100;
    for (let k = 0; k < acts.length - 1; k++) { const x = 5 * (2 + ((rng() * (left / 5 - 2 * (acts.length - k))) | 0)); fs.push(x); left -= x; }
    fs.push(left);
    if (fs.some((x) => x < 10)) continue;
    const n = (rng() * 100) | 0;
    let lo = 0, ans = -1;
    const bounds = fs.map((x) => { const b = [lo, lo + x - 1]; lo += x; return b; });
    bounds.forEach((b, k) => { if (n >= b[0] && n <= b[1]) ans = k; });
    if (bounds.some((b) => Math.abs(n - b[0]) <= 1 && b[0] > 0)) continue;     // 太靠近分界的不出
    return { gen: 'rngPick', prompt: 'GTO 這手牌：' + acts.map((t, k) => t + ' ' + fs[k] + '%').join('、') + '。你的隨機數（0–99）是 <b>' + n + '</b>，照順序分，這一次該？', vis: null,
      opts: acts.map((t, k) => ({ t, ok: k === ans })),
      explain: '照寫的順序把 0–99 分下去：' + acts.map((t, k) => t + ' ' + bounds[k][0] + '–' + bounds[k][1]).join('、') + '。' + n + ' 落在「' + acts[ans] + '」。隨機數可以用手錶或手機的秒數（秒 × 100 ÷ 60）。', key: 'rp|' + acts.join('~') + '|' + fs.join(',') + '|' + n };
  }
  return QGEN.bluffRatio(rng);
};
addStatic('s8a', [
  { prompt: 'GTO 策略最主要的特點是什麼？', opts: ['對手怎麼調整都沒辦法占你便宜', '每一手都贏最多錢', '專門針對對手的弱點', '從來不詐唬'], ans: 0,
    explain: 'GTO 是「不會被剝削」的打法：對手怎麼改都不會比較好。它不一定贏最多，對很弱的對手時，針對他的弱點（剝削）通常賺更多。' },
  { prompt: '工作室顯示「可剝削度 0.4%」是什麼意思？', opts: ['最會針對你的對手，每手平均只能多贏底池的 0.4%', '你有 0.4% 的機率輸', '還要再算 0.4% 的時間', 'GTO 會贏 0.4%'], ans: 0,
    explain: '可剝削度＝完全知道這個打法的對手每手能多贏多少（底池的百分比）。越接近 0 越接近 GTO；0.5% 以下就很夠用了。' },
  { prompt: 'GTO 對上一個很爛的對手（例如什麼都跟的人），結果會？', opts: ['還是會贏，但沒有針對他的打法贏得多', '一定打平', '會輸給他', '跟針對他贏得一樣多'], ans: 0,
    explain: '對手犯錯，GTO 就賺錢；但 GTO 不會「主動」去抓他的錯。針對他的漏洞（剝削）通常贏更多，代價是自己的打法也露出可以被針對的地方。' },
  { prompt: '照 GTO，河牌下注的範圍為什麼一定要有詐唬？', opts: ['沒有詐唬，對手只要用打得贏你價值牌的牌跟，其他全棄就好', '詐唬比較好玩', '規則規定要詐唬', '詐唬的 EV 永遠比較高'], ans: 0,
    explain: '只用強牌下注，對手看到下注就棄（除非他更強），你的強牌收不到錢。帶適當比例的詐唬，對手就必須跟一些，你的價值牌才賺得到。' },
  { prompt: '河牌對手下注一個底池。照 GTO，你至少要繼續（跟或加注）多少比例的範圍？', opts: ['50%', '33%', '67%', '100%'], ans: 0,
    explain: '最少防守比例＝底池 ÷（底池＋下注）＝ 1 ÷ 2 ＝ 50%。棄得比這多，他用任何牌詐唬都會賺。' },
]);
addStatic('s8b', [
  { prompt: '對手是「跟注站」（什麼都跟、很少棄）。你河牌拿空氣，想詐唬。該？', opts: ['不要詐唬，他會跟', '下大注嚇他', '全下', '照 GTO 的頻率詐唬'], ans: 0,
    explain: '詐唬要對手會棄才賺；跟注站很少棄。針對他：少詐唬、中上的牌多下注拿價值。' },
  { prompt: '對手是「跟注站」。你河牌拿頂對、踢腳普通，他過牌給你。該？', opts: ['下注拿價值，他會用更差的牌跟', '過牌，怕他有更好的', '全下', '棄牌'], ans: 0,
    explain: '跟注站會用中對、弱對、甚至沒中的牌跟。對他「薄價值」下注（中上的牌也下注）比 GTO 賺更多。' },
  { prompt: '對手是「岩石」（很少玩、很少詐唬），他突然在河牌加注你。你拿頂對。該？', opts: ['多半棄牌，他很少詐唬', '一定跟', '再加注', '全下'], ans: 0,
    explain: '岩石的大注、加注幾乎都是大牌。針對他：他下大注就尊重；反過來，他的盲注要多偷。' },
  { prompt: '你在按鈕，大盲是「岩石」，前面都棄牌。針對他該？', opts: ['比平常開更多牌偷盲', '只用大牌開', '跛入', '全下'], ans: 0,
    explain: '岩石防守很少，偷他的盲注很容易成功。可以比圖表開更寬。' },
  { prompt: '對手是「瘋子」（一直加注、常常詐唬）。你拿中上的牌（例如頂對），他一直下注。該？', opts: ['過牌跟注，讓他自己繼續詐唬', '一直加注把他趕走', '棄牌', '全下'], ans: 0,
    explain: '瘋子的下注裡詐唬很多。你加注會把他的詐唬趕跑、只剩比你好的牌；跟注讓他繼續用空氣付錢。' },
  { prompt: '對手是「緊凶」或打法接近 GTO。你該？', opts: ['照 GTO 打，不要亂偏離', '一直詐唬', '一直跟注', '只玩 AA、KK'], ans: 0,
    explain: '對手沒有明顯漏洞時，偏離只會讓你自己被針對。GTO 是最安全的打法。' },
  { prompt: '你只看對手打了 3 手，他有一次河牌詐唬被抓。該？', opts: ['還不能下結論，先照 GTO，多觀察', '認定他是瘋子，一直跟', '認定他很緊，一直棄', '馬上全力針對他'], ans: 0,
    explain: '偏離要有證據：看過好幾次一樣的傾向才針對。樣本太少時，GTO 最安全。' },
]);
addStatic('s8c', [
  { prompt: 'GTO 的解說某一手牌「下注 55%、過牌 45%」。這代表？', opts: ['這兩個動作的 EV 幾乎一樣，照頻率混著做', '下注比較好，過牌是錯的', '這手牌一定要下注', '解還沒算好'], ans: 0,
    explain: '會混合的牌，兩個動作在均衡時 EV 一樣（不然 GTO 會全部選比較好的那個）。照頻率做讓範圍平衡；偶爾選錯邊，損失也很小。' },
  { prompt: '為什麼 GTO 過牌的範圍裡也要放一些強牌？', opts: ['不然對手知道你過牌就一定不強，可以放心攻擊', '因為電腦喜歡亂數', '為了讓遊戲比較有趣', '因為強牌過牌一定賺比較多'], ans: 0,
    explain: '如果強牌全部都下注，你過牌時就一定沒有強牌，對手可以放心下注、詐唬你的過牌。過牌範圍裡留一些強牌（有時用混合、有時是整種牌都過牌），對手就不敢亂攻擊。' },
  { prompt: '真人實戰，GTO 說某手牌「下注 90%、過牌 10%」。最實際的做法？', opts: ['直接下注（當成一定這樣做）', '一定要用隨機數', '過牌', '每次都換'], ans: 0,
    explain: '頻率很高的（約 80% 以上）當成純策略就好；偏離一點點損失很小。真正要用隨機數的是接近一半一半的混合。' },
  { prompt: '真正讓你虧大錢的是哪一種錯？', opts: ['該下注的強牌過牌、該棄的牌跟到底這種大錯', '混合頻率差 10%', '下注尺寸差一點點', '隨機數用秒數而不是骰子'], ans: 0,
    explain: '混合牌兩個動作 EV 差不多，頻率差一點損失很小。EV 差很多的大錯（GTO 幾乎不做的動作）才是虧錢的主因——這也是牌局 GTO 評分 ✗ 的意思。' },
]);
addStatic('s8d', [
  { prompt: '工作室的格子裡，一格的顏色一半紅、一半綠，代表？', opts: ['這種牌混合兩個動作，各大約一半', '算錯了', '這種牌不在範圍裡', '這種牌一定加注'], ans: 0,
    explain: '格子的顏色照每個動作的比例畫。混在一起＝混合策略；點那一格可以看每個組合的比例和 EV。' },
  { prompt: '想知道「對手翻牌下注太少時，我該怎麼打」，工作室要用哪一個功能？', opts: ['節點鎖定：把對手那裡的打法固定成你看到的樣子，再重新求解', '換一張公牌', '把下注尺寸改大', '看下一張牌報告'], ans: 0,
    explain: '節點鎖定讓你假設對手偏離 GTO（例如很少下注），求解器會算出針對他的最好打法——這就是用工作室研究剝削。' },
  { prompt: '工作室算到「可剝削度 3%」就停了。這個解可以拿來學嗎？', opts: ['大方向可以參考，但細的頻率還不準；最好算到 0.5% 以下', '完全準確', '完全不能用', '3% 比 0.5% 更準'], ans: 0,
    explain: '可剝削度越低越接近 GTO。研究、記結論最好算到 0.5% 以下；牌局裡為了速度，解算到約 3% 以下就先拿來評分（大方向已經對了，細的頻率還會變）。' },
  { prompt: '牌局結束時「GTO 分析」按鈕會做什麼？', opts: ['把這一手照每個人的動作估好範圍，帶進工作室求解，再對照你實際怎麼打', '重新發一次一樣的牌', '直接告訴你對手的牌', '把這一手刪掉'], ans: 0,
    explain: '從牌局帶入：範圍照每個人在這一手的動作估，下注選項包含你們實際用的大小；算完可以一步一步對照你的打法。' },
]);

/* ===== 畢業考：筆試（第 1–8 階都有）＋實戰 ===== */
const GRAD_W = { per: [3, 4, 4, 4, 4, 4, 4, 3], sec: 20, pass: 26 };
function makeGradQuiz(rng) {
  const out = [];
  GRAD_W.per.forEach((k, i) => { const s = i + 1; for (const q of makeQuiz(STAGE_GENS[s], k, rng)) { q.stage = s; out.push(q); } });
  return out;
}
/* 畢業前還沒完成的課（不含畢業考本身；跳過的階段算完成） */
function gradMissing(LP) { return allLessons().filter((l) => l.id !== '8-5' && !lessonDone(LP, l.id)); }
/* 兩部分都過、其他課也都完成了就畢業：回傳是不是剛剛畢業 */
function gradCheck(LP) {
  const w = LP.gradW, p = LP.exam && LP.exam['8-5'];
  if (LP.grad || !(w && w.pass && p && p.pass) || gradMissing(LP).length) return false;
  LP.grad = { at: Date.now(), w: w.s, wn: w.n, p: Math.round(p.score * 100) };
  LP.done['8-5'] = { s: Math.round(p.score * 100), n: 100, pct: true, at: LP.grad.at };
  return true;
}
const NO_SKIP = { 8: true };          // 第 8 階不能跳級（畢業考要真的考）

EXAMS['8-4'] = { stage: 8, gto: true, n: 2, level: 4, villains: ['gto'], need: 10, pass: 0.7, autoEarly: true };
EXAMS['8-5'] = { stage: 8, n: 6, level: 3, need: 25, pass: 0.8, skipTrivial: true, final: true };

/* ===== 第 8 階的課 ===== */
COURSE[7].lessons = [
  { id: '8-1', title: 'GTO 是什麼、什麼時候偏離', sum: '不會被占便宜的打法；對手有明顯漏洞時才針對他。', read: [
    '<b>GTO</b>（博弈論最佳策略）是一種<b>平衡</b>的打法：雙方都照它打的時候，任何一方自己改打法都不會比較好。所以它的重點是<b>不會被剝削</b>——對手怎麼調整都占不到你便宜——不是「每一手贏最多」。',
    '下面常看到的 <b>EV</b> 就是第 5-1 課的<b>期望值</b>：平均每次拿回多少。工作室裡的<b>可剝削度</b>則是在量「會不會被占便宜」：一個完全知道你打法的對手，每手平均能多贏多少（底池的百分之幾）。GTO 是 0%；算到 0.5% 以下就很接近了。',
    { k: 'gtoTable' },
    { k: 'tip', html: '河牌 GTO 的骨架就是這張表：<b>下注的人</b>照「詐唬可以佔」的比例配詐唬，抓詐唬的牌跟或棄都一樣；<b>防守的人</b>照「最少要繼續」的比例跟或加注，下注的人拿任何牌詐唬都不會多賺。' },
    '<b>什麼時候偏離（剝削）</b>：對手有明顯、穩定的漏洞時，針對它打比 GTO 賺更多。',
    { k: 'tip', html: '<b>跟注站</b>：少詐唬，中上的牌多下注拿價值（他會用更差的牌跟）。<br><b>岩石</b>：多偷他的盲注；他突然大注或加注，沒有很強就棄。<br><b>瘋子</b>：少主動詐唬，用中等以上的牌過牌跟注，讓他自己詐唬。<br><b>鬆凶</b>：用更寬的牌 3-bet、跟注抓詐唬。<br><b>緊凶、GTO</b>：照 GTO 打。' },
    '偏離有代價：你偏離得越多，自己也越容易被反過來針對。<b>先打 GTO，有證據（看過好幾次）才偏離</b>。牌桌上對手名牌寫的風格，就是讓你練習針對的。',
  ], practice: { gens: ['bluffRatio', 's8a', 's8b'], n: 6 }, quiz: { gens: ['bluffRatio', 's8a', 's8b', 'mdf'], n: 8, pass: 7 } },
  { id: '8-2', title: '頻率與混合策略', sum: '同一手牌有時下注、有時過牌；牌桌上怎麼照頻率做。', read: [
    'GTO 的解常常是「這手牌<b>下注 60%、過牌 40%</b>」——同一手牌兩種打法都用，叫<b>混合策略</b>。',
    '為什麼要混：如果某一種牌<b>永遠</b>下注，你過牌的時候就一定沒有它，對手就可以放心攻擊你的過牌。混合讓兩邊的範圍都有強牌、也都有弱牌，對手抓不到規律。',
    { k: 'tip', html: '<b>關鍵觀念：會混合的牌，兩種打法 EV 一樣</b>（不然 GTO 會全部選比較好的那個）。所以照頻率做就好；偶爾選錯邊，損失也很小。真正虧錢的是「該下注的強牌過牌、該棄的牌跟到底」這種 EV 差很多的大錯。' },
    '<b>牌桌上怎麼照頻率做</b>：用一個隨機數。看手錶或手機的秒數（0–59，乘 100 除 60 換成 0–99）。把 0–99 照順序分給各個動作：下注 60%、過牌 40% → 0–59 下注、60–99 過牌。',
    { k: 'tip', html: '<b>簡化原則</b>：頻率 80% 以上的，當成一定這樣做；接近一半一半的才用隨機數。工作室的格子裡，顏色混在一起的格子就是混合策略。' },
  ], practice: { gens: ['rngPick', 's8c'], n: 6 }, quiz: { gens: ['rngPick', 's8c', 'rngPick', 'bluffRatio'], n: 8, pass: 7 } },
  { id: '8-3', title: 'GTO 工作室導讀', sum: '五步用工作室；讀懂 GTO 的解：河牌兩極化。', read: [
    '「工具 → GTO 工作室」可以算兩個人的翻牌後局面（翻牌、轉牌、河牌）。用法五步：',
    { k: 'tip', html: '① <b>選局面</b>：範例，或牌局結束時按「GTO 分析」把那一手帶進來。<br>② <b>範圍</b>：雙方可能拿的牌（13×13 格子，可以改）。<br>③ <b>下注樹</b>：每條街可以下多大（尺寸越多越準、越慢）。<br>④ <b>求解</b>：看可剝削度，降到 0.5% 以下就夠用。<br>⑤ <b>看結果</b>：格子顏色＝每一種牌各動作的比例；點一格看每個組合的 EV、勝率；沿著動作往下走、看下一張牌報告；用<b>節點鎖定</b>假設對手偏離，看怎麼針對他。' },
    { k: 'studio' },
    '<b>河牌最重要的規律：兩極化</b>。下表是工作室算好的四個河牌（大盲跟注 vs 按鈕開牌的範圍，翻牌、轉牌都過牌，大盲過牌給按鈕）：把按鈕的牌照「對大盲過牌範圍的勝率」分十組，看每組平均下注多少。',
    { k: 'polarTable' },
    { k: 'tip', html: '<b>最強的牌下注拿價值、最弱的牌下注詐唬，中間的牌過牌攤牌</b>。為什麼：詐唬要用「攤牌一定輸」的牌——拿中等的牌詐唬，等於把本來會贏的攤牌丟掉；中等的牌下注，比它差的會棄、比它好的會跟（第 6-4 課）。' },
  ], practice: { gens: ['gtoRiver', 'gtoPolar'], n: 6 }, quiz: { gens: ['gtoRiver', 'gtoPolar', 's8d'], n: 8, pass: 6 } },
  { id: '8-4', title: 'GTO 訓練場', sum: '和 GTO 電腦單挑：轉牌、河牌你自己打，用 GTO 評 10 個決定、70% 過關。', exam: '8-4', read: [
    '<b>GTO 訓練場</b>：到牌桌上和 <b>GTO 電腦</b>單挑（它的轉牌、河牌照求解器的解打）。<b>翻牌前和翻牌由教練代打</b>，你專心打轉牌、河牌。',
    '輪到你的轉牌、河牌時，背景會先把這個局面<b>求解</b>（手機大約幾秒，算好動作鈕才會亮）。你按完就用 GTO 評分：GTO 常用的動作 ✓；很少用、但少賺不多 △；幾乎不用、而且少賺很多 ✗。',
    { k: 'tip', html: '評滿 <b>10 個 GTO 評分的決定</b>，平均 <b>70%</b> 以上過關（✓ 1 分、△ 半分）。記住第 8-3 課：最強的牌和最弱的牌下注、中等的牌過牌；面對下注照價錢和最少防守比例。' },
  ] },
  { id: '8-5', title: '畢業考', sum: '筆試 30 題＋6 人桌實戰 25 個決定：兩個都過就拿結業證書。', exam: '8-5', grad: true, read: [
    '<b>第一部分　筆試</b>：30 題，第 1 到第 8 階都有，每題 <b>' + GRAD_W.sec + ' 秒</b>；答對 <b>' + GRAD_W.pass + ' 題</b>通過。',
    '<b>第二部分　實戰</b>：6 人桌，對手是「高手」等級的各種風格，牌是隨機發的；教練不給建議、不顯示勝率。評滿 <b>25 個決定</b>（明顯該棄的爛牌不算），平均 <b>80%</b> 以上通過。',
    { k: 'tip', html: '兩部分都通過就<b>畢業</b>，拿到結業證書（可以寫上名字、存成圖片）。兩部分可以分開考、不限次數。' },
  ] },
].map((l) => lessonFinish(l, 8));
for (const id of ['8-4', '8-5']) lessonById(id).ready = true;

STAGE_GENS[8] = ['bluffRatio', 'rngPick', 'gtoRiver', 'gtoPolar', 's8a', 's8b', 's8c', 's8d'];
PLACEMENT[11] = [8, 'gtoPolar'];
DRILLS.push({ id: 'gto', name: 'GTO：兩極化與頻率', gens: ['gtoRiver', 'gtoPolar', 'rngPick'], sec: 8 });
