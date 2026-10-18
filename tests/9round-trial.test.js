const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture, payload } = require("./helpers/9round-trial-fixture.cjs");
const book = (e, email, extra) => e.call("create9RoundTrialBooking", payload(email, extra));

test("trials use all eleven daily timetable slots on every day, with no private shift information", () => {
  const e = fixture(), all = e.call("get9RoundTrialSlots");
  assert.equal(all.ok, true, JSON.stringify(all));
  const slots = all.data.slots;
  for (const date of ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-24"]) {
    assert.deepEqual(slots.filter(s => s.date === date).map(s => [s.start_time, s.end_time]),
      Array.from(e.context.nrBookingBaseSlots_(date), s => [s.start_time, s.end_time]));
  }
  assert.ok(slots.every(s => s.capacity === 2 && s.fee === 0 && s.slot_id.startsWith("TRIAL:")));
  assert.doesNotMatch(JSON.stringify(all), /KAWAKAMI|staff_code|体験 太郎|@example|phone|email|staffing|parallel/);
  assert.ok(e.writes.every(s => s.startsWith("nr_")));
});

test("daily four and trial two have independent capacities at the same date and time", () => {
  const e = fixture();
  for (let i = 0; i < 4; i++) assert.equal(e.call("create9RoundWorkoutBooking", { session_token: e.login(i), date: "2026-10-18", slot_id: "DAILY:2026-10-18:10:15" }).ok, true);
  const result = book(e, e.applicant(), { party_size: 2, companion_name: "体験 花子" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(e.call("get9RoundTrialSlots", { date: "2026-10-18" }).data.slots[0].remaining, 0);
  const board = e.call("get9RoundBookingBoard", { id_token: "staff", date: "2026-10-18" }).data.slots;
  assert.equal(board.find(s => s.slot_id === "DAILY:2026-10-18:10:15").booked_count, 4);
  const trial = board.find(s => s.slot_id === "TRIAL:2026-10-18:10:15");
  assert.equal(trial.booked_count, 2); assert.equal(trial.capacity, 2); assert.equal(trial.members[0].companion_name, "体験 花子");
});

test("a full trial does not reduce or block normal workout capacity", () => {
  const e = fixture();
  assert.equal(book(e, e.applicant(), { party_size: 2, companion_name: "体験 花子" }).ok, true);
  for (let i = 0; i < 4; i++) assert.equal(e.call("create9RoundWorkoutBooking", { session_token: e.login(i), date: "2026-10-18", slot_id: "DAILY:2026-10-18:10:15" }).ok, true);
  assert.equal(book(e, e.applicant(1)).code, "TRIAL_FULL");
});

test("third trial participant and tampered capacity, price or off-schedule requests are rejected", () => {
  const e = fixture(), one = e.applicant(), two = e.applicant(1), three = e.applicant(2);
  assert.equal(book(e, one).ok, true); assert.equal(book(e, two).ok, true);
  assert.equal(book(e, three, { capacity: 100, fee: -1 }).code, "TRIAL_FULL");
  assert.equal(book(e, three, { date: "2026-10-19", slot_id: "TRIAL:2026-10-19:10:30" }).code, "TRIAL_UNAVAILABLE");
  assert.equal(book(e, three, { date: "2026-10-24", slot_id: "TRIAL:2026-10-24:14:00" }).code, "TRIAL_UNAVAILABLE");
  assert.equal(book(e, three, { date: "2026-10-24", slot_id: "TRIAL:2026-10-24:13:15", fee: 900, party_size: 3 }).code, "INVALID_REQUEST");
});

test("Saturday uses the full timetable and the same first-booked rule", () => {
  const e = fixture(), token = e.login();
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: "2026-10-24" }).data.slots.length, 11);
  assert.equal(e.call("get9RoundTrialSlots", { date: "2026-10-24" }).data.slots.length, 11);
  assert.equal(book(e, e.applicant(), { date: "2026-10-24", slot_id: "TRIAL:2026-10-24:13:15" }).ok, true);
  const daily = e.call("get9RoundWorkoutSlots", { session_token: token, date: "2026-10-24" }).data.slots;
  assert.equal(daily.length, 10); assert.equal(daily.some(s => s.start_time === "13:15"), false);
  assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date: "2026-10-24", slot_id: "DAILY:2026-10-24:13:15" }).code, "SLOT_BLOCKED");
  assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date: "2026-10-24", slot_id: "DAILY:2026-10-24:11:00" }).ok, true);
});

