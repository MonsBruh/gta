// Geometry for the Underpass: retaining walls, the deck's concrete underside, road & platforms, lights, stairwells.
'use strict';
G.buildUnderpass = () => {
  const T = G.T, U = T.U; if (!U.ok) return;
  const hex = (h) => { const c = new THREE.Color(h); c.convertSRGBToLinear(); return [c.r, c.g, c.b]; };
  const concrete = hex('#a29d94'), concreteDark = hex('#7d7972'), ceilingC = hex('#8c8a86'), asphalt = hex('#3d3e42'),
    paving = hex('#b3ada2'), kerb = hex('#cfcac0'), line = hex('#e8e6dc'), yellow = hex('#e0c020'), lampC = hex('#fff4d8');
  const B = new G.GeoBuilder();      // concrete (double-sided)
  const R = new G.GeoBuilder();      // road surfaces
  const L = new G.GeoBuilder();      // emissive lights
  const W = (i, t, y) => { const p = U.at(i); return [p.x + p.lx * t, y, p.z + p.lz * t]; };
  const deck = (i, t) => T.deckAt(i, t);
  const stairGap = (side, i) => T.stairs.some((st) => st.side === side && Math.abs(st.s - i) < st.wid);
  const N = U.N;
  for (let i = 0; i + 1 < N; i++) {
    const j = i + 1;
    if (!U.act[i] && !U.act[j]) continue;
    const cov = U.cov[i] && U.cov[j];
    const F0 = U.F[i], F1 = U.F[j];
    for (const sd of [-1, 1]) {
      const t0 = sd * U.hw[i], t1 = sd * U.hw[j];
      const side0 = sd > 0 ? U.Hl[i] : U.Hr[i], side1 = sd > 0 ? U.Hl[j] : U.Hr[j];
      if (cov) {
        // wall up to the ceiling (leave the stairwell opening)
        const c0 = deck(i, t0) - 0.75, c1 = deck(j, t1) - 0.75;
        if (stairGap(sd, i)) {
          // lintel above the stair opening
          B.quad(W(i, t0, c0 - 0.6), W(j, t1, c1 - 0.6), W(j, t1, c1), W(i, t0, c0), null, concreteDark);
        } else B.quad(W(i, t0, F0 - 0.3), W(j, t1, F1 - 0.3), W(j, t1, c1), W(i, t0, c0), null, (i >> 2) % 2 ? concrete : concreteDark);
        // ceiling (underside of Alexandra Square)
      } else {
        const top0 = Math.max(side0, F0) + 1.0, top1 = Math.max(side1, F1) + 1.0;
        if (top0 - F0 < 1.2 && top1 - F1 < 1.2) continue;
        const o0 = sd * (U.hw[i] + 0.5), o1 = sd * (U.hw[j] + 0.5), c0 = sd * (U.hw[i] + 2.6), c1 = sd * (U.hw[j] + 2.6);
        B.quad(W(i, t0, F0 - 0.3), W(j, t1, F1 - 0.3), W(j, t1, top1), W(i, t0, top0), null, (i >> 2) % 2 ? concrete : concreteDark);   // inner face
        B.quad(W(i, t0, top0), W(j, t1, top1), W(j, o1, top1), W(i, o0, top0), null, concreteDark);                                     // parapet cap
        B.quad(W(i, o0, side0 - 0.2), W(j, o1, side1 - 0.2), W(j, o1, top1), W(i, o0, top0), null, concrete);                           // outer face
        B.quad(W(i, o0, side0 + 0.04), W(j, o1, side1 + 0.04), W(j, c1, side1 + 0.04), W(i, c0, side0 + 0.04), null, paving);           // coping over the cut
      }
    }
    if (cov) {
      const hw0 = U.hw[i], hw1 = U.hw[j];
      for (let t = -hw0; t < hw0 - 1e-6; t += 1) {
        const ta = t, tb = Math.min(hw0, t + 1);
        B.quad(W(i, ta, deck(i, ta) - 0.75), W(j, ta * hw1 / hw0, deck(j, ta) - 0.75), W(j, tb * hw1 / hw0, deck(j, tb) - 0.75), W(i, tb, deck(i, tb) - 0.75), null, ceilingC);
      }
      // strip lights along the ceiling
      if (i % 6 === 0) for (const tl of [-2.2, 2.2]) {
        const y = deck(i, tl) - 0.8; L.quad(W(i, tl - 0.25, y), W(i + 3, tl - 0.25, y), W(i + 3, tl + 0.25, y), W(i, tl + 0.25, y), [0, -1, 0], lampC);
      }
    }
    // road, kerbs and platforms on the floor (the open cuttings already show the road texture)
    if (U.act[i]) {
      const y0 = F0 + 0.04, y1 = F1 + 0.04, hw0 = U.hw[i], hw1 = U.hw[j];
      if (cov) {
        R.quad(W(i, -3.4, y0), W(j, -3.4, y1), W(j, 3.4, y1), W(i, 3.4, y0), [0, 1, 0], asphalt);
        for (const sd of [-1, 1]) {
          R.quad(W(i, sd * 3.4, y0 + 0.15), W(j, sd * 3.4, y1 + 0.15), W(j, sd * hw1, y1 + 0.15), W(i, sd * hw0, y0 + 0.15), [0, 1, 0], paving);
          R.quad(W(i, sd * 3.4, y0), W(j, sd * 3.4, y1), W(j, sd * 3.4, y1 + 0.15), W(i, sd * 3.4, y0 + 0.15), null, kerb);
          R.quad(W(i, sd * 3.25, y0 + 0.01), W(j, sd * 3.25, y1 + 0.01), W(j, sd * 3.1, y1 + 0.01), W(i, sd * 3.1, y0 + 0.01), [0, 1, 0], yellow);
        }
        if (i % 6 < 3) R.quad(W(i, -0.08, y0 + 0.01), W(j, -0.08, y1 + 0.01), W(j, 0.08, y1 + 0.01), W(i, 0.08, y0 + 0.01), [0, 1, 0], line);
      }
    }
  }
  // portal faces: the slab edge where the cutting meets the deck
  for (let i = 1; i < N; i++) {
    if (U.cov[i] === U.cov[i - 1]) continue;
    const k = U.cov[i] ? i : i - 1, hw = U.hw[k] + 2.6;
    for (let t = -hw; t < hw - 1e-6; t += 1) B.quad(W(k, t, deck(k, t) - 0.75), W(k, t + 1, deck(k, t + 1) - 0.75), W(k, t + 1, deck(k, t + 1) + 0.02), W(k, t, deck(k, t) + 0.02), null, concreteDark);
  }
  // parapet on the deck above each tunnel mouth
  for (const pt of (U.portals || [])) {
    const i = Math.round(G.clamp(pt.s, 0, N - 1));
    for (let t = -pt.W; t < pt.W - 1e-6; t += 1) {
      const y0 = deck(i, t), y1 = deck(i, t + 1);
      const a0 = W(pt.s - 0.25, t, y0 - 0.05), a1 = W(pt.s - 0.25, t + 1, y1 - 0.05), b0 = W(pt.s + 0.25, t, y0 - 0.05), b1 = W(pt.s + 0.25, t + 1, y1 - 0.05);
      const up = (v) => [v[0], v[1] + 1.15, v[2]];
      B.quad(a0, a1, up(a1), up(a0), null, concrete); B.quad(b0, b1, up(b1), up(b0), null, concrete); B.quad(up(a0), up(a1), up(b1), up(b0), null, concreteDark);
    }
  }
  // stairwells: steps + side walls with parapets
  for (const st of T.stairs) {
    const steps = 18;
    for (let k = 0; k < steps; k++) {
      const ta = st.hw + st.len * k / steps, tb = st.hw + st.len * (k + 1) / steps, y = st.bot + (st.top - st.bot) * (k + 1) / steps;
      const a0 = U.at(st.s - st.wid), a1 = U.at(st.s + st.wid);
      const P = (pp, t, yy) => [pp.x + pp.lx * st.side * t, yy, pp.z + pp.lz * st.side * t];
      B.quad(P(a0, ta, y), P(a1, ta, y), P(a1, tb, y), P(a0, tb, y), [0, 1, 0], kerb);
      B.quad(P(a0, ta, y - (st.top - st.bot) / steps - 0.02), P(a1, ta, y - (st.top - st.bot) / steps - 0.02), P(a1, ta, y), P(a0, ta, y), null, concreteDark);
    }
    for (const e of [-1, 1]) {
      const pp = U.at(st.s + e * (st.wid + 0.1));
      const P = (t, yy) => [pp.x + pp.lx * st.side * t, yy, pp.z + pp.lz * st.side * t];
      const y0 = st.bot - 0.3, yTop = st.top + 1.0;
      B.quad(P(st.hw, y0), P(st.hw + st.len, y0), P(st.hw + st.len, yTop), P(st.hw, yTop), null, concrete);
    }
  }
  const mk = (b, mat, shadow) => { const m = b.mesh(mat); m.castShadow = shadow; m.receiveShadow = true; G.scene.add(m); return m; };
  mk(B, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), true);
  mk(R, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), false);
  mk(L, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), false);
  // a warm light inside so the tunnel reads as lit
  let ci = 0, cn = 0; for (let i = 0; i < U.N; i++) if (U.cov[i]) { ci += i; cn++; }
  if (cn) { const c = U.at(ci / cn); const pl = new THREE.PointLight(0xffe6b0, 60, 90, 1.6); pl.position.set(c.x, U.F[Math.round(ci / cn)] + 4, c.z); G.scene.add(pl); }
};
