const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const personal = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "personal-v54.js"),
  "utf8"
);
const confirm = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "personal-trainer-confirm.js"),
  "utf8"
);

assert.match(personal, /trainerSelectionRequired_\(\) && !selectedTrainerCode/);
assert.match(personal, /womenOnlyTrainerAllowed_\(\)[\s\S]*すべてのトレーナー/);
assert.doesNotMatch(personal, /trainers\.map\(\(trainer\) => fetchSlotsForTrainer_/);
assert.match(confirm, /Math\.min\(3,all\.length\|\|1\)/);

console.log("personal mobile policy tests passed");
