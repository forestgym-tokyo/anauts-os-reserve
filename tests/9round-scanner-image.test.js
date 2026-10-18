const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../9round-booking/staff/scanner.js"), "utf8");
const today = "2026-10-18", qr = "NR9:" + "a".repeat(64);

function environment(options = {}) {
  const requests = [], decodes = [], paints = [], urls = new Map(), revoked = [], pendingImages = [];
  const elements = new Map();
  class Element {
    constructor(tag) {
      this.tagName = tag; this.hidden = false; this.disabled = false; this.value = "";
      this.textContent = ""; this.files = []; this.listeners = new Map(); this.attributes = new Map();
      const classes = new Set();
      this.classList = { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) };
    }
    set innerHTML(html) {
      for (const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const el = new Element(match[1]); el.hidden = /\bhidden\b/.test(match[2]); elements.set("#" + match[3], el);
      }
    }
    querySelector(selector) { assert.ok(elements.has(selector), "known element: " + selector); return elements.get(selector); }
    querySelectorAll() { return [...elements.values()].filter(el => ["button", "input", "select"].includes(el.tagName)); }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    emit(type) { return this.listeners.get(type)?.({ preventDefault() {} }); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); if (key === "src") this.src = ""; }
    replaceChildren() { this.children = []; this.value = ""; }
    append(child) { (this.children ||= []).push(child); }
    focus() {}
    getContext() {
      const canvas = this;
      return {
        fillRect() { paints.push("white"); },
        drawImage() { paints.push("image"); },
        getImageData() { return options.pixels || { data: new Uint8ClampedArray(4), width: canvas.width, height: canvas.height }; }
      };
    }
  }
  let decodeResult = () => ({ data: qr });
  let requestImpl = async () => ({ member_name: "確認用会員", start_time: "10:15" });
  let requestStarted;
  const apiStarted = new Promise(resolve => { requestStarted = resolve; });
  const auth = { idToken: "test-staff", generation: 1, async request(action, body) {
    requests.push({ action, body }); requestStarted(); return requestImpl(action, body);
  } };
  const window = {
    NineRoundStaff: auth, NineRoundTokyoDate: () => today,
    jsQR(data, width, height, settings) {
      decodes.push({ width, height, settings });
      return options.pixels ? require("../9round-booking/vendor/jsqr.min.js")(data, width, height, settings) : decodeResult(width, height);
    },
    addEventListener() {}
  };
  const context = {
    window, document: { createElement: tag => new Element(tag), addEventListener() {}, hidden: false },
    navigator: {}, Date, setTimeout, clearTimeout,
    URL: { createObjectURL(file) { const url = "blob:test-" + (urls.size + 1); urls.set(url, file); return url; }, revokeObjectURL(url) { revoked.push(url); } },
    Image: class {
      set src(url) {
        const file = urls.get(url);
        this.naturalWidth = file.width || 1200; this.naturalHeight = file.height || 1200;
        const complete = () => file.unreadable ? this.onerror() : this.onload();
        if (options.holdImage) pendingImages.push(complete); else queueMicrotask(complete);
      }
    }
  };
  vm.runInNewContext(source, context);
  const scanner = window.NineRoundScanner;
  scanner.mount({ append() {} });
  const slots = [{ kind: "DAILY", slot_id: "DAILY:" + today + ":10:15", start_time: "10:15", end_time: "11:00" }];
  scanner.sync(slots, today);
  const get = id => elements.get("#" + id);
  function select(file = { name: "member-qr.png", size: 1200 }) {
    const input = get("nrQrImage"); input.files = [file]; input.value = "C:\\fakepath\\" + file.name;
    return input.emit("change");
  }
  return { get, auth, scanner, slots, select, requests, decodes, paints, revoked, pendingImages, apiStarted,
    decode: fn => { decodeResult = fn; }, request: fn => { requestImpl = fn; } };
}

test("selected QR image retains its filename and preview, shows progress, and prevents duplicate submissions", async () => {
  const e = environment(); let finish;
  e.request(() => new Promise(resolve => { finish = resolve; }));
  const reading = e.select();
  assert.match(e.get("nrQrImageStatus").textContent, /読み込んでいます/);
  await e.apiStarted;
  assert.equal(e.get("nrQrImage").value, "C:\\fakepath\\member-qr.png");
  assert.equal(e.get("nrQrImagePreview").hidden, false);
  assert.match(e.get("nrQrImagePreview").src, /^blob:/);
  assert.match(e.get("nrQrImageStatus").textContent, /受講登録しています/);
  assert.equal(e.get("nrQrImage").disabled, true);
  assert.equal(e.get("nrQrImageRetry").disabled, true);
  await e.get("nrQrImageRetry").emit("click");
  assert.equal(e.requests.length, 1);
  assert.equal(e.requests[0].action, "checkIn9RoundMember");
  assert.equal(e.requests[0].body.qr_text, qr);
  finish({ member_name: "確認用会員", start_time: "10:15" }); await reading;
  assert.match(e.get("nrQrImageStatus").textContent, /受講済みにしました/);
  assert.equal(e.get("nrQrImage").disabled, false);
  assert.equal(e.get("nrQrImage").attributes.get("aria-busy"), "false");
});

