// Motor de efectos visuales: partículas (fuegos artificiales, explosiones, agua, humo,
// destellos), objetos que vuelan en arco, monstruo comefichas, carteles y animación FLIP.

// ------------------------------------------------------------------ partículas
let cv = null, g = null, parts = [], running = false, W = 0, H = 0, DPR = 1;
function ensureCanvas() {
  if (cv && cv.isConnected) return;
  cv = document.createElement('canvas');
  cv.className = 'fxcanvas';
  document.body.appendChild(cv);
  g = cv.getContext('2d');
  resize();
}
function resize() {
  if (!cv) return;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener('resize', resize);

const rand = (a, b) => a + Math.random() * (b - a);
function add(p) { ensureCanvas(); parts.push(p); if (!running) { running = true; requestAnimationFrame(loop); } }

function loop() {
  g.clearRect(0, 0, W, H);
  const next = [];
  for (const p of parts) {
    p.t++;
    if (p.delay > 0) { p.delay--; next.push(p); continue; }
    if (p.update && p.update(p) === false) continue;
    p.vx *= p.drag ?? 0.985; p.vy *= p.drag ?? 0.985;
    p.vy += p.grav ?? 0;
    p.x += p.vx; p.y += p.vy;
    p.life--;
    if (p.life <= 0) { p.onDie && p.onDie(p); continue; }
    draw(p);
    next.push(p);
  }
  parts = next;
  if (parts.length) requestAnimationFrame(loop);
  else { running = false; g.clearRect(0, 0, W, H); }
}

function draw(p) {
  const k = p.life / p.max; // 1 → 0
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, p.alpha ? p.alpha(k) : k));
  switch (p.kind) {
    case 'spark': { // chispa con estela luminosa
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = p.c; g.lineWidth = p.s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(p.x - p.vx * 3, p.y - p.vy * 3); g.lineTo(p.x, p.y); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, p.s * 0.45, 0, 7); g.fill();
      break;
    }
    case 'glow': {
      g.globalCompositeOperation = 'lighter';
      const r = p.s * (p.grow ? 1 + (1 - k) * p.grow : 1);
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, p.c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      break;
    }
    case 'smoke': {
      const r = p.s * (1 + (1 - k) * 2.2);
      g.globalAlpha *= 0.55;
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, p.c); gr.addColorStop(1, 'rgba(80,80,80,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      break;
    }
    case 'drop': { // gota de agua alargada
      const a = Math.atan2(p.vy, p.vx);
      g.translate(p.x, p.y); g.rotate(a);
      g.fillStyle = p.c; g.beginPath(); g.ellipse(0, 0, p.s * 1.8, p.s, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(p.s * 0.5, -p.s * 0.3, p.s * 0.35, 0, 7); g.fill();
      break;
    }
    case 'ring': {
      const r = p.s + (1 - k) * p.grow;
      g.strokeStyle = p.c; g.lineWidth = 3 * k + 0.5;
      g.beginPath(); g.ellipse(p.x, p.y, r, r * (p.flat || 1), 0, 0, 7); g.stroke();
      break;
    }
    case 'debris': {
      p.rot += p.vr;
      g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-p.s / 2, p.s * 0.1, p.s, p.s * 0.23);
      break;
    }
    case 'confetti': {
      p.rot += p.vr;
      g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.t * 0.2));
      g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      break;
    }
    case 'star': {
      p.rot += 0.08;
      g.globalCompositeOperation = 'lighter';
      g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? p.s * 0.4 : p.s; g.lineTo(Math.cos(i * Math.PI / 5) * r, Math.sin(i * Math.PI / 5) * r); }
      g.closePath(); g.fill();
      break;
    }
    case 'text': {
      g.font = `800 ${p.s}px 'Baloo 2', system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = p.s / 6; g.strokeStyle = 'rgba(0,0,0,.45)'; g.strokeText(p.txt, p.x, p.y);
      g.fillStyle = p.c; g.fillText(p.txt, p.x, p.y);
      break;
    }
    case 'emoji': {
      g.font = `${p.s}px system-ui, 'Noto Color Emoji', sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(p.x, p.y); g.rotate(p.rot || 0);
      g.fillText(p.txt, 0, 0);
      break;
    }
    case 'rocket': {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 3, 0, 7); g.fill();
      break;
    }
  }
  g.restore();
}

