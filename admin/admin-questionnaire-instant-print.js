(()=>{
  "use strict";

  const PRINT_VIEW_PATH="./questionnaire-print.html";
  let activeReservation=null;

  function stateSchedule_(){
    return window.state?.staffSchedule ||
      (typeof state!=="undefined" ? state.staffSchedule : null) || {};
  }

  function orderedReservations_(d){
    const reservations=(Array.isArray(d?.reservations)?d.reservations:[])
      .filter(r=>String(r?.status||"").trim().toUpperCase()!=="CANCELLED");
    const shifts=Array.isArray(d?.shifts)?d.shifts:[];
    const staffCodes=[...new Set([
      ...shifts.map(x=>x.staff_code),
      ...reservations.map(x=>x.staff_code)
    ].filter(Boolean))];
    const ordered=[];
    staffCodes.forEach(code=>{
      reservations
        .filter(x=>x.staff_code===code)
        .sort((a,b)=>String(a.start_time||"").localeCompare(String(b.start_time||"")))
        .forEach(r=>ordered.push(r));
    });
    return ordered;
  }

  function captureReservation_(button){
    const row=button?.closest(".staff-reservation-row");
    if(!row)return null;
    const rows=[...document.querySelectorAll("#staffScheduleBoard .staff-reservation-row")];
    const index=rows.indexOf(row);
    if(index<0)return null;
    activeReservation=orderedReservations_(stateSchedule_())[index]||null;
    return activeReservation;
  }

  function firstValue_(obj,keys){
    for(const key of keys){
      const value=String(obj?.[key]??"").trim();
      if(value)return value;
    }
    return "";
  }

  function formatPostal_(reservation){
    const raw=firstValue_(reservation,[
      "customer_postal_code","postal_code","postal","zip_code","zip",
      "customer_zip_code","customer_zip"
    ]);
    const digits=raw.replace(/\D/g,"");
    if(!digits)return "";
    if(digits.length===7)return "〒"+digits.slice(0,3)+"-"+digits.slice(3);
    return "〒"+digits;
  }

  function address_(reservation){
    const direct=firstValue_(reservation,["customer_address","address"]);
    if(direct)return direct;
    return [
      reservation?.prefecture,
      reservation?.city,
      reservation?.address1,
      reservation?.address_detail,
      reservation?.address2,
      reservation?.building
    ].map(v=>String(v??"").trim()).join("");
  }

  function formatPhone_(reservation){
    const raw=firstValue_(reservation,["customer_phone","phone","tel","telephone"]);
    if(!raw)return "";
    const digits=raw.replace(/\D/g,"");
    if(digits.length===11 && digits.startsWith("0")){
      return digits.slice(0,3)+"-"+digits.slice(3,7)+"-"+digits.slice(7);
    }
    if(digits.length===10 && digits.startsWith("0")){
      return digits.slice(0,2)+"-"+digits.slice(2,6)+"-"+digits.slice(6);
    }
    return raw;
  }

  function visitDateTime_(reservation){
    const rawDate=firstValue_(reservation,["date","reservation_date"]).slice(0,10);
    const start=String(reservation?.start_time||"").trim();
    const end=String(reservation?.end_time||"").trim();
    let dateText=rawDate;
    const match=rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(match){
      const year=Number(match[1]);
      const month=Number(match[2]);
      const day=Number(match[3]);
      const date=new Date(year,month-1,day);
      const weekdays=["日","月","火","水","木","金","土"];
      dateText=year+"年"+month+"月"+day+"日("+weekdays[date.getDay()]+")";
    }
    if(start&&end)return dateText+" "+start+"〜"+end;
    if(start)return dateText+" "+start+"〜";
    return dateText;
  }

  function buildPayload_(reservation,mode){
    const blank=mode==="BLANK";
    const addressOnly=mode==="ADDRESS_ONLY";
    const name=firstValue_(reservation,["customer_name","name"]);
    return {
      version:2,
      mode:mode,
      service_code:String(reservation?.service_code||"").trim().toUpperCase(),
      name:blank||addressOnly||!name?"":name+" さま",
      postal:blank?"":formatPostal_(reservation),
      address:blank?"":address_(reservation),
      phone:blank||addressOnly?"":formatPhone_(reservation),
      email:blank||addressOnly?"":firstValue_(reservation,["customer_email","email"]),
      visit_datetime:blank?"":visitDateTime_(reservation)
    };
  }

  function base64UrlEncodeUtf8_(value){
    const bytes=new TextEncoder().encode(value);
    let binary="";
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk){
      binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    }
    return btoa(binary)
      .replace(/\+/g,"-")
      .replace(/\//g,"_")
      .replace(/=+$/g,"");
  }

  function printUrl_(reservation,mode){
    const payload=buildPayload_(reservation,mode);
    const encoded=base64UrlEncodeUtf8_(JSON.stringify(payload));
    return new URL(PRINT_VIEW_PATH,window.location.href).href+"#"+encoded;
  }

  function polishModal_(){
    const modal=document.querySelector('.tour-print-modal[aria-label="アンケート閲覧・印刷"]');
    if(!modal)return;
    const p=modal.querySelector(".tour-print-head p");
    if(p)p.textContent="転記内容を選択してアンケートを表示します。";
    const btn=modal.querySelector("#tourPrintGenerate");
    if(btn)btn.textContent="アンケートを表示";
  }

  document.addEventListener("click",event=>{
    const questionnaireButton=event.target.closest?.(".tour-print-button");
    if(questionnaireButton){
      captureReservation_(questionnaireButton);
      setTimeout(polishModal_,0);
      return;
    }

    const generateButton=event.target.closest?.("#tourPrintGenerate");
    if(!generateButton)return;
    if(!activeReservation || typeof TextEncoder==="undefined" || typeof btoa!=="function")return;

    const modal=generateButton.closest(".tour-print-modal");
    const mode=modal?.querySelector('input[name="tourPrintMode"]:checked')?.value||"FULL";

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try{
      const url=printUrl_(activeReservation,mode);
      const preview=window.open(url,"_blank");
      if(!preview){
        const msg=modal?.querySelector("#tourPrintMessage");
        if(msg){
          msg.style.color="#b42318";
          msg.textContent="新しいタブを開けませんでした。ポップアップを許可して再度お試しください。";
        }
        return;
      }
      const msg=modal?.querySelector("#tourPrintMessage");
      if(msg){
        msg.style.color="#067647";
        msg.textContent="アンケートを開きました。印刷時は「両面・長辺とじ」を選択してください。";
      }
      setTimeout(()=>modal?.closest(".tour-print-overlay")?.remove(),80);
    }catch(error){
      const msg=modal?.querySelector("#tourPrintMessage");
      if(msg){
        msg.style.color="#b42318";
        msg.textContent=error?.message||"アンケートを表示できませんでした。";
      }
    }
  },true);
})();
