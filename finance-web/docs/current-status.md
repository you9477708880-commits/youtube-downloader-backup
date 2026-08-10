# 目前工作狀態與下一步

- 最後更新：2026-08-10
- 目前分支：`main`
- 遠端 `origin/main`：`main`（含本次發布紀錄文件）
- 正式站已知部署點：`ada30a8`

這份文件是專案目前的主要交接入口。需要理解長期產品方向時讀
`roadmap.md`；準備部署時讀 `deploy-checklist.md`；修改帳務行為前則必須讀
`accounting-rules.md`、`data-model.md` 與 `report-traceability.md`。

## 目前結論

發布前穩定批次已於 2026-08-10 完成、推送並部署。Firestore v7 rules 與 Firebase
Hosting 均已發布到 `financial-computer`，正式網址為
`https://financial-computer.web.app`。Firebase Functions 依既定決策保持不部署。

## 已完成並發布

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
- 資產負債 controller 第一批已完成，並有 10 項 characterization tests。
- `actions.js` 不再持有資產負債編輯狀態；完整 state replacement 前會 reset
  controller，避免 UID 或遠端資料切換後沿用舊 editing ID。
- 待購清單 controller 已完成 wish CRUD、排序、分類預算清理與編輯狀態抽取，並有
  10 項 characterization tests；`prepareFundFromWish` 仍留在 actions bridge。
- GitHub Actions workflow 已將 `actions/setup-java` 從 v4 升級到 v5；需等下次 push
  後由 GitHub runner 確認棄用警告消失。

## 最近驗證結果

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

## 已知的小型維護缺口

- 數字型 legacy account ID 刪除與刪除目前編輯項目的 stale state，已在發布前穩定
  批次補測並修正。
- 四條完整 state replacement 路徑已集中使用可測試的 controller lifecycle
  replacer，確保先 reset controller 再替換 store。
- Smoke runner 改用系統分配的可用埠，不再依賴固定 `4185`；一鍵測試已納入現有
  全部 12 個 UI scenarios。
- Node 以 ESM 重新解析部分 `.js` 時會顯示效能警告；不影響目前測試正確性。

## 建議下一步

### 1. 準備金 controller

- 先鎖定 fund CRUD、topup、表單狀態與 wishlist prefill 的既有行為。
- 編輯必須保留既有 events；刪除 fund 與解除交易 link 必須維持同一次 state update。
- monthly contribution 仍是預算規劃，不得改成帳戶轉帳。

### 2. 後續順序

在 sinking-fund controller 穩定後，依序考慮：

1. 交易 controller。
2. 匯入 controller。

交易與匯入風險最高，不應和部署、同步協定或帳務公式修改放在同一批。
