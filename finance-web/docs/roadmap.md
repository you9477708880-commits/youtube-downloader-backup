# 理財網站產品與技術藍圖 / Finance Web Product And Technical Roadmap

最後更新 / Last updated: 2026-07-31
目前主線 / Current mainline: `main`  
最新已部署安全點 / Latest deployed safety point: `6a994bd 整理核心頁面桌機工作區`
目前部署狀態 / Current deployment status: Firestore rules and Firebase Hosting are deployed to `financial-computer`; latest deployed finance-web commit is `6a994bd`. The monthly-review prototype and wishlist-to-fund prefill are local post-deployment changes until a later GitHub push and Firebase Hosting deploy are explicitly performed.

這份文件是後續開發的長期藍圖。最新本機、遠端、部署狀態與立即下一步以
`docs/current-status.md` 為準。中文用來方便產品討論，英文用來讓模型與程式維護時
更容易快速理解規則。

This document is the long-term roadmap. Use `docs/current-status.md` for the latest
local, remote, deployment, and immediate-next-step status. Chinese is for product
discussion; English is for model and code maintenance.

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
- 現金流量表已改為納入所有非投資類別收入，避免自訂收入分類在現金流頁漏算。
- 雲端同步監聽器已補 `destroy()` 清理方法，可在未來多次初始化或測試環境中解除 auth 與 Firestore snapshot 監聽。
- 交易分類模型升級第二階段已完成：新增 / 編輯交易表單已拆成「主分類 + 子分類」，子分類支援常用建議與自由輸入；帳本、交易明細與預算來源描述會顯示兩層分類，舊 `cat` 仍保留作為相容欄位。
- `新功能實驗` 已透過 squash merge 整合回 `main`，並已推送到 GitHub 遠端。
- Firebase Hosting 已部署新版，正式網址 `https://financial-computer.web.app` 已更新。
- 分類預算清理工具已完成：可列出孤立的 `settings.catBudgets` 項目，並由使用者確認後清理；預設分類、自訂分類與仍被歷史交易使用的分類不會被誤刪。
- DOM 與渲染安全整理已完成第二輪：補強大額準備選單 `value` 屬性跳脫，並把 XSS 回歸測試擴大到帳本、總覽、現金流、資產負債、預算來源、大額準備與待購清單。
- 專案內 smoke runner 已建立：不再依賴外部 `test-server.js`，會使用乾淨暫存瀏覽器資料夾，並在 Chrome / Edge 與多種 headless 啟動策略間自動重試。
- 本機 / 雲端資料覆蓋策略已明確化：登入後若本機與雲端都有資料且內容不同，會詢問使用者要用雲端覆蓋本機，或用本機覆蓋雲端；目前不做自動合併。
- 大額準備計畫變更規則已採安全版本：短期保留現行「修改設定會重算整段規劃」模型，只在 UI 與文件中明確提醒；未加入 `plan_changed` 或設定版本化。
- 桌機版核心頁面工作區整理第一輪已完成：總覽、記帳、預算分配、現金流、資產負債與退休頁已新增頁面級 workspace wrapper，桌機 `900px+` 會套用專屬工作區排版；手機維持原本單欄流程。已補 `desktop-core-layout` smoke scenario。

以下項目已在本機完成，但尚未推送或部署：

