(function (root) {
  "use strict";
  const plans = Object.freeze([
    Object.freeze({ id: "PREMIUM_ONE", name: "プレミアムOne", english: "PREMIUM ONE", monthly: 6160, initial: 0, gloves: 0, months: 12, discount: 20, campaign: true }),
    Object.freeze({ id: "PREMIUM_HALF", name: "プレミアムHalf", english: "PREMIUM HALF", monthly: 6930, initial: 0, gloves: 3300, months: 6, discount: 10, campaign: true }),
    Object.freeze({ id: "REGULAR", name: "通常", english: "REGULAR", monthly: 7700, initial: 8800, gloves: 11000, months: 0, discount: 0, campaign: false }),
    Object.freeze({ id: "FAMILY_PAIR", name: "ファミリー・ペア", english: "FAMILY / PAIR", monthly: 6600, initial: 8800, gloves: 11000, months: 0, discount: 0, campaign: false })
  ]);
  const offer = Object.freeze({ id: "ROUND9_2026_10", lastDate: "2026-10-31", campaignLimit: 30, campaignPlans: Object.freeze(["PREMIUM_ONE", "PREMIUM_HALF"]) });
  function getPlan(id) { return plans.find(function (p) { return p.id === id; }) || null; }
  function today() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    return ["year", "month", "day"].map(function (key) { return parts.find(function (p) { return p.type === key; }).value; }).join("-");
  }
  function isDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + "T00:00:00Z")) && new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date; }
  function validStart(date, current) { return isDate(date) && date >= current && date <= offer.lastDate; }
  function yen(value) { return new Intl.NumberFormat("ja-JP").format(value) + "円"; }
  const api = Object.freeze({ plans: plans, offer: offer, getPlan: getPlan, today: today, isDate: isDate, validStart: validStart, yen: yen });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NineRoundMembershipPlans = api;
})(typeof window !== "undefined" ? window : this);
