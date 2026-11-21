import { clone, fail, pushLog, esc } from '../util.js';
import { chipsHTML, logHTML } from './common.js';

// Ajedrez completo: enroque, captura al paso, coronación, jaque, jaque mate, ahogado y tablas.
// Tablero plano de 64 casillas: índice = fila*8+columna, fila 0 = lado negro (arriba). Mayúsculas = blancas.
const START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';
const isW = (p) => p !== '.' && p === p.toUpperCase();
const colorOf = (p) => (p === '.' ? -1 : isW(p) ? 0 : 1);
const RC = (i) => [i >> 3, i & 7];
const IDX = (r, c) => r * 8 + c;
const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const N_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const K_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const B_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const R_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAMES = { k: 'rey', q: 'dama', r: 'torre', b: 'alfil', n: 'caballo', p: 'peón' };
const VAL = { p: 100, n: 310, b: 330, r: 500, q: 900, k: 0 };
const FILES = 'abcdefgh';
const sq = (i) => FILES[i & 7] + (8 - (i >> 3));

function attacked(b, i, by) {
  const [r, c] = RC(i);
  const dir = by === 0 ? 1 : -1; // peones blancos atacan hacia arriba: el atacante está una fila más abajo
  for (const dc of [-1, 1]) { const rr = r + dir, cc = c + dc; if (inB(rr, cc)) { const p = b[IDX(rr, cc)]; if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'p') return true; } }
  for (const [dr, dc] of N_D) { const rr = r + dr, cc = c + dc; if (inB(rr, cc)) { const p = b[IDX(rr, cc)]; if (colorOf(p) === by && p.toLowerCase() === 'n') return true; } }
  for (const [dr, dc] of K_D) { const rr = r + dr, cc = c + dc; if (inB(rr, cc)) { const p = b[IDX(rr, cc)]; if (colorOf(p) === by && p.toLowerCase() === 'k') return true; } }
  for (const [dirs, kinds] of [[B_D, 'bq'], [R_D, 'rq']]) for (const [dr, dc] of dirs) {
    let rr = r + dr, cc = c + dc;
    while (inB(rr, cc)) {
      const p = b[IDX(rr, cc)];
      if (p !== '.') { if (colorOf(p) === by && kinds.includes(p.toLowerCase())) return true; break; }
      rr += dr; cc += dc;
    }
  }
  return false;
}
const kingSq = (b, side) => b.indexOf(side === 0 ? 'K' : 'k');
const inCheck = (b, side) => attacked(b, kingSq(b, side), 1 - side);

function pseudo(st, side) {
  const { b, ep, cr } = st;
  const out = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (colorOf(p) !== side) continue;
    const [r, c] = RC(i);
    const t = p.toLowerCase();
    const add = (to, extra = {}) => out.push({ from: i, to, ...extra });
    if (t === 'p') {
      const dir = side === 0 ? -1 : 1, startR = side === 0 ? 6 : 1, lastR = side === 0 ? 0 : 7;
      const push = (to, extra) => { if ((to >> 3) === lastR) ['q', 'r', 'b', 'n'].forEach((pr) => add(to, { ...extra, promo: pr })); else add(to, extra); };
      if (inB(r + dir, c) && b[IDX(r + dir, c)] === '.') {
        push(IDX(r + dir, c));
        if (r === startR && b[IDX(r + 2 * dir, c)] === '.') add(IDX(r + 2 * dir, c), { dbl: true });
      }
      for (const dc of [-1, 1]) {
        const rr = r + dir, cc = c + dc;
        if (!inB(rr, cc)) continue;
        const to = IDX(rr, cc);
        if (b[to] !== '.' && colorOf(b[to]) !== side) push(to);
        else if (to === ep) add(to, { ep: true });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? N_D : K_D) {
        const rr = r + dr, cc = c + dc;
        if (inB(rr, cc) && colorOf(b[IDX(rr, cc)]) !== side) add(IDX(rr, cc));
      }
      if (t === 'k') {
        const row = side === 0 ? 7 : 0;
        if (i === IDX(row, 4) && !attacked(b, i, 1 - side)) {
          const [kS, qS] = side === 0 ? ['K', 'Q'] : ['k', 'q'];
          if (cr.includes(kS) && b[IDX(row, 5)] === '.' && b[IDX(row, 6)] === '.' && !attacked(b, IDX(row, 5), 1 - side)) add(IDX(row, 6), { castle: 'k' });
          if (cr.includes(qS) && b[IDX(row, 3)] === '.' && b[IDX(row, 2)] === '.' && b[IDX(row, 1)] === '.' && !attacked(b, IDX(row, 3), 1 - side)) add(IDX(row, 2), { castle: 'q' });
        }
      }
    } else {
      const dirs = t === 'b' ? B_D : t === 'r' ? R_D : [...B_D, ...R_D];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (inB(rr, cc)) {
          const to = IDX(rr, cc);
          if (b[to] === '.') add(to);
          else { if (colorOf(b[to]) !== side) add(to); break; }
          rr += dr; cc += dc;
        }
      }
    }
  }
  return out;
}

