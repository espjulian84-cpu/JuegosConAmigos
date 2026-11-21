import { clone, fail, pushLog, esc, PLAYER_COLORS, sameTeam } from '../util.js';
import { chipsHTML, logHTML } from './common.js';
import { deckES, cardES, nameES, SUIT_NAME_ES } from './cards.js';

// Brisca con baraja española. No hay que asistir: gana la baza el triunfo más alto o, si no hay, la más alta del palo que sale.
const ORDER = [2, 4, 5, 6, 7, 10, 11, 12, 3, 1]; // de menos a más
const PTS = { 1: 11, 3: 10, 12: 4, 11: 3, 10: 2 };
const pts = (c) => PTS[c.r] || 0;
const power = (c) => ORDER.indexOf(c.r);
function trickWinner(table, trump) {
  let best = table[0];
  for (const t of table.slice(1)) {
    const b = best.c, c = t.c;
    if (c.s === b.s ? power(c) > power(b) : c.s === trump) best = t;
  }
  return best.seat;
}
const teamPts = (s, seat) => s.won.reduce((a, cards, k) => (sameTeam(s, k, seat) ? a + cards.reduce((x, c) => x + pts(c), 0) : a), 0);
const canSwap = (s, seat) => {
  if (!s.muestra || !s.deck.length || s.table.length) return null;
  const need = s.muestra.r > 7 || s.muestra.r === 1 || s.muestra.r === 3 ? 7 : 2;
  const i = s.hands[seat].findIndex((c) => c && c.s === s.muestra.s && c.r === need);
  return i >= 0 ? i : null;
};

