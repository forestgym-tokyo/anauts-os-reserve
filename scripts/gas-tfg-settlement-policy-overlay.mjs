import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.resolve(process.argv[2]||'.gas-live');
const baseline='10283e8';
const source='gas/91_TfgSettlementApproval.gs';
const matches=fs.readdirSync(folder).filter(name=>/^91_TfgSettlementApproval(?:\.gs)?\.(js|gs)$/.test(name));
if(matches.length!==1)throw new Error('Expected exactly one existing settlement module');
const filename=matches[0];
const result=spawnSync('git',['diff',baseline,'--',source],{cwd:root,encoding:'utf8'});
if(result.status!==0||!result.stdout.includes('finalMonthBilling'))throw new Error('Reviewed settlement patch is unavailable');
const patch=result.stdout.replaceAll('a/'+source,'a/'+filename).replaceAll('b/'+source,'b/'+filename);
const alreadyApplied=spawnSync('git',['apply','--reverse','--check','--ignore-space-change','-'],{cwd:folder,input:patch,encoding:'utf8'});
if(alreadyApplied.status===0){
 console.log('Reviewed settlement policy already present in '+filename);
 process.exit(0);
}
for(const check of [true,false]){
 const applied=spawnSync('git',['apply',...(check?['--check']:[]),'--ignore-space-change','-'],{cwd:folder,input:patch,encoding:'utf8'});
 if(applied.status!==0)throw new Error('Live settlement source differs from the reviewed patch; no deployment allowed');
}
console.log('Applied reviewed settlement policy patch to '+filename);
