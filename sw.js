// sw.js — Neon Survivor Service Worker(离线缓存)。纯 JS 无依赖。
// 注意:SW 仅在 HTTPS 或 localhost 下生效;局域网 IP 的 HTTP 不可用(详见 DEPLOY.md)。
const CACHE = "neon-survivor-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./manifest.json",
  "./icon.svg",
  "./js/util.js",
  "./js/config.js",
  "./js/storage.js",
  "./js/input.js",
  "./js/audio.js",
  "./js/pool.js",
  "./js/spatial.js",
  "./js/effects.js",
  "./js/entities.js",
  "./js/ai.js",
  "./js/weapons.js",
  "./js/waves.js",
  "./js/upgrades.js",
  "./js/renderer.js",
  "./js/hud.js",
  "./js/menus.js",
  "./js/auto.js",
  "./js/icon.js",
  "./js/game.js",
  "./js/app.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll 失败某一项不阻断其余(容忍单文件失败)
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  // 仅处理同源 GET(file:// 下 SW 不注册,这里恒为 http/https 同源)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, clone); }).catch(function () {});
        }
        return res;
      }).catch(function () { return cached; });
    })
  );
});
