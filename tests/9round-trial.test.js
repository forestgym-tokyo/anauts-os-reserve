const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { fixture, payload } = require("./helpers/9round-trial-fixture.cjs");
const book = (e, session, extra) => e.call("create9RoundTrialBooking", payload(session, extra));

test("trial schedule has only Kawakami's active MPG shifts and Saturday 13:15", () => {
  const e = fixture(), all = e.call("get9RoundTrialSlots");
  assert.equal(all.ok, true, JSON.stringify(all));
  const slots = all.data.slots;
  assert.deepEqual(slots.filter(s => s.date === "2026-10-18").map(s => s.start_time), ["10:15", "11:00"]);
  assert.deepEqual(slots.filter(s => s.date === "2026-10-20").map(s => s.start_time), ["11:00", "11:45", "12:30", "13:15"]);
  assert.deepEqual(slots.filter(s => s.date === "2026-10-21").map(s => s.start_time), ["19:15", "20:00"]);
  assert.equal(slots.some(s => ["2026-10-19", "2026-10-22"].includes(s.date)), false);
  for (const s of slots.filter(s => new Date(s.date + "T12:00:00+09:00").getUTCDay() === 6)) assert.equal(s.start_time, "13:15");
  assert.ok(slots.every(s => s.capacity === 2 && s.fee === 0 && s.slot_id.startsWith("TRIAL:")));
  assert.doesNotMatch(JSON.stringify(all), /KAWAKAMI|staff_code|体験 太郎|@example|phone|email/);
  assert.ok(e.writes.every(s => s.startsWith("nr_")));
});

test("daily four and trial two have independent capacities at the same date and time", () => {
  const e = fixture();
  for (let i = 0; i < 4; i++) assert.equal(e.call("create9RoundWorkoutBooking", { session_token: e.login(i), date: "2026-10-18", slot_id: "DAILY:2026-10-18:10:15" }).ok, true);
  const result = book(e, e.loginTrial(), { party_size: 2, companion_name: "体験 花子" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(e.call("get9RoundTrialSlots", { date: "2026-10-18" }).data.slots[0].remaining, 0);
  const board = e.call("get9RoundBookingBoard", { id_token: "staff", date: "2026-10-18" }).data.slots;
  assert.equal(board.find(s => s.slot_id === "DAILY:2026-10-18:10:15").booked_count, 4);
  const trial = board.find(s => s.slot_id === "TRIAL:2026-10-18:10:15");
  assert.equal(trial.booked_count, 2); assert.equal(trial.capacity, 2); assert.equal(trial.members[0].companion_name, "体験 花子");
});

test("a full trial does not reduce or block normal workout capacity", () => {
  const e = fixture();
  assert.equal(book(e, e.loginTrial(), { party_size: 2, companion_name: "体験 花子" }).ok, true);
  for (let i = 0; i < 4; i++) assert.equal(e.call("create9RoundWorkoutBooking", { session_token: e.login(i), date: "2026-10-18", slot_id: "DAILY:2026-10-18:10:15" }).ok, true);
  assert.equal(book(e, e.loginTrial(1)).code, "TRIAL_FULL");
});

test("third trial participant and tampered capacity, price or off-schedule requests are rejected", () => {
  const e = fixture(), one = e.loginTrial(), two = e.loginTrial(1), three = e.loginTrial(2);
  assert.equal(book(e, one).ok, true); assert.equal(book(e, two).ok, true);
  assert.equal(book(e, three, { capacity: 100, fee: -1 }).code, "TRIAL_FULL");
  assert.equal(book(e, three, { date: "2026-10-19", slot_id: "TRIAL:2026-10-19:10:15" }).code, "TRIAL_UNAVAILABLE");
  assert.equal(book(e, three, { date: "2026-10-24", slot_id: "TRIAL:2026-10-24:11:00" }).code, "TRIAL_UNAVAILABLE");
  assert.equal(book(e, three, { date: "2026-10-24", slot_id: "TRIAL:2026-10-24:13:15", fee: 900, party_size: 3 }).code, "INVALID_REQUEST");
});

test("Saturday has one trial time and rejects daily creates and reschedules without deleting history", () => {
  const e = fixture(), token = e.login();
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: "2026-10-24" }).data.slots.length, 0);
  assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date: "2026-10-24", slot_id: "DAILY:2026-10-24:13:15" }).code, "INVALID_SLOT");
  assert.equal(book(e, e.loginTrial(), { date: "2026-10-24", slot_id: "TRIAL:2026-10-24:13:15" }).ok, true);
  const daily = e.call("create9RoundWorkoutBooking", { session_token: token, date: "2026-10-18", slot_id: "DAILY:2026-10-18:10:15" });
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { session_token: token, booking_id: daily.data.booking_id, date: "2026-10-24", slot_id: "DAILY:2026-10-24:13:15" }).code, "INVALID_SLOT");
  assert.equal(e.call("get9RoundMemberBookings", { session_token: token }).data.bookings.length, 1);
});

