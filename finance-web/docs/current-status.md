# 目前工作狀態與下一步

- 最後更新：2026-08-29
- 目前開發分支：`codex/next`
- 本機 `main` 與遠端 `origin/main`：`e01aa1c`
- 正式站已知部署點：`e01aa1c`

這份文件是專案目前的主要交接入口。需要理解長期產品方向時讀
`roadmap.md`；準備部署時讀 `deploy-checklist.md`；修改帳務行為前則必須讀
`accounting-rules.md`、`data-model.md` 與 `report-traceability.md`。

## 目前結論

`codex/next` 已於 2026-08-29 完成候選功能整併與正式上線前的自動化驗證。候選發布範圍包含帳戶中心／信用卡、月度回顧 2.0、財務導航、退休情境與護欄提領來源、生活紀錄提醒、裝置資料清理前端流程，以及 PWA／同步衝突保護。管理 Functions 雖已完成 v7 本機實作與 Emulator 測試，仍明確排除在本次發布範圍之外；Firestore Rules 沒有變更，也不需要部署。

完整 `npm test` 已通過：正式打包 82 個檔案、正式與驗收包啟動、驗收隔離、Auth／Firestore／Functions Emulators 20/20，以及 UI smoke 15/15。另以強制離線驗收版實際檢查桌機與 390px 手機畫面；總覽、記帳／搜尋／生活提醒、帳戶中心、退休護欄、衝突復原中心空狀態與裝置清理第一段提示均無水平溢位，且未執行真正清除。

目前只剩一次整併後人工驗收。驗收請使用 `docs/release-candidate-acceptance-2026-08-29.md`；通過後才合併 `main`、推送、等 GitHub CI，再以受保護命令部署 Hosting。現階段尚未合併、推送或部署。

正式版與本機驗收版已完成程式層隔離。`main` 固定停在目前正式站安全點
`e01aa1c`；尚未發布的帳戶中心、月度回顧 2.0、財務導航、退休情境與後續候選
集中在 `codex/next`。本機驗收版由 `.acceptance-public` 專用打包產生，強制停用
Firebase、Google 登入、雲端 queue 與 PWA，並使用 `fin_v7:acceptance:*` localStorage
及獨立 IndexedDB。它不會讀取、覆蓋或遷移正式版的本機資料。

本機候選另完成 PWA 更新保護：JavaScript／CSS 改為 network-first；偵測到等待中的新版時顯示「立即更新／稍後」，只有使用者按下立即更新後才啟用新 Service Worker 並重新載入一次。同步衝突也新增兩個隔離瀏覽器的 Auth／Firestore Emulator 端到端測試，已自動證明相同資料不提示、不建立復原紀錄且不下載 JSON；真正差異只提示一次，並在保留雲端前把本機落敗版本存入 UID scope 的 IndexedDB。

正式 Hosting 部署現在必須使用 `npm run deploy:hosting:production`。部署保護會要求
明確確認、位於 `main`、`HEAD == origin/main`、finance-web tracked worktree 乾淨，且
Firebase 專案與 runtime 均為正式設定；直接執行 `firebase deploy --only hosting`
會在 Hosting predeploy 被阻止。

衝突復原中心與「相同資料不誤判衝突」已於 2026-08-23 推送、通過 CI、部署 Hosting 並完成正式站唯讀檢查。現在選擇「保留雲端」或「保留本機」時，落敗版本會存入裝置內 IndexedDB，不再自動下載大量備份檔。

帳戶中心與信用卡管理目前為本機驗收版：不新增頂層分頁，在資產負債頁提供帳戶卡片、信用卡週期與額度、交易明細及需確認的對帳調整。此功能尚未推送或部署。

月度回顧 2.0 亦已完成本機實作：在原有月度摘要內加入預設收合的「與上期比較」，用相同天數比較收入、生活支出、準備提撥／補入、動用準備及最大支出分類變化。它完全由既有 `txs`、預算與準備資料推導，不評分、不自動下結論，也不新增同步欄位。

