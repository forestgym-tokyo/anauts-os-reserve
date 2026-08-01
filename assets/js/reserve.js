const API_URL = "https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
const DAYS = 7;

const ROUTES = {
  personal: {
    title: "パーソナルトレーニング予約",
    lead: "プランを選択し、7日分の空き時間からご希望の日時をお選びください。",
    mode: "GROUP",
    category: "PERSONAL",
    exclude: ["PT60", "PT_TRIAL60"]
  },
  trial: {
    title: "パーソナル無料体験",
    lead: "対象会員専用の予約ページです。",
    mode: "FIXED",
    serviceCode: "PT_TRIAL60"
  },
  tour: {
    title: "店内見学",
    lead: "7日分の空き時間からご希望の日時をお選びください。",
    mode: "FIXED",
    serviceCode: "TOUR"
  },
  counsel: {
    title: "ダイエットカウンセリング",
    lead: "会員・非会員どちらもご予約いただけます。",
    mode: "FIXED",
    serviceCode: "COUNSEL"
  },
  procedure: {
    title: "各種手続き",
    lead: "会員向け手続きのご来店予約です。",
    mode: "FIXED",
    serviceCode: "PROCEDURE"
  },
  "meal-planning": {
    title: "Meal Planning",
    lead: "Meal Planningのご予約です。",
    mode: "FIXED",
    serviceCode: "MEAL_PLANNING"
  },
  unsubscribe: {
    title: "退会手続き",
    lead: "退会手続きのご来店予約です。",
    mode: "FIXED",
    serviceCode: "UNSUBSCRIBE"
  }
};

const el = {
  pageTitle: document.querySelector("#pageTitle"),
  pageLead: document.querySelector("#pageLead"),
  serviceSection: document.querySelector("#serviceSection"),
  serviceGrid: document.querySelector("#serviceGrid"),
  availabilitySection: document.querySelector("#availabilitySection"),
  availabilityStep: document.querySelector("#availabilityStep"),
  prevWeekButton: document.querySelector("#prevWeekButton"),
  nextWeekButton: document.querySelector("#nextWeekButton"),
  reloadButton: document.querySelector("#reloadButton"),
  weekRange: document.querySelector("#weekRange"),
  weekStatus: document.querySelector("#weekStatus"),
  weekList: document.querySelector("#weekList"),
  customerSection: document.querySelector("#customerSection"),
  customerStep: document.querySelector("#customerStep"),
  selectedSlotText: document.querySelector("#selectedSlotText"),
  reservationForm: document.querySelector("#reservationForm"),
  customerTypeField: document.querySelector("#customerTypeField"),
  memberNoField: document.querySelector("#memberNoField"),
  nameField: document.querySelector("#nameField"),
  phoneField: document.querySelector("#phoneField"),
  postalField: document.querySelector("#postalField"),
  addressField: document.querySelector("#addressField"),
  memberNo: document.querySelector("#memberNo"),
  customerName: document.querySelector("#customerName"),
  customerEmail: document.querySelector("#customerEmail"),
  customerPhone: document.querySelector("#customerPhone"),
  postalCode: document.querySelector("#postalCode"),
  address: document.querySelector("#address"),
  note: document.querySelector("#note"),
  formError: document.querySelector("#formError"),
  submitButton: document.querySelector("#submitButton"),
  completeSection: document.querySelector("#completeSection"),
  completeSummary: document.querySelector("#completeSummary"),
  reservationId: document.querySelector("#reservationId"),
  newReservationButton: document.querySelector("#newReservationButton"),
  fatalErrorSection: document.querySelector("#fatalErrorSection"),
  fatalError: document.querySelector("#fatalError")
};

let route = null;
let services = [];
let selectedService = null;
let selectedSlot = null;
const today = startOfDay(new Date());
let weekStart = new Date(today);
let publicDays = 30;
let loading = false;

init();

async function init() {
  const key = location.pathname.split("/").filter(Boolean).pop() || "personal";
  route = ROUTES[key];

  if (!route) {
    showFatal("この予約URLは存在しません。");
    return;
  }

  el.pageTitle.textContent = route.title;
  el.pageLead.textContent = route.lead;

  try {
    services = await fetchServices();

    if (route.mode === "GROUP") {
      const candidates = services.filter((service) => {
        const category = String(service.category || "").toUpperCase();
        const code = String(service.service_code || "");
        return category === route.category &&
          !route.exclude.includes(code) &&
          isEnabled(service);
      });

      if (!candidates.length) {
        showFatal("表示できるパーソナルサービスがありません。servicesシートを確認してください。");
        return;
      }

      renderServiceCards(candidates);
      el.serviceSection.classList.remove("is-hidden");
      el.availabilityStep.textContent = "2";
      el.customerStep.textContent = "3";
    } else {
      selectedService = services.find((service) =>
        String(service.service_code || "") === route.serviceCode &&
        isEnabled(service)
      );

      if (!selectedService) {
        showFatal(`サービス ${route.serviceCode} が未登録または非公開です。`);
        return;
      }

      el.availabilityStep.textContent = "1";
      el.customerStep.textContent = "2";
      configureCustomerForm();
      el.availabilitySection.classList.remove("is-hidden");
      loadWeek();
    }
  } catch (error) {
    showFatal(error.message || "サービス情報を取得できませんでした。");
  }
}

