const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("admin GET requests allow slow GAS responses", () => {
  const firebase = read("admin/firebase-config.js");
  assert.match(firebase, /const API_REQUEST_TIMEOUT_MS = 60000/);
});

test("monthly schedule survives a staff-directory fetch failure", () => {
  const monthly = read("admin/admin-monthly-v58.js");
  assert.match(monthly, /const shiftRequest=loginPrefetchFor_\(ym\)\|\|apiGet\("getStaffShifts",monthParams_\(ym\)\)/);
  assert.match(monthly, /Promise\.resolve\(shiftRequest\)\.then\(j=>/);
  assert.match(monthly, /apiGet\("getStaff",\{include_inactive:"false"\}\)\.then\(s=>/);
  assert.match(monthly, /catch\(staffError=>console\.warn/);
  assert.match(monthly, /id="mRetry"/);
  assert.match(monthly, /保存データを表示中・更新できませんでした/);
  assert.match(monthly, /monthlyRequests_=new Map\(\)/);
  assert.doesNotMatch(monthly, /Promise\.all\(\[shiftRequest,staffRequest\]\)/);
});

test("admin pages and monthly addon use the new cache version", () => {
  const firebase = read("admin/firebase-config.js");
  assert.match(firebase, /admin-monthly-v58\.js\?v=20260920-fast-month-v1/);

  for (const page of ["admin/index.html", "admin/admin.html"]) {
    const html = read(page);
    assert.match(html, /firebase-config\.js\?v=20260920-head-office-counsel-v1/);
  }
});

test("monthly schedule renders cache first and invalidates it after shift changes", () => {
  const monthly = read("admin/admin-monthly-v58.js");
  assert.match(monthly, /MONTHLY_CACHE_PREFIX="anauts_monthly_cache_v1:"/);
  assert.match(monthly, /readMonthlyCache_\(ym\)/);
  assert.match(monthly, /writeMonthlyCache_\(ym,payload\)/);
  assert.match(monthly, /"saveStaffShift","deleteStaffShift","importStaffShifts"/);
  assert.match(monthly, /window\.ANAUTS_INVALIDATE_MONTHLY_CACHE=invalidateMonthlyCache_/);
});

test("monthly request covers the exact selected calendar month", () => {
  const monthly = read("admin/admin-monthly-v58.js");
  const source = monthly.match(/function monthParams_\(ym\)\{[\s\S]*?^    \}/m)?.[0];
  assert.ok(source);
  const context = { sogaStaffRestricted_: () => false };
  vm.runInNewContext(`${source};result=[monthParams_("2026-09"),monthParams_("2028-02")];`, context);
  assert.deepEqual(
    Array.from(context.result, value => ({ start_date: value.start_date, end_date: value.end_date })),
    [
      { start_date: "2026-09-01", end_date: "2026-09-30" },
      { start_date: "2028-02-01", end_date: "2028-02-29" }
    ]
  );
});