本晚再完成兩個預設收合的本機候選：月度回顧內的「財務導航」只整理收入、生活支出、資產、負債四個既有數字與兩個不保存答案的自評問題；退休頁的「情境比較」只比較目前設定、延後三年退休及每月提領降低 10%。兩者都是只讀推導，不新增持久化欄位、不改同步或 Firestore 規則，也不把結果當成評分、投資建議或保證。

退休頁另完成護欄年度檢查與提領來源本機候選：交叉採用 Guyton-Klinger 年度決策規則，要求輸入目前／目標股票、債券、現金配置，並把網站既有緊急預備金作為需明確勾選的備援來源。股票負報酬時，試算先用現金、債券與獲准動用的預備金，其他來源不足才列出賣股；畫面也顯示 1–2 年等自訂預備金目標的金額與缺口。這些設定不保存、不建立交易、不改同步格式。

2026-08-29 額度更新前本機批次新增三項候選：記帳頁的「生活紀錄提醒 A」由全部歷史 `txs` 推導最近日期、平均間隔與下次日期，條件不保存、不影響報表；「清除此裝置的帳務資料」只清目前 local／UID 的 snapshot、rollback、outbox、復原紀錄與 Firebase 離線快取，採兩段式中文確認且不刪雲端；管理 Functions 已能辨識 v6／v7、排除 tombstone 並對單一 UID 遞迴刪除，但仍維持不部署。

發布前穩定批次已於 2026-08-10 完成、推送並部署。Firestore v7 rules 與 Firebase
Hosting 均已發布到 `financial-computer`，正式網址為
`https://financial-computer.web.app`。Firebase Functions 依既定決策保持不部署。

## 已完成（含已發布與本機候選）

### 產品功能

- 月度回顧 2.0：摘要、來源明細與同天數前期比較（本機待驗收）。
- 財務導航摘要 A：四個既有量化來源與兩個非評分自評問題（本機待驗收）。
- 退休情境比較 A：三種單一變因情境與耗盡／最低需求參考（本機待驗收）。
- 退休護欄與提領來源：年度提領決策、目前／目標配置、緊急預備金年數與來源順序（本機待驗收）。
- 待購項目預填大額準備表單；目前只預填，不會自動建立 fund、交易或事件。
- 生活紀錄提醒 A：以關鍵字及自行輸入的天數推導過往事件間隔，最近三筆可開啟既有交易詳情；條件不保存、不同步（本機待驗收）。

### 資料安全與同步

- 正式入口不再接受 smoke query 寫入測試資料。
- Hosting 改用允許清單建立 `.firebase-public`，排除測試、文件、規則、Functions
  原始碼與 EPUB。
- 同一 UID 的雲端寫入改為序列 queue，避免快速連續修改並行覆寫整份 state。
- localStorage 已分成未登入 `local` 與 Firebase `uid` namespace。
- Firestore v7 已加入 record-level documents、revision、migration fence、deletion
  tombstone、UID outbox 與同一 record 的整筆衝突選擇。
- 管理 Functions 本機候選已支援 v7 active／preparing 判讀、有效紀錄／tombstone 統計及 UID app scope recursive delete；管理者除了信箱白名單還必須完成 Email 驗證，且 `account`／`full` 會在任何刪除前阻止管理者刪除自己。Auth／Firestore／Functions Emulator 會驗證權限與刪除隔離。Functions 仍未部署。
- 裝置資料清理本機候選只作用於目前 scope；有未同步資料時預設阻止，Firebase 快取或復原資料失敗時 fail closed，且主要 snapshot 最後才刪除。

### 工程品質與維護性

- 根目錄 `npm test` 已整合語法、單元、Firestore/Functions Emulator 與 15 個 UI
  smoke scenarios。
