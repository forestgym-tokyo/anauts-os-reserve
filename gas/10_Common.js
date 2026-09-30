/**
 * シート取得
 * @param {string} sheetName
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`シートが見つかりません: ${sheetName}`);
  }

  return sheet;
}

/**
 * シートの全データ取得（1行目をヘッダーとしてオブジェクト化）
 * @param {string} sheetName
 * @returns {Object[]}
 */
function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers = values[0];

  return values.slice(1).map(row => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    return obj;
  });
}

/**
 * オブジェクトをシートへ追加
 * @param {string} sheetName
 * @param {Object} data
 */
function appendRow(sheetName, data) {
  const sheet = getSheet(sheetName);

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  const row = headers.map(header =>
    Object.prototype.hasOwnProperty.call(data, header)
      ? data[header]
      : ""
  );

  sheet.appendRow(row);
}