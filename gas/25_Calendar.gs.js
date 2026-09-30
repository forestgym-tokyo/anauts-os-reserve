/**
 * カレンダー一覧取得
 */
function getCalendars() {

  const calendars = getSheetData(
    APP_CONFIG.SHEETS.CALENDARS
  );

  return successResponse(
    calendars.filter(calendar => calendar.active === true)
  );

}