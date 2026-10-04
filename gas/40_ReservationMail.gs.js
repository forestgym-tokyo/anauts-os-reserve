/**
 * A-nauts OS Reserve
 * 40_ReservationMail.gs
 *
 * 機能:
 * - services取得
 * - mail_accounts取得
 * - mail_templates取得
 * - service_code完全一致テンプレート
 * - category共通テンプレート
 * - プレースホルダー置換
 * - 予約変更・キャンセル・消化通知用プレースホルダー対応
 * - お客様向けメール送信
 * - 管理者向け通知メール送信
 * - mail_logs記録
 *
 * createReservation()から以下で呼び出す:
 *
 * sendReservationMail_(
 *   reservationRecord,
 *   "RESERVATION_CREATED"
 * );
 */


/**
 * 予約メール送信
 *
 * @param {Object} reservation
 * @param {string} eventType
 * @returns {Object}
 */
function sendReservationMail_(
  reservation,
  eventType
) {

  reservation =
    reservation || {};

  eventType =
    normalizeReservationMailText_(
      eventType ||
      "RESERVATION_CREATED"
    ).toUpperCase();

  const serviceCode =
    normalizeReservationMailText_(
      reservation.service_code
    );

  const customerEmail =
    normalizeReservationMailText_(
      reservation.customer_email
    );

  if (!serviceCode) {
    throw new Error(
      "予約メール送信にservice_codeが必要です。"
    );
  }

  if (!customerEmail) {
    throw new Error(
      "予約メール送信にcustomer_emailが必要です。"
    );
  }

  /*
   * サービス取得
   */
  const service =
    findReservationMailRow_(
      "services",
      "service_code",
      serviceCode
    );

  if (!service) {
    throw new Error(
      "メール送信対象サービスが見つかりません: " +
      serviceCode
    );
  }

  /*
   * メールアカウント取得
   */
  const mailAccountCode =
    normalizeReservationMailText_(
      service.mail_account_code ||
      reservation.mail_account_code
    );

  if (!mailAccountCode) {
    throw new Error(
      "サービスにmail_account_codeが設定されていません: " +
      serviceCode
    );
  }

  const mailAccount =
    findReservationMailRow_(
      "mail_accounts",
      "mail_account_code",
      mailAccountCode
    );

  if (!mailAccount) {
    throw new Error(
      "mail_accountsに設定がありません: " +
      mailAccountCode
    );
  }

  /*
   * テンプレート取得
   *
   * 優先順位:
   * 1. service_code完全一致
   * 2. category共通
   */
  const customerTemplate =
    findReservationMailTemplate_(
      serviceCode,
      eventType,
      "CUSTOMER"
    );

  const adminTemplate =
    findReservationMailTemplate_(
      serviceCode,
      eventType,
      "ADMIN"
    );

  const values =
    buildReservationMailValues_(
      reservation,
      service,
      mailAccount
    );

  const result = {
    customer_mail:
      null,
    admin_mail:
      null
  };

  /*
   * お客様向けメール
   */
  if (customerTemplate) {

    result.customer_mail =
      sendReservationMailMessage_({
        reservation_id:
          values.reservation_id,

        service_code:
          values.service_code,

        event_type:
          eventType,

        mail_type:
          "CUSTOMER",

        to:
          customerEmail,

        cc:
          "",

        bcc:
          normalizeReservationMailText_(
            mailAccount.customer_bcc
          ),

        reply_to:
          normalizeReservationMailText_(
            mailAccount.reply_to ||
            mailAccount.email
          ),

        display_name:
          normalizeReservationMailText_(
            mailAccount.display_name
          ),

        subject:
          replaceReservationMailPlaceholders_(
            customerTemplate.subject,
            values
          ),

        body:
          appendReservationManageLinkToMail_(
            replaceReservationMailPlaceholders_(
              removeReservationCustomerStaffLine_(
                customerTemplate.body
              ),
              values
            ),
            eventType,
            values.manage_url,
            values
          ),

        html_body:
          buildReservationCustomerHtmlBody_(
            replaceReservationMailPlaceholders_(
              removeReservationCustomerStaffLine_(
                customerTemplate.body
              ),
              values
            ),
            eventType,
            values.manage_url,
            values
          )
      });
  }

  /*
   * 管理者向け通知メール
   */
  const adminTo =
    normalizeReservationMailText_(
      mailAccount.admin_to
    );

  if (
    adminTemplate &&
    adminTo
  ) {

    result.admin_mail =
      sendReservationMailMessage_({
        reservation_id:
          values.reservation_id,

        service_code:
          values.service_code,

        event_type:
          eventType,

        mail_type:
          "ADMIN",

        to:
          adminTo,

        cc:
          normalizeReservationMailText_(
            mailAccount.admin_cc
          ),

        bcc:
          normalizeReservationMailText_(
            mailAccount.admin_bcc
          ),

        reply_to:
          normalizeReservationMailText_(
            mailAccount.reply_to ||
            mailAccount.email
          ),

        display_name:
          normalizeReservationMailText_(
            mailAccount.display_name
          ),

        subject:
          replaceReservationMailPlaceholders_(
            adminTemplate.subject,
            values
          ),

        body:
          appendReservationAdminManageLinkToMail_(
            replaceReservationMailPlaceholders_(
              adminTemplate.body,
              values
            ),
            eventType,
            values.admin_manage_url
          ),

        html_body:
          buildReservationAdminHtmlBody_(
            replaceReservationMailPlaceholders_(
              adminTemplate.body,
              values
            ),
            eventType,
            values.admin_manage_url
          )
      });
  }

  return result;
}


/**
 * 管理通知メールへ管理者専用予約管理URLを付加
 *
 * 管理者は3時間制限の対象外。
 */
function appendReservationAdminManageLinkToMail_(
  body,
  eventType,
  manageUrl
) {

  const normalizedEventType =
    normalizeReservationMailText_(
      eventType
    ).toUpperCase();

  const allowedEvents = [
    "RESERVATION_CREATED",
    "RESERVATION_UPDATED",
    "RESERVATION_RESTORED"
  ];

  if (
    !allowedEvents.includes(
      normalizedEventType
    ) ||
    !manageUrl
  ) {
    return String(
      body || ""
    );
  }

  return (
    String(
      body || ""
    ).replace(/\s+$/g, "") +
    "\n\n" +
    "【管理者用｜予約の確認・変更・キャンセル】\n" +
    manageUrl
  );
}


