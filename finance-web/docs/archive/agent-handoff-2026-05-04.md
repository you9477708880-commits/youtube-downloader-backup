# Agent Handoff

> 歷史文件 / Historical document  
> 這份文件保留 2026-05-04 當時的交接脈絡，後續維護請優先參考：
> `docs/accounting-rules.md`、`docs/data-model.md`、`docs/report-traceability.md`、`docs/roadmap.md`。
>
> This file preserves the handoff context from 2026-05-04. For current maintenance, prefer:
> `docs/accounting-rules.md`, `docs/data-model.md`, `docs/report-traceability.md`, and `docs/roadmap.md`.

最後更新：2026-05-04  
目前工作分支：`新功能實驗`

## 1. 專案定位

這個專案是原生 HTML/CSS/JS 的個人理財工具，正式部署來源在：

```text
D:\桌面\音樂下載\finance-web
```

正式網址：

```text
https://financial-computer.web.app
```

Git repo 根目錄不是 `finance-web`，而是：

```text
D:\桌面\音樂下載
```

目前這一輪主要在 `新功能實驗` 分支上做較大改動，重點是把「大筆支出事後分攤」逐步轉成「大額支出準備 / 基金制」。

## 2. 目前主軸功能

### 已穩定存在的功能

- 交易：收入、支出、轉帳、代墊、代墊收款
- 總覽：期間收入 / 支出 / 結餘 / 最近交易
- 預算分配：本月生活支出、大額支出準備、可自由運用
- 大額支出準備：
  - 可新增準備項目
  - 可設定每月提撥、目標金額、分類、開始月份、預計完成月份
  - 可手動補入
  - 支出可指定對應準備
  - 明細可展開看 `topup` / `spend` 事件
- 資產負債表：
  - 帳戶 / 其他資產 / 負債
  - 可設 `🛡️ 緊急備用金`
- 現金流
- 退休計算機
- Firebase Google 登入 / 雲端同步
- 本地 JSON 匯出 / 匯入

### 這一輪實驗分支的核心改動

- 預算頁已不再以「實際支出 / 分攤後支出」雙視角為主角
- 改成：
  - `本月可支配預算`
  - `本月生活支出`
  - `本月大額準備`
  - `可自由運用`
- `本月剩餘可分配` 卡片已移除
- 大額支出準備已取代原本「沉澱基金」作為 UI 名稱

## 3. 重要規則

### 3.1 大額支出準備規則

資料在 `state.sinkingFunds`。

每筆準備項目大致長這樣：

```js
{
  id,
  name,
  category,
  targetAmount,
  monthlyContribution,
  startMonth,
  targetMonth,
  carryoverEnabled,
  note,
  events: [
    { id, type: "topup" | "spend", amount, date, note, linkedTxId? }
  ]
}
```

### 3.2 支出指定大額準備

支出交易可帶 `linkedFundId`。

當支出指定對應準備時：

- 如果準備金足夠：
  - 這筆支出會記一筆 `spend` 事件
  - 本月生活支出不會再重複扣這筆已被準備金覆蓋的部分
- 如果準備金不足，但本月 `可自由運用` 足夠補差額：
  - 會先跳 `confirm`
  - 若同意，先補一筆 `topup` 事件，再寫入 `spend` 事件
- 如果準備金不足且本月 `可自由運用` 也不足：
  - 直接擋下，不建立交易

### 3.3 手動補入準備

從準備卡片點 `手動補入`：

- 只能補到本月 `可自由運用` 的上限
- 超過上限會被擋下
- 補入後會影響當月 `可自由運用`

### 3.4 本月可自由運用

目前公式在 `src/domain/budget.js`：

```text
可自由運用 = 本月可支配預算 - 本月生活支出 - 本月大額準備 - 本月手動補入
```

其中：

- `本月生活支出`：扣除已被準備金覆蓋的部分後，實際仍由當月支出承擔的金額
- `本月大額準備`：本期規劃提撥總額
- `本月手動補入`：本期手動補進準備項目的額外金額

## 4. 重要實作位置

### App / wiring

- `src/app/bootstrap.js`
  - DOM 收集
  - 事件綁定
  - Firebase auth 狀態顯示
  - 金額輸入欄位的正規化
- `src/app/actions.js`
  - 新增交易
  - 手動補入準備
  - 開啟對應準備
  - 其他主要動作

