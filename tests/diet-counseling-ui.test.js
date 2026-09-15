const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const counsel = fs.readFileSync(path.join(root, "counsel", "index.html"), "utf8");
const reserve = fs.readFileSync(path.join(root, "assets", "js", "reserve.js"), "utf8");
const main = fs.readFileSync(path.join(root, "gas", "99_Main.gs"), "utf8");
const workflow = fs.readFileSync(path.join(root, "gas", "88_DietCounselingWorkflow.gs"), "utf8");
const form = fs.readFileSync(path.join(root, "diet-counseling", "app.js"), "utf8");
const admin = fs.readFileSync(path.join(root, "admin", "admin-counseling-links.js"), "utf8");

assert.match(counsel, /name="consultation_method" value="ONLINE" checked/);
assert.match(counsel, /name="consultation_method" value="IN_PERSON"/);
assert.doesNotMatch(counsel, /どちらでもよい/);
assert.match(reserve, /consultation_method:\s*getConsultationMethod_\(\)/);
assert.match(reserve, /searchParams\.set\("consultation_method", getConsultationMethod_\(\)\)/);

assert.match(main, /getDietCounselingAvailableSlots_\(params\)/);
assert.match(main, /getDietCounselingAvailableSlotsRange_\(params\)/);
assert.match(main, /createDietCounselingReservation_\(body\)/);
assert.match(main, /getDietCounselingFormContext_\(params\)/);
assert.match(main, /submitDietCounselingResponse_\(body\)/);
assert.match(main, /sendDietCounselingLinksBulk_\(body\)/);

assert.match(workflow, /OFFICE_STORE_CODE:\s*"HEAD_OFFICE"/);
assert.match(workflow, /ANSWER_SPREADSHEET_ID:\s*"1muAm2zWPhI7NU3AA1vrd2ygKUqDh9ix6KFDATk9mX90"/);
assert.match(workflow, /getDietCounselingHeaderMap_/);
assert.match(workflow, /不足：/);
assert.match(workflow, /重複：/);
assert.match(workflow, /MailApp\.sendEmail/);

assert.match(form, /getDietCounselingFormContext/);
assert.match(form, /submitDietCounselingResponse/);
assert.doesNotMatch(form, /UI確認版のため/);
assert.match(admin, /getDietCounselingLinkCandidates/);
assert.match(admin, /sendDietCounselingLinksBulk/);
assert.match(admin, /window\.confirm/);

console.log("diet counseling UI integration tests passed");
