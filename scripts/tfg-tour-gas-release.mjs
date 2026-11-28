import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectAppsScript,lockSource} from './prove-tfg-membership-lock.mjs';

if (process.argv[2] !== 'preflight') throw new Error('Only isolated proof workspace cleanup is supported');
const authDir = mkdtempSync(path.join(os.tmpdir(), 'tfg-isolated-cleanup-'));
try {
  const authFile = path.join(authDir,'auth.json');
  writeFileSync(authFile,process.env.CLASPRC_JSON,{mode:0o600});
  const api = await connectAppsScript(authFile);
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q',"trashed = false and mimeType = 'application/vnd.google-apps.script' and name contains 'TFG採番の確認 '");
  url.searchParams.set('fields','files(id,name,createdTime,capabilities(canTrash))');
  const matching = (await api(url.href,'find isolated proof projects')).files.filter(file =>
    ['TFG採番の確認 ライブラリ','TFG採番の確認 検証用1','TFG採番の確認 検証用2'].includes(file.name) &&
    file.createdTime >= '2026-11-28T05:15:00Z' && file.createdTime <= '2026-11-28T05:20:00Z');
  let confirmed = 0, active = 0, trashed = 0;
  const trashErrors = [];
  for (const file of matching) {
    const content = await api('/'+file.id+'/content','verify isolated proof source');
    const code = content.files.find(part => part.name === 'Code' && part.type === 'SERVER_JS')?.source || '';
    if (!code.includes('const sample = e.parameter.control === "1" ? work() : TfgMembershipNumbers.withMemberNumberLock(work)') &&
        code.trim() !== lockSource) continue;
    confirmed++;
    const deployments = (await api('/'+file.id+'/deployments','inspect isolated proof deployments')).deployments || [];
    for (const deployment of deployments.filter(dep => (dep.entryPoints || []).some(entry => entry.entryPointType === 'WEB_APP') && dep.deploymentConfig.versionNumber)) {
      if (deployment.deploymentConfig.description !== 'Shared member number lock verification') continue;
      await api('/'+file.id+'/deployments/'+deployment.deploymentId,'remove isolated proof deployment','DELETE');
      active++;
    }
    try {
      await api('https://www.googleapis.com/drive/v3/files/'+file.id,'trash isolated proof project','PATCH',{trashed:true});
      trashed++;
    } catch(error) {
      trashErrors.push(String(error.message).slice(0,100));
    }
  }
  console.log('::notice title=TFG isolated test cleanup::'+JSON.stringify({confirmed,activeDeploymentsRemoved:active,trashed,trashErrors}));
} finally {
  rmSync(authDir,{recursive:true,force:true});
}
