/**
 * ============================================================
 * A-nauts OS Reserve
 * 吉丸りなトレーナー 初回性別確認ポリシー
 * ============================================================
 *
 * 仕様:
 * - 吉丸トレーナー (YOSHIMARU) は女性専用。
 * - 未確認のお客様は予約時に「女性 / 男性」を自己申告する。
 * - 「男性」は予約不可。
 * - 「女性」は予約可能だが、その自己申告だけでは確認済みにしない。
 * - 来店後、スタッフが管理画面で利用条件を確認した時点で確認済みにする。
 * - 確認済み後は次回以降、性別質問を表示しない。
 * - 性別そのものは保存しない。
 * - 会員番号 / メールアドレスの生値は専用確認シートに保存しない。
 *   Script Properties の秘密値をキーにした HMAC-SHA256 のみ保存する。
 */

const YOSHIMARU_GENDER_POLICY_ = Object.freeze({
  STAFF_CODE: "YOSHIMARU",
  SHEET_NAME: "trainer_customer_verifications",
  SOURCE: "YOSHIMARU_STAFF_CONFIRMED",
  SECRET_PROPERTY: "YOSHIMARU_IDENTITY_SECRET",
  PENDING_LOOKBACK_DAYS: 30,
  HEADERS: [
    "verification_id",
    "staff_code",
    "identity_type",
    "identity_hash",
    "eligible",
    "reservation_id",
    "verified_by_staff_code",
    "verified_by_email",
    "verified_at",
    "source"
  ]
});


/**
 * 公開予約の createReservation 前に吉丸トレーナーの利用条件を判定する。
 * 自己申告「女性」で予約が成功しても、ここでは確認済み記録を作らない。
 *
 * 99_Main.gs:
 * case "createReservation":
 *   return createReservationWithTrainerPolicy_(body);
 */
function createReservationWithTrainerPolicy_(params) {
  params = params || {};

  const policy = validateYoshimaruGenderPolicy_(params);

  if (!policy.ok) {
    return policy.response;
  }

  return createReservation(params);
}


/**
 * 吉丸トレーナー予約時の性別チェック。
 */
function validateYoshimaruGenderPolicy_(params) {
  params = params || {};

  const staffCode = normalizeYoshimaruText_(params.staff_code).toUpperCase();

  if (staffCode !== YOSHIMARU_GENDER_POLICY_.STAFF_CODE) {
    return { ok: true };
  }

  const identities = buildYoshimaruIdentities_(params);

  /*
   * 会員番号 / メールがまだ無い場合は createReservation 本体の
   * 通常バリデーションへ任せる。
   */
  if (!identities.length) {
    return { ok: true };
  }

  if (hasYoshimaruVerification_(identities)) {
    return { ok: true };
  }

  const gender = normalizeYoshimaruText_(params.gender);

  if (!gender) {
    return {
      ok: false,
      response: errorResponse(
        "吉丸りなトレーナーは女性専用です。初回のみ性別を選択してください。",
        "YOSHIMARU_GENDER_REQUIRED",
        {
          staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
          first_check: true,
          staff_confirmation_required: true
        }
      )
    };
  }

  if (gender !== "女性") {
    return {
      ok: false,
      response: errorResponse(
        "吉丸りなトレーナーは女性専用です。",
        "YOSHIMARU_FEMALE_ONLY",
        {
          staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE
        }
      )
    };
  }

  /*
   * 「女性」の自己申告では予約だけ許可する。
   * 確認済みへの昇格は verifyYoshimaruCustomer() のみ。
   */
  return { ok: true };
}


/**
 * 管理画面：スタッフ確認待ち一覧。
 * 今日〜過去30日以内の吉丸トレーナー予約だけを返す。
 * 未来予約はスタッフが事前に確認済みにできないよう対象外。
 */
