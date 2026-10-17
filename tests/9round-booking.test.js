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
    ROUND9_BOOKING_STAFF_URL: "https://example.invalid/booking/staff/?page=staff",
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
  vm.runInContext(read("9round-booking/gas/Fighters.gs"), context);
  vm.runInContext(read("9round-booking/gas/Management.gs"), context);
  vm.runInContext(read("9round-booking/gas/MailLinks.gs"), context);
  vm.runInContext(read("9round-booking/gas/SlotManagement.gs"), context);
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

test("repeated master rows for one identity allow verification and booking without editing the master", () => {
  const e = environment(), rows = e.master.sheets.get("Members").rows;
  const repeated = rows[1].slice();
  repeated[1] = repeated[1].replace("会員", "　会員 ");
  rows.push(repeated, rows[1].slice());
  const masterBefore = JSON.stringify(rows);
  const token = e.login(0);
  assert.equal(reserve(e, token).ok, true);
  assert.equal(e.sent.filter(mail => mail.subject.includes("本人確認コード")).length, 1);
  assert.equal(JSON.stringify(rows), masterBefore);
  assert.ok(e.writes.every(name => name.startsWith("nr_")));
});

test("conflicting master duplicates prevent both code delivery and booking with an existing session", () => {
  for (const [column, value] of [[0, "9999999"], [1, "別の会員"], [2, "other@example.invalid"]]) {
    const e = environment(), token = e.login(0), sentBefore = e.sent.length;
    const rows = e.master.sheets.get("Members").rows, conflict = rows[1].slice();
    conflict[column] = value; rows.push(conflict); e.advance(61000);
    assert.equal(e.call("request9RoundBookingCode", { email: "member0@example.invalid" }).ok, true);
    assert.equal(e.sent.length, sentBefore);
    assert.equal(reserve(e, token).ok, false);
    assert.equal(e.data.sheets.get("nr_bookings").rows.length, 1);
  }
});

test("ok_unfinished members receive an OTP, can reserve and use their own QR", () => {
  for (const status of ["ok_unfinished", " ok_unfinished "]) {
    const e = environment();
    e.master.sheets.get("Members").rows[1][3] = status;
    const request = e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
    assert.equal(request.ok, true, status);
    assert.equal(e.sent.length, 1, status);
    const code = e.sent[0].body.match(/は (\d{6})/)[1];
    const verified = e.call("verify9RoundBookingCode", { challenge_id: request.data.challenge_id, code });
    assert.equal(verified.ok, true, status);
    const token = verified.data.session_token;
    assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).ok, true, status);
    assert.equal(reserve(e, token).ok, true, status);
    assert.equal(e.call("get9RoundMemberPass", { session_token: token }).ok, true, status);
  }
});

test("switches between ok and ok_unfinished keep verified members eligible", () => {
  for (const [from, to] of [["ok", "ok_unfinished"], ["ok_unfinished", "ok"]]) {
    const e = environment();
    e.master.sheets.get("Members").rows[1][3] = from;
    const token = e.login(0);
    e.master.sheets.get("Members").rows[1][3] = to;
    assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).ok, true);
    assert.equal(reserve(e, token).ok, true);
  }
});

test("ineligible member statuses cannot receive a verification code", () => {
  for (const status of ["契約中", "active", "act", "OK", "kyukai", "休会中", "退会済み", "", "unknown"]) {
    const e = environment();
    e.master.sheets.get("Members").rows[1][3] = status;
    const response = e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
    assert.equal(response.ok, true, status);
    assert.equal(e.sent.length, 0, status);
    assert.equal(e.data.sheets.get("nr_challenges").rows[1][3], "", status);
  }
});

test("ineligible master rows are excluded from email and member-number duplicate checks", () => {
  for (const status of ["契約中", "active", "act", "OK", "kyukai", "退会済み", ""]) {
    const e = environment(), rows = e.master.sheets.get("Members").rows;
    rows.push(["9999998", "別の会員", rows[1][2], status]);
    rows.push([rows[1][0], "過去の登録", "old@example.invalid", status]);
    const masterBefore = JSON.stringify(rows);
    const token = e.login(0);
    assert.equal(reserve(e, token).ok, true, status);
    assert.equal(JSON.stringify(rows), masterBefore);
  }
});

test("a status change to an ineligible state blocks code verification and existing member sessions", () => {
  for (const status of ["契約中", "active", "act", "OK", "kyukai", "退会済み", ""]) {
    const e = environment();
    const requested = e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
    const code = e.sent[0].body.match(/は (\d{6})/)[1];
    e.master.sheets.get("Members").rows[1][3] = status;
    assert.equal(e.call("verify9RoundBookingCode", { challenge_id: requested.data.challenge_id, code }).code, "MEMBER_UNAVAILABLE", status);

    const logged = environment(), token = logged.login(0);
    const booking = reserve(logged, token);
    assert.equal(booking.ok, true);
    logged.master.sheets.get("Members").rows[1][3] = status;
    assert.equal(logged.call("get9RoundWorkoutSlots", { session_token: token, date: day }).code, "MEMBER_UNAVAILABLE", status);
    assert.equal(reserve(logged, token).code, "MEMBER_UNAVAILABLE", status);
    assert.equal(logged.call("cancel9RoundWorkoutBooking", { session_token: token, booking_id: booking.data.booking_id }).code, "MEMBER_UNAVAILABLE", status);
    assert.equal(logged.data.sheets.get("nr_bookings").rows.length, 2);
    assert.equal(logged.data.sheets.get("nr_bookings").rows[1][9], "CONFIRMED");
  }
});

