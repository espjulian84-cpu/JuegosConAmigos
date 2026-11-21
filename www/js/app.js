// Juegos con Amigos — capa de aplicación: pantallas, salas, amigos, invitaciones.
// El móvil que crea la sala es el "anfitrión": aplica las reglas (motores en games/)
// y reparte el estado a los demás. Los demás solo envían sus jugadas.

import { GAMES, getGame, GAME_CATS } from './games/index.js';
import * as net from './net.js';
import * as sound from './sound.js';
import * as fx from './fx.js';
import { esc, PLAYER_COLORS, TEAM_NAMES, TEAM_EMOJI, TEAM_COLORS, GameError } from './util.js';
import { qrcode } from '../vendor/qrcode.mjs';
import { VERSION } from './version.js';

const DOWNLOAD_URL = 'https://github.com/espjulian84-cpu/JuegosConAmigos/releases/latest/download/JuegosConAmigos.apk';
const AVATARS = ['🦊', '🐼', '🐸', '🐯', '🐵', '🐰', '🦄', '🐙', '🐨', '🦁', '🐷', '🐮', '🐔', '🐧', '🐲', '🦖', '👽', '🤖', '🐶', '🐱', '🦉', '🐢', '🦋', '🐝'];
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const randCode = (n) => Array.from({ length: n }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const MAX_PLAYERS = 6;

// ---------- almacenamiento ----------
const params = new URLSearchParams(location.search);
const TEST = params.has('pid'); // pruebas con varias pestañas: no se guarda nada
const LS = {
  get(k, d) { try { const v = localStorage.getItem('jca.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { if (TEST) return; try { localStorage.setItem('jca.' + k, JSON.stringify(v)); } catch {} },
};
let me = LS.get('me', null);
if (!me) { me = { pid: randCode(6), name: '', avatar: AVATARS[Math.floor(Math.random() * 8)] }; LS.set('me', me); }
if (TEST) me = { pid: params.get('pid'), name: params.get('name') || 'Test', avatar: AVATARS[params.get('pid').charCodeAt(0) % AVATARS.length] };
const saveMe = () => LS.set('me', me);
let friends = LS.get('friends', []);
let wishlist = LS.get('wishlist', []);
const saveFriends = () => LS.set('friends', friends);

function upsertFriend(p) {
  if (!p || !p.pid || p.bot || p.pid === me.pid || p.pid.startsWith('L')) return;
  const f = friends.find((x) => x.pid === p.pid);
  if (f) { f.name = p.name || f.name; f.avatar = p.avatar || f.avatar; f.last = Date.now(); }
  else friends.unshift({ pid: p.pid, name: p.name || 'Amigo', avatar: p.avatar || '🙂', last: Date.now() });
  saveFriends();
}

// ---------- estado ----------
const S = {
  tab: 'play', screen: 'home', mode: null, room: null, host: null, conn: null,
  ui: {}, lastFx: null, wasMine: false, lastV: null,
  connPid: new Map(), lastSeen: new Map(), lastMsg: 0, reconnecting: false, modal: null,
};
const app = document.getElementById('app');

// ---------- utilidades de UI ----------
let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
  }
}
function inviteText(code) {
  const g = S.room && getGame(S.room.sel);
  return `🎲 ¡${me.name} te invita a jugar${g ? ' al ' + g.name : ''}! Abre Juegos con Amigos, pulsa "Unirme" y escribe el código ${code}. ¿No tienes la app? Descárgala aquí: ${DOWNLOAD_URL}`;
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}

// ======================================================================
//  ANFITRIÓN
// ======================================================================
async function createRoom() {
  if (!checkName()) return;
  S.screen = 'connecting'; render();
  for (let k = 0; k < 4; k++) {
    const code = randCode(4);
    try {
      S.host = await net.hostRoom(code, { onConn: () => {}, onMsg: hostMsg, onClose: hostClose, onError: (e) => console.warn(e) });
      S.mode = 'host';
      S.room = { code, hostPid: me.pid, hostV: VERSION, players: [{ ...me, online: true, v: VERSION }], sel: GAMES[0].id, teamMode: false, teams: {}, opts: {}, gameId: null, seats: null, state: null, gameNo: 0 };
      S.screen = 'lobby'; keepAwake(true); render();
      return;
    } catch (e) {
      if (e && e.type === 'unavailable-id') continue;
      S.screen = 'home'; render(); toast(net.errorText(e)); return;
    }
  }
  S.screen = 'home'; render(); toast('No se pudo crear la sala, inténtalo otra vez');
}

function hostMsg(connId, m) {
  if (!m || typeof m !== 'object') return;
  S.lastSeen.set(connId, Date.now());
  const r = S.room;
  if (m.t === 'hello') {
    const pid = String(m.pid || '').slice(0, 12);
    if (!pid) return;
    let p = r.players.find((x) => x.pid === pid);
    if (!p) {
      if (r.players.length >= MAX_PLAYERS) { S.host.send(connId, { t: 'err', msg: 'La sala está llena (máximo 6)', fatal: true }); return; }
      p = { pid, name: '', avatar: '🙂', online: true };
      r.players.push(p);
      sound.play('click');
    }
    p.name = String(m.name || 'Jugador').slice(0, 16);
    p.avatar = String(m.avatar || '🙂').slice(0, 4);
    p.v = String(m.v || 'antigua').slice(0, 12);
    p.online = true;
    for (const [cid, ppid] of S.connPid) if (ppid === pid && cid !== connId) S.connPid.delete(cid);
    S.connPid.set(connId, pid);
    broadcastRoom();
  } else if (m.t === 'chat') {
    const pid = S.connPid.get(connId);
    const p = pid && r.players.find((x) => x.pid === pid);
    if (p) relayChat({ pid, name: p.name, avatar: p.avatar, text: String(m.text || '').slice(0, 80) });
  } else if (m.t === 'askLobby') {
    const pid = S.connPid.get(connId);
    const p = pid && r.players.find((x) => x.pid === pid);
    if (p && r.gameId) { S.modal = { type: 'asklobby', name: p.name, avatar: p.avatar }; sound.play('invite'); renderModal(); }
  } else if (m.t === 'in') {
    const pid = S.connPid.get(connId);
    if (pid && r.seats) { const seat = r.seats.indexOf(pid); if (seat >= 0) S.rtInputs[seat] = m.i; }
  } else if (m.t === 'act') {
    const pid = S.connPid.get(connId);
    if (!pid || !r.state) return;
    const err = doAction(r.seats.indexOf(pid), m.action);
    if (err) S.host.send(connId, { t: 'err', msg: err });
  }
}

function hostClose(connId) {
  const pid = S.connPid.get(connId);
  S.connPid.delete(connId);
  if (!pid) return;
  if ([...S.connPid.values()].includes(pid)) return;
  const p = S.room && S.room.players.find((x) => x.pid === pid);
  if (!p) return;
  if (!S.room.gameId) S.room.players = S.room.players.filter((x) => x.pid !== pid); // en la sala de espera, se va
  else p.online = false; // en partida, conserva su sitio para volver
  broadcastRoom();
}

// ---------- chat ----------
function sendChat(text) {
  text = String(text).slice(0, 80);
  if (S.mode === 'client') { S.conn && S.conn.send({ t: 'chat', text }); return; }
  relayChat({ pid: me.pid, name: me.name, avatar: me.avatar, text });
}
function relayChat(c) {
  if (S.mode === 'host') S.host.broadcast({ t: 'chat', c });
  showChat(c);
}
function showChat(c) {
  S.chat = S.chat || [];
  S.chat.push(c);
  if (S.chat.length > 60) S.chat.shift();
  sound.play('invite');
  let box = document.querySelector('.bubbles');
  if (!box) { box = document.createElement('div'); box.className = 'bubbles'; document.body.appendChild(box); }
  const b = document.createElement('div');
  b.className = 'bubble' + (c.pid === me.pid ? ' mine' : '');
  b.innerHTML = `<span>${esc(c.avatar)}</span><div><b>${esc(c.name)}</b>${esc(c.text)}</div>`;
  box.appendChild(b);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => b.classList.add('out'), 4200);
  setTimeout(() => b.remove(), 4700);
  const cb = document.querySelector('[data-a="chat"]'); if (cb) fx.shake(cb);
}

function broadcastRoom() {
  const r = S.room;
  if (S.mode === 'host') {
    const g = r.gameId && getGame(r.gameId);
    if (g && g.viewFor && r.state) {
      // cada jugador recibe solo lo que puede ver (sus fichas, sus barcos…)
      const cache = new Map();
      for (const [cid, pid] of S.connPid) {
        const seat = r.seats.indexOf(pid);
        if (!cache.has(seat)) cache.set(seat, { ...r, state: g.viewFor(r.state, seat) });
        S.host.send(cid, { t: 'room', room: cache.get(seat) });
      }
    } else S.host.broadcast({ t: 'room', room: r });
  }
  scheduleTimer();
  onRoomUpdated();
}

// Temporizadores del juego (tiempo por turno, esconder cartas…): solo los ejecuta quien manda.
let timerHandle = null, timerId = null;
function scheduleTimer() {
  const s = S.room && S.room.state;
  const t = s && s.timer;
  if (!t || S.mode === 'client') return;
  if (t.id === timerId) return;
  timerId = t.id;
  clearTimeout(timerHandle);
  timerHandle = setTimeout(() => {
    const cur = S.room && S.room.state;
    if (cur && cur.timer && cur.timer.id === t.id) doAction('sys', t.action);
  }, t.ms);
}
const timerSeen = new Map();
function timeLeft() {
  const t = S.room && S.room.state && S.room.state.timer;
  if (!t) return null;
  if (!timerSeen.has(t.id)) timerSeen.set(t.id, Date.now());
  return Math.max(0, t.ms - (Date.now() - timerSeen.get(t.id)));
}

function doAction(seat, action) {
  const r = S.room;
  if (seat !== 'sys' && (seat == null || seat < 0)) return 'Estás mirando la partida';
  const g = getGame(r.gameId);
  try {
    r.state = g.action(r.state, seat, action || {});
  } catch (e) {
    if (e instanceof GameError) return e.message;
    console.error(e);
    return 'Jugada no válida';
  }
  broadcastRoom();
  return null;
}

function validateStart(r) {
  const g = getGame(r.sel);
  const players = r.players.filter((p) => p.online);
  const n = players.length;
  if (n < g.minPlayers) return `${g.name} necesita al menos ${g.minPlayers} jugadores`;
  if (n > g.maxPlayers) return `${g.name} es de ${g.maxPlayers} jugadores como máximo`;
  if (r.teamMode) {
    if (!g.teams) return `${g.name} no tiene modo por equipos`;
    const sizes = {};
    players.forEach((p) => { const t = r.teams[p.pid] ?? 0; sizes[t] = (sizes[t] || 0) + 1; });
    const vals = Object.values(sizes);
    if (vals.length < 2) return 'Haz al menos dos equipos';
    if (g.teams === 'pairs4' && (n !== 4 || vals.length !== 2 || vals.some((v) => v !== 2))) return 'Por parejas: 4 jugadores en 2 equipos de 2';
    if (g.teams === 'even' && vals.some((v) => v !== vals[0])) return 'Los equipos deben tener los mismos jugadores';
  }
  return null;
}

function startGame() {
  const r = S.room;
  const err = validateStart(r);
  if (err) { toast(err); fx.shake(document.querySelector('.startbtn') || app); return; }
  const g = getGame(r.sel);
  // el orden se sortea: así no empieza siempre quien crea la sala
  let order = shuffle(r.players.filter((p) => p.online).map((p) => p.pid));
  let teams = null;
  if (r.teamMode) {
    // sienta a los equipos alternados (compañeros enfrente) y numera los equipos 0,1,2…
    const groups = new Map();
    order.forEach((pid) => { const t = r.teams[pid] ?? 0; if (!groups.has(t)) groups.set(t, []); groups.get(t).push(pid); });
    const lists = shuffle([...groups.values()]);
    order = []; teams = [];
    for (let k = 0; order.length < r.players.filter((p) => p.online).length; k++) {
      lists.forEach((l, ti) => { if (l[k]) { order.push(l[k]); teams.push(ti); } });
    }
  }
  r.seats = order;
  r.teamsArr = teams;
  r.gameId = g.id;
  r.gameNo = (r.gameNo || 0) + 1;
  r.state = g.setup(order.length, { teams, options: gameOptions(r, g), local: S.mode === 'local' });
  r.players.forEach(upsertFriend);
  broadcastRoom();
}

function gameOptions(r, g) {
  const o = {};
  (g.options || []).forEach((op) => { o[op.id] = (r.opts && r.opts[g.id] && op.id in r.opts[g.id]) ? r.opts[g.id][op.id] : op.def; });
  return o;
}

function rematch() {
  const r = S.room;
  const g = getGame(r.gameId);
  r.gameNo++;
  r.state = g.setup(r.seats.length, { teams: r.teamsArr, options: gameOptions(r, g), local: S.mode === 'local' });
  broadcastRoom();
}
function backToLobby() {
  const r = S.room;
  stopRtLoop();
  r.gameId = null; r.state = null; r.seats = null;
  if (S.mode === 'host') r.players = r.players.filter((p) => p.online);
  broadcastRoom();
}

// ======================================================================
//  INVITADO
// ======================================================================
async function joinRoom(code) {
  if (!checkName()) return;
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { toast('El código tiene 4 letras'); return; }
  S.mode = 'client'; S.code = code; S.screen = 'connecting'; render();
  try {
    await connectClient();
    keepAwake(true);
  } catch (e) {
    S.mode = null; S.screen = 'home'; render(); toast(net.errorText(e));
  }
}
async function connectClient() {
  S.conn = await net.joinRoom(S.code, { onMsg: clientMsg, onClose: clientClosed });
  S.lastMsg = Date.now();
  S.conn.send({ t: 'hello', pid: me.pid, name: me.name, avatar: me.avatar, v: VERSION });
}
function clientMsg(m) {
  if (S.mode !== 'client') return;
  S.lastMsg = Date.now();
  if (m.t === 'room') { S.room = m.room; S.reconnecting = false; onRoomUpdated(); }
  else if (m.t === 'rt') { const g = S.room && S.room.gameId && getGame(S.room.gameId); if (g && g.onSnap) g.onSnap(m.snap); }
  else if (m.t === 'err') { toast(m.msg); if (m.fatal) leave(true); }
  else if (m.t === 'ping') S.conn && S.conn.send({ t: 'pong' });
  else if (m.t === 'chat') showChat(m.c);
  else if (m.t === 'bye') { toast('El anfitrión ha cerrado la sala'); leave(true); }
}
function clientClosed() {
  if (S.mode !== 'client' || S.reconnecting) return;
  reconnect();
}
async function reconnect() {
  S.reconnecting = true; render();
  for (let k = 0; k < 15 && S.mode === 'client'; k++) {
    try { if (S.conn) S.conn.close(); } catch {}
    try { await connectClient(); return; } catch {}
    await new Promise((res) => setTimeout(res, 3000));
  }
  if (S.mode === 'client') { toast('Se perdió la conexión con la sala'); leave(true); }
}

function leave(silent) {
  if (S.mode === 'host') { try { S.host.broadcast({ t: 'bye' }); } catch {} setTimeout(() => S.host && S.host.close(), 300); }
  if (S.mode === 'client' && S.conn) S.conn.close();
  if (S.demo) { clearTimeout(S.demo.timer); S.demo = null; }
  stopRtLoop();
  clearTimeout(timerHandle); timerId = null;
  const wasDemo = S.mode === 'demo';
  S.mode = null; S.room = null; S.host = null; S.conn = null; S.reconnecting = false;
  S.connPid.clear(); S.screen = 'home'; S.modal = null; S.chat = []; S.teamDrawSeen = null;
  if (wasDemo) S.tab = 'games';
  keepAwake(false);
  render();
}

// latido: detecta desconexiones aunque WebRTC no avise
setInterval(() => {
  const now = Date.now();
  if (S.mode === 'host' && S.host) {
    S.host.broadcast({ t: 'ping' });
    let changed = false;
    for (const [cid, pid] of S.connPid) {
      if (now - (S.lastSeen.get(cid) || now) > 16000) {
        S.connPid.delete(cid); S.host.drop(cid);
        const p = S.room.players.find((x) => x.pid === pid);
        if (p && ![...S.connPid.values()].includes(pid)) { p.online = false; changed = true; }
      }
    }
    if (changed) broadcastRoom();
  }
  if (S.mode === 'client' && !S.reconnecting && now - S.lastMsg > 16000) reconnect();
}, 4000);

// ======================================================================
//  MODO "EN ESTE MÓVIL" (todos los jugadores en el mismo dispositivo)
// ======================================================================
function startLocal() {
  if (!checkName()) return;
  S.mode = 'local';
  S.room = {
    code: null, hostPid: me.pid, sel: GAMES[0].id, teamMode: false, teams: {}, opts: {}, gameId: null, seats: null, state: null, gameNo: 0,
    players: [{ ...me, online: true }, { pid: 'B0' + randCode(3), name: 'Robotín', avatar: '🤖', online: true, bot: true }],
  };
  S.screen = 'lobby'; render();
}

// ======================================================================
//  EVENTOS DE SALA → pantalla, sonidos y efectos
// ======================================================================
// ---------- juegos en tiempo real: el anfitrión simula y reparte posiciones ----------
S.rtInputs = {};
function startRtLoop() {
  stopRtLoop();
  const g = getGame(S.room.gameId);
  S.rtInputs = {};
  S.rtGameNo = S.room.gameNo;
  let last = performance.now(), tick = 0;
  S.rtLoop = setInterval(() => {
    const r = S.room;
    if (!r || !r.state || r.gameId !== g.id || r.gameNo !== S.rtGameNo) { stopRtLoop(); return; }
    const now = performance.now();
    g.step(r.state, S.rtInputs, Math.min(0.1, (now - last) / 1000));
    last = now;
    if (++tick % 2 === 0 || r.state.over) {
      const snap = g.snapshot(r.state);
      if (S.mode === 'host') S.host.broadcast({ t: 'rt', snap });
      g.onSnap(snap);
    }
    if (r.state.over) { stopRtLoop(); r.state.v++; broadcastRoom(); }
  }, 33);
}
function stopRtLoop() { if (S.rtLoop) { clearInterval(S.rtLoop); S.rtLoop = null; } }

function onRoomUpdated() {
  const r = S.room;
  if (!r) return;
  setTimeout(botTick, 0);
  if (r.teamDraw && r.teamDraw !== S.teamDrawSeen) { if (S.teamDrawSeen != null || S.mode === 'host' || S.mode === 'local') setTimeout(showTeamDraw, 50); S.teamDrawSeen = r.teamDraw; }
  const rg = r.gameId && r.state && getGame(r.gameId);
  if (rg && rg.realtime) {
    if ((S.mode === 'host' || S.mode === 'local') && !r.state.over && (!S.rtLoop || S.rtGameNo !== r.gameNo)) startRtLoop();
    // durante la carrera no se redibuja la pantalla: el lienzo se actualiza solo
    if (S.screen === 'game' && S.gameNo === r.gameNo && !r.state.over && !S.rtDirty) return;
    S.rtDirty = false;
  }
  if (r.gameId && r.state) {
    if (S.screen !== 'game' || S.gameNo !== r.gameNo) { if (S.mode !== 'demo') setTimeout(showStartDraw, 300); S.screen = 'game'; S.ui = {}; S.gameNo = r.gameNo; S.curtainSeat = null; S.lastFx = null; S.lastV = null; S.wasMine = false; }
    playEffects();
  } else if (S.screen === 'game' || S.screen === 'connecting') S.screen = 'lobby';
  render();
}

// Animación de sorteo: las figuritas van pasando y se para en quien empieza
function showStartDraw() {
  const r = S.room;
  if (!r || !r.state) return;
  const g = getGame(r.gameId);
  const first = g.realtime || r.state.first ? null : g.turnOf(r.state);
  if (first == null) return; // juegos con tirada inicial de dado o en tiempo real: sin ruleta
  const ps = r.seats.map((pid) => r.players.find((p) => p.pid === pid) || { name: '?', avatar: '❔' });
  const d = document.createElement('div');
  d.className = 'drawov';
  d.innerHTML = `<div class="drawbox"><h3>🎲 ¿Quién empieza?</h3><div class="drawrow">${ps.map((p, i) => `<div class="dav" data-i="${i}"><span>${p.avatar}</span><b>${esc(p.name)}</b></div>`).join('')}</div><div class="drawres"></div></div>`;
  document.body.appendChild(d);
  const items = [...d.querySelectorAll('.dav')];
  const total = items.length * 3 + first + 1;
  let k = 0, delay = 70;
  const tick = () => {
    items.forEach((it) => it.classList.remove('hl'));
    items[k % items.length].classList.add('hl');
    sound.play('click');
    k++;
    if (k < total) { delay *= 1.09; setTimeout(tick, delay); return; }
    const why = g.id === 'domino' ? ' (tiene el doble más alto)' : '';
    d.querySelector('.drawres').innerHTML = `¡Empieza <b>${esc(ps[first].name)}</b>!${why}`;
    sound.play('special');
    const c = fx.center(items[first]); fx.sparkle(c.x, c.y, '#ffe066', 22, 1.5);
    setTimeout(() => d.classList.add('out'), 1500);
    setTimeout(() => d.remove(), 1900);
  };
  d.onclick = () => d.remove();
  tick();
}

// Animación de sorteo de equipos (la ven todos)
function showTeamDraw() {
  const r = S.room;
  const d = document.createElement('div');
  d.className = 'drawov';
  const k = Math.max(...r.players.map((p) => r.teams[p.pid] ?? 0)) + 1;
  d.innerHTML = `<div class="drawbox"><h3>🎲 Sorteo de equipos</h3><div class="tdraw">${r.players.map((p) => `<div class="tdp" data-t="${r.teams[p.pid] ?? 0}"><span>${p.avatar}</span><b>${esc(p.name)}</b><i>❔</i></div>`).join('')}</div></div>`;
  document.body.appendChild(d);
  const els = [...d.querySelectorAll('.tdp')];
  els.forEach((el, i) => {
    let n = 0;
    const spin = setInterval(() => { const t = n++ % k; el.style.setProperty('--tc', TEAM_COLORS[t]); el.querySelector('i').textContent = TEAM_EMOJI[t]; }, 90);
    setTimeout(() => {
      clearInterval(spin);
      const t = +el.dataset.t;
      el.style.setProperty('--tc', TEAM_COLORS[t]); el.querySelector('i').textContent = TEAM_EMOJI[t] + ' ' + TEAM_NAMES[t];
      el.classList.add('done'); sound.play('place');
    }, 900 + i * 450);
  });
  setTimeout(() => { sound.play('special'); d.classList.add('out'); }, 900 + els.length * 450 + 1200);
  setTimeout(() => d.remove(), 900 + els.length * 450 + 1600);
  d.onclick = () => d.remove();
}

const isBotSeat = (k) => { const r = S.room; const p = r && r.seats && r.players.find((x) => x.pid === r.seats[k]); return !!(p && p.bot); };

// La máquina juega sola cuando le toca (en este móvil y también en salas por internet: la mueve el anfitrión).
// Los juegos simultáneos (Stop, Solitario, Dibuja…) dicen con actors(s) quién puede jugar ahora mismo.
function botTick() {
  const r = S.room;
  if ((S.mode !== 'local' && S.mode !== 'host') || !r || !r.state || !r.gameId) return;
  const g = getGame(r.gameId);
  if (g.realtime || g.isOver(r.state)) return;
  const actorsOf = (st) => (g.actors ? g.actors(st) : [g.turnOf(st)]).filter((k) => k != null && isBotSeat(k));
  S.botBusy = S.botBusy || {};
  const gameNo = r.gameNo;
  actorsOf(r.state).forEach((t) => {
    const key = gameNo + ':' + t;
    if (S.botBusy[key]) return;
    S.botBusy[key] = true;
    const base = g.botDelay ? g.botDelay(r.state, t) : (r.state.rollId === r.state.v ? 1900 : 1100);
    setTimeout(() => {
      S.botBusy[key] = false;
      const cur = S.room;
      if ((S.mode !== 'local' && S.mode !== 'host') || !cur || !cur.state || cur.gameNo !== gameNo || cur.gameId !== g.id || g.isOver(cur.state)) return;
      if (!actorsOf(cur.state).includes(t)) { botTick(); return; }
      let a = null;
      try { a = g.bot(cur.state, t); } catch (e) { console.error(e); }
      if (!a) { setTimeout(botTick, 1500); return; }
      const err = doAction(t, a);
      if (err) { console.warn('máquina:', err); setTimeout(botTick, 1500); }
    }, base + Math.random() * 200);
  });
}

function mySeat() {
  const r = S.room;
  if (!r || !r.seats) return null;
  if (S.mode === 'demo') { const t = getGame(r.gameId).turnOf(r.state); return t == null ? (r.state.winner ?? 0) : t; }
  if (S.mode === 'local') {
    const t = getGame(r.gameId).turnOf(r.state);
    const humans = r.seats.map((pid, k) => k).filter((k) => !isBotSeat(k));
    if (t != null && !isBotSeat(t)) { S.lastHuman = t; return t; }
    return humans.includes(S.lastHuman) ? S.lastHuman : (humans[0] ?? 0);
  }
  const i = r.seats.indexOf(me.pid);
  return i < 0 ? null : i;
}

function playEffects() {
  const r = S.room, s = r.state, g = getGame(r.gameId);
  if (S.lastV === s.v) return;
  const first = S.lastV == null;
  S.lastV = s.v;
  if (first) return;
  const rolled = s.rollId === s.v;
  if (rolled) {
    sound.play('dice');
    // dado 3D: sale del botón y rueda por encima del tablero
    requestAnimationFrame(() => fx.roll3D(s.dieVal, document.querySelector('.die3d'), (document.getElementById('board') || app).querySelector('.pzoom, .oca-wrap')?.getBoundingClientRect(), sound.play));
  }
  const f = s.fx && S.lastFx !== s.fx.id ? s.fx : null;
  if (f) {
    S.lastFx = f.id;
    // animación propia del juego (se lanza cuando el tablero nuevo ya está dibujado)
    if (g.animate) S.pendingFx = { f, delay: rolled ? 1500 : 0 };
    if (f.text) {
      const kind = f.type === 'win' ? 'win' : f.type === 'capture' ? 'capture' : f.type === 'bad' ? 'bad' : 'special';
      setTimeout(() => {
        if (!g.animate || f.type === 'win') sound.play(kind === 'win' ? 'win' : kind);
        const names = (r.seats || []).map((pid) => (r.players.find((p) => p.pid === pid) || {}).name || '?');
        fx.banner(String(f.text).replace(/\{(\d)\}/g, (_, i) => names[i] || '?'), f.emoji || (kind === 'win' ? '🏆' : '✨'), kind);
        if (kind === 'win') { fx.confetti(220); fx.fireworksShow(null, 7); vibrate([100, 60, 100, 60, 300]); }
        else vibrate(kind === 'capture' ? 140 : 40);
      }, (rolled ? 1500 : 120) + (f.bannerDelay || 0));
    }
  }
  if (!rolled && (!f || (!f.text && !g.animate))) sound.play(g.moveSound || 'move');
  if (S.mode !== 'local' && S.mode !== 'demo') {
    const mine = g.turnOf(s) === mySeat() && mySeat() != null;
    if (mine && !S.wasMine) setTimeout(() => { sound.play('turn'); vibrate(60); }, rolled ? 1700 : 300);
    S.wasMine = mine;
  }
}

function runPendingFx(board) {
  const p = S.pendingFx;
  if (!p) return;
  S.pendingFx = null;
  const g = getGame(S.room.gameId);
  const go = () => { try { g.animate(p.f, board, makeCtx()); } catch (e) { console.error(e); } };
  if (p.delay) setTimeout(go, p.delay); else requestAnimationFrame(go);
}

// ======================================================================
//  ACTUALIZACIONES: avisa si en GitHub hay una versión más nueva que la instalada
// ======================================================================
const verNum = (v) => String(v || '').replace(/^v/, '').split('.').map((n) => +n || 0);
const newer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
S.update = null;
async function checkUpdate() {
  if (!/^\d/.test(VERSION) || TEST) return;
  try {
    const r = await fetch('https://api.github.com/repos/espjulian84-cpu/JuegosConAmigos/releases/latest', { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    const v = String(j.tag_name || '').replace(/^v/, '');
    if (!newer(v, VERSION)) return;
    const asset = (j.assets || []).find((a) => a.name === `JuegosConAmigos-${v}.apk`) || (j.assets || []).find((a) => /\.apk$/.test(a.name));
    S.update = { v, url: asset ? asset.browser_download_url : DOWNLOAD_URL };
    if (S.screen === 'home') render();
  } catch {}
}
setTimeout(checkUpdate, 1500);

// ======================================================================
//  INVITACIONES
// ======================================================================
const stopInvites = net.listenInvites(me.pid, (m) => {
  if (!m || m.t !== 'invite' || !m.from) return;
  upsertFriend(m.from);
  sound.play('invite'); vibrate([80, 50, 80]);
  S.modal = { type: 'invite', inv: m };
  renderModal();
});
window.addEventListener('pagehide', () => stopInvites && stopInvites());

async function inviteFriend(f, btn) {
  if (!S.room || !S.room.code) return;
  btn.disabled = true; btn.textContent = 'Enviando…';
  const ok = await net.sendInvite(f.pid, { t: 'invite', code: S.room.code, game: S.room.sel, from: { pid: me.pid, name: me.name, avatar: me.avatar } });
  btn.textContent = ok ? '✅ Enviada' : '😴 No conectado';
  if (!ok) toast(`${f.name} no tiene la app abierta. Prueba a compartir el enlace.`);
}

// ======================================================================
//  RENDER
// ======================================================================
function checkName() {
  if (!me.name.trim()) { toast('Escribe tu nombre primero 😊'); const i = document.querySelector('#name'); if (i) { i.focus(); fx.shake(i); } return false; }
  return true;
}

function render() {
  const board = document.getElementById('board');
  const before = board ? fx.snapshot(board) : null;
  document.body.dataset.screen = S.screen;
  if (S.screen === 'home') app.innerHTML = homeHTML();
  else if (S.screen === 'connecting') app.innerHTML = `<div class="center-screen"><div class="spinner">🎲</div><p>Conectando…</p><button class="btn ghost" data-a="leave">Cancelar</button></div>`;
  else if (S.screen === 'lobby') app.innerHTML = lobbyHTML();
  else if (S.screen === 'game') renderGame(before);
  bind();
  renderModal();
}

function homeHTML() {
  const tabs = `<nav class="tabs">
    ${[['play', '🎮', 'Jugar'], ['games', '📚', 'Juegos'], ['friends', '👥', 'Amigos']].map(([id, ic, label]) =>
      `<button class="${S.tab === id ? 'on' : ''}" data-tab="${id}"><span>${ic}</span>${label}</button>`).join('')}
  </nav>`;
  let body = '';
  if (S.tab === 'play') {
    const pending = params.get('sala');
    body = `
      <div class="hero">
        <div class="logo"><span>🎲</span><span>${getGame('oca').icon}</span><span>${getGame('domino').icon}</span><span>🧱</span></div>
        <h1>Juegos con Amigos</h1>
        <p>Hasta 6 jugadores, cada uno en su móvil</p>
      </div>
      ${S.update ? `<a class="card updcard" href="${S.update.url}" target="_blank" rel="noopener"><span>🆕</span><div class="grow"><b>¡Hay una versión nueva! (${S.update.v})</b><small>Tienes la ${VERSION}. Toca para descargarla e instálala encima.</small></div><span>⬇️</span></a>` : ''}
      <div class="card me">
        <button class="bigavatar" data-a="avatar" title="Cambiar avatar">${me.avatar}</button>
        <div class="grow"><label>Tu nombre</label><input id="name" maxlength="16" placeholder="¿Cómo te llamas?" value="${esc(me.name)}"></div>
      </div>
      <div class="menu">
        <button class="btn big c1" data-a="create">🎉 Crear sala</button>
        <div class="joinrow"><input id="code" maxlength="4" placeholder="CÓDIGO" value="${esc(pending || '')}" autocapitalize="characters"><button class="btn big c2" data-a="join">🔑 Unirme</button></div>
        <button class="btn big c3" data-a="local">📱 Jugar todos en este móvil</button>
      </div>
      <div class="gamesmini">${GAMES.map((g) => `<div class="gmini" style="--gc:${g.color}"><span>${g.icon}</span>${g.name}</div>`).join('')}</div>
      <p class="foot">Los móviles se conectan por internet, estéis donde estéis (wifi o datos). Tu código de amigo: <b>${me.pid}</b><br>Versión ${VERSION}</p>
      <button class="btn ghost" data-a="shareapp">📲 Pasar la app a un amigo</button>`;
  } else if (S.tab === 'games') {
    body = `
      <h2 class="sect">🎮 Juegos disponibles</h2>
      <div class="gamelist">${GAMES.map((g) => `
        <div class="gamecard" style="--gc:${g.color}">
          <div class="gicon">${g.icon}</div>
          <div class="grow"><h3>${g.name}</h3><p>${g.blurb}</p>
          <div class="tags"><span>👤 ${g.minPlayers}-${g.maxPlayers}</span>${g.teams ? '<span>🤝 Equipos</span>' : ''}${g.realtime ? '<span>⚡ Tiempo real</span>' : ''}</div>
          <div class="row wrap gbtns"><button class="btn small" data-rules="${g.id}">📖 Cómo se juega</button>${g.demo ? `<button class="btn small c1" data-demo="${g.id}">▶ Ejemplo</button>` : ''}</div></div>
        </div>`).join('')}</div>
      <h2 class="sect">⭐ Mi lista de juegos por añadir</h2>
      <p class="hint">Apunta aquí los juegos de mesa que te encuentres y te gusten para añadirlos a la app más adelante.</p>
      <div class="card addwish">
        <input id="wname" maxlength="40" placeholder="Nombre del juego (ej. Uno, Ajedrez…)">
        <input id="wnote" maxlength="140" placeholder="Notas: reglas, dónde lo viste, nº de jugadores…">
        <button class="btn c1" data-a="addwish">➕ Apuntar juego</button>
      </div>
      <div class="wishlist">${wishlist.length ? wishlist.map((w, i) => `
        <div class="wish"><span class="wstar">🌟</span><div class="grow"><b>${esc(w.name)}</b>${w.note ? `<small>${esc(w.note)}</small>` : ''}</div>
        <button class="iconbtn" data-delwish="${i}" title="Borrar">🗑️</button></div>`).join('') : '<p class="hint center">Todavía no has apuntado ninguno</p>'}</div>`;
  } else {
    body = `
      <h2 class="sect">👥 Mis amigos</h2>
      <div class="card mycode">
        <div>Tu código de amigo</div>
        <div class="bigcode">${me.pid}</div>
        <div class="row"><button class="btn" data-a="copycode">📋 Copiar</button><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`¡Agrégame en Juegos con Amigos! Mi código de amigo es ${me.pid}`)}">💬 WhatsApp</a></div>
      </div>
      <div class="card addfriend">
        <input id="fcode" maxlength="6" placeholder="Código de amigo" autocapitalize="characters">
        <input id="fname" maxlength="16" placeholder="Nombre">
        <button class="btn c2" data-a="addfriend">➕ Añadir</button>
      </div>
      <p class="hint">Quien juegue contigo se guarda aquí solo. Desde la sala podrás enviarles una invitación directa.</p>
      <div class="friendlist">${friends.length ? friends.map((f, i) => `
        <div class="friend"><span class="favatar">${f.avatar}</span><div class="grow"><b>${esc(f.name)}</b><small>${f.pid}${f.last ? ' · ' + new Date(f.last).toLocaleDateString() : ''}</small></div>
        <button class="iconbtn" data-delfriend="${i}" title="Borrar">🗑️</button></div>`).join('') : '<p class="hint center">Aún no tienes amigos guardados 🥲</p>'}</div>`;
  }
  return `<div class="home">${body}</div>${tabs}`;
}

function teamColumns(r, canEdit) {
  const k = r.players.length >= 6 && getGame(r.sel).teams !== 'pairs4' ? 3 : 2;
  return `<div class="teamcols" style="--k:${k}">${Array.from({ length: k }, (_, t) => `
    <div class="teamcol" style="--tc:${TEAM_COLORS[t]}"><div class="tchead">${TEAM_EMOJI[t]} ${TEAM_NAMES[t]}</div>
    ${r.players.filter((p) => (r.teams[p.pid] ?? 0) === t).map((p) => `<button class="tcp" ${canEdit ? `data-team="${p.pid}"` : 'disabled'}>${p.avatar} ${esc(p.name)}</button>`).join('') || '<div class="tcempty">—</div>'}</div>`).join('')}</div>`;
}

function teamChip(r, p, canEdit) {
  if (!r.teamMode) return '';
  const t = r.teams[p.pid] ?? 0;
  return `<button class="teamchip" style="--tc:${TEAM_COLORS[t]}" ${canEdit ? `data-team="${p.pid}"` : 'disabled'}>${TEAM_EMOJI[t]} ${TEAM_NAMES[t]}</button>`;
}

function lobbyHTML() {
  const r = S.room;
  const isHost = S.mode === 'host' || S.mode === 'local';
  const local = S.mode === 'local';
  const g = getGame(r.sel);
  const err = validateStart(r);
  const players = r.players.map((p, i) => `
    <div class="lplayer ${p.online ? '' : 'off'}" style="--pc:${PLAYER_COLORS[i]}">
      ${local ? `<button class="lavatar" data-lavatar="${i}">${p.avatar}</button>` : `<span class="lavatar">${p.avatar}</span>`}
      <div class="grow">${p.bot ? `<b>${esc(p.name)}</b> <small>(máquina)</small>` : local ? `<input class="lname" data-lname="${i}" maxlength="16" value="${esc(p.name)}">` : `<b>${esc(p.name)}</b>${p.pid === r.hostPid ? ' 👑' : ''}${p.pid === me.pid ? ' <small>(tú)</small>' : ''}${p.v && r.hostV && p.v !== r.hostV ? `<div class="verwarn">⚠️ Tiene otra versión (${esc(p.v)}). ¡Actualizad todos a la misma!</div>` : ''}`}</div>
      ${teamChip(r, p, isHost)}
      ${local && i > 0 ? `<button class="iconbtn" data-rmlocal="${i}">✖</button>` : ''}
    </div>`).join('');

  const invite = local ? '' : `
    <div class="card roomcode">
      <div class="grow">
        <div class="lbl">Código de la sala</div>
        <div class="bigcode">${r.code}</div>
        <div class="row wrap">
          <a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(inviteText(r.code))}">💬 WhatsApp</a>
          <button class="btn" data-a="share">📨 Compartir</button>
          <button class="btn c3" data-a="invitefriends">👥 Invitar amigos</button>
        </div>
      </div>
      <div class="qr" title="Escanea para descargar la app">${qrSVG(DOWNLOAD_URL)}<small>Descargar app</small></div>
    </div>`;

  const startBar = isHost ? `<div class="startbar"><button class="btn big startbtn ${err ? 'disabled' : 'pulse'}" data-a="start">${err ? '⏳ ' + esc(err) : `▶ ¡Empezar ${g.name}!`}</button></div>` : '';
  const picker = isHost ? `
    <details class="pickdd" ${S.pickOpen ? 'open' : ''}>
      <summary><span class="gpi">${g.icon}</span><div class="grow"><small>Juego elegido</small><b>${g.name}</b></div><span class="ddbtn">🎮 Cambiar ▾</span></summary>
    ${GAME_CATS.map(([cat, label]) => { const list = GAMES.filter((x) => (x.cat || 'mesa') === cat); return list.length ? `<div class="gpcat">${label}</div><div class="gamepick">${list.map((x) => `
      <button class="gp ${x.id === r.sel ? 'on' : ''}" data-sel="${x.id}" style="--gc:${x.color}">
        <span class="gpi">${x.icon}</span><b>${x.name}</b><small>${x.minPlayers === x.maxPlayers ? x.minPlayers : `${x.minPlayers}-${x.maxPlayers}`} 👤</small></button>`).join('')}</div>` : ''; }).join('')}
    </details>
    <div class="optrow"><button class="btn small" data-rules="${g.id}">📖 Cómo se juega</button></div>
    ${(g.options || []).map((op) => {
      const cur = gameOptions(r, g)[op.id];
      if (op.type === 'bool') return `<div class="teamrow"><label class="switch" data-opt="${g.id}|${op.id}|0"><input type="checkbox" ${cur ? 'checked' : ''} disabled><span></span> ${op.label}</label></div>`;
      return `<div class="optchoice"><div class="optlabel">${op.label}</div><div class="chips">${op.choices.map((c, ci) => `<button class="chip ${c.v === cur ? 'on' : ''}" data-opt="${g.id}|${op.id}|${ci}">${c.label}</button>`).join('')}</div></div>`;
    }).join('')}
    ${g.teams ? `<div class="seg"><button class="${r.teamMode ? '' : 'on'}" data-mode="solo">👤 Cada uno por su cuenta</button><button class="${r.teamMode ? 'on' : ''}" data-mode="teams">🤝 Por equipos${g.teams === 'pairs4' ? ' (parejas)' : ''}</button></div>
      ${r.teamMode ? `${teamColumns(r, true)}<div class="row center"><button class="btn c3" data-a="shuffleteams">🎲 Sortear equipos</button></div><p class="hint light">Toca a un jugador para cambiarlo de equipo.</p>` : ''}` : ''}
    ${r.players.length < MAX_PLAYERS ? `<div class="row">${local ? '<button class="btn ghost" data-a="addlocal">➕ Añadir persona</button>' : ''}<button class="btn ghost" data-a="addbot">🤖 Añadir máquina</button></div>` : ''}
`
    : `${r.teamMode && g.teams ? teamColumns(r, false) : ''}<div class="card waiting"><div class="gpi big">${g.icon}</div><div>Juego elegido: <b>${g.name}</b>${r.teamMode ? ' · 🤝 por equipos' : ''}</div>
      <div class="hint">${(g.options || []).map((op) => { const v = gameOptions(r, g)[op.id]; return op.type === 'bool' ? `${op.label}: ${v ? 'sí' : 'no'}` : `${op.label}: ${op.choices.find((c) => c.v === v)?.label}`; }).join(' · ')}</div>
      <button class="btn small" data-rules="${g.id}">📖 Cómo se juega</button><div class="dots">Esperando a que el anfitrión empiece<span>.</span><span>.</span><span>.</span></div></div>`;

  return `
    <header class="topbar"><button class="iconbtn" data-a="leave">←</button><div class="grow title">${local ? '📱 En este móvil' : '🏠 Sala de espera'}</div>${local ? '' : '<button class="iconbtn" data-a="chat">💬</button>'}<button class="iconbtn" data-a="mute">${sound.isMuted() ? '🔇' : '🔊'}</button></header>
    ${S.reconnecting ? '<div class="reconnect">📡 Reconectando…</div>' : ''}
    <div class="lobby">
      ${startBar}
      ${invite}
      <h2 class="sect">Jugadores (${r.players.length}/${MAX_PLAYERS}) <small class="vertag">versión ${VERSION}</small></h2>
      <div class="lplayers">${players}</div>
      ${picker}
    </div>`;
}

function qrSVG(text) {
  try {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
  } catch { return ''; }
}

// Lo que este móvil puede ver: en juegos con información oculta, también el anfitrión
// y el modo "todos en este móvil" ven solo lo suyo (los invitados ya lo reciben filtrado).
function visibleState() {
  const r = S.room, g = getGame(r.gameId);
  if (!g.viewFor || S.mode === 'client' || S.mode === 'demo') return r.state;
  const seat = mySeat();
  return seat == null ? r.state : g.viewFor(r.state, seat);
}

function makeCtx() {
  const r = S.room;
  const seatPlayers = r.seats.map((pid) => r.players.find((p) => p.pid === pid) || { name: '¿?', avatar: '❔' });
  const names = seatPlayers.map((p) => p.name);
  const s = visibleState();
  const seat = mySeat();
  return {
    players: names,
    mySeat: seat,
    local: S.mode === 'local',
    ui: S.ui,
    avatar: (i) => (seatPlayers[i] ? seatPlayers[i].avatar : '❔'),
    fmt: (l) => esc(l).replace(/\{(\d)\}/g, (_, i) => `<b style="color:${PLAYER_COLORS[i]}">${esc(names[i] || '?')}</b>`),
    winnerName: (w) => {
      if (s.teams) { const t = s.teams[w]; return `${TEAM_EMOJI[t]} <b>${TEAM_NAMES[t]}</b> (${names.filter((_, k) => s.teams[k] === t).map(esc).join(' y ')})`; }
      return `<b>${esc(names[w])}</b>`;
    },
    toast,
    sound: (n) => sound.play(n),
    sendInput: (i) => { if (S.mode === 'client') { if (S.conn) S.conn.send({ t: 'in', i }); } else S.rtInputs[mySeat() ?? 0] = i; },
    fx,
    state: s,
    timeLeft,
    rerender: () => renderGame(fx.snapshot(document.getElementById('board'))),
    isBot: (k) => isBotSeat(k),
    sendQuiet: (action) => {
      if (S.mode === 'demo') return;
      if (S.mode === 'client') { S.conn && S.conn.send({ t: 'act', action }); return; }
      doAction(S.mode === 'local' ? mySeat() : r.seats.indexOf(me.pid), action);
    },
    send: (action) => {
      sound.play('click');
      if (S.mode === 'demo') return;
      if (S.mode === 'client') { S.conn && S.conn.send({ t: 'act', action }); return; }
      const err = doAction(S.mode === 'local' ? mySeat() : r.seats.indexOf(me.pid), action);
      if (err) { toast(err); fx.shake(document.getElementById('board')); }
    },
  };
}

function renderGame(before) {
  if (!S.room || !S.room.state || !S.room.seats || !S.room.gameId) return; // ya no hay partida (p. ej. se volvió a la sala)
  const r = S.room, g = getGame(r.gameId), s = r.state;
  const isHost = S.mode === 'host' || S.mode === 'local';
  const offline = r.players.filter((p) => !p.online && r.seats.includes(p.pid));
  const ctx = makeCtx();
  const turn = g.turnOf(s);
  // Juegos con información oculta en un solo móvil: cortina para pasar el móvil sin ver lo del otro
  if (S.mode === 'local' && g.hidden && turn != null && S.curtainSeat !== turn && S.pendingFx && !S.curtainWait) {
    S.curtainWait = setTimeout(() => { S.curtainWait = null; render(); }, 3200);
  }
  const humansHere = S.mode === 'local' ? r.seats.filter((pid, k) => !isBotSeat(k)).length : 0;
  const curtain = S.mode === 'local' && g.hidden && humansHere > 1 && turn != null && !isBotSeat(turn) && S.curtainSeat !== turn && !S.curtainWait;
  const demo = S.mode === 'demo';
  app.innerHTML = `
    <header class="topbar" style="--gc:${g.color}">
      <button class="iconbtn" data-a="leave">✕</button>
      <div class="grow title">${g.icon} ${demo ? 'Ejemplo: ' : ''}${g.name}</div>
      ${r.code ? `<span class="codepill">${r.code}</span>` : ''}
      ${demo || S.mode === 'local' ? '' : '<button class="iconbtn" data-a="chat">💬</button>'}
      ${demo ? '' : `<button class="iconbtn" data-rules="${g.id}">❓</button>`}
      <button class="iconbtn" data-a="mute">${sound.isMuted() ? '🔇' : '🔊'}</button>
    </header>
    ${S.reconnecting ? '<div class="reconnect">📡 Reconectando…</div>' : ''}
    ${offline.length ? `<div class="reconnect warn">😴 Sin conexión: ${offline.map((p) => esc(p.name)).join(', ')}</div>` : ''}
    ${demo ? `<div class="democap"><span class="dstep">${S.demo.i}/${S.demo.steps.length}</span> ${esc(S.demo.say || '')}</div>` : ''}
    ${S.mode === 'local' && turn != null && !curtain ? `<div class="localturn">${ctx.avatar(turn)} ${isBotSeat(turn) ? `Piensa <b>${esc(ctx.players[turn])}</b>… 🤔` : `Turno de <b>${esc(ctx.players[turn])}</b>`}</div>` : ''}
    ${curtain ? `<div class="curtain"><div class="bigemoji">${ctx.avatar(turn)}</div><h2>Pasa el móvil a<br><b>${esc(ctx.players[turn])}</b></h2><p>Los demás, ¡no miréis! 🙈</p><button class="btn big c1" data-a="uncurtain">👀 Soy ${esc(ctx.players[turn])}, ver mi turno</button></div>` : `<main id="board" class="board-${g.id}"></main>`}
    ${demo && S.demo.done ? '<div class="endbar"><button class="btn big c1" data-a="demoagain">🔁 Ver otra vez</button><button class="btn big" data-a="leave">✅ ¡Entendido!</button></div>' : ''}
    ${!demo && g.isOver(s) ? `<div class="endbar">${isHost
      ? '<button class="btn big c1" data-a="rematch">🔁 Revancha</button><button class="btn big" data-a="lobby">🏠 Cambiar de juego</button>'
      : '<div class="hint">Esperando al anfitrión para la revancha…</div>'}</div>` : ''}`;
  const board = document.getElementById('board');
  if (board) {
    g.render(board, ctx.state, ctx);
    decorateTeams(board, ctx.state, g);
    const skip = (S.pendingFx && S.pendingFx.f.noFlip) || [];
    fx.animateFrom(board, before, skip);
    runPendingFx(board);
  } else S.pendingFx = null;
  bind();
}

// En partidas por equipos, los marcadores se agrupan: Luna arriba a la derecha y Sol abajo a la izquierda
function decorateTeams(board, s, g) {
  if (!s.teams || g.id === 'muros') return;
  const bar = board.querySelector('.players');
  if (!bar) return;
  const chips = [...bar.querySelectorAll(':scope > .pchip')];
  if (chips.length !== s.teams.length) return;
  const groups = {};
  chips.forEach((c, i) => { (groups[s.teams[i]] = groups[s.teams[i]] || []).push(c); });
  bar.classList.add('teambar');
  bar.innerHTML = '';
  [1, 0, 2].filter((t) => groups[t]).forEach((t) => {
    const box = document.createElement('div');
    box.className = `teambox t${t}`;
    box.style.setProperty('--tc', TEAM_COLORS[t]);
    box.innerHTML = `<div class="tbname">${TEAM_EMOJI[t]} ${TEAM_NAMES[t]}</div>`;
    groups[t].forEach((c) => box.appendChild(c));
    bar.appendChild(box);
  });
}

// barras de tiempo ([data-timer]) que dibujan los juegos
setInterval(() => {
  const els = document.querySelectorAll('[data-timer]');
  if (!els.length) return;
  const t = S.room && S.room.state && S.room.state.timer;
  const left = timeLeft();
  els.forEach((el) => {
    if (!t || left == null) { el.style.setProperty('--p', 0); el.dataset.secs = ''; return; }
    el.style.setProperty('--p', left / t.ms);
    el.dataset.secs = Math.ceil(left / 1000);
    el.classList.toggle('hurry', left < 4000);
  });
}, 150);

// ======================================================================
//  PARTIDA DE EJEMPLO (instrucciones animadas)
// ======================================================================
const DEMO_NAMES = [['Ana', '🦊'], ['Leo', '🐼'], ['Sara', '🐸'], ['Hugo', '🐯'], ['Lola', '🦄'], ['Max', '🐙']];
function startDemo(gameId) {
  const g = getGame(gameId);
  const d = g.demo();
  d.state.demo = true;
  const n = d.state.n;
  S.mode = 'demo';
  S.room = {
    code: null, hostPid: 'D0', sel: g.id, gameId: g.id, gameNo: (S.room && S.room.gameNo || 0) + 1, state: d.state,
    players: DEMO_NAMES.slice(0, n).map(([name, avatar], i) => ({ pid: 'D' + i, name, avatar, online: true })),
    seats: DEMO_NAMES.slice(0, n).map((_, i) => 'D' + i), teamMode: false, teams: {}, opts: {},
  };
  S.demo = { steps: d.steps, i: 0, say: '¡Mira cómo se juega!', done: false, timer: null };
  S.modal = null;
  onRoomUpdated();
  S.demo.timer = setTimeout(demoNext, 1600);
}
function demoNext() {
  if (S.mode !== 'demo') return;
  const st = S.demo.steps[S.demo.i];
  if (!st) { S.demo.done = true; S.demo.say = '¡Ya sabes jugar! 🎉'; fx.confetti(120); sound.play('win'); render(); return; }
  S.demo.i++;
  S.demo.say = st.say;
  render();
  S.demo.timer = setTimeout(() => {
    if (S.mode !== 'demo') return;
    if (st.patch) { st.patch(S.room.state); S.room.state.v++; }
    if (st.a) { const err = doAction(st.seat, st.a); if (err) console.warn('demo', err); } else onRoomUpdated();
    S.demo.timer = setTimeout(demoNext, st.wait || 2300);
  }, st.a || st.patch ? 1300 : 600);
}

function renderModal() {
  document.querySelectorAll('.modal').forEach((m) => m.remove());
  const m = S.modal;
  if (!m) return;
  const d = document.createElement('div');
  d.className = 'modal';
  if (m.type === 'avatar') {
    const target = m.local != null ? S.room.players[m.local] : me;
    d.innerHTML = `<div class="sheet"><h3>Elige tu figurita</h3><div class="avgrid">${AVATARS.map((a) => `<button class="${a === target.avatar ? 'on' : ''}" data-av="${a}">${a}</button>`).join('')}</div><button class="btn" data-close>Cerrar</button></div>`;
    d.querySelectorAll('[data-av]').forEach((b) => b.onclick = () => {
      target.avatar = b.dataset.av;
      if (m.local == null) saveMe();
      S.modal = null; render();
    });
  } else if (m.type === 'invitefriends') {
    const inRoom = new Set(S.room.players.map((p) => p.pid));
    const list = friends.filter((f) => !inRoom.has(f.pid));
    d.innerHTML = `<div class="sheet"><h3>👥 Invitar amigos</h3>
      ${list.length ? `<div class="friendlist">${list.map((f) => `<div class="friend"><span class="favatar">${f.avatar}</span><div class="grow"><b>${esc(f.name)}</b><small>${f.pid}</small></div><button class="btn small c2" data-inv="${f.pid}">📨 Invitar</button></div>`).join('')}</div>`
        : '<p class="hint">No tienes amigos guardados todavía. Comparte el código o el enlace por WhatsApp.</p>'}
      <p class="hint">La invitación les llega si tienen la app abierta.</p>
      <button class="btn" data-close>Cerrar</button></div>`;
    d.querySelectorAll('[data-inv]').forEach((b) => b.onclick = () => inviteFriend(friends.find((f) => f.pid === b.dataset.inv), b));
  } else if (m.type === 'invite') {
    const inv = m.inv;
    const g = getGame(inv.game);
    d.innerHTML = `<div class="sheet invite"><div class="bigemoji">${esc(inv.from.avatar)}</div>
      <h3>¡${esc(inv.from.name)} te invita a jugar!</h3>
      <p>${g ? `${g.icon} ${g.name} · ` : ''}Sala <b>${esc(inv.code)}</b></p>
      <div class="row"><button class="btn big c1" data-acc>🎉 ¡Vamos!</button><button class="btn" data-close>Ahora no</button></div></div>`;
    d.querySelector('[data-acc]').onclick = () => { S.modal = null; if (S.mode) leave(true); S.tab = 'play'; joinRoom(inv.code); };
  } else if (m.type === 'rules') {
    const g = getGame(m.gameId);
    d.innerHTML = `<div class="sheet rules"><div class="rulehead" style="--gc:${g.color}"><span class="gicon">${g.icon}</span><h3>Cómo se juega: ${g.name}</h3></div>
      <div class="ruletext">${g.rules || ''}</div>
      ${g.demo && !S.mode ? `<button class="btn big c1" data-demo="${g.id}">▶ Ver partida de ejemplo</button>` : ''}
      <button class="btn" data-close>Cerrar</button><p class="hint center">Juegos con Amigos · versión ${VERSION}</p></div>`;
    d.querySelectorAll('[data-demo]').forEach((b) => b.onclick = () => { sound.play('click'); startDemo(b.dataset.demo); });
  } else if (m.type === 'confirmleave') {
    const inGame = S.screen === 'game';
    const b = [];
    if (inGame && (S.mode === 'host' || S.mode === 'local')) b.push('<button class="btn big c3" data-tolobby>🏠 Volver a la sala (el grupo sigue)</button>');
    if (inGame && S.mode === 'client') b.push('<button class="btn big c3" data-ask>🙋 Pedir al anfitrión volver a la sala</button>');
    b.push(`<button class="btn big c1" data-yes>${S.mode === 'host' ? '🚪 Cerrar el grupo para todos' : S.mode === 'local' ? '🚪 Salir al inicio' : '🚪 Salir del grupo'}</button>`);
    b.push(`<button class="btn big" data-close>${inGame ? '🎮 Seguir jugando' : 'Cancelar'}</button>`);
    d.innerHTML = `<div class="sheet"><h3>${inGame ? '¿Qué quieres hacer?' : '¿Salir de la sala?'}</h3><div class="stack">${b.join('')}</div></div>`;
    d.querySelector('[data-yes]').onclick = () => leave();
    const tl = d.querySelector('[data-tolobby]'); if (tl) tl.onclick = () => { S.modal = null; d.remove(); backToLobby(); };
    const ask = d.querySelector('[data-ask]'); if (ask) ask.onclick = () => { S.conn && S.conn.send({ t: 'askLobby' }); S.modal = null; d.remove(); toast('🙋 Petición enviada al anfitrión'); };
  } else if (m.type === 'asklobby') {
    d.innerHTML = `<div class="sheet"><div class="bigemoji">${esc(m.avatar)}</div><h3>${esc(m.name)} quiere volver a la sala</h3><div class="stack"><button class="btn big c3" data-tolobby>🏠 Volver todos a la sala</button><button class="btn big" data-close>🎮 Seguir jugando</button></div></div>`;
    d.querySelector('[data-tolobby]').onclick = () => { S.modal = null; d.remove(); backToLobby(); };
  } else if (m.type === 'chat') {
    const laughs = ['Jajaja 😂', 'JAJAJA 🤣', 'Jejeje 😏', 'Jiji 🤭', 'Muajaja 😈'];
    const quick = ['¡Hola! 👋', '¡Bien jugado! 👏', '¡Te voy a ganar! 😎', '¡Qué suerte! 🍀', '¡Venga, que te toca! ⏰', '¡Nooo! 😱', '¡Toma ya! 💪', 'Jajaja 😂', '¡Gracias! 🙏', 'Uff… 😅', '¡Revancha! 🔁', '¡Buena partida! 🤝'];
    const emos = ['😂', '😎', '😡', '😱', '👏', '🔥', '❤️', '🤞', '🥳', '😭', '🙈', '👍', '😴', '🤯', '💩', '🎉'];
    d.innerHTML = `<div class="sheet chatsheet"><h3>💬 Chat</h3>
      <div class="chatlog">${(S.chat || []).slice(-30).map((c) => `<div class="cmsg ${c.pid === me.pid ? 'mine' : ''}"><span>${esc(c.avatar)}</span><div><b>${esc(c.name)}</b>${esc(c.text)}</div></div>`).join('') || '<p class="hint center">Aún no hay mensajes</p>'}</div>
      <div class="chips quick laughs">${laughs.map((q) => `<button class="chip" data-say="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="chips quick">${quick.map((q) => `<button class="chip" data-say="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="emogrid">${emos.map((e) => `<button data-say="${e}">${e}</button>`).join('')}</div>
      <details class="typeit"><summary>✏️ Escribir otra cosa</summary><div class="row"><input id="chatin" maxlength="80" placeholder="Escribe un mensaje…"><button class="btn c2" data-send>Enviar</button></div></details>
      <button class="btn" data-close>Cerrar</button></div>`;
    const send = (t) => { sendChat(t); S.modal = null; d.remove(); };
    d.querySelectorAll('[data-say]').forEach((b) => b.onclick = () => send(b.dataset.say));
    d.querySelector('[data-send]').onclick = () => { const v = d.querySelector('#chatin').value.trim(); if (v) send(v); };
    d.querySelector('#chatin').onkeydown = (e) => { if (e.key === 'Enter') d.querySelector('[data-send]').click(); };
    const log = d.querySelector('.chatlog'); log.scrollTop = log.scrollHeight;
  }
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) { S.modal = null; d.remove(); } });
  document.body.appendChild(d);
}

function bind() {
  const on = (sel, fn) => app.querySelectorAll(sel).forEach((el) => { el.onclick = (e) => fn(el, e); });
  const name = app.querySelector('#name');
  if (name) name.oninput = () => { me.name = name.value.trim().slice(0, 16); saveMe(); };
  const code = app.querySelector('#code');
  if (code) code.oninput = () => { code.value = code.value.toUpperCase(); };

  on('[data-tab]', (el) => { S.tab = el.dataset.tab; sound.play('click'); render(); });
  on('[data-a]', (el) => {
    const a = el.dataset.a;
    if (a === 'teammode') return;
    sound.play('click');
    const r = S.room;
    switch (a) {
      case 'create': createRoom(); break;
      case 'join': joinRoom(app.querySelector('#code').value); break;
      case 'local': startLocal(); break;
      case 'avatar': S.modal = { type: 'avatar' }; renderModal(); break;
      case 'uncurtain': S.curtainSeat = getGame(r.gameId).turnOf(r.state); render(); break;
      case 'demoagain': { const id = r.gameId; clearTimeout(S.demo.timer); startDemo(id); break; }
      case 'leave': if (S.screen === 'connecting' || S.mode === 'demo') leave(true); else { S.modal = { type: 'confirmleave' }; renderModal(); } break;
      case 'chat': S.modal = { type: 'chat' }; renderModal(); break;
      case 'mute': sound.toggleMute(); el.textContent = sound.isMuted() ? '🔇' : '🔊'; break;
      case 'start': startGame(); break;
      case 'rematch': rematch(); break;
      case 'lobby': backToLobby(); break;
      case 'share': (async () => {
        const text = inviteText(r.code);
        if (navigator.share) { try { await navigator.share({ title: 'Juegos con Amigos', text }); return; } catch {} }
        if (await copy(text)) toast('📋 Invitación copiada, pégala donde quieras');
      })(); break;
      case 'shareapp': (async () => {
        const text = `🎲 ¡Descárgate Juegos con Amigos y jugamos juntos! ${DOWNLOAD_URL}`;
        if (navigator.share) { try { await navigator.share({ title: 'Juegos con Amigos', text }); return; } catch {} }
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
      })(); break;
      case 'invitefriends': S.modal = { type: 'invitefriends' }; renderModal(); break;
      case 'shuffleteams': {
        const ps = shuffle(r.players.filter((p) => p.online).map((p) => p.pid));
        const k = r.players.length >= 6 && getGame(r.sel).teams !== 'pairs4' && ps.length % 3 === 0 ? 3 : 2;
        ps.forEach((pid, i) => { r.teams[pid] = i % k; });
        r.teamDraw = (r.teamDraw || 0) + 1; // todos ven la animación del sorteo
        broadcastRoom(); break;
      }
      case 'addlocal': {
        const n = r.players.length + 1;
        r.players.push({ pid: 'L' + n + randCode(2), name: 'Jugador ' + n, avatar: AVATARS[(n * 5) % AVATARS.length], online: true });
        render(); break;
      }
      case 'addbot': {
        const names = ['Robotín', 'Chispas', 'Tuerca', 'Bip-Bop', 'Pixel'];
        const nb = r.players.filter((p) => p.bot).length;
        r.players.push({ pid: 'B' + nb + randCode(3), name: names[nb % names.length], avatar: ['🤖', '👾', '🦾', '🛸', '🎰'][nb % 5], online: true, bot: true });
        if (S.mode === 'host') broadcastRoom(); else render(); break;
      }
      case 'delbot': {
        const i = r.players.map((p) => !!p.bot).lastIndexOf(true);
        if (i >= 0) { r.players.splice(i, 1); if (S.mode === 'host') broadcastRoom(); else render(); }
        break;
      }
      case 'addwish': {
        const n = app.querySelector('#wname').value.trim();
        if (!n) { toast('Escribe el nombre del juego'); return; }
        wishlist.unshift({ name: n, note: app.querySelector('#wnote').value.trim(), added: Date.now() });
        LS.set('wishlist', wishlist); toast('🌟 ¡Apuntado!'); render(); break;
      }
      case 'copycode': copy(me.pid).then((ok) => ok && toast('📋 Código copiado')); break;
      case 'addfriend': {
        const c = app.querySelector('#fcode').value.trim().toUpperCase();
        const n = app.querySelector('#fname').value.trim();
        if (c.length !== 6) { toast('El código de amigo tiene 6 caracteres'); return; }
        if (c === me.pid) { toast('¡Ese eres tú! 😄'); return; }
        upsertFriend({ pid: c, name: n || 'Amigo', avatar: '🙂' }); toast('👥 Amigo guardado'); render(); break;
      }
    }
  });
  const tm = app.querySelector('[data-a="teammode"]');
  if (tm) tm.onchange = () => { S.room.teamMode = tm.checked; if (tm.checked && !Object.keys(S.room.teams).length) S.room.players.forEach((p, i) => { S.room.teams[p.pid] = i % 2; }); broadcastRoom(); };
  on('[data-rules]', (el) => { S.modal = { type: 'rules', gameId: el.dataset.rules }; sound.play('click'); renderModal(); });
  on('[data-demo]', (el) => { sound.play('click'); startDemo(el.dataset.demo); });
  on('[data-opt]', (el) => {
    const r = S.room; const [gid, oid, val] = el.dataset.opt.split('|');
    const op = getGame(gid).options.find((o) => o.id === oid);
    r.opts[gid] = r.opts[gid] || {};
    r.opts[gid][oid] = op.type === 'bool' ? !(gameOptions(r, getGame(gid))[oid]) : op.choices[+val].v;
    sound.play('click'); broadcastRoom();
  });
  on('[data-mode]', (el) => {
    const r = S.room; r.teamMode = el.dataset.mode === 'teams';
    if (r.teamMode && !Object.keys(r.teams).length) r.players.forEach((p, i) => { r.teams[p.pid] = i % 2; });
    sound.play('click'); broadcastRoom();
  });
  on('[data-sel]', (el) => { S.room.sel = el.dataset.sel; S.pickOpen = false; sound.play('click'); broadcastRoom(); });
  const dd = app.querySelector('.pickdd'); if (dd) dd.addEventListener('toggle', () => { S.pickOpen = dd.open; });
  on('[data-team]', (el) => { const r = S.room; const pid = el.dataset.team; r.teams[pid] = ((r.teams[pid] ?? 0) + 1) % (r.players.length >= 6 ? 3 : 2); sound.play('click'); broadcastRoom(); });
  on('[data-delwish]', (el) => { wishlist.splice(+el.dataset.delwish, 1); LS.set('wishlist', wishlist); render(); });
  on('[data-delfriend]', (el) => { friends.splice(+el.dataset.delfriend, 1); saveFriends(); render(); });
  on('[data-rmlocal]', (el) => { S.room.players.splice(+el.dataset.rmlocal, 1); render(); });
  on('[data-lavatar]', (el) => { S.modal = { type: 'avatar', local: +el.dataset.lavatar }; renderModal(); });
  app.querySelectorAll('[data-lname]').forEach((inp) => { inp.oninput = () => { const p = S.room.players[+inp.dataset.lname]; p.name = inp.value.slice(0, 16) || 'Jugador'; if (+inp.dataset.lname === 0) { me.name = p.name; saveMe(); } }; });
}

// Botón "atrás" de Android: no cierra la app de golpe en mitad de una partida
history.pushState({ app: 1 }, '');
window.addEventListener('popstate', () => {
  history.pushState({ app: 1 }, '');
  if (S.modal) { S.modal = null; renderModal(); return; }
  if (S.mode) { S.modal = { type: 'confirmleave' }; renderModal(); }
  else if (S.tab !== 'play') { S.tab = 'play'; render(); }
});

// Enlace de invitación (?sala=CODE): ir directo a unirse
render();
if (params.get('sala') && me.name && !TEST) joinRoom(params.get('sala'));
window.__jca = { S, me, doAction }; // para depurar y para las pruebas automáticas
