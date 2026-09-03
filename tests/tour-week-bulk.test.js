const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "gas", "60_StoreAwareAssignment.gs"),
  "utf8"
);

function addDays(dateText, offset) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset))
    .toISOString()
    .slice(0, 10);
}

function tokyoDateTime(date, time) {
  return new Date(`${date}T${time}:00+09:00`);
}

function calendarEvent(date, start, end) {
  return {
    getStartTime() { return tokyoDateTime(date, start); },
    getEndTime() { return tokyoDateTime(date, end); }
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const startDate = "2099-01-05";
const tables = {
  services: [{
    service_code: "TOUR",
    service_name: "店内見学",
    store_code: "YACHIYO",
    duration: 60,
    slot_interval_minutes: 30,
    booking_min_hours: 3,
    public_days: 30000,
    provider_role: "STAFF",
    calendar_code: "TFG_MAIN",
    active: true
  }],
  service_hours: [{
    service_code: "TOUR",
    day_of_week: "ALL",
    start_time: "09:00",
    end_time: "12:00",
    active: true
  }],
  staff: [
    { staff_code: "K1", staff_name: "八千代一郎", role: "STAFF", can_tour: true, active: true },
    { staff_code: "K2", staff_name: "八千代二郎", role: "STAFF", can_tour: true, active: true },
    { staff_code: "S1", staff_name: "蘇我一郎", role: "STAFF", can_tour: true, active: true }
  ],
  staff_shifts: [],
  reservations: [
    {
      reservation_id: "R1",
      staff_code: "K1",
      reservation_date: startDate,
      start_time: "09:30",
      end_time: "10:30",
      status: "RESERVED"
    },
    {
      reservation_id: "CANCELLED",
      staff_code: "K2",
      reservation_date: startDate,
      start_time: "09:00",
      end_time: "12:00",
      status: "CANCELLED"
    }
  ],
  calendars: [{
    calendar_code: "TFG_MAIN",
    calendar_id: "primary",
    calendar_name: "info@theforestgym.com"
  }]
};

for (let index = 0; index < 7; index += 1) {
  const date = addDays(startDate, index);
  tables.staff_shifts.push({
    staff_code: "K1",
    store_code: "YACHIYO",
    date,
    start_time: "09:00",
    end_time: "12:00",
    active: true
  });
  if (index === 0) {
    tables.staff_shifts.push({
      staff_code: "K2",
      store_code: "YACHIYO",
      date,
      start_time: "09:00",
      end_time: "12:00",
      active: true
    });
  }
  tables.staff_shifts.push({
    staff_code: "S1",
    store_code: "SOGA",
    date,
    start_time: "09:00",
    end_time: "12:00",
    active: true
  });
}

const sheetReads = {};
const cache = new Map();
const cacheSeconds = new Map();
const properties = new Map();
const calendarCalls = [];
let calendarThrows = false;
let legacyCalls = 0;

const events = [
  calendarEvent(startDate, "10:30", "11:00"),
  calendarEvent(addDays(startDate, 1), "09:30", "10:30")
];

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
  getSheetData(name) {
    sheetReads[name] = (sheetReads[name] || 0) + 1;
    return tables[name] || [];
  },
  SpreadsheetApp: {
    getActiveSpreadsheet() {
      throw new Error("getSheetDataがある場合はシートを直接再読込してはいけない");
    }
  },
  CalendarApp: {
    getDefaultCalendar() {
      if (calendarThrows) throw new Error("calendar unavailable");
      return {
        getName() { return "info@theforestgym.com"; },
        getEvents(rangeStart, rangeEnd) {
          calendarCalls.push({ rangeStart, rangeEnd });
          return events;
        }
      };
    },
    getCalendarById() {
      throw new Error("primaryカレンダーを利用するため呼ばれない");
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
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(key) { return properties.get(key) || null; },
        setProperty(key, value) { properties.set(key, value); }
      };
    }
  },
  Session: { getScriptTimeZone() { return "Asia/Tokyo"; } },
  Utilities: {
    parseDate(value) {
      return new Date(value.replace(" ", "T") + ":00+09:00");
    },
    formatDate(value, _timezone, format) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).formatToParts(value);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      if (format === "HH:mm") return `${values.hour}:${values.minute}`;
      if (format === "yyyy-MM-dd HH:mm") {
        return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
      }
      return `${values.year}-${values.month}-${values.day}`;
    }
  },
  getAvailableSlotsRange(params) {
    legacyCalls += 1;
    return {
      ok: true,
      data: {
        start_date: params.start_date,
        days: Number(params.days || 7),
        results: []
      }
    };
  },
  successResponse(data) { return { ok: true, data }; },
  errorResponse(message, code, data) { return { ok: false, message, code, data }; }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: "60_StoreAwareAssignment.gs" });

