/* A-nauts OS Reserve - Personal / trial booking cutoff
 * Booking rule: reservations are accepted through the day before the reservation date.
 * Same-day slots are hidden in Japan time. Other routes are untouched.
 */
(() => {
  const routeKey = location.pathname.split("/").filter(Boolean).pop() || "personal";
  if (!["personal", "trial"].includes(routeKey)) return;

  const nativeFetch = window.fetch.bind(window);

  function japanToday_() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const values = {};
    parts.forEach((part) => {
      if (part.type !== "literal") values[part.type] = part.value;
    });

    return `${values.year}-${values.month}-${values.day}`;
  }

  function removeSameDaySlots_(dayData, today) {
    if (!dayData || typeof dayData !== "object") return;

    const date = String(dayData.date || "").trim();
    if (!date || date > today) return;

    if (Array.isArray(dayData.slots)) dayData.slots = [];
    if (Object.prototype.hasOwnProperty.call(dayData, "available_slot_count")) {
      dayData.available_slot_count = 0;
    }
  }

  function applyCutoff_(payload) {
    if (!payload || payload.ok !== true || !payload.data) return payload;

    const today = japanToday_();
    const data = payload.data;

    if (Array.isArray(data.results)) {
      data.results.forEach((result) => {
        if (result && result.ok === true && result.data) {
          removeSameDaySlots_(result.data, today);
        }
      });
    } else {
      removeSameDaySlots_(data, today);
    }

    return payload;
  }

  window.fetch = async function personalBookingCutoffFetch(input, init) {
    const response = await nativeFetch(input, init);

    let requestUrl = "";
    try {
      requestUrl = typeof input === "string"
        ? input
        : (input && input.url) || "";
      const parsed = new URL(requestUrl, location.href);
      const action = String(parsed.searchParams.get("action") || "");
      if (!["getAvailableSlots", "getAvailableSlotsRange"].includes(action)) {
        return response;
      }
    } catch (_) {
      return response;
    }

    try {
      const payload = await response.clone().json();
      applyCutoff_(payload);

      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    } catch (_) {
      return response;
    }
  };
})();
