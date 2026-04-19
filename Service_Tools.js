/**
 * 【Service_Tools.gs】工具模組（搜尋/自動加等號/最大值分析）v6.1
 * ==============================================================================
 * 📌 此模組放「非核心庫存」的工具功能：
 * 1) 搜尋：跨週報表搜尋進貨紀錄
 * 2) Auto-Equal：把 "5+5" 轉成 "=5+5"
 * 3) 公式修復器：已停用（避免誤用毀資料）
 * 4) 最大值分析：分批處理（避免 6 分鐘上限）
 *
 * 本次重點：搜尋進貨紀錄支援
 * - D 欄：藥名
 * - E 欄：劑量（過濾用 + 結果顯示）
 * - F 欄：英文成分名
 *
 * 使用者輸入範例：
 * - 景安寧
 * - 景安寧 0.5
 * - 景安寧 0.5mg
 * - ALPRAZOLAM 0.5mg
 *
 * 最大值分析新增：
 * - 在同一份主試算表中建立「📊分析狀態」工作表，即時顯示正在分析哪一週的補藥紀錄
 * - 背景執行（trigger）也會更新狀態，不依賴 UI
 * ==============================================================================
 */
const Service_Tools = {

  // ====================
  // 1) 智慧搜尋
  // ====================

  /**
   * [UI] 彈出搜尋輸入視窗（支援 藥名/成分名 + 劑量）
   * 使用方式提示：
   * - 只輸入藥名：景安寧
   * - 藥名 + 劑量：景安寧 0.5 或 景安寧 0.5mg
   * - 英文成分 + 劑量：ALPRAZOLAM 0.5mg
   *
   * 規則：
   * - 關鍵字會同時比對：D(藥名) 或 F(英文成分)
   * - 若有輸入劑量，會再用 E(劑量) 做過濾
   */
  promptSearchDrugHistory: function() {
    const ui = SpreadsheetApp.getUi();
    const msg =
      '請輸入「藥名或英文成分」\n' +
      '可選擇加上劑量以提高精準度：\n\n' +
      '例：景安寧\n' +
      '例：景安寧 0.5\n' +
      '例：景安寧 0.5mg\n' +
      '例：ALPRAZOLAM 0.5mg\n\n' +
      '提示：劑量建議用空白隔開';

    const result = ui.prompt('搜尋藥品進貨紀錄', msg, ui.ButtonSet.OK_CANCEL);
    if (result.getSelectedButton() !== ui.Button.OK) return;

    const input = String(result.getResponseText() || '').trim();
    if (!input) return;

    this.searchDrugByKeyword(input);
  },

  /**
   * [邏輯] 搜尋補藥紀錄（支援 藥名/英文成分 + 劑量）
   * @param {string} input - 使用者輸入，例如 "景安寧 0.5" / "ALPRAZOLAM 0.5mg"
   */
  searchDrugByKeyword: function(input) {
    const raw = String(input || '').trim();
    if (!raw) return;

    // --- 1) 解析輸入：拆出 keyword 與 dose（可選） ---
    // 允許：keyword 含空白（例如多字藥名），dose 通常在最後一段
    const parts = raw.split(/\s+/).filter(Boolean);
    const last = parts.length ? parts[parts.length - 1] : '';

    // 判斷最後一段是否像劑量：例 0.5 / 0.5mg / 1mg
    const doseToken = this._parseDoseToken_(last); // {raw, numStr} | null

    // keyword：若最後一段是劑量，就拿前面全部組回去；否則整串都是 keyword
    const keyword = doseToken ? parts.slice(0, -1).join(' ') : parts.join(' ');
    const doseFilter = doseToken || null;

    if (!keyword) {
      SpreadsheetApp.getUi().alert('請至少輸入「藥名或英文成分」。');
      return;
    }

    const ss = SpreadsheetApp.getActive();
    const sheets = ss.getSheets();

    // 結果：多帶 E(劑量) 與 F(成分) 才能區分同名不同規格
    const resultData = [[
      '工作表',
      '藥名(D)',
      '劑量(E)',
      '英文成分(F)',
      '進貨量(R)',
      '進貨日(S)'
    ]];

    // 讀取到至少 S 欄（19），若 AC 有定義則讀到 AC（方便沿用既有設定）
    const readToCol = Math.max(
      CONFIG.COLUMNS.RESTOCK_DATE,
      (CONFIG.COLUMNS.ARRIVAL_DAYS || 0)
    );

    // UI 提示（非必要，但體驗好）
    ss.toast(`搜尋中：${raw} ...`, '處理中');

    const kw = String(keyword).toLowerCase();

    sheets.forEach(sheet => {
      const sheetName = sheet.getName();

      // 排除範本與 OLD 範本
      if (sheetName === CONFIG.TEMPLATE_SHEET_NAME) return;
      if ((CONFIG.PARAMS.OLD_TEMPLATE_SHEET_NAMES || []).includes(sheetName)) return;
      // ★ 新增：起始日期過濾（避免舊格式週報混入）
      if (!this._isSheetAfterMinDate_(sheetName, CONFIG.PARAMS.SEARCH_MIN_START_DATE)) return;
      // 只處理補藥紀錄週報
      if (!sheetName.includes('補藥紀錄')) return;

      const startRow = CONFIG.DATA_ROWS.TOP_START;
      const lastRow = sheet.getLastRow();
      const numRows = lastRow - startRow + 1;
      if (numRows <= 0) return;

      // Batch Read：一次把需要的欄位讀進記憶體（避免格子逐一讀取超慢）
      const data = sheet.getRange(startRow, 1, numRows, readToCol).getValues();

      data.forEach(row => {
        const drugName = row[CONFIG.COLUMNS.DRUG_NAME - 1];      // D
        const dose = row[CONFIG.COLUMNS.DOSE - 1];              // E
        const ingredient = row[CONFIG.COLUMNS.INGREDIENT - 1];  // F
        const qty = row[CONFIG.COLUMNS.RESTOCK_INPUT - 1];      // R
        const date = row[CONFIG.COLUMNS.RESTOCK_DATE - 1];      // S

        // 只關心有進貨的紀錄
        if (!(Number(qty) > 0)) return;

        // keyword：D 或 F 任一包含即可（大小寫不敏感）
        const hitName = String(drugName || '').toLowerCase().includes(kw);
        const hitIng = String(ingredient || '').toLowerCase().includes(kw);
        if (!hitName && !hitIng) return;

        // 若有劑量過濾：比對 E 欄
        if (doseFilter && !this._matchDose_(dose, doseFilter)) return;

        resultData.push([sheetName, drugName, dose, ingredient, qty, date]);
      });
    });

    if (resultData.length > 1) {
      const suffix = doseFilter ? `_${keyword}_${doseFilter.raw}` : `_${keyword}`;
      this.showSearchResult(resultData, `搜尋結果${suffix}`);
    } else {
      SpreadsheetApp.getUi().alert(`找不到符合「${raw}」的進貨紀錄。`);
    }
  },

  /**
   * [UI] 顯示搜尋結果
   * @param {Array<Array<any>>} data - 結果資料
   * @param {string} sheetName - 結果工作表名稱
   */
  showSearchResult: function(data, sheetName) {
    const ss = SpreadsheetApp.getActive();

    // Sheets 名稱限制與非法字元：做基本清理
    const safeName = String(sheetName)
      .replace(/[\\/?*\[\]:]/g, '_')
      .slice(0, 90);

    let sheet = ss.getSheetByName(safeName);
    if (sheet) sheet.clearContents();
    else sheet = ss.insertSheet(safeName);

    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    sheet.activate();
  },

  // ====================
  // 2) 自動加等號（保持你原本邏輯）
  // ====================

  /**
   * 當使用者在 G~L 的消耗量欄位輸入：
   * - "123" → 轉成 "=123"
   * - "5+5" → 轉成 "=5+5"
   *
   * ⚠️ 注意：
   * - 使用者本來就輸入公式（e.value 為 undefined）→ 不處理
   * - 多格貼上 → 不處理（避免誤傷）
   */
  autoConvertFormula: function(e) {
    const val = e.value;
    if (!val || e.range.getFormula()) return;

    if (!isNaN(Number(val))) e.range.setFormula('=' + val);
    else if (/^[0-9+\-*/().\s]+$/.test(val)) e.range.setFormula('=' + val);
  },

  // ====================
  // 3) 公式修復（停用）
  // ====================

  /**
   * 你已確認：修一次就夠了，平時不應再動。
   * 直接提示停用，避免誤按造成欄位覆寫。
   */
  promptFixFormulas: function() {
    SpreadsheetApp.getUi().alert('公式修復器已停用：目前架構已穩定，避免誤用破壞資料。');
  },
// ====================
// 4) 最大值分析（含狀態表即時更新 / 看門狗 / 無 Alert）
// ====================
ANALYSIS_CONFIG: {
  COLUMN_NAME: '理論總量',
  BATCH_SIZE: 5,

  // 只排除「明確不該被分析」的表；真正要分析誰，下面會再做「只分析補藥紀錄」的白名單過濾
  EXCLUDE_SHEETS: [CONFIG.TEMPLATE_SHEET_NAME, '設定表']
    .concat(CONFIG.PARAMS.OLD_TEMPLATE_SHEET_NAMES || [])
    .concat([ (CONFIG.PARAMS && CONFIG.PARAMS.ANALYSIS_STATUS_SHEET_NAME) || '分析狀態' ])
},

/**
 * [入口] 開始分批分析
 * - 不再跳 alert
 * - 會建立/更新「分析狀態」工作表，讓你自行開表檢查
 */
startMaxStockAnalysis: function() {
  // 清理舊狀態與舊觸發器
  this.cleanupMaxStockProperties();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allSheets = ss.getSheets();

  // ✅ 白名單：只分析「補藥紀錄」週報表
  // 同時排除：範本、OLD、設定表、分析狀態表
  // ✅ 新增：起始日期過濾（避免舊格式週報混入）
  const sheetNames = allSheets
      .map(s => s.getName())
      .filter(name => {
        // 只要補藥紀錄
        if (!name.includes('補藥紀錄')) return false;

        // 排除清單（範本/設定表/OLD）
        if (this.ANALYSIS_CONFIG.EXCLUDE_SHEETS.includes(name)) return false;

        // 排除「分析狀態」工作表本身（避免分析自己）
        if (name === this._getStatusSheetName_()) return false;

        // 起始日期過濾（解析不到新格式 → 視為舊表 → 排除）
        if (!this._isSheetAfterMinDate_(name, CONFIG.PARAMS.ANALYSIS_MIN_START_DATE)) return false;

        return true;
      });

  // 初始化狀態表（即時可觀測）
  this._initOrUpdateStatusSheet_({ phase: 'START', totalSheets: sheetNames.length });

  if (sheetNames.length === 0) {
    // 不跳 alert，只寫狀態
    this._writeStatus_({
      status: 'DONE',
      lastError: '無可分析工作表（請確認工作表名稱含「補藥紀錄」且未被排除）'
    });
    return;
  }

  const props = PropertiesService.getUserProperties();
  props.setProperty('sheetNames', JSON.stringify(sheetNames));
  props.setProperty('currentIndex', '0');

  // --- 分析狀態（可觀測性） ---
  props.setProperty('analysisStatus', 'RUNNING');
  props.setProperty('analysisStartedAt', String(Date.now()));
  props.setProperty('analysisLastHeartbeat', String(Date.now()));
  props.setProperty('analysisLastSheet', '');
  props.deleteProperty('analysisLastError');
  props.deleteProperty('analysisLastNotifiedAt');

  // 44 列（5~48）
  const NUM_ROWS = 44;
  props.setProperty('rowMaxValues', JSON.stringify(new Array(NUM_ROWS).fill(-Infinity)));
  props.setProperty('rowMaxLocations', JSON.stringify(new Array(NUM_ROWS).fill('')));

  // 記錄來源列的 D/E/F（藥名/劑量/英文成分）
  const rowMaxMeta = new Array(NUM_ROWS).fill(null).map(() => ({ name: '', dose: '', ing: '' }));
  props.setProperty('rowMaxMeta', JSON.stringify(rowMaxMeta));

  // 啟動看門狗 trigger（每 1/5/10/15/30 分鐘）
  this._armAnalysisWatchdog_();

  // 立即跑第一批
  this.processMaxStockBatch();
},

processMaxStockBatch: function() {
  const props = PropertiesService.getUserProperties();

  try {
    const currentIndex = parseInt(props.getProperty('currentIndex'), 10);
    const sheetNames = JSON.parse(props.getProperty('sheetNames'));
    if (!sheetNames || isNaN(currentIndex)) return;

    // 心跳：代表「這批開始跑了」
    props.setProperty('analysisLastHeartbeat', String(Date.now()));

    let rowMaxValues = JSON.parse(props.getProperty('rowMaxValues'));
    let rowMaxLocations = JSON.parse(props.getProperty('rowMaxLocations'));
    let rowMaxMeta = JSON.parse(props.getProperty('rowMaxMeta')) ||
      new Array(rowMaxValues.length).fill(null).map(() => ({ name: '', dose: '', ing: '' }));

    const sheetsToEnd = Math.min(currentIndex + this.ANALYSIS_CONFIG.BATCH_SIZE, sheetNames.length);

    // 狀態表：更新進度（本批開始）
    this._writeStatus_({
      status: 'RUNNING',
      progressText: `${sheetsToEnd} / ${sheetNames.length} (${Math.round((sheetsToEnd / sheetNames.length) * 100)}%)`,
      lastSheet: sheetNames[currentIndex] || ''
    });

    for (let i = currentIndex; i < sheetsToEnd; i++) {
      const sheetName = sheetNames[i];
      props.setProperty('analysisLastSheet', sheetName);

      // 狀態表：即時顯示正在分析哪張
      this._appendStatusLog_('處理中', sheetName);
      this._writeStatus_({ lastSheet: sheetName });

      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      if (!sheet) continue;

      const values = sheet.getDataRange().getValues();
      if (values.length < 5) continue;

      // 找欄位（容錯 Row 3 或 Row 4）
      let headers = values[2];
      let colIdx = headers.indexOf(this.ANALYSIS_CONFIG.COLUMN_NAME);
      if (colIdx === -1 && values.length > 3) {
        headers = values[3];
        colIdx = headers.indexOf(this.ANALYSIS_CONFIG.COLUMN_NAME);
      }
      if (colIdx === -1) continue;

      // 比對 Row 5 ~ Row 48（index 4~47）
      for (let j = 4; j <= 47; j++) {
        if (j >= values.length) break;

        const val = values[j][colIdx];
        const resultIdx = j - 4;

        if (typeof val === 'number' && !isNaN(val)) {
          if (val > rowMaxValues[resultIdx]) {
            rowMaxValues[resultIdx] = val;
            rowMaxLocations[resultIdx] = `'${sheetName}'`;

            // 同列抓 D/E/F（藥名/劑量/英文成分）
            rowMaxMeta[resultIdx] = {
              name: values[j][CONFIG.COLUMNS.DRUG_NAME - 1],
              dose: values[j][CONFIG.COLUMNS.DOSE - 1],
              ing:  values[j][CONFIG.COLUMNS.INGREDIENT - 1]
            };
          }
        }
      }
    }

    // 心跳：代表「這批跑完了」
    props.setProperty('analysisLastHeartbeat', String(Date.now()));

    props.setProperty('currentIndex', String(sheetsToEnd));
    props.setProperty('rowMaxValues', JSON.stringify(rowMaxValues));
    props.setProperty('rowMaxLocations', JSON.stringify(rowMaxLocations));
    props.setProperty('rowMaxMeta', JSON.stringify(rowMaxMeta));

    // 狀態表：更新進度（本批完成）
    this._appendStatusLog_('完成一批', sheetNames[sheetsToEnd - 1] || '');
    this._writeStatus_({
      status: 'RUNNING',
      progressText: `${sheetsToEnd} / ${sheetNames.length} (${Math.round((sheetsToEnd / sheetNames.length) * 100)}%)`
    });

    if (sheetsToEnd < sheetNames.length) {
      ScriptApp.newTrigger('continueMaxStockBatch').timeBased().after(10 * 1000).create();
    } else {
      props.setProperty('analysisStatus', 'DONE');

      // 先產出報表、再寫回狀態表的可點連結
      const reportUrl = this.createMaxStockReport_(); // ✅ 回傳 URL（不 alert）

      this._appendStatusLog_('分析完成', sheetNames[sheetNames.length - 1] || '');
      this._writeStatus_({
        status: 'DONE',
        progressText: `${sheetNames.length} / ${sheetNames.length} (100%)`,
        reportUrl: reportUrl || ''
      });

      // 完成後看門狗可以關掉
      this._disarmAnalysisWatchdog_();
    }

  } catch (err) {
    props.setProperty('analysisStatus', 'ERROR');
    props.setProperty('analysisLastError', String(err && err.stack ? err.stack : err));
    props.setProperty('analysisLastHeartbeat', String(Date.now()));

    // 不 alert，只寫狀態表
    this._appendStatusLog_('錯誤', props.getProperty('analysisLastSheet') || '');
    this._writeStatus_({
      status: 'ERROR',
      lastError: props.getProperty('analysisLastError') || 'Unknown error'
    });

    // 錯誤通知（你之後要開啟 email 通知再用）
    this._notifyAnalysis_('ERROR', `最大值分析發生錯誤：\n${props.getProperty('analysisLastError') || ''}`);

    // 出錯後關掉看門狗（避免一直通知）
    this._disarmAnalysisWatchdog_();
  }
},

/**
 * [結尾] 建立報表（改成私有方法：回傳 URL）
 * - 不跳 alert
 * - 回傳 report spreadsheet URL，讓狀態表可寫入超連結
 * @return {string} 報表網址
 */
createMaxStockReport_: function() {
  const props = PropertiesService.getUserProperties();

  const rawValues = props.getProperty('rowMaxValues');
  const rawLocs = props.getProperty('rowMaxLocations');
  const rawMeta = props.getProperty('rowMaxMeta');

  const rowMaxValues = rawValues ? JSON.parse(rawValues) : null;
  const rowMaxLocations = rawLocs ? JSON.parse(rawLocs) : null;
  let rowMaxMeta = rawMeta ? JSON.parse(rawMeta) : null;

  if (!Array.isArray(rowMaxValues) || !Array.isArray(rowMaxLocations)) {
    // 不 alert，只寫狀態表
    this._writeStatus_({
      status: 'ERROR',
      lastError: '分析狀態遺失（rowMaxValues/rowMaxLocations 不存在）。建議「強制重設分析」後重跑。'
    });
    return '';
  }

  if (!Array.isArray(rowMaxMeta) || rowMaxMeta.length !== rowMaxValues.length) {
    rowMaxMeta = new Array(rowMaxValues.length).fill(null).map(() => ({ name: '', dose: '', ing: '' }));
  }

  const output = [['原始列號', '最大值', '來源工作表', '藥名(D)', '劑量(E)', '英文成分(F)']];
  for (let i = 0; i < rowMaxValues.length; i++) {
    const v = rowMaxValues[i] === -Infinity ? '無數據' : rowMaxValues[i];
    const loc = v === '無數據' ? '' : rowMaxLocations[i];
    const meta = rowMaxMeta[i] || { name: '', dose: '', ing: '' };
    output.push([i + 5, v, loc, meta.name, meta.dose, meta.ing]);
  }

  const reportSs = SpreadsheetApp.create(`理論總量最大值_${new Date().toLocaleString()}`);
  const reportSheet = reportSs.getSheets()[0];

  reportSheet.getRange(1, 1, output.length, output[0].length).setValues(output);

  // 清理分析資料（保留狀態 keys 讓你可追溯）
  this.cleanupMaxStockProperties();

  return reportSs.getUrl();
},

/**
 * 看門狗：定期檢查分析是否卡住
 * - RUNNING 且心跳超過 STALL_SECONDS → 通知（會節流）
 */
analysisWatchdog: function() {
  if (!CONFIG.ANALYSIS_NOTIFY || !CONFIG.ANALYSIS_NOTIFY.ENABLED) return;

  const props = PropertiesService.getUserProperties();
  const status = props.getProperty('analysisStatus') || 'IDLE';
  if (status !== 'RUNNING') return;

  const hb = Number(props.getProperty('analysisLastHeartbeat') || 0);
  const lastSheet = props.getProperty('analysisLastSheet') || '';
  const now = Date.now();

  const stallSec = Number(CONFIG.ANALYSIS_NOTIFY.STALL_SECONDS || 180);
  if (!hb) return;

  const ageSec = Math.round((now - hb) / 1000);
  if (ageSec > stallSec) {
    this._notifyAnalysis_(
      'STALL',
      `最大值分析可能卡住：最後心跳已超過 ${stallSec}s（目前 ${ageSec}s）。\n最後處理工作表：${lastSheet || '(未知)'}\n建議：請使用「強制重設分析」後重新開始。`
    );
  }
},

/**
 * 只清理「最大值分析」相關 properties（避免影響其他模組）
 */
cleanupMaxStockProperties: function() {
  const props = PropertiesService.getUserProperties();
  props.deleteProperty('sheetNames');
  props.deleteProperty('currentIndex');
  props.deleteProperty('rowMaxValues');
  props.deleteProperty('rowMaxLocations');
  props.deleteProperty('rowMaxMeta');

  // 清除 batch 觸發器
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'continueMaxStockBatch') {
      ScriptApp.deleteTrigger(t);
    }
  }
},

