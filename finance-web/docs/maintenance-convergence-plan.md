# 維護收斂計畫

最後更新：2026-08-29

## 結論

目前專案可以繼續維護，不需要換框架或重寫。既有 controller 抽離已讓 `actions.js` 收斂到 27 行，domain、controller、view 與 `commitState()` 的方向正確；主要風險集中在少數大型組裝／高風險檔案，而不是全站普遍失控。

本計畫採「先鎖行為，再抽邊界」；行數只用來找熱點，不作為單獨重寫理由。

## 目前熱點

| 優先 | 檔案 | 目前規模 | 風險 | 處理原則 |
| --- | --- | ---: | --- | --- |
| P1 | `src/app/bootstrap.js` | 約 910 行、45 個 import、約 231 個 DOM 引用 | 初始化、render 與 controller 組裝集中，新增功能容易增加耦合 | 先抽「UI render coordinator」，再抽 controller composition；bootstrap 最後只保留 runtime、store、sync 與 feature 組裝 |
| P2 | `src/services/storage-cloud-records.js` | 約 793 行、17 個具名 function | migration、revision、outbox、conflict 與 Firebase adapter 同檔；錯誤可能影響資料安全 | 先補 migration／conflict characterization tests，再拆 `record-sync-protocol` 與 `firestore-record-adapter`；不得改語意後才補測試 |
| P2 | `src/app/controllers/transaction-controller.js` | 約 641 行 | 表單、驗證、交易建構、準備金連結、代墊與還款集中 | 先把純交易輸入正規化／驗證抽到 domain service，再分普通交易、代墊還款與 fund-link commands |
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

### 批次一：bootstrap 組裝收斂

- 鎖定目前 15 個 smoke scenarios 與 controller lifecycle tests。
- 抽出 render coordinator，集中 `renderAll`、各頁局部 render 與 UI-only refresh。
- 抽出 controller composition，讓元素對照與依賴注入離開 bootstrap。
- 完成標準：功能不變、`npm test` 全過、bootstrap 明顯縮小且不新增全域狀態。

### 批次二：交易 controller 純邏輯抽離

- 先補普通交易、transfer、advance、repayment、fund shortfall 與 detail edit 的輸入 characterization matrix。
- 抽出純函式 command builders；controller 只讀表單、呼叫 command、commit 與顯示結果。
- 完成標準：帳務結果與既有 fixtures 完全一致，任何 command 可不靠 DOM 單測。

### 批次三：record sync 邊界拆分

- 先凍結 v6→v7 migration、revision conflict、tombstone、outbox 與 UID switch 測試。
- 把純 record merge／migration protocol 與 Firebase SDK IO 分開。
- 完成標準：Emulator 證據不變，跨裝置衝突與復原中心行為不變，Functions／Rules 不因重構而部署。

### 批次四：測試與文件整理

- 分拆 smoke scenario 檔，但維持一鍵 `npm test`。
- `current-status.md` 只保留現在真相；歷史證據移入 archive 或 Git 歷史，避免交接文件反覆自相矛盾。
- 每次發布同步更新 `current-status.md`、`roadmap.md`、`deploy-checklist.md`。

## 這次生活週期提醒的邊界

- `lifeRoutines` 只保存規則；交易仍是 `txs`。
- domain 計算日期，controller 處理 CRUD，view 建立節點，sync codec 處理 `lifeRoutine` record。
- 不做背景通知、日曆整合、醫療／車輛建議、第二份交易列表或自動新增交易。
- 若日後要背景通知，必須另開批次處理權限、裝置排程、時區、重複通知與關閉語意，不直接塞進目前 controller。
