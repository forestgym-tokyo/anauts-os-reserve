import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Preserve all live-only modules and edits. Apply only our hunks, failing closed on drift.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='410406868548308d7e9745cd9f45689aa296f967';
const live=path.resolve(process.argv[2]||'.gas-live');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tfg-tour-overlay-'));
const files=['21_Service.gs.js','28_Availability.gs.js','29_Reservation.gs.js','40_ReservationMail.gs.js','60_StoreAwareAssignment.js'];
function occurrence(text,part){let n=0,pos=0;while((pos=text.indexOf(part,pos))>=0){n++;pos+=Math.max(1,part.length);}return n;}
function applyHunks(source,patch,label){
 const hunks=patch.split(/^@@[^\n]*\n/m).slice(1);
 for(const hunk of hunks){let before='',after='';for(const line of hunk.split('\n')){if(line.startsWith(' ')||line.startsWith('-'))before+=line.slice(1)+'\n';if(line.startsWith(' ')||line.startsWith('+'))after+=line.slice(1)+'\n';}
  if(before===after)continue;
  const count=occurrence(source,before);
  if(count===1)source=source.replace(before,()=>after);
  else if(count===0&&occurrence(source,after)===1)continue;
  else throw Error('Live source drift or ambiguous patch: '+label+'; refusing to overwrite live code');
 }
 return source;
}
try{
 const pending=[];
 for(const file of files){const target=path.join(live,file);if(!fs.existsSync(target))throw Error('Required live file missing: '+file);
  const original=execFileSync('git',['show',base+':gas/'+file],{cwd:root,encoding:'utf8'});
  const desired=fs.readFileSync(path.join(root,'gas',file),'utf8');
  fs.writeFileSync(path.join(temp,'before'),original);fs.writeFileSync(path.join(temp,'after'),desired);
  const diff=spawnSync('git',['diff','--no-index','--no-color','--unified=40','--',path.join(temp,'before'),path.join(temp,'after')],{encoding:'utf8'});
  if(diff.status!==0&&diff.status!==1)throw Error(diff.stderr);
  pending.push([target,applyHunks(fs.readFileSync(target,'utf8'),diff.stdout,file)]);
 }
 const moduleName='94_TfgTourBooking.js',moduleSource=fs.readFileSync(path.join(root,'gas','94_TfgTourBooking.gs'),'utf8');
 const modulePath=path.join(live,moduleName);
 if(fs.existsSync(modulePath)&&fs.readFileSync(modulePath,'utf8')!==moduleSource)throw Error('94 module already exists with different content');
 // Prevent duplicate GAS global declarations from alternate source naming.
 for(const name of fs.readdirSync(live)){
  if(name!==moduleName&&/\.(js|gs)$/.test(name)&&fs.readFileSync(path.join(live,name),'utf8').includes('function validateTourGuests_('))throw Error('Duplicate TOUR module: '+name);
  if(name!=='60_StoreAwareAssignment.js'&&/\.(js|gs)$/.test(name)&&fs.readFileSync(path.join(live,name),'utf8').includes('function getTourFirstCandidateStart_('))throw Error('Duplicate assignment module: '+name);
 }
 pending.push([modulePath,moduleSource]);
 for(const [target,source] of pending)fs.writeFileSync(target,source);
 console.log(JSON.stringify({status:'patched',files:pending.map(([file])=>path.basename(file))}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
