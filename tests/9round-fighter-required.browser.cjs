const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.ROUND9_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const evidence = process.env.ROUND9_BROWSER_EVIDENCE || "/tmp/9round-fighter-required";
fs.mkdirSync(evidence, { recursive: true });
const testFile = path.join(root, "tests/9round-booking.test.js");
const harness = fs.readFileSync(testFile, "utf8").split('const day = "2026-10-18";')[0];
const helper = { exports: {} };
new Function("require", "__dirname", "module", "exports", harness + "\nmodule.exports = {environment};")(
  require, path.dirname(testFile), helper, helper.exports);
const e = helper.exports.environment();
const unregisteredToken = e.login(0, false), registeredToken = e.login(1), actions = [];
let profileGate = null, saveGate = null, profileFailure = null;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/__booking_api" && req.method === "POST") {
    let text = ""; req.on("data", part => { text += part; });
    req.on("end", async () => {
      const body = JSON.parse(text); actions.push(body.action);
      if (body.action === "get9RoundFighterProfile" && profileGate) await profileGate;
      if (body.action === "save9RoundFighterProfile" && saveGate) await saveGate;
      const failure = body.action === "get9RoundFighterProfile" && profileFailure;
      if (failure) profileFailure = null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(failure || e.call(body.action, body)));
    });
    return;
  }
  let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const type = { ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".css": "text/css;charset=utf-8" }[path.extname(file)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type }); res.end(fs.readFileSync(file));
});
async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROUND9_CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const errors = [];
  async function member(token) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", serviceWorkers: "block" });
    const page = await ctx.newPage(); page.setDefaultTimeout(10000);
    await page.clock.install({ time: new Date("2026-10-17T00:00:00Z") });
    await page.addInitScript(value => sessionStorage.setItem("nr_booking_session_v1", value), token);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = route.request().url();
      if (/\/9round-booking\/config\.js(?:\?|$)/.test(url)) return route.fulfill({ contentType: "text/javascript", body:
        "window.ANAUTS_ROUND9_BOOKING={apiUrl:" + JSON.stringify(origin + "/__booking_api") + ",requestTimeoutMs:10000};" });
      if (!url.startsWith(origin)) return route.abort();
      return route.continue();
    });
    await page.goto(origin + "/9round-booking/");
    await page.locator(".slot-card").nth(10).waitFor();
    await page.locator('#bookingPanel[aria-busy="false"]').waitFor();
    return { page, ctx };
  }
  try {
    let releaseProfile;
    profileGate = new Promise(resolve => { releaseProfile = resolve; });
    const first = await member(unregisteredToken), page = first.page;
    assert.equal(await page.locator(".slot-button:enabled").count(), 0, "profile lookup must complete before new reservations are enabled");
    releaseProfile(); profileGate = null;
    await page.locator("#fighterStatus").getByText(/入力して保存/).waitFor();
    assert.match(await page.locator("#fighterSummary").textContent(), /必須/);
    assert.equal(await page.locator("#fighterName").getAttribute("required"), "");
    const savesBefore = actions.filter(a => a === "save9RoundFighterProfile").length;
    await page.locator("#fighterSave").click();
    await page.locator("#fighterName").fill("　 ");
    await page.locator("#fighterSave").click();
    await page.locator("#fighterStatus").getByText("ファイターネームを入力してください。", { exact: true }).waitFor();
    assert.equal(actions.filter(a => a === "save9RoundFighterProfile").length, savesBefore);
    assert.equal(await page.locator(".slot-button:enabled").count(), 0);
    await page.screenshot({ path: path.join(evidence, "fighter-required.png"), fullPage: true });
    let releaseSave;
    saveGate = new Promise(resolve => { releaseSave = resolve; });
    await page.locator("#fighterName").fill("ソガの虎");
    await page.locator("#fighterSave").click();
    await page.locator("#fighterStatus").getByText("保存しています…", { exact: true }).waitFor();
    assert.equal(await page.locator(".slot-button:enabled").count(), 0, "typing a name does not unlock reservations before it is saved");
    releaseSave(); saveGate = null;
    await page.getByText("ソガの虎さん、", { exact: true }).waitFor();
    assert.ok(await page.locator(".slot-button:enabled").count() > 0);
    await page.locator(".slot-button:enabled").first().click();
    await page.locator("#bookingFeedbackTitle").getByText("予約が完了しました", { exact: true }).waitFor();
    await page.locator("#bookingFeedbackClose").click();
    await page.locator('#bookingPanel[aria-busy="false"]').waitFor();
    assert.equal(actions.filter(a => a === "create9RoundWorkoutBooking").length, 1);
    await page.screenshot({ path: path.join(evidence, "fighter-registered.png"), fullPage: true });
    await page.setViewportSize({ width: 320, height: 780 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await first.ctx.close();

    // Existing reservations remain cancellable if a legacy member has no profile.
    const fighters = e.data.sheets.get("nr_fighters");
    fighters.rows = fighters.rows.filter((row, index) => index === 0 || row[0] !== "1000000");
    const legacy = await member(unregisteredToken);
    await legacy.page.locator("#fighterStatus").getByText(/入力して保存/).waitFor();
    assert.equal(await legacy.page.locator(".slot-button:enabled").count(), 0);
    await legacy.page.locator("#slotList [data-cancel]").click();
    await legacy.page.locator("#bookingFeedbackTitle").getByText("キャンセルが完了しました", { exact: true }).waitFor();
    await legacy.ctx.close();

    profileFailure = { ok: false, code: "PROFILE_UNAVAILABLE", message: "プロフィールを取得できませんでした。" };
    const returning = await member(registeredToken);
    await returning.page.locator("#fighterStatus").getByText(/登録情報を確認できませんでした/).waitFor();
    assert.equal(await returning.page.locator(".slot-button:enabled").count(), 0);
    await returning.page.locator("#reload").click();
    await returning.page.getByText("FIGHTER 1さん、", { exact: true }).waitFor();
    await returning.page.locator('#bookingPanel[aria-busy="false"]').waitFor();
    assert.ok(await returning.page.locator(".slot-button:enabled").count() > 0, "registered members do not have to register again");
    await returning.page.locator("#logout").click();
    assert.equal(await returning.page.locator("#fighterGreeting").textContent(), "");
    assert.equal(await returning.page.locator("#fighterName").inputValue(), "");
    await returning.ctx.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "passed", checks: ["profile lookup gates new reservations", "required and whitespace validation", "saving must finish before booking", "saved profile unlocks a successful reservation", "legacy reservations stay cancellable", "failed profile lookup stays blocked and supports retry", "registered members and logout identity isolation", "320px layout and no browser exceptions"], apiCalls: actions.length }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
