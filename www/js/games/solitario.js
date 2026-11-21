import { clone, fail, pushLog, esc, shuffle } from '../util.js';
import { chipsHTML, logHTML } from './common.js';
import { cardFR, deckFR, isRed, SUITS_FR } from './cards.js';

// Solitario clásico. Si jugáis varios, cada uno juega su propio solitario a la vez (con las mismas cartas): ¡carrera!
// Toca una carta y se mueve sola al mejor sitio.
function deal(deck) {
  const tab = Array.from({ length: 7 }, (_, k) => deck.splice(0, k + 1).map((c, i) => ({ ...c, up: i === k })));
  return { tab, stock: deck.map((c) => ({ ...c, up: false })), waste: [], found: { '♠': 0, '♥': 0, '♦': 0, '♣': 0 }, moves: 0, done: 0, gaveUp: false, idle: 0 };
}
const canStack = (c, onto) => (onto ? onto.up && isRed(c.s) !== isRed(onto.s) && c.r === onto.r - 1 : c.r === 13);
const toFound = (p, c) => p.found[c.s] === c.r - 1;
const foundCount = (p) => SUITS_FR.reduce((a, s) => a + p.found[s], 0);

// Todos los movimientos útiles de un tablero (para la máquina y las pistas)
function moves(p) {
  const out = [];
  const w = p.waste[p.waste.length - 1];
  if (w && toFound(p, w)) out.push({ from: 'w', to: 'f', score: 50 });
  p.tab.forEach((pile, i) => {
    const top = pile[pile.length - 1];
    if (top && toFound(p, top)) out.push({ from: 't' + i, k: pile.length - 1, to: 'f', score: 40 + (pile.length > 1 && !pile[pile.length - 2].up ? 30 : 0) });
  });
  p.tab.forEach((pile, i) => {
    const first = pile.findIndex((c) => c.up);
    if (first < 0) return;
    for (let k = first; k < pile.length; k++) {
      p.tab.forEach((dst, j) => {
        if (j === i) return;
        if (!canStack(pile[k], dst[dst.length - 1])) return;
        const reveals = k > 0 && !pile[k - 1].up;
        if (pile[k].r === 13 && k === 0) return; // rey ya en hueco: no sirve
        if (k !== first && !reveals) return;
        if (!reveals && k === first && first === 0 && !dst.length) return;
        out.push({ from: 't' + i, k, to: 't' + j, score: reveals ? 35 : k === first && first > 0 ? 20 : 5 });
      });
    }
  });
  if (w) p.tab.forEach((dst, j) => { if (canStack(w, dst[dst.length - 1])) out.push({ from: 'w', to: 't' + j, score: 15 }); });
  return out.sort((a, b) => b.score - a.score);
}

function applyMove(p, m) {
  let cards;
  if (m.from === 'w') cards = [p.waste.pop()];
  else if (m.from[0] === 'f') { const suit = m.from.slice(1); cards = [{ s: suit, r: p.found[suit], up: true }]; p.found[suit]--; }
  else { const pile = p.tab[+m.from.slice(1)]; cards = pile.splice(m.k); }
  if (m.to === 'f') p.found[cards[0].s] = cards[0].r;
  else p.tab[+m.to.slice(1)].push(...cards);
  if (m.from[0] === 't') { const pile = p.tab[+m.from.slice(1)]; if (pile.length && !pile[pile.length - 1].up) { pile[pile.length - 1].up = true; return true; } }
  return false;
}
function validMove(p, m) {
  let c;
  if (m.from === 'w') c = p.waste[p.waste.length - 1];
  else if (m.from && m.from[0] === 'f') { const suit = m.from.slice(1); if (!p.found[suit]) return false; c = { s: suit, r: p.found[suit], up: true }; if (m.to === 'f') return false; }
  else if (m.from && m.from[0] === 't') { const pile = p.tab[+m.from.slice(1)]; if (!pile) return false; c = pile[m.k]; if (!c || !c.up) return false; if (m.to === 'f' && m.k !== pile.length - 1) return false; }
  if (!c) return false;
  if (m.to === 'f') return toFound(p, c);
  const dst = p.tab[+String(m.to).slice(1)];
  if (!dst || m.to === m.from) return false;
  return canStack(c, dst[dst.length - 1]);
}

