import fs from "node:fs";

function read_(name) {
  const path = ".gas-live/" + name;
  if (!fs.existsSync(path)) throw new Error("Live GAS file not found: " + path);
  return { path, src: fs.readFileSync(path, "utf8") };
}

function write_(file) {
  fs.writeFileSync(file.path, file.src);
}

function replaceOnce_(file, before, after, label) {
  if (file.src.includes(after)) return;
  if (!file.src.includes(before)) throw new Error("Overlay anchor not found: " + label);
  file.src = file.src.replace(before, after);
}

function replaceAllRequired_(file, before, after, minimum, label) {
  if (file.src.includes(after) && !file.src.includes(before)) return;
  const count = file.src.split(before).length - 1;
  if (count < minimum) throw new Error("Overlay anchor count too small for " + label + ": " + count);
  file.src = file.src.split(before).join(after);
}

// 28_Availability: only shifts from the service's own store may create availability.
{
  const file = read_("28_Availability.gs.js");

  replaceOnce_(
    file,
`      getAvailabilityShifts_(
        targetDate,
        staffMap
      );`,
`      getAvailabilityShifts_(
        targetDate,
        staffMap,
        service.store_code
      );`,
    "28 getAvailableSlots store scope"
  );

  replaceOnce_(
    file,
`    TRAINING_SUPPORT45:
      "can_training_support",
    NINE_ROUND:`,
`    TRAINING_SUPPORT45:
      "can_training_support",
    MPG_TRAINING_SUPPORT45:
      "can_training_support",
    MPG_TOUR45:
      "can_tour",
    NINE_ROUND:`,
    "28 MPG service permission map"
  );

  replaceOnce_(
    file,
` * @param {Map<string, Object>} staffMap
 * @returns {Array<Object>}
 */
function getAvailabilityShifts_(
  targetDate,
  staffMap
) {

  const rows = getSheetData(
    APP_CONFIG.SHEETS.STAFF_SHIFTS
  );

  return rows
    .filter(row =>
      row.active === true &&
      staffMap.has(
        String(row.staff_code || "")
      ) &&
      formatAvailabilityDate_(
        row.date
      ) === targetDate
    )`,
` * @param {Map<string, Object>} staffMap
 * @param {string=} storeCode
 * @returns {Array<Object>}
 */
function getAvailabilityShifts_(
  targetDate,
  staffMap,
  storeCode
) {

  const rows = getSheetData(
    APP_CONFIG.SHEETS.STAFF_SHIFTS
  );

  const normalizedStoreCode =
    String(storeCode || "")
      .trim()
      .toUpperCase();

  return rows
    .filter(row =>
      row.active === true &&
      staffMap.has(
        String(row.staff_code || "")
      ) &&
      (
        !normalizedStoreCode ||
        String(row.store_code || "")
          .trim()
          .toUpperCase() ===
          normalizedStoreCode
      ) &&
      formatAvailabilityDate_(
        row.date
      ) === targetDate
    )`,
    "28 getAvailabilityShifts store filter"
  );

  replaceOnce_(
    file,
`function getAvailabilityShifts_(
  targetDate,
  staffMap,
  storeCode
) {

  const rows = getSheetData(
    APP_CONFIG.SHEETS.STAFF_SHIFTS
  );

  const normalizedStoreCode =
    String(storeCode || "")
      .trim()
      .toUpperCase();

  return rows`,
`function getAvailabilityShifts_(
  targetDate,
  staffMap,
  storeCode
) {

  const normalizedStoreCode =
    String(storeCode || "")
      .trim()
      .toUpperCase();

  if (
    normalizedStoreCode === "MPG" &&
    typeof cleanupUnbookedMpgShifts === "function"
  ) {
    try {
      cleanupUnbookedMpgShifts();
    } catch (_) {
      // Availability must remain readable even if cleanup itself fails.
    }
  }

  const rows = getSheetData(
    APP_CONFIG.SHEETS.STAFF_SHIFTS
  );

  return rows`,
    "28 MPG 48-hour cleanup hook"
  );

  write_(file);
}

// 29_Reservation: reservation validation must use the same store-scoped shifts.
{
  const file = read_("29_Reservation.gs.js");
  replaceAllRequired_(
    file,
`getAvailabilityShifts_(
        targetDate,
        staffMap
      )`,
`getAvailabilityShifts_(
        targetDate,
        staffMap,
        service.store_code
      )`,
    1,
    "29 reservation store scope"
  );
  replaceAllRequired_(
    file,
`getAvailabilityShifts_(
      targetDate,
      staffMap
    )`,
`getAvailabilityShifts_(
      targetDate,
      staffMap,
      service.store_code
    )`,
    1,
    "29 diagnostics store scope"
  );
  write_(file);
}

// 24_StaffShift: protect reserved MPG slots and remove unreserved MPG
// conflicts when YACHIYO/SOGA shifts are saved/imported.
{
  const file = read_("24_StaffShift.gs.js");

  replaceOnce_(
    file,
`    const activeIndex =
      headers.indexOf(
        "active"
      );

    existingRows.forEach(`,
`    const activeIndex =
      headers.indexOf(
        "active"
      );

    const storeCodeIndex =
      headers.indexOf(
        "store_code"
      );

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

    existingRows.forEach(`,
    "24 preflight MPG reservation conflict"
  );

  replaceOnce_(
    file,
`        if (overlaps) {
          throw new Error(
            "SHIFT_OVERLAP"
          );
        }`,
`        if (overlaps) {
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
        }`,
    "24 ignore replaceable MPG overlap"
  );

  replaceOnce_(
    file,
`    return successResponse({
      shift_id:
        finalShiftId,`,
`    let mpgRemovedCount = 0;

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
        finalShiftId,`,
    "24 post-save MPG pruning"
  );

  replaceOnce_(
    file,
`      active:
        true,

      mode:`,
`      active:
        true,

      mpg_removed_count:
        mpgRemovedCount,

      mode:`,
    "24 return MPG removed count"
  );

  replaceOnce_(
    file,
`  if (
    error.message ===
    "SHIFT_OVERLAP"
  ) {`,
`  if (
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
  ) {`,
    "24 reserved MPG error"
  );

  const validationAnchor =
`    if (
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

    const sheet =`;

  const validationPatched =
`    if (
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

    const sheet =`;

  replaceOnce_(file, validationAnchor, validationPatched, "24 bulk import MPG preflight");

  replaceOnce_(
    file,
`    return successResponse({

      mode:
        validation.mode,`,
`    let mpgReconcileResult = null;

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
        validation.mode,`,
    "24 bulk import MPG reconcile"
  );

  replaceOnce_(
    file,
`      inserted_count:
        insertRows.length
    });`,
`      inserted_count:
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
    });`,
    "24 bulk import MPG result"
  );

  write_(file);
}

// 99_Main: expose the monthly MPG generator.
{
  const file = read_("99_Main.js");
  replaceOnce_(
    file,
`      case "saveStaffShift":
        requireDirectShiftEditPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          saveStaffShift(body),
          false,
          body
        );`,
`      case "generateKawakamiMpgShifts":
        requireDirectShiftEditPermission_(
          body
        );
        return generateKawakamiMpgShifts(
          body
        );

      case "saveStaffShift":
        requireDirectShiftEditPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          saveStaffShift(body),
          false,
          body
        );`,
    "99 MPG route"
  );
  write_(file);
}
