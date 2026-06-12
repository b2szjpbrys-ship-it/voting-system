async function apiFetch(path, opts={}){
  const key = document.getElementById('adminKey').value || 'adminsecret';
  opts.headers = opts.headers || {};
  opts.headers['X-Admin-Key'] = key;
  if (!opts.method) opts.method = 'GET';
  const res = await fetch('/api' + path, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch(e){ return text; }
}

async function loadPositions(){
  const data = await apiFetch('/positions/');
  const sel = document.getElementById('candidatePosition');
  sel.innerHTML = '';
  const list = document.getElementById('positionsList');
  list.innerHTML = '';
  for(const p of data){
    const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name; sel.appendChild(opt);
    const li = document.createElement('li'); li.textContent = p.name + ` (id: ${p.id})`; list.appendChild(li);
  }
}

async function loadCandidates(){
  // use admin candidates endpoint
  const data = await apiFetch('/admin/candidates/');
  const list = document.getElementById('candidatesList'); list.innerHTML = '';
  for(const c of data){
    const li = document.createElement('li');
    li.innerHTML = `<strong>${c.name}</strong> — ${c.position_name} (id:${c.id}) <button data-id="${c.id}" class="delete">Delete</button> <button data-id="${c.id}" class="upload">Upload Image</button>`;
    list.appendChild(li);
  }
}

async function addPosition(e){
  e.preventDefault();
  const name = document.getElementById('positionName').value;
  if(!name) return alert('name required');
  const res = await apiFetch('/admin/positions/', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name})});
  await loadPositions();
}

async function addCandidate(e){
  e.preventDefault();
  const name = document.getElementById('candidateName').value;
  const position_id = document.getElementById('candidatePosition').value;
  const file = document.getElementById('candidateImage').files[0];
  if(!name||!position_id) return alert('name and position required');
  // create candidate (without image)
  const res = await apiFetch('/admin/candidates/', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, position_id})});
  await loadCandidates();
  if(file){
    // upload image for returned id
    const id = res.id || (await loadCandidates() && null);
    const form = new FormData(); form.append('candidate_id', id || ''); form.append('image', file);
    await apiFetch('/admin/upload-image/', {method:'POST', body: form});
    await loadCandidates();
  }
}

document.getElementById('posForm').addEventListener('submit', addPosition);
document.getElementById('candidateForm').addEventListener('submit', addCandidate);

document.getElementById('loadUsers').addEventListener('click', async ()=>{
  const data = await apiFetch('/admin/users/');
  const list = document.getElementById('usersList'); list.innerHTML='';
  for(const u of data){ const li = document.createElement('li'); li.textContent = `${u.name} (${u.phone}) - voted: ${u.has_voted}`; list.appendChild(li);} 
});

document.getElementById('getWinners').addEventListener('click', async ()=>{
  const data = await apiFetch('/admin/winners/');
  document.getElementById('winners').textContent = JSON.stringify(data, null, 2);
});

document.getElementById('resetElection').addEventListener('click', async ()=>{
  if(!confirm('Reset election? This deletes all votes.')) return;
  const data = await apiFetch('/admin/reset/', {method:'POST'});
  alert(JSON.stringify(data));
  await loadCandidates();
});

// delegate delete/upload actions
document.getElementById('candidatesList').addEventListener('click', async (ev)=>{
  if(ev.target.matches('.delete')){
    const id = ev.target.dataset.id;
    if(!confirm('Delete candidate?')) return;
    await apiFetch(`/admin/candidates/${id}/`, {method:'DELETE'});
    await loadCandidates();
  }
});

// initial load
loadPositions().then(loadCandidates);
