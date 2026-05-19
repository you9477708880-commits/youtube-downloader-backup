# 理財網站產品與技術藍圖 / Finance Web Product And Technical Roadmap

最後更新 / Last updated: 2026-05-19  
目前主線 / Current mainline: `main`  
最新主線提交 / Latest main commit: `58ed1a2 整合新功能實驗版本`  
目前部署狀態 / Current deployment status: Firestore rules and Firebase Hosting are deployed to `financial-computer`.

這份文件是目前後續開發的主要藍圖。中文用來方便產品討論，英文用來讓模型與程式維護時更容易快速理解規則。

This document is the main roadmap for upcoming development. Chinese is for product discussion; English is for model and code maintenance.

## 1. 目前產品定位 / Current Product Direction

### 中文

這個專案不是單純記帳頁，而是個人理財作業系統。核心目標是讓使用者能穩定、可理解、可追溯地管理：

- 記帳
- 預算
- 大額支出準備
- 資產負債
- 退休估算
- 本機與雲端資料

目前重點不是把投資模擬做得很花，而是先把帳務事實、預算規劃、準備金事件與退休推估分清楚。

### English

This project is not just a bookkeeping page. It is intended to become a personal finance operating system. The core goal is stable, understandable, and traceable management of:

- Ledger
- Budgeting
- Large-expense funds
- Balance sheet
- Retirement estimates
- Local and cloud data

The current priority is not advanced investment simulation. The priority is to clearly separate accounting facts, budget planning, fund events, and retirement projections.

## 2. 已完成 / Completed

### 中文

以下項目已在 `main` 完成、推送，並已部署到 Firebase Hosting：

- 預算主邏輯改為「大額支出準備 / 基金制」，不再以舊的事後分攤為主。
- 大額準備資料模型已採 `sinkingFunds` + `events`。
- 支出可指定對應大額準備。
- 準備金足夠時，支出會建立 `spend` event，預算頁不重複扣生活支出。
- 準備金不足時，已改成三選一流程：
  - 補足差額
  - 用現有準備金支付一部分，剩下算本月支出
  - 取消指定準備
- 手動補入準備會扣本月可自由運用。
- 刪除 linked transaction 時會清掉對應 `topup` / `spend` events。
- 預算頁大額準備卡片會顯示達標狀態。
- 新增大額準備時會檢查目標月份是否靠每月提撥可達標，提醒但不硬擋。
- 浮點數清洗已補上，避免 `1000` 顯示或儲存成 `999` 類問題。
- 本機資料、匯入資料、雲端資料載入後會統一清洗帳務金額。
- 記帳列表已能顯示準備金支付多少，以及剩下多少算本月支出。
- 大額準備卡片已能反查所有對應交易，並列出原始支出、準備支付與本月支出。
- 已補 headless UI smoke scenario，會實際驗證準備金不足時三選一彈窗能打開並完成選擇。
- 一般交易已支援編輯；若原本連到大額準備，儲存修改時會移除舊連結與舊事件，讓使用者重新決定。
- 已補交易編輯 UI smoke scenario，會驗證 linked fund 交易修改後能清除舊連結與舊事件。
- 大額準備已支援編輯；修改規劃設定時會保留既有事件，但以新設定重算整段規劃提撥。
- 已補大額準備編輯 UI smoke scenario，會驗證設定可修改、事件可保留、提示文字正確。
- `docs/data-model.md`、`docs/accounting-rules.md`、`docs/report-traceability.md` 已更新為中英雙語規則文件。
- smoke test 報告預設寫入暫存資料夾，不再污染 Git 工作區。
- 合併前安全整理已完成：匯入 JSON 深層驗證、XSS 惡意字串回歸測試、localStorage 逐欄位錯誤隔離、HTML 屬性值跳脫、Firestore rules 檔案與部署檢查文件皆已補上。
- Firebase Hosting 安全標頭已補上，包含 `nosniff`、禁止 iframe 嵌入、Referrer Policy、Permissions Policy，以及保守版 CSP。
- Firestore rules 已部署，雲端資料限制為相同 Firebase `uid` 才能讀寫。
- 資料完整性補強已完成：交易、還款與主要前端新增項目的 ID 改為 UUID 優先、刪除帳戶後的歷史交易會歸入 fallback 餘額、交易排序已支援字串 ID、金額顯示與交易建構已加強 NaN 防護。
- 雲端同步監聽器已補 `destroy()` 清理方法，可在未來多次初始化或測試環境中解除 auth 與 Firestore snapshot 監聽。
- `新功能實驗` 已透過 squash merge 整合回 `main`，並已推送到 GitHub 遠端。
- Firebase Hosting 已部署新版，正式網址 `https://financial-computer.web.app` 已更新。

