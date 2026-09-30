/**
 * A-nauts OS Reserve / The Forest Gym
 * 精算内容の会員承認
 * 管理側で精算スナップショットを作成し、会員本人の端末で承認する。
 */
const TFG_SETTLEMENT_CONFIG=Object.freeze({
  TIMEZONE:"Asia/Tokyo",
  SHEET_NAME:"精算承認",
  ADMIN_EMAIL:"info@theforestgym.com",
  APPROVAL_BASE_URL:"https://forestgym-tokyo.github.io/anauts-os-reserve/settlement-approval/index.html",
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
    case "deferTfgSettlement": return deferTfgSettlement_(body);
    case "getTfgSettlementMember": return getTfgSettlementMember_(body);
    case "createTfgSettlement": return createTfgSettlement_(body);
    case "sendTfgSettlementApproval": return sendTfgSettlementApproval_(body);
    default:return tfgSettlementJson_({ok:false,code:"ACTION_NOT_FOUND",message:"指定されたactionは存在しません。"});
  }
}

/**
 * 管理画面の精算書作成で、会員番号から氏名・登録メールを取得する。
 * 99_Main.gs 側で ADMIN / MANAGER 認証を必須にする。
 */
function getTfgSettlementMember_(body){
  try{
    const memberNo=String((body&&body.memberNo)||"").replace(/\D/g,"");
    if(!/^\d{6}$/.test(memberNo))throw new Error("会員番号は6桁の数字で入力してください。");
    const member=findTfgSettlementMemberByNo_(memberNo);
    if(!member){
      return tfgSettlementJson_({
        ok:false,
        code:"MEMBER_NOT_FOUND",
        message:"該当する会員番号が会員マスターに見つかりません。"
      });
    }
    return tfgSettlementJson_({
      ok:true,
      data:{
        memberNo:member.memberNo,
        memberName:member.memberName,
        email:member.email
      }
    });
  }catch(e){
    return tfgSettlementJson_({
      ok:false,
      code:"MEMBER_LOOKUP_ERROR",
      message:e.message||"会員情報を取得できませんでした。"
    });
  }
}

function getTfgSettlementMemberMasterSpreadsheet_(){
  const props=PropertiesService.getScriptProperties();
  const configuredId=String(props.getProperty("TFG_MEMBER_MASTER_ID")||"").trim();
  if(configuredId){
    return SpreadsheetApp.openById(configuredId);
  }

  const files=DriveApp.getFilesByName("TFG_Master");
  while(files.hasNext()){
    const file=files.next();
    if(file.getMimeType()===MimeType.GOOGLE_SHEETS){
      return SpreadsheetApp.openById(file.getId());
    }
  }
  throw new Error("TFG_Master がGoogle Driveに見つかりません。");
}

function findTfgSettlementMemberByNo_(memberNo){
  const ss=getTfgSettlementMemberMasterSpreadsheet_();
  const props=PropertiesService.getScriptProperties();
  const configuredSheet=String(props.getProperty("TFG_MEMBER_MASTER_SHEET_NAME")||"master").trim();
  const sh=ss.getSheetByName(configuredSheet);
  if(!sh)throw new Error("TFG_Master の会員シート「"+configuredSheet+"」が見つかりません。");

  const lastRow=sh.getLastRow(),lastCol=sh.getLastColumn();
  if(lastRow<2||lastCol<2)return null;

  const headerScanRows=Math.min(5,lastRow);
  const head=sh.getRange(1,1,headerScanRows,lastCol).getDisplayValues();
  let headerRow=-1,cols=null;
  for(let r=0;r<head.length;r++){
    const detected=tfgSettlementDetectMemberColumns_(head[r]);
    if(detected.memberNo>=0&&detected.email>=0&&(detected.name>=0||(detected.lastName>=0&&detected.firstName>=0))){
      headerRow=r+1;
      cols=detected;
      break;
    }
  }
  if(headerRow<0)throw new Error("TFG_Master の見出し（memberNo / name / email）を確認できません。");

  const dataRows=lastRow-headerRow;
  if(dataRows<=0)return null;
  const values=sh.getRange(headerRow+1,1,dataRows,lastCol).getDisplayValues();
  for(let i=0;i<values.length;i++){
    const row=values[i];
    const rowMemberNo=String(row[cols.memberNo]||"").replace(/\D/g,"");
    if(rowMemberNo!==memberNo)continue;
    const email=String(row[cols.email]||"").trim().toLowerCase();
    let memberName=cols.name>=0?String(row[cols.name]||"").trim():"";
    if(!memberName){
      memberName=(String(row[cols.lastName]||"").trim()+" "+String(row[cols.firstName]||"").trim()).trim();
    }
    if(!memberName||!email)throw new Error("TFG_Master の氏名またはメールアドレスが未登録です。");
    return{memberNo:rowMemberNo,memberName:memberName,email:email};
  }
  return null;
}

