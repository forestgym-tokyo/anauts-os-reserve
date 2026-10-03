const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function mpgContext_() {
  const source = read("gas/63_MpgShiftRules.gs");
  const context = {};
  vm.runInNewContext(source, context);
  return context;
}

test("MPG uses a continuous 45-minute grid from 10:15 through 20:45", () => {
  const context = mpgContext_();
  const slots = context.mpgSlotGrid_();
  assert.equal(slots.length, 14);
  assert.deepEqual(
    JSON.parse(JSON.stringify(slots[0])),
    { start_time: "10:15", end_time: "11:00" }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(slots.at(-1))),
    { start_time: "20:00", end_time: "20:45" }
  );
});

test("MPG recurring windows snap to the 10:15 45-minute grid", () => {
  const context = mpgContext_();
  const sunday = JSON.parse(JSON.stringify(context.mpgExpectedSlotsForDate_("2026-10-04")));
  const monday = JSON.parse(JSON.stringify(context.mpgExpectedSlotsForDate_("2026-10-05")));
  const tuesday = JSON.parse(JSON.stringify(context.mpgExpectedSlotsForDate_("2026-10-06")));

  assert.deepEqual(sunday, [
    { start_time: "18:30", end_time: "19:15" },
    { start_time: "19:15", end_time: "20:00" },
    { start_time: "20:00", end_time: "20:45" }
  ]);
  assert.deepEqual(monday, [
    { start_time: "19:15", end_time: "20:00" },
    { start_time: "20:00", end_time: "20:45" }
  ]);
  assert.deepEqual(tuesday, [
    { start_time: "10:15", end_time: "11:00" },
    { start_time: "11:00", end_time: "11:45" },
    { start_time: "11:45", end_time: "12:30" }
  ]);
});

test("YACHIYO blocks MPG with a 150-minute travel buffer", () => {
  const context = mpgContext_();

  assert.equal(context.mpgSlotConflict_(
    { start_time: "13:15", end_time: "14:00" },
    { store_code: "YACHIYO", start_time: "16:00", end_time: "20:00" }
  ), true);

  assert.equal(context.mpgSlotConflict_(
    { start_time: "12:30", end_time: "13:15" },
    { store_code: "YACHIYO", start_time: "16:00", end_time: "20:00" }
  ), false);

  assert.equal(context.mpgSlotConflict_(
    { start_time: "18:30", end_time: "19:15" },
    { store_code: "YACHIYO", start_time: "12:00", end_time: "16:00" }
  ), false);
});

test("SOGA blocks only the overlapping MPG time with no travel buffer", () => {
  const context = mpgContext_();

  assert.equal(context.mpgSlotConflict_(
    { start_time: "18:30", end_time: "19:15" },
    { store_code: "SOGA", start_time: "18:30", end_time: "19:15" }
  ), true);

  assert.equal(context.mpgSlotConflict_(
    { start_time: "19:15", end_time: "20:00" },
    { store_code: "SOGA", start_time: "18:30", end_time: "19:15" }
  ), false);
});

