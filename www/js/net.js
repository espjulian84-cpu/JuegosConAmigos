// Capa de red. Por defecto usa WebRTC (PeerJS): los móviles se conectan
// directamente entre sí; el servidor de PeerJS solo sirve para "presentarlos".
// Con ?net=local usa BroadcastChannel (varias pestañas del mismo navegador, para pruebas).

const PREFIX = 'juegosconamigos-v1-';
const useLocal = new URLSearchParams(location.search).get('net') === 'local';

function peerOpts() {
  return {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        // Servidor puente público y gratuito: se usa solo si la red (p. ej. datos móviles)
        // no permite la conexión directa entre los dos móviles.
        { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
      ],
    },
  };
}

export function errorText(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'No existe ninguna sala con ese código.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Sin conexión a internet o servidor no disponible.';
  if (t === 'browser-incompatible') return 'Este dispositivo no admite conexiones WebRTC.';
  return (e && e.message) || 'Error de conexión';
}

// ---------- Anfitrión ----------
export function hostRoom(code, h) {
  return useLocal ? localHost(code, h) : peerHost(code, h);
}
export function joinRoom(code, h) {
  return useLocal ? localJoin(code, h) : peerJoin(code, h);
}

function peerHost(code, h) {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(PREFIX + code, peerOpts());
    const conns = new Map();
    let opened = false;
    const api = {
      send(id, m) { const c = conns.get(id); if (c && c.open) c.send(m); },
      broadcast(m) { for (const c of conns.values()) if (c.open) c.send(m); },
      drop(id) { const c = conns.get(id); if (c) c.close(); },
      close() { try { peer.destroy(); } catch {} },
    };
    peer.on('open', () => { opened = true; resolve(api); });
    peer.on('error', (e) => { if (!opened) { reject(e); peer.destroy(); } else h.onError && h.onError(e); });
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch {} }, 1500); });
    peer.on('connection', (conn) => {
      conn.on('open', () => { conns.set(conn.connectionId, conn); h.onConn(conn.connectionId); });
      conn.on('data', (d) => h.onMsg(conn.connectionId, d));
      conn.on('close', () => { conns.delete(conn.connectionId); h.onClose(conn.connectionId); });
      conn.on('error', () => {});
    });
  });
}

function peerJoin(code, h) {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(undefined, peerOpts());
    let done = false;
    const finish = (err, val) => {
      if (done) return; done = true; clearTimeout(timer);
      if (err) { try { peer.destroy(); } catch {} reject(err); } else resolve(val);
    };
    const timer = setTimeout(() => finish(new Error('No se pudo conectar con la sala (tiempo agotado).')), 15000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => finish(null, {
        send: (m) => { if (conn.open) conn.send(m); },
        close: () => { try { peer.destroy(); } catch {} },
      }));
      conn.on('data', (d) => h.onMsg(d));
      conn.on('close', () => h.onClose());
      conn.on('error', () => {});
    });
    peer.on('error', (e) => { if (!done) finish(e); });
  });
}

// ---------- Modo local (pruebas en el mismo navegador) ----------
function localHost(code, h) {
  const ch = new BroadcastChannel('jca-' + code);
  const conns = new Set();
  ch.onmessage = (e) => {
    const m = e.data;
    if (m.to !== 'host') return;
    if (m.kind === 'open') { conns.add(m.from); ch.postMessage({ to: m.from, kind: 'opened' }); h.onConn(m.from); }
    else if (m.kind === 'data' && conns.has(m.from)) h.onMsg(m.from, m.data);
    else if (m.kind === 'close') { conns.delete(m.from); h.onClose(m.from); }
  };
  const api = {
    send(id, d) { ch.postMessage({ to: id, kind: 'data', data: d }); },
    broadcast(d) { for (const id of conns) api.send(id, d); },
    drop(id) { conns.delete(id); ch.postMessage({ to: id, kind: 'close' }); },
    close() { for (const id of conns) ch.postMessage({ to: id, kind: 'close' }); ch.close(); },
  };
  return Promise.resolve(api);
}

function localJoin(code, h) {
  return new Promise((resolve, reject) => {
    const ch = new BroadcastChannel('jca-' + code);
    const me = 'c' + Math.random().toString(36).slice(2, 9);
    let ok = false;
    const timer = setTimeout(() => { if (!ok) { ch.close(); reject({ type: 'peer-unavailable' }); } }, 2000);
    ch.onmessage = (e) => {
      const m = e.data;
      if (m.to !== me) return;
      if (m.kind === 'opened' && !ok) {
        ok = true; clearTimeout(timer);
        resolve({
          send: (d) => ch.postMessage({ to: 'host', from: me, kind: 'data', data: d }),
          close: () => { ch.postMessage({ to: 'host', from: me, kind: 'close' }); ch.close(); },
        });
      } else if (m.kind === 'data') h.onMsg(m.data);
      else if (m.kind === 'close') { h.onClose(); }
    };
    ch.postMessage({ to: 'host', from: me, kind: 'open' });
  });
}

// ---------- Invitaciones entre amigos ----------
// Cada móvil escucha en un canal personal (su código de amigo) mientras la app está abierta.
export function listenInvites(pid, onInvite) {
  if (useLocal) {
    const ch = new BroadcastChannel('jca-u-' + pid);
    ch.onmessage = (e) => onInvite(e.data);
    return () => ch.close();
  }
  if (!window.Peer) return () => {};
  let peer, stopped = false;
  const start = () => {
    peer = new window.Peer(PREFIX + 'u-' + pid, peerOpts());
    peer.on('connection', (conn) => {
      conn.on('data', (d) => { onInvite(d); try { conn.send({ ok: true }); } catch {} setTimeout(() => conn.close(), 1000); });
    });
    peer.on('disconnected', () => { if (!stopped && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch {} }, 3000); });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && !stopped) { peer.destroy(); setTimeout(start, 20000); }
      else if ((e.type === 'network' || e.type === 'server-error') && !stopped) { peer.destroy(); setTimeout(start, 10000); }
    });
  };
  start();
  return () => { stopped = true; try { peer.destroy(); } catch {} };
}

export function sendInvite(pid, payload) {
  if (useLocal) {
    const ch = new BroadcastChannel('jca-u-' + pid);
    ch.postMessage(payload); ch.close();
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const peer = new window.Peer(undefined, peerOpts());
    let done = false;
    const end = (ok) => { if (done) return; done = true; clearTimeout(t); setTimeout(() => { try { peer.destroy(); } catch {} }, 500); resolve(ok); };
    const t = setTimeout(() => end(false), 10000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + 'u-' + pid, { reliable: true, serialization: 'json' });
      conn.on('open', () => conn.send(payload));
      conn.on('data', () => end(true));
    });
    peer.on('error', () => end(false));
  });
}
