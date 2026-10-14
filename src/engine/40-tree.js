/* ===== 40-tree：兩人翻牌後的下注樹 =====
   cfg = {
     board: [牌]（3–5 張）, pot: 開始時的底池, stack: 雙方剩下的有效籌碼,
     bet:   { flop: [[OOP 的下注尺寸…], [IP 的…]], turn: …, river: … }   // 尺寸：數字＝底池 %、'e'＝幾何、'a'＝全下
     raise: { flop: [[…], […]], turn: …, river: … }                    // 數字＝底池 %（跟完再加）、'2.5x'＝對方下注的幾倍、'a'
     allin: 0.67      下注後投入超過起始籌碼的這個比例就改成全下
     addAllin: true   有下注尺寸的地方另外加一個全下
     cap: 3           每條街最多幾次下注／加注（下注算 1）
     minBet: 1        最小下注（籌碼）
   }
   金額單位隨便（大盲、籌碼都可以），整棵樹用同一個單位。
   節點：ACT（決策）、CHANCE（發下一張牌）、FOLD（有人棄牌）、SHOW（攤牌）。
   每個節點記 level：從開始到這裡發了幾張牌（0–2），求解時同一個樣板節點在不同的發牌下各有一份資料。 */
const N_ACT = 0, N_CHANCE = 1, N_FOLD = 2, N_SHOW = 3;
const STREET_KEYS = ['flop', 'turn', 'river'];
const STREET_ZH = ['翻牌', '轉牌', '河牌'];

function r2(x) { return Math.round(x * 100) / 100; }