/**
 * 管理通知HTMLメール本文
 *
 * 管理者用ボタンには3時間制限をかけない。
 */
function buildReservationAdminHtmlBody_(
  body,
  eventType,
  manageUrl
) {

  const normalizedEventType =
    normalizeReservationMailText_(
      eventType
    ).toUpperCase();

  const allowedEvents = [
    "RESERVATION_CREATED",
    "RESERVATION_UPDATED",
    "RESERVATION_RESTORED"
  ];

  const actionButtonBackground =
    serviceCode === "MPG_TRAINING_SUPPORT45"
      ? "#81d8d0"
      : "#178447";

  const actionButtonColor =
    serviceCode === "MPG_TRAINING_SUPPORT45"
      ? "#111111"
      : "#ffffff";

  const escapedBody =
    escapeReservationMailHtml_(
      String(
        body || ""
      ).replace(/\s+$/g, "")
    )
    .replace(
      /\r?\n/g,
      "<br>"
    );

  let buttonHtml = "";

  if (
    allowedEvents.includes(
      normalizedEventType
    ) &&
    manageUrl
  ) {

    const escapedUrl =
      escapeReservationMailHtmlAttribute_(
        manageUrl
      );

    buttonHtml =
      '<div style="margin:28px 0 22px 0;">' +
        '<a href="' +
          escapedUrl +
        '" style="' +
          'display:inline-block;' +
          'background:' + actionButtonBackground + ';' +
          'color:' + actionButtonColor + ';' +
          'text-decoration:none;' +
          'font-size:15px;' +
          'font-weight:700;' +
          'line-height:1.4;' +
          'padding:14px 22px;' +
          'border-radius:8px;' +
        '">' +
          '管理者用｜予約の確認・変更・キャンセル' +
        '</a>' +
      '</div>';
  }

  return (
    '<div style="' +
      'font-family:-apple-system,BlinkMacSystemFont,' +
      '"Segoe UI","Noto Sans JP",Arial,sans-serif;' +
      'font-size:15px;' +
      'line-height:1.8;' +
      'color:#202424;' +
    '">' +
      escapedBody +
      buttonHtml +
    '</div>'
  );
}


/**
 * 会員向けメールへ予約管理URLを付加
 *
 * 予約作成・変更・復旧時に表示する。
 * キャンセル済み・消化済み通知には付けない。
 */
function appendReservationManageLinkToMail_(
  body,
  eventType,
  manageUrl,
  values
) {

  const normalizedEventType =
    normalizeReservationMailText_(
      eventType
    ).toUpperCase();

  const serviceCode =
    normalizeReservationMailText_(
      values && values.service_code
    ).toUpperCase();

  const allowedEvents = [
    "RESERVATION_CREATED",
    "RESERVATION_UPDATED",
    "RESERVATION_RESTORED"
  ];

  /*
   * 店内見学（TOUR）は現在の仕様を維持。
   * 変更・キャンセルURLを追加しない。
   */
  if (
    serviceCode === "TOUR" ||
    !allowedEvents.includes(
      normalizedEventType
    )
  ) {
    return String(
      body || ""
    );
  }

  const baseBody =
    String(
      body || ""
    ).replace(/\s+$/g, "");

  const phone =
    getReservationContactPhone_();

  const phoneText =
    formatReservationContactPhone_(
      phone
    );

  /*
   * 予約確認メール送信時点ですでに開始3時間前を過ぎている場合は
   * 変更・キャンセルURLを出さず電話案内にする。
   */
  if (
    isReservationMailWithinThreeHours_(
      values
    )
  ) {
    return (
      baseBody +
      "\n\n" +
      "予約開始3時間前を過ぎてからの変更・キャンセルは、" +
      "お電話にてご連絡ください。\n" +
      phoneText
    );
  }

  if (!manageUrl) {
    return (
      baseBody +
      "\n\n" +
      "予約開始3時間前を過ぎてからの変更・キャンセルは、" +
      "お電話にてご連絡ください。\n" +
      phoneText
    );
  }

  return (
    baseBody +
    "\n\n" +
    "【予約を変更・キャンセル】\n" +
    manageUrl +
    "\n\n" +
    "※予約の変更・キャンセルは開始3時間前までです。\n" +
    "3時間前を過ぎた場合はお電話にてご連絡ください。\n" +
    phoneText
  );
}


/**
 * 会員向けHTMLメール本文を生成
 *
 * HTMLメールでは長い管理URLを直接表示せず、
 * 「予約内容の確認・変更・キャンセル」ボタンとして表示する。
 *
 * プレーンテキスト版にはURLを残すため、
 * HTML非対応メール環境でも予約管理ページへアクセスできる。
 */
