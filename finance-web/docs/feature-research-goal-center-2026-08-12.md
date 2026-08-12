# 新功能研究與目標中心設計（2026-08-12）

## 1. 本文件的決策範圍

本批次比較三個候選功能：

1. 目標中心：整合待購清單與大額準備的使用流程。
2. 月度回顧 2.0：在既有只讀摘要上增加目標進度與下月行動。
3. 退休情境比較：比較不同退休年齡、投入與生活費假設。

研究來源包括：

- 專案根目錄中的使用者提供 EPUB。
- `docs/finance-book-product-design-notes.md`。
- 現行帳務、資料模型、追溯與 roadmap 文件。
- 現行 wishes、sinking funds、monthly review、retirement domain、controller、view 與同步轉接層。

書籍只作為概念來源。本文件不複製書籍章節或文案，也不把書中階段名稱直接搬進產品。

## 2. 從 EPUB 取得的產品原則

與本批設計最相關的章節主題是：財務階段、六個財務要素、生活品質情境、目標的時間框架與優先順序、理財餘裕分配、支出最佳化。

轉換成產品原則後：

- 記錄過去不是終點，工具應協助回答「下一筆可運用資源應放到哪個目標」。
- 目標需要金額、期限、優先順序與可達成性，但人生目標不應被系統武斷評分。
- 支出分析應幫助使用者保留重視的生活品質，不應使用羞辱式警告。
- 退休功能應強調情境差異，不應假裝能預測投資結果。
- 目標與退休推估都不能變成帳務事實來源。

## 3. 現況盤點

### 3.1 待購清單

目前欄位：

```js
{ id, name, price, cat }
```

現有能力：

- 新增、編輯、刪除及手動排序。
- 用目前 `freeToUse` 依排序累加，顯示哪些項目在預算內。
- 一鍵把名稱、金額、分類帶入大額準備表單。

限制：

- 沒有期限、進度或與 fund 的穩定關聯。
- 「帶入表單」不會建立 fund，也不會修改 wish。
- 排序代表購買優先順序，不等於正式財務目標順序。

### 3.2 大額準備

