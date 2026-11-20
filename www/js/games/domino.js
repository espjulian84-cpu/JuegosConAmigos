import { clone, shuffle, esc, fail, pushLog, PLAYER_COLORS, sameTeam } from '../util.js';

const sum = (t) => t[0] + t[1];
const handPips = (h) => h.reduce((a, t) => a + sum(t), 0);
export const teamScore = (s, seat) => s.scores.reduce((a, v, k) => (sameTeam(s, k, seat) ? a + v : a), 0);

function newRound(s) {
  const tiles = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push([a, b]);
  shuffle(tiles);
  s.hands = Array.from({ length: s.n }, () => tiles.splice(0, 7));
  s.boneyard = tiles;
  s.chain = [];
  s.passes = 0;
  s.roundOver = false;
  s.roundMsg = null;
  if (s.starter == null) {
    let best = -1, who = 0;
    s.hands.forEach((h, i) => h.forEach((t) => { if (t[0] === t[1] && t[0] > best) { best = t[0]; who = i; } }));
    s.turn = who;
  } else s.turn = s.starter;
}

export function sidesFor(s, tile) {
  if (!s.chain.length) return ['R'];
  const L = s.chain[0][0], R = s.chain[s.chain.length - 1][1];
  const out = [];
  if (tile[0] === L || tile[1] === L) out.push('L');
  if (tile[0] === R || tile[1] === R) out.push('R');
  return out;
}
export const canPlayAny = (s, seat) => s.hands[seat].some((t) => sidesFor(s, t).length);

function endRound(s, w, blocked) {
  const pts = s.hands.reduce((a, h, i) => (i === w ? a : a + handPips(h)), 0);
  s.scores[w] += pts;
  s.roundOver = true;
  s.starter = w;
  s.roundMsg = { winner: w, pts, blocked };
  if (teamScore(s, w) >= s.target) { s.over = true; s.winner = w; }
  s.fx = { id: s.v, type: s.over ? 'win' : 'round', seat: w, text: blocked ? `¡Cierre! +${pts}` : `¡Dominó! +${pts}` };
}

