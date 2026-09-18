const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "gas", "88_DietCounselingWorkflow.gs"),
  "utf8"
);

const tables = {
  services: [{
    service_code: "COUNSEL",
    store_code: "YACHIYO",
    duration: 60,
    provider_role: "TRAINER,STAFF"
  }],
  staff: [
    { staff_code: "KAWAKAMI", staff_name: "川上一郎", role: "STAFF", active: true, can_counsel: true },
    { staff_code: "OTHER", staff_name: "他スタッフ", role: "STAFF", active: true, can_counsel: false }
  ],
  staff_shifts: [
    { staff_code: "KAWAKAMI", store_code: "YACHIYO", date: "2026-09-20", start_time: "09:00", end_time: "12:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "HEAD_OFFICE", date: "2026-09-21", start_time: "19:00", end_time: "23:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "YACHIYO", date: "2026-09-22", start_time: "09:00", end_time: "18:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "HEAD_OFFICE", date: "2026-09-22", start_time: "19:00", end_time: "23:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "YACHIYO", date: "2026-09-23", start_time: "12:00", end_time: "20:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "HEAD_OFFICE", date: "2026-09-23", start_time: "19:00", end_time: "23:00", active: true },
    { staff_code: "OTHER", store_code: "HEAD_OFFICE", date: "2026-09-21", start_time: "19:00", end_time: "23:00", active: true }
  ],
  reservations: []
};

const context = {
  console,
  Date,
  JSON,
  Math,
  Number,
  Object,
  Array,
  String,
  RegExp,
  Error,
  isFinite,
  encodeURIComponent,
  PropertiesService: {
    getScriptProperties() {
      return { getProperty() { return null; } };
    }
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    getUuid() { return "12345678-1234-1234-1234-123456789abc"; },
    computeDigest() { return Array.from({ length: 32 }, (_, index) => index); },
    formatDate(date, _zone, format) {
      const iso = date.toISOString();
      if (format === "yyyy-MM-dd") return iso.slice(0, 10);
      if (format === "HH:mm") return iso.slice(11, 16);
      return iso;
    }
  },
  readStoreAwareSheet_(name) {
    return tables[name] || [];
  },
  runStoreAwareWithRequestSheetCache_(callback) { return callback(); },
  getAvailableSlotsRange(params) {
    return {
      ok: true,
      data: {
        results: [{
          ok: true,
          data: {
            date: params.start_date,
            slots: [{ date: params.start_date, start_time: "10:00", end_time: "11:00" }]
          }
        }]
      }
    };
  },
  successResponse(data) { return { ok: true, data }; },
  errorResponse(message, code, data) { return { ok: false, message, code, data }; }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: "88_DietCounselingWorkflow.gs" });

assert.equal(context.normalizeDietCounselingMethod_(""), "ONLINE");
assert.equal(context.normalizeDietCounselingMethod_("ONLINE"), "ONLINE");
assert.equal(context.normalizeDietCounselingMethod_("対面"), "IN_PERSON");
assert.equal(context.isDietCounselingStaffAllowed_({ can_counsel: true }), true);
assert.equal(context.isDietCounselingStaffAllowed_({ can_counsel: false }), false);
assert.equal(context.isDietCounselingStaffAllowed_({ can_counsel: "" }), false);
assert.equal(
  context.normalizeDietCounselingSubmissionKey_("dcr-1234567890abcdef"),
  "DCR-1234567890ABCDEF"
);
assert.equal(context.normalizeDietCounselingSubmissionKey_("invalid"), "");
assert.equal(
  context.getDietCounselingSubmissionMarker_("DCR-1234567890ABCDEF"),
  "【申込照合ID】DCR-1234567890ABCDEF"
);

