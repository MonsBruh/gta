// HUD: minimap, big map, bars, wanted stars, notifications, location names.
'use strict';
(() => {
const $ = (id) => document.getElementById(id);
const H = G.hud = {};
let lastZone = '', lastStreet = '', zoneT = 0, notes = [];
let mm, mctx;
H.init = () => { mm = $('minimap'); mctx = mm.getContext('2d'); };
H.notify = (msg) => {
  const d = document.createElement('div'); d.className = 'n'; d.textContent = msg; $('notify').appendChild(d);
  notes.push(d); if (notes.length > 4) notes.shift().remove();
  setTimeout(() => { d.remove(); notes = notes.filter((x) => x !== d); }, 5000);
};
H.big = (txt, cls) => { const b = $('bigmsg'); b.textContent = txt; b.className = txt ? 'show ' + cls : ''; if (cls === 'good') setTimeout(() => { if (b.textContent === txt) b.className = ''; }, 2500); };
H.vehicleName = (n) => { const e = $('vehname'); e.textContent = n; e.style.opacity = 1; clearTimeout(H._vt); H._vt = setTimeout(() => { e.style.opacity = 0; }, 2500); };
H.progress = (k, label) => {
  const p = $('progress'); if (k === null) { p.style.display = 'none'; return; }
  p.style.display = 'block'; $('progressfill').style.width = (k * 100).toFixed(0) + '%'; $('progresslabel').textContent = label;
};
let hurtT = 0;
H.hurt = () => { hurtT = 0.25; };
H.hitMark = (head) => { const c = $('crosshair'); c.classList.add('hit'); clearTimeout(H._ht); H._ht = setTimeout(() => c.classList.remove('hit'), head ? 220 : 120); };

H.update = (dt) => {
  const pl = G.player;
  $('hpbar').style.width = Math.max(0, pl.hp / pl.maxHp * 100) + '%';
  $('arbar').parentElement.style.visibility = pl.armor > 0 ? 'visible' : 'hidden';
  $('arbar').style.width = pl.armor + '%';
  $('money').textContent = '$' + String(Math.floor(pl.money)).padStart(8, '0');
  const w = G.WEAPONS[pl.weapon];
  $('weaponname').textContent = w.name.toUpperCase();
  const inv = pl.inv[pl.weapon];
  $('ammo').textContent = inv ? `${inv.clip} / ${inv.ammo}${pl.reloadT > 0 ? '  RELOADING' : ''}` : '';
  let s = ''; for (let i = 1; i <= 5; i++) s += `<span class="${i <= G.police.stars ? 'on' : ''}">★</span>`;
  const st = $('stars'); if (st.innerHTML !== s) st.innerHTML = s;
  st.classList.toggle('flash', G.police.stars > 0 && !G.police.seen);
  $('clock').textContent = G.clock.str;
  $('crosshair').className = pl.vehicle ? 'hidden' : (pl.aiming ? '' : 'small') + ($('crosshair').classList.contains('hit') ? ' hit' : '');
  $('speedo').textContent = pl.vehicle ? Math.abs(Math.round(pl.vehicle.speed * 2.237)) + ' MPH' : '';
  if (hurtT > 0) { hurtT -= dt; document.body.style.boxShadow = `inset 0 0 ${120 * hurtT * 4}px rgba(200,0,0,${hurtT * 2})`; } else document.body.style.boxShadow = '';
  // location
  H._locT = (H._locT || 0) - dt;
  if (H._locT <= 0) {
    H._locT = 0.5; const L = G.locate(pl.pos.x, pl.pos.z);
    if (L.zone !== lastZone || (L.street && L.street !== lastStreet)) { lastZone = L.zone; lastStreet = L.street || lastStreet; $('zonename').textContent = L.zone; $('streetname').textContent = L.street || ''; zoneT = 5; }
  }
  zoneT -= dt; $('zone').style.opacity = zoneT > 0 ? 1 : 0.0;
  drawMinimap();
};

function drawMinimap() {
  const pl = G.player, W = mm.width, Hh = mm.height, c = mctx;
  const p = pl.vehicle ? pl.vehicle.pos : pl.pos;
  const speed = pl.vehicle ? Math.abs(pl.vehicle.speed) : 0;
  const zoom = G.lerp(1.6, 0.8, Math.min(1, speed / 30)) * (G.mapScale ? 1 / G.mapScale : 1);
  H._zoom = G.lerp(H._zoom || zoom, zoom, 0.05);
  const z = H._zoom, th = G.cam.yaw + Math.PI;
  c.save(); c.fillStyle = '#4b6b36'; c.fillRect(0, 0, W, Hh);
  c.translate(W / 2, Hh / 2); c.rotate(th); c.scale(z, z);
  c.translate(-(p.x + G.HW) * G.mapScale, -(p.z + G.HH) * G.mapScale);
  c.imageSmoothingEnabled = true;
  c.drawImage(G.mapCanvas, 0, 0);
  const M = (x) => (x + G.HW) * G.mapScale, N = (zz) => (zz + G.HH) * G.mapScale;
  const dot = (x, zz, r, col) => { c.beginPath(); c.arc(M(x), N(zz), r / z, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.lineWidth = 1 / z; c.strokeStyle = '#000'; c.stroke(); };
  for (const s of G.shops) if (s.cooldown <= 0) { c.save(); c.translate(M(s.x), N(s.z)); c.rotate(-th); c.fillStyle = '#3fbf5a'; c.font = `bold ${14 / z}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 0, 0); c.restore(); }
  for (const k of G.pickups) if (k.active && !k.ttl) dot(k.x, k.z, 3.5, k.kind === 'health' ? '#ff4040' : k.kind === 'armor' ? '#4080ff' : '#ffffff');
  const flash = Math.floor(G.time * 4) % 2;
  for (const v of G.vehicles) if (v.type === 'police' && !v.dead && !v.removed) dot(v.pos.x, v.pos.z, 4, flash ? '#ff3030' : '#3050ff');
  for (const a of G.actors) if (a.kind === 'cop' && !a.dead && !a.vehicle) dot(a.pos.x, a.pos.z, 3, flash ? '#3050ff' : '#ff3030');
  if (G.heli) dot(G.heli.pos.x, G.heli.pos.z, 5, '#ff3030');
  if (G.waypoint) dot(G.waypoint.x, G.waypoint.z, 5, '#ff00ff');
  // player arrow
  const yaw = pl.vehicle ? pl.vehicle.yaw : pl.yaw; const fx = Math.sin(yaw), fz = Math.cos(yaw), s = 7 / z;
  c.beginPath(); c.moveTo(M(p.x) + fx * s * 1.4, N(p.z) + fz * s * 1.4); c.lineTo(M(p.x) - fx * s + fz * s * 0.8, N(p.z) - fz * s - fx * s * 0.8); c.lineTo(M(p.x) - fx * s * 0.4, N(p.z) - fz * s * 0.4); c.lineTo(M(p.x) - fx * s - fz * s * 0.8, N(p.z) - fz * s + fx * s * 0.8); c.closePath();
  c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.5 / z; c.stroke();
  c.restore();
  // north marker on rim
  const nx = Math.cos(th - Math.PI / 2), ny = Math.sin(th - Math.PI / 2);
  const north = $('north'); north.style.left = (W / 2 + nx * (W / 2 - 12)) + 'px'; north.style.top = (Hh / 2 + ny * (Hh / 2 - 12) - 10) + 'px';
}

H.drawBigMap = () => {
  const cv = $('bigmapcanvas');
  const sc = Math.min(window.innerWidth / G.mapCanvas.width, (window.innerHeight - 30) / G.mapCanvas.height) * 1.0;
  cv.width = Math.floor(G.mapCanvas.width * sc); cv.height = Math.floor(G.mapCanvas.height * sc);
  const c = cv.getContext('2d'); c.drawImage(G.mapCanvas, 0, 0, cv.width, cv.height);
  const M = (x) => (x + G.HW) * G.mapScale * sc, N = (z) => (z + G.HH) * G.mapScale * sc;
  c.font = 'bold 10px system-ui, sans-serif'; c.textAlign = 'center';
  const seen = new Set(), rects = [];
  const fits = (x, y, w, h) => { for (const r of rects) if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return false; rects.push([x, y, w, h]); return true; };
  const blds = G.buildingList.filter((b) => b.n).sort((a, b) => Math.abs(G.polyArea(b.p)) - Math.abs(G.polyArea(a.p)));
  for (const b of blds) {
    if (seen.has(b.n)) continue; seen.add(b.n);
    const w = c.measureText(b.n).width; const x = M(b.x) - w / 2 - 2, y = N(b.z) - 9;
    if (!fits(x, y, w + 4, 12)) continue;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x, y, w + 4, 12);
    c.fillStyle = '#fff'; c.fillText(b.n, M(b.x), N(b.z));
  }
  c.font = 'bold 12px system-ui, sans-serif';
  for (const z of window.CAMPUS.zones) if (z.a > 4000 && !seen.has(z.n) && z.n !== 'Lancaster University') { seen.add(z.n); const ce = G.centroid(z.p); c.fillStyle = '#ffd34a'; c.fillText(z.n, M(ce.x), N(ce.z)); }
  for (const s of G.shops) { c.fillStyle = '#3fbf5a'; c.font = 'bold 14px sans-serif'; c.fillText('$', M(s.x), N(s.z) + 4); }
  for (const k of G.pickups) if (!k.ttl) { c.beginPath(); c.arc(M(k.x), N(k.z), 4, 0, 7); c.fillStyle = k.kind === 'health' ? '#ff4040' : k.kind === 'armor' ? '#4080ff' : '#fff'; c.fill(); c.strokeStyle = '#000'; c.stroke(); }
  const pl = G.player; const p = pl.vehicle ? pl.vehicle.pos : pl.pos;
  c.beginPath(); c.arc(M(p.x), N(p.z), 7, 0, 7); c.fillStyle = '#ff2050'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
  c.fillStyle = '#fff'; c.font = 'bold 13px system-ui'; c.textAlign = 'left'; c.fillText('N ↑', 10, 20);
  c.font = '11px system-ui'; c.fillStyle = '#ccc'; c.fillText('Click to set a waypoint', 10, 36);
  cv.onclick = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) / sc / G.mapScale - G.HW, z = (e.clientY - r.top) / sc / G.mapScale - G.HH; G.waypoint = { x, z }; H.notify('Waypoint set'); };
};
})();
