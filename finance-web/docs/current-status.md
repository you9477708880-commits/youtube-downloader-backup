# 目前工作狀態與下一步

- 最後更新：2026-08-23
- 目前分支：`main`
- 遠端 `origin/main`：`main`（含本次發布紀錄文件）
- 正式站已知部署點：`e01aa1c`

這份文件是專案目前的主要交接入口。需要理解長期產品方向時讀
`roadmap.md`；準備部署時讀 `deploy-checklist.md`；修改帳務行為前則必須讀
`accounting-rules.md`、`data-model.md` 與 `report-traceability.md`。

## 目前結論

衝突復原中心與「相同資料不誤判衝突」已於 2026-08-23 推送、通過 CI、部署 Hosting 並完成正式站唯讀檢查。現在選擇「保留雲端」或「保留本機」時，落敗版本會存入裝置內 IndexedDB，不再自動下載大量備份檔。

帳戶中心與信用卡管理目前為本機驗收版：不新增頂層分頁，在資產負債頁提供帳戶卡片、信用卡週期與額度、交易明細及需確認的對帳調整。此功能尚未推送或部署。

月度回顧 2.0 亦已完成本機實作：在原有月度摘要內加入預設收合的「與上期比較」，用相同天數比較收入、生活支出、準備提撥／補入、動用準備及最大支出分類變化。它完全由既有 `txs`、預算與準備資料推導，不評分、不自動下結論，也不新增同步欄位。

本晚再完成兩個預設收合的本機候選：月度回顧內的「財務導航」只整理收入、生活支出、資產、負債四個既有數字與兩個不保存答案的自評問題；退休頁的「情境比較」只比較目前設定、延後三年退休及每月提領降低 10%。兩者都是只讀推導，不新增持久化欄位、不改同步或 Firestore 規則，也不把結果當成評分、投資建議或保證。

發布前穩定批次已於 2026-08-10 完成、推送並部署。Firestore v7 rules 與 Firebase
Hosting 均已發布到 `financial-computer`，正式網址為
`https://financial-computer.web.app`。Firebase Functions 依既定決策保持不部署。

## 已完成（含已發布與本機候選）

### 產品功能

- 月度回顧 2.0：摘要、來源明細與同天數前期比較（本機待驗收）。
- 財務導航摘要 A：四個既有量化來源與兩個非評分自評問題（本機待驗收）。
- 退休情境比較 A：三種單一變因情境與耗盡／最低需求參考（本機待驗收）。
- 待購項目預填大額準備表單；目前只預填，不會自動建立 fund、交易或事件。

### 資料安全與同步

- 正式入口不再接受 smoke query 寫入測試資料。
- Hosting 改用允許清單建立 `.firebase-public`，排除測試、文件、規則、Functions
  原始碼與 EPUB。
- 同一 UID 的雲端寫入改為序列 queue，避免快速連續修改並行覆寫整份 state。
- localStorage 已分成未登入 `local` 與 Firebase `uid` namespace。
- Firestore v7 已加入 record-level documents、revision、migration fence、deletion
  tombstone、UID outbox 與同一 record 的整筆衝突選擇。

### 工程品質與維護性

- 根目錄 `npm test` 已整合語法、單元、Firestore/Functions Emulator 與 15 個 UI
  smoke scenarios。
- GitHub Actions 已使用 Node 20、Temurin 21 與 `demo-finance-web`。
- 資產負債 controller 第一批已完成，並有 10 項 characterization tests。
- `actions.js` 不再持有資產負債編輯狀態；完整 state replacement 前會 reset
  controller，避免 UID 或遠端資料切換後沿用舊 editing ID。
- 待購清單 controller 已完成 wish CRUD、排序、分類預算清理與編輯狀態抽取，並有
  10 項 characterization tests；`prepareFundFromWish` 仍留在 actions bridge。
- GitHub Actions workflow 已將 `actions/setup-java` 從 v4 升級到 v5；需等下次 push
  後由 GitHub runner 確認棄用警告消失。
- 準備金 controller 抽取前的 characterization tests 已加入，先鎖定 fund CRUD、
  events 保留、刪除解除交易連結、topup、wishlist prefill 與 open behavior。

## 最近驗證結果

2026-08-23 正式發布與帳戶中心本機批次：

