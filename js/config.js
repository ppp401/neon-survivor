// config.js — SV.Config: 全部数值/内容表(数据驱动)。所有平衡只改这里。
(function () {
  "use strict";
  const SV = window.SV;
  const U = SV.Util;

  const CONST = {
    FIXED_DT: 1 / 60,
    MAX_FRAME: 0.25,
    MAX_STEPS: 5,
    // 实体上限(满则停刷,防失控)
    MAX_ENEMIES: 600,
    MAX_PROJECTILES: 1200,
    MAX_PARTICLES: 600,
    MAX_GEMS: 260,
    MAX_FLOATERS: 80,
    MAX_HAZARDS: 40,
    MAX_WEAPONS: 6,
    // 玩家
    PLAYER_BASE_HP: 120,
    PLAYER_BASE_SPEED: 165, // 略快于一切追逐者
    PLAYER_RADIUS: 14,
    PICKUP_RADIUS: 72,
    GEM_COLLECT_RADIUS: 20, // 经验球拾取半径(中心距)
    GEM_PULL_BASE: 540,     // 经验球远场牵引速度上限(受磁吸属性放大)
    GEM_PULL_NEAR_K: 10,    // 经验球近场牵引速度系数(速度 = d * K,随距离线性衰减防过冲)
    IFRAME: 0.85, // 受击无敌秒数
    REGEN_INTERVAL: 1, // 回血结算间隔
    LIFESTEAL_CAP: 0.05, // 吸血每秒回血上限(占最大生命比例)。属性上限仍 10%,治疗上限降到 5%/s 以防后期站撸
    // 无尽模式
    ENDLESS_BOSS_EVERY: 60, // 无尽模式 Boss 波间隔(秒)= 1min(且 Boss 不掉宝箱)
    ENDLESS_HP_PER_MIN: 0.18, // 无尽模式每分钟额外敌血倍率
    // 14min 后周期多 Boss 波:分档加密(非无尽)。每波 2-3 只随机 Boss 同台
    LATE_BOSS_AFTER: 14 * 60, // 周期波起始时间(秒)
    LATE_BOSS_TIERS: [         // 时间→间隔(秒)分档:14-17min@1.5min,17-19min@1min,19min+@30s
      { after: 14 * 60, every: 90 },
      { after: 17 * 60, every: 60 },
      { after: 19 * 60, every: 30 }
    ],
    // 空间网格
    CELL: 48,
    // 定点轰炸索敌(时停/陨石):避开玩家近旁的最小距离(让出近战范围,索敌中远敌群)
    AIM_MIN_DIST: 200,
    // 变羊敌人随机游走速度(px/s,中等)
    SHEEP_SPEED: 90,
    // 控制类效果(冻结/变羊/减速/时停)对 Boss 的时长倍率(大幅削减)
    CC_BOSS_MUL: 0.25,
    // 刷怪
    SPAWN_RING_PAD: 70, // 屏外环形生成余量
    SWARM_EVERY: 90, // 集群波间隔(秒)
    SWARM_COUNT: 7,
    // 武器/被动
    WEAPON_MAX: 8,           // 武器满级(进化阈值,不设溢出)
    PASSIVE_MAX: 5,          // 被动设计满级(进化阈值)
    PASSIVE_MAX_LEVEL: 99,   // 被动实际可升级上限(收益递减)
    // 经验
    XP_START_WEAPON: "blade",
    // Boss 宝箱固定经验(不吃等级成长:后期多 Boss 波不再爆级;仍受磁吸经验加成)
    TREASURE_XP: 400
  };

  // 全自动模式参数(SV.Auto 用,数据驱动便于调参)
  const AUTO = {
    SENSE: 300,        // 敌人感知半径(px,queryCircle)
    OPEN: 600,         // 开放方向跑道封顶(须 > 最远挡道 clearance≈SENSE+R;消除斜向远墙角虚高)
    SAFE_RUNWAY: 135,  // 跑道"够用即饱和":评分里 runway 贡献封顶于此(>此值再远也没用),让 ENGAGE/拾取能在安全时把玩家拉离纯逃跑
    DIRS: 16,          // 采样方向数
    ELEAD: 0.10,       // 敌人速度前探时间(s,处理 charger/快速追逐者)
    ESHOT_LEAD: 0.18,  // 敌弹前探时间(s)
    ESHOT_W: 2.0,      // 敌弹权重(穿 i-frame,放大紧约束)
    HAZARD_W: 2.5,     // 危险区权重(穿 i-frame)
    HAZARD_PAD: 10,    // 危险区额外半径(圈外时)
    HAZARD_W_IN: 1.2,  // 已身处危险区实际伤害圈内时的降权(膨胀圈互相重叠会封死所有跑道→误判被围、原地抽搐)
    HAZARD_ESC: 90,    // 危险区逃离偏置(px 当量:身陷伤害圈内时沿出口方向强推,压过宝石/拾取吸引)
    BOMBER_PAD: 26,    // bomber 死亡 AOE 额外半径
    BOSS_PAD: 46,      // boss 接触额外半径(大 Boss r=44-50,需厚避让垫)
    BOSS_W: 3.0,       // boss 基础权重(按 dmg 自适应:×(0.6+dmg/50),介于 eshots 与 bomber)
    BOSS_SENSE: 520,   // boss 专用感知半径(普通敌仍用 SENSE;远距即可察觉大 Boss)
    BOSS_PULL_W: 1.6,  // 磁暴行者 pull 期间权重乘子(对抗引力,主动反推)
    BEAM_R: 26,        // 注入巨像激光伪威胁的单点半径(把光束当墙绕开)
    BOSS_FEAR: 280,    // boss 逼近恐惧半径:boss 净空<此值时启动 boss flee 偏置(对抗磁暴引力)
    BOSS_ESC_R: 130,   // boss 贴身逃离半径:最近 boss 净空<此值时沿远离方向强推(修贴 Boss 抖动/停留)
    BOSS_ESC: 110,     // boss 贴身逃离偏置(px 当量,>GEM 满值,压过宝石/掉落吸引)
    BOSS_LOOT_PAD: 80, // boss 周身拾取安全垫:此范围内的宝石/掉落不吸引(Boss 尸体爆的宝石不该把 AI 拉回贴脸)
    FLEE: 80,          // 远离敌群偏置(px 当量,主项:拉开距离避免被包)
    ORBIT: 20,         // 环绕偏置(px 当量,辅项:轻微绕行避免直冲墙角)
    STICK: 15,         // 航向粘滞(px 当量,防抖)
    SAFE: 80,         // 净空阈值(px):最近敌净空≥SAFE 时 FLEE 衰减为 0(转环绕/拾取,不再贴墙逃跑)
    ENGAGE: 22,       // 贴脸攻击偏置(px 当量):最近敌距离>武器射程时,朝最近敌靠近(够得着打;弱于跑道/逃命安全项)
    ENGAGE_FAR: 1.2,  // 距离> Rw×此值 才触发 ENGAGE(留一段"射程内自由环行"带)
    ENGAGE_MIN: 100,  // 武器射程需≥此值才 ENGAGE(短射程 L1 近战贴脸=送死,转纯风筝)
    BREAKOUT: 92,     // 被围判定:最佳+次佳跑道都<此值才真被围→启动突围(冲最长净空方向)
    BREAKOUT_BOOST: 3.0, // 突围时跑道权重倍子(放大"最长净空"决定性,压过环行/逃逸)
    BREAKOUT_STICK: 2.5, // 突围航向粘滞倍子(锁定突围方向,防抖防原地打转)
    GEM: 60,           // 宝石吸引(px 当量,安全方向间偏向宝石簇)
    GEM_SENSE: 420,    // 宝石感知半径(px)
    SPEC: 90,          // 特殊掉落基础吸引(px 当量)
    SPEC_HEALTH: 1.6,  // health 情境系数(×缺血程度;濒血时极高)
    SPEC_MAGNET: 0.02, // magnet 系数(×场上宝石数)
    SPEC_BOMB: 0.5,    // bomb 系数(×近身敌数;被围时极高=清场+爆宝石)
    SPEC_TREASURE: 1.2,// treasure 系数(随等级的 XP 包)
    LV_DELAY: 1000,    // 自动选卡展示时长(ms,用户要求 ~1s)
    LV_FAST: 220,      // 多重升级级联时展示时长(ms,避免总停顿过长)
    TOGGLE_KEY: "o"    // 开关键(另设 HUD 按钮)
  };

  // 霓虹配色(色相)
  const COLORS = {
    bg0: "#070611",
    bg1: "#0d0a22",
    grid: "rgba(120,90,220,0.10)",
    gridStrong: "rgba(150,110,255,0.16)",
    player: "#9be7ff",
    playerCore: "#ffffff",
    xp: "#7CFFB2",
    hp: "#ff5d73",
    gold: "#ffd86b",
    rarity: { common: "#cdd3ff", rare: "#5ad1ff", epic: "#c06bff", legend: "#ffb14d" }
  };

  // ── 武器(16 种)。每个 def 暴露 stats(level) 返回该等级基础数值(未应用被动)。
  const WEAPONS = {
    blade: {
      name: "旋转光刃", icon: "✺", color: "#8ef0ff", max: 8, kind: "orbit",
      desc: "光刃环绕身周,接触造成伤害。",
      tags: ["melee"],
      stats: function (lv) {
        return { damage: 10 + (lv - 1) * 2.6, count: 2 + Math.floor((lv - 1) / 2), radius: 70 + (lv - 1) * 8, spin: 2.0 + (lv - 1) * 0.3 };
      }
    },
    missile: {
      name: "追踪导弹", icon: "➤", color: "#ffb24d", max: 8, kind: "missile",
      desc: "锁定最近敌人发射追踪弹。",
      tags: ["ranged"],
      stats: function (lv) {
        return { damage: 11 + (lv - 1) * 2.7, cooldown: Math.max(0.65, 1.5 - (lv - 1) * 0.12), count: 1 + (lv >= 4 ? 1 : 0) + (lv >= 7 ? 1 : 0), speed: 260, seek: 120, life: 2.6, chase: 1 + Math.floor((lv - 1) / 3) };
      }
    },
    chain: {
      name: "连锁闪电", icon: "⚡", color: "#b6a6ff", max: 8, kind: "chain",
      desc: "电击最近敌人并向周围跳跃。",
      tags: ["spell"],
      stats: function (lv) {
        return { damage: 11.5 + (lv - 1) * 4, cooldown: Math.max(0.9, 1.4 - (lv - 1) * 0.07), chains: 2 + Math.floor((lv - 1) / 2), range: 185 };
      }
    },
    aura: {
      name: "等离子光环", icon: "◎", color: "#a78bfa", max: 8, kind: "aura",
      desc: "周身伤害力场,周期灼烧。",
      tags: ["melee"],
      stats: function (lv) {
        return { damage: 6 + (lv - 1) * 1.4, radius: 65 + (lv - 1) * 12, tick: Math.max(0.11, 0.42 - (lv - 1) * 0.045) };
      }
    },
    shotgun: {
      name: "霰弹散射", icon: "≣", color: "#ffd86b", max: 8, kind: "shotgun",
      desc: "朝最近敌人方向发射锥形弹丸。",
      tags: ["ranged"],
      stats: function (lv) {
        return { damage: 10 + (lv - 1) * 2.6, count: 4 + (lv - 1), cooldown: Math.max(0.6, 1.4 - (lv - 1) * 0.1), speed: 330, life: 0.85, cone: (35 + (lv - 1) * 3) * Math.PI / 180 };
      }
    },
    frost: {
      name: "冰霜新星", icon: "❄", color: "#7cdfff", max: 8, kind: "frost",
      desc: "周期性冰爆,减速范围内敌人。",
      tags: ["spell"],
      stats: function (lv) {
        return { damage: 7.5 + (lv - 1) * 2.6, radius: 110 + (lv - 1) * 15, cooldown: Math.max(0.8, 1.6 - (lv - 1) * 0.1), slow: Math.min(0.75, 0.4 + (lv - 1) * 0.05), slowDur: 1.5 + (lv - 1) * 0.1, expand: 620 };
      }
    },
    lance: {
      name: "贯穿激光", icon: "⟶", color: "#ff7eb6", max: 8, kind: "lance",
      desc: "环绕玩家旋转的贯穿激光,触碰的敌人受创一次(一次触碰仅一次,离开后再触碰可再触发)。判定为一条线,靠敌人自身体积触发。",
      tags: ["ranged"],
      stats: function (lv) {
        return { damage: 14 + (lv - 1) * 2.6, spin: 1.8 + (lv - 1) * 0.15, length: 175 + (lv - 1) * 20, width: 6 };
      }
    },
    boomerang: {
      name: "霓虹回旋镖", icon: "✦", color: "#5ad1ff", max: 8, kind: "boomerang",
      desc: "抛出回旋镖,去返皆伤敌(自动瞄准最近敌人)。",
      tags: ["ranged"],
      stats: function (lv) {
        return { damage: 16 + (lv - 1) * 4, count: 1 + (lv >= 3 ? 1 : 0) + (lv >= 6 ? 1 : 0), cooldown: Math.max(0.7, 1.5 - (lv - 1) * 0.08), speed: 350, life: 1.6, spin: 14 };
      }
    },
    grenade: {
      name: "榴弹炮", icon: "✸", color: "#ff9a3c", max: 8, kind: "grenade",
      desc: "抛射榴弹至最近敌人位置,爆炸范围伤害。",
      tags: ["ranged"],
      stats: function (lv) {
        return { damage: 10 + (lv - 1) * 3, cooldown: Math.max(0.8, 1.8 - (lv - 1) * 0.12), count: 1 + (lv >= 3 ? 1 : 0) + (lv >= 6 ? 1 : 0), radius: 74 + (lv - 1) * 8, speed: 300, life: 1.2 };
      }
    },
    railgun: {
      name: "轨道炮", icon: "⟹", color: "#ff5d73", max: 8, kind: "railgun",
      desc: "蓄能射出超高伤贯穿弹,直线穿透所有敌人。",
      tags: ["ranged"],
      stats: function (lv) {
        return { damage: 36 + (lv - 1) * 12, cooldown: Math.max(1.6, 3.4 - (lv - 1) * 0.22), speed: 900 };
      }
    },
    poison: {
      name: "剧毒云", icon: "☣", color: "#9bff5a", max: 8, kind: "poison",
      desc: "向附近敌人注入剧毒,持续掉血。",
      tags: ["spell"],
      stats: function (lv) {
        return { damage: 6.5 + (lv - 1) * 1.8, cooldown: Math.max(0.8, 1.6 - (lv - 1) * 0.1), radius: 130 + (lv - 1) * 10, dot: 6.5 + (lv - 1) * 1.8, dotDur: 2.5 + (lv - 1) * 0.2 };
      }
    },
    vortex: {
      name: "龙卷风", icon: "✯", color: "#7df9ff", max: 8, kind: "vortex",
      desc: "召唤游走龙卷,吸引并撕裂附近敌人。",
      tags: ["spell"],
      stats: function (lv) {
        return { damage: 2.5 + (lv - 1) * 1, cooldown: Math.max(1.5, 3.2 - (lv - 1) * 0.2), radius: 58 + (lv - 1) * 6, speed: 140, life: 1.5 + (lv - 1) * 0.2, pull: 170 };
      }
    },
    sentry: {
      name: "哨卫炮塔", icon: "⌖", color: "#ffd86b", max: 8, kind: "sentry",
      desc: "部署环绕炮塔,自动射击最近敌人。",
      tags: ["ranged"],
      stats: function (lv) {
        return { damage: 8 + (lv - 1) * 2.4, count: 1 + (lv >= 3 ? 1 : 0) + (lv >= 6 ? 1 : 0), fireCd: Math.max(0.5, 0.85 - (lv - 1) * 0.06), radius: 115, projSpeed: 380, spin: 1.0 + (lv - 1) * 0.15, interceptR: 26 + (lv - 1) * 2 };
      }
    },
    meteor: {
      name: "陨石", icon: "☄", color: "#ff7a3c", max: 8, kind: "meteor",
      desc: "锁定附近敌群最密集处,天降陨石,延迟爆炸。",
      tags: ["spell"],
      stats: function (lv) {
        return { damage: 21 + (lv - 1) * 4.5, radius: 52 + (lv - 1) * 6, cooldown: Math.max(2.9, 3.6 - (lv - 1) * 0.1), arm: 0.55, count: 1 + (lv >= 4 ? 1 : 0) + (lv >= 7 ? 1 : 0), burn: 0, burnDur: 0 };
      }
    },
    shockwave: {
      name: "冲击波", icon: "◎", color: "#8be9ff", max: 8, kind: "shockwave",
      desc: "朝最近敌人挥出冲击扇形,击退并伤害范围内敌人。",
      tags: ["melee"],
      stats: function (lv) {
        return { damage: 8 + (lv - 1) * 2.5, radius: 110 + (lv - 1) * 9, cooldown: Math.max(0.9, 1.8 - (lv - 1) * 0.12), count: 1 + (lv >= 4 ? 1 : 0), arc: 0.85 + (lv - 1) * 0.03, knock: 22 + (lv - 1) * 3 };
      }
    },
    hex: {
      name: "诅咒", icon: "✟", color: "#b06bff", max: 8, kind: "hex",
      desc: "锁定视野内血量最高的敌人(优先Boss),延迟引爆:百分比最大生命伤害 + 伤害下限,目标被提前击杀则诅咒蔓延。",
      tags: ["spell"],
      stats: function (lv) {
        return { damage: 10 + (lv - 1) * 3, frac: Math.min(0.12, 0.05 + (lv - 1) * 0.01), count: 1 + Math.floor((lv - 1) / 2), spread: 2 + Math.floor((lv - 1) / 3), delay: 1.6, cooldown: Math.max(0.9, 1.8 - (lv - 1) * 0.1) };
      }
    },
    crescent: {
      name: "月牙斩", icon: "☾", color: "#9bf0c0", max: 8, kind: "crescent",
      desc: "朝最近敌人挥出大扇形弧刃,横扫范围内敌人。",
      tags: ["melee"],
      stats: function (lv) {
        return { damage: 21 + (lv - 1) * 6.1, cooldown: Math.max(0.7, 1.4 - (lv - 1) * 0.07), radius: 95 + (lv - 1) * 9, arc: 1.5 + (lv - 1) * 0.06, count: 1 + (lv >= 4 ? 1 : 0) };
      }
    },
    detonate: {
      name: "殉爆重击", icon: "❋", color: "#ff8a4c", max: 8, kind: "detonate",
      desc: "挥砍命中按概率以敌人为圆心引爆,造成范围爆炸。",
      tags: ["melee"],
      stats: function (lv) {
        return { damage: 14 + (lv - 1) * 3, cooldown: Math.max(0.9, 1.7 - (lv - 1) * 0.08), count: 1 + (lv >= 4 ? 1 : 0) + (lv >= 7 ? 1 : 0), radius: 85 + (lv - 1) * 8, arc: 1.2 + (lv - 1) * 0.05, explodeChance: Math.min(0.8, 0.35 + (lv - 1) * 0.06), explodeR: 50 + (lv - 1) * 5, explodeDmg: 22 + (lv - 1) * 5 };
      }
    },
    spear: {
      name: "贯穿战矛", icon: "➹", color: "#ffd27a", max: 8, kind: "spear",
      desc: "向前突刺长矛,窄锥贯穿沿途所有敌人,高单体爆发。",
      tags: ["melee"],
      stats: function (lv) {
        return { damage: 28 + (lv - 1) * 6.8, cooldown: Math.max(0.8, 1.5 - (lv - 1) * 0.08), radius: 130 + (lv - 1) * 14, arc: 0.32 };
      }
    },
    polymorph: {
      name: "变形术", icon: "☁", color: "#ffe9a8", max: 8, kind: "polymorph",
      desc: "发射追踪弹,命中敌人变羊:期间随机游走、不能攻击、无接触伤害,且受伤增加。弹体穿过已变羊的目标,只打新鲜敌人。",
      tags: ["spell"],
      stats: function (lv) {
        return { damage: 6 + (lv - 1) * 1.4, cooldown: Math.max(1.7, 3.6 - (lv - 1) * 0.22), count: 1 + Math.floor(lv / 2), dur: 2.8 + (lv - 1) * 0.35, speed: 260, life: 2.7 };
      }
    },
    timestop: {
      name: "时停力场", icon: "◷", color: "#bfe9ff", max: 8, kind: "timestop",
      desc: "锁定敌群密集处,天降时停力场,延迟落地冻结范围内敌人(冻结者不动不射弹,但仍有接触伤害)。",
      tags: ["spell"],
      stats: function (lv) {
        return { damage: 9.5 + (lv - 1) * 2.8, cooldown: Math.max(2.6, 4.9 - (lv - 1) * 0.3), radius: 58 + (lv - 1) * 6.5, freeze: 1.0 + (lv - 1) * 0.13, arm: 0.6, count: 1 + (lv >= 3 ? 1 : 0) + (lv >= 6 ? 1 : 0) };
      }
    }
  };

  // 进化(16 对)。reqPassive 必须满级,武器满级,则在升级时以高优先级出现。
  const EVOLUTIONS = {
    blade: { to: "blade_evo", name: "死亡之轮", reqPassive: "maxhp", desc: "8 刃 +50% 半径,刃下留下灼烧地带。", color: "#ffd0a0", icon: "☀" },
    missile: { to: "missile_evo", name: "聚能核弹", reqPassive: "damage", desc: "少而强的穿透核弹:击杀后继续追猎(伤害递减),靠飞行时限收敛。", color: "#ff9a3c", icon: "✸" },
    chain: { to: "chain_evo", name: "特斯拉风暴", reqPassive: "cooldown", desc: "连跳 8 次,每跳伤害递增。", color: "#d0c4ff", icon: "⚟" },
    aura: { to: "aura_evo", name: "黑洞光环", reqPassive: "area", desc: "吸入敌人、半径+30%、破甲。", color: "#c084fc", icon: "◉" },
    frost: { to: "frost_evo", name: "绝对零度", reqPassive: "speed", desc: "命中冻结 0.6s,冻结时受伤+50%(冻结者仍有接触伤害)。", color: "#a8f0ff", icon: "❅" },
    boomerang: { to: "boomerang_evo", name: "风暴手里剑", reqPassive: "crit", desc: "扇形掷出 5 发穿透回旋。", color: "#7df9ff", icon: "✪" },
    shotgun: { to: "shotgun_evo", name: "双管歼灭", reqPassive: "magnet", desc: "弹丸数翻倍、锥角扩大、可穿透 1 次。", color: "#ffe066", icon: "≣" },
    lance: { to: "lance_evo", name: "分裂激光", reqPassive: "armor", desc: "两道相隔 180° 的环绕激光,旋转较慢,线上敌人每 0.1s 持续受创(多次伤害)。", color: "#ff6b9d", icon: "⇶" },
    grenade: { to: "grenade_evo", name: "集束炸弹", reqPassive: "regen", desc: "爆炸时分裂出 3 颗子弹药。", color: "#ffb300", icon: "✺" },
    railgun: { to: "railgun_evo", name: "爆裂贯穿", reqPassive: "luck", desc: "贯穿命中时产生小范围爆炸。", color: "#ff3d5a", icon: "⟹" },
    poison: { to: "poison_evo", name: "剧毒瘟疫", reqPassive: "crit", desc: "剧毒传染给附近敌人并减速,持续伤害更高。", color: "#b6ff5a", icon: "☣" },
    vortex: { to: "vortex_evo", name: "风暴之眼", reqPassive: "lifesteal", desc: "召唤双龙卷、吸力大增、留下伤害场。", color: "#9affff", icon: "✺" },
    sentry: { to: "sentry_evo", name: "火力堡垒", reqPassive: "area", desc: "炮塔更多、射速更快、子弹穿透。", color: "#ffe066", icon: "⌖" },
    meteor: { to: "meteor_evo", name: "星陨", reqPassive: "area", desc: "多陨齐落、范围更大,落地留下焦土持续灼烧敌群。", color: "#ffb14d", icon: "☄" },
    shockwave: { to: "shockwave_evo", name: "共振冲击", reqPassive: "cooldown", desc: "扇形更多、击退更猛、命中冰冻。", color: "#bdeeff", icon: "◎" },
    hex: { to: "hex_evo", name: "天罚瘟疫", reqPassive: "crit", desc: "标记更多、蔓延更广、引爆更快。", color: "#c89bff", icon: "✟" },
    crescent: { to: "crescent_evo", name: "满月斩", reqPassive: "lifesteal", desc: "弧刃更宽更多,挥砍留下伤害弧地。", color: "#c8f7d8", icon: "☾" },
    detonate: { to: "detonate_evo", name: "连环殉爆", reqPassive: "crit", desc: "爆炸必触发且范围更大,并可连环引爆邻居。", color: "#ffb070", icon: "❋" },
    spear: { to: "spear_evo", name: "破甲贯刺", reqPassive: "damage", desc: "突刺更长更狠,命中破甲(短暂易伤)。", color: "#ffe09a", icon: "➹" },
    polymorph: { to: "polymorph_evo", name: "贯穿变形", reqPassive: "area", desc: "弹更多、变更久,每发命中后可穿透再变一只。", color: "#fff0c0", icon: "☁" },
    timestop: { to: "timestop_evo", name: "绝对静止", reqPassive: "cooldown", desc: "多场齐落、范围更大、冻者碎裂额外受伤(冻结者不动不射弹,但仍有接触伤害)。", color: "#d6f3ff", icon: "◷" }
  };
  // 进化后的武器用同名 _evo def(继承数值,kind 行为增强)。在 weapons.js 中以 evolved 标记处理。
  const WEAPON_EVOS = {
    blade_evo: Object.assign({}, WEAPONS.blade, { name: EVOLUTIONS.blade.name, color: EVOLUTIONS.blade.color, icon: EVOLUTIONS.blade.icon, evo: true, stats: function (lv) { const s = WEAPONS.blade.stats(8); return { damage: s.damage + 20, count: 8, radius: s.radius * 1.5, spin: s.spin + 1.0 }; } }),
    missile_evo: Object.assign({}, WEAPONS.missile, { name: EVOLUTIONS.missile.name, color: EVOLUTIONS.missile.color, icon: EVOLUTIONS.missile.icon, evo: true, desc: "少而强的穿透核弹:击杀后继续追猎(伤害递减),靠飞行时限自然收敛。", stats: function (lv) { const s = WEAPONS.missile.stats(8); return Object.assign({}, s, { damage: 130, cooldown: 1.9, count: 3, chase: 99 }); } }),
    chain_evo: Object.assign({}, WEAPONS.chain, { name: EVOLUTIONS.chain.name, color: EVOLUTIONS.chain.color, icon: EVOLUTIONS.chain.icon, evo: true, stats: function (lv) { const s = WEAPONS.chain.stats(8); return Object.assign({}, s, { damage: s.damage + 8, chains: 99, range: s.range + 60 }); } }),
    aura_evo: Object.assign({}, WEAPONS.aura, { name: EVOLUTIONS.aura.name, color: EVOLUTIONS.aura.color, icon: EVOLUTIONS.aura.icon, evo: true, stats: function (lv) { const s = WEAPONS.aura.stats(8); return { damage: s.damage + 10, radius: s.radius * 1.3, tick: 0.2, pull: 210, breach: true }; } }),
    frost_evo: Object.assign({}, WEAPONS.frost, { name: EVOLUTIONS.frost.name, color: EVOLUTIONS.frost.color, icon: EVOLUTIONS.frost.icon, evo: true, stats: function (lv) { const s = WEAPONS.frost.stats(8); return Object.assign({}, s, { damage: s.damage + 4, freeze: 0.6, freezeVuln: 1.5, slow: 0.8 }); } }),
    boomerang_evo: Object.assign({}, WEAPONS.boomerang, { name: EVOLUTIONS.boomerang.name, color: EVOLUTIONS.boomerang.color, icon: EVOLUTIONS.boomerang.icon, evo: true, stats: function (lv) { const s = WEAPONS.boomerang.stats(8); return Object.assign({}, s, { damage: s.damage + 38, count: 5, pierce: true }); } }),
    shotgun_evo: Object.assign({}, WEAPONS.shotgun, { name: EVOLUTIONS.shotgun.name, color: EVOLUTIONS.shotgun.color, icon: EVOLUTIONS.shotgun.icon, evo: true, stats: function (lv) { const s = WEAPONS.shotgun.stats(8); return Object.assign({}, s, { damage: s.damage - 6, count: s.count * 2, cone: s.cone * 1.4, pierce: 1 }); } }),
    lance_evo: Object.assign({}, WEAPONS.lance, { name: EVOLUTIONS.lance.name, color: EVOLUTIONS.lance.color, icon: EVOLUTIONS.lance.icon, evo: true, stats: function (lv) { const s = WEAPONS.lance.stats(8); return Object.assign({}, s, { damage: s.damage + 4, beams: 2, spin: 1.74, width: 8, tick: 0.1, length: Math.round(s.length * 1.15) }); } }),
    grenade_evo: Object.assign({}, WEAPONS.grenade, { name: EVOLUTIONS.grenade.name, color: EVOLUTIONS.grenade.color, icon: EVOLUTIONS.grenade.icon, evo: true, stats: function (lv) { const s = WEAPONS.grenade.stats(8); return Object.assign({}, s, { damage: s.damage + 15, count: s.count + 1, cluster: 2 }); } }),
    railgun_evo: Object.assign({}, WEAPONS.railgun, { name: EVOLUTIONS.railgun.name, color: EVOLUTIONS.railgun.color, icon: EVOLUTIONS.railgun.icon, evo: true, stats: function (lv) { const s = WEAPONS.railgun.stats(8); return Object.assign({}, s, { damage: s.damage + 20, explode: 70 }); } }),
    poison_evo: Object.assign({}, WEAPONS.poison, { name: EVOLUTIONS.poison.name, color: EVOLUTIONS.poison.color, icon: EVOLUTIONS.poison.icon, evo: true, stats: function (lv) { const s = WEAPONS.poison.stats(8); return Object.assign({}, s, { dot: s.dot + 16, dotDur: s.dotDur + 1.5, spread: true, slow: 0.35, slowDur: 1.5 }); } }),
    vortex_evo: Object.assign({}, WEAPONS.vortex, { name: EVOLUTIONS.vortex.name, color: EVOLUTIONS.vortex.color, icon: EVOLUTIONS.vortex.icon, evo: true, stats: function (lv) { const s = WEAPONS.vortex.stats(8); return Object.assign({}, s, { count: 2, damage: s.damage + 1.5, life: s.life * 4 / 3, pull: s.pull + 130, radius: s.radius * 1.25 }); } }),
    sentry_evo: Object.assign({}, WEAPONS.sentry, { name: EVOLUTIONS.sentry.name, color: EVOLUTIONS.sentry.color, icon: EVOLUTIONS.sentry.icon, evo: true, stats: function (lv) { const s = WEAPONS.sentry.stats(8); return Object.assign({}, s, { damage: s.damage + 10, count: s.count + 1, fireCd: Math.max(0.32, s.fireCd - 0.2), pierce: 1, spin: s.spin + 0.6, interceptR: s.interceptR + 8 }); } }),
    meteor_evo: Object.assign({}, WEAPONS.meteor, { name: EVOLUTIONS.meteor.name, color: EVOLUTIONS.meteor.color, icon: EVOLUTIONS.meteor.icon, evo: true, stats: function (lv) { const s = WEAPONS.meteor.stats(8); return Object.assign({}, s, { damage: s.damage + 6, count: s.count + 2, radius: Math.round(s.radius * 1.25), burn: 22, burnDur: 2.8 }); } }),
    shockwave_evo: Object.assign({}, WEAPONS.shockwave, { name: EVOLUTIONS.shockwave.name, color: EVOLUTIONS.shockwave.color, icon: EVOLUTIONS.shockwave.icon, evo: true, stats: function (lv) { const s = WEAPONS.shockwave.stats(8); return Object.assign({}, s, { damage: s.damage + 5, count: s.count + 1, radius: Math.round(s.radius * 1.25), knock: s.knock + 28, freeze: 0.4 }); } }),
    hex_evo: Object.assign({}, WEAPONS.hex, { name: EVOLUTIONS.hex.name, color: EVOLUTIONS.hex.color, icon: EVOLUTIONS.hex.icon, evo: true, stats: function (lv) { const s = WEAPONS.hex.stats(8); return Object.assign({}, s, { damage: s.damage + 6, count: s.count + 2, spread: s.spread + 2, frac: Math.min(0.15, s.frac + 0.03), delay: Math.max(0.8, s.delay - 0.4) }); } }),
    crescent_evo: Object.assign({}, WEAPONS.crescent, { name: EVOLUTIONS.crescent.name, color: EVOLUTIONS.crescent.color, icon: EVOLUTIONS.crescent.icon, evo: true, stats: function (lv) { const s = WEAPONS.crescent.stats(8); return { damage: s.damage - 14, count: s.count + 1, radius: Math.round(s.radius * 1.2), arc: s.arc + 0.4, cooldown: s.cooldown, leaveTrail: true }; } }),
    detonate_evo: Object.assign({}, WEAPONS.detonate, { name: EVOLUTIONS.detonate.name, color: EVOLUTIONS.detonate.color, icon: EVOLUTIONS.detonate.icon, evo: true, stats: function (lv) { const s = WEAPONS.detonate.stats(8); return Object.assign({}, s, { damage: s.damage + 6, count: (s.count || 1) + 1, explodeChance: 0.9, explodeDmg: s.explodeDmg + 8, explodeR: s.explodeR + 10, chainHops: 2 }); } }),
    spear_evo: Object.assign({}, WEAPONS.spear, { name: EVOLUTIONS.spear.name, color: EVOLUTIONS.spear.color, icon: EVOLUTIONS.spear.icon, evo: true, stats: function (lv) { const s = WEAPONS.spear.stats(8); return { damage: s.damage - 6, radius: Math.round(s.radius * 1.3), arc: s.arc, armorBreak: 1.5 }; } }),
    polymorph_evo: Object.assign({}, WEAPONS.polymorph, { name: EVOLUTIONS.polymorph.name, color: EVOLUTIONS.polymorph.color, icon: EVOLUTIONS.polymorph.icon, evo: true, stats: function (lv) { const s = WEAPONS.polymorph.stats(8); return Object.assign({}, s, { damage: s.damage + 2, count: s.count + 1, dur: s.dur + 1.5, pierce: 1 }); } }),
    timestop_evo: Object.assign({}, WEAPONS.timestop, { name: EVOLUTIONS.timestop.name, color: EVOLUTIONS.timestop.color, icon: EVOLUTIONS.timestop.icon, evo: true, stats: function (lv) { const s = WEAPONS.timestop.stats(8); return Object.assign({}, s, { damage: s.damage + 6, radius: Math.round(s.radius * 1.25), freeze: s.freeze + 0.6, count: s.count + 1, shatter: true }); } }),
    // ── 协同进化(两把已进化武器合成)。kind:"fusion" 由 weapons.js 分发双机制。
    blade_aura: Object.assign({}, WEAPONS.blade, { name: "湮灭之轮", color: "#ffd0a0", icon: "☀", evo: true, kind: "fusion", fuse: ["blade_evo", "aura_evo"], stats: function (lv) { const s = WEAPONS.blade.stats(8); return { damage: s.damage + 18, count: 8, radius: s.radius * 1.6, spin: s.spin + 1.2, splash: 26, splashMul: 0.6, pull: 150 }; } }),
    missile_chain: Object.assign({}, WEAPONS.missile, { name: "雷暴蜂群", color: "#ff9a3c", icon: "⚡", evo: true, kind: "fusion", tags: ["ranged", "spell"], fuse: ["missile_evo", "chain_evo"], stats: function (lv) { const s = WEAPONS.missile.stats(8); return { damage: 34, cooldown: 0.9, count: 5, speed: 300, seek: 5, life: 2.2, chase: 2, chainHops: 3, chainRange: 180 }; } }),
    railgun_grenade: Object.assign({}, WEAPONS.railgun, { name: "轨道轰炸", color: "#ff5d73", icon: "☄", evo: true, kind: "fusion", fuse: ["railgun_evo", "grenade_evo"], stats: function (lv) { const s = WEAPONS.railgun.stats(8); return Object.assign({}, s, { damage: s.damage + 52, cooldown: 1.6, explode: 58, cluster: 2 }); } }),
    frost_poison: Object.assign({}, WEAPONS.frost, { name: "冰霜瘟疫", color: "#a8f0ff", icon: "❅", evo: true, kind: "fusion", tags: ["spell"], fuse: ["frost_evo", "poison_evo"], stats: function (lv) { const s = WEAPONS.frost.stats(8); return Object.assign({}, s, { damage: s.damage + 10, dot: s.dot + 30, dotDur: s.dotDur + 1.5, slow: 0.8, freeze: 0.5 }); } }),
    boomerang_sentry: Object.assign({}, WEAPONS.sentry, { name: "风暴哨戒", color: "#7df9ff", icon: "✪", evo: true, kind: "fusion", fuse: ["boomerang_evo", "sentry_evo"], stats: function (lv) { const s = WEAPONS.sentry.stats(8); return Object.assign({}, s, { count: s.count + 2, damage: s.damage + 16, projSpeed: 380, pierce: 2, life: 1.6 }); } }),
    lance_vortex: Object.assign({}, WEAPONS.vortex, { name: "裂空风暴", color: "#ff6b9d", icon: "⇶", evo: true, kind: "fusion", tags: ["ranged", "spell"], fuse: ["lance_evo", "vortex_evo"], stats: function (lv) { const s = WEAPONS.vortex.stats(8); return Object.assign({}, s, { damage: s.damage + 1, life: s.life * 4 / 3, vrad: s.radius * 1.1, pull: s.pull + 60, beamDmg: 22, beamLen: 200, beamWidth: 12, beamSpin: 2.2 }); } }),
    shotgun_grenade: Object.assign({}, WEAPONS.shotgun, { name: "爆裂霰弹", color: "#ffe066", icon: "≣", evo: true, kind: "fusion", fuse: ["shotgun_evo", "grenade_evo"], stats: function (lv) { const s = WEAPONS.shotgun.stats(8); return Object.assign({}, s, { damage: s.damage + 40, count: s.count + 2, cone: s.cone * 1.2, splash: 28, splashMul: 0.5 }); } }),
    meteor_chain: Object.assign({}, WEAPONS.meteor, { name: "陨雷审判", color: "#ffb14d", icon: "☄", evo: true, kind: "fusion", fuse: ["meteor_evo", "chain_evo"], stats: function (lv) { const s = WEAPONS.meteor.stats(8); return Object.assign({}, s, { damage: s.damage + 10, count: s.count + 2, radius: Math.round(s.radius * 1.2), burn: 18, burnDur: 2.6, chainHops: 4, chainRange: 180 }); } }),
    shockwave_frost: Object.assign({}, WEAPONS.shockwave, { name: "冰碎共振", color: "#a8f0ff", icon: "◎", evo: true, kind: "fusion", tags: ["melee", "spell"], fuse: ["shockwave_evo", "frost_evo"], stats: function (lv) { const s = WEAPONS.shockwave.stats(8); return Object.assign({}, s, { damage: s.damage + 32, count: s.count + 1, radius: Math.round(s.radius * 1.25), knock: s.knock + 22, freeze: 0.6, shatter: 60 }); } }),
    hex_poison: Object.assign({}, WEAPONS.hex, { name: "腐朽天灾", color: "#9bff5a", icon: "☣", evo: true, kind: "fusion", tags: ["spell"], fuse: ["hex_evo", "poison_evo"], stats: function (lv) { const s = WEAPONS.hex.stats(8); return Object.assign({}, s, { damage: s.damage + 4, count: s.count + 2, spread: s.spread + 2, frac: Math.min(0.15, s.frac + 0.03), dot: 10, dotDur: 2.5 }); } }),
    crescent_detonate: Object.assign({}, WEAPONS.crescent, { name: "血月断头台", color: "#ff7a8a", icon: "☾", evo: true, kind: "fusion", tags: ["melee"], fuse: ["crescent_evo", "detonate_evo"], stats: function (lv) { const s = WEAPONS.crescent.stats(8); const d = WEAPONS.detonate.stats(8); return { damage: s.damage - 12, radius: Math.round(s.radius * 1.25), arc: s.arc + 0.4, count: s.count + 1, explodeChance: 1.0, explodeR: d.explodeR + 12, explodeDmg: d.explodeDmg - 8, chainHops: 2 }; } }),
    polymorph_timestop: Object.assign({}, WEAPONS.polymorph, { name: "时之诅咒", color: "#d6b3ff", icon: "◷", evo: true, kind: "fusion", tags: ["spell"], fuse: ["polymorph_evo", "timestop_evo"], stats: function (lv) { const pp = WEAPONS.polymorph.stats(8); const tt = WEAPONS.timestop.stats(8); return { damage: tt.damage + 40, cooldown: 3.5, speed: pp.speed, life: pp.life, count: pp.count + 2, dur: pp.dur + 1.0, freeze: tt.freeze + 0.8, pierce: 1 }; } }),
    spear_lance: Object.assign({}, WEAPONS.spear, { name: "贯星长矛", color: "#ffd27a", icon: "➹", evo: true, kind: "fusion", tags: ["ranged", "melee"], fuse: ["spear_evo", "lance_evo"], stats: function (lv) { const s = WEAPONS.spear.stats(8); const l = WEAPONS.lance.stats(8); return { damage: s.damage + 85, cooldown: 0.8, radius: Math.round(s.radius * 1.1), arc: s.arc, beamLen: Math.round(l.length * 1.1), beamWidth: l.width + 4, beamDmg: l.damage + 65 }; } })
  };
  // ── 协同进化组合表(升级池触发:两武器均已进化)。10 组(可互斥,提供不同 build 分支)。
  const FUSIONS = [
    { w1: "blade_evo", w2: "aura_evo", to: "blade_aura", name: "湮灭之轮", desc: "刃刃溅射,黑洞聚怪,近身绞杀一切。", color: "#ffd0a0", icon: "☀" },
    { w1: "missile_evo", w2: "chain_evo", to: "missile_chain", name: "雷暴蜂群", desc: "分裂追踪弹命中触发连锁闪电,自动索敌+群体。", color: "#ff9a3c", icon: "⚡" },
    { w1: "railgun_evo", w2: "grenade_evo", to: "railgun_grenade", name: "轨道轰炸", desc: "贯穿即爆,首命中分裂子榴弹,整排开花。", color: "#ff5d73", icon: "☄" },
    { w1: "frost_evo", w2: "poison_evo", to: "frost_poison", name: "冰霜瘟疫", desc: "冰爆上毒,冻结目标受伤 +50%。", color: "#a8f0ff", icon: "❅" },
    { w1: "boomerang_evo", w2: "sentry_evo", to: "boomerang_sentry", name: "风暴哨戒", desc: "五座哨塔齐射去返回旋镖,穿透收割。", color: "#7df9ff", icon: "✪" },
    { w1: "lance_evo", w2: "vortex_evo", to: "lance_vortex", name: "裂空风暴", desc: "龙卷聚怪,沿途贯穿光束切割。", color: "#ff6b9d", icon: "⇶" },
    { w1: "shotgun_evo", w2: "grenade_evo", to: "shotgun_grenade", name: "爆裂霰弹", desc: "锥形弹幕,每发命中溅射开花。", color: "#ffe066", icon: "≣" },
    { w1: "meteor_evo", w2: "chain_evo", to: "meteor_chain", name: "陨雷审判", desc: "陨石落地连锁闪电,轰炸整片敌群。", color: "#ffb14d", icon: "☄" },
    { w1: "shockwave_evo", w2: "frost_evo", to: "shockwave_frost", name: "冰碎共振", desc: "冲击波冻住敌人,冰冻目标被波及即碎裂。", color: "#a8f0ff", icon: "◎" },
    { w1: "hex_evo", w2: "poison_evo", to: "hex_poison", name: "腐朽天灾", desc: "诅咒附带剧毒,引爆时瘟疫蔓延。", color: "#9bff5a", icon: "☣" },
    { w1: "crescent_evo", w2: "detonate_evo", to: "crescent_detonate", name: "血月断头台", desc: "巨型挥砍,命中必爆且连环引爆,近战清场终技。", color: "#ff7a8a", icon: "☾" },
    { w1: "polymorph_evo", w2: "timestop_evo", to: "polymorph_timestop", name: "时之诅咒", desc: "追踪弹命中同时变羊与冻结,贯穿双重禁锢。", color: "#d6b3ff", icon: "◷" },
    { w1: "spear_evo", w2: "lance_evo", to: "spear_lance", name: "贯星长矛", desc: "前突贯穿同时释放一道激光,远近通吃。", color: "#ffd27a", icon: "➹" }
  ];
  // 合并查询入口
  function weaponDef(id) { return WEAPON_EVOS[id] || WEAPONS[id]; }

  // ── 被动(11 种,等级无上限、收益递减;5 级为进化解锁阈值)
  const PASSIVES = {
    maxhp: { name: "生命强化", icon: "❤", desc: "最大生命 +24", per: "+24 上限/级", color: "#ff7d8e" },
    speed: { name: "移速强化", icon: "⚡", desc: "移动速度 +9%", per: "+9%/级", color: "#7dffce" },
    damage: { name: "攻击强化", icon: "⚔", desc: "全部武器伤害 +11%", per: "+11%/级", color: "#ff9a6b" },
    cooldown: { name: "冷却缩减", icon: "◷", desc: "武器冷却 -7.5%", per: "-7.5%/级(上限 -70%)", color: "#9be7ff" },
    area: { name: "范围强化", icon: "◯", desc: "武器范围 +11%", per: "+11%/级", color: "#c06bff" },
    armor: { name: "钢铁护甲", icon: "🛡", desc: "受伤 -9.5%", per: "-9.5%/级(上限 -60%)", color: "#aab4ff" },
    regen: { name: "生命再生", icon: "✚", desc: "每秒回 +2 生命", per: "+2 HP/s/级", color: "#7CFFB2" },
    magnet: { name: "磁吸光环", icon: "✜", desc: "拾取范围 +45%、经验 +9%", per: "+45%/+9%/级", color: "#ffd86b" },
    luck: { name: "幸运", icon: "✦", desc: "稀有强化与特殊掉落(血包/磁铁/清屏/宝箱)出现率 +17%", per: "+17%/级", color: "#ffd0a0" },
    crit: { name: "暴击", icon: "✸", desc: "+9% 暴击率,暴击造成 2 倍伤害", per: "+9%/级(上限 100%)", color: "#ffd86b" },
    lifesteal: { name: "吸血", icon: "♥", desc: "造成伤害的 1.0% 转为生命(每秒上限 5% 最大生命)", per: "+1%/级(属性上限 10%)", color: "#ff5d8e" }
  };

  // 武器「数量」字段的中文量词(用于升级文案/暂停摘要)
  const COUNT_NOUN = { blade: "光刃", missile: "导弹", shotgun: "弹丸", boomerang: "回旋", sentry: "炮塔", grenade: "榴弹", meteor: "陨石", shockwave: "波", hex: "印记", polymorph: "变形弹", polymorph_timestop: "变形弹", timestop: "力场" };
  // 升级 delta 文案的字段→模板(N=变化量;count 用 COUNT_NOUN)
  const STAT_LABEL = {
    count: "count", damage: "伤害 +{N}", cooldown: "冷却 ↓{N}s", radius: "范围 +{N}",
    chains: "连跳 +{N}", length: "长度 +{N}", width: "宽度 +{N}", speed: "速度 +{N}", chase: "追击 +{N}",
    slow: "减速 +{N}%", slowDur: "减速时长 +{N}s", tick: "频率↑", dot: "毒伤 +{N}",
    dotDur: "毒续 +{N}s", pull: "吸力 +{N}", expand: "扩张 +{N}", fireCd: "射速↑", projSpeed: "弹速 +{N}",
    knock: "击退 +{N}", burn: "灼烧 +{N}", frac: "%生命 +{N}%", spread: "蔓延 +{N}", spin: "旋转 +{N}"
  };

  // ── 可选角色(4 名):起手武器 + 起手被动 + 生命/移速倍率
  const CHARACTERS = {
    bulwark: { name: "铁壁", title: "重装战士", icon: "🛡", color: "#aab4ff", startWeapon: "crescent", startPassives: { armor: 1 }, hpMul: 1.3, speedMul: 0.92, special: "bulwark", desc: "站定时减伤大增并周期发出冲击波,移动越快减伤越低。", appearance: { shape: "circle", deco: "ring" } },
    arcanist: { name: "星语", title: "秘法师", icon: "✦", color: "#c06bff", startWeapon: "frost", startPassives: { area: 1 }, hpMul: 0.85, speedMul: 1.0, charMods: { pickupMul: 0.75 }, special: "arcanist", weaponPolicy: { require: ["spell"] }, desc: "法术武器 +20% 伤害与范围,但只能使用法术武器、且拾取范围 −25%。", appearance: { shape: "diamond", deco: "spark" } },
    ranger: { name: "流光", title: "游击射手", icon: "➤", color: "#5ad1ff", startWeapon: "missile", startPassives: { damage: 1, cooldown: 1 }, hpMul: 1.0, speedMul: 1.12, charMods: { pickupMul: 0.75 }, special: "ranger", weaponPolicy: { forbid: ["melee"] }, desc: "远程武器 +15% 伤害与攻速,但拾取范围 -25%、发育较慢,且不能使用近战武器。", appearance: { shape: "triangle", deco: "arrow" } },
    assassin: { name: "夜刃", title: "影刃刺客", icon: "✸", color: "#ff5d8e", startWeapon: "boomerang", startPassives: { crit: 2 }, hpMul: 0.9, speedMul: 1.05, charMods: { lifestealMul: 0 }, special: "assassin", desc: "对生命低于 30% 的敌人伤害翻倍,残血收割机,但无法吸血。", appearance: { shape: "star", deco: "dagger" } },
    collector: { name: "磁芯", title: "拾取共鸣", icon: "✜", color: "#ffd86b", startWeapon: "aura", startPassives: { magnet: 1 }, hpMul: 1.0, speedMul: 0.92, charMods: { pickupMul: 1.4 }, special: "collector", desc: "拾取经验球时引发小范围伤害爆发,拾取范围 +40%,但移速较慢。", appearance: { shape: "circle", deco: "magnet" } },
    berserker: { name: "血怒", title: "狂战士", icon: "⚔", color: "#ff5d8e", startWeapon: "detonate", startPassives: { damage: 2 }, hpMul: 0.9, speedMul: 1.0, charMods: { regenMul: 0, lifestealMul: 0 }, special: "berserker", desc: "当前生命越低伤害越高(空血 ×2.5);血不满时受伤降低(空血 -50%),但无再生、无吸血。", appearance: { shape: "square", deco: "rage" } },
    lingerer: { name: "时滞者", title: "时空凝滞", icon: "◷", color: "#9be7ff", startWeapon: "timestop", startPassives: { cooldown: 1 }, hpMul: 1.0, speedMul: 0.85, charMods: { enemySpeedMul: 0.7, enemySpawnMul: 0.8, pickupMul: 0.85 }, special: "lingerer", desc: "敌人减速 30%、刷怪量 -20%,但自身移速 -15%、拾取范围 -15%。", appearance: { shape: "hex", deco: "clock" } },
    allrounder: { name: "全能者", title: "均衡之刃", icon: "✦", color: "#b8c6ff", startWeapon: "blade", startPassives: { damage: 1, maxhp: 1 }, hpMul: 1.0, speedMul: 1.0, desc: "全面均衡,无短板也无专精,适合任何流派。", appearance: { shape: "circle", deco: "core" } }
  };
  const CHARACTER_ORDER = ["allrounder", "bulwark", "arcanist", "ranger", "assassin", "collector", "berserker", "lingerer"];

  // ── 敌人(20 种)。hp/speed/dmg 为分钟1 基础值,实际生成时乘难度倍率。shape 控制渲染形状,skill 为图鉴文案。
  const ENEMIES = {
    zombie: { name: "腐行者", hp: 10, speed: 55, dmg: 8, xp: 1, r: 12, color: "#7dd87a", ai: "chase", shape: "circle", skill: "直行追击玩家" },
    runner: { name: "飞刃虫", hp: 6, speed: 132, dmg: 6, xp: 1, r: 9, color: "#ff5d6c", ai: "fast", shape: "triangle", skill: "高速摇摆追击" },
    brute: { name: "重装兵", hp: 60, speed: 40, dmg: 18, xp: 5, r: 21, color: "#b06bff", ai: "tank", shape: "square", skill: "缓慢重装推进,高血量" },
    shooter: { name: "炮台", hp: 18, speed: 70, dmg: 6, projDmg: 8, xp: 3, r: 13, color: "#5ad1ff", ai: "shooter", shape: "pentagon", skill: "中距游走,远程射击(接触伤害较低)" },
    bomber: { name: "自爆虫", hp: 14, speed: 96, dmg: 14, xp: 2, r: 14, color: "#ff9a3c", ai: "bomber", aoe: 62, shape: "blob", skill: "冲撞玩家,贴身自爆(AOE)" },
    swarmer: { name: "食脑蛛", hp: 3, speed: 150, dmg: 4, xp: 1, r: 6, color: "#ffe14d", ai: "fast", shape: "triangle", skill: "成群高速蜂拥" },
    spawner: { name: "母虫巢", hp: 80, speed: 0, dmg: 8, xp: 12, r: 22, color: "#ff5dc0", ai: "spawner", shape: "hex", skill: "静止不动,持续孵化食脑蛛(接触伤害较低)" },
    charger: { name: "冲锋兽", hp: 30, speed: 60, chargeSpeed: 380, dmg: 14, xp: 4, r: 15, color: "#6ba8ff", ai: "charger", shape: "triangle", skill: "蓄力预警后高速冲刺" },
    ghost: { name: "萤魂", hp: 25, speed: 160, dmg: 0, xp: 25, r: 10, color: "#bdf0ff", ai: "wander", shape: "star", shimmer: true, skill: "游走的高价值目标(金色闪烁,不攻击)" },
    blinker: { name: "闪烁者", hp: 16, speed: 80, dmg: 10, xp: 3, r: 12, color: "#c084fc", ai: "blink", shape: "diamond", skill: "追击中周期瞬移贴脸" },
    splitter: { name: "分裂者", hp: 42, speed: 68, dmg: 12, xp: 6, r: 18, color: "#8aff7d", ai: "splitter", shape: "blob", skill: "死亡分裂成 2 只食脑蛛" },
    shielder: { name: "盾甲兵", hp: 55, speed: 50, dmg: 16, xp: 7, r: 18, color: "#6b8aff", ai: "shield", dr: 0.55, shape: "hex", skill: "高额减伤(受伤 -55%)" },
    sniper: { name: "狙击手", hp: 22, speed: 60, dmg: 6, projDmg: 16, xp: 6, r: 12, color: "#ff8aff", ai: "sniper", shape: "diamond", skill: "远程站桩,精确狙击(接触伤害较低)" },
    regen: { name: "自愈者", hp: 48, speed: 56, dmg: 14, xp: 6, r: 16, color: "#5affb0", ai: "regen", regenRate: 7, shape: "cross", skill: "持续回血" },
    warden: { name: "光环盾卫", hp: 70, speed: 48, dmg: 14, xp: 8, r: 19, color: "#8aa0ff", ai: "shield_aura", shape: "hex", auraR: 120, auraDr: 0.40, skill: "给周围敌人套减伤护盾" },
    priest: { name: "血祭司", hp: 55, speed: 52, dmg: 12, xp: 8, r: 17, color: "#ff6b8a", ai: "heal_aura", shape: "star", auraR: 130, healRate: 6, skill: "治疗周围敌人" },
    overdriver: { name: "狂热者", hp: 50, speed: 50, dmg: 12, xp: 7, r: 16, color: "#c084fc", ai: "speed_aura", shape: "triangle", auraR: 130, auraSpeed: 1.4, skill: "加速周围敌人" },
    burster: { name: "爆巢者", hp: 40, speed: 64, dmg: 12, xp: 6, r: 18, color: "#ff7a3c", ai: "chase", shape: "blob", burstCount: 5, burstType: "swarmer", skill: "死亡爆出一群食脑蛛" },
    stalker: { name: "潜伏者", hp: 35, speed: 78, dmg: 16, xp: 7, r: 15, color: "#a8e8ff", ai: "stalker", shape: "diamond", stealth: true, skill: "隐身接近,近身现身突袭(首击破隐)" },
    slimer: { name: "腐泥", hp: 28, speed: 58, dmg: 10, xp: 5, r: 14, color: "#9bff5a", ai: "slime", shape: "blob", trailInterval: 0.45, trailDur: 2.0, trailDmg: 8, skill: "摇摆追击,路径留下毒径" }
  };

  // ── Boss(8 种)。tier:难度级(每关按 5/10/15min 依 T1→T2→T3 递增出)。skill 为图鉴文案。
  const BOSSES = {
    duke: { name: "肥胖公爵", icon: "☠", hp: 900, speed: 35, dmg: 32, r: 40, color: "#d65a8a", xp: 60, tier: 1, shape: "hex", skill: "召唤僵尸 + 环形弹幕" },
    wraith: { name: "双生怨灵", icon: "☾", hp: 680, speed: 110, dmg: 15, r: 24, color: "#9b6bff", xp: 50, tier: 1, count: 2, shape: "diamond", skill: "环绕飞行 + 扇形弹幕(同伴死则狂暴加速)" },
    queen: { name: "蜂后", icon: "☼", hp: 2200, speed: 30, dmg: 28, r: 46, color: "#ff6ab0", xp: 100, tier: 2, shape: "hex", skill: "召唤蜂群 + 环形/螺旋弹幕" },
    magnetwarper: { name: "磁暴行者", icon: "⚡", hp: 1500, speed: 45, dmg: 20, r: 36, color: "#8e7bff", xp: 90, tier: 2, shape: "star", skill: "引力波把玩家吸向自身 + 贴身电击圈" },
    twins: { name: "镜像双子", icon: "◐", hp: 1050, speed: 60, dmg: 15, r: 28, color: "#7df9ff", xp: 80, tier: 2, count: 2, shape: "triangle", skill: "追击 + 周期换位(杀其一,本体反噬 25% 并狂暴)" },
    architect: { name: "架构师", icon: "⌬", hp: 1800, speed: 50, dmg: 38, r: 44, color: "#5ad1ff", xp: 120, tier: 3, shape: "square", skill: "环形弹幕 + 召唤炮台(炮台亦会射击)" },
    inquisitor: { name: "审判者", icon: "✠", hp: 1650, speed: 60, dmg: 26, r: 30, color: "#b06bff", xp: 90, tier: 3, shape: "cross", skill: "传送贴脸 + 环形/扇形连射" },
    colossus: { name: "弹幕巨像", icon: "◎", hp: 2700, speed: 0, dmg: 33, r: 50, color: "#ff6b4d", xp: 140, tier: 3, shape: "circle", skill: "不动 + 旋转扫射激光 + 召唤僵尸 + 螺旋弹幕" }
  };

  // ── 难度曲线(t=分钟)。目标:开局轻松→5min Boss有压→5-10渐增→~10min峰值→10min+玩家成型反杀
  const CURVES = {
    spawnRate: function (t) { return 1.0 + 0.7 * Math.sqrt(t); }, // 出兵更密。t=1:1.7 t=5:2.57 t=10:3.21 t=15:3.71 t=20:4.13
    hpFactor: function (t) { return 1.2 + 0.22 * t + 0.012 * t * t + 0.0004 * t * t * t; }, // 初始 +20% & 中后期更陡。t=5:2.96 t=10:5.2 t=15:9.0 t=20:14.2
    speedFactor: function (t) { return 1 + 0.03 * t; },
    dmgFactor: function (t) { return t <= 4 ? 1 : 1 + 0.12 * (t - 4); }, // 4min 起敌伤每分 +12%(配合 5-10min 渐增与 10min 峰值)。t=10:1.72 t=20:2.92
    xpForLevel: function (N) { return Math.floor(3 + 2.2 * N + Math.pow(N, 1.2)); },
    // 无尽模式:通关后随(超时分钟)额外敌血/敌伤倍率
    endlessMul: function (overMin) { return 1 + 0.22 * overMin + 0.01 * overMin * overMin; }
  };

  // 按时间返回刷怪权重表(类型 -> 权重)
  function enemyWeights(t) {
    const w = { zombie: 10 };
    if (t >= 1.5) w.runner = 4;
    if (t >= 4) { w.brute = 2; w.shooter = 2; }
    if (t >= 6) { w.spawner = 0.6; w.ghost = 0.5; }
    if (t >= 8) { w.bomber = 2; w.charger = 2; }
    if (t >= 12) { w.brute += 2; w.charger += 1; }
    return w;
  }

  // 集群波只用小怪
  const SWARM_TYPES = ["swarmer", "swarmer", "swarmer", "runner", "zombie"];

  // ── 难度 4 档(乘子叠在刷怪率/敌血/敌伤上)
  const DIFFICULTY = {
    chill: { name: "轻松", spawnMul: 0.6, hpMul: 0.7, dmgMul: 0.65, dropMul: 1.4, xpMul: 1.3 },
    normal: { name: "普通", spawnMul: 1.0, hpMul: 1.0, dmgMul: 1.0, dropMul: 1.0, xpMul: 1.0 },
    hard: { name: "困难", spawnMul: 1.5, hpMul: 1.5, dmgMul: 1.4, dropMul: 0.6, xpMul: 0.7 },
    nightmare: { name: "噩梦", spawnMul: 2.0, hpMul: 1.8, dmgMul: 1.7, dropMul: 0.4, xpMul: 0.5 }
  };
  const DIFFICULTY_ORDER = ["chill", "normal", "hard", "nightmare"];

  // ── 关卡配色
  const PAL = {
    ruins: { bg0: "#070611", bg1: "#0d0a22", grid: "rgba(120,90,220,0.10)", gridStrong: "rgba(150,110,255,0.16)", star: "#cfe8ff" },
    crimson: { bg0: "#14050a", bg1: "#2a0a12", grid: "rgba(220,90,90,0.10)", gridStrong: "rgba(255,110,110,0.18)", star: "#ffd0c0" },
    frozen: { bg0: "#050f14", bg1: "#0a1f2e", grid: "rgba(90,180,220,0.10)", gridStrong: "rgba(110,220,255,0.18)", star: "#e0f5ff" },
    void: { bg0: "#040208", bg1: "#0a0618", grid: "rgba(90,60,180,0.12)", gridStrong: "rgba(140,90,255,0.20)", star: "#d0c0ff" }
  };

  // ── 各关刷怪权重(t=分钟)
  function wRuins(t) {
    const w = { zombie: 10 };
    if (t >= 1.5) w.runner = 4;
    if (t >= 4) { w.brute = 2; w.shooter = 2; }
    if (t >= 6) { w.spawner = 0.6; w.ghost = 0.5; w.blinker = 1; }
    if (t >= 7) w.warden = 1.2;
    if (t >= 8) { w.bomber = 2; w.charger = 2; w.splitter = 1; }
    if (t >= 9) w.burster = 1.5;
    if (t >= 10) { w.shielder = 1.5; w.sniper = 1; w.regen = 1; }
    if (t >= 12) { w.brute += 2; w.charger += 1; }
    return w;
  }
  function wCrimson(t) {
    const w = { zombie: 6, runner: 6 };
    if (t >= 2) w.charger = 3;
    if (t >= 3.5) w.bomber = 3;
    if (t >= 4) w.slimer = 2;
    if (t >= 5) { w.brute = 2; w.shielder = 3; }
    if (t >= 6) w.priest = 1.2;
    if (t >= 7) { w.splitter = 2; w.regen = 1; w.shooter = 1; }
    if (t >= 10) { w.charger += 2; w.bomber += 1; w.shielder += 1; }
    return w;
  }
  function wFrozen(t) {
    const w = { zombie: 8 };
    if (t >= 1.5) w.blinker = 3;
    if (t >= 3) { w.shooter = 3; w.ghost = 2; }
    if (t >= 5) w.sniper = 2;
    if (t >= 6) w.stalker = 1.5;
    if (t >= 7) { w.brute = 1; w.spawner = 0.8; w.regen = 1; }
    if (t >= 9) { w.runner = 3; w.charger = 1; w.shielder = 1; }
    return w;
  }
  function wVoid(t) {
    const w = { zombie: 8, runner: 4 };
    if (t >= 1.5) { w.blinker = 2; w.charger = 2; }
    if (t >= 3) { w.brute = 2; w.shooter = 2; w.bomber = 2; }
    if (t >= 5) { w.splitter = 2; w.shielder = 2; w.sniper = 1; w.regen = 1; w.ghost = 1; w.spawner = 0.8; }
    if (t >= 6) w.overdriver = 1.2;
    if (t >= 7) w.burster = 1.5;
    if (t >= 8) for (const k in w) w[k] *= 1.3;
    if (t >= 12) for (const k in w) w[k] *= 1.3;
    return w;
  }

  // ── 关卡(全部直接可选,无需解锁)。bosses=[[type,min秒]],finale=终局Boss组,bgm=程序化合成配置
  const STAGES = {
    ruins: { name: "霓虹废墟", goalMin: 20 * 60, half: 1700, palette: PAL.ruins, weights: wRuins, bosses: [["duke", 300], ["magnetwarper", 600], ["architect", 840]], finale: null, envField: null, bgm: { root: 55, scale: [0, 3, 5, 7, 10], bpm: 110, wave: "triangle", theme: "invention" } },
    crimson: { name: "血色荒原", goalMin: 20 * 60, half: 1500, palette: PAL.crimson, weights: wCrimson, bosses: [["wraith", 300], ["queen", 600], ["inquisitor", 840]], finale: null, envField: { type: "burn", interval: 12, dur: 4, r: 90, dps: 14, warm: 2 }, bgm: { root: 65.41, scale: [0, 1, 4, 6, 7], bpm: 120, wave: "sawtooth", theme: "toccata" } },
    frozen: { name: "冰封核心", goalMin: 20 * 60, half: 1600, palette: PAL.frozen, weights: wFrozen, bosses: [["duke", 300], ["twins", 600], ["colossus", 840]], finale: null, envField: { type: "freeze", interval: 15, dur: 1.5, slowF: 0.55 }, bgm: { root: 110, scale: [0, 2, 4, 7, 9], bpm: 110, wave: "sine", theme: "aria" } },
    void: { name: "虚空深渊", goalMin: 20 * 60, half: 1900, palette: PAL.void, weights: wVoid, bosses: [["wraith", 300], ["magnetwarper", 600], ["colossus", 840]], finale: ["duke", "wraith", "inquisitor"], finaleMin: 18 * 60, envField: { type: "gravity", interval: 18, dur: 1.0, pull: 220 }, bgm: { root: 49, scale: [0, 2, 4, 6, 8, 10], bpm: 130, wave: "square", theme: "fugue" } }
  };
  const STAGE_ORDER = ["ruins", "crimson", "frozen", "void"];

  SV.Config = {
    CONST: CONST,
    AUTO: AUTO,
    COLORS: COLORS,
    WEAPONS: WEAPONS,
    WEAPON_EVOS: WEAPON_EVOS,
    EVOLUTIONS: EVOLUTIONS,
    FUSIONS: FUSIONS,
    weaponDef: weaponDef,
    PASSIVES: PASSIVES,
    COUNT_NOUN: COUNT_NOUN,
    STAT_LABEL: STAT_LABEL,
    ENEMIES: ENEMIES,
    BOSSES: BOSSES,
    CURVES: CURVES,
    enemyWeights: enemyWeights,
    SWARM_TYPES: SWARM_TYPES,
    DIFFICULTY: DIFFICULTY,
    DIFFICULTY_ORDER: DIFFICULTY_ORDER,
    STAGES: STAGES,
    STAGE_ORDER: STAGE_ORDER,
    MENU_BGM: { root: 65.41, scale: [0, 2, 4, 7, 9], bpm: 128, wave: "square", theme: "badinerie" },   // 主菜单/选角/选关:Badinerie (BWV 1067),C 大 pentatonic
    CHARACTERS: CHARACTERS,
    CHARACTER_ORDER: CHARACTER_ORDER
  };
})();
