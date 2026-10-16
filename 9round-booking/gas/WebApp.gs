/** Entry point for a NEW standalone Apps Script project, never the A-nauts project. */
function doGet(e) {
  const page = String(e && e.parameter && e.parameter.page || "");
  if (page === "member" || page === "staff") {
    const template = HtmlService.createTemplateFromFile(page === "staff" ? "Staff" : "Member");
    template.configJson = JSON.stringify({
      apiUrl: "google.script.run",
      firebaseApiKey: PropertiesService.getScriptProperties().getProperty("ROUND9_BOOKING_FIREBASE_API_KEY") || "",
      initialBookingId: /^[a-f0-9]{64}$/.test(String(e.parameter.booking_id || "")) ? String(e.parameter.booking_id) : "",
      initialIntent: ["cancel", "change"].indexOf(String(e.parameter.intent || "")) >= 0 ? String(e.parameter.intent) : "",
      requestTimeoutMs: 30000
    });
    return template.evaluate()
      .setTitle(page === "staff" ? "予約管理 | 9ROUND アリオ蘇我店" : "ワークアウト予約 | 9ROUND アリオ蘇我店")
      .addMetaTag("viewport", "width=device-width,initial-scale=1,viewport-fit=cover");
  }
  return successResponse({ app: "9ROUND Booking", status: "ok" });
}

/** HTML-service transport; the exact same server-side authentication is applied. */
function nineRoundBookingRequest(body) {
  if (!body || Array.isArray(body) || typeof body !== "object") return { ok: false, code: "INVALID_REQUEST", message: "リクエスト形式を確認してください。" };
  return JSON.parse(round9BookingApi_(String(body.action || "").trim(), body).getContent());
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
