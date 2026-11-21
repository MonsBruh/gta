// Visual effects: particles, tracers, blood, muzzle flashes, fire.
'use strict';
(() => {
const FX = G.fx = {};
let tex = null;
const softTex = () => {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); tex = new THREE.CanvasTexture(c); return tex;
};
const parts = [];
const pool = [];
FX.spawn = (o) => {
  let p = pool.pop();
  if (!p) {
    const m = new THREE.SpriteMaterial({ map: softTex(), transparent: true, depthWrite: false });
    p = { s: new THREE.Sprite(m) }; G.scene.add(p.s);
  }
  p.s.visible = true;
  p.s.material.color.set(o.color || 0xffffff);
  p.s.material.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
  p.s.position.copy(o.pos); p.vel = o.vel ? o.vel.clone() : new THREE.Vector3();
  p.life = p.max = o.life || 1; p.size = o.size || 1; p.grow = o.grow || 0; p.grav = o.grav || 0; p.alpha = o.alpha == null ? 1 : o.alpha; p.drag = o.drag || 0;
  p.s.scale.setScalar(p.size); p.s.material.opacity = p.alpha;
  parts.push(p);
};
FX.update = (dt) => {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; parts.splice(i, 1); pool.push(p); continue; }
    p.vel.y -= p.grav * dt; if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
    p.s.position.addScaledVector(p.vel, dt); if (p.s.position.y < 0.05 && p.grav > 0) { p.s.position.y = 0.05; p.vel.set(0, 0, 0); }
    const k = p.life / p.max; p.s.scale.setScalar(p.size + p.grow * (1 - k)); p.s.material.opacity = p.alpha * Math.min(1, k * 2);
  }
  for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.life -= dt; if (t.life <= 0) { t.l.visible = false; tracers.splice(i, 1); tpool.push(t); } else t.l.material.opacity = t.life / 0.07; }
  if (flash.intensity > 0) flash.intensity = Math.max(0, flash.intensity - dt * 60);
  for (let i = burns.length - 1; i >= 0; i--) { const b = burns[i]; b.t -= dt; if (b.t <= 0) burns.splice(i, 1); else if (Math.random() < dt * 20) FX.fire(b.pos(), 0.6); }
};
const tracers = [], tpool = [];
FX.tracer = (a, b, color = 0xffe9a0) => {
  let t = tpool.pop();
  if (!t) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3)); t = { l: new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true })) }; G.scene.add(t.l); }
  const pa = t.l.geometry.attributes.position; pa.setXYZ(0, a.x, a.y, a.z); pa.setXYZ(1, b.x, b.y, b.z); pa.needsUpdate = true; t.l.geometry.computeBoundingSphere();
  t.l.material.color.set(color); t.l.visible = true; t.life = 0.07; tracers.push(t);
};
let flash = null;
FX.init = () => { flash = new THREE.PointLight(0xffc070, 0, 14, 2); G.scene.add(flash); };
FX.muzzle = (pos, big) => {
  flash.position.copy(pos); flash.intensity = big ? 40 : 18;
  FX.spawn({ pos, life: 0.06, size: big ? 0.9 : 0.5, color: 0xffd080, add: true });
};
FX.spark = (pos) => { for (let i = 0; i < 4; i++) FX.spawn({ pos, vel: new THREE.Vector3(G.rand(-3, 3), G.rand(1, 4), G.rand(-3, 3)), life: 0.25, size: 0.12, color: 0xffd27a, add: true, grav: 12 }); FX.spawn({ pos, life: 0.5, size: 0.3, grow: 0.6, color: 0xaaaaaa, alpha: 0.5 }); };
FX.blood = (pos) => { for (let i = 0; i < 6; i++) FX.spawn({ pos, vel: new THREE.Vector3(G.rand(-1.5, 1.5), G.rand(0.5, 3), G.rand(-1.5, 1.5)), life: 0.5, size: 0.14, color: 0x8a0000, grav: 9.8 }); };
FX.smoke = (pos, dark) => FX.spawn({ pos: pos.clone().add(new THREE.Vector3(G.rand(-0.3, 0.3), 0, G.rand(-0.3, 0.3))), vel: new THREE.Vector3(G.rand(-0.3, 0.3), G.rand(1.5, 2.8), G.rand(-0.3, 0.3)), life: 1.8, size: 0.6, grow: 2.5, color: dark ? 0x222222 : 0x9a9a9a, alpha: 0.55, drag: 0.5 });
FX.fire = (pos, s = 1) => FX.spawn({ pos: pos.clone().add(new THREE.Vector3(G.rand(-0.5, 0.5) * s, 0, G.rand(-0.5, 0.5) * s)), vel: new THREE.Vector3(0, G.rand(1.5, 3), 0), life: 0.5, size: 0.8 * s, grow: 0.5, color: G.pick([0xff7a1a, 0xffb02a, 0xff4a10]), add: true });
FX.explosion = (pos, r = 6) => {
  flash.position.copy(pos); flash.intensity = 120; flash.distance = 40;
  setTimeout(() => { flash.distance = 14; }, 300);
  for (let i = 0; i < 26; i++) FX.spawn({ pos, vel: new THREE.Vector3(G.rand(-1, 1), G.rand(0.2, 1.2), G.rand(-1, 1)).multiplyScalar(r * 1.3), life: G.rand(0.4, 0.9), size: r * 0.4, grow: r * 0.5, color: G.pick([0xff6a00, 0xffa020, 0xffd060, 0xff3000]), add: true, drag: 3 });
  for (let i = 0; i < 18; i++) FX.spawn({ pos: pos.clone().add(new THREE.Vector3(0, 1, 0)), vel: new THREE.Vector3(G.rand(-1, 1), G.rand(0.6, 1.5), G.rand(-1, 1)).multiplyScalar(r * 0.7), life: G.rand(2, 3.5), size: r * 0.4, grow: r * 1.2, color: 0x2a2a2a, alpha: 0.7, drag: 1.5 });
  for (let i = 0; i < 14; i++) FX.spawn({ pos, vel: new THREE.Vector3(G.rand(-12, 12), G.rand(6, 16), G.rand(-12, 12)), life: 1.2, size: 0.2, color: 0x333333, grav: 20 });
  FX.decal(pos.x, pos.z, r * 0.7, 0x111111, 0.7);
};
const burns = [];
FX.burn = (posFn, t) => burns.push({ pos: posFn, t });
// ground decals (blood pools, scorch)
const decals = [];
let decalGeo = null;
FX.decal = (x, z, r, color = 0x5a0000, opacity = 0.85) => {
  if (!decalGeo) { decalGeo = new THREE.CircleGeometry(1, 14); decalGeo.rotateX(-Math.PI / 2); }
  let d;
  if (decals.length > 60) { d = decals.shift(); } else { d = new THREE.Mesh(decalGeo, new THREE.MeshLambertMaterial({ color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); G.scene.add(d); }
  d.material.color.set(color); d.material.opacity = opacity;
  d.position.set(x, 0.02 + Math.random() * 0.01, z); d.scale.setScalar(r * G.rand(0.8, 1.2)); d.rotation.y = Math.random() * 6; decals.push(d);
};
})();
