// Real terrain (LIDAR-derived heightmap) + the Underpass: a road in a cutting that runs beneath Alexandra Square.
'use strict';
(() => {
const TD = window.TERRAIN;
const T = G.T = {};
// ---------- heightmap ----------
const raw = atob(TD.data); const n = TD.nx * TD.nz;
const h = new Float32Array(n);
for (let i = 0; i < n; i++) h[i] = TD.base + (raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)) * TD.scale;
const NX = TD.nx, NZ = TD.nz, X0 = TD.x0, Z0 = TD.z0, ST = TD.step;
T.base = (x, z) => {
  let fx = (x - X0) / ST, fz = (z - Z0) / ST;
  if (fx < 0) fx = 0; if (fz < 0) fz = 0; if (fx > NX - 1.001) fx = NX - 1.001; if (fz > NZ - 1.001) fz = NZ - 1.001;
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * NX + i;
  return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + NX] * (1 - u) + h[k + NX + 1] * u) * v;
};
T.minH = Infinity; T.maxH = -Infinity; for (let i = 0; i < n; i++) { if (h[i] < T.minH) T.minH = h[i]; if (h[i] > T.maxH) T.maxH = h[i]; }

// ---------- underpass corridor ----------
const U = T.U = { ok: false };
const DS = 1; // profile sample spacing (m)
T.initUnderpass = (roads) => {
  const parts = roads.filter((r) => r.n === 'Underpass' && r.p.length >= 4).map((r) => ({ p: r.p.slice(), cov: !!(r.tn === 'yes' || (r.ly && +r.ly < 0)) }));
  if (!parts.length) return;
  // chain the ways end to end
  const chain = [parts.shift()];
  const near = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz) < 1.5;
  let guard = 0;
  while (parts.length && guard++ < 50) {
    const head = chain[0].p, tail = chain[chain.length - 1].p;
    const i = parts.findIndex((q) => {
      const s = q.p, e = q.p.length;
      return near(s[0], s[1], tail[tail.length - 2], tail[tail.length - 1]) || near(s[e - 2], s[e - 1], tail[tail.length - 2], tail[tail.length - 1]) ||
        near(s[0], s[1], head[0], head[1]) || near(s[e - 2], s[e - 1], head[0], head[1]);
    });
    if (i < 0) break;
    const q = parts.splice(i, 1)[0], s = q.p, e = s.length;
    const rev = (arr) => { const o = []; for (let k = arr.length - 2; k >= 0; k -= 2) o.push(arr[k], arr[k + 1]); return o; };
    if (near(s[0], s[1], tail[tail.length - 2], tail[tail.length - 1])) chain.push(q);
    else if (near(s[e - 2], s[e - 1], tail[tail.length - 2], tail[tail.length - 1])) { q.p = rev(s); chain.push(q); }
    else if (near(s[e - 2], s[e - 1], head[0], head[1])) chain.unshift(q);
    else { q.p = rev(s); chain.unshift(q); }
  }
  // flatten to points with per-segment covered flag
  const P = []; const C = [];
  for (const q of chain) for (let k = 0; k < q.p.length; k += 2) {
    if (P.length && k === 0) continue; // shared joint
    P.push({ x: q.p[k], z: q.p[k + 1] }); if (P.length > 1) C.push(q.cov);
  }
  // arc length
  P[0].s = 0; for (let i = 1; i < P.length; i++) P[i].s = P[i - 1].s + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
  U.P = P; U.C = C; U.L = P[P.length - 1].s;
  const xs = P.map((p) => p.x), zs = P.map((p) => p.z);
  U.bb = [Math.min(...xs) - 30, Math.min(...zs) - 30, Math.max(...xs) + 30, Math.max(...zs) + 30];
  // profile samples
  const N = Math.ceil(U.L / DS) + 1; U.N = N;
  const at = (s) => { // point + left normal at arc length s
    let i = 1; while (i < P.length - 1 && P[i].s < s) i++;
    const a = P[i - 1], b = P[i], L = b.s - a.s || 1, k = G.clamp((s - a.s) / L, 0, 1);
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, lx: dz, lz: -dx, cov: C[i - 1] };
  };
  U.at = at;
  const cov = new Uint8Array(N), nat = new Float32Array(N), Hl = new Float32Array(N), Hr = new Float32Array(N), hw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = at(i * DS); cov[i] = p.cov ? 1 : 0; nat[i] = T.base(p.x, p.z);
  }
  // half widths: wide (platforms) in the covered part, narrower in the open cuttings
  for (let i = 0; i < N; i++) {
    let dc = Infinity; for (let j = Math.max(0, i - 15); j <= Math.min(N - 1, i + 15); j++) if (cov[j]) dc = Math.min(dc, Math.abs(j - i) * DS);
    hw[i] = cov[i] ? 7 : dc < 15 ? G.lerp(7, 4.6, dc / 15) : 4.6;
  }
  for (let i = 0; i < N; i++) {
    const p = at(i * DS), W = hw[i] + 3.5;
    Hl[i] = T.base(p.x + p.lx * W, p.z + p.lz * W); Hr[i] = T.base(p.x - p.lx * W, p.z - p.lz * W);
  }
  const smooth = (a, r) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - r); j <= Math.min(a.length - 1, i + r); j++) { s += a[j]; c++; } o[i] = s / c; } return o; };
  const HlS = smooth(Hl, 4), HrS = smooth(Hr, 4);
  // floor: follow the natural cutting, but keep >= 6.2 m below the deck where covered; max 9% grade
  const F = new Float32Array(N);
  for (let i = 0; i < N; i++) F[i] = cov[i] ? Math.min(nat[i], Math.min(HlS[i], HrS[i]) - 6.2) : nat[i];
  for (let i = 1; i < N; i++) F[i] = Math.min(F[i], F[i - 1] + 0.09 * DS);
  for (let i = N - 2; i >= 0; i--) F[i] = Math.min(F[i], F[i + 1] + 0.09 * DS);
  const Fs = smooth(F, 3); for (let i = 0; i < N; i++) F[i] = Math.min(Fs[i], nat[i]);
  // where the corridor actually differs from the ground (walls needed)
  const act = new Uint8Array(N);
  for (let i = 0; i < N; i++) act[i] = cov[i] || Math.max(HlS[i], HrS[i]) - F[i] > 0.35 ? 1 : 0;
  Object.assign(U, { cov, F, hw, Hl: HlS, Hr: HrS, act, ok: true });
};
// locate a world point relative to the corridor: {s, t, i} (t>0 = left side)
const loc = { s: 0, t: 0, i: 0 };
T.locate = (x, z) => {
  if (!U.ok || x < U.bb[0] || x > U.bb[2] || z < U.bb[1] || z > U.bb[3]) return null;
  let best = Infinity; const P = U.P;
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    let u = ((x - a.x) * dx + (z - a.z) * dz) / L2;
    const cu = G.clamp(u, 0, 1);
    const px = a.x + dx * cu, pz = a.z + dz * cu, d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) {
      best = d; const L = Math.sqrt(L2);
      loc.s = a.s + cu * L + (k === 1 && u < 0 ? u * L : 0) + (k === P.length - 1 && u > 1 ? (u - 1) * L : 0);
      loc.t = ((x - a.x) * (dz / L) + (z - a.z) * (-dx / L));
    }
  }
  if (loc.s < 0 || loc.s > U.L) return null;
  loc.i = Math.min(U.N - 1, Math.round(loc.s / DS));
  return loc;
};
const floorAt = (s) => { const f = s / DS, i = Math.min(U.N - 2, Math.max(0, Math.floor(f))), k = f - i; return U.F[i] * (1 - k) + U.F[i + 1] * k; };
const deckAt = (i, t) => { const W = U.hw[i] + 3.5; return U.Hr[i] + (U.Hl[i] - U.Hr[i]) * G.clamp((t + W) / (2 * W), 0, 1); };
T.floorAt = floorAt;
// stairs from Alexandra Square down to the underground bus stop (from OSM steps tagged level=-1;0)
T.stairs = [];
T.initStairs = (roads) => {
  if (!U.ok) return;
  for (const r of roads) {
    if (r.t !== 'steps' || !(r.lv && r.lv.includes('-1'))) continue;
    const mx = (r.p[0] + r.p[r.p.length - 2]) / 2, mz = (r.p[1] + r.p[r.p.length - 1]) / 2;
    const l = T.locate(mx, mz); if (!l || !U.cov[l.i]) continue;
    const s0 = l.s, side = Math.sign(l.t) || 1;
    if (T.stairs.some((st) => Math.abs(st.s - s0) < 12)) continue;
    const hw = U.hw[l.i], len = 9.5, wid = 1.7;
    const p = U.at(s0), tx = p.x + p.lx * side * (hw + len + 0.5), tz = p.z + p.lz * side * (hw + len + 0.5);
    T.stairs.push({ s: s0, side, hw, len, wid, top: T.base(tx, tz), bot: floorAt(s0) });
  }
};
const stairAt = (l) => {
  for (const st of T.stairs) {
    if (Math.abs(l.s - st.s) > st.wid) continue;
    const tt = l.t * st.side; if (tt < st.hw || tt > st.hw + st.len) continue;
    return st.bot + (st.top - st.bot) * (tt - st.hw) / st.len;
  }
  return null;
};
// terrain used by physics (corridor carved exactly to its walls)
T.phys = (x, z) => {
  const l = T.locate(x, z);
  if (l) {
    if (U.act[l.i] && Math.abs(l.t) <= U.hw[l.i]) return floorAt(l.s);
    const sh = stairAt(l); if (sh !== null) return sh;
  }
  return T.base(x, z);
};
// terrain used for the mesh (carved a bit wider; the strip is hidden by walls / copings / the deck)
T.mesh = (x, z) => {
  const l = T.locate(x, z);
  if (l) {
    if (U.act[l.i] && Math.abs(l.t) <= U.hw[l.i] + 1.6) return floorAt(l.s);
    const sh = stairAt(l); if (sh !== null) return sh;
  }
  return T.base(x, z);
};
// deck (Alexandra Square level) over the covered section, or null
T.deck = (x, z, pad = 0) => {
  const l = T.locate(x, z); if (!l || !U.cov[l.i] || Math.abs(l.t) > U.hw[l.i] + pad) return null;
  return deckAt(l.i, l.t);
};
// ground height for something currently at height y (picks deck vs tunnel floor)
G.groundAt = (x, z, y = 1e4) => {
  const d = T.deck(x, z);
  if (d !== null && y > d - 2.5) return d;
  return T.phys(x, z);
};
// in the covered tunnel space?
G.inTunnel = (x, z, y) => { const d = T.deck(x, z); return d !== null && y < d - 2.5; };
// solid test for a 3D point (terrain, deck slab, buildings/trees from the grid)
G.pointSolid = (x, y, z, gridFn) => {
  const dk = T.deck(x, z, 2.5);
  if (dk !== null) {
    if (y > dk - 0.75 && y < dk) return true;          // slab
    if (y <= dk - 0.75) {                              // inside the tunnel box
      const l = T.locate(x, z);
      if (Math.abs(l.t) > U.hw[l.i]) { const sh = stairAt(l); return sh === null || y < sh; } // walls / stairwell
      return y < floorAt(l.s);
    }
  }
  if (y < T.phys(x, z) - 0.15) return true;
  return gridFn ? gridFn(G.grid.get(x, z)) : false;
};
// march a 3D segment; returns fraction of the first blocked sample or 1
G.march3 = (a, b, gridFn, step = 0.5) => {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz), n = Math.max(1, Math.ceil(L / step));
  for (let i = 1; i <= n; i++) { const k = i / n; if (G.pointSolid(a.x + dx * k, a.y + dy * k, a.z + dz * k, gridFn)) return (i - 1) / n; }
  return 1;
};
// lay entities on the ground with simple gravity. returns landing speed (for fall damage) or 0
G.settle = (e, dt, maxSnap = 0.45) => {
  const g = G.groundAt(e.pos.x, e.pos.z, e.pos.y + 0.6);
  e.vy = e.vy || 0;
  const free = e.pos.y + e.vy * dt - 10 * dt * dt;
  if (free > g + 0.02 && (e.vy > 0 || e.pos.y - g > maxSnap)) { e.pos.y = free; e.vy -= 20 * dt; e.air = true; return 0; }
  const land = e.air ? -e.vy : 0; e.air = false;
  e.vy = Math.min(6, (g - e.pos.y) / Math.max(dt, 1e-3)); if (e.vy < 0) e.vy = Math.max(e.vy, -12);
  e.pos.y = g;
  return land;
};
})();
