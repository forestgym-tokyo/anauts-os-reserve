(() => {
  "use strict";

  // 「計算書」 I1:I3, O2:R7. O8 is the blank choice in the plan list.
  const plans = {
    "キャンペーンレギュラー": [4950, 5940, 7480],
    "キャンペーン平日DAY": [4180, 4510, 6050],
    "キャンペーンNIGHT365": [3300, 3960, 4950],
    "レギュラー": [7480, 5940, 7480],
    "平日DAY": [6050, 4510, 6050],
    "NIGHT365": [4950, 3960, 4950]
  };

  const tokyoDate = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"});
  const date = (year, month, day) => new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  const dayOf = value => Number(value.slice(-2));
  const monthOf = value => Number(value.slice(5, 7));
  const monthKey = (year, month) => date(year, month, 1).slice(0, 7);
  const titles = {
    "2026-11": "秋の超得プラスキャンペーン",
    "2026-12": "2026年末感謝プラスキャンペーン"
  };
  const defaultFields = {method: "クレジット", plan: "キャンペーンレギュラー",
    benefit: "パーソナル無料", enrollment: "WEB／見学日入会"};
  const commonLists = {
    method: ["", "口座振替", "クレジット"],
    plan: [...Object.keys(plans), ""],
    benefit: ["", "パーソナル無料", "2か月目会費無料"],
    enrollment: ["－", "WEB／見学日入会", ""]
  };

  function availableMonths(now, channel) {
    const today = tokyoDate.format(now);
    const [year, month, day] = today.split("-").map(Number);
    const current = monthKey(year, month);
    return channel === "store" && day >= 27 ? [current, monthKey(year, month + 1)] : [current];
  }

  function campaignPeriod(key) {
    const [year, month] = key.split("-").map(Number);
    const days = dayOf(date(year, month + 1, 0));
    const previousDays = dayOf(date(year, month, 0));
    const inMonth = day => date(year, month, day);
    const earliestDay = 27 - previousDays;
    const created = Array.from({length: days + 5 - earliestDay + 1}, (_, i) => inMonth(earliestDay + i));
    const start = Array.from({length: days + (key === "2026-11" ? 1 : 0)}, (_, i) => inMonth(i + 1));
    return {year, month, days, created, start, inMonth, title: titles[key] || `${year}年${month}月プラスキャンペーン`};
  }

  const defaults = {created: "2026-11-25", start: "2026-11-25", ...defaultFields};
  const november = campaignPeriod("2026-11");
  const lists = {...commonLists, created: november.created, start: november.start};
  const lookupError = "#N/A";
  const valueError = "#VALUE!";

  function calculate({created, start, method, plan, benefit, enrollment}, key = "2026-11") {
    const {year, month, days, created: joinDates, start: startDates, inMonth} = campaignPeriod(key);
    const paymentCycle = inMonth(27);
    const firstDay = inMonth(1);
    const campaign = plan.includes("キャンペーン");
    const plus = campaign && enrollment === "WEB／見学日入会"; // B19
    const freeSecond = benefit === "2か月目会費無料";
    // The revised fee lookups include NIGHT365 in row 7.
    const rates = plans[plan];
    const [monthly, permanent, normal] = rates || [];
    const validCreated = joinDates.includes(created);
    const afterCreated = validCreated ? date(Number(created.slice(0, 4)), monthOf(created), dayOf(created) + 1) : lookupError;
    const earlierMonth = created < firstDay; // G5, L5:L9
    const createdDay = earlierMonth || (key === "2026-11" && monthOf(created) < monthOf(start)) ? 0 : dayOf(created);
    const credit = method === "クレジット";
    const bank = method === "口座振替";
    const thirdMonth = freeSecond || (credit ? createdDay >= 27 : createdDay > 8); // G21, B24

    const joiningFee = campaign ? -5500 : 5500; // C12
    const processingFee = campaign ? -3300 : 3300; // C13
    const initial = joiningFee + processingFee; // C14
    const monthDiscount = rates ? (campaign ? monthly - normal : normal) : lookupError; // C17
    const plusDiscount = plus ? ({ "パーソナル無料": -6600, "2か月目会費無料": -monthly })[benefit] ?? "" : "";
    const prorate = day => Math.trunc(monthly - (day - 1) * (monthly / days)); // I5:I35
    const first = rates && startDates.includes(start) ? prorate(dayOf(start)) || "-" : lookupError;
    const firstDate = first === lookupError ? first : first === "-" ? "" : bank && key === "2026-11" ? created : afterCreated;
    let secondDate; // D23 reads L5:L39 on the credit path.
    if (earlierMonth) secondDate = paymentCycle; // H31
    else if (bank) secondDate = dayOf(created) < 9 ? paymentCycle : firstDate;
    else if (!validCreated) secondDate = lookupError;
    else secondDate = dayOf(created) < 27 ? paymentCycle : afterCreated;
    const thirdDate = thirdMonth ? inMonth(days + 27) : ""; // D24 is text in Excel.
    const loyalty = rates ? permanent - normal : lookupError;
    // B36 and C36 are blank for non-campaign plans.
    const totalLabel = campaign ? "初年度キャンペーン値引計" : "";
    let total = "";
    if (campaign) {
      if (first === lookupError) total = lookupError;
      else if (first === "-" || plusDiscount === "") total = valueError;
      else total = (monthly - normal) * first / prorate(1) + initial + plusDiscount + monthDiscount * 12;
    }
    const enrollmentNote = {WEB: "見学不要・WEB入会で全額値引", 見学: "見学当日入会で半額額値引"};

    // Row numbers correspond to the printed sheet, with C36 shown below it.
    return {
      rows: {
        10: [campaign ? "■キャンペーン値引明細" : ""],
        11: [campaign ? "・超得１ 初期費用値引特典" : "■初期費用", campaign ? 8800 : ""],
        12: [campaign ? "　入会金値引き" : "　入会金", joiningFee, "", enrollmentNote[enrollment]],
        13: [campaign ? "　事務手数料値引" : "　事務手数料", processingFee, "", enrollmentNote[enrollment]],
        14: [campaign ? "　初期費用値引計" : "　初期費用計", initial, plus ? "" : created, campaign ? "" : "初期費用は入会日決済"],
        15: [campaign ? "　初期費用計" : "", campaign ? 0 : ""],
        16: [campaign ? "・超得2 月会費値引特典" : "", campaign ? normal : ""],
        17: [campaign ? "　月会費値引（初年度）" : "■月会費", monthDiscount, "", campaign ? `${year + 1}年${month}月会費まで毎月値引` : ""],
        19: [plus ? "・プラス割 選べる特典" : "", plusDiscount, "",
          plus ? (freeSecond ? "2か月目会費0円" : "パーソナルトレーニング（プライム）１回券プレゼント") : ""],
        20: [plus ? "　注）プラス割はWEB直接／見学当日入会のみ。 見学→後日WEB入会は対象外" : ""],
        21: ["■決済スケジュール"],
        22: [`　${month}月会費`, first, firstDate, (credit || key !== "2026-11") ?
          (firstDate === lookupError ? lookupError : firstDate && firstDate === afterCreated ? "初月会費は入会日翌日決済" : "") :
          "初月会費はご入会日現金決済"],
        23: [`　${monthOf(inMonth(days + 1))}月会費`, freeSecond ? 0 : monthly ?? lookupError, secondDate,
          freeSecond ? "選べる特典／2か月目無料" : dayOf(created) === 27 ? "" :
            secondDate === lookupError ? lookupError : dayOf(secondDate) === 27 ? "通常決済サイクル" : ""],
        24: thirdMonth ? [`　${monthOf(inMonth(days + 32))}月会費`, monthly ?? lookupError, thirdDate,
          secondDate === lookupError ? lookupError : dayOf(secondDate) > 27 ? "通常決済サイクル" : ""] : [],
        25: [], // B25 is empty, so D25 and E25 both return empty.
        26: ["長期継続割引", loyalty || "", "", loyalty === lookupError ? lookupError : loyalty ? "2年目以降長期継続値引（永久値引）が適用されます。" : ""],
        29: [campaign ? "本キャンペーン値引き適用に際するご注意点" : ""],
        30: [campaign ? `1．本キャンペーンは、${year + 1}年${month}月末以降までのご利用が前提となります。` : ""],
        31: [campaign ? `2．ご入会後、満3か月間経過したのちはいつでも退会可能ですが、${year + 1}年${month}月末より前に退会（早期退会）の場合` : ""],
        32: [campaign ? "　　キャンペーン価格が適用されず、上記①から③の値引き額が精算対象となります。" : ""],
        33: [campaign ? "3．休会期間中は、継続期間に含めないため、初年度値引期日、継続条件期日の双方が休会期間分延長されます。" : ""]
      },
      totalLabel,
      total
    };
  }

  if (typeof module !== "undefined") module.exports = {calculate, defaults, lists, availableMonths, campaignPeriod};
  if (typeof document === "undefined") return;

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

  function setChoices(field, choices, selected) {
    field.replaceChildren(...choices.map(value =>
      new Option(formatDate(value) || "（空欄）", value, value === selected)));
    field.value = selected;
  }

  for (const [name, choices] of Object.entries(commonLists)) {
    setChoices(form.elements.namedItem(name), choices, defaultFields[name]);
  }

  function refreshCampaign(now = new Date()) {
    const months = availableMonths(now, channelField.value);
    const allowed = Array.from(monthField.options, option => option.value);
    const nextMonth = months.includes(monthField.value) ? monthField.value : months[0];
    if (months.join() !== allowed.join()) setChoices(monthField, months, nextMonth);
    monthField.disabled = months.length === 1;
    if (selectedMonth === nextMonth) return;
    selectedMonth = nextMonth;
    const period = campaignPeriod(nextMonth);
    const today = tokyoDate.format(now);
    setChoices(form.elements.namedItem("created"), period.created, period.created.includes(today) ? today : period.created[0]);
    setChoices(form.elements.namedItem("start"), period.start, period.start.includes(today) ? today : period.start[0]);
    title.textContent = period.title;
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
    const data = Object.fromEntries(new FormData(form));
    const result = calculate(data, selectedMonth);
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
  }

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
    stylesheet.href = "./admin-campaign-calculation.css?v=20261128-thin-rules";
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
})();
