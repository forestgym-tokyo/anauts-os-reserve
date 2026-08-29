const TOUR_QUESTIONNAIRE_PAYLOAD_CACHE_PREFIX = "tour-questionnaire-payload-v1:";
const TOUR_QUESTIONNAIRE_AUTH_CACHE_PREFIX = "tour-questionnaire-auth-v1:";
const TOUR_QUESTIONNAIRE_PAYLOAD_CACHE_SECONDS = 21600;
const TOUR_QUESTIONNAIRE_AUTH_CACHE_SECONDS = 300;

function getCurrentUserWithQuestionnaireCache_(params) {
  const response = getCurrentUser(params);
  const payload = parseTourQuestionnaireJsonResponse_(response);

  if (payload && payload.ok === true) {
    rememberQuestionnaireAuth_(params && params.id_token);
    const data = payload.data || {};
    primeTourQuestionnaireCacheFromSchedule_(data.staff_schedule || null);
  }

  return response;
}

function getStaffScheduleWithQuestionnaireCache_(params) {
  const response = getStaffSchedule(params);
  const payload = parseTourQuestionnaireJsonResponse_(response);

  if (payload && payload.ok === true) {
    rememberQuestionnaireAuth_(params && params.id_token);
    primeTourQuestionnaireCacheFromSchedule_(payload.data || null);
  }

  return response;
}

function requireQuestionnaireAuthFast_(params) {
  const idToken = String(params && params.id_token || "").trim();
  if (!idToken) {
    return requireAuth_(params, ["ADMIN", "MANAGER", "STAFF"]);
  }

  const cache = CacheService.getScriptCache();
  const key = buildQuestionnaireAuthCacheKey_(idToken);
  try {
    if (cache.get(key) === "1") return true;
  } catch (_) {
    // Cache障害時は通常認証へフォールバックする。
  }

  const auth = requireAuth_(params, ["ADMIN", "MANAGER", "STAFF"]);
  rememberQuestionnaireAuth_(idToken);
  return auth;
}

function rememberQuestionnaireAuth_(idToken) {
  idToken = String(idToken || "").trim();
  if (!idToken) return;
  try {
    CacheService.getScriptCache().put(
      buildQuestionnaireAuthCacheKey_(idToken),
      "1",
      TOUR_QUESTIONNAIRE_AUTH_CACHE_SECONDS
    );
  } catch (_) {
    // キャッシュ不可でも通常処理を継続する。
  }
}

function buildQuestionnaireAuthCacheKey_(idToken) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    idToken,
    Utilities.Charset.UTF_8
  );
  const hex = digest.map(function(value) {
    return ("0" + ((value + 256) % 256).toString(16)).slice(-2);
  }).join("");
  return TOUR_QUESTIONNAIRE_AUTH_CACHE_PREFIX + hex;
}

function primeTourQuestionnaireCacheFromSchedule_(schedule) {
  if (!schedule || !Array.isArray(schedule.reservations)) return;
  if (typeof buildTourInstantPrintPayload_ !== "function") return;

  schedule.reservations.forEach(function(reservation) {
    if (!isTourQuestionnaireCacheTarget_(reservation)) return;

    const reservationId = String(reservation.reservation_id || "").trim();
    if (!reservationId) return;

    ["FULL", "ADDRESS_ONLY", "BLANK"].forEach(function(printMode) {
      try {
        const payload = buildTourInstantPrintPayload_(reservation, printMode);
        putTourQuestionnaireCachedPayload_(reservationId, printMode, payload);
      } catch (_) {
        // 1件の先読み失敗でスタッフ予定全体を止めない。
      }
    });
  });
}

function isTourQuestionnaireCacheTarget_(reservation) {
  const serviceCode = String(reservation && reservation.service_code || "")
    .trim().toUpperCase();
  const customerType = String(reservation && reservation.customer_type || "")
    .trim().toUpperCase();
  const memberNo = String(reservation && reservation.member_no || "").trim();

  if (serviceCode === "TOUR") return true;
  return serviceCode === "COUNSEL" && (
    customerType === "VISITOR" ||
    (customerType !== "MEMBER" && !memberNo)
  );
}

function getTourQuestionnaireCachedPayload_(reservationId, printMode) {
  try {
    const value = CacheService.getScriptCache().get(
      buildTourQuestionnairePayloadCacheKey_(reservationId, printMode)
    );
    if (!value) return null;
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function putTourQuestionnaireCachedPayload_(reservationId, printMode, payload) {
  try {
    CacheService.getScriptCache().put(
      buildTourQuestionnairePayloadCacheKey_(reservationId, printMode),
      JSON.stringify(payload || {}),
      TOUR_QUESTIONNAIRE_PAYLOAD_CACHE_SECONDS
    );
  } catch (_) {
    // キャッシュ不可でも通常処理を継続する。
  }
}

function clearTourQuestionnaireCache_(reservationId) {
  reservationId = String(reservationId || "").trim();
  if (!reservationId) return;
  try {
    const cache = CacheService.getScriptCache();
    ["FULL", "ADDRESS_ONLY", "BLANK"].forEach(function(printMode) {
      cache.remove(buildTourQuestionnairePayloadCacheKey_(reservationId, printMode));
    });
  } catch (_) {
    // キャッシュ削除不可でも住所更新自体は継続する。
  }
}

function buildTourQuestionnairePayloadCacheKey_(reservationId, printMode) {
  return TOUR_QUESTIONNAIRE_PAYLOAD_CACHE_PREFIX +
    String(reservationId || "").trim() + ":" +
    String(printMode || "FULL").trim().toUpperCase();
}

function parseTourQuestionnaireJsonResponse_(response) {
  try {
    if (response && typeof response.getContent === "function") {
      return JSON.parse(response.getContent() || "{}");
    }
    if (typeof response === "string") {
      return JSON.parse(response || "{}");
    }
    return response || {};
  } catch (_) {
    return null;
  }
}
