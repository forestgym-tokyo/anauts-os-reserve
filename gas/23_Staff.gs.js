
/**
 * スタッフ一覧取得
 */
function getStaff(params) {
  try {
    params = params || {};
    const includeInactive = normalizeStaffBoolean_(params.include_inactive);
    const rows = getSheetData(APP_CONFIG.SHEETS.STAFF);
    const permissionMap = getStaffAuthPermissionMap_();

    const staff = rows
      .filter(row => includeInactive || normalizeStaffBoolean_(row.active))
      .map(function(row) {
        const record = normalizeStaffRecord_(row);
        const code = normalizeStaffText_(record.staff_code).toUpperCase();
        record.permission = permissionMap.get(code) || "STAFF";
        return record;
      })
      .sort((a, b) =>
        String(a.display_name || a.staff_name || a.staff_code)
          .localeCompare(String(b.display_name || b.staff_name || b.staff_code), "ja")
      );

    return successResponse({
      staff_count: staff.length,
      staff: staff
    });

  } catch (error) {
    logError("getStaff", error.message, { stack: error.stack });
    return errorResponse(
      "スタッフ一覧の取得中にエラーが発生しました。",
      "SYSTEM_ERROR",
      { message: error.message }
    );
  }
}


/**
 * スタッフ1件取得
 */
function getStaffByCode(params) {
  try {
    params = params || {};
    const staffCode = normalizeStaffText_(params.staff_code).toUpperCase();

    if (!staffCode) {
      return errorResponse(
        "staff_codeを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    const staff = findStaffByCode_(staffCode);

    if (!staff) {
      return errorResponse(
        "指定されたスタッフが見つかりません。",
        "STAFF_NOT_FOUND",
        { staff_code: staffCode }
      );
    }

    const record = normalizeStaffRecord_(staff);
    const permissionMap = getStaffAuthPermissionMap_();
    record.permission =
      permissionMap.get(
        normalizeStaffText_(record.staff_code).toUpperCase()
      ) || "STAFF";

    return successResponse(record);

  } catch (error) {
    logError("getStaffByCode", error.message, { stack: error.stack });
    return errorResponse(
      "スタッフ情報の取得中にエラーが発生しました。",
      "SYSTEM_ERROR",
      { message: error.message }
    );
  }
}


/**
 * スタッフ新規登録・更新
 */
function saveStaff(params) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    params = params || {};

    const input = buildStaffInput_(params);
    const validation = validateStaffInput_(input);

    if (!validation.ok) {
      return errorResponse(
        validation.message,
        validation.code,
        validation.detail
      );
    }

    const sheet = getSheet(APP_CONFIG.SHEETS.STAFF);
    const table = getStaffSheetTable_(sheet);

    const existingIndex = table.records.findIndex(record =>
      normalizeStaffText_(record.staff_code).toUpperCase() === input.staff_code
    );

    const now = new Date();
    let mode = "CREATE";

    if (existingIndex >= 0) {
      mode = "UPDATE";

      const existing = table.records[existingIndex];
      const updatedRecord = {
        ...existing,
        ...input,
        created_at: existing.created_at || now,
        updated_at: now
      };

      writeStaffRecord_(
        sheet,
        table.headers,
        existingIndex + 2,
        updatedRecord
      );

    } else {
      const newRecord = {
        ...input,
        created_at: now,
        updated_at: now
      };

      writeStaffRecord_(
        sheet,
        table.headers,
        sheet.getLastRow() + 1,
        newRecord
      );
    }

    const savedStaff =
      normalizeStaffRecord_(
        findStaffByCode_(
          input.staff_code
        )
      );

    const permissionMap =
      getStaffAuthPermissionMap_();

    savedStaff.permission =
      permissionMap.get(
        normalizeStaffText_(
          savedStaff.staff_code
        ).toUpperCase()
      ) || "STAFF";

    const result = {
      mode: mode,
      staff: savedStaff
    };

    logInfo(
      "saveStaff",
      mode === "CREATE" ? "スタッフ登録成功" : "スタッフ更新成功",
      result
    );

    return successResponse(
      result,
      mode === "CREATE"
        ? "スタッフを登録しました。"
        : "スタッフ情報を更新しました。"
    );

  } catch (error) {
    logError("saveStaff", error.message, { stack: error.stack });
    return errorResponse(
      "スタッフ情報の保存中にエラーが発生しました。",
      "SYSTEM_ERROR",
      { message: error.message }
    );

  } finally {
    try {
      lock.releaseLock();
    } catch (error) {}
  }
}


