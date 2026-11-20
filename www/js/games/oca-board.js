// Tablero ilustrado de La Oca: cada casilla es una viñeta de un viaje por las estaciones.
// Dibujos originales en SVG (la oca protagonista y sus posturas) combinados con decorados.

/** Oca dibujada. pose: stand | fly | swim | run | sleep. Mira a la derecha (flip = izquierda). */
export function goose(x, y, size, pose = 'stand', flip = false, extra = '') {
  const legs = pose === 'stand' ? `<path d="M-8 26 v14 l-6 3 M-8 40 l6 3 M4 26 v14 l-6 3 M4 40 l6 3" stroke="#f08c00" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : pose === 'run' ? `<path d="M-6 26 l-10 12 l-6 0 M2 26 l10 12 l6 -2" stroke="#f08c00" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  const wings = pose === 'fly'
    ? `<path d="M-14 4 Q-34 -38 -4 -40 Q-6 -14 6 2 Z" fill="#f1f3f5" stroke="#adb5bd" stroke-width="2"/><path d="M-8 6 Q10 -30 30 -24 Q14 -8 8 8 Z" fill="#fff" stroke="#adb5bd" stroke-width="2"/>`
    : `<path d="M-24 6 Q-2 -6 12 10 Q-6 22 -24 6 Z" fill="#e9ecef" stroke="#adb5bd" stroke-width="2"/>`;
  const head = pose === 'sleep'
    ? `<path d="M14 2 Q30 -4 30 10" stroke="#fff" stroke-width="13" fill="none" stroke-linecap="round"/><circle cx="28" cy="12" r="10" fill="#fff" stroke="#ced4da" stroke-width="2"/><path d="M36 13 L46 16 L36 19 Z" fill="#fd7e14"/><path d="M26 10 q3 2 6 0" stroke="#343a40" stroke-width="2" fill="none"/>`
    : `<path d="M12 4 Q24 -14 18 -30" stroke="#fff" stroke-width="13" fill="none" stroke-linecap="round"/><path d="M12 4 Q24 -14 18 -30" stroke="#ced4da" stroke-width="15" fill="none" stroke-linecap="round" opacity=".35"/><circle cx="20" cy="-33" r="11" fill="#fff" stroke="#ced4da" stroke-width="2"/><path d="M29 -36 L45 -31 L29 -26 Z" fill="#fd7e14" stroke="#e8590c" stroke-width="1.5" stroke-linejoin="round"/><circle cx="23" cy="-36" r="2.6" fill="#212529"/><circle cx="24" cy="-37" r=".9" fill="#fff"/><circle cx="17" cy="-30" r="3" fill="#ffc9c9" opacity=".8"/>`;
  const body = `<ellipse cx="-4" cy="12" rx="30" ry="19" fill="#fff" stroke="#ced4da" stroke-width="2"/><path d="M-32 6 L-42 0 L-36 12 Z" fill="#fff" stroke="#ced4da" stroke-width="2"/>`;
  const water = pose === 'swim' ? `<path d="M-48 22 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 V40 H-48 Z" fill="#4dabf7" opacity=".85"/>` : '';
  return `<g transform="translate(${x} ${y}) scale(${(size / 100) * (flip ? -1 : 1)} ${size / 100})">${legs}${pose === 'fly' ? body + wings : body + wings}${head}${water}${extra}</g>`;
}
export const GOOSE_ICON = `<svg viewBox="-50 -50 100 100" class="goose-svg">${goose(0, 0, 100, 'stand')}</svg>`;
export const GOOSE_FLY = `<svg viewBox="-50 -50 100 100" class="goose-svg">${goose(0, 0, 100, 'fly')}</svg>`;

const E = (t, x, y, s = 26, r = 0) => `<text x="${x}" y="${y}" font-size="${s}" text-anchor="middle" dominant-baseline="central"${r ? ` transform="rotate(${r} ${x} ${y})"` : ''}>${t}</text>`;