test("non-members book directly without codes or sessions and only receive post-booking mail", () => {
  const e = fixture(), before = JSON.stringify(e.master.sheets.get("Members").rows);
  const result = book(e, e.applicant(), { email: " TRIAL0@example.invalid " });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.data.email, "trial0@example.invalid");
  assert.equal(result.data.status, "CONFIRMED"); assert.equal(e.sent.length, 2);
  assert.match(e.sent[0].subject, /予約確認/); assert.match(e.sent[1].subject, /管理通知/);
  assert.ok(e.sent.every(m => !/確認コード/.test(m.subject + m.body + m.htmlBody)));
  assert.equal(e.data.sheets.get("nr_trial_challenges").rows.length, 1);
  assert.equal(e.data.sheets.get("nr_trial_sessions").rows.length, 1);
  assert.equal(JSON.stringify(e.master.sheets.get("Members").rows), before);
  assert.equal(e.call("get9RoundTrialBooking", { email: "trial0@example.invalid", application_id: result.data.application_id }).code, "TRIAL_LINK_INVALID");
});

test("direct booking validates email and honeypot; obsolete code actions are unavailable", () => {
  const e = fixture();
  for (const email of ["", "bad-email", "outsider@example.invalid"]) assert.equal(book(e, e.applicant(), { email }).ok, false);
  assert.equal(book(e, e.applicant(), { website: "bot" }).code, "INVALID_REQUEST");
  assert.equal(e.call("request9RoundTrialCode", { email: e.applicant() }).code, "ACTION_NOT_FOUND");
  assert.equal(e.call("verify9RoundTrialCode", { challenge_id: "old", code: "123456" }).code, "ACTION_NOT_FOUND");
  assert.equal(e.data.sheets.get("nr_trial_applications").rows.length, 1); assert.equal(e.sent.length, 0);
});

test("repeated submission reserves and sends confirmation only once", () => {
  const e = fixture(), email = e.applicant();
  const first = book(e, email), mails = e.sent.length;
  assert.equal(first.ok, true); assert.equal(book(e, email).data.application_id, first.data.application_id);
  assert.equal(book(e, email).data.already_booked, true); assert.equal(e.sent.length, mails);
  assert.equal(e.data.sheets.get("nr_trial_applications").rows.length, 2);
  assert.equal(book(e, email, { party_size: 2, companion_name: "別人" }).code, "REQUEST_CONFLICT");
  assert.equal(book(e, email, { request_id: "another-request-0001" }).code, "ALREADY_BOOKED");
  const collision = book(e, e.applicant(1), { request_id: payload(email).request_id });
  assert.equal(collision.code, "REQUEST_CONFLICT"); assert.equal(collision.data, undefined);
});

test("outside MPG coverage the first reservation removes only the other type at that time", () => {
  for (const first of ["DAILY", "TRIAL"]) {
    const e = fixture(), token = e.login(), date = "2026-10-19", time = "10:15";
    const dailyBody = { session_token: token, date, slot_id: "DAILY:" + date + ":" + time };
    const trialBody = { date, slot_id: "TRIAL:" + date + ":" + time };
    const daily = () => e.call("create9RoundWorkoutBooking", dailyBody);
    const trial = () => book(e, e.applicant(), trialBody);
    assert.equal((first === "DAILY" ? daily() : trial()).ok, true);
    const blocked = first === "DAILY" ? trial() : daily();
    assert.equal(blocked.code, first === "DAILY" ? "TRIAL_UNAVAILABLE" : "SLOT_BLOCKED");
    const workoutSlots = e.call("get9RoundWorkoutSlots", { session_token: token, date }).data.slots;
    const trialSlots = e.call("get9RoundTrialSlots", { date }).data.slots;
    assert.equal(workoutSlots.some(s => s.start_time === time), first === "DAILY");
    assert.equal(trialSlots.some(s => s.start_time === time), first === "TRIAL");
    assert.ok(workoutSlots.some(s => s.start_time === "11:00")); assert.ok(trialSlots.some(s => s.start_time === "11:00"));
    const board = e.call("get9RoundBookingBoard", { id_token: "admin", date }).data.slots.filter(s => s.start_time === time);
    assert.deepEqual(board.map(s => s.kind), [first]);
    // The retained side continues accepting its own capacity.
    if (first === "DAILY") assert.equal(e.call("create9RoundWorkoutBooking", { ...dailyBody, session_token: e.login(1) }).ok, true);
    else assert.equal(book(e, e.applicant(1), trialBody).ok, true);
  }
});