/**
 * スタッフ有効・無効切替
 */
function setStaffActive(params) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    params = params || {};

    const staffCode = normalizeStaffText_(params.staff_code).toUpperCase();

    if (!staffCode) {
      return errorResponse(
        "staff_codeを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    if (
      params.active === "" ||
      params.active === null ||
      params.active === undefined
    ) {
      return errorResponse(
        "activeを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    const sheet = getSheet(APP_CONFIG.SHEETS.STAFF);
    const table = getStaffSheetTable_(sheet);

    const recordIndex = table.records.findIndex(record =>
      normalizeStaffText_(record.staff_code).toUpperCase() === staffCode
    );

    if (recordIndex < 0) {
      return errorResponse(
        "指定されたスタッフが見つかりません。",
        "STAFF_NOT_FOUND",
        { staff_code: staffCode }
      );
    }

    const updatedRecord = {
      ...table.records[recordIndex],
      active: normalizeStaffBoolean_(params.active),
      updated_at: new Date()
    };

    writeStaffRecord_(
      sheet,
      table.headers,
      recordIndex + 2,
      updatedRecord
    );

    const result = {
      staff_code: staffCode,
      active: updatedRecord.active
    };

    logInfo(
      "setStaffActive",
      "スタッフ有効状態更新成功",
      result
    );

    return successResponse(
      result,
      updatedRecord.active
        ? "スタッフを有効にしました。"
        : "スタッフを無効にしました。"
    );

  } catch (error) {
    logError("setStaffActive", error.message, { stack: error.stack });
    return errorResponse(
      "スタッフの有効状態更新中にエラーが発生しました。",
      "SYSTEM_ERROR",
      { message: error.message }
    );

  } finally {
    try {
      lock.releaseLock();
    } catch (error) {}
  }
}


function buildStaffInput_(params) {
  return {
    staff_code: normalizeStaffText_(params.staff_code).toUpperCase(),
    brand_code: normalizeStaffText_(params.brand_code).toUpperCase(),
    store_code: normalizeStaffText_(params.store_code).toUpperCase(),
    staff_name: normalizeStaffText_(params.staff_name),
    display_name: normalizeStaffText_(params.display_name),
    email: normalizeStaffText_(params.email).toLowerCase(),
    calendar_code: normalizeStaffText_(params.calendar_code).toUpperCase(),
    mail_account_code: normalizeStaffText_(params.mail_account_code).toUpperCase(),
    color: normalizeStaffText_(params.color),
    role: normalizeStaffText_(params.role).toUpperCase(),
    active:
      params.active === "" ||
      params.active === null ||
      params.active === undefined
        ? true
        : normalizeStaffBoolean_(params.active),
    can_personal: normalizeStaffBoolean_(params.can_personal),
    can_tour: normalizeStaffBoolean_(params.can_tour),
    can_counsel: normalizeStaffBoolean_(params.can_counsel),
    can_meal_planning: normalizeStaffBoolean_(params.can_meal_planning),
    can_procedure: normalizeStaffBoolean_(params.can_procedure),
    can_unsubscribe: normalizeStaffBoolean_(params.can_unsubscribe),
    can_training_support: normalizeStaffBoolean_(params.can_training_support),
    can_9round: normalizeStaffBoolean_(params.can_9round)
  };
}


function validateStaffInput_(input) {
  const requiredFields = [
    ["staff_code", "スタッフコード"],
    ["brand_code", "ブランド"],
    ["store_code", "店舗"],
    ["staff_name", "氏名"],
    ["display_name", "表示名"],
    ["role", "役割"]
  ];

  const missing = requiredFields.filter(([key]) => !input[key]);

  if (missing.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: missing.map(([, label]) => label).join("、") + "を入力してください。",
      detail: {
        missing_fields: missing.map(([key]) => key)
      }
    };
  }

  if (!/^[A-Z0-9_-]+$/.test(input.staff_code)) {
    return {
      ok: false,
      code: "INVALID_STAFF_CODE",
      message: "スタッフコードは半角英数字・ハイフン・アンダースコアで入力してください。",
      detail: { staff_code: input.staff_code }
    };
  }

  if (
    input.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
  ) {
    return {
      ok: false,
      code: "INVALID_EMAIL",
      message: "メールアドレスの形式が正しくありません。",
      detail: { email: input.email }
    };
  }

  if (
    input.color &&
    !/^#[0-9A-Fa-f]{6}$/.test(input.color)
  ) {
    return {
      ok: false,
      code: "INVALID_COLOR",
      message: "カラーは#から始まる6桁のカラーコードで入力してください。",
      detail: { color: input.color }
    };
  }

  const allowedRoles = ["STAFF", "TRAINER", "OWNER", "ADMIN"];

  if (!allowedRoles.includes(input.role)) {
    return {
      ok: false,
      code: "INVALID_ROLE",
      message: "roleの設定が正しくありません。",
      detail: {
        role: input.role,
        allowed_roles: allowedRoles
      }
    };
  }

  return {
    ok: true,
    code: "",
    message: "",
    detail: null
  };
}


