# 會計規則與交易影響 / Accounting Rules And Transaction Effects

這份文件定義目前理財計算機採用的核心會計規則。未來新增功能或修 bug 時，請先確認是否符合這些規則。

This document defines the app's core accounting rules. Future features and fixes should follow these rules.

## 1. 設計原則 / Design Principles

### 中文

- 交易明細 `txs` 是主要帳務事實來源。
- 報表數字應由交易、帳戶、設定與準備事件推導，不要手動儲存第二份總額。
- 轉帳不是收入，也不是支出。
- 代墊不是完整支出，只有自己負擔的部分才算個人支出。
- 代墊收款不是收入，而是應收款回收。
- 大額準備的每月提撥是預算規劃，不是帳戶轉帳。
- 大額準備的 `topup` / `spend` 是準備金事件，不應直接當成一般收入或一般支出。
- 退休頁是推估工具，不是帳務事實來源。

### English

- `txs` is the main accounting source of truth.
- Report numbers should be derived from transactions, accounts, settings, and fund events. Do not store duplicate totals manually.
- Transfers are neither income nor expense.
- Advances are not full personal expenses; only `ownAmount` counts as personal expense.
- Advance repayments are not income; they are receivable recovery.
- Planned monthly fund contribution is budget planning, not an account transfer.
- Fund `topup` / `spend` events are fund events and should not be treated as normal income or normal expenses.
- The retirement page is a projection tool, not an accounting source of truth.

## 2. 交易類型 / Transaction Types

### income 收入

影響：

- 指定帳戶餘額增加 `amount`。
- 期間收入增加 `amount`。
- 不增加預算支出。
- 不直接建立資產負債表手動項目。

Effects:

- Increases the specified account by `amount`.
- Increases period income by `amount`.
- Does not increase budget expense.
- Does not directly create a manual balance-sheet item.

### expense 支出

影響：

- 指定帳戶餘額減少 `amount`。
- 期間支出增加 `amount`。
- 現金流支出增加 `amount`。
- 預算頁生活支出通常增加 `amount`。
- 若支出指定大額準備，預算頁只計算未被準備覆蓋的部分。

Effects:

- Decreases the specified account by `amount`.
- Increases period expense by `amount`.
- Increases cash-flow expense by `amount`.
- Usually increases budget living expense by `amount`.
- If linked to a large-expense fund, only the uncovered portion counts as budget living expense.

### transfer 轉帳

轉帳只代表兩個帳戶之間移動資金。

A transfer only moves money between accounts.

影響：

- 來源帳戶餘額減少 `amount`。
- 目標帳戶餘額增加 `amount`。
- 不增加收入。
- 不增加支出。
- 不增加預算支出。

Effects:

- Decreases source account by `amount`.
- Increases target account by `amount`.
- Does not increase income.
- Does not increase expense.
- Does not increase budget expense.

### balance_adjustment 對帳調整

對帳調整只用來讓網站計算餘額與金融機構顯示的實際餘額一致。它必須由使用者在帳戶中心輸入實際餘額並確認後建立。

影響：

- `direction: "increase"` 增加指定帳戶餘額；`direction: "decrease"` 減少指定帳戶餘額。
- 不增加收入、支出、現金流或預算使用額。
- 保留在 `txs` 中供追溯；刪除該筆調整即可撤銷效果。
- 信用卡欠款以負餘額表示；信用卡繳款仍應使用資產帳戶轉入信用卡的 `transfer`。

Account reconciliation adjustments only align the calculated balance with the financial institution's actual balance. They affect the selected account balance but are excluded from income, expenses, cash flow, and budgets. They remain traceable in `txs` and can be reversed by deleting the adjustment.

### advance 代墊

代墊代表自己先支付全額，但其中一部分是別人之後要還的應收款。

An advance means the user paid the full amount first, but part of it is receivable from someone else.

影響：

- 付款帳戶餘額減少 `amount`。
- 期間支出只增加 `ownAmount`。
- 預算支出只增加 `ownAmount`。
- 現金流支出只增加 `ownAmount`。
- 資產負債表增加未收回的 `receivableAmount - repayments`。
- 不增加收入。

Effects:

- Decreases payment account by `amount`.
- Increases period expense only by `ownAmount`.
- Increases budget expense only by `ownAmount`.
- Increases cash-flow expense only by `ownAmount`.
- Adds outstanding `receivableAmount - repayments` to the balance sheet.
- Does not increase income.

