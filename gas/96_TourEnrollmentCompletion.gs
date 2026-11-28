/** Register a TOUR enrollment and create its completion email draft. */
const TOUR_COMPLETION_SUBJECT = "【The Forest Gym】ご入会手続き完了のお知らせ";
const TOUR_COMPLETION_NOTE = "TOUR_CALC_COMPLETION=";

function getTourEnrollmentCalculation(params) {
  const visitor = getTourCompletionReservation_(params.reservation_id);
  const master = readTourCompletionMaster_();
  const entry = findTourCompletionEntry_(master, visitor);
  return successResponse(tourCompletionResult_(visitor, entry));
}

function createTourEnrollmentCalculationDraft(body, auth) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let draft, file, writeStarted = false;
  try {
    const visitor = getTourCompletionReservation_(body.reservation_id);
    if (body.confirmed_email !== visitor.customerEmail) {
      throw new Error("見学予約のメールアドレスが変わりました。計算書を開き直してください。");
    }

    let master = readTourCompletionMaster_();
    const existing = findTourCompletionEntry_(master, visitor);
    if (existing) return successResponse(tourCompletionResult_(visitor, existing));

    const selection = validateTourCompletionSelection_(body);
    assertTourJoinEmailAvailable_(master.values, master.header, visitor.customerEmail);
    const candidate = findSmallestTourCompletionMember_(master);
    const memberId = makeTourJoinMemberId_(selection.planInfo.plan, candidate.number);
    const pdf = createTourCompletionPdf_(master.spreadsheet, visitor.customerName, memberId, selection);
    file = DriveApp.createFile(pdf);
    draft = GmailApp.createDraft(
      visitor.customerEmail, TOUR_COMPLETION_SUBJECT,
      buildTourCompletionEmail_(visitor.customerName, memberId, selection),
      {name: "The Forest Gym", attachments: [pdf]}
    );

    // The spreadsheet and reservation may have changed while the PDF was rendering.
    master = readTourCompletionMaster_();
    assertTourJoinEmailAvailable_(master.values, master.header, visitor.customerEmail);
    if (findTourCompletionEntry_(master, visitor)) throw new Error("入会情報が更新されました。計算書を開き直してください。");
    const latest = findSmallestTourCompletionMember_(master);
    if (latest.number !== candidate.number) throw new Error("空き会員番号が更新されました。下書き作成をもう一度お試しください。");
    const refreshed = getTourCompletionReservation_(visitor.reservationId);
    if (refreshed.customerEmail !== visitor.customerEmail || refreshed.customerName !== visitor.customerName) {
      throw new Error("見学予約の情報が変わりました。計算書を開き直してください。");
    }
    const draftId = draft.getId();
    if (!draftId) throw new Error("Gmail下書きIDを取得できませんでした。");
    const details = {
      reservationId: visitor.reservationId, memberId, draftId,
      staffCode: String(auth.staff_code || "")
    };
    const pdfId = file.getId();
    const draftMessageId = draft.getMessage().getId();
    writeStarted = true;
    saveTourCompletionMember_(master, latest.row, refreshed, selection, details, pdfId, draftMessageId);
    SpreadsheetApp.flush();

    const committed = readTourCompletionMaster_();
    const entry = findTourCompletionEntry_(committed, visitor);
    if (!entry || entry.details.draftId !== draftId || entry.details.memberId !== memberId ||
        entry.data[committed.header["PDFファイルID"]] !== pdfId ||
        entry.data[committed.header["Gmail下書きID"]] !== draftMessageId) {
      // Remove a draft only if the master read succeeded and cannot reference it.
      writeStarted = Boolean(entry && entry.details.draftId === draftId);
      throw new Error("TFGマスターへの登録を確認できません。登録状態を確認してください。");
    }
    return successResponse(tourCompletionResult_(visitor, entry));
  } catch (error) {
    if (!writeStarted) {
      if (draft) {
        try { draft.deleteDraft(); } catch (_) {}
      }
      if (file) {
        try { file.setTrashed(true); } catch (_) {}
      }
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getTourCompletionReservation_(reservationId) {
  const id = String(reservationId || "").trim();
  const found = id && findReservationRecordForUpdate_(id);
  const record = found && found.record;
  const store = String(record && record.store_code || "").trim().toUpperCase();
  if (!record || String(record.service_code || "").trim().toUpperCase() !== "TOUR" ||
      (store && store !== "YACHIYO") || /^(CANCELLED|CANCELED)$/.test(String(record.status || "").trim().toUpperCase())) {
    throw new Error("八千代緑が丘店の有効な見学予約を確認できません。");
  }
  const customerName = String(record.customer_name || "").trim();
  const customerEmail = String(record.customer_email || "").trim().toLowerCase();
  if (!customerName || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(customerEmail)) {
    throw new Error("見学予約の氏名とメールアドレスを確認してください。");
  }
  const noteText = value => String(value || "").replace(/[\r\n]+/g, " ").trim();
  return {
    reservationId: id, enrollmentType: "SELF", customerName, customerEmail,
    customerPhone: noteText(record.customer_phone),
    customerAddress: noteText(record.customer_address || record.address)
  };
}

function readTourCompletionMaster_() {
  const spreadsheet = SpreadsheetApp.openById(TOUR_JOIN_MASTER_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(TOUR_JOIN_MASTER_SHEET_NAME);
  if (!sheet) throw new Error("TFG_Masterにmasterシートがありません。");
  const values = sheet.getDataRange().getValues();
  const header = makeTourJoinHeaderMap_(values[0] || []);
  assertTourJoinHeaders_(header);
  if (header.memberNo !== 0) throw new Error("TFG_MasterのA列が会員番号ではありません。");
  return {spreadsheet, sheet, values, header};
}

function findTourCompletionEntry_(master, visitor) {
  const {values, header} = master;
  const legacyKey = "JOIN_KEY=" + makeTourJoinKey_(visitor.reservationId, visitor.customerEmail);
  let entry = null;
  let legacy = false;
  for (let i = 1; i < values.length; i++) {
    const data = values[i];
    const note = String(data[header.note] || "");
    const end = note.split("\n").pop();
    if (end.startsWith(TOUR_COMPLETION_NOTE)) {
      const details = JSON.parse(decodeURIComponent(end.slice(TOUR_COMPLETION_NOTE.length)));
      if (details.reservationId !== visitor.reservationId) continue;
      if (entry) throw new Error("同じ見学予約の入会記録が複数あります。TFG_Masterを確認してください。");
      if (String(data[header.email] || "").trim().toLowerCase() !== visitor.customerEmail ||
          String(data[header.name] || "").trim() !== visitor.customerName ||
          makeTourJoinMemberId_(data[header["プラン"]], String(data[0]).trim()) !== details.memberId ||
          !details.draftId || !data[header["PDFファイルID"]] || !data[header["Gmail下書きID"]]) {
        throw new Error("登録済みの会員情報と見学予約が一致しません。TFG_Masterを確認してください。");
      }
      entry = {row: i + 1, details, note, data};
    } else if (note.split(/\n| \/ /).includes(legacyKey)) {
      legacy = true;
    }
  }
  if (!entry && legacy) throw new Error("この見学予約は入会手続きから登録済みです。既存の登録・下書きを確認してください。");
  return entry;
}

function findSmallestTourCompletionMember_(master) {
  const {values, header} = master;
  const counts = new Map();
  const occupiedFields = TOUR_JOIN_REQUIRED_HEADERS.filter(key => !["memberNo", "dupOk", "adminUnlimited"].includes(key));
  const candidates = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const number = String(row[0] || "").trim();
    if (!/^\d+$/.test(number) || !Number.isSafeInteger(Number(number)) || Number(number) <= 0) continue;
    const numeric = Number(number);
    counts.set(numeric, (counts.get(numeric) || 0) + 1);
    if (!normalizeTourJoinBoolean_(row[header.adminUnlimited]) && !normalizeTourJoinBoolean_(row[header.dupOk]) &&
        occupiedFields.every(key => String(row[header[key]] ?? "").trim() === "")) {
      candidates.push({row: i + 1, number, numeric});
    }
  }
  const candidate = candidates.sort((a, b) => a.numeric - b.numeric).find(item => counts.get(item.numeric) === 1);
  if (!candidate) throw new Error("TFG_MasterのA列に割当可能な空き会員番号がありません。");
  return candidate;
}

function validateTourCompletionSelection_(body, now) {
  if (body.consent_confirmed !== true) throw new Error("ご本人の入会同意を確認してください。");
  const payment = body.payment_method;
  if (payment === "card" && body.card_registered !== true) throw new Error("月額パンダのクレカ登録を確認してください。");
  if (payment !== "card" && payment !== "bank") throw new Error("支払方法を選択してください。");

  const created = Utilities.formatDate(now || new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  if (body.created_date !== created) throw new Error("作成日が変わりました。計算書を開き直してください。");
  const rules = globalThis.CampaignCalculationRules;
  const start = String(body.start_date || "");
  const month = start.slice(0, 7);
  if (!rules.availableMonthsForDate(created, "store").includes(month) || start < created ||
      !rules.campaignPeriod(month).start.includes(start)) {
    throw new Error("スタート日を対象月内で選択してください。");
  }
  if (!Object.values(rules.tourPlanCodes).includes(body.plan_code)) throw new Error("ご入会種別を選択してください。");
  const planInfo = getTourJoinPlanInfo_(body.plan_code);
  const benefit = getTourJoinBenefit_(planInfo, body.benefit_code);
  const label = planInfo.plan === "REGULAR" ? "レギュラー" : planInfo.plan;
  const fields = {
    created, start, method: payment === "card" ? "クレジット" : "口座振替",
    plan: (planInfo.campaign ? "キャンペーン" : "") + label,
    benefit: planInfo.campaign ? Object.keys(rules.tourBenefitCodes).find(key => rules.tourBenefitCodes[key] === body.benefit_code) : "",
    enrollment: "WEB／見学日入会"
  };
  const result = rules.calculateTourEnrollment(fields, month, payment === "bank");
  const firstMonthFee = result.rows[22][1];
  if (!Number.isInteger(firstMonthFee) || firstMonthFee !== body.first_month_fee) {
    throw new Error("表示した初月会費と計算結果が一致しません。計算書を開き直してください。");
  }
  if (payment === "bank") {
    const fees = result.receiptFees;
    const receipts = Array.isArray(body.receipts) ? body.receipts : [];
    if (fees.length !== receipts.length || fees.some(({row, amount}, index) =>
      !receipts[index] || receipts[index].row !== row || receipts[index].amount !== amount)) {
      throw new Error("計算書に表示した会費を店頭で受領し、確認欄にチェックしてください。");
    }
  }
  return {payment, fields, planInfo, benefit, firstMonthFee, result, title: rules.campaignPeriod(month).title};
}

function encodeTourCompletionNote_(note, details) {
  return note.split("\n").filter(line => !line.startsWith(TOUR_COMPLETION_NOTE))
    .concat(TOUR_COMPLETION_NOTE + encodeURIComponent(JSON.stringify(details))).join("\n");
}

function saveTourCompletionMember_(master, rowNumber, visitor, selection, details, pdfId, draftMessageId) {
  const {sheet, values, header} = master;
  const width = values[0].length;
  const range = sheet.getRange(rowNumber, 2, 1, width - 1);
  const formulas = range.getFormulas()[0];
  const row = values[rowNumber - 1].slice();
  formulas.forEach((formula, index) => { if (formula) row[index + 1] = formula; });
  const receipts = (selection.result.receiptFees || []).map(({label, amount}) => " / " + label + "受領済=" + amount + "円").join("");
  const note = buildTourJoinMasterNote_(visitor, makeTourJoinKey_(visitor.reservationId, visitor.customerEmail)) +
    " / 支払方法=" + selection.fields.method + " / 入会同意確認済" + receipts;
  const record = {
    name: visitor.customerName.startsWith("=") ? "'" + visitor.customerName : visitor.customerName,
    email: visitor.customerEmail, status: "ACT", note: encodeTourCompletionNote_(note, details),
    "プラン": selection.planInfo.plan, "キャンペーン": selection.planInfo.campaign ? "利用する" : "利用しない",
    "特典": selection.planInfo.campaign ? selection.benefit : "",
    "スタート日": new Date(selection.fields.start + "T12:00:00+09:00"),
    "初期費用": selection.result.rows[selection.planInfo.campaign ? 15 : 14][1], "初月日割り会費": selection.firstMonthFee,
    "クレカ登録状況": selection.payment === "card" ? "登録済" : "未登録",
    "PDFファイルID": pdfId, "下書き作成日時": new Date(), "Gmail下書きID": draftMessageId
  };
  if (Object.prototype.hasOwnProperty.call(header, "支払方法")) record["支払方法"] = selection.fields.method;
  Object.entries(record).forEach(([key, value]) => setTourJoinValue_(row, header, key, value));
  range.setValues([row.slice(1)]);
}

function tourCompletionResult_(visitor, entry) {
  return {
    email: visitor.customerEmail,
    status: entry ? "draft" : "new",
    member_id: entry ? entry.details.memberId : ""
  };
}

function buildTourCompletionEmail_(name, memberId, selection) {
  const planText = selection.planInfo.campaign
    ? selection.title + "／" + selection.planInfo.plan + "／初期費用0円"
    : selection.planInfo.plan;
  const benefit = selection.planInfo.campaign
    ? "\n━━━━━━━━━━━━━━━━━━━\n\n■ 選べる特典\n" +
      (selection.fields.benefit === "パーソナル無料" ? "無料パーソナル60分" : selection.benefit)
    : "";

  return `${name}さま

このたびはWEBにてご入会いただき、誠にありがとうございます。
計算書のご送付、ご入会に関するご案内及び会員番号（ID）をお知らせいたします。

━━━━━━━━━━━━━━━━━━━

■ ご入会プラン
${planText}

━━━━━━━━━━━━━━━━━━━

■ 会員ID
${memberId}
${benefit}

━━━━━━━━━━━━━━━━━━━

■ 公式LINEのご登録について（必須）
以下URLよりThe Forest Gymの公式LINEをお友だち追加のうえ、
トークで上記の会員ID（${memberId}）の送信をお願いいたします。

▶ 公式LINE
https://lin.ee/ZW4ll3d

━━━━━━━━━━━━━━━━━━━

■ 会員証（入退室キー）について
公式LINEをお友達追加後、トークで会員IDをご送信いただきますと
「Akerun」より入退室キー（デジタル会員証）ダウンロード用のご案内メールが送信されます。
（21時以降の場合、メールの送信が翌日になることもございます）

メール送信元：「Akerun」
ダウンロードURLの有効期限：24時間

━━━━━━━━━━━━━━━━━━━

■ タッチ型入退室キー（ICカード）について
交通系ICカード（Felica対応）を入退室キーとしてご利用いただくことも可能です。

ご希望の場合は、下記URLよりご来店予約のうえ、店頭にて設定を行います。

▶ 手続予約
https://forestgym-tokyo.github.io/anauts-os-reserve/procedure/

━━━━━━━━━━━━━━━━━━━

ご不明点がございましたら、いつでもお気軽にお問い合わせください。

━━━━━━━━━━━━━━━━━━━
The Forest Gym【フォレストジム】
八千代緑が丘店

[ TEL ] 047-459-5623
[ MAIL ] info@theforestgym.com
[ WEB ] www.theforestgym.com

Be active. Be natural.
━━━━━━━━━━━━━━━━━━━`;
}

function tourCompletionPdfName_(name) {
  return "計算書／" + name + "さま.pdf";
}

function createTourCompletionPdf_(spreadsheet, name, memberId, selection) {
  const logo = UrlFetchApp.fetch("https://forestgym-tokyo.github.io/anauts-os-reserve/admin/assets/campaign-forest-gym-logo.png").getBlob();
  if (logo.getContentType() !== "image/png") throw new Error("計算書のロゴを読み込めませんでした。");
  const tempSheet = spreadsheet.insertSheet("TMP_TOUR_CALC_" + Utilities.getUuid());
  try {
    writeTourCompletionPdf_(tempSheet, name, memberId, selection.fields, selection.title, selection.result, logo);
    SpreadsheetApp.flush();
    return exportTourCompletionPdf_(spreadsheet.getId(), tempSheet.getSheetId(), tourCompletionPdfName_(name));
  } finally {
    spreadsheet.deleteSheet(tempSheet);
  }
}

function writeTourCompletionPdf_(sheet, name, memberId, fields, title, result, logo) {
  const blue = "#dce8f5";
  const rule = "#8299bd";
  const outline = "#294f88";
  const dark = "#20252d";
  const negative = "#e60000";
  const white = "#ffffff";
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value.split("-").map(Number).join("/") : value || "";
  const money = (value, regularPrice) => {
    if (typeof value !== "number") return value || "";
    const formatted = (value < 0 ? "▲" : "") + Math.round(Math.abs(value)).toLocaleString("ja-JP") + "円";
    return regularPrice ? "（通常" + formatted + "）" : formatted;
  };
  const safeText = value => String(value).startsWith("=") ? "'" + value : value;
  const values = Array.from({length: 38}, () => Array(5).fill(""));
  const backgrounds = Array.from({length: 38}, () => Array(5).fill(white));
  const colors = Array.from({length: 38}, () => Array(5).fill(dark));

  values[0] = [name ? "お名前" : "", name ? safeText(name + " さま") : "", "計算書", "作成日", dateLabel(fields.created)];
  values[1] = [name ? "会員番号" : "", name ? memberId : "", "", "", ""];
  values[2] = ["お支払方法", fields.method, "", "", "276-0040"];
  values[3] = ["ご入会種別", fields.plan, "", "", "千葉県八千代市緑が丘西2丁目2－1"];
  values[4] = [fields.plan.includes("キャンペーン") ? "選べる特典" : "", fields.benefit, "", "", "The Forest Gym 八千代緑が丘"];
  values[5] = ["スタート日", dateLabel(fields.start), "", "", "047－459－5623"];
  values[6] = ["ご入会区分", fields.enrollment, "", "", "www.theforestgym.com"];
  values[7][0] = title;
  values[8] = ["項目", "金額（税込）", "決済予定日", "摘要欄", ""];
  backgrounds[8].fill(blue);

  for (let row = 10; row <= 38; row++) {
    const [item, amount, due, note] = result.rows[row] || [];
    values[row - 1] = [item || "", money(amount, row === 11 || row === 16), dateLabel(due), note || "", ""];
    backgrounds[row - 1].fill(row % 2 === 1 ? blue : white);
    if (typeof amount === "number" && amount < 0) colors[row - 1][1] = negative;
  }
  sheet.setHiddenGridlines(true);
  // E:F is one remarks column in the detail table. E is a gutter for the issuer details above it.
  [170, 122, 100, 112, 233].forEach((width, index) => sheet.setColumnWidth(index + 2, width));
  sheet.setRowHeights(1, 38, 23);
  sheet.getRange("B1:F38").setNumberFormat("@").setValues(values).setBackgrounds(backgrounds)
    .setFontColors(colors).setFontFamily("Arial").setFontSize(9).setVerticalAlignment("middle");
  sheet.getRange("B8:F8").merge().setFontWeight("bold");
  sheet.getRange("D1").setHorizontalAlignment("center").setFontSize(12).setFontWeight("bold");
  sheet.getRange("F1").setHorizontalAlignment("right");
  sheet.getRange("F3:F7").setHorizontalAlignment("left").setFontSize(8);
  if (name) sheet.getRange("B1:C2").setBorder(null, null, true, null, null, true, dark, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange("B3:C7").setBorder(null, null, true, null, null, true, dark, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange("C10:C38").setHorizontalAlignment("right");
  sheet.getRange("D10:D38").setHorizontalAlignment("center");
  sheet.getRange("B9:F38").setBorder(true, true, true, true, true, true, rule, SpreadsheetApp.BorderStyle.SOLID);
  const fullWidthRows = new Set([20, 29, 30, 31, 32, 33]);
  for (let row = 9; row <= 38; row++) {
    if (fullWidthRows.has(row)) sheet.getRange(row, 2, 1, 5).merge();
    else sheet.getRange(row, 5, 1, 2).merge();
  }
  sheet.getRange("B9:F38").setBorder(true, true, true, true, null, null, outline, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange("B9:F9").setHorizontalAlignment("center").setFontWeight("bold")
    .setBorder(null, null, true, null, null, null, outline, SpreadsheetApp.BorderStyle.DOUBLE);
  sheet.getRange("B15:C15").setFontWeight("bold");
  sheet.getRange("B22:C24").setFontWeight("bold");
  sheet.insertRowsBefore(8, 2);
  sheet.setRowHeights(8, 2, 25);
  sheet.insertImage(logo, 6, 8, 116, 0).setWidth(111).setHeight(49);
}

function exportTourCompletionPdf_(spreadsheetId, sheetId, filename) {
  const url = "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/export" +
    "?format=pdf&gid=" + sheetId +
    "&r1=0&c1=1&r2=40&c2=6&size=A4&portrait=true&scale=4" +
    "&top_margin=0.30&bottom_margin=0.30&left_margin=0.40&right_margin=0.40" +
    "&sheetnames=false&printtitle=false&pagenumbers=false&gridlines=false&fzr=false";
  const response = UrlFetchApp.fetch(url, {headers:{Authorization:"Bearer " + ScriptApp.getOAuthToken()}});
  const blob = response.getBlob();
  if (blob.getContentType() !== MimeType.PDF) throw new Error("計算書のPDF変換に失敗しました。");
  return blob.setName(filename);
}
