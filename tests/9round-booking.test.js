const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));

function environment(options = {}) {
  let now = Date.parse("2026-10-17T00:00:00Z"), locked = false, failMail = false;
  const sent = [], opens = [], writes = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  class Sheet {
    constructor(name, rows = []) { this.name = name; this.rows = rows; }
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
    getLastRow() { return this.rows.length; }
    setFrozenRows() {}
    getDataRange() { return this.getRange(1, 1, Math.max(1, this.rows.length), Math.max(1, this.getLastColumn())); }
    getRange(row, col, height = 1, width = 1) {
      const sheet = this;
      return {
        getDisplayValues() {
          return Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => {
            const v = sheet.rows[row - 1 + r]?.[col - 1 + c] ?? "";
            return String(v).startsWith("'") ? String(v).slice(1) : String(v);
          }));
        },
        setNumberFormat() { return this; },
        setValues(values) {
          assert.equal(locked, true, "all data writes must hold the same script lock");
          writes.push(sheet.name);
          values.forEach((valuesRow, r) => {
            sheet.rows[row - 1 + r] ||= [];
            valuesRow.forEach((v, c) => { sheet.rows[row - 1 + r][col - 1 + c] = v; });
          });
          return this;
        }
      };
    }
  }
  class Spreadsheet {
    constructor(id) { this.id = id; this.sheets = new Map(); }
    getId() { return this.id; }
    getSheetByName(name) { return this.sheets.get(name) || null; }
    insertSheet(name) { const sheet = new Sheet(name); this.sheets.set(name, sheet); return sheet; }
  }
  const data = new Spreadsheet("test-booking-data"), master = new Spreadsheet("test-member-master"), active = new Spreadsheet("live-app"), directory = new Spreadsheet("test-staff-directory");
  directory.sheets.set("auth_users", new Sheet("auth_users", [
    ["email", "staff_code", "permission", "active"],
    ["admin@example.invalid", "A", "ADMIN", "true"], ["manager@example.invalid", "M", "MANAGER", "true"],
    ["staff@example.invalid", "S", "STAFF", "true"], ["other@example.invalid", "Y", "STAFF", "true"],
    ["inactive@example.invalid", "I", "STAFF", "true"]
  ]));
  directory.sheets.set("staff", new Sheet("staff", [
    ["staff_code", "store_code", "active", "can_9round"],
    ["A", "YACHIYO", "true", "false"], ["M", "YACHIYO", "true", "false"],
    ["S", "SOGA", "true", "true"], ["Y", "YACHIYO", "true", "false"], ["I", "SOGA", "false", "true"]
  ]));
  master.sheets.set("Members", new Sheet("Members", [
    ["会員番号", "名前", "メールアドレス", "会員ステータス"],
    ...Array.from({ length: 8 }, (_, i) => [String(1000000 + i), "テスト会員" + i, "member" + i + "@example.invalid", "ok"]),
    ["9999991", "休会会員", "suspended@example.invalid", "kyukai"]
  ]));
  const properties = {
    ROUND9_BOOKING_ENABLED: "true", ROUND9_BOOKING_ENV: "development",
    ROUND9_BOOKING_SPREADSHEET_ID: data.id, ROUND9_BOOKING_MEMBER_MASTER_ID: master.id,
    ROUND9_BOOKING_MEMBER_MASTER_SHEET: "Members", ROUND9_BOOKING_SECRET: "test-only-signing-secret-with-at-least-32-characters",
    ROUND9_BOOKING_TEST_EMAILS: Array.from({ length: 8 }, (_, i) => "member" + i + "@example.invalid").concat(["admin", "manager", "staff", "other", "inactive"].map(s => s + "@example.invalid")).join(","),
    ROUND9_BOOKING_FIREBASE_API_KEY: "test-firebase-key", ROUND9_BOOKING_STAFF_DIRECTORY_ID: directory.id,
    ...options.properties
  };
  const users = {
    admin: { permission: "ADMIN", staff_code: "A", profile: { active: true, store_code: "YACHIYO" } },
    manager: { permission: "MANAGER", staff_code: "M", profile: { active: true, store_code: "YACHIYO" } },
    staff: { permission: "STAFF", staff_code: "S", profile: { active: true, store_code: "SOGA" } },
    other: { permission: "STAFF", staff_code: "Y", profile: { active: true, store_code: "YACHIYO" } },
    inactive: { permission: "STAFF", staff_code: "I", profile: { active: false, store_code: "SOGA" } }
  };
  const context = {
    Date: Clock,
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => properties }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => active,
      openById(id) { opens.push(id); const ss = [data, master, directory].find(s => s.id === id); if (!ss) throw Error("Unknown test spreadsheet"); return ss; },
      flush() { assert.equal(locked, true); }
    },
    LockService: { getScriptLock: () => ({
      waitLock() { assert.equal(locked, false); locked = true; },
      releaseLock() { assert.equal(locked, true); locked = false; }
    }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), Charset: { UTF_8: "UTF-8" },
      computeHmacSha256Signature: (value, key) => Array.from(crypto.createHmac("sha256", key).update(value).digest()),
      formatDate(value, timezone, format) {
        assert.equal(timezone, "Asia/Tokyo"); assert.equal(format, "yyyy-MM-dd");
        return new Date(value.getTime() + 9 * 3600000).toISOString().slice(0, 10);
      }
    },
    MailApp: { sendEmail(mail) { if (failMail) throw Error("mail unavailable"); sent.push(mail); } },
    UrlFetchApp: { fetch(url, options) {
      assert.match(url, /^https:\/\/identitytoolkit.googleapis.com\/v1\/accounts:lookup/);
      const token = JSON.parse(options.payload).idToken, user = users[token];
      return { getResponseCode: () => user ? 200 : 400,
        getContentText: () => JSON.stringify(user ? { users: [{ email: token + "@example.invalid" }] } : { error: "invalid" }) };
    } },
    nrBookingVerifiedStaff_(config, body) {
      const user = users[body.id_token];
      if (!user || !user.profile.active || (user.permission === "STAFF" && user.profile.store_code !== "SOGA")) {
        context.nrBookingError_("FORBIDDEN", "unauthorized");
      }
      return user;
    },
    successResponse: data => ({ ok: true, data: plain(data) }),
    errorResponse: (message, code) => ({ ok: false, message, code })
  };
  vm.createContext(context);
  vm.runInContext(read("9round-booking/gas/Booking.gs"), context);
  if (options.realStaffAuth) vm.runInContext(read("9round-booking/gas/StaffAuth.gs"), context);
  if (!options.noSetup) context.setup9RoundBookingStorage_();
  function call(action, body = {}) { const result = context.round9BookingApi_(action, body); assert.equal(locked, false, "lock must be released on all paths"); return plain(result); }
  function login(i = 0) {
    const email = "member" + i + "@example.invalid";
    const challenge = call("request9RoundBookingCode", { email });
    assert.equal(challenge.ok, true, JSON.stringify(challenge));
    const code = sent.at(-1).body.match(/は (\d{6})/)[1];
    const verified = call("verify9RoundBookingCode", { challenge_id: challenge.data.challenge_id, code });
    assert.equal(verified.ok, true, JSON.stringify(verified));
    return verified.data.session_token;
  }
  return { context, properties, data, master, directory, sent, opens, writes, call, login,
    advance: ms => { now += ms; }, setNow: value => { now = Date.parse(value); },
    mailFailure: value => { failMail = value; } };
}
const day = "2026-10-18";
const slotId = "DAILY:" + day + ":10:15";
const reserve = (e, token, slot = slotId, date = day, extra = {}) => e.call("create9RoundWorkoutBooking", { session_token: token, date, slot_id: slot, ...extra });

