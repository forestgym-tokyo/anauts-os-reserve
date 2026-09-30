function buildRound9InterviewCandidates_(shiftRows, busyRows, startDate, endDate, limit) {
  const windowStart = round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_START);
  const windowEnd = round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_END);
  const minimum = ROUND9_INTERVIEW_CONFIG.INTERVIEW_MINUTES;
  const shiftsByDate = {};
  const busyByDate = {};

  (shiftRows || []).forEach(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    if (!date || date < startDate || date > endDate) return;
    if (String(row && row.staff_code || "").trim().toUpperCase() !== ROUND9_INTERVIEW_CONFIG.STAFF_CODE) return;
    if (String(row && row.store_code || "").trim().toUpperCase() !== ROUND9_INTERVIEW_CONFIG.STORE_CODE) return;
    if (!isRound9InterviewActive_(row && row.active)) return;

    const start = Math.max(
      windowStart,
      round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.start_time))
    );
    const end = Math.min(
      windowEnd,
      round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.end_time))
    );
    if (!isFinite(start) || !isFinite(end) || end - start < minimum) return;
    if (!shiftsByDate[date]) shiftsByDate[date] = [];
    shiftsByDate[date].push([start, end]);
  });

  (busyRows || []).forEach(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    if (!date || date < startDate || date > endDate) return;
    const start = round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.start_time));
    const end = round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.end_time), true);
    if (!isFinite(start) || !isFinite(end) || end <= start) return;
    if (!busyByDate[date]) busyByDate[date] = [];
    busyByDate[date].push([start, end]);
  });

  const candidates = [];
  Object.keys(shiftsByDate).sort().some(function(date) {
    const free = subtractRound9InterviewIntervals_(
      mergeRound9InterviewIntervals_(shiftsByDate[date]),
      mergeRound9InterviewIntervals_(busyByDate[date] || [])
    ).map(roundRound9InterviewIntervalInward_).filter(function(interval) {
      return interval[1] - interval[0] >= minimum;
    });

    if (!free.length) return false;
    const selected = free.slice().sort(function(a, b) {
      const durationDifference = (b[1] - b[0]) - (a[1] - a[0]);
      return durationDifference || a[0] - b[0];
    })[0];

    candidates.push({
      date: date,
      start_time: round9InterviewMinutesToTime_(selected[0]),
      end_time: round9InterviewMinutesToTime_(selected[1]),
      label:
        formatRound9InterviewDateLabel_(date) + " " +
        round9InterviewMinutesToTime_(selected[0]) + "～" +
        round9InterviewMinutesToTime_(selected[1]),
      available_windows: free.map(function(interval) {
        return {
          start_time: round9InterviewMinutesToTime_(interval[0]),
          end_time: round9InterviewMinutesToTime_(interval[1])
        };
      })
    });

    return candidates.length >= Number(limit || ROUND9_INTERVIEW_CONFIG.CANDIDATE_DAYS);
  });

  return candidates;
}

function assertRound9InterviewCandidatesAvailable_(candidates) {
  const dates = candidates.map(function(row) { return row.date; }).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const shifts = readRound9InterviewShiftRows_(startDate, endDate);
  const busyRows = readRound9InterviewBusyRows_(startDate, endDate);
  const freeByDate = {};

  buildRound9InterviewAllFreeWindows_(shifts, busyRows, startDate, endDate)
    .forEach(function(row) {
      if (!freeByDate[row.date]) freeByDate[row.date] = [];
      freeByDate[row.date].push([
        round9InterviewTimeToMinutes_(row.start_time),
        round9InterviewTimeToMinutes_(row.end_time)
      ]);
    });

  candidates.forEach(function(candidate) {
    const start = round9InterviewTimeToMinutes_(candidate.start_time);
    const end = round9InterviewTimeToMinutes_(candidate.end_time);
    const available = (freeByDate[candidate.date] || []).some(function(interval) {
      return interval[0] <= start && end <= interval[1];
    });
    if (!available) {
      throw new Error(
        formatRound9InterviewDateLabel_(candidate.date) + " " +
        candidate.start_time + "～" + candidate.end_time +
        "は、現在の勤務シフトまたは予定と一致しません。候補を再取得してください。"
      );
    }
  });
}

