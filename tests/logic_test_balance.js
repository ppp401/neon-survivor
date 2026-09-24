// Focused regression for the weapon, pickup, Boss schedule and pause changes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, { innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll() { return []; } });
  return elements.get(id);
}
const ctx = { console, Math, setTimeout, clearTimeout, window: null, document: { getElementById: el, querySelectorAll() { return []; }, addEventListener() {} } };
ctx.window = ctx;
ctx.SV = {};
vm.createContext(ctx);
function load(file) { vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file }); }
load('util.js'); load('config.js');
const SV = ctx.SV, C = SV.Config.CONST, W = SV.Config.WEAPONS;
assert.equal(C.HEALTH_PULL_RADIUS, C.PICKUP_RADIUS);
assert.deepEqual(Array.from(C.LATE_BOSS_TIMES), [990, 1080, 1170]);
assert(W.meteor.stats(1).damage > 21 * 1.2);
assert(W.meteor.stats(1).radius > 52);
assert(W.railgun.stats(1).damage < 24.3);
assert(W.railgun.stats(8).damage > 99.9);
for (const id of Object.keys(W)) {
  const first = W[id].stats(1), last = W[id].stats(8);
  const attack = s => s.damage == null ? s.dot : s.damage;
  assert(Number.isFinite(attack(first)) && attack(first) > 0, `${id} has offensive output`);
  assert(Number.isFinite(attack(last)) && attack(last) >= attack(first), `${id} damage grows`);
  assert(attack(last) / attack(first) < 12, `${id} level growth stays bounded`);
  for (let lv = 1; lv <= 8; lv++) {
    const s = W[id].stats(lv);
    assert(Number.isFinite(attack(s)) && attack(s) > 0, `${id} L${lv} finite damage`);
    if (s.cooldown != null) assert(s.cooldown > 0 && s.cooldown < 10, `${id} L${lv} valid cooldown`);
  }
}
assert.equal(Object.values(SV.Config.BOSSES).filter(b => b.tier === 1).length, 6);
assert.equal(Object.values(SV.Config.BOSSES).filter(b => b.tier === 3).length, 6);
for (const [id, def] of Object.entries(SV.Config.BOSSES).filter(([, b]) => b.tier === 1)) {
  const scale = SV.Config.DIFFICULTY.normal.bossDmgMul * SV.Config.CURVES.dmgFactor(5);
  assert(def.dmg * scale <= 36, `${id} T1 normal contact damage`);
  if (def.attacks.projectile) {
    assert(Math.max(...def.attacks.projectile) * scale <= 15, `${id} T1 normal projectile damage`);
    const sniperShot = SV.Config.ENEMIES.sniper.projDmg * SV.Config.DIFFICULTY.normal.dmgMul * SV.Config.CURVES.dmgFactor(5);
    assert(Math.min(...def.attacks.projectile) * scale > sniperShot, `${id} T1 projectile exceeds sniper damage`);
  }
  assert(def.hp <= 900, `${id} T1 base HP`);
  if (def.mechanics && def.mechanics.warn) assert(def.mechanics.warn >= 0.7, `${id} readable T1 warning`);
}
assert.deepEqual(Array.from(SV.Config.BOSSES.duke.attacks.projectile), [10]);
assert.deepEqual(Array.from(SV.Config.BOSSES.scavenger.attacks.projectile), [10]);
assert.deepEqual(Array.from(SV.Config.BOSSES.frostwarden.attacks.projectile), [9]);
assert.deepEqual(Array.from(SV.Config.BOSSES.bloodhunter.attacks.projectile), [9]);
assert.deepEqual(Array.from(SV.Config.BOSSES.riftsentry.attacks.projectile), [8, 9]);
assert.deepEqual(Array.from(SV.Config.BOSSES.thornwarden.attacks.projectile), [9]);
const tierOnePools = new Set();
for (const stage of Object.values(SV.Config.STAGES)) {
  assert.equal(stage.bosses.length, 3);
  assert.equal(stage.bosses[0][0].length, 3);
  tierOnePools.add(stage.bosses[0][0].join(','));
  for (let tier = 1; tier <= 3; tier++) {
    const [pool, time] = stage.bosses[tier - 1];
    assert.equal(time, [300, 600, 840][tier - 1]);
    assert(pool.length >= 2);
    for (const id of pool) assert.equal(SV.Config.BOSSES[id].tier, tier, id);
  }
  assert(!stage.finale);
}
assert.equal(tierOnePools.size, 4, 'each map has a distinct T1 pool');
const maps = Object.values(SV.Config.STAGES);
for (let a = 0; a < maps.length; a++) for (let b = a + 1; b < maps.length; b++) {
  for (let tier = 0; tier < 3; tier++) {
    const shared = maps[a].bosses[tier][0].filter(id => maps[b].bosses[tier][0].includes(id));
    assert(shared.length <= 1, `${maps[a].name} and ${maps[b].name} T${tier + 1} overlap at most once`);
  }
}
assert.equal(SV.Config.BOSSES.wraith.tier, 2);
const newBosses = ['scavenger', 'frostwarden', 'bloodhunter', 'riftsentry', 'thornwarden', 'stormherald', 'bloodoracle', 'furnace', 'voidseer', 'eclipseeye'];
for (const id of newBosses) assert(SV.Config.BOSSES[id]);

