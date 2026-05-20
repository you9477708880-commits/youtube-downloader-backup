# 理財計算資料模型 / Finance Data Model

這份文件說明目前前端 state 的主要資料結構，以及哪些資料是帳務事實、哪些是預算規劃、哪些只是推估顯示。

This document describes the frontend state model and separates accounting facts, budget planning data, and projection-only data.

## 1. State Root

目前整份資料會以單一 state 物件保存，並同步到 localStorage / Firestore。

The whole app state is stored as one state object and synced to localStorage / Firestore.

```js
{
  schemaVersion: 2,
  txType: "expense",
  txs: [],
  bsI: [],
  wishes: [],
  sinkingFunds: [],
  userCats: {
    income: [],
    expense: []
  },
  accounts: [],
  settings: {}
}
```

## 2. 單一資料真相 / Single Source Of Truth

### 中文

- `txs` 是交易事實來源，代表實際發生的收入、支出、轉帳、代墊與代墊收款。
- `schemaVersion` 是資料形狀版本，目前版本為 `2`。
- `accounts.initialBalance` 是帳戶起始餘額來源。
- `bsI` 是手動資產 / 負債來源。
- `sinkingFunds` 是大額支出準備的設定來源。
- `sinkingFunds.events` 是大額準備的補入與動用事件來源。
- 退休頁是推估工具，不是帳務事實來源。

### English

- `txs` is the source of truth for actual transactions: income, expenses, transfers, advances, and advance repayments.
- `schemaVersion` records the normalized data-shape version. Current version: `2`.
- `accounts.initialBalance` is the source for account starting balances.
- `bsI` stores manual assets and liabilities.
- `sinkingFunds` stores large-expense fund settings.
- `sinkingFunds.events` stores fund top-up and spending events.
- The retirement page is a projection tool, not an accounting source of truth.

## 3. txs

`txs` 是交易清單。所有實際發生的收入、支出、轉帳、代墊與代墊收款都存在這裡。

`txs` is the transaction list. All real income, expenses, transfers, advances, and advance repayments are stored here.

### 共用欄位 / Common Fields

```js
{
  id,
  type: "expense",
  amount,
  desc,
  date,
  cat,
  category,
  subcategory
}
```

`category` 是新的主分類欄位，`subcategory` 是新的子分類欄位。舊欄位 `cat` 目前保留作為相容欄位。載入舊資料時，系統會用 `cat` 補出 `category`，並把缺少的 `subcategory` 補成「未分類」。

`category` is the new primary category field, and `subcategory` is the new secondary category field. Legacy `cat` remains as a compatibility field. When older data is loaded, the system fills `category` from `cat` and fills missing `subcategory` with `未分類`.

### income

```js
{
  id,
  type: "income",
  amount,
  desc,
  date,
  cat,
  acc
}
```

影響：

- 收入統計增加 `amount`。
- 帳戶 `acc` 增加 `amount`。
- 不影響預算支出。

Effects:

- Increases income by `amount`.
- Increases account `acc` by `amount`.
- Does not affect budget expenses.

### expense

```js
{
  id,
  type: "expense",
  amount,
  desc,
  date,
  cat,
  acc,
  linkedFundId?
}
```

影響：

- 帳戶 `acc` 減少 `amount`。
- 總覽與現金流支出增加 `amount`。
- 預算頁生活支出通常增加 `amount`。
- 若 `linkedFundId` 指向大額準備，預算頁只把未被準備覆蓋的部分算進生活支出。

Effects:

- Decreases account `acc` by `amount`.
- Increases overview and cash-flow expenses by `amount`.
- Usually increases budget living expense by `amount`.
- If `linkedFundId` points to a large-expense fund, only the uncovered portion should count as living expense in the budget page.

### transfer

```js
{
  id,
  type: "transfer",
  amount,
  desc,
  date,
  cat: "轉帳",
  fromAcc,
  toAcc
}
```

轉帳只移動帳戶資金，不是收入也不是支出。

A transfer only moves money between accounts. It is neither income nor expense.

### advance

```js
{
  id,
  type: "advance",
  amount,
  ownAmount,
  receivableAmount,
  person,
  desc,
  date,
  cat,
  acc
}
```

