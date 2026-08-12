# 搜尋紀錄階段 A 實作紀錄

日期：2026-08-13

## 已交付

- 記帳頁交易列表上方新增關鍵字搜尋。
- 搜尋備註、主分類、子分類、交易類型、代墊對象、帳戶名稱及關聯準備金名稱。
- 支援近 6 個月、近 1 年、全部時間與自訂日期。
- 顯示命中筆數、最近一次、距今天數與最近兩次間隔。
- 中文與英文皆採 Unicode NFKC 正規化；多個詞必須全部命中，可跨欄位組合。
- 輸入使用 200ms debounce；期間切換與清除立即更新。
- 搜尋結果沿用既有交易列及修改、刪除、代墊還款、準備金查看操作。

## 與目標中心 A 的隔離

搜尋期間由 transaction search controller 獨立持有，不修改全站 `f-start`／`f-end`。搜尋輸入只重繪記帳列表，不呼叫 `renderAll()`，因此不重算或改變目標中心、月度回顧及總覽期間。

介面在未搜尋與搜尋中都明確標示「搜尋期間不影響月度報表」；自訂日期仍按需顯示，避免兩套日期控制同時形成不必要的首屏負擔。

端到端 smoke 會先把目標中心切到「考慮中」，再執行近 6 個月與近 1 年搜尋，確認目標中心 HTML、篩選狀態及全站報表日期全部不變。

## 資料安全

本階段沒有修改 state schema、schemaVersion、normalize、JSON 匯入匯出、AndroMoney 欄位、localStorage namespace、record codec、Firestore Rules 或 Functions。

- 搜尋只讀取現有 `txs`。
- AndroMoney `externalId`、UID 等內部來源欄位不提供一般搜尋。
- 搜尋字與搜尋期間不保存、不上雲。
- UID 切換、JSON 匯入或其他整份 state replacement 會先 reset 搜尋 controller。
- 搜尋摘要只顯示紀錄日期間隔，不提供醫療或保養建議。

## 自動驗收

- domain tests：文字正規化、多詞 AND、跨欄位、日期邊界、日期間隔、內部欄位排除及 state 不變。
- controller tests：報表／搜尋期間隔離、debounce、自訂日期、清除與 lifecycle reset。
- event tests：搜尋輸入、期間與清除只路由至搜尋 controller。
- smoke：搜尋近半年／一年、摘要、清除及目標中心隔離。
- 完整 `npm test`：語法、單元、Hosting artifact、Firestore／Functions Emulators 與 13 個 UI smoke scenarios。
