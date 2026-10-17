/**
 * Standalone staff auth. Uses the existing Firebase account and reads the staff
 * directory only. Never calls the A-nauts GAS or creates/updates its sheets.
 * Member booking has no dependency on this file or the staff directory.
 */
function nrBookingVerifiedStaff_(config, body) {
  const p = PropertiesService.getScriptProperties().getProperties();
  const token = String(body.id_token || "").trim();
  if (!token || token.length > 10000) nrBookingError_("STAFF_SESSION_EXPIRED", "スタッフとしてログインしてください。");
  const key = String(p.ROUND9_BOOKING_FIREBASE_API_KEY || "").trim();
  const directoryId = String(p.ROUND9_BOOKING_STAFF_DIRECTORY_ID || "").trim();
  if (!key || !directoryId || directoryId === config.dataId || directoryId === config.masterId) {
    nrBookingError_("BOOKING_CONFIGURATION", "スタッフ認証の接続設定を確認してください。");
  }
  const response = UrlFetchApp.fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(key),
    { method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true }
  );
  let json;
  try { json = JSON.parse(response.getContentText() || "{}"); } catch (_) { json = {}; }
  if (response.getResponseCode() !== 200 || !json.users || json.users.length !== 1 || json.users[0].disabled) {
    nrBookingError_("STAFF_SESSION_EXPIRED", "ログインの有効期限が切れました。再度ログインしてください。");
  }
  const email = String(json.users[0].email || "").trim().toLowerCase();
  if (!email || (config.environment === "development" && config.testEmails.indexOf(email) < 0)) {
    nrBookingError_("FORBIDDEN", "この環境を利用するスタッフ権限がありません。");
  }
  const directory = SpreadsheetApp.openById(directoryId);
  const accessRows = nrBookingDirectoryRows_(directory, "auth_users", ["email", "staff_code", "permission", "active"])
    .filter(function (row) { return row.email.toLowerCase() === email; });
  if (accessRows.length !== 1 || !nrBookingStaffBoolean_(accessRows[0].active)) {
    nrBookingError_("FORBIDDEN", "有効なスタッフ権限がありません。");
  }
  const access = accessRows[0];
  const permission = access.permission.toUpperCase();
  if (["ADMIN", "MANAGER", "STAFF"].indexOf(permission) < 0) nrBookingError_("FORBIDDEN", "スタッフ権限を確認してください。");
  const matches = nrBookingDirectoryRows_(directory, "staff", ["staff_code", "store_code", "active"])
    .filter(function (row) { return row.staff_code === access.staff_code; });
  if (matches.length !== 1 || !nrBookingStaffBoolean_(matches[0].active)) nrBookingError_("FORBIDDEN", "スタッフ登録が無効です。");
  const staff = matches[0];
  if (permission === "STAFF" && staff.store_code.toUpperCase() !== "SOGA" && !nrBookingStaffBoolean_(staff.can_9round)) {
    nrBookingError_("FORBIDDEN", "9ROUNDの予約情報を閲覧する権限がありません。");
  }
  return { email: email, staff_code: access.staff_code, permission: permission };
}

function nrBookingDirectoryRows_(spreadsheet, name, required) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) nrBookingError_("BOOKING_CONFIGURATION", "スタッフ名簿の設定を確認してください。");
  const values = sheet.getDataRange().getDisplayValues();
  const headers = (values[0] || []).map(function (value) { return String(value).trim(); });
  if (required.some(function (header) { return headers.indexOf(header) < 0; })) {
    nrBookingError_("BOOKING_CONFIGURATION", "スタッフ名簿の列構成を確認してください。");
  }
  return values.slice(1).map(function (valuesRow) {
    const row = {};
    headers.forEach(function (header, i) { row[header] = String(valuesRow[i] || "").trim(); });
    return row;
  });
}

function nrBookingStaffBoolean_(value) {
  return ["true", "1", "yes", "on"].indexOf(String(value || "").toLowerCase()) >= 0;
}
