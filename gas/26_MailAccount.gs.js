/**
 * メールアカウント一覧取得
 */
function getMailAccounts() {

  const accounts = getSheetData(
    APP_CONFIG.SHEETS.MAIL_ACCOUNTS
  );

  return successResponse(
    accounts.filter(account => account.active === true)
  );

}