- 單元測試 runner 會自動納入新的 `tests/*.test.mjs|js`（排除需專用環境的 acceptance／emulator tests），不再靠人工維護長清單。
- `bootstrap.js` 的 DOM 對照表與瀏覽器檔案操作已拆出，並新增 index DOM 完整性與 Object URL 釋放測試；smoke legacy seed 也集中成單一 helper。
- GitHub Actions 已使用 Node 20、Temurin 21 與 `demo-finance-web`。
- 資產負債 controller 第一批已完成，並有 10 項 characterization tests。
- `actions.js` 不再持有資產負債編輯狀態；完整 state replacement 前會 reset
  controller，避免 UID 或遠端資料切換後沿用舊 editing ID。
- 待購清單 controller 已完成 wish CRUD、排序、分類預算清理與編輯狀態抽取，並有
  10 項 characterization tests；`prepareFundFromWish` 仍留在 actions bridge。
- GitHub Actions workflow 已將 `actions/setup-java` 從 v4 升級到 v5；需等下次 push
  後由 GitHub runner 確認棄用警告消失。
- 準備金 controller 抽取前的 characterization tests 已加入，先鎖定 fund CRUD、
  events 保留、刪除解除交易連結、topup、wishlist prefill 與 open behavior。

## 最近驗證結果

2026-08-29 候選功能整併與正式上線準備：

- `npm test` 全數通過：語法與全部 unit、正式打包 82 個檔案、正式版 smoke、驗收隔離 2/2、驗收版 smoke、Emulators 20/20、UI smoke 15/15。
- 瀏覽器以 `http://127.0.0.1:4186` 的強制離線驗收包檢查核心入口；驗收標示、登入停用、復原中心零紀錄說明與裝置清理「不刪雲端」提示均正確。
- 390 × 844 手機寬度檢查總覽、記帳、資產負債與退休頁，`documentElement.scrollWidth` 均等於 viewport，沒有水平跑版。
- 沒有修改功能程式、資料模型、Firestore Rules 或依賴；沒有碰觸正式資料，也沒有執行最後一步裝置清理。
- 既有警告只剩 Functions dependency 版本、Emulator host Node 版本及 `.js` ESM 重新解析效能提示，不影響本次測試結果；依既定限制不在此批升級依賴。

2026-08-29 額度更新前完整本機批次：

- 生活紀錄提醒 domain 4/4、controller 2/2；裝置清理 core 8/8、controller 2/2；Functions Emulator 專項 11/11 通過。
- Functions 測試固定使用 `demo-finance-web` 的 Auth／Firestore／Functions Emulators；未授權／未驗證白名單信箱、管理者自刪阻擋、其他 UID 隔離、v7 precedence、preparing fallback、tombstone 排除及 recursive delete 均有測試。
- 本批沒有新增持久化欄位或依賴，沒有修改 Firestore Rules，沒有讀寫正式 Firestore，也沒有實際執行目前瀏覽器資料清除。
- 語法與全部 unit、正式打包 82 個檔案、正式版 smoke、驗收隔離與驗收版 smoke 均通過；Auth／Firestore／Functions Emulators 合計 19/19 通過。
- 15 個 UI scenarios 最終整批全數通過，包含 AndroMoney 帳戶修復、交易搜尋與不持久化的生活紀錄提醒；headless 瀏覽器使用 Windows swiftshader fallback。
- `git diff --check` 通過；只剩既有 Node 將 `.js` 重新解析為 ESM 的效能警告，以及 Functions dependency／host Node 版本的 Emulator 警告。本批不得推送或部署。

2026-08-29 PWA 與同步衝突自動化強化（本機候選）：

- Service Worker 不再於安裝時直接 `skipWaiting`；新版等待使用者按「立即更新」後才切換，`controllerchange` 也只允許重新載入一次。
- JavaScript／CSS 使用 network-first，避免正式站 HTML 已更新但舊快取程式仍長期顯示舊介面；圖片與字型保留 stale-while-revalidate。
- 新增真實 Chrome／Edge、兩個獨立 profile 與 `demo-finance-web` Auth／Firestore Emulators 的同步測試；涵蓋相同資料零提示、真實差異一次提示、IndexedDB 復原與成功時零緊急 JSON 下載。
- 全部語法與 unit、正式打包 82 個檔案、正式／驗收包啟動、驗收隔離、Auth／Firestore／Functions Emulators 20/20、UI smoke 15/15 與 `git diff --check` 均通過。
- 本批沒有新增依賴或持久化欄位，沒有修改 Rules／Functions，沒有讀寫正式 Firestore；依授權不得推送或部署。

