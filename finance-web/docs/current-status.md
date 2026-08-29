# 目前工作狀態與下一步

- 最後更新：2026-08-30
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

2026-08-29 已將先前 `codex/next` 的帳戶中心／信用卡、月度回顧 2.0、退休情境與護欄再平衡、交易搜尋週期間隔、裝置清理、PWA 更新與同步衝突保護整合至 `main`，推送 GitHub、通過 CI，並部署 Firebase Hosting。正式站：

`https://financial-computer.web.app`

正式發布只包含 Hosting。該次沒有部署 Functions，也沒有讀取、修改或刪除正式 Firestore 帳務資料。

## 目前本機候選：維護收斂＋生活週期提醒

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
- 本批只使用本機與 `demo-finance-web` Emulators；不讀寫正式 Firestore，不推送、不部署。

## 維護性結論

專案不需要換框架或全面重寫。`actions.js` 已收斂為 27 行，既有 domain／controller／view 與 `commitState()` 邊界可繼續沿用。2026-08-30 已完成維護計畫第一、第二批：

1. `src/app/bootstrap.js`：920 → 約 307 行；UI、render 與 controller composition 已抽離。
2. `src/app/controllers/transaction-controller.js`：641 → 約 413 行；純帳務 commands 已移到 `src/domain/transaction-commands.js`。
3. 新增 `ui-coordinator.js`、`render-coordinator.js`、`controller-composition.js`，沒有新增全域 state。
4. 新增不依賴 DOM 的 transaction command tests，既有交易結果、介面與同步語意不變。

目前剩餘熱點是 `storage-cloud-records.js` 約 793 行，以及 `smoke-scenarios.js` 約 1307 行。下一批應獨立處理 record sync 邊界，不能和新功能、migration 或部署混在同一批。

## 目前驗證

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
- 完整 `npm test`：通過；包含 unit、release artifact、驗收隔離、20 項 Emulator 測試與 15 條瀏覽器 smoke 情境。
- 已知非阻擋警告：Functions 使用的 `firebase-functions` 版本較舊；Emulator 暫以主機 Node 24 執行，而 `functions/package.json` 指定 Node 20。依本批限制不升級依賴，另列維護批次處理。

## 發布前剩餘步驟

1. 完整 `npm test`、`git diff --check`。
2. 本機驗收版檢查桌機／手機：新增、編輯、停用、查看、刪除與重載後保留。
3. 人工確認提醒用途與資訊密度。
4. 若要發布：先合併／推送並確認 CI，再部署 Firestore Rules，最後才部署 Hosting。
5. 發布後只讀檢查；Functions 維持不部署。

## 人工驗收最小清單

- 搜尋「洗牙」，建立 180 天、提前 14 天的提醒。
- 重載驗收頁，確認提醒仍存在且沒有第二份交易清單。
- 點「查看紀錄」，確認只回填原本搜尋。
- 編輯間隔與名稱，停用再啟用。
- 刪除提醒，確認交易完全沒有被刪除或修改。
- 390px 手機寬度確認卡片與按鈕不水平溢出。
