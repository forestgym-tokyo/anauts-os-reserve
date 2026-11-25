const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers/soga-correction-fixture.cjs');
const {signature} = require('../admin/admin-soga-requested-correction.js');
const {chromium} = require(process.env.SOGA_PLAYWRIGHT_MODULE || '/workspace/.anauts-tools/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidence = process.env.SOGA_BROWSER_EVIDENCE || '/tmp/soga-native-correction-evidence';
fs.mkdirSync(evidence, {recursive: true});

async function main() {
  const browser = await chromium.launch({headless: true, executablePath: process.env.SOGA_CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage']});
  let checked = 0;
  try {
    for (const scenario of ['published','draft','repeated','staff','conflict','race','save-timeout','publish-retry','verify-mismatch','untracked','inactive-link','get-transient','get-persistent','saved-get-persistent','post-fetch-committed','saved-unpublished','publish-read-transient','write-not-confirmed','draft-publish-requested']) {
      const context = await browser.newContext({viewport:{width:1280,height:900}});
      const page = await context.newPage();
      const errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      const initial = fixture();
      initial.board.assignments[0].assignment_type = 'TRIAL';
      initial.published = !['draft','saved-unpublished','draft-publish-requested'].includes(scenario);
      const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin.css"></head><body><main class="main"></main><script>
      const scenario=${JSON.stringify(scenario)};
      const state={authUser:{permission:scenario==='staff'?'STAFF':'ADMIN'}};
      window.fixture=${JSON.stringify(initial)};
      window.calls={get:[],post:[]};
      let boardReads=0, publishAttempts=0, currentUserReads=0, publicationReads=0;
      window.recover=false;
      function assignmentKey(row){return [row.date,row.start_time,row.staff_code].join('|')}
      if(scenario==='untracked')fixture.shifts[0].shift_id='untracked';
      if(['repeated','saved-unpublished'].includes(scenario)){
        fixture.board.assignments.forEach(row=>{
          if(row.date==='2026-11-25'&&row.start_time>='16:15'&&row.staff_code==='KEVIN')row.staff_code='KAWAKAMI';
          if(row.date==='2026-11-26'&&row.start_time>='16:15'&&row.staff_code==='SAKAKI')row.staff_code='KEVIN';
        });
        fixture.shifts=structuredClone(fixture.board.assignments);
      }
      async function apiGet(action){
        calls.get.push(action);
        if(action==='getCurrentUser'){
          currentUserReads++;
          if(scenario==='get-transient'&&currentUserReads===2)throw new TypeError('Failed to fetch');
          if(scenario==='get-persistent'&&currentUserReads>=2&&currentUserReads<=4)throw new TypeError('Failed to fetch');
          if(scenario==='saved-get-persistent'&&currentUserReads>=3&&!window.recover)throw new TypeError('Failed to fetch');
          return {ok:true,data:{permission:state.authUser.permission}};
        }
        if(action==='getSogaShiftBoard'){
          boardReads++;
          if(scenario==='race'&&boardReads===2)fixture.board.assignments[14].assignment_type='TRIAL';
          return {ok:true,data:structuredClone(fixture.board)};
        }
        if(action==='getStaffShiftPublication'){
          publicationReads++;
          if(scenario==='publish-read-transient'&&publishAttempts===1&&publicationReads===4)throw new TypeError('Failed to fetch');
          return {ok:true,data:{is_published:fixture.published}};
        }
        if(action==='getStaffShifts')return {ok:true,data:structuredClone(fixture.shifts)};
        throw Error('Unexpected GET action');
      }
      async function apiPost(payload){
        calls.post.push(structuredClone(payload));
        if(payload.action==='saveSogaShiftAssignments'){
          if(scenario==='conflict')throw Error('MPGに確定予約があるため登録できません。');
          if(scenario==='write-not-confirmed')throw new TypeError('Failed to fetch');
          const old=new Map(fixture.board.assignments.map(row=>[assignmentKey(row),row]));
          fixture.board.assignments=payload.assignments.map((row,index)=>({...row,store_code:'SOGA',active:true,shift_id:old.get(assignmentKey(row))?.shift_id||'new-'+index}));
          fixture.shifts=structuredClone(fixture.board.assignments);
          fixture.published=false;
          if(scenario==='verify-mismatch')fixture.shifts=fixture.shifts.filter(row=>!(row.date==='2026-11-25'&&row.staff_code==='KAWAKAMI'&&row.start_time==='16:15'));
          if(scenario==='save-timeout')throw Error('通信がタイムアウトしました。');
          if(scenario==='post-fetch-committed')throw new TypeError('Failed to fetch');
          return {ok:true};
        }
        if(payload.action==='publishStaffShiftMonth'){
          publishAttempts++;
          if(scenario==='publish-retry'&&publishAttempts===1)throw Error('一時的な通信エラー');
          fixture.published=true; return {ok:true};
        }
        throw Error('Unexpected mutation');
      }
      </script><script src="/admin/admin-soga-requested-correction.js"></script></body></html>`;
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') {external.push(url.hostname); await route.abort(); return;}
        if (url.pathname === '/admin/') return route.fulfill({contentType:'text/html',body:html});
        const relative = url.pathname.replace(/^\//,'');
        if (['admin/admin.css','admin/admin-soga-requested-correction.js'].includes(relative)) return route.fulfill({contentType:relative.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(root,relative),'utf8')});
        return route.abort();
      });
      await page.goto('http://127.0.0.1:8765/admin/' + (scenario==='inactive-link'?'':'?sogaShiftCorrection=20261125-26'+(scenario==='draft-publish-requested'?'&publishCorrection=1':'')));
      if (scenario === 'inactive-link') {
        assert.equal(await page.locator('#sogaRequestedCorrection').count(),0);
        assert.deepEqual(await page.evaluate(()=>calls),{get:[],post:[]});
      } else {
        await page.waitForFunction(()=>!document.querySelector('#sogaCorrectionStatus').textContent.includes('確認しています'));
        assert.equal((await page.evaluate(()=>calls.post)).length,0,'opening the link must never mutate shifts');
        const button = page.locator('#sogaCorrectionApply');
        if (['staff','untracked','repeated'].includes(scenario)) {
          assert.equal(await button.isDisabled(),true);
          const message = await page.locator('#sogaCorrectionStatus').innerText();
          assert.match(message,scenario==='staff'?/ADMIN/:scenario==='untracked'?/一致しない/:/変更を確認しました/);
        } else {
          await button.click();
          if (scenario === 'conflict') {
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('MPGに確定予約'));
          } else if (scenario === 'race') {
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('確認後にシフトが更新'));
          } else if (scenario === 'verify-mismatch') {
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('保存後の内容が一致しません'));
          } else if (scenario === 'get-persistent') {
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('変更はまだ送信していません'));
            assert.equal((await page.evaluate(()=>calls.post)).length,0);
            await page.locator('#sogaCorrectionReload').click();
            await page.waitForFunction(()=>!document.querySelector('#sogaCorrectionApply').disabled);
            assert.equal((await page.evaluate(()=>calls.post)).length,0);
          } else if (scenario === 'saved-get-persistent') {
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('保存結果の確認中に通信が途切れました'));
            assert.equal((await page.evaluate(()=>calls.post)).length,1);
            assert.equal(await button.isDisabled(),true);
            await page.evaluate(()=>{window.recover=true;});
            await page.locator('#sogaCorrectionReload').click();
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionApply').textContent.includes('変更済みのシフトをスタッフへ公開'));
            assert.equal((await page.evaluate(()=>calls.post)).length,1);
            await button.click();
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('スタッフにも公開済み'));
          } else if (scenario === 'write-not-confirmed') {
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('保存後の内容が一致しません'));
            await page.locator('#sogaCorrectionReload').click();
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('保存結果をまだ確認できません'));
            assert.equal(await button.isDisabled(),true);
          } else if (scenario === 'publish-retry') {
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('公開を再開'));
            await page.locator('#sogaCorrectionReload').click();
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionApply').textContent.includes('変更済みのシフトをスタッフへ公開'));
            await button.click();
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('スタッフにも公開済み'));
          } else {
            await page.waitForFunction(()=>document.querySelector('#sogaCorrectionStatus').textContent.includes('変更を確認しました'));
          }
          const calls = await page.evaluate(()=>window.calls);
          if (['race','get-persistent'].includes(scenario)) assert.equal(calls.post.length,0);
          else assert.equal(calls.post.filter(row=>row.action==='saveSogaShiftAssignments').length,scenario==='saved-unpublished'?0:1);
          if (['conflict','verify-mismatch','race','draft','get-persistent','write-not-confirmed'].includes(scenario)) assert.equal(calls.post.filter(row=>row.action==='publishStaffShiftMonth').length,0);
          if (['published','save-timeout','publish-retry','get-transient','saved-get-persistent','post-fetch-committed','saved-unpublished','publish-read-transient','draft-publish-requested'].includes(scenario)) {
            assert.equal(await page.evaluate(()=>fixture.published),true);
            assert.equal(await button.isDisabled(),true);
            const saved = calls.post.find(row=>row.action==='saveSogaShiftAssignments')?.assignments || await page.evaluate(()=>fixture.board.assignments);
            assert.equal(saved.filter(row=>row.date==='2026-11-25'&&row.staff_code==='KAWAKAMI'&&row.start_time>='16:15').length,6);
            assert.equal(saved.filter(row=>row.date==='2026-11-26'&&row.staff_code==='KEVIN'&&row.start_time>='16:15').length,6);
            assert.equal(saved.find(row=>row.date==='2026-11-25'&&row.staff_code==='KAWAKAMI').assignment_type,'TRIAL');
            for (const before of initial.board.assignments.slice(12)) assert.ok(saved.some(row=>signature([before])===signature([row])));
          }
          if (scenario === 'draft') {
            assert.equal(await page.evaluate(()=>fixture.published),false);
            assert.match(await page.locator('#sogaCorrectionStatus').innerText(),/公開前の状態を維持/);
          }
          if (scenario === 'published') {
            for (const width of [320,1280]) {
              await page.setViewportSize({width,height:900});
              assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
              await page.locator('#sogaRequestedCorrection').screenshot({path:path.join(evidence,'correction-'+width+'.png')});
            }
          }
        }
      }
      assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
      console.log('PASS '+scenario); checked++;
      await context.close();
    }
  } finally {await browser.close();}
  console.log('Browser scenarios passed: '+checked+'; all fixture data; external requests: 0.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
