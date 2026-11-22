import { clone, fail, pushLog, esc, shuffle, PLAYER_COLORS } from '../util.js';
import { chipsHTML, logHTML } from './common.js';

// Dibuja y adivina: uno dibuja con el dedo y los demás adivinan tocando la palabra entre 8 opciones.
// Cuanto antes aciertes, más puntos. Si dibuja la máquina, va destapando un dibujo poco a poco.
const WORDS = [
  ['casa', '🏠'], ['sol', '☀️'], ['gato', '🐱'], ['perro', '🐶'], ['árbol', '🌳'], ['coche', '🚗'], ['pez', '🐟'], ['flor', '🌸'],
  ['luna', '🌙'], ['estrella', '⭐'], ['barco', '⛵'], ['avión', '✈️'], ['pelota', '⚽'], ['manzana', '🍎'], ['plátano', '🍌'], ['helado', '🍦'],
  ['pizza', '🍕'], ['tarta', '🎂'], ['gafas', '👓'], ['zapato', '👟'], ['reloj', '⌚'], ['guitarra', '🎸'], ['cohete', '🚀'], ['fantasma', '👻'],
  ['corazón', '❤️'], ['paraguas', '☂️'], ['nube', '☁️'], ['montaña', '⛰️'], ['serpiente', '🐍'], ['caracol', '🐌'], ['mariposa', '🦋'], ['araña', '🕷️'],
  ['tortuga', '🐢'], ['elefante', '🐘'], ['jirafa', '🦒'], ['pingüino', '🐧'], ['bicicleta', '🚲'], ['tren', '🚂'], ['castillo', '🏰'], ['corona', '👑'],
  ['llave', '🔑'], ['libro', '📖'], ['lápiz', '✏️'], ['tijeras', '✂️'], ['bombilla', '💡'], ['teléfono', '📱'], ['televisión', '📺'], ['regalo', '🎁'],
  ['globo', '🎈'], ['robot', '🤖'], ['dinosaurio', '🦖'], ['pulpo', '🐙'], ['cerdo', '🐷'], ['huevo', '🥚'], ['hamburguesa', '🍔'], ['palomitas', '🍿'],
  ['sandía', '🍉'], ['uvas', '🍇'], ['zanahoria', '🥕'], ['seta', '🍄'], ['cactus', '🌵'], ['arcoíris', '🌈'], ['rayo', '⚡'], ['fuego', '🔥'],
  ['muñeco de nieve', '⛄'], ['ancla', '⚓'], ['sombrero', '🎩'], ['abeja', '🐝'], ['vaca', '🐮'], ['búho', '🦉'], ['tiburón', '🦈'], ['ballena', '🐳'],
];
const EMOJI = Object.fromEntries(WORDS);
const PALETTE = ['#212529', '#e03131', '#1971c2', '#2f9e44', '#f59f00', '#9c36b5', '#a0522d', '#ffffff'];
const POINTS = [10, 8, 6, 5, 4];

function startTurn(s) {
  s.drawer = s.order[s.turnIdx % s.n];
  s.round = Math.floor(s.turnIdx / s.n) + 1;
  const pool = WORDS.map((w) => w[0]).filter((w) => !s.usedWords.includes(w));
  s.choices = shuffle(pool).slice(0, 3);
  s.word = null; s.options = null; s.strokes = []; s.guessed = {}; s.wrong = {}; s.hint = 0; s.reveal = null;
  s.phase = 'choose';
  s.timer = { id: `c${s.v}`, ms: 15000, action: { type: 'autochoose', t: s.turnIdx } };
}
function endTurn(s, why) {
  s.phase = 'reveal';
  s.timer = { id: `r${s.v}`, ms: 4200, action: { type: 'next', t: s.turnIdx } };
  const n = Object.keys(s.guessed).length;
  pushLog(s, `Era "${s.word}" ${EMOJI[s.word]} · ${n ? `${n} ${n > 1 ? 'aciertos' : 'acierto'}` : 'nadie acertó'}`);
  return { id: s.v, type: 'reveal', word: s.word, text: `Era: ${s.word}`, emoji: EMOJI[s.word], why };
}

