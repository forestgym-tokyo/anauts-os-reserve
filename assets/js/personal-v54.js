/* A-nauts OS Reserve - Personal booking enhancements v57 */
(() => {
  const routeKey = location.pathname.split("/").filter(Boolean).pop() || "personal";
  if (!["personal", "trial"].includes(routeKey)) return;

  const WOMEN_ONLY_TRAINER_CODE = "YOSHIMARU";
  let selectedTrainerCode = "";
  let loadedStoreCode = "";
  const trainerMap = new Map();
  const nativeFetch = window.fetch.bind(window);

  function bookingGenderReady_() {
    return window.ANAUTS_PERSONAL_GENDER_READY === true;
  }

  function bookingGender_() {
    return String(window.ANAUTS_PERSONAL_GENDER || "").trim();
  }

  function isMaleBooking_() {
    return bookingGender_() === "男性";
  }

  function trainerAllowed_(code) {
    const normalized = String(code || "").trim().toUpperCase();
    return !(isMaleBooking_() && normalized === WOMEN_ONLY_TRAINER_CODE);
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
      { code: "", name: "すべてのトレーナー" },
      ...allowed.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "ja")
      )
    ];

    if (selectedTrainerCode && !trainerAllowed_(selectedTrainerCode)) {
      selectedTrainerCode = "";
    }

    area.replaceChildren();

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

    if (!bookingGenderReady_()) {
      const status = document.querySelector("#personalTrainerStatus");
      if (status) status.textContent = "会員情報・性別の確認後に表示します。";
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
    status.textContent = count
      ? "トレーナーを指定すると、そのトレーナーの予約可能時間だけを表示します。"
      : "現在表示できるトレーナーがいません。";
  }

  function showTrialFixedPlan_() {
    if (routeKey !== "trial" || !selectedService) return;

    const section = document.querySelector("#serviceSection");
    const grid = document.querySelector("#serviceGrid");
    if (!section || !grid) return;

    grid.replaceChildren();
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await nativeFetch(url.toString(), { cache: "no-store", signal: controller.signal });
      return await response.json();
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "空き状況の取得がタイムアウトしました。再度お試しください。"
        : (error?.message || "取得失敗");
      return { ok: false, message, data: { date, slots: [] } };
    } finally {
      clearTimeout(timer);
    }
  }

  function slotKey_(slot) {
    return [
      String(slot?.date || ""),
      String(slot?.start_time || "").slice(0, 5),
      String(slot?.end_time || "").slice(0, 5)
    ].join("|");
  }

  function mergeTrainerSlotResults_(date, results) {
    const successful = results.filter((result) => result?.ok);
    if (!successful.length) {
      return results[0] || { ok: false, message: "空き時間を取得できませんでした。", data: { date, slots: [] } };
    }

    const base = successful[0];
    const merged = new Map();

    successful.forEach((result) => {
      const slots = Array.isArray(result?.data?.slots) ? result.data.slots : [];
      slots.forEach((slot) => {
        const key = slotKey_(slot);
        if (!merged.has(key)) merged.set(key, slot);
      });
    });

    const slots = Array.from(merged.values()).sort((a, b) =>
      String(a?.start_time || "").localeCompare(String(b?.start_time || ""))
    );

    return {
      ...base,
      ok: true,
      data: {
        ...(base.data || {}),
        date,
        slots
      }
    };
  }

  // getAvailableSlots: 性別確定前は日程を出さない。
  // 男性の「すべて」は女性限定トレーナーを除く各トレーナーの空きを統合する。
  fetchSlots = async function(date) {
    if (!bookingGenderReady_()) {
      return { ok: true, data: { date, slots: [] } };
    }

    if (selectedTrainerCode) {
      if (!trainerAllowed_(selectedTrainerCode)) {
        return { ok: true, data: { date, slots: [] } };
      }
      return fetchSlotsForTrainer_(date, selectedTrainerCode);
    }

    if (!isMaleBooking_()) {
      return fetchSlotsForTrainer_(date, "");
    }

    const trainers = visibleTrainers_();
    if (!trainers.length) {
      return { ok: true, data: { date, slots: [] } };
    }

    const results = await Promise.all(
      trainers.map((trainer) => fetchSlotsForTrainer_(date, trainer.code))
    );

    return mergeTrainerSlotResults_(date, results);
  };

  // プラン選択直後は会員・性別確認を優先する。日程は確認完了後に読み込む。
  if (routeKey === "personal") {
    document.querySelector("#serviceGrid")?.addEventListener("click", () => {
      selectedTrainerCode = "";
      renderTrainerChoices();
    });
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

  document.addEventListener("anauts:booking-gender-ready", async () => {
    selectedTrainerCode = "";
    selectedSlot = null;
    document.querySelector("#customerSection")?.classList.add("is-hidden");
    await loadPublicTrainers_();
    loadWeek();
  });

  document.addEventListener("anauts:booking-gender-invalidated", () => {
    selectedTrainerCode = "";
    selectedSlot = null;
    renderTrainerChoices();
    document.querySelector("#weekList")?.replaceChildren();
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
