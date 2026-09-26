/**
 * A-nauts OS Reserve / The Forest Gym
 * 精算内容の会員承認
 * 管理側で精算スナップショットを作成し、会員本人の端末で承認する。
 */
const TFG_SETTLEMENT_CONFIG=Object.freeze({
  TIMEZONE:"Asia/Tokyo",
  SHEET_NAME:"精算承認",
  ADMIN_EMAIL:"info@theforestgym.com",
  APPROVAL_BASE_URL:"https://forestgym-tokyo.github.io/anauts-os-reserve/settlement-approval/",
  BANK_NAME:"みずほ銀行",
  BANK_BRANCH:"新浦安支店",
  BANK_ACCOUNT_TYPE:"普通",
  BANK_ACCOUNT_NO:"1917298",
  BANK_ACCOUNT_NAME:"A-nauts株式会社"
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
    const paymentMethod=tfgSettlementNormalizePaymentMethod_(body.paymentMethod);
    if(!memberNo||!memberName||!/^\S+@\S+\.\S+$/.test(email)||!items.length)throw new Error("会員番号・氏名・メール・精算明細が必要です。");
    const now=new Date();
    const beforeFinalMonthCharge=tfgSettlementIsBeforeMonthlyCharge_(now);
    const normalized=items.map(function(x){
      const normal=Number(x.normal||0);
      let paid=Number(x.paid||0);
      let settlement=Number(x.settlement||0);
      const isFinalMonth=x.isFinalMonth===true||tfgSettlementIsWithdrawalMonth_(x.target,withdrawalDate);
      if(isFinalMonth&&beforeFinalMonthCharge){
        paid=0;
        settlement=Math.max(0,normal-paid);
      }
      return{target:String(x.target||""),label:String(x.label||""),paid:paid,normal:normal,settlement:settlement,note:String(x.note||""),isFinalMonth:isFinalMonth};
    });
    const total=normalized.reduce(function(s,x){return s+x.settlement},0);
    if(total<0)throw new Error("精算金額が不正です。");
    const token=Utilities.getUuid()+Utilities.getUuid().replace(/-/g,"");
    const tokenHash=tfgSettlementHash_(token);
    const id="TFG-ST-"+Utilities.formatDate(now,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyyMMdd-HHmmss")+"-"+Math.floor(Math.random()*10000).toString().padStart(4,"0");
    const expires=tfgSettlementNextExpiry_(now);
    const sh=getTfgSettlementSheet_();
    sh.appendRow([id,Utilities.formatDate(now,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss"),memberNo,memberName,email,withdrawalDate,JSON.stringify(normalized),total,tokenHash,Utilities.formatDate(expires,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss"),"PENDING","","","","",paymentMethod,tfgSettlementPaymentNote_(paymentMethod)]);
    const base=String(body.approvalBaseUrl||TFG_SETTLEMENT_CONFIG.APPROVAL_BASE_URL).trim();
    const approvalUrl=base+(base.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(token);
    try{
      MailApp.sendEmail({
        to:email,
        subject:"【The Forest Gym】退会に伴う精算内容のご確認",
        body:[
          memberName+" 様",
          "",
          "The Forest Gymでございます。",
          "退会に伴う精算内容をご確認いただくため、下記の専用URLへアクセスしてください。",
          "",
          approvalUrl,
          "",
          "会員番号とご登録メールアドレスをご入力のうえ、内容をご確認・承認してください。",
          "承認URLの有効期限："+Utilities.formatDate(expires,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy年M月d日 H:mm"),
          paymentMethod==="BANK_TRANSFER"?"お支払い方法：銀行振込":"お支払い方法：登録済み決済方法",
          "",
          paymentMethod==="BANK_TRANSFER"?"【お振込先】":"",
          paymentMethod==="BANK_TRANSFER"?(TFG_SETTLEMENT_CONFIG.BANK_NAME+" "+TFG_SETTLEMENT_CONFIG.BANK_BRANCH):"",
          paymentMethod==="BANK_TRANSFER"?(TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_TYPE+" "+TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NO):"",
          paymentMethod==="BANK_TRANSFER"?TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NAME:"",
          paymentMethod==="BANK_TRANSFER"?"※口座振替会員様は、承認後に上記口座へのお振込みが必要です。":"",
          "",
          "※精算内容に相違がある場合は承認せず、info@theforestgym.comまでお問い合わせください。",
          "",
          "The Forest Gym"
        ].join("\n"),
        name:"The Forest Gym",
        replyTo:TFG_SETTLEMENT_CONFIG.ADMIN_EMAIL
      });
    }catch(mailError){console.error("TFG settlement approval mail",mailError);}
    return tfgSettlementJson_({ok:true,data:{settlementId:id,total:total,approvalUrl:approvalUrl,expiresAt:Utilities.formatDate(expires,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss"),paymentMethod:paymentMethod}});
  }catch(e){return tfgSettlementJson_({ok:false,code:"CREATE_ERROR",message:e.message||"精算承認データを作成できませんでした。"});}
}

function getTfgSettlement_(body){
  try{
    const row=findTfgSettlementByToken_(body&&body.token);
    if(!row)throw new Error("この承認URLは無効です。");
    if(row.status!=="APPROVED" && tfgSettlementParseJst_(row.expiresAt).getTime()<Date.now())throw new Error("精算条件が更新されたため、この承認URLは無効になりました。最新の精算書をご確認ください。");
    return tfgSettlementJson_({ok:true,data:{settlementId:row.id,memberName:row.memberName,withdrawalDate:row.withdrawalDate,items:row.items,total:row.total,status:row.status,approvedAt:row.approvedAt,paymentMethod:row.paymentMethod,paymentNote:row.paymentNote,bank:row.paymentMethod==="BANK_TRANSFER"?{bankName:TFG_SETTLEMENT_CONFIG.BANK_NAME,branch:TFG_SETTLEMENT_CONFIG.BANK_BRANCH,accountType:TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_TYPE,accountNo:TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NO,accountName:TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NAME}:null}});
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
    if(tfgSettlementParseJst_(row.expiresAt).getTime()<Date.now())throw new Error("精算条件が更新されたため、この承認URLは無効になりました。最新の精算書をご確認ください。");
    if(memberNo!==row.memberNo||email!==row.email)throw new Error("会員番号または登録メールアドレスが一致しません。");
    const now=Utilities.formatDate(new Date(),TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss");
    const sh=getTfgSettlementSheet_();
    sh.getRange(row.row,11,1,5).setValues([["APPROVED",now,memberNo,email,"本人端末WEB承認"]]);
    lock.releaseLock();locked=false;
    try{MailApp.sendEmail({to:TFG_SETTLEMENT_CONFIG.ADMIN_EMAIL,subject:"【精算承認済み】"+row.memberName+" 様",body:[row.memberName+" 様の精算内容が会員端末から承認されました。","", "精算ID："+row.id,"会員番号："+row.memberNo,"精算金額："+Number(row.total).toLocaleString("ja-JP")+"円","支払方法："+tfgSettlementPaymentLabel_(row.paymentMethod),"承認日時："+now].join("\n"),name:"The Forest Gym"});}catch(mailError){console.error(mailError);}
    return tfgSettlementJson_({ok:true,data:{approvedAt:now}});
  }catch(e){if(locked){try{lock.releaseLock()}catch(_){}}return tfgSettlementJson_({ok:false,code:"APPROVE_ERROR",message:e.message||"承認処理に失敗しました。"});}
}

function getTfgSettlementSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error("会員マスターのスプレッドシートに紐づいたApps Scriptで使用してください。");
  let sh=ss.getSheetByName(TFG_SETTLEMENT_CONFIG.SHEET_NAME);
  if(!sh)sh=ss.insertSheet(TFG_SETTLEMENT_CONFIG.SHEET_NAME);
  const headers=["精算ID","作成日時","会員番号","氏名","登録メール","退会予定","明細JSON","精算合計","トークンHASH","有効期限","ステータス","承認日時","承認会員番号","承認メール","承認方法","支払方法","支払案内"];
  if(sh.getLastRow()===0){sh.appendRow(headers);sh.setFrozenRows(1);}
  else if(sh.getLastColumn()<headers.length){sh.getRange(1,1,1,headers.length).setValues([headers]);}
  return sh;
}
function findTfgSettlementByToken_(token){
  token=String(token||"").trim();if(!token)return null;
  const hash=tfgSettlementHash_(token),sh=getTfgSettlementSheet_(),v=sh.getDataRange().getDisplayValues();
  for(let i=1;i<v.length;i++){if(v[i][8]===hash)return{row:i+1,id:v[i][0],memberNo:v[i][2],memberName:v[i][3],email:String(v[i][4]||"").toLowerCase(),withdrawalDate:v[i][5],items:JSON.parse(v[i][6]||"[]"),total:Number(v[i][7]||0),expiresAt:v[i][9],status:v[i][10],approvedAt:v[i][11],paymentMethod:tfgSettlementNormalizePaymentMethod_(v[i][15]),paymentNote:String(v[i][16]||"")};}
  return null;
}

function tfgSettlementNormalizePaymentMethod_(value){
  const v=String(value||"CARD").trim().toUpperCase();
  if(["BANK_TRANSFER","BANK","口座振替","銀行振込"].indexOf(v)>=0)return "BANK_TRANSFER";
  return "CARD";
}
function tfgSettlementPaymentLabel_(value){
  return tfgSettlementNormalizePaymentMethod_(value)==="BANK_TRANSFER"?"銀行振込（口座振替会員）":"登録済み決済方法";
}
function tfgSettlementPaymentNote_(value){
  if(tfgSettlementNormalizePaymentMethod_(value)!=="BANK_TRANSFER")return "登録済み決済方法で精算";
  return TFG_SETTLEMENT_CONFIG.BANK_NAME+" "+TFG_SETTLEMENT_CONFIG.BANK_BRANCH+" "+TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_TYPE+" "+TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NO+" "+TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NAME;
}
function tfgSettlementJstParts_(date){
  return Utilities.formatDate(date,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy,M,d,H,m,s").split(",").map(Number);
}
function tfgSettlementIsBeforeMonthlyCharge_(date){
  const p=tfgSettlementJstParts_(date);
  return p[2]<=26;
}
function tfgSettlementIsWithdrawalMonth_(target,withdrawalDate){
  const d=String(withdrawalDate||"").match(/^(\d{4})-(\d{2})-/);
  if(!d)return false;
  const t=String(target||"").replace(/\s/g,"");
  const ym1=d[1]+"-"+d[2],ym2=d[1]+"年"+Number(d[2])+"月",ym3=d[1]+"/"+Number(d[2]);
  return t.indexOf(ym1)>=0||t.indexOf(ym2)>=0||t.indexOf(ym3)>=0;
}
function tfgSettlementNextExpiry_(now){
  const p=tfgSettlementJstParts_(now);
  const y=p[0],m=p[1],d=p[2],h=p[3],min=p[4],sec=p[5];
  const beforeNineCutoff=d<9||(d===9&&(h<20));
  if(beforeNineCutoff)return new Date(Date.UTC(y,m-1,9,11,0,0)); // JST 20:00
  if(d<=26)return new Date(Date.UTC(y,m-1,26,15,0,0)); // JST 27日 00:00
  const next=new Date(Date.UTC(y,m,1,0,0,0));
  return new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth(),9,11,0,0)); // 翌月9日 JST 20:00
}
function tfgSettlementParseJst_(value){
  const m=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if(!m)return new Date(value);
  return new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4])-9,Number(m[5]),Number(m[6])));
}

function tfgSettlementHash_(s){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s));return bytes.map(function(b){return("0"+((b+256)%256).toString(16)).slice(-2)}).join("");}
function tfgSettlementJson_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
