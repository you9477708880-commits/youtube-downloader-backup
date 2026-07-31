# 部署檢查清單

這份文件協助確認目前部署的是正確資料夾、正確 Firebase 專案，以及核心檢查都已通過。

## 正式部署來源

正式網站資料夾：

```text
D:\桌面\音樂下載\finance-web
```

Firebase Hosting 專案：

```text
financial-computer
```

正式網址：

```text
https://financial-computer.web.app
```

## 部署前檢查

請先確認目前 PowerShell 路徑：

```powershell
pwd
```

應該顯示：

```text
D:\桌面\音樂下載\finance-web
```

確認 Firebase 專案：

```powershell
firebase use
```

應該是：

```text
financial-computer
```

## 語法檢查

```powershell
Get-ChildItem -Recurse -Filter *.js .\src | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

## 核心計算測試

```powershell
node .\tests\domain.test.mjs
```

## 雲端同步寫入測試

```powershell
node .\tests\latest-write-queue.test.mjs
node .\tests\storage-cloud.test.mjs
```

## 資安檢查

部署前請確認：

- `firestore.rules` 已存在，且 `firebase.json` 有指定這份 rules 檔。
- 匯入 JSON 的深層驗證測試通過。
- 惡意字串渲染測試通過，使用者輸入不得形成可執行 HTML。
- 本機 localStorage 損毀單一欄位時，不會阻止其他正常欄位載入。
- 正式 `src/main.js` 不得載入 smoke scenarios；smoke runner 只能透過本機測試伺服器注入測試入口。
- Hosting 發布目錄不得包含 `docs/`、`tests/`、`functions/`、Firestore 規則、EPUB 或 `src/smoke-scenarios.js`。

執行部署與測試入口安全邊界檢查：

```powershell
node .\tests\security-boundaries.test.js
```

Firestore 規則檢查重點：

```text
artifacts/{appId}/users/{userId}/data/{documentId}
```

只能允許 `request.auth.uid == userId` 的使用者讀寫。其他路徑預設拒絕。

若要部署 Firestore 規則：

```powershell
firebase deploy --only firestore:rules
```

## Headless smoke test

Current project-local smoke runner:

```powershell
node .\tests\smoke-runner.js --port=4184
```

Current project-local UI smoke scenarios:

```powershell
node .\tests\smoke-runner.js --scenario=fund-shortfall-choice,transaction-edit-unlinks,fund-edit-recalculates,transaction-subcategory,andro-money-import,category-budget-cleanup,editing-completeness --port=4185
```

2026-06-01 note: Codex Browser/IAB automation was blocked by Browser URL policy when navigating to the local URL. For this pre-release validation, use the project-local smoke runner and a controlled local HTTP 200/page-load check. Do not treat headless mobile screenshots as authoritative if they disagree with real-device checks.

`test-server.js` 放在：

```text
D:\桌面\音樂下載\理財網頁其他資料\test-server.js
```

測正式網站資料夾：

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless
```

報告輸出：

```text
D:\桌面\音樂下載\理財網頁其他資料\headless-report.html
```

## 部署

```powershell
firebase deploy --only hosting
```

Hosting 的 `predeploy` 會先執行：

```powershell
node .\scripts\prepare-hosting.js
```

這個步驟會重新建立 `.firebase-public`，而 Firebase Hosting 只會發布該目錄。正式發布內容採允許清單，只包含 `index.html`、`404.html`、`assets/`、正式 `src/` 與 `admin/`；`src/smoke-scenarios.js` 會被排除。

若這次有修改 `firestore.rules`，請另外部署規則：

```powershell
firebase deploy --only firestore:rules
```

部署完成後確認：

```text
Hosting URL: https://financial-computer.web.app
```

## 不要部署的東西

目前不部署 Cloud Functions，因為這需要 Blaze 方案。

若看到類似訊息，代表設定可能又把 Functions rewrite 加回去了：

```text
Unable to find a valid endpoint for function `adminApi`
```

此時請檢查 `firebase.json`，目前應維持 Hosting-only。

## 維護檢查點

每次部署前，至少確認：

- 路徑是 `finance-web`。
- `firebase.json` 沒有 Functions rewrite。
- `firestore.rules` 已部署到 Firebase 專案。
- JS 語法檢查通過。
- 核心 domain 測試通過。
- 雲端同步寫入 queue 測試通過。
- 安全邊界測試通過。
- Headless smoke test 能產生報告。
