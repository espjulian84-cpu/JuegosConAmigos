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
