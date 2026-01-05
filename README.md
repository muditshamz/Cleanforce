# CleanForce 🧹⚡

> **The Ultimate Salesforce Metadata Cleanup Tool**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://marketplace.visualstudio.com/items?itemName=cleanforce.cleanforce)
[![Installs](https://img.shields.io/badge/installs-1k+-green.svg)](https://marketplace.visualstudio.com/items?itemName=cleanforce.cleanforce)
[![Rating](https://img.shields.io/badge/rating-⭐⭐⭐⭐⭐-yellow.svg)](https://marketplace.visualstudio.com/items?itemName=cleanforce.cleanforce)

**Save hours of manual work!** CleanForce is the most comprehensive VS Code extension for cleaning up Salesforce metadata. Remove field references, clean profiles & permission sets, generate destructive changes, analyze dependencies, and more - all from within VS Code.

![CleanForce Dashboard](images/dashboard.png)

---

## 🚀 Features

### Core Features
- ✅ **Remove Field References** - Bulk remove field permissions from all Profiles and Permission Sets
- ✅ **Scan for References** - Find all files containing references to specific fields
- ✅ **Generate Destructive Changes** - Auto-generate `destructiveChanges.xml` for any metadata type
- ✅ **Delete Field Files** - Remove field metadata files from your repository
- ✅ **Smart Backup System** - Automatic backups before every operation with easy restore

### Advanced Features
- 🔍 **Unused Field Analyzer** - Find potentially unused fields in your org
- ✨ **Profile Cleaner** - Remove invalid/orphaned references from profiles
- ✨ **Permission Set Cleaner** - Clean up invalid permission set references
- ✅ **Metadata Validator** - Check metadata integrity and find potential issues
- 📊 **Export Reports** - Generate cleanup reports in Markdown, CSV, JSON, or HTML

### Developer Experience
- 📊 **Interactive Dashboard** - Beautiful UI to access all features
- 🌳 **Sidebar Explorer** - Browse metadata directly in VS Code
- 📜 **Operation History** - Track all operations with full undo support
- ⚡ **Quick Actions** - One-click access to common operations
- ⌨️ **Keyboard Shortcuts** - Fast access to frequently used commands

### Multiple Input Methods
- 📝 Type field names manually
- 📁 Import from CSV/TXT files
- 📋 Paste from clipboard
- 🔍 Browse and select from project

---

## 📦 Installation

### From VS Code Marketplace
1. Open VS Code
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (Mac)
3. Search for **"CleanForce"**
4. Click **Install**

### From VSIX File
1. Download the `.vsix` file from releases
2. In VS Code, go to Extensions
3. Click `...` menu → **Install from VSIX**

---

## 🎯 Quick Start

### Open the Dashboard
```
Ctrl+Shift+C (Windows/Linux)
Cmd+Shift+C (Mac)
```
Or use Command Palette: `CleanForce: Open Dashboard`

### Quick Clean
```
Ctrl+Shift+Q (Windows/Linux)
Cmd+Shift+Q (Mac)
```
Smart detect and remove unused references automatically.

---

## 📖 Usage Guide

### 1. Remove Field References

**Command Palette:** `CleanForce: Remove Field References`

1. Select the Object (e.g., Case, Account)
2. Choose input method:
   - Type field names
   - Import from file
   - Paste from clipboard
   - Select from project
3. Preview changes
4. Confirm removal

**Result:** Field permissions removed from all Profiles and Permission Sets

### 2. Scan for Field References

**Command Palette:** `CleanForce: Scan for Field References`

Scans across:
- Permission Sets
- Profiles
- Page Layouts
- Lightning Pages
- Flows
- Reports
- Apex Classes/Triggers
- Aura Components
- LWC

### 3. Generate Destructive Changes

**Command Palette:** `CleanForce: Generate Destructive Changes XML`

Supports:
- Custom Fields
- Apex Classes
- Apex Triggers
- Flows
- Page Layouts
- Custom Objects
- Validation Rules
- Email Templates
- Multiple types at once

### 4. Cleanup Profiles & Permission Sets

**Command Palette:** 
- `CleanForce: Cleanup Invalid Profile References`
- `CleanForce: Cleanup Invalid Permission Set References`

Automatically removes:
- References to deleted fields
- References to deleted Apex classes
- Empty permission blocks
- Orphaned metadata references

### 5. Analyze Unused Fields

**Command Palette:** `CleanForce: Analyze Unused Fields`

Finds fields not referenced in:
- Apex code
- Flows
- Layouts
- Lightning components
- Reports

---

## ⚙️ Configuration

Open Settings and search for "CleanForce":

| Setting | Default | Description |
|---------|---------|-------------|
| `cleanforce.defaultObject` | `""` | Default object for field operations |
| `cleanforce.createBackup` | `true` | Create backups before changes |
| `cleanforce.backupLocation` | `.cleanforce/backups` | Backup folder location |
| `cleanforce.apiVersion` | `59.0` | Salesforce API version |
| `cleanforce.autoScan` | `true` | Auto-scan on project open |
| `cleanforce.showNotifications` | `true` | Show operation notifications |
| `cleanforce.confirmBeforeDelete` | `true` | Confirm before deletions |
| `cleanforce.maxHistoryItems` | `50` | Max history entries to keep |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+C` | Open Dashboard |
| `Ctrl+Shift+Q` | Quick Clean |
| `Ctrl+Shift+Z` | Undo Last Operation |

---

## 🎨 Commands Reference

| Command | Description |
|---------|-------------|
| `CleanForce: Open Dashboard` | Open the interactive dashboard |
| `CleanForce: Remove Field References` | Remove field permissions |
| `CleanForce: Scan for Field References` | Find all field references |
| `CleanForce: Generate Destructive Changes XML` | Create destructive deployment files |
| `CleanForce: Delete Field Metadata Files` | Delete field files from project |
| `CleanForce: Analyze Unused Fields` | Find potentially unused fields |
| `CleanForce: Cleanup Invalid Profile References` | Clean profiles |
| `CleanForce: Cleanup Invalid Permission Set References` | Clean permission sets |
| `CleanForce: Validate Metadata` | Check metadata integrity |
| `CleanForce: Quick Clean` | Smart auto-cleanup |
| `CleanForce: Undo Last Operation` | Undo with backup restore |
| `CleanForce: View Operation History` | See all past operations |
| `CleanForce: Export Cleanup Report` | Export reports |
| `CleanForce: Import Field List from CSV/Excel` | Import fields from file |

---

## 📁 Supported File Types

### Full Support (Remove + Scan)
- Permission Sets (`.permissionset-meta.xml`)
- Profiles (`.profile-meta.xml`)

### Scan Support
- Page Layouts (`.layout-meta.xml`)
- Lightning Pages (`.flexipage-meta.xml`)
- Flows (`.flow-meta.xml`)
- Reports (`.report-meta.xml`)
- Dashboards (`.dashboard-meta.xml`)
- Apex Classes (`.cls`)
- Apex Triggers (`.trigger`)
- Aura Components (`.cmp`)
- LWC (`.html`, `.js`)

### Destructive Changes Support
- Custom Fields
- Custom Objects
- Apex Classes
- Apex Triggers
- Flows
- Validation Rules
- Workflow Rules
- Email Templates
- Reports
- Dashboards
- And more...

---

## 🔒 Safety Features

1. **Automatic Backups** - Every operation creates a backup
2. **Preview Mode** - See what will change before confirming
3. **Undo Support** - Restore previous state with one click
4. **Confirmation Dialogs** - Prevent accidental deletions
5. **Operation History** - Track all changes with timestamps

---

## 💡 Tips & Best Practices

### Before Removing Fields
1. Run **Scan for References** first
2. Check for references in Reports/Dashboards (not in code)
3. Verify fields aren't used by external integrations
4. Always test in a sandbox first

### Workflow for Field Deletion
1. **Scan** - `CleanForce: Scan for Field References`
2. **Remove References** - `CleanForce: Remove Field References`
3. **Delete Files** - `CleanForce: Delete Field Metadata Files`
4. **Generate Destructive** - `CleanForce: Generate Destructive Changes XML`
5. **Deploy** - Use SF CLI to deploy

### Deploy Destructive Changes
```bash
sf project deploy start \
  --manifest destructive-post/package.xml \
  --post-destructive-changes destructive-post/destructiveChangesPost.xml \
  -o YOUR_ORG_ALIAS
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 Changelog

### v1.0.0
- 🎉 Initial release
- ✅ Field reference removal
- ✅ Destructive changes generation
- ✅ Profile & Permission Set cleanup
- ✅ Unused field analysis
- ✅ Interactive dashboard
- ✅ Operation history with undo
- ✅ Multiple input methods
- ✅ Report export

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with ❤️ for the Salesforce community
- Inspired by the pain of manual metadata cleanup
- Thanks to all contributors and users

---

## 📞 Support

- 🐛 [Report Issues](https://github.com/cleanforce/cleanforce-vscode/issues)
- 💬 [Discussions](https://github.com/cleanforce/cleanforce-vscode/discussions)
- ⭐ [Star on GitHub](https://github.com/cleanforce/cleanforce-vscode)

---

**Clean your Salesforce metadata with CleanForce!** 🧹⚡

*If you find this extension helpful, please leave a review on the VS Code Marketplace!*
