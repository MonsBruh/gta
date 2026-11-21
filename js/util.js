// Shared helpers and the collision grid.
'use strict';
const G = window.G = {
  scene: null, camera: null, renderer: null,
  actors: [], vehicles: [], pickups: [], time: 0,
};

G.rand = (a, b) => a + Math.random() * (b - a);
G.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
G.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
G.lerp = (a, b, t) => a + (b - a) * t;
G.angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
G.d2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
G.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
G.hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
G.mulberry = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// Point in polygon (flat [x,z,x,z...])
G.pip = (x, z, p) => {
  let c = false;
  for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
};
G.polyArea = (p) => { let a = 0; for (let i = 0, n = p.length / 2; i < n; i++) { const j = (i + 1) % n; a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; } return a / 2; };
G.centroid = (p) => { let x = 0, z = 0; const n = p.length / 2; for (let i = 0; i < n; i++) { x += p[i * 2]; z += p[i * 2 + 1]; } return { x: x / n, z: z / n }; };
G.bbox = (p) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (let i = 0; i < p.length; i += 2) { if (p[i] < a) a = p[i]; if (p[i] > c) c = p[i]; if (p[i + 1] < b) b = p[i + 1]; if (p[i + 1] > d) d = p[i + 1]; } return [a, b, c, d]; };

// Cell values
G.FREE = 0; G.BUILDING = 1; G.WATER = 2; G.BARRIER = 3; G.TREE = 4;

class Grid {
  constructor(halfW, halfH, cell) {
    this.cell = cell; this.ox = -halfW; this.oz = -halfH;
    this.w = Math.ceil(2 * halfW / cell); this.h = Math.ceil(2 * halfH / cell);
    this.d = new Uint8Array(this.w * this.h);
  }
  get(x, z) {
    const i = Math.floor((x - this.ox) / this.cell), j = Math.floor((z - this.oz) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return G.BUILDING;
    return this.d[j * this.w + i];
  }
  set(x, z, v) {
    const i = Math.floor((x - this.ox) / this.cell), j = Math.floor((z - this.oz) / this.cell);
    if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.d[j * this.w + i] = v;
  }
  // even-odd scanline fill of several rings
  fillRings(rings, v) {
    let bz0 = Infinity, bz1 = -Infinity;
    for (const r of rings) for (let k = 1; k < r.length; k += 2) { if (r[k] < bz0) bz0 = r[k]; if (r[k] > bz1) bz1 = r[k]; }
    const j0 = Math.max(0, Math.floor((bz0 - this.oz) / this.cell)), j1 = Math.min(this.h - 1, Math.ceil((bz1 - this.oz) / this.cell));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = this.oz + (j + 0.5) * this.cell; xs.length = 0;
      for (const r of rings) {
        const n = r.length / 2;
        for (let a = 0, b = n - 1; a < n; b = a++) {
          const za = r[a * 2 + 1], zb = r[b * 2 + 1];
          if ((za > z) !== (zb > z)) xs.push(r[a * 2] + (z - za) / (zb - za) * (r[b * 2] - r[a * 2]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.round((xs[k] - this.ox) / this.cell)), i1 = Math.min(this.w - 1, Math.round((xs[k + 1] - this.ox) / this.cell) - 1);
        this.d.fill(v, j * this.w + i0, j * this.w + i1 + 1);
      }
    }
  }
  disc(x, z, r, v, onlyIf) {
    const c = this.cell, i0 = Math.floor((x - r - this.ox) / c), i1 = Math.floor((x + r - this.ox) / c);
    const j0 = Math.floor((z - r - this.oz) / c), j1 = Math.floor((z + r - this.oz) / c);
    for (let j = Math.max(0, j0); j <= Math.min(this.h - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(this.w - 1, i1); i++) {
        const cx = this.ox + (i + 0.5) * c - x, cz = this.oz + (j + 0.5) * c - z;
        if (cx * cx + cz * cz <= r * r) { const k = j * this.w + i; if (!onlyIf || onlyIf(this.d[k])) this.d[k] = v; }
      }
  }
  stroke(p, width, v, onlyIf) {
    const r = Math.max(width / 2, this.cell * 0.6), step = this.cell * 0.7;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3];
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
      for (let s = 0; s <= n; s++) this.disc(ax + (bx - ax) * s / n, az + (bz - az) * s / n, r, v, onlyIf);
    }
  }
  // march a 2D segment; returns fraction of first blocking cell or 1
  march(ax, az, bx, bz, blocks) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (this.cell * 0.5)));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      if (blocks(this.get(ax + (bx - ax) * t, az + (bz - az) * t))) return Math.max(0, (s - 1) / n);
    }
    return 1;
  }
  // nearest cell satisfying ok() searching outward (spiral by rings)
  nearestFree(x, z, ok, maxR = 60) {
    ok = ok || ((v) => v === G.FREE);
    for (let r = 0; r <= maxR; r += this.cell) {
      const steps = Math.max(8, Math.ceil(2 * Math.PI * r / this.cell));
      for (let s = 0; s < steps; s++) {
        const a = s / steps * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (ok(this.get(px, pz)) && ok(this.get(px + 0.6, pz)) && ok(this.get(px - 0.6, pz)) && ok(this.get(px, pz + 0.6)) && ok(this.get(px, pz - 0.6))) return { x: px, z: pz };
      }
    }
    return { x, z };
  }
}
G.Grid = Grid;

G.solidForWalk = (v) => v === G.BUILDING || v === G.BARRIER || v === G.TREE;
G.solidForShot = (v) => v === G.BUILDING || v === G.TREE;
G.solidForCam = (v) => v === G.BUILDING;

// Circle movement with axis sliding. Returns true if blocked on any axis.
G.moveCircle = (pos, dx, dz, r) => {
  const g = G.grid; let hit = false;
  const blocked = (x, z) => {
    if (G.solidForWalk(g.get(x, z))) return true;
    for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4; if (G.solidForWalk(g.get(x + Math.cos(an) * r, z + Math.sin(an) * r))) return true; }
    return false;
  };
  if (blocked(pos.x, pos.z)) { // stuck inside: push out
    const f = g.nearestFree(pos.x, pos.z, (v) => !G.solidForWalk(v), 6); pos.x = f.x; pos.z = f.z; return true;
  }
  if (!blocked(pos.x + dx, pos.z)) pos.x += dx; else hit = true;
  if (!blocked(pos.x, pos.z + dz)) pos.z += dz; else hit = true;
  return hit;
};

// Weighted spatial bucket for graph nodes
G.Buckets = class {
  constructor(size) { this.size = size; this.m = new Map(); }
  key(x, z) { return Math.floor(x / this.size) + ',' + Math.floor(z / this.size); }
  add(x, z, item) { const k = this.key(x, z); let b = this.m.get(k); if (!b) this.m.set(k, b = []); b.push(item); }
  near(x, z, r) {
    const out = [], s = this.size, i0 = Math.floor((x - r) / s), i1 = Math.floor((x + r) / s), j0 = Math.floor((z - r) / s), j1 = Math.floor((z + r) / s);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const b = this.m.get(i + ',' + j); if (b) for (const it of b) out.push(it); }
    return out;
  }
};
