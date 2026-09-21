const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "reserve.js"),
  "utf8"
);
const start = source.indexOf("async function fetchWeekSlotsRange_");
const end = source.indexOf("async function fetchSlotsWithLimit_", start);
assert.ok(start >= 0 && end > start, "週次取得と再試行関数を抽出できる");
const retrySource = source.slice(start, end);
const dates = Array.from({ length: 7 }, (_, index) =>
  `2026-09-${String(21 + index).padStart(2, "0")}`
);

function successResponse() {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        data: {
          results: dates.map((date) => ({
            ok: true,
            data: { date, slots: [] }
          }))
        }
      };
    }
  };
}

function createContext(fetchImpl) {
  const context = {
    URL,
    Date,
    Error,
    Number,
    String,
    Math,
    Promise,
    AbortController,
    fetch: fetchImpl,
    setTimeout() { return 1; },
    clearTimeout() {},
    window: {
      setTimeout(callback) {
        callback();
        return 1;
      }
    },
    el: { weekStatus: { textContent: "" } }
  };

  vm.createContext(context);
  vm.runInContext(
    `
      const API_URL = "https://example.test/exec";
      const TOUR_RANGE_TIMEOUT_MS = 45000;
      const TOUR_RANGE_MAX_ATTEMPTS = 3;
      const TOUR_RANGE_RETRY_DELAY_MS = 1200;
      const selectedService = { service_code: "TOUR" };
      function getConsultationMethod_() { return ""; }
      ${retrySource}
      this.runRange = fetchWeekSlotsRange_;
    `,
    context
  );
  return context;
}

(async () => {
  let calls = 0;
  const recovered = createContext(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("Failed to fetch");
    return successResponse();
  });
  const results = await recovered.runRange(dates);
  assert.equal(calls, 2, "一時的な通信失敗後に週次APIを再試行する");
  assert.equal(results.length, 7);
  assert.match(recovered.el.weekStatus.textContent, /再確認しています/);

  calls = 0;
  const timeoutRecovered = createContext(async () => {
    calls += 1;
    if (calls === 1) {
      const timeoutError = new Error("The operation was aborted");
      timeoutError.name = "AbortError";
      throw timeoutError;
    }
    return successResponse();
  });
  const timeoutResults = await timeoutRecovered.runRange(dates);
  assert.equal(calls, 2, "初回タイムアウト後は1回だけ自動再取得する");
  assert.equal(timeoutResults.length, 7);

  calls = 0;
  const failed = createContext(async () => {
    calls += 1;
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    failed.runRange(dates),
    /通信が一時的に不安定です。少し待ってから「空き状況を更新」を押してください。/
  );
  assert.equal(calls, 3, "通信失敗でも週次APIは最大3回に抑える");

  console.log("tour fetch retry tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
