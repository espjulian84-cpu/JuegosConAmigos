import { shuffle } from '../util.js';

// ====================== Baraja española (40 cartas) ======================
// Palos: o = oros, c = copas, e = espadas, b = bastos. Números 1-7, 10 sota, 11 caballo, 12 rey.
export const SUITS_ES = ['o', 'c', 'e', 'b'];
export const SUIT_NAME_ES = { o: 'oros', c: 'copas', e: 'espadas', b: 'bastos' };
export const RANKS_ES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
export const RANK_NAME_ES = { 1: 'as', 10: 'sota', 11: 'caballo', 12: 'rey' };
export const nameES = (c) => `${RANK_NAME_ES[c.r] || c.r} de ${SUIT_NAME_ES[c.s]}`;
export const deckES = () => shuffle(SUITS_ES.flatMap((s) => RANKS_ES.map((r) => ({ s, r }))));

const SUIT_COL = { o: '#e0a800', c: '#d6336c', e: '#1c7ed6', b: '#2f9e44' };
// Dibujos originales de los cuatro palos (SVG en una caja de 40x40)
export const SUIT_SVG = {
  o: `<circle cx="20" cy="20" r="16" fill="#ffd43b" stroke="#b8860b" stroke-width="2.5"/><circle cx="20" cy="20" r="10.5" fill="#fcc419" stroke="#b8860b" stroke-width="1.6"/>
      <circle cx="20" cy="20" r="4" fill="#f08c00"/><g stroke="#b8860b" stroke-width="1.4">${Array.from({ length: 8 }, (_, k) => { const a = (k * Math.PI) / 4; return `<line x1="${20 + Math.cos(a) * 5.5}" y1="${20 + Math.sin(a) * 5.5}" x2="${20 + Math.cos(a) * 9}" y2="${20 + Math.sin(a) * 9}"/>`; }).join('')}</g>
      <ellipse cx="14" cy="13" rx="4" ry="2" fill="#fff" opacity=".6"/>`,
  c: `<path d="M8 7 h24 q0 13 -9 16 v6 q5 1 7 5 h-20 q2 -4 7 -5 v-6 q-9 -3 -9 -16z" fill="#f03e3e" stroke="#a61e4d" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="20" cy="7.5" rx="12" ry="2.6" fill="#ffa8a8" stroke="#a61e4d" stroke-width="1.6"/><path d="M12 12 q1 6 5 8" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>
      <circle cx="20" cy="15" r="2.2" fill="#ffd43b"/>`,
  e: `<path d="M20 2 l3.2 6 v20 h-6.4 v-20z" fill="#d0ebff" stroke="#1864ab" stroke-width="1.8" stroke-linejoin="round"/><line x1="20" y1="6" x2="20" y2="27" stroke="#74c0fc" stroke-width="1.4"/>
      <rect x="10" y="27" width="20" height="4" rx="2" fill="#fab005" stroke="#1864ab" stroke-width="1.6"/><rect x="17.6" y="31" width="4.8" height="6" fill="#1971c2"/><circle cx="20" cy="38" r="2.2" fill="#fab005" stroke="#1864ab" stroke-width="1.2"/>`,
  b: `<path d="M16 37 q-2 -14 1 -30 q1 -4 5 -4 q5 1 4 6 q-1 4 -1 8 q2 1 1 4 q-2 2 -2 4 q0 7 1 12z" fill="#8ce99a" stroke="#2b8a3e" stroke-width="2" stroke-linejoin="round"/>
      <path d="M17 7 q4 0 6 3" stroke="#2b8a3e" stroke-width="1.4" fill="none"/><circle cx="23" cy="17" r="1.8" fill="#2b8a3e"/><circle cx="18" cy="24" r="1.6" fill="#2b8a3e"/><circle cx="20" cy="31" r="1.4" fill="#2b8a3e"/>
      <path d="M18 9 q-1 10 0 26" stroke="#fff" stroke-width="1.6" fill="none" opacity=".5"/>`,
};
const suitIcon = (s, size = 22) => `<svg viewBox="0 0 40 40" width="${size}" height="${size}">${SUIT_SVG[s]}</svg>`;
// colocación de los símbolos para los números 1-7 (porcentajes dentro de la carta)
const PIPS = {
  1: [[50, 50]], 2: [[50, 26], [50, 74]], 3: [[50, 22], [50, 50], [50, 78]], 4: [[30, 26], [70, 26], [30, 74], [70, 74]],
  5: [[30, 24], [70, 24], [50, 50], [30, 76], [70, 76]], 6: [[30, 22], [70, 22], [30, 50], [70, 50], [30, 78], [70, 78]],
  7: [[30, 20], [70, 20], [50, 36], [30, 54], [70, 54], [30, 80], [70, 80]],
};
const FIG = { 10: { e: '🧑', t: 'SOTA' }, 11: { e: '🐴', t: 'CABALLO' }, 12: { e: '🤴', t: 'REY' } };

/** Carta española. opts: {back, small, cls, attrs} */
export function cardES(c, opts = {}) {
  const cls = `naipe es ${opts.small ? 'sm' : ''} ${opts.cls || ''}`;
  if (!c || opts.back || c.s == null) return `<div class="${cls} back" ${opts.attrs || ''}><div class="nback es"></div></div>`;
  const col = SUIT_COL[c.s];
  let mid;
  if (c.r <= 7) {
    const big = c.r === 1;
    mid = PIPS[c.r].map(([x, y]) => `<i class="pip" style="left:${x}%;top:${y}%;--ps:${big ? 2.1 : c.r > 5 ? 0.85 : 1}">${suitIcon(c.s, 40)}</i>`).join('');
  } else {
    const f = FIG[c.r];
    mid = `<div class="fig"><span class="fige">${f.e}</span><i class="figs">${suitIcon(c.s, 40)}</i><b>${f.t}</b></div>`;
  }
  return `<div class="${cls}" style="--sc:${col}" ${opts.attrs || ''}><div class="nframe"></div><span class="ncorner tl">${c.r}</span><span class="ncorner br">${c.r}</span>${mid}</div>`;
}

// ====================== Baraja francesa (52 cartas) ======================
export const SUITS_FR = ['♠', '♥', '♦', '♣'];
export const RANK_FR = (r) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r));
export const deckFR = () => shuffle(SUITS_FR.flatMap((s) => Array.from({ length: 13 }, (_, k) => ({ s, r: k + 1 }))));
export const isRed = (s) => s === '♥' || s === '♦';
const FR_FIG = { 11: '🤺', 12: '👸', 13: '🤴' };

/** Carta francesa. r: 1 (as) … 13 (rey); con ace14 el as vale 14. */
export function cardFR(c, opts = {}) {
  const cls = `naipe fr ${opts.small ? 'sm' : ''} ${opts.cls || ''}`;
  if (!c || opts.back || c.s == null) return `<div class="${cls} back" ${opts.attrs || ''}><div class="nback fr"></div></div>`;
  const r = c.r === 14 ? 1 : c.r;
  const lab = RANK_FR(r);
  const red = isRed(c.s);
  const mid = r >= 11 ? `<div class="frfig"><span>${FR_FIG[r]}</span><i>${c.s}</i></div>` : r === 1 ? `<div class="frace">${c.s}</div>` : `<div class="frpips n${r}">${Array.from({ length: r }, () => `<i>${c.s}</i>`).join('')}</div>`;
  return `<div class="${cls} ${red ? 'red' : 'blk'}" ${opts.attrs || ''}><span class="frc tl">${lab}<i>${c.s}</i></span><span class="frc br">${lab}<i>${c.s}</i></span>${mid}</div>`;
}