test("all 11 daily slots are exactly 45 minutes, with the specified midday break", () => {
  const e = environment(), slots = plain(e.context.nrBookingDailySlots_(day));
  assert.deepEqual(slots.map(s => [s.start_time, s.end_time]), [
    ["10:15", "11:00"], ["11:00", "11:45"], ["11:45", "12:30"], ["12:30", "13:15"], ["13:15", "14:00"],
    ["16:15", "17:00"], ["17:00", "17:45"], ["17:45", "18:30"], ["18:30", "19:15"], ["19:15", "20:00"], ["20:00", "20:45"]
  ]);
  assert.ok(slots.every(s => s.capacity === 4 && s.kind === "DAILY"));
});

test("disabled and misconfigured environments never open or write any spreadsheet", () => {
  const e = environment({ noSetup: true, properties: { ROUND9_BOOKING_ENABLED: "false" } });
  assert.equal(e.call("get9RoundWorkoutSlots").code, "BOOKING_DISABLED");
  assert.deepEqual(e.opens, []); assert.deepEqual(e.writes, []);
  e.properties.ROUND9_BOOKING_ENABLED = "true";
  e.properties.ROUND9_BOOKING_SPREADSHEET_ID = "test-member-master";
  assert.equal(e.call("request9RoundBookingCode", { email: "member0@example.invalid" }).code, "BOOKING_CONFIGURATION");
  assert.deepEqual(e.opens, []);
  e.properties.ROUND9_BOOKING_SPREADSHEET_ID = "test-booking-data";
  e.properties.ROUND9_MEMBER_MASTER_ID = "test-member-master";
  assert.equal(e.call("request9RoundBookingCode", { email: "member0@example.invalid" }).code, "BOOKING_CONFIGURATION");
  assert.deepEqual(e.opens, []);
});