function make(st, m) {
  const b = typeof st.b === 'string' ? st.b.split('') : st.b.slice();
  const p = b[m.from];
  const side = colorOf(p);
  let captured = b[m.to] !== '.' ? b[m.to] : null;
  b[m.to] = m.promo ? (side === 0 ? m.promo.toUpperCase() : m.promo) : p;
  b[m.from] = '.';
  if (m.ep) { const capSq = m.to + (side === 0 ? 8 : -8); captured = b[capSq]; b[capSq] = '.'; }
  if (m.castle) {
    const row = side === 0 ? 7 : 0;
    if (m.castle === 'k') { b[IDX(row, 5)] = b[IDX(row, 7)]; b[IDX(row, 7)] = '.'; } else { b[IDX(row, 3)] = b[IDX(row, 0)]; b[IDX(row, 0)] = '.'; }
  }
  let cr = st.cr;
  const strip = (chs) => { for (const ch of chs) cr = cr.replace(ch, ''); };
  if (p === 'K') strip('KQ'); if (p === 'k') strip('kq');
  [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']].forEach(([s2, ch]) => { if (m.from === s2 || m.to === s2) strip(ch); });
  return { b, cr, ep: m.dbl ? (m.from + m.to) / 2 : -1, captured };
}
function legal(st, side) {
  return pseudo(st, side).filter((m) => !inCheck(make(st, m).b, side));
}

// --- Máquina: alfa-beta con material y algo de posición ---
const CENTER = [0, 1, 2, 3, 3, 2, 1, 0];
function evaluate(b, side) {
  let sc = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p === '.') continue;
    const t = p.toLowerCase();
    const [r, c] = RC(i);
    let v = VAL[t];
    if (t === 'n' || t === 'b') v += (CENTER[r] + CENTER[c]) * 6;
    if (t === 'p') v += (isW(p) ? 6 - r : r - 1) * 8 + (c > 1 && c < 6 ? CENTER[r] * 3 : 0);
    if (t === 'k') v += (isW(p) ? (r === 7 ? 10 : -10) : (r === 0 ? 10 : -10));
    sc += colorOf(p) === side ? v : -v;
  }
  return sc;
}
function ab(st, side, depth, alpha, beta) {
  const ms = legal(st, side);
  if (!ms.length) return inCheck(st.b, side) ? -100000 - depth : 0;
  if (depth === 0) return evaluate(st.b, side);
  ms.sort((x, y) => (st.b[y.to] !== '.' ? VAL[st.b[y.to].toLowerCase()] : 0) - (st.b[x.to] !== '.' ? VAL[st.b[x.to].toLowerCase()] : 0));
  let best = -Infinity;
  for (const m of ms) {
    const v = -ab(make(st, m), 1 - side, depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

const glyph = (p) => `<span class="chp ${isW(p) ? 'w' : 'b'}">${GLYPH[p.toLowerCase()]}&#xFE0E;</span>`;
const posKey = (s) => s.b + s.turn + s.cr + s.ep;

export default {
  id: 'ajedrez',
  name: 'Ajedrez',
  icon: '♞',
  color: '#495057',
  cat: 'clasicos',
  minPlayers: 2,
  maxPlayers: 2,
  teams: null,
  blurb: 'El rey de los juegos de tablero, completo: enroque, captura al paso, coronación y jaque mate.',
  options: [
    { id: 'hints', label: '💡 Marcar jugadas posibles', type: 'bool', def: true },
  ],
  rules: `<ol>
    <li>Empiezan las <b>blancas</b>. Cada pieza se mueve a su manera:
      <ul><li>♜ <b>Torre</b>: en línea recta lo que quiera.</li><li>♝ <b>Alfil</b>: en diagonal lo que quiera.</li>
      <li>♛ <b>Dama</b>: recta o diagonal lo que quiera.</li><li>♚ <b>Rey</b>: una casilla en cualquier dirección.</li>
      <li>♞ <b>Caballo</b>: en "L" y puede saltar piezas.</li><li>♟ <b>Peón</b>: una adelante (dos la primera vez) y come en diagonal.</li></ul></li>
    <li>Se <b>come</b> poniendo tu pieza en la casilla de una rival.</li>
    <li><b>Jaque</b>: tu rey está atacado y tienes que salvarlo. <b>Jaque mate</b>: no puede salvarse y pierdes.</li>
    <li><b>Enroque</b>: rey dos casillas hacia la torre y la torre salta al otro lado (si ninguno se ha movido y no hay jaque por el camino).</li>
    <li>El peón que llega al final <b>corona</b>: elige dama, torre, alfil o caballo.</li>
    <li><b>Tablas</b> si el que mueve no tiene jugadas y no está en jaque (ahogado), con 50 jugadas sin comer ni mover peón, o si se repite tres veces la posición.</li></ol>`,

  setup(n, opts = {}) {
    const s = { n: 2, b: START, cr: 'KQkq', ep: -1, turn: 0, v: 0, half: 0, moves: 0, last: null, rep: {}, lost: [[], []], hints: (opts.options || {}).hints !== false, log: ['Empiezan las blancas'] };
    s.rep[posKey(s)] = 1;
    return s;
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
    const ms = legal(s, seat);
    const m = ms.find((x) => x.from === a.from && x.to === a.to && (!x.promo || x.promo === (a.promo || 'q')));
    if (!m) fail(inCheck(s.b, seat) ? '¡Estás en jaque! Tienes que salvar al rey' : 'Ese movimiento no vale');
    const piece = s.b[m.from];
    const res = make(s, m);
    s.b = res.b.join(''); s.cr = res.cr; s.ep = res.ep;
    if (res.captured) s.lost[1 - seat].push(res.captured);
    s.half = res.captured || piece.toLowerCase() === 'p' ? 0 : s.half + 1;
    s.moves++;
    s.last = { from: m.from, to: m.to };
    s.turn = 1 - seat;
    const key = posKey(s);
    s.rep[key] = (s.rep[key] || 0) + 1;
    const check = inCheck(s.b, s.turn);
    const replies = legal(s, s.turn);
    const name = NAMES[piece.toLowerCase()];
    pushLog(s, `{${seat}} ${res.captured ? `come ${NAMES[res.captured.toLowerCase()]} con` : 'mueve'} ${name} ${sq(m.from)}→${sq(m.to)}${m.castle ? ' (enroque)' : ''}${m.promo ? ` y corona ${NAMES[m.promo]}` : ''}`);
    const fx = { id: s.v, type: res.captured ? 'capture' : 'move', from: m.from, to: m.to, seat, captured: res.captured, castle: m.castle ? (seat === 0 ? (m.castle === 'k' ? [63, 61] : [56, 59]) : (m.castle === 'k' ? [7, 5] : [0, 3])) : null, ep: m.ep ? m.to + (seat === 0 ? 8 : -8) : null, promo: m.promo };
    if (!replies.length) {
      s.over = true;
      if (check) { s.winner = seat; fx.type = 'win'; fx.text = '¡Jaque mate!'; fx.emoji = '♚'; pushLog(s, `🏆 Jaque mate de {${seat}}`); }
      else { s.tie = true; s.winner = seat; fx.type = 'win'; fx.text = '¡Ahogado! Tablas'; fx.emoji = '🤝'; }
      fx.bannerDelay = 500;
    } else if (s.half >= 100 || s.rep[key] >= 3 || /^[.kK]+$/.test(s.b)) {
      s.over = true; s.tie = true; s.winner = seat;
      fx.type = 'win'; fx.text = '¡Tablas!'; fx.emoji = '🤝';
    } else if (check) { fx.check = true; fx.text = '¡Jaque!'; fx.emoji = '⚠️'; fx.bannerDelay = 350; }
    else if (m.promo) { fx.text = `¡Corona ${NAMES[m.promo]}!`; fx.emoji = '👑'; fx.bannerDelay = 350; }
    else if (m.castle) { fx.text = '¡Enroque!'; fx.emoji = '🏰'; fx.bannerDelay = 350; }
    s.fx = fx;
    return s;
  },

  bot(s, seat) {
    const root = { ...s, b: s.b.split('') };
    const ms = legal(root, seat).filter((m) => !m.promo || m.promo === 'q');
    const t0 = Date.now();
    let choice = ms[0];
    // profundidad creciente mientras haya tiempo (para que en el móvil no tarde)
    for (let depth = 1; depth <= 3; depth++) {
      let best = -Infinity, pickM = ms[0];
      for (const m of ms) {
        const v = -ab(make(root, m), 1 - seat, depth, -Infinity, Infinity) + Math.random() * 18;
        if (v > best) { best = v; pickM = m; }
      }
      choice = pickM;
      if (Date.now() - t0 > (depth === 1 ? 120 : 60)) break;
    }
    return { type: 'move', from: choice.from, to: choice.to, promo: choice.promo };
  },
  botDelay: () => 900,

  demo() {
    const s = this.setup();
    const mv = (seat, f, t, say, wait) => ({ seat, a: { type: 'move', from: IDX(8 - +f[1], FILES.indexOf(f[0])), to: IDX(8 - +t[1], FILES.indexOf(t[0])) }, say, wait });
    return { state: s, steps: [
      mv(0, 'e2', 'e4', 'Las blancas abren con el peón de rey: dos casillas en su primera jugada.'),
      mv(1, 'e7', 'e5', 'Las negras responden igual.'),
      mv(0, 'f1', 'c4', 'El alfil blanco sale en diagonal y apunta a f7…'),
      mv(1, 'b8', 'c6', 'El caballo negro salta en "L".'),
      mv(0, 'd1', 'h5', 'La dama blanca sale al ataque…'),
      mv(1, 'g8', 'f6', 'Las negras atacan a la dama… ¡pero no ven el peligro!'),
      mv(0, 'h5', 'f7', '¡La dama come en f7 protegida por el alfil: jaque mate! (el "mate del pastor")', 4000),
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const view = me === 1 ? 1 : 0;
    const myTurn = me === s.turn && !s.over;
    const ui = ctx.ui.chess || (ctx.ui.chess = {});
    if (ui.v !== s.v) { ui.v = s.v; ui.sel = null; ui.promo = null; }
    const ms = myTurn ? legal(s, me) : [];
    const from = new Set(ms.map((m) => m.from));
    const dests = ui.sel != null ? ms.filter((m) => m.from === ui.sel) : [];
    const destSet = new Set(dests.map((m) => m.to));
    const check = !s.over && inCheck(s.b, s.turn) ? kingSq(s.b, s.turn) : -1;
    let cells = '';
    for (let vr = 0; vr < 8; vr++) for (let vc = 0; vc < 8; vc++) {
      const r = view ? 7 - vr : vr, c = view ? 7 - vc : vc;
      const i = IDX(r, c);
      const p = s.b[i];
      const cls = ['chc', (r + c) % 2 ? 'dark' : 'light'];
      if (s.last && (s.last.from === i || s.last.to === i)) cls.push('last');
      if (ui.sel === i) cls.push('sel');
      if (destSet.has(i) && s.hints) cls.push(p !== '.' ? 'capt' : 'dest');
      if (i === check) cls.push('check');
      if (from.has(i) && s.hints) cls.push('can');
      const coordR = vc === 0 ? `<i class="crd r">${8 - r}</i>` : '';
      const coordC = vr === 7 ? `<i class="crd c">${FILES[c]}</i>` : '';
      cells += `<div class="${cls.join(' ')}" data-i="${i}">${p !== '.' ? `<div class="chpw" data-p="${i}">${glyph(p)}</div>` : ''}${coordR}${coordC}</div>`;
    }
    const lostHTML = (side) => s.lost[side].map((p) => glyph(p)).join('');
    let status;
    if (s.over) status = s.tie ? '🤝 ¡Tablas!' : `🏆 ¡Jaque mate! Gana ${ctx.winnerName(s.winner)}`;
    else if (myTurn) status = check >= 0 ? '⚠️ ¡Jaque! Salva a tu rey' : ui.sel != null ? '👉 Toca la casilla de destino' : '👉 ¡Te toca! Toca una pieza';
    else status = `Turno de <b>${esc(ctx.players[s.turn])}</b> (${s.turn ? 'negras' : 'blancas'})${check >= 0 ? ' · ¡Jaque!' : ''}`;
    el.innerHTML = `
      <div class="players">${chipsHTML(s, ctx, (i) => (i === 0 ? '♔ blancas' : '♚ negras'))}</div>
      <div class="status">${status}</div>
      <div class="chlost">${lostHTML(view)}</div>
      <div class="chwrap"><div class="chboard">${cells}</div></div>
      <div class="chlost">${lostHTML(1 - view)}</div>
      ${ui.promo ? `<div class="promo"><span>Corona tu peón:</span>${['q', 'r', 'b', 'n'].map((t) => `<button class="btn" data-promo="${t}">${glyph(me === 0 ? t.toUpperCase() : t)}</button>`).join('')}</div>` : ''}
      ${myTurn ? '<div class="row center"><button class="btn small" data-resign>🏳️ Rendirse</button></div>' : ''}
      ${logHTML(s, ctx, 1)}`;
    el.querySelectorAll('.chc').forEach((cell) => cell.onclick = () => {
      if (!myTurn) return;
      const i = +cell.dataset.i;
      if (ui.sel != null && destSet.has(i)) {
        const m = dests.find((x) => x.to === i);
        if (m.promo) { ui.promo = { from: ui.sel, to: i }; ctx.rerender(); return; }
        ctx.send({ type: 'move', from: ui.sel, to: i });
        return;
      }
      if (from.has(i)) { ui.sel = ui.sel === i ? null : i; ui.promo = null; ctx.sound('click'); ctx.rerender(); return; }
      if (ui.sel != null) { ctx.toast(inCheck(s.b, me) ? '¡Estás en jaque!' : 'Ahí no puede ir'); }
    });
    el.querySelectorAll('[data-promo]').forEach((b) => b.onclick = () => ctx.send({ type: 'move', from: ui.promo.from, to: ui.promo.to, promo: b.dataset.promo }));
    const rs = el.querySelector('[data-resign]'); if (rs) rs.onclick = () => { if (confirm('¿Seguro que te rindes?')) ctx.send({ type: 'resign' }); };
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    if (f.from == null) return;
    const cell = (i) => el.querySelector(`.chc[data-i="${i}"]`);
    const slide = (fromI, toI) => {
      const pc = el.querySelector(`[data-p="${toI}"]`), a = cell(fromI), b = cell(toI);
      if (!pc || !a || !b) return null;
      const p1 = fx.center(a), p2 = fx.center(b);
      const isKnight = pc.textContent.includes('♞');
      const mid = isKnight ? `translate(${(p1.x - p2.x) / 2}px, ${(p1.y - p2.y) / 2 - 30}px) scale(1.3)` : `translate(${(p1.x - p2.x) / 2}px, ${(p1.y - p2.y) / 2}px) scale(1.12)`;
      return pc.animate([{ transform: `translate(${p1.x - p2.x}px, ${p1.y - p2.y}px)` }, { transform: mid }, { transform: 'none' }], { duration: 420, easing: 'ease-in-out' }).finished.catch(() => {});
    };
    // pieza comida: se ve un instante y sale disparada
    let ghost = null;
    const capAt = f.ep != null ? f.ep : f.to;
    if (f.captured && cell(capAt)) {
      ghost = document.createElement('div');
      ghost.className = 'chpw ghost'; ghost.innerHTML = glyph(f.captured);
      cell(capAt).appendChild(ghost);
    }
    const anims = [slide(f.from, f.to)];
    if (f.castle) anims.push(slide(f.castle[0], f.castle[1]));
    await fx.wait(330);
    if (ghost) {
      const p = fx.center(ghost);
      ctx.sound('capture');
      fx.burst(p.x, p.y, { color: isW(f.captured) ? '#fff' : '#222', n: 22 });
      ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${f.seat === 0 ? 60 : -60}px, -80px) rotate(${f.seat ? -1 : 1}turn) scale(.4)`, opacity: 0 }], { duration: 600, fill: 'forwards', easing: 'ease-out' });
      setTimeout(() => ghost.remove(), 650);
    }
    await Promise.all(anims);
    ctx.sound(f.captured ? 'special' : 'place');
    const to = cell(f.to);
    if (to && f.promo) { const p = fx.center(to); fx.sparkle(p.x, p.y, '#ffd43b', 30, 1.5); fx.emojiRain(p.x, p.y - 30, '👑', 5); }
    if (f.check || f.type === 'win') {
      const k = el.querySelector('.chc.check') || (f.type === 'win' ? el.querySelector(`.chc[data-i="${f.to}"]`) : null);
      if (k) { fx.shake(k); const p = fx.center(k); fx.burst(p.x, p.y, { color: '#ff3b3b', n: 26 }); }
      ctx.sound(f.type === 'win' ? 'win' : 'bad');
      if (f.type === 'win' && !f.text.includes('Tablas') && !f.text.includes('Ahogado')) { fx.screenShake(8); fx.fireworksShow(el.querySelector('.chboard').getBoundingClientRect(), 6); }
    }
  },
};
