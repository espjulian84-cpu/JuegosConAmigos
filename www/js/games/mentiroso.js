import { clone, fail, pushLog, esc, PLAYER_COLORS } from '../util.js';
import { chipsHTML, logHTML, pick } from './common.js';
import { deckES, cardES, RANKS_ES } from './cards.js';

// Mentiroso: echa cartas boca abajo diciendo qué son… ¡o miente! Si te pillan, te llevas el montón.
const PLURAL = { 1: 'ases', 2: 'doses', 3: 'treses', 4: 'cuatros', 5: 'cincos', 6: 'seises', 7: 'sietes', 10: 'sotas', 11: 'caballos', 12: 'reyes' };
const SINGULAR = { 1: 'as', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis', 7: 'siete', 10: 'sota', 11: 'caballo', 12: 'rey' };
const say = (n, r) => `${n} ${n === 1 ? SINGULAR[r] : PLURAL[r]}`;
const sortHand = (h) => h.sort((a, b) => a.r - b.r || a.s.localeCompare(b.s));

// Si alguien junta los cuatro de un número, se descartan
function discardQuads(s, seat) {
  const out = [];
  for (const r of RANKS_ES) {
    if (s.hands[seat].filter((c) => c.r === r).length === 4) { s.hands[seat] = s.hands[seat].filter((c) => c.r !== r); out.push(r); }
  }
  out.forEach((r) => pushLog(s, `{${seat}} junta los cuatro ${PLURAL[r]} y los descarta`));
  return out;
}
export default {
  id: 'mentiroso',
  name: 'Mentiroso',
  icon: '🤥',
  color: '#7048e8',
  cat: 'cartas',
  minPlayers: 2,
  maxPlayers: 6,
  teams: null,
  hidden: true,
  moveSound: 'deal',
  blurb: 'Echa cartas boca abajo y di lo que son… o miente con toda tu cara. ¡Pilla a los mentirosos!',
  rules: `<ol>
    <li>Se reparten todas las cartas de la baraja española. Gana quien se quede <b>sin cartas</b>.</li>
    <li>El que empieza el montón dice un número (por ejemplo, <b>reyes</b>) y echa de 1 a 3 cartas boca abajo.</li>
    <li>Los siguientes tienen que echar de 1 a 3 cartas diciendo que son <b>ese mismo número</b>… sean verdad o no.</li>
    <li>En tu turno, en vez de echar, puedes gritar <b>"¡Mentiroso!"</b> al jugador anterior: se levantan sus cartas.
      <ul><li>Si mentía, <b>se lleva todo el montón</b>.</li><li>Si decía la verdad, te lo llevas <b>tú</b>.</li></ul>
      Quien gana la apuesta empieza un montón nuevo.</li>
    <li>Si juntas los <b>cuatro</b> de un número, se descartan solos.</li>
    <li>Si alguien echa sus últimas cartas, el siguiente decide: pillarle o dejarle ganar.</li></ol>`,

  setup(n) {
    const deck = deckES();
    const hands = Array.from({ length: n }, () => []);
    deck.forEach((c, i) => hands[i % n].push(c));
    hands.forEach(sortHand);
    const s = { n, hands, pile: [], claim: null, last: null, turn: 0, v: 0, log: ['¡A mentir!'], discards: [] };
    for (let k = 0; k < n; k++) s.discards.push(...discardQuads(s, k));
    return s;
  },
  turnOf: (s) => (s.over || s.phase === 'reveal' ? null : s.turn),
  isOver: (s) => !!s.over,
  viewFor(s, seat) {
    return {
      ...s,
      hands: s.hands.map((h, k) => (k === seat || s.over ? h : h.map(() => ({})))),
      pile: s.pile.map(() => ({})),
      last: s.last ? { ...s.last, cards: s.phase === 'reveal' ? s.last.cards : s.last.cards.map(() => ({})) } : null,
    };
  },

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat === 'sys') {
      if (a.type !== 'resolve' || s.phase !== 'reveal') fail('Temporizador caducado');
      const { loser, winner } = s.challenge;
      s.hands[loser].push(...s.pile);
      sortHand(s.hands[loser]);
      const quads = discardQuads(s, loser);
      const n = s.pile.length;
      s.pile = []; s.claim = null; s.last = null; s.phase = null; s.timer = null; s.challenge = null;
      s.turn = winner;
      pushLog(s, `{${loser}} se lleva el montón (${n} cartas)`);
      s.fx = { id: s.v, type: 'take', seat: loser, n, quads };
      const empty = s.hands.findIndex((h) => !h.length);
      if (empty >= 0) { const winner2 = empty; s.over = true; s.winner = winner2; s.fx = { ...s.fx, type: 'win', text: '¡{' + winner2 + '} se queda sin cartas!', emoji: '🏆', bannerDelay: 700 }; return s; }
      if (s.hands[winner].length === 0) { s.over = true; s.winner = winner; s.fx = { ...s.fx, type: 'win', text: '¡{' + winner + '} se queda sin cartas!', emoji: '🏆', bannerDelay: 700 }; }
      return s;
    }
    if (seat !== s.turn || s.phase === 'reveal') fail('No es tu turno');
    const prev = s.last ? s.last.seat : null;
    if (a.type === 'call') {
      if (prev == null) fail('No hay nada que levantar');
      const lie = s.last.cards.some((c) => c.r !== s.claim);
      s.phase = 'reveal';
      s.resolved = true;
      s.challenge = lie ? { loser: prev, winner: seat } : { loser: seat, winner: prev };
      s.timer = { id: `r${s.v}`, ms: 2800, action: { type: 'resolve' } };
      pushLog(s, `{${seat}} grita ¡Mentiroso! a {${prev}}… ${lie ? 'y mentía' : 'pero era verdad'}`);
      s.fx = lie
        ? { id: s.v, type: 'reveal', lie, seat, prev, text: `¡{${prev}} mentía!`, emoji: '🤥', bannerDelay: 900 }
        : { id: s.v, type: 'reveal', lie, seat, prev, text: `¡Era verdad! {${seat}} se lo lleva`, emoji: '😇', bannerDelay: 900 };
      return s;
    }
    if (a.type === 'accept') {
      if (prev == null || s.hands[prev].length) fail('Ahora no');
      s.over = true; s.winner = prev;
      s.fx = { id: s.v, type: 'win', text: '¡{' + prev + '} se queda sin cartas!', emoji: '🏆' };
      return s;
    }
    if (a.type !== 'play') fail('Acción desconocida');
    if (prev != null && !s.hands[prev].length) fail('El anterior se ha quedado sin cartas: ¡píllale o déjale ganar!');
    const idx = [...new Set(a.cards || [])].filter((i) => i >= 0 && i < s.hands[seat].length);
    if (idx.length < 1 || idx.length > 3) fail('Echa de 1 a 3 cartas');
    if (s.claim == null) {
      if (!RANKS_ES.includes(a.claim)) fail('Di qué número echas');
      s.claim = a.claim;
    }
    const cards = idx.map((i) => s.hands[seat][i]);
    s.hands[seat] = s.hands[seat].filter((_, i) => !idx.includes(i));
    s.pile.push(...cards);
    s.last = { seat, cards, n: cards.length };
    s.resolved = false;
    pushLog(s, `{${seat}} echa ${say(cards.length, s.claim)}`);
    s.turn = (seat + 1) % s.n;
    s.fx = { id: s.v, type: 'play', seat, n: cards.length, claim: s.claim, last: !s.hands[seat].length };
    if (!s.hands[seat].length) { s.fx.text = `¡{${seat}} echa sus últimas cartas!`; s.fx.emoji = '😱'; s.fx.bannerDelay = 400; }
    return s;
  },

  bot(s, seat) {
    const hand = s.hands[seat];
    const prev = s.last ? s.last.seat : null;
    if (prev != null) {
      const mine = hand.filter((c) => c.r === s.claim).length;
      const known = mine + s.last.n;
      const prevEmpty = !s.hands[prev].length;
      let p = known > 4 ? 1 : 0.08 + 0.18 * (known - 1) + Math.min(0.2, s.pile.length * 0.015);
      if (prevEmpty) p = known > 4 ? 1 : 0.75;
      if (Math.random() < p) return { type: 'call' };
      if (prevEmpty) return { type: 'accept' };
    }
    const pickIdx = (r, max) => hand.map((c, i) => (c.r === r ? i : -1)).filter((i) => i >= 0).slice(0, max);
    if (s.claim == null) {
      const counts = {};
      hand.forEach((c) => { counts[c.r] = (counts[c.r] || 0) + 1; });
      const r = +Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0];
      const cards = pickIdx(r, 3);
      if (cards.length < 3 && hand.length > 4 && Math.random() < 0.35) {
        const other = hand.findIndex((c, i) => c.r !== r && !cards.includes(i));
        if (other >= 0) cards.push(other);
      }
      return { type: 'play', cards, claim: r };
    }
    const truth = pickIdx(s.claim, 3);
    if (truth.length) return { type: 'play', cards: truth };
    // no tiene: miente con 1 o 2 cartas sueltas
    const lone = hand.map((c, i) => i).sort(() => Math.random() - 0.5).slice(0, hand.length > 6 && Math.random() < 0.4 ? 2 : 1);
    return { type: 'play', cards: lone };
  },
  botDelay: (s) => 1300 + Math.random() * 700,

  demo() {
    const s = this.setup(3);
    s.hands = [
      [{ s: 'o', r: 12 }, { s: 'c', r: 12 }, { s: 'e', r: 3 }, { s: 'b', r: 5 }],
      [{ s: 'o', r: 2 }, { s: 'c', r: 4 }, { s: 'b', r: 7 }],
      [{ s: 'e', r: 12 }, { s: 'b', r: 1 }, { s: 'o', r: 6 }],
    ];
    s.discards = [];
    return { state: s, steps: [
      { say: 'Ana empieza el montón: echa dos cartas y dice "dos reyes". ¡Y es verdad!', seat: 0, a: { type: 'play', cards: [0, 1], claim: 12 } },
      { say: 'Leo no tiene reyes… así que echa un 7 y dice "un rey". ¡Mentira!', seat: 1, a: { type: 'play', cards: [2] } },
      { say: 'Sara tiene un rey y sabe que Ana ha echado dos… Desconfía y grita: ¡MENTIROSO!', seat: 2, a: { type: 'call' }, wait: 4200 },
      { say: 'Leo mentía, así que se lleva todo el montón. ¡Gana quien se quede sin cartas!', wait: 2600 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat ?? 0;
    const myTurn = ctx.mySeat === s.turn && !s.over && s.phase !== 'reveal';
    const ui = ctx.ui.lie || (ctx.ui.lie = {});
    if (ui.v !== s.v) { ui.v = s.v; ui.sel = []; ui.claim = null; }
    const hand = s.hands[me] || [];
    const prev = s.last ? s.last.seat : null;
    const prevEmpty = prev != null && s.hands[prev] && !s.hands[prev].length;
    const pileCards = s.pile.slice(-12).map((_, i) => `<div class="lpile-c" style="--a:${(i * 37) % 30 - 15}deg;--x:${(i * 13) % 20 - 10}px">${cardES(null, { small: true })}</div>`).join('');
    const reveal = s.phase === 'reveal' && s.last ? `<div class="lreveal">${s.last.cards.map((c) => cardES(c, { cls: c.r === s.claim ? 'ok' : 'liecard' })).join('')}</div>` : '';
    const handHTML = hand.map((c, i) => `<button class="lcard ${ui.sel.includes(i) ? 'sel' : ''} ${myTurn && !prevEmpty ? 'can' : ''}" data-i="${i}">${cardES(c)}</button>`).join('');
    const claimPick = myTurn && s.claim == null ? `<div class="optlabel light">¿Qué dices que echas?</div><div class="chips claimchips">${RANKS_ES.map((r) => `<button class="chip ${ui.claim === r ? 'on' : ''}" data-claim="${r}">${PLURAL[r]}</button>`).join('')}</div>` : '';
    const claimNow = s.claim ?? ui.claim;
    const canPlay = myTurn && !prevEmpty && ui.sel.length >= 1 && ui.sel.length <= 3 && claimNow != null;
    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (s.phase === 'reveal') status = '👀 Levantando las cartas…';
    else if (myTurn) status = prevEmpty ? '😱 ¡Se ha quedado sin cartas! ¿Le pillas?' : s.claim == null ? '👉 Empiezas montón: elige cartas y di qué son' : `👉 Echa 1-3 cartas como <b>${PLURAL[s.claim]}</b>… o pilla al anterior`;
    else status = `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    el.innerHTML = `
      <div class="players">${chipsHTML(s, ctx, (i) => `🂠 ${s.hands[i].length}`, s.over || s.phase === 'reveal' ? null : s.turn)}</div>
      <div class="status">${status}</div>
      <div class="ltable">
        <div class="lpile">${pileCards}${s.pile.length ? `<b class="lcount">${s.pile.length}</b>` : '<span class="lempty">Montón vacío</span>'}</div>
        ${s.claim != null ? `<div class="lclaim">Se juegan <b>${PLURAL[s.claim]}</b>${s.last ? `<br><small>${esc(ctx.players[s.last.seat])} dice: ${say(s.last.n, s.claim)}</small>` : ''}</div>` : ''}
        ${reveal}
      </div>
      ${myTurn && prev != null ? `<div class="row"><button class="btn big c1 liebtn" data-call>🤥 ¡MENTIROSO!</button>${prevEmpty ? '<button class="btn big" data-accept>🏳️ Dejarle ganar</button>' : ''}</div>` : ''}
      ${claimPick}
      ${myTurn && !prevEmpty ? `<button class="btn big ${canPlay ? 'c2 pulse' : 'disabled'}" data-play>${canPlay ? `🃏 Echar: "${say(ui.sel.length, claimNow)}"` : ui.sel.length ? (ui.sel.length > 3 ? 'Máximo 3 cartas' : 'Elige qué dices que son') : 'Toca de 1 a 3 cartas'}</button>` : ''}
      <div class="lhand">${handHTML}</div>
      ${s.discards && s.discards.length ? `<p class="hint light center">Descartados: ${s.discards.map((r) => PLURAL[r]).join(', ')}</p>` : ''}
      ${logHTML(s, ctx, 2)}`;
    el.querySelectorAll('.lcard.can').forEach((b) => b.onclick = () => {
      const i = +b.dataset.i;
      ui.sel = ui.sel.includes(i) ? ui.sel.filter((x) => x !== i) : [...ui.sel, i];
      if (ui.sel.length > 3) { ui.sel.shift(); }
      ctx.sound('flip'); ctx.rerender();
    });
    el.querySelectorAll('[data-claim]').forEach((b) => b.onclick = () => { ui.claim = +b.dataset.claim; ctx.rerender(); });
    const pl = el.querySelector('[data-play]'); if (pl && canPlay) pl.onclick = () => ctx.send({ type: 'play', cards: ui.sel, claim: claimNow });
    const cl = el.querySelector('[data-call]'); if (cl) cl.onclick = () => ctx.send({ type: 'call' });
    const ac = el.querySelector('[data-accept]'); if (ac) ac.onclick = () => ctx.send({ type: 'accept' });
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    const pile = el.querySelector('.lpile');
    const chip = (k) => el.querySelector(`[data-chip="${k}"]`);
    if (f.type === 'play' && pile) {
      const from = fx.center(chip(f.seat) || pile), to = fx.center(pile);
      for (let k = 0; k < f.n; k++) setTimeout(() => { fx.fly(cardES(null, { small: true }), from, { x: to.x + (k - 1) * 8, y: to.y }, { size: 44, arc: 70, duration: 450, spin: 0.4 }); ctx.sound('deal'); }, k * 140);
      const c = el.querySelector('.lclaim');
      if (c) setTimeout(() => c.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 400 }), 300);
    }
    if (f.type === 'reveal') {
      ctx.sound('flip');
      const cards = el.querySelectorAll('.lreveal .naipe');
      cards.forEach((c, k) => c.animate([{ transform: 'rotateY(90deg) scale(.6)' }, { transform: 'none' }], { duration: 450, delay: k * 220, fill: 'backwards' }));
      await fx.wait(450 + cards.length * 220);
      const ch = chip(f.lie ? f.prev : f.seat);
      if (f.lie) {
        ctx.sound('buzz');
        el.querySelectorAll('.lreveal .liecard').forEach((c) => { fx.shake(c); const p = fx.center(c); fx.burst(p.x, p.y, { color: '#ff3b3b', n: 14 }); });
        if (ch) { const p = fx.center(ch); fx.emojiRain(p.x, p.y, '🤥', 6); fx.shake(ch); }
        fx.screenShake(6);
      } else {
        ctx.sound('ding');
        el.querySelectorAll('.lreveal .ok').forEach((c) => { const p = fx.center(c); fx.sparkle(p.x, p.y, '#69db7c', 14); });
        if (ch) { const p = fx.center(ch); fx.emojiRain(p.x, p.y, '😇', 5); }
      }
    }
    if ((f.type === 'take' || f.type === 'win') && f.n && pile) {
      const ch = chip(f.seat);
      if (ch) {
        const from = fx.center(pile), to = fx.center(ch);
        for (let k = 0; k < Math.min(f.n, 8); k++) setTimeout(() => fx.fly(cardES(null, { small: true }), from, to, { size: 40, arc: 90, duration: 520, spin: 1 }), k * 70);
        setTimeout(() => { fx.floatText(to.x, to.y, `+${f.n} 🂠`, '#ffa8a8', 28); ctx.sound('bad'); }, 600);
      }
      if (f.quads && f.quads.length) setTimeout(() => { fx.banner(`¡Cuatro ${PLURAL[f.quads[0]]} fuera!`, '🗑️', 'special'); ctx.sound('special'); }, 1200);
    }
    if (f.type === 'win') fx.fireworksShow(el.getBoundingClientRect(), 6);
    void PLAYER_COLORS; void pick;
  },
};