forceResetAnalysis: function() {
  // 清掉分析資料 + 狀態
  const props = PropertiesService.getUserProperties();
  this.cleanupMaxStockProperties();

  props.deleteProperty('analysisStatus');
  props.deleteProperty('analysisStartedAt');
  props.deleteProperty('analysisLastHeartbeat');
  props.deleteProperty('analysisLastSheet');
  props.deleteProperty('analysisLastError');
  props.deleteProperty('analysisLastNotifiedAt');

  // 關掉看門狗
  this._disarmAnalysisWatchdog_();

  // 不 alert，只寫狀態表
  this._writeStatus_({
    status: 'IDLE',
    lastError: '已強制清除所有分析進度與排程。'
  });
},

// ====================
// 狀態表（即時顯示）相關 helper
// ====================

/**
 * 取得「分析狀態」工作表名稱（可讓你之後放到 CONFIG 調整）
 */
_getStatusSheetName_: function() {
  // 若你願意之後放 CONFIG.PARAMS.ANALYSIS_STATUS_SHEET_NAME，就能改成讀設定
  return (CONFIG.PARAMS && CONFIG.PARAMS.ANALYSIS_STATUS_SHEET_NAME) || '分析狀態';
},

/**
 * 初始化/更新狀態表骨架（若不存在就建立）
 */
