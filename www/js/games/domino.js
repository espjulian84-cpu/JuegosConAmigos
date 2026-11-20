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
    const s = { help: !!(opts.options && opts.options.ayuda), teams: opts.teams || null, n, scores: Array(n).fill(0), target: 100, round: 1, starter: null, v: 0, log: [] };
    newRound(s);
    pushLog(s, 'Empieza quien tiene el doble más alto');
    return s;
  },
  hidden: true,
  viewFor(s, seat) {
    // cada jugador solo recibe sus fichas; las de los demás y el montón van boca abajo
    if (s.roundOver) return s;
    return { ...s, hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => null))), boneyard: s.boneyard.map(() => null) };
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
      s.fx = { id: s.v, type: 'place', seat };
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

  options: [{ id: 'ayuda', label: '💡 Ayuda: resaltar las fichas que encajan', type: 'bool', def: false }],
  rules: `
    <ol>
      <li>Se reparten 7 fichas a cada jugador. Empieza quien tenga el doble más alto.</li>
      <li>Por turnos, pon una ficha que coincida con uno de los dos extremos de la mesa.</li>
      <li>Si no puedes poner, <b>roba</b> del montón hasta que puedas; si no quedan fichas, <b>pasas</b>.</li>
      <li>Gana la ronda quien se quede sin fichas (¡Dominó!) y se lleva los puntos de las fichas de los demás.</li>
      <li>Si nadie puede poner (juego cerrado), gana quien tenga menos puntos en la mano.</li>
      <li><b>Por parejas</b> (4 jugadores): los compañeros se sientan enfrente y suman los puntos juntos.</li>
      <li>Gana quien llegue antes a <b>100 puntos</b>.</li>
    </ol>`,

  bot(s, seat) {
    if (s.roundOver) return { type: 'nextRound' };
    const h = s.hands[seat];
    for (let i = 0; i < h.length; i++) { const sd = sidesFor(s, h[i]); if (sd.length) return { type: 'play', i, side: sd[0] }; }
    return { type: s.boneyard.length ? 'draw' : 'pass' };
  },

  demo() {
    const s = this.setup(2);
    s.hands = [[[6, 6], [3, 6], [1, 3], [2, 4]], [[5, 6], [5, 5], [0, 1]]];
    s.boneyard = [[4, 4], [0, 2]];
    s.turn = 0; s.starter = null;
    return {
      state: s,
      steps: [
        { say: 'Empieza quien tiene el doble más alto: Ana pone el 6|6.', seat: 0, a: { type: 'play', i: 0 } },
        { say: 'Hay que poner una ficha que coincida con un extremo: Leo pone el 6|5.', seat: 1, a: { type: 'play', i: 0, side: 'R' } },
        { say: 'Ana pone el 3|6 al otro lado.', seat: 0, a: { type: 'play', i: 0, side: 'L' } },
        { say: 'Leo pone el doble 5 ✨', seat: 1, a: { type: 'play', i: 0, side: 'R' } },
        { say: 'Ana encaja el 1|3 en el lado del 3.', seat: 0, a: { type: 'play', i: 0, side: 'L' } },
        { say: 'Leo coloca su última ficha, el 0|1… ¡Dominó! Se lleva los puntos que le quedan a Ana.', seat: 1, a: { type: 'play', i: 0, side: 'L' }, wait: 3800 },
      ],
    };
  },

  animate(f, el, ctx) {
    const { fx } = ctx;
    const t = el.querySelector('.tile.drop-in');
    if (t) { const c = fx.center(t); setTimeout(() => fx.dust(c.x, c.y + 10, 30, 'rgba(255,255,255,.7)'), 300); }
    if (f.type === 'special' && t) { const c = fx.center(t); setTimeout(() => { fx.sparkle(c.x, c.y, '#ffe066', 22, 1.5); ctx.sound('special'); }, 350); }
    if ((f.type === 'round' || f.type === 'win') && t) {
      const c = fx.center(t);
      setTimeout(() => { fx.screenShake(10); ctx.sound('boom'); fx.burst(c.x, c.y, { count: 60 }); }, 400);
      if (f.type === 'win') fx.fireworksShow(el.getBoundingClientRect(), 8);
    } else if (!f.type || f.type === 'place') ctx.sound('place');
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

    const table = snakeHTML(s, Math.max(280, (el.clientWidth || 360) + 4));
    const ends = s.chain.length ? [s.chain[0][0], s.chain[s.chain.length - 1][1]] : null;

    let hand = '';
    if (me != null && s.hands[me]) {
      hand = s.hands[me].map((t, i) => {
        const ok = s.help !== false && myTurn && sidesFor(s, t).length > 0;
        return `<button class="tilebtn ${ok ? 'playable' : ''} ${ui.pick === i ? 'picked' : ''}" data-i="${i}" ${myTurn ? '' : 'disabled'}>${tileHTML(t[0], t[1], { vertical: true })}</button>`;
      }).join('');
    }

    let actions = '';
    // sin ayuda, los botones de robar/pasar están siempre (el juego avisa si en realidad puedes poner)
    if (myTurn && (s.help === false || !canPlayAny(s, me))) {
      actions = s.boneyard.length
        ? `<button class="btn big pulse" data-act="draw">🫳 Robar ficha (${s.boneyard.length})</button>`
        : `<button class="btn big pulse" data-act="pass">🙅 Pasar</button>`;
    }
    if (ui.pick != null && myTurn) {
      actions = `<div class="row"><button class="btn big" data-side="L">Poner en el extremo del ${ends[0]} ◀</button><button class="btn big" data-side="R">▶ Poner en el extremo del ${ends[1]}</button></div>`;
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
      ${ends ? `<div class="dends">Se puede poner: <span class="endnum">${ends[0]}</span> o <span class="endnum">${ends[1]}</span></div>` : ''}
      <div class="domino-table felt">
        ${table || '<div class="hint">La mesa está vacía… ¡sale el primero!</div>'}
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
// Mesa en serpiente: filas que van y vuelven, unidas por una flecha curva; las fichas se
// orientan para que los números que se tocan queden juntos. Los dos extremos brillan.
function snakeHTML(s, TW) {
  const C = s.chain;
  if (!C.length) return '';
  const M = 22, avail = TW - 2 * M, gap = 3;
  let u, rows;
  for (u of [34, 30, 27, 24, 21, 19, 17, 15]) {
    rows = [[]];
    let w = 0;
    C.forEach((t, k) => {
      const tw = t[0] === t[1] ? u : 2 * u;
      if (w + tw > avail && rows[rows.length - 1].length) { rows.push([]); w = 0; }
      rows[rows.length - 1].push(k); w += tw + gap;
    });
    if (rows.length * 2.9 * u <= 360) break;
  }
  const rowH = 2 * u, rowGap = 0.9 * u;
  const out = [], pos = [];
  rows.forEach((row, ri) => {
    const y = ri * (rowH + rowGap);
    const rev = ri % 2 === 1;
    let x = rev ? TW - M : M;
    row.forEach((k) => {
      const t = C[k], dbl = t[0] === t[1];
      const w = dbl ? u : 2 * u, h = dbl ? 2 * u : u;
      const left = rev ? x - w : x;
      x = rev ? x - w - gap : x + w + gap;
      const isNew = (s.lastPlaced === 'L' && k === 0) || (s.lastPlaced === 'R' && k === C.length - 1);
      const end = k === 0 || k === C.length - 1;
      const [a, b] = rev && !dbl ? [t[1], t[0]] : [t[0], t[1]];
      pos[k] = { left, top: y + (rowH - h) / 2, w, h, mid: y + rowH / 2 };
      out.push(`<div class="stile ${end ? 'endtile' : ''}" style="left:${left}px;top:${y + (rowH - h) / 2}px">${tileHTML(a, b, { vertical: dbl, cls: isNew ? 'drop-in' : '' })}</div>`);
    });
  });
  // flechas curvas en cada cambio de fila
  const arrows = [];
  rows.forEach((row, ri) => {
    if (ri === rows.length - 1) return;
    const A = pos[row[row.length - 1]], B = pos[rows[ri + 1][0]];
    const right = ri % 2 === 0;
    const x1 = right ? A.left + A.w : A.left, x2 = right ? B.left + B.w : B.left;
    const bx = right ? TW - 6 : 6;
    arrows.push(`<path d="M${x1} ${A.mid} C${bx} ${A.mid} ${bx} ${B.mid} ${x2 + (right ? 6 : -6)} ${B.mid}" class="sarrow" marker-end="url(#ah)"/>`);
  });
  const H = rows.length * rowH + (rows.length - 1) * rowGap;
  return `<div class="snake chain" style="--tw:${u}px;height:${H}px;width:${TW}px">
    <svg class="sarrows" width="${TW}" height="${H}"><defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#ffe066"/></marker></defs>${arrows.join('')}</svg>
    ${out.join('')}</div>`;
}

export function tileHTML(a, b, { vertical = false, cls = '' } = {}) {
  return `<div class="tile ${vertical ? 'v' : 'h'} ${cls}">${half(a, !vertical)}<div class="bar"></div>${half(b, !vertical)}</div>`;
}
