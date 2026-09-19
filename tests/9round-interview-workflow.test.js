const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const workflowSource = fs.readFileSync(
  path.join(root, "gas", "89_9RoundInterviewWorkflow.gs"),
  "utf8"
);
const serviceSource = fs.readFileSync(
  path.join(root, "gas", "90_9RoundInterviewDraftService.gs"),
  "utf8"
);
const mainSource = fs.readFileSync(path.join(root, "gas", "99_Main.gs"), "utf8");
const round9EntrySource = fs.readFileSync(
  path.join(root, "gas", "85_9RoundWithdrawalWebApp.gs"),
  "utf8"
);
const uiSource = fs.readFileSync(
  path.join(root, "admin", "admin-9round-interview.js"),
  "utf8"
);
const addonSource = fs.readFileSync(
  path.join(root, "admin", "firebase-config.js"),
  "utf8"
);

function formatTokyo(date, pattern) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((record, part) => {
    record[part.type] = part.value;
    return record;
  }, {});
  if (pattern === "yyyy-MM-dd") return `${parts.year}-${parts.month}-${parts.day}`;
  if (pattern === "HH:mm") return `${parts.hour}:${parts.minute}`;
  if (pattern === "yyyy/MM/dd HH:mm:ss") {
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function workflowContext() {
  const context = {
    console,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    RegExp,
    isFinite,
    Utilities: {
      formatDate: (date, _timezone, pattern) => formatTokyo(date, pattern),
      parseDate(value) {
        return new Date(`${value}T00:00:00+09:00`);
      },
      getUuid: () => "11111111-2222-4333-8444-555555555555"
    }
  };
  vm.createContext(context);
  vm.runInContext(workflowSource, context);
  return context;
}

test("候補はKAWAKAMIのYACHIYOシフトを11〜20時に絞り、予定を差し引いて4日返す", () => {
  const context = workflowContext();
  const shifts = [
    { staff_code: "KAWAKAMI", store_code: "YACHIYO", date: "2026-09-20", start_time: "09:00", end_time: "15:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "YACHIYO", date: "2026-09-21", start_time: "16:00", end_time: "21:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "YACHIYO", date: "2026-09-22", start_time: "10:00", end_time: "12:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "YACHIYO", date: "2026-09-23", start_time: "09:00", end_time: "11:30", active: true },
    { staff_code: "OTHER", store_code: "YACHIYO", date: "2026-09-24", start_time: "11:00", end_time: "20:00", active: true },
    { staff_code: "KAWAKAMI", store_code: "SOGA", date: "2026-09-25", start_time: "11:00", end_time: "20:00", active: true }
  ];
  const busy = [
    { date: "2026-09-20", start_time: "12:00", end_time: "13:00" },
    { date: "2026-09-21", start_time: "18:00", end_time: "19:00" }
  ];
  const candidates = context.buildRound9InterviewCandidates_(
    shifts,
    busy,
    "2026-09-20",
    "2026-09-30",
    4
  );
  assert.equal(candidates.length, 4);
  assert.deepEqual(
    JSON.parse(JSON.stringify(candidates.map(row => [row.date, row.start_time, row.end_time]))),
    [
      ["2026-09-20", "13:00", "15:00"],
      ["2026-09-21", "16:00", "18:00"],
      ["2026-09-22", "11:00", "12:00"],
      ["2026-09-23", "11:00", "11:30"]
    ]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(candidates[0].available_windows)),
    [
      { start_time: "11:00", end_time: "12:00" },
      { start_time: "13:00", end_time: "15:00" }
    ]
  );
});

test("面接案内文は4候補、30分、URL後送を明記する", () => {
  const context = workflowContext();
  const candidates = [
    { date: "2026-09-24", start_time: "11:00", end_time: "15:00" },
    { date: "2026-09-25", start_time: "11:00", end_time: "15:00" },
    { date: "2026-09-28", start_time: "11:00", end_time: "15:00" },
    { date: "2026-09-30", start_time: "16:00", end_time: "20:00" }
  ];
  const body = context.build9RoundInterviewDraftBody_("新井 結貴", candidates);
  assert.match(body, /^新井 結貴 様/);
  assert.match(body, /①9月24日（木） 11:00～15:00/);
  assert.match(body, /④9月30日（水） 16:00～20:00/);
  assert.match(body, /面接時間は30分程度です/);
  assert.match(body, /日程が決まりましたら、ONLINE面接用のURLをお送りします/);
  assert.match(body, /9ROUND アリオ蘇我店$/);
});

test("Indeed応募通知から表示名と中継メールアドレスを抽出する", () => {
  const context = workflowContext();
  const message = {
    getSubject: () => "[新しい応募者のお知らせ] 新井 結貴さんがボクササイズスタジオのスタッフの求人に応募しました",
    getFrom: () => '"新井 結貴" <jieguixinjing24ztanb_gc6@indeedemail.com>',
    getId: () => "1a0b3cdb4f45efae",
    getHeader: name => name === "X-Indeed-Content-Type" ? "bundled_application_email_jp_individual" : ""
  };
  assert.equal(context.isRound9IndeedApplicationMessage_(message), true);
  const parsed = context.parseRound9IndeedApplication_(message);
  assert.equal(parsed.applicantName, "新井 結貴");
  assert.equal(parsed.email, "jieguixinjing24ztanb_gc6@indeedemail.com");
  assert.equal(parsed.sourceMessageId, "1a0b3cdb4f45efae");

  const reply = Object.assign({}, message, {
    getSubject: () => "Re: [新しい応募者のお知らせ] 新井 結貴さんがボクササイズスタジオのスタッフの求人に応募しました",
    getHeader: () => ""
  });
  assert.equal(context.isRound9IndeedApplicationMessage_(reply), false);
});

test("GASルート、5分トリガー、処理ラベル、9ROUND専用下書きサービスが配線されている", () => {
  assert.match(mainSource, /case "get9RoundInterviewCandidates"/);
  assert.match(mainSource, /case "get9RoundInterviewAutomationStatus"/);
  assert.match(mainSource, /case "preview9RoundInterviewDraft"/);
  assert.match(mainSource, /case "create9RoundInterviewDraft"/);
  assert.match(round9EntrySource, /case "create9RoundInterviewDraft"/);
  assert.match(workflowSource, /everyMinutes\(5\)/);
  assert.match(workflowSource, /from:\(indeedemail\.com\)/);
  assert.match(workflowSource, /A-nauts\/9ROUND面接下書き作成済み/);
  assert.match(workflowSource, /A-nauts\/9ROUND面接下書き要確認/);
  assert.match(serviceSource, /SENDER_EMAIL:\s*"9round\.ariosoga@gmail\.com"/);
  assert.match(serviceSource, /Session\.getEffectiveUser\(\)\.getEmail\(\)/);
  assert.match(serviceSource, /GmailApp\.createDraft/);
  assert.doesNotMatch(serviceSource, /sendEmail|send\(\)/);
});

test("管理画面は手入力・候補再取得・プレビュー・下書き作成を備える", () => {
  assert.match(uiSource, /9ROUND面接案内/);
  assert.match(uiSource, /get9RoundInterviewCandidates/);
  assert.match(uiSource, /get9RoundInterviewAutomationStatus/);
  assert.match(uiSource, /preview9RoundInterviewDraft/);
  assert.match(uiSource, /create9RoundInterviewDraft/);
  assert.match(uiSource, /9round\.ariosoga@gmail\.com/);
  assert.match(uiSource, /メールは自動送信されていません/);
  assert.match(uiSource, /previewSignature = "";\s*requestId = makeRequestId_\(\)/);
  assert.match(uiSource, /document\.addEventListener\("DOMContentLoaded", boot_/);
  assert.match(addonSource, /admin-9round-interview\.js\?v=20260919-interview-draft-v1/);
});
