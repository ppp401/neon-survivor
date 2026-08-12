// icon.js — SV.Icons: Canvas 运行时生成 PNG 图标 dataURL(免去静态 PNG 资源)。
// manifest.json 用 SVG(PWA 安装图标,Android);iOS apple-touch-icon 与浏览器 favicon 由本模块在 boot 时
// 通过 Canvas 绘制后,以 dataURL 替换 <link> 节点 href —— iOS Safari 在「添加到主屏幕」时读实时 DOM。
(function () {
  "use strict";
  const SV = window.SV = window.SV || {};

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 主图标绘制:深紫渐变底 + 中心光晕 + 玩家白核 + 6 颗环绕霓虹光刃(与游戏旋转光刃呼应)
  function drawIcon(size) {
    size = Math.max(64, Math.floor(size || 192));
    const cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    const ctx = cv.getContext("2d");
    if (!ctx) return "";

    const cx = size / 2, cy = size / 2;

    // 1) 圆角底板 + 深紫径向渐变
    const bg = ctx.createRadialGradient(cx, cy * 0.84, 0, cx, cy, size * 0.72);
    bg.addColorStop(0, "#1a1240");
    bg.addColorStop(1, "#070611");
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, size, size, size * 0.18);
    ctx.fill();

    // 2) 中心辉光(青→紫)
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.42);
    glow.addColorStop(0, "rgba(90,209,255,0.95)");
    glow.addColorStop(0.45, "rgba(192,107,255,0.55)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    // 3) 玩家核心(带辉光的白圆)
    ctx.save();
    ctx.shadowBlur = size * 0.08;
    ctx.shadowColor = "#9be7ff";
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.085, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4) 6 颗环绕光刃(青/紫交替)
    const bladeR = size * 0.34;
    const bladeLen = size * 0.135;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const bx = cx + Math.cos(a) * bladeR;
      const by = cy + Math.sin(a) * bladeR;
      const col = (i & 1) ? "#5ad1ff" : "#c06bff";
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(a + Math.PI / 2);
      ctx.shadowBlur = size * 0.05;
      ctx.shadowColor = col;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -bladeLen * 0.55);
      ctx.lineTo(bladeLen * 0.38, bladeLen * 0.5);
      ctx.lineTo(-bladeLen * 0.38, bladeLen * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    try { return cv.toDataURL("image/png"); } catch (e) { return ""; }
  }

  const Icons = {
    draw: drawIcon,
    // boot 后调用:替换 apple-touch-icon / favicon 链接为运行时生成 PNG
    apply: function () {
      try {
        const touch = document.querySelector('link[rel="apple-touch-icon"]');
        if (touch) {
          const d = drawIcon(180);
          if (d) touch.href = d;
        }
        const fav = document.querySelector('link[rel="icon"]');
        if (fav && fav.getAttribute("type") !== "image/svg+xml") {
          const d2 = drawIcon(192);
          if (d2) fav.href = d2;
        }
      } catch (e) { /* 静默:图标失败不应阻断游戏 */ }
    }
  };

  SV.Icons = Icons;
})();
