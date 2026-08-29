const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "gas", "99_Main.gs"), "utf8");

assert.match(main, /function requireDirectShiftEditPermission_\(params\)/);
assert.match(
  main,
  /requireAuth_\(\s*params \|\| \{\},\s*\["ADMIN", "MANAGER"\]\s*\)/
);

for (const action of [
  "saveStaffShift",
  "deleteStaffShift",
  "previewStaffShiftImport",
  "importStaffShifts"
]) {
  const route = new RegExp(
    `case "${action}":[\\s\\S]{0,180}requireDirectShiftEditPermission_\\(\\s*body\\s*\\)`
  );
  assert.match(main, route, `${action} must require direct shift permission`);
}

let checkedParams = null;
let checkedPermissions = null;
const context = {
  requireAuth_(params, permissions) {
    checkedParams = params;
    checkedPermissions = permissions;
    return { permission: "ADMIN" };
  }
};

vm.createContext(context);
vm.runInContext(
  main.match(/function requireDirectShiftEditPermission_\(params\) \{[\s\S]*?\n\}/)[0],
  context
);

const payload = { id_token: "token" };
const result = context.requireDirectShiftEditPermission_(payload);

assert.equal(result.permission, "ADMIN");
assert.equal(checkedParams, payload);
assert.deepEqual(Array.from(checkedPermissions), ["ADMIN", "MANAGER"]);

console.log("direct shift permission tests passed");
