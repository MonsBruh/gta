// Weapons, damage, explosions, pickups and shop robberies.
'use strict';
(() => {
const V3 = THREE.Vector3;
G.WEAPONS = {
  fists:   { name: 'Fists', slot: 1 },
  pistol:  { name: 'Pistol', slot: 2, dmg: 28, rate: 0.28, mag: 12, spread: 0.012, range: 120, reload: 1.1 },
  smg:     { name: 'SMG', slot: 3, dmg: 15, rate: 0.075, mag: 30, spread: 0.035, range: 100, reload: 1.6, auto: true },
  shotgun: { name: 'Shotgun', slot: 4, dmg: 13, rate: 0.85, mag: 6, spread: 0.08, range: 45, reload: 2.0, pellets: 9 },
  rpg:     { name: 'Rocket Launcher', slot: 5, dmg: 0, rate: 1.4, mag: 1, spread: 0.0, range: 300, reload: 2.2, rocket: true },
};
G.WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rpg'];

// ---------------- line of sight / ray casting ----------------
G.lineOfSight = (a, b, ignoreLow) => G.march3(a, b, ignoreLow ? G.solidForCam : G.solidForShot, 0.6) >= 1;
// returns {t, point, actor, vehicle, heli, head}
G.raycast = (o, d, range, ignore) => {
  let best = { t: range, kind: 'none' };
  // world (2D march, buildings treated as tall)
  // world: buildings, terrain, the Underpass deck & walls (3D march)
  const end = new V3(o.x + d.x * range, o.y + d.y * range, o.z + d.z * range);
  const hf = G.march3(o, end, G.solidForShot, 0.4);
  if (hf < 1) best = { t: hf * range, kind: G.pointSolid(o.x + d.x * (hf * range + 0.4), o.y + d.y * (hf * range + 0.4), o.z + d.z * (hf * range + 0.4)) ? 'ground' : 'wall' };
  // people: two spheres
  for (const a of G.actors) {
    if (a === ignore || a.vehicle || a.removed) continue;
    const dx = a.pos.x - o.x, dz = a.pos.z - o.z; if (dx * dx + dz * dz > (best.t + 2) ** 2) continue;
    const lying = a.dead || a.state === 'down';
    const spheres = lying ? [[0.25, 0.45]] : a.swim ? [[0.3, 0.4]] : [[1.15, 0.38], [0.55, 0.3], [1.68, 0.17]];
    for (let s = 0; s < spheres.length; s++) {
      const cy = a.pos.y + spheres[s][0], r = spheres[s][1];
      const cx = a.pos.x - o.x, cyy = cy - o.y, cz = a.pos.z - o.z;
      const tc = cx * d.x + cyy * d.y + cz * d.z; if (tc < 0) continue;
      const d2 = cx * cx + cyy * cyy + cz * cz - tc * tc; if (d2 > r * r) continue;
      const t = tc - Math.sqrt(r * r - d2);
      if (t < best.t) best = { t, kind: 'actor', actor: a, head: s === 2 && !lying };
    }
  }
  // vehicles: oriented box
  for (const v of G.vehicles) {
    if (v.removed || (ignore && ignore.vehicle === v)) continue;
    const dx = v.pos.x - o.x, dz = v.pos.z - o.z; if (dx * dx + dz * dz > (best.t + v.L) ** 2) continue;
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const lo = { x: (o.x - v.pos.x) * c - (o.z - v.pos.z) * s, y: o.y - v.pos.y, z: (o.x - v.pos.x) * s + (o.z - v.pos.z) * c };
    const ld = { x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c };
    const mn = [-v.W / 2, 0.2, -v.L / 2], mx = [v.W / 2, v.spec.H, v.L / 2];
    let t0 = 0, t1 = best.t; const oo = [lo.x, lo.y, lo.z], dd = [ld.x, ld.y, ld.z]; let ok = true;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(dd[k]) < 1e-8) { if (oo[k] < mn[k] || oo[k] > mx[k]) { ok = false; break; } continue; }
      let ta = (mn[k] - oo[k]) / dd[k], tb = (mx[k] - oo[k]) / dd[k]; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < best.t) best = { t: t0, kind: 'vehicle', vehicle: v };
  }
  if (G.heli && !G.heli.removed) {
    const h = G.heli.pos; const cx = h.x - o.x, cy = h.y - o.y, cz = h.z - o.z;
    const tc = cx * d.x + cy * d.y + cz * d.z, d2 = cx * cx + cy * cy + cz * cz - tc * tc;
    if (tc > 0 && d2 < 4) { const t = tc - Math.sqrt(4 - d2); if (t < best.t) best = { t, kind: 'heli' }; }
  }
  best.point = new V3(o.x + d.x * best.t, o.y + d.y * best.t, o.z + d.z * best.t);
  return best;
};