function getPendingYoshimaruVerifications(params) {
  const auth = requireAuth_(
    params || {},
    ["ADMIN", "MANAGER", "STAFF"]
  );

  const today = yoshimaruToday_();
  const minDate = yoshimaruDateOffset_(today, -YOSHIMARU_GENDER_POLICY_.PENDING_LOOKBACK_DAYS);
  const rows = getSheetData(APP_CONFIG.SHEETS.RESERVATIONS);
  const byIdentity = new Map();

  rows.forEach(function(row) {
    const staffCode = normalizeYoshimaruText_(row.staff_code).toUpperCase();
    if (staffCode !== YOSHIMARU_GENDER_POLICY_.STAFF_CODE) return;

    const status = normalizeYoshimaruText_(row.status).toUpperCase();
    if (["CANCELLED", "CANCELED", "CANCEL"].includes(status)) return;

    const reservationDate = normalizeYoshimaruDate_(row.reservation_date || row.date);
    if (!reservationDate || reservationDate > today || reservationDate < minDate) return;

    const identities = buildYoshimaruIdentities_({
      member_no: row.member_no,
      customer_email: row.customer_email
    });

    if (!identities.length || hasYoshimaruVerification_(identities)) return;

    const reservationId = normalizeYoshimaruText_(row.reservation_id);
    if (!reservationId) return;

    const key = primaryYoshimaruIdentityKey_(identities);
    const item = {
      reservation_id: reservationId,
      reservation_date: reservationDate,
      start_time: normalizeYoshimaruTime_(row.start_time),
      end_time: normalizeYoshimaruTime_(row.end_time),
      service_code: normalizeYoshimaruText_(row.service_code),
      service_name: normalizeYoshimaruText_(row.service_name),
      customer_name: normalizeYoshimaruText_(row.customer_name),
      status: status
    };

    /*
     * 同一人物に複数予約がある場合は最新の来店済み予約だけ表示する。
     */
    const current = byIdentity.get(key);
    if (!current || yoshimaruReservationSortKey_(item) > yoshimaruReservationSortKey_(current)) {
      byIdentity.set(key, item);
    }
  });

  const pending = Array.from(byIdentity.values())
    .sort(function(a, b) {
      return yoshimaruReservationSortKey_(b).localeCompare(yoshimaruReservationSortKey_(a));
    });

  return successResponse({
    pending: pending,
    pending_count: pending.length,
    staff_code: normalizeYoshimaruText_(auth && auth.staff_code)
  });
}


/**
 * 管理画面：来店後にスタッフが「女性専用の利用条件確認済み」にする。
 * reservation_id から本人識別子を作るため、スタッフが会員番号やメールを
 * 手入力する必要はない。
 */
function verifyYoshimaruCustomer(params) {
  params = params || {};

  const auth = requireAuth_(
    params,
    ["ADMIN", "MANAGER", "STAFF"]
  );

  const reservationId = normalizeYoshimaruText_(params.reservation_id);

  if (!reservationId) {
    return errorResponse(
      "reservation_idを指定してください。",
      "VALIDATION_ERROR"
    );
  }

  const reservationInfo = findReservationRowById_(reservationId);

  if (!reservationInfo || !reservationInfo.record) {
    return errorResponse(
      "指定された予約が見つかりません。",
      "RESERVATION_NOT_FOUND",
      { reservation_id: reservationId }
    );
  }

  const reservation = reservationInfo.record;
  const staffCode = normalizeYoshimaruText_(reservation.staff_code).toUpperCase();

  if (staffCode !== YOSHIMARU_GENDER_POLICY_.STAFF_CODE) {
    return errorResponse(
      "吉丸りなトレーナーの予約ではありません。",
      "NOT_YOSHIMARU_RESERVATION",
      { reservation_id: reservationId }
    );
  }

  const status = normalizeYoshimaruText_(reservation.status).toUpperCase();
  if (["CANCELLED", "CANCELED", "CANCEL"].includes(status)) {
    return errorResponse(
      "キャンセル済み予約は確認済みにできません。",
      "RESERVATION_CANCELLED",
      { reservation_id: reservationId }
    );
  }

  const reservationDate = normalizeYoshimaruDate_(reservation.reservation_date || reservation.date);
  const today = yoshimaruToday_();

  if (reservationDate && reservationDate > today) {
    return errorResponse(
      "来店前の予約は確認済みにできません。来店後に操作してください。",
      "VISIT_NOT_REACHED",
      {
        reservation_id: reservationId,
        reservation_date: reservationDate
      }
    );
  }

  const identities = buildYoshimaruIdentities_({
    member_no: reservation.member_no,
    customer_email: reservation.customer_email
  });

  if (!identities.length) {
    return errorResponse(
      "予約者を識別できません。会員番号またはメールアドレスを確認してください。",
      "CUSTOMER_IDENTITY_NOT_FOUND",
      { reservation_id: reservationId }
    );
  }

  recordYoshimaruVerification_({
    identities: identities,
    reservation_id: reservationId,
    verified_by_staff_code: normalizeYoshimaruText_(auth && auth.staff_code),
    verified_by_email: normalizeYoshimaruText_(auth && auth.email)
  });

  return successResponse(
    {
      reservation_id: reservationId,
      customer_name: normalizeYoshimaruText_(reservation.customer_name),
      verified: true,
      verified_by_staff_code: normalizeYoshimaruText_(auth && auth.staff_code)
    },
    "吉丸トレーナーの初回確認を登録しました。"
  );
}


