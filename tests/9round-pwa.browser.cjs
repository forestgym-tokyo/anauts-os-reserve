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
    assert.equal(await page.locator('#installApp').textContent(),'アプリの追加方法');
    await page.locator('#installApp').click();
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
    await ctx.close();
    preferLegacy=false;
    async function installPage(userAgent, setup) {
      const context=await browser.newContext({viewport:{width:390,height:844},userAgent,serviceWorkers:'block'});
      if(setup)await context.addInitScript(setup);
      const tab=await context.newPage();tab.setDefaultTimeout(10000);
      tab.on('pageerror',e=>errors.push(e.message));
      await tab.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      await tab.goto(origin+prefix+'?booking_id=not-for-copy#mail_token=not-for-copy');
      await tab.locator('#installPanel[data-install-state]').waitFor();
      return {context,tab};
    }
    // In-app Android browsers get an explicit Chrome route and a clean public URL.
    const android=await installPage('Mozilla/5.0 (Linux; Android 16; Test Phone; wv) AppleWebKit/537.36 Version/4.0 Chrome/153.0.0.0 Mobile Safari/537.36 Line/15.0');
    await android.context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
    assert.equal(await android.tab.locator('#installApp').textContent(),'ホーム画面への追加方法');
    await android.tab.locator('#installApp').click();
    assert.equal(await android.tab.locator('[data-install-platform="android"]').isVisible(),true);
    assert.equal(await android.tab.locator('[data-install-platform="ios"]').isVisible(),false);
    const chromeHref=await android.tab.locator('#openInstallChrome').getAttribute('href');
    assert.match(chromeHref,/^intent:\/\/forestgym-tokyo\.github\.io\/anauts-os-reserve\/9round-booking\/#Intent;scheme=https;package=com\.android\.chrome;/);
    assert.doesNotMatch(chromeHref,/not-for-copy|booking_id|mail_token/);
    await android.tab.locator('#copyInstallUrl').click();
    assert.equal(await android.tab.evaluate(()=>navigator.clipboard.readText()),'https://forestgym-tokyo.github.io/anauts-os-reserve/9round-booking/');
    await android.tab.setViewportSize({width:320,height:780});
    assert.equal(await android.tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await android.tab.setViewportSize({width:390,height:844});
    await android.tab.locator('#installPanel').screenshot({path:path.join(evidence,'install-guide-android.png')});
    await android.context.close();
    // iPhone uses the actual Safari share flow; denied clipboard still has a way to copy.
    const iphone=await installPage('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',()=>{
      Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('clipboard denied'))}});
    });
    assert.equal(await iphone.tab.locator('#installApp').textContent(),'iPhoneのホーム画面への追加方法');
    await iphone.tab.locator('#installApp').click();
    assert.equal(await iphone.tab.locator('[data-install-platform="ios"]').isVisible(),true);
    assert.equal(await iphone.tab.locator('[data-install-platform="android"]').isVisible(),false);
    await iphone.tab.locator('#copyInstallUrl').click();
    await iphone.tab.locator('#installUrl').waitFor({state:'visible'});
    assert.equal(await iphone.tab.locator('#installUrl').inputValue(),'https://forestgym-tokyo.github.io/anauts-os-reserve/9round-booking/');
    await iphone.tab.setViewportSize({width:320,height:780});
    assert.equal(await iphone.tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await iphone.tab.setViewportSize({width:390,height:844});
    await iphone.tab.locator('#installPanel').screenshot({path:path.join(evidence,'install-guide-iphone.png')});
    await iphone.context.close();
    // Exercise the browser-event handler, rather than treating an opened guide as installation.
    const native=await installPage('Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36');
    async function offerPrompt(fail) {
      await native.tab.evaluate(fail=>{
        window.installPromptCalls=0;
        const event=new Event('beforeinstallprompt',{cancelable:true});
        event.prompt=()=>{window.installPromptCalls++;return fail?Promise.reject(new Error('prompt failed')):Promise.resolve();};
        event.userChoice=new Promise(resolve=>{window.chooseInstall=resolve;});
        window.dispatchEvent(event);
      },fail);
      await native.tab.locator('#installPanel[data-install-state="ready"]').waitFor();
      assert.equal(await native.tab.locator('#installApp').textContent(),'アプリをインストール');
    }
    await offerPrompt(false);
    await native.tab.locator('#installApp').click();
    assert.equal(await native.tab.locator('#installApp').isDisabled(),true);
    await native.tab.locator('#installApp').dispatchEvent('click');
    assert.equal(await native.tab.evaluate(()=>window.installPromptCalls),1);
    await native.tab.evaluate(()=>window.chooseInstall({outcome:'dismissed'}));
    await native.tab.locator('#installPanel[data-install-state="guide"]').waitFor();
    assert.match(await native.tab.locator('#installStatus').textContent(),/今回は追加されていません/);
    await native.tab.locator('#installApp').click();
    assert.equal(await native.tab.evaluate(()=>window.installPromptCalls),1,'a used prompt cannot be reused');
    await offerPrompt(true);await native.tab.locator('#installApp').click();
    await native.tab.locator('#installPanel[data-install-state="guide"]').waitFor();
    assert.match(await native.tab.locator('#installStatus').textContent(),/インストール画面を開けませんでした/);
    await offerPrompt(false);await native.tab.locator('#installApp').click();
    await native.tab.evaluate(()=>window.chooseInstall({outcome:'accepted'}));
    await native.tab.locator('#installPanel[data-install-state="accepted"]').waitFor();
    assert.equal(await native.tab.locator('#installApp').isVisible(),false);
    assert.match(await native.tab.locator('#installStatus').textContent(),/受け付けました/);
    await native.tab.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
    assert.equal(await native.tab.locator('#installPanel').isVisible(),false);
    await native.context.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'passed',chromeInstallabilityErrors:installation.installabilityErrors,manifest:JSON.parse(manifest.data).short_name,serviceWorker:true,offlineShell:true,apiNotCached:true,mobileNoOverflow:true,legacyRollback:true,androidChromeRoute:true,iphoneSafariGuide:true,publicUrlCopy:true,clipboardFailureFallback:true,promptStatesTested:['pending','dismissed','failed','accepted','appinstalled'],duplicatePromptBlocked:true,nativeDeviceInstallation:'not exercised; browser event lifecycle simulated'}));
  } finally {await browser.close();server.close();server.closeAllConnections();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
