# TypingMind Firebase Cloud Sync

A powerful browser extension for **TypingMind** that enables real-time cloud synchronization across multiple devices using **Firebase Firestore**.

[![Version](https://img.shields.io/badge/version-1.5-blue.svg)](https://github.com/Endojoy/typingmind-cloud-backup-firebase)
[![License](https://camo.githubusercontent.com/18a59883b89ed6ee32c4afc2c93f81e65ec844d96f708b1499eb234a796889b6/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f4c6963656e73652d434325323042592d2d4e432d2d5341253230342e302d677265656e)](LICENSE)

## 🌟 Features

### Current Features (v1.5)

- **🔄 Real-time Synchronization**: Automatically sync your chats across all devices
- **🔑 Custom localStorage Sync**: Sync your TypingMind settings and preferences
  - Select specific keys to synchronize
  - Categorized key organization (Settings, UI, Models, etc.)
  - Smart bidirectional conflict resolution
  - Search and bulk selection tools
- **☁️ Firebase Firestore Backend**: Secure and reliable cloud storage
- **🔐 Anonymous Authentication**: No account creation required - each device gets its own anonymous account
- **🌐 Multi-device Support**: Share the same workspace across unlimited devices
- **📁 Smart Folder Management**: Preserves chat organization and folder structure
- **💾 Intelligent Conflict Resolution**: Automatically merges changes based on timestamps
- **🗑️ Deletion Tracking**: Tombstone system ensures deletions sync across all devices
- **⚡ Auto-sync**: Configurable automatic synchronization intervals
- **🔍 Debug Mode**: Built-in logger for troubleshooting (`?log=true` URL parameter)
- **💬 Message Preservation**: 
  - Full content preservation (text, arrays, objects)
  - Support for reasoning/thinking models (O1, O3, DeepSeek R1)
  - Streaming message filtering to avoid incomplete content
  - Token usage and cost tracking
- **📊 Rich Metadata Support**:
  - Model information and multimodel configurations
  - Chat parameters and linked plugins
  - Character assignments
  - Token usage statistics

### 🚧 Upcoming Features

- **📎 Attachment Management** ⚡ SOON: Upload and sync file attachments
- **🖼️ Image Synchronization** ⚡ SOON: Sync images shared in chats
- **📄 Document Sharing** ⚡ SOON: Share PDF, Word, and other document formats
- **☁️ Firebase Storage Integration**: Store large files in Firebase Storage
- **🔗 Asset URL Management**: Handle external file references
- **📦 Batch File Upload**: Efficiently sync multiple attachments at once
- **💾 Storage Quota Management**: Monitor and optimize storage usage
- **🗜️ File Compression**: Automatic compression for large files
- **🔄 Incremental Sync**: Only sync changed attachments
- **🔒 End-to-End Encryption**: Encrypt your data before uploading to Firebase

## 📊 Comparison with Other Solutions

| Feature | Firebase Sync | S3-based Backup* | TypingMind Built-in |
|---------|--------------|------------------|---------------------|
| **Cost (per GB)** | Free up to 1GB, then $0.15/GB/month | ~$0.005/GB/month** | $5/GB/month |
| **Free Tier** | ✅ Up to 1GB + $275 credit*** | ❌ 1TB minimum (~$6/month) | ✅ Up to 50MB |
| **Stability** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Offline Support** | ✅ Yes | ❌ No | ✅ Yes |
| **Bandwidth Usage****** | 🟢 Very Low | 🔴 Very High | 🟡 Unknown |
| **Settings Sync** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Attachment Support** | 🚧 Coming Soon | ✅ Yes | ✅ Yes |
| **Setup Complexity** | 🟡 Medium | 🔴 Complex | 🟢 Easy |
| **Data Control** | ✅ Your Firebase | ✅ Your S3 | ❌ TypingMind servers |
| **Multi-device** | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited |
| **Simultaneous Use** | ✅ Yes | ❌ No | ✅ Yes |
| **Conflict Resolution** | ✅ Automatic (timestamp-based) | ⚠️ Last-write-wins | ✅ Automatic |
| **Open Source** | ✅ Yes | ✅ Yes | ❌ No |

\* *[typingmind-cloud-backup](https://github.com/itcon-pty-au/typingmind-cloud-backup)*  
\** *Backblaze B2: $6/TB/month minimum (~$0.005/GB), most providers require 1TB minimum*  
\*** *Google Cloud new users get $275 in free credits*  
\**** *Firebase only syncs modified chats; S3 backup creates single large files requiring full download/upload*

### 💡 Which Solution Should You Choose?

**Choose Firebase Sync if:**
- You want a free solution for moderate usage (< 1GB)
- You need low bandwidth usage with granular sync
- You want to work on multiple devices simultaneously
- You want to sync your TypingMind settings and preferences
- You prefer automatic conflict resolution
- You're a new Google Cloud user ($275 free credits)

**Choose S3 Backup if:**
- You already have S3 infrastructure
- You need attachment support right now
- You have large storage needs (> 1TB) and want lowest costs
- You don't need simultaneous editing on multiple devices

**Choose TypingMind Built-in if:**
- You want zero setup complexity
- You have minimal storage needs (< 50MB)
- You prefer official support
- Cost is not a concern

## 📋 Requirements

- **Firebase Project**: Free tier is sufficient for personal use
- **TypingMind**: Compatible with latest version
- **Modern Browser**: Chrome, Firefox, Edge, or Safari

## 🚀 Setup Guide

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add Project"**
3. Enter a project name
4. Disable Google Analytics (optional)
5. Click **"Create Project"**

💡 **New to Google Cloud?** You get **$275 in free credits** to use over 90 days!

### 2. Enable Anonymous Authentication

1. In Firebase Console, go to **Authentication**
2. Click **"Get Started"** (if first time)
3. Go to **"Sign-in method"** tab
4. Click on **"Anonymous"**
5. Toggle **"Enable"**
6. Click **"Save"**

⚠️ **Important**: Anonymous authentication must be enabled or you'll get an error!

### 3. Get Firebase Configuration

1. In Firebase Console, click the **gear icon** → **"Project settings"**
2. Scroll down to **"Your apps"**
3. Click the **Web icon** (`</>`)
4. Register your app (any name)
5. Copy the configuration values:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`

### 4. Configure Firestore Database

1. In Firebase Console, go to **Firestore Database**
2. Click **"Create database"**
3. Select **"Start in production mode"**
4. Choose your preferred region
5. Click **"Enable"**

### 5. Set Firestore Security Rules

Go to **Firestore Database** → **Rules** tab and paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /workspaces/{workspaceId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Click **"Publish"**

### 6. Install the Extension

1. Open **TypingMind**
2. Go to **Settings** → **Extensions**
3. Copy this URL:
   ```
   https://cdn.jsdelivr.net/gh/Endojoy/typingmind-cloud-backup-firebase@refs/heads/main/firebase-sync.js
   ```
4. Paste it in the extension URL field
5. Click **"Install"**
6. Refresh the page

### 7. Configure the Extension

1. Click the new **"Sync"** button in the sidebar
2. Enter your Firebase configuration:
   - API Key
   - Auth Domain
   - Project ID
   - Storage Bucket
3. **Choose a Workspace ID** (e.g., `my-workspace`, `work-chats`, etc.)
   - This can be any identifier you choose
   - **Use the SAME Workspace ID on all devices** you want to sync
4. Set auto-sync interval (default: 1 minute)
5. (Optional) Enable sync notifications
6. Click **"Save"**
7. Page will reload automatically

### 8. Configure Custom Keys Sync (Optional)

Synchronize your TypingMind settings across devices:

1. Click the **"Sync"** button in the sidebar
2. Scroll to **"Custom Keys to Sync"** section
3. Use the search bar to find specific settings
4. Select keys you want to sync:
   - **Settings**: Default model, system message, parameters
   - **UI Preferences**: Font size, theme, layout
   - **Models & AI**: Model configurations, reasoning settings
   - **Budget & Usage**: Budget configurations, usage stats
   - And more...
5. Use **"Select All"** or **"Deselect All"** for quick selection
6. Click **"Save"**

💡 **Tip**: Start by syncing only essential settings like `TM_useDefaultModel` and `TM_useFontSize`, then add more as needed.

## 💡 How It Works

### Architecture

```
Device A (Anonymous User 1) ──┐
                              ├──> Firebase Firestore ──> Workspace: "my-workspace"
Device B (Anonymous User 2) ──┘
```

- Each device gets its own **anonymous Firebase account**
- All devices share the **same workspace** (via Workspace ID)
- Changes are synced **bidirectionally**
- **Timestamps** determine conflict resolution (newest wins)

### Workspace Concept

Think of a **Workspace ID** as a shared folder:
- Create a workspace name (e.g., `personal-chats`, `work-stuff`)
- Use the **same workspace ID** on all your devices
- Each device maintains its own auth, but shares the same data pool

### Sync Logic

#### Chats & Folders
1. **Upload**: Local changes are pushed to Firestore
2. **Download**: Remote changes are fetched
3. **Merge**: Conflicts resolved by timestamp comparison (newest wins)
4. **Deletion Tracking**: Tombstones ensure deletions propagate
5. **Smart Filtering**: Incomplete streaming messages are filtered out

#### Custom localStorage Keys (v1.5)
1. **Smart Detection**: Compares local and remote values
2. **Timestamp Comparison**: Determines which version is newer
3. **Bidirectional Sync**: 
   - If local value changed after last sync → Upload to Firebase
   - If remote value is newer → Download and apply locally
4. **Selective Sync**: Only selected keys are synchronized
5. **Conflict Prevention**: Automatic resolution based on modification time

## 🔍 Debug Mode

Enable detailed logging by adding `?log=true` to your URL:

```
https://typingmind.com/?log=true
```

You'll see detailed console logs showing:
- Sync operations (chats, folders, custom keys)
- Message processing
- Upload/download counts
- Conflict resolutions
- Timestamp comparisons
- Error details

Example logs for custom keys:
```
🔄 Syncing 5 custom keys...
🆕 TM_useFontSize: Not in Firebase, will upload
🔄 TM_useDefaultModel: Values differ
   Local:  "gpt-4"
   Remote: "claude-3-opus"
   📥 Remote is newer, will download
✅ TM_budgetConfig: Already in sync
📊 Analysis: 1 upload, 1 download, 3 unchanged
```

## ⚙️ Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| **API Key** | Firebase API key | - |
| **Auth Domain** | Firebase auth domain | - |
| **Project ID** | Firebase project ID | - |
| **Storage Bucket** | Firebase storage bucket | - |
| **Workspace ID** | Shared workspace identifier | - |
| **Auto-sync Interval** | Minutes between syncs | 1 |
| **Notifications** | Show sync notifications | Enabled |
| **Custom Keys** | localStorage keys to sync | None |

## 🛡️ Security Considerations

- **Anonymous Auth**: Each device has its own ephemeral account
- **Workspace Isolation**: Data is segregated by Workspace ID
- **Firestore Rules**: Authenticated users only
- **No Personal Data**: User identifiers are device-specific UUIDs
- **HTTPS Only**: All Firebase communication is encrypted
- **Custom Keys**: Only manually selected keys are synchronized

⚠️ **Note**: Keep your Firebase API credentials private to prevent unauthorized access.

## 🐛 Troubleshooting

### "Enable Anonymous auth" Error
→ Go to Firebase Console → Authentication → Enable Anonymous sign-in

### "Firebase API not ready" Error
→ Wait 10 minutes after creating project, then hard refresh (Ctrl+Shift+R)

### Chats not syncing
→ Check that all devices use the **same Workspace ID**

### Settings not syncing
→ Ensure you've selected the keys to sync in the modal  
→ Check that the same keys are selected on all devices

### Sync button shows red dot
→ Last sync failed - click "Sync Now" and check console for errors with `?log=true`

### Custom key conflicts
→ The newest change always wins based on timestamps  
→ If you want to force a specific value, change it and wait for the next sync

## 📊 Data Structure

### Firestore Schema

```
workspaces/
  {workspaceId}/
    chats/
      {chatId}/
        - id
        - chatTitle
        - model
        - modelInfo
        - messages[]
        - folderID
        - tokenUsage
        - createdAt
        - updatedAt
        - syncedAt
        - lastDevice
    folders/
      {folderId}/
        - id
        - title
        - color
        - order
        - createdAt
        - updatedAt
        - lastDevice
    customKeys/
      {keyName}/
        - key
        - value
        - updatedAt
        - lastDevice
    deletions/
      {chatId}/
        - deletedAt
        - deletedBy
    folder_deletions/
      {folderId}/
        - deletedAt
        - deletedBy
```

## 🎯 Use Cases

### Personal Use
- Sync between home computer and work laptop
- Share settings across desktop and tablet
- Maintain consistent preferences everywhere

### Team Collaboration
- Share workspace with team members
- Everyone uses their own anonymous account
- Common workspace ID for team chats

### Multi-Device Workflow
- Start conversation on desktop
- Continue on mobile
- Finish on tablet
- All with same settings and preferences

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Development

1. Clone the repository
2. Make your changes
3. Test with `?log=true` enabled
4. Test custom key sync with different scenarios
5. Submit a pull request

## 📝 Changelog

### v1.5 (October 2025)
- ✨ **NEW**: Custom localStorage keys synchronization
- ✨ **NEW**: Categorized key selection with search
- ✨ **NEW**: Smart bidirectional conflict resolution for settings
- ✨ **NEW**: Bulk select/deselect for keys
- ✨ **NEW**: Enhanced notifications for settings sync
- 🔧 Improved sync logic with timestamp-based resolution
- 🔧 Better handling of concurrent edits
- 📊 Enhanced logging for custom keys

### v1.0 (October 2025)
- Initial release
- Real-time bidirectional sync for chats and folders
- Anonymous authentication
- Workspace-based architecture
- Deletion tracking with tombstones
- Smart message filtering
- Auto-sync with configurable intervals
- Debug logging system

## 📄 License

This project is licensed under the [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) License. See the [LICENSE](LICENSE) file for details.

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/Endojoy/typingmind-cloud-backup-firebase/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Endojoy/typingmind-cloud-backup-firebase/discussions)

## 🙏 Acknowledgments

- Built for [TypingMind](https://www.typingmind.com/)
- Powered by [Firebase](https://firebase.google.com/)
- Inspired by [typingmind-cloud-backup](https://github.com/itcon-pty-au/typingmind-cloud-backup) - S3-based backup and sync solution

---

**Made by Endojoy & Solva for the TypingMind community** 💙