- 月度回顧原型已完成：總覽頁新增只讀摘要卡片，顯示本月收入、生活支出、大額準備提撥 / 補入、動用準備、可自由運用、帳本淨額、目前淨值與應收代墊；計算沿用既有預算與資產負債 domain，避免重複計算大額準備覆蓋支出。
- 待購清單與大額準備第一步整合已完成：待購項目可一鍵帶入大額準備表單，預填名稱、目標金額、每月提撥、分類與備註；此流程只預填表單，不直接新增 fund、不建立交易、不產生 `topup` / `spend` event。
- 資料安全邊界已在本機補強：正式入口不再接受 `?smoke=` 執行測試資料覆寫；smoke runner 改由本機伺服器注入獨立測試入口；Firebase Hosting 改為部署前建立允許清單式 `.firebase-public`，排除文件、測試、Functions、規則、EPUB 與 smoke scenarios。需在使用者確認後重新部署 Hosting，線上站才會套用此安全邊界。
- 同一登入帳號的雲端寫入已在本機改為序列 queue：快速連續修改不再並行寫入整份 state，而是在目前寫入後只補寫最新狀態；寫入期間收到的遠端快照會暫存並比對本機送出狀態，以辨識 server echo；帳號切換會停用舊 queue，並等新 `uid` 第一個 snapshot 解析後才開放保存；重新上線不會無條件覆蓋雲端。此階段不加入自動合併，也不改帳務資料模型。
- 第三、四階段同步整理已在本機完成：localStorage 改為 `local` / Firebase `uid` 單一 snapshot 分區；舊 `fin_v6_*` 只搬到未綁定 local；Firestore 新增 v7 meta、record-level documents、revision rules、deletion tombstones、UID outbox、整筆衝突選擇與 v6 驗證遷移。尚未 push、部署 Hosting 或部署新版 Firestore rules。
- 本機測試基礎已補齊：根目錄 `npm test` 會執行語法、單元、Firestore/Functions Emulator 與全部 12 個 UI smoke scenarios；smoke runner 由系統分配可用埠；GitHub Actions 使用 Node 20、Temurin 21 與固定 `demo-finance-web`。維護性第三階段已完成只讀評估，建議依資產負債、待購清單、準備金、交易、匯入的順序逐一拆 controller。
- 維護性 controller 拆分第一批已在本機完成：資產負債 CRUD、編輯狀態與 emergency toggle 已從 `actions.js` 搬到獨立 controller，bootstrap 保留組裝與原 actions facade；characterization tests 會驗證歷史交易不變、取消無副作用及每次成功操作只 save/render 一次。

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
- Cash-flow reporting now includes all non-investment income categories, so custom income categories are not dropped from the cash-flow page.
- Cloud sync now exposes `destroy()` cleanup so future repeated initialization or tests can unsubscribe from auth and Firestore snapshot listeners.
- Transaction category model upgrade phase 2 is complete: add/edit transaction forms now separate primary category and subcategory, subcategories support suggestions plus free-form input, and ledger/detail/budget source descriptions show both levels. Legacy `cat` remains as a compatibility field.
- `新功能實驗` was squash-merged back into `main` and pushed to GitHub.
- Firebase Hosting has been redeployed; the production URL `https://financial-computer.web.app` is updated.
- Category-budget cleanup is complete: the app can list orphaned `settings.catBudgets` entries and remove them after user confirmation; default categories, custom categories, and categories still referenced by historical transactions are preserved.
- DOM and rendering safety cleanup phase 2 is complete: large-expense fund option `value` attributes are escaped, and XSS regression coverage now includes ledger, overview, cash flow, balance sheet, budget source items, large-expense funds, and wishlist rendering.
- A project-local smoke runner is implemented: it no longer depends on the external `test-server.js`, uses a clean temporary browser profile, and retries Chrome / Edge with multiple headless launch strategies.
- The local / cloud overwrite strategy is explicit: if both local and cloud data exist after sign-in and differ, the user chooses whether cloud overwrites local or local overwrites cloud; automatic merging is not implemented.
- Large-expense fund plan-change rules now use the safe version: keep the current "editing settings recalculates the whole plan" model in the short term, explain it in UI and docs, and do not add `plan_changed` or settings-versioning yet.
- Desktop core-page workspace cleanup phase 1 is complete: overview, ledger, budget allocation, cash flow, balance sheet, and retirement now have page-level workspace wrappers. Desktop `900px+` uses scoped workspace layouts, while mobile keeps the existing single-column flow. A `desktop-core-layout` smoke scenario is added.

The following item is complete locally, but is not yet pushed or deployed:

- The monthly review prototype is complete: the overview page now has a read-only summary card for monthly income, living expenses, large-expense fund contribution / top-up, fund usage, free-to-use budget, ledger net, current net worth, and advance receivables. Calculations reuse existing budget and balance-sheet domain logic to avoid double-counting fund-covered expenses.
- The first wishlist-to-fund integration step is complete: a wishlist item can prefill the large-expense fund form with name, target amount, monthly contribution, category, and note. This only pre-fills the form; it does not directly create a fund, create a transaction, or create `topup` / `spend` events.
- Local data-safety boundaries are hardened: the production entry no longer accepts `?smoke=` to seed test data; the smoke runner injects a separate test entry only from its local server; Firebase Hosting now builds an allowlisted `.firebase-public` directory that excludes docs, tests, Functions, rules, EPUB files, and smoke scenarios. Hosting must be redeployed after user confirmation before the live site receives this boundary.
- Cloud writes for one signed-in user now use a local serial queue: rapid edits no longer write the whole state concurrently and instead append only the latest state after the active write; remote snapshots received during a write are retained and compared with submitted local states to identify server echoes; account changes retire the old queue and wait for the new `uid`'s first snapshot before enabling saves; reconnecting does not unconditionally overwrite cloud data. This phase does not add automatic merging or change the accounting data model.
- Sync phases 3 and 4 are complete locally: localStorage now uses one snapshot per unbound local / Firebase UID namespace; legacy `fin_v6_*` data migrates only to unbound local storage; Firestore v7 adds meta state, record-level documents, revision rules, deletion tombstones, a UID-scoped persisted mutation outbox, whole-record conflict choices, and verified v6 migration. These changes are not pushed or deployed, and the new Firestore rules are not live yet.

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
- 本機資料已分成未登入 `local` 與 Firebase `uid` namespace；舊 `fin_v6_*`
  只遷移到未綁定 local，不會自動歸入 Google 帳號。

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
- Local data is separated into the signed-out `local` namespace and Firebase `uid`
  namespaces. Legacy `fin_v6_*` data migrates only to unbound local storage.

