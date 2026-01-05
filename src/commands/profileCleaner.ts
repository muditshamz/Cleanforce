import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';

export class ProfileCleaner {
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
            title: 'CleanForce: Cleaning profiles...',
            cancellable: false
        }, async (progress) => {
            const profileFiles = await vscode.workspace.findFiles(
                '**/*.profile-meta.xml',
                '**/node_modules/**'
            );

            let totalCleaned = 0;
            let filesModified = 0;
            const modifiedFiles: string[] = [];

            const validFields = await this.getValidFields();
            const validClasses = await this.getValidClasses();

            for (const file of profileFiles) {
                progress.report({ message: `Processing ${path.basename(file.fsPath)}` });

                let content = fs.readFileSync(file.fsPath, 'utf-8');
                const originalContent = content;
                let cleaned = 0;

                const fieldPattern = /<fieldPermissions>[\s\S]*?<field>([^<]+)<\/field>[\s\S]*?<\/fieldPermissions>/g;
                content = content.replace(fieldPattern, (match, fieldRef) => {
                    if (!validFields.has(fieldRef)) {
                        cleaned++;
                        return '';
                    }
                    return match;
                });

                const classPattern = /<classAccesses>[\s\S]*?<apexClass>([^<]+)<\/apexClass>[\s\S]*?<\/classAccesses>/g;
                content = content.replace(classPattern, (match, classRef) => {
                    if (!validClasses.has(classRef)) {
                        cleaned++;
                        return '';
                    }
                    return match;
                });

                if (content !== originalContent) {
                    const config = vscode.workspace.getConfiguration('cleanforce');
                    if (config.get('createBackup')) {
                        await this.backupManager.createBackup(file.fsPath);
                    }
                    fs.writeFileSync(file.fsPath, content);
                    totalCleaned += cleaned;
                    filesModified++;
                    modifiedFiles.push(file.fsPath);
                }
            }

            if (filesModified > 0) {
                this.historyManager.addEntry({
                    type: OperationType.CLEANUP_PROFILES,
                    timestamp: new Date(),
                    details: {
                        filesModified: modifiedFiles,
                        totalRemoved: totalCleaned
                    }
                });
            }

            vscode.window.showInformationMessage(
                `✅ CleanForce: Cleaned ${totalCleaned} invalid reference(s) from ${filesModified} profile(s)`
            );
        });
    }

    private async getValidFields(): Promise<Set<string>> {
        const fields = new Set<string>();
        const fieldFiles = await vscode.workspace.findFiles(
            '**/objects/*/fields/*.field-meta.xml',
            '**/node_modules/**'
        );

        for (const file of fieldFiles) {
            const parts = file.fsPath.split(path.sep);
            const objectIndex = parts.indexOf('objects');
            if (objectIndex !== -1 && parts.length > objectIndex + 3) {
                const objectName = parts[objectIndex + 1];
                const fieldName = path.basename(file.fsPath, '.field-meta.xml');
                fields.add(`${objectName}.${fieldName}`);
            }
        }

        return fields;
    }

    private async getValidClasses(): Promise<Set<string>> {
        const classes = new Set<string>();
        const classFiles = await vscode.workspace.findFiles(
            '**/*.cls',
            '**/node_modules/**'
        );

        for (const file of classFiles) {
            classes.add(path.basename(file.fsPath, '.cls'));
        }

        return classes;
    }
}
