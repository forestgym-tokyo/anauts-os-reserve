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

function buildRound9InterviewCandidates_(shiftRows, busyRows, startDate, endDate, limit) {
  const windowStart = round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_START);
  const windowEnd = round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_END);
  const minimum = ROUND9_INTERVIEW_CONFIG.INTERVIEW_MINUTES;
  const shiftsByDate = {};
  const busyByDate = {};

  (shiftRows || []).forEach(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    if (!date || date < startDate || date > endDate) return;
    if (String(row && row.staff_code || "").trim().toUpperCase() !== ROUND9_INTERVIEW_CONFIG.STAFF_CODE) return;
    if (String(row && row.store_code || "").trim().toUpperCase() !== ROUND9_INTERVIEW_CONFIG.STORE_CODE) return;
    if (!isRound9InterviewActive_(row && row.active)) return;

    const start = Math.max(
      windowStart,
      round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.start_time))
    );
    const end = Math.min(
      windowEnd,
      round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.end_time))
    );
    if (!isFinite(start) || !isFinite(end) || end - start < minimum) return;
    if (!shiftsByDate[date]) shiftsByDate[date] = [];
    shiftsByDate[date].push([start, end]);
  });

  (busyRows || []).forEach(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    if (!date || date < startDate || date > endDate) return;
    const start = round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.start_time));
    const end = round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.end_time), true);
    if (!isFinite(start) || !isFinite(end) || end <= start) return;
    if (!busyByDate[date]) busyByDate[date] = [];
    busyByDate[date].push([start, end]);
  });

  const candidates = [];
  Object.keys(shiftsByDate).sort().some(function(date) {
    const free = subtractRound9InterviewIntervals_(
      mergeRound9InterviewIntervals_(shiftsByDate[date]),
      mergeRound9InterviewIntervals_(busyByDate[date] || [])
    ).map(roundRound9InterviewIntervalInward_).filter(function(interval) {
      return interval[1] - interval[0] >= minimum;
    });

    if (!free.length) return false;
    const selected = free.slice().sort(function(a, b) {
      const durationDifference = (b[1] - b[0]) - (a[1] - a[0]);
      return durationDifference || a[0] - b[0];
    })[0];

    candidates.push({
      date: date,
      start_time: round9InterviewMinutesToTime_(selected[0]),
      end_time: round9InterviewMinutesToTime_(selected[1]),
      label:
        formatRound9InterviewDateLabel_(date) + " " +
        round9InterviewMinutesToTime_(selected[0]) + "～" +
        round9InterviewMinutesToTime_(selected[1]),
      available_windows: free.map(function(interval) {
        return {
          start_time: round9InterviewMinutesToTime_(interval[0]),
          end_time: round9InterviewMinutesToTime_(interval[1])
        };
      })
    });

    return candidates.length >= Number(limit || ROUND9_INTERVIEW_CONFIG.CANDIDATE_DAYS);
  });

  return candidates;
}

function assertRound9InterviewCandidatesAvailable_(candidates) {
  const dates = candidates.map(function(row) { return row.date; }).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const shifts = readRound9InterviewShiftRows_(startDate, endDate);
  const busyRows = readRound9InterviewBusyRows_(startDate, endDate);
  const freeByDate = {};

  buildRound9InterviewAllFreeWindows_(shifts, busyRows, startDate, endDate)
    .forEach(function(row) {
      if (!freeByDate[row.date]) freeByDate[row.date] = [];
      freeByDate[row.date].push([
        round9InterviewTimeToMinutes_(row.start_time),
        round9InterviewTimeToMinutes_(row.end_time)
      ]);
    });

  candidates.forEach(function(candidate) {
    const start = round9InterviewTimeToMinutes_(candidate.start_time);
    const end = round9InterviewTimeToMinutes_(candidate.end_time);
    const available = (freeByDate[candidate.date] || []).some(function(interval) {
      return interval[0] <= start && end <= interval[1];
    });
    if (!available) {
      throw new Error(
        formatRound9InterviewDateLabel_(candidate.date) + " " +
        candidate.start_time + "～" + candidate.end_time +
        "は、現在の勤務シフトまたは予定と一致しません。候補を再取得してください。"
      );
    }
  });
}

