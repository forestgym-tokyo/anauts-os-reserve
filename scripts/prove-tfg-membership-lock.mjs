import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const root = 'https://script.googleapis.com/v1/projects';
export const lockSource = `
/** Serializes assignments to the membership master. */
function withMemberNumberLock(work) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}
`.trim();

export async function connectAppsScript(authFile) {
  const credentials = JSON.parse(readFileSync(authFile, 'utf8')).tokens.default;
  const authorization = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!authorization.ok) throw new Error('Google token refresh returned HTTP ' + authorization.status);
  const {access_token: accessToken} = await authorization.json();
  if (!accessToken) throw new Error('Google did not return an access token');
  return async function api(path, label, method = 'GET', body) {
    const url = path.startsWith('https://') ? path : root + path;
    const response = await fetch(url, {
      method,
      headers: {Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(label + ' returned HTTP ' + response.status);
    return response.status === 204 ? null : response.json();
  };
}

export function scriptFiles(manifest, source) {
  return {files: [
    {name: 'appsscript', type: 'JSON', source: JSON.stringify({timeZone:'Asia/Tokyo',runtimeVersion:'V8', ...manifest})},
    {name: 'Code', type: 'SERVER_JS', source}
  ]};
}

export function membershipLibrary(scriptId, version) {
  return {userSymbol: 'TfgMembershipNumbers', libraryId: scriptId, version: String(version), developmentMode: false};
}

export async function proveMembershipLibrary(authFile) {
  const api = await connectAppsScript(authFile);
  const projects = [];
  const deployments = [];
  const nonce = randomUUID();
  async function create(suffix, manifest, source) {
    const {scriptId} = await api('', 'create isolated script', 'POST', {title: 'TFG採番の確認 ' + suffix});
    projects.push(scriptId);
    await api('/' + scriptId + '/content', 'set isolated script content', 'PUT', scriptFiles(manifest, source));
    const version = await api('/' + scriptId + '/versions', 'version isolated script', 'POST', {description: 'Verify shared lock'});
    return {scriptId, version: version.versionNumber};
  }
  try {
    const library = await create('ライブラリ', {}, lockSource);
    async function createProbe(n) {
      const probe = await create('検証用' + n, {
        webapp:{executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS'},
        dependencies:{libraries:[membershipLibrary(library.scriptId, library.version)]}
      }, `
function doGet(e) {
  if (e.parameter.key !== ${JSON.stringify(nonce)}) return ContentService.createTextOutput("ready");
  const work = () => {
    const start = Date.now();
    Utilities.sleep(2100);
    return {start, end: Date.now()};
  };
  const sample = e.parameter.control === "1" ? work() : TfgMembershipNumbers.withMemberNumberLock(work);
  return ContentService.createTextOutput(JSON.stringify(sample)).setMimeType(ContentService.MimeType.JSON);
}`);
      const deployment = await api('/' + probe.scriptId + '/deployments', 'deploy isolated script', 'POST', {
        versionNumber: probe.version, manifestFileName: 'appsscript', description: 'Shared member number lock verification'
      });
      deployments.push({scriptId: probe.scriptId, deploymentId: deployment.deploymentId});
      return 'https://script.google.com/macros/s/' + deployment.deploymentId + '/exec';
    }
    const endpoints = await Promise.all([createProbe(1), createProbe(2)]);
    async function measure(base, control) {
      const url = new URL(base);
      url.searchParams.set('key', nonce);
      if (control) url.searchParams.set('control', '1');
      const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('Isolated web app returned HTTP ' + response.status);
      const text = await response.text();
      let sample;
      try { sample = JSON.parse(text); }
      catch { throw new Error('Isolated web app did not execute the library proof'+(text.includes('TfgMembershipNumbers') ? ' (library)' : '')); }
      if (!Number.isFinite(sample.start) || !Number.isFinite(sample.end)) throw new Error('Isolated web app returned an invalid sample');
      return sample;
    }
    const overlap = ([a,b]) => a.start < b.end && b.start < a.end;
    const control = await Promise.all(endpoints.map(endpoint => measure(endpoint, true)));
    if (!overlap(control)) throw new Error('Isolated web applications were not concurrent without a lock');
    const locked = await Promise.all(endpoints.map(endpoint => measure(endpoint, false)));
    if (overlap(locked)) throw new Error('The two independent projects did not serialize the shared lock');
    return {controlOverlapped: true, sharedLockSerialized: true};
  } finally {
    let cleaned = 0;
    for (const {scriptId, deploymentId} of deployments) {
      try { await api('/' + scriptId + '/deployments/' + deploymentId, 'remove isolated deployment', 'DELETE'); }
      catch { /* The isolated projects only return synthetic data. */ }
    }
    for (const scriptId of projects) {
      try {
        await api('https://www.googleapis.com/drive/v3/files/' + scriptId, 'trash isolated script', 'PATCH', {trashed: true});
        cleaned++;
      } catch {}
    }
    console.log('::notice title=TFG GAS release::isolated_script_cleanup=' + cleaned + '/' + projects.length);
  }
}
