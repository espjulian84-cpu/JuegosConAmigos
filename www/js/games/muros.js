import { clone, esc, fail, pushLog, PLAYER_COLORS, TEAM_COLORS, TEAM_NAMES } from '../util.js';

// Tablero 7x7. En tu turno: mueve una de tus fichas 0, 1 o 2 casillas (en línea o en L,
// sin atravesar fichas ni muros) y después levanta un muro en uno de los lados de esa ficha.
// La partida acaba cuando todas las zonas cerradas solo tienen fichas de un mismo bando.
// Gana quien encierre más casillas.
export const N = 7;
const SIDES = { N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1] };

export function wallKey(r, c, side) {
  if (side === 'N') return r > 0 ? `h${r - 1}_${c}` : null;
  if (side === 'S') return r < N - 1 ? `h${r}_${c}` : null;
  if (side === 'W') return c > 0 ? `v${r}_${c - 1}` : null;
  if (side === 'E') return c < N - 1 ? `v${r}_${c}` : null;
  return null;
}
export const unitOf = (s, seat) => (s.teams ? s.teams[seat] : seat);
const occupied = (s, r, c) => s.pieces.some((ps) => ps.some((p) => p.r === r && p.c === c));
export const freeSides = (s, r, c) => Object.keys(SIDES).filter((d) => { const k = wallKey(r, c, d); return k && !s.walls[k]; });

