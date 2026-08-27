/**
 * ============================================================
 * A-nauts OS Reserve
 * 吉丸りなトレーナー 初回性別確認ポリシー
 * ============================================================
 *
 * 方針:
 * - 吉丸トレーナー (YOSHIMARU) は女性専用。
 * - 初回のみ「女性 / 男性」を確認する。
 * - 女性で予約が正常完了した時点で「確認済み」を記録する。
 * - 2回目以降は性別を要求しない。
 * - 性別そのものは保存しない。
 * - 会員番号またはメールアドレスの生値もこの専用シートには保存せず、
 *   SHA-256 の識別ハッシュだけを保存する。
 *
 * 99_Main.gs の createReservation ルートから
 * createReservationWithTrainerPolicy_(body) を呼び出すこと。
 */

const YOSHIMARU_GENDER_POLICY_ = Object.freeze({
  STAFF_CODE: "YOSHIMARU",
  SHEET_NAME: "trainer_customer_verifications",
  SOURCE: "YOSHIMARU_FIRST_GENDER",
  HEADERS: [
    "verification_id",
    "staff_code",
    "identity_type",
    "identity_hash",
    "eligible",
    "reservation_id",
    "verified_at",
    "source"
  ]
});


/**
 * createReservation の前後に吉丸トレーナーの性別ポリシーを適用する。
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function createReservationWithTrainerPolicy_(params) {
  params = params || {};

  const policy =
    validateYoshimaruGenderPolicy_(
      params
    );

  if (!policy.ok) {
    return policy.response;
  }

  const response =
    createReservation(
      params
    );

  if (!policy.record_on_success) {
    return response;
  }

  /*
   * 予約登録成功後だけ確認済みを記録する。
   * 確認済み記録の失敗で予約自体を失敗扱いにはしない。
   * （利用者の二重予約を防ぐため）
   */
  try {
    const result =
      JSON.parse(
        response.getContent()
      );

    if (
      result &&
      result.ok === true &&
      result.data &&
      result.data.reservation_id
    ) {
      recordYoshimaruVerification_({
        identity:
          policy.identity,
        reservation_id:
          result.data.reservation_id
      });
    }

  } catch (error) {
    logError(
      "recordYoshimaruVerification_",
      error.message,
      {
        stack:
          error.stack
      }
    );
  }

  return response;
}


/**
 * 吉丸トレーナー予約時の初回性別確認。
 *
 * @param {Object} params
 * @returns {Object}
 */
function validateYoshimaruGenderPolicy_(params) {
  params = params || {};

  const staffCode =
    normalizeYoshimaruText_(
      params.staff_code
    ).toUpperCase();

  if (
    staffCode !==
    YOSHIMARU_GENDER_POLICY_.STAFF_CODE
  ) {
    return {
      ok: true,
      record_on_success: false,
      identity: null
    };
  }

  const identity =
    buildYoshimaruIdentity_(
      params
    );

  /*
   * メール未入力などは createReservation 本体の
   * 通常バリデーションへ任せる。
   */
  if (!identity) {
    return {
      ok: true,
      record_on_success: false,
      identity: null
    };
  }

  if (
    hasYoshimaruVerification_(
      identity
    )
  ) {
    return {
      ok: true,
      record_on_success: false,
      identity: identity
    };
  }

  const gender =
    normalizeYoshimaruText_(
      params.gender
    );

  if (!gender) {
    return {
      ok: false,
      record_on_success: false,
      identity: identity,
      response:
        errorResponse(
          "吉丸りなトレーナーは女性専用です。初回のみ性別を選択してください。",
          "YOSHIMARU_GENDER_REQUIRED",
          {
            staff_code:
              YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
            first_check:
              true
          }
        )
    };
  }

  if (gender !== "女性") {
    return {
      ok: false,
      record_on_success: false,
      identity: identity,
      response:
        errorResponse(
          "吉丸りなトレーナーは女性専用です。",
          "YOSHIMARU_FEMALE_ONLY",
          {
            staff_code:
              YOSHIMARU_GENDER_POLICY_.STAFF_CODE
          }
        )
    };
  }

  return {
    ok: true,
    record_on_success: true,
    identity: identity
  };
}


/**
 * 会員は会員番号を優先。
 * 会員番号がない場合のみメールアドレスを利用する。
 * 生値は保存せずSHA-256化する。
 *
 * @param {Object} params
 * @returns {Object|null}
 */
function buildYoshimaruIdentity_(params) {
  params = params || {};

  const memberNo =
    normalizeYoshimaruText_(
      params.member_no
    );

  if (memberNo) {
    return {
      type: "MEMBER_NO",
      hash:
        sha256Yoshimaru_(
          "MEMBER_NO:" +
          memberNo
        )
    };
  }

  const email =
    normalizeYoshimaruText_(
      params.customer_email ||
      params.email
    ).toLowerCase();

  if (email) {
    return {
      type: "EMAIL",
      hash:
        sha256Yoshimaru_(
          "EMAIL:" +
          email
        )
    };
  }

  return null;
}