async function fetchServices() {
  const url = new URL(API_URL);
  url.searchParams.set("action", "getServices");
  url.searchParams.set("_", Date.now().toString());

  const response = await fetch(url.toString(), { cache: "no-store" });
  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.message || "サービス情報を取得できませんでした。");
  }

  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result.data?.services)) return result.data.services;

  throw new Error("getServicesのレスポンス形式を確認してください。");
}

function isEnabled(service) {
  const active = service.active === true || String(service.active).toUpperCase() === "TRUE";
  const isPublic = service.public === true || String(service.public).toUpperCase() === "TRUE";
  return active && isPublic;
}

function renderServiceCards(list) {
  el.serviceGrid.replaceChildren();

  list.forEach((service) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "service-card";
    button.innerHTML =
      `${escapeHtml(service.service_name || service.service_code)}` +
      `<small>${Number(service.duration) || ""}分</small>`;

    button.addEventListener("click", () => {
      document.querySelectorAll(".service-card").forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");

      selectedService = service;
      selectedSlot = null;
      weekStart = new Date(today);

      configureCustomerForm();
      el.availabilitySection.classList.remove("is-hidden");
      el.customerSection.classList.add("is-hidden");
      el.completeSection.classList.add("is-hidden");

      loadWeek();
      el.availabilitySection.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    el.serviceGrid.append(button);
  });
}

function configureCustomerForm() {
  const formType = String(selectedService?.form_type || "").toUpperCase();
  const code = String(selectedService?.service_code || "");

  el.customerTypeField.classList.toggle("is-hidden", formType !== "BOTH");
  el.memberNoField.classList.toggle("is-hidden", formType === "VISITOR");
  el.nameField.classList.toggle("is-hidden", formType === "MEMBER");

  const needsAddress = ["TOUR", "COUNSEL"].includes(code);
  el.postalField.classList.toggle("is-hidden", !needsAddress);
  el.addressField.classList.toggle("is-hidden", !needsAddress);

  document.querySelectorAll('input[name="customer_type"]').forEach((radio) => {
    radio.onchange = () => {
      el.memberNoField.classList.toggle("is-hidden", radio.value !== "MEMBER");
      el.nameField.classList.toggle("is-hidden", radio.value !== "VISITOR");
    };
  });
}

el.prevWeekButton.addEventListener("click", () => changeWeek(-7));
el.nextWeekButton.addEventListener("click", () => changeWeek(7));
el.reloadButton.addEventListener("click", loadWeek);
el.reservationForm.addEventListener("submit", submitReservation);
el.newReservationButton.addEventListener("click", () => {
  el.completeSection.classList.add("is-hidden");
  selectedSlot = null;
  loadWeek();
});

async function loadWeek() {
  if (!selectedService || loading) return;

  loading = true;
  selectedSlot = null;
  el.customerSection.classList.add("is-hidden");
  el.completeSection.classList.add("is-hidden");
  el.weekStatus.textContent = "7日分の空き時間を確認しています…";
  updateNav();

  const dates = Array.from({ length: DAYS }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return apiDate(date);
  });

  try {
    const results = await Promise.all(dates.map(fetchSlots));
    const first = results.find((result) => result.ok && result.data);

    if (first?.data?.public_days !== undefined) {
      publicDays = Number(first.data.public_days) || 30;
    }

    renderWeek(results);

    const total = results.reduce((sum, result) =>
      sum + (Array.isArray(result.data?.slots) ? result.data.slots.length : 0), 0
    );

    el.weekStatus.textContent = total
      ? `この7日間に${total}件の空きがあります。`
      : "この7日間に空きはありません。";
  } catch (error) {
    el.weekStatus.textContent = error.message || "空き時間の取得に失敗しました。";
  } finally {
    loading = false;
    updateNav();
  }
}

async function fetchSlots(date) {
  const url = new URL(API_URL);
  url.searchParams.set("action", "getAvailableSlots");
  url.searchParams.set("service_code", selectedService.service_code);
  url.searchParams.set("date", date);
  url.searchParams.set("_", Date.now().toString());

  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    return await response.json();
  } catch (error) {
    return { ok: false, message: error.message, data: { date, slots: [] } };
  }
}

