/**
 * ============================================================
 * A-nauts OS Reserve
 * 93_MpgMemberNumberReminder.gs
 * My Private Gym 会員番号メール通知
 * ============================================================
 */

const MPG_MEMBER_NUMBER_REMINDER_CONFIG = Object.freeze({
  REPLY_TO: "info@theforestgym.com",
  SENDER_NAME: "My Private Gym",
  CACHE_SECONDS: 300,
  GENERIC_MESSAGE:
    "入力したメールアドレスが登録情報と一致する場合、会員番号をメールでお送りしました。"
});

function sendMpgMemberNumberReminder_(body) {
  try {
    const email =
      normalizeMpgMemberNumberReminderEmail_(
        (body && body.email) || ""
      );

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return mpgMemberNumberReminderJson_({
        ok: false,
        code: "INVALID_EMAIL",
        message: "メールアドレスを正しく入力してください。"
      });
    }

    const cache = CacheService.getScriptCache();
    const cacheKey =
      "mpg-member-number-reminder:" +
      createMpgMemberNumberReminderKey_(email);

    if (cache.get(cacheKey)) {
      return mpgMemberNumberReminderJson_({
        ok: true,
        message:
          MPG_MEMBER_NUMBER_REMINDER_CONFIG.GENERIC_MESSAGE
      });
    }

    const members =
      findMpgMembersByReminderEmail_(email);

    if (members.length > 0) {
      sendMpgMemberNumberReminderMail_(
        email,
        members
      );
    }

    cache.put(
      cacheKey,
      "1",
      MPG_MEMBER_NUMBER_REMINDER_CONFIG.CACHE_SECONDS
    );

    return mpgMemberNumberReminderJson_({
      ok: true,
      message:
        MPG_MEMBER_NUMBER_REMINDER_CONFIG.GENERIC_MESSAGE
    });

  } catch (error) {
    console.error(
      "sendMpgMemberNumberReminder_",
      error
    );

    return mpgMemberNumberReminderJson_({
      ok: false,
      code:
        "MPG_MEMBER_NUMBER_REMINDER_ERROR",
      message:
        "会員番号メールの送信中にエラーが発生しました。時間をおいて再度お試しください。"
    });
  }
}

function findMpgMembersByReminderEmail_(email) {
  if (
    typeof getMpgReservationMemberMasterSheet_ !==
    "function"
  ) {
    throw new Error(
      "MPG会員マスター接続関数が見つかりません。"
    );
  }

  const normalizedEmail =
    normalizeMpgMemberNumberReminderEmail_(email);

  const sheet =
    getMpgReservationMemberMasterSheet_();

  const values =
    sheet.getDataRange().getDisplayValues();

  if (!values || values.length < 2) {
    return [];
  }

  const headers =
    values[0].map(function(value) {
      return String(value || "").trim();
    });

  const index = {};
  headers.forEach(function(header, i) {
    if (header) index[header] = i;
  });

  [
    "会員番号",
    "メールアドレス"
  ].forEach(function(header) {
    if (typeof index[header] !== "number") {
      throw new Error(
        "MPG会員マスターに必要な列「" +
        header +
        "」がありません。"
      );
    }
  });

  const lastNameIndex =
    index["氏名（姓）"];

  const firstNameIndex =
    index["氏名（名）"];

  const seen = {};
  const members = [];

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const row = values[rowIndex];

    const masterEmail =
      normalizeMpgMemberNumberReminderEmail_(
        row[index["メールアドレス"]]
      );

    if (masterEmail !== normalizedEmail) {
      continue;
    }

    const memberNo =
      normalizeMpgMemberNumberReminderMemberNo_(
        row[index["会員番号"]]
      );

    if (!memberNo || seen[memberNo]) {
      continue;
    }

    seen[memberNo] = true;

    const lastName =
      typeof lastNameIndex === "number"
        ? String(row[lastNameIndex] || "").trim()
        : "";

    const firstName =
      typeof firstNameIndex === "number"
        ? String(row[firstNameIndex] || "").trim()
        : "";

    members.push({
      memberNo: memberNo,
      name:
        (lastName + " " + firstName).trim()
    });
  }

  return members;
}

function normalizeMpgMemberNumberReminderMemberNo_(
  value
) {
  const match =
    String(value || "")
      .trim()
      .match(/(\d{6})$/);

  return match ? match[1] : "";
}

function normalizeMpgMemberNumberReminderEmail_(
  value
) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function sendMpgMemberNumberReminderMail_(
  email,
  members
) {
  const memberLines = members.map(
    function(member) {
      return member.name
        ? member.name +
            " 様　会員番号：" +
            member.memberNo
        : "会員番号：" +
            member.memberNo;
    }
  );

  const body = [
    "My Private Gymでございます。",
    "",
    "ご登録のメールアドレスに紐づく会員番号をご案内いたします。",
    "",
    memberLines.join("\n"),
    "",
    "トレーニングサポート予約時は、上記の6桁の会員番号をご入力ください。",
    "",
    "このメールにお心当たりがない場合は、破棄してください。",
    "",
    "My Private Gym"
  ].join("\n");

  MailApp.sendEmail({
    to: email,
    subject:
      "会員番号のご案内／My Private Gym",
    body: body,
    name:
      MPG_MEMBER_NUMBER_REMINDER_CONFIG.SENDER_NAME,
    replyTo:
      MPG_MEMBER_NUMBER_REMINDER_CONFIG.REPLY_TO
  });
}

function createMpgMemberNumberReminderKey_(
  email
) {
  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(email || ""),
      Utilities.Charset.UTF_8
    );

  return Utilities
    .base64EncodeWebSafe(digest)
    .replace(/=+$/g, "")
    .slice(0, 32);
}

function mpgMemberNumberReminderJson_(payload) {
  return ContentService
    .createTextOutput(
      JSON.stringify(payload || {})
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
