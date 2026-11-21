import { clone, fail, pushLog, esc, PLAYER_COLORS, shuffle } from '../util.js';
import { chipsHTML, logHTML } from './common.js';
import { cardFR, SUITS_FR } from './cards.js';

// Póker Texas Hold'em: dos cartas tuyas y cinco en la mesa. Se apuesta con fichas; gana quien se quede con todas
// (o quien más tenga al acabar las manos elegidas).
const HAND_NAMES = ['Carta alta', 'Pareja', 'Doble pareja', 'Trío', 'Escalera', 'Color', 'Full', 'Póker', 'Escalera de color'];
const newDeck = () => shuffle(SUITS_FR.flatMap((s) => Array.from({ length: 13 }, (_, k) => ({ s, r: k + 2 }))));

function eval5(cs) {
  const rs = cs.map((c) => c.r).sort((a, b) => b - a);
  const flush = cs.every((c) => c.s === cs[0].s);
  let uniq = [...new Set(rs)];
  let straightHi = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHi = uniq[0];
    else if (uniq.join() === '14,5,4,3,2') straightHi = 5;
  }
  const cnt = {};
  rs.forEach((r) => { cnt[r] = (cnt[r] || 0) + 1; });
  const groups = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const kick = groups.map((g) => g[1]);
  if (straightHi && flush) return [8, straightHi];
  if (groups[0][0] === 4) return [7, ...kick];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...kick];
  if (flush) return [5, ...rs];
  if (straightHi) return [4, straightHi];
  if (groups[0][0] === 3) return [3, ...kick];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...kick];
  if (groups[0][0] === 2) return [1, ...kick];
  return [0, ...rs];
}
const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
export function best7(cs) {
  let best = null;
  for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
    const five = cs.filter((_, i) => i !== a && i !== b);
    const v = eval5(five);
    if (!best || cmp(v, best) > 0) best = v;
  }
  return best;
}
const RN = { 14: 'ases', 13: 'reyes', 12: 'reinas', 11: 'jotas', 10: 'dieces', 9: 'nueves', 8: 'ochos', 7: 'sietes', 6: 'seises', 5: 'cincos', 4: 'cuatros', 3: 'treses', 2: 'doses' };
const handName = (v) => {
  const n = HAND_NAMES[v[0]];
  if (v[0] === 1 || v[0] === 3 || v[0] === 7) return `${n} de ${RN[v[1]]}`;
  if (v[0] === 2) return `${n} (${RN[v[1]]} y ${RN[v[2]]})`;
  if (v[0] === 6) return `${n} de ${RN[v[1]]} y ${RN[v[2]]}`;
  return n;
};

function activeSeats(s) { return s.seats.map((p, k) => k).filter((k) => !s.seats[k].out); }
function nextSeat(s, from, pred) {
  for (let i = 1; i <= s.n; i++) { const k = (from + i) % s.n; if (pred(k)) return k; }
  return -1;
}
const inHand = (s, k) => s.seats[k].inHand && !s.seats[k].folded;
const canAct = (s, k) => inHand(s, k) && s.seats[k].chips > 0;

