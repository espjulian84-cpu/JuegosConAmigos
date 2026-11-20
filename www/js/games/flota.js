import { clone, esc, fail, pushLog, PLAYER_COLORS, sameTeam, TEAM_EMOJI } from '../util.js';

// Hundir la flota: 2 jugadores (10x10) o 3-4 jugadores todos contra todos o 2 contra 2 (8x8).
// Primero cada uno coloca sus barcos; luego, por turnos, se dispara a una casilla del mar enemigo.
// Tocado → vuelves a disparar. Agua → turno del siguiente. Gana quien conserve barcos a flote.
const NAMES = { 5: 'Portaaviones', 4: 'Acorazado', 3: 'Submarino', 2: 'Lancha' };

function fits(ships, size, sh, skip) {
  const cells = shipCells(sh);
  if (cells.some(([r, c]) => r < 0 || c < 0 || r >= size || c >= size)) return false;
  const occ = new Set();
  ships.forEach((o, k) => { if (k !== skip) shipCells(o).forEach(([r, c]) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) occ.add(`${r + dr},${c + dc}`); }); });
  return cells.every(([r, c]) => !occ.has(`${r},${c}`));
}
export const shipCells = (sh) => Array.from({ length: sh.len }, (_, k) => (sh.dir === 'h' ? [sh.r, sh.c + k] : [sh.r + k, sh.c]));

