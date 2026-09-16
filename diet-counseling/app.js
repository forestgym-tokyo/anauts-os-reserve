(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
  const TOKEN = new URLSearchParams(window.location.search).get("token") || "";
  const STORAGE_KEY = `tfg-counseling-draft-v1:${TOKEN.slice(0, 12) || "invalid"}`;
  const TOTAL_STEPS = 6;
  const stepTitles = ["基本情報", "カラダの目標", "仕事・生活", "食事", "運動・体調", "入力内容の確認"];
  const form = document.getElementById("counselingForm");
  const steps = [...document.querySelectorAll(".form-step")];
  const indicators = [...document.querySelectorAll("[data-step-indicator]")];
  const nextButton = document.getElementById("nextButton");
  const backButton = document.getElementById("backButton");
  const submitButton = document.getElementById("submitButton");
  const formAlert = document.getElementById("formAlert");
  const saveStatus = document.getElementById("saveStatus");
  const progressBar = document.getElementById("progressBar");
  const mobileStepLabel = document.getElementById("mobileStepLabel");
  const mobileStepTitle = document.getElementById("mobileStepTitle");
  const toast = document.getElementById("toast");
  const accessGate = document.getElementById("accessGate");
  const accessTitle = document.getElementById("accessTitle");
  const accessMessage = document.getElementById("accessMessage");
  const reservationDate = document.getElementById("reservationDate");
  const reservationMethod = document.getElementById("reservationMethod");
  const formShell = document.getElementById("formShell");
  const completionScreen = document.getElementById("completionScreen");
  const answerId = document.getElementById("answerId");
  let currentStep = 0;
  let saveTimer;
  let reservationContext = null;

  const summarySections = [
    {
      title: "基本情報", step: 0, items: [
        ["お名前", "name"], ["身長", "height", "cm"], ["体重", "weight", "kg"],
        ["年齢", "age", "歳"], ["性別", "gender"]
      ]
    },
    {
      title: "カラダの目標", step: 1, items: [
        ["気になるところ", "concerns", "", true], ["その他", "concern_other"],
        ["目標体重", "target_weight", "kg"], ["目標設定", "target_later"]
      ]
    },
    {
      title: "仕事・生活", step: 2, items: [
        ["仕事", "employment"], ["仕事のスタイル", "work_style", "", true], ["その他", "work_other"],
        ["起床／仕事の日", "wake_work"], ["起床／休みの日", "wake_off"],
        ["就寝／翌日仕事", "sleep_work"], ["就寝／翌日休み", "sleep_off"]
      ]
    },
    {
      title: "食事", step: 3, items: [
        ["1日の食事回数", "meal_count", "回"], ["朝食", "breakfast_menu"], ["朝食時間", "breakfast_time"],
        ["昼食", "lunch_menu"], ["昼食時間", "lunch_time"], ["夕食", "dinner_menu"],
        ["夕食時間", "dinner_time"], ["間食", "snack_menu"], ["間食時間", "snack_time"],
        ["好き嫌い", "food_dislike"], ["苦手な食材", "dislike_detail"],
        ["アレルギー", "allergy"], ["アレルギー詳細", "allergy_detail"],
        ["飲酒", "alcohol"], ["飲酒頻度", "alcohol_frequency"]
      ]
    },
    {
      title: "運動・体調", step: 4, items: [
        ["運動歴", "exercise_history"], ["運動歴の詳細", "exercise_history_detail", "", false, true],
        ["現在の運動", "current_exercise"], ["運動内容", "current_exercise_detail", "", false, true],
        ["既往歴", "medical_history"], ["既往歴の詳細", "medical_history_detail", "", false, true],
        ["現在の体調", "condition"], ["体調の詳細", "condition_detail", "", false, true], ["ダイエット経験", "diet_experience"],
        ["期間・方法", "diet_experience_detail", "", false, true]
      ]
    }
  ];

  function createTimeOptions() {
    document.querySelectorAll(".time-select").forEach((select) => {
      select.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = select.classList.contains("optional-time") ? "時間なし" : "選択してください";
      select.appendChild(placeholder);
      for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
        const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
        const minute = String(minutes % 60).padStart(2, "0");
        const option = document.createElement("option");
        option.value = `${hour}:${minute}`;
        option.textContent = `${hour}:${minute}`;
        select.appendChild(option);
      }
    });
  }

  function getValues() {
    const data = {};
    new FormData(form).forEach((value, key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
      } else {
        data[key] = value;
      }
    });
    return data;
  }

  function saveDraft() {
    if (!reservationContext) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ values: getValues(), step: currentStep, savedAt: Date.now() }));
      const time = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date());
      saveStatus.textContent = `${time} 自動保存済み`;
    } catch (_) {
      saveStatus.textContent = "入力内容を保存できませんでした";
    }
  }

  function scheduleSave() {
    saveStatus.textContent = "保存中…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 350);
  }

  function restoreDraft() {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (_) { return; }
    if (!draft?.values) return;

    Object.entries(draft.values).forEach(([name, rawValue]) => {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      const fields = [...form.elements].filter((field) => field.name === name);
      fields.forEach((field) => {
        if (field.type === "checkbox" || field.type === "radio") field.checked = values.includes(field.value);
        else field.value = values[0] ?? "";
      });
    });
    updateConditionals();
    saveStatus.textContent = "前回の入力内容を復元しました";
  }

  async function apiGet(action, params = {}) {
    const url = new URL(API_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("_", String(Date.now()));
    const response = await fetch(url.toString(), { cache: "no-store" });
    return response.json();
  }

  async function apiPost(payload) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    return response.json();
  }

  function formatReservationDate(value, time) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return [value, time].filter(Boolean).join(" ") || "—";
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
    return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日（${weekday}） ${time || ""}`.trim();
  }

  function showAccessError(message) {
    document.body.classList.add("is-loading");
    accessGate.hidden = false;
    accessGate.querySelector(".access-card")?.classList.add("is-error");
    accessTitle.textContent = "専用URLを確認できませんでした";
    accessMessage.textContent = message || "お申込み先へお問い合わせください。";
  }

  function showCompletion(id) {
    formShell.hidden = true;
    document.querySelector(".site-header").hidden = true;
    accessGate.hidden = true;
    completionScreen.hidden = false;
    answerId.textContent = id ? `回答ID：${id}` : "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function initializeForm() {
    createTimeOptions();
    if (!/^[a-f0-9]{64}$/i.test(TOKEN)) {
      showAccessError("メールに記載された専用URLからアクセスしてください。");
      return;
    }

    try {
      const result = await apiGet("getDietCounselingFormContext", { token: TOKEN });
      if (!result.ok) throw new Error(result.message || "専用URLを確認できませんでした。");
      reservationContext = result.data || {};
      if (reservationContext.submitted) {
        document.body.classList.remove("is-loading");
        showCompletion(reservationContext.answer_id);
        return;
      }

      restoreDraft();
      const name = document.getElementById("name");
      name.value = reservationContext.customer_name || name.value || "";
      name.readOnly = !!reservationContext.customer_name;
      name.setAttribute("aria-readonly", String(name.readOnly));
      reservationDate.textContent = formatReservationDate(
        reservationContext.counseling_date,
        reservationContext.start_time
      );
      reservationMethod.textContent = reservationContext.consultation_method || "ONLINE";
      accessGate.hidden = true;
      document.body.classList.remove("is-loading");
      showStep(0, { skipScroll: true });
    } catch (error) {
      showAccessError(error.message);
    }
  }

  function toggleRegion(id, show) {
    const region = document.getElementById(id);
    if (!region) return;
    region.hidden = !show;
    region.setAttribute("aria-hidden", String(!show));
    if (!show) region.classList.remove("has-error");
  }

  function updateConditionals() {
    document.querySelectorAll("[data-reveal]").forEach((input) => toggleRegion(input.dataset.reveal, input.checked));

    const showMap = new Map();
    document.querySelectorAll("[data-show]").forEach((input) => {
      showMap.set(input.dataset.show, (showMap.get(input.dataset.show) || false) || input.checked);
    });
    document.querySelectorAll("[data-show]").forEach((input) => toggleRegion(input.dataset.show, showMap.get(input.dataset.show)));

    const targetLater = document.getElementById("target_later");
    const targetWeight = document.getElementById("target_weight");
    targetWeight.disabled = targetLater.checked;
    if (targetLater.checked) {
      targetWeight.value = "";
      targetWeight.closest(".field").classList.remove("has-error");
    }
  }

  function setError(container, hasError) {
    container?.classList.toggle("has-error", hasError);
    return !hasError;
  }

  function validateStep(index) {
    const step = steps[index];
    if (!step) return true;
    let valid = true;

    step.querySelectorAll("input[required], select[required], textarea[required]").forEach((field) => {
      if (field.disabled || field.closest("[hidden]")) return;
      const isValid = field.checkValidity();
      setError(field.closest(".field"), !isValid);
      valid = isValid && valid;
    });

    step.querySelectorAll("[data-required-group]").forEach((group) => {
      const name = group.dataset.requiredGroup;
      const isValid = !!step.querySelector(`input[name="${name}"]:checked`);
      setError(group, !isValid);
      valid = isValid && valid;
    });

    step.querySelectorAll("[data-required-radio]").forEach((group) => {
      const name = group.dataset.requiredRadio;
      const isValid = !!step.querySelector(`input[name="${name}"]:checked`);
      setError(group, !isValid);
      valid = isValid && valid;
    });

    step.querySelectorAll("[data-required-when-visible]").forEach((group) => {
      if (group.hidden) return;
      const name = group.dataset.requiredWhenVisible;
      const isValid = !!group.querySelector(`input[name="${name}"]:checked`);
      setError(group, !isValid);
      valid = isValid && valid;
    });

    if (index === 1) {
      const targetWeight = document.getElementById("target_weight");
      const targetLater = document.getElementById("target_later");
      const targetValid = targetLater.checked || (targetWeight.value && targetWeight.checkValidity());
      setError(targetWeight.closest(".field"), !targetValid);
      valid = !!targetValid && valid;
    }

    formAlert.hidden = valid;
    if (!valid) {
      const firstError = step.querySelector(".has-error");
      firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return valid;
  }

  function valueFor(name, multiple = false) {
    const fields = [...form.elements].filter((field) => field.name === name);
    if (!fields.length) return "";
    if (multiple) return fields.filter((field) => field.checked).map((field) => field.value).join("、");
    const checkable = fields.find((field) => field.type === "radio" || field.type === "checkbox");
    if (checkable) return fields.find((field) => field.checked)?.value || "";
    return fields[0].value.trim();
  }

  function renderSummary() {
    const summary = document.getElementById("summary");
    summary.replaceChildren();
    summarySections.forEach((section) => {
      const card = document.createElement("article");
      card.className = "summary-card";
      const header = document.createElement("div");
      header.className = "summary-card-header";
      const heading = document.createElement("h3");
      heading.textContent = section.title;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "summary-edit";
      edit.dataset.editStep = String(section.step);
      edit.textContent = "編集";
      header.append(heading, edit);

      const grid = document.createElement("dl");
      grid.className = "summary-grid";
      section.items.forEach(([label, name, unit = "", multiple = false, full = false]) => {
        const value = valueFor(name, multiple);
        if (!value) return;
        const item = document.createElement("div");
        item.className = `summary-item${full ? " full" : ""}`;
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = `${value}${unit}`;
        item.append(term, description);
        grid.appendChild(item);
      });
      card.append(header, grid);
      summary.appendChild(card);
    });
  }

  function showStep(index, options = {}) {
    currentStep = Math.max(0, Math.min(TOTAL_STEPS - 1, index));
    steps.forEach((step, stepIndex) => {
      const active = stepIndex === currentStep;
      step.hidden = !active;
      step.classList.toggle("is-active", active);
    });
    indicators.forEach((item, itemIndex) => {
      item.classList.toggle("is-current", itemIndex === currentStep);
      item.classList.toggle("is-complete", itemIndex < currentStep);
    });
    backButton.hidden = currentStep === 0;
    nextButton.hidden = currentStep === TOTAL_STEPS - 1;
    submitButton.hidden = currentStep !== TOTAL_STEPS - 1;
    mobileStepLabel.textContent = `STEP ${currentStep + 1} / ${TOTAL_STEPS}`;
    mobileStepTitle.textContent = stepTitles[currentStep];
    progressBar.style.width = `${((currentStep + 1) / TOTAL_STEPS) * 100}%`;
    formAlert.hidden = true;
    if (currentStep === TOTAL_STEPS - 1) renderSummary();
    if (!options.skipScroll) window.scrollTo({ top: 0, behavior: "smooth" });
    scheduleSave();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(() => toast.classList.remove("is-visible"), 3500);
  }

  form.addEventListener("input", (event) => {
    event.target.closest(".has-error")?.classList.remove("has-error");
    updateConditionals();
    scheduleSave();
  });
  form.addEventListener("change", updateConditionals);

  nextButton.addEventListener("click", () => {
    if (!validateStep(currentStep)) return;
    showStep(currentStep + 1);
  });
  backButton.addEventListener("click", () => showStep(currentStep - 1));

  document.getElementById("summary").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-step]");
    if (button) showStep(Number(button.dataset.editStep));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const invalidStep = [0, 1, 2, 3, 4].find((index) => !validateStep(index));
    if (invalidStep !== undefined) {
      showStep(invalidStep);
      return;
    }

    submitButton.disabled = true;
    const originalText = submitButton.innerHTML;
    submitButton.textContent = "送信中…";
    try {
      const result = await apiPost({
        action: "submitDietCounselingResponse",
        token: TOKEN,
        answers: getValues()
      });
      if (!result.ok) throw new Error(result.message || "回答を送信できませんでした。");
      localStorage.removeItem(STORAGE_KEY);
      showCompletion(result.data?.answer_id || "");
    } catch (error) {
      showToast(error.message || "回答を送信できませんでした。時間をおいて再度お試しください。");
      submitButton.disabled = false;
      submitButton.innerHTML = originalText;
    }
  });

  initializeForm();
})();