const spawns = [];
SV.Util.choice = arr => arr[0];
SV.Util.randInt = () => 2;
SV.Renderer = { cssSize: () => ({ w: 800, h: 500 }), cam: { zoom: 1 } };
SV.Entities = { addBoss(_s, id) { spawns.push(id); return { id }; }, addEnemy() {} };
SV.Audio = { bossWarn() {} };
SV.Effects = { shake() {} };
SV.HUD = { toast() {} };
load('waves.js');
const state = { player: { x: 0, y: 0 }, stage: SV.Config.STAGES.ruins, difficulty: 'normal', enemies: [], time: 0, endless: false, charMods: {}, _bossLoot: {} };
SV.Waves.reset(state);
function at(time, endless = false) { state.time = time; state.endless = endless; SV.Waves.update(state, 1 / 60); }
at(300); assert.equal(spawns.length, 1);
at(600); assert.equal(spawns.length, 3); // 第一候选双生怨灵为双体 Boss
at(840); assert.equal(spawns.length, 4);
at(989); assert.equal(spawns.length, 4);
at(990); assert(spawns.length >= 6 && spawns.length <= 7); let n = spawns.length;
at(1079); assert.equal(spawns.length, n);
at(1080); assert(spawns.length >= n + 2 && spawns.length <= n + 3); n = spawns.length;
at(1170); assert(spawns.length >= n + 2 && spawns.length <= n + 3); n = spawns.length;
at(1200, true); assert.equal(spawns.length, n);
at(1259, true); assert.equal(spawns.length, n);
at(1260, true); assert(spawns.length >= n + 1 && spawns.length <= n + 3); n = spawns.length;
at(1319, true); assert.equal(spawns.length, n);
at(1320, true); assert(spawns.length > n);

for (const stage of Object.values(SV.Config.STAGES)) {
  const allowed = new Set(stage.bosses.flatMap(pair => pair[0]));
  SV.Util.choice = arr => {
    if (arr.length === allowed.size) assert.deepEqual(new Set(arr), allowed, `${stage.name} uses complete map Boss pool`);
    return arr[0];
  };
  const mapState = { player: { x: 0, y: 0 }, stage, difficulty: 'normal', enemies: [], time: 0, endless: false, charMods: {}, _bossLoot: {} };
  SV.Waves.reset(mapState);
  const from = spawns.length;
  mapState.time = 1170;
  SV.Waves.update(mapState, 1 / 60);
  const late = spawns.slice(from);
  assert(late.length >= 6, `${stage.name} late waves spawn`);
  assert(late.every(id => allowed.has(id)), `${stage.name} late waves stay in map pool`);
  const endlessFrom = spawns.length;
  mapState.endless = true; mapState.time = 1260;
  SV.Waves.update(mapState, 1 / 60);
  assert(spawns.slice(endlessFrom).every(id => allowed.has(id)), `${stage.name} endless waves stay in map pool`);
}