// ---------- decorados (coordenadas 0..100) ----------
const BG = {
  meadow: () => `<rect width="100" height="100" fill="url(#skyDay)"/><circle cx="84" cy="16" r="9" fill="#ffd43b"/><path d="M0 68 Q30 54 60 66 T100 60 V100 H0Z" fill="#69db7c"/><path d="M0 80 Q40 70 100 82 V100 H0Z" fill="#51cf66"/>`,
  beach: () => `<rect width="100" height="100" fill="url(#skyDay)"/><circle cx="16" cy="16" r="9" fill="#ffd43b"/><rect y="52" width="100" height="26" fill="#4dabf7"/><path d="M0 56 q6 -4 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0" stroke="#d0ebff" stroke-width="2" fill="none"/><path d="M0 76 Q50 68 100 78 V100 H0Z" fill="#ffe8a1"/>`,
  forest: () => `<rect width="100" height="100" fill="url(#skyAutumn)"/><path d="M0 70 Q50 58 100 70 V100 H0Z" fill="#c08552"/><path d="M0 84 Q50 76 100 86 V100 H0Z" fill="#a0653a"/>`,
  snow: () => `<rect width="100" height="100" fill="url(#skySnow)"/><path d="M0 66 Q35 56 70 64 T100 62 V100 H0Z" fill="#fff" stroke="#dee2e6" stroke-width="1.5"/>${[[12, 14], [40, 8], [70, 22], [88, 10], [24, 36], [60, 40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#fff"/>`).join('')}`,
  night: () => `<rect width="100" height="100" fill="url(#skyNight)"/>${[[10, 12], [30, 30], [52, 10], [74, 26], [90, 14], [20, 52], [82, 48]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 1.2 : 1.8}" fill="#fff"/>`).join('')}<circle cx="78" cy="20" r="10" fill="#fff3bf"/><circle cx="83" cy="17" r="9" fill="url(#skyNight)"/><path d="M0 82 Q50 72 100 84 V100 H0Z" fill="#364fc7"/>`,
  garden: () => `<rect width="100" height="100" fill="url(#skySunset)"/><path d="M0 70 Q50 60 100 70 V100 H0Z" fill="#8ce99a"/>`,
  town: () => `<rect width="100" height="100" fill="url(#skyDay)"/><rect x="4" y="44" width="22" height="40" fill="#ffc9c9"/><rect x="30" y="36" width="18" height="48" fill="#a5d8ff"/><rect x="74" y="48" width="22" height="36" fill="#d8f5a2"/><rect y="82" width="100" height="18" fill="#adb5bd"/>`,
  water: () => `<rect width="100" height="100" fill="url(#skyDay)"/><rect y="58" width="100" height="42" fill="#339af0"/><path d="M0 64 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke="#a5d8ff" stroke-width="3" fill="none"/>`,
};
const THEME = (n) => (n <= 14 ? 'meadow' : n <= 28 ? 'beach' : n <= 40 ? 'forest' : n <= 50 ? 'snow' : n <= 58 ? 'night' : 'garden');
const PROPS = {
  meadow: ['🌼', '🌷', '🦋', '🐝', '🐞', '🌳', '🐰', '🐌', '🍄', '🐣', '🐛', '🌻'],
  beach: ['🐚', '🦀', '⛱️', '🐠', '🐬', '⛵', '🌴', '🍉', '🦑', '🐙', '🏰', '🍦'],
  forest: ['🍂', '🍁', '🍄', '🦔', '🐿️', '🌰', '🦉', '🌲', '🦊', '🍎', '🐻', '🧺'],
  snow: ['⛄', '❄️', '🛷', '🧣', '🌲', '🐧', '☕', '🎿', '🧤', '🦌'],
  night: ['⭐', '🦉', '✨', '🔭', '🚀', '🦇', '🏮', '💫', '🌠'],
  garden: ['🌺', '🌸', '🍰', '🎈', '🎉', '🌹'],
};

