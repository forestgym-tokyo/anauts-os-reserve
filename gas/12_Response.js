/**
 * JSONレスポンスを返す
 *
 * @param {Object} data
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 成功レスポンス
 *
 * @param {*} data
 * @param {string=} message
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function successResponse(data, message) {
  return jsonResponse({
    ok: true,
    message: message || "",
    data: data === undefined ? null : data,
    timestamp: new Date().toISOString()
  });
}

/**
 * エラーレスポンス
 *
 * @param {string} message
 * @param {string=} code
 * @param {*=} detail
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function errorResponse(message, code, detail) {
  return jsonResponse({
    ok: false,
    code: code || "SYSTEM_ERROR",
    message: message || "エラーが発生しました。",
    detail: detail === undefined ? null : detail,
    timestamp: new Date().toISOString()
  });
}