export default {
  id: 'solitario',
  name: 'Solitario',
  icon: '🂡',
  color: '#2b8a3e',
  cat: 'cartas',
  minPlayers: 1,
  maxPlayers: 6,
  teams: null,
  moveSound: 'deal',
  blurb: 'El solitario de toda la vida. Solo, o con amigos a la vez con las mismas cartas: ¿quién lo acaba antes?',
  options: [
    { id: 'draw', label: '🂠 Cartas del mazo', type: 'choice', def: 1, choices: [{ v: 1, label: 'De 1 en 1 (fácil)' }, { v: 3, label: 'De 3 en 3 (difícil)' }] },
  ],
  rules: `<ol>
    <li>El objetivo es subir las 52 cartas a las <b>4 casas</b> de arriba, cada palo del <b>As al Rey</b>.</li>
    <li>En las 7 columnas se apilan cartas <b>de mayor a menor alternando rojo y negro</b>.</li>
    <li>En un hueco vacío solo puede ir un <b>Rey</b>.</li>
    <li>Toca el mazo para sacar cartas. Cuando se acaba, se le da la vuelta.</li>
    <li><b>Toca una carta</b> y se moverá sola al mejor sitio. Si quieres elegir tú, toca la carta y luego el sitio (mantén pulsado).</li>
    <li>Si jugáis varios, todos tenéis <b>las mismas cartas</b>: gana quien lo termine antes, o quien más cartas suba si todos se atascan.</li></ol>`,

  setup(n, opts = {}) {
    const deck = deckFR();
    const draw = (opts.options || {}).draw === 3 ? 3 : 1;
    return { n, boards: Array.from({ length: n }, () => deal(clone(deck))), draw, v: 0, log: ['¡Suerte!'], finished: [] };
  },
  turnOf: () => null,
  actors: (s) => (s.over ? [] : s.boards.map((b, k) => (b.gaveUp || b.done ? -1 : k)).filter((k) => k >= 0)),
  isOver: (s) => !!s.over,
  viewFor(s) {
    const hide = (c) => (c.up ? c : { up: false });
    return { ...s, boards: s.boards.map((b) => ({ ...b, tab: b.tab.map((p) => p.map(hide)), stock: b.stock.map(() => ({ up: false })) })) };
  },

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    const p = s.boards[seat];
    if (!p || p.gaveUp || p.done) fail('Ya has terminado');
    const finishCheck = () => {
      const fc = foundCount(p);
      if (fc === 52) {
        p.done = true;
        s.over = true; s.winner = seat;
        pushLog(s, `🏆 {${seat}} completa el solitario`);
        s.fx = { id: s.v, type: 'win', seat, text: s.n > 1 ? '¡{' + seat + '} lo ha completado!' : '¡Solitario completado!', emoji: '🏆', bannerDelay: 400 };
        return true;
      }
      if (s.boards.every((b) => b.gaveUp || b.done)) {
        let w = 0; s.boards.forEach((b, k) => { if (foundCount(b) > foundCount(s.boards[w])) w = k; });
        s.over = true; s.winner = w;
        s.fx = { id: s.v, type: 'win', seat: w, text: s.n > 1 ? `¡{${w}} gana con ${foundCount(s.boards[w])} cartas!` : `Has subido ${foundCount(s.boards[w])} cartas`, emoji: s.n > 1 ? '🏆' : '🃏' };
        return true;
      }
      return false;
    };
    if (a.type === 'giveup') {
      p.gaveUp = true;
      pushLog(s, `{${seat}} se rinde con ${foundCount(p)} cartas`);
      if (!finishCheck()) s.fx = { id: s.v, type: 'giveup', seat };
      return s;
    }
    if (a.type === 'draw') {
      if (!p.stock.length) {
        if (!p.waste.length) fail('No quedan cartas en el mazo');
        p.stock = p.waste.reverse().map((c) => ({ ...c, up: false }));
        p.waste = [];
        p.idle++;
        s.fx = { id: s.v, type: 'recycle', seat };
        return s;
      }
      const k = Math.min(s.draw, p.stock.length);
      for (let i = 0; i < k; i++) p.waste.push({ ...p.stock.pop(), up: true });
      p.moves++;
      s.fx = { id: s.v, type: 'draw', seat };
      return s;
    }
    let m;
    if (a.type === 'auto') {
      const all = moves(p).filter((x) => x.from === a.from && (a.k == null || x.k === a.k || x.from === 'w'));
      // si la carta tocada no tiene jugada "útil", se prueba cualquier sitio válido
      m = all[0];
      if (!m) {
        const tries = [{ from: a.from, k: a.k, to: 'f' }, ...[0, 1, 2, 3, 4, 5, 6].map((j) => ({ from: a.from, k: a.k, to: 't' + j }))];
        m = tries.find((x) => validMove(p, x));
      }
      if (!m) fail('Esa carta no se puede mover');
    } else if (a.type === 'move') {
      m = { from: a.from, k: a.k, to: a.to };
      if (!validMove(p, m)) fail('Ahí no puede ir');
    } else fail('Acción desconocida');
    const moved = m.from === 'w' ? p.waste[p.waste.length - 1] : m.from[0] === 'f' ? { s: m.from.slice(1), r: p.found[m.from.slice(1)] } : p.tab[+m.from.slice(1)][m.k];
    const revealed = applyMove(p, m);
    p.moves++; p.idle = 0;
    if (finishCheck()) return s;
    s.fx = { id: s.v, type: m.to === 'f' ? 'found' : 'move', seat, to: m.to, card: { s: moved.s, r: moved.r }, revealed, from: m.from };
    // ¿se puede terminar solo? (todo boca arriba y sin mazo)
    if (p.tab.every((pile) => pile.every((c) => c.up)) && !p.stock.length && !p.waste.length && foundCount(p) < 52) s.fx.auto = true;
    return s;
  },

  bot(s, seat) {
    const p = s.boards[seat];
    const ms = moves(p);
    if (ms.length && ms[0].score >= 15) return { type: 'move', from: ms[0].from, k: ms[0].k, to: ms[0].to };
    if (p.stock.length || p.waste.length) {
      if (p.idle >= 2) return { type: 'giveup' };
      return { type: 'draw' };
    }
    return { type: 'giveup' };
  },
  botDelay: () => 650,

  demo() {
    const s = this.setup(1);
    const p = s.boards[0];
    p.tab = [
      [{ s: '♥', r: 1, up: true }],
      [{ s: '♣', r: 9, up: false }, { s: '♠', r: 8, up: true }],
      [{ s: '♦', r: 5, up: false }, { s: '♥', r: 9, up: true }],
      [{ s: '♣', r: 13, up: true }],
      [{ s: '♠', r: 2, up: false }, { s: '♦', r: 12, up: true }],
      [], [],
    ];
    p.stock = [{ s: '♥', r: 2, up: false }];
    p.waste = [];
    return { state: s, steps: [
      { say: 'El As de corazones sube a su casa: toca la carta y se mueve sola.', seat: 0, a: { type: 'auto', from: 't0', k: 0 } },
      { say: 'El 8 de picas (negro) va sobre el 9 de corazones (rojo)… y se descubre la carta de debajo.', seat: 0, a: { type: 'auto', from: 't1', k: 1 } },
      { say: 'Sacamos una carta del mazo: el 2 de corazones.', seat: 0, a: { type: 'draw' } },
      { say: '¡Sube a la casa encima del As!', seat: 0, a: { type: 'auto', from: 'w' } },
      { say: 'La Reina roja va sobre el Rey negro. Así hasta subir las 52 cartas.', seat: 0, a: { type: 'auto', from: 't4', k: 1 }, wait: 3000 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat ?? 0;
    const p = s.boards[me];
    const ui = ctx.ui.sol || (ctx.ui.sol = {});
    const active = !s.over && !p.gaveUp && !p.done;
    const sel = ui.sel && ui.v === s.v ? ui.sel : null;
    const cardBtn = (c, attrs, cls = '') => `<div class="solc ${cls}" ${attrs}>${cardFR(c.up ? c : null, { back: !c.up })}</div>`;
    const found = SUITS_FR.map((su) => `<div class="solslot found" data-to="f" data-found="${su}">${p.found[su] ? cardBtn({ s: su, r: p.found[su], up: true }, `data-from="f${su}"`) : `<span class="ghostsuit ${isRed(su) ? 'red' : ''}">${su}</span>`}</div>`).join('');
    const wasteShow = p.waste.slice(-Math.min(3, s.draw === 3 ? 3 : 1));
    const waste = wasteShow.map((c, i) => cardBtn(c, i === wasteShow.length - 1 ? 'data-from="w"' : '', `wst w${i}`)).join('');
    const tab = p.tab.map((pile, i) => `<div class="solpile" data-to="t${i}">${pile.length ? pile.map((c, k) => cardBtn(c, c.up ? `data-from="t${i}" data-k="${k}"` : '', `${sel && sel.from === 't' + i && k >= sel.k ? 'sel' : ''}`)).join('') : '<div class="solslot empty">K</div>'}</div>`).join('');
    const others = s.n > 1 ? chipsHTML(s, ctx, (i) => `${foundCount(s.boards[i])}/52${s.boards[i].gaveUp ? ' 🏳️' : ''}`, null) : '';
    let status;
    if (s.over) status = s.n > 1 ? `🏆 ¡Gana ${ctx.winnerName(s.winner)}!` : foundCount(p) === 52 ? '🏆 ¡Completado!' : `Has subido ${foundCount(p)} cartas`;
    else if (p.gaveUp) status = '🏳️ Te has rendido. Esperando a los demás…';
    else status = sel ? '👉 Toca dónde quieres ponerla' : `🃏 ${foundCount(p)}/52 cartas en casa · ${p.moves} movimientos`;
    el.innerHTML = `
      ${others ? `<div class="players">${others}</div>` : ''}
      <div class="status">${status}</div>
      <div class="soltable">
        <div class="soltop">
          <div class="solslot stock" data-stock>${p.stock.length ? `${cardFR(null, { back: true })}<b>${p.stock.length}</b>` : '<span>🔄</span>'}</div>
          <div class="solwaste">${waste}</div>
          <div class="solfound">${found}</div>
        </div>
        <div class="soltab">${tab}</div>
      </div>
      ${active ? `<div class="row center"><button class="btn small" data-hint>💡 Pista</button><button class="btn small" data-giveup>🏳️ Me rindo</button></div>` : ''}
      ${s.n > 1 ? logHTML(s, ctx, 1) : ''}`;
    if (!active) return;
    const st = el.querySelector('[data-stock]');
    st.onclick = () => ctx.send({ type: 'draw' });
    let press = null;
    el.querySelectorAll('[data-from]').forEach((c) => {
      const info = { from: c.dataset.from, k: c.dataset.k != null ? +c.dataset.k : undefined };
      c.onpointerdown = () => { press = setTimeout(() => { press = 'long'; ui.sel = info; ui.v = s.v; ctx.sound('click'); ctx.rerender(); }, 450); };
      c.onpointerup = c.onpointerleave = () => { if (press && press !== 'long') clearTimeout(press); };
      c.onclick = (e) => {
        e.stopPropagation();
        if (press === 'long') { press = null; return; }
        if (sel) { const dst = c.closest('[data-to]'); if (dst) { ui.sel = null; ctx.send({ type: 'move', from: sel.from, k: sel.k, to: dst.dataset.to }); return; } }
        ctx.send({ type: 'auto', from: info.from, k: info.k });
      };
    });
    el.querySelectorAll('[data-to]').forEach((d) => d.addEventListener('click', () => {
      if (!sel) return;
      ui.sel = null;
      ctx.send({ type: 'move', from: sel.from, k: sel.k, to: d.dataset.to });
    }));
    el.querySelector('[data-hint]').onclick = () => {
      const m = moves(p)[0];
      if (!m) { ctx.toast(p.stock.length || p.waste.length ? 'Saca cartas del mazo 🂠' : 'No veo jugadas… 😕'); fxPulse(el.querySelector('[data-stock]')); return; }
      const elFrom = m.from === 'w' ? el.querySelector('[data-from="w"]') : el.querySelector(`[data-from="${m.from}"][data-k="${m.k}"]`);
      fxPulse(elFrom);
    };
    el.querySelector('[data-giveup]').onclick = () => { if (confirm('¿Seguro que te rindes?')) ctx.send({ type: 'giveup' }); };
    function fxPulse(x) { if (x) x.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.15)', filter: 'brightness(1.3) drop-shadow(0 0 8px #ffe066)' }, { transform: 'scale(1)' }], { duration: 500, iterations: 3 }); }
    void esc; void shuffle;
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    if (f.seat !== (ctx.mySeat ?? 0)) return; // solo se anima tu propio tablero
    if (f.type === 'draw' || f.type === 'recycle') {
      ctx.sound('deal');
      const w = el.querySelector('.solwaste .solc:last-child');
      if (w && f.type === 'draw') w.animate([{ transform: 'translateX(-60px) rotateY(90deg)' }, { transform: 'none' }], { duration: 280 });
      return;
    }
    if (f.type === 'found' || f.type === 'move') {
      const dst = f.to === 'f' ? el.querySelector(`[data-found="${f.card.s}"] .solc`) : el.querySelector(`[data-to="${f.to}"] .solc:last-child`);
      if (dst) {
        dst.animate([{ transform: 'scale(1.25)', filter: 'brightness(1.3)' }, { transform: 'none' }], { duration: 300 });
        const p = fx.center(dst);
        if (f.to === 'f') { fx.sparkle(p.x, p.y, '#ffe066', 14); ctx.sound(f.card.r === 13 ? 'special' : 'ding'); if (f.card.r === 13) fx.floatText(p.x, p.y - 20, '¡Palo completo!', '#ffe066', 22); }
        else ctx.sound('deal');
      }
      if (f.revealed) {
        const src = el.querySelector(`[data-to="${f.from}"] .solc:last-child`);
        if (src) src.animate([{ transform: 'rotateY(90deg)' }, { transform: 'none' }], { duration: 300 });
      }
      if (f.auto && !ctx.state.over) {
        // todo descubierto: se termina solo
        setTimeout(() => { const m = moves(ctx.state.boards[f.seat]).find((x) => x.to === 'f'); if (m) ctx.send({ type: 'move', from: m.from, k: m.k, to: 'f' }); }, 220);
      }
    }
    if (f.type === 'win') {
      // cascada de cartas
      const b = el.querySelector('.soltable').getBoundingClientRect();
      for (let k = 0; k < 16; k++) setTimeout(() => fx.fly(cardFR({ s: SUITS_FR[k % 4], r: 13 - (k % 13) }), { x: b.left + b.width * (0.4 + (k % 4) * 0.15), y: b.top + 40 }, { x: b.left + Math.random() * b.width, y: b.bottom + 60 }, { size: 50, arc: 160, duration: 1100, spin: 1 }), k * 110);
    }
  },
};
