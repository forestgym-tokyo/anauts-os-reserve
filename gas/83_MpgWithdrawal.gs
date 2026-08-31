/**
 * ============================================================
 * A-nauts OS Reserve
 * 83_MpgWithdrawal.gs
 * My Private Gym 退会申請
 * ============================================================
 */

const MPG_WITHDRAWAL_CONFIG = Object.freeze({
  TIMEZONE: "Asia/Tokyo",
  DEADLINE_DAY: 9,
  DEADLINE_HOUR: 20,
  OPTION_MONTHS: 6,
  LOG_SHEET_DEFAULT: "退会申請",
  ACTIVE_STATUSES: ["契約中", "休会中"]
});

function getMpgWithdrawalOptions_() {
  try {
    const earliestMonth = getMpgEarliestWithdrawalMonth_();
    const options = [];

    for (let i = 0; i < MPG_WITHDRAWAL_CONFIG.OPTION_MONTHS; i++) {
      const month = addMpgMonths_(earliestMonth, i);
      const date = mpgWithdrawalMonthEnd_(month);
      options.push({
        value: date,
        label: formatMpgWithdrawalDateLabel_(date)
      });
    }

    return mpgJson_({
      ok: true,
      data: {
        earliestWithdrawalDate: options[0].value,
        options: options
      }
    });
  } catch (error) {
    console.error("getMpgWithdrawalOptions_", error);
    return mpgJson_({
      ok: false,
      code: "MPG_WITHDRAWAL_OPTIONS_ERROR",
      message: error && error.message ? error.message : "退会期日を取得できませんでした。"
    });
  }
}

function checkMpgWithdrawalMember_(body) {
  try {
    const memberNo = normalizeMpgMemberNo_(body && body.memberNo);
    const email = normalizeMpgEmail_(body && body.email);

    if (!/^\d{6}$/.test(memberNo)) {
      throw new Error("会員番号は6桁の数字で入力してください。");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("メールアドレスを正しく入力してください。");
    }

    const member = findMpgMember_(memberNo, email);
    if (!member) {
      return mpgJson_({
        ok: false,
        code: "MEMBER_NOT_FOUND",
        message: "会員番号またはメールアドレスが一致しません。入力内容をご確認ください。"
      });
    }

    if (MPG_WITHDRAWAL_CONFIG.ACTIVE_STATUSES.indexOf(member.contractStatus) === -1) {
      return mpgJson_({
        ok: false,
        code: "MEMBER_NOT_ACTIVE",
        message: "現在の契約状況では退会申請を受け付けできません。スタッフへお申し出ください。"
      });
    }

    return mpgJson_({
      ok: true,
      data: {
        memberName: member.name,
        course: member.course
      }
    });
  } catch (error) {
    console.error("checkMpgWithdrawalMember_", error);
    return mpgJson_({
      ok: false,
      code: "MPG_WITHDRAWAL_MEMBER_ERROR",
      message: error && error.message ? error.message : "会員情報を確認できませんでした。"
    });
  }
}

