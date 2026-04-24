# 理財計算資料模型

這份文件說明目前前端 state 的主要資料結構，以及每種交易類型如何影響統計、帳戶餘額、預算與資產負債表。

目標是讓後續維護時，不需要重新從 UI 或 render 邏輯推回資料意義。

## State Root

目前整份資料會以單一 state 物件保存，並同步到 localStorage / Firestore。

```js
{
  txType: "expense",
  txs: [],
  bsI: [],
  wishes: [],
  userCats: {
    income: [],
    expense: []
  },
  accounts: [],
  settings: {}
}
```

## txType

`txType` 是目前新增交易表單正在使用的交易類型。

目前支援：

- `income`：收入
- `expense`：支出
- `transfer`：帳戶間轉帳
- `advance`：代墊款

注意：`advance_repayment` 是系統產生的收款交易，不會作為表單的主要交易類型。

## txs

`txs` 是交易清單，所有收入、支出、轉帳、代墊、代墊收款都存在這裡。

交易通常依照新增時間放在陣列前方：

```js
state.txs.unshift(tx)
```

### 共用欄位

多數交易都有：

```js
{
  id: 1710000000000,
  type: "expense",
  amount: 1000,
  desc: "晚餐",
  date: "2026-04-22",
  cat: "餐飲"
}
```

欄位說明：

- `id`：交易 ID，目前使用 `Date.now()`。
- `type`：交易類型。
- `amount`：交易金額，整數。
- `desc`：備註。
- `date`：日期字串，格式為 `YYYY-MM-DD`。
- `cat`：分類。

## Transaction Types

### income

收入交易。

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

會影響：

- 收入統計：增加 `amount`
- 帳戶餘額：`acc` 增加 `amount`
- 現金流：依分類可能列入營運收入或投資收入
- 預算支出：不影響

### expense

一般支出交易。

```js
{
  id,
  type: "expense",
  amount,
  desc,
  date,
  cat,
  acc,
  budgetMode: "normal" | "spread",
  spreadMonths,
  spreadStartMonth,
  spreadLabel
}
```

會影響：

- 支出統計：增加 `amount`
- 帳戶餘額：`acc` 減少 `amount`
- 預算支出：在 `actual` 模式下增加 `amount`
- 預算支出：在 `spread` 模式下改依分攤月數按月認列
- 分類支出：跟隨目前預算模式

若 `budgetMode === "spread"`，表示這是一筆大額支出分攤。它的意思是：

- 原始交易仍在 `date` 當天全額發生
- 帳戶餘額仍在 `date` 當天全額扣除
- 總覽與現金流仍看原始全額
- 只有預算頁與分類預算可切換成分攤後視角

### transfer

帳戶之間的轉帳。

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

會影響：

- 帳戶餘額：`fromAcc` 減少 `amount`
- 帳戶餘額：`toAcc` 增加 `amount`
- 收入統計：不影響
- 支出統計：不影響
- 預算：不影響

### advance

代墊交易。用於「我先付全部，別人之後還我一部分」。

範例：

```js
{
  id,
  type: "advance",
  amount: 1200,
  ownAmount: 400,
  receivableAmount: 800,
  person: "媽媽",
  desc: "晚餐",
  date: "2026-04-22",
  cat: "餐飲",
  acc: "a1"
}
```

欄位說明：

- `amount`：實際付款總額。
- `ownAmount`：自己實際負擔的金額。
- `receivableAmount`：別人應該還你的金額，通常是 `amount - ownAmount`。
- `person`：代墊對象。
- `acc`：付款帳戶。

會影響：

- 帳戶餘額：`acc` 減少 `amount`
- 支出統計：只增加 `ownAmount`
- 預算支出：只增加 `ownAmount`
- 分類支出：只增加 `ownAmount`
- 資產負債表：尚未收回的 `receivableAmount` 算作資產
- 收入統計：不影響

會計概念：

```text
付款總額 = 自己支出 + 應收代墊款
```

例如：

```text
吃飯總額 1200
自己負擔 400
家人應還 800
```

系統應理解為：

```text
餐飲支出 400
應收代墊款 800
帳戶扣款 1200
```

### advance_repayment

代墊收款交易。用於記錄對方還錢。

```js
{
  id,
  type: "advance_repayment",
  advanceId,
  amount: 800,
  date: "2026-04-24",
  acc: "a1",
  cat: "代墊收款",
  desc: "媽媽 還款",
  person: "媽媽"
}
```

欄位說明：

