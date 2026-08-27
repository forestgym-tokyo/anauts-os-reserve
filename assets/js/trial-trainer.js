/* A-nauts OS Reserve - trial trainer selection */
(() => {
  "use strict";

  const routeKey = location.pathname.split("/").filter(Boolean).pop() || "";
  if (routeKey !== "trial") return;

  let selectedTrainerCode = "";
  let selectedTrainerName = "";
  const trainerMap = new Map();
  const nativeFetch = window.fetch.bind(window);
  const nativeLoadWeek = loadWeek;

  function trainerLabel(name) {
    const text = String(name || "").trim();
    if (!text) return "";
    return /トレーナー$/.test(text) ? text : `${text}トレーナー`;
  }

  function ensureTrainerFilter() {
    if (document.querySelector("#trialTrainerFilter")) return;

    const availability = document.querySelector("#availabilitySection");
    const toolbar = availability?.querySelector(".week-toolbar");
    if (!availability || !toolbar) return;

    const box = document.createElement("div");
    box.id = "trialTrainerFilter";
    box.style.margin = "0 0 22px";
    box.innerHTML = `
      <div style="font-weight:800;font-size:16px;margin-bottom:10px">トレーナーで絞り込む</div>
      <div id="trialTrainerChoices" style="display:flex;flex-wrap:wrap;gap:8px"></div>
      <p id="trialTrainerStatus" style="margin:9px 0 0;font-size:12px;opacity:.72">トレーナー一覧を読み込んでいます…</p>
    `;
    toolbar.insertAdjacentElement("beforebegin", box);
  }

  function renderTrainerChoices() {
    ensureTrainerFilter();
    const area = document.querySelector("#trialTrainerChoices");
    if (!area) return;

    const choices = [
      { code: "", name: "すべてのトレーナー" },
      ...Array.from(trainerMap.values()).sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "ja")
      )
    ];

    area.replaceChildren();

    choices.forEach((trainer) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = trainer.code
        ? trainerLabel(trainer.name || trainer.code)
        : trainer.name;
      button.dataset.trainerCode = trainer.code;
      button.style.padding = "9px 13px";
      button.style.borderRadius = "999px";
      button.style.border = trainer.code === selectedTrainerCode
        ? "1px solid #d9b85d"
        : "1px solid rgba(255,255,255,.18)";
      button.style.background = trainer.code === selectedTrainerCode
        ? "rgba(217,184,93,.18)"
        : "transparent";
      button.style.color = "inherit";
      button.style.fontWeight = "700";
      button.style.cursor = "pointer";

      button.addEventListener("click", () => {
        if (selectedTrainerCode === trainer.code) return;

        selectedTrainerCode = trainer.code;
        selectedTrainerName = trainer.code ? trainer.name : "";
        selectedSlot = null;
        document.querySelector("#customerSection")?.classList.add("is-hidden");
        renderTrainerChoices();

        const status = document.querySelector("#trialTrainerStatus");
        if (status) {
          status.textContent = trainer.code
            ? `${trainerLabel(trainer.name)}の予約可能時間を表示します。`
            : "すべてのトレーナーの予約可能時間を表示します。";
        }

        nativeLoadWeek();
      });

      area.append(button);
    });
  }

  async function loadPublicTrainers() {
    ensureTrainerFilter();
    const status = document.querySelector("#trialTrainerStatus");

    try {
      const storeCode = String(selectedService?.store_code || "YACHIYO").trim().toUpperCase();
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

      if (selectedTrainerCode && !trainerMap.has(selectedTrainerCode)) {
        selectedTrainerCode = "";
        selectedTrainerName = "";
      }

      renderTrainerChoices();

      if (status) {
        status.textContent = trainerMap.size
          ? "トレーナーを指定すると、そのトレーナーの予約可能時間だけを表示します。"
          : "現在表示できるトレーナーがいません。";
      }
    } catch (error) {
      trainerMap.clear();
      selectedTrainerCode = "";
      selectedTrainerName = "";
      renderTrainerChoices();
      if (status) {
        status.textContent = "トレーナー一覧を取得できませんでした。";
      }
      console.error("getPublicTrainers failed", error);
    }
  }

  // 通常パーソナルと同じく、未指定は「すべてのトレーナー」として空き枠を表示する。
  loadWeek = async function() {
    return nativeLoadWeek();
  };

  // 個別指定時だけ担当トレーナーで絞り込む。
  fetchSlots = async function(date) {
    const url = new URL(API_URL);
    url.searchParams.set("action", "getAvailableSlots");
    url.searchParams.set("service_code", selectedService.service_code);
    url.searchParams.set("date", date);
    if (selectedTrainerCode) {
      url.searchParams.set("staff_code", selectedTrainerCode);
    }
    url.searchParams.set("_", Date.now().toString());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await nativeFetch(url.toString(), {
        cache: "no-store",
        signal: controller.signal
      });
      return await response.json();
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "空き状況の取得がタイムアウトしました。再度お試しください。"
        : (error?.message || "取得失敗");
      return { ok: false, message, data: { date, slots: [] } };
    } finally {
      clearTimeout(timer);
    }
  };

  // 個別指定した場合だけ予約POSTへ担当者を含める。
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
      // JSON以外は変更しない。
    }

    return nativeFetch(input, init);
  };

  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".slot-button")) return;

    setTimeout(() => {
      const summary = document.querySelector("#selectedSlotText");
      const label = trainerLabel(selectedTrainerName);
      if (summary && label && !summary.textContent.includes("担当:")) {
        summary.textContent += ` / 担当: ${label}`;
      }
    }, 0);
  });

  ensureTrainerFilter();
  loadPublicTrainers();
})();