test("code guessing locks after five attempts and expired codes cannot verify", () => {
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
});

test("verification code sends have no five-per-hour cap and retain the exact sixty-second interval", () => {
  const e = environment();
  const request = () => e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
  let latest = request();
  assert.equal(latest.ok, true);
  e.advance(59999);
  assert.equal(request().code, "RATE_LIMIT");
  e.advance(1);
  latest = request();
  assert.equal(latest.ok, true);
  for (let i = 0; i < 6; i++) {
    e.advance(60000);
    latest = request();
    assert.equal(latest.ok, true, "the sixth and later sends within one hour must succeed");
    assert.equal(request().code, "RATE_LIMIT", "the resend interval still applies");
  }
  assert.equal(e.sent.length, 8);
  const code = e.sent.at(-1).body.match(/は (\d{6})/)[1];
  assert.equal(e.call("verify9RoundBookingCode", { challenge_id: latest.data.challenge_id, code }).ok, true);
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
  for (const id_token of ["staff", "manager", "other"]) {
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
  assert.equal(e.call("set9RoundWorkoutBlock", { id_token: "admin", date: day, slot_ids: ids, blocked: false }).ok, true);
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
    "cancel9RoundWorkoutBooking", "logout9RoundBooking", "get9RoundBookingBoard", "save9RoundTrialSlot", "set9RoundWorkoutBlock",
    "save9RoundFighterProfile", "cancel9RoundManagedBooking", "reschedule9RoundManagedBooking"];
  for (const action of actions) {
    const result = c.doPost({ postData: { contents: JSON.stringify({ action, marker: "test" }) } });
    assert.equal(result.action, action); assert.equal(result.body.marker, "test");
    assert.equal(c.doGet({ parameter: { action, id_token: "not-used" } }).data.app, "9ROUND Booking");
  }
  assert.equal(c.doPost({ postData: { contents: "{" } }).code, "INVALID_REQUEST");
  assert.equal(c.doPost({ postData: { contents: "null" } }).code, "INVALID_REQUEST");
});

test("config uses a disconnected review or verified production endpoint and keeps the backend isolated", () => {
  const c = { window: {} }; vm.runInNewContext(read("9round-booking/config.js"), c);
  const config = c.window.ANAUTS_ROUND9_BOOKING;
  assert.ok(Object.isFrozen(config));
  if (config.apiUrl) {
    assert.equal(config.apiUrl, "https://script.google.com/macros/s/AKfycbzVxf1HKZgXet5XrZjqQbzQ47dH8vMISf1mdEE_AH4m3EABceonv1V2OG0jtuIJLvkq/exec");
    assert.equal(config.legacyMemberUrl, config.apiUrl + "?page=member");
    assert.equal(config.preferLegacy, false);
  } else assert.equal(config.apiUrl, "");
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
    assert.equal(result.data.can_manage, id_token === "admin");
    assert.equal(result.data.can_manage_slots, id_token === "admin");
    assert.equal(result.data.can_manage_bookings, true);
    assert.equal(result.data.can_retry_notifications, id_token !== "staff");
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
  assert.match(adminMail.body, /会員番号: 1000000/); assert.doesNotMatch(adminMail.body, /session_token|id_token|NR9:/);
  const adminLink = new URL(adminMail.body.match(/管理画面で変更する:\n([^\n]+)/)[1]);
  assert.equal(adminLink.pathname, "/booking/staff/"); assert.equal(adminLink.searchParams.get("page"), "staff");
  assert.equal(adminLink.searchParams.get("booking_id"), id); assert.equal(adminLink.searchParams.get("intent"), "change");
  assert.match(adminMail.htmlBody, /管理画面でキャンセルする/);
  assert.match(adminMail.htmlBody, /&lt;b&gt;会員&amp;名&lt;\/b&gt;/);
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
  for (const name of ["nr_passes", "nr_attendance", "nr_changes", "nr_mail", "nr_fighters", "nr_management_actions"]) e.data.sheets.delete(name);
  vm.runInContext(read("9round-booking/gas/Development.gs"), e.context);
  e.context.upgrade9RoundBookingDevelopment();
  assert.deepEqual(plain(e.data.sheets.get("nr_bookings").rows), before);
  for (const name of ["nr_passes", "nr_attendance", "nr_changes", "nr_mail", "nr_fighters", "nr_management_actions"]) assert.equal(e.data.sheets.get(name).rows.length, 1);
  const count = e.writes.length; e.context.upgrade9RoundBookingDevelopment();
  assert.equal(e.writes.length, count);
  e.properties.ROUND9_BOOKING_ENV = "production";
  assert.throws(() => e.context.upgrade9RoundBookingDevelopment(), /開発用/);
  assert.equal(e.writes.length, count);
});

