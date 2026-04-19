// v6.2 tested via manualCreateWeeklySheet / testCreateWeeklySheet (2026-02-04)
/**
 * 【Service_Inventory.gs】庫存核心服務 v6.2（詳盡註解）
 * ==============================================================================
 * 核心功能：
 * 1) 進貨連動（R 欄）：
 *    - 寫入 S（進貨日）
 *    - 計算 AC（到貨天數）
 *    - 清空 AA（一次性流程結案，解除 Y 欄警示）
 *
 *    你選擇的策略 B（小幅優化）：
 *    - 支援 R 欄輸入公式：用 e.range.getValue() 讀「計算後數值」
 *    - 但若 AA 已清空（已結案）→ 不再觸發任何連動（避免事後改 R 造成誤判）
 *
 * 2) 每週建表與資料繼承：
 *    - 上半部（5~48）：用 B 欄表序 mapping（避免換列錯藥）
 *       來源：上週上半 Q（補庫後盤點）有效數字優先，否則用上週上半 M（理論值）
 *       目標：本週上半 O（上週庫存）
 *
 *    - 下半部（52~95）：列固定 → 直貼
 *       來源：上週下半 Q（盤點輸入）有效數字優先，否則用上週下半 N（系統理論值）
 *       目標：本週下半 P（上週庫存）
 *
 *    - 新功能：若下半部繼承後 P 出現負值 → 在 M2 顯示提醒（Config 可調）
 * ==============================================================================
 */
