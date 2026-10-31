const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.ROUND9_PLAYWRIGHT_MODULE||'playwright');
const {fixture}=require('./helpers/tfg-tour-fixture.cjs');
const root=path.resolve(__dirname,'..'),evidence=process.env.TFG_TOUR_EVIDENCE||'/tmp/tfg-tour-evidence';fs.mkdirSync(evidence,{recursive:true});
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({executablePath:process.env.ROUND9_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let posts=0;const errors=[];
try{
 async function open({preview=false,width=390,at='2026-11-01T06:00:00+09:00'}={}){const e=fixture(at);const ctx=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo'});const page=await ctx.newPage();page.on('pageerror',x=>errors.push(x.message));await page.clock.install({time:new Date(at)});await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(url.hostname!=='script.google.com')return route.abort();let result;
 if(req.method()==='POST'){posts++;result=e.context.createReservationStoreAware_(JSON.parse(req.postData()));}else{const date=url.searchParams.get('start_date'),days=Number(url.searchParams.get('days'));result={ok:true,data:{results:Array.from({length:days},(_,i)=>{const day=new Date(Date.parse(date+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);return e.context.getAvailableSlotsStoreAware_({service_code:'TOUR',date:day});})}};}
 return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});});await page.goto(origin+'/tour/november.html'+(preview?'?preview=1':''));await page.locator('.slot-button').first().waitFor();return {page,ctx,e};}
 for(const width of [320,390,768,1280]){const {page,ctx}=await open({width});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('.brand img').evaluate(x=>x.complete&&x.naturalWidth>0),true);assert.doesNotMatch(await page.locator('#slots').innerText(),/〜|○名/);assert.doesNotMatch(await page.locator('#selection').innerText(),/↖/);assert.match(await page.locator('.privacy').innerText(),/見学者全員/);assert.equal(await page.locator('.secure-note').count(),0);assert.equal(await page.locator('.slot-button').last().locator('strong').innerText(),'20:00');await page.screenshot({path:path.join(evidence,`tour-${width}.png`),fullPage:true});await ctx.close();}
 for(const size of [1,2]){const {page,ctx,e}=await open();await page.getByRole('button',{name:'09:00 予約可能',exact:true}).click();assert.doesNotMatch(await page.locator('#selection').innerText(),/〜/);await page.locator('#partySize').selectOption(String(size));assert.equal(await page.locator('#guest2Fields').isVisible(),size===2);for(let i=1;i<=size;i++){await page.locator('#name'+i).fill(i===1?e.one.name:e.two.name);await page.locator('#phone'+i).fill(i===1?e.one.phone:e.two.phone);await page.locator('#email'+i).fill(i===1?e.one.email:e.two.email);}await page.locator('#submitBooking').click();await page.locator('#resultPanel').waitFor({state:'visible'});assert.equal(e.tables.reservations.length,1);assert.equal(e.mail.length,size+1);assert.equal(await page.getByRole('button',{name:/別の日時|他の日時/}).count(),0);assert.equal(await page.locator('#editPreview').isVisible(),false);await page.screenshot({path:path.join(evidence,`tour-success-${size}.png`),fullPage:true});await ctx.close();}
 {const {page,ctx,e}=await open();await page.getByRole('button',{name:'09:00 予約可能',exact:true}).click();await page.locator('#partySize').selectOption('2');for(const [id,value] of [['name1',e.one.name],['phone1',e.one.phone],['email1',e.one.email]])await page.locator('#'+id).fill(value);const before=posts;await page.locator('#submitBooking').click();await page.locator('#formError').waitFor({state:'visible'});assert.equal(posts,before);await ctx.close();}
 for(const at of ['2026-10-31T23:59:00+09:00','2026-11-01T06:00:00+09:00']){
  for(const size of [1,2]){
   const width=size===1?390:1280;
   const {page,ctx,e}=await open({preview:true,at,width});const before=posts;
   assert.equal(await page.locator('#modeNotice').isVisible(),true);
   assert.match(await page.locator('#modeNotice').innerText(),/予約・メール送信は行われません/);
   assert.equal(await page.locator('#submitBooking').isDisabled(),true);
   await page.getByRole('button',{name:'09:00 予約可能',exact:true}).click();
   assert.equal(await page.locator('#submitBooking').isEnabled(),true);
   assert.match(await page.locator('#submitBooking').innerText(),/入力内容を確認する/);
   await page.locator('#partySize').selectOption(String(size));
   await page.locator('#submitBooking').click();
   assert.match(await page.locator('#formError').innerText(),/見学者1の氏名/);
   for(let i=1;i<=size;i++){
    const guest=i===1?e.one:e.two;
    await page.locator('#name'+i).fill(guest.name);await page.locator('#phone'+i).fill(guest.phone);await page.locator('#email'+i).fill(guest.email);
    if(size===2&&i===1){await page.locator('#submitBooking').click();assert.match(await page.locator('#formError').innerText(),/見学者2の氏名/);assert.equal(posts,before);}
   }
   await page.locator('#submitBooking').click();await page.locator('#resultPanel').waitFor({state:'visible'});
   assert.equal(await page.locator('#resultTitle').innerText(),'入力内容の確認');
   assert.match(await page.locator('#resultMessage').innerText(),/予約は確定していません/);
   const details=await page.locator('#resultDetails').innerText();
   for(const guest of (size===2?[e.one,e.two]:[e.one]))for(const value of Object.values(guest))assert.ok(details.includes(value));
   assert.doesNotMatch(details,/予約番号/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(evidence,`tour-preview-${size}-${at.slice(0,10)}.png`),fullPage:true});
   await page.locator('#editPreview').click();assert.equal(await page.locator('#name1').inputValue(),e.one.name);
   assert.equal(await page.locator('#submitBooking').isEnabled(),true);
   await page.locator('#name1').fill(e.one.name+' 修正');
   await page.locator('#applicationForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   assert.ok((await page.locator('#resultDetails').innerText()).includes(e.one.name+' 修正'));
   assert.equal(posts,before);assert.equal(e.tables.reservations.length,0);assert.equal(e.mail.length,0);
   assert.equal(await page.locator('#modeNotice').isVisible(),true);await ctx.close();
  }
 }
 // The live page stays closed before launch, including forced form submission.
 {const {page,ctx}=await open({at:'2026-10-31T23:59:00+09:00'});const before=posts;
  await page.locator('.date-button').nth(1).click();await page.getByRole('button',{name:'09:00 予約可能',exact:true}).click();
  assert.equal(await page.locator('#submitBooking').isDisabled(),true);assert.match(await page.locator('#modeNotice').innerText(),/11月1日午前0時/);
  await page.locator('#applicationForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.match(await page.locator('#formError').innerText(),/11月1日午前0時/);assert.equal(posts,before);assert.equal(await page.locator('#modeNotice').isVisible(),true);await ctx.close();}
 // Existing URL switches precisely at midnight JST; preserve preview/query/fragment.
 {const ctx=await browser.newContext();const page=await ctx.newPage();await page.clock.install({time:new Date('2026-10-31T23:59:59+09:00')});await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await page.goto(origin+'/tour/?preview=1#section');assert.ok(!page.url().includes('november.html'));await page.clock.runFor(1100);await page.waitForURL('**/tour/november.html?preview=1#section');await ctx.close();}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',widths:[320,390,768,1280],checks:['logo','start times only','one and two visitor registration and mail calls','required second guest','preview input validation, review and edit before and after launch without POST or mail','persistent mode notice','live booking blocked before launch','JST midnight switch'],reservationPosts:posts,evidence}));
}finally{await browser.close();server.close();}})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
