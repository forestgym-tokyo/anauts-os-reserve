(()=>{
  "use strict";

  const WITHDRAWAL_URL="https://forestgym-tokyo.github.io/withdrawal-form/";

  const q=s=>document.querySelector(s);
  const qa=s=>document.querySelectorAll(s);

  function isLoggedIn(){
    try{return !!state?.authUser;}
    catch(_){return false;}
  }

  function normalizeMemberNo(value){
    return String(value||"").replace(/\D/g,"").slice(-6);
  }

  function buildUrl(memberNo="",email=""){
    const url=new URL(WITHDRAWAL_URL);
    const no=normalizeMemberNo(memberNo);
    if(no)url.searchParams.set("memberNo",no);
    if(email)url.searchParams.set("email",String(email).trim());
    url.searchParams.set("source","anauts-reserve");
    return url.toString();
  }

  function openForm(memberNo="",email=""){
    window.open(buildUrl(memberNo,email),"_blank","noopener");
  }

  function extractMemberNo(text){
    const s=String(text||"");
    const labeled=s.match(/会員番号\s*([A-Za-z]*\d{6}|\d{6})/i);
    if(labeled)return normalizeMemberNo(labeled[1]);
    const any=s.match(/(?:FRG|FWD|NGT)?\d{6}/i);
    return any?normalizeMemberNo(any[0]):"";
  }

  function syncNav(){
    const btn=q("#withdrawalFormNav");
    if(btn)btn.classList.toggle("is-hidden",!isLoggedIn());
  }

  function buildNav(){
    if(q("#withdrawalFormNav"))return;
    const nav=q(".topnav");
    if(!nav)return;

    const btn=document.createElement("button");
    btn.id="withdrawalFormNav";
    btn.type="button";
    btn.className="nav-button is-hidden";
    btn.innerHTML="<span>🚪</span>退会申請";
    btn.title="退会申請フォームを開く";
    btn.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      openForm();
    });

    const ref=q('[data-view="registration"]');
    if(ref)nav.insertBefore(btn,ref);
    else nav.appendChild(btn);
    syncNav();
  }

  function makeShortcut(memberNo){
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="danger-ghost withdrawal-form-shortcut";
    btn.textContent="退会申請";
    btn.title="退会申請フォームを開く";
    btn.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      openForm(memberNo);
    });
    return btn;
  }

  function wrapActions(row,existingButton,newButton){
    if(!existingButton||row.querySelector(".withdrawal-link-actions"))return;
    const actions=document.createElement("div");
    actions.className="withdrawal-link-actions";
    existingButton.replaceWith(actions);
    actions.appendChild(existingButton);
    actions.appendChild(newButton);
  }

  function enhanceEventCalendar(){
    qa("#ecDetail .ecal-detail-row").forEach(row=>{
      if(row.dataset.withdrawalLinked==="1")return;
      const service=row.querySelector(".ecal-detail-main strong")?.textContent||"";
      if(!service.includes("退会"))return;
      const memberNo=extractMemberNo(row.querySelector(".ecal-detail-main small")?.textContent||"");
      const existing=row.querySelector("[data-ec-res]");
      if(!existing)return;
      wrapActions(row,existing,makeShortcut(memberNo));
      row.dataset.withdrawalLinked="1";
    });
  }

  function enhanceStaffSchedule(){
    qa("#staffScheduleBoard .staff-reservation-row").forEach(row=>{
      if(row.dataset.withdrawalLinked==="1")return;
      const service=row.querySelector(".staff-reservation-service strong")?.textContent||"";
      if(!service.includes("退会"))return;
      const memberNo=extractMemberNo(row.querySelector(".staff-reservation-customer small")?.textContent||"");
      const existing=row.querySelector(".reservation-manage-button");
      if(!existing)return;
      wrapActions(row,existing,makeShortcut(memberNo));
      row.dataset.withdrawalLinked="1";
    });
  }

  function enhance(){
    enhanceEventCalendar();
    enhanceStaffSchedule();
  }

  function ensureStyle(){
    if(q("#withdrawalLinkStyle"))return;
    const style=document.createElement("style");
    style.id="withdrawalLinkStyle";
    style.textContent=`
      #withdrawalFormNav.is-hidden{display:none!important}
      .withdrawal-link-actions{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      .withdrawal-form-shortcut{white-space:nowrap}
      @media(max-width:700px){.withdrawal-link-actions{width:100%;justify-content:stretch}.withdrawal-link-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function boot(){
    if(typeof state==="undefined"){
      setTimeout(boot,100);
      return;
    }
    ensureStyle();
    buildNav();
    enhance();

    if(typeof applyPermissionUi==="function"){
      const originalApply=applyPermissionUi;
      applyPermissionUi=function(){
        originalApply();
        syncNav();
        enhance();
      };
    }

    new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
    q("#logoutButton")?.addEventListener("click",()=>setTimeout(syncNav,0));
    syncNav();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();
