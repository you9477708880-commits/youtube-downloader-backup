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

正式版只允許從本機 `main` 部署；本機驗收與功能候選留在 `codex/next`。
`.acceptance-public` 永遠不是 Firebase Hosting 的發布來源。

## 本機驗收版

需要人工驗收時執行：

```powershell
npm run preview:acceptance
```

這會重新建立 `.acceptance-public` 並在 `http://127.0.0.1:4186` 提供預覽。驗收版
會明示「本機驗收版」，強制停用 Firebase、Google 登入、雲端同步與 PWA，並使用
`fin_v7:acceptance:*` localStorage 與獨立的衝突復原 IndexedDB。正式版資料不會被
讀取、遷移或覆蓋。關閉瀏覽器網站資料會清除這份驗收資料。

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

再確認目前位於正式分支、與遠端正式點一致且 finance-web 沒有 tracked 修改：

```powershell
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status --short -- finance-web
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
node .\tests\storage-local.test.mjs
node .\tests\record-codec.test.mjs
node .\tests\storage-cloud-records.test.mjs
```

完整一鍵測試：

```powershell
npm ci
npm test
```

Firestore / Functions Emulator：

```powershell
npm run test:rules
npm run test:functions
npm run test:emulators
```

Emulator 測試固定使用 `demo-finance-web`，不得改成正式 Firebase project ID。Firestore 規則測試需驗證未登入、錯誤 UID、legacy fence、migration ID、revision、tombstone 與實體 delete；Functions 最小測試需驗證 HTTP function 能啟動且未授權要求被拒絕。

Functions Emulator 使用獨立的 `firebase.emulator.json`。管理 API 已在本機支援 v7 summary、preparing fallback、tombstone 排除與單一 UID recursive delete，且管理員 Auth／自刪阻擋／UID 隔離均有 Emulator 測試；但正式 `firebase.json` 仍不宣告 Functions source 或 Hosting `/api/**` rewrite。Functions 仍不屬於目前 Hosting 候選發布範圍，沒有另行核准部署、管理員白名單與上線復原方案前不得部署。

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
artifacts/{appId}/users/{userId}/sync/finance_v7
artifacts/{appId}/users/{userId}/sync/finance_v7/records/{recordKey}
```

只能允許 `request.auth.uid == userId` 的使用者讀寫。v7 record create 必須從 revision 1 開始，update 必須剛好加 1，禁止實體 delete；tombstone 必須 `payload == null`。v7 meta active 後，舊 `finance_v6` 不再允許舊版 client 寫入。其他路徑預設拒絕。

第三、四階段不能只部署 Hosting。必須先確認新版 Hosting 與新版 Firestore rules 會在同一個維護窗口發布；若只發布其中一邊，新 client 會因 records 路徑被拒絕，或舊 client 可能繼續覆寫 `finance_v6`。

若要部署 Firestore 規則：

```powershell
firebase deploy --only firestore:rules
```

## Headless smoke test

Current project-local smoke runner:

```powershell
npm run test:smoke
```

Current project-local UI smoke scenarios:

```powershell
npm run test:smoke
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
npm run deploy:hosting:production
```

不要直接執行 `firebase deploy --only hosting`。受保護命令會先檢查：

- 分支必須是 `main`。
- `HEAD` 必須與 `origin/main` 相同。
- finance-web tracked worktree 必須乾淨。
- `.firebaserc` 必須指向 `financial-computer`。
- `index.html` 必須是 production runtime 且允許 cloud。
- 必須透過專用 npm 命令提供一次性的內部確認；直接 Firebase 命令沒有確認值，會被擋下。

Hosting 的 `predeploy` 也會再次執行 guard，之後才執行：

```powershell
node .\scripts\production-deploy-guard.mjs
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
- 分支是 `main`，且 `HEAD == origin/main`；候選分支不得直接部署。
- 使用 `npm run deploy:hosting:production`，不要繞過部署 guard。
- `firebase.json` 沒有 Functions rewrite。
- `firestore.rules` 已部署到 Firebase 專案。
- JS 語法檢查通過。
- 核心 domain 測試通過。
- 雲端同步寫入 queue 測試通過。
- 安全邊界測試通過。
- Headless smoke test 能產生報告。