export default {
  id: 'domino',
  name: 'Dominó',
  get icon() { return `<span class="dicon">${tileHTML(6, 5, { vertical: true })}</span>`; },
  color: '#ff7043',
  minPlayers: 2,
  maxPlayers: 4,
  blurb: 'El clásico de toda la vida. Coloca tus fichas y quédate sin ninguna. ¡A 100 puntos!',

  setup(n, opts = {}) {
    const s = { teams: opts.teams || null, n, scores: Array(n).fill(0), target: 100, round: 1, starter: null, v: 0, log: [] };
    newRound(s);
    pushLog(s, 'Empieza quien tiene el doble más alto');
    return s;
  },
  turnOf: (s) => (s.over || s.roundOver ? null : s.turn),
  isOver: (s) => !!s.over,

  action(st, seat, a) {
    const s = clone(st);
    s.v++;
    s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (a.type === 'nextRound') {
      if (!s.roundOver) fail('La ronda aún no ha terminado');
      s.round++;
      newRound(s);
      pushLog(s, `Ronda ${s.round}`);
      return s;
    }
    if (s.roundOver) fail('La ronda ha terminado');
    if (seat !== s.turn) fail('No es tu turno');
    const hand = s.hands[seat];
    if (a.type === 'play') {
      const tile = hand[a.i];
      if (!tile) fail('Ficha no válida');
      const sides = sidesFor(s, tile);
      const side = a.side || sides[0];
      if (!sides.includes(side)) fail('Esa ficha no encaja ahí');
      if (!s.chain.length) s.chain.push([tile[0], tile[1]]);
      else if (side === 'L') {
        const L = s.chain[0][0];
        s.chain.unshift(tile[1] === L ? [tile[0], tile[1]] : [tile[1], tile[0]]);
      } else {
        const R = s.chain[s.chain.length - 1][1];
        s.chain.push(tile[0] === R ? [tile[0], tile[1]] : [tile[1], tile[0]]);
      }
      s.lastPlaced = side === 'L' ? 'L' : 'R';
      hand.splice(a.i, 1);
      s.passes = 0;
      pushLog(s, `{${seat}} pone ${tile[0]}|${tile[1]}`);
      if (tile[0] === tile[1]) s.fx = { id: s.v, type: 'special', seat, text: `¡Doble ${tile[0]}!`, emoji: '✨' };
      if (!hand.length) { endRound(s, seat, false); return s; }
      s.turn = (s.turn + 1) % s.n;
      return s;
    }
    if (a.type === 'draw') {
      if (canPlayAny(s, seat)) fail('Tienes alguna ficha que puedes poner');
      if (!s.boneyard.length) fail('No quedan fichas para robar');
      hand.push(s.boneyard.pop());
      pushLog(s, `{${seat}} roba una ficha`);
      return s;
    }
    if (a.type === 'pass') {
      if (canPlayAny(s, seat)) fail('Tienes alguna ficha que puedes poner');
      if (s.boneyard.length) fail('Primero roba del montón');
      s.passes++;
      pushLog(s, `{${seat}} pasa`);
      if (s.passes >= s.n) {
        let w = 0;
        s.hands.forEach((h, i) => { if (handPips(h) < handPips(s.hands[w])) w = i; });
        endRound(s, w, true);
        return s;
      }
      s.turn = (s.turn + 1) % s.n;
      return s;
    }
    fail('Acción desconocida');
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me != null && me === s.turn && !s.roundOver && !s.over;
    const ui = ctx.ui;
    if (ui.v !== s.v) { ui.v = s.v; ui.pick = null; }

    const players = s.hands.map((h, i) => `
      <div class="pchip ${i === s.turn && !s.roundOver ? 'turn' : ''}" style="--pc:${PLAYER_COLORS[i]}">
        <span class="avatar">${ctx.avatar(i)}</span>
        <span class="pname">${esc(ctx.players[i])}</span>
        <span class="pinfo"><i class="minitile"></i>×${h.length} · ⭐${s.teams ? teamScore(s, i) : s.scores[i]}</span>
      </div>`).join('');

    const chain = s.chain.map((t, k) => {
      const isNew = (s.lastPlaced === 'L' && k === 0) || (s.lastPlaced === 'R' && k === s.chain.length - 1);
      return tileHTML(t[0], t[1], { vertical: t[0] === t[1], cls: isNew ? 'drop-in' : '' });
    }).join('');

    let hand = '';
    if (me != null && s.hands[me]) {
      hand = s.hands[me].map((t, i) => {
        const ok = myTurn && sidesFor(s, t).length > 0;
        return `<button class="tilebtn ${ok ? 'playable' : ''} ${ui.pick === i ? 'picked' : ''}" data-i="${i}" ${myTurn ? '' : 'disabled'}>${tileHTML(t[0], t[1], { vertical: true })}</button>`;
      }).join('');
    }

    let actions = '';
    if (myTurn && !canPlayAny(s, me)) {
      actions = s.boneyard.length
        ? `<button class="btn big pulse" data-act="draw">🫳 Robar ficha (${s.boneyard.length})</button>`
        : `<button class="btn big pulse" data-act="pass">🙅 Pasar</button>`;
    }
    if (ui.pick != null && myTurn) {
      actions = `<div class="row"><button class="btn big" data-side="L">◀ Izquierda</button><button class="btn big" data-side="R">Derecha ▶</button></div>`;
    }

    let status;
    if (s.roundOver) {
      const m = s.roundMsg;
      if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(m.winner)} con ${teamScore(s, m.winner)} puntos!`;
      else status = `🏆 <b>${esc(ctx.players[m.winner])}</b> gana la ronda ${m.blocked ? '(juego cerrado)' : ''} y suma ${m.pts} puntos`;
    } else status = myTurn ? '👉 ¡Te toca! Toca una ficha para ponerla' : `Turno de <b>${esc(ctx.players[s.turn])}</b>`;

    const nextBtn = s.roundOver && !s.over && me != null ? `<button class="btn big pulse" data-act="nextRound">▶ Siguiente ronda</button>` : '';

    el.innerHTML = `
      <div class="players">${players}</div>
      <div class="status">${status}</div>
      <div class="domino-table felt">
        <div class="chain">${chain || '<div class="hint">La mesa está vacía… ¡sale el primero!</div>'}</div>
        <div class="boneyard">Montón: ${s.boneyard.length}</div>
      </div>
      <div class="actions">${actions}${nextBtn}</div>
      ${me != null ? `<div class="hand-label">Tus fichas</div><div class="hand">${hand}</div>` : '<div class="hint">Estás mirando la partida</div>'}
    `;

    el.querySelectorAll('.tilebtn').forEach((b) => b.onclick = () => {
      const i = +b.dataset.i;
      const sides = sidesFor(s, s.hands[me][i]);
      if (!sides.length) { ctx.toast('Esa ficha no encaja 😅'); return; }
      const ends = s.chain.length ? [s.chain[0][0], s.chain[s.chain.length - 1][1]] : null;
      if (sides.length === 1 || (ends && ends[0] === ends[1])) ctx.send({ type: 'play', i, side: sides[0] });
      else { ui.pick = i; ctx.rerender(); }
    });
    el.querySelectorAll('[data-side]').forEach((b) => b.onclick = () => ctx.send({ type: 'play', i: ui.pick, side: b.dataset.side }));
    el.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => ctx.send({ type: b.dataset.act }));
  },
};

const PIPS_V = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const PIPS_H = { ...PIPS_V, 2: [2, 6], 3: [2, 4, 6], 6: [0, 1, 2, 6, 7, 8] };
const PIP_COLORS = ['#000', '#e53935', '#1e88e5', '#43a047', '#8e24aa', '#fb8c00', '#00897b'];
function half(n, horizontal) {
  const on = (horizontal ? PIPS_H : PIPS_V)[n];
  let h = '';
  for (let k = 0; k < 9; k++) h += `<i class="${on.includes(k) ? 'pip' : ''}" style="--pip:${PIP_COLORS[n]}"></i>`;
  return `<div class="half">${h}</div>`;
}
export function tileHTML(a, b, { vertical = false, cls = '' } = {}) {
  return `<div class="tile ${vertical ? 'v' : 'h'} ${cls}">${half(a, !vertical)}<div class="bar"></div>${half(b, !vertical)}</div>`;
}
