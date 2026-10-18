const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { fixture, payload } = require("./helpers/9round-trial-fixture.cjs");
const root = path.resolve(__dirname, "..");
const day = "2026-10-18";
const support = { service_code: "MPG_TRAINING_SUPPORT45", staff_code: "KAWAKAMI", reservation_id: "MPG_TEST_001", date: day, start_time: "10:15", end_time: "11:00" };

function linked() {
  const e = fixture(), calls = [], logs = [];
  let mpgLocked = false, beforeRpc, beforeWrite, failure;
  const props = { ...e.properties, ROUND9_MPG_BRIDGE_URL: "https://script.google.com/macros/s/test-bridge/exec" };
  function rows(name) {
    const all = e.directory.sheets.get(name).rows;
    return all.slice(1).map(values => Object.fromEntries(all[0].map((h, i) => [h, values[i] ?? ""])));
  }
  const context = {
    Date: e.context.Date,
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => props, getProperty: key => props[key] }) },
    Utilities: { ...e.context.Utilities, formatDate: (d, zone, pattern) => pattern === "yyyy-MM-dd'T'HH:mm:ss" ? new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 19) : e.context.Utilities.formatDate(d, zone, pattern) },
    SpreadsheetApp: { flush() { assert.equal(mpgLocked, true, "MPG source must be flushed under its own lock before releasing a hold"); } },
    LockService: { getScriptLock: () => ({ waitLock() { assert.equal(mpgLocked, false); mpgLocked = true; }, releaseLock() { assert.equal(mpgLocked, true); mpgLocked = false; } }) },
    APP_CONFIG: { TIMEZONE: "Asia/Tokyo", SHEETS: { RESERVATIONS: "reservations", STAFF_SHIFTS: "staff_shifts" } },
    getSheetData: rows,
    getSheet(name) {
      const sheet = e.directory.sheets.get(name);
      return { getDataRange: () => ({ getValues: () => sheet.rows.map(r => [...r]) }), getRange: (row, col) => ({ setValue(value) {
        assert.equal(mpgLocked, true);
        if (beforeWrite) { const fn = beforeWrite; beforeWrite = null; fn(); }
        sheet.rows[row - 1][col - 1] = value;
      } }) };
    },
    formatShiftDate_: value => String(value || ""), formatShiftTime_: value => String(value || ""),
    normalizeShiftBoolean_: value => ["true", "1", "yes"].includes(String(value).toLowerCase()),
    logError: (...args) => logs.push(args),
    UrlFetchApp: { fetch(url, options) {
      assert.equal(url, props.ROUND9_MPG_BRIDGE_URL);
      const body = JSON.parse(options.payload), data = JSON.parse(body.payload_json); calls.push({ body, data });
      if (beforeRpc) beforeRpc(data);
      if (failure && failure(data) === "before") throw Error("network failed");
      const result = e.call(body.action, body);
      const lost = failure && failure(data) === "after";
      return { getResponseCode: () => lost ? 503 : 200, getContentText: () => JSON.stringify(result) };
    } }
  };
  vm.createContext(context);
  for (const file of ["gas/63_MpgShiftRules.gs", "gas/64_9RoundMpgBridge.gs"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  function lock(fn) { const l = context.LockService.getScriptLock(); l.waitLock(); try { return fn(); } finally { l.releaseLock(); } }
  const trial = (extra = {}) => e.call("create9RoundTrialBooking", payload(e.applicant(), extra));
  const daily = () => e.call("create9RoundWorkoutBooking", { session_token: e.login(), date: day, slot_id: "DAILY:" + day + ":10:15" });
  return { ...e, mpg: context, props, calls, logs, lock, trial, daily, rows, beforeRpc: fn => { beforeRpc = fn; }, beforeWrite: fn => { beforeWrite = fn; }, fail: fn => { failure = fn; } };
}

test("MPG coordination rejects unsigned, tampered and stale requests without exposing data", () => {
  const e = linked();
  assert.equal(e.call("coordinate9RoundMpg", {}).code, "MPG_BRIDGE_UNAUTHORIZED");
  e.mpg.mpg9RoundCall_({ operation: "snapshot" });
  const signed = e.calls.at(-1).body;
  assert.equal(e.call("coordinate9RoundMpg", { ...signed, payload_json: JSON.stringify({ operation: "pending" }) }).code, "MPG_BRIDGE_UNAUTHORIZED");
  e.advance(300001); assert.equal(e.call("coordinate9RoundMpg", signed).code, "MPG_BRIDGE_UNAUTHORIZED");
  assert.equal(e.data.sheets.get("nr_mpg_bridge").rows.length, 1);
});

test("a confirmed trial blocks MPG support and removes its availability, with no customer data in the snapshot", () => {
  const e = linked(); assert.equal(e.trial().ok, true);
  assert.throws(() => e.lock(() => e.mpg.mpg9RoundAcquireSupport_(support)), err => err.mpg9RoundCode === "MPG_TRIAL_CONFLICT");
  const slots = e.mpg.mpg9RoundFilterSupportSlots_(day, [{ start_time: "10:15", end_time: "11:00" }, { start_time: "11:00", end_time: "11:45" }], "MPG_TRAINING_SUPPORT45");
  assert.deepEqual(Array.from(slots, s => s.start_time), ["11:00"]);
  const snapshot = e.mpg.mpg9RoundCall_({ operation: "snapshot" });
  assert.doesNotMatch(JSON.stringify(snapshot), /email|phone|name|application|体験 太郎/);
});

test("an MPG support hold excludes trial booking before the source reservation has been saved", () => {
  const e = linked();
  e.lock(() => {
    const hold = e.mpg.mpg9RoundAcquireSupport_(support);
    assert.equal(e.rows("reservations").length, 0); assert.equal(e.trial().code, "TRIAL_UNAVAILABLE");
    e.directory.sheets.get("reservations").rows.push(["KAWAKAMI", "MPG_TRAINING_SUPPORT45", day, "10:15", "11:00", "RESERVED"]);
    assert.equal(e.mpg.mpg9RoundReleaseSupportSafely_(hold), true);
  });
  assert.equal(e.trial().code, "TRIAL_UNAVAILABLE");
  e.directory.sheets.get("reservations").rows[1][5] = "CANCELLED";
  assert.equal(e.trial().ok, true);
});

test("MPG support rechecks a trial that was confirmed after an availability read", () => {
  const e = linked();
  assert.equal(e.mpg.mpg9RoundFilterSupportSlots_(day, [support], support.service_code).length, 1);
  e.trial();
  assert.throws(() => e.lock(() => e.mpg.mpg9RoundAcquireSupport_({ ...support, reservation_id: "MPG_MOVED_002" })), err => err.mpg9RoundCode === "MPG_TRIAL_CONFLICT");
  assert.equal(e.rows("reservations").length, 0);
});

test("MPG rescheduling guards the old and new intervals until a commit or rollback completes", () => {
  for (const rollback of [true, false]) {
    const e = linked(), source = e.directory.sheets.get("reservations").rows;
    source.push(["KAWAKAMI", "MPG_TRAINING_SUPPORT45", day, "10:15", "11:00", "RESERVED"]);
    e.lock(() => {
      const hold = e.mpg.mpg9RoundAcquireSupport_({ ...support, start_time: "11:00", end_time: "11:45", previous: support });
      source[1][3] = "11:00"; source[1][4] = "11:45";
      assert.equal(e.trial().code, "TRIAL_UNAVAILABLE", "old time stays guarded while Sheets temporarily contains only the new time");
      assert.equal(e.trial({ slot_id: "TRIAL:" + day + ":11:00" }).code, "TRIAL_UNAVAILABLE");
      if (rollback) { source[1][3] = "10:15"; source[1][4] = "11:00"; }
      assert.equal(e.mpg.mpg9RoundReleaseSupportSafely_(hold), true);
    });
    const slots = e.call("get9RoundTrialSlots", { date: day }).data.slots;
    assert.equal(slots[0].closed, rollback); assert.equal(slots[1].closed, !rollback);
  }
});

test("lost acquire replies release the unknown hold and reject late duplicate acquires", () => {
  const e = linked(); e.fail(data => data.operation === "acquire_support" ? "after" : null);
  assert.throws(() => e.lock(() => e.mpg.mpg9RoundAcquireSupport_(support)), err => err.mpg9RoundCode === "MPG_BRIDGE_UNAVAILABLE");
  const hold = e.calls.find(c => c.data.operation === "acquire_support").data;
  e.fail(null);
  assert.throws(() => e.mpg.mpg9RoundCall_(hold), err => err.mpg9RoundCode === "MPG_BRIDGE_CLOSED");
  assert.equal(e.trial().ok, true);
});

test("an interrupted hold stays closed until the MPG locked recovery reconciles it", () => {
  const e = linked();
  e.lock(() => { e.mpg.mpg9RoundAcquireSupport_(support); });
  assert.equal(e.trial().code, "TRIAL_UNAVAILABLE");
  e.advance(900001);
  assert.equal(e.lock(() => e.mpg.mpg9RoundRecoverPending_()), 1);
  assert.equal(e.trial().ok, true);
});

test("failure to release a committed MPG hold preserves exclusion until recovery, then source still excludes trials", () => {
  const e = linked();
  e.lock(() => {
    const hold = e.mpg.mpg9RoundAcquireSupport_(support);
    e.directory.sheets.get("reservations").rows.push(["KAWAKAMI", "MPG_TRAINING_SUPPORT45", day, "10:15", "11:00", "RESERVED"]);
    e.fail(data => data.operation === "release_support" ? "before" : null);
    assert.equal(e.mpg.mpg9RoundReleaseSupportSafely_(hold), false);
  });
  assert.equal(e.trial().code, "TRIAL_UNAVAILABLE");
  e.advance(900001); e.fail(null); assert.equal(e.lock(() => e.mpg.mpg9RoundRecoverPending_()), 1);
  assert.equal(e.trial().code, "TRIAL_UNAVAILABLE"); assert.equal(e.logs.length, 1);
});

test("the 48-hour cleanup preserves Kawakami's shift when both daily and trial are confirmed", () => {
  const e = linked(); assert.equal(e.daily().ok, true); assert.equal(e.trial().ok, true);
  const result = e.mpg.cleanupUnbookedMpgShifts();
  assert.equal(result.reserved_count, 1); assert.equal(result.removed_count, 0);
  assert.equal(String(e.directory.sheets.get("staff_shifts").rows[1][5]), "true");
});

test("48-hour protection keeps only the booked MPG interval and retires its empty neighbor", () => {
  const e = linked(), shifts = e.directory.sheets.get("staff_shifts").rows;
  shifts[1][4] = "11:00";
  shifts.push(["KAWAKAMI", "MPG", day, "11:00", "11:45", "true"]);
  e.daily(); assert.equal(e.trial().ok, true);
  const result = e.mpg.cleanupUnbookedMpgShifts();
  assert.equal(result.reserved_count, 1); assert.equal(result.removed_count, 1);
  assert.equal(String(shifts[1][5]), "true"); assert.equal(shifts.at(-1)[5], false);
});

test("single-type reservations do not protect MPG shifts and keep the correct 9ROUND side after cleanup", () => {
  for (const first of ["DAILY", "TRIAL", "NONE"]) {
    const e = linked(), token = e.login();
    if (first === "DAILY") e.call("create9RoundWorkoutBooking", { session_token: token, date: day, slot_id: "DAILY:" + day + ":10:15" });
    if (first === "TRIAL") e.trial();
    assert.equal(e.mpg.cleanupUnbookedMpgShifts().removed_count, 1);
    const trial = e.call("get9RoundTrialSlots", { date: day }).data.slots.some(s => s.start_time === "10:15");
    const daily = e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).data.slots.some(s => s.start_time === "10:15");
    assert.equal(trial, first !== "DAILY"); assert.equal(daily, first !== "TRIAL");
  }
});

