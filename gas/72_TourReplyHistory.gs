/**
 * A-nauts OS Reserve
 * 店内見学の返信履歴（既存メール送信処理から分離）
 *
 * 既存の sendTourCustomerReply() をそのまま送信に利用し、
 * このファイルでは二重送信防止と予約単位の履歴保存だけを担当する。
 */

const TOUR_REPLY_HISTORY_SHEET_NAME = "tour_reply_history";
const TOUR_REPLY_HISTORY_HEADERS = [
  "request_id",
  "reservation_id",
  "created_at",
  "sent_at",
  "status",
  "customer_email",
  "subject",
  "body",
  "handler_code",
  "handler_name",
  "handler_email",
  "message_id",
  "error"
];


function getTourReplyHistoryV2(params) {
  params = params || {};
  const reservationId = normalizeTourReplyText_(params.reservation_id, 160);

  if (!reservationId) {
    return errorResponse(
      "予約IDがありません。",
      "TOUR_REPLY_RESERVATION_ID_REQUIRED"
    );
  }

  const sheet = getTourReplyHistorySheet_(false);
  if (!sheet || sheet.getLastRow() < 2) {
    return successResponse({
      reservation_id: reservationId,
      replies: []
    });
  }

  const values = sheet.getDataRange().getValues();
  const header = makeTourReplyHeaderMap_(values[0]);
  const replies = values
    .slice(1)
    .filter(function (row) {
      return normalizeTourReplyText_(row[header.reservation_id], 160) === reservationId &&
        normalizeTourReplyText_(row[header.status], 30).toUpperCase() === "SENT";
    })
    .map(function (row) {
      return buildTourReplyHistoryItem_(row, header);
    })
    .sort(function (a, b) {
      return String(a.sent_at || "").localeCompare(String(b.sent_at || ""));
    });

  return successResponse({
    reservation_id: reservationId,
    replies: replies
  });
}


