/* A-nauts OS Reserve - Yoshimaru first booking gender check */
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
        吉丸りなトレーナーは女性専用です。スタッフによる初回確認が完了するまで、予約時に表示されます。
      </p>
    `;

    if (noteField) noteField.insertAdjacentElement("beforebegin", field);
    else form.prepend(field);

    field.querySelectorAll('input[name="yoshimaru_gender"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.value === "男性") {
          showError("吉丸りなトレーナーは女性専用です。");
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

  function resetGenderCheck() {
    genderRequired = false;
    allowNextSubmit = false;
    setGenderVisible(false);
    document.querySelectorAll('input[name="yoshimaru_gender"]').forEach((radio) => {
      radio.checked = false;
    });
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

  // 吉丸トレーナー確定後、実予約を作る前に確認済みかを事前判定する。
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
        showError("吉丸りなトレーナーは女性専用です。");
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
        showError("吉丸りなトレーナーは女性専用です。スタッフ確認が完了するまで、予約時に性別を選択してください。");
        ensureGenderField().scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }

      // GAS反映前など事前確認機能が使えない場合は、従来のcreateReservation判定へ安全にフォールバックする。
      if (code === "ACTION_NOT_FOUND") {
        allowNextSubmit = true;
        form.requestSubmit();
        return;
      }

      throw new Error(result?.message || "確認状態を確認できませんでした。");
    } catch (error) {
      showError(error?.message || "確認状態を確認できませんでした。再度お試しください。");
    } finally {
      policyChecking = false;
    }
  }, true);

  // 実予約時だけ、吉丸トレーナーと必要な場合の性別をpayloadへ含める。
  // サーバー側でも同じポリシーを再検証するため、フロント判定だけには依存しない。
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

        // サーバー側の最終防御。事前確認と実予約の間に状態が変わっても安全に処理する。
        if (code === "YOSHIMARU_GENDER_REQUIRED") {
          genderRequired = true;
          setGenderVisible(true);
          showError("吉丸りなトレーナーは女性専用です。スタッフ確認が完了するまで、予約時に性別を選択してください。");
        } else if (code === "YOSHIMARU_FEMALE_ONLY") {
          genderRequired = true;
          setGenderVisible(true);
          showError("吉丸りなトレーナーは女性専用です。");
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
