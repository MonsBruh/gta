// Wanted level, police response and the helicopter.
'use strict';
(() => {
const V3 = THREE.Vector3;
const P = G.police = { stars: 0, heat: 0, lostT: 0, arrest: 0, spawnT: 0, kills: 0, seen: false };

P.reset = () => { P.stars = 0; P.heat = 0; P.lostT = 0; P.arrest = 0; P.kills = 0; P.civKills = 0; };
const atLeast = (n) => { if (P.stars < n) { P.stars = Math.min(5, n); P.lostT = 0; } };
P.crime = (type, pos) => {
  const copNear = G.actors.some((a) => a.kind === 'cop' && !a.dead && pos && G.dist(a.pos, pos) < 45) || G.vehicles.some((v) => v.type === 'police' && v.driver && !v.dead && pos && G.dist(v.pos, pos) < 45);
  switch (type) {
    case 'assault': P.heat += 4; if (copNear) atLeast(1); break;
    case 'gunfire': P.heat += 1.2; if (copNear) atLeast(1); break;
    case 'carjack': P.heat += 12; if (copNear) atLeast(1); break;
    case 'copcar': atLeast(1); P.heat += 5; break;
    case 'assaultcop': atLeast(Math.max(2, P.stars)); P.heat += 15; break;
    case 'kill': P.civKills = (P.civKills || 0) + 1; atLeast(1); P.heat += 22; break;
    case 'killcop': P.kills++; atLeast(Math.min(5, P.stars + 1)); P.heat += 60; break;
    case 'robbery': atLeast(2); P.heat += 30; break;
    case 'explosion': atLeast(Math.max(2, P.stars)); P.heat += 20; break;
  }
  P.lostT = 0;
  // heat escalates stars
  const byHeat = P.heat > 380 ? 5 : P.heat > 230 ? 4 : P.heat > 140 ? 3 : P.heat > 70 ? 2 : P.heat > 20 ? 1 : 0;
  if (byHeat > P.stars) atLeast(byHeat);
};

const maxUnits = [0, 2, 3, 4, 5, 6];
P.update = (dt) => {
  const pl = G.player;
  if (pl.dead) { P.arrest = 0; return; }
  if (P.stars === 0) { P.heat = Math.max(0, P.heat - dt * 2); P.arrest = 0; return; }
  // can any cop see the player?
  const tp = pl.vehicle ? pl.vehicle.pos : pl.pos; const eye = new V3(tp.x, tp.y + 1.3, tp.z);
  let seen = false;
  for (const a of G.actors) if (a.kind === 'cop' && !a.dead && G.dist(a.pos, tp) < 70 && G.lineOfSight(new V3(a.pos.x, a.pos.y + 1.5, a.pos.z), eye, true)) { seen = true; break; }
  if (!seen) for (const v of G.vehicles) if (v.type === 'police' && v.driver && v.driver !== pl && !v.dead && G.dist(v.pos, tp) < 60 && G.lineOfSight(new V3(v.pos.x, v.pos.y + 1.4, v.pos.z), eye, true)) { seen = true; break; }
  if (G.heli && !G.heli.dead && G.dist(G.heli.pos, tp) < 60) seen = true;
  P.seen = seen;
  // stars only fade while you're hidden from units that are actually searching nearby
  const searching = G.actors.some((a) => a.kind === 'cop' && !a.dead && G.dist(a.pos, tp) < 120) || G.vehicles.some((v) => v.copUnit && !v.dead && G.dist(v.pos, tp) < 120);
  if (seen) P.lostT = 0; else P.lostT += dt * (searching ? 1 : 0.35);
  const loseTime = 18 + P.stars * 7;
  if (P.lostT > loseTime) { G.hud.notify('You lost the police.'); P.stars = 0; P.heat = 0; P.lostT = 0; P.arrest = 0; for (const v of G.vehicles) if (v.type === 'police') v.sirenOn = false; return; }
  P.heat = Math.max(0, P.heat - dt * 0.5);
  // arrest
  P.arrest = Math.max(0, P.arrest - dt * 0.4);
  if (P.arrest > 1.3) { G.busted(); return; }
  // spawn units
  P.spawnT -= dt;
  let units = 0; for (const v of G.vehicles) if (v.type === 'police' && !v.dead && !v.removed && v.copUnit) units++;
  if (P.spawnT <= 0 && units < maxUnits[P.stars]) { P.spawnT = 4; spawnCopCar(); }
  // helicopter
  if (P.stars >= 3 && !G.heli) spawnHeli();
};

function spawnCopCar() {
  const pl = G.player; const tp = pl.vehicle ? pl.vehicle.pos : pl.pos;
  const nodes = G.roadGraph.buckets.near(tp.x, tp.z, 200);
  for (let k = 0; k < 15; k++) {
    const n = G.pick(nodes); if (!n) return;
    const d = Math.hypot(n.x - tp.x, n.z - tp.z); if (d < 80 || d > 190) continue;
    const e = G.pick(n.adj); if (!e) continue;
    const yaw = Math.atan2(e.n.x - n.x, e.n.z - n.z);
    const v = new G.Vehicle(P.stars >= 4 && Math.random() < 0.4 ? 'van' : 'police', n.x, n.z, yaw, n.y);
    if (v.type === 'van') { v.siren = true; v.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.color && !Array.isArray(o.material)) { /* keep */ } }); }
    if (v.blockedAt(n.x, n.z, yaw)) { v.remove(); continue; }
    v.copUnit = true; v.sirenOn = true;
    G.vehicles.push(v);
    const crew = v.type === 'van' ? 3 : 2;
    for (let i = 0; i < crew; i++) {
      const c = new G.Actor('cop', n.x, n.z, n.y); c.car = v; c.vehicle = v; c.mesh.visible = false;
      if (P.stars >= 4 && i > 0) { c.weapon = 'smg'; G.setGunModel(c.mesh, 'smg'); }
      v.passengers.push(c); G.actors.push(c);
    }
    v.driver = v.passengers[0];
    v.ai = { mode: 'chase', from: n, to: e.n, road: e.r, speedMul: 1 };
    return;
  }
}

