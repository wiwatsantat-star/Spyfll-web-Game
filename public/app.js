const socket = io({ timeout: 15000, reconnectionAttempts: 6, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });

const state = {
  playerId: null,
  room: null,
  locations: [],
  timerHandle: null,
  secretVisible: true,
  roomEntryPending: false,
  roomEntryAction: null,
  roomEntryRequestId: 0,
  votedPlayerIds: []
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
  reconnectBtn: $('reconnectBtn'),
  voteProgress: $('voteProgress'),
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

function updateRoomEntryButtons() {
  const canEnter = socket.connected && !state.roomEntryPending;
  els.createRoomBtn.disabled = !canEnter;
  els.joinRoomBtn.disabled = !canEnter;
  els.createRoomBtn.textContent =
    state.roomEntryPending && state.roomEntryAction === 'room:create' ? 'กำลังสร้างห้อง...' : 'สร้างห้อง';
  els.joinRoomBtn.textContent =
    state.roomEntryPending && state.roomEntryAction === 'room:join' ? 'กำลังเข้าห้อง...' : 'เข้าห้อง';
}

function enterRoom(eventName, payload) {
  if (state.roomEntryPending) return;
  if (!socket.connected) {
    showToast('กำลังเชื่อมต่อ กรุณารอสักครู่แล้วลองอีกครั้ง');
    return;
  }

  state.roomEntryRequestId += 1;
  const requestId = state.roomEntryRequestId;
  state.roomEntryPending = true;
  state.roomEntryAction = eventName;
  updateRoomEntryButtons();

  socket.timeout(20000).emit(eventName, payload, (error, result) => {
    if (requestId !== state.roomEntryRequestId) return;
    state.roomEntryPending = false;
    state.roomEntryAction = null;
    updateRoomEntryButtons();
    if (error) {
      showToast('เซิร์ฟเวอร์ยังไม่ตอบกลับ กรุณาลองเชื่อมต่อหรือเข้าห้องใหม่');
      return;
    }
    if (result?.ok === false) return;
  });
}

updateRoomEntryButtons();


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
  const votedIds = state.votedPlayerIds || [];
  const hasVoted = votedIds.includes(state.playerId);
  const voteCount = votedIds.length;
  const totalPlayers = state.room.players.length;
  if (state.room.status === 'playing') {
    els.voteProgress.textContent = hasVoted
      ? `ส่งคะแนนแล้ว ${voteCount}/${totalPlayers} คน ระบบจะเฉลยเมื่อทุกคนโหวตครบ`
      : `โหวตผู้ต้องสงสัยเพื่อจบรอบ ${voteCount}/${totalPlayers} คนโหวตแล้ว`;
  } else {
    els.voteProgress.textContent = 'โหวตครบทุกคนแล้วระบบจะเฉลยรอบโดยอัตโนมัติ';
  }
  for (const player of state.room.players.filter((item) => item.id !== state.playerId)) {
    const row = document.createElement('div');
    row.className = 'vote-row';
    const button = document.createElement('button');
    button.textContent = hasVoted ? 'โหวตแล้ว' : 'โหวต';
    button.disabled = hasVoted || state.room.status !== 'playing';
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

els.createRoomBtn.onclick = () => enterRoom('room:create', joinPayload());
els.joinRoomBtn.onclick = () => {
  const code = els.roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    showToast('กรอกรหัสห้องก่อน');
    return;
  }
  enterRoom('room:join', { ...joinPayload(), code });
};
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
els.reconnectBtn.onclick = () => {
  els.reconnectBtn.classList.add('hidden');
  setConnectionStatus('กำลังเชื่อมต่อ...', 'is-connecting');
  socket.connect();
};
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

function setConnectionStatus(message, statusClass) {
  els.connectionStatus.textContent = message;
  els.connectionStatus.classList.remove('is-online', 'is-connecting', 'is-offline');
  els.connectionStatus.classList.add(statusClass);
}

socket.on('connect', () => {
  setConnectionStatus('ออนไลน์', 'is-online');
  els.reconnectBtn.classList.add('hidden');
  updateRoomEntryButtons();
  socket.emit('locations:list');
});
socket.on('connect_error', () => {
  setConnectionStatus('กำลังเชื่อมต่อ...', 'is-connecting');
  updateRoomEntryButtons();
});
socket.io.on('reconnect_attempt', () => {
  setConnectionStatus('กำลังเชื่อมต่อ...', 'is-connecting');
  els.reconnectBtn.classList.add('hidden');
});
socket.io.on('reconnect_failed', () => {
  setConnectionStatus('ออฟไลน์', 'is-offline');
  els.reconnectBtn.classList.remove('hidden');
  updateRoomEntryButtons();
});
socket.on('disconnect', () => {
  setConnectionStatus('กำลังเชื่อมต่อ...', 'is-connecting');
  const wasEnteringRoom = state.roomEntryPending;
  state.roomEntryRequestId += 1;
  state.roomEntryPending = false;
  state.roomEntryAction = null;
  updateRoomEntryButtons();
  if (wasEnteringRoom) showToast('การเชื่อมต่อขาด กรุณาลองเข้า Session อีกครั้ง');
});
socket.on('locations:data', (locations) => {
  state.locations = locations;
});
socket.on('room:joined', ({ code, playerId }) => {
  state.roomEntryRequestId += 1;
  state.roomEntryPending = false;
  state.roomEntryAction = null;
  updateRoomEntryButtons();
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
  state.votedPlayerIds = [];
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
socket.on('round:voteState', ({ votedPlayerIds = [] } = {}) => {
  state.votedPlayerIds = votedPlayerIds;
  renderVotes();
});
socket.on('round:revealed', (payload) => {
  clearInterval(state.timerHandle);
  els.revealPanel.classList.remove('hidden');
  els.revealContent.replaceChildren();
  const locationLine = document.createElement('p');
  locationLine.innerHTML = '<strong>สถานที่จริง:</strong> ';
  locationLine.append(document.createTextNode(payload.location));
  const spiesLine = document.createElement('p');
  spiesLine.innerHTML = '<strong>Spy:</strong> ';
  spiesLine.append(document.createTextNode(payload.spies.map((item) => item.name).join(', ')));
  els.revealContent.append(locationLine, spiesLine);
  if (payload.reason === 'vote') {
    const outcome = document.createElement('p');
    outcome.className = 'vote-outcome';
    outcome.textContent = payload.spyCaught ? 'ผลโหวต: จับ Spy ได้!' : 'ผลโหวต: Spy ยังไม่ถูกจับได้';
    els.revealContent.appendChild(outcome);
  }
  for (const result of payload.voteResults || []) {
    if (!result.votes) continue;
    const line = document.createElement('p');
    line.textContent = result.name + ': ' + result.votes + ' โหวต';
    els.revealContent.appendChild(line);
  }
});
socket.on('round:cleared', () => {
  state.votedPlayerIds = [];
  clearInterval(state.timerHandle);
  els.gamePanel.classList.add('hidden');
  els.revealPanel.classList.add('hidden');
});
socket.on('app:error', (message) => {
  if (state.roomEntryPending) {
    state.roomEntryRequestId += 1;
    state.roomEntryPending = false;
    state.roomEntryAction = null;
    updateRoomEntryButtons();
  }
  showToast(message);
});


// Local games available from the game hub
const miniState = { kind: null, timer: null, seconds: 60, score: 0, words: [], wordIndex: 0, quizIndex: -1, quizScore: 0, quizAnswered: false };
const quizBank = [
  { q: 'ประเทศไทยมีกี่จังหวัด (นับกรุงเทพฯ ด้วย)?', options: ['75 จังหวัด', '76 จังหวัด', '77 จังหวัด', '78 จังหวัด'], answer: 2 },
  { q: 'ดาวเคราะห์ดวงใดมีขนาดใหญ่ที่สุดในระบบสุริยะ?', options: ['โลก', 'ดาวพฤหัสบดี', 'ดาวอังคาร', 'ดาวศุกร์'], answer: 1 },
  { q: 'น้ำ 1 กิโลกรัม เท่ากับกี่กรัม?', options: ['100 กรัม', '500 กรัม', '1,000 กรัม', '10,000 กรัม'], answer: 2 },
  { q: 'ทะเลทรายซาฮาราอยู่ในทวีปใด?', options: ['เอเชีย', 'อเมริกาใต้', 'ยุโรป', 'แอฟริกา'], answer: 3 },
  { q: 'ผสมสีน้ำเงินกับสีเหลืองจะได้สีอะไร?', options: ['สีเขียว', 'สีม่วง', 'สีส้ม', 'สีชมพู'], answer: 0 },
  { q: 'สัตว์เลี้ยงลูกด้วยนมชนิดใดบินได้จริง?', options: ['กระรอกบิน', 'ค้างคาว', 'นกเพนกวิน', 'ไก่'], answer: 1 },
  { q: 'น้ำบริสุทธิ์เดือดที่อุณหภูมิประมาณเท่าไรที่ระดับน้ำทะเล?', options: ['50°C', '80°C', '100°C', '120°C'], answer: 2 },
  { q: 'เมืองหลวงของประเทศญี่ปุ่นคือเมืองใด?', options: ['โอซาก้า', 'เกียวโต', 'โตเกียว', 'นาโกยา'], answer: 2 },
  { q: 'รูปสามเหลี่ยมมีด้านกี่ด้าน?', options: ['2 ด้าน', '3 ด้าน', '4 ด้าน', '5 ด้าน'], answer: 1 },
  { q: 'หนึ่งวันมีกี่ชั่วโมง?', options: ['12 ชั่วโมง', '18 ชั่วโมง', '24 ชั่วโมง', '30 ชั่วโมง'], answer: 2 }
];
const charadesBank = ['ช้าง','มะพร้าว','รถตุ๊กตุ๊ก','ช่างภาพ','นักบิน','ปลาหมึก','รถไฟเหาะ','ทำอาหาร','เล่นฟุตบอล','แปรงฟัน','ไดโนเสาร์','พระจันทร์','ชาวประมง','เต้นรำ','ยุง','หุ่นยนต์','ตลาดน้ำ','นักมายากล','กางร่ม','ลิง','ขี่จักรยาน','หมูกระทะ','นักดับเพลิง','นาฬิกาปลุก','ตกปลา','ยกน้ำหนัก','รถติด','แมว','พัดลม','ร้องเพลง','สับปะรด','นักสำรวจ','เล่นว่าว','เครื่องบิน','ปลูกต้นไม้','ง่วงนอน','ถ่ายรูปเซลฟี่','มวยไทย','ไอศกรีม','เต่า'];
function openGameHub() {
  clearInterval(miniState.timer);
  miniState.timer = null;
  if (typeof insiderState !== 'undefined') clearInterval(insiderState.timer);
  $('miniGameView').classList.add('hidden');
  $('homeView').classList.add('hidden');
  $('roomView').classList.add('hidden');
  $('gameHub').classList.remove('hidden');
}
function openMiniGame(kind) {
  miniState.kind = kind;
  $('gameHub').classList.add('hidden');
  $('homeView').classList.add('hidden');
  $('roomView').classList.add('hidden');
  $('miniGameView').classList.remove('hidden');
  $('charadesGame').classList.toggle('hidden', kind !== 'charades');
  $('quizGame').classList.toggle('hidden', kind !== 'quiz');
  $('insiderGame').classList.toggle('hidden', kind !== 'insider');
  if (kind === 'charades') resetCharades();
  if (kind === 'quiz') resetQuiz();
  if (kind === 'insider') resetInsider();
}
function resetCharades() {
  clearInterval(miniState.timer);
  miniState.timer = null;
  miniState.seconds = 60;
  miniState.score = 0;
  miniState.words = [...charadesBank].sort(() => Math.random() - 0.5);
  miniState.wordIndex = 0;
  $('charadesScore').textContent = '0';
  $('charadesStatus').textContent = 'พร้อมเริ่มหรือยัง?';
  $('charadesWord').textContent = 'กดเริ่มเกมเพื่อสุ่มคำ';
  $('charadesTimer').textContent = '01:00';
  $('charadesStartBtn').disabled = false;
  $('charadesStartBtn').textContent = 'เริ่มจับเวลา';
  $('charadesGotBtn').disabled = true;
  $('charadesSkipBtn').disabled = true;
}
function nextCharadesWord() {
  if (miniState.wordIndex >= miniState.words.length) {
    miniState.words = [...charadesBank].sort(() => Math.random() - 0.5);
    miniState.wordIndex = 0;
  }
  $('charadesWord').textContent = miniState.words[miniState.wordIndex++];
}
function startCharades() {
  if (miniState.timer) return;
  miniState.seconds = 60;
  miniState.score = 0;
  miniState.wordIndex = 0;
  $('charadesScore').textContent = '0';
  $('charadesStatus').textContent = 'ใบ้ให้เพื่อนทาย!';
  $('charadesStartBtn').disabled = true;
  $('charadesStartBtn').textContent = 'กำลังเล่น';
  $('charadesGotBtn').disabled = false;
  $('charadesSkipBtn').disabled = false;
  nextCharadesWord();
  miniState.timer = setInterval(() => {
    miniState.seconds -= 1;
    $('charadesTimer').textContent = '00:' + String(miniState.seconds).padStart(2, '0');
    if (miniState.seconds <= 0) {
      clearInterval(miniState.timer);
      miniState.timer = null;
      $('charadesStatus').textContent = 'หมดเวลา! ได้ ' + miniState.score + ' คะแนน';
      $('charadesGotBtn').disabled = true;
      $('charadesSkipBtn').disabled = true;
      $('charadesStartBtn').disabled = false;
      $('charadesStartBtn').textContent = 'เล่นอีกครั้ง';
    }
  }, 1000);
}
function resetQuiz() {
  miniState.quizIndex = -1;
  miniState.quizScore = 0;
  miniState.quizAnswered = false;
  $('quizProgress').textContent = 'ข้อ 1 / ' + quizBank.length;
  $('quizScore').textContent = '0';
  $('quizQuestion').textContent = 'พร้อมประลองความรู้รอบตัวหรือยัง?';
  $('quizOptions').innerHTML = '';
  $('quizFeedback').textContent = 'ตอบถูกเพื่อเก็บคะแนน เล่นได้ทีละคนหรือผลัดกันตอบ';
  $('quizNextBtn').textContent = 'เริ่มควิซ';
}
function showQuizQuestion() {
  if (miniState.quizIndex >= quizBank.length) {
    $('quizProgress').textContent = 'ครบทุกข้อแล้ว';
    $('quizQuestion').textContent = 'จบเกม! คุณได้ ' + miniState.quizScore + ' จาก ' + quizBank.length + ' คะแนน';
    $('quizOptions').innerHTML = '';
    $('quizFeedback').textContent = miniState.quizScore >= 8 ? 'ยอดเยี่ยม รอบรู้สุด ๆ!' : 'ลองอีกครั้งเพื่อทำคะแนนให้ดีกว่าเดิม';
    $('quizNextBtn').textContent = 'เล่นอีกครั้ง';
    return;
  }
  const item = quizBank[miniState.quizIndex];
  miniState.quizAnswered = false;
  $('quizProgress').textContent = 'ข้อ ' + (miniState.quizIndex + 1) + ' / ' + quizBank.length;
  $('quizQuestion').textContent = item.q;
  $('quizFeedback').textContent = '';
  $('quizOptions').innerHTML = '';
  item.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option;
    button.onclick = () => answerQuiz(button, index);
    $('quizOptions').appendChild(button);
  });
  $('quizNextBtn').textContent = 'ข้ามข้อนี้';
}
function answerQuiz(selectedButton, answerIndex) {
  if (miniState.quizAnswered) return;
  miniState.quizAnswered = true;
  const item = quizBank[miniState.quizIndex];
  const buttons = [...$('quizOptions').querySelectorAll('button')];
  buttons.forEach((button, index) => {
    button.disabled = true;
    if (index === item.answer) button.classList.add('is-correct');
  });
  if (answerIndex === item.answer) {
    miniState.quizScore += 1;
    $('quizScore').textContent = String(miniState.quizScore);
    $('quizFeedback').textContent = 'ถูกต้อง! +1 คะแนน';
  } else {
    selectedButton.classList.add('is-wrong');
    $('quizFeedback').textContent = 'ยังไม่ใช่ คำตอบคือ ' + item.options[item.answer];
  }
  $('quizNextBtn').textContent = 'ข้อถัดไป';
}
document.querySelectorAll('[data-open-game]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.openGame === 'spyfall') {
      $('gameHub').classList.add('hidden');
      $('homeView').classList.remove('hidden');
    } else {
      openMiniGame(button.dataset.openGame);
    }
  });
});
$('hubHomeBtn').addEventListener('click', openGameHub);
$('miniBackBtn').addEventListener('click', openGameHub);
$('charadesStartBtn').addEventListener('click', startCharades);
$('charadesGotBtn').addEventListener('click', () => {
  if (!miniState.timer) return;
  miniState.score += 1;
  $('charadesScore').textContent = String(miniState.score);
  nextCharadesWord();
});
$('charadesSkipBtn').addEventListener('click', () => {
  if (miniState.timer) nextCharadesWord();
});
$('quizNextBtn').addEventListener('click', () => {
  if (miniState.quizIndex < 0 || miniState.quizIndex >= quizBank.length) {
    miniState.quizScore = 0;
    $('quizScore').textContent = '0';
    miniState.quizIndex = 0;
    showQuizQuestion();
  } else {
    miniState.quizIndex += 1;
    showQuizQuestion();
  }
});


