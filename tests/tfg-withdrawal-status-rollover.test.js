const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "gas", "88_TfgWithdrawalStatusRollover.gs"),
  "utf8"
);

assert.match(source, /withdrawalDate >= today/);
assert.match(source, /setValue\(""\)/);
assert.match(source, /REFLECTED_HEADER:\s*"マスター反映"/);
assert.match(source, /"処理済 " \+ reflectedAt/);
assert.match(source, /CANCELLED:\s*\["取消", "却下", "キャンセル"/);
assert.match(source, /memberNo/);
assert.match(source, /status/);
assert.match(source, /atHour\(0\)/);
assert.match(source, /nearMinute\(10\)/);
assert.doesNotMatch(source, /setValues\(\[masterValues\]\)/);

const context = {
  console,
  Date,
  Object,
  String,
  Number,
  isNaN,
  Utilities: {
    formatDate() { return "2026-10-01"; }
  }
};
vm.createContext(context);
vm.runInContext(source, context);

assert.equal(context.normalizeTfgWithdrawalMemberNo_("FRG160828"), "160828");
assert.equal(context.normalizeTfgWithdrawalMemberNo_("160828"), "160828");
assert.equal(context.normalizeTfgWithdrawalMemberNo_("12345"), "");

assert.equal(context.normalizeTfgWithdrawalDate_("2026-09-30"), "2026-09-30");
assert.equal(context.normalizeTfgWithdrawalDate_("2026/9/30"), "2026-09-30");
assert.equal(context.normalizeTfgWithdrawalDate_("2026年9月30日"), "2026-09-30");
assert.equal(context.normalizeTfgWithdrawalDate_("2026-02-30"), "");

assert.equal(context.isTfgWithdrawalCancelled_("取消"), true);
assert.equal(context.isTfgWithdrawalCancelled_("canceled"), true);
assert.equal(context.isTfgWithdrawalCancelled_("受付"), false);

const map = context.tfgWithdrawalHeaderMap_(["会員番号", "退会期日", "ステータス", "マスター反映"]);
assert.equal(context.tfgWithdrawalHeader_(map, ["会員番号", "memberNo"], true), 0);
assert.equal(context.tfgWithdrawalHeader_(map, ["退会期日"], true), 1);
assert.equal(context.tfgWithdrawalHeader_(map, ["マスター反映"], false), 3);

console.log("TFG withdrawal status rollover tests passed");
