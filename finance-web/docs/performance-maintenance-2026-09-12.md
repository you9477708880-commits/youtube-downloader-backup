# 效能與維護收斂批次交付

日期：2026-09-12。分支：`codex/maintenance-life-cycle`。比較基準：`b8454c4`。
範圍是本機候選，不是正式發布；不讀寫正式 Firestore 或目前瀏覽器資料。

程式效能／互動提交：`d31dec5`。測試拆分、runner 與文件由後續同批本機提交收尾；兩者均未推送。

## 使用者可感受到的改變

1. 記帳列表每頁 50 筆，能看見總筆數與目前頁碼；搜尋條件變更回第一頁。新增／編輯後的一般重畫保留頁碼，末頁資料減少會自動退至有效頁。
2. 帳戶相關交易展開才建立明細，一樣每頁 50 筆；重畫保留展開、頁碼、對帳草稿及焦點。切換整份資料或 UID 則清除，不將前一份資料的草稿帶給下一份。
3. 調整退休參數只更新退休內容，不重畫記帳、帳戶與月報，也不重設選好的帳戶。
4. 搜尋期間不影響報表與總覽最近交易。日期小計、總筆數、餘額及預算使用完整資料，不以單頁資料計算。

## 維護方式

- `src/app/render-models.js`：單次 render 惰性共用 budget、balances、openAdvances、balanceSheet。下一次 render 重新建立，不留全域快取。
- `src/views/list-pagination.js`：純分頁與頁碼 clamp；ledger/account history 重用同一規則。
- `src/views/account-history-view.js`：只保存畫面暫存，依穩定容器註冊 listener；整份替換會 reset。
- `src/views/account-options-view.js`：帳戶選項生命週期與交易列表分離，保留仍有效的選值。
- 代墊與 CSV 在單次操作內建立索引，仍保留 ID 字串匹配、外部鍵首筆優先、重複匯入帳戶修復、完整更新與準備事件處理規則。
- 原 15 個 smoke 的 30 個 prepare/run 函式保持原內容，按功能搬至 `tests/smoke-scenarios/`；新增第 16 個 `list-performance`。
- Unit／syntax runner 預設最多 4 個程序，可用 `node scripts/run-tests.mjs --jobs=1` 序列復驗。寫共用產物的 `security-boundaries.test.js` 獨立執行；未來同類測試須加入 exclusive 清單。

## 合成效能量測

Windows、Node 24.15.0，同一機器。不是正式使用者資料或雲端速度承諾。
`node scripts/performance-benchmark.mjs b8454c4` 從 Git 讀取舊函式，暖機一次、三次中位數，逐次 deep-equal 完整新舊結果。
20,000 筆的舊 CSV 路徑很慢，重跑整張表約需數分鐘。

| 操作 | 450 筆：原→新 ms | 5,000 筆：原→新 ms | 20,000 筆：原→新 ms |
| --- | ---: | ---: | ---: |
| 未收代墊彙整（10% 代墊、10% 收款） | 0.743 → 0.054 | 87.185 → 0.265 | 910.134 → 0.880 |
| CSV 全重複：修復帳戶 | 12.922 → 1.256 | 1170.412 → 7.824 | 21944.841 → 81.540 |
| CSV 全重複：完整更新 | 7.242 → 0.762 | 731.070 → 7.770 | 21216.371 → 52.878 |

CSV 數字只包含 controller 的記憶體內匯入預覽／確認路徑，不含真實解析、磁碟／localStorage、雲端或 DOM 繪製。fixture 是全部重複的壓力情境，不代表每次匯入都會快相同比例。

測試 runner 舊序列版本單次牆鐘 15,549 ms、新版 8,877 ms；這是觀測值，期間有其他代理工作，不是嚴格控制基準，不設不穩定的毫秒斷言。

### 保存流程：量測後維持原設計

`node scripts/save-pipeline-benchmark.mjs` 使用真實 commit／normalize／store／storage serializer，但 storage 為記憶體 Map，沒有 UI／雲端 IO。一次暖機、五次中位數；完整 load round-trip 相等。

