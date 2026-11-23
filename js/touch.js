// Touch controls for phones/tablets: floating joystick, drag-to-look, action buttons, light aim assist.
'use strict';
(() => {
if (!G.mobile) return;
const $ = (id) => document.getElementById(id);
const root = document.createElement('div'); root.id = 'touch'; root.className = 'hidden';
root.innerHTML = `
  <div id="tjoy"><div id="tknob"></div></div>
  <button class="tb" id="tb-fire">FIRE</button>
  <button class="tb" id="tb-aim">AIM</button>
  <button class="tb" id="tb-jump">JUMP</button>
  <button class="tb" id="tb-car">CAR</button>
  <button class="tb sm" id="tb-wpn">WPN</button>
  <button class="tb sm" id="tb-reload">R</button>
  <button class="tb sm" id="tb-horn">HORN</button>
  <button class="tb sm top" id="tb-map">MAP</button>
  <button class="tb sm top" id="tb-pause">II</button>`;
document.body.appendChild(root);
const keys = G._debug.keys;
G.touchMove = { x: 0, y: 0, sprint: false };
let aimOn = false;

// ---- joystick (appears where the left thumb lands) ----
const joy = $('tjoy'), knob = $('tknob');
let joyId = null, jx = 0, jy = 0;
const R = 55;
// ---- look (drag anywhere else on the right, or while holding FIRE) ----
const looks = new Map();
const lookSens = 0.0065;

const onButton = (t) => t.target && t.target.closest && t.target.closest('.tb');
root.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (onButton(t)) continue;
    if (t.clientX < window.innerWidth * 0.42 && joyId === null) {
      joyId = t.identifier; jx = t.clientX; jy = t.clientY;
      joy.style.left = jx - R + 'px'; joy.style.top = jy - R + 'px'; joy.classList.add('on'); knob.style.transform = '';
    } else looks.set(t.identifier, { x: t.clientX, y: t.clientY });
  }
  e.preventDefault();
}, { passive: false });
const move = (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) {
      let dx = t.clientX - jx, dy = t.clientY - jy; const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.max(0, (Math.min(d, R) - 6) / (R - 6)) / (d || 1);
      G.touchMove.x = dx * k * (R / R); G.touchMove.y = dy * k;
      G.touchMove.sprint = d > R * 1.25 || Math.hypot(G.touchMove.x, G.touchMove.y) > 0.97 && d > R;
    } else if (looks.has(t.identifier)) {
      const l = looks.get(t.identifier);
      const dx = t.clientX - l.x, dy = t.clientY - l.y; l.x = t.clientX; l.y = t.clientY;
      const s = lookSens * (aimOn ? 0.55 : 1);
      G.cam.yaw -= dx * s; G.cam.pitch = G.clamp(G.cam.pitch + dy * s, -1.0, 1.35); G.cam.mouseT = 1.4; G.cam.recenter = null;
    }
  }
  e.preventDefault();
};
const end = (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) { joyId = null; G.touchMove.x = G.touchMove.y = 0; G.touchMove.sprint = false; joy.classList.remove('on'); }
    looks.delete(t.identifier);
  }
};
window.addEventListener('touchmove', move, { passive: false });
window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);

// ---- buttons ----
const btn = (id, down, up, lookToo) => {
  const b = $(id);
  b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); for (const t of e.changedTouches) if (lookToo) looks.set(t.identifier, { x: t.clientX, y: t.clientY }); if (down) down(); }, { passive: false });
  const u = (e) => { b.classList.remove('down'); for (const t of e.changedTouches) looks.delete(t.identifier); if (up) up(); };
  b.addEventListener('touchend', u); b.addEventListener('touchcancel', u);
};
btn('tb-fire', () => G._debug.setFire(true), () => G._debug.setFire(false), true);
btn('tb-aim', () => { aimOn = !aimOn; G._debug.setAim(aimOn); $('tb-aim').classList.toggle('lit', aimOn); });
btn('tb-jump', () => { keys.Space = true; }, () => { keys.Space = false; }, true);
btn('tb-car', () => { if (!G.state.over) G._enterExit(); });
btn('tb-wpn', () => G._cycleWeapon(1));
btn('tb-reload', () => G.reload(G.player));
btn('tb-horn', () => { if (G.player.vehicle) { G.audio.horn(); G.panic(G.player.pos.x, G.player.pos.z, 15, 0.3); } });
btn('tb-map', () => G._toggleMap());
btn('tb-pause', () => G._pause());
$('bigmapclose').addEventListener('click', () => { if (G.state.map) G._toggleMap(); });

// ---- per-frame: labels + aim assist ----
const V3 = THREE.Vector3;
G.touchUpdate = (dt) => {
  const pl = G.player; if (!pl) return;
  root.classList.toggle('hidden', !G.state.started || G.state.paused);
  root.classList.toggle('driving', !!pl.vehicle);
  $('tb-jump').textContent = pl.vehicle ? 'BRAKE' : 'JUMP';
  $('tb-car').textContent = pl.vehicle ? 'EXIT' : 'CAR';
  if (pl.vehicle && aimOn) { aimOn = false; G._debug.setAim(false); $('tb-aim').classList.remove('lit'); }
  // gentle aim assist when aiming or firing on foot with a gun: pull the view toward the nearest threat in a cone
  const firing = G._debug.mouse.mouseL;
  if (pl.vehicle || pl.dead || pl.weapon === 'fists' || !(aimOn || firing)) return;
  const cy = G.cam.yaw; let best = null, bs = 0.32;
  for (const a of G.actors) {
    if (a === pl || a.dead || a.vehicle || a.removed) continue;
    const cp = G.camera.position; const dx = a.pos.x - cp.x, dz = a.pos.z - cp.z, d = Math.hypot(dx, dz); if (d > 44 || G.dist(a.pos, pl.pos) < 1) continue;
    const off = Math.abs(G.angDiff(cy, Math.atan2(dx, dz))); const score = off + d * 0.002 - (a.kind === 'cop' ? 0.05 : 0);
    if (score < bs && G.lineOfSight(new V3(pl.pos.x, pl.pos.y + 1.4, pl.pos.z), new V3(a.pos.x, a.pos.y + 1.2, a.pos.z))) { bs = score; best = { a, d, yaw: Math.atan2(dx, dz) }; }
  }
  if (!best) return;
  const k = Math.min(1, dt * (aimOn ? 7 : 4));
  G.cam.yaw += G.angDiff(G.cam.yaw, best.yaw) * k;
  const camY = G.camera.position.y; const want = Math.atan2(camY - (best.a.pos.y + 1.2), best.d);
  G.cam.pitch += (want - G.cam.pitch) * k;
};
})();