// Escenas de las casillas de oca: la oca haciendo cosas
const OCA_SCENE = {
  5: () => goose(48, 60, 52, 'run') + E('🦋', 82, 30, 22, -15),
  9: () => goose(46, 52, 46, 'fly') + `<path d="M64 30 L80 6" stroke="#495057" stroke-width="1.5"/>` + E('🎈', 82, 10, 24),
  14: () => goose(56, 62, 48, 'swim') + E('🐥', 22, 72, 18) + E('🐥', 36, 76, 16),
  18: () => goose(52, 54, 50, 'stand', false, `<text x="20" y="-36" font-size="16" text-anchor="middle" dominant-baseline="central">🕶️</text>`) + E('⛱️', 18, 52, 30),
  23: () => `<ellipse cx="50" cy="74" rx="30" ry="6" fill="#ff922b" stroke="#e8590c" stroke-width="2"/>` + goose(50, 52, 46, 'stand') + E('🌊', 86, 66, 22),
  27: () => goose(50, 34, 44, 'fly') + E('⛵', 30, 66, 26),
  32: () => goose(56, 56, 48, 'stand', true) + E('🧺', 22, 72, 24) + E('🍄', 82, 78, 18),
  36: () => goose(50, 58, 48, 'run') + E('☂️', 60, 18, 30) + `<path d="M8 20 l-4 8 M20 34 l-4 8 M82 30 l-4 8 M92 12 l-4 8" stroke="#74c0fc" stroke-width="2.5" stroke-linecap="round"/>`,
  41: () => goose(40, 56, 48, 'stand', false, `<text x="2" y="2" font-size="22" text-anchor="middle" dominant-baseline="central">🧣</text>`) + E('⛄', 82, 60, 30),
  45: () => goose(50, 50, 48, 'run') + `<path d="M24 80 L52 80 M38 82 L66 82" stroke="#495057" stroke-width="2.5" stroke-linecap="round"/>` + E('❄️', 84, 22, 16),
  50: () => goose(48, 42, 44, 'fly') + E('🎁', 74, 74, 22) + E('❄️', 18, 20, 14),
  54: () => goose(46, 46, 46, 'fly', true) + E('🌙', 18, 18, 20) + E('✨', 82, 72, 18),
  59: () => goose(50, 58, 50, 'stand', false, `<text x="20" y="-52" font-size="22" text-anchor="middle" dominant-baseline="central">👑</text>`) + E('🎉', 18, 26, 20),
};
const SPECIAL_SCENE = {
  6: () => bridge(), 12: () => bridge(true),
  19: () => BG.town() + E('🏨', 60, 50, 40) + goose(28, 70, 34, 'sleep') + E('💤', 30, 40, 16),
  26: () => BG.meadow() + E('🎲', 34, 50, 34, -15) + E('🎲', 70, 62, 30, 20) + goose(70, 30, 26, 'fly'),
  53: () => BG.night() + E('🎲', 34, 50, 34, 15) + E('🎲', 70, 64, 30, -20) + goose(30, 26, 24, 'fly', true),
  31: () => `<rect width="100" height="100" fill="url(#skyAutumn)"/><path d="M0 74 H100 V100 H0Z" fill="#a0653a"/><ellipse cx="50" cy="56" rx="32" ry="10" fill="#1c1c2e"/><path d="M18 56 V84 Q50 96 82 84 V56" fill="#868e96" stroke="#495057" stroke-width="2"/><path d="M18 64 H82 M18 74 H82 M34 56 V84 M50 58 V88 M66 56 V84" stroke="#495057" stroke-width="1.5"/>` + goose(54, 44, 26, 'stand') + E('😱', 78, 24, 16),
  42: () => `<rect width="100" height="100" fill="#d3f9d8"/><path d="M8 8 H92 V92 H8 V24 H76 V76 H24 V40 H60 V60 H40" stroke="#2b8a3e" stroke-width="7" fill="none" stroke-linejoin="round"/>` + goose(50, 52, 22, 'stand') + E('❓', 80, 14, 14),
  56: () => `<rect width="100" height="100" fill="#868e96"/><rect x="0" y="76" width="100" height="24" fill="#495057"/>` + goose(50, 58, 46, 'stand', false, '') + `<g stroke="#343a40" stroke-width="6">${[14, 32, 50, 68, 86].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="100"/>`).join('')}</g><rect width="100" height="8" fill="#343a40"/>`,
  58: () => `<rect width="100" height="100" fill="url(#skyNight)"/>` + E('💀', 50, 50, 54) + E('🦇', 18, 20, 16) + E('🦇', 82, 26, 14),
  63: () => BG.garden() + E('🏰', 50, 40, 46) + goose(22, 74, 30, 'stand') + goose(78, 74, 30, 'stand', true) + E('🎉', 50, 80, 20),
};
function bridge(flip) {
  return BG.water() + `<path d="M0 60 Q50 20 100 60" stroke="#8d5524" stroke-width="10" fill="none"/><path d="M0 60 Q50 20 100 60" stroke="#c08552" stroke-width="5" fill="none"/>${[15, 30, 50, 70, 85].map((x) => `<line x1="${x}" y1="${60 - 40 * (1 - Math.pow((x - 50) / 50, 2)) + 2}" x2="${x}" y2="64" stroke="#8d5524" stroke-width="3"/>`).join('')}` + goose(50, 26, 30, 'run', flip);
}

function cellScene(n) {
  if (SPECIAL_SCENE[n]) return SPECIAL_SCENE[n]();
  const th = THEME(n);
  let out = BG[th]();
  if (OCA_SCENE[n]) return out + OCA_SCENE[n]();
  const P = PROPS[th];
  const a = P[(n * 5) % P.length], b = P[(n * 7 + 3) % P.length];
  out += E(a, 70, 66, 30, (n % 3 - 1) * 10) + E(b, 30, 38, 20);
  if (n % 3 === 0) out += goose(36, 70, 30, n % 2 ? 'run' : 'stand', n % 4 === 0);
  if (n % 3 === 1 && th !== 'night') out += E('🐥', 34, 74, 18);
  return out;
}

const LABEL = { 6: 'PUENTE', 12: 'PUENTE', 19: 'POSADA', 26: 'DADOS', 53: 'DADOS', 31: 'POZO', 42: 'LABERINTO', 56: 'CÁRCEL', 58: 'MUERTE', 63: 'JARDÍN' };

export function buildBoard(CELLS, SPECIAL) {
  const S = 100, I = 13;
  const out = [];
  const pieces = (n, inset) => {
    const [r, c] = CELLS[n];
    const rects = [[c * S + inset, r * S + inset, S - 2 * inset, S - 2 * inset, 14]];
    for (const m of [n - 1, n + 1]) {
      if (m < 0 || m > 63) continue;
      const [r2, c2] = CELLS[m];
      if (r2 === r) rects.push([c2 > c ? c * S + S / 2 : c * S, r * S + inset, S / 2, S - 2 * inset, 0]);
      else rects.push([c * S + inset, r2 > r ? r * S + S / 2 : r * S, S - 2 * inset, S / 2, 0]);
    }
    return rects;
  };
  out.push(`<svg class="ocasvg" viewBox="-14 -14 828 828"><defs>
    <linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#74c0fc"/><stop offset="1" stop-color="#e7f5ff"/></linearGradient>
    <linearGradient id="skyAutumn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc078"/><stop offset="1" stop-color="#fff4e6"/></linearGradient>
    <linearGradient id="skySnow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#91a7ff"/><stop offset="1" stop-color="#edf2ff"/></linearGradient>
    <linearGradient id="skyNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1f5c"/><stop offset="1" stop-color="#5f3dc4"/></linearGradient>
    <linearGradient id="skySunset" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8787"/><stop offset="1" stop-color="#ffe066"/></linearGradient>
    <radialGradient id="grass" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#b2f2bb"/><stop offset="1" stop-color="#40c057"/></radialGradient>
    <pattern id="flowers" width="60" height="60" patternUnits="userSpaceOnUse"><circle cx="10" cy="12" r="3" fill="#fff" opacity=".6"/><circle cx="40" cy="38" r="2.5" fill="#ffe066" opacity=".8"/><circle cx="48" cy="8" r="2" fill="#ffc9c9" opacity=".8"/></pattern>
    <pattern id="check" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#fff"/><rect width="10" height="10" fill="#222"/><rect x="10" y="10" width="10" height="10" fill="#222"/></pattern>
  </defs>
  <rect x="-14" y="-14" width="828" height="828" rx="34" fill="#8d5524"/><rect x="-6" y="-6" width="812" height="812" rx="28" fill="url(#grass)"/><rect x="-6" y="-6" width="812" height="812" rx="28" fill="url(#flowers)"/>`);
  // tira continua: borde y fondo claro
  for (let n = 0; n <= 63; n++) for (const [x, y, w, h, rx] of pieces(n, I - 5)) out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#6f4518"/>`);
  for (let n = 0; n <= 63; n++) for (const [x, y, w, h, rx] of pieces(n, I)) out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#fff8e7"/>`);
  // viñetas
  for (let n = 0; n <= 63; n++) {
    const [r, c] = CELLS[n];
    const x = c * S + I + 3, y = r * S + I + 3, w = S - 2 * I - 6;
    out.push(`<clipPath id="cc${n}"><rect x="${x}" y="${y}" width="${w}" height="${w}" rx="11"/></clipPath>`);
    if (n === 0) {
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="11" fill="url(#check)"/><rect x="${x + 4}" y="${y + w / 2 - 12}" width="${w - 8}" height="24" rx="8" fill="#fff"/><text x="${x + w / 2}" y="${y + w / 2 + 6}" text-anchor="middle" font-size="15" font-weight="800" fill="#222">SALIDA</text>`);
      continue;
    }
    out.push(`<g clip-path="url(#cc${n})"><svg x="${x}" y="${y}" width="${w}" height="${w}" viewBox="0 0 100 100">${cellScene(n)}</svg></g>`);
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="11" fill="none" stroke="#6f4518" stroke-width="2.5"/>`);
    const sp = SPECIAL[n];
    const isOca = sp && sp.name === 'Oca';
    out.push(`<circle cx="${x + 13}" cy="${y + 13}" r="13" fill="${isOca ? '#2f9e44' : sp ? '#e8590c' : '#fff'}" stroke="#6f4518" stroke-width="2"/><text x="${x + 13}" y="${y + 18}" text-anchor="middle" font-size="15" font-weight="800" fill="${sp ? '#fff' : '#5c3d2e'}">${n}</text>`);
    if (LABEL[n]) out.push(`<rect x="${x + 6}" y="${y + w - 17}" width="${w - 12}" height="14" rx="7" fill="rgba(0,0,0,.6)"/><text x="${x + w / 2}" y="${y + w - 6.5}" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" letter-spacing=".5">${LABEL[n]}</text>`);
  }
  // rayitas entre casillas
  for (let n = 0; n < 63; n++) {
    const [r1, c1] = CELLS[n], [r2, c2] = CELLS[n + 1];
    if (r1 === r2) { const xx = Math.max(c1, c2) * S; out.push(`<line x1="${xx}" y1="${r1 * S + I}" x2="${xx}" y2="${r1 * S + S - I}" stroke="#6f4518" stroke-width="2"/>`); }
    else { const yy = Math.max(r1, r2) * S; out.push(`<line x1="${c1 * S + I}" y1="${yy}" x2="${c1 * S + S - I}" y2="${yy}" stroke="#6f4518" stroke-width="2"/>`); }
  }
  out.push('</svg>');
  return out.join('');
}
