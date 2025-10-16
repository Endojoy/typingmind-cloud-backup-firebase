# TypingMind Firebase Cloud Sync

A powerful browser extension for **TypingMind** that enables real-time cloud synchronization across multiple devices using **Firebase Firestore**.

[![Version](https://img.shields.io/badge/version-1.0-blue.svg)](https://github.com/yourusername/typingmind-firebase-sync)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 🌟 Features

### Current Features (v1.0)

- **🔄 Real-time Synchronization**: Automatically sync your chats across all devices
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
| **Bandwidth Usage****** | 🟢 Very Low | 🔴 Very High | 🟡 Unknow |
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
5. Click **"Save"**
6. Page will reload automatically

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

1. **Upload**: Local changes are pushed to Firestore
2. **Download**: Remote changes are fetched
3. **Merge**: Conflicts resolved by timestamp comparison (newest wins)
4. **Deletion Tracking**: Tombstones ensure deletions propagate
5. **Smart Filtering**: Incomplete streaming messages are filtered out

## 🔍 Debug Mode

Enable detailed logging by adding `?log=true` to your URL:

```
https://yourtypingmind.com/?log=true
```

You'll see detailed console logs showing:
- Sync operations
- Message processing
- Upload/download counts
- Conflict resolutions
- Error details

## ⚙️ Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| **API Key** | Firebase API key | - |
| **Auth Domain** | Firebase auth domain | - |
| **Project ID** | Firebase project ID | - |
| **Storage Bucket** | Firebase storage bucket | - |
| **Workspace ID** | Shared workspace identifier | - |
| **Auto-sync Interval** | Minutes between syncs | 1 |

## 🛡️ Security Considerations

- **Anonymous Auth**: Each device has its own ephemeral account
- **Workspace Isolation**: Data is segregated by Workspace ID
- **Firestore Rules**: Authenticated users only
- **No Personal Data**: User identifiers are device-specific UUIDs
- **HTTPS Only**: All Firebase communication is encrypted

⚠️ **Note**: Keep your Firebase API credentials private to prevent unauthorized access.

## 🐛 Troubleshooting

### "Enable Anonymous auth" Error
→ Go to Firebase Console → Authentication → Enable Anonymous sign-in

### "Firebase API not ready" Error
→ Wait 10 minutes after creating project, then hard refresh (Ctrl+Shift+R)

### Chats not syncing
→ Check that all devices use the **same Workspace ID**

### Sync button shows red dot
→ Last sync failed - click "Sync Now" and check console for errors

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
    deletions/
      {chatId}/
        - deletedAt
        - deletedBy
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Development

1. Clone the repository
2. Make your changes
3. Test with `?log=true` enabled
4. Submit a pull request

## 📝 Changelog

### v1.0 (October 2025)
- Initial release
- Real-time bidirectional sync
- Anonymous authentication
- Workspace-based architecture
- Deletion tracking with tombstones
- Smart message filtering
- Auto-sync with configurable intervals
- Debug logging system

## 📄 License

MIT License - feel free to use and modify!

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/typingmind-firebase-sync/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/typingmind-firebase-sync/discussions)

## 🙏 Acknowledgments

- Built for [TypingMind](https://www.typingmind.com/)
- Powered by [Firebase](https://firebase.google.com/)
- Inspired by [typingmind-cloud-backup](https://github.com/itcon-pty-au/typingmind-cloud-backup) - S3-based backup and sync solution

---

**Made by Enjoy for the TypingMind community**