(() => {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
  const QUERY = new URLSearchParams(window.location.search);
  const TOKEN = QUERY.get("token") || "";
  const ADMIN_VIEW_TOKEN = QUERY.get("view_token") || "";
  const CLIENT_VIEW_TOKEN = QUERY.get("client_token") || "";
  const IS_SHEET_PREVIEW = QUERY.get("preview") === "sheet";
  const IS_PRINT_PREVIEW = QUERY.get("preview") === "print";
  const IS_PREVIEW = QUERY.get("preview") === "1" ||
    (!TOKEN && !ADMIN_VIEW_TOKEN && !CLIENT_VIEW_TOKEN && !IS_SHEET_PREVIEW && !IS_PRINT_PREVIEW);
  const STORAGE_KEY = `tfg-counseling-draft-v1:${IS_PREVIEW ? "preview" : TOKEN.slice(0, 12) || "invalid"}`;
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
  const counselingSheetScreen = document.getElementById("counselingSheetScreen");
  const printPage = document.getElementById("printPage");
  const printSheet = document.getElementById("printSheet");
  const printSheetButton = document.getElementById("printSheetButton");
  const copyClientLinkButton = document.getElementById("copyClientLinkButton");
  const sheetViewBadge = document.getElementById("sheetViewBadge");
  const sheetViewMessage = document.getElementById("sheetViewMessage");
  const previewModeBanner = document.getElementById("previewModeBanner");
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
        ["時期・期間", "diet_experience_period", "", false, true],
        ["方法", "diet_experience_method", "", false, true],
        ["成果", "diet_experience_result", "", false, true]
      ]
    }
  ];

  const samplePrintSheet = {
    answer_id: "DCA-SAMPLE",
    submitted_at: "2026-09-16 18:30",
    counseling_date: "2026-09-20",
    member_type: "非会員",
    name: "山田 太郎",
    staff_name: "担当スタッフ",
    age: "37",
    gender: "男性",
    height_cm: "170",
    weight_kg: "78",
    bmi: "27",
    bmr_kcal: "1715",
    concerns: "全体、おなか周り",
    target_weight_kg: "68",
    target_weight_diff_kg: "-10",
    reduction_rate: "0.1282",
    target_bmi: "23.5",
    target_bmr_kcal: "1608",
    employment: "している",
    work_style: "デスクワーク",
    wake_work: "06:30",
    sleep_work: "23:30",
    sleep_hours_work: "7",
    wake_off: "08:00",
    sleep_off: "00:30",
    sleep_hours_off: "7.5",
    meal_count: "4",
    meals: [
      { label: "朝食", time: "07:00", menu: "ごはん、納豆、みそ汁、焼き鮭" },
      { label: "昼食", time: "12:30", menu: "そば、サラダ、コーヒー" },
      { label: "夕食", time: "20:00", menu: "ごはん、から揚げ、湯豆腐、サラダ" },
      { label: "間食", time: "16:00", menu: "ナッツ、プロテイン" }
    ],
    food_dislike: "無",
    allergy: "無",
    alcohol: "有",
    alcohol_frequency: "週2回、ビール1杯程度",
    exercise_history: "有",
    exercise_history_detail: "高校3年間、バスケットボール",
    current_exercise: "有",
    current_exercise_detail: "週2回、1回30分のウォーキング",
    medical_history: "無",
    condition: "良好",
    diet_experience: "有",
    diet_experience_period: "2025年4月から3か月間",
    diet_experience_method: "1日1食の置換えとオンラインヨガ30分を週2回",
    diet_experience_result: "体重が5kg減少し、3か月維持"
  };

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
    if (!reservationContext || IS_PREVIEW) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ values: getValues(), step: currentStep, savedAt: Date.now() }));
      const time = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date());
      saveStatus.textContent = `${time} 自動保存済み`;
    } catch (_) {
      saveStatus.textContent = "入力内容を保存できませんでした";
    }
  }

  function scheduleSave() {
    if (IS_PREVIEW) {
      saveStatus.textContent = "確認用プレビュー";
      return;
    }
    saveStatus.textContent = "保存中…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 350);
  }

  function restoreDraft() {
    if (IS_PREVIEW) return;
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

  function waitForSubmission_(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function getSubmittedDietCounselingContext_() {
    try {
      const result = await apiGet("getDietCounselingFormContext", { token: TOKEN });
      if (result?.ok === true && result.data?.submitted === true) {
        return {
          ok: true,
          data: { answer_id: result.data.answer_id || "" }
        };
      }
    } catch (_) {
      // 一時的な通信失敗は次の確認で再試行する。
    }
    return null;
  }

  const SUBMIT_DISPLAY_LIMIT_MS = 9000;
  const SUBMIT_CONFIRM_INITIAL_DELAY_MS = 250;
  const SUBMIT_CONFIRM_POLL_MS = 500;
  const BACKGROUND_CONFIRM_LIMIT_MS = 60000;

  async function waitForSubmittedDietCounselingContext_(shouldStop) {
    const backgroundDeadline = Date.now() + BACKGROUND_CONFIRM_LIMIT_MS;
    await waitForSubmission_(SUBMIT_CONFIRM_INITIAL_DELAY_MS);
    while (!shouldStop() && Date.now() < backgroundDeadline) {
      const confirmed = await getSubmittedDietCounselingContext_();
      if (confirmed) return confirmed;
      await waitForSubmission_(SUBMIT_CONFIRM_POLL_MS);
    }
    return null;
  }

  async function submitDietCounselingWithConfirmation_(payload) {
    let stopBackgroundConfirmation = false;
    const postOutcome = apiPost(payload)
      .then((result) => ({ type: "post", result }))
      .catch((error) => ({ type: "post-error", error }));
    const statusOutcome = waitForSubmittedDietCounselingContext_(
      () => stopBackgroundConfirmation
    )
      .then((result) => ({ type: "status", result }))
      .catch((error) => ({ type: "status-error", error }));
    const displayLimitOutcome = waitForSubmission_(SUBMIT_DISPLAY_LIMIT_MS)
      .then(() => ({ type: "display-limit" }));

    const first = await Promise.race([postOutcome, statusOutcome, displayLimitOutcome]);
    if (first.type === "status" && first.result) {
      stopBackgroundConfirmation = true;
      return first.result;
    }
    if (first.type === "post") {
      if (first.result?.ok === true) {
        stopBackgroundConfirmation = true;
        return first.result;
      }
      if (first.result?.code === "ALREADY_SUBMITTED") {
        stopBackgroundConfirmation = true;
        return { ok: true, data: { answer_id: "" } };
      }
      stopBackgroundConfirmation = true;
      return first.result;
    }
    if (first.type === "post-error") {
      const recovery = await Promise.race([statusOutcome, displayLimitOutcome]);
      if (recovery.type === "status" && recovery.result) {
        stopBackgroundConfirmation = true;
        return recovery.result;
      }
    }
    return {
      ok: true,
      data: { answer_id: "", pending_confirmation: true }
    };
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

  function escapeSheetHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
    }[character]));
  }

  function sheetValue(value, suffix = "") {
    const text = String(value ?? "").trim();
    if (!text) return '<span class="sheet-empty">—</span>';
    return `${escapeSheetHtml(text).replace(/\n/g, "<br>")}${escapeSheetHtml(suffix)}`;
  }

  function sheetItem(label, value, suffix = "", full = false) {
    return `<div class="sheet-data-item${full ? " is-full" : ""}"><dt>${escapeSheetHtml(label)}</dt><dd>${sheetValue(value, suffix)}</dd></div>`;
  }

  function formatSheetPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    const percent = Math.abs(number) <= 1 ? number * 100 : number;
    return String(Math.round(percent * 10) / 10);
  }

  function renderCounselingSheet(data, options = {}) {
    const sheet = data || {};
    const isClientView = options.clientView === true;
    const workStyle = [sheet.work_style, sheet.work_other].filter(Boolean).join("／");
    const targetWeight = sheet.target_later ? "カウンセリング時に決定" : sheet.target_weight_kg;
    const targetWeightSuffix = sheet.target_later ? "" : " kg";
    const meals = Array.isArray(sheet.meals) ? sheet.meals : [];
    const mealRows = meals.map((meal) => `
      <tr>
        <th scope="row">${sheetValue(meal.label)}</th>
        <td>${sheetValue(meal.time)}</td>
        <td>${sheetValue(meal.menu)}</td>
      </tr>`).join("");
    const consultationDate = formatReservationDate(sheet.counseling_date, "");

    const personMeta = [sheet.member_type, sheet.member_no].filter(Boolean).join(" ／ ");
    const sheetMeta = isClientView
      ? `<span><small>カウンセリング日</small>${sheetValue(consultationDate)}</span>
        <span><small>担当</small>${sheetValue(sheet.staff_name)}</span>`
      : `<span><small>カウンセリング日</small>${sheetValue(consultationDate)}</span>
        <span><small>担当</small>${sheetValue(sheet.staff_name)}</span>
        <span><small>回答日時</small>${sheetValue(sheet.submitted_at)}</span>
        <span><small>回答ID</small>${sheetValue(sheet.answer_id)}</span>`;

    printSheet.innerHTML = `
      <header class="print-sheet-header">
        <div>
          <p>DIET COUNSELING</p>
          <h1>ダイエットカウンセリングシート</h1>
        </div>
        <div class="sheet-person">
          <strong>${sheetValue(sheet.name, " 様")}</strong>
          ${personMeta ? `<span>${sheetValue(personMeta)}</span>` : ""}
        </div>
      </header>
      <div class="sheet-meta${isClientView ? " is-client" : ""}">${sheetMeta}</div>
      <section class="sheet-metrics" aria-label="基本データ">
        <div><small>年齢</small><strong>${sheetValue(sheet.age, " 歳")}</strong></div>
        <div><small>性別</small><strong>${sheetValue(sheet.gender)}</strong></div>
        <div><small>身長</small><strong>${sheetValue(sheet.height_cm, " cm")}</strong></div>
        <div><small>体重</small><strong>${sheetValue(sheet.weight_kg, " kg")}</strong></div>
        <div><small>BMI</small><strong>${sheetValue(sheet.bmi)}</strong></div>
        <div><small>基礎代謝</small><strong>${sheetValue(sheet.bmr_kcal, " kcal")}</strong></div>
      </section>
      <div class="sheet-content-grid">
        <section class="sheet-section">
          <h2><span>01</span>目標・お体について</h2>
          <dl class="sheet-data-grid">
            ${sheetItem("気になる部位", sheet.concerns, "", true)}
            ${sheetItem("目標体重", targetWeight, targetWeightSuffix)}
            ${sheetItem("現在との差", sheet.target_weight_diff_kg, " kg")}
            ${sheetItem("減量率", formatSheetPercent(sheet.reduction_rate), "%")}
            ${sheetItem("目標BMI", sheet.target_bmi)}
            ${sheetItem("目標基礎代謝", sheet.target_bmr_kcal, " kcal")}
          </dl>
        </section>
        <section class="sheet-section">
          <h2><span>02</span>仕事・生活リズム</h2>
          <dl class="sheet-data-grid sheet-work-meta">
            ${sheetItem("就業", sheet.employment)}
            ${sheetItem("仕事スタイル", workStyle)}
          </dl>
          <div class="sheet-rhythm" aria-label="生活リズム">
            <section class="sheet-rhythm-group">
              <h3>仕事のとき</h3>
              <dl class="sheet-rhythm-grid">
                ${sheetItem("就寝", sheet.sleep_work)}
                ${sheetItem("起床", sheet.wake_work)}
                ${sheetItem("睡眠時間", sheet.sleep_hours_work, " 時間")}
              </dl>
            </section>
            <section class="sheet-rhythm-group">
              <h3>休みのとき</h3>
              <dl class="sheet-rhythm-grid">
                ${sheetItem("就寝", sheet.sleep_off)}
                ${sheetItem("起床", sheet.wake_off)}
                ${sheetItem("睡眠時間", sheet.sleep_hours_off, " 時間")}
              </dl>
            </section>
          </div>
        </section>
        <section class="sheet-section is-wide">
          <h2><span>03</span>お食事について <small>1日 ${sheetValue(sheet.meal_count, " 回")}</small></h2>
          <table class="sheet-meal-table">
            <thead><tr><th>区分</th><th>時間</th><th>お食事内容</th></tr></thead>
            <tbody>${mealRows}</tbody>
          </table>
          <dl class="sheet-data-grid sheet-food-notes">
            ${sheetItem("好き嫌い", sheet.food_dislike)}
            ${sheetItem("苦手な食材", sheet.dislike_detail)}
            ${sheetItem("アレルギー", sheet.allergy)}
            ${sheetItem("アレルギー詳細", sheet.allergy_detail)}
            ${sheetItem("飲酒", sheet.alcohol)}
            ${sheetItem("飲酒頻度", sheet.alcohol_frequency)}
          </dl>
        </section>
        <section class="sheet-section">
          <h2><span>04</span>運動・体調について</h2>
          <dl class="sheet-data-grid">
            ${sheetItem("運動経験", sheet.exercise_history)}
            ${sheetItem("運動経験の詳細", sheet.exercise_history_detail, "", true)}
            ${sheetItem("定期的な運動", sheet.current_exercise)}
            ${sheetItem("現在の運動内容", sheet.current_exercise_detail, "", true)}
            ${sheetItem("既往症", sheet.medical_history)}
            ${sheetItem("既往症の詳細", sheet.medical_history_detail, "", true)}
            ${sheetItem("現在の体調", sheet.condition)}
            ${sheetItem("体調の詳細", sheet.condition_detail, "", true)}
          </dl>
        </section>
        <section class="sheet-section">
          <h2><span>05</span>ダイエット経験</h2>
          <dl class="sheet-data-grid">
            ${sheetItem("経験", sheet.diet_experience)}
            ${sheetItem("時期・期間", sheet.diet_experience_period)}
            ${sheetItem("方法", sheet.diet_experience_method, "", true)}
            ${sheetItem("成果", sheet.diet_experience_result, "", true)}
          </dl>
        </section>
      </div>
      <footer class="print-sheet-footer">このシートは回答内容から自動作成されています。基礎代謝は改良版ハリス・ベネディクト式による参考値です。</footer>`;
  }

  function showCounselingSheet(data, options = {}) {
    const isClientView = options.clientView === true;
    formShell.hidden = true;
    document.querySelector(".site-header").hidden = true;
    accessGate.hidden = true;
    completionScreen.hidden = true;
    renderCounselingSheet(data, { clientView: isClientView });
    sheetViewBadge.textContent = isClientView ? "お客様用" : "管理者用";
    sheetViewMessage.textContent = isClientView
      ? "お客様用・閲覧専用（編集はできません）"
      : "カウンセリング時のiPad表示・A4縦1枚印刷用";
    printSheetButton.hidden = isClientView;
    copyClientLinkButton.hidden = isClientView || !ADMIN_VIEW_TOKEN;
    counselingSheetScreen.hidden = false;
    document.body.classList.add("is-sheet-view");
    document.body.classList.toggle("is-client-sheet-view", isClientView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showCompletion(id) {
    formShell.hidden = true;
    document.querySelector(".site-header").hidden = true;
    accessGate.hidden = true;
    counselingSheetScreen.hidden = true;
    completionScreen.hidden = false;
    answerId.textContent = id ? `回答ID：${id}` : "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetPrintLayout() {
    document.body.classList.remove("is-print-layout");
    printSheet.style.removeProperty("transform");
    printSheet.style.removeProperty("width");
    delete printSheet.dataset.printScale;
  }

  function preparePrintLayout() {
    document.body.classList.add("is-print-layout");
    printSheet.style.removeProperty("transform");
    printSheet.style.width = "100%";
    delete printSheet.dataset.printScale;
    void printSheet.offsetHeight;

    const availableHeight = printPage.clientHeight;
    const requiredHeight = printSheet.scrollHeight;
    const scale = availableHeight > 0 && requiredHeight > availableHeight
      ? availableHeight / requiredHeight
      : 1;
    printSheet.style.width = `${100 / scale}%`;
    printSheet.style.transform = `scale(${scale})`;
    printSheet.dataset.printScale = scale.toFixed(4);
  }

  async function initializeForm() {
    createTimeOptions();
    if (IS_SHEET_PREVIEW || IS_PRINT_PREVIEW) {
      document.body.classList.remove("is-loading");
      showCounselingSheet(samplePrintSheet);
      sheetViewMessage.textContent = IS_PRINT_PREVIEW
        ? "A4縦1枚の印刷レイアウト確認用"
        : "管理者用画面の確認用プレビュー";
      if (IS_PRINT_PREVIEW) {
        document.body.classList.add("is-print-preview");
        preparePrintLayout();
      }
      return;
    }
    if (ADMIN_VIEW_TOKEN) {
      if (!/^[a-f0-9]{64}$/i.test(ADMIN_VIEW_TOKEN)) {
        showAccessError("管理者用URLが正しくありません。");
        return;
      }
      try {
        const result = await apiGet("getDietCounselingStaffSheet", {
          token: ADMIN_VIEW_TOKEN
        });
        if (!result.ok) throw new Error(result.message || "管理者用URLを確認できませんでした。");
        document.body.classList.remove("is-loading");
        showCounselingSheet(result.data || {});
      } catch (error) {
        showAccessError(error.message);
      }
      return;
    }
    if (CLIENT_VIEW_TOKEN) {
      if (!/^[a-f0-9]{64}$/i.test(CLIENT_VIEW_TOKEN)) {
        showAccessError("お客様用URLが正しくありません。");
        return;
      }
      try {
        const result = await apiGet("getDietCounselingClientSheet", {
          token: CLIENT_VIEW_TOKEN
        });
        if (!result.ok) throw new Error(result.message || "お客様用URLを確認できませんでした。");
        document.body.classList.remove("is-loading");
        showCounselingSheet(result.data || {}, { clientView: true });
      } catch (error) {
        showAccessError(error.message);
      }
      return;
    }
    if (IS_PREVIEW) {
      reservationContext = { consultation_method: "ONLINE" };
      reservationDate.textContent = "確認用プレビュー";
      reservationMethod.textContent = "ONLINE";
      previewModeBanner.hidden = false;
      submitButton.innerHTML = "送信テスト <span aria-hidden=\"true\">✓</span>";
      accessGate.hidden = true;
      document.body.classList.remove("is-loading");
      showStep(0, { skipScroll: true });
      return;
    }
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

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (_) {
        // iOS Safariなどで権限が失効した場合は、従来のコピー方式を試す。
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("URLをコピーできませんでした。");
  }

  form.addEventListener("input", (event) => {
    event.target.closest(".has-error")?.classList.remove("has-error");
    updateConditionals();
    scheduleSave();
  });
  form.addEventListener("change", updateConditionals);

  nextButton.addEventListener("click", () => {
    if (!IS_PREVIEW && !validateStep(currentStep)) return;
    showStep(currentStep + 1);
  });
  backButton.addEventListener("click", () => showStep(currentStep - 1));

  document.getElementById("summary").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-step]");
    if (button) showStep(Number(button.dataset.editStep));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (IS_PREVIEW) {
      showToast("確認用プレビューのため、回答は送信されません。");
      return;
    }
    const invalidStep = [0, 1, 2, 3, 4].find((index) => !validateStep(index));
    if (invalidStep !== undefined) {
      showStep(invalidStep);
      return;
    }

    submitButton.disabled = true;
    const originalText = submitButton.innerHTML;
    submitButton.textContent = "送信中…";
    try {
      const result = await submitDietCounselingWithConfirmation_({
        action: "submitDietCounselingResponse",
        token: TOKEN,
        answers: getValues()
      });
      if (!result.ok) throw new Error(result.message || "回答を送信できませんでした。");
      localStorage.removeItem(STORAGE_KEY);
      submitButton.disabled = false;
      submitButton.innerHTML = originalText;
      showCompletion(result.data?.answer_id || "");
    } catch (error) {
      showToast(error.message || "回答を送信できませんでした。時間をおいて再度お試しください。");
      submitButton.disabled = false;
      submitButton.innerHTML = originalText;
    }
  });

  printSheetButton.addEventListener("click", () => {
    preparePrintLayout();
    window.setTimeout(() => window.print(), 50);
  });
  copyClientLinkButton.addEventListener("click", async () => {
    copyClientLinkButton.disabled = true;
    const originalText = copyClientLinkButton.innerHTML;
    copyClientLinkButton.textContent = "発行中…";
    try {
      const result = await apiPost({
        action: "issueDietCounselingClientView",
        admin_token: ADMIN_VIEW_TOKEN
      });
      if (!result.ok || !result.data?.url) {
        throw new Error(result.message || "お客様用URLを発行できませんでした。");
      }
      try {
        await copyTextToClipboard(result.data.url);
        showToast(`お客様用URLをコピーしました（期限：${result.data.expires_at}）`);
      } catch (_) {
        window.prompt("お客様用URLです。長押ししてコピーしてください。", result.data.url);
      }
    } catch (error) {
      showToast(error.message || "お客様用URLを発行できませんでした。");
    } finally {
      copyClientLinkButton.disabled = false;
      copyClientLinkButton.innerHTML = originalText;
    }
  });
  window.addEventListener("beforeprint", preparePrintLayout);
  window.addEventListener("afterprint", () => {
    if (!IS_PRINT_PREVIEW) resetPrintLayout();
  });

  initializeForm();
})();
