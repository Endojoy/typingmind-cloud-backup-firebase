/*──────────────────────────────────────────────────────────────
  TypingMind – Firebase Cloud-Sync  v1.2  (Oct-2025) - FINAL FINAL FINAL
──────────────────────────────────────────────────────────────*/
if (window.typingMindFirebaseSync) {
  console.log("Firebase Sync already loaded");
} else {
  window.typingMindFirebaseSync = true;

  /* ============================================================
     1. ConfigManager
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
    this.isSyncing = false;
    this.dbInstance = null;
    this.mergeQueue = new Map();  // ✅ FIX: Queue au lieu de busy-wait
    
    window.addEventListener('beforeunload', () => {
      this.listeners.forEach(l => {
        try { l.unsubscribe(); } catch {}
      });
    });
  }

  async loadSDK() {
    if (this.sdkLoaded) return;

    const existing = document.querySelector('script#firebase-compat');
    if (existing) {
      await this.waitForFirebaseGlobal();
      this.sdkLoaded = true;
      this.logger.log('success', 'Firebase SDK déjà présent');
      return;
    }

    const SRC = 'https://unpkg.com/firebase@9.22.2/firebase-compat.js';

    await this.loadScript(SRC, {
      id: 'firebase-compat',
      crossOrigin: 'anonymous'
    });

    await this.waitForFirebaseGlobal();

    this.sdkLoaded = true;
    this.logger.log('success', 'Firebase SDK 9.22.2 chargé');
  }

  waitForFirebaseGlobal() {
    return new Promise((resolve, reject) => {
      const max = 20;
      let attempts = 0;
      const timer = setInterval(() => {
        if (window.firebase) {
          clearInterval(timer);
          return resolve();
        }
        if (++attempts > max) {
          clearInterval(timer);
          return reject(new Error('firebase global introuvable'));
        }
      }, 500);
    });
  }

  loadScript(src, attrs = {}) {
    return new Promise((ok, err) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
      s.onload = ok;
      s.onerror = () => err(new Error(`Échec chargement ${src}`));
      document.head.appendChild(s);
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
      this.app = firebase.apps.length
        ? firebase.app()
        : firebase.initializeApp(cfg);
    }

    if (!firebase.auth().currentUser) {
      try {
        await firebase.auth().signInAnonymously();
        this.logger.log('success', 'Signed-in anonymously');
      } catch (e) {
        this.logger.log('error', 'Anonymous sign-in failed', e);
      }
    }

    if (!this.db) {
      this.db = firebase.firestore();
      this.storage = firebase.storage();

      this.db.settings({
        experimentalForceLongPolling: true,
        useFetchStreams: false
      });

      try {
        await this.db.enablePersistence({ synchronizeTabs: true });
      } catch (_) {}
    }
  }

  async pushLocalChats() {
    if (this.isSyncing) {
      this.logger.log('warning', 'Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;

    try {
      if (!this.db) {
        throw new Error('Firebase not initialized');
      }

      const idb = await this.getIndexedDB();
      const tx = idb.transaction(['keyval'], 'readonly');
      const store = tx.objectStore('keyval');
      
      const chatsToSync = [];
      
      await new Promise((resolve, reject) => {
        store.openCursor().onsuccess = (e) => {
          const cur = e.target.result;
          if (!cur) {
            resolve();
            return;
          }

          const k = cur.key;
          if (typeof k === 'string' && k.startsWith('CHAT_')) {
            chatsToSync.push({ 
              key: k, 
              value: FirebaseService.normalizeChat(cur.value, k) 
            });
          }
          cur.continue();
        };
        store.openCursor().onerror = reject;
      });

      this.logger.log('info', `Syncing ${chatsToSync.length} chats...`);
      
      for (const { key, value } of chatsToSync) {
        await this.syncChatRecord(key, value);
      }

    } finally {
      this.isSyncing = false;
    }
  }

  static sanitizeForFirestore(value, seen = new WeakSet()) {
    if (
      value === null ||
      typeof value === 'string' ||
      (typeof value === 'number' && isFinite(value)) ||
      typeof value === 'boolean'
    ) return value;

    if (value === undefined) return undefined;

    if (value instanceof firebase.firestore.Timestamp) return value.toMillis();
    if (value instanceof Date) return value.getTime();

    if (Array.isArray(value)) {
      const arr = value
        .map(v => FirebaseService.sanitizeForFirestore(v, seen))
        .filter(v => v !== undefined);
      return arr;
    }

    if (value && typeof value === 'object') {
      if (seen.has(value)) {
        return undefined;
      }
      seen.add(value);

      const cleaned = {};
      for (const [k, v] of Object.entries(value)) {
        const cv = FirebaseService.sanitizeForFirestore(v, seen);
        if (cv !== undefined) cleaned[k] = cv;
      }
      return Object.keys(cleaned).length ? cleaned : undefined;
    }
    return undefined;
  }

  // ✅ FIX ABSOLU: ID vraiment stable, déterministe, sans Date.now()
  static stableId(msg) {
    const str = `${msg.role || 'unknown'}_${msg.content || ''}_${msg.createdAt || 0}`;
    
    // Triple hash pour éviter collisions
    let hash1 = 5381;
    for (let i = 0; i < str.length; i++) {
      hash1 = ((hash1 << 5) + hash1) + str.charCodeAt(i);
    }
    
    let hash2 = 0;
    for (let i = 0; i < str.length; i++) {
      hash2 = str.charCodeAt(i) + ((hash2 << 5) - hash2);
    }
    
    let hash3 = 0;
    for (let i = str.length - 1; i >= 0; i--) {
      hash3 = ((hash3 << 7) - hash3) + str.charCodeAt(i);
    }
    
    // ✅ AUCUN Date.now() ou Math.random() !
    return `msg_${Math.abs(hash1).toString(36)}_${Math.abs(hash2).toString(36)}_${Math.abs(hash3).toString(36)}`;
  }

  static chunk(array, size = 400) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  static normalizeChat(raw, key) {
    const now = Date.now();
    
    // ✅ FIX: Spread tout PUIS override les champs critiques
    const obj = {
      ...raw,
      id: raw.id || key.replace(/^CHAT_/, ''),
      title: raw.title || raw.name || 'Chat',
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now,
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      syncedAt: raw.syncedAt || 0
    };

    obj.messages = obj.messages.map(m => ({
      ...m,
      createdAt: m.createdAt || m.timestamp || now,
      updatedAt: m.updatedAt || m.timestamp || now
    }));

    if (!obj.title && obj.messages.length) {
      const firstUser = obj.messages.find(m => m.role === 'user');
      obj.title = (firstUser?.content || 'Chat').slice(0, 60);
    }
    return obj;
  }

  // ✅ FIX: Utiliser une Map temporaire d'assignation
  async assignMessageIds(chatId, assignments) {
    if (!assignments.length) return;
    
    const idb = await this.getIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(['keyval'], 'readwrite');
      const st = tx.objectStore('keyval');
      const req = st.get(chatId);
      
      req.onsuccess = () => {
        const data = req.result;
        if (!data || !data.messages) {
          resolve();
          return;
        }
        
        // Assigner par fingerprint unique
        const assignMap = new Map(assignments.map(a => [a.fingerprint, a.id]));
        
        data.messages.forEach(m => {
          if (!m.id) {
            const fp = FirebaseService.messageFingerprint(m);
            if (assignMap.has(fp)) {
              m.id = assignMap.get(fp);
            }
          }
        });
        
        const putReq = st.put(data, chatId);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      
      req.onerror = () => reject(req.error);
    });
  }

  async flagLocalSyncedAt(chatId) {
    const idb = await this.getIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(['keyval'], 'readwrite');
      const st = tx.objectStore('keyval');
      const req = st.get(chatId);
      
      req.onsuccess = () => {
        const data = req.result;
        if (!data) {
          resolve();
          return;
        }
        
        data.syncedAt = Date.now();
        const putReq = st.put(data, chatId);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      
      req.onerror = () => reject(req.error);
    });
  }

  async syncChatRecord(chatId, localData) {
    const docRef = this.db.collection('chats').doc(chatId);
    
    const snap = await docRef.get();
    const remoteUp = snap.exists ? snap.data().updatedAt || 0 : 0;
    const hasMetaChange = localData.updatedAt > remoteUp;

    if (hasMetaChange) {
      await docRef.set(
        FirebaseService.sanitizeForFirestore({
          title: localData.title,
          updatedAt: Date.now(),
          createdAt: localData.createdAt
        }),
        { merge: true }
      );
    }

    const remoteSnapshot = await docRef.collection('messages')
      .orderBy('createdAt')
      .get();
    
    const remoteMessages = remoteSnapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    // ✅ FIX: Map par ID avec updatedAt
    const remoteMap = new Map(remoteMessages.map(m => [m.id, m]));
    
    const lastSynced = localData.syncedAt || 0;
    const assignments = [];
    
    const localMsgsToUpload = (localData.messages || [])
      .map(m => {
        const timestamp = m.updatedAt || m.createdAt || m.timestamp || Date.now();
        return { ...m, createdAt: timestamp, updatedAt: timestamp };
      })
      .filter(m => {
        // ✅ FIX: Comparer avec updatedAt remote si existe
        if (!m.id) return true;
        
        const remote = remoteMap.get(String(m.id));
        if (!remote) return true;
        
        // Uploader seulement si plus récent que remote
        return (m.updatedAt || 0) > (remote.updatedAt || 0);
      })
      .map(m => FirebaseService.sanitizeForFirestore({ ...m }))
      .filter(Boolean);

    this.logger.log('info', `Uploading ${localMsgsToUpload.length} messages to ${chatId}`);

    for (const chunk of FirebaseService.chunk(localMsgsToUpload, 400)) {
      const batch = this.db.batch();

      for (const msg of chunk) {
        const fingerprint = FirebaseService.messageFingerprint(msg);
        const id = msg.id || FirebaseService.stableId(msg);
        const needsAssignment = !msg.id;
        
        msg.id = id;

        const mRef = docRef.collection('messages').doc(id);
        batch.set(mRef, msg, { merge: true });

        if (needsAssignment) {
          assignments.push({ fingerprint, id });
        }
      }
      
      await batch.commit();
    }

    if (assignments.length > 0) {
      await this.assignMessageIds(chatId, assignments);
    }

    const localIds = new Set(
      (localData.messages || [])
        .filter(m => m.id)
        .map(m => String(m.id))
    );

    const remoteMsgsToDownload = remoteMessages.filter(m => 
      !localIds.has(m.id)
    );

    if (remoteMsgsToDownload.length > 0) {
      this.logger.log('info', `Downloading ${remoteMsgsToDownload.length} messages from ${chatId}`);
      await this.mergeIntoLocal(chatId, remoteMsgsToDownload);
    }

    await this.flagLocalSyncedAt(chatId);
  }

  attachListener(chatId) {
    if (!this.db) {
      this.logger.log('error', `attachListener(${chatId}) called but this.db is null`);
      return;
    }

    if (this.listeners.some(l => l.chatId === chatId)) {
      return;
    }

    // ✅ PAS de limit, mais avec where sur updatedAt récent
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);  // 30 jours
    
    const unsubscribe = this.db
      .collection('chats').doc(chatId).collection('messages')
      .where('updatedAt', '>', cutoff)
      .onSnapshot(snap => {
        if (!snap.docChanges().length || this.isSyncing) return;
        
        const changes = snap.docChanges();
        
        const msgsToInject = changes
          .filter(c => c.type === 'added' || c.type === 'modified')
          .map(c => ({ id: c.doc.id, ...c.doc.data() }));
        
        const msgsToRemove = changes
          .filter(c => c.type === 'removed')
          .map(c => c.doc.id);
        
        if (msgsToInject.length > 0) {
          this.mergeIntoLocal(chatId, msgsToInject).catch(e => {
            this.logger.log('error', 'Failed to merge messages', e);
          });
        }

        if (msgsToRemove.length > 0) {
          this.removeFromLocal(chatId, msgsToRemove).catch(e => {
            this.logger.log('error', 'Failed to remove messages', e);
          });
        }
      }, error => {
        this.logger.log('error', `Listener error for ${chatId}`, error);
      });

    this.listeners.push({ chatId, unsubscribe });
    this.logger.log('info', `Listener attached for ${chatId}`);
  }

  // ✅ FIX: Queue avec Promise au lieu de busy-wait
  async mergeIntoLocal(chatId, msgs) {
    // Si une merge est en cours, attendre qu'elle finisse
    if (this.mergeQueue.has(chatId)) {
      await this.mergeQueue.get(chatId);
    }
    
    // Créer une nouvelle Promise pour cette merge
    let resolveQueue;
    const queuePromise = new Promise(r => { resolveQueue = r; });
    this.mergeQueue.set(chatId, queuePromise);

    try {
      const idb = await this.getIndexedDB();
      
      return await new Promise((resolve, reject) => {
        const tx = idb.transaction(['keyval'], 'readwrite');
        
        // ✅ FIX: Timeout adaptatif (100ms par message, min 5s, max 30s)
        const timeoutMs = Math.max(5000, Math.min(30000, msgs.length * 100));
        const txTimeout = setTimeout(() => {
          tx.abort();
          reject(new Error('Transaction timeout'));
        }, timeoutMs);
        
        const st = tx.objectStore('keyval');
        const req = st.get(chatId);
        
        req.onsuccess = () => {
          clearTimeout(txTimeout);
          
          const chat = req.result || { 
            id: chatId.replace(/^CHAT_/, ''),
            messages: [], 
            updatedAt: 0 
          };
          
          const existingById = new Map(
            chat.messages.filter(m => m.id).map(m => [m.id, m])
          );
          
          const existingByFingerprint = new Map(
            chat.messages.map(m => {
              const fp = FirebaseService.messageFingerprint(m);
              return [fp, m];
            })
          );
          
          let addedCount = 0;
          let updatedCount = 0;
          
          msgs.forEach(m => {
            if (m.id && existingById.has(m.id)) {
              const existing = existingById.get(m.id);
              if ((m.updatedAt || 0) > (existing.updatedAt || 0)) {
                Object.assign(existing, m);
                updatedCount++;
              }
              return;
            }
            
            const fp = FirebaseService.messageFingerprint(m);
            
            if (existingByFingerprint.has(fp)) {
              const existing = existingByFingerprint.get(fp);
              if (m.id && !existing.id) {
                existing.id = m.id;
                updatedCount++;
              }
              return;
            }
            
            chat.messages.push(m);
            addedCount++;
          });

          chat.messages.sort((a, b) => {
            const timeDiff = (a.createdAt || 0) - (b.createdAt || 0);
            if (timeDiff !== 0) return timeDiff;
            return (a.id || '').localeCompare(b.id || '');
          });
          
          const seen = new Set();
          chat.messages = chat.messages.filter(m => {
            if (m.id && seen.has(m.id)) return false;
            if (m.id) seen.add(m.id);
            return true;
          });

          chat.updatedAt = Date.now();
          
          const putReq = st.put(chat, chatId);
          putReq.onsuccess = () => {
            if (addedCount > 0 || updatedCount > 0) {
              this.logger.log('info', `Merged into ${chatId}: +${addedCount} new, ~${updatedCount} updated`);
            }
            resolve();
          };
          putReq.onerror = () => {
            clearTimeout(txTimeout);
            reject(putReq.error);
          };
        };
        
        req.onerror = () => {
          clearTimeout(txTimeout);
          reject(req.error);
        };
      });
    } finally {
      this.mergeQueue.delete(chatId);
      resolveQueue();
    }
  }

  async removeFromLocal(chatId, msgIds) {
    const idb = await this.getIndexedDB();
    
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(['keyval'], 'readwrite');
      const st = tx.objectStore('keyval');
      const req = st.get(chatId);
      
      req.onsuccess = () => {
        const chat = req.result;
        if (!chat) {
          resolve();
          return;
        }
        
        const idsToRemove = new Set(msgIds);
        const before = chat.messages.length;
        chat.messages = chat.messages.filter(m => !idsToRemove.has(m.id));
        const removed = before - chat.messages.length;
        
        if (removed > 0) {
          chat.updatedAt = Date.now();
          const putReq = st.put(chat, chatId);
          putReq.onsuccess = () => {
            this.logger.log('info', `Removed ${removed} messages from ${chatId}`);
            resolve();
          };
          putReq.onerror = () => reject(putReq.error);
        } else {
          resolve();
        }
      };
      
      req.onerror = () => reject(req.error);
    });
  }

  // ✅ FIX: Fingerprint avec counter pour messages vides identiques
  static messageFingerprint(msg) {
    const content = (msg.content || '').trim();
    const role = msg.role || 'unknown';
    const timestamp = msg.createdAt || 0;
    
    if (!content) {
      if (msg.id) return `empty_withid_${msg.id}`;
      // ✅ Utiliser timestamp + role + un hash du message complet
      const msgStr = JSON.stringify(msg);
      let hash = 5381;
      for (let i = 0; i < msgStr.length; i++) {
        hash = ((hash << 5) + hash) + msgStr.charCodeAt(i);
      }
      return `empty_${role}_${timestamp}_${Math.abs(hash).toString(36)}`;
    }
    
    const str = `${role}::${content}::${timestamp}`;
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    
    let hash2 = 0;
    for (let i = 0; i < str.length; i++) {
      hash2 = str.charCodeAt(i) + ((hash2 << 5) - hash2);
    }
    
    return `${Math.abs(hash).toString(36)}_${Math.abs(hash2).toString(36)}`;
  }

  async getIndexedDB() {
    // ✅ FIX: Tester avec readyState au lieu de transaction
    if (this.dbInstance && this.dbInstance.readyState !== 'closed') {
      return this.dbInstance;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store');
      
      request.onsuccess = () => {
        this.dbInstance = request.result;
        
        this.dbInstance.onversionchange = () => {
          this.dbInstance.close();
          this.dbInstance = null;
          this.logger.log('warning', 'IndexedDB version changed, closed');
        };
        
        this.dbInstance.onclose = () => {
          this.dbInstance = null;
          this.logger.log('warning', 'IndexedDB closed');
        };
        
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };
      
      request.onblocked = () => {
        this.logger.log('warning', 'IndexedDB blocked');
      };
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
      this.lastSyncTime = 0;  // ✅ FIX: Debounce auto-sync
    }
    
    async initialize() {
      this.logger.log('start', 'Initializing Firebase Sync');
      await this.waitForDOM();
      this.insertSyncButton();

      if (this.config.isConfigured()) {
        try {
          await this.firebase.initialize();
          await this.firebase.pushLocalChats();
          
          const idb = await this.firebase.getIndexedDB();
          const tx = idb.transaction(['keyval'], 'readonly');
          const store = tx.objectStore('keyval');
          
          await new Promise((resolve) => {
            store.getAllKeys().onsuccess = (e) => {
              const keys = e.target.result.filter(k => 
                typeof k === 'string' && k.startsWith('CHAT_')
              );
              this.logger.log('info', `Attaching listeners to ${keys.length} chats`);
              keys.forEach(chatId => this.firebase.attachListener(chatId));
              resolve();
            };
          });
          
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
          
          <div class="mt-4 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
            <div class="flex items-center justify-between mb-2 cursor-pointer" id="firebase-config-header">
              <label class="block text-sm font-medium text-zinc-300">Firebase Configuration</label>
              <svg id="firebase-config-chevron" class="w-4 h-4 text-zinc-400 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
            <div id="firebase-config-content" class="space-y-2 hidden">
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

          <div class="flex justify-between mt-4 gap-2">
            <button id="save-settings" class="px-3 py-1.5 bg-blue-600 rounded text-sm hover:bg-blue-700">Save & Verify</button>
            <div class="flex gap-2">
              <button id="sync-now" class="px-3 py-1.5 bg-green-600 rounded text-sm hover:bg-green-700" ${this.config.isConfigured() ? '' : 'disabled'}>Sync Now</button>
              <button id="close-modal" class="px-3 py-1.5 bg-red-600 rounded text-sm hover:bg-red-700">Close</button>
            </div>
          </div>
          
          <div id="action-msg" class="text-center text-zinc-400 mt-3"></div>
          
          <div class="text-center mt-4 pt-3 text-xs text-zinc-500 border-t border-zinc-700">
            <span>Firebase Cloud Sync v1.2 for TypingMind</span>
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

      const header = modal.querySelector('#firebase-config-header');
      const content = modal.querySelector('#firebase-config-content');
      const chevron = modal.querySelector('#firebase-config-chevron');
      
      let isAnimating = false;
      header.addEventListener('click', () => {
        if (isAnimating) return;
        isAnimating = true;
        
        const isHidden = content.classList.contains('hidden');
        content.classList.toggle('hidden');
        chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0)';
        
        setTimeout(() => { isAnimating = false; }, 300);
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
        apiKey: get('#fb-apiKey'),
        authDomain: get('#fb-authDomain'),
        projectId: get('#fb-projectId'),
        storageBucket: get('#fb-storageBucket'),
        syncInterval: get('#fb-syncInterval'),
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
        }
      } catch (e) {
        alert('Firebase init failed : ' + e.message);
        return;
      }

      const syncBtn = modal.querySelector('#sync-now');
      const actionMsg = modal.querySelector('#action-msg');
      const original = syncBtn.textContent;
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing…';
      this.updateSyncStatus('syncing');

      try {
        await this.firebase.pushLocalChats();
        actionMsg.textContent = '✅ Sync completed!';
        actionMsg.style.color = '#22c55e';
        this.updateSyncStatus('success');
        this.lastSyncTime = Date.now();
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
    
    // ✅ FIX: Debounce auto-sync
    startAutoSync() {
      if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
      const interval = Math.max(this.config.get('syncInterval') * 1000, 15000);
      
      this.autoSyncInterval = setInterval(async () => {
        // Skip si sync en cours ou dernière sync trop récente
        const timeSinceLastSync = Date.now() - this.lastSyncTime;
        if (this.firebase.isSyncing || timeSinceLastSync < interval) {
          this.logger.log('info', 'Auto-sync skipped (too soon or in progress)');
          return;
        }
        
        this.logger.log('info', 'Auto-sync triggered');
        this.updateSyncStatus('syncing');
        try {
          await this.firebase.pushLocalChats();
          this.updateSyncStatus('success');
          this.lastSyncTime = Date.now();
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
