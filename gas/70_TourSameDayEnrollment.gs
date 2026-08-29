/**
 * A-nauts OS Reserve
 * 店内見学からの当日入会（軽量版）
 *
 * 管理画面で「送信」を押した時だけ実行する。
 * - master の空き会員番号へ1行登録
 * - 計算書PDFを1件作成
 * - PDFを添付した顧客向けGmail下書きを1件作成
 * - メール自動送信、スタッフ予定再取得は行わない
 */

const TOUR_JOIN_MASTER_SPREADSHEET_ID =
  "1kLK6Dbe05Uqd0pxnoKX8MbHpQH9AgDnVygwzDPzyXvw";

const TOUR_JOIN_MASTER_SHEET_NAME = "master";
const TOUR_JOIN_ADMIN_EMAIL = "info@theforestgym.com";
const TOUR_JOIN_LINE_URL = "https://lin.ee/w3sgJkw";

const TOUR_JOIN_REQUIRED_HEADERS = [
  "memberNo",
  "name",
  "email",
  "gender",
  "status",
  "dupOk",
  "adminUnlimited",
  "note",
  "プラン",
  "キャンペーン",
  "特典",
  "スタート日",
  "初期費用",
  "初月日割り会費",
  "クレカ登録状況",
  "PDFファイルID",
  "下書き作成日時",
  "Gmail下書きID"
];


