// The Bowland South courtyard ramp: a wide deck climbing at one constant gradient round the curve (the line of
// the OSM wall), with shop units built in underneath it. Their fronts face a sunken courtyard inside the curve,
// lowered so there's full shop height under the deck; the courtyard slopes back up across its open south side.
'use strict';
(() => {
const T = G.T;
const R = G.RAMP = { ok: false };
const IN_W = 6.0;            // deck width inward from the centre line (over the shops)
const OUT_W = 0.9;           // deck width outward
const SHOP_CLEAR = 3.4;      // shop height (floor to underside of deck)
const SLAB = 0.4;            // deck thickness
const SHOP_DEPTH = 4.8;      // from the glass back under the deck
const BLEND = 6;             // courtyard floor rises back to ground over this distance from the open side
R.SHOP_CLEAR = SHOP_CLEAR; R.SLAB = SLAB;

G.setupRamp = (pts, y0, y1, outEnd) => {
  const segs = []; let L = 0;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const ax = pts[k], az = pts[k + 1], bx = pts[k + 2], bz = pts[k + 3], l = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, l, s0: L, ux: (bx - ax) / l, uz: (bz - az) / l }); L += l;
  }
  // inward = toward the inside of the curve
  const c = G.centroid(pts), mid = segs[Math.floor(segs.length / 2)];
  const nx0 = -mid.uz, nz0 = mid.ux, side = Math.sign((c.x - mid.ax) * nx0 + (c.z - mid.az) * nz0) || 1;
  for (const g of segs) { g.nx = -g.uz * side; g.nz = g.ux * side; }
  Object.assign(R, { ok: true, pts, segs, L, y0, y1, outEnd: outEnd || OUT_W, shops: [] });
  const bb = G.bbox(pts); R.bb = [bb[0] - 12, bb[1] - 12, bb[2] + 12, bb[3] + 12];
  // map "angle round the courtyard" -> distance along the ramp, so the sunken floor is one smooth surface
  const cx = c.x, cz = c.z, tab = []; let prev = null;
  for (let s2 = 0; s2 <= L + 1e-6; s2 += 0.5) {
    let q = null; for (const g of segs) if (s2 <= g.s0 + g.l + 1e-6) { const k = (s2 - g.s0) / g.l; q = { x: g.ax + (g.bx - g.ax) * k, z: g.az + (g.bz - g.az) * k }; break; }
    let a = Math.atan2(q.z - cz, q.x - cx); if (prev !== null) { while (a - prev > Math.PI) a -= 2 * Math.PI; while (a - prev < -Math.PI) a += 2 * Math.PI; }
    tab.push([a, s2]); prev = a;
  }
  if (tab[tab.length - 1][0] < tab[0][0]) tab.reverse();
  R.angTab = tab; R.cen = { x: cx, z: cz };
  R.chord = { ax: pts[0], az: pts[1], bx: pts[pts.length - 2], bz: pts[pts.length - 1] };
  return R;
};
R.y = (s) => R.y0 + (R.y1 - R.y0) * G.clamp(s / R.L, 0, 1);
R.outW = (s) => OUT_W + (R.outEnd - OUT_W) * G.clamp((s - (R.L - 6)) / 6, 0, 1);   // widens at the top to meet Slaidburn House
R.at = (s) => {
  s = G.clamp(s, 0, R.L); let g = R.segs[R.segs.length - 1];
  for (const q of R.segs) if (s <= q.s0 + q.l) { g = q; break; }
  const k = (s - g.s0) / g.l; return { x: g.ax + (g.bx - g.ax) * k, z: g.az + (g.bz - g.az) * k, nx: g.nx, nz: g.nz, ux: g.ux, uz: g.uz };
};
// position relative to the ramp: s along it, t across (positive = inward, toward the courtyard)
const loc = { s: 0, t: 0, d: 0 };
R.locate = (x, z) => {
  if (!R.ok || x < R.bb[0] || x > R.bb[2] || z < R.bb[1] || z > R.bb[3]) return null;
  let best = Infinity;
  for (const g of R.segs) {
    const u = G.clamp((x - g.ax) * g.ux + (z - g.az) * g.uz, 0, g.l), px = g.ax + g.ux * u, pz = g.az + g.uz * u, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; loc.s = g.s0 + u; loc.t = (x - px) * g.nx + (z - pz) * g.nz; loc.d = d; }
  }
  return loc;
};
// deck surface height, or null if not over the deck
R.deckAt = (x, z) => {
  const l = R.locate(x, z); if (!l || l.s <= 0.01 || l.s >= R.L - 0.01) return null;
  if (l.t > IN_W || l.t < -R.outW(l.s)) return null;
  return R.y(l.s);
};
// inside the curve (closed by the straight line between the ends)?
const insideU = (x, z) => G.pip(x, z, R.pts);
const chordDist = (x, z) => { const c = R.chord, dx = c.bx - c.ax, dz = c.bz - c.az, L = Math.hypot(dx, dz); return Math.abs((x - c.ax) * dz - (z - c.az) * dx) / L; };
R.shopFloor = (s) => R.y(s) - SLAB - SHOP_CLEAR;
const flAt = (s, t) => { const a = R.at(s); return R.pf(a.x + a.nx * t, a.z + a.nz * t) + 0.03; };   // shop floors lie on the courtyard's plane
// sunken courtyard floor (or null outside it)
const sByAngle = (x, z) => {
  const tab = R.angTab, lo = tab[0][0], hi = tab[tab.length - 1][0];
  let a = Math.atan2(z - R.cen.z, x - R.cen.x); const mid = (lo + hi) / 2;
  while (a - mid > Math.PI) a -= 2 * Math.PI; while (a - mid < -Math.PI) a += 2 * Math.PI;
  if (a <= lo) return tab[0][1]; if (a >= hi) return tab[tab.length - 1][1];
  let i = 1; while (tab[i][0] < a) i++;
  const k = (a - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]); return tab[i - 1][1] + (tab[i][1] - tab[i - 1][1]) * k;
};
R.pf = (x, z) => (R.plane ? R.plane[0] + R.plane[1] * x + R.plane[2] * z : T.base(x, z));
R.sunkAt = (x, z) => {
  const l = R.locate(x, z); if (!l || l.t <= 0 || !insideU(x, z) || !R.plane) return null;   // also under the deck (hidden), so no slope pokes out at the shopfronts
  const b = T.base(x, z), target = R.pf(x, z);
  const k = G.clamp(chordDist(x, z) / BLEND, 0, 1), w = k * k * (3 - 2 * k);     // smooth rise back to ground at the open side
  const v = b + (Math.min(b, target) - b) * w;
  return v < b - 0.02 ? v : null;
};
T.rampHook = R.deckAt;
T.sunkHook = R.sunkAt;