// ---------------- damage ----------------
G.damageActor = (a, dmg, by, type) => {
  if (a.dead || a.removed) return;
  if (a === G.player && G.godMode) return;
  if (a.armor > 0 && type !== 'fall') { const ab = Math.min(a.armor, dmg * 0.7); a.armor -= ab; dmg -= ab; }
  a.hp -= dmg;
  if (a === G.player) { G.hud.hurt(); }
  if (by === G.player && a !== G.player) {
    if (a.kind === 'cop') G.police.crime('assaultcop', a.pos);
    else G.police.crime('assault', a.pos);
    if (a.kind === 'civ' && a.hp > 0 && !a.vehicle) {
      if (type === 'punch' && Math.random() < 0.35) { a.state = 'fight'; a.target = by; a.fightT = 12; }
      else if (a.state !== 'down') { a.state = 'flee'; a.fleeT = 12; a.threat = by.pos.clone(); }
    }
  }
  if (a.hp <= 0) {
    a.hp = 0; a.dead = true; a.state = 'dead'; a.deadT = 0; a.aiming = false;
    if (a.vehicle) G.exitVehicle(a, false);
    G.fx.decal(a.pos.x, a.pos.z, 0.8, undefined, undefined, a.pos.y);
    if (a !== G.player) {
      if (by === G.player) G.police.crime(a.kind === 'cop' ? 'killcop' : 'kill', a.pos);
      const cash = a.kind === 'cop' ? G.randi(20, 60) : G.randi(4, 45);
      G.spawnPickup('cash', a.pos.x + G.rand(-0.4, 0.4), a.pos.z + G.rand(-0.4, 0.4), { amount: cash, temp: 30, y: a.pos.y });
      if (a.kind === 'cop' && Math.random() < 0.6) G.spawnPickup('pistol', a.pos.x + 0.5, a.pos.z, { ammo: 12, temp: 30, y: a.pos.y });
      G.panic(a.pos.x, a.pos.z, 25, 0.9);
    }
  }
};

// melee: hit the closest person (or car) in front
G.melee = (att, dmg) => {
  const f = att.fwd(); let best = null, bd = 1.7;
  for (const a of G.actors) {
    if (a === att || a.vehicle || a.dead || a.removed) continue;
    const dx = a.pos.x - att.pos.x, dz = a.pos.z - att.pos.z, d = Math.hypot(dx, dz);
    if (Math.abs(a.pos.y - att.pos.y) > 1.5) continue;
    if (d < bd && (dx * f.x + dz * f.z) / (d || 1) > 0.35) { bd = d; best = a; }
  }
  G.audio.whoosh();
  if (best) {
    G.audio.punch(G.camDist(best.pos));
    best.push.set(f.x * 6, 0, f.z * 6);
    const ko = Math.random() < 0.25 && best !== G.player;
    if (ko) { best.state = 'down'; best.downT = G.rand(1.5, 3); }
    G.damageActor(best, dmg, att, 'punch');
    G.fx.blood(best.chest().clone());
    if (att === G.player) G.hud.hitMark();
    return true;
  }
  if (att === G.player) {
    for (const v of G.vehicles) if (G.dist(v.pos, att.pos) < v.L / 2 + 0.8) { v.damage(3, att); G.audio.punch(0); return true; }
  }
  return false;
};

// hitscan bullet
const bulletHit = (shooter, o, d, w, accuracyBonus) => {
  const hit = G.raycast(o, d, w.range, shooter);
  const muzzle = shooter.vehicle ? new V3(shooter.pos.x, shooter.pos.y + 1.4, shooter.pos.z) : new V3(shooter.pos.x + Math.sin(shooter.yaw) * 0.5 - Math.cos(shooter.yaw) * 0.3, shooter.pos.y + 1.4, shooter.pos.z + Math.cos(shooter.yaw) * 0.5 + Math.sin(shooter.yaw) * 0.3);
  G.fx.tracer(muzzle, hit.point, shooter.kind === 'cop' ? 0xffb0a0 : 0xffe9a0);
  if (hit.kind === 'actor') {
    const dmg = w.dmg * (hit.head ? 2.5 : 1);
    hit.actor.push.addScaledVector(new V3(d.x, 0, d.z), 2.5);
    G.damageActor(hit.actor, dmg, shooter, 'bullet'); G.fx.blood(hit.point);
    if (shooter === G.player) G.hud.hitMark(hit.head);
  } else if (hit.kind === 'vehicle') { hit.vehicle.damage(w.dmg * 0.8, shooter); hit.vehicle.lastHitBy = shooter; G.fx.spark(hit.point); if (shooter === G.player && hit.vehicle.driver && hit.vehicle.driver.kind === 'civ' && hit.vehicle.ai) hit.vehicle.ai.panic = 10; }
  else if (hit.kind === 'heli') { G.heliDamage(w.dmg, shooter); G.fx.spark(hit.point); }
  else if (hit.kind !== 'none') G.fx.spark(hit.point);
  return { muzzle, hit };
};