function submitMpgWithdrawal_(body) {
  const lock = LockService.getScriptLock();
  try {
    const lastName = String((body && body.lastName) || "").trim();
    const firstName = String((body && body.firstName) || "").trim();
    const lastKana = String((body && body.lastKana) || "").trim();
    const firstKana = String((body && body.firstKana) || "").trim();
    const memberNo = normalizeMpgMemberNo_(body && body.memberNo);
    const email = normalizeMpgEmail_(body && body.email);
    const phone = String((body && body.phone) || "").replace(/[^0-9+]/g, "").trim();
    const withdrawalDate = String((body && body.withdrawalDate) || "").trim();
    const reason = String((body && body.reason) || "").trim();
    const otherReason = String((body && body.otherReason) || "").trim();

    if (!lastName || !firstName || !lastKana || !firstKana) {
      throw new Error("氏名・フリガナを入力してください。");
    }
    if (!/^[ァ-ヶーｦ-ﾟA-Za-zＡ-Ｚａ-ｚ\s]+$/.test(lastKana) ||
        !/^[ァ-ヶーｦ-ﾟA-Za-zＡ-Ｚａ-ｚ\s]+$/.test(firstKana)) {
      throw new Error("フリガナはカタカナまたはアルファベットで入力してください。");
    }
    if (!/^\d{6}$/.test(memberNo)) {
      throw new Error("会員番号は6桁の数字で入力してください。");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("メールアドレスを正しく入力してください。");
    }
    if (!phone) {
      throw new Error("電話番号を入力してください。");
    }
    if (!reason) {
      throw new Error("退会理由を選択してください。");
    }
    if (reason === "その他" && !otherReason) {
      throw new Error("退会理由をご記載ください。");
    }
    if (body.confirm1 !== true || body.confirm2 !== true || body.confirm3 !== true) {
      throw new Error("確認事項すべてへの同意が必要です。");
    }

    const allowedDates = [];
    const earliestMonth = getMpgEarliestWithdrawalMonth_();
    for (let i = 0; i < MPG_WITHDRAWAL_CONFIG.OPTION_MONTHS; i++) {
      allowedDates.push(mpgWithdrawalMonthEnd_(addMpgMonths_(earliestMonth, i)));
    }
    if (allowedDates.indexOf(withdrawalDate) === -1) {
      throw new Error("選択された退会期日は受付対象外です。ページを再読み込みしてください。");
    }

    const member = findMpgMember_(memberNo, email);
    if (!member) {
      const memberError = new Error("会員番号またはメールアドレスが一致しません。入力内容をご確認ください。");
      memberError.code = "MEMBER_NOT_FOUND";
      throw memberError;
    }
    if (MPG_WITHDRAWAL_CONFIG.ACTIVE_STATUSES.indexOf(member.contractStatus) === -1) {
      throw new Error("現在の契約状況では退会申請を受け付けできません。スタッフへお申し出ください。");
    }

    const now = new Date();
    const appliedAt = Utilities.formatDate(now, MPG_WITHDRAWAL_CONFIG.TIMEZONE, "yyyy/MM/dd HH:mm:ss");
    const applicationId = "MPGW-" + Utilities.formatDate(now, MPG_WITHDRAWAL_CONFIG.TIMEZONE, "yyyyMMdd-HHmmss") + "-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const ss = getMpgMasterSpreadsheet_();
    const sheet = getOrCreateMpgWithdrawalLogSheet_(ss);

    lock.waitLock(10000);
    try {
      if (hasDuplicateMpgWithdrawal_(sheet, memberNo, withdrawalDate)) {
        const duplicateError = new Error("同じ退会期日の申請をすでに受け付けています。重複して申請する必要はありません。");
        duplicateError.code = "DUPLICATE_APPLICATION";
        throw duplicateError;
      }

      sheet.appendRow([
        applicationId,
        appliedAt,
        memberNo,
        lastName,
        firstName,
        lastKana,
        firstKana,
        member.name,
        email,
        phone,
        member.contractStatus,
        member.course,
        withdrawalDate,
        reason,
        otherReason,
        "受付",
        "店頭WEB申請"
      ]);
    } finally {
      lock.releaseLock();
    }

    const mailWarnings = [];

    try {
      sendMpgWithdrawalMemberMail_(member, {
        applicationId: applicationId,
        withdrawalDate: withdrawalDate,
        reason: reason
      });
    } catch (mailError) {
      console.error("sendMpgWithdrawalMemberMail_", mailError);
      mailWarnings.push("会員向け受付メールの送信に失敗しました");
    }

    try {
      sendMpgWithdrawalAdminMail_(member, {
        applicationId: applicationId,
        appliedAt: appliedAt,
        enteredName: (lastName + " " + firstName).trim(),
        enteredKana: (lastKana + " " + firstKana).trim(),
        phone: phone,
        withdrawalDate: withdrawalDate,
        reason: reason,
        otherReason: otherReason
      });
    } catch (mailError) {
      console.error("sendMpgWithdrawalAdminMail_", mailError);
      mailWarnings.push("管理者通知メールの送信に失敗しました");
    }

    return mpgJson_({
      ok: true,
      data: {
        applicationId: applicationId,
        memberName: member.name,
        withdrawalDate: withdrawalDate,
        mailWarning: mailWarnings.join("／")
      },
      message: mailWarnings.length
        ? "退会申請は受け付けました。メール送信の一部に失敗したため、スタッフへお申し出ください。"
        : "退会申請を受け付けました。登録メールアドレスへ受付メールを送信しました。"
    });
  } catch (error) {
    try { lock.releaseLock(); } catch (_) {}
    console.error("submitMpgWithdrawal_", error);
    return mpgJson_({
      ok: false,
      code: error && error.code ? error.code : "MPG_WITHDRAWAL_SUBMIT_ERROR",
      message: error && error.message ? error.message : "退会申請の受付中にエラーが発生しました。"
    });
  }
}