export function reach(s, from) {
  const out = new Map([[`${from.r},${from.c}`, { r: from.r, c: from.c }]]);
  let frontier = [from];
  for (let step = 0; step < 2; step++) {
    const next = [];
    for (const p of frontier) for (const [d, [dr, dc]] of Object.entries(SIDES)) {
      const r = p.r + dr, c = p.c + dc;
      if (r < 0 || c < 0 || r >= N || c >= N) continue;
      if (s.walls[wallKey(p.r, p.c, d)]) continue;
      if (occupied(s, r, c)) continue;
      const k = `${r},${c}`;
      if (!out.has(k)) { out.set(k, { r, c }); next.push({ r, c }); }
    }
    frontier = next;
  }
  return [...out.values()];
}

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
      for (const [d, [dr, dc]] of Object.entries(SIDES)) {
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
  return { score, best, done, regions: list.length };
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
  blurb: 'Estrategia pura: mueve tu ficha y levanta un muro. Encierra el territorio más grande del tablero.',

  setup(n, opts = {}) {
    const per = n === 2 ? 4 : n === 3 ? 3 : 2;
    const order = [];
    for (let k = 0; k < per; k++) for (let j = 0; j < n; j++) order.push(k % 2 ? n - 1 - j : j);
    return { n, per, pieces: Array.from({ length: n }, () => []), walls: {}, phase: 'place', order, oi: 0, turn: order[0], active: null, v: 0, log: ['Colocad vuestras fichas por turnos'], teams: opts.teams || null };
  },
  turnOf: (s) => (s.over ? null : s.turn),
  isOver: (s) => !!s.over,

  action(st, seat, a) {
    const s = clone(st);
    s.v++;
    s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat !== s.turn) fail('No es tu turno');
    if (a.type === 'place') {
      if (s.phase !== 'place') fail('Ya no se colocan fichas');
      if (!(a.r >= 0 && a.r < N && a.c >= 0 && a.c < N) || occupied(s, a.r, a.c)) fail('Casilla no válida');
      s.pieces[seat].push({ r: a.r, c: a.c });
      s.oi++;
      if (s.oi >= s.order.length) { s.phase = 'move'; s.turn = 0; pushLog(s, '¡A construir muros!'); if (!canAct(s, 0)) endTurn(s); }
      else s.turn = s.order[s.oi];
      return s;
    }
    if (a.type === 'move') {
      if (s.phase !== 'move') fail('Ahora no toca mover');
      const p = s.pieces[seat][a.i];
      if (!p) fail('Ficha no válida');
      if (!reach(s, p).some((q) => q.r === a.r && q.c === a.c)) fail('No llegas a esa casilla');
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
      const before = scoreOf(s).regions;
      s.walls[k] = { seat, unit: unitOf(s, seat) };
      s.lastWall = k;
      s.active = null;
      const after = scoreOf(s);
      if (after.regions > before) s.fx = { id: s.v, type: 'special', seat, text: '¡Zona cerrada!', emoji: '🧱' };
      endTurn(s);
      return s;
    }
    fail('Acción desconocida');
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me === s.turn && !s.over;
    const ui = ctx.ui;
    if (ui.v !== s.v) { ui.v = s.v; ui.sel = null; }
    const colorOf = (seat) => (s.teams ? TEAM_COLORS[s.teams[seat]] : PLAYER_COLORS[seat]);
    const unitColor = (u) => (s.teams ? TEAM_COLORS[u] : PLAYER_COLORS[u]);
    const shapeOf = (seat) => (s.teams ? s.teams.slice(0, seat).filter((t) => t === s.teams[seat]).length : seat) % 4;
    const S = 100, B = 6;
    const { list, id } = regions(s);
    const parts = [];

    // casillas con tinte del territorio
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const reg = list[id[r][c]];
      const own = list.length > 1 && reg.units.size === 1 ? unitColor([...reg.units][0]) : null;
      parts.push(`<rect x="${c * S + B}" y="${r * S + B}" width="${S - 2 * B}" height="${S - 2 * B}" rx="12" class="mcell" fill="${own ? own : '#fdf6e3'}" fill-opacity="${own ? 0.35 : 1}" data-cell="${r},${c}"/>`);
    }
    // muros
    for (const [k, w] of Object.entries(s.walls)) {
      const [r, c] = k.slice(1).split('_').map(Number);
      const col = unitColor(w.unit);
      const cls = k === s.lastWall ? 'wall new' : 'wall';
      if (k[0] === 'h') parts.push(`<rect class="${cls}" x="${c * S + 2}" y="${(r + 1) * S - 7}" width="${S - 4}" height="14" rx="7" fill="${col}"/>`);
      else parts.push(`<rect class="${cls}" x="${(c + 1) * S - 7}" y="${r * S + 2}" width="14" height="${S - 4}" rx="7" fill="${col}"/>`);
    }
    // destinos posibles
    let reachable = [];
    if (myTurn && s.phase === 'move' && ui.sel != null) {
      reachable = reach(s, s.pieces[me][ui.sel]).filter((q) => freeSides(s, q.r, q.c).length);
      reachable.forEach((q) => parts.push(`<circle class="target" cx="${q.c * S + 50}" cy="${q.r * S + 50}" r="16" data-to="${q.r},${q.c}"/>`));
    }
    // fichas
    s.pieces.forEach((ps, seat) => ps.forEach((p, i) => {
      const sel = myTurn && seat === me && (s.phase === 'move' || s.phase === 'wall');
      const isSel = (ui.sel === i && seat === me) || (s.phase === 'wall' && s.active && s.active.i === i && seat === s.turn);
      parts.push(`<g transform="translate(${p.c * S + 50},${p.r * S + 50})"><g class="mpiece ${sel && s.phase === 'move' ? 'can' : ''} ${isSel ? 'sel' : ''}" data-flip="m${seat}-${i}" ${sel && s.phase === 'move' ? `data-piece="${i}"` : ''}>${shapeSVG(shapeOf(seat), colorOf(seat))}</g></g>`);
    }));
    // muros posibles
    if (myTurn && s.phase === 'wall') {
      const p = s.pieces[me][s.active.i];
      for (const d of freeSides(s, p.r, p.c)) {
        let x, y, w, h;
        if (d === 'N') { x = p.c * S + 2; y = p.r * S - 7; w = S - 4; h = 14; }
        if (d === 'S') { x = p.c * S + 2; y = (p.r + 1) * S - 7; w = S - 4; h = 14; }
        if (d === 'W') { x = p.c * S - 7; y = p.r * S + 2; w = 14; h = S - 4; }
        if (d === 'E') { x = (p.c + 1) * S - 7; y = p.r * S + 2; w = 14; h = S - 4; }
        parts.push(`<g data-wall="${d}" class="wallopt"><rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" fill="transparent"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${colorOf(me)}" class="ghost"/></g>`);
      }
    }

    const sc = scoreOf(s);
    const units = s.teams ? [...new Set(s.teams)].sort() : [...Array(s.n).keys()];
    const players = units.map((u) => {
      const seats = s.teams ? s.teams.map((t, k) => (t === u ? k : -1)).filter((k) => k >= 0) : [u];
      const label = s.teams ? `${TEAM_NAMES[u]}: ${seats.map((k) => esc(ctx.players[k])).join(' y ')}` : esc(ctx.players[u]);
      return `<div class="pchip ${seats.includes(s.turn) && !s.over ? 'turn' : ''}" style="--pc:${unitColor(u)}">
        <span class="avatar">${seats.map((k) => `<svg viewBox="-50 -50 100 100" class="mini">${shapeSVG(shapeOf(k), colorOf(k))}</svg>`).join('')}</span>
        <span class="pname">${label}</span><span class="pinfo">🏰 ${(s.final || sc.score)[u]}</span></div>`;
    }).join('');

    let status;
    if (s.over) status = s.winnerUnits.length > 1 ? '🤝 ¡Empate!' : `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (!myTurn) status = `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    else if (s.phase === 'place') status = '👉 Toca una casilla libre para colocar tu ficha';
    else if (s.phase === 'move') status = ui.sel == null ? '👉 Elige una de tus fichas' : '👉 Elige a dónde va (puedes quedarte quieto)';
    else status = '🧱 Ahora toca un lado brillante para levantar el muro';

    el.innerHTML = `
      <div class="players">${players}</div>
      <div class="status">${status}</div>
      <div class="muros-wrap"><svg class="muros" viewBox="-12 -12 724 724">
        <rect x="-12" y="-12" width="724" height="724" rx="28" class="mboard"/>${parts.join('')}</svg></div>
      <div class="actions">${myTurn && s.phase === 'wall' ? '<button class="btn" data-undo>↩️ Deshacer movimiento</button>' : ''}</div>
      <div class="log">${(s.log || []).slice(0, 2).map((l) => `<div>${ctx.fmt(l)}</div>`).join('')}</div>`;

    const svg = el.querySelector('svg.muros');
    svg.addEventListener('click', (e) => {
      if (!myTurn) return;
      const t = e.target.closest('[data-piece],[data-to],[data-wall],[data-cell]');
      if (!t) return;
      if (t.dataset.wall) return ctx.send({ type: 'wall', side: t.dataset.wall });
      if (s.phase === 'place' && t.dataset.cell) { const [r, c] = t.dataset.cell.split(',').map(Number); return ctx.send({ type: 'place', r, c }); }
      if (s.phase === 'move') {
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
  },
};

function shapeSVG(shape, color) {
  const g = `<defs><radialGradient id="gl" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
  const st = `fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="3"`;
  const shapes = [
    (a) => `<circle r="30" ${a}/>`,
    (a) => `<rect x="-27" y="-27" width="54" height="54" rx="8" ${a}/>`,
    (a) => `<path d="M0 -32 L31 26 L-31 26 Z" stroke-linejoin="round" ${a}/>`,
    (a) => `<path d="M0 -33 L33 0 L0 33 L-33 0 Z" stroke-linejoin="round" ${a}/>`,
  ];
  return `${g}<ellipse cx="0" cy="30" rx="26" ry="6" fill="rgba(0,0,0,.25)"/>${shapes[shape](st)}${shapes[shape]('fill="url(#gl)"')}`;
}
