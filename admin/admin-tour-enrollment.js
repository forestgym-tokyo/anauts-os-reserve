(() => {
  "use strict";

  const applicantTypes = {SELF: "本人", FAMILY: "家族", FRIEND: "友達"};
  const paymentLabels = {card: "クレジットカード", bank: "口座振替"};
  const tokyoDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const yen = new Intl.NumberFormat("ja-JP");

  function injectCss() {
    if (document.getElementById("tourEnrollmentCss")) return;
    const style = document.createElement("style");
    style.id = "tourEnrollmentCss";
    style.textContent = `
      .tour-enroll-button{margin-left:7px;white-space:nowrap}
      .reservation-manage-button{color:#111!important}
      .tour-enroll-overlay{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;
        padding:18px;background:rgba(0,0,0,.65)}
      .tour-enroll-modal{width:min(620px,100%);max-height:92vh;max-height:92dvh;overflow:auto;
        background:#fff;color:#111;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.4)}
      .tour-enroll-head{padding:20px 22px 14px;border-bottom:1px solid #e5e7eb}
      .tour-enroll-head h2{margin:0}
      .tour-enroll-head p{margin:6px 0 0;color:#475467;font-size:13px}
      .tour-enroll-body{padding:18px 22px}
      .tour-enroll-fields{min-width:0;margin:0;padding:0;border:0}
      .tour-enroll-type{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
      .tour-enroll-type button{min-height:42px;border:1px solid #d0d5dd;border-radius:10px;
        background:#fff;color:#111;font-weight:800;cursor:pointer}
      .tour-enroll-type button[aria-pressed=true]{background:#173d2e;color:#fff;border-color:#173d2e}
      .tour-enroll-grid{display:grid;gap:14px}
      .tour-enroll-grid label,.tour-enroll-date-field{display:grid;gap:7px;font-size:13px;font-weight:800}
      .tour-enroll-grid select,.tour-enroll-grid input:not([type=checkbox]){min-height:44px;
        padding:9px 11px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;color:#111;font:inherit}
      .tour-enroll-date-row{display:flex;gap:8px}
      .tour-enroll-date-row input{flex:1;min-width:0;cursor:pointer}
      .tour-enroll-date-row button{min-height:44px;padding:8px 13px;border:1px solid #173d2e;
        border-radius:10px;background:#173d2e;color:#fff;font:inherit;cursor:pointer;white-space:nowrap}
      .tour-enroll-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;
        padding:12px;border:1px solid #d0d5dd;border-radius:10px;background:#fff}
      .tour-enroll-modal [hidden]{display:none!important}
      .tour-enroll-month{grid-column:1/-1;text-align:center;padding:8px 0;font-size:14px}
      .tour-enroll-weekday{text-align:center;font-size:11px;color:#475467}
      .tour-enroll-calendar button{min-width:0;min-height:38px;border:1px solid #d0d5dd;border-radius:8px;
        background:#fff;color:#111;font:inherit;cursor:pointer}
      .tour-enroll-calendar button[aria-pressed=true]{background:#173d2e;color:#fff;border-color:#173d2e}
      .tour-enroll-calendar button:hover{border-color:#173d2e}
      .tour-enroll-note{font-size:12px;color:#475467;font-weight:400;line-height:1.6}
      .tour-enroll-confirmations{display:grid;gap:12px;padding:13px 14px;border:1px solid #d0d5dd;border-radius:10px}
      .tour-enroll-grid .tour-enroll-check{display:flex;align-items:center;gap:9px;min-height:30px}
      .tour-enroll-check input{width:18px;height:18px;margin:0;flex:none;accent-color:#173d2e}
      .tour-enroll-receipts{display:grid;gap:5px;margin:0 0 7px;padding-left:26px;font-size:13px}
      .tour-enroll-message{margin:0;color:#b42318;font-size:13px;line-height:1.7;overflow-wrap:anywhere}
      .tour-enroll-message:not(:empty){margin-top:12px}
      .tour-enroll-message.is-complete{background:#ecfdf3;border:1px solid #abefc6;border-radius:12px;
        padding:12px;color:#067647;white-space:pre-line}
      .tour-enroll-actions{display:flex;gap:10px;justify-content:flex-end;padding:0 22px 20px}
      .tour-enroll-actions button{min-height:42px}
      .tour-enroll-actions .ghost-button{background:#fff;color:#111;border:1px solid #d0d5dd}
      @media(max-width:420px){
        .tour-enroll-date-row{flex-wrap:wrap}
        .tour-enroll-date-row button{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function startDatesFor(rules, today) {
    return rules.availableMonthsForDate(today, "store").map(month =>
      rules.campaignPeriod(month).start.filter(date => date >= today && date.startsWith(month + "-")));
  }

  function renderCalendar(calendar, months, selected) {
    const monthName = new Intl.DateTimeFormat("ja-JP", {year: "numeric", month: "long", timeZone: "UTC"});
    const elements = [];
    for (const dates of months) {
      if (!dates.length) continue;
      const first = new Date(dates[0] + "T00:00:00Z");
      const title = document.createElement("div");
      title.className = "tour-enroll-month";
      title.textContent = monthName.format(first);
      elements.push(title);

      for (const day of ["日", "月", "火", "水", "木", "金", "土"]) {
        const heading = document.createElement("span");
        heading.className = "tour-enroll-weekday";
        heading.textContent = day;
        elements.push(heading);
      }
      for (let i = 0; i < first.getUTCDay(); i++) {
        const spacer = document.createElement("span");
        spacer.setAttribute("aria-hidden", "true");
        elements.push(spacer);
      }
      for (const date of dates) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.date = date;
        button.textContent = String(Number(date.slice(-2)));
        button.setAttribute("aria-label", date + "を選択");
        button.setAttribute("aria-pressed", String(date === selected));
        elements.push(button);
      }
    }
    calendar.replaceChildren(...elements);
  }

  function open(reservation, trigger, rules) {
    if (document.querySelector(".tour-enroll-overlay")) return;
    const source = {
      customer_name: reservation.customer_name || "",
      customer_email: reservation.customer_email || "",
      customer_phone: reservation.customer_phone || "",
      customer_address: reservation.customer_address || reservation.address || ""
    };

    const overlay = document.createElement("div");
    overlay.className = "tour-enroll-overlay";
    overlay.innerHTML = `
      <form class="tour-enroll-modal" role="dialog" aria-modal="true" aria-labelledby="tourEnrollTitle">
        <div class="tour-enroll-head">
          <h2 id="tourEnrollTitle" tabindex="-1">入会手続き</h2>
          <p id="tourEnrollSource"></p>
        </div>
        <div class="tour-enroll-body">
          <fieldset class="tour-enroll-fields" aria-label="入会者情報">
            <div class="tour-enroll-type">
              <button type="button" data-kind="SELF">本人</button>
              <button type="button" data-kind="FAMILY">家族</button>
              <button type="button" data-kind="FRIEND">友達</button>
            </div>
            <div class="tour-enroll-grid">
              <label>氏名<input id="tourEnrollName" name="customer_name" autocomplete="name" required></label>
              <label>メールアドレス<input id="tourEnrollEmail" name="customer_email" type="email" autocomplete="email" required></label>
              <label>電話番号<input id="tourEnrollPhone" name="customer_phone" type="tel" autocomplete="tel" required></label>
              <label>住所（任意）<input id="tourEnrollAddress" name="customer_address" autocomplete="street-address"></label>
              <label>支払方法
                <select id="tourEnrollPayment" name="payment_method" required>
                  <option value="">支払方法を選択</option>
                  <option value="card">クレジットカード</option>
                  <option value="bank">口座振替</option>
                </select>
              </label>
              <label>プラン<select id="tourEnrollPlan" name="plan_code"></select></label>
              <div class="tour-enroll-date-field">
                <label for="tourEnrollStart">スタート日</label>
                <div class="tour-enroll-date-row">
                  <input id="tourEnrollStart" name="start_date" type="text" readonly
                    aria-controls="tourEnrollCalendar" aria-expanded="false">
                  <button id="tourEnrollCalendarButton" type="button" aria-expanded="false"
                    aria-controls="tourEnrollCalendar">日付を選択</button>
                </div>
                <div id="tourEnrollCalendar" class="tour-enroll-calendar" role="group" aria-label="スタート日を選択" hidden></div>
                <span class="tour-enroll-note">27日以降は翌月のスタート日も選べます。</span>
              </div>
              <label id="tourEnrollBenefitWrap">キャンペーン特典
                <select id="tourEnrollBenefit" name="benefit_code"></select>
              </label>
              <div class="tour-enroll-confirmations">
                <label class="tour-enroll-check"><input id="tourEnrollConsent" type="checkbox">入会者ご本人の同意を確認した</label>
                <label id="tourEnrollCardCheck" class="tour-enroll-check" hidden>
                  <input id="tourEnrollCardRegistered" type="checkbox">月額パンダのクレカ登録を確認した
                </label>
                <div id="tourEnrollBankCheck" hidden>
                  <ul id="tourEnrollReceiptFees" class="tour-enroll-receipts"></ul>
                  <label class="tour-enroll-check"><input id="tourEnrollBankReceived" type="checkbox">上記の会費を店頭で受領した</label>
                </div>
              </div>
            </div>
          </fieldset>
          <p id="tourEnrollMessage" class="tour-enroll-message" role="status"></p>
        </div>
        <div class="tour-enroll-actions">
          <button id="tourEnrollClose" class="ghost-button" type="button">閉じる</button>
          <button id="tourEnrollSubmit" class="primary-button" type="submit" disabled>送信</button>
        </div>
      </form>
    `;
    document.body.appendChild(overlay);

    const find = id => overlay.querySelector("#tourEnroll" + id);
    const form = overlay.querySelector("form");
    const fields = form.elements;
    const fieldset = form.querySelector("fieldset");
    const types = Array.from(form.querySelectorAll("[data-kind]"));
    const plan = find("Plan");
    const benefit = find("Benefit");
    const start = find("Start");
    const payment = find("Payment");
    const calendar = find("Calendar");
    const calendarButton = find("CalendarButton");
    const consent = find("Consent");
    const card = find("CardRegistered");
    const bank = find("BankReceived");
    const message = find("Message");
    const submit = find("Submit");
    const closeButton = find("Close");
    let kind = "SELF";
    let created = tokyoDate.format(new Date());
    let busy = false;
    let completed = false;

    find("Source").textContent = "見学予約者　" + (source.customer_name || "氏名未登録");
    plan.replaceChildren(...Object.entries(rules.tourPlanCodes).map(([label, code]) =>
      new Option(label.replace(/^キャンペーン/, "キャンペーン "), code)));
    benefit.replaceChildren(new Option("2か月目会費無料", "SECOND_MONTH_FREE"),
      new Option("無料パーソナルトレーニング60分", "PT60_FREE"));
    start.value = created;

    function calculateFees() {
      const calculation = {
        created, start: start.value,
        method: payment.value === "bank" ? "口座振替" : "クレジット",
        plan: Object.keys(rules.tourPlanCodes).find(label => rules.tourPlanCodes[label] === plan.value),
        benefit: plan.value.startsWith("CP_") ?
          Object.keys(rules.tourBenefitCodes).find(label => rules.tourBenefitCodes[label] === benefit.value) : "",
        enrollment: "WEB／見学日入会"
      };
      return rules.calculateTourEnrollment(calculation, start.value.slice(0, 7));
    }

    function updateSubmit() {
      submit.disabled = busy || !consent.checked ||
        !(payment.value === "card" && card.checked || payment.value === "bank" && bank.checked);
    }

    function updateConfirmations() {
      consent.checked = card.checked = bank.checked = false;
      find("BenefitWrap").hidden = !plan.value.startsWith("CP_");
      find("CardCheck").hidden = payment.value !== "card";
      find("BankCheck").hidden = payment.value !== "bank";

      const fees = payment.value === "bank" ? calculateFees().receiptFees : [];
      find("ReceiptFees").replaceChildren(...fees.map(({label, amount}) => {
        const row = document.createElement("li");
        row.textContent = `${label}　${yen.format(amount)}円`;
        return row;
      }));
      message.textContent = "";
      updateSubmit();
    }

    function fillApplicant(type) {
      kind = type;
      for (const button of types) button.setAttribute("aria-pressed", String(button.dataset.kind === type));
      for (const [field, value] of Object.entries(source)) {
        fields[field].value = type === "SELF" || (type === "FAMILY" && field === "customer_address") ? value : "";
      }
      updateConfirmations();
    }

    function setCalendarOpen(visible) {
      if (visible) {
        refreshDate();
        renderCalendar(calendar, startDatesFor(rules, created), start.value);
      }
      calendar.hidden = !visible;
      calendarButton.setAttribute("aria-expanded", String(visible));
      start.setAttribute("aria-expanded", String(visible));
    }

    function refreshDate() {
      const today = tokyoDate.format(new Date());
      if (today === created) return false;
      created = today;
      if (!startDatesFor(rules, today).some(dates => dates.includes(start.value))) start.value = today;
      updateConfirmations();
      message.textContent = "作成日が変わりました。スタート日と確認欄をもう一度ご確認ください。";
      return true;
    }

    function close() {
      if (busy) return;
      overlay.remove();
      trigger.focus();
    }

    fillApplicant("SELF");
    for (const button of types) {
      button.addEventListener("click", () => {
        if (button.dataset.kind !== kind) fillApplicant(button.dataset.kind);
      });
    }
    fieldset.addEventListener("change", event => {
      if (event.target.type === "checkbox") updateSubmit();
      else updateConfirmations();
    });
    start.addEventListener("click", () => setCalendarOpen(calendar.hidden));
    start.addEventListener("keydown", event => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      setCalendarOpen(calendar.hidden);
    });
    calendarButton.addEventListener("click", () => setCalendarOpen(calendar.hidden));
    calendar.addEventListener("click", event => {
      const button = event.target.closest("[data-date]");
      if (!button) return;
      start.value = button.dataset.date;
      setCalendarOpen(false);
      calendarButton.focus();
      updateConfirmations();
    });
    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (calendar.hidden) close();
      else {
        setCalendarOpen(false);
        calendarButton.focus();
      }
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      if (completed) {
        close();
        open(reservation, trigger, rules);
        return;
      }
      if (refreshDate() || submit.disabled) return;
      const applicant = Object.fromEntries(Object.keys(source).map(field => [field, fields[field].value.trim()]));
      if (!applicant.customer_name || !applicant.customer_email || !applicant.customer_phone) {
        message.textContent = "氏名・メールアドレス・電話番号をすべて入力してください。";
        return;
      }
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(applicant.customer_email)) {
        message.textContent = "メールアドレスを確認してください。";
        return;
      }
      const quote = calculateFees();
      const firstMonthFee = quote.rows[22][1];
      const receipts = quote.receiptFees || [];
      if (!Number.isInteger(firstMonthFee) || (payment.value === "bank" && receipts.length === 0)) {
        message.textContent = "会費を計算できません。スタート日とプランを確認してください。";
        return;
      }

      const selectedBenefit = benefit.closest("label").hidden ? "" : benefit.value;
      const summary = [
        "次の内容で登録し、Gmailの下書きを作成します。",
        "",
        `入会者　${applicant.customer_name}（${applicantTypes[kind]}）`,
        `宛先　${applicant.customer_email}`,
        `電話番号　${applicant.customer_phone}`,
        ...(applicant.customer_address ? [`住所　${applicant.customer_address}`] : []),
        `支払方法　${paymentLabels[payment.value]}`,
        `プラン　${plan.selectedOptions[0].text}`,
        `スタート日　${start.value}`,
        ...(selectedBenefit ? [`キャンペーン特典　${benefit.selectedOptions[0].text}`] : [])
      ].join("\n");
      if (!window.confirm(summary)) return;
      if (refreshDate()) return;

      busy = true;
      fieldset.disabled = submit.disabled = closeButton.disabled = true;
      submit.textContent = "登録・下書き作成中…";
      setCalendarOpen(false);
      message.textContent = "";
      try {
        const response = await apiPost({
          action: "createTourEnrollmentDraftFromForm",
          reservation_id: reservation.reservation_id,
          enrollment_type: kind,
          ...applicant,
          payment_method: payment.value,
          plan_code: plan.value,
          start_date: start.value,
          benefit_code: selectedBenefit,
          created_date: created,
          consent_confirmed: consent.checked,
          card_registered: payment.value === "card" && card.checked,
          first_month_fee: firstMonthFee,
          receipts: bank.checked ? receipts.map(({row, amount}) => ({row, amount})) : []
        });
        const result = response.data;
        if (result?.status !== "draft" || !result.member_id) throw new Error("入会登録と下書き作成を確認できませんでした。");
        completed = true;
        fieldset.hidden = true;
        message.classList.add("is-complete");
        const status = result.already_created ? "登録済みの下書きを確認しました。" :
          "TFGマスターに登録し、計算書を添付したGmail下書きを作成しました。";
        message.textContent = `${status}\n会員番号　${result.member_id}\n宛先　${result.email}`;
        submit.textContent = "別の方を登録";
      } catch (error) {
        message.textContent = error.message || "入会手続きに失敗しました。";
        submit.textContent = "送信";
      } finally {
        busy = false;
        closeButton.disabled = false;
        if (completed) submit.disabled = false;
        else {
          fieldset.disabled = false;
          updateSubmit();
        }
      }
    });

    find("Title").focus();
  }

  function decorateFromData(data) {
    const reservations = new Map((Array.isArray(data?.reservations) ? data.reservations : [])
      .filter(row => String(row.service_code).trim().toUpperCase() === "TOUR" &&
        !/^(CANCELLED|CANCELED)$/.test(String(row.status).trim().toUpperCase()))
      .map(row => [String(row.reservation_id || ""), row]));

    for (const row of document.querySelectorAll("#staffScheduleBoard .staff-reservation-row")) {
      const id = row.querySelector(".reservation-manage-button")?.dataset.reservationId;
      const reservation = id && reservations.get(id);
      if (!reservation || row.querySelector(".tour-enroll-button")) continue;

      let actions = row.querySelector(".tour-row-actions");
      if (!actions) {
        actions = document.createElement("span");
        actions.className = "tour-row-actions";
        row.appendChild(actions);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "primary-button tour-enroll-button";
      button.textContent = "入会手続き";
      button.addEventListener("click", () => {
        const rules = globalThis.CampaignCalculationRules;
        if (rules) open(reservation, button, rules);
        else window.alert("計算書を読み込めませんでした。画面を更新してください。");
      });
      actions.appendChild(button);
    }
  }

  function boot() {
    injectCss();
    if (typeof renderStaffSchedule !== "function" || renderStaffSchedule.__tourEnrollHooked) return;
    const original = renderStaffSchedule;
    const wrapped = function (data) {
      const result = original.apply(this, arguments);
      setTimeout(() => decorateFromData(data), 0);
      return result;
    };
    wrapped.__tourEnrollHooked = true;
    renderStaffSchedule = wrapped;
    if (typeof state !== "undefined" && state.staffSchedule) decorateFromData(state.staffSchedule);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once: true});
  else boot();
})();
