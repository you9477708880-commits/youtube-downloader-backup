# 部署檢查清單

這份文件協助確認目前部署的是正確資料夾、正確 Firebase 專案，以及核心檢查都已通過。

2026-09-12 效能／維護批次只授權本機提交，沒有推送或部署授權。驗收與量測見
`performance-maintenance-2026-09-12.md`。歷史 CI 綠燈不可代替本批提交的 CI；Windows
已知 Emulator 503 也不是測試通過。發布前仍須取得固定 CI 的最新完整證據。

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

正式版只允許從本機 `main` 部署；本機驗收與功能候選留在 `codex/*` 分支。
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

## Windows GitHub 推送流程

本機 `git commit` 不需要 GitHub 連線；完成一批功能並通過本機測試後可以先提交，
不必每次都推送。只有取得推送授權時，才執行以下流程。這是 2026-09-24～25 在
本機驗證成功的操作方式，不代表已找到原本 HTTPS 程序崩潰的單一根因。

1. 先確認分支、`HEAD`、`origin` URL、工作目錄與遠端分支 SHA。保留工作區根目錄
   其他專案的既存變更；不要用 `git add -A`、強制推送或清理整個倉庫。
2. 確認以下替代 Git 仍存在，且版本與已驗證的 `2.53.0.windows.3` 相符；路徑或
   版本若改變，先做唯讀測試與 dry-run，不直接正式推送：

   ```text
   C:\Users\you94\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe
   ```

3. 只在該次 Git 子程序設定下列環境，不寫入全域 Git 設定，也不把認證 token 放在
   URL、命令列或日誌中。先對確切目標分支做 `push --dry-run`，通過後才執行非強制
   `push origin HEAD:refs/heads/<branch>`。若會跳 Windows 錯誤視窗，以隱藏視窗、
   有時限的子程序執行；失敗時停止，不盲目重試。

   | 子程序環境 | 值 |
   | --- | --- |
   | `GIT_CONFIG_NOSYSTEM` | `1` |
   | `GIT_CONFIG_GLOBAL` | `NUL` |
   | `GIT_CONFIG_COUNT` | `4` |
   | `GIT_CONFIG_KEY_0` / `GIT_CONFIG_VALUE_0` | `credential.helper` / `!gh auth git-credential` |
   | `GIT_CONFIG_KEY_1` / `GIT_CONFIG_VALUE_1` | `http.sslBackend` / `openssl` |
   | `GIT_CONFIG_KEY_2` / `GIT_CONFIG_VALUE_2` | `http.version` / `HTTP/1.1` |
   | `GIT_CONFIG_KEY_3` / `GIT_CONFIG_VALUE_3` | `safe.directory` / `D:/桌面/音樂下載` |
   | `GIT_TERMINAL_PROMPT` / `GCM_INTERACTIVE` | `0` / `never` |

4. 推送後以 `git -c http.sslBackend=openssl ls-remote origin refs/heads/<branch>`
   核對遠端 SHA **恰好等於**本機 `HEAD`。本機 `.git/refs/remotes/origin/*` 可能因
   Codex 沙箱無寫入權而報 `update_ref ... Permission denied`；只有遠端 SHA 確認相等
   後，才在獲准的檔案權限下以
   `git update-ref refs/remotes/origin/<branch> <已核對的遠端SHA> <舊本機SHA>`
   更新該確切本機追蹤參照。這個警告不是遠端推送失敗的證據，也不能直接忽略而
   讓本機參照保持過期。若遠端 SHA 不一致，先停下查明，不做第二次推送。
5. 確認本次提交的 GitHub CI 通過。合併、Rules 和 Hosting 部署是另外的授權與
   檢查關卡，不因推送成功而自動進行。

2026-09-24 的原生 Git `2.53.0.windows.1` 曾在 `git-remote-https.exe` 發生記憶體
讀取錯誤；用不同連線參數重試也崩潰。上述隔離方式成功推送候選分支及 `main`，
但尚不能判定是 Git 版本、系統設定、連線參數或其組合造成差異。不要以
`http.sslVerify=false`、改變檔案 ACL、儲存明文 token 或 SSH 主機驗證繞過來消除錯誤。

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
npm exec firebase -- use
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

`npm test` 是發布級 `test:ci`：要求 `.nvmrc` 指定的 Node `24.15.0`、Java 21，以及 lockfile 內的 `firebase-tools@15.22.4`。這與目前 Windows 開發環境及固定 CI 一致。若其他電腦的 shell 尚未切換 Node，可先執行 `npm run test:fast` 做非 Emulator 回歸，但它不能取代發布級測試。`functions/package.json` 的 Node 20 是未部署 Functions 的雲端 runtime 目標，不是網站開發與測試工具鏈。

Firestore / Functions Emulator：

```powershell
npm run check:env
npm run test:rules
npm run test:functions
npm run test:emulators
```

Emulator runner 只呼叫專案內 Firebase CLI。每次啟動前會刪除上一輪根目錄 debug log 與 `latest` artifact；失敗時只把當次分類與日誌保存到 `.test-artifacts/emulators/latest`。Firebase CLI 設定檔權限錯誤會標成 `infrastructure-cli-config-permission`，Firestore Rules 管理端點 503 則標成 `infrastructure-firestore-admin-503`，兩者都不得誤報為 Rules 或同步程式回歸，也不得視為發布通過。GitHub CI 使用固定 `ubuntu-24.04`，並在失敗時上傳 14 天診斷 artifact。

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

任何新增 record kind 的資料版本不能只部署 Hosting。schema v3 的生活週期提醒新增 `lifeRoutine` kind，必須先部署已通過 Emulator 的新版 Firestore Rules，再部署相容 Hosting；若先發布 Hosting，正式 Rules 會拒絕保存提醒。舊有第三、四階段 v7 migration fence 仍同樣禁止只發布不相容的一邊。

若要部署 Firestore 規則：

```powershell
npm exec firebase -- deploy --only firestore:rules
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

這個步驟會重新建立 `.firebase-public`，而 Firebase Hosting 只會發布該目錄。正式發布內容採允許清單，只包含 `index.html`、`404.html`、`assets/`、正式 `src/` 與 `admin/`；smoke fixtures 已移至 `tests/smoke-scenarios/`，整個 tests 目錄不得入包，舊 `src/smoke-scenarios.js` 路徑仍保留排除防護。

若這次有修改 `firestore.rules`，請先部署規則並確認成功，再部署相容 Hosting：

```powershell
npm exec firebase -- deploy --only firestore:rules
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
- 若資料 schema 新增 record kind，Rules Emulator 已允許該 kind，且發布順序是 Rules 先、Hosting 後。
- JS 語法檢查通過。
- 核心 domain 測試通過。
- 雲端同步寫入 queue 測試通過。
- 安全邊界測試通過。
- Headless smoke test 能產生報告。
