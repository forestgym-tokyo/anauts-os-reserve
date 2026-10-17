(function () {
  "use strict";
  const auth = window.NineRoundStaff;
  const policy = document.permissionsPolicy || document.featurePolicy;
  const cameraAllowed = !policy || typeof policy.allowsFeature !== "function" || policy.allowsFeature("camera");
  let root, stream = null, timer = null, scanning = false, busy = false, date = "", lastSeen = "", generation = 0;
  const q = function (s) { return root.querySelector(s); };
  function active() { return !!auth.idToken && date === window.NineRoundTokyoDate(); }
  function notice(text, error) { q("#nrScanResult").textContent = text || ""; q("#nrScanResult").classList.toggle("is-error", !!error); }
  function controls() {
    if (!root) return;
    root.querySelectorAll("button,input,select").forEach(function (el) { el.disabled = !active() || busy; });
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
    if (!/^NR9:[a-f0-9]{64}$/.test(text)) { notice("9ROUNDの会員QRを読み取ってください。", true); return; }
    const identity = auth.generation, slot = q("#nrScanSlot").value, ownDate = date;
    if (!slot) { notice("受講登録する枠を選んでください。", true); return; }
    busy = true; controls(); notice("予約を確認して受講登録しています…");
    try {
      const data = await auth.request("checkIn9RoundMember", { date: ownDate, slot_id: slot, qr_text: text });
      if (!auth.idToken || identity !== auth.generation) return;
      notice(data.member_name + " 様 · " + data.start_time + (data.already_attended ? " は登録済みです。" : " を受講済みにしました。"));
      scanner.onRegistered();
    } catch (error) { if (auth.idToken && identity === auth.generation) notice(error.message, true); }
    finally { if (identity === auth.generation) { busy = false; controls(); } }
  }
  function decode(image, width, height) {
    const scale = Math.min(1, 1000 / Math.max(width, height));
    const canvas = q("#nrScanCanvas"); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
  }
  function frame() {
    if (!scanning || !active()) { stop(); return; }
    const video = q("#nrCameraVideo");
    if (!busy && video.readyState >= 2) {
      try {
        const code = decode(video, video.videoWidth, video.videoHeight);
        if (code && code.data !== lastSeen) { lastSeen = code.data; submit(code.data); }
      } catch (_) { notice("画像を読み取れませんでした。QR画像の選択かQRリーダーをお試しください。", true); stop(); return; }
    }
    timer = setTimeout(frame, 250);
  }
  async function start() {
    if (!active() || busy || scanning) return;
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
      if (auth.idToken && identity === auth.generation) notice("この画面ではカメラを使えません。QRの撮影・画像選択か店舗のQRリーダーをご利用ください。", true);
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
        '<p id="nrCameraAvailability" hidden>この画面ではQRの撮影・画像選択、または店舗のQRリーダーをご利用ください。</p>' +
        '<video id="nrCameraVideo" autoplay playsinline muted hidden></video><canvas id="nrScanCanvas" hidden></canvas>' +
        '<label>QRを撮影・画像を選択<input id="nrQrImage" type="file" accept="image/*" capture="environment"></label>' +
        '<form id="nrQrForm"><label for="nrQrInput">店舗のQRリーダーで読み取る</label><div class="nr-reader-input"><input id="nrQrInput" type="text" autocomplete="off" maxlength="80" placeholder="ここを選択してQRを読み取ってください" required><button type="submit">受講登録</button></div></form>' +
        '<div id="nrScanResult" class="nr-message" role="status" aria-live="polite"></div>';
      container.append(root);
      q("#nrCameraStart").addEventListener("click", start); q("#nrCameraStop").addEventListener("click", stop);
      q("#nrScanNext").addEventListener("click", function () { lastSeen = ""; q("#nrQrInput").focus(); });
      q("#nrScanSlot").addEventListener("change", function () { lastSeen = ""; notice(""); });
      q("#nrQrForm").addEventListener("submit", function (event) { event.preventDefault(); submit(q("#nrQrInput").value); });
      q("#nrQrImage").addEventListener("change", async function () {
        const file = q("#nrQrImage").files[0], identity = auth.generation;
        q("#nrQrImage").value = "";
        if (!file || !active() || busy) return;
        if (file.size > 12 * 1024 * 1024) { notice("12MB以内のQR画像を選択してください。", true); return; }
        const url = URL.createObjectURL(file);
        try {
          const image = await new Promise(function (resolve, reject) { const img = new Image(); img.onload = function () { resolve(img); }; img.onerror = reject; img.src = url; });
          if (!active() || identity !== auth.generation) return;
          const code = decode(image, image.naturalWidth, image.naturalHeight);
          if (!code) { notice("QRが見つかりません。QR全体が入った画像を選択してください。", true); return; }
          await submit(code.data);
        } catch (_) { if (auth.idToken && identity === auth.generation) notice("画像を読み取れませんでした。別の画像を選択してください。", true); }
        finally { URL.revokeObjectURL(url); }
      });
      document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
      window.addEventListener("pagehide", stop);
      controls();
    },
    sync: function (slots, value) {
      if (!root) return;
      const previous = date === value ? q("#nrScanSlot").value : "";
      if (date !== value) { stop(); lastSeen = ""; }
      date = value; q("#nrScanSlot").replaceChildren();
      const daily = slots.filter(function (s) { return s.kind === "DAILY"; });
      daily.forEach(function (s) { const option = document.createElement("option"); option.value = s.slot_id; option.textContent = s.start_time; q("#nrScanSlot").append(option); });
      const next = daily.find(function (s) { return Date.parse(value + "T" + s.end_time + ":00+09:00") > Date.now(); });
      q("#nrScanSlot").value = daily.some(function (s) { return s.slot_id === previous; }) ? previous : next ? next.slot_id : daily.length ? daily[daily.length - 1].slot_id : "";
      if (!active()) notice("受講登録する場合は、予約日を本日に切り替えてください。");
      controls();
    },
    reset: function () { if (!root) return; stop(); busy = false; date = ""; lastSeen = ""; q("#nrQrInput").value = ""; q("#nrQrImage").value = ""; q("#nrScanCanvas").width = 1; q("#nrScanCanvas").height = 1; q("#nrScanSlot").replaceChildren(); notice(""); controls(); }
  };
})();