function startHand(s) {
  const alive = activeSeats(s);
  s.hand++;
  if (s.hand > 1 && s.blindUp && (s.hand - 1) % s.blindUp === 0) { s.bb = Math.round(s.bb * 1.5 / 10) * 10; pushLog(s, `⬆️ Suben las ciegas: ${s.bb / 2}/${s.bb}`); }
  s.deck = newDeck();
  s.board = [];
  s.pot = 0;
  s.shown = null;
  s.result = null;
  s.seats.forEach((p) => { p.cards = []; p.bet = 0; p.total = 0; p.folded = false; p.inHand = !p.out; p.acted = false; p.lastAct = null; });
  s.dealer = nextSeat(s, s.dealer, (k) => !s.seats[k].out);
  for (let r = 0; r < 2; r++) alive.forEach((k) => s.seats[k].cards.push(s.deck.pop()));
  const heads = alive.length === 2;
  const sb = heads ? s.dealer : nextSeat(s, s.dealer, (k) => !s.seats[k].out);
  const bb = nextSeat(s, sb, (k) => !s.seats[k].out);
  post(s, sb, s.bb / 2); post(s, bb, s.bb);
  s.seats[sb].lastAct = 'ciega'; s.seats[bb].lastAct = 'ciega';
  s.toCall = s.bb; s.minRaise = s.bb;
  s.street = 0;
  s.turn = nextSeat(s, bb, (k) => canAct(s, k));
  s.phase = 'bet';
  s.timer = null;
  const actors = alive.filter((k) => canAct(s, k));
  if (!actors.length || (actors.length === 1 && s.seats[actors[0]].bet >= s.toCall)) runOut(s);
}
function post(s, k, amt) {
  const p = s.seats[k];
  const a = Math.min(amt, p.chips);
  p.chips -= a; p.bet += a; p.total += a; s.pot += a;
  return a;
}
function bettingDone(s) {
  const live = s.seats.map((p, k) => k).filter((k) => inHand(s, k));
  if (live.length <= 1) return true;
  const actors = live.filter((k) => s.seats[k].chips > 0);
  return actors.every((k) => s.seats[k].acted && s.seats[k].bet === s.toCall) || (actors.length === 0) || (actors.length === 1 && s.seats[actors[0]].bet >= s.toCall);
}
function nextStreet(s) {
  s.seats.forEach((p) => { p.bet = 0; p.acted = false; if (p.lastAct !== 'all-in' && !p.folded) p.lastAct = null; });
  s.toCall = 0; s.minRaise = s.bb;
  s.street++;
  if (s.street === 1) s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop());
  else if (s.street <= 3) s.board.push(s.deck.pop());
  else return showdown(s);
  const actors = s.seats.map((p, k) => k).filter((k) => canAct(s, k));
  if (actors.length < 2) { s.turn = -1; return 'runout'; }
  s.turn = nextSeat(s, s.dealer, (k) => canAct(s, k));
  return 'street';
}
function runOut(s) {
  while (s.board.length < 5) s.board.push(s.deck.pop());
  s.street = 4;
  return showdown(s);
}
function showdown(s) {
  const live = s.seats.map((p, k) => k).filter((k) => inHand(s, k));
  const winners = {};
  let summary = [];
  if (live.length === 1) {
    winners[live[0]] = s.pot;
    summary = [{ seat: live[0], amt: s.pot, name: null }];
  } else {
    const vals = {};
    live.forEach((k) => { vals[k] = best7([...s.seats[k].cards, ...s.board]); });
    const levels = [...new Set(s.seats.map((p) => p.total).filter((t) => t > 0))].sort((a, b) => a - b);
    let prev = 0;
    for (const lv of levels) {
      const part = s.seats.reduce((a, p) => a + Math.max(0, Math.min(p.total, lv) - prev), 0);
      const elig = live.filter((k) => s.seats[k].total >= lv);
      prev = lv;
      if (!part || !elig.length) continue;
      let best = [elig[0]];
      elig.slice(1).forEach((k) => { const c = cmp(vals[k], vals[best[0]]); if (c > 0) best = [k]; else if (c === 0) best.push(k); });
      const share = Math.floor(part / best.length);
      best.forEach((k, i) => { winners[k] = (winners[k] || 0) + share + (i === 0 ? part - share * best.length : 0); });
    }
    s.shown = live;
    summary = Object.entries(winners).map(([k, amt]) => ({ seat: +k, amt, name: handName(vals[k]) }));
    s.handNames = Object.fromEntries(live.map((k) => [k, handName(vals[k])]));
  }
  Object.entries(winners).forEach(([k, amt]) => { s.seats[k].chips += amt; });
  s.result = summary;
  s.phase = 'show';
  s.turn = -1;
  s.pot = 0;
  summary.forEach((w) => pushLog(s, `{${w.seat}} gana ${w.amt} fichas${w.name ? ` con ${w.name}` : ''}`));
  // eliminados y fin
  s.seats.forEach((p, k) => { if (!p.out && p.chips <= 0) { p.out = true; pushLog(s, `💀 {${k}} se queda sin fichas`); } });
  const alive = activeSeats(s);
  if (alive.length <= 1 || (s.maxHands && s.hand >= s.maxHands)) {
    let w = alive[0] ?? 0;
    s.seats.forEach((p, k) => { if (p.chips > s.seats[w].chips) w = k; });
    s.over = true; s.winner = w; s.timer = null;
    return 'over';
  }
  s.timer = { id: `h${s.v}`, ms: live.length > 1 ? 5200 : 2600, action: { type: 'nexthand' } };
  return 'show';
}

