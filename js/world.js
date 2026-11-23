// Builds the Lancaster University campus from OpenStreetMap-derived data (data/campus.js).
'use strict';
(() => {
const D = window.CAMPUS;
const tick = () => new Promise((r) => setTimeout(r, 0));

const VEH_ROADS = new Set(['motorway', 'motorway_link', 'trunk', 'primary', 'primary_link', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service']);
const PED_ROADS = new Set(['footway', 'pedestrian', 'path', 'cycleway', 'steps', 'living_street', 'service', 'track', 'residential', 'unclassified']);
const ROAD_SPEED = { motorway: 30, motorway_link: 18, trunk: 24, primary: 17, primary_link: 12, secondary: 15, tertiary: 13, unclassified: 10, residential: 8, living_street: 6, service: 6 };
G.ROAD_SPEED = ROAD_SPEED;

const AREA_COL = {
  grass: '#6fa24b', park: '#79a853', farm: '#93ad62', wood: '#3e6a2f', scrub: '#5d7c3c', yard: '#9b937f',
  parking: '#56575c', plaza: '#bdb5a5', paved: '#a9a398', water: '#3f6f8e', tank: '#9a9a9a',
};
const PATH_COL = { footway: '#d2c9b4', pedestrian: '#c9c1b0', path: '#b9a987', cycleway: '#c7a487', steps: '#b6ae9e', track: '#a8977a', bridleway: '#a8977a' };

function ringPath(ctx, p) { ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); }
function linePath(ctx, p) { ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); }

// ---------- geometry builder ----------
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; }
  tri(a, b, c, n, col, uva, uvb, uvc) {
    this.pos.push(...a, ...b, ...c);
    if (!n) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const l = Math.hypot(...n) || 1; n = [n[0] / l, n[1] / l, n[2] / l]; }
    this.nor.push(...n, ...n, ...n); this.col.push(...col, ...col, ...col);
    this.uv.push(...(uva || [0, 0]), ...(uvb || [0, 0]), ...(uvc || [0, 0]));
  }
  quad(a, b, c, d, n, col, uvs) { this.tri(a, b, c, n, col, uvs && uvs[0], uvs && uvs[1], uvs && uvs[2]); this.tri(a, c, d, n, col, uvs && uvs[0], uvs && uvs[2], uvs && uvs[3]); }
  // oriented box along a segment
  box(ax, az, bx, bz, w, y0, y1, col) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.01) return;
    const nx = -dz / L * w / 2, nz = dx / L * w / 2;
    const p = (x, y, z) => [x, y, z];
    const A0 = p(ax + nx, y0, az + nz), B0 = p(bx + nx, y0, bz + nz), B1 = p(bx - nx, y0, bz - nz), A1 = p(ax - nx, y0, az - nz);
    const A0t = p(ax + nx, y1, az + nz), B0t = p(bx + nx, y1, bz + nz), B1t = p(bx - nx, y1, bz - nz), A1t = p(ax - nx, y1, az - nz);
    this.quad(A0, B0, B0t, A0t, null, col); this.quad(B1, A1, A1t, B1t, null, col);
    this.quad(A0t, B0t, B1t, A1t, null, col); this.quad(B0, B1, B1t, B0t, null, col); this.quad(A1, A0, A0t, A1t, null, col);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}
G.GeoBuilder = GeoBuilder;
const hex = (h) => { const c = new THREE.Color(h); c.convertSRGBToLinear(); return [c.r, c.g, c.b]; };
const jitter = (c, rnd, amt = 0.08) => { const k = 1 + (rnd() - 0.5) * amt * 2; return [c[0] * k, c[1] * k, c[2] * k]; };

// ---------- textures ----------
function windowTextures() {
  const S = 256;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const base = mk(), em = mk();
  const b = base.getContext('2d'), e = em.getContext('2d');
  b.fillStyle = '#ececec'; b.fillRect(0, 0, S, S);
  // subtle panel lines
  b.fillStyle = '#d4d4d4'; b.fillRect(0, S / 2 - 3, S, 4); b.fillRect(0, S - 4, S, 4);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const lit = [0.9, 0, 0.6, 0.15];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const x = i * S / 2 + 16, y = j * S / 2 + 26, w = S / 2 - 32, h = S / 2 - 54;
    b.fillStyle = '#9a9a9a'; b.fillRect(x - 3, y - 3, w + 6, h + 6);
    const g = b.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#2e3a46'); g.addColorStop(1, '#4b5d6b');
    b.fillStyle = g; b.fillRect(x, y, w, h);
    b.fillStyle = '#8c8c8c'; b.fillRect(x + w / 2 - 2, y, 4, h);
    const l = lit[i * 2 + j]; if (l > 0) { e.fillStyle = `rgba(255,214,140,${l})`; e.fillRect(x, y, w, h); }
  }
  const t1 = new THREE.CanvasTexture(base), t2 = new THREE.CanvasTexture(em);
  for (const t of [t1, t2]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
  return [t1, t2];
}

G.makeLabel = (text, opts = {}) => {
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const fs = 34; ctx.font = `bold ${fs}px system-ui, sans-serif`;
  const w = Math.min(1000, Math.ceil(ctx.measureText(text).width) + 28);
  c.width = w; c.height = 52;
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  ctx.fillStyle = opts.bg || 'rgba(12,16,24,0.72)'; ctx.fillRect(0, 0, w, 52);
  ctx.fillStyle = opts.accent || '#ffd34a'; ctx.fillRect(0, 0, 6, 52);
  ctx.fillStyle = opts.color || '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 16, 28);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: tex, depthTest: opts.depthTest !== false, transparent: true });
  const s = new THREE.Sprite(m); const hgt = opts.size || 1.6;
  s.scale.set(hgt * w / 52, hgt, 1); s.renderOrder = 5;
  return s;
};