_initOrUpdateStatusSheet_: function(ctx) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = this._getStatusSheetName_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  // 表頭
  sheet.getRange('A1').setValue('最大值分析狀態（即時）');

  // 固定欄位（跟你截圖一致）
  sheet.getRange('A3').setValue('狀態');
  sheet.getRange('A4').setValue('開始時間');
  sheet.getRange('A5').setValue('最後心跳');
  sheet.getRange('A6').setValue('進度');
  sheet.getRange('A7').setValue('目前處理工作表');
  sheet.getRange('A8').setValue('最後錯誤');
  sheet.getRange('A9').setValue('報表連結');

  sheet.getRange('A11').setValue('時間');
  sheet.getRange('B11').setValue('事件');
  sheet.getRange('C11').setValue('工作表');

  // 初始狀態
  if (ctx && ctx.phase === 'START') {
    this._writeStatus_({
      status: 'RUNNING',
      progressText: `0 / ${ctx.totalSheets || 0} (0%)`,
      lastSheet: ''
    });
    this._appendStatusLog_('開始分析', '');
  }
},

/**
 * 寫入狀態區（不跳 alert）
 * @param {{status?:string, progressText?:string, lastSheet?:string, lastError?:string, reportUrl?:string}} patch
 */
_writeStatus_: function(patch) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(this._getStatusSheetName_());
  if (!sheet) return;

  const props = PropertiesService.getUserProperties();
  const tz = Session.getScriptTimeZone();

  // 狀態
  if (patch.status !== undefined) sheet.getRange('B3').setValue(patch.status);

  // 開始時間 / 心跳
  const startedAt = Number(props.getProperty('analysisStartedAt') || 0);
  const hb = Number(props.getProperty('analysisLastHeartbeat') || 0);

  sheet.getRange('B4').setValue(startedAt ? Utilities.formatDate(new Date(startedAt), tz, 'yyyy/MM/dd HH:mm') : '');
  sheet.getRange('B5').setValue(hb ? Utilities.formatDate(new Date(hb), tz, 'yyyy/MM/dd HH:mm') : '');

  // 進度
  if (patch.progressText !== undefined) sheet.getRange('B6').setValue(patch.progressText);

  // 目前工作表
  if (patch.lastSheet !== undefined) sheet.getRange('B7').setValue(patch.lastSheet);

  // 錯誤
  if (patch.lastError !== undefined) sheet.getRange('B8').setValue(patch.lastError);

  // 報表連結：寫成可點的超連結
  if (patch.reportUrl !== undefined) {
    const url = String(patch.reportUrl || '').trim();
    if (url) {
      sheet.getRange('B9').setFormula(`=HYPERLINK("${url}","開啟報表")`);
    } else {
      sheet.getRange('B9').clearContent();
    }
  }
},

