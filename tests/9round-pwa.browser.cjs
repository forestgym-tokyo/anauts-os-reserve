const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.ROUND9_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../9round-booking');
const evidence = process.env.ROUND9_BROWSER_EVIDENCE || '/tmp/nine-round-pwa-evidence';
fs.mkdirSync(evidence, {recursive:true});
const prefix = '/anauts-os-reserve/9round-booking/';
let origin, apiCalls = 0, preferLegacy = false;
const legacyTarget = 'https://script.google.com/macros/s/rollback-fixture/exec?page=member';
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/__api' && req.method==='POST'){
    apiCalls++; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:false,code:'SESSION_EXPIRED',message:'本人確認が必要です。'})); return;
  }
  if(!url.pathname.startsWith(prefix)){res.statusCode=404;res.end();return;}
  const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
  const file = path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
  const type={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(file)]||'text/plain';
  res.setHeader('Content-Type',type); res.setHeader('Cache-Control','no-store');
  let data=fs.readFileSync(file);
  if(relative==='config.js')data='window.ANAUTS_ROUND9_BOOKING='+JSON.stringify({apiUrl:origin+'/__api',requestTimeoutMs:5000,preferLegacy,legacyMemberUrl:legacyTarget});
  res.end(data);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.ROUND9_CHROMIUM_PATH || undefined,args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-zygote"],headless:true});
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:844}});
    const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')console.error(m.text());});await page.goto(origin+prefix);await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r && r.active;},null,{timeout:15000});
    await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller);
    const cdp=await ctx.newCDPSession(page);const manifest=await cdp.send('Page.getAppManifest');
    assert.equal(manifest.errors.length,0,JSON.stringify(manifest.errors));
    const installation=await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(installation.installabilityErrors,[],JSON.stringify(installation));
    await page.getByRole('button',{name:'アプリをインストール',exact:true}).click();
    assert.equal(await page.locator('#installHelp').evaluate(el=>el.open),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const denied=await page.evaluate(async()=>{try{await NineRoundBookingApi('get9RoundWorkoutSlots',{date:'2026-10-19'});}catch(e){return e.code;}});
    assert.equal(denied,'SESSION_EXPIRED');assert.equal(apiCalls,1);
    const keys=await page.evaluate(async()=>{const names=await caches.keys();return (await Promise.all(names.map(async n=>(await (await caches.open(n)).keys()).map(r=>r.url)))).flat();});
    assert.ok(keys.every(url=>new URL(url).pathname.startsWith(prefix)));
    assert.ok(!keys.some(url=>url.includes('__api')||url.includes('session_token')));
    await ctx.setOffline(true);await page.reload();await page.getByRole('heading',{name:'メールアドレスで本人確認',exact:true}).waitFor();
    const offlineMessage=await page.evaluate(async()=>{try{await NineRoundBookingApi('get9RoundWorkoutSlots',{date:'2026-10-19'});}catch(e){return e.message;}});
    assert.match(offlineMessage,/インターネット接続/);assert.equal(apiCalls,1,'offline API calls must never be answered from the cache or queued');
    if(!await page.evaluate(()=>navigator.onLine))assert.equal(await page.locator('#connectionStatus').isVisible(),true);
    await ctx.setOffline(false);await page.reload();
    await page.screenshot({path:path.join(evidence,'pwa-install-mobile.png'),fullPage:true});
    preferLegacy = true;
    await page.route(legacyTarget, route=>route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Legacy member page</h1>'}));
    await page.reload();await page.waitForURL(legacyTarget);
    await page.getByRole('heading',{name:'Legacy member page'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'passed',chromeInstallabilityErrors:installation.installabilityErrors,manifest:JSON.parse(manifest.data).short_name,serviceWorker:true,offlineShell:true,apiNotCached:true,mobileNoOverflow:true,legacyRollback:true}));
    await ctx.close();
  } finally {await browser.close();server.close();server.closeAllConnections();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
