// Vehicles: physics, traffic AI (drives on the LEFT, it's Lancashire), parked cars, damage.
'use strict';
(() => {
const V3 = THREE.Vector3;

class Vehicle {
  constructor(type, x, z, yaw, y) {
    this.type = type; this.spec = G.VTYPES[type];
    this.L = this.spec.L; this.W = this.spec.W;
    this.mesh = G.makeVehicle(type); this.parts = this.mesh.userData.parts;
    this.pos = new V3(x, y !== undefined ? y : G.groundAt(x, z), z); this.yaw = yaw || 0; this.vel = new V3(); this.vy = 0; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.steer = 0; this.hp = this.spec.hp; this.dead = false; this.burnT = 0;
    this.driver = null; this.passengers = []; this.ai = null; this.siren = type === 'police';
    this.parked = false; this.hornT = 0; this.wheelSpin = 0; this.sinkT = 0;
    this.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.scene.add(this.mesh); this.sync();
  }
  remove() { G.scene.remove(this.mesh); this.removed = true; for (const p of this.passengers) if (p !== G.player) { p.remove(); const i = G.actors.indexOf(p); if (i >= 0) G.actors.splice(i, 1); } }
  fwd() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  sync() {
    this.mesh.position.set(this.pos.x, this.pos.y - (this.sinkT > 0 ? this.sinkT * 0.6 : 0), this.pos.z);
    this.mesh.rotation.order = 'YXZ'; this.mesh.rotation.y = this.yaw; this.mesh.rotation.x = -this.pitch; this.mesh.rotation.z = this.roll;
    // body roll / pitch for feel
    const b = this.parts.body; b.rotation.z = G.clamp(-this.lat * 0.012, -0.08, 0.08); b.rotation.x = G.clamp(-(this.accel || 0) * 0.004, -0.05, 0.05);
    for (const w of this.parts.wheels) { w.w.rotation.x = this.wheelSpin; if (w.front) w.piv.rotation.y = this.steer * 0.8; }
  }
  // corners and edge samples in world space
  samples(x, z, yaw, inset = 0) {
    const s = Math.sin(yaw), c = Math.cos(yaw), hl = this.L / 2 - inset, hw = this.W / 2 - inset, out = [];
    const pts = [[hw, hl], [-hw, hl], [hw, -hl], [-hw, -hl], [0, hl], [0, -hl], [hw, 0], [-hw, 0], [hw, hl / 2], [-hw, hl / 2], [hw, -hl / 2], [-hw, -hl / 2]];
    for (const [lx, lz] of pts) out.push([x + lx * c + lz * s, z - lx * s + lz * c]);
    return out;
  }
  blockedAt(x, z, yaw) {
    const y = this.pos.y;
    for (const [px, pz] of this.samples(x, z, yaw)) {
      if (!G.inTunnel(px, pz, y) && !G.onRamp(px, pz, y)) { const v = G.grid.get(px, pz); if (v === G.BUILDING || v === G.BARRIER || v === G.TREE) return true; }
      if (G.groundAt(px, pz, y + 0.8) > y + 1.1) return true;  // retaining walls, steep banks
    }
    return false;
  }
  // follow the terrain: height, pitch, roll, gravity (cars can get air off crests and drop into the cutting)
  ground(dt) {
    const f = this.fwd(), r = { x: -f.z, z: f.x }, hl = this.L * 0.4, hw = this.W * 0.4, y = this.pos.y + 0.8;
    const gF = G.groundAt(this.pos.x + f.x * hl, this.pos.z + f.z * hl, y), gB = G.groundAt(this.pos.x - f.x * hl, this.pos.z - f.z * hl, y);
    const gR = G.groundAt(this.pos.x + r.x * hw, this.pos.z + r.z * hw, y), gL = G.groundAt(this.pos.x - r.x * hw, this.pos.z - r.z * hw, y);
    const g = (gF + gB + gR + gL) / 4;
    const free = this.pos.y + this.vy * dt - 10 * dt * dt;
    if (free > g + 0.05 && (this.vy > 0.5 || this.pos.y - g > 0.35)) { this.pos.y = free; this.vy -= 20 * dt; this.air = (this.air || 0) + dt; return; }
    if (this.air > 0.25 && -this.vy > 6) { this.damage((-this.vy - 6) * 25, this.driver === G.player ? null : null); G.audio.crash(-this.vy / 20, G.camDist(this.pos)); if (this.driver === G.player) G.shake(-this.vy / 25); }
    this.air = 0;
    const ny = Math.min(8, (g - this.pos.y) / Math.max(dt, 1e-3)); this.vy = ny; this.pos.y = g;
    const tp = Math.atan2(gF - gB, 2 * hl), tr = Math.atan2(gL - gR, 2 * hw);
    this.pitch += (tp - this.pitch) * Math.min(1, dt * 12); this.roll += (tr - this.roll) * Math.min(1, dt * 12);
  }
  // control: {throttle -1..1, steer -1..1, handbrake bool}
  physics(dt, ctl) {
    const sp = this.spec;
    if (this.dead) ctl = { throttle: 0, steer: 0, handbrake: true };
    const f = this.fwd(), r = { x: -f.z, z: f.x };
    let vF = this.vel.x * f.x + this.vel.z * f.z, vR = this.vel.x * r.x + this.vel.z * r.z;
    const before = vF;
    const thr = ctl.throttle;
    if (this.sinkT > 0) { vF *= Math.max(0, 1 - dt * 2); vR *= Math.max(0, 1 - dt * 2); }
    else if (thr > 0) { if (vF < -0.5) vF += 14 * dt * thr; else if (vF < sp.max) vF += sp.acc * thr * dt * (1 - Math.max(0, vF) / sp.max * 0.7); }
    else if (thr < 0) { if (vF > 0.5) vF += 16 * thr * dt; else if (vF > -sp.max * 0.3) vF += sp.acc * 0.6 * thr * dt; }
    else vF -= Math.sign(vF) * Math.min(Math.abs(vF), (1.5 + Math.abs(vF) * 0.05) * dt);
    if (ctl.handbrake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 6 * dt);
    vF -= vF * Math.abs(vF) * 0.0006 * dt * 60;
    if (!this.air) vF -= 9.8 * Math.sin(this.pitch) * dt;  // hills
    // off-road (grass) slows you a bit
    if (G.roadGrid.get(this.pos.x, this.pos.z) !== 1 && Math.abs(vF) > 12) vF -= Math.sign(vF) * 4 * dt;
    // steering
    const maxSteer = 0.6 / (1 + Math.abs(vF) * 0.045);
    this.steer += (ctl.steer * maxSteer - this.steer) * Math.min(1, dt * 8);
    const wb = this.L * 0.62;
    let yawRate = vF * Math.tan(this.steer) / wb;
    if (ctl.handbrake && Math.abs(vF) > 5) yawRate *= 1.45;
    const grip = ctl.handbrake ? 1.4 : sp.grip;
    vR *= Math.exp(-grip * dt);
    const newYaw = this.yaw + yawRate * dt;
    const nf = { x: Math.sin(newYaw), z: Math.cos(newYaw) }, nr = { x: -nf.z, z: nf.x };
    this.vel.set(nf.x * vF + nr.x * vR, 0, nf.z * vF + nr.z * vR);
    this.accel = (vF - before) / Math.max(dt, 1e-4); this.lat = vR + yawRate * Math.abs(vF) * 0.3;
    // move with collision
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    let hitSpeed = 0;
    if (!this.blockedAt(nx, nz, newYaw)) { this.pos.x = nx; this.pos.z = nz; this.yaw = newYaw; }
    else if (!this.blockedAt(nx, this.pos.z, newYaw)) { hitSpeed = Math.abs(this.vel.z); this.pos.x = nx; this.yaw = newYaw; this.vel.z *= -0.2; }
    else if (!this.blockedAt(this.pos.x, nz, newYaw)) { hitSpeed = Math.abs(this.vel.x); this.pos.z = nz; this.yaw = newYaw; this.vel.x *= -0.2; }
    else if (!this.blockedAt(this.pos.x, this.pos.z, newYaw)) { hitSpeed = this.vel.length(); this.yaw = newYaw; this.vel.multiplyScalar(-0.25); }
    else {
      hitSpeed = this.vel.length(); this.vel.multiplyScalar(-0.25);
      if (this.blockedAt(this.pos.x, this.pos.z, this.yaw)) { const fr = G.grid.nearestFree(this.pos.x, this.pos.z, (v) => v === G.FREE || v === G.WATER, 8); this.pos.x = fr.x; this.pos.z = fr.z; }
    }
    if (hitSpeed > 4) { this.damage(hitSpeed * hitSpeed * 0.55, null); G.audio.crash(hitSpeed / 20, G.camDist(this.pos)); if (this.driver === G.player) G.shake(hitSpeed / 25); }
    this.ground(dt);
    this.speed = this.vel.x * nf.x + this.vel.z * nf.z;
    this.wheelSpin += this.speed * dt / 0.34;
    // water
    if (G.grid.get(this.pos.x, this.pos.z) === G.WATER) {
      if (this.sinkT === 0) { G.audio.splash(); }
      this.sinkT += dt;
      if (this.sinkT > 3 && !this.dead) { this.dead = true; this.drowned = true; G.ejectAll(this, true); }
    }
  }
  damage(amt, by) {
    if (this.dead) return;
    this.hp -= amt;
    if (by === G.player && this.type === 'police') G.police.crime('copcar');
    if (this.driver && this.driver !== G.player && by === G.player && this.ai) { this.ai.panic = 12; }
    if (this.hp <= 0) this.blowUp(by);
  }
  blowUp(by) {
    if (this.dead && this.exploded) return;
    this.dead = true; this.exploded = true; this.hp = 0;
    G.explode(this.pos.clone().setY(this.pos.y + 1), 7, 150, by, this);
    this.mesh.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.15); if (o.material.emissive) o.material.emissive.setHex(0); } });
    this.vel.y = 0; this.vel.multiplyScalar(0.3);
    this.burnT = 10;
    const kill = [...this.passengers];
    for (const p of kill) { G.exitVehicle(p, true); G.damageActor(p, 999, by, 'explosion'); }
  }
  update(dt) {
    if (this.removed) return;
    let ctl = { throttle: 0, steer: 0, handbrake: this.parked || !this.driver };
    if (this.driver === G.player) ctl = G.input.car;
    else if (this.driver && !this.dead) ctl = G.driveAI(this, dt);
    this.physics(dt, ctl);
    // fx
    const hpk = this.hp / this.spec.hp;
    if (!this.dead && hpk < 0.45 && Math.random() < dt * (hpk < 0.2 ? 14 : 5)) G.fx.smoke(this.pos.clone().add(new V3(Math.sin(this.yaw) * this.L * 0.38, 1.2, Math.cos(this.yaw) * this.L * 0.38)), hpk < 0.2);
    if (!this.dead && hpk < 0.2) { this.fireT = (this.fireT || 0) + dt; if (Math.random() < dt * 25) G.fx.fire(this.pos.clone().add(new V3(Math.sin(this.yaw) * this.L * 0.38, 1.1, Math.cos(this.yaw) * this.L * 0.38)), 0.6); if (this.fireT > 5) this.blowUp(this.lastHitBy); }
    if (this.dead && this.burnT > 0) { this.burnT -= dt; if (Math.random() < dt * 30) G.fx.fire(this.pos.clone().setY(this.pos.y + 1.0), 1.1); if (Math.random() < dt * 6) G.fx.smoke(this.pos.clone().setY(this.pos.y + 1.5), true); }
    if (this.parts.lightA) {
      const on = this.siren && this.sirenOn && !this.dead; const ph = Math.floor(G.time * 6) % 2;
      this.parts.lightA.material.color.setHex(on ? (ph ? 0x2050ff : 0x001040) : 0x203060);
      this.parts.lightB.material.color.setHex(on ? (ph ? 0x001040 : 0x2050ff) : 0x203060);
    }
    const brake = this.driver && ((this.driver === G.player && G.input.car.throttle < 0 && this.speed > 0.5) || (this.ai && this.ai.braking));
    this.parts.tail.emissiveIntensity = brake ? 1.6 : G.clock.night ? 0.8 : 0.2;
    this.parts.head.emissiveIntensity = G.clock.night && this.driver ? 2 : 0.2;
    this.sync();
    if (this.hornT > 0) this.hornT -= dt;
  }
}
G.Vehicle = Vehicle;