test("trial OTP verifies non-members without using or changing the membership master", () => {
  const e = fixture(), before = JSON.stringify(e.master.sheets.get("Members").rows);
  const req = e.call("request9RoundTrialCode", { email: "trial0@example.invalid" });
  const code = e.sent.at(-1).body.match(/は (\d{6})/)[1];
  assert.equal(JSON.stringify(req).includes(code), false);
  assert.equal(e.data.sheets.get("nr_trial_challenges").rows[1].includes(code), false);
  const result = e.call("verify9RoundTrialCode", { challenge_id: req.data.challenge_id, code });
  assert.equal(result.ok, true);
  assert.equal(e.call("verify9RoundTrialCode", { challenge_id: req.data.challenge_id, code }).code, "INVALID_CODE");
  assert.equal(book(e, result.data.session_token, { email: "forged@example.invalid" }).data.email, "trial0@example.invalid");
  assert.equal(JSON.stringify(e.master.sheets.get("Members").rows), before);
  assert.ok(!JSON.stringify(e.data.sheets.get("nr_trial_sessions").rows).includes(result.data.session_token));
});

test("OTP resend, attempts, expiry, environment allowlist and failed delivery are guarded", () => {
  const e = fixture();
  const req = e.call("request9RoundTrialCode", { email: "trial0@example.invalid" });
  assert.equal(e.call("request9RoundTrialCode", { email: "trial0@example.invalid" }).code, "RATE_LIMIT");
  const code = e.sent.at(-1).body.match(/は (\d{6})/)[1], wrong = code === "999999" ? "111111" : "999999";
  for (let i = 0; i < 5; i++) assert.equal(e.call("verify9RoundTrialCode", { challenge_id: req.data.challenge_id, code: wrong }).code, "INVALID_CODE");
  assert.equal(e.call("verify9RoundTrialCode", { challenge_id: req.data.challenge_id, code }).code, "INVALID_CODE");
  assert.equal(e.call("request9RoundTrialCode", { email: "outsider@example.invalid" }).code, "TRIAL_EMAIL_UNAVAILABLE");
  const other = e.call("request9RoundTrialCode", { email: "trial1@example.invalid" });
  e.advance(600001); assert.equal(e.call("verify9RoundTrialCode", { challenge_id: other.data.challenge_id, code: e.sent.at(-1).body.match(/は (\d{6})/)[1] }).code, "INVALID_CODE");
  e.mailFailure(true); assert.equal(e.call("request9RoundTrialCode", { email: "trial2@example.invalid" }).code, "MAIL_FAILED");
});

test("repeated submission reserves and sends confirmation only once", () => {
  const e = fixture(), session = e.loginTrial();
  const first = book(e, session), mails = e.sent.length;
  assert.equal(first.ok, true); assert.equal(book(e, session).data.application_id, first.data.application_id);
  assert.equal(book(e, session).data.already_booked, true); assert.equal(e.sent.length, mails);
  assert.equal(e.data.sheets.get("nr_trial_applications").rows.length, 2);
  assert.equal(book(e, session, { party_size: 2, companion_name: "別人" }).code, "REQUEST_CONFLICT");
  assert.equal(book(e, session, { request_id: "another-request-0001" }).code, "ALREADY_BOOKED");
});

