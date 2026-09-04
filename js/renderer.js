// renderer.js — SV.Renderer: 相机 + 视差背景 + 霓虹辉光(离屏缓存,非实时 shadowBlur)+ 视口剔除。
(function () {
  "use strict";
  const SV = window.SV;
  const U = SV.Util;
  const C = SV.Config.CONST;
  const COL = SV.Config.COLORS;

  let canvas, ctx;
  let dpr = 1, cssW = 0, cssH = 0;
  const cam = { x: 0, y: 0, zoom: 1 };
  let view = { l: 0, t: 0, r: 0, b: 0 };

  // 离屏缓存
  const glowCache = new Map();     // color -> 128x128 辉光画布
  let gridPattern = null;
  const stars = [];
  let starColor = "#cfe8ff";

  function makeGlow(color) {
    const S = 128;
    const cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, color);
    grd.addColorStop(0.35, color);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.9;
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return cv;
  }
  function glow(color) {
    let g = glowCache.get(color);
    if (!g) { g = makeGlow(color); glowCache.set(color, g); }
    return g;
  }

  // 按形状构造路径(以 r 缩放)。敌人/玩家外观统一走这里。
  function drawShapePath(ctx, x, y, r, shape) {
    ctx.beginPath();
    if (shape === "triangle") {
      for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * U.TAU / 3; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath();
    } else if (shape === "square") {
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
    } else if (shape === "diamond") {
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    } else if (shape === "hex") {
      for (let k = 0; k < 6; k++) { const a = k * U.TAU / 6; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath();
    } else if (shape === "pentagon") {
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * U.TAU / 5; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath();
    } else if (shape === "star") {
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5; const rr = (k & 1) ? r * 0.45 : r; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath();
    } else if (shape === "cross") {
      const t = r * 0.35;
      ctx.moveTo(x - t, y - r); ctx.lineTo(x + t, y - r); ctx.lineTo(x + t, y - t); ctx.lineTo(x + r, y - t); ctx.lineTo(x + r, y + t); ctx.lineTo(x + t, y + t); ctx.lineTo(x + t, y + r); ctx.lineTo(x - t, y + r); ctx.lineTo(x - t, y + t); ctx.lineTo(x - r, y + t); ctx.lineTo(x - r, y - t); ctx.lineTo(x - t, y - t); ctx.closePath();
    } else if (shape === "blob") {
      for (let k = 0; k < 8; k++) { const a = k * U.TAU / 8; const rr = r * (k & 1 ? 0.75 : 1.05); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, U.TAU);
    }
  }

  function makeGrid() {
    const S = C.CELL;
    const cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    const g = cv.getContext("2d");
    g.fillStyle = "rgba(0,0,0,0)";
    g.fillRect(0, 0, S, S);
    g.strokeStyle = COL.grid; g.lineWidth = 1;
    g.beginPath(); g.moveTo(S, 0); g.lineTo(S, S); g.lineTo(0, S); g.stroke();
    g.strokeStyle = COL.gridStrong;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(S, 0); g.stroke();
    return ctx.createPattern(cv, "repeat");
  }

  function makeStars() {
    stars.length = 0;
    for (let i = 0; i < 80; i++) {
      stars.push({ nx: Math.random(), ny: Math.random(), s: U.rand(0.6, 2.0), par: U.rand(0.25, 0.6), a: U.rand(0.25, 0.8) });
    }
  }

  function mod(v, m) { return ((v % m) + m) % m; }

  let eshotMark = false; // 敌方子弹标红(暂停界面开关):开启后每颗敌弹边缘描红,便于与己方弹幕区分

  const Renderer = {
    cam: cam,
    init: function (cv) {
      canvas = cv; ctx = cv.getContext("2d", { alpha: false });
      makeStars();
      this.resize();
    },
    resize: function () {
      if (!canvas) return;
      // 关键:用 window.innerWidth/Height(iOS Safari 视觉视口,排除 Safari UI 占位)
      // 而非 canvas.clientWidth/Height(布局视口,会包含 Safari 工具栏后面的区域,导致 buffer 比例
      // ≠ 显示比例 → 浏览器非等比拉伸 → 圆变椭圆)。
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = window.innerWidth || canvas.clientWidth;
      cssH = window.innerHeight || canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      // zoom 基于 min(短边):横竖屏一致;下限 0.62 让短边屏(手机)看到更多世界
      cam.zoom = U.clamp(Math.min(cssW, cssH) / 560, 0.62, 1.4);
      gridPattern = makeGrid();
    },
    cssSize: function () { return { w: cssW, h: cssH }; },

    // 切换关卡配色(背景渐变/网格/星点)
    setPalette: function (p) {
      if (!p) return;
      COL.bg0 = p.bg0; COL.bg1 = p.bg1; COL.grid = p.grid; COL.gridStrong = p.gridStrong;
      starColor = p.star || starColor;
      gridPattern = makeGrid();
    },

    // 敌方子弹标红开关
    setEshotMark: function (on) { eshotMark = !!on; },
    getEshotMark: function () { return eshotMark; },

    // 重置相机到目标(开局)
    snapCam: function (x, y) { cam.x = x; cam.y = y; },
    followCam: function (state, dt) {
      const p = state.player;
      const k = 1 - Math.exp(-9 * dt);
      let tx = cam.x + (p.x - cam.x) * k;
      let ty = cam.y + (p.y - cam.y) * k;
      // 竞技场边界夹取(竞技场大于视口时)
      const half = (state.stage && state.stage.half) || 2000;
      const hw = cssW / 2 / cam.zoom, hh = cssH / 2 / cam.zoom;
      tx = (half > hw) ? U.clamp(tx, -half + hw, half - hw) : 0;
      ty = (half > hh) ? U.clamp(ty, -half + hh, half - hh) : 0;
      cam.x = tx; cam.y = ty;
    },

    computeView: function () {
      const hw = cssW / 2 / cam.zoom, hh = cssH / 2 / cam.zoom, m = 70;
      view.l = cam.x - hw - m; view.r = cam.x + hw + m;
      view.t = cam.y - hh - m; view.b = cam.y + hh + m;
      return view;
    },

    render: function (state) {
      if (!ctx) return;
      const sh = SV.Effects.shakeOffset();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.save();
      ctx.translate(sh.x, sh.y);

      // 背景渐变(屏幕空间)
      const grd = ctx.createLinearGradient(0, 0, 0, cssH);
      grd.addColorStop(0, COL.bg1); grd.addColorStop(1, COL.bg0);
      ctx.fillStyle = grd; ctx.fillRect(-30, -30, cssW + 60, cssH + 60);

      // 视差星点(屏幕空间,随相机缓动)
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const sx = mod(s.nx * (cssW + 40) - cam.x * s.par, cssW + 40) - 20;
        const sy = mod(s.ny * (cssH + 40) - cam.y * s.par, cssH + 40) - 20;
        ctx.globalAlpha = s.a; ctx.fillStyle = starColor;
        ctx.fillRect(sx, sy, s.s, s.s);
      }
      ctx.globalAlpha = 1;

      // 进入世界空间
      ctx.translate(cssW / 2, cssH / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      this.computeView();

      // 网格地面(pattern 锚定世界原点,自然滚动)
      if (gridPattern) {
        ctx.fillStyle = gridPattern;
        ctx.fillRect(view.l, view.t, view.r - view.l, view.b - view.t);
      }

      // 竞技场边界
      this._drawArenaBorder(state);

      this._drawGems(state);
      this._drawPickups(state);

      // 玩家光环(aura)可见力场
      this._drawAuraField(state);
      this._drawHazards(state);

      // ── 辉光层(加性混合,整批一次)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this._glowEnemies(state);
      this._glowProjectiles(state);
      this._glowBeams(state);
      this._glowPlayer(state);
      ctx.globalAlpha = 1;
      ctx.restore();

      // ── 实体核心(普通混合)
      this._drawEnemyCores(state);
      this._drawProjectileCores(state);
      this._drawEShots(state);
      this._drawBeams(state);
      this._drawSwings(state);
      this._drawPlayerCore(state);

      // 粒子 + 浮字
      SV.Effects.draw(ctx, view);

      ctx.restore();

      // 屏外 Boss 箭头(屏幕空间,独立于上面的 restore)
      this._drawBossArrows(state);
    },

    _drawArenaBorder: function (state) {
      const half = (state.stage && state.stage.half) || 2000;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = COL.gridStrong;
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.8;
      ctx.strokeRect(-half, -half, half * 2, half * 2);
      ctx.globalAlpha = 0.25; ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(-half, -half, half * 2, half * 2);
      ctx.restore();
    },

    _drawBossArrows: function (state) {
      const arr = state.enemies;
      const margin = 34;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (!e.isBoss || e.hp <= 0) continue;
        const sx = cssW / 2 + (e.x - cam.x) * cam.zoom;
        const sy = cssH / 2 + (e.y - cam.y) * cam.zoom;
        if (sx >= 0 && sx <= cssW && sy >= 0 && sy <= cssH) continue; // 屏内不画箭头
        // 夹到边缘
        const cx = cssW / 2, cy = cssH / 2;
        let dx = sx - cx, dy = sy - cy;
        const ang = Math.atan2(dy, dx);
        const ex = U.clamp(sx, margin, cssW - margin);
        const ey = U.clamp(sy, margin, cssH - margin);
        const color = (SV.Config.BOSSES[e.bossType] && SV.Config.BOSSES[e.bossType].color) || "#ff5d73";
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.fillStyle = color;
        ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
        ctx.restore();
        // 距离数字
        const dist = Math.round(U.dist(e.x, e.y, state.player.x, state.player.y));
        ctx.fillStyle = color; ctx.font = "bold 11px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(dist + "", ex, ey + 18);
      }
    },

    // ── 宝石
    _drawGems: function (state) {
      const gems = state.gems;
      for (let i = 0; i < gems.length; i++) {
        const g = gems[i];
        if (g.x < view.l || g.x > view.r || g.y < view.t || g.y > view.b) continue;
        const col = g.value >= 5 ? COL.gold : (g.value >= 3 ? "#ffe14d" : COL.xp);
        const r = g.value >= 5 ? 6 : (g.value >= 3 ? 4.5 : 3.2);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.8; ctx.drawImage(glow(col), g.x - r * 2.4, g.y - r * 2.4, r * 4.8, r * 4.8);
        ctx.restore();
        ctx.fillStyle = col;
        ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.PI / 4);
        ctx.fillRect(-r / 2, -r / 2, r, r); ctx.restore();
      }
    },

    // ── 掉落物(血包/磁铁/宝箱/清场炸弹)。宝箱用紫色菱形+脉动信标,与金色磁铁区分
    _drawPickups: function (state) {
      const list = state.pickups;
      const T = state.time;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.x < view.l || p.x > view.r || p.y < view.t || p.y > view.b) continue;
        if (p.kind === "treasure") {
          const col = "#c06bff";
          const pulse = 0.5 + 0.5 * Math.sin(T * 5 + i);
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55 + 0.3 * pulse;
          ctx.drawImage(glow(col), p.x - 30, p.y - 30, 60, 60); ctx.restore();
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 + 0.35 * pulse;
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 16 + pulse * 6, 0, U.TAU); ctx.stroke(); ctx.restore();
          ctx.fillStyle = col; ctx.strokeStyle = "#0a0814"; ctx.lineWidth = 2;
          drawShapePath(ctx, p.x, p.y, 11, "diamond"); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = "bold 13px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("★", p.x, p.y + 1);
          continue;
        }
        const col = p.kind === "health" ? "#7CFFB2" : p.kind === "magnet" ? COL.gold : p.kind === "bomb" ? "#ff5d73" : "#ffd86b";
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.8;
        ctx.drawImage(glow(col), p.x - 22, p.y - 22, 44, 44); ctx.restore();
        ctx.fillStyle = col; ctx.strokeStyle = "#0a0814"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, U.TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#0a0814"; ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const ic = p.kind === "health" ? "+" : p.kind === "magnet" ? "✜" : p.kind === "bomb" ? "✸" : "★";
        ctx.fillText(ic, p.x, p.y + 1);
      }
    },

    _drawAuraField: function (state) {
      const p = state.player;
      for (let i = 0; i < state.weapons.length; i++) {
        const w = state.weapons[i];
        const def = SV.Config.weaponDef(w.id);
        if (def.kind !== "aura") continue;
        const s = SV.Weapons.stats(w, state);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.16;
        ctx.drawImage(glow(def.color), p.x - s.radius, p.y - s.radius, s.radius * 2, s.radius * 2);
        ctx.globalAlpha = 0.30; ctx.strokeStyle = def.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, s.radius, 0, U.TAU); ctx.stroke();
        ctx.restore();
      }
    },

    _drawHazards: function (state) {
      const arr = state.hazards;
      if (!arr || !arr.length) return;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < arr.length; i++) {
        const h = arr[i];
        if (h.x < view.l || h.x > view.r || h.y < view.t || h.y > view.b) continue;
        if (h.kind === "scorch") {                        // 陨石焦土:实心灼烧盘(区别于地图灼烧的辉光环),无 warm 预警
          const a = Math.max(0, h.life / h.max);
          ctx.globalAlpha = 0.22 * a; ctx.fillStyle = h.color;
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = h.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.stroke();
          continue;
        }
        if (h.warm > 0) {
          // 预热预警:虚线脉冲环,提示"此处即将灼烧",尚不伤害
          const pulse = 0.5 + 0.5 * Math.sin(state.time * 10 + i);
          ctx.globalAlpha = 0.30 + 0.30 * pulse; ctx.strokeStyle = h.color; ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.stroke(); ctx.setLineDash([]);
          continue;
        }
        const a = Math.max(0, h.life / h.max);
        ctx.globalAlpha = 0.18 * a;
        ctx.drawImage(glow(h.color), h.x - h.r * 2, h.y - h.r * 2, h.r * 4, h.r * 4);
        ctx.globalAlpha = 0.45 * a; ctx.strokeStyle = h.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.restore();
    },

    // ── 敌人辉光
    _glowEnemies: function (state) {
      const arr = state.enemies;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (e.x < view.l || e.x > view.r || e.y < view.t || e.y > view.b) continue;
        ctx.globalAlpha = e.frozen > 0 ? 0.95 : (e.elite ? 0.95 : 0.8);
        ctx.drawImage(glow(e.elite ? "#ffd86b" : (e.frozen > 0 ? "#bdf0ff" : e.color)), e.x - e.r * (e.elite ? 2.8 : 2.2), e.y - e.r * (e.elite ? 2.8 : 2.2), e.r * (e.elite ? 5.6 : 4.4), e.r * (e.elite ? 5.6 : 4.4));
      }
      ctx.globalAlpha = 1;
    },
    _drawEnemyCores: function (state) {
      const arr = state.enemies;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (e.x < view.l || e.x > view.r || e.y < view.t || e.y > view.b) continue;
        const stealthed = e.stealth && !e.revealed;
        ctx.save();
        if (stealthed) ctx.globalAlpha = 0.25;
        if (e.sheep > 0) {
          // 绵羊:蓬松白羊毛 + 敌色头(一眼可辨"被变形")
          const rr = e.r * 1.1;
          ctx.fillStyle = "#f5f3ec"; ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, U.TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#e7e3d6";
          ctx.beginPath(); ctx.arc(e.x - rr * 0.4, e.y - rr * 0.25, rr * 0.32, 0, U.TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(e.x + rr * 0.25, e.y + rr * 0.25, rr * 0.3, 0, U.TAU); ctx.fill();
          ctx.fillStyle = e.color;
          ctx.beginPath(); ctx.arc(e.x + rr * 0.5, e.y - rr * 0.5, rr * 0.32, 0, U.TAU); ctx.fill();
        } else {
          const col = e.frozen > 0 ? "#cfefff" : e.color;
          ctx.fillStyle = col; ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 2;
          drawShapePath(ctx, e.x, e.y, e.r, e.shape); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
        // 光环(盾卫/祭司/狂热者):淡填充 + 虚线环
        if (e.auraR) {
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.06; ctx.fillStyle = e.color;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.auraR, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 0.32; ctx.strokeStyle = e.color; ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(e.x, e.y, e.auraR, 0, U.TAU); ctx.stroke(); ctx.setLineDash([]);
          ctx.restore();
        }
        // 内核高光
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(e.x - e.r * 0.3, e.y - e.r * 0.3, e.r * 0.3, 0, U.TAU); ctx.fill();
        ctx.restore();
        // ghost 高价值提示:金色正弦闪烁(一眼看出是奖励目标)
        if (e.shimmer) {
          const sh = 0.5 + 0.5 * Math.sin(state.time * 8 + e.id);
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = sh * 0.7;
          ctx.fillStyle = SV.Config.COLORS.gold;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.3, 0, U.TAU); ctx.fill();
          ctx.restore();
        }
        // 贴合敌人形状的覆盖层基准(绵羊态身体是圆,其余用自身 shape);光环盾卫的护盾光环(auraR)另画、保持圆形
        const eshape = e.sheep > 0 ? "circle" : e.shape;
        // 受击白闪 / 冲刺预警:贴合形状(原圆形覆盖方形敌人会溢出)
        if (e.flash > 0) { ctx.globalAlpha = Math.min(1, e.flash * 5); ctx.fillStyle = "#ffffff"; drawShapePath(ctx, e.x, e.y, e.r, eshape); ctx.fill(); ctx.globalAlpha = 1; }
        // 剧毒泛绿(叠层越深越绿;贴合形状)
        if (e.poison > 0) { ctx.globalAlpha = 0.30 + 0.12 * (e.poisonStacks || 0); ctx.fillStyle = "#9bff5a"; drawShapePath(ctx, e.x, e.y, e.r, eshape); ctx.fill(); ctx.globalAlpha = 1; }
        // 诅咒印记:紫色咒环(贴合形状;引信进行中,玩家可见锁定了谁)
        if (e.hex > 0) { ctx.strokeStyle = "#d0a0ff"; ctx.lineWidth = 2; ctx.globalAlpha = 0.75; drawShapePath(ctx, e.x, e.y, e.r + 4, eshape); ctx.stroke(); ctx.globalAlpha = 1; }
        // 时之诅咒炸弹羊:脉冲时钟环,剩余越少闪烁越快。
        if (e.sheepBomb && !e.sheepBombDone) {
          const left = U.clamp(e.sheep / Math.max(0.01, e.sheepBombMax || e.sheep), 0, 1);
          const freq = 6 + (1 - left) * 22;
          const pulse = 0.45 + 0.45 * Math.sin(state.time * freq + e.id);
          const rr = e.r + 9 + pulse * 3;
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55 + pulse * 0.35;
          ctx.strokeStyle = "#d6b3ff"; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, U.TAU); ctx.stroke();
          const hand = -Math.PI / 2 + (1 - left) * U.TAU;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(hand) * rr * 0.68, e.y + Math.sin(hand) * rr * 0.68); ctx.stroke();
          ctx.restore();
        }
        // 精英:金色轮廓(贴合形状)
        if (e.elite) {
          ctx.strokeStyle = "rgba(255,216,107,0.9)"; ctx.lineWidth = 2.5;
          drawShapePath(ctx, e.x, e.y, e.r + 6, eshape); ctx.stroke();
        }
        // Boss:脉冲红轮廓(贴合形状;一眼可见,alpha 保底 0.65)
        if (e.isBoss) {
          const pulse = 0.8 + 0.15 * Math.sin(state.time * 6 + e.id);
          ctx.strokeStyle = "rgba(255,60,80," + pulse.toFixed(3) + ")"; ctx.lineWidth = 3;
          drawShapePath(ctx, e.x, e.y, e.r + 10, eshape); ctx.stroke();
          ctx.strokeStyle = "rgba(255,60,80," + (0.35 + 0.15 * Math.sin(state.time * 6 + e.id + 1)).toFixed(3) + ")"; ctx.lineWidth = 2;
          drawShapePath(ctx, e.x, e.y, e.r + 16, eshape); ctx.stroke();
        }
        // 血条(受伤过的非Boss;潜伏者隐身时不画)
        if (!e.isBoss && !stealthed && e.hp < e.maxHp) {
          const w = e.r * 1.8;
          ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w, 3);
          ctx.fillStyle = "#ff6b7d"; ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w * U.clamp(e.hp / e.maxHp, 0, 1), 3);
        }
      }
    },

    _glowProjectiles: function (state) {
      const list = SV.Weapons.proj.list;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.shockwave) continue; // 冲击波用描边环绘制,不走辉光(p.r 会变得很大)
        if (p.x < view.l || p.x > view.r || p.y < view.t || p.y > view.b) continue;
        if (p.grid) {
          const dx = Math.cos(p.gridDir), dy = Math.sin(p.gridDir), h = p.gridLen / 2;
          ctx.globalAlpha = 0.38 + 0.25 * (p.life / p.maxLife); ctx.strokeStyle = p.color; ctx.lineWidth = p.gridWidth * 2.6;
          ctx.beginPath(); ctx.moveTo(p.x - dx * h, p.y - dy * h); ctx.lineTo(p.x + dx * h, p.y + dy * h); ctx.stroke();
          continue;
        }
        ctx.globalAlpha = 0.9; ctx.drawImage(glow(p.color), p.x - p.r * 3, p.y - p.r * 3, p.r * 6, p.r * 6);
      }
      ctx.globalAlpha = 1;
    },
    _drawProjectileCores: function (state) {
      const list = SV.Weapons.proj.list;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.x < view.l || p.x > view.r || p.y < view.t || p.y > view.b) continue;
        if (p.grid) {
          const dx = Math.cos(p.gridDir), dy = Math.sin(p.gridDir), h = p.gridLen / 2;
          const pulse = 0.7 + 0.3 * Math.sin((state.time || 0) * 24 + p.x * 0.03 + p.y * 0.02);
          ctx.save(); ctx.globalAlpha = pulse * Math.min(1, p.life / 0.12); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = p.gridWidth;
          ctx.beginPath(); ctx.moveTo(p.x - dx * h, p.y - dy * h); ctx.lineTo(p.x + dx * h, p.y + dy * h); ctx.stroke(); ctx.restore();
        } else if (p.shockwave) {
          ctx.save();
          ctx.globalAlpha = 0.5; ctx.strokeStyle = p.color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.stroke();
          ctx.globalAlpha = 0.22; ctx.lineWidth = 9;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.stroke();
          ctx.restore();
        } else if (p.shape === "star") {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
          ctx.fillStyle = p.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.lineTo(Math.cos(a) * p.r * 1.6, Math.sin(a) * p.r * 1.6); ctx.lineTo(Math.cos(a + Math.PI / 4) * p.r * 0.5, Math.sin(a + Math.PI / 4) * p.r * 0.5); }
          ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        } else {
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.7, 0, U.TAU); ctx.fill();
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
        }
      }
    },

    // ── 敌方投射物(boss/炮台)。Boss 弹幕专属风格:ring 空心魔环 / bolt 高速光矛 / rune 符文菱形
    // (风格由 config BOSSES.shotStyle 决定,addEShot 打 boss 标记;均复用缓存 glow,不进实时 shadowBlur)
    _drawEShots: function (state) {
      const list = state.eshots;
      if (!list.length) return;
      const now = state.time || 0;
      // 辉光层(lighter):普通弹用原样方形辉光;Boss 弹加大 + 常驻微脉冲(相位用坐标伪随机,零字段开销)
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (s.x < view.l || s.x > view.r || s.y < view.t || s.y > view.b) continue;
        if (s.boss) {
          const pulse = 1 + 0.14 * Math.sin(now * 7 + s.x * 0.13 + s.y * 0.17);
          const R = (s.r + 1.5) * pulse;
          ctx.globalAlpha = 0.9;
          if (s.style === "bolt") {
            // 高速光矛:辉光沿速度方向拉长 ×2.2
            ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
            ctx.drawImage(glow(s.color), -R * 2.2, -R, R * 4.4, R * 2);
            ctx.restore();
          } else {
            const g = R * 3.2;
            ctx.drawImage(glow(s.color), s.x - g, s.y - g, g * 2, g * 2);
          }
        } else {
          ctx.globalAlpha = 0.85; ctx.drawImage(glow(s.color), s.x - s.r * 3, s.y - s.r * 3, s.r * 6, s.r * 6);
        }
      }
      ctx.globalAlpha = 1; ctx.restore();
      // 弹体层
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (s.x < view.l || s.x > view.r || s.y < view.t || s.y > view.b) continue;
        const R = s.r + (s.boss ? 1.5 : 0);
        if (s.style === "ring") {
          // 空心魔环:彩色粗描边 + 细白内环(无实芯),弹幕游戏经典轮廓
          ctx.strokeStyle = s.color; ctx.lineWidth = Math.max(2.5, R * 0.38);
          ctx.beginPath(); ctx.arc(s.x, s.y, R * 0.82, 0, U.TAU); ctx.stroke();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(s.x, s.y, R * 0.4, 0, U.TAU); ctx.stroke();
        } else if (s.style === "bolt" || s.style === "rune") {
          // 菱形弹芯:bolt 沿速度方向(速度感),rune 随时间缓转(相位按坐标错开,非同步旋转)
          const a = s.style === "bolt" ? Math.atan2(s.vy, s.vx) : now * 2.2 + s.x * 0.05 + s.y * 0.07;
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a);
          ctx.fillStyle = s.color;
          ctx.beginPath(); ctx.moveTo(R * 1.5, 0); ctx.lineTo(0, R * 0.75); ctx.lineTo(-R * 1.5, 0); ctx.lineTo(0, -R * 0.75); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.moveTo(R * 0.7, 0); ctx.lineTo(0, R * 0.34); ctx.lineTo(-R * 0.7, 0); ctx.lineTo(0, -R * 0.34); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else {
          // 普通敌弹:白芯 + 彩色圆(原样)
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(s.x, s.y, R * 0.6, 0, U.TAU); ctx.fill();
          ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, U.TAU); ctx.fill();
        }
      }
      // 敌弹标红:双层描红更醒目——外层半透明红晕(宽 7px)+ 内层亮红实芯(宽 3px);
      // 普通合成模式(不进 lighter 层),关闭时零开销
      if (eshotMark) {
        ctx.globalAlpha = 0.4; ctx.strokeStyle = "#ff3b4d"; ctx.lineWidth = 7;
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (s.x < view.l || s.x > view.r || s.y < view.t || s.y > view.b) continue;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 4, 0, U.TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.strokeStyle = "#ff5d6e"; ctx.lineWidth = 3;
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (s.x < view.l || s.x > view.r || s.y < view.t || s.y > view.b) continue;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 2, 0, U.TAU); ctx.stroke();
        }
      }
    },

    _glowBeams: function () {
      const beams = SV.Weapons.beams;
      // 光束辉光:默认较宽较亮;环绕激光(lance)整体细化调暗(不遮弹幕),进化版略增强以示机制差异
      for (let i = 0; i < beams.length; i++) {
        const b = beams[i];
        let a = 0.5, gw = 2.4;
        if (b.lance) { a = b.evo ? 0.30 : 0.20; gw = b.evo ? 1.8 : 1.2; }
        ctx.globalAlpha = a * (b.life / b.max); ctx.strokeStyle = b.color; ctx.lineWidth = b.width * gw; this._strokePoly(b.pts);
      }
      ctx.globalAlpha = 1;
    },
    _drawBeams: function () {
      const beams = SV.Weapons.beams;
      for (let i = 0; i < beams.length; i++) {
        const b = beams[i];
        ctx.globalAlpha = (b.lance ? 0.85 : 1) * (b.life / b.max); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = b.width; this._strokePoly(b.pts);
      }
      ctx.globalAlpha = 1;
    },
    _drawSwings: function () {
      const swings = SV.Weapons.swings || [];
      for (let i = 0; i < swings.length; i++) {
        const g = swings[i];
        if (g.x < view.l - g.radius || g.x > view.r + g.radius || g.y < view.t - g.radius || g.y > view.b + g.radius) continue;
        const t = g.life / g.max;
        ctx.globalAlpha = 0.5 * t;
        ctx.fillStyle = g.color;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.arc(g.x, g.y, g.radius, g.dir - g.arc / 2, g.dir + g.arc / 2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.85 * t;
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.radius, g.dir - g.arc / 2, g.dir + g.arc / 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    _strokePoly: function (pts) {
      if (!pts || pts.length < 2) return;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    },

    _glowPlayer: function (state) {
      const p = state.player;
      const ch = SV.Config.CHARACTERS[state.charId];
      const col = (ch && ch.color) || COL.player;
      ctx.globalAlpha = 0.9; ctx.drawImage(glow(col), p.x - p.r * 3, p.y - p.r * 3, p.r * 6, p.r * 6);
      ctx.globalAlpha = 1;
    },
    _drawPlayerCore: function (state) {
      const p = state.player;
      if (p.iframes > 0 && (Math.floor(p.iframes * 20) % 2 === 0)) { /* 闪烁:本帧不绘核心 */ }
      else {
        const ch = SV.Config.CHARACTERS[state.charId] || {};
        const app = ch.appearance || { shape: "circle" };
        const pcol = ch.color || COL.player;
        ctx.fillStyle = pcol; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
        drawShapePath(ctx, p.x, p.y, p.r, app.shape); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COL.playerCore; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, U.TAU); ctx.fill();
        this._drawCharDeco(state, app.deco);
        // 朝向指示
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.facing) * p.r * 1.7, p.y + Math.sin(p.facing) * p.r * 1.7); ctx.stroke();
      }
      // 玩家头顶血条(常驻)
      const bw = p.r * 2.4, bx = p.x - bw / 2, by = p.y - p.r - 11;
      const hpPct = U.clamp(p.hp / p.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = hpPct < 0.3 ? "#ff3d5a" : "#ff7d8e"; ctx.fillRect(bx, by, bw * hpPct, 4);

      // 旋转光刃 + 哨卫炮塔
      this._drawBlades(state);
      this._drawSentries(state);
    },
    _drawBlades: function (state) {
      const blades = state.player.blades;
      if (!blades || !blades.length) return;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < blades.length; i++) {
        const b = blades[i];
        if (b.x < view.l || b.x > view.r || b.y < view.t || b.y > view.b) continue;
        ctx.globalAlpha = 0.9; ctx.drawImage(glow("#cfefff"), b.x - 20, b.y - 20, 40, 40);
      }
      ctx.globalAlpha = 1; ctx.restore();
      // 刃体:带白色亮核的长刃菱形(与圆形弹丸拉开辨识度)
      for (let i = 0; i < blades.length; i++) {
        const b = blades[i];
        if (b.x < view.l || b.x > view.r || b.y < view.t || b.y > view.b) continue;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
        ctx.fillStyle = "#8ef0ff"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(0, 4); ctx.lineTo(-10, 0); ctx.lineTo(0, -4); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
        ctx.restore();
      }
    },
    _drawSentries: function (state) {
      const arr = state.player.sentries;
      if (!arr || !arr.length) return;
      // 拦截范围标识:淡辉光圆盘 + 虚线描边环(显眼地标出"弹幕清除区")
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i], ir = s.interceptR || 26;
        if (s.x + ir < view.l || s.x - ir > view.r || s.y + ir < view.t || s.y - ir > view.b) continue;
        ctx.globalAlpha = 0.12; ctx.drawImage(glow("#ffd86b"), s.x - ir, s.y - ir, ir * 2, ir * 2);
      }
      ctx.globalAlpha = 1; ctx.restore();
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i], ir = s.interceptR || 26;
        if (s.x + ir < view.l || s.x - ir > view.r || s.y + ir < view.t || s.y - ir > view.b) continue;
        ctx.save(); ctx.globalAlpha = 0.4; ctx.strokeStyle = "#ffd86b"; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(s.x, s.y, ir, 0, U.TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      }
      // 塔体辉光
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s.x < view.l || s.x > view.r || s.y < view.t || s.y > view.b) continue;
        ctx.globalAlpha = 0.9; ctx.drawImage(glow("#ffd86b"), s.x - 18, s.y - 18, 36, 36);
      }
      ctx.globalAlpha = 1; ctx.restore();
      // 塔身:外底盘环 + 实心核心 + 白色中心(炮塔造型,非弹丸)
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s.x < view.l || s.x > view.r || s.y < view.t || s.y > view.b) continue;
        ctx.strokeStyle = "#ffd86b"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, U.TAU); ctx.stroke();
        ctx.fillStyle = "#ffe9a8"; ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, U.TAU); ctx.fill();
      }
    },
    // 角色装饰(cheap 叠加,按 deco key 分发)
    _drawCharDeco: function (state, deco) {
      const p = state.player;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      if (deco === "ring") {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.3, 0, U.TAU); ctx.stroke();
      } else if (deco === "spark") {
        ctx.globalAlpha = 0.6; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x - p.r, p.y); ctx.lineTo(p.x + p.r, p.y); ctx.moveTo(p.x, p.y - p.r); ctx.lineTo(p.x, p.y + p.r); ctx.stroke();
      } else if (deco === "arrow") {
        ctx.globalAlpha = 0.5; ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(p.x + Math.cos(p.facing) * p.r * 0.7, p.y + Math.sin(p.facing) * p.r * 0.7, p.r * 0.22, 0, U.TAU); ctx.fill();
      } else if (deco === "dagger") {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) { const a = k * U.TAU / 4; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * p.r * 0.5, p.y + Math.sin(a) * p.r * 0.5); ctx.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); ctx.stroke(); }
      } else if (deco === "magnet") {
        ctx.globalAlpha = 0.4; ctx.strokeStyle = "#ffd86b"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.5, 0, U.TAU); ctx.stroke();
      } else if (deco === "rage") {
        ctx.globalAlpha = 0.6; ctx.strokeStyle = "#ff3d5a"; ctx.lineWidth = 2;
        drawShapePath(ctx, p.x, p.y, p.r * 1.15, "square"); ctx.stroke();
      } else if (deco === "clock") {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
        for (let k = 0; k < 6; k++) { const a = k * U.TAU / 6; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * p.r * 0.8, p.y + Math.sin(a) * p.r * 0.8); ctx.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); ctx.stroke(); }
      } else if (deco === "core") {
        ctx.globalAlpha = 0.5; ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.3, 0, U.TAU); ctx.fill();
      }
      ctx.restore();
    }
  };

  SV.Renderer = Renderer;
  SV.Renderer.drawShapePath = drawShapePath; // 供 menus 怪物图鉴绘制真实形状
})();
