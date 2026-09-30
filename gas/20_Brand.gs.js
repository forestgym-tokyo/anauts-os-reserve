/**
 * ブランド一覧取得
 */
function getBrands() {

  const brands = getSheetData(
    APP_CONFIG.SHEETS.BRANDS
  );

  return successResponse(
    brands.filter(brand => brand.active === true)
  );

}