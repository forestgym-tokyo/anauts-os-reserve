const TOUR_INSTANT_PRINT_VIEW_URL = "https://forestgym-tokyo.github.io/anauts-os-reserve/admin/questionnaire-print.html";

/**
 * 店内見学アンケート高速表示。
 *
 * 従来の Spreadsheet -> PDF export -> Drive 保存を通常経路から完全に外し、
 * 予約情報だけを認証済みAPIから返して、GitHub Pages上の2ページ印刷ビューで描画する。
 * 個人情報は URL fragment (#...) に格納するため GitHub Pages サーバーへ送信されない。
 */
function generateTourQuestionnairePdfFast(params) {
  try {
    params = params || {};

    const reservationId = String(params.reservation_id || "").trim();
    const printMode = String(params.print_mode || "FULL").trim().toUpperCase();

    if (!reservationId) {
      return errorResponse("reservation_idを指定してください。", "VALIDATION_ERROR");
    }

    if (["FULL", "ADDRESS_ONLY", "BLANK"].indexOf(printMode) < 0) {
      return errorResponse("印刷モードが正しくありません。", "INVALID_PRINT_MODE", {
        print_mode: printMode
      });
    }

    const reservationInfo = findReservationRowById_(reservationId);
    if (!reservationInfo) {
      return errorResponse("指定された予約が見つかりません。", "RESERVATION_NOT_FOUND", {
        reservation_id: reservationId
      });
    }

    const reservation = reservationInfo.record || {};
    const serviceCode = String(reservation.service_code || "").trim().toUpperCase();
    const customerType = String(reservation.customer_type || "").trim().toUpperCase();
    const memberNo = String(reservation.member_no || "").trim();
    const isTour = serviceCode === "TOUR";
    const isCounselVisitor = serviceCode === "COUNSEL" && (
      customerType === "VISITOR" || (customerType !== "MEMBER" && !memberNo)
    );

    if (!isTour && !isCounselVisitor) {
      return errorResponse("この予約はアンケート作成対象ではありません。", "QUESTIONNAIRE_NOT_AVAILABLE", {
        service_code: serviceCode,
        customer_type: customerType
      });
    }

    const payload = buildTourInstantPrintPayload_(reservation, printMode);
    const encoded = Utilities.base64EncodeWebSafe(
      JSON.stringify(payload),
      Utilities.Charset.UTF_8
    ).replace(/=+$/g, "");

    const fileUrl = TOUR_INSTANT_PRINT_VIEW_URL + "#" + encoded;

    logInfo("generateTourQuestionnairePdf", "店内見学アンケート高速表示URL生成成功", {
      reservation_id: reservationId,
      print_mode: printMode,
      render_mode: "BROWSER_PRINT",
      pages: 2
    });

    return successResponse({
      reservation_id: reservationId,
      print_mode: printMode,
      filename: "店内見学アンケート",
      mime_type: "text/html",
      file_url: fileUrl,
      pages: 2,
      render_mode: "BROWSER_PRINT",
      rounded_font: true,
      duplex: true,
      duplex_instruction: "A4・両面印刷・長辺とじ"
    });
  } catch (error) {
    logError("generateTourQuestionnairePdf", error.message, {
      stack: error.stack
    });
    return errorResponse(
      error.message || "アンケート表示中にエラーが発生しました。",
      "TOUR_PRINT_ERROR",
      { message: error.message }
    );
  }
}

function buildTourInstantPrintPayload_(reservation, printMode) {
  const blank = printMode === "BLANK";
  const addressOnly = printMode === "ADDRESS_ONLY";
  const customerNameRaw = String(reservation.customer_name || "").trim();

  return {
    version: 1,
    mode: printMode,
    service_code: String(reservation.service_code || "").trim().toUpperCase(),
    name: blank || addressOnly || !customerNameRaw ? "" : customerNameRaw + " さま",
    postal: blank ? "" : formatTourInstantPostal_(
      reservation.postal_code || reservation.postal || reservation.zip_code ||
      reservation.zip || reservation.customer_postal_code
    ),
    address: blank ? "" : buildTourInstantAddress_(reservation),
    phone: blank || addressOnly ? "" : formatTourInstantPhone_(reservation.customer_phone),
    email: blank || addressOnly ? "" : String(reservation.customer_email || "").trim(),
    visit_datetime: blank ? "" : formatTourInstantVisitDateTime_(reservation)
  };
}

function formatTourInstantPostal_(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 7) {
    return "〒" + digits.slice(0, 3) + "-" + digits.slice(3);
  }
  return "〒" + digits;
}

function buildTourInstantAddress_(reservation) {
  const direct = String(
    reservation.customer_address || reservation.address || ""
  ).trim();
  if (direct) return direct;

  const parts = [
    reservation.prefecture,
    reservation.city,
    reservation.address1,
    reservation.address_detail,
    reservation.address2,
    reservation.building
  ];
  return parts.map(function(value) {
    return String(value || "").trim();
  }).join("");
}

function formatTourInstantPhone_(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.charAt(0) === "0") {
    return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
  }
  if (digits.length === 10 && digits.charAt(0) === "0") {
    return digits.slice(0, 2) + "-" + digits.slice(2, 6) + "-" + digits.slice(6);
  }
  return raw;
}

function formatTourInstantVisitDateTime_(reservation) {
  const rawDate = String(
    reservation.date || reservation.reservation_date || ""
  ).trim().slice(0, 10);
  const startTime = String(reservation.start_time || "").trim();
  const endTime = String(reservation.end_time || "").trim();
  let dateText = rawDate;

  const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    dateText = year + "年" + month + "月" + day + "日(" + weekdays[date.getDay()] + ")";
  }

  if (startTime && endTime) return dateText + " " + startTime + "〜" + endTime;
  if (startTime) return dateText + " " + startTime + "〜";
  return dateText;
}

/**
 * 互換用。ブラウザ描画版では事前セットアップ不要。
 */
function setupTourQuestionnaireFastPdf() {
  return {
    ok: true,
    mode: "BROWSER_PRINT",
    pages: 2,
    setup_required: false,
    message: "ブラウザ2ページ描画版のため事前セットアップは不要です。"
  };
}
