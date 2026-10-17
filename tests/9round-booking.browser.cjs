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
let bookingGate = null, bookingFailure = null, boardGate = null;
for (let i = 1; i <= 4; i++) {
  const token = e.login(i);
  assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date: day, slot_id: secondSlot }).ok, true);
  if (i <= 2) assert.equal(e.call("create9RoundWorkoutBooking", { session_token: token, date: day, slot_id: firstSlot }).ok, true);
}
assert.equal(e.call("set9RoundWorkoutBlock", { id_token: "admin", date: day, slot_id: blockedSlot, blocked: true }).ok, true);
let origin = "";
function integrationFixture(role) {
  // Exercise the real SOGA permission UI and shared board, using only test data.
  const admin = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
  const permissions = admin.slice(admin.indexOf("function roleHonorific("), admin.indexOf("function applyAuthBootstrap_("));
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./admin.css"><title>A-nauts OS / 9ROUND ブランチ確認</title></head><body>
    <div class="app-shell"><header class="topbar"><div class="brand"><div class="brand-mark">A</div><div><strong>A-nauts OS</strong><span>Reserve / Admin</span></div></div>
    <div class="topbar-right"><span class="store-chip">SOGA</span><div id="authUserArea"><span id="authUserName"></span><span id="authUserPermission"></span></div><button id="logoutButton">ログアウト</button></div>
    <nav class="topnav"><button class="nav-button is-active" data-view="staffSchedule">スタッフ予定</button><button id="myShiftNav" class="nav-button" data-view="myShift">自分の予定</button><button class="nav-button" data-view="registration">各種登録</button></nav></header>
    <main class="main"><section id="staffScheduleView" class="view is-active"><h1>スタッフ予定</h1></section><section id="myShiftView" class="view"><h1>自分の予定</h1></section><section id="registrationView" class="view"><h1>各種登録</h1></section></main></div>
    <script>const state={idToken:"",authUser:null,testRole:""};const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);function authEnabled(){return true}
    ${permissions}
    function logout(){state.idToken="";state.authUser=null;applyPermissionUi()}
    window.setTestUser=function(role,claims){state.testRole=role;state.idToken="stale-"+role;state.authUser={staff_code:{admin:"A",manager:"M",staff:"S",other:"Y"}[role],email:role+"@example.invalid",permission:claims||({admin:"ADMIN",manager:"MANAGER",staff:"STAFF",other:"STAFF"}[role]),store_code:role==="staff"?"SOGA":"YACHIYO",active:true};applyPermissionUi()};
    window.refreshCalls=0;window.ANAUTS_ENSURE_FRESH_AUTH_TOKEN=async function(){window.refreshCalls++;state.idToken=state.testRole};
    window.setTestUser(${JSON.stringify(role)});document.querySelector("#logoutButton").onclick=()=>logout();</script>
    <script src="../9round-booking/config.js"></script><script src="../9round-booking/api.js"></script><script src="./admin-9round-booking.js"></script><script src="../9round-booking/vendor/jsqr.min.js"></script><script src="../9round-booking/staff/scanner.js"></script><script src="../9round-booking/staff/booking-actions.js"></script><script src="../9round-booking/staff/board.js"></script></body></html>`;
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/__copy-test.html") {
    const source = fs.readFileSync(path.join(root, "9round-booking/gas/CodeCopy.html"), "utf8");
    const start = source.indexOf("<? if (code) { ?>"), end = source.indexOf("<? } else { ?>");
    const html = (source.slice(0, start) + source.slice(start + "<? if (code) { ?>".length, end) + source.slice(source.indexOf("<? } ?>", end) + "<? } ?>".length)).replace("<?= code ?>", "123456");
    res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" }); res.end(html); return;
  }
  if (url.pathname === "/__booking_api" && req.method === "POST") {
    let text = "";
    req.on("data", c => { text += c; });
    req.on("end", async () => {
      const body = JSON.parse(text); actions.push(body.action);
      const mutation = /^(create|reschedule)9RoundWorkoutBooking$/.test(body.action);
      if (mutation && bookingGate) await bookingGate;
      if (body.action === "get9RoundBookingBoard" && boardGate) await boardGate;
      const failure = mutation && bookingFailure;
      if (failure) bookingFailure = null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(failure || e.call(body.action, body)));
    });
    return;
  }
  if (url.pathname === "/admin/__integration-test.html") {
    const role = ["admin", "manager", "staff", "other"].includes(url.searchParams.get("role")) ? url.searchParams.get("role") : "staff";
    res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
    res.end(integrationFixture(role)); return;
  }
  let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + "/")) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const type = { ".html": "text/html;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".css": "text/css;charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" }[path.extname(file)] || "text/plain";
  res.writeHead(200, { "Content-Type": type, ...(url.searchParams.has("cameraBlocked") ? { "Permissions-Policy": "camera=()" } : {}) }); res.end(fs.readFileSync(file));
});
async function checkOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, label + " horizontal overflow");
}
async function dismissBookingResult(page, state = "success") {
  await page.locator('#bookingFeedback[data-state="' + state + '"]').waitFor({ state: "visible" });
  await page.locator("#bookingFeedbackClose").click();
  await page.locator('#bookingPanel[aria-busy="false"]').waitFor();
}
async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROUND9_CHROMIUM_PATH || undefined, args: ["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-zygote"] });
  const errors = [];
  async function context(width = 390, fixtures = true) {
    // This suite routes mock API/config responses; service workers are verified separately.
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", serviceWorkers: "block" });
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
    const codeCopy = await context();
    await codeCopy.ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    await codeCopy.page.goto(origin + "/__copy-test.html");
    await codeCopy.page.locator("#copyButton").click();
    await codeCopy.page.locator("#status").getByText(/^コピーしました/).waitFor();
    assert.equal(await codeCopy.page.evaluate(() => navigator.clipboard.readText()), "123456");
    await checkOverflow(codeCopy.page, "code copy mobile");
    await codeCopy.ctx.close();
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
    await member.page.getByText("テスト会員0さん、", { exact: true }).waitFor();
    assert.match(await member.page.locator(".intro h1").textContent(), /次の30分を/);
    assert.equal(await member.page.locator("#fighterPanel").getAttribute("open"), "");
    assert.equal(await member.page.locator("#fighterName").getAttribute("placeholder"), "あなたのファイターネーム");
    await member.page.locator("#fighterName").fill("ソガの赤い虎");
    await member.page.locator("#fighterSave").click();
    await member.page.getByText("ソガの赤い虎さん、", { exact: true }).waitFor();
    await member.page.locator("#fighterName").fill("RED TIGER");
    await member.page.locator("#fighterSave").click();
    await member.page.getByText("RED TIGERさん、", { exact: true }).waitFor();
    await member.page.locator("#fighterPanel summary").click();
    assert.equal(await member.page.locator(".slot-time").first().textContent(), "10:15");
    await member.page.locator("#bookingDate").fill(day);
    await member.page.locator("#bookingDate").dispatchEvent("change");
    await member.page.locator(".is-full").waitFor();
    assert.equal(await member.page.locator(".slot-card").count(), 11);
    assert.equal(await member.page.locator(".is-full button").isDisabled(), true);
    assert.equal(await member.page.locator(".is-blocked button").isDisabled(), true);
    assert.equal((await member.page.locator("#bookingPanel").textContent()).includes("テスト会員"), false);
    bookingFailure = { ok: false, code: "SLOT_FULL", message: "この枠は満員になりました。別の枠をお選びください。" };
    await member.page.locator(".slot-button").first().click();
    await member.page.locator("#bookingFeedbackTitle").getByText("予約を完了できませんでした", { exact: true }).waitFor();
    assert.match(await member.page.locator("#bookingFeedbackNote").textContent(), /満員/);
    assert.equal(await member.page.locator(".is-mine").count(), 0);
    await dismissBookingResult(member.page, "error");
    bookingFailure = { ok: false, message: "通信結果を確認できませんでした。" };
    await member.page.locator(".slot-button").first().click();
    await member.page.locator("#bookingFeedbackTitle").getByText("予約結果を確認できませんでした", { exact: true }).waitFor();
    assert.match(await member.page.locator("#bookingFeedbackNote").textContent(), /予約一覧・確認メールをご確認/);
    await dismissBookingResult(member.page, "error");
    let releaseBooking;
    bookingGate = new Promise(resolve => { releaseBooking = resolve; });
    const createsBefore = actions.filter(a => a === "create9RoundWorkoutBooking").length;
    await member.page.locator(".slot-button").first().click();
    await member.page.locator('#bookingFeedback[data-state="pending"]').waitFor({ state: "visible" });
    assert.equal(await member.page.locator("#bookingFeedbackTitle").textContent(), "予約しています…");
    assert.match(await member.page.locator("#bookingFeedbackWhen").textContent(), /10月18日.*\n10:15 開始/);
    assert.equal(await member.page.locator("#bookingFeedbackClose").isVisible(), false);
    assert.equal(await member.page.locator(".slot-button:not(:disabled)").count(), 0);
    await member.page.locator(".slot-button").first().dispatchEvent("click");
    await member.page.keyboard.press("Escape");
    assert.equal(await member.page.locator("#bookingFeedback").isVisible(), true);
    assert.equal(await member.page.locator(".is-mine").count(), 0, "pending feedback must not claim success");
    await member.page.screenshot({ path: path.join(evidence, "booking-pending-mobile.png") });
    await member.page.setViewportSize({ width: 320, height: 780 }); await checkOverflow(member.page, "pending feedback 320");
    await member.page.setViewportSize({ width: 390, height: 844 });
    bookingGate = null; releaseBooking();
    await member.page.locator('#bookingFeedback[data-state="success"]').waitFor({ state: "visible" });
    assert.equal(await member.page.locator("#bookingFeedbackTitle").textContent(), "予約が完了しました");
    assert.equal(await member.page.locator("#bookingFeedbackIcon").textContent(), "✓");
    assert.equal(actions.filter(a => a === "create9RoundWorkoutBooking").length, createsBefore + 1, "repeated tap must only submit once");
    await member.page.screenshot({ path: path.join(evidence, "booking-success-mobile.png") });
    await dismissBookingResult(member.page);
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
    await dismissBookingResult(member.page);
    await member.page.locator(".is-mine").waitFor();
    const confirmation = e.sent.filter(m => m.to === "member0@example.invalid" && /予約確認/.test(m.subject)).at(-1);
    const changeLink = new URL(confirmation.body.match(/予約を変更する:\n([^\n]+)/)[1]);
    await member.page.goto(origin + "/9round-booking/" + changeLink.search);
    await member.page.locator("#changeBookingBanner").waitFor({ state: "visible" });
    await member.page.locator('[data-book="' + changeTo + '"]').click();
    await dismissBookingResult(member.page);
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
    await dismissBookingResult(member.page);
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
    await staff.page.locator("#nrAdminBoard").getByText("ファイター：RED TIGER", { exact: true }).waitFor();
    assert.equal(await staff.page.locator("#nrAdminBoard .nr-slot-head strong").first().textContent(), "10:15");
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
    await member.page.locator('#bookingFeedback[data-state="success"]').waitFor();
    assert.match(await member.page.locator("#bookingFeedbackNote").textContent(), /予約は成立しています。.*\n確認メールは送信待ち/);
    await dismissBookingResult(member.page);
    await member.page.locator("#message").getByText(/確認メールは送信待ちです/).waitFor();
    await staff.page.locator("#nrAdminReload").click();
    await staff.page.locator("#nrRetryNotifications").waitFor({ state: "visible" });
    e.mailFailure(false);
    await staff.page.locator("#nrRetryNotifications").click();
    await staff.page.locator("#nrRetryNotifications").waitFor({ state: "hidden" });

    // Manager links use staff authentication, retain the original until an
    // explicit tap, then send updated member and management notifications.
    const managementMail = e.sent.filter(m => m.to === "admin@example.invalid" && /予約確認/.test(m.subject) && m.body.includes("氏名: テスト会員0")).at(-1);
    const managementChange = new URL(managementMail.body.match(/管理画面で変更する:\n([^\n]+)/)[1]);
    const managedId = managementChange.searchParams.get("booking_id");
    const mutationsBefore = actions.filter(a => a === "reschedule9RoundManagedBooking").length;
    await staff.page.goto(origin + "/9round-booking/staff/" + managementChange.search);
    await staff.page.locator("#staffEmail").fill("admin@example.invalid");
    await staff.page.locator("#staffPassword").fill("test-password");
    await staff.page.locator("#staffSignIn").click();
    await staff.page.locator("#nrManagedSlots button").nth(10).waitFor();
    assert.equal(actions.filter(a => a === "reschedule9RoundManagedBooking").length, mutationsBefore);
    assert.equal(e.call("get9RoundManagedBooking", { id_token: "admin", booking_id: managedId }).data.booking.status, "CONFIRMED");
    assert.match(await staff.page.locator("#nrManagedContent").textContent(), /テスト会員0 様.*RED TIGER/);
    await staff.page.locator('[data-managed-slot="DAILY:' + day + ':17:00"]').click();
    await staff.page.locator("#nrManagedMessage").getByText(/予約を変更しました/).waitFor();
    const managementChangedMail = e.sent.filter(m => m.to === "admin@example.invalid" && /予約変更/.test(m.subject)).at(-1);
    const managementCancel = new URL(managementChangedMail.body.match(/管理画面でキャンセルする:\n([^\n]+)/)[1]);
    await staff.page.goto(origin + "/9round-booking/staff/" + managementCancel.search);
    await staff.page.locator("#staffEmail").fill("admin@example.invalid");
    await staff.page.locator("#staffPassword").fill("test-password");
    await staff.page.locator("#staffSignIn").click();
    await staff.page.locator("#nrManagedCancel").waitFor();
    assert.equal(e.call("get9RoundManagedBooking", { id_token: "admin", booking_id: managementCancel.searchParams.get("booking_id") }).data.booking.status, "CONFIRMED");
    await staff.page.locator("#nrManagedCancel").click();
    await staff.page.locator("#nrManagedMessage").getByText(/予約をキャンセルしました/).waitFor();
    assert.equal(e.call("get9RoundManagedBooking", { id_token: "admin", booking_id: managementCancel.searchParams.get("booking_id") }).data.booking.status, "CANCELLED");
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
    await viewer.page.goto(origin + "/admin/__integration-test.html?role=staff");
    await viewer.page.locator("#nineRoundBookingNav").click();
    await viewer.page.locator("#nrAdminDate").fill(day);
    await viewer.page.locator("#nrAdminDate").dispatchEvent("change");
    await viewer.page.getByText("テスト会員1 様", { exact: true }).first().waitFor();
    assert.equal(await viewer.page.locator("#nrAdminBoard .nr-slot").count(), 12);
    assert.equal(await viewer.page.locator("#nrBlockDay").isVisible(), false);
    assert.equal(await viewer.page.locator("#nrTrialEditor").isVisible(), false);
    assert.equal(await viewer.page.locator("[data-slot-mutation]").count(), 0);
    assert.equal(await viewer.page.locator("#staffLoginForm").count(), 0, "A-nauts login is reused");
    assert.ok(await viewer.page.evaluate(() => window.refreshCalls > 0));
    assert.ok(actions.slice(actionStart).every(action => action === "get9RoundBookingBoard"));
    viewer.page.on("dialog", dialog => dialog.accept());
    await viewer.page.locator('[data-slot-id="' + firstSlot + '"]').getByRole("button", { name: "変更", exact: true }).first().click();
    await viewer.page.locator('[data-managed-slot="DAILY:' + day + ':18:30"]').click();
    await viewer.page.locator("#nrManagedMessage").getByText(/予約を変更しました/).waitFor();
    await viewer.page.locator('[data-slot-id="DAILY:' + day + ':18:30"]').getByRole("button", { name: "キャンセル", exact: true }).first().click();
    await viewer.page.locator("#nrManagedCancel").click();
    await viewer.page.locator("#nrManagedMessage").getByText(/予約をキャンセルしました/).waitFor();
    await checkOverflow(viewer.page, "A-nauts staff mobile");
    await viewer.page.screenshot({ path: path.join(evidence, "anauts-staff.png"), fullPage: true });

    const managerView = await context();
    await managerView.page.goto(origin + "/admin/__integration-test.html?role=manager");
    await managerView.page.locator("#nineRoundBookingNav").click();
    await managerView.page.locator("#nrAdminDate").fill(day);
    await managerView.page.locator("#nrAdminDate").dispatchEvent("change");
    await managerView.page.locator("[data-manage-booking]").first().waitFor();
    assert.equal(await managerView.page.locator("#nrTrialEditor").isVisible(), false);
    assert.equal(await managerView.page.locator("#nrBlockDay").isVisible(), false);
    assert.equal(await managerView.page.locator("[data-slot-mutation]").count(), 0);
    await checkOverflow(managerView.page, "A-nauts manager mobile");
    await managerView.ctx.close();

    const adminView = await context(1280);
    await adminView.page.goto(origin + "/admin/__integration-test.html?role=admin");
    await adminView.page.locator("#nineRoundBookingNav").click();
    await adminView.page.locator("#nrAdminDate").fill(day);
    await adminView.page.locator("#nrAdminDate").dispatchEvent("change");
    await adminView.page.locator("#nrBlockDay").waitFor({ state: "visible" });
    assert.equal(await adminView.page.locator("#nrTrialEditor").isVisible(), true);
    adminView.page.on("dialog", dialog => dialog.accept());
    await adminView.page.locator('[data-slot-id="' + firstSlot + '"]').waitFor();
    const removedSlot = "DAILY:" + day + ":20:00", removedCard = adminView.page.locator('[data-slot-id="' + removedSlot + '"]');
    await removedCard.getByRole("button", { name: "枠を削除", exact: true }).click();
    await removedCard.getByText("削除済み", { exact: true }).waitFor();
    assert.equal(e.call("get9RoundWorkoutSlots", { session_token: e.login(7), date: day }).data.slots.some(s => s.slot_id === removedSlot), false);
    await removedCard.getByRole("button", { name: "枠を復元", exact: true }).click();
    await removedCard.getByText("デイリーワークアウト（ブロック中）", { exact: true }).waitFor();
    await removedCard.getByRole("button", { name: "ブロックを解除", exact: true }).click();
    await removedCard.getByText("デイリーワークアウト", { exact: true }).waitFor();
    await adminView.page.locator("#nrTrialEditor summary").click();
    await adminView.page.locator("#nrTrialTitle").fill("OS体験枠");
    await adminView.page.locator("#nrTrialDate").fill(day);
    await adminView.page.locator("#nrTrialStart").fill("17:45");
    await adminView.page.locator("#nrTrialSave").click();
    const newTrialCard = adminView.page.locator("#nrAdminBoard .nr-slot").filter({ hasText: "OS体験枠" });
    await newTrialCard.waitFor();
    await newTrialCard.getByRole("button", { name: "枠を削除", exact: true }).click();
    await newTrialCard.getByText("削除済み", { exact: true }).waitFor();
    await newTrialCard.getByRole("button", { name: "枠を復元", exact: true }).click();
    await newTrialCard.getByText(/受付停止/).waitFor();
    await adminView.page.screenshot({ path: path.join(evidence, "anauts-admin.png"), fullPage: true });
    await checkOverflow(adminView.page, "A-nauts admin desktop");
    for (const width of [320, 390, 1024]) {
      await adminView.page.setViewportSize({ width, height: 844 });
      await checkOverflow(adminView.page, "A-nauts admin " + width);
    }
    await adminView.ctx.close();

    const denied = await context();
    await denied.page.goto(origin + "/admin/__integration-test.html?role=other");
    assert.equal(await denied.page.locator("#nineRoundBookingNav").count(), 0);
    await denied.page.evaluate(() => window.setTestUser("other", "ADMIN"));
    await denied.page.locator("#nineRoundBookingNav").click();
    await denied.page.locator("#nineRoundBookingNav").waitFor({ state: "hidden" });
    assert.equal(await denied.page.locator("#nrAdminBoard").textContent(), "");
    await denied.ctx.close();

    let releaseBoard;
    boardGate = new Promise(resolve => { releaseBoard = resolve; });
    const pendingBoard = viewer.page.waitForResponse(r => r.url().includes("/__booking_api") && r.request().postDataJSON().action === "get9RoundBookingBoard");
    const startedBoard = viewer.page.waitForRequest(r => r.url().includes("/__booking_api") && r.postDataJSON().action === "get9RoundBookingBoard");
    await viewer.page.locator("#nrAdminReload").click();
    await startedBoard;
    await viewer.page.locator("#logoutButton").click();
    releaseBoard(); boardGate = null; await pendingBoard;
    await viewer.page.waitForLoadState("networkidle");
    assert.equal(await viewer.page.locator("#nineRoundBookingView").isVisible(), false);
    assert.equal(await viewer.page.locator("#nrAdminBoard").textContent(), "");
    assert.equal((await viewer.page.locator("body").textContent()).includes("テスト会員1"), false);

    const blockedCamera = await context();
    await blockedCamera.page.goto(origin + "/9round-booking/staff/?cameraBlocked=1");
    await blockedCamera.page.locator("#staffEmail").fill("staff@example.invalid");
    await blockedCamera.page.locator("#staffPassword").fill("test-password");
    await blockedCamera.page.locator("#staffSignIn").click();
    await blockedCamera.page.locator("#nrCameraAvailability").waitFor({ state: "visible" });
    assert.equal(await blockedCamera.page.locator("#nrCameraStart").isVisible(), false);
    assert.equal(await blockedCamera.page.locator("#nrQrImage").isEnabled(), true);
    assert.equal(await blockedCamera.page.locator("#nrQrInput").isEnabled(), true);
    await blockedCamera.ctx.close();

    const normalStaff = await context();
    await normalStaff.page.goto(origin + "/9round-booking/staff/");
    await normalStaff.page.locator("#staffEmail").fill("staff@example.invalid");
    await normalStaff.page.locator("#staffPassword").fill("test-password");
    await normalStaff.page.locator("#staffSignIn").click();
    await normalStaff.page.locator("#nrAdminDate").waitFor();
    await normalStaff.page.locator("#nrAdminDate").fill(day);
    await normalStaff.page.locator("#nrAdminDate").dispatchEvent("change");
    await normalStaff.page.locator("[data-manage-booking]").first().waitFor();
    assert.equal(await normalStaff.page.locator("#nrTrialEditor").isVisible(), false);
    assert.equal(await normalStaff.page.locator("#nrBlockActions").isVisible(), false);
    assert.equal(await normalStaff.page.locator("#nrManagedPanel").isVisible(), true);
    assert.ok(await normalStaff.page.locator("[data-manage-booking]").count() > 0);
    assert.equal(await normalStaff.page.getByRole("button", { name: /ブロックを解除|予約受付をブロック/ }).count(), 0);
    await normalStaff.page.locator("#staffLogout").click();
    assert.equal(await normalStaff.page.locator("#nrAdminBoard .nr-slot").count(), 0);
    await member.page.locator("#logout").click();
    assert.equal(await member.page.locator("#authPanel").isVisible(), true);
    assert.equal(await member.page.evaluate(() => sessionStorage.getItem("nr_booking_session_v1")), null);
    assert.equal(await member.page.locator("#fighterGreeting").textContent(), "");
    assert.equal(await member.page.locator("#fighterName").inputValue(), "");

    const limited = await context();
    await limited.page.goto(origin + "/9round-booking/");
    await limited.page.locator("#email").fill("member6@example.invalid");
    await limited.page.locator("#sendCode").click();
    await limited.page.locator("#codeForm").waitFor({ state: "visible" });
    await limited.page.locator("#code").fill(e.sent.at(-1).body.match(/は (\d{6})/)[1]);
    await limited.page.locator("#verifyCode").click();
    await limited.page.locator(".slot-card").nth(10).waitFor();
    const limitToken = await limited.page.evaluate(() => sessionStorage.getItem("nr_booking_session_v1"));
    const limitDay = "2026-10-19";
    const limitSlots = JSON.parse(JSON.stringify(e.context.nrBookingDailySlots_(limitDay)));
    limitSlots.slice(0, 10).forEach(s => assert.equal(e.call("create9RoundWorkoutBooking", { session_token: limitToken, date: limitDay, slot_id: s.slot_id }).ok, true));
    await limited.page.locator("#bookingDate").fill(limitDay);
    await limited.page.locator("#bookingDate").dispatchEvent("change");
    await limited.page.locator("#bookingLimitStatus").getByText(/未消化予約 10 \/ 10コマ/).waitFor();
    assert.equal(await limited.page.locator(".slot-button").nth(10).isDisabled(), true);
    assert.match(await limited.page.locator(".slot-button").nth(10).textContent(), /未消化予約の上限/);
    await limited.page.locator("#reload").click();
    await limited.page.locator("#myBookingsPanel summary").click();
    await limited.page.locator('[data-member-action="change"]').first().click();
    await limited.page.locator("#changeBookingBanner").waitFor({ state: "visible" });
    await limited.page.locator('[data-book="' + limitSlots[10].slot_id + '"]').click();
    await dismissBookingResult(limited.page);
    await limited.page.getByText(/に予約を変更しました/).waitFor();
    assert.equal(e.call("get9RoundMemberBookings", { session_token: limitToken }).data.outstanding_count, 10);
    limited.page.on("dialog", dialog => dialog.accept());
    await limited.page.locator('[data-member-action="cancel"]').first().click();
    await limited.page.locator("#bookingLimitStatus").getByText(/未消化予約 9 \/ 10コマ/).waitFor();
    await limited.ctx.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "passed", checks: ["member email ownership flow", "fighter registration and rename personalize greeting", "30 minute wording and start-time-only slots", "real and fighter names on staff board", "11 slots / counts only", "full and blocked cannot book", "tap reserve / cancel", "fighter placeholder uses fighter name", "pending dialog shows selected time and blocks repeated submission", "success is shown only after the booking response", "capacity rejection and unknown transport result have distinct feedback", "email change and cancel links require explicit authenticated action", "atomic change to another slot", "management mail change and cancel links require staff login and explicit action", "real QR image decoding and attendance registration", "USB reader and duplicate attendance", "camera fallback", "blocked camera policy keeps photo and reader available", "future dates cannot register attendance", "mail failure preserves reservation and managers retry", "block/unblock preserves reservations", "trial creation", "independent staff roles", "A-nauts staff login and refreshed tokens are reused", "staff change and cancellation within A-nauts", "manager slot controls are hidden", "admin deletion and restoration for daily and trial slots", "forged role and late logout responses clear member data", "logout clears identities and fighter name", "ten outstanding reservations prevent an eleventh and still allow change or cancel", "no horizontal overflow at 320/390/1024/1280px", "no browser exceptions"], apiCalls: actions.length }));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
