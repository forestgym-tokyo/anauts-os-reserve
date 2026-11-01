(function(){
"use strict";
const API="https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
const SERVICE="TOUR";
const GO_LIVE=Date.parse("2026-10-31T15:00:00Z"); // 2026/11/01 00:00 JST
const PREVIEW=new URLSearchParams(location.search).get("preview")==="1";
const DAY_MS=86400000;
const DAY_NAMES=["日","月","火","水","木","金","土"];
const q=id=>document.getElementById(id);
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const SCHEDULE_TTL=60000;
const SCHEDULE_STORAGE="tfg-tour-slots-v2"+(PREVIEW?"-preview":"");
const scheduleCache=new Map();
let sequence=0;
let busy=false;
let pendingRequest=null;
let submissionUncertain=false;
let scheduleCheckedAt=0;
const state={today:todayJst(),weekStart:"",date:"",slot:null,days:[],maxDate:"",partySize:1,result:null};
if(PREVIEW && state.today<"2026-11-01")state.today="2026-11-01";
state.weekStart=state.today;
state.date=state.today;
state.maxDate=addDays(state.today,30);
function todayJst(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/\//g,"-");}
function addDays(date,n){return new Date(Date.parse(date+"T00:00:00Z")+n*DAY_MS).toISOString().slice(0,10);}
function dateParts(date){const d=new Date(date+"T12:00:00+09:00");return{month:d.getUTCMonth()+1,day:d.getUTCDate(),weekday:d.getUTCDay()};}
function shortDate(date){const v=dateParts(date);return v.month+"月"+v.day+"日（"+DAY_NAMES[v.weekday]+"）";}
function minute(time){const x=String(time||"").match(/^(\d{1,2}):(\d{2})$/);return x?Number(x[1])*60+Number(x[2]):-1;}
function fmtTime(n){return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
function node(tag,className,text){const x=document.createElement(tag);if(className)x.className=className;if(text!==undefined)x.textContent=text;return x;}
function notify(msg,error){const e=q("notice");e.textContent=msg||"";e.hidden=!msg;e.classList.toggle("error",!!error);}
function updateModeNotice(){
  const msg=PREVIEW?"確認用画面です。入力内容の確認までお試しいただけます。予約・メール送信は行われません。":Date.now()<GO_LIVE?"11月1日午前0時から予約を受け付けます。":"";
  const e=q("modeNotice");if(e.textContent!==msg)e.textContent=msg;e.hidden=!msg;
}
function formError(msg){q("formError").textContent=msg;q("formError").hidden=!msg;}
function setStep(i){document.querySelectorAll("[data-step]").forEach(x=>x.classList.toggle("is-current",Number(x.dataset.step)===i));}
function updateBusy(flag){busy=!!flag;q("previousWeek").disabled=busy||state.weekStart<=state.today;q("nextWeek").disabled=busy||addDays(state.weekStart,7)>state.maxDate;q("reloadSchedule").disabled=busy;q("detailsFields").disabled=busy||!state.slot;q("submitBooking").disabled=busy||!state.slot||(!PREVIEW&&Date.now()<GO_LIVE)||submissionUncertain;q("bookingLayout").setAttribute("aria-busy",String(busy));updateModeNotice();}
function canBook(slot,day){
  if(!slot||minute(slot.start_time)<540||minute(slot.start_time)>1200||minute(slot.start_time)%30!==0)return false;
  if(slot.date && slot.date!==day)return false;
  if(Number(slot.capacity==null?1:slot.capacity)<=0)return false;
  const start=Date.parse(day+"T"+fmtTime(minute(slot.start_time))+":00+09:00");
  const deadline=Date.parse(slot.booking_deadline_at||"");
  // Missing authoritative deadline means the backend has not been upgraded: fail closed.
  return Number.isFinite(start)&&Number.isFinite(deadline)&&Date.now()<deadline;
}
function renderDates(){
  const strip=q("dateStrip");strip.replaceChildren();
  const first=state.weekStart, last=addDays(first,6);
  q("weekLabel").textContent=shortDate(first).replace(/（.）/,"")+" — "+shortDate(last).replace(/（.）/,"");
  for(let i=0;i<7;i++){
    const day=addDays(first,i),data=state.days[i],valid=day<=state.maxDate;
    const p=dateParts(day);
    const b=node("button","date-button"+(day===state.date?" is-selected":"")+(valid&&data?.ok&&data.data?.slots?.some(s=>canBook(s,day))?" has-slots":""),undefined);
    b.type="button";b.disabled=busy||!valid;
    b.setAttribute("aria-label",shortDate(day));
    b.setAttribute("aria-pressed",String(day===state.date));
    b.append(node("span","",DAY_NAMES[p.weekday]),node("strong","",String(p.day)),node("i"));
    b.addEventListener("click",()=>{state.date=day;state.slot=null;renderDates();renderSlots();renderSelected();});
    strip.append(b);
  }
  updateBusy(busy);
}
function renderSlots(){
  const box=q("slots");box.replaceChildren();
  q("selectedDateLabel").textContent=shortDate(state.date)+" の予約時間";
  const r=state.days.find(x=>x?.data?.date===state.date);
  if(!r){
    box.append(node("p","empty-state","空き状況を確認しています…"));return;
  }
  if(!r.ok){
    box.append(node("p","empty-state",r.message||"空き状況を取得できませんでした。"));return;
  }
  const map=new Map();
  (r.data.slots||[]).forEach(s=>{if(canBook(s,state.date))map.set(minute(s.start_time),s);});
  for(let t=540;t<=1200;t+=30){
    const slot=map.get(t),available=!!slot;
    const active=available&&state.slot&&state.slot.date===state.date&&minute(state.slot.start_time)===t;
    const b=node("button","slot-button"+(active?" is-selected":""),undefined);
    b.type="button";b.disabled=busy||!available;
    b.setAttribute("aria-label",fmtTime(t)+(available?" 予約可能":" 受付不可"));
    b.setAttribute("aria-pressed",String(!!active));
    b.append(node("strong","",fmtTime(t)),node("span","",(available?(active?"選択中":"予約可"):"受付不可")));
    b.addEventListener("click",()=>chooseSlot(slot));
    box.append(b);
  }
}
function chooseSlot(slot){
  if(busy||!canBook(slot,state.date))return;
  state.slot=slot;
  renderSlots();renderSelected();setStep(2);formError("");
  const form=q("formTitle");
  if(window.matchMedia("(max-width:900px)").matches)form.scrollIntoView({behavior:"smooth",block:"start"});
}
function renderSelected(){
  const selection=q("selection");selection.replaceChildren();
  if(!state.slot){
    selection.append(node("p","","まずは、ご希望の日時をお選びください。"));
    setStep(1);
  }else{
    selection.append(node("span","selection-icon","✓"));
    const p=node("p");
    p.append(node("span","","選択中の見学日時"),node("br"),node("strong","",shortDate(state.slot.date)+" "+fmtTime(minute(state.slot.start_time))));
    selection.append(p);
  }
  updateBusy(busy);
}
function updateParty(){
  const two=q("partySize").value==="2";
  state.partySize=two?2:1;
  q("guest2Fields").hidden=!two;
  ["name2","phone2","email2"].forEach(id=>{q(id).required=two;q(id).disabled=!two;});
}
async function jsonGet(url,timeout=45000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{cache:"no-store",signal:controller.signal});
    if(!r.ok)throw new Error("通信エラー（"+r.status+"）");
    return await r.json();
  }finally{clearTimeout(timer);}
}
async function getRange(from,days=7){
  const url=new URL(API);
  url.searchParams.set("action","getAvailableSlotsRange");
  url.searchParams.set("service_code",SERVICE);
  url.searchParams.set("start_date",from);
  url.searchParams.set("days",String(days));
  url.searchParams.set("_",String(Date.now()));
  let previous;
  for(let n=0;n<2;n++){
    try{
      const res=await jsonGet(url.toString(),20000);
      if(res.ok&&Array.isArray(res.data?.results)&&res.data.results.length===days)return res.data.results;
      const error=new Error(res.message||"空き状況を取得できませんでした");
      error.code=res.code||"";
      throw error;
    }catch(e){previous=e;if(n===0&&e.code==="TOUR_AVAILABILITY_BUSY"){await new Promise(r=>setTimeout(r,1000));continue;}break;}
  }
  throw previous||new Error("空き状況の取得に失敗しました。");
}
function normalizeRange(res,from,days=7){
  return Array.from({length:days},(_,i)=>{
    const day=addDays(from,i),v=res[i];
    return{ok:!!v?.ok,message:v?.message||"",data:{date:day,slots:v?.ok&&Array.isArray(v.data?.slots)?v.data.slots:[]}};
  });
}
function cachedDay(day){
  const item=scheduleCache.get(day);
  return item&&Date.now()-item.at>=0&&Date.now()-item.at<SCHEDULE_TTL?item.row:null;
}
function restoreScheduleCache(){
  try{
    const saved=JSON.parse(sessionStorage.getItem(SCHEDULE_STORAGE)||"[]");
    if(Array.isArray(saved))for(const [day,item] of saved){
      if(DATE_RE.test(day)&&item?.row?.ok&&item.row.data?.date===day&&Array.isArray(item.row.data.slots))scheduleCache.set(day,item);
    }
  }catch(_){}
}
function saveScheduleCache(){
  for(const [day] of scheduleCache)if(!cachedDay(day))scheduleCache.delete(day);
  try{sessionStorage.setItem(SCHEDULE_STORAGE,JSON.stringify([...scheduleCache]));}catch(_){}
}
function clearScheduleCache(){scheduleCache.clear();try{sessionStorage.removeItem(SCHEDULE_STORAGE);}catch(_){}}
function renderSchedule(){renderDates();renderSlots();renderSelected();}
async function loadSchedule(options={}){
  if(busy||state.result)return;
  const seq=++sequence,from=state.weekStart,previousDate=state.date;
  const dates=Array.from({length:7},(_,i)=>addDays(from,i));
  const previousSlot=options.keepSlot?state.slot:null;
  state.slot=null;
  state.date=options.keepDay&&dates.includes(previousDate)?previousDate:from;
  if(options.force)dates.forEach(day=>scheduleCache.delete(day));
  state.days=dates.map(day=>cachedDay(day));
  const missing=dates.filter((day,i)=>!state.days[i]&&day<=state.maxDate);
  updateBusy(!cachedDay(state.date));renderSchedule();
  notify("");
  async function receive(start,count){
    let rows;
    try{
      rows=normalizeRange(await getRange(start,count),start,count);
      for(const row of rows)if(row.ok)scheduleCache.set(row.data.date,{at:Date.now(),row});
      saveScheduleCache();
    }catch(_){
      rows=Array.from({length:count},(_,i)=>({ok:false,message:"空き状況を取得できませんでした。更新ボタンから再度お試しください。",data:{date:addDays(start,i),slots:[]}}));
    }
    if(seq!==sequence||state.result)return;
    for(const row of rows){const index=dates.indexOf(row.data.date);if(index>=0)state.days[index]=row;}
    if(!busy)renderSchedule();
  }
  // Read the week once: each range request otherwise rereads the same sheets and calendar.
  // Existing days remain visible while only the missing contiguous ranges are fetched.
  const groups=[];
  for(const day of missing){const last=groups.at(-1);if(last&&addDays(last.start,last.count)===day)last.count++;else groups.push({start:day,count:1});}
  await Promise.all(groups.map(group=>receive(group.start,group.count)));
  if(seq!==sequence||state.result)return;
  if(previousSlot){
    const row=state.days.find(x=>x?.data?.date===previousSlot.date);
    state.slot=row?.data.slots.find(s=>s.start_time===previousSlot.start_time&&canBook(s,previousSlot.date))||null;
  }
  updateBusy(false);renderSchedule();scheduleCheckedAt=Date.now();
  if(seq!==sequence||state.result)return;
  const failed=state.days.filter(x=>x&&!x.ok&&x.data.date<=state.maxDate).length;
  if(failed)notify(failed+"日分の空き状況を確認できませんでした。更新ボタンから再度お試しください。",true);
}
function shiftWeek(n){
  if(busy)return;
  const next=addDays(state.weekStart,n*7);
  if(next<state.today||next>state.maxDate)return;
  state.weekStart=next;state.date=next;loadSchedule();
}
function validGuest(i){
  const name=q("name"+i).value.trim();
  const phone=q("phone"+i).value.trim();
  const email=q("email"+i).value.trim();
  if(!name){formError("見学者"+i+"の氏名を入力してください。");q("name"+i).focus();return null;}
  if(!/^[+0-9()\-\s]{9,25}$/.test(phone)||phone.replace(/\D/g,"").length<9){formError("見学者"+i+"の電話番号を正しく入力してください。");q("phone"+i).focus();return null;}
  if(!email||!q("email"+i).checkValidity()){formError("見学者"+i+"のメールアドレスを正しく入力してください。");q("email"+i).focus();return null;}
  return{name,phone,email};
}
async function waitForBookingReceipt(payload,signal){
  const end=Date.now()+60000;
  while(!signal.aborted&&Date.now()<end){
    await new Promise(resolve=>{
      const done=()=>{clearTimeout(timer);signal.removeEventListener("abort",done);resolve();};
      const timer=setTimeout(done,1500);signal.addEventListener("abort",done,{once:true});
    });
    if(signal.aborted)break;
    try{
      const url=new URL(API);
      url.searchParams.set("action","getTourBookingStatus");
      url.searchParams.set("request_id",payload.request_id);
      const response=await jsonGet(url.toString(),7000);
      const data=response.data;
      if(response.ok&&data?.confirmed===true&&data.status==="RESERVED"&&data.reservation_id&&
        data.date===payload.date&&data.start_time===payload.start_time&&data.party_size===payload.party_size)return response;
    }catch(_){}
  }
  throw new Error("予約の処理を確認できませんでした。確認メールをご確認ください。");
}
async function registerBooking(payload){
  const stop=new AbortController();
  const receipt=waitForBookingReceipt(payload,stop.signal);
  const request=fetch(API,{method:"POST",keepalive:true,headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)})
    .then(async response=>{
      if(!response.ok)throw new Error("通信エラー（"+response.status+"）");
      return response.json();
    }).then(result=>{
      if(result.ok&&state.result?.reservation_id===result.data?.reservation_id&&result.data?.mail_status==="pending")
        notify("予約は完了しましたが、確認メールの送信に失敗しました。再度予約せず、店舗へお問い合わせください。",true);
      return result;
    }).catch(async error=>{
      // If the POST connection drops after saving, recover its committed result.
      try{return await receipt;}catch(_){throw error;}
    });
  try{
    // The original POST continues delivering every guest's mail after the saved receipt wins.
    return await Promise.race([request,receipt]);
  }finally{stop.abort();}
}
async function submit(e){
  e.preventDefault();formError("");notify("");
  if(busy)return;
  if(!PREVIEW&&Date.now()<GO_LIVE){formError("実際の予約は11月1日午前0時から受け付けます。");return;}
  if(q("website").value.trim())return;
  if(!state.slot||!canBook(state.slot,state.date)){formError("予約日時を選び直してください。");return;}
  const one=validGuest(1);
  if(!one)return;
  const two=state.partySize===2?validGuest(2):null;
  if(state.partySize===2&&!two)return;
  const slot=state.slot;
  if(PREVIEW){renderPreviewReview(slot,two?[one,two]:[one]);return;}
  const payload={
    action:"createReservation",service_code:SERVICE,
    date:slot.date,start_time:fmtTime(minute(slot.start_time)),
    customer_type:"VISITOR",
    customer_name:one.name,customer_email:one.email,customer_phone:one.phone,
    party_size:state.partySize,
    guests:two?[one,two]:[one],
    note:state.partySize===2
      ?"見学人数：2名\n見学者2 氏名："+two.name+"\n見学者2 電話番号："+two.phone+"\n見学者2 メールアドレス："+two.email
      :"見学人数：1名"
  };
  const fingerprint=JSON.stringify(payload);
  if(!pendingRequest||pendingRequest.fingerprint!==fingerprint)pendingRequest={fingerprint,id:crypto.randomUUID()};
  payload.request_id=pendingRequest.id;
  updateBusy(true);q("submitBooking").textContent="予約しています…";
  try{
    submissionUncertain=true;
    const result=await registerBooking(payload);
    submissionUncertain=false;
    if(!result.ok){
      const byCode={SLOT_NOT_AVAILABLE:"この時間は満枠になりました。別の時間を選んでください。",NO_WORKING_STAFF:"この時間に対応可能なスタッフがいません。別の時間を選んでください。",BOOKING_DEADLINE_PASSED:"この時間の予約受付は終了しました。",DATE_OUT_OF_PUBLIC_RANGE:"この日付は予約期間外です。"};
      throw new Error(byCode[result.code]||result.message||"予約できませんでした。");
    }
    pendingRequest=null;
    clearScheduleCache();
    state.result={...result.data,party_size:state.partySize,name:one.name};
    q("bookingLayout").hidden=true;
    q("resultPanel").hidden=false;
    const dl=q("resultDetails");dl.replaceChildren();
    for(const [label,value] of [["見学日",shortDate(slot.date)],["見学時間",fmtTime(minute(slot.start_time))],["見学人数",state.partySize+"名"],["予約番号",result.data?.reservation_id||"予約済み"]]){
      dl.append(node("dt","",label),node("dd","",value));
    }
    if(result.data?.mail_status==="pending")notify("予約は完了しましたが、確認メールの送信に失敗しました。再度予約せず、店舗へお問い合わせください。",true);
    setStep(3);q("resultPanel").scrollIntoView({behavior:"smooth",block:"start"});
    if(typeof window.gtag==="function")window.gtag("event","visit_reservation_complete",{service_code:"TOUR",party_size:state.partySize});
  }catch(err){
    formError(err.message||"予約の処理を確認できませんでした。確認メールが届いているかご確認ください。");
    // 通信切断時の二重登録を防ぐため、再送前に空き状況を確認していただく。
    if(submissionUncertain)formError("通信状況を確認できませんでした。再度予約する前に、確認メールをご確認ください。");
  }finally{q("submitBooking").textContent="この内容で見学予約する →";updateBusy(false);}
}
function renderPreviewReview(slot,guests){
  state.result={preview:true};
  const dl=q("resultDetails");dl.replaceChildren();
  const details=[["見学日",shortDate(slot.date)],["見学時間",fmtTime(minute(slot.start_time))],["見学人数",guests.length+"名"]];
  guests.forEach((guest,index)=>{
    details.push(["見学者"+(index+1)+" 氏名",guest.name],["電話番号",guest.phone],["メールアドレス",guest.email]);
  });
  details.forEach(([label,value])=>dl.append(node("dt","",label),node("dd","",value)));
  q("bookingLayout").hidden=true;q("resultPanel").hidden=false;
  setStep(3);q("resultPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
function configureAnalytics(){
  if(PREVIEW)return;
  window.dataLayer=window.dataLayer||[];
  window.gtag=function(){window.dataLayer.push(arguments);};
  window.gtag("js",new Date());
  window.gtag("config","G-E3E38WJLME");
  const s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=G-E3E38WJLME";document.head.append(s);
}
function init(){
  q("previousWeek").addEventListener("click",()=>shiftWeek(-1));
  q("nextWeek").addEventListener("click",()=>shiftWeek(1));
  q("reloadSchedule").addEventListener("click",()=>loadSchedule({keepDay:true,force:true}));
  q("partySize").addEventListener("change",updateParty);
  q("applicationForm").addEventListener("submit",submit);
  q("editPreview").addEventListener("click",()=>{
    if(!PREVIEW)return;
    state.result=null;
    q("bookingLayout").hidden=false;q("resultPanel").hidden=true;
    renderSelected();setStep(state.slot?2:1);q("formTitle").scrollIntoView({behavior:"smooth",block:"start"});
  });
  updateParty();configureAnalytics();
  if(PREVIEW){
    q("submitBooking").textContent="入力内容を確認する →";
    q("lastStepLabel").textContent="入力内容の確認";
    q("resultEyebrow").textContent="CHECK YOUR DETAILS.";
    q("resultTitle").textContent="入力内容の確認";
    q("resultMessage").textContent="確認用画面です。予約は確定していません。";
    q("resultNote").textContent="この画面から予約・メール送信は行われません。";
    q("editPreview").hidden=false;
  }
  restoreScheduleCache();
  loadSchedule();
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden&&!busy&&!state.result&&Date.now()-scheduleCheckedAt>=SCHEDULE_TTL)loadSchedule({keepDay:true,keepSlot:true});
  });
}
init();
})();
