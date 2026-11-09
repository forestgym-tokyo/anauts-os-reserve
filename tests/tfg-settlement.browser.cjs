const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=require('node:path').resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  let page;
  const errors=[];
  const html=fs.readFileSync(root+'/admin/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  for(const [now,join,totalZero,count] of [['2026-01-05T12:00:00','2026-01-01',false,0],['2026-02-05T12:00:00','2026-01-15',false,1],['2026-12-05T12:00:00','2026-01-31',false,11],['2027-01-05T12:00:00','2026-01-15',true,null]]){
   if(page)await page.close();
   page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.setContent(html);
   await page.evaluate(iso=>{const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:[iso]));}static now(){return new Original(iso).getTime();}}},now);
   await page.addScriptTag({path:root+'/admin/admin-settlement-v2.js'});
   await page.evaluate(({join})=>{
    document.querySelector('#settlementView').style.display='block';
    for(const [id,value] of Object.entries({settlementMemberNo:'123456',settlementMemberName:'テスト会員',settlementEmail:'test@example.invalid',settlementJoinDate:join,settlementFirstPaid:'1000'}))document.getElementById(id).value=value;
    document.querySelector('#settlementCalculate').click();
   },{join});
   const text=await page.locator('#settlementPaymentGuide').textContent();
   const total=await page.locator('#settlementTotal').textContent();
   if(totalZero){assert.equal(total,'0円');assert.match(text,/12か月が経過/);}else{assert.notEqual(total,'0円');assert.ok(text.includes(`${count}/12回`));}
   const rows=await page.locator('#settlementRows').textContent();assert.match(rows,/日割り差額（継続条件の回数に含めない）/);
   if(totalZero){await page.locator('#settlementRows [data-status]').nth(2).selectOption('休会');assert.notEqual(await page.locator('#settlementTotal').textContent(),'0円');}
   console.log(JSON.stringify({now,join,total,guide:text}));
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
