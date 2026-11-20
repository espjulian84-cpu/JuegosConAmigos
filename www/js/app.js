// Juegos con Amigos — capa de aplicación: pantallas, salas, amigos, invitaciones.
// El móvil que crea la sala es el "anfitrión": aplica las reglas (motores en games/)
// y reparte el estado a los demás. Los demás solo envían sus jugadas.

import { GAMES, getGame } from './games/index.js';
import * as net from './net.js';
import * as sound from './sound.js';
import * as fx from './fx.js';
import { esc, PLAYER_COLORS, TEAM_NAMES, TEAM_EMOJI, TEAM_COLORS, GameError } from './util.js';
import { qrcode } from '../vendor/qrcode.mjs';

const WEB_URL = 'https://espjulian84-cpu.github.io/JuegosConAmigos/';
const AVATARS = ['🦊', '🐼', '🐸', '🐯', '🐵', '🐰', '🦄', '🐙', '🐨', '🦁', '🐷', '🐮', '🐔', '🐧', '🐲', '🦖', '👽', '🤖', '🐶', '🐱', '🦉', '🐢', '🦋', '🐝'];
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
  if (!p || !p.pid || p.pid === me.pid || p.pid.startsWith('L')) return;
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
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const webBase = () => (isNative() || location.protocol === 'file:' ? WEB_URL : location.origin + location.pathname);
const inviteUrl = (code) => `${webBase()}?sala=${code}`;
function inviteText(code) {
  const g = S.room && getGame(S.room.sel);
  return `🎲 ¡${me.name} te invita a jugar${g ? ' al ' + g.name : ''}! Abre la app Juegos con Amigos y entra con el código ${code}, o juega desde el navegador: ${inviteUrl(code)}`;
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
      S.room = { code, hostPid: me.pid, players: [{ ...me, online: true }], sel: GAMES[0].id, teamMode: false, teams: {}, gameId: null, seats: null, state: null, gameNo: 0 };
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
    p.online = true;
    for (const [cid, ppid] of S.connPid) if (ppid === pid && cid !== connId) S.connPid.delete(cid);
    S.connPid.set(connId, pid);
    broadcastRoom();
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

function broadcastRoom() {
  if (S.mode === 'host') S.host.broadcast({ t: 'room', room: S.room });
  onRoomUpdated();
}

function doAction(seat, action) {
  const r = S.room;
  if (seat == null || seat < 0) return 'Estás mirando la partida';
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
  let order = r.players.filter((p) => p.online).map((p) => p.pid);
  let teams = null;
  if (r.teamMode) {
    // sienta a los equipos alternados (compañeros enfrente) y numera los equipos 0,1,2…
    const groups = new Map();
    order.forEach((pid) => { const t = r.teams[pid] ?? 0; if (!groups.has(t)) groups.set(t, []); groups.get(t).push(pid); });
    const lists = [...groups.values()];
    order = []; teams = [];
    for (let k = 0; order.length < r.players.filter((p) => p.online).length; k++) {
      lists.forEach((l, ti) => { if (l[k]) { order.push(l[k]); teams.push(ti); } });
    }
  }
  r.seats = order;
  r.teamsArr = teams;
  r.gameId = g.id;
  r.gameNo = (r.gameNo || 0) + 1;
  r.state = g.setup(order.length, { teams });
  r.players.forEach(upsertFriend);
  broadcastRoom();
}

function rematch() {
  const r = S.room;
  const g = getGame(r.gameId);
  r.gameNo++;
  r.state = g.setup(r.seats.length, { teams: r.teamsArr });
  broadcastRoom();
}
function backToLobby() {
  const r = S.room;
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
  S.conn.send({ t: 'hello', pid: me.pid, name: me.name, avatar: me.avatar });
}
function clientMsg(m) {
  if (S.mode !== 'client') return;
  S.lastMsg = Date.now();
  if (m.t === 'room') { S.room = m.room; S.reconnecting = false; onRoomUpdated(); }
  else if (m.t === 'err') { toast(m.msg); if (m.fatal) leave(true); }
  else if (m.t === 'ping') S.conn && S.conn.send({ t: 'pong' });
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
  S.mode = null; S.room = null; S.host = null; S.conn = null; S.reconnecting = false;
  S.connPid.clear(); S.screen = 'home'; S.modal = null;
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
    code: null, hostPid: me.pid, sel: GAMES[0].id, teamMode: false, teams: {}, gameId: null, seats: null, state: null, gameNo: 0,
    players: [{ ...me, online: true }, { pid: 'L2', name: 'Jugador 2', avatar: AVATARS[1], online: true }],
  };
  S.screen = 'lobby'; render();
}

