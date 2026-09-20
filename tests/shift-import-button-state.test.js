const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("shift CSV import button exposes registering and completed states", () => {
  const source = read("admin/admin.js");
  assert.match(source, /function setShiftImportButtonState_\(status,disabled\)/);
  assert.match(source, /status==="registering"\?"登録中…":status==="complete"\?"登録完了":"登録する"/);
  assert.match(source, /setShiftImportButtonState_\("registering",true\);\s*try\{\s*const j=await apiPost\(\{\s*action:"importStaffShifts"/);
  assert.match(source, /setShiftImportButtonState_\("complete",true\);\s*await updateReplaceWarning\(\)/);
  assert.match(source, /catch\(e\)\{\s*setShiftImportButtonState_\("idle",false\);\s*msg\(e\.message,true\)/);
  assert.match(source, /button\.setAttribute\("aria-busy",status==="registering"\?"true":"false"\)/);
});

test("shift CSV import states have distinct colors", () => {
  const css = read("admin/admin.css");
  assert.match(css, /#shiftImportButton\.is-registering[\s\S]*?#ffd36a[\s\S]*?cursor:wait/);
  assert.match(css, /#shiftImportButton\.is-complete[\s\S]*?#59d9c0[\s\S]*?cursor:default/);
});

test("admin pages load the cache-busted shift import assets", () => {
  for (const page of ["admin/index.html", "admin/admin.html"]) {
    const html = read(page);
    assert.match(html, /admin\.css\?v=20260920-shift-import-status-v1/);
    assert.match(html, /admin\.js\?v=20260920-shift-import-status-v1/);
  }
});
