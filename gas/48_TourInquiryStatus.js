/**
 * A-nauts OS Reserve
 * 48_TourInquiryStatus.gs
 * 店内見学 問い合わせ対応状況
 */

function setTourInquiryStatus(params) {
  try {
    params = params || {};
    const reservationId = String(params.reservation_id || "").trim();
    const status = String(params.inquiry_status || "").trim().toUpperCase();

    if (!reservationId) {
      return errorResponse("reservation_idを指定してください。","VALIDATION_ERROR");
    }
    if (!["PENDING","DONE"].includes(status)) {
      return errorResponse("inquiry_statusはPENDINGまたはDONEを指定してください。","VALIDATION_ERROR");
    }

    const sheet = getSheet(APP_CONFIG.SHEETS.RESERVATIONS);
    ensureTourInquiryHeaders_(sheet);

    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(v => String(v || "").trim());
    const idCol = headers.indexOf("reservation_id");
    if (idCol < 0) throw new Error("reservationsにreservation_id列がありません。");

    let rowNumber = -1;
    for (let r=1; r<values.length; r++) {
      if (String(values[r][idCol] || "").trim() === reservationId) {
        rowNumber = r + 1;
        break;
      }
    }
    if (rowNumber < 0) {
      return errorResponse("予約が見つかりません。","RESERVATION_NOT_FOUND");
    }

    const serviceCol = headers.indexOf("service_code");
    if (serviceCol >= 0) {
      const service = String(sheet.getRange(rowNumber, serviceCol+1).getValue() || "").trim().toUpperCase();
      if (service !== "TOUR") {
        return errorResponse("店内見学予約のみ対象です。","INVALID_SERVICE");
      }
    }

    const handlerCode = status === "DONE"
      ? String(params.handler_code || params.handler_email || "").trim()
      : "";
    let handlerName = status === "DONE"
      ? String(params.handler_name || "").trim()
      : "";

    if (status === "DONE" && handlerCode) {
      try {
        const staff = typeof findStaffByCode_ === "function"
          ? findStaffByCode_(handlerCode)
          : null;
        if (staff) {
          handlerName = String(staff.display_name || staff.staff_name || handlerName || handlerCode).trim();
        }
      } catch (ignore) {}
    }

    const now = status === "DONE" ? new Date() : "";
    setReservationCellByHeader_(sheet, headers, rowNumber, "inquiry_status", status);
    setReservationCellByHeader_(sheet, headers, rowNumber, "inquiry_handled_by", handlerCode);
    setReservationCellByHeader_(sheet, headers, rowNumber, "inquiry_handled_by_name", handlerName);
    setReservationCellByHeader_(sheet, headers, rowNumber, "inquiry_handled_at", now);

    return successResponse({
      reservation_id: reservationId,
      inquiry_status: status,
      inquiry_handled_by: handlerCode,
      inquiry_handled_by_name: handlerName,
      inquiry_handled_at: now ? Utilities.formatDate(now, APP_CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss") : ""
    });
  } catch (error) {
    logError("setTourInquiryStatus", error.message, {stack:error.stack});
    return errorResponse(error.message || "対応状況更新中にエラーが発生しました。","TOUR_INQUIRY_STATUS_ERROR");
  }
}

function ensureTourInquiryHeaders_(sheet) {
  const required = [
    "inquiry_status",
    "inquiry_handled_by",
    "inquiry_handled_by_name",
    "inquiry_handled_at"
  ];
  let last = sheet.getLastColumn();
  let headers = last > 0
    ? sheet.getRange(1,1,1,last).getValues()[0].map(v=>String(v||"").trim())
    : [];
  required.forEach(function(h){
    if (!headers.includes(h)) {
      last++;
      sheet.getRange(1,last).setValue(h);
      headers.push(h);
    }
  });
}

function setReservationCellByHeader_(sheet, headers, rowNumber, header, value) {
  const col = headers.indexOf(header);
  if (col < 0) throw new Error("reservationsに" + header + "列がありません。");
  sheet.getRange(rowNumber, col+1).setValue(value);
}