test("a second 9ROUND type booked just before retirement protects the shift atomically", () => {
  const e = linked(); e.daily(); let checked = false;
  e.beforeRpc(data => {
    if (data.operation === "retire_shifts" && !checked) { checked = true; assert.equal(e.trial().ok, true); }
  });
  assert.equal(e.mpg.cleanupUnbookedMpgShifts().removed_count, 0); assert.equal(checked, true);
  assert.equal(String(e.directory.sheets.get("staff_shifts").rows[1][5]), "true");
});

test("retirement wins before the physical sheet write and forbids a competing second 9ROUND type", () => {
  const e = linked(); e.daily(); let checked = false;
  e.beforeWrite(() => { checked = true; assert.equal(e.trial().code, "TRIAL_UNAVAILABLE"); });
  assert.equal(e.mpg.cleanupUnbookedMpgShifts().removed_count, 1); assert.equal(checked, true);
});

test("cancelled trials release shift protection and communication failures never delete unverified shifts", () => {
  const e = linked(); e.daily(); const a = e.trial().data;
  assert.equal(e.mpg.cleanupUnbookedMpgShifts().removed_count, 0);
  e.call("cancel9RoundTrialBooking", a);
  e.fail(() => "before"); assert.throws(() => e.mpg.cleanupUnbookedMpgShifts(), err => err.mpg9RoundCode === "MPG_BRIDGE_UNAVAILABLE");
  assert.equal(String(e.directory.sheets.get("staff_shifts").rows[1][5]), "true");
  e.fail(null); assert.equal(e.mpg.cleanupUnbookedMpgShifts().removed_count, 1);
});

