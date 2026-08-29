const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "gas", "70_TourSameDayEnrollment.gs"),
  "utf8"
);

// 初回決済日は作成日（＝入会日）の翌日で計算する。
assert.match(
  source,
  /const paymentDateText = Utilities\.formatDate\([\s\S]*created\.getDate\(\) \+ 1/
);

// 26日以降の分岐でも、スタート日翌日へ上書きしてはいけない。
assert.match(source, /const nextDayText = label\.paymentDateText;/);
assert.doesNotMatch(
  source,
  /new Date\(startYear, startMonth, start\.getDate\(\) \+ 1\)/
);

// 帳票の説明文も「入会日翌日」のまま維持する。
assert.match(source, /初回決済分は入会日翌日/);

console.log("tour enrollment payment date regression test passed");
