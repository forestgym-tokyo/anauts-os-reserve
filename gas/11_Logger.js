/**
 * システムログ出力
 *
 * @param {string} level
 * @param {string} location
 * @param {string} message
 * @param {Object=} detail
 */
function writeSystemLog(level, location, message, detail = {}) {

  appendRow(APP_CONFIG.SHEETS.SYSTEM_LOGS, {
    log_id: Utilities.getUuid(),
    level: level,
    location: location,
    message: message,
    stack: JSON.stringify(detail),
    created_at: new Date()
  });

}

/**
 * INFOログ
 */
function logInfo(location, message, detail = {}) {
  writeSystemLog("INFO", location, message, detail);
}

/**
 * WARNログ
 */
function logWarn(location, message, detail = {}) {
  writeSystemLog("WARN", location, message, detail);
}

/**
 * ERRORログ
 */
function logError(location, error) {

  writeSystemLog(
    "ERROR",
    location,
    error.message || String(error),
    {
      stack: error.stack || ""
    }
  );

}