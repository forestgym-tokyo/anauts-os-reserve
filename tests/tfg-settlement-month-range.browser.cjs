const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=path.resolve(__dirname,".."),evidence=process.env.SETTLEMENT_EVIDENCE||"/tmp/tfg-settlement-month-range";
fs.mkdirSync(evidence,{recursive:true});
const adminHtml=fs.readFileSync(path.join(root,"admin/index.html"),"utf8");
const section=adminHtml.slice(adminHtml.indexOf('<section id="settlementView"'),adminHtml.indexOf('<section id="dailyReportView"'));
assert.ok(section.includes('id="settlementCalculate"'));
const fixtureHtml='<!doctype html><html lang="ja"><head><meta charset="utf-8"><link rel="stylesheet" href="/admin/admin.css"></head><body><main>'+section+'</main><script src="/admin/admin-settlement-v2.js"></script></body></html>';
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://localhost").pathname;
 if(pathname==="/fixture.html"){res.setHeader("Content-Type","text/html;charset=utf-8");return res.end(fixtureHtml);}
 const file=path.resolve(root,"."+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader("Content-Type",pathname.endsWith(".js")?"application/javascript":"text/css");res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/usr/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const results=[],errors=[];
 try{
  const scenarios=[
   {at:"2026-11-12T03:00:00Z",join:"2026-11-01",months:1,last:"2026年11月",total:"11,330円",timing:"PREVIOUS_MONTH",memberNo:"160708",date:"2026-11-30"},
   {at:"2026-11-12T03:00:00Z",join:"2026-10-01",months:2,last:"2026年11月",total:"13,860円",timing:"PREVIOUS_MONTH",memberNo:"160710",date:"2026-11-30"},
   {at:"2026-11-05T03:00:00Z",join:"2026-11-01",months:1,last:"2026年11月",total:"11,330円"},
   {at:"2026-11-12T03:00:00Z",join:"2026-11-01",months:2,last:"2026年12月",total:"18,810円"},
   {at:"2026-12-05T03:00:00Z",join:"2026-11-01",months:2,last:"2026年12月",total:"13,860円"},
   {at:"2026-12-12T03:00:00Z",join:"2026-11-01",months:3,last:"2027年1月",total:"21,340円"},
   {at:"2026-11-12T03:00:00Z",join:"2025-12-01",months:13,last:"2026年12月",total:"0円"},
   {at:"2026-12-05T03:00:00Z",join:"2026-01-01",months:12,last:"2026年12月",total:"37,895円"},
   {at:"2027-01-05T03:00:00Z",join:"2026-01-15",months:13,last:"2027年1月",total:"0円"},
   {at:"2027-01-05T03:00:00Z",join:"2026-01-15",months:13,last:"2027年1月",pause:true,total:"37,895円"}
  ];
  for(const timezoneId of ["Asia/Makassar","Asia/Tokyo"]){
   for(const scenario of scenarios){
    const context=await browser.newContext({timezoneId,viewport:{width:1280,height:900}});
    try{
     const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
     await page.clock.install({time:new Date(scenario.at)});
     await page.route("**/*",route=>route.request().url().startsWith(origin)?route.continue():route.abort());
     await page.addInitScript(()=>{
      window.fixtureCalls=[];
      window.apiPost=async payload=>{
       window.fixtureCalls.push(payload.action);
       if(payload.action==="createTfgSettlement")window.fixturePayload=payload;
       if(payload.action==="createTfgSettlement")return {ok:true,data:{settlementId:"FIXTURE-SETTLEMENT",approvalUrl:"https://example.invalid/approval?token=fixture-token",total:window.fixtureOverrideTotal?window.fixtureSavedTotal:payload.items.reduce((sum,item)=>sum+Number(item.settlement||0),0)+(window.fixtureMismatch?1:0)}};
       if(payload.action==="sendTfgSettlementApproval")return {ok:true,data:{gmailDraftId:"fixture-draft"}};
       throw Error("Unexpected API action: "+payload.action);
      };
     });
     await page.goto(origin+"/fixture.html");
     await page.evaluate(join=>{
      document.querySelector("#settlementView").style.display="block";
      for(const [id,value] of Object.entries({settlementMemberNo:"123456",settlementMemberName:"計算確認用",settlementEmail:"test@example.invalid",settlementJoinDate:join,settlementPlan:"REGULAR",settlementBenefit:"NONE",settlementFirstPaid:"4950",settlementInitialPaid:"0"}))document.getElementById(id).value=value;
     },scenario.join);
     if(scenario.timing){
      await page.locator("#settlementWithdrawalTiming").selectOption(scenario.timing);
      await page.evaluate(no=>document.querySelector("#settlementMemberNo").value=no,scenario.memberNo);
     }
     const started=Date.now();await page.locator("#settlementCalculate").click({timeout:5000});
     await page.locator("#settlementPreview").waitFor({state:"visible",timeout:5000});
     const elapsed=Date.now()-started,rows=page.locator("#settlementRows [data-status]");
     assert.equal(await rows.count(),scenario.months);
     if(scenario.pause)await rows.nth(2).selectOption("休会");
     const monthlyRows=page.locator("#settlementRows tr").filter({has:page.locator("[data-status]")});
     assert.match(await monthlyRows.first().innerText(),/満12か月の継続期間に含めない/);
     assert.doesNotMatch(await monthlyRows.first().innerText(),/\d+\/12/);
     if(scenario.months>1)assert.match(await monthlyRows.nth(1).innerText(),/継続月数 1\/12か月/);
     if(scenario.pause){assert.doesNotMatch(await monthlyRows.nth(2).innerText(),/\d+\/12/);assert.match(await monthlyRows.nth(3).innerText(),/継続月数 2\/12か月/);}
     assert.equal(await page.locator("#settlementRows tr").last().locator("td").first().innerText(),scenario.last);
     const total=await page.locator("#settlementTotal").innerText();if(scenario.total)assert.equal(total,scenario.total);
     assert.deepEqual(await page.evaluate(()=>fixtureCalls),[]);
     await page.locator("#settlementPreviewButton").click();await page.locator("#settlementInlineMemberPreview").waitFor({state:"visible"});
     assert.ok((await page.locator("#settlementInlineMemberPreviewBody").innerText()).includes(total));
     await page.locator("#settlementDraft").click();await page.waitForFunction(()=>document.querySelector("#settlementMessage").textContent.includes("Gmailの下書きに保存"));
     assert.deepEqual(await page.evaluate(()=>fixtureCalls),["createTfgSettlement","sendTfgSettlementApproval"]);
     if(scenario.timing){
      assert.match(await page.locator("#settlementDeadlineBadge").innerText(),new RegExp(scenario.date));
      assert.equal(await page.evaluate(()=>fixturePayload.withdrawalTiming),scenario.timing);
      assert.equal(await page.evaluate(()=>fixturePayload.memberNo),scenario.memberNo);
      assert.match(await page.locator("#settlementInlineMemberPreviewBody").innerText(),new RegExp(scenario.date));
     }
     await page.evaluate(()=>{window.fixtureMismatch=true;});
     await page.locator("#settlementDraft").click();await page.waitForFunction(()=>document.querySelector("#settlementMessage").textContent.includes("計算額と保存額が一致しない"));
     assert.deepEqual(await page.evaluate(()=>fixtureCalls),["createTfgSettlement","sendTfgSettlementApproval","createTfgSettlement"]);
     assert.equal(await page.locator("#settlementFallbackUrl").isVisible(),false);
     assert.equal(await page.locator("#settlementFallbackUrlText").inputValue(),"");
     assert.equal(await page.locator("#settlementSend").isDisabled(),true);
     if(timezoneId==="Asia/Makassar"&&scenario.total==="0円"&&!scenario.pause){
      for(const malformed of [null,"","0",false]){
       await page.evaluate(value=>{window.fixtureOverrideTotal=true;window.fixtureSavedTotal=value;},malformed);
       await page.locator("#settlementDraft").click();await page.waitForFunction(()=>document.querySelector("#settlementMessage").textContent.includes("計算額と保存額が一致しない"));
       assert.equal(await page.evaluate(()=>fixtureCalls.filter(action=>action==="sendTfgSettlementApproval").length),1);
       assert.equal(await page.locator("#settlementFallbackUrl").isVisible(),false);
      }
     }
     if(scenario.at.startsWith("2026-11-12")&&scenario.months===2)await page.screenshot({path:path.join(evidence,timezoneId.replace("/","-")+".png"),fullPage:true});
     results.push({timezoneId,at:scenario.at,months:scenario.months,total,calculation_ms:elapsed});
    }finally{await context.close();}
   }
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:"passed",results,externalRequests:0,evidence}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
