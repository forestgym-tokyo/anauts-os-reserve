/**
 * ============================================================
 * A-nauts OS Reserve
 * Staff Shift Management
 * ============================================================
 */


/**
 * スタッフシフト取得
 *
 * GET:
 * action=getStaffShifts
 *
 * 任意:
 * - staff_code
 * - start_date
 * - end_date
 */
function getStaffShifts(params) {

  try {

    params = params || {};

    const staffCode = String(
      params.staff_code || ""
    ).trim();

    const startDate = String(
      params.start_date || ""
    ).trim();

    const endDate = String(
      params.end_date || ""
    ).trim();

    const shifts = getSheetData(
      APP_CONFIG.SHEETS.STAFF_SHIFTS
    );

    const result = shifts
      .filter(shift => {

        if (
          !normalizeShiftBoolean_(
            shift.active
          )
        ) {
          return false;
        }

        if (
          staffCode &&
          String(
            shift.staff_code || ""
          ).trim() !== staffCode
        ) {
          return false;
        }

        const shiftDate =
          formatShiftDate_(
            shift.date
          );

        if (
          startDate &&
          shiftDate < startDate
        ) {
          return false;
        }

        if (
          endDate &&
          shiftDate > endDate
        ) {
          return false;
        }

        return true;
      })
      .map(shift => ({
        shift_id:
          String(
            shift.shift_id || ""
          ),

        staff_code:
          String(
            shift.staff_code || ""
          ),

        store_code:
          String(
            shift.store_code || ""
          ),

        date:
          formatShiftDate_(
            shift.date
          ),

        start_time:
          formatShiftTime_(
            shift.start_time
          ),

        end_time:
          formatShiftTime_(
            shift.end_time
          ),

        active:
          normalizeShiftBoolean_(
            shift.active
          ),

        created_at:
          shift.created_at || "",

        updated_at:
          shift.updated_at || ""
      }));

    return successResponse(
      result
    );

  } catch (error) {

    logError(
      "getStaffShifts",
      error.message,
      {
        stack: error.stack
      }
    );

    return errorResponse(
      "シフト取得中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message: error.message
      }
    );
  }
}


/**
 * 個別シフト登録
 *
 * POST:
 * action=saveStaffShift
 */