function createTourSameDayEnrollment(body) {
  body = body || {};

  const input = normalizeTourJoinInput_(body);
  validateTourJoinInput_(input);

  const planInfo = getTourJoinPlanInfo_(input.planCode);
  const benefit = getTourJoinBenefit_(planInfo, input.benefitCode);
  const start = parseTourJoinDate_(input.startDate);

  if (!start) {
    throw new Error("スタート日が正しくありません。");
  }

  validateTourJoinStartDate_(start);

  const amount = calculateTourJoinAmount_(start, planInfo, input.benefitCode);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  let draft = null;
  let pdfFile = null;
  let sheet = null;
  let targetRow = 0;
  let originalRow = null;
  let masterWriteStarted = false;

  try {
    const ss = SpreadsheetApp.openById(TOUR_JOIN_MASTER_SPREADSHEET_ID);
    sheet = ss.getSheetByName(TOUR_JOIN_MASTER_SHEET_NAME);

    if (!sheet) {
      throw new Error("masterシートが見つかりません。");
    }

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();

    if (lastRow < 2 || lastColumn < 1) {
      throw new Error("masterシートに会員番号がありません。");
    }

    // 1回の読込みで見出し確認、重複確認、空き番号検索を完了する。
    const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    const header = makeTourJoinHeaderMap_(values[0]);
    assertTourJoinHeaders_(header);

    const joinKey = makeTourJoinKey_(input.reservationId, input.customerEmail);
    const existing = findTourJoinExistingEntry_(values, header, joinKey);

    if (existing) {
      return successResponse(buildTourJoinResult_(
        input,
        planInfo,
        benefit,
        amount,
        String(existing.row[header.memberNo] || "").trim(),
        String(existing.row[header["Gmail下書きID"]] || "").trim(),
        String(existing.row[header["PDFファイルID"]] || "").trim(),
        true
      ));
    }

    assertTourJoinEmailAvailable_(values, header, input.customerEmail);

    targetRow = findTourJoinAvailableMemberRow_(values, header);
    originalRow = values[targetRow - 1].slice();

    const memberNo = String(originalRow[header.memberNo] || "").trim();
    if (!memberNo) {
      throw new Error("割当可能な会員番号がありません。");
    }

    const memberId = makeTourJoinMemberId_(planInfo.plan, memberNo);

    // 先にmasterへ転記する。PDF・下書き作成に失敗した場合は元の空き行へ戻す。
    const newRow = originalRow.slice();
    setTourJoinValue_(newRow, header, "name", input.customerName);
    setTourJoinValue_(newRow, header, "email", input.customerEmail);
    // 性別は申告項目ではないため空欄のまま。予約判定では空欄をMとして扱う。
    setTourJoinValue_(newRow, header, "gender", "");
    setTourJoinValue_(newRow, header, "status", "ACT");
    setTourJoinValue_(newRow, header, "note", buildTourJoinMasterNote_(input, joinKey));
    setTourJoinValue_(newRow, header, "プラン", planInfo.plan);
    setTourJoinValue_(newRow, header, "キャンペーン", planInfo.campaign ? "利用する" : "利用しない");
    setTourJoinValue_(newRow, header, "特典", planInfo.campaign ? benefit : "");
    setTourJoinValue_(newRow, header, "スタート日", start);
    setTourJoinValue_(newRow, header, "初期費用", amount.initialFee);
    setTourJoinValue_(newRow, header, "初月日割り会費", amount.firstMonthFee);
    setTourJoinValue_(newRow, header, "クレカ登録状況", "未登録");

    masterWriteStarted = true;
    sheet.getRange(targetRow, 1, 1, lastColumn).setValues([newRow]);
    sheet
      .getRange(targetRow, header["スタート日"] + 1)
      .setNumberFormat("yyyy/m/d");
    SpreadsheetApp.flush();

    // 既存のWeb入会と同じ計算書PDFを、入会送信時のこの1回だけ作成する。
    pdfFile = createTourJoinWebPdf_(ss, {
      name: input.customerName,
      memberNo: memberNo,
      memberId: memberId,
      plan: planInfo.plan,
      planName: planInfo.displayName,
      campaign: planInfo.campaign,
      benefit: benefit,
      startDate: start,
      initialFee: amount.initialFee,
      firstMonthFee: amount.firstMonthFee,
      monthlyFee: planInfo.monthlyFee,
      initialAmount: amount.initialAmount,
      nextMonthInitialCharge: amount.nextMonthInitialCharge,
      lateJoin: amount.lateJoin,
      benefitCode: input.benefitCode
    });

    // 指定された顧客案内にPDFを添付し、管理通知は同内容をBCCする。自動送信はしない。
    draft = GmailApp.createDraft(
      input.customerEmail,
      "【The Forest Gym】 ご入会ありがとうございました",
      buildTourJoinCustomerDraftBody_(
        input.customerName,
        memberNo,
        memberId,
        planInfo,
        benefit,
        start,
        amount
      ),
      {
        name: "The Forest Gym",
        bcc: TOUR_JOIN_ADMIN_EMAIL,
        attachments: [pdfFile.getBlob().setName(pdfFile.getName())]
      }
    );

    const draftId = String(draft.getMessage().getId() || "").trim();
    if (!draftId) {
      throw new Error("Gmail下書きIDを取得できませんでした。");
    }

    setTourJoinValue_(newRow, header, "PDFファイルID", pdfFile.getId());
    setTourJoinValue_(newRow, header, "下書き作成日時", new Date());
    setTourJoinValue_(newRow, header, "Gmail下書きID", draftId);

    // PDF・下書きの識別子だけ追記する。予定表読込み時には一切実行しない。
    sheet.getRange(targetRow, 1, 1, lastColumn).setValues([newRow]);
    SpreadsheetApp.flush();

    return successResponse(buildTourJoinResult_(
      input,
      planInfo,
      benefit,
      amount,
      memberNo,
      draftId,
      pdfFile.getId(),
      false
    ));

  } catch (error) {
    // 書込み失敗時は空き番号行を元に戻し、孤立した下書きも削除する。
    if (masterWriteStarted && sheet && targetRow && originalRow) {
      try {
        sheet.getRange(targetRow, 1, 1, originalRow.length).setValues([originalRow]);
        SpreadsheetApp.flush();
      } catch (restoreError) {
        // 元のエラーを優先する。
      }
    }

    if (draft) {
      try {
        draft.deleteDraft();
      } catch (deleteError) {
        // 元のエラーを優先する。
      }
    }

    if (pdfFile) {
      try {
        pdfFile.setTrashed(true);
      } catch (trashError) {
        // 元のエラーを優先する。
      }
    }

    throw error;

  } finally {
    lock.releaseLock();
  }
}