目前欄位：

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
  events
}
```

現有能力：

- 依月份推導規劃提撥與目前累積。
- 顯示目標進度、剩餘金額與期限可達成性。
- `topup` 與 `spend` 事件可追溯。
- 支出可經 `linkedFundId` 與 `linkedTxId` 使用準備金，避免預算重複計算。

限制：

- fund 是預算規劃工具，不是銀行帳戶，也不是待購項目的子資料。
- 修改每月提撥會重算整段規劃，尚無歷史版本。

### 3.3 月度回顧

目前完全由既有資料推導，沒有額外保存摘要：

- 收入、生活支出、準備提撥／補入／動用。
- 可自由運用、帳本淨額、淨值、應收代墊。
- 主要預算使用來源與規則式提示。

限制：

- 沒有目標進度摘要。
- 沒有可保存的「下月行動」。
- 提示來自規則，不能假裝理解使用者的價值選擇。

### 3.4 退休估算

目前是 UI-driven projection：

- 可連動非緊急備用金的淨資產，或手動輸入初始本金。
- 可調整投入、報酬率、通膨、提領、年齡與目標。
- 投影結果不寫回 `txs`、`accounts` 或 `bsI`。

限制：

- 一次只能看一組情境。
- 多數參數是即時 UI 狀態，重新載入後不保留。

## 4. 三個候選方案比較

評分為 1 到 5，5 代表較好；工程風險則 5 代表風險較高。

| 面向 | 目標中心 | 月度回顧 2.0 | 退休情境比較 |
| --- | ---: | ---: | ---: |
| 使用者日常價值 | 5 | 4 | 3 |
| 與 EPUB 概念一致 | 5 | 5 | 4 |
| 復用現有資料能力 | 5 | 5 | 4 |
| 不改 schema 可交付程度 | 4 | 4 | 5 |
| 工程與帳務風險 | 3 | 2 | 2 |
| 後續可擴充性 | 5 | 4 | 3 |

### 4.1 目標中心

價值：把「想買什麼」與「正在準備什麼」放進同一個決策流程，直接回答本月資源要優先放在哪裡。

主要風險：如果直接把 wish 與 fund 當成同一筆資料，會混淆願望、規劃與實際事件；若用名稱或金額猜關聯，跨裝置編輯後容易連錯。

### 4.2 月度回顧 2.0

價值：最接近「理解現在、決定下月」的產品定位，而且大多數數字可以從現有 domain 推導。

主要風險：若加入文字行動清單並保存，就需要新的持久化 record；若只自動產生提示，容易顯得說教或重複既有數字。

### 4.3 退休情境比較

價值：可讓使用者理解延後退休、增加投入或提高生活費的差異，第一版可完全 UI-only。

主要風險：容易被誤解為投資預測；若同時呈現太多參數，手機畫面與認知負擔會快速增加。

## 5. 建議方案：目標中心

建議採「兩階段、不同承諾」設計。

### 階段 A：統一導航視圖，不改資料模型

第一版只從既有 state 推導：

```js
buildGoalCenterView(state, range) => {
  allocationRoom,
  activeFundGoals,
  wishCandidates,
  attentionItems
}
```

呈現三個區塊：

1. 本月目標空間：顯示 `freeToUse`、本月規劃提撥、手動補入。
2. 準備中的目標：直接使用 fund 的累積、進度、期限與可達成性。
3. 考慮中的目標：顯示 wishes 的排序、價格與目前是否在自由運用範圍內。

這一階段不宣稱 wish 與 fund 已連結。「建立準備」仍只是進入既有 fund 建立流程。

優點：

- 不新增欄位、不 migration、不改 import、sync 或 Rules。
- 不重複保存任何金額。
- 可先驗證使用者是否理解「考慮中」與「準備中」的差異。

### 階段 B：明確關聯，需要人工批准後才實作

若階段 A 驗收確認需要真正連結，建議最小新增欄位：

```js
wish.linkedFundId?: string
```

不建議建立新的 `goals` collection，因為第一版會重複 wishes 與 funds 已有資料，migration 與同步成本過高。

`linkedFundId` 只表示「這個待購項目由哪一個 fund 規劃」，不代表金額、進度或已付款狀態。所有進度仍從 fund 推導。

## 6. 階段 B 資料與生命週期草案

本節是設計稿，不是本批實作。

### 建立關聯

- 從 wish 建立 fund 時，在同一次 `commitState` 中新增 fund 並寫入 `wish.linkedFundId`。
- 不允許使用名稱、分類或價格自動猜測關聯。
- 一個 wish 第一版最多連一個 fund；一個 fund 第一版最多由一個 wish 建立。

### 修改

- 修改 wish 的名稱或價格，不自動修改 fund。
- 修改 fund 的目標金額，不自動修改 wish。
- UI 可提示兩者不同，但必須由使用者選擇是否同步，避免覆蓋不同意義的數字。

### 刪除

- 刪除 wish：只刪 wish，不刪 fund、不刪 fund events、不刪 transaction。
- 刪除 fund：同一 mutation 清除對應 `wish.linkedFundId` 與既有 `tx.linkedFundId`；fund events 隨 fund 移除。
- 刪除 linked transaction：維持現行規則，只移除對應 fund events，不影響 wish。
- 完成購買：建立交易及 fund spend 後，不自動刪 wish；另提供「保留紀錄／從清單移除」選擇。

### 同步

- wish 與 fund 仍是兩個 Firestore records。
- 建立或解除關聯必須由同一個 state mutation 產生同一個 Firestore batch。
- 跨裝置同時編輯同一個 wish 或 fund，仍依現行 revision whole-record choice，不做欄位猜測。
- Rules 目前驗證 record envelope 而不是 wish payload 欄位，因此預期不必改 Rules；仍必須用 Emulator 測試確認。

### 匯入與 schema

- JSON validator 需要允許 `wish.linkedFundId?`。
- normalize 需要清除指向不存在 fund 的 dangling link，或在匯入前拒絕；建議選擇「保留 wish、清除無效 link 並通知」。
- AndroMoney CSV 不包含 wishes 或 funds，不需改格式。
- 這是正式資料形狀變更，即使欄位可選，也應在實作前決定是否提升 `schemaVersion` 並補 round-trip 測試。

## 7. 避免重複計算規則

目標中心只能顯示既有來源，不新增新的帳務總額：

- wish.price 是期望價格，不是支出、負債或預算承諾。
- fund.targetAmount 是規劃目標，不是資產。
- fund.monthlyContribution 已由 budget 計入當月規劃；目標中心不得再次扣除。
- fund events 仍是補入與動用的唯一來源。
- 實際購買仍只由 `txs` 表示。
- linked wish 不得讓 fund-covered expense 再次計入生活支出。

## 8. 文字 wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ 目標中心                       [全部] [準備中] [考慮中]       │
│ 本月可分配到目標  NT$ 8,200   已規劃 NT$ 7,000              │
├──────────────────────────────────────────────────────────────┤
│ 需要注意                                                     │
│ ⚠ 日本旅行：依目前每月提撥，期限前仍差 NT$ 12,000           │
├───────────────────────────────┬──────────────────────────────┤
│ 準備中的目標                  │ 考慮中的目標                 │
│ 日本旅行  42%                 │ 1. 人體工學椅 NT$ 18,000    │
│ 目標 2027-06／每月 5,000      │    [建立準備]                │
│ [查看明細] [調整計畫]         │ 2. 相機 NT$ 32,000           │
│                               │    [建立準備]                │
└───────────────────────────────┴──────────────────────────────┘
```