test("email ownership is required; OTP is single use and never returned or stored as plaintext", () => {
  const e = environment();
  assert.equal(e.call("get9RoundWorkoutSlots", { email: "member0@example.invalid", date: day }).code, "SESSION_EXPIRED");
  const request = e.call("request9RoundBookingCode", { email: " MEMBER0@example.invalid " });
  const code = e.sent[0].body.match(/は (\d{6})/)[1], id = request.data.challenge_id;
  assert.equal(JSON.stringify(request).includes(code), false);
  assert.equal(e.data.sheets.get("nr_challenges").rows[1].includes(code), false);
  assert.equal(e.call("verify9RoundBookingCode", { challenge_id: id, code: code === "999999" ? "888888" : "999999" }).code, "INVALID_CODE");
  const verified = e.call("verify9RoundBookingCode", { challenge_id: id, code });
  assert.equal(verified.ok, true); assert.match(verified.data.session_token, /^[a-f0-9]{64}$/);
  assert.equal(e.call("verify9RoundBookingCode", { challenge_id: id, code }).code, "INVALID_CODE");
  assert.ok(!JSON.stringify(e.data.sheets.get("nr_sessions").rows).includes(verified.data.session_token));
});

test("unknown, suspended, shared-email and non-allowlisted addresses receive no identity information or mail", () => {
  const e = environment();
  const known = e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
  for (const email of ["unknown@example.invalid", "suspended@example.invalid"]) {
    const result = e.call("request9RoundBookingCode", { email });
    assert.deepEqual(Object.keys(result.data), Object.keys(known.data)); assert.equal(result.data.message, known.data.message);
  }
  e.master.sheets.get("Members").rows.push(["8888888", "別会員", "member1@example.invalid", "ok"]);
  e.call("request9RoundBookingCode", { email: "member1@example.invalid" });
  e.properties.ROUND9_BOOKING_TEST_EMAILS = "member0@example.invalid";
  e.call("request9RoundBookingCode", { email: "member2@example.invalid" });
  assert.equal(e.sent.length, 1);
});

test("code guessing locks after five attempts; expired codes and resends are bounded", () => {
  const e = environment();
  const request = e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
  const id = request.data.challenge_id, code = e.sent[0].body.match(/は (\d{6})/)[1];
  assert.equal(e.call("request9RoundBookingCode", { email: "member0@example.invalid" }).code, "RATE_LIMIT");
  for (let i = 0; i < 5; i++) assert.equal(e.call("verify9RoundBookingCode", { challenge_id: id, code: "invalid" }).code, "INVALID_CODE");
  assert.equal(e.call("verify9RoundBookingCode", { challenge_id: id, code }).code, "INVALID_CODE");
  e.advance(61000);
  const second = e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
  e.advance(600001);
  assert.equal(e.call("verify9RoundBookingCode", { challenge_id: second.data.challenge_id, code: e.sent.at(-1).body.match(/は (\d{6})/)[1] }).code, "INVALID_CODE");
  for (let i = 0; i < 3; i++) { e.advance(61000); assert.equal(e.call("request9RoundBookingCode", { email: "member0@example.invalid" }).ok, true); }
  e.advance(61000);
  assert.equal(e.call("request9RoundBookingCode", { email: "member0@example.invalid" }).code, "RATE_LIMIT");
});

