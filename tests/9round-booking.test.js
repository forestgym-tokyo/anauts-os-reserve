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
    ROUND9_BOOKING_MEMBER_URL: "https://example.invalid/booking/?page=member",
    ROUND9_BOOKING_ADMIN_EMAILS: "admin@example.invalid",
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
  vm.runInContext(read("9round-booking/gas/Workflows.gs"), context);
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
  assert.equal(reserve(e, token, "DAILY:2026-10-17:10:15", "2026-10-17").code, "DEADLINE_PASSED");
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

test("booking, change and cancellation accept exactly one hour before start and reject one millisecond later", () => {
  const today = "2026-10-17", first = "DAILY:" + today + ":10:15";
  const e = environment(), token = e.login();
  e.advance(15 * 60000); // 09:15 JST, exactly one hour before 10:15.
  const booking = reserve(e, token, first, today);
  assert.equal(booking.ok, true, JSON.stringify(booking));
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: today }).data.slots[0].can_cancel, true);
  assert.equal(e.call("cancel9RoundWorkoutBooking", { session_token: token, booking_id: booking.data.booking_id }).ok, true);
  const late = environment(), member = late.login(), original = reserve(late, member, first, today).data.booking_id;
  late.advance(15 * 60000 + 1);
  assert.equal(late.call("cancel9RoundWorkoutBooking", { session_token: member, booking_id: original }).code, "DEADLINE_PASSED");
  assert.equal(late.call("reschedule9RoundWorkoutBooking", { session_token: member, booking_id: original, date: today, slot_id: "DAILY:" + today + ":11:00" }).code, "DEADLINE_PASSED");
  const other = late.login(1);
  assert.equal(reserve(late, other, first, today).code, "DEADLINE_PASSED");
  const slot = late.call("get9RoundWorkoutSlots", { session_token: member, date: today }).data.slots[0];
  assert.equal(slot.can_cancel, false); assert.equal(slot.can_change, false);
  assert.equal(slot.booked_count, 1);
});

test("confirmation and management mails are separate, escape HTML, and contain only authenticated email-action links", () => {
  const e = environment(); e.master.sheets.get("Members").rows[1][1] = '<b>会員&名</b>';
  const token = e.login(), before = e.sent.length, id = reserve(e, token).data.booking_id;
  assert.equal(e.sent.length, before + 2);
  const memberMail = e.sent[before], adminMail = e.sent[before + 1];
  assert.equal(memberMail.to, "member0@example.invalid"); assert.equal(adminMail.to, "admin@example.invalid");
  assert.match(memberMail.htmlBody, /&lt;b&gt;会員&amp;名&lt;\/b&gt;/);
  assert.match(memberMail.htmlBody, /予約を変更する/); assert.match(memberMail.htmlBody, /予約をキャンセルする/);
  assert.doesNotMatch(memberMail.htmlBody, /session_token|NR9:|<b>会員/);
  const link = new URL(memberMail.body.match(/予約をキャンセルする:\n([^\n]+)/)[1]);
  assert.equal(link.searchParams.get("booking_id"), id); assert.equal(link.searchParams.get("intent"), "cancel");
  assert.match(adminMail.body, /会員番号: 1000000/); assert.doesNotMatch(adminMail.body, /booking_id=|session_token/);
  const again = reserve(e, token);
  assert.equal(again.data.already_booked, true); assert.equal(e.sent.length, before + 2);
  e.call("cancel9RoundWorkoutBooking", { session_token: token, booking_id: id });
  assert.equal(e.sent.length, before + 4); assert.match(e.sent.at(-2).subject, /予約取消/);
  e.call("cancel9RoundWorkoutBooking", { session_token: token, booking_id: id });
  assert.equal(e.sent.length, before + 4);
});

test("free-mail failures preserve bookings and durable pending messages can be retried by managers only", () => {
  const e = environment(), token = e.login(); e.mailFailure(true);
  const result = reserve(e, token);
  assert.equal(result.ok, true); assert.equal(result.data.notification_pending, true);
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).data.slots[0].is_booked, true);
  assert.equal(e.call("get9RoundBookingBoard", { id_token: "admin", date: day }).data.pending_notifications, 2);
  assert.equal(e.call("retry9RoundBookingNotifications", { id_token: "staff" }).code, "FORBIDDEN");
  e.mailFailure(false);
  const retried = e.call("retry9RoundBookingNotifications", { id_token: "manager" });
  assert.equal(retried.data.sent, 2); assert.equal(retried.data.pending, 0);
  assert.equal(e.call("retry9RoundBookingNotifications", { id_token: "admin" }).data.sent, 0);
});

test("development mail safeguards apply to new notifications and to queued retries", () => {
  const e = environment(), token = e.login();
  e.properties.ROUND9_BOOKING_ADMIN_EMAILS = "unapproved@example.invalid";
  assert.equal(reserve(e, token).code, "BOOKING_CONFIGURATION");
  assert.equal(e.data.sheets.get("nr_bookings").rows.length, 1);
  e.properties.ROUND9_BOOKING_ADMIN_EMAILS = "admin@example.invalid";
  e.mailFailure(true); reserve(e, token); e.mailFailure(false);
  e.data.sheets.get("nr_mail").rows[1][4] = "unapproved@example.invalid";
  const before = e.sent.length, retry = e.call("retry9RoundBookingNotifications", { id_token: "admin" });
  assert.equal(retry.data.sent, 1); assert.equal(retry.data.pending, 1);
  assert.ok(e.sent.slice(before).every(m => m.to !== "unapproved@example.invalid"));
});

