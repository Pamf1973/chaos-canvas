/* ═══════════════════════════════════════════════════════════════════════════
   CHAOS CANVAS — Client Application
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_COLORS = {
  x:     '#FF6B6B',
  y:     '#4ECDC4',
  color: '#FFE66D',
  size:  '#A8E6CF',
};

const ROLE_EMOJIS = {
  x:     '↔️',
  y:     '↕️',
  color: '🎨',
  size:  '⭕',
};

// ─── State ────────────────────────────────────────────────────────────────────

let socket       = null;
let myRole       = null;
let myName       = '';
let myRoomId     = '';
let brushState   = { x: 400, y: 300, color: 0, size: 12, pen: false };
let prevBrush    = { x: 400, y: 300 };
let isDrawing    = false;

// ─── DOM References ───────────────────────────────────────────────────────────

const lobbyScreen   = document.getElementById('lobby-screen');
const gameScreen    = document.getElementById('game-screen');
const canvas        = document.getElementById('main-canvas');
const ctx           = canvas.getContext('2d');
const brushCursor   = document.getElementById('brush-cursor');
const canvasContainer = document.getElementById('canvas-container');

// ─── Canvas Setup ─────────────────────────────────────────────────────────────

ctx.lineCap   = 'round';
ctx.lineJoin  = 'round';

// ─── Lobby Logic ─────────────────────────────────────────────────────────────

document.getElementById('btn-random-room').addEventListener('click', () => {
  const words = ['CHAOS', 'PAINT', 'TEAM', 'BRUSH', 'ART', 'DRAW', 'HACK'];
  const nums  = Math.floor(Math.random() * 90 + 10);
  document.getElementById('input-room').value = words[Math.floor(Math.random() * words.length)] + nums;
});

document.getElementById('btn-join').addEventListener('click', joinRoom);
document.getElementById('input-room').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
document.getElementById('input-name').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });

function joinRoom() {
  const name   = document.getElementById('input-name').value.trim() || 'Anonymous';
  const roomId = document.getElementById('input-room').value.trim().toUpperCase();
  if (!roomId) { showToast('Enter a room code!', 'error'); return; }

  myName   = name;
  myRoomId = roomId;

  // Connect socket
  socket = io();
  setupSocketEvents();
  socket.emit('join_room', { roomId, playerName: name });

  document.getElementById('btn-join').textContent = 'Joining...';
  document.getElementById('btn-join').disabled = true;
}

// ─── Socket Events ────────────────────────────────────────────────────────────

function setupSocketEvents() {
  socket.on('joined', ({ role, roleInfo, roomSummary, drawHistory }) => {
    myRole = role;

    // Switch to game screen
    lobbyScreen.classList.remove('active');
    gameScreen.classList.add('active');

    document.getElementById('hud-room').textContent = `Room: ${myRoomId}`;
    updateChallenge(roomSummary.challenge);
    renderPlayerList(roomSummary.players);

    if (role) {
      setupMyRole(role, roleInfo);
    } else {
      renderSpectator();
    }

    // Replay draw history
    replayHistory(drawHistory);

    showToast(`Joined as ${roleInfo ? roleInfo.label : 'Spectator'} 🎉`, 'success');
  });

  socket.on('room_full', ({ message }) => {
    showToast(message, 'error');
  });

  socket.on('player_joined', ({ player, roomSummary }) => {
    renderPlayerList(roomSummary.players);
    showToast(`${player.roleInfo.emoji} ${player.name} joined as ${player.roleInfo.label}`, '');
    addShoutMsg('System', null, `${player.name} joined as ${player.roleInfo.label} ${player.roleInfo.emoji}`, '#7a7a9a');
  });

  socket.on('player_left', ({ name, role, roleInfo, roomSummary }) => {
    renderPlayerList(roomSummary.players);
    addShoutMsg('System', null, `${name} (${roleInfo.label}) left the room`, '#7a7a9a');
  });

  socket.on('brush_update', ({ brushState: bs, stroke, movedBy }) => {
    brushState = bs;

    updateBrushUI(bs);
    moveCursorIndicator(bs);

    // Keep pen button in sync for all players
    if (window._syncPenBtn) window._syncPenBtn(bs.pen);

    // Draw on canvas if pen is down
    if (stroke) {
      drawStroke(stroke.prevX, stroke.prevY, bs.x, bs.y, bs.color, bs.size, bs.pen);
      triggerCanvasGlow();
    }
  });

  socket.on('canvas_cleared', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showToast('Canvas cleared! 🗑️', '');
  });

  socket.on('new_challenge', ({ challenge }) => {
    updateChallenge(challenge);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showToast(`New challenge: ${challenge.name} 🎲`, 'success');
  });

  socket.on('shout', ({ name, role, roleInfo, message }) => {
    const color = role ? ROLE_COLORS[role] : '#7a7a9a';
    addShoutMsg(name, roleInfo ? roleInfo.emoji : null, message, color);
  });

  socket.on('disconnect', () => {
    showToast('Disconnected from server. Refresh to rejoin.', 'error');
  });
}

// ─── UI Renderers ─────────────────────────────────────────────────────────────

function renderPlayerList(players) {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player-item';
    el.innerHTML = `
      <div class="player-dot" style="color:${ROLE_COLORS[p.role]};background:${ROLE_COLORS[p.role]}"></div>
      <span class="player-name">${escHtml(p.name)}</span>
      <span class="player-role-badge">${p.roleInfo.emoji}</span>
    `;
    list.appendChild(el);
  });

  // Show empty slots for the 4 roles
  const roleOrder = ['x', 'y', 'color', 'size'];
  const roleLabels = { x: '↔️ X-Axis', y: '↕️ Y-Axis', color: '🎨 Color', size: '⭕ Size' };
  const takenRoles = new Set(players.map(p => p.role));
  roleOrder.filter(r => !takenRoles.has(r)).forEach(r => {
    const el = document.createElement('div');
    el.className = 'player-item';
    el.style.opacity = '0.35';
    el.innerHTML = `
      <div class="player-dot" style="color:${ROLE_COLORS[r]};background:${ROLE_COLORS[r]}"></div>
      <span class="player-name" style="color:#7a7a9a">Waiting...</span>
      <span class="player-role-badge">${roleLabels[r].split(' ')[0]}</span>
    `;
    list.appendChild(el);
  });
}

function setupMyRole(role, roleInfo) {
  const card = document.getElementById('my-role-card');
  card.style.setProperty('--role-color', ROLE_COLORS[role]);
  card.style.setProperty('--role-bg', `rgba(${hexToRgb(ROLE_COLORS[role])},0.07)`);

  document.getElementById('my-role-emoji').textContent = roleInfo.emoji;
  document.getElementById('my-role-label').textContent = roleInfo.label;
  document.getElementById('my-role-desc').textContent  = roleInfo.description;

  buildControlPanel(role);
}

function renderSpectator() {
  document.getElementById('my-role-card').innerHTML = `<div class="spectator-badge">👀 You are a Spectator<br><span style="font-size:10px;color:#7a7a9a">All 4 roles are taken</span></div>`;
  document.getElementById('control-panel').innerHTML = `<div class="spectator-badge">Watch the chaos unfold!</div>`;
}

function updateChallenge(challenge) {
  document.getElementById('challenge-name').textContent = challenge.name;
  document.getElementById('challenge-hint').textContent = `(${challenge.hint})`;
}

// ─── Control Panel Builder ────────────────────────────────────────────────────

function buildControlPanel(role) {
  const panel = document.getElementById('control-panel');
  panel.innerHTML = '';

  const color = ROLE_COLORS[role];

  if (role === 'x') {
    panel.innerHTML = `
      <div class="ctrl-label">X Position (0 → 800)</div>
      <div class="ctrl-value" id="ctrl-display">400</div>
      <input id="ctrl-slider" type="range" min="0" max="800" value="400"
             style="--thumb-color:${color}" />
      <div style="font-size:11px;color:var(--text-muted)">Drag to move the brush left & right</div>
    `;
    setupSlider('ctrl-slider', 'ctrl-display', val => socket.emit('control_update', { value: parseInt(val) }), v => Math.round(v));
  }

  else if (role === 'y') {
    panel.innerHTML = `
      <div class="ctrl-label">Y Position (0 → 600)</div>
      <div class="ctrl-value" id="ctrl-display">300</div>
      <input id="ctrl-slider" type="range" min="0" max="600" value="300"
             style="--thumb-color:${color}" />
      <div style="font-size:11px;color:var(--text-muted)">Drag to move the brush up & down</div>
    `;
    setupSlider('ctrl-slider', 'ctrl-display', val => socket.emit('control_update', { value: parseInt(val) }), v => Math.round(v));
  }

  else if (role === 'color') {
    panel.innerHTML = `
      <div class="ctrl-label">Hue (0° → 360°)</div>
      <div class="ctrl-value" id="ctrl-display" style="color:hsl(0,100%,60%)">0°</div>
      <div class="color-wheel-bar" id="color-wheel-bar" style="--marker:0%"></div>
      <input id="ctrl-slider" type="range" min="0" max="360" value="0"
             style="--thumb-color:${color};
                    background:linear-gradient(to right,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%));
                    margin-top:8px;" />
      <div style="font-size:11px;color:var(--text-muted)">Slide to change the brush color hue</div>
    `;
    const slider = document.getElementById('ctrl-slider');
    const display = document.getElementById('ctrl-display');
    const bar = document.getElementById('color-wheel-bar');
    slider.addEventListener('input', () => {
      const hue = parseInt(slider.value);
      display.textContent = `${hue}°`;
      display.style.color = `hsl(${hue},100%,60%)`;
      bar.style.setProperty('--marker', (hue / 360 * 100) + '%');
      socket.emit('control_update', { value: hue });
    });
  }

  else if (role === 'size') {
    panel.innerHTML = `
      <div class="ctrl-label">Brush Size (2 → 60)</div>
      <div class="ctrl-value" id="ctrl-display">12</div>
      <div style="display:flex;justify-content:center;align-items:center;height:80px;">
        <div id="size-preview" style="border-radius:50%;background:${color};width:24px;height:24px;transition:all 0.1s;box-shadow:0 0 20px ${color}55;"></div>
      </div>
      <input id="ctrl-slider" type="range" min="2" max="60" value="12"
             style="--thumb-color:${color}" />
      <div style="font-size:11px;color:var(--text-muted)">Slide to change the brush size</div>
    `;
    const slider  = document.getElementById('ctrl-slider');
    const display = document.getElementById('ctrl-display');
    const preview = document.getElementById('size-preview');
    slider.addEventListener('input', () => {
      const sz = parseInt(slider.value);
      display.textContent = sz;
      preview.style.width  = sz + 'px';
      preview.style.height = sz + 'px';
      socket.emit('control_update', { value: sz });
    });
  }

  // ── Pen Toggle: Color player only ──
  if (role === 'color') addSharedPenButton(panel);
}

/** Appends the shared pen-down / pen-lift button to any player's control panel. */
function addSharedPenButton(panel) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="ctrl-label" style="margin-top:8px">✏️ Pen — Shared Control</div>
    <button id="pen-btn" class="pen-toggle-btn">✏️ PEN LIFTED</button>
    <div class="pen-hint">Hold to draw! Release to lift.<br>📢 Shout "PEN DOWN!" to your team!</div>
  `;
  panel.appendChild(wrapper);

  const btn = document.getElementById('pen-btn');

  function setPen(down) {
    btn.textContent = down ? '✏️ PEN DOWN!' : '✏️ PEN LIFTED';
    btn.classList.toggle('pen-down', down);
    socket.emit('pen_toggle', { value: down });
  }

  btn.addEventListener('mousedown',  () => setPen(true));
  btn.addEventListener('mouseup',    () => setPen(false));
  btn.addEventListener('mouseleave', () => setPen(false));
  btn.addEventListener('touchstart', e => { e.preventDefault(); setPen(true);  }, { passive: false });
  btn.addEventListener('touchend',   e => { e.preventDefault(); setPen(false); }, { passive: false });

  // Keep pen button in sync with remote brush_update
  window._syncPenBtn = (penDown) => {
    if (!document.getElementById('pen-btn')) return;
    document.getElementById('pen-btn').textContent = penDown ? '✏️ PEN DOWN!' : '✏️ PEN LIFTED';
    document.getElementById('pen-btn').classList.toggle('pen-down', penDown);
  };
}

function setupSlider(sliderId, displayId, onUpdate, formatter) {
  const slider  = document.getElementById(sliderId);
  const display = document.getElementById(displayId);
  slider.addEventListener('input', () => {
    display.textContent = formatter(slider.value);
    onUpdate(slider.value);
  });
}

// ─── Brush UI ─────────────────────────────────────────────────────────────────

function updateBrushUI(bs) {
  // X bar
  const xPct = (bs.x / 800 * 100).toFixed(1) + '%';
  document.getElementById('stat-x').style.setProperty('--w', xPct);
  document.getElementById('stat-x-val').textContent = Math.round(bs.x);

  // Y bar
  const yPct = (bs.y / 600 * 100).toFixed(1) + '%';
  document.getElementById('stat-y').style.setProperty('--w', yPct);
  document.getElementById('stat-y-val').textContent = Math.round(bs.y);

  // Color
  document.getElementById('stat-color-preview').style.background = `hsl(${bs.color},80%,55%)`;
  document.getElementById('stat-color-val').textContent = Math.round(bs.color) + '°';

  // Size
  const szPct = (bs.size / 60 * 100).toFixed(1) + '%';
  document.getElementById('stat-size').style.setProperty('--w', szPct);
  document.getElementById('stat-size-val').textContent = bs.size;

  // Pen
  const penEl = document.getElementById('stat-pen');
  penEl.textContent = bs.pen ? 'DOWN' : 'LIFTED';
  penEl.className   = 'pen-indicator ' + (bs.pen ? 'on' : 'off');
}

function moveCursorIndicator(bs) {
  const size = bs.size;
  brushCursor.style.width  = size + 'px';
  brushCursor.style.height = size + 'px';
  brushCursor.style.left   = bs.x + 'px';
  brushCursor.style.top    = bs.y + 'px';
  brushCursor.style.borderColor = `hsl(${bs.color}, 100%, 60%)`;
  brushCursor.style.boxShadow   = `0 0 ${size/2}px hsl(${bs.color},100%,60%)`;
}

// ─── Canvas Drawing ───────────────────────────────────────────────────────────

function drawStroke(x0, y0, x1, y1, hue, size, penDown) {
  if (!penDown) return;

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = `hsl(${hue}, 85%, 58%)`;
  ctx.lineWidth   = size;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  // Soft glow effect
  ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
  ctx.shadowBlur  = size * 0.6;

  ctx.stroke();
  ctx.shadowBlur = 0;
}

function replayHistory(history) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  history.forEach(s => {
    drawStroke(s.prevX, s.prevY, s.x, s.y, s.color, s.size, true);
  });
}

function triggerCanvasGlow() {
  canvasContainer.classList.remove('drawing');
  void canvasContainer.offsetWidth; // reflow
  canvasContainer.classList.add('drawing');
}

// ─── Shout Box ────────────────────────────────────────────────────────────────

document.getElementById('btn-shout').addEventListener('click', sendShout);
document.getElementById('shout-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendShout();
});

function sendShout() {
  const input = document.getElementById('shout-input');
  const msg   = input.value.trim();
  if (!msg || !socket) return;
  socket.emit('shout', { message: msg });
  input.value = '';
}

function addShoutMsg(name, emoji, message, color) {
  const log  = document.getElementById('shout-log');
  const el   = document.createElement('div');
  el.className = 'shout-msg';
  el.innerHTML = `
    <div class="shout-sender" style="color:${color}">${emoji ? emoji + ' ' : ''}${escHtml(name)}</div>
    <div class="shout-text">${escHtml(message)}</div>
  `;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;

  // Keep log tidy
  while (log.children.length > 50) log.removeChild(log.firstChild);
}

// ─── HUD Buttons ─────────────────────────────────────────────────────────────

document.getElementById('btn-clear').addEventListener('click', () => {
  if (!socket) return;
  if (confirm('Clear the canvas for everyone?')) socket.emit('clear_canvas');
});

document.getElementById('btn-new-challenge').addEventListener('click', () => {
  if (!socket) return;
  socket.emit('new_challenge');
});

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, type = '') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
