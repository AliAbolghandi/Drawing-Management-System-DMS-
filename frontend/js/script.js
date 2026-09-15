const API_HOST = window.location.hostname || 'localhost';
const API_BASE = `http://${API_HOST}:3000`;
const API_URL = `${API_BASE}/api/nodes`;
const API_PDF_URL = `${API_BASE}/api/pdfs`;
const API_PDF_OPEN_URL = `${API_BASE}/api/pdf-open`;
const API_SRSC_FOLDERS_URL = `${API_BASE}/api/node-folders`;
const API_SRSC_FILES_URL = `${API_BASE}/api/node-folder-files`;
const API_SRSC_FILE_URL = `${API_BASE}/api/node-file`;
const API_SRSC_STATUS_URL = `${API_BASE}/api/srsc-status`;
const SRSC_FOLDER_ORDER = ['SLD','DOC','PIC','Catalog'];

let nodeElements = new Map();
let nodeCache = new Map();
let parentById = new Map();
let pdfsByNodeId = new Map();
let srscNodeIds = new Set();
let currentSearchQuery = '';
let currentSelectedNode = null;
let loadedNodeCount = 0;

const treeContainer = document.getElementById('treeContainer');
const connectionStatus = document.getElementById('connectionStatus');
const nodeCount = document.getElementById('nodeCount');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchInfo = document.getElementById('searchInfo');
const expandAllBtn = document.getElementById('expandAllBtn');
const collapseAllBtn = document.getElementById('collapseAllBtn');

