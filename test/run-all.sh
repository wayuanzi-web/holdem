#!/bin/sh
# 全部的引擎測試（treys：pip install treys）
set -e
cd "$(dirname "$0")/.."
T=${TMPDIR:-/tmp}
node test/eval-exhaustive.js
python3 test/py/treys_dump.py 200000 "$T/treys.txt" && node test/eval-treys.js "$T/treys.txt"
node test/equity-check.js
node test/solver-toy.js
for w in river turn; do node test/solver-dump.js $w "$T/dump-$w.json" && python3 test/py/br_check.py "$T/dump-$w.json"; done
node test/game-cases.js > /dev/null && echo 牌局規則情境 OK
node test/game-random.js 20000
node test/ai-sim.js 600 6 2 | head -1
node test/coach-sim.js 150 0 | tail -1
node test/champ-check.js
node test/studio.js 300 2 5 | tail -1
node test/solver-iso.js | tail -1
node test/solver-par.js | tail -1
node test/par-threads.js 2 3 flop3bet
node test/gto-game.js 120 7 10 | tail -1
node test/charts.js
node test/rvr.js
node test/tourney.js 60
node test/batch.js
node test/learn.js 300
echo 全部通過