test("fighters register and rename only their own profile without changing the member master", () => {
  const e = environment(), token = e.login(), other = e.login(1), masterBefore = plain(e.master.sheets.get("Members").rows);
  assert.deepEqual(e.call("get9RoundFighterProfile", { session_token: token }).data,
    { fighter_name: "", display_name: "テスト会員0", registered: false });
  assert.equal(e.call("save9RoundFighterProfile", { session_token: token, member_no: "1000001", fighter_name: "  ソガの虎  " }).data.fighter_name, "ソガの虎");
  assert.equal(e.call("get9RoundFighterProfile", { session_token: other, member_no: "1000000" }).data.fighter_name, "");
  e.advance(1000);
  assert.equal(e.call("save9RoundFighterProfile", { session_token: token, fighter_name: "RED TIGER" }).data.display_name, "RED TIGER");
  assert.equal(e.data.sheets.get("nr_fighters").rows.length, 2, "rename updates one profile instead of appending duplicates");
  assert.deepEqual(plain(e.master.sheets.get("Members").rows), masterBefore);
  assert.ok(e.writes.every(name => name.startsWith("nr_")));
  for (const action of ["get9RoundFighterProfile", "save9RoundFighterProfile"]) assert.equal(e.call(action, { fighter_name: "forged", member_no: "1000000" }).code, "SESSION_EXPIRED");
});

test("fighter validation supports Japanese and emoji, blocks controls and protects Sheets and mail HTML", () => {
  const e = environment(), token = e.login();
  for (const name of ["", "  ", "あ".repeat(25), "赤\n虎", "赤\u202e虎", "赤\u0000虎"]) {
    assert.equal(e.call("save9RoundFighterProfile", { session_token: token, fighter_name: name }).code, "INVALID_FIGHTER_NAME");
  }
  assert.equal(e.call("save9RoundFighterProfile", { session_token: token, fighter_name: "🥊".repeat(24) }).ok, true);
  e.call("save9RoundFighterProfile", { session_token: token, fighter_name: '=HYPERLINK("x")' });
  assert.ok(e.data.sheets.get("nr_fighters").rows[1][2].startsWith("'="));
  e.call("save9RoundFighterProfile", { session_token: token, fighter_name: '<img src=x onerror="x">' });
  reserve(e, token);
  assert.match(e.sent.at(-1).htmlBody, /&lt;img src=x onerror=&quot;x&quot;&gt;/);
  assert.doesNotMatch(e.sent.at(-1).htmlBody, /<img/);
});

test("staff see current fighter and real names while member slot responses reveal neither other name", () => {
  const e = environment({ realStaffAuth: true }), token = e.login(), other = e.login(1);
  const id = reserve(e, token).data.booking_id;
  e.call("save9RoundFighterProfile", { session_token: token, fighter_name: "SOGA FIGHTER" });
  let shown = e.call("get9RoundBookingBoard", { id_token: "staff", date: day }).data.slots[0].members[0];
  assert.equal(shown.name, "テスト会員0"); assert.equal(shown.fighter_name, "SOGA FIGHTER");
  assert.equal(shown.can_change, true);
  e.call("save9RoundFighterProfile", { session_token: token, fighter_name: "NEW FIGHTER" });
  shown = e.call("get9RoundManagedBooking", { id_token: "admin", booking_id: id }).data.booking;
  assert.equal(shown.name, "テスト会員0"); assert.equal(shown.fighter_name, "NEW FIGHTER");
  const publicSlots = JSON.stringify(e.call("get9RoundWorkoutSlots", { session_token: other, date: day }));
  assert.doesNotMatch(publicSlots, /NEW FIGHTER|SOGA FIGHTER|テスト会員0|1000000|fighter_name|member_name/);
});

test("fighter identity is revoked with the authenticated member and not inherited after registered email changes", () => {
  const e = environment(), token = e.login();
  e.call("save9RoundFighterProfile", { session_token: token, fighter_name: "OLD NAME" });
  e.master.sheets.get("Members").rows[1][3] = "kyukai";
  assert.equal(e.call("save9RoundFighterProfile", { session_token: token, fighter_name: "new" }).code, "MEMBER_UNAVAILABLE");
  e.master.sheets.get("Members").rows[1][3] = "ok";
  e.master.sheets.get("Members").rows[1][2] = "new-address@example.invalid";
  assert.equal(e.call("get9RoundFighterProfile", { session_token: token }).code, "MEMBER_UNAVAILABLE");
  e.properties.ROUND9_BOOKING_TEST_EMAILS += ",new-address@example.invalid";
  const challenge = e.call("request9RoundBookingCode", { email: "new-address@example.invalid" });
  const code = e.sent.at(-1).body.match(/は (\d{6})/)[1];
  const session = e.call("verify9RoundBookingCode", { challenge_id: challenge.data.challenge_id, code }).data.session_token;
  assert.equal(e.call("get9RoundFighterProfile", { session_token: session }).data.registered, false);
  assert.equal(e.call("get9RoundBookingBoard", { id_token: "admin", date: day }).ok, true);
});