// ---------------- helicopter ----------------
function spawnHeli() {
  const m = G.makeHeli(); const pl = G.player;
  const a = Math.random() * 6.28;
  const h = { m, pos: new V3(pl.pos.x + Math.cos(a) * 200, pl.pos.y + 60, pl.pos.z + Math.sin(a) * 200), hp: 700, dead: false, cool: 2, vel: new V3(), orbit: Math.random() * 6 };
  m.position.copy(h.pos); G.scene.add(m); G.heli = h;
}
G.heliDamage = (d, by) => {
  const h = G.heli; if (!h || h.dead) return;
  h.hp -= d; if (h.hp <= 0) { h.dead = true; h.fallV = 0; if (by === G.player) P.crime('killcop', h.pos); G.fx.explosion(h.pos.clone(), 5); G.audio.explosion(G.camDist(h.pos)); }
};
G.updateHeli = (dt) => {
  const h = G.heli; if (!h) return;
  const pl = G.player, p = h.m.userData.parts;
  p.rotor.rotation.y += dt * 30; p.trotor.rotation.x += dt * 40;
  if (h.dead) {
    h.fallV += 20 * dt; h.pos.y -= h.fallV * dt; h.m.rotation.y += dt * 5; h.m.rotation.z += dt;
    if (Math.random() < dt * 40) G.fx.smoke(h.pos, true);
    const hg = G.groundAt(h.pos.x, h.pos.z); if (h.pos.y <= hg + 1) { G.explode(h.pos.clone().setY(hg + 1), 10, 200, G.player, null); G.scene.remove(h.m); G.heli = null; }
    h.m.position.copy(h.pos); return;
  }
  const tp = pl.vehicle ? pl.vehicle.pos : pl.pos;
  if (P.stars < 3 || pl.dead) {
    // fly away
    h.vel.lerp(new V3(h.pos.x - tp.x, 8, h.pos.z - tp.z).normalize().multiplyScalar(25), dt);
    h.pos.addScaledVector(h.vel, dt); h.m.position.copy(h.pos);
    if (G.dist(h.pos, tp) > 350) { G.scene.remove(h.m); G.heli = null; }
    return;
  }
  h.orbit += dt * 0.25;
  const goal = new V3(tp.x + Math.cos(h.orbit) * 28, Math.max(tp.y, G.groundAt(tp.x + Math.cos(h.orbit) * 28, tp.z + Math.sin(h.orbit) * 28)) + 34, tp.z + Math.sin(h.orbit) * 28);
  const want = goal.sub(h.pos); const dist = want.length();
  want.normalize().multiplyScalar(Math.min(28, dist * 0.8));
  h.vel.lerp(want, Math.min(1, dt * 1.5)); h.pos.addScaledVector(h.vel, dt);
  h.m.position.copy(h.pos);
  h.m.rotation.y = Math.atan2(tp.x - h.pos.x, tp.z - h.pos.z);
  h.m.rotation.x = G.clamp(h.vel.length() * 0.01, 0, 0.25);
  p.spot.intensity = G.clock.night ? 300 : 0; p.spot.target.position.set(0, -40, 10);
  // shoot at 4+ stars
  h.cool -= dt;
  if (P.stars >= 4 && h.cool <= 0 && G.lineOfSight(h.pos, new V3(tp.x, tp.y + 1, tp.z), true)) {
    h.cool = 0.12; h.burst = (h.burst || 0) + 1; if (h.burst > 8) { h.burst = 0; h.cool = 2.2; }
    const fake = { pos: new V3(h.pos.x, h.pos.y - 2.5, h.pos.z), yaw: 0, kind: 'cop', vehicle: null, weapon: 'smg', chest: () => new V3(h.pos.x, h.pos.y - 2.5, h.pos.z) };
    G.npcShoot(fake, pl, 0.4);
  }
};