export function randomFleet(size, lens) {
  for (let tries = 0; tries < 500; tries++) {
    const ships = [];
    let ok = true;
    for (const len of lens) {
      let placed = false;
      for (let k = 0; k < 200 && !placed; k++) {
        const sh = { len, dir: Math.random() < 0.5 ? 'h' : 'v', r: (Math.random() * size) | 0, c: (Math.random() * size) | 0 };
        if (fits(ships, size, sh, -1)) { ships.push(sh); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error('No se pudo colocar la flota');
}

const alive = (s, seat) => s.fleets[seat].some((sh) => !sh.sunk);
const hitAt = (s, seat, r, c) => s.fleets[seat].findIndex((sh) => shipCells(sh).some(([a, b]) => a === r && b === c));
const unit = (s, seat) => (s.teams ? s.teams[seat] : seat);

function nextShooter(s) {
  for (let k = 0; k < s.n; k++) { s.turn = (s.turn + 1) % s.n; if (alive(s, s.turn)) return; }
}
export const targetsOf = (s, seat) => [...Array(s.n).keys()].filter((t) => !sameTeam(s, t, seat) && alive(s, t));

export default {
  id: 'flota',
  name: 'Hundir la flota',
  icon: '⚓',
  color: '#1c7ed6',
  minPlayers: 2,
  maxPlayers: 4,
  teams: 'any',
  hidden: true,
  blurb: 'Batalla naval: esconde tus barcos y bombardea el mar enemigo. ¡Agua, tocado y hundido! Para 2 o 4 jugadores.',
  rules: `
    <ol>
      <li><b>Coloca tu flota</b> en tu mar: toca un barco para elegirlo, toca una casilla para moverlo y "↻ Girar" para ponerlo de pie o tumbado. O pulsa "🔀 Al azar". Los barcos no pueden tocarse.</li>
      <li>Cuando todos estén listos, empieza la batalla.</li>
      <li>En tu turno elige un mar enemigo y <b>dispara</b> a una casilla.</li>
      <li>💦 <b>Agua:</b> pasa el turno. 🔥 <b>Tocado:</b> ¡vuelves a disparar! 💥 <b>Hundido:</b> has destruido el barco entero.</li>
      <li>Con 2 jugadores el mar es de 10×10; con 3 o 4, de 8×8 (todos contra todos o 2 contra 2 por equipos).</li>
      <li>Gana quien conserve algún barco a flote al final.</li>
    </ol>`,

  setup(n, opts = {}) {
    const size = n <= 2 ? 10 : 8;
    const lens = n <= 2 ? [5, 4, 3, 3, 2] : [4, 3, 3, 2];
    return {
      n, size, lens, fleets: Array.from({ length: n }, () => randomFleet(size, lens)), shots: Array.from({ length: n }, () => ({})),
      ready: Array(n).fill(false), phase: 'place', turn: 0, v: 0, log: ['¡Colocad vuestros barcos!'], teams: opts.teams || null,
    };
  },
  turnOf(s) {
    if (s.over) return null;
    if (s.phase === 'place') { const k = s.ready.indexOf(false); return k < 0 ? null : k; }
    return s.turn;
  },
  isOver: (s) => !!s.over,
  viewFor(s, seat) {
    if (s.over) return s;
    // solo ves tus barcos (y los de tu equipo) y los enemigos ya hundidos
    return { ...s, fleets: s.fleets.map((f, k) => (sameTeam(s, k, seat) ? f : f.filter((sh) => sh.sunk))) };
  },

  action(st, seat, a) {
    const s = clone(st);
    s.v++;
    s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (s.phase === 'place') {
      if (s.ready[seat]) fail('Ya estás listo');
      if (a.type === 'random') { s.fleets[seat] = randomFleet(s.size, s.lens); return s; }
      if (a.type === 'move') {
        const sh = s.fleets[seat][a.i];
        if (!sh) fail('Barco no válido');
        const nw = { ...sh, r: a.r, c: a.c, dir: a.dir || sh.dir };
        if (!fits(s.fleets[seat], s.size, nw, a.i)) fail('No cabe ahí (los barcos no pueden tocarse)');
        s.fleets[seat][a.i] = nw;
        return s;
      }
      if (a.type === 'ready') {
        s.ready[seat] = true;
        pushLog(s, `{${seat}} tiene su flota lista`);
        if (s.ready.every(Boolean)) { s.phase = 'battle'; s.turn = 0; pushLog(s, '¡Empieza la batalla!'); s.fx = { id: s.v, type: 'special', text: '¡A la batalla!', emoji: '⚓' }; }
        return s;
      }
      fail('Primero coloca tus barcos');
    }
    if (seat !== s.turn) fail('No es tu turno');
    if (a.type !== 'fire') fail('Acción desconocida');
    const t = a.target;
    if (!targetsOf(s, seat).includes(t)) fail('Ese mar no es un objetivo');
    if (!(a.r >= 0 && a.r < s.size && a.c >= 0 && a.c < s.size)) fail('Fuera del mar');
    const key = `${a.r},${a.c}`;
    if (s.shots[t][key]) fail('Ya has disparado ahí');
    const k = hitAt(s, t, a.r, a.c);
    s.lastShot = { from: seat, target: t, r: a.r, c: a.c };
    if (k < 0) {
      s.shots[t][key] = 'w';
      pushLog(s, `{${seat}} dispara al mar de {${t}}: ¡agua!`);
      s.fx = { id: s.v, type: 'shot', from: seat, target: t, r: a.r, c: a.c, result: 'miss' };
      nextShooter(s);
      return s;
    }
    s.shots[t][key] = 'h';
    const sh = s.fleets[t][k];
    const sunk = shipCells(sh).every(([r, c]) => s.shots[t][`${r},${c}`] === 'h');
    if (!sunk) {
      pushLog(s, `{${seat}} da en un barco de {${t}}: ¡tocado!`);
      s.fx = { id: s.v, type: 'shot', from: seat, target: t, r: a.r, c: a.c, result: 'hit', text: '¡Tocado!', emoji: '🔥', bannerDelay: 1050 };
      return s;
    }
    sh.sunk = true;
    pushLog(s, `{${seat}} hunde el ${NAMES[sh.len] || 'barco'} de {${t}}`);
    s.fx = { id: s.v, type: 'shot', from: seat, target: t, r: a.r, c: a.c, result: 'sunk', ship: k, text: `¡Hundido! ${NAMES[sh.len] || ''}`, emoji: '💥', bannerDelay: 1050 };
    if (!alive(s, t)) pushLog(s, `💀 {${t}} se queda sin flota`);
    const units = new Set([...Array(s.n).keys()].filter((p) => alive(s, p)).map((p) => unit(s, p)));
    if (units.size <= 1) {
      s.over = true; s.winner = seat;
      s.fx = { ...s.fx, type: 'win', result: 'sunk', text: '¡Victoria naval!', emoji: '🏆', bannerDelay: 1600 };
    }
    return s;
  },

  bot(s, seat) {
    if (s.phase === 'place') return { type: 'ready' };
    const ts = targetsOf(s, seat);
    const t = ts[(Math.random() * ts.length) | 0];
    const free = [];
    for (let r = 0; r < s.size; r++) for (let c = 0; c < s.size; c++) if (!s.shots[t][`${r},${c}`]) free.push({ r, c });
    const p = free[(Math.random() * free.length) | 0];
    return { type: 'fire', target: t, r: p.r, c: p.c };
  },

  demo() {
    const s = this.setup(2);
    s.fleets[1] = [{ len: 5, dir: 'h', r: 1, c: 1 }, { len: 4, dir: 'v', r: 4, c: 8 }, { len: 3, dir: 'h', r: 7, c: 1 }, { len: 3, dir: 'v', r: 3, c: 3 }, { len: 2, dir: 'h', r: 5, c: 5 }];
    s.fleets[0] = [{ len: 5, dir: 'v', r: 0, c: 0 }, { len: 4, dir: 'h', r: 9, c: 3 }, { len: 3, dir: 'h', r: 2, c: 4 }, { len: 3, dir: 'v', r: 5, c: 6 }, { len: 2, dir: 'h', r: 6, c: 2 }];
    return {
      state: s,
      steps: [
        { say: 'Cada uno coloca sus barcos escondidos en su mar. ¡Listos!', seat: 0, a: { type: 'ready' }, wait: 800 },
        { say: 'Leo también está listo. ¡Empieza la batalla!', seat: 1, a: { type: 'ready' }, wait: 1800 },
        { say: 'Ana dispara al mar de Leo… 💣', seat: 0, a: { type: 'fire', target: 1, r: 2, c: 7 }, wait: 2800 },
        { say: '¡Agua! 💦 Le toca a Leo.', seat: 1, a: { type: 'fire', target: 0, r: 6, c: 2 }, wait: 2800 },
        { say: '¡Tocado! 🔥 Quien acierta vuelve a disparar.', seat: 1, a: { type: 'fire', target: 0, r: 6, c: 3 }, wait: 4200 },
        { say: '¡Hundido! El barco se va al fondo. Gana quien hunda toda la flota enemiga.', seat: 1, a: { type: 'fire', target: 0, r: 0, c: 9 }, wait: 3000 },
      ],
    };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const ui = ctx.ui;
    const N = s.size;
    const color = (k) => PLAYER_COLORS[k];
    const chips = [...Array(s.n).keys()].map((k) => `
      <div class="pchip ${(s.phase === 'battle' && k === s.turn && !s.over) ? 'turn' : ''}" style="--pc:${color(k)}">
        <span class="avatar">${ctx.avatar(k)}</span><span class="pname">${esc(ctx.players[k])}${s.teams ? ' ' + TEAM_EMOJI[s.teams[k]] : ''}</span>
        <span class="pinfo">${s.phase === 'place' ? (s.ready[k] ? '✅' : '⏳') : alive(s, k) ? '🚢'.repeat(Math.min(5, s.lens.length - s.fleets[k].filter((x) => x.sunk).length)) || '🚢' : '💀'}</span></div>`).join('');

    const sea = (owner, big, clickable, editable) => {
      const shots = s.shots[owner];
      const cells = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const v = shots[`${r},${c}`];
        const fresh = s.lastShot && s.lastShot.target === owner && s.lastShot.r === r && s.lastShot.c === c && s.fx && s.fx.type !== 'special';
        cells.push(`<div class="scell ${clickable && !v ? 'can' : ''} ${editable ? 'edit' : ''}" data-cell="${owner}-${r}-${c}" data-r="${r}" data-c="${c}">${v === 'w' ? `<span class="mk miss ${fresh ? 'fresh' : ''}"></span>` : v === 'h' ? `<span class="mk hit ${fresh ? 'fresh' : ''}">🔥</span>` : ''}</div>`);
      }
      const ships = s.fleets[owner].map((sh, i) => {
        const justSunk = s.fx && s.fx.result === 'sunk' && s.fx.target === owner && s.fx.ship === i;
        const sel = editable && ui.sel === i;
        return `<div class="ship ${sh.dir} ${sh.sunk ? 'sunk' : ''} ${justSunk ? 'sinking' : ''} ${sel ? 'sel' : ''}" data-ship="${i}" style="left:${(sh.c / N) * 100}%;top:${(sh.r / N) * 100}%;--len:${sh.len};--n:${N}">${SHIP_SVG(sh.len, sh.dir)}</div>`;
      }).join('');
      return `<div class="sea ${big ? 'big' : 'small'}" style="--n:${N}"><div class="waves"></div>${ships}<div class="sgrid" style="--n:${N}">${cells.join('')}</div></div>`;
    };

    let body = '';
    let status = '';
    if (s.phase === 'place') {
      const editing = me != null && !s.ready[me];
      if (ui.sel == null) ui.sel = null;
      status = editing ? '⚓ Coloca tus barcos: toca uno, luego la casilla donde lo quieres' : me == null ? 'Los capitanes colocan su flota…' : '✅ ¡Listo! Esperando a los demás capitanes…';
      body = me != null ? `${sea(me, true, false, editing)}
        ${editing ? `<div class="actions"><button class="btn" data-rot ${ui.sel == null ? 'disabled' : ''}>↻ Girar</button><button class="btn c3" data-rand>🔀 Al azar</button><button class="btn c1 pulse" data-ready>✅ ¡Listo!</button></div>` : ''}` : '';
    } else {
      const myTurn = me === s.turn && !s.over;
      const targets = me != null ? targetsOf(s, me) : [...Array(s.n).keys()].filter((k) => alive(s, k));
      if (!myTurn && s.lastShot && s.lastShot.target !== me) ui.tab = s.lastShot.target;
      if (ui.tab == null || !targets.includes(ui.tab) && !(s.lastShot && s.lastShot.target === ui.tab)) ui.tab = targets[0];
      if (s.over && ui.tab == null) ui.tab = (me + 1) % s.n;
      const tabs = targets.length > 1 ? `<div class="chips seatabs">${targets.map((k) => `<button class="chip ${k === ui.tab ? 'on' : ''}" data-tab="${k}" style="--pc:${color(k)}">${ctx.avatar(k)} ${esc(ctx.players[k])}</button>`).join('')}</div>` : '';
      if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
      else if (myTurn) status = '💣 ¡Te toca! Toca una casilla del mar enemigo';
      else status = `Dispara <b>${esc(ctx.players[s.turn])}</b>…`;
      body = `${tabs}<div class="sealabel">Mar de ${ui.tab != null ? esc(ctx.players[ui.tab]) : ''}</div>${ui.tab != null ? sea(ui.tab, true, myTurn && targets.includes(ui.tab), false) : ''}
        ${me != null ? `<div class="sealabel">Tu flota</div>${sea(me, false, false, false)}` : ''}`;
    }
    el.innerHTML = `<div class="players">${chips}</div><div class="status">${status}</div>${body}
      <div class="log">${(s.log || []).slice(0, 2).map((l) => `<div>${ctx.fmt(l)}</div>`).join('')}</div>`;

    // interacción
    if (s.phase === 'place' && me != null && !s.ready[me]) {
      el.querySelectorAll('.sea.big [data-ship]').forEach((d) => d.onclick = (e) => { e.stopPropagation(); ui.sel = +d.dataset.ship; ctx.rerender(); });
      el.querySelectorAll('.sea.big .scell').forEach((d) => d.onclick = () => {
        if (ui.sel == null) return ctx.toast('Primero toca un barco');
        ctx.send({ type: 'move', i: ui.sel, r: +d.dataset.r, c: +d.dataset.c });
      });
      const rot = el.querySelector('[data-rot]');
      if (rot) rot.onclick = () => { const sh = s.fleets[me][ui.sel]; ctx.send({ type: 'move', i: ui.sel, r: sh.r, c: sh.c, dir: sh.dir === 'h' ? 'v' : 'h' }); };
      el.querySelector('[data-rand]').onclick = () => { ui.sel = null; ctx.send({ type: 'random' }); };
      el.querySelector('[data-ready]').onclick = () => { ui.sel = null; ctx.send({ type: 'ready' }); };
    }
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.tab = +b.dataset.tab; ctx.rerender(); });
    el.querySelectorAll('.sea.big .scell.can').forEach((d) => d.onclick = () => ctx.send({ type: 'fire', target: ui.tab, r: +d.dataset.r, c: +d.dataset.c }));
  },

  // bala de cañón que sube muy alto y cae: salpicadura, explosión o barco hundido
  async animate(f, el, ctx) {
    const { fx } = ctx;
    if (f.type !== 'shot' && f.type !== 'win') return;
    const cell = el.querySelector(`[data-cell="${f.target}-${f.r}-${f.c}"]`);
    if (!cell) return;
    const to = fx.center(cell);
    const from = { x: innerWidth / 2 + (Math.random() - 0.5) * 60, y: innerHeight + 30 };
    ctx.sound('whoosh');
    let n = 0;
    await fx.fly(BALL, from, to, {
      size: Math.max(18, to.w * 0.7), arc: innerHeight * 0.55, duration: 950, scaleMid: 1.8, shadow: false,
      trail: (x, y) => { if (n++ % 2 === 0) fx.dust(x, y + 4, 6, 'rgba(120,120,120,.6)'); },
    });
    if (f.result === 'miss') { fx.splash(to.x, to.y, 0.9); ctx.sound('splash'); return; }
    fx.explosion(to.x, to.y, f.result === 'sunk' ? 1.3 : 0.9);
    fx.screenShake(f.result === 'sunk' ? 14 : 8);
    ctx.sound('boom');
    if (f.result === 'sunk') {
      const ship = el.querySelector(`.sea [data-ship="${f.ship}"].sinking`);
      const c = ship ? fx.center(ship) : to;
      await fx.wait(500);
      fx.bubbles(c.x, c.y, 26, c.w / 2);
      ctx.sound('bubbles');
      await fx.wait(700);
      fx.splash(c.x, c.y, 1.1);
    }
    if (f.type === 'win') fx.fireworksShow(null, 8);
  },
};

const BALL = `<svg viewBox="-10 -10 20 20"><defs><radialGradient id="bal" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#868e96"/><stop offset="1" stop-color="#111"/></radialGradient></defs><circle r="9" fill="url(#bal)"/><circle cx="-3" cy="-3" r="2" fill="#fff" opacity=".6"/></svg>`;

// Barco dibujado (casco, cubierta, cabina y cañones), tumbado u horizontal
function SHIP_SVG(len, dir) {
  const L = len * 100;
  const hull = `M8 50 Q8 14 50 12 H${L - 60} Q${L - 8} 14 ${L - 4} 50 Q${L - 8} 86 ${L - 60} 88 H50 Q8 86 8 50 Z`;
  let deck = `<path d="${hull}" fill="#868e96" stroke="#343a40" stroke-width="5"/><path d="M24 50 Q24 28 54 26 H${L - 64} Q${L - 24} 30 ${L - 20} 50 Q${L - 24} 70 ${L - 64} 74 H54 Q24 72 24 50 Z" fill="#adb5bd"/>`;
  deck += `<rect x="${L / 2 - 40}" y="34" width="80" height="32" rx="8" fill="#495057"/><rect x="${L / 2 - 30}" y="40" width="20" height="8" rx="3" fill="#a5d8ff"/><rect x="${L / 2 + 10}" y="40" width="20" height="8" rx="3" fill="#a5d8ff"/>`;
  for (let k = 0; k < len - 1; k++) { const x = 70 + k * 100; if (Math.abs(x - L / 2) > 60) deck += `<circle cx="${x}" cy="50" r="13" fill="#495057"/><rect x="${x}" y="46" width="30" height="8" rx="3" fill="#343a40"/>`; }
  deck += `<path d="M${L - 40} 50 L${L - 20} 50" stroke="#ff6b6b" stroke-width="5"/>`;
  return dir === 'h'
    ? `<svg viewBox="0 0 ${L} 100" preserveAspectRatio="none">${deck}</svg>`
    : `<svg viewBox="0 0 100 ${L}" preserveAspectRatio="none"><g transform="translate(100 0) rotate(90)">${deck}</g></svg>`;
}