test("email IDs and forged roles never authorize staff booking endpoints", () => {
  const e = environment({ realStaffAuth: true }), token = e.login(), id = reserve(e, token).data.booking_id;
  for (const action of ["get9RoundManagedBooking", "cancel9RoundManagedBooking", "reschedule9RoundManagedBooking"]) {
    for (const id_token of ["", "invalid", "other", "inactive"]) {
      const rejected = e.call(action, { id_token, session_token: token, permission: "ADMIN", booking_id: id, date: day, slot_id: "DAILY:" + day + ":11:45" });
      assert.equal(rejected.ok, false);
      assert.ok(["FORBIDDEN", "STAFF_SESSION_EXPIRED"].includes(rejected.code));
    }
  }
  assert.equal(e.call("get9RoundMemberBookings", { session_token: token }).data.bookings[0].status, "CONFIRMED");
  assert.equal(e.data.sheets.get("nr_management_actions").rows.length, 1);
});

test("managers change and cancel on behalf of a member with shared capacity checks, audit and one notification per action", () => {
  const e = environment({ realStaffAuth: true }), token = e.login(), id = reserve(e, token).data.booking_id;
  const target = "DAILY:" + day + ":11:00", request = { id_token: "manager", booking_id: id, date: day, slot_id: target };
  const changed = e.call("reschedule9RoundManagedBooking", request);
  assert.equal(changed.ok, true, JSON.stringify(changed));
  const count = e.sent.length;
  assert.equal(e.call("reschedule9RoundManagedBooking", request).data.already_changed, true);
  assert.equal(e.sent.length, count);
  let audit = e.data.sheets.get("nr_management_actions").getDataRange().getDisplayValues();
  assert.equal(audit.length, 2); assert.equal(audit[1][3], "M"); assert.equal(audit[1][5], changed.data.booking_id);
  assert.match(e.sent.at(-1).body, /管理操作: M/);
  assert.equal(e.call("get9RoundMemberBookings", { session_token: token }).data.bookings.filter(b => b.status === "CONFIRMED")[0].slot_id, target);
  assert.equal(e.call("cancel9RoundManagedBooking", { id_token: "admin", booking_id: changed.data.booking_id }).ok, true);
  const after = e.sent.length;
  assert.equal(e.call("cancel9RoundManagedBooking", { id_token: "admin", booking_id: changed.data.booking_id }).ok, true);
  assert.equal(e.sent.length, after); assert.equal(e.data.sheets.get("nr_management_actions").rows.length, 3);
  assert.equal(e.call("get9RoundManagedBooking", { id_token: "admin", booking_id: changed.data.booking_id }).data.booking.status, "CANCELLED");
});

test("manager changes preserve originals for full or blocked targets and enforce both one-hour deadlines", () => {
  const e = environment(), token = e.login(), id = reserve(e, token).data.booking_id, target = "DAILY:" + day + ":11:00";
  const body = { id_token: "admin", booking_id: id, date: day, slot_id: target };
  for (let i = 1; i <= 4; i++) reserve(e, e.login(i), target);
  assert.equal(e.call("reschedule9RoundManagedBooking", body).code, "SLOT_FULL");
  e.call("set9RoundWorkoutBlock", { id_token: "admin", date: day, slot_id: "DAILY:" + day + ":11:45", blocked: true });
  assert.equal(e.call("reschedule9RoundManagedBooking", { ...body, slot_id: "DAILY:" + day + ":11:45" }).code, "SLOT_BLOCKED");
  assert.equal(e.call("get9RoundManagedBooking", body).data.booking.status, "CONFIRMED");
  const today = "2026-10-17", first = "DAILY:" + today + ":10:15";
  const before = environment(), t = before.login(), old = reserve(before, t, first, today).data.booking_id;
  before.advance(15 * 60000);
  assert.equal(before.call("cancel9RoundManagedBooking", { id_token: "admin", booking_id: old }).ok, true);
  const late = environment(), lateToken = late.login(), lateId = reserve(late, lateToken, first, today).data.booking_id;
  const future = reserve(late, lateToken).data.booking_id;
  late.advance(15 * 60000 + 1);
  assert.equal(late.call("cancel9RoundManagedBooking", { id_token: "admin", booking_id: lateId }).code, "DEADLINE_PASSED");
  assert.equal(late.call("reschedule9RoundManagedBooking", { id_token: "admin", booking_id: lateId, date: today, slot_id: "DAILY:" + today + ":11:00" }).code, "DEADLINE_PASSED");
  assert.equal(late.call("reschedule9RoundManagedBooking", { id_token: "admin", booking_id: future, date: today, slot_id: first }).code, "DEADLINE_PASSED");
});

test("managers cannot cancel or change attended bookings", () => {
  const e = environment(), token = e.login(), today = "2026-10-17", first = "DAILY:" + today + ":10:15";
  const id = reserve(e, token, first, today).data.booking_id, qr = e.call("get9RoundMemberPass", { session_token: token }).data.qr_text;
  assert.equal(e.call("checkIn9RoundMember", { id_token: "staff", qr_text: qr, date: today, slot_id: first }).ok, true);
  assert.equal(e.call("get9RoundManagedBooking", { id_token: "admin", booking_id: id }).data.booking.can_cancel, false);
  assert.equal(e.call("cancel9RoundManagedBooking", { id_token: "admin", booking_id: id }).code, "ALREADY_ATTENDED");
  assert.equal(e.call("reschedule9RoundManagedBooking", { id_token: "admin", booking_id: id, date: day, slot_id: slotId }).code, "ALREADY_ATTENDED");
});

