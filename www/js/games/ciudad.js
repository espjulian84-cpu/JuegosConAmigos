import { clone, fail, pushLog, esc, shuffle, die, PLAYER_COLORS, diceCubeHTML } from '../util.js';
import { chipsHTML, logHTML } from './common.js';

// Gran Ciudad: compra calles, cobra alquileres, construye casas y hoteles y arruina a tus rivales.
const G = { // grupos de color: [color, precio casa]
  marron: ['#8d5524', 50], celeste: ['#4dabf7', 50], rosa: ['#f06595', 100], naranja: ['#ff922b', 100],
  rojo: ['#fa5252', 150], amarillo: ['#fcc419', 150], verde: ['#40c057', 200], azul: ['#364fc7', 200],
};
const P = (name, icon, group, price, rent) => ({ t: 'prop', name, icon, group, price, rent });
export const BOARD = [
  { t: 'go', name: 'Salida', icon: '🏁' },
  P('Calle del Churro', '🥨', 'marron', 60, 2), { t: 'chest', name: 'Caja', icon: '🎁' }, P('Callejón Pipas', '🌻', 'marron', 60, 4),
  { t: 'tax', name: 'Impuesto', icon: '💸', amt: 200 }, { t: 'station', name: 'Estación de Tren', icon: '🚂', price: 200 },
  P('Plaza Columpio', '🎠', 'celeste', 100, 6), { t: 'chance', name: 'Sorpresa', icon: '❓' }, P('Paseo Cometa', '🪁', 'celeste', 100, 6), P('Av. Tobogán', '🛝', 'celeste', 120, 8),
  { t: 'jail', name: 'Cárcel', icon: '🚔' },
  P('Calle Chocolate', '🍫', 'rosa', 140, 10), { t: 'util', name: 'Compañía de Luz', icon: '💡', price: 150 }, P('Plaza Gominola', '🍬', 'rosa', 140, 10), P('Av. Piruleta', '🍭', 'rosa', 160, 12),
  { t: 'station', name: 'Puerto', icon: '⚓', price: 200 },
  P('Calle Paella', '🥘', 'naranja', 180, 14), { t: 'chest', name: 'Caja', icon: '🎁' }, P('Calle Tortilla', '🍳', 'naranja', 180, 14), P('Plaza Gazpacho', '🍅', 'naranja', 200, 16),
  { t: 'free', name: 'Parque', icon: '🌳' },
  P('Av. del Cine', '🎬', 'rojo', 220, 18), { t: 'chance', name: 'Sorpresa', icon: '❓' }, P('Calle Palomitas', '🍿', 'rojo', 220, 18), P('Plaza Estreno', '🎟️', 'rojo', 240, 20),
  { t: 'station', name: 'Aeropuerto', icon: '✈️', price: 200 },
  P('Paseo del Faro', '🗼', 'amarillo', 260, 22), P('Calle Gaviota', '🐦', 'amarillo', 260, 22), { t: 'util', name: 'Compañía de Agua', icon: '🚰', price: 150 }, P('Av. del Sol', '🌞', 'amarillo', 280, 24),
  { t: 'gojail', name: '¡A la cárcel!', icon: '👮' },
  P('Bulevar Estrella', '⭐', 'verde', 300, 26), P('Av. Cohete', '🚀', 'verde', 300, 26), { t: 'chest', name: 'Caja', icon: '🎁' }, P('Plaza Galaxia', '🪐', 'verde', 320, 28),
  { t: 'station', name: 'Teleférico', icon: '🚡', price: 200 },
  { t: 'chance', name: 'Sorpresa', icon: '❓' }, P('Torre Diamante', '💎', 'azul', 350, 35), { t: 'tax', name: 'Multa de lujo', icon: '🧾', amt: 100 }, P('Gran Vía Dorada', '👑', 'azul', 400, 50),
];
const HOUSE_MULT = [0.5, 1.4, 3.2, 4, 4.8];
const rentWithHouses = (sq, h) => Math.round((sq.price * HOUSE_MULT[h - 1]) / 10) * 10;
const CARDS = {
  chance: [
    ['Avanza hasta la Salida y cobra 200', { go: 0 }], ['¡A la cárcel sin pasar por la Salida!', { jail: true }], ['Retrocede 3 casillas', { back: 3 }],
    ['Ganas un concurso de tartas: cobra 100', { money: 100 }], ['Multa por exceso de velocidad: paga 50', { money: -50 }], ['Ve al Aeropuerto', { go: 25 }],
    ['Arreglos en tus casas: 25 por casa y 100 por hotel', { repairs: [25, 100] }], ['Te nombran alcalde: paga 50 a cada jugador', { each: -50 }],
    ['Tarjeta "Sal de la cárcel gratis"', { free: true }], ['Ve a la Gran Vía Dorada', { go: 39 }], ['El banco se equivoca a tu favor: cobra 150', { money: 150 }],
  ],
  chest: [
    ['¡Es tu cumpleaños! Cada jugador te da 20', { each: 20 }], ['Devolución de Hacienda: cobra 60', { money: 60 }], ['Factura del dentista: paga 80', { money: -80 }],
    ['Vendes tu vieja bici: cobra 40', { money: 40 }], ['Avanza hasta la Salida y cobra 200', { go: 0 }], ['Tarjeta "Sal de la cárcel gratis"', { free: true }],
    ['¡A la cárcel sin pasar por la Salida!', { jail: true }], ['Ganas la lotería del barrio: cobra 200', { money: 200 }], ['Seguro del coche: paga 100', { money: -100 }],
    ['Herencia de la tía Paqui: cobra 100', { money: 100 }],
  ],
};