test("only full active Kawakami MPG coverage permits parallel reservations", () => {
  for (const [date, time, parallel] of [
    ["2026-10-18", "10:15", true], ["2026-10-18", "11:00", true], ["2026-10-18", "11:45", false],
    ["2026-10-19", "10:15", false], ["2026-10-19", "16:15", false], ["2026-10-22", "11:00", false],
    ["2026-10-21", "18:30", false], ["2026-10-21", "19:15", true], ["2026-10-21", "20:00", true]
  ]) {
    const e = fixture();
    assert.equal(e.call("create9RoundWorkoutBooking", { session_token: e.login(), date, slot_id: "DAILY:" + date + ":" + time }).ok, true);
    const trial = book(e, e.applicant(), { date, slot_id: "TRIAL:" + date + ":" + time });
    assert.equal(trial.ok, parallel, date + " " + time + " " + JSON.stringify(trial));
  }
});

test("draft shifts do not authorize parallel reception and publication immediately restores it", () => {
  const e = fixture(), date = "2026-10-18", token = e.login();
  e.directory.sheets.get("staff_shift_publications").rows.push(["MPG", "2026-10", "DRAFT"]);
  e.call("create9RoundWorkoutBooking", { session_token: token, date, slot_id: "DAILY:" + date + ":10:15" });
  assert.equal(book(e, e.applicant()).code, "TRIAL_UNAVAILABLE");
  e.directory.sheets.get("staff_shift_publications").rows[1][2] = "PUBLISHED";
  assert.equal(book(e, e.applicant()).ok, true);
});

test("MPG training support closes overlapping trials and is rechecked on direct or changed bookings", () => {
  const e = fixture(), date = "2026-10-18";
  const a = book(e, e.applicant(), { slot_id: "TRIAL:" + date + ":11:45" }).data;
  e.directory.sheets.get("reservations").rows.push(["KAWAKAMI", "MPG_TRAINING_SUPPORT45", date, "10:30", "11:15", "CONFIRMED"]);
  const slots = e.call("get9RoundTrialSlots", { date }).data.slots;
  for (const time of ["10:15", "11:00"]) {
    assert.equal(slots.find(s => s.start_time === time).closed, true);
    assert.equal(book(e, e.applicant(1), { slot_id: "TRIAL:" + date + ":" + time }).code, "TRIAL_UNAVAILABLE");
  }
  assert.equal(slots.find(s => s.start_time === "11:45").available, true);
  assert.equal(e.call("reschedule9RoundTrialBooking", { application_id: a.application_id, trial_token: a.trial_token, date, slot_id: "TRIAL:" + date + ":11:00" }).code, "TRIAL_UNAVAILABLE");
  assert.equal(e.call("get9RoundTrialBooking", a).data.start_time, "11:45");
  e.directory.sheets.get("reservations").rows[1][5] = "CANCELLED";
  assert.equal(book(e, e.applicant(1)).ok, true);
});

