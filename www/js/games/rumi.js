import { clone, fail, pushLog, esc, shuffle, PLAYER_COLORS } from '../util.js';
import { chipsHTML, logHTML } from './common.js';

// Rumi de fichas: series (mismo color, números seguidos) y grupos (mismo número, colores distintos).
// La mesa es de todos: puedes reordenarla como quieras mientras al final todo quede bien.
const COLS = ['#e03131', '#1971c2', '#212529', '#f08c00'];
const COL_NAMES = ['rojo', 'azul', 'negro', 'naranja'];

function makeTiles() {
  const t = [];
  for (let k = 0; k < 2; k++) for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) t.push({ n, c });
  t.push({ j: true }, { j: true });
  return t.map((x, id) => ({ ...x, id }));
}

// Analiza un grupo de fichas: devuelve {ok, kind, value, order} (order = ids colocados con comodines en su sitio)
export function analyze(set, T) {
  const tiles = set.map((id) => T[id]);
  const jokers = tiles.filter((t) => t.j);
  const real = tiles.filter((t) => !t.j);
  const size = tiles.length;
  if (size < 3) return { ok: false };
  if (!real.length) return { ok: size <= 13, kind: 'run', value: 0, order: set };
  // grupo
  if (size <= 4 && real.every((t) => t.n === real[0].n) && new Set(real.map((t) => t.c)).size === real.length) {
    return { ok: true, kind: 'group', value: real[0].n * size, order: [...real.sort((a, b) => a.c - b.c).map((t) => t.id), ...jokers.map((t) => t.id)] };
  }
  // serie
  if (real.every((t) => t.c === real[0].c) && new Set(real.map((t) => t.n)).size === real.length && size <= 13) {
    const ns = real.map((t) => t.n).sort((a, b) => a - b);
    const min = ns[0], max = ns[ns.length - 1];
    if (max - min + 1 > size) return { ok: false };
    let start = Math.min(min, 14 - size);
    if (start + size - 1 < max) start = max - size + 1;
    if (start < 1) return { ok: false };
    const order = [];
    const js = jokers.map((t) => t.id);
    for (let v = start; v < start + size; v++) { const r = real.find((t) => t.n === v); order.push(r ? r.id : js.shift()); }
    let value = 0; for (let v = start; v < start + size; v++) value += v;
    return { ok: true, kind: 'run', value, order };
  }
  return { ok: false };
}
const tileValue = (t) => (t.j ? 30 : t.n);

function nextTurn(s) { s.turn = (s.turn + 1) % s.n; s.turnNo++; s.timer = s.turnMs ? { id: `t${s.v}`, ms: s.turnMs, action: { type: 'timeout', turn: s.turnNo } } : null; }
function endByBlock(s) {
  let w = 0;
  const sums = s.racks.map((r) => r.reduce((a, id) => a + tileValue(s.tiles[id]), 0));
  sums.forEach((v, k) => { if (v < sums[w]) w = k; });
  s.over = true; s.winner = w; s.sums = sums; s.timer = null;
  pushLog(s, `Se acabaron las fichas: gana {${w}} con menos puntos en el atril`);
}

// --- Máquina: busca series y grupos en su atril y añade fichas sueltas a la mesa ---
function findSets(ids, T) {
  const used = new Set();
  const sets = [];
  const avail = () => ids.filter((id) => !used.has(id));
  // series por color
  for (let c = 0; c < 4; c++) {
    const byN = {};
    avail().forEach((id) => { const t = T[id]; if (!t.j && t.c === c && !byN[t.n]) byN[t.n] = id; });
    let run = [];
    for (let n = 1; n <= 14; n++) {
      if (byN[n]) run.push(byN[n]);
      else { if (run.length >= 3) { sets.push(run); run.forEach((x) => used.add(x)); } run = []; }
    }
  }
  // grupos
  for (let n = 13; n >= 1; n--) {
    const byC = {};
    avail().forEach((id) => { const t = T[id]; if (!t.j && t.n === n && byC[t.c] == null) byC[t.c] = id; });
    const g = Object.values(byC);
    if (g.length >= 3) { sets.push(g); g.forEach((x) => used.add(x)); }
  }
  // comodines: completan una pareja
  const jokers = avail().filter((id) => T[id].j);
  for (const j of jokers) {
    const rest = avail().filter((id) => !T[id].j);
    let done = false;
    for (let a = 0; a < rest.length && !done; a++) for (let b = a + 1; b < rest.length && !done; b++) {
      const cand = [rest[a], rest[b], j];
      if (analyze(cand, T).ok) { sets.push(cand); cand.forEach((x) => used.add(x)); done = true; }
    }
  }
  return sets;
}