const Service_Inventory = {

    /**
   * [進貨連動] R欄 -> S(進貨日), (若有AA則)AC(到貨天數)並清AA
   *
   * 規則（更新後）：
   * 1) 只要 R 有有效數字（包含公式計算後）→ 至少要寫入 S（進貨日）
   * 2) 若 AA 有日期 → 計算 AC，並清 AA（一次性流程結案）
   * 3) 若 AA 沒日期 → 不計算 AC（清空/留白），AA 不動
   * 4) 防止重複觸發：若 S 已經有日期（代表此列已經結案/已記錄進貨）→ 不再觸發
   *
   * 為什麼用 S 當旗標？
   * - 你有時候「直接進貨，沒有叫貨日」
   * - 若仍以 AA 當 guard，會導致 S 永遠不會寫入
   * - 用 S 判斷「是否已處理過本次進貨」更符合實務
   */
  handleRestockLogic: function(e) {
    const sheet = e.range.getSheet();
    const row = e.range.getRow();

    const rangeDate = sheet.getRange(row, CONFIG.COLUMNS.RESTOCK_DATE); // S
    const rangeOrder = sheet.getRange(row, CONFIG.COLUMNS.ORDER_DATE);  // AA
    const rangeDays = sheet.getRange(row, CONFIG.COLUMNS.ARRIVAL_DAYS); // AC

    // 0) 防重複：若 S 已經有日期，代表此列已經處理過進貨
    //    之後即使使用者修改 R（例如把 3000 改成 =3000+2000），也不要重寫日期/天數
    const existingRestockDate = rangeDate.getValue();
    if (existingRestockDate instanceof Date) return;

    // 1) 讀取 R 欄「計算後數值」（支援公式）
    const qty = Number(e.range.getValue());
    if (!Number.isFinite(qty) || qty <= 0) return;

    // 2) 寫入 S：進貨日（無論是否有叫貨日都要寫）
    const today = new Date();
    rangeDate.setValue(today);

    // 3) 若 AA 有日期，才計算 AC 並清 AA（結案）
    const orderDate = rangeOrder.getValue();
    if (orderDate instanceof Date) {
      const diffTime = today.getTime() - orderDate.getTime();
      const diffDays = Math.max(1, Math.ceil(diffTime / 86400000));
      rangeDays.setValue(diffDays);

      // 一次性流程結案：清 AA（解除 Y 欄警示）
      rangeOrder.clearContent();
    } else {
      // 沒有叫貨日：AC 留白（避免顯示錯誤資訊）
      rangeDays.clearContent();
    }
  },


 /**
 * [建表邏輯] 建立本週新表 + 繼承資料
 *
 * 核心責任（只做「流程控制」，不做細節計算）：
 * 1. 決定「是否要建新表」
 * 2. 複製範本並填入日期表頭
 * 3. 尋找上一週報表
 * 4. 呼叫各區塊的「資料繼承函數」
 * 5. 根據繼承結果，給使用者提示訊息
 *
 * ⚠️ 注意：
 * - 此函數「不直接處理庫存邏輯」
 * - 上半 / 下半實際怎麼繼承，完全交由 helper 函數負責
 *
 * @param {Date} targetDate - 基準日（通常是今天，用來推算週別）
 * @param {boolean} isAuto - 是否為排程觸發
 *   - true  : 自動模式（避免 alert / activate / toast）
 *   - false : 人工操作（允許 UI 回饋）
 */
createSheetForDate: function(targetDate, isAuto) {

  // ===========================================================================
  // 0. 基本初始化
  // ===========================================================================

  // 取得目前試算表
  const ss = SpreadsheetApp.getActive();

  // 依 targetDate 計算「週資訊」
  // info.startWed : 本週週三（你系統的週基準）
  // info.labelZP  : 例如「113W32」這種顯示用標籤
  const info = Utils.getWeekInfo(targetDate);

  // 新表名稱：固定為「週標籤 + 補藥紀錄」
  const newName = info.labelZP + '補藥紀錄';


  // ===========================================================================
  // 1. 防止重複建表（非常重要，避免排程重複跑）
  // ===========================================================================

  if (ss.getSheetByName(newName)) {
    // 人工模式才提示，排程模式直接靜默 return
    if (!isAuto) ss.toast('工作表已存在');
    return;
  }


  // ===========================================================================
  // 2. 取得範本工作表
  // ===========================================================================

  const template = ss.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);

  // 範本不存在 → 屬於系統錯誤，不應繼續
  if (!template) {
    if (!isAuto) SpreadsheetApp.getUi().alert('找不到範本');
    return;
  }


  // ===========================================================================
  // 3. 複製範本，正式建立本週新表
  // ===========================================================================

  // copyTo 會建立一份完整拷貝（含格式 / 公式）
  const newSheet = template.copyTo(ss).setName(newName);


  // ===========================================================================
  // 4. 填寫日期表頭（G~L）
  // ===========================================================================

  // 只處理「表頭日期顯示」
  // 不涉及任何庫存或數據邏輯
  Utils.fillDateHeader(newSheet, info.startWed);


  // ===========================================================================
  // 5. 嘗試尋找「上一週報表」
  // ===========================================================================

  const prevSheet = Utils.findPreviousSheet(ss, info.startWed);

  // 用來累積提示訊息（最後一次性寫入）
  let noteMain = '';
  let noteBottomNeg = '';


  // ===========================================================================
  // 6. 若找到上一週，才進行資料繼承
  // ===========================================================================

  if (prevSheet) {

    // -------------------------------------------------------------------------
    // 6-1) 判斷「上週是否有做盤點 / 校正」
    // -------------------------------------------------------------------------
    // 規則：
    // - 只檢查「上半部」
    // - 只要 Q 欄中「任一格」有有效數字
    //   → 視為該週曾經做過盤點校正
    //
    // ⚠️ 這個判斷只用來「顯示提示文字」
    // ⚠️ 不會影響實際繼承邏輯
    const checkVals = prevSheet
      .getRange(CONFIG.PARAMS.CHECK_INV_RANGE)
      .getValues();

    const inventoryWasDone = checkVals.some(
      r => r[0] !== "" && Number.isFinite(Number(r[0]))
    );


    // -------------------------------------------------------------------------
    // 6-2) 上半部繼承（5~48）
    // -------------------------------------------------------------------------
    // 實際邏輯：
    // - 由 _inheritTopByTableSort 全權負責
    // - 本函數只接收「是否有 fallback 發生」
    //
    // 目前依賴的行為假設（非常重要）：
    // - 該 helper 會正確處理：
    //   * P / Q / M 的盤點判斷
    //   * O 欄（上週庫存）
    //   * AA 欄（叫貨日期）的繼承
    const usedFallbackTop =
      this._inheritTopByTableSort(prevSheet, newSheet);


    // -------------------------------------------------------------------------
    // 6-3) 下半部繼承（52~95）
    // -------------------------------------------------------------------------
    // 規則（由 helper 定義）：
    // - Q 優先（盤點輸入）
    // - N 備用（理論值）
    // - 寫入 P（上週庫存）
    const usedFallbackBottom =
      this._inheritBottomByRange(prevSheet, newSheet);


    // -------------------------------------------------------------------------
    // 6-4) 組合「主提示訊息」
    // -------------------------------------------------------------------------
    // 提示邏輯只跟「是否盤點 / 是否 fallback」有關
    // 不影響任何資料本身
    if (inventoryWasDone) {
      noteMain = '資料繼承自上週盤點校正後數據(Q欄)';
    } else if (usedFallbackTop || usedFallbackBottom) {
      noteMain = '上週未完成盤點，部分資料由備用欄位繼承';
    }


    // -------------------------------------------------------------------------
    // 6-5) 檢查下半部是否出現「負值繼承」
    // -------------------------------------------------------------------------
    // 只檢查「新表」
    // 用來提醒「可能未完成盤點」
    const bottomVals = newSheet
      .getRange(CONFIG.PARAMS.BOTTOM_NEG_CHECK_RANGE)
      .getValues();

    const hasNegative = bottomVals.some(
      r => Number.isFinite(Number(r[0])) && Number(r[0]) < 0
    );

    if (hasNegative) {
      noteBottomNeg =
        '⚠️ 下半部散裝區出現負值繼承，可能未完成盤點，請確認下半部盤點/校正';
    }

  } else {
    // 找不到上一週 → 直接給空白新表
    if (!isAuto) {
      SpreadsheetApp.getUi().alert('找不到舊報表，已建立空白表。');
    }
  }


  // ===========================================================================
  // 7. 寫入提示訊息（集中在這裡，避免流程中途寫 UI）
  // ===========================================================================

  if (noteMain) {
    newSheet.getRange(CONFIG.PARAMS.NOTE_MAIN.CELL)
      .setValue(noteMain)
      .setFontColor(CONFIG.PARAMS.NOTE_MAIN.COLOR)
      .setFontStyle(CONFIG.PARAMS.NOTE_MAIN.STYLE);
  }

  if (noteBottomNeg) {
    newSheet.getRange(CONFIG.PARAMS.NOTE_BOTTOM_NEGATIVE.CELL)
      .setValue(noteBottomNeg)
      .setFontColor(CONFIG.PARAMS.NOTE_BOTTOM_NEGATIVE.COLOR)
      .setFontStyle(CONFIG.PARAMS.NOTE_BOTTOM_NEGATIVE.STYLE);
  } else {
    // 若本次沒有負值警告，清空避免殘留舊訊息
    newSheet
      .getRange(CONFIG.PARAMS.NOTE_BOTTOM_NEGATIVE.CELL)
      .clearContent();
  }


  // ===========================================================================
  // 8. 收尾 UI 行為
  // ===========================================================================

  // 顯示新表（避免被 hide）
  newSheet.showSheet();

  // 人工操作才自動切換頁面
  if (!isAuto) newSheet.activate();

  // 隱藏範本與上一週（維持畫面乾淨）
  template.hideSheet();
  if (prevSheet) prevSheet.hideSheet();
},


  /**
   * 手機版觸發（F1=yes 才執行 F2 的指令）
   */
  handleMobileTrigger: function(e) {
    const sheet = e.range.getSheet();
    const action = sheet.getRange(CONFIG.MOBILE_TRIGGER.ACTION_CELL).getValue();
    const confirm = e.value;

    if (String(confirm).toLowerCase() === CONFIG.MOBILE_TRIGGER.CONFIRM_WORD) {
      if (String(action).includes('複製數據')) this.createSheetForDate(new Date(), false);
      else if (String(action).includes('盤點排序')) this.sortSheet(CONFIG.COLUMNS.CABINET_SORT);
      else if (String(action).includes('盤點結束')) this.sortSheet(CONFIG.COLUMNS.TABLE_SORT);

      sheet.getRangeList([CONFIG.MOBILE_TRIGGER.ACTION_CELL, CONFIG.MOBILE_TRIGGER.CONFIRM_CELL]).clearContent();
    }
  },

  /**
   * 排序（只排序上半部）
   */
  sortSheet: function(colIndex) {
    const sheet = Utils.getSheetForSorting();
    if (sheet) Utils.sortSheetBlock(sheet, colIndex);
    else SpreadsheetApp.getActive().toast('請先切換到補藥紀錄週報工作表');
  },

  // ============================================================================
  // 內部 helper（避免外部亂呼叫）
  // ============================================================================

