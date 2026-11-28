/* Calculation rules shared by the admin preview and server-side PDF. */
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
  const tourPlanCodes = {
    "キャンペーンレギュラー": "CP_REG", "キャンペーン平日DAY": "CP_DAY", "キャンペーンNIGHT365": "CP_NIGHT",
    "レギュラー": "REG", "平日DAY": "DAY", "NIGHT365": "NIGHT"
  };
  const tourBenefitCodes = {"パーソナル無料": "PT60_FREE", "2か月目会費無料": "SECOND_MONTH_FREE"};

  function availableMonthsForDate(today, channel) {
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

  function calculateTourEnrollment(fields, key, bankReceived = false) {
    if (fields.method !== "口座振替") return calculate(fields, key);
    const result = calculate({...fields, method: "クレジット"}, key);
    const receiptFees = tourDueFees(result, fields.created);
    for (const {row} of receiptFees) {
      const [label, amount] = result.rows[row];
      result.rows[row] = [label, amount, fields.created, bankReceived ? "店頭で受領済み" : "ご入会日店頭払い"];
    }
    return {...result, receiptFees};
  }

  function tourDueFees(result, created) {
    const nextDay = result.rows[22][2];
    // A regular 27th billing date can also be tomorrow for an enrollment on the 26th.
    const nextMonthDue = dayOf(created) >= 27 && result.rows[23][2] === nextDay;
    const rows = nextMonthDue ? [22, 23] : [22];
    return rows.flatMap(row => {
      const [label, amount] = result.rows[row];
      return Number.isInteger(amount) && amount > 0 ? [{row, label: label.trim(), amount}] : [];
    });
  }

  const rules = {
    calculate, campaignPeriod, availableMonthsForDate, commonLists, defaultFields, defaults, lists,
    tourPlanCodes, tourBenefitCodes, calculateTourEnrollment,
    availableMonths(now, channel) {
      const dateInTokyo = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(now);
      return availableMonthsForDate(dateInTokyo, channel);
    }
  };
  if (typeof module !== "undefined") module.exports = rules;
  else globalThis.CampaignCalculationRules = rules;
})();
