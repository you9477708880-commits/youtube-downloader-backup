# 發布後自動化與維護性批次（2026-08-12）

## 狀態

本批次已完成本機實作與自動化驗證，並預定推送 GitHub；尚未重新部署 Firebase Hosting。Firestore Rules 與 Firebase Functions 均未部署，也沒有接觸正式 Firestore 資料。

目前正式 Hosting 仍是上一個已發布版本。待人工驗收回報後，再決定是否發布本批次。

## 完成內容

- 抽出分類／預算 controller，集中管理自訂分類、分類預算、清理未使用預算與每月生活費上限。
- 抽出退休 controller；只有 `retLinked` 與未連動時的 `retManualAsset` 會保存，年齡、投報率、通膨率、提領率、目標與表格展開仍是即時計算用 UI 狀態。
- 將 PWA manifest 與 service worker 改為可由 Hosting 直接提供的同源靜態檔案。
- service worker 設定 `Cache-Control: no-cache, no-store, must-revalidate`，降低更新被舊快取延遲的風險。
- 新增 Hosting 成品檢查：重建 `.firebase-public` 後驗證必要檔案、禁止檔案、HTML／JavaScript 相對引用、manifest 與 service worker。
- 預設 release smoke 會等待應用程式完成初始化，不再只以頁面標題判定成功。
- 根目錄 `npm test` 現在依序執行 unit、release artifact、Firebase Emulators 與 browser smoke。

## 自動驗證結果

以下命令已在 Windows 本機完整通過：

```powershell
npm test
```

覆蓋範圍：

- 全部語法與單元測試
- 分類／預算 controller：10 項
- 退休 controller：8 項
- Hosting 成品檢查：61 個檔案
- Hosting 成品 headless browser 啟動測試
- Firestore Rules Emulator 與 Functions Emulator 測試
- 12 組既有瀏覽器 smoke scenarios

測試只使用 Emulator 與本機靜態伺服器，不會讀寫正式 Firestore。

## 保留語意與已知事項

- 分類預算仍以主分類字串比對；歷史交易的 legacy `cat` fallback 與代墊 `ownAmount` 判定保持不變。
- `budgetCap = 0` 與刪除不存在分類仍維持既有行為，避免在純抽取批次混入產品規格變更。
- 退休設定從「連動資產」切回手動時，畫面會暫時保留當下 slider 值；下一次完整設定同步才讀回已保存的手動資產。這是既有行為，已用 characterization test 鎖定，可在後續產品修正批次單獨改善。
- Node 測試仍會顯示 `MODULE_TYPELESS_PACKAGE_JSON` 效能提示；不影響通過結果，本批依限制未擴大 package module 設定。

## 下次發布前

1. 完成人工驗收清單，特別確認分類預算與退休頁互動。
2. 若決定發布，先確認 GitHub CI 成功，再部署 Firebase Hosting。
3. 部署後執行：

   ```powershell
   npm run test:release:remote
   ```

   這會唯讀檢查正式網址的必要檔案、禁止檔案與 service worker 快取標頭。
4. 本批沒有 Firestore Rules 變更，因此不需要部署 Rules；Firebase Functions 仍不部署。