function buildRound9InterviewAllFreeWindows_(shiftRows, busyRows, startDate, endDate) {
  const output = [];
  const windowStart = round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_START);
  const windowEnd = round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_END);
  const minimum = ROUND9_INTERVIEW_CONFIG.INTERVIEW_MINUTES;
  const shiftsByDate = {};
  const busyByDate = {};

  (shiftRows || []).forEach(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    if (!date || date < startDate || date > endDate) return;
    if (String(row && row.staff_code || "").trim().toUpperCase() !== ROUND9_INTERVIEW_CONFIG.STAFF_CODE) return;
    if (String(row && row.store_code || "").trim().toUpperCase() !== ROUND9_INTERVIEW_CONFIG.STORE_CODE) return;
    if (!isRound9InterviewActive_(row && row.active)) return;
    const start = Math.max(windowStart, round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.start_time)));
    const end = Math.min(windowEnd, round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.end_time)));
    if (!isFinite(start) || !isFinite(end) || end - start < minimum) return;
    if (!shiftsByDate[date]) shiftsByDate[date] = [];
    shiftsByDate[date].push([start, end]);
  });

  (busyRows || []).forEach(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    const start = round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row && row.start_time));
    const end = round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row && row.end_time), true);
    if (!date || !isFinite(start) || !isFinite(end) || end <= start) return;
    if (!busyByDate[date]) busyByDate[date] = [];
    busyByDate[date].push([start, end]);
  });

  Object.keys(shiftsByDate).sort().forEach(function(date) {
    subtractRound9InterviewIntervals_(
      mergeRound9InterviewIntervals_(shiftsByDate[date]),
      mergeRound9InterviewIntervals_(busyByDate[date] || [])
    ).map(roundRound9InterviewIntervalInward_).forEach(function(interval) {
      if (interval[1] - interval[0] < minimum) return;
      output.push({
        date: date,
        start_time: round9InterviewMinutesToTime_(interval[0]),
        end_time: round9InterviewMinutesToTime_(interval[1])
      });
    });
  });

  return output;
}

function mergeRound9InterviewIntervals_(intervals) {
  const sorted = (intervals || []).filter(function(row) {
    return Array.isArray(row) && isFinite(row[0]) && isFinite(row[1]) && row[1] > row[0];
  }).sort(function(a, b) {
    return a[0] - b[0] || a[1] - b[1];
  });
  const merged = [];
  sorted.forEach(function(interval) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) {
      merged.push([interval[0], interval[1]]);
      return;
    }
    last[1] = Math.max(last[1], interval[1]);
  });
  return merged;
}

function subtractRound9InterviewIntervals_(sourceIntervals, busyIntervals) {
  let remaining = (sourceIntervals || []).map(function(row) { return row.slice(); });
  (busyIntervals || []).forEach(function(busy) {
    const next = [];
    remaining.forEach(function(source) {
      if (busy[1] <= source[0] || busy[0] >= source[1]) {
        next.push(source);
        return;
      }
      if (busy[0] > source[0]) next.push([source[0], Math.min(busy[0], source[1])]);
      if (busy[1] < source[1]) next.push([Math.max(busy[1], source[0]), source[1]]);
    });
    remaining = next;
  });
  return remaining;
}

function roundRound9InterviewIntervalInward_(interval) {
  const step = ROUND9_INTERVIEW_CONFIG.SLOT_MINUTES;
  return [
    Math.ceil(Number(interval[0]) / step) * step,
    Math.floor(Number(interval[1]) / step) * step
  ];
}

function readRound9InterviewShiftRows_(startDate, endDate) {
  let rows = [];
  if (typeof readStoreAwareSheet_ === "function") {
    rows = readStoreAwareSheet_("staff_shifts") || [];
  } else {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("staff_shifts");
    if (!sheet || sheet.getLastRow() < 2) return [];
    const values = sheet.getDataRange().getValues();
    const headers = values.shift().map(function(value) { return String(value || "").trim(); });
    rows = values.map(function(valueRow) {
      const record = {};
      headers.forEach(function(header, index) { if (header) record[header] = valueRow[index]; });
      return record;
    });
  }

  return rows.filter(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    return date >= startDate && date <= endDate;
  });
}

function readRound9InterviewBusyRows_(startDate, endDate) {
  const props = PropertiesService.getScriptProperties();
  const configuredId = String(
    props.getProperty(ROUND9_INTERVIEW_CONFIG.BUSY_CALENDAR_ID_PROPERTY) || ""
  ).trim();
  const calendar = configuredId
    ? CalendarApp.getCalendarById(configuredId)
    : CalendarApp.getDefaultCalendar();
  if (!calendar) throw new Error("面接候補の照合用カレンダーを確認できません。");

  const rangeStart = round9InterviewDateAtMinutes_(startDate, 0);
  const rangeEnd = round9InterviewDateAtMinutes_(addRound9InterviewDays_(endDate, 1), 0);
  const events = calendar.getEvents(rangeStart, rangeEnd) || [];
  const dates = round9InterviewDateRange_(startDate, endDate);
  const rows = [];

  events.forEach(function(event) {
    try {
      if (typeof event.getTransparency === "function") {
        const transparency = String(event.getTransparency() || "").toUpperCase();
        if (transparency.indexOf("TRANSPARENT") >= 0) return;
      }
    } catch (_) {}

    const eventStart = event.getStartTime();
    const eventEnd = event.getEndTime();
    if (!(eventStart instanceof Date) || !(eventEnd instanceof Date) || eventEnd <= eventStart) return;

    dates.forEach(function(date) {
      const dayStart = round9InterviewDateAtMinutes_(date, 0);
      const dayEnd = round9InterviewDateAtMinutes_(addRound9InterviewDays_(date, 1), 0);
      const overlapStart = new Date(Math.max(eventStart.getTime(), dayStart.getTime()));
      const overlapEnd = new Date(Math.min(eventEnd.getTime(), dayEnd.getTime()));
      if (overlapEnd <= overlapStart) return;
      rows.push({
        date: date,
        start_time: overlapStart.getTime() === dayStart.getTime()
          ? "00:00"
          : Utilities.formatDate(overlapStart, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "HH:mm"),
        end_time: overlapEnd.getTime() === dayEnd.getTime()
          ? "24:00"
          : Utilities.formatDate(overlapEnd, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "HH:mm")
      });
    });
  });

  return rows;
}

