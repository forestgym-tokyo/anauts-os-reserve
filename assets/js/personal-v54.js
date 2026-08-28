/* A-nauts OS Reserve - Personal booking enhancements v58 */
(() => {
  const routeKey = location.pathname.split("/").filter(Boolean).pop() || "personal";
  if (!["personal", "trial"].includes(routeKey)) return;

  const WOMEN_ONLY_TRAINER_CODE = "YOSHIMARU";
  let selectedTrainerCode = "";
  let loadedStoreCode = "";
  let trainerLoadPromise = null;
  let trainerLoadStoreCode = "";
  let weeklyRangeSupported = true;
  const trainerMap = new Map();
  const nativeFetch = window.fetch.bind(window);
  const nativeLoadWeek = loadWeek;
  const TRAINER_CACHE_KEY = "anauts-public-trainers-v1";

  function bookingEligibilityReady_() {
    return window.ANAUTS_PERSONAL_ELIGIBILITY_READY === true;
  }

  function womenOnlyTrainerAllowed_() {
    return window.ANAUTS_YOSHIMARU_ALLOWED === true;
  }

  function trainerSelectionRequired_() {
    return bookingEligibilityReady_();
  }

  function trainerAllowed_(code) {
    const normalized = String(code || "").trim().toUpperCase();
    return womenOnlyTrainerAllowed_() || normalized !== WOMEN_ONLY_TRAINER_CODE;
  }

  function visibleTrainers_() {
    return Array.from(trainerMap.values())
      .filter((trainer) => trainerAllowed_(trainer.code));
  }

  function trainerLabel(name) {
    const text = String(name || "").trim();
    if (!text) return "";
    return /トレーナー$/.test(text) ? text : `${text}トレーナー`;
  }

  function ensureTrainerFilter() {
    if (document.querySelector("#personalTrainerFilter")) return;

    const availability = document.querySelector("#availabilitySection");
    const toolbar = availability && availability.querySelector(".week-toolbar");
    if (!availability || !toolbar) return;

    const box = document.createElement("div");
    box.id = "personalTrainerFilter";
    box.style.margin = "0 0 22px";
    box.innerHTML = `
      <div style="font-weight:800;font-size:16px;margin-bottom:10px">トレーナーで絞り込む</div>
      <div id="personalTrainerChoices" style="display:flex;flex-wrap:wrap;gap:8px"></div>
      <p id="personalTrainerStatus" style="margin:9px 0 0;font-size:12px;opacity:.72">トレーナー一覧を読み込んでいます…</p>
    `;
    toolbar.insertAdjacentElement("beforebegin", box);
    renderTrainerChoices();
  }

  function renderTrainerChoices() {
    ensureTrainerFilter();
    const area = document.querySelector("#personalTrainerChoices");
    if (!area) return;

    const choices = visibleTrainers_().sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "ja")
    );

    if (selectedTrainerCode && !trainerAllowed_(selectedTrainerCode)) {
      selectedTrainerCode = "";
    }

    area.textContent = "";

    choices.forEach((trainer) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = trainer.code ? trainerLabel(trainer.name || trainer.code) : trainer.name;
      button.dataset.trainerCode = trainer.code;
      button.style.padding = "9px 13px";
      button.style.borderRadius = "999px";
      button.style.border = trainer.code === selectedTrainerCode ? "1px solid #d9b85d" : "1px solid rgba(255,255,255,.18)";
      button.style.background = trainer.code === selectedTrainerCode ? "rgba(217,184,93,.18)" : "transparent";
      button.style.color = "inherit";
      button.style.fontWeight = "700";
      button.style.cursor = "pointer";

      button.addEventListener("click", () => {
        if (selectedTrainerCode === trainer.code) return;
        selectedTrainerCode = trainer.code;
        selectedSlot = null;
        const customerSection = document.querySelector("#customerSection");
        if (customerSection) customerSection.classList.add("is-hidden");
        renderTrainerChoices();
        loadWeek();
      });

      area.append(button);
    });
  }

  function restoreTrainerCache_(storeCode) {
    try {
      const raw = window.sessionStorage.getItem(TRAINER_CACHE_KEY);
      const cached = raw ? JSON.parse(raw) : null;
      if (!cached || cached.store_code !== storeCode) return false;
      if (Date.now() - Number(cached.saved_at || 0) > 10 * 60 * 1000) return false;
      if (!Array.isArray(cached.trainers)) return false;

      trainerMap.clear();
      cached.trainers.forEach((trainer) => {
        if (!trainer || !trainer.code) return;
        trainerMap.set(trainer.code, trainer);
      });
      loadedStoreCode = storeCode;
      return trainerMap.size > 0;
    } catch (_) {
      return false;
    }
  }

  function saveTrainerCache_(storeCode) {
    try {
      window.sessionStorage.setItem(TRAINER_CACHE_KEY, JSON.stringify({
        store_code: storeCode,
        saved_at: Date.now(),
        trainers: Array.from(trainerMap.values())
      }));
    } catch (_) {
      // Safariのプライベートブラウズ等で保存不可でも予約処理は継続する。
    }
  }

  async function fetchJsonWithTimeout_(url, timeoutMs) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer = null;

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (controller) controller.abort();
        const error = new Error("通信が混み合っています。再度お試しください。");
        error.name = "TimeoutError";
        reject(error);
      }, timeoutMs);
    });

    const options = { cache: "no-store" };
    if (controller) options.signal = controller.signal;

    try {
      const response = await Promise.race([
        nativeFetch(url.toString(), options),
        timeout
      ]);
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function loadPublicTrainers_(preloadOnly) {
    ensureTrainerFilter();

    if (!bookingEligibilityReady_() && preloadOnly !== true) {
      const waitingStatus = document.querySelector("#personalTrainerStatus");
      if (waitingStatus) waitingStatus.textContent = "会員情報の確認後に表示します。";
      return;
    }

    const storeCode = String(
      (selectedService && selectedService.store_code) || "YACHIYO"
    ).trim().toUpperCase();

    if ((loadedStoreCode === storeCode && trainerMap.size) || restoreTrainerCache_(storeCode)) {
      if (bookingEligibilityReady_()) {
        renderTrainerChoices();
        updateTrainerStatus_();
      }
      return;
    }

    if (trainerLoadPromise && trainerLoadStoreCode === storeCode) {
      try {
        await trainerLoadPromise;
      } catch (error) {
        const failedStatus = document.querySelector("#personalTrainerStatus");
        if (failedStatus && bookingEligibilityReady_()) {
          failedStatus.textContent = "トレーナー一覧を取得できませんでした。再読み込みしてください。";
        }
        return;
      }
      if (bookingEligibilityReady_()) {
        renderTrainerChoices();
        updateTrainerStatus_();
      }
      return;
    }

    const status = document.querySelector("#personalTrainerStatus");
    if (status && bookingEligibilityReady_()) {
      status.textContent = "トレーナー一覧を読み込んでいます…";
    }

    try {
      trainerLoadStoreCode = storeCode;
      trainerLoadPromise = (async () => {
        const url = new URL(API_URL);
        url.searchParams.set("action", "getPublicTrainers");
        if (storeCode) url.searchParams.set("store_code", storeCode);
        url.searchParams.set("_", Date.now().toString());

        const result = await fetchJsonWithTimeout_(url, 60000);
        if (!result.ok) {
          throw new Error(result.message || "トレーナー一覧を取得できませんでした。");
        }

        const trainers = result.data && Array.isArray(result.data.trainers)
          ? result.data.trainers
          : [];

        trainerMap.clear();
        trainers.forEach((staff) => {
          const code = String((staff && staff.staff_code) || "").trim().toUpperCase();
          if (!code) return;
          const name = String(
            (staff && (staff.staff_name || staff.display_name)) || code
          ).trim();
          trainerMap.set(code, { code, name });
        });

        loadedStoreCode = storeCode;
        saveTrainerCache_(storeCode);
      })();

      await trainerLoadPromise;

      if (selectedTrainerCode && !trainerMap.has(selectedTrainerCode)) {
        selectedTrainerCode = "";
      }
      if (selectedTrainerCode && !trainerAllowed_(selectedTrainerCode)) {
        selectedTrainerCode = "";
      }

      if (bookingEligibilityReady_()) {
        renderTrainerChoices();
        updateTrainerStatus_();
      }
    } catch (error) {
      trainerMap.clear();
      selectedTrainerCode = "";
      if (bookingEligibilityReady_()) renderTrainerChoices();
      if (status && bookingEligibilityReady_()) {
        status.textContent = "トレーナー一覧を取得できませんでした。再読み込みしてください。";
      }
      console.error("getPublicTrainers failed", error);
    } finally {
      trainerLoadPromise = null;
      trainerLoadStoreCode = "";
    }
  }

  function updateTrainerStatus_() {
    const status = document.querySelector("#personalTrainerStatus");
    if (!status) return;

    const count = visibleTrainers_().length;
    if (!count) {
      status.textContent = "現在表示できるトレーナーがいません。";
      return;
    }

    status.textContent = trainerSelectionRequired_() && !selectedTrainerCode
      ? "トレーナーを選択すると予約可能時間を表示します。"
      : "トレーナーを指定すると、そのトレーナーの予約可能時間だけを表示します。";
  }

  function showTrialFixedPlan_() {
    if (routeKey !== "trial" || !selectedService) return;

    const section = document.querySelector("#serviceSection");
    const grid = document.querySelector("#serviceGrid");
    if (!section || !grid) return;

    grid.textContent = "";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "service-card is-selected";
    card.disabled = true;
    card.setAttribute("aria-disabled", "true");
    card.style.cursor = "default";
    card.innerHTML = `無料体験パーソナル<small>${Number(selectedService.duration) || ""}分</small>`;
    grid.append(card);

    section.classList.remove("is-hidden");
  }

  async function fetchSlotsForTrainer_(date, staffCode) {
    const url = new URL(API_URL);
    url.searchParams.set("action", "getAvailableSlots");
    url.searchParams.set("service_code", selectedService.service_code);
    url.searchParams.set("date", date);
    if (staffCode) url.searchParams.set("staff_code", staffCode);
    url.searchParams.set("_", Date.now().toString());

    try {
      return await fetchJsonWithTimeout_(url, 60000);
    } catch (error) {
      const message = error && (error.name === "AbortError" || error.name === "TimeoutError")
        ? "空き状況の取得がタイムアウトしました。再度お試しください。"
        : ((error && error.message) || "取得失敗");
      return { ok: false, message, data: { date, slots: [] } };
    }
  }

  function apiResultCode_(result) {
    return String(
      (result && (
        result.code ||
        result.error_code ||
        (result.data && result.data.code)
      )) || ""
    ).trim().toUpperCase();
  }

  async function fetchWeekSlots_(dates) {
    if (!bookingEligibilityReady_() || !selectedTrainerCode) return null;
    if (!weeklyRangeSupported) return null;

    const url = new URL(API_URL);
    url.searchParams.set("action", "getAvailableSlotsRange");
    url.searchParams.set("service_code", selectedService.service_code);
    url.searchParams.set("start_date", dates[0]);
    url.searchParams.set("days", String(dates.length));
    url.searchParams.set("staff_code", selectedTrainerCode);
    url.searchParams.set("_", Date.now().toString());

    const result = await fetchJsonWithTimeout_(url, 90000);
    if (!result || result.ok !== true) {
      if (apiResultCode_(result) === "ACTION_NOT_FOUND") {
        weeklyRangeSupported = false;
        return null;
      }
      throw new Error((result && result.message) || "予約可能時間を取得できませんでした。");
    }

    const results = result.data && Array.isArray(result.data.results)
      ? result.data.results
      : null;

    if (!results || results.length !== dates.length) {
      throw new Error("予約可能時間の応答形式を確認してください。");
    }

    return results;
  }

  window.ANAUTS_FETCH_WEEK_SLOTS = fetchWeekSlots_;

  // 会員確認とトレーナー選択後だけ、その担当者の空きを取得する。
  fetchSlots = async function(date) {
    if (!bookingEligibilityReady_()) {
      return { ok: true, data: { date, slots: [] } };
    }

    if (trainerSelectionRequired_() && !selectedTrainerCode) {
      return { ok: true, data: { date, slots: [] } };
    }

    if (selectedTrainerCode && !trainerAllowed_(selectedTrainerCode)) {
      return { ok: true, data: { date, slots: [] } };
    }

    return fetchSlotsForTrainer_(date, selectedTrainerCode);
  };

  loadWeek = async function() {
    if (!bookingEligibilityReady_()) return;

    if (trainerSelectionRequired_() && !selectedTrainerCode) {
      selectedSlot = null;
      const customerSection = document.querySelector("#customerSection");
      if (customerSection) customerSection.classList.add("is-hidden");
      const list = document.querySelector("#weekList");
      const status = document.querySelector("#weekStatus");
      if (list) list.textContent = "";
      if (status) status.textContent = "トレーナーを選択すると予約可能時間を表示します。";
      return;
    }

    return nativeLoadWeek();
  };

  // プラン選択直後は会員確認を優先する。日程は確認完了後に読み込む。
  if (routeKey === "personal") {
    const serviceGrid = document.querySelector("#serviceGrid");
    if (serviceGrid) {
      serviceGrid.addEventListener("click", (event) => {
        if (!event.target.closest(".service-card")) return;
        selectedTrainerCode = "";
        renderTrainerChoices();
      }, true);
    }
  }

  if (routeKey === "trial") {
    const availability = document.querySelector("#availabilitySection");
    const initializeTrialUi = () => {
      if (!selectedService) return false;
      showTrialFixedPlan_();
      return true;
    };

    if (!initializeTrialUi() && availability) {
      const observer = new MutationObserver(() => {
        if (initializeTrialUi()) observer.disconnect();
      });
      observer.observe(availability, { attributes: true, attributeFilter: ["class"] });
    }
  }

  document.addEventListener("anauts:booking-eligibility-ready", async () => {
    selectedTrainerCode = "";
    selectedSlot = null;
    const customerSection = document.querySelector("#customerSection");
    if (customerSection) customerSection.classList.add("is-hidden");
    await loadPublicTrainers_();
    loadWeek();
  });

  document.addEventListener("anauts:booking-eligibility-invalidated", () => {
    selectedTrainerCode = "";
    selectedSlot = null;
    renderTrainerChoices();
    const list = document.querySelector("#weekList");
    if (list) list.textContent = "";
    const status = document.querySelector("#weekStatus");
    if (status) status.textContent = "";
  });

  // Reservation POST: preserve chosen trainer in createReservation payload.
  window.fetch = async function(input, init) {
    try {
      const method = String((init && init.method) || "GET").toUpperCase();
      const target = typeof input === "string"
        ? input
        : String((input && input.url) || input || "");

      if (selectedTrainerCode && method === "POST" && target === API_URL && init && typeof init.body === "string") {
        const body = JSON.parse(init.body);
        if (body && body.action === "createReservation") {
          body.staff_code = selectedTrainerCode;
          init = { ...init, body: JSON.stringify(body) };
        }
      }
    } catch (_) {
      // If body is not JSON, leave the original request unchanged.
    }
    return nativeFetch(input, init);
  };

  ensureTrainerFilter();
  loadPublicTrainers_(true);
})();
