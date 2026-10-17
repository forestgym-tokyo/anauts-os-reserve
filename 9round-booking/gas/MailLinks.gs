/**
 * Possession-based links sent to the member and management email recipients.
 * These tokens are scoped to exactly one booking and stop working as soon as
 * the booking is changed, cancelled or passes the normal 1-hour cutoff.
 * Reading a link is never a mutation. All writes require POST through the API.
 */
function nrBookingMailToken_(config, booking, member, role) {
  return nrBookingHash_(config, "mail-action:v1:" + role + ":" + booking.booking_id + ":" + member.no + ":" + member.email);
}

function nrBookingMailAccess_(config, body) {
  const id = String(body.booking_id || ""), token = String(body.mail_token || "");
  if (!/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) {
    nrBookingError_("INVALID_MAIL_LINK", "予約操作用リンクを確認できません。予約確認メールのボタンから開き直してください。");
  }
  const selected = nrBookingManagedMember_(config, { booking_id: id }, true);
  const role = ["MEMBER", "ADMIN"].find(function (r) {
    return nrBookingMailToken_(config, selected.booking, selected.member, r) === token;
  });
  if (!role) nrBookingError_("INVALID_MAIL_LINK", "この予約操作用リンクは無効です。予約確認メールをご確認ください。");
  return { booking: selected.booking, member: selected.member, role: role };
}

function nrGet9RoundMailBooking_(config, body) {
  const access = nrBookingMailAccess_(config, body), r = access.booking;
  const attended = nrBookingAttended_(config, r.booking_id);
  const mutable = r.status === "CONFIRMED" && !attended && nrBookingBeforeDeadline_(r);
  return { booking: {
    booking_id: r.booking_id, date: r.date, start_time: r.start_time,
    status: r.status, can_cancel: mutable, can_change: mutable,
    member_name: access.member.name, deadline: nrBookingDeadline_(r)
  }, range: nrBookingRange_(config) };
}

function nrGet9RoundMailSlots_(config, body) {
  const access = nrBookingMailAccess_(config, body);
  nrBookingRequireMutable_(config, access.booking);
  const date = nrBookingRequireDate_(config, body.date);
  const bookings = nrBookingRows_(config, "bookings");
  const blocks = nrBookingRows_(config, "blocks");
  return { date: date, slots: nrBookingDailySlots_(date).map(function (slot) {
    const blocked = blocks.some(function (b) {
      return b.slot_id === slot.slot_id && ["BLOCKED", "DELETED"].indexOf(b.status) >= 0;
    });
    const own = bookings.some(function (r) {
      return r.slot_id === slot.slot_id && r.member_no === access.member.no && r.status === "CONFIRMED";
    });
    const booked = nrBookingCount_(bookings, slot.slot_id);
    return { slot_id: slot.slot_id, start_time: slot.start_time,
      available: nrBookingBeforeDeadline_(slot) && !blocked && !own && booked < slot.capacity };
  }) };
}

function nrCancel9RoundMailBooking_(config, body) {
  return nrBookingLocked_(function () {
    const access = nrBookingMailAccess_(config, body);
    nrBookingRequireMutable_(config, access.booking);
    const actor = access.role === "ADMIN" ? { staff_code: "MAIL_ADMIN_LINK" } : null;
    return nrBookingCancelForMember_(config, body, access.member, actor);
  });
}

function nrReschedule9RoundMailBooking_(config, body) {
  return nrBookingLocked_(function () {
    const access = nrBookingMailAccess_(config, body);
    // The common workflow preserves idempotency on repeated submission while
    // still enforcing reservation status, capacity and the 1-hour deadline.
    const actor = access.role === "ADMIN" ? { staff_code: "MAIL_ADMIN_LINK" } : null;
    return nrBookingRescheduleForMember_(config, body, access.member, actor);
  });
}