/**
 * 会員番号とメールの両方がある場合は両方の識別ハッシュを作る。
 * これにより、無料体験（メール）後に会員（会員番号）になっても、
 * 同じメールであれば再確認を要求しない。
 */
function buildYoshimaruIdentities_(params) {
  params = params || {};
  const identities = [];

  const memberNo = normalizeYoshimaruText_(params.member_no);
  if (memberNo) {
    identities.push({
      type: "MEMBER_NO",
      hash: hmacYoshimaru_("MEMBER_NO:" + memberNo)
    });
  }

  const email = normalizeYoshimaruText_(
    params.customer_email || params.email
  ).toLowerCase();

  if (email) {
    identities.push({
      type: "EMAIL",
      hash: hmacYoshimaru_("EMAIL:" + email)
    });
  }

  return identities;
}


function primaryYoshimaruIdentityKey_(identities) {
  const email = (identities || []).find(function(identity) {
    return identity.type === "EMAIL";
  });
  const primary = email || (identities || [])[0];
  return primary ? primary.type + ":" + primary.hash : "";
}


/**
 * いずれかの識別子が確認済みなら本人は確認済みとみなす。
 */
function hasYoshimaruVerification_(identities) {
  identities = Array.isArray(identities) ? identities : [];
  if (!identities.length) return false;

  const sheet = getYoshimaruVerificationSheet_(false);
  if (!sheet) return false;

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return false;

  const headers = values[0].map(function(header) {
    return String(header || "").trim();
  });
  const index = {};
  headers.forEach(function(header, i) {
    if (header) index[header] = i;
  });

  const wanted = new Set(
    identities.map(function(identity) {
      return String(identity.type).toUpperCase() + "|" + String(identity.hash).toLowerCase();
    })
  );

  return values.slice(1).some(function(row) {
    const staffCode = normalizeYoshimaruText_(row[index.staff_code]).toUpperCase();
    const identityType = normalizeYoshimaruText_(row[index.identity_type]).toUpperCase();
    const identityHash = normalizeYoshimaruText_(row[index.identity_hash]).toLowerCase();
    const eligible = normalizeYoshimaruBoolean_(row[index.eligible]);

    return (
      staffCode === YOSHIMARU_GENDER_POLICY_.STAFF_CODE &&
      eligible === true &&
      wanted.has(identityType + "|" + identityHash)
    );
  });
}


/**
 * スタッフ確認後のみ呼ぶ。
 * 会員番号・メールの両識別子を確認済みとして保存する。
 */
