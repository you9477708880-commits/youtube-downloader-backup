/**
 * 【App.gs】主程式入口與路由控制 v6.1（詳盡註解）
 * ==============================================================================
 * 📌 此檔案扮演 Controller / Router：
 * 1) onOpen：建立選單（UI 操作入口）
 * 2) onEdit：事件路由（決定交給哪個 Service）
 * 3) Wrappers：提供全域函式給選單/觸發器呼叫（GAS 限制）
 *
 * ⚠️ 注意：Simple Trigger（onEdit）有一些限制：
 * - 不能使用需要授權的服務（某些情境下）
 * - e.value 在「輸入公式」時可能是 undefined（非常重要）
 * ==============================================================================
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('💊 藥品庫存系統')
    .addSubMenu(ui.createMenu('🔄 日常作業')
      .addItem('建立本週週報 (手動)', 'manualCreateWeeklySheet')
      .addSeparator()
      // 你已指定：排序只動上半部，因此 UI 也明確標示
      .addItem('盤點排序(上半部) (依櫃號 A欄)', 'sortByCabinet')
      .addItem('盤點結束(上半部) (依表序 B欄)', 'sortByTable'))
    .addSubMenu(ui.createMenu('🔍 智慧查詢')
      .addItem('搜尋藥品進貨紀錄', 'promptSearchDrugHistory')
      .addItem('分析庫存最大值', 'startMaxStockAnalysis')
      .addItem('⚠️ 強制重設分析', 'forceResetAnalysis'))
    //.addSubMenu(ui.createMenu('🛠️ 系統維護')
      //.addItem('修復公式 (已停用)', 'promptFixFormulas'))
    .addToUi();
}

function onEdit(e) {
  // [防呆] 若在 Script Editor 手動執行 onEdit()，會沒有事件物件
  if (!e) return;

  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();

  // [安全機制 1] 排除範本 & 舊範本（避免維護範本時誤觸自動化）
  if (sheetName === CONFIG.TEMPLATE_SHEET_NAME) return;
  if (CONFIG.PARAMS.OLD_TEMPLATE_SHEET_NAMES.includes(sheetName)) return;

  // [安全機制 2] 只針對週報表（名稱包含「補藥紀錄」）
  // 若你未來新增其他名稱也包含「補藥紀錄」但不該觸發，加入 OLD_TEMPLATE_SHEET_NAMES 或另設 EXCLUDE
  if (!sheetName.includes('補藥紀錄')) return;

  const col = range.getColumn();
  const row = range.getRow();
  const a1 = range.getA1Notation();

  // --- 路由 A：進貨自動化（R欄） ---
  if (col === CONFIG.COLUMNS.RESTOCK_INPUT) {
    Service_Inventory.handleRestockLogic(e);
    return;
  }

  // --- 路由 B：手機版觸發（F1 / F2） ---
  if (a1 === CONFIG.MOBILE_TRIGGER.CONFIRM_CELL || a1 === CONFIG.MOBILE_TRIGGER.ACTION_CELL) {
    Service_Inventory.handleMobileTrigger(e);
    return;
  }

  // --- 路由 C：自動加等號（G~L 欄） ---
  // [效能] 先判斷欄與列範圍，避免任何編輯都進 Service
  if (col >= CONFIG.COLUMNS.AUTO_MATH_START && col <= CONFIG.COLUMNS.AUTO_MATH_END) {
    const isTop = (row >= CONFIG.DATA_ROWS.TOP_START && row <= CONFIG.DATA_ROWS.TOP_END);
    const isBottom = (row >= CONFIG.DATA_ROWS.BOTTOM_START && row <= CONFIG.DATA_ROWS.BOTTOM_END);
    if (isTop || isBottom) Service_Tools.autoConvertFormula(e);
  }
}

// --- Wrappers：選單與觸發器只能呼叫全域函式 ---
function timeBasedWeeklyCreate() { Service_Inventory.createSheetForDate(new Date(), true); }
function manualCreateWeeklySheet() { Service_Inventory.createSheetForDate(new Date(), false); }
function sortByCabinet() { Service_Inventory.sortSheet(CONFIG.COLUMNS.CABINET_SORT); }
function sortByTable() { Service_Inventory.sortSheet(CONFIG.COLUMNS.TABLE_SORT); }
function promptSearchDrugHistory() { Service_Tools.promptSearchDrugHistory(); }
function startMaxStockAnalysis() { Service_Tools.startMaxStockAnalysis(); }
function forceResetAnalysis() { Service_Tools.forceResetAnalysis(); }
function continueMaxStockBatch() { Service_Tools.processMaxStockBatch(); }
function promptFixFormulas() { Service_Tools.promptFixFormulas(); }
/**
 * [關鍵橋接] 最大值分析看門狗（Watchdog）
 * 由時間觸發器定期呼叫，用來判斷分析是否卡住/爆掉，並自動通知。
 */
function analysisWatchdog() { Service_Tools.analysisWatchdog();}

/**
 * 🧪 測試用：手動建立「指定週」的補藥紀錄
 * 不影響正式週三排程
 */
function testCreateWeeklySheet() {
  try {
    const fakeWed = new Date('2026/02/04');
    Logger.log('TEST start, fakeWed=%s', fakeWed);

    Service_Inventory.createSheetForDate(fakeWed, false);

    Logger.log('TEST finished OK');
  } catch (err) {
    Logger.log('TEST ERROR: %s', err && err.stack ? err.stack : err);
    throw err; // 讓 Apps Script 顯示真正錯誤
  }
}