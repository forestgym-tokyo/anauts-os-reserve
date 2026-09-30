/**
 * サービス一覧取得
 */
function getServices() {

  const services = getSheetData(
    APP_CONFIG.SHEETS.SERVICES
  );

  const result = services.filter(
    service => service.active === true
  );

  return successResponse(result);
}


/**
 * サービス登録・更新
 *
 * service_code が既に存在する場合：UPDATE
 * 存在しない場合：CREATE
 */
function saveService(data) {

  try {

    data = data || {};

    const serviceCode =
      String(
        data.service_code || ""
      )
        .trim()
        .toUpperCase();

    if (!serviceCode) {
      return errorResponse(
        "サービスコードを入力してください。",
        "SERVICE_CODE_REQUIRED"
      );
    }

    const serviceName =
      String(
        data.service_name || ""
      ).trim();

    if (!serviceName) {
      return errorResponse(
        "サービス名を入力してください。",
        "SERVICE_NAME_REQUIRED"
      );
    }

    const sheet =
      getSheet(
        APP_CONFIG.SHEETS.SERVICES
      );

    const values =
      sheet
        .getDataRange()
        .getValues();

    if (!values.length) {
      return errorResponse(
        "servicesシートのヘッダーがありません。",
        "SERVICE_SHEET_INVALID"
      );
    }

    const headers =
      values[0];

    const codeIndex =
      headers.indexOf(
        "service_code"
      );

    if (codeIndex === -1) {
      return errorResponse(
        "servicesシートにservice_code列がありません。",
        "SERVICE_CODE_COLUMN_NOT_FOUND"
      );
    }

    let targetRow = -1;

    for (
      let i = 1;
      i < values.length;
      i++
    ) {

      if (
        String(
          values[i][codeIndex] || ""
        )
          .trim()
          .toUpperCase() ===
        serviceCode
      ) {

        targetRow =
          i + 1;

        break;
      }
    }


    const now =
      new Date();

    const existing =
      targetRow > 0
        ? values[targetRow - 1]
        : null;


    const record = {

      service_code:
        serviceCode,

      brand_code:
        String(
          data.brand_code || "TFG"
        ).trim(),

      store_code:
        String(
          data.store_code || "YACHIYO"
        ).trim(),

      service_name:
        serviceName,

      category:
        String(
          data.category || ""
        ).trim(),

      form_type:
        String(
          data.form_type || "MEMBER"
        ).trim(),

      duration:
        Number(
          data.duration || 0
        ),

      calendar_code:
        String(
          data.calendar_code || ""
        ).trim(),

      provider_role:
        String(
          data.provider_role || ""
        ).trim(),

      booking_min_hours:
        Number(
          data.booking_min_hours || 0
        ),

      change_limit_hours:
        Number(
          data.change_limit_hours || 0
        ),

      cancel_limit_hours:
        Number(
          data.cancel_limit_hours || 0
        ),

      public_days:
        Number(
          data.public_days || 0
        ),

      slot_interval_minutes:
        Number(
          data.slot_interval_minutes || 0
        ),

      mail_account_code:
        String(
          data.mail_account_code || ""
        ).trim(),

      public:
        toBooleanService_(
          data.public,
          true
        ),

      active:
        toBooleanService_(
          data.active,
          true
        ),

      created_at:
        existing
          ? existing[
              headers.indexOf(
                "created_at"
              )
            ] || ""
          : now,

      updated_at:
        now
    };


    const row =
      headers.map(
        header =>
          Object.prototype
            .hasOwnProperty.call(
              record,
              header
            )
            ? record[header]
            : existing
              ? existing[
                  headers.indexOf(
                    header
                  )
                ]
              : ""
      );


    let mode;

    if (targetRow > 0) {

      sheet
        .getRange(
          targetRow,
          1,
          1,
          headers.length
        )
        .setValues([
          row
        ]);

      mode =
        "UPDATE";

    } else {

      sheet.appendRow(
        row
      );

      mode =
        "CREATE";
    }


    return successResponse({
      mode:
        mode,

      service_code:
        serviceCode,

      service_name:
        serviceName,

      active:
        record.active,

      public:
        record.public
    });


  } catch (error) {

    return errorResponse(
      "サービス保存中にエラーが発生しました。",
      "SERVICE_SAVE_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * サービス有効・無効切替
 */
function setServiceActive(data) {

  try {

    data = data || {};

    const serviceCode =
      String(
        data.service_code || ""
      )
        .trim()
        .toUpperCase();

    if (!serviceCode) {
      return errorResponse(
        "サービスコードを指定してください。",
        "SERVICE_CODE_REQUIRED"
      );
    }

    const sheet =
      getSheet(
        APP_CONFIG.SHEETS.SERVICES
      );

    const values =
      sheet
        .getDataRange()
        .getValues();

    const headers =
      values[0];

    const codeIndex =
      headers.indexOf(
        "service_code"
      );

    const activeIndex =
      headers.indexOf(
        "active"
      );

    const updatedIndex =
      headers.indexOf(
        "updated_at"
      );

    if (
      codeIndex === -1 ||
      activeIndex === -1
    ) {

      return errorResponse(
        "servicesシートの列構成が不正です。",
        "SERVICE_SHEET_INVALID"
      );
    }


    for (
      let i = 1;
      i < values.length;
      i++
    ) {

      if (
        String(
          values[i][codeIndex] || ""
        )
          .trim()
          .toUpperCase() ===
        serviceCode
      ) {

        const active =
          toBooleanService_(
            data.active,
            false
          );

        sheet
          .getRange(
            i + 1,
            activeIndex + 1
          )
          .setValue(
            active
          );

        if (
          updatedIndex !== -1
        ) {

          sheet
            .getRange(
              i + 1,
              updatedIndex + 1
            )
            .setValue(
              new Date()
            );
        }


        return successResponse({
          service_code:
            serviceCode,

          active:
            active
        });
      }
    }


    return errorResponse(
      "指定されたサービスが見つかりません。",
      "SERVICE_NOT_FOUND",
      {
        service_code:
          serviceCode
      }
    );


  } catch (error) {

    return errorResponse(
      "サービス状態変更中にエラーが発生しました。",
      "SERVICE_ACTIVE_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * boolean変換
 */
function toBooleanService_(
  value,
  defaultValue
) {

  if (
    value === true ||
    value === false
  ) {
    return value;
  }

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  const text =
    String(value)
      .trim()
      .toLowerCase();

  return (
    text === "true" ||
    text === "1" ||
    text === "yes" ||
    text === "on"
  );
}
function testSaveService() {

  const result = saveService({
    service_code: "UNSUBSCRIBE",
    brand_code: "TFG",
    store_code: "YACHIYO",
    service_name: "退会手続き",
    category: "PROCEDURE",
    form_type: "MEMBER",
    duration: 10,
    calendar_code: "TFG_MAIN",
    provider_role: "STAFF",
    booking_min_hours: 3,
    change_limit_hours: 3,
    cancel_limit_hours: 3,
    public_days: 30,
    slot_interval_minutes: 10,
    mail_account_code: "GMAIL01",
    public: true,
    active: true
  });

  Logger.log(
    result.getContent()
  );
}