test("mail failure invalidates the challenge and releases the lock", () => {
  const e = environment(); e.mailFailure(true);
  assert.equal(e.call("request9RoundBookingCode", { email: "member0@example.invalid" }).code, "MAIL_FAILED");
  assert.equal(e.data.sheets.get("nr_challenges").rows[1][7], "SEND_FAILED");
});

test("five competing members get four places; duplicate taps stay idempotent even at capacity", async () => {
  const e = environment(), tokens = Array.from({ length: 5 }, (_, i) => e.login(i));
  const results = await Promise.all(tokens.map(token => Promise.resolve().then(() => reserve(e, token))));
  assert.equal(results.filter(r => r.ok).length, 4);
  assert.equal(results[4].code, "SLOT_FULL");
  const retry = reserve(e, tokens[0], slotId, day, { member_no: "fake", member_name: "forged" });
  assert.equal(retry.data.booking_id, results[0].data.booking_id); assert.equal(retry.data.already_booked, true);
  const data = e.call("get9RoundWorkoutSlots", { session_token: tokens[0], date: day }).data;
  assert.equal(data.slots[0].booked_count, 4); assert.equal(data.slots[0].is_booked, true);
  assert.equal(JSON.stringify(data).includes("テスト会員"), false);
  assert.equal(JSON.stringify(data).includes("@example.invalid"), false);
  assert.equal(JSON.stringify(data).includes("1000001"), false);
  assert.equal(e.writes.includes("Members"), false);
});

test("cancellation is owner-only and immediately releases capacity", () => {
  const e = environment(), tokens = [e.login(0), e.login(1)];
  const booking = reserve(e, tokens[0]).data.booking_id;
  assert.equal(e.call("cancel9RoundWorkoutBooking", { session_token: tokens[1], booking_id: booking }).code, "BOOKING_NOT_FOUND");
  assert.equal(e.call("cancel9RoundWorkoutBooking", { session_token: tokens[0], booking_id: booking }).ok, true);
  assert.equal(e.call("cancel9RoundWorkoutBooking", { session_token: tokens[0], booking_id: booking }).ok, true);
  assert.equal(reserve(e, tokens[1]).ok, true);
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: tokens[0], date: day }).data.slots[0].booked_count, 1);
});

test("staff names require a valid eligible staff account; forged roles and other stores cannot read them", () => {
  const e = environment(), token = e.login(); reserve(e, token, slotId, day, { member_name: "forged" });
  for (const body of [{ session_token: token, permission: "ADMIN" }, { id_token: "other" }, { id_token: "inactive" }]) {
    assert.equal(e.call("get9RoundBookingBoard", { date: day, ...body }).ok, false);
  }
  for (const id_token of ["staff", "admin", "manager"]) {
    const result = e.call("get9RoundBookingBoard", { id_token, date: day });
    assert.equal(result.ok, true); assert.equal(result.data.slots[0].members[0].name, "テスト会員0");
  }
});