function normalizeTourJoinInput_(body) {
  return {
    reservationId: String(body.reservation_id || "").trim(),
    enrollmentType: String(body.enrollment_type || "SELF").trim().toUpperCase(),
    customerName: String(body.customer_name || "").trim(),
    customerEmail: String(body.customer_email || "").trim().toLowerCase(),
    customerPhone: String(body.customer_phone || "").trim(),
    customerAddress: String(body.customer_address || "").trim(),
    planCode: String(body.plan_code || "").trim().toUpperCase(),
    startDate: String(body.start_date || "").trim(),
    benefitCode: String(body.benefit_code || "").trim().toUpperCase()
  };
}


function validateTourJoinInput_(input) {
  if (!input.reservationId) throw new Error("見学予約IDを取得できません。");
  if (!input.customerName) throw new Error("氏名を入力してください。");
  if (!input.customerEmail) throw new Error("メールアドレスを入力してください。");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail)) {
    throw new Error("メールアドレスを確認してください。");
  }
  if (!input.customerPhone) throw new Error("電話番号を入力してください。");
  if (!input.customerAddress) throw new Error("住所を入力してください。");
  if (!input.planCode) throw new Error("プランを選択してください。");
  if (!input.startDate) throw new Error("スタート日を選択してください。");
  if (!["SELF", "FAMILY", "FRIEND"].includes(input.enrollmentType)) {
    throw new Error("入会区分が正しくありません。");
  }
}


function getTourJoinPlanInfo_(code) {
  const plans = {
    CP_REG: { plan: "REGULAR", displayName: "REGULAR", fullName: "キャンペーン レギュラー", campaign: true, monthlyFee: 4950 },
    CP_DAY: { plan: "平日DAY", displayName: "平日DAY", fullName: "キャンペーン 平日DAY", campaign: true, monthlyFee: 4180 },
    CP_NIGHT: { plan: "NIGHT365", displayName: "NIGHT365", fullName: "キャンペーン NIGHT365", campaign: true, monthlyFee: 3300 },
    REG: { plan: "REGULAR", displayName: "REGULAR", fullName: "レギュラー", campaign: false, monthlyFee: 7480 },
    DAY: { plan: "平日DAY", displayName: "平日DAY", fullName: "平日DAY", campaign: false, monthlyFee: 6050 },
    NIGHT: { plan: "NIGHT365", displayName: "NIGHT365", fullName: "NIGHT365", campaign: false, monthlyFee: 4950 }
  };

  if (!plans[code]) throw new Error("対応していないプランです：" + code);
  return plans[code];
}


function getTourJoinBenefit_(planInfo, code) {
  if (!planInfo.campaign) return "特典なし";
  if (code === "SECOND_MONTH_FREE") return "2か月目会費無料";
  if (code === "PT60_FREE") return "無料パーソナルトレーニング60分";
  throw new Error("キャンペーン特典を選択してください。");
}


function calculateTourJoinAmount_(start, planInfo, benefitCode) {
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - start.getDate() + 1;
  const firstMonthFee = Math.floor(planInfo.monthlyFee * remainingDays / daysInMonth);
  const initialFee = planInfo.campaign ? 0 : 8800;
  const lateJoin = new Date().getDate() >= 26;
  const secondMonthFree = planInfo.campaign && benefitCode === "SECOND_MONTH_FREE";
  const nextMonthInitialCharge = lateJoin && !secondMonthFree ? planInfo.monthlyFee : 0;

  return {
    firstMonthFee: firstMonthFee,
    initialFee: initialFee,
    nextMonthInitialCharge: nextMonthInitialCharge,
    initialAmount: initialFee + firstMonthFee + nextMonthInitialCharge,
    lateJoin: lateJoin
  };
}


