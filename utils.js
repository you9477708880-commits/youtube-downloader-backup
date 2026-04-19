/**
 * 【Utils.gs】共用工具函式庫 v6.1（詳盡註解）
 * ==============================================================================
 * 📌 這裡只放「純工具」，不放業務規則：
 * - 日期計算（週三起算）
 * - 日期表頭填寫（6 天制，跳過週日）
 * - 尋找上一週報表（4 種命名格式）
 * - 排序（只排序上半部，整列搬到 AC）
 * ==============================================================================
 */
const Utils = {

  /**
   * 計算「本週週期資訊」
   * @param {Date} baseDate - 任何一天都可以（今天、手動指定日期）
   * @return {{startWed: Date, labelZP: string}}
   * - startWed：本週的週三日期（依 INVENTORY_WEEK_START_DAY）
   * - labelZP：檔名用字串 "YYYY/MM/DD~YYYY/MM/DD"
   */
  getWeekInfo: function(baseDate) {
    const d = new Date(baseDate);
    const day = d.getDay();
    const startDay = CONFIG.INVENTORY_WEEK_START_DAY;

    // 計算回推天數：確保同一週內不管哪天執行，startWed 都一致
    const diff = day >= startDay ? (day - startDay) : (day + 7 - startDay);
    d.setDate(d.getDate() - diff);

    const startWed = new Date(d);
    const endTue = new Date(d);
    endTue.setDate(d.getDate() + 6);

    const fmt = (date) => Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    return { startWed, labelZP: `${fmt(startWed)}~${fmt(endTue)}` };
  },

  /**
   * 填寫日期表頭（Row 4 / Row 51, G~L）
   * - 6 天制：遇到週日跳過
   */
  fillDateHeader: function(sheet, startWed) {
    let cur = new Date(startWed);
    for (let c = CONFIG.DATA_ROWS.DATE_COL_START; c <= CONFIG.DATA_ROWS.DATE_COL_END; c++) {
      if (cur.getDay() === 0) cur.setDate(cur.getDate() + 1); // 跳過週日
      const d = new Date(cur);
      sheet.getRange(CONFIG.DATA_ROWS.DATE_HEADER_1, c).setValue(d);
      sheet.getRange(CONFIG.DATA_ROWS.DATE_HEADER_2, c).setValue(d);
      cur.setDate(cur.getDate() + 1);
    }
  },

  /**
   * 尋找上一週報表（最多往回找 MAX_SEARCH_WEEKS 週）
   * - 支援 4 種檔名格式（補零/不補零 + ~ / -）
   * - 你的現況是 "YYYY/MM/DD~YYYY/MM/DD補藥紀錄" 為主，但保留相容
   */
  findPreviousSheet: function(ss, startWed) {
    let d = new Date(startWed);

    for (let i = 0; i < CONFIG.WEEKLY.MAX_SEARCH_WEEKS; i++) {
      d.setDate(d.getDate() - 7);

      const endD = new Date(d);
      endD.setDate(d.getDate() + 6);

      const fmt = (date, pad) => {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const day = date.getDate();
        return pad ? Utilities.formatString('%d/%02d/%02d', y, m, day) : `${y}/${m}/${day}`;
      };

      const names = [
        `${fmt(d, true)}~${fmt(endD, true)}補藥紀錄`,
        `${fmt(d, true)}-${fmt(endD, true)}補藥紀錄`,
        `${fmt(d, false)}~${fmt(endD, false)}補藥紀錄`,
        `${fmt(d, false)}-${fmt(endD, false)}補藥紀錄`
      ];

      for (const name of names) {
        const sheet = ss.getSheetByName(name);
        if (sheet) return sheet;
      }
    }
    return null;
  },

  /**
   * 取得當前可排序的工作表
   * - 必須是週報（名稱含「補藥紀錄」）
   * - 必須排除範本與舊範本
   */
  getSheetForSorting: function() {
    const sheet = SpreadsheetApp.getActiveSheet();
    const name = sheet.getName();
    if (!name.includes('補藥紀錄')) return null;
    if (name === CONFIG.TEMPLATE_SHEET_NAME) return null;
    if (CONFIG.PARAMS.OLD_TEMPLATE_SHEET_NAMES.includes(name)) return null;
    return sheet;
  },

  /**
   * [高效排序] 區塊複製排序法
   * - 只排序上半部（TOP_START~TOP_END）
   * - 整列一起移動（A~AC），避免排序後欄位對不上
   */
  sortSheetBlock: function(sheet, colIndex) {
    const startRow = CONFIG.DATA_ROWS.TOP_START;
    const endRow = CONFIG.DATA_ROWS.TOP_END;
    const numRows = endRow - startRow + 1;

    // 最右欄固定為 AC（Config 控制），避免 getLastColumn() 搬過多欄位
    const lastCol = CONFIG.COLUMNS.ARRIVAL_DAYS;

    const ss = SpreadsheetApp.getActive();
    const tmp = ss.insertSheet('TMP_' + Date.now()).hideSheet();

    // 1) 複製上半部整塊到暫存表（包含值與格式）
    const srcRange = sheet.getRange(startRow, 1, numRows, lastCol);
    srcRange.copyTo(tmp.getRange(1, 1));

    // 2) 在暫存表排序（sort() 會保留格式在暫存表內一致）
    const tmpRange = tmp.getRange(1, 1, numRows, lastCol);
    tmpRange.sort({ column: colIndex, ascending: true });

    // 3) 排序後再整塊貼回原表（值+格式一起回去）
    tmpRange.copyTo(sheet.getRange(startRow, 1));

    ss.deleteSheet(tmp);
    sheet.activate();
  }
};

