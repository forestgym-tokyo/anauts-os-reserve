/** Authenticated staff operations. Email URLs never grant authority or mutate data. */
function nrBookingManagedMember_(config, body, requireActive) {
  const booking = nrBookingRows_(config, "bookings").find(function (r) { return r.booking_id === String(body.booking_id || ""); });
  if (!booking) nrBookingError_("BOOKING_NOT_FOUND", "対象の予約が見つかりません。");
  const members = nrBookingMembers_(config).filter(function (m) { return m.no === booking.member_no; });
  if (members.length !== 1 || !members[0].name || (requireActive && !members[0].active)) {
    nrBookingError_("MEMBER_UNAVAILABLE", "現在の会員情報ではこの操作を実行できません。");
  }
  nrBookingEmail_(members[0].email);
  if (config.environment === "development" && config.testEmails.indexOf(members[0].email) < 0) {
    nrBookingError_("MEMBER_UNAVAILABLE", "開発用テスト会員の予約だけを操作できます。");
  }
  return { booking: booking, member: members[0] };
}

function nrGet9RoundManagedBooking_(config, body) {
  nrBookingStaff_(config, body, false);
  const selected = nrBookingManagedMember_(config, body, false), r = selected.booking;
  const attended = nrBookingAttended_(config, r.booking_id);
  const mutable = r.status === "CONFIRMED" && nrBookingBeforeDeadline_(r) && !attended;
  return { range: nrBookingRange_(config), booking: { booking_id: r.booking_id, date: r.date,
    start_time: r.start_time, slot_id: r.slot_id, name: selected.member.name,
    fighter_name: nrBookingFighterProfile_(config, selected.member).fighter_name,
    member_no: selected.member.no, status: r.status, attended: attended, deadline: nrBookingDeadline_(r),
    can_cancel: mutable, can_change: mutable && selected.member.active } };
}

function nrCancel9RoundManagedBooking_(config, body) {
  const staff = nrBookingStaff_(config, body, false);
  return nrBookingLocked_(function () {
    const selected = nrBookingManagedMember_(config, body, false);
    return nrBookingCancelForMember_(config, body, selected.member, staff);
  });
}

function nrReschedule9RoundManagedBooking_(config, body) {
  const staff = nrBookingStaff_(config, body, false);
  return nrBookingLocked_(function () {
    const selected = nrBookingManagedMember_(config, body, true);
    return nrBookingRescheduleForMember_(config, body, selected.member, staff);
  });
}

function nrBookingManagementAudit_(config, bookingId, type, staff, newId) {
  nrBookingWrite_(config, "management_actions", { action_id: nrBookingHash_(config, "management:" + type + ":" + bookingId),
    booking_id: bookingId, action_type: type, staff_code: staff.staff_code, created_at: new Date().toISOString(), new_booking_id: newId });
}