function makeTourJoinHeaderMap_(headers) {
  const map = {};
  headers.forEach(function(header, index) {
    const key = String(header || "").trim();
    if (key) map[key] = index;
  });
  return map;
}


function assertTourJoinHeaders_(header) {
  const missing = TOUR_JOIN_REQUIRED_HEADERS.filter(function(name) {
    return !Object.prototype.hasOwnProperty.call(header, name);
  });
  if (missing.length) {
    throw new Error("masterシートの列が不足しています：" + missing.join("、"));
  }
}


function findTourJoinAvailableMemberRow_(values, header) {
  for (let i = values.length - 1; i >= 1; i--) {
    const memberNo = String(values[i][header.memberNo] || "").trim();
    const name = String(values[i][header.name] || "").trim();
    const status = String(values[i][header.status] || "").trim();
    if (memberNo && !name && !status) return i + 1;
  }
  throw new Error("使用可能な会員番号がありません。masterのmemberNo列に番号を追加してください。");
}


function findTourJoinExistingEntry_(values, header, joinKey) {
  for (let i = 1; i < values.length; i++) {
    const note = String(values[i][header.note] || "");
    if (note.includes("JOIN_KEY=" + joinKey)) {
      return { sheetRow: i + 1, row: values[i] };
    }
  }
  return null;
}


function assertTourJoinEmailAvailable_(values, header, email) {
  const wanted = String(email || "").trim().toLowerCase();
  for (let i = 1; i < values.length; i++) {
    const current = String(values[i][header.email] || "").trim().toLowerCase();
    const active = String(values[i][header.status] || "").trim().toUpperCase() === "ACT";
    const duplicateAllowed = normalizeTourJoinBoolean_(values[i][header.dupOk]);
    if (current && current === wanted && active && !duplicateAllowed) {
      throw new Error("このメールアドレスは既に会員マスターへ登録されています。");
    }
  }
}


function normalizeTourJoinBoolean_(value) {
  if (value === true) return true;
  return ["1", "TRUE", "YES", "ON"].includes(String(value == null ? "" : value).trim().toUpperCase());
}


function setTourJoinValue_(row, header, name, value) {
  row[header[name]] = value;
}


function makeTourJoinKey_(reservationId, email) {
  return encodeURIComponent(String(reservationId || "").trim()) + "|" +
    encodeURIComponent(String(email || "").trim().toLowerCase());
}


function buildTourJoinMasterNote_(input, joinKey) {
  return [
    "JOIN_KEY=" + joinKey,
    "入会区分=" + getTourJoinEnrollmentTypeName_(input.enrollmentType),
    "見学予約ID=" + input.reservationId,
    "電話番号=" + input.customerPhone,
    "住所=" + input.customerAddress
  ].join(" / ");
}


function makeTourJoinMemberId_(plan, memberNo) {
  const value = String(plan || "");
  if (value.includes("DAY") || value.includes("平日")) return "FWD" + memberNo;
  if (value.includes("NIGHT")) return "NGT" + memberNo;
  return "FRG" + memberNo;
}


function getTourJoinCardUrl_(plan, campaign) {
  const value = String(plan || "");
  if (value.includes("NIGHT")) {
    return campaign
      ? "https://getsugaku-panda.jp/subscription/apply/17678"
      : "https://getsugaku-panda.jp/subscription/apply/17681";
  }
  if (value.includes("DAY") || value.includes("平日")) {
    return campaign
      ? "https://getsugaku-panda.jp/subscription/apply/17677"
      : "https://getsugaku-panda.jp/subscription/apply/17680";
  }
  return campaign
    ? "https://getsugaku-panda.jp/subscription/apply/17643"
    : "https://getsugaku-panda.jp/subscription/apply/17679";
}


