import { clone, die, esc, fail, pushLog, PLAYER_COLORS } from '../util.js';
import { buildBoard, GOOSE_ICON, GOOSE_FLY } from './oca-board.js';
import { pieceSVG, PIECE_CHOICES } from './pieces.js';

const OCAS = [5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59];
export const SPECIAL = {
  6: { icon: '🌉', name: 'Puente', fill: '#74c0fc' }, 12: { icon: '🌉', name: 'Puente', fill: '#74c0fc' },
  19: { icon: '🏨', name: 'Posada', fill: '#ffa94d' }, 26: { icon: '🎲', name: 'Dados', fill: '#f783ac' }, 53: { icon: '🎲', name: 'Dados', fill: '#f783ac' },
  31: { icon: '🕳️', name: 'Pozo', fill: '#4263eb' }, 42: { icon: '🌀', name: 'Laberinto', fill: '#b197fc' }, 56: { icon: '⛓️', name: 'Cárcel', fill: '#adb5bd' },
  58: { icon: '💀', name: 'Muerte', fill: '#495057' }, 63: { icon: '🏰', name: 'Jardín de la Oca', fill: '#ffd43b' },
};
OCAS.forEach((o) => { SPECIAL[o] = { icon: '🪿', name: 'Oca', fill: '#8ce99a' }; });

// Espiral de 63 casillas (+ salida) en una cuadrícula de 8x8, de fuera hacia dentro.
export const CELLS = [[7, 0]]; // índice = número de casilla (0 = salida)
(function build() {
  const R = 8, C = 8, seen = new Set(['7,0']);
  let r = 7, c = 1, d = 0;
  const dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  while (CELLS.length < 64) {
    CELLS.push([r, c]); seen.add(`${r},${c}`);
    if (CELLS.length === 64) break;
    for (let t = 0; t < 4; t++) {
      const [dr, dc] = dirs[d];
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < R && nc >= 0 && nc < C && !seen.has(`${nr},${nc}`)) { r = nr; c = nc; break; }
      d = (d + 1) % 4;
    }
  }
})();

function advance(s) {
  for (let k = 0; k < s.n * 4; k++) {
    s.turn = (s.turn + 1) % s.n;
    if (s.pozo === s.turn) { pushLog(s, `{${s.turn}} sigue en el pozo`); continue; }
    if (s.skip[s.turn] > 0) { s.skip[s.turn]--; pushLog(s, `{${s.turn}} pierde turno`); continue; }
    return;
  }
}