## 4. 立即下一步 / Immediate Next Steps

### 中文

立即工作順序與目前提交狀態集中維護在 `docs/current-status.md`。目前建議：

1. **完成發布前穩定批次**
   - numeric legacy ID、stale edit 與 state replacement reset 的自動測試與修正已完成。
   - 2026-08-10 已依 `docs/manual-acceptance-checklist.md` 完成四項人工驗收並全數通過。

2. **再決定 push 與分階段部署**
   - `main` 目前包含尚未發布的資料安全、同步、測試與產品功能。
   - Firestore rules 與 Hosting 應分別檢查、分別部署；Functions 暫不部署。

3. **發布安全點後才繼續 controller 拆分**
   - 下一個候選是待購清單 controller，仍先補 characterization tests。
   - 在定義防重複計算規則前，不增加 wishlist 與 fund 的正式雙向 linking。

### English

The immediate work order and current commit status are maintained in
`docs/current-status.md`. The current recommendation is:

1. **Complete the pre-release stabilization batch**
   - Automated coverage and fixes for numeric legacy IDs, stale edit state, and state
     replacement reset are complete.
   - All four manual acceptance checks in `docs/manual-acceptance-checklist.md` passed
     on 2026-08-10.

2. **Then decide on push and staged deployment**
   - The local mainline contains unreleased security, sync, test, and product changes.
   - Review and deploy Firestore rules and Hosting separately. Keep Functions undeployed.

3. **Resume controller extraction after a release safety point**
   - Wishlist is the next candidate and should receive characterization tests first.
   - Do not add formal wishlist/fund bidirectional linking before anti-double-counting
     rules are defined.

## 5. 中期重構 / Mid-Term Refactors

### 中文

中期應處理：

1. **DOM 與渲染安全整理**
   - 第二輪已完成、推送並部署。
   - 後續若大幅新增 UI，才需要逐步把純文字區塊改成節點建立與 `textContent`，減少新的 `innerHTML` 風險。

2. **本機儲存錯誤隔離**
   - 合併前已完成逐欄位解析。
   - 後續若資料量變大，可再評估儲存防抖或更完整的本機資料修復工具。

3. **大額準備計畫變更規則**
   - 短期已採安全版本：保留目前直接重算整段規劃的計算方式，並用 UI / 文件提醒使用者。
   - 不優先做完整「設定檔版本化」，避免把大額準備計算變成難以理解的多版本模型。
   - 若未來要讓設定只影響之後月份，應採明確的 `plan_changed` 事件或生效月份規則：過去月份鎖定，未來月份套用新參數。
   - 實作前必須先定義回溯顯示、預算推算與刪改規則。

4. **匯入 / 雲端資料衝突策略**
   - 登入 Google 時若本機與雲端不同，先只提供明確覆蓋選項：「以雲端資料覆蓋本機」或「以本機資料覆蓋雲端」。
   - 在具備每筆資料 `updatedAt`、刪除墓碑或交易日誌回放能力前，不做自動合併。
   - 未來若要合併，必須先定義單筆資料衝突規則與可回復機制。

5. **分類預算資料清理**
   - 清理工具已完成、推送並部署。
   - 後續只需在分類模型或分類設定大改時，確認清理規則仍符合新的分類來源。

