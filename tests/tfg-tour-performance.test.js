const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./helpers/tfg-tour-fixture.cjs');

test('TOUR reads each booking sheet only once and restores both readers afterwards',()=>{
 const e=fixture(),reads={},read=e.context.getSheetData,mailRead=e.context.getReservationMailRows_;
 const counted=name=>{reads[name]=(reads[name]||0)+1;return read(name);};
 e.context.getSheetData=counted;
 const result=e.context.createReservationStoreAware_(e.payload());
 assert.equal(result.ok,true,JSON.stringify(result));
 for(const name of ['services','staff','staff_shifts','service_hours','reservations'])assert.equal(reads[name],1,name);
 assert.equal(e.context.getSheetData,counted);assert.equal(e.context.getReservationMailRows_,mailRead);
});

test('a pre-lock staff read is never reused for the locked booking decision',()=>{
 const e=fixture(),getLock=e.context.LockService.getScriptLock;
 e.context.createReservationWithTrainerPolicy_=params=>{e.context.getSheetData('staff_shifts');return e.context.createReservation(params);};
 e.context.LockService.getScriptLock=()=>{const lock=getLock();return {...lock,waitLock(){lock.waitLock();e.tables.staff_shifts=[];}};};
 const result=e.context.createReservationStoreAware_(e.payload());
 assert.equal(result.ok,false);assert.equal(e.events.length,0);assert.equal(e.tables.reservations.length,0);
});

test('receipt appears after calendar, reservation, history and flush, before mail, with no customer data',()=>{
 const e=fixture(),input=e.payload({party_size:2,guests:[e.one,e.two]}),send=e.context.GmailApp.sendEmail;
 let flushed=false,checked=0;
 e.context.SpreadsheetApp.flush=()=>{assert.equal(e.context.getTourBookingStatus_(input).data.confirmed,false);flushed=true;};
 e.context.GmailApp.sendEmail=(...args)=>{
  assert.equal(flushed,true);assert.equal(e.events.length,1);assert.equal(e.tables.reservations.length,1);assert.equal(e.tables.reservation_history.length,1);
  const data=e.context.getTourBookingStatus_(input).data;
  assert.equal(data.confirmed,true);assert.equal(data.mail_status,'sending');assert.equal(data.party_size,2);
  const text=JSON.stringify(data);for(const privateValue of [e.one.name,e.one.email,e.two.phone,'note','customer_'])assert.equal(text.includes(privateValue),false);
  const lock=e.context.LockService.getScriptLock();lock.waitLock();lock.releaseLock();
  checked++;send(...args);
 };
 const result=e.context.createReservationStoreAware_(input);
 assert.equal(result.ok,true);assert.equal(checked,3);assert.equal(e.context.getTourBookingStatus_(input).data.mail_status,'sent');
 assert.equal(e.context.getTourBookingStatus_({request_id:'different-request-0001'}).data.confirmed,false);
});

test('receipt status does not read any sheets or wait for the booking lock',()=>{
 const e=fixture();e.context.getSheetData=()=>{throw Error('unexpected sheet read');};e.context.LockService.getScriptLock=()=>{throw Error('unexpected lock');};
 assert.equal(e.context.getTourBookingStatus_(e.payload()).data.confirmed,false);
 assert.equal(e.context.getTourBookingStatus_({request_id:'bad'}).code,'INVALID_REQUEST_ID');
});

test('failed flush rolls back the event, publishes no receipt and restores readers',()=>{
 const e=fixture(),read=e.context.getSheetData,mailRead=e.context.getReservationMailRows_;
 e.context.SpreadsheetApp.flush=()=>{throw Error('flush failed');};
 assert.equal(e.context.createReservationStoreAware_(e.payload()).ok,false);
 assert.equal(e.context.getTourBookingStatus_(e.payload()).data.confirmed,false);assert.equal(e.mail.length,0);assert.equal(e.events.length,0);
 assert.equal(e.context.getSheetData,read);assert.equal(e.context.getReservationMailRows_,mailRead);
});

