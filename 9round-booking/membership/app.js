(function () {
  "use strict";
  const model = window.NineRoundMembershipPlans, q = function (id) { return document.getElementById(id); };
  const current = model.today(), state = { plan: "PREMIUM_ONE", stage: 1 };
  const open = current <= model.offer.lastDate;
  const dateLabel = function (date) { if (!date) return ""; const p = date.split("-").map(Number); return p[0] + "年" + p[1] + "月" + p[2] + "日"; };
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function row(dl, label, value) { dl.append(el("dt", "", label), el("dd", "", value)); }
  function notice(message) { q("notice").hidden = !message; q("notice").textContent = message; }
  function resetConsent() { q("agreeTerms").checked = false; q("agreePrivacy").checked = false; }
  function term(plan) { return plan.months ? "入会月末から" + plan.months + "か月間の継続" : "継続条件なし"; }
  function renderPlans() {
    const options = q("planOptions");
    model.plans.forEach(function (plan) {
      const label = el("label", "plan-choice"), radio = document.createElement("input");
      radio.type = "radio"; radio.name = "membership_plan"; radio.value = plan.id; radio.checked = plan.id === state.plan; radio.disabled = !open;
      const card = el("span", "plan-card"); card.append(el("span", "plan-radio", "✓"), el("span", "plan-kicker", plan.english), el("h3", "", plan.name));
      const price = el("span", "plan-price"), amount = el("strong", "", model.yen(plan.monthly).replace("円", "")); amount.append(el("span", "", "円")); price.append(el("small", "", "月額"), amount); card.append(price);
      card.append(el("span", "plan-badge" + (plan.campaign ? "" : " standard"), plan.campaign ? "基本料金 永久" + plan.discount + "%OFF" : "通常プラン"));
      const costs = el("dl", "plan-costs"); row(costs, "初期費用", model.yen(plan.initial)); row(costs, "9Rグローブ", model.yen(plan.gloves)); card.append(costs);
      const condition = el("span", "plan-condition", plan.months ? "入会月末から" : "継続期間について"); condition.append(el("strong", "", plan.months ? plan.months + "か月間の継続" : "継続条件なし")); card.append(condition); label.append(radio, card); options.append(label);
      radio.addEventListener("change", function () { state.plan = plan.id; resetConsent(); renderSummary(); });
    });
  }
  function renderSummary() {
    const plan = model.getPlan(state.plan), summary = q("planSummary"); summary.replaceChildren();
    summary.append(el("p", "summary-plan-name", plan.name)); const price = el("p", "summary-price", model.yen(plan.monthly)); price.append(el("small", "", " / 月")); summary.append(price);
    const costs = el("dl"); row(costs, "初期費用", model.yen(plan.initial)); row(costs, "9Rオリジナルグローブ", model.yen(plan.gloves)); row(costs, "固定費の小計", model.yen(plan.initial + plan.gloves)); summary.append(costs, el("p", "summary-term", term(plan)));
    const pair = plan.id === "FAMILY_PAIR"; q("pairSection").hidden = !pair; q("pairName").disabled = !pair; q("pairName").required = pair; q("pairMemberNo").disabled = !pair;
  }
  function showStage(n) {
    state.stage = n; notice(""); ["planStage", "detailsStage", "reviewStage"].forEach(function (id, index) { q(id).hidden = index + 1 !== n; });
    document.querySelectorAll("[data-step]").forEach(function (item) { const step = Number(item.dataset.step); item.classList.toggle("is-current", step === n); item.classList.toggle("is-done", step < n); if (step === n) item.setAttribute("aria-current", "step"); else item.removeAttribute("aria-current"); });
    q(["planTitle", "detailsTitle", "reviewTitle"][n - 1]).focus({ preventScroll: true }); document.querySelector(".steps").scrollIntoView({ block: "start", behavior: "auto" });
  }
  function normalizeFields() {
    ["fullName", "nameKana", "fighterName", "memberEmail", "memberAddress", "pairName"].forEach(function (id) { q(id).value = q(id).value.trim(); });
    q("postalCode").value = q("postalCode").value.normalize("NFKC").replace(/[\s-]/g, "");
    q("memberPhone").value = q("memberPhone").value.normalize("NFKC").replace(/[\s()-]/g, "");
    q("pairMemberNo").value = q("pairMemberNo").value.normalize("NFKC").trim();
  }
  function validate() {
    normalizeFields();
    ["startDate", "birthDate", "fullName", "nameKana", "postalCode", "memberPhone", "pairName"].forEach(function (id) { q(id).setCustomValidity(""); });
    if (!model.validStart(q("startDate").value, model.today())) q("startDate").setCustomValidity("本日から2026年10月31日までの日付をお選びください。");
    if (!model.isDate(q("birthDate").value) || q("birthDate").value >= model.today()) q("birthDate").setCustomValidity("生年月日をご確認ください。");
    if (!q("fullName").value || /[\x00-\x1f\x7f]/.test(q("fullName").value)) q("fullName").setCustomValidity("お名前をご入力ください。");
    if (!/^[ァ-ヶー・\s]+$/.test(q("nameKana").value.normalize("NFKC"))) q("nameKana").setCustomValidity("フリガナをカタカナでご入力ください。");
    if (!/^\d{7}$/.test(q("postalCode").value)) q("postalCode").setCustomValidity("郵便番号を数字7桁でご入力ください。");
    if (q("memberPhone").value && !/^\+?\d{10,15}$/.test(q("memberPhone").value)) q("memberPhone").setCustomValidity("電話番号をご確認ください。");
    if (state.plan === "FAMILY_PAIR" && !q("pairName").value) q("pairName").setCustomValidity("一緒にご利用される方のお名前をご入力ください。");
    return q("memberForm").reportValidity();
  }
  function renderReview() {
    const plan = model.getPlan(state.plan), details = q("reviewPlan"), person = q("reviewPerson"); details.replaceChildren(); person.replaceChildren();
    row(details, "ご入会プラン", plan.name); row(details, "利用開始日", dateLabel(q("startDate").value)); row(details, "月会費", model.yen(plan.monthly)); row(details, "初期費用", model.yen(plan.initial)); row(details, "9Rグローブ", model.yen(plan.gloves)); row(details, "固定費の小計", model.yen(plan.initial + plan.gloves)); row(details, "初回会費", "利用開始日をもとに、決済画面でご案内"); row(details, "継続条件", term(plan));
    if (plan.campaign) row(details, "キャンペーン", "One・Half合計で先着30名\n枠の確保はまだ行われていません");
    [["お名前", "fullName"], ["フリガナ", "nameKana"], ["ファイターネーム", "fighterName"], ["メール", "memberEmail"], ["電話番号", "memberPhone"], ["郵便番号", "postalCode"], ["ご住所", "memberAddress"]].forEach(function (pair) { if (q(pair[1]).value) row(person, pair[0], q(pair[1]).value); }); row(person, "生年月日", dateLabel(q("birthDate").value));
    if (plan.id === "FAMILY_PAIR") { row(person, "お相手のお名前", q("pairName").value); if (q("pairMemberNo").value) row(person, "お相手の会員番号", q("pairMemberNo").value); }
    const conditions = q("selectedConditions"); conditions.replaceChildren();
    if (plan.campaign) { conditions.append(el("p", "", "入会月末から" + plan.months + "か月間の継続が条件です。満3か月未満での退会はできません。"), el("p", "", "期間内の退会は、初期費用・グローブ・利用月数分の基本料金について、通常プランとの差額精算があります。")); }
    else conditions.append(el("p", "", "継続期間の条件はありません。プラン変更は毎月20日の営業時間内までに店舗へご連絡ください。"));
    if (plan.id === "FAMILY_PAIR") conditions.append(el("p", "", "他のペア・ファミリーメンバー全員が退会された場合は、翌月1日から通常プランに移行します。"));
    q("signatureName").textContent = q("fullName").value; q("signatureDate").textContent = dateLabel(model.today()); resetConsent();
  }
  q("startDate").min = current; q("startDate").max = model.offer.lastDate; q("startDate").value = open ? current : ""; q("birthDate").max = current;
  q("memberFields").disabled = false; renderPlans(); renderSummary(); q("toDetails").disabled = !open;
  if (!open) { q("campaignBanner").hidden = true; notice("2026年10月のお申込み期間は終了しました。現在のプランは店舗スタッフへご確認ください。"); }
  q("memberForm").addEventListener("submit", function (event) { event.preventDefault(); if (state.stage === 2 && validate()) { renderReview(); showStage(3); } });
  q("memberForm").addEventListener("input", function (event) { if (event.target.setCustomValidity) event.target.setCustomValidity(""); resetConsent(); });
  q("toDetails").addEventListener("click", function () { if (!open || model.today() > model.offer.lastDate) { notice("お申込み期間は終了しました。店舗スタッフへご確認ください。"); return; } renderSummary(); showStage(2); });
  ["changePlan", "backToPlans"].forEach(function (id) { q(id).addEventListener("click", function () { resetConsent(); showStage(1); }); });
  q("toReview").addEventListener("click", function () { if (validate()) { renderReview(); showStage(3); } });
  q("editDetails").addEventListener("click", function () { resetConsent(); showStage(2); });
  // UI preview only. No application API, payment SDK, card inputs, persistence,
  // capacity allocation or completion state exists until the backend is connected.
})();
