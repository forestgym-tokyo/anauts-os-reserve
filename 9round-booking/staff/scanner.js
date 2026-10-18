(function () {
  "use strict";
  const auth = window.NineRoundStaff;
  const policy = document.permissionsPolicy || document.featurePolicy;
  const cameraAllowed = !policy || typeof policy.allowsFeature !== "function" || policy.allowsFeature("camera");
  let root, stream = null, timer = null, scanning = false, busy = false, date = "", lastSeen = "", generation = 0;
  let imageBusy = false, imageGeneration = 0, selectedImage = null, imageUrl = "";
  const q = function (s) { return root.querySelector(s); };
  function active() { return !!auth.idToken && date === window.NineRoundTokyoDate(); }
  function notice(text, error) { q("#nrScanResult").textContent = text || ""; q("#nrScanResult").classList.toggle("is-error", !!error); return { message: text, error: !!error }; }
  function imageNotice(text, error) { q("#nrQrImageStatus").textContent = text || ""; q("#nrQrImageStatus").classList.toggle("is-error", !!error); q("#nrQrImageStatus").hidden = !text; }
  function controls() {
    if (!root) return;
    root.querySelectorAll("button,input,select").forEach(function (el) { el.disabled = !active() || busy || imageBusy; });
    q("#nrQrImageRetry").disabled = !active() || busy || imageBusy || !selectedImage;
    q("#nrQrImage").setAttribute("aria-busy", String(imageBusy || busy));
    q("#nrCameraStart").hidden = scanning || !cameraAllowed; q("#nrCameraStop").hidden = !scanning;
    q("#nrCameraAvailability").hidden = cameraAllowed;
  }
  function stop() {
    generation++; scanning = false; clearTimeout(timer); timer = null;
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    stream = null;
    if (root) { q("#nrCameraVideo").srcObject = null; q("#nrCameraVideo").hidden = true; controls(); }
  }
  async function submit(text) {
    if (!active() || busy) return;
    text = String(text || "").trim(); q("#nrQrInput").value = "";
    if (!/^NR9:[a-f0-9]{64}$/.test(text)) return notice("9ROUNDの会員QRを読み取ってください。", true);
    const identity = auth.generation, slot = q("#nrScanSlot").value, ownDate = date;
    if (!slot) return notice("受講登録する枠を選んでください。", true);
    busy = true; controls(); notice("予約を確認して受講登録しています…");
    try {
      const data = await auth.request("checkIn9RoundMember", { date: ownDate, slot_id: slot, qr_text: text });
      if (!auth.idToken || identity !== auth.generation || ownDate !== date) return;
      const result = notice(data.member_name + " 様 · " + data.start_time + (data.already_attended ? " は登録済みです。" : " を受講済みにしました。"));
      scanner.onRegistered();
      return result;
    } catch (error) { if (auth.idToken && identity === auth.generation && ownDate === date) return notice(error.message, true); }
    finally { if (identity === auth.generation) { busy = false; controls(); } }
  }
  function decode(image, width, height, maximum) {
    const scale = Math.min(1, (maximum || 1000) / Math.max(width, height));
    const canvas = q("#nrScanCanvas"); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || typeof window.jsQR !== "function") throw new Error("QR読み取り機能を準備できませんでした。画面を更新して、もう一度画像を選択してください。");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: maximum ? "attemptBoth" : "dontInvert" });
  }
  function resetImage() {
    imageGeneration++; imageBusy = false; selectedImage = null;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = "";
    q("#nrQrImage").value = "";
    q("#nrQrImagePreview").removeAttribute("src"); q("#nrQrImagePreview").hidden = true;
    q("#nrQrImageRetry").hidden = true; imageNotice("");
  }
  async function readImage(file) {
    if (!file) return;
    if (!active()) { imageNotice("本日の予約に切り替えてから、QR画像を選択してください。", true); return; }
    if (busy || imageBusy) return;
    selectedImage = file;
    const identity = auth.generation, ownDate = date, task = ++imageGeneration;
    const current = function () { return active() && identity === auth.generation && ownDate === date && task === imageGeneration; };
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = "";
    q("#nrQrImagePreview").removeAttribute("src"); q("#nrQrImagePreview").hidden = true;
    q("#nrQrImageRetry").hidden = false;
    if (file.size > 12 * 1024 * 1024) { imageNotice("12MB以内のQR画像を選択してください。", true); controls(); return; }
    imageBusy = true; stop(); controls();
    imageNotice("選択した画像を読み込んでいます…"); notice("QR画像を読み込んでいます…");
    let url = "";
    try {
      url = URL.createObjectURL(file); imageUrl = url;
      const image = await new Promise(function (resolve, reject) {
        const img = new Image();
        const timeout = setTimeout(function () { reject(new Error("画像の読み込みに時間がかかっています。同じ画像を再読み取りするか、別の画像を選択してください。")); }, 15000);
        img.onload = function () { clearTimeout(timeout); resolve(img); };
        img.onerror = function () { clearTimeout(timeout); reject(new Error("画像を開けませんでした。QRを表示した画面のスクリーンショット、またはPNG・JPEG画像を選択してください。")); };
        img.src = url;
      });
      if (!current()) return;
      q("#nrQrImagePreview").src = url; q("#nrQrImagePreview").hidden = false;
      imageNotice("QR画像を読み取っています…");
      let code = null;
      for (const maximum of [1000, 1800, 2400]) {
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
        if (!current()) return;
        code = decode(image, image.naturalWidth, image.naturalHeight, maximum);
        if (code) break;
      }
      if (!code) throw new Error("QRが見つかりません。QR全体を大きく表示したスクリーンショットを選択してください。");
      if (!current()) return;
      imageNotice("QRを読み取りました。予約を確認して受講登録しています…");
      imageBusy = false;
      const result = await submit(code.data);
      if (current() && result) imageNotice(result.message, result.error);
    } catch (error) {
      if (current()) { const message = error.message || "画像を読み取れませんでした。別の画像を選択してください。"; imageNotice(message, true); notice(message, true); }
    } finally {
      if (task === imageGeneration) { imageBusy = false; controls(); }
      if (url && imageUrl !== url) URL.revokeObjectURL(url);
    }
  }
  function frame() {
    if (!scanning || !active()) { stop(); return; }
    const video = q("#nrCameraVideo");
    if (!busy && !imageBusy && video.readyState >= 2) {
      try {
        const code = decode(video, video.videoWidth, video.videoHeight);
        if (code && code.data !== lastSeen) { lastSeen = code.data; submit(code.data); }
      } catch (_) { notice("画像を読み取れませんでした。QR画像の選択かQRリーダーをお試しください。", true); stop(); return; }
    }
    timer = setTimeout(frame, 250);
  }
  async function start() {
    if (!active() || busy || imageBusy || scanning) return;
    const identity = auth.generation, ownGeneration = ++generation;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("camera-unavailable");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 800 }, height: { ideal: 600 } }, audio: false });
      if (!active() || identity !== auth.generation || ownGeneration !== generation) { media.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = media; scanning = true; lastSeen = "";
      const video = q("#nrCameraVideo"); video.srcObject = media; video.hidden = false; await video.play();
      if (!scanning || identity !== auth.generation) return;
      notice("対象枠を確認し、会員QRをカメラにかざしてください。"); controls(); frame();
    } catch (_) {
      stop();
      if (auth.idToken && identity === auth.generation) notice("この画面ではカメラを使えません。保存済みのQR画像の選択か店舗のQRリーダーをご利用ください。", true);
    }
  }
  const scanner = window.NineRoundScanner = {
    onRegistered: function () {},
    mount: function (container) {
      if (root) return;
      root = document.createElement("section"); root.className = "nr-scanner";
      root.innerHTML = '<h2>会員QRで受講登録</h2><p>本日の対象枠を選び、会員QRを読み取ると受講済みになります。</p>' +
        '<label>受講登録する枠<select id="nrScanSlot"></select></label>' +
        '<div class="nr-toolbar"><button id="nrCameraStart" type="button" class="nr-primary">カメラで読み取る</button><button id="nrCameraStop" type="button" hidden>カメラを停止</button><button id="nrScanNext" type="button">同じQRをもう一度</button></div>' +
        '<p id="nrCameraAvailability" hidden>この画面では保存済みのQR画像の選択、または店舗のQRリーダーをご利用ください。</p>' +
        '<video id="nrCameraVideo" autoplay playsinline muted hidden></video><canvas id="nrScanCanvas" hidden></canvas>' +
        '<label>保存済みのQR画像を選択<input id="nrQrImage" type="file" accept="image/*" aria-describedby="nrQrImageStatus"></label>' +
        '<p id="nrQrImageStatus" class="nr-message" role="status" aria-live="polite" hidden></p>' +
        '<img id="nrQrImagePreview" alt="選択したQR画像" style="max-width:240px;max-height:300px;width:auto;height:auto;margin:12px 0;background:#fff" hidden>' +
        '<button id="nrQrImageRetry" type="button" hidden>同じ画像を再読み取り</button>' +
        '<form id="nrQrForm"><label for="nrQrInput">店舗のQRリーダーで読み取る</label><div class="nr-reader-input"><input id="nrQrInput" type="text" autocomplete="off" maxlength="80" placeholder="ここを選択してQRを読み取ってください" required><button type="submit">受講登録</button></div></form>' +
        '<div id="nrScanResult" class="nr-message" role="status" aria-live="polite"></div>';
      container.append(root);
      q("#nrCameraStart").addEventListener("click", start); q("#nrCameraStop").addEventListener("click", stop);
      q("#nrScanNext").addEventListener("click", function () { lastSeen = ""; q("#nrQrInput").focus(); });
      q("#nrScanSlot").addEventListener("change", function () { lastSeen = ""; notice(""); });
      q("#nrQrForm").addEventListener("submit", function (event) { event.preventDefault(); submit(q("#nrQrInput").value); });
      q("#nrQrImage").addEventListener("change", function () { return readImage(q("#nrQrImage").files[0]); });
      q("#nrQrImageRetry").addEventListener("click", function () { return readImage(selectedImage); });
      document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
      window.addEventListener("pagehide", stop);
      controls();
    },
    sync: function (slots, value) {
      if (!root) return;
      const previous = date === value ? q("#nrScanSlot").value : "";
      if (date !== value) { resetImage(); stop(); lastSeen = ""; }
      date = value; q("#nrScanSlot").replaceChildren();
      const daily = slots.filter(function (s) { return s.kind === "DAILY"; });
      daily.forEach(function (s) { const option = document.createElement("option"); option.value = s.slot_id; option.textContent = s.start_time; q("#nrScanSlot").append(option); });
      const next = daily.find(function (s) { return Date.parse(value + "T" + s.end_time + ":00+09:00") > Date.now(); });
      q("#nrScanSlot").value = daily.some(function (s) { return s.slot_id === previous; }) ? previous : next ? next.slot_id : daily.length ? daily[daily.length - 1].slot_id : "";
      if (!active()) notice("受講登録する場合は、予約日を本日に切り替えてください。");
      controls();
    },
    reset: function () { if (!root) return; resetImage(); stop(); busy = false; date = ""; lastSeen = ""; q("#nrQrInput").value = ""; q("#nrScanCanvas").width = 1; q("#nrScanCanvas").height = 1; q("#nrScanSlot").replaceChildren(); notice(""); controls(); }
  };
})();
