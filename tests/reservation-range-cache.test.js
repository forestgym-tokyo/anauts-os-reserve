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
  /const TOUR_RANGE_TIMEOUT_MS = 45000/,
  "店内見学の一括取得は45秒で打ち切る"
);
assert.match(
  reserve,
  /if \(isTour\) \{\s*throw new Error/,
  "店内見学の一括取得失敗時は日別APIを連続起動しない"
);
assert.match(
  reserve,
  /const workerCount = isTour \|\| typeof window\.ANAUTS_FETCH_WEEK_SLOTS === "function"\s*\? Math\.min\(2, dates\.length\)/,
  "店内見学の日別フォールバックが必要でも同時実行は2本までにする"
);
assert.match(
  reserve,
  /sessionStorage\.getItem\(SERVICES_SESSION_CACHE_KEY\)/,
  "サービス一覧は同一タブ内で5分間再利用する"
);
assert.match(
  reserve,
  /tour:\s*\{[\s\S]*?serviceCode:\s*"TOUR"[\s\S]*?embeddedService:\s*\{[\s\S]*?service_code:\s*"TOUR"[\s\S]*?form_type:\s*"VISITOR"/,
  "店内見学は必要なサービス情報を画面側に持つ"
);
assert.match(
  reserve,
  /selectedService = getEmbeddedRouteService_\(route\);\s*if \(!selectedService\) \{\s*services = await fetchServices\(\);\s*\}/,
  "固定情報を持つ店内見学では全サービス一覧を取得しない"
);
assert.match(
  reserve,
  /if \(!selectedService\) \{\s*selectedService = services\.find/,
  "店内見学以外の固定サービスは従来どおりサービス一覧を使う"
);
assert.match(
  rangeGas,
  /AVAILABLE_SLOTS_RANGE_CACHE_SECONDS_ = 120/,
  "週次空き枠結果は世代管理付きで120秒再利用する"
);
assert.match(
  rangeGas,
  /typeof getStoreAwareCacheGeneration_ === "function"/,
  "予約・シフト更新後は古い週次キャッシュを参照しない"
);
assert.match(
  rangeGas,
  /!staffCode && \/\^PT/,
  "担当者必須はパーソナルだけに限定する"
);
assert.match(storeAwareGas, /STORE_AWARE_STATIC_CACHE_SECONDS_ = 300/);
assert.match(storeAwareGas, /STORE_AWARE_DYNAMIC_CACHE_SECONDS_ = 300/);
assert.match(storeAwareGas, /STORE_AWARE_DYNAMIC_CACHE_PREFIX_ = "store-aware-dynamic-v3"/);
assert.match(
  storeAwareGas,
  /buildStoreAwareDynamicCacheKey_\(generation, storeCode, date\)/,
  "動的データは店舗・日付単位で分割する"
);
assert.match(
  storeAwareGas,
  /return buildStoreAwareSnapshot_\(\);/,
  "分割キャッシュ失敗時は従来の全件取得へ戻す"
);
assert.match(
  reserve,
  /el\.prevWeekButton\.disabled = weekStart <= today;/,
  "読込中でも前週ボタンを操作できる"
);
assert.match(
  reserve,
  /el\.nextWeekButton\.disabled = next > max;/,
  "読込中でも次週ボタンを操作できる"
);
assert.match(
  reserve,
  /el\.reloadButton\.disabled = loading;/,
  "同一週の再読込だけは重複実行しない"
);
assert.match(
  reserve,
  /renderLoadingWeek_\(\);[\s\S]*選択した週の空き時間を確認しています/,
  "次週を押した直後に選択週の読込表示へ切り替える"
);

const unchangedPages = [
  "counsel",
  "procedure",
  "meal-planning",
  "training-support",
  "unsubscribe",
  "personal",
  "trial"
];

const tourHtml = fs.readFileSync(path.join(root, "tour", "index.html"), "utf8");
assert.match(
  tourHtml,
  /reserve\.js\?v=20260906-tour-queue2/,
  "店内見学は同時実行抑止後の reserve.js を読み込む"
);

for (const page of unchangedPages) {
  const html = fs.readFileSync(path.join(root, page, "index.html"), "utf8");
  assert.match(
    html,
    /reserve\.js\?v=20260902-range2/,
    `${page} の読込バージョンは変更しない`
  );
}

console.log("reservation range/cache tests passed");
