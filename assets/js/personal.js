const API_URL="https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
const PLANS=[
  {code:"PT_DIET60",name:"ダイエット特化パーソナル",description:"ダイエット特化プラン"},
  {code:"PT_ENTRY60",name:"エントリープラン",description:"エントリー会員向け"},
  {code:"PT_PURPOSE60",name:"目的別プラン",description:"目的別会員向け"},
  {code:"PT_PRIME60",name:"プライムプラン",description:"プライム会員向け"}
];
const DAYS=7;
const el={
  planGrid:document.querySelector("#planGrid"),
  availabilitySection:document.querySelector("#availabilitySection"),
  prevWeekButton:document.querySelector("#prevWeekButton"),
  nextWeekButton:document.querySelector("#nextWeekButton"),
  reloadButton:document.querySelector("#reloadButton"),
  weekRange:document.querySelector("#weekRange"),
  weekStatus:document.querySelector("#weekStatus"),
  weekList:document.querySelector("#weekList"),
  customerSection:document.querySelector("#customerSection"),
  selectedSlotText:document.querySelector("#selectedSlotText"),
  reservationForm:document.querySelector("#reservationForm"),
  memberNo:document.querySelector("#memberNo"),
  customerEmail:document.querySelector("#customerEmail"),
  customerPhone:document.querySelector("#customerPhone"),
  note:document.querySelector("#note"),
  formError:document.querySelector("#formError"),
  submitButton:document.querySelector("#submitButton"),
  completeSection:document.querySelector("#completeSection"),
  completeSummary:document.querySelector("#completeSummary"),
  reservationId:document.querySelector("#reservationId"),
  newReservationButton:document.querySelector("#newReservationButton")
};
let serviceCode="";
let serviceName="";
let selectedSlot=null;
let today=startOfDay(new Date());
let weekStart=new Date(today);
let publicDays=30;
let loading=false;

renderPlans();
el.prevWeekButton.addEventListener("click",()=>changeWeek(-7));
el.nextWeekButton.addEventListener("click",()=>changeWeek(7));
el.reloadButton.addEventListener("click",loadWeek);
el.reservationForm.addEventListener("submit",submitReservation);
el.newReservationButton.addEventListener("click",resetAll);

function renderPlans(){
  PLANS.forEach(plan=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="plan-card";
    button.innerHTML=`${plan.name}<small>${plan.description}</small>`;
    button.addEventListener("click",()=>{
      document.querySelectorAll(".plan-card").forEach(x=>x.classList.remove("is-selected"));
      button.classList.add("is-selected");
      serviceCode=plan.code;
      serviceName=plan.name;
      weekStart=new Date(today);
      selectedSlot=null;
      el.customerSection.classList.add("is-hidden");
      el.availabilitySection.classList.remove("is-hidden");
      loadWeek();
      el.availabilitySection.scrollIntoView({behavior:"smooth",block:"start"});
    });
    el.planGrid.append(button);
  });
}

async function loadWeek(){
  if(!serviceCode||loading)return;
  loading=true;
  selectedSlot=null;
  el.customerSection.classList.add("is-hidden");
  el.completeSection.classList.add("is-hidden");
  el.weekStatus.textContent="7日分の空き時間を確認しています…";
  updateNav();

  const dates=Array.from({length:DAYS},(_,i)=>{
    const d=new Date(weekStart);d.setDate(d.getDate()+i);return apiDate(d);
  });

  try{
    const results=await Promise.all(dates.map(fetchSlots));
    const ok=results.find(r=>r.ok&&r.data);
    if(ok?.data?.public_days!==undefined)publicDays=Number(ok.data.public_days)||30;
    renderWeek(results);
    const total=results.reduce((n,r)=>n+(Array.isArray(r.data?.slots)?r.data.slots.length:0),0);
    el.weekStatus.textContent=total?`この7日間に${total}件の空きがあります。`:"この7日間に空きはありません。";
  }catch(e){
    el.weekStatus.textContent=e.message||"取得に失敗しました。";
  }finally{
    loading=false;updateNav();
  }
}

async function fetchSlots(date){
  const url=new URL(API_URL);
  url.searchParams.set("action","getAvailableSlots");
  url.searchParams.set("service_code",serviceCode);
  url.searchParams.set("date",date);
  url.searchParams.set("_",Date.now());
  try{return await (await fetch(url,{cache:"no-store"})).json();}
  catch(e){return {ok:false,message:e.message,data:{date,slots:[]}};}
}

