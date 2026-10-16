const params=new URLSearchParams(location.search);
const demo=params.get('demo')==='1';
const loginView=document.getElementById('loginView');
const appView=document.getElementById('appView');
const dateInput=document.getElementById('serviceDate');
let currentData={reservations:[],waitlist:[],tables:[],blocks:[],stats:{}};
let statusFilter='all';
let settingsLoaded=false;
let settingsData=null;

const stockholmDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const WEEKDAYS={1:'Måndag',2:'Tisdag',3:'Onsdag',4:'Torsdag',5:'Fredag',6:'Lördag',7:'Söndag'};
const TRANSITIONS={pending:['confirmed','cancelled'],confirmed:['arrived','seated','completed','no_show','cancelled'],arrived:['seated','completed','cancelled'],seated:['completed'],completed:[],cancelled:[],no_show:[]};
dateInput.value=stockholmDate();

if(demo){loginView.hidden=true;appView.hidden=false;document.getElementById('demoAdminBanner').hidden=false;load();}else checkSession();

async function checkSession(){
  try{const r=await fetch('/api/admin/session');if(!r.ok)throw 0;loginView.hidden=true;appView.hidden=false;load();}
  catch{loginView.hidden=false;appView.hidden=true;}
}

document.getElementById('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const err=document.getElementById('loginError');err.textContent='';
  try{const r=await fetch('/api/admin/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:e.currentTarget.password.value})});const d=await r.json();if(!r.ok)throw new Error(d.message||'Inloggningen misslyckades.');loginView.hidden=true;appView.hidden=false;load();}
  catch(x){err.textContent=x.message||'Inloggningen misslyckades.';}
});

document.getElementById('logout').onclick=async()=>{if(!demo)await fetch('/api/admin/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'logout'})});location.href='./';};
dateInput.addEventListener('change',load);
document.getElementById('prevDate').onclick=()=>shift(-1);
document.getElementById('nextDate').onclick=()=>shift(1);
function shift(n){const d=new Date(`${dateInput.value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);dateInput.value=d.toISOString().slice(0,10);load();}

document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('[data-panel]').forEach(p=>p.classList.toggle('active',p.dataset.panel===b.dataset.tab));
  document.getElementById('adminTitle').textContent={service:'Dagens service',floor:'Bordskarta',waitlist:'Väntelista',settings:'Inställningar'}[b.dataset.tab];
  if(b.dataset.tab==='settings')loadSettings();
});
document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{statusFilter=b.dataset.status;document.querySelectorAll('[data-status]').forEach(x=>x.classList.toggle('active',x===b));renderReservations();});

async function load(){
  try{currentData=demo?demoData():await api(`/api/admin/reservations?date=${dateInput.value}`);render();}
  catch(e){document.getElementById('reservationList').innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
}
async function api(url,options){const r=await fetch(url,options);const d=await r.json().catch(()=>({}));if(r.status===401){location.reload();throw new Error('Sessionen har gått ut.');}if(!r.ok)throw new Error(d.message||'Något gick fel.');return d;}

function demoData(){
  const stored=JSON.parse(localStorage.getItem('gojo-demo-reservations')||'[]').filter(x=>x.date===dateInput.value).map((x,i)=>({id:`demo-${i}`,confirmation_code:x.confirmationCode,guest_name:x.name||'Demogäst',guest_phone:x.phone||'0700000000',party_size:x.partySize,starts_at:`${x.date}T${x.time}:00+02:00`,status:x.status||'confirmed',source:'web',table_codes:['T1','T2','T3','T4','T5','T6','T7'][i%7]}));
  if(!stored.length){['17:30','18:00','18:30','19:00','20:00'].forEach((t,i)=>stored.push({id:`seed-${i}`,confirmation_code:`DEMO-${i+1}`,guest_name:['Anna Lind','Johan Berg','Sara Ali','Marcus Ek','Nora Dahl'][i],guest_phone:'070 000 00 0'+i,party_size:[2,4,6,2,3][i],starts_at:`${dateInput.value}T${t}:00+02:00`,status:['confirmed','arrived','confirmed','seated','confirmed'][i],source:i===2?'phone_ai':'web',table_codes:['T1','T3','T5','T2','T7'][i]}));}
  const tables=demoTables();
  const waitlist=[{id:'w1',guest_name:'Linnea',guest_phone:'070…',party_size:4,earliest_time:'19:00',latest_time:'20:30',status:'waiting'}];
  const active=stored.filter(x=>['confirmed','arrived','seated'].includes(x.status));
  return{ok:true,reservations:stored,waitlist,tables,blocks:[],opening:null,stats:{reservations:active.length,covers:active.reduce((n,x)=>n+x.party_size,0),waitlist:1,largeParties:active.filter(x=>x.party_size>=9).length},developmentDefaults:true};
}
function demoTables(){return [['1',2,8,12,'round'],['2',2,27,12,'round'],['3',4,52,12,'rectangle'],['4',4,76,12,'rectangle'],['5',6,8,48,'rectangle'],['6',2,42,49,'square'],['7',4,69,48,'rectangle']].map(([code,max,x,y,shape])=>({id:`T${code}`,code:`T${code}`,label:`Bord ${code}`,min_capacity:1,max_capacity:max,x,y,width:max===6?24:18,height:14,shape,active:true,is_development_default:true}));}

function render(){const s=currentData.stats||{};document.getElementById('statReservations').textContent=s.reservations||0;document.getElementById('statCovers').textContent=s.covers||0;document.getElementById('statWaitlist').textContent=s.waitlist||0;document.getElementById('statLarge').textContent=s.largeParties||0;renderReservations();renderFloor();renderWaitlist();}

function renderReservations(){
  const list=document.getElementById('reservationList');let rows=currentData.reservations||[];if(statusFilter!=='all')rows=rows.filter(r=>r.status===statusFilter);
  if(!rows.length){list.innerHTML='<div class="empty">Inga bokningar i det här filtret.</div>';return;}
  list.innerHTML=rows.map(r=>{const next=TRANSITIONS[r.status]||[];const action=next.length?`<select data-id="${esc(r.id)}"><option value="">Ändra…</option>${next.map(s=>`<option value="${s}">${label(s)}</option>`).join('')}</select>`:'<span class="meta">Avslutad</span>';return `<article class="reservation-row"><div class="time">${clock(r.starts_at)}</div><div class="guest"><strong>${esc(r.guest_name)}</strong><small>${esc(r.guest_phone||'')}</small></div><div class="party-col meta">${r.party_size} pers</div><div class="table-col meta">${esc(r.table_codes||'–')}</div><div><span class="status-pill ${r.status}">${label(r.status)}</span></div><div class="row-actions">${action}</div></article>`;}).join('');
  list.querySelectorAll('select[data-id]').forEach(s=>s.onchange=()=>changeStatus(s.dataset.id,s.value));
}
async function changeStatus(id,status){if(!status)return;if(demo){const r=currentData.reservations.find(x=>x.id===id);if(r)r.status=status;render();return;}try{await api('/api/admin/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'status',reservationId:id,status})});await load();}catch(e){alert(e.message);await load();}}

function renderFloor(){
  const floor=document.getElementById('floorPlan');const tables=currentData.tables||[];const blocks=currentData.blocks||[];
  const wholeBlock=blocks.find(b=>!b.table_id);document.getElementById('floorHint').textContent=wholeBlock?`Hela restaurangen blockerad: ${wholeBlock.reason||'ingen anledning angiven'}`:(currentData.developmentDefaults?'Utvecklingslayout tills GOJO skickar riktig planritning.':'Dra bord för att uppdatera placering.');
  floor.innerHTML=tables.map(t=>{let status=blocks.some(b=>String(b.table_id)===String(t.id))?'blocked':'free';const found=(currentData.reservations||[]).find(r=>(r.table_codes||'').split(', ').includes(t.code)&&['confirmed','arrived','seated'].includes(r.status));if(status!=='blocked'&&found)status=found.status==='seated'?'seated':'reserved';const left=Number(t.x??10),top=Number(t.y??10),w=Number(t.width??18),h=Number(t.height??14);return`<div class="floor-table editable ${esc(t.shape)} ${status}" data-table-id="${esc(t.id)}" style="left:${left}%;top:${top}%;width:${w}%;height:${h}%"><div><strong>${esc(t.code)}</strong><span>${t.max_capacity}p</span></div></div>`;}).join('');enableFloorDrag();
}
function renderWaitlist(){const el=document.getElementById('waitlistList'),items=currentData.waitlist||[];el.innerHTML=items.length?items.map(w=>`<article class="reservation-row"><div class="time">${String(w.earliest_time).slice(0,5)}</div><div class="guest"><strong>${esc(w.guest_name)}</strong><small>${esc(w.guest_phone)}</small></div><div class="party-col meta">${w.party_size} pers</div><div class="table-col meta">till ${String(w.latest_time).slice(0,5)}</div><div><span class="status-pill">${esc(w.status)}</span></div><div></div></article>`).join(''):'<div class="empty">Ingen väntelista.</div>';}

const dialog=document.getElementById('reservationDialog');document.getElementById('newReservation').onclick=()=>{const f=document.getElementById('adminBookingForm');f.date.value=dateInput.value;dialog.showModal();};
document.getElementById('adminBookingForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=new FormData(f),body={action:'create',reservation:Object.fromEntries(fd)};body.reservation.partySize=Number(body.reservation.partySize);try{if(demo){dialog.close();await load();return;}await api('/api/admin/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});dialog.close();f.reset();await load();}catch(x){document.getElementById('dialogError').textContent=x.message;}});

async function loadSettings(force=false){
  if(settingsLoaded&&!force)return;
  try{
    settingsData=demo?demoSettings():await api('/api/admin/settings');
    const r=settingsData.rules||{};const f=document.getElementById('rulesForm');const map={slotIntervalMinutes:'slot_interval_minutes',defaultDurationMinutes:'default_duration_minutes',bufferBeforeMinutes:'buffer_before_minutes',bufferAfterMinutes:'buffer_after_minutes',minPartySize:'min_party_size',maxOnlinePartySize:'max_online_party_size',largePartyThreshold:'large_party_threshold',minLeadMinutes:'min_lead_minutes',maxAdvanceDays:'max_advance_days',gracePeriodMinutes:'grace_period_minutes'};
    for(const [name,key] of Object.entries(map))if(f.elements[name])f.elements[name].value=r[key]??'';
    renderWeeklyHours();renderSpecialHours();renderBlocks();populateBlockTables();
    const today=stockholmDate();const sf=document.getElementById('specialHoursForm'),bf=document.getElementById('blockForm');if(!sf.date.value)sf.date.value=today;if(!bf.date.value)bf.date.value=today;
    settingsLoaded=true;
  }catch(e){document.getElementById('settingsStatus').textContent=e.message;}
}
function demoSettings(){return{rules:{slot_interval_minutes:30,default_duration_minutes:120,buffer_before_minutes:0,buffer_after_minutes:0,min_party_size:1,max_online_party_size:8,large_party_threshold:9,min_lead_minutes:60,max_advance_days:90,grace_period_minutes:15},hours:[{weekday:1,closed:true},{weekday:2,closed:true},{weekday:3,opens_at:'16:00',closes_at:'23:00',closed:false},{weekday:4,opens_at:'16:00',closes_at:'23:00',closed:false},{weekday:5,opens_at:'16:00',closes_at:'00:00',closed:false},{weekday:6,opens_at:'13:00',closes_at:'00:00',closed:false},{weekday:7,opens_at:'13:00',closes_at:'23:00',closed:false}],tables:demoTables(),specialHours:[],blocks:[]};}

document.getElementById('rulesForm').addEventListener('submit',async e=>{e.preventDefault();const status=document.getElementById('settingsStatus'),fd=new FormData(e.currentTarget),rules={};for(const [k,v] of fd)rules[k]=Number(v);status.textContent='Sparar…';try{if(!demo)await api('/api/admin/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'rules',rules})});status.textContent='Sparat';settingsLoaded=false;setTimeout(()=>status.textContent='',1800);}catch(x){status.textContent=x.message;}});

function renderWeeklyHours(){
  const el=document.getElementById('weeklyHoursList');const latest=new Map();for(const row of settingsData.hours||[]){if(!latest.has(Number(row.weekday)))latest.set(Number(row.weekday),row);}
  el.innerHTML=Object.entries(WEEKDAYS).map(([day,name])=>{const r=latest.get(Number(day))||{weekday:Number(day),closed:true};return `<div class="hour-row" data-weekday="${day}"><strong>${name}</strong><input class="hour-open" type="time" value="${r.opens_at?String(r.opens_at).slice(0,5):'16:00'}" ${r.closed?'disabled':''}><span>–</span><input class="hour-close" type="time" value="${r.closes_at?String(r.closes_at).slice(0,5):'23:00'}" ${r.closed?'disabled':''}><label><input class="hour-closed" type="checkbox" ${r.closed?'checked':''}> Stängt</label><button type="button" class="mini-btn" data-save-hours>Spara</button></div>`;}).join('');
  el.querySelectorAll('.hour-row').forEach(row=>{const check=row.querySelector('.hour-closed');check.onchange=()=>{row.querySelector('.hour-open').disabled=check.checked;row.querySelector('.hour-close').disabled=check.checked;};row.querySelector('[data-save-hours]').onclick=()=>saveHours(row);});
}
async function saveHours(row){const btn=row.querySelector('[data-save-hours]'),closed=row.querySelector('.hour-closed').checked;btn.disabled=true;try{if(!demo)await settingsAction({action:'hours',weekday:Number(row.dataset.weekday),closed,opensAt:row.querySelector('.hour-open').value,closesAt:row.querySelector('.hour-close').value,note:''});btn.textContent='Sparat';settingsLoaded=false;setTimeout(()=>btn.textContent='Spara',1400);}catch(e){alert(e.message);}finally{btn.disabled=false;}}

const specialForm=document.getElementById('specialHoursForm');
const specialClosed=specialForm.elements.closed;
specialClosed.onchange=()=>{specialForm.elements.opensAt.disabled=specialClosed.checked;specialForm.elements.closesAt.disabled=specialClosed.checked;};
specialForm.addEventListener('submit',async e=>{e.preventDefault();const status=document.getElementById('specialStatus'),fd=new FormData(e.currentTarget);status.textContent='Sparar…';try{if(!demo)await settingsAction({action:'specialHours',date:fd.get('date'),opensAt:fd.get('opensAt'),closesAt:fd.get('closesAt'),closed:fd.get('closed')==='on',note:fd.get('note')});status.textContent='Sparat';settingsLoaded=false;await loadSettings(true);setTimeout(()=>status.textContent='',1500);}catch(x){status.textContent=x.message;}});
function renderSpecialHours(){const el=document.getElementById('specialHoursList'),items=settingsData.specialHours||[];el.innerHTML=items.length?items.map(x=>`<div class="config-row"><div><strong>${esc(x.service_date)}</strong><small>${x.closed?'Stängt':`${String(x.opens_at).slice(0,5)}–${String(x.closes_at).slice(0,5)}`} ${x.note?`· ${esc(x.note)}`:''}</small></div><button class="mini-btn danger" data-remove-special="${esc(x.id)}">Ta bort</button></div>`).join(''):'<p class="config-empty">Inga specialdagar.</p>';el.querySelectorAll('[data-remove-special]').forEach(b=>b.onclick=async()=>{if(!confirm('Ta bort specialdagen?'))return;try{if(!demo)await settingsAction({action:'removeSpecialHours',id:b.dataset.removeSpecial});settingsLoaded=false;await loadSettings(true);}catch(e){alert(e.message);}});}

function populateBlockTables(){const select=document.getElementById('blockTable');select.innerHTML='<option value="">Hela restaurangen</option>'+((settingsData.tables||[]).filter(t=>t.active!==false).map(t=>`<option value="${esc(t.id)}">${esc(t.code)} · ${esc(t.label)}</option>`).join(''));}
const blockForm=document.getElementById('blockForm');
blockForm.addEventListener('submit',async e=>{e.preventDefault();const status=document.getElementById('blockStatus'),fd=new FormData(e.currentTarget);status.textContent='Sparar…';try{if(!demo)await settingsAction({action:'block',date:fd.get('date'),startsAt:fd.get('startsAt'),endsAt:fd.get('endsAt'),tableId:fd.get('tableId')||null,reason:fd.get('reason')});status.textContent='Blockerat';settingsLoaded=false;await loadSettings(true);await load();setTimeout(()=>status.textContent='',1500);}catch(x){status.textContent=x.message;}});
function renderBlocks(){const el=document.getElementById('blockList'),items=settingsData.blocks||[];el.innerHTML=items.length?items.map(x=>`<div class="config-row"><div><strong>${x.table_code?`${esc(x.table_code)} · ${esc(x.table_label||'Bord')}`:'Hela restaurangen'}</strong><small>${formatDateTime(x.starts_at)} → ${formatDateTime(x.ends_at)}${x.reason?` · ${esc(x.reason)}`:''}</small></div><button class="mini-btn danger" data-unblock="${esc(x.id)}">Ta bort</button></div>`).join(''):'<p class="config-empty">Inga kommande blockeringar.</p>';el.querySelectorAll('[data-unblock]').forEach(b=>b.onclick=async()=>{if(!confirm('Ta bort blockeringen?'))return;try{if(!demo)await settingsAction({action:'unblock',id:b.dataset.unblock});settingsLoaded=false;await loadSettings(true);await load();}catch(e){alert(e.message);}});}
async function settingsAction(body){return api('/api/admin/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}

function enableFloorDrag(){const floor=document.getElementById('floorPlan');floor.querySelectorAll('.floor-table').forEach(el=>{let start=null;el.onpointerdown=e=>{if(e.button!==0)return;const t=currentData.tables.find(x=>String(x.id)===el.dataset.tableId);if(!t)return;start={x:e.clientX,y:e.clientY,left:Number(t.x||0),top:Number(t.y||0),table:t};el.setPointerCapture(e.pointerId);el.classList.add('dragging');};el.onpointermove=e=>{if(!start)return;const rect=floor.getBoundingClientRect(),dx=(e.clientX-start.x)/rect.width*100,dy=(e.clientY-start.y)/rect.height*100;const w=Number(start.table.width||18),h=Number(start.table.height||14);const left=Math.max(0,Math.min(100-w,start.left+dx)),top=Math.max(0,Math.min(100-h,start.top+dy));el.style.left=`${left}%`;el.style.top=`${top}%`;};el.onpointerup=async()=>{if(!start)return;el.classList.remove('dragging');const left=parseFloat(el.style.left),top=parseFloat(el.style.top),t=start.table;start=null;t.x=left;t.y=top;if(demo)return;try{await settingsAction({action:'table',id:t.id,label:t.label,minCapacity:t.min_capacity,maxCapacity:t.max_capacity,x:left,y:top,width:Number(t.width||18),height:Number(t.height||14),shape:t.shape,active:t.active!==false});settingsLoaded=false;}catch(x){alert('Kunde inte spara bordsposition: '+x.message);await load();}};});}

function clock(v){try{return new Intl.DateTimeFormat('sv-SE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Stockholm'}).format(new Date(v));}catch{return String(v).slice(11,16);}}
function formatDateTime(v){try{return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v));}catch{return String(v);}}
function label(s){return({pending:'Väntar',confirmed:'Bekräftad',arrived:'Anlänt',seated:'Sitter',completed:'Klar',cancelled:'Avbokad',no_show:'No-show'})[s]||s;}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
