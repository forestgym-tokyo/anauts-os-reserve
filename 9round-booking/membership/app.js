(function () {
  "use strict";
  const model = window.NineRoundMembershipPlans, q = function (id) { return document.getElementById(id); };
  const current = model.today(), state = { plan: "PREMIUM_ONE", stage: 1, busy: false, requestId: "", trial: null };
  const open = current <= model.offer.lastDate;
  const dateLabel = function (date) { if (!date) return ""; const p = date.split("-").map(Number); return p[0] + "年" + p[1] + "月" + p[2] + "日"; };
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function row(dl, label, value) { dl.append(el("dt", "", label), el("dd", "", value)); }
  function notice(message) { q("notice").hidden = !message; q("notice").textContent = message; }
  function resetConsent() { q("agreeTerms").checked = false; q("agreePrivacy").checked = false; if (state.accepting) q("toPayment").disabled = true; }
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
    const costs = el("dl"), quote = model.quote(plan.id, q("startDate").value, model.today());
    row(costs, "初期費用", model.yen(plan.initial)); row(costs, "9Rオリジナルグローブ", model.yen(plan.gloves));
    if (quote) {
      row(costs, "初月会費（" + quote.remainingDays + "日 / " + quote.daysInMonth + "日）", model.yen(quote.firstMonthFee));
      if (quote.nextMonthFee) row(costs, Number(quote.nextMonth.slice(5)) + "月分会費", model.yen(quote.nextMonthFee));
    }
    summary.append(costs);
    const first = q("firstPlanSummary"); first.replaceChildren();
    first.append(el("p", "first-plan", plan.name));
    if (quote) {
      first.append(el("p", "first-total-label", "入会当日のお支払額"), el("strong", "first-total", model.yen(quote.total)));
      const breakdown = el("p", "first-breakdown", "初期費用 " + model.yen(quote.initial) + " ＋ グローブ " + model.yen(quote.gloves) + " ＋ 日割り会費 " + model.yen(quote.firstMonthFee) + (quote.nextMonthFee ? " ＋ " + Number(quote.nextMonth.slice(5)) + "月分 " + model.yen(quote.nextMonthFee) : ""));
      first.append(breakdown, el("p", "first-next", "次回の定期決済予定：" + dateLabel(quote.nextBillingDate) + " ／ " + Number(quote.nextBillingMonth.slice(5)) + "月分 " + model.yen(quote.nextBillingFee)));
    } else first.append(el("p", "first-breakdown", "利用開始日をお選びください。"));
    if (quote) { const total = el("p", "summary-total", "入会当日のお支払額"); total.append(el("strong", "", model.yen(quote.total))); summary.append(total, el("p", "quote-note", dateLabel(quote.startDate) + "から月末まで（開始日を含む）")); }
    else summary.append(el("p", "quote-note", "利用開始日を選ぶと、初回お支払額を表示します。"));
    if (quote) summary.append(el("p", "quote-note", "次回の定期決済予定：" + dateLabel(quote.nextBillingDate) + " ／ " + Number(quote.nextBillingMonth.slice(5)) + "月分 " + model.yen(quote.nextBillingFee)));
    summary.append(el("p", "summary-term", term(plan)));
    const pair = plan.id === "FAMILY_PAIR"; q("pairSection").hidden = !pair; q("pairName").disabled = !pair; q("pairName").required = pair; q("pairMemberNo").disabled = !pair;
  }
  function showStage(n) {
    state.stage = n; notice(""); ["planStage", "detailsStage", "reviewStage"].forEach(function (id, index) { q(id).hidden = index + 1 !== n; });
    const title = q(["planTitle", "detailsTitle", "reviewTitle"][n - 1]);
    title.focus({ preventScroll: true }); title.scrollIntoView({ block: "start", behavior: "auto" });
  }
  function normalizeFields() {
    ["fullName", "nameKana", "fighterName", "memberEmail", "memberAddress", "addressDetail", "pairName"].forEach(function (id) { q(id).value = q(id).value.trim(); });
    q("postalCode").value = q("postalCode").value.normalize("NFKC").replace(/[\s-]/g, "");
    q("memberPhone").value = q("memberPhone").value.normalize("NFKC").replace(/[\s()-]/g, "");
    q("pairMemberNo").value = q("pairMemberNo").value.normalize("NFKC").trim();
  }
  function validate() {
    normalizeFields();
    ["startDate", "birthDate", "fullName", "nameKana", "postalCode", "memberPhone", "pairName"].forEach(function (id) { q(id).setCustomValidity(""); });
    if (!model.validStart(q("startDate").value, model.today())) q("startDate").setCustomValidity("本日から当月末までの日付をお選びください。");
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
    row(details, "ご入会プラン", plan.name); row(details, "利用開始日", dateLabel(q("startDate").value)); row(details, "月会費", model.yen(plan.monthly)); row(details, "初期費用", model.yen(plan.initial)); row(details, "9Rグローブ", model.yen(plan.gloves)); const quote = model.quote(plan.id, q("startDate").value, model.today());
    row(details, "初月会費", model.yen(quote.firstMonthFee) + "（" + quote.remainingDays + "日 / " + quote.daysInMonth + "日）");
    if (quote.nextMonthFee) row(details, Number(quote.nextMonth.slice(5)) + "月分会費", model.yen(quote.nextMonthFee));
    row(details, "入会当日のお支払額", model.yen(quote.total));
    row(details, "次回の定期決済予定", dateLabel(quote.nextBillingDate) + "（" + Number(quote.nextBillingMonth.slice(5)) + "月分 " + model.yen(quote.nextBillingFee) + "）"); row(details, "継続条件", term(plan));
    if (plan.campaign) row(details, "キャンペーン", "One・Half合計で先着30名\n店舗スタッフの確認後に確定します");
    [["お名前", "fullName"], ["フリガナ", "nameKana"], ["ファイターネーム", "fighterName"], ["メール", "memberEmail"], ["電話番号", "memberPhone"], ["郵便番号", "postalCode"], ["ご住所（町域まで）", "memberAddress"], ["番地・建物名", "addressDetail"]].forEach(function (pair) { if (q(pair[1]).value) row(person, pair[0], q(pair[1]).value); }); row(person, "生年月日", dateLabel(q("birthDate").value));
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
  q("toDetails").addEventListener("click", function () { if (!open || model.today() > model.offer.lastDate) { notice("お申込み期間は終了しました。店舗スタッフへご確認ください。"); return; } q("startDate").setCustomValidity("");
    if (!model.validStart(q("startDate").value, model.today())) { q("startDate").setCustomValidity("本日から当月末までの日付をお選びください。"); q("startDate").reportValidity(); return; }
    renderSummary(); showStage(2); });
  ["changePlan", "backToPlans"].forEach(function (id) { q(id).addEventListener("click", function () { resetConsent(); showStage(1); }); });
  q("toReview").addEventListener("click", function () { if (validate()) { renderReview(); showStage(3); } });
  q("editDetails").addEventListener("click", function () { state.requestId = ""; resetConsent(); showStage(2); });
  q("startDate").addEventListener("input", function () { q("startDate").setCustomValidity(""); state.requestId = ""; resetConsent(); renderSummary(); });
  window.NineRoundMembershipPostal.connect({ zip: q("postalCode"), base: q("memberAddress"), status: q("postalStatus"), select: q("addressCandidates"), choices: q("addressCandidatesLabel"), retry: q("retryPostal") });
  const reference = new URLSearchParams(window.location.hash.slice(1));
  const trialId = reference.get("application_id"), trialToken = reference.get("trial_token");
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (/^[a-f0-9]{64}$/.test(trialId || "") && /^[a-f0-9]{64}$/.test(trialToken || "")) {
    q("prefillNotice").hidden = false; q("prefillNotice").textContent = "体験予約の登録情報を確認しています…";
    const before = ["fullName", "memberEmail", "memberPhone"].map(function (id) { return q(id).value; });
    window.NineRoundBookingApi("get9RoundTrialBooking", { application_id: trialId, trial_token: trialToken }).then(function (booking) {
      if (!booking || booking.application_id !== trialId) throw new Error("booking mismatch");
      ["fullName", "memberEmail", "memberPhone"].forEach(function (id, i) { if (q(id).value === before[i]) q(id).value = String(booking[["name", "email", "phone"][i]] || "").slice(0, q(id).maxLength); });
      state.trial = { application_id: trialId, trial_token: trialToken };
      q("prefillNotice").textContent = "体験予約のお名前・メール・電話番号を引き継ぎました。内容をご確認いただき、未登録の項目をご入力ください。";
    }).catch(function () { q("prefillNotice").textContent = "体験予約の情報を取得できませんでした。お手数ですが、お客様情報をご入力ください。"; });
  }
  function payload() {
    const result = { request_id: state.requestId, plan_id: state.plan, start_date: q("startDate").value,
      name: q("fullName").value, name_kana: q("nameKana").value, birth_date: q("birthDate").value,
      fighter_name: q("fighterName").value, email: q("memberEmail").value, phone: q("memberPhone").value,
      postal_code: q("postalCode").value, address_base: q("memberAddress").value, address_detail: q("addressDetail").value,
      pair_name: state.plan === "FAMILY_PAIR" ? q("pairName").value : "", pair_member_no: state.plan === "FAMILY_PAIR" ? q("pairMemberNo").value : "",
      consent_terms: q("agreeTerms").checked, consent_privacy: q("agreePrivacy").checked, website: q("website").value };
    if (state.trial) { result.trial_application_id = state.trial.application_id; result.trial_token = state.trial.trial_token; }
    return result;
  }
  function updateSubmit() { if (state.accepting) q("toPayment").disabled = state.busy || !q("agreeTerms").checked || !q("agreePrivacy").checked; }
  ["agreeTerms", "agreePrivacy"].forEach(function (id) { q(id).addEventListener("change", updateSubmit); });
  q("toPayment").addEventListener("click", async function () {
    if (!state.accepting || state.busy || !q("agreeTerms").checked || !q("agreePrivacy").checked || !validate()) return;
    if (!state.requestId) { const bytes = new Uint8Array(32); window.crypto.getRandomValues(bytes); state.requestId = Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
    state.busy = true; updateSubmit(); notice("お申込み内容を保存しています…");
    q("editDetails").disabled = true;
    try {
      const receipt = await window.NineRoundBookingApi("create9RoundMembershipApplication", payload());
      q("reviewStage").hidden = true; q("receivedStage").hidden = false; q("receivedDetails").replaceChildren();
      row(q("receivedDetails"), "受付番号", receipt.application_id); row(q("receivedDetails"), "プラン", model.getPlan(receipt.quote.planId).name);
      row(q("receivedDetails"), "利用開始日", dateLabel(receipt.quote.startDate)); row(q("receivedDetails"), "入会当日のお支払額", model.yen(receipt.quote.total));
      row(q("receivedDetails"), "お申込み状況", "内容確認待ち・カード未登録・未決済"); notice(""); q("receivedTitle").focus();
    } catch (error) { notice((error.code ? error.message : "通信結果を確認できませんでした。入力を変更せず、もう一度送信すると同じ受付内容を確認します。") || "保存できませんでした。"); }
    finally { state.busy = false; q("editDetails").disabled = false; updateSubmit(); }
  });
  window.NineRoundBookingApi("get9RoundMembershipStatus", {}).then(function (status) {
    if (!status.accepting) return;
    state.accepting = true; q("toPayment").textContent = "カード登録・お支払いへ進む";
    q("submissionNote").textContent = "現在は、お申込み内容を店舗へ送信します。カード登録・お支払いは、準備が整い次第ご案内します。";
    document.querySelector(".preview-note").replaceChildren(el("span", "", "入会申込受付"), document.createTextNode("現在は申込内容の送信までご利用いただけます。カード登録・決済は準備中です。"));
    updateSubmit();
  }).catch(function () { /* Keep submission disabled when server availability is unknown. */ });
})();
