# 理財計算資料模型 / Finance Data Model

這份文件說明目前前端 state 的主要資料結構，以及哪些資料是帳務事實、哪些是預算規劃、哪些只是推估顯示。

This document describes the frontend state model and separates accounting facts, budget planning data, and projection-only data.

## 1. State Root

前端與 JSON 備份仍使用單一 state 物件；本機以完整 snapshot 保存，Firestore 則由同步轉接層拆成 record-level 文件。

The frontend and JSON backup still use one state object. Local storage keeps a complete snapshot, while the Firestore adapter projects it into record-level documents.

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

### balance_adjustment

```js
{
  id,
  type: "balance_adjustment",
  amount,
  direction: "increase" | "decrease",
  date,
  acc,
  category: "帳戶調整",
  subcategory: "對帳",
  desc
}
```

`balance_adjustment` 是可追溯的帳戶餘額修正，不是收入或支出。完整 JSON 備份與 Firestore 交易 record 會保留它；AndroMoney CSV 不輸出此網站專屬類型。

### accounts 信用卡選填欄位

```js
{
  id,
  name,
  type: "asset" | "liability",
  initialBalance,
  isEm,
  creditLimit?,
  statementDay?,
  paymentDueDay?
}
```

- `creditLimit`、`statementDay`、`paymentDueDay` 是信用卡帳戶的選填設定；日期欄位限 `1` 到 `28`，`0` 或缺少代表未設定。
- 帳戶中心的餘額、欠款、可用額度、本期刷卡與繳款皆由 `accounts + txs` 推導，不另存第二份總額。
- 更改帳戶名稱或資產／負債類型會保留原 `id`，因此歷史交易關聯不變。

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

目前模型：

- 本機驗收 runtime 使用 `fin_v7:acceptance:state:*`、獨立 migration／rollback key 與 `finance-web-recovery-v1-acceptance` IndexedDB。它不讀取 legacy key、不執行 legacy migration、不初始化 Firebase，也不共用正式版衝突復原歷史。
- 未登入資料使用 `fin_v7:state:local`；Google 帳號資料使用 `fin_v7:state:uid:<encoded uid>`，不同帳號不共用本機 snapshot。
- 舊 `fin_v6_*` 只會複製到未綁定的 `local` namespace，保留舊 key 作為回復來源，不會自動歸入任何 Google 帳號。
- 登出或切換 Firebase `uid` 時，store 會立即切換到對應 namespace；第一個遠端 snapshot 完成前不開放雲端保存。
- Firestore v7 使用 `sync/finance_v7` meta 與其下的 `records` collection。交易、帳戶、資產負債項目、待購項目、準備項目、準備事件、設定與自訂分類各自投影成 record。
- `sinkingFunds.events` 只在同步層拆開；套回前端 state 時會重新組回原本巢狀結構，因此帳務 domain 不需要改寫。
- 每筆 record 使用穩定 key、`revision`、`updatedBy`、server `updatedAt` 與 deletion tombstone。不同 record 的跨裝置修改可共存。
- 同一 record 的 revision 競爭不做欄位拼裝；寫入會停止並顯示三個明確按鈕：「保留雲端」「保留本機」「暫不處理」。選擇覆蓋前，落敗版本會依目前 `local`／Firebase UID scope 存入裝置內的 IndexedDB 衝突復原中心，不再於每次衝突自動下載 JSON；只有 IndexedDB 儲存失敗時才下載緊急 JSON，若兩種保護都失敗則阻止覆蓋。
- 衝突復原中心每個 scope 最多保留最近 10 份、最長 30 天。使用者可以看逐筆差異摘要、勾選紀錄、手動匯出或刪除。復原會經正常 `commitState()` 寫成新的本機／雲端 revision，不會倒轉 Firestore revision，也不做欄位級自動合併。
- 復原準備事件時會確保母準備項目一併存在；復原刪除準備項目時會同步移除其事件，避免留下不可見的孤兒紀錄。
- 一般 mutation group 使用單一 Firestore batch；超過 400 筆差異會拒絕而保留本機資料，不做可能部分成功的分批覆蓋。
- 舊 `finance_v6` 雲端文件只作遷移來源。v7 records 完成數量及 round-trip 驗證後，meta 才會切為 `active`；原文件不刪除。若使用者選擇本機版本後，舊雲端文件在切換期間又有變動，遷移會停在 `preparing` 並要求重新載入確認，不會錯誤啟用。
- 「清除此裝置」只刪目前 `local`／Firebase UID scope 的 snapshot、rollback、UID outbox 與衝突復原紀錄。登入狀態還會先停止同步、登出、終止 Firestore 並呼叫官方離線快取清除；不會建立空 state、tombstone 或任何雲端 delete。
- Firestore IndexedDB cache 無法依 UID 分開，因此登入狀態的裝置清理會清除此 Firebase app 在該網站來源下的離線快取；其他帳號的雲端資料不受影響。其他 UID localStorage、legacy v6 keys、migration marker 與共用 device-id 刻意保留。
- 生活紀錄提醒只從截至今天的 `txs`、帳戶與準備金名稱即時計算；關鍵字、預期間隔、狀態及結果不加入 state、JSON、localStorage 或 Firestore。

