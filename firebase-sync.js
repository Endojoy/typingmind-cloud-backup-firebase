/* ────────────────────────────────────────────────────────────────
   TypingMind – Firebase Sync Extension  (v.1, 2025-10)
────────────────────────────────────────────────────────────────── */

let fbApp   = null;
let fbDB    = null;
let fbStore = null;
const CONFIG_KEYS = [
  'apiKey','authDomain','projectId','storageBucket'
];
const LSTORE_PREFIX = 'tcs_fb_';
const DEBUG  = false;
const log=(...a)=>{ if(DEBUG)console.log('[FB-Sync]',...a); };

function insertSyncButton() {
  if (document.getElementById('fb-sync-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'fb-sync-btn';
  btn.innerHTML = '<span class="text-white/70 hover:bg-white/20 flex p-2 rounded"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 5a1 1 0 011-1h3.28a1 1 0 01.948.684l.517 1.55A1 1 0 008.765 7H14a4 4 0 010 8h-.167a1 1 0 100 2H14a6 6 0 100-12H9.235l-.517-1.55A3 3 0 005.28 3H3a3 3 0 000 6h.167a1 1 0 100-2H3a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>Sync</span>';
  btn.style='min-width:58px;height:48px';
  btn.onclick = openModal;
  document
    .querySelector('button[data-element-id="workspace-tab-chat"]')
    ?.parentNode?.insertBefore(btn,null);
}

function openModal(){
  if(document.querySelector('.fb-sync-modal')) return;
  const overlay=document.createElement('div');
  overlay.className='fb-sync-overlay';
  overlay.style='position:fixed;inset:0;background:#0008;z-index:99999;display:flex;align-items:center;justify-content:center';
  const modal=document.createElement('div');
  modal.className='fb-sync-modal';
  modal.style='background:#27272a;border:1px solid #52525b;border-radius:8px;width:360px;max-width:95%;padding:16px;color:#fff;font-size:14px';
  modal.innerHTML=modalHTML();
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.onclick=e=>{ if(e.target===overlay) overlay.remove(); };


  CONFIG_KEYS.forEach(k=>{
    modal.querySelector(`#fb-${k}`).value=
      localStorage.getItem(LSTORE_PREFIX+k)||'';
  });
  modal.querySelector('#fb-save-btn').onclick=
     ()=>saveConfig(modal);
  modal.querySelector('#fb-close-btn').onclick=
     ()=>overlay.remove();
  modal.querySelector('#fb-sync-now').onclick=
     ()=>manualSync(modal);
}

function modalHTML(){
  return `
    <h2 class="text-center text-lg font-bold mb-3">Firebase Sync</h2>
    <div class="space-y-2">
      ${CONFIG_KEYS.map(k=>`
      <div>
        <label class="block text-sm mb-1 capitalize">${k}</label>
        <input id="fb-${k}" class="w-full px-2 py-1.5 rounded bg-zinc-700 border border-zinc-600 focus:outline-none" autocomplete="off">
      </div>`).join('')}
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <button id="fb-save-btn"   class="px-3 py-1.5 bg-blue-600 rounded">Save & Verify</button>
      <button id="fb-sync-now"   class="px-3 py-1.5 bg-green-600 rounded" ${hasConfig()?'':'disabled'}>Sync Now</button>
      <button id="fb-close-btn"  class="px-3 py-1.5 bg-red-600 rounded">Close</button>
    </div>
    <div id="fb-msg" class="text-center text-sm mt-3 text-zinc-400"></div>`;
}

function hasConfig(){
  return CONFIG_KEYS.every(k=>localStorage.getItem(LSTORE_PREFIX+k));
}

function getConfigObj(){
  const cfg={};
  CONFIG_KEYS.forEach(k=>{
    const v=localStorage.getItem(LSTORE_PREFIX+k);
    if(v) cfg[k]=v;
  });
  return cfg;
}

async function saveConfig(modal){
  const msgEl=modal.querySelector('#fb-msg');
  CONFIG_KEYS.forEach(k=>{
    const val=modal.querySelector(`#fb-${k}`).value.trim();
    if(val) localStorage.setItem(LSTORE_PREFIX+k,val);
  });
  msgEl.textContent='Saving…';
  try{
    await initFirebase();      
    msgEl.textContent='✅ Config OK';
    modal.querySelector('#fb-sync-now').disabled=false;
  }catch(e){
    msgEl.textContent='❌ '+e.message;
  }
}

async function loadSDK(u){ return import(u); }

async function initFirebase(){
  if(fbApp) return;           
  const cfg=getConfigObj();
  if(!Object.keys(cfg).length) throw new Error('config missing');

  const [{initializeApp},
         {getFirestore,enableIndexedDbPersistence},
         {getStorage}] = await Promise.all([
     loadSDK('https://www.gstatic.com/firebasejs/9.24.0/firebase-app.js'),
     loadSDK('https://www.gstatic.com/firebasejs/9.24.0/firebase-firestore.js'),
     loadSDK('https://www.gstatic.com/firebasejs/9.24.0/firebase-storage.js')
  ]);

  fbApp   = initializeApp(cfg,'tm-'+Date.now());
  fbDB    = getFirestore(fbApp);
  fbStore = getStorage(fbApp);
  try{ await enableIndexedDbPersistence(fbDB);}catch{}

  log('Firebase ready');
}


const ChatsColPath = 'chats';
let listeners = [];

async function pushLocalChats(){
  const idb = await new Promise(res=>{
    const r=indexedDB.open('keyval-store'); r.onsuccess=()=>res(r.result);});
  const tx = idb.transaction(['keyval'],'readonly');
  const st = tx.objectStore('keyval');
  await new Promise(done=>{
    st.openCursor().onsuccess=async e=>{
      const cur=e.target.result;if(!cur){done();return;}
      const k=cur.key;
      if(typeof k==='string' && k.startsWith('CHAT_')){
        const docSnap = await import('https://www.gstatic.com/firebasejs/9.24.0/firebase-firestore.js')
            .then(m=>m.getDoc(m.doc(fbDB,ChatsColPath,k)));
        const remoteUpd = docSnap.exists()?docSnap.data().updatedAt||0:0;
        if(cur.value.updatedAt>remoteUpd){
          await (await import('https://www.gstatic.com/firebasejs/9.24.0/firebase-firestore.js'))
            .then(m=>m.setDoc(m.doc(fbDB,ChatsColPath,k),
               {...cur.value,updatedAt:Date.now()}));
          log('pushed',k);
        }
        attachListener(k);   
      }
      cur.continue();
    };
  });
}

async function attachListener(chatId){
  if(listeners.some(l=>l.id===chatId)) return;
  const m = await import('https://www.gstatic.com/firebasejs/9.24.0/firebase-firestore.js');
  const q = m.query(m.collection(fbDB,ChatsColPath,chatId,'messages'),
                    m.orderBy('createdAt'),m.limitToLast(30));
  const unsub = m.onSnapshot(q,snap=>{
      if(!snap.docChanges().length) return;
      injectToLocal(chatId,snap.docChanges().map(c=>c.doc.data()));
  });
  listeners.push({id:chatId,unsub});
}

async function injectToLocal(chatId, msgs){
  const idb = await new Promise(res=>{
    const r=indexedDB.open('keyval-store'); r.onsuccess=()=>res(r.result);});
  const tx = idb.transaction(['keyval'],'readwrite');
  const st = tx.objectStore('keyval');
  const req = st.get(chatId);
  req.onsuccess=()=>{
     const chat=req.result||{messages:[],updatedAt:0};
     msgs.forEach(m=>chat.messages.push(m));
     chat.updatedAt=Date.now();
     st.put(chat,chatId);
  };
}

async function manualSync(modal){
  const btn = modal.querySelector('#fb-sync-now');
  const msg = modal.querySelector('#fb-msg');
  btn.disabled=true; msg.textContent='Sync…';
  try{
    await initFirebase();
    await pushLocalChats();
    msg.textContent='✅ Synchro terminée';
  }catch(e){
    msg.textContent='❌ '+e.message;
  }finally{ setTimeout(()=>{btn.disabled=false;},1500);}
}


(async ()=>{
  await new Promise(r=>document.addEventListener('DOMContentLoaded',r,{once:true}));
  insertSyncButton();
  if(hasConfig()){
    try{
      await initFirebase();
      await pushLocalChats();
      setInterval(pushLocalChats,15000);
    }catch(e){console.error('FB-Sync start error',e);}
  }
})();
