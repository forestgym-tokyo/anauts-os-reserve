/**
 * ============================================================
 * A-nauts OS Reserve
 * 85_9RoundWithdrawalWebApp.gs
 * 9ROUND アリオ蘇我店 退会申請 - standalone bound GAS entry point
 * ============================================================
 *
 * このファイルと 84_9RoundWithdrawal.gs を、9ROUND_Member
 * スプレッドシートに紐づいた Apps Script プロジェクトへ配置して使用する。
 * MPG用 Apps Script とは別プロジェクト・別Web Appとして運用する。
 */

const ROUND9_WITHDRAWAL_BOUND_CONFIG = Object.freeze({
  MEMBER_MASTER_GID: 1780986215,
  LOG_SHEET_NAME: "退会申請"
});

/**
 * 初回設定。
 * 9ROUND_Member スプレッドシートに紐づいた Apps Script から、
 * 引数なしで一度だけ実行する。
 */
function setup9RoundWithdrawal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("9ROUND_Memberスプレッドシートに紐づいたApps Scriptから実行してください。");
  }

  let masterSheet = null;
  try {
    masterSheet = ss.getSheetById(ROUND9_WITHDRAWAL_BOUND_CONFIG.MEMBER_MASTER_GID);
  } catch (_) {}

  if (!masterSheet) {
    masterSheet = ss.getSheets()[0];
  }

  if (!masterSheet) {
    throw new Error("9ROUND会員マスターのシートを確認できません。");
  }

  validate9RoundMemberHeaders_(
    masterSheet
      .getRange(1, 1, 1, masterSheet.getLastColumn())
      .getDisplayValues()[0]
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
          appName: "A-nauts OS Reserve / 9ROUND退会申請",
          store: "9ROUND アリオ蘇我店",
          status: "ok",
          accessMode: "store-form"
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

      default:
        return round9Json_({
          ok: false,
          code: "ACTION_NOT_FOUND",
          message: "指定されたactionは存在しません。"
        });
    }
  } catch (error) {
    console.error("9ROUND withdrawal doPost", error);
    return round9Json_({
      ok: false,
      code: "ROUND9_API_ERROR",
      message: error && error.message
        ? error.message
        : "9ROUND退会申請APIの処理中にエラーが発生しました。"
    });
  }
}
