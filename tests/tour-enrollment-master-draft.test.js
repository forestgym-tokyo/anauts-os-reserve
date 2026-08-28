const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "gas", "70_TourSameDayEnrollment.gs"),
  "utf8"
);
const ui = fs.readFileSync(
  path.join(root, "admin", "admin-tour-enrollment.js"),
  "utf8"
);
const config = fs.readFileSync(
  path.join(root, "admin", "firebase-config.js"),
  "utf8"
);

assert.doesNotMatch(source, /MailApp\.sendEmail|GmailApp\.sendEmail/);
assert.doesNotMatch(source, /getStaffSchedule|loadStaffSchedule|MutationObserver|setInterval/);
assert.match(source, /GmailApp\.createDraft/);
assert.match(source, /createTourJoinWebPdf_/);
assert.match(source, /attachments:\s*\[pdfFile\.getBlob/);
assert.match(source, /【The Forest Gym】 ご入会ありがとうございました/);
assert.match(source, /本日はThe Forest Gymへご来店いただき/);
assert.match(source, /クレジットカード登録URL/);
assert.match(source, /https:\/\/lin\.ee\/w3sgJkw/);
assert.match(source, /bcc: TOUR_JOIN_ADMIN_EMAIL/);
assert.match(source, /"クレカ登録状況", "未登録"/);
assert.ok(
  source.indexOf("masterWriteStarted = true") < source.indexOf("pdfFile = createTourJoinWebPdf_"),
  "master転記をPDF・下書き作成より先に行う"
);
assert.match(source, /TOUR_JOIN_REQUIRED_HEADERS/);
assert.match(source, /"gender"/);
assert.match(source, /"Gmail下書きID"/);
assert.match(ui, /会員マスター登録、PDF作成、メール下書き作成が完了しました/);
assert.match(ui, /PDFはメール下書きに添付済みです/);
assert.match(ui, /メールは自動送信されていません/);
assert.doesNotMatch(ui, /setTimeout\(boot/);
assert.match(config, /admin-tour-enrollment\.js\?v=20260828-master-draft-v1/);

const context = {
  console,
  Date,
  encodeURIComponent,
  successResponse: data => ({ ok: true, data }),
  Utilities: {
    formatDate(date) {
      return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    }
  }
};
vm.createContext(context);
vm.runInContext(source, context);

const headers = [
  "memberNo", "name", "email", "gender", "status", "dupOk",
  "adminUnlimited", "note", "プラン", "キャンペーン", "特典",
  "スタート日", "初期費用", "初月日割り会費", "クレカ登録状況",
  "PDFファイルID", "下書き作成日時", "Gmail下書きID"
];
const map = context.makeTourJoinHeaderMap_(headers);
assert.equal(map.gender, 3);
assert.equal(map.status, 4);
assert.equal(map["プラン"], 8);
assert.equal(map["Gmail下書きID"], 17);
context.assertTourJoinHeaders_(map);

const values = [
  headers,
  ["160830", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["160829", "登録済", "used@example.com", "F", "ACT", "", "", "", "", "", "", "", "", "", "", "", "", ""]
];
assert.equal(context.findTourJoinAvailableMemberRow_(values, map), 2);

const femaleRow = values[1].slice();
context.setTourJoinValue_(femaleRow, map, "gender", "");
context.setTourJoinValue_(femaleRow, map, "status", "ACT");
context.setTourJoinValue_(femaleRow, map, "プラン", "REGULAR");
assert.equal(femaleRow[3], "");
assert.equal(femaleRow[4], "ACT");
assert.equal(femaleRow[8], "REGULAR");

assert.throws(
  () => context.assertTourJoinEmailAvailable_(values, map, "USED@example.com"),
  /既に会員マスター/
);

const cp = context.getTourJoinPlanInfo_("CP_REG");
assert.equal(cp.monthlyFee, 4950);
assert.equal(context.getTourJoinBenefit_(cp, "SECOND_MONTH_FREE"), "2か月目会費無料");
assert.equal(context.makeTourJoinMemberId_("平日DAY", "160830"), "FWD160830");
assert.equal(context.makeTourJoinMemberId_("NIGHT365", "160830"), "NGT160830");
assert.equal(context.makeTourJoinMemberId_("REGULAR", "160830"), "FRG160830");

const body = context.buildTourJoinCustomerDraftBody_(
  "川上 一郎",
  "160828",
  "FRG160828",
  cp,
  "2か月目会費無料",
  new Date(2026, 7, 25, 12, 0, 0),
  { initialAmount: 1117 }
);
assert.match(body, /^川上 一郎様/);
assert.match(body, /会員番号：FRG160828/);
assert.match(body, /プラン：キャンペーン レギュラー/);
assert.match(body, /ご利用開始日：2026\/8\/25/);
assert.match(body, /キャンペーン特典：2か月目会費無料/);
assert.match(body, /初回決済額：1,117円/);
assert.match(body, /subscription\/apply\/17643/);
assert.match(body, /会員番号の6桁の数字「160828」/);

console.log("tour enrollment master and draft tests passed");
