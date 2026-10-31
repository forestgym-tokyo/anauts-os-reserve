/** TOUR-only guest records and retry protection. Existing sheets keep their schema. */
function tourBookingData_(note) {
  const marker = "\nTFG_TOUR_DATA:";
  const text = String(note || ""), index = text.lastIndexOf(marker);
  if (index < 0) return null;
  try { return JSON.parse(text.slice(index + marker.length)); } catch (_) { return null; }
}

function validateTourGuests_(params) {
  const fail = function(message) { const error = new Error(message); error.tourCode = "VALIDATION_ERROR"; throw error; };
  const size = params.party_size === undefined ? 1 : Number(params.party_size);
  if (size !== 1 && size !== 2) fail("見学人数は1名または2名を指定してください。");
  const guests = params.guests === undefined && size === 1
    ? [{name: params.customer_name, phone: params.customer_phone, email: params.customer_email}]
    : params.guests;
  if (!Array.isArray(guests) || guests.length !== size) fail("見学者全員の情報を入力してください。");
  const normalized = guests.map(function(guest) {
    const name = String(guest && guest.name || "").trim();
    const phone = String(guest && guest.phone || "").trim();
    const email = String(guest && guest.email || "").trim();
    if (!name || name.length > 80 || /[\r\n\x00-\x1f]/.test(name)) fail("見学者の氏名を正しく入力してください。");
    if (!/^[+0-9()\-\s]{9,25}$/.test(phone) || phone.replace(/\D/g, "").length < 9) fail("見学者の電話番号を正しく入力してください。");
    if (email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) fail("見学者のメールアドレスを正しく入力してください。");
    return {name: name, phone: phone, email: email};
  });
  if (normalized[0].name !== String(params.customer_name || "").trim() ||
      normalized[0].phone !== String(params.customer_phone || "").trim() ||
      normalized[0].email.toLowerCase() !== String(params.customer_email || "").trim().toLowerCase()) fail("見学者1の情報が一致しません。");
  const requestId = String(params.request_id || "");
  if (requestId && !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) fail("予約リクエストIDが不正です。");
  return {guests: normalized, request_id: requestId};
}

function buildTourBookingNote_(data) {
  return "見学人数：" + data.guests.length + "名\n" + data.guests.map(function(g, i) {
    return "見学者" + (i + 1) + " 氏名：" + g.name + "\n電話番号：" + g.phone + "\nメールアドレス：" + g.email;
  }).join("\n") + "\nTFG_TOUR_DATA:" + JSON.stringify(data);
}

/** Called under the reservation script lock, before checking current availability. */
function findTourBookingRetry_(params, data) {
  const existing = getSheetData(APP_CONFIG.SHEETS.RESERVATIONS).find(function(row) {
    const saved = tourBookingData_(row.note);
    if (row.service_code !== "TOUR" || !saved) return false;
    if (data.request_id && saved.request_id === data.request_id) return true;
    return row.status === "RESERVED" && JSON.stringify(saved.guests) === JSON.stringify(data.guests) &&
      formatAvailabilityDate_(row.reservation_date) === params.date &&
      formatAvailabilityTime_(row.start_time) === normalizeReservationTime_(params.start_time);
  });
  if (!existing) return null;
  const saved = tourBookingData_(existing.note);
  if (JSON.stringify(saved.guests) !== JSON.stringify(data.guests) ||
      formatAvailabilityDate_(existing.reservation_date) !== params.date ||
      formatAvailabilityTime_(existing.start_time) !== normalizeReservationTime_(params.start_time))
    return errorResponse("同じリクエストIDを別の予約には使用できません。", "REQUEST_ID_CONFLICT");
  return successResponse({reservation_id: existing.reservation_id, status: existing.status,
    date: params.date, start_time: normalizeReservationTime_(params.start_time), party_size: data.guests.length,
    already_registered: true, mail_status: "unknown"}, "登録済みの予約です。再登録・メール再送は行いません。");
}

/** Run once in the existing Apps Script editor after deployment; never recreates sheets. */
function configureTfgTourBookingRules_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet(APP_CONFIG.SHEETS.SERVICES);
    const rows = sheet.getDataRange().getValues(), headers = rows[0].map(String);
    const index = headers.indexOf("service_code");
    if (index < 0) throw new Error("services.service_code is missing");
    const matches = rows.map(function(row, i) { return i > 0 && String(row[index]).trim() === "TOUR" ? i : -1; }).filter(function(i) { return i >= 0; });
    if (matches.length !== 1) throw new Error("Exactly one TOUR service is required");
    const rules = {booking_min_hours: 1, duration: 60, slot_interval_minutes: 30};
    Object.keys(rules).forEach(function(key) { if (headers.indexOf(key) < 0) throw new Error("Missing services column: " + key); });
    Object.keys(rules).forEach(function(key) { sheet.getRange(matches[0] + 1, headers.indexOf(key) + 1).setValue(rules[key]); });
    SpreadsheetApp.flush();
    clearStoreAwareSnapshotCache_();
    bumpTourWeekCacheGeneration_();
    return {service_code: "TOUR", rules: rules};
  } finally { lock.releaseLock(); }
}