### Domain

- `src/domain/budget.js`
  - 預算核心計算
- `src/domain/sinking-funds.js`
  - 準備項目結餘、事件、可用金額
- `src/domain/transactions.js`
  - 交易建立與金額規則
- `src/domain/retirement.js`
  - 退休試算

### Views

- `src/views/wishlist-view.js`
  - 預算分配頁與大額支出準備卡片
- `src/views/ledger-view.js`
  - 交易列表，包含 `查看對應準備`
- `src/views/balance-sheet-view.js`
  - 資產負債與 `🛡️` 緊急備用金
- `src/views/retirement-view.js`
  - 退休建議文案、4% 法則參考、資產提早用完警告

### Storage / sync

- `src/services/storage-local.js`
  - 本機 localStorage 讀寫
- `src/services/storage-cloud.js`
  - Firebase Auth / Firestore 同步
- `src/services/import-export.js`
  - JSON 匯入匯出

## 5. 本機資料與 Google 帳號切換

這是目前很重要的產品限制。

### 現況

本機資料目前是共用同一組 `localStorage` key，不是依 `uid` 分流。

因此：

- 同一台裝置 / 同一個瀏覽器
- 若交替登入不同 Google 帳號
- 本機留下來的資料通常會是最近一次使用 / 最近一次同步 / 最近一次登入載入的內容

### 已做的補強

- `總覽 > 資料備份與還原` 已補說明文字
- 右上角 `本機模式 / 使用者` 的 tooltip 已補說明

### 尚未做

- 尚未把 localStorage 改成依 `uid` 分流

這是後續可以做，但目前尚未實作。

## 6. 退休頁目前的邏輯

### 目前不是只靠 4% 法則

退休警告目前分兩種：

1. `目標太低`
   - 依你設定的報酬率、通膨、退休年齡、壽命、每月提領，推算最低所需目標資產
2. `可能提早用完`
   - 真的跑退休後年度 / 月度提領模擬，看資產是否會在預期壽命前歸零

### 額外新增的 4% 法則提示

退休頁現在另外顯示：

```text
每月提領 × 300 ≈ 4% 法則對應目標資產
```

例如每月提領 `NT$ 40,000`，4% 法則參考約為 `NT$ 12,000,000`。

注意：這只是經驗法則提示，不是主要警告邏輯。

## 7. 已知待整理 / 技術債

### 高優先

- `docs/data-model.md` 尚未完全同步到最新「大額支出準備 / 事件制」狀態
- 本機資料仍未依 `uid` 分流
- 交易編輯能力仍不足，現在偏新增 / 刪除
- 大額準備與支出關聯雖已存在，但還沒做到「編輯交易時同步修正 event」

### 中優先

- 桌機版版面雖已放寬，但仍偏手機版拉寬，不算真正桌機布局
- 退休頁文案可以再更精準區分：
  - 經驗法則參考
  - 自訂參數模擬

### 低優先

- 舊的 spread / budgetMode 兼容邏輯還留在部分 domain code 中，UI 已不再主推

## 8. 常用命令

### 語法檢查

```powershell
Get-ChildItem -Recurse -Filter *.js .\src | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

### 核心測試

```powershell
node .\tests\domain.test.mjs
```

### Headless smoke test

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless --port=4184
```

### 本機開頁面

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web'
```

打開：

```text
http://localhost:4173/index.html
```

### 部署

```powershell
firebase deploy --only hosting
```

## 9. 下一個對話最值得先知道的事

如果下一個對話要快速上手，先記這幾點：

1. 目前分支是 `新功能實驗`
2. 預算頁主邏輯已轉向「大額支出準備」，不是舊的事後分攤
3. 支出可指定準備，並記 `spend` event
4. 補差額與手動補入都會影響 `可自由運用`
5. 本機資料目前不是依 Google `uid` 分流
6. 退休頁警告主邏輯不是 4% 法則，但有額外顯示 4% 法則參考

## 10. 建議下一步

如果下一個對話要繼續做事，建議優先順序：

1. 同步更新 `docs/data-model.md`
2. 補交易編輯能力，並同步修正 fund events
3. 評估是否做 localStorage 依 `uid` 分流
4. 桌機版頁面改為真正雙欄 / 寬版布局
