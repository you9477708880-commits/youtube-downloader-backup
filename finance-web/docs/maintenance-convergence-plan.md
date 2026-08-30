# 維護收斂計畫

最後更新：2026-08-30

## 結論

目前專案可以繼續維護，不需要換框架或重寫。既有 controller 抽離已讓 `actions.js` 收斂到 27 行，domain、controller、view 與 `commitState()` 的方向正確；主要風險集中在少數大型組裝／高風險檔案，而不是全站普遍失控。

本計畫採「先鎖行為，再抽邊界」；行數只用來找熱點，不作為單獨重寫理由。

## 目前熱點

| 優先 | 檔案 | 目前規模 | 風險 | 處理原則 |
| --- | --- | ---: | --- | --- |
| 已完成 | `src/app/bootstrap.js` | 920 → 約 307 行 | 原本初始化、render 與 controller 組裝集中 | 已抽出 `ui-coordinator`、`render-coordinator` 與 `controller-composition`；bootstrap 只保留 runtime、store、sync、事件與啟動組裝 |
| 已拆分，待 Emulator 復驗 | `src/services/storage-cloud-records.js` | 793 → 約 549 行 | migration、revision、outbox、conflict 與 Firebase adapter 原本同檔；錯誤可能影響資料安全 | 純協定、UID 本機 outbox 與 Firestore SDK IO 已抽離；schema、路徑、revision、tombstone、migration 與衝突選擇不變 |
| 已完成 | `src/app/controllers/transaction-controller.js` | 641 → 約 413 行 | 原本表單、驗證、交易建構、準備金連結、代墊與還款集中 | 純驗證、fund allocation、detail edit、刪除 cascade 與 repayment command 已移入約 299 行的 `domain/transaction-commands.js`；controller 保留表單與互動編排 |
| P3 | `src/smoke-scenarios.js` | 約 1305 行 | 測試情境越多越難定位，但不直接影響正式 runtime | 按產品區拆 scenario modules，runner 契約保持不變 |

## 新功能維護閘門

新增功能前需同時滿足：

1. 能用一句話說出使用者何時採取什麼行動；純閱讀提示或重複數字不算。
2. 指定唯一資料真相；報表和提醒不得複製交易、餘額或準備事件。
3. 若持久化，需同批定義 schema、normalize、JSON、local snapshot、record codec、Rules、revision、tombstone、migration 與復原語意。
4. 所有修改走 `commitState()`；projection-only 功能不得偷偷寫 state。
5. domain 不得依賴 DOM／Firebase；view 不得計算帳務；controller 不直接操作雲端。
6. 先有 unit／characterization，再修改金額、同步、匯入或刪除行為。
7. 人工驗收能在五分鐘內說明用途；若必須閱讀長說明才知道用途，先退回設計。

## 建議執行順序

### 批次一：bootstrap 組裝收斂（2026-08-30 完成）

- 鎖定目前 15 個 smoke scenarios 與 controller lifecycle tests。
- 抽出 render coordinator，集中 `renderAll`、各頁局部 render 與 UI-only refresh。
- 抽出 controller composition，讓元素對照與依賴注入離開 bootstrap。
- 完成標準：功能不變、`npm test` 全過、bootstrap 明顯縮小且不新增全域狀態。

### 批次二：交易 controller 純邏輯抽離（2026-08-30 完成）

- 先補普通交易、transfer、advance、repayment、fund shortfall 與 detail edit 的輸入 characterization matrix。
- 抽出純函式 command builders；controller 只讀表單、呼叫 command、commit 與顯示結果。
- 完成標準：帳務結果與既有 fixtures 完全一致，任何 command 可不靠 DOM 單測。

### 批次三：record sync 邊界拆分（2026-08-30 程式完成，待 Emulator 環境復驗）

- 先凍結 v6→v7 migration、revision conflict、tombstone、outbox 與 UID switch 測試。
- 把純 record merge／migration protocol 與 Firebase SDK IO 分開。
- 完成標準：Emulator 證據不變，跨裝置衝突與復原中心行為不變，Functions／Rules 不因重構而部署。

