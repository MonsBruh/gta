// Procedural low-poly models: people and vehicles.
'use strict';
(() => {
const matCache = new Map();
const lam = (c, extra) => {
  const key = c + (extra ? JSON.stringify(extra) : '');
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: c, ...(extra || {}) }); matCache.set(key, m); }
  return m;
};
G.lam = lam;
const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); m.castShadow = true; return m; };

const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68863, 0x8d5a3b, 0x5c3a24, 0xf5d7bf];
const HAIR = [0x2b1d14, 0x4a3222, 0x0f0f0f, 0x8a5a2b, 0xd9b26a, 0x6e2a14, 0x9a9a9a];
const TOPS = [0x2c3e50, 0x8e2b2b, 0x1f6f4a, 0x5b3f8a, 0xcfcfcf, 0x222222, 0xb5651d, 0x2a6db0, 0x7a1f3d, 0xe6c229, 0x3b7a7a, 0xf0f0f0];
const LEGS = [0x22304a, 0x1a1a1a, 0x3b3b3b, 0x5a4a3a, 0x2e4a6b, 0x6b6b6b];

G.makeHuman = (kind = 'civ') => {
  const g = new THREE.Group();
  const skin = G.pick(SKIN), hair = G.pick(HAIR);
  let top = G.pick(TOPS), legs = G.pick(LEGS), shoes = 0x1a1a1a;
  if (kind === 'cop') { top = 0x10182a; legs = 0x10182a; }
  if (kind === 'player') { top = 0xb8202c; legs = 0x2a3c66; shoes = 0xeeeeee; }
  const parts = {};
  const legPivot = (x) => { const p = new THREE.Group(); p.position.set(x, 0.92, 0); const l = box(0.19, 0.86, 0.22, legs, 0, -0.43, 0); const s = box(0.2, 0.1, 0.3, shoes, 0, -0.87, 0.04); p.add(l, s); g.add(p); return p; };
  parts.legL = legPivot(0.11); parts.legR = legPivot(-0.11);
  const torso = box(0.48, 0.62, 0.27, top, 0, 1.23, 0); g.add(torso); parts.torso = torso;
  if (kind === 'cop') {
    const vest = box(0.5, 0.5, 0.29, 0xd8f02a, 0, 1.25, 0); g.add(vest);
    const band = box(0.51, 0.06, 0.3, 0xcfcfcf, 0, 1.15, 0); g.add(band);
  }
  if (kind === 'civ' && Math.random() < 0.45) { const bp = box(0.36, 0.42, 0.16, G.pick([0x222222, 0x2a4a7a, 0x7a2a2a, 0x3d5a2a]), 0, 1.25, -0.21); g.add(bp); }
  const neck = new THREE.Group(); neck.position.set(0, 1.56, 0); g.add(neck);
  const head = box(0.27, 0.29, 0.27, skin, 0, 0.17, 0); neck.add(head); parts.head = neck;
  if (kind === 'cop') { neck.add(box(0.31, 0.08, 0.33, 0x0a0a0a, 0, 0.33, 0.02)); neck.add(box(0.3, 0.12, 0.3, 0x1a1a1a, 0, 0.4, 0)); }
  else if (Math.random() < 0.85) { neck.add(box(0.29, 0.09, 0.29, hair, 0, 0.34, -0.01)); if (Math.random() < 0.4) neck.add(box(0.29, 0.25, 0.08, hair, 0, 0.2, -0.13)); }
  neck.add(box(0.06, 0.04, 0.02, 0x111111, 0.06, 0.2, 0.14)); neck.add(box(0.06, 0.04, 0.02, 0x111111, -0.06, 0.2, 0.14));
  const armPivot = (x) => { const p = new THREE.Group(); p.position.set(x, 1.5, 0); const a = box(0.14, 0.6, 0.16, top, 0, -0.28, 0); const h = box(0.12, 0.12, 0.13, skin, 0, -0.62, 0); p.add(a, h); g.add(p); return p; };
  parts.armL = armPivot(0.32); parts.armR = armPivot(-0.32);
  // gun held in right hand (hidden unless armed)
  const gun = new THREE.Group(); gun.position.set(0, -0.64, 0.1); gun.rotation.x = Math.PI / 2;
  const gunBody = box(0.07, 0.12, 0.32, 0x151515, 0, 0, 0.06); gun.add(gunBody);
  parts.armR.add(gun); gun.visible = false; parts.gun = gun; parts.gunBody = gunBody;
  g.userData.parts = parts;
  return g;
};