test("support conflicts are scoped to Kawakami and use a 45-minute fallback without blocking the next slot", () => {
  for (const [staff, status, blocked] of [["KAWAKAMI", "CONFIRMED", true], ["", "CONFIRMED", true], ["OTHER", "CONFIRMED", false], ["KAWAKAMI", "CANCELED", false], ["KAWAKAMI", "CANCEL", false]]) {
    const e = fixture(), date = "2026-10-18";
    e.directory.sheets.get("reservations").rows.push([staff, "MPG_TRAINING_SUPPORT45", date, "10:15", "", status]);
    const slots = e.call("get9RoundTrialSlots", { date }).data.slots;
    assert.equal(slots[0].closed, blocked, staff + " " + status); assert.equal(slots[1].available, true);
    assert.equal(e.call("create9RoundWorkoutBooking", { session_token: e.login(), date, slot_id: "DAILY:" + date + ":10:15" }).ok, true);
  }
});

test("a later MPG support reservation stops trial additions and flags existing trials without cancelling them", () => {
  const e = fixture(), date = "2026-10-18", a = book(e, e.applicant()).data;
  e.directory.sheets.get("reservations").rows.push(["KAWAKAMI", "MPG_TRAINING_SUPPORT45", date, "10:15", "11:00", "CONFIRMED"]);
  assert.equal(book(e, e.applicant(1)).code, "TRIAL_UNAVAILABLE");
  assert.equal(book(e, e.applicant()).data.already_booked, true);
  const board = e.call("get9RoundBookingBoard", { id_token: "staff", date }).data.slots;
  const trial = board.find(s => s.slot_id === "TRIAL:" + date + ":10:15");
  assert.equal(trial.status, "CLOSED"); assert.equal(trial.mpg_conflict, true); assert.equal(trial.members[0].application_id, a.application_id);
  assert.equal(board.some(s => s.slot_id === "DAILY:" + date + ":10:15"), false);
  assert.equal(e.call("get9RoundTrialBooking", a).data.status, "CONFIRMED");
  assert.equal(e.call("cancel9RoundTrialBooking", a).ok, true);
});

test("the last daily cancellation restores trials, while remaining daily reservations retain ownership", () => {
  const e = fixture(), date = "2026-10-19", tokens = [e.login(), e.login(1)], ids = [];
  for (const token of tokens) ids.push(e.call("create9RoundWorkoutBooking", { session_token: token, date, slot_id: "DAILY:" + date + ":10:15" }).data.booking_id);
  const hasTrial = () => e.call("get9RoundTrialSlots", { date }).data.slots.some(s => s.start_time === "10:15");
  assert.equal(hasTrial(), false);
  e.call("cancel9RoundWorkoutBooking", { session_token: tokens[0], booking_id: ids[0] }); assert.equal(hasTrial(), false);
  e.call("cancel9RoundWorkoutBooking", { session_token: tokens[1], booking_id: ids[1] }); assert.equal(hasTrial(), true);
  assert.equal(book(e, e.applicant(), { date, slot_id: "TRIAL:" + date + ":10:15" }).ok, true);
});

test("the last trial cancellation restores daily slots without deleting trial history", () => {
  const e = fixture(), date = "2026-10-19", token = e.login();
  const applications = [0, 1].map(i => book(e, e.applicant(i), { date, slot_id: "TRIAL:" + date + ":10:15" }).data);
  const hasDaily = () => e.call("get9RoundWorkoutSlots", { session_token: token, date }).data.slots.some(s => s.start_time === "10:15");
  assert.equal(hasDaily(), false);
  applications.forEach((a, i) => {
    assert.equal(e.call("cancel9RoundTrialBooking", { application_id: a.application_id, trial_token: a.trial_token }).ok, true);
    assert.equal(hasDaily(), i === 1);
  });
  assert.equal(e.data.sheets.get("nr_trial_applications").rows.length, 3);
});