function buildTourJoinCustomerDraftBody_(name, memberNo, memberId, planInfo, benefit, start, amount) {
  const campaignText = planInfo.campaign ? "適用" : "適用なし";
  const benefitText = planInfo.campaign ? benefit : "なし";
  const cardUrl = getTourJoinCardUrl_(planInfo.plan, planInfo.campaign);
  const initialAmount = Number(amount.initialAmount || 0).toLocaleString("ja-JP") + "円";

  return `${name}様

本日はThe Forest Gymへご来店いただき、誠にありがとうございました。

また、このたびはご入会いただき、ありがとうございます。

下記の内容にて入会手続きが完了いたしました。

【ご入会内容】

会員番号：${memberId}
プラン：${planInfo.fullName}
ご利用開始日：${formatTourJoinDate_(start)}
キャンペーン：${campaignText}
キャンペーン特典：${benefitText}
初回決済額：${initialAmount}

続いて、以下のURLよりクレジットカードのご登録をお願いいたします。

【クレジットカード登録URL】
${cardUrl}

あわせて、The Forest Gym公式LINEへのお友達追加をお願いいたします。

【The Forest Gym公式LINE】
${TOUR_JOIN_LINE_URL}

お友達追加後、会員番号の6桁の数字「${memberNo}」を送ってください。

公式LINEでは、お得な情報や新サービスなどをご案内いたします。

クレジットカードおよび公式LINEのご登録を確認後、スタッフより入退室キーを発行
いたします。

ご入会内容および料金の詳細につきましては、添付の計算書をご確認ください。

今後ともThe Forest Gymをよろしくお願いいたします。

The Forest Gym`;
}


/**
 * Web入会の計算書と同じテンプレート・セル設定でPDFを作る。
 * master転記後の入会送信時だけ呼ばれ、予定表の読込み時には呼ばれない。
 */
function createTourJoinWebPdf_(ss, value) {
  const templateName = value.campaign ? "invoice_campaign" : "invoice_normal";
  const template = ss.getSheetByName(templateName);

  if (!template) {
    throw new Error(templateName + " シートが見つかりません。");
  }

  const temp = template.copyTo(ss);
  const tempName = "TMP_TOUR_JOIN_" + Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "yyyyMMddHHmmssSSS"
  );
  temp.setName(tempName);

  try {
    const created = new Date();
    const baseYear = created.getFullYear();
    const baseMonth = created.getMonth();
    const createdText = Utilities.formatDate(created, "Asia/Tokyo", "yyyy/M/d");
    const paymentDateText = Utilities.formatDate(
      new Date(baseYear, baseMonth, created.getDate() + 1),
      "Asia/Tokyo",
      "yyyy/M/d"
    );
    const startText = formatTourJoinDate_(value.startDate);
    const firstMonthLabel = getTourJoinMonthLabel_(baseYear, baseMonth, 0);
    const secondMonthLabel = getTourJoinMonthLabel_(baseYear, baseMonth, 1);
    const thirdMonthLabel = getTourJoinMonthLabel_(baseYear, baseMonth, 2);
    const secondMonthDateText = getTourJoinFixedDate_(baseYear, baseMonth, 0, 27);
    const thirdMonthDateText = getTourJoinFixedDate_(baseYear, baseMonth, 1, 27);
    const campaignEndYear = baseYear + 1;
    const campaignEndMonth = baseMonth + 1;
    const discount = getTourJoinCampaignDiscount_(value.plan);

    temp.getRange("B1").setValue(value.name + "さま");
    temp.getRange("E1").setValue(createdText);
    temp.getRange("C2").setValue(value.memberId);
    temp.getRange("C3").setValue("クレジット");
    temp.getRange("C4").setValue(
      value.campaign ? "キャンペーン" + value.planName : value.planName
    );

    if (value.campaign) {
      temp.getRange("C5").setValue(value.benefit);
      temp.getRange("C6").setValue(startText);
      temp.getRange("C7").setValue("WEB／見学当日入会");
      temp.getRange("C16").setValue(
        "（通常" + discount.normalPrice.toLocaleString("ja-JP") + "円）"
      );
      temp.getRange("C17").setValue(
        "▲" + discount.firstDiscount.toLocaleString("ja-JP") + "円"
      );
      temp.getRange("C26").setValue(
        "▲" + discount.longDiscount.toLocaleString("ja-JP") + "円"
      );
      temp.getRange("E17").setValue(
        campaignEndYear + "年" + campaignEndMonth + "月会費まで毎月値引"
      );
      temp.getRange("B30").setValue(
        "1．本キャンペーンは、" + campaignEndYear + "年" + campaignEndMonth +
        "月末以降までのご利用が前提となります。"
      );
      temp.getRange("B31").setValue(
        "2．ご入会後、満3か月間経過したのちはいつでも退会可能ですが、" +
        campaignEndYear + "年" + campaignEndMonth +
        "月末より前に退会（早期退会）の場合、"
      );

    } else {
      temp.getRange("C5").setValue(startText);
      temp.getRange("C6").clearContent();
      temp.getRange("C7").clearContent();
      temp.getRange("C17").setValue(discount.normalPrice).setNumberFormat("#,##0円");
      temp.getRange("C26").setValue(
        "▲" + discount.longDiscount.toLocaleString("ja-JP") + "円"
      );
      temp.getRange("D14").setValue(createdText);
    }

    setTourJoinWebPdfPaymentRows_(temp, value, {
      paymentDateText: paymentDateText,
      firstMonthLabel: firstMonthLabel,
      secondMonthLabel: secondMonthLabel,
      thirdMonthLabel: thirdMonthLabel,
      secondMonthDateText: secondMonthDateText,
      thirdMonthDateText: thirdMonthDateText
    });
    SpreadsheetApp.flush();

    const blob = exportTourJoinSheetPdf_(
      ss.getId(),
      temp.getSheetId(),
      "計算書／" + value.name + "さま.pdf"
    );
    return DriveApp.createFile(blob);

  } finally {
    ss.deleteSheet(temp);
  }
}


