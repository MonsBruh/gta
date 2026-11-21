// Boot, input, camera, day/night, weather and the main loop.
'use strict';
(() => {
const V3 = THREE.Vector3;
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, G.mobile ? 1.25 : 1.5));
if (G.mobile) document.body.classList.add('mobile');
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = G.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = G.scene = new THREE.Scene();
const camera = G.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.2, G.mobile ? 900 : 1800);
scene.fog = new THREE.Fog(0x9cc4e4, 180, 1000);
scene.background = new THREE.Color(0x9cc4e4);
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4d5a3a, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d8, 2.2); sun.castShadow = true;
const SHR = G.mobile ? 50 : 75; sun.shadow.mapSize.set(G.mobile ? 1024 : 2048, G.mobile ? 1024 : 2048); const sc = sun.shadow.camera; sc.left = -SHR; sc.right = SHR; sc.top = SHR; sc.bottom = -SHR; sc.near = 10; sc.far = 400;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

G.state = { started: false, paused: true, over: null, map: false };
G.cam = { yaw: 0, pitch: 0.18, dist: 4.6, mouseT: 0, shake: 0, curDist: 4.6 };
G.clock = { min: 10 * 60, hour: 10, night: false, str: '10:00' };
G.camDist = (p) => Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
G.shake = (a) => { G.cam.shake = Math.min(1.2, Math.max(G.cam.shake, a)); };

// ---------------- input ----------------
const lockPointer = () => { if (!G.mobile && canvas.requestPointerLock) canvas.requestPointerLock(); };
const keys = {};
G.input = { fwd: 0, right: 0, sprint: false, jump: false, aim: false, fire: false, car: { throttle: 0, steer: 0, handbrake: false } };
let mouseL = false, mouseR = false, firePressed = false;
addEventListener('keydown', (e) => {
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (!G.state.started) return;
  if (e.code === 'KeyM') toggleMap();
  if (G.state.paused || G.state.over) return;
  const pl = G.player;
  if (e.code === 'KeyF' || e.code === 'Enter') enterExit();
  if (e.code === 'KeyR') G.reload(pl);
  if (e.code === 'KeyH' && pl.vehicle) { G.audio.horn(); G.panic(pl.pos.x, pl.pos.z, 15, 0.3); }
  if (e.code === 'KeyN') { G.muted = !G.muted; G.audio.setMuted(G.muted); G.hud.notify(G.muted ? 'Sound off' : 'Sound on'); }
  const d = e.code.match(/^Digit([1-5])$/); if (d) selectWeapon(G.WEAPON_ORDER[+d[1] - 1]);
  if (e.code === 'KeyQ') cycleWeapon(-1); if (e.code === 'KeyE') cycleWeapon(1);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  if (!G.state.started || G.mobile) return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  if (e.button === 0) { mouseL = true; firePressed = true; } if (e.button === 2) mouseR = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || G.state.paused) return;
  const s = 0.0024 * (G.player && G.player.aiming ? 0.6 : 1);
  G.cam.yaw -= e.movementX * s; G.cam.pitch = G.clamp(G.cam.pitch + e.movementY * s, -0.55, 1.2); G.cam.mouseT = 1.4;
});
addEventListener('wheel', (e) => { if (G.state.started && !G.state.paused) cycleWeapon(e.deltaY > 0 ? 1 : -1); });
document.addEventListener('pointerlockchange', () => {
  if (!G.state.started) return;
  if (document.pointerLockElement === canvas) { G.state.paused = false; $('menu').classList.add('hidden'); }
  else if (!G.state.map) { G.state.paused = true; $('menu').classList.remove('hidden'); $('play').textContent = 'RESUME'; mouseL = mouseR = false; }
});
function toggleMap() {
  G.state.map = !G.state.map;
  $('bigmap').classList.toggle('hidden', !G.state.map);
  if (G.state.map) { G.state.paused = true; G.hud.drawBigMap(); if (document.exitPointerLock) document.exitPointerLock(); }
  else if (G.mobile) { G.state.paused = false; } else { lockPointer(); }
}
$('bigmap').addEventListener('keydown', () => {});
addEventListener('keydown', (e) => { if (e.code === 'Escape' && G.state.map) toggleMap(); });
function owned(w) { return w === 'fists' || (G.player.inv[w] && (G.player.inv[w].clip + G.player.inv[w].ammo > 0)); }
function selectWeapon(w) { if (!owned(w)) return; G.setWeapon(G.player, w); }
function cycleWeapon(dir) {
  const o = G.WEAPON_ORDER; let i = o.indexOf(G.player.weapon);
  for (let k = 0; k < o.length; k++) { i = (i + dir + o.length) % o.length; if (owned(o[i])) { selectWeapon(o[i]); return; } }
}
function enterExit() {
  const pl = G.player; if (pl.dead) return;
  if (pl.vehicle) { const v = pl.vehicle; G.exitVehicle(pl, Math.abs(v.speed) > 7); G.cam.yaw = v.yaw; return; }
  let best = null, bd = 3.2;
  for (const v of G.vehicles) {
    if (v.removed || v.dead || v.sinkT > 0) continue;
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw), dx = pl.pos.x - v.pos.x, dz = pl.pos.z - v.pos.z;
    const lz = dx * s + dz * c, lx = dx * c - dz * s;
    const ex = Math.max(0, Math.abs(lx) - v.W / 2), ez = Math.max(0, Math.abs(lz) - v.L / 2); const d = Math.hypot(ex, ez);
    if (d < bd) { bd = d; best = v; }
  }
  if (best) {
    if (pl.weapon !== 'pistol' && pl.weapon !== 'smg') G.setWeapon(pl, pl.inv.smg ? 'smg' : pl.inv.pistol ? 'pistol' : pl.weapon);
    G.enterVehicle(pl, best);
  }
}
function readInput() {
  const k = (c) => (keys[c] ? 1 : 0); const inp = G.input;
  inp.fwd = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
  inp.right = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
  const t = G.touchMove;
  if (t) { inp.fwd = G.clamp(inp.fwd - t.y, -1, 1); inp.right = G.clamp(inp.right + t.x, -1, 1); }
  inp.sprint = !!(keys.ShiftLeft || keys.ShiftRight || (t && t.sprint)); inp.jump = !!keys.Space; inp.aim = mouseR;
  inp.car.throttle = inp.fwd; inp.car.steer = -inp.right; inp.car.handbrake = !!keys.Space;
}