function buildRound9InterviewAllFreeWindows_(shiftRows, busyRows, startDate, endDate) {
  const output = [];
  const windowStart = round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_START);
  const windowEnd = round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_END);
  const minimum = ROUND9_INTERVIEW_CONFIG.INTERVIEW_MINUTES;
  const shiftsByDate = {};
  const busyByDate = {};

  (shiftRows || []).forEach(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    if (!date || date < startDate || date > endDate) return;
    if (String(row && row.staff_code || "").trim().toUpperCase() !== ROUND9_INTERVIEW_CONFIG.STAFF_CODE) return;
    if (String(row && row.store_code || "").trim().toUpperCase() !== ROUND9_INTERVIEW_CONFIG.STORE_CODE) return;
    if (!isRound9InterviewActive_(row && row.active)) return;
    const start = Math.max(windowStart, round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.start_time)));
    const end = Math.min(windowEnd, round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row.end_time)));
    if (!isFinite(start) || !isFinite(end) || end - start < minimum) return;
    if (!shiftsByDate[date]) shiftsByDate[date] = [];
    shiftsByDate[date].push([start, end]);
  });

  (busyRows || []).forEach(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    const start = round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row && row.start_time));
    const end = round9InterviewTimeToMinutes_(normalizeRound9InterviewTime_(row && row.end_time), true);
    if (!date || !isFinite(start) || !isFinite(end) || end <= start) return;
    if (!busyByDate[date]) busyByDate[date] = [];
    busyByDate[date].push([start, end]);
  });

  Object.keys(shiftsByDate).sort().forEach(function(date) {
    subtractRound9InterviewIntervals_(
      mergeRound9InterviewIntervals_(shiftsByDate[date]),
      mergeRound9InterviewIntervals_(busyByDate[date] || [])
    ).map(roundRound9InterviewIntervalInward_).forEach(function(interval) {
      if (interval[1] - interval[0] < minimum) return;
      output.push({
        date: date,
        start_time: round9InterviewMinutesToTime_(interval[0]),
        end_time: round9InterviewMinutesToTime_(interval[1])
      });
    });
  });

  return output;
}

function mergeRound9InterviewIntervals_(intervals) {
  const sorted = (intervals || []).filter(function(row) {
    return Array.isArray(row) && isFinite(row[0]) && isFinite(row[1]) && row[1] > row[0];
  }).sort(function(a, b) {
    return a[0] - b[0] || a[1] - b[1];
  });
  const merged = [];
  sorted.forEach(function(interval) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) {
      merged.push([interval[0], interval[1]]);
      return;
    }
    last[1] = Math.max(last[1], interval[1]);
  });
  return merged;
}

function subtractRound9InterviewIntervals_(sourceIntervals, busyIntervals) {
  let remaining = (sourceIntervals || []).map(function(row) { return row.slice(); });
  (busyIntervals || []).forEach(function(busy) {
    const next = [];
    remaining.forEach(function(source) {
      if (busy[1] <= source[0] || busy[0] >= source[1]) {
        next.push(source);
        return;
      }
      if (busy[0] > source[0]) next.push([source[0], Math.min(busy[0], source[1])]);
      if (busy[1] < source[1]) next.push([Math.max(busy[1], source[0]), source[1]]);
    });
    remaining = next;
  });
  return remaining;
}

function roundRound9InterviewIntervalInward_(interval) {
  const step = ROUND9_INTERVIEW_CONFIG.SLOT_MINUTES;
  return [
    Math.ceil(Number(interval[0]) / step) * step,
    Math.floor(Number(interval[1]) / step) * step
  ];
}

function readRound9InterviewShiftRows_(startDate, endDate) {
  let rows = [];
  if (typeof readStoreAwareSheet_ === "function") {
    rows = readStoreAwareSheet_("staff_shifts") || [];
  } else {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("staff_shifts");
    if (!sheet || sheet.getLastRow() < 2) return [];
    const values = sheet.getDataRange().getValues();
    const headers = values.shift().map(function(value) { return String(value || "").trim(); });
    rows = values.map(function(valueRow) {
      const record = {};
      headers.forEach(function(header, index) { if (header) record[header] = valueRow[index]; });
      return record;
    });
  }

  return rows.filter(function(row) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    return date >= startDate && date <= endDate;
  });
}

function readRound9InterviewBusyRows_(startDate, endDate) {
  const props = PropertiesService.getScriptProperties();
  const configuredId = String(
    props.getProperty(ROUND9_INTERVIEW_CONFIG.BUSY_CALENDAR_ID_PROPERTY) || ""
  ).trim();
  const calendar = configuredId
    ? CalendarApp.getCalendarById(configuredId)
    : CalendarApp.getDefaultCalendar();
  if (!calendar) throw new Error("面接候補の照合用カレンダーを確認できません。");

  const rangeStart = round9InterviewDateAtMinutes_(startDate, 0);
  const rangeEnd = round9InterviewDateAtMinutes_(addRound9InterviewDays_(endDate, 1), 0);
  const events = calendar.getEvents(rangeStart, rangeEnd) || [];
  const dates = round9InterviewDateRange_(startDate, endDate);
  const rows = [];

  events.forEach(function(event) {
    try {
      if (typeof event.getTransparency === "function") {
        const transparency = String(event.getTransparency() || "").toUpperCase();
        if (transparency.indexOf("TRANSPARENT") >= 0) return;
      }
    } catch (_) {}

    const eventStart = event.getStartTime();
    const eventEnd = event.getEndTime();
    if (!(eventStart instanceof Date) || !(eventEnd instanceof Date) || eventEnd <= eventStart) return;

    dates.forEach(function(date) {
      const dayStart = round9InterviewDateAtMinutes_(date, 0);
      const dayEnd = round9InterviewDateAtMinutes_(addRound9InterviewDays_(date, 1), 0);
      const overlapStart = new Date(Math.max(eventStart.getTime(), dayStart.getTime()));
      const overlapEnd = new Date(Math.min(eventEnd.getTime(), dayEnd.getTime()));
      if (overlapEnd <= overlapStart) return;
      rows.push({
        date: date,
        start_time: overlapStart.getTime() === dayStart.getTime()
          ? "00:00"
          : Utilities.formatDate(overlapStart, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "HH:mm"),
        end_time: overlapEnd.getTime() === dayEnd.getTime()
          ? "24:00"
          : Utilities.formatDate(overlapEnd, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "HH:mm")
      });
    });
  });

  return rows;
}

