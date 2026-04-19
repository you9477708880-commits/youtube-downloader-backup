/**
 * 【Config.gs】系統全域設定檔 v6.1 (穩定版 / 詳盡註解)
 * ==============================================================================
 * 📌 這份檔案是整個系統的「唯一真相 (Single Source of Truth)」：
 * - 欄位索引、資料列範圍、提示訊息位置、排除工作表等都在此管理
 * - 未來如果欄位或列數有變動，優先改 Config，而不是到 Service 內硬改數字
 *
 * 📌 重要背景（你提供的實務規則）
 * 1) 上半部（5~48）：會排序、會換列；B 欄表序「非空、唯一、穩定」
 * 2) 下半部（52~95）：列固定不動；且「同一欄位字母」上下半語意不同
 * 3) 週期：6 天制（跳過週日），週三為週起始日
 * ==============================================================================
 */
const CONFIG = {
  // --- 1. 基礎設定 (Core Settings) ---
  TEMPLATE_SHEET_NAME: '「補藥紀錄範本」3.0',
  INVENTORY_WEEK_START_DAY: 3, // 週三起算

  // --- 2. 資料列結構 (Data Row Structure) ---
  DATA_ROWS: {
    TOP_START: 5,
    TOP_END: 48,          // ✅ 排序只動上半部
    BOTTOM_START: 52,
    BOTTOM_END: 95,

    // 日期表頭位置
    DATE_HEADER_1: 4,
    DATE_HEADER_2: 51,

    // 日期填寫欄位範圍：G~L（6 天制，跳過週日）
    DATE_COL_START: 7,    // G
    DATE_COL_END: 13      // M
  },

  // --- 3. 欄位索引地圖 (Column Map) ---
  /**
   * Google Sheets 欄位索引：A=1, B=2, ... Z=26, AA=27, AB=28, AC=29
   *
   * ⚠️ 注意：上下半部的「欄位語意」不同（你已明確說明）
   * - 上半部：M=理論值, N=誤差值, O=上週庫存, P=盤點輸入, Q=補庫後盤點
   * - 下半部：M=三(補庫), N=系統理論值, O=誤差值, P=上週庫存, Q=盤點輸入
   *
   * 因此本版除了保留「全表欄位索引」外，也另外提供「下半部語意欄位」常數，
   * 避免後續維護者/AI 用錯欄位。
   */
  COLUMNS: {
    // [識別區]
    CABINET_SORT: 1,      // A：櫃子排序
    TABLE_SORT: 2,        // B：表格排序（★ 上半部 mapping key / 盤點結束還原）
    DRUG_CODE: 3,         // C：藥品代碼（本版不做 mapping）
    DRUG_NAME: 4,         // D：藥名（搜尋用）
    DOSE: 5,              // E：劑量（搜尋用，例如 0.5mg）
    INGREDIENT: 6,        // F：英文成分名（搜尋用，例如 ALPRAZOLAM）

    // [自動化運算區] (G~L)
    AUTO_MATH_START: 7,
    AUTO_MATH_END: 12,

    // [庫存數據區]（全表位置索引，語意上下半不同）
    THEORETICAL_STOCK: 13, // M：上半=系統理論值；下半=三(補庫)（表頭文字不同不影響索引）
    ERROR_VALUE: 14,       // N：上半=誤差值；下半=系統理論值（你指定下半 fallback 用）
    LAST_WEEK_STOCK: 15,   // O：上半=上週庫存（本週寫入目標）；下半=誤差值
    INVENTORY_INPUT: 16,   // P：上半=盤點輸入；下半=上週庫存（本週寫入目標）
    ADJUSTED_STOCK: 17,    // Q：上半=補庫後盤點；下半=盤點輸入

    // [進貨與到貨區]
    RESTOCK_INPUT: 18,     // R：進貨輸入（觸發點）
    RESTOCK_DATE: 19,      // S：進貨日期（程式寫入）
    ORDER_DATE: 27,        // AA：已叫貨日期（一次性流程結案後清空）
    MAX_ORDER: 28,         // AB：最大叫貨量
    ARRIVAL_DAYS: 29,      // AC：到貨天數（程式寫入）

    // ==========================
    // [下半部語意專用欄位（避免用錯）]
    // ==========================
    BOTTOM_THEORETICAL_STOCK: 14, // N：下半部系統理論值（fallback 用）
    BOTTOM_LAST_WEEK_STOCK: 16,   // P：下半部上週庫存（本週寫入目標）
    BOTTOM_INVENTORY_INPUT: 17    // Q：下半部盤點輸入（優先來源）
  },

  // --- 4. 功能參數 / 提示訊息設定 ---
  PARAMS: {
    /**
     * 排除工作表：避免 onEdit / 搜尋 / 排序誤觸
     * - 目前確認存在： 「補藥紀錄範本」OLD
     */
    OLD_TEMPLATE_SHEET_NAMES: [
      '「補藥紀錄範本」OLD',
      '「補藥紀錄範本」2.9'
    ],

    /**
     * 主提示訊息（資料繼承狀態）顯示位置與樣式
     */
    NOTE_MAIN: {
      CELL: 'Q2',
      COLOR: '#666666',
      STYLE: 'italic'
    },

    /**
     * 🆕 下半部負值提醒（你指定：M2）
     * 當下半部「繼承後寫入到 P 欄」出現負值，顯示提醒文字
     */
    NOTE_BOTTOM_NEGATIVE: {
      CELL: 'M2',
      COLOR: '#B00020',
      STYLE: 'bold'
    },

    /**
     * 上週盤點是否完成：檢查上半部 Q 欄（5~48）
     * - 只要任一格有「有效數字」就視為盤點/校正有做過
     */
    get CHECK_INV_RANGE() {
      return `P${CONFIG.DATA_ROWS.TOP_START}:P${CONFIG.DATA_ROWS.TOP_END}`;
    },

    /**
     * 下半部負值檢查：檢查新表下半部 P 欄（52~95）
     * - 因為下半部 P 欄才是「上週庫存」寫入目標
     */
    get BOTTOM_NEG_CHECK_RANGE() {
      return `P${CONFIG.DATA_ROWS.BOTTOM_START}:P${CONFIG.DATA_ROWS.BOTTOM_END}`;
    },
    // ============================
    // ★ 新增：資料分析 / 搜尋 起始日期
    // ============================
    // 目的：避免舊報表格式混入導致錯誤（舊表表頭列、欄位名稱可能不一致）
    // 格式固定用 yyyy/MM/dd（例：2026/01/01）
    SEARCH_MIN_START_DATE: '2026/01/21',   // 「搜尋進貨紀錄」只掃描此日期(含)之後的週報
    ANALYSIS_MIN_START_DATE: '2026/01/21'  // 「最大值分析」只分析此日期(含)之後的週報
  },
    // --- 4.1 自動通知設定（最大值分析專用） ---
  ANALYSIS_NOTIFY: {
    ENABLED: true,                 // 是否啟用自動通知
    EMAILS: [],                    // 收件者清單；空陣列代表用 ActiveUser 當收件者
    STALL_SECONDS: 180,            // 判定卡住：最後心跳超過幾秒（建議 180~300）
    WATCHDOG_MINUTES: 5,           // 看門狗檢查頻率（分鐘），建議 2~5，GAS 限制：看門狗檢查頻率 只接受 1、5、10、15、30
    THROTTLE_MINUTES: 10,          // 通知節流：同一種通知至少間隔幾分鐘才再寄
    NOTIFY_ON_DONE: false          // 分析完成是否寄信
  },
    // --- 最大值分析：狀態工作表（同一份試算表內即時顯示進度） ---
  ANALYSIS_STATUS: {
    SHEET_NAME: '📊分析狀態',     // 狀態工作表名稱（你可改）
    ANCHOR_CELL: 'A1',           // 從哪一格開始寫
    SHOW_LOG_ROWS: 10            // 額外顯示最近幾筆狀態更新（可選）
  },

  // --- 5. 手機觸發設定 (Mobile Trigger) ---
  MOBILE_TRIGGER: {
    ACTION_CELL: 'F2',
    CONFIRM_CELL: 'F1',
    CONFIRM_WORD: 'yes'
  },

  // --- 6. 自動建表設定（沿用舊閱讀習慣） ---
  WEEKLY: {
    MAX_SEARCH_WEEKS: 12
  }
};
