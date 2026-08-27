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
