// game.js — SV.Game: 状态机 + 固定步长循环 + 选关/难度/胜利/复位。
(function () {
  "use strict";
  const SV = window.SV;
  const U = SV.Util;
  const C = SV.Config.CONST;
  const CU = SV.Config.CURVES;
  const STAGES = SV.Config.STAGES;

  const Game = {
    state: null,
    mode: "menu" // menu | charselect | select | playing | paused | levelup | endlessprompt | gameover
  };

  let selStage = "ruins", selDiff = "normal", selChar = "bulwark";

  // ── 复位一局(按所选角色/关卡/难度)
  function reset() {
    const s = Game.state;
    s.stageId = selStage;
    s.difficulty = selDiff;
    s.stage = STAGES[selStage];
    const ch = SV.Config.CHARACTERS[selChar] || SV.Config.CHARACTERS.bulwark;
    s.charId = selChar;
    s.charMul = { hpMul: ch.hpMul, speedMul: ch.speedMul };
    s.charMods = ch.charMods || {};   // 角色静态乘子(拾取/再生/吸血/敌速/刷怪)
    s.special = ch.special || null;   // 角色动态机制路由 key
    SV.Renderer.setPalette(s.stage.palette);
    s.player = SV.Entities.makePlayer();
    s.enemies = [];
    s.gems = [];
    s.pickups = [];
    s.eshots = [];
    s.weapons = [];
    s.hazards = [];
    s.envTimer = (s.stage && s.stage.envField) ? s.stage.envField.interval : 0;
    s._voidPull = 0;
    s._voidPullDir = 0;
    s.passives = Object.assign({}, ch.startPassives); // 起手被动
    s.endless = false;
    s.level = 1;
    s.xp = 0;
    s.xpNext = CU.xpForLevel(1);
    s.time = 0;
    s.kills = 0;
    s.evolutions = 0;
    s.encountered = { enemy: {}, boss: {} }; // 图鉴(本局遇敌记录)
    s.weaponDamage = {};                     // 每武器累计伤害(键=canonical id)
    s.weaponActive = {};                     // 每武器累计活跃秒数(键=canonical id)
    s.enemyDamage = {};                      // 每敌人类型对玩家累计伤害(键=type/bossType)
    s.bossFlags = { count: 0, wraithEnrage: false };
    s._bossLoot = {};  // 多体 Boss 掉落去重(gid → 已掉过)
    s._bossGid = 0;    // 多体 Boss 组 id 计数(waves.spawnBoss 分配)
    s.hudAccum = 0;
    s.ended = false;
    SV.Entities.invalidateMods(s);    // 清跨局残留的 mods 缓存
    SV.Weapons.init(s, ch.startWeapon); // 起手武器(随角色)
    s.everOwned = {}; s.everOwned[ch.startWeapon] = true; // 武器历史:防止融合/进化后被当新武器重发
    // 起手满血(含角色 hpMul)
    const m = SV.Entities.mods(s);
    s.player.maxHp = m.maxHp;
    s.player.hp = m.maxHp;
    SV.Waves.reset(s);
    SV.Effects.clear();
    SV.Renderer.snapCam(s.player.x, s.player.y);
  }

  function showHud(on) {
    const hud = document.getElementById("hud");
    if (hud) hud.classList.toggle("hidden", !on);
  }

  function startRun() {
    reset();
    Game.mode = "playing";
    SV.Menus.hideAll();
    showHud(true);
    SV.HUD.refresh(Game.state);
    SV.Audio.startBgm(Game.state.stage && Game.state.stage.bgm);
  }

  function showCharSelect() {
    Game.mode = "charselect";
    SV.Menus.showCharSelect({ stage: selStage, diff: selDiff, char: selChar });
    showHud(false);
  }

  function showSelect() {
    Game.mode = "select";
    SV.Menus.showSelect({ stage: selStage, diff: selDiff, char: selChar });
    showHud(false);
  }

  // ── 通关:弹出无尽选择(冻结模拟),确认后进入无尽模式
  function openEndlessPrompt() {
    Game.mode = "endlessprompt";
    SV.Menus.showEndlessPrompt(Game.state);
    showHud(false);
    SV.Audio.evolve();
  }
  function enterEndless() {
    if (Game.mode !== "endlessprompt") return;
    Game.state.endless = true;
    Game.mode = "playing";
    SV.Menus.hideAll();
    showHud(true);
    SV.HUD.refresh(Game.state);
    SV.HUD.toast("∞ 无尽模式!敌人将不断增强");
  }

  function togglePause() {
    if (Game.mode === "playing") { Game.mode = "paused"; SV.Menus.populatePause(Game.state); SV.Menus.show("pause"); }
    else if (Game.mode === "paused") { Game.mode = "playing"; SV.Menus.hideAll(); }
  }

  // ── 升级流程
  function openLevelUp() {
    Game.mode = "levelup";
    const choices = SV.Upgrades.rollChoices(Game.state);
    if (!choices.length) { Game.mode = "playing"; return; }
    SV.Audio.levelup();
    SV.Effects.levelBurst(Game.state.player.x, Game.state.player.y);
    SV.HUD.showLevelUp(choices, onChoose);
  }
  function levelUpOnce() {
    const s = Game.state;
    s.level++; s.xp -= s.xpNext; s.xpNext = CU.xpForLevel(s.level);
    openLevelUp();
  }
  function onChoose(choice) {
    SV.Upgrades.apply(Game.state, choice);
    if (Game.state.xp >= Game.state.xpNext) levelUpOnce();
    else { Game.mode = "playing"; SV.HUD.refresh(Game.state); }
  }

  Game.onXP = function () {
    if (Game.mode === "playing" && Game.state.xp >= Game.state.xpNext) levelUpOnce();
  };
  Game.onPlayerDeath = function () {
    if (Game.mode !== "gameover") endRun(false);
  };

  // ── 结算(失败/胜利)
  function endRun(won) {
    if (Game.state.ended) return;
    Game.state.ended = true;
    Game.mode = "gameover";
    SV.Audio.stopBgm();
    const s = Game.state;
    const endless = !!s.endless;
    const isBest = SV.Storage.recordRun(s.stageId, s.difficulty, s.charId, s.time, s.level, s.kills, s.evolutions, won, endless);
    SV.Menus.setGameOver({
      won: won, endless: endless, charName: SV.Config.CHARACTERS[s.charId].name, stageName: s.stage.name, diffName: SV.Config.DIFFICULTY[s.difficulty].name,
      time: s.time, level: s.level, kills: s.kills, evolutions: s.evolutions,
      weaponDamage: s.weaponDamage || {}, weaponActive: s.weaponActive || {},
      best: SV.Storage.getBest(s.stageId, s.difficulty, s.charId, endless).time, isBest: isBest
    });
    SV.Menus.show("gameover");
    showHud(false);
    if (won) SV.Audio.evolve(); else SV.Audio.gameOver();
    SV.Effects.shake(14, 0.6);
    SV.Effects.explosion(s.player.x, s.player.y, won ? SV.Config.COLORS.gold : SV.Config.COLORS.player, 30);
  }

  // ── 菜单/按钮动作
  function handleAct(act, el) {
    if (act === "start") showSelect(); // 标题 → 选图(第一步)
    else if (act === "pickStage") { // 选图:只选中并重绘,留在本屏
      selStage = el.getAttribute("data-stage");
      SV.Storage.setSelection(selStage, selDiff);
      SV.Menus.showSelect({ stage: selStage, diff: selDiff, char: selChar });
    }
    else if (act === "toChar") showCharSelect(); // 选图屏「继续」→ 选角屏
    else if (act === "pickChar") { // 选角:只切选中 + 刷详情,留在本屏(不重建网格)
      selChar = el.getAttribute("data-char");
      SV.Storage.setChar(selChar);
      SV.Menus.selectChar(selChar);
    }
    else if (act === "setDiff") { // 切难度:只切换高亮,留在本屏
      selDiff = el.getAttribute("data-diff");
      SV.Storage.setSelection(selStage, selDiff);
      SV.Menus.setDiffHighlight(selDiff);
    }
    else if (act === "toStage") showSelect(); // 选角屏「返回选关」→ 选图屏
    else if (act === "beginRun") startRun(); // 选角屏「开始游戏」→ 进入战斗
    else if (act === "endlessYes") enterEndless();
    else if (act === "endlessNo") endRun(true);
    else if (act === "restart") startRun();
    else if (act === "pause" || act === "resume") togglePause();
    else if (act === "menu") { Game.mode = "menu"; reset(); SV.Audio.startBgm(SV.Config.MENU_BGM); refreshTitleBest(); SV.Menus.show("title"); showHud(false); }
    else if (act === "toggleSound") { const m = !SV.Audio.isMuted(); SV.Audio.setMuted(m); SV.Menus.setSoundToggle(m); }
    else if (act === "toggleFx") {
      const v = !SV.Storage.get("reducedFx"); SV.Storage.setReducedFx(v); SV.Effects.setReducedFx(v);
      SV.Menus.setFxToggle(v);
      SV.HUD.toast(v ? "已开启省电模式" : "已关闭省电模式");
    }
    else if (act === "toggleAuto") { if (SV.Auto && SV.Auto.toggle) SV.Auto.toggle(); }
  }

  function refreshTitleBest() {
    const tb = document.getElementById("titleBest");
    if (!tb) return;
    const ch = SV.Config.CHARACTERS[selChar] || SV.Config.CHARACTERS.bulwark;
    const st = STAGES[selStage] || STAGES.ruins;
    const df = SV.Config.DIFFICULTY[selDiff] || SV.Config.DIFFICULTY.normal;
    const best = SV.Storage.getBest(selStage, selDiff, selChar).time;
    tb.textContent = ch.name + " · " + st.name + " · " + df.name + " · " + U.fmtTime(best);
  }

  // ── 每帧输入(始终运行)
  function handleInputs() {
    if (SV.Input.consumePause()) {
      if (Game.mode === "playing" || Game.mode === "paused") togglePause();
    }
    if (SV.Input.consumeMute()) { const m = !SV.Audio.isMuted(); SV.Audio.setMuted(m); SV.Menus.setSoundToggle(m); }
    if (SV.Input.consumeConfirm()) {
      if (Game.mode === "menu") showSelect();
      else if (Game.mode === "endlessprompt") enterEndless(); // 回车默认进入无尽
      else if (Game.mode === "gameover") startRun();
      else if (Game.mode === "paused") togglePause();
    }
  }

  // ── 固定步长模拟(仅 playing)
  function step(dt) {
    const s = Game.state;
    s.time += dt;
    // 通关判定(无尽模式已开启则继续,不再重复弹窗)
    if (s.time >= s.stage.goalMin && !s.endless) { openEndlessPrompt(); return; }
    SV.Waves.update(s, dt);
    SV.Entities.rebuildGrid(s);
    SV.Weapons.updateAll(s, dt);
    if (SV.Auto && SV.Auto.enabled) SV.Auto.tick(s, dt);   // 全自动走位(grid 刚刷新、updatePlayer 未读 axis)
    SV.Entities.updatePlayer(s, dt);
    SV.Entities.updateEnemies(s, dt);
    SV.Entities.envTick(s, dt);
    SV.Effects.update(dt);
    SV.Renderer.followCam(s, dt);
    s.hudAccum += dt;
    if (s.hudAccum >= 0.12) { s.hudAccum = 0; SV.HUD.refresh(s); }
  }

  // ── 主循环
  let _last = 0, _acc = 0;
  function frame(now) {
    if (!_last) _last = now;
    let ft = (now - _last) / 1000; _last = now;
    if (ft > C.MAX_FRAME) ft = C.MAX_FRAME;

    SV.Input.update();
    handleInputs();

    if (Game.mode === "playing") {
      _acc += ft;
      let steps = 0;
      while (_acc >= C.FIXED_DT && steps < C.MAX_STEPS) { step(C.FIXED_DT); _acc -= C.FIXED_DT; steps++; }
      if (steps === C.MAX_STEPS) _acc = 0;
    } else if (Game.mode === "gameover") {
      SV.Effects.update(ft);
    }

    SV.Renderer.render(Game.state);
    requestAnimationFrame(frame);
  }

  // ── 启动
  Game.boot = function () {
    Game.state = {};
    selStage = SV.Storage.get("lastStage") || "ruins";
    selDiff = SV.Storage.get("lastDiff") || "normal";
    selChar = SV.Storage.get("lastChar") || "bulwark";
    const canvas = document.getElementById("game");
    SV.Renderer.init(canvas);
    SV.Input.init(document.getElementById("stick"), document.getElementById("knob"), document.getElementById("stickZone"));
    SV.HUD.init();
    SV.Menus.init();
    SV.Effects.init();
    SV.Menus.setSoundToggle(SV.Audio.isMuted());
    SV.Menus.setFxToggle(SV.Effects.isReduced());
    SV.Menus.setVolUI(SV.Audio.getMusicVol(), SV.Audio.getSfxVol());
    if (SV.Menus && SV.Menus.setAutoToggle && SV.Auto) SV.Menus.setAutoToggle(!!SV.Storage.get("autoMode"));
    SV.Menus.onAct(handleAct);
    if (SV.Auto && SV.Auto.init) SV.Auto.init();   // 全自动模式:包装升级入口、绑定开关、还原偏好

    reset();
    Game.mode = "menu";
    showHud(false);
    refreshTitleBest();
    SV.Menus.show("title");

    window.addEventListener("resize", function () { SV.Renderer.resize(); });
    // iOS Safari 旋转:orientationchange 比 resize 早派发且带新尺寸,但有时 resize 仍拿到旧值 → 加 100ms 延迟兜底
    window.addEventListener("orientationchange", function () { setTimeout(function () { SV.Renderer.resize(); }, 120); });
    // Safari URL 栏自动隐藏/出现会改变视觉视口,ResizeObserver 比 resize 更可靠捕捉
    try {
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(function () { SV.Renderer.resize(); });
        ro.observe(canvas);
      }
    } catch (e) {}
    // 从后台返回时重测(可能切应用期间旋转过)
    document.addEventListener("visibilitychange", function () { if (!document.hidden) SV.Renderer.resize(); });

    // 移动端:切后台/锁屏/通知中心时自动暂停(rAF 被节流会导致固定步长大 catch-up;
    // iOS Safari 常触发 pagehide,Android Chrome 触发 visibilitychange,两者都监听)
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && Game.mode === "playing") togglePause();
    });
    window.addEventListener("pagehide", function () {
      if (Game.mode === "playing") togglePause();
    });

    // 音频解锁:首次手势(用户交互)后才能 startBgm。
    // pointerdown 覆盖现代浏览器;touchstart 兜底旧 Android webview;iOS Safari 两者都派发。
    const unlock = function () {
      SV.Audio.resume();
      SV.Audio.startBgm(SV.Config.MENU_BGM);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });

    requestAnimationFrame(frame);
  };

  SV.Game = Game;
})();