function findStaffByCode_(staffCode) {
  const normalizedCode = normalizeStaffText_(staffCode).toUpperCase();

  return getSheetData(APP_CONFIG.SHEETS.STAFF).find(row =>
    normalizeStaffText_(row.staff_code).toUpperCase() === normalizedCode
  ) || null;
}


function getStaffSheetTable_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("staffシートにヘッダーがありません。");
  }

  const headers = values[0].map(normalizeStaffText_);

  const requiredHeaders = [
    "staff_code",
    "brand_code",
    "store_code",
    "staff_name",
    "display_name",
    "email",
    "calendar_code",
    "mail_account_code",
    "color",
    "role",
    "active",
    "can_personal",
    "can_tour",
    "can_counsel",
    "can_meal_planning",
    "can_procedure",
    "can_unsubscribe",
    "can_training_support",
    "can_9round",
    "created_at",
    "updated_at"
  ];

  const missingHeaders = requiredHeaders.filter(header =>
    !headers.includes(header)
  );

  if (missingHeaders.length > 0) {
    throw new Error(
      "staffシートに必要な列がありません: " +
      missingHeaders.join(", ")
    );
  }

  const records = values
    .slice(1)
    .filter(row => row.some(value => value !== "" && value !== null && value !== undefined))
    .map(row => {
      const record = {};
      headers.forEach((header, index) => {
        if (header) record[header] = row[index];
      });
      return record;
    });

  return {
    headers: headers,
    records: records
  };
}


function writeStaffRecord_(sheet, headers, rowNumber, record) {
  const booleanHeaders = new Set([
    "active",
    "can_personal",
    "can_tour",
    "can_counsel",
    "can_meal_planning",
    "can_procedure",
    "can_unsubscribe",
    "can_training_support",
    "can_9round"
  ]);

  const textHeaders = new Set([
    "staff_code",
    "brand_code",
    "store_code",
    "staff_name",
    "display_name",
    "email",
    "calendar_code",
    "mail_account_code",
    "color",
    "role"
  ]);

  const row = headers.map(header => {
    if (!Object.prototype.hasOwnProperty.call(record, header)) return "";

    const value = record[header];

    if (booleanHeaders.has(header)) {
      return normalizeStaffBoolean_(value);
    }

    if (textHeaders.has(header)) {
      return normalizeStaffText_(value);
    }

    return value;
  });

  headers.forEach((header, index) => {
    const cell = sheet.getRange(rowNumber, index + 1);

    if (textHeaders.has(header)) {
      cell.setNumberFormat("@");
    }

    if (booleanHeaders.has(header)) {
      cell.insertCheckboxes();
    }
  });

  sheet
    .getRange(rowNumber, 1, 1, row.length)
    .setValues([row]);
}


