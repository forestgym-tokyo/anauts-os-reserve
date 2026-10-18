/** WEB applications are recorded in the existing member-master workbook.
 * The active-member tab is not updated before verified payment/acceptance.
 * Deploy membership/plans.js before this file, using the same server/client rules.
 */
const NR_MEMBERSHIP = Object.freeze({
  sheet: "WEB入会申込", version: "ROUND9_2026_10_V2",
  headers: ["申込ID", "受付日時(JST)", "申込ステータス", "カード登録状態", "決済状態", "会員番号", "名前", "名前(ふりがな)", "誕生日", "ファイターネーム", "メールアドレス", "電話番号", "郵便番号", "都道府県・市区町村・町域", "番地・建物名", "住所(全て)", "店舗ID", "プランID", "会員種別", "利用開始日", "月会費", "初期費用", "グローブ代", "当月日数", "初月利用日数", "初月日割り会費", "翌月会費", "初回合計", "キャンペーンID", "継続月数", "ペア氏名", "ペア会員番号", "体験申込ID", "同意日時(JST)", "規約版", "受付キー(HMAC)", "入力照合(HMAC)", "更新日時(JST)"]
});
function nrMembershipEnabled_() { return PropertiesService.getScriptProperties().getProperty("ROUND9_MEMBERSHIP_ENABLED") === "true"; }
function nrMembershipSheet_(config) {
  const sheet = SpreadsheetApp.openById(config.masterId).getSheetByName(NR_MEMBERSHIP.sheet);
  if (!sheet) nrBookingError_("MEMBERSHIP_CONFIGURATION", "入会受付の準備中です。店舗スタッフへご確認ください。");
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
  if (headers.length !== NR_MEMBERSHIP.headers.length || headers.some(function (v, i) { return v !== NR_MEMBERSHIP.headers[i]; })) nrBookingError_("MEMBERSHIP_CONFIGURATION", "入会受付の接続設定を確認してください。");
  return sheet;
}
function nrMembershipRows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, NR_MEMBERSHIP.headers.length).getDisplayValues().map(function (values) {
    const row = {}; NR_MEMBERSHIP.headers.forEach(function (key, i) { row[key] = String(values[i] || ""); }); return row;
  });
}
function nrMembershipRequire_() { if (!nrMembershipEnabled_()) nrBookingError_("MEMBERSHIP_DISABLED", "現在、入会受付の準備中です。"); }
function nrGet9RoundMembershipStatus_(config) {
  if (!nrMembershipEnabled_()) return { accepting: false, card_registration: false };
  nrMembershipSheet_(config);
  return { accepting: NineRoundMembershipPlans.today() <= NineRoundMembershipPlans.offer.lastDate, card_registration: false };
}
function nrMembershipText_(value, limit, required, label) {
  const text = String(value || "").normalize("NFC").trim();
  if ((required && !text) || Array.from(text).length > limit || /[\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(text)) nrBookingError_("INVALID_MEMBERSHIP", label + "をご確認ください。");
  return text;
}
function nrMembershipInput_(config, body) {
  if (body.website || body.consent_terms !== true || body.consent_privacy !== true || !/^[a-f0-9]{64}$/.test(String(body.request_id || ""))) nrBookingError_("INVALID_MEMBERSHIP", "同意欄とお申込み内容をご確認ください。");
  const model = NineRoundMembershipPlans, plan = model.getPlan(body.plan_id);
  if (!plan || !model.isDate(body.start_date)) nrBookingError_("INVALID_MEMBERSHIP", "プランと利用開始日をご確認ください。");
  const p = { plan_id: plan.id, start_date: body.start_date,
    name: nrMembershipText_(body.name, 60, true, "お名前"), name_kana: nrMembershipText_(body.name_kana, 100, true, "フリガナ"),
    birth_date: String(body.birth_date || ""), fighter_name: nrMembershipText_(body.fighter_name, 24, false, "ファイターネーム"),
    email: nrBookingEmail_(body.email), phone: String(body.phone || "").normalize("NFKC").replace(/[\s()-]/g, ""),
    postal_code: String(body.postal_code || "").normalize("NFKC").replace(/[\s-]/g, ""),
    address_base: nrMembershipText_(body.address_base, 150, true, "町域までの住所"), address_detail: nrMembershipText_(body.address_detail, 150, true, "番地・建物名"),
    pair_name: plan.id === "FAMILY_PAIR" ? nrMembershipText_(body.pair_name, 60, true, "お相手のお名前") : "",
    pair_member_no: plan.id === "FAMILY_PAIR" ? String(body.pair_member_no || "").normalize("NFKC").trim() : "",
    trial_application_id: String(body.trial_application_id || "") };
  if (!/^[ァ-ヶー・\s]+$/.test(p.name_kana.normalize("NFKC")) || !model.isDate(p.birth_date) || p.birth_date >= model.today() || !/^\d{7}$/.test(p.postal_code) || (p.phone && !/^\+?\d{10,15}$/.test(p.phone)) || (p.pair_member_no && !/^\d{7}$/.test(p.pair_member_no))) nrBookingError_("INVALID_MEMBERSHIP", "フリガナ・生年月日・連絡先・会員番号をご確認ください。");
  if (config.environment === "development" && config.testEmails.indexOf(p.email) < 0) nrBookingError_("MEMBERSHIP_TEST_ONLY", "開発環境ではテスト用メールアドレスをご利用ください。");
  return p;
}
function nrMembershipMasterCampaignCount_(config) {
  const sheet = SpreadsheetApp.openById(config.masterId).getSheetByName(config.masterSheet);
  if (!sheet) nrBookingError_("MEMBERSHIP_CONFIGURATION", "会員マスターの接続設定を確認してください。");
  const data = sheet.getDataRange().getDisplayValues(), headers = data.shift() || [];
  const dateIndex = headers.indexOf("利用開始日"), campaignIndex = headers.indexOf("キャンペーン名（日本語）");
  if (dateIndex < 0 || campaignIndex < 0) nrBookingError_("MEMBERSHIP_CONFIGURATION", "会員マスターの列構成を確認してください。");
  return data.filter(function (row) {
    const date = String(row[dateIndex] || "").replace(/[\/年月]/g, "-");
    return /^2026-0?10-/.test(date) && /プレミアム\s*(One|Half)/i.test(String(row[campaignIndex] || ""));
  }).length;
}
function nrMembershipReceipt_(row) {
  return { application_id: row["申込ID"], status: row["申込ステータス"], card_registration: false, payment_status: row["決済状態"], quote: NineRoundMembershipPlans.quote(row["プランID"], row["利用開始日"]) };
}
function nrCreate9RoundMembershipApplication_(config, body) {
  nrMembershipRequire_();
  const input = nrMembershipInput_(config, body);
  return nrBookingLocked_(function () {
    const sheet = nrMembershipSheet_(config), rows = nrMembershipRows_(sheet);
    const requestKey = nrBookingHash_(config, "membership-request:" + body.request_id), digest = nrBookingHash_(config, "membership-input:" + JSON.stringify(input));
    const old = rows.find(function (r) { return r["受付キー(HMAC)"] === requestKey; });
    if (old) {
      if (old["入力照合(HMAC)"] !== digest) nrBookingError_("MEMBERSHIP_REQUEST_CHANGED", "送信済みの内容と異なります。入力内容を修正してから再度お進みください。");
      return nrMembershipReceipt_(old);
    }
    const model = NineRoundMembershipPlans, plan = model.getPlan(input.plan_id);
    if (!model.validStart(input.start_date, model.today())) nrBookingError_("MEMBERSHIP_DATE", "本日から2026年10月31日までの利用開始日をお選びください。");
    if (input.trial_application_id) nrTrialSelect_(config, { application_id: input.trial_application_id, trial_token: body.trial_token }, null);
    if (rows.some(function (r) { return r["メールアドレス"] === input.email && ["取消", "却下"].indexOf(r["申込ステータス"]) < 0; })) nrBookingError_("MEMBERSHIP_ALREADY_RECEIVED", "このメールアドレスでのお申込みは受付済みです。変更をご希望の場合は店舗スタッフへご連絡ください。");
    if (plan.campaign) {
      // Count both plans under one lock, including paper applications already in the master.
      // A linked active-member row and its application count once after a future verified payment integration.
      const used = nrMembershipMasterCampaignCount_(config) + rows.filter(function (r) { return r["キャンペーンID"] === model.offer.id && !r["会員番号"] && ["取消", "却下"].indexOf(r["申込ステータス"]) < 0; }).length;
      if (used >= model.offer.campaignLimit) nrBookingError_("MEMBERSHIP_CAMPAIGN_FULL", "プレミアムOne・Halfのキャンペーン受付枠は満員です。ほかのプランをご確認いただくか、店舗スタッフへご相談ください。");
    }
    const quote = model.quote(input.plan_id, input.start_date), now = new Date().toISOString(), id = nrBookingOpaque_();
    // The master workbook has a different timezone. Persist explicit JST text, never ambiguous serial dates.
    const jst = new Date(Date.parse(now) + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19) + " +09:00";
    const row = Object.fromEntries(NR_MEMBERSHIP.headers.map(function (key) { return [key, ""]; }));
    Object.assign(row, { "申込ID": id, "受付日時(JST)": jst, "申込ステータス": "内容確認待ち", "カード登録状態": "未登録", "決済状態": "未決済",
      "名前": input.name, "名前(ふりがな)": input.name_kana, "誕生日": input.birth_date, "ファイターネーム": input.fighter_name,
      "メールアドレス": input.email, "電話番号": input.phone, "郵便番号": input.postal_code, "都道府県・市区町村・町域": input.address_base, "番地・建物名": input.address_detail, "住所(全て)": input.address_base + input.address_detail,
      "店舗ID": "soga", "プランID": plan.id, "会員種別": plan.name, "利用開始日": input.start_date, "月会費": plan.monthly, "初期費用": plan.initial,
      "グローブ代": plan.gloves, "当月日数": quote.daysInMonth, "初月利用日数": quote.remainingDays, "初月日割り会費": quote.firstMonthFee, "翌月会費": quote.nextMonthFee, "初回合計": quote.total,
      "キャンペーンID": plan.campaign ? model.offer.id : "", "継続月数": plan.months, "ペア氏名": input.pair_name, "ペア会員番号": input.pair_member_no,
      "体験申込ID": input.trial_application_id, "同意日時(JST)": jst, "規約版": NR_MEMBERSHIP.version, "受付キー(HMAC)": requestKey, "入力照合(HMAC)": digest, "更新日時(JST)": jst });
    const values = NR_MEMBERSHIP.headers.map(function (header) { if (typeof row[header] === "number") return row[header]; const value = String(row[header]); return /^[=+@-]/.test(value) ? "'" + value : value; });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length).setNumberFormat("@").setValues([values]);
    sheet.getRange(sheet.getLastRow(), 21, 1, 8).setNumberFormat("#,##0");
    return nrMembershipReceipt_(row);
  });
}
function nrMembershipHandlers_() { return { get9RoundMembershipStatus: nrGet9RoundMembershipStatus_, create9RoundMembershipApplication: nrCreate9RoundMembershipApplication_ }; }
