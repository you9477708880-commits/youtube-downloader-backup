# 資料可靠性與日常操作收斂：本機交付

日期：2026-09-22。分支：`codex/maintenance-life-cycle`。工作起點：`12e790a`。

授權依據：[授權交接書](authorization-data-reliability-2026-09-20.md)。本批只在本機實作、測試與提交，沒有推送、合併 main、部署、正式登入、正式 Firestore 存取或修改使用者瀏覽器資料。未啟動人工預覽。

## 結果與邊界

| 工作 | 實作結果 | 主要回歸證據 |
| --- | --- | --- |
| A JSON 還原 | 走既有 commitState，保存成功後才換 store／重設草稿；JSON／CSV 等待讀檔時的舊登入 generation 不得套用 | import-controller、state-commit、storage-local |
| B 匯入 ID | 使用 codec recordKey 的 kind／canonical ID 邊界，含數字／字串碰撞、準備金事件複合 ID；錯誤顯示位置，整份拒絕 | import-export、record-codec、既有 CSV 450 筆帳戶修復 |
| C 保存後錯誤 | 區分本機未保存與本機已保存的 UI／queue 錯誤；UI 拋例外仍安排有效 scope 同步；防重入、舊通知、等待復原時切換 UID | commit-reliability、sync-coordinator、state-commit |
| D 編輯刪除 | 刪除目前目標會清除對應編輯狀態；domain 對不存在 editing ID 明確失敗，不回退成新增 | transaction-commands/controller，desktop/mobile smoke |
| E 信用卡日期 | 未設定不虛構日期；最近繳款日包含今天、跨月／年與僅部分設定；不代表銀行實際帳單 | account-center、account-center smoke |
| F 提醒查詢 | 查看紀錄帶關鍵字並切全部期間；清除舊自訂日期，不改月度報表 | reminder/search controllers、transaction-search smoke |
| 再記一筆 | 詳情預填新增表單，今天日期、白名單欄位、有效帳戶／分類；確認才產生新 ID；取消零寫入、草稿保護、禁止特殊關聯複製 | transaction-repeat、controller/detail、daily-operations 桌機及 390px |

備註欄改為可伸縮 textarea，保留多行長備註；沒有重排全站介面。原 CSV external identity、去重／修復規則、準備金、代墊／還款 cascade、revision／outbox／tombstone 及整筆衝突選擇均保留。本批沒有欄位級合併，也沒有增加自動下載 JSON。

維護分工維持：純預填資格在 `src/domain/transaction-repeat.js`；草稿／連按防護在 transaction controller；詳情只提供入口；JSON 驗證在 import-export；耐久性在 state-commit；登入 generation 在 sync coordinator。沒有引入框架、依賴、另一套同步或全站索引。

## 測試紀錄

所有故障注入與帳務使用合成 fixtures。瀏覽器 smoke 每次使用拋棄式 profile，cloud／PWA 關閉；手機案例在隔離頁面內使用 390×844 CSS viewport iframe，不等於真手機硬體驗證。

| 命令／檢查 | 結果 | 證據／限制 |
| --- | --- | --- |
| `npm run check:env` | exit 0 | Node 24.15.0、Java 21、專案 firebase-tools 15.22.4 符合，沒有升級 |
| `npm run test:unit` | exit 0 | 最終全套 unit／syntax；`.test-artifacts/sep22-unit-complete.log` |
| `npm run test:release` | exit 0 | 打包邊界及 release 啟動；`.test-artifacts/sep22-release-final.log`，不是部署 |
| `npm run test:acceptance` | exit 0 | 強制離線、namespace 隔離與驗收包啟動；`.test-artifacts/sep22-acceptance-final.log`，不是開人工預覽 |
| `npm run test:smoke` | exit 0，18/18 | `.test-artifacts/sep22-smoke-full.log`；包含既有16情境＋日常操作桌機／390px |
| `npm run test:emulators` | exit 1，未通過 | 僅 `demo-finance-web`。詳見下節；不以舊 CI 抵替 |
| `git diff --check -- .` | exit 0 | 僅 finance-web 範圍；父層其他專案／使用者文件未納入 |

初始故障重現／重跑也保留說明，不只報最後綠燈：