// Insider: local pass-and-play secret-role party game
const insiderWords = ['ตลาดน้ำ','รถไฟฟ้า','โรงพยาบาล','ร้านกาแฟ','สนามบิน','สวนสัตว์','ห้องสมุด','สถานีตำรวจ','โรงภาพยนตร์','ร้านสะดวกซื้อ','ชายหาด','พิพิธภัณฑ์','สถานีรถไฟ','สวนสนุก','ร้านอาหาร','โรงเรียน','ตลาดกลางคืน','คอนเสิร์ต','สนามฟุตบอล','วัดไทย','ปั๊มน้ำมัน','ร้านตัดผม','ฟาร์ม','โรงแรม','ร้านขายยา','ท่าเรือ','งานวัด','ค่ายลูกเสือ','ภูเขา','พิพิธภัณฑ์สัตว์น้ำ','ร้านซักรีด','สำนักงาน','คาเฟ่แมว','ร้านหนังสือ','สถานีขนส่ง','ตลาดสด','ร้านขนม','ลานสเกต','ศูนย์การค้า','คลินิก'];
const insiderState = { players: [], masterIndex: -1, insiderIndex: -1, word: '', dealIndex: 0, voterIndex: 0, votes: [], timer: null, seconds: 300, secretTimeout: null };
function setInsiderPhase(phase) {
  ['insiderSetup','insiderDeal','insiderDiscussion','insiderVoting','insiderResults'].forEach((id) => {
    $(id).classList.toggle('hidden', id !== phase);
  });
}
function resetInsider() {
  clearInterval(insiderState.timer);
  clearTimeout(insiderState.secretTimeout);
  insiderState.timer = null;
  insiderState.secretTimeout = null;
  insiderState.seconds = 300;
  $('insiderPlayerCount').value = '6';
  $('insiderSecretWord').textContent = '••••••••';
  $('insiderSecretToggle').textContent = 'แสดงคำลับ';
  $('insiderTimer').textContent = '05:00';
  $('insiderTimerStartBtn').disabled = false;
  $('insiderTimerStartBtn').textContent = 'เริ่มจับเวลา';
  $('insiderBeginVoteBtn').disabled = false;
  setInsiderPhase('insiderSetup');
}
function startInsider() {
  const count = Math.max(4, Math.min(12, Number($('insiderPlayerCount').value) || 6));
  $('insiderPlayerCount').value = String(count);
  insiderState.players = Array.from({ length: count }, (_, index) => 'ผู้เล่น ' + (index + 1));
  insiderState.masterIndex = Math.floor(Math.random() * count);
  do { insiderState.insiderIndex = Math.floor(Math.random() * count); }
  while (insiderState.insiderIndex === insiderState.masterIndex);
  insiderState.word = insiderWords[Math.floor(Math.random() * insiderWords.length)];
  insiderState.dealIndex = 0;
  showInsiderDeal();
}
function showInsiderDeal() {
  setInsiderPhase('insiderDeal');
  $('insiderDealCount').textContent = (insiderState.dealIndex + 1) + ' / ' + insiderState.players.length;
  $('insiderDealPrompt').textContent = 'ส่งอุปกรณ์ให้' + insiderState.players[insiderState.dealIndex] + ' แล้วแตะเพื่อดูบทบาทเป็นการส่วนตัว';
  $('insiderRoleCard').classList.add('hidden');
  $('insiderRevealRoleBtn').classList.remove('hidden');
  $('insiderNextPlayerBtn').classList.add('hidden');
}
function revealInsiderRole() {
  const i = insiderState.dealIndex;
  const card = $('insiderRoleCard');
  card.classList.remove('hidden');
  $('insiderRevealRoleBtn').classList.add('hidden');
  $('insiderNextPlayerBtn').classList.remove('hidden');
  if (i === insiderState.masterIndex) {
    $('insiderRoleBadge').textContent = 'MASTER';
    $('insiderRoleTitle').textContent = 'คุณคือ Master';
    $('insiderRoleText').textContent = 'คำลับคือ “' + insiderState.word + '” ดูแลเวลาและร่วมวงพูดคุย แต่อย่าเฉลยคำให้คนอื่น';
  } else if (i === insiderState.insiderIndex) {
    $('insiderRoleBadge').textContent = 'INSIDER';
    $('insiderRoleTitle').textContent = 'คุณคือ Insider';
    $('insiderRoleText').textContent = 'คำลับคือ “' + insiderState.word + '” ช่วยให้วงเดาถูกโดยไม่ให้ใครจับได้ว่าคุณรู้คำตอบ';
  } else {
    $('insiderRoleBadge').textContent = 'TEAM';
    $('insiderRoleTitle').textContent = 'คุณเป็นผู้เล่นทั่วไป';
    $('insiderRoleText').textContent = 'คุณยังไม่รู้คำลับ คุยและถามคำถามเพื่อช่วยกันเดา พร้อมสังเกตว่าใครรู้คำตอบอยู่ก่อน';
  }
  $('insiderNextPlayerBtn').textContent = i === insiderState.players.length - 1 ? 'เริ่มช่วงพูดคุย' : 'ซ่อนบัตรและส่งต่อ';
}
function nextInsiderPlayer() {
  if (insiderState.dealIndex >= insiderState.players.length - 1) {
    beginInsiderDiscussion();
  } else {
    insiderState.dealIndex += 1;
    showInsiderDeal();
  }
}
function beginInsiderDiscussion() {
  setInsiderPhase('insiderDiscussion');
  insiderState.seconds = 300;
  $('insiderTimer').textContent = '05:00';
  $('insiderSecretWord').textContent = '••••••••';
  $('insiderSecretToggle').textContent = 'แสดงคำลับ';
  $('insiderTimerStartBtn').disabled = false;
  $('insiderTimerStartBtn').textContent = 'เริ่มจับเวลา';
}
function startInsiderTimer() {
  if (insiderState.timer) return;
  $('insiderTimerStartBtn').disabled = true;
  $('insiderTimerStartBtn').textContent = 'กำลังจับเวลา';
  insiderState.timer = setInterval(() => {
    insiderState.seconds -= 1;
    const mm = String(Math.floor(insiderState.seconds / 60)).padStart(2, '0');
    const ss = String(insiderState.seconds % 60).padStart(2, '0');
    $('insiderTimer').textContent = mm + ':' + ss;
    if (insiderState.seconds <= 0) {
      clearInterval(insiderState.timer);
      insiderState.timer = null;
      beginInsiderVoting();
    }
  }, 1000);
}
function toggleInsiderSecret() {
  clearTimeout(insiderState.secretTimeout);
  const visible = $('insiderSecretWord').textContent !== '••••••••';
  $('insiderSecretWord').textContent = visible ? '••••••••' : insiderState.word;
  $('insiderSecretToggle').textContent = visible ? 'แสดงคำลับ' : 'ซ่อนคำลับ';
  if (!visible) {
    insiderState.secretTimeout = setTimeout(() => {
      $('insiderSecretWord').textContent = '••••••••';
      $('insiderSecretToggle').textContent = 'แสดงคำลับ';
    }, 8000);
  }
}
function beginInsiderVoting() {
  clearInterval(insiderState.timer);
  insiderState.timer = null;
  clearTimeout(insiderState.secretTimeout);
  $('insiderSecretWord').textContent = '••••••••';
  $('insiderSecretToggle').textContent = 'แสดงคำลับ';
  insiderState.voterIndex = 0;
  insiderState.votes = Array(insiderState.players.length).fill(-1);
  setInsiderPhase('insiderVoting');
  renderInsiderVote();
}
function renderInsiderVote() {
  const voter = insiderState.voterIndex;
  $('insiderVoteCount').textContent = (voter + 1) + ' / ' + insiderState.players.length;
  $('insiderVotePrompt').textContent = 'ส่งอุปกรณ์ให้' + insiderState.players[voter] + ' เลือกผู้เล่นที่คิดว่าเป็น Insider';
  $('insiderVoteChoices').innerHTML = '';
  $('insiderVoteChoices').classList.remove('hidden');
  $('insiderVoteHandoff').classList.add('hidden');
  insiderState.players.forEach((name, index) => {
    if (index === insiderState.masterIndex || index === voter) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.addEventListener('click', () => {
      insiderState.votes[voter] = index;
      $('insiderVoteChoices').classList.add('hidden');
      $('insiderVoteHandoff').classList.remove('hidden');
      $('insiderVoteNextBtn').textContent = voter === insiderState.players.length - 1 ? 'ดูผลโหวต' : 'ส่งให้คนถัดไป';
    });
    $('insiderVoteChoices').appendChild(button);
  });
}
function nextInsiderVote() {
  if (insiderState.voterIndex >= insiderState.players.length - 1) {
    showInsiderResults();
  } else {
    insiderState.voterIndex += 1;
    renderInsiderVote();
  }
}
function showInsiderResults() {
  setInsiderPhase('insiderResults');
  const tally = Array(insiderState.players.length).fill(0);
  insiderState.votes.forEach((target) => { if (target >= 0) tally[target] += 1; });
  const maxVotes = Math.max(...tally);
  const leaders = tally.map((count, index) => count === maxVotes ? index : -1).filter((index) => index >= 0);
  const caught = leaders.includes(insiderState.insiderIndex);
  $('insiderOutcome').textContent = caught ? 'จับ Insider ได้!' : 'Insider หลบหนีไปได้';
  $('insiderRevealSummary').textContent = 'Insider คือ ' + insiderState.players[insiderState.insiderIndex] + ' • Master คือ ' + insiderState.players[insiderState.masterIndex] + ' • คำลับคือ “' + insiderState.word + '”';
  $('insiderTally').innerHTML = '';
  insiderState.players.forEach((name, index) => {
    if (index === insiderState.masterIndex) return;
    const row = document.createElement('div');
    row.className = 'insider-tally-row';
    const identity = document.createElement('span');
    identity.textContent = name + (index === insiderState.insiderIndex ? ' • INSIDER' : '');
    const count = document.createElement('strong');
    count.textContent = String(tally[index]) + ' โหวต';
    row.append(identity, count);
    $('insiderTally').appendChild(row);
  });
}
$('insiderStartBtn').addEventListener('click', startInsider);
$('insiderRevealRoleBtn').addEventListener('click', revealInsiderRole);
$('insiderNextPlayerBtn').addEventListener('click', nextInsiderPlayer);
$('insiderTimerStartBtn').addEventListener('click', startInsiderTimer);
$('insiderBeginVoteBtn').addEventListener('click', beginInsiderVoting);
$('insiderSecretToggle').addEventListener('click', toggleInsiderSecret);
$('insiderVoteNextBtn').addEventListener('click', nextInsiderVote);
$('insiderReplayBtn').addEventListener('click', resetInsider);


