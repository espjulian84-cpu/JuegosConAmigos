import domino from './domino.js';
import parchis from './parchis.js';
import oca from './oca.js';
import muros from './muros.js';
import memoria from './memoria.js';
import flota from './flota.js';

// Para añadir un juego nuevo: crea su archivo en esta carpeta (mismo formato) y añádelo aquí.
export const GAMES = [parchis, domino, oca, memoria, flota, muros];
parchis.teams = 'pairs4';
domino.teams = 'pairs4';
export const getGame = (id) => GAMES.find((g) => g.id === id);