const P = (o) => ({ t: 0, vx: 0, vy: 0, s: 4, life: 60, ...o, max: o.life || 60 });
const FW_COLORS = [['#ff4d6d', '#ffccd5'], ['#ffd60a', '#fff3b0'], ['#4cc9f0', '#caf0f8'], ['#80ffdb', '#d8f3dc'], ['#c77dff', '#f3d9ff'], ['#ff9e00', '#ffe8cc']];

/** Explosión de fuegos artificiales en (x,y) */
export function burst(x, y, opts = {}) {
  const [c1, c2] = opts.colors || FW_COLORS[(Math.random() * FW_COLORS.length) | 0];
  const n = opts.count || 70;
  const sp = opts.speed || 6;
  add(P({ kind: 'glow', x, y, s: 60 * (opts.scale || 1), c: c2, life: 18, grow: 1 }));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
    const v = sp * rand(0.55, 1) * (opts.scale || 1);
    add(P({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 0.07, drag: 0.965, s: rand(1.6, 2.8), c: Math.random() < 0.7 ? c1 : c2, life: rand(45, 75) | 0 }));
  }
  // destellos que titilan al final
  for (let i = 0; i < n / 4; i++) {
    const a = rand(0, 7), v = rand(1, sp);
    add(P({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 0.05, drag: 0.95, s: rand(2, 4), c: c2, rot: 0, life: rand(50, 90) | 0, delay: 20, alpha: (k) => (Math.sin(k * 40) > 0 ? k : k * 0.2) }));
  }
}

/** Cohete que sube y estalla */
export function firework(x, y, opts = {}) {
  ensureCanvas();
  const sx = x + rand(-60, 60), sy = H + 10;
  const frames = 38;
  const vx = (x - sx) / frames, vy = (y - sy) / frames;
  add(P({
    kind: 'rocket', x: sx, y: sy, vx, vy, drag: 1, c: '#fff6c2', life: frames, delay: opts.delay || 0,
    update: (p) => { if (p.t % 2 === 0) add(P({ kind: 'spark', x: p.x, y: p.y, vx: rand(-0.4, 0.4), vy: rand(0.5, 1.5), s: 1.5, c: '#ffb703', life: 18, drag: 0.95 })); },
    onDie: () => burst(x, y, opts),
  }));
}

/** Espectáculo de fuegos artificiales sobre un rectángulo (o toda la pantalla) */
export function fireworksShow(rect, n = 6) {
  ensureCanvas();
  const r = rect || { left: 0, top: 0, width: W, height: H * 0.6 };
  for (let i = 0; i < n; i++) {
    firework(r.left + rand(0.15, 0.85) * r.width, r.top + rand(0.15, 0.6) * r.height, { delay: i * 14 + rand(0, 8) | 0, scale: rand(0.8, 1.25) });
  }
}

/** Explosión con fuego, humo y escombros */
export function explosion(x, y, scale = 1) {
  add(P({ kind: 'glow', x, y, s: 90 * scale, c: 'rgba(255,240,180,1)', life: 14, grow: 0.6 }));
  add(P({ kind: 'ring', x, y, s: 10, grow: 90 * scale, c: 'rgba(255,255,255,.9)', life: 22 }));
  for (let i = 0; i < 45 * scale; i++) {
    const a = rand(0, 7), v = rand(2, 9) * scale;
    add(P({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, grav: 0.18, drag: 0.94, s: rand(2, 4), c: ['#ff6b00', '#ffb703', '#ff3c00', '#fff1a8'][i % 4], life: rand(25, 45) | 0 }));
  }
  for (let i = 0; i < 14 * scale; i++) {
    const a = rand(0, 7), v = rand(0.5, 2.5);
    add(P({ kind: 'smoke', x: x + rand(-10, 10), y: y + rand(-10, 10), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2, drag: 0.96, s: rand(10, 20) * scale, c: i < 5 ? 'rgba(255,140,40,.9)' : 'rgba(70,70,70,.9)', life: rand(50, 90) | 0, delay: i < 5 ? 0 : 6 }));
  }
  for (let i = 0; i < 10 * scale; i++) {
    const a = rand(-Math.PI, 0), v = rand(4, 10);
    add(P({ kind: 'debris', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 0.4, s: rand(4, 9), rot: rand(0, 6), vr: rand(-0.4, 0.4), c: ['#5c4033', '#333', '#8d6e63'][i % 3], life: 70 }));
  }
}