| 筆數 | 完整 commit ms | normalize ms | 本機序列化路徑 ms | store.replace ms |
| --- | ---: | ---: | ---: | ---: |
| 450 | 3.719 | 0.220 | 1.822 | 0.818 |
| 5,000 | 35.665 | 2.090 | 16.474 | 7.628 |
| 20,000 | 196.599 | 10.507 | 83.428 | 42.267 |

各欄中位數不必加總等於總時間；總時間另外包含初始 clone 與編排。真實瀏覽器同步寫入還有額外成本。
現有 450 筆的計算成本不值得在此批拆除 defensive clone／normalize。大量資料仍存在保存瓶頸，但不以延後保存、防抖、少備份換速度；未來若實際有需要，再獨立評估儲存架構。

## 驗證與安全界線

- 聚焦 unit：代墊／CSV 21 項、render models/coordinator/retirement/search 21 項、列表 11 項、runner／scenario contract 8 項通過；另有既有 domain 回歸。
- 新瀏覽器情境：125 筆、50 DOM、完整當日小計、搜尋與總覽隔離、選項節點保留、帳戶分頁／草稿／焦點、退休局部 DOM identity、JSON 整份替換重設，通過。
- 獨立代理已檢查共用 render 生命週期、runner fail／並行隔離、原情境完整性與正式產物排除。
- 第二輪獨立審查找到 numeric／string 帳戶 ID 與重複 ID 的索引行為差異，已修復並補測試：帳戶會員身份保留原型別、名稱維持 first-match、同 ID 代墊仍以各筆應收額判斷；UI 卡片使用暫存 typed＋occurrence key 避免草稿／焦點串卡，不進入資料模型。獨立修正複驗 32/32，該範圍無剩餘阻擋問題。
- 第一輪 `npm run test:fast` 整套通過；審查修正後重新執行，unit／syntax、92-file release artifact、正式產物啟動、2 項 acceptance isolation 與驗收版啟動均通過。該輪 CSV 瀏覽器情境一次未回報結果（同時有 GPU 啟動及暫存 profile 權限診斷），所以該次命令 exit 1，不記成通過。
- 未改程式或放寬斷言，另跑完整 `npm run test:smoke`，最終 16/16 通過、exit 0。失敗與複驗報告分別保留於 `.test-artifacts/sep12-final-smoke-first-attempt.html`、`.test-artifacts/sep12-final-smoke-rerun.html`；不能據單次重跑宣稱已根治本機瀏覽器偶發未回報。
- `npm run check:env` 通過：Node 24.15.0、Java 21、firebase-tools 15.22.4。`git diff --check` 通過。沒有升級依賴以掩蓋測試問題。
- 本機 Windows Emulator 503 已完成多輪隔離診斷，本批不再次更換 Java／CLI，也不反覆重試；沒有聲稱本輪 Emulators 或遠端 CI 已通過。發布仍需對新提交執行固定 Ubuntu `test:ci`。
- 本批不變更 dependencies、lockfile、帳務公式、schema、record codec、migration、Firestore Rules／Functions 或保存契約。不推送、不部署、不啟動供人工使用的預覽、不清除使用者資料。

## 人工驗收：集中一次，約 5～10 分鐘

之後使用強制離線驗收版；不需要在正式版試匯入或修改。

1. 匯入測試 CSV，查看 450 筆與帳戶是否正確；切換記帳下一頁，開啟一筆卡片、編輯備註，再回列表確認頁碼合理、金額未變。
2. 搜尋「洗牙」等關鍵字再清除；確認查詢變更回第一頁，總覽／月報期間與金額不跟著搜尋改變。
3. 展開帳戶的相關交易、翻頁，在對帳欄先輸入數字但不要確認；切頁或調退休參數，確認內容未無故消失。
4. 在新增交易選非預設帳戶，調整退休參數後回來，確認選值保留且退休結果有更新。
5. 手機查看上一頁／下一頁、完整交易卡片與帳戶展開是否容易點選，沒有跑版。

UID／整份替換、同步錯誤、匯入重複規則由自動測試及發布 CI 驗證，不要求以正式資料手動製造衝突。上述人工檢查只補真實裝置的可用性。
