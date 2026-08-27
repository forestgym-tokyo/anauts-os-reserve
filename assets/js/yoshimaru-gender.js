/* A-nauts OS Reserve - Yoshimaru first booking gender check */
(() => {
  "use strict";

  const routeKey = location.pathname.split("/").filter(Boolean).pop() || "";
  if (!["personal", "trial"].includes(routeKey)) return;

  const YOSHIMARU_CODE = "YOSHIMARU";
  const YOSHIMARU_NAME = "吉丸りな";
  const nativeFetch = window.fetch.bind(window);

  let selectedTrainerCode = "";
  let checkedIdentityKey = "";
  let genderRequired = null;
  let checking = false;
  let bypass = false;

  const form = document.querySelector("#reservationForm");
  const noteField = document.querySelector("#note")?.closest("label, .field");
  if (!form) return;

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
      <legend>性別（初回のみ）</legend>
      <div class="choice-row">
        <label><input type="radio" name="yoshimaru_gender" value="女性"> 女性</label>
        <label><input type="radio" name="yoshimaru_gender" value="男性"> 男性</label>
      </div>
      <p style="margin:9px 0 0;font-size:12px;line-height:1.6;opacity:.72">
        吉丸りなトレーナーをご予約される初回のみ確認しています。
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

  function summaryShowsYoshimaru() {
    return String(document.querySelector("#selectedSlotText")?.textContent || "").includes("吉丸");
  }

  function isYoshimaruSelected() {
    return selectedTrainerCode === YOSHIMARU_CODE || summaryShowsYoshimaru();
  }

  function currentIdentityKey() {
    const memberNo = String(document.querySelector("#memberNo")?.value || "").trim();
    const email = String(document.querySelector("#customerEmail")?.value || "").trim().toLowerCase();
    return `${memberNo}|${email}`;
  }

  function resetCheck() {
    checkedIdentityKey = "";
    genderRequired = null;
    setGenderVisible(false);
    document.querySelectorAll('input[name="yoshimaru_gender"]').forEach((radio) => {
      radio.checked = false;
    });
  }

  async function checkFirstBooking() {
    const memberNo = String(document.querySelector("#memberNo")?.value || "").trim();
    const email = String(document.querySelector("#customerEmail")?.value || "").trim().toLowerCase();
    const serviceCode = String(selectedService?.service_code || "").trim();

    const url = new URL(API_URL);
    url.searchParams.set("action", "checkTrainerFirstGender");
    url.searchParams.set("staff_code", YOSHIMARU_CODE);
    url.searchParams.set("member_no", memberNo);
    url.searchParams.set("email", email);
    url.searchParams.set("service_code", serviceCode);
    url.searchParams.set("_", Date.now().toString());

    const response = await nativeFetch(url.toString(), { cache: "no-store" });
    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.message || "性別確認の初回判定に失敗しました。");
    }

    return Boolean(result.data?.gender_required);
  }

  // トレーナー選択を追跡。personalのフィルター、trialの選択、最終確認モーダルに対応。
  document.addEventListener("click", (event) => {
    const filterButton = event.target.closest?.("[data-trainer-code]");
    if (filterButton) {
      const nextCode = String(filterButton.dataset.trainerCode || "").trim().toUpperCase();
      if (selectedTrainerCode !== nextCode) {
        selectedTrainerCode = nextCode;
        resetCheck();
      }
      return;
    }

    const confirmButton = event.target.closest?.(".ptc-trainer");
    if (confirmButton) {
      const nextCode = String(confirmButton.textContent || "").includes("吉丸")
        ? YOSHIMARU_CODE
        : "OTHER";
      if (selectedTrainerCode !== nextCode) {
        selectedTrainerCode = nextCode;
        resetCheck();
      }
    }
  }, true);

  document.querySelector("#customerEmail")?.addEventListener("input", () => {
    if (checkedIdentityKey && checkedIdentityKey !== currentIdentityKey()) resetCheck();
  });
  document.querySelector("#memberNo")?.addEventListener("input", () => {
    if (checkedIdentityKey && checkedIdentityKey !== currentIdentityKey()) resetCheck();
  });

  // 予約POSTに初回確認済みの性別を付与する。
  window.fetch = async function(input, init) {
    try {
      const method = String(init?.method || "GET").toUpperCase();
      const target = typeof input === "string" ? input : String(input?.url || input || "");

      if (method === "POST" && target === API_URL && typeof init?.body === "string" && isYoshimaruSelected()) {
        const body = JSON.parse(init.body);
        if (body?.action === "createReservation") {
          body.staff_code = YOSHIMARU_CODE;
          const gender = selectedGender();
          if (genderRequired === true && gender) body.gender = gender;
          init = { ...init, body: JSON.stringify(body) };
        }
      }
    } catch (_) {
      // JSON以外は変更しない。
    }

    return nativeFetch(input, init);
  };

  form.addEventListener("submit", async (event) => {
    if (bypass) {
      bypass = false;
      return;
    }

    if (!isYoshimaruSelected()) {
      setGenderVisible(false);
      return;
    }

    const email = String(document.querySelector("#customerEmail")?.value || "").trim();
    if (!email) return; // 共通フォーム側の通常バリデーションを優先。

    const identityKey = currentIdentityKey();

    if (checkedIdentityKey === identityKey && genderRequired !== null) {
      if (!genderRequired) {
        setGenderVisible(false);
        return;
      }

      setGenderVisible(true);
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
        return;
      }
      return;
    }

    if (checking) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    checking = true;

    const submit = document.querySelector("#submitButton");
    const oldText = submit?.textContent;
    if (submit) {
      submit.disabled = true;
      submit.textContent = "初回確認中…";
    }

    try {
      genderRequired = await checkFirstBooking();
      checkedIdentityKey = identityKey;

      if (genderRequired) {
        setGenderVisible(true);
        showError("吉丸りなトレーナーは女性専用です。初回のみ性別を選択してください。");
        return;
      }

      setGenderVisible(false);
      hideError();
      bypass = true;
      form.requestSubmit();
    } catch (error) {
      showError(error.message || "性別確認を行えませんでした。再度お試しください。");
    } finally {
      checking = false;
      if (submit) {
        submit.disabled = false;
        submit.textContent = oldText || "この内容で予約する";
      }
    }
  }, true);

  ensureGenderField();
})();