G.buildWorld = async (status) => {
  const scene = G.scene;
  const HW = D.half[0] + 40, HH = D.half[1] + 40;
  G.HW = HW; G.HH = HH;
  const rnd = G.mulberry(1964); // the year the university opened
  const T = G.T; T.initUnderpass(D.roads); const U = T.U;
  // a way that runs underground inside the Underpass box (vs. surface passages through buildings)
  const isUnder = (r) => { if (!(r.ly && +r.ly < 0) && !(r.lv && /^-1/.test(r.lv))) return false; const n = r.p.length / 2, k = Math.floor(n / 2) * 2; return T.deck(r.p[k], r.p[k + 1], 1) !== null; };
  G.isUnder = isUnder;
  const surfY = (x, z) => G.groundAt(x, z);

  // ---------------- collision grid ----------------
  status('Rasterising collision…'); await tick();
  const grid = G.grid = new G.Grid(HW, HH, 0.5);
  const roadGrid = G.roadGrid = new G.Grid(HW, HH, 1.0);
  for (const a of D.areas) if (a.k === 'water') grid.fillRings([a.p, ...(a.hl || [])], G.WATER);
  for (const b of D.buildings) {
    if (b.t === 'roof' || b.mh > 0) continue;
    grid.fillRings([b.p, ...(b.hl || [])], G.BUILDING);
  }
  T.initStairs(D.roads, grid); // needs the building footprints to keep a walkway at the top
  for (const l of D.lines) {
    if (l.k === 'hedge') grid.stroke(l.p, 1.0, G.BARRIER);
    else if (l.k === 'wall') grid.stroke(l.p, 0.5, G.BARRIER);
    else if (l.k === 'fence') grid.stroke(l.p, 0.3, G.BARRIER);
  }
  for (const r of D.roads) {
    const veh = VEH_ROADS.has(r.t);
    roadGrid.stroke(r.p, r.w + (veh ? 0.5 : 0), veh ? 1 : 2, veh ? null : (v) => v === 0);
  }

  // ---------------- trees ----------------
  status('Planting trees…'); await tick();
  const trees = [];
  const addTree = (x, z, s) => { if (trees.length < (G.mobile ? 3500 : 9000)) trees.push([x, z, s]); };
  for (let i = 0; i < D.trees.length; i += 2) addTree(D.trees[i], D.trees[i + 1], G.rand(0.9, 1.4));
  for (const l of D.lines) if (l.k === 'treerow') {
    const p = l.p;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const L = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]), n = Math.max(1, Math.floor(L / 7));
      for (let s = 0; s < n; s++) addTree(p[k] + (p[k + 2] - p[k]) * s / n, p[k + 1] + (p[k + 3] - p[k + 1]) * s / n, G.rand(0.9, 1.3));
    }
  }
  const okTree = (x, z) => grid.get(x, z) === G.FREE && roadGrid.get(x, z) === 0;
  for (const a of D.areas) {
    const spacing = a.k === 'wood' ? (G.mobile ? 12 : 8) : (a.k === 'park' || a.k === 'grass') ? 22 : a.k === 'scrub' ? 12 : 0;
    if (!spacing) continue;
    const [x0, z0, x1, z1] = G.bbox(a.p);
    for (let x = x0; x < x1; x += spacing) for (let z = z0; z < z1; z += spacing) {
      if ((a.k === 'grass' || a.k === 'park') && rnd() < 0.55) continue;
      const px = x + rnd() * spacing * 0.8, pz = z + rnd() * spacing * 0.8;
      if (!G.pip(px, pz, a.p) || (a.hl && a.hl.some((h) => G.pip(px, pz, h)))) continue;
      if (!okTree(px, pz) || !okTree(px + 2, pz) || !okTree(px - 2, pz) || !okTree(px, pz + 2) || !okTree(px, pz - 2)) continue;
      addTree(px, pz, a.k === 'scrub' ? G.rand(0.5, 0.8) : G.rand(0.85, 1.5));
    }
  }
  for (const t of trees) if (grid.get(t[0], t[1]) === G.FREE) grid.disc(t[0], t[1], 0.35 * t[2], G.TREE);

  // clear roads, tunnels and gaps (underpass, the Spine, building passages)
  for (const r of D.roads) {
    if (isUnder(r)) continue;
    if (VEH_ROADS.has(r.t)) grid.stroke(r.p, Math.max(2.5, r.w - 0.8), G.FREE);
    else if (r.tu) grid.stroke(r.p, Math.max(2.2, r.w), G.FREE);
    else grid.stroke(r.p, Math.max(1.4, r.w * 0.8), G.FREE, (v) => v === G.BARRIER || v === G.WATER || v === G.TREE);
  }

  // Underpass: open cuttings are clear inside, with railings along the top; stairwells get railings too
  if (U.ok) {
    for (let i = 0; i < U.N; i++) {
      if (!U.act[i]) continue;
      const pnt = U.at(i), hw = U.hw[i];
      if (!U.cov[i]) for (let t = -hw; t <= hw; t += 0.4) grid.set(pnt.x + pnt.lx * t, pnt.z + pnt.lz * t, G.FREE);
      for (const sd of [-1, 1]) {
        const side = sd > 0 ? U.Hl[i] : U.Hr[i];
        if (!U.cov[i] && side - U.F[i] > 1.0) grid.disc(pnt.x + pnt.lx * sd * (hw + 0.35), pnt.z + pnt.lz * sd * (hw + 0.35), 0.3, G.BARRIER);
      }
    }
    // parapets on the deck above each tunnel mouth (a real 6 m drop into the cutting)
    for (let i = 1; i < U.N; i++) {
      if (U.cov[i] === U.cov[i - 1]) continue;
      const sP = U.cov[i] ? i + 0.6 : i - 1 - 0.6, pnt = U.at(sP), W = U.hw[Math.round(Math.min(U.N - 1, Math.max(0, sP)))] + 2.6;
      for (let t = -W; t <= W; t += 0.3) grid.disc(pnt.x + pnt.lx * t, pnt.z + pnt.lz * t, 0.25, G.BARRIER);
      U.portals = U.portals || []; U.portals.push({ s: sP, W });
    }
    for (const st of T.stairs) {
      for (let s2 = st.s - st.wid - 0.6; s2 <= st.s + st.wid + 0.6; s2 += 0.3) {
        const pnt = U.at(s2);
        for (let t = st.hw; t <= st.edge - 0.3; t += 0.3) {
          const x = pnt.x + pnt.lx * st.side * t, z = pnt.z + pnt.lz * st.side * t;
          const edge = Math.abs(s2 - st.s) > st.wid;
          if (edge) { if (t > st.hwc + 2.5 && t < st.hw + st.len - 0.2) grid.set(x, z, G.BARRIER); }
          else if (grid.get(x, z) !== G.BUILDING || t <= st.hw + st.len) grid.set(x, z, G.FREE);
        }
      }
    }
  }

  // the edge of the playable map: a dry-stone field wall (visible) instead of an invisible limit
  const EDGE = 2.5;
  const boundary = [[-HW + EDGE, -HH + EDGE], [HW - EDGE, -HH + EDGE], [HW - EDGE, HH - EDGE], [-HW + EDGE, HH - EDGE], [-HW + EDGE, -HH + EDGE]];
  grid.stroke(boundary.flat(), 0.9, G.BARRIER);
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) { const x = grid.ox + (i + 0.5) * grid.cell, z = grid.oz + (j + 0.5) * grid.cell; if (Math.abs(x) > HW - EDGE || Math.abs(z) > HH - EDGE) grid.d[j * grid.w + i] = G.BARRIER; }

  // ---------------- ground texture ----------------
  status('Painting the ground…'); await tick();
  const S = G.mobile ? 1.25 : 2; // px per metre (phones: keep canvases under iOS size limits)
  const big = document.createElement('canvas'); big.width = Math.ceil(2 * HW * S); big.height = Math.ceil(2 * HH * S);
  const ctx = big.getContext('2d');
  ctx.fillStyle = '#6a9a46'; ctx.fillRect(0, 0, big.width, big.height);
  // speckle for texture
  for (let i = 0; i < (G.mobile ? 30000 : 90000); i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(40,70,20,0.10)' : 'rgba(150,190,90,0.10)'; ctx.fillRect(rnd() * big.width, rnd() * big.height, 2 + rnd() * 5, 2 + rnd() * 5); }
  ctx.setTransform(S, 0, 0, S, HW * S, HH * S);
  const order = ['farm', 'grass', 'park', 'scrub', 'wood', 'yard', 'paved', 'parking', 'plaza', 'tank'];
  const drawArea = (a, col) => { ctx.beginPath(); ringPath(ctx, a.p); if (a.hl) for (const h of a.hl) ringPath(ctx, h); ctx.fillStyle = col; ctx.fill('evenodd'); };
  for (const k of order) for (const a of D.areas) if (a.k === k) drawArea(a, AREA_COL[k]);
  for (const a of D.areas) if (a.k.startsWith('pitch')) {
    const surf = a.k.split(':')[1] || 'grass';
    const col = /artificial|astro|turf/.test(surf) ? '#3b8f53' : /tartan|acrylic|asphalt|hard/.test(surf) ? '#7d4f4b' : /clay/.test(surf) ? '#b5653f' : '#5aa548';
    drawArea(a, col); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.18; ctx.beginPath(); ringPath(ctx, a.p); ctx.stroke();
    // halfway line
    const bb = G.bbox(a.p); const cx = (bb[0] + bb[2]) / 2, cz = (bb[1] + bb[3]) / 2;
    ctx.beginPath(); ctx.arc(cx, cz, Math.min(bb[2] - bb[0], bb[3] - bb[1]) * 0.12, 0, Math.PI * 2); ctx.stroke();
  }
  // parking bays: faint stripes
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.12;
  for (const a of D.areas) if (a.k === 'parking') {
    const bb = G.bbox(a.p); ctx.save(); ctx.beginPath(); ringPath(ctx, a.p); ctx.clip();
    ctx.beginPath(); for (let x = bb[0]; x < bb[2]; x += 2.5) { ctx.moveTo(x, bb[1]); ctx.lineTo(x, bb[3]); } ctx.stroke(); ctx.restore();
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const l of D.lines) {
    if (l.k === 'stream' || l.k === 'river') { ctx.strokeStyle = AREA_COL.water; ctx.lineWidth = l.k === 'river' ? 6 : 1.8; ctx.beginPath(); linePath(ctx, l.p); ctx.stroke(); }
    if (l.k === 'rail') { ctx.strokeStyle = '#7d7264'; ctx.lineWidth = 7; ctx.beginPath(); linePath(ctx, l.p); ctx.stroke(); ctx.strokeStyle = '#4a4038'; ctx.lineWidth = 1.6; ctx.setLineDash([0.3, 0.6]); ctx.stroke(); ctx.setLineDash([]); }
  }
  for (const a of D.areas) if (a.k === 'water') drawArea(a, AREA_COL.water);
  // paths
  const pathRoads = D.roads.filter((r) => !VEH_ROADS.has(r.t) && !isUnder(r));
  for (const r of pathRoads) { ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = r.w + 0.5; ctx.beginPath(); linePath(ctx, r.p); ctx.stroke(); }
  for (const r of pathRoads) { ctx.strokeStyle = PATH_COL[r.t] || '#c8bfae'; ctx.lineWidth = r.w; ctx.beginPath(); linePath(ctx, r.p); ctx.stroke(); }
  for (const r of pathRoads) if (r.t === 'steps') { ctx.strokeStyle = 'rgba(60,50,40,0.5)'; ctx.lineWidth = r.w; ctx.setLineDash([0.12, 0.35]); ctx.lineCap = 'butt'; ctx.beginPath(); linePath(ctx, r.p); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'round'; }
  // vehicle roads: kerb, asphalt, markings
  const vroads = D.roads.filter((r) => VEH_ROADS.has(r.t) && !isUnder(r)).sort((a, b) => a.w - b.w);
  const troads = D.roads.filter((r) => VEH_ROADS.has(r.t) && isUnder(r));
  for (const r of vroads) { ctx.strokeStyle = '#9d9a92'; ctx.lineWidth = r.w + (r.t === 'service' ? 0.4 : 1.4); ctx.beginPath(); linePath(ctx, r.p); ctx.stroke(); }
  for (const r of vroads) { ctx.strokeStyle = r.tu ? '#2c2c30' : r.t === 'living_street' ? '#5a5650' : '#45464b'; ctx.lineWidth = r.w; ctx.beginPath(); linePath(ctx, r.p); ctx.stroke(); }
  for (const r of vroads) {
    if (r.w < 6 || r.t === 'living_street') continue;
    ctx.strokeStyle = r.t === 'motorway' ? 'rgba(255,255,255,0.75)' : 'rgba(250,250,240,0.85)';
    ctx.lineWidth = 0.22; ctx.setLineDash(r.t === 'motorway' ? [3, 6] : [4, 5]); ctx.lineCap = 'butt';
    if (r.t === 'motorway' || r.ow) {
      // lane dividers parallel offsets are complex; single dashed centre is enough
    }
    ctx.beginPath(); linePath(ctx, r.p); ctx.stroke(); ctx.setLineDash([]);
    // edge lines
    ctx.lineWidth = r.w - 0.9; ctx.strokeStyle = 'rgba(255,255,255,0.0)';
    ctx.lineCap = 'round';
  }
  // pedestrian plazas over roads where mapped as areas already drawn; buildings for minimap
  const ground = big; // copy before buildings for 3D tiles
  status('Uploading ground tiles…'); await tick();
  const TILE_M = 256, TILE_PX = TILE_M * S;
  const nx = Math.ceil(2 * HW / TILE_M), nz = Math.ceil(2 * HH / TILE_M);
  const groundMat = [];
  const maxAniso = G.renderer.capabilities.getMaxAnisotropy();
  const CELL = G.mobile ? 8 : 4;
  // fine 1 m patch around the Underpass so the cutting, walls and stairs are crisp
  const PB = U.ok ? [Math.floor((U.bb[0] + HW) / CELL) * CELL - HW, Math.floor((U.bb[1] + HH) / CELL) * CELL - HH, Math.ceil((U.bb[2] + HW) / CELL) * CELL - HW, Math.ceil((U.bb[3] + HH) / CELL) * CELL - HH] : null;
  const inPatch = (x0, z0, x1, z1) => PB && x0 >= PB[0] - 1e-6 && z0 >= PB[1] - 1e-6 && x1 <= PB[2] + 1e-6 && z1 <= PB[3] + 1e-6;
  const edgeH = (x, z) => { // heights on the patch border match the coarse mesh (no cracks)
    const onX = Math.abs(x - PB[0]) < 1e-6 || Math.abs(x - PB[2]) < 1e-6, onZ = Math.abs(z - PB[1]) < 1e-6 || Math.abs(z - PB[3]) < 1e-6;
    if (onX) { const za = PB[1] + Math.floor((z - PB[1]) / CELL) * CELL, k = (z - za) / CELL; return T.mesh(x, za) * (1 - k) + T.mesh(x, za + CELL) * k; }
    if (onZ) { const xa = PB[0] + Math.floor((x - PB[0]) / CELL) * CELL, k = (x - xa) / CELL; return T.mesh(xa, z) * (1 - k) + T.mesh(xa + CELL, z) * k; }
    return T.mesh(x, z);
  };
  // deck (Alexandra Square over the tunnel) quads, drawn with the ground texture
  const deckQuads = [];
  if (U.ok) for (let i = 0; i + 1 < U.N; i++) {
    if (!U.cov[i] || !U.cov[i + 1]) continue;
    const a = U.at(i), b = U.at(i + 1), W = Math.max(U.hw[i], U.hw[i + 1]) + 2.6;
    for (let t = -W; t < W - 1e-6; t += 1) {
      const t1 = Math.min(W, t + 1);
      const P = (pp, ii, tt) => [pp.x + pp.lx * tt, T.deckAt(ii, tt), pp.z + pp.lz * tt];
      deckQuads.push([P(a, i, t), P(b, i + 1, t), P(b, i + 1, t1), P(a, i, t1)]);
    }
  }
  const terrainTile = (x0, z0, mat) => {
    const pos = [], uv = [], idx = [], map = new Map();
    const vid = (x, z, fine) => {
      const k = Math.round((x - x0) * 2) * 4096 + Math.round((z - z0) * 2);
      let v = map.get(k); if (v !== undefined) return v;
      v = pos.length / 3; pos.push(x, fine ? edgeH(x, z) : T.mesh(x, z), z); uv.push((x - x0) / TILE_M, 1 - (z - z0) / TILE_M); map.set(k, v); return v;
    };
    for (let cx = 0; cx < TILE_M; cx += CELL) for (let cz = 0; cz < TILE_M; cz += CELL) {
      const ax = x0 + cx, az = z0 + cz;
      if (inPatch(ax, az, ax + CELL, az + CELL)) {
        for (let fx = 0; fx < CELL; fx++) for (let fz = 0; fz < CELL; fz++) {
          const a = vid(ax + fx, az + fz, true), b = vid(ax + fx + 1, az + fz, true), c = vid(ax + fx + 1, az + fz + 1, true), d = vid(ax + fx, az + fz + 1, true);
          idx.push(a, d, b, b, d, c);
        }
      } else {
        const a = vid(ax, az), b = vid(ax + CELL, az), c = vid(ax + CELL, az + CELL), d = vid(ax, az + CELL);
        idx.push(a, d, b, b, d, c);
      }
    }
    // deck slab top over the tunnel
    for (const qd of deckQuads) {
      const cx = (qd[0][0] + qd[2][0]) / 2, cz = (qd[0][2] + qd[2][2]) / 2;
      if (cx < x0 || cx >= x0 + TILE_M || cz < z0 || cz >= z0 + TILE_M) continue;
      const base = pos.length / 3;
      for (const v of qd) { pos.push(v[0], v[1] + 0.01, v[2]); uv.push((v[0] - x0) / TILE_M, 1 - (v[2] - z0) / TILE_M); }
      // make the quad face up
      const ux = qd[1][0] - qd[0][0], uz = qd[1][2] - qd[0][2], vx = qd[3][0] - qd[0][0], vz = qd[3][2] - qd[0][2];
      if (uz * vx - ux * vz > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3); else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    // skirt along the outer world edge so you never see under the map
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; return mesh;
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const c = document.createElement('canvas'); c.width = c.height = TILE_PX;
    const cc = c.getContext('2d'); cc.fillStyle = '#6a9a46'; cc.fillRect(0, 0, TILE_PX, TILE_PX);
    cc.drawImage(ground, i * TILE_PX, j * TILE_PX, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    const m = new THREE.MeshLambertMaterial({ map: t }); groundMat.push(m);
    scene.add(terrainTile(-HW + i * TILE_M, -HH + j * TILE_M, m));
    if (j % 2 === 1) await tick();
  }
  // distant countryside: a big low ring that meets the terrain edge height
  const edgeAvg = (T.base(-HW, 0) + T.base(HW, 0) + T.base(0, -HH) + T.base(0, HH)) / 4;
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5e8a3e }));
  outer.position.y = Math.min(edgeAvg, T.minH) - 3; scene.add(outer);
  { // skirt walls around the playable area hide the drop to the outer plane
    const SK = new GeoBuilder(); const sc2 = hex('#5e8a3e');
    const y0 = outer.position.y - 1, stp = 8;
    const run = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / stp); for (let k = 0; k < n; k++) { const x1 = ax + (bx - ax) * k / n, z1 = az + (bz - az) * k / n, x2 = ax + (bx - ax) * (k + 1) / n, z2 = az + (bz - az) * (k + 1) / n; SK.quad([x1, y0, z1], [x2, y0, z2], [x2, T.mesh(x2, z2), z2], [x1, T.mesh(x1, z1), z1], null, sc2); } };
    const X1 = -HW + nx * TILE_M, Z1 = -HH + nz * TILE_M;
    run(-HW, -HH, X1, -HH); run(X1, -HH, X1, Z1); run(X1, Z1, -HW, Z1); run(-HW, Z1, -HW, -HH);
    scene.add(SK.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  // minimap canvas (1 px / m) with buildings
  const MS = 1;
  const map = document.createElement('canvas'); map.width = Math.ceil(2 * HW * MS); map.height = Math.ceil(2 * HH * MS);
  const mc = map.getContext('2d'); mc.drawImage(big, 0, 0, map.width, map.height);
  mc.setTransform(MS, 0, 0, MS, HW * MS, HH * MS);
  mc.fillStyle = 'rgba(0,0,0,0.25)'; mc.fillRect(-HW, -HH, 2 * HW, 2 * HH);
  for (const r of vroads) { mc.strokeStyle = '#d8d8d8'; mc.lineWidth = Math.max(3, r.w * 0.9); mc.lineCap = 'round'; mc.lineJoin = 'round'; mc.beginPath(); linePath(mc, r.p); mc.stroke(); }
  for (const r of troads) { mc.strokeStyle = '#d8d8d8'; mc.setLineDash([4, 3]); mc.lineWidth = Math.max(3, r.w * 0.9); mc.beginPath(); linePath(mc, r.p); mc.stroke(); mc.setLineDash([]); }
  for (const b of D.buildings) { mc.beginPath(); ringPath(mc, b.p); if (b.hl) for (const h of b.hl) ringPath(mc, h); mc.fillStyle = b.t === 'university' ? '#b9a98f' : '#9c9488'; mc.fill('evenodd'); mc.strokeStyle = '#3a352f'; mc.lineWidth = 0.8; mc.stroke(); }
  G.mapCanvas = map; G.mapScale = MS;

  // ---------------- buildings ----------------
  status('Raising buildings…'); await tick();
  const [winTex, winEm] = windowTextures();
  const winMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: winTex, emissiveMap: winEm, emissive: 0xffffff, emissiveIntensity: 0 });
  const plainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  G.windowMat = winMat;
  const BW = new GeoBuilder(), BP = new GeoBuilder(), BR = new GeoBuilder();
  const PAL = {
    univ: ['#cbc4b6', '#a86852', '#c2a37c', '#dbd7cf', '#918b81', '#b8b2a6'],
    resi: ['#b3735a', '#c9bba4', '#d8d2c7', '#9e604a', '#c4a984'],
    house: ['#c9bba2', '#a9725c', '#e3ded4', '#b9a58b'],
    farm: ['#8f887c', '#7f7062', '#a09a8f'],
  };
  const PLAIN = new Set(['shed', 'garage', 'garages', 'barn', 'farm_auxiliary', 'service', 'roof', 'garbage_shed', 'storage_tank', 'greenhouse', 'shelter', 'kiosk', 'transformer_tower']);
  const wallColour = (b) => {
    const r = G.mulberry(G.hash((b.n || '') + b.p[0] + ',' + b.p[1]));
    if (b.m) {
      if (/glass/.test(b.m)) return hex('#8fb3c8');
      if (/concrete|stone/.test(b.m)) return hex('#c6c0b4');
      if (/brick/.test(b.m)) return hex(G.pick(['#a5634c', '#9a5a45', '#b06c52']));
      if (/metal|steel/.test(b.m)) return hex('#9fa7ad');
      if (/wood|timber/.test(b.m)) return hex('#8d6a4a');
    }
    if (b.t === 'greenhouse') return hex('#d6ece6');
    const pal = b.t === 'university' || b.t === 'yes' || b.t === 'office' || b.t === 'hotel' || b.t === 'kindergarten' ? PAL.univ
      : b.t === 'residential' || b.t === 'dormitory' ? PAL.resi : b.t === 'house' || b.t === 'semidetached_house' ? PAL.house : PAL.farm;
    return hex(pal[Math.floor(r() * pal.length)]);
  };
  const roofFlat = hex('#a3a19b'), roofSlate = hex('#5d5a5e'), roofTile = hex('#8a5444');
  G.buildingList = [];
  // buildings mapped as an outline + "parts": draw the parts AND the outline (inset slightly so they don't
  // z-fight), otherwise the unmapped remainder of the outline is an invisible wall
  const insetRing = (p, d) => {
    const n = p.length / 2, out = [], ccw = G.polyArea(p) > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, c = (i + 1) % n;
      let e1x = p[i * 2] - p[a * 2], e1z = p[i * 2 + 1] - p[a * 2 + 1], e2x = p[c * 2] - p[i * 2], e2z = p[c * 2 + 1] - p[i * 2 + 1];
      const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
      const n1x = -e1z / l1 * ccw, n1z = e1x / l1 * ccw, n2x = -e2z / l2 * ccw, n2z = e2x / l2 * ccw; // inward normals
      const k = Math.max(0.3, 1 + n1x * n2x + n1z * n2z);
      out.push(p[i * 2] + (n1x + n2x) / k * d, p[i * 2 + 1] + (n1z + n2z) / k * d);
    }
    return out;
  };
  const partOf = (b) => D.parts.find((pt) => { const c = G.centroid(pt.p); return G.pip(c.x, c.z, b.p); });
  const outlines = D.buildings.filter((b) => b.hp).map((b) => { const pt = partOf(b); return { ...b, p: insetRing(b.p, 0.12), hl: b.hl && b.hl.map((h) => insetRing(h, -0.12)), h: b.h - 0.08, m: b.m || (pt && pt.m), _col: pt }; });
  const allB = [...D.buildings.filter((b) => !b.hp), ...outlines, ...D.parts];
  G._rendered = allB;
  for (const b of allB) {
    const r = G.mulberry(G.hash(b.p.join(',').slice(0, 40)));
    let gMin = Infinity, gSum = 0, gN = 0;
    for (let k = 0; k < b.p.length; k += 2) { const gh = T.surf(b.p[k], b.p[k + 1]); gMin = Math.min(gMin, gh); gSum += gh; gN++; }
    const gAvg = gSum / gN;
    const wc = wallColour(b._col || b), base = b.mh > 0 ? gAvg + b.mh : gMin - 0.8, top = gAvg + Math.max((b.mh || 0) + 0.5, b.h);
    const plain = PLAIN.has(b.t) || (b.h - (b.mh || 0)) < 3;
    const W = plain ? BP : BW;
    const rings = [b.p, ...(b.hl || [])];
    rings.forEach((p, ri) => {
      const n = p.length / 2; const ccw = G.polyArea(p) > 0; const outwardFlip = ri === 0 ? ccw : !ccw;
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.05) continue;
        // outward normal: for ccw outer ring (dz,-dx)
        let nxn = outwardFlip ? dz / L : -dz / L, nzn = outwardFlip ? -dx / L : dx / L;
        const A = [ax, base, az], B = [bx, base, bz], C = [bx, top, bz], Dd = [ax, top, az];
        const u0 = acc / 5.2, u1 = (acc + L) / 5.2, v0 = (base - gAvg) / 6.6, v1 = (top - gAvg) / 6.6; acc += L;
        const col = jitter(wc, r, 0.03);
        // triangle (A,B,C) faces (-dz,dx)
        const faceN = [-dz / L, 0, dx / L];
        const same = faceN[0] * nxn + faceN[2] * nzn > 0;
        if (same) W.quad(A, B, C, Dd, [nxn, 0, nzn], col, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
        else W.quad(B, A, Dd, C, [nxn, 0, nzn], col, [[u1, v0], [u0, v0], [u0, v1], [u1, v1]]);
      }
    });
    // roof
    const n0 = b.p.length / 2;
    const pitched = b.r && !b.hl && n0 <= 14 && Math.abs(G.polyArea(b.p)) < 600;
    if (pitched) {
      const c = G.centroid(b.p), rh = Math.min(3.5, Math.sqrt(Math.abs(G.polyArea(b.p))) * 0.28);
      const rc = b.t === 'barn' || b.t === 'farm' ? roofSlate : roofTile;
      for (let i = 0; i < n0; i++) {
        const j = (i + 1) % n0; let A = [b.p[i * 2], top, b.p[i * 2 + 1]], B = [b.p[j * 2], top, b.p[j * 2 + 1]], C = [c.x, top + rh, c.z];
        const ux = B[0] - A[0], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
        const ny = uz * vx - ux * vz; if (ny < 0) { const t = A; A = B; B = t; }
        BR.tri(A, B, C, null, jitter(rc, r, 0.05));
      }
    } else {
      const toV = (p) => { const out = []; for (let i = 0; i < p.length; i += 2) out.push(new THREE.Vector2(p[i], p[i + 1])); return out; };
      const contour = toV(b.p), holes = (b.hl || []).map(toV);
      let tris = [];
      try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { tris = []; }
      const verts = [contour, ...holes].flat();
      const rc = jitter(b.t === 'house' ? roofTile : roofFlat, r, 0.12);
      for (const t of tris) {
        let A = verts[t[0]], B = verts[t[1]], C = verts[t[2]];
        const ny = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y);
        if (ny < 0) { const tmp = A; A = B; B = tmp; }
        BR.tri([A.x, top, A.y], [B.x, top, B.y], [C.x, top, C.y], [0, 1, 0], rc);
        if (b.mh > 0) BR.tri([B.x, base, B.y], [A.x, base, A.y], [C.x, base, C.y], [0, -1, 0], rc);
      }
    }
    if (b.n || b.t === 'university' || b.t === 'residential') {
      const c = G.centroid(b.p); G.buildingList.push({ n: b.n, x: c.x, z: c.z, h: top, p: b.p, t: b.t });
    }
  }
  for (const [B, mat] of [[BW, winMat], [BP, plainMat], [BR, roofMat]]) {
    const m = B.mesh(mat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }

  // ---------------- barriers ----------------
  status('Growing hedges…'); await tick();
  const HB = new GeoBuilder();
  const hedgeC = hex('#4f8a38'), wallC = hex('#8f897e'), fenceC = hex('#7a6a58'), railC = hex('#555a5e');
  for (const l of D.lines) {
    const spec = l.k === 'hedge' ? [0.9, 1.5, hedgeC] : l.k === 'wall' ? [0.4, 1.1, wallC] : l.k === 'fence' ? [0.14, 1.25, fenceC] : null;
    if (!spec) continue;
    const p = l.p;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3];
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 1.2));
      // break where a path or road crosses so gaps are visible
      let s0 = null;
      for (let s = 0; s <= n; s++) {
        const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n;
        const open = grid.get(x, z) !== G.BARRIER;
        if (!open && s0 === null) s0 = s;
        if ((open || s === n) && s0 !== null) {
          const hh = spec[1] * (l.k === 'hedge' ? G.rand(0.9, 1.15) : 1), colr = jitter(spec[2], rnd, 0.06);
          for (let q0 = s0; q0 < s; q0 += 2) {
            const q1 = Math.min(s, q0 + 2);
            const x0b = ax + (bx - ax) * q0 / n, z0b = az + (bz - az) * q0 / n, x1b = ax + (bx - ax) * q1 / n, z1b = az + (bz - az) * q1 / n;
            const g0 = Math.min(surfY(x0b, z0b), surfY(x1b, z1b)), g1 = Math.max(surfY(x0b, z0b), surfY(x1b, z1b));
            HB.box(x0b, z0b, x1b, z1b, spec[0], g0 - 0.3, g1 + hh, colr);
          }
          s0 = null;
        }
      }
    }
  }
  for (let k = 0; k + 1 < boundary.length; k++) {
    const [ax, az] = boundary[k], [bx, bz] = boundary[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 3);
    for (let q2 = 0; q2 < n; q2++) {
      const x0b = ax + (bx - ax) * q2 / n, z0b = az + (bz - az) * q2 / n, x1b = ax + (bx - ax) * (q2 + 1) / n, z1b = az + (bz - az) * (q2 + 1) / n;
      const g0 = Math.min(T.base(x0b, z0b), T.base(x1b, z1b)), g1 = Math.max(T.base(x0b, z0b), T.base(x1b, z1b));
      HB.box(x0b, z0b, x1b, z1b, 0.7, g0 - 0.4, g1 + 1.3, jitter(hex('#8a857a'), rnd, 0.08));
    }
  }
  for (const l of D.lines) if (l.k === 'rail') { const p = l.p; for (let k = 0; k + 3 < p.length; k += 2) { const L = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]), n = Math.max(1, Math.ceil(L / 4)); for (let q2 = 0; q2 < n; q2++) { const xa = p[k] + (p[k + 2] - p[k]) * q2 / n, za = p[k + 1] + (p[k + 3] - p[k + 1]) * q2 / n, xb = p[k] + (p[k + 2] - p[k]) * (q2 + 1) / n, zb = p[k + 1] + (p[k + 3] - p[k + 1]) * (q2 + 1) / n; const gy = (T.base(xa, za) + T.base(xb, zb)) / 2; HB.box(xa, za, xb, zb, 0.1, gy + 0.05, gy + 0.25, railC); } } }
  { const m = HB.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })); m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // ---------------- trees mesh ----------------
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 3, 5); trunkGeo.translate(0, 1.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.3, 0); crownGeo.translate(0, 4.4, 0);
  const coneGeo = new THREE.ConeGeometry(2.0, 5.5, 6); coneGeo.translate(0, 5.0, 0);
  const trunkM = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a4030 }), trees.length);
  const nConif = Math.floor(trees.length * 0.25);
  const crownM = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.length - nConif);
  const coneM = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), nConif);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
  let ci = 0, ki = 0;
  trees.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28); sc.set(t[2], t[2] * G.rand(0.85, 1.2), t[2]); ps.set(t[0], T.phys(t[0], t[1]) - 0.1, t[1]);
    mtx.compose(ps, q, sc); trunkM.setMatrixAt(i, mtx);
    const conifer = (i % 4 === 3) && ki < nConif;
    col.setHSL(conifer ? 0.33 : G.rand(0.2, 0.3), G.rand(0.35, 0.55), conifer ? G.rand(0.16, 0.22) : G.rand(0.22, 0.34));
    if (conifer) { coneM.setMatrixAt(ki, mtx); coneM.setColorAt(ki++, col); }
    else if (ci < crownM.count) { crownM.setMatrixAt(ci, mtx); crownM.setColorAt(ci++, col); }
  });
  crownM.count = ci; coneM.count = ki;
  for (const m of [trunkM, crownM, coneM]) { m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; scene.add(m); }
  G.treeCount = trees.length;

  // ---------------- street furniture ----------------
  status('Placing street furniture…'); await tick();
  const lamps = [], benches = [], bollards = [], bins = [], stops = [];
  for (const p of D.pois) {
    if (p.k === 'street_lamp') lamps.push(p); else if (p.k === 'bench') benches.push(p); else if (p.k === 'bollard') bollards.push(p);
    else if (p.k === 'waste_basket' || p.k === 'recycling') bins.push(p); else if (p.k === 'bus_stop') stops.push(p);
  }
  const propY = (p) => (p.k === 'bus_stop' && T.deck(p.x, p.z) !== null) ? T.phys(p.x, p.z) : surfY(p.x, p.z);
  G.propY = propY;
  const inst = (geo, mat, list, f, shadow = true) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { const r = f ? f(p) : rnd() * 6.28; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r); mtx.compose(new THREE.Vector3(p.x, propY(p), p.z), q, new THREE.Vector3(1, 1, 1)); m.setMatrixAt(i, mtx); });
    m.castShadow = shadow; m.frustumCulled = false; scene.add(m); return m;
  };
  const lampGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.5, 5); lampGeo.translate(0, 2.75, 0);
  inst(lampGeo, new THREE.MeshLambertMaterial({ color: 0x3a3d40 }), lamps);
  const headGeo = new THREE.BoxGeometry(0.35, 0.18, 0.7); headGeo.translate(0, 5.55, 0.25);
  G.lampMat = new THREE.MeshLambertMaterial({ color: 0x777777, emissive: 0xffd58a, emissiveIntensity: 0 });
  inst(headGeo, G.lampMat, lamps, null, false);
  const benchGeo = new THREE.BoxGeometry(1.6, 0.45, 0.45); benchGeo.translate(0, 0.45, 0);
  inst(benchGeo, new THREE.MeshLambertMaterial({ color: 0x6b4f35 }), benches);
  const bolGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6); bolGeo.translate(0, 0.45, 0);
  inst(bolGeo, new THREE.MeshLambertMaterial({ color: 0x2f2f33 }), bollards, null, false);
  const binGeo = new THREE.CylinderGeometry(0.25, 0.22, 0.9, 8); binGeo.translate(0, 0.45, 0);
  inst(binGeo, new THREE.MeshLambertMaterial({ color: 0x2d4a33 }), bins, null, false);
  for (const p of benches) grid.disc(p.x, p.z, 0.3, G.BARRIER, (v) => v === G.FREE);
  for (const p of lamps) grid.disc(p.x, p.z, 0.15, G.TREE, (v) => v === G.FREE);
  // bus shelters
  const shelter = new GeoBuilder(); const glassC = hex('#9fc0cc'), frameC = hex('#30343a');
  for (const s of stops) {
    // orient along nearest road
    const x = s.x, z = s.z, y = propY(s);
    shelter.box(x - 1.6, z - 0.7, x + 1.6, z - 0.7, 0.06, y, y + 2.4, glassC);
    shelter.box(x - 1.6, z - 0.7, x - 1.6, z + 0.6, 0.06, y, y + 2.4, glassC);
    shelter.box(x - 1.7, z, x + 1.7, z, 1.6, y + 2.4, y + 2.55, frameC);
  }
  if (stops.length) { const m = shelter.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })); m.castShadow = true; scene.add(m); }

  // ---------------- labels ----------------
  G.labels = [];
  for (const b of G.buildingList) if (b.n) {
    const s = G.makeLabel(b.n, { size: 2.2 }); s.position.set(b.x, b.h + 2.4, b.z); s.visible = false; scene.add(s);
    G.labels.push({ s, x: b.x, z: b.z, r: 110, y: b.h });
  }
  const POI_KINDS = new Set(['cafe', 'bar', 'pub', 'fast_food', 'restaurant', 'convenience', 'newsagent', 'bakery', 'pharmacy', 'theatre', 'gallery', 'artwork', 'post_office', 'charity', 'library', 'place', 'community_centre', 'bus_stop', 'beverages', 'hairdresser', 'laundry', 'bicycle', 'studio', 'study_room', 'copyshop', 'doctors', 'fuel']);
  for (const p of D.pois) if (p.n && POI_KINDS.has(p.k) && Math.abs(p.x) < HW && Math.abs(p.z) < HH) {
    const s = G.makeLabel(p.n, { size: 0.9, depthTest: false, accent: '#5fd0ff', bg: 'rgba(10,20,30,0.6)' }); const py = propY(p); s.position.set(p.x, py + 3.2, p.z); s.visible = false; scene.add(s);
    G.labels.push({ s, x: p.x, z: p.z, r: 32, y: py, under: G.inTunnel(p.x, p.z, py + 0.5) });
  }

  // ---------------- graphs ----------------
  status('Mapping roads and footpaths…'); await tick();
  const mkGraph = (filter) => {
    const nodes = new Map();
    const get = (id, x, z, r) => { let n = nodes.get(id); if (!n) nodes.set(id, n = { id, x, z, adj: [], y: isUnder(r) ? T.phys(x, z) : surfY(x, z) }); return n; };
    for (const r of D.roads) {
      if (!filter(r)) continue;
      const n = r.p.length / 2; const ids = r.ids && r.ids.length === n ? r.ids : null;
      let prev = null;
      for (let i = 0; i < n; i++) {
        const x = r.p[i * 2], z = r.p[i * 2 + 1];
        const node = get(ids ? ids[i] : `${x.toFixed(1)},${z.toFixed(1)}`, x, z, r);
        if (prev && prev !== node) {
          const len = Math.hypot(node.x - prev.x, node.z - prev.z);
          prev.adj.push({ n: node, len, r });
          if (!r.ow) node.adj.push({ n: prev, len, r });
        }
        prev = node;
      }
    }
    // components
    let comp = 0; const sizes = [];
    for (const n of nodes.values()) if (n.comp === undefined) {
      const st = [n]; n.comp = comp; let cnt = 0;
      while (st.length) { const a = st.pop(); cnt++; for (const e of a.adj) if (e.n.comp === undefined) { e.n.comp = comp; st.push(e.n); } }
      // also reverse (oneway)
      sizes.push(cnt); comp++;
    }
    const list = [...nodes.values()];
    const buckets = new G.Buckets(40);
    for (const n of list) if (sizes[n.comp] > 30 && n.adj.length) buckets.add(n.x, n.z, n);
    return { nodes, list, buckets, sizes };
  };
  G.roadGraph = mkGraph((r) => VEH_ROADS.has(r.t) && r.t !== 'motorway' && r.t !== 'motorway_link');
  G.pedGraph = mkGraph((r) => PED_ROADS.has(r.t));
  G.parkingAreas = D.areas.filter((a) => a.k === 'parking' && Math.abs(G.polyArea(a.p)) > 120).map((a, i) => ({ ...a, id: i, c: G.centroid(a.p), area: Math.abs(G.polyArea(a.p)), cars: [], populated: false }));

  // ---------------- zones for location names ----------------
  const zones = [];
  for (const z of D.zones) zones.push({ n: z.n, p: z.p, a: z.a, bb: G.bbox(z.p) });
  for (const b of D.buildings) if (b.n) zones.push({ n: b.n, p: b.p, a: Math.abs(G.polyArea(b.p)) + 1500, bb: G.bbox(b.p), pad: 12 });
  G.zones = zones;
  G.namedRoads = D.roads.filter((r) => r.n);
  G.roadBuckets = new G.Buckets(60);
  for (const r of G.namedRoads) for (let i = 0; i < r.p.length; i += 2) G.roadBuckets.add(r.p[i], r.p[i + 1], r);

  if (U.ok) { status('Digging the Underpass…'); await tick(); G.buildUnderpass(); }

  // ---------------- landmarks ----------------
  const find = (name) => {
    const b = D.buildings.find((x) => x.n === name); if (b) return G.centroid(b.p);
    const z = D.zones.find((x) => x.n === name); if (z) return G.centroid(z.p);
    const p = D.pois.find((x) => x.n === name); if (p) return { x: p.x, z: p.z };
    return null;
  };
  G.findPlace = find;
  const freeNear = (pt) => grid.nearestFree(pt.x, pt.z, (v) => v === G.FREE, 80);
  G.spots = {
    spawn: freeNear(find('Alexandra Square') || { x: 0, z: 0 }),
    hospital: freeNear(find('Medical Centre') || find('Lancaster University Pharmacy') || { x: 0, z: 0 }),
    police: freeNear(find('Security Lodge') || { x: 0, z: 0 }),
  };
  status('Campus ready.');
};

// Location name for a point
G.locate = (x, z) => {
  let best = null;
  for (const zn of G.zones) {
    const pad = zn.pad || 0;
    if (x < zn.bb[0] - pad || x > zn.bb[2] + pad || z < zn.bb[1] - pad || z > zn.bb[3] + pad) continue;
    if (!pad && !G.pip(x, z, zn.p)) continue;
    if (pad && !G.pip(x, z, zn.p)) {
      // near a named building counts too, weaker
      if (!best || zn.a + 2000 < best.a) best = { n: zn.n, a: zn.a + 2000 };
      continue;
    }
    if (!best || zn.a < best.a) best = { n: zn.n, a: zn.a };
  }
  let street = null, sd = 15 * 15;
  for (const r of G.roadBuckets.near(x, z, 30)) {
    const p = r.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = G.clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
      const d = G.d2(x, z, ax + dx * t, az + dz * t);
      if (d < sd) { sd = d; street = r.n; }
    }
  }
  const inCampus = Math.abs(x) < 600 && Math.abs(z) < 800;
  return { zone: best ? best.n : inCampus ? 'Lancaster University' : 'Bailrigg', street };
};
})();
