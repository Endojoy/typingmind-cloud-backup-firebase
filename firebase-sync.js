/*──────────────────────────────────────────────────────────────
  TypingMind – Firebase Cloud-Sync v3.7 FINAL (Oct-2025)
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
        workspaceId: '',
      };
      const stored = {};
      const keyMap = {
        apiKey: 'tcs_fb_apiKey',
        authDomain: 'tcs_fb_authDomain',
        projectId: 'tcs_fb_projectId',
        storageBucket: 'tcs_fb_storageBucket',
        syncInterval: 'tcs_fb_syncInterval',
        workspaceId: 'tcs_fb_workspaceId',
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
        workspaceId: 'tcs_fb_workspaceId',
      };
      Object.keys(this.config).forEach(key => {
        const storageKey = keyMap[key];
        if (storageKey) {
          localStorage.setItem(storageKey, this.config[key]?.toString() || '');
        }
      });
    }
    isConfigured() {
      return !!(
        this.config.apiKey && 
        this.config.authDomain &&
        this.config.projectId && 
        this.config.storageBucket &&
        this.config.workspaceId
      );
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
     FIREBASE SERVICE
  ============================================================ */
  class FirebaseService {
    constructor(config, logger) {
      this.config = config;
      this.logger = logger;
      this.app = null;
      this.db = null;
      this.deviceId = this.getDeviceId();
      this.userId = null;
      this.sdkLoaded = false;
      this.isSyncing = false;
      this.lastSyncTimestamps = {};
    }

    getDeviceId() {
      let id = localStorage.getItem('tcs_fb_deviceId');
      if (!id) {
        id = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('tcs_fb_deviceId', id);
      }
      return id;
    }

    getDeletedChats() {
      try {
        const stored = localStorage.getItem('tcs_fb_deletedChats');
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }

    markChatAsDeleted(chatId) {
      const deleted = this.getDeletedChats();
      if (!deleted.includes(chatId)) {
        deleted.push(chatId);
        localStorage.setItem('tcs_fb_deletedChats', JSON.stringify(deleted));
        this.logger.log('info', `Marked as deleted: ${chatId}`);
      }
    }

    isChatDeleted(chatId) {
      return this.getDeletedChats().includes(chatId);
    }

    async downloadDeletedChatIds() {
      const workspaceId = this.config.get('workspaceId');
      
      try {
        const snapshot = await this.db
          .collection('workspaces')
          .doc(workspaceId)
          .collection('deletions')
          .get();
        
        return snapshot.docs.map(doc => doc.id);
      } catch (error) {
        this.logger.log('error', 'Failed to download tombstones', error.message);
        return [];
      }
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
        try {
          this.logger.log('info', 'Anonymous sign-in...');
          const result = await firebase.auth().signInAnonymously();
          this.userId = result.user.uid;
          this.logger.log('success', `Signed in: ${this.userId.substr(0, 8)}...`);
        } catch (error) {
          if (error.code === 'auth/operation-not-allowed') {
            throw new Error('⚠️ Enable Anonymous auth in Firebase Console');
          }
          if (error.code === 'auth/api-not-enabled' || error.message.includes('identity-toolkit-api')) {
            throw new Error('⏳ Firebase API not ready. Wait 10min or clear cache (Ctrl+Shift+R)');
          }
          throw error;
        }
      } else {
        this.userId = firebase.auth().currentUser.uid;
        this.logger.log('info', `Already signed in: ${this.userId.substr(0, 8)}...`);
      }

      if (!this.db) {
        this.db = firebase.firestore();
        try {
          await this.db.enablePersistence({ synchronizeTabs: true });
        } catch {}
      }

      this.logger.log('success', `Device: ${this.deviceId.substr(0, 15)}...`);
      this.logger.log('success', `Workspace: ${this.config.get('workspaceId')}`);
    }

    validateTimestamp(value, fieldName = 'timestamp') {
      if (value && typeof value.toMillis === 'function') {
        try {
          const millis = value.toMillis();
          if (this.isValidMillis(millis)) return value;
        } catch (e) {}
      }

      if (typeof value === 'number' && this.isValidMillis(value)) {
        return firebase.firestore.Timestamp.fromMillis(value);
      }

      if (value instanceof Date) {
        const time = value.getTime();
        if (this.isValidMillis(time)) {
          return firebase.firestore.Timestamp.fromDate(value);
        }
      }

      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!isNaN(parsed) && this.isValidMillis(parsed)) {
          return firebase.firestore.Timestamp.fromMillis(parsed);
        }
      }

      this.logger.log('warning', `Invalid ${fieldName}, using now`);
      return firebase.firestore.Timestamp.now();
    }

    isValidMillis(millis) {
      const MIN_MILLIS = -30610224000000;
      const MAX_MILLIS = 253402300799999;
      return (
        typeof millis === 'number' &&
        isFinite(millis) &&
        !isNaN(millis) &&
        millis >= MIN_MILLIS &&
        millis <= MAX_MILLIS
      );
    }

    async syncAllChats() {
      if (this.isSyncing) {
        this.logger.log('warning', 'Already syncing');
        return;
      }

      this.isSyncing = true;
      this.logger.log('start', 'Smart sync with deletion tracking...');

      try {
        const remoteDeletedIds = await this.downloadDeletedChatIds();
        this.logger.log('info', `Remote deletions: ${remoteDeletedIds.length}`);

        for (const deletedId of remoteDeletedIds) {
          if (!this.isChatDeleted(deletedId)) {
            this.markChatAsDeleted(deletedId);
          }
        }

        const localChats = await this.getAllLocalChats();
        const localChatIds = localChats.map(c => c.id);
        this.logger.log('info', `Local: ${localChats.length} chats`);

        const lastKnownIds = this.getLastKnownChatIds();
        const deletedLocally = lastKnownIds.filter(id => 
          !localChatIds.includes(id) && !this.isChatDeleted(id)
        );

        if (deletedLocally.length > 0) {
          this.logger.log('warning', `Detected ${deletedLocally.length} locally deleted chats`);
          
          for (const chatId of deletedLocally) {
            try {
              await this.deleteRemoteChat(chatId);
              this.markChatAsDeleted(chatId);
              this.logger.log('success', `Deleted from Firebase: ${chatId}`);
            } catch (error) {
              this.logger.log('error', `Failed to delete ${chatId}`, error.message);
            }
          }
        }

        const toDeleteLocally = localChatIds.filter(id => 
          remoteDeletedIds.includes(id)
        );

        if (toDeleteLocally.length > 0) {
          this.logger.log('warning', `Remote deleted (tombstones): ${toDeleteLocally.length} chats`);
          
          for (const chatId of toDeleteLocally) {
            try {
              await this.deleteLocalChat(chatId);
              this.logger.log('success', `Deleted locally: ${chatId}`);
            } catch (error) {
              this.logger.log('error', `Failed to delete locally ${chatId}`, error.message);
            }
          }

          const updatedLocalChats = await this.getAllLocalChats();
          localChats.length = 0;
          localChats.push(...updatedLocalChats);
        }

        const currentLocalIds = localChats.map(c => c.id);
        this.saveLastKnownChatIds(currentLocalIds);

        const chatsToUpload = localChats.filter(chat => {
          if (remoteDeletedIds.includes(chat.id)) {
            this.logger.log('warning', `Skip chat with tombstone: ${chat.id}`);
            this.markChatAsDeleted(chat.id);
            return false;
          }
          
          if (this.isChatDeleted(chat.id)) {
            this.logger.log('warning', `Skip deleted chat: ${chat.id}`);
            return false;
          }
          
          const lastSync = this.lastSyncTimestamps[chat.id] || 0;
          const chatUpdated = chat.data.updatedAt || 0;
          const chatUpdatedMs = typeof chatUpdated === 'string' ? Date.parse(chatUpdated) : chatUpdated;
          return chatUpdatedMs > lastSync;
        });

        this.logger.log('info', `To upload: ${chatsToUpload.length} chats`);

        let uploadedCount = 0;
        for (const chat of chatsToUpload) {
          try {
            await this.uploadChat(chat);
            this.lastSyncTimestamps[chat.id] = Date.now();
            uploadedCount++;
          } catch (error) {
            this.logger.log('error', `Upload failed: ${chat.id}`, error.message);
          }
        }

        if (uploadedCount > 0) {
          this.logger.log('success', `Uploaded ${uploadedCount} chats`);
          this.saveLastSyncTimestamps();
        }

        const remoteChats = await this.downloadAllChats();
        this.logger.log('info', `Remote: ${remoteChats.length} chats`);

        let mergedCount = 0;
        const mergedChatIds = [];
        
        for (const remoteChat of remoteChats) {
          if (this.isChatDeleted(remoteChat.id)) {
            this.logger.log('warning', `Skip merging deleted chat: ${remoteChat.id}`);
            continue;
          }

          try {
            const wasMerged = await this.mergeRemoteChat(remoteChat);
            if (wasMerged) {
              mergedCount++;
              mergedChatIds.push(remoteChat.id);
            }
          } catch (error) {
            this.logger.log('error', `Merge failed: ${remoteChat.id}`, error.message);
          }
        }

        if (mergedCount > 0) {
          this.logger.log('success', `Merged ${mergedCount} chats`);
          
          if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('tm-sync-refresh', { 
              detail: { chatIds: mergedChatIds } 
            }));
          }
        }

        this.logger.log('success', 'SYNC COMPLETE');

      } catch (error) {
        this.logger.log('error', 'Sync failed', error);
        throw error;
      } finally {
        this.isSyncing = false;
      }
    }

    saveLastSyncTimestamps() {
      try {
        localStorage.setItem('tcs_fb_lastSyncTimestamps', JSON.stringify(this.lastSyncTimestamps));
      } catch (e) {
        this.logger.log('warning', 'Failed to save sync timestamps');
      }
    }

    getLastKnownChatIds() {
      try {
        const stored = localStorage.getItem('tcs_fb_lastKnownChatIds');
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }

    saveLastKnownChatIds(chatIds) {
      try {
        localStorage.setItem('tcs_fb_lastKnownChatIds', JSON.stringify(chatIds));
      } catch (e) {
        this.logger.log('warning', 'Failed to save known chat IDs');
      }
    }

    async deleteRemoteChat(chatId) {
      const workspaceId = this.config.get('workspaceId');
      const batch = this.db.batch();
      
      const chatRef = this.db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('chats')
        .doc(chatId);
      
      batch.delete(chatRef);
      
      const deletionRef = this.db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('deletions')
        .doc(chatId);
      
      batch.set(deletionRef, {
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deletedBy: this.deviceId
      });
      
      await batch.commit();
      
      this.logger.log('info', `Deleted from Firebase + tombstone: ${chatId}`);
    }

    async deleteLocalChat(chatId) {
      const chatKey = `CHAT_${chatId}`;
      const idb = await this.getIndexedDB();

      return new Promise((resolve, reject) => {
        const tx = idb.transaction(['keyval'], 'readwrite');
        const store = tx.objectStore('keyval');
        
        const deleteReq = store.delete(chatKey);
        
        deleteReq.onsuccess = () => {
          this.logger.log('info', `Deleted locally: ${chatId}`);
          resolve();
        };
        
        deleteReq.onerror = reject;
      });
    }

    loadLastSyncTimestamps() {
      try {
        const stored = localStorage.getItem('tcs_fb_lastSyncTimestamps');
        if (stored) {
          this.lastSyncTimestamps = JSON.parse(stored);
        }
      } catch (e) {
        this.lastSyncTimestamps = {};
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
      const workspaceId = this.config.get('workspaceId');
      
      const docRef = this.db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('chats')
        .doc(chat.id);
      
      const createdAtValue = chat.data.createdAt;
      const updatedAtValue = chat.data.updatedAt;
      
      const createdAt = this.validateTimestamp(createdAtValue, `${chat.id}.createdAt`);
      const updatedAt = this.validateTimestamp(updatedAtValue, `${chat.id}.updatedAt`);
      
      const messages = this.sanitizeMessages(chat.data.messages || [], chat.id);

      const title = chat.data.chatTitle || chat.data.title || chat.data.name || 'New Chat';
      const modelTitle = chat.data.modelInfo?.title || null;
      
      const folderID = chat.data.folderID || chat.data.folderId || null;
      
      const data = {
        id: chat.id,
        chatID: chat.data.chatID || chat.id,
        chatTitle: String(title).slice(0, 500),
        model: chat.data.model || null,
        modelTitle: modelTitle,
        modelInfo: chat.data.modelInfo || null,
        selectedMultimodelIDs: chat.data.selectedMultimodelIDs || [],
        folderID: folderID,
        chatParams: chat.data.chatParams || null,
        character: chat.data.character || null,
        linkedPlugins: chat.data.linkedPlugins || [],
        tokenUsage: chat.data.tokenUsage || null,
        messages: messages,
        createdAt: createdAt,
        updatedAt: updatedAt,
        syncedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastDevice: this.deviceId,
      };

      const tokensInfo = chat.data.tokenUsage 
        ? `${chat.data.tokenUsage.totalTokens || 0}t $${(chat.data.tokenUsage.totalCostUSD || 0).toFixed(4)}`
        : 'no-usage';
      
      const folderInfo = folderID ? `folder:${folderID}` : 'no-folder';

      this.logger.log('info', `Upload [${chat.id}]: ${messages.length}msgs, ${tokensInfo}, ${folderInfo}`);
      
      await docRef.set(data);
    }

    sanitizeMessages(messages, chatId) {
      if (!Array.isArray(messages)) {
        this.logger.log('warning', `${chatId}: messages not array`);
        return [];
      }
      
      return messages
        .filter((m, idx) => {
          if (!m || typeof m !== 'object') {
            this.logger.log('warning', `${chatId}: Invalid msg ${idx}`);
            return false;
          }
          return true;
        })
        .map((m, idx) => {
          try {
            let textContent = '';
            
            if (typeof m.content === 'string') {
              textContent = m.content;
            } else if (Array.isArray(m.content)) {
              textContent = m.content
                .filter(part => part && part.type === 'text' && part.text)
                .map(part => part.text)
                .join('\n');
            } else if (m.content && typeof m.content === 'object') {
              if (m.content.text) textContent = m.content.text;
              else if (m.content.content) textContent = m.content.content;
              else textContent = JSON.stringify(m.content);
            }

            let messageRole = 'user';
            if (m.role && m.role !== 'undefined') {
              messageRole = String(m.role);
            } else if (m._reasoning_start || m.reasoning_content) {
              messageRole = 'assistant';
            } else if (m.model || m.usage) {
              messageRole = 'assistant';
            }

            const clean = {
              role: messageRole.slice(0, 50),
              content: String(textContent).slice(0, 100000),
              createdAt: this.validateTimestamp(m.createdAt, `${chatId}.msg[${idx}].createdAt`).toMillis()
            };
            
            if (m.uuid) clean.uuid = String(m.uuid).slice(0, 100);
            if (m.model) clean.model = String(m.model).slice(0, 100);
            if (m.usage) clean.usage = m.usage;
            
            if (m.reasoning_content) clean.reasoning_content = String(m.reasoning_content).slice(0, 100000);
            if (m.reasoning_summary) clean.reasoning_summary = m.reasoning_summary;
            if (m.reasoning_details) clean.reasoning_details = m.reasoning_details;
            if (m._reasoning_start) clean._reasoning_start = m._reasoning_start;
            if (m._reasoning_finish) clean._reasoning_finish = m._reasoning_finish;
            
            if (typeof m.content === 'string') {
              clean._contentType = 'string';
            } else if (Array.isArray(m.content)) {
              clean._contentType = 'array';
              clean._originalContent = m.content;
            }
            
            return clean;
          } catch (error) {
            this.logger.log('error', `${chatId}: Failed msg ${idx}`, error.message);
            return {
              role: 'user',
              content: '[Error parsing message]',
              createdAt: Date.now()
            };
          }
        });
    }


    async downloadAllChats() {
      const workspaceId = this.config.get('workspaceId');
      
      const snapshot = await this.db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('chats')
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        
        const createdAtMillis = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
        const updatedAtMillis = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now();
        
        return {
          id: doc.id,
          chatID: data.chatID || doc.id,
          chatTitle: data.chatTitle || 'New Chat',
          model: data.model || null,
          modelTitle: data.modelTitle || null,
          modelInfo: data.modelInfo || null,
          selectedMultimodelIDs: data.selectedMultimodelIDs || [],
          folderID: data.folderID || null,
          chatParams: data.chatParams || null,
          character: data.character || null,
          linkedPlugins: data.linkedPlugins || [],
          tokenUsage: data.tokenUsage || null,
          messages: Array.isArray(data.messages) ? data.messages : [],
          createdAt: this.isValidMillis(createdAtMillis) ? createdAtMillis : Date.now(),
          updatedAt: this.isValidMillis(updatedAtMillis) ? updatedAtMillis : Date.now(),
          lastDevice: data.lastDevice
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
              chatID: remoteChat.chatID || remoteChat.id,
              chatTitle: remoteChat.chatTitle,
              model: remoteChat.model,
              modelInfo: remoteChat.modelInfo,
              selectedMultimodelIDs: remoteChat.selectedMultimodelIDs || [],
              folderID: remoteChat.folderID,
              chatParams: remoteChat.chatParams,
              character: remoteChat.character,
              linkedPlugins: remoteChat.linkedPlugins || [],
              tokenUsage: remoteChat.tokenUsage,
              messages: remoteChat.messages.map(m => this.reconstructMessage(m)),
              createdAt: new Date(remoteChat.createdAt).toISOString(),
              updatedAt: new Date(remoteChat.updatedAt).toISOString(),
              syncedAt: Date.now()
            };
            
            store.put(newChat, chatKey).onsuccess = () => {
              this.logger.log('info', `Created [${remoteChat.id}]: folder:${remoteChat.folderID || 'none'}`);
              this.lastSyncTimestamps[remoteChat.id] = Date.now();
              resolve(true);
            };
            return;
          }

          const localTime = typeof localChat.updatedAt === 'string' 
            ? Date.parse(localChat.updatedAt) 
            : (localChat.updatedAt || 0);
          const remoteTime = remoteChat.updatedAt || 0;

          if (remoteTime > localTime && remoteChat.lastDevice !== this.deviceId) {
            localChat.chatTitle = remoteChat.chatTitle;
            if (remoteChat.model) localChat.model = remoteChat.model;
            if (remoteChat.modelInfo) localChat.modelInfo = remoteChat.modelInfo;
            if (remoteChat.selectedMultimodelIDs) localChat.selectedMultimodelIDs = remoteChat.selectedMultimodelIDs;
            if (remoteChat.folderID !== undefined) localChat.folderID = remoteChat.folderID;
            if (remoteChat.chatParams) localChat.chatParams = remoteChat.chatParams;
            if (remoteChat.character !== undefined) localChat.character = remoteChat.character;
            if (remoteChat.linkedPlugins) localChat.linkedPlugins = remoteChat.linkedPlugins;
            if (remoteChat.tokenUsage) localChat.tokenUsage = remoteChat.tokenUsage;
            
            localChat.messages = remoteChat.messages.map(m => this.reconstructMessage(m));
            
            localChat.updatedAt = new Date(remoteChat.updatedAt).toISOString();
            localChat.syncedAt = Date.now();
            
            store.put(localChat, chatKey).onsuccess = () => {
              this.logger.log('info', `Updated [${remoteChat.id}]: folder:${remoteChat.folderID || 'none'}`);
              this.lastSyncTimestamps[remoteChat.id] = Date.now();
              resolve(true);
            };
          } else {
            this.logger.log('info', `Skip [${remoteChat.id}]`);
            resolve(false);
          }
        };

        getReq.onerror = reject;
      });
    }

    reconstructMessage(m) {
      let messageRole = m.role || 'user';
      if (messageRole === 'undefined' || !messageRole) {
        if (m._reasoning_start || m.reasoning_content || m.model || m.usage) {
          messageRole = 'assistant';
        } else {
          messageRole = 'user';
        }
      }

      const reconstructed = {
        role: messageRole,
        createdAt: new Date(m.createdAt).toISOString(),
      };

      if (m._contentType === 'string') {
        reconstructed.content = m.content;
      } else if (m._contentType === 'array' && m._originalContent) {
        reconstructed.content = m._originalContent;
      } else if (typeof m.content === 'string') {
        reconstructed.content = [{type: 'text', text: m.content}];
      } else {
        reconstructed.content = m.content;
      }

      if (m.uuid) reconstructed.uuid = m.uuid;
      if (m.model) reconstructed.model = m.model;
      if (m.usage) reconstructed.usage = m.usage;

      if (m.reasoning_content) reconstructed.reasoning_content = m.reasoning_content;
      if (m.reasoning_summary) reconstructed.reasoning_summary = m.reasoning_summary;
      if (m.reasoning_details) reconstructed.reasoning_details = m.reasoning_details;
      if (m._reasoning_start) reconstructed._reasoning_start = m._reasoning_start;
      if (m._reasoning_finish) reconstructed._reasoning_finish = m._reasoning_finish;

      return reconstructed;
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
      this.setupAutoRefresh();
    }
    
    setupAutoRefresh() {
      window.addEventListener('tm-sync-refresh', (e) => {
        const count = e.detail.chatIds.length;
        this.logger.log('success', `Refreshing UI for ${count} synced chats`);
        
        this.showSyncNotification(count);
        
        setTimeout(() => {
          this.triggerSoftRefresh();
        }, 500);
      });
    }

    triggerSoftRefresh() {
      try {
        document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
        window.dispatchEvent(new Event('focus'));
        this.logger.log('success', 'Soft refresh triggered');
      } catch (e) {
        this.logger.log('error', 'Soft refresh failed', e.message);
      }
    }

    showSyncNotification(count) {
      const existingNotif = document.querySelector('.tm-sync-notification');
      if (existingNotif) existingNotif.remove();

      const notif = document.createElement('div');
      notif.className = 'tm-sync-notification';
      notif.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #22c55e;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;
      notif.textContent = `✓ ${count} chat${count > 1 ? 's' : ''} synced`;
      
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(400px); opacity: 0; }
        }
      `;
      if (!document.querySelector('style[data-tm-sync]')) {
        style.setAttribute('data-tm-sync', 'true');
        document.head.appendChild(style);
      }
      
      document.body.appendChild(notif);
      
      setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notif.remove(), 300);
      }, 3000);
    }
    
    async initialize() {
      this.logger.log('start', 'Firebase Sync v3.7 FINAL');
      await this.waitForDOM();
      this.insertSyncButton();

      if (this.config.isConfigured()) {
        try {
          this.firebase.loadLastSyncTimestamps();
          
          await this.firebase.initialize();
          this.updateSyncStatus('success');
          
          try {
            await this.firebase.syncAllChats();
          } catch (e) {
            this.logger.log('error', 'Initial sync failed', e.message);
          }
          
          this.startAutoSync();
          
        } catch (e) {
          this.logger.log('error', 'Init failed', e);
          this.updateSyncStatus('error');
          
          if (e.message.includes('Enable Anonymous') || e.message.includes('Firebase API not ready')) {
            alert(e.message);
          }
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
          <h3 class="text-center text-xl font-bold mb-4">Firebase Sync v3.7</h3>
          
          <div class="bg-blue-900/30 border border-blue-700 rounded p-3 mb-4 text-xs">
            <strong>Setup:</strong><br>
            1. Enable <strong>Anonymous</strong> auth in Firebase Console<br>
            &nbsp;&nbsp;&nbsp;→ Authentication → Sign-in method → Anonymous<br>
            2. Choose a <strong>Workspace ID</strong> (ex: my-workspace)<br>
            3. Use <strong>SAME Workspace ID</strong> on all devices<br>
            <br>
            Each device = separate anonymous account<br>
            All devices share the same workspace
          </div>
          
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
            
            <div class="pt-3 border-t border-zinc-700">
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Workspace ID (same on all devices)</label>
                <input id="fb-workspaceId" placeholder="my-workspace" style="width:100%;padding:8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff" value="${this.config.get('workspaceId')}">
                <p class="text-xs text-zinc-500 mt-1">Share this ID with your other devices</p>
              </div>
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
            v3.7 FINAL - Device: ${this.firebase.deviceId.substr(0, 15)}... - Add ?log=true for debug
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
        workspaceId: get('#fb-workspaceId'),
        syncInterval: parseInt(get('#fb-syncInterval')) * 60,
      };

      if (!newConfig.apiKey || !newConfig.authDomain || !newConfig.projectId || !newConfig.storageBucket) {
        actionMsg.textContent = 'Fill all Firebase fields';
        actionMsg.style.color = '#ef4444';
        return;
      }

      if (!newConfig.workspaceId) {
        actionMsg.textContent = 'Workspace ID required';
        actionMsg.style.color = '#ef4444';
        return;
      }

      Object.keys(newConfig).forEach(k => this.config.set(k, newConfig[k]));
      this.config.save();

      actionMsg.textContent = 'Saved! Reloading...';
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
        actionMsg.textContent = 'Sync complete!';
        actionMsg.style.color = '#22c55e';
        this.updateSyncStatus('success');
      } catch (e) {
        actionMsg.textContent = e.message;
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
        
        this.logger.log('info', 'Auto-sync...');
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
