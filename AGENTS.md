# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目概况

**霓虹幸存者** — Vampire-Survivors 类弹幕肉鸽。纯 Canvas2D + vanilla JS，零依赖，双击 `index.html` 以 `file://` 直接运行（无构建、无打包、无服务器）。UI 全中文。

## 运行与测试

- **运行**：双击 `index.html`（file:// 直开，无任何服务端依赖）。改动后无构建步骤。
- **语法自检**：`node -e 'new Function(require("fs").readFileSync("js/<file>.js","utf8"))'`（对每个 js 文件）。
- **逻辑测试**：`/tmp/pwtest/logic_test*.js`（Node vm 沙箱模拟 DOM/localStorage/AudioContext 后加载全部模块，`SV.Game.boot()` 后直接调用模块 API 断言）。运行：`node /tmp/pwtest/logic_test7.js`。**新增功能必须配套新增/更新断言**，数值改动记得同步旧测试的期望值。
- **真浏览器无头测试**：`/tmp/pwtest/features*_test.js`（Playwright-core，`file://` URL 直开，走真实 UI 流程 + canvas 像素探针 + 压测帧率 + ERR=0 断言）。运行前若 `node_modules` 缺包：`cd /tmp/pwtest && npm install playwright-core --no-save`（浏览器二进制在 `~/Library/Caches/ms-playwright`，无需重新下载）。
- 测试依赖 vm 沙箱的关键 mock：`makeEl()`（带 classList/style/getContext 的假 DOM 元素）、`document.addEventListener` 拦截后手动触发 `data-act` 点击委托驱动游戏流程。

## 架构

**模块体系**：20 个文件 `js/*.js`，全部 IIFE 挂到共享命名空间 `window.SV`（`app.js` 里 `window.SV = window.SV || {}` 引导）。**加载顺序严格依赖**（index.html 脚本顺序）：util → config → storage → input → audio → pool → spatial → effects → entities → ai → weapons → waves → upgrades → renderer → hud → menus → auto → **icon** → game → app。新模块必须插在正确位置，且用 IIFE + `const SV = window.SV` 模式。

**核心分层**：
- `config.js` — **唯一数值源**（数据驱动）：WEAPONS/WEAPON_EVOS（含融合 def）/EVOLUTIONS/FUSIONS（协同进化组合表）/PASSIVES/ENEMIES/BOSSES（含 tier）/STAGES（含 half 竞技场半宽与 Boss 排期）/CURVES（难度曲线与成长曲线参数）/DIFFICULTY/CHARACTERS/CONST。改平衡只动这里（个别机制在 weapons.js）。
- `game.js` — 状态机（menu/charselect/select/playing/paused/levelup/endlessprompt/gameover）+ 固定步长主循环。`step()` 顺序：Waves → rebuildGrid → Weapons.updateAll → updatePlayer → updateEnemies → Effects。通关（`time ≥ goalMin`）弹无尽选择而非直接结算。
- `spatial.js` — 均匀网格宽相位（唯一碰撞查询入口 `queryCircle`），每帧由 `rebuildGrid` 重建（只插敌人，不含敌方弹幕）。
- `pool.js` — 通用对象池；武器投射物用 `Weapons.mkProj()`（满 `MAX_PROJECTILES=1200` 时回收最旧，保证返回非空）。
- `entities.js` — 工厂 + 玩家/敌人积分；`mods(state)` 汇总被动数值并**缓存到 `state._mods`**。
- `weapons.js` — 武器分发与投射物推进；`stats(w, state)` 应用被动乘子。
- `ai.js` — 每敌人一种行为，只写 `e.vx/e.vy`；Boss 分支含 8 种（含磁暴引力波/镜像换位/巨像旋转激光）。
- `renderer.js` — 相机 + 缓存辉光精灵（**绝不用实时 shadowBlur**）+ 视口剔除；屏外 Boss 箭头、玩家头顶血条、竞技场边框。
- `hud.js`/`menus.js` — DOM 叠层（节流 ~120ms 刷新、pointer-events:none）+ 全屏菜单屏，`data-act` 事件委托驱动 `game.js` 的 handleAct。
- `auto.js` — **全自动模式**（`SV.Auto`，默认关，随时可切）。走位：`tick(state,dt)` 在 `step()` 的 `updatePlayer` 前覆写 `SV.Input.axis`——方向采样「最长净空跑道」(安全地板) + FLEE(随最近净空到 `SAFE` 衰减:既不贴墙逃、又让敌进入武器射程好打怪) + **宝石/特殊掉落吸引**(直接扫 `state.gems`/`state.pickups`,不在网格;安全可拾才拾) + ORBIT 轻微环绕 + STICK 防抖；bomber/eshots/hazards(穿 i-frame 致死源)加权放大半径。升级：`pickUpgrade` 打分(fuse>evolve>进化解锁铺路>magnet 协同>常规)。`init()` 在 `boot()` 里**运行时包装 `SV.HUD.showLevelUp`**(开启即渲染三张卡 + `.chosen` 高亮所选、`LV_DELAY`~1s / `LV_FAST`(级联)后自动 `onSelect(pick)`，`done` 标志防双选)。开关：`O` 键 / `#btnAuto`，偏好持久化 `Storage.autoMode`。调参只动 `config.js` 的 `AUTO` 块。**范围仅走位+升级**；通关无尽弹窗、死亡结算屏仍手动(用户决定)。