6. **桌機版核心頁面工作區整理**
   - 第一輪已完成、推送並部署；後續只在發現具體桌機使用痛點時再做小步整理。
   - 目標：讓桌機版成為適合長時間整理資料與檢查數字的工作區，而不是放大的手機版。
   - 原則：不做全站一次性大改版；只新增頁面級 wrapper/class 與桌機斷點；不要改 `.card`、`.grid-2`、`.grid-3`、`.grid-4` 等全站共用基礎規則。
   - 樣式位置：目前沒有 `src/styles.css`；實際樣式拆在 `assets/styles/base.css`、`assets/styles/layout.css`、`assets/styles/components.css`、`assets/styles/tokens.css`。
   - 手機保護：手機仍維持單欄卡片流、橫向可捲 tab、`app-content` 自己垂直捲動、長文字 ellipsis / overflow 防護；任何桌機整理都應限制在 `@media (min-width: 900px)` 或頁面專屬 class。
   - 不改範圍：第一輪不改帳務計算、資料模型、本機 / 雲端同步、AndroMoney 匯入匯出、大額準備三選一流程、退休推估邏輯。

   分階段計劃：

   1. **Baseline 與測試保護**
      - 先記錄目前桌機與手機核心頁面狀態。
      - 補或確認 `desktop-core-layout` 類型 smoke scenario：至少切換總覽、記帳、預算、現金流、資產負債、退休 tab，確認核心容器存在。
      - 手動測試資料要包含長帳戶名、長分類、長備註、自訂收入、投資收入、代墊、刪除帳戶 fallback、大額準備部分支付與退休連動資產。

   2. **記帳頁工作區**
      - 在 `#t-lg` 加頁面級桌機 layout shell。
      - 桌機改成左側新增 / 編輯交易表單、右側交易列表；手機 DOM 順序與視覺順序維持表單在前、列表在後。
      - 交易列表桌機版可讓金額、帳戶、操作區寬度更穩定，但必須保留大額準備 trace、編輯、刪除、代墊收款等操作。
      - 若要做 sticky 表單，必須額外驗證 linked fund 編輯後的提示、scroll 行為與不足準備 modal。

   3. **預算分配與大額準備工作區**
      - 在 `#t-wl` 加頁面級桌機 layout shell。
      - 桌機優先整理「本月預算摘要 / 來源明細」與「大額支出準備表單 / 清單」的左右工作區。
      - 大額準備卡片可提升資訊階層與展開內容密度，但保留 `<details>` 語意、既有 `data-action` 與事件計算。
      - 分類預算與待購清單放入次要區，後續再接目標系統整合，不在第一輪混入產品模型變更。

   4. **總覽與現金流**
      - 總覽桌機版整理期間篩選、四個核心指標、分類支出與最近交易的掃讀順序。
      - 現金流可拆成摘要欄與明細 drill-down 欄，但不改 `summarizeCashFlow()` 計算。
      - 匯入匯出與代墊清單可做次要區安排，避免壓縮核心數字。

   5. **資產負債**
      - 桌機改成左側新增 / 編輯帳戶與手動資產負債表單、右側資產負債報表。
      - 保留帳戶、手動資產、應收代墊、負債、淨值與刪除帳戶 fallback 的可追溯顯示。
      - 不改 `calculateAccountBalances()` 或 `calculateBalanceSheet()` 的計算，只整理工作區。

   6. **退休**
      - 最後處理，因為參數、range control、年度表格與提示文字最多。
      - 桌機可把四個指標固定成上方摘要，參數控制拆成兩欄，年度表格維持可展開 / 可捲動。
      - 繼續分清楚自訂參數推估與 4% 法則參考，不把兩者混成同一套警告。

   7. **驗證與人工檢查**
      - 自動測試：JS syntax check、domain tests、既有 UI smoke suite。
      - 新增或更新 layout smoke 後，確認所有核心 tab 可切換且關鍵容器存在。
      - 手動桌機尺寸：1366x768、1440x900、1920x1080。
      - 手動手機尺寸：375x667、390x844、430x932；若 headless / plugin 截圖與實機觀察衝突，以實機與 DOM/CSS 檢查優先。

7. **月度回顧雛形**
   - 從理財書產品設計筆記中升級為中期候選。
   - 先做簡單、可追溯的月結視圖：收入、生活支出、大額準備、可自由運用、資產負債變化。
   - 不先做複雜建議引擎，只提供使用者自己檢查與回顧的結構。

8. **目標系統整合**
   - 將待購清單與大額支出準備逐步接起來。
   - 初期目標是讓使用者能從待購項目建立或連到大額準備，而不是讓兩套功能各自獨立。
   - 需要避免同一個目標在待購清單、預算與準備金中被重複計算。

### English

Mid-term work:

1. **DOM and rendering safety cleanup**
   - The second pass is complete, pushed, and deployed.
   - If future UI work expands significantly, gradually move pure text regions to node creation plus `textContent` to reduce new `innerHTML` risk.

2. **Local storage error isolation**
   - Per-field parsing is complete.
   - If local data grows large later, consider debounced saving or a more complete local data repair tool.

