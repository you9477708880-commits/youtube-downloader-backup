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
| 月度回顧 2.0 / Period Comparison | 收入、生活支出、準備活動 | 目前範圍與相同天數前一期間的既有 `txs`、預算與準備資料 | 只讀推導，不持久化比較結果 |
| 月度回顧 2.0 / Category Change | 最大生活支出分類變化 | 兩期預算頁生活支出來源依主分類加總 | 排除已由準備覆蓋的部分 |
| 記帳 / Ledger | 交易列表 | `txs` | 主要交易明細 |
| 預算 / Budget | 本月可支配預算 | `settings.budgetCap` | 設定值 |
| 預算 / Budget | 本月生活支出 | `txs` 中仍由當月負擔的個人支出 | 可由交易與準備覆蓋規則推導 |
| 預算 / Budget | 本月大額準備 | `sinkingFunds.monthlyContribution` 依期間推算 | 預算規劃，不是帳戶轉帳 |
| 預算 / Budget | 本月手動補入 | `sinkingFunds.events` 中的 `topup` | 準備金事件 |
| 預算 / Budget | 可自由運用 | 預算公式推導 | 可追溯到上述來源 |
| 大額準備 / Funds | 目前累積 | 規劃提撥 + `topup` - `spend` | 準備規劃與事件 |
| 大額準備 / Funds | 動用紀錄 | `sinkingFunds.events` 中的 `spend` | 可連到 `linkedTxId` |
| 資產負債 / Balance Sheet | 帳戶餘額 | `accounts.initialBalance` + `txs` | 已支援帳戶明細 |
| 帳戶中心 / Account Center | 本月流入／流出 | 當月 `txs` 對指定帳戶的正負變動，排除 `balance_adjustment` | 可由交易推導 |
| 帳戶中心 / Credit Card | 欠款／可用額度 | 帳戶餘額與 `accounts.creditLimit` | 不另存總額 |
| 帳戶中心 / Credit Card | 本期刷卡／繳款 | 結帳週期內指定卡片的支出與轉入款 | 可由交易推導 |
| 帳戶中心 / Reconciliation | 對帳調整 | `balance_adjustment` | 只影響帳戶餘額，不進報表 |
| 資產負債 / Balance Sheet | 代墊應收款 | `advance.receivableAmount` - `advance_repayment.amount` | 可由交易推導 |
| 資產負債 / Balance Sheet | 手動資產 | `bsI` | 手動項目 |
| 資產負債 / Balance Sheet | 手動負債 | `bsI` | 手動項目 |
| 現金流 / Cash Flow | 營運收入 | 指定收入分類 | 可由交易推導 |
| 現金流 / Cash Flow | 營運支出 | `expense.amount` + `advance.ownAmount` | 可由交易推導 |
| 退休 / Retirement | 退休推估 | 使用者輸入 + 資產資料 + 模型參數 | 推估，不是帳務事實 |
| 退休 / Retirement | 4% 法則參考 | 每月提領 × 300 | 經驗法則提示 |
| 退休 / Guardrail | 明年提領額 | 目前組合、上年度提領、起始提領率、通膨與上年度報酬 | 非持久化年度規則試算 |
| 退休 / Withdrawal Sources | 提領來源順序 | 使用者輸入的目前／目標配置、資產報酬、既有緊急預備金 | 非持久化來源規劃，不建立交易 |

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

追溯規則：

