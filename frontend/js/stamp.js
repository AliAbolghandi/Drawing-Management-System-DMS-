(() => {
  'use strict';
  const API = `${window.DMS_API_BASE || ''}/api`;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const PDF_LIB='lib/pdf-lib/pdf-lib.min.js',PDF_JS='lib/pdfjs/pdf.min.mjs',PDF_WORKER='lib/pdfjs/pdf.worker.min.mjs';
  let currentUserId=null, canStamp=false, pdfjsPromise=null;

  async function json(url, options={}){const r=await fetch(url,{credentials:'include',cache:'no-store',...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;}
  function style(){if($('dmsStampStyle'))return;const s=document.createElement('style');s.id='dmsStampStyle';s.textContent=`
    .dms-stamp-btn{margin-left:8px;min-height:40px;padding:8px 14px;border:1px solid var(--line-strong);border-radius:var(--radius);background:var(--panel-2);color:var(--text);font:600 13px var(--sans);transition:150ms ease}.dms-stamp-btn:hover:not(:disabled){border-color:var(--cyan);color:var(--cyan);transform:translateY(-1px)}.dms-stamp-btn:disabled{opacity:.45;cursor:not-allowed}
    .dms-stamp-modal{position:fixed;inset:0;z-index:5000;background:rgba(2,8,23,.78);display:flex;align-items:center;justify-content:center;padding:20px}.dms-stamp-modal[hidden]{display:none!important}.dms-stamp-dialog{width:min(1200px,96vw);max-height:94vh;overflow:auto;background:var(--panel);border:1px solid var(--line-strong);border-radius:var(--radius);color:var(--text);box-shadow:0 18px 60px rgba(0,0,0,.45)}.dms-stamp-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line)}.dms-stamp-head h2{margin:0;font-size:18px}.dms-stamp-close{width:38px;height:38px;border:1px solid var(--line-strong);border-radius:var(--radius);background:var(--panel-2);color:var(--text-dim);font-size:24px;cursor:pointer}.dms-stamp-close:hover{border-color:var(--cyan);color:var(--cyan)}.dms-stamp-body{padding:16px}.dms-stamp-section{border:1px solid var(--line);border-radius:var(--radius);padding:12px;margin-bottom:12px;background:var(--panel-2)}.dms-stamp-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px}.dms-stamp-file{display:flex;gap:9px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg-alt)}.dms-stamp-file input{accent-color:var(--cyan)}.dms-stamp-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}.dms-stamp-primary,.dms-stamp-danger{min-height:40px;border:1px solid var(--line-strong);border-radius:var(--radius);padding:8px 14px;cursor:pointer;font:600 13px var(--sans)}.dms-stamp-primary{background:var(--cyan-dim);color:var(--text);border-color:var(--cyan)}.dms-stamp-danger{background:rgba(239,107,107,.12);color:var(--danger);border-color:rgba(239,107,107,.4)}.dms-stamp-card{width:100%;text-align:left;border:1px solid var(--line);background:var(--panel-2);color:var(--text);border-radius:var(--radius);padding:11px;margin-bottom:8px;cursor:pointer}.dms-stamp-card:hover{border-color:var(--cyan)}.dms-stamp-card.is-completed{border-left:3px solid var(--ok)}.dms-stamp-card.is-rejected{border-left:3px solid var(--danger)}.dms-stamp-card-top{display:flex;justify-content:space-between;gap:8px}.dms-stamp-card small,.dms-stamp-file small{display:block;color:var(--text-dim);margin-top:4px}.dms-stamp-work{display:grid;grid-template-columns:240px minmax(0,1fr);gap:12px}.dms-stamp-items{display:flex;flex-direction:column;gap:7px}.dms-stamp-item{border:1px solid var(--line);background:var(--bg-alt);color:var(--text);border-radius:var(--radius);padding:9px;cursor:pointer;text-align:left}.dms-stamp-item.active{border-color:var(--cyan)}.dms-stamp-viewer{min-height:520px;border:1px solid var(--line);background:#fff;border-radius:var(--radius);padding:10px;overflow:auto}.dms-stamp-page{position:relative;width:max-content;margin:0 auto 14px;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.3)}.dms-stamp-page canvas{display:block}.dms-stamp-overlay{position:absolute;left:0;top:0;right:0;bottom:0}.dms-stamp-mark{position:absolute;touch-action:none;border:1px dashed #1677a8;cursor:move;min-width:30px;min-height:20px}.dms-stamp-mark img{width:100%;height:100%;object-fit:fill;display:block;pointer-events:none}.dms-stamp-resize{position:absolute;right:-5px;bottom:-5px;width:10px;height:10px;background:var(--cyan);cursor:nwse-resize}.dms-stamp-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}.dms-stamp-toolbar label{font-size:12px;color:var(--text-dim)}.dms-stamp-error{color:var(--danger);margin-top:8px}.dms-stamp-success{color:var(--ok);margin-top:8px}.dms-stamp-status{font-size:11px;padding:3px 7px;border-radius:999px;background:var(--bg-alt);color:var(--text-dim)}
    @media(max-width:800px){.dms-stamp-work{grid-template-columns:1fr}.dms-stamp-viewer{min-height:400px}}
  `;document.head.appendChild(s);}
  function ensureModal(){style();let m=$('dmsStampModal');if(m)return m;m=document.createElement('div');m.id='dmsStampModal';m.className='dms-stamp-modal';m.hidden=true;m.innerHTML='<div class="dms-stamp-dialog" role="dialog" aria-modal="true" aria-labelledby="dmsStampTitle"><div class="dms-stamp-head"><h2 id="dmsStampTitle">Stamp Drawing</h2><button type="button" class="dms-stamp-close" id="dmsStampClose" aria-label="Close">×</button></div><div class="dms-stamp-body" id="dmsStampBody"></div></div>';document.body.appendChild(m);$('dmsStampClose').addEventListener('click',closeModal);m.addEventListener('click',e=>{if(e.target===m)closeModal();});return m;}
  function closeModal(){const m=$('dmsStampModal');if(m){m.hidden=true;document.body.classList.remove('dms-stamp-open');}}
  function openModal(html){const m=ensureModal();$('dmsStampBody').innerHTML=html;m.hidden=false;document.body.classList.add('dms-stamp-open');}
  async function pdfLib(){if(window.PDFLib)return window.PDFLib;await new Promise((ok,no)=>{const s=document.createElement('script');s.src=PDF_LIB;s.onload=ok;s.onerror=()=>no(new Error('PDF stamping engine could not be loaded.'));document.head.appendChild(s);});return window.PDFLib;}
  async function pdfjs(){if(pdfjsPromise)return pdfjsPromise;pdfjsPromise=import(PDF_JS).then(x=>{x.GlobalWorkerOptions.workerSrc=PDF_WORKER;return x;}).catch(e=>{pdfjsPromise=null;throw new Error(`PDF Viewer could not be loaded: ${e.message}`)});return pdfjsPromise;}
  function selectedNode(){const row=document.querySelector('.node-row.selected');const id=Number(row?.closest('.tree-node')?.dataset.nodeId||0);return Number.isInteger(id)&&id>0?id:null;}

  async function createStampRequest(nodeId){
    try{
      const data=await json(`${API}/stamp/node/${encodeURIComponent(nodeId)}/pdfs`);
      const pdfCount=Number(data.pdfCount);
      if(!Number.isInteger(pdfCount)||pdfCount<=0){
        openModal('<div class="dms-stamp-section"><strong>No PDF drawing is attached to this Node.</strong></div>');
        return;
      }
      openModal(`<div class="dms-stamp-section"><strong>New Stamp Drawing Request</strong><p>This creates a separate request and does not require Manager approval.</p></div><div class="dms-stamp-section"><strong>${pdfCount} PDF file(s) found</strong><p>All PDF drawings attached to this Node will be included automatically. Individual file selection is not required.</p></div><div id="dmsStampCreateError"></div><div class="dms-stamp-actions"><button type="button" class="dms-stamp-danger" id="dmsStampCreateCancel">Cancel</button><button type="button" class="dms-stamp-primary" id="dmsStampCreateSubmit">Submit Stamp Request</button></div>`);
      $('dmsStampCreateCancel').onclick=closeModal;
      $('dmsStampCreateSubmit').onclick=async()=>{
        const submit=$('dmsStampCreateSubmit');
        const error=$('dmsStampCreateError');
        if(submit)submit.disabled=true;
        if(error)error.textContent='';
        try{
          const result=await json(`${API}/stamp/requests`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodeId:Number(nodeId)})});
          closeModal();
          window.dispatchEvent(new CustomEvent('dms-stamp-refresh'));
          if(result.itemCount!==undefined)console.info(`Stamp request ${result.requestNumber} created with ${result.itemCount} PDF(s).`);
        }catch(e){
          if(error){error.className='dms-stamp-error';error.textContent=e.message;}
          if(submit)submit.disabled=false;
        }
      };
    }catch(e){openModal(`<div class="dms-stamp-error">${esc(e.message)}</div>`)}
  }

  function installButton(){
    const host=document.querySelector('.srsc-heading-actions');if(!host)return;
    let btn=$('stampDrawingBtn');if(!btn){btn=document.createElement('button');btn.id='stampDrawingBtn';btn.type='button';btn.className='dms-stamp-btn';btn.textContent='Stamp Drawing';host.appendChild(btn);}
    const nodeId=selectedNode();
    btn.disabled=!nodeId;
    btn.onclick=()=>{const id=selectedNode();if(id)createStampRequest(id);};
  }

  async function loadIdentity(){try{const d=await json(`${API}/auth/me`);currentUserId=Number(d.user?.userId||d.user?.UserID||0);canStamp=Array.isArray(d.user?.permissions)?d.user.permissions.includes(STAMP_PERMISSION):false;}catch(_){}}

  async function renderWorklist(){
    try{
      const d=await json(`${API}/stamp/requests`);currentUserId=Number(d.currentUserId)||currentUserId;canStamp=Boolean(d.canStamp);
      const category=document.querySelector('.rw-category-button.active')?.dataset.requestCategory||'current';
      const visible=(d.requests||[]).filter(x=>category==='final'?x.StampStatus==='COMPLETED':category==='rejected'?x.StampStatus==='REJECTED':['PENDING','APPROVED'].includes(x.StampStatus));
      const old=$('dmsStampWorklist');if(old)old.remove();if(!visible.length)return;
      const wrap=document.createElement('section');wrap.id='dmsStampWorklist';wrap.className='dms-stamp-section';wrap.innerHTML=`<div class="section-heading-row"><div><strong>Stamp Drawing</strong></div><span class="dms-stamp-status">${visible.length}</span></div><div id="dmsStampCards" style="margin-top:10px"></div>`;
      wrap.querySelector('#dmsStampCards').innerHTML=visible.map(x=>`<button type="button" class="dms-stamp-card ${x.StampStatus==='COMPLETED'?'is-completed':''} ${x.StampStatus==='REJECTED'?'is-rejected':''}" data-stamp-id="${Number(x.StampRequestID)}"><div class="dms-stamp-card-top"><strong>${esc(x.RequestNumber)}</strong><span class="dms-stamp-status">${esc(x.StampStatus)}</span></div><small>${esc(x.NodeCode)} — ${esc(x.NodeName)} · ${esc([x.RequesterName,x.RequesterFamily].filter(Boolean).join(' ')||x.RequesterUsername||'-')}</small></button>`).join('');
      document.querySelector('#rwContent')?.prepend(wrap);wrap.querySelectorAll('[data-stamp-id]').forEach(b=>b.onclick=()=>openStampRequest(Number(b.dataset.stampId)));
    }catch(e){console.error('Stamp worklist failed:',e);}
  }

  async function openStampRequest(id){
    try{
      const d=await json(`${API}/stamp/requests/${id}`);const requester=Number(d.request.RequestedByUserID)===Number(currentUserId);const pending=d.request.StampStatus==='PENDING';
      const actions=canStamp&&pending?'<div class="dms-stamp-actions"><button type="button" class="dms-stamp-danger" id="dmsStampReject">Reject</button><button type="button" class="dms-stamp-primary" id="dmsStampStart">Stamp</button></div>':'';
      const downloadNote=d.request.StampStatus==='COMPLETED'&&requester?'<div class="dms-stamp-success">Stamped drawings are ready. Select a completed PDF to download it.</div>':'';
      openModal(`<div class="dms-stamp-section"><strong>${esc(d.request.RequestNumber)} — ${esc(d.request.NodeCode)}</strong><p>${esc(d.request.NodeName)}</p><p>Status: <strong>${esc(d.request.StampStatus)}</strong></p></div><div class="dms-stamp-section"><strong>Selected PDFs</strong><div id="dmsStampItems" class="dms-stamp-items">${d.items.map(x=>`<button type="button" class="dms-stamp-item" data-item-id="${Number(x.StampItemID)}">${esc(x.PDFName)}<small>${esc(x.SourceType)} · ${esc(x.StatusCode)}</small></button>`).join('')}</div>${downloadNote}</div>${actions}<div id="dmsStampWorkArea"></div>`);
      document.querySelectorAll('[data-item-id]').forEach(b=>b.onclick=()=>openStampItem(id,Number(b.dataset.itemId),requester));
      if(canStamp&&pending){$('dmsStampReject').onclick=()=>decide(id,'reject');$('dmsStampStart').onclick=()=>startStamp(id);}
    }catch(e){openModal(`<div class="dms-stamp-error">${esc(e.message)}</div>`)}
  }
  async function decide(id,decision){try{const comment=window.prompt(decision==='reject'?'Reason for rejection (optional):':'Comment (optional):')||'';await json(`${API}/stamp/requests/${id}/decision`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,comment})});closeModal();window.dispatchEvent(new CustomEvent('dms-stamp-refresh'));}catch(e){const body=$('dmsStampBody');if(body)body.insertAdjacentHTML('beforeend',`<div class="dms-stamp-error">${esc(e.message)}</div>`);}}
  async function startStamp(id){try{const d=await json(`${API}/stamp/requests/${id}`);if(d.request.StampStatus!=='APPROVED')throw new Error('Stamp request is not approved.');await openStampWorkspace(id,d);}catch(e){const body=$('dmsStampBody');if(body)body.insertAdjacentHTML('beforeend',`<div class="dms-stamp-error">${esc(e.message)}</div>`);}}
  async function openStampItem(id,itemId,requester){const d=await json(`${API}/stamp/requests/${id}`);const item=d.items.find(x=>Number(x.StampItemID)===itemId);if(!item)return;if(item.StatusCode==='COMPLETED'&&requester){window.location.href=`${API}/stamp/requests/${id}/download/${itemId}`;return;}if(canStamp&&d.request.StampStatus==='APPROVED')await openStampWorkspace(id,d,itemId);}

  async function openStampWorkspace(id,data,initialItemId){
    const lib=await pdfLib(),viewer=await pdfjs();const state={items:data.items,pages:new Map(),stamp:null,current:null};
    openModal(`<div class="dms-stamp-work"><aside><div class="dms-stamp-section"><strong>PDFs</strong><div id="dmsStampItems" class="dms-stamp-items">${data.items.map(x=>`<button type="button" class="dms-stamp-item" data-item-id="${Number(x.StampItemID)}">${esc(x.PDFName)}<br><small>${esc(x.SourceType)}</small></button>`).join('')}</div></div></aside><section><div class="dms-stamp-toolbar"><label>Stamp PNG <input type="file" id="dmsStampPng" accept="image/png"></label><button type="button" class="dms-stamp-primary" id="dmsApplyStamp">Apply Stamp</button><button type="button" class="dms-stamp-danger" id="dmsStampWorkspaceClose">Close</button></div><div id="dmsStampWorkError"></div><div id="dmsStampViewer" class="dms-stamp-viewer"></div></section></div>`);
    const buttons=[...document.querySelectorAll('#dmsStampItems [data-item-id]')];buttons.forEach(b=>b.onclick=()=>renderItem(Number(b.dataset.itemId)));$('dmsStampWorkspaceClose').onclick=closeModal;
    $('dmsStampPng').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(f.type!=='image/png'){$('dmsStampWorkError').innerHTML='<div class="dms-stamp-error">Stamp must be a PNG file.</div>';return;}state.stamp=await f.arrayBuffer();document.querySelectorAll('.dms-stamp-mark img').forEach(img=>img.src=URL.createObjectURL(f));};
    $('dmsApplyStamp').onclick=async()=>{try{if(!state.current)throw new Error('Select a PDF.');if(!state.stamp)throw new Error('Browse a PNG Stamp first.');const pdf=await lib.PDFDocument.load(state.current.bytes);const png=await lib.PDFDocument.create();const embedded=await png.embedPng(state.stamp);const sourcePages=pdf.getPages();for(let i=0;i<sourcePages.length;i++){const p=sourcePages[i],s=state.pages.get(i+1);if(s){const page=p;const w=page.getWidth(),h=page.getHeight();page.drawImage(embedded,{x:s.x*w,y:h-(s.y+s.h)*h,width:s.w*w,height:s.h*h});}}const bytes=await pdf.save();const r=await fetch(`${API}/stamp/requests/${id}/item/${state.current.itemId}/complete`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/pdf'},body:bytes});const result=await r.json().catch(()=>({}));if(!r.ok)throw new Error(result.error||`HTTP ${r.status}`);state.current.completed=true;state.current=null;await openStampWorkspace(id,await json(`${API}/stamp/requests/${id}`));}catch(e){$('dmsStampWorkError').innerHTML=`<div class="dms-stamp-error">${esc(e.message)}</div>`;}};
    async function renderItem(itemId){
      const item=data.items.find(x=>Number(x.StampItemID)===itemId);if(!item)return;state.current={itemId,bytes:null};buttons.forEach(b=>b.classList.toggle('active',Number(b.dataset.itemId)===itemId));
      const response=await fetch(`${API}/stamp/requests/${id}/source/${itemId}`,{credentials:'include',cache:'no-store'});if(!response.ok)throw new Error('Unable to load the source PDF.');const bytes=await response.arrayBuffer();state.current.bytes=bytes;state.pages.clear();
      const pdf=await viewer.getDocument({data:bytes}).promise,box=$('dmsStampViewer');box.innerHTML='';
      for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),vp=page.getViewport({scale:1.25}),wrap=document.createElement('div');wrap.className='dms-stamp-page';wrap.dataset.page=n;const canvas=document.createElement('canvas');canvas.width=vp.width;canvas.height=vp.height;wrap.appendChild(canvas);const overlay=document.createElement('div');overlay.className='dms-stamp-overlay';wrap.appendChild(overlay);box.appendChild(wrap);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;setupPage(n,overlay);}
    }
    function setupPage(pageNumber,overlay){overlay.ondragover=e=>e.preventDefault();overlay.onclick=e=>{if(!state.stamp||e.target!==overlay)return;const r=overlay.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;let mark=overlay.querySelector('.dms-stamp-mark');if(!mark){mark=document.createElement('div');mark.className='dms-stamp-mark';mark.innerHTML='<img><span class="dms-stamp-resize"></span>';overlay.appendChild(mark);mark.querySelector('img').src=URL.createObjectURL(new Blob([state.stamp],{type:'image/png'}));mark.style.width='18%';mark.style.height='9%';}mark.style.left=`${Math.max(0,Math.min(82,x*100))}%`;mark.style.top=`${Math.max(0,Math.min(91,y*100))}%`;savePosition(pageNumber,mark,overlay);dragResize(pageNumber,mark,overlay);};}
    function savePosition(page,mark,overlay){const r=overlay.getBoundingClientRect(),m=mark.getBoundingClientRect();state.pages.set(page,{x:(m.left-r.left)/r.width,y:(m.top-r.top)/r.height,w:m.width/r.width,h:m.height/r.height});}
    function dragResize(page,mark,overlay){let mode=null,sx=0,sy=0,base=null;mark.onpointerdown=e=>{if(e.target.classList.contains('dms-stamp-resize'))mode='resize';else mode='move';mark.setPointerCapture(e.pointerId);sx=e.clientX;sy=e.clientY;base=mark.getBoundingClientRect();e.preventDefault();};mark.onpointermove=e=>{if(!mode)return;const r=overlay.getBoundingClientRect(),dx=(e.clientX-sx)/r.width*100,dy=(e.clientY-sy)/r.height*100;if(mode==='move'){mark.style.left=`${Math.max(0,Math.min(100-(base.width/r.width*100),parseFloat(mark.style.left||0)+dx))}%`;mark.style.top=`${Math.max(0,Math.min(100-(base.height/r.height*100),parseFloat(mark.style.top||0)+dy))}%`;}else{mark.style.width=`${Math.max(4,Math.min(90,(base.width/r.width*100)+dx))}%`;mark.style.height=`${Math.max(3,Math.min(70,(base.height/r.height*100)+dy))}%`;}sx=e.clientX;sy=e.clientY;savePosition(page,mark,overlay);};mark.onpointerup=()=>{mode=null;};}
    await renderItem(initialItemId||Number(data.items[0]?.StampItemID));
  }

  function refresh(){installButton();renderWorklist();}
  document.addEventListener('DOMContentLoaded',async()=>{style();await loadIdentity();installButton();const observer=new MutationObserver(()=>installButton());const details=$('nodeDetails');if(details)observer.observe(details,{subtree:true,childList:true});document.addEventListener('click',e=>{if(e.target.closest('[data-dms-nav="requests"],.rw-category-button'))setTimeout(renderWorklist,80);});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('dmsStampModal')?.hidden)closeModal();});window.addEventListener('dms-stamp-refresh',refresh);});
})();