test("daily reschedules recheck competing trials for member, staff and signed-email actions", () => {
  const e = fixture(), date = "2026-10-19", token = e.login();
  const daily = e.call("create9RoundWorkoutBooking", { session_token: token, date, slot_id: "DAILY:" + date + ":10:15" }).data;
  assert.equal(book(e, e.applicant(), { date, slot_id: "TRIAL:" + date + ":11:00" }).ok, true);
  const target = { booking_id: daily.booking_id, date, slot_id: "DAILY:" + date + ":11:00" };
  const link = new URL(e.sent.find(m => /予約確認/.test(m.subject) && /デイリーワークアウト/.test(m.body)).body.match(/https:\/\/[^\s]+#booking_id=[^\s]+/)[0]);
  const mail = Object.fromEntries(new URLSearchParams(link.hash.slice(1)));
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { ...target, session_token: token }).code, "SLOT_BLOCKED");
  assert.equal(e.call("reschedule9RoundManagedBooking", { ...target, id_token: "staff" }).code, "SLOT_BLOCKED");
  assert.equal(e.call("reschedule9RoundMailBooking", { ...target, ...mail }).code, "SLOT_BLOCKED");
  const mailSlots = e.call("get9RoundMailSlots", { ...mail, date });
  assert.equal(mailSlots.data.slots.some(s => s.start_time === "11:00"), false);
  assert.equal(e.call("get9RoundMemberBookings", { session_token: token }).data.bookings[0].start_time, "10:15");
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { ...target, session_token: token, slot_id: "DAILY:" + date + ":11:45" }).ok, true);
  const trials = e.call("get9RoundTrialSlots", { date }).data.slots;
  assert.ok(trials.some(s => s.start_time === "10:15")); assert.equal(trials.some(s => s.start_time === "11:45"), false);
});

test("trial reschedules preserve the original if daily won, then transfer ownership to a free slot", () => {
  const e = fixture(), date = "2026-10-19", token = e.login();
  const a = book(e, e.applicant(), { date, slot_id: "TRIAL:" + date + ":10:15" }).data;
  e.call("create9RoundWorkoutBooking", { session_token: token, date, slot_id: "DAILY:" + date + ":11:00" });
  const body = { application_id: a.application_id, trial_token: a.trial_token, date };
  assert.equal(e.call("reschedule9RoundTrialBooking", { ...body, slot_id: "TRIAL:" + date + ":11:00" }).code, "TRIAL_UNAVAILABLE");
  assert.equal(e.call("get9RoundTrialBooking", body).data.start_time, "10:15");
  assert.equal(e.call("reschedule9RoundTrialBooking", { ...body, slot_id: "TRIAL:" + date + ":11:45" }).ok, true);
  const daily = e.call("get9RoundWorkoutSlots", { session_token: token, date }).data.slots;
  assert.ok(daily.some(s => s.start_time === "10:15")); assert.equal(daily.some(s => s.start_time === "11:45"), false);
});

test("reopened automatic availability retains manual deleted and closed settings", () => {
  const e = fixture(), date = "2026-10-19", token = e.login();
  const trial = { id_token: "admin", date, start_time: "10:15", slot_id: "TRIAL:" + date + ":10:15", capacity: 2, status: "CLOSED" };
  assert.equal(e.call("save9RoundTrialSlot", trial).ok, true);
  const daily = e.call("create9RoundWorkoutBooking", { session_token: token, date, slot_id: "DAILY:" + date + ":10:15" }).data;
  e.call("cancel9RoundWorkoutBooking", { session_token: token, booking_id: daily.booking_id });
  assert.equal(e.call("get9RoundTrialSlots", { date }).data.slots[0].closed, true);
  const a = book(e, e.applicant(), { date, slot_id: "TRIAL:" + date + ":11:00" }).data;
  assert.equal(e.call("delete9RoundBookingSlot", { id_token: "admin", date, slot_id: "DAILY:" + date + ":11:00" }).ok, true);
  e.call("cancel9RoundTrialBooking", { application_id: a.application_id, trial_token: a.trial_token });
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date }).data.slots.some(s => s.start_time === "11:00"), false);
});

