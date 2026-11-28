(function loadCampaignCalculation(initialize) {
  "use strict";

  if (typeof module !== "undefined") {
    module.exports = require("./campaign-calculation-rules.js");
    return;
  }

  if (typeof document === "undefined") return;
  const rules = globalThis.CampaignCalculationRules;
  if (rules) initialize(rules);
  else {
    // A previously installed home-screen app can load this script with cached HTML.
    const script = document.createElement("script");
    script.src = "./campaign-calculation-rules.js?v=20261128-tour-calculation";
    script.onload = () => initialize(globalThis.CampaignCalculationRules);
    document.head.append(script);
  }

})(function initializeCampaignCalculation(rules) {
  "use strict";

  const {calculate, calculateTourEnrollment, campaignPeriod, availableMonthsForDate, commonLists, defaultFields,
    tourPlanCodes, tourBenefitCodes} = rules;
  const tokyoDate = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"});
  const form = document.querySelector("#campaignCalculationForm");
  if (!form) return;
  const view = document.querySelector("#campaignCalculationView");
  const table = view.querySelector("tbody");
  const fullWidthRows = new Set([20, 29, 30, 31, 32, 33]);
  const number = new Intl.NumberFormat("ja-JP", {maximumFractionDigits: 0});
  const formatDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ?
    value.split("-").map(Number).join("/") : value;
  const formatMoney = (value, regularPrice = false) => {
    if (typeof value !== "number") return value ?? "";
    const amount = `${value < 0 ? "▲" : ""}${number.format(Math.abs(value))}円`;
    return regularPrice ? `（通常${amount}）` : amount;
  };

  if (!view.querySelector("#campaignCalculationChannel")) {
    view.querySelector("#campaignCalculationPrint").insertAdjacentHTML("beforebegin",
      '<label>受付 <select id="campaignCalculationChannel"><option value="store">見学・店頭</option><option value="web">WEB</option></select></label> ' +
      '<label>対象月 <select id="campaignCalculationMonth"></select></label>');
  }
  const channelField = view.querySelector("#campaignCalculationChannel");
  const monthField = view.querySelector("#campaignCalculationMonth");
  const title = view.querySelector(".campaign-title");
  let selectedMonth = "";
  let tour = null;

  function setChoices(field, choices, selected) {
    field.replaceChildren(...choices.map(value =>
      new Option(formatDate(value) || "（空欄）", value, value === selected)));
    field.value = selected;
  }

  for (const [name, choices] of Object.entries(commonLists)) {
    setChoices(form.elements.namedItem(name), choices, defaultFields[name]);
  }

  function refreshCampaign(now = new Date()) {
    const today = tokyoDate.format(now);
    const months = availableMonthsForDate(today, channelField.value);
    const allowed = Array.from(monthField.options, option => option.value);
    const nextMonth = months.includes(monthField.value) ? monthField.value : months[0];
    if (months.join() !== allowed.join()) setChoices(monthField, months, nextMonth);
    monthField.disabled = months.length === 1;
    if (selectedMonth !== nextMonth) {
      const period = campaignPeriod(nextMonth);
      selectedMonth = nextMonth;
      setChoices(form.elements.created, period.created, period.created.includes(today) ? today : period.created[0]);
      setChoices(form.elements.start, period.start, period.start.includes(today) ? today : period.start[0]);
      title.textContent = period.title;
    }
    if (tour) {
      form.elements.created.value = today;
      const start = form.elements.start;
      for (const option of start.options) {
        option.hidden = option.disabled = option.value < today || !option.value.startsWith(`${selectedMonth}-`);
      }
      if (start.selectedOptions[0]?.disabled) start.value = Array.from(start.options).find(option => !option.disabled)?.value || "";
    }
  }

  const printFields = Array.from(form.querySelectorAll("input, select"), field => {
    const value = document.createElement("span");
    value.className = "campaign-print-value";
    const label = field.closest("label");
    label.append(value);
    if (field.tagName === "SELECT" && field.name !== "created") label.classList.add("campaign-print-underlined");
    return [field, value];
  });

  const memberNameField = form.elements.namedItem("memberName");
  const memberNumberLabel = form.querySelector(".campaign-member-number");

  function updateMemberNumberVisibility() {
    const empty = !memberNameField.value.trim();
    memberNameField.closest("label").classList.toggle("is-name-empty", empty);
    memberNumberLabel.classList.toggle("is-name-empty", empty);
  }

  function updatePrintFields() {
    for (const [field, value] of printFields) {
      const text = field.value.trim();
      value.textContent = field.name === "memberName" && text ? `${text} さま` : formatDate(text);
      const label = field.closest("label");
      label.classList.toggle("campaign-print-empty-member",
        field.name === "memberName" && !text);
    }
  }

  function render() {
    refreshCampaign();
    updateMemberNumberVisibility();
    const data = Object.fromEntries(printFields.map(([field]) => [field.name, field.value]));
    if (tour) {
      const selection = [selectedMonth, data.created, data.method, data.plan, data.benefit, data.start].join("|");
      if (tour.selection !== selection) {
        tour.confirmation.querySelectorAll("input").forEach(input => { input.checked = false; });
        tour.selection = selection;
      }
    }
    const result = tour ? calculateTourEnrollment(data, selectedMonth, tour.confirmation.elements.bankReceived.checked) :
      calculate(data, selectedMonth);
    const rows = [];
    for (let row = 10; row <= 38; row++) {
      const [label, amount, due, note] = result.rows[row] || [];
      const tr = document.createElement("tr");
      tr.classList.toggle("campaign-emphasis", row === 15 || (row >= 22 && row <= 24));
      const cells = fullWidthRows.has(row) ? [label] :
        [label, formatMoney(amount, row === 11 || row === 16), formatDate(due || ""), note];
      cells.forEach((value, index) => {
        const td = document.createElement("td");
        if (cells.length === 1) td.colSpan = 4;
        if (index === 1 && amount < 0) td.className = "campaign-negative";
        td.textContent = value ?? "";
        tr.append(td);
      });
      rows.push(tr);
    }
    table.replaceChildren(...rows);
    const total = view.querySelector("#campaignCalculationTotal");
    view.querySelector("#campaignCalculationTotalLabel").textContent = result.totalLabel;
    total.closest(".campaign-total").classList.toggle("is-hidden", !result.totalLabel);
    total.textContent = formatMoney(result.total).replace(/^([^▲#]+)円$/, "$1");
    total.classList.toggle("campaign-negative", result.total < 0);
    form.elements.benefit.closest("label").classList.toggle("campaign-no-benefit-label", !data.plan.includes("キャンペーン"));
    if (tour) syncTourControls(tour, data, result);
  }

  function syncTourControls(session, data, result) {
    const {confirmation, submit, receiptList} = session;
    const {consent, cardRegistered, bankReceived} = confirmation.elements;
    const bank = data.method === "口座振替";
    const card = data.method === "クレジット";
    const preview = session.status === "preview";
    const receiptFees = result.receiptFees || [];
    consent.closest("label").hidden = preview;
    cardRegistered.closest("label").hidden = !card || preview;
    if (preview) confirmation.hidden = !bank;
    bankReceived.closest("label").hidden = !bank;
    receiptList.hidden = !bank || !receiptFees.length;
    receiptList.replaceChildren(...receiptFees.map(({label, amount}) => {
      const item = document.createElement("li");
      item.textContent = `${label} ${formatMoney(amount)}`;
      return item;
    }));
    const planCode = tourPlanCodes[data.plan];
    const benefitCode = tourBenefitCodes[data.benefit] || "";
    const validPlan = planCode && (!planCode.startsWith("CP_") || benefitCode);
    const firstMonthFee = result.rows[22][1];
    const paymentConfirmed = (card && cardRegistered.checked) || (bank && bankReceived.checked && receiptFees.length > 0);
    submit.disabled = session.status !== "new" || session.submitting || !validPlan || !consent.checked ||
      !paymentConfirmed || !Number.isInteger(firstMonthFee);
    session.request = {
      action: "createTourEnrollmentCalculationDraft", reservation_id: session.reservationId,
      confirmed_email: session.email, payment_method: bank ? "bank" : "card",
      created_date: data.created, start_date: data.start, plan_code: planCode, benefit_code: benefitCode,
      consent_confirmed: consent.checked, card_registered: card && cardRegistered.checked, first_month_fee: firstMonthFee,
      receipts: bank && bankReceived.checked ? receiptFees.map(({row, amount}) => ({row, amount})) : []
    };
  }

  window.openTourEnrollmentCalculation = async function (reservationId) {
    if (tour || !reservationId) return;
    const dialog = document.createElement("dialog");
    dialog.className = "tour-calculation-dialog";
    dialog.setAttribute("aria-labelledby", "tourCalculationTitle");
    dialog.innerHTML = `
      <header><h2 id="tourCalculationTitle">見学からの入会計算書</h2><button class="ghost-button" type="button" data-close>閉じる</button></header>
      <div class="tour-calculation-mount"></div>
      <footer>
        <p class="tour-calculation-email" hidden></p>
        <form class="tour-calculation-confirmation" autocomplete="off" hidden>
          <label><input type="checkbox" name="consent"> ご本人の入会同意を確認した</label>
          <label><input type="checkbox" name="cardRegistered"> 月額パンダのクレカ登録を確認した</label>
          <label><input type="checkbox" name="bankReceived"> <span>次の会費を店頭で受領した</span></label>
          <ul></ul>
        </form>
        <div class="tour-calculation-actions"><p role="status"></p><button class="primary-button" type="button" data-submit disabled>下書き作成</button></div>
      </footer>`;
    const mount = dialog.querySelector(".tour-calculation-mount");
    const status = dialog.querySelector('[role="status"]');
    const email = dialog.querySelector(".tour-calculation-email");
    const session = {
      dialog, reservationId, status: "loading", email: "", submitting: false,
      confirmation: dialog.querySelector(".tour-calculation-confirmation"),
      receiptList: dialog.querySelector(".tour-calculation-confirmation ul"),
      submit: dialog.querySelector("[data-submit]")
    };
    const previous = {channel: channelField.value, month: monthField.value,
      fields: printFields.map(([field]) => ({field, value: field.value, disabled: field.disabled}))};
    const marker = document.createComment("campaign calculation location");
    view.before(marker);
    mount.append(view);
    tour = session;
    channelField.value = "store";
    monthField.value = "";
    selectedMonth = "";
    for (const [field] of printFields) {
      if (field.name in defaultFields) field.value = defaultFields[field.name];
      if (field.name === "memberName" || field.name === "memberNumber") field.value = "";
    }
    form.elements.created.disabled = form.elements.enrollment.disabled = true;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    dialog.addEventListener("cancel", event => { if (session.submitting) event.preventDefault(); });
    dialog.addEventListener("close", () => {
      tour = null;
      marker.replaceWith(view);
      dialog.remove();
      channelField.value = previous.channel;
      monthField.value = previous.month;
      selectedMonth = "";
      refreshCampaign();
      for (const {field, value, disabled} of previous.fields) {
        if (field.tagName !== "SELECT" || Array.from(field.options).some(option => option.value === value)) field.value = value;
        field.disabled = disabled;
      }
      render();
    }, {once: true});
    session.confirmation.addEventListener("submit", event => event.preventDefault());
    session.confirmation.addEventListener("change", render);
    session.submit.addEventListener("click", async () => {
      render();
      if (session.submit.disabled) return;
      const request = session.request;
      session.submitting = true;
      status.textContent = "計算書PDFと下書きを作成中…";
      dialog.querySelector("[data-close]").disabled = true;
      session.confirmation.inert = mount.inert = true;
      render();
      try {
        const reply = await apiPost(request);
        if (reply.data?.status !== "draft") throw new Error("下書きの作成を確認できませんでした。");
        applyStatus(reply.data, `TFGマスターに登録し、Gmail下書きを作成しました。会員番号 ${reply.data.member_id}`);
      } catch (error) {
        status.textContent = error.message || "下書きを作成できませんでした。";
      } finally {
        session.submitting = false;
        session.confirmation.inert = mount.inert = false;
        dialog.querySelector("[data-close]").disabled = false;
        render();
      }
    });
    function applyStatus(data, message = "") {
      session.status = data.status;
      session.email = data.email;
      email.textContent = `宛先　${data.email}`;
      email.hidden = false;
      status.textContent = message;
      const completed = data.status === "draft";
      session.confirmation.hidden = mount.hidden = session.submit.hidden = completed;
      render();
    }
    status.textContent = "見学予約を確認中…";
    document.body.append(dialog);
    dialog.showModal();
    render();
    try {
      const {data} = await apiGet("getTourEnrollmentCalculation", {reservation_id: reservationId});
      if (tour !== session || !dialog.open) return;
      if (!data?.email || !["new", "draft"].includes(data.status)) throw new Error("見学予約を確認できませんでした。");
      applyStatus(data, data.status === "draft" ? `登録済みです。会員番号 ${data.member_id} のメールをGmailで確認してください。` : "");
    } catch (error) {
      if (tour !== session || !dialog.open) return;
      if (error.message === "指定されたactionは存在しません。") {
        session.status = "preview";
        session.submit.hidden = true;
        session.confirmation.elements.bankReceived.nextElementSibling.textContent = "受領済みの表示を確認する";
        status.textContent = "会費の確認用です。会員登録とGmail下書き作成はサーバー更新後に利用できます。";
        render();
        return;
      }
      status.textContent = error.message || "見学予約を取得できませんでした。";
    }
  };

  const sheet = view.querySelector(".campaign-sheet");
  const printButton = view.querySelector("#campaignCalculationPrint");
  let pdfButton = view.querySelector("#campaignCalculationPdf");
  let pdfStatus = view.querySelector("#campaignCalculationPdfStatus");
  // A standalone iPad window can retain older HTML while its scripts refresh.
  if (!pdfButton) {
    printButton.textContent = "印刷";
    pdfButton = document.createElement("button");
    pdfButton.id = "campaignCalculationPdf";
    pdfButton.type = "button";
    pdfButton.className = "ghost-button";
    pdfButton.textContent = "PDF保存";
    pdfStatus = document.createElement("span");
    pdfStatus.id = "campaignCalculationPdfStatus";
    pdfStatus.setAttribute("role", "status");
    printButton.after(pdfButton, pdfStatus);

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./admin-campaign-calculation.css?v=20261128-tour-calculation";
    document.head.append(stylesheet);
  }

  function loadPdfLibrary(path, isLoaded) {
    if (isLoaded()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = path;
      script.onload = () => isLoaded() ? resolve() : reject(new Error(path));
      script.onerror = () => {
        script.remove();
        reject(new Error(path));
      };
      document.head.append(script);
    });
  }

  async function savePdf() {
    const name = memberNameField.value.trim();
    const filename = name ? `計算書／${name}さま.pdf` : "計算書.pdf";
    pdfButton.disabled = true;
    pdfStatus.textContent = "PDFを作成中…";
    const stage = document.createElement("div");
    stage.className = "campaign-pdf-stage";
    stage.setAttribute("aria-hidden", "true");
    try {
      render();
      updatePrintFields();
      const copy = sheet.cloneNode(true);
      copy.classList.add("campaign-paper");
      copy.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
      stage.append(copy);
      document.body.append(stage);
      await Promise.all([
        loadPdfLibrary("./vendor/html2canvas.min.js", () => typeof window.html2canvas === "function"),
        loadPdfLibrary("./vendor/jspdf.umd.min.js", () => typeof window.jspdf?.jsPDF === "function"),
        document.fonts.ready,
        ...Array.from(copy.querySelectorAll("img"), image => image.decode())
      ]);
      const canvas = await window.html2canvas(copy, {scale: 2.5, backgroundColor: "#fff", logging: false});
      const pdf = new window.jspdf.jsPDF({unit: "mm", format: "a4", compress: true});
      const scale = Math.min(209 / canvas.width, 295 / canvas.height);
      const width = canvas.width * scale;
      pdf.addImage(canvas, "PNG", (210 - width) / 2, 1, width, canvas.height * scale);
      pdf.save(filename);
      pdfStatus.textContent = "";
    } catch (error) {
      console.error("Campaign PDF generation failed", error);
      pdfStatus.textContent = "PDFを作成できませんでした。もう一度お試しください。";
    } finally {
      stage.remove();
      pdfButton.disabled = false;
    }
  }

  window.addEventListener("beforeprint", () => {
    render();
    updatePrintFields();
    sheet.classList.add("campaign-paper");
  });
  window.addEventListener("afterprint", () => sheet.classList.remove("campaign-paper"));
  printButton.addEventListener("click", () => window.print());
  pdfButton.addEventListener("click", savePdf);
  channelField.addEventListener("change", render);
  monthField.addEventListener("change", render);
  function refreshAtTokyoMidnight() {
    const now = new Date();
    const [year, month, day] = tokyoDate.format(now).split("-").map(Number);
    const midnight = Date.UTC(year, month - 1, day + 1) - 9 * 60 * 60 * 1000;
    window.setTimeout(() => {
      render();
      refreshAtTokyoMidnight();
    }, Math.max(1, midnight - now.getTime()));
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) render();
  });
  refreshAtTokyoMidnight();
  memberNameField.addEventListener("input", updateMemberNumberVisibility);
  form.addEventListener("change", render);
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("reset", () => queueMicrotask(render));
  document.querySelector("#logoutButton")?.addEventListener("click", () => form.reset());
  render();
});
