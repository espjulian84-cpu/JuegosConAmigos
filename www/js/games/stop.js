import { clone, fail, pushLog, esc, shuffle, PLAYER_COLORS } from '../util.js';
import { chipsHTML, logHTML, norm, bestBy } from './common.js';

// ¡Stop! (el juego de papel y boli de toda la vida): sale una letra y hay que escribir una palabra
// de cada categoría que empiece por ella. Quien termina antes grita ¡STOP!
const CATS = {
  nombre: { label: '🙋 Nombre', words: 'Ana Alberto Beatriz Bruno Carlos Carmen Daniel Diana Elena Enrique Fernando Fátima Gabriel Gloria Hugo Helena Inés Iván Julia Javier Laura Luis María Manuel Nuria Nicolás Olga Óscar Pablo Paula Raquel Rubén Sara Sergio Teresa Tomás Vanesa Víctor' },
  animal: { label: '🐾 Animal', words: 'abeja águila ballena búho caballo cerdo delfín dromedario elefante erizo foca flamenco gato gallina hipopótamo hormiga iguana impala jirafa jabalí león lobo mono mariposa nutria oso oveja pato pingüino rana ratón serpiente sapo tigre tortuga vaca víbora' },
  fruta: { label: '🍎 Fruta o verdura', words: 'aguacate alcachofa berenjena brócoli cereza calabaza dátil durazno espinaca endibia fresa frambuesa guisante granada higo haba judía jengibre limón lechuga mango melón naranja nabo oliva ocra pera pimiento rábano remolacha sandía seta tomate tamarindo uva vainilla' },
  lugar: { label: '🌍 País o ciudad', words: 'Alemania Argentina Barcelona Brasil Cádiz China Dinamarca Dublín Egipto España Francia Florencia Grecia Granada Holanda Huelva India Italia Japón Jaén Londres Lugo México Madrid Noruega Nápoles Oviedo Oslo Perú París Roma Rusia Suecia Sevilla Toledo Turquía Valencia Venezuela' },
  color: { label: '🎨 Color', words: 'amarillo azul blanco beige celeste coral dorado esmeralda fucsia granate gris índigo jade lila marrón morado naranja negro ocre plateado púrpura rojo rosa salmón turquesa verde violeta' },
  objeto: { label: '🧸 Objeto', words: 'armario bolígrafo cuchara dado escoba flauta gafas hucha imán jarra lámpara mesa nevera olla paraguas regla silla tijeras taza vaso ventilador' },
  comida: { label: '🍕 Comida', words: 'arroz bocadillo croqueta donut empanada fabada gazpacho hamburguesa helado jamón lentejas macarrones natillas paella pizza queso ravioli salmorejo sopa tortilla turrón' },
  profesion: { label: '👷 Profesión', words: 'abogado bombero carpintero cocinero dentista enfermero electricista fontanero granjero herrero ingeniero jardinero juez locutor médico mecánico notario óptico panadero pintor profesor policía relojero sastre taxista veterinario' },
  deporte: { label: '⚽ Deporte', words: 'atletismo baloncesto balonmano ciclismo dardos esquí esgrima fútbol golf hockey judo kárate lucha motociclismo natación pádel rugby surf tenis voleibol' },
};
const LETTERS = 'ABCDEFGHIJLMNOPRSTV'.split('');
const startsWith = (w, L) => norm(w).startsWith(norm(L));

function newRound(s) {
  s.round++;
  const unused = LETTERS.filter((l) => !s.used.includes(l));
  s.letter = shuffle(unused.length ? unused : LETTERS.slice())[0];
  s.used.push(s.letter);
  s.phase = 'write';
  s.answers = Array(s.n).fill(null);
  s.votes = {};
  s.ready = Array(s.n).fill(false);
  s.stopBy = null;
  s.writeStart = Date.now();
  s.timer = { id: `w${s.v}`, ms: s.secs * 1000, action: { type: 'timeup', round: s.round } };
}
// puntuación de la ronda: 10 si es única, 5 si coincide con otro, 0 si no vale
function scoreRound(s) {
  const pts = Array(s.n).fill(0);
  const detail = s.cats.map(() => Array(s.n).fill(0));
  s.cats.forEach((cat, ci) => {
    const valid = s.answers.map((ans, k) => {
      const w = ans && ans[ci];
      if (!w || !startsWith(w, s.letter) || norm(w).length < 2) return null;
      const v = (s.votes[`${k}-${ci}`] || []).length;
      if (v > (s.n - 1) / 2) return null;
      return norm(w);
    });
    valid.forEach((w, k) => {
      if (!w) return;
      const same = valid.filter((x) => x === w).length;
      const p = same > 1 ? 5 : valid.filter(Boolean).length === 1 ? 20 : 10;
      detail[ci][k] = p; pts[k] += p;
    });
  });
  return { pts, detail };
}

