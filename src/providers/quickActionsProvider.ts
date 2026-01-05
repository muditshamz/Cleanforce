import * as vscode from 'vscode';

export class QuickActionsProvider implements vscode.TreeDataProvider<QuickActionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<QuickActionItem | undefined | null | void> = new vscode.EventEmitter<QuickActionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<QuickActionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: QuickActionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: QuickActionItem): Promise<QuickActionItem[]> {
        if (element) {
            return [];
        }

        return [
            new QuickActionItem(
                '🧹 Quick Clean',
                'Smart detect and remove unused references',
                'cleanforce.quickClean',
                'zap'
            ),
            new QuickActionItem(
                '🔍 Scan Fields',
                'Find all field references',
                'cleanforce.scanForReferences',
                'search'
            ),
            new QuickActionItem(
                '🗑️ Remove Fields',
                'Remove field references from metadata',
                'cleanforce.removeFields',
                'trash'
            ),
            new QuickActionItem(
                '📄 Generate Destructive',
                'Create destructive changes XML',
                'cleanforce.generateDestructiveChanges',
                'file-code'
            ),
            new QuickActionItem(
                '✨ Cleanup Profiles',
                'Remove invalid profile references',
                'cleanforce.cleanupProfiles',
                'sparkle'
            ),
            new QuickActionItem(
                '✨ Cleanup Permission Sets',
                'Remove invalid permission set references',
                'cleanforce.cleanupPermissionSets',
                'sparkle'
            ),
            new QuickActionItem(
                '📊 Analyze Unused',
                'Find potentially unused fields',
                'cleanforce.analyzeUnusedFields',
                'graph'
            ),
            new QuickActionItem(
                '🔗 Dependency Graph',
                'Visualize field dependencies',
                'cleanforce.dependencyGraph',
                'type-hierarchy'
            ),
            new QuickActionItem(
                '✅ Validate Metadata',
                'Check metadata integrity',
                'cleanforce.validateMetadata',
                'check'
            ),
            new QuickActionItem(
                '📋 Open Dashboard',
                'Open the CleanForce dashboard',
                'cleanforce.openDashboard',
                'dashboard'
            ),
        ];
    }
}

export class QuickActionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly commandId: string,
        public readonly icon: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);

        this.tooltip = description;
        this.iconPath = new vscode.ThemeIcon(icon);
        
        this.command = {
            command: commandId,
            title: label
        };
    }
}
