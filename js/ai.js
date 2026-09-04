// ai.js — SV.AI: 每种敌人行为一函数。仅写入 e.vx/e.vy(满速)与定时器,积分由 entities 完成。
(function () {
  "use strict";
  const SV = window.SV;
  const U = SV.Util;
  const E = SV.Entities;

  function toPlayer(e, p, spd) {
    const a = U.angleTo(e.x, e.y, p.x, p.y);
    e.vx = Math.cos(a) * spd; e.vy = Math.sin(a) * spd;
  }
  // Boss 弹幕/激光伤害缩放:dmgFactor(t) × bossDmgMul(难度独立分档,整体上调且档差压缩) × endlessMul
  function dmgScale(st) {
    const t = st.time / 60;
    const diff = SV.Config.DIFFICULTY[st.difficulty] || SV.Config.DIFFICULTY.normal;
    const em = (st.endless && st.stage) ? SV.Config.CURVES.endlessMul(Math.max(0, (st.time - st.stage.goalMin) / 60)) : 1;
    return SV.Config.CURVES.dmgFactor(t) * (diff.bossDmgMul || diff.dmgMul) * em;
  }

  const Beh = {
    chase: function (e, p, dt) { toPlayer(e, p, e.speed); },
    tank: function (e, p, dt) { toPlayer(e, p, e.speed); },
    fast: function (e, p, dt) {
      const a = U.angleTo(e.x, e.y, p.x, p.y);
      const sway = Math.sin((e.t1 += dt) * 6) * 0.5;
      const ca = Math.cos(a + sway), sa = Math.sin(a + sway);
      e.vx = ca * e.speed; e.vy = sa * e.speed;
    },
    shooter: function (e, p, dt) {
      const d = U.dist(e.x, e.y, p.x, p.y);
      const a = U.angleTo(e.x, e.y, p.x, p.y);
      // 随机选向,每 0.6-1.2s 换一次(打破"纯切向同款")
      e.t2 -= dt;
      if (e.t2 <= 0) { e.t2 = U.rand(0.6, 1.2); e.cdir = a + U.rand(-Math.PI * 0.7, Math.PI * 0.7); }
      let ang = e.cdir;
      if (d > 260) ang = a;                 // 太远:靠近
      else if (d < 140) ang = a + Math.PI;  // 太近:退
      e.vx = Math.cos(ang) * e.speed; e.vy = Math.sin(ang) * e.speed;
      e.t1 -= dt;
      if (e.t1 <= 0 && d < 360) {
        e.t1 = 1.9;
        const spd = 230;
        E.addEShot(SV.Game.state, e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd, e.projDmg, e.color, 6, "shooter");
      }
    },
    bomber: function (e, p, dt) {
      toPlayer(e, p, e.speed);
      if (U.dist2(e.x, e.y, p.x, p.y) < (e.aoe + p.r) * (e.aoe + p.r)) {
        e.hp = 0; // 触发爆炸(killEnemy 结算 AOE)
      }
    },
    spawner: function (e, p, dt) {
      e.vx = 0; e.vy = 0;
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = 4;
        for (let i = 0; i < 3; i++) { const a = U.rand(0, U.TAU); E.addEnemy(SV.Game.state, "swarmer", e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18); }
      }
    },
    charger: function (e, p, dt) {
      const def = SV.Config.ENEMIES.charger;
      if (e.cstate === "walk") {
        toPlayer(e, p, e.speed);
        e.ct -= dt;
        if (e.ct <= 0) { e.cstate = "tele"; e.teleT = 0.7; e.cdir = U.angleTo(e.x, e.y, p.x, p.y); }
      } else if (e.cstate === "tele") {
        e.vx = 0; e.vy = 0; e.flash = 0.1; // 持续白闪预警
        e.teleT -= dt;
        if (e.teleT <= 0) { e.cstate = "charge"; e.chargeT = 0.6; }
      } else if (e.cstate === "charge") {
        e.vx = Math.cos(e.cdir) * def.chargeSpeed; e.vy = Math.sin(e.cdir) * def.chargeSpeed;
        e.chargeT -= dt;
        if (e.chargeT <= 0) { e.cstate = "cool"; e.coolT = 1.4; }
      } else { // cool
        e.vx = 0; e.vy = 0; e.coolT -= dt;
        if (e.coolT <= 0) { e.cstate = "walk"; e.ct = U.rand(0.4, 1.2); }
      }
    },
    flee: function (e, p, dt) {
      const d = U.dist(e.x, e.y, p.x, p.y);
      if (d < 360) { const a = U.angleTo(p.x, p.y, e.x, e.y); e.vx = Math.cos(a) * e.speed; e.vy = Math.sin(a) * e.speed; }
      else { e.vx *= 0.9; e.vy *= 0.9; }
    },
    wander: function (e, p, dt) {
      // 快速随机游走(ghost 高价值目标用):近身侧闪、中距背离、远距自由游走
      e.t1 -= dt;
      if (e.t1 <= 0) { e.t1 = U.rand(0.6, 1.4); e.cdir = U.rand(0, U.TAU); }
      const d = U.dist(e.x, e.y, p.x, p.y);
      let ang = e.cdir;
      if (d < 90) ang = U.angleTo(p.x, p.y, e.x, e.y) + U.rand(-0.5, 0.5);
      else if (d < 240) ang = U.angleTo(e.x, e.y, p.x, p.y) + Math.PI;
      e.vx = Math.cos(ang) * e.speed; e.vy = Math.sin(ang) * e.speed;
    },
    blink: function (e, p, dt) {
      toPlayer(e, p, e.speed);
      e.t1 -= dt;
      if (e.t1 <= 0) {
        e.t1 = U.rand(1.6, 2.4);
        const a = U.angleTo(e.x, e.y, p.x, p.y);
        const d = Math.min(180, U.dist(e.x, e.y, p.x, p.y) - 40);
        e.x += Math.cos(a) * d; e.y += Math.sin(a) * d;
        e.flash = 0.2; SV.Effects.hit(e.x, e.y, e.color);
      }
    },
    splitter: function (e, p, dt) { toPlayer(e, p, e.speed); }, // 死亡分裂由 killEnemy 处理
    shield: function (e, p, dt) { toPlayer(e, p, e.speed); },   // 减伤由 e.dr 在 damageEnemy 处理
    sniper: function (e, p, dt) {
      const d = U.dist(e.x, e.y, p.x, p.y);
      const a = U.angleTo(e.x, e.y, p.x, p.y);
      // 更站桩:sweet spot 内强阻尼,仅距离极不适配时挪动
      if (d < 280) { e.vx = -Math.cos(a) * e.speed * 0.6; e.vy = -Math.sin(a) * e.speed * 0.6; }
      else if (d > 420) { e.vx = Math.cos(a) * e.speed * 0.6; e.vy = Math.sin(a) * e.speed * 0.6; }
      else { e.vx *= 0.82; e.vy *= 0.82; }
      e.t1 -= dt;
      if (e.t1 <= 0 && d < 600) { e.t1 = 3.4; e.flash = 0.2; const spd = 420; E.addEShot(SV.Game.state, e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd, e.projDmg, e.color, 7, "sniper"); }
    },
    regen: function (e, p, dt) {
      toPlayer(e, p, e.speed);
      // 自愈者回血随时间成长(同敌人 maxHP 因子);SV.Game.state 为本文件既有取 state 模式。
      if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.regenRate * SV.Entities.healScale(SV.Game.state) * dt);
    },
    shield_aura: function (e, p, dt) { toPlayer(e, p, e.speed); }, // 护盾光环效果在 tickAuras 处理
    heal_aura: function (e, p, dt) { toPlayer(e, p, e.speed); },   // 回血光环效果在 tickAuras 处理
    speed_aura: function (e, p, dt) { toPlayer(e, p, e.speed); },  // 加速光环效果在 tickAuras 处理
    stalker: function (e, p, dt) {
      // 潜伏者:隐身接近 → 近身现身 → 短暂突袭冲刺
      const d = U.dist(e.x, e.y, p.x, p.y);
      if (!e.revealed) {
        toPlayer(e, p, e.speed);
        if (d < 70) { e.revealed = true; e.flash = 0.3; SV.Effects.hit(e.x, e.y, e.color); }
      } else {
        if (e._lungeT == null) e._lungeT = 0.6;
        e._lungeT -= dt;
        toPlayer(e, p, e._lungeT > 0 ? e.speed * 1.8 : e.speed);
      }
    },
    slime: function (e, p, dt) {
      // 腐泥:摇摆追击,周期在路径上留下短暂毒径(走 hazards 系统)
      const a = U.angleTo(e.x, e.y, p.x, p.y);
      const wob = Math.sin((e.t1 += dt) * 3) * 0.6;
      e.vx = Math.cos(a + wob) * e.speed; e.vy = Math.sin(a + wob) * e.speed;
      e.t2 -= dt;
      if (e.t2 <= 0) {
        e.t2 = e.trailInterval;
        const st = SV.Game.state;
        if (st.hazards && st.hazards.length < SV.Config.CONST.MAX_HAZARDS) {
          st.hazards.push({ x: e.x, y: e.y, r: 16, dmg: e.trailDmg * 0.5, life: e.trailDur, max: e.trailDur, color: e.color, kind: "poison", tick: 0.5, srcType: "slime" });
        }
      }
    },
    boss: function (e, p, dt) {
      const st = SV.Game.state;
      if (e.bossType === "duke") {
        toPlayer(e, p, e.speed);
        e.t1 -= dt; e.t2 -= dt;
        if (e.t1 <= 0) { e.t1 = 5; for (let i = 0; i < 3; i++) { const a = U.rand(0, U.TAU); E.addEnemy(st, "zombie", e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24); } }
        if (e.t2 <= 0) { e.t2 = 3.5; spiralBurst(st, e, 12, 140, 12, 7); }
      } else if (e.bossType === "wraith") {
        const enraged = !!e.enrage;
        const R = 250, sp = 1.3 * (enraged ? 1.6 : 1);
        e.cdir += sp * dt;
        const tx = p.x + Math.cos(e.cdir) * R, ty = p.y + Math.sin(e.cdir) * R;
        const a = U.angleTo(e.x, e.y, tx, ty);
        e.vx = Math.cos(a) * e.speed; e.vy = Math.sin(a) * e.speed;
        e.t1 -= dt;
        const rate = enraged ? 0.8 : 1.6;
        if (e.t1 <= 0) { e.t1 = rate; aimedSpread(st, e, p, 3, 0.32, 260, 12); }
      } else if (e.bossType === "architect") {
        toPlayer(e, p, e.speed);
        e.t1 -= dt; e.t2 -= dt;
        if (e.t1 <= 0) { e.t1 = 2.2; spiralBurst(st, e, 10, 160, 14, 7); }
        if (e.t2 <= 0) {
          let turrets = 0; for (let i = 0; i < st.enemies.length; i++) if (st.enemies[i].type === "shooter") turrets++;
          if (turrets < 3) { e.t2 = 9; const a = U.rand(0, U.TAU); E.addEnemy(st, "shooter", e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60); }
          else e.t2 = 3;
        }
        // 偶发:从两个偏移点各射一环(弹幕来源脱离体心)
        e.t3 = (e.t3 || 0) - dt;
        if (e.t3 <= 0) { e.t3 = 4.5; ringFrom(st, e.x - 50, e.y, 6, 150, 13, e.color, 6, "architect"); ringFrom(st, e.x + 50, e.y, 6, 150, 13, e.color, 6, "architect"); }
      } else if (e.bossType === "queen") {
        toPlayer(e, p, e.speed);
        e.t1 -= dt; e.t2 -= dt;
        if (e.t1 <= 0) { e.t1 = 5; for (let i = 0; i < 4; i++) { const a = U.rand(0, U.TAU); E.addEnemy(st, "swarmer", e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22); } }
        if (e.t2 <= 0) { e.t2 = 3; spiralBurst(st, e, 14, 150, 13, 6); }
      } else if (e.bossType === "inquisitor") {
        e.t1 -= dt; e.t2 -= dt;
        const d = U.dist(e.x, e.y, p.x, p.y);
        const a = U.angleTo(e.x, e.y, p.x, p.y);
        if (d > 320) { e.vx = Math.cos(a) * e.speed; e.vy = Math.sin(a) * e.speed; }
        else if (d < 200) { e.vx = -Math.cos(a) * e.speed; e.vy = -Math.sin(a) * e.speed; }
        else { e.vx *= 0.9; e.vy *= 0.9; }
        if (e.t1 <= 0) {
          e.t1 = U.rand(2.5, 3.5);
          const ta = U.rand(0, U.TAU), tr = 260;
          const ox = e.x, oy = e.y; // 传送前位置:留一环(弹幕脱离体心)
          e.x = p.x + Math.cos(ta) * tr; e.y = p.y + Math.sin(ta) * tr;
          e.flash = 0.25; SV.Effects.hit(e.x, e.y, e.color);
          ringFrom(st, ox, oy, 10, 150, 14, e.color, 6, "inquisitor");
          spiralBurst(st, e, 12, 160, 14, 7);
        }
        if (e.t2 <= 0) { e.t2 = 1.4; aimedSpread(st, e, p, 3, 0.3, 280, 13); }
      } else if (e.bossType === "magnetwarper") {
        // 磁暴行者:缓慢追敌 + 周期引力波(把玩家吸向自己)+ 贴身电击圈
        const pulling = e.cstate === "pull";
        if (!pulling) toPlayer(e, p, e.speed * 0.7);
        e.t1 -= dt; e.t2 -= dt;
        if (e.t1 <= 0) { e.t1 = 6; e.cstate = "pull"; e.ct = 1.2; ringFrom(st, e.x, e.y, 12, 150, 13, e.color, 6, "magnetwarper"); }
        if (e.cstate === "pull") {
          e.ct -= dt;
          e.vx = 0; e.vy = 0;
          if (e.ct > 0) {
            const a = U.angleTo(p.x, p.y, e.x, e.y); // 玩家 → Boss 方向
            p.x += Math.cos(a) * 120 * dt; p.y += Math.sin(a) * 120 * dt;
            SV.Effects.ring(e.x, e.y, e.color, 50, 95, 0.3, 2);
          } else e.cstate = "walk";
        }
        if (e.t2 <= 0) {
          e.t2 = 0.9;
          if (U.dist(e.x, e.y, p.x, p.y) < 115) E.damagePlayer(st, 11 * dmgScale(st), false, "magnetwarper");
        }
      } else if (e.bossType === "twins") {
        // 镜像双子:追敌 + 周期换位;击杀其一 → 本体反噬 25%(killEnemy 处理)
        const spd = e.speed * (e.enrage ? 1.5 : 1);
        toPlayer(e, p, spd);
        e.t1 -= dt; e.t2 -= dt;
        if (e.t1 <= 0 && !e.enrage) {
          e.t1 = 8; e.cstate = "swap"; e.ct = 0.15;
        }
        if (e.cstate === "swap") {
          e.ct -= dt; e.vx = 0; e.vy = 0;
          if (e.ct <= 0) {
            e.cstate = "walk";
            for (let i = 0; i < st.enemies.length; i++) {
              const o = st.enemies[i];
              if (o !== e && o.bossType === "twins" && o.hp > 0) {
                const tx = e.x, ty = e.y;
                e.x = o.x; e.y = o.y; o.x = tx; o.y = ty;
                e.flash = 0.2; o.flash = 0.2;
                SV.Effects.hit(e.x, e.y, e.color); SV.Effects.hit(o.x, o.y, o.color);
                ringFrom(st, e.x, e.y, 8, 150, 13, e.color, 6, "twins"); // 换位后两点各开一环
                ringFrom(st, o.x, o.y, 8, 150, 13, o.color, 6, "twins");
                break;
              }
            }
          }
        }
        if (e.t2 <= 0) { e.t2 = 2.2; aimedSpread(st, e, p, 3, 0.3, 240, 12); }
      } else if (e.bossType === "colossus") {
        // 弹幕巨像:不动 + 周期旋转扫射激光(期间召唤小怪)
        e.vx = 0; e.vy = 0;
        e.t1 -= dt;
        if (e.t1 <= 0) { e.t1 = 9; e.cstate = "sweep"; e.ct = 6; e.cdir = U.rand(0, U.TAU); spiralBurst(st, e, 14, 150, 14, 7); }
        if (e.cstate === "sweep") {
          e.ct -= dt;
          e.cdir += 1.5 * dt;
          const dx = Math.cos(e.cdir), dy = Math.sin(e.cdir);
          const px = p.x - e.x, py = p.y - e.y;
          const proj = px * dx + py * dy;
          const perp = Math.abs(-py * dx + px * dy);
          if (proj > 0 && proj < 600 && perp < 16 + p.r) E.damagePlayer(st, 13 * dmgScale(st), false, "colossus");
          SV.Weapons.beams.push({ pts: [[e.x, e.y], [e.x + dx * 600, e.y + dy * 600]], life: 0.08, max: 0.08, color: e.color, width: 14 });
          if (e.ct <= 0) e.cstate = "walk";
          e.t2 -= dt;
          if (e.t2 <= 0) {
            e.t2 = 2;
            for (let i = 0; i < 3; i++) { const a = U.rand(0, U.TAU); E.addEnemy(st, "zombie", e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80); }
          }
        } else {
          e.t2 -= dt;
          if (e.t2 <= 0) { e.t2 = 3; spiralBurst(st, e, 10, 150, 14, 8); }
        }
      } else {
        toPlayer(e, p, e.speed);
      }
    }
  };

  function burst(st, e, n, spd, dmg, r) {
    const off = U.rand(0, U.TAU);
    const d = dmg * dmgScale(st), src = e.bossType || e.type;
    for (let k = 0; k < n; k++) { const a = off + k / n * U.TAU; E.addEShot(st, e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd, d, e.color, r, src); }
  }
  function aimedSpread(st, e, p, n, spreadRad, spd, dmg) {
    const base = U.angleTo(e.x, e.y, p.x, p.y);
    const d = dmg * dmgScale(st), src = e.bossType || e.type;
    for (let k = 0; k < n; k++) { const a = base + (k - (n - 1) / 2) * spreadRad; E.addEShot(st, e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd, d, e.color, 6, src); }
  }
  // 从任意点发射环形弹幕(非体心,增加弹幕来源多样性)。srcType 由调用方传入(Boss 体内或换位点等)
  function ringFrom(st, x, y, n, spd, dmg, color, r, srcType) {
    const off = U.rand(0, U.TAU);
    const d = dmg * dmgScale(st);
    for (let k = 0; k < n; k++) { const a = off + k / n * U.TAU; E.addEShot(st, x, y, Math.cos(a) * spd, Math.sin(a) * spd, d, color, r || 6, srcType || null); }
  }
  // 螺旋弹幕:每次发射旋转相位(e.sp 专用字段),多次发射绘出螺旋。n=每圈弹数
  function spiralBurst(st, e, n, spd, dmg, r) {
    const ph = e.sp || 0;
    const d = dmg * dmgScale(st), src = e.bossType || e.type;
    for (let k = 0; k < n; k++) { const a = ph + k / n * U.TAU; E.addEShot(st, e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd, d, e.color, r || 6, src); }
    e.sp = ph + 0.5;
  }

  const AI = {
    update: function (state, e, dt) {
      // 冰冻:完全停滞(不移动、不开火、不产卵、bomber 不自爆)
      if (e.frozen > 0) { e.vx = 0; e.vy = 0; return; }
      // 变羊:中等速度随机游走(不追玩家、不开火;碰撞伤害由接触判定跳过,其余机制不变)
      if (e.sheep > 0) {
        e.t2 -= dt;
        if (e.t2 <= 0) { e.t2 = U.rand(0.5, 1.3); e.cdir = U.rand(0, U.TAU); }
        const spd = SV.Config.CONST.SHEEP_SPEED;
        e.vx = Math.cos(e.cdir) * spd; e.vy = Math.sin(e.cdir) * spd;
        return;
      }
      const p = state.player;
      const fn = Beh[e.ai] || Beh.chase;
      fn(e, p, dt);
    }
  };
  SV.AI = AI;
})();
