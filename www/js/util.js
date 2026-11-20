export const clone = (o) => JSON.parse(JSON.stringify(o));
export const rnd = (n) => Math.floor(Math.random() * n);
export const die = () => 1 + rnd(6);
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fbc02d', '#8e24aa', '#fb8c00'];
export function pushLog(s, msg) {
  s.log = s.log || [];
  s.log.unshift(msg);
  if (s.log.length > 6) s.log.length = 6;
}
export class GameError extends Error {}
export const fail = (msg) => { throw new GameError(msg); };
// Equipos: s.teams es un array (equipo por asiento) o null
export const sameTeam = (s, a, b) => a === b || (!!s.teams && s.teams[a] === s.teams[b]);
export const TEAM_NAMES = ['Equipo Sol', 'Equipo Luna', 'Equipo Estrella'];
export const TEAM_EMOJI = ['☀️', '🌙', '⭐'];
export const TEAM_COLORS = ['#ff7043', '#5c6bc0', '#26a69a'];

// ---------- Dado en 3D (cubo con seis caras de puntos) ----------
const PIP_POS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const face = (n) => `<div class="face f${n}">${Array.from({ length: 9 }, (_, k) => `<i class="${PIP_POS[n].includes(k) ? 'pip' : ''}"></i>`).join('')}</div>`;
// giro del cubo para que la cara "v" quede mirando al frente
export const CUBE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
export function diceCubeHTML(v = 1) {
  const [rx, ry] = CUBE_ROT[v] || [0, 0];
  return `<div class="cube" style="--rx:${rx}deg;--ry:${ry}deg">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div>`;
}

// ---------- Tirada inicial: empieza quien saque el número más alto ----------
export function firstRollSetup(n) {
  return { rolls: Array(n).fill(null), contenders: [...Array(n).keys()], round: 1 };
}
/** Aplica la tirada inicial de "seat". Devuelve el ganador si ya se sabe quién empieza, o null. */
export function firstRollStep(s, seat, d) {
  const f = s.first;
  if (!f.contenders.includes(seat) || f.rolls[seat] != null) return null;
  f.rolls[seat] = d;
  pushLog(s, `{${seat}} saca un ${d} en la tirada inicial`);
  const pending = f.contenders.filter((k) => f.rolls[k] == null);
  if (pending.length) { s.turn = pending[0]; return null; }
  const max = Math.max(...f.contenders.map((k) => f.rolls[k]));
  const top = f.contenders.filter((k) => f.rolls[k] === max);
  if (top.length === 1) { s.first = null; s.turn = top[0]; s.firstWinner = { seat: top[0], d: max }; return top[0]; }
  pushLog(s, `¡Empate a ${max}! Vuelven a tirar`);
  f.contenders = top; f.round++;
  top.forEach((k) => { f.rolls[k] = null; });
  s.turn = top[0];
  s.fx = { id: s.v, type: 'special', text: `¡Empate a ${max}! Desempatan`, emoji: '⚖️' };
  return null;
}