function getTourJoinCampaignDiscount_(plan) {
  const text = String(plan || "");
  if (text.includes("DAY") || text.includes("平日")) {
    return { normalPrice: 6050, firstDiscount: 1870, longDiscount: 1540 };
  }
  if (text.includes("NIGHT")) {
    return { normalPrice: 4950, firstDiscount: 1650, longDiscount: 990 };
  }
  return { normalPrice: 7480, firstDiscount: 2530, longDiscount: 1540 };
}


function getTourJoinMonthLabel_(year, month, offset) {
  const value = new Date(year, month + offset, 1);
  return (value.getMonth() + 1) + "月会費";
}


function getTourJoinFixedDate_(year, month, offset, day) {
  return Utilities.formatDate(
    new Date(year, month + offset, day),
    "Asia/Tokyo",
    "yyyy/M/d"
  );
}


function setTourJoinWebPdfPaymentRows_(sheet, value, label) {
  sheet.getRange("B22:E24").clearContent();

  const start = value.startDate;
  const secondMonthFree = value.campaign && value.benefitCode === "SECOND_MONTH_FREE";

  sheet.getRange("B22").setValue("　" + label.firstMonthLabel);
  sheet.getRange("C22").setValue(value.firstMonthFee).setNumberFormat("#,##0円");
  sheet.getRange("D22").setValue(label.paymentDateText);

  sheet.getRange("B23").setValue("　" + label.secondMonthLabel);
  if (secondMonthFree) {
    sheet.getRange("C23").setValue(0).setNumberFormat("#,##0円");
    sheet.getRange("D23").setValue(label.secondMonthDateText);
    sheet.getRange("E23").setValue("選べる特典／2か月目無料");
    sheet.getRange("B24").setValue("　" + label.thirdMonthLabel);
    sheet.getRange("C24").setValue(value.monthlyFee).setNumberFormat("#,##0円");
    sheet.getRange("D24").setValue(label.thirdMonthDateText);
    sheet.getRange("E24").setValue("通常決済サイクル");
  } else {
    sheet.getRange("C23").setValue(value.monthlyFee).setNumberFormat("#,##0円");
    sheet.getRange("D23").setValue(label.secondMonthDateText);
    sheet.getRange("E23").setValue("通常決済サイクル");
  }

  if (start.getDate() < 26) return;

  const startYear = start.getFullYear();
  const startMonth = start.getMonth();
  // 26日以降の分岐でも初回決済日は「入会日翌日」。スタート日からは計算しない。
  const nextDayText = label.paymentDateText;
  const nextMonth27Text = Utilities.formatDate(
    new Date(startYear, startMonth + 1, 27),
    "Asia/Tokyo",
    "yyyy/M/d"
  );

  sheet.getRange("B22:E24").clearContent();
  sheet.getRange("B22").setValue("　" + getTourJoinMonthLabel_(startYear, startMonth, 0));
  sheet.getRange("B23").setValue("　" + getTourJoinMonthLabel_(startYear, startMonth, 1));
  sheet.getRange("B24").setValue("　" + getTourJoinMonthLabel_(startYear, startMonth, 2));

  sheet.getRange("C22")
    .setValue(secondMonthFree ? value.initialAmount : value.initialAmount - value.monthlyFee)
    .setNumberFormat("#,##0円");
  sheet.getRange("C23")
    .setValue(secondMonthFree ? 0 : value.monthlyFee)
    .setNumberFormat("#,##0円");
  sheet.getRange("C24").setValue(value.monthlyFee).setNumberFormat("#,##0円");
  sheet.getRange("D22").setValue(nextDayText);
  sheet.getRange("D23").setValue(nextDayText);
  sheet.getRange("D24").setValue(nextMonth27Text);
  sheet.getRange("E22").setValue("初回決済分は入会日翌日");
  sheet.getRange("E23").setValue(
    secondMonthFree ? "選べる特典／2か月目無料" : "初回決済分は入会日翌日"
  );
  sheet.getRange("E24").setValue("通常決済サイクル");
}


