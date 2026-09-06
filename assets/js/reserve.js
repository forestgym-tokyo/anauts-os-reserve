const API_URL = "https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
const DAYS = 7;
const SERVICES_SESSION_CACHE_KEY = "anauts-reserve-services-v1";
const SERVICES_SESSION_CACHE_MS = 5 * 60 * 1000;
const TOUR_RANGE_TIMEOUT_MS = 30000;

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
    serviceCode: "TOUR",
    // 店内見学は固定サービスのため、表示前の全サービス一覧取得を省く。
    // 空き枠取得・予約確定時はGAS側の最新services設定で再検証される。
    embeddedService: {
      service_code: "TOUR",
      service_name: "店内見学",
      form_type: "VISITOR",
      public_days: 30
    }
  },
  counsel: {
    title: "ダイエットカウンセリング",
    lead: "会員様・非会員様どちらもご予約いただけます。",
    mode: "FIXED",
    serviceCode: "COUNSEL"
  },
  procedure: {
    title: "各種手続き",
    lead: "会員様向け手続きのご来店予約です。",
    mode: "FIXED",
    serviceCode: "PROCEDURE"
  },
  "meal-planning": {
    title: "Meal Planning",
    lead: "Meal Planningのご予約です。",
    mode: "FIXED",
    serviceCode: "MEAL_PLANNING"
  },
  "training-support": {
    title: "トレーニングサポート",
    lead: "会員様向けトレーニングサポート（45分）のご予約です。",
    mode: "FIXED",
    serviceCode: "TRAINING_SUPPORT45"
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
  prefectureField: document.querySelector("#prefectureField"),
  cityField: document.querySelector("#cityField"),
  addressDetailField: document.querySelector("#addressDetailField"),
  memberNo: document.querySelector("#memberNo"),
  customerName: document.querySelector("#customerName"),
  customerLastName: document.querySelector("#customerLastName"),
  customerFirstName: document.querySelector("#customerFirstName"),
  customerEmail: document.querySelector("#customerEmail"),
  customerPhone: document.querySelector("#customerPhone"),
  postalCode: document.querySelector("#postalCode"),
  address: document.querySelector("#address"),
  prefecture: document.querySelector("#prefecture"),
  city: document.querySelector("#city"),
  addressDetail: document.querySelector("#addressDetail"),
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
let weekLoadVersion = 0;
let pendingWeekReload = false;

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
    selectedService = getEmbeddedRouteService_(route);
    if (!selectedService) {
      services = await fetchServices();
    }

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
      if (!selectedService) {
        selectedService = services.find((service) =>
          String(service.service_code || "") === route.serviceCode &&
          isEnabled(service)
        );
      }

      if (!selectedService) {
        showFatal(`サービス ${route.serviceCode} が未登録または非公開です。`);
        return;
      }

      el.availabilityStep.textContent = "1";
      el.customerStep.textContent = "2";
      publicDays = Number(selectedService.public_days) || 30;
      configureCustomerForm();
      el.availabilitySection.classList.remove("is-hidden");
      loadWeek();
    }
  } catch (error) {
    showFatal(error.message || "サービス情報を取得できませんでした。");
  }
}

function getEmbeddedRouteService_(routeValue) {
  const service = routeValue && routeValue.embeddedService;
  return service ? Object.assign({}, service) : null;
}

async function fetchServices() {
  const cached = readServicesSessionCache_();
  if (cached) return cached;

  const url = new URL(API_URL);
  url.searchParams.set("action", "getServices");
  url.searchParams.set("_", Date.now().toString());

  const response = await fetch(url.toString(), { cache: "no-store" });
  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.message || "サービス情報を取得できませんでした。");
  }

  const list = Array.isArray(result.data)
    ? result.data
    : (result.data && Array.isArray(result.data.services) ? result.data.services : null);

  if (list) {
    writeServicesSessionCache_(list);
    return list;
  }

  throw new Error("getServicesのレスポンス形式を確認してください。");
}

