import * as vscode from 'vscode';
import { HistoryManager, HistoryEntry } from '../utils/historyManager';

export class HistoryProvider implements vscode.TreeDataProvider<HistoryItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | undefined | null | void> = new vscode.EventEmitter<HistoryItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private historyManager: HistoryManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HistoryItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: HistoryItem): Promise<HistoryItem[]> {
        if (element) {
            // Show details for a history entry
            return this.getEntryDetails(element.entry!);
        }

        const history = this.historyManager.getHistory();
        
        if (history.length === 0) {
            return [new HistoryItem('No operations yet', '', undefined, 'info')];
        }

        return history.slice(0, 20).map((entry, index) => {
            const timeAgo = this.getTimeAgo(entry.timestamp);
            return new HistoryItem(
                entry.type,
                timeAgo,
                entry,
                index === 0 ? 'history-recent' : 'history',
                vscode.TreeItemCollapsibleState.Collapsed
            );
        });
    }

    private getEntryDetails(entry: HistoryEntry): HistoryItem[] {
        const items: HistoryItem[] = [];

        if (entry.details.object) {
            items.push(new HistoryItem(`Object: ${entry.details.object}`, '', undefined, 'database'));
        }

        if (entry.details.fields && entry.details.fields.length > 0) {
            items.push(new HistoryItem(`Fields: ${entry.details.fields.length}`, '', undefined, 'symbol-field'));
        }

        if (entry.details.totalRemoved) {
            items.push(new HistoryItem(`Removed: ${entry.details.totalRemoved}`, '', undefined, 'trash'));
        }

        if (entry.details.filesModified && entry.details.filesModified.length > 0) {
            items.push(new HistoryItem(`Files modified: ${entry.details.filesModified.length}`, '', undefined, 'files'));
        }

        items.push(new HistoryItem(
            `Time: ${entry.timestamp.toLocaleString()}`,
            '',
            undefined,
            'clock'
        ));

        return items;
    }

    private getTimeAgo(date: Date): string {
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        
        return date.toLocaleDateString();
    }
}

export class HistoryItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly entry: HistoryEntry | undefined,
        public readonly icon: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);

        this.tooltip = entry ? `${entry.type} - ${entry.timestamp.toLocaleString()}` : label;
        this.iconPath = new vscode.ThemeIcon(icon);
    }
}
