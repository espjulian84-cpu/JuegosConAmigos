import { esc, PLAYER_COLORS } from '../util.js';

// Mini Bólidos: carreras de cochecitos vistos desde arriba, todos a la vez y en tiempo real.
// El anfitrión simula la física (step) y reparte "fotos" (snapshot) ~15 veces por segundo;
// cada móvil dibuja suavizando entre fotos y solo envía sus mandos (girar, acelerar, frenar).

const WORLD = { w: 1400, h: 1000 };
const HALF_W = 62; // medio ancho de la carretera
const BOT_NAMES = ['Turbo 🤖', 'Chispas 🤖', 'Rayo 🤖', 'Bujía 🤖', 'Pistón 🤖'];

const TRACKS = {
  jardin: { name: '🌼 Jardín', pts: [[200, 250], [600, 150], [1000, 200], [1250, 400], [1150, 700], [850, 650], [650, 800], [350, 880], [150, 650]] },
  cocina: { name: '🍳 Cocina', pts: [[220, 200], [700, 170], [1180, 220], [1230, 500], [920, 540], [860, 720], [1200, 860], [700, 900], [260, 860], [170, 520]] },
  playa: { name: '🏖️ Playa', pts: [[300, 190], [1100, 190], [1260, 500], [1100, 810], [700, 680], [300, 810], [140, 500]] },
};

