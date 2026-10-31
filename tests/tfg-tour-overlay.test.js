const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='410406868548308d7e9745cd9f45689aa296f967';
const files=['21_Service.gs.js','28_Availability.gs.js','29_Reservation.gs.js','40_ReservationMail.gs.js','46_TourQuestionnairePrint.js','46_1_TourQuestionnairePrintFast.js','60_StoreAwareAssignment.js','99_Main.js'];
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tour-overlay-test-'));for(const f of files)fs.writeFileSync(path.join(dir,f),execFileSync('git',['show',(f==='99_Main.js'?'81993fb927b368bae8c496b7616364b27d2c27a4':base)+':gas/'+f],{cwd:root}));fs.writeFileSync(path.join(dir,'REMOTE_ONLY.js'),'// keep production module\n');return dir;}
const run=dir=>execFileSync(process.execPath,[path.join(root,'scripts/gas-tfg-tour-overlay.mjs'),dir],{cwd:root,encoding:'utf8',stdio:'pipe'});
test('live overlay preserves unrelated files and edits, matches desired modules, and is repeatable',()=>{const dir=fixture();try{fs.appendFileSync(path.join(dir,files[0]),'\n// unrelated live addition\n');run(dir);for(const f of files)assert.equal(fs.readFileSync(path.join(dir,f),'utf8'),fs.readFileSync(path.join(root,'gas',f),'utf8')+(f===files[0]?'\n// unrelated live addition\n':''));assert.equal(fs.readFileSync(path.join(dir,'REMOTE_ONLY.js'),'utf8'),'// keep production module\n');const first=files.map(f=>fs.readFileSync(path.join(dir,f),'utf8'));run(dir);assert.deepEqual(files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')),first);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('unexpected live edits abort the entire overlay before any file is written',()=>{const dir=fixture();try{fs.writeFileSync(path.join(dir,files[3]),'// incompatible live version\n');const before=files.map(f=>fs.readFileSync(path.join(dir,f),'utf8'));assert.throws(()=>run(dir),/Live source drift/);assert.deepEqual(files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')),before);assert.equal(fs.existsSync(path.join(dir,'94_TfgTourBooking.js')),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('upgrade from deployed v186 preserves live-only router code and can be applied twice',()=>{
 const dir=fixture(),deployed='81993fb927b368bae8c496b7616364b27d2c27a4';
 try{
  for(const file of files)fs.writeFileSync(path.join(dir,file),execFileSync('git',['show',deployed+':gas/'+file],{cwd:root}));
  fs.writeFileSync(path.join(dir,'94_TfgTourBooking.js'),fs.readFileSync(path.join(root,'gas/94_TfgTourBooking.gs')));
  fs.appendFileSync(path.join(dir,'99_Main.js'),'\nfunction liveOnlyFeature_() { return "keep"; }\n');
  run(dir);
  assert.match(fs.readFileSync(path.join(dir,'99_Main.js'),'utf8'),/function liveOnlyFeature_/);
  for(const file of files.filter(f=>f!=='99_Main.js'))assert.equal(fs.readFileSync(path.join(dir,file),'utf8'),fs.readFileSync(path.join(root,'gas',file),'utf8'));
  assert.equal(fs.readFileSync(path.join(dir,'95_TfgTourPerformance.js'),'utf8'),fs.readFileSync(path.join(root,'gas/95_TfgTourPerformance.gs'),'utf8'));
  const after=files.map(file=>fs.readFileSync(path.join(dir,file),'utf8'));run(dir);assert.deepEqual(files.map(file=>fs.readFileSync(path.join(dir,file),'utf8')),after);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a conflicting pre-existing performance module aborts without changing live files',()=>{
 const dir=fixture();try{fs.writeFileSync(path.join(dir,'95_TfgTourPerformance.js'),'// unknown production module\n');const before=files.map(f=>fs.readFileSync(path.join(dir,f),'utf8'));assert.throws(()=>run(dir),/95 module already exists/);assert.deepEqual(files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')),before);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
