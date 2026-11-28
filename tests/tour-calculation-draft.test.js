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

function fixture(today = "2026-11-09") {
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
      const id = `test-pdf-${files.length + 1}`;
      const file = {pdf, getId: () => id, setTrashed: value => { file.trashed = value; }};
      files.push(file);
      return file;
    }},
    GmailApp: {createDraft(to, subject, body, options) {
      const id = `test-draft-${drafts.length + 1}`;
      const draft = {to, subject, body, options, getId: () => id,
        getMessage: () => ({getId: () => id + "-message"}), deleteDraft: () => { draft.deleted = true; }};
      drafts.push(draft);
      return draft;
    }}
  });
  for (const file of ["admin/campaign-calculation-rules.js", "gas/70_TourSameDayEnrollment.gs", "gas/96_TourEnrollmentCompletion.gs"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, {filename: file});
  }

  function request({payment = "bank", created = today, start = today,
      benefit = "パーソナル無料", plan = "キャンペーンNIGHT365"} = {}) {
    const fields = {created, start, method: payment === "card" ? "クレジット" : "口座振替",
      plan, enrollment: "WEB／見学日入会", benefit};
    const calc = rules.calculateTourEnrollment(fields, start.slice(0, 7), true);
    return {reservation_id: "test-booking", confirmed_email: reservation.customer_email, payment_method: payment,
      created_date: created, start_date: start, plan_code: rules.tourPlanCodes[plan], benefit_code: rules.tourBenefitCodes[benefit] || "",
      consent_confirmed: true, card_registered: payment === "card", first_month_fee: calc.rows[22][1],
      receipts: (calc.receiptFees || []).map(({row, amount}) => ({row, amount}))};
  }
  return {context, reservation, values, drafts, files, layout, request,
    create: (body, fromForm = false) => context.createTourEnrollmentCalculationDraft(body, {staff_code: "TEST"}, fromForm).data};
}

test("口座振替は入会日が8日までなら初月分、9日以降なら初月と翌月分を受領する", () => {
  const fields = {...rules.defaults, plan: "キャンペーンNIGHT365", created: "2026-11-27", start: "2026-11-27"};
  const card = rules.calculate(fields, "2026-11");
  assert.deepEqual(rules.calculateTourEnrollment(fields, "2026-11", true), card);
  assert.deepEqual(card.rows[22].slice(1, 3), [440, "2026-11-28"]);
  assert.deepEqual(card.rows[23].slice(1, 3), [3300, "2026-11-28"]);
  const bank = {...fields, method: "口座振替", created: "2026-11-09", start: "2026-11-20"};
  const before = rules.calculateTourEnrollment({...bank, created: "2026-11-08"}, "2026-11", true);
  assert.deepEqual(before.receiptFees.map(({row}) => row), [22]);
  assert.deepEqual(before.rows[22].slice(1), [1210, "2026-11-08", "店頭で受領済み"]);
  assert.equal(before.rows[23][2], "2026-11-27");
  assert.equal(before.rows[23][3], "通常決済サイクル");
  assert.deepEqual(before.rows[24], []);
  const paid = rules.calculateTourEnrollment(bank, "2026-11", true);
  assert.deepEqual(paid.rows[22].slice(1), [1210, "2026-11-09", "店頭で受領済み"]);
  assert.deepEqual(paid.rows[23].slice(1), [3300, "2026-11-09", "店頭で受領済み"]);
  assert.equal(paid.rows[24][2], "2026-12-27");
  assert.equal(rules.calculateTourEnrollment(bank, "2026-11").rows[23][3], "ご入会日店頭払い");
  const free = rules.calculateTourEnrollment({...bank, benefit: "2か月目会費無料"}, "2026-11", true);
  assert.deepEqual(free.receiptFees.map(({row}) => row), [22]);
  assert.equal(free.rows[23][1], 0);
  const early = rules.calculateTourEnrollment({...bank, created: "2026-11-27", start: "2026-12-01"}, "2026-12", true);
  assert.deepEqual(early.receiptFees.map(({row}) => row), [22]);
  assert.equal(early.rows[22][2], "2026-11-27");
  assert.equal(early.rows[23][2], "2026-12-27");
  const december = rules.calculateTourEnrollment({...bank, created: "2026-12-09", start: "2026-12-20"}, "2026-12", true);
  assert.deepEqual(december.receiptFees.map(({row}) => row), [22, 23]);
  assert.deepEqual(december.rows[23].slice(1), [3300, "2026-12-09", "店頭で受領済み"]);
});