### advance_repayment 代墊收款

代墊收款代表對方把代墊款還給你。

Advance repayment means someone repaid an advance.

影響：

- 收款帳戶餘額增加 `amount`。
- 對應代墊的未收金額減少 `amount`。
- 不增加收入。
- 不增加支出。
- 不增加預算收入或支出。

Effects:

- Increases receiving account by `amount`.
- Reduces the outstanding amount of the linked advance.
- Does not increase income.
- Does not increase expense.
- Does not increase budget income or expense.

## 3. 帳戶餘額公式 / Account Balance Formula

```text
accountBalance =
  initialBalance
  + income.amount
  - expense.amount
  - advance.amount
  + advance_repayment.amount
  + transferIn.amount
  - transferOut.amount
  + balance_adjustment.increase
  - balance_adjustment.decrease
```

注意：大額準備的每月提撥不是帳戶轉帳，不應直接影響帳戶餘額。

Note: planned monthly fund contributions are not account transfers and should not directly affect account balances.

### CSV 匯入建立帳戶 / Account Creation During CSV Import

- AndroMoney 帳戶名稱會先以正規化後的完整名稱比對既有帳戶，不做模糊猜測。
- 找不到相同名稱時，匯入確認畫面預設建立起始餘額為 `0` 的資產帳戶；使用者可改成負債帳戶，例如信用卡。
- 新帳戶與新增或更新的交易必須在同一次 `commitState()` 中保存，避免交易引用尚未建立的帳戶。
- 重新匯入相同 CSV 時，預設使用「只修正帳戶」：只修改 `acc` / `fromAcc` / `toAcc`，並保留本機交易 ID、金額、日期、備註、分類與大額準備連結。
- CSV 與既有交易的類型不同時，不自動修正該筆帳戶；完整覆蓋仍必須由使用者明確選擇「完整更新」。
- 信用卡消費仍是支出；信用卡繳款應記成銀行轉入信用卡的轉帳，不可再算一次支出。

- AndroMoney account names are matched against normalized full account names; fuzzy guessing is not used.
- If no exact normalized match exists, the confirmation UI defaults to creating an asset account with an initial balance of `0`; the user may change it to a liability account such as a credit card.
- New accounts and added or updated transactions must be persisted in the same `commitState()` call so transactions never reference an account that was not created.
- Reimporting the same CSV defaults to account-only repair: change only `acc` / `fromAcc` / `toAcc` while preserving local transaction IDs, amounts, dates, notes, categories, and fund links.
- If the CSV transaction type differs from the existing type, account repair leaves that record unchanged; full replacement still requires the user to explicitly choose full update.
- Credit-card purchases remain expenses. Credit-card payments must be transfers from a bank account to the card account and must not be counted as expenses again.

## 4. 應收款公式 / Receivable Formula

```text
outstandingAmount = receivableAmount - sum(advance_repayment.amount)
```

若 `outstandingAmount > 0`，資產負債表應顯示為應收款資產。

If `outstandingAmount > 0`, the balance sheet should show it as receivable asset.

## 5. 大額支出準備規則 / Large-Expense Fund Rules

### 中文

大額支出準備不是銀行帳戶，也不是資產負債表項目。它是預算規劃工具，用來避免大額支出一次吃掉當月生活支出。

準備金累積由以下內容推導：

```text
準備目前累積 =
  每月規劃提撥累積
  + topup events
  - spend events
```

規則：

- `monthlyContribution` 代表每月規劃提撥，會進入預算頁「本月大額準備」。
- `topup` 代表額外補入，會扣本月可自由運用。
- `spend` 代表動用準備，會降低準備目前累積。
- 支出若被準備覆蓋，不應再重複算進本月生活支出。
- 支出若部分被準備覆蓋，只有未覆蓋部分算本月生活支出。

### English

A large-expense fund is not a bank account and not a balance-sheet item. It is a budget planning tool that prevents large expenses from fully consuming the current month's living budget.

Fund balance is derived from:

```text
fund balance =
  accumulated planned monthly contributions
  + topup events
  - spend events
```

Rules:

- `monthlyContribution` is planned monthly allocation and appears as current-month fund allocation in the budget page.
- `topup` means extra money added and reduces current-month free-to-use budget.
- `spend` means money used from the fund and reduces fund balance.
- If an expense is covered by a fund, it should not also count as current-month living expense.
- If an expense is partially covered by a fund, only the uncovered portion counts as current-month living expense.

編輯規則：

- 編輯名稱、分類、目標金額、每月提撥、開始月份、目標月份或備註時，既有 `topup` / `spend` events 會保留。
- 修改 `monthlyContribution`、`startMonth` 或 `targetMonth` 後，系統會依新設定直接重算過去與未來的規劃提撥。
- 這表示目前採用的是「重新解讀整段規劃」模式，還不是「只影響未來月份」模式。
- 產品決策：短期先保留此計算方式，只在 UI 與文件中明確提醒；不要在沒有完整規格前加入 `plan_changed` 或設定版本化。

Editing rules:

- Editing name, category, target amount, monthly contribution, start month, target month, or note preserves existing `topup` / `spend` events.
- Changing `monthlyContribution`, `startMonth`, or `targetMonth` directly recalculates past and future planned contributions using the new settings.
- This means the current model reinterprets the whole plan. It does not yet support a "future months only" edit mode.
- Product decision: keep this calculation model in the short term and explain it clearly in UI and docs; do not add `plan_changed` or settings-versioning without a full specification.

## 6. 可自由運用公式 / Free-To-Use Formula

```text
可自由運用 =
  本月可支配預算
  - 本月生活支出
  - 本月大額準備
  - 本月手動補入
```

```text
freeToUse =
  monthly budget cap
  - living expenses
  - planned fund contributions
  - manual fund top-ups
```

維護重點：

- `本月生活支出` 必須排除已由準備覆蓋的金額。
- `本月大額準備` 來自每月規劃提撥。
- `本月手動補入` 來自本期 `topup` events。

Maintenance points:

- `living expenses` must exclude amounts covered by funds.
- `planned fund contributions` come from monthly planned contributions.
- `manual fund top-ups` come from `topup` events in the period.

## 7. 準備金不足時 / When Fund Balance Is Insufficient

### 中文

當支出指定大額準備但準備不足時，未來應讓使用者選：

1. 補足差額後整筆由準備支付。
2. 準備只支付目前有的部分，剩下算本月生活支出。
3. 取消指定準備，整筆算本月生活支出。

不應過度自動幫使用者決定錢從哪裡來。

### English

When an expense is linked to a fund but the fund balance is insufficient, the future UI should let the user choose:

1. Top up the shortfall and cover the full expense from the fund.
2. Use only the current fund balance and count the rest as current-month living expense.
3. Remove the fund link and count the full expense as current-month living expense.

The system should not over-automate where the money comes from.

## 8. 刪除與交易編輯 / Delete And Transaction Edit Rules

### 中文

刪除交易時：

- 交易相關的 `spend` / `topup` events 必須同步刪除。

編輯交易時：

- 已指定準備的交易若修改金額，應先解除指定。
- 原本連動的準備事件應先移除。
- 使用者重新決定是否使用準備、使用多少、差額從哪裡來。
- 如果交易改成不指定準備，原本相關準備事件應刪除。

### English

When deleting a transaction:

- Related `spend` / `topup` events must be removed as well.
- If the deleted transaction is an advance, its linked `advance_repayment` rows must be removed as well.

For transaction editing:

- If a linked transaction amount changes, unlink it first.
- Remove previous linked fund events first.
- Let the user decide again whether to use a fund, how much to use, and where any difference should come from.
- If the transaction is edited to no longer use a fund, remove previous related fund events.

卡片內編輯補充：

- 備註、分類、子分類或付款帳戶改變，但金額、日期與支出類型不變時，既有大額準備連結可以保留。
- 已連結準備的支出若改變金額、日期或交易類型，必須解除準備連結並移除相關事件。
- 收入、支出、轉帳與代墊可互相更正，但必須重新驗證各類型需要的帳戶與代墊欄位。
- 已有收款紀錄的代墊不得改成其他類型，以免留下無來源的收款。
- 代墊收款只能修改金額、日期、入帳帳戶與備註，並保留原本的 `advanceId`。

Inline detail editing addendum:

- A fund link may be preserved when only the note, category, subcategory, or payment account changes and the amount, date, and expense type stay unchanged.
- Changing the amount, date, or type of a fund-linked expense must remove its fund link and related events.
- Income, expense, transfer, and advance records may be corrected between types only after validating the fields required by the target type.
- An advance with repayment records cannot change to another type because that would orphan its repayments.
- An advance repayment may edit only its amount, date, receiving account, and note while preserving its `advanceId`.

### 補充：代墊與還款編輯 / Addendum: Advance And Repayment Editing

- 若代墊已經有還款紀錄，重新編輯後的應收金額不得低於已還款總額。
- 編輯代墊時，畫面應提示目前已還多少，避免使用者把應收改到與既有還款互相衝突。
- 還款可修改金額、日期、入帳帳戶，但仍必須保留原本的 `advanceId` 關聯。
- 編輯某一筆還款時，新的還款金額不得超過「原始應收金額 - 其他還款總額」。

- If repayments already exist, the edited receivable amount of the advance must stay greater than or equal to the total amount already repaid.
- While editing an advance, the UI should show how much has already been repaid.
- A repayment may edit amount, date, and receiving account, but it must keep the same `advanceId` link.
- When editing one repayment, the new repayment amount must not exceed `original receivable amount - total of all other repayments`.

## 9. 本機與雲端邊界 / Local And Cloud Boundary

### 中文

本機資料使用未綁定 `local` 與 Firebase `uid` namespace 分流；登出或切換帳號必須替換整份前端 state，不得繼續顯示上一帳號資料。

Firestore 同步以帳務 record 為單位。不同 record 可自動共存；同一 record 的 revision 衝突必須整筆選擇本機或雲端，不得把金額、帳戶、分類或 fund link 自動拼裝。

覆蓋前的落敗版本必須先存入與目前 `local`／Firebase UID 相同 scope 的衝突復原中心。復原時可以選擇整筆 record，但仍必須經過正常 normalize、保存、render 與雲端 queue，形成新的 revision；不得直接倒轉 revision 或繞過帳務正規化。準備事件不得脫離母準備項目存在。

刪除使用 tombstone，避免離線舊裝置重新帶回已刪資料。同步轉接層不得改變 `txs` 與 `sinkingFunds.events` 的帳務事實地位。

### English

Local data is separated into an unbound local namespace and Firebase UID namespaces. Signing out or switching accounts must replace the whole frontend state.

Firestore synchronizes accounting records. Different records may coexist, while a same-record revision conflict requires a whole-record local/cloud choice. Amount, account, category, and fund-link fields must not be guessed or spliced together.

The losing version must be preserved in the matching local or Firebase-UID recovery scope before overwrite. A selected record is restored through the normal normalization and commit pipeline as a new revision. Revision rollback and orphan fund events are not allowed.

Deletions use tombstones so stale offline devices cannot silently restore removed records. The sync adapter must not change the source-of-truth roles of `txs` and `sinkingFunds.events`.

## 10. 退休頁定位 / Retirement Page Positioning

### 中文

退休頁維持個人估算器定位：

- 自訂報酬率、通膨、退休年齡、壽命、每月提領是主邏輯。
- 4% 法則只是額外參考。
- 不把 4% 法則當成主要警告依據。
- 推估結果不寫回交易、帳戶或資產負債表。

### English

The retirement page remains a personal estimator:

- Custom return rate, inflation, retirement age, lifespan, and monthly withdrawal are the main logic.
- The 4% rule is only an additional reference.
- Do not use the 4% rule as the main warning logic.
- Projection results should not write back to transactions, accounts, or the balance sheet.

## 11. 維護檢查點 / Maintenance Checklist

修改交易、預算、大額準備、資產負債或退休頁時，請確認：

- 轉帳仍不算收入與支出。
- 代墊只把 `ownAmount` 算進個人支出。
- 代墊收款仍不算收入。
- 大額準備覆蓋的支出沒有重複算進生活支出。
- 手動補入有扣本月可自由運用。
- 大額準備每月提撥沒有被誤當成帳戶轉帳。
- 退休頁結果沒有被當成帳務事實。

When changing transactions, budget, funds, balance sheet, or retirement page, verify:

- Transfers are still neither income nor expense.
- Advances count only `ownAmount` as personal expense.
- Advance repayments are still not income.
- Fund-covered expenses are not counted again as living expenses.
- Manual top-ups reduce current-month free-to-use budget.
- Planned monthly fund contributions are not treated as account transfers.
- Retirement projections are not treated as accounting facts.
