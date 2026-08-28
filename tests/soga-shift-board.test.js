const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const gas = fs.readFileSync(path.join(root, "gas", "61_SogaShiftBoard.gs"), "utf8");
const main = fs.readFileSync(path.join(root, "gas", "99_Main.gs"), "utf8");
const ui = fs.readFileSync(path.join(root, "admin", "admin-soga-shifts.js"), "utf8");
const config = fs.readFileSync(path.join(root, "admin", "firebase-config.js"), "utf8");
const monthly = fs.readFileSync(path.join(root, "admin", "admin-monthly-v58.js"), "utf8");
const admin = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");

const context = { console, Date, JSON, Math, String, Number, Array, Object, RegExp };
vm.createContext(context);
vm.runInContext(gas, context);

const slots = vm.runInContext("sogaSlotObjects_()", context);
assert.equal(slots.length, 11);
assert.deepEqual(JSON.parse(JSON.stringify(slots[0])), { start_time: "10:15", end_time: "11:00" });
assert.deepEqual(JSON.parse(JSON.stringify(slots[4])), { start_time: "13:15", end_time: "14:00" });
assert.deepEqual(JSON.parse(JSON.stringify(slots[5])), { start_time: "16:15", end_time: "17:00" });
assert.deepEqual(JSON.parse(JSON.stringify(slots[10])), { start_time: "20:00", end_time: "20:45" });

const validAssignments = [
  { staff_code: "A", date: "2026-09-01", start_time: "10:15", end_time: "11:00", assignment_type: "SHIFT" },
  { staff_code: "B", date: "2026-09-01", start_time: "10:15", end_time: "11:00", assignment_type: "TRIAL" }
];
assert.equal(context.sogaNormalizeAssignments_(validAssignments, "2026-09").length, 2);
assert.throws(
  () => context.sogaNormalizeAssignments_(validAssignments.concat({
    staff_code: "C", date: "2026-09-01", start_time: "10:15", end_time: "11:00", assignment_type: "SHIFT"
  }), "2026-09"),
  /2名まで/
);
assert.throws(
  () => context.sogaNormalizeAssignments_([{
    staff_code: "A", date: "2026-09-01", start_time: "10:00", end_time: "10:45", assignment_type: "SHIFT"
  }], "2026-09"),
  /45分枠/
);
assert.equal(context.sogaIsEligibleStaff_({ active: true, can_9round: true, store_code: "YACHIYO" }, "SOGA"), true);
assert.equal(context.sogaIsEligibleStaff_({ active: true, can_9round: false, store_code: "SOGA" }, "SOGA"), true);
assert.equal(context.sogaIsEligibleStaff_({ active: true, can_9round: false, store_code: "YACHIYO" }, "SOGA"), false);
assert.equal(context.sogaIsEligibleStaff_({ active: false, can_9round: true, store_code: "SOGA" }, "SOGA"), false);

for (const action of [
  "getMySogaShiftRequests",
  "getSogaShiftBoard",
  "saveMySogaShiftRequests",
  "saveSogaShiftAssignments",
  "importSogaShiftRequests"
]) {
  assert.match(main, new RegExp(`case "${action}"`));
}

assert.match(ui, /希望シフトを送信/);
assert.match(ui, /希望CSVを取り込む/);
assert.match(ui, /management\(\)\?`<button class="soga-mode-tab/);
assert.match(ui, /if\(SG\.mode==="final"&&management\(\)\)await loadFinal_\(\);else await loadRequests_\(\)/);
assert.match(ui, /row\.active!==false&&\/\(SOGA\|蘇我\|9ROUND/);
const requestRender = ui.match(/function renderRequestForm_\(\)[\s\S]*?\n  }/)?.[0] || "";
const requestSubmit = ui.match(/async function submitRequests_\(\)[\s\S]*?\n\n/)?.[0] || "";
assert.match(requestRender, /selectedRequests\.(delete|add)/, "枠タップは画面内の選択状態だけを変更する");
assert.doesNotMatch(requestRender, /apiPost\(/, "枠タップだけで希望を送信してはいけない");
assert.match(requestSubmit, /action:"saveMySogaShiftRequests"/, "最後の送信ボタンで月内希望を一括保存する");
assert.match(ui, /if\(!current\).*slotSelectedCount_/s);
assert.match(ui, /else if\(current==="SHIFT"\)SG\.assignments\.set\(k,"TRIAL"\)/);
assert.match(ui, /else SG\.assignments\.delete\(k\)/);
assert.match(ui, /setTimeout\(\(\)=>\{longPressed=true;clearAssignment_\(button\);\},650\)/);
assert.match(config, /admin-soga-shifts\.js\?v=20260828-soga-shifts-v1/);

const importHandler = gas.match(/function importSogaShiftRequests\(body\)[\s\S]*?\n}/)?.[0] || "";
assert.match(importHandler, /requireAuth_\(body, \["ADMIN", "MANAGER"\]\)/, "CSV取込は管理権限だけに限定する");

const myShiftLoad = admin.match(/async function loadMyShiftView\(\)[\s\S]*?^}/m)?.[0] || "";
assert.match(myShiftLoad, /getStaffShifts/);
assert.doesNotMatch(myShiftLoad, /store_code\s*:/, "自分のシフトは全店舗を取得する必要がある");
assert.match(monthly, /apiGet\("getStaffShifts",\{start_date:r\.start,end_date:r\.end\}\)/);

console.log("soga shift board tests passed");
