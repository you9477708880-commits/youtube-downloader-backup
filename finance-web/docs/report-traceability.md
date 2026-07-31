# 報表追溯設計 / Report Traceability

這份文件定義「報表數字要能追到來源明細」的維護標準。目標是讓使用者看到總數時，可以理解這個數字從哪裡來，而不是只能相信黑盒結果。

This document defines the traceability standard for report numbers. Users should be able to understand where each total comes from instead of trusting a black box.

## 1. 核心原則 / Core Principles

### 中文

- 總數應該可以追溯到交易明細、準備金事件或明確標示為手動項目。
- 不同報表可以用不同視角解讀同一筆交易，但不應複製交易資料。
- 若某個項目不是由交易推導，應清楚標示它的來源。
- 退休頁是推估，不是交易或帳務報表。

### English

- Totals should be traceable to transaction details, fund events, or clearly marked manual items.
- Different reports may interpret the same transaction from different perspectives, but should not duplicate transaction data.
- If an item is not derived from transactions, its source should be clearly labeled.
- The retirement page is a projection, not a transaction or accounting report.

## 2. 目前追溯狀態 / Current Traceability

| 報表 / Report | 數字 / Number | 追溯來源 / Source | 狀態 / Status |
| --- | --- | --- | --- |
| 總覽 / Overview | 期間收入 | `txs` 中的 `income.amount` | 可由交易推導 |
| 總覽 / Overview | 期間支出 | `expense.amount` + `advance.ownAmount` | 可由交易推導 |
| 總覽 / Overview | 結餘 | 期間收入 - 期間支出 | 可由交易推導 |
| 記帳 / Ledger | 交易列表 | `txs` | 主要交易明細 |
| 預算 / Budget | 本月可支配預算 | `settings.budgetCap` | 設定值 |
| 預算 / Budget | 本月生活支出 | `txs` 中仍由當月負擔的個人支出 | 可由交易與準備覆蓋規則推導 |
| 預算 / Budget | 本月大額準備 | `sinkingFunds.monthlyContribution` 依期間推算 | 預算規劃，不是帳戶轉帳 |
| 預算 / Budget | 本月手動補入 | `sinkingFunds.events` 中的 `topup` | 準備金事件 |
| 預算 / Budget | 可自由運用 | 預算公式推導 | 可追溯到上述來源 |
| 大額準備 / Funds | 目前累積 | 規劃提撥 + `topup` - `spend` | 準備規劃與事件 |
| 大額準備 / Funds | 動用紀錄 | `sinkingFunds.events` 中的 `spend` | 可連到 `linkedTxId` |
| 資產負債 / Balance Sheet | 帳戶餘額 | `accounts.initialBalance` + `txs` | 已支援帳戶明細 |
| 資產負債 / Balance Sheet | 代墊應收款 | `advance.receivableAmount` - `advance_repayment.amount` | 可由交易推導 |
| 資產負債 / Balance Sheet | 手動資產 | `bsI` | 手動項目 |
| 資產負債 / Balance Sheet | 手動負債 | `bsI` | 手動項目 |
| 現金流 / Cash Flow | 營運收入 | 指定收入分類 | 可由交易推導 |
| 現金流 / Cash Flow | 營運支出 | `expense.amount` + `advance.ownAmount` | 可由交易推導 |
| 退休 / Retirement | 退休推估 | 使用者輸入 + 資產資料 + 模型參數 | 推估，不是帳務事實 |
| 退休 / Retirement | 4% 法則參考 | 每月提領 × 300 | 經驗法則提示 |

## 3. 預算頁追溯 / Budget Traceability

### 中文

預算頁目前主公式：

```text
可自由運用 =
  本月可支配預算
  - 本月生活支出
  - 本月大額準備
  - 本月手動補入
```

來源：

