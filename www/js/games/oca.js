import { clone, die, esc, fail, pushLog, PLAYER_COLORS } from '../util.js';

const OCAS = [5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59];
export const SPECIAL = {
  6: { icon: '🌉', name: 'Puente' }, 12: { icon: '🌉', name: 'Puente' },
  19: { icon: '🏨', name: 'Posada' }, 26: { icon: '🎲', name: 'Dados' }, 53: { icon: '🎲', name: 'Dados' },
  31: { icon: '🕳️', name: 'Pozo' }, 42: { icon: '🌀', name: 'Laberinto' }, 56: { icon: '🔒', name: 'Cárcel' },
  58: { icon: '💀', name: 'Muerte' }, 63: { icon: '🏰', name: 'Jardín de la Oca' },
};
OCAS.forEach((o) => { SPECIAL[o] = { icon: '🪿', name: 'Oca' }; });

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
  icon: '🪿',
  color: '#43a047',
  minPlayers: 2,
  maxPlayers: 6,
  teams: 'any',
  blurb: '¡De oca a oca y tiro porque me toca! Puentes, pozo, laberinto… llega el primero a la casilla 63.',

  setup(n, opts = {}) {
    return { n, pos: Array(n).fill(0), skip: Array(n).fill(0), pozo: null, turn: 0, v: 0, dieVal: null, log: ['¡Que empiece la carrera!'], teams: opts.teams || null };
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
    const d = die();
    s.dieVal = d;
    s.rollId = s.v;
    const from = s.pos[seat];
    let p = from + d;
    const path = [];
    if (p > 63) { p = 63 - (p - 63); pushLog(s, `{${seat}} saca un ${d} y rebota hasta la ${p}`); }
    else pushLog(s, `{${seat}} saca un ${d} → casilla ${p}`);
    path.push(p);
    let again = false;
    const fx = (text, emoji, type = 'special') => { s.fx = { id: s.v, type, seat, text, emoji }; };

    if (OCAS.includes(p)) {
      const next = OCAS.find((o) => o > p) || 63;
      fx('¡De oca a oca y tiro porque me toca!', '🪿');
      pushLog(s, `{${seat}} vuela de oca a oca hasta la ${next}`);
      p = next; again = next !== 63; path.push(p);
    } else if (p === 6 || p === 12) {
      const to = p === 6 ? 12 : 6;
      fx('¡De puente a puente y tiro porque me lleva la corriente!', '🌉');
      pushLog(s, `{${seat}} cruza el puente a la ${to}`);
      p = to; again = true; path.push(p);
    } else if (p === 26 || p === 53) {
      const to = p === 26 ? 53 : 26;
      fx('¡De dado a dado y tiro porque me ha tocado!', '🎲');
      pushLog(s, `{${seat}} salta de dado a dado a la ${to}`);
      p = to; again = true; path.push(p);
    } else if (p === 19) {
      s.skip[seat] = 1; fx('Posada: descansas un turno', '🏨', 'bad');
      pushLog(s, `{${seat}} se queda en la posada`);
    } else if (p === 31) {
      if (s.pozo != null && s.pozo !== seat) pushLog(s, `{${seat}} rescata a {${s.pozo}} del pozo`);
      s.pozo = seat; fx('¡Al pozo! Hasta que te rescaten', '🕳️', 'bad');
    } else if (p === 42) {
      fx('¡Laberinto! Vuelves a la 30', '🌀', 'bad');
      p = 30; path.push(p);
    } else if (p === 56) {
      s.skip[seat] = 2; fx('¡A la cárcel! Dos turnos sin tirar', '🔒', 'bad');
    } else if (p === 58) {
      fx('¡La muerte! Vuelta a empezar', '💀', 'bad');
      p = 1; path.push(p);
    }
    s.pos[seat] = p;
    s.path = { seat, from, steps: path };
    if (p === 63) {
      s.over = true; s.winner = seat;
      s.fx = { id: s.v, type: 'win', seat, text: '¡Llegó al Jardín de la Oca!', emoji: '🏆' };
      return s;
    }
    if (!again) advance(s);
    return s;
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me === s.turn && !s.over;
    if (!CELLS.length) buildCells();
    const byPos = {};
    s.pos.forEach((p, i) => { (byPos[p] = byPos[p] || []).push(i); });
    const cells = CELLS.map(([r, c], k) => {
      const n = k + 1;
      const sp = SPECIAL[n];
      const toks = (byPos[n] || []).map((i) => tokenHTML(s, ctx, i, (byPos[n] || []).length)).join('');
      return `<div class="ocell ${sp ? 'sp' : ''} ${n % 2 ? 'odd' : ''} ${sp && sp.name === 'Oca' ? 'isoca' : ''} ${n === 63 ? 'goal' : ''}" style="grid-row:${r + 1};grid-column:${c + 1}">
        <span class="onum">${n}</span>${sp ? `<span class="oicon">${sp.icon}</span>` : ''}<div class="otoks">${toks}</div></div>`;
    }).join('');
    const start = (byPos[0] || []).map((i) => tokenHTML(s, ctx, i, 1)).join('');

    const players = s.pos.map((p, i) => `
      <div class="pchip ${i === s.turn && !s.over ? 'turn' : ''}" style="--pc:${PLAYER_COLORS[i]}">
        <span class="avatar">${ctx.avatar(i)}</span><span class="pname">${esc(ctx.players[i])}</span>
        <span class="pinfo">📍${p}${s.pozo === i ? ' 🕳️' : ''}${s.skip[i] ? ` ⏸${s.skip[i]}` : ''}</span>
      </div>`).join('');

    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else status = myTurn ? '👉 ¡Te toca! Tira el dado' : `Turno de <b>${esc(ctx.players[s.turn])}</b>`;

    el.innerHTML = `
      <div class="players">${players}</div>
      <div class="status">${status}</div>
      <div class="oca-board">${cells}<div class="ostart" style="grid-row:8;grid-column:1">${start}</div></div>
      <div class="dicebar">
        <button class="die3d ${s.rollId === s.v ? 'rolling' : ''}" data-roll ${myTurn ? '' : 'disabled'} style="--c:${PLAYER_COLORS[s.turn]}"><span>${s.dieVal ? DIE_FACES[s.dieVal] : '🎲'}</span></button>
        <div class="log">${(s.log || []).slice(0, 3).map((l) => `<div>${ctx.fmt(l)}</div>`).join('')}</div>
      </div>`;
    el.querySelector('[data-roll]').onclick = () => ctx.send({ type: 'roll' });
  },
};

function tokenHTML(s, ctx, i, count) {
  const moved = s.path && s.path.seat === i;
  return `<span class="otok ${count > 2 ? 'xs' : count > 1 ? 'sm' : ''} ${moved ? 'hop' : ''}" data-flip="o${i}" style="--pc:${PLAYER_COLORS[i]}">${ctx.avatar(i)}</span>`;
}
const DIE_FACES = [null, '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// Espiral de 63 casillas (+ salida) en una cuadrícula de 8x8, de fuera hacia dentro.
export const CELLS = [];
function buildCells() {
  const R = 8, C = 8, seen = new Set();
  let r = R - 1, c = 1, d = 0; // empieza abajo (la casilla 0 de salida queda en la esquina)
  const dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  seen.add(`${R - 1},0`);
  while (CELLS.length < 63) {
    CELLS.push([r, c]); seen.add(`${r},${c}`);
    if (CELLS.length === 63) break;
    for (let t = 0; t < 4; t++) {
      const [dr, dc] = dirs[d];
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < R && nc >= 0 && nc < C && !seen.has(`${nr},${nc}`)) { r = nr; c = nc; break; }
      d = (d + 1) % 4;
    }
  }
}
buildCells();