/** Salpicadura de agua */
export function splash(x, y, scale = 1) {
  for (let i = 0; i < 3; i++) add(P({ kind: 'ring', x, y, s: 6, grow: (40 + i * 25) * scale, flat: 0.45, c: 'rgba(255,255,255,.9)', life: 40 + i * 12, delay: i * 6 }));
  for (let i = 0; i < 38 * scale; i++) {
    const a = rand(-Math.PI * 0.92, -Math.PI * 0.08), v = rand(3, 9) * scale;
    add(P({ kind: 'drop', x: x + rand(-6, 6), y, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v, grav: 0.32, drag: 0.99, s: rand(1.6, 3.2), c: i % 3 ? '#9ad7ff' : '#e9f8ff', life: 60 }));
  }
  add(P({ kind: 'glow', x, y: y - 8, s: 40 * scale, c: 'rgba(200,240,255,.8)', life: 16 }));
}

/** Burbujas que suben */
export function bubbles(x, y, n = 16, spread = 30) {
  for (let i = 0; i < n; i++) add(P({ kind: 'ring', x: x + rand(-spread, spread), y: y + rand(-5, 10), s: rand(2, 5), grow: 2, c: 'rgba(220,245,255,.9)', vy: -rand(0.6, 1.6), drag: 1, life: rand(40, 80) | 0, delay: rand(0, 50) | 0, update: (p) => { p.x += Math.sin(p.t * 0.2) * 0.4; } }));
}

/** Destellos/estrellitas */
export function sparkle(x, y, color = '#ffe066', n = 18, spread = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 7), v = rand(1, 4) * spread;
    add(P({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.93, s: rand(3, 7), c: color, rot: rand(0, 6), life: rand(30, 55) | 0 }));
  }
}
/** Polvo (al levantar muros, al caer fichas) */
export function dust(x, y, w = 40, color = 'rgba(160,130,100,.9)') {
  for (let i = 0; i < 12; i++) add(P({ kind: 'smoke', x: x + rand(-w / 2, w / 2), y, vx: rand(-1.2, 1.2), vy: -rand(0.2, 1.2), drag: 0.95, s: rand(5, 10), c: color, life: rand(30, 50) | 0 }));
}
/** Texto flotante que sube (+20, ¡ÑAM!…) */
export function floatText(x, y, txt, color = '#fff', size = 34) {
  add(P({ kind: 'text', x, y, vy: -1.6, drag: 0.97, s: size, txt, c: color, life: 70, alpha: (k) => Math.min(1, k * 3) }));
}
/** Emojis que salen disparados (plumas, notas, zzz…) */
export function emojiRain(x, y, txt, n = 8, opts = {}) {
  for (let i = 0; i < n; i++) {
    const a = opts.up ? rand(-2.4, -0.7) : rand(0, 7), v = rand(1, opts.speed || 4);
    add(P({ kind: 'emoji', txt, x: x + rand(-8, 8), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: opts.grav ?? 0.06, drag: 0.97, s: rand(14, opts.size || 26), rot: rand(-0.5, 0.5), life: rand(50, 90) | 0, delay: i * (opts.stagger || 3) }));
  }
}

