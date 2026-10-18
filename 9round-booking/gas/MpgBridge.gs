/** Signed coordination from the MPG project. All decisions use the 9ROUND lock. */
function nrMpgBridgeSettings_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const secret = String(p.ROUND9_MPG_BRIDGE_SECRET || "");
  if (p.ROUND9_MPG_BRIDGE_ENABLED !== "true" || secret.length < 32) nrBookingError_("TRIAL_CONFIGURATION", "MPGとの予約連携を設定してください。");
  return { secret: secret };
}

function nrMpgBridgeIntervals_(config) {
  const trials = nrBookingRows_(config, "trial_applications").filter(function (r) { return r.status === "CONFIRMED"; });
  const daily = nrBookingRows_(config, "bookings").filter(function (r) { return r.kind === "DAILY" && r.status === "CONFIRMED"; });
  const trialIntervals = [], protectedIntervals = [];
  trials.forEach(function (t) {
    if (!trialIntervals.some(function (r) { return r.date === t.date && r.start_time === t.start_time && r.end_time === t.end_time; })) trialIntervals.push({ date: t.date, start_time: t.start_time, end_time: t.end_time });
    daily.filter(function (d) { return nrMpgOverlap_(t, d); }).forEach(function (d) {
      const interval = { date: t.date, start_time: t.start_time > d.start_time ? t.start_time : d.start_time, end_time: t.end_time < d.end_time ? t.end_time : d.end_time };
      if (!protectedIntervals.some(function (r) { return r.date === interval.date && r.start_time === interval.start_time && r.end_time === interval.end_time; })) protectedIntervals.push(interval);
    });
  });
  return { trial_intervals: trialIntervals, protected_intervals: protectedIntervals };
}

function nrMpgOverlap_(a, b) { return a.date === b.date && a.start_time < b.end_time && a.end_time > b.start_time; }

function nrMpgBridgeSlot_(value) {
  const slot = { date: nrBookingDate_(value.date), start_time: String(value.start_time || ""), end_time: String(value.end_time || "") };
  if (![slot.start_time, slot.end_time].every(function (t) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t); }) || slot.end_time <= slot.start_time) nrBookingError_("INVALID_REQUEST", "連携する予約時間を確認してください。");
  return slot;
}

function nrCoordinate9RoundMpg_(config, body) {
  const settings = nrMpgBridgeSettings_(), stamp = String(body.sent_at || ""), json = String(body.payload_json || "");
  const signature = String(body.signature || "");
  if (!/^\d{13}$/.test(stamp) || Math.abs(Date.now() - Number(stamp)) > 300000 || json.length > 80000 || !/^[a-f0-9]{64}$/.test(signature)) nrBookingError_("MPG_BRIDGE_UNAUTHORIZED", "連携リクエストを確認できません。");
  const expected = Utilities.computeHmacSha256Signature("9round-mpg:v1:" + stamp + ":" + json, settings.secret, Utilities.Charset.UTF_8).map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"); }).join("");
  if (expected !== signature) nrBookingError_("MPG_BRIDGE_UNAUTHORIZED", "連携リクエストを確認できません。");
  let data;
  try { data = JSON.parse(json); } catch (_) { nrBookingError_("INVALID_REQUEST", "連携リクエストを確認してください。"); }
  if (!data || Array.isArray(data) || typeof data !== "object") nrBookingError_("INVALID_REQUEST", "連携リクエストを確認してください。");
  return nrBookingLocked_(function () {
    const intervals = nrMpgBridgeIntervals_(config), rows = nrBookingRows_(config, "mpg_bridge"), now = new Date().toISOString();
    if (data.operation === "snapshot") return intervals;
    if (data.operation === "pending") return { holds: rows.filter(function (r) { return r.kind === "SUPPORT" && r.status === "ACTIVE" && Date.now() - Date.parse(r.created_at) >= 900000; }).map(function (r) {
      return { request_id: r.hold_id, reservation_id: r.reservation_id, date: r.date, start_time: r.start_time, end_time: r.end_time };
    }) };
    if (data.operation === "retire_shifts") {
      if (!Array.isArray(data.slots) || data.slots.length > 1000) nrBookingError_("INVALID_REQUEST", "対象の勤務枠を確認してください。");
      // Validate the complete batch before making any changes.
      const slots = data.slots.map(function (s) { return Object.assign(nrMpgBridgeSlot_(s), { id: String(s.id || "") }); });
      if (slots.some(function (s) { return !/^[a-zA-Z0-9_-]{1,80}$/.test(s.id); })) nrBookingError_("INVALID_REQUEST", "対象の勤務枠を確認してください。");
      const allowed = [], protectedIds = [], written = {};
      slots.forEach(function (slot) {
        const protect = intervals.protected_intervals.some(function (r) { return nrMpgOverlap_(r, slot); });
        const id = "retire-" + nrBookingHash_(config, slot.date + ":" + slot.start_time + ":" + slot.end_time);
        const old = rows.find(function (r) { return r.hold_id === id; });
        const status = protect ? "RELEASED" : "ACTIVE";
        if (!written[id] && (!protect || old) && (!old || old.status !== status)) nrBookingWrite_(config, "mpg_bridge", { hold_id: id, kind: "SHIFT_RETIRE", reservation_id: "", date: slot.date, start_time: slot.start_time, end_time: slot.end_time, status: status, created_at: old ? old.created_at : now, updated_at: now }, old ? old._row : undefined);
        written[id] = true;
        (protect ? protectedIds : allowed).push(slot.id);
      });
      return { allowed: allowed, protected: protectedIds };
    }
    if (["acquire_support", "guard_support", "release_support"].indexOf(data.operation) < 0) nrBookingError_("INVALID_REQUEST", "連携操作を確認してください。");
    const slot = nrMpgBridgeSlot_(data), id = String(data.request_id || ""), reservation = String(data.reservation_id || "");
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(id) || !/^[a-zA-Z0-9_-]{1,100}$/.test(reservation)) nrBookingError_("INVALID_REQUEST", "連携する申込IDを確認してください。");
    const old = rows.find(function (r) { return r.hold_id === id; });
    if (old && (old.kind !== "SUPPORT" || old.reservation_id !== reservation || old.date !== slot.date || old.start_time !== slot.start_time || old.end_time !== slot.end_time)) nrBookingError_("REQUEST_CONFLICT", "連携する申込内容が一致しません。");
    if (data.operation !== "release_support") {
      if (old && old.status !== "ACTIVE") nrBookingError_("MPG_BRIDGE_CLOSED", "この予約処理は終了しています。");
      if (data.operation === "acquire_support" && intervals.trial_intervals.some(function (r) { return nrMpgOverlap_(r, slot); })) nrBookingError_("MPG_TRIAL_CONFLICT", "この時間は9ROUND体験予約があるため、MPGサポートを予約できません。他の時間をお選びください。");
    }
    const status = data.operation === "release_support" ? "RELEASED" : "ACTIVE";
    // Release writes a tombstone even when an acquire reply was lost, so a late
    // duplicate acquire cannot reopen a completed or aborted operation.
    if (!old || old.status !== status) nrBookingWrite_(config, "mpg_bridge", { hold_id: id, kind: "SUPPORT", reservation_id: reservation, date: slot.date, start_time: slot.start_time, end_time: slot.end_time, status: status, created_at: old ? old.created_at : now, updated_at: now }, old ? old._row : undefined);
    return { request_id: id, status: status };
  });
}
