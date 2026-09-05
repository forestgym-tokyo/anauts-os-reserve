const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const questionnaire = fs.readFileSync(
  path.join(root, "admin", "admin-questionnaire.js"),
  "utf8"
);
const polish = fs.readFileSync(
  path.join(root, "admin", "admin-tour-ui-polish.js"),
  "utf8"
);
const config = fs.readFileSync(
  path.join(root, "admin", "firebase-config.js"),
  "utf8"
);
const indexHtml = fs.readFileSync(
  path.join(root, "admin", "index.html"),
  "utf8"
);
const adminHtml = fs.readFileSync(
  path.join(root, "admin", "admin.html"),
  "utf8"
);

for (const source of [questionnaire, polish]) {
  assert.doesNotMatch(source, /MutationObserver|setInterval|requestAnimationFrame/);
}
assert.doesNotMatch(questionnaire, /setTimeout\(boot\s*,/);
assert.doesNotMatch(config, /admin-questionnaire-fix\.js/);
assert.match(config, /admin-tour-ui-polish\.js\?v=20260828-event-driven-v1/);
assert.match(questionnaire, /id="tourAddressCorrect"/);
assert.match(questionnaire, /class="tour-modal-x"/);
assert.match(questionnaire, /action:"updateTourCustomerAddress"/);
assert.match(questionnaire, /toUpperCase\(\)!=="CANCELLED"/);
assert.doesNotMatch(questionnaire, /loadStaffSchedule\s*\(/);
assert.doesNotMatch(polish, /tour-reply-inside|openReplyForRow|wireModal/);
assert.match(questionnaire, /const REPLY_ACTION = "sendTourCustomerReplyV2"/);
assert.match(questionnaire, /const REPLY_HISTORY_ACTION = "getTourReplyHistory"/);
assert.match(questionnaire, /question\.onclick=e=>/);
assert.match(questionnaire, /question\.onkeydown=e=>/);
assert.match(questionnaire, /role","button"/);
assert.match(questionnaire, /id="tourReplyHistory"/);
assert.doesNotMatch(polish, /MutationObserver|openReplyForRow|wireModal/);

for (const html of [indexHtml, adminHtml]) {
  assert.match(html, /admin-questionnaire\.js\?v=20260906-tour-reply-history-v1/);
  assert.match(html, /firebase-config\.js\?v=20260903-daily-save-required-v2/);
}

console.log("admin questionnaire lightweight tests passed");
