// Ground-floor shopfronts (glass, mullions, brick piers, sign board, lit interior) for the shop units that
// world.js cuts into the buildings round the Bowland South courtyard, plus an upstairs front (Spar).
'use strict';
G.buildShopfronts = (units) => {
  const hex = (h) => { const c = new THREE.Color(h); c.convertSRGBToLinear(); return [c.r, c.g, c.b]; };
  const B = new G.GeoBuilder();
  const brick = hex('#8f6a48'), frame = hex('#2b2d31'), floorC = hex('#cfcac0'), counter = hex('#6b4a34'), shelf = hex('#5a5f66');
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9cc3d8, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
  const signTex = (text, bg, fg, aspect) => {
    const Hc = 160, Wc = Math.max(160, Math.round(Hc * aspect)); const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, Wc, Hc); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, Hc - 10, Wc, 10);
    let fs = 104; x.font = `bold ${fs}px "Helvetica Neue", Arial, sans-serif`; const tw = x.measureText(text).width; if (tw > Wc * 0.86) fs = Math.floor(fs * Wc * 0.86 / tw);
    x.font = `bold ${fs}px "Helvetica Neue", Arial, sans-serif`; x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, Wc / 2, Hc / 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const glassGeo = new G.GeoBuilder();
  for (const u of units) {
    const { px, pz, ux, uz, nx, nz, W, g, clear, depth } = u, gOut = u.gOut !== undefined ? u.gOut : g;
    const at = (a, t, y) => [px + ux * a + nx * t, y, pz + uz * a + nz * t];   // a: along the wall, t: outward
    const h = W / 2;
    // glass front set back slightly, with mullions
    glassGeo.quad(at(-h + 0.25, -0.15, g + 0.05), at(h - 0.25, -0.15, g + 0.05), at(h - 0.25, -0.15, g + clear - 0.75), at(-h + 0.25, -0.15, g + clear - 0.75), null, [1, 1, 1]);
    for (let a = -h + 0.25; a <= h - 0.2; a += (W - 0.5) / 3) { const p0 = at(a, -0.15, 0), p1 = at(a + 0.01, -0.15, 0); B.box(p0[0], p0[2], p1[0] + ux * 0.08, p1[2] + uz * 0.08, 0.12, g, g + clear - 0.75, frame); }
    B.box(...at(-h + 0.25, -0.15, 0).filter((_, i) => i !== 1), ...at(h - 0.25, -0.15, 0).filter((_, i) => i !== 1), 0.12, g, g + 0.12, frame);                   // sill
    // step up from the pavement to the shop floor
    if (g - gOut > 0.03) { const s0 = at(-h, 0.05, 0), s1 = at(h, 0.05, 0); B.box(s0[0], s0[2], s1[0], s1[2], 0.5, gOut - 0.2, g, hex('#bdb6aa')); }
    // brick piers either side, standing proud of the facade (gives the front its depth)
    for (const sd of [-1, 1]) { const a0 = at(sd * (h - 0.05), 0.3, 0), a1 = at(sd * (h + 0.4), 0.3, 0); B.box(a0[0], a0[2], a1[0], a1[2], 0.65, g - 0.2, g + clear + 0.15, brick); }
    // sign board across the top of the opening
    const sw = W - 0.2, sh = 0.62, sy = g + clear - 0.7;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), (() => { const t = signTex(u.sign, u.bg, u.fg, sw / sh); return new THREE.MeshLambertMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55 }); })());
    const sc = at(0, 0.12, sy + sh / 2); sign.position.set(sc[0], sc[1], sc[2]); sign.rotation.y = Math.atan2(nx, nz); G.scene.add(sign);
    { const b0 = at(-sw / 2, 0.05, 0), b1 = at(sw / 2, 0.05, 0); B.box(b0[0], b0[2], b1[0], b1[2], 0.12, sy - 0.04, sy + sh + 0.04, frame); }
    // interior: floor, counter, shelves, ceiling light
    B.quad(at(-h + 0.3, -0.2, g + 0.03), at(h - 0.3, -0.2, g + 0.03), at(h - 0.3, -depth + 0.4, g + 0.03), at(-h + 0.3, -depth + 0.4, g + 0.03), [0, 1, 0], floorC);
    { const c0 = at(-h * 0.6, -depth + 2.2, 0), c1 = at(h * 0.6, -depth + 2.2, 0); B.box(c0[0], c0[2], c1[0], c1[2], 0.8, g, g + 1.05, counter); }
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      const s0 = at(sd * (h - 0.6), -1.2 - k * 1.7, 0), s1 = at(sd * (h - 0.6), -2.6 - k * 1.7, 0);
      B.box(s0[0], s0[2], s1[0], s1[2], 0.5, g, g + 2.0, shelf);
      for (let r = 0; r < 3; r++) { const col = hex(['#d23c3c', '#e0b23a', '#3c8fd2', '#4fae5a'][(k + r + (sd > 0 ? 1 : 0)) % 4]); B.box(s0[0], s0[2], s1[0], s1[2], 0.42, g + 0.45 + r * 0.55, g + 0.7 + r * 0.55, col); }
    }
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.55, 0.5), lightMat); const lc = at(0, -depth / 2, g + clear - 0.08);
    lp.position.set(lc[0], lc[1], lc[2]); lp.rotation.x = Math.PI / 2; lp.rotation.z = -Math.atan2(nx, nz); G.scene.add(lp);
    // upstairs shop (Spar above KC's): window band + sign on the first floor facade, at the level the ramp lands
    if (u.upper) {
      const y = u.upper.y;
      glassGeo.quad(at(-h + 0.3, 0.04, y + 0.15), at(h - 0.3, 0.04, y + 0.15), at(h - 0.3, 0.04, y + 2.5), at(-h + 0.3, 0.04, y + 2.5), null, [1, 1, 1]);
      const usw = W - 0.4, ush = 0.7;
      const us = new THREE.Mesh(new THREE.PlaneGeometry(usw, ush), (() => { const t = signTex(u.upper.sign, u.upper.bg, u.upper.fg, usw / ush); return new THREE.MeshLambertMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.55 }); })());
      const uc = at(0, 0.1, y + 2.65 + ush / 2); us.position.set(uc[0], uc[1], uc[2]); us.rotation.y = Math.atan2(nx, nz); G.scene.add(us);
      { const b0 = at(-h + 0.2, 0.02, 0), b1 = at(h - 0.2, 0.02, 0); B.box(b0[0], b0[2], b1[0], b1[2], 0.1, y + 0.05, y + 0.15, frame); }
    }
  }
  const m = B.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.castShadow = true; m.receiveShadow = true; G.scene.add(m);
  const gm = glassGeo.mesh(glassMat); gm.renderOrder = 3; G.scene.add(gm);
};
