# 目前工作狀態與下一步

- 最後更新：2026-08-01
- 目前分支：`main`
- 遠端 `origin/main`：`6a994bd 整理核心頁面桌機工作區`
- 正式站已知部署點：`6a994bd`

這份文件是專案目前的主要交接入口。需要理解長期產品方向時讀
`roadmap.md`；準備部署時讀 `deploy-checklist.md`；修改帳務行為前則必須讀
`accounting-rules.md`、`data-model.md` 與 `report-traceability.md`。

## 目前結論

`origin/main` 之後已形成一個完整但尚未發布的批次，包含產品功能、資料安全、同步
架構、測試基礎、第一個 controller 拆分與發布前穩定修正。

目前程式已通過完整 `npm test`，但尚未 push，也尚未部署新版 Hosting 或 Firestore
rules。因此「本機已完成」不等於「正式網站已生效」。

## 已在本機完成

### 產品功能

- 月度回顧原型與來源明細。
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

- 根目錄 `npm test` 已整合語法、單元、Firestore/Functions Emulator 與 12 個 UI
  smoke scenarios。
- GitHub Actions 已使用 Node 20、Temurin 21 與 `demo-finance-web`。
- 資產負債 controller 第一批已完成，並有 8 項 characterization tests。
- `actions.js` 不再持有資產負債編輯狀態；完整 state replacement 前會 reset
  controller，避免 UID 或遠端資料切換後沿用舊 editing ID。

## 最近驗證結果

2026-08-01 發布前穩定批次執行完整 `npm test`：

- 語法與單元測試：通過。
- 資產負債 controller characterization tests：10/10 通過。
- Controller lifecycle tests：2/2 通過。
- Firestore／Functions Emulator：10/10 通過。
- UI smoke scenarios：12/12 通過。
- `git diff --check`：通過。

## 尚未完成或尚未發布

- 本機發布批次尚未 push 到 `origin/main`。
- 新版 Hosting allowlist、安全入口與產品功能尚未部署。
- Firestore v7 rules 與同步架構尚未部署到正式環境。
- 管理 Functions 的 summary／delete 仍只理解 v6；尚未支援 v7 recursive delete。
  在這點完成前，正式 `firebase.json` 不應加入 Functions source 或 `/api/**` rewrite。
- Tombstone 清理期限與「完整清除本機 namespace＋Firestore IndexedDB cache」尚未定義。

## 已知的小型維護缺口

- 數字型 legacy account ID 刪除與刪除目前編輯項目的 stale state，已在發布前穩定
  批次補測並修正。
- 四條完整 state replacement 路徑已集中使用可測試的 controller lifecycle
  replacer，確保先 reset controller 再替換 store。
- Smoke runner 改用系統分配的可用埠，不再依賴固定 `4185`；一鍵測試已納入現有
  全部 12 個 UI scenarios。
- Node 以 ESM 重新解析部分 `.js` 時會顯示效能警告；不影響目前測試正確性。

## 建議下一步

### 1. 完成發布前穩定批次

自動化部分已完成：

- 已補數字型 account ID、刪除正在編輯項目及 state replacement reset 測試。
- 已修正前兩個 balance-sheet 邊界。
- 人工驗收步驟見 `docs/manual-acceptance-checklist.md`。

完整 `npm test` 與 `origin/main..main` 差異檢查通過後，只剩使用者人工驗收。人工
驗收通過後即可建立發布安全點，再分別決定是否 push、部署 Firestore rules 與部署
Hosting。Functions 仍保持不部署。

### 2. 發布安全點後再拆待購清單 controller

- 先鎖定 wish CRUD、排序、刪除不存在 ID 與越界排序的既有行為。
- `prepareFundFromWish` 暫時保留為 bootstrap／actions bridge。
- 不讓 wishlist controller 直接操作 fund controller 或 fund DOM。

### 3. 後續順序

在 wishlist controller 穩定後，依序考慮：

1. 準備金 controller。
2. 交易 controller。
3. 匯入 controller。

交易與匯入風險最高，不應和部署、同步協定或帳務公式修改放在同一批。