const alive = (s) => s.players.map((p, k) => k).filter((k) => !s.players[k].out);
const groupOf = (g) => BOARD.map((sq, i) => (sq.group === g ? i : -1)).filter((i) => i >= 0);
const ownsGroup = (s, seat, g) => groupOf(g).every((i) => s.own[i] === seat);
function netWorth(s, k) {
  let v = s.players[k].cash;
  BOARD.forEach((sq, i) => { if (s.own[i] === k) v += (s.mort[i] ? sq.price / 2 : sq.price) + (s.houses[i] || 0) * (G[sq.group] ? G[sq.group][1] : 0); });
  return v;
}
function rentOf(s, i, dice) {
  const sq = BOARD[i], o = s.own[i];
  if (s.mort[i]) return 0;
  if (sq.t === 'station') { const n = BOARD.filter((x, j) => x.t === 'station' && s.own[j] === o).length; return 25 * 2 ** (n - 1); }
  if (sq.t === 'util') { const n = BOARD.filter((x, j) => x.t === 'util' && s.own[j] === o).length; return dice * (n === 2 ? 10 : 4); }
  const h = s.houses[i] || 0;
  if (h) return rentWithHouses(sq, h);
  return ownsGroup(s, o, sq.group) ? sq.rent * 2 : sq.rent;
}
// Conseguir dinero vendiendo casas e hipotecando. Devuelve true si llega.
function raise(s, k, amt, notes) {
  const p = s.players[k];
  const mine = BOARD.map((sq, i) => i).filter((i) => s.own[i] === k);
  while (p.cash < amt) {
    const withHouse = mine.filter((i) => s.houses[i] > 0).sort((a, b) => (s.houses[b] - s.houses[a]) || (BOARD[b].price - BOARD[a].price));
    if (withHouse.length) { const i = withHouse[0]; s.houses[i]--; p.cash += G[BOARD[i].group][1] / 2; notes.push(`vende una casa en ${BOARD[i].name}`); continue; }
    const unm = mine.filter((i) => !s.mort[i]).sort((a, b) => BOARD[a].price - BOARD[b].price);
    if (unm.length) { const i = unm[0]; s.mort[i] = true; p.cash += BOARD[i].price / 2; notes.push(`hipoteca ${BOARD[i].name}`); continue; }
    return false;
  }
  return true;
}
function pay(s, from, to, amt, why) {
  const p = s.players[from];
  const notes = [];
  if (p.cash < amt && !raise(s, from, amt, notes)) {
    // bancarrota
    const left = p.cash;
    if (to != null) s.players[to].cash += left;
    BOARD.forEach((sq, i) => {
      if (s.own[i] !== from) return;
      s.houses[i] = 0;
      if (to != null) s.own[i] = to; else { s.own[i] = null; s.mort[i] = false; }
    });
    p.cash = 0; p.out = true;
    pushLog(s, `💥 {${from}} se arruina${to != null ? ` y todo pasa a {${to}}` : ''}`);
    return 'bankrupt';
  }
  if (notes.length) pushLog(s, `{${from}} ${notes.slice(0, 3).join(', ')}${notes.length > 3 ? '…' : ''}`);
  p.cash -= amt;
  if (to != null) s.players[to].cash += amt;
  void why;
  return 'ok';
}
function checkEnd(s) {
  const al = alive(s);
  if (al.length <= 1 || (s.maxRounds && s.round > s.maxRounds)) {
    let w = al[0] ?? 0;
    al.forEach((k) => { if (netWorth(s, k) > netWorth(s, w)) w = k; });
    s.over = true; s.winner = w; s.timer = null;
    return true;
  }
  return false;
}
function nextTurn(s) {
  const prev = s.turn;
  s.turn = alive(s).find((k) => k > prev) ?? alive(s)[0];
  if (s.turn <= prev) s.round++;
  s.doubles = 0;
  s.phase = s.players[s.turn].jail ? 'jail' : 'roll';
  s.card = null; s.offer = null;
  checkEnd(s);
}