test("a failed attendance request is visible next to the image and the same file can be retried", async () => {
  const e = environment(); e.request(async () => { throw new Error("通信に失敗しました"); });
  await e.select();
  assert.equal(e.get("nrQrImageStatus").textContent, "通信に失敗しました");
  assert.equal(e.get("nrQrImageStatus").classList.contains("is-error"), true);
  e.request(async () => ({ member_name: "確認用会員", start_time: "10:15", already_attended: true }));
  await e.get("nrQrImageRetry").emit("click");
  assert.equal(e.requests.length, 2);
  assert.match(e.get("nrQrImageStatus").textContent, /登録済みです/);
  assert.equal(e.get("nrQrImageStatus").classList.contains("is-error"), false);
});

test("undecodable images remain visible with a useful error and can be retried without reselecting", async () => {
  const e = environment(); e.decode(() => null); await e.select();
  assert.equal(e.requests.length, 0);
  assert.equal(e.get("nrQrImagePreview").hidden, false);
  assert.match(e.get("nrQrImageStatus").textContent, /QRが見つかりません/);
  assert.equal(e.get("nrQrImageRetry").disabled, false);
  e.decode(() => ({ data: qr })); await e.get("nrQrImageRetry").emit("click");
  assert.equal(e.requests.length, 1);
});

test("a screenshot can be retried at a higher resolution without submitting twice", async () => {
  const e = environment(); e.decode(width => width >= 1800 ? { data: qr } : null);
  await e.select({ name: "screenshot.png", size: 5000, width: 4000, height: 3000 });
  assert.deepEqual(e.decodes.map(d => d.width), [1000, 1800]);
  assert.ok(e.decodes.every(d => d.settings.inversionAttempts === "attemptBoth"));
  assert.deepEqual(e.paints, ["white", "image", "white", "image"]);
  assert.equal(e.requests.length, 1);
});

test("a real inverted member QR image decodes and submits the original member pass", async () => {
  const encode = require("../9round-booking/vendor/qrcode.min.js");
  const symbol = encode(0, "M"); symbol.addData(qr); symbol.make();
  const modules = symbol.getModuleCount(), cell = 5, width = (modules + 8) * cell;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (symbol.isDark(row, col)) {
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const offset = (((row + 4) * cell + y) * width + (col + 4) * cell + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = 255;
    }
  }
  const e = environment({ pixels: { data, width, height: width } });
  await e.select({ name: "inverted-qr.png", size: data.length, width, height: width });
  assert.equal(e.requests.length, 1);
  assert.equal(e.requests[0].body.qr_text, qr);
  assert.match(e.get("nrQrImageStatus").textContent, /受講済みにしました/);
});

test("unsupported image data and oversized files report errors and release the controls", async () => {
  const e = environment(); await e.select({ name: "photo.heic", size: 5000, unreadable: true });
  assert.match(e.get("nrQrImageStatus").textContent, /PNG・JPEG/);
  assert.equal(e.get("nrQrImage").disabled, false);
  await e.select({ name: "large.jpg", size: 13 * 1024 * 1024 });
  assert.match(e.get("nrQrImageStatus").textContent, /12MB以内/);
  assert.equal(e.requests.length, 0);
});

test("logout while an image is opening clears its data and never submits attendance", async () => {
  const e = environment({ holdImage: true }), reading = e.select();
  e.auth.idToken = ""; e.auth.generation++; e.scanner.reset();
  e.pendingImages.shift()(); await reading;
  assert.equal(e.requests.length, 0);
  assert.equal(e.get("nrQrImage").value, "");
  assert.equal(e.get("nrQrImageStatus").hidden, true);
  assert.equal(e.get("nrQrImagePreview").hidden, true);
  assert.equal(e.get("nrQrImagePreview").src, "");
  assert.equal(e.get("nrQrImage").disabled, true);
  assert.ok(e.revoked.length);
});

test("changing the reservation date while an image is opening prevents attendance on the wrong date", async () => {
  const e = environment({ holdImage: true }), reading = e.select();
  e.scanner.sync(e.slots, "2026-10-19"); e.pendingImages.shift()(); await reading;
  assert.equal(e.requests.length, 0);
  assert.equal(e.get("nrQrImageStatus").hidden, true);
  assert.equal(e.get("nrQrImage").disabled, true);
  e.scanner.sync(e.slots, today);
  assert.equal(e.get("nrQrImage").disabled, false);
  assert.equal(e.get("nrQrImageRetry").hidden, true);
});
