/** 
 * ============================================================
 * A-nauts OS Reserve
 * Staff Login Provisioning
 * ============================================================
 */
function provisionStaffLogin(body) {

  try {

    body = body || {};

    /*
     * ADMIN / MANAGERのみ
     */
    requireStaffManagementPermission_(
      body
    );


    const staffCode =
      String(
        body.staff_code || ""
      )
        .trim()
        .toUpperCase();


    /*
     * メールアドレス正規化
     *
     * 全角スペース
     * 半角スペース
     * 全角＠
     * 全角ピリオド等
     * を除去・変換
     */
    const email =
      String(
        body.email || ""
      )
        .replace(
          /\u3000/g,
          ""
        )
        .replace(
          /\s+/g,
          ""
        )
        .replace(
          /＠/g,
          "@"
        )
        .replace(
          /．/g,
          "."
        )
        .replace(
          /。/g,
          "."
        )
        .trim()
        .toLowerCase();


    const password =
      String(
        body.initial_password || ""
      );


    const permission =
      String(
        body.permission || "STAFF"
      )
        .trim()
        .toUpperCase();


    const adminUrl =
      String(
        body.admin_url || ""
      ).trim();


    /*
     * ========================================================
     * 入力チェック
     * ========================================================
     */

    if (!staffCode) {

      return errorResponse(
        "スタッフコードを指定してください。",
        "VALIDATION_ERROR"
      );
    }


    /*
     * メール
     */
    if (
      !email ||
      !email.includes("@") ||
      email.startsWith("@") ||
      email.endsWith("@")
    ) {

      return errorResponse(
        "メールアドレスを確認してください：" +
        email,
        "VALIDATION_ERROR"
      );
    }


    /*
     * @が2個以上ないか
     */
    if (
      email.split("@").length !== 2
    ) {

      return errorResponse(
        "メールアドレスを確認してください：" +
        email,
        "VALIDATION_ERROR"
      );
    }


    const emailParts =
      email.split("@");


    /*
     * @前後が空でないこと
     */
    if (
      !emailParts[0] ||
      !emailParts[1]
    ) {

      return errorResponse(
        "メールアドレスを確認してください：" +
        email,
        "VALIDATION_ERROR"
      );
    }


    if (
      password.length < 6
    ) {

      return errorResponse(
        "初期パスワードは6文字以上で指定してください。",
        "VALIDATION_ERROR"
      );
    }


    if (
      ![
        "ADMIN",
        "MANAGER",
        "STAFF"
      ].includes(
        permission
      )
    ) {

      return errorResponse(
        "権限が正しくありません。",
        "VALIDATION_ERROR"
      );
    }


    /*
     * ========================================================
     * スタッフ確認
     * ========================================================
     */

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


    /*
     * ========================================================
     * スタッフマスターのメールも正規化
     * ========================================================
     */

    const masterEmail =
      String(
        normalized.email ||
        staff.email ||
        ""
      )
        .replace(
          /\u3000/g,
          ""
        )
        .replace(
          /\s+/g,
          ""
        )
        .replace(
          /＠/g,
          "@"
        )
        .replace(
          /．/g,
          "."
        )
        .replace(
          /。/g,
          "."
        )
        .trim()
        .toLowerCase();


    /*
     * スタッフ登録メールと
     * ログインメールが一致しているか
     */
    if (
      masterEmail &&
      masterEmail !== email
    ) {

      return errorResponse(
        "スタッフ登録のメールアドレスとログインメールアドレスが一致しません。" +
        " 登録：" +
        masterEmail +
        " / ログイン：" +
        email,
        "EMAIL_MISMATCH"
      );
    }


    /*
     * ========================================================
     * Firebaseアカウント作成
     * ========================================================
     */

    const firebase =
      ensureFirebasePasswordUser_(
        email,
        password
      );


    /*
     * ========================================================
     * auth_users 自動登録・更新
     * ========================================================
     */

    upsertAuthUser_(
      email,
      staffCode,
      permission
    );


    /*
     * ========================================================
     * ログイン案内メール送信
     * ========================================================
     */

    sendStaffLoginSetupMail_({

      email:
        email,

      password:
        password,

      permission:
        permission,

      staffCode:
        staffCode,

      staffName:
        String(
          normalized.display_name ||
          normalized.staff_name ||
          staffCode
        ),

      role:
        String(
          normalized.role ||
          "STAFF"
        )
          .trim()
          .toUpperCase(),

      adminUrl:
        adminUrl
    });


    return successResponse({

      email:
        email,

      staff_code:
        staffCode,

      permission:
        permission,

      firebase_mode:
        firebase.mode,

      mail_sent:
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
 * ============================================================
 * Firebase Email / Password アカウント作成
 * ============================================================
 */
function ensureFirebasePasswordUser_(
  email,
  password
) {

  const key =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        "FIREBASE_WEB_API_KEY"
      );


  if (!key) {

    throw new Error(
      "Firebase認証設定が未完了です。"
    );
  }


  /*
   * 新規作成
   */
  const signup =
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
              password,

            returnSecureToken:
              true
          }),

        muteHttpExceptions:
          true
      }
    );


  const responseCode =
    signup.getResponseCode();


  const responseBody =
    JSON.parse(
      signup.getContentText() ||
      "{}"
    );


  /*
   * 新規作成成功
   */
  if (
    responseCode >= 200 &&
    responseCode < 300
  ) {

    return {
      mode:
        "CREATED",

      local_id:
        responseBody.localId ||
        ""
    };
  }


  const firebaseMessage =
    String(
      responseBody &&
      responseBody.error &&
      responseBody.error.message
        ? responseBody.error.message
        : ""
    );


  /*
   * ========================================================
   * 既にFirebase登録済み
   * ========================================================
   */

  if (
    firebaseMessage.includes(
      "EMAIL_EXISTS"
    )
  ) {

    /*
     * 入力されたパスワードで
     * 実際にログインできるか確認
     */
    const signin =
      UrlFetchApp.fetch(

        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
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
                password,

              returnSecureToken:
                true
            }),

          muteHttpExceptions:
            true
        }
      );


    if (
      signin.getResponseCode() >= 200 &&
      signin.getResponseCode() < 300
    ) {

      return {
        mode:
          "EXISTING_VERIFIED"
      };
    }


    throw new Error(
      "このメールアドレスはすでにログイン登録されています。" +
      "入力したパスワードが既存アカウントと一致しません。"
    );
  }


  /*
   * パスワード不備
   */
  if (
    firebaseMessage.includes(
      "WEAK_PASSWORD"
    )
  ) {

    throw new Error(
      "初期パスワードが短すぎます。6文字以上で設定してください。"
    );
  }


  /*
   * Email / Password認証が無効
   */
  if (
    firebaseMessage.includes(
      "OPERATION_NOT_ALLOWED"
    )
  ) {

    throw new Error(
      "Firebaseのメール/パスワード認証が有効になっていません。"
    );
  }


  throw new Error(
    "Firebaseアカウントを作成できませんでした。" +
    (
      firebaseMessage
        ? " (" +
          firebaseMessage +
          ")"
        : ""
    )
  );
}


