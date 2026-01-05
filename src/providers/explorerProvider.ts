import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Explorer Provider - Shows metadata structure
 */
export class CleanForceExplorerProvider implements vscode.TreeDataProvider<ExplorerItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ExplorerItem | undefined | null | void> = new vscode.EventEmitter<ExplorerItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ExplorerItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ExplorerItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ExplorerItem): Promise<ExplorerItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        if (!element) {
            // Root level - show categories
            return [
                new ExplorerItem('Objects', vscode.TreeItemCollapsibleState.Collapsed, 'objects', 'folder'),
                new ExplorerItem('Permission Sets', vscode.TreeItemCollapsibleState.Collapsed, 'permissionsets', 'folder'),
                new ExplorerItem('Profiles', vscode.TreeItemCollapsibleState.Collapsed, 'profiles', 'folder'),
                new ExplorerItem('Flows', vscode.TreeItemCollapsibleState.Collapsed, 'flows', 'folder'),
                new ExplorerItem('Apex Classes', vscode.TreeItemCollapsibleState.Collapsed, 'classes', 'folder'),
            ];
        }

        // Get children based on category
        return await this.getCategoryChildren(element.category);
    }

    private async getCategoryChildren(category: string): Promise<ExplorerItem[]> {
        const items: ExplorerItem[] = [];
        
        try {
            let pattern = '';
            let nameExtractor: (filePath: string) => string;

            switch (category) {
                case 'objects':
                    pattern = '**/objects/*/';
                    nameExtractor = (p) => path.basename(path.dirname(p));
                    break;
                case 'permissionsets':
                    pattern = '**/*.permissionset-meta.xml';
                    nameExtractor = (p) => path.basename(p, '.permissionset-meta.xml');
                    break;
                case 'profiles':
                    pattern = '**/*.profile-meta.xml';
                    nameExtractor = (p) => path.basename(p, '.profile-meta.xml');
                    break;
                case 'flows':
                    pattern = '**/*.flow-meta.xml';
                    nameExtractor = (p) => path.basename(p, '.flow-meta.xml');
                    break;
                case 'classes':
                    pattern = '**/*.cls';
                    nameExtractor = (p) => path.basename(p, '.cls');
                    break;
                default:
                    return [];
            }

            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);
            const names = new Set<string>();

            for (const file of files) {
                const name = nameExtractor(file.fsPath);
                if (!names.has(name)) {
                    names.add(name);
                    items.push(new ExplorerItem(
                        name,
                        vscode.TreeItemCollapsibleState.None,
                        category,
                        'file',
                        file.fsPath
                    ));
                }
            }

            items.sort((a, b) => a.label.toString().localeCompare(b.label.toString()));
        } catch (error) {
            console.error(`Error getting ${category}:`, error);
        }

        return items;
    }
}

export class ExplorerItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly category: string,
        public readonly itemType: 'folder' | 'file',
        public readonly filePath?: string
    ) {
        super(label, collapsibleState);

        this.tooltip = this.label;
        this.contextValue = itemType;

        // Set icons
        if (itemType === 'folder') {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else {
            switch (category) {
                case 'objects':
                    this.iconPath = new vscode.ThemeIcon('database');
                    break;
                case 'permissionsets':
                    this.iconPath = new vscode.ThemeIcon('shield');
                    break;
                case 'profiles':
                    this.iconPath = new vscode.ThemeIcon('person');
                    break;
                case 'flows':
                    this.iconPath = new vscode.ThemeIcon('git-merge');
                    break;
                case 'classes':
                    this.iconPath = new vscode.ThemeIcon('code');
                    break;
                default:
                    this.iconPath = new vscode.ThemeIcon('file');
            }
        }

        if (filePath) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(filePath)]
            };
        }
    }
}