2026-08-24 退休護欄與提領來源本機批次：

- 護欄 domain 專項測試涵蓋 10% 增減、負報酬通膨凍結條件、最後 15 年停用與必要輸入防呆。
- 提領來源專項測試涵蓋上漲超配股票／債券、現金、其餘債券、緊急預備金 opt-in、下跌股票最後使用、配置合計驗證與不修改輸入。
- 全部語法與單元測試、正式打包 75 個檔案、正式與驗收隔離 smoke、Firestore／Functions Emulator 10/10、UI smoke 15/15 均通過。
- 本批不新增持久化欄位、不修改 Firestore Rules、不部署 Functions／Rules／Hosting，也不讀寫正式 Firestore。

2026-08-23 正式版與本機驗收版安全隔離批次：

- 本機 `main` 已對齊 `origin/main` 的正式安全點 `e01aa1c`；三個未發布功能提交保留在 `codex/next`。
- 驗收包不包含 Firebase 設定、管理入口、Service Worker、manifest 或 smoke 原始碼；畫面明示「本機驗收版」。
- 驗收版登入按鈕與雲端同步均停用，localStorage、legacy migration 與衝突復原 IndexedDB 均與正式版隔離。
- 正式部署 guard 已由測試驗證會拒絕錯誤分支、未同步遠端、dirty worktree、錯誤 Firebase 專案或驗收 runtime。
- 完整語法與單元測試、正式打包 74 個檔案、正式版 smoke、驗收隔離測試、驗收版 smoke、Firestore／Functions Emulator 10/10、UI smoke 15/15 與 `git diff --check` 均通過。
- 本批只建立本機程式與提交，不推送、不部署、不建立 Firebase 專案，也不讀寫正式 Firestore。

2026-08-23 正式發布與帳戶中心本機批次：

- `37a7a35`、`e01aa1c` 已推送；GitHub Actions 公開狀態為 passing。
- Firebase Hosting 已部署至 `financial-computer`；首頁與衝突復原模組可讀，smoke 原始碼維持 404。
- Firestore Rules 與 Firebase Functions 未部署。
- 帳戶中心完整本機驗證通過：語法與全部單元測試、發布打包 71 個檔案、Firestore／Functions Emulator 10/10、UI smoke 15/15，以及 `git diff --check`。
- 月度回顧 2.0 完整本機驗證通過：同天數前期範圍、帳務來源不變、最大分類差異與 XSS 跳脫專項通過；全部語法與單元測試、發布打包 71 個檔案、Firestore／Functions Emulator 10/10、UI smoke 15/15 及 `git diff --check` 均通過。
- 財務導航與退休情境候選的完整本機驗證通過：確認四個導航數字沿用既有來源、只提供兩個非持久化問題；退休三個情境每次只改單一條件，且不改動 state 或輸入設定。全部語法與單元測試、發布打包 73 個檔案、Firestore／Functions Emulator 10/10、UI smoke 15/15 及 `git diff --check` 均通過。

2026-08-23 衝突復原中心本機批次執行完整 `npm test`：

- 語法、單元與安全邊界測試：通過。
- Hosting 允許清單打包：69 個檔案，通過。
- Firestore／Functions Emulator：10/10 通過。
- UI smoke scenarios：14/14 通過，包含衝突復原中心介面與事件接線。
- 復原專項另驗證 UID scope 隔離、10 份／30 天清理、選擇性復原、準備金母子完整性、緊急 JSON fallback，以及帳號切換時取消舊查詢。
- 初次登入的本機／雲端比較已改為遞迴排序物件欄位後再比較，避免同一份帳務資料只因 Firestore／localStorage 序列化欄位順序不同而誤跳衝突詢問；真正不同的陣列順序與帳務值仍會被辨識。
- 本批未修改或部署 Firestore Rules、Firebase Functions 或 Hosting。