3. **Fund plan-change rules**
   - The short-term safe version is adopted: keep the current whole-plan recalculation behavior and explain it in UI / docs.
   - Full settings-versioning is not the preferred first step because it would make fund calculations harder to understand.
   - If future edits should affect future months only, use an explicit `plan_changed` event or effective-month rule: past months stay locked and future months use the new parameters.
   - Before implementation, define historical display, budget projection, and edit/delete rules.

4. **Import / cloud conflict strategy**
   - If local and cloud data differ on Google sign-in, first provide only explicit overwrite choices: use cloud data locally, or upload local data over cloud.
   - Do not implement automatic merging until records have `updatedAt`, deletion tombstones, or replayable transaction logs.
   - Future merge support must define per-record conflict rules and recovery behavior first.

5. **Category-budget data cleanup**
   - The cleanup tool is complete, pushed, and deployed.
   - Future work only needs to re-check the cleanup rules if the category model or category settings are significantly changed.

6. **AndroMoney compatibility layer**
   - Use AndroMoney CSV as a mobile-compatible transaction interchange format, not as backup/restore for this website.
   - Upgrade the transaction category model from one field to `category` + `subcategory` so imported AndroMoney data can preserve both levels.
   - On CSV import, ask the user to map AndroMoney account names to website accounts instead of silently creating or guessing accounts.
   - Preserve external identifiers such as `externalSource`, `externalId`, and `externalUid` so repeated imports can detect duplicates and future sync logic has stable references.
   - Full website backup and restore must remain a single complete JSON file that includes both `txs` and website-only data.
   - Do not pair edited CSV files with a separate extension JSON for system restore; that can create mismatched fund links and orphan events.
   - Website-generated CSV should use UTF-8 with BOM to reduce Excel encoding mistakes, while import should accept both UTF-8 and UTF-8 with BOM.

7. **Desktop core-page workspace cleanup**
   - Goal: make desktop feel like a working surface for reviewing and maintaining data, not just a stretched mobile layout.
   - Principles: do not redesign the whole site at once; only add page-level wrappers/classes and desktop breakpoints; do not change global foundation rules such as `.card`, `.grid-2`, `.grid-3`, or `.grid-4`.
   - Style location: there is no `src/styles.css`; current styles live in `assets/styles/base.css`, `assets/styles/layout.css`, `assets/styles/components.css`, and `assets/styles/tokens.css`.
   - Mobile protection: mobile must keep the single-column card flow, horizontally scrollable tabs, `app-content` vertical scrolling, and existing long-text ellipsis / overflow guards. Desktop cleanup should be scoped to `@media (min-width: 900px)` or page-specific classes.
   - Out of scope for the first pass: accounting calculations, data models, local/cloud sync, AndroMoney import/export semantics, the insufficient-fund three-choice flow, and retirement projection logic.

   Phased plan:

   1. **Baseline and test protection**
      - Record the current desktop and mobile state of core pages.
      - Add or confirm a `desktop-core-layout` smoke scenario: at minimum switch through overview, ledger, budget, cash flow, balance sheet, and retirement tabs and confirm key containers exist.
      - Manual test data should include long account names, long categories, long notes, custom income, investment income, advances, deleted-account fallback, partial fund coverage, and retirement-linked assets.

   2. **Ledger workspace**
      - Add a page-level desktop layout shell to `#t-lg`.
      - On desktop, use a left transaction form and right transaction list. On mobile, keep the current DOM and visual order: form first, list second.
      - The desktop transaction list may stabilize amount, account, and action widths, but must preserve fund traces, edit, delete, and advance repayment actions.
      - If sticky form behavior is added, verify linked-fund edit warnings, scroll behavior, and insufficient-fund modal behavior.

   3. **Budget allocation and fund workspace**
      - Add a page-level desktop layout shell to `#t-wl`.
      - Prioritize a desktop workspace between monthly budget summary/source details and large-expense fund form/list.
      - Fund cards may get clearer hierarchy and denser expanded content, but keep `<details>`, existing `data-action`, and current event calculations.
      - Category budgets and wishlist items should be secondary zones first; goal-system integration should wait until the layout pass is stable.

   4. **Overview and cash flow**
      - Reorganize period filters, four core metrics, expense categories, and recent transactions for desktop scanning.
      - Cash flow may split into a summary column and drill-down detail column, but must not change `summarizeCashFlow()`.
      - Import/export and advance lists may move to secondary areas so they do not crowd core numbers.

   5. **Balance sheet**
      - On desktop, use a left add/edit form and right balance-sheet report.
      - Preserve traceable display for accounts, manual assets, advance receivables, liabilities, net worth, and deleted-account fallback.
      - Do not change `calculateAccountBalances()` or `calculateBalanceSheet()` during layout cleanup.

   6. **Retirement**
      - Handle this last because it has the most parameters, range controls, table content, and explanatory text.
      - Desktop can keep four metrics as an upper summary, split controls into two columns, and keep the annual table expandable/scrollable.
      - Continue separating custom-parameter projections from the 4% rule reference.

   7. **Verification and manual checks**
      - Automated tests: JS syntax check, domain tests, and the existing UI smoke suite.
      - After adding or updating layout smoke coverage, confirm all core tabs switch correctly and key containers exist.
      - Manual desktop sizes: 1366x768, 1440x900, 1920x1080.
      - Manual mobile sizes: 375x667, 390x844, 430x932. If headless/plugin screenshots conflict with real-device observation, prioritize real-device checks plus DOM/CSS inspection.

