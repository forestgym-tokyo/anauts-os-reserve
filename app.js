const API_URL = "https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
const SERVICE_CODE = "PT60";
const DAYS_PER_PAGE = 7;

const el = {
  prevWeekButton: document.querySelector("#prevWeekButton"),
  nextWeekButton: document.querySelector("#nextWeekButton"),
  reloadButton: document.querySelector("#reloadButton"),
  weekRange: document.querySelector("#weekRange"),
  weekStatus: document.querySelector("#weekStatus"),
  weekList: document.querySelector("#weekList"),
  customerSection: document.querySelector("#customerSection"),
  selectedSlotText: document.querySelector("#selectedSlotText"),
  reservationForm: document.querySelector("#reservationForm"),
  memberNo: document.querySelector("#memberNo"),
  customerEmail: document.querySelector("#customerEmail"),
  customerPhone: document.querySelector("#customerPhone"),
  note: document.querySelector("#note"),
  formError: document.querySelector("#formError"),
  submitButton: document.querySelector("#submitButton"),
  completeSection: document.querySelector("#completeSection"),
  completeSummary: document.querySelector("#completeSummary"),
  reservationId: document.querySelector("#reservationId"),
  newReservationButton: document.querySelector("#newReservationButton")
};

const today = startOfDay(new Date());
let weekStart = new Date(today);
let selectedSlot = null;
let publicDays = 30;
let isLoading = false;

el.prevWeekButton.addEventListener("click", () => changeWeek(-7));
el.nextWeekButton.addEventListener("click", () => changeWeek(7));
el.reloadButton.addEventListener("click", loadWeek);
el.reservationForm.addEventListener("submit", submitReservation);
el.newReservationButton.addEventListener("click", resetPage);

loadWeek();

async function loadWeek() {
  if (isLoading) return;

  isLoading = true;
  resetSlotSelection();
  setWeekStatus("7日分の空き時間を確認しています…");
  renderLoadingRows();
  updateWeekNavigation();

  try {
    const dates = Array.from({ length: DAYS_PER_PAGE }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      return formatDateForApi(date);
    });

    const results = await Promise.all(
      dates.map((date) => fetchAvailability(date))
    );

    const firstSuccessful = results.find((result) => result.ok && result.data);
    if (firstSuccessful?.data?.public_days !== undefined) {
      publicDays = Number(firstSuccessful.data.public_days) || 30;
    }

    renderWeek(results);
    updateWeekNavigation();

    const totalSlots = results.reduce((sum, result) => {
      return sum + (Array.isArray(result.data?.slots) ? result.data.slots.length : 0);
    }, 0);

    setWeekStatus(
      totalSlots > 0
        ? `この7日間に${totalSlots}件の空き時間があります。`
        : "この7日間に予約可能な時間はありません。"
    );
  } catch (error) {
    el.weekList.replaceChildren();
    setWeekStatus(error.message || "空き時間の取得に失敗しました。", true);
  } finally {
    isLoading = false;
    updateWeekNavigation();
  }
}

async function fetchAvailability(date) {
  const url = new URL(API_URL);
  url.searchParams.set("action", "getAvailableSlots");
  url.searchParams.set("service_code", SERVICE_CODE);
  url.searchParams.set("date", date);
  url.searchParams.set("_", Date.now().toString());

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`通信エラー（${response.status}）`);
    }

    return await response.json();
  } catch (error) {
    return {
      ok: false,
      message: error.message || "取得失敗",
      data: { date, slots: [] }
    };
  }
}

function renderWeek(results) {
  el.weekList.replaceChildren();

  results.forEach((result, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);

    const row = document.createElement("section");
    row.className = "day-row";

    if (isSameDate(date, today)) {
      row.classList.add("is-today");
    }

    const label = document.createElement("div");
    label.className = "day-label";

    const main = document.createElement("strong");
    main.textContent = formatShortDate(date);

    const sub = document.createElement("span");
    sub.textContent = isSameDate(date, today) ? "本日" : formatWeekday(date);

    label.append(main, sub);

    const slotArea = document.createElement("div");
    slotArea.className = "day-slots";

    const slots = Array.isArray(result.data?.slots) ? result.data.slots : [];

    if (!result.ok) {
      const message = document.createElement("p");
      message.className = "no-slots";
      message.textContent = result.message || "取得できませんでした";
      slotArea.append(message);
    } else if (slots.length === 0) {
      const message = document.createElement("p");
      message.className = "no-slots";
      message.textContent = "空きなし";
      slotArea.append(message);
    } else {
      slots.forEach((slot) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "slot-button";
        button.textContent = slot.start_time;
        button.dataset.slotKey = `${slot.date}-${slot.start_time}`;

        button.addEventListener("click", () => selectSlot(slot, button));
        slotArea.append(button);
      });
    }

    row.append(label, slotArea);
    el.weekList.append(row);
  });

  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 6);
  el.weekRange.textContent = `${formatRangeDate(weekStart)}〜${formatRangeDate(endDate)}`;
}

