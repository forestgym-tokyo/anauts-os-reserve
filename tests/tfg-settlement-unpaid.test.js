const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../gas/91_TfgSettlementApproval.gs'),'utf8');

function fixture({rows,headers=['memberNo','email','未払金'],status='PENDING',method='',expires='2099-01-01 00:00:00'}={}){
  const data=[headers,...(rows||[['123456','member@example.com',true],['654321','other@example.com',true]])];
  const row={row:2,id:'ST-TEST',memberNo:'123456',email:'member@example.com',status,approvedAt:'2026-11-21 10:00:00',approvalMethod:method,expiresAt:expires};
  const calls=[];
  const state={row,data,calls,failUncheck:false,ignoreUncheck:false,locked:false};
  const master={
    getLastRow:()=>data.length,getLastColumn:()=>headers.length,
    getRange:(r,c,nr,nc)=>nr?{getDisplayValues:()=>data.slice(r-1,r-1+nr).map(line=>line.slice(c-1,c-1+nc).map(String))}:{
      uncheck(){calls.push(['uncheck',r,c]);if(state.failUncheck)throw new Error('temporary write failure');if(!state.ignoreUncheck)data[r-1][c-1]=false;},
      isChecked:()=>data[r-1][c-1]===false?false:data[r-1][c-1]===true?true:null
    }
  };
  const settlement={getRange:(r,c)=>({
    setValues(values){calls.push(['approve',r,c]);[row.status,row.approvedAt,,,row.approvalMethod]=values[0];},
    setValue(value){assert.equal(c,15);row.approvalMethod=value;calls.push(['method',value]);}
  })};
  const scope=vm.createContext({console,Date,PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},
    SpreadsheetApp:{flush:()=>calls.push(['flush'])},
    LockService:{getScriptLock:()=>({waitLock(){state.locked=true;},releaseLock(){state.locked=false;}})},
    Utilities:{formatDate:()=> '2026-11-21 10:00:00'},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}
  });
  vm.runInContext(source,scope);
  scope.getTfgSettlementMemberMasterSpreadsheet_=()=>({getSheetByName:()=>master});
  scope.getTfgSettlementSheet_=()=>settlement;
  scope.findTfgSettlementByToken_=token=>token==='valid'?row:null;
  scope.tfgSettlementSendApprovalConfirmation_=()=>calls.push(['mail']);
  const body={token:'valid',memberNo:'123456',email:'member@example.com',consent1:true,consent2:true,consent3:true};
  return {...state,state,scope,body,approve:overrides=>scope.approveTfgSettlement_({...body,...overrides})};
}

test('approval clears only the matching member checkbox and records approval',()=>{
  const f=fixture();const result=f.approve();
  assert.equal(result.ok,true);assert.equal(f.row.status,'APPROVED');
  assert.equal(f.data[1][2],false);assert.equal(f.data[2][2],true);
  assert.equal(f.row.approvalMethod,'本人端末WEB承認');assert.equal(f.state.locked,false);
  assert.equal(f.calls.filter(x=>x[0]==='uncheck').length,1);
  assert.equal(f.calls.filter(x=>x[0]==='mail').length,1);
});

test('repeated approved requests do not clear a subsequently checked unpaid flag',()=>{
  const f=fixture();assert.equal(f.approve().ok,true);f.data[1][2]=true;
  const repeated=f.approve();assert.equal(repeated.ok,true);assert.equal(repeated.data.alreadyApproved,true);
  assert.equal(f.data[1][2],true);assert.equal(f.calls.filter(x=>x[0]==='uncheck').length,1);
});

test('previous approvals remain read only',()=>{
  const f=fixture({status:'APPROVED',method:'本人端末WEB承認'});
  assert.equal(f.approve().ok,true);assert.equal(f.data[1][2],true);assert.deepEqual(f.calls,[]);
});

for(const overrides of [{token:'invalid'},{memberNo:'654321'},{email:'other@example.com'},{consent1:false}]){
  test('invalid identity, token or consent cannot clear the flag: '+JSON.stringify(overrides),()=>{
    const f=fixture();assert.equal(f.approve(overrides).ok,false);
    assert.equal(f.data[1][2],true);assert.equal(f.row.status,'PENDING');assert.deepEqual(f.calls,[]);
  });
}

for(const status of ['DRAFT','SUPERSEDED','DEFERRED']){
  test(status+' cannot clear the flag',()=>{
    const f=fixture({status});assert.equal(f.approve().ok,false);assert.equal(f.data[1][2],true);assert.deepEqual(f.calls,[]);
  });
}

test('expired approval cannot clear the flag',()=>{
  const f=fixture({expires:'2000-01-01 00:00:00'});assert.equal(f.approve().ok,false);assert.deepEqual(f.calls,[]);
});

for(const config of [
  {rows:[['123456','changed@example.com',true]]},
  {rows:[['654321','other@example.com',true]]},
  {rows:[['123456','member@example.com',true],['123456','other@example.com',true]]},
  {headers:['memberNo','email','other'],rows:[['123456','member@example.com',true]]}
]){
  test('unresolved or ambiguous master row fails before approval: '+JSON.stringify(config),()=>{
    const f=fixture(config);assert.equal(f.approve().ok,false);assert.equal(f.row.status,'PENDING');assert.deepEqual(f.calls,[]);
  });
}

test('header-based lookup works when columns move and email case differs',()=>{
  const f=fixture({headers:['未払金','メールアドレス','会員番号'],rows:[[true,'MEMBER@example.com','123456'],[true,'other@example.com','654321']]});
  assert.equal(f.approve({email:' MEMBER@EXAMPLE.COM '}).ok,true);
  assert.equal(f.data[1][0],false);assert.equal(f.data[2][0],true);
});

test('interrupted checkbox update can be retried without losing approval',()=>{
  const f=fixture();f.state.failUncheck=true;
  assert.equal(f.approve().ok,false);assert.equal(f.row.status,'APPROVED');
  assert.equal(f.data[1][2],true);assert.equal(f.row.approvalMethod,'本人端末WEB承認（未払金チェック解除待ち）');
  assert.equal(f.state.locked,false);f.state.failUncheck=false;
  assert.equal(f.approve().ok,true);assert.equal(f.data[1][2],false);assert.equal(f.row.approvalMethod,'本人端末WEB承認');
});

test('silent failure to uncheck is reported instead of claiming success',()=>{
  const f=fixture();f.state.ignoreUncheck=true;
  assert.equal(f.approve().ok,false);assert.equal(f.data[1][2],true);
  assert.equal(f.row.approvalMethod,'本人端末WEB承認（未払金チェック解除待ち）');
});