- 新增可靠性回歸測試先重現舊 UI 拋例外截斷 queue、enqueue 例外、重入等失敗後再修正。
- 實作中途第一次全套 unit 因交易測試 fixture 含每月提撥、觸發未等待的準備金選擇而失敗；修正該純一般交易 fixture 為零每月提撥，未刪除產品檢查，最終全套重新通過。
- 手機 wrapper 初版以父頁 requestAnimationFrame 輪詢，被 iframe 遮住的 headless 父頁未回報；原失敗報告 `.test-artifacts/sep22-mobile-smoke.html`。改為有 6 秒失敗界線且會清理的 timer 輪詢，保留全部斷言，`.test-artifacts/sep22-mobile-retry.html` 及最終18情境通過。未因該失敗修改產品排版。
- Chrome 部分 headless 模式在本 Windows 有 GPU／暫存 profile 權限警告，既有 runner 的 swiftshader fallback 成功；沒有清理使用者 profile。暫存 profile 未能刪除的警告不代表使用者資料被操作。

### Emulator 未通過與有限診斷

1. 首次 CLI 因 configstore 權限 EPERM 未能啟動；保留 `.test-artifacts/emulators/sep22-cli-permission/`。
2. 在已授權執行範圍內以較高執行權限重試同一 demo 命令，Emulators 啟動後 Rules 管理／清空端點回傳既知 `503 UNAVAILABLE: Network closed for unknown reason`。21 項：0 通過、13 失敗、8 取消。診斷分類 `infrastructure-firestore-admin-503`，不算程式通過。
3. 同輪另有 Functions backend specification 載入 10 秒逾時，**不能全部歸因為 503**。已檢視未變更的 Functions 初始化程式，在 demo project／本機 emulator 環境變數下唯讀載入 `functions/index.js`，約 249ms 成功匯出 adminApi；沒有呼叫 API、存取資料或部署。這只能排除直接模組載入錯誤，尚未確定 CLI 探測逾時原因，也不算 Functions Emulator 通過。
4. 記錄在 `.test-artifacts/emulators/latest/summary.json`、`runner-output.txt`、`firestore-debug.log`。本次 runner 已關閉自己啟動的 Emulators；遵守交接停止條件，不再反覆修 Java、CLI、依賴或放寬 timeout。

以上 log／報告在忽略的 `.test-artifacts` 本機目錄，不加入 Git。重跑同名輸出前應先保留失敗證據。下一步需另授權推送，讓固定 Ubuntu CI 對這批提交跑完整 Emulator；若 Functions timeout 仍出現，獨立診斷，不跳過 gate。

## 獨立審核

兩位未參與實作的子代理分別審可靠性與日常操作，僅讀取／執行測試，沒有同時修改檔案：

- 可靠性初審指出等待 rollback 時 UID 切換可能套用舊結果，以及 store 通知例外／重入的邊界。主代理已修正並加測；複核未再發現阻擋。最後 CSV 讀檔與延遲通知 guard 的 23 項 import-controller 測試全過；另建議的切換帳號取消文案已修正。
- 日常操作初次複核 67 項相關測試通過；最後含 mobile wrapper／smoke contract 的窄複核 59 項通過，未發現阻擋。手機實際 PASS 由主代理執行，審核者未冒稱自行跑瀏覽器。
- 主代理整合後執行上述全套可運行檢查。審核不保證零缺陷，也不取代仍受阻的 Emulator 與未做的正式端驗證。

## 集中人工驗收（約 5～10 分鐘）

2026-09-24 第一項驗收觀察：使用者先從未登入的正式站匯出 `finance_backup.json`，該檔案只有 0 筆交易、3 個預設帳戶，故在驗收版切換「全部時間」仍是 0。登入後另行匯出的 `finance_backup (1).json` 經唯讀檢查含 457 筆交易、11 個帳戶、日期涵蓋 2026-02-02 至 2026-08-08，符合匯入格式；使用者回報匯入後數字正常。這是檔案來源問題，並非月份篩選或 JSON 還原漏掉交易。避免再誤認，本機候選補上匯出／匯入筆數；0 筆交易備份在覆蓋前明確確認，取消時原資料／草稿不變。修正後 `npm run test:unit`、`test:release`、`test:acceptance` 均通過，記錄在 `.test-artifacts/sep24-empty-backup-*.log`。這是 2026-09-22 提交之後的本機補丁，不屬於當時遠端 CI 證據。

