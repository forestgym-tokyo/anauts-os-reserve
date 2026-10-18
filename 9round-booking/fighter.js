(function () {
  "use strict";
  const q = function (s) { return document.querySelector(s); };
  let token = "", sequence = 0, saving = false, registered = false;
  const fighter = window.NineRoundFighter = {
    onError: function () {},
    onChange: function () {},
    get registered() { return registered; },
    refresh: function () { if (token && !saving) return load(); },
    requireRegistration: function () {
      if (registered) return true;
      q("#fighterPanel").open = true;
      q("#fighterName").focus();
      return false;
    },
    authenticate: function (value) {
      if (token === value) return;
      token = value; sequence++; saving = false; registered = false;
      q("#fighterGreeting").textContent = ""; q("#fighterGreeting").hidden = true;
      q("#fighterForm").reset(); q("#fighterStatus").textContent = "";
      q("#fighterPanel").open = !!token; q("#fighterSummary").textContent = "ファイター登録（必須）";
      q("#fighterSave").textContent = "ファイター登録する →"; q("#fighterSave").disabled = false;
      fighter.onChange();
      if (token) load();
    }
  };
  function render(data) {
    registered = !!data.registered;
    q("#fighterGreeting").textContent = data.display_name + "さん、";
    q("#fighterGreeting").hidden = false;
    q("#fighterName").value = data.fighter_name;
    q("#fighterSummary").textContent = data.registered ? "ファイターネームを変更" : "ファイター登録（必須）";
    q("#fighterSave").textContent = data.registered ? "ファイターネームを変更する →" : "ファイター登録する →";
    fighter.onChange();
  }
  async function load() {
    const ownToken = token, seq = ++sequence;
    q("#fighterStatus").textContent = "登録情報を確認しています…";
    try {
      const data = await window.NineRoundBookingApi("get9RoundFighterProfile", { session_token: ownToken });
      if (token !== ownToken || seq !== sequence) return;
      render(data); q("#fighterPanel").open = !data.registered;
      q("#fighterStatus").textContent = data.registered ? "" : "予約にはファイターネームの登録が必要です。入力して保存してください。";
    } catch (error) {
      if (token === ownToken && seq === sequence) {
        q("#fighterStatus").textContent = "登録情報を確認できませんでした。「再読込」からもう一度お試しください。";
        fighter.onError(error);
      }
    }
  }
  q("#fighterForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!token || saving) return;
    if (!q("#fighterName").value.trim()) {
      q("#fighterStatus").textContent = "ファイターネームを入力してください。";
      q("#fighterName").focus();
      return;
    }
    const ownToken = token, seq = ++sequence;
    saving = true; q("#fighterSave").disabled = true; q("#fighterStatus").textContent = "保存しています…";
    try {
      const data = await window.NineRoundBookingApi("save9RoundFighterProfile", { session_token: ownToken, fighter_name: q("#fighterName").value });
      if (token !== ownToken || seq !== sequence) return;
      render(data); q("#fighterStatus").textContent = "ファイターネームを保存しました。いつでも変更できます。";
    } catch (error) {
      if (token === ownToken && seq === sequence) { q("#fighterStatus").textContent = error.message; fighter.onError(error); }
    } finally { if (token === ownToken && seq === sequence) { saving = false; q("#fighterSave").disabled = false; } }
  });
})();
