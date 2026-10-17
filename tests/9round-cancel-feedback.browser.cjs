const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.ROUND9_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const evidence = process.env.ROUND9_BROWSER_EVIDENCE || "/tmp/nine-round-cancel-feedback";
fs.mkdirSync(evidence, { recursive: true });
// Reuse the isolated in-memory GAS environment. No real members, data or emails.
const testFile = path.join(root, "tests/9round-booking.test.js");
const harness = fs.readFileSync(testFile, "utf8").split('const day = "2026-10-18";')[0];
const helper = { exports: {} };
new Function("require", "__dirname", "module", "exports", harness + "\nmodule.exports = {environment};")(
  require, path.dirname(testFile), helper, helper.exports);
const e = helper.exports.environment();
const token = e.login(0), day = "2026-10-18", later = "2026-10-19";
function reserve(date, time) {
  const result = e.call("create9RoundWorkoutBooking", { session_token: token, date, slot_id: "DAILY:" + date + ":" + time });
  assert.equal(result.ok, true);
  return result.data.booking_id;
}
const bookingId = reserve(day, "10:15");
const laterId = reserve(later, "16:15");
let cancelGate = null, cancelFailure = null;
const actions = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/__booking_api" && req.method === "POST") {
    let text = "";
    req.on("data", chunk => { text += chunk; });
    req.on("end", async () => {
      const body = JSON.parse(text); actions.push(body.action);
      const cancelling = body.action === "cancel9RoundWorkoutBooking";
      if (cancelling && cancelGate) await cancelGate;
      const failure = cancelling && cancelFailure;
      if (failure) cancelFailure = null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(failure || e.call(body.action, body)));
    });
    return;
  }
  let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": { ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".css": "text/css;charset=utf-8" }[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROUND9_CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", serviceWorkers: "block" });
    const page = await ctx.newPage(), errors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => { errors.push("Unexpected confirmation: " + dialog.message()); dialog.dismiss(); });
    await page.clock.install({ time: new Date("2026-10-17T00:00:00Z") });
    await page.addInitScript(value => sessionStorage.setItem("nr_booking_session_v1", value), token);
    await page.route("**/*", async route => {
      const url = route.request().url();
      if (url === origin + "/9round-booking/config.js") return route.fulfill({ contentType: "text/javascript", body:
        "window.ANAUTS_ROUND9_BOOKING={apiUrl:" + JSON.stringify(origin + "/__booking_api") + ",requestTimeoutMs:10000};" });
      if (!url.startsWith(origin)) return route.abort();
      return route.continue();
    });
    await page.goto(origin + "/9round-booking/");
    await page.locator('#bookingPanel[aria-busy="false"]').waitFor();
    await page.locator("#bookingDate").fill(day);
    await page.locator("#bookingDate").dispatchEvent("change");
    const cancel = page.locator('[data-cancel="' + bookingId + '"]');
    await cancel.waitFor();
    assert.equal(await cancel.textContent(), "タップしてキャンセル →");
    await page.locator("#fighterPanel summary").click();
    await cancel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(evidence, "cancel-button-mobile.png") });
    async function dismiss(state) {
      await page.locator('#bookingFeedback[data-state="' + state + '"]').waitFor({ state: "visible" });
      await page.locator("#bookingFeedbackClose").click();
      await page.locator('#bookingPanel[aria-busy="false"]').waitFor();
    }
    // Rejections and uncertain responses must never display a completed cancel.
    for (const failure of [
      { ok: false, code: "DEADLINE_PASSED", message: "変更・取消の締切を過ぎています。" },
      { ok: false, message: "通信結果を確認できませんでした。" }
    ]) {
      cancelFailure = failure;
      await cancel.click();
      await page.locator('#bookingFeedback[data-state="error"]').waitFor({ state: "visible" });
      assert.equal(await page.locator("#bookingFeedbackTitle").textContent(), failure.code ? "キャンセルを完了できませんでした" : "キャンセル結果を確認できませんでした");
      if (!failure.code) assert.match(await page.locator("#bookingFeedbackNote").textContent(), /予約一覧・確認メールで結果をご確認/);
      assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).data.slots[0].is_booked, true);
      await dismiss("error");
    }
    // Delay the real isolated cancellation and try repeated taps / Escape.
    let release;
    cancelGate = new Promise(resolve => { release = resolve; });
    const before = actions.filter(action => action === "cancel9RoundWorkoutBooking").length;
    await cancel.click();
    await page.locator('#bookingFeedback[data-state="pending"]').waitFor({ state: "visible" });
    assert.equal(await page.locator("#bookingFeedbackTitle").textContent(), "キャンセルしています。");
    assert.match(await page.locator("#bookingFeedbackWhen").textContent(), /10月18日.*\n10:15 開始/);
    assert.equal(await cancel.textContent(), "キャンセルしています。");
    assert.equal(await cancel.isDisabled(), true);
    assert.equal(await page.locator(".slot-button:not(:disabled),[data-member-action]:not(:disabled)").count(), 0);
    assert.equal(await page.locator("#bookingFeedbackClose").isVisible(), false);
    await cancel.dispatchEvent("click"); await cancel.dispatchEvent("click");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#bookingFeedback").isVisible(), true);
    assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).data.slots[0].is_booked, true);
    await page.screenshot({ path: path.join(evidence, "cancel-pending-mobile.png") });
    await page.setViewportSize({ width: 320, height: 780 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await page.locator("#bookingFeedback").evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.setViewportSize({ width: 390, height: 844 });
    release(); cancelGate = null;
    await page.locator('#bookingFeedback[data-state="success"]').waitFor({ state: "visible" });
    assert.equal(await page.locator("#bookingFeedbackTitle").textContent(), "キャンセルが完了しました");
    assert.equal(await page.locator("#bookingFeedbackIcon").textContent(), "✓");
    assert.match(await page.locator("#bookingFeedbackNote").textContent(), /キャンセル確認メールをお送りしました/);
    assert.equal(actions.filter(action => action === "cancel9RoundWorkoutBooking").length, before + 1);
    await cancel.waitFor({ state: "detached" });
    assert.equal(e.call("get9RoundWorkoutSlots", { session_token: token, date: day }).data.slots[0].is_booked, false);
    await page.screenshot({ path: path.join(evidence, "cancel-success-mobile.png") });
    await dismiss("success");
    // Cancel from the booking list while viewing another day; show its real date.
    await page.locator("#myBookingsPanel summary").click();
    e.mailFailure(true);
    await page.locator('[data-own-booking="' + laterId + '"] [data-member-action="cancel"]').click();
    await page.locator('#bookingFeedback[data-state="success"]').waitFor({ state: "visible" });
    assert.match(await page.locator("#bookingFeedbackWhen").textContent(), /10月19日.*\n16:15 開始/);
    assert.match(await page.locator("#bookingFeedbackNote").textContent(), /キャンセルは完了しています。\n確認メールは送信待ちです。/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "passed", checks: ["tap-to-cancel label", "one tap without a confirmation popup", "pending modal blocks duplicate submissions and Escape", "only server success displays completion", "failure and uncertain-result feedback", "capacity released", "correct date from booking list", "notification pending remains a successful cancel", "320px mobile layout", "no browser exceptions"], apiCalls: actions.length }));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