test("最小の空き番号でマスターを登録し、同じ予約の下書きは1件作成する", () => {
  const {context, values, drafts, files, layout, request, create} = fixture();
  const body = request();
  assert.equal(context.getTourEnrollmentCalculation(body).data.status, "new");
  assert.equal(create(body).member_id, "NGT000012");
  assert.equal(values[2][0], "000012");
  assert.equal(values[2][4], "ACT");
  assert.equal(values[2][14], "未登録");
  assert.match(values[2][7], /11月会費受領済=2420円 \/ 12月会費受領済=3300円/);
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

test("既に本人が登録された予約でも家族と友達を個別に登録し、登録済みの方を重複させない", () => {
  const {context, reservation, drafts, files, values, layout, request, create} = fixture();
  const representative = create(request());
  // Deployed versions before the enrollment form did not record the applicant type.
  const oldNote = values[2][7];
  const prefix = "TOUR_CALC_COMPLETION=";
  const details = JSON.parse(decodeURIComponent(oldNote.split(prefix)[1]));
  delete details.enrollmentType;
  values[2][7] = oldNote.split(prefix)[0] + prefix + encodeURIComponent(JSON.stringify(details));

  const family = {...request({payment: "card", plan: "キャンペーン平日DAY"}),
    enrollment_type: "FAMILY", customer_name: "家族　テスト", customer_email: "FAMILY@example.invalid",
    customer_phone: "0123-45-6789", customer_address: "八千代市　テスト住所"};
  assert.throws(() => create({...family, card_registered: false}, true), /クレカ登録/);
  assert.throws(() => create({...family, enrollment_type: "SELF"}, true), /ご本人は登録済み/);
  assert.equal(create(family, true).member_id, "FWD000013");
  assert.equal(drafts[1].to, "family@example.invalid");
  assert.equal(drafts[1].options.attachments[0].name, "計算書／家族　テストさま.pdf");
  const familyPdf = layout["B1:F38"].setValues[0];
  assert.equal(familyPdf[1][1], "FWD000013");
  assert.equal(familyPdf[21][3], "初月会費は入会日翌日決済");
  assert.match(values[1][7], /入会区分=家族.*電話番号=0123-45-6789.*住所=八千代市　テスト住所/);
  assert.equal(values[1][14], "登録済");
  assert.equal(values[1][18], "クレジット");

  const friend = {...request({plan: "レギュラー", benefit: ""}),
    enrollment_type: "FRIEND", customer_name: "友達テスト", customer_email: "friend@example.invalid",
    customer_phone: "0123-45-6710", customer_address: "八千代市　別の住所"};
  assert.throws(() => create({...friend, receipts: friend.receipts.slice(0, 1)}, true), /受領/);
  assert.equal(create(friend, true).member_id, "FRG000020");
  assert.equal(drafts[2].to, friend.customer_email);
  const friendPdf = layout["B1:F38"].setValues[0];
  assert.equal(friendPdf[21][3], "店頭で受領済み");
  assert.equal(friendPdf[22][3], "店頭で受領済み");
  assert.equal(values[7][18], "口座振替");
  assert.match(values[7][7], /入会区分=友達.*11月会費受領済=.*12月会費受領済=/);

  assert.equal(create({...family, customer_name: "家族 テスト"}, true).already_created, true);
  assert.equal(create(friend, true).member_id, "FRG000020");
  assert.equal(context.getTourEnrollmentCalculation(request()).data.member_id, representative.member_id);
  assert.equal(values[2][2], reservation.customer_email);
  assert.equal(drafts.length, 3);
  assert.equal(files.length, 3);
});

test("予約の連絡先が空欄でも、入会手続きに入力されたご本人の情報で作成する", () => {
  const {reservation, drafts, request, create} = fixture("2026-11-28");
  reservation.customer_name = reservation.customer_email = "";
  const body = {...request({payment: "card", start: "2026-12-01"}),
    enrollment_type: "SELF", customer_name: "ご本人テスト", customer_email: "self@example.invalid",
    customer_phone: "0123-45-6712", customer_address: "八千代市 テスト"};
  assert.throws(() => create({...body, customer_email: "other@example.com,self@example.invalid"}, true), /メールアドレス/);
  assert.equal(create(body, true).member_id, "NGT000012");
  assert.equal(drafts[0].to, body.customer_email);
  assert.match(drafts[0].body, /2026年末感謝プラスキャンペーン/);
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

test("会員マスターへの書き込みを共通ロックの解除前に確定する", () => {
  const {context} = fixture();
  const events = [];
  context.TfgMembershipNumbers = {withMemberNumberLock(callback) {
    events.push("lock");
    try { return callback(); }
    finally { events.push("unlock"); }
  }};
  context.SpreadsheetApp.flush = () => events.push("flush");
  const result = context.withTfgMemberNumberLock_(() => {
    events.push("master write");
    return "draft";
  });
  assert.equal(result, "draft");
  assert.deepEqual(events, ["lock", "master write", "flush", "unlock"]);
});

test("再デプロイ時に同じライブラリを再利用し、既存の依存関係を保持する", async () => {
  const {addTfgMemberNumberLibrary} = await import("../scripts/tfg-membership-lock-release.mjs");
  const original = {dependencies: {enabledAdvancedServices: [{userSymbol: "Calendar"}]}};
  const library = {userSymbol: "TfgMembershipNumbers", libraryId: "test-only", version: "1", developmentMode: false};
  const staged = addTfgMemberNumberLibrary(original, library);
  assert.deepEqual(staged.dependencies.enabledAdvancedServices, original.dependencies.enabledAdvancedServices);
  assert.deepEqual(staged.dependencies.libraries, [library]);
  assert.equal(addTfgMemberNumberLibrary(staged, library), staged);
  assert.throws(() => addTfgMemberNumberLibrary(staged, {...library, version: "2"}), /binding differs/);
});