### English

The following items are completed on `main`, pushed, and deployed to Firebase Hosting:

- Budget logic is now centered on large-expense funds instead of legacy after-the-fact spreading.
- Large-expense funds use `sinkingFunds` plus `events`.
- Expenses can be linked to a fund.
- If a fund has enough balance, the expense creates a `spend` event and does not double-count as living expense in the budget page.
- If a fund is insufficient, the flow now offers three choices:
  - Top up the shortfall
  - Use existing fund balance for part of the expense and count the rest as current-month expense
  - Remove the fund link
- Manual fund top-ups reduce current-month free-to-use budget.
- Deleting a linked transaction removes related `topup` / `spend` events.
- Fund cards show target feasibility status.
- Creating a fund checks whether planned monthly contributions can reach the target month; it warns but does not block.
- Money normalization is added to prevent floating-point cases such as `1000` becoming `999`.
- Local, imported, and cloud-loaded data are normalized after loading.
- The ledger now shows how much a fund paid and how much remains as current-month expense.
- Fund cards can now reverse-lookup linked transactions and show original expense, fund-paid amount, and current-month expense.
- A headless UI smoke scenario now verifies that the insufficient-fund three-choice modal opens and can complete a selection.
- Standard transactions now support editing; if a transaction was linked to a fund, saving the edit removes old links and old events so the user can decide again.
- A transaction-edit UI smoke scenario now verifies that editing a linked-fund transaction clears old links and old events.
- Advances now support editing while protecting already-recorded repayments; an edited receivable amount cannot drop below the total already repaid.
- Advance repayments now support editing amount, date, and receiving account within the remaining receivable limit.
- Deleting an advance now also removes its linked repayment rows.
- Advance-edit and repayment-edit UI smoke scenarios now verify those constraints.
- Accounts, manual balance-sheet items, and wishlist items now support editing through their existing forms instead of requiring delete-and-recreate.
- An editing-completeness UI smoke scenario now verifies those three edit flows together.
- Large-expense funds now support editing; changing plan settings preserves existing events but recalculates the full planned-contribution schedule.
- A fund-edit UI smoke scenario now verifies that settings update correctly, historical events stay intact, and the warning text is shown.
- `docs/data-model.md`, `docs/accounting-rules.md`, and `docs/report-traceability.md` are updated as bilingual rule documents.
- Smoke test reports now default to the temporary folder and no longer dirty the Git worktree.
- 合併前安全整理已完成：匯入 JSON 深層驗證、XSS 惡意字串回歸測試、localStorage 逐欄位錯誤隔離、HTML 屬性值跳脫、Firestore rules 檔案與部署檢查文件皆已補上。
- Pre-merge security hardening is complete: deep JSON import validation, malicious-string XSS regression coverage, per-field localStorage error isolation, escaped HTML attribute values, Firestore rules, and deployment checklist updates are in place.
- Firebase Hosting security headers are added, including `nosniff`, iframe denial, Referrer Policy, Permissions Policy, and a conservative CSP.
- Firestore rules are deployed so cloud data can only be read/written by the matching Firebase `uid`.
- Data-integrity hardening is complete: transaction, repayment, and primary client-created entity IDs now prefer UUIDs, transactions from deleted accounts are preserved in a fallback balance, transaction sorting supports string IDs, and transaction construction / money display have stronger NaN protection.
- Cloud sync now exposes `destroy()` cleanup so future repeated initialization or tests can unsubscribe from auth and Firestore snapshot listeners.
- `新功能實驗` was squash-merged back into `main` and pushed to GitHub.
- Firebase Hosting has been redeployed; the production URL `https://financial-computer.web.app` is updated.