function normalizeNodeId(v){const n=Number(v);return Number.isNaN(n)?null:n;}
function normalizeParentId(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isNaN(n)?null:n;}
function escapeHtml(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function escapeRegExp(v){return String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function highlightText(v,q){const text=escapeHtml(v||'');if(!q)return text||'-';return text.replace(new RegExp(`(${escapeRegExp(q)})`,'gi'),'<mark>$1</mark>');}
function formatFileSize(bytes){const n=Number(bytes);if(!Number.isFinite(n)||n<0)return '';if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`;return `${(n/1073741824).toFixed(1)} GB`;}
function getFileIcon(item){if(item.type==='folder')return '📁';if(item.kind==='pdf')return '📄';if(item.kind==='image')return '🖼️';if(item.kind==='cad')return '📐';if(item.kind==='document')return '📝';return '📎';}
function getFileActionLabel(item){return item.type==='folder'?'Open':(item.kind==='pdf'||item.kind==='image'?'Open':'Download');}

function applyNodeStatus(entry,nodeId){
  const pdf=pdfsByNodeId.has(nodeId), srsc=srscNodeIds.has(nodeId);
  entry.row.classList.toggle('has-pdf',pdf);
  entry.row.classList.toggle('has-srsc',srsc);
  entry.row.classList.toggle('has-both',pdf&&srsc);
}

async function fetchChildren(parentId){
  const key=parentId===null?'root':String(parentId);
  const existing=[...nodeCache.values()].filter(n=>(normalizeParentId(n.ParentID)===parentId));
  if(existing.length || nodeCache.has(`__loaded_${key}`)) return existing.sort((a,b)=>Number(a.NodeID)-Number(b.NodeID));
  const url=parentId===null?`${API_URL}?parentId=`:`${API_URL}?parentId=${encodeURIComponent(parentId)}`;
  const response=await fetch(url);
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const data=await response.json();
  data.forEach(n=>{const id=normalizeNodeId(n.NodeID);nodeCache.set(id,n);parentById.set(id,normalizeParentId(n.ParentID));});
  nodeCache.set(`__loaded_${key}`,true);
  loadedNodeCount=[...nodeCache.keys()].filter(k=>typeof k==='number').length;
  nodeCount.textContent=`${loadedNodeCount.toLocaleString('en-US')} loaded nodes`;
  return data.sort((a,b)=>Number(a.NodeID)-Number(b.NodeID));
}

async function prefetchBranchData(nodes){
  const ids=nodes.map(n=>normalizeNodeId(n.NodeID)).filter(Number.isInteger);
  if(!ids.length)return;
  try{
    const r=await fetch(`${API_PDF_URL}?nodeIds=${ids.join(',')}`);
    if(r.ok){const data=await r.json();data.forEach(pdf=>{const id=normalizeNodeId(pdf.NodeID);if(!pdfsByNodeId.has(id))pdfsByNodeId.set(id,[]);pdfsByNodeId.get(id).push(pdf);});}
  }catch(e){console.error('Branch PDF prefetch failed:',e);}
  try{
    const r=await fetch(API_SRSC_STATUS_URL);
    if(r.ok){const data=await r.json();if(Array.isArray(data.nodeIds))srscNodeIds=new Set(data.nodeIds.map(normalizeNodeId));}
  }catch(e){console.error('Branch SRSC status refresh failed:',e);}
  ids.forEach(id=>{const entry=nodeElements.get(id);if(entry)applyNodeStatus(entry,id);});
}

async function loadRootNodes(){
  try{
    treeContainer.innerHTML='<div class="loading">Loading equipment structure...</div>';
    const roots=await fetchChildren(null);
    connectionStatus.textContent='Connected';connectionStatus.className='status connected';
    treeContainer.innerHTML='';nodeElements.clear();
    if(!roots.length){treeContainer.innerHTML='<div class="error">No root nodes were found.</div>';return;}
    roots.forEach(root=>treeContainer.appendChild(createNodeElement(root,true)));
    await prefetchBranchData(roots);
    // Keep the previous convenient behavior: roots are open, but their children are loaded only now.
    for(const root of roots){const entry=nodeElements.get(normalizeNodeId(root.NodeID));if(entry)await entry.setExpanded(true);}
  }catch(e){console.error('Tree loading error:',e);connectionStatus.textContent='Connection Error';connectionStatus.className='status disconnected';treeContainer.innerHTML=`<div class="error"><strong>Unable to load equipment structure</strong><br><br>${escapeHtml(e.message)}</div>`;}
}

function createNodeElement(node,isRoot=false){
  const id=normalizeNodeId(node.NodeID);
  const wrapper=document.createElement('div');wrapper.className=`tree-node${isRoot?' root':''}`;
  const row=document.createElement('div');row.className='node-row';
  const expandButton=document.createElement('button');expandButton.type='button';expandButton.className='expand-btn';expandButton.textContent='+';
  const icon=document.createElement('div');icon.className='node-icon';icon.textContent='▪';
  const content=document.createElement('div');content.className='node-content';
  const label=document.createElement('div');label.className='node-label';
  label.innerHTML=`<span class="code">${highlightText(node.NodeCode||'',currentSearchQuery)}</span><span class="node-separator">—</span><span class="desc">${highlightText(node.NodeName||'(Unnamed)',currentSearchQuery)}</span>`;
  content.appendChild(label);row.append(expandButton,icon,content);wrapper.appendChild(row);
  let childrenContainer=null,isExpanded=false,childrenLoaded=false,hasChildrenKnown=null;

  async function ensureChildren(){
    if(childrenLoaded)return;
    const children=await fetchChildren(id);childrenLoaded=true;hasChildrenKnown=children.length>0;
    if(!hasChildrenKnown){expandButton.classList.add('empty');expandButton.textContent='';icon.textContent='▪';return;}
    icon.textContent='▰';childrenContainer=document.createElement('div');childrenContainer.className='tree-children';
    children.forEach(child=>childrenContainer.appendChild(createNodeElement(child,false)));wrapper.appendChild(childrenContainer);
    await prefetchBranchData(children);
  }
  async function setExpanded(expand){
    if(expand){await ensureChildren();if(!hasChildrenKnown)return;childrenContainer.classList.remove('collapsed');expandButton.textContent='−';isExpanded=true;}
    else{if(childrenContainer)childrenContainer.classList.add('collapsed');expandButton.textContent='+';isExpanded=false;}
  }
  expandButton.addEventListener('click',async ev=>{ev.stopPropagation();try{await setExpanded(!isExpanded);}catch(e){console.error('Expand failed:',e);}});
  row.addEventListener('click',()=>selectNode(node,row));
  nodeElements.set(id,{node,wrapper,row,setExpanded,hasChildren:true,childrenLoaded:false});
  applyNodeStatus(nodeElements.get(id),id);
  // A cheap child existence check is done only when needed; no full tree query at startup.
  return wrapper;
}

function selectNode(node,row){document.querySelectorAll('.node-row.selected').forEach(el=>el.classList.remove('selected'));row.classList.add('selected');currentSelectedNode=node;showNodeDetails(node);}

function showNodeDetails(node){
  document.getElementById('emptyDetails').classList.add('hidden');document.getElementById('nodeDetails').classList.remove('hidden');
  document.getElementById('detailName').textContent=node.NodeName||'-';document.getElementById('detailCode').textContent=node.NodeCode||'-';document.getElementById('detailNodeName').textContent=node.NodeName||'-';
  document.getElementById('detailJet').textContent=node.JET_Position??'-';document.getElementById('detailNorme').textContent=node.Norme??'-';document.getElementById('detailMass').textContent=node.Mass??'-';
  const status=document.getElementById('detailStatus');const active=node.IsActive===true||Number(node.IsActive)===1;status.textContent=active?'Active':'Inactive';status.className=active?'node-status':'node-status inactive';
  renderPdfList(normalizeNodeId(node.NodeID));loadSrscFolders(normalizeNodeId(node.NodeID));
}
function renderPdfList(nodeId){const box=document.getElementById('pdfList');if(!box)return;const pdfs=pdfsByNodeId.get(nodeId)||[];if(!pdfs.length){box.innerHTML='<div class="pdf-empty">No PDF files registered.</div>';return;}box.innerHTML=pdfs.map(pdf=>`<div class="pdf-item" data-pdf-id="${escapeHtml(pdf.PDFID)}" title="Open with the system default application"><span class="pdf-icon">📄</span><span class="pdf-name">${escapeHtml(pdf.PDFName||'(Unnamed)')}</span></div>`).join('');box.querySelectorAll('.pdf-item').forEach(item=>item.addEventListener('click',()=>openPdfInDefaultApp(item.dataset.pdfId)));}
async function openPdfInDefaultApp(pdfId){try{const r=await fetch(`${API_PDF_OPEN_URL}/${encodeURIComponent(pdfId)}`);const d=await r.json();if(!r.ok||!d.success)alert(`Unable to open PDF: ${d.error||'Unknown error'}`);}catch(e){console.error(e);alert('Unable to connect to the server to open the PDF.');}}

async function loadSrscFolders(nodeId){const container=document.getElementById('srscContent');if(!container)return;container.innerHTML='<div class="srsc-loading">Loading company files...</div>';try{const r=await fetch(`${API_SRSC_FOLDERS_URL}/${encodeURIComponent(nodeId)}`);const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);if(!d.hasFolderPath){container.innerHTML='<div class="srsc-empty"><div class="srsc-empty-icon">▱</div><strong>No SRSC folder configured</strong><span>This Node does not have a FolderPath.</span></div>';return;}if(d.folderExists===false){container.innerHTML='<div class="srsc-empty srsc-warning"><div class="srsc-empty-icon">⚠</div><strong>SRSC folder not found</strong><span>The configured Node folder could not be found on the server.</span></div>';return;}const folders=SRSC_FOLDER_ORDER.map(name=>(d.folders||[]).find(f=>f.name.toLowerCase()===name.toLowerCase())).filter(Boolean);if(!folders.length){container.innerHTML='<div class="srsc-empty"><div class="srsc-empty-icon">▱</div><strong>No company folders found</strong><span>SLD, DOC, PIC and Catalog are the only folders exposed here.</span></div>';return;}renderSrscFolderCards(nodeId,folders);}catch(e){container.innerHTML=`<div class="error"><strong>Unable to load SRSC files</strong><br><br>${escapeHtml(e.message)}</div>`;}}
function renderSrscFolderCards(nodeId,folders){const c=document.getElementById('srscContent');c.innerHTML=`<div class="srsc-folder-grid">${folders.map(f=>`<button type="button" class="srsc-folder-card" data-folder="${escapeHtml(f.name)}"><span class="srsc-folder-icon">📁</span><span class="srsc-folder-name">${escapeHtml(f.name)}</span><span class="srsc-folder-arrow">›</span></button>`).join('')}</div>`;c.querySelectorAll('.srsc-folder-card').forEach(b=>b.addEventListener('click',()=>openSrscFolder(nodeId,b.dataset.folder)));}
async function openSrscFolder(nodeId,folderName,subPath=''){const c=document.getElementById('srscContent');c.innerHTML='<div class="srsc-loading">Loading folder...</div>';try{let url=`${API_SRSC_FILES_URL}/${encodeURIComponent(nodeId)}/${encodeURIComponent(folderName)}`;if(subPath)url+=`?subPath=${encodeURIComponent(subPath)}`;const r=await fetch(url),d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);renderSrscFolderContents(nodeId,folderName,subPath,d.items||[]);}catch(e){c.innerHTML=`<div class="error"><strong>Unable to load folder</strong><br><br>${escapeHtml(e.message)}</div><button type="button" class="srsc-back-button" id="srscErrorBack">← Back to SRSC folders</button>`;document.getElementById('srscErrorBack')?.addEventListener('click',()=>loadSrscFolders(nodeId));}}
function goBackSrsc(nodeId,folderName,subPath){if(!subPath){loadSrscFolders(nodeId);return;}const p=subPath.split('/');p.pop();openSrscFolder(nodeId,folderName,p.join('/'));}
function renderSrscFolderContents(nodeId,folderName,subPath,items){const c=document.getElementById('srscContent');const breadcrumb=[folderName,...(subPath?subPath.split('/'):[])].join(' / ');const header=`<div class="srsc-browser-header"><button type="button" class="srsc-back-button" id="srscBackButton">← Back</button><div class="srsc-current-folder"><span>📁</span><strong>${escapeHtml(breadcrumb)}</strong><small>${items.length} item${items.length===1?'':'s'}</small></div></div>`;if(!items.length){c.innerHTML=`${header}<div class="srsc-empty"><div class="srsc-empty-icon">∅</div><strong>This folder is empty</strong><span>No files are currently available in this folder.</span></div>`;document.getElementById('srscBackButton')?.addEventListener('click',()=>goBackSrsc(nodeId,folderName,subPath));return;}c.innerHTML=`${header}<div class="srsc-file-list">${items.map(item=>item.type==='folder'?`<div class="srsc-file-row srsc-subfolder" data-subfolder="${escapeHtml(item.name)}"><span class="srsc-file-icon">📁</span><span class="srsc-file-main"><strong>${escapeHtml(item.name)}</strong><small>Folder</small></span><span class="srsc-file-action">Open ›</span></div>`:`<div class="srsc-file-row srsc-file" data-file="${escapeHtml(item.name)}" data-kind="${escapeHtml(item.kind||'file')}" title="${getFileActionLabel(item)}"><span class="srsc-file-icon">${getFileIcon(item)}</span><span class="srsc-file-main"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.extension||'').replace('.','').toUpperCase()||'FILE'}${item.size!==undefined?` · ${formatFileSize(item.size)}`:''}</small></span><span class="srsc-file-action">${getFileActionLabel(item)}</span></div>`).join('')}</div>`;document.getElementById('srscBackButton')?.addEventListener('click',()=>goBackSrsc(nodeId,folderName,subPath));c.querySelectorAll('.srsc-file').forEach(row=>row.addEventListener('click',()=>openSrscFile(nodeId,folderName,subPath,row.dataset.file,row.dataset.kind)));c.querySelectorAll('.srsc-subfolder').forEach(row=>row.addEventListener('click',()=>openSrscFolder(nodeId,folderName,subPath?`${subPath}/${row.dataset.subfolder}`:row.dataset.subfolder)));}
function openSrscFile(nodeId,folderName,subPath,fileName,kind){const relativeFile=subPath?`${subPath}/${fileName}`:fileName;const url=`${API_SRSC_FILE_URL}?nodeId=${encodeURIComponent(nodeId)}&folder=${encodeURIComponent(folderName)}&file=${encodeURIComponent(relativeFile)}`;if(kind==='pdf'||kind==='image'){window.open(url,'_blank','noopener');return;}const a=document.createElement('a');a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();}

async function expandAll(){const queue=[...nodeElements.values()];for(const entry of queue){try{await entry.setExpanded(true);if(entry.wrapper.querySelector('.tree-children'))entry.wrapper.querySelectorAll(':scope > .tree-children > .tree-node').forEach(el=>{const id=[...nodeElements.entries()].find(([,x])=>x.wrapper===el)?.[0];if(id!==undefined)queue.push(nodeElements.get(id));});}catch(e){console.error(e);}}}
function collapseAll(){nodeElements.forEach(e=>e.setExpanded(false));}

async function searchTree(){const query=searchInput.value.trim();currentSearchQuery=query;if(!query){searchInfo.classList.add('hidden');treeContainer.innerHTML='';nodeElements.clear();nodeCache=new Map();parentById=new Map();loadedNodeCount=0;await loadRootNodes();return;}try{searchInfo.textContent='Searching...';searchInfo.classList.remove('hidden');const r=await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`),d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);treeContainer.innerHTML='';nodeElements.clear();nodeCache=new Map();parentById=new Map();for(const n of d.matches||[]){nodeCache.set(normalizeNodeId(n.NodeID),n);parentById.set(normalizeNodeId(n.NodeID),normalizeParentId(n.ParentID));}const needed=new Set([...(d.ancestorIds||[]),...(d.matchIds||[])]);let roots=[];for(const id of needed){let cur=Number(id);while(cur){const r2=await fetch(`${API_URL}/${cur}`).catch(()=>null);break;}}// Load roots, then only the paths containing matches.
  const rootData=await fetchChildren(null);roots=rootData.filter(n=>{let id=normalizeNodeId(n.NodeID);return needed.has(id)||[...needed].some(x=>parentById.get(Number(x))===id);});
  for(const root of roots){const w=createNodeElement(root,true);treeContainer.appendChild(w);const entry=nodeElements.get(normalizeNodeId(root.NodeID));if(entry)await entry.setExpanded(true);}
  nodeElements.forEach(e=>{const match=(d.matchIds||[]).includes(e.node.NodeID);e.row.classList.toggle('search-match',match);e.row.querySelector('.node-label').innerHTML=`<span class="code">${highlightText(e.node.NodeCode||'',query)}</span><span class="node-separator">—</span><span class="desc">${highlightText(e.node.NodeName||'(Unnamed)',query)}</span>`;});
  searchInfo.textContent=`${(d.matches||[]).length.toLocaleString('en-US')} matching node${(d.matches||[]).length===1?'':'s'} found.`;
}catch(e){console.error(e);searchInfo.textContent=`Search failed: ${e.message}`;searchInfo.classList.remove('hidden');}}

searchBtn.addEventListener('click',searchTree);searchInput.addEventListener('keydown',e=>{if(e.key==='Enter')searchTree();});expandAllBtn.addEventListener('click',expandAll);collapseAllBtn.addEventListener('click',collapseAll);
loadRootNodes();
