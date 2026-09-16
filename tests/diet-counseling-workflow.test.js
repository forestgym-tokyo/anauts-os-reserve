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
    { staff_code: "OTHER", staff_name: "他スタッフ", role: "STAFF", active: true, can_counsel: true }
  ],
  staff_shifts: [
    { staff_code: "KAWAKAMI", store_code: "YACHIYO", date: "2026-09-20", start_time: "09:00", end_time: "12:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "HEAD_OFFICE", date: "2026-09-21", start_time: "09:00", end_time: "12:00", active: true },
    { staff_code: "OTHER", store_code: "SOGA", date: "2026-09-20", start_time: "09:00", end_time: "12:00", active: true }
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

const officeOnline = context.getDietCounselingAvailableSlotsRange_({
  service_code: "COUNSEL",
  consultation_method: "ONLINE",
  start_date: "2026-09-21",
  days: 1
});
assert.equal(officeOnline.data.results[0].data.slots.length, 1);
assert.deepEqual(
  JSON.parse(JSON.stringify(officeOnline.data.results[0].data.slots[0].available_locations)),
  ["HEAD_OFFICE"]
);

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
    diet_experience_method: "糖質制限と週2回の運動",
    diet_experience_result: "体重が5kg減少"
  })
);
assert.equal(structuredDietRecord["ダイエット経験時期"], "2025年4月から3か月間");
assert.equal(structuredDietRecord["ダイエット方法"], "糖質制限と週2回の運動");
assert.equal(structuredDietRecord["ダイエット成果"], "体重が5kg減少");
assert.equal(
  structuredDietRecord["ダイエット期間・方法"],
  "時期・期間：2025年4月から3か月間\n方法：糖質制限と週2回の運動\n成果：体重が5kg減少"
);
assert.equal(context.calculateDietCounselingSleepHours_("00:30", "06:30"), 6);
assert.equal(context.calculateDietCounselingSleepHours_("23:30", "06:30"), 7);

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

console.log("diet counseling workflow tests passed");