手機版改為依序顯示摘要、注意事項、準備中、考慮中，不使用左右雙欄。

## 9. 驗收規格

### 階段 A

- 顯示值全部能追溯到 budget、wish 或 fund domain。
- `freeToUse`、fund contribution 與 topup 不因新增視圖而改變。
- wishes 與 funds 的新增、編輯、刪除行為不變。
- 「建立準備」只導向既有建立流程，不宣稱已建立關聯。
- 沒有 wishes 或 funds 時，各區塊顯示清楚的空狀態。
- 不加入羞辱式支出評語或投資建議。
- 手機維持單欄，桌機才使用雙欄。
- JSON export、record codec、Firestore Rules 與 Functions 無變更。

### 階段 B（未批准、未實作）

- 建立 fund 與寫入 link 是單一 commit。
- 刪除 wish 不刪 fund；刪除 fund 會解除 wish 與 transaction links。
- 無效 link 不會造成 wish 或 fund 遺失。
- JSON import/export、record codec、local/UID namespace、revision、tombstone 都有回歸測試。
- 任何 fund-covered expense 仍只在預算中計算未覆蓋部分。

## 10. 測試規劃

階段 A 未來實作時：

- domain tests：分類 active funds、wish candidates、attention items、空狀態。
- traceability tests：目標中心加總不改 `calculateBudgetData()` 結果。
- view tests：HTML escape、進度、警告、空狀態。
- smoke：桌機雙欄、手機單欄、建立準備仍只預填。

階段 B 若獲批准：

- controller tests：原子建立／解除、刪除語意、missing IDs。
- import tests：合法 link、dangling link、舊備份無 link。
- record codec tests：wish 與 fund 兩筆 record round-trip。
- Emulator tests：同 mutation batch、revision conflict、tombstone 不復活。

## 11. 本批結論

建議下一個正式功能是「目標中心階段 A」。它能利用現有 wish、fund 與 budget 資料，先改善決策體驗，不必立即承擔 schema、migration 與同步風險。

月度回顧 2.0 排在其後，優先加入只讀的目標進度摘要；保存下月行動應另立資料模型。退休情境比較適合再下一批，第一版保持 UI-only 且只比較少量情境。

本批附帶 prototype 使用固定假資料，只用來檢查資訊架構與互動文字，不讀取或修改使用者資料。