- `37a7a35`、`e01aa1c` 已推送；GitHub Actions 公開狀態為 passing。
- Firebase Hosting 已部署至 `financial-computer`；首頁與衝突復原模組可讀，smoke 原始碼維持 404。
- Firestore Rules 與 Firebase Functions 未部署。
- 帳戶中心完整本機驗證通過：語法與全部單元測試、發布打包 71 個檔案、Firestore／Functions Emulator 10/10、UI smoke 15/15，以及 `git diff --check`。
- 月度回顧 2.0 完整本機驗證通過：同天數前期範圍、帳務來源不變、最大分類差異與 XSS 跳脫專項通過；全部語法與單元測試、發布打包 71 個檔案、Firestore／Functions Emulator 10/10、UI smoke 15/15 及 `git diff --check` 均通過。
- 財務導航與退休情境候選的完整本機驗證通過：確認四個導航數字沿用既有來源、只提供兩個非持久化問題；退休三個情境每次只改單一條件，且不改動 state 或輸入設定。全部語法與單元測試、發布打包 73 個檔案、Firestore／Functions Emulator 10/10、UI smoke 15/15 及 `git diff --check` 均通過。

2026-08-23 衝突復原中心本機批次執行完整 `npm test`：

- 語法、單元與安全邊界測試：通過。
- Hosting 允許清單打包：69 個檔案，通過。
- Firestore／Functions Emulator：10/10 通過。
- UI smoke scenarios：14/14 通過，包含衝突復原中心介面與事件接線。
- 復原專項另驗證 UID scope 隔離、10 份／30 天清理、選擇性復原、準備金母子完整性、緊急 JSON fallback，以及帳號切換時取消舊查詢。
- 初次登入的本機／雲端比較已改為遞迴排序物件欄位後再比較，避免同一份帳務資料只因 Firestore／localStorage 序列化欄位順序不同而誤跳衝突詢問；真正不同的陣列順序與帳務值仍會被辨識。
- 本批未修改或部署 Firestore Rules、Firebase Functions 或 Hosting。

2026-08-10 發布前穩定批次執行完整 `npm test`：

- 語法與單元測試：通過。
- 資產負債 controller characterization tests：10/10 通過。
- Controller lifecycle tests：2/2 通過。
- Firestore／Functions Emulator：10/10 通過。
- UI smoke scenarios：12/12 通過。
- `git diff --check`：通過。
- GitHub Actions `Finance Web Test`（Node 20）：通過。
- 正式站唯讀驗證：首頁與 `src/main.js` 回傳 200，測試專用
  `src/smoke-scenarios.js` 回傳 404。

2026-08-10 使用者人工驗收：

- 月度回顧：通過。
- 待購預填：通過。
- 資產負債：通過。
- 手機與電腦畫面：通過。

## 尚未完成

- 管理 Functions 的 summary／delete 仍只理解 v6；尚未支援 v7 recursive delete。
  在這點完成前，正式 `firebase.json` 不應加入 Functions source 或 `/api/**` rewrite。
- Tombstone 清理期限與「完整清除本機 namespace＋Firestore IndexedDB cache」尚未定義。
- 帳戶中心與信用卡管理尚待人工驗收、推送與部署。
- 月度回顧 2.0 尚待與帳戶中心一起人工驗收、推送與部署。
- 財務導航摘要與退休情境比較尚待人工驗收；目前只存在本機，不推送、不部署。
- 衝突復原歷史刻意維持裝置本機，不跨裝置同步。

## 已知的小型維護缺口

- 數字型 legacy account ID 刪除與刪除目前編輯項目的 stale state，已在發布前穩定
  批次補測並修正。
- 四條完整 state replacement 路徑已集中使用可測試的 controller lifecycle
  replacer，確保先 reset controller 再替換 store。
- Smoke runner 改用系統分配的可用埠，不再依賴固定 `4185`；一鍵測試已納入現有
  全部 15 個 UI scenarios。
- Node 以 ESM 重新解析部分 `.js` 時會顯示效能警告；不影響目前測試正確性。

## 建議下一步

### 1. 統一人工驗收

- 使用本機預覽一次驗收帳戶中心、月度回顧同期比較、財務導航及退休情境比較。
- 財務導航重點檢查資訊是否重複、手機捲動距離是否可接受；退休情境重點確認文字容易理解且不會被誤認為保證。
- 驗收前不需要修改資料模型；若未來要保存自評答案或自訂情境，才另行設計同步、遷移與刪除語意。

### 2. 驗收後發布批次

人工驗收通過後，再把目前本機提交一起推送、確認 CI、部署 Hosting 並做發布後唯讀檢查。Firestore Rules 與 Firebase Functions 都沒有因本批候選而需要部署。