test("blocks are enforced on the server, preserve existing bookings, and can be lifted per day", () => {
  const e = environment(), first = e.login(0), second = e.login(1);
  const booking = reserve(e, first).data.booking_id;
  for (const id_token of ["staff", "other"]) {
    assert.equal(e.call("set9RoundWorkoutBlock", { id_token, date: day, slot_id: slotId, blocked: true }).ok, false);
  }
  const ids = plain(e.context.nrBookingDailySlots_(day)).map(s => s.slot_id);
  assert.equal(e.call("set9RoundWorkoutBlock", { id_token: "admin", date: day, slot_ids: ids, blocked: true }).ok, true);
  assert.equal(reserve(e, second).code, "SLOT_BLOCKED");
  assert.equal(reserve(e, first).data.booking_id, booking);
  const slots = e.call("get9RoundWorkoutSlots", { session_token: first, date: day }).data.slots;
  assert.ok(slots.every(s => s.blocked && !s.available)); assert.equal(slots[0].booked_count, 1); assert.equal(slots[0].can_cancel, true);
  const board = e.call("get9RoundBookingBoard", { id_token: "staff", date: day }).data;
  assert.equal(board.slots[0].status, "BLOCKED"); assert.equal(board.slots[0].members.length, 1);
  assert.equal(e.call("set9RoundWorkoutBlock", { id_token: "manager", date: day, slot_ids: ids, blocked: false }).ok, true);
  assert.equal(reserve(e, second).ok, true);
  assert.equal(e.call("set9RoundWorkoutBlock", { id_token: "admin", date: day, slot_id: "DAILY:2026-10-19:10:15", blocked: true }).code, "INVALID_SLOT");
  assert.equal(e.call("set9RoundWorkoutBlock", { id_token: "admin", date: day, slot_id: slotId, blocked: "false" }).code, "INVALID_BLOCK");
});

test("trial slots can be added and closed later without changing daily slots or accepting a daily booking", () => {
  const e = environment(), token = e.login();
  const payload = { date: day, start_time: "11:00", capacity: 2, title: "初回体験", status: "OPEN" };
  assert.equal(e.call("save9RoundTrialSlot", { id_token: "staff", ...payload }).ok, false);
  const created = e.call("save9RoundTrialSlot", { id_token: "admin", ...payload });
  assert.equal(created.ok, true);
  assert.equal(e.call("get9RoundBookingBoard", { id_token: "staff", date: day }).data.slots.length, 12);
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).data.slots.length, 11);
  assert.equal(reserve(e, token, created.data.slot_id).code, "INVALID_SLOT");
  assert.equal(e.call("save9RoundTrialSlot", { id_token: "admin", ...payload }).code, "DUPLICATE_TRIAL");
  assert.equal(e.call("save9RoundTrialSlot", { id_token: "admin", ...payload, slot_id: created.data.slot_id, status: "CLOSED" }).ok, true);
  for (const bad of [{ start_time: "13:30" }, { start_time: "15:00" }, { start_time: "20:15" }, { capacity: 5 }]) {
    assert.equal(e.call("save9RoundTrialSlot", { id_token: "admin", ...payload, ...bad }).ok, false);
  }
});

test("expired sessions, changed email, and suspended membership cannot reserve", () => {
  const e = environment(), token = e.login(0);
  e.master.sheets.get("Members").rows[1][3] = "kyukai";
  assert.equal(reserve(e, token).code, "MEMBER_UNAVAILABLE");
  e.master.sheets.get("Members").rows[1][3] = "ok";
  e.master.sheets.get("Members").rows[1][2] = "new@example.invalid";
  assert.equal(reserve(e, token).code, "MEMBER_UNAVAILABLE");
  e.master.sheets.get("Members").rows[1][2] = "member0@example.invalid";
  e.advance(6 * 3600000);
  assert.equal(reserve(e, token).code, "SESSION_EXPIRED");
});

test("logout revokes the server session and forged session values never authorize", () => {
  const e = environment(), token = e.login();
  assert.equal(e.call("logout9RoundBooking", { session_token: token }).ok, true);
  assert.equal(reserve(e, token).code, "SESSION_EXPIRED");
  assert.equal(reserve(e, "a".repeat(64)).code, "SESSION_EXPIRED");
});

test("date/time validation uses Japan time and rejects past, out-of-range and malformed slots", () => {
  const e = environment(), token = e.login();
  for (const date of ["2026-02-30", "2026-13-01", "2026-10-18junk"]) {
    assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date }).code, "INVALID_DATE");
  }
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: "2026-12-31" }).code, "DATE_OUT_OF_RANGE");
  e.setNow("2026-10-17T01:15:00Z"); // 10:15 JST: the first session has started.
  assert.equal(reserve(e, token, "DAILY:2026-10-17:10:15", "2026-10-17").code, "SLOT_STARTED");
  assert.equal(reserve(e, token, "DAILY:2026-10-18:14:00").code, "INVALID_SLOT");
  e.setNow("2026-10-17T15:01:00Z"); // 00:01 JST the next day.
  assert.equal(plain(e.context.nrBookingRange_({ days: 30 })).from, "2026-10-18");
});

