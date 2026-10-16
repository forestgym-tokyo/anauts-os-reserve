/** Entry point for a NEW standalone Apps Script project, never the A-nauts project. */
function doGet() {
  return successResponse({ app: "9ROUND Booking", status: "ok" });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e && e.postData && e.postData.contents || "{}");
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error("invalid body");
  } catch (_) {
    return errorResponse("リクエスト形式を確認してください。", "INVALID_REQUEST");
  }
  return round9BookingApi_(String(body.action || "").trim(), body);
}

function nrBookingJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function successResponse(data) {
  return nrBookingJson_({ ok: true, data: data });
}

function errorResponse(message, code) {
  return nrBookingJson_({ ok: false, message: message, code: code });
}
