const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 15;
const MIN_PLAYERS = 2;
const DEFAULT_SECONDS = 480;
const DEFAULT_CANDIDATE_COUNT = 20;

app.use(express.static('public'));
app.get('/health', (_, res) => res.json({ ok: true }));

const locationsPath = path.join(__dirname, 'public', 'data', 'locations.json');
const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
const locationByName = new Map(locations.map(x => [x.name, x]));
const totalRoles = locations.reduce((n, x) => n + x.roles.length, 0);
const rooms = new Map();

function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  do out = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  while (rooms.has(out));
  return out;
}
function cleanName(name) { return String(name || 'Player').trim().slice(0, 18) || 'Player'; }
function choose(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function sanitizePool(names) {
  if (!Array.isArray(names)) return locations;
  const unique = [...new Set(names.map(String))].map(n => locationByName.get(n)).filter(Boolean);
  return unique.length >= 2 ? unique : locations;
}
function makeCandidateList(realLocation, pool, requestedCount) {
  const count = Math.max(2, Math.min(Number(requestedCount) || DEFAULT_CANDIDATE_COUNT, locations.length));
  const decoySource = shuffle(locations.filter(x => x.name !== realLocation.name));
  const preferred = shuffle(pool.filter(x => x.name !== realLocation.name));
  const merged = [...preferred, ...decoySource.filter(x => !preferred.some(p => p.name === x.name))];
  return shuffle([realLocation, ...merged.slice(0, count - 1)]).map(x => x.name);
}
function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    createdAt: room.createdAt,
    roundSeconds: room.roundSeconds,
    startedAt: room.startedAt,
    locationCount: locations.length,
    roleCount: totalRoles,
    selectedLocationCount: room.selectedLocationNames.length,
    spyCandidateCount: room.spyCandidateCount,
    spyCount: room.spyCount,
    currentLocationName: room.status === 'revealed' && room.current ? room.current.location.name : null,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id, name: p.name, connected: p.connected, isHost: p.id === room.hostId,
      votes: Array.from(room.votes.values()).filter(v => v === p.id).length, score: p.score || 0
    }))
  };
}
function emitRoom(room) { io.to(room.code).emit('room:update', publicRoom(room)); }
function findRoomBySocket(socketId) {
  for (const room of rooms.values()) if (room.players.has(socketId)) return room;
  return null;
}
function endRound(room, reason = 'manual') {
  if (!room || room.status !== 'playing' || !room.current) return;
  room.status = 'revealed';
  const spyNames = room.current.spies.map(id => room.players.get(id)?.name || 'Unknown');
  io.to(room.code).emit('round:reveal', {
    reason, spyNames, spyIds: room.current.spies, location: room.current.location.name,
    assignedRoles: room.current.roles, votes: Object.fromEntries(room.votes),
    spyCandidates: room.current.spyCandidates, locationCount: locations.length, roleCount: totalRoles
  });
  emitRoom(room);
}
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status === 'playing' && room.startedAt + room.roundSeconds * 1000 <= now) endRound(room, 'timeup');
  }
}, 1000);