function normalizeRound9InterviewCandidates_(value) {
  if (!Array.isArray(value) || value.length !== ROUND9_INTERVIEW_CONFIG.CANDIDATE_DAYS) {
    throw new Error("面接候補は4日分すべて入力してください。");
  }
  const today = round9InterviewToday_();
  const seen = {};
  return value.map(function(row, index) {
    const date = normalizeRound9InterviewDate_(row && row.date);
    const start = normalizeRound9InterviewTime_(row && row.start_time);
    const end = normalizeRound9InterviewTime_(row && row.end_time);
    const startMinutes = round9InterviewTimeToMinutes_(start);
    const endMinutes = round9InterviewTimeToMinutes_(end);

    if (!date || date < today) throw new Error("候補" + (index + 1) + "の日付を確認してください。");
    if (seen[date]) throw new Error("面接候補は4つの異なる日付で指定してください。");
    seen[date] = true;
    if (!isFinite(startMinutes) || !isFinite(endMinutes) || endMinutes <= startMinutes) {
      throw new Error("候補" + (index + 1) + "の時間を確認してください。");
    }
    if (
      startMinutes < round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_START) ||
      endMinutes > round9InterviewTimeToMinutes_(ROUND9_INTERVIEW_CONFIG.WINDOW_END)
    ) {
      throw new Error("面接候補は11:00〜20:00の範囲で指定してください。");
    }
    if (endMinutes - startMinutes < ROUND9_INTERVIEW_CONFIG.INTERVIEW_MINUTES) {
      throw new Error("各候補には30分以上の時間を確保してください。");
    }
    return { date: date, start_time: start, end_time: end };
  }).sort(function(a, b) {
    return a.date.localeCompare(b.date);
  });
}

function normalizeRound9InterviewDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "yyyy-MM-dd");
  }
  const text = String(value == null ? "" : value).trim();
  const match = text.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const normalized = [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
    ? normalized
    : "";
}

function normalizeRound9InterviewTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "HH:mm");
  }
  const text = String(value == null ? "" : value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) return "24:00";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function round9InterviewTimeToMinutes_(value, allowEndOfDay) {
  const text = String(value || "");
  if (allowEndOfDay && text === "24:00") return 1440;
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return NaN;
  return hour * 60 + minute;
}

function round9InterviewMinutesToTime_(minutes) {
  const value = Math.max(0, Math.min(1440, Number(minutes)));
  if (value === 1440) return "24:00";
  return String(Math.floor(value / 60)).padStart(2, "0") + ":" +
    String(value % 60).padStart(2, "0");
}

function round9InterviewToday_() {
  return Utilities.formatDate(new Date(), ROUND9_INTERVIEW_CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function addRound9InterviewDays_(date, days) {
  const parts = String(date || "").split("-").map(Number);
  const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return [
    String(parsed.getUTCFullYear()).padStart(4, "0"),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function round9InterviewDateRange_(startDate, endDate) {
  const dates = [];
  let date = startDate;
  let guard = 0;
  while (date <= endDate && guard < 370) {
    dates.push(date);
    date = addRound9InterviewDays_(date, 1);
    guard += 1;
  }
  return dates;
}

function round9InterviewDateAtMinutes_(date, minutes) {
  const value = Number(minutes || 0);
  const base = Utilities.parseDate(date, ROUND9_INTERVIEW_CONFIG.TIMEZONE, "yyyy-MM-dd");
  return new Date(base.getTime() + value * 60000);
}

function formatRound9InterviewDateLabel_(date) {
  const parts = String(date || "").split("-").map(Number);
  const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return parts[1] + "月" + parts[2] + "日" +
    "（" + weekdays[parsed.getUTCDay()] + "）";
}

function normalizeRound9InterviewName_(value) {
  return String(value == null ? "" : value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\s　]+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeRound9InterviewEmail_(value) {
  return String(value == null ? "" : value).trim().toLowerCase().slice(0, 254);
}

function isRound9InterviewEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function normalizeRound9InterviewRequestId_(value) {
  const text = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{12,100}$/.test(text)) return text;
  return Utilities.getUuid().replace(/-/g, "");
}

function isRound9InterviewActive_(value) {
  if (value === false) return false;
  const text = String(value == null ? "TRUE" : value).trim().toUpperCase();
  return !["FALSE", "0", "NO", "OFF", "INACTIVE"].includes(text);
}
