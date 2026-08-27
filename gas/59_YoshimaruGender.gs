/**
 * ============================================================
 * A-nauts OS Reserve
 * 吉丸りなトレーナー 女性限定ポリシー
 * ============================================================
 *
 * 性別情報の正本:
 * - 会員マスター master シートの gender 列
 * - 値は「女性」「男性」「空欄」
 *
 * 仕様:
 * - gender=女性: 吉丸トレーナーをそのまま予約可能
 * - gender=男性: 吉丸トレーナーは予約不可
 * - gender=空欄: 予約確定前に「女性 / 男性」を確認
 * - 空欄時に「女性」を選択した場合、その予約のみ許可
 * - 回答内容で会員マスターを自動更新しない
 * - スタッフによる最終確認・確認済みシートは使用しない
 */

const YOSHIMARU_GENDER_POLICY_ = Object.freeze({
  STAFF_CODE: "YOSHIMARU",
  FEMALE: "女性",
  MALE: "男性"
});


/**
 * 公開予約の createReservation 前に吉丸トレーナーの利用条件を判定する。
 * policy_check_only=true の場合は予約を作らず、判定だけ返す。
 */
function createReservationWithTrainerPolicy_(params) {
  params = params || {};

  const policy = validateYoshimaruGenderPolicy_(params);

  if (!policy.ok) {
    return policy.response;
  }

  if (normalizeYoshimaruBoolean_(params.policy_check_only)) {
    return successResponse({
      policy_ok: true,
      staff_code: normalizeYoshimaruText_(params.staff_code).toUpperCase(),
      gender_required: false,
      gender_source: policy.gender_source || ""
    });
  }

  return createReservation(params);
}


/**
 * 吉丸トレーナー予約時の女性限定チェック。
 */
function validateYoshimaruGenderPolicy_(params) {
  params = params || {};

  const staffCode = normalizeYoshimaruText_(params.staff_code).toUpperCase();

  if (staffCode !== YOSHIMARU_GENDER_POLICY_.STAFF_CODE) {
    return {
      ok: true,
      gender_source: "NOT_APPLICABLE"
    };
  }

  const master = getYoshimaruMemberGender_(params);

  if (master.validation_error) {
    const error = master.validation_error;
    return {
      ok: false,
      response: errorResponse(
        error.message || "会員情報を確認できませんでした。",
        error.code || "MEMBER_VALIDATION_ERROR",
        error.detail || null
      )
    };
  }

  /* 会員マスターを最優先する。 */
  if (master.gender === YOSHIMARU_GENDER_POLICY_.FEMALE) {
    return {
      ok: true,
      gender_source: "MEMBER_MASTER"
    };
  }

  if (master.gender === YOSHIMARU_GENDER_POLICY_.MALE) {
    return {
      ok: false,
      response: errorResponse(
        "吉丸りなトレーナーは女性限定です。他のトレーナーをお選びください。",
        "YOSHIMARU_FEMALE_ONLY",
        {
          staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
          gender_source: "MEMBER_MASTER"
        }
      )
    };
  }

  /*
   * gender が空欄、または会員マスターを参照できない予約は
   * その予約時だけ本人へ確認する。
   */
  const answeredGender = normalizeYoshimaruGender_(params.gender);

  if (!answeredGender) {
    return {
      ok: false,
      response: errorResponse(
        "会員マスターに性別情報がありません。ご予約予定の吉丸りなトレーナーは女性限定となりますので、性別をお答えください。",
        "YOSHIMARU_GENDER_REQUIRED",
        {
          staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
          gender_source: master.found ? "MEMBER_MASTER_BLANK" : "MEMBER_MASTER_UNAVAILABLE"
        }
      )
    };
  }

  if (answeredGender === YOSHIMARU_GENDER_POLICY_.MALE) {
    return {
      ok: false,
      response: errorResponse(
        "吉丸りなトレーナーは女性限定です。他のトレーナーをお選びください。",
        "YOSHIMARU_FEMALE_ONLY",
        {
          staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE,
          gender_source: "SELF_DECLARED"
        }
      )
    };
  }

  if (answeredGender === YOSHIMARU_GENDER_POLICY_.FEMALE) {
    return {
      ok: true,
      gender_source: "SELF_DECLARED"
    };
  }

  return {
    ok: false,
    response: errorResponse(
      "性別は「女性」または「男性」を選択してください。",
      "YOSHIMARU_GENDER_INVALID",
      {
        staff_code: YOSHIMARU_GENDER_POLICY_.STAFF_CODE
      }
    )
  };
}


/**
 * 既存の会員マスター接続を利用して gender を取得する。
 * 29_Reservation 側の getReservationMemberMasterRows_() は
 * ヘッダーを動的にオブジェクト化するため、gender 列を追加するだけで参照できる。
 */
function getYoshimaruMemberGender_(params) {
  params = params || {};

  const memberNo = normalizeYoshimaruText_(params.member_no);
  const customerEmail = normalizeYoshimaruText_(
    params.customer_email || params.email
  );

  if (!memberNo) {
    return {
      found: false,
      gender: "",
      validation_error: null
    };
  }

  /*
   * policy_check_only でも、会員番号だけでマスター情報を推測できないよう
   * 既存の会員番号・メール・在籍状態チェックを先に通す。
   */
  if (typeof validateReservationMemberMaster_ === "function") {
    const validation = validateReservationMemberMaster_({
      memberNo: memberNo,
      customerEmail: customerEmail
    });

    if (!validation || validation.ok !== true) {
      return {
        found: false,
        gender: "",
        validation_error: validation || {
          code: "MEMBER_VALIDATION_ERROR",
          message: "会員情報を確認できませんでした。",
          detail: { member_no: memberNo }
        }
      };
    }
  }

  if (typeof findReservationMemberByNo_ !== "function") {
    throw new Error(
      "会員マスター検索関数 findReservationMemberByNo_ が見つかりません。"
    );
  }

  const member = findReservationMemberByNo_(memberNo);

  if (!member) {
    return {
      found: false,
      gender: "",
      validation_error: null
    };
  }

  return {
    found: true,
    gender: normalizeYoshimaruGender_(member.gender),
    validation_error: null
  };
}


/**
 * 旧スタッフ確認UIとの互換用。
 * スタッフ確認方式は廃止済みのため常に0件を返す。
 */
function getPendingYoshimaruVerifications(params) {
  return successResponse({
    pending: [],
    pending_count: 0,
    disabled: true,
    source: "MEMBER_MASTER"
  });
}


/**
 * 旧スタッフ確認UIとの互換用。
 * 今後は会員マスターの gender 列を管理側で更新する。
 */
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


function normalizeYoshimaruGender_(value) {
  const text = normalizeYoshimaruText_(value);
  if (text === YOSHIMARU_GENDER_POLICY_.FEMALE) return YOSHIMARU_GENDER_POLICY_.FEMALE;
  if (text === YOSHIMARU_GENDER_POLICY_.MALE) return YOSHIMARU_GENDER_POLICY_.MALE;
  return "";
}


function normalizeYoshimaruBoolean_(value) {
  if (value === true) return true;
  return ["TRUE", "1", "YES", "ON"].includes(
    String(value || "").trim().toUpperCase()
  );
}
