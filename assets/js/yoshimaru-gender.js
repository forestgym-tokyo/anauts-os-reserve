/* A-nauts OS Reserve - Yoshimaru member-master gender check */
(() => {
  "use strict";

  const routeKey = location.pathname.split("/").filter(Boolean).pop() || "";
  if (!["personal", "trial"].includes(routeKey)) return;

  const YOSHIMARU_CODE = "YOSHIMARU";
  const previousFetch = window.fetch.bind(window);
  const form = document.querySelector("#reservationForm");
  const noteField = document.querySelector("#note")?.closest("label, .field");

  if (!form) return;

  let filterTrainerCode = "";
  let finalTrainerCode = "";
  let genderRequired = false;
  let policyChecking = false;
  let allowNextSubmit = false;

  const GENDER_REQUIRED_MESSAGE =
    "会員マスターに性別情報がありません。ご予約予定の吉丸りなトレーナーは女性限定となりますので、性別をお答えください。";
  const FEMALE_ONLY_MESSAGE =
    "吉丸りなトレーナーは女性限定です。他のトレーナーをお選びください。";

  function showError(message) {
    const node = document.querySelector("#formError");
    if (!node) return;
    node.textContent = message;
    node.classList.remove("is-hidden");
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideError() {
    const node = document.querySelector("#formError");
    if (!node) return;
    node.textContent = "";
    node.classList.add("is-hidden");
  }

  function ensureGenderField() {
    let field = document.querySelector("#yoshimaruGenderField");
    if (field) return field;

    field = document.createElement("fieldset");
    field.id = "yoshimaruGenderField";
    field.className = "field is-hidden";
    field.innerHTML = `
      <legend>性別確認</legend>
      <div class="choice-row">
        <label><input type="radio" name="yoshimaru_gender" value="女性"> 女性</label>
        <label><input type="radio" name="yoshimaru_gender" value="男性"> 男性</label>
      </div>
      <p style="margin:9px 0 0;font-size:12px;line-height:1.6;opacity:.72">
        ${GENDER_REQUIRED_MESSAGE}
      </p>
    `;

    if (noteField) noteField.insertAdjacentElement("beforebegin", field);
    else form.prepend(field);

    field.querySelectorAll('input[name="yoshimaru_gender"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.value === "男性") {
          showError(FEMALE_ONLY_MESSAGE);
        } else {
          hideError();
        }
      });
    });

    return field;
  }

  function selectedGender() {
    return document.querySelector('input[name="yoshimaru_gender"]:checked')?.value || "";
  }

  function setGenderVisible(visible) {
    ensureGenderField().classList.toggle("is-hidden", !visible);
  }

  function clearGenderSelection() {
    document.querySelectorAll('input[name="yoshimaru_gender"]').forEach((radio) => {
      radio.checked = false;
    });
  }

  function resetGenderCheck() {
    genderRequired = false;
    allowNextSubmit = false;
    setGenderVisible(false);
    clearGenderSelection();
  }

  function summaryShowsYoshimaru() {
    return String(document.querySelector("#selectedSlotText")?.textContent || "").includes("吉丸");
  }

  function activeTrainerCode() {
    if (finalTrainerCode) return finalTrainerCode;
    if (filterTrainerCode) return filterTrainerCode;
    return summaryShowsYoshimaru() ? YOSHIMARU_CODE : "";
  }

  function isYoshimaruSelected() {
    return activeTrainerCode() === YOSHIMARU_CODE;
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

  function identityPayload() {
    return {
      member_no: String(document.querySelector("#memberNo")?.value || "").trim(),
      customer_email: String(document.querySelector("#customerEmail")?.value || "").trim()
    };
  }

  function hasIdentity() {
    const identity = identityPayload();
    return !!(identity.member_no || identity.customer_email);
  }

  async function checkYoshimaruPolicyBeforeCreate() {
    const identity = identityPayload();
    const response = await previousFetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "createReservation",
        policy_check_only: true,
        staff_code: YOSHIMARU_CODE,
        member_no: identity.member_no,
        customer_email: identity.customer_email
      })
    });

    return await response.json();
  }

  // トレーナー絞り込みの変更を追跡する。UI自体には手を加えない。
  document.addEventListener("click", (event) => {
    const trainerButton = event.target.closest?.("#personalTrainerChoices [data-trainer-code]");
    if (trainerButton) {
      const nextCode = String(trainerButton.dataset.trainerCode || "").trim().toUpperCase();
      if (nextCode !== filterTrainerCode || finalTrainerCode) {
        filterTrainerCode = nextCode;
        finalTrainerCode = "";
        resetGenderCheck();
      }
      return;
    }

    if (event.target.closest?.(".slot-button")) {
      if (!filterTrainerCode && finalTrainerCode) {
        finalTrainerCode = "";
        resetGenderCheck();
      }
    }
  }, true);

  // 「すべてのトレーナー」から最終担当が決まった時だけ、正確なstaff_codeを受け取る。
  document.addEventListener("anauts:trainer-finalized", (event) => {
    const nextCode = String(event.detail?.staff_code || "").trim().toUpperCase();
    if (nextCode !== finalTrainerCode) {
      finalTrainerCode = nextCode;
      resetGenderCheck();
    }
  });

  // 吉丸トレーナー確定後、実予約を作る前に会員マスターのgenderを確認する。
  form.addEventListener("submit", async (event) => {
    if (!isYoshimaruSelected()) {
      resetGenderCheck();
      return;
    }

    if (allowNextSubmit) {
      allowNextSubmit = false;
      return;
    }

    if (genderRequired) {
      const gender = selectedGender();
      if (!gender) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showError("性別を選択してください。");
        return;
      }

      if (gender !== "女性") {
        event.preventDefault();
        event.stopImmediatePropagation();
        showError(FEMALE_ONLY_MESSAGE);
      }
      return;
    }

    // 共通フォーム側の通常入力チェックを優先するため、本人識別情報が無い段階では介入しない。
    if (!hasIdentity()) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (policyChecking) return;
    policyChecking = true;

    try {
      const result = await checkYoshimaruPolicyBeforeCreate();
      const code = responseCode(result);

      if (result?.ok) {
        hideError();
        allowNextSubmit = true;
        form.requestSubmit();
        return;
      }

      if (code === "YOSHIMARU_GENDER_REQUIRED") {
        genderRequired = true;
        setGenderVisible(true);
        showError(GENDER_REQUIRED_MESSAGE);
        ensureGenderField().scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }

      if (code === "YOSHIMARU_FEMALE_ONLY") {
        genderRequired = false;
        setGenderVisible(false);
        clearGenderSelection();
        showError(FEMALE_ONLY_MESSAGE);
        return;
      }

      // GAS反映前など事前確認機能が使えない場合は、従来のcreateReservation判定へ安全にフォールバックする。
      if (code === "ACTION_NOT_FOUND") {
        allowNextSubmit = true;
        form.requestSubmit();
        return;
      }

      throw new Error(result?.message || "性別情報を確認できませんでした。");
    } catch (error) {
      showError(error?.message || "性別情報を確認できませんでした。再度お試しください。");
    } finally {
      policyChecking = false;
    }
  }, true);

  // 実予約時だけ、吉丸トレーナーと必要な場合の性別をpayloadへ含める。
  // サーバー側でも会員マスターを再確認するため、フロント判定だけには依存しない。
  window.fetch = async function(input, init) {
    let isYoshimaruReservation = false;

    try {
      const method = String(init?.method || "GET").toUpperCase();
      const target = typeof input === "string" ? input : String(input?.url || input || "");

      if (
        method === "POST" &&
        target === API_URL &&
        typeof init?.body === "string" &&
        isYoshimaruSelected()
      ) {
        const body = JSON.parse(init.body);

        if (body?.action === "createReservation" && !body?.policy_check_only) {
          isYoshimaruReservation = true;
          body.staff_code = YOSHIMARU_CODE;

          const gender = selectedGender();
          if (genderRequired && gender) {
            body.gender = gender;
          }

          init = {
            ...init,
            body: JSON.stringify(body)
          };
        }
      }
    } catch (_) {
      // JSON以外は既存処理へそのまま渡す。
    }

    const response = await previousFetch(input, init);

    if (isYoshimaruReservation) {
      try {
        const result = await response.clone().json();
        const code = responseCode(result);

        if (code === "YOSHIMARU_GENDER_REQUIRED") {
          genderRequired = true;
          setGenderVisible(true);
          showError(GENDER_REQUIRED_MESSAGE);
        } else if (code === "YOSHIMARU_FEMALE_ONLY") {
          genderRequired = false;
          setGenderVisible(false);
          clearGenderSelection();
          showError(FEMALE_ONLY_MESSAGE);
        } else if (result?.ok) {
          resetGenderCheck();
        }
      } catch (_) {
        // 共通予約処理側で通常の通信エラー処理を行う。
      }
    }

    return response;
  };

  ensureGenderField();
})();
