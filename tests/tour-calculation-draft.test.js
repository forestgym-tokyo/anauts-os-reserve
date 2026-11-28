const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const rules = require("../admin/campaign-calculation-rules.js");

const root = path.resolve(__dirname, "..");
const headers = ["memberNo", "name", "email", "gender", "status", "dupOk", "adminUnlimited", "note", "プラン",
  "キャンペーン", "特典", "スタート日", "初期費用", "初月日割り会費", "クレカ登録状況", "PDFファイルID",
  "下書き作成日時", "Gmail下書きID", "支払方法", "extension"];

function fixture(today = "2026-11-27") {
  const blank = (number, extra = {}) => headers.map((field, index) => index === 0 ? number : extra[field] ?? "");
  const values = [headers, blank("000013"), blank("000012"), blank("000003", {name: "退会済み"}),
    blank("000011"), blank(11), blank("000005", {adminUnlimited: true}), blank("000020")];
  const reservation = {service_code: "TOUR", status: "RESERVED", store_code: "YACHIYO",
    customer_name: "テスト会員", customer_email: "tour@example.invalid"};
  const drafts = [];
  const files = [];
  const layout = {};
  const range = name => new Proxy({}, {
    get(_, method) {
      return (...args) => {
        layout[name] ??= {};
        layout[name][method] = args;
        return range(name);
      };
    }
  });
  const temp = {getRange: range, getSheetId: () => 1, setHiddenGridlines() {}, setRowHeights() {},
    setColumnWidth() {}, insertRowsBefore() {}, insertImage: () => range("logo")};
  const sheet = {
    getDataRange: () => ({getValues: () => values.map(row => row.slice())}),
    getRange(row, column) {
      return {
        getFormulas: () => [headers.slice(column - 1).map(name => name === "extension" ? "=1+2" : "")],
        setValues: ([data]) => { values[row - 1].splice(column - 1, data.length, ...data); }
      };
    }
  };
  const spreadsheet = {getId: () => "test-sheet", getSheetByName: () => sheet, insertSheet: () => temp,
    deleteSheet: () => { layout.deleted = true; }};
  const context = vm.createContext({
    successResponse: data => ({ok: true, data}),
    findReservationRecordForUpdate_: id => id === "test-booking" ? {record: reservation} : null,
    Utilities: {getUuid: () => "test-uuid", formatDate: () => today},
    LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
    ScriptApp: {getOAuthToken: () => "test-token"},
    SpreadsheetApp: {openById: () => spreadsheet, flush() {}, BorderStyle: {SOLID: "thin", SOLID_MEDIUM: "medium", DOUBLE: "double"}},
    MimeType: {PDF: "application/pdf"},
    UrlFetchApp: {fetch(url) {
      const blob = {
        getContentType: () => url.endsWith("png") ? "image/png" : "application/pdf",
        setName(name) { this.name = name; return this; }
      };
      return {getBlob: () => blob};
    }},
    DriveApp: {createFile(pdf) {
      const file = {pdf, getId: () => `test-pdf-${files.length}`, setTrashed: value => { file.trashed = value; }};
      files.push(file);
      return file;
    }},
    GmailApp: {createDraft(to, subject, body, options) {
      const draft = {to, subject, body, options, getId: () => "test-draft",
        getMessage: () => ({getId: () => "test-draft-message"}), deleteDraft: () => { draft.deleted = true; }};
      drafts.push(draft);
      return draft;
    }}
  });
  for (const file of ["admin/campaign-calculation-rules.js", "gas/70_TourSameDayEnrollment.gs", "gas/96_TourEnrollmentCompletion.gs"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, {filename: file});
  }

  function request({payment = "bank", created = today, start = today, benefit = "パーソナル無料"} = {}) {
    const fields = {created, start, method: payment === "card" ? "クレジット" : "口座振替",
      plan: "キャンペーンNIGHT365", enrollment: "WEB／見学日入会", benefit};
    const calc = rules.calculateTourEnrollment(fields, start.slice(0, 7), true);
    return {reservation_id: "test-booking", confirmed_email: reservation.customer_email, payment_method: payment,
      created_date: created, start_date: start, plan_code: "CP_NIGHT", benefit_code: rules.tourBenefitCodes[benefit],
      consent_confirmed: true, card_registered: payment === "card", first_month_fee: calc.rows[22][1],
      receipts: (calc.receiptFees || []).map(({row, amount}) => ({row, amount}))};
  }
  return {context, reservation, values, drafts, files, layout, request,
    create: body => context.createTourEnrollmentCalculationDraft(body, {staff_code: "TEST"}).data};
}

