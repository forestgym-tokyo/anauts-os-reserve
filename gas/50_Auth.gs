/**
 * A-nauts OS Reserve Authentication / Authorization
 *
 * Firebase Authentication (Email/Password) のIDトークンを
 * Google Identity Toolkit APIで検証し、auth_usersシートと紐付けます。
 *
 * Script Properties:
 *   FIREBASE_WEB_API_KEY
 *
 * auth_users columns:
 *   email, staff_code, permission, active, created_at, updated_at
 *
 * permission:
 *   ADMIN / MANAGER / STAFF
 */

const AUTH_SHEET_NAME = "auth_users";
const FIREBASE_USER_CACHE_PREFIX = "firebase-user-v1:";
const FIREBASE_USER_CACHE_MAX_SECONDS = 3300;

/**
 * 9ROUND（SOGA）所属の一般スタッフだけに限定画面を適用する。
 * ADMIN / MANAGER は店舗にかかわらず従来の管理権限を維持する。
 */
function isRestrictedSogaStaff_(auth) {
  const permission = String(
    auth && auth.permission || auth && auth.profile && auth.profile.permission || ""
  ).trim().toUpperCase();
  const storeCode = String(
    auth && auth.profile && auth.profile.store_code || ""
  ).trim().toUpperCase();

  return permission === "STAFF" && storeCode === "SOGA";
}

function getCurrentUser(params) {
  try {
    params = params || {};
    const auth = requireAuth_(params, ["ADMIN", "MANAGER", "STAFF"]);

    // SOGA一般スタッフはログイン時に他店舗のスタッフ予定を先読みしない。
    if (isRestrictedSogaStaff_(auth)) {
      return successResponse(auth.profile);
    }

    if (!normalizeAuthBoolean_(params.include_staff_schedule)) {
      return successResponse(auth.profile);
    }

    let schedule = null;
    let scheduleError = "";

    try {
      const schedulePayload = parseAuthJsonResponse_(
        getStaffSchedule(params)
      );

      if (schedulePayload && schedulePayload.ok === true) {
        schedule = schedulePayload.data || {};
      } else {
        scheduleError = String(
          schedulePayload && schedulePayload.message ||
          "スタッフ予定を取得できませんでした。"
        );
      }
    } catch (scheduleFailure) {
      scheduleError = String(
        scheduleFailure && scheduleFailure.message ||
        "スタッフ予定を取得できませんでした。"
      );
    }

    return successResponse({
      profile: auth.profile,
      staff_schedule: schedule,
      staff_schedule_error: scheduleError,
      staff_schedule_date: String(
        schedule && schedule.date || params.date || ""
      )
    });
  } catch (error) {
    return errorResponse(error.message, "AUTH_ERROR");
  }
}

function requireAuth_(params, allowedPermissions) {
  const idToken = String((params && params.id_token) || "").trim();
  if (!idToken) throw new Error("ログインが必要です。");

  const firebaseUser = lookupFirebaseUser_(idToken);
  const email = String(firebaseUser.email || "").trim().toLowerCase();
  if (!email) throw new Error("ログインメールを確認できません。");

  const access = findAuthAccessByEmail_(email);
  if (!access || access.active !== true) {
    throw new Error("このアカウントにはA-nauts OS Reserveの利用権限がありません。");
  }

  const permission = String(access.permission || "STAFF").toUpperCase();
  if (allowedPermissions && allowedPermissions.length && !allowedPermissions.includes(permission)) {
    throw new Error("この操作を行う権限がありません。");
  }

  const staff = findStaffByCode_(access.staff_code);
  if (!staff) throw new Error("スタッフ情報が見つかりません。");

  const normalized = normalizeStaffRecord_(staff);
  return {
    email: email,
    staff_code: access.staff_code,
    permission: permission,
    profile: {
      email: email,
      staff_code: access.staff_code,
      permission: permission,
      role: normalized.role,
      staff_name: normalized.staff_name,
      display_name: normalized.display_name,
      store_code: normalized.store_code,
      active: normalized.active
    }
  };
}