test("direct booking rate limits new requests while still permitting an idempotent retry", () => {
  const e = fixture(), email = e.applicant(), date = "2026-10-19";
  const times = ["10:15", "11:00", "11:45", "12:30", "13:15", "16:15"];
  for (let i = 0; i < 5; i++) assert.equal(book(e, email, { date, slot_id: "TRIAL:" + date + ":" + times[i], request_id: "trial-rate-request-000" + i }).ok, true);
  assert.equal(book(e, email, { date, slot_id: "TRIAL:" + date + ":16:15", request_id: "trial-rate-request-0005" }).code, "RATE_LIMIT");
  assert.equal(book(e, email, { date, slot_id: "TRIAL:" + date + ":10:15", request_id: "trial-rate-request-0000" }).data.already_booked, true);
  const rows = e.data.sheets.get("nr_trial_applications").rows;
  while (rows.length < 41) { const row = [...rows[1]]; row[0] += rows.length; row[11] = "other" + rows.length + "@example.invalid"; rows.push(row); }
  assert.equal(book(e, e.applicant(1), { date, slot_id: "TRIAL:" + date + ":16:15" }).code, "RATE_LIMIT");
});

test("contact and consent validation precede every booking", () => {
  const e = fixture(), email = e.applicant();
  for (const extra of [{ consent: false }, { phone: "123" }, { name: "\n" }, { party_size: 2 }, { request_id: "x" }]) assert.equal(book(e, email, extra).ok, false);
  assert.equal(e.data.sheets.get("nr_trial_applications").rows.length, 1);
  assert.equal(book(e, email, { name: "=SUM(1,2)", phone: "０９０－１２３４－５６７８" }).ok, true);
  assert.ok(e.data.sheets.get("nr_trial_applications").rows[1].some(v => String(v).startsWith("'=SUM")));
});

test("signed trial links are scoped, read-only on lookup, and work after six hours", () => {
  const e = fixture(), result = book(e, e.applicant()).data;
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
  const e = fixture(), a = book(e, e.applicant()).data;
  book(e, e.applicant(1), { slot_id: "TRIAL:2026-10-18:11:00", party_size: 2, companion_name: "同行者" });
  const failed = e.call("reschedule9RoundTrialBooking", { application_id: a.application_id, trial_token: a.trial_token, date: "2026-10-18", slot_id: "TRIAL:2026-10-18:11:00" });
  assert.equal(failed.code, "TRIAL_FULL");
  assert.equal(e.call("get9RoundTrialBooking", { application_id: a.application_id, trial_token: a.trial_token }).data.start_time, "10:15");
  e.setNow("2026-10-18T00:15:00.001Z");
  assert.equal(e.call("cancel9RoundTrialBooking", { application_id: a.application_id, trial_token: a.trial_token }).code, "DEADLINE_PASSED");
});

test("a removed MPG shift preserves both accepted bookings, stops additions and alerts staff", () => {
  const e = fixture(), token = e.login(), a = book(e, e.applicant()).data;
  assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date: "2026-10-18", slot_id: "DAILY:2026-10-18:10:15" }).ok, true);
  e.directory.sheets.get("staff_shifts").rows[1][5] = "false";
  const trial = e.call("get9RoundTrialSlots", { date: "2026-10-18" }).data.slots.find(s => s.start_time === "10:15");
  assert.equal(trial, undefined);
  const daily = e.call("get9RoundWorkoutSlots", { session_token: token, date: "2026-10-18" }).data.slots.find(s => s.start_time === "10:15");
  assert.equal(daily.available, false); assert.equal(daily.is_booked, true); assert.equal(daily.can_cancel, true);
  assert.equal(book(e, e.applicant(1)).code, "TRIAL_UNAVAILABLE");
  assert.equal(e.call("create9RoundWorkoutBooking", { session_token: e.login(1), date: "2026-10-18", slot_id: "DAILY:2026-10-18:10:15" }).code, "SLOT_BLOCKED");
  const board = e.call("get9RoundBookingBoard", { id_token: "staff", date: "2026-10-18" }).data.slots.filter(s => s.start_time === "10:15");
  assert.equal(board.length, 2); assert.ok(board.every(s => s.staffing_conflict && s.status === "CLOSED"));
  assert.equal(board.find(s => s.kind === "TRIAL").members[0].application_id, a.application_id);
  e.directory.sheets.get("staff_shifts").rows[1][5] = "true";
  assert.equal(e.call("get9RoundTrialSlots", { date: "2026-10-18" }).data.slots[0].available, true);
});

