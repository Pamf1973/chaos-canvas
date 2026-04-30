const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── Game State ──────────────────────────────────────────────────────────────

const ROLES = {
  x:     { id: 'x',     label: 'X-Axis',    emoji: '↔️', color: '#FF6B6B', description: 'You control LEFT & RIGHT' },
  y:     { id: 'y',     label: 'Y-Axis',     emoji: '↕️', color: '#4ECDC4', description: 'You control UP & DOWN' },
  color: { id: 'color', label: 'Color',      emoji: '🎨', color: '#FFE66D', description: 'You control the COLOR' },
  size:  { id: 'size',  label: 'Brush Size', emoji: '⭕', color: '#A8E6CF', description: 'You control BRUSH SIZE' },
};

// Exactly 4 roles — no Pen role. Pen is a shared control for all players.
const ROLE_ORDER = ['x', 'y', 'color', 'size'];

let rooms = {}; // roomId -> { players, brushState, drawHistory, challenge }

const CHALLENGES = [
  { name: 'A Car 🚗',      hint: 'Rectangle body + 2 circles for wheels!' },
  { name: 'A House 🏠',    hint: 'Square base + triangle roof + a door!' },
  { name: 'A Smiley 😊',   hint: 'Circle face + 2 dots + a curve!' },
  { name: 'A Tree 🌲',      hint: 'Triangle top + rectangle trunk!' },
  { name: 'A Sun ☀️',      hint: 'Circle + lines radiating outward!' },
  { name: 'A Fish 🐟',     hint: 'Oval body + triangle tail + an eye!' },
  { name: 'A Cat 🐱',      hint: 'Circle head + triangle ears + whiskers!' },
  { name: 'A Star ⭐',     hint: 'Five points all meeting in the middle!' },
];

function createRoom(roomId) {
  return {
    id: roomId,
    players: {},       // socketId -> { name, role, value }
    brushState: {
      x: 400,
      y: 300,
      color: 0,        // hue 0-360
      size: 12,
      pen: false,
    },
    drawHistory: [],   // [{x,y,color,size,pen,prevX,prevY}]
    challenge: CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)],
    lastPos: { x: 400, y: 300 },
  };
}

function getAvailableRole(room) {
  const taken = new Set(Object.values(room.players).map(p => p.role));
  return ROLE_ORDER.find(r => !taken.has(r)) || null;
}

function getRoomSummary(room) {
  return {
    players: Object.values(room.players).map(p => ({
      name: p.name,
      role: p.role,
      roleInfo: ROLES[p.role],
    })),
    brushState: room.brushState,
    challenge: room.challenge,
  };
}

// ─── Socket Events ────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // Join a room
  socket.on('join_room', ({ roomId, playerName }) => {
    if (!rooms[roomId]) rooms[roomId] = createRoom(roomId);
    const room = rooms[roomId];

    const role = getAvailableRole(room);
    if (!role) {
      socket.emit('room_full', { message: 'All 4 roles are taken! You are a spectator.' });
      // Still let them join as spectator
      socket.join(roomId);
      socket.roomId = roomId;
      socket.emit('joined', { role: null, roomSummary: getRoomSummary(room), drawHistory: room.drawHistory });
      return;
    }

    room.players[socket.id] = {
      id: socket.id,
      name: playerName || `Player ${Object.keys(room.players).length + 1}`,
      role,
      value: room.brushState[role],
    };

    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = role;

    socket.emit('joined', {
      role,
      roleInfo: ROLES[role],
      roomSummary: getRoomSummary(room),
      drawHistory: room.drawHistory,
    });

    // Notify all others
    io.to(roomId).emit('player_joined', {
      player: { name: room.players[socket.id].name, role, roleInfo: ROLES[role] },
      roomSummary: getRoomSummary(room),
    });

    console.log(`[Room ${roomId}] ${room.players[socket.id].name} joined as ${role}`);
  });

  // Player sends their control value
  socket.on('control_update', ({ value }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    const player = room.players[socket.id];
    if (!player) return;

    const role = player.role;
    const prevX = room.brushState.x;
    const prevY = room.brushState.y;

    // Update the brush property
    if (role === 'x')     room.brushState.x     = Math.max(0, Math.min(800, value));
    if (role === 'y')     room.brushState.y     = Math.max(0, Math.min(600, value));
    if (role === 'color') room.brushState.color  = ((value % 360) + 360) % 360;
    if (role === 'size')  room.brushState.size   = Math.max(2, Math.min(60, value));

    player.value = value;

    const stroke = {
      ...room.brushState,
      prevX,
      prevY,
      timestamp: Date.now(),
    };

    // Only record draw strokes when pen is down
    if (room.brushState.pen) {
      room.drawHistory.push(stroke);
      // Keep history manageable
      if (room.drawHistory.length > 5000) room.drawHistory.shift();
    }

    // Broadcast updated brush state to all in room
    io.to(roomId).emit('brush_update', {
      brushState: room.brushState,
      stroke: room.brushState.pen ? stroke : null,
      movedBy: { role, name: player.name },
    });
  });

  // Shared pen toggle — any of the 4 players can lift/drop the pen
  socket.on('pen_toggle', ({ value }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    const player = room.players[socket.id];
    if (!player) return; // spectators cannot toggle pen

    const prevX = room.brushState.x;
    const prevY = room.brushState.y;
    room.brushState.pen = !!value;

    const stroke = { ...room.brushState, prevX, prevY, timestamp: Date.now() };
    if (room.brushState.pen) {
      room.drawHistory.push(stroke);
      if (room.drawHistory.length > 5000) room.drawHistory.shift();
    }

    io.to(roomId).emit('brush_update', {
      brushState: room.brushState,
      stroke: room.brushState.pen ? stroke : null,
      movedBy: { role: player.role, name: player.name },
    });
  });

  // Clear canvas
  socket.on('clear_canvas', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].drawHistory = [];
    io.to(roomId).emit('canvas_cleared');
  });

  // New challenge
  socket.on('new_challenge', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    room.challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    room.drawHistory = [];
    io.to(roomId).emit('new_challenge', { challenge: room.challenge });
    io.to(roomId).emit('canvas_cleared');
  });

  // Chat/Shout
  socket.on('shout', ({ message }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    const player = rooms[roomId].players[socket.id];
    io.to(roomId).emit('shout', {
      name: player?.name || 'Spectator',
      role: player?.role,
      roleInfo: player?.role ? ROLES[player.role] : null,
      message: message.slice(0, 120),
      timestamp: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    const player = room.players[socket.id];
    if (player) {
      console.log(`[-] ${player.name} (${player.role}) left room ${roomId}`);
      delete room.players[socket.id];
      io.to(roomId).emit('player_left', {
        name: player.name,
        role: player.role,
        roleInfo: ROLES[player.role],
        roomSummary: getRoomSummary(room),
      });
    }

    if (Object.keys(room.players).length === 0) {
      setTimeout(() => {
        if (rooms[roomId] && Object.keys(rooms[roomId].players).length === 0) {
          delete rooms[roomId];
          console.log(`[Room ${roomId}] cleaned up`);
        }
      }, 30000);
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎨 Chaos Canvas running on http://localhost:${PORT}`);
});