代墊代表自己先付全額，但只有 `ownAmount` 是自己的支出。

An advance means the user paid the full amount first, but only `ownAmount` is the user's own expense.

### advance_repayment

```js
{
  id,
  type: "advance_repayment",
  advanceId,
  amount,
  date,
  acc,
  cat: "代墊收款",
  desc,
  person
}
```

代墊收款不是收入，而是應收款回收。

Advance repayment is not income. It is receivable recovery.

### 補充：代墊與還款關聯 / Addendum: Advance And Repayment Relationship

- `advance_repayment.advanceId` 會把還款固定連回原本的代墊。
- 編輯單筆還款時，最大可填金額為：

```text
advance.receivableAmount - sum(other advance_repayment.amount)
```

- 編輯原始代墊時，新的 `receivableAmount` 不可小於目前已還款總額。

- `advance_repayment.advanceId` keeps each repayment attached to its original advance.
- When editing one repayment, the maximum allowed amount is:

```text
advance.receivableAmount - sum(other advance_repayment.amount)
```

- When editing the original advance, the new `receivableAmount` cannot be lower than the total amount already repaid.

## 4. sinkingFunds

`sinkingFunds` 是大額支出準備清單。它代表預算規劃與準備金事件，不代表真實帳戶餘額。

`sinkingFunds` stores large-expense funds. It represents budget planning and fund events, not real account balances.

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

### 欄位說明 / Field Meanings

- `targetAmount`：希望準備到的目標金額。Target amount.
- `monthlyContribution`：每月規劃提撥，這是預算規劃，不是帳戶轉帳。Planned monthly contribution; this is budget planning, not an account transfer.
- `startMonth`：開始納入每月規劃提撥的月份。First planned contribution month.
- `targetMonth`：希望完成準備的月份。Expected completion month.
- `events`：實際補入或動用準備金的事件。Actual fund top-up or spending events.

### events

```js
{ id, type: "topup", amount, date, note, linkedTxId? }
{ id, type: "spend", amount, date, note, linkedTxId? }
```

- `topup`：額外補入準備，會扣本月可自由運用。
- `spend`：動用準備，會降低準備目前累積。
- `linkedTxId`：若事件來自某筆支出交易，記錄對應交易 ID。

- `topup`: extra money added to a fund; reduces current-month free-to-use budget.
- `spend`: money used from a fund; reduces fund balance.
- `linkedTxId`: stores the linked expense transaction ID when applicable.

### 編輯設定的影響 / Editing Settings

- 編輯 fund 本身的設定時，既有 `events` 會保留。
- 若修改 `monthlyContribution`、`startMonth` 或 `targetMonth`，規劃提撥會用新設定重新計算整段期間。
- 目前尚未提供「只從某個月份開始套用新設定」的版本化欄位。

- Editing fund settings preserves existing `events`.
- Changing `monthlyContribution`, `startMonth`, or `targetMonth` recalculates the planned contribution schedule for the whole covered period.
- The model does not yet have versioned fields for "apply only from a future month onward."

## 5. 大額準備與支出的關係 / Expense And Fund Linking

### 中文

支出可以用 `linkedFundId` 指定對應大額準備。

如果準備足夠：

- 建立支出交易。
- 建立一筆 `spend` event。
- 預算頁不再把這筆已覆蓋金額重複算進生活支出。

如果準備不足，未來應讓使用者選：

1. 補足差額後整筆由準備支付。
2. 準備只支付目前有的部分，剩下算本月生活支出。
3. 取消指定準備，整筆算本月生活支出。

### English

An expense may use `linkedFundId` to link to a large-expense fund.

If the fund has enough balance:

- Create the expense transaction.
- Create a `spend` event.
- The covered amount should not be counted again as living expense in the budget page.

If the fund balance is insufficient, the future UI should let the user choose:

1. Top up the shortfall and cover the full expense from the fund.
2. Use only the current fund balance and count the rest as current-month living expense.
3. Remove the fund link and count the full expense as current-month living expense.

## 6. 交易刪除與編輯規則 / Delete And Edit Rules

### 中文

刪除交易時：

- 若交易有對應大額準備事件，應同步刪除該交易的 `spend` / `topup` events。

編輯交易時：