## 3. 關鍵設計決策 / Key Design Decisions

### 中文

- `txs` 是交易事實來源。
- `sinkingFunds.events` 是大額準備事件來源。
- `monthlyContribution` 是預算規劃，不是帳戶轉帳。
- `topup` 代表額外補入準備，會扣本月可自由運用。
- `spend` 代表動用準備。
- 支出被準備金覆蓋的部分，不應再重複算進本月生活支出。
- 若未來交易金額被編輯，應先解除原本準備指定，不自動猜測要怎麼改準備金。
- 退休頁目前定位為個人估算器，不是完整投資模擬器。
- 4% 法則只是參考提示，不是主要退休警告邏輯。
- 本機資料目前尚未依 Google `uid` 分流。

### English

- `txs` is the source of truth for actual transactions.
- `sinkingFunds.events` is the source of truth for large-expense fund events.
- `monthlyContribution` is budget planning, not an account transfer.
- `topup` means extra money added to a fund and reduces current-month free-to-use budget.
- `spend` means fund balance was used.
- The portion of an expense covered by a fund must not be counted again as current-month living expense.
- If a linked transaction amount is edited in the future, the fund link should be removed first. The system should not guess how fund events should change.
- The retirement page is currently a personal estimator, not a full investment simulation tool.
- The 4% rule is only a reference hint, not the main retirement warning logic.
- Local data is not yet separated by Google `uid`.

## 4. 立即下一步 / Immediate Next Steps

### 中文

建議優先處理：

1. **交易分類模型升級**
   - 目前核心表單的編輯能力、安全整理、主線合併與正式部署已完成。
   - 下一個 AndroMoney 相容前置條件，是把交易從單一分類欄位升級為 `category` + `subcategory`。

### English

Recommended immediate priorities:

1. **Transaction category model upgrade**
   - Core form editing, security hardening, mainline merge, and production deployment are complete.
   - The next prerequisite for AndroMoney compatibility is upgrading transactions from a single category field to `category` + `subcategory`.

## 5. 中期重構 / Mid-Term Refactors

### 中文

中期應處理：

1. **DOM 與渲染安全整理**
   - 合併前已完成一輪 XSS 與屬性跳脫檢查。
   - 後續若大幅新增 UI，仍建議逐步把純文字區塊改成節點建立與 `textContent`，減少新的 `innerHTML` 風險。

2. **本機儲存錯誤隔離**
   - 合併前已完成逐欄位解析。
   - 後續若資料量變大，可再評估儲存防抖或更完整的本機資料修復工具。

3. **大額準備版本化設定**
   - 目前編輯會直接重算整段規劃。
   - 未來若要只影響之後月份，需要新增版本化或生效月份規則。

4. **匯入 / 雲端資料衝突策略**
   - 登入 Google 時，可詢問使用本機、使用雲端或嘗試合併。
   - 合併前需要明確衝突規則。

### English

Mid-term work:

1. **DOM and rendering safety cleanup**
   - A pre-merge XSS and attribute-escaping pass is complete.
   - If future UI work expands significantly, gradually move pure text regions to node creation plus `textContent` to reduce new `innerHTML` risk.

2. **Local storage error isolation**
   - Per-field parsing is complete.
   - If local data grows large later, consider debounced saving or a more complete local data repair tool.

3. **Versioned fund settings**
   - Current fund edits recalculate the entire plan.
   - A future "future months only" mode would require versioned settings or an effective-month rule.

4. **Import / cloud conflict strategy**
   - On Google sign-in, ask whether to use local data, cloud data, or attempt a merge.
   - Merging requires explicit conflict rules.

