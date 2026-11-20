import { clone, die, esc, fail, pushLog, sameTeam } from '../util.js';
import { pieceSVG, PIECE_CHOICES } from './pieces.js';

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

  options: [{ id: 'board', label: '🎨 Tablero', type: 'choice', def: 'clasico', choices: [
    { v: 'clasico', label: '🎲 Clásico' }, { v: 'primavera', label: '🌸 Primavera' }, { v: 'verano', label: '☀️ Verano' },
    { v: 'otono', label: '🍂 Otoño' }, { v: 'invierno', label: '❄️ Invierno' }] },
  { id: 'ficha', label: '🎯 Fichas', type: 'choice', def: 'peon', choices: PIECE_CHOICES }],
  rules: `
    <ol>
      <li>Cada jugador tiene 4 fichas en su casa. <b>Para salir hay que sacar un 5</b> (si puedes sacar, es obligatorio).</li>
      <li>Las fichas dan la vuelta al tablero y entran por el pasillo de su color hasta la meta del centro. Para entrar en la meta hay que sacar el número justo.</li>
      <li><b>Con un 6 repites tirada.</b> Si ya no tienes fichas en casa, el 6 cuenta 7. ¡Tres seises seguidos y la última ficha que moviste vuelve a casa!</li>
      <li><b>Comer:</b> si caes donde hay una ficha rival (fuera de los seguros ✦), te la comes: vuelve a su casa y tú cuentas 20 con la ficha que quieras.</li>
      <li>Al meter una ficha en la meta cuentas 10.</li>
      <li><b>Barrera:</b> dos fichas del mismo color en una casilla no dejan pasar a nadie.</li>
      <li><b>Por parejas:</b> no te comes a tu compañero, y cuando metes tus 4 fichas mueves las suyas. Gana la pareja que meta las 8.</li>
      <li>Gana quien meta primero sus 4 fichas en la meta.</li>
    </ol>`,

  bot(s, seat) {
    if (s.phase === 'roll') return { type: 'roll' };
    const ms = legalMoves(s, seat, s.steps, s.isBonus);
    return { type: 'move', i: (ms.find((m) => m.capture) || ms[(Math.random() * ms.length) | 0]).i };
  },

  demo() {
    const s = this.setup(2);
    s.pieces[1][0] = 38; // ficha roja ya en juego (casilla 17)
    s.pieces[0][3] = 68; // ficha amarilla en su pasillo
    return {
      state: s,
      steps: [
        { say: 'Para sacar una ficha de casa hay que sacar un 5.', seat: 0, a: { type: 'roll', die: 5 }, wait: 1200 },
        { say: '¡Un 5! Ana saca su ficha 🚀', seat: 0, a: { type: 'move', i: 0 }, wait: 2600 },
        { say: 'Leo avanza 2 casillas con su ficha roja…', seat: 1, a: { type: 'roll', die: 2 }, wait: 1000 },
        { say: '…y se queda justo a 6 casillas de Ana.', seat: 1, a: { type: 'move', i: 0 } },
        { say: 'Ana saca un 6. Con 6 se repite tirada.', seat: 0, a: { type: 'roll', die: 6 }, wait: 1000 },
        { say: 'Si caes en una ficha rival fuera de los seguros ✦… ¡te la comes! 😋', seat: 0, a: { type: 'move', i: 0 }, wait: 3500 },
        { say: 'Comer da 20 casillas de premio para la ficha que quieras.', seat: 0, a: { type: 'move', i: 0 }, wait: 2400 },
        { say: 'Y como sacó un 6, vuelve a tirar: un 3 justo para meter la ficha del pasillo en la meta.', seat: 0, a: { type: 'roll', die: 3 }, wait: 1000 },
        { say: '¡Meta! 🏠 Llegar a casa da 10 de premio. ¡Gana quien meta las 4!', seat: 0, a: { type: 'move', i: 3 }, wait: 3800 },
      ],
    };
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    const pawnEl = (seat, i) => el.querySelector(`[data-flip="p${seat}-${i}"]`);
    const col = (seat) => COLORS[ctx.state.colors[seat]];
    if (f.kind === 'exit') {
      const p = pawnEl(f.seat, f.i);
      if (!p) return;
      ctx.sound('launch');
      await fx.wait(480);
      const c = fx.center(p);
      fx.burst(c.x, c.y, { colors: [col(f.seat).hex, '#fff'], count: 50, scale: 0.7 });
      fx.dust(c.x, c.y + 6, 24, 'rgba(255,200,120,.9)');
      ctx.sound('firework');
    }
    if (f.kind === 'capture') {
      const cell = el.querySelector(`[data-ring="${f.ring}"]`);
      const victimHome = pawnEl(f.victim.seat, f.victim.i);
      if (!cell) return;
      if (victimHome) victimHome.style.opacity = '0';
      await fx.wait(420);
      const c = fx.center(cell);
      const vc = col(f.victim.seat);
      ctx.sound('chomp');
      await fx.chomp(c, col(f.seat).hex, `<button class="pawn" style="--c:${vc.hex};--cd:${vc.dark}">${pieceSVG(ctx.state.ficha, vc.hex) || PAWN_SVG}</button>`);
      if (victimHome) {
        victimHome.style.opacity = '';
        const h = fx.center(victimHome);
        fx.dust(h.x, h.y, 20, 'rgba(255,255,255,.9)');
        victimHome.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 400 });
      }
    }
    if (f.kind === 'meta') {
      await fx.wait(450);
      const m = el.querySelector('.meta');
      if (!m) return;
      const r = m.getBoundingClientRect();
      ctx.sound('firework');
      for (let k = 0; k < 4; k++) fx.firework(r.left + r.width / 2 + (k - 1.5) * 40, r.top - 40 - k * 20, { delay: k * 10, colors: [col(f.seat).hex, '#fff'] });
      fx.sparkle(r.left + r.width / 2, r.top + r.height / 2, col(f.seat).light, 24, 1.5);
    }
    if (f.kind === 'sixes') { fx.flash('#fff'); fx.screenShake(12); ctx.sound('boom'); }
    if (f.kind === 'win') { const r = el.getBoundingClientRect(); fx.fireworksShow(r, 10); ctx.sound('firework'); }
  },

  setup(n, opts = {}) {
    const colors = n === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, n);
    return {
      n, colors, pieces: colors.map(() => [-1, -1, -1, -1]),
      turn: 0, phase: 'roll', dieVal: null, steps: null, sixes: 0, again: false, bonus: [], isBonus: false,
      last: null, v: 0, log: ['¡Saca un 5 para salir de casa!'], fx: null, teams: opts.teams || null, board: (opts.options && opts.options.board) || 'clasico', ficha: (opts.options && opts.options.ficha) || 'peon',
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
      const d = s.demo && a.die ? a.die : die();
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
            s.fx = { id: s.v, type: 'bad', kind: 'sixes', seat, text: '¡Tres seises! Ficha a casa', emoji: '😱' };
          } else s.fx = { id: s.v, type: 'bad', kind: 'sixes', seat, text: '¡Tres seises! Pierdes el turno', emoji: '😱' };
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
        const ring = ringOf(s.colors[m.capture.seat], st.pieces[m.capture.seat][m.capture.i]);
        s.fx = { id: s.v, type: 'capture', kind: 'capture', seat: ow, i: m.i, victim: m.capture, ring, text: '¡Te como! +20', emoji: '😋', bannerDelay: 1500, noFlip: [`p${m.capture.seat}-${m.capture.i}`] };
        pushLog(s, `{${seat}} se come a {${m.capture.seat}} y cuenta 20`);
      } else if (from === -1) {
        if (!m.capture) s.fx = { id: s.v, type: 'special', kind: 'exit', seat: ow, i: m.i, text: '¡Ficha fuera!', emoji: '🚀', bannerDelay: 500 };
      }
      if (m.to === META) {
        s.bonus.push(10);
        s.fx = { id: s.v, type: 'special', kind: 'meta', seat: ow, i: m.i, text: '¡A casa! +10', emoji: '🏠', bannerDelay: 500 };
        pushLog(s, `{${seat}} mete una ficha en la meta`);
        if (teamDone(s, seat)) {
          s.over = true; s.winner = seat;
          s.fx = { id: s.v, type: 'win', kind: 'win', seat, text: '¡Ganador!', emoji: '🏆', bannerDelay: 500 };
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
      return `<button class="pawn ${small ? 'sm' : ''} ${can ? 'can' : ''} ${justMoved ? 'hop' : ''}" data-flip="p${t.seat}-${t.i}" ${can ? `data-move="${t.i}"` : 'tabindex="-1"'} style="--c:${c.hex};--cd:${c.dark}">${pieceSVG(s.ficha, c.hex) || PAWN_SVG}</button>`;
    };
    RING.forEach(([r, c], idx) => {
      const exitOf = EXIT.indexOf(idx);
      const cls = ['cell', SAFE.has(idx) ? 'safe' : ''];
      let style = '';
      if (exitOf >= 0 && usedColors(s).has(exitOf)) style = `background:${COLORS[exitOf].light}`;
      const toks = posOf.get(`${r},${c}`) || [];
      const num = ((idx - 8 + 67) % 68) + 1; // numeración clásica: el amarillo sale por la 5
      const vert = c >= 8 && c <= 10;
      cells.push(`<div class="${cls.join(' ')} ${vert ? 'cv' : 'ch'}" data-ring="${idx}" style="grid-row:${r + 1};grid-column:${c + 1};${style}"><span class="cnum">${num}</span>${SAFE.has(idx) ? `<span class="rosette">${exitOf >= 0 ? '▲' : '✿'}</span>` : ''}${toks.map((t) => token(t, toks.length > 1)).join('')}</div>`);
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
      <div class="parchis-wrap theme-${s.board || 'clasico'}"><div class="parchis">${cells.join('')}</div>${THEME_DECOR[s.board] || ''}</div>
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
// decoración de cada tablero temático: cosas que caen y adornos en las esquinas
const falling = (chars, n) => Array.from({ length: n }, (_, i) => `<span class="fall" style="left:${(i * 37 + 7) % 100}%;animation-delay:-${(i * 1.7) % 9}s;animation-duration:${7 + (i % 4) * 1.5}s;font-size:${14 + (i % 3) * 6}px">${chars[i % chars.length]}</span>`).join('');
const corners = (a) => `<span class="cdeco c1">${a[0]}</span><span class="cdeco c2">${a[1]}</span><span class="cdeco c3">${a[2]}</span><span class="cdeco c4">${a[3]}</span>`;
const THEME_DECOR = {
  primavera: `<div class="decor">${falling(['🌸', '🌼', '🦋', '🌸'], 12)}${corners(['🌷', '🐝', '🌼', '🐞'])}</div>`,
  verano: `<div class="decor">${falling(['🫧', '✨'], 8)}${corners(['🌴', '🐚', '⛱️', '🦀'])}<span class="sun">☀️</span></div>`,
  otono: `<div class="decor">${falling(['🍂', '🍁', '🍂', '🍃'], 14)}${corners(['🍄', '🌰', '🦔', '🍁'])}</div>`,
  invierno: `<div class="decor">${falling(['❄️', '❄', '❅', '❄️'], 16)}${corners(['⛄', '🌲', '🧣', '🌲'])}</div>`,
};
const DIE_FACES = [null, '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const PAWN_PATH = 'M20 4a8 8 0 0 1 5 14.2c3 1.6 4.5 4 4.5 6.3h-3c1.6 4.4 4.3 9.3 8 13.5v4H5.5v-4c3.7-4.2 6.4-9.1 8-13.5h-3c0-2.3 1.5-4.7 4.5-6.3A8 8 0 0 1 20 4z';
export const PAWN_SVG = `<svg viewBox="0 0 40 50"><defs>
<radialGradient id="pg" cx="35%" cy="25%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="ps" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient></defs>
<ellipse cx="20" cy="45" rx="16" ry="4.5" fill="rgba(0,0,0,.3)"/>
<path d="M5.5 42 h29 v3 q-14.5 4 -29 0 z" fill="var(--cd)"/>
<path d="${PAWN_PATH}" fill="var(--c)" stroke="var(--cd)" stroke-width="1.6"/>
<path d="${PAWN_PATH}" fill="url(#ps)"/><path d="${PAWN_PATH}" fill="url(#pg)"/>
<ellipse cx="20" cy="24.5" rx="9.5" ry="1.6" fill="var(--cd)" opacity=".55"/>
<circle cx="17" cy="9" r="2.4" fill="#fff" opacity=".9"/></svg>`;

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