function buildReservationCustomerHtmlBody_(
  body,
  eventType,
  manageUrl,
  values
) {

  const normalizedEventType =
    normalizeReservationMailText_(
      eventType
    ).toUpperCase();

  const serviceCode =
    normalizeReservationMailText_(
      values && values.service_code
    ).toUpperCase();

  const allowedEvents = [
    "RESERVATION_CREATED",
    "RESERVATION_UPDATED",
    "RESERVATION_RESTORED"
  ];

  const escapedBody =
    escapeReservationMailHtml_(
      String(
        body || ""
      ).replace(/\s+$/g, "")
    )
    .replace(
      /\r?\n/g,
      "<br>"
    );

  /*
   * 店内見学（TOUR）は現在の確認メールをそのまま維持。
   * この共通処理ではボタン・電話案内を追加しない。
   */
  if (
    serviceCode === "TOUR" ||
    !allowedEvents.includes(
      normalizedEventType
    )
  ) {
    return (
      '<div style="' +
        'font-family:-apple-system,BlinkMacSystemFont,' +
        '"Segoe UI","Noto Sans JP",Arial,sans-serif;' +
        'font-size:15px;' +
        'line-height:1.8;' +
        'color:#202424;' +
      '">' +
        escapedBody +
      '</div>'
    );
  }

  const phone =
    getReservationContactPhone_();

  const escapedPhone =
    escapeReservationMailHtmlAttribute_(
      phone
    );

  const phoneText =
    escapeReservationMailHtml_(
      formatReservationContactPhone_(
        phone
      )
    );

  const phoneButton =
    '<div style="margin:24px 0 10px 0;">' +
      '<a href="tel:' +
        escapedPhone +
      '" style="' +
        'display:inline-block;' +
        'background:#1f2937;' +
        'color:#ffffff;' +
        'text-decoration:none;' +
        'font-size:15px;' +
        'font-weight:700;' +
        'line-height:1.4;' +
        'padding:13px 20px;' +
        'border-radius:8px;' +
      '">' +
        '電話する ' +
        phoneText +
      '</a>' +
    '</div>';

  let actionHtml = "";

  if (
    isReservationMailWithinThreeHours_(
      values
    )
  ) {

    actionHtml =
      '<div style="' +
        'margin:26px 0 12px 0;' +
        'padding:16px 18px;' +
        'background:#fff7ed;' +
        'border:1px solid #fed7aa;' +
        'border-radius:8px;' +
      '">' +
        '<strong>' +
          '予約開始3時間前を過ぎています。' +
        '</strong><br>' +
        '変更・キャンセルはお電話にてご連絡ください。' +
      '</div>' +
      phoneButton;

  } else if (manageUrl) {

    const escapedUrl =
      escapeReservationMailHtmlAttribute_(
        manageUrl
      );

    actionHtml =
      '<div style="margin:28px 0 16px 0;">' +
        '<a href="' +
          escapedUrl +
        '" style="' +
          'display:inline-block;' +
          'background:#178447;' +
          'color:#ffffff;' +
          'text-decoration:none;' +
          'font-size:15px;' +
          'font-weight:700;' +
          'line-height:1.4;' +
          'padding:14px 22px;' +
          'border-radius:8px;' +
        '">' +
          '予約を変更・キャンセル' +
        '</a>' +
      '</div>' +

      '<div style="' +
        'margin:6px 0 8px 0;' +
        'font-size:13px;' +
        'color:#59636e;' +
      '">' +
        '予約の変更・キャンセルは開始3時間前までです。<br>' +
        '3時間前を過ぎた場合はお電話にてご連絡ください。' +
      '</div>' +

      phoneButton;

  } else {

    actionHtml =
      '<div style="' +
        'margin:20px 0 8px 0;' +
        'font-size:13px;' +
        'color:#59636e;' +
      '">' +
        '予約開始3時間前を過ぎてからの変更・キャンセルは、' +
        'お電話にてご連絡ください。' +
      '</div>' +
      phoneButton;
  }

  return (
    '<div style="' +
      'font-family:-apple-system,BlinkMacSystemFont,' +
      '"Segoe UI","Noto Sans JP",Arial,sans-serif;' +
      'font-size:15px;' +
      'line-height:1.8;' +
      'color:#202424;' +
    '">' +
      escapedBody +
      actionHtml +
    '</div>'
  );
}


/**
 * お客様向け予約連絡先
 */
function getReservationContactPhone_() {
  return "0474595623";
}


/**
 * 電話番号表示用
 */
function formatReservationContactPhone_(
  phone
) {

  const digits =
    String(
      phone || ""
    ).replace(/\D/g, "");

  if (digits === "0474595623") {
    return "047-459-5623";
  }

  return digits;
}


/**
 * 予約開始まで3時間以内か判定
 */
function isReservationMailWithinThreeHours_(
  values
) {

  try {

    const date =
      normalizeReservationMailText_(
        values && values.date
      );

    const time =
      normalizeReservationMailText_(
        values && values.start_time
      );

    if (
      !date ||
      !time
    ) {
      return false;
    }

    /*
     * 29_Reservation.gs側と同じ日時生成関数を使用する。
     */
    const startAt =
      createAvailabilityDateTime_(
        date,
        time
      );

    const diffMs =
      startAt.getTime() -
      new Date().getTime();

    return (
      diffMs <=
      3 * 60 * 60 * 1000
    );

  } catch (error) {

    /*
     * メール送信自体を止めない。
     * 判定不能時は通常ボタン表示とし、
     * ボタン下の電話案内でフォローする。
     */
    return false;
  }
}


/**
 * HTML本文用エスケープ
 */
function escapeReservationMailHtml_(
  value
) {

  return String(
    value || ""
  )
  .replace(
    /&/g,
    "&amp;"
  )
  .replace(
    /</g,
    "&lt;"
  )
  .replace(
    />/g,
    "&gt;"
  )
  .replace(
    /"/g,
    "&quot;"
  )
  .replace(
    /'/g,
    "&#39;"
  );
}


/**
 * HTML属性用エスケープ
 */
function escapeReservationMailHtmlAttribute_(
  value
) {

  return escapeReservationMailHtml_(
    value
  );
}


/**
 * メール1通送信
 *
 * @param {Object} values
 * @returns {Object}
 */
function sendReservationMailMessage_(
  values
) {

  const options = {
    name:
      values.display_name || "",

    replyTo:
      values.reply_to || ""
  };

  if (values.cc) {
    options.cc =
      values.cc;
  }

  if (values.bcc) {
    options.bcc =
      values.bcc;
  }

  if (values.html_body) {
    options.htmlBody =
      values.html_body;
  }

  try {

    GmailApp.sendEmail(
      values.to,
      values.subject,
      values.body,
      options
    );

    appendReservationMailLog_({
      reservation_id:
        values.reservation_id,

      service_code:
        values.service_code,

      event_type:
        values.event_type,

      mail_type:
        values.mail_type,

      to:
        values.to,

      cc:
        values.cc || "",

      bcc:
        values.bcc || "",

      subject:
        values.subject,

      status:
        "SENT",

      error:
        ""
    });

    return {
      ok:
        true,

      to:
        values.to,

      subject:
        values.subject
    };

  } catch (error) {

    appendReservationMailLog_({
      reservation_id:
        values.reservation_id,

      service_code:
        values.service_code,

      event_type:
        values.event_type,

      mail_type:
        values.mail_type,

      to:
        values.to,

      cc:
        values.cc || "",

      bcc:
        values.bcc || "",

      subject:
        values.subject,

      status:
        "ERROR",

      error:
        error.message
    });

    throw error;
  }
}