- `advanceId`：對應的 `advance` 交易 ID。
- `amount`：本次收到的金額。
- `acc`：收款帳戶。
- `person`：還款對象。

會影響：

- 帳戶餘額：`acc` 增加 `amount`
- 對應代墊款的未收金額：減少 `amount`
- 收入統計：不影響
- 支出統計：不影響
- 預算：不影響

重要原則：

代墊收款不是收入，只是應收款回收。

## 代墊款計算

開放中的代墊款定義：

```js
outstandingAmount = receivableAmount - repayments
```

其中：

- `receivableAmount` 來自 `advance`
- `repayments` 是所有 `advance_repayment` 且 `advanceId` 相同的收款總和

如果 `outstandingAmount > 0`，就顯示在「待收代墊款」。

如果 `outstandingAmount === 0`，視為已結清。

## accounts

帳戶資料。

```js
{
  id: "a1",
  name: "現金",
  type: "asset",
  isEm: false,
  initialBalance: 0
}
```

欄位說明：

- `id`：帳戶 ID。
- `name`：帳戶名稱。
- `type`：目前多數帳戶以 `asset` 表示。
- `isEm`：是否為緊急預備金。
- `initialBalance`：初始餘額。

帳戶餘額計算：

```text
帳戶餘額 = initialBalance
        + income
        - expense
        - advance.amount
        + advance_repayment.amount
        + transfer in
        - transfer out
```

## bsI

資產負債表手動項目。

```js
{
  id,
  name,
  amount,
  cat: "asset" | "liability",
  isEm: false
}
```

注意：

代墊應收款不是存在 `bsI`，而是由 `txs` 中尚未結清的 `advance` 動態計算出來。

## wishes

願望清單。

```js
{
  id,
  name,
  price,
  cat
}
```

目前願望清單會搭配預算剩餘額，用來判斷可購買狀態。

## userCats

使用者自訂分類。

```js
{
  income: [],
  expense: []
}
```

注意：

`advance` 使用的是支出分類，因為它代表一筆消費中自己的負擔分類。

## settings

設定資料。

```js
{
  budgetCap: 20000,
  budgetViewMode: "actual" | "spread",
  catBudgets: {},
  retLinked: true,
  retManualAsset: 0
}
```

欄位說明：

- `budgetCap`：總預算上限。
- `budgetViewMode`：預算頁使用實際支出或分攤後支出視角。
- `catBudgets`：分類預算。
- `retLinked`：退休試算是否連動資產。
- `retManualAsset`：退休試算手動資產。

## 統計規則摘要

| 類型 | 收入統計 | 支出統計 | 帳戶餘額 | 預算 | 資產負債 |
| --- | --- | --- | --- | --- | --- |
| income | +amount | 無 | +amount | 無 | 反映在帳戶 |
| expense | 無 | +amount | -amount | `actual` 看全額 / `spread` 看按月認列 | 反映在帳戶 |
| transfer | 無 | 無 | 轉出 -amount / 轉入 +amount | 無 | 反映在帳戶 |
| advance | 無 | +ownAmount | -amount | +ownAmount | 未收款列為資產 |
| advance_repayment | 無 | 無 | +amount | 無 | 減少應收資產 |

## 維護原則

新增交易類型時，必須同時檢查：

- `src/domain/transactions.js`
- `src/domain/accounts.js`
- `src/domain/budget.js`
- `src/views/ledger-view.js`
- `src/views/overview-view.js`
- `src/views/cashflow-view.js`
- `src/views/balance-sheet-view.js`

新增會影響金額的功能時，應先回答：

- 它是不是收入？
- 它是不是支出？
- 它是否影響帳戶餘額？
- 它是否影響預算？
- 它是否應列入資產或負債？
- 它是否需要在日期篩選中出現？

## 建議測試案例

代墊案例：

```text
新增代墊：
總付款 1200
自己負擔 400
對方應還 800
付款帳戶 現金

預期：
帳戶餘額 -1200
支出統計 +400
預算支出 +400
待收代墊款 +800
資產負債表應收 +800
```

收款案例：

```text
收到代墊款 800

預期：
帳戶餘額 +800
收入統計不變
支出統計不變
待收代墊款變 0
資產負債表應收變 0
```

大額分攤案例：

```text
新增支出：
日本旅遊 24000
分攤 12 個月
起始月份 2026-04

預期：
帳戶餘額在 2026-04-20 當天減少 24000
總覽支出增加 24000
現金流支出增加 24000
預算 actual 模式增加 24000
預算 spread 模式在 2026-04 只認列 2000
```