test("口座振替の受領は既存クレカの翌日決済明細ごとに表示する", () => {
  const fields = {...rules.defaults, plan: "キャンペーンNIGHT365", created: "2026-11-27", start: "2026-11-27"};
  const card = rules.calculate(fields, "2026-11");
  assert.deepEqual(rules.calculateTourEnrollment(fields, "2026-11", true), card);
  assert.deepEqual(card.rows[22].slice(1, 3), [440, "2026-11-28"]);
  assert.deepEqual(card.rows[23].slice(1, 3), [3300, "2026-11-28"]);
  const bank = {...fields, method: "口座振替"};
  const paid = rules.calculateTourEnrollment(bank, "2026-11", true);
  assert.deepEqual(paid.rows[22].slice(1), [440, "2026-11-27", "店頭で受領済み"]);
  assert.deepEqual(paid.rows[23].slice(1), [3300, "2026-11-27", "店頭で受領済み"]);
  const before = rules.calculateTourEnrollment({...bank, created: "2026-11-26"}, "2026-11", true);
  assert.deepEqual(before.receiptFees.map(({row}) => row), [22]);
  assert.equal(before.rows[23][2], "2026-11-27");
  assert.equal(before.rows[23][3], "通常決済サイクル");
  const free = rules.calculateTourEnrollment({...bank, benefit: "2か月目会費無料"}, "2026-11", true);
  assert.deepEqual(free.receiptFees.map(({row}) => row), [22]);
  assert.equal(free.rows[23][1], 0);
  const early = rules.calculateTourEnrollment({...bank, start: "2026-12-01"}, "2026-12", true);
  assert.deepEqual(early.receiptFees.map(({row}) => row), [22]);
  assert.equal(early.rows[23][2], "2026-12-27");
});

test("最小の空き番号でマスターを登録し、同じ予約の下書きは1件作成する", () => {
  const {context, values, drafts, files, layout, request, create} = fixture();
  const body = request();
  assert.equal(context.getTourEnrollmentCalculation(body).data.status, "new");
  assert.equal(create(body).member_id, "NGT000012");
  assert.equal(values[2][0], "000012");
  assert.equal(values[2][4], "ACT");
  assert.equal(values[2][14], "未登録");
  assert.match(values[2][7], /11月会費受領済=440円 \/ 12月会費受領済=3300円/);
  assert.equal(values[2][19], "=1+2");
  assert.equal(drafts[0].to, "tour@example.invalid");
  assert.equal(drafts[0].subject, "【The Forest Gym】ご入会手続き完了のお知らせ");
  assert.match(drafts[0].body, /会員ID\nNGT000012/);
  assert.equal(drafts[0].options.attachments[0].name, "計算書／テスト会員さま.pdf");
  const pdfRows = layout["B1:F38"].setValues[0];
  assert.equal(pdfRows[0][1], "テスト会員 さま");
  assert.equal(pdfRows[1][1], "NGT000012");
  assert.equal(pdfRows[21][3], "店頭で受領済み");
  assert.equal(pdfRows[22][3], "店頭で受領済み");
  assert.notEqual(layout["B1:F38"].setBackgrounds[0][21][0], layout["B1:F38"].setBackgrounds[0][22][0]);
  assert.equal(layout["B1:C2"].setBorder[5], true);
  assert.equal(layout.deleted, true);
  assert.equal(create(body).status, "draft");
  assert.equal(drafts.length, 1);
  assert.equal(files.length, 1);
});

test("未確認の同意、クレカ登録、各月の受領、および異なる宛先で登録しない", () => {
  const {reservation, drafts, files, values, request, create} = fixture();
  assert.throws(() => create({...request(), consent_confirmed: false}), /同意/);
  assert.throws(() => create({...request({payment: "card"}), card_registered: false}), /クレカ登録/);
  assert.throws(() => create({...request(), receipts: request().receipts.slice(0, 1)}), /受領/);
  assert.throws(() => create({...request(), confirmed_email: "wrong@example.invalid"}), /メールアドレス/);
  reservation.status = "CANCELLED";
  assert.throws(() => create(request()), /有効な見学予約/);
  assert.equal(drafts.length, 0);
  assert.equal(files.length, 0);
  assert.equal(values[2][4], "");
});

test("PDF作成中に空き番号が使用されたら作成を中止し、元の会員を上書きしない", () => {
  const {context, drafts, files, values, request, create} = fixture();
  const createDraft = context.GmailApp.createDraft;
  context.GmailApp.createDraft = (...args) => {
    values[2][1] = "別の登録";
    values[2][4] = "ACT";
    return createDraft(...args);
  };
  assert.throws(() => create(request()), /空き会員番号が更新/);
  assert.equal(values[2][1], "別の登録");
  assert.equal(drafts[0].deleted, true);
  assert.equal(files[0].trashed, true);
});