/**
 * メールテンプレート取得
 *
 * 優先順位:
 * 1. service_code完全一致
 * 2. services.category一致
 *
 * @param {string} serviceCode
 * @param {string} eventType
 * @param {string} mailType
 * @returns {Object|null}
 */
function findReservationMailTemplate_(
  serviceCode,
  eventType,
  mailType
) {

  const rows =
    getReservationMailRows_(
      "mail_templates"
    );

  const normalizedServiceCode =
    normalizeReservationMailText_(
      serviceCode
    ).toUpperCase();

  const normalizedEventType =
    normalizeReservationMailText_(
      eventType
    ).toUpperCase();

  const normalizedMailType =
    normalizeReservationMailText_(
      mailType
    ).toUpperCase();

  /*
   * servicesシートから対象サービス取得
   */
  const service =
    findReservationMailRow_(
      "services",
      "service_code",
      normalizedServiceCode
    );

  const category =
    service
      ? normalizeReservationMailText_(
          service.category
        ).toUpperCase()
      : "";

  const hasMailTypeColumn =
    rows.length > 0 &&
    Object.prototype.hasOwnProperty.call(
      rows[0],
      "mail_type"
    );

  /*
   * active・event_type・mail_typeで抽出
   */
  const matchedRows =
    rows.filter(function(row) {

      if (
        !normalizeReservationMailBoolean_(
          row.active
        )
      ) {
        return false;
      }

      if (
        normalizeReservationMailText_(
          row.event_type
        ).toUpperCase() !==
        normalizedEventType
      ) {
        return false;
      }

      if (hasMailTypeColumn) {

        if (
          normalizeReservationMailText_(
            row.mail_type
          ).toUpperCase() !==
          normalizedMailType
        ) {
          return false;
        }

      } else if (
        normalizedMailType !==
        "CUSTOMER"
      ) {
        return false;
      }

      return true;
    });

  /*
   * 1. service_code完全一致
   */
  const exactTemplate =
    matchedRows.find(function(row) {

      return (
        normalizeReservationMailText_(
          row.service_code
        ).toUpperCase() ===
        normalizedServiceCode
      );
    });

  if (exactTemplate) {
    return exactTemplate;
  }

  /*
   * 2. category共通テンプレート
   */
  if (category) {

    const categoryTemplate =
      matchedRows.find(function(row) {

        return (
          normalizeReservationMailText_(
            row.service_code
          ).toUpperCase() ===
          category
        );
      });

    if (categoryTemplate) {
      return categoryTemplate;
    }
  }

  return null;
}


/**
 * 予約メール用プレースホルダー値生成
 *
 * @param {Object} reservation
 * @param {Object} service
 * @param {Object} mailAccount
 * @returns {Object}
 */
function buildReservationMailValues_(
  reservation,
  service,
  mailAccount
) {

  return {
    reservation_id:
      normalizeReservationMailText_(
        reservation.reservation_id
      ),

    customer_name:
      normalizeReservationMailText_(
        reservation.customer_name
      ),

    customer_email:
      normalizeReservationMailText_(
        reservation.customer_email
      ),

    customer_phone:
      normalizeReservationMailText_(
        reservation.customer_phone
      ),

    postal_code:
      normalizeReservationMailText_(
        reservation.postal_code
      ),

    prefecture:
      normalizeReservationMailText_(
        reservation.prefecture
      ),

    city:
      normalizeReservationMailText_(
        reservation.city
      ),

    address_detail:
      normalizeReservationMailText_(
        reservation.address_detail
      ),

    address:
      normalizeReservationMailText_(
        reservation.address ||
        [
          reservation.prefecture,
          reservation.city,
          reservation.address_detail
        ]
          .map(function(value) {
            return normalizeReservationMailText_(
              value
            );
          })
          .join("")
      ),

    member_no:
      normalizeReservationMailText_(
        reservation.member_no
      ),

    customer_type:
      normalizeReservationMailText_(
        reservation.customer_type
      ).toUpperCase(),

    customer_type_label:
      getReservationCustomerTypeLabel_(
        reservation.customer_type
      ),

    counseling_form_url:
      getCounselingSheetUrl_(),

    service_code:
      normalizeReservationMailText_(
        reservation.service_code ||
        service.service_code
      ),

    service_name:
      normalizeReservationMailText_(
        reservation.service_name ||
        service.service_name
      ),

    date:
      normalizeReservationMailDate_(
        reservation.date ||
        reservation.reservation_date
      ),

    start_time:
      normalizeReservationMailTime_(
        reservation.start_time
      ),

    end_time:
      normalizeReservationMailTime_(
        reservation.end_time
      ),

    staff_code:
      normalizeReservationMailText_(
        reservation.staff_code
      ),

    staff_name:
      normalizeReservationMailText_(
        reservation.staff_name
      ),

    provider_role:
      normalizeReservationMailText_(
        reservation.provider_role ||
        service.provider_role
      ).toUpperCase(),

    note:
      normalizeReservationMailText_(
        reservation.note
      ),

    /*
     * 予約変更・キャンセル・消化通知用
     */
    old_date:
      normalizeReservationMailDate_(
        reservation.old_date
      ),

    old_start_time:
      normalizeReservationMailTime_(
        reservation.old_start_time
      ),

    old_end_time:
      normalizeReservationMailTime_(
        reservation.old_end_time
      ),

    cancel_reason:
      normalizeReservationMailText_(
        reservation.cancel_reason
      ),

    cancel_deadline:
      normalizeReservationMailText_(
        reservation.cancel_deadline
      ),

    judged_at:
      normalizeReservationMailText_(
        reservation.judged_at
      ),

    restored_by:
      normalizeReservationMailText_(
        reservation.restored_by
      ),

    restore_reason:
      normalizeReservationMailText_(
        reservation.restore_reason
      ),

    manage_url:
      buildReservationManageUrl_(
        reservation.reservation_id
      ),

    admin_manage_url:
      buildAdminReservationManageUrl_(
        reservation.reservation_id
      ),

    display_name:
      normalizeReservationMailText_(
        mailAccount.display_name
      ),

    reply_to:
      normalizeReservationMailText_(
        mailAccount.reply_to ||
        mailAccount.email
      ),

    signature:
      normalizeReservationMailText_(
        mailAccount.signature
      )
  };
}


