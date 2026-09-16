const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const main = fs.readFileSync(path.join(__dirname, "..", "gas", "99_Main.gs"), "utf8");

function tokyoDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const context = {
  APP_CONFIG: { TIMEZONE: "Asia/Tokyo" },
  Utilities: {
    formatDate(date, timezone, format) {
      assert.equal(timezone, "Asia/Tokyo");
      assert.equal(format, "yyyy-MM-dd");
      return tokyoDate(date);
    }
  },
  errorResponse(message, code, data) {
    return { ok: false, message, code, data };
  },
  readStoreAwareSheet_() {
    return [
      { service_code: "CUSTOM_PT", category: "PERSONAL" },
      { service_code: "CUSTOM_OTHER", category: "GENERAL" }
    ];
  }
};

vm.createContext(context);
vm.runInContext(main, context);

const now = new Date("2026-09-16T13:00:00.000Z"); // 2026-09-16 22:00 JST

assert.equal(
  context.validatePersonalPreviousDayBookingCutoff_(
    { service_code: "COUNSEL", date: "2026-09-21" },
    now
  ),
  null
);
assert.equal(
  context.validatePersonalPreviousDayBookingCutoff_(
    { service_code: "PT30", date: "2026-09-17" },
    now
  ),
  null
);
assert.equal(
  context.validatePersonalPreviousDayBookingCutoff_(
    { service_code: "PT_TRIAL60", date: "2026-09-16" },
    now
  ).code,
  "PERSONAL_BOOKING_CUTOFF"
);
assert.equal(
  context.validatePersonalPreviousDayBookingCutoff_(
    { service_code: "CUSTOM_PT", date: "2026-09-16" },
    now
  ).code,
  "PERSONAL_BOOKING_CUTOFF"
);
assert.equal(
  context.validatePersonalPreviousDayBookingCutoff_(
    { service_code: "CUSTOM_OTHER", date: "2026-09-16" },
    now
  ),
  null
);

console.log("personal booking cutoff tests passed");