function selectSlot(slot, button) {
  document.querySelectorAll(".slot-button").forEach((item) => {
    item.classList.remove("is-selected");
  });

  button.classList.add("is-selected");
  selectedSlot = slot;

  el.selectedSlotText.textContent =
    `${formatJapaneseDate(slot.date)} ${slot.start_time}〜${slot.end_time}`;

  el.customerSection.classList.remove("is-hidden");
  el.completeSection.classList.add("is-hidden");

  el.customerSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function changeWeek(days) {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + days);

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + publicDays);

  if (next < today) {
    weekStart = new Date(today);
  } else if (next <= maxDate) {
    weekStart = next;
  }

  loadWeek();
}

function updateWeekNavigation() {
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + publicDays);

  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  el.prevWeekButton.disabled = isLoading || weekStart <= today;
  el.nextWeekButton.disabled = isLoading || nextWeekStart > maxDate;
  el.reloadButton.disabled = isLoading;
}

function renderLoadingRows() {
  el.weekList.replaceChildren();

  for (let index = 0; index < DAYS_PER_PAGE; index++) {
    const row = document.createElement("div");
    row.className = "day-row";

    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);

    const label = document.createElement("div");
    label.className = "day-label";
    label.innerHTML = `<strong>${formatShortDate(date)}</strong><span>${formatWeekday(date)}</span>`;

    const loading = document.createElement("div");
    loading.className = "loading-line";

    row.append(label, loading);
    el.weekList.append(row);
  }

  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 6);
  el.weekRange.textContent = `${formatRangeDate(weekStart)}〜${formatRangeDate(endDate)}`;
}

async function submitReservation(event) {
  event.preventDefault();
  hideFormError();

  if (!selectedSlot) {
    showFormError("予約時間を選択してください。");
    return;
  }

  const memberNo = el.memberNo.value.trim();
  const customerEmail = el.customerEmail.value.trim();
  const customerPhone = el.customerPhone.value.trim();
  const note = el.note.value.trim();

  if (!memberNo) {
    showFormError("会員番号を入力してください。");
    el.memberNo.focus();
    return;
  }

  if (!customerEmail) {
    showFormError("登録メールアドレスを入力してください。");
    el.customerEmail.focus();
    return;
  }

  el.submitButton.disabled = true;
  el.submitButton.textContent = "予約処理中…";

  try {
    const payload = {
      action: "createReservation",
      service_code: SERVICE_CODE,
      date: selectedSlot.date,
      start_time: selectedSlot.start_time,
      customer_type: "MEMBER",
      member_no: memberNo,
      customer_name: "会員照合中",
      customer_email: customerEmail,
      customer_phone: customerPhone,
      note
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`通信エラー（${response.status}）`);
    }

    const result = await response.json();

    if (!result.ok) {
      throw new Error(toUserMessage(result));
    }

    showComplete(result.data);
  } catch (error) {
    showFormError(error.message || "予約登録に失敗しました。");
  } finally {
    el.submitButton.disabled = false;
    el.submitButton.textContent = "この内容で予約する";
  }
}

function toUserMessage(result) {
  const messages = {
    MEMBER_NOT_FOUND: "会員番号が確認できません。",
    MEMBER_EMAIL_MISMATCH: "会員番号と登録メールアドレスが一致しません。",
    MEMBER_INACTIVE: "現在有効な会員番号ではありません。",
    SLOT_NOT_AVAILABLE: "選択した時間は他の予約で埋まりました。空き状況を更新してください。",
    BOOKING_DEADLINE_PASSED: "この時間は予約受付期限を過ぎています。",
    DATE_OUT_OF_PUBLIC_RANGE: "この日付は予約公開期間外です。",
    NO_WORKING_STAFF: "この時間に対応可能なトレーナーがいません。"
  };

  return messages[result.code] || result.message || "予約登録に失敗しました。";
}

function showComplete(data) {
  el.customerSection.classList.add("is-hidden");
  el.completeSection.classList.remove("is-hidden");

  el.completeSummary.textContent =
    `${formatJapaneseDate(data.date)} ${data.start_time}〜${data.end_time} ` +
    "パーソナルトレーニング";

  el.reservationId.textContent = data.reservation_id || "—";

  el.completeSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function resetPage() {
  selectedSlot = null;
  el.reservationForm.reset();
  el.customerSection.classList.add("is-hidden");
  el.completeSection.classList.add("is-hidden");
  hideFormError();
  loadWeek();
}

function resetSlotSelection() {
  selectedSlot = null;
  el.customerSection.classList.add("is-hidden");
  el.completeSection.classList.add("is-hidden");
  hideFormError();
}

function setWeekStatus(message, isError = false) {
  el.weekStatus.textContent = message;
  el.weekStatus.style.color = isError ? "var(--danger)" : "";
}

function showFormError(message) {
  el.formError.textContent = message;
  el.formError.classList.remove("is-hidden");
}

function hideFormError() {
  el.formError.textContent = "";
  el.formError.classList.add("is-hidden");
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDate(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDateForApi(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatRangeDate(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatWeekday(date) {
  return `（${["日", "月", "火", "水", "木", "金", "土"][date.getDay()]}）`;
}

function formatJapaneseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  return `${year}年${month}月${day}日（${weekdays[date.getDay()]}）`;
}
