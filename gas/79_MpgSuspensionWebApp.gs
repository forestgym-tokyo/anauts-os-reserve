/**
 * ============================================================
 * A-nauts OS Reserve
 * 79_MpgSuspensionWebApp.gs
 * My Private Gym 各種申請 - standalone GAS entry point
 * ============================================================
 * This file is intended for the Apps Script project currently used
 * by the MPG application web app. 9ROUND withdrawal is operated by
 * its own spreadsheet-bound Apps Script / Web App.
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
    MPG_SUSPENSION_LOG_SHEET_NAME: "休会申請",
    MPG_SUSPENSION_TOKEN_LOG_SHEET_NAME: "休会URL発行",
    MPG_SUSPENSION_PUBLIC_URL: "https://forestgym-tokyo.github.io/anauts-os-reserve/mpg-suspension/",
    MPG_WITHDRAWAL_LOG_SHEET_NAME: "退会申請"
  });

  return {
    spreadsheetId: ss.getId(),
    memberMasterSheetName: firstSheet ? firstSheet.getName() : "",
    suspensionLogSheetName: "休会申請",
    tokenLogSheetName: "休会URL発行",
    withdrawalLogSheetName: "退会申請"
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
          appName: "A-nauts OS Reserve / MPG申請",
          status: "ok",
          accessMode: "token-and-store-form"
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
      case "verifyMpgSuspensionToken":
        return verifyMpgSuspensionToken_(body);

      case "submitMpgSuspensionToken":
        return submitMpgSuspensionToken_(body);

      case "getMpgWithdrawalOptions":
        return getMpgWithdrawalOptions_();

      case "checkMpgWithdrawalMember":
        return checkMpgWithdrawalMember_(body);

      case "submitMpgWithdrawal":
        return submitMpgWithdrawal_(body);

      default:
        return mpgJson_({
          ok: false,
          code: "ACTION_NOT_FOUND",
          message: "指定されたactionは存在しません。"
        });
    }
  } catch (error) {
    console.error("MPG application doPost", error);
    return mpgJson_({
      ok: false,
      code: "APPLICATION_API_ERROR",
      message: error && error.message
        ? error.message
        : "申請APIの処理中にエラーが発生しました。"
    });
  }
}
