const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const reserve = fs.readFileSync(
  path.join(root, "assets", "js", "reserve.js"),
  "utf8"
);
const rangeGas = fs.readFileSync(
  path.join(root, "gas", "59_YoshimaruGender.gs"),
  "utf8"
);
const storeAwareGas = fs.readFileSync(
  path.join(root, "gas", "60_StoreAwareAssignment.gs"),
  "utf8"
);

new Function(reserve);

assert.match(
  reserve,
  /action", "getAvailableSlotsRange"/,
  "固定サービスも7日分一括APIを呼び出す"
);
assert.match(
  reserve,
  /results = await fetchWeekSlotsRange_\(dates\)/,
  "専用トレーナー取得がない画面では共通の一括取得を使う"
);
assert.match(
  reserve,
  /sessionStorage\.getItem\(SERVICES_SESSION_CACHE_KEY\)/,
  "サービス一覧は同一タブ内で5分間再利用する"
);
assert.match(
  rangeGas,
  /AVAILABLE_SLOTS_RANGE_CACHE_SECONDS_ = 30/,
  "週次空き枠結果は30秒だけ再利用する"
);
assert.match(
  rangeGas,
  /!staffCode && \/\^PT/,
  "担当者必須はパーソナルだけに限定する"
);
assert.match(storeAwareGas, /STORE_AWARE_STATIC_CACHE_SECONDS_ = 300/);
assert.match(storeAwareGas, /STORE_AWARE_DYNAMIC_CACHE_SECONDS_ = 20/);
assert.match(storeAwareGas, /if \(!allowCache\) return buildStoreAwareSnapshot_\(\)/);

const pages = [
  "tour",
  "counsel",
  "procedure",
  "meal-planning",
  "training-support",
  "unsubscribe",
  "personal",
  "trial"
];

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page, "index.html"), "utf8");
  assert.match(
    html,
    /reserve\.js\?v=20260902-range1/,
    `${page} は高速化後の reserve.js を読み込む`
  );
}

console.log("reservation range/cache tests passed");
