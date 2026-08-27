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

  let selectedTrainerCode = "";
  let genderRequired = false;

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
      <legend>性別（初回確認）</legend>
      <div class="choice-row">
        <label><input type="radio" name="yoshimaru_gender" value="女性"> 女性</label>
        <label><input type="radio" name="yoshimaru_gender" value="男性"> 男性</label>
      </div>
      <p style="margin:9px 0 0;font-size:12px;line-height:1.6;opacity:.72">
        吉丸りなトレーナーは女性専用です。スタッフによる初回確認が完了するまで表示されます。
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
    setGenderVisible(false);
    document.querySelectorAll('input[name="yoshimaru_gender"]').forEach((radio) => {
      radio.checked = false;
    });
  }

  function summaryShowsYoshimaru() {
    return String(document.querySelector("#selectedSlotText")?.textContent || "").includes("吉丸");
  }

  function isYoshimaruSelected() {
    return selectedTrainerCode === YOSHIMARU_CODE || summaryShowsYoshimaru();
  }

  // personalの絞り込み、trialのトレーナー選択、personalの最終担当選択を追跡する。
  document.addEventListener("click", (event) => {
    const trainerButton = event.target.closest?.("[data-trainer-code]");
    if (trainerButton) {
      const nextCode = String(trainerButton.dataset.trainerCode || "").trim().toUpperCase();
      if (nextCode !== selectedTrainerCode) {
        selectedTrainerCode = nextCode;
        resetGenderCheck();
      }
      return;
    }

    const confirmButton = event.target.closest?.(".ptc-trainer");
    if (confirmButton) {
      const nextCode = String(confirmButton.textContent || "").includes("吉丸")
        ? YOSHIMARU_CODE
        : "OTHER";
      if (nextCode !== selectedTrainerCode) {
        selectedTrainerCode = nextCode;
        resetGenderCheck();
      }
    }
  }, true);

  // 初回確認が表示された後は、女性を選ぶまで予約送信させない。
  form.addEventListener("submit", (event) => {
    if (!isYoshimaruSelected()) {
      resetGenderCheck();
      return;
    }

    if (!genderRequired) return;

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
  }, true);

  // createReservationへ吉丸トレーナーと、必要な場合だけ性別を渡す。
  // GASが「初回確認が必要」と返した場合だけ性別欄を表示する。
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

        if (body?.action === "createReservation") {
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

        if (result?.code === "YOSHIMARU_GENDER_REQUIRED") {
          genderRequired = true;
          setGenderVisible(true);
          showError("吉丸りなトレーナーは女性専用です。初回確認のため性別を選択してください。");
        } else if (result?.code === "YOSHIMARU_FEMALE_ONLY") {
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