// Each new Boss must execute its AI branch without throwing or emitting invalid shots.
const shots = [];
SV.Entities.canEnemyRanged = () => true;
SV.Entities.addEShot = (_s, x, y, vx, vy, dmg, _color, _r, srcType) => shots.push({ x, y, vx, vy, dmg, srcType });
let mockEnemyId = 10000;
SV.Entities.addEnemy = (s, _type, x, y) => { const o = { id: mockEnemyId++, x, y, hp: 1, r: 14 }; s.enemies.push(o); return o; };
SV.Entities.damagePlayer = () => {};
SV.Effects.hit = () => {}; SV.Effects.ring = () => {};
SV.Game = { state: { player: { x: 0, y: 0, r: 14 }, enemies: [], eshots: [], hazards: [], time: 600, difficulty: 'normal', endless: false, stage: SV.Config.STAGES.ruins } };
load('ai.js');
{
  const sniper = { ai: 'sniper', x: 300, y: 0, speed: 60, projDmg: 11, color: '#fff', t1: 0, vx: 0, vy: 0 };
  shots.length = 0;
  SV.AI.update(SV.Game.state, sniper, 1 / 60);
  assert.equal(Math.hypot(shots[0].vx, shots[0].vy), 380, 'sniper projectile speed');
}
for (const id of newBosses) {
  const def = SV.Config.BOSSES[id];
  const boss = { bossType: id, ai: 'boss', x: 160, y: 0, r: def.r, speed: def.speed, t1: 0, t2: 0, ct: 0, cdir: 0, cstate: 'walk', color: def.color, hp: 100 };
  SV.Game.state.enemies = [boss];
  for (let frame = 0; frame < 150; frame++) SV.AI.update(SV.Game.state, boss, 1 / 60);
  assert(Number.isFinite(boss.vx) && Number.isFinite(boss.vy), `${id} movement`);
}
assert(shots.every(s => [s.x, s.y, s.vx, s.vy, s.dmg].every(Number.isFinite)), 'finite Boss shots');
assert(shots.some(s => s.srcType === 'bloodhunter'));
assert(shots.some(s => s.srcType === 'riftsentry'));
assert(shots.some(s => s.srcType === 'thornwarden'));
assert(shots.some(s => s.srcType === 'eclipseeye'));
assert(SV.Game.state.hazards.some(h => h.srcType === 'furnace'), 'furnace hazard attribution');

function signatureBoss(id) {
  const def = SV.Config.BOSSES[id];
  const boss = { bossType: id, ai: 'boss', x: 160, y: 0, r: def.r, speed: def.speed, t1: 0, t2: 99, ct: 0, cdir: 0, cstate: 'walk', color: def.color, hp: 100 };
  SV.Game.state.enemies = [boss]; shots.length = 0;
  return boss;
}
function frames(boss, count) { for (let i = 0; i < count; i++) SV.AI.update(SV.Game.state, boss, 1 / 60); }
let sig = signatureBoss('frostwarden');
frames(sig, 1); assert.equal(sig.cstate, 'ice_warn'); assert.equal(shots.length, 0);
frames(sig, Math.ceil(SV.Config.BOSSES.frostwarden.mechanics.warn * 60) + 1); assert.equal(shots.length, 2); assert.equal(sig.cstate, 'ice_follow');
frames(sig, Math.ceil(SV.Config.BOSSES.frostwarden.mechanics.follow * 60) + 1); assert.equal(shots.length, 3); assert.equal(sig.cstate, 'walk');

sig = signatureBoss('bloodhunter');
frames(sig, 1); assert.equal(sig.cstate, 'blood_mark'); assert.equal(shots.length, 0);
frames(sig, Math.ceil(SV.Config.BOSSES.bloodhunter.mechanics.warn * 60) + 1); assert.equal(shots.length, 4);
assert.equal(new Set(shots.map(s => `${s.x},${s.y}`)).size, 2, 'bloodhunter fires from both flanks');

sig = signatureBoss('riftsentry');
frames(sig, 1); assert.equal(sig.cstate, 'rift_open'); assert.equal(shots.length, 0);
frames(sig, Math.ceil(SV.Config.BOSSES.riftsentry.mechanics.warn * 60) + 1); assert.equal(shots.length, 4);
assert.equal(new Set(shots.map(s => `${s.x},${s.y}`)).size, 2, 'riftsentry fires from paired rifts');

sig = signatureBoss('thornwarden');
frames(sig, 1); assert.equal(sig.dr, SV.Config.BOSSES.thornwarden.mechanics.armor); assert.equal(shots.length, 0);
frames(sig, Math.ceil(SV.Config.BOSSES.thornwarden.mechanics.warn * 60) + 1); assert.equal(shots.length, 3); assert.equal(sig.dr, 0); assert.equal(sig.cstate, 'thorn_cool');

sig = signatureBoss('stormherald');
frames(sig, 1); assert.equal(sig.cstate, 'storm_sweep'); assert.equal(shots.length, 0);
frames(sig, 50); assert(shots.length >= 4 && shots.length <= 6);
assert(new Set(shots.map(s => Math.atan2(s.vy, s.vx).toFixed(2))).size > 2, 'stormherald sweeps angles');