/**
 * {{key}}形式のプレースホルダー置換
 *
 * @param {*} template
 * @param {Object} values
 * @returns {string}
 */
function replaceReservationMailPlaceholders_(
  template,
  values
) {

  let result =
    String(
      template || ""
    );

  const serviceCode =
    String(
      values?.service_code || ""
    )
      .trim()
      .toUpperCase();

  const customerType =
    String(
      values?.customer_type || ""
    )
      .trim()
      .toUpperCase();

  /*
   * COUNSEL非会員では
   * 空の「会員番号：」行を表示しない。
   */
  if (
    serviceCode === "COUNSEL" &&
    customerType === "VISITOR"
  ) {
    result = result.replace(
      /^.*会員番号[：:].*\r?\n?/gm,
      ""
    );
  }

  Object.keys(
    values || {}
  ).forEach(function(key) {

    const token =
      "{{" + key + "}}";

    result =
      result.split(
        token
      ).join(
        String(
          values[key] ?? ""
        )
      );
  });

  return result;
}

/**
 * 任意シートからキー一致行を取得
 *
 * @param {string} sheetName
 * @param {string} keyName
 * @param {*} keyValue
 * @returns {Object|null}
 */
function findReservationMailRow_(
  sheetName,
  keyName,
  keyValue
) {

  const normalizedKeyValue =
    normalizeReservationMailText_(
      keyValue
    ).toUpperCase();

  return getReservationMailRows_(
    sheetName
  ).find(function(row) {

    return (
      normalizeReservationMailText_(
        row[keyName]
      ).toUpperCase() ===
      normalizedKeyValue
    );
  }) || null;
}


/**
 * シートをオブジェクト配列へ変換
 *
 * @param {string} sheetName
 * @returns {Array<Object>}
 */
function getReservationMailRows_(
  sheetName
) {

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    spreadsheet.getSheetByName(
      sheetName
    );

  if (!sheet) {
    throw new Error(
      "シートが見つかりません: " +
      sheetName
    );
  }

  const values =
    sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers =
    values[0].map(function(header) {

      return String(
        header || ""
      ).trim();
    });

  return values
    .slice(1)
    .map(function(row) {

      const record = {};

      headers.forEach(function(
        header,
        index
      ) {

        if (header) {
          record[header] =
            row[index];
        }
      });

      return record;
    });
}


/**
 * mail_logsへ記録
 *
 * 推奨ヘッダー:
 * created_at
 * reservation_id
 * service_code
 * event_type
 * mail_type
 * to
 * cc
 * bcc
 * subject
 * status
 * error
 *
 * @param {Object} values
 */
function appendReservationMailLog_(
  values
) {

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  let sheet =
    spreadsheet.getSheetByName(
      "mail_logs"
    );

  const defaultHeaders = [
    "created_at",
    "reservation_id",
    "service_code",
    "event_type",
    "mail_type",
    "to",
    "cc",
    "bcc",
    "subject",
    "status",
    "error"
  ];

  if (!sheet) {

    sheet =
      spreadsheet.insertSheet(
        "mail_logs"
      );

    sheet.appendRow(
      defaultHeaders
    );
  }

  if (
    sheet.getLastRow() === 0 ||
    sheet.getLastColumn() === 0
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        defaultHeaders.length
      )
      .setValues([
        defaultHeaders
      ]);
  }

  const lastColumn =
    sheet.getLastColumn();

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

  const record = {
    created_at:
      new Date(),

    reservation_id:
      values.reservation_id || "",

    service_code:
      values.service_code || "",

    event_type:
      values.event_type || "",

    mail_type:
      values.mail_type || "",

    to:
      values.to || "",

    cc:
      values.cc || "",

    bcc:
      values.bcc || "",

    subject:
      values.subject || "",

    status:
      values.status || "",

    error:
      values.error || ""
  };

  const row =
    headers.map(function(header) {

      if (
        Object.prototype.hasOwnProperty.call(
          record,
          header
        )
      ) {
        return record[header];
      }

      return "";
    });

  sheet.appendRow(
    row
  );
}


/**
 * 文字列正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationMailText_(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(
    value
  ).trim();
}


/**
 * boolean正規化
 *
 * @param {*} value
 * @returns {boolean}
 */
function normalizeReservationMailBoolean_(
  value
) {

  if (value === true) {
    return true;
  }

  const normalized =
    normalizeReservationMailText_(
      value
    ).toUpperCase();

  return (
    normalized === "TRUE" ||
    normalized === "1" ||
    normalized === "YES" ||
    normalized === "ON"
  );
}


/**
 * 日付正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationMailDate_(
  value
) {

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }

  return normalizeReservationMailText_(
    value
  );
}


/**
 * 時刻正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationMailTime_(
  value
) {

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "HH:mm"
    );
  }

  return normalizeReservationMailText_(
    value
  );
}



/**
 * 予約変更・キャンセル・消化通知テンプレートを
 * mail_templatesへ登録／更新する。
 *
 * 実行:
 * setupReservationLifecycleMailTemplates()
 */