/**
 * 追加狀態 log（從第 12 列開始）
 */
_appendStatusLog_: function(eventText, sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(this._getStatusSheetName_());
  if (!sheet) return;

  const tz = Session.getScriptTimeZone();
  const nowText = Utilities.formatDate(new Date(), tz, 'yyyy/MM/dd HH:mm');

  // 找到下一列（至少從 12 開始）
  const startRow = 12;
  const last = Math.max(sheet.getLastRow(), startRow - 1);
  const row = last < startRow ? startRow : last + 1;

  sheet.getRange(row, 1, 1, 3).setValues([[nowText, eventText, sheetName || '']]);
},

// ====================
// 通知/看門狗 helper
// ====================

/**
 * 啟動看門狗 trigger（everyMinutes 只接受 1/5/10/15/30）
 */
_armAnalysisWatchdog_: function() {
  if (!CONFIG.ANALYSIS_NOTIFY || !CONFIG.ANALYSIS_NOTIFY.ENABLED) return;

  // ✅ GAS 限制：only 1,5,10,15,30
  const allowed = [1, 5, 10, 15, 30];
  const want = Number(CONFIG.ANALYSIS_NOTIFY.WATCHDOG_MINUTES || 5);
  const minutes = allowed.includes(want) ? want : 5;

  // 先刪除舊的看門狗
  this._disarmAnalysisWatchdog_();

  ScriptApp.newTrigger('analysisWatchdog')
    .timeBased()
    .everyMinutes(minutes)
    .create();
},

