function myFunction() {
  function createWeeklySheet() {
  // 範本試算表的ID
  var templateId = '好藥局管藥庫存11.xlsx 的副本';

  // 獲取當前日期並格式化
  var date = new Date();
  var formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // 從範本創建新的試算表
  var newSpreadsheet = DriveApp.getFileById(templateId).makeCopy('Weekly Inventory ' + formattedDate);
  var newSpreadsheetId = newSpreadsheet.getId();

  // 打開新的試算表
  var ss = SpreadsheetApp.openById(newSpreadsheetId);
  var sheet = ss.getSheets()[0];

  // 更新新試算表中的日期單元格
  sheet.getRange('A1').setValue(formattedDate);

  // 獲取上週的試算表
  var previousDate = new Date(date);
  previousDate.setDate(date.getDate() - 7);
  var formattedPreviousDate = Utilities.formatDate(previousDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var previousSpreadsheetName = 'Weekly Inventory ' + formattedPreviousDate;

  var files = DriveApp.getFilesByName(previousSpreadsheetName);
  if (files.hasNext()) {
    var previousSpreadsheet = SpreadsheetApp.open(files.next());
    var previousSheet = previousSpreadsheet.getSheets()[0];

    // 假設庫存數據從第2行開始，並位於B列
    var previousInventory = previousSheet.getRange('B2:B').getValues();

    // 將上週的庫存數據設置到新的試算表中
    sheet.getRange('B2:B').setValues(previousInventory);
  }
}

}
