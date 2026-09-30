/**
 * ============================================================
 * A-nauts OS Reserve
 * Public Trainer API v54
 * ============================================================
 *
 * 公開予約画面で表示するトレーナー一覧専用API。
 * メールアドレス等の個人情報は返さない。
 *
 * 99_Main.gs の doGet switch に以下を追加してください。
 *
 *   case "getPublicTrainers":
 *     return getPublicTrainers(params);
 *
 * 公開APIなので requireAuth_ は付けません。
 */

function getPublicTrainers(params) {
  try {
    params = params || {};

    const storeCode =
      String(params.store_code || "")
        .trim()
        .toUpperCase();

    const rows =
      getSheetData(
        APP_CONFIG.SHEETS.STAFF
      );

    const trainers =
      rows
        .filter(function(staff) {
          const active =
            staff.active === true ||
            String(staff.active || "")
              .trim()
              .toUpperCase() === "TRUE";

          if (!active) {
            return false;
          }

          const role =
            String(staff.role || "")
              .trim()
              .toUpperCase();

          if (role !== "TRAINER") {
            return false;
          }

          /*
           * can_personal列が存在する場合は
           * TRUEのトレーナーだけ公開する。
           *
           * 旧データで列値が空の場合は、
           * role=TRAINER を優先して表示対象とする。
           */
          const rawCanPersonal =
            staff.can_personal;

          if (
            rawCanPersonal !== "" &&
            rawCanPersonal !== null &&
            rawCanPersonal !== undefined
          ) {
            const canPersonal =
              rawCanPersonal === true ||
              String(rawCanPersonal)
                .trim()
                .toUpperCase() === "TRUE";

            if (!canPersonal) {
              return false;
            }
          }

          const staffStoreCode =
            String(staff.store_code || "")
              .trim()
              .toUpperCase();

          if (
            storeCode &&
            staffStoreCode &&
            staffStoreCode !== storeCode
          ) {
            return false;
          }

          return true;
        })
        .map(function(staff) {
          const code =
            String(staff.staff_code || "")
              .trim()
              .toUpperCase();

          const name =
            String(
              staff.display_name ||
              staff.staff_name ||
              code
            ).trim();

          return {
            staff_code: code,
            staff_name: name,
            role: "TRAINER",
            store_code:
              String(staff.store_code || "")
                .trim()
                .toUpperCase()
          };
        })
        .filter(function(staff) {
          return !!staff.staff_code;
        })
        .sort(function(a, b) {
          return String(a.staff_name)
            .localeCompare(
              String(b.staff_name),
              "ja"
            );
        });

    return successResponse({
      trainer_count:
        trainers.length,
      trainers:
        trainers
    });

  } catch (error) {
    logError(
      "getPublicTrainers",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "トレーナー一覧の取得中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );
  }
}
