const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const personal = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "personal-v54.js"),
  "utf8"
);
const reserve = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "reserve.js"),
  "utf8"
);
const gender = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "yoshimaru-gender.js"),
  "utf8"
);
const personalHtml = fs.readFileSync(
  path.join(__dirname, "..", "personal", "index.html"),
  "utf8"
);
const mainGas = fs.readFileSync(
  path.join(__dirname, "..", "gas", "99_Main.gs"),
  "utf8"
);
const policyGas = fs.readFileSync(
  path.join(__dirname, "..", "gas", "59_YoshimaruGender.gs"),
  "utf8"
);

assert.match(personal, /trainerSelectionRequired_\(\) && !selectedTrainerCode/);
assert.match(personal, /function trainerSelectionRequired_\(\)\s*{\s*return bookingEligibilityReady_\(\);/);
assert.doesNotMatch(personal, /すべてのトレーナー/);
assert.doesNotMatch(personal, /trainers\.map\(\(trainer\) => fetchSlotsForTrainer_/);
assert.match(personal, /action", "getAvailableSlotsRange"/);
assert.match(personal, /Math\.ceil\(dates\.length \/ 2\)/);
assert.match(personal, /Promise\.all\(chunks\.map/);
assert.match(reserve, /Math\.min\(2, dates\.length\)/);
assert.doesNotMatch(reserve, /Promise\.all\(dates\.map\(fetchSlots\)\)/);
assert.doesNotMatch(personalHtml, /personal-trainer-confirm\.js/);
assert.match(personalHtml, /script\.google\.com/);
assert.match(mainGas, /case "getAvailableSlotsRange"/);
assert.match(policyGas, /function getAvailableSlotsRange\(params\)/);

[personal, reserve, gender].forEach((source) => {
  assert.doesNotMatch(source, /\?\.|\?\?/);
});

console.log("personal mobile policy tests passed");