// --- shops: place each named shop on the stretch of ramp nearest its real location, without overlaps
G.placeRampShops = (list) => {
  const D = window.CAMPUS, LEN = 6.4, GAP = 0.8;
  const items = [];
  for (const sh of list) {
    const poi = D.pois.find((q) => q.n === sh.n); if (!poi) continue;
    const l = R.locate(poi.x, poi.z); let s = l ? l.s : R.L / 2;
    items.push({ ...sh, poi, s: G.clamp(s, 7 + LEN / 2, R.L - 4 - LEN / 2) });
  }
  items.sort((a, b) => a.s - b.s);
  for (let i = 1; i < items.length; i++) if (items[i].s - items[i - 1].s < LEN + GAP) items[i].s = items[i - 1].s + LEN + GAP;
  for (let i = items.length - 2; i >= 0; i--) if (items[i + 1].s > R.L - 4 - LEN / 2) { items[i + 1].s = R.L - 4 - LEN / 2; if (items[i + 1].s - items[i].s < LEN + GAP) items[i].s = items[i + 1].s - LEN - GAP; }
  for (const it of items) { it.s0 = it.s - LEN / 2; it.s1 = it.s + LEN / 2; R.shops.push(it); }
  // courtyard floor = one smooth plane through the floors the shops need (deck - slab - shop height), lowered
  // just enough that every shop keeps its full height everywhere along its front and back
  const P = [];
  for (const it of items) for (let s2 = it.s0; s2 <= it.s1 + 1e-6; s2 += 1) for (const t of [IN_W - 0.25, IN_W - SHOP_DEPTH]) { const a = R.at(s2); P.push([a.x + a.nx * t, a.z + a.nz * t, R.shopFloor(s2)]); }
  if (P.length >= 3) {
    // least squares y = a + b x + c z
    let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
    for (const [x, z, y] of P) { const r = [1, x, z]; for (let i = 0; i < 3; i++) { v[i] += r[i] * y; for (let j = 0; j < 3; j++) S[i][j] += r[i] * r[j]; } }
    const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D0 = det3(S), sol = [0, 1, 2].map((k) => det3(S.map((row, i) => row.map((c, j) => (j === k ? v[i] : c)))) / D0);
    let off = 0; for (const [x, z, y] of P) off = Math.max(off, sol[0] + sol[1] * x + sol[2] * z - y);
    R.plane = [sol[0] - off, sol[1], sol[2]];
  }
  for (const it of items) {
    const a = R.at(it.s), x = a.x + a.nx * (IN_W + 1.6), z = a.z + a.nz * (IN_W + 1.6);
    it.floor = flAt(it.s, IN_W - 0.25);
    // the shop's robbery spot and label sit just in front of its glass, on the courtyard floor
    it.poi.x = x; it.poi.z = z; it.poi.y = R.pf(x, z);
  }
  return R.shops;
};