### 批次四：測試與文件整理

- 先完成驗證環境標準化：Node `20.20.2`、Java 21、專案內 `firebase-tools@15.22.4`、固定 Ubuntu CI 與 Emulator 失敗診斷；維持一鍵 `npm test`。
- 分拆 smoke scenario 檔，但維持 runner 契約與既有 15 條情境。
- `current-status.md` 只保留現在真相；歷史證據移入 archive 或 Git 歷史，避免交接文件反覆自相矛盾。
- 每次發布同步更新 `current-status.md`、`roadmap.md`、`deploy-checklist.md`。

驗證環境標準化不改正式 runtime、帳務、同步協定、Rules 或 Functions 語意。`npm run test:fast` 只提供非 Emulator 快速回歸；合併與發布仍以固定 Linux CI 的 `npm run test:ci` 為權威。若 Emulator 失敗，runner 必須區分 Firestore 管理端點 503、埠占用、Java／瀏覽器缺失與真正測試失敗，並保留可下載日誌。

## 第一至三批完成證據

- `bootstrap.js` 從 920 行降至約 307 行；新增約 259 行 UI coordinator、79 行 render coordinator 與 404 行 controller composition，各檔責任單一且沒有新增全域狀態。
- `transaction-controller.js` 從 641 行降至約 413 行；帳務 command 可在沒有 DOM、Firebase 或 localStorage 的情況下直接測試。
- 新增 render coordinator 3 項單元測試與 transaction commands 4 項單元測試；原本 20 項 transaction controller characterization tests 保持通過。
- 交易準備金不足、交易解除準備、代墊修改、還款修改、交易搜尋、帳戶中心與 AndroMoney 匯入的聚焦 browser smoke 已通過。
- 未改 state schema、record codec、Firestore Rules、Functions、帳務公式、同步格式或 UI layout。
- `storage-cloud-records.js` 從 793 行降至約 549 行；新增約 112 行的純 `record-sync-protocol.js`、43 行的 `record-sync-local-store.js` 與 158 行的 `firestore-record-adapter.js`。原本的 `createRecordCloudSync()` 公開介面保持不變；facade 不再直接處理 Firestore SDK snapshot、timestamp 或 IO。
- characterization tests 鎖定 revision merge、同版不同內容衝突、tombstone、UID outbox、等價初始資料不提示、UID 切換淘汰舊 listener、450 筆分批重試與 competing migration owner。
- adapter 5 項直接測試鎖定路徑、snapshot／錯誤邊界、400 筆批次、timestamp 與 persistence 清理順序；安全測試阻止 SDK IO 回流 facade。
- 功能 smoke 固定關閉 cloud／PWA，避免背景匿名驗證污染 UI 情境；每個瀏覽器 fallback 使用獨立暫存 profile。15 個 smoke scenarios 已完整通過。
- 本機 Firestore Emulator 可啟動，但載入 Rules 的管理端點回傳 503；Temurin 21.0.8／21.0.12、Emulator 1.20.2／1.20.4 與 Node 20.20.2／24.15.0 結果相同。這是目前唯一未完成的批次三復驗，不視為測試通過，也不以此候選發布。

目前先以標準化 Linux CI 恢復 Emulator 證據，再進行批次四 smoke scenario 分檔；不得以本機 Windows 503 當成程式通過，也不得在權威 CI 通過前發布 record-sync 重構。

## 這次生活週期提醒的邊界

- `lifeRoutines` 只保存規則；交易仍是 `txs`。
- domain 計算日期，controller 處理 CRUD，view 建立節點，sync codec 處理 `lifeRoutine` record。
- 不做背景通知、日曆整合、醫療／車輛建議、第二份交易列表或自動新增交易。
- 若日後要背景通知，必須另開批次處理權限、裝置排程、時區、重複通知與關閉語意，不直接塞進目前 controller。
