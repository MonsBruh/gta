// People: the player, students (civilians) and police on foot.
'use strict';
(() => {
const V3 = THREE.Vector3;
const tmp = new V3();

class Actor {
  constructor(kind, x, z, y) {
    this.kind = kind;
    this.mesh = G.makeHuman(kind); this.mesh.rotation.order = 'YXZ';
    this.parts = this.mesh.userData.parts;
    this.pos = new V3(x, y !== undefined ? y : G.groundAt(x, z), z); this.push = new V3(); this.vy = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.maxHp = kind === 'cop' ? 110 : kind === 'player' ? 100 : 55;
    this.hp = this.maxHp; this.armor = 0;
    this.radius = 0.34; this.state = kind === 'cop' ? 'chase' : 'walk';
    this.vehicle = null; this.phase = Math.random() * 10; this.speedNow = 0;
    this.weapon = kind === 'cop' ? 'pistol' : 'fists'; this.cool = 0; this.punchT = 0;
    this.downT = 0; this.dead = false; this.deadT = 0; this.aiming = false; this.t = 0; this.swim = false;
    this.lat = G.rand(-0.9, 0.9); this.walkSpeed = G.rand(1.2, 1.7);
    G.setGunModel(this.mesh, this.weapon);
    G.scene.add(this.mesh);
    this.syncMesh();
  }
  remove() { G.scene.remove(this.mesh); this.removed = true; }
  chest() { return tmp.set(this.pos.x, this.pos.y + (this.dead || this.state === 'down' ? 0.25 : this.swim ? 0.3 : 1.25), this.pos.z); }
  eye() { return new V3(this.pos.x, this.pos.y + 1.5, this.pos.z); }
  fwd() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  faceTo(x, z, dt, rate = 10) { const want = Math.atan2(x - this.pos.x, z - this.pos.z); this.yaw += G.angDiff(this.yaw, want) * Math.min(1, rate * dt); }
  // move with collision; returns blocked flag
  walk(dx, dz) {
    const npc = this.kind !== 'player';
    const ox = this.pos.x, oz = this.pos.z;
    const hit = G.moveCircle(this.pos, dx, dz, this.radius);
    if (npc && G.grid.get(this.pos.x, this.pos.z) === G.WATER) { this.pos.x = ox; this.pos.z = oz; return true; }
    return hit;
  }
  syncMesh() {
    this.mesh.position.set(this.pos.x, this.pos.y + (this.dead || this.state === 'down' ? 0.15 : 0) + (this.swim ? -1.05 : 0), this.pos.z);
    this.mesh.rotation.y = this.yaw;
  }
  animate(dt) {
    const p = this.parts, s = this.speedNow;
    const fallen = this.dead || this.state === 'down';
    const targetX = fallen ? -Math.PI / 2 : 0;
    this.mesh.rotation.x += (targetX - this.mesh.rotation.x) * Math.min(1, dt * 8);
    if (fallen) { p.legL.rotation.x = 0.1; p.legR.rotation.x = -0.1; p.armL.rotation.x = -0.4; p.armR.rotation.x = 0.3; return; }
    this.phase += s * dt * 2.4;
    const amp = Math.min(0.95, s * 0.17) * (this.vy !== 0 ? 0.3 : 1);
    const sw = Math.sin(this.phase) * amp;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8; p.armL.rotation.z = 0; p.armR.rotation.z = 0;
    if (this.swim) { p.armL.rotation.x = -2.5 + Math.sin(this.t * 5); p.armR.rotation.x = -2.5 - Math.sin(this.t * 5); }
    const armed = this.weapon !== 'fists';
    if ((this.aiming || this.cool > 0) && armed && !this.swim) {
      p.armR.rotation.x = -Math.PI / 2 + (this.aimPitch || 0); p.armR.rotation.z = 0;
      if (this.weapon !== 'pistol') { p.armL.rotation.x = -Math.PI / 2 + 0.2 + (this.aimPitch || 0); p.armL.rotation.z = -0.5; }
    }
    if (this.punchT > 0) { const k = Math.sin((1 - this.punchT / 0.3) * Math.PI); (this.punchSide ? p.armL : p.armR).rotation.x = -Math.PI / 2 * k - 0.2; }
    if (this.state === 'cower') { p.armL.rotation.x = -2.6; p.armR.rotation.x = -2.6; }
    this.parts.head.rotation.x = this.aiming ? (this.aimPitch || 0) * 0.5 : 0;
  }

  // -------- NPC brain --------
  think(dt) {
    this.t += dt; this.cool = Math.max(0, this.cool - dt); this.punchT = Math.max(0, this.punchT - dt);
    if (this.dead) { this.deadT += dt; this.speedNow = 0; if (this.deadT < 6) G.settle(this, dt); this.syncMesh(); this.animate(dt); return; }
    if (this.vehicle) { this.pos.copy(this.vehicle.pos); return; }
    // knockback
    if (this.push.lengthSq() > 0.01) { this.walk(this.push.x * dt, this.push.z * dt); this.push.multiplyScalar(Math.max(0, 1 - dt * 5)); }
    const ox = this.pos.x, oz = this.pos.z;
    const land = G.settle(this, dt);
    if (land > 13) { G.damageActor(this, (land - 13) * 9, null, 'fall'); this.state = 'down'; this.downT = 1.5; }
    if (this.state === 'down') {
      this.downT -= dt; if (this.downT <= 0) { this.state = this.kind === 'cop' ? 'chase' : 'flee'; this.fleeT = 8; }
    } else if (this.kind === 'cop') this.copBrain(dt);
    else this.civBrain(dt);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.speedNow = G.lerp(this.speedNow, moved / Math.max(dt, 1e-4), Math.min(1, dt * 10));
    this.syncMesh(); this.animate(dt);
  }
  pickNextNode() {
    const n = this.node; if (!n) return;
    let opts = n.adj.filter((e) => e.n !== this.prevNode);
    if (!opts.length) opts = n.adj;
    if (!opts.length) { this.node = null; return; }
    const e = G.pick(opts); this.prevNode = n; this.node = e.n; this.edgeRoad = e.r;
  }
  findNode() {
    const near = G.pedGraph.buckets.near(this.pos.x, this.pos.z, 60);
    let best = null, bd = Infinity;
    for (const n of near) { const d = G.d2(n.x, n.z, this.pos.x, this.pos.z); if (d < bd) { bd = d; best = n; } }
    this.node = best; this.prevNode = null;
  }
  civBrain(dt) {
    const pl = G.player;
    if (this.state === 'walk') {
      if (!this.node) this.findNode();
      if (!this.node) return;
      // target point with lateral offset (pavements beside roads)
      let tx = this.node.x, tz = this.node.z;
      if (this.prevNode) {
        const dx = this.node.x - this.prevNode.x, dz = this.node.z - this.prevNode.z, L = Math.hypot(dx, dz) || 1;
        const r = this.edgeRoad; const off = r && G.ROAD_SPEED[r.t] && r.t !== 'living_street' && r.t !== 'service' ? r.w / 2 + 0.6 : this.lat * (r ? r.w / 4 : 0.5);
        const side = r && G.ROAD_SPEED[r.t] ? Math.sign(this.lat || 1) : 1;
        tx += dz / L * off * side; tz += -dx / L * off * side;
      }
      const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
      if (d < 1.0) { this.pickNextNode(); if (Math.random() < 0.04) { this.state = 'idle'; this.idleT = G.rand(2, 7); } return; }
      this.faceTo(tx, tz, dt, 6);
      const f = this.fwd();
      const blocked = this.walk(f.x * this.walkSpeed * dt, f.z * this.walkSpeed * dt);
      if (blocked) { this.stuck = (this.stuck || 0) + dt; if (this.stuck > 1.5) { this.stuck = 0; this.pickNextNode(); } } else this.stuck = 0;
    } else if (this.state === 'idle') {
      this.idleT -= dt; if (this.idleT <= 0) this.state = 'walk';
    } else if (this.state === 'flee' || this.state === 'cower') {
      this.fleeT -= dt;
      if (this.fleeT <= 0) { this.state = 'walk'; this.findNode(); return; }
      if (this.state === 'cower') return;
      const th = this.threat || pl.pos;
      let ax = this.pos.x - th.x, az = this.pos.z - th.z; const L = Math.hypot(ax, az) || 1; ax /= L; az /= L;
      if (this.fleeDir === undefined || Math.random() < dt * 0.5) this.fleeDir = Math.atan2(ax, az) + G.rand(-0.5, 0.5);
      this.yaw += G.angDiff(this.yaw, this.fleeDir) * Math.min(1, dt * 8);
      const f = this.fwd(), sp = 5.2;
      if (this.walk(f.x * sp * dt, f.z * sp * dt)) this.fleeDir += G.pick([-1.2, 1.2]);
    } else if (this.state === 'fight') {
      const tgt = this.target || pl;
      this.fightT -= dt;
      if (tgt.dead || this.fightT <= 0 || tgt.vehicle) { this.state = 'flee'; this.fleeT = 6; this.threat = tgt.pos.clone(); return; }
      const d = G.dist(this.pos, tgt.pos);
      if (d > 1.1) this.runTo(tgt.pos, 4.6, dt, d < 6);
      else this.faceTo(tgt.pos.x, tgt.pos.z, dt, 12);
      if (d > 1.1) {}
      else if (this.cool <= 0) { this.cool = 0.9; this.punchT = 0.3; this.punchSide = !this.punchSide; G.melee(this, 6); }
    }
  }
  runTo(tp, sp, dt, direct) {
    let gx = tp.x, gz = tp.z;
    if (!direct && tp === (G.player.vehicle ? G.player.vehicle.pos : G.player.pos)) { const s = G.flowStep(this.pos.x, this.pos.z); if (s) { gx = s.x; gz = s.z; } }
    this.faceTo(gx, gz, dt, 12);
    const f = this.fwd();
    if (this.walk(f.x * sp * dt, f.z * sp * dt)) {
      this.side = this.side || G.pick([-1, 1]);
      const a = this.yaw + this.side * 1.3; this.walk(Math.sin(a) * sp * dt, Math.cos(a) * sp * dt);
    }
  }
  copBrain(dt) {
    const pl = G.player; const wanted = G.police.stars;
    const tgtPos = pl.vehicle ? pl.vehicle.pos : pl.pos;
    const d = G.dist(this.pos, tgtPos);
    if (pl.dead || wanted === 0) {
      // calm down: head back to car or wander
      if (this.car && !this.car.dead && !this.car.removed) {
        const cd = G.dist(this.pos, this.car.pos);
        if (cd < 3) { G.enterVehicle(this, this.car); return; }
        this.faceTo(this.car.pos.x, this.car.pos.z, dt, 8); const f = this.fwd(); this.walk(f.x * 3 * dt, f.z * 3 * dt);
      }
      return;
    }
    // player drove off: get back in car
    if (pl.vehicle && this.car && !this.car.dead && !this.car.driver && d > 18) {
      const cd = G.dist(this.pos, this.car.pos);
      if (cd < 35) {
        if (cd < 2.8) { G.enterVehicle(this, this.car); return; }
        this.faceTo(this.car.pos.x, this.car.pos.z, dt, 10); const f = this.fwd(); this.walk(f.x * 6 * dt, f.z * 6 * dt); return;
      }
    }
    const los = G.lineOfSight(this.chest().clone(), new V3(tgtPos.x, tgtPos.y + 1.2, tgtPos.z));
    this.aiming = false;
    if (wanted >= 2 && d < 30 && los) {
      this.aiming = true; this.faceTo(tgtPos.x, tgtPos.z, dt, 12);
      if (d > 9) { const f = this.fwd(); this.walk(f.x * 2.2 * dt, f.z * 2.2 * dt); }
      if (this.cool <= 0) { this.cool = G.rand(0.55, 1.1); G.npcShoot(this, pl, 0.35 + wanted * 0.06); }
      return;
    }
    // run to player: straight if visible, otherwise follow the flow field round buildings
    if (d > 1.0) this.runTo(tgtPos, 6.2, dt, los && d < 25);
    if (wanted === 1 || d < 1.6) {
      if (d < 1.6 && !pl.vehicle && !pl.dead) {
        if (wanted >= 3 && this.cool <= 0) { this.cool = 0.8; this.punchT = 0.3; G.melee(this, 8); }
        G.police.arrest += dt;
      } else if (pl.vehicle && d < 3.2 && Math.abs(pl.vehicle.speed) < 1.5) G.police.arrest += dt * 0.8;
    }
  }
}
G.Actor = Actor;

// ---------------- player ----------------
G.updatePlayer = (pl, dt, inp) => {
  pl.t += dt; pl.cool = Math.max(0, pl.cool - dt); pl.punchT = Math.max(0, pl.punchT - dt);
  if (pl.dead) { pl.speedNow = 0; G.settle(pl, dt); pl.syncMesh(); pl.animate(dt); return; }
  if (pl.vehicle) { pl.pos.copy(pl.vehicle.pos); pl.mesh.visible = false; return; }
  pl.mesh.visible = true;
  if (pl.state === 'down') { pl.downT -= dt; if (pl.downT <= 0) pl.state = 'walk'; G.settle(pl, dt); pl.syncMesh(); pl.animate(dt); return; }
  const ox = pl.pos.x, oz = pl.pos.z;
  pl.swim = G.grid.get(pl.pos.x, pl.pos.z) === G.WATER;
  // camera-relative movement
  const cy = G.cam.yaw;
  const fx = Math.sin(cy), fz = Math.cos(cy), rx = -fz, rz = fx;
  let mx = fx * inp.fwd + rx * inp.right, mz = fz * inp.fwd + rz * inp.right;
  const ml = Math.hypot(mx, mz);
  let speed = pl.swim ? 2.2 : inp.sprint ? 7.6 : 4.6;
  if (pl.aiming && !pl.swim) speed = Math.min(speed, 3.2);
  if (ml > 0.01) { mx /= ml; mz /= ml; }
  pl.aiming = inp.aim && !pl.swim;
  if (pl.aiming || pl.cool > 0 && pl.weapon !== 'fists') pl.yaw += G.angDiff(pl.yaw, cy) * Math.min(1, dt * 20);
  else if (ml > 0.01) pl.yaw += G.angDiff(pl.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
  pl.aimPitch = -G.cam.pitch;
  if (ml > 0.01) pl.walk(mx * speed * dt, mz * speed * dt);
  if (pl.push.lengthSq() > 0.01) { pl.walk(pl.push.x * dt, pl.push.z * dt); pl.push.multiplyScalar(Math.max(0, 1 - dt * 5)); }
  // jump / gravity / falls (into the Underpass cutting, off walls...)
  if (inp.jump && !pl.air && !pl.swim) { pl.vy = 6.2; pl.air = true; }
  const land = G.settle(pl, dt);
  if (land > 13) { G.damageActor(pl, (land - 13) * 9, null, 'fall'); if (land > 17) { pl.state = 'down'; pl.downT = 1.2; } }
  if (pl.swim && !pl.wasSwim) G.audio.splash();
  pl.wasSwim = pl.swim;
  const moved = Math.hypot(pl.pos.x - ox, pl.pos.z - oz);
  pl.speedNow = G.lerp(pl.speedNow, moved / Math.max(dt, 1e-4), Math.min(1, dt * 12));
  pl.syncMesh(); pl.animate(dt);
};

// ---------------- flow field toward the player (BFS on a 1 m grid) ----------------
const FR = 110, FS = FR * 2 + 1;
const flow = { d: new Float32Array(FS * FS), ox: 0, oz: 0, t: 0, q: new Int32Array(FS * FS) };
const walkable = (x, z) => { const v = G.grid.get(x, z); return v === G.FREE || v === G.BARRIER && false; };
G.updateFlow = (dt) => {
  flow.t -= dt; if (flow.t > 0) return; flow.t = 0.4;
  const pl = G.player; const tp = pl.vehicle ? pl.vehicle.pos : pl.pos;
  const cx = Math.round(tp.x), cz = Math.round(tp.z); flow.ox = cx - FR; flow.oz = cz - FR;
  const d = flow.d, q = flow.q; d.fill(1e9); flow.hg = flow.hg || new Float32Array(FS * FS); const hg = flow.hg; hg.fill(NaN);
  const H = (k, i, j) => { let v = hg[k]; if (v !== v) { v = hg[k] = G.groundAt(flow.ox + i, flow.oz + j, tp.y + 0.6); } return v; };
  const start = FR * FS + FR; d[start] = 0; let qh = 0, qt = 0; q[qt++] = start;
  const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (qh < qt) {
    const k = q[qh++]; const i = k % FS, j = (k - i) / FS; const dk = d[k];
    for (const [di, dj, c] of N) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= FS || nj >= FS) continue;
      const nk = nj * FS + ni; if (d[nk] <= dk + c) continue;
      if (!walkable(flow.ox + ni, flow.oz + nj)) continue;
      if (Math.abs(H(nk, ni, nj) - H(k, i, j)) > 0.9) continue;  // walls, banks, the cutting
      if (di && dj && (!walkable(flow.ox + i + di, flow.oz + j) || !walkable(flow.ox + i, flow.oz + j + dj))) continue;
      d[nk] = dk + c; q[qt++] = nk;
      if (qt >= q.length) qt = q.length - 1;
    }
  }
};
// next waypoint toward the player for an actor, or null if not reachable
G.flowStep = (x, z) => {
  const i = Math.round(x) - flow.ox, j = Math.round(z) - flow.oz;
  if (i < 1 || j < 1 || i >= FS - 1 || j >= FS - 1) return null;
  let best = flow.d[j * FS + i], bx = null, bz = null;
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= FS || nj >= FS) continue;
    const v = flow.d[nj * FS + ni]; if (v < best) { best = v; bx = flow.ox + ni; bz = flow.oz + nj; }
  }
  if (bx === null) return null;
  return { x: bx, z: bz, d: best };
};