io.on('connection', socket => {
  socket.on('room:create', ({ name }) => {
    const roomCode = code();
    const room = {
      code: roomCode, createdAt: Date.now(), hostId: socket.id, status: 'lobby',
      players: new Map(), votes: new Map(), current: null, roundSeconds: DEFAULT_SECONDS,
      startedAt: null, spyCount: 1, spyCandidateCount: DEFAULT_CANDIDATE_COUNT,
      selectedLocationNames: locations.map(x => x.name)
    };
    room.players.set(socket.id, { id: socket.id, name: cleanName(name), connected: true, score: 0 });
    rooms.set(roomCode, room); socket.join(roomCode); socket.data.roomCode = roomCode;
    socket.emit('room:joined', { code: roomCode, you: socket.id }); emitRoom(room);
  });

  socket.on('room:join', ({ name, code: roomCode }) => {
    const room = rooms.get(String(roomCode || '').trim().toUpperCase());
    if (!room) return socket.emit('error:message', 'ไม่พบห้องนี้');
    if (room.players.size >= MAX_PLAYERS && !room.players.has(socket.id)) return socket.emit('error:message', 'ห้องเต็มแล้ว สูงสุด 15 คน');
    room.players.set(socket.id, { id: socket.id, name: cleanName(name), connected: true, score: 0 });
    socket.join(room.code); socket.data.roomCode = room.code;
    socket.emit('room:joined', { code: room.code, you: socket.id }); emitRoom(room);
  });

  socket.on('room:settings', ({ selectedLocations, spyCandidateCount }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || room.status === 'playing') return;
    const pool = sanitizePool(selectedLocations);
    room.selectedLocationNames = pool.map(x => x.name);
    room.spyCandidateCount = Math.max(2, Math.min(Number(spyCandidateCount) || DEFAULT_CANDIDATE_COUNT, locations.length));
    emitRoom(room);
    socket.emit('settings:saved', { selectedLocationCount: room.selectedLocationNames.length });
  });

  socket.on('round:start', ({ seconds, spyCount, selectedLocations, spyCandidateCount }) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit('error:message', 'เฉพาะ Host เท่านั้นที่เริ่มเกมได้');
    const activePlayers = Array.from(room.players.values()).filter(p => p.connected);
    if (activePlayers.length < MIN_PLAYERS) return socket.emit('error:message', 'ต้องมีผู้เล่นอย่างน้อย 2 คน');

    const pool = sanitizePool(selectedLocations || room.selectedLocationNames);
    if (pool.length < 2) return socket.emit('error:message', 'กรุณาเลือกสถานที่อย่างน้อย 2 แห่ง');
    room.selectedLocationNames = pool.map(x => x.name);
    room.spyCandidateCount = Math.max(2, Math.min(Number(spyCandidateCount) || room.spyCandidateCount, locations.length));

    const sec = Math.max(120, Math.min(1800, Number(seconds) || DEFAULT_SECONDS));
    const safeSpyCount = Math.max(1, Math.min(Number(spyCount) || 1, Math.max(1, Math.floor(activePlayers.length / 4))));
    const selectedLocation = choose(pool);
    const spyCandidates = makeCandidateList(selectedLocation, pool, room.spyCandidateCount);
    const shuffledPlayers = shuffle(activePlayers);
    const spyIds = shuffledPlayers.slice(0, safeSpyCount).map(p => p.id);
    const roleBag = shuffle(selectedLocation.roles);
    const assigned = {};
    activePlayers.forEach((p, index) => { if (!spyIds.includes(p.id)) assigned[p.id] = roleBag[index % roleBag.length]; });

    room.status = 'playing'; room.startedAt = Date.now(); room.roundSeconds = sec;
    room.spyCount = safeSpyCount; room.votes.clear();
    room.current = { location: selectedLocation, spies: spyIds, roles: assigned, spyCandidates };

    activePlayers.forEach(p => {
      if (spyIds.includes(p.id)) {
        io.to(p.id).emit('round:secret', {
          type: 'spy', title: 'คุณคือ SPY 🕵️',
          hint: `สถานที่จริงอยู่ในรายการ ${spyCandidates.length} แห่งด้านล่าง`,
          candidates: spyCandidates, locationCount: locations.length, roleCount: totalRoles
        });
      } else {
        io.to(p.id).emit('round:secret', {
          type: 'civilian', title: 'คุณไม่ใช่ Spy ✅', location: selectedLocation.name,
          character: assigned[p.id], locationCount: locations.length, roleCount: totalRoles
        });
      }
    });
    emitRoom(room);
  });

  socket.on('vote', ({ targetId }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.status !== 'playing' || !room.players.has(targetId) || targetId === socket.id) return;
    room.votes.set(socket.id, targetId); emitRoom(room);
  });
  socket.on('round:end', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit('error:message', 'เฉพาะ Host เท่านั้นที่เฉลยได้');
    endRound(room, 'host');
  });
  socket.on('round:reset', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    room.status = 'lobby'; room.startedAt = null; room.current = null; room.votes.clear();
    io.to(room.code).emit('round:cleared'); emitRoom(room);
  });
  socket.on('room:kick', ({ playerId }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || playerId === room.hostId) return;
    const s = io.sockets.sockets.get(playerId);
    if (s) { s.emit('error:message', 'คุณถูกนำออกจากห้อง'); s.leave(room.code); s.data.roomCode = null; }
    room.players.delete(playerId); emitRoom(room);
  });
  socket.on('disconnect', () => {
    const room = findRoomBySocket(socket.id); if (!room) return;
    const p = room.players.get(socket.id); if (p) p.connected = false;
    const connected = Array.from(room.players.values()).filter(x => x.connected);
    if (connected.length === 0) return rooms.delete(room.code);
    if (room.hostId === socket.id) room.hostId = connected[0].id;
    emitRoom(room);
  });
});

server.listen(PORT, () => console.log(`Spyfall Deluxe V2 running on port ${PORT}`));
