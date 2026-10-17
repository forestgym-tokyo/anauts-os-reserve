/** Reuse A-nauts login and the independent 9ROUND management components. */
(function () {
  "use strict";
  if (typeof state === "undefined" || typeof window.NineRoundBookingApi !== "function") return;
  const q = function (s) { return document.querySelector(s); };
  let identity = "", deniedIdentity = "", view = null, nav = null;
  function profileIdentity() {
    const user = state.authUser;
    if (!user || !state.idToken || user.active === false || user.active === "false") return "";
    const role = String(user.permission || "").toUpperCase();
    const store = String(user.store_code || "").toUpperCase();
    const canRound = ["true", "1", "yes", "on"].includes(String(user.can_9round || "").toLowerCase());
    if (!["ADMIN", "MANAGER"].includes(role) && !(role === "STAFF" && (store === "SOGA" || canRound))) return "";
    return [user.staff_code, user.email, role, store, canRound].join(":");
  }
  const auth = window.NineRoundStaff = {
    idToken: "", canManage: false, canManageSlots: false, canManageBookings: false,
    canRetryNotifications: false, generation: 0, embedded: true, workspace: q("main.main"),
    onChange: function () {}, onMounted: mount
  };
  function sync() {
    const profile = profileIdentity();
    if (!state.authUser || !state.idToken) deniedIdentity = "";
    const next = profile && profile !== deniedIdentity ? profile : "";
    const changed = next !== identity;
    identity = next; auth.idToken = next ? state.idToken : "";
    if (changed) {
      auth.generation++; auth.canManage = false; auth.canManageSlots = false;
      auth.canManageBookings = false; auth.canRetryNotifications = false;
      auth.onChange();
    }
    if (nav) { nav.hidden = !next; nav.classList.toggle("is-hidden", !next); }
    if (view) view.hidden = !next;
    if (!next && view && view.classList.contains("is-active")) {
      view.classList.remove("is-active"); if (nav) nav.classList.remove("is-active");
      const fallback = Array.from(document.querySelectorAll(".topnav .nav-button")).find(function (b) {
        return b !== nav && !b.hidden && !b.classList.contains("is-hidden");
      });
      if (fallback) {
        fallback.classList.add("is-active");
        q("#" + fallback.dataset.view + "View")?.classList.add("is-active");
      }
    }
  }
  auth.request = async function (action, payload) {
    sync();
    if (!identity) throw new Error("9ROUNDの利用権限を確認して、再度ログインしてください。");
    const generation = auth.generation, ownIdentity = identity;
    try {
      if (typeof window.ANAUTS_ENSURE_FRESH_AUTH_TOKEN === "function") await window.ANAUTS_ENSURE_FRESH_AUTH_TOKEN(false);
      sync();
      if (!identity || generation !== auth.generation) throw new Error("ログインが変更されました。予約状況を再度確認してください。");
      return await window.NineRoundBookingApi(action, Object.assign({}, payload, { id_token: state.idToken }));
    } catch (error) {
      if (generation === auth.generation && ["FORBIDDEN", "STAFF_SESSION_EXPIRED"].includes(error.code)) {
        deniedIdentity = ownIdentity; sync();
      }
      throw error;
    }
  };
  function activate() {
    sync();
    if (!identity || !view) return;
    document.querySelectorAll(".topnav .nav-button").forEach(function (b) { b.classList.toggle("is-active", b === nav); });
    document.querySelectorAll("main.main > .view").forEach(function (v) { v.classList.toggle("is-active", v === view); });
    auth.reloadBoard();
  }
  function mount(section) {
    view = section;
    const navigation = q(".topnav");
    nav = document.createElement("button"); nav.type = "button"; nav.id = "nineRoundBookingNav";
    nav.className = "nav-button"; nav.dataset.view = "nineRoundBooking";
    nav.setAttribute("aria-controls", "nineRoundBookingView"); nav.textContent = "🥊 9ROUND予約";
    nav.addEventListener("click", activate);
    navigation.insertBefore(nav, navigation.querySelector('[data-view="registration"]'));
    const css = document.createElement("link"); css.rel = "stylesheet";
    css.href = "../9round-booking/staff/styles.css?v=20261017-os-management"; document.head.append(css);
    sync();
    const params = new URLSearchParams(location.search);
    if (params.get("view") === "nineRoundBooking" || params.get("booking_id")) queueMicrotask(activate);
  }
  const originalApply = applyPermissionUi;
  applyPermissionUi = function () { const result = originalApply.apply(this, arguments); sync(); return result; };
  const originalLogout = logout;
  logout = function () { const result = originalLogout.apply(this, arguments); sync(); return result; };
  sync();
})();