function sendTourCustomerReplyV2(body, auth) {
  body = body || {};
  auth = auth || {};

  const reservationId = normalizeTourReplyText_(body.reservation_id, 160);
  const requestId = normalizeTourReplyText_(
    body.request_id || Utilities.getUuid(),
    180
  );
  const subject = normalizeTourReplyText_(body.subject, 500);
  const messageBody = normalizeTourReplyText_(body.body, 30000);
  const customerEmail = normalizeTourReplyText_(body.customer_email, 500).toLowerCase();
  const handler = tourReplyHandlerFromAuth_(auth);

  if (!reservationId) {
    return errorResponse(
      "予約IDがありません。",
      "TOUR_REPLY_RESERVATION_ID_REQUIRED"
    );
  }
  if (!subject) {
    return errorResponse("件名を入力してください。", "TOUR_REPLY_SUBJECT_REQUIRED");
  }
  if (!messageBody) {
    return errorResponse("本文を入力してください。", "TOUR_REPLY_BODY_REQUIRED");
  }

  const lock = LockService.getScriptLock();
  let sheet;
  let rowNumber;
  let header;

  try {
    lock.waitLock(15000);
    sheet = getTourReplyHistorySheet_(true);
    header = makeTourReplyHeaderMap_(
      sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    );

    const existing = findTourReplyRequest_(sheet, header, requestId);
    if (existing) {
      const existingItem = buildTourReplyHistoryItem_(existing.row, header);
      const existingStatus = normalizeTourReplyText_(
        existing.row[header.status],
        30
      ).toUpperCase();

      if (existingStatus === "SENT") {
        return successResponse({
          duplicate: true,
          history_saved: true,
          reply: existingItem
        });
      }

      return errorResponse(
        existingStatus === "SENDING"
          ? "同じメールを送信処理中です。しばらく待って履歴を確認してください。"
          : "同じ送信操作は再実行できません。内容を確認して、もう一度送信してください。",
        "TOUR_REPLY_DUPLICATE_REQUEST"
      );
    }

    rowNumber = sheet.getLastRow() + 1;
    const createdAt = new Date().toISOString();
    const pending = makeTourReplyRow_(header, {
      request_id: requestId,
      reservation_id: reservationId,
      created_at: createdAt,
      sent_at: "",
      status: "SENDING",
      customer_email: customerEmail,
      subject: subject,
      body: messageBody,
      handler_code: handler.code,
      handler_name: handler.name,
      handler_email: handler.email,
      message_id: "",
      error: ""
    });

    writeTourReplyRow_(sheet, rowNumber, pending);
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {
      // ロック取得前の例外時は何もしない。
    }
  }

  const legacyPayload = Object.assign({}, body, {
    handler_code: handler.code,
    handler_name: handler.name,
    handler_email: handler.email
  });

  let legacyResponse;
  let parsed;
  try {
    if (typeof sendTourCustomerReply !== "function") {
      throw new Error("既存の見学返信メール機能が見つかりません。");
    }

    legacyResponse = sendTourCustomerReply(legacyPayload);
    parsed = parseTourReplyResponse_(legacyResponse);

    if (!parsed || parsed.ok !== true) {
      throw new Error(
        parsed && parsed.message
          ? parsed.message
          : "メールを送信できませんでした。"
      );
    }
  } catch (error) {
    updateTourReplyStatus_(
      sheet,
      rowNumber,
      header,
      "FAILED",
      "",
      "",
      error && error.message ? error.message : "メール送信に失敗しました。"
    );
    return errorResponse(
      error && error.message ? error.message : "メール送信に失敗しました。",
      "TOUR_REPLY_SEND_FAILED"
    );
  }

  const responseData = parsed && parsed.data && typeof parsed.data === "object"
    ? parsed.data
    : {};
  const sentAt = new Date().toISOString();
  const recipient = normalizeTourReplyText_(
    responseData.customer_email || responseData.to || customerEmail,
    500
  ).toLowerCase();
  const messageId = normalizeTourReplyText_(
    responseData.gmail_message_id || responseData.message_id || "",
    500
  );
  let historySaved = true;

  try {
    updateTourReplyStatus_(
      sheet,
      rowNumber,
      header,
      "SENT",
      sentAt,
      messageId,
      "",
      recipient
    );
  } catch (historyError) {
    historySaved = false;
    console.error("sendTourCustomerReplyV2 history", historyError);
  }

  // 送信成功時は、従来と同じ対応状況も確実に「対応済」にする。
  try {
    if (typeof setTourInquiryStatus === "function") {
      setTourInquiryStatus({
        reservation_id: reservationId,
        inquiry_status: "DONE",
        handler_code: handler.code,
        handler_name: handler.name,
        handler_email: handler.email
      });
    }
  } catch (statusError) {
    console.error("sendTourCustomerReplyV2 inquiry status", statusError);
  }

  const result = Object.assign({}, responseData, {
    duplicate: false,
    history_saved: historySaved,
    reply: {
      request_id: requestId,
      reservation_id: reservationId,
      sent_at: sentAt,
      customer_email: recipient,
      subject: subject,
      body: messageBody,
      handler_code: handler.code,
      handler_name: handler.name,
      message_id: messageId
    }
  });

  if (!historySaved) {
    result.warning = "メールは送信済みですが、対応履歴の保存に失敗しました。再送しないでください。";
  }

  return successResponse(result);
}