test("after MPG shift removal, zero daily bookings allow trials and an existing daily booking hides them", () => {
  for (const first of ["NONE", "DAILY", "TRIAL"]) {
    const e = fixture(), token = e.login(), date = "2026-10-18";
    if (first === "DAILY") e.call("create9RoundWorkoutBooking", { session_token: token, date, slot_id: "DAILY:" + date + ":10:15" });
    if (first === "TRIAL") assert.equal(book(e, e.applicant()).ok, true);
    // The MPG cleaner keeps the row but sets active=false.
    e.directory.sheets.get("staff_shifts").rows[1][5] = "false";
    const hasDaily = () => e.call("get9RoundWorkoutSlots", { session_token: token, date }).data.slots.some(s => s.start_time === "10:15");
    const hasTrial = () => e.call("get9RoundTrialSlots", { date }).data.slots.some(s => s.start_time === "10:15");
    assert.equal(hasDaily(), first !== "TRIAL"); assert.equal(hasTrial(), first !== "DAILY");
    if (first === "NONE") {
      assert.equal(book(e, e.applicant()).ok, true); assert.equal(hasDaily(), false); assert.equal(hasTrial(), true);
    }
    if (first === "DAILY") assert.equal(book(e, e.applicant()).code, "TRIAL_UNAVAILABLE");
    if (first === "TRIAL") assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date, slot_id: "DAILY:" + date + ":10:15" }).code, "SLOT_BLOCKED");
  }
});

test("staff trial actions need verified staff authority and write an audit record", () => {
  const e = fixture(), a = book(e, e.applicant()).data, body = { application_id: a.application_id };
  assert.equal(e.call("cancel9RoundManagedTrialBooking", { ...body, permission: "ADMIN" }).code, "STAFF_SESSION_EXPIRED");
  assert.equal(e.call("cancel9RoundManagedTrialBooking", { ...body, id_token: "other" }).code, "FORBIDDEN");
  assert.equal(e.call("get9RoundManagedTrialBooking", { ...body, id_token: "staff" }).data.name, "体験 太郎");
  assert.equal(e.call("cancel9RoundManagedTrialBooking", { ...body, id_token: "staff" }).data.status, "CANCELLED");
  assert.ok(e.data.sheets.get("nr_management_actions").rows.some(r => r.includes("TRIAL_CANCELLED") && r.includes("S")));
});

test("automatic trial slots can be stopped, deleted and restored only within the allowed schedule", () => {
  const e = fixture(), body = { id_token: "admin", date: "2026-10-18", start_time: "10:15", slot_id: "TRIAL:2026-10-18:10:15", capacity: 2 };
  assert.equal(e.call("save9RoundTrialSlot", { ...body, start_time: "12:45" }).code, "TRIAL_UNAVAILABLE");
  assert.equal(e.call("save9RoundTrialSlot", { ...body, capacity: 3 }).code, "INVALID_CAPACITY");
  assert.equal(e.call("delete9RoundBookingSlot", body).ok, true);
  assert.equal(e.call("get9RoundTrialSlots", { date: body.date }).data.slots.some(s => s.slot_id === body.slot_id), false);
  assert.equal(e.call("restore9RoundBookingSlot", body).ok, true);
  assert.equal(e.call("get9RoundTrialSlots", { date: body.date }).data.slots[0].available, false);
  assert.equal(e.call("save9RoundTrialSlot", { ...body, slot_id: "", status: "OPEN" }).code, "DUPLICATE_TRIAL");
  assert.equal(e.call("save9RoundTrialSlot", { ...body, status: "OPEN" }).ok, true);
  assert.equal(book(e, e.applicant()).ok, true);
  assert.equal(e.call("delete9RoundBookingSlot", body).code, "SLOT_HAS_BOOKINGS");
});

test("mail failures preserve confirmed trials and can be retried without duplicating messages", () => {
  const e = fixture(), email = e.applicant(); e.mailFailure(true);
  const result = book(e, email);
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
