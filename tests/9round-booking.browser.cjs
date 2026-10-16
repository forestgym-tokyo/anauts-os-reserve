const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.ROUND9_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const evidence = process.env.ROUND9_BROWSER_EVIDENCE || "/tmp/nine-round-browser-evidence";
fs.mkdirSync(evidence, { recursive: true });
const testFile = path.join(root, "tests/9round-booking.test.js");
const harness = fs.readFileSync(testFile, "utf8").split('const day = "2026-10-18";')[0];
const helperModule = { exports: {} };
new Function("require", "__dirname", "module", "exports", harness + "\nmodule.exports = {environment};")(require, path.dirname(testFile), helperModule, helperModule.exports);
const e = helperModule.exports.environment({ realStaffAuth: true });
const day = "2026-10-18", firstSlot = "DAILY:" + day + ":10:15", secondSlot = "DAILY:" + day + ":11:00", blockedSlot = "DAILY:" + day + ":11:45";
const actions = [];
for (let i = 1; i <= 4; i++) {
  const token = e.login(i);
  assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date: day, slot_id: secondSlot }).ok, true);
  if (i <= 2) assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date: day, slot_id: firstSlot }).ok, true);
}
assert.equal(e.call("set9RoundWorkoutBlock", { id_token: "admin", date: day, slot_id: blockedSlot, blocked: true }).ok, true);
let origin = "";
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/__booking_api" && req.method === "POST") {
    let text = "";
    req.on("data", c => { text += c; });
    req.on("end", () => {
      const body = JSON.parse(text); actions.push(body.action);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(e.call(body.action, body)));
    });
    return;
  }
  if (url.pathname === "/admin/__read-only-test.html") {
    res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
    res.end('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#111;color:white;font:14px sans-serif;margin:16px}main{max-width:1000px;margin:auto}</style></head><body><button id="logoutButton">ログアウト</button><main class="main"><section id="monthlyScheduleView"><div class="page-heading"><h1>9ROUND予定</h1></div></section></main><script>const state={idToken:"staff",authUser:{staff_code:"S",permission:"STAFF",store_code:"SOGA",active:true}};function withAuth(p){return Object.assign({},p,{id_token:state.idToken})}function applyPermissionUi(){}function logout(){state.idToken="";state.authUser=null}document.querySelector("#logoutButton").onclick=()=>logout();</script><script src="../9round-booking/config.js"></script><script src="../9round-booking/api.js"></script><script src="./admin-9round-booking.js"></script></body></html>');
    return;
  }
  let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + "/")) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const type = { ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".css": "text/css;charset=utf-8", ".png": "image/png" }[path.extname(file)] || "text/plain";
  res.writeHead(200, { "Content-Type": type }); res.end(fs.readFileSync(file));
});
async function checkOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, label + " horizontal overflow");
}
async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROUND9_CHROMIUM_PATH || undefined, args: ["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-zygote"] });
  const errors = [];
  async function context(width = 390, fixtures = true) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    await page.clock.install({ time: new Date("2026-10-17T00:00:00Z") });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = route.request().url();
      if (fixtures && /\/9round-booking\/config\.js(?:\?|$)/.test(url)) {
        return route.fulfill({ contentType: "text/javascript", body: "window.ANAUTS_ROUND9_BOOKING={apiUrl:" + JSON.stringify(origin + "/__booking_api") + ',firebaseApiKey:"test-key",requestTimeoutMs:5000};' });
      }
      if (url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword")) {
        const body = route.request().postDataJSON();
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ idToken: body.email.split("@")[0], refreshToken: "test-refresh", expiresIn: "3600" }) });
      }
      if (!url.startsWith(origin)) return route.abort();
      return route.continue();
    });
    return { page, ctx };
  }
  try {
    const off = await context(390, false);
    await off.page.goto(origin + "/9round-booking/");
    await off.page.getByText("現在、予約受付の準備中です。", { exact: true }).waitFor();
    assert.equal(actions.length, 0, "review defaults must never contact any backend");
    await checkOverflow(off.page, "disconnected member");
    await off.ctx.close();

    const member = await context();
    await member.page.goto(origin + "/9round-booking/");
    await member.page.locator("#email").fill("member0@example.invalid");
    await member.page.locator("#sendCode").click();
    await member.page.locator("#codeForm").waitFor({ state: "visible" });
    const code = e.sent.at(-1).body.match(/は (\d{6})/)[1];
    await member.page.locator("#code").fill(code);
    await member.page.locator("#verifyCode").click();
    await member.page.locator(".slot-card").nth(10).waitFor();
    await member.page.locator("#bookingDate").fill(day);
    await member.page.locator("#bookingDate").dispatchEvent("change");
    await member.page.locator(".is-full").waitFor();
    assert.equal(await member.page.locator(".slot-card").count(), 11);
    assert.equal(await member.page.locator(".is-full button").isDisabled(), true);
    assert.equal(await member.page.locator(".is-blocked button").isDisabled(), true);
    assert.equal((await member.page.locator("#bookingPanel").textContent()).includes("テスト会員"), false);
    await member.page.locator(".slot-button").first().click();
    await member.page.locator(".is-mine").waitFor();
    assert.match(await member.page.locator(".is-mine").textContent(), /3 \/ 4名/);
    await member.page.screenshot({ path: path.join(evidence, "member-mobile.png"), fullPage: true });
    await checkOverflow(member.page, "member 390");
    await member.page.setViewportSize({ width: 320, height: 780 }); await checkOverflow(member.page, "member 320");
    await member.page.setViewportSize({ width: 1280, height: 900 }); await checkOverflow(member.page, "member desktop");
    await member.page.screenshot({ path: path.join(evidence, "member-desktop.png"), fullPage: true });
    member.page.on("dialog", dialog => dialog.accept());
    await member.page.locator("[data-cancel]").click();
    await member.page.locator(".is-mine").waitFor({ state: "detached" });
    assert.match(await member.page.locator(".slot-card").first().textContent(), /2 \/ 4名/);

    // Real email links carry only the booking ID. A GET opens the authenticated
    // management UI; it never cancels or changes anything on its own.
    const changeFrom = "DAILY:" + day + ":12:30", changeTo = "DAILY:" + day + ":13:15";
    await member.page.locator('[data-book="' + changeFrom + '"]').click();
    await member.page.locator(".is-mine").waitFor();
    const confirmation = e.sent.filter(m => m.to === "member0@example.invalid" && /予約確認/.test(m.subject)).at(-1);
    const changeLink = new URL(confirmation.body.match(/予約を変更する:\n([^\n]+)/)[1]);
    await member.page.goto(origin + "/9round-booking/" + changeLink.search);
    await member.page.locator("#changeBookingBanner").waitFor({ state: "visible" });
    await member.page.locator('[data-book="' + changeTo + '"]').click();
    await member.page.getByText(/に予約を変更しました。/).waitFor();
    assert.equal(await member.page.locator("#changeBookingBanner").isVisible(), false);
    const changedMail = e.sent.filter(m => m.to === "member0@example.invalid" && /予約変更/.test(m.subject)).at(-1);
    const cancelLink = new URL(changedMail.body.match(/予約をキャンセルする:\n([^\n]+)/)[1]);
    await member.page.goto(origin + "/9round-booking/" + cancelLink.search);
    await member.page.getByRole("button", { name: "キャンセルする", exact: true }).waitFor();
    const memberToken = await member.page.evaluate(() => sessionStorage.getItem("nr_booking_session_v1"));
    assert.equal(e.call("get9RoundMemberBookings", { session_token: memberToken }).data.bookings.some(b => b.booking_id === cancelLink.searchParams.get("booking_id")), true);
    await member.page.getByRole("button", { name: "キャンセルする", exact: true }).click();
    await member.page.getByText("取消済み", { exact: true }).waitFor();
    await member.page.setViewportSize({ width: 390, height: 844 });
    await member.page.locator("#memberPassPanel summary").click();
    await member.page.locator("#qrSave").waitFor({ state: "visible" });
    assert.ok(await member.page.locator("#memberQrCanvas").evaluate(c => c.width > 100));
    const qrImage = path.join(evidence, "synthetic-member-qr.png");
    await member.page.locator("#memberQrCanvas").screenshot({ path: qrImage });
    await checkOverflow(member.page, "member QR mobile");
    await member.page.screenshot({ path: path.join(evidence, "member-qr-mobile.png"), fullPage: true });
    const today = "2026-10-17", todaySlot = "DAILY:" + today + ":10:15";
    await member.page.locator("#bookingDate").fill(today);
    await member.page.locator("#bookingDate").dispatchEvent("change");
    await member.page.locator('[data-book="' + todaySlot + '"]').click();
    await member.page.locator(".is-mine").waitFor();

    const staff = await context(1024);
    await staff.page.goto(origin + "/9round-booking/staff/");
    await staff.page.locator("#staffEmail").fill("admin@example.invalid");
    await staff.page.locator("#staffPassword").fill("test-password");
    await staff.page.locator("#staffSignIn").click();
    await staff.page.locator("#nrAdminDate").waitFor();
    await staff.page.locator("#nrQrImage").setInputFiles(qrImage);
    await staff.page.locator("#nrScanResult").getByText(/受講済みにしました/).waitFor();
    await staff.page.locator("#nrAdminBoard").getByText("受講済み", { exact: true }).waitFor();
    const memberQr = e.call("get9RoundMemberPass", { session_token: memberToken }).data.qr_text;
    await staff.page.locator("#nrQrInput").fill(memberQr);
    await staff.page.locator("#nrQrForm button").click();
    await staff.page.locator("#nrScanResult").getByText(/登録済みです/).waitFor();
    await staff.page.locator("#nrCameraStart").click();
    await staff.page.locator("#nrScanResult").getByText(/この画面ではカメラを使えません/).waitFor();
    await member.page.locator("#reload").click();
    await member.page.locator(".slot-action").getByText("✓ 受講済み", { exact: true }).waitFor();
    assert.equal(await member.page.locator("[data-cancel]").count(), 0);
    await checkOverflow(staff.page, "staff scanner desktop");
    await staff.page.locator("#nrAdminDate").fill(day);
    await staff.page.locator("#nrAdminDate").dispatchEvent("change");
    await staff.page.getByText("テスト会員1 様", { exact: true }).first().waitFor();
    assert.equal(await staff.page.locator("#nrQrInput").isDisabled(), true, "future dates cannot accept attendance scans");
    await member.page.locator("#bookingDate").fill(day);
    await member.page.locator("#bookingDate").dispatchEvent("change");
    await member.page.locator('[data-book="' + firstSlot + '"]').waitFor();
    assert.equal(await staff.page.locator("#nrAdminBoard .nr-slot").count(), 11);
    staff.page.on("dialog", dialog => dialog.accept());
    await staff.page.locator("#nrAdminBoard .nr-slot").first().getByRole("button", { name: "予約受付をブロック" }).click();
    await staff.page.locator("#nrAdminBoard .nr-slot").first().getByText("デイリーワークアウト（ブロック中）", { exact: true }).waitFor();
    await member.page.locator("#reload").click();
    await member.page.locator(".slot-card").first().getByText("受付停止", { exact: true }).waitFor();
    assert.match(await member.page.locator(".slot-card").first().textContent(), /2 \/ 4名/);
    await staff.page.locator("#nrAdminBoard .nr-slot").first().getByRole("button", { name: "ブロックを解除" }).click();
    await staff.page.locator("#nrAdminBoard .nr-slot").first().getByText("デイリーワークアウト", { exact: true }).waitFor();

    // Quota failures leave the reservation in place and expose the same durable
    // queue to managers, rather than asking members to create another booking.
    await member.page.locator("#bookingDate").fill(day);
    await member.page.locator("#bookingDate").dispatchEvent("change");
    e.mailFailure(true);
    await member.page.locator('[data-book="' + changeFrom + '"]').click();
    await member.page.getByText(/確認メールは送信待ちです/).waitFor();
    await staff.page.locator("#nrAdminReload").click();
    await staff.page.locator("#nrRetryNotifications").waitFor({ state: "visible" });
    e.mailFailure(false);
    await staff.page.locator("#nrRetryNotifications").click();
    await staff.page.locator("#nrRetryNotifications").waitFor({ state: "hidden" });
    await staff.page.locator("#nrTrialEditor summary").click();
    await staff.page.locator("#nrTrialTitle").fill("初回体験");
    await staff.page.locator("#nrTrialDate").fill(day);
    await staff.page.locator("#nrTrialStart").fill("12:30");
    await staff.page.locator("#nrTrialCapacity").selectOption("2");
    await staff.page.locator("#nrTrialSave").click();
    await staff.page.getByText("体験 · 初回体験", { exact: true }).waitFor();
    assert.equal(await staff.page.locator("#nrAdminBoard .nr-slot").count(), 12);
    await staff.page.screenshot({ path: path.join(evidence, "staff-desktop.png"), fullPage: true });
    await checkOverflow(staff.page, "staff desktop");
    await staff.page.setViewportSize({ width: 390, height: 844 }); await checkOverflow(staff.page, "staff mobile");
    await staff.page.screenshot({ path: path.join(evidence, "staff-mobile.png"), fullPage: true });

    const viewer = await context();
    const actionStart = actions.length;
    await viewer.page.goto(origin + "/admin/__read-only-test.html");
    await viewer.page.locator("#nrAppBoard summary").click();
    await viewer.page.locator("#nrAppDate").fill(day);
    await viewer.page.locator("#nrAppDate").dispatchEvent("change");
    await viewer.page.getByText("テスト会員1 様", { exact: true }).first().waitFor();
    assert.equal(await viewer.page.locator("#nrAppSlots .nr-slot").count(), 12);
    assert.equal(await viewer.page.getByRole("button", { name: /ブロック|体験枠を/ }).count(), 0);
    assert.ok(actions.slice(actionStart).every(action => action === "get9RoundBookingBoard"));
    await checkOverflow(viewer.page, "A-nauts reader mobile");
    await viewer.page.screenshot({ path: path.join(evidence, "anauts-reader.png"), fullPage: true });
    await viewer.page.locator("#logoutButton").click();
    assert.equal(await viewer.page.locator("#nrAppBoard").isVisible(), false);
    assert.equal((await viewer.page.locator("body").textContent()).includes("テスト会員1"), false);

    const normalStaff = await context();
    await normalStaff.page.goto(origin + "/9round-booking/staff/");
    await normalStaff.page.locator("#staffEmail").fill("staff@example.invalid");
    await normalStaff.page.locator("#staffPassword").fill("test-password");
    await normalStaff.page.locator("#staffSignIn").click();
    await normalStaff.page.locator("#nrAdminDate").waitFor();
    assert.equal(await normalStaff.page.locator("#nrTrialEditor").isVisible(), false);
    assert.equal(await normalStaff.page.locator("#nrBlockActions").isVisible(), false);
    assert.equal(await normalStaff.page.getByRole("button", { name: /ブロックを解除|予約受付をブロック/ }).count(), 0);
    await normalStaff.page.locator("#staffLogout").click();
    assert.equal(await normalStaff.page.locator("#nrAdminBoard .nr-slot").count(), 0);
    await member.page.locator("#logout").click();
    assert.equal(await member.page.locator("#authPanel").isVisible(), true);
    assert.equal(await member.page.evaluate(() => sessionStorage.getItem("nr_booking_session_v1")), null);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "passed", checks: ["member email ownership flow", "11 slots / counts only", "full and blocked cannot book", "tap reserve / cancel", "email change and cancel links require explicit authenticated action", "atomic change to another slot", "real QR image decoding and attendance registration", "USB reader and duplicate attendance", "camera fallback", "future dates cannot register attendance", "mail failure preserves reservation and managers retry", "block/unblock preserves reservations", "trial creation", "independent staff roles", "A-nauts is read-only", "logout clears identities", "no horizontal overflow at 320/390/1024/1280px", "no browser exceptions"], apiCalls: actions.length }));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
