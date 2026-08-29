const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const main = fs.readFileSync(
  path.join(__dirname, "..", "gas", "99_Main.gs"),
  "utf8"
);

const source = main.match(
  /function generateTourQuestionnairePdfCompatible_\(params\) \{[\s\S]*?\n\}/
)[0];

function run(context) {
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.generateTourQuestionnairePdfCompatible_({ reservation_id: "R1" });
}

const fastCalls = [];
const fastResult = run({
  generateTourQuestionnairePdfFast(params) {
    fastCalls.push(params);
    return "FAST";
  },
  generateTourQuestionnairePdf() {
    throw new Error("legacy generator must not run when fast generator exists");
  }
});

assert.equal(fastResult, "FAST");
assert.deepEqual(fastCalls, [{ reservation_id: "R1" }]);

const legacyCalls = [];
const legacyResult = run({
  generateTourQuestionnairePdf(params) {
    legacyCalls.push(params);
    return "LEGACY";
  }
});

assert.equal(legacyResult, "LEGACY");
assert.deepEqual(legacyCalls, [{ reservation_id: "R1" }]);

console.log("tour questionnaire compatible route tests passed");
