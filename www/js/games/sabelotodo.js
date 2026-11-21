import { clone, fail, pushLog, esc, shuffle, die, PLAYER_COLORS, diceCubeHTML, sameTeam } from '../util.js';
import { chipsHTML, logHTML } from './common.js';
import { QCATS, QUESTIONS } from './preguntas.js';

// Sabelotodo: tira el dado, muévete por la rueda y acierta preguntas. En las casillas estrella ganas la estrella
// de esa categoría. Gana quien consiga antes las estrellas pedidas.
const RING = 24;
const SQUARES = Array.from({ length: RING }, (_, i) => {
  if (i % 4 === 0) return { cat: i / 4, star: true };
  if (i === 2 || i === 14) return { again: true };
  return { cat: (i * 5 + 1) % 6 };
});

function teamStars(s, seat) {
  const set = new Set();
  s.stars.forEach((st, k) => { if (sameTeam(s, k, seat)) st.forEach((c) => set.add(c)); });
  return [...set];
}
function ask(s, cat) {
  const pool = QUESTIONS[QCATS[cat].id];
  let free = pool.map((_, i) => i).filter((i) => !s.used[cat].includes(i));
  if (!free.length) { s.used[cat] = []; free = pool.map((_, i) => i); }
  const qi = free[(Math.random() * free.length) | 0];
  s.used[cat].push(qi);
  const [text, ok, ...bad] = pool[qi];
  const opts = shuffle([ok, ...bad]);
  s.q = { cat, text, opts, ans: opts.indexOf(ok), picked: null };
  s.phase = 'ask';
  s.timer = { id: `q${s.v}`, ms: s.qMs, action: { type: 'timeout', v: s.v } };
}
function nextPlayer(s) {
  s.turn = (s.turn + 1) % s.n;
  s.phase = 'roll'; s.q = null; s.dests = null; s.timer = null;
}

