import { clone, fail, pushLog, esc } from '../util.js';
import { chipsHTML, logHTML } from './common.js';

// Damas (reglas españolas): peones hacia delante, comer es obligatorio y hay que comer el máximo de fichas.
// La dama vuela: se mueve y come a cualquier distancia en diagonal.
const N = 8;
const COLORS = [{ name: 'blancas', fill: '#fff4dc', edge: '#d9c39b' }, { name: 'negras', fill: '#3a2a2a', edge: '#160d0d' }];
const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const fwd = (p) => (p === 0 ? -1 : 1);

function initBoard() {
  const b = Array.from({ length: N }, () => Array(N).fill(null));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if ((r + c) % 2 !== 1) continue;
    if (r < 3) b[r][c] = { p: 1, k: false };
    if (r > 4) b[r][c] = { p: 0, k: false };
  }
  return b;
}

// Saltos posibles desde (r,c) con la pieza "pc", sin repetir fichas ya comidas
function jumps(b, r, c, pc, taken) {
  const out = [];
  for (const [dr, dc] of DIAG) {
    if (!pc.k && dr !== fwd(pc.p)) continue; // el peón solo come hacia delante
    if (!pc.k) {
      const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
      if (!inB(lr, lc)) continue;
      const m = b[mr][mc];
      if (m && m.p !== pc.p && !taken.some(([a, d]) => a === mr && d === mc) && !b[lr][lc]) out.push({ cap: [mr, mc], land: [[lr, lc]] });
    } else {
      let mr = r + dr, mc = c + dc;
      while (inB(mr, mc) && !b[mr][mc]) { mr += dr; mc += dc; }
      if (!inB(mr, mc)) continue;
      const m = b[mr][mc];
      if (!m || m.p === pc.p || taken.some(([a, d]) => a === mr && d === mc)) continue;
      const lands = [];
      let lr = mr + dr, lc = mc + dc;
      while (inB(lr, lc) && !b[lr][lc]) { lands.push([lr, lc]); lr += dr; lc += dc; }
      if (lands.length) out.push({ cap: [mr, mc], land: lands });
    }
  }
  return out;
}
function captureSeqs(b, r0, c0) {
  const pc = b[r0][c0];
  const res = [];
  const dfs = (r, c, path, taken) => {
    const js = jumps(b, r, c, pc, taken);
    let ext = false;
    for (const j of js) for (const [lr, lc] of j.land) {
      ext = true;
      // la ficha que se mueve deja su casilla libre mientras salta
      b[r0][c0] = null;
      dfs(lr, lc, [...path, [lr, lc]], [...taken, j.cap]);
      b[r0][c0] = pc;
    }
    if (!ext && taken.length) res.push({ from: [r0, c0], path, caps: taken });
  };
  dfs(r0, c0, [], []);
  return res;
}
export function legalMoves(b, p) {
  let caps = [], simple = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const pc = b[r][c];
    if (!pc || pc.p !== p) continue;
    caps.push(...captureSeqs(b, r, c));
    for (const [dr, dc] of DIAG) {
      if (!pc.k && dr !== fwd(p)) continue;
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc) && !b[rr][cc]) {
        simple.push({ from: [r, c], path: [[rr, cc]], caps: [] });
        if (!pc.k) break;
        rr += dr; cc += dc;
      }
    }
  }
  if (caps.length) {
    const max = Math.max(...caps.map((m) => m.caps.length));
    const kingsOf = (m) => m.caps.filter(([r, c]) => b[r][c].k).length;
    caps = caps.filter((m) => m.caps.length === max);
    const mk = Math.max(...caps.map(kingsOf));
    return caps.filter((m) => kingsOf(m) === mk);
  }
  return simple;
}
function applyMove(b, m) {
  const pc = b[m.from[0]][m.from[1]];
  b[m.from[0]][m.from[1]] = null;
  m.caps.forEach(([r, c]) => { b[r][c] = null; });
  const [er, ec] = m.path[m.path.length - 1];
  const crown = !pc.k && er === (pc.p === 0 ? 0 : N - 1);
  b[er][ec] = { p: pc.p, k: pc.k || crown };
  return crown;
}
const sameMove = (a, m) => a.from[0] === m.from[0] && a.from[1] === m.from[1] && JSON.stringify(a.path) === JSON.stringify(m.path);