test("standalone entry point accepts POST only and exposes no member data in GET", () => {
  const c = {
    round9BookingApi_: (action, body) => ({ action, body }),
    ContentService: { MimeType: { JSON: "application/json" }, createTextOutput: value => ({ setMimeType: () => JSON.parse(value) }) }
  };
  vm.createContext(c); vm.runInContext(read("9round-booking/gas/WebApp.gs"), c);
  const actions = ["request9RoundBookingCode", "verify9RoundBookingCode", "get9RoundWorkoutSlots", "create9RoundWorkoutBooking",
    "cancel9RoundWorkoutBooking", "logout9RoundBooking", "get9RoundBookingBoard", "save9RoundTrialSlot", "set9RoundWorkoutBlock"];
  for (const action of actions) {
    const result = c.doPost({ postData: { contents: JSON.stringify({ action, marker: "test" }) } });
    assert.equal(result.action, action); assert.equal(result.body.marker, "test");
    assert.equal(c.doGet({ parameter: { action, id_token: "not-used" } }).data.app, "9ROUND Booking");
  }
  assert.equal(c.doPost({ postData: { contents: "{" } }).code, "INVALID_REQUEST");
  assert.equal(c.doPost({ postData: { contents: "null" } }).code, "INVALID_REQUEST");
});

test("review config has no live endpoint, no deploy workflow, and no automatic triggers", () => {
  const c = { window: {} }; vm.runInNewContext(read("9round-booking/config.js"), c);
  assert.equal(c.window.ANAUTS_ROUND9_BOOKING.apiUrl, "");
  assert.doesNotMatch(read("9round-booking/gas/Booking.gs"), /ScriptApp\.newTrigger|CalendarApp|GmailApp|clasp push/);
  assert.doesNotMatch(read("admin/admin-9round-booking.js"), /set9RoundWorkoutBlock|save9RoundTrialSlot|create9RoundWorkoutBooking|cancel9RoundWorkoutBooking/);
  assert.equal(fs.existsSync(path.join(root, "gas/94_9RoundBooking.gs")), false);
  assert.doesNotMatch(read("gas/99_Main.gs"), /round9BookingApi_/);
});

test("standalone auth verifies Firebase, checks directory roles, and never writes to A-nauts", () => {
  const e = environment({ realStaffAuth: true });
  for (const id_token of ["admin", "manager", "staff"]) {
    const result = e.call("get9RoundBookingBoard", { id_token, date: day });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.can_manage, id_token !== "staff");
  }
  for (const id_token of ["other", "inactive", "invalid", ""]) {
    assert.equal(e.call("get9RoundBookingBoard", { id_token, date: day }).ok, false);
  }
  assert.ok(e.writes.every(name => name.startsWith("nr_")));
  assert.equal(e.call("set9RoundWorkoutBlock", { id_token: "staff", date: day, slot_id: slotId, blocked: true }).code, "FORBIDDEN");
});

test("directory deactivation and removed access take effect on the next request", () => {
  const e = environment({ realStaffAuth: true });
  assert.equal(e.call("get9RoundBookingBoard", { id_token: "admin", date: day }).ok, true);
  e.directory.sheets.get("auth_users").rows[1][3] = "false";
  assert.equal(e.call("get9RoundBookingBoard", { id_token: "admin", date: day }).code, "FORBIDDEN");
  e.directory.sheets.get("auth_users").rows[1][3] = "true";
  e.directory.sheets.get("staff").rows[1][2] = "false";
  assert.equal(e.call("get9RoundBookingBoard", { id_token: "admin", date: day }).code, "FORBIDDEN");
  // Member bookings still work when the A-nauts directory is unavailable.
  e.properties.ROUND9_BOOKING_STAFF_DIRECTORY_ID = "";
  const token = e.login(0);
  assert.equal(reserve(e, token).ok, true);
});