5. **AndroMoney compatibility layer**
   - Use AndroMoney CSV as a mobile-compatible interchange format, not as the full website backup format.
   - Upgrade the transaction category model from one field to `category` + `subcategory` so imported AndroMoney data can preserve both levels.
   - On CSV import, ask the user to map AndroMoney account names to website accounts instead of silently creating or guessing accounts.
   - Preserve external identifiers such as `externalSource`, `externalId`, and `externalUid` so repeated imports can detect duplicates and future sync logic has stable references.
   - Export two files for cross-device use:
     - an AndroMoney-compatible CSV containing the transaction layer that mobile apps can understand
     - a website extension JSON containing large-expense funds, fund links, manual balance-sheet items, retirement settings, and other website-only data
   - Website-generated CSV should use UTF-8 with BOM to reduce Excel encoding mistakes, while import should accept both UTF-8 and UTF-8 with BOM.

## 6. 暫緩 / Deferred

### 中文

目前先暫緩：

- 全站桌機版重新布局。
- localStorage 依 Google `uid` 分流。
- 完整投資情境模擬。
- 複雜自動合併本機與雲端資料。
- 舊 `spread / budgetMode` 的全面移除。

暫緩原因：

- 目前更重要的是先穩住金額規則、可追溯性和編輯前置規則。
- 桌機版與投資模擬會擴大範圍，應在核心帳務規則穩定後再做。

### English

Deferred for now:

- Full desktop layout redesign.
- localStorage separation by Google `uid`.
- Full investment scenario simulation.
- Complex automatic local/cloud data merging.
- Full removal of legacy `spread / budgetMode`.

Reason:

- The current priority is stable money rules, traceability, and editing prerequisites.
- Desktop redesign and investment simulation would expand scope and should wait until accounting rules are stable.

## 7. 測試策略 / Testing Strategy

### 中文

持續維護以下測試：

- 語法檢查：

```powershell
Get-ChildItem -Recurse -Filter *.js .\src | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

- Domain tests：

```powershell
node .\tests\domain.test.mjs
```

- Headless smoke test：

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless --port=4184
```

- Headless UI smoke scenario：

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless --scenario=fund-shortfall-choice --port=4185
```

- 交易編輯 UI smoke scenario：

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless --scenario=transaction-edit-unlinks --port=4186
```

- 大額準備編輯 UI smoke scenario：

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless --scenario=fund-edit-recalculates --port=4187
```

重要測試方向：

- 金額不應因浮點誤差從 `1000` 變成 `999`。
- 大額準備完全覆蓋支出時，不重複扣生活支出。
- 大額準備部分覆蓋支出時，只把未覆蓋部分算本月支出。
- 手動補入會扣可自由運用。
- 刪除 linked transaction 會清掉 linked fund events。
- 目標月份不可達時能被偵測與顯示。

### English

Continue maintaining these tests:

- Syntax check:

```powershell
Get-ChildItem -Recurse -Filter *.js .\src | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

- Domain tests:

```powershell
node .\tests\domain.test.mjs
```

- Headless smoke test:

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless --port=4184
```

- Headless UI smoke scenario:

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless --scenario=fund-shortfall-choice --port=4185
```

- Transaction-edit UI smoke scenario:

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless --scenario=transaction-edit-unlinks --port=4186
```

- Fund-edit UI smoke scenario:

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless --scenario=fund-edit-recalculates --port=4187
```

Important test directions:

- Money should not become `999` because of floating-point errors when it should be `1000`.
- A fully fund-covered expense should not double-count as living expense.
- A partially fund-covered expense should count only the uncovered portion as current-month expense.
- Manual top-ups should reduce free-to-use budget.
- Deleting linked transactions should remove linked fund events.
- Unreachable target month plans should be detectable and visible.

## 8. 相關文件 / Related Documents

### 中文

後續維護時，請搭配閱讀：

- `docs/data-model.md`
- `docs/accounting-rules.md`
- `docs/report-traceability.md`
- `docs/archive/agent-handoff-2026-05-04.md`（歷史交接參考）

若文件衝突，優先順序建議為：

