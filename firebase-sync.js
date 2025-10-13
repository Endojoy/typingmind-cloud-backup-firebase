/*──────────────────────────────────────────────────────────────
  TypingMind – Firebase Cloud-Sync  v0.1  (Oct-2025)
──────────────────────────────────────────────────────────────*/
(() => {
  const LS = 'tcs_fb_';                         
  const KEYS = ['apiKey','authDomain','projectId','storageBucket'];
  const BTN_ID = 'workspace-tab-cloudsync';     
  const DEBUG = false;
  const log = (...args)=>{ if(DEBUG) console.log('[FirebaseSync]',...args); };


  const hasConfig = () => KEYS.every(k=>localStorage.getItem(LS+k));
  const getCfg    = () => {
    const o={}; KEYS.forEach(k=>{ const v=localStorage.getItem(LS+k); if(v)o[k]=v;});
    return o;
  };


  function insertButton(){
    if(document.querySelector(`[data-element-id="${BTN_ID}"]`)) return;
    const btn = document.createElement('button');
    btn.setAttribute('data-element-id',BTN_ID);
    btn.className='min-w-[58px] h-12 flex flex-col items-center justify-center text-white/70 hover:text-white cursor-pointer';
    btn.innerHTML = `
      <div class="relative">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 5a1 1 0 011-1h3.3a1 1 0 01.95.68l.52 1.55A1 1 0 008.8 7H14a4 4 0 010 8h-.2a1 1 0 000 2H14a6 6 0 100-12H9l-.52-1.55A3 3 0 005.3 3H3a3 3 0 000 6h.2a1 1 0 100-2H3a1 1 0 01-1-1z"/>
        </svg>
      </div>
      <span class="text-xs">Sync</span>`;
    btn.onclick = openModal;
    const chatBtn = document.querySelector('button[data-element-id="workspace-tab-chat"]');
    chatBtn?.parentNode?.insertBefore(btn, chatBtn.nextSibling);
  }


  function openModal(){
    if(document.querySelector('.fb-modal')) return;
    const ov = document.createElement('div');
    ov.className='fb-modal fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center';
    ov.innerHTML = `
      <div class="bg-zinc-800 w-full max-w-md border border-zinc-700 rounded-lg p-4 text-sm text-white"
           onclick="event.stopPropagation()">
        <h3 class="text-center text-lg font-bold mb-3">Firebase Sync settings</h3>
        ${KEYS.map(k=>`
          <div class="mb-2">
            <label class="block capitalize mb-1">${k}</label>
            <input id="fb-${k}" class="w-full px-2 py-1.5 rounded bg-zinc-700 border border-zinc-600 focus:outline-none">
          </div>`).join('')}
        <div class="flex justify-end gap-2 mt-4">
          <button id="fb-save"  class="px-3 py-1.5 bg-blue-600 rounded disabled:bg-gray-600">Save & Verify</button>
          <button id="fb-sync"  class="px-3 py-1.5 bg-green-600 rounded disabled:bg-gray-600">Sync now</button>
          <button id="fb-close" class="px-3 py-1.5 bg-red-600 rounded">Close</button>
        </div>
        <p id="fb-msg" class="text-center mt-3 text-zinc-400"></p>
      </div>`;
    document.body.appendChild(ov);
    KEYS.forEach(k=>{
      ov.querySelector(`#fb-${k}`).value = localStorage.getItem(LS+k)||'';
    });
    ov.onclick = ()=>ov.remove();
    ov.querySelector('#fb-close').onclick = ()=>ov.remove();
    ov.querySelector('#fb-save').onclick  = ()=>saveConfig(ov);
    ov.querySelector('#fb-sync').onclick  = ()=>manualSync(ov);
    if(!hasConfig()) ov.querySelector('#fb-sync').disabled=true;
  }

  let fbInitPromise=null, fbDB=null, fbStorage=null;
  async function initFirebase(){
    if(fbInitPromise) return fbInitPromise;
    fbInitPromise = (async()=>{
      const cfg=getCfg();
      if(!Object.keys(cfg).length) throw new Error('Missing config');
      const [{initializeApp},
             {getFirestore,enableIndexedDbPersistence},
             {getStorage}] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/9.24.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/9.24.0/firebase-firestore.js'),
        import('https://www.gstatic.com/firebasejs/9.24.0/firebase-storage.js')
      ]);
      const app = initializeApp(cfg,'tm-sync');
      fbDB      = getFirestore(app);
      fbStorage = getStorage(app);
      try{await enableIndexedDbPersistence(fbDB);}catch{}
      log('Firebase ready');
    })();
    return fbInitPromise;
  }

  async function saveConfig(modal){
    const saveBtn = modal.querySelector('#fb-save');
    const msg     = modal.querySelector('#fb-msg');
    KEYS.forEach(k=>{
      const v = modal.querySelector(`#fb-${k}`).value.trim();
      if(v) localStorage.setItem(LS+k,v);
    });
    saveBtn.disabled=true; msg.textContent='Verifying…';
    try{
      await initFirebase();
      msg.textContent='✅ Configuration success';
      modal.querySelector('#fb-sync').disabled=false;
    }catch(e){
      msg.textContent='❌ '+e.message;
    }finally{
      saveBtn.disabled=false;
    }
  }

  let listeners=[];
  const ChatsCol = ()=>firebase.firestore().collection('chats'); 
  async function pushLocalChats(){
    const idb = await new Promise(r=>{
      const req=indexedDB.open('keyval-store'); req.onsuccess=()=>r(req.result);});
    const store=idb.transaction(['keyval'],'readonly').objectStore('keyval');
    const fb = await import('https://www.gstatic.com/firebasejs/9.24.0/firebase-firestore.js');
    await new Promise(done=>{
      store.openCursor().onsuccess=async e=>{
        const cur=e.target.result; if(!cur){done();return;}
        const k=cur.key;
        if(typeof k==='string' && k.startsWith('CHAT_')){
          const docRef = fb.doc(fbDB,'chats',k);
          const snap   = await fb.getDoc(docRef);
          const remoteUp = snap.exists()?snap.data().updatedAt||0:0;
          if(cur.value.updatedAt>remoteUp){
            await fb.setDoc(docRef,{...cur.value,updatedAt:Date.now()});
            log('pushed',k);
          }
          attachListener(k);
        }
        cur.continue();
      };
    });
  }

  async function attachListener(chatId){
    if(listeners.includes(chatId)) return;
    const fb = await import('https://www.gstatic.com/firebasejs/9.24.0/firebase-firestore.js');
    const q  = fb.query(fb.collection(fbDB,'chats',chatId,'messages'),
                        fb.orderBy('createdAt'), fb.limitToLast(30));
    fb.onSnapshot(q,snap=>{
      if(!snap.docChanges().length) return;
      injectIntoIndexedDB(chatId,
        snap.docChanges().map(c=>c.doc.data()));
    });
    listeners.push(chatId);
  }

  async function injectIntoIndexedDB(chatId, msgs){
    const idb = await new Promise(r=>{
      const req=indexedDB.open('keyval-store'); req.onsuccess=()=>r(req.result);});
    const tx  = idb.transaction(['keyval'],'readwrite');
    const st  = tx.objectStore('keyval');
    const req = st.get(chatId);
    req.onsuccess=()=>{
      const chat=req.result||{messages:[],updatedAt:0};
      msgs.forEach(m=>chat.messages.push(m));
      chat.updatedAt=Date.now();
      st.put(chat,chatId);
    };
  }

  async function manualSync(modal){
    const btn=modal.querySelector('#fb-sync');
    const msg=modal.querySelector('#fb-msg');
    btn.disabled=true; msg.textContent='Syncing…';
    try{
      await initFirebase();
      await pushLocalChats();
      msg.textContent='✅ Sync terminé';
    }catch(e){
      msg.textContent='❌ '+e.message;
    }finally{setTimeout(()=>{btn.disabled=false;},1500);}
  }

  document.addEventListener('DOMContentLoaded',async ()=>{
    insertButton();
    if(hasConfig()){
      try{
        await initFirebase();
        await pushLocalChats();
        setInterval(pushLocalChats,15000);
      }catch(e){console.error('Firebase-Sync init error',e);}
    }
  });

})();
