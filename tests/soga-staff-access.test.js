const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("only ordinary SOGA staff receive the restricted navigation", () => {
  const admin = read("admin/admin.js");
  const source = admin.match(/function isSogaStaffUser\(\)\{[\s\S]*?^\}/m)?.[0];
  assert.ok(source, "isSogaStaffUser must exist");

  const context = {
    authEnabled: () => true,
    state: { authUser: { permission: "STAFF", store_code: "SOGA" } }
  };
  vm.runInNewContext(`${source};result=isSogaStaffUser();`, context);
  assert.equal(context.result, true);

  context.state.authUser.permission = "MANAGER";
  vm.runInNewContext("result=isSogaStaffUser();", context);
  assert.equal(context.result, false);

  context.state.authUser = { permission: "STAFF", store_code: "YACHIYO" };
  vm.runInNewContext("result=isSogaStaffUser();", context);
  assert.equal(context.result, false);
});

test("SOGA navigation restrictions are removed before ADMIN or MANAGER use", () => {
  const admin = read("admin/admin.js");

  assert.match(admin, /function resetSogaStaffUi_\(resetView=false\)/);
  assert.match(admin, /data-soga-restricted-hidden="1"[\s\S]*?classList\.remove\("is-hidden"\)/);
  assert.match(admin, /if\(!restricted\)\{[\s\S]*?resetSogaStaffUi_\(\);[\s\S]*?return;/);
  assert.match(admin, /if\(!button\.classList\.contains\("is-hidden"\)\)button\.dataset\.sogaRestrictedHidden="1"/);
  assert.match(admin, /function logout\(\)[\s\S]*?resetSogaStaffUi_\(true\)/);
  assert.match(admin, /button\.dataset\.view==="staffSchedule"/);
  assert.match(admin, /view\.id==="staffScheduleView"/);
});

test("SOGA staff UI exposes only personal shifts and the fixed 9ROUND schedule", () => {
  const admin = read("admin/admin.js");
  const monthly = read("admin/admin-monthly-v58.js");
  const css = read("admin/admin.css");

  assert.match(admin, /new Set\(\["myShift","monthlySchedule"\]\)/);
  assert.match(admin, /targetView=activeButton\?\.dataset\.view\|\|"myShift"/);
  assert.match(admin, /storeChip\.textContent="9ROUND \/ SOGA"/);
  assert.match(css, /\.soga-staff-restricted[\s\S]*data-view="myShift"[\s\S]*data-view="monthlySchedule"/);

  assert.match(monthly, /state\.monthlyStore=sogaStaffRestricted_\(\)\?"SOGA"/);
  assert.match(monthly, /if\(sogaStaffRestricted_\(\)\)shiftParams\.store_code="SOGA"/);
  assert.match(monthly, /select\.disabled=true/);
  assert.match(monthly, /9ROUND アリオ蘇我店 \(SOGA\)/);
  assert.match(monthly, /9ROUND予定/);
});

test("SOGA staff personal shift request stays available and is store-fixed", () => {
  const admin = read("admin/admin.js");
  const main = read("gas/99_Main.gs");

  assert.match(admin, /if\(isSogaStaffUser\(\)\)shiftParams\.store_code="SOGA"/);
  assert.match(admin, /if\(role==="STAFF"&&!isSogaStaffUser\(\)\)/);
  assert.match(main, /case "createShiftChangeRequest"[\s\S]*?body\.staff_code = shiftRequestAuth\.staff_code;[\s\S]*?body\.store_code = "SOGA";/);
});

test("GAS filters SOGA shift data and refuses unrelated admin features", () => {
  const auth = read("gas/50_Auth.gs");
  const main = read("gas/99_Main.gs");

  assert.match(auth, /permission === "STAFF" && storeCode === "SOGA"/);
  assert.match(auth, /if \(isRestrictedSogaStaff_\(auth\)\) \{[\s\S]*?return successResponse\(auth\.profile\)/);
  assert.match(main, /function requireNonRestrictedAdminFeature_/);
  assert.match(main, /case "getStaffSchedule":[\s\S]*?requireNonRestrictedAdminFeature_/);
  assert.match(main, /case "getTrainerSchedule":[\s\S]*?requireNonRestrictedAdminFeature_/);
  assert.match(main, /case "getDailyReport"[\s\S]*?requireNonRestrictedAdminFeature_/);

  const filterSource = main.match(/function filterSogaShiftRows_\([\s\S]*?^\}/m)?.[0];
  assert.ok(filterSource, "SOGA shift response filter must exist");
  const context = {};
  vm.runInNewContext(
    `${filterSource};result=filterSogaShiftRows_(` +
      `[{staff_code:"OZAWA",store_code:"SOGA"},{staff_code:"OZAWA",store_code:"YACHIYO"},{staff_code:"MIYAKE",store_code:"SOGA"}],` +
      `"OZAWA",{staff_code:"OZAWA"});`,
    context
  );
  assert.deepEqual(
    Array.from(context.result, row => ({ staff_code: row.staff_code, store_code: row.store_code })),
    [{ staff_code: "OZAWA", store_code: "SOGA" }]
  );
});
