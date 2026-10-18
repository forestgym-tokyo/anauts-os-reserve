/** MPG client for the separate 9ROUND coordinator. Disabled until configured. */
function mpg9RoundEnabled_() {
  return typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties().getProperty("ROUND9_MPG_BRIDGE_ENABLED") === "true";
}

function mpg9RoundCall_(payload) {
  const p = PropertiesService.getScriptProperties().getProperties();
  const url = String(p.ROUND9_MPG_BRIDGE_URL || ""), secret = String(p.ROUND9_MPG_BRIDGE_SECRET || "");
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url) || secret.length < 32) throw mpg9RoundError_("MPG_BRIDGE_CONFIGURATION", "9ROUNDとの予約連携を設定してください。");
  const stamp = String(Date.now()), json = JSON.stringify(payload);
  const signature = Utilities.computeHmacSha256Signature("9round-mpg:v1:" + stamp + ":" + json, secret, Utilities.Charset.UTF_8).map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"); }).join("");
  let result;
  try {
    const response = UrlFetchApp.fetch(url, { method: "post", contentType: "text/plain;charset=utf-8", payload: JSON.stringify({ action: "coordinate9RoundMpg", sent_at: stamp, payload_json: json, signature: signature }), muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error("transport");
    result = JSON.parse(response.getContentText());
  } catch (_) { throw mpg9RoundError_("MPG_BRIDGE_UNAVAILABLE", "予約状況を確認できません。時間をあけてお試しください。"); }
  if (!result || !result.ok) throw mpg9RoundError_(result && result.code || "MPG_BRIDGE_UNAVAILABLE", result && result.message || "予約状況を確認できません。");
  return result.data;
}

function mpg9RoundError_(code, message) { const error = new Error(message); error.mpg9RoundCode = code; return error; }
function mpg9RoundOverlaps_(a, b) { return a.date === b.date && a.start_time < b.end_time && a.end_time > b.start_time; }

/** Editor-only, read-only connection check before enabling trial reception. */
function check9RoundMpgConnection() {
  if (!mpg9RoundEnabled_()) throw mpg9RoundError_("MPG_BRIDGE_CONFIGURATION", "MPG連携を有効にしてから確認してください。");
  const snapshot = mpg9RoundCall_({ operation: "snapshot" });
  return { ready: true, confirmed_trial_slots: snapshot.trial_intervals.length, protected_intervals: snapshot.protected_intervals.length };
}

function mpg9RoundAcquireSupport_(record) {
  if (String(record.service_code || "").toUpperCase() !== "MPG_TRAINING_SUPPORT45" || !mpg9RoundEnabled_()) return null;
  const claims = [], previous = record.previous;
  // Keep the old interval guarded until a move commits or rolls back. Otherwise
  // a trial could enter after the row moves, just before an error restores it.
  if (previous && String(previous.staff_code || "").toUpperCase() === MPG_SHIFT_STAFF_CODE_ &&
      (previous.date !== record.date || previous.start_time !== record.start_time || previous.end_time !== record.end_time || String(record.staff_code || "").toUpperCase() !== MPG_SHIFT_STAFF_CODE_)) {
    claims.push({ operation: "guard_support", request_id: Utilities.getUuid(), reservation_id: String(record.reservation_id), date: previous.date, start_time: previous.start_time, end_time: previous.end_time });
  }
  if (String(record.staff_code || "").toUpperCase() === MPG_SHIFT_STAFF_CODE_) claims.push({ operation: "acquire_support", request_id: Utilities.getUuid(), reservation_id: String(record.reservation_id), date: record.date, start_time: record.start_time, end_time: record.end_time });
  if (!claims.length) return null;
  const hold = { claims: claims };
  try { claims.forEach(function (claim) { mpg9RoundCall_(claim); }); }
  catch (error) { mpg9RoundReleaseSupportSafely_(hold); throw error; }
  return hold;
}

function mpg9RoundReleaseSupportSafely_(hold) {
  if (!hold) return false;
  if (hold.claims) {
    let released = true;
    hold.claims.forEach(function (claim) { if (!mpg9RoundReleaseSupportSafely_(claim)) released = false; });
    return released;
  }
  try {
    // Source data must be visible before removing the coordinator's hold.
    SpreadsheetApp.flush();
    mpg9RoundCall_(Object.assign({}, hold, { operation: "release_support" }));
    return true;
  } catch (_) {
    if (typeof logError === "function") logError("mpg9RoundRelease", "MPGの予約連携が処理待ちです。定期処理で再確認します。", { request_id: hold.request_id });
    return false;
  }
}

/** Caller holds the MPG script lock; old interrupted requests cannot still write. */
function mpg9RoundRecoverPending_() {
  if (!mpg9RoundEnabled_()) return 0;
  const pending = mpg9RoundCall_({ operation: "pending" }).holds;
  return pending.reduce(function (n, hold) { return n + (mpg9RoundReleaseSupportSafely_(hold) ? 1 : 0); }, 0);
}

function mpg9RoundProtectedShiftKeys_() {
  if (!mpg9RoundEnabled_()) return [];
  const protectedIntervals = mpg9RoundCall_({ operation: "snapshot" }).protected_intervals;
  return mpgShiftRows_().map(mpgNormalizeShiftRow_).filter(function (shift) {
    return shift.active && shift.staff_code === MPG_SHIFT_STAFF_CODE_ && shift.store_code === MPG_SHIFT_STORE_CODE_ && protectedIntervals.some(function (r) { return mpg9RoundOverlaps_(shift, r); });
  }).map(function (shift) { return shift.date + "|" + shift.start_time; });
}

function mpg9RoundRetirableShiftRows_(rowNumbers, table) {
  if (!rowNumbers.length || !mpg9RoundEnabled_()) return rowNumbers;
  const candidates = rowNumbers.map(function (rowNumber) {
    const row = {};
    table.headers.forEach(function (h, i) { row[h] = table.values[rowNumber - 1][i]; });
    return Object.assign(mpgNormalizeShiftRow_(row), { id: String(rowNumber) });
  });
  const allowed = [];
  for (let i = 0; i < candidates.length; i += 200) {
    const result = mpg9RoundCall_({ operation: "retire_shifts", slots: candidates.slice(i, i + 200).map(function (r) { return { id: r.id, date: r.date, start_time: r.start_time, end_time: r.end_time }; }) });
    Array.prototype.push.apply(allowed, result.allowed);
  }
  return rowNumbers.filter(function (n) { return allowed.indexOf(String(n)) >= 0; });
}

function mpg9RoundFilterSupportSlots_(date, slots, serviceCode) {
  if (String(serviceCode || "").toUpperCase() !== "MPG_TRAINING_SUPPORT45" || !mpg9RoundEnabled_()) return slots;
  const trials = mpg9RoundCall_({ operation: "snapshot" }).trial_intervals;
  return slots.filter(function (slot) { return !trials.some(function (t) { return mpg9RoundOverlaps_(Object.assign({ date: date }, slot), t); }); });
}
