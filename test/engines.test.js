// Simula partidas completas con jugadas aleatorias legales (el "bot" de cada juego) para comprobar
// que ningún motor se cuelga ni lanza errores, que las partidas de ejemplo funcionan y que la
// información oculta no se envía a quien no debe verla.
import assert from 'node:assert/strict';
import { GAMES } from '../www/js/games/index.js';
import parchis, { legalMoves } from '../www/js/games/parchis.js';
import domino, { canPlayAny } from '../www/js/games/domino.js';
import oca from '../www/js/games/oca.js';
import muros, { reach } from '../www/js/games/muros.js';
import { GameError } from '../www/js/util.js';

function step(g, s) {
  // los temporizadores (esconder cartas, tiempo agotado) los dispara "el sistema"
  if (s.timer && (g.turnOf(s) == null || Math.random() < 0.05 || s.phase === 'reveal')) {
    try { return g.action(s, 'sys', s.timer.action); } catch (e) { if (!(e instanceof GameError)) throw e; }
  }
  let seat = g.turnOf(s);
  if (seat == null) seat = 0; // p. ej. "siguiente ronda" del dominó
  return g.action(s, seat, g.bot(s, seat));
}

function play(g, n, teams, options) {
  let s = g.setup(n, { teams, options });
  if (g.realtime) {
    // carrera: todos los coches los conduce la máquina; 30 pasos por segundo
    s.cars.forEach((c) => { c.bot = true; });
    for (let k = 0; k < 30 * 400; k++) {
      g.step(s, {}, 1 / 30);
      if (k % 2 === 0) JSON.stringify(g.snapshot(s));
      if (s.over) { assert.ok(s.order.length === s.n, 'todos clasificados'); return s; }
    }
    throw new Error(`${g.id}: la carrera no termina`);
  }
  for (let k = 0; k < 30000; k++) {
    if (g.isOver(s)) return s;
    s = step(g, s);
    JSON.stringify(s); // el estado debe poder enviarse por la red
  }
  throw new Error(`${g.id}: la partida no termina`);
}

let total = 0;
for (const g of GAMES) {
  const optSets = [{}];
  (g.options || []).forEach((op) => { if (op.type === 'choice') op.choices.forEach((c) => optSets.push({ [op.id]: c.v })); else optSets.push({ [op.id]: !op.def }); });
  for (let n = g.minPlayers; n <= g.maxPlayers; n++) {
    const reps = g.realtime ? 3 : 60;
    for (let k = 0; k < reps; k++) { const s = play(g, n, null, optSets[k % optSets.length]); assert.ok(s.winner != null, `${g.id} sin ganador`); total++; }
  }
  if (g.teams) for (let k = 0; k < 60; k++) { play(g, 4, [0, 1, 0, 1], {}); total++; }
  // partida de ejemplo: todos los pasos deben ser válidos
  if (g.demo) {
    const d = g.demo();
    let s = d.state; s.demo = true;
    for (const st of d.steps) {
      if (st.patch) st.patch(s);
      if (st.a) { s = g.action(s, st.seat, st.a); while (s.timer && s.phase === 'reveal') s = g.action(s, 'sys', s.timer.action); }
    }
  }
  // información oculta
  if (g.viewFor) {
    let s = g.setup(g.maxPlayers, {});
    const v = g.viewFor(s, 0);
    const txt = JSON.stringify(v);
    if (g.id === 'domino') assert.ok(v.hands[1].every((t) => t === null), 'el dominó no debe enviar fichas ajenas');
    if (g.id === 'flota') assert.equal(v.fleets[1].length, 0, 'la flota enemiga no debe enviarse');
    if (g.id === 'memoria') assert.ok(v.cards.every((c) => c.f === null), 'las cartas tapadas no deben enviarse');
    assert.ok(txt.length > 10);
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
  const s = domino.setup(2);
  assert.equal(s.hands[0].length + s.hands[1].length + s.boneyard.length, 28);
  assert.ok(canPlayAny(s, s.turn), 'la primera ficha siempre se puede poner');
}
{
  // Muros: la cuadrada va recta 1-2, la redonda en L
  const s = muros.setup(2);
  s.pieces = [[{ r: 3, c: 3, t: 'sq' }, { r: 0, c: 0, t: 'rd' }], [{ r: 6, c: 6, t: 'sq' }, { r: 6, c: 0, t: 'rd' }]];
  const sq = reach(s, s.pieces[0][0]).map((q) => `${q.r},${q.c}`).sort();
  assert.deepEqual(sq, ['1,3', '2,3', '3,1', '3,2', '3,3', '3,4', '3,5', '4,3', '5,3'].sort());
  const rd = reach(s, { r: 3, c: 3, t: 'rd' }).map((q) => `${q.r},${q.c}`).sort();
  assert.deepEqual(rd, ['2,2', '2,4', '3,3', '4,2', '4,4'].sort());
}
console.log(`✅ ${total} partidas simuladas de ${GAMES.length} juegos sin errores; ejemplos, reglas e información oculta comprobados`);
