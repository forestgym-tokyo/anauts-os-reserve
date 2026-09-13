/**
 * ============================================================
 * A-nauts OS Reserve
 * Personal booking cutoff
 * ============================================================
 *
 * 対象: パーソナル / 無料体験パーソナルのみ
 * 予約受付: 予約日前日23:59まで（Asia/Tokyo）
 *
 * TOUR / UNSUBSCRIBE / PROCEDURE 等、パーソナル以外には一切適用しない。
 */

function isPersonalBookingCutoffService_(serviceCodeValue) {
  const serviceCode = String(serviceCodeValue || "").trim().toUpperCase();
  if (!serviceCode) return false;

  if (/^PT(?:_|\d|$)/.test(serviceCode)) return true;

  try {
    if (typeof getAvailabilityService_ === "function") {
      const service = getAvailabilityService_(serviceCode);
      if (service) {
        return String(service.category || "").trim().toUpperCase() === "PERSONAL";
      }
    }
  } catch (_) {
    // 判定不能時は他サービスへ誤適用しない。
  }

  return false;
}

function personalBookingCutoffToday_() {
  return Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyy-MM-dd"
  );
}

function normalizePersonalBookingCutoffDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd");
  }
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  return match ? [match[1], match[2], match[3]].join("-") : "";
}

function validatePersonalPreviousDayBookingCutoff_(params) {
  params = params || {};
  const serviceCode = String(params.service_code || "").trim().toUpperCase();

  if (!isPersonalBookingCutoffService_(serviceCode)) return null;

  const reservationDate = normalizePersonalBookingCutoffDate_(
    params.date || params.reservation_date
  );
  if (!reservationDate) return null;

  const today = personalBookingCutoffToday_();
  if (reservationDate > today) return null;

  return errorResponse(
    "パーソナルのご予約は予約日前日までとなります。別の日程をお選びください。",
    "PERSONAL_BOOKING_CUTOFF",
    {
      service_code: serviceCode,
      reservation_date: reservationDate,
      cutoff: "PREVIOUS_DAY_23_59",
      timezone: "Asia/Tokyo"
    }
  );
}

function applyPersonalPreviousDayCutoffToAvailability_(response, params) {
  params = params || {};
  const serviceCode = String(params.service_code || "").trim().toUpperCase();

  if (!isPersonalBookingCutoffService_(serviceCode)) return response;

  let payload = response;
  if (payload && typeof payload.getContent === "function") {
    try {
      payload = JSON.parse(payload.getContent() || "{}");
    } catch (_) {
      return response;
    }
  }

  if (!payload || payload.ok !== true || !payload.data) return response;

  const today = personalBookingCutoffToday_();
  const fallbackDate = normalizePersonalBookingCutoffDate_(
    params.date || params.start_date
  );

  function stripDay_(data, fallback) {
    if (!data || typeof data !== "object") return data;

    const date = normalizePersonalBookingCutoffDate_(data.date || fallback);
    if (!date || date > today) return data;

    const filtered = Object.assign({}, data, { slots: [] });
    if (Object.prototype.hasOwnProperty.call(filtered, "available_slot_count")) {
      filtered.available_slot_count = 0;
    }
    return filtered;
  }

  const data = payload.data;

  if (Array.isArray(data.results)) {
    const results = data.results.map(function(result, index) {
      if (!result || result.ok !== true) return result;
      const resultFallback = fallbackDate
        ? addPersonalBookingCutoffDays_(fallbackDate, index)
        : "";
      return Object.assign({}, result, {
        data: stripDay_(result.data || {}, resultFallback)
      });
    });

    return successResponse(Object.assign({}, data, { results: results }));
  }

  return successResponse(stripDay_(data, fallbackDate));
}

function addPersonalBookingCutoffDays_(dateText, offset) {
  const parts = String(dateText || "").split("-").map(Number);
  if (parts.length !== 3 || !parts.every(isFinite)) return "";

  const value = new Date(Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2] + Number(offset || 0)
  ));

  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0")
  ].join("-");
}
