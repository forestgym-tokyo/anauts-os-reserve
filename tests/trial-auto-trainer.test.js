const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const storeAwareSource = fs.readFileSync(
  path.join(root, "gas", "60_StoreAwareAssignment.gs"),
  "utf8"
);
const trialSource = fs.readFileSync(
  path.join(root, "gas", "73_TrialAutoTrainer.gs"),
  "utf8"
);
const personalSource = fs.readFileSync(
  path.join(root, "assets", "js", "personal-v54.js"),
  "utf8"
);
const reserveSource = fs.readFileSync(
  path.join(root, "assets", "js", "reserve.js"),
  "utf8"
);
const trialHtml = fs.readFileSync(
  path.join(root, "trial", "index.html"),
  "utf8"
);

const dates = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(Date.UTC(2030, 0, 7 + index));
  return date.toISOString().slice(0, 10);
});
const shifts = [];
dates.forEach((date) => {
  shifts.push(
    { staff_code: "TANAKA", store_code: "SOGA", date, start_time: "09:00", end_time: "12:00", active: true },
    { staff_code: "SHINDO", store_code: "OTHER", date, start_time: "09:00", end_time: "12:00", active: true },
    { staff_code: "YOSHIMARU", store_code: "SOGA", date, start_time: "09:00", end_time: "12:00", active: true },
    { staff_code: "WRONG_ROLE", store_code: "YACHIYO", date, start_time: "09:00", end_time: "12:00", active: true }
  );
});
shifts.push({
  staff_code: "YOSHIMARU",
  store_code: "SOGA",
  date: dates[0],
  start_time: "14:00",
  end_time: "15:00",
  active: true
});

const tables = {
  services: [{
    service_code: "PT_TRIAL60",
    service_name: "無料体験パーソナル",
    category: "PERSONAL",
    provider_role: "TRAINER",
    calendar_code: "PERSONAL",
    duration: 60,
    slot_interval_minutes: 60,
    booking_min_hours: 0,
    public_days: 5000,
    active: true
  }],
  service_hours: [{
    service_code: "PT_TRIAL60",
    day_of_week: "ALL",
    start_time: "09:00",
    end_time: "12:00",
    active: true
  }, {
    service_code: "PT_TRIAL60",
    day_of_week: "ALL",
    start_time: "14:00",
    end_time: "15:00",
    active: true
  }],
  staff: [
    { staff_code: "TANAKA", role: "TRAINER", active: true, can_personal: false },
    { staff_code: "SHINDO", role: "TRAINER", active: true, can_personal: false },
    { staff_code: "YOSHIMARU", role: "TRAINER", active: true, can_personal: false },
    { staff_code: "WRONG_ROLE", role: "STAFF", active: true, can_personal: true },
    { staff_code: "OTHER_TRAINER", role: "TRAINER", active: true, can_personal: true }
  ],
  staff_shifts: shifts,
  reservations: [{
    reservation_id: "R_TANAKA_EARLY",
    staff_code: "TANAKA",
    reservation_date: dates[0],
    start_time: "07:00",
    end_time: "08:00",
    status: "RESERVED"
  }],
  calendars: [{
    calendar_code: "PERSONAL",
    calendar_id: "personal-calendar",
    calendar_name: "Personal"
  }]
};

const cache = new Map();
const sheetReads = {};
let calendarReads = 0;
const created = [];
const roleOnlyChecks = [];

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
  Map,
  Set,
  isFinite,
  CacheService: {
    getScriptCache() {
      return {
        get(key) { return cache.get(key) || null; },
        put(key, value) { cache.set(key, value); },
        remove(key) { cache.delete(key); }
      };
    }
  },
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty() { return "0"; },
        setProperty() {}
      };
    }
  },
  SpreadsheetApp: {
    getActiveSpreadsheet() {
      throw new Error("getSheetDataがある場合は直接シートを開かない");
    }
  },
  CalendarApp: {
    getDefaultCalendar() { return null; },
    getCalendarById(id) {
      assert.equal(id, "personal-calendar");
      return {
        getName() { return "Personal"; },
        getEvents(start, end) {
          calendarReads += 1;
          assert.ok(start instanceof Date);
          assert.ok(end instanceof Date);
          return [];
        }
      };
    }
  },
  Session: { getScriptTimeZone() { return "Asia/Tokyo"; } },
  Utilities: {
    parseDate(value) {
      return new Date(String(value).replace(" ", "T") + ":00+09:00");
    },
    formatDate(value, _timezone, format) {
      const iso = value.toISOString();
      if (format === "HH:mm") return iso.slice(11, 16);
      if (format === "yyyy-MM-dd HH:mm") return iso.slice(0, 16).replace("T", " ");
      return iso.slice(0, 10);
    }
  },
  getSheetData(name) {
    sheetReads[name] = (sheetReads[name] || 0) + 1;
    return tables[name] || [];
  },
  getAvailableSlotsRange() {
    throw new Error("無料体験は従来の日別計算へ戻してはいけない");
  },
  getAvailabilityService_() {
    return tables.services[0];
  },
  getYoshimaruMemberEligibilityState_(params) {
    if (params.member_no === "INVALID") {
      return {
        yoshimaru_eligible: false,
        validation_error: { code: "MEMBER_NOT_FOUND", message: "会員が見つかりません。" }
      };
    }
    return {
      yoshimaru_eligible: params.member_no === "FEMALE",
      validation_error: null
    };
  },
  isStaffServiceAllowed_() {
    return false;
  },
  createReservationWithTrainerPolicy_(params) {
    const staff = tables.staff.find((row) => row.staff_code === params.staff_code);
    roleOnlyChecks.push(context.isStaffServiceAllowed_(staff, tables.services[0]));
    created.push({ ...params });
    return { ok: true, data: { reservation_id: "R_NEW", staff_code: params.staff_code } };
  },
  successResponse(data) { return { ok: true, data }; },
  errorResponse(message, code, detail) { return { ok: false, message, code, detail }; }
};

