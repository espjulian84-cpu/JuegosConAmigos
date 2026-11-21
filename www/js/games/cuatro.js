import { clone, fail, pushLog, PLAYER_COLORS, esc } from '../util.js';
import { chipsHTML, logHTML } from './common.js';

// Cuatro en raya: se dejan caer fichas por columnas; gana quien junte cuatro en línea.
const W = 7, H = 6;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
function fourAt(b, r, c) {
  const p = b[r][c];
  for (const [dr, dc] of DIRS) {
    const cells = [[r, c]];
    for (const sg of [1, -1]) {
      let rr = r + dr * sg, cc = c + dc * sg;
      while (rr >= 0 && rr < H && cc >= 0 && cc < W && b[rr][cc] === p) { cells.push([rr, cc]); rr += dr * sg; cc += dc * sg; }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}
const dropRow = (b, c) => { for (let r = H - 1; r >= 0; r--) if (b[r][c] == null) return r; return -1; };

// --- Máquina: negamax con poda alfa-beta y evaluación por ventanas de 4 ---
function evalBoard(b, me) {
  let sc = 0;
  for (let r = 0; r < H; r++) if (b[r][3] === me) sc += 3; else if (b[r][3] === 1 - me) sc -= 3;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) for (const [dr, dc] of DIRS) {
    const er = r + dr * 3, ec = c + dc * 3;
    if (er < 0 || er >= H || ec < 0 || ec >= W) continue;
    let m = 0, o = 0;
    for (let k = 0; k < 4; k++) { const v = b[r + dr * k][c + dc * k]; if (v === me) m++; else if (v === 1 - me) o++; }
    if (m && o) continue;
    if (m === 3) sc += 5; else if (m === 2) sc += 2;
    if (o === 3) sc -= 6; else if (o === 2) sc -= 2;
  }
  return sc;
}
function negamax(b, depth, alpha, beta, who) {
  const order = [3, 2, 4, 1, 5, 0, 6];
  let any = false;
  for (const c of order) {
    const r = dropRow(b, c);
    if (r < 0) continue;
    any = true;
    b[r][c] = who; const win = fourAt(b, r, c); b[r][c] = null;
    if (win) return 1000 + depth;
  }
  if (!any) return 0;
  if (depth === 0) return evalBoard(b, who);
  let best = -Infinity;
  for (const c of order) {
    const r = dropRow(b, c);
    if (r < 0) continue;
    b[r][c] = who;
    const v = -negamax(b, depth - 1, -beta, -alpha, 1 - who);
    b[r][c] = null;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export default {
  id: 'cuatro',
  name: 'Cuatro en raya',
  icon: '🔴',
  color: '#fa5252',
  cat: 'clasicos',
  minPlayers: 2,
  maxPlayers: 2,
  teams: null,
  blurb: 'Deja caer tus fichas por las columnas y junta cuatro en línea. ¡Ojo con las trampas diagonales!',
  options: [
    { id: 'wins', label: '🏆 Partida a', type: 'choice', def: 3, choices: [{ v: 1, label: '1 victoria' }, { v: 3, label: '3 victorias' }, { v: 5, label: '5 victorias' }] },
  ],
  rules: `<ol>
    <li>El tablero tiene 7 columnas y 6 filas, de pie.</li>
    <li>Por turnos, eliges una <b>columna</b> y tu ficha cae hasta el fondo.</li>
    <li>Gana quien consiga <b>cuatro fichas seguidas</b>: horizontal, vertical o diagonal.</li>
    <li>Si se llena el tablero, empate. En cada ronda empieza el otro.</li></ol>`,

  setup(n, opts = {}) {
    const o = opts.options || {};
    return { n: 2, b: Array.from({ length: H }, () => Array(W).fill(null)), turn: 0, starter: 0, wins: [0, 0], target: o.wins || 3, v: 0, round: 1, log: ['¡Cuatro en raya!'] };
  },
  turnOf: (s) => (s.over ? null : s.roundOver ? s.starter : s.turn),
  isOver: (s) => !!s.over,

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (a.type === 'next') {
      if (!s.roundOver) fail('La ronda no ha terminado');
      s.b = Array.from({ length: H }, () => Array(W).fill(null)); s.roundOver = false; s.line = null; s.last = null; s.round++;
      s.starter = 1 - s.starter; s.turn = s.starter;
      return s;
    }
    if (seat !== s.turn || s.roundOver) fail('No es tu turno');
    const c = a.c;
    if (a.type !== 'drop' || !(c >= 0 && c < W)) fail('Columna no válida');
    const r = dropRow(s.b, c);
    if (r < 0) fail('Esa columna está llena');
    s.b[r][c] = seat;
    s.last = [r, c];
    const line = fourAt(s.b, r, c);
    if (line) {
      s.wins[seat]++; s.line = line; s.roundOver = true;
      pushLog(s, `{${seat}} conecta cuatro`);
      if (s.wins[seat] >= s.target) { s.over = true; s.winner = seat; }
      s.fx = { id: s.v, type: s.over ? 'win' : 'line', r, c, seat, line, text: s.over ? '¡{' + seat + '} gana la partida!' : '¡Cuatro en raya!', emoji: s.over ? '🏆' : '🔥', bannerDelay: 800 };
      return s;
    }
    if (s.b[0].every((x) => x != null)) {
      s.roundOver = true; pushLog(s, 'Tablero lleno: empate');
      s.fx = { id: s.v, type: 'draw', r, c, seat, text: '¡Empate!', emoji: '🤝', bannerDelay: 500 };
      return s;
    }
    s.turn = 1 - seat;
    s.fx = { id: s.v, type: 'drop', r, c, seat };
    return s;
  },

  bot(s, seat) {
    if (s.roundOver) return { type: 'next' };
    const b = s.b.map((row) => row.slice());
    let best = -Infinity, pickC = 3;
    for (const c of [3, 2, 4, 1, 5, 0, 6]) {
      const r = dropRow(b, c);
      if (r < 0) continue;
      b[r][c] = seat;
      const v = fourAt(b, r, c) ? 5000 : -negamax(b, 4, -Infinity, Infinity, 1 - seat) + Math.random() * 3;
      b[r][c] = null;
      if (v > best) { best = v; pickC = c; }
    }
    return { type: 'drop', c: pickC };
  },
  botDelay: (s) => (s.roundOver ? 2800 : 900),

  demo() {
    const s = this.setup(2, { options: { wins: 1 } });
    const d = (seat, c, say, wait) => ({ seat, a: { type: 'drop', c }, say, wait });
    return { state: s, steps: [
      d(0, 3, 'Ana deja caer su ficha en la columna del centro.'),
      d(1, 2, 'Leo pone la suya al lado.'),
      d(0, 3, 'Ana pone otra encima de la suya…'),
      d(1, 4, 'Leo se va al otro lado.'),
      d(0, 3, '¡Ana ya tiene tres en vertical! Leo tendría que tapar arriba…'),
      d(1, 0, '…pero Leo no lo ve.'),
      d(0, 3, '¡Cuatro en vertical! Ana gana. 🎉', 3500),
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me === s.turn && !s.roundOver && !s.over;
    const inLine = (r, c) => s.line && s.line.some(([a, b]) => a === r && b === c);
    let cells = '';
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const v = s.b[r][c];
      cells += `<div class="c4cell" data-r="${r}" data-c="${c}">${v != null ? `<i class="c4disc ${inLine(r, c) ? 'win' : ''} ${s.last && s.last[0] === r && s.last[1] === c ? 'last' : ''}" style="--pc:${PLAYER_COLORS[v]}"></i>` : ''}</div>`;
    }
    const cols = Array.from({ length: W }, (_, c) => `<button class="c4col ${myTurn && s.b[0][c] == null ? 'can' : ''}" data-c="${c}" style="--col:${c}">${myTurn && s.b[0][c] == null ? `<i class="c4disc ghost" style="--pc:${PLAYER_COLORS[me]}"></i>` : ''}</button>`).join('');
    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (s.roundOver) status = s.line ? `<b>${esc(ctx.players[s.b[s.line[0][0]][s.line[0][1]]])}</b> gana la ronda ${s.round}` : '🤝 Empate';
    else status = myTurn ? '👉 ¡Te toca! Toca una columna' : `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    el.innerHTML = `
      <div class="players">${chipsHTML(s, ctx, (i) => `<i class="c4mini" style="--pc:${PLAYER_COLORS[i]}"></i> ${'🏆'.repeat(s.wins[i]) || '0'}`, s.over || s.roundOver ? null : s.turn)}</div>
      <div class="status">${status}</div>
      <div class="c4wrap"><div class="c4board">${cells}<div class="c4cols">${cols}</div></div><div class="c4feet"><i></i><i></i></div></div>
      <p class="hint light center">Partida a ${s.target} ${s.target === 1 ? 'victoria' : 'victorias'} · Ronda ${s.round}</p>
      ${s.roundOver && !s.over && me != null ? '<button class="btn big pulse c1" data-next>▶ Siguiente ronda</button>' : ''}
      ${logHTML(s, ctx, 1)}`;
    el.querySelectorAll('.c4col.can').forEach((b) => b.onclick = () => ctx.send({ type: 'drop', c: +b.dataset.c }));
    const nx = el.querySelector('[data-next]'); if (nx) nx.onclick = () => ctx.send({ type: 'next' });
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    const disc = el.querySelector(`.c4cell[data-r="${f.r}"][data-c="${f.c}"] .c4disc`);
    if (disc) {
      const cell = disc.parentElement;
      const h = cell.getBoundingClientRect().height;
      ctx.sound('whoosh');
      await disc.animate([{ transform: `translateY(${-(f.r + 1) * h}px)` }, { transform: 'translateY(0)', offset: 0.7 }, { transform: `translateY(${-h * 0.18}px)`, offset: 0.85 }, { transform: 'translateY(0)' }], { duration: 300 + f.r * 70, easing: 'cubic-bezier(.5,0,1,1)' }).finished.catch(() => {});
      ctx.sound('knock');
    }
    if (f.type === 'line' || f.type === 'win') {
      ctx.sound('special');
      f.line.forEach(([r, c], k) => setTimeout(() => {
        const d = el.querySelector(`.c4cell[data-r="${r}"][data-c="${c}"]`);
        if (d) { const p = fx.center(d); fx.sparkle(p.x, p.y, PLAYER_COLORS[f.seat], 18, 1.3); fx.burst(p.x, p.y, { color: PLAYER_COLORS[f.seat], n: 10 }); }
      }, k * 150));
      if (f.type === 'win') { await fx.wait(700); fx.fireworksShow(el.querySelector('.c4board').getBoundingClientRect(), 7); }
    }
    if (f.type === 'draw') ctx.sound('bad');
  },
};
