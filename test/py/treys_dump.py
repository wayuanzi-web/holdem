# 隨機 7 張牌，用 treys 算排名（1 最好），寫成文字檔給 Node 比對
import random, sys
from treys import Card, Evaluator
ev = Evaluator()
R, S = "23456789TJQKA", "shdc"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 200000
rng = random.Random(7)
deck = list(range(52))
out = open(sys.argv[2] if len(sys.argv) > 2 else 'treys.txt', 'w')
for _ in range(N):
    h = rng.sample(deck, 7)
    tc = [Card.new(R[c >> 2] + S[c & 3]) for c in h]
    out.write(' '.join(map(str, h)) + ' ' + str(ev.evaluate(tc[:5], tc[5:])) + '\n')
out.close()
