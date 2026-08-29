window.ANAUTS_AUTH = {
  enabled: true,
  firebaseApiKey: "AIzaSyAtxFCPt1mGZWYP6hMYcqeVzLAVmrvvyIc"
};

/*
 * Apps Script がログイン画面・エラーページなどのHTMLを返した場合に、
 * response.json() の "Unexpected token '<'" で画面全体を壊さないためのAPIガード。
 *
 * firebase-config.js は admin.js より先に読み込まれるため、
 * DOMContentLoaded の先行リスナーで admin.js の apiGet / apiPost を差し替える。
 */
document.addEventListener("DOMContentLoaded", function () {
  if (
    typeof apiGet !== "function" ||
    typeof apiPost !== "function" ||
    typeof withAuth !== "function" ||
    typeof API_URL === "undefined"
  ) {
    return;
  }

  const primaryUrl = String(API_URL || "").trim();
  const workspaceUrl = primaryUrl.replace(
    "https://script.google.com/macros/s/",
    "https://script.google.com/a/theforestgym.com/macros/s/"
  );

  let rememberedUrl = "";
  try {
    rememberedUrl = String(
      window.sessionStorage.getItem("anauts_admin_api_url") || ""
    ).trim();
  } catch (_) {
    rememberedUrl = "";
  }

  const apiUrls = Array.from(
    new Set(
      [
        rememberedUrl,
        workspaceUrl,
        String(window.ANAUTS_API_URL || "").trim(),
        primaryUrl
      ].filter(Boolean)
    )
  );

  const API_REQUEST_TIMEOUT_MS = 20000;

  function isHtmlResponse_(text) {
    return /^\s*<!doctype\s+html/i.test(text) || /^\s*<html/i.test(text);
  }

  function apiConnectionError_(action, text) {
    const titleMatch = String(text || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";

    const suffix = title ? `（${title}）` : "";

    return new Error(
      `GAS APIに接続できません${suffix}。WebアプリのデプロイURLまたはアクセス設定を確認してください。` +
      (action ? ` [${action}]` : "")
    );
  }

  async function parseApiResponse_(response, action) {
    const text = await response.text();

    if (isHtmlResponse_(text)) {
      const error = apiConnectionError_(action, text);
      error.__anautsHtmlResponse = true;
      throw error;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      throw new Error(
        `GAS APIの応答形式が不正です。${action ? ` [${action}]` : ""}`
      );
    }

    return json;
  }

  function orderedApiUrls_() {
    const activeUrl = String(window.__ANAUTS_ACTIVE_API_URL__ || "").trim();
    if (!activeUrl) return apiUrls.slice();
    return [activeUrl].concat(apiUrls.filter(function (url) {
      return url !== activeUrl;
    }));
  }

  function rememberApiUrl_(baseUrl) {
    window.__ANAUTS_ACTIVE_API_URL__ = baseUrl;
    try {
      window.sessionStorage.setItem("anauts_admin_api_url", baseUrl);
    } catch (_) {
      // Safariのプライベートブラウズ等で保存できなくても通信は継続する。
    }
  }

  async function fetchJsonWithTimeout_(url, options, action, timeoutMs) {
    const controller = typeof AbortController === "function"
      ? new AbortController()
      : null;
    const requestOptions = Object.assign({}, options || {});
    let timer = null;

    if (controller) requestOptions.signal = controller.signal;

    const timeout = new Promise(function (_, reject) {
      timer = window.setTimeout(function () {
        const error = new Error(
          `通信が${timeoutMs / 1000}秒以内に完了しませんでした。再試行してください。` +
          (action ? ` [${action}]` : "")
        );
        error.name = "TimeoutError";
        reject(error);
        if (controller) controller.abort();
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        (async function () {
          const response = await fetch(url, requestOptions);
          return parseApiResponse_(response, action);
        })(),
        timeout
      ]);
    } finally {
      if (timer !== null) window.clearTimeout(timer);
    }
  }

  async function fetchJsonWithFallback_(buildRequest, action, settings) {
    const requestSettings = settings || {};
    const timeoutMs = Number(requestSettings.timeoutMs) || API_REQUEST_TIMEOUT_MS;
    const urls = orderedApiUrls_();
    const maxAttempts = Number(requestSettings.maxAttempts) || urls.length;
    let lastError = null;

    for (const baseUrl of urls.slice(0, maxAttempts)) {
      try {
        const request = buildRequest(baseUrl);
        const json = await fetchJsonWithTimeout_(
          request.url,
          request.options || {},
          action,
          timeoutMs
        );
        rememberApiUrl_(baseUrl);
        return json;
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    throw lastError || new Error("GAS APIに接続できません。");
  }

  apiGet = async function (action, params = {}) {
    const json = await fetchJsonWithFallback_(
      function (baseUrl) {
        const url = new URL(baseUrl);
        url.searchParams.set("action", action);

        Object.entries(withAuth(params)).forEach(function ([key, value]) {
          url.searchParams.set(key, value);
        });

        url.searchParams.set("_", Date.now());

        return {
          url: url,
          options: { cache: "no-store" }
        };
      },
      action
    );

    if (!json.ok) {
      throw new Error(json.message || "取得失敗");
    }

    return json;
  };

  apiPost = async function (payload) {
    const action = String(payload && payload.action || "POST");

    const json = await fetchJsonWithFallback_(
      function (baseUrl) {
        return {
          url: baseUrl,
          options: {
            method: "POST",
            headers: {
              "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(withAuth(payload || {}))
          }
        };
      },
      action,
      { timeoutMs: 60000, maxAttempts: 1 }
    );

    if (!json.ok) {
      throw new Error(json.message || "処理失敗");
    }

    return json;
  };
}, { once: true });

(function () {
  var addonSources = [
    "./admin-monthly-v58.js?v=20260829-admin-direct-v3",
    "./admin-tour-enrollment.js?v=20260828-master-draft-v1",
    "./admin-tour-ui-polish.js?v=20260828-event-driven-v1",
    "./admin-auto-reassign-enforce.js?v=20260828-lightweight-v1"
  ];
  var started = false;

  function appendAddon_(source) {
    return new Promise(function (resolve) {
      var script = document.createElement("script");
      var settled = false;
      var timer = null;
      function finish() {
        if (settled) return;
        settled = true;
        if (timer !== null) window.clearTimeout(timer);
        resolve();
      }
      script.src = source;
      script.async = false;
      script.onload = finish;
      script.onerror = finish;
      timer = window.setTimeout(finish, 15000);
      document.body.appendChild(script);
    });
  }

  async function loadAddonsSequentially_() {
    if (started) return;
    started = true;

    for (var i = 0; i < addonSources.length; i += 1) {
      await appendAddon_(addonSources[i]);
      await new Promise(function (resolve) {
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(function () { resolve(); });
        } else {
          window.setTimeout(resolve, 0);
        }
      });
    }
  }

  function startWhenDocumentReady_() {
    if (document.body) {
      loadAddonsSequentially_();
      return;
    }
    document.addEventListener("DOMContentLoaded", loadAddonsSequentially_, { once: true });
  }

  window.addEventListener("anauts:admin-core-ready", startWhenDocumentReady_, { once: true });
  if (window.__ANAUTS_ADMIN_CORE_READY__ === true) startWhenDocumentReady_();
})();