- 如果一筆已指定準備的交易被修改金額，系統應先解除原本指定。
- 不自動猜測準備金應該怎麼改。
- 原本連動的 `spend` / 自動補差額 `topup` 應先移除。
- 使用者重新決定要不要指定準備、要動用多少準備、差額從哪裡來。

### English

When deleting a transaction:

- If the transaction has linked fund events, remove the linked `spend` / `topup` events as well.
- If the transaction is an advance, remove its linked `advance_repayment` rows as well.

For transaction editing:

- If a linked transaction amount is edited, unlink it from the fund first.
- Do not automatically guess how the fund events should change.
- Remove the previous linked `spend` and automatic shortfall `topup` events first.
- Let the user decide again whether to use a fund, how much fund balance to use, and where any difference should come from.
- Advances may be edited only while preserving already-recorded repayments: the new receivable amount cannot be lower than the amount already repaid.
- Advance repayments may edit amount, date, and receiving account, but the edited amount cannot exceed the remaining receivable limit after other repayments are counted.

## 7. 可自由運用公式 / Free-To-Use Formula

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

其中：

- `本月可支配預算`：`settings.budgetCap`。
- `本月生活支出`：本月交易中仍需由當月負擔的個人支出。
- `本月大額準備`：本月所有大額準備的規劃提撥總額。
- `本月手動補入`：本月額外補進大額準備的 `topup` 總額。

Where:

- `monthly budget cap`: `settings.budgetCap`.
- `living expenses`: personal expenses that still need to be paid by the current month.
- `planned fund contributions`: planned allocations for all large-expense funds in the current period.
- `manual fund top-ups`: extra `topup` events added in the current period.

## 8. 目標月份合理性 / Target Month Feasibility

如果使用者設定：

```text
每月提撥 2,000
一年後結束
目標 30,000
```

只靠每月提撥最多只有 `24,000`，無法達標。

系統應提醒使用者：

- 延後目標月份。
- 提高每月提撥。
- 降低目標金額。
- 或保留設定，但之後用手動補入補足。

If the user sets:

```text
Monthly contribution: 2,000
Target after one year
Target amount: 30,000
```

Monthly contributions alone can only reach `24,000`, so the target is not feasible.

The system should warn the user and suggest:

- Delay the target month.
- Increase monthly contribution.
- Reduce target amount.
- Keep the setting and later use manual top-ups.

## 9. 本機與雲端 / Local And Cloud

### 中文

目前限制：

- 本機資料仍使用固定 localStorage key，尚未依 Google `uid` 分流。
- 雲端資料依 Firebase 使用者 `uid` 儲存。
- 同一瀏覽器切換多個 Google 帳號時，本機資料可能顯示最近一次載入或同步的內容。

短期方向：

- 先用文件與 UI 說清楚限制。
- 保持離線可用。
- 不急著做複雜自動合併。

未來方向：

- 登入時詢問要使用本機、雲端，或嘗試合併。
- 合併財務資料需要明確衝突規則。
- 可以提供「清除此裝置資料」功能保護隱私。

### English

Current limitation:

- Local data still uses fixed localStorage keys and is not separated by Google `uid`.
- Cloud data is stored by Firebase user `uid`.
- Switching multiple Google accounts in the same browser may show the most recently loaded or synced data.

Short-term direction:

- Document and explain the limitation in the UI.
- Preserve offline usability.
- Do not rush complex automatic merging.

Future direction:

- On sign-in, ask whether to use local data, cloud data, or attempt a merge.
- Merging financial data requires explicit conflict rules.
- Provide a "clear this device data" action for privacy.

## 10. 退休頁定位 / Retirement Page Positioning

### 中文

退休頁短期維持「個人估算器」：

- 自訂報酬率、通膨、提領、壽命的推估是主邏輯。
- 4% 法則只是額外參考。
- 不先擴張成完整投資模擬器。
- 推估結果不是帳務事實，不應寫回交易或資產負債。

### English

The retirement page should remain a personal estimator in the short term:

- Custom return rate, inflation, withdrawal, and lifespan assumptions are the main logic.
- The 4% rule is only an additional reference.
- Do not expand it into a full investment simulation tool yet.
- Projection results are not accounting facts and should not write back to transactions or the balance sheet.
