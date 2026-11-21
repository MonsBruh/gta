// Tiny WebAudio synth: no audio files needed.
'use strict';
G.audio = (() => {
  let ctx = null, master = null, noiseBuf = null, engine = null, siren = null;
  const A = { enabled: true };
  A.init = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { A.enabled = false; return; }
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // engine loop
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 40;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 20;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
    engine = { o, o2, f, g };
    const so = ctx.createOscillator(); so.type = 'triangle'; so.frequency.value = 700;
    const sg = ctx.createGain(); sg.gain.value = 0; so.connect(sg); sg.connect(master); so.start();
    siren = { o: so, g: sg };
  };
  const vol = (dist) => (dist == null ? 1 : Math.max(0, 1 - dist / 120));
  const noise = (dur, freq, q, gain, type = 'lowpass', decay = dur) => {
    if (!ctx || gain <= 0.01) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  };
  const tone = (f0, f1, dur, gain, type = 'sine') => {
    if (!ctx || gain <= 0.01) return;
    const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); const t = ctx.currentTime;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  };
  A.shot = (kind, dist) => {
    const v = vol(dist);
    if (kind === 'shotgun') { noise(0.5, 1800, 0.7, 0.9 * v, 'lowpass', 0.45); tone(120, 40, 0.25, 0.5 * v); }
    else if (kind === 'smg') { noise(0.12, 3200, 0.8, 0.45 * v, 'lowpass', 0.1); }
    else if (kind === 'rpg') { noise(0.6, 800, 0.5, 0.5 * v, 'bandpass', 0.6); }
    else { noise(0.22, 2600, 0.9, 0.7 * v, 'lowpass', 0.2); tone(180, 60, 0.12, 0.3 * v); }
  };
  A.punch = (dist) => { const v = vol(dist); tone(160, 50, 0.12, 0.6 * v); noise(0.08, 900, 1, 0.3 * v); };
  A.whoosh = () => noise(0.15, 1200, 2, 0.12, 'bandpass', 0.15);
  A.explosion = (dist) => { const v = Math.max(0.15, vol(dist)); noise(1.8, 500, 0.6, 1.0 * v, 'lowpass', 1.6); tone(80, 25, 1.0, 0.8 * v); };
  A.crash = (strength, dist) => { const v = vol(dist) * Math.min(1, strength); noise(0.3, 1400, 0.6, 0.6 * v, 'lowpass', 0.3); tone(90, 40, 0.2, 0.4 * v, 'square'); };
  A.horn = () => { tone(420, 410, 0.35, 0.18, 'square'); tone(530, 520, 0.35, 0.14, 'square'); };
  A.pickup = () => { tone(660, 990, 0.12, 0.25, 'triangle'); setTimeout(() => tone(990, 1320, 0.12, 0.2, 'triangle'), 90); };
  A.cash = () => { tone(1200, 1800, 0.08, 0.2, 'square'); setTimeout(() => tone(1600, 2400, 0.1, 0.15, 'square'), 70); };
  A.empty = () => tone(900, 700, 0.05, 0.15, 'square');
  A.reload = () => { noise(0.05, 3000, 3, 0.25, 'bandpass', 0.05); setTimeout(() => noise(0.06, 2000, 3, 0.3, 'bandpass', 0.06), 260); };
  A.splash = () => noise(0.6, 900, 0.5, 0.4, 'lowpass', 0.6);
  A.scream = (dist) => { const v = vol(dist) * 0.25; if (v > 0.02) tone(G.rand(500, 800), G.rand(900, 1300), 0.5, v, 'sawtooth'); };
  A.wasted = () => { tone(300, 60, 2.2, 0.4, 'sawtooth'); };
  A.busted = () => { tone(600, 600, 0.25, 0.3, 'square'); setTimeout(() => tone(450, 450, 0.5, 0.3, 'square'), 260); };
  A.update = (s) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (engine) {
      engine.g.gain.setTargetAtTime(s.engineOn ? 0.09 + Math.min(0.08, s.engineSpeed / 400) : 0, t, 0.08);
      const f = 35 + Math.abs(s.engineSpeed) * 4.2 + (s.throttle ? 12 : 0);
      engine.o.frequency.setTargetAtTime(f, t, 0.05); engine.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
      engine.f.frequency.setTargetAtTime(300 + f * 4, t, 0.05);
    }
    if (siren) {
      const on = s.sirenDist != null && s.sirenDist < 160;
      siren.g.gain.setTargetAtTime(on ? 0.05 * (1 - s.sirenDist / 160) : 0, t, 0.1);
      siren.o.frequency.setTargetAtTime((Math.floor(G.time * 1.6) % 2) ? 950 : 700, t, 0.02);
    }
  };
  A.setMuted = (m) => { if (master) master.gain.value = m ? 0 : 0.5; };
  return A;
})();