**成长体系**（三轮演进后的现状）：
- 武器等级封顶 8（`WEAPON_MAX`，兼进化阈值）；被动等级无限（99），收益按两种曲线递减：`capDim(n,cap,v1)`（有硬上限，等比收敛）与 `rootDim(n,per)`（无上限，1/√n，≈2√n 增长），都在 `Entities.mods()` 内。
- 进化：武器 L8 + 对应被动 L5 → 升级池出进化卡；**协同进化**：两把已进化武器 → `FUSIONS` 组合卡 → 合成一把融合武器（释放槽位）。

## 关键陷阱（改代码前必读）

1. **mods 缓存**：`mods()` 结果缓存于 `state._mods`，任何被动/角色变化后必须 `SV.Entities.invalidateMods(state)`（`Upgrades.apply` 与 `Game.reset` 已做；测试里直改 `state.passives` 后也要手动失效，否则读旧值）。
2. **融合武器分发**：所有融合 def 的 `kind` 统一为 `"fusion"`——`weapons.js` 里按 **`w.id`** 分发（`FUSION_FIRE` 表 + updateAll 里 `w.id === "blade_aura"/"boomerang_sentry"` 特判），不能按 kind。连续型融合（刃环类）需要自己的每帧逻辑。
3. **命中 vs 查询半径**：`queryCircle` 半径必须 ≥ 实际命中半径（静止目标会漏检）。
4. **file:// 约束**：经典 `<script>` 标签（ES module 会被 file:// 的 CORS 拦截）；bootstrap 必须 `window.SV = window.SV || {}`（顶层 const 不进 window）。
5. **弹幕增殖**：爆炸/分裂类武器（grenade_evo 分裂 2 颗、融合轨道轰炸每穿爆炸）要注意 `MAX_PROJECTILES` 硬上限；`explodeGrenade` 用 `pr.clustered` 标志防重复分裂。
6. **哨卫塔数**：sentry L8 = 3 塔（sentry_evo = 5）；塔身有弹幕拦截逻辑（`sentryUpdate` 与融合版都有）。
7. **每武器伤害统计**（暂停/结算用）：武器造成伤害必须经 `weapons.js` 的 `dmgEnemy(e,dmg,wid)` 穿 `wid`（投射物命中传 `pr.weaponId`，直接伤害传 `w.id`），最终在 `Entities.damageEnemy` 累加到 `state.weaponDamage[ tid(wid) ]`。`tid(id)=id.replace(/_evo$/,"")`（进化与进化前合并、融合武器独立成桶）；`state.weaponActive[tid]` 在 `updateAll` 每帧累加。**新增武器/新增伤害点必须补传 wid**，否则该武器伤害不计入统计。DoT（毒/燃烧/咒引）需在施加时存 `e.poisonWid`/`e.hexWid`，`updateEnemies` tick 时随 `wid` 传入。`capDim/rootDim/tid/previewEnemy/previewBoss` 已经 `SV.Entities` 导出。
8. **BGM**：`audio.js` 程序化合成（`musicGain→master`，每图 `stage.bgm` profile：root/scale/bpm/wave 驱动 lookahead 调度，bass+琶音+pad 循环），无外部音频文件（保 file:// 友好）。`startRun` 调 `startBgm`、`endRun`/回标题调 `stopBgm`，暂停不停。vm 沙箱测试的 `AudioContext` mock 需含 `createBuffer/createBufferSource/createBiquadFilter`（`bossWarn/die/hurt` 的 `noise()` 要用）。
9. **14min 后周期多 Boss 波**：`waves.js` 的 `state.bossWaveTimer`（常量 `LATE_BOSS_AFTER=14*60` / `LATE_BOSS_EVERY=90`），**不受 `state.endless` 门控**，与每关静态 `bosses` 表、void `finale` 并存；每波 `randInt(2,3)` 只随机 Boss。改 Boss 弹幕用 `ai.js` 的 `burst/aimedSpread/ringFrom/spiralBurst`（后两者新增；`spiralBurst` 用专用字段 `e.sp` 存相位，勿与 `t1/t2/t3/cdir` 混用）。
10. **升级卡真实增量**：被动卡文案走 `Upgrades.passiveLevelText`（`magnet` 走 `magnetLevelText`），用 `capDim/rootDim` 算「下一级」真实增量（递减后小于首级），不再是 config 静态首级文案。武器卡 `levelText` 已正确（走 `Weapons.stats` diff）。
11. **环境机制随时间成长**：`envTick`（entities.js）的 burn 区数 `1+floor(t/3)`、freeze/gravity 时长 `min(interval/3, dur*(1+0.5t))`（上限为触发间隔 1/3）、gravity 方向随机存 `state._voidPullDir`。注意区分 stage envField 引力与 Boss `magnetwarper` 的引力（后者在 `ai.js`，朝 Boss）。
12. **全自动模式接入点**：`game.js step()` 里 `updatePlayer` 前一行 `if (SV.Auto && SV.Auto.enabled) SV.Auto.tick(s, dt)`、`boot()` 里 `if (SV.Auto && SV.Auto.init) SV.Auto.init()`——**两处都带 guard**，因为 vm 旧测试 `logic_test1~13` 的手动加载列表不含 `auto`（不 guard 会让旧测试 boot 抛错）。走位靠覆写 `SV.Input.axis`（全仓仅 `entities.js:366` 一处读，grep 可证，覆写即走完 speed/clamp 管线）；宝石/掉落直接扫 `state.gems`/`state.pickups`（**不在空间网格**，`queryCircle` 只返敌）；升级靠**包装 `SV.HUD.showLevelUp`** 而非 handleAct（升级卡是直挂 `addEventListener`、无 `data-act`），包装内 `setTimeout` 异步自动选 → 涉及升级的 vm/Playwright 断言须 `await`/poll。调参只动 `config.js` 的 `AUTO` 块（SENSE/SAFE/GEM/SPEC/FLEE/LV_DELAY 等）。改 `step()` 顺序或 `updatePlayer` 读 axis 的位置时，须同步 `Auto.tick` 的插入点。
13. **移动端 / PWA 接入点**：
    - **浮动摇杆**（`input.js`）：触控事件源是 `<div id="stickZone">`（z-index 15，仅 `body.touch` 显示，全屏），`<div id="stick">` 仅视觉层（`pointer-events:none`，JS 用 `transform:translate()` 平移到落点）。`SV.Input.init` 接受 3 参 `(stickEl, knobEl, zoneEl)`；**zoneEl 缺失时退回固定摇杆**（旧桌面测试兼容）。多指追踪靠 `_touchId`（match `changedTouches[i].identifier`），`onInteractive(target)` 用 `closest("button,.hud-btn,[data-act],input,.card,.vol-slider,a,.screen")` 屏蔽按钮上的触摸。落点经 `_clampToSafe`（读 `#safeTest` 元素 `getComputedStyle` 的 `padding*` 即 `env(safe-area-inset-*)`）夹取到安全区内。改 z-index 时注意 stickZone(15) < hud(20) < levelup(40) < screen(50) < rotateHint(99) 的层级，否则按钮触摸会被 stickZone 截走。
    - **自动暂停**（`game.js boot()`）：`visibilitychange`（hidden 且 mode=playing → togglePause）+ `pagehide`（同）—— iOS Safari 切后台常派发 pagehide 而非 visibilitychange。改 `togglePause` 或 mode 流程时勿破坏。
    - **音频解锁**：`boot()` 末尾 `pointerdown` + `keydown` + **`touchstart`**（旧 Android webview 兜底；均 once 式自摘除）。改 `startBgm` 调用点时同步。
    - **动态图标**（`icon.js`）：`SV.Icons.draw(size)` Canvas 绘制返回 PNG dataURL；`SV.Icons.apply()` 在 `app.js go()` 里 boot 后调用，替换 `<link rel="apple-touch-icon">` 与 favicon 的 href。`manifest.json` 用静态 `icon.svg`（Android PWA 安装图标）；iOS 在「添加到主屏幕」时读实时 DOM 的 apple-touch-icon link（此时 JS 已跑过），故 dataURL 生效。**改图标设计**只动 `icon.js drawIcon` + `icon.svg`。
    - **Service Worker**（`sw.js`）：`CACHE = "neon-survivor-vN"`，预缓存 `ASSETS[]` 列表。**新增 js/css/资源文件必须同步加进 `sw.js ASSETS`**，否则离线后该文件 404。改资源清单或大版本升级时递增 `CACHE` 版本号强制 activate 清旧缓存。SW 仅 HTTPS / localhost 生效；file:// 与局域网 IP 的 HTTP 下注册失败但游戏本身不受影响（`app.js` 注册带 catch + `if('serviceWorker' in navigator)` guard）。
    - **CSS 触屏分支**：所有触屏专属样式挂 `body.touch` 类（`input.js init` 检测 `isTouch` 后加到 body）。`.kbd-only` 在 `body.touch` 下 `display:none`（键盘提示隐藏）。`@media (orientation:portrait) and (pointer:coarse)` 控制竖屏旋转提示（纯 CSS，无 JS）。`env(safe-area-inset-*)` 用于 HUD 顶栏 padding、XP 条 margin-bottom；新增边角 UI 元素时记得加同款 padding。触屏按钮最小可触尺寸 44px（`.hud-btn` 等在 `body.touch` 下放大）。
    - **icon.js 不进 vm 旧测试**：`logic_test1~13` 手动加载列表不含 `icon`（同 `auto`），`app.js go()` 调 `SV.Icons.apply` 必须 **`if (SV.Icons && SV.Icons.apply)` guard**，否则旧测试 boot 抛错。

