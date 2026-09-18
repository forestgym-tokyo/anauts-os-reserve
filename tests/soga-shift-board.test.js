const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function functionSource(source, name) {
  const match = source.match(new RegExp(`function ${name}\\([\\s\\S]*?^\\}`, "m"));
  assert.ok(match, `${name} must exist`);
  return match[0];
}

test("SOGA assignment normalization accepts every person's wish in one slot", () => {
  const source = read("gas/61_SogaShiftBoard.gs");
  const code = ["sogaTime_", "sogaDate_", "sogaIsSlot_", "sogaNormalizeAssignments_"]
    .map(name => functionSource(source, name)).join("\n");
  const context = { SOGA_SHIFT_SLOTS: [["10:15", "11:00"]] };
  vm.runInNewContext(`${code};result=sogaNormalizeAssignments_([
    {staff_code:"A",date:"2026-10-01",start_time:"10:15",end_time:"11:00"},
    {staff_code:"B",date:"2026-10-01",start_time:"10:15",end_time:"11:00"},
    {staff_code:"C",date:"2026-10-01",start_time:"10:15",end_time:"11:00"}
  ],"2026-10");`, context);
  assert.equal(context.result.length, 3);
  assert.doesNotMatch(source, /slotCounts|1枠2名まで|2名を超えています/);
});

test("SOGA assignment normalization still rejects duplicate people and invalid slots", () => {
  const source = read("gas/61_SogaShiftBoard.gs");
  const code = ["sogaTime_", "sogaDate_", "sogaIsSlot_", "sogaNormalizeAssignments_"]
    .map(name => functionSource(source, name)).join("\n");
  const context = { SOGA_SHIFT_SLOTS: [["10:15", "11:00"]] };
  vm.runInNewContext(code, context);
  assert.throws(() => context.sogaNormalizeAssignments_([
    {staff_code:"A",date:"2026-10-01",start_time:"10:15",end_time:"11:00"},
    {staff_code:"A",date:"2026-10-01",start_time:"10:15",end_time:"11:00"}
  ], "2026-10"), /重複/);
  assert.throws(() => context.sogaNormalizeAssignments_([
    {staff_code:"A",date:"2026-10-01",start_time:"10:00",end_time:"11:00"}
  ], "2026-10"), /45分枠/);
});

test("SOGA board loads additively and offers unlimited bulk selection", () => {
  const ui = read("admin/admin-soga-shifts.js");
  const config = read("admin/firebase-config.js");
  const main = read("gas/99_Main.gs");
  assert.match(config, /admin-soga-shifts\.js\?v=20260918-shift-publication-v1/);
  assert.match(ui, /希望を全てシフトへ入れる/);
  assert.match(ui, /人数制限なく一括選択/);
  assert.match(ui, /SG\.requests\.forEach\(row=>/);
  assert.doesNotMatch(ui, /1枠2名まで|slotSelectedCount_/);
  assert.match(ui, /administrator\(\)[\s\S]*?スタッフへ公開/);
  assert.match(ui, /if\(!\(await backendReady_\(\)\)\)return/);
  ["getMySogaShiftRequests", "getSogaShiftBoard", "getStaffShiftPublication",
    "saveMySogaShiftRequests", "saveSogaShiftAssignments",
    "importSogaShiftRequests", "publishStaffShiftMonth"]
    .forEach(action => assert.match(main, new RegExp(`case "${action}"`)));
});
