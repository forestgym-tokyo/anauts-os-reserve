/**
 * 9ROUND_Member 専用のコンテナバインド Apps Script。
 * A-nauts OS Reserve の Web App と同じ「休会URL発行」シートに記録する。
 * このファイルは gas/ の clasp 対象に含めない。
 */
var ROUND9_MEMBER_MENU_CONFIG = Object.freeze({
  spreadsheetId: "1TT7TMIsHn8HXZCL6R0MyM6mOgx2kW9JRYghxC8JYemQ",
  masterSheet: "9ROUND_Member",
  tokenSheet: "休会URL発行",
  publicUrl: "https://forestgym-tokyo.github.io/anauts-os-reserve/9round-suspension/",
  replyTo: "9round.ariosoga@gmail.com",
  timezone: "Asia/Tokyo",
  ttlHours: 72
});

function add9RoundSuspensionMenu() {
  SpreadsheetApp.getUi()
    .createMenu("9ROUND休会届")
    .addItem("選択会員へ休会URLをメール送信", "send9RoundSuspensionUrlForSelectedRow")
    .addToUi();
}

/** 最初の1回だけ実行。既存の onOpen 関数と衝突しない開封トリガーを設置する。 */
function install9RoundSuspensionMenu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== ROUND9_MEMBER_MENU_CONFIG.spreadsheetId) {
    throw new Error("9ROUND_Member のスプレッドシートに紐づく Apps Script から実行してください。");
  }
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === "add9RoundSuspensionMenu";
  });
  if (!exists) {
    ScriptApp.newTrigger("add9RoundSuspensionMenu").forSpreadsheet(ss).onOpen().create();
  }
  return exists ? "設置済みです。シートを再読み込みしてください。" : "設置しました。シートを再読み込みしてください。";
}

function send9RoundSuspensionUrlForSelectedRow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== ROUND9_MEMBER_MENU_CONFIG.spreadsheetId) {
    throw new Error("9ROUND_Member のスプレッドシートから実行してください。");
  }

  var master = ss.getSheetByName(ROUND9_MEMBER_MENU_CONFIG.masterSheet);
  var selected = ss.getActiveRange();
  if (!master || !selected || selected.getSheet().getSheetId() !== master.getSheetId() || selected.getRow() < 2) {
    throw new Error("9ROUND_Member タブで対象会員の行を選択してください。");
  }

  var headers = master.getRange(1, 1, 1, master.getLastColumn())
    .getDisplayValues()[0].map(function(value) { return String(value).trim(); });
  var row = master.getRange(selected.getRow(), 1, 1, master.getLastColumn()).getDisplayValues()[0];
  function field(label) {
    var index = headers.indexOf(label);
    if (index < 0) throw new Error("会員マスターに「" + label + "」列がありません。");
    return String(row[index] || "").trim();
  }

  var member = {
    no: field("会員番号"),
    name: field("名前"),
    status: field("会員ステータス"),
    email: field("メールアドレス").toLowerCase()
  };
  if (!member.no || !member.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) {
    throw new Error("選択会員の会員番号・氏名・登録メールアドレスを確認してください。");
  }
  if (["ok", "kyukai", "契約中", "休会中"].indexOf(member.status.toLowerCase()) < 0) {
    throw new Error("現在の会員ステータスでは休会URLを発行できません。");
  }

  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    "9ROUND休会URLの送信確認",
    member.name + " 様（" + member.no + "）の登録メールアドレス\n" +
      member.email + "\nへ72時間有効の専用URLを送信します。",
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  var log = ss.getSheetByName(ROUND9_MEMBER_MENU_CONFIG.tokenSheet);
  if (!log) throw new Error("休会URL発行タブが見つかりません。送信を中止しました。");
  var expected = ["発行ID", "発行日時", "有効期限", "会員番号", "氏名", "メールアドレス", "トークンハッシュ", "ステータス", "使用日時", "備考"];
  var actual = log.getRange(1, 1, 1, expected.length).getDisplayValues()[0]
    .map(function(value) { return String(value).trim(); });
  if (expected.some(function(value, index) { return actual[index] !== value; })) {
    throw new Error("休会URL発行タブの列構成が想定と異なります。送信を中止しました。");
  }

  var lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    var now = new Date();
    var expiresAt = new Date(now.getTime() + ROUND9_MEMBER_MENU_CONFIG.ttlHours * 60 * 60 * 1000);
    var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").toLowerCase();
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8);
    var tokenHash = digest.map(function(byte) {
      return ("0" + (byte < 0 ? byte + 256 : byte).toString(16)).slice(-2);
    }).join("");
    var issueId = "9RU-" + Utilities.formatDate(now, ROUND9_MEMBER_MENU_CONFIG.timezone, "yyyyMMdd-HHmmss") +
      "-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    var url = ROUND9_MEMBER_MENU_CONFIG.publicUrl + "?token=" + token;

    // 送信失敗時は旧URLを有効のまま残し、新URLだけを無効にする。
    var oldRows = log.getLastRow() > 1
      ? log.getRange(2, 4, log.getLastRow() - 1, 5).getDisplayValues()
      : [];
    log.appendRow([issueId, now, expiresAt, member.no, member.name, member.email, tokenHash, "有効", "", ""]);
    var newRow = log.getLastRow();
    log.getRange(newRow, 2, 1, 2).setNumberFormat("yyyy/mm/dd hh:mm:ss");

    try {
      send9RoundSuspensionUrlEmail_(member, url, expiresAt);
    } catch (error) {
      log.getRange(newRow, 8).setValue("送信失敗");
      log.getRange(newRow, 10).setValue("メール送信失敗: " + error.message);
      throw error;
    }

    oldRows.forEach(function(oldRow, index) {
      if (String(oldRow[0]).trim() === member.no && String(oldRow[4]).trim() === "有効") {
        log.getRange(index + 2, 8).setValue("再発行により無効");
        log.getRange(index + 2, 10).setValue("新しい休会URLを発行したため無効化");
      }
    });
    log.getRange(newRow, 10).setValue("会員へ専用URLメール送信済");
  } finally {
    lock.releaseLock();
  }
  ui.alert(member.name + " 様の登録メールアドレスへ休会URLを送信しました。");
}

