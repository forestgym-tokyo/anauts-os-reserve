/**
 * ============================================================
 * A-nauts OS Reserve
 * Staff Login Provisioning
 * ============================================================
 *
 * ADMIN / MANAGERがスタッフ登録後に、
 * Firebase Authentication + auth_users のログイン設定を行う。
 *
 * 流れ:
 * 1. staffマスターのメールと一致確認
 * 2. auth_usersをupsert
 * 3. Firebase Authユーザーがなければ一時パスワードで作成
 * 4. FirebaseのPASSWORD_RESETメールを本人へ送信
 *
 * パスワード自体はスプレッドシートへ保存しない。
 */


/**
 * POST:
 * action=provisionStaffLogin
 */
function provisionStaffLogin(body) {

  try {

    body = body || {};

    requireStaffManagementPermission_(
      body
    );


    const staffCode =
      String(
        body.staff_code || ""
      )
        .trim()
        .toUpperCase();

    const email =
      String(
        body.email || ""
      )
        .trim()
        .toLowerCase();


    if (!staffCode) {
      return errorResponse(
        "スタッフコードを指定してください。",
        "STAFF_CODE_REQUIRED"
      );
    }

    if (!email) {
      return errorResponse(
        "ログイン用メールアドレスを指定してください。",
        "EMAIL_REQUIRED"
      );
    }


    const staff =
      findStaffByCode_(
        staffCode
      );

    if (!staff) {
      return errorResponse(
        "スタッフ情報が見つかりません。",
        "STAFF_NOT_FOUND"
      );
    }


    const normalized =
      normalizeStaffRecord_(
        staff
      );

    const staffEmail =
      String(
        normalized.email ||
        staff.email ||
        ""
      )
        .trim()
        .toLowerCase();


    if (!staffEmail) {
      return errorResponse(
        "スタッフ情報にメールアドレスが登録されていません。",
        "STAFF_EMAIL_REQUIRED"
      );
    }


    if (
      staffEmail !==
      email
    ) {
      return errorResponse(
        "スタッフ情報のメールアドレスとログイン用メールアドレスが一致しません。",
        "EMAIL_MISMATCH"
      );
    }


    /*
     * auth_usersへ紐付け。
     * 既存のADMIN / MANAGER権限がある場合は保持する。
     */
    const access =
      upsertStaffAuthAccess_(
        email,
        staffCode
      );


    /*
     * Firebaseユーザーを作成。
     * すでに存在する場合はそのまま利用。
     */
    const firebaseResult =
      ensureFirebasePasswordUser_(
        email
      );


    /*
     * 本人へパスワード設定/再設定メール。
     */
    sendFirebasePasswordResetMail_(
      email
    );


    return successResponse({
      staff_code:
        staffCode,

      email:
        email,

      permission:
        access.permission,

      firebase_user_created:
        firebaseResult.created,

      password_setup_mail_sent:
        true
    });


  } catch (error) {

    logError(
      "provisionStaffLogin",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      error.message ||
        "ログイン設定中にエラーが発生しました。",
      "LOGIN_PROVISION_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * auth_usersをupsert。
 *
 * - 同一staff_codeの既存権限は引き継ぐ
 * - 同じstaff_codeで古いメールがactiveの場合、新メールへ移す際は旧行をinactive
 * - 同じemailが別staff_codeへ紐付いている場合は拒否
 * - 新規はSTAFF権限
 */
function upsertStaffAuthAccess_(
  email,
  staffCode
) {

  const sheet =
    getAuthSheet_();

  const values =
    sheet
      .getDataRange()
      .getValues();

  const headers =
    values[0]
      .map(value =>
        String(value).trim()
      );

  const idx = {};
  headers.forEach(
    (header, index) =>
      idx[header] = index
  );


  const now =
    new Date();

  let inheritedPermission =
    "STAFF";

  let exactRowNumber =
    -1;


  /*
   * 事前確認
   */
  for (
    let r = 1;
    r < values.length;
    r++
  ) {

    const row =
      values[r];

    const rowEmail =
      String(
        row[idx.email] || ""
      )
        .trim()
        .toLowerCase();

    const rowStaffCode =
      String(
        row[idx.staff_code] || ""
      )
        .trim()
        .toUpperCase();

    const rowPermission =
      String(
        row[idx.permission] ||
        "STAFF"
      )
        .trim()
        .toUpperCase();

    const rowActive =
      normalizeAuthBoolean_(
        row[idx.active]
      );


    /*
     * 同じemailが別スタッフに紐付いている場合は不可
     */
    if (
      rowEmail === email &&
      rowStaffCode &&
      rowStaffCode !== staffCode &&
      rowActive
    ) {
      throw new Error(
        "このメールアドレスは別のスタッフアカウントで使用されています。"
      );
    }


    /*
     * 同一スタッフの権限は引き継ぐ
     */
    if (
      rowStaffCode ===
      staffCode
    ) {

      if (
        rowPermission === "ADMIN" ||
        rowPermission === "MANAGER"
      ) {
        inheritedPermission =
          rowPermission;
      }

      if (
        rowEmail === email
      ) {
        exactRowNumber =
          r + 1;
      }
    }
  }


  /*
   * 同一スタッフの旧メールを無効化
   */
  for (
    let r = 1;
    r < values.length;
    r++
  ) {

    const row =
      values[r];

    const rowEmail =
      String(
        row[idx.email] || ""
      )
        .trim()
        .toLowerCase();

    const rowStaffCode =
      String(
        row[idx.staff_code] || ""
      )
        .trim()
        .toUpperCase();

    if (
      rowStaffCode === staffCode &&
      rowEmail !== email &&
      normalizeAuthBoolean_(
        row[idx.active]
      )
    ) {

      sheet
        .getRange(
          r + 1,
          idx.active + 1
        )
        .setValue(
          false
        );

      sheet
        .getRange(
          r + 1,
          idx.updated_at + 1
        )
        .setValue(
          now
        );
    }
  }


  /*
   * 同じemail/staff_codeが既存
   */
  if (
    exactRowNumber !== -1
  ) {

    const createdAt =
      sheet
        .getRange(
          exactRowNumber,
          idx.created_at + 1
        )
        .getValue() ||
      now;

    sheet
      .getRange(
        exactRowNumber,
        1,
        1,
        headers.length
      )
      .setValues([[
        email,
        staffCode,
        inheritedPermission,
        true,
        createdAt,
        now
      ]]);


    return {
      email:
        email,

      staff_code:
        staffCode,

      permission:
        inheritedPermission,

      active:
        true
    };
  }


  /*
   * 新規
   */
  sheet.appendRow([
    email,
    staffCode,
    inheritedPermission,
    true,
    now,
    now
  ]);


  return {
    email:
      email,

    staff_code:
      staffCode,

    permission:
      inheritedPermission,

    active:
      true
  };
}


/**
 * Firebase Authenticationユーザーを確保
 *
 * ユーザーが存在しなければ、
 * ランダムな一時パスワードで作成する。
 *
 * 一時パスワードは保存・通知しない。
 * 直後にPASSWORD_RESETメールを送信して、
 * 本人が自分のパスワードを設定する。
 */
function ensureFirebasePasswordUser_(
  email
) {

  const key =
    getFirebaseWebApiKey_();

  const temporaryPassword =
    createTemporaryFirebasePassword_();


  const response =
    UrlFetchApp.fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" +
        encodeURIComponent(
          key
        ),
      {
        method:
          "post",

        contentType:
          "application/json",

        payload:
          JSON.stringify({
            email:
              email,

            password:
              temporaryPassword,

            returnSecureToken:
              true
          }),

        muteHttpExceptions:
          true
      }
    );


  const code =
    response
      .getResponseCode();

  const body =
    JSON.parse(
      response
        .getContentText() ||
      "{}"
    );


  if (
    code >= 200 &&
    code < 300
  ) {

    return {
      created:
        true,

      uid:
        body.localId || ""
    };
  }


  const firebaseError =
    String(
      body &&
      body.error &&
      body.error.message ||
      ""
    );


  /*
   * 既存アカウントなら正常扱い。
   * PASSWORD_RESETメールを再送する。
   */
  if (
    firebaseError.indexOf(
      "EMAIL_EXISTS"
    ) !== -1
  ) {

    return {
      created:
        false,

      existing:
        true
    };
  }


  if (
    firebaseError.indexOf(
      "OPERATION_NOT_ALLOWED"
    ) !== -1
  ) {
    throw new Error(
      "Firebaseのメール/パスワード認証が有効になっていません。"
    );
  }


  throw new Error(
    "Firebaseログインアカウントを作成できませんでした：" +
    (
      firebaseError ||
      "UNKNOWN_ERROR"
    )
  );
}


/**
 * Firebaseのパスワード設定/再設定メールを送信
 */
function sendFirebasePasswordResetMail_(
  email
) {

  const key =
    getFirebaseWebApiKey_();


  const response =
    UrlFetchApp.fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=" +
        encodeURIComponent(
          key
        ),
      {
        method:
          "post",

        contentType:
          "application/json",

        headers: {
          "X-Firebase-Locale":
            "ja"
        },

        payload:
          JSON.stringify({
            requestType:
              "PASSWORD_RESET",

            email:
              email
          }),

        muteHttpExceptions:
          true
      }
    );


  const code =
    response
      .getResponseCode();

  const body =
    JSON.parse(
      response
        .getContentText() ||
      "{}"
    );


  if (
    code >= 200 &&
    code < 300
  ) {
    return true;
  }


  const firebaseError =
    String(
      body &&
      body.error &&
      body.error.message ||
      ""
    );


  throw new Error(
    "パスワード設定メールを送信できませんでした：" +
    (
      firebaseError ||
      "UNKNOWN_ERROR"
    )
  );
}


/**
 * FIREBASE_WEB_API_KEY
 */
function getFirebaseWebApiKey_() {

  const key =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        "FIREBASE_WEB_API_KEY"
      );

  if (!key) {
    throw new Error(
      "FIREBASE_WEB_API_KEY が設定されていません。"
    );
  }

  return key;
}


/**
 * 保存しない一時パスワード
 */
function createTemporaryFirebasePassword_() {

  return (
    "Aa9!" +
    Utilities
      .getUuid()
      .replace(
        /-/g,
        ""
      ) +
    Utilities
      .getUuid()
      .replace(
        /-/g,
        ""
      )
  );
}
