/**
 * ============================================================
 * A-nauts OS Reserve
 * 82_MpgSuspensionDraft.gs
 * My Private Gym 休会URL案内メール下書き
 * ============================================================
 */

function createMpgSuspensionDraft_(member, url, expiresAt) {
  try {
    if (!member || !member.email) {
      throw new Error("会員のメールアドレスを確認できません。");
    }

    const props = PropertiesService.getScriptProperties();
    const serviceUrl = String(props.getProperty("MPG_DRAFT_SERVICE_URL") || "").trim();
    const secret = String(props.getProperty("MPG_DRAFT_SERVICE_SECRET") || "").trim();

    if (!serviceUrl || !secret) {
      throw new Error("MPGメール下書きサービスの接続設定がありません。");
    }

    const expiryText = Utilities.formatDate(
      expiresAt,
      MPG_SUSPENSION_CONFIG.TIMEZONE,
      "yyyy/MM/dd HH:mm"
    );

    const payload = {
      action: "createSuspensionDraft",
      secret: secret,
      to: member.email,
      memberName: member.name,
      url: url,
      expiresAt: expiryText,
      earliestStartMonth: getMpgEarliestStartMonth_()
    };

    const response = UrlFetchApp.fetch(serviceUrl, {
      method: "post",
      contentType: "application/json; charset=utf-8",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      followRedirects: true
    });

    const status = response.getResponseCode();
    const text = response.getContentText();
    let result;
    try {
      result = JSON.parse(text || "{}");
    } catch (_) {
      throw new Error("メール下書きサービスから正しい応答を取得できませんでした。HTTP " + status);
    }

    if (status < 200 || status >= 300 || !result.ok) {
      throw new Error(
        result && result.message
          ? result.message
          : "メール下書きサービスでエラーが発生しました。HTTP " + status
      );
    }

    SpreadsheetApp.getActiveSpreadsheet().toast(
      "info.myprivategym@gmail.com に会員宛てのGmail下書きを作成しました。",
      "MPG休会届",
      6
    );

    return {
      ok: true,
      draftId: result.draftId || "",
      to: member.email
    };
  } catch (error) {
    console.error("createMpgSuspensionDraft_", error);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "休会URLは発行しましたが、Gmail下書きの作成に失敗しました。",
      "MPG休会届",
      10
    );
    return {
      ok: false,
      message: error && error.message ? error.message : "Gmail下書きを作成できませんでした。"
    };
  }
}

function authorizeMpgDraftService() {
  const serviceUrl = String(
    PropertiesService.getScriptProperties().getProperty("MPG_DRAFT_SERVICE_URL") || ""
  ).trim();

  if (!serviceUrl) {
    throw new Error("MPG_DRAFT_SERVICE_URL が設定されていません。");
  }

  const response = UrlFetchApp.fetch(serviceUrl, {
    method: "get",
    muteHttpExceptions: true,
    followRedirects: true
  });

  console.log("HTTP " + response.getResponseCode());
  console.log(response.getContentText());
}