/**
 * 關閉看門狗 trigger
 */
_disarmAnalysisWatchdog_: function() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'analysisWatchdog') {
      ScriptApp.deleteTrigger(t);
    }
  }
},

/**
 * 寄送通知（含節流）
 * @param {'ERROR'|'STALL'|'DONE'} type
 * @param {string} message
 */
_notifyAnalysis_: function(type, message) {
  if (!CONFIG.ANALYSIS_NOTIFY || !CONFIG.ANALYSIS_NOTIFY.ENABLED) return;

  const props = PropertiesService.getUserProperties();
  const now = Date.now();

  const throttleMin = Number(CONFIG.ANALYSIS_NOTIFY.THROTTLE_MINUTES || 10);
  const lastNotifiedAt = Number(props.getProperty('analysisLastNotifiedAt') || 0);

  if (lastNotifiedAt && (now - lastNotifiedAt) < throttleMin * 60 * 1000) return;
  props.setProperty('analysisLastNotifiedAt', String(now));

  let recipients = (CONFIG.ANALYSIS_NOTIFY.EMAILS || []).filter(Boolean);
  if (recipients.length === 0) {
    const me = Session.getActiveUser().getEmail();
    if (me) recipients = [me];
  }
  if (recipients.length === 0) return;

  const subject = `[補藥系統] 最大值分析通知：${type}`;
  const body =
    `${message}\n\n` +
    `狀態：${props.getProperty('analysisStatus') || ''}\n` +
    `開始時間：${this._fmtTs_(props.getProperty('analysisStartedAt'))}\n` +
    `最後心跳：${this._fmtTs_(props.getProperty('analysisLastHeartbeat'))}\n` +
    `最後工作表：${props.getProperty('analysisLastSheet') || ''}\n`;

  try {
    MailApp.sendEmail(recipients.join(','), subject, body);
  } catch (e) {
    console.log(`通知寄送失敗：${e}`);
  }
},

