# 會計規則與交易影響

這份文件定義理財計算機目前採用的核心會計規則。未來新增功能或修 bug 時，請先確認是否符合這些規則，再修改畫面或報表。

## 設計原則

- 交易明細 `txs` 是主要事實來源。
- 報表數字應該由交易、帳戶與設定推導，不要手動儲存第二份總額。
- 轉帳不是收入，也不是支出。
- 代墊不是完整支出，只有自己負擔的部分才算個人支出。
- 代墊收款不是收入，而是應收款回收。

## 交易類型

### income 收入

收入代表錢流入某個帳戶。

影響：

- 指定帳戶餘額增加 `amount`。
- 期間收入增加 `amount`。
- 若分類屬於薪資、獎金、其他收入、被動收入，會進入營運現金流收入。
- 不增加預算支出。
- 不直接建立資產負債表手動項目。

### expense 支出

支出代表自己真正消費或付出的金額。

若支出有設定「大額支出分攤」，只會改變預算視角，不會改變原始交易金額、帳戶餘額或現金流。

影響：

- 指定帳戶餘額減少 `amount`。
- 期間支出增加 `amount`。
- 預算支出在 `actual` 模式下增加 `amount`。
- 預算支出在 `spread` 模式下，改依分攤月數按月認列。
- 分類預算跟隨目前預算模式。
- 現金流支出增加 `amount`。

可選欄位：

- `budgetMode`：`normal` 或 `spread`
- `spreadMonths`：分攤月數
- `spreadStartMonth`：起始月份，格式 `YYYY-MM`
- `spreadLabel`：分攤名稱，例如「旅遊基金」

### transfer 轉帳

轉帳只代表兩個帳戶之間移動資金。

影響：

- 來源帳戶餘額減少 `amount`。
- 目標帳戶餘額增加 `amount`。
- 不增加收入。
- 不增加支出。
- 不增加預算支出。
- 不影響現金流收入或支出。

### advance 代墊

代墊代表自己先支付全額，但其中一部分是別人之後要還的應收款。

欄位：

- `amount`：實際支付總額。
- `ownAmount`：自己真正負擔的金額。
- `receivableAmount`：別人應還金額，通常是 `amount - ownAmount`。
- `person`：應還款對象。
- `acc`：付款帳戶。

影響：

- 付款帳戶餘額減少 `amount`。
- 期間支出只增加 `ownAmount`。
- 預算支出只增加 `ownAmount`。
- 分類預算只增加 `ownAmount`。
- 現金流支出只增加 `ownAmount`。
- 資產負債表增加一筆應收款 `receivableAmount - repayments`。
- 不增加收入。

### advance_repayment 代墊收款

代墊收款代表別人把代墊款還給你。

欄位：

- `advanceId`：對應原始 `advance` 交易。
- `amount`：本次收回金額。
- `acc`：收款帳戶。
- `person`：還款對象。

影響：

- 收款帳戶餘額增加 `amount`。
- 對應代墊的未收金額減少 `amount`。
- 不增加收入。
- 不增加支出。
- 不增加預算收入或支出。
- 不增加現金流收入。

## 帳戶餘額公式

每個帳戶餘額由以下規則推導：

```text
accountBalance =
  initialBalance
  + income.amount
  - expense.amount
  - advance.amount
  + advance_repayment.amount
  + transferIn.amount
  - transferOut.amount
```

注意：代墊會讓付款帳戶減少全額，因為現金真的先流出了；但報表支出只認列自己負擔的部分。

## 應收款公式

```text
outstandingAmount = receivableAmount - sum(advance_repayment.amount)
```

若 `outstandingAmount > 0`，資產負債表應顯示為應收款資產。

若 `outstandingAmount === 0`，表示該代墊已收回，不再列入未收應收款。

## 預算公式

```text
budgetExpense =
  sum(expense.amount)
  + sum(advance.ownAmount)
```

若預算模式為 `spread`，則有分攤設定的 `expense` 不直接使用交易日全額，而改以分攤表計算：

```text
monthlySpreadAmount = expense.amount / spreadMonths
periodBudgetExpense =
  sum(normalExpense.amount in range)
  + sum(advance.ownAmount in range)
  + sum(spreadExpense.monthlySpreadAmount in overlapped months)
```

以下交易不應進入預算：

- `income`
- `transfer`
- `advance_repayment`
- `advance.receivableAmount`

## 現金流公式

目前現金流採用簡化口徑：

- 營運收入：薪資、獎金、其他收入、被動收入。
- 營運支出：支出與代墊中的自己負擔部分。
- 投資收入：投資收益、股息收入。

```text
netOperating = operatingIncome - operatingExpense
netTotal = netOperating + investingIncome
```

## 維護檢查點

修改交易或報表相關功能時，至少檢查：

- 轉帳是否仍不算收入與支出。
- 代墊是否只把 `ownAmount` 算進支出與預算。
- 代墊收款是否不算收入。
- 大額分攤是否只影響預算，不影響帳戶餘額與現金流。
- `actual` 與 `spread` 模式切換時，原始交易是否仍保持同一筆。
- 帳戶餘額是否反映真實現金流出入。
- 資產負債表是否包含未收回的應收款。