G.setGunModel = (h, weapon) => {
  const p = h.userData.parts; if (!p) return;
  const show = weapon && weapon !== 'fists';
  p.gun.visible = !!show;
  if (show) {
    const len = weapon === 'pistol' ? 0.28 : weapon === 'smg' ? 0.42 : weapon === 'shotgun' ? 0.8 : weapon === 'rpg' ? 1.1 : 0.3;
    const w = weapon === 'rpg' ? 0.16 : 0.07;
    p.gunBody.scale.set(w / 0.07, weapon === 'rpg' ? 1.3 : 1, len / 0.32); p.gunBody.position.z = len / 2 - 0.08;
    p.gunBody.material = lam(weapon === 'rpg' ? 0x3d4a2a : weapon === 'shotgun' ? 0x4a3320 : 0x151515);
  }
};

// ---------- vehicles ----------
G.VTYPES = {
  hatch:  { name: 'Hatchback', L: 3.9, W: 1.75, H: 1.45, max: 40, acc: 11, grip: 7, hp: 600, mass: 1.0, cabin: [0.55, 0.15] },
  saloon: { name: 'Saloon', L: 4.6, W: 1.82, H: 1.42, max: 46, acc: 12, grip: 7.5, hp: 700, mass: 1.2, cabin: [0.5, 0.05] },
  estate: { name: 'Estate', L: 4.7, W: 1.82, H: 1.5, max: 43, acc: 11, grip: 7, hp: 700, mass: 1.25, cabin: [0.62, -0.05] },
  sports: { name: 'Sports Coupe', L: 4.4, W: 1.9, H: 1.2, max: 64, acc: 18, grip: 9, hp: 550, mass: 1.1, cabin: [0.4, -0.05] },
  suv:    { name: 'SUV', L: 4.8, W: 1.95, H: 1.8, max: 42, acc: 11, grip: 7, hp: 900, mass: 1.6, cabin: [0.55, -0.05] },
  van:    { name: 'Campus Van', L: 5.2, W: 2.0, H: 2.3, max: 33, acc: 8, grip: 6, hp: 900, mass: 2.0, cabin: [0.2, 0.38] },
  bus:    { name: 'Double Decker', L: 10.6, W: 2.5, H: 4.3, max: 23, acc: 4.8, grip: 6, hp: 2000, mass: 6, cabin: [1, 0] },
  police: { name: 'Police Car', L: 4.7, W: 1.85, H: 1.45, max: 54, acc: 14.5, grip: 8.5, hp: 900, mass: 1.3, cabin: [0.5, 0.0] },
  taxi:   { name: 'Taxi', L: 4.6, W: 1.82, H: 1.45, max: 44, acc: 12, grip: 7.5, hp: 700, mass: 1.2, cabin: [0.5, 0.05] },
};
const PAINT = [0xc0392b, 0x2c3e50, 0xeeeeee, 0x111111, 0x7f8c8d, 0x2e86c1, 0x1e8449, 0xd4ac0d, 0x6c3483, 0xa04000, 0x95a5a6, 0x154360, 0x641e16];

let battenberg = null;
const policeTex = () => {
  if (battenberg) return battenberg;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#1a3fbf' : '#e9f01c'; x.fillRect(i * 16, j * 16, 16, 16); }
  battenberg = new THREE.CanvasTexture(c); battenberg.colorSpace = THREE.SRGBColorSpace; return battenberg;
};
let busWin = null;
const busTex = () => {
  if (busWin) return busWin;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#7a1424'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#1d2630'; for (let i = 0; i < 6; i++) { x.fillRect(6 + i * 42, 12, 36, 38); x.fillRect(6 + i * 42, 72, 36, 36); }
  x.fillStyle = '#e8e8e8'; x.fillRect(0, 58, 256, 6);
  busWin = new THREE.CanvasTexture(c); busWin.colorSpace = THREE.SRGBColorSpace; return busWin;
};

