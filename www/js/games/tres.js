import { clone, fail, pushLog, PLAYER_COLORS, esc } from '../util.js';
import { chipsHTML, logHTML, pick } from './common.js';

// Tres en raya: el de toda la vida. Se juega a varias rondas (gana quien antes llegue a las victorias elegidas).
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const SKINS = {
  clasico: ['❌', '⭕'], animales: ['🐱', '🐶'], frutas: ['🍓', '🍋'], espacio: ['🚀', '🛸'], dulces: ['🍩', '🍭'],
};
const lineOf = (b) => LINES.find(([a, c, d]) => b[a] != null && b[a] === b[c] && b[a] === b[d]) || null;

function minimax(b, me, turn) {
  const l = lineOf(b);
  if (l) return { sc: b[l[0]] === me ? 10 : -10 };
  if (b.every((x) => x != null)) return { sc: 0 };
  let best = null;
  for (let i = 0; i < 9; i++) {
    if (b[i] != null) continue;
    b[i] = turn;
    const r = minimax(b, me, 1 - turn);
    b[i] = null;
    const sc = r.sc * 0.9;
    if (!best || (turn === me ? sc > best.sc : sc < best.sc)) best = { sc, i };
  }
  return best;
}

export default {
  id: 'tres',
  name: 'Tres en raya',
  icon: '⭕',
  color: '#20c997',
  cat: 'clasicos',
  minPlayers: 2,
  maxPlayers: 2,
  teams: null,
  blurb: 'Pon tres fichas seguidas en línea antes que tu rival. ¡Rápido y piquero!',
  options: [
    { id: 'skin', label: '🎨 Fichas', type: 'choice', def: 'clasico', choices: [{ v: 'clasico', label: '❌ ⭕' }, { v: 'animales', label: '🐱 🐶' }, { v: 'frutas', label: '🍓 🍋' }, { v: 'espacio', label: '🚀 🛸' }, { v: 'dulces', label: '🍩 🍭' }] },
    { id: 'wins', label: '🏆 Partida a', type: 'choice', def: 3, choices: [{ v: 1, label: '1 victoria' }, { v: 3, label: '3 victorias' }, { v: 5, label: '5 victorias' }] },
  ],
  rules: `<ol>
    <li>Tablero de 3×3. Por turnos, cada uno pone una ficha en una casilla libre.</li>
    <li>Gana la ronda quien consigue <b>tres en línea</b>: en horizontal, vertical o diagonal.</li>
    <li>Si se llena el tablero sin tres en raya, la ronda es <b>empate</b>.</li>
    <li>En cada ronda empieza el otro jugador. Gana la partida quien llegue antes a las victorias elegidas.</li></ol>`,

  setup(n, opts = {}) {
    const o = opts.options || {};
    return { n: 2, b: Array(9).fill(null), turn: 0, starter: 0, wins: [0, 0], target: o.wins || 3, skin: SKINS[o.skin] ? o.skin : 'clasico', v: 0, log: ['¡Tres en raya!'], round: 1 };
  },
  turnOf: (s) => (s.over || s.roundOver ? (s.over ? null : s.starter) : s.turn),
  isOver: (s) => !!s.over,

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (a.type === 'next') {
      if (!s.roundOver) fail('La ronda no ha terminado');
      s.b = Array(9).fill(null); s.roundOver = false; s.line = null; s.round++;
      s.starter = 1 - s.starter; s.turn = s.starter;
      return s;
    }
    if (seat !== s.turn || s.roundOver) fail('No es tu turno');
    if (a.type !== 'put' || !(a.i >= 0 && a.i < 9) || s.b[a.i] != null) fail('Esa casilla está ocupada');
    s.b[a.i] = seat;
    const l = lineOf(s.b);
    if (l) {
      s.wins[seat]++;
      s.line = l; s.roundOver = true;
      pushLog(s, `{${seat}} hace tres en raya`);
      if (s.wins[seat] >= s.target) { s.over = true; s.winner = seat; s.fx = { id: s.v, type: 'win', i: a.i, line: l, seat, text: '¡{' + seat + '} gana la partida!', emoji: '🏆', bannerDelay: 900 }; }
      else s.fx = { id: s.v, type: 'line', i: a.i, line: l, seat, text: '¡Tres en raya!', emoji: SKINS[s.skin][seat], bannerDelay: 700 };
      return s;
    }
    if (s.b.every((x) => x != null)) {
      s.roundOver = true; s.line = null;
      pushLog(s, 'Ronda empatada');
      s.fx = { id: s.v, type: 'draw', i: a.i, text: '¡Empate!', emoji: '🤝', bannerDelay: 300 };
      return s;
    }
    s.turn = 1 - seat;
    s.fx = { id: s.v, type: 'put', i: a.i, seat };
    return s;
  },

  bot(s, seat) {
    if (s.roundOver) return { type: 'next' };
    const free = s.b.map((x, i) => (x == null ? i : -1)).filter((i) => i >= 0);
    if (Math.random() < 0.18) return { type: 'put', i: pick(free) }; // a veces se despista
    if (free.length === 9) return { type: 'put', i: pick([0, 2, 4, 6, 8]) };
    return { type: 'put', i: minimax(s.b.slice(), seat, seat).i };
  },
  botDelay: (s) => (s.roundOver ? 2600 : 900),

  demo() {
    const s = this.setup(2, { options: { wins: 1, skin: 'animales' } });
    const st = (seat, i, say, wait) => ({ seat, a: { type: 'put', i }, say, wait });
    return { state: s, steps: [
      st(0, 4, 'Ana pone su gato en el centro: la mejor casilla.'),
      st(1, 0, 'Leo pone su perro en una esquina.'),
      st(0, 2, 'Ana amenaza la diagonal…'),
      st(1, 6, 'Leo la tapa justo a tiempo, ¡y ahora amenaza él la columna!'),
      st(0, 3, 'Ana tapa la columna y prepara la fila del medio…'),
      st(1, 8, 'Leo se despista y no tapa la fila del medio…'),
      st(0, 5, '¡Ana completa la fila: tres en raya! 🎉', 3500),
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const skin = SKINS[s.skin];
    const myTurn = me === s.turn && !s.roundOver && !s.over;
    const cells = s.b.map((x, i) => `<button class="t3cell ${x != null ? 'full' : ''} ${myTurn && x == null ? 'can' : ''} ${s.line && s.line.includes(i) ? 'win' : ''}" data-i="${i}" style="${x != null ? `--pc:${PLAYER_COLORS[x]}` : ''}">${x != null ? `<span class="t3p">${skin[x]}</span>` : myTurn ? `<span class="t3ghost">${skin[me]}</span>` : ''}</button>`).join('');
    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (s.roundOver) status = s.line ? `<b>${esc(ctx.players[s.b[s.line[0]]])}</b> gana la ronda ${s.round}` : '🤝 Ronda empatada';
    else status = myTurn ? `👉 ¡Te toca! Pon tu ${skin[me]}` : `Turno de <b>${esc(ctx.players[s.turn])}</b> ${skin[s.turn]}`;
    const lineSVG = s.line ? (() => {
      const p = (i) => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];
      const [x1, y1] = p(s.line[0]); const [x2, y2] = p(s.line[2]);
      return `<svg class="t3line" viewBox="0 0 300 300"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${PLAYER_COLORS[s.b[s.line[0]]]}" /></svg>`;
    })() : '';
    el.innerHTML = `
      <div class="players">${chipsHTML(s, ctx, (i) => `${skin[i]} ${'🏆'.repeat(s.wins[i]) || '0'}`, s.over || s.roundOver ? null : s.turn)}</div>
      <div class="status">${status}</div>
      <div class="t3wrap"><div class="t3board">${cells}${lineSVG}</div></div>
      <p class="hint light center">Partida a ${s.target} ${s.target === 1 ? 'victoria' : 'victorias'} · Ronda ${s.round}</p>
      ${s.roundOver && !s.over && me != null ? '<button class="btn big pulse c1" data-next>▶ Siguiente ronda</button>' : ''}
      ${logHTML(s, ctx, 1)}`;
    el.querySelectorAll('.t3cell.can').forEach((b) => b.onclick = () => ctx.send({ type: 'put', i: +b.dataset.i }));
    const nx = el.querySelector('[data-next]'); if (nx) nx.onclick = () => ctx.send({ type: 'next' });
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    const cell = el.querySelector(`.t3cell[data-i="${f.i}"]`);
    if (cell) {
      cell.querySelector('.t3p')?.animate([{ transform: 'scale(0) rotate(-200deg)' }, { transform: 'scale(1.35) rotate(10deg)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.6,.6,1)' });
      const p = fx.center(cell);
      fx.dust(p.x, p.y + 20, 50, 'rgba(255,255,255,.8)');
      ctx.sound('place');
    }
    if (f.type === 'line' || f.type === 'win') {
      await fx.wait(450);
      ctx.sound('special');
      f.line.forEach((i, k) => setTimeout(() => {
        const c = el.querySelector(`.t3cell[data-i="${i}"]`);
        if (!c) return;
        const p = fx.center(c);
        fx.sparkle(p.x, p.y, PLAYER_COLORS[f.seat], 22, 1.4);
        c.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 400 });
      }, k * 160));
      if (f.type === 'win') { await fx.wait(600); fx.fireworksShow(el.querySelector('.t3board').getBoundingClientRect(), 6); }
    }
    if (f.type === 'draw') { ctx.sound('bad'); el.querySelectorAll('.t3cell').forEach((c) => fx.shake(c)); }
  },
};
