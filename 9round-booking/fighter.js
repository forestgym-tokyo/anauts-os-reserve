(function () {
  "use strict";
  const q = function (s) { return document.querySelector(s); };
  let token = "", sequence = 0, saving = false;
  const fighter = window.NineRoundFighter = {
    onError: function () {},
    authenticate: function (value) {
      if (token === value) return;
      token = value; sequence++; saving = false;
      q("#fighterGreeting").textContent = ""; q("#fighterGreeting").hidden = true;
      q("#fighterForm").reset(); q("#fighterStatus").textContent = "";
      q("#fighterPanel").open = false; q("#fighterSummary").textContent = "ファイター登録";
      q("#fighterSave").textContent = "ファイター登録する →"; q("#fighterSave").disabled = false;
      if (token) load();
    }
  };
  function render(data) {
    q("#fighterGreeting").textContent = data.display_name + "さん、";
    q("#fighterGreeting").hidden = false;
    q("#fighterName").value = data.fighter_name;
    q("#fighterSummary").textContent = data.registered ? "ファイターネームを変更" : "ファイター登録";
    q("#fighterSave").textContent = data.registered ? "ファイターネームを変更する →" : "ファイター登録する →";
  }
  async function load() {
    const ownToken = token, seq = ++sequence;
    try {
      const data = await window.NineRoundBookingApi("get9RoundFighterProfile", { session_token: ownToken });
      if (token !== ownToken || seq !== sequence) return;
      render(data); q("#fighterPanel").open = !data.registered;
    } catch (error) { if (token === ownToken && seq === sequence) fighter.onError(error); }
  }
  q("#fighterForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!token || saving) return;
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
