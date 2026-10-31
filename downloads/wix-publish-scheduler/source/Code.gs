/* Standalone Apps Script project. Never add this to the reservation-system GAS. */
var WP = {
  ENDPOINT: 'https://www.wixapis.com/site-publisher/v1/site/publish',
  OWNER: 'WP_OWNER_EMAIL', KEY: 'WP_API_KEY', CONFIG: 'WP_CONFIG', STATE: 'WP_STATE',
  HANDLER: 'runWixPublishWorker_', MAX_LATE_MS: 5 * 60000, STALE_MS: 10 * 60000
};

// Run once from the Apps Script editor as the Google account that will manage this app.
function initializeWixPublisher() {
  var active = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  var effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!active || active !== effective) throw new Error('管理するGoogleアカウントでスクリプトエディタから実行してください。');
  return wpLocked_(function () {
    var properties = PropertiesService.getScriptProperties();
    var owner = properties.getProperty(WP.OWNER);
    if (owner && owner !== active) throw new Error('管理者アカウントが異なります。');
    properties.setProperty(WP.OWNER, active);
    if (!properties.getProperty(WP.STATE)) wpWriteState_({ jobs: [] });
    wpApplyInstallerNotificationSettings_();
    return '初期設定が完了しました。ウェブアプリは「自分のみ」に公開してください。';
  });
}