// player fires along the camera ray
G.playerFire = (pl) => {
  const w = G.WEAPONS[pl.weapon];
  if (pl.weapon === 'fists') {
    if (pl.cool > 0 || pl.vehicle) return;
    pl.cool = 0.38; pl.punchT = 0.3; pl.punchSide = !pl.punchSide;
    G.melee(pl, 14 + Math.random() * 6);
    return;
  }
  if (pl.cool > 0 || pl.reloadT > 0) return;
  const inv = pl.inv[pl.weapon];
  if (!inv || inv.clip <= 0) { if (inv && inv.ammo > 0) G.reload(pl); else { G.audio.empty(); pl.cool = 0.3; } return; }
  inv.clip--; pl.cool = w.rate;
  const camO = G.camera.position.clone(); const camD = new V3(); G.camera.getWorldDirection(camD);
  // start ray at the player's depth so we don't hit things behind them
  const toPl = new V3(pl.pos.x - camO.x, pl.pos.y + 1.4 - camO.y, pl.pos.z - camO.z).dot(camD);
  const o = camO.clone().addScaledVector(camD, Math.max(0, toPl));
  const n = w.pellets || 1;
  let muzzle;
  if (w.rocket) {
    const mz = new V3(pl.pos.x, pl.pos.y + 1.5, pl.pos.z).addScaledVector(camD, 0.8);
    G.fireRocket(mz, camD.clone(), pl);
    G.audio.shot('rpg', 0); G.fx.muzzle(mz, true);
  } else {
    for (let i = 0; i < n; i++) {
      const sp = w.spread * (pl.aiming ? 0.6 : 1.2) * (pl.speedNow > 5 ? 1.8 : 1);
      const d = camD.clone().add(new V3(G.rand(-sp, sp), G.rand(-sp, sp), G.rand(-sp, sp))).normalize();
      muzzle = bulletHit(pl, o, d, w).muzzle;
    }
    G.audio.shot(pl.weapon, 0); G.fx.muzzle(muzzle, pl.weapon === 'shotgun');
  }
  G.shake(pl.weapon === 'shotgun' || w.rocket ? 0.35 : 0.08);
  G.police.crime('gunfire', pl.pos);
  G.panic(pl.pos.x, pl.pos.z, 45, 0.7);
  if (inv.clip <= 0 && inv.ammo > 0) G.reload(pl);
};
G.reload = (pl) => {
  const w = G.WEAPONS[pl.weapon]; const inv = pl.inv[pl.weapon];
  if (!inv || !w.mag || inv.clip >= w.mag || inv.ammo <= 0 || pl.reloadT > 0) return;
  pl.reloadT = w.reload; G.audio.reload();
  setTimeout(() => { const need = Math.min(w.mag - inv.clip, inv.ammo); inv.clip += need; inv.ammo -= need; pl.reloadT = 0; }, w.reload * 1000);
};

// NPC shoots at a target actor
G.npcShoot = (npc, tgt, acc) => {
  const w = G.WEAPONS[npc.weapon] || G.WEAPONS.pistol;
  const o = npc.chest().clone(); o.y += 0.15;
  const tp = tgt.vehicle ? new V3(tgt.vehicle.pos.x, tgt.vehicle.pos.y + 1.0, tgt.vehicle.pos.z) : new V3(tgt.pos.x, tgt.pos.y + 1.2, tgt.pos.z);
  const d = tp.clone().sub(o); const dist = d.length(); d.normalize();
  const miss = (1 - acc) * 0.12 + dist * 0.0015 + (tgt.speedNow || 0) * 0.006;
  d.add(new V3(G.rand(-miss, miss), G.rand(-miss, miss) * 0.6, G.rand(-miss, miss))).normalize();
  const { muzzle } = bulletHit(npc, o, d, { ...w, dmg: w.dmg * 0.32 });
  G.fx.muzzle(muzzle, false); G.audio.shot(npc.weapon, G.camDist(npc.pos));
};

