const socket = io();

const state = {
  playerId: null,
  room: null,
  locations: [],
  timerHandle: null,
  secretVisible: true
};

const $ = (id) => document.getElementById(id);
const els = {
  homeView: $('homeView'),
  roomView: $('roomView'),
  playerName: $('playerName'),
  roomCodeInput: $('roomCodeInput'),
  createRoomBtn: $('createRoomBtn'),
  joinRoomBtn: $('joinRoomBtn'),
  connectionStatus: $('connectionStatus'),
  roomCodeText: $('roomCodeText'),
  copyRoomBtn: $('copyRoomBtn'),
  playerCount: $('playerCount'),
  spyOptionStatus: $('spyOptionStatus'),
  playersList: $('playersList'),
  hostSettings: $('hostSettings'),
  guestMessage: $('guestMessage'),
  durationSelect: $('durationSelect'),
  spyCountSelect: $('spyCountSelect'),
  showSpyOptionsCheckbox: $('showSpyOptionsCheckbox'),
  saveSettingsBtn: $('saveSettingsBtn'),
  startRoundBtn: $('startRoundBtn'),
  revealBtn: $('revealBtn'),
  newRoundBtn: $('newRoundBtn'),
  gamePanel: $('gamePanel'),
  timerText: $('timerText'),
  hideSecretBtn: $('hideSecretBtn'),
  secretCard: $('secretCard'),
  secretTitle: $('secretTitle'),
  secretSubtitle: $('secretSubtitle'),
  secretContent: $('secretContent'),
  voteList: $('voteList'),
  scoreboardList: $('scoreboardList'),
  resetScoresBtn: $('resetScoresBtn'),
  scoreboardHint: $('scoreboardHint'),
  revealPanel: $('revealPanel'),
  revealContent: $('revealContent'),
  toast: $('toast')
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function isHost() {
  return state.room?.hostId === state.playerId;
}

function joinPayload() {
  return { name: els.playerName.value.trim() || 'ผู้เล่น' };
}


function renderRoom() {
  if (!state.room) return;
  els.roomCodeText.textContent = state.room.code;
  els.playerCount.textContent = state.room.players.length;
  els.spyOptionStatus.textContent = state.room.settings.showSpyOptions ? 'เปิด' : 'ปิด';

  els.playersList.innerHTML = '';
  for (const player of state.room.players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `<span>${player.name}</span><strong>${player.isHost ? 'HOST' : ''}</strong>`;
    els.playersList.appendChild(row);
  }

  els.hostSettings.classList.toggle('hidden', !isHost());
  els.guestMessage.classList.toggle('hidden', isHost());
  els.startRoundBtn.classList.toggle('hidden', !isHost() || state.room.status === 'playing');
  els.revealBtn.classList.toggle('hidden', !isHost() || state.room.status !== 'playing');
  els.newRoundBtn.classList.toggle('hidden', !isHost() || state.room.status !== 'revealed');

  if (isHost()) {
    els.durationSelect.value = state.room.settings.durationSeconds;
    els.spyCountSelect.value = state.room.settings.spyCount;
    els.showSpyOptionsCheckbox.checked = state.room.settings.showSpyOptions;
  }

  renderVotes();
  renderScoreboard();
}


function renderScoreboard() {
  if (!state.room) return;

  const sortedPlayers = [...state.room.players].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return a.name.localeCompare(b.name, 'th');
  });

  els.scoreboardList.innerHTML = '';
  sortedPlayers.forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'score-row';

    const rank = document.createElement('div');
    rank.className = 'score-rank';
    rank.textContent = index + 1;

    const identity = document.createElement('div');
    identity.className = 'score-player';
    identity.innerHTML = `<strong>${player.name}</strong>${player.isHost ? '<small>HOST</small>' : ''}`;

    const score = document.createElement('div');
    score.className = 'score-value';
    score.textContent = player.score || 0;

    row.appendChild(rank);
    row.appendChild(identity);

    if (isHost()) {
      const controls = document.createElement('div');
      controls.className = 'score-controls';

      const minus = document.createElement('button');
      minus.textContent = '−1';
      minus.onclick = () => socket.emit('score:update', { playerId: player.id, delta: -1 });

      const plus = document.createElement('button');
      plus.textContent = '+1';
      plus.onclick = () => socket.emit('score:update', { playerId: player.id, delta: 1 });

      controls.appendChild(minus);
      controls.appendChild(score);
      controls.appendChild(plus);
      row.appendChild(controls);
    } else {
      row.appendChild(score);
    }

    els.scoreboardList.appendChild(row);
  });

  els.resetScoresBtn.classList.toggle('hidden', !isHost());
  els.scoreboardHint.classList.toggle('hidden', !isHost());
}