/**
 * auth_users の permission を staff_code 単位で返す。
 * 自動担当割当の優先順位
 * ADMIN > MANAGER > STAFF
 * を管理画面側で正しく判定するために使用する。
 */
function getStaffAuthPermissionMap_() {
  const map = new Map();

  try {
    if (typeof getAuthSheet_ !== "function") {
      return map;
    }

    const sheet = getAuthSheet_();
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return map;
    }

    const headers =
      values[0].map(function(value) {
        return String(value || "").trim();
      });

    const index = {};
    headers.forEach(function(header, i) {
      index[header] = i;
    });

    if (
      index.staff_code === undefined ||
      index.permission === undefined
    ) {
      return map;
    }

    values.slice(1).forEach(function(row) {
      const staffCode =
        normalizeStaffText_(
          row[index.staff_code]
        ).toUpperCase();

      if (!staffCode) {
        return;
      }

      const active =
        index.active === undefined
          ? true
          : normalizeStaffBoolean_(
              row[index.active]
            );

      if (!active) {
        return;
      }

      const permission =
        normalizeStaffText_(
          row[index.permission]
        ).toUpperCase();

      if (
        ["ADMIN", "MANAGER", "STAFF"].includes(
          permission
        )
      ) {
        map.set(
          staffCode,
          permission
        );
      }
    });

  } catch (error) {
    logError(
      "getStaffAuthPermissionMap_",
      error.message,
      {
        stack: error.stack
      }
    );
  }

  return map;
}


function normalizeStaffRecord_(row) {
  if (!row) return null;

  return {
    staff_code: normalizeStaffText_(row.staff_code),
    brand_code: normalizeStaffText_(row.brand_code),
    store_code: normalizeStaffText_(row.store_code),
    staff_name: normalizeStaffText_(row.staff_name),
    display_name: normalizeStaffText_(row.display_name),
    email: normalizeStaffText_(row.email),
    calendar_code: normalizeStaffText_(row.calendar_code),
    mail_account_code: normalizeStaffText_(row.mail_account_code),
    color: normalizeStaffText_(row.color),
    role: normalizeStaffText_(row.role).toUpperCase(),
    active: normalizeStaffBoolean_(row.active),
    can_personal: normalizeStaffBoolean_(row.can_personal),
    can_tour: normalizeStaffBoolean_(row.can_tour),
    can_counsel: normalizeStaffBoolean_(row.can_counsel),
    can_meal_planning: normalizeStaffBoolean_(row.can_meal_planning),
    can_procedure: normalizeStaffBoolean_(row.can_procedure),
    can_unsubscribe: normalizeStaffBoolean_(row.can_unsubscribe),
    can_training_support: normalizeStaffBoolean_(row.can_training_support),
    can_9round: normalizeStaffBoolean_(row.can_9round),
    created_at: formatStaffDateTime_(row.created_at),
    updated_at: formatStaffDateTime_(row.updated_at)
  };
}


function normalizeStaffText_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}


function normalizeStaffBoolean_(value) {
  if (value === true) return true;
  if (value === false) return false;

  const normalized = normalizeStaffText_(value).toUpperCase();

  return (
    normalized === "TRUE" ||
    normalized === "1" ||
    normalized === "YES" ||
    normalized === "ON"
  );
}


function formatStaffDateTime_(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd HH:mm:ss"
    );
  }

  return normalizeStaffText_(value);
}


/**
 * 取得テスト。シートは変更しない。
 */
function testGetStaffAdminApi() {
  const response = getStaff({
    include_inactive: true
  });

  const result = JSON.parse(
    response.getContent()
  );

  if (!result.ok) {
    throw new Error(
      response.getContent()
    );
  }

  Logger.log(
    JSON.stringify(result)
  );

  Logger.log(
    "スタッフ管理API取得テスト成功"
  );
}
