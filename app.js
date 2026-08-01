const API_URL = "https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
const SERVICE_CODE = "PT60";

const el = {
  dateInput: document.querySelector("#dateInput"),
  loadSlotsButton: document.querySelector("#loadSlotsButton"),
  slotStatus: document.querySelector("#slotStatus"),
  slotList: document.querySelector("#slotList"),
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

let selectedSlot = null;

const today = new Date();
el.dateInput.min = formatDateForInput(today);
el.dateInput.value = formatDateForInput(today);
el.loadSlotsButton.addEventListener("click", loadAvailableSlots);
el.reservationForm.addEventListener("submit", submitReservation);
el.newReservationButton.addEventListener("click", resetPage);

async function loadAvailableSlots() {
  resetSlotSelection();
  setSlotStatus("空き時間を確認しています…");
  el.loadSlotsButton.disabled = true;

  try {
    const date = el.dateInput.value;
    if (!date) throw new Error("予約日を選択してください。");

    const url = new URL(API_URL);
    url.searchParams.set("action", "getAvailableSlots");
    url.searchParams.set("service_code", SERVICE_CODE);
    url.searchParams.set("date", date);
    url.searchParams.set("_", Date.now());

    const response = await fetch(url, { cache: "no-store" });
    const result = await response.json();

    if (!result.ok) throw new Error(result.message || "空き時間を取得できませんでした。");

    const slots = Array.isArray(result.data?.slots) ? result.data.slots : [];
    if (!slots.length) {
      setSlotStatus("この日に予約可能な時間はありません。");
      return;
    }

    renderSlots(slots);
    setSlotStatus(`${slots.length}件の空き時間があります。`);
  } catch (error) {
    setSlotStatus(error.message || "空き時間の取得に失敗しました。", true);
  } finally {
    el.loadSlotsButton.disabled = false;
  }
}

function renderSlots(slots) {
  el.slotList.replaceChildren();

  for (const slot of slots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-button";
    button.textContent = slot.start_time;

    button.addEventListener("click", () => {
      document.querySelectorAll(".slot-button").forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      selectedSlot = slot;
      el.selectedSlotText.textContent = `${formatJapaneseDate(slot.date)} ${slot.start_time}〜${slot.end_time}`;
      el.customerSection.classList.remove("is-hidden");
      el.customerSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    el.slotList.append(button);
  }
}

async function submitReservation(event) {
  event.preventDefault();
  hideFormError();

  if (!selectedSlot) return showFormError("予約時間を選択してください。");

  const memberNo = el.memberNo.value.trim();
  const customerEmail = el.customerEmail.value.trim();
  const customerPhone = el.customerPhone.value.trim();
  const note = el.note.value.trim();

  if (!memberNo) return showFormError("会員番号を入力してください。");
  if (!customerEmail) return showFormError("登録メールアドレスを入力してください。");

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
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!result.ok) throw new Error(toUserMessage(result));

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
    SLOT_NOT_AVAILABLE: "選択した時間は埋まりました。空き時間を再取得してください。",
    BOOKING_DEADLINE_PASSED: "この時間は予約受付期限を過ぎています。",
    DATE_OUT_OF_PUBLIC_RANGE: "この日付は予約公開期間外です。",
    NO_WORKING_STAFF: "この時間に対応可能なトレーナーがいません。"
  };
  return messages[result.code] || result.message || "予約登録に失敗しました。";
}

function showComplete(data) {
  el.customerSection.classList.add("is-hidden");
  el.completeSection.classList.remove("is-hidden");
  el.completeSummary.textContent = `${formatJapaneseDate(data.date)} ${data.start_time}〜${data.end_time} パーソナルトレーニング60分`;
  el.reservationId.textContent = data.reservation_id || "—";
  el.completeSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetPage() {
  selectedSlot = null;
  el.reservationForm.reset();
  el.slotList.replaceChildren();
  el.customerSection.classList.add("is-hidden");
  el.completeSection.classList.add("is-hidden");
  setSlotStatus("");
}

function resetSlotSelection() {
  selectedSlot = null;
  el.slotList.replaceChildren();
  el.customerSection.classList.add("is-hidden");
  el.completeSection.classList.add("is-hidden");
  hideFormError();
}

function setSlotStatus(message, isError = false) {
  el.slotStatus.textContent = message;
  el.slotStatus.style.color = isError ? "var(--danger)" : "";
}

function showFormError(message) {
  el.formError.textContent = message;
  el.formError.classList.remove("is-hidden");
}

function hideFormError() {
  el.formError.textContent = "";
  el.formError.classList.add("is-hidden");
}

function formatDateForInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatJapaneseDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${y}年${m}月${d}日（${weekdays[date.getDay()]}）`;
}
