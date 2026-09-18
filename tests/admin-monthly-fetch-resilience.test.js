const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("admin GET requests allow slow GAS responses", () => {
  const firebase = read("admin/firebase-config.js");
  assert.match(firebase, /const API_REQUEST_TIMEOUT_MS = 60000/);
});

test("monthly schedule survives a staff-directory fetch failure", () => {
  const monthly = read("admin/admin-monthly-v58.js");
  assert.match(monthly, /const shiftRequest=apiGet\("getStaffShifts",shiftParams\)/);
  assert.match(monthly, /apiGet\("getStaff",\{include_inactive:"false"\}\)\.catch\(staffError=>/);
  assert.match(monthly, /const \[j,s\]=await Promise\.all\(\[shiftRequest,staffRequest\]\)/);
  assert.match(monthly, /id="mRetry"/);
  assert.doesNotMatch(
    monthly,
    /Promise\.all\(\[apiGet\("getStaffShifts",shiftParams\),staffRequest\]\)/
  );
});

test("admin pages and monthly addon use the new cache version", () => {
  const firebase = read("admin/firebase-config.js");
  assert.match(firebase, /admin-monthly-v58\.js\?v=20260918-schedule-fetch-v2/);

  for (const page of ["admin/index.html", "admin/admin.html"]) {
    const html = read(page);
    assert.match(html, /firebase-config\.js\?v=20260918-schedule-fetch-v2/);
  }
});