function buildTree(cfg) {
  const S = cfg.stack, P0 = cfg.pot;
  const thr = cfg.allin === undefined ? 0.67 : cfg.allin;
  const cap = cfg.cap === undefined ? 3 : cfg.cap;
  const minBet = cfg.minBet === undefined ? 1 : cfg.minBet;
  const addAllin = cfg.addAllin !== false;
  const start = cfg.board.length - 3;
  const nodes = [];
  const mk = (o) => { o.id = nodes.length; nodes.push(o); return o; };
  const sizes = (tbl, street, p) => { const t = tbl && tbl[STREET_KEYS[street]]; return (t && t[p]) || []; };

  function endStreet(street, level, inv0, inv1) {
    if (street === 2) return mk({ kind: N_SHOW, level, street, inv0, inv1 });
    const allin = inv0 >= S - 1e-9 || inv1 >= S - 1e-9;
    const ch = mk({ kind: N_CHANCE, level, street, inv0, inv1, kids: [] });
    ch.kids.push(allin ? endStreet(street + 1, level + 1, inv0, inv1) : decide(street + 1, level + 1, inv0, inv1, 0, 0, 0, 0, 0));
    return ch;
  }

  // p 輪到誰；b0、b1 這條街雙方已經下的；nb 這條街下注／加注了幾次；inc 上一次加了多少（最小加注用）
  function decide(street, level, inv0, inv1, b0, b1, p, nb, inc) {
    const inv = [inv0, inv1], b = [b0, b1], o = 1 - p;
    const pot = P0 + inv0 + inv1;
    const left = S - inv[p], leftO = S - inv[o];
    const facing = b[o] - b[p];
    const node = mk({ kind: N_ACT, p, level, street, inv0, inv1, pot, facing, acts: [], kids: [] });
    const acts = [];
    const toAllin = (to) => (inv[p] + (to - b[p]) >= thr * S - 1e-9 || to - b[p] >= left - 1e-9);
    if (facing <= 1e-9) {
      acts.push({ t: 'x', add: 0, to: b[p] });
      if (nb < cap && left > 1e-9 && leftO > 1e-9) {
        const list = sizes(cfg.bet, street, p);
        for (const s of list) {
          let amt;
          if (s === 'a') amt = left;
          else if (s === 'e') {
            const n = 3 - street, sp = left / pot;
            amt = pot * (Math.pow(1 + 2 * sp, 1 / n) - 1) / 2;
          } else amt = pot * (+s) / 100;
          amt = Math.max(amt, Math.min(minBet, left));
          if (toAllin(b[p] + amt)) amt = left;
          acts.push({ t: amt >= left - 1e-9 ? 'a' : 'b', add: r2(amt), to: r2(b[p] + amt) });
        }
        if (addAllin && list.length) acts.push({ t: 'a', add: r2(left), to: r2(b[p] + left) });
      }
    } else {
      acts.push({ t: 'f', add: 0, to: b[p] });
      const call = Math.min(facing, left);
      acts.push({ t: 'c', add: r2(call), to: r2(b[p] + call) });
      if (nb < cap && left > facing + 1e-9 && leftO > 1e-9) {
        const list = sizes(cfg.raise, street, p);
        const minTo = b[o] + Math.max(inc, minBet);
        for (const s of list) {
          let to;
          if (s === 'a') to = b[p] + left;
          else if (typeof s === 'string' && /x$/i.test(s)) to = b[o] * parseFloat(s);
          else to = b[o] + (pot + facing) * (+s) / 100;
          to = Math.max(to, minTo);
          if (toAllin(to)) to = b[p] + left;
          const add = to - b[p];
          acts.push({ t: add >= left - 1e-9 ? 'a' : 'r', add: r2(add), to: r2(to) });
        }
        if (addAllin && list.length) acts.push({ t: 'a', add: r2(left), to: r2(b[p] + left) });
      }
    }
    // 去掉一樣的金額，照「過牌／棄牌、跟注、小到大」排
    const seen = new Set();
    const ord = { x: 0, f: 0, c: 1, b: 2, r: 2, a: 3 };
    acts.sort((x, y) => (ord[x.t] - ord[y.t]) || (x.add - y.add));
    for (const a of acts) {
      const key = (a.t === 'x' || a.t === 'f' || a.t === 'c') ? a.t : 'bet' + a.add.toFixed(2);
      if (seen.has(key)) continue;
      seen.add(key);
      node.acts.push(a);
    }
    for (const a of node.acts) {
      const ni = inv.slice(), nbt = b.slice();
      ni[p] = r2(ni[p] + a.add); nbt[p] = r2(nbt[p] + a.add);
      let kid;
      if (a.t === 'f') kid = mk({ kind: N_FOLD, p, level, street, inv0: ni[0], inv1: ni[1] });
      else if (a.t === 'x') kid = p === 1 ? endStreet(street, level, ni[0], ni[1]) : decide(street, level, ni[0], ni[1], nbt[0], nbt[1], 1, nb, inc);
      else if (a.t === 'c') kid = endStreet(street, level, ni[0], ni[1]);
      else kid = decide(street, level, ni[0], ni[1], nbt[0], nbt[1], o, nb + 1, Math.max(nbt[p] - b[o], minBet));
      node.kids.push(kid);
    }
    return node;
  }

  const root = decide(start, 0, 0, 0, 0, 0, 0, 0, 0);
  return { root, nodes, start };
}

/* 動作的中文：過牌、下注 5.5、跟注、棄牌、加注到 16、全下 97.5 */
function actLabel(a) {
  const n = (x) => (Math.round(x * 10) / 10).toString();
  switch (a.t) {
    case 'x': return '過牌';
    case 'f': return '棄牌';
    case 'c': return '跟注';
    case 'b': return '下注 ' + n(a.add);
    case 'r': return '加注到 ' + n(a.to);
    default: return '全下 ' + n(a.add);
  }
}
/* 樹的統計：每一層（發了幾張牌）有幾個決策點 */
function treeStats(tree) {
  const byLevel = [0, 0, 0], term = [0, 0, 0];
  for (const n of tree.nodes) { if (n.kind === N_ACT) byLevel[n.level]++; else if (n.kind !== N_CHANCE) term[n.level]++; }
  return { act: byLevel, term, total: tree.nodes.length };
}
