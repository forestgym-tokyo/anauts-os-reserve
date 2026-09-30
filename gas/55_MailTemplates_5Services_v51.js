/**
 * ============================================================
 * A-nauts OS Reserve
 * 51_MailTemplates_5Services_v51.gs
 * ============================================================
 *
 * v51:
 * - 既存5サービス30テンプレートを確定文面へ更新
 * - CUSTOMER向け本文から担当者表示を削除
 * - 変更文言を「～が変更されました。」へ統一
 * - キャンセル文言を「～がキャンセルされました。」へ統一
 * - 退会予約完了に「退会手続きはご来店時に完了します。」を追加
 * - COUNSEL予約完了にカウンセリングシート別送案内を追加
 * - COUNSEL ADMINに会員区分を追加
 * - COUNSELカウンセリングシート入力依頼テンプレートを1件追加
 *
 * TOURテンプレートは一切変更しない。
 *
 * GASエディタから1回だけ実行:
 *   setupFiveServiceMailTemplates_v51()
 */

function setupFiveServiceMailTemplates_v51() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("mail_templates");

  if (!sheet) {
    throw new Error("mail_templatesシートが見つかりません。");
  }

  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error("mail_templatesシートにヘッダーがありません。");
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
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

  const missing = required.filter(function(h) {
    return !headers.includes(h);
  });

  if (missing.length) {
    throw new Error(
      "mail_templatesに必要な列がありません: " +
      missing.join(", ")
    );
  }

  function lines_() {
    return Array.prototype.slice.call(arguments).join("\n");
  }

  const templates = [

    // ========================================================
    // TRAINING_SUPPORT45
    // ========================================================
    {
      template_code: "TRAINING_SUPPORT45_CREATED_CUSTOMER",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】トレーニングサポートのご予約を承りました",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "トレーニングサポートのご予約を承りました。",
        "",
        "【ご予約内容】",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "内容：トレーニングサポート",
        "",
        "当日はご予約時間にお越しください。",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_CREATED_ADMIN",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】トレーニングサポート｜{{customer_name}} 様",
      body: lines_(
        "トレーニングサポートの新規予約が入りました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "ご質問・ご要望：{{note}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_UPDATED_CUSTOMER",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】トレーニングサポート予約変更のお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "トレーニングサポートのご予約日時が変更されました。",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_UPDATED_ADMIN",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】トレーニングサポート｜{{customer_name}} 様",
      body: lines_(
        "トレーニングサポートの予約日時が変更されました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_CANCELLED_CUSTOMER",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】トレーニングサポート予約キャンセルのお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "以下のトレーニングサポートのご予約がキャンセルされました。",
        "",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "TRAINING_SUPPORT45_CANCELLED_ADMIN",
      service_code: "TRAINING_SUPPORT45",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】トレーニングサポート｜{{customer_name}} 様",
      body: lines_(
        "トレーニングサポートの予約がキャンセルされました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },

    // ========================================================
    // COUNSEL
    // ========================================================
    {
      template_code: "COUNSEL_CREATED_CUSTOMER",
      service_code: "COUNSEL",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ダイエット無料カウンセリングのご予約を承りました",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "ダイエット無料カウンセリングのご予約を承りました。",
        "",
        "【ご予約内容】",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "内容：ダイエット無料カウンセリング",
        "",
        "当日のカウンセリングにあたり、カウンセリングシートの入力フォームを別途メールにてお送りします。",
        "お手数ですが、カウンセリング前日までにご入力・送信をお願いいたします。",
        "",
        "当日はご予約時間にお越しください。",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "COUNSEL_CREATED_ADMIN",
      service_code: "COUNSEL",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】ダイエット無料カウンセリング｜{{customer_name}} 様",
      body: lines_(
        "ダイエット無料カウンセリングの新規予約が入りました。",
        "",
        "氏名：{{customer_name}}",
        "会員区分：{{customer_type_label}}",
        "会員番号：{{member_no}}",
        "郵便番号：{{postal_code}}",
        "住所：{{address}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "ご質問・ご要望：{{note}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "COUNSEL_UPDATED_CUSTOMER",
      service_code: "COUNSEL",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ダイエット無料カウンセリング予約変更のお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "ダイエット無料カウンセリングのご予約日時が変更されました。",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "COUNSEL_UPDATED_ADMIN",
      service_code: "COUNSEL",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】ダイエット無料カウンセリング｜{{customer_name}} 様",
      body: lines_(
        "ダイエット無料カウンセリングの予約日時が変更されました。",
        "",
        "氏名：{{customer_name}}",
        "会員区分：{{customer_type_label}}",
        "会員番号：{{member_no}}",
        "郵便番号：{{postal_code}}",
        "住所：{{address}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "COUNSEL_CANCELLED_CUSTOMER",
      service_code: "COUNSEL",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ダイエット無料カウンセリング予約キャンセルのお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "以下のダイエット無料カウンセリングのご予約がキャンセルされました。",
        "",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "COUNSEL_CANCELLED_ADMIN",
      service_code: "COUNSEL",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】ダイエット無料カウンセリング｜{{customer_name}} 様",
      body: lines_(
        "ダイエット無料カウンセリングの予約がキャンセルされました。",
        "",
        "氏名：{{customer_name}}",
        "会員区分：{{customer_type_label}}",
        "会員番号：{{member_no}}",
        "郵便番号：{{postal_code}}",
        "住所：{{address}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "COUNSEL_SHEET_REQUEST_CUSTOMER",
      service_code: "COUNSEL",
      event_type: "COUNSEL_SHEET_REQUEST",
      mail_type: "CUSTOMER",
      subject: "カウンセリングシートのご送付／The Forest Gym",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "この度は、ダイエット無料カウンセリングにお申し込みいただき、誠にありがとうございます。",
        "",
        "当日のカウンセリングをよりスムーズに進めるため、事前にカウンセリングシートへのご入力をお願いしております。",
        "",
        "下記URLよりカウンセリングシートをご入力いただき、カウンセリング前日までに「送信」ボタンを押してご提出ください。",
        "",
        "カウンセリングシート",
        "{{counseling_form_url}}",
        "",
        "【ご記入時のお願い】",
        "",
        "「お食事内容」の欄は、特定の1日分で構いませんので、できる限り具体的な内容をご記載ください。",
        "",
        "良い例：",
        "ごはん、みそ汁、サラダ、から揚げ、湯豆腐、マグロ刺身、焼き鮭 など",
        "",
        "避けていただきたい例：",
        "コンビニ弁当、定食、丼物、麺類、自炊 など",
        "",
        "ご不明な点がございましたら、どうぞお気軽にお問い合わせください。",
        "",
        "{{signature}}"
      ),
      active: true
    },

    // ========================================================
    // UNSUBSCRIBE
    // ========================================================
    {
      template_code: "UNSUBSCRIBE_CREATED_CUSTOMER",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】退会手続きのご予約を承りました",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "退会手続きのご予約を承りました。",
        "",
        "【ご予約内容】",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "内容：退会手続き",
        "",
        "退会手続きはご来店時に完了します。",
        "",
        "当日はご予約時間にお越しください。",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_CREATED_ADMIN",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】退会手続き｜{{customer_name}} 様",
      body: lines_(
        "退会手続きの新規予約が入りました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "ご質問・ご要望：{{note}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_UPDATED_CUSTOMER",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】退会手続き予約変更のお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "退会手続きのご予約日時が変更されました。",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_UPDATED_ADMIN",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】退会手続き｜{{customer_name}} 様",
      body: lines_(
        "退会手続きの予約日時が変更されました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_CANCELLED_CUSTOMER",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】退会手続き予約キャンセルのお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "以下の退会手続きのご予約がキャンセルされました。",
        "",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "UNSUBSCRIBE_CANCELLED_ADMIN",
      service_code: "UNSUBSCRIBE",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】退会手続き｜{{customer_name}} 様",
      body: lines_(
        "退会手続きの予約がキャンセルされました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },

    // ========================================================
    // PROCEDURE
    // ========================================================
    {
      template_code: "PROCEDURE_CREATED_CUSTOMER",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】諸手続きのご予約を承りました",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "諸手続きのご予約を承りました。",
        "",
        "【ご予約内容】",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "内容：諸手続き",
        "",
        "当日はご予約時間にお越しください。",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "PROCEDURE_CREATED_ADMIN",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】諸手続き｜{{customer_name}} 様",
      body: lines_(
        "諸手続きの新規予約が入りました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "ご質問・ご要望：{{note}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "PROCEDURE_UPDATED_CUSTOMER",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】諸手続き予約変更のお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "諸手続きのご予約日時が変更されました。",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "PROCEDURE_UPDATED_ADMIN",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】諸手続き｜{{customer_name}} 様",
      body: lines_(
        "諸手続きの予約日時が変更されました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "PROCEDURE_CANCELLED_CUSTOMER",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】諸手続き予約キャンセルのお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "以下の諸手続きのご予約がキャンセルされました。",
        "",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "PROCEDURE_CANCELLED_ADMIN",
      service_code: "PROCEDURE",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】諸手続き｜{{customer_name}} 様",
      body: lines_(
        "諸手続きの予約がキャンセルされました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },

    // ========================================================
    // MEAL_PLANNING
    // ========================================================
    {
      template_code: "MEAL_PLANNING_CREATED_CUSTOMER",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_CREATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ミールフィットのご予約を承りました",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "ミールフィットのご予約を承りました。",
        "",
        "【ご予約内容】",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "内容：ミールフィット",
        "",
        "当日はご予約時間にお越しください。",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "MEAL_PLANNING_CREATED_ADMIN",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_CREATED",
      mail_type: "ADMIN",
      subject: "【新規予約】ミールフィット｜{{customer_name}} 様",
      body: lines_(
        "ミールフィットの新規予約が入りました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "ご質問・ご要望：{{note}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "MEAL_PLANNING_UPDATED_CUSTOMER",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_UPDATED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ミールフィット予約変更のお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "ミールフィットのご予約日時が変更されました。",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "MEAL_PLANNING_UPDATED_ADMIN",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_UPDATED",
      mail_type: "ADMIN",
      subject: "【予約変更】ミールフィット｜{{customer_name}} 様",
      body: lines_(
        "ミールフィットの予約日時が変更されました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "",
        "【変更前】",
        "{{old_date}} {{old_start_time}}～{{old_end_time}}",
        "",
        "【変更後】",
        "{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    },
    {
      template_code: "MEAL_PLANNING_CANCELLED_CUSTOMER",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "CUSTOMER",
      subject: "【The Forest Gym】ミールフィット予約キャンセルのお知らせ",
      body: lines_(
        "{{customer_name}} 様",
        "",
        "以下のミールフィットのご予約がキャンセルされました。",
        "",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "",
        "{{signature}}"
      ),
      active: true
    },
    {
      template_code: "MEAL_PLANNING_CANCELLED_ADMIN",
      service_code: "MEAL_PLANNING",
      event_type: "RESERVATION_CANCELLED",
      mail_type: "ADMIN",
      subject: "【予約キャンセル】ミールフィット｜{{customer_name}} 様",
      body: lines_(
        "ミールフィットの予約がキャンセルされました。",
        "",
        "氏名：{{customer_name}}",
        "会員番号：{{member_no}}",
        "電話番号：{{customer_phone}}",
        "メールアドレス：{{customer_email}}",
        "日時：{{date}} {{start_time}}～{{end_time}}",
        "担当：{{staff_name}}",
        "予約ID：{{reservation_id}}"
      ),
      active: true
    }
  ];

  const all = sheet.getDataRange().getValues();
  const idx = {};

  headers.forEach(function(h, i) {
    idx[h] = i;
  });

  const rowByTemplateCode = new Map();
  const rowByTriple = new Map();

  for (let r = 1; r < all.length; r++) {

    const code =
      String(all[r][idx.template_code] || "")
        .trim()
        .toUpperCase();

    const serviceCode =
      String(all[r][idx.service_code] || "")
        .trim()
        .toUpperCase();

    const eventType =
      String(all[r][idx.event_type] || "")
        .trim()
        .toUpperCase();

    const mailType =
      String(all[r][idx.mail_type] || "")
        .trim()
        .toUpperCase();

    if (code) {
      rowByTemplateCode.set(code, r + 1);
    }

    if (serviceCode && eventType && mailType) {
      rowByTriple.set(
        serviceCode + "|" + eventType + "|" + mailType,
        r + 1
      );
    }
  }

  let created = 0;
  let updated = 0;

  templates.forEach(function(t) {

    const code = t.template_code.toUpperCase();
    const triple =
      t.service_code.toUpperCase() + "|" +
      t.event_type.toUpperCase() + "|" +
      t.mail_type.toUpperCase();

    const existingRow =
      rowByTemplateCode.get(code) ||
      rowByTriple.get(triple) ||
      0;

    if (existingRow) {

      Object.keys(t).forEach(function(key) {
        sheet
          .getRange(existingRow, idx[key] + 1)
          .setValue(t[key]);
      });

      updated++;

    } else {

      const newRow =
        new Array(headers.length).fill("");

      Object.keys(t).forEach(function(key) {
        newRow[idx[key]] = t[key];
      });

      sheet.appendRow(newRow);
      created++;
    }
  });

  /*
   * フォームURLは今後変更予定のためScript Propertiesで管理。
   * 既に設定済みなら上書きしない。
   */
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("COUNSELING_SHEET_URL")) {
    props.setProperty(
      "COUNSELING_SHEET_URL",
      "https://www.theforestgym.com/counseling"
    );
  }

  SpreadsheetApp.flush();

  const result = {
    ok: true,
    total: templates.length,
    created_count: created,
    updated_count: updated,
    counseling_sheet_url:
      props.getProperty("COUNSELING_SHEET_URL"),
    services: [
      "TRAINING_SUPPORT45",
      "COUNSEL",
      "UNSUBSCRIBE",
      "PROCEDURE",
      "MEAL_PLANNING"
    ]
  };

  Logger.log(JSON.stringify(result));
  return result;
}