// ---------------- AI driving ----------------
// lane-following along the road graph, keeping LEFT
const laneTarget = (from, to, road) => {
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz) || 1;
  const off = road && road.ow ? 0 : Math.min(1.9, Math.max(1.0, road ? road.w / 4 : 1.5));
  return { x: to.x + (dz / L) * off, z: to.z + (-dx / L) * off, dx: dx / L, dz: dz / L, L };
};
// A* over the road graph
G.roadPath = (start, goal) => {
  if (!start || !goal) return null;
  const g = new Map([[start, 0]]), came = new Map(), heap = [[0, start]], closed = new Set();
  const push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let it = 0;
  while (heap.length && it++ < 20000) {
    const [, n] = pop(); if (n === goal) break; if (closed.has(n)) continue; closed.add(n);
    const gn = g.get(n);
    for (const e of n.adj) {
      const ng = gn + e.len; if (ng >= (g.get(e.n) ?? Infinity)) continue;
      g.set(e.n, ng); came.set(e.n, [n, e]); push(ng + Math.hypot(e.n.x - goal.x, e.n.z - goal.z), e.n);
    }
  }
  if (!came.has(goal)) return null;
  const path = []; let c = goal; while (c !== start) { const [p, e] = came.get(c); path.unshift({ n: c, r: e.r }); c = p; }
  return path;
};
G.nearestRoadNode = (x, z, r = 150) => { let best = null, bd = Infinity; for (const n of G.roadGraph.buckets.near(x, z, r)) { const d = G.d2(n.x, n.z, x, z); if (d < bd) { bd = d; best = n; } } return best; };
G.chooseNext = (ai) => {
  const n = ai.to;
  if (ai.goal) {
    if (!ai.path || ai.pathT <= 0 || !ai.path.length) { ai.pathT = 2; ai.path = G.roadPath(n, G.nearestRoadNode(ai.goal.x, ai.goal.z)) || []; }
    while (ai.path.length && ai.path[0].n === n) ai.path.shift();
    if (ai.path.length) { const step = ai.path.shift(); const e = n.adj.find((x) => x.n === step.n); if (e) return e; }
  }
  let opts = n.adj.filter((e) => e.n !== ai.from);
  if (!opts.length) opts = n.adj;
  return opts.length ? G.pick(opts) : null;
};
G.driveAI = (v, dt) => {
  const ai = v.ai; if (!ai) return { throttle: 0, steer: 0, handbrake: true };
  const pl = G.player; const f = v.fwd();
  let target, desired;
  const chasing = ai.mode === 'chase' && G.police.stars > 0 && !pl.dead;
  const tgtPos = pl.vehicle ? pl.vehicle.pos : pl.pos;
  if (chasing && G.dist(v.pos, tgtPos) < 45 && G.lineOfSight(new V3(v.pos.x, v.pos.y + 1.2, v.pos.z), new V3(tgtPos.x, tgtPos.y + 1.2, tgtPos.z), true)) {
    target = { x: tgtPos.x, z: tgtPos.z }; desired = pl.vehicle ? 40 : 14;
    const d = G.dist(v.pos, tgtPos);
    const still = !pl.vehicle || Math.abs(pl.vehicle.speed) < 2.5;
    if (still && d < 14) { desired = 0; ai.braking = true; if (Math.abs(v.speed) < 2) G.copsBail(v); }
    ai.direct = true;
  } else {
    if (ai.direct) { ai.direct = false; G.snapToGraph(v); }
    if (!ai.to) { G.snapToGraph(v); if (!ai.to) return { throttle: 0, steer: 0, handbrake: true }; }
    if (chasing) { ai.goal = tgtPos; ai.pathT = (ai.pathT || 0) - dt; } else ai.goal = null;
    const lt = laneTarget(ai.from, ai.to, ai.road);
    const dist = Math.hypot(lt.x - v.pos.x, lt.z - v.pos.z);
    // passed the node? (dot along edge)
    const along = (v.pos.x - ai.to.x) * lt.dx + (v.pos.z - ai.to.z) * lt.dz;
    if (dist < 3.5 + Math.abs(v.speed) * 0.25 || along > 0) {
      const e = G.chooseNext(ai);
      if (!e) { return { throttle: 0, steer: 0, handbrake: true }; }
      ai.from = ai.to; ai.to = e.n; ai.road = e.r;
    }
    const lt2 = laneTarget(ai.from, ai.to, ai.road);
    target = { x: lt2.x, z: lt2.z };
    desired = (G.ROAD_SPEED[ai.road ? ai.road.t : 'service'] || 8) * (chasing ? 2.4 : 1) * (ai.speedMul || 1); if (chasing) desired = Math.max(desired, 16);
    // slow for upcoming turns
    const nxt = ai.to.adj.filter((e) => e.n !== ai.from);
    if (nxt.length && !chasing) {
      const e = nxt[0]; const ex = e.n.x - ai.to.x, ez = e.n.z - ai.to.z, el = Math.hypot(ex, ez) || 1;
      const turn = 1 - (ex * lt2.dx + ez * lt2.dz) / el;
      if (dist < 25) desired *= 1 - Math.min(0.6, turn * 0.5);
    }
  }
  if (chasing && !ai.direct) {
    const d = G.dist(v.pos, tgtPos);
    if (ai.bestD === undefined || d < ai.bestD - 2) { ai.bestD = d; ai.noProg = 0; } else ai.noProg = (ai.noProg || 0) + dt;
    const reachable = G.flowStep(v.pos.x, v.pos.z);
    if ((d < 30 || (ai.noProg > 4 && d < 110)) && reachable && reachable.d < 160 && !pl.vehicle) { desired = 0; ai.braking = true; if (Math.abs(v.speed) < 2) { ai.bestD = undefined; G.copsBail(v); } }
  }
  if (ai.panic > 0) { ai.panic -= dt; desired *= 1.8; }
  // obstacle check ahead
  ai.braking = false;
  const look = 5 + Math.abs(v.speed) * 0.9;
  if (!chasing) {
    let block = Infinity;
    const chk = (p, rad) => {
      const dx = p.x - v.pos.x, dz = p.z - v.pos.z; const a = dx * f.x + dz * f.z; if (a < 0 || a > look + v.L / 2) return;
      const lat = Math.abs(dx * -f.z + dz * f.x); if (lat < v.W / 2 + rad) block = Math.min(block, a - v.L / 2 - rad);
    };
    for (const o of G.vehicles) if (o !== v && !o.removed && Math.abs(o.pos.y - v.pos.y) < 3 && G.d2(o.pos.x, o.pos.z, v.pos.x, v.pos.z) < 900) chk(o.pos, o.W * 0.6);
    for (const a of G.actors) if (!a.vehicle && !a.dead && Math.abs(a.pos.y - v.pos.y) < 2.5 && G.d2(a.pos.x, a.pos.z, v.pos.x, v.pos.z) < 500) chk(a.pos, 0.5);
    if (block < look) {
      desired = Math.min(desired, Math.max(0, (block - 2) * 1.2)); ai.braking = true;
      if (block < 4) { ai.waitT = (ai.waitT || 0) + dt; if (ai.waitT > 2 && v.hornT <= 0 && G.dist(v.pos, pl.pos) < 40 && !pl.vehicle || ai.waitT > 2 && pl.vehicle && G.dist(v.pos, pl.pos) < 12 && v.hornT <= 0) { v.hornT = 3; if (G.dist(v.pos, pl.pos) < 50) G.audio.horn(); } if (ai.waitT > 9) { ai.waitT = 0; ai.reverseT = 1.2; } }
    } else ai.waitT = 0;
  }
  // steering toward target
  const want = Math.atan2(target.x - v.pos.x, target.z - v.pos.z);
  const diff = G.angDiff(v.yaw, want);
  let steer = G.clamp(diff * 2.2, -1, 1);
  let throttle = v.speed < desired ? 1 : v.speed > desired + 2 ? -1 : 0;
  if (Math.abs(diff) > 1.4 && v.speed > 6) throttle = -0.5;
  if (ai.reverseT > 0) { ai.reverseT -= dt; return { throttle: -1, steer: -steer, handbrake: false }; }
  // stuck detection
  if (Math.abs(v.speed) < 0.5 && desired > 3) { ai.stuckT = (ai.stuckT || 0) + dt; if (ai.stuckT > 1.6) { ai.stuckT = 0; ai.reverseT = 1.0; } } else ai.stuckT = 0;
  return { throttle, steer, handbrake: false };
};
G.snapToGraph = (v) => {
  const near = G.roadGraph.buckets.near(v.pos.x, v.pos.z, 80);
  let best = null, bd = Infinity; const f = v.fwd();
  for (const n of near) {
    const d = G.d2(n.x, n.z, v.pos.x, v.pos.z);
    const ahead = (n.x - v.pos.x) * f.x + (n.z - v.pos.z) * f.z;
    const score = d + (ahead < 0 ? 400 : 0);
    if (score < bd) { bd = score; best = n; }
  }
  if (!best) { v.ai.to = null; return; }
  v.ai.from = { x: v.pos.x, z: v.pos.z, adj: [] }; v.ai.to = best; v.ai.road = best.adj[0] && best.adj[0].r;
};

