# 理財計算 Pro

這個資料夾是 Firebase Hosting 的正式部署來源。

正式路徑：

```text
D:\桌面\音樂下載\finance-web
```

正式網址：

```text
https://financial-computer.web.app
```

## 常用命令

語法檢查：

```powershell
Get-ChildItem -Recurse -Filter *.js .\src | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

核心計算測試：

```powershell
node .\tests\domain.test.mjs
```

部署與測試入口安全邊界：

```powershell
node .\tests\security-boundaries.test.js
```

雲端同步寫入 queue：

```powershell
node .\tests\latest-write-queue.test.mjs
node .\tests\storage-cloud.test.mjs
node .\tests\storage-local.test.mjs
node .\tests\record-codec.test.mjs
node .\tests\storage-cloud-records.test.mjs
```

Headless smoke test：

```powershell
node .\tests\smoke-runner.js --scenario=fund-shortfall-choice,transaction-subcategory,andro-money-import,category-budget-cleanup --port=4184
```

部署：

```powershell
firebase deploy --only hosting
```

Hosting 部署前會自動執行 `scripts/prepare-hosting.js`，只把正式網站需要的檔案放入 `.firebase-public`。文件、測試、Functions 原始碼、Firestore 規則、EPUB 與 smoke scenario 不會進入 Hosting 發布目錄。

Firestore 規則部署：

```powershell
firebase deploy --only firestore:rules
```

## 維護文件

- `docs/data-model.md`：資料模型。
- `docs/accounting-rules.md`：收入、支出、轉帳、代墊、收款的規則。
- `docs/report-traceability.md`：報表數字如何追到來源明細。
- `docs/firebase-status.md`：Firebase 狀態文字規格。
- `docs/deploy-checklist.md`：部署前檢查。
- `docs/roadmap.md`：後續開發藍圖。
- `docs/archive/agent-handoff-2026-05-04.md`：歷史交接文件，僅供追溯舊脈絡。