2026-08-10 發布前穩定批次執行完整 `npm test`：

- 語法與單元測試：通過。
- 資產負債 controller characterization tests：10/10 通過。
- Controller lifecycle tests：2/2 通過。
- Firestore／Functions Emulator：10/10 通過。
- UI smoke scenarios：12/12 通過。
- `git diff --check`：通過。
- GitHub Actions `Finance Web Test`（Node 20）：通過。
- 正式站唯讀驗證：首頁與 `src/main.js` 回傳 200，測試專用
  `src/smoke-scenarios.js` 回傳 404。

2026-08-10 使用者人工驗收：

- 月度回顧：通過。
- 待購預填：通過。
- 資產負債：通過。
- 手機與電腦畫面：通過。

## 尚未完成

- 管理 Functions 的 v7 summary／recursive delete 已在本機完成及通過 Emulator，但沒有部署；正式 `firebase.json` 仍不加入 Functions source 或 `/api/**` rewrite。
- Tombstone 清理期限仍未定義。裝置清理目前刻意只清目前 local／UID scope；不會掃除其他 UID、legacy v6、migration marker 或共用 device-id。
- `data-only` 管理刪除會保留 Auth；仍在線的舊裝置可能再次同步資料。若未來要保證不復活，需另設停寫 fence，不能把 recursive delete 誤當成並行裝置撤銷。
- 帳戶中心與信用卡管理尚待人工驗收、推送與部署。
- 月度回顧 2.0 尚待與帳戶中心一起人工驗收、推送與部署。
- 財務導航摘要與退休情境比較尚待人工驗收；目前只存在本機，不推送、不部署。
- 退休護欄與提領來源尚待人工驗收；目前只存在本機，不推送、不部署，也沒有任何自動交易能力。
- 衝突復原歷史刻意維持裝置本機，不跨裝置同步。
- `codex/next` 的候選功能仍待使用 `.acceptance-public` 人工驗收；驗收通過前不合併到 `main`。

## 已知的小型維護缺口

- 數字型 legacy account ID 刪除與刪除目前編輯項目的 stale state，已在發布前穩定
  批次補測並修正。
- 四條完整 state replacement 路徑已集中使用可測試的 controller lifecycle
  replacer，確保先 reset controller 再替換 store。
- Smoke runner 改用系統分配的可用埠，不再依賴固定 `4185`；一鍵測試已納入現有
  全部 15 個 UI scenarios。
- Node 以 ESM 重新解析部分 `.js` 時會顯示效能警告；不影響目前測試正確性。

## 建議下一步

### 1. 統一人工驗收

- 之後由 Codex 執行 `npm run preview:acceptance`，依 `docs/release-candidate-acceptance-2026-08-29.md` 一次驗收整批候選；完整細項仍保留在 `docs/manual-acceptance-checklist.md`。
- 裝置清理在驗收版只測 acceptance namespace；正式 UID 的登出與 Firestore 離線快取清除需另用可丟棄測試帳號驗證，執行前先匯出 JSON，且不可拿唯一正式資料直接測。
- 驗收版不提供 Google 登入或雲端同步；可匯入正式 JSON 的副本測試，但驗收資料只存在獨立本機 namespace。
- 財務導航重點檢查資訊是否重複、手機捲動距離是否可接受；退休情境重點確認文字容易理解且不會被誤認為保證。
- 驗收前不需要修改資料模型；若未來要保存自評答案或自訂情境，才另行設計同步、遷移與刪除語意。

### 2. 驗收後發布批次

人工驗收通過後，再決定哪些提交合併到 `main`，推送、確認 CI，使用
`npm run deploy:hosting:production` 部署 Hosting 並做發布後唯讀檢查。Firestore
Rules 與 Firebase Functions 都沒有因本批候選而需要部署。