function doGet() {
  wpRequireOwner_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('HP公開予約 | The Forest Gym')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getPublisherDashboard() {
  wpRequireOwner_();
  return wpDashboard_();
}

function savePublisherSettings(input) {
  wpRequireOwner_();
  input = input || {};
  var siteId = String(input.site_id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) {
    throw new Error('WixのサイトIDを正しく入力してください。');
  }
  var name = wpText_(input.name, 60) || 'ホームページ';
  var url = String(input.url || '').trim();
  if (url.length > 500 || (url && !/^https:\/\/[^\s<>"']+$/i.test(url))) throw new Error('HPのURLはhttps://から入力してください。');
  var key = String(input.api_key || '').trim();
  if (key && (key.length < 20 || key.length > 6000 || /[\r\n]/.test(key))) throw new Error('APIキーを正しく入力してください。');
  return wpLocked_(function () {
    var state = wpReadState_();
    if (state.jobs.some(wpActive_)) throw new Error('予約中・実行中は接続設定を変更できません。予約中の場合は先に取り消してください。');
    var properties = PropertiesService.getScriptProperties();
    var previous = wpConfig_();
    if (!key && previous.site_id && previous.site_id !== siteId) throw new Error('サイトを変更するときはAPIキーも入力してください。');
    if (!key && !properties.getProperty(WP.KEY)) throw new Error('APIキーを入力してください。');
    if (key) properties.setProperty(WP.KEY, key);
    properties.setProperty(WP.CONFIG, JSON.stringify({ site_id: siteId, name: name, url: url }));
    return wpDashboard_();
  });
}

function createPublishReservation(input) {
  wpRequireOwner_();
  input = input || {};
  var at = wpParseJst_(input.scheduled_local);
  var label = wpText_(input.label, 60);
  var requestId = String(input.request_id || '');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new Error('画面を開き直して、予約操作をやり直してください。');
  return wpLocked_(function () {
    var state = wpReadState_();
    var duplicate = state.jobs.find(function (job) { return job.request_id === requestId; });
    if (duplicate) {
      if (duplicate.scheduled_at !== new Date(at).toISOString() || duplicate.label !== label) throw new Error('同じ操作番号で予約内容を変更できません。画面を開き直してください。');
      return wpDashboard_();
    }
    if (at < Date.now() + 60000) throw new Error('公開日時は、現在より1分以上先の日本時間を指定してください。');
    if (state.jobs.some(wpActive_)) throw new Error('公開予約は1件ずつ設定できます。現在の予約を取り消してから設定してください。');
    var config = wpConfig_();
    if (!config.site_id || !PropertiesService.getScriptProperties().getProperty(WP.KEY)) throw new Error('先にWixの接続設定を保存してください。');
    wpEnsureWorker_();
    state.jobs.unshift({
      id: Utilities.getUuid(), request_id: requestId, status: 'SCHEDULED',
      site_id: config.site_id, site_name: config.name, label: label,
      scheduled_at: new Date(at).toISOString(), created_at: new Date().toISOString(),
      attempted_at: '', finished_at: '', message: '', site_url: config.url || ''
    });
    wpWriteState_(state);
    return wpDashboard_();
  });
}

function cancelPublishReservation(id) {
  wpRequireOwner_();
  return wpLocked_(function () {
    var state = wpReadState_();
    var job = state.jobs.find(function (item) { return item.id === String(id); });
    if (!job) throw new Error('公開予約が見つかりません。');
    if (job.status === 'CANCELLED') return wpDashboard_();
    if (job.status !== 'SCHEDULED') throw new Error('実行を開始した予約は取り消せません。履歴を確認してください。');
    job.status = 'CANCELLED'; job.finished_at = new Date().toISOString(); job.message = '公開せずに取り消しました。';
    wpWriteState_(state); wpRemoveIdleWorker_(state);
    return wpDashboard_();
  });
}

// Private to google.script.run. Executed by the owner's minute trigger.
function runWixPublishWorker_() {
  var claimed = wpLocked_(function () {
    var state = wpReadState_(), now = Date.now(), changed = false;
    state.jobs.forEach(function (job) {
      if (job.status === 'RUNNING' && now - Date.parse(job.attempted_at) >= WP.STALE_MS) {
        job.status = 'UNKNOWN'; job.finished_at = new Date(now).toISOString();
        job.message = '公開の結果を確認できません。再予約の前にWixのサイト履歴とHPを確認してください。';
        wpQueueResultNotification_(job); changed = true;
      }
    });
    var job = state.jobs.find(function (item) { return item.status === 'SCHEDULED'; });
    if (!job || Date.parse(job.scheduled_at) > now) {
      if (changed) wpWriteState_(state);
      wpRemoveIdleWorker_(state); return null;
    }
    if (now - Date.parse(job.scheduled_at) > WP.MAX_LATE_MS) {
      job.status = 'EXPIRED'; job.finished_at = new Date(now).toISOString();
      job.message = '指定時刻から5分を超えたため、公開しませんでした。';
      wpQueueResultNotification_(job);
      wpWriteState_(state); wpRemoveIdleWorker_(state); return null;
    }
    var config = wpConfig_(), key = PropertiesService.getScriptProperties().getProperty(WP.KEY);
    if (!key || !config.site_id || config.site_id !== job.site_id) {
      job.status = 'FAILED'; job.finished_at = new Date(now).toISOString();
      job.message = '予約したサイトの接続設定を確認できず、公開しませんでした。';
      wpQueueResultNotification_(job);
      wpWriteState_(state); wpRemoveIdleWorker_(state); return null;
    }
    job.status = 'RUNNING'; job.attempted_at = new Date(now).toISOString();
    wpWriteState_(state); // Claim durably before the outbound call. Never retry RUNNING.
    return { id: job.id, site_id: job.site_id, key: key };
  });
  if (claimed) {
  var outcome;
  try {
    var response = UrlFetchApp.fetch(WP.ENDPOINT, {
      method: 'post', contentType: 'application/json', payload: '{}',
      headers: { Authorization: claimed.key, 'wix-site-id': claimed.site_id },
      muteHttpExceptions: true, followRedirects: false, validateHttpsCertificates: true
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      outcome = { status: 'SUCCEEDED', message: 'Wixから公開リクエスト成功の応答がありました。HPを開いて内容を確認してください。' };
    } else if (code >= 500 || code === 408 || code === 429) {
      outcome = { status: 'UNKNOWN', message: 'Wixの応答を確定できませんでした。再予約の前にサイト履歴とHPを確認してください。（HTTP ' + code + '）' };
    } else {
      var message = (code === 401 || code === 403) ? 'APIキーとサイトの公開権限を確認してください。' : 'Wixが公開リクエストを受け付けませんでした。';
      outcome = { status: 'FAILED', message: message + '（HTTP ' + code + '）' };
    }
  } catch (error) {
    // A network failure can follow a successful publish. No automatic retry, no raw error or key in logs.
    outcome = { status: 'UNKNOWN', message: '通信結果を確認できませんでした。再予約の前にWixのサイト履歴とHPを確認してください。' };
  }
  wpLocked_(function () {
    var state = wpReadState_();
    var job = state.jobs.find(function (item) { return item.id === claimed.id; });
    if (job && job.status === 'RUNNING') {
      job.status = outcome.status; job.message = outcome.message; job.finished_at = new Date().toISOString();
      wpQueueResultNotification_(job); wpWriteState_(state);
    }
    wpRemoveIdleWorker_(state);
  });
  }
  wpDispatchResultNotifications_();
}

function wpRequireOwner_() {
  var owner = PropertiesService.getScriptProperties().getProperty(WP.OWNER);
  var active = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!owner || !active || owner !== active) throw new Error('初期設定した管理者のGoogleアカウントでログインしてください。');
}
function wpLocked_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try { return callback(); } finally { lock.releaseLock(); }
}
function wpConfig_() { return JSON.parse(PropertiesService.getScriptProperties().getProperty(WP.CONFIG) || '{}'); }
function wpReadState_() {
  var state = JSON.parse(PropertiesService.getScriptProperties().getProperty(WP.STATE) || '{"jobs":[]}');
  if (!Array.isArray(state.jobs)) throw new Error('予約の保存データを確認できません。管理者にお問い合わせください。');
  return state;
}
function wpWriteState_(state) {
  while (state.jobs.length > 8 || Utilities.newBlob(JSON.stringify(state)).getBytes().length > 8000) {
    var removable = -1;
    for (var i = state.jobs.length - 1; i > 0; i--) {
      if (!wpActive_(state.jobs[i]) && !wpNotificationActive_(state.jobs[i])) { removable = i; break; }
    }
    if (removable < 0) break;
    state.jobs.splice(removable, 1);
  }
  var json = JSON.stringify(state);
  if (Utilities.newBlob(json).getBytes().length > 8000) throw new Error('保存する予約情報が長すぎます。');
  PropertiesService.getScriptProperties().setProperty(WP.STATE, json);
}
function wpDashboard_() {
  return { config: wpConfig_(), key_configured: !!PropertiesService.getScriptProperties().getProperty(WP.KEY),
    jobs: wpReadState_().jobs, server_now: new Date().toISOString(), max_late_minutes: WP.MAX_LATE_MS / 60000,
    notifications: wpNotificationDashboard_(), app_version: '0.2.0' };
}
function wpText_(value, max) { return String(value || '').trim().slice(0, max); }
function wpActive_(job) { return job.status === 'SCHEDULED' || job.status === 'RUNNING'; }
function wpParseJst_(input) {
  var value = String(input || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('公開日時を日本時間で指定してください。');
  var ms = Date.parse(value + ':00+09:00');
  if (!isFinite(ms) || new Date(ms + 9 * 3600000).toISOString().slice(0, 16) !== value) throw new Error('存在する日付・時刻を指定してください。');
  return ms;
}
function wpEnsureWorker_() {
  var found = ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === WP.HANDLER; });
  if (!found) ScriptApp.newTrigger(WP.HANDLER).timeBased().everyMinutes(1).create();
}
function wpRemoveIdleWorker_(state) {
  if (state.jobs.some(function (job) { return wpActive_(job) || wpNotificationActive_(job); })) return;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === WP.HANDLER) ScriptApp.deleteTrigger(trigger);
  });
}
