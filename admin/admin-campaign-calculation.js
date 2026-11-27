(() => {
  "use strict";

  // 「計算書」 I1:I3, O2:R7. O8 is the blank choice in the plan list.
  const year = 2026;
  const month = 11;
  const days = 30;
  const plans = {
    "キャンペーンレギュラー": [4950, 5940, 7480],
    "キャンペーン平日DAY": [4180, 4510, 6050],
    "キャンペーンNIGHT365": [3300, 3960, 4950],
    "レギュラー": [7480, 5940, 7480],
    "平日DAY": [6050, 4510, 6050],
    "NIGHT365": [4950, 3960, 4950]
  };

  const date = day => new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  const dates = count => Array.from({length: count}, (_, index) => date(index + 1));
  const joinDates = dates(35); // J5:J39
  const startDates = dates(31); // H5:H35
  const paymentCycle = date(27); // O12
  const dayOf = value => Number(value.slice(-2));
  const monthOf = value => Number(value.slice(5, 7)) || 1;
  const defaults = {created: date(25), start: date(25), method: "クレジット",
    plan: "キャンペーンレギュラー", benefit: "パーソナル無料", enrollment: "WEB／見学日入会"};
  const lists = {
    created: joinDates,
    method: ["", "口座振替", "クレジット"],
    plan: [...Object.keys(plans), ""],
    benefit: ["", "パーソナル無料", "2か月目会費無料"],
    start: startDates,
    enrollment: ["－", "WEB／見学日入会", ""]
  };
  const lookupError = "#N/A";
  const valueError = "#VALUE!";

  function calculate({created, start, method, plan, benefit, enrollment}) {
    const campaign = plan.includes("キャンペーン");
    const plus = campaign && enrollment === "WEB／見学日入会"; // B19
    const freeSecond = benefit === "2か月目会費無料";
    // The revised fee lookups include NIGHT365 in row 7.
    const rates = plans[plan];
    const [monthly, permanent, normal] = rates || [];
    const createdIndex = joinDates.indexOf(created);
    const afterCreated = createdIndex < 0 ? lookupError : date(createdIndex + 2);
    const earlierMonth = monthOf(created) < monthOf(start); // G5, L5:L9
    const createdDay = earlierMonth ? 0 : dayOf(created);
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
    const firstDate = first === lookupError ? first : first === "-" ? "" : bank ? created : afterCreated;
    let secondDate; // D23 reads L5:L39 on the credit path.
    if (monthOf(created) < month) secondDate = date(27); // H31
    else if (bank) secondDate = dayOf(created) < 9 ? paymentCycle : firstDate;
    else if (createdIndex < 0) secondDate = lookupError;
    else secondDate = (createdIndex < 5 && earlierMonth) || dayOf(created) < 27 ? paymentCycle : afterCreated;
    const thirdDate = thirdMonth ? `${year}/${month + 1}/27` : ""; // D24 is text in Excel.
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
        17: [campaign ? "　月会費値引（初年度）" : "■月会費", monthDiscount, "", campaign ? `${year + 1}月${month}月会費まで毎月値引` : ""],
        19: [plus ? "・プラス割 選べる特典" : "", plusDiscount, "",
          plus ? (freeSecond ? "2か月目会費0円" : "パーソナルトレーニング（プライム）１回券プレゼント") : ""],
        20: [plus ? "　注）プラス割はWEB直接／見学当日入会のみ。 見学→後日WEB入会は対象外" : ""],
        21: ["■決済スケジュール"],
        22: [`　${month}月会費`, first, firstDate, credit ?
          (firstDate === lookupError ? lookupError : firstDate && firstDate === afterCreated ? "初月会費は入会日翌日決済" : "") :
          "初月会費はご入会日現金決済"],
        23: [`　${month + 1}月会費`, freeSecond ? 0 : monthly ?? lookupError, secondDate,
          freeSecond ? "選べる特典／2か月目無料" : dayOf(created) === 27 ? "" :
            secondDate === lookupError ? lookupError : dayOf(secondDate) === 27 ? "通常決済サイクル" : ""],
        24: thirdMonth ? ["　1月会費", monthly ?? lookupError, thirdDate,
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

  if (typeof module !== "undefined") module.exports = {calculate, defaults, lists};
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

  for (const [name, choices] of Object.entries(lists)) {
    const field = form.elements.namedItem(name);
    for (const value of choices) {
      const option = new Option(formatDate(value) || "（空欄）", value, value === defaults[name]);
      field.add(option);
    }
    field.value = defaults[name];
  }

  const printFields = Array.from(form.querySelectorAll("input, select"), field => {
    const value = document.createElement("span");
    value.className = "campaign-print-value";
    field.closest("label").append(value);
    return [field, value];
  });

  function updatePrintFields() {
    for (const [field, value] of printFields) {
      const text = field.value.trim();
      value.textContent = field.name === "memberName" && text ? `${text} さま` : formatDate(text);
      const label = field.closest("label");
      label.classList.toggle("campaign-print-empty-member",
        (field.name === "memberName" || field.name === "memberNumber") && !text);
    }
  }

  function render() {
    const data = Object.fromEntries(new FormData(form));
    const result = calculate(data);
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

  window.addEventListener("beforeprint", () => {
    render();
    updatePrintFields();
  });
  view.querySelector("#campaignCalculationPrint").addEventListener("click", () => window.print());
  form.addEventListener("change", render);
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("reset", () => queueMicrotask(render));
  document.querySelector("#logoutButton")?.addEventListener("click", () => form.reset());
  render();
})();
