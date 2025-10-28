/*──────────────────────────────────────────────────────────────
  TypingMind – Firebase Cloud-Sync V1.0 (Oct-2025)
  + Custom localStorage Keys Sync with Smart Bidirectional Sync
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
        notificationsEnabled: true,
      };
      const stored = {};
      const keyMap = {
        apiKey: 'tcs_fb_apiKey',
        authDomain: 'tcs_fb_authDomain',
        projectId: 'tcs_fb_projectId',
        storageBucket: 'tcs_fb_storageBucket',
        syncInterval: 'tcs_fb_syncInterval',
        workspaceId: 'tcs_fb_workspaceId',
        notificationsEnabled: 'tcs_fb_notificationsEnabled',
      };
      Object.keys(defaults).forEach(key => {
        const val = localStorage.getItem(keyMap[key]);
        if (val !== null) {
          if (key === 'syncInterval') {
            stored[key] = parseInt(val) || 60;
          } else if (key === 'notificationsEnabled') {
            stored[key] = val === 'true';
          } else {
            stored[key] = val;
          }
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
        notificationsEnabled: 'tcs_fb_notificationsEnabled',
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
    
    getSelectedSyncKeys() {
      try {
        const stored = localStorage.getItem('tcs_fb_selectedSyncKeys');
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    
    saveSelectedSyncKeys(keys) {
      localStorage.setItem('tcs_fb_selectedSyncKeys', JSON.stringify(keys));
    }
    
    getAvailableKeys() {
      const excludePatterns = [
        'tcs_fb_',           // Extension's own keys
        'firestore_',        // Firestore internal keys
        'referrer',          // Browser internal
      ];
      
      return Object.keys(localStorage)
        .filter(key => !excludePatterns.some(pattern => key.includes(pattern)))
        .sort();
    }
    
    categorizeKeys(keys) {
      const categories = {
        'Settings': [],
        'UI Preferences': [],
        'Data Management': [],
        'Models & AI': [],
        'Plugins & Extensions': [],
        'Budget & Usage': [],
        'Sync & Migration': [],
        'Other': []
      };
      
      keys.forEach(key => {
        if (key.includes('Default') || key.includes('Settings')) {
          categories['Settings'].push(key);
        } else if (key.includes('Font') || key.includes('Theme') || key.includes('Layout') || key.includes('Expanded')) {
          categories['UI Preferences'].push(key);
        } else if (key.includes('Folder') || key.includes('Character') || key.includes('Deleted') || key.includes('Pinned')) {
          categories['Data Management'].push(key);
        } else if (key.includes('Model') || key.includes('Reasoning') || key.includes('Token') || key.includes('Safety')) {
          categories['Models & AI'].push(key);
        } else if (key.includes('Plugin') || key.includes('Extension')) {
          categories['Plugins & Extensions'].push(key);
        } else if (key.includes('budget') || key.includes('Budget') || key.includes('Usage') || key.includes('Cost')) {
          categories['Budget & Usage'].push(key);
        } else if (key.includes('Sync') || key.includes('MIGRATE') || key.includes('LAST_VERSION')) {
          categories['Sync & Migration'].push(key);
        } else {
          categories['Other'].push(key);
        }
      });
      
      Object.keys(categories).forEach(cat => {
        if (categories[cat].length === 0) {
          delete categories[cat];
        }
      });
      
      return categories;
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
    constructor(config, logger, cloudSyncApp = null) {
      this.config = config;
      this.logger = logger;
      this.cloudSyncApp = cloudSyncApp;
      this.app = null;
      this.db = null;
      this.deviceId = this.getDeviceId();
      this.userId = null;
      this.sdkLoaded = false;
      this.isSyncing = false;
      this.lastSyncTimestamps = {};
      this.lastFolderSyncTimestamps = {};
      this.lastCustomKeysSync = {};
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

    async syncCustomKeys() {
      const selectedKeys = this.config.getSelectedSyncKeys();
      if (selectedKeys.length === 0) {
        this.logger.log('info', 'No custom keys selected for sync');
        return;
      }

      this.logger.log('start', `Syncing ${selectedKeys.length} custom keys...`);

      try {
        const remoteValues = await this.getRemoteValues(selectedKeys);
        
        const toUpload = [];
        const toDownload = [];
        const unchanged = [];
        
        selectedKeys.forEach(key => {
          const localValue = localStorage.getItem(key);
          const remote = remoteValues.get(key);
          
          if (!remote) {
            this.logger.log('info', `🆕 ${key}: Not in Firebase, will upload`);
            toUpload.push(key);
          } else if (localValue !== remote.value) {
            const lastSync = this.lastCustomKeysSync[key] || 0;
            
            this.logger.log('info', `🔄 ${key}: Values differ`);
            this.logger.log('info', `   Local:  "${localValue?.substring(0, 50)}"`);
            this.logger.log('info', `   Remote: "${remote.value?.substring(0, 50)}"`);
            this.logger.log('info', `   Last sync: ${new Date(lastSync).toISOString()}`);
            this.logger.log('info', `   Remote updated: ${new Date(remote.updatedAt).toISOString()}`);
            
            if (lastSync >= remote.updatedAt) {
              this.logger.log('success', `   📤 Local is newer, will upload`);
              toUpload.push(key);
            } else {
              this.logger.log('success', `   📥 Remote is newer, will download`);
              toDownload.push(key);
            }
          } else {
            this.logger.log('info', `✅ ${key}: Already in sync`);
            unchanged.push(key);
            this.lastCustomKeysSync[key] = remote.updatedAt;
          }
        });
        
        this.logger.log('info', `📊 Analysis: ${toUpload.length} upload, ${toDownload.length} download, ${unchanged.length} unchanged`);
        
        if (toUpload.length > 0) {
          await this.uploadSpecificKeys(toUpload);
        }
        
        if (toDownload.length > 0) {
          await this.downloadSpecificKeys(toDownload, remoteValues);
        }
        
        this.saveCustomKeysSyncTimestamps();
        
        this.logger.log('success', 'Custom keys sync complete');
      } catch (error) {
        this.logger.log('error', 'Custom keys sync failed', error.message);
        throw error;
      }
    }

    async getRemoteValues(keys) {
      const workspaceId = this.config.get('workspaceId');
      const remoteValues = new Map();
      
      this.logger.log('info', `🔍 Fetching remote values for ${keys.length} keys...`);
      
      for (let i = 0; i < keys.length; i += 10) {
        const chunk = keys.slice(i, Math.min(i + 10, keys.length));
        
        try {
          const snapshot = await this.db
            .collection('workspaces')
            .doc(workspaceId)
            .collection('customKeys')
            .where('key', 'in', chunk)
            .get();

          snapshot.docs.forEach(doc => {
            const data = doc.data();
            remoteValues.set(data.key, {
              value: data.value,
              updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0,
              lastDevice: data.lastDevice
            });
          });
        } catch (error) {
          this.logger.log('error', `Failed to fetch chunk: ${error.message}`);
        }
      }
      
      this.logger.log('info', `📥 Found ${remoteValues.size}/${keys.length} keys in Firebase`);
      return remoteValues;
    }

    async uploadSpecificKeys(keys) {
      const workspaceId = this.config.get('workspaceId');
      const batch = this.db.batch();
      let uploadCount = 0;
      
      this.logger.log('info', `📤 Uploading ${keys.length} keys...`);
      
      keys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value === null) {
          this.logger.log('warning', `⏭️  ${key}: Not in localStorage`);
          return;
        }
        
        const preview = value.length > 50 ? value.substring(0, 50) + '...' : value;
        this.logger.log('success', `📤 ${key}: "${preview}"`);
        
        const docRef = this.db
          .collection('workspaces')
          .doc(workspaceId)
          .collection('customKeys')
          .doc(key);

        batch.set(docRef, {
          key: key,
          value: value,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastDevice: this.deviceId
        }, { merge: true });
        
        uploadCount++;
      });
      
      if (uploadCount > 0) {
        await batch.commit();
        this.logger.log('success', `✅ Uploaded ${uploadCount} keys`);
        
        const now = Date.now();
        keys.forEach(key => {
          this.lastCustomKeysSync[key] = now;
        });
      }
    }

    async downloadSpecificKeys(keys, remoteValues) {
      let mergedCount = 0;
      
      this.logger.log('info', `📥 Downloading ${keys.length} keys...`);
      
      keys.forEach(key => {
        const remote = remoteValues.get(key);
        if (!remote) {
          this.logger.log('warning', `⏭️  ${key}: Not in remoteValues map`);
          return;
        }
        
        try {
          const preview = remote.value.length > 50 ? remote.value.substring(0, 50) + '...' : remote.value;
          
          localStorage.setItem(key, remote.value);
          this.lastCustomKeysSync[key] = remote.updatedAt;
          mergedCount++;
          
          this.logger.log('success', `📥 ${key}: "${preview}"`);
        } catch (error) {
          this.logger.log('error', `❌ ${key}: ${error.message}`);
        }
      });
      
      if (mergedCount > 0) {
        this.logger.log('success', `✅ Downloaded ${mergedCount} keys`);
        
        if (this.cloudSyncApp) {
          this.cloudSyncApp.showSyncNotification(mergedCount, 'keys-synced');
          
          setTimeout(() => {
            this.cloudSyncApp.triggerSoftRefresh();
          }, 500);
        }
      }
    }

    saveCustomKeysSyncTimestamps() {
      try {
        localStorage.setItem('tcs_fb_lastCustomKeysSync', JSON.stringify(this.lastCustomKeysSync));
      } catch (e) {
        this.logger.log('warning', 'Failed to save custom keys sync timestamps');
      }
    }

    loadCustomKeysSyncTimestamps() {
      try {
        const stored = localStorage.getItem('tcs_fb_lastCustomKeysSync');
        if (stored) {
          this.lastCustomKeysSync = JSON.parse(stored);
        }
      } catch (e) {
        this.lastCustomKeysSync = {};
      }
    }

    async syncAllChats() {
      if (this.isSyncing) {
        this.logger.log('warning', 'Already syncing');
        return;
      }

      this.isSyncing = true;
      this.logger.log('start', 'Smart sync with folders, threads, multi-models & custom keys...');

      try {
        await this.syncCustomKeys();

        this.logger.log('info', '📁 Syncing folders...');
        
        const remoteDeletedFolderIds = await this.downloadDeletedFolderIds();
        this.logger.log('info', `Remote folder deletions: ${remoteDeletedFolderIds.length}`);

        const localFolders = this.getAllLocalFolders();
        const localFolderIds = localFolders.map(f => f.id);
        this.logger.log('info', `Local folders: ${localFolders.length}`);

        for (const folder of localFolders) {
          if (!remoteDeletedFolderIds.includes(folder.id)) {
            const needsUpload = this.folderNeedsUpload(folder);
            if (needsUpload) {
              try {
                await this.uploadFolder(folder);
                this.lastFolderSyncTimestamps[folder.id] = Date.now();
              } catch (error) {
                this.logger.log('error', `Folder upload failed: ${folder.id}`, error.message);
              }
            }
          }
        }

        const remoteFolders = await this.downloadAllFolders();
        this.logger.log('info', `Remote folders: ${remoteFolders.length}`);
        
        let foldersCreated = 0;
        let foldersUpdated = 0;
        for (const remoteFolder of remoteFolders) {
          try {
            const result = this.mergeRemoteFolder(remoteFolder);
            if (result === 'created') foldersCreated++;
            if (result === 'updated') foldersUpdated++;
          } catch (error) {
            this.logger.log('error', `Folder merge failed: ${remoteFolder.id}`, error.message);
          }
        }

        if (foldersCreated > 0) {
          this.logger.log('success', `Created ${foldersCreated} folders`);
        }
        if (foldersUpdated > 0) {
          this.logger.log('success', `Updated ${foldersUpdated} folders`);
        }

        const foldersToDeleteLocally = localFolderIds.filter(id => 
          remoteDeletedFolderIds.includes(id)
        );

        if (foldersToDeleteLocally.length > 0) {
          this.logger.log('warning', `Deleting ${foldersToDeleteLocally.length} folders locally`);
          for (const folderId of foldersToDeleteLocally) {
            try {
              this.deleteLocalFolder(folderId);
            } catch (error) {
              this.logger.log('error', `Failed to delete folder ${folderId}`, error.message);
            }
          }
        }

        const remoteDeletedIds = await this.downloadDeletedChatIds();
        this.logger.log('info', `Remote chat deletions: ${remoteDeletedIds.length}`);

        for (const deletedId of remoteDeletedIds) {
          if (!this.isChatDeleted(deletedId)) {
            this.markChatAsDeleted(deletedId);
          }
        }

        const localChats = await this.getAllLocalChats();
        const localChatIds = localChats.map(c => c.id);
        this.logger.log('info', `Local chats: ${localChats.length}`);

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

          if (this.cloudSyncApp) {
            this.cloudSyncApp.showSyncNotification(toDeleteLocally.length, 'deleted');
            setTimeout(() => {
              this.cloudSyncApp.triggerSoftRefresh();
            }, 500);
          }
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
          const chatUpdatedMs = typeof chatUpdated === 'string' ? Date.parse(chatUpdated) : 
                                chatUpdated instanceof Date ? chatUpdated.getTime() : chatUpdated;
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
        this.logger.log('info', `Remote chats: ${remoteChats.length}`);

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
          
          if (this.cloudSyncApp) {
            this.cloudSyncApp.showSyncNotification(mergedCount, 'synced');
            setTimeout(() => {
              this.cloudSyncApp.triggerSoftRefresh();
            }, 500);
          }
        }

        this.logger.log('success', 'SYNC COMPLETE');
        this.saveFolderSyncTimestamps();

      } catch (error) {
        this.logger.log('error', 'Sync failed', error);
        throw error;
      } finally {
        this.isSyncing = false;
      }
    }

    folderNeedsUpload(folder) {
      const lastSync = this.lastFolderSyncTimestamps[folder.id] || 0;
      const folderUpdated = folder.data.updatedAt || 0;
      const folderUpdatedMs = typeof folderUpdated === 'string' ? Date.parse(folderUpdated) : 
                              folderUpdated instanceof Date ? folderUpdated.getTime() : folderUpdated;
      return folderUpdatedMs > lastSync;
    }

    saveLastSyncTimestamps() {
      try {
        localStorage.setItem('tcs_fb_lastSyncTimestamps', JSON.stringify(this.lastSyncTimestamps));
      } catch (e) {
        this.logger.log('warning', 'Failed to save sync timestamps');
      }
    }

    saveFolderSyncTimestamps() {
      try {
        localStorage.setItem('tcs_fb_lastFolderSyncTimestamps', JSON.stringify(this.lastFolderSyncTimestamps));
      } catch (e) {
        this.logger.log('warning', 'Failed to save folder sync timestamps');
      }
    }

    loadFolderSyncTimestamps() {
      try {
        const stored = localStorage.getItem('tcs_fb_lastFolderSyncTimestamps');
        if (stored) {
          this.lastFolderSyncTimestamps = JSON.parse(stored);
        }
      } catch (e) {
        this.lastFolderSyncTimestamps = {};
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

    getAllLocalFolders() {
      try {
        const folderListStr = localStorage.getItem('TM_useFolderList');
        if (!folderListStr) return [];
        
        const folderList = JSON.parse(folderListStr);
        if (!Array.isArray(folderList)) return [];
        
        return folderList.map(folder => ({
          id: folder.id,
          data: folder
        }));
      } catch (error) {
        this.logger.log('error', 'Failed to get local folders', error.message);
        return [];
      }
    }

    async uploadFolder(folder) {
      const workspaceId = this.config.get('workspaceId');
      
      const docRef = this.db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('folders')
        .doc(folder.id);
      
      const data = {
        id: folder.id,
        title: folder.data.title || folder.data.name || 'Unnamed Folder',
        color: folder.data.color || null,
        open: folder.data.open || false,
        new: folder.data.new || false,
        order: folder.data.order ?? 0,
        createdAt: folder.data.createdAt ? this.validateTimestamp(folder.data.createdAt) : firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deletedAt: folder.data.deletedAt || null,
        syncedAt: folder.data.syncedAt || null,
        lastDevice: this.deviceId,
      };

      this.logger.log('info', `Upload folder [${folder.id}]: ${data.title} (order:${data.order})`);
      
      await docRef.set(data);
    }

    async downloadAllFolders() {
      const workspaceId = this.config.get('workspaceId');
      
      const snapshot = await this.db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('folders')
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        
        return {
          id: doc.id,
          title: data.title || 'Unnamed Folder',
          color: data.color || null,
          open: data.open || false,
          new: data.new || false,
          order: data.order ?? 0,
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
          updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now(),
          deletedAt: data.deletedAt,
          syncedAt: data.syncedAt,
          lastDevice: data.lastDevice
        };
      });
    }

    mergeRemoteFolder(remoteFolder) {
      try {
        const folderListStr = localStorage.getItem('TM_useFolderList');
        let folderList = folderListStr ? JSON.parse(folderListStr) : [];
        
        if (!Array.isArray(folderList)) {
          folderList = [];
        }
        
        const existingIndex = folderList.findIndex(f => f.id === remoteFolder.id);
        
        if (existingIndex === -1) {
          const newFolder = {
            id: remoteFolder.id,
            title: remoteFolder.title,
            color: remoteFolder.color || null,
            open: remoteFolder.open || false,
            new: false,
            order: remoteFolder.order ?? 0,
            createdAt: new Date(remoteFolder.createdAt).toISOString(),
            updatedAt: new Date(remoteFolder.updatedAt).toISOString(),
            deletedAt: remoteFolder.deletedAt || null,
            syncedAt: new Date().toISOString(),
          };
          
          folderList.push(newFolder);
          folderList.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          localStorage.setItem('TM_useFolderList', JSON.stringify(folderList));
          
          this.logger.log('info', `Created folder [${remoteFolder.id}]: ${remoteFolder.title}`);
          return 'created';
        } else {
          const localFolder = folderList[existingIndex];
          const localUpdatedAt = localFolder.updatedAt ? Date.parse(localFolder.updatedAt) : 0;
          const remoteUpdatedAt = remoteFolder.updatedAt || 0;
          
          if (remoteUpdatedAt > localUpdatedAt && remoteFolder.lastDevice !== this.deviceId) {
            folderList[existingIndex] = {
              ...localFolder,
              title: remoteFolder.title,
              color: remoteFolder.color || null,
              open: remoteFolder.open || false,
              order: remoteFolder.order ?? localFolder.order ?? 0,
              updatedAt: new Date(remoteFolder.updatedAt).toISOString(),
              syncedAt: new Date().toISOString(),
            };
            
            folderList.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            localStorage.setItem('TM_useFolderList', JSON.stringify(folderList));
            this.lastFolderSyncTimestamps[remoteFolder.id] = Date.now();
            
            this.logger.log('info', `Updated folder [${remoteFolder.id}]: ${remoteFolder.title}`);
            return 'updated';
          } else {
            return 'skipped';
          }
        }
      } catch (error) {
        this.logger.log('error', 'Failed to merge folder', error.message);
        return 'error';
      }
    }

    async deleteRemoteFolder(folderId) {
      const workspaceId = this.config.get('workspaceId');
      const batch = this.db.batch();
      
      const folderRef = this.db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('folders')
        .doc(folderId);
      
      batch.delete(folderRef);
      
      const deletionRef = this.db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('folder_deletions')
        .doc(folderId);
      
      batch.set(deletionRef, {
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deletedBy: this.deviceId
      });
      
      await batch.commit();
      
      this.logger.log('info', `Deleted folder from Firebase + tombstone: ${folderId}`);
    }

    deleteLocalFolder(folderId) {
      try {
        const folderListStr = localStorage.getItem('TM_useFolderList');
        let folderList = folderListStr ? JSON.parse(folderListStr) : [];
        
        if (!Array.isArray(folderList)) return;
        
        const newFolderList = folderList.filter(f => f.id !== folderId);
        localStorage.setItem('TM_useFolderList', JSON.stringify(newFolderList));
        
        this.logger.log('info', `Deleted folder locally: ${folderId}`);
      } catch (error) {
        this.logger.log('error', 'Failed to delete folder locally', error.message);
      }
    }

    async downloadDeletedFolderIds() {
      const workspaceId = this.config.get('workspaceId');
      
      try {
        const snapshot = await this.db
          .collection('workspaces')
          .doc(workspaceId)
          .collection('folder_deletions')
          .get();
        
        return snapshot.docs.map(doc => doc.id);
      } catch (error) {
        this.logger.log('error', 'Failed to download folder tombstones', error.message);
        return [];
      }
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
      
      const selectedMultimodelIDs = Array.isArray(chat.data.selectedMultimodelIDs) 
        ? chat.data.selectedMultimodelIDs 
        : [];
      
      const data = {
        id: chat.id,
        chatID: chat.data.chatID || chat.id,
        chatTitle: String(title).slice(0, 500),
        model: chat.data.model || null,
        modelTitle: modelTitle,
        modelInfo: chat.data.modelInfo || null,
        selectedMultimodelIDs: selectedMultimodelIDs,
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
      const multiModelInfo = selectedMultimodelIDs.length > 1 ? `multi:${selectedMultimodelIDs.length}` : '';

      this.logger.log('info', `Upload [${chat.id}]: ${messages.length}msgs, ${tokensInfo}, ${folderInfo} ${multiModelInfo}`);
      
      await docRef.set(data);
    }

    sanitizeMessages(messages, chatId) {
      if (!Array.isArray(messages)) {
        this.logger.log('warning', `${chatId}: messages not array`);
        return [];
      }
      
      const cleanUndefined = (obj) => {
        if (obj === undefined) return null;
        if (obj === null) return null;
        if (typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(cleanUndefined);
        
        const cleaned = {};
        Object.keys(obj).forEach(key => {
          const value = obj[key];
          if (value !== undefined) {
            cleaned[key] = cleanUndefined(value);
          }
        });
        return cleaned;
      };
      
      return messages
        .filter((m, idx) => {
          if (!m || typeof m !== 'object') {
            this.logger.log('warning', `${chatId}: Invalid msg ${idx}`);
            return false;
          }
          
          if (m.role === 'assistant' || m._reasoning_start || m.model) {
            if (m._reasoning_start && !m._reasoning_finish) {
              this.logger.log('warning', `${chatId}: Skip streaming msg ${idx} (thinking incomplete)`);
              return false;
            }
            
            const contentLength = typeof m.content === 'string' ? m.content.length : 0;
            const createdAt = m.createdAt ? new Date(m.createdAt).getTime() : 0;
            const now = Date.now();
            const ageSeconds = (now - createdAt) / 1000;
            
            if (ageSeconds < 10 && contentLength < 50) {
              this.logger.log('warning', `${chatId}: Skip potential streaming msg ${idx} (${contentLength} chars, ${ageSeconds.toFixed(0)}s old)`);
              return false;
            }
          }
          
          return true;
        })
        .map((m, idx) => {
          try {
            if (m.type === 'tm_multi_responses') {
              const clean = {
                type: 'tm_multi_responses',
                uuid: m.uuid || null,
                createdAt: this.validateTimestamp(m.createdAt, `${chatId}.msg[${idx}].createdAt`).toMillis(),
                responses: Array.isArray(m.responses) ? m.responses.map((resp, respIdx) => {
                  const lastMessage = Array.isArray(resp.messages) && resp.messages.length > 0 
                    ? resp.messages[resp.messages.length - 1] 
                    : null;
                  
                  const responseData = {
                    id: resp.id || null,  
                    model: resp.model || null,
                  };
                  
                  if (!lastMessage) {
                    responseData.message = {
                      role: 'assistant',
                      content: '',
                      uuid: null,
                      usage: null,
                      createdAt: Date.now(),
                      refusal: null,
                      citations: null,
                    };
                  } else {
                    let messageContent;
                    if (typeof lastMessage.content === 'string') {
                      messageContent = lastMessage.content;
                    } else if (Array.isArray(lastMessage.content)) {
                      messageContent = lastMessage.content; 
                    } else {
                      messageContent = '';
                    }
                    
                    responseData.message = {
                      role: lastMessage.role || 'assistant',
                      content: messageContent, 
                      uuid: lastMessage.uuid || null,
                      usage: lastMessage.usage || null,
                      createdAt: lastMessage.createdAt 
                        ? this.validateTimestamp(lastMessage.createdAt, `${chatId}.msg[${idx}].resp[${respIdx}].createdAt`).toMillis() 
                        : Date.now(),
                      refusal: lastMessage.refusal || null,
                      citations: lastMessage.citations || null,
                      reasoning_content: lastMessage.reasoning_content || null,
                      reasoning_summary: lastMessage.reasoning_summary || null,
                      reasoning_details: lastMessage.reasoning_details || null,
                      _reasoning_start: lastMessage._reasoning_start || null,
                      _reasoning_finish: lastMessage._reasoning_finish || null,
                      reasoning: lastMessage.reasoning || null,
                      finish: lastMessage.finish || null,
                      _contentType: typeof lastMessage.content === 'string' ? 'string' : 'array',
                    };
                  }
                  
                  return cleanUndefined(responseData);
                }) : []
              };
              return cleanUndefined(clean);
            }

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
            if (m.updatedAt) clean.updatedAt = this.validateTimestamp(m.updatedAt, `${chatId}.msg[${idx}].updatedAt`).toMillis();
            
            if (m.threads && Array.isArray(m.threads) && m.threads.length > 0) {
              clean.threads = m.threads.map((thread, threadIdx) => {
                const cleanThread = {
                  createdAt: thread.createdAt ? this.validateTimestamp(thread.createdAt, `${chatId}.msg[${idx}].thread[${threadIdx}].createdAt`).toMillis() : Date.now(),
                  userMessageContent: thread.userMessageContent || null,
                  messages: Array.isArray(thread.messages) ? thread.messages.map((tm, tmIdx) => {
                    let threadMsgContent = '';
                    if (typeof tm.content === 'string') {
                      threadMsgContent = tm.content;
                    } else if (Array.isArray(tm.content)) {
                      threadMsgContent = tm.content
                        .filter(part => part && part.type === 'text' && part.text)
                        .map(part => part.text)
                        .join('\n');
                    } else {
                      threadMsgContent = JSON.stringify(tm.content || '');
                    }
                    
                    return cleanUndefined({
                      role: tm.role || 'user',
                      content: String(threadMsgContent).slice(0, 100000),
                      uuid: tm.uuid || null,
                      model: tm.model || null,
                      usage: tm.usage || null,
                      refusal: tm.refusal || null,
                      citations: tm.citations || null,
                      createdAt: tm.createdAt ? this.validateTimestamp(tm.createdAt, `${chatId}.msg[${idx}].thread[${threadIdx}].msg[${tmIdx}].createdAt`).toMillis() : Date.now(),
                    });
                  }) : []
                };
                return cleanUndefined(cleanThread);
              });
              this.logger.log('info', `${chatId}.msg[${idx}]: ${clean.threads.length} edit thread(s)`);
            }
            
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
            
            return cleanUndefined(clean);
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
            : (localChat.updatedAt instanceof Date ? localChat.updatedAt.getTime() : localChat.updatedAt || 0);
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
      if (m.type === 'tm_multi_responses') {
        return {
          type: 'tm_multi_responses',
          uuid: m.uuid || null,
          createdAt: new Date(m.createdAt).toISOString(),
          responses: Array.isArray(m.responses) ? m.responses.map(resp => {
            let msg;
            let respId;
            let respModel;
            
            if (resp.message) {
              msg = resp.message;
              respId = resp.id;
              respModel = resp.model;
            } else if (resp.id && resp.messages) {
              return resp;
            } else {
              msg = resp;
              respId = null;
              respModel = resp.model;
            }
            
            let messageContent;
            if (msg._contentType === 'string') {
              messageContent = msg.content || '';
            } else if (msg._contentType === 'array') {
              messageContent = msg.content || [];
            } else {
              if (typeof msg.content === 'string') {
                messageContent = msg.content;
              } else if (Array.isArray(msg.content)) {
                messageContent = msg.content;
              } else {
                messageContent = '';
              }
            }
            
            const message = {
              content: messageContent,
              role: msg.role || 'assistant',
              uuid: msg.uuid || null,
              model: respModel || msg.model || null,
              usage: msg.usage || null,
              createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
              refusal: msg.refusal || null,
              citations: msg.citations || null,
            };
            
            if (msg.reasoning_content) message.reasoning_content = msg.reasoning_content;
            if (msg.reasoning_summary) message.reasoning_summary = msg.reasoning_summary;
            if (msg.reasoning_details) message.reasoning_details = msg.reasoning_details;
            if (msg._reasoning_start) message._reasoning_start = msg._reasoning_start;
            if (msg._reasoning_finish) message._reasoning_finish = msg._reasoning_finish;
            if (msg.reasoning !== undefined) message.reasoning = msg.reasoning;
            if (msg.finish) message.finish = msg.finish;
            
            return {
              id: respId || null,
              model: respModel || null,
              messages: messageContent || msg.reasoning_content ? [message] : []
            };
          }) : []
        };
      }

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
      if (m.updatedAt) reconstructed.updatedAt = new Date(m.updatedAt).toISOString();
      
      if (m.threads && Array.isArray(m.threads) && m.threads.length > 0) {
        reconstructed.threads = m.threads.map(thread => {
          const threadMessages = Array.isArray(thread.messages) ? thread.messages : [];
          
          const hasUserMessage = threadMessages.some(tm => tm.role === 'user');
          let finalMessages = [...threadMessages];
          
          if (!hasUserMessage && thread.userMessageContent) {
            const userMsg = {
              role: 'user',
              content: thread.userMessageContent,
              createdAt: thread.createdAt,
              uuid: null
            };
            finalMessages.unshift(userMsg);
          }
          
          return {
            createdAt: new Date(thread.createdAt).toISOString(),
            userMessageContent: thread.userMessageContent || null,
            messages: finalMessages.map(tm => {
              let tmRole = tm.role;
              if (!tmRole || tmRole === 'undefined') {
                if (tm.model || tm.usage) {
                  tmRole = 'assistant';
                } else {
                  tmRole = 'user';
                }
              }
              
              let tmContent;
              if (typeof tm.content === 'string') {
                tmContent = tm.content;
              } else if (Array.isArray(tm.content)) {
                tmContent = tm.content;
              } else {
                tmContent = String(tm.content || '');
              }
              
              return {
                role: tmRole, 
                content: tmContent,
                uuid: tm.uuid || null,
                model: tm.model || null,
                usage: tm.usage || null,
                createdAt: tm.createdAt ? new Date(tm.createdAt).toISOString() : new Date().toISOString(),
              };
            })
          };
        });
      }

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
      this.firebase = new FirebaseService(this.config, this.logger, this);
      this.autoSyncInterval = null;
      this.countdownInterval = null;
      this.nextSyncTime = null;
      this.setupAutoRefresh();
    }
    
    setupAutoRefresh() {
      window.addEventListener('tm-sync-refresh', (e) => {
        const count = e.detail.chatIds.length;
        const action = e.detail.action || 'synced';
        
        this.logger.log('success', `Refreshing UI for ${count} ${action} chats`);
        
        this.showSyncNotification(count, action);
        
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

    showSyncNotification(count, action = 'synced') {
      if (!this.config.get('notificationsEnabled')) {
        this.logger.log('info', `Notifications disabled, skipping (${count} ${action})`);
        return;
      }

      const existingNotif = document.querySelector('.tm-sync-notification');
      if (existingNotif) existingNotif.remove();

      const notif = document.createElement('div');
      notif.className = 'tm-sync-notification';
      
      let bgColor, icon, text;
      
      if (action === 'deleted') {
        bgColor = '#ef4444';
        icon = '🗑️';
        text = `${count} chat${count > 1 ? 's' : ''} deleted`;
      } else if (action === 'keys-synced') {
        bgColor = '#8b5cf6';
        icon = '🔑';
        text = `${count} setting${count > 1 ? 's' : ''} synced`;
      } else {
        bgColor = '#22c55e';
        icon = '✓';
        text = `${count} chat${count > 1 ? 's' : ''} synced`;
      }
      
      notif.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${bgColor};
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
      notif.textContent = `${icon} ${text}`;
      
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
      this.logger.log('start', 'Firebase Sync V1.2 (Smart Bidirectional Custom Keys)');
      await this.waitForDOM();
      this.insertSyncButton();

      if (this.config.isConfigured()) {
        try {
          this.firebase.loadLastSyncTimestamps();
          this.firebase.loadFolderSyncTimestamps();
          this.firebase.loadCustomKeysSyncTimestamps();
          
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
    
    updateCountdownDisplay() {
      const countdownEl = document.getElementById('sync-countdown');
      if (!countdownEl || !this.nextSyncTime) return;

      const now = Date.now();
      const remaining = Math.max(0, this.nextSyncTime - now);
      
      if (remaining === 0) {
        countdownEl.textContent = 'Syncing...';
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      
      countdownEl.textContent = `Next sync in ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    startCountdown() {
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
      }

      this.countdownInterval = setInterval(() => {
        this.updateCountdownDisplay();
      }, 1000);

      this.updateCountdownDisplay();
    }

    stopCountdown() {
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    }
    
    createModal() {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      
      const modal = document.createElement('div');
      modal.className = 'cloud-sync-modal';
      modal.style.cssText = 'width:100%;max-width:40rem;background:#27272a;color:#fff;border-radius:0.5rem;padding:1.5rem;border:1px solid rgba(255,255,255,0.1);max-height:90vh;overflow-y:auto;';
      
      const selectedKeys = this.config.getSelectedSyncKeys();
      const availableKeys = this.config.getAvailableKeys();
      const categories = this.config.categorizeKeys(availableKeys);
      
      modal.innerHTML = `
        <div class="text-white text-sm">
          <h3 class="text-center text-xl font-bold mb-4">Firebase Sync V1.2</h3>
          
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
              <label class="block text-xs text-zinc-400 mb-1">Auto-sync interval (minutes)</label>
              <input id="fb-syncInterval" type="number" min="1" style="width:100%;padding:8px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff" value="${this.config.get('syncInterval')/60}">
            </div>
            
            <div class="pt-3 border-t border-zinc-700">
              <label class="flex items-center gap-3 cursor-pointer">
                <input id="fb-notifications" type="checkbox" ${this.config.get('notificationsEnabled') ? 'checked' : ''} class="w-5 h-5 rounded border-zinc-600 bg-zinc-700 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer">
                <span class="text-sm">Enable sync notifications</span>
              </label>
              <p class="text-xs text-zinc-500 mt-1 ml-8">Show popup when chats are synced or deleted</p>
            </div>

            <!-- CUSTOM KEYS SECTION -->
            <div class="pt-3 border-t border-zinc-700">
              <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-semibold">Custom Keys to Sync</label>
                <span class="text-xs text-zinc-400" id="selected-count">${selectedKeys.length} selected</span>
              </div>
              
              <div class="mb-2 flex gap-2">
                <input 
                  id="keys-search" 
                  type="text" 
                  placeholder="Search keys..." 
                  style="flex:1;padding:6px;background:#3f3f46;border:1px solid #52525b;border-radius:4px;color:#fff;font-size:12px"
                >
                <button id="select-all-keys" class="px-3 py-1 bg-zinc-700 rounded hover:bg-zinc-600 text-xs">Select All</button>
                <button id="deselect-all-keys" class="px-3 py-1 bg-zinc-700 rounded hover:bg-zinc-600 text-xs">Deselect All</button>
              </div>
              
              <div id="sync-keys-container" class="max-h-60 overflow-y-auto bg-zinc-900/50 rounded p-2" style="border:1px solid #52525b">
                ${this.renderKeysCategories(categories, selectedKeys)}
              </div>
            </div>

            <div id="countdown-container" class="bg-zinc-800/50 rounded p-3 text-center" style="display:${this.nextSyncTime ? 'block' : 'none'}">
              <div id="sync-countdown" class="text-sm text-zinc-300 font-mono"></div>
            </div>
          </div>

          <div class="flex gap-2 mb-3">
            <button id="save-settings" class="flex-1 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors">Save</button>
            <button id="sync-now" class="flex-1 px-4 py-2 bg-green-600 rounded hover:bg-green-700 transition-colors" ${this.config.isConfigured() ? '' : 'disabled'}>Sync Now</button>
            <button id="close-modal" class="px-4 py-2 bg-zinc-700 rounded hover:bg-zinc-600 transition-colors">Close</button>
          </div>
          
          <div id="action-msg" class="text-center text-sm text-zinc-400"></div>
          
          <div class="text-center mt-4 pt-3 text-xs text-zinc-500 border-t border-zinc-700">
            V1.2 - Device: ${this.firebase.deviceId.substr(0, 15)}... - Add ?log=true for debug
          </div>
        </div>`;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      this.setupKeysListeners(modal, categories, selectedKeys);

      if (this.nextSyncTime) {
        this.startCountdown();
      }
      
      overlay.addEventListener('click', (e) => { 
        if (e.target === overlay) {
          this.stopCountdown();
          overlay.remove();
        }
      });
      
      modal.querySelector('#close-modal').addEventListener('click', () => {
        this.stopCountdown();
        overlay.remove();
      });
      modal.querySelector('#save-settings').addEventListener('click', () => this.saveSettings(modal, overlay));
      modal.querySelector('#sync-now').addEventListener('click', () => this.handleSyncNow(modal));
    }
    
    renderKeysCategories(categories, selectedKeys) {
      let html = '';
      
      Object.entries(categories).forEach(([category, keys]) => {
        const safeCategoryId = category.replace(/[^a-zA-Z0-9]/g, '-');
        
        html += `
          <div class="mb-3">
            <div class="flex items-center gap-2 mb-1 pb-1 border-b border-zinc-700">
              <input 
                type="checkbox" 
                id="cat-${safeCategoryId}" 
                class="category-checkbox w-4 h-4 rounded"
                data-category="${category}"
              >
              <label for="cat-${safeCategoryId}" class="text-xs font-semibold text-zinc-300 cursor-pointer">
                ${category} (${keys.length})
              </label>
            </div>
            <div class="ml-6 space-y-1">
              ${keys.map(key => `
                <label class="flex items-center gap-2 cursor-pointer hover:bg-zinc-800/50 p-1 rounded">
                  <input 
                    type="checkbox" 
                    class="key-checkbox w-4 h-4 rounded" 
                    data-key="${key}"
                    data-category="${category}"
                    ${selectedKeys.includes(key) ? 'checked' : ''}
                  >
                  <span class="text-xs font-mono text-zinc-400">${key}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `;
      });
      
      return html || '<p class="text-xs text-zinc-500 p-2">No keys found</p>';
    }
    
    setupKeysListeners(modal, categories, selectedKeys) {
      const container = modal.querySelector('#sync-keys-container');
      const searchInput = modal.querySelector('#keys-search');
      const selectAllBtn = modal.querySelector('#select-all-keys');
      const deselectAllBtn = modal.querySelector('#deselect-all-keys');
      const selectedCountEl = modal.querySelector('#selected-count');
      
      const updateCategoryCheckboxes = () => {
        Object.keys(categories).forEach(category => {
          const safeCategoryId = category.replace(/[^a-zA-Z0-9]/g, '-');
          const catCheckbox = modal.querySelector(`#cat-${safeCategoryId}`);
          if (!catCheckbox) return;
          
          const keyCheckboxes = modal.querySelectorAll(`.key-checkbox[data-category="${category}"]`);
          const checkedCount = Array.from(keyCheckboxes).filter(cb => cb.checked).length;
          
          catCheckbox.checked = checkedCount > 0;
          catCheckbox.indeterminate = checkedCount > 0 && checkedCount < keyCheckboxes.length;
        });
      };
      
      const updateSelectedCount = () => {
        const checked = modal.querySelectorAll('.key-checkbox:checked').length;
        selectedCountEl.textContent = `${checked} selected`;
      };
      
      container.addEventListener('change', (e) => {
        if (e.target.classList.contains('key-checkbox')) {
          updateCategoryCheckboxes();
          updateSelectedCount();
        }
      });
      
      container.addEventListener('change', (e) => {
        if (e.target.classList.contains('category-checkbox')) {
          const category = e.target.dataset.category;
          const checked = e.target.checked;
          const keyCheckboxes = modal.querySelectorAll(`.key-checkbox[data-category="${category}"]`);
          
          keyCheckboxes.forEach(cb => {
            cb.checked = checked;
          });
          
          updateSelectedCount();
        }
      });
      
      searchInput.addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const allLabels = container.querySelectorAll('label[class*="flex items-center"]');
        
        allLabels.forEach(label => {
          const text = label.textContent.toLowerCase();
          const shouldShow = text.includes(search);
          label.style.display = shouldShow ? 'flex' : 'none';
        });
        
        const categoryDivs = container.querySelectorAll('.mb-3');
        categoryDivs.forEach(div => {
          const visibleKeys = div.querySelectorAll('label[style="display: flex;"], label:not([style])');
          div.style.display = visibleKeys.length > 0 ? 'block' : 'none';
        });
      });
      
      selectAllBtn.addEventListener('click', () => {
        const visibleCheckboxes = Array.from(modal.querySelectorAll('.key-checkbox'))
          .filter(cb => cb.closest('label').style.display !== 'none');
        visibleCheckboxes.forEach(cb => cb.checked = true);
        updateCategoryCheckboxes();
        updateSelectedCount();
      });
      
      deselectAllBtn.addEventListener('click', () => {
        const visibleCheckboxes = Array.from(modal.querySelectorAll('.key-checkbox'))
          .filter(cb => cb.closest('label').style.display !== 'none');
        visibleCheckboxes.forEach(cb => cb.checked = false);
        updateCategoryCheckboxes();
        updateSelectedCount();
      });
      
      updateCategoryCheckboxes();
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
        notificationsEnabled: modal.querySelector('#fb-notifications').checked,
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

      const selectedKeys = Array.from(modal.querySelectorAll('.key-checkbox:checked'))
        .map(cb => cb.dataset.key);
      this.config.saveSelectedSyncKeys(selectedKeys);

      Object.keys(newConfig).forEach(k => this.config.set(k, newConfig[k]));
      this.config.save();

      actionMsg.textContent = 'Saved! Reloading...';
      actionMsg.style.color = '#22c55e';
      
      this.stopCountdown();
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
        
        this.nextSyncTime = Date.now() + (this.config.get('syncInterval') * 1000);
        this.updateCountdownDisplay();
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
      
      this.nextSyncTime = Date.now() + intervalMs;
      
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

        this.nextSyncTime = Date.now() + intervalMs;
      }, intervalMs);
      
      this.logger.log('success', `Auto-sync every ${intervalMs/1000}s`);
    }
  }

  const app = new CloudSyncApp();
  app.initialize();
  window.cloudSyncApp = app;
}