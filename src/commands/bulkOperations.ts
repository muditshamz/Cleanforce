import * as vscode from 'vscode';
import { HistoryManager } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';
import { MetadataValidator } from './metadataValidator';

export class BulkOperations {
    constructor(
        private historyManager: HistoryManager,
        private backupManager: BackupManager
    ) {}

    async execute(): Promise<void> {
        const operation = await vscode.window.showQuickPick([
            { label: '🗑️ Remove Multiple Fields', value: 'removeFields' },
            { label: '📄 Bulk Generate Destructive Changes', value: 'destructive' },
            { label: '✨ Clean All Profiles & Permission Sets', value: 'cleanAll' },
        ], {
            placeHolder: 'Select bulk operation'
        });

        if (!operation) return;

        switch (operation.value) {
            case 'removeFields':
                await vscode.commands.executeCommand('cleanforce.removeFields');
                break;
            case 'destructive':
                await vscode.commands.executeCommand('cleanforce.generateDestructiveChanges');
                break;
            case 'cleanAll':
                await vscode.commands.executeCommand('cleanforce.cleanupProfiles');
                await vscode.commands.executeCommand('cleanforce.cleanupPermissionSets');
                break;
        }
    }

    async quickClean(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Quick Clean will scan and offer to fix common metadata issues. Continue?',
            { modal: true },
            'Yes, Start Quick Clean'
        );

        if (confirm !== 'Yes, Start Quick Clean') return;

        const validator = new MetadataValidator();
        const problems = await validator.validate();

        if (problems.length > 0) {
            const fix = await vscode.window.showWarningMessage(
                `Found ${problems.length} issue(s). Would you like to auto-fix what's possible?`,
                'Yes, Auto-Fix',
                'No, Just Report'
            );

            if (fix === 'Yes, Auto-Fix') {
                await vscode.commands.executeCommand('cleanforce.cleanupProfiles');
                await vscode.commands.executeCommand('cleanforce.cleanupPermissionSets');
                vscode.window.showInformationMessage('✅ Quick Clean completed!');
            }
        } else {
            vscode.window.showInformationMessage('✅ Your metadata is clean! No issues found.');
        }
    }
}