function recordYoshimaruVerification_(options) {
  options = options || {};
  const identities = Array.isArray(options.identities) ? options.identities : [];
  if (!identities.length) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getYoshimaruVerificationSheet_(true);

    identities.forEach(function(identity) {
      if (hasYoshimaruVerification_([identity])) return;

      appendYoshimaruVerificationRecord_(sheet, {
        verification_id: "YGV-" + Utilities.getUuid(),
        staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
        identity_type: identity.type,
        identity_hash: identity.hash,
        eligible: true,
        reservation_id: normalizeYoshimaruText_(options.reservation_id),
        verified_by_staff_code: normalizeYoshimaruText_(options.verified_by_staff_code),
        verified_by_email: normalizeYoshimaruText_(options.verified_by_email),
        verified_at: new Date(),
        source: YOSHIMARU_GENDER_POLICY_.SOURCE
      });
    });

  } finally {
    lock.releaseLock();
  }
}


function appendYoshimaruVerificationRecord_(sheet, record) {
  ensureYoshimaruVerificationHeaders_(sheet);

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function(header) {
      return String(header || "").trim();
    });

  const row = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(record, header)
      ? record[header]
      : "";
  });

  sheet.appendRow(row);
}


function getYoshimaruVerificationSheet_(createIfMissing) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(YOSHIMARU_GENDER_POLICY_.SHEET_NAME);

  if (!sheet) {
    if (!createIfMissing) return null;

    sheet = spreadsheet.insertSheet(YOSHIMARU_GENDER_POLICY_.SHEET_NAME);
    sheet
      .getRange(1, 1, 1, YOSHIMARU_GENDER_POLICY_.HEADERS.length)
      .setValues([YOSHIMARU_GENDER_POLICY_.HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  ensureYoshimaruVerificationHeaders_(sheet);
  return sheet;
}


/**
 * 将来列を追加しても既存シートを壊さないよう、不足列は右端へ追加する。
 */
function ensureYoshimaruVerificationHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    sheet
      .getRange(1, 1, 1, YOSHIMARU_GENDER_POLICY_.HEADERS.length)
      .setValues([YOSHIMARU_GENDER_POLICY_.HEADERS]);
    return;
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function(header) {
      return String(header || "").trim();
    });

  const missing = YOSHIMARU_GENDER_POLICY_.HEADERS.filter(function(header) {
    return !headers.includes(header);
  });

  if (missing.length) {
    sheet
      .getRange(1, lastColumn + 1, 1, missing.length)
      .setValues([missing]);
  }
}


function normalizeYoshimaruText_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}


function normalizeYoshimaruBoolean_(value) {
  if (value === true) return true;
  return ["TRUE", "1", "YES", "ON"].includes(
    String(value || "").trim().toUpperCase()
  );
}


function normalizeYoshimaruDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  const text = normalizeYoshimaruText_(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return Utilities.formatDate(date, APP_CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  return "";
}


function normalizeYoshimaruTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, "HH:mm");
  }

  const text = normalizeYoshimaruText_(value);
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (match) {
    return String(Number(match[1])).padStart(2, "0") + ":" + match[2];
  }

  return text;
}


function yoshimaruToday_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, "yyyy-MM-dd");
}


function yoshimaruDateOffset_(yyyyMmDd, days) {
  const parts = String(yyyyMmDd || "").split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + Number(days || 0));
  return Utilities.formatDate(date, APP_CONFIG.TIMEZONE, "yyyy-MM-dd");
}


function yoshimaruReservationSortKey_(row) {
  return normalizeYoshimaruDate_(row.reservation_date || row.date) + "T" +
    normalizeYoshimaruTime_(row.start_time);
}


function getYoshimaruIdentitySecret_() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty(YOSHIMARU_GENDER_POLICY_.SECRET_PROPERTY);

  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(YOSHIMARU_GENDER_POLICY_.SECRET_PROPERTY, secret);
  }

  return secret;
}


function hmacYoshimaru_(value) {
  const bytes = Utilities.computeHmacSha256Signature(
    String(value || ""),
    getYoshimaruIdentitySecret_(),
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return normalized.toString(16).padStart(2, "0");
  }).join("");
}