function renderWeek(results) {
  el.weekList.replaceChildren();

  results.forEach((result, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);

    const row = document.createElement("section");
    row.className = "day-row";

    const label = document.createElement("div");
    label.className = "day-label";
    label.innerHTML =
      `<strong>${date.getMonth() + 1}/${date.getDate()}</strong>` +
      `<span>（${["日","月","火","水","木","金","土"][date.getDay()]}）</span>`;

    const area = document.createElement("div");
    area.className = "day-slots";

    const slots = Array.isArray(result.data?.slots) ? result.data.slots : [];

    if (!result.ok || !slots.length) {
      const p = document.createElement("p");
      p.className = "no-slots";
      p.textContent = result.ok ? "空きなし" : (result.message || "取得失敗");
      area.append(p);
    } else {
      slots.forEach((slot) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "slot-button";
        button.textContent = slot.start_time;
        button.addEventListener("click", () => selectSlot(slot, button));
        area.append(button);
      });
    }

    row.append(label, area);
    el.weekList.append(row);
  });

  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  el.weekRange.textContent =
    `${weekStart.getMonth() + 1}月${weekStart.getDate()}日〜` +
    `${end.getMonth() + 1}月${end.getDate()}日`;
}

function selectSlot(slot, button) {
  document.querySelectorAll(".slot-button").forEach((item) => item.classList.remove("is-selected"));
  button.classList.add("is-selected");
  selectedSlot = slot;

  el.selectedSlotText.textContent =
    `${jpDate(slot.date)} ${slot.start_time}〜${slot.end_time} / ` +
    `${selectedService.service_name}`;

  el.customerSection.classList.remove("is-hidden");
  el.customerSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function changeWeek(days) {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + days);

  const max = new Date(today);
  max.setDate(max.getDate() + publicDays);

  if (next < today) weekStart = new Date(today);
  else if (next <= max) weekStart = next;

  loadWeek();
}

function updateNav() {
  const max = new Date(today);
  max.setDate(max.getDate() + publicDays);

  const next = new Date(weekStart);
  next.setDate(next.getDate() + 7);

  el.prevWeekButton.disabled = loading || weekStart <= today;
  el.nextWeekButton.disabled = loading || next > max;
  el.reloadButton.disabled = loading;
}

async function submitReservation(event) {
  event.preventDefault();
  hideError();

  if (!selectedSlot) {
    showError("予約時間を選択してください。");
    return;
  }

  const formType = String(selectedService.form_type || "").toUpperCase();
  let customerType = formType;

  if (formType === "BOTH") {
    customerType = document.querySelector('input[name="customer_type"]:checked')?.value || "";
    if (!customerType) {
      showError("会員または非会員を選択してください。");
      return;
    }
  }

  const memberNo = el.memberNo.value.trim();
  const name = el.customerName.value.trim();
  const email = el.customerEmail.value.trim();
  const phone = el.customerPhone.value.trim();

  if (customerType === "MEMBER" && !memberNo) {
    showError("会員番号を入力してください。");
    return;
  }

  if (customerType === "VISITOR" && !name) {
    showError("氏名を入力してください。");
    return;
  }

  if (!email) {
    showError("メールアドレスを入力してください。");
    return;
  }

  if (customerType === "VISITOR" && !phone) {
    showError("電話番号を入力してください。");
    return;
  }

  el.submitButton.disabled = true;
  el.submitButton.textContent = "予約処理中…";

  try {
    const payload = {
      action: "createReservation",
      service_code: selectedService.service_code,
      date: selectedSlot.date,
      start_time: selectedSlot.start_time,
      customer_type: customerType,
      member_no: memberNo,
      customer_name: customerType === "MEMBER" ? "会員照合中" : name,
      customer_email: email,
      customer_phone: phone,
      postal_code: el.postalCode.value.trim(),
      address: el.address.value.trim(),
      note: el.note.value.trim()
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(userMessage(result));
    }

    el.customerSection.classList.add("is-hidden");
    el.completeSection.classList.remove("is-hidden");
    el.completeSummary.textContent =
      `${jpDate(result.data.date)} ${result.data.start_time}〜${result.data.end_time} / ` +
      `${selectedService.service_name}`;
    el.reservationId.textContent = result.data.reservation_id;
    el.completeSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error.message || "予約に失敗しました。");
  } finally {
    el.submitButton.disabled = false;
    el.submitButton.textContent = "この内容で予約する";
  }
}

function userMessage(result) {
  const messages = {
    MEMBER_NOT_FOUND: "会員番号が確認できません。",
    MEMBER_EMAIL_MISMATCH: "会員番号と登録メールが一致しません。",
    MEMBER_INACTIVE: "現在有効な会員番号ではありません。",
    SLOT_NOT_AVAILABLE: "選択した時間は埋まりました。空き状況を更新してください。",
    CUSTOMER_TYPE_REQUIRED: "会員または非会員を選択してください。",
    CUSTOMER_PHONE_REQUIRED: "電話番号を入力してください。"
  };

  return messages[result.code] || result.message || "予約に失敗しました。";
}

function showFatal(message) {
  el.fatalError.textContent = message;
  el.fatalErrorSection.classList.remove("is-hidden");
}

function showError(message) {
  el.formError.textContent = message;
  el.formError.classList.remove("is-hidden");
}

function hideError() {
  el.formError.textContent = "";
  el.formError.classList.add("is-hidden");
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function apiDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function jpDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${year}年${month}月${day}日（${["日","月","火","水","木","金","土"][date.getDay()]}）`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
