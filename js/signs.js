// "NORTH SPINE" / "SOUTH SPINE" signs where the Spine walkways open onto Alexandra Square.
// Positions come from the OpenStreetMap ways named "North Spine" / "South Spine": each sign spans the
// walkway at the end that touches Alexandra Square, facing into the square.
'use strict';
G.buildSpineSigns = () => {
  const D = window.CAMPUS;
  const sq = D.zones.find((z) => z.n === 'Alexandra Square'); if (!sq) return;
  const sqC = G.centroid(sq.p);
  const edgeDist = (x, z) => { // distance from the square's outline (0 if inside)
    if (G.pip(x, z, sq.p)) return 0;
    let best = Infinity; const p = sq.p, n = p.length / 2;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = G.clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); }
    return best;
  };
  const texFor = (text, aspect) => {
    const Hc = 192, Wc = Math.round(Hc * aspect);
    const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const x = c.getContext('2d');
    x.fillStyle = '#1f2328'; x.fillRect(0, 0, Wc, Hc);
    let fs = 110; x.font = `bold ${fs}px "Helvetica Neue", Arial, sans-serif`;
    const tw = x.measureText(text).width; if (tw > Wc * 0.9) { fs = Math.floor(fs * Wc * 0.9 / tw); }
    x.fillStyle = '#ffffff'; x.font = `bold ${fs}px "Helvetica Neue", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, Wc / 2, Hc / 2 + 6);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const frameMat = G.lam(0x2a2d31), backMat = G.lam(0x1f2328);
  G.spineSigns = [];
  for (const name of ['North Spine', 'South Spine']) {
    // the end of any way with this name that touches the square
    let best = null;
    for (const r of D.roads) {
      if (r.n !== name) continue;
      const n = r.p.length / 2;
      for (const [i, j] of [[0, 1], [n - 1, n - 2]]) {
        const x = r.p[i * 2], z = r.p[i * 2 + 1], d = edgeDist(x, z);
        if (d < 4 && (!best || d < best.d)) best = { d, x, z, nx: r.p[j * 2], nz: r.p[j * 2 + 1], w: r.w };
      }
    }
    if (!best) continue;
    // walk out of the square along the spine until we're at its edge (the mouth of the walkway)
    let dx = best.nx - best.x, dz = best.nz - best.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    let mx = best.x, mz = best.z;
    for (let k = 0; k < 40 && G.pip(mx, mz, sq.p); k++) { mx += dx * 0.25; mz += dz * 0.25; }
    mx += dx * 0.6; mz += dz * 0.6;                       // just inside the walkway
    // fit the frame between whatever is either side (buildings), max ~5.6 m wide
    const px = -dz, pz = dx; let half = 2.8;
    for (let h = 1.2; h <= 2.8; h += 0.1) { if (G.solidForWalk(G.grid.get(mx + px * h, mz + pz * h)) || G.solidForWalk(G.grid.get(mx - px * h, mz - pz * h))) { half = h - 0.25; break; } }
    const y = G.groundAt(mx, mz);
    const g = new THREE.Group(); g.position.set(mx, y, mz);
    g.rotation.y = Math.atan2(-dx, -dz);                  // panel faces back into the square
    const W = half * 2, clear = 2.9, H = 0.85;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.14), [backMat, backMat, frameMat, frameMat, new THREE.MeshLambertMaterial({ map: texFor(name.toUpperCase(), W / H) }), backMat]);
    panel.position.y = clear + H / 2; panel.castShadow = true; g.add(panel);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, clear + H, 0.14), frameMat);
      post.position.set(s * (half - 0.07), (clear + H) / 2, 0); post.castShadow = true; g.add(post);
      G.grid.disc(mx + px * s * (half - 0.07), mz + pz * s * (half - 0.07), 0.12, G.TREE, (v) => v === G.FREE);
    }
    G.scene.add(g);
    G.spineSigns.push({ name, x: mx, z: mz, y, facing: g.rotation.y, width: W });
  }
};