function getMpgEarliestWithdrawalMonth_() {
  const now = new Date();
  const parts = Utilities.formatDate(now, MPG_WITHDRAWAL_CONFIG.TIMEZONE, "yyyy,M,d,H,m,s").split(",").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  const hour = parts[3];
  const minute = parts[4];
  const second = parts[5];

  const afterDeadline = day > MPG_WITHDRAWAL_CONFIG.DEADLINE_DAY ||
    (day === MPG_WITHDRAWAL_CONFIG.DEADLINE_DAY &&
      (hour > MPG_WITHDRAWAL_CONFIG.DEADLINE_HOUR ||
        (hour === MPG_WITHDRAWAL_CONFIG.DEADLINE_HOUR && (minute > 0 || second > 0))));

  return buildMpgMonthFromParts_(year, month, afterDeadline ? 1 : 0);
}

function mpgWithdrawalMonthEnd_(monthValue) {
  const match = String(monthValue || "").match(/^(\d{4})-(\d{2})/);
  if (!match) throw new Error("退会月の形式が正しくありません。");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return match[1] + "-" + match[2] + "-" + String(day).padStart(2, "0");
}

function getOrCreateMpgWithdrawalLogSheet_(ss) {
  const configuredName = String(PropertiesService.getScriptProperties().getProperty("MPG_WITHDRAWAL_LOG_SHEET_NAME") || "").trim();
  const name = configuredName || MPG_WITHDRAWAL_CONFIG.LOG_SHEET_DEFAULT;
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "申請ID", "申請日時", "会員番号", "入力姓", "入力名", "入力姓カナ", "入力名カナ", "マスター氏名",
      "メールアドレス", "電話番号", "契約ステータス", "コース", "退会期日", "退会理由", "理由・意見", "ステータス", "備考"
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function hasDuplicateMpgWithdrawal_(sheet, memberNo, withdrawalDate) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return false;
  const headers = values[0];
  const memberIndex = headers.indexOf("会員番号");
  const dateIndex = headers.indexOf("退会期日");
  const statusIndex = headers.indexOf("ステータス");
  if (memberIndex < 0 || dateIndex < 0 || statusIndex < 0) return false;

  return values.slice(1).some(function(row) {
    const status = String(row[statusIndex] || "").trim();
    return normalizeMpgMemberNo_(row[memberIndex]) === memberNo &&
      String(row[dateIndex] || "").trim() === withdrawalDate &&
      status !== "取消" && status !== "却下";
  });
}

function sendMpgWithdrawalMemberMail_(member, data) {
  const subject = "退会申請を受け付けました／My Private Gym";
  const body = [
    member.name + " 様",
    "",
    "My Private Gymでございます。",
    "退会申請を受け付けました。",
    "",
    "申請番号：" + data.applicationId,
    "ご申請の退会期日：" + formatMpgWithdrawalDateLabel_(data.withdrawalDate),
    "退会理由：" + data.reason,
    "",
    "継続条件付きキャンペーン等の条件を満たしていない場合は、通常価格との差額等の精算が必要となる場合がございます。",
    "また、ご申請の退会期日が入会時キャンペーン等で定める退会不可期間に該当する場合は、退会可能な最短期日での退会となります。",
    "必要な精算金や退会期日の変更がある場合は、別途ご案内いたします。",
    "",
    "My Private Gym"
  ].join("\n");

  MailApp.sendEmail({
    to: member.email,
    subject: subject,
    body: body,
    name: "My Private Gym",
    replyTo: MPG_SUSPENSION_CONFIG.REPLY_TO
  });
}

function sendMpgWithdrawalAdminMail_(member, data) {
  const recipients = MPG_SUSPENSION_CONFIG.ADMIN_RECIPIENTS.join(",");
  const subject = "【MPG退会申請】" + member.name + " 様／" + formatMpgWithdrawalDateLabel_(data.withdrawalDate);
  const lines = [
    "My Private Gymの退会申請を受け付けました。",
    "",
    "申請ID：" + data.applicationId,
    "申請日時：" + data.appliedAt,
    "会員番号：" + member.memberNo,
    "マスター氏名：" + member.name,
    "入力氏名：" + data.enteredName,
    "入力フリガナ：" + data.enteredKana,
    "メールアドレス：" + member.email,
    "電話番号：" + data.phone,
    "契約ステータス：" + member.contractStatus,
    "コース：" + member.course,
    "退会期日：" + formatMpgWithdrawalDateLabel_(data.withdrawalDate),
    "退会理由：" + data.reason,
    data.otherReason ? "理由・意見：" + data.otherReason : "",
    "",
    "※キャンペーン継続条件・精算金・最短退会可能日の確認をお願いします。"
  ].join("\n");

  MailApp.sendEmail({
    to: recipients,
    subject: subject,
    body: lines,
    name: "My Private Gym",
    replyTo: MPG_SUSPENSION_CONFIG.REPLY_TO
  });
}

function formatMpgWithdrawalDateLabel_(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || "");
  return Number(match[1]) + "年" + Number(match[2]) + "月末";
}