export default {
  id: 'oca',
  name: 'La Oca',
  icon: `<span class="gsvg">${GOOSE_ICON}</span>`,
  color: '#43a047',
  minPlayers: 2,
  maxPlayers: 6,
  teams: 'any',
  moveSound: 'move',
  blurb: '¡De oca a oca y tiro porque me toca! Puentes, pozo, laberinto… llega el primero al Jardín de la Oca (63).',
  options: [{ id: 'ficha', label: '🎯 Fichas', type: 'choice', def: 'chapa', choices: [{ v: 'peon', label: '🔴 Botón' }, ...PIECE_CHOICES.slice(1)] }],
  rules: `
    <p>Carrera por un camino en espiral de 63 casillas. Tira el dado y avanza. Llega el primero a la <b>63</b> (hay que caer justo: si te pasas, rebotas hacia atrás).</p>
    <ul class="ruleicons">
      <li><span class="gsvg">${GOOSE_ICON}</span><b>Oca</b> — "¡De oca a oca y tiro porque me toca!": vuelas a la siguiente oca y vuelves a tirar.</li>
      <li><span>🌉</span><b>Puente (6 y 12)</b> — "¡De puente a puente y tiro porque me lleva la corriente!": cruzas al otro y tiras.</li>
      <li><span>🎲</span><b>Dados (26 y 53)</b> — "¡De dado a dado y tiro porque me ha tocado!": saltas al otro y tiras.</li>
      <li><span>🏨</span><b>Posada (19)</b> — descansas un turno.</li>
      <li><span>🕳️</span><b>Pozo (31)</b> — te quedas hasta que otro jugador caiga y te rescate.</li>
      <li><span>🌀</span><b>Laberinto (42)</b> — te pierdes y vuelves a la 30.</li>
      <li><span>⛓️</span><b>Cárcel (56)</b> — dos turnos sin tirar.</li>
      <li><span>💀</span><b>Muerte (58)</b> — ¡vuelta a empezar!</li>
    </ul>`,

  setup(n, opts = {}) {
    return { n, pos: Array(n).fill(0), skip: Array(n).fill(0), pozo: null, turn: 0, v: 0, dieVal: null, log: ['¡Que empiece la carrera!'], teams: opts.teams || null, ficha: (opts.options && opts.options.ficha) || 'chapa' };
  },
  turnOf: (s) => (s.over ? null : s.turn),
  isOver: (s) => !!s.over,

  action(st, seat, a) {
    const s = clone(st);
    s.v++;
    s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat !== s.turn) fail('No es tu turno');
    if (a.type !== 'roll') fail('Acción desconocida');
    const d = s.demo && a.die ? a.die : die();
    s.dieVal = d;
    s.rollId = s.v;
    const from = s.pos[seat];
    const walk = [];
    let p = from;
    for (let k = 0, dir = 1; k < d; k++) { if (p === 63) dir = -1; p += dir; walk.push(p); }
    if (from + d > 63) pushLog(s, `{${seat}} saca un ${d} y rebota hasta la ${p}`);
    else pushLog(s, `{${seat}} saca un ${d} → casilla ${p}`);
    let again = false, jump = null, effect = null, text = null, emoji = null, type = 'move';

    if (OCAS.includes(p)) {
      const next = OCAS.find((o) => o > p) || 63;
      jump = 'oca'; text = '¡De oca a oca y tiro porque me toca!'; emoji = '🦢'; type = 'special';
      pushLog(s, `{${seat}} vuela de oca a oca hasta la ${next}`);
      p = next; again = next !== 63;
    } else if (p === 6 || p === 12) {
      jump = 'puente'; text = '¡De puente a puente y tiro porque me lleva la corriente!'; emoji = '🌉'; type = 'special';
      p = p === 6 ? 12 : 6; again = true;
      pushLog(s, `{${seat}} cruza el puente a la ${p}`);
    } else if (p === 26 || p === 53) {
      jump = 'dados'; text = '¡De dado a dado y tiro porque me ha tocado!'; emoji = '🎲'; type = 'special';
      p = p === 26 ? 53 : 26; again = true;
      pushLog(s, `{${seat}} salta de dado a dado a la ${p}`);
    } else if (p === 19) {
      s.skip[seat] = 1; effect = 'posada'; text = 'Posada: a descansar un turno'; emoji = '😴'; type = 'bad';
      pushLog(s, `{${seat}} se queda en la posada`);
    } else if (p === 31) {
      if (s.pozo != null && s.pozo !== seat) pushLog(s, `{${seat}} rescata a {${s.pozo}} del pozo`);
      s.pozo = seat; effect = 'pozo'; text = '¡Al pozo! Hasta que te rescaten'; emoji = '🕳️'; type = 'bad';
    } else if (p === 42) {
      jump = 'laberinto'; text = '¡Laberinto! Vuelves a la 30'; emoji = '🌀'; type = 'bad';
      p = 30;
    } else if (p === 56) {
      s.skip[seat] = 2; effect = 'carcel'; text = '¡A la cárcel! Dos turnos sin tirar'; emoji = '⛓️'; type = 'bad';
    } else if (p === 58) {
      jump = 'muerte'; text = '¡La muerte! Vuelta a empezar'; emoji = '💀'; type = 'bad';
      p = 1;
    }
    s.pos[seat] = p;
    const walkMs = walk.length * 190 + 150;
    s.fx = { id: s.v, type, seat, walk, from, jump, to: p, effect, text, emoji, noFlip: ['o' + seat], bannerDelay: walkMs };
    if (p === 63) {
      s.over = true; s.winner = seat;
      s.fx = { ...s.fx, type: 'win', text: '¡Llegó al Jardín de la Oca!', emoji: '🏆', effect: 'goal' };
      return s;
    }
    if (!again) advance(s);
    return s;
  },

  bot: () => ({ type: 'roll' }),

  demo() {
    const s = this.setup(2);
    return {
      state: s,
      steps: [
        { say: 'Por turnos, tiras el dado y avanzas por el camino en espiral.', seat: 0, a: { type: 'roll', die: 4 } },
        { say: 'Leo saca un 5… ¡oca! 🦢 De oca a oca vuela a la 9 y vuelve a tirar.', seat: 1, a: { type: 'roll', die: 5 }, wait: 3600 },
        { say: 'Saca un 3 y cae en el puente 🌉: la corriente le lleva al 6 y tira otra vez.', seat: 1, a: { type: 'roll', die: 3 }, wait: 3600 },
        { say: 'Saca un 1: casilla 7. Ahora le toca a Ana.', seat: 1, a: { type: 'roll', die: 1 } },
        { say: 'Ana saca un 3 y llega también a la 7.', seat: 0, a: { type: 'roll', die: 3 } },
        { say: 'Si caes en la Muerte 💀 (58), ¡vuelves a empezar!', patch: (st) => { st.pos[1] = 55; st.turn = 1; }, wait: 900 },
        { say: 'Leo saca un 3… 😱', seat: 1, a: { type: 'roll', die: 3 }, wait: 3600 },
        { say: 'Para ganar hay que caer justo en la 63, el Jardín de la Oca 🏰.', patch: (st) => { st.pos[0] = 60; st.turn = 0; }, wait: 900 },
        { say: 'Ana saca un 3… ¡y gana!', seat: 0, a: { type: 'roll', die: 3 }, wait: 4000 },
      ],
    };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me === s.turn && !s.over;
    const players = s.pos.map((p, i) => `
      <div class="pchip ${i === s.turn && !s.over ? 'turn' : ''}" style="--pc:${PLAYER_COLORS[i]}">
        <span class="avatar">${ctx.avatar(i)}</span><span class="pname">${esc(ctx.players[i])}</span>
        <span class="pinfo">📍${p}${s.pozo === i ? ' 🕳️' : ''}${s.skip[i] ? ` ⏸${s.skip[i]}` : ''}</span>
      </div>`).join('');

    // fichas: varias en la misma casilla se reparten
    const byPos = {};
    s.pos.forEach((p, i) => { (byPos[p] = byPos[p] || []).push(i); });
    const toks = s.pos.map((p, i) => {
      const group = byPos[p];
      const k = group.indexOf(i), m = group.length;
      const [r, c] = CELLS[p];
      const off = OFFSETS[Math.min(m, 6)][k];
      const sz = m > 3 ? 0.42 : m > 1 ? 0.55 : 0.72;
      const svg = pieceSVG(s.ficha, PLAYER_COLORS[i], ctx.avatar(i));
      return `<div class="otok ${svg ? 'pstyle' : 'tok3d'}" data-flip="o${i}" style="--pc:${PLAYER_COLORS[i]};left:${((c + 0.5 + off[0]) / 8) * 100}%;top:${((r + 0.5 + off[1]) / 8) * 100}%;width:${(sz / 8) * 100}%;margin:-${(sz / 16) * 100}% 0 0 -${(sz / 16) * 100}%;font-size:${(sz / 8) * 55}cqw">${svg || ctx.avatar(i)}</div>`;
    }).join('');

    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else status = myTurn ? '👉 ¡Te toca! Tira el dado' : `Turno de <b>${esc(ctx.players[s.turn])}</b>`;

    el.innerHTML = `
      <div class="players">${players}</div>
      <div class="status">${status}</div>
      <div class="oca-wrap ${zoomed() ? 'zoom' : ''}"><div class="oca-board2">${BOARD_SVG}<div class="otoks2">${toks}</div></div></div>
      <div class="ocazoom"><button class="btn small" data-zoom>${zoomed() ? '🔎 Ver tablero entero' : '🔍 Ampliar tablero'}</button></div>
      <div class="dicebar">
        <button class="die3d ${s.rollId === s.v ? 'rolling' : ''}" data-roll ${myTurn ? '' : 'disabled'} style="--c:${PLAYER_COLORS[s.turn]}"><span>${s.dieVal ? DIE_FACES[s.dieVal] : '🎲'}</span></button>
        <div class="log">${(s.log || []).slice(0, 3).map((l) => `<div>${ctx.fmt(l)}</div>`).join('')}</div>
      </div>`;
    el.querySelector('[data-roll]').onclick = () => ctx.send({ type: 'roll' });
    el.querySelector('[data-zoom]').onclick = () => { try { localStorage.setItem('jca.ocaZoom', zoomed() ? '0' : '1'); } catch {} ctx.rerender(); };
    // con el tablero ampliado, la vista se centra en la ficha que va a jugar (o la que se mueve)
    const wrap = el.querySelector('.oca-wrap.zoom');
    if (wrap) {
      const ui = ctx.ui;
      const fxId = s.fx && s.fx.walk ? s.fx.id : null;
      if (fxId != null && ui.ocaFx !== fxId) { ui.ocaFx = fxId; requestAnimationFrame(() => centerOn(el, s.fx.from, false)); }
      else if (ui.ocaScroll) requestAnimationFrame(() => { wrap.scrollLeft = ui.ocaScroll[0]; wrap.scrollTop = ui.ocaScroll[1]; });
      else requestAnimationFrame(() => centerOn(el, s.pos[s.turn], false));
      wrap.addEventListener('scroll', () => { ui.ocaScroll = [wrap.scrollLeft, wrap.scrollTop]; }, { passive: true });
    }
  },

  // ---------- animaciones: la ficha recorre el camino casilla a casilla y luego el efecto especial ----------
  async animate(f, el, ctx) {
    const { fx } = ctx;
    const board = el.querySelector('.oca-board2');
    const real = el.querySelector(`[data-flip="o${f.seat}"]`);
    if (!board || !real || !f.walk) return;
    const br = board.getBoundingClientRect();
    const cell = (n) => { const [r, c] = CELLS[n]; return { x: br.left + ((c + 0.5) / 8) * br.width, y: br.top + ((r + 0.5) / 8) * br.height, w: br.width / 8 }; };
    const size = br.width / 8 * 0.7;
    const psvg = pieceSVG(ctx.state.ficha, PLAYER_COLORS[f.seat], ctx.avatar(f.seat));
    const html = `<div class="otok ${psvg ? 'pstyle' : 'tok3d'} ghost" style="--pc:${PLAYER_COLORS[f.seat]};font-size:${size * 0.55}px">${psvg || ctx.avatar(f.seat)}</div>`;
    real.style.opacity = '0';
    let at = cell(f.from);
    // 1) paso a paso
    for (const n of f.walk) {
      if (zoomed()) { centerOn(el, n, true); }
      const bb = board.getBoundingClientRect(); br.x = bb.x; br.y = bb.y;
      const to = cell(n);
      ctx.sound('move');
      await fx.fly(html, at, to, { size, arc: 26, duration: 180, linear: true });
      at = to;
    }
    let ghost = null;
    const keepGhost = async (opts, to, extra) => { const e = await fx.fly(html + (extra || ''), at, to, { size, keep: true, ...opts }); if (ghost) ghost.remove(); ghost = e; at = to; };
    // 2) salto especial
    if (f.jump === 'oca') {
      ctx.sound('honk');
      const goose = cell(f.to);
      fx.emojiRain(at.x, at.y, '🪶', 6, { up: true, speed: 3, size: 20 });
      await keepGhost({ arc: br.width * 0.28, duration: 1100, scaleMid: 0.7, trail: (x, y, t) => { if (Math.random() < 0.25) fx.emojiRain(x, y, '🪶', 1, { speed: 1.5, size: 16, grav: 0.03 }); } }, goose,
        `<div class="goose-carrier">${GOOSE_FLY}</div>`);
      fx.sparkle(at.x, at.y, '#b2f2bb', 16);
      ctx.sound('honk');
    } else if (f.jump === 'puente') {
      ctx.sound('splash');
      fx.splash(at.x, at.y + 8, 0.7);
      await keepGhost({ arc: br.width * 0.12, duration: 1100, trail: (x, y) => { if (Math.random() < 0.45) fx.splash(x, y + size * 0.4, 0.15); } }, cell(f.to), '<div class="wave-carrier">🌊</div>');
      fx.splash(at.x, at.y + 8, 0.6);
    } else if (f.jump === 'dados') {
      ctx.sound('dice');
      await keepGhost({ arc: br.width * 0.4, duration: 1200, spin: 2, scaleMid: 0.9 }, cell(f.to), '<div class="dice-carrier">🎲</div>');
      fx.burst(at.x, at.y, { count: 40, scale: 0.6 });
      ctx.sound('special');
    } else if (f.jump === 'laberinto') {
      ctx.sound('whoosh');
      for (let i = 0; i < 6; i++) setTimeout(() => fx.emojiRain(at.x, at.y, '🌀', 1, { speed: 3, size: 26 }), i * 120);
      await keepGhost({ arc: 30, duration: 1200, spin: 4 }, cell(f.to));
    } else if (f.jump === 'muerte') {
      ctx.sound('bad');
      fx.flash('#000');
      fx.emojiRain(at.x, at.y, '💀', 1, { up: true, speed: 2, size: 70, grav: 0 });
      await fx.wait(500);
      fx.emojiRain(at.x, at.y, '👻', 5, { speed: 2, size: 26, grav: -0.02 });
      await keepGhost({ arc: br.width * 0.5, duration: 1600, spin: 1, cls: 'dead' }, cell(f.to));
    }
    if (ghost) ghost.remove();
    // 3) efecto al caer
    if (f.effect === 'posada') { ctx.sound('zzz'); fx.emojiRain(at.x, at.y - 10, '💤', 5, { up: true, speed: 1.6, grav: -0.01, stagger: 8, size: 26 }); }
    if (f.effect === 'pozo') {
      ctx.sound('splash');
      await fx.fly(html, at, at, { size, arc: 0, duration: 700, spin: 2, cls: 'sinking' });
      fx.splash(at.x, at.y, 0.6); fx.bubbles(at.x, at.y, 14, 12); ctx.sound('bubbles');
    }
    if (f.effect === 'carcel') {
      ctx.sound('clang'); fx.screenShake(6);
      const bars = document.createElement('div');
      bars.className = 'jailbars';
      Object.assign(bars.style, { left: at.x - at.w / 2 + 'px', top: at.y - at.w / 2 + 'px', width: at.w + 'px', height: at.w + 'px' });
      document.body.appendChild(bars);
      setTimeout(() => bars.remove(), 1600);
    }
    if (f.effect === 'goal') { fx.fireworksShow(br, 9); ctx.sound('firework'); fx.sparkle(at.x, at.y, '#ffd43b', 30, 2); }
    real.style.opacity = '';
    if (zoomed()) centerOn(el, f.to, true);
    real.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3,1.6,.6,1)' });
  },
};

const zoomed = () => { try { return localStorage.getItem('jca.ocaZoom') === '1'; } catch { return false; } };
function centerOn(el, n, smooth) {
  const wrap = el.querySelector('.oca-wrap.zoom');
  if (!wrap) return;
  const [r, c] = CELLS[n];
  const b = wrap.querySelector('.oca-board2');
  const x = ((c + 0.5) / 8) * b.offsetWidth - wrap.clientWidth / 2, y = ((r + 0.5) / 8) * b.offsetHeight - wrap.clientHeight / 2;
  wrap.scrollTo({ left: x, top: y, behavior: smooth ? 'smooth' : 'auto' });
}
const DIE_FACES = [null, '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const OFFSETS = [
  [[0, 0]], [[0, 0]], [[-0.2, 0], [0.2, 0]], [[-0.2, -0.15], [0.2, -0.15], [0, 0.18]],
  [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
  [[-0.24, -0.22], [0.24, -0.22], [0, 0], [-0.24, 0.22], [0.24, 0.22]],
  [[-0.26, -0.2], [0, -0.2], [0.26, -0.2], [-0.26, 0.2], [0, 0.2], [0.26, 0.2]],
];

const BOARD_SVG = buildBoard(CELLS, SPECIAL);
