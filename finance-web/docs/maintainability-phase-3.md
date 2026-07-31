# 維護性第三階段評估

## 結論

可以進行 controller 拆分，但不應一次重寫 `actions.js` 與 `bootstrap.js`。

## 進度

- 第一批資產負債 controller 已完成：編輯狀態、表單 reset、新增、編輯、刪除與 emergency toggle 已移到 `src/app/controllers/balance-sheet-controller.js`。
- `actions.js` 不再持有資產負債編輯狀態；bootstrap 仍透過原本的 actions facade 對接既有 delegated events 與 smoke API。
- 帳號切換、遠端 state replacement、JSON 匯入及未綁定本機資料套回時，會先呼叫 controller `reset()`。
- 已加入直接 characterization tests，鎖定 ID/type、歷史交易不變、category 編輯、驗證／取消無副作用、save/render 次數與 reset identity。
- 尚未處理的已知舊邊界：account delete 仍保留原本的嚴格 ID 比較；numeric legacy account ID 與 dataset string 的不一致應另開小型 bugfix，不混入純搬移。
- 下一批候選為待購清單 controller；開始前仍應先補 characterization tests。

目前 `actions.js` 同時持有多組編輯狀態、DOM 操作、驗證、跨集合帳務變更、render 與保存；`bootstrap.js` 同時負責初始化、UI adapter、事件綁定、匯入、local/cloud scope 與完整 state replacement。單純把函式剪到五個檔案、仍傳入完整 `dom/ui/context`，只會縮短檔案，不會真正降低耦合。

建議採逐一 controller 搬移，每次都保持使用者行為、帳務公式、state shape 與保存時機不變。

## 目標結構

```text
src/app/
  bootstrap.js
  controllers/
    balance-sheet-controller.js
    wishlist-controller.js
    sinking-fund-controller.js
    transaction-controller.js
    import-controller.js
```

`bootstrap.js` 保留：

- composition root 與 controller lifecycle
- Firebase Auth、cloud sync 與 local UID scope
- 完整 state replacement
- tab、filter、retirement 等全域組裝
- controller 間 callback 注入

每個 controller：

- 只取得自己需要的 DOM elements 與 UI callbacks
- 只透過注入的 `store`、保存 callback 和 render callback 改變狀態
- 不直接讀寫 localStorage、Firestore 或 Firebase Auth
- 不直接 import 另一個 controller
- 跨集合帳務變更必須在同一次 `store.update()` 完成

所有 controller 應提供 `reset()`。bootstrap 應集中提供 `resetAllControllers()`，並在 `applyRemoteState`、`switchLocalScope` 與完整 JSON 匯入三條 state replacement 路徑呼叫，避免留下指向舊 state 的 editing ID。

需要切換頁面的 controller 應取得明確的 `navigate(tabId)` callback，不保留依賴 `this` 綁定的 `this.switchTab()` 模式。

## 建議拆分順序

### 1. 資產負債 controller

風險最低，適合第一批。

- 搬移資產、負債、帳戶的新增、編輯、刪除與 emergency toggle。
- 保留 `editingBsId`、`editingBsIsAccount`。
- 不改歷史交易或帳戶 fallback 計算。
- 先補 add/edit 保留 ID、類型鎖定、刪除後交易不變、toggle 與一次保存測試。

### 2. 待購清單 controller

- 搬移 wish CRUD、排序與 category budget cleanup。
- wishlist 先拆、fund controller 尚未建立時，`prepareFundFromWish` 暫留在 `actions.js`／bootstrap bridge。等 fund controller 完成後再改由明確 callback 呼叫，不能讓兩個 controller 直接互相依賴或操作對方 DOM。
- 驗證越界排序無副作用、編輯保持位置、刪除不存在 ID 與 prefill 不改 state。

### 3. 準備金 controller

- 搬移 fund CRUD、topup、表單狀態與 wish prefill。
- 編輯必須保留既有 events。
- 刪除 fund 與解除所有交易 `linkedFundId` 必須是一次原子 state update。
- monthly contribution 仍是預算規劃，不得改成帳戶轉帳。

### 4. 交易 controller

風險最高，應在 fund controller 穩定後處理。

- 搬移交易 CRUD、advance、repayment、類型切換與分類。
- 交易與 `sinkingFunds.events` 的建立／移除必須維持原子操作。
- 建議先把「交易＋fund events」整理成純 application command，再搬 DOM 互動。
- 必須保留 shortfall 的 topup、partial、unlink、cancel 路徑。

### 5. 匯入 controller

最後處理，因為它跨越完整 state replacement、CSV 合併、下載與 modal。

- JSON 匯入只能呼叫 bootstrap 注入的 `replaceWholeState()`。
- CSV update 必須保留本機交易 ID，並同時移除舊 fund events。
- controller 不持有 local/cloud scope。
- 驗證無效 JSON 不改 state、CSV skip/update、account mapping、cancel 與 BOM。

## 進入拆分前的門檻

- `npm test` 必須維持全綠。
- 每一個 controller 搬移前先加 characterization tests。
- Characterization tests 除了 state 結果，也要驗證取消／驗證失敗時 state 不變，以及成功操作只保存一次並只觸發指定 render。
- 一次只搬一個 controller，不同 controller 不平行修改同一段 `actions.js`。
- 第一批只搬 balance-sheet controller，不在同批建立通用 commit abstraction。
- 不在拆分批次同時修改帳務公式、資料 schema、同步協定或 UI layout。
- 每批完成後執行單元測試、Emulator tests 與相關 smoke scenarios。

## 另外發現的 Functions 維護風險

`functions/index.js` 的管理 summary 與 delete API 目前只處理 `data/finance_v6`。v7 啟用後：

- summary 可能顯示沒有資料或筆數為零；
- delete data/full 可能留下 `sync/finance_v7` meta 與 records。

這不應混入 controller 拆分。建議另開一個資料管理安全批次，先定義 v6/v7 summary 與 recursive delete 的明確語意，再用 Auth＋Functions＋Firestore Emulator 測試後實作。

目前 `firebase.emulator.json` 只供本機／CI 載入 Functions；正式 `firebase.json` 不宣告 Functions source，也沒有 Hosting `/api/**` rewrite。在 v7 summary/delete 與同源路由完成前，不應把管理 Functions 納入正式部署。