- `本月可支配預算` 來自 `settings.budgetCap`。
- `本月生活支出` 來自 `txs`，但要排除已被大額準備覆蓋的部分。
- `本月大額準備` 來自 `sinkingFunds` 的每月規劃提撥。
- `本月手動補入` 來自 `sinkingFunds.events` 的 `topup`。

### English

Current budget formula:

```text
freeToUse =
  monthly budget cap
  - living expenses
  - planned fund contributions
  - manual fund top-ups
```

Sources:

- `monthly budget cap` comes from `settings.budgetCap`.
- `living expenses` come from `txs`, excluding amounts covered by large-expense funds.
- `planned fund contributions` come from planned monthly contributions in `sinkingFunds`.
- `manual fund top-ups` come from `topup` events in `sinkingFunds.events`.

## 4. 大額準備追溯 / Fund Traceability

### 中文

大額準備卡片應能追溯：

- 目標金額：`targetAmount`。
- 每月規劃提撥：`monthlyContribution`。
- 本期規劃提撥：依 `startMonth`、`targetMonth` 與目前期間推算。
- 目前累積：規劃提撥累積 + `topup` - `spend`。
- 補入紀錄：`events.type === "topup"`。
- 動用紀錄：`events.type === "spend"`。
- 若 `spend` 有 `linkedTxId`，應可反查對應交易。

### English

A fund card should trace:

- Target amount: `targetAmount`.
- Monthly planned contribution: `monthlyContribution`.
- Current-period planned contribution: derived from `startMonth`, `targetMonth`, and the selected period.
- Current saved amount: accumulated planned contributions + `topup` - `spend`.
- Top-up records: `events.type === "topup"`.
- Spending records: `events.type === "spend"`.
- If a `spend` event has `linkedTxId`, it should be traceable back to the linked transaction.

## 5. 準備金覆蓋支出的追溯 / Traceability For Fund-Covered Expenses

### 中文

同一筆支出在不同頁面可能有不同視角：

- 記帳頁：顯示原始交易金額，因為帳戶真的支出了這筆錢。
- 總覽 / 現金流：顯示原始支出金額。
- 預算頁：只計算仍需由本月負擔的部分。
- 大額準備：顯示準備被動用多少。

例子：

```text
手機支出 20,000
手機準備支付 12,000
本月生活支出承擔 8,000
```

追溯結果：

- `txs` 仍有一筆 `expense.amount = 20,000`。
- `sinkingFunds.events` 有一筆 `spend.amount = 12,000`。
- 預算頁生活支出只認列 `8,000`。

### English

The same expense may have different meanings in different reports:

- Ledger: shows the original transaction amount because the account really paid it.
- Overview / cash flow: shows the original expense amount.
- Budget page: counts only the portion still paid by the current month.
- Fund card: shows how much fund balance was used.

Example:

```text
Phone expense: 20,000
Phone fund pays: 12,000
Current-month living expense pays: 8,000
```

Traceability result:

- `txs` still has `expense.amount = 20,000`.
- `sinkingFunds.events` has `spend.amount = 12,000`.
- Budget living expense recognizes only `8,000`.

## 6. 刪除與未來編輯追溯 / Delete And Future Edit Traceability

### 中文

刪除交易時：

- 若交易有 `linkedFundId` 或準備事件有 `linkedTxId`，相關 `spend` / `topup` events 應一起刪除。
- 刪除後，大額準備明細不應留下找不到交易的連動事件。

未來交易編輯時：

- 如果修改已指定準備的交易金額，應先解除原本指定。
- 原本連動的準備事件應先移除。
- 使用者重新決定是否指定準備、使用多少準備、差額從哪裡來。
- 不自動猜測準備事件要怎麼改。

### English

When deleting a transaction:

- If the transaction has `linkedFundId` or fund events have `linkedTxId`, related `spend` / `topup` events should be deleted as well.
- After deletion, fund details should not keep linked events pointing to missing transactions.

For future transaction editing:

- If an amount changes on a transaction linked to a fund, unlink it first.
- Remove previous linked fund events first.
- Let the user decide again whether to use a fund, how much fund balance to use, and where any difference should come from.
- Do not automatically guess how fund events should be changed.

## 7. 本機與雲端追溯 / Local And Cloud Traceability

### 中文

目前限制：

- 本機資料不是依 Google `uid` 分流。
- 雲端資料依 Firebase `uid` 儲存。
- 同一瀏覽器切換多個 Google 帳號時，本機資料可能是最近一次載入或同步的版本。

追溯規則：

- 短期先清楚標示目前是本機模式、雲端同步或離線狀態。
- 同一登入帳號的本機雲端寫入會序列化，快速連續修改只在目前寫入後補上最新 state。
- 寫入期間收到的遠端快照會暫存，並與本機送出的 state 比對以辨識 server echo；這只避免同一用戶端亂序，不代表多裝置資料會自動合併。
- 新 `uid` 的第一個遠端 snapshot 尚未解析前，不把共享本機 state 寫入該帳號；重新上線也不會無條件覆蓋雲端。
- 不把本機 / 雲端合併做成黑盒。
- 未來若合併資料，應讓使用者確認資料來源與衝突處理。

### English

Current limitation:

- Local data is not separated by Google `uid`.
- Cloud data is stored by Firebase `uid`.
- Switching multiple Google accounts in the same browser may show the most recently loaded or synced data.

Traceability rules:

- Short term: clearly label local mode, cloud sync, or offline state.
- Cloud writes for the same signed-in user are serialized, and rapid edits append only the latest state after the active write.
- Remote snapshots received during a write are retained and compared with submitted local states to identify server echoes. This prevents same-client reordering but does not automatically merge data from multiple devices.
- Shared local state is not written to a new `uid` before its first remote snapshot is resolved, and reconnecting does not unconditionally overwrite cloud data.
- Do not make local/cloud merging a black box.
- If data merging is added later, the user should confirm data sources and conflict handling.

## 8. 退休頁追溯 / Retirement Traceability

### 中文

退休頁不是帳務報表，而是推估工具。

來源：

- 目前資產可來自資產負債表連動，或使用者手動輸入。
- 報酬率、通膨、退休年齡、壽命、提領金額由使用者輸入。
- 4% 法則參考來自 `每月提領 × 300`。

規則：

- 推估結果不應寫回 `txs`。
- 推估結果不應寫回 `accounts` 或 `bsI`。
- 4% 法則不是主要警告邏輯，只是經驗法則提示。

### English

The retirement page is not an accounting report. It is a projection tool.

Sources:

- Current assets may come from linked balance-sheet data or manual user input.
- Return rate, inflation, retirement age, lifespan, and withdrawal amount come from user input.
- The 4% rule reference comes from `monthly withdrawal × 300`.

Rules:

- Projection results should not write back to `txs`.
- Projection results should not write back to `accounts` or `bsI`.
- The 4% rule is not the main warning logic. It is only a rule-of-thumb reference.

## 9. 維護檢查點 / Maintenance Checklist

新增或修改報表時，請確認：

- 總數是否能說明來源。
- 點開明細後，金額加總是否能對回總數。
- 大額準備覆蓋支出時，預算頁是否避免重複計算。
- 手動補入是否有反映在可自由運用。
- 代墊與轉帳是否用正確視角顯示。
- 手動資產 / 負債是否清楚標示為手動項目。
- 退休頁是否仍清楚標示為推估，不是帳務事實。

When adding or changing reports, verify:

- The total can explain its source.
- Expanded details add back to the total.
- Fund-covered expenses are not double-counted in the budget page.
- Manual top-ups are reflected in free-to-use budget.
- Advances and transfers use the correct report perspective.
- Manual assets / liabilities are clearly marked as manual items.
- The retirement page remains clearly marked as projection, not accounting fact.