context.readDietCounselingReservationRows_ = () => [{
  reservation_id: "R-COUNSEL-TEST",
  service_code: "COUNSEL",
  reservation_date: "2026-09-21",
  start_time: "19:00",
  end_time: "20:00",
  status: "CONFIRMED",
  note: "【実施方法】ONLINE\n【申込照合ID】DCR-1234567890ABCDEF"
}];
const confirmedReservation = context.getDietCounselingReservationStatus_({
  submission_key: "DCR-1234567890ABCDEF"
});
assert.equal(confirmedReservation.ok, true);
assert.equal(confirmedReservation.data.found, true);
assert.equal(confirmedReservation.data.reservation_id, "R-COUNSEL-TEST");
assert.equal(confirmedReservation.data.date, "2026-09-21");
assert.equal(confirmedReservation.data.consultation_method, "ONLINE");

const gymOnline = context.getDietCounselingAvailableSlotsRange_({
  service_code: "COUNSEL",
  consultation_method: "ONLINE",
  start_date: "2026-09-20",
  days: 1
});
assert.equal(gymOnline.data.results[0].data.slots.length, 1);
assert.deepEqual(
  JSON.parse(JSON.stringify(gymOnline.data.results[0].data.slots[0].available_locations)),
  ["YACHIYO"]
);
assert.equal(
  gymOnline.data.results[0].data.slots[0].online_only,
  false,
  "八千代シフト中はONLINE専用ではなく、対面とONLINEの両方に対応する"
);

const gymInPerson = context.getDietCounselingAvailableSlotsRange_({
  service_code: "COUNSEL",
  consultation_method: "IN_PERSON",
  start_date: "2026-09-20",
  days: 1
});
assert.equal(gymInPerson.data.results[0].data.slots[0].start_time, "10:00");
assert.deepEqual(
  JSON.parse(JSON.stringify(gymInPerson.data.results[0].data.slots[0].available_locations)),
  ["YACHIYO"],
  "八千代シフト中は同じ時間を対面でも表示する"
);

const officeOnline = context.getDietCounselingAvailableSlotsRange_({
  service_code: "COUNSEL",
  consultation_method: "ONLINE",
  start_date: "2026-09-21",
  days: 1
});
assert.equal(officeOnline.data.results[0].data.slots.length, 7);
assert.deepEqual(
  JSON.parse(JSON.stringify(officeOnline.data.results[0].data.slots.find((slot) => slot.start_time === "19:00").available_locations)),
  ["HEAD_OFFICE"],
  "本社ONLINE枠はstaff_shiftsのHEAD_OFFICE勤務だけを使う"
);
assert.equal(
  officeOnline.data.results[0].data.slots.find((slot) => slot.start_time === "22:00").end_time,
  "23:00",
  "ONLINE専用枠は22時開始・23時終了まで表示する"
);
assert.equal(
  officeOnline.data.results[0].data.slots.find((slot) => slot.start_time === "22:00").online_only,
  true
);
assert.equal(
  officeOnline.data.results[0].data.slots.every((slot) => slot.available_staff_count === 1),
  true,
  "can_counselがTRUEの川上だけを担当候補にする"
);

const officeReservationParams = context.buildDietCounselingReservationParams_(
  { service_code: "COUNSEL", note: "ご要望" },
  tables.services[0],
  { staff_code: "KAWAKAMI", location_code: "HEAD_OFFICE" },
  "ONLINE",
  "DCR-1234567890ABCDEF"
);
assert.equal(officeReservationParams.staff_code, "KAWAKAMI");
assert.equal(
  officeReservationParams.store_code,
  "HEAD_OFFICE",
  "予約保存時も本社シフトと同じ店舗コードで共通シフト判定を通す"
);
assert.match(officeReservationParams.note, /【実施方法】ONLINE/);
assert.match(officeReservationParams.note, /【担当者所在場所】本社事務所/);
assert.match(officeReservationParams.note, /【申込照合ID】DCR-1234567890ABCDEF/);

