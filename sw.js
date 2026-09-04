// sw.js — Neon Survivor Service Worker(离线缓存)。纯 JS 无依赖。
// 注意:SW 仅在 HTTPS 或 localhost 下生效;局域网 IP 的 HTTP 不可用(详见 DEPLOY.md)。
//
// ★ 部署/更新代码后,必须递增 CACHE 版本号(如 v2 → v3),否则老用户拿不到新版!
//   详见 DEPLOY.md「Service Worker 缓存与版本更新」一节。
const CACHE = "neon-survivor-v2.4.1";
const VERSION = CACHE.replace("neon-survivor-", "");
// 同一文件也由主页面以经典 script 加载,确保标题展示值与 SW 缓存版本只有一个数据源。
if (typeof window !== "undefined") window.SV_SW_VERSION = VERSION;
const ASSETS = [
  "./sw.js",
  "./",
  "./index.html",
  "./css/styles.css",
  "./manifest.json",
  "./icon.svg",
  "./audio/menu_loop.mp3",
  "./audio/ruins_loop.mp3",
  "./audio/crimson_loop.mp3",
  "./audio/frozen_loop.mp3",
  "./audio/void_loop.mp3",
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

// 页面上下文只读取 VERSION；以下事件仅在 Service Worker 全局注册。
if (typeof window === "undefined") {
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
      // 删除所有旧版本缓存(CACHE 名变了就清),强制用户拿全新资源
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML 文档用 network-first:每次访问先尝试网络拿最新 HTML,
  // 这样 HTML 里引用的新 sw.js 会被浏览器检测到、触发 SW 更新;
  // 网络失败时才回退缓存(离线可用)。
  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.indexOf("text/html") >= 0;
  if (isHTML) {
    e.respondWith(
      fetch(req).then(function (res) {
        const clone = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, clone); }).catch(function () {});
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || new Response("离线且无缓存", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
        });
      })
    );
    return;
  }

  // 其他资源(js/css/svg/json)用 cache-first(快)
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
}