_fmtTs_: function(tsStr) {
  const t = Number(tsStr || 0);
  if (!t) return '(無)';
  return Utilities.formatDate(new Date(t), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
},

// ====================
// 5) 緊急停止
// ====================
/**
   * [緊急停止] 強制重設
   * - 清除分析資料與狀態
   * - 移除看門狗 trigger
   */
  forceResetAnalysis: function() {
    const props = PropertiesService.getUserProperties();

    this.cleanupMaxStockProperties();

    // 清掉分析狀態
    props.deleteProperty('analysisStatus');
    props.deleteProperty('analysisStartedAt');
    props.deleteProperty('analysisLastHeartbeat');
    props.deleteProperty('analysisLastSheet');
    props.deleteProperty('analysisLastError');
    props.deleteProperty('analysisLastNotifiedAt');

    // 關掉看門狗
    this._disarmAnalysisWatchdog_();

    // 狀態表也寫一筆，避免你以為還在跑
    this._updateAnalysisStatusSheet_({
      status: 'IDLE',
      startedAt: 0,
      heartbeatAt: 0,
      currentIndex: 0,
      total: 0,
      currentSheetName: '',
      lastError: '',
      event: '已強制重設'
    });

    // ✅ 不要 alert：改 toast
    try {
      SpreadsheetApp.getActive().toast('已強制清除分析進度與排程（請至「分析狀態」確認）', '已重設', 5);
    } catch (e) {}
  },
  // ====================
  // helpers（務必放在物件內，且前面方法要有逗號）
  // ====================
  /**
   * [helper] 解析週報表名稱的「起始日」
   * 只支援你目前主格式：
   * - 2026/01/14~2026/01/20補藥紀錄
   *
   * 若不是此格式（例如舊格式），回傳 null → 讓呼叫端決定要不要跳過。
   * @param {string} sheetName
   * @return {Date|null}
   */
  _parseSheetStartDate_: function(sheetName) {
    const name = String(sheetName || '').trim();
    // 只吃新格式：yyyy/MM/dd~yyyy/MM/dd補藥紀錄
    const m = name.match(/^(\d{4})\/(\d{2})\/(\d{2})[~-]/);
    if (!m) return null;

    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);

    // 用當地時區的「中午」避免 DST/時區跨日問題
    return new Date(y, mo - 1, d, 12, 0, 0);
  },

  /**
   * [helper] 判斷工作表是否 >= 起始日期（含）
   * @param {string} sheetName
   * @param {string} minDateStr - yyyy/MM/dd
   * @return {boolean} true 代表允許納入
   */
  _isSheetAfterMinDate_: function(sheetName, minDateStr) {
    const min = String(minDateStr || '').trim();
    if (!min) return true; // 沒設定就不限制

    const m = min.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!m) return true; // 格式不對就不限制（避免你打錯日期整個不能用）

    const minDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    const startDate = this._parseSheetStartDate_(sheetName);

    // ⚠️ 如果不是新格式（解析不到），一律視為「舊表」→ 排除
    if (!startDate) return false;

    return startDate.getTime() >= minDate.getTime();
  },
  /**
   * [helper] 解析劑量 token
   * 支援：
   * - "0.5" / "1" / "0.25"
   * - "0.5mg" / "1mg"
   * @return {null | {raw: string, numStr: string}}
   */
  _parseDoseToken_: function(token) {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return null;

    // 形如：0.5 或 0.5mg
    const m = t.match(/^(\d+(?:\.\d+)?)(?:\s*mg)?$/i);
    if (!m) return null;

    return { raw: token, numStr: m[1] };
  },

  /**
   * [helper] 劑量比對
   * - 只用「數字部分」比對，避免 "0.5" vs "0.5mg" 不一致
   * @param {any} cellDose - E 欄儲存格值
   * @param {{raw: string, numStr: string}} doseFilter
   * @return {boolean}
   */
  _matchDose_: function(cellDose, doseFilter) {
    const s = String(cellDose || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return false;

    const m = s.match(/^(\d+(?:\.\d+)?)/);
    if (!m) return false;

    return m[1] === String(doseFilter.numStr);
  }

};