// ---------------- weather & time ----------------
const SKY_DAY = new THREE.Color(0x9cc4e4), SKY_NIGHT = new THREE.Color(0x0a0f1e), SKY_DUSK = new THREE.Color(0xe39a6a), SKY_RAIN = new THREE.Color(0x8a939c);
let rain = null, rainOn = false, rainK = 0, weatherT = 90;
function makeRain() {
  const N = G.mobile ? 900 : 2500, pos = new Float32Array(N * 6);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45 }));
  rain.frustumCulled = false; rain.userData.drops = Array.from({ length: N }, () => [G.rand(-40, 40), G.rand(0, 30), G.rand(-40, 40)]);
  scene.add(rain);
}
function updateWorldTime(dt) {
  const c = G.clock; c.min = (c.min + dt * 1.0) % 1440; c.hour = c.min / 60;
  const hh = Math.floor(c.hour), mm = Math.floor(c.min % 60); c.str = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  const alt = Math.sin((c.hour - 6) / 12 * Math.PI); c.night = alt < -0.05;
  weatherT -= dt; if (weatherT <= 0) { rainOn = Math.random() < 0.4; weatherT = G.rand(60, 180); if (rainOn) G.hud.notify('It\'s started raining. Typical Lancaster.'); }
  rainK = G.lerp(rainK, rainOn ? 1 : 0, dt * 0.3);
  const day = G.clamp(alt * 3, 0, 1), dusk = G.clamp(1 - Math.abs(alt) * 4, 0, 1);
  const sky = SKY_NIGHT.clone().lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.5).lerp(SKY_RAIN.clone().multiplyScalar(0.3 + day * 0.7), rainK * 0.7);
  scene.background.copy(sky); scene.fog.color.copy(sky);
  scene.fog.far = G.lerp(G.mobile ? 650 : 1000, 380, rainK); scene.fog.near = G.lerp(180, 60, rainK);
  sun.intensity = (0.15 + 2.1 * day) * (1 - rainK * 0.6); hemi.intensity = (0.38 + 0.6 * day) * (1 - rainK * 0.3) + 0.05;
  sun.color.setHSL(0.1, 0.6, G.lerp(0.75, 0.9, day));
  const ang = (c.hour - 6) / 12 * Math.PI;
  const p = G.player.pos;
  sun.position.set(p.x + Math.cos(ang) * 120 + 30, Math.max(25, Math.sin(Math.abs(ang)) * 160), p.z + 60); sun.target.position.set(p.x, 0, p.z);
  const nightK = G.clamp(-alt * 4 + 0.3, 0, 1);
  G.windowMat.emissiveIntensity = nightK * 0.9; G.lampMat.emissiveIntensity = nightK * 2.5;
  if (!rain) makeRain();
  rain.visible = rainK > 0.05; rain.material.opacity = 0.45 * rainK;
  if (rain.visible) {
    const arr = rain.geometry.attributes.position.array, drops = rain.userData.drops, cx = camera.position.x, cz = camera.position.z;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i]; d[1] -= dt * 22; if (d[1] < 0) { d[0] = G.rand(-40, 40); d[1] = 30; d[2] = G.rand(-40, 40); }
      const x = cx + d[0], z = cz + d[2];
      arr[i * 6] = x; arr[i * 6 + 1] = d[1]; arr[i * 6 + 2] = z; arr[i * 6 + 3] = x + 0.05; arr[i * 6 + 4] = d[1] + 0.7; arr[i * 6 + 5] = z;
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------------- camera ----------------
function updateCamera(dt) {
  const pl = G.player, cm = G.cam;
  if (G._freeCam) { camera.position.copy(G._freeCam.pos); camera.lookAt(G._freeCam.look); return; }
  let target, dist, shoulder = 0, h;
  cm.mouseT -= dt;
  if (pl.vehicle) {
    const v = pl.vehicle;
    if (cm.mouseT <= 0 && Math.abs(v.speed) > 2) { const want = v.speed >= 0 ? v.yaw : v.yaw; cm.yaw += G.angDiff(cm.yaw, want) * Math.min(1, dt * 2.5); cm.pitch = G.lerp(cm.pitch, 0.2, dt * 2); }
    dist = 5.5 + v.L * 0.6 + Math.min(4, Math.abs(v.speed) * 0.06); h = v.spec.H + 0.6;
    target = new V3(v.pos.x, h, v.pos.z);
  } else {
    dist = pl.aiming ? 2.6 : 4.6; shoulder = pl.aiming ? 0.55 : 0.3;
    target = new V3(pl.pos.x, pl.pos.y + (pl.swim ? 0.6 : 1.6), pl.pos.z);
    if (pl.dead) { dist = 7; cm.yaw += dt * 0.2; cm.pitch = G.lerp(cm.pitch, 0.6, dt); }
  }
  const f = new V3(Math.sin(cm.yaw) * Math.cos(cm.pitch), -Math.sin(cm.pitch), Math.cos(cm.yaw) * Math.cos(cm.pitch));
  const right = new V3(-Math.cos(cm.yaw), 0, Math.sin(cm.yaw));
  cm.curDist = G.lerp(cm.curDist, dist, Math.min(1, dt * 6));
  let want = target.clone().addScaledVector(f, -cm.curDist).addScaledVector(right, shoulder);
  // collide with buildings
  const k = G.grid.march(target.x, target.z, want.x, want.z, G.solidForCam);
  if (k < 1) { const kk = Math.max(0.1, k - 0.08); want = target.clone().lerp(want, kk); }
  if (want.y < 0.35) want.y = 0.35;
  camera.position.copy(want);
  if (cm.shake > 0) { camera.position.add(new V3(G.rand(-1, 1), G.rand(-1, 1), G.rand(-1, 1)).multiplyScalar(cm.shake * 0.15)); cm.shake = Math.max(0, cm.shake - dt * 2.5); }
  camera.lookAt(want.clone().add(f));
  const fov = pl.vehicle ? 68 + Math.min(14, Math.abs(pl.vehicle.speed) * 0.35) : pl.aiming ? 55 : 68;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = G.lerp(camera.fov, fov, Math.min(1, dt * 6)); camera.updateProjectionMatrix(); }
}

