const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 4175);
const HOST = process.env.HOST || '0.0.0.0';
const DIST = path.resolve(__dirname, '..', 'dist');
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS || 2 * 60 * 60 * 1000);
const rooms = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function send(socket, payload) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function otherSocket(room, playerIndex) {
  return room.clients[playerIndex === 0 ? 1 : 0];
}

function attachPlayer(socket, room, playerIndex, token) {
  const previous = room.clients[playerIndex];
  if (previous && previous !== socket && previous.readyState === WebSocket.OPEN) previous.close(4001, 'Sesión reemplazada');
  room.clients[playerIndex] = socket;
  socket.roomCode = room.code;
  socket.playerIndex = playerIndex;
  socket.sessionToken = token;
  room.updatedAt = Date.now();
}

function createRoom(socket, message) {
  const code = String(message.code || '').toUpperCase();
  if (!/^LAB-\d{4}$/.test(code)) return send(socket, { type: 'room-error', code: 'invalid-code', message: 'Código de sala inválido.' });
  const existing = rooms.get(code);
  if (existing && existing.clients.some(client => client && client.readyState === WebSocket.OPEN)) {
    return send(socket, { type: 'room-error', code: 'code-used', message: 'Ese código ya está ocupado. Creá otra sala.' });
  }
  const token = crypto.randomUUID();
  const room = {
    code,
    state: message.state || null,
    clients: [null, null],
    tokens: [token, null],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  rooms.set(code, room);
  attachPlayer(socket, room, 0, token);
  send(socket, { type: 'room-created', code, playerIndex: 0, token });
}

function joinRoom(socket, message) {
  const code = String(message.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return send(socket, { type: 'room-error', code: 'room-missing', message: 'La sala no existe o venció. Pedile al anfitrión un código nuevo.' });
  if (!room.clients[0] || room.clients[0].readyState !== WebSocket.OPEN) return send(socket, { type: 'room-error', code: 'host-offline', message: 'El anfitrión está desconectado. Puede volver a abrir la página para recuperar la sala.' });
  if (room.tokens[1]) return send(socket, { type: 'room-error', code: 'room-full', message: 'La sala ya tiene dos jugadores.' });
  const token = crypto.randomUUID();
  room.tokens[1] = token;
  attachPlayer(socket, room, 1, token);
  send(socket, { type: 'room-joined', code, playerIndex: 1, token });
  send(room.clients[0], { type: 'relay', data: { type: 'join', name: String(message.name || 'Jugador 2').slice(0, 18) } });
}

function resumeRoom(socket, message) {
  const code = String(message.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return send(socket, { type: 'room-error', code: 'room-missing', message: 'La sala venció y ya no puede recuperarse.' });
  const playerIndex = room.tokens.indexOf(String(message.token || ''));
  if (playerIndex < 0) return send(socket, { type: 'room-error', code: 'invalid-session', message: 'No se pudo recuperar esta sesión.' });
  attachPlayer(socket, room, playerIndex, room.tokens[playerIndex]);
  send(socket, { type: 'room-resumed', code, playerIndex, token: room.tokens[playerIndex], state: room.state, connected: Boolean(otherSocket(room, playerIndex)) });
  send(otherSocket(room, playerIndex), { type: 'peer-reconnected', playerIndex });
}

function relay(socket, message) {
  const room = rooms.get(socket.roomCode);
  if (!room || socket.playerIndex === undefined) return;
  const data = message.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'state' && socket.playerIndex === 0 && data.state) {
    room.state = data.state;
    room.updatedAt = Date.now();
  }
  send(otherSocket(room, socket.playerIndex), { type: 'relay', data });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  const relative = requestUrl.pathname === '/' ? 'index.html' : decodeURIComponent(requestUrl.pathname.slice(1));
  const filePath = path.resolve(DIST, relative);
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(filePath, (statError, stat) => {
    const resolvedPath = !statError && stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    fs.readFile(resolvedPath, (error, contents) => {
      if (error) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      response.writeHead(200, { 'content-type': mimeTypes[path.extname(resolvedPath).toLowerCase()] || 'application/octet-stream' });
      response.end(contents);
    });
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', socket => {
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return send(socket, { type: 'room-error', code: 'invalid-message', message: 'Mensaje inválido.' }); }
    if (message.type === 'create') createRoom(socket, message);
    else if (message.type === 'join') joinRoom(socket, message);
    else if (message.type === 'resume') resumeRoom(socket, message);
    else if (message.type === 'relay') relay(socket, message);
  });
  socket.on('close', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.clients[socket.playerIndex] !== socket) return;
    room.clients[socket.playerIndex] = null;
    room.updatedAt = Date.now();
    send(otherSocket(room, socket.playerIndex), { type: 'peer-disconnected', playerIndex: socket.playerIndex });
  });
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.clients.some(Boolean) && now - room.updatedAt > ROOM_TTL_MS) rooms.delete(code);
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));
server.listen(PORT, HOST, () => console.log(`Labchem disponible en http://${HOST}:${PORT}`));
