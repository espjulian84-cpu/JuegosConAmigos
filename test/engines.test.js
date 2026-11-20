// Simula partidas completas con jugadas aleatorias legales para comprobar que
// ningún motor se cuelga, lanza errores inesperados o rompe sus reglas.
import assert from 'node:assert/strict';
import domino, { sidesFor, canPlayAny } from '../www/js/games/domino.js';
import parchis, { legalMoves } from '../www/js/games/parchis.js';
import oca from '../www/js/games/oca.js';
import muros, { reach, freeSides, N } from '../www/js/games/muros.js';
import { GameError } from '../www/js/util.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function chooseAction(g, s) {
  const t = g.turnOf(s);
  if (g.id === 'domino') {
    if (s.roundOver) return [0, { type: 'nextRound' }];
    const h = s.hands[t];
    const opts = [];
    h.forEach((tile, i) => sidesFor(s, tile).forEach((side) => opts.push({ type: 'play', i, side })));
    if (opts.length) return [t, pick(opts)];
    return [t, { type: s.boneyard.length ? 'draw' : 'pass' }];
  }
  if (g.id === 'parchis') {
    if (s.phase === 'roll') return [t, { type: 'roll' }];
    return [t, { type: 'move', i: pick(legalMoves(s, t, s.steps, s.isBonus)).i }];
  }
  if (g.id === 'oca') return [t, { type: 'roll' }];
  if (g.id === 'muros') {
    if (s.phase === 'place') {
      const free = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!s.pieces.some((ps) => ps.some((p) => p.r === r && p.c === c))) free.push({ r, c });
      return [t, { type: 'place', ...pick(free) }];
    }
    if (s.phase === 'move') {
      const opts = [];
      s.pieces[t].forEach((p, i) => reach(s, p).forEach((q) => { if (freeSides(s, q.r, q.c).length) opts.push({ type: 'move', i, r: q.r, c: q.c }); }));
      return [t, pick(opts)];
    }
    const p = s.pieces[t][s.active.i];
    return [t, { type: 'wall', side: pick(freeSides(s, p.r, p.c)) }];
  }
}

function play(g, n, teams) {
  let s = g.setup(n, { teams });
  for (let k = 0; k < 20000; k++) {
    if (g.isOver(s)) return { s, moves: k };
    const [seat, a] = chooseAction(g, s);
    s = g.action(s, seat, a);
    JSON.stringify(s); // el estado debe ser serializable para enviarlo por red
  }
  throw new Error(`${g.id}: la partida no termina`);
}

let total = 0;
for (const g of [domino, parchis, oca, muros]) {
  for (let n = g.minPlayers; n <= g.maxPlayers; n++) {
    for (let k = 0; k < 150; k++) { const { s } = play(g, n, null); assert.ok(s.winner != null); total++; }
  }
  if (g.teams) {
    for (let k = 0; k < 150; k++) { play(g, 4, [0, 1, 0, 1]); total++; }
  }
}

// Reglas concretas
assert.throws(() => oca.action(oca.setup(2), 1, { type: 'roll' }), GameError, 'no se puede jugar fuera de turno');
{
  const s = parchis.setup(4);
  assert.equal(legalMoves(s, 0, 5, false).length, 4, 'con un 5 se puede sacar cualquier ficha');
  assert.equal(legalMoves(s, 0, 4, false).length, 0, 'sin 5 no se sale de casa');
}
{
  // captura en parchís: ficha roja (asiento 1 con 2 jugadores) delante del amarillo en casilla no segura
  const s = parchis.setup(2);
  s.pieces[0][0] = 0; // amarillo en su salida (13)
  s.pieces[1][0] = 68 - 47 + 15; // rojo (salida 47) en la casilla 15
  s.phase = 'move'; s.steps = 2; s.dieVal = 2;
  const m = legalMoves(s, 0, 2, false).find((x) => x.i === 0);
  assert.ok(m.capture, 'debe comer');
  const after = parchis.action(s, 0, { type: 'move', i: 0 });
  assert.equal(after.pieces[1][0], -1);
  assert.equal(after.steps, 20, 'tras comer se cuentan 20');
}
{
  const s = domino.setup(2);
  assert.equal(s.hands[0].length + s.hands[1].length + s.boneyard.length, 28);
  assert.ok(canPlayAny(s, s.turn), 'la primera ficha siempre se puede poner');
}
console.log(`✅ ${total} partidas simuladas sin errores, reglas comprobadas`);