function getTourReplyHistorySheet_(createIfMissing) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TOUR_REPLY_HISTORY_SHEET_NAME);

  if (!sheet && !createIfMissing) return null;

  if (!sheet) {
    sheet = ss.insertSheet(TOUR_REPLY_HISTORY_SHEET_NAME);
    sheet
      .getRange(1, 1, 1, TOUR_REPLY_HISTORY_HEADERS.length)
      .setValues([TOUR_REPLY_HISTORY_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, TOUR_REPLY_HISTORY_HEADERS.length).setFontWeight("bold");
    sheet.setColumnWidth(2, 190);
    sheet.setColumnWidth(4, 180);
    sheet.setColumnWidth(7, 300);
    sheet.setColumnWidth(8, 520);
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(String);
  const currentMap = makeTourReplyHeaderMap_(currentHeaders);
  const missing = TOUR_REPLY_HISTORY_HEADERS.filter(function (name) {
    return currentMap[name] === undefined;
  });

  if (missing.length) {
    sheet
      .getRange(1, currentHeaders.length + 1, 1, missing.length)
      .setValues([missing]);
  }

  return sheet;
}


function makeTourReplyHeaderMap_(headers) {
  return (headers || []).reduce(function (map, name, index) {
    const key = String(name || "").trim();
    if (key) map[key] = index;
    return map;
  }, {});
}


function makeTourReplyRow_(header, record) {
  const length = Object.keys(header).reduce(function (max, key) {
    return Math.max(max, Number(header[key]) + 1);
  }, 0);
  const row = new Array(length).fill("");

  TOUR_REPLY_HISTORY_HEADERS.forEach(function (name) {
    if (header[name] !== undefined) row[header[name]] = record[name] || "";
  });
  return row;
}


function writeTourReplyRow_(sheet, rowNumber, row) {
  const safeRow = row.map(safeTourReplyCell_);
  sheet.getRange(rowNumber, 1, 1, safeRow.length).setValues([safeRow]);
}


function safeTourReplyCell_(value) {
  const text = String(value == null ? "" : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}


function findTourReplyRequest_(sheet, header, requestId) {
  if (header.request_id === undefined || sheet.getLastRow() < 2) return null;

  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues();

  for (let index = 0; index < rows.length; index += 1) {
    if (normalizeTourReplyText_(rows[index][header.request_id], 180) === requestId) {
      return { rowNumber: index + 2, row: rows[index] };
    }
  }
  return null;
}


function updateTourReplyStatus_(
  sheet,
  rowNumber,
  header,
  status,
  sentAt,
  messageId,
  error,
  recipient
) {
  const updates = {
    status: status,
    sent_at: sentAt,
    message_id: messageId,
    error: error
  };
  if (recipient !== undefined) updates.customer_email = recipient;

  Object.keys(updates).forEach(function (name) {
    if (header[name] === undefined) return;
    sheet
      .getRange(rowNumber, header[name] + 1)
      .setValue(safeTourReplyCell_(updates[name]));
  });
}


function buildTourReplyHistoryItem_(row, header) {
  function value(name, maxLength) {
    return header[name] === undefined
      ? ""
      : normalizeTourReplyText_(row[header[name]], maxLength);
  }

  return {
    request_id: value("request_id", 180),
    reservation_id: value("reservation_id", 160),
    sent_at: value("sent_at", 80),
    customer_email: value("customer_email", 500),
    subject: value("subject", 500),
    body: value("body", 30000),
    handler_code: value("handler_code", 160),
    handler_name: value("handler_name", 300),
    message_id: value("message_id", 500)
  };
}


function tourReplyHandlerFromAuth_(auth) {
  const profile = auth && auth.profile || {};
  const email = normalizeTourReplyText_(auth.email || profile.email, 500).toLowerCase();
  const code = normalizeTourReplyText_(auth.staff_code || profile.staff_code || email, 160);
  const name = normalizeTourReplyText_(
    profile.display_name || profile.staff_name || email || code,
    300
  );

  return { code: code, name: name, email: email };
}


function parseTourReplyResponse_(response) {
  if (response && typeof response.getContent === "function") {
    return JSON.parse(response.getContent() || "{}");
  }
  if (typeof response === "string") {
    return JSON.parse(response || "{}");
  }
  return response || {};
}


function normalizeTourReplyText_(value, maxLength) {
  const text = String(value == null ? "" : value).trim();
  return maxLength && text.length > maxLength
    ? text.slice(0, maxLength)
    : text;
}