// ---------------- explosions & rockets ----------------
G.explode = (pos, r, dmg, by, src) => {
  G.fx.explosion(pos, r * 0.6); G.audio.explosion(G.camDist(pos)); G.shake(Math.max(0, 1.2 - G.camDist(pos) / 60));
  for (const a of G.actors) {
    if (a.removed) continue;
    const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z, (a.pos.y + 1 - pos.y) * 1.5); if (d > r) continue;
    const k = 1 - d / r;
    if (a.vehicle) continue;
    a.push.set((a.pos.x - pos.x) / (d || 1) * 14 * k, 0, (a.pos.z - pos.z) / (d || 1) * 14 * k);
    if (!a.dead) { a.state = 'down'; a.downT = 2; }
    G.damageActor(a, dmg * k, by, 'explosion');
  }
  for (const v of G.vehicles) {
    if (v === src || v.removed) continue;
    const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z, (v.pos.y + 1 - pos.y) * 1.5); if (d > r * 1.3) continue;
    const k = 1 - d / (r * 1.3);
    v.vel.x += (v.pos.x - pos.x) / (d || 1) * 10 * k; v.vel.z += (v.pos.z - pos.z) / (d || 1) * 10 * k;
    v.lastHitBy = by; v.damage(dmg * 8 * k, by);
  }
  if (G.heli && G.dist(G.heli.pos, pos) < r && Math.abs(G.heli.pos.y - pos.y) < r) G.heliDamage(dmg * 3, by);
  G.panic(pos.x, pos.z, 60, 1);
  if (by === G.player) G.police.crime('explosion', pos);
};
const rockets = [];
G.fireRocket = (pos, dir, by) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6).rotateX(Math.PI / 2), G.lam(0x445533));
  m.position.copy(pos); m.lookAt(pos.clone().add(dir)); G.scene.add(m);
  rockets.push({ m, pos: pos.clone(), dir, by, t: 0 });
};
G.updateRockets = (dt) => {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]; r.t += dt;
    const step = 60 * dt;
    const hit = G.raycast(r.pos, r.dir, step, r.by);
    if (hit.kind !== 'none' || r.t > 5) {
      G.explode(hit.kind !== 'none' ? hit.point : r.pos, 8, 180, r.by, null);
      G.scene.remove(r.m); rockets.splice(i, 1); continue;
    }
    r.pos.addScaledVector(r.dir, step); r.m.position.copy(r.pos);
    G.fx.smoke(r.pos, false); G.fx.spawn({ pos: r.pos, life: 0.1, size: 0.5, color: 0xffa040, add: true });
  }
};

// ---------------- pickups ----------------
const pickupModel = (kind) => {
  const g = new THREE.Group();
  const col = { cash: 0x3fbf5a, health: 0xff3030, armor: 0x3070ff, pistol: 0xdddddd, smg: 0xdddddd, shotgun: 0xdddddd, rpg: 0xdddddd }[kind];
  if (kind === 'cash') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.26), G.lam(0x3fbf5a, { emissive: 0x0a3010 })); g.add(b); }
  else if (kind === 'health') { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.2), G.lam(col, { emissive: 0x400000 }))); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), G.lam(col, { emissive: 0x400000 }))); }
  else if (kind === 'armor') { const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.15), G.lam(col, { emissive: 0x001040 })); g.add(s); }
  else {
    const len = { pistol: 0.35, smg: 0.55, shotgun: 0.9, rpg: 1.2 }[kind];
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, len), G.lam(0x222222)); g.add(b);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.1), G.lam(0x222222)); grip.position.set(0, -0.15, -len * 0.25); g.add(grip);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 6, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: kind === 'cash' ? 0x3fbf5a : kind === 'health' ? 0xff4040 : kind === 'armor' ? 0x4080ff : 0xffd34a }));
  ring.position.y = -0.55; g.add(ring);
  return g;
};
G.spawnPickup = (kind, x, z, opts = {}) => {
  const y = opts.y !== undefined ? opts.y : G.groundAt(x, z);
  const m = pickupModel(kind); m.position.set(x, y + 0.7, z); G.scene.add(m);
  const p = { kind, x, y, z, m, opts, active: true, respawn: 0 };
  if (opts.temp) p.ttl = opts.temp;
  G.pickups.push(p); return p;
};
G.updatePickups = (dt) => {
  const pl = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    if (!p.active) { p.respawn -= dt; if (p.respawn <= 0) { p.active = true; p.m.visible = true; } continue; }
    p.m.rotation.y += dt * 2; p.m.position.y = p.y + 0.75 + Math.sin(G.time * 3 + i) * 0.1;
    if (p.ttl !== undefined) { p.ttl -= dt; if (p.ttl <= 0) { G.scene.remove(p.m); G.pickups.splice(i, 1); continue; } }
    if (pl.dead || Math.abs(pl.pos.y - p.y) > 2 || Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) > (pl.vehicle ? 2.4 : 1.2)) continue;
    let took = true;
    if (p.kind === 'cash') { G.addMoney(p.opts.amount); G.audio.cash(); }
    else if (p.kind === 'health') { if (pl.hp >= pl.maxHp) took = false; else { pl.hp = pl.maxHp; G.hud.notify('Health restored'); G.audio.pickup(); } }
    else if (p.kind === 'armor') { if (pl.armor >= 100) took = false; else { pl.armor = 100; G.hud.notify('Body armour'); G.audio.pickup(); } }
    else {
      const w = G.WEAPONS[p.kind]; const amt = p.opts.ammo || w.mag * 3;
      if (!pl.inv[p.kind]) { pl.inv[p.kind] = { clip: Math.min(w.mag, amt), ammo: Math.max(0, amt - w.mag) }; if (!pl.vehicle) G.setWeapon(pl, p.kind); }
      else pl.inv[p.kind].ammo += amt;
      G.hud.notify(`${w.name} +${amt}`); G.audio.pickup();
    }
    if (!took) continue;
    if (p.opts.respawn) { p.active = false; p.m.visible = false; p.respawn = p.opts.respawn; }
    else { G.scene.remove(p.m); G.pickups.splice(i, 1); }
  }
};
G.setWeapon = (a, w) => { a.weapon = w; G.setGunModel(a.mesh, w); };
G.addMoney = (n) => { G.player.money = Math.max(0, G.player.money + n); };