8. **Monthly review prototype**
   - Promote this from the finance-book product notes into a mid-term candidate.
   - Start with a simple and traceable monthly close view: income, living expenses, large-expense funds, free-to-use budget, and balance-sheet changes.
   - Do not build a complex recommendation engine first; provide a structure for user review.

9. **Goal-system integration**
   - Gradually connect wishlist items with large-expense funds.
   - The first goal is to let users create or link a large-expense fund from a wishlist item instead of keeping those features isolated.
   - Avoid double-counting the same goal across wishlist, budget, and fund balances.

## 6. 暫緩 / Deferred

### 中文

目前先暫緩：

- 全站桌機版重新布局。
- 完整投資情境模擬。
- 複雜自動合併本機與雲端資料。
- 舊 `spread / budgetMode` 的全面移除。
- 理財書籍產品設計筆記中的完整遠期體驗功能。

暫緩原因：

- 目前更重要的是先穩住金額規則、可追溯性和編輯前置規則。
- 全站一次性桌機版重設計與完整投資模擬都會擴大範圍，應在核心帳務規則穩定後再做。
- 理財書籍筆記提供的是產品方向參考；其中「月度回顧」與「目標系統整合」已升級為中期候選，其餘仍先作為遠期參考。

遠期產品參考：

- 參考文件：`docs/finance-book-product-design-notes.md`
- 可考慮的方向：
  - 財務階段視圖。
  - 收入、支出、負債、資產、心態、習慣的六要素總覽。
  - 使用者自選的生活品質情境。
  - 月度回顧：理財餘裕、支出調整、目標進度與下月行動。
  - 將待購清單與大額準備整合成更完整的目標系統。
- 這些功能目前只作為遠期設計參考，不列入立即下一步。

### English

Deferred for now:

- Full desktop layout redesign.
- Full investment scenario simulation.
- Complex automatic local/cloud data merging.
- Full removal of legacy `spread / budgetMode`.
- Full long-term experience ideas from the finance-book product design notes.

Reason:

- The current priority is stable money rules, traceability, and editing prerequisites.
- A full-site desktop redesign and full investment simulation would expand scope and should wait until accounting rules are stable.
- The finance-book notes are product-direction references; monthly review and goal-system integration are promoted to mid-term candidates, while the rest remains long-term reference.

Long-term product reference:

- Reference document: `docs/finance-book-product-design-notes.md`
- Possible future directions:
  - Financial-stage view.
  - Six-factor overview: income, expenses, debt, assets, mindset, and habits.
  - User-selected lifestyle scenarios.
  - Monthly review: financial margin, expense adjustments, goal progress, and next-month actions.
  - A more integrated goal system that connects wishlist items and large-expense funds.
- These ideas are long-term design references only and are not part of the immediate next steps.

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
npm run test:smoke
```

- Headless UI smoke scenarios：

```powershell
npm run test:smoke
```

新的 smoke runner 位於專案內，會使用乾淨暫存瀏覽器資料夾，並在 Chrome / Edge 與不同 headless 啟動策略間自動重試。

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
npm run test:smoke
```

- Headless UI smoke scenarios:

```powershell
npm run test:smoke
```

The new smoke runner lives inside the project. It uses a clean temporary browser profile and automatically retries Chrome / Edge with different headless launch strategies.

Important test directions:

- Money should not become `999` because of floating-point errors when it should be `1000`.
- A fully fund-covered expense should not double-count as living expense.
- A partially fund-covered expense should count only the uncovered portion as current-month expense.
- Manual top-ups should reduce free-to-use budget.
- Deleting linked transactions should remove linked fund events.
- Unreachable target month plans should be detectable and visible.

## 8. Git 與部署節奏 / Git And Deployment Cadence

### 中文

開發流程分成三個層級：

