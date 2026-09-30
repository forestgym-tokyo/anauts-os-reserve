/**
 * 店舗一覧取得
 */
function getStores() {

  const stores = getSheetData(
    APP_CONFIG.SHEETS.STORES
  );

  const result = stores.filter(store =>
    normalizeStoreBoolean_(store.active)
  );

  return successResponse(result);
}


/**
 * TRUE / FALSE 正規化
 */
function normalizeStoreBoolean_(value) {

  if (value === true) {
    return true;
  }

  const text = String(
    value === null || value === undefined
      ? ""
      : value
  )
    .trim()
    .toUpperCase();

  return (
    text === "TRUE" ||
    text === "1" ||
    text === "YES" ||
    text === "ON"
  );
}