/**
 * 上半部資料繼承（Config 驅動版）
 *
 * 設計原則：
 * - Service 不「理解」資料結構，只「服從」 Config
 * - 列數、範圍的唯一真相 = CONFIG + Range 實體
 *
 * ------------------------------------------------------
 * 盤點判斷規則（v6.1，禁止回退）：
 * 1. 是否盤點，只看 P 欄（盤點輸入）
 * 2. P 有值（含 0）→ 才允許使用 Q
 * 3. P 空白 → Q 一律視為不可用，即使 Q = 0
 * 4. Q 不可用 → fallback 使用 M（理論值）
 *
 * 寫入：
 * - O  欄：上週庫存
 * - AA 欄：叫貨日期（直接繼承，不判斷）
 *
 * @return {boolean} usedFallback
 *   只要任一列未使用 Q（而改用 M）即為 true
 */
_inheritTopByTableSort: function(prevSheet, newSheet) {

  // ===========================================================================
  // 1. 由 Config 定義「唯一合法的上半部範圍」
  //    Service 不再自行計算列數
  // ===========================================================================

  const rowStart = CONFIG.DATA_ROWS.TOP_START;
  const rowCount = CONFIG.DATA_ROWS.TOP_END - CONFIG.DATA_ROWS.TOP_START + 1;

  // 依 Config 一次性讀取所有需要的欄位
  const prevB  = prevSheet.getRange(rowStart, CONFIG.COLUMNS.TABLE_SORT,       rowCount, 1).getValues().flat();
  const prevP  = prevSheet.getRange(rowStart, CONFIG.COLUMNS.INVENTORY_INPUT,  rowCount, 1).getValues().flat();
  const prevQ  = prevSheet.getRange(rowStart, CONFIG.COLUMNS.ADJUSTED_STOCK,    rowCount, 1).getValues().flat();
  const prevM  = prevSheet.getRange(rowStart, CONFIG.COLUMNS.THEORETICAL_STOCK, rowCount, 1).getValues().flat();
  const prevAA = prevSheet.getRange(rowStart, CONFIG.COLUMNS.ORDER_DATE,        rowCount, 1).getValues().flat();


  // ===========================================================================
  // 2. 建立「表序 → 繼承資料」的 Map
  // ===========================================================================

  const map = new Map();
  let usedFallback = false;

  prevB.forEach((key, i) => {
    if (!key) return; // 防呆：理論上 B 欄不該為空

    // --- v6.1 核心規則：是否真的有盤點 ---
    const hasInventoryInput =
      prevP[i] !== '' &&
      prevP[i] !== null &&
      typeof prevP[i] !== 'undefined';

    // --- Q 是否「有資格」被使用 ---
    const q = Number(prevQ[i]);
    const isValidQ = hasInventoryInput && Number.isFinite(q);

    if (!isValidQ) usedFallback = true;

    map.set(key, {
      stock: isValidQ ? q : prevM[i],
      orderDate: prevAA[i]
    });
  });


  // ===========================================================================
  // 3. 依「新表」B 欄順序寫回資料
  //    → 列數來自 newSheet 的實際 Range
  // ===========================================================================

  const newB = newSheet
    .getRange(rowStart, CONFIG.COLUMNS.TABLE_SORT, prevB.length, 1)
    .getValues()
    .flat();

  const dstStock = [];
  const dstOrderDate = [];

  newB.forEach(key => {
    const rec = map.get(key);
    dstStock.push([rec ? rec.stock : '']);
    dstOrderDate.push([rec ? rec.orderDate : '']);
  });


  // ===========================================================================
  // 4. 一次性寫入（O / AA）
  // ===========================================================================

  newSheet
    .getRange(rowStart, CONFIG.COLUMNS.LAST_WEEK_STOCK, dstStock.length, 1)
    .setValues(dstStock);

  newSheet
    .getRange(rowStart, CONFIG.COLUMNS.ORDER_DATE, dstOrderDate.length, 1)
    .setValues(dstOrderDate);


  // ===========================================================================
  // 5. 回傳是否發生 fallback（僅供 UI 提示用）
  // ===========================================================================

  return usedFallback;
},

  /**
   * 下半部繼承（52~95）- Range 直貼
   *
   * ⚠️ 下半部欄位語意與上半部不同（你提供的實際邏輯）
   * - 下半 Q = 盤點輸入（優先來源）
   * - 下半 N = 系統理論值（備用來源 / fallback）
   * - 下半 P = 上週庫存（本週寫入目標）
   *
   * 規則：優先 Q（有效數字），否則用 N
   * @return {boolean} usedFallback 是否有任何列使用了 N 作為備用值
   */
  _inheritBottomByRange: function(prevSheet, newSheet) {
    const start = CONFIG.DATA_ROWS.BOTTOM_START;
    const end = CONFIG.DATA_ROWS.BOTTOM_END;
    const numRows = end - start + 1;

    // 來源 A：下半 Q（盤點輸入）
    const srcQ = prevSheet.getRange(start, CONFIG.COLUMNS.BOTTOM_INVENTORY_INPUT, numRows, 1).getValues();
    // 來源 B：下半 N（系統理論值）
    const srcN = prevSheet.getRange(start, CONFIG.COLUMNS.BOTTOM_THEORETICAL_STOCK, numRows, 1).getValues();

    let usedFallback = false;

    const dst = srcQ.map((rowQ, i) => {
      const q = Number(rowQ[0]);
      const isValidQ = (rowQ[0] !== '' && Number.isFinite(q));
      if (!isValidQ) usedFallback = true;
      return [isValidQ ? q : srcN[i][0]];
    });

    // 目標：下半 P（上週庫存）
    newSheet.getRange(start, CONFIG.COLUMNS.BOTTOM_LAST_WEEK_STOCK, numRows, 1).setValues(dst);
    return usedFallback;
  }
};
