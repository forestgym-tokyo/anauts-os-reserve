import {readFileSync} from 'node:fs';

const legacyDeployment = 'AKfycbynTLgYkJCjz2cyE9wgNhRF5yyBlccfsGt-3lFm6sHgrrSiASeZeEzoZzSzkYA3u8mzoA';
const master = '1kLK6Dbe05Uqd0pxnoKX8MbHpQH9AgDnVygwzDPzyXvw';
const scriptsApi = 'https://script.googleapis.com/v1/projects/';
const priorDraftTool = '1kLf1rmgwifsSm0eYElvxVwv_O59d2Nv874y2lGGbGW37xWPy2SivYCLV';

export async function inspectTfgMembershipWriters(authFile, adminProject) {
  const credentials = JSON.parse(readFileSync(authFile, 'utf8')).tokens.default;
  const tokenResult = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!tokenResult.ok) return {tokenStatus: tokenResult.status};
  const token = (await tokenResult.json()).access_token;
  if (!token) return {tokenStatus: 'missing'};
  async function read(url) {
    try {
      const response = await fetch(url, {headers: {Authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(15000)});
      return {status: response.status, data: response.ok ? await response.json() : null};
    } catch {
      return {status: 0, data: null};
    }
  }

  const candidateIds = new Set([adminProject, priorDraftTool]);
  let pageToken;
  let driveStatus;
  let scriptsListed = 0;
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', "trashed = false and mimeType = 'application/vnd.google-apps.script'");
    url.searchParams.set('fields', 'nextPageToken,files(id,name)');
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const {status, data} = await read(url);
    driveStatus = status;
    scriptsListed += data?.files?.length || 0;
    for (const file of data?.files || []) {
      if (/入会|会員|申込|申請|member|enroll|tfg|forest|anauts/i.test(file.name)) candidateIds.add(file.id);
    }
    pageToken = data?.nextPageToken;
  } while (pageToken);

  const candidates = Array.from(candidateIds);
  const statuses = {};
  let match;
  let offset = 0;
  await Promise.all(Array.from({length: Math.min(candidates.length, 5)}, async () => {
    while (!match && offset < candidates.length) {
      const project = candidates[offset++];
      const {status, data} = await read(scriptsApi + encodeURIComponent(project) + '/deployments/' + legacyDeployment);
      statuses[status] = (statuses[status] || 0) + 1;
      if (data?.deploymentId === legacyDeployment) match = {project, version: data.deploymentConfig?.versionNumber};
    }
  }));

  const summary = {driveStatus, scriptsListed, checkedProjects: offset, statuses, legacyDeploymentFound: Boolean(match)};
  if (!match) return summary;
  summary.sameProject = adminProject === match.project;
  summary.deployedVersion = match.version;
  const projectUrl = scriptsApi + encodeURIComponent(match.project);
  const [deployed, head, owner] = await Promise.all([
    read(projectUrl + '/content?versionNumber=' + encodeURIComponent(match.version)),
    read(projectUrl + '/content'),
    read('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(match.project) + '?fields=capabilities(canEdit)')
  ]);
  const {status, data} = deployed;
  summary.sourceStatus = status;
  summary.canEdit = owner.data?.capabilities?.canEdit;
  if (!data?.files) return summary;
  function contentHash(files) {
    return files.map(({type,name,source}) => JSON.stringify({type,name,source})).sort().join('\n');
  }
  summary.headMatchesDeployment = Boolean(head.data?.files && contentHash(head.data.files) === contentHash(data.files));
  const manifest = JSON.parse(data.files.find(file => file.type === 'JSON' && file.name === 'appsscript').source);
  summary.runtimeVersion = manifest.runtimeVersion || 'unspecified';
  summary.executeAs = manifest.webapp?.executeAs;
  summary.otherLibraries = (manifest.dependencies?.libraries || []).length;
  const files = data.files.filter(file => file.type === 'SERVER_JS').map(file => String(file.source || ''));
  const source = files.join('\n');
  const sections = [];
  for (const file of files) {
    const functions = Array.from(file.matchAll(/^function\s+([$_A-Za-z][$_A-Za-z0-9]{0,59})\s*\(/gm));
    for (let i = 0; i < functions.length; i++) {
      const text = file.slice(functions[i].index, functions[i + 1]?.index);
      const name = functions[i][1];
      const reads = /getSpreadsheet|getSheetByName|getDataRange|\.getValues\(|\.openById\(/.test(text);
      const writes = /\.setValues?\s*\(|\.appendRow\s*\(/.test(text);
      if (name === 'doPost' || reads || writes) sections.push({
        name, reads, writes, masterRef: text.includes(master) || /['"]master['"]/i.test(text),
        mailOrWebhook: /(?:GmailApp|MailApp)\.|UrlFetchApp\.fetch/.test(text)
      });
    }
  }
  return {
    ...summary, sections,
    hasMasterId: source.includes(master),
    hasMasterSheetName: /['"]master['"]/i.test(source),
    hasMemberNumberFields: /\bmemberNo\b|会員番号/.test(source),
    hasMasterWrites: files.some(file => (file.includes(master) || /['"]master['"]/i.test(file)) && /\.setValues?\s*\(|\.appendRow\s*\(/.test(file)),
    hasScriptLock: source.includes('getScriptLock('),
    hasWorkbookLock: source.includes('getDocumentLock(')
  };
}
