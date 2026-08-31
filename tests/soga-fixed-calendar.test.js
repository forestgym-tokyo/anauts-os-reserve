const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("SOGA fixed shifts reuse the existing monthly endpoint and filter in the browser", () => {
  const monthly = read("admin/admin-monthly-v58.js");

  assert.match(monthly, /id="mStore"/);
  assert.match(monthly, /store==="ALL"\|\|String\(x\.store_code\)===store/);
  assert.match(monthly, /store==="SOGA"\?"9ROUNDシフト"/);
  assert.match(monthly, /9ROUND ARIO SOGA/);
  assert.match(monthly, /function staffColor_/);
  assert.match(monthly, /\?color:"#63d179"/);
  assert.match(monthly, /const shiftParams=\{start_date:r\.start,end_date:r\.end\}/);
  assert.match(monthly, /apiGet\("getStaffShifts",shiftParams\)/);
  assert.doesNotMatch(monthly, /getCalendarEvents|GoogleCalendar|CalendarApp/);
});

test("monthly CSV import fixes the destination store and invalidates stale previews", () => {
  const admin = read("admin/admin.js");
  const html = read("admin/admin.html");

  assert.match(html, /id="shiftBulkStore"/);
  assert.match(html, /CSV列：staff_code,date,start_time,end_time/);
  assert.match(admin, /action:"previewStaffShiftImport"[\s\S]*?store_code:\$\("#shiftBulkStore"\)\.value/);
  assert.match(admin, /action:"importStaffShifts"[\s\S]*?store_code:store/);
  assert.match(admin, /function normalizeShiftCsvDate_/);
  assert.match(admin, /date:normalizeShiftCsvDate_\(o\.date\)/);
  assert.match(admin, /店舗：\$\{storeLabel\}/);
  assert.match(admin, /function invalidateShiftImportPreview_/);
  assert.match(admin, /\$\("#shiftCsvFile"\)\?\.addEventListener\("change",invalidateShiftImportPreview_\)/);
});

test("shift CSV dates accept spreadsheet slash notation without server-side work", () => {
  const admin = read("admin/admin.js");
  const source = admin.match(/function normalizeShiftCsvDate_\(value\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const context = {};
  vm.runInNewContext(`${source};result=[normalizeShiftCsvDate_("2026/9/1"),normalizeShiftCsvDate_("2026-09-30")];`, context);
  assert.deepEqual(Array.from(context.result), ["2026-09-01", "2026-09-30"]);
});

test("each signed-in staff member keeps one cross-store personal calendar", () => {
  const admin = read("admin/admin.js");
  const monthly = read("admin/admin-monthly-v58.js");

  assert.match(admin, /staff_code:state\.authUser\.staff_code,[\s\S]*?start_date:range\.start,[\s\S]*?end_date:range\.end/);
  assert.doesNotMatch(admin.slice(admin.indexOf("async function loadMyShiftView"), admin.indexOf("function renderMyShiftRows")), /store_code:/);
  assert.match(monthly, /八千代・SOGA両店舗の自分の確定シフト/);
  assert.match(monthly, /esc\(x\.store_code\|\|""\)/);
});
