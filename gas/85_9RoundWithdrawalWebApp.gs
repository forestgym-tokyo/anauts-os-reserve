/**
 * ============================================================
 * A-nauts OS Reserve
 * 85_9RoundWithdrawalWebApp.gs
 * 9ROUND アリオ蘇我店 各種申請 - standalone bound GAS entry point
 * ============================================================
 *
 * 84_9RoundWithdrawal.gs / 86_9RoundSuspension.gs /
 * 87_9RoundSuspensionToken.gs と同じ、9ROUND_Member
 * スプレッドシートに紐づいた Apps Script プロジェクトで使用する。
 */

const ROUND9_WITHDRAWAL_BOUND_CONFIG = Object.freeze({
  MEMBER_MASTER_GID: 1780986215,
  LOG_SHEET_NAME: "退会申請"
});

function setup9RoundWithdrawal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("9ROUND_Memberスプレッドシートに紐づいたApps Scriptから実行してください。");
  }

  let masterSheet = null;
  try {
    masterSheet = ss.getSheetById(ROUND9_WITHDRAWAL_BOUND_CONFIG.MEMBER_MASTER_GID);
  } catch (_) {}
  if (!masterSheet) masterSheet = ss.getSheets()[0];
  if (!masterSheet) throw new Error("9ROUND会員マスターのシートを確認できません。");

  validate9RoundMemberHeaders_(
    masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn()).getDisplayValues()[0]
  );

  PropertiesService.getScriptProperties().setProperties({
    ROUND9_MEMBER_MASTER_ID: ss.getId(),
    ROUND9_MEMBER_MASTER_SHEET_NAME: masterSheet.getName(),
    ROUND9_WITHDRAWAL_LOG_SHEET_NAME: ROUND9_WITHDRAWAL_BOUND_CONFIG.LOG_SHEET_NAME
  });

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    memberMasterSheetName: masterSheet.getName(),
    memberMasterGid: masterSheet.getSheetId(),
    withdrawalLogSheetName: ROUND9_WITHDRAWAL_BOUND_CONFIG.LOG_SHEET_NAME
  };
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || "health").trim();

  switch (action) {
    case "health":
      return round9Json_({
        ok: true,
        data: {
          appName: "A-nauts OS Reserve / 9ROUND申請",
          store: "9ROUND アリオ蘇我店",
          status: "ok",
          accessMode: "withdrawal-and-token-suspension"
        }
      });

    default:
      return round9Json_({
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
      case "get9RoundWithdrawalDate":
        return get9RoundWithdrawalDate_();

      case "check9RoundWithdrawalMember":
        return check9RoundWithdrawalMember_(body);

      case "submit9RoundWithdrawal":
        return submit9RoundWithdrawal_(body);

      case "verify9RoundSuspensionToken":
        return verify9RoundSuspensionToken_(body);

      case "submit9RoundSuspensionToken":
        return submit9RoundSuspensionToken_(body);

      default:
        return round9Json_({
          ok: false,
          code: "ACTION_NOT_FOUND",
          message: "指定されたactionは存在しません。"
        });
    }
  } catch (error) {
    console.error("9ROUND application doPost", error);
    return round9Json_({
      ok: false,
      code: "ROUND9_API_ERROR",
      message: error && error.message
        ? error.message
        : "9ROUND申請APIの処理中にエラーが発生しました。"
    });
  }
}