// Mueve y resuelve la casilla. Devuelve los datos de animación.
function land(s, seat, fx) {
  const p = s.players[seat];
  const i = p.pos;
  const sq = BOARD[i];
  if (sq.t === 'prop' || sq.t === 'station' || sq.t === 'util') {
    if (s.own[i] == null) { s.phase = 'buy'; s.offer = i; return; }
    if (s.own[i] !== seat && !s.players[s.own[i]].out) {
      const r = rentOf(s, i, s.lastRoll[0] + s.lastRoll[1]);
      if (r > 0) {
        const res = pay(s, seat, s.own[i], r);
        pushLog(s, `{${seat}} paga ${r} de alquiler a {${s.own[i]}}`);
        fx.money = [...(fx.money || []), { from: seat, to: s.own[i], amt: r }];
        if (res === 'bankrupt') { fx.bankrupt = seat; return; }
      } else pushLog(s, `${sq.name} está hipotecada: no se paga`);
    }
  } else if (sq.t === 'tax') {
    const res = pay(s, seat, null, sq.amt);
    pushLog(s, `{${seat}} paga ${sq.amt} de ${sq.name.toLowerCase()}`);
    fx.money = [...(fx.money || []), { from: seat, to: null, amt: sq.amt }];
    if (res === 'bankrupt') { fx.bankrupt = seat; return; }
  } else if (sq.t === 'gojail') {
    goJail(s, seat); fx.jail = true; return;
  } else if (sq.t === 'chance' || sq.t === 'chest') {
    const deck = s.decks[sq.t];
    const ci = deck.shift(); deck.push(ci);
    const [text, eff] = CARDS[sq.t][ci];
    s.card = { kind: sq.t, text };
    pushLog(s, `{${seat}}: "${text}"`);
    fx.card = { kind: sq.t, text };
    if (eff.money) {
      if (eff.money > 0) { p.cash += eff.money; fx.money = [...(fx.money || []), { from: null, to: seat, amt: eff.money }]; }
      else { const res = pay(s, seat, null, -eff.money); fx.money = [...(fx.money || []), { from: seat, to: null, amt: -eff.money }]; if (res === 'bankrupt') { fx.bankrupt = seat; return; } }
    }
    if (eff.each) {
      alive(s).filter((k) => k !== seat).forEach((k) => {
        if (eff.each > 0) { pay(s, k, seat, eff.each); fx.money = [...(fx.money || []), { from: k, to: seat, amt: eff.each }]; }
        else if (pay(s, seat, k, -eff.each) === 'bankrupt') fx.bankrupt = seat;
        else fx.money = [...(fx.money || []), { from: seat, to: k, amt: -eff.each }];
      });
      if (fx.bankrupt != null) return;
    }
    if (eff.repairs) {
      let cost = 0;
      BOARD.forEach((x, j) => { if (s.own[j] === seat) { const h = s.houses[j] || 0; cost += h === 5 ? eff.repairs[1] : h * eff.repairs[0]; } });
      if (cost) { if (pay(s, seat, null, cost) === 'bankrupt') { fx.bankrupt = seat; return; } fx.money = [...(fx.money || []), { from: seat, to: null, amt: cost }]; }
    }
    if (eff.free) p.freeCards++;
    if (eff.jail) { goJail(s, seat); fx.jail = true; return; }
    if (eff.go != null || eff.back) {
      const to = eff.back ? (i - eff.back + 40) % 40 : eff.go;
      if (!eff.back && to < i) { p.cash += 200; fx.money = [...(fx.money || []), { from: null, to: seat, amt: 200 }]; }
      fx.jump = { from: i, to };
      p.pos = to;
      return land(s, seat, fx);
    }
  }
}
function goJail(s, seat) {
  const p = s.players[seat];
  p.pos = 10; p.jail = 1; s.doubles = 0;
  pushLog(s, `🚔 {${seat}} va a la cárcel`);
}
function afterLanding(s, seat, doubles) {
  if (s.over) return;
  const p = s.players[seat];
  if (p.out) { if (!checkEnd(s)) nextTurn(s); return; }
  if (s.phase === 'buy') return;
  s.phase = doubles && !p.jail ? 'roll' : 'end';
}

