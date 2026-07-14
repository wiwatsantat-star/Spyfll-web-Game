const socket = io();
let state = null;
let secret = null;
let ticker = null;
let allLocations = [];
let selectedLocations = new Set();
const $ = id => document.getElementById(id);

fetch('/data/locations.json').then(r => r.json()).then(list => {
  allLocations = list;
  selectedLocations = new Set(list.map(x => x.name));
  $('landingLocationCount').textContent = list.length;
  $('landingRoleCount').textContent = list.reduce((n, x) => n + x.roles.length, 0);
  renderLocationPicker();
}).catch(() => toast('โหลดรายการสถานที่ไม่สำเร็จ'));

function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2800); }
function nameVal(){ return $('name').value.trim() || 'Player'; }
function escapeHtml(x){ return String(x ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function selectedList(){ return [...selectedLocations]; }

$('createBtn').onclick = () => socket.emit('room:create', { name: nameVal() });
$('joinBtn').onclick = () => socket.emit('room:join', { name: nameVal(), code: $('roomCode').value });
$('startBtn').onclick = () => socket.emit('round:start', {
  seconds: $('seconds').value,
  spyCount: $('spyCount').value,
  spyCandidateCount: $('candidateCount').value,
  selectedLocations: selectedList()
});
$('endBtn').onclick = () => socket.emit('round:end');
$('resetBtn').onclick = () => socket.emit('round:reset');
$('saveSettingsBtn').onclick = () => socket.emit('room:settings', {
  selectedLocations: selectedList(), spyCandidateCount: $('candidateCount').value
});
$('selectAllBtn').onclick = () => { selectedLocations = new Set(allLocations.map(x => x.name)); renderLocationPicker(); };
$('clearAllBtn').onclick = () => { selectedLocations.clear(); renderLocationPicker(); };
$('locationSearch').oninput = renderLocationPicker;
$('copyCode').onclick = async () => { await navigator.clipboard?.writeText($('codeLabel').textContent); toast('คัดลอกรหัสห้องแล้ว'); };
$('roomCode').addEventListener('keydown', e => { if(e.key === 'Enter') $('joinBtn').click(); });
$('name').addEventListener('keydown', e => { if(e.key === 'Enter') $('createBtn').click(); });

socket.on('error:message', toast);
socket.on('settings:saved', ({ selectedLocationCount }) => toast(`บันทึกแล้ว ${selectedLocationCount} สถานที่`));
socket.on('room:joined', ({ code }) => {
  $('joinScreen').classList.add('hidden'); $('gameScreen').classList.remove('hidden');
  $('codeLabel').textContent = code; history.replaceState(null, '', `#${code}`);
});
socket.on('room:update', room => { state = room; render(); });
socket.on('round:secret', s => { secret = s; $('revealBox').classList.add('hidden'); renderSecret(); });
socket.on('round:cleared', () => { secret = null; $('revealBox').classList.add('hidden'); resetSecretCard(); });
socket.on('round:reveal', r => {
  secret = null;
  const roles = Object.values(r.assignedRoles || {}).filter(Boolean).slice(0, 10).join(', ');
  $('revealBox').classList.remove('hidden');
  $('revealBox').innerHTML = `<h3>เฉลยรอบนี้</h3><p><b>Spy:</b> ${r.spyNames.map(escapeHtml).join(', ')}</p><p><b>สถานที่:</b> ${escapeHtml(r.location)}</p><p><b>ตัวอย่างบทบาท:</b> ${escapeHtml(roles)}</p>`;
  const c = $('secretCard'); c.className = 'secret-card revealed';
  $('secretBadge').textContent = 'เฉลย'; $('roleText').textContent = 'จบรอบแล้ว';
  $('secretText').innerHTML = `<b>Spy:</b> ${r.spyNames.map(escapeHtml).join(', ')}<br><b>สถานที่:</b> ${escapeHtml(r.location)}<br><b>จำนวนสถานที่:</b> ${r.locationCount} ที่`;
});

function render(){
  if(!state) return;
  const isHost = socket.id === state.hostId;
  $('status').textContent = state.status === 'playing' ? 'Playing' : state.status === 'revealed' ? 'Revealed' : 'Lobby';
  $('locationCount').textContent = state.locationCount || '-'; $('roleCount').textContent = state.roleCount || '-';
  $('playerCount').textContent = `${state.players.length}/15`;
  $('startBtn').disabled = state.status === 'playing' || !isHost;
  $('endBtn').disabled = state.status !== 'playing' || !isHost;
  $('resetBtn').disabled = state.status === 'playing' || !isHost;
  ['seconds','spyCount','candidateCount','locationSearch','selectAllBtn','clearAllBtn','saveSettingsBtn'].forEach(id => $(id).disabled = !isHost || state.status === 'playing');
  $('hostSettings').classList.toggle('host-disabled', !isHost);
  if (state.spyCandidateCount) $('candidateCount').value = String(state.spyCandidateCount);
  renderPlayers(); renderTimer(); renderLocationPicker();
  if(!ticker) ticker = setInterval(renderTimer, 500);
}
function renderLocationPicker(){
  if (!$('locationPicker')) return;
  const q = ($('locationSearch').value || '').trim().toLowerCase();
  const filtered = allLocations.filter(x => x.name.toLowerCase().includes(q));
  $('selectedCount').textContent = selectedLocations.size;
  $('locationPicker').innerHTML = filtered.map(x => `
    <label class="location-option ${selectedLocations.has(x.name) ? 'picked' : ''}">
      <input type="checkbox" value="${escapeHtml(x.name)}" ${selectedLocations.has(x.name) ? 'checked' : ''} />
      <span><b>${escapeHtml(x.name)}</b><small>${x.roles.length} บทบาท</small></span>
    </label>`).join('');
  $('locationPicker').querySelectorAll('input').forEach(input => {
    input.onchange = () => {
      if (input.checked) selectedLocations.add(input.value); else selectedLocations.delete(input.value);
      renderLocationPicker();
    };
  });
}
function renderPlayers(){
  const wrap = $('players'); wrap.innerHTML = '';
  state.players.forEach(p => {
    const div = document.createElement('div'); div.className = 'player ' + (!p.connected ? 'off' : '');
    div.innerHTML = `<div><b>${escapeHtml(p.name)}</b><small>${p.isHost ? 'Host · ' : ''}${p.connected ? 'online' : 'offline'} · votes ${p.votes}</small></div>`;
    const actions = document.createElement('div'); actions.className = 'player-actions';
    const vote = document.createElement('button'); vote.className = 'mini'; vote.textContent = 'โหวต'; vote.disabled = state.status !== 'playing' || p.id === socket.id; vote.onclick = () => socket.emit('vote', { targetId: p.id }); actions.appendChild(vote);
    if(socket.id === state.hostId && !p.isHost){ const kick=document.createElement('button'); kick.className='mini danger'; kick.textContent='Kick'; kick.onclick=()=>socket.emit('room:kick',{playerId:p.id}); actions.appendChild(kick); }
    div.appendChild(actions); wrap.appendChild(div);
  });
}
function renderSecret(){
  const c = $('secretCard'); if(!secret) return resetSecretCard();
  c.className = 'secret-card ' + (secret.type === 'spy' ? 'spy' : 'civilian');
  $('secretBadge').textContent = secret.type === 'spy' ? 'สายลับ' : 'ผู้เล่นทั่วไป'; $('roleText').textContent = secret.title;
  if (secret.type === 'spy') {
    const list = (secret.candidates || []).map((name, i) => `<span class="candidate-chip">${i + 1}. ${escapeHtml(name)}</span>`).join('');
    $('secretText').innerHTML = `${escapeHtml(secret.hint)}<div class="candidate-list">${list}</div><b>คำเตือน:</b> รายการนี้มีสถานที่จริงเพียง 1 แห่ง`;
  } else {
    $('secretText').innerHTML = `<b>สถานที่:</b> ${escapeHtml(secret.location)}<br><b>บทบาท:</b> ${escapeHtml(secret.character)}<br><b>จำนวนสถานที่ในเกม:</b> ${secret.locationCount} ที่ · <b>บทบาททั้งหมด:</b> ${secret.roleCount}`;
  }
}
function resetSecretCard(){
  const c = $('secretCard'); c.className = 'secret-card'; $('secretBadge').textContent = 'บทบาทของคุณ';
  $('roleText').textContent = 'รอเริ่มเกม'; $('secretText').textContent = 'Host กดเริ่มเมื่อผู้เล่นพร้อม';
}
function renderTimer(){
  if(!state || state.status !== 'playing' || !state.startedAt){ $('timer').textContent='--:--'; return; }
  const left = Math.max(0, Math.ceil((state.startedAt + state.roundSeconds * 1000 - Date.now()) / 1000));
  $('timer').textContent = `${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
}
const hash = location.hash.replace('#','').toUpperCase(); if(hash) $('roomCode').value = hash;
