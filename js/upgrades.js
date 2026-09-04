// upgrades.js — SV.Upgrades: 升级三选一(稀有度加权,优先出进化)
(function () {
  "use strict";
  const SV = window.SV;
  const U = SV.Util;
  const C = SV.Config.CONST;
  const CFG = SV.Config;

  function ownedSet(state) {
    const s = {};
    for (let i = 0; i < state.weapons.length; i++) s[state.weapons[i].id] = true;
    return s;
  }

  // 计算某武器「从 from 升到 from+1」的具体收益文案(走 Weapons.stats,溢出递减期显示真实收益)
  function levelText(state, w) {
    const def = CFG.weaponDef(w.id);
    const from = w.level;
    const mk = function (lv) { return SV.Weapons.stats({ id: w.id, level: lv, cd: 0, angle: 0, evolved: !!w.evolved }, state); };
    const a = mk(from), b = mk(from + 1);
    const CL = CFG.STAT_LABEL, CN = CFG.COUNT_NOUN;
    const noun = CN[w.id] || CN[w.id.replace(/_evo$/, "")] || "数量";
    const parts = []; let milestone = false;
    for (const k in b) {
      const av = a[k], bv = b[k];
      if (av === bv || typeof bv !== "number") continue;
      const d = bv - av;
      if (k === "count") { parts.push(noun + " +" + d); milestone = true; continue; }
      const tpl = CL[k];
      if (!tpl) continue;
      let n;
      if (k === "slow") n = Math.round(d * 100);
      else if (k === "cooldown" || k === "tick" || k === "fireCd") n = Math.round(-d * 100) / 100;
      else n = Math.abs(d) < 10 ? Math.round(d * 10) / 10 : Math.round(d); // 溢出递减期显示一位小数
      if (tpl.indexOf("{N}") >= 0 && n === 0) continue; // 跳过四舍五入为 0 的噪声字段
      parts.push(tpl.replace("{N}", n));
      if (k === "chains" || k === "tick" || k === "fireCd" || k === "beams") milestone = true;
    }
    if (!parts.length) {
      const dd = (b.damage || 0) - (a.damage || 0);
      if (Math.abs(dd) >= 0.05) parts.push("伤害 +" + (Math.abs(dd) < 1 ? Math.round(dd * 10) / 10 : Math.round(dd)));
    }
    return { text: parts.join(" · "), milestone: milestone };
  }

  // 多伤害来源武器的补充说明(暂停面板用):把每种伤害成分的数值分别说清楚
  function extraSummary(id, s) {
    const R = Math.round;
    const out = [];
    switch (id) {
      case "meteor_evo": case "meteor_chain":
        if (s.burn) out.push("焦土 " + R(s.burn) + "/0.5s×" + (Math.round(s.burnDur * 10) / 10) + "s");
        if (id === "meteor_chain") out.push("落地连锁×" + (s.chainHops || 0));
        break;
      case "lance":
        out.push("一次触碰受创一次");
        break;
      case "lance_evo":
        out.push("线上每0.1s受创(多次伤害)");
        break;
      case "lance_vortex":
        out.push("卷伤 " + R(s.damage) + "/0.2s · 环绕激光 " + R(s.beamDmg || 0) + "/" + (Math.round((s.beamTick || 0.1) * 10) / 10) + "s");
        break;
      case "spear_evo":
        if (s.armorBreak) out.push("破甲 " + (Math.round(s.armorBreak * 10) / 10) + "s(受伤+50%,命中刷新)");
        break;
      case "missile_chain":
        out.push("命中闪电 " + R(s.damage * 0.6) + "/跳×" + (s.chainHops || 3));
        out.push("击杀追击 " + (s.chase || 0) + " 次");
        break;
      case "frost_poison":
        if (s.freeze) out.push("冻结 " + (Math.round(s.freeze * 10) / 10) + "s(受伤+50%)");
        if (s.dot) out.push("命中上毒 " + R(s.dot) + "/0.5s×" + (Math.round(s.dotDur * 10) / 10) + "s");
        break;
      case "shotgun_grenade":
        if (s.splash) out.push("每颗命中溅射 " + R(s.damage * s.splashMul) + "(半径" + R(s.splash) + ")");
        break;
      case "grenade_evo":
        out.push("子爆 " + R(s.damage * 0.55) + "×" + (typeof s.cluster === "number" ? s.cluster : 2));
        break;
      case "railgun_evo": case "railgun_grenade":
        if (s.explode) out.push("贯穿爆 " + R(s.damage) + "·半径" + R(s.explode));
        if (id === "railgun_grenade") out.push("每次贯穿触发 · 首次分裂" + (s.cluster || 0) + "颗");
        break;
      case "detonate": case "detonate_evo": case "crescent_detonate":
        if (s.explodeDmg) out.push("命中殉爆 " + R(s.explodeDmg) + "(半径" + R(s.explodeR) + ",概率" + Math.round((s.explodeChance || 0) * 100) + "%)" + (s.chainHops ? " · 连爆" + s.chainHops + "跳" : ""));
        break;
      case "shockwave_frost":
        if (s.freeze) out.push("冻结 " + (Math.round(s.freeze * 10) / 10) + "s");
        if (s.shatter) out.push("再次命中碎裂50%伤害(半径" + R(s.shatter) + ")");
        break;
      case "timestop_evo":
        if (s.shatter) out.push("碎裂 " + R(s.damage * 0.5));
        if (s.freeze) out.push("落地冻结 " + (Math.round(s.freeze * 10) / 10) + "s");
        break;
      case "blade_aura":
        if (s.splash) out.push("溅射 " + R(s.damage * s.splashMul));
        if (s.pull) out.push("吸力 " + R(s.pull));
        out.push("刃触0.25s · 圈伤0.4s");
        break;
      case "crescent_evo":
        if (s.leaveTrail) out.push("弧灼 " + R(s.damage * 0.25) + "/0.5s");
        break;
      case "chain_evo":
        out.push("每跳伤害 ×1.1");
        break;
      case "hex_poison":
        out.push("毒 " + R(s.dot) + "/0.5s×" + (Math.round(s.dotDur * 10) / 10) + "s");
        out.push("每跳缩短引信 " + s.fuseCut + "s");
        out.push("引爆传播诅咒+毒");
        if (s.frac) out.push("引爆 +" + Math.round(s.frac * 100) + "%maxHp(Boss÷3)");
        break;
      case "hex": case "hex_evo":
        if (s.frac) out.push("引爆 +" + Math.round(s.frac * 100) + "%maxHp(Boss÷3)");
        if (s.delay) out.push("引信 " + (Math.round(s.delay * 10) / 10) + "s · 引爆传播最多" + (s.spread || 0) + "个");
        break;
      case "missile_evo": out.push("击杀后继续追击(伤害×0.85)"); break;
      case "boomerang_evo": out.push("去返贯穿"); break;
      case "shotgun_evo": case "polymorph_evo": out.push("每弹穿透 " + (s.pierce || 0) + " 次"); break;
      case "sentry_evo": out.push("炮弹穿透 " + (s.pierce || 0) + " 次"); break;
      case "frost_evo": out.push("冻结 " + (Math.round(s.freeze * 10) / 10) + "s(受伤+50%)"); break;
      case "poison_evo": out.push("持续 " + (Math.round(s.dotDur * 10) / 10) + "s · 传染并减速" + Math.round(s.slow * 100) + "%/" + (Math.round(s.slowDur * 10) / 10) + "s"); break;
      case "vortex_evo": out.push("卷伤每0.2s×" + (Math.round(s.life * 10) / 10) + "s · 吸力" + R(s.pull)); break;
      case "shockwave_evo": out.push("命中冻结 " + (Math.round(s.freeze * 10) / 10) + "s"); break;
      case "boomerang_sentry": out.push("每塔" + (Math.round(s.fireCd * 100) / 100) + "s发射 · 去返穿透" + (s.pierce || 0) + "次"); break;
      case "blade_evo": out.push("每敌命中间隔0.25s"); break;
    }
    return out;
  }

  // 武器当前生效数值摘要(暂停面板用)
  function summary(w, state) {
    const def = CFG.weaponDef(w.id);
    const s = SV.Weapons.stats(w, state);
    const F = function (v, n) { const m = Math.pow(10, n == null ? 2 : n); return Math.round(v * m) / m; };
    // 复合机制用固定结构把触发关系说完整;所有数字仍来自 Weapons.stats()。
    if (w.id === "spear_evo") return "CD " + F(s.cooldown) + "s · 破甲" + F(s.armorBreak, 1) + "s(受伤+50%,命中刷新)";
    if (w.id === "spear_lance") return "贯刺" + F(s.damage) + " · CD" + F(s.cooldown) + "s · 破甲" + F(s.armorBreak, 1) + "s(+50%) · 光栅" + F(s.gridDmg) + "/" + F(s.gridTick, 1) + "s×" + F(s.gridLife, 1) + "s · 长" + F(s.gridLen) + " · 最多" + s.gridMax + "条";
    if (w.id === "polymorph_timestop") return s.count + "变形弹 · 变羊" + F(s.dur, 1) + "s · 结束/死亡爆炸" + F(s.bombDmg) + "(半径" + F(s.bombRadius) + ") · 冻结" + F(s.freeze, 1) + "s";
    if (w.id === "shockwave_frost") return "冻结" + F(s.freeze, 1) + "s · 再次命中碎裂50%伤害(半径" + F(s.shatter) + ")";
    if (w.id === "hex_poison") return extraSummary(w.id, s).join(" · ");
    const CN = CFG.COUNT_NOUN;
    const noun = CN[w.id] || CN[w.id.replace(/_evo$/, "")] || "";
    const p = [];
    if (s.count != null && noun) p.push(s.count + " " + noun);
    if (s.damage != null) p.push(Math.round(s.damage) + " 伤害");
    if (s.cooldown != null) p.push("CD " + (Math.round(s.cooldown * 100) / 100) + "s");
    if (s.radius != null) p.push("半径 " + Math.round(s.radius));
    if (s.vrad != null) p.push("卷半径 " + Math.round(s.vrad));
    if (s.length != null) p.push("长 " + Math.round(s.length));
    if (s.beams != null) p.push(s.beams + " 光束");
    if (s.chains != null) p.push("连跳 " + (s.chains >= 99 ? "∞" : s.chains));
    if (s.chase != null) p.push("追击 " + (s.chase >= 99 ? "∞" : s.chase));
    if (s.dot != null) p.push("毒 " + Math.round(s.dot) + "/跳");
    if (s.fireCd != null) p.push("射速 " + (Math.round(s.fireCd * 100) / 100) + "s");
    if (s.tick != null) p.push("每 " + (Math.round(s.tick * 100) / 100) + "s");
    if (s.slow != null) p.push("减速 " + Math.round(s.slow * 100) + "%");
    if (s.dur != null) p.push("变形 " + (Math.round(s.dur * 10) / 10) + "s");
    const ex = extraSummary(w.id, s);
    for (let i = 0; i < ex.length; i++) p.push(ex[i]);
    return p.join(" · ") || def.desc;
  }

  // 各被动在 Entities.mods() 中的曲线参数(与 entities.js 保持一致),用于计算"下一级真实增量"。
  // 收益递减(rootDim/capDim)后,实际增量小于首级——升级卡需展示真实增量而非首级文案。
  const PASSIVE_CURVE = {
    maxhp:     { kind: "root", per: 24,    mul: "hp", fmt: function (d) { return "最大生命 +" + Math.round(d); } },
    speed:     { kind: "root", per: 0.09,  fmt: function (d) { return "移速 +" + Math.round(d * 100) + "%"; } },
    damage:    { kind: "root", per: 0.11,  fmt: function (d) { return "伤害 +" + Math.round(d * 100) + "%"; } },
    cooldown:  { kind: "cap", cap: 0.70, v1: 0.075, fmt: function (d) { return "冷却 -" + Math.round(d * 100) + "%"; } },
    area:      { kind: "root", per: 0.11,  fmt: function (d) { return "范围 +" + Math.round(d * 100) + "%"; } },
    armor:     { kind: "cap", cap: 0.60, v1: 0.095, fmt: function (d) { return "减伤 -" + Math.round(d * 100) + "%"; } },
    regen:     { kind: "root", per: 2,     fmt: function (d) { return "再生 +" + (Math.round(d * 10) / 10) + "/s"; } },
    luck:      { kind: "root", per: 0.17,  fmt: function (d) { return "幸运 +" + Math.round(d * 100) + "%"; } },
    crit:      { kind: "cap", cap: 1.0, v1: 0.09, fmt: function (d) { return "暴击 +" + Math.round(d * 100) + "%"; } },
    lifesteal: { kind: "cap", cap: 0.10, v1: 0.01, fmt: function (d) { return "吸血 +" + Math.round(d * 100) + "%"; } }
  };
  // 计算某被动「从当前级升到下一级」的真实增量文案(无递减则退回静态文案)
  function passiveLevelText(state, id) {
    const E = SV.Entities;
    const curve = PASSIVE_CURVE[id];
    if (!curve) return null;
    const lvl = state.passives[id] || 0;
    let txt;
    if (curve.kind === "root") {
      let d = E.rootDim(lvl + 1, curve.per) - E.rootDim(lvl, curve.per);
      if (curve.mul === "hp") d *= ((state.charMul && state.charMul.hpMul) || 1);
      txt = curve.fmt(d);
    } else if (curve.kind === "cap") {
      const d = E.capDim(lvl + 1, curve.cap, curve.v1) - E.capDim(lvl, curve.cap, curve.v1);
      txt = curve.fmt(d);
    } else {
      txt = null;
    }
    return txt;
  }
  // magnet 同时影响拾取范围与经验,单独处理
  function magnetLevelText(state, id) {
    if (id !== "magnet") return null;
    const E = SV.Entities;
    const lvl = state.passives[id] || 0;
    const dp = (E.rootDim(lvl + 1, 0.45) - E.rootDim(lvl, 0.45)) * 100;
    const dx = (E.rootDim(lvl + 1, 0.09) - E.rootDim(lvl, 0.09)) * 100;
    return "拾取 +" + Math.round(dp) + "% · 经验 +" + Math.round(dx) + "%";
  }

  function canEvolve(state, baseId) {
    const evo = CFG.EVOLUTIONS[baseId];
    if (!evo) return false;
    for (let i = 0; i < state.weapons.length; i++) {
      const w = state.weapons[i];
      if (w.id === baseId && w.level >= C.WEAPON_MAX && (state.passives[evo.reqPassive] || 0) >= C.PASSIVE_MAX) return true;
    }
    return false;
  }

  // 协同进化:两把武器均已进化
  function canFuse(state, combo) {
    let a = false, b = false;
    for (let i = 0; i < state.weapons.length; i++) {
      const w = state.weapons[i];
      if (w.id === combo.w1 && w.evolved) a = true;
      if (w.id === combo.w2 && w.evolved) b = true;
    }
    return a && b;
  }

  // 协同提示:某武器的进化体与已拥有武器(基底或进化,未进化也算)存在融合组合 → 提示文案
  function synergyOf(state, baseId) {
    const evoId = baseId + "_evo";
    for (let i = 0; i < CFG.FUSIONS.length; i++) {
      const fu = CFG.FUSIONS[i];
      let other = null;
      if (fu.w1 === evoId) other = fu.w2;
      else if (fu.w2 === evoId) other = fu.w1;
      else continue;
      const otherBase = other.replace(/_evo$/, "");
      for (let j = 0; j < state.weapons.length; j++) {
        const w = state.weapons[j];
        if (w.id === other || w.id === otherBase) return "⚭ 可合成「" + fu.name + "」";
      }
    }
    return null;
  }
  // 进化卡提示:组合另一方已进化 → 进化后即可合成
  function evolveSynergy(state, baseId) {
    const evoId = baseId + "_evo";
    for (let i = 0; i < CFG.FUSIONS.length; i++) {
      const fu = CFG.FUSIONS[i];
      let other = null;
      if (fu.w1 === evoId) other = fu.w2;
      else if (fu.w2 === evoId) other = fu.w1;
      else continue;
      for (let j = 0; j < state.weapons.length; j++) {
        if (state.weapons[j].id === other && state.weapons[j].evolved) return "⚭ 进化后可合成「" + fu.name + "」";
      }
    }
    return null;
  }

  // 构建候选池 [{c, weight}]
  // 角色武器政策(硬禁):arcanist 只能用元素、ranger 禁近战。无 policy 或武器无 tags 时放行。
  function weaponAllowed(state, def) {
    const ch = CFG.CHARACTERS[state.charId];
    const pol = ch && ch.weaponPolicy;
    if (!pol || !def.tags) return true;
    if (pol.require) for (let i = 0; i < pol.require.length; i++) if (def.tags.indexOf(pol.require[i]) < 0) return false;
    if (pol.forbid) for (let i = 0; i < pol.forbid.length; i++) if (def.tags.indexOf(pol.forbid[i]) >= 0) return false;
    return true;
  }
  // 角色被动禁用(派生自 charMods 清零项):berserker 的 regenMul/lifestealMul=0 ⇒ 不发"再生""吸血"卡(选了无用)。
  // 零新配置,自动与 charMods 同步;刺客(lifestealMul=0)同理。
  function passiveAllowed(state, id) {
    const cmod = state.charMods || {};
    return cmod[id + "Mul"] !== 0; // undefined !== 0 为 true ⇒ 无对应清零项则放行
  }
  // 武器特性标签:按 tags 返回裸标签(近战/远程/元素/远程·元素),供卡片 badge 与暂停行展示
  function traitLabel(id) {
    const def = CFG.weaponDef(id);
    const t = def && def.tags;
    if (!t || !t.length) return "";
    const map = { melee: "近战", ranged: "远程", spell: "法术" };
    const parts = [];
    for (let i = 0; i < t.length; i++) if (map[t[i]]) parts.push(map[t[i]]);
    return parts.join("·");
  }
  function buildPool(state) {
    const pool = [];
    const owned = ownedSet(state);
    const luck = SV.Entities.mods(state).luck;

    // 1) 协同进化(最高优先):两把已进化武器合成
    for (let i = 0; i < CFG.FUSIONS.length; i++) {
      const fu = CFG.FUSIONS[i];
      if (canFuse(state, fu) && weaponAllowed(state, CFG.weaponDef(fu.to))) {
        pool.push({ c: { kind: "fuse", id: fu.to, combo: fu, name: fu.name + " ⚭", desc: fu.desc, trait: traitLabel(fu.to), icon: fu.icon, color: fu.color, rarity: "legend" }, weight: 300 });
      }
    }
    // 2) 进化
    for (const baseId in CFG.EVOLUTIONS) {
      if (canEvolve(state, baseId) && weaponAllowed(state, CFG.weaponDef(CFG.EVOLUTIONS[baseId].to))) {
        const evo = CFG.EVOLUTIONS[baseId];
        const syn = evolveSynergy(state, baseId);
        pool.push({ c: { kind: "evolve", id: baseId, name: evo.name, desc: evo.desc, trait: traitLabel(evo.to), icon: evo.icon, color: evo.color, rarity: "legend", synergy: syn }, weight: 200 });
      }
    }
    // 3) 已有武器升级(显示该级具体收益)
    for (let i = 0; i < state.weapons.length; i++) {
      const w = state.weapons[i];
      const def = CFG.weaponDef(w.id);
      if (w.level < def.max) {
        const lt = levelText(state, w);
        if (!lt.text) continue; // 融合武器/满级武器无收益卡
        const rar = lt.milestone ? (w.level >= 5 ? "epic" : "rare") : (w.level >= 6 ? "rare" : "common");
        pool.push({ c: { kind: "weapon", id: w.id, name: def.name + " Lv" + (w.level + 1) + (lt.milestone ? " ✦" : ""), desc: lt.text, trait: traitLabel(w.id), icon: def.icon, color: def.color, rarity: rar }, weight: Math.max(2, 26 - w.level) });
      }
    }
    // 3) 新武器(只发从未获得过的——融合/进化移除的成分武器不再重发)
    if (state.weapons.length < C.MAX_WEAPONS) {
      const ever = state.everOwned || {};
      for (const id in CFG.WEAPONS) {
        if (owned[id] || ever[id]) continue;
        const def = CFG.WEAPONS[id];
        if (!weaponAllowed(state, def)) continue;
        const syn = synergyOf(state, id);
        pool.push({ c: { kind: "newweapon", id: id, name: def.name + " (新)", desc: def.desc, trait: traitLabel(id), icon: def.icon, color: def.color, rarity: "epic", synergy: syn }, weight: 12 + luck * 30 });
      }
    }
    // 4) 被动升级(超设计满级后为递减的溢出强化)
    for (const id in CFG.PASSIVES) {
      if (!passiveAllowed(state, id)) continue; // 角色禁用项(如 berserker 的 regen/lifesteal)不出卡
      const lvl = state.passives[id] || 0;
      if (lvl < C.PASSIVE_MAX_LEVEL) {
        const def = CFG.PASSIVES[id];
        const inc = passiveLevelText(state, id) || magnetLevelText(state, id);
        pool.push({ c: { kind: "passive", id: id, name: def.name + " Lv" + (lvl + 1), desc: inc ? ("本次:" + inc + (lvl >= 1 ? "(递减中)" : "")) : (def.desc + " (" + def.per + ")"), icon: def.icon, color: def.color, rarity: lvl >= 3 ? "rare" : "common" }, weight: Math.max(2, 22 - lvl) });
      }
    }
    return pool;
  }

  function rollChoices(state) {
    let pool = buildPool(state);
    const out = [];
    const take = Math.min(3, pool.length);
    for (let n = 0; n < take; n++) {
      if (!pool.length) break;
      const pick = U.weighted(pool);
      out.push(pick.c);
      // 从池中移除该项(按引用)
      for (let i = 0; i < pool.length; i++) { if (pool[i].c === pick.c) { pool.splice(i, 1); break; } }
    }
    return out;
  }

  function apply(state, choice) {
    SV.Entities.invalidateMods(state); // 被动/武器变化 → 失效 mods 缓存
    if (choice.kind === "fuse") { SV.Weapons.fuse(state, choice.combo); return; }
    if (choice.kind === "evolve") { SV.Weapons.evolve(state, choice.id); return; }
    if (choice.kind === "weapon") {
      for (let i = 0; i < state.weapons.length; i++) {
        if (state.weapons[i].id === choice.id) { state.weapons[i].level = Math.min(C.WEAPON_MAX, state.weapons[i].level + 1); return; }
      }
    }
    if (choice.kind === "newweapon") {
      state.weapons.push({ id: choice.id, level: 1, cd: 0, angle: 0, evolved: false });
      state.everOwned = state.everOwned || {};
      state.everOwned[choice.id] = true; // 记录历史:融合/进化移除后不再当新武器重发
      return;
    }
    if (choice.kind === "passive") {
      const cur = state.passives[choice.id] || 0;
      state.passives[choice.id] = Math.min(C.PASSIVE_MAX_LEVEL, cur + 1);
      if (choice.id === "maxhp") {
        // 按实际 maxHp 增量同步回血(适配任意 per 值)
        const before = state.player.maxHp;
        const newMax = SV.Entities.mods(state).maxHp; // 函数顶部已 invalidateMods
        state.player.hp = Math.min(newMax, state.player.hp + (newMax - before));
      }
      return;
    }
  }

  SV.Upgrades = { buildPool: buildPool, weaponAllowed: weaponAllowed, passiveAllowed: passiveAllowed, rollChoices: rollChoices, apply: apply, canEvolve: canEvolve, levelText: levelText, summary: summary, passiveLevelText: passiveLevelText, traitLabel: traitLabel };
})();
