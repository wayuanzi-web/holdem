# 德州軍師：開發須知

## 改動流程（2026-10-21 起）

不要直接推 `main`。一律走 PR：

1. 開分支：`git checkout -b agent/<主題>`
2. 改 `src/` 之後重新建置：`python3 src/build.py https://wayuanzi-web.github.io/holdem/`（`index.html` 要跟著 commit，CI 會檢查有沒有同步）
3. 本機先跑測試：`sh test/run-all.sh`（約 3.5 分鐘，要 `pip install treys`）
4. 推分支、開 PR：`git push -u origin agent/<主題>`、`gh pr create`
5. 等 CI 的 `test` 通過再合併：`gh pr checks --watch`、`gh pr merge --merge --delete-branch`
6. 合併後 GitHub Pages 自動部署：`gh api "repos/wayuanzi-web/holdem/actions/runs?per_page=2"`

雲端 session 不能用 GraphQL（`gh pr create`、`gh pr checks`、`gh pr merge` 會 403），改用 REST：

- 開 PR：`gh api repos/wayuanzi-web/holdem/pulls -f base=main -f head=<分支> -f title=... -F body=@body.md`
- 看 CI：`gh api "repos/wayuanzi-web/holdem/commits/<sha>/check-runs" --jq '.check_runs[] | .name + " " + .status + " " + (.conclusion // "")'`
- 合併：`gh api -X PUT repos/wayuanzi-web/holdem/pulls/<編號>/merge -f merge_method=merge`
- 雲端刪不了遠端分支（`git push --delete`、REST 都 403），合併後留著就好

`main` 有 ruleset「main 需通過 CI」。有權限可以略過時也不要略過。

## 其他

- 功能有變動時，同步更新 `docs/STATUS.md` 的功能清單。
- 原始碼在 `src/engine/*.js`（引擎，測試也用）和 `src/parts/*`（畫面）；`src/build.py` 把它們接成單一的 `index.html`。
