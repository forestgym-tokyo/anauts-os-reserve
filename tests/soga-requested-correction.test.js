const test = require('node:test');
const assert = require('node:assert/strict');
const {makePlan, verify, signature, readLive, retryRead} = require('../admin/admin-soga-requested-correction.js');

const {fixture} = require('./helpers/soga-correction-fixture.cjs');

test('requested correction changes exactly two afternoons and preserves mornings, other staff, and other dates', () => {
  const {board, shifts} = fixture();
  const original = structuredClone(board);
  const plan = makePlan(board, shifts);
  assert.equal(plan.assignments.length, board.assignments.length);
  for (const date of ['2026-11-25','2026-11-26']) {
    const to = date.endsWith('25') ? 'KAWAKAMI' : 'KEVIN';
    const from = date.endsWith('25') ? 'KEVIN' : 'SAKAKI';
    assert.equal(plan.assignments.filter(row => row.date === date && row.staff_code === to && row.start_time >= '16:15').length,6);
    assert.equal(plan.assignments.filter(row => row.date === date && row.staff_code === from && row.start_time >= '16:15').length,0);
    assert.ok(plan.assignments.some(row => row.date === date && row.staff_code === from && row.start_time === '10:15'));
  }
  for (const row of board.assignments.slice(14)) assert.ok(plan.assignments.some(other => signature([row]) === signature([other])));
  assert.deepEqual(board,original);
});
test('trial responsibility follows reassigned staff', () => {
  const {board, shifts} = fixture(); board.assignments[0].assignment_type = 'TRIAL';
  const plan = makePlan(board, shifts);
  assert.equal(plan.assignments.find(row => row.date === '2026-11-25' && row.start_time === '16:15' && row.staff_code === 'KAWAKAMI').assignment_type,'TRIAL');
});
test('existing target slots are retained without duplicates and their trial responsibility is preserved', () => {
  const {board, shifts, row} = fixture();
  const target = row('2026-11-26','KEVIN',0,'TRIAL'); board.assignments.push(target); shifts.push(target);
  const plan = makePlan(board, shifts);
  assert.equal(plan.assignments.filter(row => row.date === '2026-11-26' && row.staff_code === 'KEVIN').length,6);
  assert.equal(plan.assignments.find(row => row.date === '2026-11-26' && row.staff_code === 'KEVIN').assignment_type,'TRIAL');
});
test('repeating the correction is idempotent', () => {
  const {board, shifts} = fixture(); const plan = makePlan(board,shifts);
  const saved = plan.assignments.map((row,i) => ({...row,store_code:'SOGA',shift_id:board.assignments.find(old => signature([old])===signature([row]))?.shift_id || 'saved-'+i,active:true}));
  const next = makePlan({...board,assignments:saved},saved);
  assert.equal(next.changed,false); assert.equal(verify(plan,{...board,assignments:saved},saved),true);
});
test('ambiguous people, unavailable people, missing slots, and untracked shifts stop before writes', () => {
  const a=fixture(); a.board.staff.push({...a.board.staff[2],staff_code:'ANOTHER'});
  assert.throws(()=>makePlan(a.board,a.shifts),/一意/);
  const b=fixture(); b.board.staff[1].active=false;
  assert.throws(()=>makePlan(b.board,b.shifts),/一意/);
  const c=fixture(); c.board.slots.pop();
  assert.throws(()=>makePlan(c.board,c.shifts),/勤務枠/);
  const d=fixture(); d.shifts[0].shift_id='untracked';
  assert.throws(()=>makePlan(d.board,d.shifts),/一致しない/);
  const e=fixture(); e.board.assignments.push({...e.board.assignments[0]});
  assert.throws(()=>makePlan(e.board,e.shifts),/不整合/);
});
test('verification checks the active shift records as well as assignments, including removal and outside scope', () => {
  const {board,shifts}=fixture(); const plan=makePlan(board,shifts);
  const saved=plan.assignments.map((row,i)=>({...row,shift_id:board.assignments.find(old=>signature([old])===signature([row]))?.shift_id || 'new-'+i,store_code:'SOGA'}));
  const savedBoard={...board,assignments:saved};
  assert.equal(verify(plan,savedBoard,saved),true);
  assert.equal(verify(plan,savedBoard,[...saved,shifts[0]]),false);
  assert.equal(verify(plan,savedBoard,saved.slice(1)),false);
  assert.equal(verify(plan,{...savedBoard,assignments:saved.slice(1)},saved),false);
  assert.equal(verify(plan,savedBoard,[...saved,{...shifts[0],active:false}]),true);
});
test('ordinary server-confirmed ADMIN authentication is required',async()=>{
  let reads=0;
  await assert.rejects(()=>readLive(async()=>{reads++; return{data:{permission:'MANAGER'}}}),/ADMIN/);
  assert.equal(reads,1);
  const {board,shifts}=fixture();
  const snapshot=await readLive(async action=>({data:action==='getCurrentUser'?{profile:{permission:'ADMIN'}}:action==='getSogaShiftBoard'?board:action==='getStaffShiftPublication'?{is_published:true}:{shifts}}));
  assert.deepEqual(snapshot.board,board); assert.equal(snapshot.publication.is_published,true);
});

