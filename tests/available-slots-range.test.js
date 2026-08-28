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
  getAvailableSlots(params) {
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

const callCount = calls.length;
const cached = context.getAvailableSlotsRange({
  service_code: "PT_DIET60",
  staff_code: "SHINDO",
  start_date: "2026-08-28",
  days: "7"
});
assert.equal(cached.ok, true);
assert.equal(calls.length, callCount);

const invalid = context.getAvailableSlotsRange({
  service_code: "PT_DIET60",
  staff_code: "SHINDO",
  start_date: "2026/08/28"
});
assert.equal(invalid.ok, false);
assert.equal(invalid.code, "START_DATE_REQUIRED");

console.log("available slots range tests passed");