function normalizeRound9InterviewCandidates_(value) {
  if (!Array.isArray(value) || value.length !== ROUND9_INTERVIEW_CONFIG.CANDIDATE_DAYS) {
    throw new Error("面接候補は4日分すべて入力してください。");
  }
  const today = round9InterviewToday_();
  const seen = {};
  return value.map(function(row, index) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    const start = normalizeRound9InterviewTime_(row && row.start_time);
    const end = normalizeRound9InterviewTime_(row && row.end_time);
    const startMinutes = round9InterviewTimeToMinutes_(start);
    const endMinutes = round9InterviewTimeToMinutes_(end);

    if (!date || date < today) throw new Error("候補" + (index + 1) + "の日付を確認してください。");
    if (seen[date]) throw new Error("面接候補は4つの異なる日付で指定してください。");
    seen[date] = true;
    if (!isFinite(startMinutes) || !isFinite(endMinutes) || endMinutes <= startMinutes) {
      throw new Error("候補" + (index + 1) + "の時間を確認してください。");
    }
    if (
      startMinutes < round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_START) ||
      endMinutes > round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_END)
    ) {
      throw new Error("面接候補は11:00〜20:00の範囲で指定してください。");
    }
    if (endMinutes - startMinutes < ROUND9_INTERVIEW_CONFIG.INTERVIEW_MINUTES) {
      throw new Error("各候補には30分以上の時間を確保してください。");
    }
    return { date: date, start_time: start, end_time: end };
  }).sort(function(a, b) {
    return a.date.localeCompare(b.date);
  });
}

function normalizeRound9InterviewDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "yyyy-MM-dd");
  }
  const text = String(value == null ? "" : value).trim();
  const match = text.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const normalized = [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
    ? normalized
    : "";
}

function normalizeRound9InterviewTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "HH:mm");
  }
  const text = String(value == null ? "" : value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) return "24:00";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function round9InterviewTimeToMinutes_(value, allowEndOfDay) {
  const text = String(value || "");
  if (allowEndOfDay && text === "24:00") return 1440;
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return NaN;
  return hour * 60 + minute;
}

function round9InterviewMinutesToTime_(minutes) {
  const value = Math.max(0, Math.min(1440, Number(minutes)));
  if (value === 1440) return "24:00";
  return String(Math.floor(value / 60)).padStart(2, "0") + ":" +
    String(value % 60).padStart(2, "0");
}

function round9InterviewToday_() {
  return Utilities.formatDate(new Date(), ROUND9_INTERVIEW_CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function addRound9InterviewDays_(date, days) {
  const parts = String(date || "").split("-").map(Number);
  const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return [
    String(parsed.getUTCFullYear()).padStart(4, "0"),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function round9InterviewDateRange_(startDate, endDate) {
  const dates = [];
  let date = startDate;
  let guard = 0;
  while (date <= endDate && guard < 370) {
    dates.push(date);
    date = addRound9InterviewDays_(date, 1);
    guard += 1;
  }
  return dates;
}

function round9InterviewDateAtMinutes_(date, minutes) {
  const value = Number(minutes || 0);
  const base = Utilities.parseDate(date, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "yyyy-MM-dd");
  return new Date(base.getTime() + value * 60000);
}

function formatRound9InterviewDateLabel_(date) {
  const parts = String(date || "").split("-").map(Number);
  const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return parts[1] + "月" + parts[2] + "日" +
    "（" + weekdays[parsed.getUTCDay()] + "）";
}

function normalizeRound9InterviewName_(value) {
  return String(value == null ? "" : value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\s　]+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeRound9InterviewEmail_(value) {
  return String(value == null ? "" : value).trim().toLowerCase().slice(0, 254);
}

function isRound9InterviewEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function normalizeRound9InterviewRequestId_(value) {
  const text = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{12,100}$/.test(text)) return text;
  return Utilities.getUuid().replace(/-/g, "");
}

function isRound9InterviewActive_(value) {
  if (value === false) return false;
  const text = String(value == null ? "TRUE" : value).trim().toUpperCase();
  return !["FALSE", "0", "NO", "OFF", "INACTIVE"].includes(text);
}