test("staff, managers and administrators can change and cancel with their verified actor recorded", () => {
  for (const [id_token, actor] of [["staff", "S"], ["manager", "M"], ["admin", "A"]]) {
    const e = environment({ realStaffAuth: true }), token = e.login(), id = reserve(e, token).data.booking_id;
    const board = e.call("get9RoundBookingBoard", { id_token, date: day }).data;
    assert.equal(board.can_manage_bookings, true);
    assert.equal(board.slots[0].members[0].can_change, true);
    const changed = e.call("reschedule9RoundManagedBooking", { id_token, booking_id: id, date: day, slot_id: "DAILY:" + day + ":11:00" });
    assert.equal(changed.ok, true, JSON.stringify(changed));
    assert.equal(e.call("cancel9RoundManagedBooking", { id_token, booking_id: changed.data.booking_id }).ok, true);
    const audit = e.data.sheets.get("nr_management_actions").rows;
    assert.equal(audit.length, 3);
    assert.equal(audit[1][3], actor); assert.equal(audit[2][3], actor);
    assert.equal(e.call("get9RoundMemberBookings", { session_token: token }).data.bookings.some(b => b.status === "CONFIRMED"), false);
    assert.ok(e.writes.every(name => name.startsWith("nr_")));
  }
});

test("only administrators can create, block, delete or restore slots even with forged role fields", () => {
  const e = environment({ realStaffAuth: true });
  for (const id_token of ["staff", "manager", "other", "inactive", "invalid", ""]) {
    for (const action of ["save9RoundTrialSlot", "set9RoundWorkoutBlock", "delete9RoundBookingSlot", "restore9RoundBookingSlot"]) {
      const before = e.writes.length;
      const result = e.call(action, { id_token, permission: "ADMIN", date: day, slot_id: slotId, blocked: true,
        start_time: "11:00", capacity: 1, title: "体験" });
      assert.equal(result.ok, false, id_token + " " + action);
      assert.ok(["FORBIDDEN", "STAFF_SESSION_EXPIRED"].includes(result.code));
      assert.equal(e.writes.length, before);
    }
  }
});

test("daily slot deletion preserves reservations, blocks direct booking and rescheduling, and restores stopped", () => {
  const e = environment({ realStaffAuth: true }), token = e.login(), booking = reserve(e, token).data.booking_id;
  const target = "DAILY:" + day + ":11:00", base = { id_token: "admin", date: day };
  assert.equal(e.call("delete9RoundBookingSlot", { ...base, slot_id: slotId }).code, "SLOT_HAS_BOOKINGS");
  assert.equal(e.call("delete9RoundBookingSlot", { ...base, slot_id: target }).ok, true);
  const after = e.writes.length;
  assert.equal(e.call("delete9RoundBookingSlot", { ...base, slot_id: target }).data.unchanged, true);
  assert.equal(e.writes.length, after);
  for (const id_token of ["staff", "manager"]) {
    assert.equal(e.call("get9RoundBookingBoard", { id_token, date: day }).data.slots.some(s => s.slot_id === target), false);
  }
  const removed = e.call("get9RoundBookingBoard", base).data.slots.find(s => s.slot_id === target);
  assert.equal(removed.status, "DELETED"); assert.equal(removed.can_restore, true); assert.equal(removed.available, false);
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).data.slots.some(s => s.slot_id === target), false);
  assert.equal(reserve(e, token, target).code, "SLOT_BLOCKED");
  assert.equal(e.call("reschedule9RoundManagedBooking", { ...base, booking_id: booking, slot_id: target }).code, "SLOT_BLOCKED");
  assert.equal(e.call("set9RoundWorkoutBlock", { ...base, slot_ids: [target, "DAILY:" + day + ":11:45"], blocked: false }).code, "SLOT_DELETED");
  assert.equal(e.call("get9RoundManagedBooking", { ...base, booking_id: booking }).data.booking.status, "CONFIRMED");
  assert.equal(e.call("restore9RoundBookingSlot", { ...base, slot_id: target }).data.status, "BLOCKED");
  assert.equal(reserve(e, token, target).code, "SLOT_BLOCKED");
  assert.equal(e.call("set9RoundWorkoutBlock", { ...base, slot_id: target, blocked: false }).ok, true);
  assert.equal(reserve(e, token, target).ok, true);
  assert.equal(e.call("delete9RoundBookingSlot", { ...base, slot_id: "DAILY:2026-10-19:11:00" }).code, "INVALID_SLOT");
  assert.equal(e.data.sheets.get("nr_bookings").rows.length, 3);
});