/**
 * ============================================================
 * auth_users 自動登録 / 更新
 * ============================================================
 */
function upsertAuthUser_(
  email,
  staffCode,
  permission
) {

  const sheet =
    getAuthSheet_();


  const values =
    sheet
      .getDataRange()
      .getValues();


  const now =
    new Date();


  /*
   * 既存
   */
  for (
    let r = 1;
    r < values.length;
    r++
  ) {

    if (
      String(
        values[r][0] ||
        ""
      )
        .trim()
        .toLowerCase() ===
      email
    ) {

      sheet
        .getRange(
          r + 1,
          1,
          1,
          6
        )
        .setValues([
          [
            email,
            staffCode,
            permission,
            true,
            values[r][4] ||
              now,
            now
          ]
        ]);


      return;
    }
  }


  /*
   * 新規
   */
  sheet.appendRow([
    email,
    staffCode,
    permission,
    true,
    now,
    now
  ]);
}


/**
 * ============================================================
 * ログイン設定メール
 * ============================================================
 */
function sendStaffLoginSetupMail_(
  data
) {

  const honorific =
    data.role ===
    "TRAINER"

      ? data.staffName +
        "トレーナー"

      : data.staffName +
        "さん";


  let body =
    honorific +
    "\n\n";


  body +=
    "A-nauts OS Reserveのログイン設定が完了しました。\n";


  body +=
    "以下の情報でログインしてください。\n\n";


  body +=
    "ログインメールアドレス：\n" +
    data.email +
    "\n\n";


  body +=
    "初期パスワード：\n" +
    data.password +
    "\n";


  if (
    data.adminUrl
  ) {

    body +=
      "\n管理画面：\n" +
      data.adminUrl +
      "\n";
  }


  body +=
    "\n権限：" +
    data.permission +
    "\n\n";


  body +=
    "このメールはA-nauts OS Reserveから自動送信されています。";


  MailApp.sendEmail({

    to:
      data.email,

    subject:
      "【A-nauts OS Reserve】ログイン設定のお知らせ",

    body:
      body,

    name:
      "A-nauts OS Reserve"
  });
}