// waves.js — SV.Waves: 刷怪导演。按时间曲线刷怪、定时集群波、分钟点 Boss。
(function () {
  "use strict";
  const SV = window.SV;
  const U = SV.Util;
  const C = SV.Config.CONST;
  function L(en, zh) { return SV.I18n ? SV.I18n.pick(en, zh) : zh; }
  const CFG = SV.Config;
  const CU = CFG.CURVES;

  function ringRadius() {
    const size = SV.Renderer.cssSize();
    const zoom = SV.Renderer.cam.zoom || 1;
    return Math.max(size.w, size.h) / zoom / 2 + C.SPAWN_RING_PAD;
  }

  // 在玩家屏外环形生成,但夹取到竞技场边界内
  function spawnPos(state) {
    const p = state.player;
    const R = ringRadius();
    const a = U.rand(0, U.TAU);
    const half = (state.stage && state.stage.half) || 2000;
    const m = half - 20;
    return {
      x: U.clamp(p.x + Math.cos(a) * R, -m, m),
      y: U.clamp(p.y + Math.sin(a) * R, -m, m)
    };
  }
  // 精英 roll:8min 起概率登场,×4 血 / ×1.5 伤 / 大一圈 / ×3 经验
  function maybeElite(state, e) {
    const t = state.time / 60;
    if (t < 8) return;
    const chance = Math.min(0.25, 0.08 + 0.02 * (t - 8));
    if (Math.random() >= chance) return;
    e.elite = true;
    e.hp *= 4; e.maxHp *= 4;
    e.dmg *= 1.5; e.boomDmg *= 1.5; e.projDmg *= 1.5; e.trailDmg *= 1.5;
    e.r *= 1.4;
    e.speed *= 1.05;
    e.xp *= 3;
  }
  function spawnAtRing(state, type) {
    const pos = spawnPos(state);
    const e = SV.Entities.addEnemy(state, type, pos.x, pos.y);
    if (e) maybeElite(state, e);
    return e;
  }

  function pickType(state, t) {
    const w = state.stage.weights(t);
    const arr = [];
    for (const k in w) arr.push({ type: k, weight: w[k] });
    return U.weighted(arr).type;
  }
  function stageBossPool(stage) {
    const pool = new Set();
    for (let i = 0; i < stage.bosses.length; i++) {
      const tier = stage.bosses[i][0];
      for (let j = 0; j < tier.length; j++) pool.add(tier[j]);
    }
    return Array.from(pool);
  }
  const Waves = {
    reset: function (state) {
      state.spawnAccum = 0;
      state.swarmTimer = C.SWARM_EVERY;
      state.spawnPause = 0;
      state.bossSpawned = [];   // 按关卡 bosses 下标记录是否已刷
      state.lateBossIndex = 0;
      state.endlessBossNext = 20 * 60 + C.ENDLESS_BOSS_EVERY;
    },

    update: function (state, dt) {
      const t = state.time / 60; // 分钟
      const bossQueue = [];
      if (state.spawnPause > 0) state.spawnPause -= dt;
      const diff = CFG.DIFFICULTY[state.difficulty] || CFG.DIFFICULTY.normal;
      const early = CU.earlySpawnFactor(t, state.difficulty);

      // 常规刷怪(套难度乘子)
      if (state.spawnPause <= 0 && state.enemies.length < C.MAX_ENEMIES) {
        state.spawnAccum += dt * CU.spawnRate(t) * diff.spawnMul * early * ((state.charMods && state.charMods.enemySpawnMul) || 1);
        while (state.spawnAccum >= 1) {
          state.spawnAccum -= 1;
          spawnAtRing(state, pickType(state, t));
          if (state.enemies.length >= C.MAX_ENEMIES) break;
        }
      }

      // 集群波
      state.swarmTimer -= dt;
      if (state.swarmTimer <= 0) {
        state.swarmTimer += C.SWARM_EVERY;
        const n = Math.max(1, Math.round((C.SWARM_COUNT + Math.floor(t)) * early));
        for (let i = 0; i < n; i++) spawnAtRing(state, U.choice(CFG.SWARM_TYPES));
      }

      // Boss 时间表(按关卡)
      const bosses = state.stage.bosses;
      for (let i = 0; i < bosses.length; i++) {
        const pair = bosses[i];
        if (!state.bossSpawned[i] && state.time >= pair[1]) {
          state.bossSpawned[i] = true;
          bossQueue.push({ type: U.choice(pair[0]), source: "story" });
        }
      }
      // 通关前固定三个多 Boss 波；暂停/升级时 state.time 不前进。
      if (!state.endless) {
        const pool = state.lateBossIndex < C.LATE_BOSS_TIMES.length && state.time >= C.LATE_BOSS_TIMES[state.lateBossIndex] ? stageBossPool(state.stage) : null;
        while (state.lateBossIndex < C.LATE_BOSS_TIMES.length && state.time >= C.LATE_BOSS_TIMES[state.lateBossIndex]) {
          state.lateBossIndex++;
          const n = U.randInt(2, 3);
          for (let i = 0; i < n; i++) bossQueue.push({ type: U.choice(pool), source: "late" });
        }
      }

      // 无尽模式:从 21:00 起每分钟一波(随机 1-3 只同台)
      if (state.endless) {
        const pool = state.time >= state.endlessBossNext ? stageBossPool(state.stage) : null;
        while (state.time >= state.endlessBossNext) {
          state.endlessBossNext += C.ENDLESS_BOSS_EVERY;
          const n = U.randInt(1, 3);
          for (let i = 0; i < n; i++) bossQueue.push({ type: U.choice(pool), source: "endless" });
        }
      }
      if (bossQueue.length) this.spawnBosses(state, bossQueue);
    },

    spawnBoss: function (state, bossType) {
      this.spawnBosses(state, [bossType]);
    },

    spawnBosses: function (state, bossTypes) {
      let spawned = 0;
      for (let b = 0; b < bossTypes.length; b++) {
        const item = bossTypes[b], bossType = typeof item === "string" ? item : item.type;
        const source = typeof item === "string" ? "manual" : (item.source || "manual"), def = CFG.BOSSES[bossType];
        if (!def) continue;
        const count = def.count || 1;
        const gid = count > 1 ? (state._bossGid = (state._bossGid || 0) + 1) : 0; // 多体 Boss 同组共享 gid(整组只掉一份 Boss 奖励)
        for (let i = 0; i < count; i++) {
          const pos = spawnPos(state);
          const e = SV.Entities.addBoss(state, bossType, pos.x, pos.y);
          if (e) { spawned++; e.bossSource = source; if (gid) e.gid = gid; }
        }
      }
      if (!spawned) return;
      state.spawnPause = 3;
      SV.Audio.bossWarn();
      SV.Effects.shake(8, 0.6);
      const oneType = bossTypes.length === 1 ? (typeof bossTypes[0] === "string" ? bossTypes[0] : bossTypes[0].type) : null;
      const one = oneType && CFG.BOSSES[oneType];
      SV.HUD.toast(one ? L("⚠ " + one.name + " has arrived", "⚠ " + one.name + " 降临") : L("⚠ Elite wave incoming (" + spawned + ")", "⚠ 强敌集群来袭（" + spawned + "名）"));
    }
  };

  SV.Waves = Waves;
})();
