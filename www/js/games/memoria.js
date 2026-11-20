import { clone, shuffle, esc, fail, pushLog, PLAYER_COLORS, sameTeam } from '../util.js';

// Parejas (juego de memoria). Por turnos se levantan 2 cartas: si son iguales te las llevas y repites;
// si no, se vuelven a tapar y pasa el turno. Gana quien consiga más parejas.
const POOL = ['🐶', '🐱', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐔', '🐧', '🦄', '🐙', '🦋', '🐞', '🐢', '🐳', '🦒', '🐘', '🦓',
  '🍎', '🍌', '🍓', '🍉', '🍇', '🍒', '🍍', '🥕', '🍄', '🌻', '🌈', '⭐', '🌙', '⚽', '🎈', '🎁', '🚀', '🚗', '🎸', '🍦', '🍩', '🧁', '🍕'];
const CARD_BG = ['#ffe3e3', '#fff3bf', '#d3f9d8', '#d0ebff', '#e5dbff', '#ffe8cc', '#c5f6fa', '#fcc2d7'];

const teamScore = (s, seat) => s.scores.reduce((a, v, k) => (sameTeam(s, k, seat) ? a + v : a), 0);

function turnTimer(s) {
  s.turnCount = (s.turnCount || 0) + 1;
  s.timer = s.turnMs ? { id: `t${s.v}`, ms: s.turnMs, action: { type: 'timeout', turn: s.turnCount } } : null;
}
function nextTurn(s) {
  s.up = [];
  s.phase = 'pick';
  s.turn = (s.turn + 1) % s.n;
  turnTimer(s);
}

