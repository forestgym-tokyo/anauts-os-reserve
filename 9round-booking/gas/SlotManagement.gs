/** Slot changes are administrator-only and retain data for restoration. */
function nrBookingSlotAdmin_(config, body) {
  const auth = nrBookingStaff_(config, body, false);
  if (auth.permission !== "ADMIN") nrBookingError_("FORBIDDEN", "枠の管理には管理者権限が必要です。");
  return auth;
}

function nrDelete9RoundSlot_(config, body) {
  return nrBookingSetSlotDeleted_(config, body, true);
}

function nrRestore9RoundSlot_(config, body) {
  return nrBookingSetSlotDeleted_(config, body, false);
}

function nrBookingSetSlotDeleted_(config, body, deleted) {
  const auth = nrBookingSlotAdmin_(config, body);
  return nrBookingLocked_(function () {
    const date = nrBookingRequireDate_(config, body.date), id = String(body.slot_id || "");
    const daily = nrBookingDailySlots_(date).find(function (s) { return s.slot_id === id; });
    const trial = daily ? null : nrBookingRows_(config, "trials").find(function (s) { return s.slot_id === id && s.date === date; });
    if (!daily && !trial) nrBookingError_("INVALID_SLOT", "対象日の枠を選び直してください。");
    const block = daily ? nrBookingRows_(config, "blocks").find(function (s) { return s.slot_id === id; }) : null;
    const wasDeleted = daily ? !!block && block.status === "DELETED" : trial.status === "DELETED";
    if (wasDeleted === deleted) return { slot_id: id, deleted: deleted, unchanged: true };
    if (deleted && nrBookingCount_(nrBookingRows_(config, "bookings"), id)) {
      nrBookingError_("SLOT_HAS_BOOKINGS", "予約が入っている枠は削除できません。予約の変更・キャンセル、または受付のブロックをご利用ください。");
    }
    if (daily) {
      nrBookingWrite_(config, "blocks", { slot_id: id, date: date, start_time: daily.start_time,
        status: deleted ? "DELETED" : "BLOCKED", updated_by: auth.staff_code, updated_at: new Date().toISOString() }, block ? block._row : undefined);
    } else {
      trial.status = deleted ? "DELETED" : "CLOSED";
      trial.updated_at = new Date().toISOString();
      nrBookingWrite_(config, "trials", trial, trial._row);
    }
    return { slot_id: id, deleted: deleted, status: deleted ? "DELETED" : daily ? "BLOCKED" : "CLOSED" };
  });
}
