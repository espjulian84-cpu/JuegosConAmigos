// Estilos de ficha (dibujos originales en SVG): peón, chapa de botellín, canica, gominola y tazo.
let uid = 0;
export const PIECE_CHOICES = [
  { v: 'peon', label: '♟️ Peón' }, { v: 'chapa', label: '🍾 Chapas' }, { v: 'canica', label: '🔮 Canicas' },
  { v: 'gominola', label: '🍬 Gominolas' }, { v: 'tazo', label: '💿 Tazos' },
];

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/** Devuelve un SVG (viewBox -50 -50 100 100) de la ficha. inner = emoji opcional (avatar). */
export function pieceSVG(style, color, inner = '') {
  const id = 'pc' + uid++;
  const dark = shade(color, -0.45), light = shade(color, 0.55);
  const emoji = inner ? `<text y="3" font-size="40" text-anchor="middle" dominant-baseline="central">${inner}</text>` : '';
  if (style === 'chapa') {
    // chapa: borde ondulado metálico (21 dientes), cara pintada y un aro
    let teeth = '';
    for (let k = 0; k < 42; k++) { const a = (k / 42) * Math.PI * 2, r = k % 2 ? 42 : 46; teeth += `${k ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`; }
    return `<svg viewBox="-50 -50 100 100" class="piece"><defs>
      <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8f9fa"/><stop offset=".45" stop-color="#adb5bd"/><stop offset="1" stop-color="#495057"/></linearGradient>
      <radialGradient id="${id}f" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${light}"/><stop offset=".6" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>
      <ellipse cx="2" cy="8" rx="44" ry="42" fill="rgba(0,0,0,.35)"/>
      <path d="${teeth}Z" fill="url(#${id}m)" stroke="#495057" stroke-width="1.5"/>
      <circle r="36" fill="url(#${id}f)" stroke="${dark}" stroke-width="2"/>
      <circle r="27" fill="none" stroke="#fff" stroke-width="3" opacity=".7" stroke-dasharray="5 3"/>
      ${emoji || `<path d="M0 -15 L4.4 -4.5 L15 -4.5 L6.5 2.5 L9.5 13 L0 6.8 L-9.5 13 L-6.5 2.5 L-15 -4.5 L-4.4 -4.5Z" fill="#fff" opacity=".9"/>`}
      <ellipse cx="-14" cy="-20" rx="14" ry="7" fill="#fff" opacity=".35" transform="rotate(-30 -14 -20)"/></svg>`;
  }
  if (style === 'canica') {
    return `<svg viewBox="-50 -50 100 100" class="piece"><defs>
      <radialGradient id="${id}g" cx="38%" cy="32%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="${light}" stop-opacity=".55"/><stop offset=".8" stop-color="${color}" stop-opacity=".75"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>
      <ellipse cx="4" cy="40" rx="30" ry="7" fill="rgba(0,0,0,.3)"/>
      <circle r="38" fill="url(#${id}g)" stroke="${dark}" stroke-width="1.5"/>
      <path d="M-24 10 C-10 -20 10 20 26 -8" stroke="${dark}" stroke-width="7" fill="none" opacity=".6" stroke-linecap="round"/>
      <path d="M-20 -6 C-4 18 12 -18 24 10" stroke="#fff" stroke-width="4" fill="none" opacity=".5" stroke-linecap="round"/>
      ${inner ? `<text y="3" font-size="30" text-anchor="middle" dominant-baseline="central" opacity=".9">${inner}</text>` : ''}
      <ellipse cx="-13" cy="-18" rx="11" ry="7" fill="#fff" opacity=".85" transform="rotate(-35 -13 -18)"/><circle cx="16" cy="18" r="4" fill="#fff" opacity=".35"/></svg>`;
  }
  if (style === 'gominola') {
    // gominola: gota blandita translúcida con azúcar
    const sugar = [[-14, -12], [8, -18], [16, 4], [-6, 10], [-18, 12], [6, 22], [20, -6]].map(([x, y]) => `<rect x="${x}" y="${y}" width="3" height="3" rx=".6" fill="#fff" opacity=".85" transform="rotate(${x * 7} ${x} ${y})"/>`).join('');
    return `<svg viewBox="-50 -50 100 100" class="piece"><defs>
      <radialGradient id="${id}j" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="${light}" stop-opacity=".95"/><stop offset=".7" stop-color="${color}" stop-opacity=".85"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>
      <ellipse cx="0" cy="40" rx="34" ry="7" fill="rgba(0,0,0,.28)"/>
      <path d="M0 -40 C24 -40 38 -14 38 10 C38 32 22 40 0 40 C-22 40 -38 32 -38 10 C-38 -14 -24 -40 0 -40Z" fill="url(#${id}j)" stroke="${dark}" stroke-width="2"/>
      ${emoji ? `<g transform="translate(0 4) scale(.8)">${emoji}</g>` : ''}${sugar}
      <path d="M-22 -14 C-18 -28 -6 -32 4 -32" stroke="#fff" stroke-width="6" fill="none" opacity=".7" stroke-linecap="round"/></svg>`;
  }
  if (style === 'tazo') {
    return `<svg viewBox="-50 -50 100 100" class="piece"><defs>
      <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8787"/><stop offset=".25" stop-color="#ffd43b"/><stop offset=".5" stop-color="#69db7c"/><stop offset=".75" stop-color="#4dabf7"/><stop offset="1" stop-color="#da77f2"/></linearGradient></defs>
      <ellipse cx="0" cy="10" rx="44" ry="40" fill="rgba(0,0,0,.35)"/>
      <circle r="44" fill="url(#${id}h)"/><circle r="36" fill="${color}" stroke="#fff" stroke-width="3"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<circle cx="${Math.cos(a * Math.PI / 180) * 40}" cy="${Math.sin(a * Math.PI / 180) * 40}" r="2.5" fill="#fff"/>`).join('')}
      ${emoji || `<circle r="14" fill="#fff" opacity=".8"/>`}
      <path d="M-30 -20 A36 36 0 0 1 -10 -34" stroke="#fff" stroke-width="5" fill="none" opacity=".6" stroke-linecap="round"/></svg>`;
  }
  return null; // 'peon': cada juego usa su peón
}
