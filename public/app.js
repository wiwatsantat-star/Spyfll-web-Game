const socket = io();

const state = {
  playerId: null,
  room: null,
  locations: [],
  timerHandle: null,
  secretVisible: true,
  roomEntryPending: false,
  roomEntryAction: null,
  roomEntryRequestId: 0
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

  socket.timeout(12000).emit(eventName, payload, (error, result) => {
    if (requestId !== state.roomEntryRequestId) return;
    state.roomEntryPending = false;
    state.roomEntryAction = null;
    updateRoomEntryButtons();
    if (error) {
      showToast('เซิร์ฟเวอร์ไม่ตอบกลับ กรุณาลองเข้า Session อีกครั้ง');
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
  updateRoomEntryButtons();
  socket.emit('locations:list');
});
socket.on('connect_error', () => {
  setConnectionStatus('กำลังเชื่อมต่อ...', 'is-connecting');
  updateRoomEntryButtons();
});
socket.on('disconnect', () => {
  setConnectionStatus('ออฟไลน์', 'is-offline');
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
  if (kind === 'charades') resetCharades();
  if (kind === 'quiz') resetQuiz();
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
