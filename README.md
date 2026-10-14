# 德州軍師

德州撲克的勝率計算機、牌型機率、出牌數與兩人翻牌後 GTO 求解器（Discounted CFR），全部在瀏覽器裡跑。

- 網頁 App：https://wayuanzi-web.github.io/holdem/
- 原始碼：`src/engine/`（引擎，瀏覽器和 Node 共用）、`src/parts/`（畫面）、`src/webparts/`（分享、安裝、離線快取）
- 建置：`python3 src/build.py https://wayuanzi-web.github.io/holdem/`（根目錄的 `index.html`、`sw.js`、`manifest.webmanifest` 是產物）
- 測試：`sh test/run-all.sh`（評牌器全列舉、跟 treys 比大小、勝率、解析解、跟 Python 獨立重算的最佳反應值）
- 翻牌前資料：`node src/tools/preflop.js` 重新產生 `src/engine/35-preflop-data.js`