G.makeVehicle = (type) => {
  const t = G.VTYPES[type]; const g = new THREE.Group(); const parts = {};
  const paint = type === 'police' ? 0xf4f4f4 : type === 'taxi' ? 0x111111 : type === 'van' ? G.pick([0xf2f2f2, 0x7a1424, 0x1f3b5a]) : G.pick(PAINT);
  const glass = 0x1b2530;
  const body = new THREE.Group(); g.add(body); parts.body = body;
  const clear = 0.32;
  if (type === 'bus') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(t.W, t.H - clear, t.L), [lam(0x7a1424), lam(0x7a1424), lam(0xe8e8e8), lam(0x222222), lam(0x7a1424, { map: null }), lam(0x7a1424)]);
    const side = new THREE.MeshLambertMaterial({ map: busTex() });
    m.material = [side, side, lam(0xdddddd), lam(0x222222), lam(0x1d2630), lam(0x7a1424)];
    m.position.y = clear + (t.H - clear) / 2; m.castShadow = true; body.add(m);
    const dest = box(t.W * 0.8, 0.35, 0.05, 0xffb000, 0, t.H - 0.5, t.L / 2 + 0.01); dest.material = lam(0xffb000, { emissive: 0x664400 }); body.add(dest);
  } else {
    const lowH = t.H * 0.5;
    const lower = box(t.W, lowH, t.L, paint, 0, clear + lowH / 2, 0); body.add(lower); parts.paint = lower;
    const cabL = t.L * t.cabin[0], cabH = t.H - clear - lowH;
    const cab = box(t.W * 0.86, cabH, cabL, glass, 0, clear + lowH + cabH / 2, -t.L * t.cabin[1] * 0.5); body.add(cab);
    const roof = box(t.W * 0.84, 0.06, cabL * 0.9, paint, 0, clear + lowH + cabH + 0.03, -t.L * t.cabin[1] * 0.5); body.add(roof); parts.roof = roof;
    if (type === 'van') { cab.material = lam(paint); cab.scale.set(1.16, 1, 1); const ws = box(t.W * 0.9, cabH * 0.6, 0.05, glass, 0, clear + lowH + cabH * 0.6, -t.L * t.cabin[1] * 0.5 + cabL / 2 + 0.01); body.add(ws); }
    if (type === 'police') {
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(t.W + 0.02, lowH * 0.5, t.L * 0.92), new THREE.MeshLambertMaterial({ map: policeTex() }));
      s1.position.y = clear + lowH * 0.5; body.add(s1);
      const bar = box(t.W * 0.7, 0.12, 0.3, 0x222222, 0, t.H + 0.06, -t.L * 0.05); body.add(bar);
      parts.lightA = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: 0x1040ff }));
      parts.lightB = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: 0x1040ff }));
      parts.lightA.position.set(0.3, t.H + 0.14, -t.L * 0.05); parts.lightB.position.set(-0.3, t.H + 0.14, -t.L * 0.05); body.add(parts.lightA, parts.lightB);
    }
    if (type === 'taxi') { const sign = box(0.6, 0.18, 0.2, 0xffd000, 0, t.H + 0.1, -t.L * 0.05); sign.material = lam(0xffd000, { emissive: 0x554400 }); body.add(sign); }
  }
  // lights
  const hl = new THREE.MeshLambertMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.3 });
  const tl = new THREE.MeshLambertMaterial({ color: 0xaa0000, emissive: 0xff0000, emissiveIntensity: 0.3 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.05), hl); h.position.set(s * t.W * 0.33, clear + 0.45, t.L / 2 + 0.01); body.add(h);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), tl); r.position.set(s * t.W * 0.35, clear + 0.5, -t.L / 2 - 0.01); body.add(r);
  }
  parts.tail = tl; parts.head = hl;
  // wheels
  const wr = type === 'bus' ? 0.5 : 0.34;
  const wg = new THREE.CylinderGeometry(wr, wr, 0.24, 10); wg.rotateZ(Math.PI / 2);
  parts.wheels = [];
  const axles = type === 'bus' ? [t.L * 0.36, -t.L * 0.3] : [t.L * 0.34, -t.L * 0.32];
  for (const az of axles) for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * (t.W / 2 - 0.1), wr, az);
    const w = new THREE.Mesh(wg, lam(0x161616)); w.castShadow = true; piv.add(w); g.add(piv);
    parts.wheels.push({ piv, w, front: az > 0 });
  }
  g.userData.parts = parts; g.userData.paint = paint;
  return g;
};

G.makeHeli = () => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), lam(0x1a2a6a)); body.scale.set(1, 0.9, 1.6); body.castShadow = true; g.add(body);
  const stripe = box(2.4, 0.4, 3.6, 0xe9f01c, 0, -0.2, 0); g.add(stripe);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), lam(0x223344)); glass.position.set(0, 0.3, 1.4); glass.scale.set(1, 0.8, 0.8); g.add(glass);
  const tail = box(0.3, 0.3, 4.5, 0x1a2a6a, 0, 0.2, -3.8); g.add(tail);
  const fin = box(0.1, 1.2, 0.6, 0x1a2a6a, 0, 0.8, -5.9); g.add(fin);
  for (const s of [-1, 1]) { const sk = box(0.1, 0.1, 3.2, 0x222222, s * 1.0, -1.5, 0); g.add(sk); }
  const rotor = new THREE.Group(); rotor.position.y = 1.4; g.add(rotor);
  rotor.add(box(11, 0.05, 0.35, 0x111111)); rotor.add(box(0.35, 0.05, 11, 0x111111));
  const trotor = new THREE.Group(); trotor.position.set(0.2, 0.8, -5.9); g.add(trotor);
  trotor.add(box(0.05, 1.8, 0.2, 0x111111));
  const spot = new THREE.SpotLight(0xffffff, 0, 120, 0.25, 0.5, 1); spot.position.set(0, -1, 1); g.add(spot); g.add(spot.target);
  g.userData.parts = { rotor, trotor, spot };
  return g;
};
})();
