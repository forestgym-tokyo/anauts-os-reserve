const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("admin pages load the restored daily report without changing other addons", () => {
  const config = read("admin/firebase-config.js");
  const expectedAddons = [
    "./admin-monthly-v58.js?v=20260830-soga-calendar-v1",
    "./admin-tour-enrollment.js?v=20260828-master-draft-v1",
    "./admin-tour-ui-polish.js?v=20260828-event-driven-v1",
    "./admin-auto-reassign-enforce.js?v=20260828-lightweight-v1",
    "./admin-daily-report.js?v=20260830-daily-cleaning-v3"
  ];

  expectedAddons.forEach((source) => assert.ok(config.includes(source)));

  ["admin/index.html", "admin/admin.html"].forEach((relativePath) => {
    assert.match(
      read(relativePath),
      /\.\/firebase-config\.js\?v=20260830-soga-calendar-v1/
    );
  });
});

test("restored daily report contains the existing report sections", () => {
  const dailyReport = read("admin/admin-daily-report.js");
  assert.equal((dailyReport.match(/\{item:/g) || []).length, 20);
  assert.doesNotMatch(dailyReport, /②/);
  assert.doesNotMatch(dailyReport, /dr-clean-area-number/);
  assert.match(dailyReport, /<h3>■\$\{esc\(area\.name\)\}<\/h3>/);
  assert.match(dailyReport, /\.dr-clean-area-head h3\{margin:0;color:#79dc8c/);
  assert.match(dailyReport, /#dailyReportView \.page-heading h1,\.dr-section-head h2\{color:#151716\}/);
  assert.match(dailyReport, /\.dr-inquiry-grid \.dr-field\{min-width:0\}/);
  assert.match(dailyReport, /input\[data-i="time"\]\{width:110px;max-width:100%;min-width:0\}/);
  assert.match(dailyReport, /area:CLEANING_ITEMS\[i\]\?\.area/);
  assert.match(dailyReport, /instruction:CLEANING_ITEMS\[i\]\?\.instruction/);
  [
    "清掃チェック",
    "有酸素エリア",
    "トレッドミル・本体ベルト",
    "バイク・クロストレーナー",
    "マシンエリア",
    "フリーウエイトエリア",
    "ストレッチエリア",
    "シャワー・更衣室",
    "ドライヤー",
    "トイレ",
    "その他",
    "アルコールの補充",
    "タオル交換",
    "尿汚れは、トイレ洗剤とペーパータオルで拭き取る。",
    "問い合わせ・対応",
    "設備・施設異常",
    "クレーム・事故・トラブル",
    "引継ぎ事項"
  ].forEach((label) => assert.match(dailyReport, new RegExp(label)));
});
