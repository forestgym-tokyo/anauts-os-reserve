/**
 * The Forest Gym 精算承認 Web App 用エントリポイント。
 * 独立したGASプロジェクトとしてデプロイする場合に使用する。
 */
function doGet(){
  return ContentService.createTextOutput(JSON.stringify({ok:true,app:"TFG Settlement Approval"})).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e){
  try{
    const body=e&&e.postData&&e.postData.contents?JSON.parse(e.postData.contents):{};
    return tfgSettlementDoPost_(body);
  }catch(error){
    return tfgSettlementJson_({ok:false,code:"API_ERROR",message:error&&error.message?error.message:"処理中にエラーが発生しました。"});
  }
}
