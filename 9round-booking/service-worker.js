"use strict";
const CACHE = "9round-booking-public-v6-20261024-nov30";
const BASE = new URL("./", self.location.href);
const INDEX = new URL("index.html", BASE).href;
const FILES = ["index.html", "styles.css", "config.js", "api.js", "app.js", "fighter.js", "member-tools.js", "pwa.js", "manifest.webmanifest", "vendor/qrcode.min.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];
const PUBLIC_ASSETS = new Set(FILES.map(function (file) { return new URL(file, BASE).href; }));
self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(Array.from(PUBLIC_ASSETS)); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key.startsWith("9round-booking-public-") && key !== CACHE; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (event) {
  const request = event.request, url = new URL(request.url);
  // Never intercept API requests, POSTs, authentication, or another application's pages.
  if (request.method !== "GET" || url.origin !== BASE.origin) return;
  const navigation = request.mode === "navigate" && (url.pathname === BASE.pathname || url.pathname === new URL(INDEX).pathname);
  const asset = new URL(url.pathname, url.origin).href;
  if (!navigation && !PUBLIC_ASSETS.has(asset)) return;
  const key = navigation ? INDEX : asset;
  event.respondWith(fetch(request).then(function (response) {
    if (response.ok && response.type !== "opaque") {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.put(key, copy); }));
    }
    return response;
  }).catch(function () {
    return caches.open(CACHE).then(function (cache) { return cache.match(key); }).then(function (cached) {
      return cached || new Response("インターネットに接続してから、もう一度お試しください。", { status: 503, headers: { "Content-Type": "text/plain;charset=utf-8" } });
    });
  }));
});

