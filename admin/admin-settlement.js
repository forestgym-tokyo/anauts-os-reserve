(()=>{
const $=s=>document.querySelector(s);
const yen=n=>Number(n||0).toLocaleString("ja-JP")+"円";
const planRates={
  REGULAR:{after202603:{normal:7480,campaign:4950},before202603:{normal:7260,campaign:4840}},
  DAY:{after202603:{normal:6050,campaign:4180},before202603:{normal:4180,campaign:4180}},
  NIGHT365:{after202603:{normal:4950,campaign:3300},before202603:{normal:4950,campaign:3300}}
};
let current=null;

function authReady(){
  return typeof state!=="undefined"&&state.authUser;
}
function permission(){
  return String((typeof state!=="undefined"&&state.authUser&&(state.authUser.permission||state.authUser.role))||"").toUpperCase();
}
function refreshNav(){
  const nav=$("#settlementNav");
  if(!nav)return;
  nav.classList.toggle("is-hidden",!["ADMIN","MANAGER"].includes(permission()));
}
setInterval(refreshNav,1200);
document.addEventListener("DOMContentLoaded",refreshNav);

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
  return {withdrawalDate,expiry,beforeFinalCharge:d<=26};
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
  const firstNormal=Number($("#settlementFirstNormal").value||0);
  const initialPaid=Number($("#settlementInitialPaid").value||0);
  const paymentMethod=$("#settlementPaymentMethod").value;
  if(!memberNo||!memberName||!email||!joinDate){show("会員番号・氏名・メールアドレス・入会日を入力してください。",true);return}
  const cut=cutoffInfo(),rate=rateFor(plan,joinDate),months=monthsBetween(joinDate,cut.withdrawalDate);
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
    :"登録済みの決済方法で精算します。");
  $("#settlementPreview").classList.remove("is-hidden");
  $("#settlementSend").disabled=false;
}
function show(text,isError=false){
  const el=$("#settlementMessage"); if(!el)return;
  el.textContent=text; el.classList.remove("is-hidden"); el.style.color=isError?"#ff8e8e":"#79dc8c";
}
async function send(){
  if(!current)return;
  const btn=$("#settlementSend"); btn.disabled=true; btn.textContent="送信中…";
  try{
    if(typeof apiPost!=="function")throw new Error("管理APIを読み込めませんでした。");
    const payload={
      action:"createTfgSettlement",
      memberNo:current.memberNo,
      memberName:current.memberName,
      email:current.email,
      withdrawalDate:current.withdrawalDate,
      paymentMethod:current.paymentMethod,
      items:current.items.map(x=>({target:x.target,label:x.label,paid:x.paid,normal:x.normal,settlement:x.settlement,note:x.note,status:x.status||"",paymentSequence:x.paymentSequence||null,isFinalMonth:!!x.isFinalMonth}))
    };
    const r=await apiPost(payload);
    show("承認URLを会員へ送信しました。精算ID："+(r.data?.settlementId||""));
  }catch(e){show(e.message||"送信できませんでした。",true)}
  finally{btn.disabled=false;btn.textContent="会員へ承認URLを送信"}
}
document.addEventListener("DOMContentLoaded",()=>{
  $("#settlementCalculate")?.addEventListener("click",calc);
  $("#settlementSend")?.addEventListener("click",send);
});
})();