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
  const installPage = document.getElementById("openInstallPage");
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
    installPage.hidden = false;
    help.hidden = true;
    status.textContent = "インストール用ページを開いて、ホーム画面に追加してください。";
    return;
  }
  const userAgent = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(userAgent);
  const embedded = /\bLine\/|FBAN|FBAV|Instagram|MicroMessenger|ChatGPT|;\s*wv\b/i.test(userAgent);
  const platform = ios ? "ios" : android ? "android" : "desktop";
  const installUrl = installPage.href;
  const publicPage = new URL(installUrl);
  document.querySelectorAll("[data-install-platform]").forEach(function (section) {
    section.hidden = section.dataset.installPlatform !== platform;
  });
  const chromeLink = document.getElementById("openInstallChrome");
  if (chromeLink) chromeLink.href = "intent://" + publicPage.host + publicPage.pathname +
    "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(installUrl) + ";end";
  const guide = document.getElementById("installBrowserGuide");
  if (guide) guide.textContent = ios
    ? "Safariの共有メニューで「ホーム画面に追加」を選んでください。"
    : android ? "Chromeのメニューからホーム画面に追加できます。LINEなどで開いている場合は、先にChromeで開いてください。"
      : "ブラウザーのメニューから追加するか、スマートフォンで予約URLを開いてください。";
  if (guide && embedded) guide.textContent = "アプリ内の画面から追加できない場合は、" + (ios ? "Safari" : "Chrome") + "で予約URLを開き直してください。";
  const fallbackLabel = ios ? "iPhoneのホーム画面への追加方法" : android ? "ホーム画面への追加方法" : "アプリの追加方法";
  let promptEvent = null, installing = false, accepted = false, installed = false;
  function updateButton() {
    button.hidden = installed || accepted;
    button.disabled = installing;
    if (!installing) button.textContent = promptEvent ? "アプリをインストール" : fallbackLabel;
    panel.dataset.installState = installed ? "installed" : accepted ? "accepted" : installing ? "opening" : promptEvent ? "ready" : "guide";
  }
  function showHelp(text) {
    help.open = true;
    status.textContent = text || "";
    help.scrollIntoView({ block: "nearest" });
  }
  updateButton();
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault(); promptEvent = event;
    accepted = false; updateButton();
    status.textContent = help.open ? "インストール画面を開けます。上の「アプリをインストール」をタップしてください。" : "";
  });
  button.addEventListener("click", async function () {
    if (installing || accepted || installed) return;
    if (!promptEvent) { showHelp(); return; }
    const event = promptEvent; promptEvent = null;
    installing = true; updateButton();
    button.textContent = "インストール画面を開いています…";
    status.textContent = "表示される確認画面で「インストール」を選んでください。";
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        accepted = true; help.open = false;
        status.textContent = "インストールを受け付けました。ホーム画面に「9ROUND予約」が追加されたら、そのアイコンから開いてください。";
      } else {
        showHelp("今回は追加されていません。ブラウザーのメニューからも、下の手順で追加できます。");
      }
    } catch (_) {
      showHelp("インストール画面を開けませんでした。下の手順で、ブラウザーのメニューから追加してください。");
    } finally { installing = false; updateButton(); }
  });
  window.addEventListener("appinstalled", function () {
    installed = true; promptEvent = null; updateButton(); panel.hidden = true;
  });
  const copyButton = document.getElementById("copyInstallUrl");
  if (copyButton) copyButton.addEventListener("click", async function () {
    const copyStatus = document.getElementById("installCopyStatus");
    try {
      await navigator.clipboard.writeText(installUrl);
      copyStatus.textContent = "予約URLをコピーしました。" + (ios ? "Safari" : "Chrome") + "のアドレス欄に貼り付けて開いてください。";
    } catch (_) {
      const input = document.getElementById("installUrl");
      input.value = installUrl; input.hidden = false;
      document.querySelector('label[for="installUrl"]').hidden = false;
      input.focus(); input.select();
      copyStatus.textContent = "上のURLを長押ししてコピーし、" + (ios ? "Safari" : "Chrome") + "で開いてください。";
    }
  });
})();