const officeInPerson = context.getDietCounselingAvailableSlotsRange_({
  service_code: "COUNSEL",
  consultation_method: "IN_PERSON",
  start_date: "2026-09-21",
  days: 1
});
assert.equal(
  officeInPerson.data.results[0].data.slots.length,
  0,
  "本社事務所勤務は対面枠に含めてはいけない"
);

const movedOnline = context.getDietCounselingAvailableSlotsRange_({
  service_code: "COUNSEL",
  consultation_method: "ONLINE",
  start_date: "2026-09-22",
  days: 1
});
assert.deepEqual(
  JSON.parse(JSON.stringify(movedOnline.data.results[0].data.slots.map((slot) => slot.start_time))),
  ["10:00", "20:30", "21:00", "21:30", "22:00"],
  "18時シフト終了日は移動2時間30分後の20時30分からONLINE専用枠を出す"
);
assert.equal(
  movedOnline.data.results[0].data.slots.find((slot) => slot.start_time === "20:30").online_only,
  true
);

const noEveningOnline = context.getDietCounselingAvailableSlotsRange_({
  service_code: "COUNSEL",
  consultation_method: "ONLINE",
  start_date: "2026-09-23",
  days: 1
});
assert.equal(
  noEveningOnline.data.results[0].data.slots.length,
  1,
  "20時までThe Forest Gym勤務中の19時枠はONLINE対応できる"
);
assert.equal(noEveningOnline.data.results[0].data.slots[0].start_time, "19:00");
assert.deepEqual(
  JSON.parse(JSON.stringify(noEveningOnline.data.results[0].data.slots[0].available_locations)),
  ["YACHIYO"],
  "移動時間後が最終受付を超えるためONLINE専用枠は追加しない"
);
assert.equal(noEveningOnline.data.results[0].data.slots[0].online_only, false);

