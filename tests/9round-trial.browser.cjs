const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.ROUND9_PLAYWRIGHT_MODULE || "playwright");
const { fixture, payload } = require("./helpers/9round-trial-fixture.cjs");
const root = path.resolve(__dirname, "..");
const evidence = process.env.ROUND9_BROWSER_EVIDENCE || "/tmp/9round-trial-evidence";
fs.mkdirSync(evidence, { recursive: true });
const e = fixture(), actions = [];
let origin, createGate, cancelGate;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/__trial_api" && req.method === "POST") {
    let text = ""; req.on("data", part => { text += part; }); req.on("end", async () => {
      const body = JSON.parse(text); actions.push(body.action);
      if (body.action === "create9RoundTrialBooking" && createGate) await createGate;
      if (body.action === "cancel9RoundTrialBooking" && cancelGate) await cancelGate;
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(e.call(body.action, body)));
    }); return;
  }
  let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const types = { ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".css": "text/css;charset=utf-8", ".png": "image/png" };
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "text/plain" }); res.end(fs.readFileSync(file));
});

async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROUND9_CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const errors = [];
  async function page(width, connected = true) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", serviceWorkers: "block" });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-10-17T00:00:00Z") });
    await page.route("**/*", async route => {
      const url = route.request().url();
      if (/\/9round-booking\/config\.js$/.test(url)) return route.fulfill({ contentType: "text/javascript", body: "window.ANAUTS_ROUND9_BOOKING=" + JSON.stringify({ apiUrl: connected ? origin + "/__trial_api" : "", firebaseApiKey: "test-key", requestTimeoutMs: 15000 }) });
      if (url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ idToken: "staff", refreshToken: "test-only", expiresIn: "3600" }) });
      if (!url.startsWith(origin)) return route.abort();
      return route.continue();
    });
    return page;
  }
  async function noOverflow(page, label) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, label); }
  async function closeFeedback(page) { await page.locator('#feedback[data-state="success"]').waitFor({ state: "visible" }); await page.locator("#feedbackClose").click(); }
  try {
    const disabled = await page(390, false); await disabled.goto(origin + "/9round-booking/trial/");
    await disabled.locator("#notice").getByText("現在、予約受付の準備中です。", { exact: true }).waitFor();
    assert.equal(actions.length, 0); await noOverflow(disabled, "disconnected mobile"); await disabled.context().close();

    const desktop = await page(1320); await desktop.goto(origin + "/9round-booking/trial/");
    await desktop.locator("#slots .slot-button").first().waitFor();
    assert.equal(await desktop.locator("#selectedDateLabel").textContent(), "10月18日（日） の体験枠");
    await desktop.locator("#slots .slot-button").first().click();
    await noOverflow(desktop, "desktop trial");
    await desktop.screenshot({ path: path.join(evidence, "trial-desktop.png"), fullPage: true });
    await desktop.locator("#partySize").selectOption("2"); await desktop.locator("#name").fill("体験 太郎");
    await desktop.locator("#companionName").fill("体験 花子"); await desktop.locator("#email").fill("trial0@example.invalid");
    await desktop.locator("#phone").fill("09012345678"); await desktop.locator("#consent").check(); await desktop.locator("#sendCode").click();
    await desktop.locator("#verificationForm").waitFor({ state: "visible" });
    await desktop.locator("#code").fill(e.sent.at(-1).body.match(/は (\d{6})/)[1]);
    let releaseCreate; createGate = new Promise(resolve => { releaseCreate = resolve; });
    await desktop.locator("#confirmBooking").click();
    await desktop.locator('#feedback[data-state="pending"]').waitFor({ state: "visible" });
    await desktop.locator("#confirmBooking").dispatchEvent("click"); await desktop.keyboard.press("Escape");
    assert.equal(await desktop.locator("#feedback").isVisible(), true);
    releaseCreate(); createGate = null; await closeFeedback(desktop);
    assert.equal(actions.filter(a => a === "create9RoundTrialBooking").length, 1);
    assert.match(await desktop.locator("#resultDetails").textContent(), /2名/);
    assert.equal(await desktop.evaluate(() => Object.keys(localStorage).length + Object.keys(sessionStorage).length), 0);
    const confirmation = e.sent.find(mail => /無料体験.*予約確認/.test(mail.subject));
    const link = confirmation.body.match(/https:\/\/[^\s]+#application_id=[^\s]+/)[0];
    const codeMails = actions.filter(a => a === "request9RoundTrialCode").length;
    await desktop.goto(origin + "/9round-booking/trial/" + new URL(link).hash);
    await desktop.locator("#resultPanel").waitFor({ state: "visible" });
    assert.equal(await desktop.evaluate(() => location.hash), "");
    assert.equal(actions.filter(a => a === "request9RoundTrialCode").length, codeMails);
    await desktop.locator("#changeBooking").click(); await desktop.locator("#changeSlots .slot-button").first().click(); await closeFeedback(desktop);
    assert.match(await desktop.locator("#resultDetails").textContent(), /11:00/);
    let releaseCancel; cancelGate = new Promise(resolve => { releaseCancel = resolve; });
    await desktop.locator("#cancelBooking").click(); await desktop.locator('#feedback[data-state="pending"]').waitFor({ state: "visible" });
    assert.equal(await desktop.locator("#feedbackTitle").textContent(), "キャンセルしています。");
    await desktop.locator("#cancelBooking").dispatchEvent("click");
    releaseCancel(); cancelGate = null; await closeFeedback(desktop);
    assert.equal(actions.filter(a => a === "cancel9RoundTrialBooking").length, 1);
    assert.equal(await desktop.locator("#resultTitle").textContent(), "キャンセルが完了しました");

    for (const width of [320, 390, 768]) {
      const mobile = await page(width); await mobile.goto(origin + "/9round-booking/trial/");
      await mobile.locator("#slots .slot-button").first().waitFor(); await mobile.locator("#slots .slot-button").first().click();
      await noOverflow(mobile, "trial width " + width);
      if (width === 390) {
        await mobile.screenshot({ path: path.join(evidence, "trial-mobile.png"), fullPage: true });
        await mobile.locator("#nextWeek").click(); await mobile.locator('[data-date="2026-10-24"]').click();
        assert.equal(await mobile.locator("#slots .slot-button").count(), 1);
        assert.match(await mobile.locator("#slots .slot-button").textContent(), /13:15/);
      }
      await mobile.context().close();
    }

    const preview = e.call("create9RoundTrialBooking", payload(e.loginTrial(1), { party_size: 2, companion_name: "体験 花子" }));
    assert.equal(preview.ok, true);
    const staff = await page(1100); await staff.goto(origin + "/9round-booking/staff/");
    await staff.locator("#staffEmail").fill("staff@example.invalid"); await staff.locator("#staffPassword").fill("test-only");
    await staff.locator("#staffLoginForm").evaluate(form => form.requestSubmit());
    await staff.locator("#nrAdminDate").waitFor(); await staff.locator("#nrAdminDate").fill("2026-10-18"); await staff.locator("#nrAdminDate").dispatchEvent("change");
    const card = staff.locator('.nr-slot.is-trial[data-slot-id="TRIAL:2026-10-18:10:15"]');
    await card.getByText("体験 太郎 様", { exact: true }).waitFor();
    assert.equal(await card.locator(".nr-count").textContent(), "2 / 2名");
    await noOverflow(staff, "staff trial schedule");
    await card.screenshot({ path: path.join(evidence, "trial-staff-slot.png") });
    await card.getByRole("button", { name: "キャンセル", exact: true }).click();
    await staff.locator(".nr-trial-dialog").getByText("キャンセルが完了しました。", { exact: true }).waitFor();
    assert.equal(e.call("get9RoundManagedTrialBooking", { application_id: preview.data.application_id, id_token: "staff" }).data.status, "CANCELLED");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, serverActions: actions.length, widths: [320, 390, 768, 1100, 1320], screenshots: ["trial-desktop.png", "trial-mobile.png", "trial-staff-slot.png"] }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
