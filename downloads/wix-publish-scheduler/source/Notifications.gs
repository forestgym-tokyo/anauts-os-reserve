var WP_NOTICE = { SETTINGS: 'WP_NOTICE_SETTINGS', TEST: 'WP_NOTICE_TEST' };

// Optional address generated locally by the updater, never stored in the public package.
function wpApplyInstallerNotificationSettings_() {
  var email = typeof WP_REQUESTED_NOTIFICATION_EMAIL === 'string' ? WP_REQUESTED_NOTIFICATION_EMAIL : '';
  if (!email) return;
  if (!wpValidNotificationEmail_(email)) throw new Error('更新時に指定された通知先を確認してください。');
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('WP_NOTICE_INSTALLER_APPLIED') === email) return;
  properties.setProperty(WP_NOTICE.SETTINGS, JSON.stringify({ enabled: true, email: email }));
  properties.setProperty('WP_NOTICE_INSTALLER_APPLIED', email);
}

function saveResultNotificationSettings(input) {
  wpRequireOwner_();
  input = input || {};
  var enabled = input.enabled === true;
  var email = String(input.email || '').trim();
  if ((enabled || email) && !wpValidNotificationEmail_(email)) throw new Error('通知先のメールアドレスを正しく入力してください。');
  return wpLocked_(function () {
    PropertiesService.getScriptProperties().setProperty(WP_NOTICE.SETTINGS, JSON.stringify({ enabled: enabled, email: email }));
    var state = wpReadState_();
    if (state.jobs.some(wpNotificationActive_)) wpEnsureWorker_();
    return wpDashboard_();
  });
}

// A test sends mail only; it never invokes the Wix API or creates a publish reservation.
function sendWixNotificationTest(input) {
  wpRequireOwner_();
  var requestId = String(input && input.request_id || '');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new Error('画面を開き直してテスト送信をやり直してください。');
  var claimed = wpLocked_(function () {
    var settings = wpNotificationSettings_();
    if (!settings.enabled || !wpValidNotificationEmail_(settings.email)) throw new Error('先に通知先を入力し、メール通知をオンにして保存してください。');
    var properties = PropertiesService.getScriptProperties();
    var previous = JSON.parse(properties.getProperty(WP_NOTICE.TEST) || 'null');
    if (previous && previous.request_id === requestId) return null;
    if (previous && previous.status === 'SENDING' && Date.now() - Date.parse(previous.attempted_at) < WP.STALE_MS) {
      throw new Error('通知テストを送信中です。しばらく待ってから再確認してください。');
    }
    var test = { request_id: requestId, email: settings.email, status: 'SENDING', attempted_at: new Date().toISOString(), finished_at: '', message: '通知テストを送信中です。' };
    properties.setProperty(WP_NOTICE.TEST, JSON.stringify(test));
    return test;
  });
  if (claimed) {
    var result = wpSendNotificationMail_(claimed.email, '【HP更新予約】通知メールのテスト',
      'これはHP更新予約アプリからの通知テストです。\n\nこのテストによるHPの更新・公開は行っていません。\n' +
      '今後の更新成功・失敗・結果不明・期限切れを、このメールアドレスへ通知します。\n\n' +
      '送信日時：' + wpNoticeTime_(claimed.attempted_at));
    wpLocked_(function () {
      var properties = PropertiesService.getScriptProperties();
      var current = JSON.parse(properties.getProperty(WP_NOTICE.TEST) || 'null');
      if (current && current.request_id === requestId && current.status === 'SENDING') {
        current.status = result.status; current.message = result.message; current.finished_at = new Date().toISOString();
        properties.setProperty(WP_NOTICE.TEST, JSON.stringify(current));
      }
    });
  }
  return wpDashboard_();
}

function wpNotificationSettings_() {
  try {
    var saved = JSON.parse(PropertiesService.getScriptProperties().getProperty(WP_NOTICE.SETTINGS) || '{}');
    var email = String(saved.email || '');
    return { enabled: saved.enabled === true && wpValidNotificationEmail_(email), email: email };
  } catch (error) { return { enabled: false, email: '' }; }
}

function wpNotificationDashboard_() {
  var settings = wpNotificationSettings_();
  try { settings.last_test = JSON.parse(PropertiesService.getScriptProperties().getProperty(WP_NOTICE.TEST) || 'null'); }
  catch (error) { settings.last_test = null; }
  if (settings.last_test && settings.last_test.status === 'SENDING' && Date.now() - Date.parse(settings.last_test.attempted_at) >= WP.STALE_MS) {
    settings.last_test.status = 'UNKNOWN'; settings.last_test.message = 'テストメールの送信結果を確認できません。受信箱を確認してください。';
  }
  return settings;
}