function send9RoundSuspensionUrlEmail_(member, url, expiresAt) {
  var expiry = Utilities.formatDate(expiresAt, ROUND9_MEMBER_MENU_CONFIG.timezone, "yyyy/MM/dd HH:mm");
  var body = [
    member.name + " 様", "", "9ROUND アリオ蘇我店でございます。",
    "休会申請用の会員様専用URLをお送りします。",
    "以下のURLより、有効期限までにお手続きください。", "",
    "▼休会申請URL", url, "", "URL有効期限：" + expiry, "",
    "※このURLは会員様専用です。第三者への転送・共有はお控えください。",
    "※申請完了後、このURLは使用できなくなります。",
    "※有効期限を過ぎた場合は、新しいURLの発行が必要です。", "",
    "9ROUND アリオ蘇我店"
  ].join("\n");
  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var html = '<div style="font-family:sans-serif;line-height:1.8">' +
    '<p>' + escapeHtml(member.name) + ' 様</p>' +
    '<p>9ROUND アリオ蘇我店でございます。<br>休会申請用の会員様専用URLをお送りします。</p>' +
    '<p><a href="' + escapeHtml(url) + '">休会申請を行う</a></p>' +
    '<p>URL有効期限：' + escapeHtml(expiry) + '</p>' +
    '<p>※このURLは会員様専用です。第三者への転送・共有はお控えください。<br>' +
    '※申請完了後、このURLは使用できなくなります。</p>' +
    '<p>9ROUND アリオ蘇我店</p></div>';
  MailApp.sendEmail({
    to: member.email,
    subject: "【9ROUND アリオ蘇我店】休会申請のお手続き",
    body: body,
    htmlBody: html,
    name: "9ROUND アリオ蘇我店",
    replyTo: ROUND9_MEMBER_MENU_CONFIG.replyTo
  });
}
