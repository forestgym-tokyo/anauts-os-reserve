/** Member-owned fighter profiles; the A-nauts member master remains read-only. */
function nrBookingFighterProfile_(config, member) {
  const emailHash = nrBookingHash_(config, "email:" + member.email);
  const row = nrBookingRows_(config, "fighters").find(function (r) {
    return r.member_no === member.no && r.email_hash === emailHash;
  });
  const name = row ? row.fighter_name : "";
  return { fighter_name: name, display_name: name || member.name, registered: !!name };
}

function nrGet9RoundFighterProfile_(config, body) {
  return nrBookingFighterProfile_(config, nrBookingSession_(config, body).member);
}

function nrSave9RoundFighterProfile_(config, body) {
  return nrBookingLocked_(function () {
    const member = nrBookingSession_(config, body).member;
    const name = String(body.fighter_name || "").normalize("NFC").trim();
    if (!name || Array.from(name).length > 24 || /[\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(name)) {
      nrBookingError_("INVALID_FIGHTER_NAME", "ファイターネームは1〜24文字で入力してください。改行や制御文字は使えません。");
    }
    const emailHash = nrBookingHash_(config, "email:" + member.email);
    const old = nrBookingRows_(config, "fighters").find(function (r) { return r.member_no === member.no && r.email_hash === emailHash; });
    const now = new Date().toISOString();
    nrBookingWrite_(config, "fighters", { member_no: member.no, email_hash: emailHash, fighter_name: name,
      created_at: old ? old.created_at : now, updated_at: now }, old ? old._row : undefined);
    return { fighter_name: name, display_name: name, registered: true };
  });
}

function nrBookingFighterNames_(config) {
  const members = nrBookingMembers_(config), names = Object.create(null);
  nrBookingRows_(config, "fighters").forEach(function (r) {
    const current = members.filter(function (m) { return m.no === r.member_no; });
    if (current.length === 1 && nrBookingHash_(config, "email:" + current[0].email) === r.email_hash) names[r.member_no] = r.fighter_name;
  });
  return names;
}