function renderVotes() {
  if (!state.room) return;
  els.voteList.innerHTML = '';
  for (const player of state.room.players.filter((item) => item.id !== state.playerId)) {
    const row = document.createElement('div');
    row.className = 'vote-row';
    const button = document.createElement('button');
    button.textContent = 'โหวต';
    button.onclick = () => socket.emit('round:vote', { targetId: player.id });
    row.innerHTML = `<span>${player.name}</span>`;
    row.appendChild(button);
    els.voteList.appendChild(row);
  }
}

function startTimer(endsAt) {
  clearInterval(state.timerHandle);
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');
    els.timerText.textContent = `${minutes}:${seconds}`;
  };
  tick();
  state.timerHandle = setInterval(tick, 1000);
}

els.createRoomBtn.onclick = () => socket.emit('room:create', joinPayload());
els.joinRoomBtn.onclick = () => socket.emit('room:join', {
  ...joinPayload(),
  code: els.roomCodeInput.value.trim().toUpperCase()
});
els.copyRoomBtn.onclick = async () => {
  await navigator.clipboard.writeText(state.room?.code || '');
  showToast('คัดลอกรหัสห้องแล้ว');
};
els.saveSettingsBtn.onclick = () => {
  socket.emit('room:updateSettings', {
    durationSeconds: Number(els.durationSelect.value),
    spyCount: Number(els.spyCountSelect.value),
    showSpyOptions: els.showSpyOptionsCheckbox.checked
  });
};
els.startRoundBtn.onclick = () => socket.emit('round:start');
els.revealBtn.onclick = () => socket.emit('round:reveal');
els.newRoundBtn.onclick = () => socket.emit('round:new');
els.resetScoresBtn.onclick = () => {
  if (confirm('ต้องการรีเซ็ตคะแนนผู้เล่นทุกคนหรือไม่?')) {
    socket.emit('score:reset');
  }
};
els.hideSecretBtn.onclick = () => {
  state.secretVisible = !state.secretVisible;
  els.secretContent.classList.toggle('hidden', !state.secretVisible);
  els.secretSubtitle.classList.toggle('hidden', !state.secretVisible);
};

socket.on('connect', () => {
  els.connectionStatus.textContent = 'ออนไลน์';
  socket.emit('locations:list');
});
socket.on('disconnect', () => {
  els.connectionStatus.textContent = 'ออฟไลน์';
});
socket.on('locations:data', (locations) => {
  state.locations = locations;
});
socket.on('room:joined', ({ code, playerId }) => {
  state.playerId = playerId;
  els.homeView.classList.add('hidden');
  els.roomView.classList.remove('hidden');
  els.roomCodeText.textContent = code;
});
socket.on('room:state', (room) => {
  state.room = room;
  renderRoom();
});
socket.on('round:started', ({ endsAt }) => {
  els.gamePanel.classList.remove('hidden');
  els.revealPanel.classList.add('hidden');
  startTimer(endsAt);
});
socket.on('round:secret', (payload) => {
  els.secretCard.className = `secret-card ${payload.type === 'spy' ? 'spy' : ''}`;
  if (payload.type === 'spy') {
    els.secretTitle.textContent = 'คุณคือ SPY 🕵️';
    if (payload.candidates.length > 0) {
      els.secretSubtitle.textContent = 'สถานที่จริงซ่อนอยู่ในรายการนี้ 1 แห่ง';
      els.secretContent.innerHTML = `<div class="candidate-grid">${payload.candidates.map((item) =>
        `<div class="candidate"><strong>${item.name}</strong><br><small>${item.category}</small></div>`
      ).join('')}</div>`;
    } else {
      els.secretSubtitle.textContent = 'รอบนี้ไม่มีรายการช่วยเดา';
      els.secretContent.innerHTML = '<p>สังเกตคำถามและคำตอบของผู้เล่นคนอื่นให้ดี</p>';
    }
  } else {
    els.secretTitle.textContent = payload.location;
    els.secretSubtitle.textContent = 'บทบาทของคุณ';
    els.secretContent.innerHTML = `<h2>${payload.role}</h2>`;
  }
});
socket.on('round:revealed', (payload) => {
  clearInterval(state.timerHandle);
  els.revealPanel.classList.remove('hidden');
  els.revealContent.innerHTML = `
    <p><strong>สถานที่จริง:</strong> ${payload.location}</p>
    <p><strong>Spy:</strong> ${payload.spies.map((item) => item.name).join(', ')}</p>
  `;
});
socket.on('round:cleared', () => {
  clearInterval(state.timerHandle);
  els.gamePanel.classList.add('hidden');
  els.revealPanel.classList.add('hidden');
});
socket.on('app:error', showToast);
