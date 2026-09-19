/**
 * ============================================================
 * 9ROUND アリオ蘇我店 ONLINE面接案内 下書きサービス
 * ============================================================
 *
 * 9round.ariosoga@gmail.com が所有し、「自分として実行」する
 * 専用のスタンドアロンGAS Webアプリとしてデプロイする。
 */

const ROUND9_INTERVIEW_DRAFT_CONFIG = Object.freeze({
  SENDER_EMAIL: "9round.ariosoga@gmail.com",
  SECRET_PROPERTY: "ROUND9_INTERVIEW_DRAFT_SECRET",
  CACHE_PREFIX: "round9-interview-draft-v1:"
});

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || "health").trim();

  if (action !== "health") {
    return round9InterviewDraftJson_({
      ok: false,
      code: "ACTION_NOT_FOUND",
      message: "指定されたactionは存在しません。"
    });
  }

  return round9InterviewDraftJson_({
    ok: true,
    data: {
      appName: "9ROUND ONLINE面接案内 下書きサービス",
      store: "9ROUND アリオ蘇我店",
      status: "ok",
      sender: ROUND9_INTERVIEW_DRAFT_CONFIG.SENDER_EMAIL
    }
  });
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};
    const action = String(body.action || "").trim();

    if (action !== "create9RoundInterviewDraft") {
      return round9InterviewDraftJson_({
        ok: false,
        code: "ACTION_NOT_FOUND",
        message: "指定されたactionは存在しません。"
      });
    }

    return round9InterviewDraftJson_(
      create9RoundInterviewDraftFromService_(body)
    );
  } catch (error) {
    console.error("9ROUND interview draft service", error);
    return round9InterviewDraftJson_({
      ok: false,
      code: "ROUND9_INTERVIEW_DRAFT_ERROR",
      message: error && error.message
        ? error.message
        : "9ROUND面接メール下書きサービスでエラーが発生しました。"
    });
  }
}

function round9InterviewDraftJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function create9RoundInterviewDraftFromService_(body) {
  body = body || {};
  assert9RoundInterviewDraftSecret_(body.secret);
  assert9RoundInterviewDraftOwner_();

  const requestId = String(body.requestId || "").trim();
  const to = String(body.to || "").trim().toLowerCase();
  const applicantName = String(body.applicantName || "").replace(/[\r\n\t]+/g, " ").trim();
  const subject = String(body.subject || "").replace(/[\r\n]+/g, " ").trim();
  const messageBody = String(body.body || "").trim();

  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) {
    throw new Error("下書き作成リクエストIDが不正です。");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("応募者のメールアドレスを確認してください。");
  }
  if (!applicantName || applicantName.length > 80) {
    throw new Error("応募者氏名を確認してください。");
  }
  if (!subject || subject.length > 200 || !messageBody || messageBody.length > 10000) {
    throw new Error("面接案内メールの内容を確認してください。");
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = ROUND9_INTERVIEW_DRAFT_CONFIG.CACHE_PREFIX + requestId;
  const cached = cache.get(cacheKey);
  if (cached) {
    const previous = JSON.parse(cached);
    return {
      ok: true,
      draftId: previous.draftId || "",
      messageId: previous.messageId || "",
      duplicate: true,
      sender: ROUND9_INTERVIEW_DRAFT_CONFIG.SENDER_EMAIL
    };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const afterLock = cache.get(cacheKey);
    if (afterLock) {
      const previous = JSON.parse(afterLock);
      return {
        ok: true,
        draftId: previous.draftId || "",
        messageId: previous.messageId || "",
        duplicate: true,
        sender: ROUND9_INTERVIEW_DRAFT_CONFIG.SENDER_EMAIL
      };
    }

    const draft = GmailApp.createDraft(to, subject, messageBody, {
      name: "9ROUND アリオ蘇我店",
      replyTo: ROUND9_INTERVIEW_DRAFT_CONFIG.SENDER_EMAIL
    });
    const result = {
      draftId: String(typeof draft.getId === "function" ? draft.getId() : ""),
      messageId: String(draft.getMessage().getId() || "")
    };
    cache.put(cacheKey, JSON.stringify(result), 21600);

    return {
      ok: true,
      draftId: result.draftId,
      messageId: result.messageId,
      duplicate: false,
      sender: ROUND9_INTERVIEW_DRAFT_CONFIG.SENDER_EMAIL
    };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function setup9RoundInterviewDraftService() {
  assert9RoundInterviewDraftOwner_();
  const props = PropertiesService.getScriptProperties();
  let secret = String(props.getProperty(ROUND9_INTERVIEW_DRAFT_CONFIG.SECRET_PROPERTY) || "").trim();
  if (secret.length < 32) {
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + "|" + Utilities.getUuid() + "|" + new Date().toISOString(),
      Utilities.Charset.UTF_8
    );
    secret = bytes.map(function(value) {
      return ("0" + ((value + 256) % 256).toString(16)).slice(-2);
    }).join("");
    props.setProperty(ROUND9_INTERVIEW_DRAFT_CONFIG.SECRET_PROPERTY, secret);
  }
  return {
    ok: true,
    sender: ROUND9_INTERVIEW_DRAFT_CONFIG.SENDER_EMAIL,
    sharedSecret: secret
  };
}

function assert9RoundInterviewDraftSecret_(provided) {
  const expected = String(
    PropertiesService.getScriptProperties().getProperty(
      ROUND9_INTERVIEW_DRAFT_CONFIG.SECRET_PROPERTY
    ) || ""
  ).trim();
  const actual = String(provided || "").trim();
  if (!expected || actual !== expected) {
    throw new Error("9ROUND面接メール下書きサービスの認証に失敗しました。");
  }
}

function assert9RoundInterviewDraftOwner_() {
  const effectiveEmail = String(Session.getEffectiveUser().getEmail() || "")
    .trim()
    .toLowerCase();
  if (effectiveEmail !== ROUND9_INTERVIEW_DRAFT_CONFIG.SENDER_EMAIL) {
    throw new Error(
      "この下書きサービスは " + ROUND9_INTERVIEW_DRAFT_CONFIG.SENDER_EMAIL +
      " のアカウントで実行してください。現在：" + (effectiveEmail || "取得不可")
    );
  }
}