export default {
  id: 'sabelotodo',
  name: 'Sabelotodo',
  icon: '🧠',
  color: '#5f3dc4',
  cat: 'fiesta',
  minPlayers: 2,
  maxPlayers: 6,
  teams: 'any',
  moveSound: 'move',
  blurb: 'Preguntas de geografía, cine, historia, ciencia, deportes y arte. ¡Consigue las estrellas de colores!',
  options: [
    { id: 'goal', label: '⭐ Estrellas para ganar', type: 'choice', def: 4, choices: [{ v: 3, label: '3 (rápida)' }, { v: 4, label: '4' }, { v: 6, label: '6 (todas)' }] },
    { id: 'time', label: '⏱️ Tiempo para contestar', type: 'choice', def: 25, choices: [{ v: 15, label: '15 s' }, { v: 25, label: '25 s' }, { v: 45, label: '45 s' }] },
  ],
  rules: `<ol>
    <li>Tira el dado y elige hacia qué lado moverte por la rueda.</li>
    <li>El color de la casilla dice la <b>categoría</b> de tu pregunta: ${QCATS.map((c) => `${c.emoji} ${c.name}`).join(', ')}.</li>
    <li>Elige la respuesta correcta entre 4 antes de que se acabe el tiempo.</li>
    <li>Si aciertas, <b>vuelves a tirar</b>. Si fallas, le toca al siguiente.</li>
    <li>En las casillas grandes con <b>⭐</b>, si aciertas te llevas la estrella de ese color.</li>
    <li>🎲 Casilla de dado: tiras otra vez.</li>
    <li>Gana quien junte antes las estrellas pedidas (por equipos se juntan las del equipo).</li></ol>`,

  setup(n, opts = {}) {
    const o = opts.options || {};
    return { n, pos: Array(n).fill(0), stars: Array.from({ length: n }, () => []), turn: 0, phase: 'roll', goal: o.goal || 4, qMs: (o.time || 25) * 1000, used: QCATS.map(() => []), v: 0, teams: opts.teams || null, log: ['¡Que empiecen las preguntas!'], q: null, dieVal: 5 };
  },
  turnOf: (s) => (s.over ? null : s.turn),
  isOver: (s) => !!s.over,
  viewFor(s) {
    return s.q && s.phase === 'ask' ? { ...s, q: { ...s.q, ans: null } } : s;
  },

  action(st, seat, a) {
    const s = clone(st);
    s.v++; s.fx = null;
    if (s.over) fail('La partida ha terminado');
    if (seat === 'sys') {
      if (a.type === 'timeout' && s.phase === 'ask') {
        pushLog(s, `⏰ A {${s.turn}} se le acaba el tiempo`);
        s.q.picked = -1; s.phase = 'result';
        s.fx = { id: s.v, type: 'wrong', seat: s.turn, text: '¡Se acabó el tiempo!', emoji: '⏰' };
        s.timer = { id: `n${s.v}`, ms: 2600, action: { type: 'next' } };
        s.resultOk = false;
        return s;
      }
      if (a.type === 'next' && s.phase === 'result') {
        if (s.resultOk) { s.phase = 'roll'; s.q = null; s.timer = null; } else nextPlayer(s);
        return s;
      }
      fail('Temporizador caducado');
    }
    if (seat !== s.turn) fail('No es tu turno');
    if (a.type === 'roll') {
      if (s.phase !== 'roll') fail('Ahora no toca tirar');
      const d = die();
      s.dieVal = d; s.rollId = s.v;
      const p = s.pos[seat];
      s.dests = [...new Set([(p + d) % RING, (p - d + RING) % RING])];
      s.phase = 'move';
      pushLog(s, `{${seat}} saca un ${d}`);
      return s;
    }
    if (a.type === 'move') {
      if (s.phase !== 'move' || !s.dests.includes(a.to)) fail('Ahí no puedes ir');
      const from = s.pos[seat];
      s.pos[seat] = a.to;
      const sq = SQUARES[a.to];
      const fwd = (a.to - from + RING) % RING === s.dieVal;
      s.fx = { id: s.v, type: 'move', seat, from, to: a.to, dir: fwd ? 1 : -1, steps: s.dieVal, noFlip: [`tok${seat}`] };
      if (sq.again) {
        s.phase = 'roll'; s.dests = null;
        s.fx.text = '¡Tira otra vez!'; s.fx.emoji = '🎲'; s.fx.bannerDelay = 200 + s.dieVal * 120;
        return s;
      }
      ask(s, sq.cat);
      s.fx.ask = true;
      return s;
    }
    if (a.type === 'answer') {
      if (s.phase !== 'ask') fail('No hay pregunta');
      const ok = a.i === s.q.ans;
      s.q.picked = a.i;
      s.phase = 'result';
      s.resultOk = ok;
      s.timer = { id: `n${s.v}`, ms: ok ? 2200 : 3000, action: { type: 'next' } };
      const sq = SQUARES[s.pos[seat]];
      const cat = QCATS[s.q.cat];
      if (ok) {
        pushLog(s, `✅ {${seat}} acierta (${cat.name})`);
        s.fx = { id: s.v, type: 'right', seat, i: a.i };
        if (sq.star && !teamStars(s, seat).includes(sq.cat)) {
          s.stars[seat].push(sq.cat);
          s.fx = { id: s.v, type: 'star', seat, i: a.i, cat: sq.cat, text: `¡Estrella de ${cat.name}!`, emoji: '⭐', bannerDelay: 500 };
          if (teamStars(s, seat).length >= s.goal) {
            s.over = true; s.winner = seat; s.timer = null;
            s.fx = { ...s.fx, type: 'win', text: '¡{' + seat + '} es un Sabelotodo!', emoji: '🧠', bannerDelay: 900 };
            pushLog(s, `🏆 {${seat}} gana`);
          }
        }
      } else {
        pushLog(s, `❌ {${seat}} falla: era "${s.q.opts[s.q.ans]}"`);
        s.fx = { id: s.v, type: 'wrong', seat, i: a.i };
      }
      return s;
    }
    fail('Acción desconocida');
  },

  bot(s, seat) {
    if (s.phase === 'roll') return { type: 'roll' };
    if (s.phase === 'move') {
      // prefiere una estrella que no tenga, luego cualquier pregunta
      const mine = teamStars(s, seat);
      const score = (d) => { const q = SQUARES[d]; return q.star && !mine.includes(q.cat) ? 3 : q.again ? 2 : 1; };
      const best = s.dests.slice().sort((x, y) => score(y) - score(x))[0];
      return { type: 'move', to: best };
    }
    if (s.phase === 'ask') {
      const smart = Math.random() < 0.62;
      return { type: 'answer', i: smart && s.q.ans != null ? s.q.ans : (Math.random() * 4) | 0 };
    }
    return null;
  },
  botDelay: (s) => (s.phase === 'ask' ? 2500 + Math.random() * 3000 : 1100),

  demo() {
    const s = this.setup(2, { options: { goal: 1 } });
    s.pos = [2, 0];
    return { state: s, steps: [
      { say: 'Ana tira el dado…', seat: 0, a: { type: 'roll' }, wait: 2400 },
      { say: 'Puede ir hacia un lado u otro. Elige la casilla grande con estrella ⭐.', seat: 0, patch: (st) => { st.dieVal = 2; st.dests = [4, 0]; }, a: { type: 'move', to: 4 }, wait: 2400 },
      { say: 'Le sale una pregunta de esa categoría: cuatro respuestas y tiempo limitado.', wait: 2800 },
      { say: '¡Acierta! Se lleva la estrella. Con las estrellas pedidas, ¡gana!', seat: 0, patch: (st) => { const ok = st.q.opts[st.q.ans]; st.q.opts = [ok, ...st.q.opts.filter((o) => o !== ok)]; st.q.ans = 0; }, a: { type: 'answer', i: 0 }, wait: 3500 },
    ] };
  },

  render(el, s, ctx) {
    const me = ctx.mySeat;
    const myTurn = me === s.turn && !s.over;
    const size = 100;
    const R = 41;
    const sqHTML = SQUARES.map((q, i) => {
      const ang = (i / RING) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + Math.cos(ang) * R, y = 50 + Math.sin(ang) * R;
      const c = q.again ? '#495057' : QCATS[q.cat].color;
      const dest = myTurn && s.phase === 'move' && s.dests.includes(i);
      return `<button class="sbsq ${q.star ? 'star' : ''} ${dest ? 'dest' : ''}" data-sq="${i}" style="left:${x}%;top:${y}%;--c:${c}" ${dest ? '' : 'tabindex="-1"'}>${q.star ? '⭐' : q.again ? '🎲' : QCATS[q.cat].emoji}</button>`;
    }).join('');
    // fichas: varias en la misma casilla se reparten un poco
    const toks = s.pos.map((p, k) => {
      const same = s.pos.slice(0, k).filter((x) => x === p).length;
      const ang = (p / RING) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + Math.cos(ang) * (R - 9 - same * 5), y = 50 + Math.sin(ang) * (R - 9 - same * 5);
      return `<div class="sbtok ${k === s.turn ? 'turn' : ''}" data-flip="tok${k}" data-tok="${k}" style="left:${x}%;top:${y}%;--pc:${PLAYER_COLORS[k]}">${ctx.avatar(k)}</div>`;
    }).join('');
    let center;
    if (s.q && (s.phase === 'ask' || s.phase === 'result')) {
      const cat = QCATS[s.q.cat];
      const canAnswer = myTurn && s.phase === 'ask';
      center = `<div class="sbq" style="--c:${cat.color}">
        <div class="sbqcat">${cat.emoji} ${cat.name}</div>
        <div class="sbqtext">${esc(s.q.text)}</div>
        ${s.phase === 'ask' ? '<div class="timerbar" data-timer></div>' : ''}
        <div class="sbopts">${s.q.opts.map((o, i) => {
          let cls = '';
          if (s.phase === 'result') { if (i === s.q.ans) cls = 'right'; else if (i === s.q.picked) cls = 'wrong'; }
          return `<button class="sbopt ${cls} ${canAnswer ? 'can' : ''}" data-ans="${i}" ${canAnswer ? '' : 'disabled'}><b>${'ABCD'[i]}</b> ${esc(o)}</button>`;
        }).join('')}</div></div>`;
    } else {
      center = `<div class="sbcenter"><button class="die3d" data-roll ${myTurn && s.phase === 'roll' ? '' : 'disabled'} style="--c:${PLAYER_COLORS[s.turn]}">${diceCubeHTML(s.dieVal || 5)}</button>
        <small>${myTurn && s.phase === 'move' ? '👆 Elige casilla' : ''}</small></div>`;
    }
    const starRow = (k) => QCATS.map((c, ci) => `<i class="sbstar ${s.stars[k].includes(ci) ? 'on' : ''}" style="--c:${c.color}"></i>`).join('');
    let status;
    if (s.over) status = `🏆 ¡Gana ${ctx.winnerName(s.winner)}!`;
    else if (myTurn) status = s.phase === 'roll' ? '👉 ¡Te toca! Tira el dado' : s.phase === 'move' ? '👉 Elige hacia dónde moverte' : s.phase === 'ask' ? '🤔 ¡Contesta!' : s.resultOk ? '✅ ¡Bien! Vuelves a tirar' : '❌ Fallaste';
    else status = `Turno de <b>${esc(ctx.players[s.turn])}</b>`;
    el.innerHTML = `
      <div class="players">${chipsHTML(s, ctx, (i) => `<span class="sbstars">${starRow(i)}</span>`)}</div>
      <div class="status">${status}</div>
      <div class="sbwrap"><div class="sbboard" style="--sz:${size}">${sqHTML}${toks}<div class="sbmid">${s.phase === 'ask' || s.phase === 'result' ? '' : center}</div></div></div>
      ${s.phase === 'ask' || s.phase === 'result' ? center : ''}
      <p class="hint light center">⭐ Necesitas ${s.goal} estrellas</p>
      ${logHTML(s, ctx, 2)}`;
    const rb = el.querySelector('[data-roll]'); if (rb && !rb.disabled) rb.onclick = () => ctx.send({ type: 'roll' });
    el.querySelectorAll('.sbsq.dest').forEach((b) => b.onclick = () => ctx.send({ type: 'move', to: +b.dataset.sq }));
    el.querySelectorAll('.sbopt.can').forEach((b) => b.onclick = () => ctx.send({ type: 'answer', i: +b.dataset.ans }));
  },

  async animate(f, el, ctx) {
    const { fx } = ctx;
    if (f.type === 'move') {
      const tok = el.querySelector(`[data-tok="${f.seat}"]`);
      const board = el.querySelector('.sbboard');
      if (tok && board) {
        const br = board.getBoundingClientRect();
        const R = 41 - 9;
        const frames = [];
        for (let k = 0; k <= f.steps; k++) {
          const p = (f.from + f.dir * k + RING) % RING;
          const ang = (p / RING) * Math.PI * 2 - Math.PI / 2;
          const end = (f.to / RING) * Math.PI * 2 - Math.PI / 2;
          const dx = (Math.cos(ang) - Math.cos(end)) * R / 100 * br.width, dy = (Math.sin(ang) - Math.sin(end)) * R / 100 * br.height;
          frames.push({ transform: `translate(${dx}px, ${dy}px) scale(1)` });
          if (k < f.steps) frames.push({ transform: `translate(${dx}px, ${dy - 14}px) scale(1.15)` });
        }
        for (let k = 0; k < f.steps; k++) setTimeout(() => ctx.sound('move'), k * 160);
        await tok.animate(frames, { duration: 160 * f.steps + 100, easing: 'linear' }).finished.catch(() => {});
        const p = fx.center(tok); fx.dust(p.x, p.y + 10, 30, 'rgba(255,255,255,.8)');
      }
      if (f.ask) {
        const q = el.querySelector('.sbq');
        if (q) q.animate([{ transform: 'rotateX(90deg) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.3,1.4,.6,1)' });
        ctx.sound('whoosh');
      }
    }
    if (f.type === 'right' || f.type === 'star' || f.type === 'win') {
      const b = el.querySelector(`[data-ans="${f.i}"]`) || el.querySelector('.sbopt.right');
      ctx.sound('ding');
      if (b) { const p = fx.center(b); fx.sparkle(p.x, p.y, '#69db7c', 22, 1.4); b.animate([{ transform: 'scale(1.1)' }, { transform: 'none' }], { duration: 300, iterations: 2 }); }
      if (f.type !== 'right') {
        const chip = el.querySelector(`[data-chip="${f.seat}"] .sbstar:nth-child(${f.cat + 1})`) || el.querySelector(`[data-chip="${f.seat}"]`);
        if (b && chip) {
          await fx.wait(300);
          await fx.fly(`<div class="flystar" style="--c:${QCATS[f.cat].color}">⭐</div>`, fx.center(b), fx.center(chip), { size: 56, arc: 140, duration: 900, spin: 1 });
          const p = fx.center(chip); fx.sparkle(p.x, p.y, QCATS[f.cat].color, 26, 1.5); ctx.sound('special');
        }
      }
      if (f.type === 'win') fx.fireworksShow(el.getBoundingClientRect(), 8);
    }
    if (f.type === 'wrong') {
      ctx.sound('buzz');
      const b = el.querySelector('.sbopt.wrong');
      if (b) { fx.shake(b); const p = fx.center(b); fx.burst(p.x, p.y, { color: '#ff6b6b', n: 14 }); }
      const r = el.querySelector('.sbopt.right');
      if (r) r.animate([{ boxShadow: '0 0 0 0 #69db7c' }, { boxShadow: '0 0 0 8px #69db7c88' }, { boxShadow: '0 0 0 0 #69db7c' }], { duration: 600, iterations: 2 });
    }
  },
};
