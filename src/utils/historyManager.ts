import * as vscode from 'vscode';
import { BackupManager } from './backupManager';

export enum OperationType {
    REMOVE_FIELD_REFERENCES = 'Remove Field References',
    DELETE_FIELD_FILES = 'Delete Field Files',
    CLEANUP_PROFILES = 'Cleanup Profiles',
    CLEANUP_PERMISSION_SETS = 'Cleanup Permission Sets',
    REMOVE_APEX_REFERENCES = 'Remove Apex References',
    REMOVE_OBJECT_REFERENCES = 'Remove Object References',
    REMOVE_FLOW_REFERENCES = 'Remove Flow References',
    REMOVE_LAYOUT_ITEMS = 'Remove Layout Items',
    BULK_OPERATION = 'Bulk Operation'
}

export interface HistoryEntry {
    id?: string;
    type: OperationType;
    timestamp: Date;
    details: {
        object?: string;
        fields?: string[];
        filesModified?: string[];
        filesDeleted?: string[];
        totalRemoved?: number;
        backupPath?: string;
        [key: string]: any;
    };
}

export class HistoryManager {
    private context: vscode.ExtensionContext;
    private historyKey = 'cleanforce.history';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Add a new entry to history
     */
    addEntry(entry: HistoryEntry): void {
        const history = this.getHistory();
        
        // Generate unique ID
        entry.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Add to beginning
        history.unshift(entry);

        // Limit history size
        const config = vscode.workspace.getConfiguration('cleanforce');
        const maxItems = config.get<number>('maxHistoryItems') || 50;
        
        if (history.length > maxItems) {
            history.splice(maxItems);
        }

        this.saveHistory(history);
    }

    /**
     * Get all history entries
     */
    getHistory(): HistoryEntry[] {
        const history = this.context.globalState.get<HistoryEntry[]>(this.historyKey) || [];
        
        // Convert timestamp strings back to Date objects
        return history.map(entry => ({
            ...entry,
            timestamp: new Date(entry.timestamp)
        }));
    }

    /**
     * Save history to storage
     */
    private saveHistory(history: HistoryEntry[]): void {
        this.context.globalState.update(this.historyKey, history);
    }

    /**
     * Clear all history
     */
    clearHistory(): void {
        this.context.globalState.update(this.historyKey, []);
    }

    /**
     * Get the last entry
     */
    getLastEntry(): HistoryEntry | undefined {
        const history = this.getHistory();
        return history.length > 0 ? history[0] : undefined;
    }

    /**
     * Undo the last operation
     */
    async undoLast(backupManager: BackupManager): Promise<boolean> {
        const lastEntry = this.getLastEntry();
        
        if (!lastEntry) {
            vscode.window.showWarningMessage('No operations to undo');
            return false;
        }

        if (!lastEntry.details.backupPath && !lastEntry.details.filesModified) {
            vscode.window.showWarningMessage('This operation cannot be undone (no backup available)');
            return false;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Undo "${lastEntry.type}" from ${lastEntry.timestamp.toLocaleString()}?`,
            { modal: true },
            'Yes, Undo'
        );

        if (confirm !== 'Yes, Undo') {
            return false;
        }

        try {
            // Restore from backup
            if (lastEntry.details.filesModified) {
                for (const filePath of lastEntry.details.filesModified) {
                    await backupManager.restoreBackup(filePath);
                }
            }

            // Remove entry from history
            const history = this.getHistory();
            history.shift();
            this.saveHistory(history);

            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to undo: ${error}`);
            return false;
        }
    }

    /**
     * Get history grouped by date
     */
    getHistoryByDate(): Map<string, HistoryEntry[]> {
        const history = this.getHistory();
        const grouped = new Map<string, HistoryEntry[]>();

        for (const entry of history) {
            const dateKey = entry.timestamp.toLocaleDateString();
            const group = grouped.get(dateKey) || [];
            group.push(entry);
            grouped.set(dateKey, group);
        }

        return grouped;
    }

    /**
     * Get statistics
     */
    getStatistics(): {
        totalOperations: number;
        totalFieldsRemoved: number;
        totalFilesModified: number;
        operationsByType: Map<OperationType, number>;
    } {
        const history = this.getHistory();
        const operationsByType = new Map<OperationType, number>();
        let totalFieldsRemoved = 0;
        let totalFilesModified = 0;

        for (const entry of history) {
            operationsByType.set(
                entry.type,
                (operationsByType.get(entry.type) || 0) + 1
            );

            if (entry.details.totalRemoved) {
                totalFieldsRemoved += entry.details.totalRemoved;
            }

            if (entry.details.filesModified) {
                totalFilesModified += entry.details.filesModified.length;
            }
        }

        return {
            totalOperations: history.length,
            totalFieldsRemoved,
            totalFilesModified,
            operationsByType
        };
    }
}
