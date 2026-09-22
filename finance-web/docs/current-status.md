# 目前工作狀態與下一步

- 最後更新：2026-09-22
- 正式分支：`main` at `67ed8fc`
- 遠端正式點：`origin/main` at `67ed8fc`
- 正式 Hosting 已知部署點：`67ed8fc`
- 目前本機候選分支：`codex/maintenance-life-cycle`
- Firestore：既有 v7 Rules 已部署；schema v3 候選 Rules 尚未部署
- Firebase Functions：維持不部署

這份文件只保留「現在真相」。長期方向看 `roadmap.md`；資料規則看
`data-model.md`、`accounting-rules.md`、`report-traceability.md`；正式發布看
`deploy-checklist.md`；維護熱點與拆分順序看 `maintenance-convergence-plan.md`。

## 正式版狀態

以下正式／遠端部署點是既有紀錄，本批未連線查證、推送或部署；不得當作 2026-09-22 候選的 CI 證據。

2026-08-29 已將先前 `codex/next` 的帳戶中心／信用卡、月度回顧 2.0、退休情境與護欄再平衡、交易搜尋週期間隔、裝置清理、PWA 更新與同步衝突保護整合至 `main`，推送 GitHub、通過 CI，並部署 Firebase Hosting。正式站：

`https://financial-computer.web.app`

正式發布只包含 Hosting。該次沒有部署 Functions，也沒有讀取、修改或刪除正式 Firestore 帳務資料。

## 2026-09-22 本機候選：資料可靠性與日常操作收斂

- 以 `12e790a` 為工作基準，留在 `codex/maintenance-life-cycle`；未合併 main、推送或部署。
- 程式與測試提交：`ca7adb6`。環境檢查、全套 unit／syntax、release、離線 acceptance 與全部 18/18 browser smoke 通過；兩位獨立子代理複核無阻擋。這不代表下列 Emulator 或遠端 CI 已通過。
- JSON 還原先完成本機保存才替換資料／清除草稿；canonical ID 與同步 codec 一致，重複 ID 整份拒絕、不換 ID。
- UI 更新失敗不再截斷有效 scope 的雲端排隊；同步／匯入回呼增加登入 generation 防護，包含 A→B→A 及等待復原保存時切換帳號。
- 刪除正在編輯的交易不再變成新增；信用卡未設定日期不虛構每月 1 日，最近繳款日包含今天；提醒查看紀錄改為全部期間，不影響月度報表。
- 交易詳情新增「再記一筆」：僅一般無特殊關聯收入／支出，確認才保存，不沿用原 ID／匯入身份；保護未保存草稿、無效帳戶／分類、長備註與重複送出。
- 本批不變更 schema v3／migration／Rules／Functions／依賴，不讀寫正式資料。既有 schema v3 候選仍須另外處理 Rules 發布相容性，不能只把 Hosting 當作已可上線。
- 實作、測試、審核與集中人工驗收見 [2026-09-22 批次報告](data-reliability-2026-09-22.md)。人工預覽尚未啟動。
- 本機 Emulator 再現 Rules 管理端點 503，另外 Functions backend 探測逾時；完整 Emulator 套件未通過，不能以歷史 CI 抵替。需之後另行授權推送，取得固定 Ubuntu CI 的本批證據。

## 既有本機候選：維護收斂＋生活週期提醒

### 使用者用途

使用者先用既有交易搜尋輸入「洗牙」「機油」等關鍵字，再把它保存成例行提醒。網頁開啟時會顯示已逾期／即將到期摘要；「查看紀錄」會回到同一個交易搜尋，不出現第二份交易列表。

### 已實作邊界

- state schema 由 2 升為 3，新增 `lifeRoutines`。
- 每筆只保存 `id`、名稱、搜尋關鍵字、預期間隔、提前提醒天數、啟用狀態與建立／更新時間。
- 最近日期、平均間隔、預計日期與狀態全部由既有 `txs` 即時計算；同日多筆只算一次。
- 可新增、編輯、停用／啟用、查看既有搜尋及刪除。
- 所有 mutation 走 `commitState()`，因此先保存目前 UID／local snapshot，再更新 UI、排入雲端 queue。
- JSON 完整備份包含提醒；AndroMoney CSV 不包含提醒。
- record sync 新增 `lifeRoutine` kind；刪除使用 revision tombstone；衝突復原中心可辨識「生活週期提醒」。
- Firestore Rules 本機候選已允許 `lifeRoutine`，Rules Emulator 需完整通過才可發布。
- v7 管理 Functions 的本機 summary 可計算提醒數量，但 Functions 仍不部署。
- 不做背景通知、行事曆、Service Worker 排程、專業建議或自動交易。

