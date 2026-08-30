/**
 * ============================================================
 * A-nauts OS Reserve
 * 79_MpgSuspensionWebApp.gs
 * My Private Gym 休会届 - standalone bound GAS entry point
 * ============================================================
 * This file is intended for the Apps Script project bound to the
 * MPG member-master spreadsheet.
 */

function setupMpgSuspension() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("MPG会員マスターに紐づいたApps Scriptから実行してください。");
  }

  const firstSheet = ss.getSheets()[0];
  PropertiesService.getScriptProperties().setProperties({
    MPG_MEMBER_MASTER_ID: ss.getId(),
    MPG_MEMBER_MASTER_SHEET_NAME: firstSheet ? firstSheet.getName() : "",
    MPG_SUSPENSION_LOG_SHEET_NAME: "休会申請"
  });

  return {
    spreadsheetId: ss.getId(),
    memberMasterSheetName: firstSheet ? firstSheet.getName() : "",
    suspensionLogSheetName: "休会申請"
  };
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || "health").trim();

  switch (action) {
    case "health":
      return mpgJson_({
        ok: true,
        data: {
          appName: "A-nauts OS Reserve / MPG休会届",
          status: "ok"
        }
      });

    default:
      return mpgJson_({
        ok: false,
        code: "ACTION_NOT_FOUND",
        message: "指定されたactionは存在しません。"
      });
  }
}

function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    const action = String(body.action || "").trim();

    switch (action) {
      case "verifyMpgSuspensionMember":
        return verifyMpgSuspensionMember_(body);

      case "submitMpgSuspension":
        return submitMpgSuspension_(body);

      default:
        return mpgJson_({
          ok: false,
          code: "ACTION_NOT_FOUND",
          message: "指定されたactionは存在しません。"
        });
    }
  } catch (error) {
    console.error("MPG suspension doPost", error);
    return mpgJson_({
      ok: false,
      code: "MPG_API_ERROR",
      message: error && error.message
        ? error.message
        : "休会届APIの処理中にエラーが発生しました。"
    });
  }
}
