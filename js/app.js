// app.js — 入口:DOM 就绪后启动游戏(脚本顺序最后加载)。
// 同时注册 Service Worker(PWA 离线缓存)与应用动态生成的 PNG 图标(iOS apple-touch-icon)。
(function () {
  "use strict";
  function go() {
    const versionEl = document.getElementById("titleVersion");
    if (versionEl) versionEl.textContent = window.SV_SW_VERSION || "";
    SV.Game.boot();
    // 运行时 PNG 图标(iOS apple-touch-icon + 浏览器 favicon);失败不阻断游戏
    try { if (SV.Icons && SV.Icons.apply) SV.Icons.apply(); } catch (e) {}
    // 注册 Service Worker(仅 HTTPS/localhost 生效;file:// 与局域网 IP HTTP 下静默失败)
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(function () {});
      }
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();