assert.equal(context.calculateDietCounselingBmi_(165, 78), 28.7);
assert.equal(
  context.calculateDietCounselingBmr_("男性", 37, 165, 78),
  1715,
  "添付PDFと同じ改良版ハリス・ベネディクト式を使う"
);
assert.equal(
  context.calculateDietCounselingBmr_("女性", 37, 165, 78),
  1520,
  "女性も改良版ハリス・ベネディクト式で基礎代謝を算出する"
);
assert.throws(
  () => context.validateDietCounselingAnswer_({
    age: 37,
    gender: "その他・回答しない",
    height: 165,
    weight: 78,
    employment: "している",
    wake_work: "06:30",
    sleep_work: "23:30",
    wake_off: "08:00",
    sleep_off: "00:30",
    meal_count: 3,
    breakfast_menu: "あり",
    lunch_menu: "あり",
    dinner_menu: "あり",
    snack_menu: "なし",
    food_dislike: "無",
    allergy: "無",
    alcohol: "無",
    exercise_history: "無",
    current_exercise: "無",
    medical_history: "無",
    condition: "良好",
    diet_experience: "無",
    concerns: ["全体"],
    target_later: true
  }),
  /性別は男性または女性/
);
const conditionalBaseAnswers = {
  age: 37,
  gender: "男性",
  height: 165,
  weight: 78,
  employment: "している",
  wake_work: "06:30",
  sleep_work: "23:30",
  wake_off: "08:00",
  sleep_off: "00:30",
  meal_count: 3,
  breakfast_menu: "あり",
  lunch_menu: "あり",
  dinner_menu: "あり",
  snack_menu: "なし",
  food_dislike: "無",
  allergy: "無",
  alcohol: "無",
  exercise_history: "無",
  current_exercise: "無",
  medical_history: "無",
  condition: "良好",
  diet_experience: "無",
  concerns: ["全体"],
  target_later: true
};
assert.throws(
  () => context.validateDietCounselingAnswer_(Object.assign({}, conditionalBaseAnswers, {
    exercise_history: "有",
    exercise_history_detail: ""
  })),
  /運動経験の詳細/
);
assert.throws(
  () => context.validateDietCounselingAnswer_(Object.assign({}, conditionalBaseAnswers, {
    current_exercise: "有",
    current_exercise_detail: ""
  })),
  /現在の運動内容・頻度・時間/
);
assert.throws(
  () => context.validateDietCounselingAnswer_(Object.assign({}, conditionalBaseAnswers, {
    medical_history: "有",
    medical_history_detail: ""
  })),
  /既往症の詳細/
);
assert.throws(
  () => context.validateDietCounselingAnswer_(Object.assign({}, conditionalBaseAnswers, {
    diet_experience: "有",
    diet_experience_period: "",
    diet_experience_method: "糖質制限",
    diet_experience_result: "5kg減"
  })),
  /時期・期間/
);
assert.throws(
  () => context.validateDietCounselingAnswer_(Object.assign({}, conditionalBaseAnswers, {
    diet_experience: "有",
    diet_experience_period: "2025年4月から3か月間",
    diet_experience_method: "",
    diet_experience_result: "5kg減"
  })),
  /ダイエット方法/
);
assert.throws(
  () => context.validateDietCounselingAnswer_(Object.assign({}, conditionalBaseAnswers, {
    diet_experience: "有",
    diet_experience_period: "2025年4月から3か月間",
    diet_experience_method: "糖質制限",
    diet_experience_result: ""
  })),
  /ダイエットの成果/
);
const structuredDietRecord = context.buildDietCounselingAnswerRecord_(
  "DCA_DIET_TEST",
  new Date("2026-09-16T12:00:00.000Z"),
  {},
  Object.assign({}, conditionalBaseAnswers, {
    diet_experience: "有",
    diet_experience_period: "2025年4月から3か月間",
    diet_experience_method: "1日1食の置換えとオンラインヨガ30分を週2回",
    diet_experience_result: "体重が5kg減少"
  })
);
assert.equal(structuredDietRecord["ダイエット経験時期"], "2025年4月から3か月間");
assert.equal(
  structuredDietRecord["ダイエット方法"],
  "1日1食の置換えとオンラインヨガ30分を週2回"
);
assert.equal(structuredDietRecord["ダイエット成果"], "体重が5kg減少");
assert.equal(structuredDietRecord["PDF処理状態"], "PDF不要（管理画面印刷）");
assert.equal(
  structuredDietRecord["ダイエット期間・方法"],
  "時期・期間：2025年4月から3か月間\n方法：1日1食の置換えとオンラインヨガ30分を週2回\n成果：体重が5kg減少"
);
const printSheet = context.buildDietCounselingPrintSheetData_(Object.assign({}, structuredDietRecord, {
  "氏名": "テスト 太郎",
  "気になる部位": "全体、おなか周り",
  "その他の気になる部位": "首まわり",
  "朝食時間": "07:00",
  "朝食メニュー": "ごはん、みそ汁、焼き鮭"
}));
assert.equal(printSheet.name, "テスト 太郎");
assert.equal(printSheet.concerns, "全体、おなか周り、首まわり");
assert.equal(printSheet.meals[0].time, "07:00");
assert.equal(printSheet.meals[0].menu, "ごはん、みそ汁、焼き鮭");
assert.equal(
  printSheet.diet_experience_method,
  "1日1食の置換えとオンラインヨガ30分を週2回"
);
assert.equal(context.calculateDietCounselingSleepHours_("00:30", "06:30"), 6);
assert.equal(context.calculateDietCounselingSleepHours_("23:30", "06:30"), 7);

const adminAccess = context.issueDietCounselingAdminView_(
  new Date("2026-09-16T00:00:00.000Z")
);
assert.match(adminAccess.url, /\?view_token=[a-f0-9]{64}$/);
assert.equal(adminAccess.tokenHash.length, 64);
assert.equal(
  Math.round((adminAccess.expiresAt.getTime() - new Date("2026-09-16T00:00:00.000Z").getTime()) / 86400000),
  90
);