test('calendar conflict never publishes a confirmation receipt',()=>{
 const e=fixture();e.events.push(e.event('2026-11-01T09:00:00+09:00','2026-11-01T10:00:00+09:00'));
 assert.equal(e.context.createReservationStoreAware_(e.payload()).ok,false);assert.equal(e.context.getTourBookingStatus_(e.payload()).data.confirmed,false);
});

test('post-commit log and mail failures preserve the booking and leave a usable receipt',()=>{
 const e=fixture();e.context.logInfo=()=>{throw Error('log failure');};e.context.logError=()=>{throw Error('log failure');};e.context.sendReservationMailSafely_=()=>{throw Error('mail outage');};
 const result=e.context.createReservationStoreAware_(e.payload());
 assert.equal(result.ok,true);assert.equal(result.data.mail_status,'pending');assert.equal(e.events.length,1);assert.equal(e.tables.reservations.length,1);
 assert.equal(e.context.getTourBookingStatus_(e.payload()).data.confirmed,true);assert.equal(e.context.getTourBookingStatus_(e.payload()).data.mail_status,'pending');
});

test('receipt cache failure still returns the normal confirmed POST and sends all mail',()=>{
 const e=fixture();e.context.CacheService.getScriptCache=()=>({get(){throw Error('cache down');},put(){throw Error('cache down');},remove(){}});
 const result=e.context.createReservationStoreAware_(e.payload());assert.equal(result.ok,true);assert.equal(result.data.mail_status,'sent');assert.equal(e.mail.length,2);
});

test('request memo also shares mail template and account reads without leaking to the next request',()=>{
 const e=fixture(),read=e.context.getSheetData,counts={};
 e.context.getSheetData=name=>{counts[name]=(counts[name]||0)+1;return read(name);};
 const restore=e.context.beginTourBookingReadCache_();
 try{for(let i=0;i<3;i++){e.context.getReservationMailRows_('mail_templates');e.context.getReservationMailRows_('mail_accounts');e.context.getSheetData('mail_templates');}}
 finally{restore();}
 assert.equal(counts.mail_templates,1);assert.equal(counts.mail_accounts,1);e.context.getSheetData('mail_templates');assert.equal(counts.mail_templates,2);
});

test('TOUR reservation writes use one text-format operation and preserve leading zeros',()=>{
 const e=fixture(),source=fs.readFileSync(path.join(__dirname,'../gas/29_Reservation.gs.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf('function appendReservationObject_('),source.indexOf('function appendReservationHistory_(')),e.context);
 const headers=['reservation_id','customer_phone','duration','created_at'],formats=[],writes=[];
 e.context.getSheet=()=>({getLastColumn:()=>headers.length,getLastRow:()=>1,getRangeList:addresses=>({setNumberFormat:format=>formats.push({addresses:[...addresses],format})}),getRange:(row,column,height,width)=>({getValues:()=>[headers],setValues:rows=>writes.push(rows)})});
 e.context.appendReservationObject_('reservations',{service_code:'TOUR',reservation_id:'RSV001',customer_phone:'09012345678',duration:60,created_at:new Date('2026-11-01')},['reservation_id']);
 assert.deepEqual(formats,[{addresses:['R2C1','R2C2'],format:'@'}]);assert.equal(writes[0][0][1],'09012345678');assert.equal(writes[0][0][2],60);
});

test('TOUR bulk normalizes Sheets dates once and constructs Tokyo times without Utilities calls',()=>{
 const e=fixture();let calls=0;const parse=e.context.Utilities.parseDate;
 e.context.Utilities.parseDate=(...args)=>{calls++;return parse(...args);};
 const source={date:new Date('2026-11-01T00:00:00+09:00'),start_time:new Date('2026-11-01T09:00:00+09:00'),end_time:new Date('2026-11-01T10:00:00+09:00')};
 const normalized=e.context.normalizeTourWeekPeriod_(source,'date');
 assert.equal(normalized.date,'2026-11-01');assert.equal(normalized.start_time,'09:00');assert.equal(normalized.end_time,'10:00');assert.ok(source.date instanceof Date);
 assert.equal(e.context.makeTourWeekDateTime_('2026-11-01','09:00').toISOString(),'2026-11-01T00:00:00.000Z');assert.equal(calls,0);
});
