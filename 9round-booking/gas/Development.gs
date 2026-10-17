/**
 * Guarded development bootstrap, selected from the Apps Script editor.
 * Before running, set ROUND9_BOOKING_TEST_EMAILS to ONE address you control.
 * Always creates new synthetic-data spreadsheets; never copies live member data.
 */
function initialize9RoundBookingDevelopment() {
  // Visible in the Apps Script editor's Run menu. The helper rejects production
  // and any previously configured project, including calls from an HTML client.
  return initialize9RoundBookingDevelopment_();
}

function initialize9RoundBookingDevelopment_() {
  const props = PropertiesService.getScriptProperties();
  const p = props.getProperties();
  if (p.ROUND9_BOOKING_ENV === "production") throw new Error("本番設定では開発初期化できません。");
  if (p.ROUND9_BOOKING_SPREADSHEET_ID || p.ROUND9_BOOKING_MEMBER_MASTER_ID || p.ROUND9_BOOKING_STAFF_DIRECTORY_ID) {
    throw new Error("既存の接続先があります。再初期化は行いません。");
  }
  const emails = String(p.ROUND9_BOOKING_TEST_EMAILS || "").split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (emails.length !== 1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emails[0])) {
    throw new Error("ROUND9_BOOKING_TEST_EMAILSに、ご自身が受信できるテストメールを1件設定してください。");
  }
  props.setProperties({ ROUND9_BOOKING_ENABLED: "false", ROUND9_BOOKING_ENV: "development" });
  const data = SpreadsheetApp.create("9ROUND Booking DEV - Reservations");
  // Persist each new ID immediately so a partial initialization cannot overwrite it.
  props.setProperty("ROUND9_BOOKING_SPREADSHEET_ID", data.getId());
  const master = SpreadsheetApp.create("9ROUND Booking DEV - Test Members");
  props.setProperty("ROUND9_BOOKING_MEMBER_MASTER_ID", master.getId());
  const members = master.getSheets()[0];
  members.setName("TestMembers");
  members.getRange(1, 1, 2, 4).setNumberFormat("@").setValues([
    ["会員番号", "名前", "メールアドレス", "会員ステータス"],
    ["9000000", "開発テスト会員", emails[0], "ok"]
  ]);
  const directory = SpreadsheetApp.create("9ROUND Booking DEV - Test Staff");
  props.setProperty("ROUND9_BOOKING_STAFF_DIRECTORY_ID", directory.getId());
  const access = directory.getSheets()[0];
  access.setName("auth_users");
  access.getRange(1, 1, 2, 4).setNumberFormat("@").setValues([
    ["email", "staff_code", "permission", "active"],
    [emails[0], "DEV_ADMIN", "ADMIN", "true"]
  ]);
  directory.insertSheet("staff").getRange(1, 1, 2, 4).setValues([
    ["staff_code", "store_code", "active", "can_9round"],
    ["DEV_ADMIN", "SOGA", "true", "true"]
  ]);
  props.setProperties({
    ROUND9_BOOKING_MEMBER_MASTER_SHEET: "TestMembers",
    ROUND9_BOOKING_SECRET: nrBookingOpaque_(),
    ROUND9_BOOKING_DAYS: "30",
    ROUND9_BOOKING_ENABLED: "true"
  });
  setup9RoundBookingStorage_();
  // Test fixtures and links only; never log secrets, codes, or tokens.
  console.log(JSON.stringify({ environment: "development", reservationData: data.getUrl(),
    testMembers: master.getUrl(), testStaff: directory.getUrl(), emailSent: false }));
}

/** Add only missing dedicated tables; preserve all existing test bookings. */
function upgrade9RoundBookingDevelopment() {
  const config = nrBookingConfig_();
  if (config.environment !== "development") throw new Error("開発用の更新は本番環境では実行できません。");
  setup9RoundBookingStorage_();
  nrBookingNotificationConfig_(config);
  console.log(JSON.stringify({ environment: "development", upgraded: true, existingBookingsPreserved: true, emailSent: false }));
}
