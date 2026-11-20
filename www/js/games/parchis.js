import { clone, die, esc, fail, pushLog, sameTeam } from '../util.js';

// Tablero de 68 casillas. Cada color tiene: salida, entrada al pasillo (7 casillas) y meta.
// Posición de una ficha = progreso: -1 casa, 0..63 anillo (desde su salida), 64..70 pasillo, 71 meta.
export const COLORS = [
  { name: 'Amarillo', hex: '#fbc02d', light: '#fff3b0', dark: '#c49000' },
  { name: 'Azul', hex: '#1e88e5', light: '#bbdefb', dark: '#0d47a1' },
  { name: 'Rojo', hex: '#e53935', light: '#ffcdd2', dark: '#a31515' },
  { name: 'Verde', hex: '#43a047', light: '#c8e6c9', dark: '#1b5e20' },
];
const EXIT = [13, 30, 47, 64];
const META = 71;
const SAFE = new Set([3, 8, 13, 20, 25, 30, 37, 42, 47, 54, 59, 64]);
export const ringOf = (color, p) => (EXIT[color] + p) % 68;

function occupants(s, sq) {
  const out = [];
  s.pieces.forEach((ps, seat) => ps.forEach((p, i) => {
    if (p >= 0 && p <= 63 && ringOf(s.colors[seat], p) === sq) out.push({ seat, i });
  }));
  return out;
}
const isBarrier = (occ) => occ.length >= 2 && occ.every((o) => o.seat === occ[0].seat);

// Por parejas: quien ya tiene sus 4 fichas en meta mueve las de su compañero
export function controlled(s, seat) {
  if (s.teams && s.pieces[seat].every((p) => p === META)) {
    const mate = s.teams.findIndex((t, k) => k !== seat && t === s.teams[seat]);
    if (mate >= 0) return mate;
  }
  return seat;
}
const teamDone = (s, seat) => s.pieces.every((ps, k) => !sameTeam(s, k, seat) || ps.every((p) => p === META));

export function legalMoves(s, player, steps, bonus) {
  const seat = controlled(s, player);
  const color = s.colors[seat];
  const moves = [];
  s.pieces[seat].forEach((p, i) => {
    if (p === META) return;
    if (p === -1) {
      if (bonus || steps !== 5) return;
      const occ = occupants(s, EXIT[color]);
      if (occ.filter((o) => o.seat === seat).length >= 2) return;
      const foes = occ.filter((o) => !sameTeam(s, o.seat, seat));
      const capture = occ.length >= 2 && foes.length ? foes[foes.length - 1] : null;
      moves.push({ i, to: 0, capture });
      return;
    }
    const np = p + steps;
    if (np > META) return;
    for (let k = p + 1; k <= Math.min(np, 63); k++) {
      const occ = occupants(s, ringOf(color, k));
      if (k < np && isBarrier(occ)) return;
      if (k === np) {
        if (occ.length >= 2) return;
        let capture = null;
        if (occ.length === 1 && !sameTeam(s, occ[0].seat, seat)) {
          if (!SAFE.has(ringOf(color, k))) capture = occ[0];
        }
        moves.push({ i, to: np, capture, owner: seat });
        return;
      }
    }
    if (np > 63) moves.push({ i, to: np, capture: null, owner: seat });
  });
  moves.forEach((m) => { m.owner = seat; });
  // Con un 5 es obligatorio sacar ficha si se puede
  if (!bonus && steps === 5 && moves.some((m) => s.pieces[seat][m.i] === -1)) return moves.filter((m) => s.pieces[seat][m.i] === -1);
  return moves;
}

function nextTurn(s) {
  s.turn = (s.turn + 1) % s.n;
  s.phase = 'roll';
  s.sixes = 0;
  s.again = false;
  s.bonus = [];
}

function continueTurn(s) {
  while (s.bonus.length) {
    const v = s.bonus.shift();
    if (legalMoves(s, s.turn, v, true).length) { s.phase = 'move'; s.steps = v; s.isBonus = true; return; }
    pushLog(s, `{${s.turn}} no puede contar ${v}`);
  }
  s.isBonus = false;
  if (s.again) { s.again = false; s.phase = 'roll'; return; }
  nextTurn(s);
}

