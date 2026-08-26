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

  const apiUrls = Array.from(
    new Set(
      [
        String(window.ANAUTS_API_URL || "").trim(),
        primaryUrl,
        workspaceUrl
      ].filter(Boolean)
    )
  );

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

  async function fetchJsonWithFallback_(buildRequest, action) {
    let lastError = null;

    for (const baseUrl of apiUrls) {
      try {
        const request = buildRequest(baseUrl);
        const response = await fetch(request.url, request.options || {});
        const json = await parseApiResponse_(response, action);
        window.__ANAUTS_ACTIVE_API_URL__ = baseUrl;
        return json;
      } catch (error) {
        lastError = error;

        /*
         * JSONとして返ってきた業務エラーはparse後に処理するためここには来ない。
         * HTML応答・通信失敗のみ次候補URLを試す。
         */
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
          options: {
            cache: "no-store"
          }
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
      action
    );

    if (!json.ok) {
      throw new Error(json.message || "処理失敗");
    }

    return json;
  };
}, { once: true });

window.addEventListener("load", function () {
  var monthly = document.createElement("script");
  monthly.src = "./admin-monthly-v58.js?v=20260825-1556";
  document.body.appendChild(monthly);

  var enrollment = document.createElement("script");
  enrollment.src = "./admin-tour-enrollment.js?v=20260825-1045";
  document.body.appendChild(enrollment);

  var startDateFix = document.createElement("script");
  startDateFix.src = "./admin-tour-startdate-fix.js?v=20260825-1440";
  document.body.appendChild(startDateFix);

  var polish = document.createElement("script");
  polish.src = "./admin-tour-ui-polish.js?v=20260825-1045";
  document.body.appendChild(polish);

  var questionnaireFix = document.createElement("script");
  questionnaireFix.src = "./admin-questionnaire-fix.js?v=20260825-1158";
  document.body.appendChild(questionnaireFix);

  var eventCalendar = document.createElement("script");
  eventCalendar.src = "./admin-event-calendar.js?v=20260825-2047";
  document.body.appendChild(eventCalendar);

  var withdrawalLink = document.createElement("script");
  withdrawalLink.src = "./admin-withdrawal-link.js?v=20260825-2103";
  document.body.appendChild(withdrawalLink);

  var calendarLayout = document.createElement("script");
  calendarLayout.src = "./admin-ui-calendar-layout.js?v=20260825-2125";
  document.body.appendChild(calendarLayout);

  var dailyReport = document.createElement("script");
  dailyReport.src = "./admin-daily-report.js?v=20260825-2142";
  document.body.appendChild(dailyReport);

  var operationsCenter = document.createElement("script");
  operationsCenter.src = "./admin-operations-center.js?v=20260826-top-snapshot-v1";
  document.body.appendChild(operationsCenter);

  var operationsRefreshFix = document.createElement("script");
  operationsRefreshFix.src = "./admin-operations-refresh-fix.js?v=20260826-1040";
  document.body.appendChild(operationsRefreshFix);

  var internalReservationBridge = document.createElement("script");
  internalReservationBridge.src = "./admin-reservation-internal-bridge.js?v=20260826-1055";
  document.body.appendChild(internalReservationBridge);

  var autoReassign = document.createElement("script");
  autoReassign.src = "./admin-auto-reassign-enforce.js?v=20260826-safe-batch-v2";
  document.body.appendChild(autoReassign);

  var withdrawalButtonColor = document.createElement("script");
  withdrawalButtonColor.src = "./admin-withdrawal-button-color.js?v=20260826-1258";
  document.body.appendChild(withdrawalButtonColor);

});