export default {
  id: 'dibuja',
  noFrenzy: true, // ya tiene su propio reloj o se juega a la vez
  name: 'Dibuja y adivina',
  icon: '🎨',
  color: '#d6336c',
  cat: 'fiesta',
  minPlayers: 2,
  maxPlayers: 6,
  teams: null,
  moveSound: 'click',
  blurb: 'Uno dibuja con el dedo y los demás adivinan qué es. ¡Cuanto antes aciertes, más puntos!',
  options: [
    { id: 'rounds', label: '🔁 Vueltas', type: 'choice', def: 2, choices: [{ v: 1, label: '1' }, { v: 2, label: '2' }, { v: 3, label: '3' }] },
    { id: 'secs', label: '⏱️ Tiempo para dibujar', type: 'choice', def: 75, choices: [{ v: 50, label: '50 s' }, { v: 75, label: '75 s' }, { v: 100, label: '100 s' }] },
  ],
  rules: `<ol>
    <li>Por turnos, a uno le toca <b>dibujar</b>: elige una de tres palabras secretas.</li>
    <li>Dibuja con el dedo (sin letras ni números, ¡eso es trampa!). Puedes cambiar de color y grosor o borrar.</li>
    <li>Los demás ven el dibujo en directo y <b>tocan la palabra</b> que creen entre 8 opciones. Cada fallo te bloquea un momento y solo tienes 3 intentos.</li>
    <li>Puntos por acertar: 10 al primero, 8 al segundo, 6 al tercero… El que dibuja gana 4 por cada uno que acierte.</li>
    <li>Si dibuja una máquina, el dibujo se va destapando poco a poco.</li>
    <li>Gana quien más puntos tenga al acabar las vueltas.</li></ol>`,

  setup(n, opts = {}) {
    const o = opts.options || {};
    const s = { n, order: shuffle([...Array(n).keys()]), turnIdx: 0, totalRounds: o.rounds || 2, secs: o.secs || 75, scores: Array(n).fill(0), usedWords: [], v: 0, log: ['¡Coged los lápices!'] };
    startTurn(s);
    return s;
  },
  turnOf: (s) => (s.over ? null : s.phase === 'choose' ? s.drawer : null),
  actors: (s) => (s.over ? [] : s.phase === 'choose' ? [s.drawer] : s.phase === 'draw' ? [...Array(s.n).keys()].filter((k) => k === s.drawer || (s.guessed[k] == null && (s.wrong[k] || 0) < 3)) : []),
  isOver: (s) => !!s.over,
  viewFor(s, seat) {
    if (s.phase === 'reveal' || s.over || seat === s.drawer) return s;
    return { ...s, word: null, choices: null };
  },

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    const choose = (w) => {
      s.word = w; s.usedWords.push(w);
      const decoys = shuffle(WORDS.map((x) => x[0]).filter((x) => x !== w)).slice(0, 7);
      s.options = shuffle([w, ...decoys]);
      s.phase = 'draw';
      s.timer = { id: `d${s.v}`, ms: s.secs * 1000, action: { type: 'timeup', t: s.turnIdx } };
      s.fx = { id: s.v, type: 'start', seat: s.drawer, text: `¡Dibuja {${s.drawer}}!`, emoji: '🎨' };
    };
    if (seat === 'sys') {
      if (a.t !== s.turnIdx) fail('Temporizador caducado');
      if (a.type === 'autochoose' && s.phase === 'choose') { choose(s.choices[0]); return s; }
      if (a.type === 'timeup' && s.phase === 'draw') { s.fx = endTurn(s, 'time'); return s; }
      if (a.type === 'next' && s.phase === 'reveal') {
        s.turnIdx++;
        if (s.turnIdx >= s.n * s.totalRounds) {
          let w = 0; s.scores.forEach((v, k) => { if (v > s.scores[w]) w = k; });
          s.over = true; s.winner = w; s.tie = s.scores.filter((v) => v === s.scores[w]).length > 1; s.timer = null;
          s.fx = { id: s.v, type: 'win', text: s.tie ? '¡Empate!' : `¡{${w}} gana con ${s.scores[w]} puntos!`, emoji: '🏆' };
        } else startTurn(s);
        return s;
      }
      fail('Temporizador caducado');
    }
    if (a.type === 'choose') {
      if (seat !== s.drawer || s.phase !== 'choose') fail('No te toca elegir');
      if (!s.choices.includes(a.word)) fail('Palabra no válida');
      choose(a.word);
      return s;
    }
    if (a.type === 'stroke' || a.type === 'clear' || a.type === 'hint') {
      if (seat !== s.drawer || s.phase !== 'draw') fail('No estás dibujando');
      if (a.type === 'clear') { s.strokes = []; return s; }
      if (a.type === 'hint') { s.hint = Math.min(6, (s.hint || 0) + 1); s.reveal = EMOJI[s.word]; return s; }
      const pts = (a.pts || []).slice(0, 400).map((p) => [Math.max(0, Math.min(1000, p[0] | 0)), Math.max(0, Math.min(1000, p[1] | 0))]);
      if (!pts.length) fail('Trazo vacío');
      const last = s.strokes[s.strokes.length - 1];
      if (last && last.id === a.id) last.p.push(...pts);
      else s.strokes.push({ id: String(a.id).slice(0, 12), c: PALETTE.includes(a.c) ? a.c : '#212529', w: [4, 10, 22].includes(a.w) ? a.w : 10, p: pts });
      if (s.strokes.length > 400) s.strokes.shift();
      return s;
    }
    if (a.type === 'guess') {
      if (s.phase !== 'draw') fail('Ahora no se adivina');
      if (seat === s.drawer) fail('¡Tú estás dibujando!');
      if (s.guessed[seat] != null) fail('Ya lo has acertado');
      if ((s.wrong[seat] || 0) >= 3) fail('Ya no te quedan intentos');
      if (a.word === s.word) {
        const rank = Object.keys(s.guessed).length;
        s.guessed[seat] = rank;
        const pts = POINTS[rank] ?? 3;
        s.scores[seat] += pts; s.scores[s.drawer] += 4;
        pushLog(s, `✅ {${seat}} lo adivina (+${pts})`);
        s.fx = { id: s.v, type: 'right', seat, pts, text: rank === 0 ? `¡{${seat}} lo adivina el primero!` : null, emoji: '🎯' };
        const left = [...Array(s.n).keys()].filter((k) => k !== s.drawer && s.guessed[k] == null && (s.wrong[k] || 0) < 3);
        if (!left.length) s.fx = { ...endTurn(s, 'all'), seat, pts };
        return s;
      }
      s.wrong[seat] = (s.wrong[seat] || 0) + 1;
      s.fx = { id: s.v, type: 'wrong', seat, word: a.word };
      const left = [...Array(s.n).keys()].filter((k) => k !== s.drawer && s.guessed[k] == null && (s.wrong[k] || 0) < 3);
      if (!left.length) s.fx = endTurn(s, 'all');
      return s;
    }
    fail('Acción desconocida');
  },

  bot(s, seat) {
    if (s.phase === 'choose' && seat === s.drawer) return { type: 'choose', word: s.choices[(Math.random() * 3) | 0] };
    if (s.phase !== 'draw') return null;
    if (seat === s.drawer) return (s.hint || 0) < 6 ? { type: 'hint' } : null;
    // adivinar: cuanto más dibujo hay (o más destapado), más fácil
    const info = (s.hint || 0) > 0 ? (s.hint || 0) / 6 : Math.min(1, s.strokes.reduce((a, x) => a + x.p.length, 0) / 260);
    if (Math.random() > 0.25 + info * 0.6) return null;
    const right = Math.random() < 0.35 + info * 0.55;
    const wrongOpts = s.options.filter((w) => w !== s.word);
    return { type: 'guess', word: right || !wrongOpts.length ? s.word : wrongOpts[(Math.random() * wrongOpts.length) | 0] };
  },
  botDelay: (s) => (s.phase === 'choose' ? 1800 : 4500 + Math.random() * 3000),

  demo() {
    const s = this.setup(3, { options: { rounds: 1 } });
    s.order = [0, 1, 2]; s.drawer = 0; s.choices = ['sol', 'casa', 'pez'];
    const circle = Array.from({ length: 30 }, (_, k) => [500 + Math.cos(k / 29 * Math.PI * 2) * 150, 500 + Math.sin(k / 29 * Math.PI * 2) * 150]);
    const ray = (k) => { const a = (k / 8) * Math.PI * 2; return [[500 + Math.cos(a) * 200, 500 + Math.sin(a) * 200], [500 + Math.cos(a) * 300, 500 + Math.sin(a) * 300]]; };
    return { state: s, steps: [
      { say: 'A Ana le toca dibujar: elige una de tres palabras secretas.', seat: 0, a: { type: 'choose', word: 'sol' } },
      { say: 'Dibuja con el dedo… un círculo…', seat: 0, a: { type: 'stroke', id: 'a', c: '#f59f00', w: 10, pts: circle }, wait: 1600 },
      { say: '…y unos rayos.', seat: 0, a: { type: 'stroke', id: 'b', c: '#f59f00', w: 10, pts: ray(0) }, wait: 400 },
      { say: '…y unos rayos.', seat: 0, a: { type: 'stroke', id: 'c', c: '#f59f00', w: 10, pts: ray(2) }, wait: 400 },
      { say: '…y unos rayos.', seat: 0, a: { type: 'stroke', id: 'd', c: '#f59f00', w: 10, pts: ray(4) }, wait: 400 },
      { say: '…y unos rayos.', seat: 0, a: { type: 'stroke', id: 'e', c: '#f59f00', w: 10, pts: ray(6) }, wait: 1200 },
      { say: 'Leo toca "sol" entre las opciones: ¡acierta el primero! 10 puntos para él y 4 para Ana.', seat: 1, a: { type: 'guess', word: 'sol' }, wait: 2800 },
      { say: 'Sara también acierta. ¡Todos lo han adivinado!', seat: 2, a: { type: 'guess', word: 'sol' }, wait: 3500 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat ?? 0;
    const ui = ctx.ui.dib || (ctx.ui.dib = { color: '#212529', w: 10 });
    const isDrawer = me === s.drawer;
    const drawing = s.phase === 'draw' && isDrawer && !s.over;
    const drawerBot = ctx.isBot ? ctx.isBot(s.drawer) : false;
    // el lienzo se conserva entre redibujados para no cortar el trazo
    const key = `${s.turnIdx}`;
    if (!ui.canvas || ui.key !== key) {
      ui.key = key;
      ui.canvas = document.createElement('canvas');
      ui.canvas.className = 'dbcanvas';
      ui.canvas.width = ui.canvas.height = 700;
      ui.cur = null;
      ui.lock = 0;
    }
    const canvas = ui.canvas;
    const chips = chipsHTML(s, ctx, (i) => `⭐ ${s.scores[i]}${i === s.drawer ? ' ✏️' : s.guessed && s.guessed[i] != null ? ' ✅' : ''}`, null, (i) => (i === s.drawer && !s.over ? 'turn' : ''));
    let top = '';
    if (s.over) top = `<div class="status">${s.tie ? '🤝 ¡Empate!' : `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`}</div>`;
    else if (s.phase === 'choose') top = `<div class="status">${isDrawer ? '🎨 ¡Te toca dibujar! Elige una palabra' : `<b>${esc(ctx.players[s.drawer])}</b> está eligiendo qué dibujar…`}</div>`;
    else if (s.phase === 'draw') top = `<div class="status">${isDrawer ? `✏️ Dibuja: <b class="dbword">${esc(s.word)}</b> ${EMOJI[s.word] || ''}` : s.guessed[me] != null ? '✅ ¡Acertaste! Mira a los demás…' : `🤔 ¿Qué dibuja <b>${esc(ctx.players[s.drawer])}</b>?`}</div><div class="timerbar" data-timer></div>`;
    else if (s.phase === 'reveal') top = `<div class="status">Era… <b class="dbword">${esc(s.word)}</b> ${EMOJI[s.word] || ''}</div>`;
    const tools = drawing ? `<div class="dbtools">${PALETTE.map((c) => `<button class="dbcol ${ui.color === c ? 'on' : ''}" data-col="${c}" style="--c:${c}">${c === '#ffffff' ? '🧽' : ''}</button>`).join('')}
      ${[4, 10, 22].map((w) => `<button class="dbsize ${ui.w === w ? 'on' : ''}" data-w="${w}"><i style="--w:${w / 2 + 2}px"></i></button>`).join('')}<button class="dbclear" data-clear>🗑️</button></div>` : '';
    const opts = s.phase === 'draw' && !isDrawer && s.options ? `<div class="dbopts">${s.options.map((w) => `<button class="dbopt" data-guess="${esc(w)}" ${s.guessed[me] != null || (s.wrong[me] || 0) >= 3 ? 'disabled' : ''}>${esc(w)}</button>`).join('')}</div>
      <p class="hint light center">${s.guessed[me] != null ? '' : `Intentos: ${'❤️'.repeat(3 - (s.wrong[me] || 0))}${'🖤'.repeat(s.wrong[me] || 0)}`}</p>` : '';
    const choose = s.phase === 'choose' && isDrawer && s.choices ? `<div class="dbchoose">${s.choices.map((w) => `<button class="btn big c1" data-choose="${esc(w)}">${EMOJI[w] || ''} ${esc(w)}</button>`).join('')}</div>` : '';
    const reveal = s.phase === 'reveal' || (s.phase === 'draw' && drawerBot) ? `<div class="dbemoji ${s.phase === 'reveal' ? 'show' : ''}" style="--h:${s.hint || 0}">${s.phase === 'reveal' ? EMOJI[s.word] || '❓' : s.reveal || ''}</div>` : '';
    el.innerHTML = `
      <div class="players">${chips}</div>
      ${top}
      ${choose}
      ${s.phase === 'draw' || s.phase === 'reveal' ? `<div class="dbwrap"><div class="dbpaper" data-paper></div>${reveal}</div>` : ''}
      ${tools}
      ${opts}
      <p class="hint light center">Vuelta ${s.round}/${s.totalRounds}</p>
      ${logHTML(s, ctx, 2)}`;
    const paper = el.querySelector('[data-paper]');
    if (paper) {
      paper.appendChild(canvas);
      // redibujar todos los trazos
      const g = canvas.getContext('2d');
      g.fillStyle = '#fffdf6'; g.fillRect(0, 0, 700, 700);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const drawStroke = (st) => {
        g.strokeStyle = st.c; g.lineWidth = st.w * 0.7;
        g.beginPath();
        st.p.forEach(([x, y], i) => { const X = x * 0.7, Y = y * 0.7; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
        if (st.p.length === 1) g.lineTo(st.p[0][0] * 0.7 + 0.1, st.p[0][1] * 0.7);
        g.stroke();
      };
      (s.strokes || []).forEach(drawStroke);
      if (ui.cur && drawing) drawStroke(ui.cur);
      ui.redraw = () => { g.fillStyle = '#fffdf6'; g.fillRect(0, 0, 700, 700); (ctx.state.strokes || []).forEach((x) => { if (!ui.cur || x.id !== ui.cur.id) drawStroke(x); }); if (ui.cur) drawStroke(ui.cur); };
    }
    if (drawing) {
      const toPt = (e) => { const r = canvas.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)]; };
      let pending = [], sendT = null;
      const flush = () => { if (pending.length && ui.cur) { ctx.sendQuiet({ type: 'stroke', id: ui.cur.id, c: ui.cur.c, w: ui.cur.w, pts: pending }); pending = []; } sendT = null; };
      canvas.onpointerdown = (e) => {
        e.preventDefault();
        ui.cur = { id: Math.random().toString(36).slice(2, 8), c: ui.color, w: ui.w, p: [toPt(e)] };
        pending = [ui.cur.p[0]];
        ui.redraw();
        const move = (ev) => {
          const p = toPt(ev); const l = ui.cur.p[ui.cur.p.length - 1];
          if (Math.hypot(p[0] - l[0], p[1] - l[1]) < 6) return;
          ui.cur.p.push(p); pending.push(p);
          const g = canvas.getContext('2d');
          g.strokeStyle = ui.cur.c; g.lineWidth = ui.cur.w * 0.7; g.lineCap = 'round';
          g.beginPath(); g.moveTo(l[0] * 0.7, l[1] * 0.7); g.lineTo(p[0] * 0.7, p[1] * 0.7); g.stroke();
          if (!sendT) sendT = setTimeout(flush, 280);
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); clearTimeout(sendT); flush(); ui.cur = null; };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      };
      canvas.style.touchAction = 'none';
      el.querySelectorAll('[data-col]').forEach((b) => b.onclick = () => { ui.color = b.dataset.col; ctx.rerender(); });
      el.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { ui.w = +b.dataset.w; ctx.rerender(); });
      el.querySelector('[data-clear]').onclick = () => ctx.send({ type: 'clear' });
    } else { canvas.onpointerdown = null; canvas.style.touchAction = ''; }
    el.querySelectorAll('[data-choose]').forEach((b) => b.onclick = () => ctx.send({ type: 'choose', word: b.dataset.choose }));
    el.querySelectorAll('[data-guess]').forEach((b) => b.onclick = () => {
      if (Date.now() < ui.lock) { ctx.toast('⏳ Espera un momento…'); return; }
      ctx.send({ type: 'guess', word: b.dataset.guess });
    });
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    const me = ctx.mySeat ?? 0;
    if (f.type === 'right' || (f.type === 'reveal' && f.pts)) {
      const ch = el.querySelector(`[data-chip="${f.seat}"]`);
      if (ch) { const p = fx.center(ch); fx.floatText(p.x, p.y - 10, `+${f.pts}`, '#ffe066', 30); fx.sparkle(p.x, p.y, PLAYER_COLORS[f.seat], 20, 1.3); }
      ctx.sound('ding');
      if (f.seat === me) { fx.confetti(60); }
    }
    if (f.type === 'wrong') {
      if (f.seat === me) {
        const ui = ctx.ui.dib; if (ui) ui.lock = Date.now() + 2500;
        ctx.sound('buzz');
        const b = el.querySelector(`[data-guess="${f.word}"]`);
        if (b) { fx.shake(b); b.classList.add('nope'); }
        el.querySelectorAll('.dbopt').forEach((x) => { x.classList.add('locked'); setTimeout(() => x.classList.remove('locked'), 2500); });
      } else ctx.sound('tick');
    }
    if (f.type === 'start') { ctx.sound('whoosh'); const p = el.querySelector('.dbwrap'); if (p) p.animate([{ transform: 'scale(.6) rotate(-6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.3,1.5,.6,1)' }); }
    if (f.type === 'reveal') {
      ctx.sound('special');
      const e = el.querySelector('.dbemoji');
      if (e) { e.animate([{ transform: 'scale(0) rotate(-30deg)' }, { transform: 'scale(1.2) rotate(8deg)' }, { transform: 'none' }], { duration: 600, easing: 'ease-out' }); const p = fx.center(e); fx.sparkle(p.x, p.y, '#ffe066', 30, 1.6); }
    }
    if (f.type === 'win') fx.fireworksShow(el.getBoundingClientRect(), 7);
  },
};
