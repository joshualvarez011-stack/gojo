const statusEl=document.getElementById('pageStatus');
let data={tables:[],combinations:[]};

async function api(url,options){const r=await fetch(url,options);const d=await r.json().catch(()=>({}));if(r.status===401){location.href='./';throw new Error('Sessionen har gått ut.');}if(!r.ok)throw new Error(d.message||'Något gick fel.');return d;}
async function action(body){return api('/api/admin/tables',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setStatus(v){statusEl.textContent=v||'';}

async function load(){
  try{data=await api('/api/admin/tables');render();setStatus('');}
  catch(e){setStatus(e.message);}
}

function render(){renderTables();renderComboChoices();renderCombinations();}
function renderTables(){
  const el=document.getElementById('tableList');
  el.innerHTML=data.tables.length?data.tables.map(t=>`<div class="entity-row"><div><strong>${esc(t.code)} · ${esc(t.label)}</strong><small>${t.min_capacity}–${t.max_capacity} gäster · ${esc(t.shape)}${t.is_development_default?' · development default':''}</small></div><button data-table-toggle="${esc(t.id)}" data-active="${t.active?'1':'0'}">${t.active?'Inaktivera':'Aktivera'}</button></div>`).join(''):'<p>Inga bord.</p>';
  el.querySelectorAll('[data-table-toggle]').forEach(b=>b.onclick=async()=>{const active=b.dataset.active!=='1';if(!active&&!confirm('Inaktivera bordet? Aktiva kombinationer som använder bordet stängs också av.'))return;try{setStatus('Sparar…');await action({action:'setTableActive',id:b.dataset.tableToggle,active});await load();}catch(e){setStatus(e.message);}});
}
function renderComboChoices(){
  const el=document.getElementById('comboTables');const active=data.tables.filter(t=>t.active);
  el.innerHTML=active.length?active.map(t=>`<label><input type="checkbox" name="comboTable" value="${esc(t.id)}"> ${esc(t.code)} · ${esc(t.label)} (${t.max_capacity}p)</label>`).join(''):'<span>Aktivera minst två bord först.</span>';
}
function renderCombinations(){
  const el=document.getElementById('comboList');
  el.innerHTML=data.combinations.length?data.combinations.map(c=>`<div class="entity-row"><div><strong>${esc(c.code)} · ${esc(c.label)}</strong><small>${esc(c.table_codes||'')} · ${c.min_capacity}–${c.max_capacity} gäster · prioritet ${c.priority}</small></div><button data-combo-toggle="${esc(c.id)}" data-active="${c.active?'1':'0'}">${c.active?'Inaktivera':'Aktivera'}</button></div>`).join(''):'<p>Inga kombinationer.</p>';
  el.querySelectorAll('[data-combo-toggle]').forEach(b=>b.onclick=async()=>{try{setStatus('Sparar…');await action({action:'setCombinationActive',id:b.dataset.comboToggle,active:b.dataset.active!=='1'});await load();}catch(e){setStatus(e.message);}});
}

document.getElementById('tableForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget,fd=new FormData(f);
  try{setStatus('Skapar bord…');await action({action:'createTable',code:fd.get('code'),label:fd.get('label'),minCapacity:Number(fd.get('minCapacity')),maxCapacity:Number(fd.get('maxCapacity')),shape:fd.get('shape'),x:5,y:5,width:18,height:14});f.reset();f.minCapacity.value=1;f.maxCapacity.value=2;await load();}
  catch(x){setStatus(x.message);}
});

document.getElementById('comboForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget,fd=new FormData(f),tableIds=[...document.querySelectorAll('input[name="comboTable"]:checked')].map(x=>x.value);
  if(tableIds.length<2){setStatus('Välj minst två bord.');return;}
  try{setStatus('Skapar kombination…');await action({action:'createCombination',code:fd.get('code'),label:fd.get('label'),priority:Number(fd.get('priority')||100),tableIds});f.reset();f.priority.value=100;await load();}
  catch(x){setStatus(x.message);}
});

load();
