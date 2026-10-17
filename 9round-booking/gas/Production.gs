/** Editor provisioning helpers. Trailing underscores prevent HTML-service RPC. */
function nrBookingProductionTargets_() {
  return {
    masterId: "1TT7TMIsHn8HXZCL6R0MyM6mOgx2kW9JRYghxC8JYemQ", masterSheet: "9ROUND_Member",
    directoryId: "1YCMXS_ngE34QvZw0-P_sVuvteOjDmvbz7mAFH4W-jzA"
  };
}

function nrPrepare9RoundBookingProduction_() {
  const props = PropertiesService.getScriptProperties(), p = props.getProperties();
  if (p.ROUND9_BOOKING_ENV === "production") throw new Error("本番設定済みです。再初期化はしません。");
  const target = nrBookingProductionTargets_();
  const members = nrBookingMembers_(target);
  const directory = SpreadsheetApp.openById(target.directoryId);
  const access = nrBookingDirectoryRows_(directory, "auth_users", ["email", "staff_code", "permission", "active"]);
  nrBookingDirectoryRows_(directory, "staff", ["staff_code", "store_code", "active"]);
  if (!members.some(function (m) { return m.active; }) || !access.some(function (r) { return nrBookingStaffBoolean_(r.active); })) {
    throw new Error("有効な会員・スタッフの接続を確認してください。");
  }
  if (!p.ROUND9_BOOKING_FIREBASE_API_KEY || String(p.ROUND9_BOOKING_SECRET || "").length < 32) {
    throw new Error("既存の認証設定が未完了です。");
  }
  return nrBookingLocked_(function () {
    let id = props.getProperty("ROUND9_BOOKING_PRODUCTION_SPREADSHEET_ID");
    if (!id) {
      const created = SpreadsheetApp.create("9ROUND Booking - Production Reservations");
      id = created.getId();
      props.setProperty("ROUND9_BOOKING_PRODUCTION_SPREADSHEET_ID", id);
    }
    if ([target.masterId, target.directoryId, p.ROUND9_BOOKING_SPREADSHEET_ID].indexOf(id) >= 0) {
      throw new Error("本番予約データには新しい専用シートが必要です。");
    }
    const data = SpreadsheetApp.openById(id);
    Object.keys(NR_BOOKING.tables).forEach(function (key) {
      const name = "nr_" + key, headers = NR_BOOKING.tables[key];
      let sheet = data.getSheetByName(name);
      if (!sheet) {
        sheet = data.insertSheet(name);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]); sheet.setFrozenRows(1);
      }
      const actual = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
      if (actual.length !== headers.length || headers.some(function (h, i) { return actual[i] !== h; })) {
        throw new Error("本番予約データの列構成を確認してください。");
      }
    });
    props.setProperties({
      ROUND9_BOOKING_DEVELOPMENT_DATA_ID: p.ROUND9_BOOKING_SPREADSHEET_ID || "",
      ROUND9_BOOKING_DEVELOPMENT_MASTER_ID: p.ROUND9_BOOKING_MEMBER_MASTER_ID || "",
      ROUND9_BOOKING_DEVELOPMENT_STAFF_ID: p.ROUND9_BOOKING_STAFF_DIRECTORY_ID || "",
      ROUND9_BOOKING_ENABLED: "false", ROUND9_BOOKING_ENV: "production",
      ROUND9_BOOKING_SPREADSHEET_ID: id,
      ROUND9_BOOKING_MEMBER_MASTER_ID: target.masterId,
      ROUND9_BOOKING_MEMBER_MASTER_SHEET: target.masterSheet,
      ROUND9_BOOKING_STAFF_DIRECTORY_ID: target.directoryId,
      ROUND9_BOOKING_ADMIN_EMAILS: "info@theforestgym.com,9round.ariosoga@gmail.com"
    });
    const result = { environment: "production", prepared: true, enabled: false, reservationData: data.getUrl(),
      activeMembers: members.filter(function (m) { return m.active; }).length, originalDataPreserved: true };
    console.log(JSON.stringify(result)); return result;
  });
}

function nrActivate9RoundBookingProduction_() {
  const props = PropertiesService.getScriptProperties(), p = props.getProperties();
  const target = nrBookingProductionTargets_();
  const base = String(ScriptApp.getService().getUrl() || "");
  if (!/^https:\/\/script\.google\.com\/(?:macros\/s|a\/macros\/[^/]+\/s)\/[^/?]+\/exec$/.test(base)) {
    throw new Error("公開用のバージョン付きデプロイが必要です。");
  }
  if (p.ROUND9_BOOKING_ENV !== "production" || !p.ROUND9_BOOKING_PRODUCTION_SPREADSHEET_ID ||
      p.ROUND9_BOOKING_PRODUCTION_SPREADSHEET_ID !== p.ROUND9_BOOKING_SPREADSHEET_ID ||
      p.ROUND9_BOOKING_MEMBER_MASTER_ID !== target.masterId || p.ROUND9_BOOKING_STAFF_DIRECTORY_ID !== target.directoryId) {
    throw new Error("本番接続の準備が未完了です。");
  }
  return nrBookingLocked_(function () {
    props.setProperties({ ROUND9_BOOKING_ENABLED: "false", ROUND9_BOOKING_MEMBER_URL: base + "?page=member",
      ROUND9_BOOKING_STAFF_URL: base + "?page=staff" });
    try {
      props.setProperty("ROUND9_BOOKING_ENABLED", "true");
      const config = nrBookingConfig_();
      Object.keys(NR_BOOKING.tables).forEach(function (key) { nrBookingSheet_(config, key); });
      nrBookingNotificationConfig_(config);
      const result = { environment: "production", enabled: true, memberUrl: base + "?page=member", staffUrl: base + "?page=staff",
        activeMembers: nrBookingMembers_(config).filter(function (m) { return m.active; }).length, existingBookingsPreserved: true };
      console.log(JSON.stringify(result)); return result;
    } catch (error) { props.setProperty("ROUND9_BOOKING_ENABLED", "false"); throw error; }
  });
}