1. **本機 commit**
   - 可以相對頻繁。
   - 完成一個小段落、文件整理、測試通過的 bug fix，就可以提交。
   - 目的主要是保留可回復點，不等於正式發布。

2. **遠端 push**
   - 不需要每次小修改都推送。
   - 建議在以下情況推送：
     - 完成一個可描述的功能段落。
     - 完成一批相關 bug fix。
     - 準備部署 Firebase Hosting 前。
     - 一段工作結束，想把本機成果備份到 GitHub。
     - 涉及資安、資料完整性、帳務計算等高風險修正，且已測試通過。
   - 一般文件筆記、小型 roadmap 調整或討論性紀錄，可以先留在本機 commit，累積後再推。

3. **正式部署**
   - 只在需要讓正式網站更新時執行。
   - push 到 GitHub 不代表已部署。
   - 部署前應至少通過語法檢查、domain tests，若牽涉 UI 流程再跑 smoke test。

合理頻率建議：

- 日常開發：本機 commit 可以一天多次，push 約一天結束時一次，或完成一批相關工作後一次。
- 小型文件更新：可累積 2 到 5 筆本機 commit 後再 push。
- 重要 bug / 資安 / 資料完整性修正：測試通過後可以立即 push，但仍不自動部署。
- 正式部署：以「功能穩定、測試通過、使用者確認」為準，不以 commit 數量為準。

預設協作規則：

- 修改與測試可以由 Codex 直接協助完成。
- 若工作可拆分且工具環境允許，可以優先請子代理處理只讀盤點、測試驗證、或不重疊檔案的局部修改，以降低主對話上下文壓縮造成的工作記憶中斷。
- 主對話代理仍負責整體判斷、整合 diff、驗收測試與最終回報；子代理不得自行 push、deploy 或擴大範圍。
- 子代理完成或不再需要時，應主動關閉，避免側邊留下不再使用的代理工作區。
- 本機 commit 前應說明本次提交內容。
- 遠端 push 與 Firebase deploy 都應視為較正式步驟，預設先徵求確認。

### English

The development flow has three separate levels:

1. **Local commits**
   - Can be relatively frequent.
   - Commit after a small completed unit, documentation cleanup, or tested bug fix.
   - The purpose is a local recovery point, not a release.

2. **Remote push**
   - Does not need to happen after every small edit.
   - Push when:
     - A describable feature slice is complete.
     - A related batch of bug fixes is complete.
     - Preparing for Firebase Hosting deployment.
     - Ending a work session and wanting a GitHub backup.
     - Security, data-integrity, or accounting-calculation fixes are tested and should be preserved remotely.
   - Small notes, roadmap tweaks, and discussion records can stay as local commits and be pushed in a later batch.

3. **Production deployment**
   - Run only when the production website should change.
   - Pushing to GitHub does not mean the site is deployed.
   - Before deployment, pass syntax checks and domain tests; run smoke tests when UI flows are affected.

Recommended cadence:

- Daily development: local commits may happen multiple times per day; push once near the end of a work session or after a related batch is complete.
- Small documentation updates: accumulate 2 to 5 local commits before pushing.
- Important bug / security / data-integrity fixes: push after tests pass, but do not deploy automatically.
- Production deployment: based on stable functionality, passing tests, and user confirmation, not commit count.

Default collaboration rule:

- Codex may help edit and test directly.
- When the work can be split and the tool environment supports it, prefer using sub-agents for read-only inspection, verification, or disjoint file-scope edits to reduce context-compression interruptions in the main conversation.
- The main conversation agent remains responsible for judgment, diff integration, test acceptance, and final reporting. Sub-agents must not push, deploy, or expand scope on their own.
- Close sub-agents when they finish or are no longer needed, so unused side workspaces do not remain open.
- Before a local commit, summarize what is being committed.
- Remote push and Firebase deploy are more formal steps and should be confirmed first by default.

## 9. 相關文件 / Related Documents

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

## 10. AndroMoney 相容規劃 / AndroMoney Compatibility Plan

### 中文

AndroMoney CSV 適合作為「手機端交易交換格式」，但不適合作為網站的完整備份或還原格式。完整備份 / 還原只能使用網站自己的單一 JSON，並且該 JSON 必須同時包含 `txs`、大額準備、fund links、手動資產負債、退休設定與其他網站專屬資料。

1. **手機相容層**
   - 以 AndroMoney CSV 承載手機端可理解的交易資料，定位為單向匯入新交易或單向匯出給其他軟體讀取：
     - 收入
     - 支出
     - 轉帳
     - 金額
     - 日期
     - 主分類
     - 子分類
     - 帳戶
     - 備註

