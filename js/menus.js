// menus.js — SV.Menus: 标题/选关/暂停/结算 叠层,data-act 事件委托(支持动态生成的卡片)。
(function () {
  "use strict";
  const SV = window.SV;

  let screens = {};
  let onActFn = null;

  const STAGE_ICON = { ruins: "◈", crimson: "▲", frozen: "❄", void: "✸" };

  function statTile(label, val) {
    return '<div class="ars-stat"><span class="ars-stat-n">' + val + '</span><span class="ars-stat-l">' + label + '</span></div>';
  }
  function pct(v) { return (v >= 0 ? "+" : "") + Math.round(v * 100) + "%"; }
  // 紧凑数字:统一用 k(千)。1234→1.2k,12000→12.0k,150000→150.0k
  function fmtNum(n) { n = Math.round(n); if (n >= 1000) return (n / 1000).toFixed(1) + "k"; return "" + n; }
  // 某武器的累计伤害与每分钟伤害(进化合并、融合独立,经 tid 归一)
  function weaponDmg(state, wid) {
    const k = SV.Entities.tid(wid);
    const total = (state.weaponDamage && state.weaponDamage[k]) || 0;
    const active = (state.weaponActive && state.weaponActive[k]) || 0;
    return { total: total, perMin: active > 0 ? total / active * 60 : 0 };
  }
  // 怪物图鉴条目(本局已遇)。敌人展示初始→当前值,8min 后额外标精英变异倍率。dmgToMe: {total, perMin} 或 null
  function bestiaryRow(def, cur, withElite, dmgToMe, isBoss) {
    const initHp = def.hp, initDmg = def.dmg || def.projDmg || def.boomDmg || 0;
    const curHp = cur.hp, curDmg = cur.dmg;
    let html = '<div class="ars-row" style="flex-direction:column;align-items:flex-start;gap:2px">';
    html += '<div style="display:flex;width:100%;justify-content:space-between;align-items:center">';
    html += '<span><canvas class="ars-ic" width="22" height="22" data-shape="' + (def.shape || "circle") + '" data-color="' + def.color + '"></canvas><span class="ars-name">' + def.name + "</span></span>";
    html += '<span class="ars-lv">HP ' + fmtNum(initHp) + "→" + fmtNum(curHp) + " · 伤 " + fmtNum(initDmg) + "→" + fmtNum(curDmg) + " · 经验 " + (cur.xp || def.xp) + "</span>";
    html += "</div>";
    let eff = def.skill || "";
    if (withElite) eff += " · <span style='color:#ffd86b'>精英变异:HP×4 / 伤×1.5 / 体型×1.4</span>";
    // 对玩家伤害统计:Boss 显示总伤;普通敌显示总伤 + 每分钟(自首次出现起算)
    if (dmgToMe && dmgToMe.total > 0) {
      const seg = isBoss
        ? "对玩家 总伤 " + fmtNum(dmgToMe.total)
        : "对玩家 总伤 " + fmtNum(dmgToMe.total) + " · " + fmtNum(dmgToMe.perMin) + "/min";
      eff += " · <span style='color:#ff8a8a'>" + seg + "</span>";
    }
    html += '<span class="ars-eff" style="font-size:11px">' + eff + "</span>";
    html += "</div>";
    return html;
  }

  // 把图鉴里的 canvas.ars-ic 按各自 shape/color 绘成真实形状(与游戏内一致;复用 Renderer.drawShapePath)
  function drawBestiaryIcons(wrap) {
    if (!wrap || !wrap.querySelectorAll) return;
    let cans;
    try { cans = wrap.querySelectorAll('canvas.ars-ic'); } catch (e) { return; }
    for (let i = 0; i < cans.length; i++) {
      const cv = cans[i];
      let ctx = null;
      try { ctx = cv.getContext && cv.getContext("2d"); } catch (e) { ctx = null; }
      if (!ctx) continue;
      const shape = cv.getAttribute("data-shape") || "circle";
      const color = cv.getAttribute("data-color") || "#fff";
      if (ctx.clearRect) ctx.clearRect(0, 0, 22, 22);
      ctx.fillStyle = color; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5;
      if (SV.Renderer && SV.Renderer.drawShapePath) {
        SV.Renderer.drawShapePath(ctx, 11, 11, 7, shape);
        if (ctx.fill) ctx.fill();
        if (ctx.stroke) ctx.stroke();
      }
    }
  }

  const Menus = {
    init: function () {
      screens.title = document.getElementById("titleScreen");
      screens.charselect = document.getElementById("charSelectScreen");
      screens.select = document.getElementById("selectScreen");
      screens.pause = document.getElementById("pauseScreen");
      screens.gameover = document.getElementById("gameoverScreen");
      screens.endlessprompt = document.getElementById("endlessPromptScreen");
      // 事件委托:对动态生成的关卡卡同样生效
      document.addEventListener("click", function (ev) {
        const t = ev.target.closest("[data-act]");
        if (t && onActFn) onActFn(t.getAttribute("data-act"), t);
      });
      // 音量滑块(input 事件不走上面的 click 委托,单独挂;class 选择器覆盖标题+暂停两屏)
      function wireVol(selector, kind) {
        const els = document.querySelectorAll(selector);
        for (let i = 0; i < els.length; i++) {
          els[i].addEventListener("input", function () {
            const v = Number(els[i].value) / 100;
            if (kind === "music") SV.Audio.setMusicVol(v);
            else { SV.Audio.setSfxVol(v); SV.Audio.hit(); } // 音效滑块拖动实时预览(throttled)
          });
        }
      }
      wireVol(".vol-music", "music");
      wireVol(".vol-sfx", "sfx");
    },
    onAct: function (fn) { onActFn = fn; },
    show: function (name) {
      for (const k in screens) if (screens[k]) screens[k].classList.add("hidden");
      if (screens[name]) screens[name].classList.remove("hidden");
    },
    hideAll: function () { for (const k in screens) if (screens[k]) screens[k].classList.add("hidden"); },

    // ── 选角界面(4 名角色,点选即进选关)
    showCharSelect: function (sel) {
      const wrap = document.getElementById("charCards");
      const order = SV.Config.CHARACTER_ORDER;
      const cur = sel.char;
      let html = "";
      for (let i = 0; i < order.length; i++) {
        const id = order[i], ch = SV.Config.CHARACTERS[id];
        const startW = SV.Config.weaponDef(ch.startWeapon);
        html += '<button class="card char-card' + (id === cur ? " selected" : "") + '" data-act="pickChar" data-char="' + id + '" style="border-color:' + ch.color + '">';
        html += '<div class="card-icon" style="color:' + ch.color + '">' + ch.icon + "</div>";
        html += '<div class="card-name">' + ch.name + "</div>";
        html += '<div class="card-title">' + ch.title + "</div>";
        html += '<div class="card-desc">' + ch.desc + "</div>";
        html += '<div class="char-stats">';
        html += '<span class="char-chip">HP ×' + ch.hpMul + "</span>";
        html += '<span class="char-chip">移速 ×' + ch.speedMul + "</span>";
        html += '<span class="char-chip">' + (startW.icon || "◆") + " " + startW.name + "</span>";
        for (const pid in ch.startPassives) {
          const pd = SV.Config.PASSIVES[pid];
          html += '<span class="char-chip">' + pd.icon + " " + pd.name + "×" + ch.startPassives[pid] + "</span>";
        }
        html += "</div>";
        const cs = SV.Storage.charSummary(id);
        if (cs.stages > 0) html += '<div class="char-best">✓' + cs.clears + " 通关 · 最佳 " + SV.Util.fmtTime(cs.bestTime) + "</div>";
        html += "</button>";
      }
      wrap.innerHTML = html;
      this.show("charselect");
    },

    // ── 无尽模式确认(通关后弹出)
    showEndlessPrompt: function (state) {
      const t = document.getElementById("endlessInfo");
      if (t) t.textContent = state.stage.name + " · " + SV.Config.DIFFICULTY[state.difficulty].name + " · 存活 " + SV.Util.fmtTime(state.time);
      const s = document.getElementById("endlessStats");
      if (s) s.textContent = "Lv " + state.level + " · ☠ " + state.kills + " · ✦ 进化 " + state.evolutions;
      this.show("endlessprompt");
    },

    // ── 选关界面
    showSelect: function (sel) {
      this.setDiffHighlight(sel.diff);
      const wrap = document.getElementById("selectStages");
      const order = SV.Config.STAGE_ORDER;
      const cur = sel.stage;
      let html = "";
      for (let i = 0; i < order.length; i++) {
        const id = order[i], st = SV.Config.STAGES[id];
        const best = SV.Storage.getBest(id, sel.diff, sel.char);
        const pal = st.palette;
        html += '<button class="card stage-card' + (id === cur ? " selected" : "") + '" data-act="pickStage" data-stage="' + id + '" style="border-color:' + pal.gridStrong + '">';
        html += '<div class="card-icon" style="color:' + (pal.star || "#fff") + '">' + (STAGE_ICON[id] || "◆") + "</div>";
        html += '<div class="card-name">' + st.name + "</div>";
        html += '<div class="card-desc">存活 ' + Math.round(st.goalMin / 60) + " 分钟" + (st.finale ? " · 终局 Boss" : "") + "</div>";
        html += '<div class="stage-best">最佳 ' + SV.Util.fmtTime(best.time) + (best.cleared ? " ✓通关" : "") + "</div>";
        html += "</button>";
      }
      wrap.innerHTML = html;
      this.show("select");
    },
    setDiffHighlight: function (diff) {
      const btns = document.querySelectorAll("[data-diff]");
      for (let i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].getAttribute("data-diff") === diff);
    },

    // ── 结算(失败/胜利)
    setGameOver: function (stats) {
      const title = document.getElementById("goTitle");
      if (title) title.textContent = stats.won ? "通关胜利!" : "你倒下了";
      const sub = document.getElementById("goStage");
      if (sub) sub.textContent = (stats.charName || "") + " · " + stats.stageName + " · " + stats.diffName + (stats.endless ? " · ∞无尽" : "");
      document.getElementById("goTime").textContent = SV.Util.fmtTime(stats.time);
      document.getElementById("goLevel").textContent = stats.level;
      document.getElementById("goKills").textContent = stats.kills;
      document.getElementById("goEvo").textContent = stats.evolutions;
      document.getElementById("goBest").textContent = SV.Util.fmtTime(stats.best);
      const nb = document.getElementById("goNewBest");
      if (nb) { nb.textContent = stats.won ? "★ 通关!★" : "★ 新纪录!★"; nb.style.display = stats.isBest ? "" : "none"; }
      // 每武器伤害明细(进化合并、融合独立),按总伤害降序
      const gw = document.getElementById("goWeapons");
      if (gw) {
        const wd = stats.weaponDamage || {}, wa = stats.weaponActive || {};
        const rows = [];
        for (const id in wd) {
          if (!(wd[id] > 0)) continue;
          const def = SV.Config.weaponDef(id) || SV.Config.WEAPONS[id];
          const active = wa[id] || 0;
          rows.push({ id: id, name: def ? def.name : id, color: def ? def.color : "#fff", icon: def ? (def.icon || "◆") : "◆", total: wd[id], active: active, perMin: active > 0 ? wd[id] / active * 60 : 0 });
        }
        rows.sort(function (a, b) { return b.total - a.total; });
        let h = "";
        if (rows.length) {
          h += '<div class="ars-section"><div class="ars-title">武器伤害明细 · 总伤害 / 每分钟</div>';
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            h += '<div class="ars-row"><span class="ars-ic" style="color:' + r.color + '">' + r.icon + "</span>" +
              '<span class="ars-name">' + r.name + "</span>" +
              '<span class="ars-lv">用时 ' + SV.Util.fmtTime(r.active) + "</span>" +
              '<span class="ars-eff">总伤 ' + fmtNum(r.total) + " · " + fmtNum(r.perMin) + "/min</span></div>";
          }
          h += "</div>";
        }
        gw.innerHTML = h;
      }
    },

    setSoundToggle: function (muted) {
      const on = !muted;
      // 标题屏(旧 #titleSound)+ 暂停屏(.btn-sound-toggle)统一用 class 同步
      const t = document.getElementById("titleSound");
      if (t) { t.textContent = muted ? "🔇 音效:关" : "🔊 音效:开"; t.classList.toggle("on", on); }
      const btns = document.querySelectorAll(".btn-sound-toggle");
      for (let i = 0; i < btns.length; i++) {
        btns[i].textContent = muted ? "🔇 音效:关" : "🔊 音效:开";
        btns[i].classList.toggle("on", on);
      }
    },
    setFxToggle: function (reduced) {
      const t = document.getElementById("titleFx");
      if (t) { t.textContent = reduced ? "🔋 省电:开" : "⚡ 省电:关"; t.classList.toggle("on", reduced); }
      const btns = document.querySelectorAll(".btn-fx-toggle");
      for (let i = 0; i < btns.length; i++) {
        btns[i].textContent = reduced ? "🔋 省电:开" : "⚡ 省电:关";
        btns[i].classList.toggle("on", reduced);
      }
    },
    setAutoToggle: function (enabled) {
      const btns = document.querySelectorAll(".auto-toggle");
      for (let i = 0; i < btns.length; i++) {
        btns[i].textContent = enabled ? "🤖 全自动:开" : "🤖 全自动:关";
        btns[i].classList.toggle("on", !!enabled);
      }
    },
    // 把存档音量回填到所有音量滑块(标题屏 + 暂停屏)
    setVolUI: function (music, sfx) {
      const ms = document.querySelectorAll(".vol-music");
      for (let i = 0; i < ms.length; i++) ms[i].value = Math.round(music * 100);
      const ss = document.querySelectorAll(".vol-sfx");
      for (let i = 0; i < ss.length; i++) ss[i].value = Math.round(sfx * 100);
    },

    // ── 暂停面板:装备 + 基础数值
    populatePause: function (state) {
      const wrap = document.getElementById("pauseArsenal");
      if (!wrap) return;
      // 同步右侧设置开关的当前状态(打开暂停屏的瞬间)
      if (SV.Audio) this.setSoundToggle(SV.Audio.isMuted());
      if (SV.Effects) this.setFxToggle(SV.Effects.isReduced());
      if (SV.Auto) this.setAutoToggle(!!SV.Auto.enabled);
      if (SV.Audio) this.setVolUI(SV.Audio.getMusicVol(), SV.Audio.getSfxVol());
      let html = "";
      // 角色(被动技能说明)
      const ch = SV.Config.CHARACTERS[state.charId];
      if (ch) {
        const startW = SV.Config.weaponDef(ch.startWeapon);
        html += '<div class="ars-section"><div class="ars-title">角色</div>';
        html += '<div class="ars-row"><span class="ars-ic" style="color:' + ch.color + '">' + ch.icon + "</span>" +
          '<span class="ars-name">' + ch.name + " · " + ch.title + "</span>" +
          '<span class="ars-lv">HP ×' + ch.hpMul + " · 移速 ×" + ch.speedMul + "</span></div>";
        html += '<div class="ars-row" style="flex-direction:column;align-items:flex-start;gap:2px">' +
          '<span class="ars-eff" style="font-size:12px;color:var(--dim)">' + ch.desc + "</span>" +
          '<span class="ars-eff" style="font-size:12px">起手:' + (startW.icon || "◆") + " " + startW.name + "</span></div>";
        html += "</div>";
      }
      // 武器
      html += '<div class="ars-section"><div class="ars-title">武器</div>';
      if (!state.weapons.length) html += '<div class="ars-empty">无</div>';
      for (let i = 0; i < state.weapons.length; i++) {
        const w = state.weapons[i], def = SV.Config.weaponDef(w.id);
        const dm = weaponDmg(state, w.id);
        const trait = SV.Upgrades.traitLabel(w.id);
        html += '<div class="ars-row"><span class="ars-ic" style="color:' + def.color + '">' + (def.icon || "◆") + "</span>" +
          '<span class="ars-name">' + def.name + (w.evolved ? ' <i class="evo-star">★</i>' : "") + "</span>" +
          (trait ? '<span class="ars-trait">' + trait + "</span>" : "") +
          '<span class="ars-lv">Lv ' + w.level + "/" + def.max + "</span>" +
          '<span class="ars-eff">' + SV.Upgrades.summary(w, state) + "</span>" +
          (dm.total > 0 ? '<span class="ars-dmg">⚔ ' + fmtNum(dm.total) + " · " + fmtNum(dm.perMin) + "/min</span>" : "") +
          "</div>";
      }
      html += "</div>";
      // 被动
      html += '<div class="ars-section"><div class="ars-title">被动</div>';
      let anyP = false;
      for (const id in state.passives) {
        const lv = state.passives[id];
        if (lv > 0) { anyP = true; const def = SV.Config.PASSIVES[id];
          html += '<div class="ars-row"><span class="ars-ic" style="color:' + def.color + '">' + def.icon + "</span>" +
            '<span class="ars-name">' + def.name + "</span>" + '<span class="ars-lv">Lv ' + lv + "</span>" +
            '<span class="ars-eff">' + def.per + "</span></div>"; }
      }
      if (!anyP) html += '<div class="ars-empty">无</div>';
      html += "</div>";
      // 基础数值
      const m = SV.Entities.mods(state);
      html += '<div class="ars-section"><div class="ars-title">基础数值</div><div class="ars-stats">';
      html += statTile("生命", Math.round(m.maxHp));
      html += statTile("移速", pct(m.speedMul - 1));
      html += statTile("伤害", pct(m.damageMul - 1));
      html += statTile("冷却", "-" + Math.round((1 - m.cdMul) * 100) + "%");
      html += statTile("范围", pct(m.areaMul - 1));
      html += statTile("减伤", "-" + Math.round((1 - m.armorMul) * 100) + "%");
      html += statTile("再生", m.regen + "/s");
      html += statTile("暴击", Math.round(m.critChance * 100) + "%");
      html += statTile("吸血", Math.round(m.lifesteal * 100) + "%");
      html += statTile("拾取", pct(m.pickupMul - 1));
      html += statTile("经验", pct(m.xpMul - 1));
      html += statTile("幸运", pct(m.luck));
      html += "</div></div>";
      // 怪物图鉴(本局已遇到,数值按当前时间实时缩放;附带"对玩家伤害"统计)
      const enc = state.encountered || { enemy: {}, boss: {} };
      const edmg = state.enemyDamage || {};
      const tmin = state.time / 60;
      const showElite = tmin >= 8;
      let encN = 0;
      for (const k in enc.enemy) if (enc.enemy[k] != null) encN++;
      for (const k in enc.boss) if (enc.boss[k] != null) encN++;
      // 计算某 id 的"对玩家每分钟伤害"(自首次出现起算)。firstSeen=首次遇敌秒数,cur=state.time 秒
      function dmgToMe(id, firstSeen) {
        const total = edmg[id] || 0;
        let perMin = 0;
        const fs = Number(firstSeen) || 0;
        if (fs > 0 && state.time > fs) perMin = total / ((state.time - fs) / 60);
        return { total: total, perMin: perMin };
      }
      if (encN > 0) {
        html += '<div class="ars-section"><div class="ars-title">怪物图鉴 · 本局 ' + encN + ' 种' + (showElite ? '(已现精英变异)' : "") + '</div>';
        for (const id in enc.boss) {
          if (enc.boss[id] == null) continue;
          const def = SV.Config.BOSSES[id]; if (!def) continue;
          const cur = SV.Entities.previewBoss(id, state); if (!cur) continue;
          html += bestiaryRow(def, cur, false, dmgToMe(id, enc.boss[id]), true);
        }
        for (const id in enc.enemy) {
          if (enc.enemy[id] == null) continue;
          const def = SV.Config.ENEMIES[id]; if (!def) continue;
          const cur = SV.Entities.previewEnemy(id, state); if (!cur) continue;
          html += bestiaryRow(def, cur, showElite, dmgToMe(id, enc.enemy[id]), false);
        }
        html += "</div>";
      }
      wrap.innerHTML = html;
      drawBestiaryIcons(wrap);
    }
  };

  SV.Menus = Menus;
})();