function wpValidNotificationEmail_(email) {
  return email.length <= 254 && email.split('@')[0].length <= 64 &&
    /^[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(email);
}

function wpNotificationActive_(job) {
  return !!job.notification && (job.notification.status === 'PENDING' || job.notification.status === 'SENDING');
}

function wpQueueResultNotification_(job) {
  if (job.notification || ['SUCCEEDED', 'FAILED', 'UNKNOWN', 'EXPIRED'].indexOf(job.status) < 0) return;
  var settings = wpNotificationSettings_();
  if (!settings.enabled) return;
  job.notification = { to: settings.email, status: 'PENDING', attempted_at: '', sent_at: '', message: '結果メールの送信待ちです。' };
}

// Mail is claimed independently after the publish outcome has been saved.
function wpDispatchResultNotifications_() {
  var claimed = wpLocked_(function () {
    var state = wpReadState_(), changed = false;
    var enabled = wpNotificationSettings_().enabled;
    state.jobs.forEach(function (job) {
      var mail = job.notification;
      if (mail && mail.status === 'SENDING' && Date.now() - Date.parse(mail.attempted_at) >= WP.STALE_MS) {
        mail.status = 'UNKNOWN'; mail.message = 'メールの送信結果を確認できません。受信箱を確認してください。'; changed = true;
      }
      if (mail && mail.status === 'PENDING' && !enabled) {
        mail.status = 'SKIPPED'; mail.message = 'メール通知がオフのため送信しませんでした。'; changed = true;
      }
    });
    var job = state.jobs.find(function (item) { return item.notification && item.notification.status === 'PENDING'; });
    if (!job) {
      if (changed) wpWriteState_(state);
      wpRemoveIdleWorker_(state); return null;
    }
    if (!wpValidNotificationEmail_(job.notification.to)) {
      job.notification.status = 'FAILED'; job.notification.message = '通知先を確認できないため送信しませんでした。';
      wpWriteState_(state); wpRemoveIdleWorker_(state); return null;
    }
    job.notification.status = 'SENDING'; job.notification.attempted_at = new Date().toISOString();
    wpWriteState_(state);
    return JSON.parse(JSON.stringify(job));
  });
  if (!claimed) return;
  var mail = wpBuildResultMail_(claimed);
  var result = wpSendNotificationMail_(claimed.notification.to, mail.subject, mail.body);
  wpLocked_(function () {
    var state = wpReadState_();
    var job = state.jobs.find(function (item) { return item.id === claimed.id; });
    if (job && job.notification && job.notification.status === 'SENDING') {
      job.notification.status = result.status; job.notification.message = result.message;
      if (result.status === 'SENT') job.notification.sent_at = new Date().toISOString();
      wpWriteState_(state);
    }
    wpRemoveIdleWorker_(state);
  });
}

function wpSendNotificationMail_(to, subject, body) {
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return { status: 'FAILED', message: 'Googleのメール送信上限のため、通知メールを送信できませんでした。' };
  } catch (error) {
    return { status: 'FAILED', message: 'Googleのメール送信権限を確認できません。スクリプトの初期設定を再実行し、メール送信を許可してください。' };
  }
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body, name: 'The Forest Gym HP更新予約' });
    return { status: 'SENT', message: '通知メールを送信しました。受信箱をご確認ください。' };
  } catch (error) {
    return { status: 'UNKNOWN', message: 'メールの送信結果を確認できません。HPの更新は再実行せず、受信箱と実行履歴を確認してください。' };
  }
}

function wpBuildResultMail_(job) {
  var titles = { SUCCEEDED: '更新処理成功', FAILED: '更新失敗', UNKNOWN: '更新結果の確認が必要', EXPIRED: '期限切れ・更新未実行' };
  var title = titles[job.status] || '更新結果';
  var name = String(job.site_name || 'ホームページ').replace(/[\r\n]/g, ' ');
  var lines = [name + 'のHP更新予約の結果をお知らせします。', '',
    '結果：' + title, '更新予定日時：' + wpNoticeTime_(job.scheduled_at),
    '処理完了日時：' + wpNoticeTime_(job.finished_at), ''];
  if (job.label) lines.push('変更内容のメモ：' + job.label, '');
  lines.push(job.message || '');
  if (job.status === 'SUCCEEDED') lines.push('Wixの公開APIが成功を返しました。HPを開き、内容の反映をご確認ください。');
  if (job.status === 'UNKNOWN') lines.push('更新できている可能性があります。Wixのサイト履歴とHPを確認してから再予約してください。');
  if (/^https:\/\//i.test(job.site_url || '')) lines.push('', 'HP：' + job.site_url);
  lines.push('', '予約番号：' + job.id, '詳細は更新予約アプリの「実行履歴」で確認できます。');
  return { subject: '【HP更新予約】' + title + '｜' + name, body: lines.join('\n') };
}

function wpNoticeTime_(value) {
  var ms = Date.parse(value || '');
  return isFinite(ms) ? new Date(ms + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ') + '（日本時間）' : '―';
}