export default {
  id: 'brisca',
  name: 'Brisca',
  icon: '🗡️',
  color: '#c92a2a',
  cat: 'cartas',
  minPlayers: 2,
  maxPlayers: 4,
  teams: 'pairs4',
  hidden: true,
  moveSound: 'deal',
  blurb: 'El clásico de la baraja española: tres cartas en la mano, un palo que manda y a sumar más de 60 puntos.',
  rules: `<ol>
    <li>Se reparten <b>3 cartas</b> a cada uno y se vuelve una carta: su palo es el <b>triunfo</b> (el que manda). Se queda debajo del mazo.</li>
    <li>Por turnos, cada uno echa una carta. <b>No hace falta asistir</b> al palo.</li>
    <li>Gana la baza el <b>triunfo más alto</b>; si no hay triunfos, la carta más alta del palo que salió primero.</li>
    <li>Orden de más a menos: <b>As, 3, Rey, Caballo, Sota, 7, 6, 5, 4, 2</b>.</li>
    <li>Quien gana la baza roba primero (luego los demás) y sale en la siguiente.</li>
    <li>Con el <b>7 de triunfo</b> puedes cambiar la carta vuelta si es una figura, el As o el 3; con el <b>2 de triunfo</b>, si es baja.</li>
    <li>Puntos: As 11, Tres 10, Rey 4, Caballo 3, Sota 2. Hay 120: <b>gana quien pase de 60</b>. Por parejas se suman.</li>
    <li>Con 3 jugadores se quita un 2.</li></ol>`,

  setup(n, opts = {}) {
    let deck = deckES();
    if (n === 3) { const i = deck.findIndex((c) => c.r === 2); deck.splice(i, 1); }
    const hands = Array.from({ length: n }, () => deck.splice(0, 3));
    const muestra = deck.pop();
    return { n, hands, deck, muestra, trump: muestra.s, table: [], turn: 0, leader: 0, won: Array.from({ length: n }, () => []), v: 0, teams: opts.teams || null, log: [`Pinta ${SUIT_NAME_ES[muestra.s]}`], lastTrick: null };
  },
  turnOf: (s) => (s.over || s.phase === 'collect' ? null : s.turn),
  isOver: (s) => !!s.over,
  viewFor(s, seat) {
    return { ...s, hands: s.hands.map((h, k) => (k === seat || s.over ? h : h.map(() => ({})))), deck: s.deck.map(() => ({})) };
  },

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat === 'sys') {
      if (a.type !== 'collect' || s.phase !== 'collect') fail('Temporizador caducado');
      const w = trickWinner(s.table, s.trump);
      const got = s.table.reduce((x, t) => x + pts(t.c), 0);
      s.won[w].push(...s.table.map((t) => t.c));
      s.lastTrick = { cards: s.table, winner: w };
      s.table = []; s.phase = null; s.timer = null;
      // robar: primero el ganador
      for (let k = 0; k < s.n; k++) {
        const p = (w + k) % s.n;
        if (s.deck.length) s.hands[p].push(s.deck.shift());
        else if (s.muestra) { s.hands[p].push(s.muestra); s.muestra = null; }
      }
      s.turn = s.leader = w;
      pushLog(s, `{${w}} gana la baza (${got} puntos)`);
      s.fx = { id: s.v, type: 'collect', seat: w, pts: got, cards: s.lastTrick.cards };
      if (s.hands.every((h) => !h.length)) {
        s.over = true;
        const p0 = teamPts(s, 0);
        let best = 0;
        for (let k = 1; k < s.n; k++) if (teamPts(s, k) > teamPts(s, best)) best = k;
        s.winner = best;
        s.tie = [...Array(s.n).keys()].some((k) => !sameTeam(s, k, best) && teamPts(s, k) === teamPts(s, best));
        s.final = [...Array(s.n).keys()].map((k) => teamPts(s, k));
        s.fx = { id: s.v, type: 'win', seat: w, pts: got, cards: s.lastTrick.cards, text: s.tie ? '¡Empate a puntos!' : `¡{${best}} gana con ${teamPts(s, best)} puntos!`, emoji: '🏆', bannerDelay: 900 };
        void p0;
      }
      return s;
    }
    if (seat !== s.turn || s.phase === 'collect') fail('No es tu turno');
    if (a.type === 'swap') {
      const i = canSwap(s, seat);
      if (i == null) fail('Ahora no puedes cambiar la carta del triunfo');
      const mine = s.hands[seat][i];
      s.hands[seat][i] = s.muestra; s.muestra = mine;
      pushLog(s, `{${seat}} cambia el ${mine.r} por la carta del triunfo`);
      s.fx = { id: s.v, type: 'swap', seat, text: `¡{${seat}} cambia el ${mine.r} de triunfo!`, emoji: '🔄' };
      return s;
    }
    if (a.type !== 'play') fail('Acción desconocida');
    const c = s.hands[seat][a.i];
    if (!c) fail('Esa carta no existe');
    s.hands[seat].splice(a.i, 1);
    s.table.push({ seat, c });
    const fx = { id: s.v, type: 'play', seat, c };
    if (s.table.length === s.n) {
      s.phase = 'collect';
      s.timer = { id: `c${s.v}`, ms: 1700, action: { type: 'collect' } };
      const w = trickWinner(s.table, s.trump);
      const got = s.table.reduce((x, t) => x + pts(t.c), 0);
      fx.winner = w;
      if (got >= 20) { fx.text = `¡Bazón de ${got} puntos para {${w}}!`; fx.emoji = '💰'; fx.bannerDelay = 600; }
      else if (s.table.some((t) => t.c.s === s.trump && t.c.r === 1) && trickWinner(s.table, s.trump) === s.table.find((t) => t.c.s === s.trump && t.c.r === 1).seat && s.table.length > 1 && got >= 11) { fx.text = '¡El As de triunfo manda!'; fx.emoji = '🗡️'; fx.bannerDelay = 600; }
    } else s.turn = (seat + 1) % s.n;
    s.fx = fx;
    return s;
  },

  bot(s, seat) {
    if (canSwap(s, seat) != null) return { type: 'swap' };
    const hand = s.hands[seat];
    const T = s.trump;
    const cheap = (cs) => cs.slice().sort((a, b) => pts(a) - pts(b) || (a.s === T) - (b.s === T) || power(a) - power(b))[0];
    const idx = (c) => hand.indexOf(c);
    if (!s.table.length) return { type: 'play', i: idx(cheap(hand)) };
    const cur = trickWinner(s.table, T);
    const onTable = s.table.reduce((x, t) => x + pts(t.c), 0);
    const last = s.table.length === s.n - 1;
    if (sameTeam(s, cur, seat) && s.teams) {
      // gana el compañero: echarle puntos si es el último o si su carta es fuerte
      const nonT = hand.filter((c) => c.s !== T).sort((a, b) => pts(b) - pts(a));
      if (nonT.length && (last || pts(nonT[0]) <= 4)) return { type: 'play', i: idx(nonT[0]) };
      return { type: 'play', i: idx(cheap(hand)) };
    }
    const winners = hand.filter((c) => trickWinner([...s.table, { seat, c }], T) === seat);
    if (winners.length) {
      const sameSuit = winners.filter((c) => c.s !== T);
      if (sameSuit.length) return { type: 'play', i: idx(sameSuit.sort((a, b) => pts(b) - pts(a))[0]) };
      const valuePlay = onTable + 0 >= 10 || (onTable >= 3 && s.deck.length < 8);
      if (valuePlay) return { type: 'play', i: idx(winners.sort((a, b) => power(a) - power(b))[0]) };
    }
    return { type: 'play', i: idx(cheap(hand)) };
  },
  botDelay: () => 1200,

  demo() {
    const s = this.setup(2);
    s.muestra = { s: 'o', r: 5 }; s.trump = 'o';
    s.hands = [[{ s: 'c', r: 1 }, { s: 'o', r: 2 }, { s: 'b', r: 4 }], [{ s: 'c', r: 3 }, { s: 'e', r: 12 }, { s: 'o', r: 7 }]];
    s.log = ['Pintan oros'];
    return { state: s, steps: [
      { say: 'La carta vuelta es el 5 de oros: los oros son triunfo y mandan.', wait: 2400 },
      { say: 'Ana tiene el 2 de triunfo y la vuelta es baja: puede cambiarla.', seat: 0, a: { type: 'swap' } },
      { say: 'Ana sale con el As de copas: 11 puntos.', seat: 0, a: { type: 'play', i: 0 } },
      { say: 'Leo lo mata con el 7 de oros: ¡el triunfo gana a todo! Se lleva 11 puntos.', seat: 1, a: { type: 'play', i: 2 }, wait: 3600 },
      { say: 'Al final se suman los puntos de las cartas ganadas. ¡Gana quien pase de 60!', wait: 2600 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat ?? 0;
    const myTurn = ctx.mySeat === s.turn && !s.over && s.phase !== 'collect';
    const rel = (k) => (k - me + s.n) % s.n; // 0 = yo (abajo)
    const posName = (k) => { const r = rel(k); if (s.n === 2) return r ? 'top' : 'bottom'; if (s.n === 3) return ['bottom', 'right', 'left'][r]; return ['bottom', 'right', 'top', 'left'][r]; };
    const opp = [...Array(s.n).keys()].filter((k) => k !== me).map((k) => `
      <div class="bropp pos-${posName(k)}">${s.hands[k].map((c) => (s.over ? cardES(c, { small: true }) : cardES(null, { small: true }))).join('')}</div>`).join('');
    const table = s.table.map((t) => `<div class="brslot pos-${posName(t.seat)}" data-tab="${t.seat}">${cardES(t.c, { cls: t.c.s === s.trump ? 'trumpglow' : '' })}</div>`).join('');
    const swapI = myTurn ? canSwap(s, me) : null;
    const hand = (s.hands[me] || []).map((c, i) => `<button class="brcard ${myTurn ? 'can' : ''}" data-i="${i}">${cardES(c, { cls: c.s === s.trump ? 'trumpglow' : '' })}</button>`).join('');
    let status;
    if (s.over) status = s.tie ? '🤝 ¡Empate a 60!' : `🏆 ¡Gana ${ctx.winnerName(s.winner)} con ${s.final[s.winner]} puntos!`;
    else if (s.phase === 'collect') status = 'Recogiendo la baza…';
    else if (myTurn) status = '👉 ¡Te toca! Echa una carta';
    else status = `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    el.innerHTML = `
      <div class="players">${chipsHTML(s, ctx, (i) => (s.over ? `${s.final[i]} pts` : `🂠 ${s.won[i].length}`), s.over || s.phase === 'collect' ? null : s.turn)}</div>
      <div class="status">${status}</div>
      <div class="brtable n${s.n}">
        ${opp}
        <div class="brcenter">${table}</div>
        <div class="brdeck">${s.deck.length ? `<div class="deckstack">${cardES(null, { small: true })}<b>${s.deck.length}</b></div>` : ''}${s.muestra ? `<div class="muestra">${cardES(s.muestra, { small: true })}</div>` : `<div class="muestra empty">Triunfo:<br>${SUIT_NAME_ES[s.trump]}</div>`}</div>
      </div>
      <div class="trumpnote">Triunfo: <b>${SUIT_NAME_ES[s.trump]}</b></div>
      ${swapI != null ? `<button class="btn c3" data-swap>🔄 Cambiar mi ${s.hands[me][swapI].r} por la carta del triunfo</button>` : ''}
      <div class="brhand">${hand}</div>
      ${logHTML(s, ctx, 2)}`;
    el.querySelectorAll('.brcard.can').forEach((b) => b.onclick = () => ctx.send({ type: 'play', i: +b.dataset.i }));
    const sw = el.querySelector('[data-swap]'); if (sw) sw.onclick = () => ctx.send({ type: 'swap' });
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    if (f.type === 'play') {
      ctx.sound('deal');
      const slot = el.querySelector(`[data-tab="${f.seat}"]`);
      if (!slot) return;
      const me = ctx.mySeat ?? 0;
      const src = f.seat === me ? el.querySelector('.brhand') : el.querySelector('.bropp:not(:empty)') ;
      const chip = el.querySelector(`[data-chip="${f.seat}"]`);
      const from = fx.center(f.seat === me ? src : (chip || src));
      const to = fx.center(slot);
      slot.animate([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) rotate(${f.seat % 2 ? 25 : -25}deg) scale(.6)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.3,1.2)' });
      if (f.c.s === ctx.state.trump) { await fx.wait(380); const p = fx.center(slot); fx.sparkle(p.x, p.y, '#ffd43b', 14); }
      if (f.winner != null) {
        await fx.wait(700);
        const win = el.querySelector(`[data-tab="${f.winner}"]`);
        if (win) { win.classList.add('trickwin'); const p = fx.center(win); fx.sparkle(p.x, p.y, PLAYER_COLORS[f.winner], 20, 1.3); ctx.sound('special'); }
      }
    }
    if (f.type === 'collect' || f.type === 'win') {
      const chip = el.querySelector(`[data-chip="${f.seat}"]`);
      const center = el.querySelector('.brcenter');
      if (chip && center) {
        const from = fx.center(center), to = fx.center(chip);
        f.cards.forEach((t, k) => setTimeout(() => fx.fly(cardES(t.c, { small: true }), { x: from.x + (k - 1) * 20, y: from.y }, to, { size: 46, arc: 80, duration: 600, spin: 0.5 }), k * 90));
        await fx.wait(650);
        if (f.pts) { fx.floatText(to.x, to.y - 10, `+${f.pts}`, '#ffe066', 30); ctx.sound('coin'); }
      }
      ctx.sound('deal');
      if (f.type === 'win') fx.fireworksShow(el.getBoundingClientRect(), 6);
    }
    if (f.type === 'swap') {
      const m = el.querySelector('.muestra');
      if (m) { const p = fx.center(m); fx.sparkle(p.x, p.y, '#ffd43b', 24, 1.4); m.animate([{ transform: 'rotateY(180deg)' }, { transform: 'none' }], { duration: 500 }); }
      ctx.sound('special');
    }
  },
};
