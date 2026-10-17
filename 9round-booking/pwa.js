(function () {
  "use strict";
  const config = window.ANAUTS_ROUND9_BOOKING || {};
  if (config.preferLegacy && /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec\?page=member$/.test(config.legacyMemberUrl || "")) {
    window.location.replace(config.legacyMemberUrl);
    return;
  }
  const panel = document.getElementById("installPanel");
  if (!panel) return;
  const button = document.getElementById("installApp");
  const help = document.getElementById("installHelp");
  const status = document.getElementById("installStatus");
  const connection = document.getElementById("connectionStatus");
  const updateConnection = function () { if (connection) connection.hidden = navigator.onLine; };
  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);
  updateConnection();
  const gasHosted = typeof google !== "undefined" && google.script && google.script.run;
  if (!gasHosted && "serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./", updateViaCache: "none" })
      .catch(function () { /* Browser menu installation remains available. */ });
  }
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return;
  panel.hidden = false;
  if (gasHosted) {
    button.hidden = true;
    document.getElementById("openInstallPage").hidden = false;
    help.hidden = true;
    status.textContent = "インストール用ページを開いて、ホーム画面に追加してください。";
    return;
  }
  let promptEvent;
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault(); promptEvent = event;
    button.textContent = "アプリをインストール";
    status.textContent = "";
  });
  button.addEventListener("click", async function () {
    if (!promptEvent) {
      help.open = true;
      status.textContent = "お使いの端末に合わせて、下の手順で追加してください。";
      return;
    }
    const event = promptEvent; promptEvent = null;
    button.disabled = true;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome !== "accepted") {
        help.open = true;
        status.textContent = "ブラウザーのメニューからもホーム画面に追加できます。";
      }
    } catch (_) {
      help.open = true;
      status.textContent = "ブラウザーのメニューからホーム画面に追加してください。";
    } finally { button.disabled = false; }
  });
  window.addEventListener("appinstalled", function () {
    promptEvent = null; panel.hidden = true;
  });
})();
