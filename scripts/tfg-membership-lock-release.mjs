import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const legacyDeployment = 'AKfycbynTLgYkJCjz2cyE9wgNhRF5yyBlccfsGt-3lFm6sHgrrSiASeZeEzoZzSzkYA3u8mzoA';
const librarySymbol = 'TfgMembershipNumbers';
const legacyWriter = /^function\s+registerToMaster_\s*\(/gm;
const lockSource = `
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

async function connect(authFile) {
  const credentials = JSON.parse(readFileSync(authFile, 'utf8')).tokens.default;
  const result = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: credentials.client_id,
      client_secret: credentials.client_secret, refresh_token: credentials.refresh_token
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!result.ok) throw new Error('Google token refresh returned HTTP ' + result.status);
  const {access_token: token} = await result.json();
  if (!token) throw new Error('Google returned no access token');
  const appsScript = 'https://script.googleapis.com/v1/projects';
  const drive = 'https://www.googleapis.com/drive/v3/files';
  return async function request(base, path, label, method = 'GET', body, missingOk = false) {
    const response = await fetch((base === 'script' ? appsScript : drive) + path, {
      method, headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    if (missingOk && response.status === 404) return null;
    if (!response.ok) throw new Error(label + ' returned HTTP ' + response.status);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
}

const fingerprint = files => files.map(({name,type,source}) =>
  JSON.stringify([name,type,type === 'JSON' ? JSON.parse(source) : source])).sort().join('\n');
const sameLibrary = (left, right) => left.libraryId === right.libraryId &&
  Number(left.version) === Number(right.version) && !left.developmentMode && !right.developmentMode;
const findLibrary = files => JSON.parse(files.find(file => file.type === 'JSON' && file.name === 'appsscript').source)
  .dependencies?.libraries?.find(library => library.userSymbol === librarySymbol);

export function addTfgMemberNumberLibrary(manifest, library) {
  const deps = manifest.dependencies || {};
  const libraries = deps.libraries || [];
  const present = libraries.find(item => item.userSymbol === librarySymbol);
  if (present) {
    if (!sameLibrary(present, library)) throw new Error('Member number library binding differs');
    return manifest;
  }
  return {...manifest, dependencies: {...deps, libraries: [...libraries, library]}};
}

function stageLegacyWeb(files, library) {
  const writers = files.filter(file => file.type === 'SERVER_JS' && Array.from(file.source.matchAll(legacyWriter)).length);
  if (writers.length !== 1 || Array.from(writers[0].source.matchAll(legacyWriter)).length !== 1 ||
      writers[0].source.includes('registerToMasterWithCurrentRules_')) throw new Error('Unexpected WEB master writer source');
  const staged = files.map(({name,type,source}) => {
    if (type === 'JSON' && name === 'appsscript') {
      source = JSON.stringify(addTfgMemberNumberLibrary(JSON.parse(source), library), null, 2);
    }
    if (name === writers[0].name && type === 'SERVER_JS') {
      source = source.replace(legacyWriter, 'function registerToMasterWithCurrentRules_(') + `
 
function registerToMaster_(...args) {
  return TfgMembershipNumbers.withMemberNumberLock(() => {
    try {
      return registerToMasterWithCurrentRules_(...args);
    } finally {
      SpreadsheetApp.flush();
    }
  });
}
`;
    }
    return {name,type,source};
  });
  new vm.Script(staged.filter(file => file.type === 'SERVER_JS').map(file => file.source).join('\n;\n'));
  return staged;
}

export async function prepareTfgNumberLockRelease(authFile, adminProject, adminVersion, notice) {
  const request = await connect(authFile);
  const script = (...args) => request('script', ...args);
  const drive = (...args) => request('drive', ...args);
  const candidates = [];
  let token;
  do {
    const params = new URLSearchParams({
      q: "trashed = false and mimeType = 'application/vnd.google-apps.script'",
      fields: 'nextPageToken,files(id,name)', pageSize: '100'
    });
    if (token) params.set('pageToken', token);
    const page = await drive('?' + params, 'list enrollment scripts');
    candidates.push(...(page?.files || []).filter(file => /入会|会員|申込|申請|member|enroll|tfg|forest|anauts/i.test(file.name)));
    token = page?.nextPageToken;
  } while (token);
  const legacyMatch = (await Promise.all(candidates.map(async file => {
    const deployment = await script('/' + file.id + '/deployments/' + legacyDeployment, 'verify WEB deployment', 'GET', undefined, true);
    return deployment?.deploymentId === legacyDeployment ? {id: file.id, deployment} : null;
  }))).filter(Boolean);
  if (legacyMatch.length !== 1 || legacyMatch[0].id === adminProject) throw new Error('Expected existing separate WEB signup deployment was not found');
  const {id, deployment} = legacyMatch[0];
  const base = '/' + id;
  const deploymentPath = base + '/deployments/' + legacyDeployment;
  const oldVersion = deployment.deploymentConfig.versionNumber;
  async function projectOwner(projectId) {
    const scriptProject = await script('/' + projectId, 'read Apps Script project metadata');
    const fileId = scriptProject.parentId || projectId;
    const file = await drive('/' + fileId + '?fields=owners(me),capabilities(canEdit)', 'verify project container ownership');
    return file.owners?.some(owner => owner.me);
  }
  const [legacy, legacyPublished, admin, adminPublished, legacyOwner, adminOwner] = await Promise.all([
    script(base + '/content', 'read WEB source'),
    script(base + '/content?versionNumber=' + oldVersion, 'read deployed WEB source'),
    script('/' + adminProject + '/content', 'read admin source'),
    script('/' + adminProject + '/content?versionNumber=' + adminVersion, 'read deployed admin source'),
    projectOwner(id),
    projectOwner(adminProject)
  ]);
  notice('common_library_owner_verified=' + Boolean(legacyOwner && adminOwner));
  if (!legacyOwner || !adminOwner) {
    throw new Error('Both enrollment projects must be able to use the new owner-private library');
  }
  if (fingerprint(legacy.files) !== fingerprint(legacyPublished.files)) throw new Error('WEB project has unpublished source changes');
  if (fingerprint(admin.files) !== fingerprint(adminPublished.files)) throw new Error('Admin project has unpublished source changes');
  const versions = [];
  let pageToken;
  do {
    const params = new URLSearchParams({pageSize: '50'});
    if (pageToken) params.set('pageToken', pageToken);
    const page = await script('/' + adminProject + '/versions?' + params, 'inspect admin version capacity');
    versions.push(...(page.versions || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  notice('admin_version_count=' + versions.length + '; rollback_version=' + adminVersion);
  if (versions.length >= 200) {
    const active = (await script('/' + adminProject + '/deployments', 'inspect active admin versions')).deployments || [];
    const deployed = new Set(active.map(item => item.deploymentConfig.versionNumber));
    const inventory = versions.sort((a, b) => a.versionNumber - b.versionNumber);
    const pairs = inventory.flatMap((version, index) => {
      if (index === 0 || deployed.has(version.versionNumber) || version.versionNumber >= adminVersion ||
          !/\b(before|backup)\b/i.test(version.description || '')) return [];
      return [[version.versionNumber, inventory[index - 1].versionNumber]];
    }).reverse().slice(0, 6);
    for (const [candidate, retained] of pairs) {
      const snapshots = await Promise.all([candidate, retained].map(number =>
        script('/' + adminProject + '/content?versionNumber=' + number, 'verify identical historical versions')));
      if (fingerprint(snapshots[0].files) === fingerprint(snapshots[1].files)) {
        notice('unused_duplicate_version=' + candidate + '; retained_identical_version=' + retained);
      }
    }
    throw new Error('Existing admin Apps Script reached the 200-version limit before any change');
  }
  const existing = findLibrary(legacy.files);
  const adminLibrary = findLibrary(admin.files);
  if (adminLibrary && (!existing || !sameLibrary(adminLibrary, existing))) throw new Error('Published enrollment library bindings differ');
  const placeholder = {userSymbol: librarySymbol, libraryId: 'preflight', version: '1', developmentMode: false};
  if (existing) {
    const library = await script('/' + existing.libraryId + '/content?versionNumber=' + existing.version, 'verify existing shared lock');
    const files = library.files.filter(file => file.type === 'SERVER_JS');
    if (existing.developmentMode || files.length !== 1 || files[0].source.trim() !== lockSource ||
        !legacy.files.some(file => file.source.includes('function registerToMasterWithCurrentRules_(') &&
          file.source.includes('TfgMembershipNumbers.withMemberNumberLock('))) {
      throw new Error('The existing WEB shared lock could not be verified');
    }
  } else {
    const preflight = stageLegacyWeb(legacy.files, placeholder);
    const changed = preflight.filter((file,index) => file.source !== legacy.files[index].source);
    if (changed.length !== 2 || !changed.some(file => file.type === 'JSON' && file.name === 'appsscript')) throw new Error('Unexpected WEB scope');
  }
  notice('web_signup_preflight_passed=true; current_version=' + oldVersion + '; edited_files=' + (existing ? 0 : 2));

  let version, stagedWeb, stagedWebFingerprint, wroteSource = false;
  async function deploymentVersion() {
    return (await script(deploymentPath, 'verify existing WEB deployment')).deploymentConfig.versionNumber;
  }
  async function setDeployment(versionNumber) {
    const result = await script(deploymentPath, 'update existing WEB deployment', 'PUT', {
      deploymentConfig: {...deployment.deploymentConfig, versionNumber}
    });
    if (result?.deploymentId !== legacyDeployment || result.deploymentConfig.versionNumber !== versionNumber) {
      throw new Error('WEB deployment update could not be verified');
    }
  }
  async function verifyWebInitialization() {
    const url = 'https://script.google.com/macros/s/' + legacyDeployment + '/exec?_=' + Date.now();
    const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
    const text = await response.text();
    if (!response.ok || !/Script function not found: doGet|スクリプト関数が見つかりません[：:]?\s*doGet/.test(text)) {
      throw new Error('Existing WEB endpoint failed its read-only initialization check');
    }
  }
  return {
    async activateWebLock() {
      if (await deploymentVersion() !== oldVersion ||
          fingerprint((await script(base + '/content', 'recheck WEB source')).files) !== fingerprint(legacy.files)) {
        throw new Error('WEB project changed during preflight');
      }
      if (existing) {
        version = oldVersion;
        return {library: existing, drainStart: Date.parse(deployment.updateTime) || Date.now()};
      }
      const created = await script('', 'create private TFG number lock library', 'POST', {title: 'TFG 会員番号 採番ロック'});
      const lib = '/' + created.scriptId;
      await script(lib + '/content', 'install private shared lock', 'PUT', {files: [
        {name:'appsscript',type:'JSON',source:JSON.stringify({timeZone:'Asia/Tokyo',runtimeVersion:'V8'})},
        {name:'Code',type:'SERVER_JS',source:lockSource}
      ]});
      const libraryVersion = await script(lib + '/versions', 'version private shared lock', 'POST', {description: 'TFG master allocation'});
      const library = {...placeholder, libraryId: created.scriptId, version: String(libraryVersion.versionNumber)};
      stagedWeb = stageLegacyWeb(legacy.files, library);
      stagedWebFingerprint = fingerprint(stagedWeb);
      wroteSource = true;
      await script(base + '/content', 'apply WEB master-lock wrapper', 'PUT', {files:stagedWeb});
      version = (await script(base + '/versions', 'version WEB master-lock wrapper', 'POST', {description:'Share TFG membership number lock'})).versionNumber;
      if (fingerprint((await script(base + '/content?versionNumber=' + version, 'verify new WEB version')).files) !== stagedWebFingerprint) {
        throw new Error('The WEB version differs from the reviewed wrapper');
      }
      await setDeployment(version);
      await verifyWebInitialization();
      notice('web_signup_lock_live=true; version=' + version + '; previous_version=' + oldVersion);
      return {library, drainStart: Date.now()};
    },
    async verify() {
      if (await deploymentVersion() !== version) throw new Error('WEB deployment changed before admin activation');
      await verifyWebInitialization();
    },
    async rollback() {
      if (!wroteSource) return;
      const deployed = await deploymentVersion();
      if (deployed === version) await setDeployment(oldVersion);
      else if (deployed !== oldVersion) throw new Error('WEB deployment changed outside this release');
      const head = fingerprint((await script(base + '/content', 'check WEB source before restoring')).files);
      if (head === stagedWebFingerprint) {
        await script(base + '/content', 'restore previous WEB source', 'PUT',
          {files:legacy.files.map(({name,type,source}) => ({name,type,source}))});
      } else if (head !== fingerprint(legacy.files)) throw new Error('WEB editor source changed outside this release');
      notice('web_signup_rollback_completed=true; restored_version=' + oldVersion);
    }
  };
}