function tfgSettlementDetectMemberColumns_(headers){
  const normalized=headers.map(tfgSettlementNormalizeHeader_);
  return{
    memberNo:tfgSettlementFindHeader_(normalized,["会員番号","会員no","会員id","memberno","membernumber"]),
    name:tfgSettlementFindHeader_(normalized,["氏名","名前","会員氏名","お名前","name"]),
    lastName:tfgSettlementFindHeader_(normalized,["氏名(姓)","姓","苗字","lastname","familyname"]),
    firstName:tfgSettlementFindHeader_(normalized,["氏名(名)","名","firstname","givenname"]),
    email:tfgSettlementFindHeader_(normalized,["メールアドレス","登録メールアドレス","メール","email","e-mail"])
  };
}
function tfgSettlementFindHeader_(headers,candidates){
  for(let i=0;i<candidates.length;i++){
    const idx=headers.indexOf(tfgSettlementNormalizeHeader_(candidates[i]));
    if(idx>=0)return idx;
  }
  return -1;
}
function tfgSettlementNormalizeHeader_(value){
  return String(value||"")
    .trim()
    .toLowerCase()
    .replace(/[\s　]/g,"")
    .replace(/[（）]/g,function(ch){return ch==="（"?"(":")";})
    .replace(/[._-]/g,"");
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
    const now=new Date();
    const withdrawalDate=tfgSettlementWithdrawalDate_(now);
    const items=Array.isArray(body.items)?body.items:[];
    const joinDate=String(body.joinDate||"").trim();
    const plan=String(body.plan||"").trim().toUpperCase();
    const legacyFlatPlan=joinDate&&joinDate<"2026-03-01"&&["DAY","NIGHT365"].indexOf(plan)>=0;
    const legacyNormalMonthly=plan==="NIGHT365"?3300:(plan==="DAY"?4180:0);
    const paymentMethod=tfgSettlementNormalizePaymentMethod_(body.paymentMethod);
    if(!/^\d{6}$/.test(memberNo))throw new Error("会員番号は6桁の数字で入力してください。");
    if(!memberName||!/^\S+@\S+\.\S+$/.test(email)||!items.length)throw new Error("氏名・メール・精算明細が必要です。");
    const beforeFinalMonthCharge=tfgSettlementIsBeforeMonthlyCharge_(now);
    const sourceItems=legacyFlatPlan
      ? items.filter(function(x){return String((x&&x.label)||"").trim()!=="選べる特典";})
      : items;
    const normalized=sourceItems.map(function(x){
      let normal=Number(x.normal||0);
      let paid=Number(x.paid||0);
      if(!Number.isFinite(normal)||!Number.isFinite(paid)||normal<0||paid<0)throw new Error("精算明細の金額が不正です。");
      let settlement=Math.max(0,normal-paid);
      const status=String(x.status||"").trim();
      const paymentSequence=x.paymentSequence==null?null:Number(x.paymentSequence);
      const isFinalMonth=x.isFinalMonth===true||tfgSettlementIsWithdrawalMonth_(x.target,withdrawalDate);
      if(status==="休会"){
        normal=550;
        paid=550;
        settlement=0;
      }else if(legacyFlatPlan&&String(x.label||"").trim()==="初月会費"){
        normal=paid;
        settlement=0;
      }else if(legacyFlatPlan&&String(x.label||"").trim()==="月会費"){
        normal=legacyNormalMonthly;
        settlement=0;
      }else if(paymentSequence!==null&&paymentSequence>12){
        settlement=0;
      }else if(isFinalMonth&&beforeFinalMonthCharge){
        paid=0;
        settlement=Math.max(0,normal);
      }
      return{target:String(x.target||""),label:String(x.label||""),paid:paid,normal:normal,settlement:settlement,note:String(x.note||""),status:status,paymentSequence:paymentSequence,isFinalMonth:isFinalMonth};
    });
    const total=normalized.reduce(function(s,x){return s+x.settlement},0);
    if(total<0)throw new Error("精算金額が不正です。");
    const token=Utilities.getUuid()+Utilities.getUuid().replace(/-/g,"");
    const tokenHash=tfgSettlementHash_(token);
    const id="TFG-ST-"+Utilities.formatDate(now,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyyMMdd-HHmmss")+"-"+Math.floor(Math.random()*10000).toString().padStart(4,"0");
    const expires=tfgSettlementNextExpiry_(now);
    const sh=getTfgSettlementSheet_();
    const createLock=LockService.getScriptLock();
    createLock.waitLock(10000);
    try{
      sh.appendRow([id,Utilities.formatDate(now,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss"),memberNo,memberName,email,withdrawalDate,JSON.stringify(normalized),total,tokenHash,Utilities.formatDate(expires,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss"),"DRAFT","","","","",paymentMethod,tfgSettlementPaymentNote_(paymentMethod)]);
      invalidatePreviousPendingTfgSettlements_(sh,memberNo,id);
    }finally{
      createLock.releaseLock();
    }
    const base=String(body.approvalBaseUrl||TFG_SETTLEMENT_CONFIG.APPROVAL_BASE_URL).trim();
    const approvalUrl=base+(base.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(token);
    return tfgSettlementJson_({ok:true,data:{settlementId:id,total:total,approvalUrl:approvalUrl,expiresAt:Utilities.formatDate(expires,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss"),paymentMethod:paymentMethod,status:"DRAFT"}});
  }catch(e){return tfgSettlementJson_({ok:false,code:"CREATE_ERROR",message:e.message||"精算承認データを作成できませんでした。"});}
}

function tfgSettlementCampaignProgress_(items,withdrawalDate){
  const rows=Array.isArray(items)?items:[];
  let first=null;
  for(let i=0;i<rows.length;i++){
    const row=rows[i]||{};
    if(String(row.label||"").trim()!=="初月会費")continue;
    const m=String(row.target||"").match(/(\d{4})年(\d{1,2})月/);
    if(m){first={year:Number(m[1]),month:Number(m[2])};break;}
  }
  const w=String(withdrawalDate||"").match(/^(\d{4})-(\d{2})-/);
  if(!first||!w)return null;

  let suspensionCount=0;
  rows.forEach(function(row){
    if(String((row&&row.status)||"").trim()==="休会")suspensionCount++;
  });

  const baseIndex=first.year*12+(first.month-1);
  const achievementIndex=baseIndex+12+suspensionCount;
  const withdrawalIndex=Number(w[1])*12+(Number(w[2])-1);
  return{
    remainingMonths:Math.max(0,achievementIndex-withdrawalIndex),
    achievementYear:Math.floor(achievementIndex/12),
    achievementMonth:(achievementIndex%12)+1,
    suspensionCount:suspensionCount
  };
}

function sendTfgSettlementApproval_(body){
  const lock=LockService.getScriptLock(); let locked=false;
  try{
    const row=findTfgSettlementByToken_(body&&body.token);
    if(!row)throw new Error("下書きURLが無効です。");
    lock.waitLock(10000);locked=true;
    const fresh=findTfgSettlementByToken_(body&&body.token);
    if(!fresh)throw new Error("下書きURLが無効です。");
    if(fresh.status==="APPROVED")throw new Error("この精算書はすでに承認済みです。");
    if(fresh.status==="SUPERSEDED")throw new Error("この精算書は再発行により無効です。");
    if(fresh.status!=="DRAFT"&&fresh.status!=="PENDING")throw new Error("この精算書は送信できない状態です。");
    if(tfgSettlementParseJst_(fresh.expiresAt).getTime()<Date.now())throw new Error("有効期限が切れています。明細を再作成してください。");
    const base=String(body.approvalBaseUrl||TFG_SETTLEMENT_CONFIG.APPROVAL_BASE_URL).trim();
    const approvalUrl=base+(base.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(String(body.token||"").trim());
    const campaignProgress=tfgSettlementCampaignProgress_(fresh.items,fresh.withdrawalDate);
    const campaignProgressLine=campaignProgress
      ? (campaignProgress.remainingMonths>0
          ? "キャンペーン条件達成まで：残り"+campaignProgress.remainingMonths+"か月　達成月："+campaignProgress.achievementYear+"年"+campaignProgress.achievementMonth+"月"
          : "キャンペーン条件：達成済み（達成月："+campaignProgress.achievementYear+"年"+campaignProgress.achievementMonth+"月）")
      : "";
    const expiryText=Utilities.formatDate(tfgSettlementParseJst_(fresh.expiresAt),TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy年M月d日 H:mm");
    const paymentText=fresh.paymentMethod==="BANK_TRANSFER"?"お支払い方法：銀行振込":"お支払い方法：クレジットカード";
    const draftBody=[
      fresh.memberName+" 様",
      "",
      "The Forest Gymでございます。",
      "この度、退会申請のお申し込みを頂きましたが、現時点ではご入会時のキャンペーン条件を満たしていないためご退会にあたり値引き分の精算が必要となります。",
      "要精算内容をご確認いただくため、下記の専用URLへアクセスしてください。",
      "要精算金額との兼ね合いで、ご入会時のキャンペーン条件達成まで退会を見送る場合は、画面内の「キャンペーン条件達成まで見送る」をタップしてください。",
      "",
      approvalUrl,
      "",
      "会員番号とご登録メールアドレスをご入力のうえ、内容をご確認ください。",
      "「この内容で承認する」または「キャンペーン条件達成まで見送る」を選択してください。",
      "",
      campaignProgressLine,
      campaignProgress?"現時点までの休会期間は加味されています。":"",
      "承認URLの有効期限："+expiryText,
      paymentText,
      "",
      fresh.paymentMethod==="BANK_TRANSFER"?"【お振込先】":"",
      fresh.paymentMethod==="BANK_TRANSFER"?(TFG_SETTLEMENT_CONFIG.BANK_NAME+" "+TFG_SETTLEMENT_CONFIG.BANK_BRANCH):"",
      fresh.paymentMethod==="BANK_TRANSFER"?(TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_TYPE+" "+TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NO):"",
      fresh.paymentMethod==="BANK_TRANSFER"?TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NAME:"",
      fresh.paymentMethod==="BANK_TRANSFER"?"※口座振替会員様は、承認後に上記口座へのお振込みが必要です。":"",
      "",
      "※精算内容に相違がある場合は承認せず、info@theforestgym.comまでお問い合わせください。",
      "",
      "The Forest Gym"
    ].filter(function(line){return line!==""||true;}).join("\n");

    const escHtml=function(value){
      return String(value==null?"":value)
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#39;");
    };
    const bankHtml=fresh.paymentMethod==="BANK_TRANSFER"
      ? '<p style="margin:18px 0 6px;font-weight:700">【お振込先】</p>'
        +'<p style="margin:0 0 16px">'+escHtml(TFG_SETTLEMENT_CONFIG.BANK_NAME+" "+TFG_SETTLEMENT_CONFIG.BANK_BRANCH)
        +'<br>'+escHtml(TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_TYPE+" "+TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NO)
        +'<br>'+escHtml(TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NAME)
        +'<br><span style="font-size:13px">※口座振替会員様は、承認後に上記口座へのお振込みが必要です。</span></p>'
      : '';
    const campaignHtml=campaignProgressLine
      ? '<p style="margin:18px 0 0;font-weight:700">'+escHtml(campaignProgressLine)+'</p>'
        +(campaignProgress?'<p style="margin:4px 0 16px;font-size:13px;color:#5f6d66">現時点までの休会期間は加味されています。</p>':'')
      : '';
    const draftHtml=[
      '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans JP,Arial,sans-serif;color:#17231d;line-height:1.8;font-size:14px">',
      '<p>'+escHtml(fresh.memberName)+' 様</p>',
      '<p>The Forest Gymでございます。<br>この度、退会申請のお申し込みを頂きましたが、現時点ではご入会時のキャンペーン条件を満たしていないためご退会にあたり値引き分の精算が必要となります。</p>',
      '<p>要精算内容をご確認いただくため、下記のボタンより専用ページへアクセスしてください。<br>要精算金額との兼ね合いで、ご入会時のキャンペーン条件達成まで退会を見送る場合は、画面内の「キャンペーン条件達成まで見送る」をタップしてください。</p>',
      '<div style="margin:24px 0"><a href="'+escHtml(approvalUrl)+'" style="display:inline-block;background:#0b3b2a;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:9px">要精算内容を確認する</a></div>',
      '<p>会員番号とご登録メールアドレスをご入力のうえ、内容をご確認ください。<br>「この内容で承認する」または「キャンペーン条件達成まで見送る」を選択してください。</p>',
      campaignHtml,
      '<p>承認URLの有効期限：'+escHtml(expiryText)+'<br>'+escHtml(paymentText)+'</p>',
      bankHtml,
      '<p style="margin-top:20px">※精算内容に相違がある場合は承認せず、info@theforestgym.comまでお問い合わせください。</p>',
      '<p>The Forest Gym</p>',
      '</div>'
    ].join("");

    const gmailDraft=GmailApp.createDraft(
      fresh.email,
      "【The Forest Gym】退会に伴う精算内容のご確認",
      draftBody,
      {
        name:"The Forest Gym",
        replyTo:TFG_SETTLEMENT_CONFIG.ADMIN_EMAIL,
        htmlBody:draftHtml
      }
    );

    if(fresh.status==="DRAFT")getTfgSettlementSheet_().getRange(fresh.row,11).setValue("PENDING");
    lock.releaseLock();locked=false;
    return tfgSettlementJson_({
      ok:true,
      data:{
        settlementId:fresh.id,
        status:"PENDING",
        approvalUrl:approvalUrl,
        gmailDraftId:gmailDraft.getId()
      }
    });
  }catch(e){
    if(locked){try{lock.releaseLock()}catch(_){}}
    return tfgSettlementJson_({ok:false,code:"SEND_ERROR",message:e.message||"承認依頼メールを下書き保存できませんでした。"});
  }
}

function getTfgSettlement_(body){
  try{
    const row=findTfgSettlementByToken_(body&&body.token);
    if(!row)throw new Error("この承認URLは無効です。");
    if(row.status==="SUPERSEDED")throw new Error("この承認URLは再発行により無効になりました。最新の精算書をご確認ください。");
    if(["APPROVED","DEFERRED"].indexOf(row.status)<0 && tfgSettlementParseJst_(row.expiresAt).getTime()<Date.now())throw new Error("精算条件が更新されたため、この承認URLは無効になりました。最新の精算書をご確認ください。");
    const campaignProgress=tfgSettlementCampaignProgress_(row.items,row.withdrawalDate);
    return tfgSettlementJson_({ok:true,data:{settlementId:row.id,memberName:row.memberName,withdrawalDate:row.withdrawalDate,items:row.items,total:row.total,status:row.status,approvedAt:row.approvedAt,deferredAt:row.deferredAt,paymentMethod:row.paymentMethod,paymentNote:row.paymentNote,campaignProgress:campaignProgress,bank:row.paymentMethod==="BANK_TRANSFER"?{bankName:TFG_SETTLEMENT_CONFIG.BANK_NAME,branch:TFG_SETTLEMENT_CONFIG.BANK_BRANCH,accountType:TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_TYPE,accountNo:TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NO,accountName:TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NAME}:null}});
  }catch(e){return tfgSettlementJson_({ok:false,code:"GET_ERROR",message:e.message||"精算内容を取得できませんでした。"});}
}

function tfgSettlementMailEscHtml_(value){
  return String(value==null?"":value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function tfgSettlementConsentTexts_(paymentMethod){
  const bank=tfgSettlementNormalizePaymentMethod_(paymentMethod)==="BANK_TRANSFER";
  return[
    "上記の要精算内容および要精算金額を確認しました。",
    bank
      ?"表示された要精算金額を、承認後に指定口座へ一括で振り込むことに同意します。"
      :"表示された要精算金額を、登録済みクレジットカードで一括決済することに同意します。",
    bank
      ?"振込確認ができない場合、退会手続きが完了しないことを理解しました。"
      :"クレジットカード決済が完了しない場合、退会手続きが完了しないことを理解しました。"
  ];
}

function tfgSettlementItemLabel_(item){
  return String((item&&item.status)||"").trim()==="休会"?"休会費":String((item&&item.label)||"");
}

function tfgSettlementSendApprovalConfirmation_(row,now){
  const items=Array.isArray(row.items)?row.items:[];
  const consents=tfgSettlementConsentTexts_(row.paymentMethod);
  const itemLines=items.map(function(item){
    return[
      String(item.target||"—"),
      tfgSettlementItemLabel_(item),
      "決済済："+Number(item.paid||0).toLocaleString("ja-JP")+"円",
      "通常価格："+Number(item.normal||0).toLocaleString("ja-JP")+"円",
      "要精算額："+Number(item.settlement||0).toLocaleString("ja-JP")+"円"
    ].join(" / ");
  });
  const paymentGuide=tfgSettlementNormalizePaymentMethod_(row.paymentMethod)==="BANK_TRANSFER"
    ?[
        "お支払い方法：銀行振込",
        "みずほ銀行 新浦安支店",
        "普通 1917298",
        "A-nauts株式会社",
        "※承認後、上記口座へのお振込みが必要です。"
      ]
    :[
        "お支払い方法：クレジットカード",
        "表示されている要精算金額はご承認翌日に一括で決済されます。"
      ];

  const body=[
    row.memberName+" 様",
    "",
    "The Forest Gymでございます。",
    "退会に伴う要精算内容のご承認を受け付けました。",
    "以下の明細および確認事項3項目について、会員様ご本人による確認・同意が完了しております。",
    "",
    "受付日時："+now,
    "退会予定："+row.withdrawalDate,
    "",
    "【承認済みの要精算明細】"
  ].concat(itemLines).concat([
    "",
    "今回の要精算金額："+Number(row.total||0).toLocaleString("ja-JP")+"円",
    ""
  ]).concat(paymentGuide).concat([
    "",
    "【ご確認・同意済みの事項】",
    "✓ "+consents[0],
    "✓ "+consents[1],
    "✓ "+consents[2],
    "",
    "このメールはお手続き内容の控えとして保管してください。",
    "",
    "The Forest Gym"
  ]).join("\n");

  const rowsHtml=items.map(function(item){
    return "<tr>"
      +"<td style='padding:8px;border-bottom:1px solid #e3e8e5'>"+tfgSettlementMailEscHtml_(item.target||"—")+"</td>"
      +"<td style='padding:8px;border-bottom:1px solid #e3e8e5'>"+tfgSettlementMailEscHtml_(tfgSettlementItemLabel_(item))+"</td>"
      +"<td style='padding:8px;border-bottom:1px solid #e3e8e5;text-align:right'>"+Number(item.paid||0).toLocaleString("ja-JP")+"円</td>"
      +"<td style='padding:8px;border-bottom:1px solid #e3e8e5;text-align:right'>"+Number(item.normal||0).toLocaleString("ja-JP")+"円</td>"
      +"<td style='padding:8px;border-bottom:1px solid #e3e8e5;text-align:right;font-weight:700'>"+Number(item.settlement||0).toLocaleString("ja-JP")+"円</td>"
      +"</tr>";
  }).join("");

  const bank=tfgSettlementNormalizePaymentMethod_(row.paymentMethod)==="BANK_TRANSFER";
  const paymentHtml=bank
    ?"<p><strong>お支払い方法：銀行振込</strong><br>みずほ銀行 新浦安支店<br>普通 1917298<br>A-nauts株式会社<br><span style='font-size:13px'>※承認後、上記口座へのお振込みが必要です。</span></p>"
    :"<p><strong>お支払い方法：クレジットカード</strong><br>表示されている要精算金額はご承認翌日に一括で決済されます。</p>";

  const htmlBody=[
    "<div style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans JP,Arial,sans-serif;color:#17231d;line-height:1.75;font-size:14px'>",
    "<p>"+tfgSettlementMailEscHtml_(row.memberName)+" 様</p>",
    "<p>The Forest Gymでございます。<br>退会に伴う要精算内容のご承認を受け付けました。<br>以下の明細および確認事項3項目について、会員様ご本人による確認・同意が完了しております。</p>",
    "<p>受付日時："+tfgSettlementMailEscHtml_(now)+"<br>退会予定："+tfgSettlementMailEscHtml_(row.withdrawalDate)+"</p>",
    "<p style='font-weight:700'>【承認済みの要精算明細】</p>",
    "<table style='width:100%;border-collapse:collapse;font-size:13px'><thead><tr>"
      +"<th style='padding:8px;text-align:left;border-bottom:2px solid #cfd9d3'>対象</th>"
      +"<th style='padding:8px;text-align:left;border-bottom:2px solid #cfd9d3'>内容</th>"
      +"<th style='padding:8px;text-align:right;border-bottom:2px solid #cfd9d3'>決済済</th>"
      +"<th style='padding:8px;text-align:right;border-bottom:2px solid #cfd9d3'>通常価格</th>"
      +"<th style='padding:8px;text-align:right;border-bottom:2px solid #cfd9d3'>要精算額</th>"
      +"</tr></thead><tbody>"+rowsHtml+"</tbody></table>",
    "<p style='font-size:18px;font-weight:700'>今回の要精算金額："+Number(row.total||0).toLocaleString("ja-JP")+"円</p>",
    paymentHtml,
    "<p style='font-weight:700'>【ご確認・同意済みの事項】</p>",
    "<p>✓ "+tfgSettlementMailEscHtml_(consents[0])+"<br>✓ "+tfgSettlementMailEscHtml_(consents[1])+"<br>✓ "+tfgSettlementMailEscHtml_(consents[2])+"</p>",
    "<p>このメールはお手続き内容の控えとして保管してください。</p>",
    "<p>The Forest Gym</p>",
    "</div>"
  ].join("");

  GmailApp.sendEmail(
    row.email,
    "【The Forest Gym】退会精算内容の承認を受け付けました",
    body,
    {
      bcc:TFG_SETTLEMENT_CONFIG.ADMIN_EMAIL,
      name:"The Forest Gym",
      replyTo:TFG_SETTLEMENT_CONFIG.ADMIN_EMAIL,
      htmlBody:htmlBody
    }
  );
}

function tfgSettlementSendDeferredConfirmation_(row,now){
  const progress=tfgSettlementCampaignProgress_(row.items,row.withdrawalDate);
  const progressLine=progress&&progress.remainingMonths>0
    ?"キャンペーン条件達成まで：残り"+progress.remainingMonths+"か月　達成月："+progress.achievementYear+"年"+progress.achievementMonth+"月"
    :"";
  const body=[
    row.memberName+" 様",
    "",
    "The Forest Gymでございます。",
    "キャンペーン条件達成まで、今回の退会申請を見送るお手続きを受け付けました。",
    "",
    "受付日時："+now,
    "当初退会予定："+row.withdrawalDate,
    progressLine,
    progressLine?"現時点までの休会期間は加味されています。":"",
    "",
    "【重要】",
    "・今回の見送りにより、退会申請のご予約がある場合はキャンセルとなります。",
    "・キャンペーン条件達成時に自動的に退会となることはありません。",
    "・キャンペーン条件達成後に退会をご希望の場合は、改めて退会申請が必要です。",
    "",
    "このメールはお手続き内容の控えとして保管してください。",
    "",
    "The Forest Gym"
  ].filter(function(line){return line!==""||true;}).join("\n");

  const progressHtml=progressLine
    ?"<p><strong>"+tfgSettlementMailEscHtml_(progressLine)+"</strong><br><span style='font-size:13px;color:#5f6d66'>現時点までの休会期間は加味されています。</span></p>"
    :"";
  const htmlBody=[
    "<div style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans JP,Arial,sans-serif;color:#17231d;line-height:1.8;font-size:14px'>",
    "<p>"+tfgSettlementMailEscHtml_(row.memberName)+" 様</p>",
    "<p>The Forest Gymでございます。<br>キャンペーン条件達成まで、今回の退会申請を見送るお手続きを受け付けました。</p>",
    "<p>受付日時："+tfgSettlementMailEscHtml_(now)+"<br>当初退会予定："+tfgSettlementMailEscHtml_(row.withdrawalDate)+"</p>",
    progressHtml,
    "<div style='margin:18px 0;padding:14px 16px;background:#fff8e8;border:1px solid #ead59d;border-radius:10px'>",
    "<strong>【重要】</strong><br>",
    "・今回の見送りにより、退会申請のご予約がある場合はキャンセルとなります。<br>",
    "・キャンペーン条件達成時に自動的に退会となることはありません。<br>",
    "・キャンペーン条件達成後に退会をご希望の場合は、改めて退会申請が必要です。",
    "</div>",
    "<p>このメールはお手続き内容の控えとして保管してください。</p>",
    "<p>The Forest Gym</p>",
    "</div>"
  ].join("");

  GmailApp.sendEmail(
    row.email,
    "【The Forest Gym】退会申請の見送りを受け付けました",
    body,
    {
      bcc:TFG_SETTLEMENT_CONFIG.ADMIN_EMAIL,
      name:"The Forest Gym",
      replyTo:TFG_SETTLEMENT_CONFIG.ADMIN_EMAIL,
      htmlBody:htmlBody
    }
  );
}

function approveTfgSettlement_(body){
  const lock=LockService.getScriptLock(); let locked=false;
  try{
    if(body.consent1!==true||body.consent2!==true||body.consent3!==true)throw new Error("確認事項3項目すべてへの同意が必要です。");
    const memberNo=String(body.memberNo||"").replace(/\D/g,"");
    const email=String(body.email||"").trim().toLowerCase();
    if(!/^\d{6}$/.test(memberNo))throw new Error("会員番号は6桁の数字で入力してください。");
    lock.waitLock(10000);locked=true;
    const row=findTfgSettlementByToken_(body&&body.token);
    if(!row)throw new Error("この承認URLは無効です。");
    if(row.status==="APPROVED"){lock.releaseLock();locked=false;return tfgSettlementJson_({ok:true,data:{approvedAt:row.approvedAt,alreadyApproved:true}});}
    if(row.status!=="PENDING")throw new Error("この承認URLは無効になりました。最新の精算書をご確認ください。");
    if(tfgSettlementParseJst_(row.expiresAt).getTime()<Date.now())throw new Error("精算条件が更新されたため、この承認URLは無効になりました。最新の精算書をご確認ください。");
    if(memberNo!==row.memberNo||email!==row.email)throw new Error("会員番号または登録メールアドレスが一致しません。");
    const now=Utilities.formatDate(new Date(),TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss");
    const sh=getTfgSettlementSheet_();
    sh.getRange(row.row,11,1,5).setValues([["APPROVED",now,memberNo,email,"本人端末WEB承認"]]);
    lock.releaseLock();locked=false;
    try{tfgSettlementSendApprovalConfirmation_(row,now);}catch(mailError){console.error(mailError);}
    return tfgSettlementJson_({ok:true,data:{approvedAt:now}});
  }catch(e){if(locked){try{lock.releaseLock()}catch(_){}}return tfgSettlementJson_({ok:false,code:"APPROVE_ERROR",message:e.message||"承認処理に失敗しました。"});}
}

function deferTfgSettlement_(body){
  const lock=LockService.getScriptLock(); let locked=false;
  try{
    const memberNo=String(body.memberNo||"").replace(/\D/g,"");
    const email=String(body.email||"").trim().toLowerCase();
    if(!/^\d{6}$/.test(memberNo))throw new Error("会員番号は6桁の数字で入力してください。");
    if(!/^\S+@\S+\.\S+$/.test(email))throw new Error("登録メールアドレスを入力してください。");

    lock.waitLock(10000);locked=true;
    const row=findTfgSettlementByToken_(body&&body.token);
    if(!row)throw new Error("この承認URLは無効です。");
    if(row.status==="DEFERRED"){
      lock.releaseLock();locked=false;
      return tfgSettlementJson_({ok:true,data:{deferredAt:row.deferredAt,alreadyDeferred:true}});
    }
    if(row.status==="APPROVED")throw new Error("この精算書はすでに承認済みです。");
    if(row.status!=="PENDING")throw new Error("この承認URLは無効になりました。最新の精算書をご確認ください。");
    if(tfgSettlementParseJst_(row.expiresAt).getTime()<Date.now())throw new Error("精算条件が更新されたため、この承認URLは無効になりました。最新の精算書をご確認ください。");
    if(memberNo!==row.memberNo||email!==row.email)throw new Error("会員番号または登録メールアドレスが一致しません。");

    const now=Utilities.formatDate(new Date(),TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy-MM-dd HH:mm:ss");
    const sh=getTfgSettlementSheet_();
    sh.getRange(row.row,11).setValue("DEFERRED");
    sh.getRange(row.row,18,1,2).setValues([[now,"キャンペーン条件達成まで退会申請を見送り"]]);
    lock.releaseLock();locked=false;

    try{tfgSettlementSendDeferredConfirmation_(row,now);}catch(mailError){console.error(mailError);}

    return tfgSettlementJson_({ok:true,data:{deferredAt:now,status:"DEFERRED"}});
  }catch(e){
    if(locked){try{lock.releaseLock()}catch(_){}}
    return tfgSettlementJson_({ok:false,code:"DEFER_ERROR",message:e.message||"退会申請の見送り受付に失敗しました。"});
  }
}

function getTfgSettlementSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error("会員マスターのスプレッドシートに紐づいたApps Scriptで使用してください。");
  let sh=ss.getSheetByName(TFG_SETTLEMENT_CONFIG.SHEET_NAME);
  if(!sh)sh=ss.insertSheet(TFG_SETTLEMENT_CONFIG.SHEET_NAME);
  const headers=["精算ID","作成日時","会員番号","氏名","登録メール","退会予定","明細JSON","精算合計","トークンHASH","有効期限","ステータス","承認日時","承認会員番号","承認メール","承認方法","支払方法","支払案内","見送り受付日時","見送り理由"];
  if(sh.getLastRow()===0){sh.appendRow(headers);sh.setFrozenRows(1);}
  else if(sh.getLastColumn()<headers.length){sh.getRange(1,1,1,headers.length).setValues([headers]);}
  return sh;
}
function invalidatePreviousPendingTfgSettlements_(sheet,memberNo,keepId){
  const lastRow=sheet.getLastRow();
  if(lastRow<2)return;
  const values=sheet.getRange(2,1,lastRow-1,17).getDisplayValues();
  values.forEach(function(row,index){
    if(String(row[0]||"").trim()!==String(keepId||"").trim()&&String(row[2]||"").trim()===memberNo&&["DRAFT","PENDING"].indexOf(String(row[10]||"").trim())>=0){
      sheet.getRange(index+2,11).setValue("SUPERSEDED");
    }
  });
}
function findTfgSettlementByToken_(token){
  token=String(token||"").trim();if(!token)return null;
  const hash=tfgSettlementHash_(token),sh=getTfgSettlementSheet_(),v=sh.getDataRange().getDisplayValues();
  for(let i=1;i<v.length;i++){if(v[i][8]===hash)return{row:i+1,id:v[i][0],memberNo:v[i][2],memberName:v[i][3],email:String(v[i][4]||"").toLowerCase(),withdrawalDate:v[i][5],items:JSON.parse(v[i][6]||"[]"),total:Number(v[i][7]||0),expiresAt:v[i][9],status:v[i][10],approvedAt:v[i][11],paymentMethod:tfgSettlementNormalizePaymentMethod_(v[i][15]),paymentNote:String(v[i][16]||""),deferredAt:String(v[i][17]||""),deferReason:String(v[i][18]||"")};}
  return null;
}

function tfgSettlementNormalizePaymentMethod_(value){
  const v=String(value||"CARD").trim().toUpperCase();
  if(["BANK_TRANSFER","BANK","口座振替","銀行振込"].indexOf(v)>=0)return "BANK_TRANSFER";
  return "CARD";
}
function tfgSettlementPaymentLabel_(value){
  return tfgSettlementNormalizePaymentMethod_(value)==="BANK_TRANSFER"?"銀行振込（口座振替会員）":"クレジットカード";
}
function tfgSettlementPaymentNote_(value){
  if(tfgSettlementNormalizePaymentMethod_(value)!=="BANK_TRANSFER")return "登録済みクレジットカードで精算";
  return TFG_SETTLEMENT_CONFIG.BANK_NAME+" "+TFG_SETTLEMENT_CONFIG.BANK_BRANCH+" "+TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_TYPE+" "+TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NO+" "+TFG_SETTLEMENT_CONFIG.BANK_ACCOUNT_NAME;
}
function tfgSettlementJstParts_(date){
  return Utilities.formatDate(date,TFG_SETTLEMENT_CONFIG.TIMEZONE,"yyyy,M,d,H,m,s").split(",").map(Number);
}
function tfgSettlementIsBeforeMonthlyCharge_(date){
  const p=tfgSettlementJstParts_(date);
  const day=p[2],hour=p[3],minute=p[4],second=p[5];
  const afterWithdrawalCutoff=
    day>9||
    (day===9&&(hour>20||(hour===20&&(minute>0||second>0))));
  return afterWithdrawalCutoff&&day<=26;
}
function tfgSettlementIsWithdrawalMonth_(target,withdrawalDate){
  const d=String(withdrawalDate||"").match(/^(\d{4})-(\d{2})-/);
  if(!d)return false;
  const t=String(target||"").replace(/\s/g,"");
  const ym1=d[1]+"-"+d[2],ym2=d[1]+"年"+Number(d[2])+"月",ym3=d[1]+"/"+Number(d[2]);
  return t.indexOf(ym1)>=0||t.indexOf(ym2)>=0||t.indexOf(ym3)>=0;
}
function tfgSettlementWithdrawalDate_(now){
  const p=tfgSettlementJstParts_(now);
  const y=p[0],m=p[1],d=p[2],h=p[3],min=p[4],sec=p[5];
  const afterCutoff=d>9||(d===9&&(h>20||(h===20&&(min>0||sec>0))));
  const first=new Date(Date.UTC(y,m-1+(afterCutoff?1:0),1));
  const ty=first.getUTCFullYear(),tm=first.getUTCMonth()+1;
  const lastDay=new Date(Date.UTC(ty,tm,0)).getUTCDate();
  return String(ty)+"-"+String(tm).padStart(2,"0")+"-"+String(lastDay).padStart(2,"0");
}
function tfgSettlementNextExpiry_(now){
  const p=tfgSettlementJstParts_(now);
  const y=p[0],m=p[1],d=p[2],h=p[3],min=p[4],sec=p[5];
  const beforeNineCutoff=d<9||(d===9&&(h<20||(h===20&&min===0&&sec===0)));
  if(beforeNineCutoff)return new Date(Date.UTC(y,m-1,9,11,0,1)); // JST 20:00:01（20:00ちょうどまでは当月扱い）
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
