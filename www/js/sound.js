// Efectos de sonido sintetizados (sin archivos de audio).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('muted') === '1'; } catch {}
export const isMuted = () => muted;
export function toggleMute() { muted = !muted; try { localStorage.setItem('muted', muted ? '1' : '0'); } catch {} return muted; }

function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, start, dur, type = 'sine', vol = 0.18, slideTo) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(start, dur, vol = 0.15, freq = 1800, type = 'bandpass', sweepTo) {
  const a = ac(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const b = a.createBuffer(1, len, a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, a.currentTime + start);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, a.currentTime + start + dur);
  src.buffer = b; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

const SOUNDS = {
  dice: () => { for (let i = 0; i < 5; i++) noise(i * 0.07, 0.05, 0.25); },
  move: () => tone(520, 0, 0.12, 'triangle', 0.2, 780),
  place: () => { tone(300, 0, 0.08, 'square', 0.08); tone(200, 0.05, 0.1, 'triangle', 0.15); },
  capture: () => { tone(880, 0, 0.12, 'square', 0.12, 440); tone(440, 0.12, 0.25, 'sawtooth', 0.1, 110); },
  special: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.18, 'triangle', 0.16)),
  bad: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.22, 'sine', 0.18)),
  turn: () => { tone(880, 0, 0.12, 'sine', 0.15); tone(1320, 0.1, 0.18, 'sine', 0.12); },
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, i === 5 ? 0.6 : 0.2, 'triangle', 0.2)),
  click: () => tone(700, 0, 0.05, 'sine', 0.08),
  boom: () => { noise(0, 0.9, 0.6, 900, 'lowpass', 60); tone(90, 0, 0.6, 'sine', 0.35, 30); },
  splash: () => { noise(0, 0.5, 0.35, 2500, 'bandpass', 600); noise(0.08, 0.35, 0.2, 4000, 'highpass'); },
  chomp: () => [0, 0.22, 0.44].forEach((t) => { noise(t, 0.08, 0.35, 700, 'lowpass'); tone(180, t, 0.08, 'square', 0.1, 90); }),
  whoosh: () => noise(0, 0.5, 0.3, 300, 'bandpass', 3000),
  honk: () => { tone(420, 0, 0.18, 'sawtooth', 0.12, 360); tone(400, 0.22, 0.25, 'sawtooth', 0.12, 330); },
  bubbles: () => { for (let i = 0; i < 8; i++) tone(300 + Math.random() * 500, i * 0.09, 0.07, 'sine', 0.1, 900); },
  clang: () => { tone(1200, 0, 0.6, 'square', 0.08, 1100); tone(1800, 0, 0.4, 'triangle', 0.08); noise(0, 0.1, 0.3, 3000); },
  firework: () => { noise(0, 0.6, 0.2, 400, 'bandpass', 4000); setTimeout(() => noise(0, 0.5, 0.45, 1200, 'lowpass', 200), 600); },
  zzz: () => [0, 0.4, 0.8].forEach((t) => tone(200, t, 0.3, 'sine', 0.08, 150)),
  flip: () => noise(0, 0.08, 0.25, 3000, 'highpass'),
  launch: () => { noise(0, 0.7, 0.25, 200, 'bandpass', 2500); tone(300, 0, 0.6, 'sawtooth', 0.05, 900); },
  engine: () => tone(110, 0, 0.3, 'sawtooth', 0.05, 160),
  start: () => { tone(880, 0, 0.5, 'square', 0.12); tone(1320, 0, 0.5, 'triangle', 0.1); },
  beep: () => tone(440, 0, 0.25, 'square', 0.1),
  bump: () => { noise(0, 0.15, 0.3, 500, 'lowpass'); tone(120, 0, 0.12, 'square', 0.08, 60); },
  invite: () => [660, 880, 990].forEach((f, i) => tone(f, i * 0.1, 0.2, 'sine', 0.16)),
};
// motor continuo: el tono sube con la velocidad del coche
let eng = null;
function engine(speed) {
  const a = ac(); if (!a) return;
  if (!eng) {
    const o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0.0001;
    o.connect(f); o2.connect(f); f.connect(g).connect(a.destination); o.start(); o2.start();
    eng = { o, o2, g };
  }
  const t = a.currentTime;
  eng.o.frequency.setTargetAtTime(45 + speed * 0.42, t, 0.08);
  eng.o2.frequency.setTargetAtTime(22 + speed * 0.21, t, 0.08);
  eng.g.gain.setTargetAtTime(0.035 + Math.min(0.05, speed / 7000), t, 0.1);
}
function stopEngine() { if (eng) { try { eng.o.stop(); eng.o2.stop(); } catch {} eng = null; } }

export function play(name) {
  if (name === 'stopEngine') { stopEngine(); return; }
  if (muted) { stopEngine(); return; }
  if (name.startsWith('engine:')) { engine(+name.slice(7) || 0); return; }
  try { SOUNDS[name] && SOUNDS[name](); } catch {}
}