function lookupFirebaseUser_(idToken) {
  const key = PropertiesService.getScriptProperties().getProperty("FIREBASE_WEB_API_KEY");
  if (!key) throw new Error("Firebase認証設定が未完了です。");

  const cache = CacheService.getScriptCache();
  const cacheKey = buildFirebaseUserCacheKey_(idToken);

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      const cachedUser = JSON.parse(cached);
      if (cachedUser && cachedUser.email) return cachedUser;
    }
  } catch (_) {
    // キャッシュ障害時もFirebaseで通常検証する。
  }

  const response = UrlFetchApp.fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(key),
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  const body = JSON.parse(response.getContentText() || "{}");
  if (code < 200 || code >= 300 || !body.users || !body.users.length) {
    throw new Error("ログイン情報が無効または期限切れです。");
  }

  const firebaseUser = body.users[0];
  const cacheSeconds = firebaseTokenCacheSeconds_(idToken);

  if (cacheSeconds > 0 && firebaseUser && firebaseUser.email) {
    try {
      cache.put(
        cacheKey,
        JSON.stringify({
          email: firebaseUser.email,
          localId: firebaseUser.localId || ""
        }),
        cacheSeconds
      );
    } catch (_) {
      // キャッシュ保存不可でも認証結果はそのまま使用する。
    }
  }

  return firebaseUser;
}

function buildFirebaseUserCacheKey_(idToken) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    idToken,
    Utilities.Charset.UTF_8
  );

  const hex = digest.map(function (value) {
    return ("0" + ((value + 256) % 256).toString(16)).slice(-2);
  }).join("");

  return FIREBASE_USER_CACHE_PREFIX + hex;
}

function firebaseTokenCacheSeconds_(idToken) {
  try {
    const parts = String(idToken || "").split(".");
    if (parts.length < 2) return 300;

    const payload = JSON.parse(
      Utilities.newBlob(
        Utilities.base64DecodeWebSafe(parts[1])
      ).getDataAsString()
    );

    const expiresAt = Number(payload.exp || 0);
    if (!expiresAt) return 300;

    const remaining = Math.floor(
      expiresAt - Date.now() / 1000 - 60
    );

    return Math.max(
      0,
      Math.min(FIREBASE_USER_CACHE_MAX_SECONDS, remaining)
    );
  } catch (_) {
    return 300;
  }
}

function parseAuthJsonResponse_(response) {
  if (response && typeof response.getContent === "function") {
    return JSON.parse(response.getContent() || "{}");
  }
  if (typeof response === "string") {
    return JSON.parse(response || "{}");
  }
  return response || {};
}

function getAuthSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(AUTH_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AUTH_SHEET_NAME);
    sheet.getRange(1, 1, 1, 6).setValues([[
      "email", "staff_code", "permission", "active", "created_at", "updated_at"
    ]]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findAuthAccessByEmail_(email) {
  const sheet = getAuthSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (String(row[idx.email] || "").trim().toLowerCase() === email) {
      return {
        email: String(row[idx.email] || "").trim().toLowerCase(),
        staff_code: String(row[idx.staff_code] || "").trim(),
        permission: String(row[idx.permission] || "STAFF").trim().toUpperCase(),
        active: normalizeAuthBoolean_(row[idx.active])
      };
    }
  }
  return null;
}

function normalizeAuthBoolean_(value) {
  if (value === true) return true;
  const s = String(value || "").trim().toUpperCase();
  return s === "TRUE" || s === "1" || s === "YES" || s === "ON";
}

/**
 * 初回だけGASエディタから直接実行するブートストラップ関数。
 * Web APIとして公開しないでください。
 */
function bootstrapAuthAdmin(email, staffCode) {
  email = String(email || "").trim().toLowerCase();
  staffCode = String(staffCode || "").trim().toUpperCase();
  if (!email || !staffCode) throw new Error("email / staffCode を指定してください。");

  const sheet = getAuthSheet_();
  const values = sheet.getDataRange().getValues();
  const now = new Date();

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0] || "").trim().toLowerCase() === email) {
      sheet.getRange(r + 1, 1, 1, 6).setValues([[
        email, staffCode, "ADMIN", true, values[r][4] || now, now
      ]]);
      return;
    }
  }

  sheet.appendRow([email, staffCode, "ADMIN", true, now, now]);
}
