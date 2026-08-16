// storage.js — SV.Storage: localStorage 存档(v2,按 角色×关卡×难度×无尽 分别记录最佳)
(function () {
  "use strict";
  const SV = window.SV;

  const KEY = "neon_survivor_v2";
  const DEFAULTS = {
    bests: {},                 // "stageId:diff:charId[:endless]" -> { time, level, cleared }
    totalKills: 0, totalRuns: 0, totalEvolutions: 0,
    soundOn: true, reducedFx: false,
    autoMode: false,                 // 全自动模式开关(SV.Auto)
    musicVol: 1.0, sfxVol: 1.0,   // 音乐/音效音量(0..1);默认均满档
    lastStage: "ruins", lastDiff: "normal", lastChar: "bulwark"
  };

  let data = null;
  let dirty = false;
  let flushTimer = null;

  function load() {
    if (data) return data;
    let d = Object.assign({}, DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const parsed = JSON.parse(raw); Object.assign(d, parsed); if (!d.bests) d.bests = {}; }
    } catch (e) { /* 隐私模式/损坏:用默认值 */ }
    // 一次性迁移:清除旧格式(无 charId 段)的 best key——2 段(stage:diff)或 3 段且末段 endless
    if (d.bests) {
      for (const k in d.bests) {
        const p = k.split(":");
        if (p.length === 2 || (p.length === 3 && p[2] === "endless")) delete d.bests[k];
      }
    }
    data = d;
    return data;
  }
  function writeNow() {
    flushTimer = null;
    if (!data) return;
    dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 忽略 */ }
  }
  function scheduleFlush() {
    dirty = true;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(writeNow, 500);
  }

  function bkey(stageId, diff, charId, endless) { return stageId + ":" + diff + ":" + charId + (endless ? ":endless" : ""); }

  const Storage = {
    load: load,
    get: function (k) { return load()[k]; },
    set: function (k, v) { load()[k] = v; scheduleFlush(); },
    setSound: function (on) { this.set("soundOn", !!on); },
    setReducedFx: function (on) { this.set("reducedFx", !!on); },
    setSelection: function (stageId, diff) { load().lastStage = stageId; load().lastDiff = diff; writeNow(); },
    setChar: function (id) { load().lastChar = id; writeNow(); },

    getBest: function (stageId, diff, charId, endless) {
      const b = load().bests[bkey(stageId, diff, charId, endless)];
      return b || { time: 0, level: 0, cleared: false };
    },

    // 记录一局;返回是否刷新该角色×该关×该难度(该无尽桶)最佳时间
    recordRun: function (stageId, diff, charId, timeSec, level, kills, evolutions, cleared, endless) {
      const d = load();
      const k = bkey(stageId, diff, charId, endless);
      const prev = d.bests[k] || { time: 0, level: 0, cleared: false };
      const isBest = timeSec > prev.time;
      d.bests[k] = {
        time: Math.max(prev.time, timeSec),
        level: Math.max(prev.level, level),
        cleared: !!prev.cleared || !!cleared
      };
      d.totalKills += kills;
      d.totalRuns += 1;
      d.totalEvolutions += evolutions;
      writeNow();
      return isBest;
    },

    // 某角色的聚合成绩(跨所有关卡×难度,含无尽):通关配置数、最佳存活时间
    charSummary: function (charId) {
      const bests = load().bests;
      let clears = 0, bestTime = 0, stages = 0;
      for (const k in bests) {
        const p = k.split(":");
        if (p[2] !== charId) continue;
        const b = bests[k];
        if (b.cleared) clears++;
        if (b.time > bestTime) bestTime = b.time;
        stages++;
      }
      return { clears: clears, bestTime: bestTime, stages: stages };
    },

    // 某角色按难度的最佳成绩(跨所有关卡,含无尽桶):{ diffId -> {bestTime, clears} }
    charSummaryByDiff: function (charId) {
      const bests = load().bests;
      const out = {};
      for (const k in bests) {
        const p = k.split(":");
        if (p[2] !== charId) continue;
        const b = bests[k];
        if (!out[p[1]]) out[p[1]] = { bestTime: 0, clears: 0 };
        if (b.time > out[p[1]].bestTime) out[p[1]].bestTime = b.time;
        if (b.cleared) out[p[1]].clears++;
      }
      return out;
    },

    flushNow: writeNow
  };

  SV.Storage = Storage;
})();
