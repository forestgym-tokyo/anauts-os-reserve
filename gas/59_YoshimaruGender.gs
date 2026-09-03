/**
 * ============================================================
 * A-nauts OS Reserve
 * 女性限定トレーナー 会員マスターポリシー
 * ============================================================
 *
 * 判定は master シートの gender 列だけを使用する。
 * - F: 吉丸トレーナーを予約可能
 * - M / 空欄 / その他: 吉丸トレーナーを予約不可
 */

const YOSHIMARU_POLICY_ = Object.freeze({
  STAFF_CODE: "YOSHIMARU",
  MASTER_FEMALE: "F"
});

const AVAILABLE_SLOTS_RANGE_CACHE_VERSION_ = "available-range-v3";
const AVAILABLE_SLOTS_RANGE_CACHE_SECONDS_ = 120;


/**
 * 7日分の空き枠を1回のHTTP通信で返す。
 * iPad/SafariからgetAvailableSlotsを日数分並列実行しないための公開API。
 */
function getAvailableSlotsRange(params) {
  params = params || {};

  const startDate = normalizeYoshimaruText_(params.start_date || params.date);
  const serviceCode = normalizeYoshimaruText_(params.service_code).toUpperCase();
  const staffCode = normalizeYoshimaruText_(params.staff_code).toUpperCase();
  const requestedDays = Number(params.days || 7);
  const days = Math.max(1, Math.min(7, Math.floor(requestedDays || 7)));

  if (!serviceCode) {
    return errorResponse(
      "サービスコードを指定してください。",
      "SERVICE_CODE_REQUIRED",
      null
    );
  }

  if (!staffCode && /^PT(?:_|\d|$)/.test(serviceCode)) {
    return errorResponse(
      "担当トレーナーを指定してください。",
      "STAFF_CODE_REQUIRED",
      null
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return errorResponse(
      "開始日をYYYY-MM-DD形式で指定してください。",
      "START_DATE_REQUIRED",
      { start_date: startDate }
    );
  }

  const cacheKey = [
    AVAILABLE_SLOTS_RANGE_CACHE_VERSION_,
    typeof getStoreAwareCacheGeneration_ === "function"
      ? getStoreAwareCacheGeneration_()
      : "0",
    serviceCode,
    staffCode,
    startDate,
    days
  ].join(":");

  const cached = getYoshimaruRangeCache_(cacheKey);
  if (cached) return successResponse(cached);

  const calculation = runYoshimaruRangeWithLocalSheetCache_(function() {
    const dayResults = [];
    let succeeded = true;

    for (let index = 0; index < days; index += 1) {
      const dayParams = {};
      Object.keys(params).forEach(function(key) {
        dayParams[key] = params[key];
      });
      dayParams.action = "getAvailableSlots";
      dayParams.date = addYoshimaruUtcDays_(startDate, index);

      try {
        const result = parseYoshimaruApiResponse_(getAvailableSlots(dayParams));
        if (!result || result.ok !== true) succeeded = false;
        dayResults.push(result || {
          ok: false,
          message: "空き状況を取得できませんでした。",
          code: "AVAILABLE_SLOTS_EMPTY_RESPONSE",
          data: { date: dayParams.date, slots: [] }
        });
      } catch (error) {
        succeeded = false;
        dayResults.push({
          ok: false,
          message: error && error.message
            ? error.message
            : "空き状況を取得できませんでした。",
          code: "AVAILABLE_SLOTS_RANGE_ERROR",
          data: { date: dayParams.date, slots: [] }
        });
      }
    }

    return {
      results: dayResults,
      all_succeeded: succeeded
    };
  });

  const results = calculation.results;
  const allSucceeded = calculation.all_succeeded;

  const data = {
    start_date: startDate,
    days: days,
    results: results
  };

  // 予約確定時に再検証されるため、短時間だけ同一結果を再利用する。
  if (allSucceeded) {
    putYoshimaruRangeCache_(
      cacheKey,
      data,
      AVAILABLE_SLOTS_RANGE_CACHE_SECONDS_
    );
  }

  return successResponse(data);
}


/**
 * 週次取得の同一実行内だけ、同じマスターシートの読込結果を再利用する。
 * 予約確定処理や別リクエストには影響させず、処理終了時に必ず元へ戻す。
 */
function runYoshimaruRangeWithLocalSheetCache_(callback) {
  if (typeof getSheetData !== "function") return callback();

  const originalGetSheetData = getSheetData;
  const localCache = Object.create(null);

  try {
    getSheetData = function(sheetName) {
      const key = String(sheetName || "");
      if (!Object.prototype.hasOwnProperty.call(localCache, key)) {
        localCache[key] = originalGetSheetData(sheetName);
      }
      return localCache[key];
    };

    return callback();
  } finally {
    getSheetData = originalGetSheetData;
  }
}


function parseYoshimaruApiResponse_(response) {
  let value = response;

  if (value && typeof value.getContent === "function") {
    value = value.getContent();
  }

  if (typeof value === "string") {
    value = JSON.parse(value);
  }

  return value && typeof value === "object" ? value : null;
}


function addYoshimaruUtcDays_(dateText, offset) {
  const parts = String(dateText).split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(offset || 0)));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}


function getYoshimaruRangeCache_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}


function putYoshimaruRangeCache_(key, value, seconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), seconds);
  } catch (_) {
    // キャッシュ不可でもAPI結果は返す。
  }
}