### 資料安全

- 舊 schema 1／2 載入後只補成 `lifeRoutines: []`，不修改既有交易。
- schema v3 Hosting 不可單獨發布；必須先部署通過測試的新 Rules，否則 `lifeRoutine` record 會被正式 Rules 拒絕。
- 功能與同步驗證只使用本機與 `demo-finance-web` Emulators；不讀寫正式 Firestore。驗證環境標準化批次可推送候選分支確認 CI，但不部署。

## 維護性結論

專案不需要換框架或全面重寫。`actions.js` 已收斂為 27 行，既有 domain／controller／view 與 `commitState()` 邊界可繼續沿用。2026-08-30 已完成維護計畫第一、第二批，並完成第三批程式拆分：

1. `src/app/bootstrap.js`：920 → 約 307 行；UI、render 與 controller composition 已抽離。
2. `src/app/controllers/transaction-controller.js`：641 → 約 413 行；純帳務 commands 已移到 `src/domain/transaction-commands.js`。
3. 新增 `ui-coordinator.js`、`render-coordinator.js`、`controller-composition.js`，沒有新增全域 state。
4. 新增不依賴 DOM 的 transaction command tests，既有交易結果、介面與同步語意不變。
5. `src/services/storage-cloud-records.js`：793 → 約 549 行；純 record protocol、UID 本機 outbox 與 Firestore SDK adapter 已分檔。Facade 不再直接處理 Firestore path、讀寫、listener snapshot、server timestamp 或 persistence。
6. `createRecordCloudSync()` 公開介面、Firestore v7 路徑、record codec、revision、tombstone、migration fence 與整筆衝突選擇均未改變。
7. 驗證環境已統一：Windows、`.nvmrc`、package engine、環境檢查與固定 `ubuntu-24.04` CI 全部使用 Node `24.15.0`，搭配 Java 21、專案內 `firebase-tools@15.22.4` 與跨平台 Chromium 路徑；本機不再依賴全域 Firebase CLI。未部署 Functions 的 Node 20 只代表 Firebase 支援的雲端 runtime 目標。

record-sync 邊界拆分已有歷史固定 Ubuntu CI 復驗證據。本輪尚未推送的修改不能沿用該次綠燈作為最新發布證據。record sync 若再拆，只能由新的失敗證據驅動，不以行數為理由繼續切碎。

## 2026-09-12 本機效能與維護收斂

- 記帳明細每頁 50 筆；日期小計、交易筆數與報表仍使用完整符合資料。搜尋不再替換總覽最近交易。
- 帳戶相關交易收合時不建立明細 DOM，展開才索引與分頁；一般重新渲染保留頁碼、展開狀態及未送出的對帳輸入，整份 state／UID 切換會清除這些暫存。
- 退休控制項只更新退休頁，不重建交易、帳戶表單或月報；帳戶選項更新與明細渲染分離。
- 代墊還款與 CSV 重複配對採單次索引；每次完整 render 共用 budget／balances／balanceSheet，沒有跨更新快取。
- smoke fixtures 已搬到 `tests/smoke-scenarios/` 按功能分檔；unit／語法 runner 預設最多 4 個工作程序，可用 `--jobs=1` 復現序列執行，會寫入共用打包目錄的測試獨立執行。
- 保存流程完成量測但不改動：維持先本機成功保存，再替換 state、畫面更新及雲端排隊的安全順序。
- 本批不變更 dependencies、lockfile、schema、帳務規則、migration、Firestore Rules 或 Functions；不推送、不部署、不操作正式或使用者瀏覽器資料。
- 測試證據、量測範圍及集中人工驗收清單見 `performance-maintenance-2026-09-12.md`。
- 本輪最終分項：全部 unit／syntax、release 打包與啟動、驗收隔離與啟動通過，完整 smoke 複驗 16/16。曾有一次 CSV 瀏覽器未回報導致該輪 `test:fast` exit 1；已保留失敗紀錄，未改斷言後完整 smoke 重跑通過，詳見批次報告。Emulators／遠端 CI 本輪未執行。

## 前批歷史驗證（截至 2026-08-30）

以下為前批紀錄，不代表 2026-09-12 候選提交已通過遠端 CI；本輪結果見上述批次報告。