export function confetti(amount = 160) {
  ensureCanvas();
  const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff70a6', '#00e5ff'];
  for (let i = 0; i < amount; i++) {
    add(P({ kind: 'confetti', x: W / 2 + rand(-W * 0.2, W * 0.2), y: H * 0.35, vx: rand(-8, 8), vy: rand(-15, -4), grav: 0.32, drag: 0.985, s: rand(7, 13), rot: rand(0, 6), vr: rand(-0.3, 0.3), c: colors[i % colors.length], life: rand(120, 190) | 0 }));
  }
}

// ------------------------------------------------------------------ objetos en vuelo
export const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Hace volar un elemento (HTML) desde A hasta B describiendo un arco.
 * opts: arc (altura en px), duration, spin (vueltas), scaleMid (escala en lo alto → sensación de altura),
 *       shadow (sombra que se queda en el suelo), trail(x,y) callback por fotograma.
 */
export function fly(html, from, to, opts = {}) {
  const el = document.createElement('div');
  el.className = 'flyer ' + (opts.cls || '');
  el.innerHTML = html;
  const size = opts.size || 40;
  el.style.width = el.style.height = size + 'px';
  document.body.appendChild(el);
  let sh = null;
  if (opts.shadow) { sh = document.createElement('div'); sh.className = 'flyshadow'; sh.style.width = size * 0.8 + 'px'; document.body.appendChild(sh); }
  const dur = opts.duration || 700;
  const arc = opts.arc ?? 80;
  const t0 = performance.now();
  return new Promise((resolve) => {
    function frame(now) {
      const t = Math.min(1, (now - t0) / dur);
      const e = opts.linear ? t : t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = from.x + (to.x - from.x) * e;
      const yGround = from.y + (to.y - from.y) * e;
      const lift = 4 * arc * e * (1 - e);
      const y = yGround - lift;
      const sc = 1 + (opts.scaleMid || 0) * 4 * e * (1 - e);
      const rot = (opts.spin || 0) * 360 * e;
      el.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px) scale(${sc}) rotate(${rot}deg)`;
      if (sh) { const k = 1 - 0.6 * (lift / Math.max(1, arc)); sh.style.transform = `translate(${x - size * 0.4}px, ${yGround + size * 0.3}px) scale(${k})`; sh.style.opacity = 0.15 + 0.35 * k; }
      if (opts.trail) opts.trail(x, y, t);
      if (t < 1) requestAnimationFrame(frame);
      else { if (!opts.keep) el.remove(); if (sh) sh.remove(); resolve(el); }
    }
    requestAnimationFrame(frame);
  });
}

/** Monstruo comefichas (original): aparece, abre la boca, se zampa la ficha y eructa */
export async function chomp(target, color, victimHTML) {
  const size = Math.max(70, target.w * 2.6);
  const victim = document.createElement('div');
  victim.className = 'flyer victim';
  victim.innerHTML = victimHTML || '';
  victim.style.width = victim.style.height = target.w * 1.1 + 'px';
  victim.style.transform = `translate(${target.x - target.w * 0.55}px, ${target.y - target.w * 0.55}px)`;
  document.body.appendChild(victim);
  const m = document.createElement('div');
  m.className = 'chomper';
  m.style.setProperty('--c', color);
  m.style.width = m.style.height = size + 'px';
  m.innerHTML = `<svg viewBox="-50 -50 100 100">
    <g class="ch-body"><circle r="44" fill="var(--c)" stroke="rgba(0,0,0,.35)" stroke-width="3"/>
      <circle cx="-14" cy="-22" r="10" fill="#fff"/><circle cx="14" cy="-22" r="10" fill="#fff"/>
      <circle class="pupil" cx="-12" cy="-20" r="5" fill="#222"/><circle class="pupil" cx="16" cy="-20" r="5" fill="#222"/>
      <path d="M-30 -36 Q-16 -44 -4 -36" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M4 -36 Q16 -44 30 -36" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="-30" cy="0" rx="7" ry="4" fill="#ff8fab" opacity=".7"/><ellipse cx="30" cy="0" rx="7" ry="4" fill="#ff8fab" opacity=".7"/></g>
    <g class="ch-mouth"><path class="jaw" d="M-30 4 Q0 46 30 4 Z" fill="#5a0f1f"/><path d="M-26 6 L-20 15 L-14 7 L-8 16 L-2 8 L4 16 L10 8 L16 15 L22 7 Z" fill="#fff"/><ellipse class="tongue" cx="0" cy="26" rx="12" ry="7" fill="#ff5d8f"/></g>
  </svg>`;
  document.body.appendChild(m);
  const from = { x: target.x - 120, y: target.y - 60 };
  m.style.transform = `translate(${from.x - size / 2}px, ${from.y - size / 2}px) scale(.2)`;
  await m.animate([
    { transform: `translate(${from.x - size / 2}px, ${from.y - size / 2}px) scale(.2) rotate(-30deg)` },
    { transform: `translate(${target.x - size / 2 - 20}px, ${target.y - size / 2 - 30}px) scale(1.1) rotate(8deg)`, offset: 0.7 },
    { transform: `translate(${target.x - size / 2}px, ${target.y - size / 2}px) scale(1) rotate(0)` },
  ], { duration: 420, easing: 'cubic-bezier(.3,1.4,.6,1)', fill: 'forwards' }).finished;
  m.classList.add('eating');
  victim.animate([{ transform: victim.style.transform + ' scale(1)' }, { transform: victim.style.transform + ' scale(0) rotate(200deg)' }], { duration: 650, easing: 'ease-in', fill: 'forwards' });
  for (let i = 0; i < 3; i++) setTimeout(() => emojiRain(target.x, target.y + 10, '✨', 3, { speed: 3 }), 200 * i);
  await wait(800);
  victim.remove();
  m.classList.remove('eating'); m.classList.add('burp');
  floatText(target.x, target.y - size * 0.6, '¡ÑAM!', '#fff', 40);
  await wait(500);
  await m.animate([{ opacity: 1 }, { opacity: 0, transform: m.style.transform + ` translate(0,-30px) scale(.4)` }], { duration: 350, fill: 'forwards' }).finished;
  m.remove();
}

// ------------------------------------------------------------------ carteles
export function banner(text, emoji = '✨', kind = 'special') {
  document.querySelectorAll('.fxbanner').forEach((b) => b.remove());
  const d = document.createElement('div');
  d.className = `fxbanner ${kind}`;
  d.innerHTML = `<div class="fxemoji">${emoji}</div><div class="fxtext"></div>`;
  d.querySelector('.fxtext').textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.classList.add('out'), 1900);
  setTimeout(() => d.remove(), 2400);
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
}
export function screenShake(strength = 8) {
  const a = document.getElementById('app');
  if (!a) return;
  a.animate([0, 1, 2, 3, 4, 5].map((i) => ({ transform: i === 5 ? 'none' : `translate(${rand(-strength, strength)}px, ${rand(-strength, strength)}px)` })), { duration: 380 });
}
export function flash(color = '#fff') {
  const d = document.createElement('div');
  d.className = 'screenflash'; d.style.background = color;
  document.body.appendChild(d);
  d.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 350 }).finished.then(() => d.remove());
}

// ------------------------------------------------------------------ FLIP
export function snapshot(root) {
  const m = new Map();
  if (!root) return m;
  root.querySelectorAll('[data-flip]').forEach((el) => m.set(el.dataset.flip, el.getBoundingClientRect()));
  return m;
}
export function animateFrom(root, before, skip = []) {
  if (!before || !before.size || !root) return;
  root.querySelectorAll('[data-flip]').forEach((el) => {
    if (skip.includes(el.dataset.flip)) return;
    const old = before.get(el.dataset.flip);
    if (!old) return;
    const now = el.getBoundingClientRect();
    let dx = old.left + old.width / 2 - (now.left + now.width / 2);
    let dy = old.top + old.height / 2 - (now.top + now.height / 2);
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    const svg = el.ownerSVGElement;
    if (svg) { const k = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width; dx *= k; dy *= k; }
    const dist = Math.hypot(dx, dy);
    el.animate(
      [{ transform: `translate(${dx}px,${dy}px)` }, { transform: `translate(${dx / 2}px,${dy / 2 - Math.min(40, dist / 4)}px) scale(1.15)`, offset: 0.5 }, { transform: 'translate(0,0)' }],
      { duration: Math.min(700, 300 + dist), easing: 'ease-in-out' },
    );
  });
}

// ------------------------------------------------------------------ dado 3D que rueda
import { diceCubeHTML, CUBE_ROT } from './util.js';
/** Lanza un dado en 3D desde "fromEl": vuela en arco dando vueltas, rebota y muestra "value". */
export async function roll3D(value, fromEl, toRect, playSound) {
  if (!fromEl) return;
  const a = center(fromEl);
  const r = toRect || { left: 0, top: innerHeight * 0.2, width: innerWidth, height: innerHeight * 0.5 };
  const to = { x: r.left + r.width * (0.35 + Math.random() * 0.3), y: r.top + r.height * (0.35 + Math.random() * 0.3) };
  const size = Math.min(110, Math.max(70, innerWidth * 0.2));
  const wrap = document.createElement('div');
  wrap.className = 'dicefly';
  wrap.style.width = wrap.style.height = size + 'px';
  wrap.innerHTML = `<div class="diceshadow"></div><div class="dicescene">${diceCubeHTML(value)}</div>`;
  document.body.appendChild(wrap);
  const cube = wrap.querySelector('.cube');
  const cs = Math.round(size * 0.7);
  cube.style.setProperty('--s', cs + 'px');
  const [rx, ry] = CUBE_ROT[value];
  const sx = rx - 18 + 360 * (2 + Math.round(Math.random())), sy = ry + 24 + 360 * (2 + Math.round(Math.random()));
  const pos = (x, y, s = 1) => `translate(${x - size / 2}px, ${y - size / 2}px) scale(${s})`;
  const dur = 1150;
  // trayectoria: sale del botón, sube, cae, rebota dos veces y se para
  wrap.animate([
    { transform: pos(a.x, a.y, 0.4), offset: 0 },
    { transform: pos((a.x + to.x) / 2, Math.min(a.y, to.y) - 160, 1.25), offset: 0.38 },
    { transform: pos(to.x, to.y, 1), offset: 0.62 },
    { transform: pos(to.x + 8, to.y - 38, 1.05), offset: 0.74 },
    { transform: pos(to.x + 12, to.y, 1), offset: 0.85 },
    { transform: pos(to.x + 14, to.y - 10, 1.02), offset: 0.92 },
    { transform: pos(to.x + 15, to.y, 1), offset: 1 },
  ], { duration: dur, easing: 'ease-out', fill: 'forwards' });
  cube.animate([
    { transform: `rotateX(${Math.random() * 360}deg) rotateY(${Math.random() * 360}deg) rotateZ(40deg)` },
    { transform: `rotateX(${sx}deg) rotateY(${sy}deg) rotateZ(0deg)` },
  ], { duration: dur * 0.92, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  setTimeout(() => { dust(to.x, to.y + size * 0.4, size * 0.6, 'rgba(255,255,255,.8)'); if (playSound) playSound('place'); }, dur * 0.62);
  setTimeout(() => { if (playSound) playSound('place'); }, dur * 0.85);
  await wait(dur + 650);
  sparkle(to.x + 15, to.y, '#ffe066', 10, 1);
  const b = center(fromEl.isConnected ? fromEl : document.querySelector('.die3d') || fromEl);
  await wrap.animate([{ transform: pos(to.x + 15, to.y, 1), opacity: 1 }, { transform: pos(b.x, b.y, 0.35), opacity: 0.2 }], { duration: 380, easing: 'ease-in', fill: 'forwards' }).finished;
  wrap.remove();
}