vm.createContext(context);
vm.runInContext(storeAwareSource, context, { filename: "60_StoreAwareAssignment.gs" });
vm.runInContext(trialSource, context, { filename: "73_TrialAutoTrainer.gs" });

const maleRange = context.getAvailableSlotsRangeStoreAware_({
  service_code: "PT_TRIAL60",
  start_date: dates[0],
  days: 7,
  trial_auto: "1",
  yoshimaru_allowed: "false",
  staff_code: "YOSHIMARU"
});
assert.equal(maleRange.ok, true);
assert.equal(maleRange.data.results.length, 7);
assert.equal(calendarReads, 1, "7日分でもCalendarApp.getEventsは1回だけ呼ぶ");
assert.deepEqual(
  sheetReads,
  { services: 1, service_hours: 1, staff: 1, staff_shifts: 1, calendars: 1 },
  "7日分でも必要なシートは各1回だけ読む"
);
assert.deepEqual(
  maleRange.data.results[0].data.slots[0].staff_candidates.map((row) => row.staff_code),
  ["TANAKA", "SHINDO"],
  "男性・性別不明は田中・進藤だけを候補にする"
);
assert.equal(
  maleRange.data.results[0].data.slots.some((slot) => slot.start_time === "09:00"),
  true,
  "YACHIYO以外の勤務でも表示対象にする"
);

const cachedMaleRange = context.getAvailableSlotsRangeStoreAware_({
  service_code: "PT_TRIAL60",
  start_date: dates[0],
  days: 7,
  trial_auto: "1",
  yoshimaru_allowed: false
});
assert.equal(cachedMaleRange.ok, true);
assert.equal(calendarReads, 1, "同条件の再表示は短時間キャッシュを使う");

const femaleRange = context.getAvailableSlotsRangeStoreAware_({
  service_code: "PT_TRIAL60",
  start_date: dates[0],
  days: 7,
  trial_auto: "1",
  yoshimaru_allowed: "true"
});
assert.equal(femaleRange.ok, true);
assert.equal(calendarReads, 2);
assert.deepEqual(
  femaleRange.data.results[0].data.slots[0].staff_candidates.map((row) => row.staff_code),
  ["TANAKA", "SHINDO", "YOSHIMARU"],
  "女性は田中・進藤・吉丸を候補にする"
);

cache.clear();
const yoshimaruStaff = tables.staff.find((row) => row.staff_code === "YOSHIMARU");
yoshimaruStaff.role = "STAFF";
const roleFilteredRange = context.getAvailableSlotsRangeStoreAware_({
  service_code: "PT_TRIAL60",
  start_date: dates[0],
  days: 1,
  trial_auto: "1",
  yoshimaru_allowed: true
});
assert.deepEqual(
  roleFilteredRange.data.results[0].data.slots[0].staff_candidates.map((row) => row.staff_code),
  ["TANAKA", "SHINDO"],
  "固定コードに含まれてもrole不一致は候補にしない"
);
yoshimaruStaff.role = "TRAINER";
cache.clear();

const originalPermissionCheck = context.isStaffServiceAllowed_;
const maleCreated = context.createReservationStoreAware_({
  service_code: "PT_TRIAL60",
  member_no: "MALE",
  date: dates[0],
  start_time: "09:00",
  staff_code: "YOSHIMARU"
});
assert.equal(maleCreated.ok, true);
assert.equal(created[0].staff_code, "SHINDO", "男性は吉丸指定を無視し、田中・進藤から自動割当する");
assert.equal(roleOnlyChecks[0], true, "無料体験の固定候補は担当可否列ではなくroleで許可する");
assert.equal(context.isStaffServiceAllowed_, originalPermissionCheck, "一時的なrole限定判定は予約後に必ず戻す");

const femaleCreated = context.createReservationStoreAware_({
  service_code: "PT_TRIAL60",
  member_no: "FEMALE",
  date: dates[0],
  start_time: "14:00"
});
assert.equal(femaleCreated.ok, true);
assert.equal(created[1].staff_code, "YOSHIMARU", "女性は吉丸も自動割当候補にする");

const invalidMember = context.createReservationStoreAware_({
  service_code: "PT_TRIAL60",
  member_no: "INVALID",
  date: dates[0],
  start_time: "09:00"
});
assert.equal(invalidMember.ok, false);
assert.equal(invalidMember.code, "MEMBER_NOT_FOUND");
assert.equal(created.length, 2);

assert.match(personalSource, /if \(routeKey === "trial"\) \{\s*return fetchTrialSlotsRange_\(dates\);/);
assert.match(personalSource, /"yoshimaru_allowed"/);
assert.match(personalSource, /"trial_auto", "1"/);
assert.match(personalSource, /routeKey === "personal" && selectedTrainerCode && method === "POST"/);
assert.match(
  reserveSource,
  /service_code \|\| ""\)\.toUpperCase\(\) !== "PT_TRIAL60"\) \{\s*loadWeek\(\);/,
  "会員確認前の不要な空き枠通信を送らない"
);
assert.doesNotMatch(trialHtml, /personalTrainerChoices|トレーナーで絞り込む/);
assert.match(trialHtml, /担当トレーナーは施設側で決定します/);

console.log("trial auto trainer tests passed");
