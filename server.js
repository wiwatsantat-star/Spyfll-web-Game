const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;
const locations = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'public', 'data', 'locations.json'), 'utf8')
);
const locationMap = new Map(locations.map((location) => [location.id, location]));
const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, locations: locations.length }));

function createCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function sanitizeName(value) {
  return String(value || '').trim().slice(0, 20) || 'ผู้เล่น';
}

function shuffle(input) {
  const array = [...input];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }
  return array;
}

function getRoomBySocket(socketId) {
  return [...rooms.values()].find((room) => room.players.has(socketId));
}

function serializeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    settings: room.settings,
    totalLocationCount: locations.length,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      isHost: player.id === room.hostId,
      score: Number(player.score) || 0
    }))
  };
}

function emitRoom(room) {
  io.to(room.code).emit('room:state', serializeRoom(room));
}

function buildSpyCandidates(realLocation, enabledLocations, hintCount) {
  const sameCategory = shuffle(
    enabledLocations.filter(
      (location) => location.id !== realLocation.id && location.category === realLocation.category
    )
  );
  const otherEnabled = shuffle(
    enabledLocations.filter(
      (location) =>
        location.id !== realLocation.id &&
        location.category !== realLocation.category
    )
  );

  const decoys = [...sameCategory, ...otherEnabled].slice(0, hintCount - 1);
  return shuffle([realLocation, ...decoys]).map((location) => ({
    id: location.id,
    name: location.name,
    category: location.category
  }));
}

function revealRound(room, reason) {
  if (!room.round || room.status !== 'playing') return;
  room.status = 'revealed';
  io.to(room.code).emit('round:revealed', {
    reason,
    location: room.round.realLocation.name,
    spies: room.round.spyIds.map((id) => ({
      id,
      name: room.players.get(id)?.name || 'ไม่ทราบชื่อ'
    })),
    roles: room.round.roles
  });
  emitRoom(room);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status === 'playing' && room.round?.endsAt <= now) {
      revealRound(room, 'timeup');
    }
  }
}, 1000);

io.on('connection', (socket) => {
  socket.on('locations:list', () => {
    socket.emit('locations:data', locations.map(({ roles, ...location }) => location));
  });

  socket.on('room:create', ({ name } = {}) => {
    const code = createCode();
    const room = {
      code,
      hostId: socket.id,
      status: 'lobby',
      players: new Map(),
      votes: new Map(),
      settings: {
        durationSeconds: 480,
        spyCount: 1,
        showSpyOptions: true,
        hintCount: 30
      },
      round: null
    };

    room.players.set(socket.id, {
      id: socket.id,
      name: sanitizeName(name),
      connected: true,
      score: 0
    });

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit('room:joined', { code, playerId: socket.id });
    emitRoom(room);
  });

  socket.on('room:join', ({ name, code } = {}) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const room = rooms.get(normalizedCode);

    if (!room) return socket.emit('app:error', 'ไม่พบห้องนี้');
    if (room.players.size >= 15) return socket.emit('app:error', 'ห้องเต็มแล้ว');

    room.players.set(socket.id, {
      id: socket.id,
      name: sanitizeName(name),
      connected: true,
      score: 0
    });

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.emit('room:joined', { code: room.code, playerId: socket.id });
    emitRoom(room);
  });

  socket.on('room:updateSettings', (payload = {}) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || room.status === 'playing') return;

    const durationSeconds = Math.max(120, Math.min(1800, Number(payload.durationSeconds) || 480));
    const spyCount = Math.max(1, Math.min(3, Number(payload.spyCount) || 1));
    const showSpyOptions = Boolean(payload.showSpyOptions);

    room.settings = {
      durationSeconds,
      spyCount,
      showSpyOptions,
      hintCount: 30
    };
    emitRoom(room);
  });

  socket.on('round:start', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit('app:error', 'เฉพาะ Host เท่านั้น');
    if (room.players.size < 2) return socket.emit('app:error', 'ต้องมีผู้เล่นอย่างน้อย 2 คน');

    const enabledLocations = locations;

    const players = shuffle([...room.players.values()]);
    const maxSpies = Math.max(1, Math.floor(players.length / 3));
    const spyCount = Math.min(room.settings.spyCount, maxSpies);
    const spyIds = players.slice(0, spyCount).map((player) => player.id);
    const realLocation = shuffle(enabledLocations)[0];
    const candidates = buildSpyCandidates(
      realLocation,
      enabledLocations,
      room.settings.hintCount
    );
    const roles = {};
    const roleBag = shuffle(realLocation.roles);
    let roleIndex = 0;

    for (const player of players) {
      if (spyIds.includes(player.id)) {
        io.to(player.id).emit('round:secret', {
          type: 'spy',
          candidates: room.settings.showSpyOptions ? candidates : []
        });
      } else {
        const role = roleBag[roleIndex % roleBag.length];
        roles[player.id] = role;
        roleIndex += 1;
        io.to(player.id).emit('round:secret', {
          type: 'civilian',
          location: realLocation.name,
          role
        });
      }
    }

    room.status = 'playing';
    room.votes.clear();
    room.round = {
      realLocation,
      spyIds,
      candidates,
      roles,
      startedAt: Date.now(),
      endsAt: Date.now() + room.settings.durationSeconds * 1000
    };

    io.to(room.code).emit('round:started', {
      startedAt: room.round.startedAt,
      endsAt: room.round.endsAt
    });
    emitRoom(room);
  });

  socket.on('round:vote', ({ targetId } = {}) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'playing') return;
    if (!room.players.has(targetId) || targetId === socket.id) return;
    room.votes.set(socket.id, targetId);
    io.to(room.code).emit('round:voteState', {
      votedPlayerIds: [...room.votes.keys()]
    });
  });

  socket.on('round:reveal', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    revealRound(room, 'host');
  });

  socket.on('round:new', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    room.status = 'lobby';
    room.round = null;
    room.votes.clear();
    io.to(room.code).emit('round:cleared');
    emitRoom(room);
  });


  socket.on('score:update', ({ playerId, delta } = {}) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;

    const player = room.players.get(playerId);
    if (!player) return;

    const safeDelta = Math.max(-10, Math.min(10, Number(delta) || 0));
    player.score = Math.max(-99, Math.min(999, (Number(player.score) || 0) + safeDelta));
    emitRoom(room);
  });

  socket.on('score:reset', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;

    for (const player of room.players.values()) {
      player.score = 0;
    }
    emitRoom(room);
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    room.players.delete(socket.id);
    if (room.players.size === 0) {
      rooms.delete(room.code);
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = [...room.players.keys()][0];
    }
    emitRoom(room);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Spyfall Thailand running on port ${PORT}`);
});
