const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.ROUND9_PLAYWRIGHT_MODULE||'playwright');
const {fixture}=require('./helpers/tfg-tour-fixture.cjs');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
});
const gate=()=>{let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};};
async function until(check){const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw Error('Timed out waiting for fixture request');await new Promise(r=>setTimeout(r,10));}}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.ROUND9_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const errors=[],checks=[];
 async function open({holdRemaining=false,postMode='normal'}={}){
  const e=fixture(),remaining=gate(),post=gate(),stats={ranges:[],rangeCompleted:0,posts:0,status:0,postFinished:false};
  const ctx=await browser.newContext({viewport:{width:390,height:900},timezoneId:'Asia/Tokyo'}),page=await ctx.newPage();
  page.on('pageerror',err=>errors.push(err.message));await page.clock.install({time:new Date('2026-11-01T06:00:00+09:00')});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();if(url.hostname!=='script.google.com')return route.abort();
   let result;
   if(request.method()==='POST'){
    stats.posts++;const payload=JSON.parse(request.postData());
    if(postMode==='pending')await post.promise;
    result=postMode==='rejected'?{ok:false,code:'SLOT_NOT_AVAILABLE'}:e.context.createReservationStoreAware_(payload);
    if(['slow-mail','legacy','late-mail-failure'].includes(postMode))await post.promise;
    if(postMode==='late-mail-failure')result.data.mail_status='pending';
    if(postMode==='lost'){stats.postFinished=true;return route.abort('failed');}
    stats.postFinished=true;
   }else if(url.searchParams.get('action')==='getTourBookingStatus'){
    stats.status++;result=postMode==='legacy'?{ok:false,code:'UNKNOWN_ACTION'}:e.context.getTourBookingStatus_(Object.fromEntries(url.searchParams));
   }else{
    const start=url.searchParams.get('start_date'),days=Number(url.searchParams.get('days'));stats.ranges.push({start,days});
    if(holdRemaining&&days>1)await remaining.promise;
    result={ok:true,data:{results:Array.from({length:days},(_,i)=>e.context.getAvailableSlotsStoreAware_({service_code:'TOUR',date:new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10)}))}};
    stats.rangeCompleted++;
   }
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto(origin+'/tour/november.html');await page.locator('.slot-button').first().waitFor();
  const fill=async()=>{await page.getByRole('button',{name:'09:00 予約可能',exact:true}).click();await page.locator('#name1').fill(e.one.name);await page.locator('#phone1').fill(e.one.phone);await page.locator('#email1').fill(e.one.email);};
  const close=async()=>{remaining.release();post.release();await ctx.close();};
  return {e,page,ctx,remaining,post,stats,fill,close};
 }
 try{
  {
   const c=await open({holdRemaining:true});try{
    assert.equal(c.stats.ranges[0].days,1);assert.equal(c.stats.rangeCompleted,1);
    await c.fill();assert.equal(await c.page.locator('#submitBooking').isEnabled(),true);
    await c.page.locator('#submitBooking').click();await c.page.locator('#resultPanel').waitFor({state:'visible'});
    assert.equal(c.stats.posts,1);assert.equal(c.stats.rangeCompleted,1);
    assert.equal(await c.page.getByRole('button',{name:/別の日時|他の日時/}).count(),0);
    const before=c.stats.ranges.length;await c.page.clock.runFor(61000);await c.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(c.stats.ranges.length,before);checks.push('selected day usable and bookable while remaining six days are still loading; completed booking never reloads');
   }finally{await c.close();}
  }
  {
   const c=await open();try{
    await until(()=>c.stats.rangeCompleted===2);await c.page.locator('.date-button').last().click();await c.page.locator('.slot-button').first().waitFor();
    await c.page.locator('#nextWeek').click();await until(()=>c.stats.rangeCompleted===4);await c.page.locator('.slot-button').first().waitFor();
    const before=c.stats.ranges.length;await c.page.locator('#previousWeek').click();await c.page.locator('.slot-button').first().waitFor();assert.equal(c.stats.ranges.length,before);
    await c.page.reload();await c.page.locator('.slot-button').first().waitFor();assert.equal(c.stats.ranges.length,before);
    await c.fill();await c.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(c.stats.ranges.length,before);assert.equal(await c.page.locator('#submitBooking').isEnabled(),true);
    await c.page.locator('#reloadSchedule').click();await until(()=>c.stats.rangeCompleted===6);assert.equal(c.stats.ranges.length,before+2);
    await c.page.clock.runFor(61000);await c.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await until(()=>c.stats.rangeCompleted===8);
    checks.push('returning to a week or reloading uses the one-minute cache; explicit refresh and expiry fetch fresh slots');
   }finally{await c.close();}
  }
  for(const postMode of ['slow-mail','lost']){
   const c=await open({postMode});try{
    await c.fill();await c.page.locator('#submitBooking').click();await until(()=>c.stats.posts===1&&c.e.tables.reservations.length===1);
    await c.page.clock.runFor(1600);await c.page.locator('#resultPanel').waitFor({state:'visible'});
    assert.ok(c.stats.status>=1);assert.equal(c.e.tables.reservations.length,1);assert.equal(c.e.mail.length,2);
    if(postMode==='slow-mail')assert.equal(c.stats.postFinished,false);
    assert.equal(await c.page.locator('#editPreview').isVisible(),false);
    checks.push(postMode==='slow-mail'?'committed receipt shows success before slow POST notification response':'lost POST response recovers the saved reservation without a second POST');
   }finally{await c.close();}
  }
  {
   const c=await open({postMode:'legacy'});try{
    await c.fill();await c.page.locator('#submitBooking').click();await until(()=>c.stats.posts===1);await c.page.clock.runFor(1600);await until(()=>c.stats.status>=1);
    assert.equal(await c.page.locator('#resultPanel').isVisible(),false);c.post.release();await c.page.locator('#resultPanel').waitFor({state:'visible'});
    assert.equal(c.e.tables.reservations.length,1);checks.push('legacy GAS without receipt endpoint still completes through its original POST');
   }finally{await c.close();}
  }
  {
   const c=await open({postMode:'late-mail-failure'});try{
    await c.fill();await c.page.locator('#submitBooking').click();await until(()=>c.stats.posts===1);await c.page.clock.runFor(1600);await c.page.locator('#resultPanel').waitFor({state:'visible'});
    assert.equal(await c.page.locator('#notice').isVisible(),false);c.post.release();await c.page.locator('#notice').waitFor({state:'visible'});
    assert.match(await c.page.locator('#notice').innerText(),/予約は完了.*メールの送信に失敗/);assert.equal(c.e.tables.reservations.length,1);
    checks.push('notification failure reported after the receipt is displayed without undoing the booking');
   }finally{await c.close();}
  }
  {
   const c=await open({postMode:'pending'});try{
    await c.fill();await c.page.locator('#submitBooking').click();await until(()=>c.stats.posts===1);await c.page.clock.runFor(1600);await until(()=>c.stats.status>=1);
    assert.equal(c.e.tables.reservations.length,0);assert.equal(await c.page.locator('#resultPanel').isVisible(),false);assert.equal(await c.page.locator('#submitBooking').isDisabled(),true);
    c.post.release();await c.page.locator('#resultPanel').waitFor({state:'visible'});assert.equal(c.e.tables.reservations.length,1);
    checks.push('pending receipt cannot display success or enable a duplicate submit');
   }finally{await c.close();}
  }
  {
   const c=await open({postMode:'rejected'});try{
    await c.fill();await c.page.locator('#submitBooking').click();await c.page.locator('#formError').waitFor({state:'visible'});
    assert.match(await c.page.locator('#formError').innerText(),/満枠/);assert.equal(await c.page.locator('#resultPanel').isVisible(),false);assert.equal(c.e.tables.reservations.length,0);
    checks.push('definitive booking rejection never displays confirmation');
   }finally{await c.close();}
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks}));
 }finally{await browser.close();server.close();}
})().catch(err=>{console.error(err);server.close();process.exitCode=1;});
