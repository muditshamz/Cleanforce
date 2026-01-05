import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';

export class PermissionSetCleaner {
    constructor(
        private historyManager: HistoryManager,
        private backupManager: BackupManager
    ) {}

    async execute(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Cleaning permission sets...',
            cancellable: false
        }, async (progress) => {
            const psFiles = await vscode.workspace.findFiles(
                '**/*.permissionset-meta.xml',
                '**/node_modules/**'
            );

            let totalCleaned = 0;
            let filesModified = 0;
            const modifiedFiles: string[] = [];

            for (const file of psFiles) {
                progress.report({ message: `Processing ${path.basename(file.fsPath)}` });

                let content = fs.readFileSync(file.fsPath, 'utf-8');
                const originalContent = content;

                // Clean up empty or malformed permission blocks
                content = content.replace(/\s*<fieldPermissions>\s*<\/fieldPermissions>/g, '');
                content = content.replace(/\s*<objectPermissions>\s*<\/objectPermissions>/g, '');
                content = content.replace(/\s*<classAccesses>\s*<\/classAccesses>/g, '');

                if (content !== originalContent) {
                    const config = vscode.workspace.getConfiguration('cleanforce');
                    if (config.get('createBackup')) {
                        await this.backupManager.createBackup(file.fsPath);
                    }
                    fs.writeFileSync(file.fsPath, content);
                    totalCleaned++;
                    filesModified++;
                    modifiedFiles.push(file.fsPath);
                }
            }

            if (filesModified > 0) {
                this.historyManager.addEntry({
                    type: OperationType.CLEANUP_PERMISSION_SETS,
                    timestamp: new Date(),
                    details: {
                        filesModified: modifiedFiles,
                        totalRemoved: totalCleaned
                    }
                });
            }

            vscode.window.showInformationMessage(
                `✅ CleanForce: Cleaned ${filesModified} permission set(s)`
            );
        });
    }
}