- 語法與全部 unit tests：通過。
- 生活提醒 domain：包含無紀錄、即將到期、逾期、停用、排序、同日去重與不修改交易。
- controller：包含新增、編輯、停用、查看搜尋、刪除及非法輸入不 commit。
- record codec：包含 round-trip、revision 與刪除 tombstone。
- localStorage／JSON shape／event wiring：通過。
- transaction-search UI smoke：通過，確認保存提醒後不改月度報表範圍、不複製交易列表。
- render coordinator：3 項直接測試通過，鎖定完整 render 順序、搜尋替代 ledger 與 whole-state refresh。
- transaction commands：4 項直接測試通過，涵蓋 transfer／advance 驗證、fund allocation、detail edit、provenance、刪除 cascade 與 repayment 關聯。
- 原本 20 項 transaction controller characterization tests 保持通過。
- 聚焦 browser smoke：準備金不足、解除準備、代墊修改、還款修改、搜尋、帳戶中心及 AndroMoney 匯入通過。
- 本批 unit、release artifact、驗收隔離及 15 條瀏覽器 smoke 情境：通過。smoke 功能情境固定關閉 cloud／PWA，且每個瀏覽器 fallback 使用獨立 profile，避免背景驗證或崩潰後的鎖檔污染結果。
- 本批新增的同步 characterization tests：通過；涵蓋 revision merge、同版衝突、tombstone、UID outbox、等價 state、UID switch、450 筆分批重試與 migration owner fence。
- Firestore adapter 另有 5 項直接測試，鎖定 v7 路徑、SDK snapshot 轉換與錯誤邊界、400 筆分批上限、server timestamp 及 terminate-before-clear 順序；安全測試禁止 facade 重新引入 Firestore IO。
- Windows 現有 Node 24.15.0 下的 unit、release artifact、驗收隔離及 15 條 smoke：全部通過；版本契約已與實際開發環境對齊。
- 6 項驗證環境測試鎖定 Node 24.15.0、Java 21、專案 CLI 路徑、503／埠占用分類、Linux 瀏覽器偵測，以及每次執行前的舊 Emulator 日誌清理；Firebase CLI 設定檔 EPERM 會獨立分類為 `infrastructure-cli-config-permission`，不再被舊 503 日誌誤導。
- 本機 `npm run test:emulators` 仍受 Windows Firestore Emulator 503 阻擋；Node 24.15.0、Temurin 21.0.12、Microsoft OpenJDK 21.0.12.1、專案 CLI 15.22.4 與 Emulator 1.21.0 均已重現。runner 正確分類為 `infrastructure-firestore-admin-503` 並只保存當次 `.test-artifacts/emulators/latest`，不再把取消案例或舊日誌誤報為 record-sync 程式回歸。歷史診斷也曾在 Node 20.20.2 重現，因此不是 Node 版本或 Java 發行商差異造成。
- 固定 `ubuntu-24.04` GitHub CI 已在工具鏈對齊前完整通過 `test:ci`、Rules／Functions Emulators 與雙隔離瀏覽器同步衝突測試；工作流程現已改用 Node 24.15.0，需在推送本批後重新取得同版本 CI 證據。
- GitHub Actions 的 `checkout`／`setup-node` 已升至 v5，受測應用也固定使用 Node 24.15.0；action runtime、Windows 開發版本與 CI 受測版本不再分岔。
- 其他既有警告：Functions 使用的 `firebase-functions` 版本較舊。依本批限制不升級依賴。
- `firebase-tools@15.22.4` 支援 Node 24；先前 Node 20 下的非核心相依套件 engine warning 已由工具鏈升級消除。Functions 雲端 runtime 仍維持官方支援的 Node 20，且本批不部署 Functions。

## 發布前剩餘步驟

1. 完成剩餘本機驗收版桌機／手機檢查：新增、編輯、停用、查看、刪除與重載後保留。
2. 人工確認提醒用途與資訊密度。
3. 若決定發布 schema v3，必須先依部署清單評估 Rules，再發布相容 Hosting；Functions 維持不部署。
4. 後續 CI 若失敗，先讀取 14 天內保留的 Emulator diagnostics artifact，不再以本機 Windows 503 推測程式回歸。

## 人工驗收最小清單

- 搜尋「洗牙」，建立 180 天、提前 14 天的提醒。
- 重載驗收頁，確認提醒仍存在且沒有第二份交易清單。
- 點「查看紀錄」，確認只回填原本搜尋。
- 編輯間隔與名稱，停用再啟用。
- 刪除提醒，確認交易完全沒有被刪除或修改。
- 390px 手機寬度確認卡片與按鈕不水平溢出。