export default {
  id: 'rumi',
  name: 'Rumi',
  icon: '🔢',
  color: '#f08c00',
  cat: 'mesa',
  minPlayers: 2,
  maxPlayers: 4,
  teams: null,
  hidden: true,
  moveSound: 'place',
  blurb: 'Fichas de números y colores: haz series y grupos, reordena la mesa a tu antojo y quédate sin fichas.',
  options: [
    { id: 'time', label: '⏱️ Tiempo por turno', type: 'choice', def: 0, choices: [{ v: 0, label: 'Sin límite' }, { v: 60, label: '1 min' }, { v: 120, label: '2 min' }] },
  ],
  rules: `<ol>
    <li>Hay fichas del <b>1 al 13</b> en cuatro colores (dos de cada) y 2 <b>comodines 😀</b>. Cada uno empieza con <b>14</b>.</li>
    <li>Combinaciones válidas (de 3 o más fichas):
      <ul><li><b>Serie</b>: mismo color y números seguidos (4-5-6 rojos).</li><li><b>Grupo</b>: mismo número y colores distintos (7 rojo, 7 azul, 7 negro).</li></ul></li>
    <li>Tu <b>primera jugada</b> tiene que sumar <b>30 puntos o más</b> con fichas solo tuyas.</li>
    <li>Después puedes <b>reorganizar la mesa</b> como quieras: partir series, añadir fichas, mover… siempre que al terminar todo esté bien y hayas puesto al menos una ficha tuya.</li>
    <li>Si no puedes o no quieres poner, <b>robas una ficha</b> y pasa el turno.</li>
    <li>Gana quien se quede <b>sin fichas</b>. Si se acaba el montón y nadie puede jugar, gana quien tenga menos puntos.</li>
    <li>Cómo se juega en el móvil: toca fichas (de tu atril o de la mesa) para elegirlas y luego toca un grupo de la mesa o "➕ Nuevo" para llevarlas allí.</li></ol>`,

  setup(n, opts = {}) {
    const tiles = makeTiles();
    const pool = shuffle(tiles.map((t) => t.id));
    const racks = Array.from({ length: n }, () => pool.splice(0, 14));
    const o = opts.options || {};
    const s = { n, tiles, pool, racks, table: [], opened: Array(n).fill(false), turn: 0, turnNo: 0, passes: 0, v: 0, turnMs: (o.time || 0) * 1000, log: ['¡A por las series y los grupos!'] };
    nextTurn(s); s.turn = 0;
    return s;
  },
  turnOf: (s) => (s.over ? null : s.turn),
  isOver: (s) => !!s.over,
  viewFor(s, seat) {
    return { ...s, racks: s.racks.map((r, k) => (k === seat || s.over ? r : r.map(() => -1))), pool: s.pool.map(() => -1) };
  },

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat === 'sys') {
      if (a.type !== 'timeout' || a.turn !== s.turnNo) fail('Temporizador caducado');
      seat = s.turn; a = { type: 'draw', timeout: true };
    }
    if (seat !== s.turn) fail('No es tu turno');
    if (a.type === 'draw') {
      if (s.pool.length) {
        s.racks[seat].push(s.pool.pop());
        s.passes = 0;
        pushLog(s, `{${seat}} ${a.timeout ? 'se queda sin tiempo y ' : ''}roba una ficha`);
        s.fx = { id: s.v, type: 'draw', seat };
      } else {
        s.passes++;
        pushLog(s, `{${seat}} pasa`);
        s.fx = { id: s.v, type: 'pass', seat };
        if (s.passes >= s.n) { endByBlock(s); s.fx = { id: s.v, type: 'win', seat: s.winner, text: `¡{${s.winner}} gana con menos puntos!`, emoji: '🏆' }; return s; }
      }
      nextTurn(s);
      return s;
    }
    if (a.type !== 'commit') fail('Acción desconocida');
    const table = (a.table || []).filter((g) => Array.isArray(g) && g.length);
    const all = table.flat();
    if (new Set(all).size !== all.length) fail('Fichas repetidas');
    const oldIds = new Set(s.table.flat());
    const rack = new Set(s.racks[seat]);
    if (all.some((id) => !oldIds.has(id) && !rack.has(id))) fail('Esa ficha no es tuya');
    if ([...oldIds].some((id) => !all.includes(id))) fail('Las fichas de la mesa no pueden volver al atril');
    const placed = all.filter((id) => !oldIds.has(id));
    if (!placed.length) fail('Pon al menos una ficha tuya');
    const results = table.map((g) => analyze(g, s.tiles));
    if (results.some((r) => !r.ok)) fail('Hay combinaciones que no valen');
    if (!s.opened[seat]) {
      // primera jugada: la mesa de antes no se toca y lo nuevo suma 30
      const oldKeys = s.table.map((g) => [...g].sort((x, y) => x - y).join());
      const newKeys = table.map((g) => [...g].sort((x, y) => x - y).join());
      if (!oldKeys.every((k) => newKeys.includes(k))) fail('En tu primera jugada no puedes tocar la mesa');
      const fresh = table.filter((g) => g.every((id) => rack.has(id)));
      if (fresh.flat().length !== placed.length) fail('En tu primera jugada solo puedes usar tus fichas');
      const pts = fresh.reduce((x, g) => x + analyze(g, s.tiles).value, 0);
      if (pts < 30) fail(`Tu primera jugada tiene que sumar 30 (llevas ${pts})`);
      s.opened[seat] = true;
    }
    s.table = table.map((g, i) => results[i].order);
    s.racks[seat] = s.racks[seat].filter((id) => !placed.includes(id));
    s.passes = 0;
    pushLog(s, `{${seat}} pone ${placed.length} ${placed.length > 1 ? 'fichas' : 'ficha'}`);
    s.fx = { id: s.v, type: 'commit', seat, placed };
    if (placed.length >= 6) { s.fx.text = `¡{${seat}} suelta ${placed.length} fichas!`; s.fx.emoji = '💥'; }
    if (placed.some((id) => s.tiles[id].j)) { s.fx.text = s.fx.text || '¡Comodín en juego!'; s.fx.emoji = s.fx.emoji || '😀'; }
    if (!s.racks[seat].length) {
      s.over = true; s.winner = seat; s.timer = null;
      s.fx = { id: s.v, type: 'win', seat, placed, text: '¡{' + seat + '} se queda sin fichas! ¡RUMI!', emoji: '🏆', bannerDelay: 600 };
      pushLog(s, `🏆 {${seat}} gana`);
      return s;
    }
    nextTurn(s);
    return s;
  },

  bot(s, seat) {
    const T = s.tiles;
    let rack = s.racks[seat].slice();
    const sets = findSets(rack, T);
    let table = s.table.map((g) => g.slice());
    const val = sets.reduce((x, g) => x + analyze(g, T).value, 0);
    if (!s.opened[seat]) {
      if (val < 30) return { type: 'draw' };
      return { type: 'commit', table: [...table, ...sets] };
    }
    table.push(...sets);
    const used = new Set(sets.flat());
    rack = rack.filter((id) => !used.has(id));
    // añadir fichas sueltas a lo que hay en la mesa
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of rack) {
        for (let g = 0; g < table.length; g++) {
          const cand = [...table[g], id];
          if (analyze(cand, T).ok) { table[g] = cand; rack = rack.filter((x) => x !== id); changed = true; break; }
        }
        if (changed) break;
      }
    }
    if (!table.flat().some((id) => s.racks[seat].includes(id))) return { type: 'draw' };
    return { type: 'commit', table };
  },
  botDelay: () => 1600,

  demo() {
    const s = this.setup(2);
    const id = (n, c) => s.tiles.find((t) => !t.j && t.n === n && t.c === c).id;
    const a = [id(10, 0), id(11, 0), id(12, 0)];
    s.racks[0] = [...a, id(5, 1), id(7, 2), 104];
    const g = s.tiles.filter((t) => !t.j && t.n === 7 && t.c !== 2).slice(0, 2).map((t) => t.id);
    s.racks[1] = [...g, id(13, 0), id(2, 3), id(3, 3)];
    s.pool = s.pool.filter((x) => !s.racks[0].includes(x) && !s.racks[1].includes(x));
    return { state: s, steps: [
      { say: 'Ana tiene el 10, 11 y 12 rojos: una serie que suma 33. ¡Ya puede salir!', seat: 0, a: { type: 'commit', table: [a] }, wait: 2800 },
      { say: 'Leo no llega a 30 puntos con lo que tiene, así que roba una ficha.', seat: 1, a: { type: 'draw' } },
      { say: 'Ana no tiene otra combinación de 3: roba ella también.', seat: 0, a: { type: 'draw' } },
      { say: 'Cuando ya has salido, puedes añadir fichas a lo que haya en la mesa y reordenarla. ¡Gana quien se quede sin fichas!', wait: 3000 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat ?? 0;
    const myTurn = ctx.mySeat === s.turn && !s.over;
    const T = s.tiles;
    const ui = ctx.ui.rumi || (ctx.ui.rumi = {});
    if (ui.v !== s.v || !ui.work) {
      ui.v = s.v;
      ui.work = { table: s.table.map((g) => g.slice()), rack: (s.racks[me] || []).filter((x) => x >= 0) };
      ui.sel = [];
    }
    if (ui.sort) {
      const key = ui.sort === 'num' ? (t) => (t.j ? 99 : t.n * 10 + t.c) : (t) => (t.j ? 99 : t.c * 100 + t.n);
      ui.work.rack.sort((x, y) => key(T[x]) - key(T[y]));
    }
    const W = ui.work;
    const myRack = new Set(s.racks[me] || []);
    const tileHTML = (id, where) => {
      const t = T[id];
      const fromRack = myRack.has(id);
      return `<button class="rtile ${t.j ? 'joker' : ''} ${ui.sel.includes(id) ? 'sel' : ''} ${where === 't' && fromRack ? 'new' : ''}" data-id="${id}" style="--tc:${t.j ? '#e64980' : COLS[t.c]}">${t.j ? '😀' : t.n}</button>`;
    };
    const groups = W.table.map((g, i) => {
      const an = analyze(g, T);
      const shown = an.ok ? an.order : g;
      return `<div class="rset ${an.ok ? 'ok' : 'bad'} ${myTurn && ui.sel.length ? 'target' : ''}" data-set="${i}" style="--n:${Math.max(g.length, 3)}">${shown.map((id) => tileHTML(id, 't')).join('')}${!an.ok ? '<i class="rbad">✖</i>' : ''}${myTurn && ui.sel.length && !g.every((id) => ui.sel.includes(id)) ? '<button class="rdrop" data-drop>⬇️ aquí</button>' : ''}</div>`;
    }).join('');
    const placed = W.table.flat().filter((id) => myRack.has(id));
    const allOk = W.table.every((g) => !g.length || analyze(g, T).ok);
    const changed = placed.length > 0 || JSON.stringify(W.table) !== JSON.stringify(s.table);
    let openPts = 0;
    if (!s.opened[me]) openPts = W.table.filter((g) => g.length && g.every((id) => myRack.has(id))).reduce((x, g) => x + (analyze(g, T).value || 0), 0);
    const canCommit = myTurn && allOk && placed.length > 0 && (s.opened[me] || openPts >= 30);
    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (myTurn) status = s.opened[me] ? '👉 Toca fichas y luego dónde ponerlas' : `👉 Primera jugada: necesitas 30 puntos (llevas ${openPts})`;
    else status = `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    el.innerHTML = `
      <div class="players">${chipsHTML(s, ctx, (i) => `🧩 ${s.racks[i].length}${s.opened[i] ? '' : ' 🔒'}`)}</div>
      <div class="status">${status}</div>
      ${s.turnMs && !s.over ? '<div class="timerbar" data-timer></div>' : ''}
      <div class="rtable">${groups || '<p class="hint light center">La mesa está vacía</p>'}${myTurn ? `<button class="rset newset ${ui.sel.length ? 'target' : ''}" data-set="new">➕ Nuevo</button>` : ''}</div>
      <div class="rpool">🧩 Quedan ${s.pool.length} fichas en el montón</div>
      ${myTurn ? `<div class="ractions">
        ${ui.sel.some((id) => myRack.has(id) && !W.rack.includes(id)) ? '<button class="btn" data-back>⬇️ Al atril</button>' : ''}
        ${changed ? '<button class="btn" data-undo>↩️ Deshacer</button>' : ''}
        ${changed ? `<button class="btn ${canCommit ? 'c2 pulse' : 'disabled'}" data-commit>✅ Terminar jugada</button>` : `<button class="btn c3" data-draw>${s.pool.length ? '🫳 Robar y pasar' : '🙅 Pasar'}</button>`}
      </div>` : ''}
      <div class="rrack ${myTurn && ui.sel.some((id) => myRack.has(id) && !W.rack.includes(id)) ? 'target' : ''}" data-rack>${W.rack.map((id) => tileHTML(id, 'r')).join('')}</div>
      <div class="row center"><button class="chip" data-sort="num">Ordenar 7️⃣7️⃣7️⃣</button><button class="chip" data-sort="col">Ordenar 7️⃣8️⃣9️⃣</button></div>
      ${s.over && s.sums ? `<p class="hint light center">Puntos en el atril: ${s.sums.map((v, k) => `${esc(ctx.players[k])} ${v}`).join(' · ')}</p>` : ''}
      ${logHTML(s, ctx, 2)}`;
    el.querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => { ui.sort = b.dataset.sort; ctx.rerender(); });
    if (!myTurn) return;
    el.querySelectorAll('.rtile').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const id = +b.dataset.id;
      ui.sel = ui.sel.includes(id) ? ui.sel.filter((x) => x !== id) : [...ui.sel, id];
      ctx.sound('click'); ctx.rerender();
    });
    const moveTo = (target) => {
      if (!ui.sel.length) return;
      W.table = W.table.map((g) => g.filter((id) => !ui.sel.includes(id)));
      W.rack = W.rack.filter((id) => !ui.sel.includes(id));
      if (target === 'new') W.table.push(ui.sel.slice());
      else if (target === 'rack') { const back = ui.sel.filter((id) => myRack.has(id)); W.rack.push(...back); const stay = ui.sel.filter((id) => !myRack.has(id)); if (stay.length) W.table.push(stay); }
      else { const idx = +target; const tgt = W.table[idx]; if (tgt) tgt.push(...ui.sel); }
      W.table = W.table.filter((g) => g.length);
      ui.sel = [];
      ctx.sound('place'); ctx.rerender();
    };
    el.querySelectorAll('[data-drop]').forEach((d) => d.onclick = (e) => { e.stopPropagation(); moveTo(d.closest('[data-set]').dataset.set); });
    const ns = el.querySelector('[data-set="new"]'); if (ns) ns.onclick = () => moveTo('new');
    el.querySelector('[data-rack]').addEventListener('click', (e) => { if (ui.sel.length && !e.target.closest('.rtile')) moveTo('rack'); });
    const bk = el.querySelector('[data-back]'); if (bk) bk.onclick = () => moveTo('rack');
    const un = el.querySelector('[data-undo]'); if (un) un.onclick = () => { ui.work = null; ui.v = null; ctx.rerender(); };
    const cm = el.querySelector('[data-commit]');
    if (cm) cm.onclick = () => {
      if (!canCommit) { ctx.toast(!allOk ? 'Hay combinaciones en rojo que no valen' : !placed.length ? 'Pon al menos una ficha tuya' : `Necesitas 30 puntos (llevas ${openPts})`); return; }
      ctx.send({ type: 'commit', table: W.table });
    };
    const dr = el.querySelector('[data-draw]'); if (dr) dr.onclick = () => ctx.send({ type: 'draw' });
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    if (f.type === 'commit' || (f.type === 'win' && f.placed)) {
      const chip = el.querySelector(`[data-chip="${f.seat}"]`);
      const from = chip ? fx.center(chip) : null;
      f.placed.forEach((id, k) => {
        const t = el.querySelector(`.rtable [data-id="${id}"]`);
        if (!t) return;
        if (from && f.seat !== ctx.mySeat) {
          const to = fx.center(t);
          t.animate([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(.5)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 450, delay: k * 80, fill: 'backwards', easing: 'cubic-bezier(.2,.9,.3,1.3)' });
        } else t.animate([{ transform: 'scale(1.4)' }, { transform: 'none' }], { duration: 350, delay: k * 50 });
        setTimeout(() => { const p = fx.center(t); fx.sparkle(p.x, p.y, '#ffe066', 6); }, 400 + k * 80);
      });
      ctx.sound('place');
      setTimeout(() => ctx.sound('special'), 450);
      if (f.type === 'win') setTimeout(() => fx.fireworksShow(el.getBoundingClientRect(), 7), 600);
    }
    if (f.type === 'draw') {
      ctx.sound('deal');
      const pool = el.querySelector('.rpool'), chip = el.querySelector(`[data-chip="${f.seat}"]`);
      if (pool && chip) fx.fly('<div class="rtile back">?</div>', fx.center(pool), fx.center(chip), { size: 34, arc: 60, duration: 500 });
    }
    void PLAYER_COLORS; void COL_NAMES;
  },
};