test("contact and consent validation precede every booking", () => {
  const e = fixture(), session = e.loginTrial();
  for (const extra of [{ consent: false }, { phone: "123" }, { name: "\n" }, { party_size: 2 }, { request_id: "x" }]) assert.equal(book(e, session, extra).ok, false);
  assert.equal(e.data.sheets.get("nr_trial_applications").rows.length, 1);
  assert.equal(book(e, session, { name: "=SUM(1,2)", phone: "０９０－１２３４－５６７８" }).ok, true);
  assert.ok(e.data.sheets.get("nr_trial_applications").rows[1].some(v => String(v).startsWith("'=SUM")));
});

test("signed trial links are scoped, read-only on lookup, and work after six hours", () => {
  const e = fixture(), result = book(e, e.loginTrial()).data;
  const link = { application_id: result.application_id, trial_token: result.trial_token };
  e.advance(7 * 3600000);
  assert.equal(e.call("get9RoundTrialBooking", link).data.status, "CONFIRMED");
  assert.equal(e.call("get9RoundTrialBooking", { ...link, trial_token: "a".repeat(64) }).code, "TRIAL_LINK_INVALID");
  assert.equal(e.call("get9RoundTrialBooking", { ...link, application_id: "b".repeat(64) }).code, "TRIAL_LINK_INVALID");
  assert.equal(e.data.sheets.get("nr_trial_applications").rows[1][12], "CONFIRMED");
  const changed = e.call("reschedule9RoundTrialBooking", { ...link, date: "2026-10-18", slot_id: "TRIAL:2026-10-18:11:00" });
  assert.equal(changed.ok, true, JSON.stringify(changed));
  assert.equal(e.call("get9RoundTrialBooking", link).code, "TRIAL_LINK_INVALID");
  const cancelled = e.call("cancel9RoundTrialBooking", { application_id: changed.data.application_id, trial_token: changed.data.trial_token });
  assert.equal(cancelled.data.status, "CANCELLED");
  assert.equal(e.call("get9RoundTrialSlots", { date: "2026-10-18" }).data.slots[1].remaining, 2);
});

test("trial changes enforce capacity and preserve the original on failure", () => {
  const e = fixture(), a = book(e, e.loginTrial()).data;
  book(e, e.loginTrial(1), { slot_id: "TRIAL:2026-10-18:11:00", party_size: 2, companion_name: "同行者" });
  const failed = e.call("reschedule9RoundTrialBooking", { application_id: a.application_id, trial_token: a.trial_token, date: "2026-10-18", slot_id: "TRIAL:2026-10-18:11:00" });
  assert.equal(failed.code, "TRIAL_FULL");
  assert.equal(e.call("get9RoundTrialBooking", { application_id: a.application_id, trial_token: a.trial_token }).data.start_time, "10:15");
  e.setNow("2026-10-18T00:15:00.001Z");
  assert.equal(e.call("cancel9RoundTrialBooking", { application_id: a.application_id, trial_token: a.trial_token }).code, "DEADLINE_PASSED");
});

test("busy MPG bookings close trials; removed shifts never hide accepted trial reservations from staff", () => {
  const e = fixture(), a = book(e, e.loginTrial()).data;
  e.directory.sheets.get("reservations").rows.push(["KAWAKAMI", "MPG_TOUR45", "2026-10-18", "11:00", "11:45", "CONFIRMED"]);
  assert.equal(e.call("get9RoundTrialSlots", { date: "2026-10-18" }).data.slots[1].available, false);
  e.directory.sheets.get("staff_shifts").rows[1][5] = "false";
  assert.equal(e.call("get9RoundTrialSlots", { date: "2026-10-18" }).data.slots.length, 0);
  const preserved = e.call("get9RoundBookingBoard", { id_token: "staff", date: "2026-10-18" }).data.slots.find(s => s.kind === "TRIAL");
  assert.equal(preserved.members[0].application_id, a.application_id); assert.equal(preserved.status, "CLOSED");
});

