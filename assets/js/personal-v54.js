/* A-nauts OS Reserve - Personal booking enhancements v57 */
(() => {
  const routeKey = location.pathname.split("/").filter(Boolean).pop() || "personal";
  if (!["personal", "trial"].includes(routeKey)) return;

  const WOMEN_ONLY_TRAINER_CODE = "YOSHIMARU";
  let selectedTrainerCode = "";
  let loadedStoreCode = "";
  const trainerMap = new Map();
  const nativeFetch = window.fetch.bind(window);
  const nativeLoadWeek = loadWeek;

  function bookingEligibilityReady_() {
    return window.ANAUTS_PERSONAL_ELIGIBILITY_READY === true;
  }

  function womenOnlyTrainerAllowed_() {
    return window.ANAUTS_YOSHIMARU_ALLOWED === true;
  }

  function trainerSelectionRequired_() {
    return bookingEligibilityReady_() && !womenOnlyTrainerAllowed_();
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
    const toolbar = availability?.querySelector(".week-toolbar");
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

    const allowed = visibleTrainers_();
    const choices = [
      ...(womenOnlyTrainerAllowed_()
        ? [{ code: "", name: "すべてのトレーナー" }]
        : []),
      ...allowed.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "ja")
      )
    ];

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
        document.querySelector("#customerSection")?.classList.add("is-hidden");
        renderTrainerChoices();
        loadWeek();
      });

      area.append(button);
    });
  }

  async function loadPublicTrainers_() {
    ensureTrainerFilter();

    if (!bookingEligibilityReady_()) {
      const status = document.querySelector("#personalTrainerStatus");
      if (status) status.textContent = "会員情報の確認後に表示します。";
      return;
    }

    const storeCode = String(selectedService?.store_code || "YACHIYO").trim().toUpperCase();

    if (loadedStoreCode === storeCode && trainerMap.size) {
      renderTrainerChoices();
      updateTrainerStatus_();
      return;
    }

    const status = document.querySelector("#personalTrainerStatus");
    if (status) status.textContent = "トレーナー一覧を読み込んでいます…";

    try {
      const url = new URL(API_URL);
      url.searchParams.set("action", "getPublicTrainers");
      if (storeCode) url.searchParams.set("store_code", storeCode);
      url.searchParams.set("_", Date.now().toString());

      const response = await nativeFetch(url.toString(), { cache: "no-store" });
      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.message || "トレーナー一覧を取得できませんでした。");
      }

      const trainers = Array.isArray(result.data?.trainers) ? result.data.trainers : [];

      trainerMap.clear();
      trainers.forEach((staff) => {
        const code = String(staff?.staff_code || "").trim().toUpperCase();
        if (!code) return;
        const name = String(staff?.staff_name || staff?.display_name || code).trim();
        trainerMap.set(code, { code, name });
      });

      loadedStoreCode = storeCode;
      if (selectedTrainerCode && !trainerMap.has(selectedTrainerCode)) {
        selectedTrainerCode = "";
      }
      if (selectedTrainerCode && !trainerAllowed_(selectedTrainerCode)) {
        selectedTrainerCode = "";
      }

      renderTrainerChoices();
      updateTrainerStatus_();
    } catch (error) {
      trainerMap.clear();
      selectedTrainerCode = "";
      renderTrainerChoices();
      if (status) {
        status.textContent = "トレーナー一覧を取得できませんでした。GASの公開トレーナーAPIを確認してください。";
      }
      console.error("getPublicTrainers failed", error);
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

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;

    try {
      const options = { cache: "no-store" };
      if (controller) options.signal = controller.signal;
      const response = await nativeFetch(url.toString(), options);
      return await response.json();
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "空き状況の取得がタイムアウトしました。再度お試しください。"
        : (error?.message || "取得失敗");
      return { ok: false, message, data: { date, slots: [] } };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // getAvailableSlots: 会員確認前は日程を出さない。
  // 吉丸対象外会員はトレーナーを1人選択してから、その担当者の空きだけを取得する。
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
      document.querySelector("#customerSection")?.classList.add("is-hidden");
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
    document.querySelector("#serviceGrid")?.addEventListener("click", (event) => {
      if (!event.target.closest?.(".service-card")) return;
      selectedTrainerCode = "";
      renderTrainerChoices();
    }, true);
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
    document.querySelector("#customerSection")?.classList.add("is-hidden");
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
      const method = String(init?.method || "GET").toUpperCase();
      const target = typeof input === "string" ? input : String(input?.url || input || "");

      if (selectedTrainerCode && method === "POST" && target === API_URL && typeof init?.body === "string") {
        const body = JSON.parse(init.body);
        if (body?.action === "createReservation") {
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
})();
