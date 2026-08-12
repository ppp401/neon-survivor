// entities.js — SV.Entities: 工厂 + 玩家/敌人/投射物的每帧积分(仅逻辑,绘制在 renderer)
(function () {
  "use strict";
  const SV = window.SV;
  const U = SV.Util;
  const C = SV.Config.CONST;
  const EN = SV.Config.ENEMIES;
  const BOSSES = SV.Config.BOSSES;
  const CU = SV.Config.CURVES;

  let _id = 1;

  // ── 被动递减曲线(模块级,供 mods()/upgrades 预览共用)
  //   capDim —— 有硬上限:每级收益等比衰减,收敛到 cap(首级增量精确 = v1)。
  //   rootDim —— 无上限:每级收益 1/√k 衰减,等级大时 ≈ 2·per·√n 增长。
  function capDim(n, cap, v1) { return n <= 0 ? 0 : cap * (1 - Math.pow(1 - v1 / cap, n)); }
  function rootDim(n, per) { let s = 0; for (let k = 1; k <= n; k++) s += per / Math.sqrt(k); return s; }

  // canonical 追踪 id:进化武器(_evo)与进化前合并为同一统计桶,融合武器(无 _evo 后缀)独立成桶
  function tid(id) { return id.replace(/_evo$/, ""); }

  // ── 被动汇总(玩家与武器共用)。结果缓存到 state._mods,被动/角色变化后由 invalidateMods 失效。
  function mods(state) {
    if (state._mods) return state._mods;
    const p = state.passives;
    const cm = state.charMul || { hpMul: 1, speedMul: 1 };
    const L = function (id) { return p[id] || 0; };
    state._mods = {
      maxHp: (C.PLAYER_BASE_HP + rootDim(L("maxhp"), 24)) * cm.hpMul,
      speedMul: (1 + rootDim(L("speed"), 0.09)) * cm.speedMul,
      damageMul: 1 + rootDim(L("damage"), 0.11),
      cdMul: 1 - capDim(L("cooldown"), 0.70, 0.075),
      areaMul: 1 + rootDim(L("area"), 0.11),
      armorMul: 1 - capDim(L("armor"), 0.60, 0.095),
      regen: rootDim(L("regen"), 2),
      pickupMul: 1 + rootDim(L("magnet"), 0.45),
      xpMul: 1 + rootDim(L("magnet"), 0.09),
      luck: rootDim(L("luck"), 0.17),
      critChance: capDim(L("crit"), 1.0, 0.09),
      lifesteal: capDim(L("lifesteal"), 0.10, 0.01)
    };
    // 角色静态乘子(整局不变,进缓存安全)。!= null 以允许 0 值(如 berserker 清零再生)
    const cmod = state.charMods || {};
    if (cmod.pickupMul) state._mods.pickupMul *= cmod.pickupMul;
    if (cmod.regenMul != null) state._mods.regen *= cmod.regenMul;
    if (cmod.lifestealMul != null) state._mods.lifesteal *= cmod.lifestealMul;
    return state._mods;
  }
  function invalidateMods(state) { if (state) state._mods = null; }

  // ── 怪物数值预览(图鉴用,纯计算,不创建实体、不碰缓存)。返回 {hp,speed,dmg,xp}
  function previewEnemy(type, state) {
    const def = EN[type]; if (!def) return null;
    const e = makeEnemy(state, type, 0, 0);
    return { hp: Math.round(e.maxHp), speed: Math.round(e.speed), dmg: Math.round(e.dmg || e.boomDmg || e.projDmg || 0), xp: e.xp, def: def };
  }
  function previewBoss(bossType, state) {
    const def = BOSSES[bossType]; if (!def) return null;
    const e = makeBoss(state, bossType, 0, 0);
    return { hp: Math.round(e.maxHp), speed: Math.round(e.speed), dmg: Math.round(e.dmg), xp: e.xp, def: def };
  }

  function makePlayer() {
    return {
      x: 0, y: 0, vx: 0, vy: 0,
      r: C.PLAYER_RADIUS,
      hp: C.PLAYER_BASE_HP, maxHp: C.PLAYER_BASE_HP,
      speed: C.PLAYER_BASE_SPEED,
      facing: 0,
      iframes: 0, flash: 0,
      pickupRadius: C.PICKUP_RADIUS,
      regenAcc: 0, lsWindow: 0,
      bulwarkCd: 0,
      slow: 0, slowF: 0,
      blades: []
    };
  }

  function diffOf(state) { return SV.Config.DIFFICULTY[state.difficulty] || SV.Config.DIFFICULTY.normal; }

  // 无尽模式额外倍率(通关后随超时分钟增长)
  function endlessMulOf(state) {
    if (state.endless && state.stage) return CU.endlessMul(Math.max(0, (state.time - state.stage.goalMin) / 60));
    return 1;
  }

  // 敌人回血速率随时间成长,与 makeEnemy 的 maxHP 同因子(hpFactor × diff × endless)。
  // 用于血祭司光环/自愈者自回血,使其后期相对暴涨的敌血仍保持存在感。
  function healScaleOf(state) { const t = (state.time || 0) / 60; return CU.hpFactor(t) * diffOf(state).hpMul * endlessMulOf(state); }

  function makeEnemy(state, type, x, y) {
    const def = EN[type];
    const t = state.time / 60;
    const diff = diffOf(state);
    const em = endlessMulOf(state);
    const df = CU.dmgFactor(t);
    const hp = def.hp * CU.hpFactor(t) * diff.hpMul * em;
    return {
      id: _id++, type: type, color: def.color, ai: def.ai,
      x: x, y: y, vx: 0, vy: 0,
      r: def.r, mass: def.ai === "tank" ? 6 : (type === "brute" ? 6 : 1),
      hp: hp, maxHp: hp,
      speed: def.speed * CU.speedFactor(t) * ((state.charMods && state.charMods.enemySpeedMul) || 1),
      // 自爆虫:接触不直接造成伤害,只在爆炸时造成 AOE
      dmg: type === "bomber" ? 0 : def.dmg * diff.dmgMul * em * df,
      boomDmg: type === "bomber" ? def.dmg * diff.dmgMul * em * df : 0,
      xp: Math.max(1, Math.round(def.xp * 1.5 * diff.xpMul)), projDmg: (def.projDmg || 0) * diff.dmgMul * df * em, aoe: def.aoe || 0,
      dr: def.dr || 0, regenRate: def.regenRate || 0,
      shape: def.shape || "circle", shimmer: !!def.shimmer,
      auraR: def.auraR || 0, auraDr: def.auraDr || 0, healRate: def.healRate || 0, auraSpeed: def.auraSpeed || 0,
      stealth: !!def.stealth, burstCount: def.burstCount || 0, burstType: def.burstType || "swarmer",
      trailInterval: def.trailInterval || 0, trailDur: def.trailDur || 0, trailDmg: def.trailDmg || 0,
      revealed: false, _shieldedByAura: false, _shieldDr: 0, _speedBuff: 1, _speedBuffT: 0,
      flash: 0, slow: 0, slowF: 0, frozen: 0, bladeCd: 0,
      poison: 0, poisonDmg: 0, poisonTick: 0,
      hex: 0, hexDmg: 0, hexFrac: 0, hexSpread: 0,
      sheep: 0, armorBreak: 0,
      // ai 局部状态
      t1: 0, t2: 0, cstate: "walk", cdir: 0, ct: 0,
      isBoss: false
    };
  }

  function makeBoss(state, bossType, x, y) {
    const def = BOSSES[bossType];
    const t = state.time / 60;
    const diff = diffOf(state);
    const em = endlessMulOf(state);
    const hp = def.hp * (1 + 0.20 * t + 0.006 * t * t) * diff.hpMul * em;
    return Object.assign(makeEnemy(state, "brute", x, y), {
      id: _id++, type: bossType, color: def.color, ai: "boss", shape: def.shape || "circle",
      r: def.r, mass: 40,
      hp: hp, maxHp: hp,
      speed: def.speed, dmg: def.dmg * diff.dmgMul * em * CU.dmgFactor(t), xp: def.xp,
      bossType: bossType, isBoss: true, enrage: false,
      t1: U.rand(1, 3), t2: U.rand(2, 4), ct: 0, cdir: U.rand(0, U.TAU)
    });
  }

  function makeGem(x, y, value) {
    return { x: x, y: y, vx: 0, vy: 0, value: value, pulled: false, bob: U.rand(0, U.TAU) };
  }
  function makePickup(x, y, kind) { return { x: x, y: y, kind: kind, bob: U.rand(0, U.TAU) }; }

  // 受伤(玩家)
  function damagePlayer(state, dmg, ignoreIframe, srcType) {
    const p = state.player;
    if (!ignoreIframe && p.iframes > 0) return;
    const m = mods(state);
    let armorMul = m.armorMul;
    if (state.special === "bulwark") {
      // 站桩/缓行时大幅减伤,全速时回落到正常护甲
      const full = p.speed * m.speedMul;
      const norm = full > 0 ? Math.min(1, Math.hypot(p.vx, p.vy) / full) : 1;
      armorMul *= 1 - (1 - norm) * 0.55;
    }
    const real = dmg * armorMul;
    p.hp -= real;
    // 按敌人类型累计对玩家造成的伤害(图鉴"对玩家伤害"用)。srcType 为来源敌人 type/bossType
    if (srcType && state.enemyDamage) {
      state.enemyDamage[srcType] = (state.enemyDamage[srcType] || 0) + real;
    }
    if (!ignoreIframe) p.iframes = C.IFRAME;
    p.flash = 0.18;
    SV.Audio.hurt();
    SV.Effects.shake(Math.min(9, 3 + dmg * 0.2), 0.25);
    SV.Effects.text(p.x, p.y - p.r - 6, "-" + Math.round(real), SV.Config.COLORS.hp);
    if (p.hp <= 0) { p.hp = 0; SV.Game.onPlayerDeath(); }
  }

  // 角色动态伤害乘子(每击现算,绝不写回 _mods)。服务 assassin(处决)/berserker(血怒)。
  function charDamageScale(state, e) {
    const sp = state.special;
    if (!sp || !e || e.maxHp <= 0) return 1;
    switch (sp) {
      case "assassin":
        // 处决:对生命低于 30% 的敌人伤害 ×2
        if (e.hp / e.maxHp < 0.3) return 2.0;
        return 1;
      case "berserker": {
        // 血怒:自身当前生命越低伤害越高(满血 1.0,空血 2.5)
        const p = state.player;
        if (p && p.maxHp > 0) return 1 + (1 - p.hp / p.maxHp) * 1.5;
        return 1;
      }
      default: return 1;
    }
  }
  // 角色每帧动态逻辑(站桩反击等)。updatePlayer 顶部调用。
  function charTick(state, dt) {
    const sp = state.special;
    if (!sp) return;
    switch (sp) {
      case "bulwark": {
        // 缓行/站桩时每 2.5s 发近身冲击波反击
        const p = state.player; const m = mods(state);
        const full = p.speed * m.speedMul;
        const norm = full > 0 ? Math.min(1, Math.hypot(p.vx, p.vy) / full) : 1;
        p.bulwarkCd -= dt;
        if (norm < 0.25 && p.bulwarkCd <= 0) {
          p.bulwarkCd = 2.5;
          const R = 95;
          const near = SV.Spatial.queryCircle(p.x, p.y, R);
          for (let i = 0; i < near.length; i++) {
            const e = near[i];
            if (e.hp > 0) damageEnemy(state, e, 18 + state.level * 2, { text: false });
          }
          SV.Effects.ring(p.x, p.y, "#aab4ff", 10, R, 0.4, 4);
          SV.Effects.shake(4, 0.2);
        }
        break;
      }
      default: break;
    }
  }

  // 受伤(敌人)。opts:{text,vuln,nocrit}
  function damageEnemy(state, e, dmg, opts) {
    opts = opts || {};
    if (e.stealth && !e.revealed) { // 潜伏者:首击破隐免疫
      e.revealed = true; e.flash = 0.3;
      SV.Effects.hit(e.x, e.y, e.color);
      SV.Effects.text(e.x, e.y - e.r - 4, "破隐!", "#a8e8ff", 14);
      return;
    }
    if (opts.vuln) dmg *= opts.vuln;
    if (e.dr) dmg *= (1 - e.dr); // 盾甲兵等减伤
    if (e._shieldedByAura) dmg *= (1 - (e._shieldDr || 0)); // 光环盾卫护盾
    // 暴击 + 吸血(玩家伤害)
    let real = dmg, isCrit = false;
    const p = state.player;
    if (!opts.nocrit) {
      const m = mods(state);
      if (m.critChance > 0 && U.chance(m.critChance)) { real *= 2; isCrit = true; }
      // 吸血:基于暴击前伤害(dmg),受每秒上限约束
      if (m.lifesteal > 0 && p.hp < p.maxHp) {
        const cap = C.LIFESTEAL_CAP * p.maxHp;
        const allowed = Math.max(0, cap - (p.lsWindow || 0));
        const heal = Math.min(dmg * m.lifesteal, allowed);
        if (heal > 0) {
          p.hp = Math.min(p.maxHp, p.hp + heal);
          p.lsWindow = (p.lsWindow || 0) + heal;
          if (U.chance(0.10)) SV.Effects.text(p.x, p.y - p.r - 6, "+" + Math.round(heal), "#7CFFB2");
        }
      }
    }
    real *= charDamageScale(state, e); // 角色动态伤害(处决/血怒),每击现算
    e.hp -= real;
    // 按武器累计伤害(图鉴/结算"每武器伤害"用)。opts.wid 为来源武器 id,归一到 canonical 桶
    if (opts.wid && state.weaponDamage) {
      const k = tid(opts.wid);
      state.weaponDamage[k] = (state.weaponDamage[k] || 0) + real;
    }
    e.flash = 0.12;
    if (opts.text !== false && (e.isBoss || real >= 8 || U.chance(0.5) || isCrit)) {
      SV.Effects.text(e.x, e.y - e.r - 4, (isCrit ? "暴" : "") + Math.round(real), isCrit ? "#ffd86b" : "#ffe9c2", isCrit ? 18 : 14);
    }
  }

  // 诅咒引爆:对 e 结算 %+maxHp 伤害(可选,引信到期 e 还活着时) + 向周围蔓延 + 视觉;清印记
  function hexDetonate(state, e, damageToo) {
    const dmg = (e.hexDmg || 0) + e.maxHp * (e.hexFrac || 0);
    if (damageToo) {
      damageEnemy(state, e, dmg, { text: false, wid: e.hexWid });
      SV.Effects.text(e.x, e.y - e.r - 4, Math.round(dmg), "#d0a0ff", 14);
    }
    SV.Effects.explosion(e.x, e.y, "#b06bff", 14);
    const spread = e.hexSpread || 0;
    if (spread > 0) {
      const sn = SV.Spatial.queryCircle(e.x, e.y, 110);
      let s = 0;
      for (let j = 0; j < sn.length && s < spread; j++) {
        const o = sn[j];
        if (o !== e && o.hp > 0 && !(o.hex > 0)) { o.hex = 0.8; o.hexDmg = e.hexDmg; o.hexFrac = e.hexFrac; o.hexSpread = 0; o.hexWid = e.hexWid; s++; }
      }
    }
    e.hex = 0; e.hexSpread = 0;
  }

  // 击杀结算
  function killEnemy(state, e) {
    if (e.hex > 0) hexDetonate(state, e, false); // 被提前击杀:诅咒立刻蔓延(不被抢杀浪费)
    SV.Effects.death(e.x, e.y, e.color);
    SV.Audio.die();
    state.kills++;
    // 经验宝石
    if (e.isBoss) {
      // Boss:散落多颗高价值宝石 + 必掉宝箱与血包
      for (let i = 0; i < 8; i++) { const a = U.rand(0, U.TAU), d = U.rand(10, 50); state.gems.push(makeGem(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, Math.max(1, Math.round(e.xp / 8)))); }
      if (!state.endless) state.pickups.push(makePickup(e.x, e.y, "treasure")); // 无尽模式 Boss 不掉宝箱
      state.pickups.push(makePickup(e.x + 30, e.y, "health"));
      SV.Effects.shake(12, 0.5);
      if (e.bossType === "wraith") {
        state.bossFlags.wraithEnrage = true;
        for (let i = 0; i < state.enemies.length; i++) { const o = state.enemies[i]; if (o !== e && o.bossType === "wraith" && o.hp > 0) o.enrage = true; }
      }
      // 镜像双子:击杀其一 → 本体受 25% maxHp 伤害并狂暴(打镜像有风险收益权衡)
      if (e.bossType === "twins") {
        for (let i = 0; i < state.enemies.length; i++) {
          const o = state.enemies[i];
          if (o !== e && o.bossType === "twins" && o.hp > 0) {
            o.enrage = true;
            damageEnemy(state, o, o.maxHp * 0.25, { text: false, nocrit: true });
            SV.Effects.text(o.x, o.y - o.r - 8, "镜像反噬 -25%", "#ff5d73", 16);
          }
        }
      }
      state.bossFlags.count = Math.max(0, (state.bossFlags.count || 0) - 1);
    } else {
      // 精英:散落 3 颗高价值宝石 + 高概率血包/磁铁 + 金色死亡特效
      if (e.elite) {
        for (let i = 0; i < 3; i++) state.gems.push(makeGem(e.x + U.rand(-14, 14), e.y + U.rand(-14, 14), Math.max(1, Math.round(e.xp / 3))));
        if (U.chance(0.30)) state.pickups.push(makePickup(e.x, e.y, "health"));
        if (U.chance(0.15)) state.pickups.push(makePickup(e.x, e.y, "magnet"));
        SV.Effects.explosion(e.x, e.y, SV.Config.COLORS.gold, 22);
      } else {
        state.gems.push(makeGem(e.x, e.y, e.xp));
      }
      // 分裂者:死亡分裂 2 只食脑蛛
      if (e.type === "splitter") {
        for (let i = 0; i < 2; i++) { const a = U.rand(0, U.TAU); addEnemy(state, "swarmer", e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16); }
      }
      // 爆巢者:死亡爆出一群小怪
      if (e.type === "burster" && e.burstCount) {
        for (let i = 0; i < e.burstCount; i++) { const a = U.rand(0, U.TAU); addEnemy(state, e.burstType, e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18); }
        SV.Effects.explosion(e.x, e.y, e.color, 18);
      }
      // 自爆虫:死亡爆炸
      if (e.type === "bomber" && e.aoe) {
        SV.Effects.explosion(e.x, e.y, e.color, 22);
        if (U.dist(e.x, e.y, state.player.x, state.player.y) < e.aoe + state.player.r) damagePlayer(state, e.boomDmg || e.dmg, true, e.bossType || e.type);
        SV.Effects.shake(6, 0.2);
      }
      // 小概率掉落(精英已有高概率掉落,不再 roll 小概率)。概率随时间递减提高难度;难度越高概率越低
      if (!e.elite) {
        const diff = diffOf(state);
        const df = diff.dropMul / (1 + 0.25 * (state.time / 60));
        const r = Math.random();
        if (r < 0.012 * df) state.pickups.push(makePickup(e.x, e.y, "health"));
        else if (r < 0.020 * df) state.pickups.push(makePickup(e.x, e.y, "magnet"));
        else if (r < 0.022 * df) state.pickups.push(makePickup(e.x, e.y, "bomb"));
      }
    }
    if (state.gems.length > C.MAX_GEMS) state.gems.splice(0, state.gems.length - C.MAX_GEMS);
  }

  function addEnemy(state, type, x, y) {
    if (state.enemies.length >= C.MAX_ENEMIES) return null;
    const e = makeEnemy(state, type, x, y);
    state.enemies.push(e);
    if (state.encountered) { if (!(type in state.encountered.enemy)) state.encountered.enemy[type] = state.time; } // 图鉴(本局首次遇敌秒数)
    return e;
  }
  function addBoss(state, bossType, x, y) {
    const e = makeBoss(state, bossType, x, y);
    state.enemies.push(e);
    state.bossFlags.count = (state.bossFlags.count || 0) + 1;
    if (state.encountered) { if (!(bossType in state.encountered.boss)) state.encountered.boss[bossType] = state.time; } // 图鉴(本局)
    return e;
  }
  function addEShot(state, x, y, vx, vy, dmg, color, r, srcType) {
    if (state.eshots.length > 240) state.eshots.shift();
    state.eshots.push({ x: x, y: y, vx: vx, vy: vy, life: 4.0, dmg: dmg, color: color || "#ff7d8e", r: r || 6, srcType: srcType || null });
  }

  // ── 玩家更新
  function updatePlayer(state, dt) {
    const p = state.player;
    charTick(state, dt); // 角色每帧动态(站桩反击等)
    const m = mods(state);
    const ax = SV.Input.axis.x, ay = SV.Input.axis.y;
    const moving = ax || ay;
    if (moving) p.facing = Math.atan2(ay, ax);
    const spd = p.speed * m.speedMul * (p.slow > 0 ? (1 - p.slowF) : 1);
    p.vx = ax * spd; p.vy = ay * spd;
    p.x += p.vx * dt; p.y += p.vy * dt;
    // 虚空引力:周期性把玩家朝随机方向牵引(边界夹取兜底,拉不出墙)
    if (state._voidPull > 0) {
      const env = state.stage && state.stage.envField;
      if (env && env.type === "gravity") {
        state._voidPull -= dt;
        const pa = state._voidPullDir || 0;
        p.x += Math.cos(pa) * env.pull * dt; p.y += Math.sin(pa) * env.pull * dt;
      }
    }
    // 竞技场边界夹取
    const half = (state.stage && state.stage.half) || 2000;
    if (p.x < -half) p.x = -half; else if (p.x > half) p.x = half;
    if (p.y < -half) p.y = -half; else if (p.y > half) p.y = half;

    if (p.iframes > 0) p.iframes -= dt;
    if (p.slow > 0) p.slow -= dt;
    if (p.flash > 0) p.flash -= dt;
    // 吸血每秒上限的预算衰减
    if (p.lsWindow > 0) p.lsWindow = Math.max(0, p.lsWindow - m.maxHp * C.LIFESTEAL_CAP * dt);

    // 再生
    if (m.regen > 0 && p.hp < p.maxHp) {
      p.regenAcc += dt;
      while (p.regenAcc >= 1) { p.regenAcc -= 1; p.hp = Math.min(p.maxHp, p.hp + m.regen); }
    }
    // 同步最大生命
    p.maxHp = m.maxHp;
    p.pickupRadius = C.PICKUP_RADIUS * m.pickupMul;

    // 危险区:地图灼烧/毒径(只伤玩家,带 warm 预警) + 陨石焦土 scorch(只伤敌人,无 warm)
    const hazards = state.hazards;
    if (hazards && hazards.length) {
      // 全局 scorch tick:每 0.5s 同步触发一次,同一敌人在本 tick 内只受一个 scorch 影响(重叠区域不重复算伤害)
      if (state._scorchAccum == null) state._scorchAccum = 0;
      state._scorchAccum += dt;
      let scorchFire = false;
      if (state._scorchAccum >= 0.5) { state._scorchAccum -= 0.5; scorchFire = true; state._scorchTickId = (state._scorchTickId || 0) + 1; }
      for (let i = hazards.length - 1; i >= 0; i--) {
        const h = hazards[i];
        if (h.kind === "scorch") {                       // 陨石焦土:0.5s 灼烧范围内敌人(带 wid 计统计),不伤玩家;重叠去重
          h.life -= dt;
          if (h.life <= 0) { hazards.splice(i, 1); continue; }
          if (scorchFire) {
            const arr = SV.Spatial.queryCircle(h.x, h.y, h.r);
            for (let j = 0; j < arr.length; j++) {
              const en = arr[j];
              if (en.hp > 0 && en._scorchHit !== state._scorchTickId && U.dist2(h.x, h.y, en.x, en.y) < (h.r + en.r) * (h.r + en.r)) {
                en._scorchHit = state._scorchTickId;
                damageEnemy(state, en, h.dmg, { text: false, wid: h.wid });
              }
            }
          }
          continue;
        }
        if (h.warm > 0) { h.warm -= dt; continue; } // 预热期:仅提示位置,不伤害
        h.life -= dt; h.tick -= dt;
        if (h.life <= 0) { hazards.splice(i, 1); continue; }
        const rr = p.r + h.r;
        if (h.tick <= 0 && U.dist2(p.x, p.y, h.x, h.y) < rr * rr) {
          h.tick = 0.5;
          damagePlayer(state, h.dmg, true, h.srcType || null);
        }
      }
    }

    // 宝石磁吸与拾取
    const pr2 = p.pickupRadius * p.pickupRadius;
    const pull = C.GEM_PULL_BASE * Math.max(1, m.pickupMul * 0.6);
    const gems = state.gems;
    const collectR = C.GEM_COLLECT_RADIUS;
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      const dx = p.x - g.x, dy = p.y - g.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < pr2) g.pulled = true;
      if (g.pulled) {
        const d = Math.sqrt(d2) || 1;
        // 保底速度恒快于玩家当前速度 35%+30,杜绝逃跑时经验球卡在拾取圈外死区
        const f = Math.max(spd * 1.35 + 30, Math.min(pull, d * C.GEM_PULL_NEAR_K));
        g.x += dx / d * f * dt; g.y += dy / d * f * dt;
      }
      if (d2 < collectR * collectR) {
        state.xp += g.value * m.xpMul;
        gems.splice(i, 1);
        SV.Audio.pickup();
        SV.Game.onXP();
        if (state.special === "collector") {
          // 拾取共鸣:在拾取位引发小范围伤害爆发(范围受范围属性影响、伤害受攻击属性影响)
          const R = 60 * m.areaMul;
          const near = SV.Spatial.queryCircle(g.x, g.y, R);
          for (let k = 0; k < near.length; k++) {
            const en = near[k];
            if (en.hp > 0) damageEnemy(state, en, (8 + state.level) * m.damageMul, { text: false });
          }
          SV.Effects.ring(g.x, g.y, "#ffd86b", 4, R, 0.3, 3);
        }
      }
    }
    // 掉落物拾取
    const picks = state.pickups;
    for (let i = picks.length - 1; i >= 0; i--) {
      const pk = picks[i];
      if (U.dist(p.x, p.y, pk.x, pk.y) < p.r + 12) {
        applyPickup(state, pk.kind);
        picks.splice(i, 1);
        SV.Audio.pickup();
      }
    }
  }

  function applyPickup(state, kind) {
    const p = state.player;
    const m = mods(state);
    if (kind === "health") { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); SV.Effects.text(p.x, p.y - 20, "+治疗", "#7CFFB2"); }
    else if (kind === "magnet") { for (let i = 0; i < state.gems.length; i++) state.gems[i].pulled = true; SV.Effects.text(p.x, p.y - 20, "磁吸!", SV.Config.COLORS.gold); }
    else if (kind === "treasure") { state.xp += 25 * (1 + state.level * 0.5) * m.xpMul; SV.Game.onXP(); SV.Effects.text(p.x, p.y - 20, "宝箱!", SV.Config.COLORS.gold); }
    else if (kind === "bomb") {
      SV.Effects.shake(10, 0.4);
      for (let i = 0; i < state.enemies.length; i++) { const e = state.enemies[i]; if (!e.isBoss) { damageEnemy(state, e, e.maxHp, { text: false }); } }
      SV.Effects.text(p.x, p.y - 20, "清场!", "#ff5d73");
    }
  }

  // ── 敌人更新(最热路径)。空间网格由 game.step 每帧先调用 rebuildGrid 构建,此处仅查询。
  function rebuildGrid(state) {
    const Sp = SV.Spatial;
    Sp.clear();
    const enemies = state.enemies;
    for (let i = 0; i < enemies.length; i++) Sp.insert(enemies[i]);
  }

  // 光环(护盾/回血/加速)节流施加:每 0.3s,先清护盾标记再让光环敌人 queryCircle 给邻居施 buff。
  // speed buff 用 0.4s 衰减窗覆盖 0.3s 重算间隙,无抖动。
  function tickAuras(state, dt) {
    state._auraTick = (state._auraTick || 0) - dt;
    if (state._auraTick > 0) return;
    state._auraTick = 0.3;
    const Sp = SV.Spatial, enemies = state.enemies;
    const healScale = healScaleOf(state); // 血祭司回血随时间成长(同敌人 maxHP 因子)
    for (let i = 0; i < enemies.length; i++) enemies[i]._shieldedByAura = false;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hp <= 0) continue;
      if (!(e.auraDr || e.healRate || e.auraSpeed)) continue;
      const q = Sp.queryCircle(e.x, e.y, e.auraR);
      for (let j = 0; j < q.length; j++) {
        const o = q[j];
        if (o === e || o.hp <= 0) continue;
        if (e.auraDr) { o._shieldedByAura = true; o._shieldDr = e.auraDr; }
        if (e.healRate) o.hp = Math.min(o.maxHp, o.hp + e.healRate * healScale * 0.3);
        if (e.auraSpeed) { o._speedBuff = e.auraSpeed; o._speedBuffT = 0.4; }
      }
    }
  }

  function updateEnemies(state, dt) {
    const Sp = SV.Spatial;
    const AI = SV.AI;
    const enemies = state.enemies;
    const p = state.player;
    tickAuras(state, dt); // 光环(护盾/回血/加速)节流施加

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.flash > 0) e.flash -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (e.frozen > 0) e.frozen -= dt;
      if (e.sheep > 0) e.sheep -= dt;
      if (e.armorBreak > 0) e.armorBreak -= dt;
      if (e.bladeCd > 0) e.bladeCd -= dt;

      // 剧毒 DoT(毒尽则叠层清零)
      if (e.poison > 0) {
        e.poison -= dt; e.poisonTick -= dt;
        if (e.poisonTick <= 0) { e.poisonTick = 0.5; damageEnemy(state, e, e.poisonDmg, { text: false, wid: e.poisonWid }); }
      } else if (e.poisonStacks) {
        e.poisonStacks = 0;
      }

      // 诅咒:倒计时引爆 %+maxHp + 向周围蔓延(对群友好)
      if (e.hex > 0) {
        e.hex -= dt;
        if (e.hex <= 0) hexDetonate(state, e, true);
      }

      // AI 写入 e.vx/e.vy(满速)
      AI.update(state, e, dt);

      // 积分(受减速/冰冻影响)
      let k = 1;
      if (e.frozen > 0) k = 0;
      else if (e.slow > 0) k = 1 - e.slowF;
      if (e._speedBuffT > 0) e._speedBuffT -= dt; else e._speedBuff = 1;
      const sb = e._speedBuff || 1;
      e.x += e.vx * k * sb * dt;
      e.y += e.vy * k * sb * dt;
    }

    // 玩家接触判定
    if (p.iframes <= 0) {
      const near = Sp.queryCircle(p.x, p.y, p.r + 44);
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dmg <= 0 || e.frozen > 0 || e.sheep > 0) continue;
        const rr = p.r + e.r;
        if (U.dist2(p.x, p.y, e.x, e.y) < rr * rr) {
          damagePlayer(state, e.dmg, false, e.bossType || e.type);
          // 击退敌人
          const a = U.angleTo(p.x, p.y, e.x, e.y);
          const kb = 90 / e.mass;
          e.x += Math.cos(a) * kb; e.y += Math.sin(a) * kb;
          if (p.iframes > 0) break;
        }
      }
    }

    // 敌方投射物
    const es = state.eshots;
    for (let i = es.length - 1; i >= 0; i--) {
      const s = es[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      const rr = s.r + p.r;
        if (U.dist2(s.x, s.y, p.x, p.y) < rr * rr) { damagePlayer(state, s.dmg, true, s.srcType || null); es.splice(i, 1); continue; }
      if (s.life <= 0) es.splice(i, 1);
    }

    // 压缩 + 死亡结算 + 远距清理(竞技场外安全网)
    const bound = ((state.stage && state.stage.half) || 2000) + 500;
    const bound2 = bound * bound;
    let w = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hp > 0 && U.dist2(e.x, e.y, p.x, p.y) < bound2) {
        if (w !== i) enemies[w] = e;
        w++;
      } else {
        if (e.hp <= 0) killEnemy(state, e);
      }
    }
    enemies.length = w;
  }

  // 关卡环境机制(灼烧/冰冻/引力),周期触发,随时间增强。game.step 在 updateEnemies 后调用。
  function envTick(state, dt) {
    const env = state.stage && state.stage.envField;
    if (!env) return;
    state.envTimer -= dt;
    if (state.envTimer > 0) return;
    state.envTimer = env.interval;
    const p = state.player;
    const half = (state.stage && state.stage.half) || 2000;
    const t = state.time / 60;
    if (env.type === "burn") {
      // 灼烧区数量随时间增多(每 3min +1),上限由 MAX_HAZARDS 兜底
      const nz = Math.min(C.MAX_HAZARDS - state.hazards.length, 1 + Math.floor(t / 3));
      const burnDmg = env.dps * 0.5 * CU.dmgFactor(t);
      const mkBurn = (hx, hy) => state.hazards.push({ x: hx, y: hy, r: env.r, dmg: burnDmg, life: env.dur, max: env.dur, color: "#ff7a3c", kind: "burn", tick: 0.5, warm: env.warm || 0 });
      // 先放 min(nz,4) 个等角不重叠(1.45r 半径 → 两两 ≥2r,封住四向走位);再放剩余的随机(制造重叠高伤点)。
      const baseN = Math.min(nz, 4);
      if (baseN > 0) {
        const baseAng = U.rand(0, U.TAU), step = U.TAU / baseN, baseD = env.r * 1.45; // 随机起始角提供朝向变化;无抖动保证两两 ≥2r
        for (let z = 0; z < baseN; z++) {
          const a = baseAng + z * step;
          mkBurn(U.clamp(p.x + Math.cos(a) * baseD, -half, half), U.clamp(p.y + Math.sin(a) * baseD, -half, half));
        }
      }
      for (let z = baseN; z < nz; z++) { // 剩余(仅 nz>4 时)随机布点,允许与基准/彼此重叠
        const a = U.rand(0, U.TAU), d = U.rand(40, 150);
        mkBurn(U.clamp(p.x + Math.cos(a) * d, -half, half), U.clamp(p.y + Math.sin(a) * d, -half, half));
      }
      if (nz > 0) SV.HUD.toast("⚠ 灼烧区域!");
    } else if (env.type === "freeze") {
      // 减速时长随时间增长,上限为触发间隔的 1/3(避免无限冰冻)
      p.slow = Math.min(env.interval / 3, env.dur * (1 + 0.5 * t)); p.slowF = env.slowF;
      SV.HUD.toast("❄ 冰冻冲击!");
      SV.Effects.ring(p.x, p.y, "#a8f0ff", 10, 120, 0.4, 3);
    } else if (env.type === "gravity") {
      // 随机方向牵引,时长随时间增长,上限为触发间隔的 1/3
      state._voidPullDir = U.rand(0, U.TAU);
      state._voidPull = Math.min(env.interval / 3, env.dur * (1 + 0.5 * t));
      SV.HUD.toast("⛓ 引力牵引!");
    }
  }

  SV.Entities = {
    mods: mods,
    envTick: envTick,
    tickAuras: tickAuras,
    invalidateMods: invalidateMods,
    capDim: capDim,
    rootDim: rootDim,
    tid: tid,
    healScale: healScaleOf,
    previewEnemy: previewEnemy,
    previewBoss: previewBoss,
    makePlayer: makePlayer,
    makeEnemy: makeEnemy,
    makeBoss: makeBoss,
    makeGem: makeGem,
    makePickup: makePickup,
    addEnemy: addEnemy,
    addBoss: addBoss,
    addEShot: addEShot,
    damagePlayer: damagePlayer,
    damageEnemy: damageEnemy,
    killEnemy: killEnemy,
    rebuildGrid: rebuildGrid,
    updatePlayer: updatePlayer,
    updateEnemies: updateEnemies
  };
})();