- 驗收版所有報表只讀取 `fin_v7:acceptance:*` 的測試 state；它不連接 Firebase、不讀正式 localStorage 或正式衝突復原 IndexedDB，因此驗收結果不能被誤認為正式帳務紀錄。
- 本機 snapshot 已依未綁定 `local` 與 Firebase `uid` 分區；帳號切換會替換整個 store，不沿用上一帳號畫面。
- Firestore 以 record-level 文件保存，revision 是衝突依據；`updatedAt` 只用於稽核和顯示。
- 不同 record 可自動共存；相同 record 的同版修改會停下來要求整筆選擇，不做欄位級黑盒合併。
- 刪除會寫 tombstone，不以實體 delete 讓離線舊裝置重新復活資料。
- 待送標記依 UID 保存；帳號切換會停用舊 listener 和 queue。
- 遷移必須先完成 records 數量與完整 state round-trip 驗證，`sync/finance_v7` 才能標記為 `active`。
- JSON 匯出仍是完整、可理解的 state，不包含 revision、tombstone 或同步內部資料。
- 衝突覆蓋前的落敗版本會存入裝置內 IndexedDB，依 `local`／Firebase UID 隔離，最多 10 份且最長 30 天；它不是新的帳務來源，也不會跨裝置同步。
- 復原中心只顯示有差異的 record 與欄位摘要；使用者選擇復原後，資料會沿正常 `commitState()` 形成新 revision，因此後續報表仍由正式 state 重算，不直接讀取復原歷史。
- JSON 只在使用者手動匯出復原項目，或 IndexedDB 緊急保存失敗時下載，不再每次衝突自動產生檔案。

### English

Traceability rules:

- Acceptance reports read only the isolated `fin_v7:acceptance:*` test state. They do not connect to Firebase or production localStorage/IndexedDB, so acceptance output cannot become a production accounting record.
- Local snapshots are separated into the unbound local namespace and Firebase UID namespaces.
- Firestore uses record-level documents; revision is authoritative for conflicts, while `updatedAt` is audit metadata.
- Different records can coexist. Same-record concurrent edits require a whole-record choice and never use field-level guessing.
- Deletions create tombstones so stale offline devices cannot silently resurrect removed data.
- Pending metadata, listeners, and queues are isolated by UID.
- Migration activates v7 only after record-count and full-state round-trip verification.
- JSON export remains a user-readable complete state without sync internals.
- Losing conflict versions are kept in device-local, scope-isolated IndexedDB for at most 10 entries and 30 days. Recovery creates a normal new revision; reports never read recovery history directly.

## 8. 退休頁追溯 / Retirement Traceability

### 中文

退休頁不是帳務報表，而是推估工具。

來源：

- 目前資產可來自資產負債表連動，或使用者手動輸入。
- 報酬率、通膨、退休年齡、壽命、提領金額由使用者輸入。
- 4% 法則參考來自 `每月提領 × 300`。
- 護欄的投資組合市值、起始提領率、上年度提領／報酬、目前與目標配置由使用者在折疊區輸入，不保存。
- 緊急預備金金額沿用既有 `accounts`／`bsI` 的 `isEm` 標記推導；是否納入本次來源試算由使用者明確勾選。

規則：

- 推估結果不應寫回 `txs`。
- 推估結果不應寫回 `accounts` 或 `bsI`。
- 4% 法則不是主要警告邏輯，只是經驗法則提示。
- 護欄輸出應列出目前、上下界提領率、明年提領額與觸發規則。
- 來源列出的金額合計應等於明年提領額，或明確顯示尚未支應的差額。
- 股票負報酬時，只有在現金、債券與已授權的緊急預備金都不足後，來源試算才列出賣出股票。
- 來源試算不修改 `txs`、`accounts`、`bsI` 或資產配置。

### English

The retirement page is not an accounting report. It is a projection tool.

Sources:

- Current assets may come from linked balance-sheet data or manual user input.
- Return rate, inflation, retirement age, lifespan, and withdrawal amount come from user input.
- The 4% rule reference comes from `monthly withdrawal × 300`.
- Guardrail portfolio value, initial rate, prior withdrawal/returns, and current/target allocations are non-persisted user inputs.
- Emergency reserve comes from existing `isEm`-marked accounts/items and enters the source plan only after explicit opt-in.

Rules:

- Projection results should not write back to `txs`.
- Projection results should not write back to `accounts` or `bsI`.
- The 4% rule is not the main warning logic. It is only a rule-of-thumb reference.
- Guardrail output traces the current/lower/upper rates, next withdrawal, and triggered rule.
- Withdrawal-source amounts must sum to the next withdrawal or expose an unfunded remainder.
- After a negative equity year, stock appears only after cash, bonds, and any explicitly authorized emergency reserve are insufficient.
- The source plan never changes transactions, accounts, manual items, or actual allocation.

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