// ---------------- busted / wasted ----------------
G.busted = () => {
  const pl = G.player; if (pl.dead || G.state.over) return;
  G.state.over = 'busted'; G.audio.busted(); G.hud.big('BUSTED', 'busted');
  if (pl.vehicle) G.exitVehicle(pl, false);
  pl.state = 'down'; pl.downT = 99;
  setTimeout(() => G.respawn(G.spots.police, 'busted'), 3500);
};
G.wasted = () => {
  const pl = G.player; if (G.state.over) return;
  G.state.over = 'wasted'; G.audio.wasted(); G.hud.big('WASTED', 'wasted');
  setTimeout(() => G.respawn(G.spots.hospital, 'wasted'), 4000);
};
G.respawn = (spot, why) => {
  const pl = G.player;
  if (pl.vehicle) G.exitVehicle(pl, false);
  pl.dead = false; pl.hp = pl.maxHp; pl.armor = 0; pl.state = 'walk'; pl.downT = 0; pl.mesh.rotation.x = 0;
  pl.pos.set(spot.x, G.groundAt(spot.x, spot.z), spot.z); pl.push.set(0, 0, 0); pl.vy = 0; pl.air = false;
  const fee = why === 'wasted' ? Math.min(pl.money, 100) : Math.min(pl.money, 150);
  G.addMoney(-fee);
  // lose weapons (keep fists and a few bullets)
  pl.inv = { pistol: { clip: 12, ammo: 12 } }; G.setWeapon(pl, 'fists');
  P.reset();
  for (const v of G.vehicles) if (v.type === 'police') v.sirenOn = false;
  for (let i = G.actors.length - 1; i >= 0; i--) { const a = G.actors[i]; if (a.kind === 'cop' && !a.vehicle) { a.remove(); G.actors.splice(i, 1); } }
  G.hud.big('', ''); G.state.over = null;
  G.hud.notify(why === 'wasted' ? `Discharged from the Medical Centre. Bill: $${fee}` : `Released by Campus Security. Fine: $${fee}. Weapons confiscated.`);
  G.cam.yaw = pl.yaw;
};
})();
