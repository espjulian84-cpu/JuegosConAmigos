import { clone, esc, fail, pushLog, PLAYER_COLORS, TEAM_COLORS, TEAM_NAMES } from '../util.js';

// Tablero 7x7. Cada jugador tiene fichas CUADRADAS y REDONDAS:
//  ■ cuadrada: como la torre, 1 o 2 casillas en línea recta.
//  ● redonda: en "L corta", una casilla hacia un lado y otra girando (acaba en diagonal).
// Ambas pueden quedarse quietas. Después de mover se levanta un muro en un lado de esa ficha.
// Opción "rompe-muros": una vez por partida puedes derribar un muro pegado a una de tus fichas.
// Acaba cuando cada zona cerrada solo tiene fichas de un bando. Gana quien encierre más casillas.
export const N = 7;
const DIRS = { N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1] };
const PERP = { N: ['W', 'E'], S: ['W', 'E'], W: ['N', 'S'], E: ['N', 'S'] };

export function wallKey(r, c, side) {
  if (side === 'N') return r > 0 ? `h${r - 1}_${c}` : null;
  if (side === 'S') return r < N - 1 ? `h${r}_${c}` : null;
  if (side === 'W') return c > 0 ? `v${r}_${c - 1}` : null;
  if (side === 'E') return c < N - 1 ? `v${r}_${c}` : null;
  return null;
}
export const unitOf = (s, seat) => (s.teams ? s.teams[seat] : seat);
const occupied = (s, r, c) => s.pieces.some((ps) => ps.some((p) => p.r === r && p.c === c));
export const freeSides = (s, r, c) => Object.keys(DIRS).filter((d) => { const k = wallKey(r, c, d); return k && !s.walls[k]; });
function step(s, r, c, d) {
  const [dr, dc] = DIRS[d];
  const nr = r + dr, nc = c + dc;
  if (nr < 0 || nc < 0 || nr >= N || nc >= N) return null;
  if (s.walls[wallKey(r, c, d)] || occupied(s, nr, nc)) return null;
  return { r: nr, c: nc };
}
export const typeOf = (k) => (k % 2 === 0 ? 'sq' : 'rd');

