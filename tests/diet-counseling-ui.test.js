const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const counsel = fs.readFileSync(path.join(root, "counsel", "index.html"), "utf8");
const reserve = fs.readFileSync(path.join(root, "assets", "js", "reserve.js"), "utf8");
const main = fs.readFileSync(path.join(root, "gas", "99_Main.gs"), "utf8");
const workflow = fs.readFileSync(path.join(root, "gas", "88_DietCounselingWorkflow.gs"), "utf8");
const form = fs.readFileSync(path.join(root, "diet-counseling", "app.js"), "utf8");
const formHtml = fs.readFileSync(path.join(root, "diet-counseling", "index.html"), "utf8");
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
assert.match(form, /minutes < 24 \* 60; minutes \+= 15/);
assert.doesNotMatch(form, /UI確認版のため/);
assert.match(formHtml, /<option value="男性">男性<\/option><option value="女性">女性<\/option>/);
assert.doesNotMatch(formHtml, /その他・回答しない/);
assert.doesNotMatch(formHtml, /The Forest Gym/);
assert.doesNotMatch(form, /The Forest Gym/);
assert.match(formHtml, /ご記入時のお願い/);
assert.match(formHtml, /ごはん、みそ汁、サラダ、から揚げ、湯豆腐、マグロ刺身、焼き鮭/);
assert.match(formHtml, /コンビニ弁当、定食、丼物、麺類、自炊/);
assert.match(formHtml, /id="exercise_history_detail"[^>]*required/);
assert.match(formHtml, /id="current_exercise_detail"[^>]*required/);
assert.match(formHtml, /id="medical_history_detail"[^>]*required/);
assert.match(formHtml, /運動内容・頻度・1回あたりの時間/);
assert.match(formHtml, /病名・時期・現在の状況/);
assert.doesNotMatch(workflow, /The Forest Gym/);
assert.match(admin, /getDietCounselingLinkCandidates/);
assert.match(admin, /sendDietCounselingLinksBulk/);
assert.match(admin, /window\.confirm/);

console.log("diet counseling UI integration tests passed");