// --- collision: the deck footprint is solid underneath (shops / structure), walkable on top
G.rampGrid = (grid) => {
  for (let s = 0.2; s < R.L - 0.1; s += 0.25) {
    const a = R.at(s);
    for (let t = -R.outW(s); t <= IN_W; t += 0.25) grid.set(a.x + a.nx * t, a.z + a.nz * t, G.BUILDING);
  }
};

// --- geometry
G.buildRamp = () => {
  const hex = (h) => { const c = new THREE.Color(h); c.convertSRGBToLinear(); return [c.r, c.g, c.b]; };
  const B = new G.GeoBuilder(), GL = new G.GeoBuilder();
  const paving = hex('#bdb6aa'), stone = hex('#8f897e'), stoneD = hex('#7b766c'), ceiling = hex('#9c978f'), floorC = hex('#d2cdc3'), frame = hex('#2b2d31'), rail = hex('#4a4d52');
  const P = (s, t, y) => { const a = R.at(s); return [a.x + a.nx * t, y, a.z + a.nz * t]; };
  const inShop = (s) => R.shops.find((sh) => s >= sh.s0 - 1e-6 && s <= sh.s1 + 1e-6);
  const STEP = 0.5;
  for (let s = 0; s < R.L - 1e-6; s += STEP) {
    const s2 = Math.min(R.L, s + STEP), ya = R.y(s), yb = R.y(s2), oa = -R.outW(s), ob = -R.outW(s2);
    // deck top
    B.quad(P(s, oa, ya), P(s2, ob, yb), P(s2, IN_W, yb), P(s, IN_W, ya), null, paving);
    // outer face down to the ground
    const ga = T.base(...[P(s, oa, 0)].map((p) => [p[0], p[2]])[0]) - 0.3, gb = T.base(...[P(s2, ob, 0)].map((p) => [p[0], p[2]])[0]) - 0.3;
    B.quad(P(s, oa, ga), P(s2, ob, gb), P(s2, ob, yb), P(s, oa, ya), null, stone);
    // inner face: shopfront or solid wall down to the courtyard
    const sh = inShop((s + s2) / 2);
    const fa = G.groundAt(...[P(s, IN_W + 0.3, 0)].map((p) => [p[0], p[2]])[0], -1e4) - 0.3, fb = G.groundAt(...[P(s2, IN_W + 0.3, 0)].map((p) => [p[0], p[2]])[0], -1e4) - 0.3;
    if (!sh) B.quad(P(s2, IN_W, fb), P(s, IN_W, fa), P(s, IN_W, ya), P(s2, IN_W, yb), null, (Math.floor(s / 2) % 2) ? stone : stoneD);
    else {
      const ua = ya - SLAB, ub = yb - SLAB;
      B.quad(P(s2, IN_W, ub), P(s, IN_W, ua), P(s, IN_W, ya), P(s2, IN_W, yb), null, stoneD);                                   // deck edge
      const fA = flAt(s, IN_W - 0.25), fB = flAt(s2, IN_W - 0.25), bA = flAt(s, IN_W - SHOP_DEPTH), bB = flAt(s2, IN_W - SHOP_DEPTH);
      GL.quad(P(s, IN_W - 0.25, fA), P(s2, IN_W - 0.25, fB), P(s2, IN_W - 0.25, ub - 0.75), P(s, IN_W - 0.25, ua - 0.75), null, [1, 1, 1]);   // glass
      B.quad(P(s, IN_W - 0.25, ua - 0.75), P(s2, IN_W - 0.25, ub - 0.75), P(s2, IN_W - 0.25, ub), P(s, IN_W - 0.25, ua), null, frame);                 // sign backing
      if (Math.abs(((s - sh.s0) % 2.1)) < STEP * 0.6) { const m0 = P(s, IN_W - 0.22, 0), m1 = P(s + 0.08, IN_W - 0.22, 0); B.box(m0[0], m0[2], m1[0], m1[2], 0.1, fA, ua - 0.75, frame); }
      // interior: floor, ceiling (deck underside), back wall, counter, shelves
      B.quad(P(s, IN_W - 0.3, fA), P(s2, IN_W - 0.3, fB), P(s2, IN_W - SHOP_DEPTH, bB), P(s, IN_W - SHOP_DEPTH, bA), null, floorC);
      B.quad(P(s, IN_W - SHOP_DEPTH, ua), P(s2, IN_W - SHOP_DEPTH, ub), P(s2, IN_W - 0.25, ub), P(s, IN_W - 0.25, ua), null, ceiling);
      B.quad(P(s, IN_W - SHOP_DEPTH, bA), P(s2, IN_W - SHOP_DEPTH, bB), P(s2, IN_W - SHOP_DEPTH, ub), P(s, IN_W - SHOP_DEPTH, ua), null, hex(sh.wall || '#e8e1d2'));
      const c0 = P(s, IN_W - SHOP_DEPTH + 1.6, 0), c1 = P(s2, IN_W - SHOP_DEPTH + 1.6, 0); { const cy = flAt(s, IN_W - SHOP_DEPTH + 1.6); B.box(c0[0], c0[2], c1[0], c1[2], 0.7, cy - 0.1, cy + 1.05, hex('#6b4a34')); }
      const k = Math.floor((s - sh.s0) / STEP) % 3, w0 = P(s, IN_W - SHOP_DEPTH + 0.35, 0), w1 = P(s2, IN_W - SHOP_DEPTH + 0.35, 0);
      B.box(w0[0], w0[2], w1[0], w1[2], 0.45, bA - 0.1, bA + 2.1, hex('#5a5f66'));
      for (let r = 0; r < 3; r++) B.box(w0[0], w0[2], w1[0], w1[2], 0.5, bA + 0.5 + r * 0.55, bA + 0.75 + r * 0.55, hex(['#d23c3c', '#e0b23a', '#3c8fd2', '#4fae5a'][(k + r) % 4]));
    }
    // railings along both edges where there's a drop
    if (ya - (fa + 0.3) > 0.9) B.box(...[P(s, IN_W - 0.08, 0), P(s2, IN_W - 0.08, 0)].flatMap((p) => [p[0], p[2]]), 0.06, ya, ya + 1.05, rail);
    if (ya - (ga + 0.3) > 0.9) B.box(...[P(s, oa + 0.08, 0), P(s2, ob + 0.08, 0)].flatMap((p) => [p[0], p[2]]), 0.06, ya, ya + 1.05, rail);
  }
  // shop side walls (between units / at their ends) and piers, signs, lights
  const signTex = (text, bg, fg, aspect) => {
    const Hc = 160, Wc = Math.max(160, Math.round(Hc * aspect)); const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, Wc, Hc);
    let fs = 104; x.font = `bold ${fs}px "Helvetica Neue", Arial, sans-serif`; const tw = x.measureText(text).width; if (tw > Wc * 0.86) fs = Math.floor(fs * Wc * 0.86 / tw);
    x.font = `bold ${fs}px "Helvetica Neue", Arial, sans-serif`; x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, Wc / 2, Hc / 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  for (const sh of R.shops) {
    for (const se of [sh.s0, sh.s1]) {
      const y = R.y(se) - SLAB;
      B.quad(P(se, IN_W - SHOP_DEPTH, flAt(se, IN_W - SHOP_DEPTH)), P(se, IN_W - 0.25, flAt(se, IN_W - 0.25)), P(se, IN_W - 0.25, y), P(se, IN_W - SHOP_DEPTH, y), null, hex('#e8e1d2'));
      const p0 = P(se - 0.25, IN_W + 0.25, 0), p1 = P(se + 0.25, IN_W + 0.25, 0); B.box(p0[0], p0[2], p1[0], p1[2], 0.55, flAt(se, IN_W + 0.25) - 0.3, y, hex('#8f6a48'));   // brick pier
    }
    const sm = (sh.s0 + sh.s1) / 2, a = R.at(sm), y = R.y(sm) - SLAB - 0.38, sw = sh.s1 - sh.s0 - 0.6, shh = 0.62;
    const t = signTex(sh.sign, sh.bg, sh.fg, sw / shh);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, shh), new THREE.MeshLambertMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55 }));
    sign.position.set(a.x + a.nx * (IN_W + 0.05), y, a.z + a.nz * (IN_W + 0.05)); sign.rotation.y = Math.atan2(a.nx, a.nz); G.scene.add(sign);
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(sw * 0.6, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff1d0 }));
    lp.position.set(a.x + a.nx * (IN_W - SHOP_DEPTH / 2), R.y(sm) - SLAB - 0.03, a.z + a.nz * (IN_W - SHOP_DEPTH / 2)); lp.rotation.x = Math.PI / 2; lp.rotation.z = -Math.atan2(a.nx, a.nz); G.scene.add(lp);
  }
  // end caps
  for (const se of [0, R.L]) { const y = R.y(se), o = -R.outW(se), a = P(se, o, 0), b = P(se, IN_W, 0); B.quad(P(se, o, T.base(a[0], a[2]) - 0.3), P(se, IN_W, G.groundAt(b[0], b[2], -1e4) - 0.3), P(se, IN_W, y), P(se, o, y), null, stone); }
  const m = B.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.castShadow = true; m.receiveShadow = true; G.scene.add(m);
  const gm = GL.mesh(new THREE.MeshLambertMaterial({ color: 0x9cc3d8, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })); gm.renderOrder = 3; G.scene.add(gm);
};
})();
