const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const policy = fs.readFileSync(
  path.join(root, "gas", "60_StoreAwareAssignment.gs"),
  "utf8"
);
const main = fs.readFileSync(path.join(root, "gas", "99_Main.gs"), "utf8");
const yoshimaru = fs.readFileSync(
  path.join(root, "gas", "59_YoshimaruGender.gs"),
  "utf8"
);

assert.match(main, /case "getAvailableSlots":\s*return getAvailableSlotsStoreAware_\(/);
assert.match(main, /case "createReservation":\s*return createReservationStoreAware_\(/);
assert.match(main, /case "getAvailableSlotsRange":\s*return getAvailableSlotsRangeStoreAware_\(/);
assert.match(yoshimaru, /getAvailableSlots\(dayParams\)/);

const tables = {
  services: [
    ["service_code", "store_code", "duration", "provider_role", "category"],
    ["TOUR", "YACHIYO", 60, "STAFF", "VISIT"]
  ],
  staff: [
    ["staff_code", "role", "active", "can_tour"],
    ["KAWAKAMI", "STAFF", true, true]
  ],
  staff_shifts: [
    ["staff_code", "store_code", "date", "start_time", "end_time", "active"],
    ["KAWAKAMI", "SOGA", "2026-09-02", "10:15", "14:00", true],
    [
      "KAWAKAMI",
      "YACHIYO",
      new Date("2026-09-02T00:00:00Z"),
      new Date("1899-12-30T17:00:00Z"),
      new Date("1899-12-30T21:00:00Z"),
      true
    ]
  ],
  reservations: [
    ["reservation_id", "store_code", "staff_code", "reservation_date", "start_time", "end_time", "status"],
    ["R0", "YACHIYO", "KAWAKAMI", "2026-09-02", "08:00", "09:00", "CANCELLED"]
  ]
};

const sheetReads = {};

function sheet(name, values) {
  return {
    getLastRow() { return values.length; },
    getLastColumn() { return values[0].length; },
    getDataRange() {
      return {
        getValues() {
          sheetReads[name] = (sheetReads[name] || 0) + 1;
          return values;
        }
      };
    }
  };
}

const cache = new Map();
const cacheSeconds = new Map();
const created = [];
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
  isFinite,
  SpreadsheetApp: {
    getActiveSpreadsheet() {
      return {
        getSheetByName(name) {
          return tables[name] ? sheet(name, tables[name]) : null;
        }
      };
    }
  },
  CacheService: {
    getScriptCache() {
      return {
        get(key) { return cache.get(key) || null; },
        put(key, value, seconds) {
          cache.set(key, value);
          cacheSeconds.set(key, seconds);
        },
        remove(key) { cache.delete(key); }
      };
    }
  },
  Session: { getScriptTimeZone() { return "Asia/Tokyo"; } },
  Utilities: {
    formatDate(value, _timezone, format) {
      const iso = value.toISOString();
      return format === "HH:mm" ? iso.slice(11, 16) : iso.slice(0, 10);
    }
  },
  getAvailableSlots() {
    return {
      ok: true,
      data: {
        date: "2026-09-02",
        slots: [
          { date: "2026-09-02", start_time: "10:30", end_time: "11:30" },
          { date: "2026-09-02", start_time: "17:30", end_time: "18:30" }
        ]
      }
    };
  },
  getAvailableSlotsRange() {
    return {
      ok: true,
      data: {
        start_date: "2026-09-02",
        days: 1,
        results: [{
          ok: true,
          data: {
            date: "2026-09-02",
            slots: [
              { date: "2026-09-02", start_time: "10:30", end_time: "11:30" },
              { date: "2026-09-02", start_time: "17:30", end_time: "18:30" }
            ]
          }
        }]
      }
    };
  },
  createReservationWithTrainerPolicy_(params) {
    created.push({ ...params });
    return { ok: true, data: { reservation_id: "R1" } };
  },
  successResponse(data) { return { ok: true, data }; },
  errorResponse(message, code, data) { return { ok: false, message, code, data }; }
};

vm.createContext(context);
vm.runInContext(policy, context, { filename: "60_StoreAwareAssignment.gs" });

const available = context.getAvailableSlotsStoreAware_({
  service_code: "TOUR",
  date: "2026-09-02"
});
assert.equal(available.ok, true);
assert.deepEqual(
  JSON.parse(JSON.stringify(available.data.slots)),
  [{ date: "2026-09-02", start_time: "17:30", end_time: "18:30" }],
  "SOGA勤務はYACHIYOの予約可能枠にしてはいけない"
);
assert.deepEqual(sheetReads, {
  services: 1,
  staff: 1,
  staff_shifts: 1,
  reservations: 1
});
assert.equal(cacheSeconds.get("store-aware-static-v2"), 300);
assert.equal(cacheSeconds.get("store-aware-dynamic-v2"), 20);

const availableRange = context.getAvailableSlotsRangeStoreAware_({
  service_code: "TOUR",
  start_date: "2026-09-02",
  days: 1
});
assert.deepEqual(
  JSON.parse(JSON.stringify(availableRange.data.results[0].data.slots)),
  [{ date: "2026-09-02", start_time: "17:30", end_time: "18:30" }],
  "7日分一括取得でもSOGA勤務をYACHIYO枠にしてはいけない"
);
assert.deepEqual(
  sheetReads,
  { services: 1, staff: 1, staff_shifts: 1, reservations: 1 },
  "一覧用の静的・動的データは短時間キャッシュを再利用する"
);

const blocked = context.createReservationStoreAware_({
  service_code: "TOUR",
  date: "2026-09-02",
  start_time: "10:30"
});
assert.equal(blocked.ok, false);
assert.equal(blocked.code, "SLOT_NOT_AVAILABLE");
assert.equal(created.length, 0, "店舗不一致の予約は既存作成処理へ渡してはいけない");

const accepted = context.createReservationStoreAware_({
  service_code: "TOUR",
  date: "2026-09-02",
  start_time: "17:30"
});
assert.equal(accepted.ok, true);
assert.equal(created.length, 1);
assert.equal(created[0].staff_code, "KAWAKAMI");
assert.equal(created[0].store_code, "YACHIYO");
assert.equal(cache.has("store-aware-static-v2"), true);
assert.equal(cache.has("store-aware-dynamic-v2"), false);

console.log("store-aware assignment tests passed");