export default {
  id: 'parchis',
  name: 'Parchís',
  icon: '🎲',
  color: '#fbc02d',
  minPlayers: 2,
  maxPlayers: 4,
  blurb: 'Saca con 5, come y cuenta 20, y llega a casa con tus 4 fichas. ¡Cuidado con las barreras!',

  setup(n, opts = {}) {
    const colors = n === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, n);
    return {
      n, colors, pieces: colors.map(() => [-1, -1, -1, -1]),
      turn: 0, phase: 'roll', dieVal: null, steps: null, sixes: 0, again: false, bonus: [], isBonus: false,
      last: null, v: 0, log: ['¡Saca un 5 para salir de casa!'], fx: null, teams: opts.teams || null,
    };
  },
  turnOf: (s) => (s.over ? null : s.turn),
  isOver: (s) => !!s.over,

  action(st, seat, a) {
    const s = clone(st);
    s.v++;
    s.fx = null;
    s.moved = null;
    if (s.over) fail('La partida ha terminado');
    if (seat !== s.turn) fail('No es tu turno');
    if (a.type === 'roll') {
      if (s.phase !== 'roll') fail('Ahora toca mover ficha');
      const d = a.cheat && a.cheat >= 1 && a.cheat <= 6 && s.allowCheat ? a.cheat : die();
      s.dieVal = d;
      s.rollId = s.v;
      let steps = d;
      if (d === 6) {
        s.sixes++;
        if (s.pieces[seat].every((p) => p !== -1)) steps = 7;
        if (s.sixes === 3) {
          const l = s.last;
          if (l && l.by === seat && s.pieces[l.seat][l.i] >= 0 && s.pieces[l.seat][l.i] <= 63) {
            s.pieces[l.seat][l.i] = -1;
            s.fx = { id: s.v, type: 'bad', seat, text: '¡Tres seises! Ficha a casa', emoji: '😱' };
          } else s.fx = { id: s.v, type: 'bad', seat, text: '¡Tres seises! Pierdes el turno', emoji: '😱' };
          pushLog(s, `{${seat}} saca tres seises`);
          nextTurn(s);
          return s;
        }
        s.again = true;
      } else s.again = false;
      pushLog(s, `{${seat}} saca un ${d}${steps === 7 ? ' (cuenta 7)' : ''}`);
      const moves = legalMoves(s, seat, steps, false);
      if (!moves.length) {
        pushLog(s, `{${seat}} no puede mover`);
        if (s.again) { s.again = false; s.phase = 'roll'; } else nextTurn(s);
        return s;
      }
      s.phase = 'move';
      s.steps = steps;
      s.isBonus = false;
      return s;
    }
    if (a.type === 'move') {
      if (s.phase !== 'move') fail('Primero tira el dado');
      const m = legalMoves(s, seat, s.steps, s.isBonus).find((x) => x.i === a.i);
      if (!m) fail('Esa ficha no se puede mover');
      const ow = m.owner;
      const from = s.pieces[ow][m.i];
      s.pieces[ow][m.i] = m.to;
      s.last = { seat: ow, i: m.i, by: seat };
      s.moved = { seat: ow, i: m.i, from };
      if (m.capture) {
        s.pieces[m.capture.seat][m.capture.i] = -1;
        s.bonus.push(20);
        s.fx = { id: s.v, type: 'capture', seat, victim: m.capture.seat, text: '¡Te como! +20', emoji: '😋' };
        pushLog(s, `{${seat}} se come a {${m.capture.seat}} y cuenta 20`);
      } else if (from === -1) {
        s.fx = { id: s.v, type: 'special', seat, text: '¡Ficha fuera!', emoji: '🚀' };
      }
      if (m.to === META) {
        s.bonus.push(10);
        s.fx = { id: s.v, type: 'special', seat, text: '¡A casa! +10', emoji: '🏠' };
        pushLog(s, `{${seat}} mete una ficha en la meta`);
        if (teamDone(s, seat)) {
          s.over = true; s.winner = seat;
          s.fx = { id: s.v, type: 'win', seat, text: '¡Ganador!', emoji: '🏆' };
          return s;
        }
      }
      continueTurn(s);
      return s;
    }
    fail('Acción desconocida');
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me === s.turn && !s.over;
    const moves = myTurn && s.phase === 'move' ? legalMoves(s, me, s.steps, s.isBonus) : [];
    const movable = new Set(moves.map((m) => m.i));
    const ctrl = myTurn ? controlled(s, me) : -1;

    // ----- casillas -----
    const cells = [];
    const posOf = new Map(); // "r,c" -> [{seat,i}]
    const add = (rc, tok) => { const k = rc.join(','); if (!posOf.has(k)) posOf.set(k, []); posOf.get(k).push(tok); };
    s.pieces.forEach((ps, seat) => ps.forEach((p, i) => {
      const c = s.colors[seat];
      if (p >= 0 && p <= 63) add(RING[ringOf(c, p)], { seat, i });
      else if (p >= 64 && p <= 70) add(LANE[c][p - 64], { seat, i });
    }));
    const token = (t, small) => {
      const c = COLORS[s.colors[t.seat]];
      const can = t.seat === ctrl && movable.has(t.i);
      const justMoved = s.moved && s.moved.seat === t.seat && s.moved.i === t.i;
      return `<button class="pawn ${small ? 'sm' : ''} ${can ? 'can' : ''} ${justMoved ? 'hop' : ''}" data-flip="p${t.seat}-${t.i}" ${can ? `data-move="${t.i}"` : 'tabindex="-1"'} style="--c:${c.hex};--cd:${c.dark}">${PAWN_SVG}</button>`;
    };
    RING.forEach(([r, c], idx) => {
      const exitOf = EXIT.indexOf(idx);
      const cls = ['cell', SAFE.has(idx) ? 'safe' : ''];
      let style = '';
      if (exitOf >= 0 && usedColors(s).has(exitOf)) style = `background:${COLORS[exitOf].light}`;
      const toks = posOf.get(`${r},${c}`) || [];
      cells.push(`<div class="${cls.join(' ')}" style="grid-row:${r + 1};grid-column:${c + 1};${style}">${SAFE.has(idx) ? '<span class="star">✦</span>' : ''}${toks.map((t) => token(t, toks.length > 1)).join('')}</div>`);
    });
    LANE.forEach((lane, col) => lane.forEach(([r, c]) => {
      const toks = posOf.get(`${r},${c}`) || [];
      cells.push(`<div class="cell lane" style="grid-row:${r + 1};grid-column:${c + 1};background:${COLORS[col].hex}">${toks.map((t) => token(t, toks.length > 1)).join('')}</div>`);
    }));
    // casas
    CORNERS.forEach(([r0, c0], col) => {
      const seat = s.colors.indexOf(col);
      const C = COLORS[col];
      let inner = '';
      if (seat >= 0) {
        const home = s.pieces[seat].map((p, i) => ({ p, i })).filter((x) => x.p === -1);
        inner = `<div class="homeslots">${[0, 1, 2, 3].map((k) => `<div class="slot">${home[k] ? token({ seat, i: home[k].i }) : ''}</div>`).join('')}</div>
                 <div class="homename">${ctx.avatar(seat)} ${esc(ctx.players[seat])}</div>`;
      }
      cells.push(`<div class="home ${seat === s.turn ? 'turn' : ''}" style="grid-row:${r0 + 1}/span 8;grid-column:${c0 + 1}/span 8;--c:${C.hex};--cl:${C.light}">${inner}</div>`);
    });
    // meta
    const metaCounts = s.colors.map((col, seat) => ({ col, n: s.pieces[seat].filter((p) => p === META).length }));
    cells.push(`<div class="meta" style="grid-row:9/span 3;grid-column:9/span 3">
      <div class="tri t0" style="--c:${COLORS[0].hex}"></div><div class="tri t1" style="--c:${COLORS[1].hex}"></div>
      <div class="tri t2" style="--c:${COLORS[2].hex}"></div><div class="tri t3" style="--c:${COLORS[3].hex}"></div>
      ${metaCounts.map(({ col, n }) => (n ? `<span class="mcount m${col}">${n}</span>` : '')).join('')}
    </div>`);

    const dieFace = s.dieVal ? DIE_FACES[s.dieVal] : '🎲';
    const curColor = COLORS[s.colors[s.turn]];
    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (myTurn && s.phase === 'roll') status = '👉 ¡Te toca! Tira el dado';
    else if (myTurn) status = s.isBonus ? `🎁 ¡Cuenta ${s.steps}! Elige ficha` : `Mueve ${s.steps} — toca una ficha que brille`;
    else status = `Turno de <b style="color:${curColor.dark}">${esc(ctx.players[s.turn])}</b>`;

    el.innerHTML = `
      <div class="status">${status}</div>
      <div class="parchis-wrap"><div class="parchis">${cells.join('')}</div></div>
      <div class="dicebar">
        <button class="die3d ${s.rollId === s.v ? 'rolling' : ''}" data-roll ${myTurn && s.phase === 'roll' ? '' : 'disabled'} style="--c:${curColor.hex}">
          <span>${dieFace}</span>
        </button>
        <div class="log">${(s.log || []).slice(0, 3).map((l) => `<div>${ctx.fmt(l)}</div>`).join('')}</div>
      </div>
    `;
    el.querySelector('[data-roll]').onclick = () => ctx.send({ type: 'roll' });
    el.querySelectorAll('[data-move]').forEach((b) => b.onclick = () => ctx.send({ type: 'move', i: +b.dataset.move }));
  },
};