export default {
  id: 'memoria',
  name: 'Parejas',
  icon: '🃏',
  color: '#f06595',
  minPlayers: 2,
  maxPlayers: 6,
  teams: 'any',
  hidden: false,
  moveSound: 'flip',
  blurb: 'El juego de memoria de toda la vida: levanta dos cartas y encuentra las parejas. ¿Quién tiene mejor memoria?',
  options: [
    { id: 'cards', label: '🃏 Cartas', type: 'choice', def: 20, choices: [{ v: 12, label: '12' }, { v: 20, label: '20' }, { v: 30, label: '30' }, { v: 40, label: '40' }] },
    { id: 'time', label: '⏱️ Tiempo por turno', type: 'choice', def: 0, choices: [{ v: 0, label: 'Sin límite' }, { v: 10, label: '10 s' }, { v: 20, label: '20 s' }, { v: 30, label: '30 s' }] },
  ],
  rules: `
    <ol>
      <li>Todas las cartas empiezan boca abajo.</li>
      <li>En tu turno levantas <b>dos cartas</b>.</li>
      <li>Si son <b>iguales</b>, te llevas la pareja y <b>vuelves a jugar</b>.</li>
      <li>Si son distintas, se vuelven a tapar y le toca al siguiente. ¡Fíjate bien dónde estaban!</li>
      <li>Si hay tiempo por turno y se acaba, pierdes el turno.</li>
      <li>Cuando no quedan cartas, gana quien tenga <b>más parejas</b> (por equipos, se suman).</li>
    </ol>`,

  setup(n, opts = {}) {
    const o = opts.options || {};
    const count = [12, 20, 30, 40].includes(o.cards) ? o.cards : 20;
    const faces = shuffle(POOL.slice()).slice(0, count / 2);
    const cards = shuffle([...faces, ...faces].map((f) => ({ f, bg: CARD_BG[POOL.indexOf(f) % CARD_BG.length] })));
    const s = { n, cards, matched: Array(count).fill(null), up: [], scores: Array(n).fill(0), turn: 0, phase: 'pick', v: 0, log: ['¡Encuentra las parejas!'], teams: opts.teams || null, turnMs: (o.time || 0) * 1000 };
    turnTimer(s);
    return s;
  },
  turnOf: (s) => (s.over ? null : s.turn),
  isOver: (s) => !!s.over,
  viewFor(s, seat) {
    // las caras de las cartas tapadas no se envían: nadie puede hacer trampas
    return { ...s, cards: s.cards.map((c, i) => (s.matched[i] != null || s.up.includes(i) ? c : { f: null, bg: null })) };
  },

  action(st, seat, a) {
    const s = clone(st);
    s.v++;
    s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat === 'sys') {
      if (a.type === 'hide' && s.phase === 'reveal') { nextTurn(s); return s; }
      if (a.type === 'timeout' && a.turn === s.turnCount && s.phase === 'pick') {
        pushLog(s, `⏰ Se acabó el tiempo de {${s.turn}}`);
        s.fx = { id: s.v, type: 'bad', seat: s.turn, text: '¡Se acabó el tiempo!', emoji: '⏰' };
        nextTurn(s);
        return s;
      }
      fail('Temporizador caducado');
    }
    if (seat !== s.turn) fail('No es tu turno');
    if (a.type !== 'flip') fail('Acción desconocida');
    if (s.phase !== 'pick') fail('Espera un momento…');
    const i = a.i;
    if (!(i >= 0 && i < s.cards.length) || s.matched[i] != null || s.up.includes(i)) fail('Esa carta no se puede levantar');
    s.up.push(i);
    if (s.up.length < 2) { s.fx = { id: s.v, type: 'flip', i }; return s; }
    const [x, y] = s.up;
    if (s.cards[x].f === s.cards[y].f) {
      s.matched[x] = s.matched[y] = seat;
      s.scores[seat]++;
      s.up = [];
      pushLog(s, `{${seat}} encuentra la pareja ${s.cards[x].f}`);
      s.fx = { id: s.v, type: 'match', seat, cards: [x, y], text: '¡Pareja!', emoji: s.cards[x].f, bannerDelay: 300 };
      if (s.matched.every((m) => m != null)) {
        s.over = true;
        s.timer = null;
        let w = 0;
        s.scores.forEach((_, k) => { if (teamScore(s, k) > teamScore(s, w)) w = k; });
        const ties = s.scores.map((_, k) => k).filter((k) => !sameTeam(s, k, w) && teamScore(s, k) === teamScore(s, w));
        s.winner = w;
        s.tie = ties.length > 0;
        s.fx = { id: s.v, type: 'win', seat: w, cards: [x, y], text: ties.length ? '¡Empate!' : '¡Campeón de la memoria!', emoji: '🧠', bannerDelay: 400 };
      } else turnTimer(s);
      return s;
    }
    s.phase = 'reveal';
    s.timer = { id: `h${s.v}`, ms: 1400, action: { type: 'hide' } };
    pushLog(s, `{${seat}} falla`);
    s.fx = { id: s.v, type: 'miss', seat, cards: [x, y] };
    return s;
  },

  bot(s) {
    const free = s.cards.map((_, i) => i).filter((i) => s.matched[i] == null && !s.up.includes(i));
    return { type: 'flip', i: free[(Math.random() * free.length) | 0] };
  },

  demo() {
    const s = this.setup(2, { options: { cards: 12, time: 0 } });
    const layout = ['🐶', '🐱', '🐶', '🦊', '🐱', '🦊', '🍓', '🚀', '🐸', '🍓', '🐸', '🚀'];
    s.cards = layout.map((f) => ({ f, bg: CARD_BG[POOL.indexOf(f) % CARD_BG.length] }));
    return {
      state: s,
      steps: [
        { say: 'Las cartas están boca abajo. Ana levanta una…', seat: 0, a: { type: 'flip', i: 0 }, wait: 1200 },
        { say: '…y otra. ¡No son iguales! Se vuelven a tapar. Fíjate dónde estaban.', seat: 0, a: { type: 'flip', i: 1 }, wait: 3000 },
        { say: 'Le toca a Leo. Levanta un gato 🐱…', seat: 1, a: { type: 'flip', i: 4 }, wait: 1200 },
        { say: '…y se acuerda de dónde estaba el otro. ¡Pareja! Se la lleva y repite.', seat: 1, a: { type: 'flip', i: 1 }, wait: 2600 },
        { say: 'Leo también recuerda el perro 🐶.', seat: 1, a: { type: 'flip', i: 0 }, wait: 1000 },
        { say: '¡Otra pareja!', seat: 1, a: { type: 'flip', i: 2 }, wait: 2600 },
        { say: 'Ahora falla y pasa el turno a Ana.', seat: 1, a: { type: 'flip', i: 3 }, wait: 1000 },
        { say: 'Gana quien tenga más parejas al final. ¡A entrenar la memoria! 🧠', seat: 1, a: { type: 'flip', i: 6 }, wait: 3000 },
      ],
    };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me === s.turn && !s.over && s.phase === 'pick';
    const count = s.cards.length;
    const cols = count <= 12 ? 4 : count <= 20 ? 5 : 6;
    const players = s.scores.map((sc, i) => `
      <div class="pchip ${i === s.turn && !s.over ? 'turn' : ''}" style="--pc:${PLAYER_COLORS[i]}" data-chip="${i}">
        <span class="avatar">${ctx.avatar(i)}</span><span class="pname">${esc(ctx.players[i])}</span>
        <span class="pinfo">🃏 ${s.teams ? teamScore(s, i) : sc}</span></div>`).join('');
    const cards = s.cards.map((c, i) => {
      const m = s.matched[i];
      const open = m != null || s.up.includes(i);
      return `<button class="mcard ${open ? 'open' : ''} ${m != null ? 'done' : ''} ${myTurn && !open ? 'can' : ''}" data-i="${i}" ${myTurn && !open ? '' : 'tabindex="-1"'} style="${m != null ? `--pc:${PLAYER_COLORS[m]}` : ''}">
        <div class="mc-inner"><div class="mc-back"><span>?</span></div><div class="mc-front" style="background:${c.bg || '#fff'}"><span>${c.f || ''}</span>${m != null ? `<i class="mc-owner">${ctx.avatar(m)}</i>` : ''}</div></div></button>`;
    }).join('');
    let status;
    if (s.over) status = s.tie ? '🤝 ¡Empate!' : `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (myTurn) status = s.up.length ? '👉 Levanta otra carta' : '👉 ¡Te toca! Levanta dos cartas';
    else status = `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    el.innerHTML = `
      <div class="players">${players}</div>
      <div class="status">${status}</div>
      ${s.turnMs && !s.over ? '<div class="timerbar" data-timer></div>' : ''}
      <div class="mgrid" style="--cols:${cols}">${cards}</div>
      <div class="log">${(s.log || []).slice(0, 2).map((l) => `<div>${ctx.fmt(l)}</div>`).join('')}</div>`;
    el.querySelectorAll('.mcard.can').forEach((b) => b.onclick = () => ctx.send({ type: 'flip', i: +b.dataset.i }));
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    const card = (i) => el.querySelector(`.mcard[data-i="${i}"]`);
    if (f.type === 'flip') ctx.sound('flip');
    if (f.type === 'miss') {
      ctx.sound('flip');
      await fx.wait(550);
      f.cards.forEach((i) => { const c = card(i); if (c) fx.shake(c); });
      ctx.sound('bad');
    }
    if (f.type === 'match' || f.type === 'win') {
      ctx.sound('flip');
      await fx.wait(450);
      ctx.sound('special');
      const chip = el.querySelector(`[data-chip="${f.seat}"]`);
      for (const i of f.cards) {
        const c = card(i);
        if (!c) continue;
        const p = fx.center(c);
        fx.sparkle(p.x, p.y, PLAYER_COLORS[f.seat], 16, 1.3);
        c.classList.add('pop');
        if (chip) {
          const to = fx.center(chip);
          fx.fly(`<div class="mini-card">${ctx.state.cards[i].f}</div>`, p, to, { size: 44, arc: 120, duration: 800, spin: 1 })
            .then(() => { fx.sparkle(to.x, to.y, '#ffe066', 8); chip.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300 }); });
        }
      }
      if (f.type === 'win') fx.fireworksShow(el.getBoundingClientRect(), 8);
    }
  },
};