2026-09-24 第二項驗收觀察：使用者指出記帳列表只有灰色小「×」，找不到刪除。確認該鍵可刪除、正在編輯的紀錄不會復活，使用者將此項標為通過；另把列表按鈕改為可讀的「刪除」，保留確認視窗與原刪除流程。未要求使用者刪除匯入的真實交易；僅以測試交易驗收。

2026-09-24 第三項驗收觀察：使用者將繳款日設為 24 日，當天卡片顯示 `2026-09-24`，原「今天也算最近預定日」規則通過。使用者指出 29～31 日被限制無法設定；本機候選將欄位、儲存、正規化、JSON 驗證與日期推算一併擴至 1～31 日。較短月份按當月最後一天推算，原設定保留不變；這仍只是提醒，不代表銀行實際帳單或假日順延。待使用者重新整理驗收版後確認新介面。

2026-09-24 第四項驗收回饋：使用者可搜尋到 `2026-03-31` 的機油紀錄，也建立了「換機油」提醒，顯示 `2026-09-27`、距到期 3 天。但需要先操作另一個交易搜尋框才能建立提醒，使用者判定流程未通過。本機候選改為直接輸入提醒名稱就搜尋所有歷史交易，在提醒表單預覽筆數、最近日期與預計下次日期；名稱和記帳用語不同時可填選用關鍵字。上方交易搜尋仍獨立，只有按「查看紀錄」才切換其顯示，並不改總覽報表期間。待使用者重新整理後重新驗收。

2026-09-24 第五項驗收：使用者以「再記一筆」複製測試交易，截圖顯示 9/23 原交易與 9/24 新交易並存，金額、現金帳戶、備註相同；使用者同意本項通過。自動測試另覆蓋取消零寫入、只多一筆與原交易不變。

使用者已要求啟動 `preview:acceptance`，本機隔離驗收版目前由 `http://127.0.0.1:4186/` 提供。頁首須明確顯示「本機驗收版／僅本機」、登入停用；不要為測試在正式站刪除交易或清除瀏覽器。測試資料可用自行準備的 JSON 副本或合成資料。2026-09-24 回饋修正後，單元／語法、release、acceptance 與 18 項 browser smoke 均通過；第三、四項仍待使用者重新整理頁面後複驗。

1. **JSON 還原**：匯入前先確認來源站已顯示預期交易筆數；本次含交易的檔案是 `finance_backup (1).json`。匯入後筆數／帳戶／金額符合，重新載入仍在；驗收包不得顯示已同步正式雲端。故障、quota、UID 切換由自動測試覆蓋，不需人為製造正式故障。
2. **編輯與刪除**：建立測試交易 → 開始編輯 → 刪除同筆 → 再按儲存；舊交易不得重現或偷偷產生新交易。其他無關草稿不應消失。
3. **信用卡日期**：空白日期顯示未設定；繳款日設為今天日期會顯示今天而非跳下個月（24 日已通過）；29～31 日也可設定，2 月或小月自動取月底，可試結帳日31／繳款日31。這不是銀行實際未繳提醒。
4. **生活提醒**：不操作上方交易搜尋，直接在提醒名稱輸入「換機油」，應即時顯示歷史筆數／最近日期；填 180 天後應顯示預計 `2026-09-27`。儲存後按「查看紀錄」，搜尋期間應切為全部、舊紀錄可見且總覽月份不變。提醒名稱和記帳文字不同時，可在選填關鍵字指定後再驗證。
5. **再記一筆**：打開普通支出 → 再記一筆；看到新增、今天、完整多行備註、正確帳戶；取消筆數不變，再試儲存只多一筆且原交易未改。手機看詳情／表單可讀、沒有橫向溢出；準備金／代墊／轉帳等不提供此入口。

人工檢查只回報「通過／問題＋操作步驟／截圖」即可。不需要重新驗收全站或自行排除 Emulator。

## 提交與待驗證

本批程式／測試提交：`ca7adb6`（`fix: harden data commits and streamline daily transaction workflows`）。本報告與主要文件另以緊接其後的 `docs: record data reliability verification and acceptance handoff` 提交保存，最終交付訊息列兩個提交 ID。

尚未驗證：本批遠端 CI、完整 Firestore／Functions Emulator、Google 正式登入與真實多裝置同步、真手機鍵盤／觸控及上述人工操作。**本批不是正式發布批准。** 既有 schema v3 候選與尚未發布 Rules 的相容性仍須列入另批發布計畫，本輪沒有變更或部署 Rules。
