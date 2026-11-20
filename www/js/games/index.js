import domino from './domino.js';
import parchis from './parchis.js';
import oca from './oca.js';
import muros from './muros.js';

// Para añadir un juego nuevo: crea su archivo en esta carpeta (mismo formato) y añádelo aquí.
export const GAMES = [parchis, domino, oca, muros];
parchis.teams = 'pairs4';
domino.teams = 'pairs4';
export const getGame = (id) => GAMES.find((g) => g.id === id);
