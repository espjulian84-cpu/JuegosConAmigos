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
function noise(start, dur, vol = 0.15) {
  const a = ac(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const b = a.createBuffer(1, len, a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1800;
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
  invite: () => [660, 880, 990].forEach((f, i) => tone(f, i * 0.1, 0.2, 'sine', 0.16)),
};
export function play(name) {
  if (muted) return;
  try { SOUNDS[name] && SOUNDS[name](); } catch {}
}