後續限制：

- Tombstone 目前永久保留，尚未設計安全的清理期限。
- 目前只提供「目前 scope」的安全裝置清理，不是掃除同來源所有帳號與 legacy 資料的完整隱私抹除。
- 衝突復原歷史只存於觸發衝突的裝置，不跨裝置同步；瀏覽器清除網站資料也會移除它。

### English

Current model:

- The forced-offline acceptance runtime uses `fin_v7:acceptance:state:*`, separate migration and rollback keys, and the `finance-web-recovery-v1-acceptance` IndexedDB database. It neither reads legacy keys nor initializes Firebase, and it never shares production recovery history.
- Signed-out data uses `fin_v7:state:local`; Google accounts use `fin_v7:state:uid:<encoded uid>`.
- Legacy `fin_v6_*` data is copied only to the unbound local namespace and is never automatically assigned to a Google account.
- Auth changes replace the store with the matching namespace, and cloud saves remain blocked until the first remote snapshot is resolved.
- Firestore v7 uses a `sync/finance_v7` meta document and a nested `records` collection.
- Fund events are flattened only in the sync adapter and are rebuilt into `sinkingFunds.events` before entering the domain layer.
- Records carry stable keys, revisions, server timestamps, writer IDs, and deletion tombstones.
- Different records merge naturally. A same-record revision conflict pauses and presents explicit Keep cloud, Keep local, and Not now buttons; field-level guessing is not used. Before overwrite, the losing version is stored in a UID-scoped local IndexedDB recovery center instead of triggering an automatic download. Emergency JSON is downloaded only if internal recovery storage fails.
- Recovery history is limited to 10 entries per scope and 30 days. Selected records are restored through the normal commit pipeline as new revisions; fund parent-child integrity is preserved.
- Normal mutation groups are one atomic batch and are rejected above 400 changed records.
- The legacy `finance_v6` document remains an untouched migration source until v7 records pass count and round-trip verification.
- Device clearing is current-scope only: it stops sync, signs out, terminates Firestore, clears the app persistence cache, and then removes current recovery/rollback/outbox/snapshot data without writing cloud deletes or empty-state tombstones.
- Life-record reminder inputs and derived results are memory-only and absent from state, JSON, localStorage, and Firestore.

Remaining limits:

- Tombstone garbage collection is not defined yet.
- Current-scope clearing is available locally, but full-origin privacy erasure across other UIDs and legacy namespaces is intentionally out of scope.
- Recovery history is device-local and is not synchronized across devices.

## 10. 退休頁定位 / Retirement Page Positioning

### 中文

退休頁短期維持「個人估算器」：

- 自訂報酬率、通膨、提領、壽命的推估是主邏輯。
- 4% 法則只是額外參考。
- 護欄輸入、目前／目標股票債券現金配置、報酬率與緊急預備金目標年數都只存在畫面記憶體；重新載入即回到範例值，不加入 state、JSON、localStorage 或 Firestore。
- `emergencyFund` 由既有標記為緊急預備金的帳戶與手動項目推導，仍排除在 `retirementReadyAsset` 之外；只有使用者勾選允許時，年度來源試算才可把它列為股票之前的備援來源。
- 護欄決策與 `withdrawal source plan` 都是衍生結果，不保存，也不自動建立提領交易。
- 僅加入透明的年度規則與來源順序，不擴張成蒙地卡羅、稅務或自動再平衡交易平台。
- 推估結果不是帳務事實，不應寫回交易或資產負債。

### English

The retirement page should remain a personal estimator in the short term:

- Custom return rate, inflation, withdrawal, and lifespan assumptions are the main logic.
- The 4% rule is only an additional reference.
- Guardrail inputs, current/target stock-bond-cash allocations, return inputs, and the emergency-reserve year target are UI-memory only. They are absent from state, JSON, localStorage, and Firestore.
- `emergencyFund` is derived from existing emergency-marked accounts and manual items and remains excluded from `retirementReadyAsset`. It enters the annual source plan only through explicit opt-in.
- Guardrail decisions and withdrawal source plans are derived, non-persisted results and never create withdrawal transactions automatically.
- The feature remains a transparent annual-rule estimator rather than a Monte Carlo, tax, or automated rebalancing platform.
- Projection results are not accounting facts and should not write back to transactions or the balance sheet.