2. **網站完整備份層**
   - 以網站自己的單一 JSON 保留 AndroMoney 無法表達的資料，並作為唯一完整還原來源：
     - `txs`
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
   - 新增 schema version 或等價的資料版本欄位。
   - 載入舊資料時強制補齊 `subcategory`，不可讓 UI 收到 `undefined`。
   - 補分類模型相關 domain tests 與 smoke scenario。
3. 建立 AndroMoney CSV 匯入：
   - 核心 CSV 解析已完成，可將付款帳戶轉成支出、收款帳戶轉成收入、同時有付款與收款時轉成轉帳。
   - 解析結果會保留 `category`、`subcategory`、`externalSource`、`externalId`、`externalUid` 與 `externalTime`。
   - 已建立 CSV 匯入 UI：先顯示匯入預覽
   - 匯入時由使用者手動對應帳戶名稱
   - 完整保留主分類與子分類
   - 目前以 `externalSource` / `externalId` 偵測重複匯入，確認匯入時可選擇略過或更新既有外部交易。
   - 更新既有外部交易時會保留原本本機交易 ID；若該交易有大額準備事件，會先移除關聯，讓使用者之後重新指定。
   - CSV 匯入只建立或更新一般交易層，不嘗試與網站完整備份 JSON 合併。
4. 建立 AndroMoney 相容 CSV 匯出：
   - 核心 CSV 產生已完成，網站交易可輸出成 AndroMoney 欄位順序，並保留主分類 / 子分類。
   - 只輸出手機端可理解的交易層
   - 不把網站專屬的大額準備事件硬塞進 CSV
5. 保留單一 JSON 完整備份 / 還原：
   - 不支援 `AndroMoney.csv` + `finance-web-extension.json` 這種雙檔案還原。
   - 若使用者用 Excel 修改 CSV 後再匯入，只把它當成外部交易匯入，不拿來恢復 fund links 或準備事件。
6. 網站自行產生的 CSV 預設使用 UTF-8 with BOM，降低 Excel 直接開啟時的亂碼機率；匯入時同時接受 UTF-8 與 UTF-8 with BOM。

開發參考樣本目前放在 `docs/samples/AndroMoney.csv`，用途是檢查格式，不代表正式產品資料。

### English

AndroMoney CSV should be treated as a mobile-compatible transaction interchange format, not as backup/restore for this website. Full backup/restore must use the website's single complete JSON, and that JSON must include `txs`, large-expense funds, fund links, manual balance-sheet items, retirement settings, and other website-only data.

1. **Mobile-compatible layer**
   - AndroMoney CSV carries transaction data that mobile apps can understand and is only for one-way importing new transactions or one-way exporting for other software:
     - income
     - expense
     - transfer
     - amount
     - date
     - category
     - subcategory
     - accounts
     - note

2. **Website full-backup layer**
   - The website keeps one complete JSON file for data that AndroMoney cannot represent, and this is the only full restore source:
     - `txs`
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
   - Add `schemaVersion` or an equivalent data-version field.
   - When loading old data, force-fill `subcategory`; UI code must not receive `undefined`.
   - Add category-model domain tests and a smoke scenario.
3. Implement AndroMoney CSV import:
   - Core CSV parsing is complete: payment accounts become expenses, receiving accounts become income, and rows with both sides become transfers.
   - Parsed rows preserve `category`, `subcategory`, `externalSource`, `externalId`, `externalUid`, and `externalTime`.
   - CSV import UI is implemented: show a preview before committing
   - ask the user to map account names manually during import
   - preserve both category levels
   - currently use `externalSource` / `externalId` to detect duplicate imports; confirmation can skip or update existing external transactions
   - updating an existing external transaction preserves the local transaction ID; if the transaction has fund events, those links are removed so the user can reassign them later
   - CSV import only creates or updates the transaction layer; it must not merge with the full website backup JSON.
4. Implement AndroMoney-compatible CSV export:
   - Core CSV generation is complete: website transactions can be exported in AndroMoney column order while preserving primary / secondary categories.
   - export only the transaction layer that mobile apps understand
   - do not force website-only large-expense fund events into the CSV
5. Keep single-JSON full backup/restore:
   - Do not support `AndroMoney.csv` + `finance-web-extension.json` as a paired restore format.
   - If the user edits CSV in Excel and imports it later, treat it as external transaction import only, not as fund-link or fund-event restoration.
6. Website-generated CSV should default to UTF-8 with BOM to reduce Excel encoding mistakes, while import should accept both UTF-8 and UTF-8 with BOM.

The current development sample is stored at `docs/samples/AndroMoney.csv` for format inspection only; it is not product data.