test("coordination stays disabled for existing MPG deployments and invalid enabled settings fail closed", () => {
  const e = linked(); e.props.ROUND9_MPG_BRIDGE_ENABLED = "false";
  assert.equal(e.lock(() => e.mpg.mpg9RoundAcquireSupport_(support)), null); assert.equal(e.calls.length, 0);
  e.props.ROUND9_MPG_BRIDGE_ENABLED = "true"; e.props.ROUND9_MPG_BRIDGE_SECRET = "short";
  assert.throws(() => e.lock(() => e.mpg.mpg9RoundAcquireSupport_(support)), err => err.mpg9RoundCode === "MPG_BRIDGE_CONFIGURATION");
  assert.equal(e.calls.length, 0);
});

test("the deployment overlay installs the same coordination hooks and is safe to apply twice", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "9round-mpg-overlay-"));
  try {
    const live = path.join(dir, ".gas-live"); fs.mkdirSync(live);
    const files = ["28_Availability.gs.js", "29_Reservation.gs.js", "32_UpdateReservation.gs.js"];
    for (const name of files) {
      let text = fs.readFileSync(path.join(root, "gas", name), "utf8");
      text = text.replace("        slots,\n        serviceCode\n      );", "        slots\n      );")
        .replace("\n  let nineRoundHold = null;", "")
        .replace(/\n    if \(typeof mpg9RoundAcquireSupport_ === "function"\)[\s\S]*?;\n/, "")
        .replace(/\n    if \(typeof mpg9RoundReleaseSupportSafely_ === "function"\) mpg9RoundReleaseSupportSafely_\(nineRoundHold\);\n/, "\n")
        .replace('error.mpg9RoundCode ? error.message : "予約登録中にエラーが発生しました。"', '"予約登録中にエラーが発生しました。"')
        .replace('error.mpg9RoundCode ? error.message : "予約変更中にエラーが発生しました。"', '"予約変更中にエラーが発生しました。"')
        .replace('error.mpg9RoundCode || "SYSTEM_ERROR"', '"SYSTEM_ERROR"');
      fs.writeFileSync(path.join(live, name), text.replace(/\n(?:[ \t]*\n)+/g, "\n\n"));
    }
    const script = path.join(root, "scripts/gas-mpg-shift-overlay.mjs");
    execFileSync(process.execPath, [script, "--9round-only"], { cwd: dir });
    const first = files.map(name => fs.readFileSync(path.join(live, name), "utf8"));
    const normalize = s => s.replace(/\n\s*\n/g, "\n\n");
    files.forEach((name, i) => assert.equal(normalize(first[i]), normalize(fs.readFileSync(path.join(root, "gas", name), "utf8")), name));
    execFileSync(process.execPath, [script, "--9round-only"], { cwd: dir });
    files.forEach((name, i) => assert.equal(fs.readFileSync(path.join(live, name), "utf8"), first[i], name));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