function saveStaffShift(body) {

  try {

    body = body || {};

    const shiftId = String(
      body.shift_id || ""
    ).trim();

    const staffCode = String(
      body.staff_code || ""
    ).trim();

    const storeCode = String(
      body.store_code || ""
    ).trim();

    const date = String(
      body.date || ""
    ).trim();

    const startTime =
      normalizeShiftTime_(
        body.start_time
      );

    const endTime =
      normalizeShiftTime_(
        body.end_time
      );

    /*
     * 必須チェック
     */
    if (!staffCode) {
      return errorResponse(
        "スタッフを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    if (!date) {
      return errorResponse(
        "勤務日を指定してください。",
        "VALIDATION_ERROR"
      );
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        date
      )
    ) {
      return errorResponse(
        "勤務日はyyyy-MM-dd形式で指定してください。",
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
      shiftTimeToMinutes_(
        startTime
      );

    const endMinutes =
      shiftTimeToMinutes_(
        endTime
      );

    if (
      startMinutes >= endMinutes
    ) {
      return errorResponse(
        "終了時刻は開始時刻より後にしてください。",
        "INVALID_SHIFT_TIME"
      );
    }


    /*
     * スタッフ存在確認
     */
    const staffRows = getSheetData(
      APP_CONFIG.SHEETS.STAFF
    );

    const staff = staffRows.find(row =>
      String(
        row.staff_code || ""
      ).trim() === staffCode &&
      normalizeShiftBoolean_(
        row.active
      )
    );

    if (!staff) {
      return errorResponse(
        "有効なスタッフが見つかりません。",
        "STAFF_NOT_FOUND",
        {
          staff_code: staffCode
        }
      );
    }


    /*
     * store_code
     *
     * 未指定の場合はスタッフ所属店舗を使用
     */
    const resolvedStoreCode =
      storeCode ||
      String(
        staff.store_code || ""
      ).trim();

    if (!resolvedStoreCode) {
      return errorResponse(
        "店舗コードを特定できません。",
        "STORE_CODE_NOT_FOUND"
      );
    }


    /*
     * 店舗存在確認
     * 複数店舗勤務に対応するため、
     * スタッフ所属店舗との一致は要求しない。
     */
    const storeRows = getSheetData(
      APP_CONFIG.SHEETS.STORES
    );

    const validStore = storeRows.some(row =>
      String(
        row.store_code || ""
      ).trim() === resolvedStoreCode &&
      normalizeShiftBoolean_(
        row.active
      )
    );

    if (!validStore) {
      return errorResponse(
        "有効な店舗が見つかりません。",
        "STORE_NOT_FOUND",
        {
          store_code:
            resolvedStoreCode
        }
      );
    }


    /*
     * 既存シフト取得
     */
    const sheet =
      getSheet(
        APP_CONFIG.SHEETS.STAFF_SHIFTS
      );

    const values =
      sheet.getDataRange()
        .getValues();

    if (
      values.length === 0
    ) {
      throw new Error(
        "staff_shiftsシートにヘッダーがありません。"
      );
    }

    const headers =
      values[0].map(value =>
        String(value).trim()
      );

    const existingRows =
      values.slice(1);


    /*
     * 更新対象行
     */
    let updateRowNumber = -1;

    if (shiftId) {

      const shiftIdIndex =
        headers.indexOf(
          "shift_id"
        );

      if (
        shiftIdIndex === -1
      ) {
        throw new Error(
          "staff_shiftsにshift_id列がありません。"
        );
      }

      const rowIndex =
        existingRows.findIndex(row =>
          String(
            row[
              shiftIdIndex
            ] || ""
          ).trim() === shiftId
        );

      if (
        rowIndex !== -1
      ) {
        updateRowNumber =
          rowIndex + 2;
      }
    }


    /*
     * 時間重複チェック
     */
    const staffCodeIndex =
      headers.indexOf(
        "staff_code"
      );

    const dateIndex =
      headers.indexOf(
        "date"
      );

    const startTimeIndex =
      headers.indexOf(
        "start_time"
      );

    const endTimeIndex =
      headers.indexOf(
        "end_time"
      );

    const activeIndex =
      headers.indexOf(
        "active"
      );

    const storeCodeIndex =
      headers.indexOf(
        "store_code"
      );

    /*
     * 川上のMPG確定予約がある枠は、後から入れる他店舗シフトで
     * 自動削除しない。先に競合を検知して保存自体を止める。
     */
    if (
      typeof mpgAssertIncomingShiftCanReplaceMpg_ ===
      "function"
    ) {
      mpgAssertIncomingShiftCanReplaceMpg_(
        staffCode,
        resolvedStoreCode,
        date,
        startTime,
        endTime
      );
    }

    existingRows.forEach(
      (row, index) => {

        const rowNumber =
          index + 2;

        if (
          rowNumber ===
          updateRowNumber
        ) {
          return;
        }

        if (
          activeIndex >= 0 &&
          !normalizeShiftBoolean_(
            row[
              activeIndex
            ]
          )
        ) {
          return;
        }

        if (
          String(
            row[
              staffCodeIndex
            ] || ""
          ).trim() !== staffCode
        ) {
          return;
        }

        if (
          formatShiftDate_(
            row[
              dateIndex
            ]
          ) !== date
        ) {
          return;
        }

        const existingStart =
          shiftTimeToMinutes_(
            formatShiftTime_(
              row[
                startTimeIndex
              ]
            )
          );

        const existingEnd =
          shiftTimeToMinutes_(
            formatShiftTime_(
              row[
                endTimeIndex
              ]
            )
          );

        const overlaps =
          startMinutes <
            existingEnd &&
          endMinutes >
            existingStart;

        if (overlaps) {
          const existingStoreCode =
            storeCodeIndex >= 0
              ? String(
                  row[
                    storeCodeIndex
                  ] || ""
                ).trim()
              : "";

          if (
            typeof mpgCanIgnoreExistingMpgOverlap_ ===
              "function" &&
            mpgCanIgnoreExistingMpgOverlap_(
              staffCode,
              resolvedStoreCode,
              existingStoreCode
            )
          ) {
            return;
          }

          throw new Error(
            "SHIFT_OVERLAP"
          );
        }
      }
    );


    /*
     * ID生成
     */
    const finalShiftId =
      shiftId ||
      createShiftId_(
        staffCode,
        date
      );

    const now =
      new Date();


    /*
     * 保存データ
     */
    const record = {
      shift_id:
        finalShiftId,

      staff_code:
        staffCode,

      store_code:
        resolvedStoreCode,

      date:
        date,

      start_time:
        startTime,

      end_time:
        endTime,

      active:
        true,

      updated_at:
        now
    };


    /*
     * 新規登録
     */
    if (
      updateRowNumber === -1
    ) {

      record.created_at =
        now;

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

    } else {

      /*
       * 更新
       */
      const row =
        sheet
          .getRange(
            updateRowNumber,
            1,
            1,
            headers.length
          )
          .getValues()[0];

      headers.forEach(
        (header, index) => {

          if (
            Object.prototype
              .hasOwnProperty.call(
                record,
                header
              )
          ) {
            row[index] =
              record[
                header
              ];
          }
        }
      );

      sheet
        .getRange(
          updateRowNumber,
          1,
          1,
          headers.length
        )
        .setValues([
          row
        ]);
    }


    let mpgRemovedCount = 0;

    if (
      typeof mpgDeactivateConflictsForIncomingShift_ ===
      "function"
    ) {
      const mpgResult =
        mpgDeactivateConflictsForIncomingShift_(
          staffCode,
          resolvedStoreCode,
          date,
          startTime,
          endTime
        );

      mpgRemovedCount =
        Number(
          mpgResult &&
          mpgResult.removed_count ||
          0
        );
    }

    return successResponse({
      shift_id:
        finalShiftId,

      staff_code:
        staffCode,

      store_code:
        resolvedStoreCode,

      date:
        date,

      start_time:
        startTime,

      end_time:
        endTime,

      active:
        true,

      mpg_removed_count:
        mpgRemovedCount,

      mode:
        updateRowNumber === -1
          ? "CREATE"
          : "UPDATE"
    });

  } catch (error) {

  if (
    String(
      error.message || ""
    ).indexOf(
      "MPG_RESERVED_CONFLICT::"
    ) === 0
  ) {
    const parts =
      String(
        error.message
      ).split("::");

    return errorResponse(
      "MPGに確定予約があるため、この時間帯には他店舗シフトを登録できません。",
      "MPG_RESERVED_CONFLICT",
      {
        date:
          parts[1] || "",
        start_time:
          parts[2] || "",
        incoming_store_code:
          parts[3] || ""
      }
    );
  }

  if (
    error.message ===
    "SHIFT_OVERLAP"
  ) {
    return errorResponse(
      "同じスタッフの勤務時間が既存シフトと重複しています。",
      "SHIFT_OVERLAP"
    );
  }

  Logger.log(
    "saveStaffShift ERROR: " +
    error.message
  );

  Logger.log(
    error.stack || ""
  );

  return errorResponse(
    "シフト保存中にエラーが発生しました。",
    "SYSTEM_ERROR",
    {
      message:
        error.message,
      stack:
        error.stack || ""
    }
  );
}
}
/**
 * シフト削除
 *
 * 実際には削除せずactive=false
 */
function deleteStaffShift(body) {

  try {

    body = body || {};

    const shiftId = String(
      body.shift_id || ""
    ).trim();

    if (!shiftId) {
      return errorResponse(
        "shift_idを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    const sheet =
     getSheet(
        APP_CONFIG.SHEETS.STAFF_SHIFTS
      );

    const values =
      sheet.getDataRange()
        .getValues();

    const headers =
      values[0].map(value =>
        String(value).trim()
      );

    const shiftIdIndex =
      headers.indexOf(
        "shift_id"
      );

    const activeIndex =
      headers.indexOf(
        "active"
      );

    const updatedAtIndex =
      headers.indexOf(
        "updated_at"
      );

    if (
      shiftIdIndex === -1 ||
      activeIndex === -1
    ) {
      throw new Error(
        "staff_shiftsシートの列構成が正しくありません。"
      );
    }

    const rows =
      values.slice(1);

    const index =
      rows.findIndex(row =>
        String(
          row[
            shiftIdIndex
          ] || ""
        ).trim() === shiftId
      );

    if (index === -1) {
      return errorResponse(
        "対象シフトが見つかりません。",
        "SHIFT_NOT_FOUND"
      );
    }

    const rowNumber =
      index + 2;

    sheet.getRange(
      rowNumber,
      activeIndex + 1
    ).setValue(
      false
    );

    if (
      updatedAtIndex >= 0
    ) {
      sheet.getRange(
        rowNumber,
        updatedAtIndex + 1
      ).setValue(
        new Date()
      );
    }

    return successResponse({
      shift_id:
        shiftId,

      deleted:
        true
    });

  } catch (error) {

    logError(
      "deleteStaffShift",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "シフト削除中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * シフトID生成
 */
function createShiftId_(
  staffCode,
  date
) {

  const datePart =
    String(date)
      .replace(
        /-/g,
        ""
      );

  const uuid =
    Utilities
      .getUuid()
      .replace(
        /-/g,
        ""
      )
      .substring(
        0,
        8
      )
      .toUpperCase();

  return [
    "SHIFT",
    staffCode,
    datePart,
    uuid
  ].join("_");
}


/**
 * HH:mm正規化
 */
function normalizeShiftTime_(
  value
) {

  const formatted =
    formatShiftTime_(
      value
    );

  if (
    !/^\d{2}:\d{2}$/.test(
      formatted
    )
  ) {
    return "";
  }

  const parts =
    formatted
      .split(":")
      .map(Number);

  if (
    parts[0] < 0 ||
    parts[0] > 23 ||
    parts[1] < 0 ||
    parts[1] > 59
  ) {
    return "";
  }

  return formatted;
}


/**
 * HH:mm → 分
 */
function shiftTimeToMinutes_(
  value
) {

  const parts =
    String(value || "")
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
 * TRUE/FALSE正規化
 */
function normalizeShiftBoolean_(
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


/**
 * シフト日付を yyyy-MM-dd 形式へ変換
 */
function formatShiftDate_(
  value
) {

  if (!value) {
    return "";
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    isNaN(
      date.getTime()
    )
  ) {
    return String(
      value
    );
  }

  return Utilities.formatDate(
    date,
    APP_CONFIG.TIMEZONE,
    "yyyy-MM-dd"
  );
}


/**
 * シフト時刻を HH:mm 形式へ変換
 */
function formatShiftTime_(
  value
) {

  if (!value) {
    return "";
  }

  if (
    typeof value ===
    "string"
  ) {

    const text =
      value.trim();

    if (
      /^\d{1,2}:\d{2}$/.test(
        text
      )
    ) {

      const parts =
        text.split(":");

      return (
        String(
          Number(
            parts[0]
          )
        ).padStart(
          2,
          "0"
        ) +
        ":" +
        String(
          Number(
            parts[1]
          )
        ).padStart(
          2,
          "0"
        )
      );
    }
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    isNaN(
      date.getTime()
    )
  ) {
    return String(
      value
    );
  }

  return Utilities.formatDate(
    date,
    APP_CONFIG.TIMEZONE,
    "HH:mm"
  );
}


/**
 * ============================================================
 * 月次シフト一括登録
 * ============================================================
 */


/**
 * 一括登録プレビュー
 *
 * POST:
 * action=previewStaffShiftImport
 */
function previewStaffShiftImport(body) {

  try {

    const validation =
      validateStaffShiftImport_(
        body || {}
      );

    return successResponse({
      mode:
        validation.mode,

      store_code:
        validation.storeCode,

      target_month:
        validation.targetMonth,

      total_count:
        validation.totalCount,

      valid_count:
        validation.validRows.length,

      error_count:
        validation.errors.length,

      valid_rows:
        validation.validRows,

      errors:
        validation.errors
    });

  } catch (error) {

    logError(
      "previewStaffShiftImport",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "シフト一括登録の確認中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * 月次シフト一括登録
 *
 * REPLACE_MONTH:
 * 対象店舗・対象月を無効化して入れ直す
 *
 * APPEND:
 * 既存シフトを残して追加
 */
function importStaffShifts(body) {

  const lock =
    LockService.getScriptLock();

  try {

    lock.waitLock(
      30000
    );

    const validation =
      validateStaffShiftImport_(
        body || {}
      );

    if (
      validation.errors.length > 0
    ) {

      return errorResponse(
        "エラーがあるためシフトを登録できません。",
        "SHIFT_IMPORT_VALIDATION_ERROR",
        {
          total_count:
            validation.totalCount,

          valid_count:
            validation.validRows.length,

          error_count:
            validation.errors.length,

          errors:
            validation.errors
        }
      );
    }

    /*
     * 一括登録でも、MPGの確定予約がある時間帯へ
     * 川上の八千代/9ROUNDシフトを上書きしない。
     */
    if (
      typeof mpgReservedConflictsForIncomingShift_ ===
      "function"
    ) {
      const mpgReservedConflicts = [];

      validation.validRows.forEach(
        row => {
          const conflicts =
            mpgReservedConflictsForIncomingShift_(
              row.staff_code,
              row.store_code,
              row.date,
              row.start_time,
              row.end_time
            );

          conflicts.forEach(
            conflict => {
              mpgReservedConflicts.push({
                incoming_store_code:
                  row.store_code,
                date:
                  conflict.date,
                start_time:
                  conflict.start_time,
                end_time:
                  conflict.end_time
              });
            }
          );
        }
      );

      if (
        mpgReservedConflicts.length > 0
      ) {
        return errorResponse(
          "MPGに確定予約があるため、競合する川上の他店舗シフトを一括登録できません。",
          "MPG_RESERVED_CONFLICT",
          {
            conflicts:
              mpgReservedConflicts
          }
        );
      }
    }

    const sheet =
     getSheet(
        APP_CONFIG.SHEETS.STAFF_SHIFTS
      );

    const values =
      sheet
        .getDataRange()
        .getValues();

    if (
      !values.length
    ) {
      throw new Error(
        "staff_shiftsシートにヘッダーがありません。"
      );
    }

    const headers =
      values[0].map(value =>
        String(
          value
        ).trim()
      );

    /*
     * 必要列確認
     */
    const requiredHeaders = [
      "shift_id",
      "staff_code",
      "date",
      "start_time",
      "end_time",
      "active",
      "created_at",
      "store_code",
      "updated_at"
    ];

    const missingHeaders =
      requiredHeaders.filter(
        header =>
          !headers.includes(
            header
          )
      );

    if (
      missingHeaders.length > 0
    ) {
      throw new Error(
        "staff_shiftsに必要な列がありません: " +
        missingHeaders.join(", ")
      );
    }

    let disabledCount = 0;


    /*
     * REPLACE_MONTHの場合
     *
     * 対象店舗・対象月の既存シフトを
     * active=false にする
     */
    if (
      validation.mode ===
      "REPLACE_MONTH"
    ) {

      const dateIndex =
        headers.indexOf(
          "date"
        );

      const storeIndex =
        headers.indexOf(
          "store_code"
        );

      const activeIndex =
        headers.indexOf(
          "active"
        );

      const updatedIndex =
        headers.indexOf(
          "updated_at"
        );

      values
        .slice(1)
        .forEach(
          (row, index) => {

            if (
              !normalizeShiftBoolean_(
                row[
                  activeIndex
                ]
              )
            ) {
              return;
            }

            const store =
              String(
                row[
                  storeIndex
                ] || ""
              )
                .trim()
                .toUpperCase();

            const date =
              formatShiftDate_(
                row[
                  dateIndex
                ]
              );

            if (
              store !==
              validation.storeCode
            ) {
              return;
            }

            if (
              date.substring(
                0,
                7
              ) !==
              validation.targetMonth
            ) {
              return;
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

            sheet
              .getRange(
                rowNumber,
                updatedIndex + 1
              )
              .setValue(
                new Date()
              );

            disabledCount++;
          }
        );
    }


    /*
     * 新規シフト作成
     */
    const now =
      new Date();

    const insertRows =
      validation.validRows.map(
        row => {

          const record = {

            shift_id:
              createShiftId_(
                row.staff_code,
                row.date
              ),

            staff_code:
              row.staff_code,

            date:
              row.date,

            start_time:
              row.start_time,

            end_time:
              row.end_time,

            active:
              true,

            created_at:
              now,

            store_code:
              row.store_code,

            updated_at:
              now
          };

          return headers.map(
            header =>
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
        }
      );


    /*
     * 一括書き込み
     */
    if (
      insertRows.length > 0
    ) {

      sheet
        .getRange(
          sheet.getLastRow() + 1,
          1,
          insertRows.length,
          headers.length
        )
        .setValues(
          insertRows
        );
    }


    let mpgReconcileResult = null;

    if (
      typeof reconcileKawakamiMpgShifts_ ===
      "function"
    ) {
      mpgReconcileResult =
        reconcileKawakamiMpgShifts_({
          month:
            validation.targetMonth
        });
    }

    return successResponse({

      mode:
        validation.mode,

      store_code:
        validation.storeCode,

      target_month:
        validation.targetMonth,

      disabled_count:
        disabledCount,

      inserted_count:
        insertRows.length,

      mpg_removed_count:
        Number(
          mpgReconcileResult &&
          mpgReconcileResult.removed_count ||
          0
        ),

      mpg_reserved_conflicts:
        mpgReconcileResult &&
        mpgReconcileResult.reserved_conflicts ||
        []
    });

  } catch (error) {

    logError(
      "importStaffShifts",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "シフト一括登録中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );

  } finally {

    try {

      lock.releaseLock();

    } catch (error) {

      // 何もしない
    }
  }
}


/**
 * 一括登録データ検証
 */
function validateStaffShiftImport_(
  body
) {

  const mode =
    String(
      body.mode ||
      "REPLACE_MONTH"
    )
      .trim()
      .toUpperCase();

  if (
    mode !==
      "REPLACE_MONTH" &&
    mode !==
      "APPEND"
  ) {
    throw new Error(
      "modeが正しくありません。"
    );
  }


  /*
   * 店舗
   */
  const storeCode =
    String(
      body.store_code || ""
    )
      .trim()
      .toUpperCase();

  if (!storeCode) {
    throw new Error(
      "store_codeを指定してください。"
    );
  }


  /*
   * 対象月
   */
  const targetMonth =
    String(
      body.target_month || ""
    ).trim();

  if (
    !/^\d{4}-\d{2}$/.test(
      targetMonth
    )
  ) {
    throw new Error(
      "target_monthはyyyy-MM形式で指定してください。"
    );
  }


  /*
   * 行データ
   */
  const rows =
    Array.isArray(
      body.rows
    )
      ? body.rows
      : [];

  if (
    rows.length === 0
  ) {
    throw new Error(
      "シフトデータがありません。"
    );
  }


  /*
   * 店舗存在確認
   */
  const storeExists =
    getSheetData(
      APP_CONFIG.SHEETS.STORES
    ).some(row =>

      String(
        row.store_code || ""
      )
        .trim()
        .toUpperCase() ===
        storeCode &&

      normalizeShiftBoolean_(
        row.active
      )
    );

  if (!storeExists) {

    throw new Error(
      "有効な店舗が見つかりません: " +
      storeCode
    );
  }


  /*
   * スタッフマスター
   */
  const staffMap =
    new Map();

  getSheetData(
    APP_CONFIG.SHEETS.STAFF
  )
    .filter(row =>
      normalizeShiftBoolean_(
        row.active
      )
    )
    .forEach(row => {

      const code =
        String(
          row.staff_code || ""
        )
          .trim()
          .toUpperCase();

      if (code) {

        staffMap.set(
          code,
          row
        );
      }
    });


  const errors = [];
  const validRows = [];

  /*
   * CSV内完全重複確認
   */
  const uploadedKeys =
    new Set();


  rows.forEach(
    (rawRow, index) => {

      const rowNumber =
        index + 2;

      const staffCode =
        String(
          rawRow.staff_code || ""
        )
          .trim()
          .toUpperCase();

      const date =
        normalizeShiftImportDate_(
          rawRow.date
        );

      const startTime =
        normalizeShiftTime_(
          rawRow.start_time
        );

      const endTime =
        normalizeShiftTime_(
          rawRow.end_time
        );


      /*
       * staff_code
       */
      if (!staffCode) {

        errors.push({
          row:
            rowNumber,

          code:
            "STAFF_CODE_REQUIRED",

          message:
            "staff_codeがありません。"
        });

        return;
      }


      if (
        !staffMap.has(
          staffCode
        )
      ) {

        errors.push({
          row:
            rowNumber,

          code:
            "STAFF_NOT_FOUND",

          staff_code:
            staffCode,

          message:
            "スタッフコードが存在しません。"
        });

        return;
      }


      /*
       * 日付
       */
      if (!date) {

        errors.push({
          row:
            rowNumber,

          code:
            "INVALID_DATE",

          message:
            "日付が正しくありません。"
        });

        return;
      }


      if (
        date.substring(
          0,
          7
        ) !==
        targetMonth
      ) {

        errors.push({
          row:
            rowNumber,

          code:
            "MONTH_MISMATCH",

          date:
            date,

          message:
            "対象月と日付が一致しません。"
        });

        return;
      }


      /*
       * 時刻
       */
      if (
        !startTime ||
        !endTime
      ) {

        errors.push({
          row:
            rowNumber,

          code:
            "INVALID_TIME",

          message:
            "開始時刻または終了時刻が正しくありません。"
        });

        return;
      }


      const startMinutes =
        shiftTimeToMinutes_(
          startTime
        );

      const endMinutes =
        shiftTimeToMinutes_(
          endTime
        );


      if (
        startMinutes >=
        endMinutes
      ) {

        errors.push({
          row:
            rowNumber,

          code:
            "INVALID_TIME_RANGE",

          message:
            "終了時刻は開始時刻より後にしてください。"
        });

        return;
      }


      /*
       * 完全重複
       */
      const key = [
        staffCode,
        date,
        startTime,
        endTime
      ].join("|");

      if (
        uploadedKeys.has(
          key
        )
      ) {

        errors.push({
          row:
            rowNumber,

          code:
            "DUPLICATE_ROW",

          message:
            "同じシフトがCSV内に重複しています。"
        });

        return;
      }

      uploadedKeys.add(
        key
      );


      const staff =
        staffMap.get(
          staffCode
        );


      validRows.push({

        source_row:
          rowNumber,

        staff_code:
          staffCode,

        staff_name:
          String(
            staff.display_name ||
            staff.staff_name ||
            ""
          ),

        store_code:
          storeCode,

        date:
          date,

        start_time:
          startTime,

        end_time:
          endTime
      });
    }
  );


  /*
   * 同一スタッフ・同一日の時間重複
   */
  validRows.forEach(
    (row, index) => {

      for (
        let otherIndex =
          index + 1;
        otherIndex <
          validRows.length;
        otherIndex++
      ) {

        const other =
          validRows[
            otherIndex
          ];

        if (
          row.staff_code !==
            other.staff_code ||
          row.date !==
            other.date
        ) {
          continue;
        }

        const rowStart =
          shiftTimeToMinutes_(
            row.start_time
          );

        const rowEnd =
          shiftTimeToMinutes_(
            row.end_time
          );

        const otherStart =
          shiftTimeToMinutes_(
            other.start_time
          );

        const otherEnd =
          shiftTimeToMinutes_(
            other.end_time
          );


        if (
          rowStart <
            otherEnd &&
          rowEnd >
            otherStart
        ) {

          errors.push({

            row:
              other.source_row,

            code:
              "SHIFT_OVERLAP",

            staff_code:
              other.staff_code,

            date:
              other.date,

            message:
              "同一スタッフのシフト時間が重複しています。"
          });
        }
      }
    }
  );


  return {

    mode:
      mode,

    storeCode:
      storeCode,

    targetMonth:
      targetMonth,

    totalCount:
      rows.length,

    validRows:
      validRows,

    errors:
      errors
  };
}


/**
 * CSV等の日付をyyyy-MM-ddへ正規化
 */
function normalizeShiftImportDate_(
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
      "yyyy-MM-dd"
    );
  }

  const text =
    String(
      value
    ).trim();

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    return text;
  }

  const slashMatch =
    text.match(
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/
    );

  if (
    !slashMatch
  ) {
    return "";
  }

  return (
    slashMatch[1] +
    "-" +
    String(
      Number(
        slashMatch[2]
      )
    ).padStart(
      2,
      "0"
    ) +
    "-" +
    String(
      Number(
        slashMatch[3]
      )
    ).padStart(
      2,
      "0"
    )
  );
}
function testSaveStaffShift() {

  const result = saveStaffShift({
    staff_code: "KAWAKAMI",
    store_code: "YACHIYO",
    date: "2026-08-14",
    start_time: "10:00",
    end_time: "18:00"
  });

  Logger.log(
    result.getContent()
  );
}
function testPreviewStaffShiftImport() {

  const result = previewStaffShiftImport({
    mode: "REPLACE_MONTH",
    store_code: "YACHIYO",
    target_month: "2026-09",
    rows: [
      {
        staff_code: "KAWAKAMI",
        date: "2026-09-01",
        start_time: "09:00",
        end_time: "18:00"
      },
      {
        staff_code: "YAMADA",
        date: "2026-09-01",
        start_time: "10:00",
        end_time: "18:00"
      }
    ]
  });

  Logger.log(
    result.getContent()
  );
}
function testImportStaffShifts() {

  const result = importStaffShifts({
    mode: "REPLACE_MONTH",
    store_code: "YACHIYO",
    target_month: "2026-09",
    rows: [
      {
        staff_code: "KAWAKAMI",
        date: "2026-09-01",
        start_time: "09:00",
        end_time: "18:00"
      },
      {
        staff_code: "KAWAKAMI",
        date: "2026-09-02",
        start_time: "10:00",
        end_time: "19:00"
      }
    ]
  });

  Logger.log(
    result.getContent()
  );
}