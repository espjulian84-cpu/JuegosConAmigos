import { esc, PLAYER_COLORS, sameTeam } from '../util.js';

// Fila de jugadores (fichas con avatar, nombre y un dato).
export function chipsHTML(s, ctx, info = () => '', turn = s.over ? null : s.turn, extra = () => '') {
  return Array.from({ length: s.n }, (_, i) => `
    <div class="pchip ${i === turn ? 'turn' : ''} ${extra(i)}" style="--pc:${PLAYER_COLORS[i]}" data-chip="${i}">
      <span class="avatar">${ctx.avatar(i)}</span><span class="pname">${esc(ctx.players[i])}</span>
      ${info(i) !== '' ? `<span class="pinfo">${info(i)}</span>` : ''}</div>`).join('');
}

export const logHTML = (s, ctx, k = 2) => `<div class="log">${(s.log || []).slice(0, k).map((l) => `<div>${ctx.fmt(l)}</div>`).join('')}</div>`;

// Ganador por puntos (con equipos se suman); devuelve {winner, tie}
export function bestBy(s, score) {
  const team = (k) => Array.from({ length: s.n }, (_, j) => j).reduce((a, j) => (sameTeam(s, j, k) ? a + score(j) : a), 0);
  let w = 0;
  for (let k = 1; k < s.n; k++) if (team(k) > team(w)) w = k;
  const tie = Array.from({ length: s.n }, (_, k) => k).some((k) => !sameTeam(s, k, w) && team(k) === team(w));
  return { winner: w, tie };
}

export const pick = (a) => a[(Math.random() * a.length) | 0];

// Normaliza un texto para comparar respuestas: sin tildes, minúsculas, sin espacios dobles
export const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, '').replace(/\s+/g, ' ').trim();

// Pinta una casilla de tablero de 2 en raya sencillo con coordenadas
export const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
