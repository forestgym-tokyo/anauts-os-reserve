(function (root) {
  "use strict";
  function normalize(value) { return String(value || "").normalize("NFKC").replace(/[\s-]/g, ""); }
  function addresses(data, postcode) {
    if (!data || data.status !== 200) throw new Error("住所を検索できませんでした。");
    const found = [];
    (Array.isArray(data.results) ? data.results : []).forEach(function (r) {
      if (String(r.zipcode) !== postcode) return;
      const text = [r.address1, r.address2, r.address3].map(function (s) { return typeof s === "string" ? s : ""; }).join("");
      if (text && found.indexOf(text) < 0) found.push(text);
    });
    return found;
  }
  function connect(options) {
    const zip = options.zip, base = options.base, status = options.status, select = options.select, choices = options.choices, retry = options.retry;
    let timer, controller, revision = 0;
    const cache = new Map();
    function message(text, again) { status.textContent = text; retry.hidden = !again; }
    async function lookup() {
      const code = normalize(zip.value), ticket = ++revision, addressBefore = base.value;
      if (controller) controller.abort();
      choices.hidden = true; select.replaceChildren();
      if (!/^\d{7}$/.test(code)) { message("郵便番号を7桁入力すると、町域まで自動で入力します。", false); return; }
      zip.value = code; message("住所を検索しています…", false);
      controller = new AbortController();
      const timeout = setTimeout(function () { controller.abort(); }, 8000);
      try {
        let result = cache.get(code);
        if (!result) {
          const response = await fetch("https://zipcloud.ibsnet.co.jp/api/search?zipcode=" + encodeURIComponent(code) + "&limit=100", {
            credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal
          });
          if (!response.ok) throw new Error("lookup failed");
          result = addresses(await response.json(), code); cache.set(code, result);
        }
        if (ticket !== revision || normalize(zip.value) !== code) return;
        if (base.value !== addressBefore) { message("入力中の住所を保持しました。必要に応じて再検索してください。", true); return; }
        if (!result.length) { message("該当する住所がありません。郵便番号をご確認いただくか、住所を直接ご入力ください。", true); return; }
        if (result.length === 1) {
          base.value = result[0]; base.dispatchEvent(new Event("input", { bubbles: true }));
          message("町域まで入力しました。続けて番地・建物名をご入力ください。", false);
        } else {
          const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "該当する住所をお選びください"; select.append(placeholder);
          result.forEach(function (address) { const option = document.createElement("option"); option.value = address; option.textContent = address; select.append(option); });
          choices.hidden = false; message("複数の住所が見つかりました。該当する町域をお選びください。", false);
        }
      } catch (_) {
        if (ticket === revision && normalize(zip.value) === code) message("住所を取得できませんでした。再検索するか、住所を直接ご入力ください。", true);
      } finally { clearTimeout(timeout); }
    }
    zip.addEventListener("input", function () { ++revision; if (controller) controller.abort(); clearTimeout(timer); choices.hidden = true; timer = setTimeout(lookup, 350); });
    zip.addEventListener("blur", function () { clearTimeout(timer); lookup(); });
    retry.addEventListener("click", lookup);
    select.addEventListener("change", function () { if (select.value) { base.value = select.value; base.dispatchEvent(new Event("input", { bubbles: true })); message("町域まで入力しました。続けて番地・建物名をご入力ください。", false); } });
  }
  const api = { normalize: normalize, addresses: addresses, connect: connect };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NineRoundMembershipPostal = api;
})(typeof window !== "undefined" ? window : this);