// ---------------- boot ----------------
async function boot() {
  const st = (s) => { $('loadstatus').textContent = s; };
  try {
    await G.buildWorld(st);
  } catch (e) { console.error(e); st('Failed to build campus: ' + e.message); return; }
  G.fx.init(); G.hud.init();
  const sp = G.spots.spawn;
  const pl = G.player = new G.Actor('player', sp.x, sp.z);
  pl.money = 50; pl.inv = { pistol: { clip: 12, ammo: 36 } }; pl.reloadT = 0; pl.armor = 0;
  G.actors.push(pl);
  // weapon & health pickups at real landmarks
  const PICKS = [
    ['pistol', 'Lancaster University Library'], ['pistol', 'George Fox Building'], ['pistol', 'Fylde College'],
    ['smg', 'Bowland Tower'], ['smg', 'Infolab21'], ['smg', 'Charles Carter Building'],
    ['shotgun', 'Lancaster University Sports Centre'], ['shotgun', 'Furness College'], ['shotgun', 'Grizedale College'],
    ['rpg', 'Lake Carter'], ['rpg', 'Engineering Two'],
    ['health', 'Medical Centre'], ['health', 'Lancaster University Pharmacy'], ['health', 'County Main'], ['health', 'Graduate College'],
    ['armor', 'Security Lodge'], ['armor', 'Physics Building'], ['armor', 'Lancaster Institute for Contemporary Arts'],
  ];
  for (const [kind, place] of PICKS) {
    const p = G.findPlace(place); if (!p) continue;
    const f = G.grid.nearestFree(p.x, p.z, (v) => v === G.FREE, 70);
    G.spawnPickup(kind, f.x, f.z, { respawn: 60 });
  }
  G.setupShops();
  // face down the Spine-ish: toward the nearest road
  let bestYaw = 0, bestL = -1;
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const L = G.grid.march(sp.x, sp.z, sp.x + Math.sin(a) * 80, sp.z + Math.cos(a) * 80, G.solidForWalk); if (L > bestL) { bestL = L; bestYaw = a; } }
  G.cam.yaw = bestYaw; pl.yaw = bestYaw;
  st(`Campus ready: ${window.CAMPUS.buildings.length} buildings, ${G.treeCount} trees, ${G.shops.length} shops to rob.`);
  $('play').disabled = false;
  G.populatePeds(); G.populateTraffic();
  renderer.compile(scene, camera);
  requestAnimationFrame(loop);
}
$('play').addEventListener('click', () => {
  G.audio.init();
  if (!G.state.started) { G.state.started = true; $('hud').classList.remove('hidden'); G.hud.notify('Welcome to Bailrigg. You start in Alexandra Square.'); G.hud.notify('F to steal a car. Find guns around campus (white dots on the map).'); }
  lockPointer();
  if (G.mobile) {
    const el = document.documentElement; const fs = el.requestFullscreen || el.webkitRequestFullscreen;
    try { const pr = fs && fs.call(el); if (pr && pr.then) pr.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (e) { /* iPhone Safari has no fullscreen */ }
  }
  G.state.paused = false; $('menu').classList.add('hidden');
});

let last = performance.now(), popT = 0, labelT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.state.started || G.state.paused) { if (G.touchUpdate) G.touchUpdate(0); if (G.player) { updateCamera(0); } renderer.render(scene, camera); return; }
  if (G.touchUpdate) G.touchUpdate(dt);
  readInput();
  update(dt);
  G.hud.update(dt);
  renderer.render(scene, camera);
}
function update(dt) {
  G.time += dt;
  const pl = G.player;
  const inp = G.state.over ? { fwd: 0, right: 0, sprint: false, jump: false, aim: false, car: { throttle: 0, steer: 0, handbrake: true } } : G.input;
  if (G.state.over) G.input.car = inp.car;
  // firing
  if (!G.state.over && (firePressed || (mouseL && G.WEAPONS[pl.weapon].auto))) {
    if (!pl.vehicle || pl.weapon === 'pistol' || pl.weapon === 'smg') G.playerFire(pl);
  }
  firePressed = false;
  G.updatePlayer(pl, dt, inp);
  for (const v of G.vehicles) v.update(dt);
  G.vehicleCollisions(dt);
  for (const a of G.actors) if (a !== pl) a.think(dt);
  if (pl.vehicle && pl.vehicle.dead && pl.vehicle.drowned) { G.exitVehicle(pl, false); }
  if (pl.dead && !G.state.over) G.wasted();
  if (G.police.stars > 0 || G.actors.some((a) => a.state === 'fight')) G.updateFlow(dt);
  G.police.update(dt); G.updateHeli(dt); G.updateRockets(dt); G.updatePickups(dt); G.updateShops(dt);
  G.fx.update(dt);
  popT -= dt; if (popT <= 0) { popT = 0.5; G.populatePeds(); G.populateTraffic(); for (let i = G.vehicles.length - 1; i >= 0; i--) if (G.vehicles[i].removed) G.vehicles.splice(i, 1); }
  updateWorldTime(dt);
  updateCamera(dt);
  labelT -= dt;
  if (labelT <= 0) { labelT = 0.3; const cx = camera.position.x, cz = camera.position.z; for (const l of G.labels) l.s.visible = G.d2(l.x, l.z, cx, cz) < l.r * l.r; }
  if (G.waypoint && Math.hypot(G.waypoint.x - pl.pos.x, G.waypoint.z - pl.pos.z) < 12) { G.waypoint = null; G.hud.notify('Waypoint reached'); }
  // audio
  let sirenDist = null; for (const v of G.vehicles) if (v.sirenOn && !v.dead) { const d = G.camDist(v.pos); if (sirenDist === null || d < sirenDist) sirenDist = d; }
  G.audio.update({ engineOn: !!pl.vehicle && !pl.vehicle.dead, engineSpeed: pl.vehicle ? pl.vehicle.speed : 0, throttle: pl.vehicle && G.input.car.throttle !== 0, sirenDist });
}
G._update = update; G._readInput = readInput; G._enterExit = enterExit;
G._debug = { keys, get mouse() { return { mouseL, mouseR }; }, setFire(v) { mouseL = v; if (v) firePressed = true; }, setAim(v) { mouseR = v; } };
G._cycleWeapon = (d) => cycleWeapon(d); G._toggleMap = () => toggleMap();
G._pause = () => { G.state.paused = true; $('menu').classList.remove('hidden'); $('play').textContent = 'RESUME'; };
boot();
})();