// ---------------- shop robberies ----------------
G.shops = [];
G.setupShops = () => {
  const kinds = new Set(['convenience', 'fast_food', 'cafe', 'bar', 'pub', 'newsagent', 'bakery', 'pharmacy', 'restaurant', 'post_office', 'beverages', 'charity', 'hairdresser', 'copyshop', 'fuel']);
  for (const p of window.CAMPUS.pois) {
    if (!p.n || !kinds.has(p.k)) continue;
    if (Math.abs(p.x) > G.HW - 10 || Math.abs(p.z) > G.HH - 10) continue;
    const f = p.y !== undefined ? { x: p.x, z: p.z } : G.grid.nearestFree(p.x, p.z, (v) => v === G.FREE, 30);   // explicit spot (e.g. Spar upstairs)
    if (Math.hypot(f.x - p.x, f.z - p.z) > 30) continue;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.8, depthWrite: false }));
    const gy = p.y !== undefined ? p.y : G.groundAt(f.x, f.z); ring.position.set(f.x, gy + 0.06, f.z); G.scene.add(ring);
    const lbl = G.makeLabel('$ ' + p.n, { size: 0.7, depthTest: false, accent: '#3fbf5a' }); lbl.position.set(f.x, gy + 2.4, f.z); G.scene.add(lbl);
    G.shops.push({ n: p.n, x: f.x, y: gy, z: f.z, ring, lbl, cooldown: 0, prog: 0 });
  }
};
G.updateShops = (dt) => {
  const pl = G.player; let active = null;
  for (const s of G.shops) {
    s.cooldown = Math.max(0, s.cooldown - dt);
    const sd = Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z); s.ring.visible = s.cooldown <= 0 && sd < 80; s.lbl.visible = s.cooldown <= 0 && sd < 40;
    s.ring.rotation.y += dt;
    const near = !pl.vehicle && !pl.dead && Math.abs(pl.pos.y - s.y) < 2 && Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z) < 1.6 && s.cooldown <= 0;
    if (near && pl.weapon !== 'fists' && pl.aiming) {
      s.prog += dt; active = s;
      if (s.prog >= 4) {
        const amt = G.randi(150, 600); G.addMoney(amt); G.audio.cash(); s.prog = 0; s.cooldown = 240;
        G.hud.big(`$${amt} STOLEN`, 'good'); G.hud.notify(`You robbed ${s.n}`);
        G.police.crime('robbery', pl.pos);
      }
    } else if (near) { active = s; s.prog = Math.max(0, s.prog - dt * 2); }
    else s.prog = 0;
  }
  G.hud.progress(active ? (active.prog > 0 ? active.prog / 4 : 0) : null, active ? (pl.weapon === 'fists' ? `Draw a gun & aim to rob ${active.n}` : `Robbing ${active.n}…`) : '');
};
})();
