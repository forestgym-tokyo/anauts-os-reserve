/**
 * A-nauts OS Reserve
 * 店内見学アンケート 表示・印刷アドオン v28
 *
 * admin.js の後に読み込む。
 * スタッフ予定の TOUR 行へ「アンケート表示・印刷」を追加する。
 */
(function(){
  "use strict";

  function e(v){
    return String(v ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  function postal(v){
    const d=String(v||"").replace(/\D/g,"");
    if(d.length===7)return "〒"+d.slice(0,3)+"-"+d.slice(3);
    return d ? "〒"+d : "";
  }

  function jpDate(dateText){
    const p=String(dateText||"").split("-").map(Number);
    if(p.length!==3||!p[0])return String(dateText||"");
    const d=new Date(p[0],p[1]-1,p[2]);
    const w=["日","月","火","水","木","金","土"];
    return `${p[0]}年${p[1]}月${p[2]}日(${w[d.getDay()]})`;
  }

  function pageHtml(imageUrl, overlays){
    return `
      <section class="sheet">
        <img class="base" src="${e(imageUrl)}">
        ${overlays.join("")}
      </section>`;
  }

  function textAt(cls, value){
    return `<div class="fill ${cls}">${e(value)}</div>`;
  }

  function openQuestionnaire(r, mode="FULL"){
    const w=window.open("","_blank");
    if(!w){
      alert("印刷画面を開けませんでした。ブラウザのポップアップを許可してください。");
      return;
    }

    const base=new URL("./assets/", location.href);
    const front=new URL("tour-questionnaire-front.png",base).href;
    const back=new URL("tour-questionnaire-back.png",base).href;

    const fullAddress =
      String(r.address||"").trim() ||
      `${String(r.prefecture||"").trim()}${String(r.city||"").trim()}${String(r.address_detail||"").trim()}`;

    const dateText=jpDate(r.date||r.reservation_date);
    const timeText=`${String(r.start_time||"")} - ${String(r.end_time||"")}`;

    const addressOnly =
      String(mode||"").toUpperCase()==="ADDRESS_ONLY";

    const frontOverlays=[
      textAt("front-name", addressOnly ? "" : (r.customer_name||"")),
      textAt("front-postal", postal(r.postal_code)),
      textAt("front-address", fullAddress),
      textAt("front-phone", addressOnly ? "" : (r.customer_phone||"")),
      textAt("front-email", addressOnly ? "" : (r.customer_email||"")),
      textAt("front-booking", `${dateText} ${timeText}`)
    ];

    const backOverlays=[
      textAt("back-date", dateText.replace(/\(.+?\)$/,"")),
      textAt("back-name", addressOnly ? "" : (r.customer_name||""))
    ];

    w.document.open();
    w.document.write(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${String(mode||"").toUpperCase()==="ADDRESS_ONLY" ? "同伴者用アンケート（住所のみ）" : "店内見学アンケート"} - ${e(r.customer_name||"")}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;background:#d8d8d8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic","Meiryo",sans-serif}
  .toolbar{position:sticky;top:0;z-index:20;background:#111;color:#fff;padding:12px;text-align:center}
  .toolbar button{border:0;border-radius:8px;padding:11px 22px;font-size:16px;font-weight:800;cursor:pointer}
  .sheet{position:relative;width:210mm;height:297mm;margin:10mm auto;background:#fff;overflow:hidden;page-break-after:always}
  .sheet:last-child{page-break-after:auto}
  .base{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
  .fill{position:absolute;z-index:3;color:#111;white-space:nowrap;font-size:10.5pt;line-height:1.2}
  .front-name{left:21.2%;top:13.8%;font-size:11pt}
  .front-postal{left:16.1%;top:17.05%;font-size:10.5pt}
  .front-address{left:16.1%;top:19.15%;font-size:10.5pt;max-width:58%;white-space:normal}
  .front-phone{left:22.8%;top:22.42%;font-size:10.5pt}
  .front-email{left:22.0%;top:25.55%;font-size:10.2pt}
  .front-booking{left:8.3%;top:87.55%;font-size:10.3pt}
  .back-date{left:35.0%;top:82.2%;font-size:10.5pt}
  .back-name{left:56.0%;top:82.2%;font-size:10.5pt}
  @media print{
    html,body{background:#fff}
    .toolbar{display:none!important}
    .sheet{margin:0;width:210mm;height:297mm}
    @page{size:A4 portrait;margin:0}
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">印刷する</button></div>
${pageHtml(front,frontOverlays)}
${pageHtml(back,backOverlays)}
</body></html>`);
    w.document.close();
  }

  function enhance(d){
    const reservations=Array.isArray(d?.reservations)?d.reservations:[];
    const shifts=Array.isArray(d?.shifts)?d.shifts:[];
    const staffCodes=[...new Set([
      ...shifts.map(x=>x.staff_code),
      ...reservations.map(x=>x.staff_code)
    ].filter(Boolean))];

    const ordered=[];
    staffCodes.forEach(code=>{
      reservations
        .filter(x=>x.staff_code===code)
        .sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)))
        .forEach(r=>ordered.push(r));
    });

    const rows=[...document.querySelectorAll("#staffScheduleBoard .staff-reservation-row")];
    rows.forEach((row,i)=>{
      const r=ordered[i];
      if(!r || String(r.service_code||"").toUpperCase()!=="TOUR")return;
      if(row.querySelector(".tour-questionnaire-button"))return;

      const actions=document.createElement("span");
      actions.className="tour-questionnaire-actions";
      actions.style.display="inline-flex";
      actions.style.gap="8px";
      actions.style.marginLeft="10px";
      actions.style.flexWrap="wrap";

      const b=document.createElement("button");
      b.type="button";
      b.className="ghost-button tour-questionnaire-button";
      b.textContent="本人用アンケート";
      b.onclick=(ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        openQuestionnaire(r, "FULL");
      };

      const family=document.createElement("button");
      family.type="button";
      family.className="ghost-button tour-questionnaire-button";
      family.textContent="同伴者用（住所のみ）";
      family.onclick=(ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        openQuestionnaire(r, "ADDRESS_ONLY");
      };

      actions.appendChild(b);
      actions.appendChild(family);
      row.appendChild(actions);
    });
  }

  const boot=()=>{
    if(typeof window.renderStaffSchedule!=="function"){
      setTimeout(boot,200);
      return;
    }
    if(window.__tourQuestionnaireWrapped)return;
    window.__tourQuestionnaireWrapped=true;

    const original=window.renderStaffSchedule;
    window.renderStaffSchedule=function(d){
      const result=original.apply(this,arguments);
      setTimeout(()=>enhance(d),0);
      return result;
    };

    if(window.state?.staffSchedule){
      setTimeout(()=>enhance(window.state.staffSchedule),0);
    }
  };

  boot();
})();
