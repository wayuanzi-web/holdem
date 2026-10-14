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
echo 全部通過
