/** TOUR-only request memoization and a receipt published after durable booking writes. */
function beginTourBookingReadCache_() {
  const originalRead = getSheetData;
  const originalMailRead = getReservationMailRows_;
  const rows = Object.create(null);
  const originalGetSheet = typeof getSheet === "function" ? getSheet : null;
  const sheets = Object.create(null);
  if (originalGetSheet) getSheet = function(name) {
    const key = String(name);
    if (!Object.prototype.hasOwnProperty.call(sheets, key)) sheets[key] = originalGetSheet(name);
    return sheets[key];
  };
  getSheetData = function(name) {
    const key = String(name);
    if (!Object.prototype.hasOwnProperty.call(rows, key)) rows[key] = originalRead(name);
    return rows[key];
  };
  getReservationMailRows_ = function(name) { return getSheetData(name); };
  return function() {
    if (originalGetSheet) getSheet = originalGetSheet;
    getSheetData = originalRead;
    getReservationMailRows_ = originalMailRead;
  };
}

function rememberTourBookingReceipt_(params, result) {
  const id = String(params && params.request_id || "");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) return;
  try {
    CacheService.getScriptCache().put("tfg-tour-receipt-v1:" + id, JSON.stringify({
      confirmed: true, reservation_id: result.reservation_id, status: result.status,
      service_code: "TOUR", date: result.date, start_time: result.start_time,
      party_size: result.party_size, mail_status: result.mail_status
    }), 600);
  } catch (_) {
    // The normal POST response remains authoritative if the short-lived receipt is unavailable.
  }
}

/** No sheet reads, lock, or customer information. The unguessable request ID is required. */
function getTourBookingStatus_(params) {
  const id = String(params && params.request_id || "");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) return errorResponse("予約リクエストIDが不正です。", "INVALID_REQUEST_ID");
  try {
    const raw = CacheService.getScriptCache().get("tfg-tour-receipt-v1:" + id);
    if (raw) return successResponse(JSON.parse(raw));
  } catch (_) {}
  return successResponse({confirmed: false});
}

/** Called only after the calendar event, reservation and history have been written. */
function completeTourBooking_(params, guests, reservation, result, lock) {
  result.party_size = guests.guests.length;
  result.mail_status = "sending";

  // From here on, notification/log/cache failures cannot undo a committed reservation.
  try { clearStoreAwareSnapshotCache_(); } catch (_) {}
  try { bumpTourWeekCacheGeneration_(); } catch (_) {}
  rememberTourBookingReceipt_(params, result);
  // Mail delivery must not hold the global reservation lock for other customers.
  try { lock.releaseLock(); } catch (_) {}
  try { logInfo("createReservation", "予約登録成功", result); } catch (_) {}
  try {
    const notification = sendReservationMailSafely_(reservation, "RESERVATION_CREATED", "createReservation");
    result.mail_status = notification && notification.customer_mails && notification.customer_mails.length &&
      notification.customer_mails.every(function(item) { return item.ok; }) ? "sent" : "pending";
  } catch (_) { result.mail_status = "pending"; }
  rememberTourBookingReceipt_(params, result);
  return successResponse(result, "予約を登録しました。");
}

/** One formatting operation preserves text IDs/phone numbers and all other cell formats. */
function formatTourReservationTextCells_(sheet, rowNumber, headers, textHeaders) {
  const addresses = [];
  headers.forEach(function(header, index) {
    if (textHeaders.has(header)) addresses.push("R" + rowNumber + "C" + (index + 1));
  });
  if (addresses.length) sheet.getRangeList(addresses).setNumberFormat("@");
}

/** Query only the requested interval, under the booking lock, including spanning/all-day events. */
function getTourBookingCalendarPeriods_(calendar, startAt, endAt) {
  return calendar.getEvents(startAt, endAt).map(function(event) {
    return {start_at: event.getStartTime(), end_at: event.getEndTime()};
  });
}
