(function () {
  "use strict";
  const workoutEndDate = "2026-10-24";
  window.NineRoundWorkoutEndDate = workoutEndDate;
  function responseData(result, action) {
    if (!result || !result.ok) {
      const error = new Error(result && result.message || "処理を完了できませんでした。");
      error.code = result && result.code;
      throw error;
    }
    const data = result.data;
    if (data && data.range && ["get9RoundWorkoutSlots", "get9RoundMailBooking", "get9RoundManagedBooking"].includes(action)) {
      data.range.to = data.range.to && data.range.to < workoutEndDate ? data.range.to : workoutEndDate;
      if (data.booking && data.range.from > data.range.to) data.booking.can_change = false;
    }
    return data;
  }
  window.NineRoundBookingApi = async function (action, payload) {
    const config = window.ANAUTS_ROUND9_BOOKING || {};
    if (!config.apiUrl) {
      const error = new Error("現在、予約受付の準備中です。");
      error.code = "BOOKING_DISABLED";
      throw error;
    }
    if (typeof google !== "undefined" && google.script && google.script.run) {
      return new Promise(function (resolve, reject) {
        const timer = setTimeout(function () {
          reject(new Error("通信結果を確認できませんでした。予約操作後の場合は、空き枠を再読込して予約状況をご確認ください。"));
        }, config.requestTimeoutMs || 30000);
        google.script.run.withSuccessHandler(function (result) {
          clearTimeout(timer);
          try { resolve(responseData(result, action)); } catch (error) { reject(error); }
        }).withFailureHandler(function () {
          clearTimeout(timer); reject(new Error("予約システムに接続できませんでした。"));
        }).nineRoundBookingRequest(Object.assign({}, payload, { action: action }));
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, config.requestTimeoutMs || 30000);
    try {
      const response = await fetch(config.apiUrl, {
        method: "POST", cache: "no-store", credentials: "omit", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({}, payload, { action: action })), signal: controller.signal
      });
      if (!response.ok) throw new Error("通信できませんでした。時間をあけて再度お試しください。");
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch (_) { throw new Error("予約システムに接続できませんでした。"); }
      return responseData(result, action);
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("通信結果を確認できませんでした。予約操作後の場合は、空き枠を再読込して予約状況をご確認ください。");
      }
      if (error.name === "TypeError") {
        throw new Error("インターネット接続を確認して、もう一度お試しください。");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  window.NineRoundTokyoDate = function () {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const get = function (type) { return parts.find(function (p) { return p.type === type; }).value; };
    return get("year") + "-" + get("month") + "-" + get("day");
  };
})();

