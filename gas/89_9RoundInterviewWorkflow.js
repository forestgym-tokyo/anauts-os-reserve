/**
 * ============================================================
 * A-nauts OS Reserve
 * 9ROUND応募者 ONLINE面接案内
 * ============================================================
 *
 * A-nautsの川上一郎（KAWAKAMI）のYACHIYO勤務シフトから、
 * 11:00〜20:00の範囲にある空き時間を4日分抽出する。
 * 既定カレンダーの予定と重なる時間は候補から除外する。
 *
 * メールはこのGASから送信しない。9round.ariosoga@gmail.com を
 * 実行ユーザーとする専用GASへ転送し、Gmail下書きだけを作成する。
 */

const ROUND9_INTERVIEW_CONFIG = Object.freeze({
  TIMEZONE: "Asia/Tokyo",
  STAFF_CODE: "KAWAKAMI",
  STORE_CODE: "YACHIYO",
  WINDOW_START: "11:00",
  WINDOW_END: "20:00",
  INTERVIEW_MINUTES: 30,
  SLOT_MINUTES: 15,
  CANDIDATE_DAYS: 4,
  SEARCH_DAYS: 62,
  DRAFT_SERVICE_URL_PROPERTY: "ROUND9_INTERVIEW_DRAFT_SERVICE_URL",
  DRAFT_SERVICE_SECRET_PROPERTY: "ROUND9_INTERVIEW_DRAFT_SECRET",
  BUSY_CALENDAR_ID_PROPERTY: "ROUND9_INTERVIEW_BUSY_CALENDAR_ID",
  AUTOMATION_STARTED_AT_PROPERTY: "ROUND9_INTERVIEW_AUTOMATION_STARTED_AT",
  AUTOMATION_HANDLER: "process9RoundIndeedApplications",
  INDEED_SUBJECT_PREFIX: "[新しい応募者のお知らせ]",
  INDEED_JOB_KEYWORD: "ボクササイズスタジオのスタッフ",
  PROCESSED_LABEL: "A-nauts/9ROUND面接下書き作成済み",
  REVIEW_LABEL: "A-nauts/9ROUND面接下書き要確認",
  LOG_SHEET_NAME: "round9_interview_draft_log",
  DEFAULT_DRAFT_SERVICE_URL:
    "https://script.google.com/macros/s/AKfycbyT8G6rQ-9LFosbFlzSYj4OM0PrCG_KD7bddVxQ65RLMkfYrjmBZ2ebCvL54ncGJSZ2/exec"
});

function get9RoundInterviewCandidates(params) {
  params = params || {};
  requireAuth_(params, ["ADMIN", "MANAGER"]);

  const today = round9InterviewToday_();
  const defaultStart = addRound9InterviewDays_(today, 1);
  const startDate = normalizeRound9InterviewDate_(params.start_date || defaultStart);

  if (!startDate) throw new Error("候補開始日を確認してください。");
  if (startDate < today) throw new Error("候補開始日は本日以降を指定してください。");

  const endDate = addRound9InterviewDays_(
    startDate,
    ROUND9_INTERVIEW_CONFIG.SEARCH_DAYS - 1
  );
  const shifts = readRound9InterviewShiftRows_(startDate, endDate);
  const busyRows = readRound9InterviewBusyRows_(startDate, endDate);
  const candidates = buildRound9InterviewCandidates_(
    shifts,
    busyRows,
    startDate,
    endDate,
    ROUND9_INTERVIEW_CONFIG.CANDIDATE_DAYS
  );

  return successResponse({
    candidates: candidates,
    count: candidates.length,
    required_count: ROUND9_INTERVIEW_CONFIG.CANDIDATE_DAYS,
    start_date: startDate,
    end_date: endDate,
    staff_code: ROUND9_INTERVIEW_CONFIG.STAFF_CODE,
    store_code: ROUND9_INTERVIEW_CONFIG.STORE_CODE,
    allowed_time: {
      start: ROUND9_INTERVIEW_CONFIG.WINDOW_START,
      end: ROUND9_INTERVIEW_CONFIG.WINDOW_END
    },
    interview_minutes: ROUND9_INTERVIEW_CONFIG.INTERVIEW_MINUTES,
    warning: candidates.length < ROUND9_INTERVIEW_CONFIG.CANDIDATE_DAYS
      ? "勤務シフトと既存予定から4日分を確保できませんでした。候補開始日を変更するか、シフトを確認してください。"
      : ""
  });
}

