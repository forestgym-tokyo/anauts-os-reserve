/**
 * ============================================================
 * A-nauts OS Reserve
 * 女性限定トレーナー 性別ポリシー
 * ============================================================
 *
 * 性別情報の正本:
 * - 会員マスター master シートの gender 列
 * - 値は「F」「M」「空欄」
 *
 * 予約画面の流れ:
 * - 日程表示前に会員番号＋登録メールで会員マスターを照合する。
 * - gender=F: 全トレーナーの日程を表示可能。
 * - gender=M: 女性限定トレーナーを日程取得対象から除外する。
 * - gender=空欄: 日程表示前に画面上で「女性 / 男性」を確認し、その回答を当該予約中だけ使用する。
 * - 非会員の無料体験: 会員マスターを使わず、日程表示前に「女性 / 男性」を確認する。
 * - 画面での回答内容から会員マスターは自動更新しない。
 */

const YOSHIMARU_GENDER_POLICY_ = Object.freeze({
  STAFF_CODE: "YOSHIMARU",
  FEMALE: "女性",
  MALE: "男性",
  MASTER_FEMALE: "F",
  MASTER_MALE: "M"
});


/**
 * createReservation の入口。
 * policy_check_only=true の場合は予約を作らず、日程表示前の性別状態だけを返す。
 */
function createReservationWithTrainerPolicy_(params) {
  params = params || {};

  if (normalizeYoshimaruBoolean_(params.policy_check_only)) {
    return getYoshimaruBookingGenderStateResponse_(params);
  }

  const trainerSelection = validatePersonalTrainerSelection_(params);
  if (!trainerSelection.ok) return trainerSelection.response;

  const policy = validateYoshimaruGenderPolicy_(params);
  if (!policy.ok) return policy.response;

  return createReservation(params);
}


/**
 * パーソナル系予約は、性別ポリシー確認前に担当トレーナーを確定させる。
 * staff_code 未指定のまま createReservation() に渡すと、その内部の
 * 自動割当で女性限定トレーナーが選ばれる可能性があるため、必ず拒否する。
 */
