/* A-nauts OS Reserve - Personal booking enhancements v54 */
(() => {
  const routeKey = location.pathname.split("/").filter(Boolean).pop() || "personal";
  if (routeKey !== "personal") return;

  let selectedTrainerCode = "";
  const trainerMap = new Map();
  const nativeFetch = window.fetch.bind(window);

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
      <p style="margin:9px 0 0;font-size:12px;opacity:.72">指定しない場合は、その時間に対応可能なトレーナーから割り当てます。</p>
    `;
    toolbar.insertAdjacentElement("beforebegin", box);
    renderTrainerChoices();
  }

  function renderTrainerChoices() {
    ensureTrainerFilter();
    const area = document.querySelector("#personalTrainerChoices");
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

  function collectTrainerCandidates(results) {
    (results || []).forEach((result) => {
      const slots = Array.isArray(result?.data?.slots) ? result.data.slots : [];
      slots.forEach((slot) => {
        const candidates = Array.isArray(slot?.staff_candidates) ? slot.staff_candidates : [];
        candidates.forEach((staff) => {
          const code = String(staff?.staff_code || "").trim();
          if (!code) return;
          const name = String(staff?.staff_name || staff?.display_name || code).trim();
          trainerMap.set(code, { code, name });
        });
      });
    });
    renderTrainerChoices();
  }

  // getAvailableSlots: trainer filter + timeout so week navigation cannot remain locked indefinitely.
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

  const originalRenderWeek = renderWeek;
  renderWeek = function(results) {
    collectTrainerCandidates(results);
    originalRenderWeek(results);
  };

  // Reservation POST: preserve chosen trainer in createReservation payload.
  window.fetch = async function(input, init) {
    try {
      const method = String(init?.method || "GET").toUpperCase();
      const target = typeof input === "string" ? input : String(input?.url || input || "");

      if (
        selectedTrainerCode &&
        method === "POST" &&
        target === API_URL &&
        typeof init?.body === "string"
      ) {
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
