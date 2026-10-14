# 獨立重算：每一手牌、每一個對手手牌分開算（不用排序、不用撞牌的加減技巧），最佳反應值和 EV 要跟 JS 一樣
import json, sys
from functools import lru_cache
from treys import Card, Evaluator
ev = Evaluator()
R, S = "23456789TJQKA", "shdc"
d = json.load(open(sys.argv[1]))
board, P0, deck = d['board'], d['pot'], d['deck']
D = len(deck); pos = {c: i for i, c in enumerate(deck)}
hands, W = d['hands'], d['w']
nodes = {n['id']: n for n in d['nodes']}
strat = {int(k): v for k, v in d['strat'].items()}
TC = {c: Card.new(R[c >> 2] + S[c & 3]) for c in range(52)}
@lru_cache(maxsize=None)
def rank(b5, h):   # treys：越小越好
    return ev.evaluate([TC[c] for c in b5], [TC[c] for c in h])
def payoff(nd, t, h, o, full):
    if nd['kind'] == 2:   # 棄牌
        f = nd['p']; invf = nd['inv1'] if f else nd['inv0']
        return -invf if t == f else P0 + invf
    inv = nd['inv0']; b5 = tuple(sorted(full))
    rh, ro = rank(b5, tuple(hands[t][h])), rank(b5, tuple(hands[1 - t][o]))
    return P0 + inv if rh < ro else (-inv if rh > ro else P0 / 2)
def rec(nid, inst, dealt, t, h, opp, mode):
    """opp：{對手手牌編號: 到達機率}；回傳 Σ_o 機率 × 收益（有發牌就平均）"""
    nd = nodes[nid]; k = nd['kind']
    if k in (2, 3):
        full = board + dealt
        return sum(r * payoff(nd, t, h, o, full) for o, r in opp.items() if r)
    if k == 1:
        rem = 52 - len(board) - len(dealt); tot = 0.0
        for c in deck:
            if c in dealt or c in hands[t][h]: continue
            no = {o: r for o, r in opp.items() if c not in hands[1 - t][o]}
            tot += rec(nd['kids'][0], inst * D + pos[c], dealt + [c], t, h, no, mode)
        return tot / (rem - 4)
    kk = nd['k']; st = strat[nid][inst]
    if nd['p'] == t:
        n = len(hands[t]); vals = [rec(nd['kids'][a], inst, dealt, t, h, opp, mode) for a in range(kk)]
        return max(vals) if mode == 'br' else sum(st[a * n + h] * vals[a] for a in range(kk))
    n = len(hands[1 - t]); tot = 0.0
    for a in range(kk):
        no = {o: r * st[a * n + o] for o, r in opp.items()}
        if any(no.values()): tot += rec(nd['kids'][a], inst, dealt, t, h, no, mode)
    return tot
def value(t, mode):
    num = Z = 0.0
    for h, hc in enumerate(hands[t]):
        opp = {o: W[1 - t][o] for o, oc in enumerate(hands[1 - t]) if not set(hc) & set(oc)}
        Z += W[t][h] * sum(opp.values())
        num += W[t][h] * rec(0, 0, [], t, h, opp, mode)
    return num / Z
py_br = [value(0, 'br'), value(1, 'br')]; py_ev = [value(0, 'ev'), value(1, 'ev')]
js = d['js']
diff = max(abs(a - b) for a, b in zip(py_br + py_ev, js['br'] + js['ev']))
print('Python 最佳反應', ['%.6f' % x for x in py_br], 'EV', ['%.6f' % x for x in py_ev])
print('JS     最佳反應', ['%.6f' % x for x in js['br']], 'EV', ['%.6f' % x for x in js['ev']])
print('最大差距 %.2e' % diff, 'OK' if diff < 1e-4 * max(1, P0) else '錯')
sys.exit(0 if diff < 1e-4 * max(1, P0) else 1)
