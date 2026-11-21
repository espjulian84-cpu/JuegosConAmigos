import domino from './domino.js';
import parchis from './parchis.js';
import oca from './oca.js';
import muros from './muros.js';
import memoria from './memoria.js';
import flota from './flota.js';
import carrera from './carrera.js';
import tres from './tres.js';
import cuatro from './cuatro.js';
import damas from './damas.js';
import ajedrez from './ajedrez.js';
import brisca from './brisca.js';
import mentiroso from './mentiroso.js';
import solitario from './solitario.js';
import poker from './poker.js';
import rumi from './rumi.js';
import stop from './stop.js';
import sabelotodo from './sabelotodo.js';
import dibuja from './dibuja.js';
import ciudad from './ciudad.js';

// Para añadir un juego nuevo: crea su archivo en esta carpeta (mismo formato) y añádelo aquí.
// "cat" agrupa los juegos en el selector.
export const GAME_CATS = [['mesa', '🎲 De mesa'], ['clasicos', '♟️ Clásicos'], ['cartas', '🃏 Cartas'], ['fiesta', '🎉 Fiesta y preguntas']];
export const GAMES = [parchis, domino, oca, ciudad, rumi, flota, muros, memoria, carrera, tres, cuatro, damas, ajedrez, brisca, mentiroso, poker, solitario, sabelotodo, stop, dibuja];
parchis.teams = 'pairs4';
domino.teams = 'pairs4';
carrera.cat = 'fiesta';
memoria.cat = 'fiesta';
export const getGame = (id) => GAMES.find((g) => g.id === id);