function preview9RoundInterviewDraft(body) {
  body = body || {};
  requireAuth_(body, ["ADMIN", "MANAGER"]);

  const draft = prepare9RoundInterviewDraft_(body, true);
  return successResponse({
    to: draft.to,
    applicant_name: draft.applicantName,
    subject: draft.subject,
    body: draft.body,
    candidates: draft.candidates,
    sender: "9round.ariosoga@gmail.com",
    automatic_send: false
  });
}

function create9RoundInterviewDraft(body) {
  body = body || {};
  requireAuth_(body, ["ADMIN", "MANAGER"]);

  const draft = prepare9RoundInterviewDraft_(body, true);
  const requestId = normalizeRound9InterviewRequestId_(body.request_id);
  const result = sendRound9InterviewDraftToService_(draft, requestId);

  return successResponse({
    draft_id: String(result.draftId || ""),
    message_id: String(result.messageId || ""),
    duplicate: result.duplicate === true,
    to: draft.to,
    applicant_name: draft.applicantName,
    sender: "9round.ariosoga@gmail.com",
    subject: draft.subject,
    automatic_send: false
  });
}

function sendRound9InterviewDraftToService_(draft, requestId) {
  const props = PropertiesService.getScriptProperties();
  const serviceUrl = String(
    props.getProperty(ROUND9_INTERVIEW_CONFIG.DRAFT_SERVICE_URL_PROPERTY) ||
    ROUND9_INTERVIEW_CONFIG.DEFAULT_DRAFT_SERVICE_URL
  ).trim();
  const secret = String(
    props.getProperty(ROUND9_INTERVIEW_CONFIG.DRAFT_SERVICE_SECRET_PROPERTY) || ""
  ).trim();

  if (!serviceUrl || !secret) {
    throw new Error(
      "9ROUND面接メール下書きサービスの接続設定がありません。管理者へ連絡してください。"
    );
  }

  const response = UrlFetchApp.fetch(serviceUrl, {
    method: "post",
    contentType: "application/json; charset=utf-8",
    payload: JSON.stringify({
      action: "create9RoundInterviewDraft",
      secret: secret,
      requestId: requestId,
      to: draft.to,
      applicantName: draft.applicantName,
      subject: draft.subject,
      body: draft.body
    }),
    muteHttpExceptions: true,
    followRedirects: true
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  let result;
  try {
    result = JSON.parse(text || "{}");
  } catch (_) {
    throw new Error(
      "9ROUND面接メール下書きサービスから正しい応答を取得できませんでした。HTTP " + status
    );
  }

  if (status < 200 || status >= 300 || !result.ok) {
    throw new Error(
      result && result.message
        ? result.message
        : "9ROUND面接メール下書きサービスでエラーが発生しました。HTTP " + status
    );
  }
  return result;
}

function configure9RoundInterviewDraftService(serviceUrl, sharedSecret) {
  const url = String(serviceUrl || ROUND9_INTERVIEW_CONFIG.DEFAULT_DRAFT_SERVICE_URL).trim();
  const secret = String(sharedSecret || "").trim();

  if (!/^https:\/\/script\.google\.com\/(?:a\/[^/]+\/)?macros\/s\/[^/]+\/exec$/.test(url)) {
    throw new Error("9ROUND側GASのWebアプリURLを確認してください。");
  }
  if (secret.length < 32) {
    throw new Error("共有シークレットは32文字以上で設定してください。");
  }

  PropertiesService.getScriptProperties().setProperties({
    ROUND9_INTERVIEW_DRAFT_SERVICE_URL: url,
    ROUND9_INTERVIEW_DRAFT_SECRET: secret
  });

  return {
    ok: true,
    serviceUrl: url,
    secretConfigured: true
  };
}

function setup9RoundIndeedAutomation() {
  const effectiveEmail = String(Session.getEffectiveUser().getEmail() || "")
    .trim()
    .toLowerCase();
  if (effectiveEmail !== "info@theforestgym.com") {
    throw new Error(
      "Indeed応募通知の自動処理は info@theforestgym.com のGASから設定してください。現在：" +
      (effectiveEmail || "取得不可")
    );
  }

  const props = PropertiesService.getScriptProperties();
  if (!String(
    props.getProperty(ROUND9_INTERVIEW_CONFIG.DRAFT_SERVICE_SECRET_PROPERTY) || ""
  ).trim()) {
    throw new Error("先に9ROUND面接メール下書きサービスの共有シークレットを設定してください。");
  }

  getOrCreateRound9InterviewLabel_(ROUND9_INTERVIEW_CONFIG.PROCESSED_LABEL);
  getOrCreateRound9InterviewLabel_(ROUND9_INTERVIEW_CONFIG.REVIEW_LABEL);
  getRound9InterviewLogSheet_();

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === ROUND9_INTERVIEW_CONFIG.AUTOMATION_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger(ROUND9_INTERVIEW_CONFIG.AUTOMATION_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();

  const startedAt = new Date();
  props.setProperty(
    ROUND9_INTERVIEW_CONFIG.AUTOMATION_STARTED_AT_PROPERTY,
    String(startedAt.getTime())
  );

  return {
    ok: true,
    account: effectiveEmail,
    intervalMinutes: 5,
    startedAt: Utilities.formatDate(
      startedAt,
      ROUND9_INTERVIEW_CONFIG.TIMEZONE,
      "yyyy/MM/dd HH:mm:ss"
    ),
    processedLabel: ROUND9_INTERVIEW_CONFIG.PROCESSED_LABEL,
    reviewLabel: ROUND9_INTERVIEW_CONFIG.REVIEW_LABEL
  };
}

function get9RoundInterviewAutomationStatus(params) {
  params = params || {};
  requireAuth_(params, ["ADMIN", "MANAGER"]);
  const startedAtMillis = Number(
    PropertiesService.getScriptProperties().getProperty(
      ROUND9_INTERVIEW_CONFIG.AUTOMATION_STARTED_AT_PROPERTY
    ) || 0
  );
  const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === ROUND9_INTERVIEW_CONFIG.AUTOMATION_HANDLER;
  });
  return successResponse({
    enabled: triggers.length > 0 && startedAtMillis > 0,
    interval_minutes: 5,
    started_at: startedAtMillis
      ? Utilities.formatDate(
          new Date(startedAtMillis),
          ROUND9_INTERVIEW_CONFIG.TIMEZONE,
          "yyyy/MM/dd HH:mm:ss"
        )
      : "",
    source_account: "info@theforestgym.com",
    source_domain: "@indeedemail.com",
    draft_account: "9round.ariosoga@gmail.com",
    automatic_send: false
  });
}

function process9RoundIndeedApplications() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: true, skipped: true, reason: "already_running" };

  const summary = { scanned: 0, created: 0, failed: 0, skipped: 0 };
  try {
    const props = PropertiesService.getScriptProperties();
    const startedAtMillis = Number(
      props.getProperty(ROUND9_INTERVIEW_CONFIG.AUTOMATION_STARTED_AT_PROPERTY) || 0
    );
    if (!startedAtMillis) {
      throw new Error("Indeed応募通知の自動処理がセットアップされていません。");
    }

    const processedLabel = getOrCreateRound9InterviewLabel_(
      ROUND9_INTERVIEW_CONFIG.PROCESSED_LABEL
    );
    const reviewLabel = getOrCreateRound9InterviewLabel_(
      ROUND9_INTERVIEW_CONFIG.REVIEW_LABEL
    );
    const query = [
      "from:(indeedemail.com)",
      'subject:"' + ROUND9_INTERVIEW_CONFIG.INDEED_SUBJECT_PREFIX + '"',
      '"' + ROUND9_INTERVIEW_CONFIG.INDEED_JOB_KEYWORD + '"',
      '-label:"' + ROUND9_INTERVIEW_CONFIG.PROCESSED_LABEL + '"',
      '-label:"' + ROUND9_INTERVIEW_CONFIG.REVIEW_LABEL + '"',
      "newer_than:14d",
      "-in:spam",
      "-in:trash"
    ].join(" ");
    const threads = GmailApp.search(query, 0, 50) || [];

    threads.forEach(function(thread) {
      thread.getMessages().forEach(function(message) {
        if (message.getDate().getTime() <= startedAtMillis) {
          summary.skipped += 1;
          return;
        }
        if (!isRound9IndeedApplicationMessage_(message)) {
          summary.skipped += 1;
          return;
        }

        summary.scanned += 1;
        let application = null;
        try {
          application = parseRound9IndeedApplication_(message);
          const candidates = getRound9InterviewAutomaticCandidates_();
          if (candidates.length !== ROUND9_INTERVIEW_CONFIG.CANDIDATE_DAYS) {
            throw new Error(
              "勤務シフトと既存予定から面接候補を4日分確保できませんでした。"
            );
          }
          const draft = prepare9RoundInterviewDraft_({
            applicant_name: application.applicantName,
            email: application.email,
            candidates: candidates
          }, false);
          const requestId = "indeed_" + String(message.getId() || "").replace(/[^A-Za-z0-9_-]/g, "");
          const result = sendRound9InterviewDraftToService_(draft, requestId);

          thread.addLabel(processedLabel);
          appendRound9InterviewLog_({
            sourceMessageId: message.getId(),
            receivedAt: message.getDate(),
            applicantName: application.applicantName,
            applicantEmail: application.email,
            status: result.duplicate === true ? "DRAFT_ALREADY_CREATED" : "DRAFT_CREATED",
            draftId: result.draftId || "",
            draftMessageId: result.messageId || "",
            candidates: candidates,
            error: ""
          });
          summary.created += 1;
        } catch (error) {
          thread.addLabel(reviewLabel);
          appendRound9InterviewLog_({
            sourceMessageId: message.getId(),
            receivedAt: message.getDate(),
            applicantName: application ? application.applicantName : "",
            applicantEmail: application ? application.email : "",
            status: "REVIEW_REQUIRED",
            draftId: "",
            draftMessageId: "",
            candidates: [],
            error: error && error.message ? error.message : "自動下書きを作成できませんでした。"
          });
          summary.failed += 1;
        }
      });
    });

    return Object.assign({ ok: true }, summary);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function getRound9InterviewAutomaticCandidates_() {
  const startDate = addRound9InterviewDays_(round9InterviewToday_(), 1);
  const endDate = addRound9InterviewDays_(
    startDate,
    ROUND9_INTERVIEW_CONFIG.SEARCH_DAYS - 1
  );
  return buildRound9InterviewCandidates_(
    readRound9InterviewShiftRows_(startDate, endDate),
    readRound9InterviewBusyRows_(startDate, endDate),
    startDate,
    endDate,
    ROUND9_INTERVIEW_CONFIG.CANDIDATE_DAYS
  ).map(function(candidate) {
    return {
      date: candidate.date,
      start_time: candidate.start_time,
      end_time: candidate.end_time
    };
  });
}

function isRound9IndeedApplicationMessage_(message) {
  const subject = String(message && message.getSubject() || "").trim();
  const from = String(message && message.getFrom() || "").trim().toLowerCase();
  const contentType = String(
    message && typeof message.getHeader === "function"
      ? message.getHeader("X-Indeed-Content-Type")
      : ""
  ).trim();
  return from.indexOf("@indeedemail.com") >= 0 &&
    subject.indexOf(ROUND9_INTERVIEW_CONFIG.INDEED_SUBJECT_PREFIX) >= 0 &&
    subject.indexOf(ROUND9_INTERVIEW_CONFIG.INDEED_JOB_KEYWORD) >= 0 &&
    contentType === "bundled_application_email_jp_individual";
}

function parseRound9IndeedApplication_(message) {
  const subject = String(message.getSubject() || "").trim();
  const from = String(message.getFrom() || "").trim();
  const emailMatch = from.match(/<?([^<>\s]+@indeedemail\.com)>?/i);
  if (!emailMatch) throw new Error("Indeed応募者の返信先メールアドレスを確認できませんでした。");

  let name = "";
  const subjectPattern = new RegExp(
    "\\]\\s*(.+?)さんが" + ROUND9_INTERVIEW_CONFIG.INDEED_JOB_KEYWORD
  );
  const subjectMatch = subject.match(subjectPattern);
  if (subjectMatch) name = subjectMatch[1];
  if (!name) {
    name = from.replace(/<[^>]+>/g, "").replace(/^\"|\"$/g, "").trim();
  }
  name = normalizeRound9InterviewName_(name);
  if (!name) throw new Error("Indeed応募者の氏名を確認できませんでした。");

  return {
    applicantName: name,
    email: normalizeRound9InterviewEmail_(emailMatch[1]),
    sourceMessageId: String(message.getId() || "")
  };
}

function getOrCreateRound9InterviewLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function getRound9InterviewLogSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(ROUND9_INTERVIEW_CONFIG.LOG_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(ROUND9_INTERVIEW_CONFIG.LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, 10).setValues([[
      "processed_at",
      "source_message_id",
      "received_at",
      "applicant_name",
      "applicant_email",
      "status",
      "gmail_draft_id",
      "gmail_message_id",
      "candidates",
      "error"
    ]]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendRound9InterviewLog_(entry) {
  entry = entry || {};
  const candidates = (entry.candidates || []).map(function(candidate) {
    return candidate.date + " " + candidate.start_time + "～" + candidate.end_time;
  }).join(" / ");
  getRound9InterviewLogSheet_().appendRow([
    new Date(),
    String(entry.sourceMessageId || ""),
    entry.receivedAt || "",
    String(entry.applicantName || ""),
    String(entry.applicantEmail || ""),
    String(entry.status || ""),
    String(entry.draftId || ""),
    String(entry.draftMessageId || ""),
    candidates,
    String(entry.error || "")
  ]);
}

function prepare9RoundInterviewDraft_(body, verifyAvailability) {
  const applicantName = normalizeRound9InterviewName_(body.applicant_name);
  const email = normalizeRound9InterviewEmail_(body.email);
  const candidates = normalizeRound9InterviewCandidates_(body.candidates);

  if (!applicantName) throw new Error("応募者氏名を入力してください。");
  if (!isRound9InterviewEmail_(email)) {
    throw new Error("応募者のメールアドレスを確認してください。");
  }
  if (verifyAvailability !== false) {
    assertRound9InterviewCandidatesAvailable_(candidates);
  }

  return {
    applicantName: applicantName,
    to: email,
    candidates: candidates,
    subject: "【9ROUND アリオ蘇我店】ONLINE面接のご案内",
    body: build9RoundInterviewDraftBody_(applicantName, candidates)
  };
}

function build9RoundInterviewDraftBody_(applicantName, candidates) {
  const marks = ["①", "②", "③", "④"];
  const lines = [
    applicantName + " 様",
    "",
    "この度は、9ROUNDアリオ蘇我店のスタッフ募集にご応募いただき、ありがとうございます。",
    "",
    "早速ですが、ONLINE面接の日程を調整させていただきたく存じます。",
    "以下の候補日時より、ご都合のよい日時をご指定ください。",
    ""
  ];

  candidates.forEach(function(candidate, index) {
    lines.push(
      marks[index] +
      formatRound9InterviewDateLabel_(candidate.date) +
      " " + candidate.start_time + "～" + candidate.end_time
    );
  });

  return lines.concat([
    "",
    "面接時間は30分程度です。",
    "上記でご都合がつかない場合は、別の候補日をいくつかお知らせください。",
    "日程が決まりましたら、ONLINE面接用のURLをお送りします。",
    "",
    "よろしくお願いいたします。",
    "",
    "9ROUND アリオ蘇我店"
  ]).join("\n");
}

