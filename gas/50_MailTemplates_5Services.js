/**
 * ============================================================
 * A-nauts OS Reserve
 * 50_MailTemplates_5Services_v50.gs
 * ============================================================
 *
 * 5サービス × 3イベント × CUSTOMER/ADMIN = 30テンプレート
 *
 * 対象:
 * - TRAINING_SUPPORT45 トレーニングサポート
 * - COUNSEL ダイエット無料カウンセリング
 * - UNSUBSCRIBE 退会手続き
 * - PROCEDURE 諸手続き
 * - MEAL_PLANNING ミールフィット
 *
 * GASエディタから1回だけ実行:
 * setupFiveServiceMailTemplates_v50()
 */

function setupFiveServiceMailTemplates_v50() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      "mail_templates"
    );

  if (!sheet) {
    throw new Error(
      "mail_templatesシートが見つかりません。"
    );
  }

  const lastColumn =
    sheet.getLastColumn();

  if (lastColumn < 1) {
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
      .map(function(v) {
        return String(v || "").trim();
      });

  const required = [
    "template_code",
    "service_code",
    "event_type",
    "mail_type",
    "subject",
    "body",
    "active"
  ];

  const missing =
    required.filter(function(h) {
      return !headers.includes(h);
    });

  if (missing.length) {
    throw new Error(
      "mail_templatesに必要な列がありません: " +
      missing.join(", ")
    );
  }

  const templates = [
    {
      template_code: "TRAINING_SUPPORT45_CREATED_CUSTOMER",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】トレーニングサポートのご予約を承りました",
      body: "{{customer_name}} 様\\n\\nトレーニングサポートのご予約を承りました。\\n\\n【ご予約内容】\\n日時：{{date}} {{start_time}}～{{end_time}}\\n内容：トレーニングサポート\\n担当：{{staff_name}}\\n\\n当日はご予約時間にお越しください。\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_CREATED_ADMIN",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】トレーニングサポート｜{{customer_name}} 様",
      body: "トレーニングサポートの新規予約が入りました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\nご質問・ご要望：{{note}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_UPDATED_CUSTOMER",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】トレーニングサポート予約変更のお知らせ",
      body: "{{customer_name}} 様\\n\\nトレーニングサポートのご予約日時を変更しました。\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_UPDATED_ADMIN",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】トレーニングサポート｜{{customer_name}} 様",
      body: "トレーニングサポートの予約日時が変更されました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_CANCELLED_CUSTOMER",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】トレーニングサポート予約キャンセルのお知らせ",
      body: "{{customer_name}} 様\\n\\n以下のトレーニングサポートのご予約をキャンセルしました。\\n\\n日時：{{date}} {{start_time}}～{{end_time}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_CANCELLED_ADMIN",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】トレーニングサポート｜{{customer_name}} 様",
      body: "トレーニングサポートの予約がキャンセルされました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "COUNSEL_CREATED_CUSTOMER",
      service_code: "COUNSEL",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ダイエット無料カウンセリングのご予約を承りました",
      body: "{{customer_name}} 様\\n\\nダイエット無料カウンセリングのご予約を承りました。\\n\\n【ご予約内容】\\n日時：{{date}} {{start_time}}～{{end_time}}\\n内容：ダイエット無料カウンセリング\\n担当：{{staff_name}}\\n\\n当日はご予約時間にお越しください。\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "COUNSEL_CREATED_ADMIN",
      service_code: "COUNSEL",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】ダイエット無料カウンセリング｜{{customer_name}} 様",
      body: "ダイエット無料カウンセリングの新規予約が入りました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n郵便番号：{{postal_code}}\\n住所：{{address}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\nご質問・ご要望：{{note}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "COUNSEL_UPDATED_CUSTOMER",
      service_code: "COUNSEL",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ダイエット無料カウンセリング予約変更のお知らせ",
      body: "{{customer_name}} 様\\n\\nダイエット無料カウンセリングのご予約日時を変更しました。\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "COUNSEL_UPDATED_ADMIN",
      service_code: "COUNSEL",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】ダイエット無料カウンセリング｜{{customer_name}} 様",
      body: "ダイエット無料カウンセリングの予約日時が変更されました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n郵便番号：{{postal_code}}\\n住所：{{address}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "COUNSEL_CANCELLED_CUSTOMER",
      service_code: "COUNSEL",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ダイエット無料カウンセリング予約キャンセルのお知らせ",
      body: "{{customer_name}} 様\\n\\n以下のダイエット無料カウンセリングのご予約をキャンセルしました。\\n\\n日時：{{date}} {{start_time}}～{{end_time}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "COUNSEL_CANCELLED_ADMIN",
      service_code: "COUNSEL",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】ダイエット無料カウンセリング｜{{customer_name}} 様",
      body: "ダイエット無料カウンセリングの予約がキャンセルされました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n郵便番号：{{postal_code}}\\n住所：{{address}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_CREATED_CUSTOMER",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】退会手続きのご予約を承りました",
      body: "{{customer_name}} 様\\n\\n退会手続きのご予約を承りました。\\n\\n【ご予約内容】\\n日時：{{date}} {{start_time}}～{{end_time}}\\n内容：退会手続き\\n担当：{{staff_name}}\\n\\n当日はご予約時間にお越しください。\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_CREATED_ADMIN",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】退会手続き｜{{customer_name}} 様",
      body: "退会手続きの新規予約が入りました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\nご質問・ご要望：{{note}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_UPDATED_CUSTOMER",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】退会手続き予約変更のお知らせ",
      body: "{{customer_name}} 様\\n\\n退会手続きのご予約日時を変更しました。\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_UPDATED_ADMIN",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】退会手続き｜{{customer_name}} 様",
      body: "退会手続きの予約日時が変更されました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_CANCELLED_CUSTOMER",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】退会手続き予約キャンセルのお知らせ",
      body: "{{customer_name}} 様\\n\\n以下の退会手続きのご予約をキャンセルしました。\\n\\n日時：{{date}} {{start_time}}～{{end_time}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_CANCELLED_ADMIN",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】退会手続き｜{{customer_name}} 様",
      body: "退会手続きの予約がキャンセルされました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "PROCEDURE_CREATED_CUSTOMER",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】諸手続きのご予約を承りました",
      body: "{{customer_name}} 様\\n\\n諸手続きのご予約を承りました。\\n\\n【ご予約内容】\\n日時：{{date}} {{start_time}}～{{end_time}}\\n内容：諸手続き\\n担当：{{staff_name}}\\n\\n当日はご予約時間にお越しください。\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "PROCEDURE_CREATED_ADMIN",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】諸手続き｜{{customer_name}} 様",
      body: "諸手続きの新規予約が入りました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\nご質問・ご要望：{{note}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "PROCEDURE_UPDATED_CUSTOMER",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】諸手続き予約変更のお知らせ",
      body: "{{customer_name}} 様\\n\\n諸手続きのご予約日時を変更しました。\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "PROCEDURE_UPDATED_ADMIN",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】諸手続き｜{{customer_name}} 様",
      body: "諸手続きの予約日時が変更されました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "PROCEDURE_CANCELLED_CUSTOMER",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】諸手続き予約キャンセルのお知らせ",
      body: "{{customer_name}} 様\\n\\n以下の諸手続きのご予約をキャンセルしました。\\n\\n日時：{{date}} {{start_time}}～{{end_time}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "PROCEDURE_CANCELLED_ADMIN",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】諸手続き｜{{customer_name}} 様",
      body: "諸手続きの予約がキャンセルされました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "MEAL_PLANNING_CREATED_CUSTOMER",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ミールフィットのご予約を承りました",
      body: "{{customer_name}} 様\\n\\nミールフィットのご予約を承りました。\\n\\n【ご予約内容】\\n日時：{{date}} {{start_time}}～{{end_time}}\\n内容：ミールフィット\\n担当：{{staff_name}}\\n\\n当日はご予約時間にお越しください。\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "MEAL_PLANNING_CREATED_ADMIN",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】ミールフィット｜{{customer_name}} 様",
      body: "ミールフィットの新規予約が入りました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\nご質問・ご要望：{{note}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "MEAL_PLANNING_UPDATED_CUSTOMER",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ミールフィット予約変更のお知らせ",
      body: "{{customer_name}} 様\\n\\nミールフィットのご予約日時を変更しました。\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "MEAL_PLANNING_UPDATED_ADMIN",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】ミールフィット｜{{customer_name}} 様",
      body: "ミールフィットの予約日時が変更されました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n\\n【変更前】\\n{{old_date}} {{old_start_time}}～{{old_end_time}}\\n\\n【変更後】\\n{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    },
    {
      template_code: "MEAL_PLANNING_CANCELLED_CUSTOMER",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ミールフィット予約キャンセルのお知らせ",
      body: "{{customer_name}} 様\\n\\n以下のミールフィットのご予約をキャンセルしました。\\n\\n日時：{{date}} {{start_time}}～{{end_time}}\\n\\n{{signature}}",
      active: true
    },
    {
      template_code: "MEAL_PLANNING_CANCELLED_ADMIN",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】ミールフィット｜{{customer_name}} 様",
      body: "ミールフィットの予約がキャンセルされました。\\n\\n氏名：{{customer_name}}\\n会員番号：{{member_no}}\\n電話番号：{{customer_phone}}\\nメールアドレス：{{customer_email}}\\n日時：{{date}} {{start_time}}～{{end_time}}\\n担当：{{staff_name}}\\n予約ID：{{reservation_id}}",
      active: true
    }
  ];

  const all =
    sheet.getDataRange().getValues();

  const idx = {};

  headers.forEach(function(h, i) {
    idx[h] = i;
  });

  /*
   * 既存行は
   * template_code または
   * service_code + event_type + mail_type
   * のどちらかで見つける。
   */
  const rowByTemplateCode =
    new Map();

  const rowByTriple =
    new Map();

  for (
    let r = 1;
    r < all.length;
    r++
  ) {

    const code =
      String(
        all[r][idx.template_code] || ""
      )
      .trim()
      .toUpperCase();

    const serviceCode =
      String(
        all[r][idx.service_code] || ""
      )
      .trim()
      .toUpperCase();

    const eventType =
      String(
        all[r][idx.event_type] || ""
      )
      .trim()
      .toUpperCase();

    const mailType =
      String(
        all[r][idx.mail_type] || ""
      )
      .trim()
      .toUpperCase();

    if (code) {
      rowByTemplateCode.set(
        code,
        r + 1
      );
    }

    if (
      serviceCode &&
      eventType &&
      mailType
    ) {
      rowByTriple.set(
        serviceCode +
        "|" +
        eventType +
        "|" +
        mailType,
        r + 1
      );
    }
  }

  let created = 0;
  let updated = 0;

  templates.forEach(function(t) {

    const code =
      t.template_code.toUpperCase();

    const triple =
      t.service_code.toUpperCase() +
      "|" +
      t.event_type.toUpperCase() +
      "|" +
      t.mail_type.toUpperCase();

    const existingRow =
      rowByTemplateCode.get(code) ||
      rowByTriple.get(triple) ||
      0;

    if (existingRow) {

      /*
       * 既存行の他列は壊さず、
       * 必要な7項目だけ更新する。
       */
      Object.keys(t).forEach(
        function(key) {
          sheet
            .getRange(
              existingRow,
              idx[key] + 1
            )
            .setValue(
              t[key]
            );
        }
      );

      updated++;

    } else {

      const newRow =
        new Array(
          headers.length
        ).fill("");

      Object.keys(t).forEach(
        function(key) {
          newRow[
            idx[key]
          ] = t[key];
        }
      );

      sheet.appendRow(
        newRow
      );

      created++;
    }
  });

  SpreadsheetApp.flush();

  const result = {
    ok: true,
    total: templates.length,
    created_count: created,
    updated_count: updated,
    services: [
      "TRAINING_SUPPORT45",
      "COUNSEL",
      "UNSUBSCRIBE",
      "PROCEDURE",
      "MEAL_PLANNING"
    ]
  };

  Logger.log(
    JSON.stringify(result)
  );

  return result;
}