function validatePersonalTrainerSelection_(params) {
  params = params || {};

  const staffCode = normalizeYoshimaruText_(params.staff_code).toUpperCase();
  if (staffCode || !isPersonalServiceForGenderPolicy_(params.service_code)) {
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


/**
 * 現行サービスコードは PT60 / PT_*。将来コード体系が変わった場合は
 * services の category=PERSONAL も参照する。
 */
function isPersonalServiceForGenderPolicy_(serviceCodeValue) {
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
 * 日程表示前の性別状態確認。
 * 会員番号がある場合は既存の会員番号＋メール照合を必ず通す。
 */
function getYoshimaruBookingGenderStateResponse_(params) {
  const state = getYoshimaruBookingGenderState_(params || {});

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
    gender_state: state.gender_state,
    gender: state.gender,
    gender_source: state.gender_source,
    member_found: state.member_found === true
  });
}


/**
 * 実予約時の最終防御。
 * 女性限定トレーナー以外には何も制限しない。
 */
function validateYoshimaruGenderPolicy_(params) {
  params = params || {};

  const staffCode = normalizeYoshimaruText_(params.staff_code).toUpperCase();
  if (staffCode !== YOSHIMARU_GENDER_POLICY_.STAFF_CODE) {
    return { ok: true, gender_source: "NOT_APPLICABLE" };
  }

  const state = getYoshimaruBookingGenderState_(params);

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

  if (state.gender_state === "FEMALE") {
    return { ok: true, gender_source: state.gender_source };
  }

  if (state.gender_state === "MALE") {
    return {
      ok: false,
      response: errorResponse(
        "ご予約予定のトレーナーは女性限定です。他のトレーナーをお選びください。",
        "YOSHIMARU_FEMALE_ONLY",
        {
          staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
          gender_source: state.gender_source
        }
      )
    };
  }

  const answeredGender = normalizeYoshimaruGender_(params.gender);

  if (!answeredGender) {
    return {
      ok: false,
      response: errorResponse(
        "性別情報がありません。女性限定のトレーナーがいるため、性別をお答えください。",
        "YOSHIMARU_GENDER_REQUIRED",
        {
          staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
          gender_source: state.gender_source
        }
      )
    };
  }

  if (answeredGender === YOSHIMARU_GENDER_POLICY_.MALE) {
    return {
      ok: false,
      response: errorResponse(
        "ご予約予定のトレーナーは女性限定です。他のトレーナーをお選びください。",
        "YOSHIMARU_FEMALE_ONLY",
        {
          staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
          gender_source: "SELF_DECLARED"
        }
      )
    };
  }

  if (answeredGender === YOSHIMARU_GENDER_POLICY_.FEMALE) {
    return { ok: true, gender_source: "SELF_DECLARED" };
  }

  return {
    ok: false,
    response: errorResponse(
      "性別は「女性」または「男性」を選択してください。",
      "YOSHIMARU_GENDER_INVALID",
      { staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE }
    )
  };
}


/**
 * 会員マスターの gender を状態化する。
 * 会員番号なし（無料体験）は UNKNOWN を返す。
 */
function getYoshimaruBookingGenderState_(params) {
  params = params || {};

  const memberNo = normalizeYoshimaruText_(params.member_no);
  const customerEmail = normalizeYoshimaruText_(params.customer_email || params.email);

  if (!memberNo) {
    return {
      member_found: false,
      gender_state: "UNKNOWN",
      gender: "",
      gender_source: "NO_MEMBER_MASTER",
      validation_error: null
    };
  }

  if (typeof validateReservationMemberMaster_ === "function") {
    const validation = validateReservationMemberMaster_({
      memberNo: memberNo,
      customerEmail: customerEmail
    });

    if (!validation || validation.ok !== true) {
      return {
        member_found: false,
        gender_state: "UNKNOWN",
        gender: "",
        gender_source: "MEMBER_MASTER",
        validation_error: validation || {
          code: "MEMBER_VALIDATION_ERROR",
          message: "会員情報を確認できませんでした。",
          detail: { member_no: memberNo }
        }
      };
    }
  }

  if (typeof findReservationMemberByNo_ !== "function") {
    throw new Error("会員マスター検索関数 findReservationMemberByNo_ が見つかりません。");
  }

  const member = findReservationMemberByNo_(memberNo);
  if (!member) {
    return {
      member_found: false,
      gender_state: "UNKNOWN",
      gender: "",
      gender_source: "MEMBER_MASTER",
      validation_error: null
    };
  }

  const gender = normalizeYoshimaruGender_(member.gender);

  if (gender === YOSHIMARU_GENDER_POLICY_.FEMALE) {
    return {
      member_found: true,
      gender_state: "FEMALE",
      gender: YOSHIMARU_GENDER_POLICY_.MASTER_FEMALE,
      gender_source: "MEMBER_MASTER",
      validation_error: null
    };
  }

  if (gender === YOSHIMARU_GENDER_POLICY_.MALE) {
    return {
      member_found: true,
      gender_state: "MALE",
      gender: YOSHIMARU_GENDER_POLICY_.MASTER_MALE,
      gender_source: "MEMBER_MASTER",
      validation_error: null
    };
  }

  return {
    member_found: true,
    gender_state: "UNKNOWN",
    gender: "",
    gender_source: "MEMBER_MASTER_BLANK",
    validation_error: null
  };
}


/* 旧管理画面との互換。スタッフ最終確認方式は使用しない。 */
function getPendingYoshimaruVerifications(params) {
  return successResponse({
    pending: [],
    pending_count: 0,
    disabled: true,
    source: "MEMBER_MASTER"
  });
}

function verifyYoshimaruCustomer(params) {
  return errorResponse(
    "スタッフによる初回確認は使用しません。会員マスターのgender列を更新してください。",
    "YOSHIMARU_STAFF_VERIFICATION_DISABLED"
  );
}


function normalizeYoshimaruText_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * 会員マスターは F / M、画面からの自己申告は 女性 / 男性。
 * どちらも内部では 女性 / 男性へ正規化する。
 */
function normalizeYoshimaruGender_(value) {
  const text = normalizeYoshimaruText_(value).toUpperCase();

  if (text === YOSHIMARU_GENDER_POLICY_.MASTER_FEMALE || text === "女性") {
    return YOSHIMARU_GENDER_POLICY_.FEMALE;
  }

  if (text === YOSHIMARU_GENDER_POLICY_.MASTER_MALE || text === "男性") {
    return YOSHIMARU_GENDER_POLICY_.MALE;
  }

  return "";
}

function normalizeYoshimaruBoolean_(value) {
  if (value === true) return true;
  return ["TRUE", "1", "YES", "ON"].includes(
    String(value || "").trim().toUpperCase()
  );
}
