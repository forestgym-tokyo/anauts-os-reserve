/**
 * ============================================================
 * A-nauts OS Reserve
 * 88_9RoundSuspensionIdentity.gs
 * 9ROUND アリオ蘇我店 休会申請 - 会員番号＋登録メール本人確認
 * ============================================================
 *
 * 既存の72時間トークン運用は維持し、休会内容を表示する前と
 * 申請確定時の両方で、会員番号＋登録メールアドレスを照合する。
 */

function verify9RoundSuspensionIdentity_(body) {
  try {
    const tokenInfo = resolve9RoundSuspensionToken_(body && body.token);
    const member = verify9RoundSuspensionCredentials_(tokenInfo.member, body);

    return round9Json_({
      ok: true,
      data: Object.assign({
        memberName: member.name,
        course: member.course,
        contractStatus: member.contractStatus,
        expiresAt: Utilities.formatDate(
          tokenInfo.expiresAt,
          ROUND9_SUSPENSION_CONFIG.TIMEZONE,
          "yyyy/MM/dd HH:mm"
        )
      }, build9RoundSuspensionOptionData_(member.memberNo))
    });
  } catch (error) {
    console.error("verify9RoundSuspensionIdentity_", error);
    return round9Json_({
      ok: false,
      code: error && error.code ? error.code : "ROUND9_IDENTITY_VERIFY_ERROR",
      message: error && error.message ? error.message : "会員情報を確認できませんでした。"
    });
  }
}

function submit9RoundSuspensionIdentity_(body) {
  try {
    if (
      !body ||
      body.confirmFee !== true ||
      body.confirmCommitment !== true ||
      body.confirmResume !== true ||
      body.confirmDeadline !== true
    ) {
      const error = new Error("同意事項4項目すべてへの同意が必要です。");
      error.code = "CONFIRMATION_REQUIRED";
      throw error;
    }

    const tokenInfo = resolve9RoundSuspensionToken_(body.token);
    verify9RoundSuspensionCredentials_(tokenInfo.member, body);

    const output = submit9RoundSuspensionToken_({
      token: body.token,
      startMonth: body.startMonth,
      months: body.months,
      confirmFee: true,
      confirmPeriod: true,
      confirmDeadline: true
    });

    try {
      const result = JSON.parse(output.getContent());
      if (result && result.ok && result.data && result.data.applicationId) {
        annotate9RoundSuspensionConsent_(result.data.applicationId);
      }
    } catch (annotationError) {
      console.error("annotate9RoundSuspensionConsent_", annotationError);
    }

    return output;
  } catch (error) {
    console.error("submit9RoundSuspensionIdentity_", error);
    return round9Json_({
      ok: false,
      code: error && error.code ? error.code : "ROUND9_IDENTITY_SUBMIT_ERROR",
      message: error && error.message ? error.message : "休会申請を受け付けできませんでした。"
    });
  }
}

function verify9RoundSuspensionCredentials_(member, body) {
  const memberNo = normalize9RoundMemberNo_(body && body.memberNo);
  const email = normalize9RoundEmail_(body && body.email);

  if (!memberNo || !email) {
    const error = new Error("会員番号と登録メールアドレスを入力してください。");
    error.code = "MEMBER_CREDENTIALS_REQUIRED";
    throw error;
  }

  if (
    memberNo !== normalize9RoundMemberNo_(member && member.memberNo) ||
    email !== normalize9RoundEmail_(member && member.email)
  ) {
    const error = new Error("会員番号と登録メールアドレスが会員情報と一致しません。");
    error.code = "MEMBER_CREDENTIALS_MISMATCH";
    throw error;
  }

  return member;
}

function annotate9RoundSuspensionConsent_(applicationId) {
  const ss = get9RoundMasterSpreadsheet_();
  const sheet = ss.getSheetByName(ROUND9_SUSPENSION_CONFIG.LOG_SHEET_DEFAULT);
  if (!sheet || sheet.getLastRow() < 2) return;

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(normalize9RoundHeader_);
  const applicationIndex = headers.indexOf("申請ID");
  const noteIndex = headers.indexOf("備考");
  if (applicationIndex < 0 || noteIndex < 0) return;

  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][applicationIndex] || "").trim() !== String(applicationId || "").trim()) continue;
    const current = String(values[i][noteIndex] || "").trim();
    const audit = "本人確認:会員番号+登録メール一致／同意事項4項目:同意済み";
    sheet.getRange(i + 1, noteIndex + 1).setValue(current ? current + "／" + audit : audit);
    return;
  }
}
