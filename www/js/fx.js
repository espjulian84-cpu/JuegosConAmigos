// Efectos visuales: confeti, carteles animados y animación de movimiento (FLIP).

export function confetti(amount = 140) {
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  document.body.appendChild(cv);
  const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
  const g = cv.getContext('2d');
  const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff70a6', '#00e5ff'];
  const ps = Array.from({ length: amount }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    s: 6 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[(Math.random() * colors.length) | 0], shape: Math.random() < 0.3 ? 'c' : 'r',
  }));
  let t = 0;
  (function frame() {
    g.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      if (p.shape === 'c') { g.beginPath(); g.arc(0, 0, p.s / 2, 0, 7); g.fill(); } else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      g.restore();
    }
    if (++t < 200) requestAnimationFrame(frame); else cv.remove();
  })();
}

export function banner(text, emoji = '✨', kind = 'special') {
  document.querySelectorAll('.fxbanner').forEach((b) => b.remove());
  const d = document.createElement('div');
  d.className = `fxbanner ${kind}`;
  d.innerHTML = `<div class="fxemoji">${emoji}</div><div class="fxtext"></div>`;
  d.querySelector('.fxtext').textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.classList.add('out'), 1700);
  setTimeout(() => d.remove(), 2200);
}

export function shake(el) {
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
}

// FLIP: guarda dónde estaba cada elemento [data-flip] y, tras redibujar, lo desliza desde ahí.
export function snapshot(root) {
  const m = new Map();
  root.querySelectorAll('[data-flip]').forEach((el) => m.set(el.dataset.flip, el.getBoundingClientRect()));
  return m;
}
export function animateFrom(root, before) {
  if (!before || !before.size) return;
  root.querySelectorAll('[data-flip]').forEach((el) => {
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
      [{ transform: `translate(${dx}px,${dy}px)` }, { transform: `translate(${dx / 2}px,${dy / 2 - Math.min(40, dist / 4)}px)`, offset: 0.5 }, { transform: 'translate(0,0)' }],
      { duration: Math.min(700, 300 + dist), easing: 'ease-in-out' },
    );
  });
}