test('ordinary Kevin Sunday restrictions remain enforced using calendar dates',()=>{
  const {board,shifts,row}=fixture(); const sunday=row('2026-11-22','KEVIN',0);
  board.assignments.push(sunday); shifts.push(sunday);
  assert.throws(()=>makePlan(board,shifts),/日曜勤務/);
});

test('ordinary short afternoon shift rules still require the complete morning',()=>{
  const {board,shifts,row}=fixture();
  for(const index of [0,1]){const short=row('2026-11-23','OTHER',index);board.assignments.push(short);shifts.push(short);}
  assert.throws(()=>makePlan(board,shifts),/前半も必須/);
  for(const [start_time,end_time] of [['10:15','11:00'],['11:00','11:45'],['11:45','12:30'],['12:30','13:15'],['13:15','14:00']]){
    const morning={date:'2026-11-23',staff_code:'OTHER',start_time,end_time,store_code:'SOGA',shift_id:'morn-'+start_time};
    board.assignments.push(morning);shifts.push(morning);
  }
  assert.equal(makePlan(board,shifts).changed,true);
});

test('transient failed-to-fetch reads retry with a bound and keep their action and parameters',async()=>{
  let calls=0; const pauses=[],params={month:'2026-11'};
  const value=await retryRead(async(action,actual)=>{
    calls++;assert.equal(action,'getSogaShiftBoard');assert.equal(actual,params);
    if(calls<3)throw new TypeError('Failed to fetch');
    return {ok:true};
  },'getSogaShiftBoard',params,async ms=>pauses.push(ms));
  assert.equal(value.ok,true);assert.equal(calls,3);assert.deepEqual(pauses,[500,1000]);
  calls=0;
  await assert.rejects(()=>retryRead(async()=>{calls++;throw new TypeError('Failed to fetch')},'getCurrentUser',{},async()=>{}),/Failed to fetch/);
  assert.equal(calls,3);
});

test('authorization failures and already-timed-out reads are not retried',async()=>{
  for(const error of [new Error('ログイン情報が無効または期限切れです。'),Object.assign(new Error('通信が60秒以内に完了しませんでした。'),{name:'TimeoutError'})]){
    let calls=0;
    await assert.rejects(()=>retryRead(async()=>{calls++;throw error},'getCurrentUser',{},async()=>{}));
    assert.equal(calls,1);
  }
});

test('live confirmation serializes reads instead of sending concurrent GAS requests',async()=>{
  const {board,shifts}=fixture();let active=0,maxActive=0;const actions=[];
  await readLive(async action=>{
    actions.push(action);active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setImmediate(resolve));active--;
    return {data:action==='getCurrentUser'?{permission:'ADMIN'}:action==='getSogaShiftBoard'?board:action==='getStaffShiftPublication'?{is_published:true}:shifts};
  });
  assert.equal(maxActive,1);assert.deepEqual(actions,['getCurrentUser','getSogaShiftBoard','getStaffShiftPublication','getStaffShifts']);
});
