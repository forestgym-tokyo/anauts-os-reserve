(()=>{
  function boot(){
    if(typeof apiGet!=="function"||typeof apiPost!=="function"||typeof state==="undefined"){setTimeout(boot,100);return;}

    function sogaStaffRestricted_(){
      return typeof isSogaStaffUser==="function"&&isSogaStaffUser();
    }

    const originalApply=applyPermissionUi;
    applyPermissionUi=function(){
      originalApply();
      if(state.authUser?.staff_code)document.querySelector("#myShiftNav")?.classList.remove("is-hidden");
      buildMonthly();
      syncMonthlyPrintPermission_();
      const monthlyNav=document.querySelector('[data-view="monthlySchedule"]');
      if(monthlyNav)monthlyNav.innerHTML=sogaStaffRestricted_()?"<span>📅</span>9ROUND予定":"<span>📅</span>予定一覧";
      if(typeof enforceSogaStaffUi_==="function")enforceSogaStaffUi_();
    };
    canUseMyShift=function(){return !!state.authUser?.staff_code;};

    const originalRender=renderMyShiftRows;
    renderMyShiftRows=function(){renderMyShiftCalendar();};

    function ensureCalendarCss(){if(document.querySelector("#anautsCalendarCss"))return;const style=document.createElement("style");style.id="anautsCalendarCss";style.textContent=`.mcal-wrap{overflow-x:auto}.mcal{min-width:980px;border:1px solid #294037;border-radius:14px;overflow:hidden;background:#10231d}.mcal-week{display:grid;grid-template-columns:repeat(7,1fr);background:#183129}.mcal-week div{padding:10px;text-align:center;font-weight:900;color:#b9c9c2;border-right:1px solid #294037}.mcal-week div:last-child{border-right:0}.mcal-grid{display:grid;grid-template-columns:repeat(7,1fr)}.mcal-day{min-height:145px;padding:8px;border-right:1px solid #294037;border-top:1px solid #294037;background:#10231d;cursor:pointer}.mcal-day:nth-child(7n){border-right:0}.mcal-day.out{background:#0c1b16;opacity:.5}.mcal-day.today{box-shadow:inset 0 0 0 2px #7ed6a5}.mcal-day.my-shift-selected{background:#173f2a!important;box-shadow:inset 0 0 0 3px #63d179!important}.mcal-num{font-weight:900;color:#e7f1ed;margin-bottom:6px}.mcal-event{display:block;padding:5px 6px;margin:4px 0;border-left:4px solid var(--staff-color,#63d179);border-radius:7px;background:#24483b;color:#fff;font-size:11px;line-height:1.25;white-space:normal;overflow:hidden}.mcal-event b{display:block;font-size:12px}.mcal-event-name{display:flex;align-items:center;gap:5px;margin-top:3px}.mcal-event-dot,.mcal-detail-dot{display:inline-block;width:8px;height:8px;flex:0 0 8px;border-radius:999px;background:var(--staff-color,#63d179)}.mcal-event-store{display:block;margin-top:3px;color:#a9bab1;font-size:9px;font-weight:800;letter-spacing:.05em}.mcal-detail{margin-top:14px;padding:14px;border:1px solid #294037;border-radius:12px;background:#10231d}.mcal-detail h3{margin:0 0 10px}.mcal-detail-row{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid #294037}.mcal-detail-row:first-of-type{border-top:0}.mcal-detail-store{margin-left:auto;color:#91a198;font-size:11px;font-weight:800}.monthly-filter-group{justify-self:end;display:flex;align-items:flex-end;gap:8px}.monthly-filter-field{display:grid;gap:4px}.monthly-filter-field span{color:#91a198;font-size:10px;font-weight:900}.monthly-filter-field select{min-width:170px}.mycal-actions{display:flex;gap:7px;margin-top:8px;flex-wrap:wrap}.mycal-actions button{font-size:12px;padding:6px 9px}@media(max-width:900px){#monthlyScheduleView .schedule-toolbar{grid-template-columns:1fr auto}.monthly-filter-group{grid-column:1/-1;justify-self:stretch}.monthly-filter-field{flex:1}.monthly-filter-field select{width:100%;min-width:0}}@media(max-width:700px){.mcal{min-width:760px}.mcal-day{min-height:105px;padding:5px}.mcal-event{font-size:10px;padding:4px}.mcal-event b{font-size:10px}.monthly-filter-group{display:grid;grid-template-columns:1fr 1fr;width:100%}}`;document.head.appendChild(style)}

    let monthlyLoadedMonth_=null;
    function canPrintMonthly_(){
      const permission=String(state.authUser?.permission||"").trim().toUpperCase();
      return permission==="ADMIN"||permission==="MANAGER";
    }
    function syncMonthlyPrintPermission_(){
      const button=document.querySelector("#mPrint");
      if(!button)return;
      const allowed=canPrintMonthly_();
      button.classList.toggle("is-hidden",!allowed);
      button.disabled=!allowed;
    }
    function monthlyPrintCss_(){return `
      @page{size:A4 landscape;margin:8mm}
      :root,html{color-scheme:light;background:#fff;color:#111}
      *{box-sizing:border-box}
      body{margin:0;background:#fff;color:#111;font-family:Arial,"Noto Sans JP",sans-serif}
      .print-actions{display:flex;align-items:center;gap:12px;padding:12px;font:14px Arial,sans-serif}
      .print-actions button{padding:7px 14px;cursor:pointer}
      #monthlyPrintSheet{width:270mm;height:180mm;background:#fff;color:#111;overflow:hidden}
      .print-title{height:10mm;display:flex;align-items:center;justify-content:space-between}
      .print-title h2{margin:0;font-size:14pt;font-weight:700;color:#111}
      .print-title strong{font-size:11pt}
      .print-weekdays{height:6mm;display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
      .print-weekdays span{border:1px solid #aaa;border-right:0;text-align:center;line-height:5.6mm;font-size:8pt;font-weight:700}
      .print-weekdays span:last-child{border-right:1px solid #aaa}
      .print-grid{height:164mm;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:repeat(var(--print-weeks),minmax(0,1fr));border-right:1px solid #aaa}
      .print-day{min-width:0;min-height:0;padding:.8mm 1mm;border-left:1px solid #aaa;border-bottom:1px solid #aaa;overflow:hidden}
      .print-day-number{display:block;font-size:8pt;font-weight:700;line-height:1.2;margin-bottom:.3mm}
      .print-day-content{font-size:7.4pt;line-height:1.12;transform-origin:top left}
      .print-shift{display:block;font-size:inherit;line-height:inherit;overflow-wrap:anywhere}
      @media print{
        html,body{width:270mm;height:180mm;margin:0!important;padding:0!important;overflow:hidden!important;background:#fff!important;color:#111!important}
        .print-actions{display:none!important}
        #monthlyPrintSheet{break-inside:avoid;page-break-inside:avoid}
      }
    `}
    function fitMonthlyPrintCells_(sheet){
      Array.from(sheet.querySelectorAll(".print-day")).forEach(day=>{
        const content=day.querySelector(".print-day-content");
        if(!content)return;
        const available=Math.max(1,day.clientHeight-day.querySelector(".print-day-number").offsetHeight-9);
        let size=7.4;
        while(content.scrollHeight>available&&size>2.1){
          size=Math.max(2.1,Math.min(size-.25,size*available/content.scrollHeight*.94));
          content.style.fontSize=`${size.toFixed(2)}pt`;
        }
        if(content.scrollHeight>available){
          const scale=Math.min(1,available/content.scrollHeight*.94);
          content.style.transform=`scale(${scale})`;
          content.style.width=`${100/scale}%`;
        }
      });
    }
    const SOGA_PRINT_START_=10*60+15;
    const SOGA_PRINT_END_=20*60+45;
    const SOGA_BREAK_START_=14*60;
    const SOGA_BREAK_END_=16*60+15;

    function sogaPrintMinutes_(value){
      const m=String(value||"").match(/^(\d{1,2}):(\d{2})/);
      return m?Number(m[1])*60+Number(m[2]):NaN;
    }
    function sogaPrintTime_(minutes){
      const v=Math.max(0,Number(minutes)||0);
      return `${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`;
    }
    function sogaPrintSurname_(staff,row){
      const raw=String(staff?.staff_name||staff?.display_name||row?.staff_name||row?.staff_code||"")
        .replace(/(?:トレーナー|さん)$/,"").trim();
      const parts=raw.split(/[\s　]+/).filter(Boolean);
      return parts[0]||raw;
    }
    function sogaPrintColor_(staff,row){
      const color=String(staff?.color||"");
      return /^#[0-9a-f]{6}$/i.test(color)?color:"#63d179";
    }
    function sogaPrintWeeks_(ym){
      const [y,m]=ym.split("-").map(Number),last=new Date(y,m,0).getDate(),offset=(new Date(y,m-1,1).getDay()+6)%7;
      const days=Array(offset).fill(null);
      for(let d=1;d<=last;d++)days.push(`${ym}-${String(d).padStart(2,"0")}`);
      while(days.length%7)days.push(null);
      const weeks=[];for(let i=0;i<days.length;i+=7)weeks.push(days.slice(i,i+7));
      return weeks;
    }
    function sogaPrintSegments_(date,rows,people){
      const byStaff=new Map();
      rows.filter(x=>String(x.date)===date).forEach(row=>{
        const staffCode=String(row.staff_code||"");
        const startMin=sogaPrintMinutes_(row.start_time),endMin=sogaPrintMinutes_(row.end_time);
        if(!Number.isFinite(startMin)||!Number.isFinite(endMin)||endMin<=startMin)return;
        if(!byStaff.has(staffCode))byStaff.set(staffCode,[]);
        byStaff.get(staffCode).push({staffCode,startMin,endMin,row});
      });
      const segments=[];
      byStaff.forEach((items,staffCode)=>{
        items.sort((a,b)=>a.startMin-b.startMin);
        let current=null;
        items.forEach(item=>{
          if(!current){current={...item,through:false};return}
          const adjacent=current.endMin===item.startMin;
          const acrossBreak=current.endMin===SOGA_BREAK_START_&&item.startMin===SOGA_BREAK_END_;
          if(adjacent||acrossBreak){
            current.endMin=item.endMin;
            current.through=current.through||acrossBreak;
          }else{
            segments.push(current);
            current={...item,through:false};
          }
        });
        if(current)segments.push(current);
      });
      segments.forEach(x=>{x.staff=people.get(String(x.staffCode))||{}});
      segments.sort((a,b)=>Number(b.through)-Number(a.through)||a.startMin-b.startMin||a.endMin-b.endMin||String(a.staffCode).localeCompare(String(b.staffCode),"ja"));
      const placed=[];
      segments.forEach(segment=>{
        const occupied=new Set(placed.filter(other=>segment.startMin<other.endMin&&segment.endMin>other.startMin).map(other=>other.lane));
        let lane=0;while(occupied.has(lane))lane++;
        segment.lane=lane;
        placed.push(segment);
      });
      return placed;
    }
    function sogaPrintSegmentHtml_(segment){
      const range=SOGA_PRINT_END_-SOGA_PRINT_START_;
      const top=Math.max(0,(segment.startMin-SOGA_PRINT_START_)/range*100);
      const bottom=Math.min(100,(segment.endMin-SOGA_PRINT_START_)/range*100);
      const height=Math.max(.8,bottom-top);
      const name=esc(sogaPrintSurname_(segment.staff,segment.row));
      const color=esc(sogaPrintColor_(segment.staff,segment.row));
      const common=`class="soga-p-shift${segment.through?" is-through":""}" style="--lane:${Math.min(segment.lane,1)};--person-color:${color};top:${top.toFixed(4)}%;height:${height.toFixed(4)}%"`;
      if(segment.through&&segment.startMin<SOGA_BREAK_START_&&segment.endMin>SOGA_BREAK_END_){
        const duration=segment.endMin-segment.startMin;
        const bTop=(SOGA_BREAK_START_-segment.startMin)/duration*100;
        const bHeight=(SOGA_BREAK_END_-SOGA_BREAK_START_)/duration*100;
        const topName=Math.max(12,bTop/2),bottomName=Math.min(88,bTop+bHeight+(100-bTop-bHeight)/2);
        return `<div ${common}><span class="soga-p-time is-start">${esc(sogaPrintTime_(segment.startMin))}</span><strong class="soga-p-name" style="top:${topName.toFixed(2)}%">${name}</strong><span class="soga-p-break" style="top:${bTop.toFixed(4)}%;height:${bHeight.toFixed(4)}%"></span><strong class="soga-p-name" style="top:${bottomName.toFixed(2)}%">${name}</strong><span class="soga-p-time is-end">${esc(sogaPrintTime_(segment.endMin))}</span></div>`;
      }
      return `<div ${common}><span class="soga-p-time is-start">${esc(sogaPrintTime_(segment.startMin))}</span><strong class="soga-p-name" style="top:50%">${name}</strong><span class="soga-p-time is-end">${esc(sogaPrintTime_(segment.endMin))}</span></div>`;
    }
    function sogaPrintDayHtml_(date,rows,people){
      if(!date)return '<div class="soga-p-day is-out"></div>';
      const segments=sogaPrintSegments_(date,rows,people),day=Number(date.slice(-2));
      const range=SOGA_PRINT_END_-SOGA_PRINT_START_;
      const breakStart=(SOGA_BREAK_START_-SOGA_PRINT_START_)/range*100;
      const breakEnd=(SOGA_BREAK_END_-SOGA_PRINT_START_)/range*100;
      return `<div class="soga-p-day"><span class="soga-p-date">${day}日</span><div class="soga-p-timeline"><i class="soga-p-guide" style="top:${breakStart.toFixed(4)}%"></i><i class="soga-p-guide" style="top:${breakEnd.toFixed(4)}%"></i>${segments.map(sogaPrintSegmentHtml_).join("")}</div></div>`;
    }
    function sogaPrintWeekInfo_(index){
      const range=SOGA_PRINT_END_-SOGA_PRINT_START_;
      const breakStart=(SOGA_BREAK_START_-SOGA_PRINT_START_)/range*100;
      const breakEnd=(SOGA_BREAK_END_-SOGA_PRINT_START_)/range*100;
      return `<div class="soga-p-weekinfo"><strong>${index+1}週目</strong><div class="soga-p-scale"><span class="start">10:15</span><span style="top:${breakStart.toFixed(4)}%">14:00</span><span style="top:${breakEnd.toFixed(4)}%">16:15</span><span class="end">20:45</span></div></div>`;
    }
    function sogaPrintCss_(weekCount){return `
      @page{size:A4 portrait;margin:0}
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,"Yu Gothic","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif}
      .soga-p-actions{display:flex;justify-content:center;gap:10px;padding:10px;background:#111}.soga-p-actions button{border:0;border-radius:8px;background:#2f8f49;color:#fff;padding:9px 18px;font-weight:800;cursor:pointer}
      .soga-p-sheet{width:210mm;height:297mm;padding:6mm 5mm 5mm;overflow:hidden;background:#fff}
      .soga-p-title{height:13mm;display:flex;align-items:flex-start;justify-content:space-between;padding:0 1mm}.soga-p-title h1{margin:0;font-size:15pt;font-weight:500}.soga-p-title span{margin-top:5mm;font-size:7pt}
      .soga-p-calendar{height:273mm;border-top:.28mm solid #333;border-left:.28mm solid #333;display:grid;grid-template-rows:8mm repeat(${weekCount},minmax(0,1fr))}
      .soga-p-header,.soga-p-week{display:grid;grid-template-columns:18mm repeat(7,minmax(0,1fr));min-height:0}
      .soga-p-header>div{display:grid;place-items:center;border-right:.28mm solid #333;border-bottom:.28mm solid #333;font-size:7.2pt}.soga-p-header .corner{font-size:6.1pt}
      .soga-p-weekinfo,.soga-p-day{position:relative;min-width:0;min-height:0;border-right:.28mm solid #333;border-bottom:.28mm solid #333;overflow:hidden}
      .soga-p-weekinfo{background:#fafafa}.soga-p-weekinfo>strong{position:absolute;top:2mm;left:1mm;font-size:6.1pt;font-weight:600}.soga-p-scale{position:absolute;left:0;right:.6mm;top:6mm;bottom:1mm;font-size:6.2pt;font-weight:700;text-align:right}.soga-p-scale span{position:absolute;right:0;transform:translateY(-50%)}.soga-p-scale .start{top:0;transform:none}.soga-p-scale .end{bottom:0;top:auto;transform:none}
      .soga-p-date{position:absolute;z-index:5;top:1mm;left:1mm;font-size:6.5pt}.soga-p-timeline{position:absolute;left:0;right:0;top:6mm;bottom:1mm}.soga-p-guide{position:absolute;left:0;right:0;border-top:.18mm dotted #aaa;z-index:0}
      .soga-p-shift{position:absolute;z-index:2;left:calc(50% * var(--lane) + .55mm);width:calc(50% - 1.1mm);min-height:3mm;border:.28mm solid #222;border-radius:1mm;background:#fff;box-shadow:inset .7mm 0 0 var(--person-color);overflow:hidden}
      .soga-p-time{position:absolute;z-index:5;left:1.1mm;font-size:8pt;font-weight:900;line-height:1;color:#111;background:rgba(255,255,255,.92);padding:0 .4mm;border-radius:.5mm}.soga-p-time.is-start{top:.45mm}.soga-p-time.is-end{bottom:.45mm}.soga-p-name{position:absolute;z-index:5;left:0;right:0;transform:translateY(-50%);padding:0 .2mm 0 .8mm;text-align:center;font-size:5.8pt;line-height:1;font-weight:700;letter-spacing:-.03em;white-space:nowrap;overflow:hidden;text-overflow:clip}
      .soga-p-break{position:absolute;z-index:3;left:0;right:0;border-top:.18mm dashed #666;border-bottom:.18mm dashed #666;background:repeating-linear-gradient(135deg,#fff 0,#fff 1.4mm,#999 1.5mm,#999 1.7mm);-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .soga-p-day.is-out{background:#fff}
      @media print{html,body{width:210mm;height:297mm;overflow:hidden}.soga-p-actions{display:none!important}.soga-p-sheet{padding:6mm 5mm 5mm;break-inside:avoid;page-break-inside:avoid}.soga-p-shift,.soga-p-break{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    `}
    function printSogaMonth_(rows){
      const printWindow=window.open("","_blank");
      if(!printWindow){alert("印刷用ページを開けませんでした。ポップアップを許可して再度お試しください。");return}
      const ym=state.monthlyMonth,[year,month]=ym.split("-").map(Number),weeks=sogaPrintWeeks_(ym),people=new Map(state.staff.map(x=>[String(x.staff_code),x]));
      const weekRows=weeks.map((week,index)=>`<div class="soga-p-week">${sogaPrintWeekInfo_(index)}${week.map(date=>sogaPrintDayHtml_(date,rows,people)).join("")}</div>`).join("");
      const title=`${year}年${month}月　9ROUND シフト`;
      const markup=`<div class="soga-p-actions"><button id="printNow" type="button">印刷 / PDF保存</button></div><main class="soga-p-sheet"><header class="soga-p-title"><h1>${esc(title)}</h1><span>タイムカード確認用</span></header><section class="soga-p-calendar"><div class="soga-p-header"><div class="corner">週・時間</div>${["月","火","水","木","金","土","日"].map(x=>`<div>${x}</div>`).join("")}</div>${weekRows}</section></main>`;
      const doc=printWindow.document;
      doc.open();doc.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${sogaPrintCss_(weeks.length)}</style></head><body>${markup}</body></html>`);doc.close();
      doc.querySelector("#printNow").onclick=()=>printWindow.print();
      printWindow.focus();
    }

    function printMonth_(){
      if(!canPrintMonthly_())return;
      if(monthlyLoadedMonth_!==state.monthlyMonth){alert("予定の読み込みが完了してから印刷してください。");return}
      const store=sogaStaffRestricted_()?"SOGA":(document.querySelector("#mStore")?.value||"ALL");
      if(store==="ALL"){alert("印刷する部門・店舗を選択してください。");document.querySelector("#mStore")?.focus();return}
      const rows=(state.monthlyRows||[]).filter(x=>String(x.store_code)===store);
      if(!rows.length){alert("この月の部門・店舗に印刷できる予定がありません。");return}
      if(store==="SOGA"){printSogaMonth_(rows);return}
      // A separate document keeps the dark admin theme out of printer previews.
      const printWindow=window.open("","_blank");
      if(!printWindow){alert("印刷用ページを開けませんでした。ポップアップを許可して再度お試しください。");return}
      const ym=state.monthlyMonth,[year,month]=ym.split("-").map(Number);
      const offset=(new Date(year,month-1,1).getDay()+6)%7;
      const last=new Date(year,month,0).getDate();
      const total=Math.ceil((offset+last)/7)*7;
      const people=new Map(state.staff.map(x=>[String(x.staff_code),x]));
      const by=new Map();
      rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start_time).localeCompare(String(b.start_time))||String(a.staff_code).localeCompare(String(b.staff_code)));
      rows.forEach(x=>{if(!by.has(x.date))by.set(x.date,[]);by.get(x.date).push(x)});
      let cells="";
      for(let i=0;i<total;i++){
        const day=i-offset+1;
        if(day<1||day>last){cells+='<div class="print-day"></div>';continue}
        const date=`${ym}-${String(day).padStart(2,"0")}`;
        const shifts=(by.get(date)||[]).map(x=>{
          const person=people.get(String(x.staff_code))||{};
          const name=person.display_name||person.staff_name||x.staff_name||x.staff_code;
          return `<span class="print-shift">${esc(String(x.start_time).slice(0,5))}–${esc(String(x.end_time).slice(0,5))} ${esc(String(name))}</span>`;
        }).join("");
        cells+=`<div class="print-day"><span class="print-day-number">${day}</span><div class="print-day-content">${shifts}</div></div>`;
      }
      const title=`${storeLabel_(store)} ${year}年${month}月 予定`;
      const markup=`<div class="print-actions"><button id="printNow" type="button">印刷する</button><span>A4横・1枚。印刷設定で用紙をA4、向きを横にしてください。</span></div><main id="monthlyPrintSheet" aria-label="月間予定 印刷用" style="--print-weeks:${total/7}"><div class="print-title"><h2>${esc(storeLabel_(store))} 予定</h2><strong>${year}年${month}月</strong></div><div class="print-weekdays">${["月","火","水","木","金","土","日"].map(x=>`<span>${x}</span>`).join("")}</div><div class="print-grid">${cells}</div></main>`;
      const doc=printWindow.document;
      doc.open();
      doc.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${monthlyPrintCss_()}</style></head><body>${markup}</body></html>`);
      doc.close();
      doc.querySelector("#printNow").onclick=()=>printWindow.print();
      printWindow.focus();
      Promise.resolve(doc.fonts?.ready).then(()=>{
        if(printWindow.closed)return;
        printWindow.requestAnimationFrame(()=>{
          fitMonthlyPrintCells_(doc.querySelector("#monthlyPrintSheet"));
          printWindow.print();
        });
      });
    }
    function renderMyShiftCalendar(){
      ensureCalendarCss();const box=document.querySelector("#myShiftList"),rows=(state.myShiftRows||[]).filter(x=>x.active!==false);if(!box)return;
      const p=document.querySelector("#myShiftView .page-heading p:last-child");
      if(p){
        if(sogaStaffRestricted_())p.textContent="9ROUND アリオ蘇我店の自分の確定シフトを確認できます。日付を押すと変更・削除申請ができます。";
        else p.textContent=isManagementUser()?"八千代・SOGA両店舗の自分の確定シフトを月間カレンダーで確認できます。日付を押すと直接変更・削除できます。":"八千代・SOGA両店舗の自分の確定シフトを月間カレンダーで確認できます。日付を押すと変更・削除申請ができます。";
      }
      const notice=document.querySelector("#myShiftView .page-heading + .card");
      if(notice&&!isManagementUser())notice.innerHTML=`<strong style="color:#ffcf7d">当日・前日のシフト変更について</strong><div style="margin-top:5px;color:#d7ddd8">当日および前日の追加・変更・削除申請はWebでは受付できません。必ず直接 <a href="tel:08035534259" style="color:#79dc8c;font-weight:900;text-decoration:none">080-3553-4259</a> までご連絡ください。</div>`;
      if(isManagementUser())document.querySelector("#myShiftRequestHistory")?.closest("section")?.classList.add("is-hidden");
      const ym=state.myShiftMonth||localYmd().slice(0,7),[y,m]=ym.split("-").map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0).getDate(),offset=(first.getDay()+6)%7,total=Math.ceil((offset+last)/7)*7,today=localYmd(),by=new Map();rows.forEach(x=>{if(!by.has(x.date))by.set(x.date,[]);by.get(x.date).push(x)});let cells="";
      for(let i=0;i<total;i++){const day=i-offset+1;if(day<1||day>last){cells+='<div class="mcal-day out"></div>';continue}const date=`${ym}-${String(day).padStart(2,"0")}`,a=by.get(date)||[];cells+=`<div class="mcal-day ${date===today?'today':''}" data-mydate="${date}"><div class="mcal-num">${day}</div>${a.map(x=>`<span class="mcal-event" style="border-left:0"><b>${esc(String(x.start_time).slice(0,5))}〜${esc(String(x.end_time).slice(0,5))}</b>${esc(x.store_code||"")}</span>`).join("")}</div>`}
      box.innerHTML=`<div class="mcal-wrap"><div class="mcal"><div class="mcal-week"><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div><div>日</div></div><div class="mcal-grid">${cells}</div></div></div><div id="myCalDetail" class="mcal-detail is-hidden"></div>`;
      box.querySelectorAll("[data-mydate]").forEach(c=>c.onclick=()=>showMyDay(c.dataset.mydate));
    }
    function myShiftRule_(date){
      const today=localYmd();
      if(!date||date<today)return "PAST";
      const [y,m,d]=today.split("-").map(Number),tomorrowDate=new Date(y,m-1,d+1);
      const tomorrow=`${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth()+1).padStart(2,"0")}-${String(tomorrowDate.getDate()).padStart(2,"0")}`;
      return (date===today||date===tomorrow)?"PHONE":"WEB";
    }
    function showMyShiftPhone_(r,actionLabel){
      const phone="080-3553-4259";
      if(typeof showTodayShiftContactCard_==="function"){
        showTodayShiftContactCard_(r,actionLabel);
        const card=document.querySelector("#todayShiftContactCard"),action=document.querySelector("#todayShiftContactAction"),detail=document.querySelector("#todayShiftContactDetail");
        if(card){const h2=card.querySelector("h2"),p=card.querySelector(".manager-header p:last-child");if(h2)h2.textContent="当日・前日のシフト変更";if(p)p.textContent="当日・前日のシフト変更・削除はWebから申請できません。選択した内容について直接ご連絡ください。";}
        if(action)action.textContent=`${actionLabel}について電話連絡`;
        if(detail)detail.innerHTML=`<strong>${esc(formatStaffDate(r.date))}</strong><br>${esc(r.start_time)}〜${esc(r.end_time)}<br><br>当日・前日のシフト${esc(actionLabel)}はWeb申請できません。<br>080-3553-4259まで直接ご連絡ください。`;
        return;
      }
      if(typeof myShiftMsg==="function")myShiftMsg(`当日・前日のシフト${actionLabel}はWeb申請できません。${phone}まで直接ご連絡ください。`,true);
    }
    function showMyDay(date){
      const detail=document.querySelector("#myCalDetail"),rows=(state.myShiftRows||[]).filter(x=>x.active!==false&&x.date===date),mode=myShiftRule_(date);
      document.querySelectorAll("#myShiftList [data-mydate]").forEach(c=>c.classList.toggle("my-shift-selected",c.dataset.mydate===date));
      detail.classList.remove("is-hidden");
      const actions=(x,i)=>{
        if(isManagementUser())return `<button class="ghost-button" data-my-edit="${i}">直接変更</button><button class="danger-ghost" data-my-delete="${i}">直接削除</button>`;
        if(mode==="PAST")return `<button class="ghost-button" type="button" disabled>変更申請不可</button><button class="danger-ghost" type="button" disabled>削除申請不可</button>`;
        if(mode==="PHONE")return `<button class="ghost-button" data-my-phone-edit="${i}">電話で変更連絡</button><button class="danger-ghost" data-my-phone-delete="${i}">電話で削除連絡</button>`;
        return `<button class="ghost-button" data-my-request-edit="${i}">変更申請</button><button class="danger-ghost" data-my-request-delete="${i}">削除申請</button>`;
      };
      detail.innerHTML=`<h3>${esc(date)} の自分のシフト</h3>${rows.length?rows.map((x,i)=>`<div class="mcal-detail-row" style="display:block"><strong>${esc(String(x.start_time).slice(0,5))}〜${esc(String(x.end_time).slice(0,5))}</strong>　${esc(x.store_code||"")}<div class="mycal-actions">${actions(x,i)}</div></div>`).join(""):'<div>シフトはありません。</div>'}`;
      if(isManagementUser()){
        detail.querySelectorAll("[data-my-edit]").forEach(b=>b.onclick=()=>directEdit(rows[+b.dataset.myEdit]));
        detail.querySelectorAll("[data-my-delete]").forEach(b=>b.onclick=()=>directDelete(rows[+b.dataset.myDelete]));
        return;
      }
      detail.querySelectorAll("[data-my-phone-edit]").forEach(b=>b.onclick=()=>showMyShiftPhone_(rows[+b.dataset.myPhoneEdit],"変更"));
      detail.querySelectorAll("[data-my-phone-delete]").forEach(b=>b.onclick=()=>showMyShiftPhone_(rows[+b.dataset.myPhoneDelete],"削除"));
      detail.querySelectorAll("[data-my-request-edit]").forEach(b=>b.onclick=()=>{const r=rows[+b.dataset.myRequestEdit];if(r&&typeof editMyShiftRequest==="function")editMyShiftRequest(r)});
      detail.querySelectorAll("[data-my-request-delete]").forEach(b=>b.onclick=()=>{const r=rows[+b.dataset.myRequestDelete];if(r&&typeof requestDeleteMyShift==="function")requestDeleteMyShift(r)});
    }
    async function directEdit(r){const s=prompt("開始時刻",String(r.start_time).slice(0,5));if(s===null)return;const e=prompt("終了時刻",String(r.end_time).slice(0,5));if(e===null)return;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e)||s>=e)return alert("時刻を確認してください。");try{await apiPost({action:"saveStaffShift",shift_id:r.shift_id,staff_code:state.authUser.staff_code,store_code:r.store_code||state.authUser.store_code||"YACHIYO",date:r.date,start_time:s,end_time:e});await loadMyShiftView()}catch(x){alert(x.message)}}
    async function directDelete(r){if(!confirm(`${r.date} ${r.start_time}〜${r.end_time} を削除しますか？`))return;try{await apiPost({action:"deleteStaffShift",shift_id:r.shift_id});await loadMyShiftView()}catch(x){alert(x.message)}}

    const MONTHLY_CACHE_PREFIX="anauts_monthly_cache_v1:";
    const MONTHLY_CACHE_FRESH_MS=30*1000;
    const MONTHLY_CACHE_MAX_AGE_MS=8*60*60*1000;
    const monthlyRequests_=new Map();
    let monthlyLoadSequence_=0;

    function monthlySubject_(){
      const tokenSubject=typeof currentAuthSubject_==="function"?currentAuthSubject_():"";
      return tokenSubject||String(state.authUser?.email||state.authUser?.staff_code||"anonymous");
    }
    function monthlyScope_(){return sogaStaffRestricted_()?"SOGA":"ALL"}
    function monthlyCacheKey_(ym){return `${MONTHLY_CACHE_PREFIX}${encodeURIComponent(monthlySubject_())}:${monthlyScope_()}:${ym}`}
    function readMonthlyCache_(ym){
      try{
        const cached=JSON.parse(localStorage.getItem(monthlyCacheKey_(ym))||"null");
        if(!cached||cached.month!==ym||!cached.saved_at)return null;
        const age=Date.now()-Number(cached.saved_at);
        if(age<0||age>MONTHLY_CACHE_MAX_AGE_MS)return null;
        cached.age=age;
        return cached;
      }catch(_){return null}
    }
    function writeMonthlyCache_(ym,payload){
      try{
        localStorage.setItem(monthlyCacheKey_(ym),JSON.stringify({
          month:ym,
          saved_at:Date.now(),
          rows:payload.rows||[],
          staff:payload.staff||[],
          publication:payload.publication||null
        }));
      }catch(_){
        // 保存できない端末でも通常取得は継続する。
      }
    }
    function invalidateMonthlyCache_(){
      monthlyRequests_.clear();
      try{
        for(let i=localStorage.length-1;i>=0;i-=1){
          const key=localStorage.key(i)||"";
          if(key.startsWith(MONTHLY_CACHE_PREFIX))localStorage.removeItem(key);
        }
      }catch(_){ }
    }
    window.ANAUTS_INVALIDATE_MONTHLY_CACHE=invalidateMonthlyCache_;

    const monthlyMutationActions_=new Set([
      "saveStaffShift","deleteStaffShift","importStaffShifts",
      "saveSogaShiftAssignments","publishStaffShiftMonth",
      "saveStaff","setStaffActive"
    ]);
    if(!window.__ANAUTS_MONTHLY_POST_INVALIDATION_INSTALLED__){
      window.__ANAUTS_MONTHLY_POST_INVALIDATION_INSTALLED__=true;
      const originalApiPost=apiPost;
      apiPost=async function(payload){
        const result=await originalApiPost.apply(this,arguments);
        if(monthlyMutationActions_.has(String(payload?.action||"")))invalidateMonthlyCache_();
        return result;
      };
    }

    function monthlyUpdatedLabel_(savedAt){
      try{return new Date(Number(savedAt)||Date.now()).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}
      catch(_){return ""}
    }
    function setMonthlyFreshness_(text,isWarning){
      const node=document.querySelector("#mFreshness");
      if(!node)return;
      node.textContent=text||"";
      node.style.color=isWarning?"#ffcf7d":"#91a198";
    }

    function buildMonthly(){
      if(document.querySelector('[data-view="monthlySchedule"]'))return;
      ensureCalendarCss();
      const nav=document.querySelector(".topnav"),main=document.querySelector("main.main");
      if(!nav||!main)return;
      const b=document.createElement("button");
      b.className="nav-button";
      b.dataset.view="monthlySchedule";
      b.innerHTML=sogaStaffRestricted_()?"<span>📅</span>9ROUND予定":"<span>📅</span>予定一覧";
      nav.insertBefore(b,nav.querySelector('[data-view="registration"]'));
      const v=document.createElement("section");
      v.id="monthlyScheduleView";
      v.className="view";
      v.innerHTML=`<div class="page-heading"><div><p class="eyebrow">MONTHLY SCHEDULE</p><h1>予定一覧</h1><p>月間カレンダーでスタッフ・トレーナーの勤務予定を確認します。</p></div></div><div class="schedule-toolbar card"><div class="toolbar-group"><button id="mPrev" class="icon-button">‹</button><button id="mNow" class="ghost-button">今月</button><button id="mNext" class="icon-button">›</button></div><div><strong id="mLabel" class="period-title"></strong><span id="mFreshness" aria-live="polite" style="display:block;margin-top:4px;color:#91a198;font-size:11px;font-weight:800"></span></div><div class="monthly-filter-group"><label class="monthly-filter-field"><span>部門・店舗</span><select id="mStore"></select></label><label class="monthly-filter-field"><span>表示</span><select id="mFilter"></select></label><button id="mPrint" type="button" class="ghost-button" title="選択した部門・店舗の月間予定をA4一枚で印刷">🖨 A4印刷</button></div></div><div id="mBoard" class="card"></div><div id="mDetail" class="mcal-detail is-hidden"></div>`;
      main.insertBefore(v,document.querySelector("#registrationView"));
      state.monthlyMonth=state.monthlyMonth||localYmd().slice(0,7);
      state.monthlyStore=sogaStaffRestricted_()?"SOGA":(state.monthlyStore||"ALL");
      b.onclick=()=>{document.querySelectorAll(".nav-button").forEach(x=>x.classList.toggle("is-active",x===b));document.querySelectorAll(".view").forEach(x=>x.classList.remove("is-active"));v.classList.add("is-active");loadMonth()};
      document.querySelector("#mPrev").onclick=()=>move(-1);
      document.querySelector("#mNext").onclick=()=>move(1);
      document.querySelector("#mNow").onclick=()=>{state.monthlyMonth=localYmd().slice(0,7);loadMonth()};
      document.querySelector("#mStore").onchange=()=>{state.monthlyStore=document.querySelector("#mStore").value;filters();syncMonthlyHeading_();renderMonth();document.querySelector("#mDetail").classList.add("is-hidden")};
      document.querySelector("#mFilter").onchange=()=>{renderMonth();document.querySelector("#mDetail").classList.add("is-hidden")};
      document.querySelector("#mPrint").onclick=printMonth_;
      syncMonthlyPrintPermission_();
    }
    function move(n){const [y,m]=state.monthlyMonth.split("-").map(Number),d=new Date(y,m-1+n,1);state.monthlyMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;loadMonth()}
    function applyMonthlyPayload_(ym,payload,sourceLabel){
      if(state.monthlyMonth!==ym)return;
      monthlyLoadedMonth_=payload.publication?.is_published===false?null:ym;
      if(Array.isArray(payload.staff)&&payload.staff.length)state.staff=payload.staff;
      if(payload.publication?.is_published===false){
        state.monthlyRows=[];
        storeFilters_();
        filters();
        syncMonthlyHeading_();
        document.querySelector("#mBoard").innerHTML=`<div class="staff-schedule-empty"><strong>公開前</strong><span>${esc(payload.publication.message||"管理者が公開すると予定を確認できます。")}</span></div>`;
      }else{
        state.monthlyRows=(payload.rows||[]).filter(x=>x.active!==false);
        storeFilters_();
        filters();
        syncMonthlyHeading_();
        renderMonth();
      }
      if(sourceLabel)setMonthlyFreshness_(sourceLabel,false);
    }
    function loginPrefetchFor_(ym){
      const prefetch=window.ANAUTS_LOGIN_MONTH_PREFETCH;
      if(!prefetch||prefetch.month!==ym||!prefetch.promise)return null;
      return Promise.resolve(prefetch.promise).then(result=>result||apiGet("getStaffShifts",monthParams_(ym)));
    }
    function monthParams_(ym){
      const params={start_date:`${ym}-01`,end_date:`${ym}-${String(new Date(+ym.slice(0,4),+ym.slice(5,7),0).getDate()).padStart(2,"0")}`};
      if(sogaStaffRestricted_())params.store_code="SOGA";
      return params;
    }
    function fetchMonthlyPayload_(ym){
      const requestKey=`${monthlyScope_()}:${ym}`;
      if(monthlyRequests_.has(requestKey))return monthlyRequests_.get(requestKey);
      const shiftRequest=loginPrefetchFor_(ym)||apiGet("getStaffShifts",monthParams_(ym));
      const request=Promise.resolve(shiftRequest).then(j=>{
        const payload={
          rows:(Array.isArray(j.data)?j.data:(j.data?.shifts||[])).filter(x=>x.active!==false),
          staff:state.staff,
          publication:j.data?.publication||null
        };
        if(!state.staff.length){
          apiGet("getStaff",{include_inactive:"false"}).then(s=>{
            const staff=Array.isArray(s.data?.staff)?s.data.staff:(Array.isArray(s.data)?s.data:[]);
            if(!staff.length)return;
            state.staff=staff;
            payload.staff=staff;
            writeMonthlyCache_(ym,payload);
            if(state.monthlyMonth===ym){
              storeFilters_();
              filters();
              syncMonthlyHeading_();
              renderMonth();
            }
          }).catch(staffError=>console.warn("予定一覧のスタッフ名簿を取得できませんでした。",staffError));
        }
        return payload;
      }).finally(()=>monthlyRequests_.delete(requestKey));
      monthlyRequests_.set(requestKey,request);
      return request;
    }
    async function loadMonth(options={}){
      const ym=state.monthlyMonth;
      monthlyLoadedMonth_=null;
      const board=document.querySelector("#mBoard");
      const sequence=++monthlyLoadSequence_;
      document.querySelector("#mLabel").textContent=`${+ym.slice(0,4)}年${+ym.slice(5,7)}月`;
      document.querySelector("#mDetail").classList.add("is-hidden");
      const cached=readMonthlyCache_(ym);
      if(cached){
        const fresh=cached.age<=MONTHLY_CACHE_FRESH_MS&&!options.force;
        applyMonthlyPayload_(ym,cached,fresh?`更新 ${monthlyUpdatedLabel_(cached.saved_at)}`:`保存データ ${monthlyUpdatedLabel_(cached.saved_at)}・最新情報を確認中`);
        if(fresh)return;
      }else{
        board.innerHTML='<div class="staff-schedule-loading">読み込んでいます…</div>';
        setMonthlyFreshness_("最新情報を取得中",false);
      }
      try{
        const payload=await fetchMonthlyPayload_(ym);
        writeMonthlyCache_(ym,payload);
        if(sequence!==monthlyLoadSequence_||state.monthlyMonth!==ym)return;
        applyMonthlyPayload_(ym,payload,`更新 ${monthlyUpdatedLabel_(Date.now())}`);
      }catch(e){
        if(sequence!==monthlyLoadSequence_||state.monthlyMonth!==ym)return;
        if(cached){
          setMonthlyFreshness_("保存データを表示中・更新できませんでした",true);
          return;
        }
        board.innerHTML=`<div class="staff-schedule-empty"><strong>取得できませんでした</strong><span>${esc(e.message||"通信に失敗しました。")}</span><button id="mRetry" class="ghost-button" type="button" style="margin-top:14px">再読込</button></div>`;
        setMonthlyFreshness_("更新できませんでした",true);
        document.querySelector("#mRetry")?.addEventListener("click",()=>loadMonth({force:true}),{once:true});
      }
    }
    function storeLabel_(code){
      const master=(state.stores||[]).find(x=>String(x.store_code)===String(code));
      if(master)return master.store_name||master.store_code;
      if(code==="SOGA")return "9ROUND アリオ蘇我店";
      if(code==="YACHIYO")return "八千代緑が丘店";
      return code;
    }
    function storeFilters_(){
      const select=document.querySelector("#mStore");
      if(sogaStaffRestricted_()){
        select.innerHTML='<option value="SOGA">9ROUND アリオ蘇我店 (SOGA)</option>';
        select.value="SOGA";
        select.disabled=true;
        state.monthlyStore="SOGA";
        return;
      }
      select.disabled=false;
      const codes=new Set();
      (state.stores||[]).filter(x=>x.active!==false).forEach(x=>{if(x.store_code)codes.add(String(x.store_code))});
      (state.staff||[]).filter(x=>x.active!==false).forEach(x=>{if(x.store_code)codes.add(String(x.store_code))});
      (state.monthlyRows||[]).forEach(x=>{if(x.store_code)codes.add(String(x.store_code))});
      const order=Array.from(codes).sort((a,b)=>({YACHIYO:0,SOGA:1}[a]??9)-({YACHIYO:0,SOGA:1}[b]??9)||a.localeCompare(b));
      select.innerHTML='<option value="ALL">全店舗</option>'+order.map(code=>`<option value="${esc(code)}">${esc(storeLabel_(code))} (${esc(code)})</option>`).join("");
      const wanted=state.monthlyStore||"ALL";
      select.value=Array.from(select.options).some(x=>x.value===wanted)?wanted:"ALL";
      state.monthlyStore=select.value;
    }
    function filters(){
      const select=document.querySelector("#mFilter"),current=select.value||"ALL",store=sogaStaffRestricted_()?"SOGA":(document.querySelector("#mStore")?.value||"ALL"),me=state.authUser?.staff_code||"";
      const codes=new Set((state.monthlyRows||[]).filter(x=>store==="ALL"||String(x.store_code)===store).map(x=>String(x.staff_code)));
      const people=state.staff.filter(x=>x.active!==false&&codes.has(String(x.staff_code)));
      select.innerHTML=`<option value="ALL">全員</option><option value="STAFF">スタッフ全員</option><option value="TRAINER">トレーナー全員</option>${me&&codes.has(String(me))?'<option value="ME">自分</option>':''}`+people.map(x=>`<option value="P:${esc(x.staff_code)}">${esc((x.display_name||x.staff_name||x.staff_code)+(String(x.role).toUpperCase()==="TRAINER"?"トレーナー":"さん"))}</option>`).join("");
      if(Array.from(select.options).some(x=>x.value===current))select.value=current;
    }
    function filtered(){
      const f=document.querySelector("#mFilter").value,store=sogaStaffRestricted_()?"SOGA":(document.querySelector("#mStore")?.value||"ALL"),people=new Map(state.staff.map(x=>[String(x.staff_code),x]));
      let a=(state.monthlyRows||[]).filter(x=>store==="ALL"||String(x.store_code)===store);
      if(f==="ME")a=a.filter(x=>String(x.staff_code)===String(state.authUser.staff_code));
      else if(f==="STAFF"||f==="TRAINER")a=a.filter(x=>String(people.get(String(x.staff_code))?.role).toUpperCase()===f);
      else if(f.startsWith("P:"))a=a.filter(x=>String(x.staff_code)===f.slice(2));
      return a.sort((x,y)=>String(x.date).localeCompare(String(y.date))||String(x.start_time).localeCompare(String(y.start_time))||String(x.staff_code).localeCompare(String(y.staff_code)));
    }
    function personLabel(x,people){const p=people.get(String(x.staff_code))||{},n=p.display_name||p.staff_name||x.staff_name||x.staff_code;return n+(String(p.role).toUpperCase()==="TRAINER"?"トレーナー":"さん")}
    function staffColor_(x,people){const color=String(people.get(String(x.staff_code))?.color||"");return /^#[0-9a-f]{6}$/i.test(color)?color:"#63d179"}
    function syncMonthlyHeading_(){
      const store=sogaStaffRestricted_()?"SOGA":(document.querySelector("#mStore")?.value||"ALL"),view=document.querySelector("#monthlyScheduleView");
      if(!view)return;
      view.querySelector(".eyebrow").textContent=store==="SOGA"?"9ROUND ARIO SOGA":"MONTHLY SCHEDULE";
      view.querySelector("h1").textContent=store==="SOGA"?"9ROUNDシフト":"予定一覧";
      view.querySelector(".page-heading p:last-child").textContent=store==="SOGA"?"アリオ蘇我店の確定シフトを月間カレンダーで確認します。":"月間カレンダーでスタッフ・トレーナーの勤務予定を確認します。";
      const printButton=document.querySelector("#mPrint");if(printButton){printButton.innerHTML=store==="SOGA"?"🖨 A4縦印刷 / PDF":"🖨 A4印刷";printButton.title=store==="SOGA"?"見本形式の9ROUNDシフトをA4縦1枚で印刷・PDF保存":"選択した部門・店舗の月間予定をA4一枚で印刷"}
    }
    function renderMonth(){
      const board=document.querySelector("#mBoard"),a=filtered(),people=new Map(state.staff.map(x=>[String(x.staff_code),x])),ym=state.monthlyMonth,[y,m]=ym.split("-").map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0).getDate(),offset=(first.getDay()+6)%7,total=Math.ceil((offset+last)/7)*7,today=localYmd(),by=new Map();
      a.forEach(x=>{if(!by.has(x.date))by.set(x.date,[]);by.get(x.date).push(x)});
      let cells="";
      for(let i=0;i<total;i++){
        const day=i-offset+1;
        if(day<1||day>last){cells+='<div class="mcal-day out"></div>';continue}
        const date=`${ym}-${String(day).padStart(2,"0")}`,rows=by.get(date)||[];
        cells+=`<div class="mcal-day ${date===today?'today':''}" data-mdate="${date}"><div class="mcal-num">${day}</div>${rows.map(x=>{const color=staffColor_(x,people);return `<span class="mcal-event" style="--staff-color:${color}"><b>${esc(String(x.start_time).slice(0,5))}〜${esc(String(x.end_time).slice(0,5))}</b><span class="mcal-event-name"><i class="mcal-event-dot"></i>${esc(personLabel(x,people))}</span><small class="mcal-event-store">${esc(x.store_code||"")}</small></span>`}).join("")}</div>`;
      }
      board.innerHTML=`<div class="mcal-wrap"><div class="mcal"><div class="mcal-week"><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div><div>日</div></div><div class="mcal-grid">${cells}</div></div></div>`;
      board.querySelectorAll("[data-mdate]").forEach(c=>c.onclick=()=>showDay(c.dataset.mdate));
    }
    function showDay(date){
      const detail=document.querySelector("#mDetail"),people=new Map(state.staff.map(x=>[String(x.staff_code),x])),rows=filtered().filter(x=>x.date===date);
      detail.classList.remove("is-hidden");
      detail.innerHTML=`<h3>${esc(date)} の予定</h3>${rows.length?rows.map(x=>{const color=staffColor_(x,people);return `<div class="mcal-detail-row" style="--staff-color:${color}"><i class="mcal-detail-dot"></i><strong>${esc(String(x.start_time).slice(0,5))}〜${esc(String(x.end_time).slice(0,5))}</strong><span>${esc(personLabel(x,people))}</span><small class="mcal-detail-store">${esc(x.store_code||"")}</small></div>`}).join(""):'<div>予定はありません。</div>'}`;
      detail.scrollIntoView({behavior:"smooth",block:"nearest"});
    }

    buildMonthly();
    if(state.authUser){
      applyPermissionUi();
      window.setTimeout(()=>loadMonth(),0);
    }
  }
  boot();
})();