const first = context.getAvailableSlotsRangeStoreAware_({
  service_code: "TOUR",
  start_date: startDate,
  days: 7,
  tour_week_bulk: "1"
});

assert.equal(first.ok, true);
assert.equal(first.data.results.length, 7);
assert.equal(legacyCalls, 0, "週次一括計算が成功した場合は日別計算を呼ばない");
assert.deepEqual(
  sheetReads,
  {
    services: 1,
    service_hours: 1,
    staff: 1,
    staff_shifts: 1,
    reservations: 1,
    calendars: 1
  },
  "7日分でも各シートは1回だけ読み込む"
);
assert.equal(calendarCalls.length, 1, "カレンダーは7日分を1回で取得する");
assert.equal(
  calendarCalls[0].rangeStart.toISOString(),
  "2099-01-04T15:00:00.000Z"
);
assert.equal(
  calendarCalls[0].rangeEnd.toISOString(),
  "2099-01-11T15:00:00.000Z"
);

const firstDay = first.data.results[0].data;
assert.deepEqual(
  plain(firstDay.slots.map((slot) => slot.start_time)),
  ["09:00", "09:30", "10:00", "10:30", "11:00"]
);
assert.deepEqual(
  plain(firstDay.slots[0].staff_candidates.map((staff) => staff.staff_code)),
  ["K2"],
  "予約済みスタッフとSOGA勤務者を候補へ含めない"
);
assert.equal(firstDay.slots[2].capacity, 1, "予約とカレンダー予定を二重計上しない");
assert.equal(firstDay.slots[2].working_staff_count, 2);
assert.deepEqual(
  plain(first.data.results[1].data.slots.map((slot) => slot.start_time)),
  ["10:30", "11:00"],
  "週全体で取得した予定を日別の枠へ正しく適用する"
);

const readsAfterFirst = { ...sheetReads };
const cached = context.getAvailableSlotsRangeStoreAware_({
  service_code: "TOUR",
  start_date: startDate,
  days: 7,
  tour_week_bulk: "1"
});
assert.equal(cached.ok, true);
assert.deepEqual(sheetReads, readsAfterFirst, "再表示は週次キャッシュを使う");
assert.equal(calendarCalls.length, 1, "再表示ではカレンダーも再取得しない");
const bulkCacheKey = `tour-week-bulk-v1:0:TOUR:${startDate}:7`;
assert.equal(cacheSeconds.get(bulkCacheKey), 120);

const legacy = context.getAvailableSlotsRangeStoreAware_({
  service_code: "TOUR",
  start_date: startDate,
  days: 7,
  tour_week_bulk: "0"
});
assert.equal(legacy.ok, true);
assert.equal(legacyCalls, 1, "明示的に従来方式へ切り戻せる");

context.getAvailableSlotsRangeStoreAware_({
  service_code: "TOUR",
  staff_code: "K1",
  start_date: startDate,
  days: 7,
  tour_week_bulk: "1"
});
assert.equal(legacyCalls, 2, "担当者指定時は従来方式の意味を維持する");

cache.clear();
calendarThrows = true;
const fallback = context.getAvailableSlotsRangeStoreAware_({
  service_code: "TOUR",
  start_date: "2099-02-01",
  days: 7,
  tour_week_bulk: "1"
});
assert.equal(fallback.ok, true);
assert.equal(legacyCalls, 3, "週次一括計算が失敗した場合は従来方式へ戻る");

console.log("tour week bulk tests passed");
