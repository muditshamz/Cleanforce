# Changelog

All notable changes to CleanForce will be documented in this file.

## [1.0.0] - 2024-XX-XX

### 🎉 Initial Release

#### Features
- **Field Operations**
  - Remove field references from Profiles and Permission Sets
  - Scan for field references across all metadata types
  - Delete field metadata files
  - Multiple input methods (type, import, clipboard, browse)

- **Destructive Changes**
  - Generate destructive changes XML for any metadata type
  - Support for post-destructive and pre-destructive changes
  - Multi-type support in single generation

- **Cleanup Operations**
  - Automatic profile cleanup (remove invalid references)
  - Permission set cleanup
  - Metadata validation
  - Unused field analysis

- **Developer Experience**
  - Interactive dashboard with beautiful UI
  - Sidebar explorer for metadata browsing
  - Quick actions panel
  - Operation history with full undo support
  - Keyboard shortcuts

- **Safety Features**
  - Automatic backups before every operation
  - Preview mode before confirming changes
  - Undo support with backup restore
  - Confirmation dialogs for destructive operations

- **Export & Reporting**
  - Export reports in Markdown, CSV, JSON, HTML
  - Detailed operation history
  - Statistics and analytics

### Supported Metadata Types
- Permission Sets
- Profiles
- Page Layouts
- Lightning Pages (FlexiPages)
- Flows
- Apex Classes & Triggers
- Aura Components
- Lightning Web Components
- Reports & Dashboards
- Custom Fields & Objects
- Validation Rules
- Workflow Rules
- Email Templates
