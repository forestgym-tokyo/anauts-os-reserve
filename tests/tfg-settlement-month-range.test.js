const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {test}=require("node:test");
const assert=require("node:assert/strict");

const root=path.resolve(__dirname,"..");
function runMonthRange(file,from,to){
  const source=fs.readFileSync(path.join(root,"admin",file),"utf8");
  const start=source.indexOf("function monthsBetween(");
  const end=source.indexOf("function rateFor(",start);
  assert.ok(start>=0&&end>start);
  const scope=vm.createContext({});
  vm.runInContext(source.slice(start,end),scope);
  scope.from=from;
  scope.to=to;
  // Bound the regression so the old December loop fails without exhausting memory.
  return JSON.parse(JSON.stringify(vm.runInContext("monthsBetween(from,to)",scope,{timeout:200})));
}

for(const file of ["admin-settlement-v2.js","admin-settlement.js"]){
  test(`${file}: December withdrawal finishes at the end of the requested year`,()=>{
    assert.deepEqual(runMonthRange(file,"2026-11-01","2026-12-31"),[{y:2026,m:10},{y:2026,m:11}]);
  });
  test(`${file}: joining and withdrawing in December produces one month`,()=>{
    assert.deepEqual(runMonthRange(file,"2026-12-01","2026-12-31"),[{y:2026,m:11}]);
  });
  test(`${file}: multiple years ending in December retain all and only the required months`,()=>{
    const rows=runMonthRange(file,"2024-12-15","2026-12-31");
    assert.equal(rows.length,25);
    assert.deepEqual(rows[0],{y:2024,m:11});
    assert.deepEqual(rows.at(-1),{y:2026,m:11});
    rows.forEach((row,i)=>assert.equal(row.y*12+row.m,2024*12+11+i));
  });
  test(`${file}: December to January crosses the year exactly once`,()=>{
    assert.deepEqual(runMonthRange(file,"2026-12-15","2027-01-31"),[{y:2026,m:11},{y:2027,m:0}]);
  });
  test(`${file}: same-year and cross-year non-December periods are preserved`,()=>{
    assert.deepEqual(runMonthRange(file,"2026-09-15","2026-11-30"),[{y:2026,m:8},{y:2026,m:9},{y:2026,m:10}]);
    assert.deepEqual(runMonthRange(file,"2025-11-15","2026-02-28"),[{y:2025,m:10},{y:2025,m:11},{y:2026,m:0},{y:2026,m:1}]);
  });
  test(`${file}: a start after the withdrawal year does not generate future billing rows`,()=>{
    assert.deepEqual(runMonthRange(file,"2027-01-01","2026-12-31"),[]);
  });
}