test("staff trial actions need verified staff authority and write an audit record", () => {
  const e = fixture(), a = book(e, e.loginTrial()).data, body = { application_id: a.application_id };
  assert.equal(e.call("cancel9RoundManagedTrialBooking", { ...body, permission: "ADMIN" }).code, "STAFF_SESSION_EXPIRED");
  assert.equal(e.call("cancel9RoundManagedTrialBooking", { ...body, id_token: "other" }).code, "FORBIDDEN");
  assert.equal(e.call("get9RoundManagedTrialBooking", { ...body, id_token: "staff" }).data.name, "体験 太郎");
  assert.equal(e.call("cancel9RoundManagedTrialBooking", { ...body, id_token: "staff" }).data.status, "CANCELLED");
  assert.ok(e.data.sheets.get("nr_management_actions").rows.some(r => r.includes("TRIAL_CANCELLED") && r.includes("S")));
});

test("automatic trial slots can be stopped, deleted and restored only within the allowed schedule", () => {
  const e = fixture(), body = { id_token: "admin", date: "2026-10-18", start_time: "10:15", slot_id: "TRIAL:2026-10-18:10:15", capacity: 2 };
  assert.equal(e.call("save9RoundTrialSlot", { ...body, start_time: "12:30" }).code, "TRIAL_UNAVAILABLE");
  assert.equal(e.call("save9RoundTrialSlot", { ...body, capacity: 3 }).code, "INVALID_CAPACITY");
  assert.equal(e.call("delete9RoundBookingSlot", body).ok, true);
  assert.equal(e.call("get9RoundTrialSlots", { date: body.date }).data.slots.some(s => s.slot_id === body.slot_id), false);
  assert.equal(e.call("restore9RoundBookingSlot", body).ok, true);
  assert.equal(e.call("get9RoundTrialSlots", { date: body.date }).data.slots[0].available, false);
  assert.equal(e.call("save9RoundTrialSlot", { ...body, slot_id: "", status: "OPEN" }).code, "DUPLICATE_TRIAL");
  assert.equal(e.call("save9RoundTrialSlot", { ...body, status: "OPEN" }).ok, true);
  assert.equal(book(e, e.loginTrial()).ok, true);
  assert.equal(e.call("delete9RoundBookingSlot", body).code, "SLOT_HAS_BOOKINGS");
});

test("mail failures preserve confirmed trials and can be retried without duplicating messages", () => {
  const e = fixture(), session = e.loginTrial(); e.mailFailure(true);
  const result = book(e, session);
  assert.equal(result.data.status, "CONFIRMED"); assert.equal(result.data.notification_pending, true);
  e.mailFailure(false);
  const retry = e.call("retry9RoundBookingNotifications", { id_token: "manager" });
  assert.equal(retry.data.sent, 2); assert.equal(retry.data.pending, 0);
  const mails = e.sent.length; e.call("retry9RoundBookingNotifications", { id_token: "manager" }); assert.equal(e.sent.length, mails);
  const customer = e.sent.at(-2); assert.match(customer.body, /料金：無料/); assert.match(customer.body, /#application_id=/);
  assert.doesNotMatch(customer.htmlBody, /体験 太郎.*<script>/);
});

test("additive trial migration keeps existing table rows and does not enable the release", () => {
  const e = fixture(); e.properties.ROUND9_TRIAL_ENABLED = "false";
  const before = JSON.stringify(e.data.sheets.get("nr_bookings").rows);
  e.context.prepare9RoundTrialStorage_();
  assert.equal(JSON.stringify(e.data.sheets.get("nr_bookings").rows), before);
  assert.equal(e.call("get9RoundTrialSlots").code, "TRIAL_DISABLED");
  assert.equal(e.context.nrBookingDailySlots_("2026-10-24").length, 11);
});