export default {
  id: 'ciudad',
  name: 'Gran Ciudad',
  icon: '🏙️',
  color: '#2f9e44',
  cat: 'mesa',
  minPlayers: 2,
  maxPlayers: 6,
  teams: null,
  moveSound: 'move',
  blurb: 'Compra calles, cobra alquileres, construye casas y hoteles… ¡y conviértete en el magnate de la ciudad!',
  options: [
    { id: 'rounds', label: '⏳ Duración', type: 'choice', def: 25, choices: [{ v: 15, label: '15 vueltas' }, { v: 25, label: '25 vueltas' }, { v: 50, label: '50 vueltas' }] },
    { id: 'cash', label: '💶 Dinero inicial', type: 'choice', def: 1500, choices: [{ v: 1000, label: '1000' }, { v: 1500, label: '1500' }, { v: 2000, label: '2000' }] },
  ],
  rules: `<ol>
    <li>Tira dos dados y avanza. Al pasar por la <b>Salida</b> cobras 200.</li>
    <li>Si caes en una calle, estación o compañía <b>libre</b>, puedes comprarla.</li>
    <li>Si es de otro, le pagas <b>alquiler</b>. Si tiene todas las calles de un color, el alquiler se dobla.</li>
    <li>Con todas las calles de un color puedes construir <b>casas</b> (hasta 4) y luego un <b>hotel</b> 🏨. ¡El alquiler sube muchísimo!</li>
    <li>Estaciones: cuantas más tengas, más cobras. Compañías: se cobra según los dados.</li>
    <li>Sorpresa ❓ y Caja 🎁 dan cartas con premios o castigos.</li>
    <li>Si sacas <b>dobles</b> vuelves a tirar; tres dobles seguidos… ¡a la cárcel! Para salir: paga 50, saca dobles o usa la tarjeta.</li>
    <li>Si no puedes pagar, se venden casas y se hipotecan calles solas. Si aun así no llegas, te arruinas.</li>
    <li>Gana el último que quede sin arruinarse, o el más rico (dinero + propiedades) al acabar las vueltas.</li></ol>`,

  setup(n, opts = {}) {
    const o = opts.options || {};
    return {
      n, players: Array.from({ length: n }, () => ({ cash: o.cash || 1500, pos: 0, jail: 0, out: false, freeCards: 0 })),
      own: Array(40).fill(null), houses: Array(40).fill(0), mort: Array(40).fill(false),
      decks: { chance: shuffle([...CARDS.chance.keys()]), chest: shuffle([...CARDS.chest.keys()]) },
      turn: 0, phase: 'roll', round: 1, maxRounds: o.rounds || 25, doubles: 0, lastRoll: [3, 4], v: 0, log: ['¡Bienvenidos a Gran Ciudad!'],
    };
  },
  turnOf: (s) => (s.over ? null : s.turn),
  isOver: (s) => !!s.over,
  viewFor(s) { return { ...s, decks: null }; },

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat !== s.turn) fail('No es tu turno');
    const p = s.players[seat];
    if (a.type === 'roll') {
      if (s.phase !== 'roll' && s.phase !== 'jail') fail('Ahora no toca tirar');
      const d1 = die(), d2 = die();
      s.lastRoll = [d1, d2]; s.dieVal = d1; s.rollId = s.v;
      const dbl = d1 === d2;
      const fx = { id: s.v, type: 'roll', seat, dice: [d1, d2], noFlip: [`tok${seat}`] };
      s.card = null;
      const fromJail = s.phase === 'jail';
      if (fromJail) {
        if (dbl) { p.jail = 0; pushLog(s, `{${seat}} saca dobles y sale de la cárcel`); fx.text = '¡Dobles! Sale de la cárcel'; fx.emoji = '🔓'; }
        else {
          p.jail++;
          if (p.jail > 3) { if (pay(s, seat, null, 50) === 'bankrupt') { fx.bankrupt = seat; afterLanding(s, seat, false); s.fx = fx; return s; } p.jail = 0; pushLog(s, `{${seat}} paga 50 y sale`); fx.money = [{ from: seat, to: null, amt: 50 }]; }
          else { pushLog(s, `{${seat}} no saca dobles: sigue en la cárcel`); s.phase = 'end'; fx.text = 'Sigue en la cárcel'; fx.emoji = '🔒'; s.fx = fx; return s; }
        }
      } else if (dbl) {
        s.doubles++;
        if (s.doubles >= 3) { goJail(s, seat); fx.jail = true; fx.text = '¡Tres dobles! A la cárcel'; fx.emoji = '🚔'; s.phase = 'end'; s.fx = fx; return s; }
      }
      const from = p.pos;
      p.pos = (from + d1 + d2) % 40;
      fx.walk = { from, steps: d1 + d2 };
      if (p.pos < from) { p.cash += 200; fx.money = [...(fx.money || []), { from: null, to: seat, amt: 200, go: true }]; pushLog(s, `{${seat}} pasa por la Salida: +200`); }
      pushLog(s, `{${seat}} saca ${d1}+${d2} y cae en ${BOARD[p.pos].name}`);
      land(s, seat, fx);
      if (fx.jail) { s.phase = 'end'; fx.text = fx.text || '¡A la cárcel!'; fx.emoji = '🚔'; }
      else afterLanding(s, seat, dbl && !fromJail && !p.jail && s.phase !== 'buy');
      if (s.phase === 'buy') s.buyDouble = dbl && !fromJail;
      if (fx.bankrupt != null) { fx.text = `¡{${seat}} se arruina!`; fx.emoji = '💥'; }
      if (s.over) { fx.text = `¡{${s.winner}} es el magnate de la ciudad!`; fx.emoji = '🏆'; fx.type = 'win'; }
      fx.bannerDelay = 300 + (fx.walk ? fx.walk.steps * 140 : 0);
      s.fx = fx;
      return s;
    }
    if (a.type === 'pay') {
      if (s.phase !== 'jail') fail('No estás en la cárcel');
      if (p.cash < 50) fail('No tienes 50');
      p.cash -= 50; p.jail = 0; s.phase = 'roll';
      pushLog(s, `{${seat}} paga 50 para salir de la cárcel`);
      s.fx = { id: s.v, type: 'free', seat, money: [{ from: seat, to: null, amt: 50 }] };
      return s;
    }
    if (a.type === 'usecard') {
      if (s.phase !== 'jail' || !p.freeCards) fail('No tienes la tarjeta');
      p.freeCards--; p.jail = 0; s.phase = 'roll';
      s.fx = { id: s.v, type: 'free', seat, text: '¡Sale gratis de la cárcel!', emoji: '🔓' };
      return s;
    }
    if (a.type === 'buy' || a.type === 'skip') {
      if (s.phase !== 'buy') fail('No hay nada que comprar');
      const i = s.offer;
      const sq = BOARD[i];
      if (a.type === 'buy') {
        if (p.cash < sq.price) fail('No tienes bastante dinero');
        p.cash -= sq.price; s.own[i] = seat;
        pushLog(s, `🏠 {${seat}} compra ${sq.name} por ${sq.price}`);
        s.fx = { id: s.v, type: 'buy', seat, i, money: [{ from: seat, to: null, amt: sq.price }] };
        if (sq.group && ownsGroup(s, seat, sq.group)) { s.fx.text = `¡{${seat}} tiene todo el color!`; s.fx.emoji = '🌈'; }
      } else { pushLog(s, `{${seat}} no compra ${sq.name}`); s.fx = { id: s.v, type: 'skip', seat }; }
      s.offer = null;
      s.phase = s.buyDouble && !p.jail ? 'roll' : 'end';
      return s;
    }
    if (a.type === 'build' || a.type === 'sell') {
      if (!['roll', 'end', 'buy'].includes(s.phase)) fail('Ahora no puedes construir');
      const i = a.i, sq = BOARD[i];
      if (!sq || sq.t !== 'prop' || s.own[i] !== seat) fail('Esa calle no es tuya');
      const grp = groupOf(sq.group);
      if (a.type === 'build') {
        if (!ownsGroup(s, seat, sq.group)) fail('Necesitas todas las calles de ese color');
        if (grp.some((j) => s.mort[j])) fail('Hay calles del color hipotecadas');
        const h = s.houses[i];
        if (h >= 5) fail('Ya tiene hotel');
        if (h > Math.min(...grp.map((j) => s.houses[j]))) fail('Construye de forma pareja en todo el color');
        const cost = G[sq.group][1];
        if (p.cash < cost) fail('No tienes bastante dinero');
        p.cash -= cost; s.houses[i]++;
        pushLog(s, `🔨 {${seat}} construye ${s.houses[i] === 5 ? 'un hotel' : 'una casa'} en ${sq.name}`);
        s.fx = { id: s.v, type: 'build', seat, i, hotel: s.houses[i] === 5, money: [{ from: seat, to: null, amt: cost }] };
        if (s.houses[i] === 5) { s.fx.text = '¡Hotel!'; s.fx.emoji = '🏨'; }
      } else {
        if (!s.houses[i]) fail('No hay casas');
        if (s.houses[i] < Math.max(...grp.map((j) => s.houses[j]))) fail('Vende de forma pareja');
        s.houses[i]--; p.cash += G[sq.group][1] / 2;
        s.fx = { id: s.v, type: 'sell', seat, i };
      }
      return s;
    }
    if (a.type === 'mortgage' || a.type === 'unmortgage') {
      const i = a.i, sq = BOARD[i];
      if (!sq || s.own[i] !== seat) fail('No es tuya');
      if (a.type === 'mortgage') {
        if (s.mort[i]) fail('Ya está hipotecada');
        if (sq.group && groupOf(sq.group).some((j) => s.houses[j])) fail('Vende antes las casas del color');
        s.mort[i] = true; p.cash += sq.price / 2;
        pushLog(s, `{${seat}} hipoteca ${sq.name}`);
      } else {
        const cost = Math.round(sq.price * 0.55);
        if (!s.mort[i]) fail('No está hipotecada');
        if (p.cash < cost) fail(`Necesitas ${cost}`);
        s.mort[i] = false; p.cash -= cost;
        pushLog(s, `{${seat}} levanta la hipoteca de ${sq.name}`);
      }
      s.fx = { id: s.v, type: a.type, seat, i };
      return s;
    }
    if (a.type === 'end') {
      if (s.phase !== 'end') fail(s.phase === 'buy' ? 'Decide si compras' : 'Primero tira los dados');
      nextTurn(s);
      s.fx = { id: s.v, type: 'next', seat: s.turn };
      if (s.over) s.fx = { id: s.v, type: 'win', text: `¡{${s.winner}} es el magnate de la ciudad!`, emoji: '🏆' };
      return s;
    }
    fail('Acción desconocida');
  },

  bot(s, seat) {
    const p = s.players[seat];
    if (s.phase === 'jail') { if (p.freeCards) return { type: 'usecard' }; if (p.cash > 400 && s.round < 12) return { type: 'pay' }; return { type: 'roll' }; }
    if (s.phase === 'buy') { const sq = BOARD[s.offer]; return { type: p.cash - sq.price >= (s.round < 6 ? 60 : 160) ? 'buy' : 'skip' }; }
    if (s.phase === 'end' || s.phase === 'roll') {
      // levantar hipotecas y construir si va sobrado
      const mortI = BOARD.map((sq, i) => i).find((i) => s.own[i] === seat && s.mort[i] && p.cash > BOARD[i].price * 0.55 + 400);
      if (mortI != null) return { type: 'unmortgage', i: mortI };
      const groups = Object.keys(G).filter((g) => ownsGroup(s, seat, g) && !groupOf(g).some((j) => s.mort[j]));
      for (const g of groups) {
        const cost = G[g][1];
        if (p.cash - cost < 250) continue;
        const list = groupOf(g);
        const min = Math.min(...list.map((j) => s.houses[j]));
        const i = list.find((j) => s.houses[j] === min && s.houses[j] < 5);
        if (i != null) return { type: 'build', i };
      }
      return { type: s.phase === 'roll' ? 'roll' : 'end' };
    }
    return null;
  },
  botDelay: (s) => (s.phase === 'end' ? 900 : 1300),

  demo() {
    const s = this.setup(2, { options: { rounds: 50 } });
    s.own[1] = 1; s.own[3] = 1;
    return { state: s, steps: [
      { say: 'Ana tira los dados y avanza…', seat: 0, a: { type: 'roll' }, patch: (st) => { st.players[0].pos = 35; }, wait: 2800 },
      { say: 'Si cae en algo libre puede comprarlo. Si es de otro, paga alquiler. ¡Y al pasar por la Salida cobra 200!', wait: 3200 },
      { say: 'Leo tiene todas las calles marrones: ¡puede construir casas y el alquiler se dispara!', seat: 0, patch: (st) => { st.phase = 'end'; }, a: { type: 'end' } },
      { say: 'Leo construye una casa…', seat: 1, a: { type: 'build', i: 1 }, wait: 2400 },
      { say: '…y otra en la otra calle marrón. ¡A esperar a que caigan!', seat: 1, a: { type: 'build', i: 3 }, wait: 3000 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me === s.turn && !s.over;
    const ui = ctx.ui.city || (ctx.ui.city = {});
    const cellPos = (i) => {
      if (i <= 10) return [10, 10 - i];
      if (i <= 20) return [10 - (i - 10), 0];
      if (i <= 30) return [0, i - 20];
      return [i - 30, 10];
    };
    const side = (i) => (i % 10 === 0 ? 'corner' : i < 10 ? 'b' : i < 20 ? 'l' : i < 30 ? 't' : 'r');
    const cells = BOARD.map((sq, i) => {
      const [r, c] = cellPos(i);
      const o = s.own[i];
      const h = s.houses[i] || 0;
      const band = sq.group ? `<i class="cyband" style="background:${G[sq.group][0]}"></i>` : '';
      return `<button class="cycell ${side(i)} ${s.mort[i] ? 'mort' : ''} ${ui.view === i ? 'viewing' : ''}" data-cell="${i}" style="grid-row:${r + 1};grid-column:${c + 1};${o != null ? `--oc:${PLAYER_COLORS[o]}` : ''}">
        ${band}<span class="cyico">${sq.icon}</span>${o != null ? '<i class="cyown"></i>' : ''}${h ? `<i class="cyhouses">${h === 5 ? '🏨' : '🏠'.repeat(h)}</i>` : ''}</button>`;
    }).join('');
    const toks = s.players.map((p, k) => {
      if (p.out) return '';
      const [r, c] = cellPos(p.pos);
      const same = s.players.slice(0, k).filter((q) => !q.out && q.pos === p.pos).length;
      return `<div class="cytok ${k === s.turn ? 'turn' : ''}" data-flip="tok${k}" data-tok="${k}" style="grid-row:${r + 1};grid-column:${c + 1};--pc:${PLAYER_COLORS[k]};--o:${same}">${ctx.avatar(k)}</div>`;
    }).join('');
    // casilla a la vista: la que se toca, la que se ofrece o en la que estás
    const vi = ui.view != null ? ui.view : s.offer != null ? s.offer : s.players[s.turn].pos;
    const vsq = BOARD[vi];
    let card = '';
    if (vsq.price) {
      const o = s.own[vi];
      const rows = vsq.t === 'prop'
        ? `<div>Alquiler: <b>${vsq.rent}</b> (color completo: ${vsq.rent * 2})</div><div class="cyrents">${[1, 2, 3, 4, 5].map((h) => `<span>${h === 5 ? '🏨' : '🏠'.repeat(h)} ${rentWithHouses(vsq, h)}</span>`).join('')}</div><div>Casa: ${G[vsq.group][1]}</div>`
        : vsq.t === 'station' ? '<div>Alquiler: 25 · 50 · 100 · 200 según cuántas tengas</div>' : '<div>Alquiler: 4× los dados (10× con las dos)</div>';
      card = `<div class="cycard" style="--gc:${vsq.group ? G[vsq.group][0] : '#868e96'}"><div class="cyctitle">${vsq.icon} ${esc(vsq.name)}</div>
        <div>Precio: <b>${vsq.price}</b>${o != null ? ` · Dueño: <b style="color:${PLAYER_COLORS[o]}">${esc(ctx.players[o])}</b>${s.mort[vi] ? ' (hipotecada)' : ''}` : ' · Libre'}</div>${rows}
        ${myTurn && o === me ? `<div class="row wrap cyown-actions">
          ${vsq.t === 'prop' && ownsGroup(s, me, vsq.group) && s.houses[vi] < 5 ? `<button class="btn small c3" data-build="${vi}">🔨 ${s.houses[vi] === 4 ? 'Hotel' : 'Casa'} (${G[vsq.group][1]})</button>` : ''}
          ${s.houses[vi] ? `<button class="btn small" data-sell="${vi}">💰 Vender casa</button>` : ''}
          ${!s.mort[vi] && !(vsq.group && groupOf(vsq.group).some((j) => s.houses[j])) ? `<button class="btn small" data-mort="${vi}">🏦 Hipotecar (+${vsq.price / 2})</button>` : ''}
          ${s.mort[vi] ? `<button class="btn small c2" data-unmort="${vi}">🔓 Deshipotecar (${Math.round(vsq.price * 0.55)})</button>` : ''}
        </div>` : ''}</div>`;
    } else card = `<div class="cycard plain"><div class="cyctitle">${vsq.icon} ${esc(vsq.name)}</div>${vsq.amt ? `<div>Paga ${vsq.amt}</div>` : ''}</div>`;
    const cardDrawn = s.card ? `<div class="cydrawn ${s.card.kind}"><b>${s.card.kind === 'chance' ? '❓ Sorpresa' : '🎁 Caja'}</b><div>${esc(s.card.text)}</div></div>` : '';
    let actions = '';
    if (myTurn) {
      if (s.phase === 'roll') actions = '<div class="cyhint">¡Tira los dados!</div>';
      else if (s.phase === 'jail') actions = `<div class="row wrap center"><button class="btn c1" data-act="roll">🎲 Intentar dobles</button>${s.players[me].cash >= 50 ? '<button class="btn c3" data-act="pay">💶 Pagar 50</button>' : ''}${s.players[me].freeCards ? '<button class="btn c2" data-act="usecard">🎫 Usar tarjeta</button>' : ''}</div>`;
      else if (s.phase === 'buy') { const sq = BOARD[s.offer]; actions = `<div class="row center"><button class="btn c2 pulse" data-act="buy" ${s.players[me].cash < sq.price ? 'disabled' : ''}>🏠 Comprar por ${sq.price}</button><button class="btn" data-act="skip">🙅 No comprar</button></div>`; }
      else if (s.phase === 'end') actions = '<button class="btn big c1 pulse" data-act="end">✅ Terminar turno</button>';
    }
    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (myTurn) status = s.phase === 'jail' ? '🔒 Estás en la cárcel' : s.phase === 'buy' ? '🤔 ¿La compras?' : s.phase === 'roll' ? '👉 ¡Te toca!' : '👉 Construye si quieres y termina el turno';
    else status = `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    el.innerHTML = `
      <div class="players">${chipsHTML(s, ctx, (i) => (s.players[i].out ? '💀' : `💶 ${s.players[i].cash}`))}</div>
      <div class="status">${status}</div>
      <div class="cywrap"><div class="cyboard">${cells}${toks}
        <div class="cycenter">
          <div class="cylogo">GRAN<br>CIUDAD</div>
          <div class="cydice"><button class="die3d" data-roll ${myTurn && (s.phase === 'roll') ? '' : 'disabled'} style="--c:${PLAYER_COLORS[s.turn]}">${diceCubeHTML(s.lastRoll[0])}</button><div class="cydie2">${diceCubeHTML(s.lastRoll[1])}</div></div>
          ${cardDrawn}
        </div></div></div>
      ${actions}
      ${card}
      <p class="hint light center">Vuelta ${s.round}${s.maxRounds ? `/${s.maxRounds}` : ''} · Toca una casilla para ver su ficha</p>
      ${logHTML(s, ctx, 3)}`;
    el.querySelectorAll('[data-cell]').forEach((b) => b.onclick = () => { const i = +b.dataset.cell; ui.view = ui.view === i ? null : i; ctx.sound('click'); ctx.rerender(); });
    const rb = el.querySelector('[data-roll]'); if (rb && !rb.disabled) rb.onclick = () => { ui.view = null; ctx.send({ type: 'roll' }); };
    el.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => { ui.view = null; ctx.send({ type: b.dataset.act }); });
    el.querySelectorAll('[data-build]').forEach((b) => b.onclick = () => ctx.send({ type: 'build', i: +b.dataset.build }));
    el.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => ctx.send({ type: 'sell', i: +b.dataset.sell }));
    el.querySelectorAll('[data-mort]').forEach((b) => b.onclick = () => ctx.send({ type: 'mortgage', i: +b.dataset.mort }));
    el.querySelectorAll('[data-unmort]').forEach((b) => b.onclick = () => ctx.send({ type: 'unmortgage', i: +b.dataset.unmort }));
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    const chip = (k) => el.querySelector(`[data-chip="${k}"]`);
    const cell = (i) => el.querySelector(`[data-cell="${i}"]`);
    if (f.walk) {
      await fx.wait(1300); // el dado rueda primero
      const tok = el.querySelector(`[data-tok="${f.seat}"]`);
      const endI = (f.walk.from + f.walk.steps) % 40;
      if (tok && cell(endI)) {
        const end = fx.center(cell(endI));
        const frames = [];
        for (let k = 0; k <= f.walk.steps; k++) {
          const c = cell((f.walk.from + k) % 40);
          if (!c) continue;
          const p = fx.center(c);
          frames.push({ transform: `translate(${p.x - end.x}px, ${p.y - end.y}px)` });
          if (k < f.walk.steps) frames.push({ transform: `translate(${p.x - end.x}px, ${p.y - end.y - 10}px) scale(1.2)` });
        }
        for (let k = 0; k < f.walk.steps; k++) setTimeout(() => ctx.sound('move'), k * 140);
        if (!f.jump && !f.jail) await tok.animate(frames, { duration: 140 * f.walk.steps + 80 }).finished.catch(() => {});
        else await fx.wait(140 * f.walk.steps);
      }
    }
    if (f.jail) {
      ctx.sound('clang');
      const j = cell(10);
      if (j) { const p = fx.center(j); fx.emojiRain(p.x, p.y, '🚔', 5); fx.shake(j); }
    }
    if (f.money) {
      for (const m of f.money) {
        const from = m.from != null ? chip(m.from) : el.querySelector('.cycenter');
        const to = m.to != null ? chip(m.to) : el.querySelector('.cycenter');
        if (!from || !to) continue;
        const a = fx.center(from), b = fx.center(to);
        for (let k = 0; k < Math.min(6, 1 + Math.floor(m.amt / 60)); k++) setTimeout(() => fx.fly('<div class="bill">💶</div>', a, b, { size: 30, arc: 70, duration: 550 }), k * 80);
        setTimeout(() => {
          if (m.to != null) fx.floatText(b.x, b.y - 10, `+${m.amt}`, '#8ce99a', 26);
          if (m.from != null) fx.floatText(a.x, a.y - 10, `-${m.amt}`, '#ffa8a8', 26);
          ctx.sound(m.to != null ? 'cash' : 'coin');
        }, 600);
        await fx.wait(250);
      }
    }
    if (f.type === 'buy') {
      const c = cell(f.i);
      if (c) { c.animate([{ transform: 'scale(1.6)', zIndex: 5 }, { transform: 'none' }], { duration: 500 }); const p = fx.center(c); fx.sparkle(p.x, p.y, PLAYER_COLORS[f.seat], 18, 1.3); fx.floatText(p.x, p.y - 20, '¡Comprada!', '#fff', 22); }
    }
    if (f.type === 'build') {
      const c = cell(f.i);
      ctx.sound('place');
      if (c) { const p = fx.center(c); fx.dust(p.x, p.y, 40, 'rgba(255,255,255,.9)'); fx.emojiRain(p.x, p.y - 20, f.hotel ? '🏨' : '🏠', 3); }
    }
    if (f.card) {
      const d = el.querySelector('.cydrawn');
      if (d) { ctx.sound('flip'); d.animate([{ transform: 'rotateY(90deg) scale(.6)' }, { transform: 'none' }], { duration: 450 }); }
    }
    if (f.bankrupt != null) { const c = chip(f.bankrupt); if (c) { const p = fx.center(c); fx.explosion(p.x, p.y, 1); ctx.sound('boom'); } }
    if (f.type === 'win') fx.fireworksShow(el.getBoundingClientRect(), 8);
  },
};