const usedColors = (s) => new Set(s.colors);
const DIE_FACES = [null, '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const PAWN_SVG = `<svg viewBox="0 0 40 48"><defs><radialGradient id="pg" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="20" cy="44" rx="15" ry="4" fill="rgba(0,0,0,.25)"/>
<path d="M20 4a8 8 0 0 1 5 14.2c3 1.6 4.5 4 4.5 6.3h-3c1.6 4.4 4.3 9.3 8 13.5v4H5.5v-4c3.7-4.2 6.4-9.1 8-13.5h-3c0-2.3 1.5-4.7 4.5-6.3A8 8 0 0 1 20 4z" fill="var(--c)" stroke="var(--cd)" stroke-width="2"/>
<path d="M20 4a8 8 0 0 1 5 14.2c3 1.6 4.5 4 4.5 6.3h-3c1.6 4.4 4.3 9.3 8 13.5v4H5.5v-4c3.7-4.2 6.4-9.1 8-13.5h-3c0-2.3 1.5-4.7 4.5-6.3A8 8 0 0 1 20 4z" fill="url(#pg)"/>
<circle cx="17" cy="9" r="2.2" fill="#fff" opacity=".85"/></svg>`;

// ----- geometría del tablero (cuadrícula 19x19) -----
const rot = ([r, c]) => [18 - c, r];
const rotN = (rc, n) => { for (let k = 0; k < n; k++) rc = rot(rc); return rc; };
const ARM_RING = [];
for (let r = 11; r <= 18; r++) ARM_RING.push([r, 8]);
ARM_RING.push([18, 9]);
for (let r = 18; r >= 11; r--) ARM_RING.push([r, 10]);
const ARM_LANE = [];
for (let r = 17; r >= 11; r--) ARM_LANE.push([r, 9]);
export const RING = [];
for (let c = 0; c < 4; c++) ARM_RING.forEach((rc) => RING.push(rotN(rc, c)));
export const LANE = [0, 1, 2, 3].map((c) => ARM_LANE.map((rc) => rotN(rc, c)));
const CORNERS = [[11, 11], [0, 11], [0, 0], [11, 0]];