test("trial slots are deleted without removing history and restore with reception stopped", () => {
  const e = environment({ realStaffAuth: true }), base = { id_token: "admin", date: day };
  const trial = e.call("save9RoundTrialSlot", { ...base, start_time: "11:00", title: "体験", capacity: 2 }).data.slot_id;
  assert.equal(e.call("delete9RoundBookingSlot", { ...base, slot_id: trial }).ok, true);
  assert.equal(e.data.sheets.get("nr_trials").rows.length, 2);
  assert.equal(e.call("get9RoundBookingBoard", { id_token: "staff", date: day }).data.slots.some(s => s.slot_id === trial), false);
  assert.equal(e.call("save9RoundTrialSlot", { ...base, slot_id: trial, start_time: "11:00", title: "体験", capacity: 2 }).code, "SLOT_DELETED");
  assert.equal(e.call("restore9RoundBookingSlot", { ...base, slot_id: trial }).data.status, "CLOSED");
  assert.equal(e.call("get9RoundBookingBoard", base).data.slots.find(s => s.slot_id === trial).status, "CLOSED");
  assert.equal(e.call("delete9RoundBookingSlot", { ...base, date: "2026-10-19", slot_id: trial }).code, "INVALID_SLOT");
});

test("multiple verified management recipients are retained, deduplicated and restricted by the development allowlist", () => {
  const e = environment(), token = e.login();
  e.properties.ROUND9_BOOKING_ADMIN_EMAILS = "admin@example.invalid,manager@example.invalid,admin@example.invalid";
  assert.equal(reserve(e, token).ok, true);
  assert.equal(e.sent.at(-1).to, "admin@example.invalid,manager@example.invalid");
  e.properties.ROUND9_BOOKING_STAFF_URL = "javascript:alert(1)";
  assert.equal(reserve(e, token, "DAILY:" + day + ":11:00").code, "BOOKING_CONFIGURATION");
  assert.equal(e.data.sheets.get("nr_bookings").rows.length, 2);
});

test("a member can hold ten outstanding reservations across dates, but not an eleventh, and duplicate taps stay idempotent", () => {
  const e = environment(), token = e.login(), other = e.login(1), slots = plain(e.context.nrBookingDailySlots_(day));
  const ids = slots.slice(0, 10).map(s => reserve(e, token, s.slot_id).data.booking_id);
  assert.equal(e.call("get9RoundMemberBookings", { session_token: token }).data.outstanding_count, 10);
  assert.equal(reserve(e, token, slots[10].slot_id).code, "BOOKING_LIMIT");
  assert.equal(reserve(e, token, "DAILY:2026-10-19:10:15", "2026-10-19").code, "BOOKING_LIMIT");
  assert.equal(reserve(e, token, slots[0].slot_id).data.already_booked, true);
  assert.equal(reserve(e, other, slots[10].slot_id).ok, true, "the ceiling is per member");
  assert.equal(e.call("reschedule9RoundWorkoutBooking", { session_token: token, booking_id: ids[0], date: day, slot_id: slots[10].slot_id }).ok, true);
  assert.equal(e.call("get9RoundMemberBookings", { session_token: token }).data.outstanding_count, 10);
  assert.equal(e.call("reschedule9RoundManagedBooking", { id_token: "admin", booking_id: ids[1], date: "2026-10-19", slot_id: "DAILY:2026-10-19:10:15" }).ok, true);
  assert.equal(e.call("get9RoundMemberBookings", { session_token: token }).data.outstanding_count, 10);
  assert.equal(e.call("cancel9RoundWorkoutBooking", { session_token: token, booking_id: ids[2] }).ok, true);
  assert.equal(reserve(e, token, "DAILY:2026-10-19:11:00", "2026-10-19").ok, true);
  assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).data.outstanding_count, 10);
});

test("attendance and ended slots free the ten-reservation allowance without removing bookings from slot capacity", () => {
  for (const attendance of [true, false]) {
    const e = environment(), token = e.login(), today = "2026-10-17", first = "DAILY:" + today + ":10:15";
    reserve(e, token, first, today);
    const slots = plain(e.context.nrBookingDailySlots_(day));
    slots.slice(0, 9).forEach(s => assert.equal(reserve(e, token, s.slot_id).ok, true));
    assert.equal(reserve(e, token, slots[9].slot_id).code, "BOOKING_LIMIT");
    if (attendance) {
      const qr = e.call("get9RoundMemberPass", { session_token: token }).data.qr_text;
      e.call("checkIn9RoundMember", { id_token: "staff", qr_text: qr, date: today, slot_id: first });
    } else e.advance(2 * 3600000); // 11:00 JST: the 10:15 grid slot has ended.
    assert.equal(e.call("get9RoundMemberBookings", { session_token: token }).data.outstanding_count, 9);
    assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: today }).data.slots[0].booked_count, 1);
    assert.equal(reserve(e, token, slots[9].slot_id).ok, true);
  }
});

test("code-copy link requires the independent email token, stores only hashes, and is revoked after verification", () => {
  const e = environment();
  const response = e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
  const mail = e.sent.at(-1), link = new URL(mail.body.split("\n").at(-1));
  const payload = Object.fromEntries(link.searchParams);
  const code = mail.body.match(/は (\d{6})/)[1];
  assert.match(mail.htmlBody, /コードをコピー/);
  assert.equal(payload.page, "code-copy");
  assert.equal(response.data.code, undefined);
  assert.equal(response.data.copy_token, undefined);
  assert.equal(e.data.sheets.get("nr_challenges").rows[1].includes(payload.copy_token), false);
  assert.equal(e.data.sheets.get("nr_challenges").rows[1].includes(code), false);
  const config = e.context.nrBookingConfig_();
  assert.throws(() => e.context.nrGet9RoundBookingCodeForCopy_(config, { challenge_id: payload.challenge_id }), /コピー用リンク/);
  assert.throws(() => e.context.nrGet9RoundBookingCodeForCopy_(config, { ...payload, copy_token: "a".repeat(64) }), /コピー用リンク/);
  assert.equal(e.context.nrGet9RoundBookingCodeForCopy_(config, payload).code, code);
  assert.equal(e.call("verify9RoundBookingCode", { challenge_id: response.data.challenge_id, code }).ok, true);
  assert.throws(() => e.context.nrGet9RoundBookingCodeForCopy_(config, payload), /コピー用リンク/);
});