test("rescheduling checks ownership and capacity before replacing the original reservation", () => {
  const e = environment(), tokens = Array.from({ length: 6 }, (_, i) => e.login(i));
  const old = reserve(e, tokens[0]).data.booking_id, next = "DAILY:" + day + ":11:00";
  for (const t of tokens.slice(1, 5)) reserve(e, t, next);
  const payload = { booking_id: old, date: day, slot_id: next };
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { ...payload, session_token: tokens[5] }).code, "BOOKING_NOT_FOUND");
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { ...payload, session_token: tokens[0] }).code, "SLOT_FULL");
  let own = e.call("get9RoundMemberBookings", { session_token: tokens[0] }).data.bookings;
  assert.equal(own.length, 1); assert.equal(own[0].booking_id, old); assert.equal(own[0].status, "CONFIRMED");
  const third = "DAILY:" + day + ":11:45";
  e.call("set9RoundWorkoutBlock", { id_token: "admin", date: day, slot_id: third, blocked: true });
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { ...payload, slot_id: third, session_token: tokens[0] }).code, "SLOT_BLOCKED");
  e.call("set9RoundWorkoutBlock", { id_token: "admin", date: day, slot_id: third, blocked: false });
  const before = e.sent.length;
  const changed = e.call("reschedule9RoundWorkoutBooking", { ...payload, slot_id: third, session_token: tokens[0] });
  assert.equal(changed.ok, true, JSON.stringify(changed)); assert.notEqual(changed.data.booking_id, old);
  own = e.call("get9RoundMemberBookings", { session_token: tokens[0], booking_id: old }).data.bookings;
  assert.equal(own.find(b => b.booking_id === old).status, "RESCHEDULED");
  assert.equal(own.find(b => b.booking_id === changed.data.booking_id).status, "CONFIRMED");
  assert.equal(e.sent.length, before + 2); assert.match(e.sent[before].subject, /予約変更/); assert.match(e.sent[before].body, /変更前:/);
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { ...payload, slot_id: third, session_token: tokens[0] }).data.already_changed, true);
  assert.equal(e.sent.length, before + 2);
  assert.equal(e.call("cancel9RoundWorkoutBooking", { session_token: tokens[0], booking_id: old }).code, "BOOKING_UNAVAILABLE");
});

test("a change also enforces the new slot's one-hour deadline and cannot merge two existing reservations", () => {
  const e = environment(), token = e.login(), today = "2026-10-17";
  const old = reserve(e, token, "DAILY:" + today + ":11:00", today).data.booking_id;
  e.advance(15 * 60000 + 1);
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { session_token: token, booking_id: old, date: today, slot_id: "DAILY:" + today + ":10:15" }).code, "DEADLINE_PASSED");
  reserve(e, token, "DAILY:" + today + ":11:45", today);
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { session_token: token, booking_id: old, date: today, slot_id: "DAILY:" + today + ":11:45" }).code, "ALREADY_BOOKED");
});

test("mail booking IDs never authenticate another member or expose their reservation", () => {
  const e = environment(), first = e.login(), second = e.login(1), id = reserve(e, first).data.booking_id;
  assert.equal(e.call("get9RoundMemberBookings", { booking_id: id }).code, "SESSION_EXPIRED");
  assert.deepEqual(e.call("get9RoundMemberBookings", { session_token: second, booking_id: id }).data.bookings, []);
  assert.equal(e.call("cancel9RoundWorkoutBooking", { session_token: second, booking_id: id }).code, "BOOKING_NOT_FOUND");
});

test("each member gets a stable opaque QR; reissue revokes the old QR and no raw pass is stored", () => {
  const e = environment(), token = e.login(), second = e.login(1);
  assert.equal(e.call("get9RoundMemberPass").code, "SESSION_EXPIRED");
  const qr = e.call("get9RoundMemberPass", { session_token: token }).data.qr_text;
  assert.match(qr, /^NR9:[a-f0-9]{64}$/);
  assert.equal(e.call("get9RoundMemberPass", { session_token: token }).data.qr_text, qr);
  assert.notEqual(e.call("get9RoundMemberPass", { session_token: second }).data.qr_text, qr);
  assert.equal(JSON.stringify(e.data.sheets.get("nr_passes").rows).includes(qr), false);
  const fresh = e.call("rotate9RoundMemberPass", { session_token: token }).data.qr_text;
  assert.notEqual(fresh, qr);
  assert.equal(e.call("checkIn9RoundMember", { id_token: "staff", qr_text: qr, date: "2026-10-17", slot_id: "DAILY:2026-10-17:10:15" }).code, "INVALID_QR");
});