export default {
  id: 'stop',
  name: '¡Stop!',
  icon: '✋',
  color: '#e8590c',
  cat: 'fiesta',
  minPlayers: 2,
  maxPlayers: 6,
  teams: null,
  moveSound: 'click',
  blurb: 'Sale una letra: nombre, animal, fruta, país… ¡Escribe rápido y grita STOP antes que nadie!',
  options: [
    { id: 'rounds', label: '🔤 Rondas', type: 'choice', def: 3, choices: [{ v: 3, label: '3' }, { v: 5, label: '5' }, { v: 8, label: '8' }] },
    { id: 'secs', label: '⏱️ Tiempo', type: 'choice', def: 90, choices: [{ v: 60, label: '1 min' }, { v: 90, label: '1,5 min' }, { v: 150, label: '2,5 min' }] },
  ],
  rules: `<ol>
    <li>En cada ronda sale una <b>letra</b> al azar.</li>
    <li>Escribe una palabra de cada categoría (nombre, animal, fruta…) que <b>empiece por esa letra</b>.</li>
    <li>Cuando las tengas todas, pulsa <b>¡STOP!</b>: los demás tienen 5 segundos para terminar. Si se acaba el tiempo, la ronda acaba igual.</li>
    <li>Puntos: <b>10</b> si nadie más la ha puesto, <b>5</b> si se repite, <b>20</b> si eres el único que ha puesto algo en esa categoría. Mal escrita o que no empiece por la letra: 0.</li>
    <li>Al corregir, podéis tocar <b>👎</b> en una respuesta que no valga: si la mayoría vota en contra, no puntúa.</li>
    <li>Gana quien más puntos tenga al final.</li></ol>`,

  setup(n, opts = {}) {
    const o = opts.options || {};
    const keys = Object.keys(CATS);
    const s = { n, totalRounds: o.rounds || 3, secs: o.secs || 90, cats: shuffle(keys.slice()).slice(0, 6), scores: Array(n).fill(0), round: 0, used: [], v: 0, log: ['¡Preparad los dedos!'] };
    newRound(s);
    return s;
  },
  turnOf: () => null,
  actors: (s) => (s.over ? [] : s.phase === 'write' ? [...Array(s.n).keys()] : s.phase === 'collect' ? s.answers.map((a, k) => (a ? -1 : k)).filter((k) => k >= 0) : s.phase === 'review' ? s.ready.map((r, k) => (r ? -1 : k)).filter((k) => k >= 0) : []),
  isOver: (s) => !!s.over,

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    const toCollect = () => {
      s.phase = 'collect';
      s.timer = { id: `c${s.v}`, ms: 5500, action: { type: 'collectEnd', round: s.round } };
    };
    const toReview = () => {
      s.answers = s.answers.map((x) => x || s.cats.map(() => ''));
      s.phase = 'review';
      s.timer = { id: `r${s.v}`, ms: 90000, action: { type: 'reviewEnd', round: s.round } };
      s.fx = { id: s.v, type: 'review' };
    };
    const finishReview = () => {
      const { pts, detail } = scoreRound(s);
      pts.forEach((p, k) => { s.scores[k] += p; });
      s.lastRound = { letter: s.letter, pts, detail };
      pushLog(s, `Ronda ${s.round} (${s.letter}): ${pts.map((p, k) => `{${k}} +${p}`).join(', ')}`);
      if (s.round >= s.totalRounds) {
        const { winner, tie } = bestBy(s, (k) => s.scores[k]);
        s.over = true; s.winner = winner; s.tie = tie; s.timer = null;
        s.fx = { id: s.v, type: 'win', pts, text: tie ? '¡Empate!' : `¡{${winner}} gana con ${s.scores[winner]} puntos!`, emoji: '🏆', bannerDelay: 600 };
      } else {
        newRound(s);
        s.fx = { id: s.v, type: 'round', pts, letter: s.letter, text: `Nueva letra: ${s.letter}`, emoji: '🔤', bannerDelay: 300 };
      }
    };
    if (seat === 'sys') {
      if (a.type === 'timeup' && a.round === s.round && s.phase === 'write') { toCollect(); s.fx = { id: s.v, type: 'timeup', text: '¡Tiempo!', emoji: '⏰' }; return s; }
      if (a.type === 'collectEnd' && a.round === s.round && s.phase === 'collect') { toReview(); return s; }
      if (a.type === 'reviewEnd' && a.round === s.round && s.phase === 'review') { finishReview(); return s; }
      fail('Temporizador caducado');
    }
    if (a.type === 'stop') {
      if (s.phase !== 'write') fail('Ya se ha parado');
      const ans = (a.answers || []).slice(0, s.cats.length).map((w) => String(w || '').slice(0, 30));
      if (ans.length < s.cats.length || ans.some((w) => !w.trim())) fail('Rellena todas las categorías para decir STOP');
      s.answers[seat] = ans;
      s.stopBy = seat;
      pushLog(s, `✋ {${seat}} grita ¡STOP!`);
      toCollect();
      s.fx = { id: s.v, type: 'stop', seat, text: `¡STOP de {${seat}}!`, emoji: '✋' };
      return s;
    }
    if (a.type === 'submit') {
      if (s.phase !== 'collect' && s.phase !== 'write') fail('Ahora no');
      if (s.answers[seat]) return st;
      s.answers[seat] = (a.answers || []).slice(0, s.cats.length).map((w) => String(w || '').slice(0, 30));
      while (s.answers[seat].length < s.cats.length) s.answers[seat].push('');
      if (s.phase === 'collect' && s.answers.every(Boolean)) toReview();
      return s;
    }
    if (a.type === 'vote') {
      if (s.phase !== 'review') fail('Ahora no se vota');
      const key = `${a.k}-${a.ci}`;
      if (a.k === seat) fail('No puedes votar tu propia respuesta');
      const list = s.votes[key] || [];
      s.votes[key] = list.includes(seat) ? list.filter((x) => x !== seat) : [...list, seat];
      return s;
    }
    if (a.type === 'ready') {
      if (s.phase !== 'review') fail('Ahora no');
      s.ready[seat] = true;
      if (s.ready.every(Boolean)) finishReview();
      return s;
    }
    fail('Acción desconocida');
  },

  bot(s, seat) {
    const answers = () => s.cats.map((c) => {
      if (Math.random() < 0.2) return '';
      const opts = CATS[c].words.split(' ').filter((w) => startsWith(w, s.letter));
      return opts.length ? opts[(Math.random() * opts.length) | 0] : '';
    });
    if (s.phase === 'write') {
      // la máquina dice STOP cuando ha pasado buena parte del tiempo
      const elapsed = (Date.now() - (s.writeStart || 0)) / 1000;
      if (elapsed > s.secs * (0.55 + seat * 0.07) && Math.random() < 0.5) {
        const full = s.cats.map((c) => { const o = CATS[c].words.split(' ').filter((w) => startsWith(w, s.letter)); return o[(Math.random() * o.length) | 0] || ''; });
        if (full.every(Boolean)) return { type: 'stop', answers: full };
      }
      if (!s.writeStart) return { type: 'submit', answers: answers() }; // (simulaciones)
      return null;
    }
    if (s.phase === 'collect') return { type: 'submit', answers: answers() };
    if (s.phase === 'review') return { type: 'ready' };
    return null;
  },
  botDelay: (s) => (s.phase === 'collect' ? 800 : s.phase === 'review' ? 4000 : 3000),

  demo() {
    const s = this.setup(2, { options: { rounds: 1, secs: 90 } });
    s.letter = 'M'; s.cats = ['nombre', 'animal', 'fruta', 'lugar', 'color', 'comida'];
    return { state: s, steps: [
      { say: 'Ha salido la letra M. Hay que escribir una palabra de cada categoría que empiece por M.', wait: 2800 },
      { say: 'Ana lo tiene todo y grita ¡STOP!', seat: 0, a: { type: 'stop', answers: ['María', 'mono', 'mango', 'Madrid', 'morado', 'macarrones'] } },
      { say: 'Leo entrega lo que tiene…', seat: 1, a: { type: 'submit', answers: ['Manuel', 'mono', 'melón', 'México', '', 'macarrones'] }, wait: 2600 },
      { say: 'Se corrige: 10 puntos si es única, 5 si se repite (como "mono"), 20 si solo tú tienes algo en esa categoría.', seat: 0, a: { type: 'ready' } },
      { say: '¡A sumar puntos!', seat: 1, a: { type: 'ready' }, wait: 3000 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat ?? 0;
    const ui = ctx.ui.stop || (ctx.ui.stop = {});
    if (ui.round !== s.round) { ui.round = s.round; ui.ans = s.cats.map(() => ''); ui.sent = false; }
    const chips = chipsHTML(s, ctx, (i) => `⭐ ${s.scores[i]}`, null, (i) => (s.phase === 'review' && s.ready[i] ? 'readychip' : ''));
    const head = `<div class="players">${chips}</div><div class="stopletter"><span>Ronda ${s.round}/${s.totalRounds}</span><b>${s.letter}</b></div>`;
    if (s.phase === 'write' || s.phase === 'collect') {
      const mineSent = s.answers[me];
      const rows = s.cats.map((c, ci) => `<label class="stoprow"><span>${CATS[c].label}</span><input data-ci="${ci}" maxlength="30" autocomplete="off" autocapitalize="sentences" placeholder="${s.letter}…" value="${esc(mineSent ? mineSent[ci] : ui.ans[ci])}" ${mineSent ? 'disabled' : ''}></label>`).join('');
      const filled = ui.ans.every((w) => w.trim());
      el.innerHTML = `${head}
        <div class="status">${s.phase === 'collect' ? `✋ ${s.stopBy != null ? `¡STOP de <b>${esc(ctx.players[s.stopBy])}</b>!` : '¡Tiempo!'} Termina ya…` : '✍️ ¡Escribe rápido!'}</div>
        <div class="timerbar" data-timer></div>
        <div class="stopform">${rows}</div>
        ${s.phase === 'write' && !mineSent ? `<button class="btn big stopbtn ${filled ? 'pulse' : 'disabled'}" data-stop>✋ ¡STOP!</button>` : ''}
        ${mineSent ? '<p class="hint light center">✅ Respuestas entregadas</p>' : ''}`;
      el.querySelectorAll('input[data-ci]').forEach((inp) => {
        inp.onfocus = () => { ui.focus = +inp.dataset.ci; };
        inp.onblur = () => { setTimeout(() => { if (!document.activeElement || !document.activeElement.dataset || document.activeElement.dataset.ci == null) ui.focus = null; }, 0); };
        if (ui.focus === +inp.dataset.ci && !inp.disabled) setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 0);
        inp.oninput = () => {
          ui.ans[+inp.dataset.ci] = inp.value;
          const b = el.querySelector('[data-stop]');
          if (b) { const ok = ui.ans.every((w) => w.trim()); b.classList.toggle('disabled', !ok); b.classList.toggle('pulse', ok); }
        };
        inp.onkeydown = (e) => { if (e.key === 'Enter') { const nx = el.querySelector(`input[data-ci="${+inp.dataset.ci + 1}"]`); if (nx) nx.focus(); else inp.blur(); } };
      });
      const sb = el.querySelector('[data-stop]');
      if (sb) sb.onclick = () => {
        if (!ui.ans.every((w) => w.trim())) { ctx.toast('Rellena todas las categorías primero ✍️'); return; }
        ctx.send({ type: 'stop', answers: ui.ans });
      };
      // al parar, se entregan solas las respuestas
      if (s.phase === 'collect' && !mineSent && !ui.sent && ctx.mySeat != null) { ui.sent = true; setTimeout(() => ctx.send({ type: 'submit', answers: ui.ans }), 4300 + Math.random() * 400); }
      return;
    }
    // corrección
    const res = scoreRound(s);
    const table = s.cats.map((c, ci) => `
      <div class="stopcat"><div class="stopcatname">${CATS[c].label}</div>
      ${s.answers.map((ans, k) => {
        const w = ans ? ans[ci] : '';
        const votes = (s.votes[`${k}-${ci}`] || []);
        const p = res.detail[ci][k];
        return `<div class="stopans ${p ? 'ok' : 'no'}" style="--pc:${PLAYER_COLORS[k]}"><span class="sa-av">${ctx.avatar(k)}</span><b>${esc(w || '—')}</b><i class="sa-pts">${p ? '+' + p : '0'}</i>
          ${s.phase === 'review' && k !== me && w && !s.over ? `<button class="sa-vote ${votes.includes(me) ? 'on' : ''}" data-vote="${k}-${ci}">👎${votes.length ? votes.length : ''}</button>` : votes.length ? `<i class="sa-v">👎${votes.length}</i>` : ''}</div>`;
      }).join('')}</div>`).join('');
    el.innerHTML = `${head}
      <div class="status">${s.over ? (s.tie ? '🤝 ¡Empate!' : `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`) : '📝 Corrección: 👎 en lo que no valga'}</div>
      ${s.phase === 'review' ? '<div class="timerbar" data-timer></div>' : ''}
      <div class="stopreview">${table}</div>
      <div class="stoptotal">Esta ronda: ${res.pts.map((p, k) => `<span style="color:${PLAYER_COLORS[k]}">${ctx.avatar(k)} +${p}</span>`).join(' ')}</div>
      ${s.phase === 'review' && !s.ready[me] && ctx.mySeat != null ? '<button class="btn big c2 pulse" data-ready>✅ ¡Listo! Siguiente</button>' : s.phase === 'review' ? '<p class="hint light center">Esperando a los demás…</p>' : ''}
      ${logHTML(s, ctx, 1)}`;
    el.querySelectorAll('[data-vote]').forEach((b) => b.onclick = () => { const [k, ci] = b.dataset.vote.split('-').map(Number); ctx.send({ type: 'vote', k, ci }); });
    const rd = el.querySelector('[data-ready]'); if (rd) rd.onclick = () => ctx.send({ type: 'ready' });
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    if (f.type === 'stop' || f.type === 'timeup') { ctx.sound(f.type === 'stop' ? 'buzz' : 'bad'); fx.screenShake(6); fx.flash('#ffec99'); }
    if (f.type === 'review') { ctx.sound('special'); el.querySelectorAll('.stopans').forEach((a, i) => a.animate([{ transform: 'translateX(-30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: i * 40, fill: 'backwards' })); }
    if (f.type === 'round' || f.type === 'win') {
      const L = el.querySelector('.stopletter b');
      if (L && f.type === 'round') {
        // la letra gira como una ruleta antes de pararse
        let k = 0; const real = L.textContent;
        const spin = setInterval(() => { L.textContent = 'ABCDEFGHIJLMNOPRSTV'[k++ % 19]; ctx.sound('tick'); }, 70);
        await fx.wait(1100); clearInterval(spin); L.textContent = real;
        L.animate([{ transform: 'scale(1.8) rotate(-10deg)' }, { transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.3,1.6,.6,1)' });
        const p = fx.center(L); fx.sparkle(p.x, p.y, '#ffe066', 24, 1.4); ctx.sound('ding');
      }
      (f.pts || []).forEach((p, k) => { const ch = el.querySelector(`[data-chip="${k}"]`); if (ch && p) { const c = fx.center(ch); fx.floatText(c.x, c.y - 10, `+${p}`, '#ffe066', 26); } });
      if (f.type === 'win') fx.fireworksShow(el.getBoundingClientRect(), 6);
    }
  },
};