function renderWeek(results){
  el.weekList.replaceChildren();
  results.forEach((result,i)=>{
    const date=new Date(weekStart);date.setDate(date.getDate()+i);
    const row=document.createElement("section");row.className="day-row";
    const label=document.createElement("div");label.className="day-label";
    label.innerHTML=`<strong>${date.getMonth()+1}/${date.getDate()}</strong><span>（${["日","月","火","水","木","金","土"][date.getDay()]}）</span>`;
    const area=document.createElement("div");area.className="day-slots";
    const slots=Array.isArray(result.data?.slots)?result.data.slots:[];
    if(!result.ok||!slots.length){
      const p=document.createElement("p");p.className="no-slots";p.textContent=result.ok?"空きなし":(result.message||"取得失敗");area.append(p);
    }else{
      slots.forEach(slot=>{
        const b=document.createElement("button");b.type="button";b.className="slot-button";b.textContent=slot.start_time;
        b.addEventListener("click",()=>selectSlot(slot,b));area.append(b);
      });
    }
    row.append(label,area);el.weekList.append(row);
  });
  const end=new Date(weekStart);end.setDate(end.getDate()+6);
  el.weekRange.textContent=`${weekStart.getMonth()+1}月${weekStart.getDate()}日〜${end.getMonth()+1}月${end.getDate()}日`;
}

function selectSlot(slot,button){
  document.querySelectorAll(".slot-button").forEach(x=>x.classList.remove("is-selected"));
  button.classList.add("is-selected");
  selectedSlot=slot;
  el.selectedSlotText.textContent=`${jpDate(slot.date)} ${slot.start_time}〜${slot.end_time} / ${serviceName}`;
  el.customerSection.classList.remove("is-hidden");
  el.customerSection.scrollIntoView({behavior:"smooth",block:"start"});
}

function changeWeek(days){
  const next=new Date(weekStart);next.setDate(next.getDate()+days);
  const max=new Date(today);max.setDate(max.getDate()+publicDays);
  if(next<today)weekStart=new Date(today);else if(next<=max)weekStart=next;
  loadWeek();
}

function updateNav(){
  const max=new Date(today);max.setDate(max.getDate()+publicDays);
  const next=new Date(weekStart);next.setDate(next.getDate()+7);
  el.prevWeekButton.disabled=loading||weekStart<=today;
  el.nextWeekButton.disabled=loading||next>max;
  el.reloadButton.disabled=loading;
}

async function submitReservation(event){
  event.preventDefault();
  hideError();
  if(!selectedSlot)return showError("予約時間を選択してください。");
  const memberNo=el.memberNo.value.trim();
  const email=el.customerEmail.value.trim();
  if(!memberNo)return showError("会員番号を入力してください。");
  if(!email)return showError("登録メールアドレスを入力してください。");

  el.submitButton.disabled=true;el.submitButton.textContent="予約処理中…";
  try{
    const payload={
      action:"createReservation",service_code:serviceCode,date:selectedSlot.date,start_time:selectedSlot.start_time,
      customer_type:"MEMBER",member_no:memberNo,customer_name:"会員照合中",customer_email:email,
      customer_phone:el.customerPhone.value.trim(),note:el.note.value.trim()
    };
    const result=await (await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)})).json();
    if(!result.ok)throw new Error(userMessage(result));
    el.customerSection.classList.add("is-hidden");
    el.completeSection.classList.remove("is-hidden");
    el.completeSummary.textContent=`${jpDate(result.data.date)} ${result.data.start_time}〜${result.data.end_time} / ${serviceName}`;
    el.reservationId.textContent=result.data.reservation_id;
    el.completeSection.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(e){showError(e.message||"予約に失敗しました。");}
  finally{el.submitButton.disabled=false;el.submitButton.textContent="この内容で予約する";}
}

function userMessage(r){
  const m={
    MEMBER_NOT_FOUND:"会員番号が確認できません。",
    MEMBER_EMAIL_MISMATCH:"会員番号と登録メールが一致しません。",
    MEMBER_INACTIVE:"現在有効な会員番号ではありません。",
    SLOT_NOT_AVAILABLE:"選択した時間は埋まりました。空き状況を更新してください。",
    SERVICE_NOT_FOUND:"選択したプランのサービス設定がありません。"
  };
  return m[r.code]||r.message||"予約に失敗しました。";
}
function resetAll(){el.reservationForm.reset();selectedSlot=null;el.customerSection.classList.add("is-hidden");el.completeSection.classList.add("is-hidden");loadWeek();}
function showError(t){el.formError.textContent=t;el.formError.classList.remove("is-hidden");}
function hideError(){el.formError.textContent="";el.formError.classList.add("is-hidden");}
function startOfDay(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function apiDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function jpDate(v){const [y,m,d]=v.split("-").map(Number);const dt=new Date(y,m-1,d);return `${y}年${m}月${d}日（${["日","月","火","水","木","金","土"][dt.getDay()]}）`;}
