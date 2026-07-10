const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const rooms = new Map();
const locations = [
  'สนามบิน', 'โรงพยาบาล', 'โรงเรียน', 'ธนาคาร', 'สถานีตำรวจ', 'ร้านอาหาร', 'โรงแรม',
  'ห้างสรรพสินค้า', 'สวนสนุก', 'ชายหาด', 'เรือสำราญ', 'สถานีอวกาศ', 'ฟาร์ม', 'พิพิธภัณฑ์',
  'โรงภาพยนตร์', 'มหาวิทยาลัย', 'วัด', 'ค่ายทหาร', 'สถานีรถไฟ', 'สำนักงานบริษัท',
  'ตลาดนัด', 'ฟิตเนส', 'ร้านกาแฟ', 'สนามฟุตบอล', 'เรือนจำ'
];

function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    roundSeconds: room.roundSeconds,
    startedAt: room.startedAt,
    players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.id === room.hostId, connected: p.connected, votes: room.votes[p.id] || 0 }))
  };
}
function emitRoom(room) { io.to(room.code).emit('room:update', publicRoom(room)); }
function getRoomOrLeave(socket, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) socket.emit('error:message', 'ไม่พบห้องนี้');
  return room;
}
function cleanupRoom(room) {
  const connected = room.players.some(p => p.connected);
  if (!connected) rooms.delete(room.code);
}
function resetRound(room) {
  room.status = 'lobby';
  room.spyId = null;
  room.location = null;
  room.startedAt = null;
  room.votes = {};
  room.players.forEach(p => p.role = null);
}
function startRound(room, seconds = 480) {
  if (room.players.filter(p => p.connected).length < 2) return 'ต้องมีผู้เล่นอย่างน้อย 2 คน';
  if (room.players.filter(p => p.connected).length > 15) return 'ผู้เล่นต้องไม่เกิน 15 คน';
  room.roundSeconds = Math.max(60, Math.min(Number(seconds) || 480, 1800));
  room.status = 'playing';
  room.location = locations[Math.floor(Math.random() * locations.length)];
  room.startedAt = Date.now();
  room.votes = {};
  const active = room.players.filter(p => p.connected);
  const spy = active[Math.floor(Math.random() * active.length)];
  room.spyId = spy.id;
  room.players.forEach(p => p.role = p.id === spy.id ? 'spy' : 'civilian');
  for (const p of room.players) {
    const payload = p.id === room.spyId
      ? { role: 'spy', location: null, hint: 'คุณคือ SPY! พยายามเดาสถานที่จากคำถามของคนอื่น' }
      : { role: 'civilian', location: room.location, hint: 'ถาม-ตอบโดยอย่าเปิดเผยสถานที่ชัดเกินไป' };
    io.to(p.id).emit('round:secret', payload);
  }
  emitRoom(room);
  return null;
}

io.on('connection', socket => {
  socket.on('room:create', ({ name }) => {
    const roomCode = code();
    const player = { id: socket.id, name: String(name || 'Player').trim().slice(0, 18), connected: true, role: null };
    const room = { code: roomCode, hostId: socket.id, players: [player], status: 'lobby', roundSeconds: 480, startedAt: null, spyId: null, location: null, votes: {} };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.emit('room:joined', { code: roomCode, playerId: socket.id });
    emitRoom(room);
  });

  socket.on('room:join', ({ code: roomCode, name }) => {
    roomCode = String(roomCode || '').trim().toUpperCase();
    const room = getRoomOrLeave(socket, roomCode); if (!room) return;
    if (room.players.filter(p => p.connected).length >= 15) return socket.emit('error:message', 'ห้องเต็มแล้ว สูงสุด 15 คน');
    if (room.status !== 'lobby') return socket.emit('error:message', 'รอบกำลังเล่นอยู่ รอรอบถัดไป');
    const player = { id: socket.id, name: String(name || 'Player').trim().slice(0, 18), connected: true, role: null };
    room.players.push(player);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.emit('room:joined', { code: roomCode, playerId: socket.id });
    emitRoom(room);
  });

  socket.on('round:start', ({ seconds }) => {
    const room = getRoomOrLeave(socket, socket.data.roomCode); if (!room) return;
    if (room.hostId !== socket.id) return socket.emit('error:message', 'เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้');
    const err = startRound(room, seconds);
    if (err) socket.emit('error:message', err);
  });

  socket.on('round:end', () => {
    const room = getRoomOrLeave(socket, socket.data.roomCode); if (!room) return;
    if (room.hostId !== socket.id) return socket.emit('error:message', 'เฉพาะเจ้าของห้องเท่านั้นที่จบรอบได้');
    io.to(room.code).emit('round:reveal', { location: room.location, spyName: room.players.find(p => p.id === room.spyId)?.name || 'Unknown' });
    resetRound(room);
    emitRoom(room);
  });

  socket.on('vote', ({ targetId }) => {
    const room = getRoomOrLeave(socket, socket.data.roomCode); if (!room || room.status !== 'playing') return;
    if (!room.players.some(p => p.id === targetId)) return;
    room.votes[targetId] = (room.votes[targetId] || 0) + 1;
    emitRoom(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode); if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.connected = false;
    if (room.hostId === socket.id) {
      const next = room.players.find(p => p.connected);
      if (next) room.hostId = next.id;
    }
    emitRoom(room);
    setTimeout(() => cleanupRoom(room), 15000);
  });
});

server.listen(PORT, () => console.log(`Spyfall web game running at http://localhost:${PORT}`));