// línea central suavizada (Catmull-Rom) cada ~8 px
const CENTER = {};
for (const [id, t] of Object.entries(TRACKS)) {
  const P = t.pts, out = [];
  for (let i = 0; i < P.length; i++) {
    const p0 = P[(i - 1 + P.length) % P.length], p1 = P[i], p2 = P[(i + 1) % P.length], p3 = P[(i + 2) % P.length];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(8, Math.round(len / 8));
    for (let k = 0; k < steps; k++) {
      const u = k / steps, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  CENTER[id] = out;
}

const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function nearest(C, x, y, hint) {
  const M = C.length;
  let best = hint, bd = Infinity;
  const range = hint == null ? M : 40;
  const start = hint == null ? 0 : hint - range;
  for (let k = start; k <= (hint == null ? M - 1 : hint + range); k++) {
    const i = ((k % M) + M) % M;
    const d = (C[i][0] - x) ** 2 + (C[i][1] - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: Math.sqrt(bd) };
}

export default {
  id: 'carrera',
  name: 'Mini Bólidos',
  icon: '🏎️',
  color: '#fa5252',
  minPlayers: 1,
  maxPlayers: 6,
  realtime: true,
  blurb: 'Carreras de cochecitos en tiempo real: cada uno conduce el suyo desde su móvil. ¡Todos a la vez!',
  options: [
    { id: 'track', label: '🗺️ Circuito', type: 'choice', def: 'jardin', choices: Object.entries(TRACKS).map(([v, t]) => ({ v, label: t.name })) },
    { id: 'laps', label: '🔁 Vueltas', type: 'choice', def: 4, choices: [{ v: 2, label: '2' }, { v: 4, label: '4' }, { v: 6, label: '6' }, { v: 10, label: '10' }] },
    { id: 'bots', label: '🤖 Coches de la máquina', type: 'choice', def: 2, choices: [{ v: 0, label: 'Ninguno' }, { v: 1, label: '1' }, { v: 2, label: '2' }, { v: 3, label: '3' }, { v: 5, label: 'Llenar' }] },
  ],
  rules: `
    <ol>
      <li>Cada jugador conduce su coche desde su móvil, <b>todos a la vez</b>.</li>
      <li>Mandos: <b>◀ ▶</b> para girar (abajo a la izquierda), <b>⛽</b> para acelerar y <b>🛑</b> para frenar o ir marcha atrás (abajo a la derecha). En ordenador, con las flechas del teclado.</li>
      <li>Si te sales de la carretera vas mucho más lento. ¡Cuidado con los empujones de los demás coches!</li>
      <li>Gana quien complete antes todas las vueltas. Puedes rellenar la carrera con coches de la máquina 🤖.</li>
    </ol>`,

  setup(n, opts = {}) {
    const o = opts.options || {};
    const track = TRACKS[o.track] ? o.track : 'jardin';
    const C = CENTER[track];
    const botsWanted = o.bots == null ? 2 : o.bots;
    const total = Math.min(6, n + botsWanted);
    const a0 = Math.atan2(C[1][1] - C[0][1], C[1][0] - C[0][0]);
    const cars = [];
    for (let k = 0; k < total; k++) {
      // parrilla de salida: filas de 2 detrás de la línea
      const back = 8 + Math.floor(k / 2) * 5;
      const base = C[(C.length - back) % C.length];
      const side = (k % 2 ? 1 : -1) * 24;
      const nx = -Math.sin(a0), ny = Math.cos(a0);
      cars.push({ x: base[0] + nx * side, y: base[1] + ny * side, a: a0, vx: 0, vy: 0, idx: (C.length - back) % C.length, lap: -1, fin: null, bot: k >= n || (opts.local && k > 0), skill: 0.86 + Math.random() * 0.1, drift: 0, off: 0 });
    }
    return { n: total, humans: n, track, laps: o.laps || 4, t: -3.6, cars, order: [], v: 0, phase: 'count', names: cars.map((c, k) => (k >= n ? BOT_NAMES[(k - n) % BOT_NAMES.length] : null)) };
  },
  turnOf: () => null,
  isOver: (s) => !!s.over,
  action(s) { return s; }, // todo ocurre en tiempo real (step)

  // ---------- simulación (solo el anfitrión) ----------
  step(s, inputs, dt) {
    const C = CENTER[s.track];
    const M = C.length;
    s.t += dt;
    s.ev = s.ev || [];
    if (s.phase === 'count' && s.t >= 0) { s.phase = 'race'; s.ev.push(['go']); }
    s.cars.forEach((c, k) => {
      let inp = inputs[k] || { steer: 0, gas: 0, brake: 0 };
      if (c.bot || c.fin != null) {
        const target = C[(c.idx + 16) % M];
        const want = Math.atan2(target[1] - c.y, target[0] - c.x);
        const d = angDiff(c.a, want);
        const speed = Math.hypot(c.vx, c.vy);
        inp = { steer: Math.max(-1, Math.min(1, d * 2.2)), gas: c.fin != null ? 0.4 : 1, brake: Math.abs(d) > 0.8 && speed > 200 ? 1 : 0 };
      }
      if (s.phase !== 'race') inp = { steer: 0, gas: 0, brake: 0 };
      const speed = Math.hypot(c.vx, c.vy);
      const fwd = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
      // giro (depende de la velocidad)
      c.a += inp.steer * 3.1 * Math.min(1, speed / 110) * Math.sign(fwd || 1) * dt;
      // motor y freno
      const near = nearest(C, c.x, c.y, c.idx);
      c.off = near.d > HALF_W ? 1 : 0;
      const maxV = (c.off ? 150 : 340) * (c.bot ? c.skill : 1);
      let acc = 0;
      if (inp.gas) acc += 560 * inp.gas;
      if (inp.brake) acc -= fwd > 20 ? 900 : 300;
      c.vx += Math.cos(c.a) * acc * dt;
      c.vy += Math.sin(c.a) * acc * dt;
      // agarre: la velocidad lateral se va perdiendo (derrape)
      const fwd2 = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
      const lat = -c.vx * Math.sin(c.a) + c.vy * Math.cos(c.a);
      const grip = c.off ? 4 : 7;
      const newLat = lat * Math.max(0, 1 - grip * dt);
      const newFwd = fwd2 * (1 - (c.off ? 1.6 : 0.35) * dt);
      c.vx = Math.cos(c.a) * newFwd - Math.sin(c.a) * newLat;
      c.vy = Math.sin(c.a) * newFwd + Math.cos(c.a) * newLat;
      const sp2 = Math.hypot(c.vx, c.vy);
      if (sp2 > maxV) { c.vx *= maxV / sp2; c.vy *= maxV / sp2; }
      if (newFwd < -120) { const f = -120 / newFwd; c.vx *= f; c.vy *= f; }
      c.drift = Math.abs(lat) > 70 || (inp.brake && fwd2 > 120) ? 1 : 0;
      c.x += c.vx * dt; c.y += c.vy * dt;
      // valla: rebote
      if (c.x < 34 || c.x > WORLD.w - 34) { c.x = Math.max(34, Math.min(WORLD.w - 34, c.x)); c.vx *= -0.45; if (Math.abs(c.vx) > 40) s.ev.push(['bump', Math.round(c.x), Math.round(c.y)]); }
      if (c.y < 34 || c.y > WORLD.h - 34) { c.y = Math.max(34, Math.min(WORLD.h - 34, c.y)); c.vy *= -0.45; if (Math.abs(c.vy) > 40) s.ev.push(['bump', Math.round(c.x), Math.round(c.y)]); }
      // vueltas
      const ni = nearest(C, c.x, c.y, c.idx).i;
      if (c.idx > M - 40 && ni < 40) {
        c.lap++;
        if (c.lap >= s.laps && c.fin == null) {
          c.fin = s.t; s.order.push(k);
          s.ev.push(['fin', k, s.order.length]);
        } else if (c.fin == null) s.ev.push(['lap', k, c.lap + 1]);
      } else if (c.idx < 40 && ni > M - 40) c.lap--;
      c.idx = ni;
    });
    // choques entre coches
    for (let i = 0; i < s.cars.length; i++) for (let j = i + 1; j < s.cars.length; j++) {
      const a = s.cars[i], b = s.cars[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 28) {
        const nx = dx / d, ny = dy / d, push = (28 - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          a.vx += nx * rel * 0.8; a.vy += ny * rel * 0.8; b.vx -= nx * rel * 0.8; b.vy -= ny * rel * 0.8;
          if (rel < -60) s.ev.push(['bump', Math.round((a.x + b.x) / 2), Math.round((a.y + b.y) / 2)]);
        }
      }
    }
    // fin: todas las personas han llegado, o 25 s después del primero
    const humansDone = s.cars.every((c, k) => c.bot || c.fin != null);
    if (s.order.length && (humansDone || s.t - s.cars[s.order[0]].fin > 25)) {
      s.cars.forEach((c, k) => { if (c.fin == null) s.order.push(k); });
      s.over = true; s.phase = 'done';
      s.winner = s.order.find((k) => k < s.humans) ?? 0;
      s.fx = { id: s.v + 1, type: 'win', seat: s.winner, text: '¡Bandera a cuadros!', emoji: '🏁' };
    }
    return s;
  },

  snapshot(s) {
    const ev = s.ev || []; s.ev = [];
    const prog = (c) => (c.fin != null ? 1e6 - c.fin : c.lap * 10000 + c.idx);
    const rank = s.cars.map((c, k) => k).sort((a, b) => prog(s.cars[b]) - prog(s.cars[a]));
    return {
      t: +s.t.toFixed(2), ph: s.phase, laps: s.laps, track: s.track, rank,
      c: s.cars.map((c) => [Math.round(c.x), Math.round(c.y), +c.a.toFixed(3), c.lap, c.fin != null ? 1 : 0, c.off, c.drift, Math.round(Math.hypot(c.vx, c.vy))]),
      ev,
    };
  },

  bot() { return { type: 'noop' }; },

  // ---------- dibujo ----------
  onSnap(snap) { RT.push(snap); },

  render(el, s, ctx) {
    const nameOf = (k) => (k < s.humans ? ctx.players[k] : s.names[k]);
    if (s.over) {
      RT.stop();
      el.innerHTML = `<div class="podium">${s.order.map((k, i) => `
        <div class="prow p${i}" style="--pc:${PLAYER_COLORS[k % 6]}"><span class="ppos">${['🥇', '🥈', '🥉'][i] || i + 1 + 'º'}</span>
        <span class="avatar">${k < s.humans ? ctx.avatar(k) : '🤖'}</span><b>${esc(nameOf(k))}</b>
        <span class="ptime">${s.cars[k].fin != null ? s.cars[k].fin.toFixed(1) + ' s' : 'no terminó'}</span></div>`).join('')}</div>`;
      return;
    }
    el.innerHTML = `
      <div class="race-wrap"><canvas class="race"></canvas>
        <div class="race-hud"><span class="hud-pos">-</span><span class="hud-lap">Vuelta 1/${s.laps}</span></div>
        <div class="race-msg"></div>
      </div>
      <div class="pad">
        <div class="padl"><button data-k="left">◀</button><button data-k="right">▶</button></div>
        <div class="padr"><button data-k="brake" class="brake">🛑</button><button data-k="gas" class="gas">⛽</button></div>
      </div>`;
    RT.start(el, s, ctx, nameOf);
  },
};

// ---------- motor de dibujo en el móvil ----------
const RT = {
  buf: [], loop: null,
  push(snap) {
    this.buf.push({ at: performance.now(), s: snap });
    if (this.buf.length > 6) this.buf.shift();
    if (snap.ev) snap.ev.forEach((e) => this.event(e));
  },
  stop() { cancelAnimationFrame(this.loop); this.loop = null; if (this.ctx) this.ctx.sound('stopEngine'); },
  event(e) {
    if (!this.ctx) return;
    const { sound } = this.ctx;
    if (e[0] === 'go') { sound('start'); this.msg('¡YA! 🏁', 900); }
    if (e[0] === 'bump') { this.parts.push(...sparks(e[1], e[2])); sound('bump'); }
    if (e[0] === 'lap' && e[1] === this.me) { sound('special'); this.msg(e[2] === this.laps ? '¡Última vuelta! 🔔' : `Vuelta ${e[2]}`, 1300); }
    if (e[0] === 'fin' && e[1] === this.me) { sound('win'); this.msg(`¡Llegada! ${e[2]}º 🏁`, 3000); this.ctx.fx.confetti(120); }
  },
  msg(t, ms) {
    const m = this.el && this.el.querySelector('.race-msg');
    if (!m) return;
    m.textContent = t; m.classList.remove('show'); void m.offsetWidth; m.classList.add('show');
    clearTimeout(this.msgT); this.msgT = setTimeout(() => m.classList.remove('show'), ms);
  },
  start(el, s, ctx, nameOf) {
    this.stop();
    this.el = el; this.ctx = ctx; this.me = ctx.mySeat ?? -1; this.laps = s.laps; this.nameOf = nameOf; this.parts = [];
    this.n = s.n;
    const cv = el.querySelector('canvas.race');
    const g = cv.getContext('2d');
    this.track = makeTrackCanvas(s.track);
    this.marks = document.createElement('canvas');
    this.marks.width = WORLD.w; this.marks.height = WORLD.h;
    const mg = this.marks.getContext('2d');
    // mandos táctiles y teclado
    const input = { steer: 0, gas: 0, brake: 0 };
    const keys = { left: 0, right: 0, gas: 0, brake: 0 };
    let lastSent = '';
    const sync = () => {
      input.steer = keys.right - keys.left; input.gas = keys.gas; input.brake = keys.brake;
      const k = JSON.stringify(input);
      if (k !== lastSent) { lastSent = k; ctx.sendInput({ ...input }); }
    };
    el.querySelectorAll('.pad [data-k]').forEach((b) => {
      const k = b.dataset.k;
      const on = (e) => { e.preventDefault(); keys[k] = 1; b.classList.add('on'); sync(); try { navigator.vibrate && navigator.vibrate(8); } catch {} };
      const off = (e) => { e.preventDefault(); keys[k] = 0; b.classList.remove('on'); sync(); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'gas', ArrowDown: 'brake', a: 'left', d: 'right', w: 'gas', s: 'brake' };
    const kd = (e) => { if (KEYMAP[e.key] && el.isConnected) { keys[KEYMAP[e.key]] = 1; sync(); e.preventDefault(); } };
    const ku = (e) => { if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = 0; sync(); } };
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    const resend = setInterval(() => { if (!el.isConnected) { clearInterval(resend); return; } ctx.sendInput({ ...input }); }, 400);

    let cam = null;
    const frame = () => {
      if (!cv.isConnected) { removeEventListener('keydown', kd); removeEventListener('keyup', ku); clearInterval(resend); ctx.sound('stopEngine'); return; }
      this.loop = requestAnimationFrame(frame);
      const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      const snap = this.interp();
      if (!snap) return;
      const cars = snap.c;
      const meCar = cars[this.me] || cars[snap.rank[0]];
      // cámara que sigue a tu coche (algo adelantada)
      const zoom = Math.max(0.55, Math.min(1.25, W / 560));
      const lookX = meCar[0] + Math.cos(meCar[2]) * meCar[7] * 0.25, lookY = meCar[1] + Math.sin(meCar[2]) * meCar[7] * 0.25;
      cam = cam ? { x: cam.x + (lookX - cam.x) * 0.12, y: cam.y + (lookY - cam.y) * 0.12 } : { x: lookX, y: lookY };
      const hw = W / 2 / zoom, hh = H / 2 / zoom;
      cam.x = WORLD.w > hw * 2 ? Math.max(hw - 30, Math.min(WORLD.w - hw + 30, cam.x)) : WORLD.w / 2;
      cam.y = WORLD.h > hh * 2 ? Math.max(hh - 30, Math.min(WORLD.h - hh + 30, cam.y)) : WORLD.h / 2;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#2b8a3e'; g.fillRect(0, 0, W, H);
      g.save();
      g.translate(W / 2, H / 2); g.scale(zoom, zoom); g.translate(-cam.x, -cam.y);
      g.drawImage(this.track, 0, 0);
      // marcas de derrape
      cars.forEach((c) => {
        if (!c[6] || c[7] < 60) return;
        mg.fillStyle = c[5] ? 'rgba(90,60,30,.25)' : 'rgba(30,30,30,.28)';
        for (const s2 of [-1, 1]) {
          const wx = c[0] - Math.cos(c[2]) * 12 + Math.cos(c[2] + Math.PI / 2) * 8 * s2, wy = c[1] - Math.sin(c[2]) * 12 + Math.sin(c[2] + Math.PI / 2) * 8 * s2;
          mg.beginPath(); mg.arc(wx, wy, 3, 0, 7); mg.fill();
        }
        if (Math.random() < 0.4) this.parts.push({ x: c[0] - Math.cos(c[2]) * 16, y: c[1] - Math.sin(c[2]) * 16, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 30, max: 30, kind: c[5] ? 'dirt' : 'smoke' });
      });
      cars.forEach((c) => { if (c[5] && c[7] > 50 && Math.random() < 0.5) this.parts.push({ x: c[0] - Math.cos(c[2]) * 14, y: c[1] - Math.sin(c[2]) * 14, vx: -Math.cos(c[2]) * 40 + (Math.random() - 0.5) * 40, vy: -Math.sin(c[2]) * 40 + (Math.random() - 0.5) * 40, life: 26, max: 26, kind: 'dirt' }); });
      g.drawImage(this.marks, 0, 0);
      // partículas
      this.parts = this.parts.filter((p) => {
        p.x += p.vx / 60; p.y += p.vy / 60; p.life--;
        const k = p.life / p.max;
        if (p.kind === 'spark') { g.fillStyle = `rgba(255,${180 + 70 * k | 0},60,${k})`; g.fillRect(p.x, p.y, 3, 3); }
        else { g.fillStyle = p.kind === 'dirt' ? `rgba(140,100,60,${k * 0.6})` : `rgba(200,200,200,${k * 0.5})`; g.beginPath(); g.arc(p.x, p.y, 4 + (1 - k) * 8, 0, 7); g.fill(); }
        return p.life > 0;
      });
      // coches (primero los de detrás)
      cars.map((c, k) => k).sort((a, b) => (a === this.me) - (b === this.me)).forEach((k) => drawCar(g, cars[k], PLAYER_COLORS[k % 6], k === this.me));
      // nombres
      g.font = '700 13px "Baloo 2", system-ui'; g.textAlign = 'center';
      cars.forEach((c, k) => { const nm = this.nameOf(k) || ''; g.fillStyle = 'rgba(0,0,0,.55)'; const w = g.measureText(nm).width + 10; g.fillRect(c[0] - w / 2, c[1] - 36, w, 16); g.fillStyle = '#fff'; g.fillText(nm, c[0], c[1] - 24); });
      g.restore();
      // minimapa
      drawMinimap(g, snap, W, this.me);
      // cuenta atrás
      if (snap.ph === 'count') {
        const n = Math.ceil(-snap.t);
        if (n !== this.lastCount && n >= 1 && n <= 3) { this.lastCount = n; ctx.sound('beep'); }
        g.font = `800 ${Math.min(W, H) * 0.3}px "Baloo 2", system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.5)'; g.fillStyle = ['#ffd43b', '#ff922b', '#fa5252'][n - 1] || '#fff';
        if (n >= 1 && n <= 3) { g.strokeText(n, W / 2, H / 2); g.fillText(n, W / 2, H / 2); }
      }
      // marcador
      const pos = snap.rank.indexOf(this.me) + 1;
      const hp = el.querySelector('.hud-pos'), hl = el.querySelector('.hud-lap');
      if (hp && this.me >= 0) { hp.textContent = `${pos}º / ${cars.length}`; hl.textContent = cars[this.me][4] ? '🏁 ¡Llegaste!' : `Vuelta ${Math.min(snap.laps, Math.max(1, cars[this.me][3] + 1))}/${snap.laps}`; }
      if (this.me >= 0) ctx.sound('engine:' + cars[this.me][7]);
    };
    this.loop = requestAnimationFrame(frame);
  },
  // posición suavizada entre las dos últimas fotos (con 100 ms de retraso)
  interp() {
    const b = this.buf;
    if (!b.length) return null;
    const t = performance.now() - 100;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].at > t) i--;
    const A = b[Math.max(0, i - 1)], B = b[i];
    if (A === B || B.at <= A.at) return B.s;
    const u = Math.max(0, Math.min(1, (t - A.at) / (B.at - A.at)));
    return { ...B.s, c: B.s.c.map((c, k) => { const o = A.s.c[k] || c; return [o[0] + (c[0] - o[0]) * u, o[1] + (c[1] - o[1]) * u, o[2] + angDiff(o[2], c[2]) * u, c[3], c[4], c[5], c[6], c[7]]; }) };
  },
};

function sparks(x, y) {
  return Array.from({ length: 14 }, () => ({ x, y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 20, max: 20, kind: 'spark' }));
}

function drawCar(g, c, color, mine) {
  const [x, y, a] = c;
  g.save();
  g.translate(x, y); g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(g, -17, -9, 38, 22, 6); g.fill(); // sombra
  g.fillStyle = '#222';
  [[-12, -12], [8, -12], [-12, 8], [8, 8]].forEach(([wx, wy]) => roundRect(g, wx, wy, 10, 5, 2) || g.fill());
  const grd = g.createLinearGradient(0, -10, 0, 10);
  grd.addColorStop(0, shadeHex(color, 0.35)); grd.addColorStop(0.5, color); grd.addColorStop(1, shadeHex(color, -0.4));
  g.fillStyle = grd; roundRect(g, -18, -10, 36, 20, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#1c2a3a'; roundRect(g, 0, -7, 9, 14, 3); g.fill(); // parabrisas
  g.fillStyle = 'rgba(160,210,255,.55)'; roundRect(g, 1.5, -5.5, 3, 11, 1.5); g.fill();
  g.fillStyle = shadeHex(color, 0.2); roundRect(g, -10, -6, 9, 12, 3); g.fill(); // techo
  g.fillStyle = '#fff3bf'; g.fillRect(16, -8, 2.5, 4); g.fillRect(16, 4, 2.5, 4); // faros
  g.fillStyle = '#fa5252'; g.fillRect(-18.5, -8, 2, 4); g.fillRect(-18.5, 4, 2, 4);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(-16, -1.2, 30, 2.4); // raya
  g.restore();
  if (mine) { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 26, 0, 7); g.stroke(); }
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawMinimap(g, snap, W, me) {
  const C = CENTER[snap.track];
  const s = 110 / WORLD.w, ox = W - 120, oy = 10;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(g, ox - 6, oy - 4, 122, WORLD.h * s + 10, 10); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; g.lineJoin = 'round';
  g.beginPath(); C.forEach(([x, y], i) => (i ? g.lineTo(ox + x * s, oy + y * s) : g.moveTo(ox + x * s, oy + y * s))); g.closePath(); g.stroke();
  snap.c.forEach((c, k) => { g.fillStyle = PLAYER_COLORS[k % 6]; g.beginPath(); g.arc(ox + c[0] * s, oy + c[1] * s, k === me ? 5 : 3.5, 0, 7); g.fill(); if (k === me) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); } });
  g.restore();
}

// ---------- circuito dibujado una vez (fondo, carretera, bordillos, decorados) ----------
const TRACK_CACHE = {};
function makeTrackCanvas(id) {
  if (TRACK_CACHE[id]) return TRACK_CACHE[id];
  const cv = document.createElement('canvas');
  cv.width = WORLD.w; cv.height = WORLD.h;
  const g = cv.getContext('2d');
  const C = CENTER[id];
  const T = {
    jardin: { bg: ['#69db7c', '#40c057'], road: '#c9a66b', edge: '#8d6e63', curb: ['#fff', '#e03131'], deco: ['🌼', '🌷', '🍄', '🐞', '🐌', '🌻', '🪨', '🐝', '🌳', '🦋'] },
    cocina: { bg: ['#d9a066', '#b07b47'], road: '#5c5f66', edge: '#343a40', curb: ['#fff', '#1c7ed6'], deco: ['☕', '🥐', '🍳', '🍓', '🥄', '🍪', '🧀', '🍌', '🥛', '🍞'] },
    playa: { bg: ['#ffe8a1', '#fcc419'], road: '#d9b26b', edge: '#a07a40', curb: ['#fff', '#f76707'], deco: ['🐚', '🦀', '⛱️', '🏖️', '🌴', '⭐', '🪣', '🐢', '🍉', '🦞'] },
  }[id];
  // fondo con textura
  const bg = g.createRadialGradient(WORLD.w / 2, WORLD.h / 2, 100, WORLD.w / 2, WORLD.h / 2, 900);
  bg.addColorStop(0, T.bg[0]); bg.addColorStop(1, T.bg[1]);
  g.fillStyle = bg; g.fillRect(0, 0, WORLD.w, WORLD.h);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (id === 'cocina') { g.strokeStyle = 'rgba(80,40,10,.18)'; g.lineWidth = 3; for (let y = 0; y < WORLD.h; y += 26) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= WORLD.w; x += 50) g.lineTo(x, y + Math.sin(x / 90 + y) * 5); g.stroke(); } }
  else for (let k = 0; k < 2500; k++) { g.fillStyle = id === 'playa' ? 'rgba(160,110,20,.15)' : 'rgba(20,90,30,.18)'; g.fillRect(rnd() * WORLD.w, rnd() * WORLD.h, 2, id === 'playa' ? 2 : 6); }
  if (id === 'playa') { g.fillStyle = '#4dabf7'; g.beginPath(); g.moveTo(0, WORLD.h); g.lineTo(0, 930); for (let x = 0; x <= WORLD.w; x += 40) g.lineTo(x, 940 + Math.sin(x / 60) * 12); g.lineTo(WORLD.w, WORLD.h); g.fill(); }
  const path = () => { g.beginPath(); C.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  // sombra, bordillo a rayas, borde y asfalto
  path(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = HALF_W * 2 + 30; g.stroke();
  path(); g.strokeStyle = T.curb[0]; g.lineWidth = HALF_W * 2 + 18; g.stroke();
  path(); g.setLineDash([22, 22]); g.strokeStyle = T.curb[1]; g.lineWidth = HALF_W * 2 + 18; g.stroke(); g.setLineDash([]);
  path(); g.strokeStyle = T.edge; g.lineWidth = HALF_W * 2 + 4; g.stroke();
  path(); g.strokeStyle = T.road; g.lineWidth = HALF_W * 2; g.stroke();
  // línea central discontinua
  path(); g.setLineDash([26, 30]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4; g.stroke(); g.setLineDash([]);
  // línea de meta a cuadros
  const [x0, y0] = C[0], [x1, y1] = C[1];
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.save(); g.translate(x0, y0); g.rotate(a);
  for (let i = -HALF_W; i < HALF_W; i += 12) for (let j = 0; j < 3; j++) { g.fillStyle = ((i / 12 + j) | 0) % 2 ? '#fff' : '#111'; g.fillRect(-6 + j * 6 - 9, i, 6, 12); }
  g.restore();
  // decorados fuera de la carretera
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = 0, placed = 0; k < 400 && placed < 46; k++) {
    const x = 40 + rnd() * (WORLD.w - 80), y = 40 + rnd() * (WORLD.h - 80);
    if (nearest(C, x, y).d < HALF_W + 50) continue;
    const size = 34 + rnd() * 50;
    g.font = `${size}px system-ui, 'Noto Color Emoji'`;
    g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.8);
    g.fillStyle = '#000';
    g.globalAlpha = 0.22; g.fillText(T.deco[placed % T.deco.length], 6, 9);
    g.globalAlpha = 1; g.fillText(T.deco[placed % T.deco.length], 0, 0); g.restore();
    placed++;
  }
  // valla de madera alrededor
  g.lineWidth = 26; g.strokeStyle = '#8d5524'; g.strokeRect(13, 13, WORLD.w - 26, WORLD.h - 26);
  g.setLineDash([18, 14]); g.lineWidth = 8; g.strokeStyle = '#c08552'; g.strokeRect(13, 13, WORLD.w - 26, WORLD.h - 26); g.setLineDash([]);
  TRACK_CACHE[id] = cv;
  return cv;
}
