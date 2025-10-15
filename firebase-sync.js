/*──────────────────────────────────────────────────────────────
  TypingMind – Firebase Sync v3.0 SIMPLE (Oct-2025)
──────────────────────────────────────────────────────────────*/
if (window.typingMindFirebaseSync) {
  console.log("Firebase Sync already loaded");
} else {
  window.typingMindFirebaseSync = true;

  /* ============================================================
     CONFIGURATION
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
        syncInterval: 60,
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
          stored[key] = key === 'syncInterval' ? parseInt(val) || 60 : val;
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
     LOGGER
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
  }

  /* ============================================================
     FIREBASE SERVICE - 
  ============================================================ */
  class FirebaseService {
    constructor(config, logger) {
      this.config = config;
      this.logger = logger;
      this.app = null;
      this.db = null;
      this.userId = null;
      this.sdkLoaded = false;
      this.isSyncing = false;
    }

    async loadSDK() {
      if (this.sdkLoaded) return;
      const existing = document.querySelector('script#firebase-compat');
      if (existing) {
        await this.waitForFirebaseGlobal();
        this.sdkLoaded = true;
        return;
      }

      const script = document.createElement('script');
      script.id = 'firebase-compat';
      script.src = 'https://unpkg.com/firebase@9.22.2/firebase-compat.js';
      script.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      await this.waitForFirebaseGlobal();
      this.sdkLoaded = true;
      this.logger.log('success', 'Firebase SDK loaded');
    }

    waitForFirebaseGlobal() {
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const timer = setInterval(() => {
          if (window.firebase) {
            clearInterval(timer);
            resolve();
          }
          if (++attempts > 20) {
            clearInterval(timer);
            reject(new Error('Firebase not found'));
          }
        }, 500);
      });
    }

    async initialize() {
      await this.loadSDK();

      if (!this.app) {
        const cfg = {
          apiKey: this.config.get('apiKey'),
          authDomain: this.config.get('authDomain'),
          projectId: this.config.get('projectId'),
          storageBucket: this.config.get('storageBucket')
        };
        this.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
      }

      if (!firebase.auth().currentUser) {
        const result = await firebase.auth().signInAnonymously();
        this.userId = result.user.uid;
        this.logger.log('success', `Signed in: ${this.userId}`);
      } else {
        this.userId = firebase.auth().currentUser.uid;
      }

      if (!this.db) {
        this.db = firebase.firestore();
        try {
          await this.db.enablePersistence({ synchronizeTabs: true });
        } catch {}
      }
    }

    async syncAllChats() {
      if (this.isSyncing) {
        this.logger.log('warning', 'Already syncing, skip');
        return;
      }

      this.isSyncing = true;
      this.logger.log('start', '🔄 Starting full sync...');

      try {
        const localChats = await this.getAllLocalChats();
        this.logger.log('info', `Found ${localChats.length} local chats`);

        const uploadPromises = localChats.map(chat => this.uploadChat(chat));
        await Promise.all(uploadPromises);
        this.logger.log('success', `✅ Uploaded ${localChats.length} chats`);

        const remoteChats = await this.downloadAllChats();
        this.logger.log('info', `Found ${remoteChats.length} remote chats`);

        for (const remoteChat of remoteChats) {
          await this.mergeRemoteChat(remoteChat);
        }
        this.logger.log('success', `✅ Merged ${remoteChats.length} chats`);

        this.logger.log('success', '✅ SYNC COMPLETE');

      } catch (error) {
        this.logger.log('error', 'Sync failed', error);
        throw error;
      } finally {
        this.isSyncing = false;
      }
    }

    async getAllLocalChats() {
      const idb = await this.getIndexedDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(['keyval'], 'readonly');
        const store = tx.objectStore('keyval');
        const chats = [];

        store.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) {
            resolve(chats);
            return;
          }

          const key = cursor.key;
          if (typeof key === 'string' && key.startsWith('CHAT_')) {
            const chat = cursor.value;
            chats.push({
              id: key.replace('CHAT_', ''),
              data: chat
            });
          }
          cursor.continue();
        };

        store.openCursor().onerror = reject;
      });
    }

    async uploadChat(chat) {
      const docRef = this.db.collection('users').doc(this.userId).collection('chats').doc(chat.id);
      
      const data = {
        id: chat.id,
        title: chat.data.title || 'Chat',
        messages: this.sanitizeMessages(chat.data.messages || []),
        createdAt: firebase.firestore.Timestamp.fromMillis(chat.data.createdAt || Date.now()),
        updatedAt: firebase.firestore.Timestamp.fromMillis(chat.data.updatedAt || Date.now()),
        syncedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await docRef.set(data);
      this.logger.log('info', `📤 Uploaded: ${chat.id} (${data.messages.length} msgs)`);
    }

    sanitizeMessages(messages) {
      if (!Array.isArray(messages)) return [];
      
      return messages
        .filter(m => m && typeof m === 'object')
        .map(m => {
          const clean = {
            role: m.role || 'user',
            content: m.content || '',
            createdAt: m.createdAt || Date.now()
          };
          
          if (m.id) clean.id = m.id;
          
          if (m.model) clean.model = m.model;
          if (m.plugin_name) clean.plugin_name = m.plugin_name;
          
          return clean;
        });
    }

    async downloadAllChats() {
      const snapshot = await this.db
        .collection('users')
        .doc(this.userId)
        .collection('chats')
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title,
          messages: data.messages || [],
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
          updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now()
        };
      });
    }

    async mergeRemoteChat(remoteChat) {
      const chatKey = `CHAT_${remoteChat.id}`;
      const idb = await this.getIndexedDB();

      return new Promise((resolve, reject) => {
        const tx = idb.transaction(['keyval'], 'readwrite');
        const store = tx.objectStore('keyval');
        
        const getReq = store.get(chatKey);
        
        getReq.onsuccess = () => {
          const localChat = getReq.result;

          if (!localChat) {
            const newChat = {
              id: remoteChat.id,
              title: remoteChat.title,
              messages: remoteChat.messages,
              createdAt: remoteChat.createdAt,
              updatedAt: remoteChat.updatedAt,
              syncedAt: Date.now()
            };
            
            store.put(newChat, chatKey).onsuccess = () => {
              this.logger.log('info', `📥 Created new: ${remoteChat.id}`);
              resolve();
            };
            return;
          }

          const localTime = localChat.updatedAt || 0;
          const remoteTime = remoteChat.updatedAt || 0;

          if (remoteTime > localTime) {
            localChat.title = remoteChat.title;
            localChat.messages = remoteChat.messages;
            localChat.updatedAt = remoteChat.updatedAt;
            localChat.syncedAt = Date.now();
            
            store.put(localChat, chatKey).onsuccess = () => {
              this.logger.log('info', `📥 Updated: ${remoteChat.id}`);
              resolve();
            };
          } else {
            this.logger.log('info', `⏭️ Skipped: ${remoteChat.id} (local newer)`);
            resolve();
          }
        };

        getReq.onerror = reject;
      });
    }

    async getIndexedDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('keyval-store', 1);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('keyval')) {
            db.createObjectStore('keyval');
          }
        };
      });
    }
  }

  /* ============================================================
     APP
  ============================================================ */
  class CloudSyncApp {
    constructor() {
      this.logger = new Logger();
      this.config = new ConfigManager();
      this.firebase = new FirebaseService(this.config, this.logger);
      this.autoSyncInterval = null;
    }
    
    async initialize() {
      this.logger.log('start', '🚀 Firebase Sync v3.0 SIMPLE');
      await this.waitForDOM();
      this.insertSyncButton();

      if (this.config.isConfigured()) {
        try {
          await this.firebase.initialize();
          this.updateSyncStatus('success');
          
          await this.firebase.syncAllChats();
          
          this.startAutoSync();
          
        } catch (e) {
          this.logger.log('error', 'Init failed', e);
          this.updateSyncStatus('error');
        }
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
      button.className = 'min-w-[58px] sm:min-w-0 sm:aspect-auto aspect-square cursor-pointer h-12 md:h-[50px] flex-col justify-start items-start inline-flex focus:outline-0 focus:text-white w-full relative';
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
      const colors = { 
        success: '#22c55e', 
        error: '#ef4444', 
        syncing: '#3b82f6' 
      };
      dot.style.backgroundColor = colors[status] || '#6b7280';
      dot.style.display = 'block';
    }
    
    openSyncModal() {
      if (document.querySelector('.cloud-sync-modal')) return;
      this.createModal();
    }
    
    createModal() {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      
      const modal = document.createElement('div');
      modal.className = 'cloud-sync-modal';
      modal.style.cssText = 'width:100%;max-width:32rem;background:#27272a;color:#fff;border-radius:0.5rem;padding:1.5rem;border:1px solid rgba(255,255,255,0.1);';
      
      modal.innerHTML = `
        <div class="text-white text-sm">
          <h3 class="text-center text-xl font-bold mb-4">Firebase Sync v3.0</h3>
          
          <div class="space-y-3 mb-4">
            <div>
              <label class="block text-xs text-zinc-400 mb-1">API Key</label>
              <input id="fb-apiKey" type="password" style="width:100%;padding:8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff" value="${this.config.get('apiKey')}">
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">Auth Domain</label>
              <input id="fb-authDomain" style="width:100%;padding:8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff" value="${this.config.get('authDomain')}">
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">Project ID</label>
              <input id="fb-projectId" style="width:100%;padding:8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff" value="${this.config.get('projectId')}">
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">Storage Bucket</label>
              <input id="fb-storageBucket" style="width:100%;padding:8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff" value="${this.config.get('storageBucket')}">
            </div>
            <div>
              <label class="block text-xs text-zinc-400 mb-1">Auto-sync (minutes)</label>
              <input id="fb-syncInterval" type="number" min="1" style="width:100%;padding:8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff" value="${this.config.get('syncInterval')/60}">
            </div>
          </div>

          <div class="flex gap-2 mb-3">
            <button id="save-settings" class="flex-1 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">Save</button>
            <button id="sync-now" class="flex-1 px-4 py-2 bg-green-600 rounded hover:bg-green-700" ${this.config.isConfigured() ? '' : 'disabled'}>Sync Now</button>
            <button id="close-modal" class="px-4 py-2 bg-zinc-700 rounded hover:bg-zinc-600">Close</button>
          </div>
          
          <div id="action-msg" class="text-center text-sm text-zinc-400"></div>
          
          <div class="text-center mt-4 pt-3 text-xs text-zinc-500 border-t border-zinc-700">
            v3.0 SIMPLE - Add ?log=true to URL for debug
          </div>
        </div>`;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      overlay.addEventListener('click', (e) => { 
        if (e.target === overlay) overlay.remove(); 
      });
      
      modal.querySelector('#close-modal').addEventListener('click', () => overlay.remove());
      modal.querySelector('#save-settings').addEventListener('click', () => this.saveSettings(modal, overlay));
      modal.querySelector('#sync-now').addEventListener('click', () => this.handleSyncNow(modal));
    }
    
    async saveSettings(modal, overlay) {
      const actionMsg = modal.querySelector('#action-msg');
      const get = id => modal.querySelector(id).value.trim();
      
      const newConfig = {
        apiKey: get('#fb-apiKey'),
        authDomain: get('#fb-authDomain'),
        projectId: get('#fb-projectId'),
        storageBucket: get('#fb-storageBucket'),
        syncInterval: parseInt(get('#fb-syncInterval')) * 60, 
      };

      if (!newConfig.apiKey || !newConfig.authDomain || !newConfig.projectId || !newConfig.storageBucket) {
        actionMsg.textContent = '❌ Fill all fields';
        actionMsg.style.color = '#ef4444';
        return;
      }

      Object.keys(newConfig).forEach(k => this.config.set(k, newConfig[k]));
      this.config.save();

      actionMsg.textContent = '✅ Saved! Reloading...';
      actionMsg.style.color = '#22c55e';
      
      setTimeout(() => window.location.reload(), 1000);
    }
    
    async handleSyncNow(modal) {
      const syncBtn = modal.querySelector('#sync-now');
      const actionMsg = modal.querySelector('#action-msg');
      
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';
      this.updateSyncStatus('syncing');

      try {
        await this.firebase.syncAllChats();
        actionMsg.textContent = '✅ Sync complete!';
        actionMsg.style.color = '#22c55e';
        this.updateSyncStatus('success');
      } catch (e) {
        actionMsg.textContent = `❌ ${e.message}`;
        actionMsg.style.color = '#ef4444';
        this.updateSyncStatus('error');
      } finally {
        setTimeout(() => {
          syncBtn.textContent = 'Sync Now';
          syncBtn.disabled = false;
        }, 2000);
      }
    }
    
    startAutoSync() {
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
      
      const intervalMs = this.config.get('syncInterval') * 1000;
      
      this.autoSyncInterval = setInterval(async () => {
        if (this.firebase.isSyncing) return;
        
        this.logger.log('info', '⏰ Auto-sync...');
        this.updateSyncStatus('syncing');
        
        try {
          await this.firebase.syncAllChats();
          this.updateSyncStatus('success');
        } catch (e) {
          this.logger.log('error', 'Auto-sync failed', e);
          this.updateSyncStatus('error');
        }
      }, intervalMs);
      
      this.logger.log('success', `Auto-sync every ${intervalMs/1000}s`);
    }
  }

  const app = new CloudSyncApp();
  app.initialize();
  window.cloudSyncApp = app;
}