test("an installed member app keeps its email copy link on the independent code-copy endpoint", () => {
  const e = environment();
  e.properties.ROUND9_BOOKING_MEMBER_URL = "https://member-app.example.invalid/booking/";
  e.properties.ROUND9_BOOKING_CODE_COPY_URL = "https://script.google.com/macros/s/test/exec?page=code-copy";
  e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
  const link = new URL(e.sent.at(-1).body.split("\n").at(-1));
  assert.equal(link.origin, "https://script.google.com");
  assert.equal(link.searchParams.get("page"), "code-copy");
  assert.equal(e.context.nrGet9RoundBookingCodeForCopy_(e.context.nrBookingConfig_(), Object.fromEntries(link.searchParams)).bookingUrl, e.properties.ROUND9_BOOKING_MEMBER_URL);
});

test("expired and exhausted email code-copy links disclose no code", () => {
  const e = environment();
  const config = e.context.nrBookingConfig_();
  e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
  const payload = Object.fromEntries(new URL(e.sent.at(-1).body.split("\n").at(-1)).searchParams);
  e.advance(600001);
  assert.throws(() => e.context.nrGet9RoundBookingCodeForCopy_(config, payload), /コピー用リンク/);
  const next = e.call("request9RoundBookingCode", { email: "member0@example.invalid" });
  const newPayload = Object.fromEntries(new URL(e.sent.at(-1).body.split("\n").at(-1)).searchParams);
  assert.throws(() => e.context.nrGet9RoundBookingCodeForCopy_(config, { ...newPayload, copy_token: payload.copy_token }), /コピー用リンク/);
  for (let i = 0; i < 5; i++) e.call("verify9RoundBookingCode", { challenge_id: next.data.challenge_id, code: "invalid" });
  assert.throws(() => e.context.nrGet9RoundBookingCodeForCopy_(config, newPayload), /コピー用リンク/);
});

test("production preparation isolates storage, keeps source data, and activation never resets reservations", () => {
  const e = environment({ realStaffAuth: true });
  const sourceRows = JSON.stringify(Array.from(e.data.sheets.values()).map(s => s.rows));
  const production = new e.data.constructor("production-reservations");
  production.getUrl = () => "https://docs.google.com/spreadsheets/d/production-reservations/edit";
  let created = 0, deploymentUrl = "https://script.google.com/macros/s/verified-public-id/dev";
  const originalOpen = e.context.SpreadsheetApp.openById;
  e.context.SpreadsheetApp.openById = id => id === production.id ? production : originalOpen(id);
  e.context.SpreadsheetApp.create = () => { created++; return production; };
  e.context.PropertiesService.getScriptProperties = () => ({
    getProperties: () => e.properties, getProperty: key => e.properties[key] || null,
    setProperty: (key, value) => { e.properties[key] = value; },
    setProperties: values => Object.assign(e.properties, values)
  });
  e.context.ScriptApp = { getService: () => ({ getUrl: () => deploymentUrl }) };
  vm.runInContext(read("9round-booking/gas/Production.gs"), e.context);
  e.context.nrBookingProductionTargets_ = () => ({ masterId: e.master.id, masterSheet: "Members", directoryId: e.directory.id });
  const prepared = e.context.nrPrepare9RoundBookingProduction_();
  assert.equal(prepared.prepared, true);
  assert.equal(e.properties.ROUND9_BOOKING_ENABLED, "false");
  assert.equal(e.properties.ROUND9_BOOKING_DEVELOPMENT_DATA_ID, e.data.id);
  assert.equal(production.sheets.get("nr_bookings").getLastRow(), 1);
  assert.throws(() => e.context.nrActivate9RoundBookingProduction_(), /バージョン付きデプロイ/);
  assert.throws(() => e.context.nrActivate9RoundBookingProduction_("https://example.invalid/exec"), /バージョン付きデプロイ/);
  const verifiedDeploymentUrl = "https://script.google.com/macros/s/verified-public-id/exec";
  assert.equal(e.context.nrActivate9RoundBookingProduction_(verifiedDeploymentUrl).enabled, true, "editor execution may still report a dev URL; use the URL observed in the deployment dialog");
  deploymentUrl = "https://script.google.com/macros/s/verified-public-id/exec";
  assert.equal(e.context.nrActivate9RoundBookingProduction_().enabled, true);
  assert.equal(e.properties.ROUND9_BOOKING_MEMBER_URL, deploymentUrl + "?page=member");
  const token = e.login(0);
  assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date: day, slot_id: slotId }).ok, true);
  e.context.nrActivate9RoundBookingProduction_();
  assert.equal(production.sheets.get("nr_bookings").getLastRow(), 2);
  assert.equal(created, 1);
  assert.throws(() => e.context.nrPrepare9RoundBookingProduction_(), /再初期化はしません/);
  assert.equal(JSON.stringify(Array.from(e.data.sheets.values()).map(s => s.rows)), sourceRows);
  const functionNames = [...read("9round-booking/gas/Production.gs").matchAll(/function\s+(\w+)\s*\(/g)].map(m => m[1]);
  assert.ok(functionNames.every(name => name.endsWith("_")), "provisioning helpers must be inaccessible to HTML RPC");
});