function setupReservationLifecycleMailTemplates() {

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    spreadsheet.getSheetByName(
      "mail_templates"
    );

  if (!sheet) {
    throw new Error(
      "mail_templatesシートが見つかりません。"
    );
  }

  const lastColumn =
    sheet.getLastColumn();

  if (lastColumn <= 0) {
    throw new Error(
      "mail_templatesシートにヘッダーがありません。"
    );
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

  const requiredHeaders = [
    "template_code",
    "service_code",
    "event_type",
    "mail_type",
    "subject",
    "body",
    "active"
  ];

  const missingHeaders =
    requiredHeaders.filter(
      function(header) {
        return !headers.includes(
          header
        );
      }
    );

  if (missingHeaders.length > 0) {
    throw new Error(
      "mail_templatesシートに必要な列がありません: " +
      missingHeaders.join(", ")
    );
  }

  const templates = [

    {
      template_code:
        "PERSONAL_UPDATED_CUSTOMER",

      service_code:
        "PERSONAL",

      event_type:
        "RESERVATION_UPDATED",

      mail_type:
        "CUSTOMER",

      subject:
        "【The Forest Gym】ご予約変更のお知らせ",

      body:
        "{{customer_name}} 様\n\n" +
        "The Forest Gymをご利用いただきありがとうございます。\n" +
        "ご予約内容が変更されました。\n\n" +
        "【変更前】\n" +
        "{{old_date}} {{old_start_time}}～{{old_end_time}}\n\n" +
        "【変更後】\n" +
        "{{date}} {{start_time}}～{{end_time}}\n\n" +
        "サービス：{{service_name}}\n" +
        "担当：{{staff_name}}\n\n" +
        "ご不明な点がございましたら、お問い合わせください。\n\n" +
        "{{signature}}",

      active:
        true
    },

    {
      template_code:
        "PERSONAL_UPDATED_ADMIN",

      service_code:
        "PERSONAL",

      event_type:
        "RESERVATION_UPDATED",

      mail_type:
        "ADMIN",

      subject:
        "【予約変更】{{customer_name}} 様 / {{service_name}}",

      body:
        "予約内容が変更されました。\n\n" +
        "会員番号：{{member_no}}\n" +
        "氏名：{{customer_name}}\n" +
        "サービス：{{service_name}}\n\n" +
        "【変更前】\n" +
        "{{old_date}} {{old_start_time}}～{{old_end_time}}\n\n" +
        "【変更後】\n" +
        "{{date}} {{start_time}}～{{end_time}}\n\n" +
        "担当：{{staff_name}}\n" +
        "予約ID：{{reservation_id}}",

      active:
        true
    },

    {
      template_code:
        "PERSONAL_CANCELLED_CUSTOMER",

      service_code:
        "PERSONAL",

      event_type:
        "RESERVATION_CANCELLED",

      mail_type:
        "CUSTOMER",

      subject:
        "【The Forest Gym】ご予約キャンセルのお知らせ",

      body:
        "{{customer_name}} 様\n\n" +
        "The Forest Gymをご利用いただきありがとうございます。\n" +
        "以下のご予約をキャンセルしました。\n\n" +
        "日時：{{date}} {{start_time}}～{{end_time}}\n" +
        "サービス：{{service_name}}\n" +
        "担当：{{staff_name}}\n" +
        "キャンセル理由：{{cancel_reason}}\n\n" +
        "{{signature}}",

      active:
        true
    },

    {
      template_code:
        "PERSONAL_CANCELLED_ADMIN",

      service_code:
        "PERSONAL",

      event_type:
        "RESERVATION_CANCELLED",

      mail_type:
        "ADMIN",

      subject:
        "【予約キャンセル】{{customer_name}} 様 / {{service_name}}",

      body:
        "予約がキャンセルされました。\n\n" +
        "会員番号：{{member_no}}\n" +
        "氏名：{{customer_name}}\n" +
        "日時：{{date}} {{start_time}}～{{end_time}}\n" +
        "サービス：{{service_name}}\n" +
        "担当：{{staff_name}}\n" +
        "キャンセル理由：{{cancel_reason}}\n" +
        "予約ID：{{reservation_id}}",

      active:
        true
    },

    {
      template_code:
        "PERSONAL_CONSUMED_CUSTOMER",

      service_code:
        "PERSONAL",

      event_type:
        "RESERVATION_CONSUMED",

      mail_type:
        "CUSTOMER",

      subject:
        "【The Forest Gym】パーソナルトレーニング予約の消化扱いについて",

      body:
        "{{customer_name}} 様\n\n" +
        "The Forest Gymをご利用いただきありがとうございます。\n\n" +
        "以下のご予約はキャンセル受付期限を過ぎているため、" +
        "1回分を消化扱いとさせていただきました。\n\n" +
        "日時：{{date}} {{start_time}}～{{end_time}}\n" +
        "サービス：{{service_name}}\n" +
        "担当：{{staff_name}}\n" +
        "キャンセル受付期限：{{cancel_deadline}}\n\n" +
        "ご不明な点がございましたら、お問い合わせください。\n\n" +
        "{{signature}}",

      active:
        true
    },

    {
      template_code:
        "PERSONAL_CONSUMED_ADMIN",

      service_code:
        "PERSONAL",

      event_type:
        "RESERVATION_CONSUMED",

      mail_type:
        "ADMIN",

      subject:
        "【PT消化扱い】{{customer_name}} 様 / {{service_name}}",

      body:
        "キャンセル期限超過により消化扱いとなりました。\n\n" +
        "会員番号：{{member_no}}\n" +
        "氏名：{{customer_name}}\n" +
        "日時：{{date}} {{start_time}}～{{end_time}}\n" +
        "サービス：{{service_name}}\n" +
        "担当：{{staff_name}}\n" +
        "キャンセル理由：{{cancel_reason}}\n" +
        "キャンセル受付期限：{{cancel_deadline}}\n" +
        "判定時刻：{{judged_at}}\n" +
        "予約ID：{{reservation_id}}",

      active:
        true
    },

    {
      template_code:
        "PERSONAL_RESTORED_CUSTOMER",

      service_code:
        "PERSONAL",

      event_type:
        "RESERVATION_RESTORED",

      mail_type:
        "CUSTOMER",

      subject:
        "【The Forest Gym】パーソナルトレーニング予約復旧のお知らせ",

      body:
        "{{customer_name}} 様\n\n" +
        "The Forest Gymをご利用いただきありがとうございます。\n\n" +
        "先ほど消化扱いとなった以下のご予約を、受講予定へ戻しました。\n\n" +
        "日時：{{date}} {{start_time}}～{{end_time}}\n" +
        "サービス：{{service_name}}\n" +
        "担当：{{staff_name}}\n\n" +
        "当日はご予約日時にお越しください。\n\n" +
        "{{signature}}",

      active:
        true
    },

    {
      template_code:
        "PERSONAL_RESTORED_ADMIN",

      service_code:
        "PERSONAL",

      event_type:
        "RESERVATION_RESTORED",

      mail_type:
        "ADMIN",

      subject:
        "【PT予約復旧】{{customer_name}} 様 / {{service_name}}",

      body:
        "消化扱いの予約を受講予定へ戻しました。\n\n" +
        "会員番号：{{member_no}}\n" +
        "氏名：{{customer_name}}\n" +
        "日時：{{date}} {{start_time}}～{{end_time}}\n" +
        "サービス：{{service_name}}\n" +
        "担当：{{staff_name}}\n" +
        "復旧理由：{{restore_reason}}\n" +
        "復旧者：{{restored_by}}\n" +
        "予約ID：{{reservation_id}}",

      active:
        true
    }
  ];

  const templateCodeIndex =
    headers.indexOf(
      "template_code"
    );

  const existingValues =
    sheet
      .getDataRange()
      .getValues();

  const rowByTemplateCode =
    new Map();

  for (
    let i = 1;
    i < existingValues.length;
    i++
  ) {

    const code =
      normalizeReservationMailText_(
        existingValues[i][
          templateCodeIndex
        ]
      ).toUpperCase();

    if (code) {
      rowByTemplateCode.set(
        code,
        i + 1
      );
    }
  }

  let createdCount = 0;
  let updatedCount = 0;

  templates.forEach(
    function(template) {

      const code =
        normalizeReservationMailText_(
          template.template_code
        ).toUpperCase();

      const row =
        headers.map(
          function(header) {

            if (
              Object.prototype
                .hasOwnProperty.call(
                  template,
                  header
                )
            ) {
              return template[header];
            }

            return "";
          }
        );

      if (
        rowByTemplateCode.has(
          code
        )
      ) {

        sheet
          .getRange(
            rowByTemplateCode.get(
              code
            ),
            1,
            1,
            headers.length
          )
          .setValues([
            row
          ]);

        updatedCount++;

      } else {

        sheet.appendRow(
          row
        );

        createdCount++;
      }
    }
  );

  Logger.log(
    JSON.stringify({
      ok:
        true,

      created_count:
        createdCount,

      updated_count:
        updatedCount,

      template_count:
        templates.length
    })
  );

  Logger.log(
    "予約ライフサイクルメールテンプレート登録完了"
  );
}


/**
 * 予約変更・キャンセル・消化通知テンプレート確認
 *
 * 実メールは送信しない。
 */
function testReservationLifecycleMailTemplates() {

  const serviceCode =
    "PT60";

  const eventTypes = [
    "RESERVATION_UPDATED",
    "RESERVATION_CANCELLED",
    "RESERVATION_CONSUMED",
    "RESERVATION_RESTORED"
  ];

  const mailTypes = [
    "CUSTOMER",
    "ADMIN"
  ];

  const results = [];

  eventTypes.forEach(
    function(eventType) {

      mailTypes.forEach(
        function(mailType) {

          const template =
            findReservationMailTemplate_(
              serviceCode,
              eventType,
              mailType
            );

          results.push({
            event_type:
              eventType,

            mail_type:
              mailType,

            found:
              !!template,

            template_code:
              template
                ? template.template_code
                : ""
          });
        }
      );
    }
  );

  const missing =
    results.filter(
      function(result) {
        return !result.found;
      }
    );

  Logger.log(
    JSON.stringify(
      results
    )
  );

  if (missing.length > 0) {
    throw new Error(
      "不足しているメールテンプレートがあります: " +
      JSON.stringify(
        missing
      )
    );
  }

  Logger.log(
    "予約変更・キャンセル・消化テンプレート確認成功"
  );
}


/**
 * メール基盤テスト
 *
 * 実メールは送信しない。
 * PT_ENTRY60からPERSONAL共通テンプレートを取得できるか確認。
 */
function testReservationMailFoundation() {

  const serviceCode =
    "PT_ENTRY60";

  const service =
    findReservationMailRow_(
      "services",
      "service_code",
      serviceCode
    );

  if (!service) {
    throw new Error(
      serviceCode +
      "がservicesにありません。"
    );
  }

  const mailAccount =
    findReservationMailRow_(
      "mail_accounts",
      "mail_account_code",
      service.mail_account_code
    );

  if (!mailAccount) {
    throw new Error(
      "対応するmail_accounts設定がありません。"
    );
  }

  const customerTemplate =
    findReservationMailTemplate_(
      serviceCode,
      "RESERVATION_CREATED",
      "CUSTOMER"
    );

  if (!customerTemplate) {
    throw new Error(
      "CUSTOMERテンプレートがありません。"
    );
  }

  const adminTemplate =
    findReservationMailTemplate_(
      serviceCode,
      "RESERVATION_CREATED",
      "ADMIN"
    );

  if (!adminTemplate) {
    throw new Error(
      "ADMINテンプレートがありません。"
    );
  }

  const sample = {
    reservation_id:
      "RSV_TEST_MAIL001",

    customer_name:
      "森林筋太",

    customer_email:
      "ichi6kawakami@gmail.com",

    customer_phone:
      "09012345678",

    member_no:
      "108035",

    service_code:
      serviceCode,

    service_name:
      "エントリープラン",

    reservation_date:
      "2026-08-10",

    start_time:
      "10:00",

    end_time:
      "11:00",

    staff_code:
      "YOSHIMARU",

    staff_name:
      "吉丸りな",

    note:
      "カテゴリ共通テンプレートテスト"
  };

  const values =
    buildReservationMailValues_(
      sample,
      service,
      mailAccount
    );

  Logger.log(
    JSON.stringify({
      service_code:
        service.service_code,

      category:
        service.category,

      mail_account_code:
        service.mail_account_code,

      reply_to:
        mailAccount.reply_to,

      admin_to:
        mailAccount.admin_to,

      customer_template_code:
        customerTemplate.template_code,

      admin_template_code:
        adminTemplate.template_code,

      customer_subject:
        replaceReservationMailPlaceholders_(
          customerTemplate.subject,
          values
        ),

      admin_subject:
        replaceReservationMailPlaceholders_(
          adminTemplate.subject,
          values
        )
    })
  );

  Logger.log(
    "予約メール基盤テスト成功"
  );
}


/**
 * 予約管理ボタンHTML生成テスト
 *
 * メール送信は行わない。
 */
function testReservationManageMailButtonHtml() {

  const reservationId =
    "RSV20260814160434460230681";

  const manageUrl =
    buildReservationManageUrl_(
      reservationId
    );

  const html =
    buildReservationCustomerHtmlBody_(
      "森林筋太 様\n\n" +
      "The Forest Gymをご利用いただきありがとうございます。\n\n" +
      "日時：2026-08-15 16:00～17:00\n" +
      "サービス：パーソナルトレーニング60分\n" +
      "担当：吉丸",
      "RESERVATION_CREATED",
      manageUrl
    );

  const escapedManageUrl =
    escapeReservationMailHtmlAttribute_(
      manageUrl
    );

  const buttonFound =
    html.indexOf(
      "予約内容の確認・変更・キャンセル"
    ) >= 0;

  const linkFound =
    html.indexOf(
      escapedManageUrl
    ) >= 0;

  const ok =
    !!manageUrl &&
    buttonFound &&
    linkFound;

  Logger.log(
    JSON.stringify({
      ok:
        ok,

      reservation_id:
        reservationId,

      manage_url_created:
        !!manageUrl,

      button_found:
        buttonFound,

      link_found:
        linkFound
    })
  );

  if (!ok) {
    throw new Error(
      "予約管理ボタンHTML生成テストに失敗しました。"
    );
  }

  Logger.log(
    "★★★★★ 予約管理ボタンHTML生成テスト成功 ★★★★★"
  );
}
/**
 * ============================================================
 * v51
 * CUSTOMER向けメールだけ「担当：...」行を削除
 * ADMIN向けは担当表示を維持
 * ============================================================
 */
function removeReservationCustomerStaffLine_(
  body
) {

  return String(
    body || ""
  ).replace(
    /^.*担当[：:].*\r?\n?/gm,
    ""
  );
}


/**
 * COUNSEL 会員区分表示
 */
function getReservationCustomerTypeLabel_(
  customerType
) {

  const type =
    normalizeReservationMailText_(
      customerType
    ).toUpperCase();

  if (type === "MEMBER") {
    return "会員";
  }

  if (type === "VISITOR") {
    return "非会員";
  }

  return "";
}


/**
 * COUNSEL カウンセリングシートURL
 *
 * Script Properties:
 *   COUNSELING_SHEET_URL
 *
 * URL変更時はScript Propertiesの値だけ変更すればよい。
 */
function getCounselingSheetUrl_() {

  return String(
    PropertiesService
      .getScriptProperties()
      .getProperty(
        "COUNSELING_SHEET_URL"
      ) ||
    "https://www.theforestgym.com/counseling"
  ).trim();
}


/**
 * COUNSEL新規予約時の
 * カウンセリングシート入力依頼メール安全送信
 */
function sendCounselingSheetRequestMailSafely_(
  reservation,
  source
) {

  return {
    ok: true,
    skipped: true,
    reason: "REPLACED_BY_SECURE_DIET_COUNSELING_FORM"
  };
}


/**
 * COUNSELカウンセリングシート入力依頼メール送信
 *
 * event_type:
 *   COUNSEL_SHEET_REQUEST
 *
 * mail_type:
 *   CUSTOMER
 */
function sendCounselingSheetRequestMail_(
  reservation
) {

  reservation =
    reservation || {};

  const serviceCode =
    normalizeReservationMailText_(
      reservation.service_code
    ).toUpperCase();

  if (serviceCode !== "COUNSEL") {
    return {
      ok: true,
      skipped: true,
      reason: "NOT_COUNSEL"
    };
  }

  const customerEmail =
    normalizeReservationMailText_(
      reservation.customer_email
    );

  if (!customerEmail) {
    throw new Error(
      "カウンセリングシート案内メール送信にcustomer_emailが必要です。"
    );
  }

  const service =
    findReservationMailRow_(
      "services",
      "service_code",
      serviceCode
    );

  if (!service) {
    throw new Error(
      "メール送信対象サービスが見つかりません: " +
      serviceCode
    );
  }

  const mailAccountCode =
    normalizeReservationMailText_(
      service.mail_account_code ||
      reservation.mail_account_code
    );

  if (!mailAccountCode) {
    throw new Error(
      "サービスにmail_account_codeが設定されていません: " +
      serviceCode
    );
  }

  const mailAccount =
    findReservationMailRow_(
      "mail_accounts",
      "mail_account_code",
      mailAccountCode
    );

  if (!mailAccount) {
    throw new Error(
      "mail_accountsに設定がありません: " +
      mailAccountCode
    );
  }

  const template =
    findReservationMailTemplate_(
      serviceCode,
      "COUNSEL_SHEET_REQUEST",
      "CUSTOMER"
    );

  if (!template) {
    throw new Error(
      "COUNSEL_SHEET_REQUESTのメールテンプレートが見つかりません。"
    );
  }

  const values =
    buildReservationMailValues_(
      reservation,
      service,
      mailAccount
    );

  const subject =
    replaceReservationMailPlaceholders_(
      template.subject,
      values
    );

  const body =
    replaceReservationMailPlaceholders_(
      removeReservationCustomerStaffLine_(
        template.body
      ),
      values
    );

  /*
   * URLをHTMLメールでも確実にタップ可能にする。
   */
  const escapedBody =
    escapeReservationMailHtml_(
      body
    );

  const escapedUrl =
    escapeReservationMailHtmlAttribute_(
      values.counseling_form_url
    );

  const linkedBody =
    escapedUrl
      ? escapedBody.replace(
          escapeReservationMailHtml_(
            values.counseling_form_url
          ),
          '<a href="' +
            escapedUrl +
            '" target="_blank" rel="noopener">' +
            escapeReservationMailHtml_(
              values.counseling_form_url
            ) +
          '</a>'
        )
      : escapedBody;

  const htmlBody =
    '<div style="' +
      'font-family:-apple-system,BlinkMacSystemFont,' +
      '"Segoe UI","Noto Sans JP",Arial,sans-serif;' +
      'font-size:15px;' +
      'line-height:1.8;' +
      'color:#202424;' +
    '">' +
      linkedBody.replace(
        /\r?\n/g,
        "<br>"
      ) +
    '</div>';

  return sendReservationMailMessage_({
    reservation_id:
      values.reservation_id,

    service_code:
      values.service_code,

    event_type:
      "COUNSEL_SHEET_REQUEST",

    mail_type:
      "CUSTOMER",

    to:
      customerEmail,

    cc:
      "",

    bcc:
      normalizeReservationMailText_(
        mailAccount.customer_bcc
      ),

    reply_to:
      normalizeReservationMailText_(
        mailAccount.reply_to ||
        mailAccount.email
      ),

    display_name:
      normalizeReservationMailText_(
        mailAccount.display_name
      ),

    subject:
      subject,

    body:
      body,

    html_body:
      htmlBody
  });
}
