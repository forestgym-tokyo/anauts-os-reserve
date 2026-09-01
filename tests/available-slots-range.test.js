const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "gas", "59_YoshimaruGender.gs"),
  "utf8"
);

const cache = new Map();
const calls = [];
let sheetReads = 0;
const context = {
  console,
  CacheService: {
    getScriptCache() {
      return {
        get(key) {
          return cache.get(key) || null;
        },
        put(key, value) {
          cache.set(key, value);
        }
      };
    }
  },
  successResponse(data) {
    return { ok: true, data };
  },
  errorResponse(message, code, detail) {
    return { ok: false, message, code, detail };
  },
  getSheetData(sheetName) {
    sheetReads += 1;
    return [{ sheet_name: sheetName }];
  },
  getAvailableSlots(params) {
    context.getSheetData("services");
    context.getSheetData("services");
    calls.push({ ...params });
    return {
      getContent() {
        return JSON.stringify({
          ok: true,
          data: {
            date: params.date,
            public_days: 30,
            slots: [{ start_time: "10:00", end_time: "11:00" }]
          }
        });
      }
    };
  }
};

const originalGetSheetData = context.getSheetData;

vm.createContext(context);
vm.runInContext(source, context);

const first = context.getAvailableSlotsRange({
  service_code: "PT_DIET60",
  staff_code: "SHINDO",
  start_date: "2026-08-28",
  days: "7"
});

assert.equal(first.ok, true);
assert.equal(first.data.results.length, 7);
assert.deepEqual(
  calls.map((call) => call.date),
  [
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03"
  ]
);
assert.ok(calls.every((call) => call.staff_code === "SHINDO"));
assert.equal(sheetReads, 1, "7日分でも同じシートは1回だけ読み込む");
assert.equal(
  context.getSheetData,
  originalGetSheetData,
  "一括取得の終了後は通常のシート読込へ必ず戻す"
);

const callCount = calls.length;
const cached = context.getAvailableSlotsRange({
  service_code: "PT_DIET60",
  staff_code: "SHINDO",
  start_date: "2026-08-28",
  days: "7"
});
assert.equal(cached.ok, true);
assert.equal(calls.length, callCount);

const tourCallStart = calls.length;
const tour = context.getAvailableSlotsRange({
  service_code: "TOUR",
  start_date: "2026-09-02",
  days: "2"
});
assert.equal(tour.ok, true);
assert.equal(tour.data.results.length, 2);
assert.equal(calls.length, tourCallStart + 2);
assert.ok(
  calls.slice(tourCallStart).every((call) => !call.staff_code),
  "一般サービスの一括取得では担当者指定を必須にしない"
);

const personalWithoutTrainer = context.getAvailableSlotsRange({
  service_code: "PT_DIET60",
  start_date: "2026-09-02",
  days: "2"
});
assert.equal(personalWithoutTrainer.ok, false);
assert.equal(personalWithoutTrainer.code, "STAFF_CODE_REQUIRED");

const invalid = context.getAvailableSlotsRange({
  service_code: "PT_DIET60",
  staff_code: "SHINDO",
  start_date: "2026/08/28"
});
assert.equal(invalid.ok, false);
assert.equal(invalid.code, "START_DATE_REQUIRED");

console.log("available slots range tests passed");