// ---------------- entering / exiting ----------------
G.enterVehicle = (a, v) => {
  if (v.dead) return false;
  if (v.driver && v.driver !== a) {
    const victim = v.driver; G.exitVehicle(victim, false);
    victim.state = 'down'; victim.downT = 1.2; victim.fleeT = 10;
    if (a === G.player) {
      G.police.crime(v.type === 'police' ? 'copcar' : 'carjack', v.pos);
      if (victim.kind === 'civ' && Math.random() < 0.25) { victim.state = 'fight'; victim.target = a; victim.fightT = 8; }
    }
  }
  a.vehicle = v; v.driver = a; if (!v.passengers.includes(a)) v.passengers.push(a);
  a.mesh.visible = false; v.parked = false;
  if (a === G.player) {
    v.ai = null; v.sirenOn = false;
    for (const p of v.passengers.slice()) if (p !== a) { G.exitVehicle(p, false); p.state = p.kind === 'cop' ? 'chase' : 'flee'; p.fleeT = 8; }
    G.hud.vehicleName(v.spec.name);
  } else {
    v.ai = v.ai || { mode: a.kind === 'cop' ? 'chase' : 'cruise' };
    if (a.kind === 'cop') { v.ai.mode = 'chase'; v.sirenOn = true; for (const c of G.actors) if (c.kind === 'cop' && c.car === v && !c.vehicle && !c.dead && G.dist(c.pos, v.pos) < 4) { c.vehicle = v; v.passengers.push(c); c.mesh.visible = false; } }
    G.snapToGraph(v);
  }
  return true;
};
G.exitVehicle = (a, bail) => {
  const v = a.vehicle; if (!v) return;
  const i = v.passengers.indexOf(a); if (i >= 0) v.passengers.splice(i, 1);
  if (v.driver === a) v.driver = v.passengers.find((p) => p.kind === 'cop') || null;
  a.vehicle = null; a.mesh.visible = true;
  // place beside the car, try both sides
  const f = v.fwd(); const sides = [1, -1];
  for (const s of sides) {
    const x = v.pos.x + (-f.z) * s * (v.W / 2 + 0.7), z = v.pos.z + f.x * s * (v.W / 2 + 0.7);
    const gy = G.groundAt(x, z, v.pos.y + 0.6);
    a.pos.set(x, gy, z);
    if (!G.solidForWalk(G.grid.get(x, z)) && Math.abs(gy - v.pos.y) < 1) break;
  }
  a.yaw = v.yaw;
  if (bail) { a.push.set(v.vel.x * 0.7, 0, v.vel.z * 0.7); if (v.vel.length() > 6) { a.state = 'down'; a.downT = 1.2; G.damageActor(a, v.vel.length() * 0.8, null, 'fall'); } }
  if (a === G.player) { v.sirenOn = false; v.parked = false; }
  else if (!v.driver) v.ai = null;
};
G.ejectAll = (v, swim) => { for (const p of v.passengers.slice()) G.exitVehicle(p, false); };
G.copsBail = (v) => {
  for (const p of v.passengers.slice()) { G.exitVehicle(p, false); p.state = 'chase'; p.car = v; }
  v.driver = null;
};

