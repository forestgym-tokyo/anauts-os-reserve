(()=>{
const $=s=>document.querySelector(s);
const yen=n=>Number(n||0).toLocaleString("ja-JP")+"円";
const planRates={
  REGULAR:{after202603:{normal:7480,campaign:4950},before202603:{normal:7260,campaign:4840}},
  DAY:{after202603:{normal:6050,campaign:4180},before202603:{normal:4180,campaign:4180}},
  NIGHT365:{after202603:{normal:4950,campaign:3300},before202603:{normal:3300,campaign:3300}}
};
let current=null;
let draft=null;

function cutoffInfo(now=new Date()){
  const y=now.getFullYear(),m=now.getMonth(),d=now.getDate(),h=now.getHours(),min=now.getMinutes(),sec=now.getSeconds();
  const before9=d<9||(d===9&&(h<20||(h===20&&min===0&&sec===0)));
  const after9=!before9;
  let wy=y,wm=m;
  if(after9){wm+=1;if(wm>11){wm=0;wy++}}
  const last=new Date(wy,wm+1,0).getDate();
  const withdrawalDate=`${wy}-${String(wm+1).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
  let expiry;
  if(before9) expiry=new Date(y,m,9,20,0,1);
  else if(d<=26) expiry=new Date(y,m,27,0,0,0);
  else expiry=new Date(y,m+1,9,20,0,0);
  return {withdrawalDate,expiry,beforeFinalCharge:after9&&d<=26};
}
function monthsBetween(joinDate,withdrawalDate){
  const j=new Date(joinDate+"T00:00:00"),w=new Date(withdrawalDate+"T00:00:00");
  const out=[]; let y=j.getFullYear(),m=j.getMonth();
  while(y<w.getFullYear()||m<=w.getMonth()){
    out.push({y,m});
    m++; if(m>11){m=0;y++}
  }
  return out;
}
function rateFor(plan,joinDate){
  const d=String(joinDate||"");
  return planRates[plan][d>="2026-03-01"?"after202603":"before202603"];
}
function firstNormalFromPaid_(firstPaid,rate){
  const paid=Math.max(0,Number(firstPaid||0));
  const campaign=Number(rate&&rate.campaign||0);
  const normal=Number(rate&&rate.normal||0);
  if(!campaign||!normal)return 0;
  return Math.floor((paid*normal)/campaign);
}
function refreshFirstNormal_(){
  const planEl=$("#settlementPlan"),joinEl=$("#settlementJoinDate"),paidEl=$("#settlementFirstPaid"),normalEl=$("#settlementFirstNormal"),hintEl=$("#settlementFirstNormalHint");
  if(!planEl||!joinEl||!paidEl||!normalEl)return;
  if(!joinEl.value){
    normalEl.value="0";
    if(hintEl)hintEl.textContent="入会日を入力すると自動計算します。";
    return;
  }
  const rate=rateFor(planEl.value,joinEl.value);
  const firstPaid=Number(paidEl.value||0);
  const firstNormal=firstNormalFromPaid_(firstPaid,rate);
  normalEl.value=String(firstNormal);
  if(hintEl){
    hintEl.textContent=firstPaid>0
      ? `自動計算：${yen(firstNormal)}（初月決済額 ${yen(firstPaid)} を基準）`
      : "初月決済額を入力すると自動計算します。";
  }
}
function benefitAmount(benefit,rate,joinDate,plan){
  if(benefit==="PERSONAL"){
    if(joinDate<"2026-03-01"&&(plan==="DAY"||plan==="NIGHT365"))return 0;
    return 6600;
  }
  if(benefit==="SECOND_MONTH_FREE"){
    if(joinDate<"2026-03-01"&&(plan==="DAY"||plan==="NIGHT365"))return 0;
    return rate.campaign;
  }
  return 0;
}
function calc(){
  const msg=$("#settlementMessage"); msg.classList.add("is-hidden");
  const memberNo=$("#settlementMemberNo").value.trim();
  const memberName=$("#settlementMemberName").value.trim();
  const email=$("#settlementEmail").value.trim();
  const joinDate=$("#settlementJoinDate").value;
  const plan=$("#settlementPlan").value;
  const benefit=$("#settlementBenefit").value;
  const firstPaid=Number($("#settlementFirstPaid").value||0);
  const rate=rateFor(plan,joinDate);
  const firstNormal=firstNormalFromPaid_(firstPaid,rate);
  $("#settlementFirstNormal").value=firstNormal;
  const initialPaid=Number($("#settlementInitialPaid").value||0);
  const paymentMethod=$("#settlementPaymentMethod").value;
  if(!/^\d{6}$/.test(memberNo)){show("会員番号は6桁の数字で入力してください。",true);return}
  if(!memberName||!email||!joinDate){show("氏名・メールアドレス・入会日を入力してください。",true);return}
  const cut=cutoffInfo(),months=monthsBetween(joinDate,cut.withdrawalDate);
  const items=[];
  items.push({target:"—",label:"初期費用",paid:initialPaid,normal:8800,settlement:Math.max(0,8800-initialPaid),note:"入会金・事務手数料",kind:"INITIAL",basePaid:initialPaid,baseNormal:8800});
  const benefitValue=benefitAmount(benefit,rate,joinDate,plan);
  if(benefitValue>0)items.push({target:"—",label:"選べる特典",paid:0,normal:benefitValue,settlement:benefitValue,note:benefit==="PERSONAL"?"無料パーソナル":"2か月目無料",kind:"BENEFIT",basePaid:0,baseNormal:benefitValue});
  months.forEach((x,i)=>{
    const target=`${x.y}年${x.m+1}月`;
    if(i===0){
      items.push({target,label:"初月会費",paid:firstPaid,normal:firstNormal,settlement:Math.max(0,firstNormal-firstPaid),note:"日割り差額",kind:"MONTH",isFinalMonth:months.length===1,status:"通常",basePaid:firstPaid,baseNormal:firstNormal});
      return;
    }
    const isFinal=i===months.length-1;
    let paid=rate.campaign;
    if(isFinal&&cut.beforeFinalCharge)paid=0;
    items.push({target,label:"月会費",paid,normal:rate.normal,settlement:Math.max(0,rate.normal-paid),note:"",kind:"MONTH",isFinalMonth:isFinal,status:"通常",basePaid:paid,baseNormal:rate.normal});
  });
  current={memberNo,memberName,email,joinDate,plan,benefit,paymentMethod,withdrawalDate:cut.withdrawalDate,expiry:cut.expiry,items};
  recalculateCampaign_();
  render();
}
function recalculateCampaign_(){
  if(!current)return;
  let sequence=0,completed=0;
  const months=current.items.filter(x=>x.kind==="MONTH");
  months.forEach(item=>{
    if(item.status==="休会"){
      item.paid=550; item.normal=550; item.settlement=0;
      item.paymentSequence=null;
      item.note="休会期間（差額なし・継続条件の回数に含めない）";
      return;
    }
    sequence++;
    item.paymentSequence=sequence;
    item.normal=Number(item.baseNormal||0);
    item.paid=Number(item.basePaid||0);
    if(item.isFinalMonth&&cutoffInfo().beforeFinalCharge)item.paid=0;
    if(item.paid>0)completed++;
    item.settlement=sequence<=12?Math.max(0,item.normal-item.paid):0;
    item.note=sequence<=12?`キャンペーン決済 ${sequence}/12`:"継続条件達成後";
  });
  const campaignCompleted=completed>=12;
  current.completedPayments=completed;
  current.campaignCompleted=campaignCompleted;
  current.items.filter(x=>x.kind==="INITIAL"||x.kind==="BENEFIT").forEach(item=>{
    item.paid=Number(item.basePaid||0); item.normal=Number(item.baseNormal||0);
    item.settlement=campaignCompleted?0:Math.max(0,item.normal-item.paid);
  });
  if(campaignCompleted){
    months.forEach(item=>item.settlement=0);
  }
}
function render(){
  const body=$("#settlementRows"); body.innerHTML="";
  current.items.forEach((x,i)=>{
    const tr=document.createElement("tr");
    const status=x.kind==="MONTH"?`<select data-status="${i}"><option value="通常"${x.status==="通常"?" selected":""}>通常</option><option value="休会"${x.status==="休会"?" selected":""}>休会</option></select>`:"—";
    tr.innerHTML=`<td>${x.target}</td><td>${status}</td><td>${x.label}<div style="font-size:11px;color:#91a198">${x.note||""}</div></td><td class="num">${yen(x.paid)}</td><td class="num">${yen(x.normal)}</td><td class="num"><strong>${yen(x.settlement)}</strong></td>`;
    body.append(tr);
  });
  body.querySelectorAll("[data-status]").forEach(sel=>sel.addEventListener("change",e=>{
    const i=Number(e.target.dataset.status),item=current.items[i];
    item.status=e.target.value;
    recalculateCampaign_();
    render();
  }));
  const total=current.items.reduce((s,x)=>s+x.settlement,0);
  $("#settlementTotal").textContent=yen(total);
  $("#settlementDeadlineBadge").textContent="有効期限 "+current.expiry.toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  const campaignText=current.campaignCompleted
    ?"12回の決済条件を満たしているため、キャンペーン差額の精算はありません。"
    :`決済済み ${current.completedPayments}/12回。未達のためキャンペーン差額を精算します。`;
  $("#settlementPaymentGuide").textContent=campaignText+" "+(current.paymentMethod==="BANK_TRANSFER"
    ?"口座振替会員：承認後、みずほ銀行 新浦安支店 普通 1917298 A-nauts株式会社 へ振込が必要です。"
    :"クレジットカードで精算します。");
  $("#settlementPreview").classList.remove("is-hidden");
  $("#settlementDraft").disabled=false;
  $("#settlementPreviewButton").disabled=false;
  $("#settlementSend").disabled=true;
  draft=null;
}
function show(text,isError=false){
  const el=$("#settlementMessage"); if(!el)return;
  el.textContent=text; el.classList.remove("is-hidden"); el.style.color=isError?"#ff8e8e":"#79dc8c";
}
async function createDraft(){
  if(!current)return;
  const btn=$("#settlementDraft"); btn.disabled=true; btn.textContent="下書き保存中…";
  try{
    if(typeof apiPost!=="function")throw new Error("管理APIを読み込めませんでした。");
    const payload={
      action:"createTfgSettlement",
      memberNo:current.memberNo,
      memberName:current.memberName,
      email:current.email,
      paymentMethod:current.paymentMethod,
      items:current.items.map(x=>({target:x.target,label:x.label,paid:x.paid,normal:x.normal,settlement:x.settlement,note:x.note,status:x.status||"",paymentSequence:x.paymentSequence||null,isFinalMonth:!!x.isFinalMonth}))
    };
    const r=await apiPost(payload);
    draft={settlementId:r.data?.settlementId||"",approvalUrl:r.data?.approvalUrl||""};
    const fallback=$("#settlementFallbackUrl"),fallbackText=$("#settlementFallbackUrlText");
    const previewUrl=draft.approvalUrl+(draft.approvalUrl.includes("?")?"&":"?")+"preview="+Date.now();
    const previewLink=$("#settlementPreviewLink");
    if(fallback&&fallbackText){fallbackText.value=draft.approvalUrl;fallback.classList.remove("is-hidden");}
    if(previewLink){previewLink.href=previewUrl;previewLink.classList.remove("is-hidden");}
    $("#settlementPreviewButton").disabled=!draft.approvalUrl;
    $("#settlementSend").disabled=!draft.approvalUrl;
    show("下書きを保存し、承認URLを発行しました。会員にはまだ送信していません。精算ID："+draft.settlementId);
  }catch(e){show(e.message||"下書きを保存できませんでした。",true)}
  finally{btn.disabled=false;btn.textContent="下書き保存・URL発行"}
}
function draftToken(){
  try{return new URL(draft?.approvalUrl||"",location.href).searchParams.get("token")||""}catch(_){return ""}
}
function escapePreview_(value){
  return String(value==null?"":value).replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\":"&#92;","\"":"&quot;","'":"&#39;"}[s]||s));
}
function campaignProgressForPreview_(items,withdrawalDate){
  const rows=Array.isArray(items)?items:[];
  const first=rows.find(x=>String(x&&x.label||"").trim()==="初月会費"&&/(\d{4})年(\d{1,2})月/.test(String(x&&x.target||"")));
  const w=String(withdrawalDate||"").match(/^(\d{4})-(\d{2})-/);
  if(!first||!w)return null;
  const m=String(first.target||"").match(/(\d{4})年(\d{1,2})月/);
  if(!m)return null;
  const suspensionCount=rows.filter(x=>String(x&&x.status||"").trim()==="休会").length;
  const achievementIndex=Number(m[1])*12+(Number(m[2])-1)+12+suspensionCount;
  const withdrawalIndex=Number(w[1])*12+(Number(w[2])-1);
  return{
    remaining:Math.max(0,achievementIndex-withdrawalIndex),
    year:Math.floor(achievementIndex/12),
    month:(achievementIndex%12)+1,
    suspensionCount:suspensionCount
  };
}
function buildMemberPreviewHtml_(){
  if(!current)return "";
  const total=current.items.reduce((s,x)=>s+Number(x.settlement||0),0);
  const bank=current.paymentMethod==="BANK_TRANSFER";
  const campaignProgress=campaignProgressForPreview_(current.items,current.withdrawalDate);
  const campaignProgressHtml=campaignProgress
    ? `<div style="margin-top:9px;padding:11px 13px;border-radius:11px;background:#f8fbf9;border:1px solid #dfe9e3;font-size:13px;color:#294b3b">
        ${campaignProgress.remaining>0
          ? `キャンペーン条件達成まで：<strong>残り${campaignProgress.remaining}か月</strong>（達成月：${campaignProgress.year}年${campaignProgress.month}月）<div style="margin-top:2px;color:#66746d;font-size:11px">※表示の達成月は、今後追加の休会がない場合の目安です。</div>`
          : `<strong>キャンペーン条件達成済み</strong>（達成月：${campaignProgress.year}年${campaignProgress.month}月）`}
      </div>`
    : "";
  const rows=current.items.map(x=>`
    <tr>
      <td style="padding:10px 6px;border-bottom:1px solid #e2e9e5;font-size:12px">${escapePreview_(x.target||"—")}</td>
      <td style="padding:10px 6px;border-bottom:1px solid #e2e9e5;font-size:12px">${escapePreview_(x.label||"")}</td>
      <td style="padding:10px 6px;border-bottom:1px solid #e2e9e5;font-size:12px;text-align:right;white-space:nowrap">${yen(x.paid)}</td>
      <td style="padding:10px 6px;border-bottom:1px solid #e2e9e5;font-size:12px;text-align:right;white-space:nowrap">${yen(x.normal)}</td>
      <td style="padding:10px 6px;border-bottom:1px solid #e2e9e5;font-size:12px;text-align:right;white-space:nowrap"><strong>${yen(x.settlement)}</strong></td>
    </tr>`).join("");
  const payment=bank
    ? `<div style="margin-top:16px;border:2px solid #dbc98f;background:#fffaf0;border-radius:15px;padding:17px 18px">
        <div style="font-weight:900;font-size:16px">🏦 銀行振込でお支払い</div>
        <p style="font-size:13px;margin:8px 0 0">口座振替会員様は、精算金を自動引落しせず、承認後に下記口座へお振込みいただきます。</p>
        <p style="font-size:14px;font-weight:900">承認だけでは退会手続きは完了しません。お振込みが必要です。</p>
        <div style="background:#fff;border:1px solid #e6ddbf;border-radius:12px;padding:12px;font-size:13px"><strong>みずほ銀行　新浦安支店</strong><br>普通　1917298<br>A-nauts株式会社</div>
      </div>`
    : `<div style="margin-top:16px;border:2px solid #b8cde3;background:#f2f7fc;border-radius:15px;padding:17px 18px">
        <div style="font-weight:900;font-size:16px">💳 クレジットカードで決済</div>
        <p style="font-size:13px;margin:8px 0 0">ご登録済みのクレジットカードへ、表示されている精算金額を一括で決済します。</p>
        <p style="font-size:14px;font-weight:900">お客様による振込作業は不要です。</p>
      </div>`;
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',Arial,sans-serif;color:#17231d;background:#f5f8f6">
      <div style="background:linear-gradient(135deg,#0b3b2a,#0f5138);color:#fff;padding:28px 22px 34px">
        <div style="font-size:13px;font-weight:800">The Forest Gym</div>
        <h1 style="margin:18px 0 5px;font-size:27px">退会精算明細</h1>
        <p style="margin:0;color:#dcebe4;font-size:13px">退会に伴う精算内容をご確認のうえ、「この内容で承認する」または「キャンペーン条件達成まで見送る」を選択してください。</p>
      </div>
      <div style="padding:16px">
        <div style="background:#fff;border:1px solid #dce6e0;border-radius:18px;padding:20px;margin-bottom:14px">
          <h2 style="font-size:17px;margin:0 0 14px">会員情報</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="background:#f8fbf9;border:1px solid #e2ebe6;border-radius:12px;padding:13px"><span style="display:block;color:#66746d;font-size:11px">お名前</span><strong>${escapePreview_(current.memberName)} 様</strong></div>
            <div style="background:#f8fbf9;border:1px solid #e2ebe6;border-radius:12px;padding:13px"><span style="display:block;color:#66746d;font-size:11px">退会予定</span><strong>${escapePreview_(current.withdrawalDate)}</strong></div>
          </div>
        </div>
        <div style="background:#fff;border:1px solid #dce6e0;border-radius:18px;padding:20px;margin-bottom:14px">
          <h2 style="font-size:17px;margin:0 0 14px">精算明細</h2>
          <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;min-width:620px"><thead><tr>
            <th style="padding:9px 6px;text-align:left;color:#66746d;font-size:12px">対象</th>
            <th style="padding:9px 6px;text-align:left;color:#66746d;font-size:12px">内容</th>
            <th style="padding:9px 6px;text-align:right;color:#66746d;font-size:12px">決済済</th>
            <th style="padding:9px 6px;text-align:right;color:#66746d;font-size:12px">通常価格</th>
            <th style="padding:9px 6px;text-align:right;color:#66746d;font-size:12px">精算額</th>
          </tr></thead><tbody>${rows}</tbody></table></div>
          <div style="display:flex;justify-content:space-between;align-items:end;margin-top:17px;padding:17px 18px;background:#eef6f1;border:1px solid #cfe1d7;border-radius:14px">
            <span style="font-size:12px;color:#496258">今回のご精算金額</span><strong style="font-size:30px;color:#0b3b2a">${yen(total)}</strong>
          </div>
          ${campaignProgressHtml}
          ${payment}
        </div>
        <div style="background:#fff;border:1px solid #dce6e0;border-radius:18px;padding:20px;margin-bottom:14px">
          <h2 style="font-size:17px;margin:0 0 14px">ご本人確認</h2>
          <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700">会員番号（6桁）</label><div style="margin-top:6px;border:1px solid #bfcac4;border-radius:11px;padding:13px;color:#66746d">例：108035</div></div>
          <div><label style="font-size:12px;font-weight:700">登録メールアドレス</label><div style="margin-top:6px;border:1px solid #bfcac4;border-radius:11px;padding:13px;color:#66746d">example@gmail.com</div></div>
        </div>
        <div style="background:#fff;border:1px solid #dce6e0;border-radius:18px;padding:20px">
          <h2 style="font-size:17px;margin:0 0 14px">確認・同意</h2>
          <div style="padding:12px;background:#fafcfb;border:1px solid #e0e8e3;border-radius:12px;margin-bottom:10px">☐ 上記の精算内容および精算金額を確認しました。</div>
          <div style="padding:12px;background:#fafcfb;border:1px solid #e0e8e3;border-radius:12px;margin-bottom:10px">☐ ${bank?"表示された精算金額を、承認後に指定口座へ一括で振り込むことに同意します。":"表示された精算金額を、登録済みクレジットカードで一括決済することに同意します。"}</div>
          <div style="padding:12px;background:#fafcfb;border:1px solid #e0e8e3;border-radius:12px;margin-bottom:12px">☐ ${bank?"振込確認ができない場合、退会手続きが完了しないことを理解しました。":"クレジットカード決済が完了しない場合、退会手続きが完了しないことを理解しました。"}</div>
          <button disabled style="width:100%;border:0;border-radius:13px;padding:16px;background:#0b3b2a;color:#fff;font-size:16px;font-weight:900;opacity:.5">下書きプレビューのため承認できません</button>
          <button disabled style="width:100%;border:2px solid #0b3b2a;border-radius:13px;padding:16px;background:#fff;color:#0b3b2a;font-size:16px;font-weight:900;opacity:.5;margin-top:8px">キャンペーン条件達成まで見送る</button>
          <div style="margin-top:10px;padding:12px 13px;border-radius:11px;background:#fff8e8;border:1px solid #ead59d;color:#6f5310;font-size:12px;font-weight:700">
            今回の退会申請は見送りとなり、キャンペーン条件達成時に自動で退会にはなりません。<br>
            ※条件達成後に退会をご希望の場合は、再度退会申請のお申し出が必要です。
          </div>
        </div>
      </div>
    </div>`;
}
function previewDraft(){
  if(!current){show("先に精算明細を計算してください。",true);return}
  const panel=$("#settlementInlineMemberPreview"),body=$("#settlementInlineMemberPreviewBody");
  if(!panel||!body){show("会員画面プレビュー領域を読み込めませんでした。ページを再読み込みしてください。",true);return}
  body.innerHTML=buildMemberPreviewHtml_();
  panel.classList.remove("is-hidden");
  panel.scrollIntoView({behavior:"smooth",block:"start"});
}
function closeMemberPreview_(){
  $("#settlementInlineMemberPreview")?.classList.add("is-hidden");
}
async function send(){
  if(!draft?.approvalUrl)return;
  const token=draftToken();
  if(!token){show("承認URLのトークンを確認できません。下書きを作り直してください。",true);return}
  const btn=$("#settlementSend"); btn.disabled=true; btn.textContent="送信中…";
  try{
    const r=await apiPost({action:"sendTfgSettlementApproval",token});
    show("会員向け承認依頼メールをGmailの下書きに保存しました。内容を確認してGmailから送信してください。精算ID："+(r.data?.settlementId||draft.settlementId));
  }catch(e){show(e.message||"承認依頼メールを下書き保存できませんでした。",true)}
  finally{btn.disabled=false;btn.textContent="会員向けメールを下書き保存"}
}
let memberLookupTimer_=null;
let memberLookupSeq_=0;

function resetSettlementAfterMemberChange_(){
  current=null;
  draft=null;
  $("#settlementPreview")?.classList.add("is-hidden");
  $("#settlementInlineMemberPreview")?.classList.add("is-hidden");
  if($("#settlementDraft"))$("#settlementDraft").disabled=true;
  if($("#settlementPreviewButton"))$("#settlementPreviewButton").disabled=true;
  if($("#settlementSend"))$("#settlementSend").disabled=true;
}

async function lookupSettlementMember_(){
  const noEl=$("#settlementMemberNo");
  const nameEl=$("#settlementMemberName");
  const emailEl=$("#settlementEmail");
  if(!noEl||!nameEl||!emailEl)return;

  const memberNo=String(noEl.value||"").replace(/\D/g,"").slice(0,6);
  noEl.value=memberNo;
  if(!/^\d{6}$/.test(memberNo))return;

  const seq=++memberLookupSeq_;
  try{
    if(typeof apiPost!=="function")throw new Error("管理APIを読み込めませんでした。");
    const r=await apiPost({action:"getTfgSettlementMember",memberNo});
    if(seq!==memberLookupSeq_||String(noEl.value||"")!==memberNo)return;
    const memberName=String(r.data?.memberName||"").trim();
    const email=String(r.data?.email||"").trim();
    if(!memberName||!email)throw new Error("会員マスターの氏名またはメールアドレスを取得できませんでした。");
    nameEl.value=memberName;
    emailEl.value=email;
    show("会員番号から氏名・登録メールアドレスを自動取得しました。");
  }catch(e){
    if(seq!==memberLookupSeq_||String(noEl.value||"")!==memberNo)return;
    nameEl.value="";
    emailEl.value="";
    show(e.message||"会員情報を取得できませんでした。",true);
  }
}

function scheduleSettlementMemberLookup_(immediate){
  const noEl=$("#settlementMemberNo");
  const nameEl=$("#settlementMemberName");
  const emailEl=$("#settlementEmail");
  if(!noEl||!nameEl||!emailEl)return;

  const memberNo=String(noEl.value||"").replace(/\D/g,"").slice(0,6);
  if(noEl.value!==memberNo)noEl.value=memberNo;
  clearTimeout(memberLookupTimer_);
  resetSettlementAfterMemberChange_();

  if(!/^\d{6}$/.test(memberNo)){
    memberLookupSeq_++;
    nameEl.value="";
    emailEl.value="";
    return;
  }
  memberLookupTimer_=setTimeout(lookupSettlementMember_,immediate?0:180);
}

function initSettlementUi_(){
  $("#settlementMemberNo")?.addEventListener("input",()=>scheduleSettlementMemberLookup_(false));
  $("#settlementMemberNo")?.addEventListener("blur",()=>scheduleSettlementMemberLookup_(true));
  $("#settlementCalculate")?.addEventListener("click",calc);
  ["input","change","keyup","blur"].forEach(evt=>$("#settlementFirstPaid")?.addEventListener(evt,refreshFirstNormal_));
  ["change","input"].forEach(evt=>{
    $("#settlementPlan")?.addEventListener(evt,refreshFirstNormal_);
    $("#settlementJoinDate")?.addEventListener(evt,refreshFirstNormal_);
  });
  $("#settlementDraft")?.addEventListener("click",createDraft);
  $("#settlementPreviewButton")?.addEventListener("click",previewDraft);
  $("#settlementSend")?.addEventListener("click",send);
  $("#settlementInlinePreviewClose")?.addEventListener("click",closeMemberPreview_);
  $("#settlementCopyUrl")?.addEventListener("click",async()=>{
    const value=$("#settlementFallbackUrlText")?.value||"";
    if(!value)return;
    try{await navigator.clipboard.writeText(value);show("承認URLをコピーしました。");}
    catch(_){$("#settlementFallbackUrlText")?.select();}
  });
  refreshFirstNormal_();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initSettlementUi_,{once:true});
else initSettlementUi_();
})();