/**
 * createReservation の入口。
 * policy_check_only=true の場合は予約を作らず、吉丸予約可否だけを返す。
 */
function createReservationWithTrainerPolicy_(params) {
  params = params || {};

  if (normalizeYoshimaruBoolean_(params.policy_check_only)) {
    return getYoshimaruBookingEligibilityResponse_(params);
  }

  const trainerSelection = validatePersonalTrainerSelection_(params);
  if (!trainerSelection.ok) return trainerSelection.response;

  const policy = validateYoshimaruTrainerEligibility_(params);
  if (!policy.ok) return policy.response;

  return createReservation(params);
}


/**
 * パーソナル系予約では、会員マスター判定前に担当者を確定させる。
 * staff_code 未指定の自動割当は使用しない。
 */
function validatePersonalTrainerSelection_(params) {
  params = params || {};

  const staffCode = normalizeYoshimaruText_(params.staff_code).toUpperCase();
  if (staffCode || !isPersonalServiceForYoshimaruPolicy_(params.service_code)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: errorResponse(
      "担当トレーナーを確認できませんでした。空き状況を更新し、日時を選び直してください。",
      "PERSONAL_TRAINER_REQUIRED",
      {
        service_code: normalizeYoshimaruText_(params.service_code)
      }
    )
  };
}


function isPersonalServiceForYoshimaruPolicy_(serviceCodeValue) {
  const serviceCode = normalizeYoshimaruText_(serviceCodeValue).toUpperCase();
  if (!serviceCode) return false;
  if (/^PT(?:\d|_)/.test(serviceCode)) return true;

  if (typeof getAvailabilityService_ === "function") {
    try {
      const service = getAvailabilityService_(serviceCode);
      return normalizeYoshimaruText_(service && service.category).toUpperCase() === "PERSONAL";
    } catch (_) {
      return false;
    }
  }

  return false;
}


/**
 * 日程表示前の会員確認。
 */
function getYoshimaruBookingEligibilityResponse_(params) {
  const state = getYoshimaruMemberEligibilityState_(params || {});

  if (state.validation_error) {
    const error = state.validation_error;
    return errorResponse(
      error.message || "会員情報を確認できませんでした。",
      error.code || "MEMBER_VALIDATION_ERROR",
      error.detail || null
    );
  }

  return successResponse({
    policy_ok: true,
    yoshimaru_eligible: state.yoshimaru_eligible === true
  });
}


/**
 * 実予約時の最終防御。
 * 吉丸以外のトレーナーには追加制限を行わない。
 */
function validateYoshimaruTrainerEligibility_(params) {
  params = params || {};

  const staffCode = normalizeYoshimaruText_(params.staff_code).toUpperCase();
  if (staffCode !== YOSHIMARU_POLICY_.STAFF_CODE) {
    return { ok: true };
  }

  const state = getYoshimaruMemberEligibilityState_(params);

  if (state.validation_error) {
    const error = state.validation_error;
    return {
      ok: false,
      response: errorResponse(
        error.message || "会員情報を確認できませんでした。",
        error.code || "MEMBER_VALIDATION_ERROR",
        error.detail || null
      )
    };
  }

  if (state.yoshimaru_eligible === true) {
    return { ok: true };
  }

  return {
    ok: false,
    response: errorResponse(
      "ご予約予定のトレーナーは女性限定です。他のトレーナーをお選びください。",
      "YOSHIMARU_FEMALE_ONLY",
      {
        staff_code: YOSHIMARU_POLICY_.STAFF_CODE
      }
    )
  };
}


/**
 * 会員番号＋登録メールを照合し、master.gender=F の場合だけ許可する。
 * M・空欄・想定外の値はすべて同じく予約不可として扱う。
 */
function getYoshimaruMemberEligibilityState_(params) {
  params = params || {};

  const memberNo = normalizeYoshimaruText_(params.member_no);
  const customerEmail = normalizeYoshimaruText_(params.customer_email || params.email);

  if (!memberNo) {
    return {
      yoshimaru_eligible: false,
      validation_error: {
        code: "MEMBER_NUMBER_REQUIRED",
        message: "会員番号を入力してください。",
        detail: null
      }
    };
  }

  if (typeof validateReservationMemberMaster_ !== "function") {
    throw new Error("会員マスター照合関数 validateReservationMemberMaster_ が見つかりません。");
  }

  const validation = validateReservationMemberMaster_({
    memberNo: memberNo,
    customerEmail: customerEmail
  });

  if (!validation || validation.ok !== true) {
    return {
      yoshimaru_eligible: false,
      validation_error: validation || {
        code: "MEMBER_VALIDATION_ERROR",
        message: "会員情報を確認できませんでした。",
        detail: { member_no: memberNo }
      }
    };
  }

  let member = validation.member || null;
  if (typeof findReservationMemberByNo_ === "function") {
    member = findReservationMemberByNo_(memberNo) || member;
  }

  if (!member) {
    return {
      yoshimaru_eligible: false,
      validation_error: {
        code: "MEMBER_NOT_FOUND",
        message: "会員番号が確認できません。",
        detail: { member_no: memberNo }
      }
    };
  }

  const gender = normalizeYoshimaruText_(member.gender).toUpperCase();
  const eligible = gender === YOSHIMARU_POLICY_.MASTER_FEMALE;

  return {
    yoshimaru_eligible: eligible,
    validation_error: null
  };
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