/** Casillas a las que puede ir una ficha (incluye quedarse quieta) */
export function reach(s, p) {
  const out = [{ r: p.r, c: p.c }];
  for (const d of Object.keys(DIRS)) {
    const a = step(s, p.r, p.c, d);
    if (!a) continue;
    if (p.t === 'sq') {
      out.push(a);
      const b = step(s, a.r, a.c, d);
      if (b) out.push(b);
    } else {
      for (const d2 of PERP[d]) { const b = step(s, a.r, a.c, d2); if (b) out.push(b); }
    }
  }
  const seen = new Set();
  return out.filter((q) => { const k = q.r * N + q.c; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Muros que puede romper un jugador (pegados a alguna de sus fichas) */
export function breakable(s, seat) {
  const keys = new Set();
  s.pieces[seat].forEach((p) => Object.keys(DIRS).forEach((d) => { const k = wallKey(p.r, p.c, d); if (k && s.walls[k]) keys.add(k); }));
  return [...keys];
}
export const canBreak = (s, seat) => !!s.breaker && !s.usedBreak[seat] && s.phase === 'move' && breakable(s, seat).length > 0;

export function regions(s) {
  const id = Array.from({ length: N }, () => Array(N).fill(-1));
  const list = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (id[r][c] >= 0) continue;
    const reg = { cells: [], units: new Set() };
    const st = [[r, c]]; id[r][c] = list.length;
    while (st.length) {
      const [a, b] = st.pop();
      reg.cells.push([a, b]);
      for (const [d, [dr, dc]] of Object.entries(DIRS)) {
        const x = a + dr, y = b + dc;
        if (x < 0 || y < 0 || x >= N || y >= N || id[x][y] >= 0 || s.walls[wallKey(a, b, d)]) continue;
        id[x][y] = list.length; st.push([x, y]);
      }
    }
    list.push(reg);
  }
  s.pieces.forEach((ps, seat) => ps.forEach((p) => list[id[p.r][p.c]].units.add(unitOf(s, seat))));
  return { list, id };
}

export function scoreOf(s) {
  const { list } = regions(s);
  const units = s.teams ? Math.max(...s.teams) + 1 : s.n;
  const score = Array(units).fill(0);
  const best = Array(units).fill(0);
  let done = true;
  for (const reg of list) {
    if (reg.units.size > 1) done = false;
    if (reg.units.size === 1) {
      const u = [...reg.units][0];
      score[u] += reg.cells.length;
      best[u] = Math.max(best[u], reg.cells.length);
    }
  }
  return { score, best, done, regions: list.length, list };
}

const canAct = (s, seat) => s.pieces[seat].some((p) => reach(s, p).some((q) => freeSides(s, q.r, q.c).length));

function finish(s) {
  const { score, best } = scoreOf(s);
  s.over = true;
  s.final = score;
  let top = -1, win = [];
  score.forEach((v, u) => {
    const key = v * 100 + best[u];
    if (key > top) { top = key; win = [u]; } else if (key === top) win.push(u);
  });
  s.winnerUnits = win;
  const seat = s.teams ? s.teams.indexOf(win[0]) : win[0];
  s.winner = seat;
  s.fx = { id: s.v, type: 'win', seat, text: win.length > 1 ? '¡Empate!' : '¡Territorio conquistado!', emoji: '🏰' };
}

function endTurn(s) {
  if (scoreOf(s).done) { finish(s); return; }
  for (let k = 0; k < s.n; k++) {
    s.turn = (s.turn + 1) % s.n;
    if (canAct(s, s.turn)) { s.phase = 'move'; return; }
    pushLog(s, `{${s.turn}} no puede mover`);
  }
  finish(s);
}

export default {
  id: 'muros',
  name: 'Muros',
  icon: '🧱',
  color: '#7e57c2',
  minPlayers: 2,
  maxPlayers: 4,
  teams: 'even',
  blurb: 'Estrategia pura: mueve tus fichas (la cuadrada como la torre, la redonda en L) y levanta muros. Encierra el territorio más grande.',
  options: [{ id: 'breaker', label: '💥 Rompe-muros (1 por jugador)', type: 'bool', def: true }],
  rules: `
    <p>Tablero de 7×7. Cada jugador tiene fichas <b>■ cuadradas</b> y <b>● redondas</b> de su color (por equipos, el equipo comparte color).</p>
    <ol>
      <li><b>Colocación:</b> por turnos, cada uno pone sus fichas donde quiera.</li>
      <li><b>En tu turno</b> mueves UNA ficha y después levantas un muro en uno de sus 4 lados.</li>
      <li><b>■ Cuadrada:</b> como la torre del ajedrez pero solo 1 o 2 casillas en línea recta.</li>
      <li><b>● Redonda:</b> una casilla hacia delante y otra hacia el lado que quieras (una "L" corta, acaba en diagonal).</li>
      <li>Puedes dejar la ficha quieta y solo poner el muro. No se atraviesan muros ni fichas.</li>
      <li><b>💥 Rompe-muros</b> (si está activado): una vez en toda la partida puedes derribar un muro pegado a una de tus fichas antes de mover.</li>
      <li>La partida acaba cuando todas las zonas cerradas tienen fichas de un solo bando. <b>Gana quien encierre más casillas.</b></li>
    </ol>`,

  setup(n, opts = {}) {
    const per = n === 2 ? 4 : n === 3 ? 3 : 2;
    const order = [];
    for (let k = 0; k < per; k++) for (let j = 0; j < n; j++) order.push(k % 2 ? n - 1 - j : j);
    const o = opts.options || {};
    return {
      n, per, pieces: Array.from({ length: n }, () => []), walls: {}, phase: 'place', order, oi: 0, turn: order[0],
      active: null, v: 0, log: ['Colocad vuestras fichas por turnos'], teams: opts.teams || null,
      breaker: o.breaker !== false, usedBreak: Array(n).fill(false),
    };
  },
  turnOf: (s) => (s.over ? null : s.turn),
  isOver: (s) => !!s.over,

  action(st, seat, a) {
    const s = clone(st);
    s.v++;
    s.fx = null;
    s.lastWall = null;
    if (s.over) fail('La partida ha terminado');
    if (seat !== s.turn) fail('No es tu turno');
    if (a.type === 'place') {
      if (s.phase !== 'place') fail('Ya no se colocan fichas');
      if (!(a.r >= 0 && a.r < N && a.c >= 0 && a.c < N) || occupied(s, a.r, a.c)) fail('Casilla no válida');
      s.pieces[seat].push({ r: a.r, c: a.c, t: typeOf(s.pieces[seat].length) });
      s.oi++;
      if (s.oi >= s.order.length) { s.phase = 'move'; s.turn = 0; pushLog(s, '¡A construir muros!'); if (!canAct(s, 0)) endTurn(s); }
      else s.turn = s.order[s.oi];
      return s;
    }
    if (a.type === 'break') {
      if (!canBreak(s, seat)) fail('No puedes usar el rompe-muros ahora');
      if (!breakable(s, seat).includes(a.key)) fail('Ese muro no está pegado a tus fichas');
      const w = s.walls[a.key];
      delete s.walls[a.key];
      s.usedBreak[seat] = true;
      s.fx = { id: s.v, type: 'break', seat, key: a.key, unit: w.unit, text: '¡Rompe-muros!', emoji: '💥' };
      pushLog(s, `{${seat}} derriba un muro`);
      return s;
    }
    if (a.type === 'move') {
      if (s.phase !== 'move') fail('Ahora no toca mover');
      const p = s.pieces[seat][a.i];
      if (!p) fail('Ficha no válida');
      if (!reach(s, p).some((q) => q.r === a.r && q.c === a.c)) fail(p.t === 'sq' ? 'La cuadrada va recta, 1 o 2 casillas' : 'La redonda va en L: una y otra al lado');
      if (!freeSides(s, a.r, a.c).length) fail('Desde ahí no puedes poner ningún muro');
      s.active = { i: a.i, from: { r: p.r, c: p.c } };
      p.r = a.r; p.c = a.c;
      s.phase = 'wall';
      return s;
    }
    if (a.type === 'undo') {
      if (s.phase !== 'wall') fail('Nada que deshacer');
      const p = s.pieces[seat][s.active.i];
      p.r = s.active.from.r; p.c = s.active.from.c;
      s.active = null; s.phase = 'move';
      return s;
    }
    if (a.type === 'wall') {
      if (s.phase !== 'wall') fail('Primero mueve una ficha');
      const p = s.pieces[seat][s.active.i];
      const k = wallKey(p.r, p.c, a.side);
      if (!k || s.walls[k]) fail('Ahí no se puede poner muro');
      const before = regions(s).list.length;
      s.walls[k] = { seat, unit: unitOf(s, seat) };
      s.lastWall = k;
      s.active = null;
      const after = regions(s);
      s.fx = { id: s.v, type: 'wall', seat, key: k, quiet: true };
      if (after.list.length > before) {
        // zona nueva: la más pequeña de las dos que se acaban de separar
        const a1 = after.list[after.id[p.r][p.c]];
        const [dr, dc] = DIRS[a.side];
        const a2 = after.list[after.id[p.r + dr][p.c + dc]];
        const small = a1.cells.length <= a2.cells.length ? a1 : a2;
        s.fx = { id: s.v, type: 'zone', seat, key: k, cells: small.cells, owner: small.units.size === 1 ? [...small.units][0] : null, text: '¡Zona cerrada!', emoji: '🧱' };
      }
      endTurn(s);
      return s;
    }
    fail('Acción desconocida');
  },

  bot(s, seat) {
    if (s.phase === 'place') {
      for (let k = 0; k < 200; k++) { const r = (Math.random() * N) | 0, c = (Math.random() * N) | 0; if (!occupied(s, r, c)) return { type: 'place', r, c }; }
    }
    if (s.phase === 'move') {
      const opts = [];
      s.pieces[seat].forEach((p, i) => reach(s, p).forEach((q) => { if (freeSides(s, q.r, q.c).length) opts.push({ type: 'move', i, r: q.r, c: q.c }); }));
      return opts[(Math.random() * opts.length) | 0];
    }
    const p = s.pieces[seat][s.active.i];
    const f = freeSides(s, p.r, p.c);
    return { type: 'wall', side: f[(Math.random() * f.length) | 0] };
  },

  demo() {
    // Partida corta de ejemplo (2 jugadores, 2 fichas cada uno para que sea rápida)
    const s = this.setup(2, { options: { breaker: true } });
    s.per = 2; s.order = [0, 1, 1, 0];
    return {
      state: s,
      steps: [
        { say: 'Cada jugador coloca sus fichas. Primero la cuadrada ■…', seat: 0, a: { type: 'place', r: 3, c: 1 } },
        { say: 'Leo coloca también su cuadrada.', seat: 1, a: { type: 'place', r: 3, c: 5 } },
        { say: '…y luego la redonda ●.', seat: 1, a: { type: 'place', r: 1, c: 4 } },
        { say: 'Ana coloca su redonda.', seat: 0, a: { type: 'place', r: 5, c: 2 } },
        { say: '■ La cuadrada va recta, 1 o 2 casillas, como la torre.', seat: 0, a: { type: 'move', i: 0, r: 3, c: 3 } },
        { say: 'Después de mover, levantas un muro en un lado de esa ficha.', seat: 0, a: { type: 'wall', side: 'E' } },
        { say: '● La redonda va en L: una hacia delante y otra al lado.', seat: 1, a: { type: 'move', i: 1, r: 2, c: 3 } },
        { say: 'Leo pone su muro justo encima de Ana.', seat: 1, a: { type: 'wall', side: 'S' } },
        { say: '💥 ¡Rompe-muros! Solo una vez por partida: Ana derriba el muro que la encerraba.', seat: 0, a: { type: 'break', key: 'h2_3' } },
        { say: 'Y sigue su turno normal: mueve y construye.', seat: 0, a: { type: 'move', i: 1, r: 4, c: 3 } },
        { say: 'Los muros van formando zonas. ¡Encierra la más grande!', seat: 0, a: { type: 'wall', side: 'W' } },
      ],
    };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me === s.turn && !s.over;
    const ui = ctx.ui;
    if (ui.v !== s.v) { ui.v = s.v; ui.sel = null; ui.breaking = false; }
    const colorOf = (seat) => (s.teams ? TEAM_COLORS[s.teams[seat]] : PLAYER_COLORS[seat]);
    const unitColor = (u) => (s.teams ? TEAM_COLORS[u] : PLAYER_COLORS[u]);
    const mateIdx = (seat) => (s.teams ? s.teams.slice(0, seat).filter((t) => t === s.teams[seat]).length : 0);
    const S = 100, B = 6;
    const { list, id } = regions(s);
    const parts = [];

    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const reg = list[id[r][c]];
      const own = list.length > 1 && reg.units.size === 1 ? unitColor([...reg.units][0]) : null;
      parts.push(`<rect x="${c * S + B}" y="${r * S + B}" width="${S - 2 * B}" height="${S - 2 * B}" rx="12" class="mcell" fill="${own || '#fdf6e3'}" fill-opacity="${own ? 0.38 : 1}" data-cell="${r},${c}"/>`);
    }
    const brk = myTurn && ui.breaking ? new Set(breakable(s, me)) : new Set();
    for (const [k, w] of Object.entries(s.walls)) {
      const [r, c] = k.slice(1).split('_').map(Number);
      const col = unitColor(w.unit);
      const cls = `wall ${k === s.lastWall ? 'new' : ''} ${brk.has(k) ? 'breakable' : ''}`;
      const rect = k[0] === 'h' ? [c * S + 2, (r + 1) * S - 7, S - 4, 14] : [(c + 1) * S - 7, r * S + 2, 14, S - 4];
      parts.push(`<g class="${cls}" data-wkey="${k}" ${brk.has(k) ? `data-break="${k}"` : ''}><rect x="${rect[0] - 8}" y="${rect[1] - 8}" width="${rect[2] + 16}" height="${rect[3] + 16}" fill="transparent"/><rect x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}" rx="7" fill="${col}"/><rect x="${rect[0] + 3}" y="${rect[1] + 3}" width="${Math.max(2, rect[2] - 6)}" height="3" rx="1.5" fill="rgba(255,255,255,.45)"/></g>`);
    }
    let reachable = [];
    if (myTurn && s.phase === 'move' && ui.sel != null) {
      reachable = reach(s, s.pieces[me][ui.sel]).filter((q) => freeSides(s, q.r, q.c).length);
      reachable.forEach((q) => parts.push(`<circle class="target" cx="${q.c * S + 50}" cy="${q.r * S + 50}" r="16" data-to="${q.r},${q.c}"/>`));
    }
    s.pieces.forEach((ps, seat) => ps.forEach((p, i) => {
      const can = myTurn && seat === me && s.phase === 'move' && !ui.breaking;
      const isSel = (ui.sel === i && seat === me && s.phase === 'move') || (s.phase === 'wall' && s.active && s.active.i === i && seat === s.turn);
      parts.push(`<g transform="translate(${p.c * S + 50},${p.r * S + 50})"><g class="mpiece ${can ? 'can' : ''} ${isSel ? 'sel' : ''}" data-flip="m${seat}-${i}" ${can ? `data-piece="${i}"` : ''}>${pieceSVG(p.t, colorOf(seat), mateIdx(seat))}</g></g>`);
    }));
    if (s.phase === 'place' && myTurn) {
      const t = typeOf(s.pieces[me].length);
      parts.push(`<g opacity=".0" id="placeghost">${pieceSVG(t, colorOf(me), mateIdx(me))}</g>`);
    }
    if (myTurn && s.phase === 'wall') {
      const p = s.pieces[me][s.active.i];
      for (const d of freeSides(s, p.r, p.c)) {
        const rect = { N: [p.c * S + 2, p.r * S - 7, S - 4, 14], S: [p.c * S + 2, (p.r + 1) * S - 7, S - 4, 14], W: [p.c * S - 7, p.r * S + 2, 14, S - 4], E: [(p.c + 1) * S - 7, p.r * S + 2, 14, S - 4] }[d];
        parts.push(`<g data-wall="${d}" class="wallopt"><rect x="${rect[0] - 12}" y="${rect[1] - 12}" width="${rect[2] + 24}" height="${rect[3] + 24}" fill="transparent"/><rect x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}" rx="7" fill="${colorOf(me)}" class="ghost"/></g>`);
      }
    }

    const sc = scoreOf(s);
    const units = s.teams ? [...new Set(s.teams)].sort() : [...Array(s.n).keys()];
    const players = units.map((u) => {
      const seats = s.teams ? s.teams.map((t, k) => (t === u ? k : -1)).filter((k) => k >= 0) : [u];
      const label = s.teams ? `${TEAM_NAMES[u]}: ${seats.map((k) => esc(ctx.players[k])).join(' y ')}` : esc(ctx.players[u]);
      const brkIcon = s.breaker ? seats.map((k) => (s.usedBreak[k] ? '' : '💥')).join('') : '';
      return `<div class="pchip ${seats.includes(s.turn) && !s.over ? 'turn' : ''}" style="--pc:${unitColor(u)}">
        <span class="avatar">${seats.map((k) => ctx.avatar(k)).join('')}</span>
        <span class="pname">${label}</span><span class="pinfo">🏰 ${(s.final || sc.score)[u]} ${brkIcon}</span></div>`;
    }).join('');

    let status;
    if (s.over) status = s.winnerUnits.length > 1 ? '🤝 ¡Empate!' : `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (!myTurn) status = `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    else if (s.phase === 'place') status = `👉 Coloca tu ficha ${typeOf(s.pieces[me].length) === 'sq' ? '■ cuadrada' : '● redonda'} en una casilla libre`;
    else if (ui.breaking) status = '💥 Toca un muro rojo pegado a tus fichas para derribarlo';
    else if (s.phase === 'move') status = ui.sel == null ? '👉 Elige una de tus fichas' : (s.pieces[me][ui.sel].t === 'sq' ? '■ Recto 1 o 2 casillas (o quieto: tócala otra vez)' : '● En L: una y otra al lado (o quieto: tócala otra vez)');
    else status = '🧱 Toca un lado brillante para levantar el muro';

    const actions = [];
    if (myTurn && s.phase === 'wall') actions.push('<button class="btn" data-undo>↩️ Deshacer movimiento</button>');
    if (myTurn && canBreak(s, me)) actions.push(`<button class="btn ${ui.breaking ? 'c1' : 'c3'}" data-breakmode>${ui.breaking ? '✖ Cancelar' : '💥 Rompe-muros'}</button>`);

    el.innerHTML = `
      <div class="players">${players}</div>
      <div class="status">${status}</div>
      <div class="muros-wrap"><svg class="muros" viewBox="-12 -12 724 724">
        <defs><pattern id="wood" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#6d4c41"/><path d="M0 10 Q20 5 40 12 M0 28 Q20 24 40 30" stroke="#5d4037" stroke-width="3" fill="none"/></pattern></defs>
        <rect x="-12" y="-12" width="724" height="724" rx="28" fill="url(#wood)"/>${parts.join('')}</svg></div>
      <div class="actions">${actions.join('')}</div>
      <div class="log">${(s.log || []).slice(0, 2).map((l) => `<div>${ctx.fmt(l)}</div>`).join('')}</div>`;

    const svg = el.querySelector('svg.muros');
    svg.addEventListener('click', (e) => {
      if (!myTurn) return;
      const t = e.target.closest('[data-piece],[data-to],[data-wall],[data-cell],[data-break]');
      if (!t) return;
      if (t.dataset.break) return ctx.send({ type: 'break', key: t.dataset.break });
      if (t.dataset.wall) return ctx.send({ type: 'wall', side: t.dataset.wall });
      if (s.phase === 'place' && t.dataset.cell) { const [r, c] = t.dataset.cell.split(',').map(Number); return ctx.send({ type: 'place', r, c }); }
      if (s.phase === 'move' && !ui.breaking) {
        if (t.dataset.piece != null) {
          const i = +t.dataset.piece;
          if (ui.sel === i) { const p = s.pieces[me][i]; if (freeSides(s, p.r, p.c).length) return ctx.send({ type: 'move', i, r: p.r, c: p.c }); }
          ui.sel = i; return ctx.rerender();
        }
        const to = t.dataset.to || (t.dataset.cell && reachable.some((q) => `${q.r},${q.c}` === t.dataset.cell) ? t.dataset.cell : null);
        if (to && ui.sel != null) { const [r, c] = to.split(',').map(Number); return ctx.send({ type: 'move', i: ui.sel, r, c }); }
      }
    });
    const u = el.querySelector('[data-undo]');
    if (u) u.onclick = () => ctx.send({ type: 'undo' });
    const bm = el.querySelector('[data-breakmode]');
    if (bm) bm.onclick = () => { ui.breaking = !ui.breaking; ui.sel = null; ctx.rerender(); };
  },

  // ---------- animaciones especiales ----------
  async animate(f, el, ctx) {
    const svg = el.querySelector('svg.muros');
    if (!svg) return;
    const toScreen = (x, y) => { const m = svg.getScreenCTM(); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; };
    const wallCenter = (k) => { const [r, c] = k.slice(1).split('_').map(Number); return k[0] === 'h' ? toScreen(c * 100 + 50, (r + 1) * 100) : toScreen((c + 1) * 100, r * 100 + 50); };
    const unitColor = (u) => (ctx.state.teams ? TEAM_COLORS[u] : PLAYER_COLORS[u]);
    const { fx } = ctx;
    if (f.type === 'wall' || f.type === 'zone') {
      const p = wallCenter(f.key);
      ctx.sound('place');
      fx.dust(p.x, p.y, 50);
    }
    if (f.type === 'zone') {
      await fx.wait(250);
      const col = f.owner != null ? unitColor(f.owner) : '#ffe066';
      f.cells.forEach(([r, c], i) => setTimeout(() => { const q = toScreen(c * 100 + 50, r * 100 + 50); fx.sparkle(q.x, q.y, col, 8); }, i * 40));
      const mid = f.cells.reduce((a, [r, c]) => [a[0] + r, a[1] + c], [0, 0]).map((v) => v / f.cells.length);
      const q = toScreen(mid[1] * 100 + 50, mid[0] * 100 + 50);
      fx.burst(q.x, q.y - 20, { colors: [col, '#fff'], count: 50, scale: 0.8 });
      ctx.sound('special');
    }
    if (f.type === 'break') {
      const p = wallCenter(f.key);
      ctx.sound('boom');
      fx.screenShake(10);
      fx.flash('#fff3b0');
      fx.explosion(p.x, p.y, 0.9);
      const col = unitColor(f.unit);
      for (let i = 0; i < 6; i++) fx.emojiRain(p.x, p.y, '🧱', 1, { speed: 7, grav: 0.35, size: 22 });
      fx.sparkle(p.x, p.y, col, 14, 2);
    }
    if (f.type === 'win') { fx.fireworksShow(el.getBoundingClientRect(), 8); }
  },
};

function pieceSVG(t, color, mate) {
  // pieza con grosor: canto oscuro debajo, cara superior con degradado y brillo
  const g = `<defs><radialGradient id="gl" cx="35%" cy="28%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient></defs>`;
  const shape = t === 'sq' ? (a, dy = 0) => `<rect x="-27" y="${-30 + dy}" width="54" height="54" rx="10" ${a}/>` : (a, dy = 0) => `<circle cy="${-3 + dy}" r="29" ${a}/>`;
  const badge = mate ? `<circle cx="0" cy="-3" r="10" fill="#fff" opacity=".92"/><text y="3" text-anchor="middle" font-size="15" font-weight="800" fill="${color}">★</text>` : '';
  return `${g}<ellipse cx="0" cy="34" rx="29" ry="7" fill="rgba(0,0,0,.3)"/>
    ${shape(`fill="${color}"`, 9)}${shape('fill="rgba(0,0,0,.42)"', 9)}
    ${shape(`fill="${color}" stroke="rgba(0,0,0,.25)" stroke-width="2"`)}${shape('fill="url(#gd)"')}${shape('fill="url(#gl)"')}${badge}`;
}