// ---------------- crowd management ----------------
G.panic = (x, z, r, chance = 0.8) => {
  for (const a of G.actors) {
    if (a.kind !== 'civ' || a.dead || a.vehicle || a.state === 'fight' || a.state === 'down') continue;
    const d = Math.hypot(a.pos.x - x, a.pos.z - z);
    if (d < r && Math.random() < chance && (G._panicY === undefined || Math.abs(a.pos.y - G._panicY) < 4 || d < 15)) {
      a.state = Math.random() < 0.15 && d < 12 ? 'cower' : 'flee'; a.fleeT = G.rand(6, 12); a.threat = new V3(x, 0, z); a.fleeDir = undefined;
      if (Math.random() < 0.2) G.audio.scream(d);
    }
  }
};
const MAX_PEDS = G.mobile ? 26 : 46;
G.populatePeds = () => {
  const pl = G.player; const px = pl.pos.x, pz = pl.pos.z;
  // despawn far / long dead
  for (let i = G.actors.length - 1; i >= 0; i--) {
    const a = G.actors[i]; if (a === pl || a.vehicle) continue;
    const d = Math.hypot(a.pos.x - px, a.pos.z - pz);
    if (d > 190 || (a.dead && a.deadT > 40 && d > 30) || (a.kind === 'cop' && G.police.stars === 0 && d > 90)) { a.remove(); G.actors.splice(i, 1); }
  }
  let civs = 0; for (const a of G.actors) if (a.kind === 'civ' && !a.dead && !a.vehicle) civs++;
  const hour = G.clock.hour; const night = hour < 6 || hour > 22;
  const want = night ? MAX_PEDS * 0.35 : MAX_PEDS;
  let tries = 0;
  while (civs < want && tries++ < 12) {
    const nodes = G.pedGraph.buckets.near(px, pz, 150);
    if (!nodes.length) break;
    const n = G.pick(nodes); const d = Math.hypot(n.x - px, n.z - pz);
    if (d < 45 || d > 150) continue;
    if (G.grid.get(n.x, n.z) !== G.FREE) continue;
    const a = new Actor('civ', n.x, n.z, n.y); a.node = n; a.pickNextNode();
    G.actors.push(a); civs++;
  }
};
})();
