// waves.js — SV.Waves: 刷怪导演。按时间曲线刷怪、定时集群波、分钟点 Boss。
(function () {
  "use strict";
  const SV = window.SV;
  const U = SV.Util;
  const C = SV.Config.CONST;
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
  // 14min 后周期 Boss 波的分档间隔:按当前时间取所在档 every(14-17min@90s,17-19min@60s,19min+@30s)
  function lateBossEvery(time) {
    const tiers = C.LATE_BOSS_TIERS;
    let every = tiers[0].every;
    for (let i = 0; i < tiers.length; i++) if (time >= tiers[i].after) every = tiers[i].every;
    return every;
  }

  const Waves = {
    reset: function (state) {
      state.spawnAccum = 0;
      state.swarmTimer = C.SWARM_EVERY;
      state.spawnPause = 0;
      state.bossSpawned = [];   // 按关卡 bosses 下标记录是否已刷
      state.finalSpawned = false;
      state.endlessBossTimer = C.ENDLESS_BOSS_EVERY;
      state.bossWaveTimer = C.LATE_BOSS_TIERS[0].every; // 14min 后周期多 Boss 波倒计时(首波≈15.5min)
    },

    update: function (state, dt) {
      const t = state.time / 60; // 分钟
      if (state.spawnPause > 0) state.spawnPause -= dt;
      const diff = CFG.DIFFICULTY[state.difficulty] || CFG.DIFFICULTY.normal;

      // 常规刷怪(套难度乘子)
      if (state.spawnPause <= 0 && state.enemies.length < C.MAX_ENEMIES) {
        state.spawnAccum += dt * CU.spawnRate(t) * diff.spawnMul * ((state.charMods && state.charMods.enemySpawnMul) || 1);
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
        const n = C.SWARM_COUNT + Math.floor(t);
        for (let i = 0; i < n; i++) spawnAtRing(state, U.choice(CFG.SWARM_TYPES));
      }

      // Boss 时间表(按关卡)
      const bosses = state.stage.bosses;
      for (let i = 0; i < bosses.length; i++) {
        const pair = bosses[i];
        if (!state.bossSpawned[i] && state.time >= pair[1]) {
          state.bossSpawned[i] = true;
          this.spawnBoss(state, pair[0]);
        }
      }
      // 终局 Boss 组(虚空深渊等)
      if (state.stage.finale && !state.finalSpawned && state.time >= state.stage.finaleMin) {
        state.finalSpawned = true;
        for (let i = 0; i < state.stage.finale.length; i++) this.spawnBoss(state, state.stage.finale[i]);
      }

      // 14min 后周期性多 Boss 波(分档加密:14-17min@1.5min,17-19min@1min,19min+@30s;每波 2-3 只随机 Boss 同台)。非无尽:提供后期压力与宝箱
      if (!state.endless && state.time >= C.LATE_BOSS_AFTER) {
        state.bossWaveTimer -= dt;
        if (state.bossWaveTimer <= 0) {
          state.bossWaveTimer = lateBossEvery(state.time);
          const pool = Object.keys(CFG.BOSSES);
          const n = U.randInt(2, 3);
          for (let i = 0; i < n; i++) this.spawnBoss(state, U.choice(pool));
        }
      }

      // 无尽模式:定时 Boss 波(随机 1-3 只同台)
      if (state.endless) {
        state.endlessBossTimer -= dt;
        if (state.endlessBossTimer <= 0) {
          state.endlessBossTimer = C.ENDLESS_BOSS_EVERY;
          const n = U.randInt(1, 3);
          const pool = Object.keys(CFG.BOSSES);
          for (let i = 0; i < n; i++) this.spawnBoss(state, U.choice(pool));
        }
      }
    },

    spawnBoss: function (state, bossType) {
      const def = CFG.BOSSES[bossType];
      const count = def.count || 1;
      const gid = count > 1 ? (state._bossGid = (state._bossGid || 0) + 1) : 0; // 多体 Boss 同组共享 gid(整组只掉一份 Boss 奖励)
      for (let i = 0; i < count; i++) {
        const pos = spawnPos(state);
        const e = SV.Entities.addBoss(state, bossType, pos.x, pos.y);
        if (e && gid) e.gid = gid;
      }
      state.spawnPause = 3;
      SV.Audio.bossWarn();
      SV.Effects.shake(8, 0.6);
      SV.HUD.toast("⚠ " + def.name + " 降临");
    }
  };

  SV.Waves = Waves;
})();
