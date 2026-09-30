/**
 * ============================================================
 * A-nauts OS Reserve
 * Service Hours Management
 * ============================================================
 */


/**
 * サービス提供時間一覧取得
 *
 * GET:
 * action=getServiceHours
 *
 * 任意:
 * - service_code
 */
function getServiceHours(params) {

  try {

    params = params || {};

    const serviceCode = String(
      params.service_code || ""
    )
      .trim()
      .toUpperCase();

    const rows = getSheetData(
      APP_CONFIG.SHEETS.SERVICE_HOURS
    );

    const result = rows
      .filter(row => {

        if (
          !normalizeServiceHourBoolean_(
            row.active
          )
        ) {
          return false;
        }

        if (
          serviceCode &&
          String(
            row.service_code || ""
          )
            .trim()
            .toUpperCase() !==
            serviceCode
        ) {
          return false;
        }

        return true;
      })
      .map(row => ({
        service_code:
          String(
            row.service_code || ""
          )
            .trim()
            .toUpperCase(),

        day_of_week:
          String(
            row.day_of_week || ""
          )
            .trim()
            .toUpperCase(),

        start_time:
          formatServiceHourTime_(
            row.start_time
          ),

        end_time:
          formatServiceHourTime_(
            row.end_time
          ),

        active:
          normalizeServiceHourBoolean_(
            row.active
          )
      }));

    return successResponse(
      result
    );

  } catch (error) {

    logError(
      "getServiceHours",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "サービス提供時間の取得中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * サービス提供時間保存
 *
 * POST:
 * action=saveServiceHour
 *
 * 同一
 * service_code + day_of_week + start_time + end_time
 * が存在する場合は更新扱い
 */
function saveServiceHour(body) {

  try {

    body = body || {};

    const serviceCode = String(
      body.service_code || ""
    )
      .trim()
      .toUpperCase();

    const dayOfWeek = normalizeServiceHourDay_(
      body.day_of_week
    );

    const startTime =
      formatServiceHourTime_(
        body.start_time
      );

    const endTime =
      formatServiceHourTime_(
        body.end_time
      );

    const active =
      body.active === undefined
        ? true
        : normalizeServiceHourBoolean_(
            body.active
          );


    if (!serviceCode) {
      return errorResponse(
        "service_codeを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    if (!dayOfWeek) {
      return errorResponse(
        "day_of_weekが正しくありません。",
        "VALIDATION_ERROR"
      );
    }

    if (
      !startTime ||
      !endTime
    ) {
      return errorResponse(
        "開始時刻と終了時刻を指定してください。",
        "VALIDATION_ERROR"
      );
    }

    const startMinutes =
      serviceHourTimeToMinutes_(
        startTime
      );

    const endMinutes =
      serviceHourTimeToMinutes_(
        endTime
      );

    if (
      startMinutes >=
      endMinutes
    ) {
      return errorResponse(
        "終了時刻は開始時刻より後にしてください。",
        "INVALID_TIME_RANGE"
      );
    }


    /*
     * サービス存在確認
     */
    const services = getSheetData(
      APP_CONFIG.SHEETS.SERVICES
    );

    const serviceExists =
      services.some(row =>
        String(
          row.service_code || ""
        )
          .trim()
          .toUpperCase() ===
          serviceCode &&
        normalizeServiceHourBoolean_(
          row.active
        )
      );

    if (!serviceExists) {
      return errorResponse(
        "有効なサービスが見つかりません。",
        "SERVICE_NOT_FOUND",
        {
          service_code:
            serviceCode
        }
      );
    }


    const sheet = getSheet(
      APP_CONFIG.SHEETS.SERVICE_HOURS
    );

    const values =
      sheet.getDataRange()
        .getValues();

    if (
      values.length === 0
    ) {
      throw new Error(
        "service_hoursシートにヘッダーがありません。"
      );
    }

    const headers =
      values[0].map(value =>
        String(value).trim()
      );

    const requiredHeaders = [
      "service_code",
      "day_of_week",
      "start_time",
      "end_time",
      "active"
    ];

    const missingHeaders =
      requiredHeaders.filter(
        header =>
          headers.indexOf(
            header
          ) === -1
      );

    if (
      missingHeaders.length > 0
    ) {
      throw new Error(
        "service_hoursに必要な列がありません: " +
        missingHeaders.join(", ")
      );
    }

    const serviceCodeIndex =
      headers.indexOf(
        "service_code"
      );

    const dayIndex =
      headers.indexOf(
        "day_of_week"
      );

    const startIndex =
      headers.indexOf(
        "start_time"
      );

    const endIndex =
      headers.indexOf(
        "end_time"
      );

    const activeIndex =
      headers.indexOf(
        "active"
      );

    const rows =
      values.slice(1);


    /*
     * 同一サービス・同曜日の時間重複チェック
     */
    rows.forEach(row => {

      if (
        !normalizeServiceHourBoolean_(
          row[
            activeIndex
          ]
        )
      ) {
        return;
      }

      const existingServiceCode =
        String(
          row[
            serviceCodeIndex
          ] || ""
        )
          .trim()
          .toUpperCase();

      const existingDay =
        normalizeServiceHourDay_(
          row[
            dayIndex
          ]
        );

      if (
        existingServiceCode !==
          serviceCode ||
        existingDay !==
          dayOfWeek
      ) {
        return;
      }

      const existingStart =
        formatServiceHourTime_(
          row[
            startIndex
          ]
        );

      const existingEnd =
        formatServiceHourTime_(
          row[
            endIndex
          ]
        );

      const existingStartMinutes =
        serviceHourTimeToMinutes_(
          existingStart
        );

      const existingEndMinutes =
        serviceHourTimeToMinutes_(
          existingEnd
        );

      const exactSame =
        existingStart ===
          startTime &&
        existingEnd ===
          endTime;

      if (exactSame) {
        return;
      }

      const overlaps =
        startMinutes <
          existingEndMinutes &&
        endMinutes >
          existingStartMinutes;

      if (overlaps) {
        throw new Error(
          "SERVICE_HOUR_OVERLAP"
        );
      }
    });


    /*
     * 完全一致行を探す
     */
    const existingIndex =
      rows.findIndex(row =>

        String(
          row[
            serviceCodeIndex
          ] || ""
        )
          .trim()
          .toUpperCase() ===
          serviceCode &&

        normalizeServiceHourDay_(
          row[
            dayIndex
          ]
        ) ===
          dayOfWeek &&

        formatServiceHourTime_(
          row[
            startIndex
          ]
        ) ===
          startTime &&

        formatServiceHourTime_(
          row[
            endIndex
          ]
        ) ===
          endTime
      );


    /*
     * 完全一致ならactive更新
     */
    if (
      existingIndex >= 0
    ) {

      const rowNumber =
        existingIndex + 2;

      sheet
        .getRange(
          rowNumber,
          activeIndex + 1
        )
        .setValue(
          active
        );

      return successResponse({
        mode:
          "UPDATE",

        service_code:
          serviceCode,

        day_of_week:
          dayOfWeek,

        start_time:
          startTime,

        end_time:
          endTime,

        active:
          active
      });
    }


    /*
     * 新規追加
     */
    const record = {
      service_code:
        serviceCode,

      day_of_week:
        dayOfWeek,

      start_time:
        startTime,

      end_time:
        endTime,

      active:
        active
    };

    const newRow =
      headers.map(header =>
        Object.prototype
          .hasOwnProperty.call(
            record,
            header
          )
          ? record[
              header
            ]
          : ""
      );

    sheet.appendRow(
      newRow
    );

    return successResponse({
      mode:
        "CREATE",

      service_code:
        serviceCode,

      day_of_week:
        dayOfWeek,

      start_time:
        startTime,

      end_time:
        endTime,

      active:
        active
    });

  } catch (error) {

    if (
      error.message ===
      "SERVICE_HOUR_OVERLAP"
    ) {
      return errorResponse(
        "同じサービス・曜日の提供時間が既存設定と重複しています。",
        "SERVICE_HOUR_OVERLAP"
      );
    }

    logError(
      "saveServiceHour",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "サービス提供時間の保存中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * サービス提供時間削除
 *
 * 完全削除ではなく active=false
 *
 * POST:
 * action=deleteServiceHour
 */
function deleteServiceHour(body) {

  try {

    body = body || {};

    const serviceCode = String(
      body.service_code || ""
    )
      .trim()
      .toUpperCase();

    const dayOfWeek =
      normalizeServiceHourDay_(
        body.day_of_week
      );

    const startTime =
      formatServiceHourTime_(
        body.start_time
      );

    const endTime =
      formatServiceHourTime_(
        body.end_time
      );

    if (
      !serviceCode ||
      !dayOfWeek ||
      !startTime ||
      !endTime
    ) {
      return errorResponse(
        "削除対象の情報が不足しています。",
        "VALIDATION_ERROR"
      );
    }


    const sheet = getSheet(
      APP_CONFIG.SHEETS.SERVICE_HOURS
    );

    const values =
      sheet.getDataRange()
        .getValues();

    const headers =
      values[0].map(value =>
        String(value).trim()
      );

    const serviceCodeIndex =
      headers.indexOf(
        "service_code"
      );

    const dayIndex =
      headers.indexOf(
        "day_of_week"
      );

    const startIndex =
      headers.indexOf(
        "start_time"
      );

    const endIndex =
      headers.indexOf(
        "end_time"
      );

    const activeIndex =
      headers.indexOf(
        "active"
      );

    const rows =
      values.slice(1);

    const index =
      rows.findIndex(row =>

        String(
          row[
            serviceCodeIndex
          ] || ""
        )
          .trim()
          .toUpperCase() ===
          serviceCode &&

        normalizeServiceHourDay_(
          row[
            dayIndex
          ]
        ) ===
          dayOfWeek &&

        formatServiceHourTime_(
          row[
            startIndex
          ]
        ) ===
          startTime &&

        formatServiceHourTime_(
          row[
            endIndex
          ]
        ) ===
          endTime
      );

    if (
      index < 0
    ) {
      return errorResponse(
        "対象のサービス提供時間が見つかりません。",
        "SERVICE_HOUR_NOT_FOUND"
      );
    }

    const rowNumber =
      index + 2;

    sheet
      .getRange(
        rowNumber,
        activeIndex + 1
      )
      .setValue(
        false
      );

    return successResponse({
      service_code:
        serviceCode,

      day_of_week:
        dayOfWeek,

      start_time:
        startTime,

      end_time:
        endTime,

      deleted:
        true
    });

  } catch (error) {

    logError(
      "deleteServiceHour",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "サービス提供時間の削除中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * 曜日正規化
 */
function normalizeServiceHourDay_(
  value
) {

  const text =
    String(
      value || ""
    )
      .trim()
      .toUpperCase();

  const aliases = {
    SUNDAY:
      "SUN",
    MONDAY:
      "MON",
    TUESDAY:
      "TUE",
    WEDNESDAY:
      "WED",
    THURSDAY:
      "THU",
    FRIDAY:
      "FRI",
    SATURDAY:
      "SAT"
  };

  const resolved =
    aliases[
      text
    ] ||
    text;

  const allowed = [
    "ALL",
    "SUN",
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT"
  ];

  return allowed.includes(
    resolved
  )
    ? resolved
    : "";
}


/**
 * 時刻正規化
 */
function formatServiceHourTime_(
  value
) {

  if (!value) {
    return "";
  }

  if (
    value instanceof Date
  ) {
    return Utilities.formatDate(
      value,
      APP_CONFIG.TIMEZONE,
      "HH:mm"
    );
  }

  const text =
    String(
      value
    ).trim();

  if (
    /^\d{1,2}:\d{2}$/.test(
      text
    )
  ) {

    const parts =
      text.split(":");

    const hour =
      Number(
        parts[0]
      );

    const minute =
      Number(
        parts[1]
      );

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return "";
    }

    return (
      String(
        hour
      ).padStart(
        2,
        "0"
      ) +
      ":" +
      String(
        minute
      ).padStart(
        2,
        "0"
      )
    );
  }

  return "";
}


/**
 * HH:mm → 分
 */
function serviceHourTimeToMinutes_(
  value
) {

  const parts =
    String(
      value || ""
    )
      .split(":")
      .map(Number);

  if (
    parts.length !== 2 ||
    !Number.isFinite(
      parts[0]
    ) ||
    !Number.isFinite(
      parts[1]
    )
  ) {
    return NaN;
  }

  return (
    parts[0] * 60 +
    parts[1]
  );
}


/**
 * boolean正規化
 */
function normalizeServiceHourBoolean_(
  value
) {

  if (
    value === true
  ) {
    return true;
  }

  const text =
    String(
      value === null ||
      value === undefined
        ? ""
        : value
    )
      .trim()
      .toUpperCase();

  return (
    text === "TRUE" ||
    text === "1" ||
    text === "YES" ||
    text === "ON"
  );
}
function testGetServiceHours() {

  const result = getServiceHours({
    service_code: "UNSUBSCRIBE"
  });

  Logger.log(
    result.getContent()
  );
}
function testSaveServiceHour() {

  const result = saveServiceHour({
    service_code: "UNSUBSCRIBE",
    day_of_week: "ALL",
    start_time: "12:00",
    end_time: "13:00",
    active: true
  });

  Logger.log(
    result.getContent()
  );
}