## 移动端 / PWA

- **核心约束**：项目走 PWA 路线（`manifest.json` + `sw.js` + `icon.js`/`icon.svg`），用户浏览器打开一次后「添加到主屏幕」即全屏离线运行，iOS/Android 通用。详见 `DEPLOY.md`。
- **file:// 仍可用**：双击 `index.html` 直开仍能玩（SW/manifest 静默失败，不阻塞游戏），这是基础兼容保证，不能因加 PWA 而破坏。
- **真机调试**：电脑跑 `python3 -m http.server 8000`，手机浏览器访问 `http://<局域网IP>:8000`。但 SW/PWA 离线缓存要 HTTPS —— 完整 PWA 体验需部署到 GitHub Pages / Netlify / Vercel（见 `DEPLOY.md`）。
- **移动端测试**：`/tmp/pwtest/features_mobile_test.js`（Playwright `devices['iPhone 13']` 模拟，断言浮动摇杆/旋转提示/visibility 自动暂停/dataURL 图标/SW 注册）+ `/tmp/pwtest/mobile_smoke.js`（vm 沙箱 smoke）。改移动端代码必须跑这两个测试。
- **图标资源**：本项目**不打包任何 PNG**（零资源）。`icon.svg` 是手写 SVG 文本（Android PWA 安装图标 + favicon）；iOS apple-touch-icon 由 `icon.js` 在客户端 Canvas 运行时生成 dataURL 替换。要换设计：编辑 `icon.svg` + `icon.js drawIcon` 即可，无需准备 PNG。