test("booking email actions bypass six-hour session but require a booking-scoped secret and explicit POST", () => {
  const e = environment(), token = e.login(0);
  const reserved = reserve(e, token);
  assert.equal(reserved.ok, true);
  const bookingId = reserved.data.booking_id;
  const sentMember = e.sent.find(mail => mail.subject.startsWith("【9ROUND アリオ蘇我店】予約確認"));
  const sentAdmin = e.sent.find(mail => mail.subject.startsWith("【9ROUND 管理通知】予約確認"));
  assert.ok(sentMember && sentAdmin);
  const memberLinks = [...sentMember.body.matchAll(/https:\/\/[^\s]+/g)].map(m => m[0]);
  const adminLinks = [...sentAdmin.body.matchAll(/https:\/\/[^\s]+/g)].map(m => m[0]);
  assert.equal(memberLinks.length, 2);
  assert.equal(adminLinks.length, 2);
  const memberUrl = new URL(memberLinks[1]);
  const adminUrl = new URL(adminLinks[1]);
  const mk = new URLSearchParams(memberUrl.hash.slice(1));
  const ak = new URLSearchParams(adminUrl.hash.slice(1));
  assert.equal(memberUrl.pathname.endsWith("/link-actions.html"), true);
  assert.equal(mk.get("booking_id"), bookingId);
  assert.notEqual(mk.get("mail_token"), ak.get("mail_token"));
  const member = { booking_id: bookingId, mail_token: mk.get("mail_token") };
  const manager = { booking_id: bookingId, mail_token: ak.get("mail_token") };
  const bad = e.call("get9RoundMailBooking", { ...member, mail_token: "0".repeat(64) });
  assert.equal(bad.code, "INVALID_MAIL_LINK");
  assert.equal(e.call("get9RoundMailBooking", member).data.booking.can_cancel, true);
  assert.equal(e.call("get9RoundMailBooking", manager).data.booking.can_cancel, true);
  assert.equal(e.call("get9RoundMailSlots", { ...member, date: day }).ok, true);
  assert.equal(e.data.sheets.get("nr_bookings").rows[1][9], "CONFIRMED");
  e.advance(7 * 3600000);
  assert.equal(e.call("get9RoundMailBooking", member).data.booking.can_cancel, true);
  assert.equal(e.call("cancel9RoundMailBooking", member).ok, true);
  assert.equal(e.call("get9RoundMailBooking", member).data.booking.status, "CANCELLED");
  assert.equal(e.call("cancel9RoundMailBooking", member).code, "BOOKING_UNAVAILABLE");
});

test("management email can reschedule without staff login and preserves guards", () => {
  const e = environment(), token = e.login(0);
  const booked = reserve(e, token);
  assert.equal(booked.ok, true);
  const adminMail = e.sent.find(mail => mail.subject.startsWith("【9ROUND 管理通知】予約確認"));
  const changeLink = [...adminMail.body.matchAll(/https:\/\/[^\s]+/g)][0][0];
  const parts = new URLSearchParams(new URL(changeLink).hash.slice(1));
  const args = { booking_id: parts.get("booking_id"), mail_token: parts.get("mail_token") };
  const next = "DAILY:" + day + ":11:00";
  assert.equal(e.call("reschedule9RoundMailBooking", { ...args, date: day, slot_id: next }).ok, true);
  assert.equal(e.call("reschedule9RoundMailBooking", { ...args, date: day, slot_id: next }).ok, true); // idempotent replay
  assert.equal(e.call("cancel9RoundMailBooking", args).ok, false);
  assert.equal(e.data.sheets.get("nr_bookings").rows[1][9], "RESCHEDULED");
  assert.equal(e.data.sheets.get("nr_management_actions").rows.length > 1, true);
});

test("suspended members, invalid secrets and past deadlines reject email actions", () => {
  const e = environment(), token = e.login(0);
  const booked = reserve(e, token);
  const memberMail = e.sent.find(mail => mail.subject.startsWith("【9ROUND アリオ蘇我店】予約確認"));
  const link = [...memberMail.body.matchAll(/https:\/\/[^\s]+/g)][1][0];
  const parts = new URLSearchParams(new URL(link).hash.slice(1));
  const args = { booking_id: parts.get("booking_id"), mail_token: parts.get("mail_token") };
  e.master.sheets.get("Members").rows[1][3] = "kyukai";
  assert.equal(e.call("cancel9RoundMailBooking", args).ok, false);
  e.master.sheets.get("Members").rows[1][3] = "ok";
  e.advance(26 * 3600000);
  assert.equal(e.call("cancel9RoundMailBooking", args).code, "DEADLINE_PASSED");
});
