/*──────────────────────────────────────────────────────────────
  TypingMind – Firebase Cloud-Sync  v0.2  (Oct-2025)
──────────────────────────────────────────────────────────────*/
if (window.typingMindFirebaseSync) {
  console.log("Firebase Sync already loaded");
} else {
  window.typingMindFirebaseSync = true;

  /* ============================================================
     1. ConfigManager – stockage localStorage
  ============================================================ */
  class ConfigManager {
    constructor() {
      this.config = this.loadConfig();
    }
    loadConfig() {
      const defaults = {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        syncInterval: 15,
      };
      const stored = {};
      const keyMap = {
        apiKey: 'tcs_fb_apiKey',
        authDomain: 'tcs_fb_authDomain',
        projectId: 'tcs_fb_projectId',
        storageBucket: 'tcs_fb_storageBucket',
        syncInterval: 'tcs_fb_syncInterval',
      };
      Object.keys(defaults).forEach(key => {
        const val = localStorage.getItem(keyMap[key]);
        if (val !== null) {
          stored[key] = key === 'syncInterval' ? parseInt(val) || 15 : val;
        }
      });
      return { ...defaults, ...stored };
    }
    get(key) { return this.config[key]; }
    set(key, value) { this.config[key] = value; }
    save() {
      const keyMap = {
        apiKey: 'tcs_fb_apiKey',
        authDomain: 'tcs_fb_authDomain',
        projectId: 'tcs_fb_projectId',
        storageBucket: 'tcs_fb_storageBucket',
        syncInterval: 'tcs_fb_syncInterval',
      };
      Object.keys(this.config).forEach(key => {
        const storageKey = keyMap[key];
        if (storageKey) {
          localStorage.setItem(storageKey, this.config[key]?.toString() || '');
        }
      });
    }
    isConfigured() {
      return !!(this.config.apiKey && this.config.authDomain &&
                this.config.projectId && this.config.storageBucket);
    }
  }

  /* ============================================================
     2. Logger
  ============================================================ */
  class Logger {
    constructor() {
      const urlParams = new URLSearchParams(window.location.search);
      this.enabled = urlParams.get('log') === 'true' || urlParams.has('log');
    }
    log(type, message, data = null) {
      if (!this.enabled) return;
      const timestamp = new Date().toLocaleTimeString();
      const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌', start: '🔄' };
      const icon = icons[type] || 'ℹ️';
      console.log(`${icon} [${timestamp}] ${message}`, data || '');
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      const url = new URL(window.location);
      if (enabled) url.searchParams.set('log', '');
      else url.searchParams.delete('log');
      window.history.replaceState({}, '', url);
    }
  }

/* ============================================================
   3. FirebaseService 
============================================================ */
class FirebaseService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.app = null;
    this.db = null;
    this.storage = null;
    this.listeners = [];
    this.sdkLoaded = false;
  }

  async loadSDK() {
    if (this.sdkLoaded) return;

    const BUNDLE =
      'https://cdnjs.cloudflare.com/ajax/libs/firebase/9.22.2/firebase-compat.min.js';

    const txt  = await fetch(BUNDLE, {cache: 'no-store'})
                      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });

    const blobURL = URL.createObjectURL(new Blob([txt], {type:'text/javascript'}));
    await this.loadScript(blobURL);
    URL.revokeObjectURL(blobURL);

    if (!window.firebase) throw new Error('firebase global missing');
    this.sdkLoaded = true;
    this.logger.log('success', 'Firebase SDK 9.22.2 loaded (blob)');
  }

  loadScript(src) {
    return new Promise((ok, err) => {
      const s = document.createElement('script');
      s.src   = src;
      s.async = true;
      s.onload= ok;
      s.onerror = () => err(new Error(`fail ${src}`));
      document.head.appendChild(s);
    });
  }

  async initialize() {
    await this.loadSDK();                 

    if (!this.app) {
      const cfg = {
        apiKey       : this.config.get('apiKey'),
        authDomain   : this.config.get('authDomain'),
        projectId    : this.config.get('projectId'),
        storageBucket: this.config.get('storageBucket')
      };
      this.app = firebase.apps.length        
        ? firebase.app()                       
        : firebase.initializeApp(cfg);         
    }

    firebase.firestore().settings({
      experimentalForceLongPolling: true,
      useFetchStreams            : false
    });

    this.db      = firebase.firestore(this.app);
    this.storage = firebase.storage(this.app);

    try { await this.db.enablePersistence(); } catch {}

    console.log('init ok');               
    this.logger.log('success', 'Firebase initialised');
  }

  async pushLocalChats() {
    if (!this.db) {
      this.logger.log('error', 'pushLocalChats called but this.db is null');
      throw new Error('Firebase not initialized');
    }

    const idb = await this.getIndexedDB();
    const store = idb.transaction(['keyval'], 'readonly').objectStore('keyval');
    
    return new Promise(done => {
      store.openCursor().onsuccess = async e => {
        const cur = e.target.result;
        if (!cur) { done(); return; }
        
        const k = cur.key;
        if (typeof k === 'string' && k.startsWith('CHAT_')) {
          const docRef = this.db.collection('chats').doc(k);
          const snap = await docRef.get();
          const remoteUp = snap.exists ? snap.data().updatedAt || 0 : 0;
          
          if (cur.value.updatedAt > remoteUp) {
            await docRef.set({ ...cur.value, updatedAt: Date.now() });
            this.logger.log('success', `Pushed ${k}`);
          }
          
          this.attachListener(k);
        }
        cur.continue();
      };
    });
  }

  attachListener(chatId) {
    if (!this.db) {
      this.logger.log('error', `attachListener(${chatId}) called but this.db is null`);
      return;
    }

    if (this.listeners.includes(chatId)) return;
    
    this.db.collection('chats').doc(chatId).collection('messages')
      .orderBy('createdAt')
      .limitToLast(30)
      .onSnapshot(snap => {
        if (!snap.docChanges().length) return;
        const msgs = snap.docChanges().map(c => c.doc.data());
        this.injectIntoLocal(chatId, msgs);
      });
    
    this.listeners.push(chatId);
    this.logger.log('info', `Listener attached for ${chatId}`);
  }

  async injectIntoLocal(chatId, msgs) {
    const idb = await this.getIndexedDB();
    const tx = idb.transaction(['keyval'], 'readwrite');
    const st = tx.objectStore('keyval');
    const req = st.get(chatId);
    
    req.onsuccess = () => {
      const chat = req.result || { messages: [], updatedAt: 0 };
      msgs.forEach(m => {
        if (!chat.messages.some(existing => existing.id === m.id)) {
          chat.messages.push(m);
        }
      });
      chat.updatedAt = Date.now();
      st.put(chat, chatId);
      this.logger.log('info', `Injected ${msgs.length} messages into ${chatId}`);
    };
  }

  async getIndexedDB() {
    return new Promise(res => {
      const r = indexedDB.open('keyval-store');
      r.onsuccess = () => res(r.result);
    });
  }
}

  /* ============================================================
     4. CloudSyncApp
  ============================================================ */
  class CloudSyncApp {
    constructor() {
      this.logger = new Logger();
      this.config = new ConfigManager();
      this.firebase = new FirebaseService(this.config, this.logger);
      this.autoSyncInterval = null;
      this.modalCleanupCallbacks = [];
    }
    async initialize() {
      this.logger.log('start', 'Initializing Firebase Sync');
      await this.waitForDOM();
      this.insertSyncButton();

      if (this.config.isConfigured()) {
        try {
          await this.firebase.initialize();          
          console.log('init ok');                    
          await this.firebase.pushLocalChats();      
          this.startAutoSync();
          this.updateSyncStatus('success');
        } catch (e) {
          this.logger.log('error', 'Init failed', e);
          this.updateSyncStatus('error');
        }
      } else {
        this.logger.log('info', 'Not configured');
      }
    }
    async waitForDOM() {
      if (document.readyState === 'loading') {
        return new Promise(r => document.addEventListener('DOMContentLoaded', r));
      }
    }
    insertSyncButton() {
      if (document.querySelector('[data-element-id="workspace-tab-cloudsync"]')) return;
      const style = document.createElement('style');
      style.textContent = `
        #sync-status-dot {
          position: absolute; top: 2px; right: -6px;
          width: 8px; height: 8px; border-radius: 50%;
          background-color: #6b7280; display: none; z-index: 10;
        }`;
      document.head.appendChild(style);

      const button = document.createElement('button');
      button.setAttribute('data-element-id', 'workspace-tab-cloudsync');
      button.className = 'min-w-[58px] sm:min-w-0 sm:aspect-auto aspect-square cursor-default h-12 md:h-[50px] flex-col justify-start items-start inline-flex focus:outline-0 focus:text-white w-full relative';
      button.innerHTML = `
        <span class="text-white/70 hover:bg-white/20 self-stretch h-12 md:h-[50px] px-0.5 py-1.5 rounded-xl flex-col justify-start items-center gap-1.5 flex transition-colors">
          <div class="relative">
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
              <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 4.5A4.5 4.5 0 0114.5 9M9 13.5A4.5 4.5 0 013.5 9"/>
                <polyline points="9,2.5 9,4.5 11,4.5"/>
                <polyline points="9,15.5 9,13.5 7,13.5"/>
              </g>
            </svg>
            <div id="sync-status-dot"></div>
          </div>
          <span class="font-normal self-stretch text-center text-xs leading-4 md:leading-none">Sync</span>
        </span>`;
      button.addEventListener('click', () => this.openSyncModal());
      const chatButton = document.querySelector('button[data-element-id="workspace-tab-chat"]');
      if (chatButton?.parentNode) {
        chatButton.parentNode.insertBefore(button, chatButton.nextSibling);
      }
    }
    updateSyncStatus(status = 'success') {
      const dot = document.getElementById('sync-status-dot');
      if (!dot) return;
      const colors = { success: '#22c55e', error: '#ef4444', warning: '#eab308', syncing: '#3b82f6' };
      dot.style.backgroundColor = colors[status] || '#6b7280';
      dot.style.display = 'block';
    }
    openSyncModal() {
      if (document.querySelector('.cloud-sync-modal')) return;
      this.logger.log('start', 'Opening sync modal');
      this.createModal();
    }
    createModal() {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const modal = document.createElement('div');
      modal.className = 'cloud-sync-modal';
      modal.style.cssText = 'width:100%;max-width:32rem;background:#27272a;color:#fff;border-radius:0.5rem;padding:1rem;border:1px solid rgba(255,255,255,0.1);box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);';
      modal.innerHTML = this.getModalHTML();
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      this.setupModalEventListeners(modal, overlay);
    }
    getModalHTML() {
      return `
        <div class="text-white text-left text-sm">
          <h3 class="text-center text-xl font-bold mb-3">Firebase Cloud Sync</h3>
          
          <!-- Firebase Config Section -->
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer" id="firebase-config-header">
              <label class="block text-sm font-medium text-zinc-300">Firebase Configuration</label>
              <svg id="firebase-config-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
            <div id="firebase-config-content" class="space-y-2">
              <div>
                <label class="block text-xs text-zinc-400 mb-1">API Key</label>
                <input id="fb-apiKey" type="password" style="width:100%;padding:6px 8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff;font-size:0.875rem" value="${this.config.get('apiKey')}">
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Auth Domain</label>
                <input id="fb-authDomain" style="width:100%;padding:6px 8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff;font-size:0.875rem" value="${this.config.get('authDomain')}">
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Project ID</label>
                <input id="fb-projectId" style="width:100%;padding:6px 8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff;font-size:0.875rem" value="${this.config.get('projectId')}">
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Storage Bucket</label>
                <input id="fb-storageBucket" style="width:100%;padding:6px 8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff;font-size:0.875rem" value="${this.config.get('storageBucket')}">
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Sync Interval (seconds)</label>
                <input id="fb-syncInterval" type="number" min="15" style="width:100%;padding:6px 8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff;font-size:0.875rem" value="${this.config.get('syncInterval')}">
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-between mt-4 gap-2">
            <button id="save-settings" class="px-3 py-1.5 bg-blue-600 rounded text-sm hover:bg-blue-700">Save & Verify</button>
            <div class="flex gap-2">
              <button id="sync-now" class="px-3 py-1.5 bg-green-600 rounded text-sm hover:bg-green-700" ${this.config.isConfigured() ? '' : 'disabled'}>Sync Now</button>
              <button id="close-modal" class="px-3 py-1.5 bg-red-600 rounded text-sm hover:bg-red-700">Close</button>
            </div>
          </div>
          
          <div id="action-msg" class="text-center text-zinc-400 mt-3"></div>
          
          <div class="text-center mt-4 pt-3 text-xs text-zinc-500 border-t border-zinc-700">
            <span>Firebase Cloud Sync for TypingMind</span>
          </div>
        </div>`;
    }
    setupModalEventListeners(modal, overlay) {
      const closeHandler = () => this.closeModal(overlay);
      const saveHandler = () => this.saveSettings(modal);
      const syncHandler = () => this.handleSyncNow(modal);

      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHandler(); });
      modal.querySelector('#close-modal').addEventListener('click', closeHandler);
      modal.querySelector('#save-settings').addEventListener('click', saveHandler);
      modal.querySelector('#sync-now').addEventListener('click', syncHandler);

      // Accordion
      const header = modal.querySelector('#firebase-config-header');
      const content = modal.querySelector('#firebase-config-content');
      const chevron = modal.querySelector('#firebase-config-chevron');
      header.addEventListener('click', () => {
        const isHidden = content.classList.contains('hidden');
        content.classList.toggle('hidden', !isHidden);
        chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0)';
      });

      this.modalCleanupCallbacks.push(() => {
        overlay.removeEventListener('click', closeHandler);
      });
    }
    closeModal(overlay) {
      this.modalCleanupCallbacks.forEach(cb => cb());
      this.modalCleanupCallbacks = [];
      overlay?.remove();
    }
    async saveSettings(modal) {
      const actionMsg = modal.querySelector('#action-msg');
      const saveBtn = modal.querySelector('#save-settings');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Verifying...';
      actionMsg.textContent = 'Verifying configuration...';

      const get = id => modal.querySelector(id).value.trim();
      const newConfig = {
        apiKey        : get('#fb-apiKey'),
        authDomain    : get('#fb-authDomain'),
        projectId     : get('#fb-projectId'),
        storageBucket : get('#fb-storageBucket'),
        syncInterval  : get('#fb-syncInterval'),
      };

      if (!newConfig.apiKey || !newConfig.authDomain || !newConfig.projectId || !newConfig.storageBucket) {
        actionMsg.textContent = '❌ Please fill all fields';
        actionMsg.style.color = '#ef4444';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Verify';
        return;
      }

      Object.keys(newConfig).forEach(k => this.config.set(k, newConfig[k]));
      this.config.save();

      try {
        await this.firebase.initialize();
        actionMsg.textContent = '✅ Configuration saved! Page will reload...';
        actionMsg.style.color = '#22c55e';
        setTimeout(() => window.location.reload(), 1500);
      } catch (e) {
        this.logger.log('error', 'Verification failed', e.message);
        actionMsg.textContent = `❌ Verification failed: ${e.message}`;
        actionMsg.style.color = '#ef4444';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Verify';
      }
    }
    async handleSyncNow(modal) {
      try {
        if (!this.firebase.db) {
          await this.firebase.initialize();           
          console.log('init ok');
        }
      } catch (e) {
        alert('Firebase init failed : ' + e.message);
        return;
      }

      const syncBtn   = modal.querySelector('#sync-now');
      const actionMsg = modal.querySelector('#action-msg');
      const original  = syncBtn.textContent;
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing…';
      this.updateSyncStatus('syncing');

      try {
        await this.firebase.pushLocalChats();
        actionMsg.textContent = '✅ Sync completed!';
        actionMsg.style.color = '#22c55e';
        this.updateSyncStatus('success');
      } catch (e) {
        actionMsg.textContent = `❌ Sync failed: ${e.message}`;
        actionMsg.style.color = '#ef4444';
        this.updateSyncStatus('error');
      } finally {
        setTimeout(() => {
          syncBtn.textContent = original;
          syncBtn.disabled = false;
        }, 2000);
      }
    }
    startAutoSync() {
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
      const interval = Math.max(this.config.get('syncInterval') * 1000, 15000);
      this.autoSyncInterval = setInterval(async () => {
        this.logger.log('info', 'Auto-sync triggered');
        this.updateSyncStatus('syncing');
        try {
          await this.firebase.pushLocalChats();
          this.updateSyncStatus('success');
        } catch (e) {
          this.logger.log('error', 'Auto-sync failed', e.message);
          this.updateSyncStatus('error');
        }
      }, interval);
      this.logger.log('success', `Auto-sync started (every ${interval / 1000}s)`);
    }
  }

  const app = new CloudSyncApp();
  app.initialize();
  window.cloudSyncApp = app;
}