// --- Máquina: fuerza de mano por simulación ---
function equity(cards, board, opp, sims = 160) {
  let wins = 0;
  const used = new Set([...cards, ...board].map((c) => c.s + c.r));
  const rest = SUITS_FR.flatMap((s) => Array.from({ length: 13 }, (_, k) => ({ s, r: k + 2 }))).filter((c) => !used.has(c.s + c.r));
  for (let t = 0; t < sims; t++) {
    const d = shuffle(rest.slice());
    const b = [...board, ...d.splice(0, 5 - board.length)];
    const mine = best7([...cards, ...b]);
    let win = 1;
    for (let o = 0; o < opp; o++) {
      const ov = best7([d.pop(), d.pop(), ...b]);
      const c = cmp(ov, mine);
      if (c > 0) { win = 0; break; }
      if (c === 0) win = Math.min(win, 0.5);
    }
    wins += win;
  }
  return wins / sims;
}

export default {
  id: 'poker',
  name: 'Póker',
  icon: '♠️',
  color: '#087f5b',
  cat: 'cartas',
  minPlayers: 2,
  maxPlayers: 6,
  teams: null,
  hidden: true,
  moveSound: 'coin',
  blurb: "Texas Hold'em con fichas: dos cartas tuyas, cinco en la mesa, apuestas y faroles. ¿Quién se lleva todas las fichas?",
  options: [
    { id: 'chips', label: '🪙 Fichas iniciales', type: 'choice', def: 1000, choices: [{ v: 500, label: '500' }, { v: 1000, label: '1000' }, { v: 2000, label: '2000' }] },
    { id: 'hands', label: '🃏 Duración', type: 'choice', def: 20, choices: [{ v: 10, label: '10 manos' }, { v: 20, label: '20 manos' }, { v: 0, label: 'Hasta que gane uno' }] },
  ],
  rules: `<ol>
    <li>Cada uno recibe <b>2 cartas</b> que solo ve él. En la mesa saldrán <b>5 cartas</b> para todos: primero 3 (flop), luego 1 (turn) y otra (river).</li>
    <li>Antes de cada reparto se apuesta. En tu turno puedes: <b>retirarte</b>, <b>pasar</b> (si nadie ha subido), <b>igualar</b> lo apostado o <b>subir</b>. "Todo" es apostar todas tus fichas.</li>
    <li>Dos jugadores ponen las <b>ciegas</b> (apuesta obligatoria pequeña y grande) en cada mano; van rotando.</li>
    <li>Al final, entre los que siguen, gana quien forme la <b>mejor jugada de 5 cartas</b> con las suyas y las de la mesa.</li>
    <li>De mejor a peor: <b>Escalera de color, Póker, Full, Color, Escalera, Trío, Doble pareja, Pareja, Carta alta</b>.</li>
    <li>Si todos se retiran, el que queda se lleva el bote sin enseñar. ¡Se puede ir de farol!</li>
    <li>Gana quien se quede todas las fichas, o el que más tenga al acabar las manos elegidas.</li></ol>`,

  setup(n, opts = {}) {
    const o = opts.options || {};
    const chips = o.chips || 1000;
    const s = { n, seats: Array.from({ length: n }, () => ({ chips, cards: [], bet: 0, total: 0, folded: false, out: false })), bb: Math.max(10, Math.round(chips / 50 / 10) * 10), blindUp: 5, maxHands: o.hands ?? 20, hand: 0, dealer: n - 1, v: 0, log: ['¡Barajando!'], pot: 0, board: [] };
    startHand(s);
    return s;
  },
  turnOf: (s) => (s.over || s.phase !== 'bet' || s.turn < 0 ? null : s.turn),
  isOver: (s) => !!s.over,
  viewFor(s, seat) {
    return { ...s, deck: [], seats: s.seats.map((p, k) => ({ ...p, cards: k === seat || (s.shown && s.shown.includes(k) && s.phase === 'show') || s.over && s.shown && s.shown.includes(k) ? p.cards : p.cards.map(() => ({})) })) };
  },

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat === 'sys') {
      if (a.type === 'nexthand' && s.phase === 'show') { startHand(s); s.fx = { id: s.v, type: 'deal', hand: s.hand }; return s; }
      if (a.type === 'street' && s.phase === 'wait') {
        const r = nextStreet(s);
        if (r === 'runout') { s.phase = 'wait'; s.timer = { id: `s${s.v}`, ms: 1500, action: { type: 'street' } }; }
        else if (r === 'street') { s.phase = 'bet'; s.timer = null; }
        s.fx = { id: s.v, type: s.phase === 'show' || s.over ? 'show' : 'board', n: s.board.length, result: s.result };
        if (s.over) { s.fx.text = '¡{' + s.winner + '} gana la partida!'; s.fx.emoji = '🏆'; s.fx.bannerDelay = 1400; s.fx.type = 'show'; }
        else if (s.phase === 'show' && s.result && s.result[0].name) { s.fx.text = `{${s.result[0].seat}} gana con ${s.result[0].name}`; s.fx.emoji = '💰'; s.fx.bannerDelay = 900; }
        return s;
      }
      fail('Temporizador caducado');
    }
    if (s.phase !== 'bet' || seat !== s.turn) fail('No es tu turno');
    const p = s.seats[seat];
    const need = s.toCall - p.bet;
    let fx = { id: s.v, type: 'bet', seat };
    if (a.type === 'fold') {
      p.folded = true; p.lastAct = 'fuera';
      pushLog(s, `{${seat}} se retira`);
      fx.type = 'fold';
    } else if (a.type === 'check') {
      if (need > 0) fail(`Tienes que igualar ${need} o retirarte`);
      p.lastAct = 'paso';
      pushLog(s, `{${seat}} pasa`);
      fx.type = 'check';
    } else if (a.type === 'call') {
      if (need <= 0) fail('No hay nada que igualar');
      const put = post(s, seat, need);
      p.lastAct = p.chips === 0 ? 'all-in' : 'igualo';
      fx.amt = put;
      pushLog(s, `{${seat}} iguala ${put}`);
    } else if (a.type === 'raise' || a.type === 'allin') {
      let to = a.type === 'allin' ? p.bet + p.chips : Math.floor(a.to);
      const maxTo = p.bet + p.chips;
      if (to > maxTo) to = maxTo;
      const isAll = to === maxTo;
      if (to <= s.toCall && !isAll) fail('Sube más que la apuesta actual');
      if (to - s.toCall < s.minRaise && !isAll) fail(`La subida mínima es hasta ${s.toCall + s.minRaise}`);
      const put = post(s, seat, to - p.bet);
      if (p.bet > s.toCall) {
        if (p.bet - s.toCall >= s.minRaise) s.minRaise = p.bet - s.toCall;
        s.toCall = p.bet;
        s.seats.forEach((q, k) => { if (k !== seat) q.acted = false; });
      }
      p.lastAct = p.chips === 0 ? 'all-in' : 'subo';
      fx.amt = put;
      pushLog(s, `{${seat}} ${p.chips === 0 ? '¡va con todo!' : `sube a ${p.bet}`}`);
      if (p.chips === 0) { fx.text = '¡{' + seat + '} va con TODO!'; fx.emoji = '🔥'; fx.bannerDelay = 200; }
    } else fail('Acción desconocida');
    p.acted = true;
    const live = s.seats.map((q, k) => k).filter((k) => inHand(s, k));
    if (live.length === 1) {
      showdown(s);
      fx = { ...fx, type: 'show', result: s.result };
      if (s.over) { fx.text = '¡{' + s.winner + '} gana la partida!'; fx.emoji = '🏆'; fx.bannerDelay = 900; }
    } else if (bettingDone(s)) {
      const actors = live.filter((k) => s.seats[k].chips > 0);
      s.phase = 'wait';
      s.turn = -1;
      s.timer = { id: `s${s.v}`, ms: 1100, action: { type: 'street' } };
    } else s.turn = nextSeat(s, seat, (k) => canAct(s, k) && (!s.seats[k].acted || s.seats[k].bet < s.toCall));
    s.fx = fx;
    return s;
  },

  bot(s, seat) {
    const p = s.seats[seat];
    const need = s.toCall - p.bet;
    const opp = s.seats.filter((q, k) => k !== seat && inHand(s, k)).length;
    const eq = equity(p.cards, s.board, Math.max(1, opp), s.board.length ? 140 : 90);
    const potOdds = need > 0 ? need / (s.pot + need) : 0;
    const bluff = Math.random() < 0.07;
    const strong = eq > 0.72 / Math.sqrt(Math.max(1, opp) * 0.7);
    if ((strong || bluff) && p.chips > need) {
      const target = s.toCall + Math.max(s.minRaise, Math.round((s.pot * (0.5 + Math.random() * 0.6)) / 10) * 10);
      if (eq > 0.88 && Math.random() < 0.3) return { type: 'allin' };
      return { type: 'raise', to: Math.min(target, p.bet + p.chips) };
    }
    if (need <= 0) return { type: 'check' };
    if (eq >= potOdds + 0.05 || (need <= s.bb && eq > 0.25)) return { type: 'call' };
    return { type: 'fold' };
  },
  botDelay: () => 1300 + Math.random() * 900,

  demo() {
    const s = this.setup(2, { options: { chips: 1000, hands: 1 } });
    // mano preparada
    s.seats[0].cards = [{ s: '♥', r: 14 }, { s: '♠', r: 14 }];
    s.seats[1].cards = [{ s: '♣', r: 13 }, { s: '♦', r: 12 }];
    s.deck = [{ s: '♦', r: 7 }, { s: '♠', r: 13 }, { s: '♥', r: 9 }, { s: '♣', r: 3 }, { s: '♦', r: 14 }];
    return { state: s, steps: [
      { say: 'Cada uno tiene dos cartas secretas. Ana tiene… ¡pareja de ases! Ya están puestas las ciegas.', wait: 2600 },
      { say: 'Ana iguala la ciega grande.', seat: 0, a: { type: 'call' } },
      { say: 'Leo pasa. Salen 3 cartas a la mesa: el "flop".', seat: 1, a: { type: 'check' }, wait: 2800 },
      { say: 'Leo pasa otra vez…', seat: 1, a: { type: 'check' } },
      { say: '¡Ana tiene trío de ases y va con todo!', seat: 0, a: { type: 'allin' }, wait: 2000 },
      { say: 'Leo tiene pareja de reyes y paga… Se reparten las cartas que faltan.', seat: 1, a: { type: 'call' }, wait: 6500 },
      { say: 'Gana la mejor jugada. ¡Y recuerda que puedes ir de farol!', wait: 2600 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat ?? 0;
    const myTurn = ctx.mySeat === s.turn && s.phase === 'bet' && !s.over;
    const ui = ctx.ui.poker || (ctx.ui.poker = {});
    const p = s.seats[me];
    const need = Math.max(0, s.toCall - p.bet);
    const minTo = Math.min(p.bet + p.chips, s.toCall + s.minRaise);
    const maxTo = p.bet + p.chips;
    if (ui.v !== s.v) { ui.v = s.v; ui.to = minTo; }
    ui.to = Math.max(minTo, Math.min(maxTo, ui.to || minTo));
    const rel = (k) => (k - me + s.n) % s.n;
    const seatsHTML = s.seats.map((q, k) => {
      if (k === me) return '';
      const r = rel(k);
      const pos = s.n === 2 ? 'top' : `s${s.n}-${r}`;
      const winner = s.result && s.result.some((w) => w.seat === k);
      return `<div class="pkseat pos-${pos} ${q.folded ? 'folded' : ''} ${q.out ? 'out' : ''} ${winner && s.phase === 'show' ? 'winner' : ''} ${k === s.turn && s.phase === 'bet' ? 'turn' : ''}" data-seat="${k}" style="--pc:${PLAYER_COLORS[k]}">
        <div class="pkcards">${q.cards.map((c) => cardFR(c && c.s ? c : null, { small: true, back: !(c && c.s) })).join('')}</div>
        <div class="pkname"><span>${ctx.avatar(k)}</span>${esc(ctx.players[k])}${k === s.dealer ? '<i class="dealer">D</i>' : ''}</div>
        <div class="pkchips">🪙 ${q.chips}</div>
        ${q.bet ? `<div class="pkbet" data-bet="${k}">${q.bet}</div>` : ''}
        ${q.lastAct ? `<div class="pkact">${q.lastAct}</div>` : ''}
        ${s.handNames && s.handNames[k] && s.phase === 'show' ? `<div class="pkhand">${s.handNames[k]}</div>` : ''}
      </div>`;
    }).join('');
    const board = Array.from({ length: 5 }, (_, i) => `<div class="pkb" data-b="${i}">${s.board[i] ? cardFR(s.board[i]) : '<div class="naipe fr slot"></div>'}</div>`).join('');
    const myWinner = s.result && s.result.some((w) => w.seat === me) && s.phase === 'show';
    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)} con ${s.seats[s.winner].chips} fichas!`;
    else if (s.phase === 'show') status = s.result ? s.result.map((w) => `<b>${esc(ctx.players[w.seat])}</b> gana ${w.amt}${w.name ? ` · ${w.name}` : ''}`).join('<br>') : '';
    else if (p.out) status = '💀 Te has quedado sin fichas. Mira cómo acaba…';
    else if (myTurn) status = need ? `👉 Te toca: ${need} para igualar` : '👉 Te toca';
    else if (s.phase === 'bet') status = `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    else status = 'Repartiendo…';
    const quick = myTurn && maxTo > s.toCall ? [
      ['Mín.', minTo], ['½ bote', s.toCall + Math.round(s.pot / 2 / 10) * 10], ['Bote', s.toCall + s.pot],
    ].filter(([, v]) => v >= minTo && v < maxTo) : [];
    el.innerHTML = `
      <div class="status">${status}</div>
      <div class="pktable n${s.n}">
        <div class="pkfelt">
          <div class="pkboard">${board}</div>
          <div class="pkpot">${s.pot ? `🪙 Bote: <b>${s.pot}</b>` : ''}</div>
          <div class="pkinfo">Mano ${s.hand}${s.maxHands ? `/${s.maxHands}` : ''} · Ciegas ${s.bb / 2}/${s.bb}</div>
        </div>
        ${seatsHTML}
      </div>
      <div class="pkme ${myTurn ? 'turn' : ''} ${p.folded ? 'folded' : ''} ${myWinner ? 'winner' : ''}" data-seat="${me}" style="--pc:${PLAYER_COLORS[me]}">
        <div class="pkmycards">${p.cards.map((c) => cardFR(c && c.s ? c : null, { back: !(c && c.s) })).join('')}</div>
        <div class="pkmyinfo"><b>${ctx.avatar(me)} ${esc(ctx.players[me])}</b>${me === s.dealer ? '<i class="dealer">D</i>' : ''}<div>🪙 ${p.chips}</div>${p.bet ? `<div class="pkbet mine" data-bet="${me}">${p.bet}</div>` : ''}
        ${s.board.length >= 3 && p.cards[0] && p.cards[0].s && !p.folded ? `<small class="pkmine">${handName(best7([...p.cards, ...s.board]))}</small>` : ''}</div>
      </div>
      ${myTurn ? `
        <div class="pkactions">
          <button class="btn c1" data-a2="fold">🙅 Me retiro</button>
          ${need ? `<button class="btn c2" data-a2="call">✅ Igualo ${Math.min(need, p.chips)}</button>` : '<button class="btn c2" data-a2="check">👌 Paso</button>'}
        </div>
        ${maxTo > s.toCall ? `<div class="pkraise">
          <div class="row">${quick.map(([l, v]) => `<button class="chip" data-to="${v}">${l}</button>`).join('')}<button class="chip allin" data-a2="allin">🔥 Todo (${maxTo})</button></div>
          ${maxTo > minTo ? `<div class="row"><input type="range" min="${minTo}" max="${maxTo}" step="10" value="${ui.to}" data-range><button class="btn c3" data-a2="raise">⬆️ Subo a ${ui.to}</button></div>` : ''}
        </div>` : ''}` : ''}
      ${logHTML(s, ctx, 2)}`;
    el.querySelectorAll('[data-a2]').forEach((b) => b.onclick = () => {
      const t = b.dataset.a2;
      if (t === 'raise') ctx.send({ type: 'raise', to: ui.to });
      else ctx.send({ type: t });
    });
    el.querySelectorAll('[data-to]').forEach((b) => b.onclick = () => ctx.send({ type: 'raise', to: +b.dataset.to }));
    const rg = el.querySelector('[data-range]');
    if (rg) rg.oninput = () => { ui.to = +rg.value; el.querySelector('[data-a2="raise"]').textContent = `⬆️ Subo a ${ui.to}`; };
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    const seatEl = (k) => el.querySelector(`[data-seat="${k}"]`);
    const pot = el.querySelector('.pkpot') || el.querySelector('.pkfelt');
    if ((f.type === 'bet' || f.type === 'show') && f.amt && seatEl(f.seat) && pot) {
      const from = fx.center(seatEl(f.seat)), to = fx.center(pot);
      const n = Math.min(6, 1 + Math.floor(f.amt / 50));
      for (let i = 0; i < n; i++) setTimeout(() => fx.fly('<div class="chipcoin"></div>', from, to, { size: 26, arc: 50, duration: 450 }), i * 70);
      ctx.sound('coin');
    }
    if (f.type === 'check') { ctx.sound('knock'); const se = seatEl(f.seat); if (se) se.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(4px)' }, { transform: 'none' }], { duration: 200, iterations: 2 }); }
    if (f.type === 'fold') { ctx.sound('flip'); const se = seatEl(f.seat); if (se) se.querySelectorAll('.naipe').forEach((c) => c.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-30px) rotate(40deg)', opacity: 0.3 }], { duration: 400 })); }
    if (f.type === 'board') {
      const from = f.n === 3 ? 0 : f.n - 1;
      for (let i = from; i < f.n; i++) {
        const c = el.querySelector(`[data-b="${i}"] .naipe`);
        if (c) { c.animate([{ transform: 'rotateY(90deg) translateY(-20px)' }, { transform: 'none' }], { duration: 380, delay: (i - from) * 200, fill: 'backwards' }); setTimeout(() => ctx.sound('deal'), (i - from) * 200); }
      }
    }
    if (f.type === 'deal') {
      ctx.sound('deal');
      el.querySelectorAll('.pkcards .naipe, .pkmycards .naipe').forEach((c, i) => c.animate([{ transform: 'translateY(-80px) scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350, delay: i * 60, fill: 'backwards' }));
    }
    if (f.type === 'show' && f.result) {
      await fx.wait(f.result[0] && f.result[0].name ? 700 : 300);
      const center = fx.center(el.querySelector('.pkfelt'));
      f.result.forEach((w) => {
        const se = seatEl(w.seat);
        if (!se) return;
        const to = fx.center(se);
        for (let i = 0; i < 8; i++) setTimeout(() => fx.fly('<div class="chipcoin"></div>', { x: center.x + (Math.random() - 0.5) * 40, y: center.y }, to, { size: 26, arc: 90, duration: 600 }), i * 60);
        setTimeout(() => { fx.floatText(to.x, to.y - 20, `+${w.amt}`, '#ffe066', 30); fx.sparkle(to.x, to.y, '#ffe066', 20, 1.3); ctx.sound('cash'); }, 650);
      });
      if (ctx.state.over) setTimeout(() => fx.fireworksShow(el.getBoundingClientRect(), 7), 900);
    }
  },
};
