const editNodeBtn = document.getElementById('createNewNodeBtn');
const editModal = document.getElementById('createNodeModal');
const editForm = document.getElementById('createNodeForm');
const editNodeId = document.getElementById('editNodeId');
const editCode = document.getElementById('createNodeCode');
const editName = document.getElementById('createNodeName');
const editJet = document.getElementById('editJet');
const editNorme = document.getElementById('editNorme');
const editMass = document.getElementById('editMass');
const editNv = document.getElementById('editNv');
const editIsActive = document.getElementById('editIsActive');
const editError = document.getElementById('createNodeError');
const editCancel = document.getElementById('createNodeCancel');
const editClose = document.getElementById('createNodeClose');
const editSubmit = document.getElementById('createNodeSubmit');
let editMode = false;

function closeEditNodeModal(){editModal.classList.add('hidden');editError.classList.add('hidden');editForm.reset();editForm.dataset.nodeId='';}
function openEditNodeModal(node){
  if(!node){alert('Select a Node first.');return;}
  editForm.dataset.nodeId=String(node.NodeID);editNodeId.textContent=String(node.NodeID);editCode.value=node.NodeCode||'';editName.value=node.NodeName||'';editJet.value=node.JET_Position??'';editNorme.value=node.Norme??'';editMass.value=node.Mass??'';editNv.value=node.nv??'';editIsActive.checked=node.IsActive===true||Number(node.IsActive)===1;editError.classList.add('hidden');editModal.classList.remove('hidden');setTimeout(()=>editCode.focus(),50);
}
function setEditMode(enabled){editMode=enabled;editNodeBtn.classList.toggle('active',enabled);editNodeBtn.textContent=enabled?'Cancel Edit':'Edit Node';document.body.classList.toggle('edit-node-mode',enabled);}
editNodeBtn.addEventListener('click',()=>{if(editMode){setEditMode(false);closeEditNodeModal();return;}if(!currentSelectedNode){alert('Select a Node from the tree first.');return;}setEditMode(true);openEditNodeModal(currentSelectedNode);});
editCancel.addEventListener('click',()=>{closeEditNodeModal();setEditMode(false);});editClose.addEventListener('click',()=>{closeEditNodeModal();setEditMode(false);});
editModal.addEventListener('click',e=>{if(e.target===editModal){closeEditNodeModal();setEditMode(false);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!editModal.classList.contains('hidden')){closeEditNodeModal();setEditMode(false);}});

editForm.addEventListener('submit',async e=>{
  e.preventDefault();const nodeId=Number(editForm.dataset.nodeId);if(!nodeId)return;
  const body={NodeCode:editCode.value.trim(),NodeName:editName.value.trim(),JET_Position:editJet.value.trim(),Norme:editNorme.value.trim(),Mass:editMass.value.trim(),nv:editNv.value.trim(),IsActive:editIsActive.checked};
  if(!body.NodeCode||!body.NodeName){editError.textContent='Node Code and Node Name are required.';editError.classList.remove('hidden');return;}
  editSubmit.disabled=true;editSubmit.textContent='Saving...';editError.classList.add('hidden');
  try{const r=await fetch(`${API_URL}/${encodeURIComponent(nodeId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);const updated=d.node||{};nodeCache.set(nodeId,updated);parentById.set(nodeId,normalizeParentId(updated.ParentID));const entry=nodeElements.get(nodeId);if(entry){entry.node=updated;currentSelectedNode=updated;entry.row.querySelector('.code').textContent=updated.NodeCode||'';entry.row.querySelector('.desc').textContent=updated.NodeName||'(Unnamed)';showNodeDetails(updated);}closeEditNodeModal();setEditMode(false);
  }catch(err){console.error('Edit Node failed:',err);editError.textContent=err.message||'Unable to save the Node.';editError.classList.remove('hidden');}
  finally{editSubmit.disabled=false;editSubmit.textContent='Save Changes';}
});