test("only an eligible staff scan of today's reserved slot marks attendance, once, while retaining capacity", () => {
  const e = environment({ realStaffAuth: true }), token = e.login(), today = "2026-10-17", slot = "DAILY:" + today + ":10:15";
  const id = reserve(e, token, slot, today).data.booking_id;
  const qr = e.call("get9RoundMemberPass", { session_token: token }).data.qr_text;
  const payload = { date: today, slot_id: slot, qr_text: qr };
  for (const id_token of ["", "other", "inactive"]) assert.equal(e.call("checkIn9RoundMember", { ...payload, id_token }).ok, false);
  assert.equal(e.call("checkIn9RoundMember", { ...payload, id_token: "staff", date: day }).code, "CHECKIN_DATE");
  assert.equal(e.call("checkIn9RoundMember", { ...payload, id_token: "staff", slot_id: "DAILY:" + today + ":11:00" }).code, "NO_RESERVATION");
  const checkin = e.call("checkIn9RoundMember", { ...payload, id_token: "staff" });
  assert.equal(checkin.ok, true, JSON.stringify(checkin)); assert.equal(checkin.data.already_attended, false);
  assert.equal(e.call("checkIn9RoundMember", { ...payload, id_token: "manager" }).data.already_attended, true);
  assert.equal(e.data.sheets.get("nr_attendance").rows.length, 2);
  const board = e.call("get9RoundBookingBoard", { id_token: "staff", date: today }).data;
  assert.equal(board.slots[0].members[0].attended, true); assert.equal(board.slots[0].booked_count, 1);
  const publicSlot = e.call("get9RoundWorkoutSlots", { session_token: token, date: today }).data.slots[0];
  assert.equal(publicSlot.attended, true); assert.equal(publicSlot.can_cancel, false); assert.equal(publicSlot.can_change, false);
  assert.equal(e.call("cancel9RoundWorkoutBooking", { session_token: token, booking_id: id }).code, "ALREADY_ATTENDED");
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { session_token: token, booking_id: id, date: today, slot_id: "DAILY:" + today + ":11:00" }).code, "ALREADY_ATTENDED");
});

test("QR scans reject cancelled bookings, inactive membership, changed registered email and forged passes", () => {
  const e = environment(), token = e.login(), today = "2026-10-17", slot = "DAILY:" + today + ":10:15";
  const id = reserve(e, token, slot, today).data.booking_id;
  const qr = e.call("get9RoundMemberPass", { session_token: token }).data.qr_text;
  const payload = { id_token: "staff", date: today, slot_id: slot, qr_text: qr };
  e.master.sheets.get("Members").rows[1][3] = "kyukai";
  assert.equal(e.call("checkIn9RoundMember", payload).code, "MEMBER_UNAVAILABLE");
  e.master.sheets.get("Members").rows[1][3] = "ok"; e.master.sheets.get("Members").rows[1][2] = "changed@example.invalid";
  assert.equal(e.call("checkIn9RoundMember", payload).code, "MEMBER_UNAVAILABLE");
  e.master.sheets.get("Members").rows[1][2] = "member0@example.invalid";
  assert.equal(e.call("checkIn9RoundMember", { ...payload, qr_text: "NR9:" + "0".repeat(64) }).code, "INVALID_QR");
  e.call("cancel9RoundWorkoutBooking", { session_token: token, booking_id: id });
  assert.equal(e.call("checkIn9RoundMember", payload).code, "NO_RESERVATION");
});

test("bundled QR encoder produces a real image that the offline scanner decodes", () => {
  const qrcode = require("../9round-booking/vendor/qrcode.min.js");
  const jsQR = require("../9round-booking/vendor/jsqr.min.js");
  const text = "NR9:" + "a12b34c56d78e90f".repeat(4);
  const qr = qrcode(0, "M"); qr.addData(text); qr.make();
  const modules = qr.getModuleCount(), cell = 5, width = (modules + 8) * cell;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (qr.isDark(row, col)) {
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const offset = (((row + 4) * cell + y) * width + (col + 4) * cell + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  assert.equal(jsQR(pixels, width, width, { inversionAttempts: "dontInvert" }).data, text);
});

test("development upgrade adds only missing tables and preserves existing reservations", () => {
  const e = environment(), token = e.login(); reserve(e, token);
  const before = plain(e.data.sheets.get("nr_bookings").rows);
  for (const name of ["nr_passes", "nr_attendance", "nr_changes", "nr_mail"]) e.data.sheets.delete(name);
  vm.runInContext(read("9round-booking/gas/Development.gs"), e.context);
  e.context.upgrade9RoundBookingDevelopment();
  assert.deepEqual(plain(e.data.sheets.get("nr_bookings").rows), before);
  for (const name of ["nr_passes", "nr_attendance", "nr_changes", "nr_mail"]) assert.equal(e.data.sheets.get(name).rows.length, 1);
  const count = e.writes.length; e.context.upgrade9RoundBookingDevelopment();
  assert.equal(e.writes.length, count);
  e.properties.ROUND9_BOOKING_ENV = "production";
  assert.throws(() => e.context.upgrade9RoundBookingDevelopment(), /開発用/);
  assert.equal(e.writes.length, count);
});