const clientAccess = context.issueDietCounselingClientView_(
  "2026-09-20",
  new Date("2026-09-16T00:00:00.000Z")
);
assert.match(clientAccess.url, /\?client_token=[a-f0-9]{64}$/);
assert.equal(clientAccess.tokenHash.length, 64);
assert.equal(
  clientAccess.expiresAt.toISOString(),
  "2026-09-21T14:59:59.000Z",
  "お客様用URLはカウンセリング翌日23:59（日本時間）まで有効にする"
);

const legacyClientExpiry = context.getDietCounselingClientViewExpiry_(
  "2026-09-01",
  new Date("2026-09-16T00:00:00.000Z")
);
assert.equal(
  legacyClientExpiry.toISOString(),
  "2026-09-17T00:00:00.000Z",
  "過去回答からの再発行でも最低24時間は閲覧できる"
);

const clientSheet = context.buildDietCounselingClientSheetData_(Object.assign({}, structuredDietRecord, {
  "回答ID": "DCA_PRIVATE",
  "予約ID": "RES_PRIVATE",
  "会員区分": "会員",
  "会員番号": "12345",
  "氏名": "テスト 太郎"
}));
assert.equal(clientSheet.name, "テスト 太郎");
assert.equal(Object.prototype.hasOwnProperty.call(clientSheet, "answer_id"), false);
assert.equal(Object.prototype.hasOwnProperty.call(clientSheet, "reservation_id"), false);
assert.equal(Object.prototype.hasOwnProperty.call(clientSheet, "member_type"), false);
assert.equal(Object.prototype.hasOwnProperty.call(clientSheet, "member_no"), false);

function createMockSheet(headers) {
  const writes = [];
  return {
    writes,
    getLastColumn() { return headers.length; },
    getLastRow() { return 1; },
    getRange(row, column, rowCount, columnCount) {
      return {
        getDisplayValues() {
          return [headers.slice(column - 1, column - 1 + columnCount)];
        },
        setValues(values) {
          writes.push({ row, column, rowCount, columnCount, values });
        }
      };
    }
  };
}

const reorderedSheet = createMockSheet(["追加列", "氏名", "回答ID"]);
const reorderedMap = context.getDietCounselingHeaderMap_(
  reorderedSheet,
  ["回答ID", "氏名"]
);
context.appendDietCounselingRecord_(reorderedSheet, reorderedMap, {
  "回答ID": "DCA_TEST",
  "氏名": "テスト 太郎"
});
assert.deepEqual(
  JSON.parse(JSON.stringify(reorderedSheet.writes[0].values[0])),
  ["", "テスト 太郎", "DCA_TEST"],
  "追加列や列順変更があっても見出し名で正しい列へ保存する"
);

assert.throws(
  () => context.getDietCounselingHeaderMap_(createMockSheet(["氏名", "氏名"]), ["氏名"]),
  /重複：氏名/
);
assert.throws(
  () => context.getDietCounselingHeaderMap_(createMockSheet(["氏名"]), ["氏名", "回答ID"]),
  /不足：回答ID/
);

const partialAnswerSheet = createMockSheet(["回答ID", "氏名", "任意の追加列"]);
const appendedHeaders = context.ensureDietCounselingAnswerHeaders_(partialAnswerSheet);
assert.ok(appendedHeaders.includes("管理閲覧URL"));
assert.ok(appendedHeaders.includes("顧客閲覧URL"));
assert.equal(partialAnswerSheet.writes[0].column, 4);
assert.deepEqual(
  JSON.parse(JSON.stringify(partialAnswerSheet.writes[0].values[0])),
  JSON.parse(JSON.stringify(appendedHeaders)),
  "既存列を動かさず、不足項目だけを末尾へ追加する"
);

console.log("diet counseling workflow tests passed");