/* Online Insider multiplayer flow */
(() => {
  const $ = (id) => document.getElementById(id);
  const online = { code:null, playerId:null, room:null, role:null, word:null, votedIds:[], secretVisible:false, clock:null };
  const panels = ['insiderOnlineSetup','insiderOnlineLobby','insiderOnlinePlay','insiderOnlineResults'];
  const showPanel = (id) => panels.forEach((panelId) => $(panelId).classList.toggle('hidden', panelId !== id));
  const isHost = () => online.room?.hostId === online.playerId;
  function setStatus(message) { $('insiderOnlineStatus').textContent = message; }
  function showOnline() {
    $('insiderSetup').classList.add('hidden');
    $('insiderOnlineView').classList.remove('hidden');
    showPanel(online.room ? (online.room.status === 'lobby' ? 'insiderOnlineLobby' : online.room.status === 'results' ? 'insiderOnlineResults' : 'insiderOnlinePlay') : 'insiderOnlineSetup');
    setStatus(socket.connected ? 'รองรับผู้เล่น 4–12 คน เมื่อทุกคนเข้าห้องแล้ว Host เริ่มเกมได้' : 'กำลังเชื่อมต่อเซิร์ฟเวอร์...');
  }
  function leaveAndReset() {
    if (online.code) socket.emit('insider:room:leave');
    clearInterval(online.clock);
    online.clock = null;
    online.code = online.playerId = null;
    online.room = online.role = online.word = null;
    online.votedIds = [];
    online.secretVisible = false;
    $('insiderOnlineSecret').textContent = '••••••••';
    $('insiderOnlineSecretBox').classList.add('hidden');
    $('insiderOnlineVoteChoices').replaceChildren();
    $('insiderOnlineView').classList.add('hidden');
    $('insiderSetup').classList.remove('hidden');
  }
  function send(event, payload = {}) {
    if (!socket.connected) return setStatus('ขาดการเชื่อมต่อ กรุณารอสักครู่แล้วลองใหม่');
    socket.timeout(15000).emit(event, payload, (error, result) => { if (error) setStatus('เซิร์ฟเวอร์ยังไม่ตอบกลับ ลองใหม่อีกครั้ง'); else if (result?.ok === false) setStatus(result.message || 'ดำเนินการไม่สำเร็จ'); });
  }
  function renderPlayers() {
    const list = $('insiderOnlinePlayers');
    list.replaceChildren();
    const players = online.room?.players || [];
    players.forEach((player) => {
      const row = document.createElement('div'); row.className = 'insider-online-player';
      const name = document.createElement('strong'); name.textContent = player.name;
      const badge = document.createElement('small'); badge.textContent = player.isHost ? 'HOST' : 'พร้อมเล่น';
      row.append(name,badge); list.appendChild(row);
    });
    $('insiderOnlinePlayerCount').textContent = players.length + ' / 12 คน';
    $('insiderOnlineLobbyHint').textContent = players.length < 4 ? 'ต้องมีผู้เล่นอีก ' + (4 - players.length) + ' คนก่อนเริ่มเกม' : 'ทุกคนเข้าร่วมแล้ว Host เริ่มเกมได้เลย';
    $('insiderOnlineStartBtn').classList.toggle('hidden',!isHost());
    $('insiderOnlineStartBtn').disabled = players.length < 4;
  }
  function renderSecret() {
    const hasWord = (online.role === 'master' || online.role === 'insider') && Boolean(online.word);
    $('insiderOnlineSecretBox').classList.toggle('hidden',!hasWord);
    $('insiderOnlineRole').textContent = online.role === 'master'
      ? 'คุณคือ Master • ดูแลเกมและช่วยนำวงสนทนา'
      : online.role === 'insider'
        ? 'คุณคือ Insider • ช่วยวงเดาคำและพยายามไม่ให้ถูกจับได้'
        : 'คุณเป็นผู้เล่นทั่วไป • ช่วยกันเดาคำและจับ Insider';
    $('insiderOnlineSecret').textContent = online.secretVisible && hasWord ? online.word : '••••••••';
    $('insiderOnlineSecretToggle').textContent = online.secretVisible ? 'ซ่อนคำลับ' : 'แสดงคำลับ';
  }
  function renderVoteChoices() {
    const list = $('insiderOnlineVoteChoices'); list.replaceChildren();
    if (online.room?.status !== 'voting') return;
    const hasVoted = online.votedIds.includes(online.playerId), players = online.room.players || [];
    $('insiderOnlineVoteProgress').textContent = hasVoted
      ? 'ส่งคะแนนแล้ว ' + online.votedIds.length + '/' + players.length + ' คน • รอผลเมื่อทุกคนโหวตครบ'
      : 'เลือกผู้เล่นที่คิดว่าเป็น Insider • ' + online.votedIds.length + '/' + players.length + ' คนโหวตแล้ว';
    players.filter((player) => player.id !== online.playerId).forEach((player) => {
      const button=document.createElement('button'); button.type='button'; button.textContent=player.name; button.disabled=hasVoted;
      button.addEventListener('click',()=>socket.emit('insider:round:vote',{targetId:player.id})); list.appendChild(button);
    });
  }
  function renderRoom() {
    if (!online.room) return;
    const room=online.room;
    $('insiderOnlineRoomCode').textContent=room.code;
    renderPlayers();
    if (room.status==='lobby') {
      clearInterval(online.clock); online.clock=null; showPanel('insiderOnlineLobby');
      $('insiderOnlineRole').textContent=''; $('insiderOnlineSecretBox').classList.add('hidden');
    } else if (room.status==='discussion'||room.status==='voting') {
      showPanel('insiderOnlinePlay');
      $('insiderOnlinePhase').textContent=room.status==='discussion'?'ช่วงพูดคุย':'ลงคะแนน';
      $('insiderOnlineBeginVoteBtn').classList.toggle('hidden',!isHost()||room.status!=='discussion');
      $('insiderOnlineVoteChoices').classList.toggle('hidden',room.status!=='voting');
      $('insiderOnlineVoteProgress').classList.toggle('hidden',room.status!=='voting');
      renderSecret();
      if(room.status==='discussion'&&room.endsAt){
        clearInterval(online.clock);
        const tick=()=>{const left=Math.max(0,Math.ceil((room.endsAt-Date.now())/1000));$('insiderOnlineTimer').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');};
        tick(); online.clock=setInterval(tick,1000);
      } else {
        clearInterval(online.clock); online.clock=null;
        $('insiderOnlineTimer').textContent=online.votedIds.length+' / '+room.players.length+' โหวต';
      }
      renderVoteChoices();
    } else if(room.status==='results') {
      clearInterval(online.clock); online.clock=null; showPanel('insiderOnlineResults');
      $('insiderOnlineNewRoundBtn').classList.toggle('hidden',!isHost());
      $('insiderOnlineWait').classList.toggle('hidden',isHost());
    }
  }
  function renderResults(result) {
    $('insiderOnlineOutcome').textContent=result.insiderCaught?'จับ Insider ได้!':'Insider หลบหนีไปได้';
    $('insiderOnlineSummary').textContent='Insider คือ '+result.insiderName+' • Master คือ '+result.masterName+' • คำลับคือ “'+result.word+'”';
    const list=$('insiderOnlineTally'); list.replaceChildren();
    result.tally.forEach((player)=>{
      const row=document.createElement('div');row.className='insider-tally-row';
      const name=document.createElement('span');name.textContent=player.name+(player.role==='insider'?' • INSIDER':player.role==='master'?' • MASTER':'');
      const count=document.createElement('strong');count.textContent=player.votes+' โหวต';row.append(name,count);list.appendChild(row);
    });
  }

  $('insiderOnlineOpenBtn').addEventListener('click',showOnline);
  $('insiderOnlineBackBtn').addEventListener('click',leaveAndReset);
  $('miniBackBtn').addEventListener('click',leaveAndReset);
  $('insiderOnlineCreateBtn').addEventListener('click',()=>send('insider:room:create',{name:$('insiderOnlineName').value.trim()||'ผู้เล่น'}));
  $('insiderOnlineJoinBtn').addEventListener('click',()=>{
    const code=$('insiderOnlineCode').value.trim().toUpperCase();
    if(!code)return setStatus('กรอกรหัสห้องก่อน');
    send('insider:room:join',{name:$('insiderOnlineName').value.trim()||'ผู้เล่น',code});
  });
  $('insiderOnlineCopyBtn').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(online.code||'');setStatus('คัดลอกรหัสห้องแล้ว ส่งรหัสนี้ให้เพื่อนได้เลย');}
    catch{$('insiderOnlineCode').value=online.code||'';setStatus('คัดลอกรหัสไม่สำเร็จ แตะค้างที่รหัสเพื่อคัดลอก');}
  });
  $('insiderOnlineStartBtn').addEventListener('click',()=>socket.emit('insider:round:start'));
  $('insiderOnlineBeginVoteBtn').addEventListener('click',()=>socket.emit('insider:round:voteStart'));
  $('insiderOnlineNewRoundBtn').addEventListener('click',()=>socket.emit('insider:round:new'));
  $('insiderOnlineSecretToggle').addEventListener('click',()=>{online.secretVisible=!online.secretVisible;renderSecret();});

  socket.on('insider:room:joined',({code,playerId})=>{
    online.code=code;online.playerId=playerId;$('insiderOnlineCode').value=code;showPanel('insiderOnlineLobby');
    setStatus('เข้าห้องแล้ว แชร์รหัสให้เพื่อนเข้าร่วม');
  });
  socket.on('insider:room:state',(room)=>{
    if(online.code&&room.code!==online.code)return;
    online.code=room.code;online.room=room;
    if(room.status==='lobby'){online.role=null;online.word=null;online.secretVisible=false;}
    renderRoom();
  });
  socket.on('insider:secret',({role,word})=>{online.role=role;online.word=word;online.secretVisible=false;renderSecret();});
  socket.on('insider:vote:state',({votedPlayerIds=[]})=>{online.votedIds=votedPlayerIds;if(online.room)renderRoom();});
  socket.on('insider:round:results',renderResults);
  socket.on('insider:round:reset',()=>{online.role=null;online.word=null;online.votedIds=[];online.secretVisible=false;});
  socket.on('insider:room:error',setStatus);
  socket.on('connect',()=>{if(!$('insiderOnlineView').classList.contains('hidden'))setStatus(online.code?'เชื่อมต่อแล้ว แต่ให้ออกจากห้องและเข้าร่วมใหม่':'เชื่อมต่อแล้ว สร้างห้องหรือเข้าร่วมด้วยรหัสได้เลย');});
  socket.on('disconnect',()=>{
    if($('insiderOnlineView').classList.contains('hidden'))return;
    clearInterval(online.clock);online.clock=null;online.code=online.playerId=null;online.room=null;
    setStatus('การเชื่อมต่อหลุด ห้องเดิมสิ้นสุดแล้ว เชื่อมต่อใหม่และสร้างหรือเข้าร่วมห้องอีกครั้ง');
    showPanel('insiderOnlineSetup');
  });
})();
