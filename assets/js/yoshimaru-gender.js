/* A-nauts OS Reserve - booking gender gate for women-only trainer */
(() => {
  "use strict";

  const routeKey = location.pathname.split("/").filter(Boolean).pop() || "";
  if (!["personal", "trial"].includes(routeKey)) return;

  const YOSHIMARU_CODE = "YOSHIMARU";
  const previousFetch = window.fetch.bind(window);
  const serviceSection = document.querySelector("#serviceSection");
  const availabilitySection = document.querySelector("#availabilitySection");
  const customerSection = document.querySelector("#customerSection");
  const completeSection = document.querySelector("#completeSection");
  const serviceGrid = document.querySelector("#serviceGrid");

  if (!serviceSection || !availabilitySection) return;

  let ready = false;
  let effectiveGender = "";
  let genderSource = "";
  let verifiedMemberNo = "";
  let verifiedEmail = "";
  let filterTrainerCode = "";
  let finalTrainerCode = "";

  window.ANAUTS_PERSONAL_GENDER_READY = false;
  window.ANAUTS_PERSONAL_GENDER = "";
  window.ANAUTS_PERSONAL_GENDER_SOURCE = "";

  function applyStepNumbers_() {
    const availabilityStep = document.querySelector("#availabilityStep");
    const customerStep = document.querySelector("#customerStep");
    if (availabilityStep) availabilityStep.textContent = "3";
    if (customerStep) customerStep.textContent = "4";
  }

  function ensureEligibilitySection() {
    let section = document.querySelector("#personalEligibilitySection");
    if (section) {
      applyStepNumbers_();
      return section;
    }

    section = document.createElement("section");
    section.id = "personalEligibilitySection";
    section.className = "card is-hidden";

    if (routeKey === "personal") {
      section.innerHTML = `
        <div class="step">
          <span class="step-num">2</span>
          <h2>会員情報を確認</h2>
        </div>
        <label class="field">
          <span>会員番号</span>
          <input id="eligibilityMemberNo" type="text" inputmode="numeric" maxlength="6" placeholder="6桁の数字のみ">
        </label>
        <label class="field">
          <span>登録メールアドレス</span>
          <input id="eligibilityEmail" type="email" autocomplete="email" placeholder="example@gmail.com">
        </label>
        <div id="eligibilityGenderBlock" class="field is-hidden">
          <span>性別</span>
          <div class="choice-row">
            <label><input type="radio" name="eligibility_gender" value="女性"> 女性</label>
            <label><input type="radio" name="eligibility_gender" value="男性"> 男性</label>
          </div>
        </div>
        <div id="eligibilityError" class="alert alert-error is-hidden" role="alert"></div>
        <p id="eligibilityStatus" class="status" aria-live="polite"></p>
        <button id="eligibilityCheckButton" class="button button-primary" type="button">会員情報を確認</button>
      `;
    } else {
      section.innerHTML = `
        <div class="step">
          <span class="step-num">2</span>
          <h2>性別を確認</h2>
        </div>
        <p class="status">女性限定のトレーナーがいるため、性別を選択してください。</p>
        <div class="field">
          <div class="choice-row">
            <label><input type="radio" name="eligibility_gender" value="女性"> 女性</label>
            <label><input type="radio" name="eligibility_gender" value="男性"> 男性</label>
          </div>
        </div>
        <div id="eligibilityError" class="alert alert-error is-hidden" role="alert"></div>
        <p id="eligibilityStatus" class="status" aria-live="polite"></p>
      `;
    }

    serviceSection.insertAdjacentElement("afterend", section);
    applyStepNumbers_();

    if (routeKey === "personal") {
      const memberInput = section.querySelector("#eligibilityMemberNo");
      const emailInput = section.querySelector("#eligibilityEmail");
      const button = section.querySelector("#eligibilityCheckButton");

      memberInput?.addEventListener("input", handleIdentityEdit);
      emailInput?.addEventListener("input", handleIdentityEdit);
      button?.addEventListener("click", verifyMemberAndResolveGender);
    }

    section.querySelectorAll('input[name="eligibility_gender"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        setReadyGender(radio.value, "SELF_DECLARED");
      });
    });

    return section;
  }

  function showGate() {
    const section = ensureEligibilitySection();
    applyStepNumbers_();
    section.classList.remove("is-hidden");
    availabilitySection.classList.add("is-hidden");
    customerSection?.classList.add("is-hidden");
    completeSection?.classList.add("is-hidden");
  }

  function hideGateError() {
    const node = document.querySelector("#eligibilityError");
    if (!node) return;
    node.textContent = "";
    node.classList.add("is-hidden");
  }

  function showGateError(message) {
    const node = document.querySelector("#eligibilityError");
    if (!node) return;
    node.textContent = message;
    node.classList.remove("is-hidden");
  }

  function setGateStatus(message) {
    const node = document.querySelector("#eligibilityStatus");
    if (node) node.textContent = message || "";
  }

  function genderBlockVisible(visible) {
    document.querySelector("#eligibilityGenderBlock")?.classList.toggle("is-hidden", !visible);
  }

  function clearGenderChoice() {
    document.querySelectorAll('input[name="eligibility_gender"]').forEach((radio) => {
      radio.checked = false;
    });
  }

  function syncVerifiedIdentityToReservationForm_() {
    if (routeKey !== "personal" || !ready) return;

    const member = document.querySelector("#memberNo");
    const email = document.querySelector("#customerEmail");

    if (member) member.value = verifiedMemberNo;
    if (email) email.value = verifiedEmail;

    // 会員番号・メールはSTEP 2で確認済みなので、お客様情報では再入力させない。
    document.querySelector("#memberNoField")?.classList.add("is-hidden");
    email?.closest("label.field")?.classList.add("is-hidden");
  }

  function invalidateEligibility() {
    if (!ready && !effectiveGender) return;

    ready = false;
    effectiveGender = "";
    genderSource = "";
    filterTrainerCode = "";
    finalTrainerCode = "";
    window.ANAUTS_PERSONAL_GENDER_READY = false;
    window.ANAUTS_PERSONAL_GENDER = "";
    window.ANAUTS_PERSONAL_GENDER_SOURCE = "";

    try { selectedSlot = null; } catch (_) {}

    availabilitySection.classList.add("is-hidden");
    customerSection?.classList.add("is-hidden");
    clearGenderChoice();
    genderBlockVisible(false);
    setGateStatus("");

    document.dispatchEvent(new CustomEvent("anauts:booking-gender-invalidated"));
  }

  function handleIdentityEdit() {
    if (routeKey !== "personal" || !ready) return;

    const memberNo = String(document.querySelector("#eligibilityMemberNo")?.value || "").trim();
    const email = String(document.querySelector("#eligibilityEmail")?.value || "").trim().toLowerCase();

    if (memberNo !== verifiedMemberNo || email !== verifiedEmail.toLowerCase()) {
      invalidateEligibility();
      showGate();
    }
  }

  function responseCode(result) {
    return String(
      result?.code ||
      result?.error_code ||
      result?.data?.code ||
      result?.detail?.code ||
      ""
    ).trim().toUpperCase();
  }

  function userMessage(result) {
    const code = responseCode(result);
    const messages = {
      MEMBER_NOT_FOUND: "会員番号が確認できません。",
      MEMBER_EMAIL_MISMATCH: "会員番号と登録メールアドレスが一致しません。",
      MEMBER_INACTIVE: "現在有効な会員番号ではありません。",
      MEMBER_NAME_NOT_SET: "会員マスターに氏名が設定されていません。"
    };
    return messages[code] || result?.message || "会員情報を確認できませんでした。";
  }

  async function verifyMemberAndResolveGender() {
    const memberNo = String(document.querySelector("#eligibilityMemberNo")?.value || "").trim();
    const email = String(document.querySelector("#eligibilityEmail")?.value || "").trim();
    const button = document.querySelector("#eligibilityCheckButton");

    hideGateError();
    setGateStatus("");
    genderBlockVisible(false);
    clearGenderChoice();

    if (!/^\d{6}$/.test(memberNo)) {
      showGateError("会員番号は6桁の数字で入力してください。");
      return;
    }

    if (!email) {
      showGateError("登録メールアドレスを入力してください。");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "確認中…";
    }

    try {
      const response = await previousFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "createReservation",
          policy_check_only: true,
          staff_code: YOSHIMARU_CODE,
          member_no: memberNo,
          customer_email: email
        })
      });

      const result = await response.json();
      if (!result?.ok) {
        showGateError(userMessage(result));
        return;
      }

      const state = String(result.data?.gender_state || "UNKNOWN").toUpperCase();
      verifiedMemberNo = memberNo;
      verifiedEmail = email;

      if (state === "FEMALE") {
        setReadyGender("女性", "MEMBER_MASTER");
        return;
      }

      if (state === "MALE") {
        setReadyGender("男性", "MEMBER_MASTER");
        return;
      }

      setGateStatus("会員マスターに性別情報がありません。女性限定のトレーナーがいるため、性別をお答えください。");
      genderBlockVisible(true);
    } catch (error) {
      showGateError(error?.message || "会員情報を確認できませんでした。再度お試しください。");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "会員情報を確認";
      }
    }
  }

  function setReadyGender(gender, source) {
    if (!["女性", "男性"].includes(gender)) return;

    if (routeKey === "personal" && source === "SELF_DECLARED") {
      verifiedMemberNo = String(document.querySelector("#eligibilityMemberNo")?.value || "").trim();
      verifiedEmail = String(document.querySelector("#eligibilityEmail")?.value || "").trim();
    }

    ready = true;
    effectiveGender = gender;
    genderSource = source;
    filterTrainerCode = "";
    finalTrainerCode = "";

    window.ANAUTS_PERSONAL_GENDER_READY = true;
    window.ANAUTS_PERSONAL_GENDER = gender;
    window.ANAUTS_PERSONAL_GENDER_SOURCE = source;

    hideGateError();
    setGateStatus(
      routeKey === "personal"
        ? "会員情報を確認しました。予約可能な日時を表示します。"
        : "予約可能な日時を表示します。"
    );

    applyStepNumbers_();
    syncVerifiedIdentityToReservationForm_();
    availabilitySection.classList.remove("is-hidden");

    document.dispatchEvent(new CustomEvent("anauts:booking-gender-ready", {
      detail: {
        gender: gender,
        source: source,
        member_no: verifiedMemberNo,
        customer_email: verifiedEmail
      }
    }));
  }

  function activeTrainerCode(body) {
    const direct = String(body?.staff_code || "").trim().toUpperCase();
    if (direct) return direct;
    if (finalTrainerCode) return finalTrainerCode;
    if (filterTrainerCode) return filterTrainerCode;
    return String(document.querySelector("#selectedSlotText")?.textContent || "").includes("吉丸")
      ? YOSHIMARU_CODE
      : "";
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#newReservationButton") && genderSource === "SELF_DECLARED") {
      invalidateEligibility();
      showGate();
      ensureEligibilitySection().scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (event.target.closest?.(".service-card")) {
      filterTrainerCode = "";
      finalTrainerCode = "";
    }

    if (event.target.closest?.(".slot-button")) {
      finalTrainerCode = "";
    }

    const trainer = event.target.closest?.("#personalTrainerChoices [data-trainer-code]");
    if (trainer) {
      filterTrainerCode = String(trainer.dataset.trainerCode || "").trim().toUpperCase();
      finalTrainerCode = "";
    }
  }, true);

  document.addEventListener("anauts:trainer-finalized", (event) => {
    finalTrainerCode = String(event.detail?.staff_code || "").trim().toUpperCase();
  });

  document.addEventListener("anauts:booking-gender-invalidated", () => {
    filterTrainerCode = "";
    finalTrainerCode = "";
  });

  if (routeKey === "personal") {
    serviceGrid?.addEventListener("click", () => {
      setTimeout(() => {
        applyStepNumbers_();
        if (ready) {
          syncVerifiedIdentityToReservationForm_();
          return;
        }
        showGate();
        ensureEligibilitySection().scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    });
  }

  if (routeKey === "trial") {
    const tryShowTrialGate = () => {
      try {
        if (!selectedService) return false;
      } catch (_) {
        return false;
      }
      applyStepNumbers_();
      if (!ready) showGate();
      return true;
    };

    if (!tryShowTrialGate()) {
      const observer = new MutationObserver(() => {
        if (tryShowTrialGate()) observer.disconnect();
      });
      observer.observe(availabilitySection, { attributes: true, attributeFilter: ["class"] });
    }
  }

  const availabilityGuard = new MutationObserver(() => {
    if (!ready && !availabilitySection.classList.contains("is-hidden")) {
      availabilitySection.classList.add("is-hidden");
      try {
        if (selectedService) showGate();
      } catch (_) {}
    }
  });
  availabilityGuard.observe(availabilitySection, { attributes: true, attributeFilter: ["class"] });

  // 実予約では、事前確認済みの本人情報と、必要な場合だけ自己申告性別を渡す。
  window.fetch = async function(input, init) {
    try {
      const method = String(init?.method || "GET").toUpperCase();
      const target = typeof input === "string" ? input : String(input?.url || input || "");

      if (method === "POST" && target === API_URL && typeof init?.body === "string") {
        const body = JSON.parse(init.body);

        if (body?.action === "createReservation" && !body?.policy_check_only) {
          if (routeKey === "personal" && ready) {
            body.member_no = verifiedMemberNo;
            body.customer_email = verifiedEmail;
          }

          const trainerCode = activeTrainerCode(body);
          if (trainerCode === YOSHIMARU_CODE && genderSource === "SELF_DECLARED") {
            body.gender = effectiveGender;
          }

          init = { ...init, body: JSON.stringify(body) };
        }
      }
    } catch (_) {
      // 既存処理を優先する。
    }

    return previousFetch(input, init);
  };

  ensureEligibilitySection();
  applyStepNumbers_();
  availabilitySection.classList.add("is-hidden");
})();
