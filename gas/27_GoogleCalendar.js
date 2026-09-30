/**
 * Googleカレンダー接続テスト
 *
 * Apps Scriptエディタから直接実行する。
 */
function testCalendarConnection() {

  const calendarCode = "TFG_MAIN";

  const calendarMaster = getCalendarMasterByCode_(calendarCode);

  const calendar = getGoogleCalendarById_(
    calendarMaster.calendar_id
  );

  if (!calendar) {
    throw new Error(
      `Googleカレンダーに接続できません: ${calendarMaster.calendar_id}`
    );
  }

  console.log({
    calendar_code: calendarCode,
    calendar_id: calendarMaster.calendar_id,
    calendar_name: calendar.getName(),
    timezone: calendar.getTimeZone()
  });
}


/**
 * Googleカレンダーの予定取得API
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function getCalendarEvents(params) {

  params = params || {};

  const calendarCode =
    params.calendar_code || "TFG_MAIN";

  const targetDate =
    params.date || Utilities.formatDate(
      new Date(),
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );

  const calendarMaster =
    getCalendarMasterByCode_(calendarCode);

  const calendar = getGoogleCalendarById_(
    calendarMaster.calendar_id
  );

  if (!calendar) {
    throw new Error(
      `Googleカレンダーに接続できません: ${calendarMaster.calendar_id}`
    );
  }

  const startDate = parseDateStart_(targetDate);
  const endDate = new Date(startDate);

  endDate.setDate(endDate.getDate() + 1);

  const events = calendar.getEvents(
    startDate,
    endDate
  );

  const result = events.map(event => ({
    event_id: event.getId(),
    title: event.getTitle(),
    start_at: formatDateTime_(event.getStartTime()),
    end_at: formatDateTime_(event.getEndTime()),
    all_day: event.isAllDayEvent(),
    location: event.getLocation() || "",
    description: event.getDescription() || ""
  }));

  return successResponse({
    calendar_code: calendarCode,
    calendar_id: calendarMaster.calendar_id,
    calendar_name: calendar.getName(),
    date: targetDate,
    event_count: result.length,
    events: result
  });
}


/**
 * calendarsシートからカレンダーマスターを取得
 *
 * @param {string} calendarCode
 * @returns {Object}
 */
function getCalendarMasterByCode_(calendarCode) {

  const calendars = getSheetData(
    APP_CONFIG.SHEETS.CALENDARS
  );

  const calendarMaster = calendars.find(calendar =>
    calendar.calendar_code === calendarCode &&
    calendar.active === true
  );

  if (!calendarMaster) {
    throw new Error(
      `有効なカレンダー設定が見つかりません: ${calendarCode}`
    );
  }

  if (!calendarMaster.calendar_id) {
    throw new Error(
      `calendar_idが設定されていません: ${calendarCode}`
    );
  }

  return calendarMaster;
}


/**
 * Googleカレンダーを取得
 *
 * calendar_idがprimaryの場合はデフォルトカレンダーを使用する。
 *
 * @param {string} calendarId
 * @returns {GoogleAppsScript.Calendar.Calendar}
 */
function getGoogleCalendarById_(calendarId) {

  if (calendarId === "primary") {
    return CalendarApp.getDefaultCalendar();
  }

  return CalendarApp.getCalendarById(calendarId);
}


/**
 * yyyy-MM-ddをその日の00:00に変換
 *
 * @param {string} dateText
 * @returns {Date}
 */
function parseDateStart_(dateText) {

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new Error(
      `日付形式が正しくありません: ${dateText}`
    );
  }

  const parts = dateText.split("-");

  const date = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2]),
    0,
    0,
    0,
    0
  );

  if (isNaN(date.getTime())) {
    throw new Error(
      `日付を変換できません: ${dateText}`
    );
  }

  return date;
}


/**
 * 日時をyyyy-MM-dd HH:mm形式へ変換
 *
 * @param {Date} value
 * @returns {string}
 */
function formatDateTime_(value) {

  return Utilities.formatDate(
    value,
    APP_CONFIG.TIMEZONE,
    "yyyy-MM-dd HH:mm"
  );
}