function evalB(b, p) {
  let sc = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const pc = b[r][c];
    if (!pc) continue;
    const adv = pc.p === 0 ? 7 - r : r;
    const v = pc.k ? 3.2 : 1 + adv * 0.06 + (c > 1 && c < 6 ? 0.05 : 0);
    sc += pc.p === p ? v : -v;
  }
  return sc;
}
function search(b, p, depth, alpha, beta) {
  const ms = legalMoves(b, p);
  if (!ms.length) return -100 - depth;
  if (depth === 0) return evalB(b, p);
  let best = -Infinity;
  for (const m of ms) {
    const nb = b.map((row) => row.map((x) => (x ? { ...x } : null)));
    applyMove(nb, m);
    const v = -search(nb, 1 - p, depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

const pieceSVG = (pc) => {
  const col = COLORS[pc.p];
  return `<svg viewBox="0 0 40 40" class="dpiece"><ellipse cx="20" cy="24" rx="17" ry="13" fill="${col.edge}"/><ellipse cx="20" cy="20" rx="17" ry="13" fill="${col.fill}"/>
    <ellipse cx="20" cy="20" rx="12" ry="9" fill="none" stroke="${col.edge}" stroke-width="1.6" opacity=".8"/><ellipse cx="20" cy="20" rx="7" ry="5" fill="none" stroke="${col.edge}" stroke-width="1.2" opacity=".6"/>
    <ellipse cx="14" cy="14" rx="6" ry="2.6" fill="#fff" opacity="${pc.p ? 0.18 : 0.6}"/>
    ${pc.k ? '<text x="20" y="25" text-anchor="middle" font-size="16">👑</text>' : ''}</svg>`;
};

export default {
  id: 'damas',
  name: 'Damas',
  icon: '⚪',
  color: '#a0522d',
  cat: 'clasicos',
  minPlayers: 2,
  maxPlayers: 2,
  teams: null,
  blurb: 'Las damas de siempre con reglas españolas: comer es obligatorio y la dama vuela por la diagonal.',
  rules: `<ol>
    <li>Cada jugador tiene 12 fichas en las casillas oscuras. Empiezan las <b>blancas</b>.</li>
    <li>Los peones avanzan <b>una casilla en diagonal hacia delante</b>.</li>
    <li>Se <b>come saltando</b> por encima de una ficha rival a una casilla libre. Los peones solo comen hacia delante.</li>
    <li><b>Comer es obligatorio</b>, y si puedes comer varias seguidas, hay que hacerlo. Si hay varias opciones, hay que coger la que más fichas come.</li>
    <li>Al llegar al final el peón se corona y es <b>dama 👑</b>: se mueve y come a cualquier distancia en diagonal, hacia delante y hacia atrás.</li>
    <li>Gana quien deja al rival sin fichas o sin poder mover.</li></ol>`,

  setup() {
    return { n: 2, b: initBoard(), turn: 0, v: 0, quiet: 0, log: ['Empiezan las blancas'], last: null, counts: [12, 12] };
  },
  turnOf: (s) => (s.over ? null : s.turn),
  isOver: (s) => !!s.over,

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat !== s.turn) fail('No es tu turno');
    if (a.type === 'resign') {
      s.over = true; s.winner = 1 - seat; pushLog(s, `{${seat}} se rinde`);
      s.fx = { id: s.v, type: 'win', text: '¡{' + (1 - seat) + '} gana!', emoji: '🏳️' };
      return s;
    }
    if (a.type !== 'move') fail('Acción desconocida');
    const ms = legalMoves(s.b, seat);
    const m = ms.find((x) => sameMove(x, a));
    if (!m) fail(ms.some((x) => x.caps.length) ? '¡Comer es obligatorio! (y hay que comer el máximo)' : 'Ese movimiento no vale');
    const wasKing = s.b[m.from[0]][m.from[1]].k;
    const capKinds = m.caps.map(([r, c]) => ({ r, c, pc: s.b[r][c] }));
    const crown = applyMove(s.b, m);
    s.last = m;
    s.counts = [0, 1].map((p) => s.b.flat().filter((x) => x && x.p === p).length);
    s.quiet = m.caps.length || !wasKing ? 0 : s.quiet + 1;
    if (m.caps.length) pushLog(s, `{${seat}} come ${m.caps.length} ${m.caps.length > 1 ? 'fichas' : 'ficha'}`);
    else pushLog(s, `{${seat}} mueve`);
    s.turn = 1 - seat;
    const fx = { id: s.v, type: m.caps.length ? 'capture' : 'move', m, seat, caps: capKinds, crown, noFlip: [] };
    if (m.caps.length >= 2) { fx.text = m.caps.length >= 3 ? `¡Triple! ¡Se come ${m.caps.length}!` : '¡Doble salto!'; fx.emoji = '🔥'; fx.bannerDelay = 300 + m.path.length * 280; }
    if (crown) { fx.text = '¡Coronada! Ahora es dama'; fx.emoji = '👑'; fx.bannerDelay = 300 + m.path.length * 280; }
    if (!legalMoves(s.b, s.turn).length) {
      s.over = true; s.winner = seat;
      fx.type = 'win'; fx.text = s.counts[s.turn] ? '¡{' + s.turn + '} se queda sin movimientos!' : '¡{' + seat + '} gana!'; fx.emoji = '🏆'; fx.bannerDelay = 400 + m.path.length * 280;
      pushLog(s, `🏆 {${seat}} gana la partida`);
    } else if (s.quiet >= 50) {
      s.over = true; s.tie = true; s.winner = seat;
      fx.type = 'win'; fx.text = '¡Tablas! 50 jugadas sin comer'; fx.emoji = '🤝';
    }
    s.fx = fx;
    return s;
  },

  bot(s, seat) {
    const ms = legalMoves(s.b, seat);
    let best = -Infinity, choice = ms[0];
    const depth = ms.length > 10 ? 3 : 4;
    for (const m of ms) {
      const nb = s.b.map((row) => row.map((x) => (x ? { ...x } : null)));
      applyMove(nb, m);
      const v = -search(nb, 1 - seat, depth, -Infinity, Infinity) + Math.random() * 0.15;
      if (v > best) { best = v; choice = m; }
    }
    return { type: 'move', from: choice.from, path: choice.path };
  },

  demo() {
    const s = this.setup();
    s.b = Array.from({ length: N }, () => Array(N).fill(null));
    s.b[5][2] = { p: 0, k: false }; s.b[6][5] = { p: 0, k: false }; s.b[2][3] = { p: 0, k: false };
    s.b[4][3] = { p: 1, k: false }; s.b[2][5] = { p: 1, k: false }; s.b[0][1] = { p: 1, k: false };
    s.counts = [3, 3];
    return { state: s, steps: [
      { say: 'Las blancas tienen fichas negras delante. ¡Comer es obligatorio, y todas las que se pueda!', seat: 0, a: { type: 'move', from: [5, 2], path: [[3, 4], [1, 6]] }, wait: 3200 },
      { say: 'Las negras avanzan… y se ponen a tiro.', seat: 1, a: { type: 'move', from: [0, 1], path: [[1, 2]] } },
      { say: 'La blanca come y llega al final: ¡se corona y es dama! 👑', seat: 0, a: { type: 'move', from: [2, 3], path: [[0, 1]] }, wait: 3200 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const view = me === 1 ? 1 : 0; // cada uno ve sus fichas abajo
    const myTurn = me === s.turn && !s.over;
    const ui = ctx.ui.damas || (ctx.ui.damas = {});
    const ms = myTurn ? legalMoves(s.b, me) : [];
    if (ui.v !== s.v) { ui.v = s.v; ui.sel = null; }
    const movable = new Set(ms.map((m) => m.from.join()));
    const dests = ui.sel ? ms.filter((m) => m.from.join() === ui.sel) : [];
    const destSet = new Map(dests.map((m) => [m.path[m.path.length - 1].join(), m]));
    const lastSet = new Set(s.last ? [s.last.from.join(), ...s.last.path.map((p) => p.join())] : []);
    let cells = '';
    for (let vr = 0; vr < N; vr++) for (let vc = 0; vc < N; vc++) {
      const r = view ? N - 1 - vr : vr, c = view ? N - 1 - vc : vc;
      const dark = (r + c) % 2 === 1;
      const pc = s.b[r][c];
      const key = `${r},${c}`;
      cells += `<div class="dcell ${dark ? 'dark' : ''} ${lastSet.has(key) ? 'last' : ''} ${destSet.has(key) ? 'dest' : ''} ${ui.sel === key ? 'sel' : ''} ${movable.has(key) ? 'can' : ''}" data-k="${key}">${pc ? `<div class="dpc" data-pc="${key}">${pieceSVG(pc)}</div>` : ''}</div>`;
    }
    const mustCap = ms.some((m) => m.caps.length);
    let status;
    if (s.over) status = s.tie ? '🤝 ¡Tablas!' : `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (myTurn) status = mustCap ? '⚠️ ¡Tienes que comer!' : ui.sel ? '👉 Toca dónde va' : '👉 ¡Te toca! Toca una ficha';
    else status = `Turno de <b>${esc(ctx.players[s.turn])}</b> (${COLORS[s.turn].name})`;
    el.innerHTML = `
      <div class="players">${chipsHTML(s, ctx, (i) => `<i class="dmini" style="background:${COLORS[i].fill};border-color:${COLORS[i].edge}"></i>${s.counts[i]}`)}</div>
      <div class="status">${status}</div>
      <div class="dwrap"><div class="dboard">${cells}</div></div>
      ${myTurn && !s.over ? '<div class="row center"><button class="btn small" data-resign>🏳️ Rendirse</button></div>' : ''}
      ${logHTML(s, ctx, 1)}`;
    el.querySelectorAll('.dcell').forEach((cell) => cell.onclick = () => {
      if (!myTurn) return;
      const k = cell.dataset.k;
      if (destSet.has(k)) { const m = destSet.get(k); ui.sel = null; ctx.send({ type: 'move', from: m.from, path: m.path }); return; }
      if (movable.has(k)) { ui.sel = ui.sel === k ? null : k; ctx.sound('click'); ctx.rerender(); return; }
      if (s.b[+k[0]][+k[2]] && s.b[+k[0]][+k[2]].p === me) { ctx.toast(mustCap ? '¡Tienes que comer con otra ficha!' : 'Esa ficha no puede moverse'); }
    });
    const rs = el.querySelector('[data-resign]'); if (rs) rs.onclick = () => { if (confirm('¿Seguro que te rindes?')) ctx.send({ type: 'resign' }); };
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    if (!f.m) return;
    const end = f.m.path[f.m.path.length - 1];
    const piece = el.querySelector(`[data-pc="${end.join()}"]`);
    const cellAt = (p) => el.querySelector(`.dcell[data-k="${p.join()}"]`);
    // las fichas comidas se dibujan encima un momento para verlas desaparecer
    const ghosts = (f.caps || []).map(({ r, c, pc }) => {
      const cell = cellAt([r, c]);
      if (!cell) return null;
      const g = document.createElement('div');
      g.className = 'dpc ghost'; g.innerHTML = pieceSVG(pc);
      cell.appendChild(g);
      return g;
    });
    if (piece) {
      const pts = [f.m.from, ...f.m.path].map((p) => { const c = cellAt(p); return c ? fx.center(c) : null; });
      const endP = pts[pts.length - 1];
      if (pts.every(Boolean)) {
        const frames = pts.map((p, i) => ({ transform: `translate(${p.x - endP.x}px, ${p.y - endP.y}px) scale(${i > 0 && i < pts.length - 1 ? 1.25 : 1})` }));
        const dur = 260 * (pts.length - 1);
        piece.animate(frames, { duration: Math.max(260, dur), easing: 'ease-in-out' });
        for (let i = 0; i < (f.caps || []).length; i++) {
          setTimeout(() => {
            const g = ghosts[i];
            if (!g) return;
            const p = fx.center(g);
            ctx.sound('capture');
            fx.burst(p.x, p.y, { color: f.caps[i].pc.p ? '#3a2a2a' : '#fff4dc', n: 18 });
            fx.floatText(p.x, p.y - 10, '¡Ñam!', '#ffe066', 26);
            g.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.6) rotate(40deg)', opacity: 0 }], { duration: 380, fill: 'forwards' });
          }, 260 * (i + 1) - 60);
        }
        await fx.wait(Math.max(260, dur));
      }
      ctx.sound(f.caps && f.caps.length ? 'special' : 'place');
      if (f.crown) { const p = fx.center(piece); fx.sparkle(p.x, p.y, '#ffd43b', 30, 1.6); fx.emojiRain(p.x, p.y - 30, '👑', 5); }
      if (f.caps && f.caps.length >= 2) fx.screenShake(5);
    }
    setTimeout(() => ghosts.forEach((g) => g && g.remove()), 450);
    if (f.type === 'win') fx.fireworksShow(el.querySelector('.dboard').getBoundingClientRect(), 6);
  },
};