sig = signatureBoss('bloodoracle');
sig.t1 = 99; sig.t2 = 0;
frames(sig, 1); assert.equal(sig.cstate, 'ritual'); assert.equal(sig.ritualMinionIds.length, 2);
SV.Game.state = JSON.parse(JSON.stringify(SV.Game.state));
sig = SV.Game.state.enemies.find(e => e.bossType === 'bloodoracle');
SV.Game.state.enemies.find(e => e.id === sig.ritualMinionIds[0]).hp = 0;
frames(sig, 49); assert.equal(shots.length, 3, 'killing a ritual follower removes its volley');

sig = signatureBoss('voidseer');
frames(sig, 1); assert.equal(sig.cstate, 'seer_warn'); assert.equal(shots.length, 0);
frames(sig, 42); assert.equal(sig.cstate, 'seer_echo'); assert.equal(shots.length, 0);
const oldX = sig.echoX, oldY = sig.echoY;
frames(sig, 29); assert.equal(shots.length, 8);
assert(shots.every(s => s.x === oldX && s.y === oldY), 'voidseer echo fires from old position');

sig = signatureBoss('eclipseeye');
frames(sig, 1); assert.equal(sig.cstate, 'eclipse_charge'); assert.equal(shots.length, 0);
frames(sig, 55); const firstRing = shots.length; assert(firstRing >= 12 && firstRing < 16);
frames(sig, 34); assert.equal(shots.length, firstRing * 2);
assert(shots.every(s => Math.abs(Math.atan2(Math.sin(Math.atan2(s.vy, s.vx) - sig.gapAngle), Math.cos(Math.atan2(s.vy, s.vx) - sig.gapAngle))) >= 0.43), 'eclipse rings keep their safe gap');

// Render the actual pause weapon rows, including evolved and fusion weapons.
SV.Audio = null; SV.Effects = null;
SV.Entities.tid = id => id.replace(/_evo$/, '');
SV.Entities.weaponRecentDamage = () => null;
SV.Entities.mods = () => ({ maxHp: 100, speedMul: 1, damageMul: 1, cdMul: 1, areaMul: 1, armorMul: 1, regen: 0, critChance: 0, lifesteal: 0, pickupMul: 1, xpMul: 1, luck: 0 });
SV.Upgrades = { traitLabel: () => '', summary: () => 'stats' };
load('menus.js');
const pauseState = { charId: 'bulwark', startWeaponId: 'blade', weapons: [{ id: 'blade', level: 4 }, { id: 'missile_evo', level: 8, evolved: true }, { id: 'blade_aura', level: 8, evolved: true }], passives: {}, weaponDamage: {}, weaponActive: {}, encountered: { enemy: {}, boss: {} }, time: 0 };
SV.Menus.populatePause(pauseState);
let html = el('pauseArsenal').innerHTML;
assert(html.includes('进化条件：' + SV.Config.PASSIVES.maxhp.name + ' Lv5'));
assert.equal((html.match(/进化条件：/g) || []).length, 1);
pauseState.weapons = [{ id: 'railgun', level: 1 }];
SV.Menus.populatePause(pauseState);
html = el('pauseArsenal').innerHTML;
assert(html.includes('进化条件：' + SV.Config.PASSIVES.luck.name + ' Lv5'));

// Exercise pickup movement through the real player update path.
load('entities.js');
SV.Input = { axis: { x: 0, y: 0 } };
SV.Audio = { pickup() {} };
SV.Effects = { text() {}, ring() {}, shake() {} };
SV.Game.onXP = () => {};
const pickState = { player: SV.Entities.makePlayer(), passives: {}, charMul: { hpMul: 1, speedMul: 1 }, charMods: {}, stage: SV.Config.STAGES.ruins, difficulty: 'normal', hazards: [], gems: [], pickups: [], enemies: [], time: 0, afterimages: [], xp: 0 };
pickState.pickups.push(SV.Entities.makePickup(70, 0, 'treasure'));
SV.Entities.updatePlayer(pickState, 1 / 60);
assert(pickState.pickups[0].pulled && pickState.pickups[0].x < 70);
pickState.pickups = [SV.Entities.makePickup(73, 0, 'health')];
pickState.player.hp = 50;
SV.Entities.updatePlayer(pickState, 1 / 60);
assert.equal(pickState.pickups[0].x, 73);
pickState.pickups[0].x = 70;
SV.Entities.updatePlayer(pickState, 1 / 60);
assert(pickState.pickups[0].x < 70);
pickState.pickups = [SV.Entities.makePickup(70, 0, 'health')];
pickState.player.hp = pickState.player.maxHp;
SV.Entities.updatePlayer(pickState, 1 / 60);
assert.equal(pickState.pickups[0].x, 70);
console.log('logic_test_balance: OK');