// ---------------- collisions between vehicles and with people ----------------
G.vehicleCollisions = (dt) => {
  const vs = G.vehicles;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i]; if (a.removed) continue;
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j]; if (b.removed) continue;
      const R = (a.L + b.L) / 2; if (G.d2(a.pos.x, a.pos.z, b.pos.x, b.pos.z) > R * R || Math.abs(a.pos.y - b.pos.y) > 2.5) continue;
      // circles along each car
      const ca = circles(a), cb = circles(b);
      let best = null;
      for (const p of ca) for (const q of cb) {
        const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), m = p.r + q.r;
        if (d < m && (!best || m - d > best.pen)) best = { nx: dx / (d || 1), nz: dz / (d || 1), pen: m - d };
      }
      if (!best) continue;
      const ma = a.spec.mass * (a.parked ? 1.5 : 1), mb = b.spec.mass * (b.parked ? 1.5 : 1), tot = ma + mb;
      const pa = best.pen * mb / tot, pb = best.pen * ma / tot;
      const ax = a.pos.x - best.nx * pa, az = a.pos.z - best.nz * pa, bx = b.pos.x + best.nx * pb, bz = b.pos.z + best.nz * pb;
      if (!a.blockedAt(ax, az, a.yaw)) { a.pos.x = ax; a.pos.z = az; }
      if (!b.blockedAt(bx, bz, b.yaw)) { b.pos.x = bx; b.pos.z = bz; }
      const rv = (b.vel.x - a.vel.x) * best.nx + (b.vel.z - a.vel.z) * best.nz;
      if (rv < 0) {
        const imp = -(1.3) * rv / tot;
        a.vel.x -= imp * mb * best.nx; a.vel.z -= imp * mb * best.nz; b.vel.x += imp * ma * best.nx; b.vel.z += imp * ma * best.nz;
        const s = -rv;
        if (s > 3) {
          const by = a.driver === G.player ? G.player : b.driver === G.player ? G.player : null;
          a.damage(s * s * 0.5 * mb / tot * 2, by); b.damage(s * s * 0.5 * ma / tot * 2, by);
          a.lastHitBy = b.lastHitBy = by;
          G.audio.crash(s / 15, G.camDist(a.pos));
          if (by && (a.ai || b.ai)) { if (a.ai && a.driver !== G.player) a.ai.panic = 6; if (b.ai && b.driver !== G.player) b.ai.panic = 6; }
          if (by === G.player) G.shake(s / 20);
        }
      }
    }
    // people
    const sp = a.vel.length(); if (sp < 0.3) continue;
    for (const p of G.actors) {
      if (p.vehicle || p.removed) continue;
      if (G.d2(p.pos.x, p.pos.z, a.pos.x, a.pos.z) > (a.L / 2 + 1) ** 2 || Math.abs(p.pos.y - a.pos.y) > 2) continue;
      const s = Math.sin(a.yaw), c = Math.cos(a.yaw), dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z;
      const lz = dx * s + dz * c, lx = dx * c - dz * s;
      if (Math.abs(lx) < a.W / 2 + p.radius && Math.abs(lz) < a.L / 2 + p.radius) {
        if (p.dead) { continue; }
        if (sp > 3.5) {
          const by = a.driver === G.player ? G.player : null;
          p.push.set(a.vel.x * 0.9 + G.rand(-2, 2), 0, a.vel.z * 0.9 + G.rand(-2, 2));
          p.state = 'down'; p.downT = 2.5;
          G.damageActor(p, sp * sp * 0.35, by, 'car');
          a.vel.multiplyScalar(0.92); G.audio.punch(G.camDist(p.pos)); G.fx.blood(p.chest().clone());
          p.walk(Math.sign(lx || 1) * (a.W / 2 + 0.5 - Math.abs(lx)) * c, 0);
        } else {
          // shove aside
          const side = Math.sign(lx) || 1; const push = (a.W / 2 + p.radius - Math.abs(lx)) * side;
          p.walk(push * c, -push * s);
        }
      }
    }
  }
};
const circles = (v) => {
  const n = Math.max(2, Math.round(v.L / v.W)); const out = []; const f = v.fwd(); const r = v.W / 2;
  for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5) * (v.L - v.W); out.push({ x: v.pos.x + f.x * t, z: v.pos.z + f.z * t, r }); }
  return out;
};