// ======================================================================
//  EVENTOS DE SALA → pantalla, sonidos y efectos
// ======================================================================
function onRoomUpdated() {
  const r = S.room;
  if (!r) return;
  if (r.gameId && r.state) {
    if (S.screen !== 'game' || S.gameNo !== r.gameNo) { S.screen = 'game'; S.ui = {}; S.gameNo = r.gameNo; S.lastFx = null; S.lastV = null; S.wasMine = false; }
    playEffects();
  } else if (S.screen === 'game' || S.screen === 'connecting') S.screen = 'lobby';
  render();
}

function mySeat() {
  const r = S.room;
  if (!r || !r.seats) return null;
  if (S.mode === 'local') { const t = getGame(r.gameId).turnOf(r.state); return t == null ? (r.state.winner ?? 0) : t; }
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
  if (rolled) sound.play('dice');
  const f = s.fx;
  if (f && S.lastFx !== f.id) {
    S.lastFx = f.id;
    const delay = rolled ? 650 : 150;
    setTimeout(() => {
      const kind = f.type === 'win' ? 'win' : f.type === 'capture' ? 'capture' : f.type === 'bad' ? 'bad' : 'special';
      sound.play(kind === 'win' ? 'win' : kind);
      fx.banner(f.text, f.emoji || (kind === 'win' ? '🏆' : '✨'), kind);
      if (kind === 'win') { fx.confetti(220); vibrate([100, 60, 100, 60, 300]); }
      else if (kind === 'capture') { fx.confetti(60); vibrate(120); }
      else if (kind === 'special') vibrate(40);
    }, delay);
  } else if (!rolled) sound.play(g.id === 'muros' ? 'place' : 'move');
  if (S.mode !== 'local') {
    const mine = g.turnOf(s) === mySeat() && mySeat() != null;
    if (mine && !S.wasMine) setTimeout(() => { sound.play('turn'); vibrate(60); }, rolled ? 900 : 300);
    S.wasMine = mine;
  }
}

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
        <div class="logo"><span>🎲</span><span>🪿</span><span>${getGame('domino').icon}</span><span>🧱</span></div>
        <h1>Juegos con Amigos</h1>
        <p>Hasta 6 jugadores, cada uno en su móvil</p>
      </div>
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
      <p class="foot">Los móviles se conectan por internet (wifi o datos). Tu código de amigo: <b>${me.pid}</b></p>`;
  } else if (S.tab === 'games') {
    body = `
      <h2 class="sect">🎮 Juegos disponibles</h2>
      <div class="gamelist">${GAMES.map((g) => `
        <div class="gamecard" style="--gc:${g.color}">
          <div class="gicon">${g.icon}</div>
          <div class="grow"><h3>${g.name}</h3><p>${g.blurb}</p>
          <div class="tags"><span>👤 ${g.minPlayers}-${g.maxPlayers}</span>${g.teams ? '<span>🤝 Equipos</span>' : ''}</div></div>
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
      <div class="grow">${local ? `<input class="lname" data-lname="${i}" maxlength="16" value="${esc(p.name)}">` : `<b>${esc(p.name)}</b>${p.pid === r.hostPid ? ' 👑' : ''}${p.pid === me.pid ? ' <small>(tú)</small>' : ''}`}</div>
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
      <div class="qr" title="Escanea para jugar desde el navegador">${qrSVG(inviteUrl(r.code))}</div>
    </div>`;

  const picker = isHost ? `
    <h2 class="sect">Elige juego</h2>
    <div class="gamepick">${GAMES.map((x) => `
      <button class="gp ${x.id === r.sel ? 'on' : ''}" data-sel="${x.id}" style="--gc:${x.color}">
        <span class="gpi">${x.icon}</span><b>${x.name}</b><small>${x.minPlayers}-${x.maxPlayers} jug.</small></button>`).join('')}</div>
    ${g.teams ? `<div class="teamrow">
      <label class="switch"><input type="checkbox" data-a="teammode" ${r.teamMode ? 'checked' : ''}><span></span> 🤝 Por equipos${g.teams === 'pairs4' ? ' (parejas)' : ''}</label>
      ${r.teamMode ? '<button class="btn small" data-a="shuffleteams">🔀 Al azar</button>' : ''}
    </div>` : ''}
    ${local && r.players.length < MAX_PLAYERS ? '<button class="btn ghost" data-a="addlocal">➕ Añadir jugador</button>' : ''}
    <button class="btn big startbtn ${err ? 'disabled' : 'pulse'}" data-a="start">${err ? '⏳ ' + esc(err) : `▶ ¡Empezar ${g.name}!`}</button>`
    : `<div class="card waiting"><div class="gpi big">${g.icon}</div><div>Juego elegido: <b>${g.name}</b>${r.teamMode ? ' · 🤝 por equipos' : ''}</div><div class="dots">Esperando a que el anfitrión empiece<span>.</span><span>.</span><span>.</span></div></div>`;

  return `
    <header class="topbar"><button class="iconbtn" data-a="leave">←</button><div class="grow title">${local ? '📱 En este móvil' : '🏠 Sala de espera'}</div><button class="iconbtn" data-a="mute">${sound.isMuted() ? '🔇' : '🔊'}</button></header>
    ${S.reconnecting ? '<div class="reconnect">📡 Reconectando…</div>' : ''}
    <div class="lobby">
      ${invite}
      <h2 class="sect">Jugadores (${r.players.length}/${MAX_PLAYERS})</h2>
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

function makeCtx() {
  const r = S.room;
  const seatPlayers = r.seats.map((pid) => r.players.find((p) => p.pid === pid) || { name: '¿?', avatar: '❔' });
  const names = seatPlayers.map((p) => p.name);
  const s = r.state;
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
    rerender: () => renderGame(fx.snapshot(document.getElementById('board'))),
    send: (action) => {
      sound.play('click');
      if (S.mode === 'client') { S.conn && S.conn.send({ t: 'act', action }); return; }
      const err = doAction(S.mode === 'local' ? mySeat() : r.seats.indexOf(me.pid), action);
      if (err) { toast(err); fx.shake(document.getElementById('board')); }
    },
  };
}

function renderGame(before) {
  const r = S.room, g = getGame(r.gameId), s = r.state;
  const isHost = S.mode !== 'client';
  const offline = r.players.filter((p) => !p.online && r.seats.includes(p.pid));
  app.innerHTML = `
    <header class="topbar" style="--gc:${g.color}">
      <button class="iconbtn" data-a="leave">✕</button>
      <div class="grow title">${g.icon} ${g.name}</div>
      ${r.code ? `<span class="codepill">${r.code}</span>` : ''}
      <button class="iconbtn" data-a="mute">${sound.isMuted() ? '🔇' : '🔊'}</button>
    </header>
    ${S.reconnecting ? '<div class="reconnect">📡 Reconectando…</div>' : ''}
    ${offline.length ? `<div class="reconnect warn">😴 Sin conexión: ${offline.map((p) => esc(p.name)).join(', ')}</div>` : ''}
    ${S.mode === 'local' && g.turnOf(s) != null ? `<div class="localturn">${makeCtx().avatar(g.turnOf(s))} Pasa el móvil a <b>${esc(makeCtx().players[g.turnOf(s)])}</b></div>` : ''}
    <main id="board" class="board-${g.id}"></main>
    ${g.isOver(s) ? `<div class="endbar">${isHost
      ? '<button class="btn big c1" data-a="rematch">🔁 Revancha</button><button class="btn big" data-a="lobby">🏠 Cambiar de juego</button>'
      : '<div class="hint">Esperando al anfitrión para la revancha…</div>'}</div>` : ''}`;
  const board = document.getElementById('board');
  g.render(board, s, makeCtx());
  fx.animateFrom(board, before);
  bind();
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
  } else if (m.type === 'confirmleave') {
    d.innerHTML = `<div class="sheet"><h3>¿Salir de la ${S.mode === 'local' ? 'partida' : 'sala'}?</h3>${S.mode === 'host' ? '<p class="hint">Eres el anfitrión: la sala se cerrará para todos.</p>' : ''}
      <div class="row"><button class="btn c1" data-yes>Salir</button><button class="btn" data-close>Seguir jugando</button></div></div>`;
    d.querySelector('[data-yes]').onclick = () => leave();
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
      case 'leave': if (S.screen === 'connecting') leave(true); else { S.modal = { type: 'confirmleave' }; renderModal(); } break;
      case 'mute': sound.toggleMute(); el.textContent = sound.isMuted() ? '🔇' : '🔊'; break;
      case 'start': startGame(); break;
      case 'rematch': rematch(); break;
      case 'lobby': backToLobby(); break;
      case 'share': (async () => {
        const text = inviteText(r.code);
        if (navigator.share) { try { await navigator.share({ title: 'Juegos con Amigos', text }); return; } catch {} }
        if (await copy(text)) toast('📋 Invitación copiada, pégala donde quieras');
      })(); break;
      case 'invitefriends': S.modal = { type: 'invitefriends' }; renderModal(); break;
      case 'shuffleteams': {
        const ps = r.players.filter((p) => p.online).map((p) => p.pid).sort(() => Math.random() - 0.5);
        const k = getGame(r.sel).teams === 'pairs4' || ps.length % 3 ? 2 : (ps.length >= 6 ? 3 : 2);
        ps.forEach((pid, i) => { r.teams[pid] = i % k; });
        broadcastRoom(); break;
      }
      case 'addlocal': {
        const n = r.players.length + 1;
        r.players.push({ pid: 'L' + n + randCode(2), name: 'Jugador ' + n, avatar: AVATARS[(n * 5) % AVATARS.length], online: true });
        render(); break;
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
  on('[data-sel]', (el) => { S.room.sel = el.dataset.sel; sound.play('click'); broadcastRoom(); });
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
window.__jca = { S, me }; // para depurar