/**
 * 既に吉丸トレーナー女性利用可を確認済みか。
 *
 * @param {Object} identity
 * @returns {boolean}
 */
function hasYoshimaruVerification_(identity) {
  if (
    !identity ||
    !identity.type ||
    !identity.hash
  ) {
    return false;
  }

  const sheet =
    getYoshimaruVerificationSheet_(
      false
    );

  if (!sheet) {
    return false;
  }

  const values =
    sheet
      .getDataRange()
      .getValues();

  if (values.length < 2) {
    return false;
  }

  const headers =
    values[0]
      .map(function(header) {
        return String(
          header || ""
        ).trim();
      });

  const index = {};

  headers.forEach(
    function(header, i) {
      if (header) {
        index[header] = i;
      }
    }
  );

  return values
    .slice(1)
    .some(function(row) {
      const staffCode =
        normalizeYoshimaruText_(
          row[index.staff_code]
        ).toUpperCase();

      const identityType =
        normalizeYoshimaruText_(
          row[index.identity_type]
        ).toUpperCase();

      const identityHash =
        normalizeYoshimaruText_(
          row[index.identity_hash]
        ).toLowerCase();

      const eligible =
        normalizeYoshimaruBoolean_(
          row[index.eligible]
        );

      return (
        staffCode ===
          YOSHIMARU_GENDER_POLICY_.STAFF_CODE &&
        identityType ===
          String(
            identity.type
          ).toUpperCase() &&
        identityHash ===
          String(
            identity.hash
          ).toLowerCase() &&
        eligible === true
      );
    });
}


/**
 * 初回の女性確認済みを保存する。
 * 同一identityは重複登録しない。
 *
 * @param {Object} options
 */
function recordYoshimaruVerification_(options) {
  options = options || {};

  const identity =
    options.identity;

  if (
    !identity ||
    !identity.type ||
    !identity.hash
  ) {
    return;
  }

  const lock =
    LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    if (
      hasYoshimaruVerification_(
        identity
      )
    ) {
      return;
    }

    const sheet =
      getYoshimaruVerificationSheet_(
        true
      );

    sheet.appendRow([
      "YGV-" +
        Utilities.getUuid(),
      YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
      identity.type,
      identity.hash,
      true,
      normalizeYoshimaruText_(
        options.reservation_id
      ),
      new Date(),
      YOSHIMARU_GENDER_POLICY_.SOURCE
    ]);

  } finally {
    lock.releaseLock();
  }
}


/**
 * 確認済み管理シート取得。
 * createIfMissing=true の場合のみ新規作成する。
 *
 * @param {boolean} createIfMissing
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null}
 */
function getYoshimaruVerificationSheet_(createIfMissing) {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  let sheet =
    spreadsheet.getSheetByName(
      YOSHIMARU_GENDER_POLICY_.SHEET_NAME
    );

  if (!sheet) {
    if (!createIfMissing) {
      return null;
    }

    sheet =
      spreadsheet.insertSheet(
        YOSHIMARU_GENDER_POLICY_.SHEET_NAME
      );

    sheet
      .getRange(
        1,
        1,
        1,
        YOSHIMARU_GENDER_POLICY_.HEADERS.length
      )
      .setValues([
        YOSHIMARU_GENDER_POLICY_.HEADERS
      ]);

    sheet.setFrozenRows(1);

    return sheet;
  }

  ensureYoshimaruVerificationHeaders_(
    sheet
  );

  return sheet;
}


/**
 * 既存シートがある場合に必須ヘッダーを検証する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function ensureYoshimaruVerificationHeaders_(sheet) {
  const lastColumn =
    sheet.getLastColumn();

  if (lastColumn < 1) {
    sheet
      .getRange(
        1,
        1,
        1,
        YOSHIMARU_GENDER_POLICY_.HEADERS.length
      )
      .setValues([
        YOSHIMARU_GENDER_POLICY_.HEADERS
      ]);

    return;
  }

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0]
      .map(function(header) {
        return String(
          header || ""
        ).trim();
      });

  const missing =
    YOSHIMARU_GENDER_POLICY_.HEADERS
      .filter(function(header) {
        return !headers.includes(
          header
        );
      });

  if (missing.length > 0) {
    throw new Error(
      YOSHIMARU_GENDER_POLICY_.SHEET_NAME +
      "シートに必要な列がありません: " +
      missing.join(", ")
    );
  }
}


function normalizeYoshimaruText_(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}


function normalizeYoshimaruBoolean_(value) {
  if (value === true) {
    return true;
  }

  return [
    "TRUE",
    "1",
    "YES"
  ].includes(
    String(
      value || ""
    )
      .trim()
      .toUpperCase()
  );
}


function sha256Yoshimaru_(value) {
  const bytes =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(value || ""),
      Utilities.Charset.UTF_8
    );

  return bytes
    .map(function(byte) {
      const normalized =
        byte < 0
          ? byte + 256
          : byte;

      return normalized
        .toString(16)
        .padStart(2, "0");
    })
    .join("");
}
