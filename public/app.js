const socket = io();
let state = null;
let secret = null;
let ticker = null;
const $ = id => document.getElementById(id);
function toast(msg){const t=$('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',2800)}
function nameVal(){return $('name').value.trim() || 'Player'}
$('createBtn').onclick=()=>socket.emit('room:create',{name:nameVal()});
$('joinBtn').onclick=()=>socket.emit('room:join',{name:nameVal(),code:$('roomCode').value});
$('startBtn').onclick=()=>socket.emit('round:start',{seconds:$('seconds').value});
$('endBtn').onclick=()=>socket.emit('round:end');
socket.on('error:message',toast);
socket.on('room:joined',({code})=>{$('joinScreen').classList.add('hidden');$('gameScreen').classList.remove('hidden');$('codeLabel').textContent=code;history.replaceState(null,'',`#${code}`);});
socket.on('room:update',room=>{state=room;render();});
socket.on('round:secret',s=>{secret=s;renderSecret();});
socket.on('round:reveal',r=>{secret=null;toast(`เฉลย: Spy คือ ${r.spyName} | สถานที่: ${r.location}`);$('secretCard').className='secretCard';$('roleText').textContent='จบรอบแล้ว';$('secretText').textContent=`Spy: ${r.spyName} | สถานที่: ${r.location}`;});
function render(){if(!state)return;$('status').textContent=state.status==='playing'?'Playing':'Lobby';$('startBtn').disabled=state.status==='playing'||socket.id!==state.hostId;$('endBtn').disabled=state.status!=='playing'||socket.id!==state.hostId;renderPlayers();renderTimer();if(!ticker){ticker=setInterval(renderTimer,500)}}
function renderSecret(){const c=$('secretCard');c.className='secretCard '+(secret.role==='spy'?'spy':'civilian');$('roleText').textContent=secret.role==='spy'?'คุณคือ SPY 🕵️':'คุณไม่ใช่ Spy ✅';$('secretText').textContent=secret.role==='spy'?secret.hint:`สถานที่: ${secret.location}`}
function renderPlayers(){const wrap=$('players');wrap.innerHTML='';state.players.forEach(p=>{const div=document.createElement('div');div.className='player '+(!p.connected?'off':'');div.innerHTML=`<div><b>${escapeHtml(p.name)}</b><br><small>${p.isHost?'Host · ':''}${p.connected?'online':'offline'} · votes ${p.votes}</small></div>`;const btn=document.createElement('button');btn.className='vote';btn.textContent='โหวต';btn.disabled=state.status!=='playing'||p.id===socket.id;btn.onclick=()=>socket.emit('vote',{targetId:p.id});div.appendChild(btn);wrap.appendChild(div);});}
function renderTimer(){if(!state||state.status!=='playing'||!state.startedAt){$('timer').textContent='--:--';return;}const left=Math.max(0,Math.ceil((state.startedAt+state.roundSeconds*1000-Date.now())/1000));const m=String(Math.floor(left/60)).padStart(2,'0');const s=String(left%60).padStart(2,'0');$('timer').textContent=`${m}:${s}`;}
function escapeHtml(x){return String(x).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
const hash=location.hash.replace('#','').toUpperCase(); if(hash) $('roomCode').value=hash;
