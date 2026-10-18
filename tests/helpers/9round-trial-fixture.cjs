const fs = require("node:fs");
const path = require("node:path");
const file = path.resolve(__dirname, "../9round-booking.test.js");
const source = fs.readFileSync(file, "utf8").split('const day = "2026-10-18";')[0];
const helper = { exports: {} };
new Function("require", "__dirname", "module", "exports", source + "\nmodule.exports={environment};")(require, path.dirname(file), helper, helper.exports);

function fixture() {
  const e = helper.exports.environment({ realStaffAuth: true, properties: { ROUND9_TRIAL_ENABLED: "true", ROUND9_TRIAL_SHIFT_SPREADSHEET_ID: "test-staff-directory", ROUND9_MPG_BRIDGE_ENABLED: "true", ROUND9_MPG_BRIDGE_SECRET: "test-only-mpg-bridge-secret-at-least-32-characters" } });
  e.properties.ROUND9_BOOKING_TEST_EMAILS += ",trial0@example.invalid,trial1@example.invalid,trial2@example.invalid";
  e.directory.insertSheet("staff_shifts").rows = [
    ["staff_code", "store_code", "date", "start_time", "end_time", "active"],
    ["KAWAKAMI", "MPG", "2026-10-18", "10:15", "11:45", "true"],
    ["KAWAKAMI", "MPG", "2026-10-20", "11:00", "14:00", "true"],
    ["KAWAKAMI", "MPG", "2026-10-21", "19:00", "21:00", "true"],
    ["OTHER", "MPG", "2026-10-19", "10:15", "14:00", "true"],
    ["KAWAKAMI", "SOGA", "2026-10-19", "16:15", "20:45", "true"],
    ["KAWAKAMI", "MPG", "2026-10-22", "11:00", "14:00", "false"]
  ];
  e.directory.insertSheet("reservations").rows = [["staff_code", "service_code", "reservation_date", "start_time", "end_time", "status"]];
  e.directory.insertSheet("staff_shift_publications").rows = [["store_code", "target_month", "status"]];
  function applicant(i = 0) { return "trial" + i + "@example.invalid"; }
  return Object.assign(e, { applicant });
}
function payload(email, extra = {}) {
  return { email, request_id: "test-trial-request-" + email.split("@")[0], name: "体験 太郎", phone: "09012345678", party_size: 1,
    consent: true, date: "2026-10-18", slot_id: "TRIAL:2026-10-18:10:15", ...extra };
}
module.exports = { fixture, payload };
