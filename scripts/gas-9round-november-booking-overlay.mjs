import fs from "node:fs";
import path from "node:path";

// Change the existing live GAS booking implementation only. Other code,
// reservation data, script properties and member records are preserved.
const directory = path.resolve(process.env.ROUND9_LIVE_DIR || ".9round-live");
const candidates = ["Booking.gs", "Booking.js"].filter(name => fs.existsSync(path.join(directory, name)));
if (candidates.length !== 1) throw new Error("Expected one live GAS Booking source file");
const target = path.join(directory, candidates[0]);
let source = fs.readFileSync(target, "utf8");

const oldRange = '  return { from: today, to: Utilities.formatDate(new Date(Date.parse(today + "T00:00:00+09:00") + (config.days - 1) * 86400000), NR_BOOKING.timezone, "yyyy-MM-dd") };';
const newRange = '  return { from: today, to: "2026-11-30" }; // Fixed temporary booking period; after this date from > to.';
const oldHoliday = 'function nrBookingDailySlots_(date, config, context) {\n';
const newHoliday = oldHoliday + '  if (date === "2026-11-01") return []; // Store holiday: no daily workout bookings.\n';

if (source.includes(oldRange) && !source.includes(newRange)) {
  if (source.split(oldRange).length !== 2) throw new Error("Ambiguous live reservation period definition");
  source = source.replace(oldRange, newRange);
} else if (!source.includes(newRange)) {
  throw new Error("Live booking period differs from the expected source; refusing unsafe overwrite");
}
if (!source.includes(newHoliday)) {
  if (source.split(oldHoliday).length !== 2) throw new Error("Live daily slot function differs from expected source");
  source = source.replace(oldHoliday, newHoliday);
}
if (!source.includes(newRange) || !source.includes(newHoliday) ||
    !source.includes('nrBookingRequireDate_(config, body.date)')) {
  throw new Error("GAS booking window verification failed");
}
fs.writeFileSync(target, source);
console.log("Validated November 30 booking period and November 1 store closure; live storage preserved.");
