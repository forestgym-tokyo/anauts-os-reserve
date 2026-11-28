import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {addTfgMemberNumberLibrary,prepareTfgNumberLockRelease} from './tfg-membership-lock-release.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const phase=process.argv[2]||'preflight';
const deploymentId='AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0';
const permitted=new Set(['21_Service.gs.js','28_Availability.gs.js','29_Reservation.gs.js','40_ReservationMail.gs.js','46_TourQuestionnairePrint.js','46_1_TourQuestionnairePrintFast.js','60_StoreAwareAssignment.js','94_TfgTourBooking.js','95_TfgTourPerformance.js','96_TourEnrollmentCompletion.js','96_CampaignCalculationRules.js','99_Main.js']);
const revision=String(spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout||'').trim();
let scratch,authFile,project,oldVersion,newVersion,backupVersion,baselineProject,webRollout,stagedAdmin,wroteAdmin=false;
function notice(message){console.log('::notice title=TFG GAS release::'+message);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,message+'\n\n');}
function fail(message){throw new Error(message);}
function cliError(text){
 if(/invalid_grant|expired or revoked/i.test(text))return 'Google refresh token rejected';
 if(/invalid_client|unauthorized_client/i.test(text))return 'Google OAuth client rejected';
 if(/permission|PERMISSION_DENIED|access_denied/i.test(text))return 'Google account lacks the required operation permission';
 if(/SERVICE_DISABLED|has not enabled|has not been used/i.test(text))return 'Required Google API is disabled';
 if(/live source drift|ambiguous patch/i.test(text))return 'Live source differs from the reviewed patch';
 if(/quota|too many.*versions|(?:max|maximum|limit)[^\n]{0,100}versions|versions[^\n]{0,100}(?:limit|maximum)|RESOURCE_EXHAUSTED/i.test(text))return 'Google version or request quota exceeded';
 return 'operation failed; no credential details logged';
}
function clasp(args,projectFile=project){
 const result=spawnSync('npx',['--yes','@google/clasp@3.4.1','--json','--auth',authFile,'--project',projectFile,...args],{cwd:path.dirname(projectFile),encoding:'utf8',maxBuffer:32*1024*1024,timeout:180000});
 if(result.status!==0)fail(args[0]+': '+cliError(String(result.stdout||'')+'\n'+String(result.stderr||'')));
 return String(result.stdout||'').trim();
}
function json(text,label){try{return JSON.parse(text);}catch{fail('Invalid structured response for '+label);}}
function projectFile(folder,scriptId){fs.mkdirSync(path.join(folder,'gas'),{recursive:true,mode:0o700});const file=path.join(folder,'.clasp.json');fs.writeFileSync(file,JSON.stringify({scriptId,rootDir:'gas'}),{mode:0o600});return file;}
function hashes(folder){const output={};function visit(directory,prefix=''){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const relative=path.posix.join(prefix,entry.name),file=path.join(directory,entry.name);if(entry.isDirectory())visit(file,relative);else if(entry.isFile())output[relative]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');else fail('Unexpected non-regular source file');}}visit(folder);return output;}
function equal(a,b){return JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());}
function currentDeployment(){const entries=json(clasp(['list-deployments']),'deployments');if(!Array.isArray(entries))fail('Unexpected deployment list');const current=entries.find(item=>item.deploymentId===deploymentId);if(!current||!Number.isInteger(current.versionNumber)||current.versionNumber<1)fail('Expected existing versioned TOUR deployment was not found');return current;}
async function verifyServices(){
 for(let attempt=0;attempt<4;attempt++){
  const url=new URL('https://script.google.com/macros/s/'+deploymentId+'/exec');url.searchParams.set('action','getServices');url.searchParams.set('_',String(Date.now()));
  try{const response=await fetch(url,{signal:AbortSignal.timeout(60000),redirect:'follow'});const body=await response.json();const tour=Array.isArray(body.data)&&body.data.find(row=>row.service_code==='TOUR');if(response.ok&&body.ok&&tour&&Number(tour.booking_min_hours)===1&&Number(tour.duration)===60&&Number(tour.slot_interval_minutes)===30)return;}catch{}
  if(attempt<3)await new Promise(resolve=>setTimeout(resolve,3000));
 }
 fail('Published TOUR service configuration failed verification');
}
async function verifyDraftRoutes(){
 const base='https://script.google.com/macros/s/'+deploymentId+'/exec';
 const tests=[
  [base+'?action=getTourEnrollmentCalculation',{}],
  [base,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'createTourEnrollmentCalculationDraft'})}]
 ];
 for(let attempt=0;attempt<5;attempt++){
  try{
   const results=await Promise.all(tests.map(async ([url,init])=>{
    const response=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    return response.ok&&data.ok===false&&data.message==='ログインが必要です。';
   }));
   if(results.every(Boolean))return;
  }catch{}
  if(attempt<4)await new Promise(resolve=>setTimeout(resolve,3000));
 }
 fail('Enrollment draft routes did not enforce existing staff authentication');
}
try{
 if(!['preflight','deploy'].includes(phase))fail('Phase must be preflight or deploy');
 let config;try{config=JSON.parse(process.env.CLASP_JSON||'');JSON.parse(process.env.CLASPRC_JSON||'');}catch{fail('Existing clasp credential configuration is missing or malformed');}
 if(typeof config.scriptId!=='string'||!config.scriptId)fail('Existing clasp project identifier is missing');
 scratch=fs.mkdtempSync(path.join(os.tmpdir(),'tfg-tour-release-'));authFile=path.join(scratch,'.clasprc.json');fs.writeFileSync(authFile,process.env.CLASPRC_JSON,{mode:0o600});
 const baseline=path.join(scratch,'baseline'),stage=path.join(scratch,'stage');project=baselineProject=projectFile(baseline,config.scriptId);
 const current=currentDeployment();oldVersion=current.versionNumber;notice('phase='+phase+'; target_verified=true; previous_version='+oldVersion+'; revision='+revision);
 clasp(['pull']);const baselineSource=path.join(baseline,'gas'),before=hashes(baselineSource);
 project=projectFile(stage,config.scriptId);const stageSource=path.join(stage,'gas');fs.cpSync(baselineSource,stageSource,{recursive:true});
 const overlay=spawnSync(process.execPath,[path.join(root,'scripts/gas-tfg-tour-overlay.mjs'),stageSource],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  if(overlay.status!==0){const detail=String(overlay.stderr||'').match(/Error: (Live source drift or ambiguous patch: [^;\n]+|Required live file missing: [^\n]+|Duplicate[^\n]+|9[45] module[^\n]+)/);fail('Staging overlay failed: '+(detail?detail[1]:'review required'));}
 const after=hashes(stageSource),changes=Object.keys(after).filter(file=>before[file]!==after[file]);
 if(Object.keys(before).some(file=>!Object.hasOwn(after,file)))fail('Staging removed an existing GAS file');
 if(changes.some(file=>!permitted.has(file)))fail('Staging changed a file outside the TOUR release scope');
 if(before['appsscript.json']!==after['appsscript.json'])fail('Staging changed the existing manifest');
 const scripts=fs.readdirSync(stageSource).filter(file=>/\.(js|gs)$/.test(file)).sort().map(file=>fs.readFileSync(path.join(stageSource,file),'utf8'));
 try{new vm.Script(scripts.join('\n;\n'));}catch{fail('Combined staged GAS source has a syntax or declaration conflict');}
 webRollout=await prepareTfgNumberLockRelease(authFile,config.scriptId,oldVersion,notice);
 notice('preflight_passed=true; retained_files='+Object.keys(before).length+'; changed_files='+changes.join(','));
 if(phase==='deploy'){
  function recheckAdmin(name){
   const folder=path.join(scratch,name);
   const recheck=projectFile(folder,config.scriptId);clasp(['pull'],recheck);
   if(!equal(before,hashes(path.join(folder,'gas'))))fail('Live source changed during preflight; nothing pushed');
   if(currentDeployment().versionNumber!==oldVersion)fail('Existing deployment changed during preflight; nothing pushed');
  }
  recheckAdmin('before-web-lock');
  const {library,drainStart}=await webRollout.activateWebLock();
  const manifestPath=path.join(stageSource,'appsscript.json');
  const manifest=addTfgMemberNumberLibrary(JSON.parse(fs.readFileSync(manifestPath,'utf8')),library);
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  stagedAdmin=hashes(stageSource);
  // Earlier WEB executions may still be running without the library lock.
  const drainEnd=drainStart+360000;
  if(drainEnd>Date.now())notice('waiting_for_previous_web_executions=true; seconds='+Math.ceil((drainEnd-Date.now())/1000));
  while(drainEnd>Date.now())await new Promise(resolve=>setTimeout(resolve,Math.min(60000,drainEnd-Date.now())));
  await webRollout.verify();
  recheckAdmin('before-admin-drafts');
  backupVersion=oldVersion;
  notice('native_backup_reused=true; verified_identical_published_version='+backupVersion);
  wroteAdmin=true;
  clasp(['push','--force']);notice('source_push_completed=true');
  newVersion=json(clasp(['create-version','TFG enrollment calculation drafts '+revision.slice(0,7)]),'new deployment version').versionNumber;
  if(!Number.isInteger(newVersion))fail('New admin version could not be confirmed');
  const deployed=json(clasp(['update-deployment',deploymentId,'--versionNumber',String(newVersion),'-d','TFG tour enrollment calculation draft '+revision.slice(0,7)]),'deployment');
  if(deployed.deploymentId!==deploymentId||deployed.versionNumber!==newVersion)fail('Deployment update could not be confirmed');
  notice('deployment_updated=true; deployed_version='+newVersion+'; rollback_version='+oldVersion);
  await verifyDraftRoutes();notice('draft_routes_require_staff_login=true');
  await verifyServices();notice('published_service_check_passed=true; duration=60; interval=30; minimum_hours=1; deployed_version='+newVersion);
 }
}catch(error){
 console.error('::error title=TFG GAS release::'+String(error.message));
 let adminIsSafe=true;
 if(wroteAdmin&&project&&oldVersion){
  try{
   const current=currentDeployment().versionNumber;
   if(current===newVersion){
    clasp(['update-deployment',deploymentId,'--versionNumber',String(oldVersion),'-d','Rollback after TFG tour verification failure']);
    if(currentDeployment().versionNumber!==oldVersion)fail('Could not confirm old admin deployment');
    notice('rollback_completed=true; restored_version='+oldVersion);
   }else if(current!==oldVersion)fail('Admin deployment changed outside this release');
  }catch{adminIsSafe=false;console.error('::error title=TFG GAS rollback::Admin deployment rollback could not be confirmed');}
  if(adminIsSafe){
   try{
    const config=JSON.parse(process.env.CLASP_JSON);
    const folder=path.join(scratch,'check-failed-admin-source');
    const check=projectFile(folder,config.scriptId);clasp(['pull'],check);
    if(equal(stagedAdmin,hashes(path.join(folder,'gas')))){
     clasp(['push','--force'],baselineProject);notice('admin_source_restored=true');
    }
   }catch{console.error('::error title=TFG GAS rollback::Admin source restoration could not be confirmed');}
  }
 }
 if(webRollout&&adminIsSafe){
  try{await webRollout.rollback();}catch{console.error('::error title=TFG GAS rollback::WEB deployment rollback could not be confirmed');}
 }
 process.exitCode=1;
}finally{if(scratch)fs.rmSync(scratch,{recursive:true,force:true});}