function readServicesSessionCache_() {
  try {
    const raw = sessionStorage.getItem(SERVICES_SESSION_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || !Array.isArray(cached.data)) return null;
    if (Date.now() - Number(cached.saved_at || 0) > SERVICES_SESSION_CACHE_MS) {
      sessionStorage.removeItem(SERVICES_SESSION_CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch (_) {
    return null;
  }
}

function writeServicesSessionCache_(servicesValue) {
  try {
    sessionStorage.setItem(
      SERVICES_SESSION_CACHE_KEY,
      JSON.stringify({ saved_at: Date.now(), data: servicesValue })
    );
  } catch (_) {
    // Safariのプライベートモード等ではキャッシュなしで継続する。
  }
}

function isEnabled(service) {
  const active = service.active === true || String(service.active).toUpperCase() === "TRUE";
  const isPublic = service.public === true || String(service.public).toUpperCase() === "TRUE";
  return active && isPublic;
}

function renderServiceCards(list) {
  el.serviceGrid.textContent = "";

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


function ensureSplitNameFields_() {
  if (!el.reservationForm) return;

  // すでに新しい姓・名欄がある場合
  let last = document.querySelector("#customerLastName");
  let first = document.querySelector("#customerFirstName");

  if (last && first) {
    el.customerLastName = last;
    el.customerFirstName = first;
    if (el.customerName) {
      const customerNameField = el.customerName.closest("label, .field");
      if (customerNameField) customerNameField.classList.add("is-hidden");
    }
    return;
  }

  // 旧 customerName 欄の位置を利用して姓・名に置換
  const legacy = el.customerName;
  const legacyField = (legacy && legacy.closest("label, .field")) || el.nameField;

  if (!legacyField) return;

  const wrapper = document.createElement("div");
  wrapper.id = "splitNameField";
  wrapper.className = "field";
  wrapper.innerHTML = `
    <span>氏名</span>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <input id="customerLastName"
             type="text"
             autocomplete="family-name"
             placeholder="姓">
      <input id="customerFirstName"
             type="text"
             autocomplete="given-name"
             placeholder="名">
    </div>
  `;

  legacyField.insertAdjacentElement("afterend", wrapper);
  legacyField.classList.add("is-hidden");

  el.customerLastName = wrapper.querySelector("#customerLastName");
  el.customerFirstName = wrapper.querySelector("#customerFirstName");
}

function getCustomerNameParts_() {
  ensureSplitNameFields_();

  const lastName = String((el.customerLastName && el.customerLastName.value) || "").trim();
  const firstName = String((el.customerFirstName && el.customerFirstName.value) || "").trim();

  return {
    lastName,
    firstName,
    fullName: `${lastName} ${firstName}`.trim()
  };
}


function isCustomerNameRequired_(serviceCode, customerType) {
  const code = String(serviceCode || "").toUpperCase();
  const type = String(customerType || "").toUpperCase();

  // 会員向けで氏名入力を不要にするサービス
  if ([
    "TRAINING_SUPPORT45",
    "PROCEDURE",
    "UNSUBSCRIBE",
    "MEAL_PLANNING"
  ].includes(code)) {
    return false;
  }

  // ダイエット無料カウンセリング
  // 会員：氏名入力不要 / 非会員：氏名入力必須
  if (code === "COUNSEL") {
    return type !== "MEMBER";
  }

  // 店内見学・パーソナル等は従来どおり
  return true;
}

function setCustomerNameVisible_(visible) {
  if (el.nameField) el.nameField.classList.add("is-hidden");

  const splitNameField =
    document.querySelector("#splitNameField");

  if (splitNameField) {
    splitNameField.classList.toggle(
      "is-hidden",
      !visible
    );
  }

  if (el.customerLastName) {
    el.customerLastName.required = !!visible;
  }

  if (el.customerFirstName) {
    el.customerFirstName.required = !!visible;
  }
}

function getCurrentCustomerType_(formType) {
  const normalized =
    String(formType || "").toUpperCase();

  if (normalized === "BOTH") {
    const checked = document.querySelector(
      'input[name="customer_type"]:checked'
    );
    return (checked && checked.value) || "";
  }

  return normalized;
}


function configureCustomerForm() {
  ensureSplitNameFields_();

  const formType =
    String(
      (selectedService && selectedService.form_type) || ""
    ).toUpperCase();

  const code =
    String(
      (selectedService && selectedService.service_code) || ""
    ).toUpperCase();

  const isTour =
    code === "TOUR";

  const isCounsel =
    code === "COUNSEL";

  const isTrainingSupport =
    code === "TRAINING_SUPPORT45";

  // トレーニングサポートは会員専用
  if (isTrainingSupport) {
    if (el.customerTypeField) {
      el.customerTypeField.classList.add(
        "is-hidden"
      );
    }

    if (el.memberNoField) {
      el.memberNoField.classList.remove(
        "is-hidden"
      );
    }

    setCustomerNameVisible_(false);

    if (el.phoneField) {
      el.phoneField.classList.add(
        "is-hidden"
      );
    }

    setAddressFieldsVisible_(false);

    configureMemberNumberInput_();

    return;
  }

  if (el.customerTypeField) {
    el.customerTypeField.classList.toggle(
      "is-hidden",
      formType !== "BOTH"
    );
  }

  if (el.memberNoField) {
    el.memberNoField.classList.toggle(
      "is-hidden",
      formType === "VISITOR"
    );
  }

  const initialCustomerType =
    getCurrentCustomerType_(formType);

  setCustomerNameVisible_(
    isCustomerNameRequired_(
      code,
      initialCustomerType
    )
  );

  // 店内見学は従来どおり住所必須
  if (isTour) {
    setAddressFieldsVisible_(true);

  } else if (isCounsel) {
    // カウンセリングは会員なら住所不要、非会員なら住所必須
    setAddressFieldsVisible_(
      initialCustomerType !== "MEMBER"
    );

  } else {
    setAddressFieldsVisible_(false);
  }

  configureMemberNumberInput_();

  document
    .querySelectorAll(
      'input[name="customer_type"]'
    )
    .forEach((radio) => {

      radio.onchange = () => {
        const customerType =
          radio.value;

        if (el.memberNoField) {
          el.memberNoField.classList.toggle(
            "is-hidden",
            customerType !== "MEMBER"
          );
        }

        setCustomerNameVisible_(
          isCustomerNameRequired_(
            code,
            customerType
          )
        );

        if (isCounsel) {
          setAddressFieldsVisible_(
            customerType !== "MEMBER"
          );
        }
      };
    });

  if (el.memberNo) {
    el.memberNo.oninput = () => {
      el.memberNo.value =
        el.memberNo.value.replace(
          /\D/g,
          ""
        );
    };
  }

  if (el.postalCode) {
    el.postalCode.oninput =
      handlePostalCodeInput_;

    el.postalCode.onblur =
      handlePostalCodeInput_;
  }
}

function configureMemberNumberInput_() {
  if (!el.memberNo) return;

  el.memberNo.setAttribute("inputmode", "numeric");
  el.memberNo.setAttribute("pattern", "[0-9]{6}");
  el.memberNo.setAttribute("maxlength", "6");
  el.memberNo.setAttribute("autocomplete", "off");
}

function hasCounselMemberNo_() {
  return /^\d{6}$/.test(String((el.memberNo && el.memberNo.value) || "").trim());
}

function setAddressFieldsVisible_(visible) {
  [el.postalField, el.addressField, el.prefectureField, el.cityField, el.addressDetailField]
    .filter(Boolean)
    .forEach(node => node.classList.toggle("is-hidden", !visible));

  // 旧HTMLのaddressFieldしかない場合でも、新3項目を自動生成する。
  ensureSplitAddressFields_();

  [el.postalField, el.prefectureField, el.cityField, el.addressDetailField]
    .filter(Boolean)
    .forEach(node => node.classList.toggle("is-hidden", !visible));

  if (el.addressField) {
    el.addressField.classList.add("is-hidden");
  }
}

function ensureSplitAddressFields_() {
  if (!el.reservationForm || !el.postalField) return;

  if (!document.querySelector("#prefecture")) {
    const prefectureField = document.createElement("label");
    prefectureField.id = "prefectureField";
    prefectureField.className = "field";
    prefectureField.innerHTML =
      '<span>都道府県</span>' +
      '<input id="prefecture" type="text" autocomplete="address-level1" placeholder="例：千葉県">';
    el.postalField.insertAdjacentElement("afterend", prefectureField);
    el.prefectureField = prefectureField;
    el.prefecture = prefectureField.querySelector("#prefecture");
  }

  if (!document.querySelector("#city")) {
    const cityField = document.createElement("label");
    cityField.id = "cityField";
    cityField.className = "field";
    cityField.innerHTML =
      '<span>市区町村</span>' +
      '<input id="city" type="text" autocomplete="address-level2" placeholder="例：八千代市">';
    el.prefectureField.insertAdjacentElement("afterend", cityField);
    el.cityField = cityField;
    el.city = cityField.querySelector("#city");
  }

  if (!document.querySelector("#addressDetail")) {
    const detailField = document.createElement("label");
    detailField.id = "addressDetailField";
    detailField.className = "field";
    detailField.innerHTML =
      '<span>続きの住所</span>' +
      '<input id="addressDetail" type="text" autocomplete="street-address" placeholder="町名・番地・建物名・部屋番号">';
    el.cityField.insertAdjacentElement("afterend", detailField);
    el.addressDetailField = detailField;
    el.addressDetail = detailField.querySelector("#addressDetail");
  }

  if (el.postalCode) {
    el.postalCode.setAttribute("inputmode", "numeric");
    el.postalCode.setAttribute("maxlength", "8");
    el.postalCode.setAttribute("placeholder", "2760040");
  }
}

let postalLookupTimer_ = null;

function handlePostalCodeInput_() {
  if (!el.postalCode) return;

  const digits = el.postalCode.value.replace(/\D/g, "").slice(0, 7);
  el.postalCode.value = digits;

  clearTimeout(postalLookupTimer_);

  if (digits.length !== 7) return;

  postalLookupTimer_ = setTimeout(() => lookupPostalAddress_(digits), 180);
}

async function lookupPostalAddress_(postalCode) {
  try {
    const response = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${encodeURIComponent(postalCode)}`,
      { cache: "no-store" }
    );

    if (!response.ok) return;

    const data = await response.json();
    const row = Array.isArray(data.results) ? data.results[0] : null;

    if (!row) return;

    ensureSplitAddressFields_();

    if (el.prefecture) el.prefecture.value = row.address1 || "";
    if (el.city) el.city.value = `${row.address2 || ""}${row.address3 || ""}`;
    if (el.addressDetail) el.addressDetail.focus();

  } catch (error) {
    // 郵便番号検索失敗時も手入力は可能。
  }
}

function getAddressParts_() {
  ensureSplitAddressFields_();

  const postalCode = String((el.postalCode && el.postalCode.value) || "").trim();
  const prefecture = String((el.prefecture && el.prefecture.value) || "").trim();
  const city = String((el.city && el.city.value) || "").trim();
  const addressDetail = String((el.addressDetail && el.addressDetail.value) || "").trim();

  return {
    postalCode,
    prefecture,
    city,
    addressDetail,
    fullAddress: `${prefecture}${city}${addressDetail}`
  };
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
  const requestVersion = ++weekLoadVersion;

  if (!selectedService) return;
  if (loading) {
    pendingWeekReload = true;
    return;
  }

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
    let results = null;

    if (typeof window.ANAUTS_FETCH_WEEK_SLOTS === "function") {
      results = await window.ANAUTS_FETCH_WEEK_SLOTS(dates.slice());
    } else {
      results = await fetchWeekSlotsRange_(dates);
    }

    if (requestVersion !== weekLoadVersion) return;

    if (!Array.isArray(results) || results.length !== dates.length) {
      results = await fetchSlotsWithLimit_(dates, requestVersion);
    }

    if (requestVersion !== weekLoadVersion) return;

    const first = results.find((result) => result.ok && result.data);

    if (first && first.data && first.data.public_days !== undefined) {
      publicDays = Number(first.data.public_days) || 30;
    }

    renderWeek(results);

    const total = results.reduce((sum, result) =>
      sum + (result.data && Array.isArray(result.data.slots) ? result.data.slots.length : 0), 0
    );
    const failed = results.filter((result) => !result.ok).length;

    if (failed) {
      el.weekStatus.textContent = `${DAYS - failed}日分を表示しました。${failed}日分は取得できませんでした。`;
    } else {
      el.weekStatus.textContent = total
        ? `この7日間に${total}件の空きがあります。`
        : "この7日間に空きはありません。";
    }
  } catch (error) {
    el.weekStatus.textContent = error.message || "空き時間の取得に失敗しました。";
  } finally {
    loading = false;
    updateNav();

    if (pendingWeekReload) {
      pendingWeekReload = false;
      loadWeek();
    }
  }
}

async function fetchWeekSlotsRange_(dates) {
  if (!selectedService || !Array.isArray(dates) || !dates.length) return null;

  const isTour = String(selectedService.service_code || "").toUpperCase() === "TOUR";

  const url = new URL(API_URL);
  url.searchParams.set("action", "getAvailableSlotsRange");
  url.searchParams.set("service_code", selectedService.service_code);
  url.searchParams.set("start_date", dates[0]);
  url.searchParams.set("days", String(dates.length));
  url.searchParams.set("_", Date.now().toString());

  const controller = isTour && typeof AbortController === "function"
    ? new AbortController()
    : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), TOUR_RANGE_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {})
    });
    const result = await response.json();
    const rangeResults = result && result.ok === true && result.data &&
      Array.isArray(result.data.results)
      ? result.data.results
      : null;

    if (rangeResults && rangeResults.length === dates.length) {
      return rangeResults;
    }

    if (isTour) {
      throw new Error(
        result && result.message
          ? result.message
          : "空き時間を取得できませんでした。再読み込みしてください。"
      );
    }
    return null;
  } catch (error) {
    if (isTour) {
      throw new Error(
        error && error.name === "AbortError"
          ? "空き時間の取得に時間がかかっています。再読み込みしてください。"
          : (error.message || "空き時間を取得できませんでした。再読み込みしてください。")
      );
    }
    // 一括APIが利用できない間も、従来の日別取得へ自動で戻す。
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchSlotsWithLimit_(dates, requestVersion) {
  const pending = dates.map((date) => ({
    ok: true,
    pending: true,
    data: { date, slots: [] }
  }));
  let cursor = 0;
  let completed = 0;

  renderWeek(pending);

  async function worker_() {
    while (cursor < dates.length && requestVersion === weekLoadVersion) {
      const index = cursor++;
      pending[index] = await fetchSlots(dates[index]);
      completed += 1;

      if (requestVersion !== weekLoadVersion) return;
      renderWeek(pending);
      el.weekStatus.textContent = `予約可能時間を確認しています… ${completed}/${dates.length}日`;
    }
  }

  const isTour = String(selectedService && selectedService.service_code || "").toUpperCase() === "TOUR";
  const workerCount = isTour || typeof window.ANAUTS_FETCH_WEEK_SLOTS === "function"
    ? Math.min(2, dates.length)
    : dates.length;
  await Promise.all(Array.from({ length: workerCount }, () => worker_()));
  return pending;
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
  el.weekList.textContent = "";

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

    const slots = result.data && Array.isArray(result.data.slots) ? result.data.slots : [];

    if (result.pending) {
      const p = document.createElement("p");
      p.className = "no-slots";
      p.textContent = "読込中…";
      area.append(p);
    } else if (!result.ok || !slots.length) {
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

  updateWeekRange_();
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

  renderLoadingWeek_();
  el.weekStatus.textContent = "選択した週の空き時間を確認しています…";
  updateNav();
  loadWeek();
}

function renderLoadingWeek_() {
  const pending = Array.from({ length: DAYS }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return {
      ok: true,
      pending: true,
      data: { date: apiDate(date), slots: [] }
    };
  });
  renderWeek(pending);
}

function updateWeekRange_() {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  el.weekRange.textContent =
    `${weekStart.getMonth() + 1}月${weekStart.getDate()}日〜` +
    `${end.getMonth() + 1}月${end.getDate()}日`;
}

function updateNav() {
  const max = new Date(today);
  max.setDate(max.getDate() + publicDays);

  const next = new Date(weekStart);
  next.setDate(next.getDate() + 7);

  // 週の取得中でも移動先は選べる。進行中の取得結果は version で破棄し、
  // 選択された最新の週を pendingWeekReload で続けて取得する。
  el.prevWeekButton.disabled = weekStart <= today;
  el.nextWeekButton.disabled = next > max;
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
    const checkedCustomerType = document.querySelector('input[name="customer_type"]:checked');
    customerType = (checkedCustomerType && checkedCustomerType.value) || "";
    if (!customerType) {
      showError("会員または非会員を選択してください。");
      return;
    }
  }

  const memberNo = el.memberNo.value.trim();
  const nameParts = getCustomerNameParts_();
  const email = el.customerEmail.value.trim();
  const phone = el.customerPhone.value.trim();
  const serviceCode = String(selectedService.service_code || "").toUpperCase();
  const nameRequired = isCustomerNameRequired_(
    serviceCode,
    customerType
  );
  const name = nameRequired
    ? nameParts.fullName
    : "";
  const isTour = serviceCode === "TOUR";
  const isCounsel = serviceCode === "COUNSEL";
  const isTrainingSupport = serviceCode === "TRAINING_SUPPORT45";
  const addressParts = getAddressParts_();

  if ((customerType === "MEMBER" || isTrainingSupport) && !memberNo) {
    showError("会員番号を入力してください。");
    return;
  }

  if ((customerType === "MEMBER" || isTrainingSupport) && !/^\d{6}$/.test(memberNo)) {
    showError("会員番号は6桁の数字で入力してください。");
    return;
  }

  if (
    nameRequired &&
    !nameParts.lastName
  ) {
    showError("姓を入力してください。");
    return;
  }

  if (
    nameRequired &&
    !nameParts.firstName
  ) {
    showError("名を入力してください。");
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

  const needsAddress =
    isTour ||
    (isCounsel && !/^\d{6}$/.test(memberNo));

  if (needsAddress) {
    if (!/^\d{7}$/.test(addressParts.postalCode)) {
      showError("郵便番号を7桁の数字で入力してください。");
      return;
    }
    if (!addressParts.prefecture) {
      showError("都道府県を入力してください。");
      return;
    }
    if (!addressParts.city) {
      showError("市区町村を入力してください。");
      return;
    }
    if (!addressParts.addressDetail) {
      showError("続きの住所を入力してください。");
      return;
    }
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
      customer_name: name,
      customer_last_name:
        nameRequired
          ? nameParts.lastName
          : "",
      customer_first_name:
        nameRequired
          ? nameParts.firstName
          : "",
      customer_email: email,
      customer_phone: phone,
      postal_code: needsAddress ? addressParts.postalCode : "",
      prefecture: needsAddress ? addressParts.prefecture : "",
      city: needsAddress ? addressParts.city : "",
      address_detail: needsAddress ? addressParts.addressDetail : "",
      address: needsAddress ? addressParts.fullAddress : "",
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
    PERSONAL_TRAINER_REQUIRED: "担当トレーナーを確認できませんでした。空き状況を更新し、日時を選び直してください。",
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
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
