const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("admin pages load the restored daily report without changing other addons", () => {
  const config = read("admin/firebase-config.js");
  const expectedAddons = [
    "./admin-monthly-v58.js?v=20260829-admin-direct-v3",
    "./admin-tour-enrollment.js?v=20260828-master-draft-v1",
    "./admin-tour-ui-polish.js?v=20260828-event-driven-v1",
    "./admin-auto-reassign-enforce.js?v=20260828-lightweight-v1",
    "./admin-daily-report.js?v=20260830-daily-report-restore-v1"
  ];

  expectedAddons.forEach((source) => assert.ok(config.includes(source)));

  ["admin/index.html", "admin/admin.html"].forEach((relativePath) => {
    assert.match(
      read(relativePath),
      /\.\/firebase-config\.js\?v=20260830-daily-report-restore-v1/
    );
  });
});

test("restored daily report contains the existing report sections", () => {
  const dailyReport = read("admin/admin-daily-report.js");
  [
    "清掃チェック",
    "問い合わせ・対応",
    "設備・施設異常",
    "クレーム・事故・トラブル",
    "引継ぎ事項"
  ].forEach((label) => assert.match(dailyReport, new RegExp(label)));
});
