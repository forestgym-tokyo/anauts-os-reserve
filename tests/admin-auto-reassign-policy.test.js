const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const controller = fs.readFileSync(
  path.join(root, "admin", "admin-auto-reassign-enforce.js"),
  "utf8"
);
const config = fs.readFileSync(
  path.join(root, "admin", "firebase-config.js"),
  "utf8"
);
const indexHtml = fs.readFileSync(
  path.join(root, "admin", "index.html"),
  "utf8"
);
const adminHtml = fs.readFileSync(
  path.join(root, "admin", "admin.html"),
  "utf8"
);

assert.match(config, /admin-auto-reassign-enforce\.js\?v=20260828-lightweight-v1/);
for (const html of [indexHtml, adminHtml]) {
  assert.match(html, /admin\.css\?v=20260828-lightweight-autoassign-v1/);
  assert.match(html, /firebase-config\.js\?v=20260828-enrollment-master-draft-v1/);
}
assert.doesNotMatch(controller, /reassignInvalidReservations/);
assert.doesNotMatch(controller, /action:\s*["']updateReservation["']/);
assert.doesNotMatch(controller, /\bapiGet\s*\(/);
assert.doesNotMatch(controller, /setInterval|MutationObserver|visibilitychange|focus/);
assert.match(controller, /suppress_customer_notification:true/);
assert.match(controller, /notification_mode:"NONE"/);

const calls = [];
let reloads = 0;
const context = {
  console,
  Date,
  JSON,
  Math,
  Map,
  Set,
  Promise,
  String,
  Number,
  Array,
  state: {
    authUser: { permission: "ADMIN" },
    staffScheduleDate: "2026-08-28",
    staffSchedule: {
      shifts: [
        { staff_code: "WORKING", start_time: "09:00", end_time: "18:00" }
      ],
      reservations: [
        { reservation_id: "tour", service_code: "TOUR", staff_code: "ABSENT", start_time: "10:00", end_time: "11:00", status: "RESERVED" },
        { reservation_id: "procedure", service_code: "PROCEDURE", staff_code: "", start_time: "11:00", end_time: "11:30", status: "RESERVED" },
        { reservation_id: "unsubscribe", service_code: "UNSUBSCRIBE", staff_code: "ABSENT", start_time: "12:00", end_time: "12:10", status: "RESERVED" },
        { reservation_id: "support", service_code: "TRAINING_SUPPORT45", staff_code: "ABSENT", start_time: "13:00", end_time: "13:45", status: "RESERVED" },
        { reservation_id: "valid-tour", service_code: "TOUR", staff_code: "WORKING", start_time: "14:00", end_time: "15:00", status: "RESERVED" },
        { reservation_id: "counsel", service_code: "COUNSEL", staff_code: "ABSENT", start_time: "15:00", end_time: "16:00", status: "RESERVED" },
        { reservation_id: "meal", service_code: "MEAL_PLANNING", staff_code: "", start_time: "16:00", end_time: "17:00", status: "RESERVED" },
        { reservation_id: "personal", service_code: "PERSONAL60", staff_code: "ABSENT", start_time: "17:00", end_time: "18:00", status: "RESERVED" },
        { reservation_id: "cancelled", service_code: "TOUR", staff_code: "ABSENT", start_time: "18:00", end_time: "19:00", status: "CANCELLED" }
      ]
    }
  },
  async apiPost(payload) {
    calls.push(payload);
    return { ok: true, data: { changed: true } };
  },
  async loadStaffSchedule() {
    reloads += 1;
  },
  document: {
    readyState: "loading",
    addEventListener() {},
    getElementById() { return null; }
  },
  setTimeout,
  clearTimeout
};
context.window = context;

vm.createContext(context);
vm.runInContext(controller, context, { filename: "admin-auto-reassign-enforce.js" });

(async () => {
  const result = await context.ANAUTS_ENFORCE_AUTO_REASSIGN();
  assert.equal(result.completed, 4);
  assert.equal(result.reschedule_only, 2);
  assert.equal(reloads, 1);

  assert.deepEqual(
    calls.map(payload => payload.reservation_id),
    ["tour", "procedure", "unsubscribe", "support"]
  );
  assert.deepEqual(
    calls.map(payload => payload.service_code),
    ["TOUR", "PROCEDURE", "UNSUBSCRIBE", "TRAINING_SUPPORT45"]
  );
  calls.forEach(payload => {
    assert.equal(payload.action, "reassignReservationStaff");
    assert.equal(payload.internal_operation, true);
    assert.equal(payload.suppress_customer_notification, true);
    assert.equal(payload.notification_mode, "NONE");
  });

  await context.ANAUTS_ENFORCE_AUTO_REASSIGN();
  assert.equal(calls.length, 4, "The same unchanged schedule must not be posted repeatedly");

  console.log("admin automatic reassignment policy tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
