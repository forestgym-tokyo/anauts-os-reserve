window.ANAUTS_AUTH = {
  enabled: true,
  firebaseApiKey: "AIzaSyAtxFCPt1mGZWYP6hMYcqeVzLAVmrvvyIc"
};

window.addEventListener("load", function () {
  function load(src){
    var s=document.createElement("script");
    s.src=src;
    document.body.appendChild(s);
  }
  load("./admin-monthly-v58.js?v=20260823-1942");
  load("./admin-tour-enrollment.js?v=20260825-1215");
  load("./admin-tour-startdate-fix.js?v=20260825-1235");
  load("./admin-tour-ui-polish.js?v=20260825-1045");
  load("./admin-questionnaire-fix.js?v=20260825-1205");

  /* MY SHIFT: this code is intentionally inline so it cannot miss because of a stale child-script URL. */
  (function(){
    function ymd(add){
      var d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+(add||0));
      return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
    }
    function addCss(){
      if(document.getElementById("myShiftInlineDirectCss"))return;
      var st=document.createElement("style"); st.id="myShiftInlineDirectCss";
      st.textContent="#myShiftList .registered-shift-row{cursor:pointer!important;transition:background .15s,border-color .15s,box-shadow .15s}#myShiftList .registered-shift-row.is-shift-selected{background:rgba(99,209,121,.20)!important;border:2px solid #63d179!important;box-shadow:0 0 0 2px rgba(99,209,121,.22)!important}#myShiftList .registered-shift-actions button{pointer-events:auto!important;position:relative!important;z-index:30!important}";
      document.head.appendChild(st);
    }
    function shiftFor(btn){
      var id=btn.getAttribute("data-my-shift-edit")||btn.getAttribute("data-my-shift-delete")||"";
      try{return (state.myShiftRows||[]).find(function(r){return String(r.shift_id||"")===String(id);})||null;}catch(e){return null;}
    }
    function select(row){
      document.querySelectorAll("#myShiftList .registered-shift-row").forEach(function(x){x.classList.toggle("is-shift-selected",x===row);});
    }
    function phone(r,isDelete){
      var card=document.getElementById("todayShiftContactCard");
      var action=document.getElementById("todayShiftContactAction");
      var detail=document.getElementById("todayShiftContactDetail");
      if(action)action.textContent=(String(r.date)===ymd(0)?"当日":"前日")+"の"+(isDelete?"シフト削除":"シフト変更")+"について直接連絡";
      if(detail)detail.innerHTML=String(r.date)+"<br>"+String(r.start_time)+"〜"+String(r.end_time)+"<br><br>シフト日の当日および前日の変更・削除はWebから申請できません。<br>下のボタンから080-3553-4259へ直接ご連絡ください。";
      if(card){card.classList.remove("is-hidden");card.scrollIntoView({behavior:"smooth",block:"start"});}
    }
    function operate(btn){
      var row=btn.closest(".registered-shift-row"); select(row);
      var r=shiftFor(btn);
      if(!r){try{myShiftMsg("対象のシフトを取得できませんでした。",true);}catch(e){} return;}
      var date=String(r.date||""); var del=btn.hasAttribute("data-my-shift-delete");
      if(date<ymd(0)){try{myShiftMsg("過去のシフトは変更・削除申請できません。",true);}catch(e){} return;}
      if(date===ymd(0)||date===ymd(1)){phone(r,del);return;}
      try{ if(del) requestDeleteMyShift(r); else editMyShiftRequest(r); }
      catch(e){try{myShiftMsg(e.message||"申請画面を開けませんでした。",true);}catch(_e){}}
    }
    function wire(){
      addCss();
      var today=ymd(0);
      document.querySelectorAll("#myShiftList .registered-shift-row").forEach(function(row){
        var buttons=row.querySelectorAll("[data-my-shift-edit],[data-my-shift-delete]");
        buttons.forEach(function(btn){
          var r=shiftFor(btn);
          if(r && String(r.date||"")>=today && !row.classList.contains("is-pending-request")) btn.disabled=false;
          if(btn.dataset.directShiftBound==="1")return;
          btn.dataset.directShiftBound="1";
          btn.addEventListener("click",function(e){e.preventDefault();e.stopImmediatePropagation();operate(btn);},true);
        });
        if(row.dataset.directRowBound!=="1"){
          row.dataset.directRowBound="1";
          row.addEventListener("click",function(e){if(!e.target.closest("button"))select(row);});
        }
      });
    }
    function updateText(){
      var v=document.getElementById("myShiftView"); if(!v)return;
      Array.from(v.children).forEach(function(c){
        if(c.classList && c.classList.contains("card") && String(c.textContent||"").indexOf("シフト変更について")>=0){
          var strong=c.querySelector("strong"), div=c.querySelector("div");
          if(strong)strong.textContent="直前のシフト変更について";
          if(div)div.innerHTML='シフト日の<strong>当日および前日</strong>は、この画面から変更・削除申請できません。必ず直接 <a href="tel:08035534259" style="color:#79dc8c;font-weight:900;text-decoration:none">080-3553-4259</a> までご連絡ください。';
        }
      });
    }
    updateText(); wire();
    var box=document.getElementById("myShiftList"); if(box)new MutationObserver(wire).observe(box,{childList:true,subtree:true});
    setInterval(wire,500);
  })();
});