1. `docs/accounting-rules.md`
2. `docs/data-model.md`
3. `docs/report-traceability.md`
4. `docs/roadmap.md`
5. `docs/archive/agent-handoff-2026-05-04.md`

### English

For future maintenance, read together with:

- `docs/data-model.md`
- `docs/accounting-rules.md`
- `docs/report-traceability.md`
- `docs/archive/agent-handoff-2026-05-04.md` (historical handoff reference)

If documents conflict, recommended priority:

1. `docs/accounting-rules.md`
2. `docs/data-model.md`
3. `docs/report-traceability.md`
4. `docs/roadmap.md`
5. `docs/archive/agent-handoff-2026-05-04.md`

## 9. AndroMoney 相容規劃 / AndroMoney Compatibility Plan

### 中文

AndroMoney CSV 適合作為「手機端交換格式」，但不適合作為網站的完整備份格式。網站需要保留兩層資料：

1. **手機相容層**
   - 以 AndroMoney CSV 承載手機端可理解的交易資料：
     - 收入
     - 支出
     - 轉帳
     - 金額
     - 日期
     - 主分類
     - 子分類
     - 帳戶
     - 備註

2. **網站擴充層**
   - 以網站自己的 JSON 保留 AndroMoney 無法表達的資料：
     - 大額支出準備
     - `linkedFundId`
     - `topup` / `spend` events
     - 手動資產負債
     - 退休設定
     - 未來的同步與來源追蹤欄位

實作順序：

1. 先把交易分類模型從單一欄位升級為：

```js
{
  category,
  subcategory
}
```

2. 補舊資料遷移，讓既有只有單層分類的資料仍可正常顯示。
3. 建立 AndroMoney CSV 匯入：
   - 自動辨識格式
   - 先顯示匯入預覽
   - 匯入時由使用者手動對應帳戶名稱
   - 完整保留主分類與子分類
   - 以 `externalSource` / `externalId` / `externalUid` 避免重複匯入
4. 建立 AndroMoney 相容 CSV 匯出：
   - 只輸出手機端可理解的交易層
   - 不把網站專屬的大額準備事件硬塞進 CSV
5. 建立雙檔案匯出：
   - `AndroMoney.csv`
   - `finance-web-extension.json`
6. 網站自行產生的 CSV 預設使用 UTF-8 with BOM，降低 Excel 直接開啟時的亂碼機率；匯入時同時接受 UTF-8 與 UTF-8 with BOM。

開發參考樣本目前放在 `docs/samples/AndroMoney.csv`，用途是檢查格式，不代表正式產品資料。

### English

AndroMoney CSV should be treated as a mobile-compatible interchange format, not as the website's full backup format. The product should keep two data layers:

1. **Mobile-compatible layer**
   - AndroMoney CSV carries the transaction data that mobile apps can understand:
     - income
     - expense
     - transfer
     - amount
     - date
     - category
     - subcategory
     - accounts
     - note

2. **Website extension layer**
   - The website keeps a separate JSON file for data that AndroMoney cannot represent:
     - large-expense funds
     - `linkedFundId`
     - `topup` / `spend` events
     - manual balance-sheet items
     - retirement settings
     - future sync and provenance fields

Recommended implementation order:

1. Upgrade the transaction category model from one field to:

```js
{
  category,
  subcategory
}
```

2. Add migration logic so older single-category data still renders correctly.
3. Implement AndroMoney CSV import:
   - auto-detect the format
   - show a preview before committing
   - ask the user to map account names manually during import
   - preserve both category levels
   - use `externalSource` / `externalId` / `externalUid` to prevent duplicate imports
4. Implement AndroMoney-compatible CSV export:
   - export only the transaction layer that mobile apps understand
   - do not force website-only large-expense fund events into the CSV
5. Implement paired export files:
   - `AndroMoney.csv`
   - `finance-web-extension.json`
6. Website-generated CSV should default to UTF-8 with BOM to reduce Excel encoding mistakes, while import should accept both UTF-8 and UTF-8 with BOM.

The current development sample is stored at `docs/samples/AndroMoney.csv` for format inspection only; it is not product data.