test("MPG automation is wired into the admin API and UI", () => {
  const main = read("gas/99_Main.gs");
  const config = read("admin/firebase-config.js");
  const ui = read("admin/admin-mpg-shifts.js");
  const availability = read("gas/28_Availability.gs.js");
  const reservation = read("gas/29_Reservation.gs.js");

  assert.match(main, /case "generateKawakamiMpgShifts"/);
  assert.match(config, /admin-mpg-shifts\.js\?v=20261003-mpg-trigger-v3/);
  assert.match(ui, /48時間/);
  assert.match(ui, /2時間30分/);
  assert.match(availability, /getAvailabilityShifts_\(\s*targetDate,\s*staffMap,\s*service\.store_code/);
  assert.match(reservation, /getAvailabilityShifts_\(\s*targetDate,\s*staffMap,\s*service\.store_code/);
});


test("MPG tour and training share the MPG store and 45-minute service grid", () => {
  const rules = read("gas/63_MpgShiftRules.gs");
  const reserve = read("assets/js/reserve.js");
  const availability = read("gas/28_Availability.gs.js");

  assert.match(rules, /MPG_SHIFT_STORE_CODE_ = "MPG"/);
  assert.match(rules, /MPG_TOUR_SERVICE_CODE_ = "MPG_TOUR45"/);
  assert.match(rules, /MPG_SHIFT_SERVICE_CODES_/);
  assert.match(rules, /duration: MPG_SHIFT_SLOT_MINUTES_/);
  assert.match(rules, /slot_interval_minutes: MPG_SHIFT_SLOT_MINUTES_/);
  assert.match(reserve, /"mpg-tour"/);
  assert.match(reserve, /serviceCode: "MPG_TOUR45"/);
  assert.match(availability, /MPG_TOUR45:\s*"can_tour"/);
});


test("MPG trigger authorization is non-blocking and availability enforces the 48-hour fallback", () => {
  const rules = read("gas/63_MpgShiftRules.gs");
  const availability = read("gas/28_Availability.gs.js");

  assert.match(rules, /function setupMpgShiftCleanupTrigger/);
  assert.match(rules, /cleanup_trigger_ready = false/);
  assert.match(rules, /cleanupUnbookedMpgShifts\(\)/);
  assert.match(availability, /normalizedStoreCode === "MPG"/);
  assert.match(availability, /cleanupUnbookedMpgShifts\(\)/);
});


test("MPG training support enforces four bookings per member per calendar month", () => {
  const context = mpgContext_();
  context.APP_CONFIG = { SHEETS: { RESERVATIONS: "reservations" } };
  context.normalizeReservationScheduleDate_ = value => String(value || "");
  context.getSheetData = () => [
    { reservation_id: "1", service_code: "MPG_TRAINING_SUPPORT45", member_no: "MPG341114", reservation_date: "2026-10-02", status: "CONFIRMED" },
    { reservation_id: "2", service_code: "MPG_TRAINING_SUPPORT45", member_no: "mpg341114", reservation_date: "2026-10-09", status: "RESERVED" },
    { reservation_id: "3", service_code: "MPG_TRAINING_SUPPORT45", member_no: "MPG341114", reservation_date: "2026-10-16", status: "COMPLETED" },
    { reservation_id: "4", service_code: "MPG_TRAINING_SUPPORT45", member_no: "MPG341114", reservation_date: "2026-10-23", status: "RESERVED" },
    { reservation_id: "5", service_code: "MPG_TRAINING_SUPPORT45", member_no: "MPG341114", reservation_date: "2026-10-30", status: "CANCELLED" }
  ];

  const blocked = context.validateMpgTrainingMonthlyBookingLimit_(
    "MPG341114",
    "2026-10-25",
    ""
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "MPG_MONTHLY_BOOKING_LIMIT");
  assert.equal(blocked.detail.current_count, 4);

  const reschedule = context.validateMpgTrainingMonthlyBookingLimit_(
    "MPG341114",
    "2026-10-25",
    "4"
  );
  assert.equal(reschedule.ok, true);
  assert.equal(reschedule.detail.current_count, 3);
});

test("MPG reservation code uses MPG member master and store-scoped rescheduling", () => {
  const reservation = read("gas/29_Reservation.gs.js");
  const update = read("gas/32_UpdateReservation.gs.js");
  const reserveUi = read("assets/js/reserve.js");

  assert.match(reservation, /validateMpgReservationMemberMaster_/);
  assert.match(reservation, /validateMpgTrainingMonthlyBookingLimit_/);
  assert.match(reservation, /"MPG_TRAINING_SUPPORT45"/);
  assert.match(update, /validateMpgTrainingMonthlyBookingLimit_/);
  assert.match(update, /service\.store_code/);
  assert.match(reserveUi, /MPG\\d\{6\}/);
  assert.match(reserveUi, /MPG_MONTHLY_BOOKING_LIMIT/);
});
