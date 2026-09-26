/**
 * A-nauts OS Reserve / The Forest Gym
 * 精算内容の会員承認
 * 管理側で精算スナップショットを作成し、会員本人の端末で承認する。
 */
const TFG_SETTLEMENT_CONFIG=Object.freeze({
  TIMEZONE:"Asia/Tokyo",
  SHEET_NAME:"精算承認",
  TOKEN_TTL_DAYS:7,
  ADMIN_EMAIL:"info@theforestgym.com"
});

function tfgSettlementDoPost_(body){
  const action=String((body&&body.action)||"").trim();
  switch(action){
    case "getTfgSettlement": return getTfgSettlement_(body);
    case "approveTfgSettlement": return approveTfgSettlement_(body);
    case "createTfgSettlement": return createTfgSettlement_(body);
    default:return tfgSettlementJson_({ok:false,code:"ACTION_NOT_FOUND",message:"指定されたactionは存在しません。"});
  }
}

/**
 * 管理側から呼び出す。
 * body: memberNo, memberName, email, withdrawalDate, items[], approvalBaseUrl
 * items: [{target,label,paid,normal,settlement,note}]
 */
function createTfgSettlement_(body){
  try{
    const memberNo=String(body.memberNo||"").replace(/\D/g,"");
    const memberName=String(body.memberName||"").trim();
    const email=String(body.email||"").trim().toLowerCase();
    const withdrawalDate=String(body.withdrawalDate||"").trim();
    const items=Array.isArray(body.items)?body.items:[];
    if(!memberNo||!memberName||!/^\S+@\S+\.\S+$/.test(email)||!items.length)throw new Error("会員番号・氏名・メール・精算明細が必要です。");
    const normalized=items.map(function(x){return{target:String(x.target||""),label:String(x.label||""),paid:Number(x.paid||0),normal:Number(x.normal||0),settlement:Number(x.settlement||0),note:String(x.note||"")};});
    const total=normalized.reduce(function(s,x){return s+x.settlement},0);
    if(total<0)throw new Error("精算金額が不正です。");
    const token=Utilities.getUuid()+Utilities.getUuid().replace(/-/g,"");
    const tokenHash=tfgSettlementHash_(token);
    const id="TFG-ST-"+Utilities.formatDate(new Date(),TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyyMMdd-HHmmss")+"-"+Math.floor(Math.random()*10000).toString().padStart(4,"0");
    const now=new Date(), expires=new Date(now.getTime()+TFG_SETTLEMENT_CONFIG.TOKEN_TTL_DAYS*86400000);
    const sh=getTfgSettlementSheet_();
    sh.appendRow([id,Utilities.formatDate(now,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss"),memberNo,memberName,email,withdrawalDate,JSON.stringify(normalized),total,tokenHash,Utilities.formatDate(expires,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss"),"PENDING","","","",""]);
    const base=String(body.approvalBaseUrl||"").trim();
    const approvalUrl=base?(base+(base.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(token)):"";
    return tfgSettlementJson_({ok:true,data:{settlementId:id,total:total,approvalUrl:approvalUrl,expiresAt:Utilities.formatDate(expires,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss")}});
  }catch(e){return tfgSettlementJson_({ok:false,code:"CREATE_ERROR",message:e.message||"精算承認データを作成できませんでした。"});}
}

function getTfgSettlement_(body){
  try{
    const row=findTfgSettlementByToken_(body&&body.token);
    if(!row)throw new Error("この承認URLは無効です。");
    if(row.status!=="APPROVED" && new Date(row.expiresAt).getTime()<Date.now())throw new Error("この承認URLの有効期限が切れています。");
    return tfgSettlementJson_({ok:true,data:{settlementId:row.id,memberName:row.memberName,withdrawalDate:row.withdrawalDate,items:row.items,total:row.total,status:row.status,approvedAt:row.approvedAt}});
  }catch(e){return tfgSettlementJson_({ok:false,code:"GET_ERROR",message:e.message||"精算内容を取得できませんでした。"});}
}

function approveTfgSettlement_(body){
  const lock=LockService.getScriptLock(); let locked=false;
  try{
    if(body.consent1!==true||body.consent2!==true||body.consent3!==true)throw new Error("確認事項3項目すべてへの同意が必要です。");
    const memberNo=String(body.memberNo||"").replace(/\D/g,"");
    const email=String(body.email||"").trim().toLowerCase();
    lock.waitLock(10000);locked=true;
    const row=findTfgSettlementByToken_(body&&body.token);
    if(!row)throw new Error("この承認URLは無効です。");
    if(row.status==="APPROVED")return tfgSettlementJson_({ok:true,data:{approvedAt:row.approvedAt,alreadyApproved:true}});
    if(new Date(row.expiresAt).getTime()<Date.now())throw new Error("この承認URLの有効期限が切れています。");
    if(memberNo!==row.memberNo||email!==row.email)throw new Error("会員番号または登録メールアドレスが一致しません。");
    const now=Utilities.formatDate(new Date(),TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss");
    const sh=getTfgSettlementSheet_();
    sh.getRange(row.row,11,1,5).setValues([["APPROVED",now,memberNo,email,"本人端末WEB承認"]]);
    lock.releaseLock();locked=false;
    try{MailApp.sendEmail({to:TFG_SETTLEMENT_CONFIG.ADMIN_EMAIL,subject:"【精算承認済み】"+row.memberName+" 様",body:[row.memberName+" 様の精算内容が会員端末から承認されました。","", "精算ID："+row.id,"会員番号："+row.memberNo,"精算金額："+Number(row.total).toLocaleString("ja-JP")+"円","承認日時："+now].join("\n"),name:"The Forest Gym"});}catch(mailError){console.error(mailError);}
    return tfgSettlementJson_({ok:true,data:{approvedAt:now}});
  }catch(e){if(locked){try{lock.releaseLock()}catch(_){}}return tfgSettlementJson_({ok:false,code:"APPROVE_ERROR",message:e.message||"承認処理に失敗しました。"});}
}

function getTfgSettlementSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error("会員マスターのスプレッドシートに紐づいたApps Scriptで使用してください。");
  let sh=ss.getSheetByName(TFG_SETTLEMENT_CONFIG.SHEET_NAME);
  if(!sh)sh=ss.insertSheet(TFG_SETTLEMENT_CONFIG.SHEET_NAME);
  if(sh.getLastRow()===0){sh.appendRow(["精算ID","作成日時","会員番号","氏名","登録メール","退会予定","明細JSON","精算合計","トークンHASH","有効期限","ステータス","承認日時","承認会員番号","承認メール","承認方法"]);sh.setFrozenRows(1);}
  return sh;
}
function findTfgSettlementByToken_(token){
  token=String(token||"").trim();if(!token)return null;
  const hash=tfgSettlementHash_(token),sh=getTfgSettlementSheet_(),v=sh.getDataRange().getDisplayValues();
  for(let i=1;i<v.length;i++){if(v[i][8]===hash)return{row:i+1,id:v[i][0],memberNo:v[i][2],memberName:v[i][3],email:String(v[i][4]||"").toLowerCase(),withdrawalDate:v[i][5],items:JSON.parse(v[i][6]||"[]"),total:Number(v[i][7]||0),expiresAt:v[i][9],status:v[i][10],approvedAt:v[i][11]};}
  return null;
}
function tfgSettlementHash_(s){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s));return bytes.map(function(b){return("0"+((b+256)%256).toString(16)).slice(-2)}).join("");}
function tfgSettlementJson_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