test("ambiguous staff directory entries fail closed", () => {
  const e = environment({ realStaffAuth: true });
  e.directory.sheets.get("auth_users").rows.push(["staff@example.invalid", "A", "ADMIN", "true"]);
  assert.equal(e.call("get9RoundBookingBoard", { id_token: "staff", date: day }).code, "FORBIDDEN");
});

test("imported names cannot inject spreadsheet formulas", () => {
  const e = environment();
  e.master.sheets.get("Members").rows[1][1] = "=IMPORTXML(\"https://example.invalid\", \"//a\")";
  const token = e.login();
  assert.equal(reserve(e, token).ok, true);
  assert.ok(e.data.sheets.get("nr_bookings").rows[1][7].startsWith("'="));
});

test("GAS-hosted pages use the authenticated HTML transport without a cross-origin fetch", async () => {
  let request, callback, reply = { ok: true, data: { date: day, slots: [] } };
  const runner = {
    withSuccessHandler(fn) { callback = fn; return this; },
    withFailureHandler() { return this; },
    nineRoundBookingRequest(body) { request = body; callback(reply); }
  };
  const c = {
    window: { ANAUTS_ROUND9_BOOKING: { apiUrl: "google.script.run" } },
    google: { script: { run: runner } }, setTimeout, clearTimeout, Intl, Date,
    fetch() { throw Error("A private GAS page must not make an unauthenticated cross-origin request"); }
  };
  vm.runInNewContext(read("9round-booking/api.js"), c);
  assert.equal((await c.window.NineRoundBookingApi("get9RoundWorkoutSlots", { session_token: "test-token" })).date, day);
  assert.equal(request.action, "get9RoundWorkoutSlots"); assert.equal(request.session_token, "test-token");
  reply = { ok: false, code: "SESSION_EXPIRED", message: "再確認" };
  await assert.rejects(c.window.NineRoundBookingApi("get9RoundWorkoutSlots", {}), error => error.code === "SESSION_EXPIRED");
});

test("HTML RPC applies the same backend dispatcher and rejects malformed bodies", () => {
  const c = {
    round9BookingApi_: (action, body) => ({ getContent: () => JSON.stringify({ ok: false, code: "SESSION_EXPIRED", action, marker: body.marker }) })
  };
  vm.createContext(c); vm.runInContext(read("9round-booking/gas/WebApp.gs"), c);
  const result = c.nineRoundBookingRequest({ action: "get9RoundWorkoutSlots", marker: "same-auth-path" });
  assert.equal(result.code, "SESSION_EXPIRED"); assert.equal(result.marker, "same-auth-path");
  assert.equal(c.nineRoundBookingRequest(null).code, "INVALID_REQUEST");
});

test("generated GAS pages contain local assets, correctly ordered scripts, and valid JavaScript", () => {
  for (const file of ["Member.html", "Staff.html"]) {
    const html = read("9round-booking/gas/" + file);
    assert.doesNotMatch(html, /<script src=|<link rel="stylesheet"/);
    assert.ok(html.includes("<?!= configJson ?>"));
    const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), m => m[1]);
    assert.ok(scripts.length >= 3);
    for (const script of scripts) new vm.Script(script.replace("<?!= configJson ?>", '{"apiUrl":"google.script.run","firebaseApiKey":""}'));
    assert.ok(html.indexOf("</main>") < html.indexOf("<script>"), "inline scripts must run after the forms exist");
  }
});

test("development bootstrap cannot recreate configured storage or run with production settings", () => {
  for (const properties of [
    { ROUND9_BOOKING_ENV: "production" },
    { ROUND9_BOOKING_SPREADSHEET_ID: "already-configured" },
    { ROUND9_BOOKING_MEMBER_MASTER_ID: "already-configured" },
    { ROUND9_BOOKING_STAFF_DIRECTORY_ID: "already-configured" }
  ]) {
    const c = { PropertiesService: { getScriptProperties: () => ({ getProperties: () => properties }) },
      SpreadsheetApp: { create() { assert.fail("existing storage must never be recreated"); } } };
    vm.createContext(c); vm.runInContext(read("9round-booking/gas/Development.gs"), c);
    assert.throws(() => c.initialize9RoundBookingDevelopment());
  }
});
