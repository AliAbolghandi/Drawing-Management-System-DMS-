// Node actions: safe delete button and status helpers for the lazy tree.
function attachDeleteButton(entry){
  if(!entry?.row||entry.row.querySelector(':scope > .node-delete-btn'))return;
  const btn=document.createElement('button');btn.type='button';btn.className='node-delete-btn';btn.textContent='×';btn.title='Delete Node';
  btn.addEventListener('click',async ev=>{ev.stopPropagation();const node=entry.node;if(!node)return;if(!confirm(`Are you sure you want to delete this Node?\n\n${node.NodeCode||''} — ${node.NodeName||''}\n\nChild Nodes or registered PDF records will prevent deletion.`))return;btn.disabled=true;try{const r=await fetch(`${API_URL}/${encodeURIComponent(node.NodeID)}`,{method:'DELETE'}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);if(typeof currentSelectedNode!=='undefined'&&Number(currentSelectedNode?.NodeID)===Number(node.NodeID)){currentSelectedNode=null;document.getElementById('nodeDetails')?.classList.add('hidden');document.getElementById('emptyDetails')?.classList.remove('hidden')}if(typeof loadRootNodes==='function')await loadRootNodes()}catch(e){console.error('Delete Node failed:',e);alert(e.message||'Unable to delete the Node.')}finally{btn.disabled=false}});entry.row.appendChild(btn)
}
function refreshDeleteButtons(){if(typeof nodeElements==='undefined')return;nodeElements.forEach(attachDeleteButton)}
const nodeActionContainer=document.getElementById('treeContainer');if(nodeActionContainer){const observer=new MutationObserver(()=>refreshDeleteButtons());observer.observe(nodeActionContainer,{childList:true,subtree:true})}
setTimeout(refreshDeleteButtons,0);