function exportTourJoinSheetPdf_(spreadsheetId, sheetId, fileName) {
  const url =
    "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/export" +
    "?format=pdf" +
    "&gid=" + sheetId +
    "&range=B1:E34" +
    "&size=A4" +
    "&portrait=true" +
    "&fitw=true" +
    "&sheetnames=false" +
    "&printtitle=false" +
    "&pagenumbers=false" +
    "&gridlines=false" +
    "&fzr=false";

  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("計算書PDFを作成できませんでした（HTTP " + status + "）。");
  }

  return response.getBlob().setName(fileName);
}


function buildTourJoinResult_(input, planInfo, benefit, amount, memberNo, draftId, pdfFileId, alreadyCreated) {
  return {
    reservation_id: input.reservationId,
    enrollment_type: input.enrollmentType,
    member_no: memberNo,
    member_id: makeTourJoinMemberId_(planInfo.plan, memberNo),
    plan: planInfo.plan,
    campaign: planInfo.campaign,
    benefit: benefit,
    first_month_fee: amount.firstMonthFee,
    initial_fee: amount.initialFee,
    initial_amount: amount.initialAmount,
    draft_created: !!draftId,
    gmail_draft_id: draftId,
    pdf_created: !!pdfFileId,
    pdf_file_id: pdfFileId,
    already_created: alreadyCreated === true
  };
}


function getTourJoinEnrollmentTypeName_(type) {
  if (type === "FAMILY") return "家族";
  if (type === "FRIEND") return "友達";
  return "本人";
}


function parseTourJoinDate_(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  if (isNaN(date.getTime())) return null;
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) return null;
  return date;
}


function validateTourJoinStartDate_(start) {
  const today = new Date();
  const minimum = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const maximum = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
  if (start < minimum || start > maximum) {
    throw new Error("スタート日は本日から当月末までで選択してください。");
  }
}


function formatTourJoinDate_(value) {
  return Utilities.formatDate(new Date(value), "Asia/Tokyo", "yyyy/M/d");
}
