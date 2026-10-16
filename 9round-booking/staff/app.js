(function () {
  "use strict";
  const q = function (s) { return document.querySelector(s); };
  let refreshToken = "", expiresAt = 0, refreshing = null, signingIn = false;
  const auth = window.NineRoundStaff = { idToken: "", canManage: false, generation: 0, onChange: function () {} };
  function message(text) { q("#staffLoginMessage").hidden = !text; q("#staffLoginMessage").textContent = text || ""; }
  function logout() {
    auth.generation++; auth.idToken = ""; auth.canManage = false;
    refreshToken = ""; expiresAt = 0;
    q("#staffPassword").value = "";
    q("#staffLoginPanel").hidden = false; q("#staffAuthBar").hidden = true;
    auth.onChange(); message("");
  }
  async function firebaseRequest(url, payload, contentType) {
    const controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 30000);
    try {
      const response = await fetch(url, {
        method: "POST", credentials: "omit", headers: { "Content-Type": contentType || "application/json" },
        body: typeof payload === "string" ? payload : JSON.stringify(payload), signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error("メールアドレス・パスワード、またはスタッフの利用権限をご確認ください。");
      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("通信できませんでした。もう一度お試しください。");
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function freshToken() {
    if (!auth.idToken) throw new Error("スタッフとしてログインしてください。");
    if (Date.now() + 60000 < expiresAt) return auth.idToken;
    if (!refreshing) {
      const generation = auth.generation;
      refreshing = (async function () {
        const key = window.ANAUTS_ROUND9_BOOKING.firebaseApiKey;
        const data = await firebaseRequest("https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(key),
          new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(), "application/x-www-form-urlencoded");
        if (generation !== auth.generation) throw new Error("再度ログインしてください。");
        auth.idToken = data.id_token; refreshToken = data.refresh_token;
        expiresAt = Date.now() + Number(data.expires_in) * 1000;
        return auth.idToken;
      })().catch(function (error) {
        error.code = "STAFF_SESSION_EXPIRED"; throw error;
      }).finally(function () { refreshing = null; });
    }
    return refreshing;
  }
  auth.request = async function (action, payload) {
    const generation = auth.generation;
    try {
      const idToken = await freshToken();
      return await window.NineRoundBookingApi(action, Object.assign({}, payload, { id_token: idToken }));
    } catch (error) {
      if (generation === auth.generation && ["STAFF_SESSION_EXPIRED", "FORBIDDEN"].includes(error.code)) {
        logout(); message(error.message);
      }
      throw error;
    }
  };
  q("#staffLoginForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (signingIn) return;
    const config = window.ANAUTS_ROUND9_BOOKING || {};
    if (!config.apiUrl || !config.firebaseApiKey) { message("現在、予約管理の接続準備中です。"); return; }
    signingIn = true; q("#staffSignIn").disabled = true; message("");
    const generation = ++auth.generation;
    try {
      const data = await firebaseRequest("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(config.firebaseApiKey),
        { email: q("#staffEmail").value.trim(), password: q("#staffPassword").value, returnSecureToken: true });
      if (generation !== auth.generation) return;
      auth.idToken = data.idToken; refreshToken = data.refreshToken; expiresAt = Date.now() + Number(data.expiresIn) * 1000;
      const board = await auth.request("get9RoundBookingBoard", { date: window.NineRoundTokyoDate() });
      if (generation !== auth.generation) return;
      auth.canManage = board.can_manage === true;
      q("#staffLoginPanel").hidden = true; q("#staffAuthBar").hidden = false;
      auth.onChange(board);
    } catch (error) {
      if (generation === auth.generation) { logout(); message(error.message); }
    } finally {
      signingIn = false; q("#staffSignIn").disabled = false; q("#staffPassword").value = "";
    }
  });
  q("#staffLogout").addEventListener("click", logout);
  if (!(window.ANAUTS_ROUND9_BOOKING || {}).apiUrl) message("現在、予約管理の接続準備中です。");
})();