// ---------------- population ----------------
const TRAFFIC_TYPES = ['hatch', 'hatch', 'saloon', 'saloon', 'estate', 'suv', 'van', 'taxi', 'sports', 'hatch', 'saloon'];
G.populateTraffic = () => {
  const pl = G.player; const px = pl.pos.x, pz = pl.pos.z;
  for (let i = G.vehicles.length - 1; i >= 0; i--) {
    const v = G.vehicles[i]; if (v === pl.vehicle) continue;
    const d = Math.hypot(v.pos.x - px, v.pos.z - pz);
    const lim = v.parked ? 260 : v.dead ? 140 : 230;
    if (d > lim) { v.remove(); G.vehicles.splice(i, 1); if (v.lot) { v.lot.cars = v.lot.cars.filter((c) => c !== v); } }
  }
  let moving = 0, bus = 0; for (const v of G.vehicles) { if (v.ai && v.ai.mode === 'cruise' && v.driver) moving++; if (v.type === 'bus') bus++; }
  const want = (G.clock.night ? 7 : 14) * (G.mobile ? 0.6 : 1);
  let tries = 0;
  while (moving < want && tries++ < 10) {
    const nodes = G.roadGraph.buckets.near(px, pz, 220); if (!nodes.length) break;
    const n = G.pick(nodes); const d = Math.hypot(n.x - px, n.z - pz);
    if (d < 70 || d > 220 || !n.adj.length) continue;
    const e = G.pick(n.adj);
    const big = e.r && (e.r.t === 'unclassified' || e.r.t === 'primary' || e.r.t === 'tertiary');
    const type = big && bus < 2 && Math.random() < 0.18 ? 'bus' : G.pick(TRAFFIC_TYPES);
    const lt = laneTarget(n, e.n, e.r);
    const yaw = Math.atan2(lt.dx, lt.dz);
    const x = n.x + lt.dz * 1.6, z = n.z - lt.dx * 1.6;
    const v = new Vehicle(type, x, z, yaw, n.y);
    if (v.blockedAt(x, z, yaw) || G.vehicles.some((o) => G.d2(o.pos.x, o.pos.z, x, z) < 64)) { v.remove(); continue; }
    const drv = new G.Actor('civ', x, z, n.y); G.actors.push(drv);
    v.ai = { mode: 'cruise', from: n, to: e.n, road: e.r, speedMul: G.rand(0.85, 1.1) };
    drv.vehicle = v; v.driver = drv; v.passengers.push(drv); drv.mesh.visible = false;
    v.vel.set(lt.dx * 6, 0, lt.dz * 6);
    G.vehicles.push(v); moving++; if (type === 'bus') bus++;
  }
  // parked cars in the real car parks
  for (const lot of G.parkingAreas) {
    const d = Math.hypot(lot.c.x - px, lot.c.z - pz);
    if (d < 200 && !lot.populated) {
      lot.populated = true;
      const n = Math.min(10, Math.max(1, Math.floor(lot.area / 90)));
      const bb = G.bbox(lot.p);
      // orientation from the longest edge
      let best = 0, ang = 0; for (let i = 0; i < lot.p.length / 2; i++) { const j = (i + 1) % (lot.p.length / 2); const dx = lot.p[j * 2] - lot.p[i * 2], dz = lot.p[j * 2 + 1] - lot.p[i * 2 + 1], L = dx * dx + dz * dz; if (L > best) { best = L; ang = Math.atan2(dx, dz); } }
      let placed = 0, tries2 = 0;
      while (placed < n && tries2++ < n * 8) {
        const x = G.rand(bb[0], bb[2]), z = G.rand(bb[1], bb[3]);
        if (!G.pip(x, z, lot.p)) continue;
        const yaw = ang + Math.PI / 2 + (Math.random() < 0.5 ? Math.PI : 0);
        const type = Math.random() < 0.04 ? 'sports' : G.pick(['hatch', 'saloon', 'estate', 'suv', 'hatch', 'van']);
        const v = new Vehicle(type, x, z, yaw);
        if (v.blockedAt(x, z, yaw) || G.vehicles.some((o) => G.d2(o.pos.x, o.pos.z, x, z) < 14)) { v.remove(); continue; }
        v.parked = true; v.lot = lot; lot.cars.push(v); G.vehicles.push(v); placed++;
      }
    } else if (d > 280 && lot.populated && lot.cars.length === 0) lot.populated = false;
  }
};
})();
