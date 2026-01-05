import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';

export class QuickActionCleaner {
    private historyManager: HistoryManager;
    private backupManager: BackupManager;

    constructor(historyManager: HistoryManager, backupManager: BackupManager) {
        this.historyManager = historyManager;
        this.backupManager = backupManager;
    }

    /**
     * Main execute function - cleanup Quick Actions
     */
    async execute(): Promise<void> {
        try {
            // Step 1: Get object name
            const objectName = await vscode.window.showInputBox({
                prompt: 'Enter the Object API Name (e.g., Account, Contact, Case)',
                placeHolder: 'Case',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Object name is required';
                    }
                    return null;
                }
            });

            if (!objectName) return;

            // Step 2: Get fields to remove
            const fieldsInput = await vscode.window.showInputBox({
                prompt: 'Enter field API names to remove (comma-separated)',
                placeHolder: 'Field1__c, Field2__c, Field3__c',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'At least one field is required';
                    }
                    return null;
                }
            });

            if (!fieldsInput) return;

            const fields = fieldsInput.split(',').map((f: string) => f.trim()).filter((f: string) => f.length > 0);
            
            if (fields.length === 0) {
                vscode.window.showErrorMessage('No valid fields provided');
                return;
            }

            // Confirm
            const confirm = await vscode.window.showWarningMessage(
                `Remove ${fields.length} field(s) from ${objectName} Quick Actions?`,
                'Yes', 'No'
            );

            if (confirm !== 'Yes') return;

            await this.processQuickActions(objectName, fields);

        } catch (error) {
            vscode.window.showErrorMessage(`CleanForce Error: ${error}`);
        }
    }

    /**
     * Process Quick Action files
     */
    private async processQuickActions(objectName: string, fields: string[]): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Cleaning Quick Actions...',
            cancellable: true
        }, async (progress, token) => {
            // Quick Actions can be in objects folder or standalone
            const qaPattern1 = `**/objects/${objectName}/quickActions/*.quickAction-meta.xml`;
            const qaPattern2 = `**/${objectName}.*.quickAction-meta.xml`;
            
            const files1 = await vscode.workspace.findFiles(qaPattern1, '**/node_modules/**');
            const files2 = await vscode.workspace.findFiles(qaPattern2, '**/node_modules/**');
            
            // Combine and deduplicate
            const fileSet = new Set<string>();
            [...files1, ...files2].forEach(f => fileSet.add(f.fsPath));
            const files = Array.from(fileSet).map(f => vscode.Uri.file(f));

            if (files.length === 0) {
                vscode.window.showWarningMessage(`No Quick Actions found for object: ${objectName}`);
                return;
            }

            let totalRemoved = 0;
            let filesModified = 0;
            const modifiedFiles: string[] = [];

            for (const file of files) {
                if (token.isCancellationRequested) break;

                progress.report({ message: `Processing ${path.basename(file.fsPath)}...` });

                try {
                    let content = fs.readFileSync(file.fsPath, 'utf-8');
                    const originalContent = content;
                    let removed = 0;

                    for (const fieldName of fields) {
                        // Quick Actions have layout sections with layoutItems
                        const layoutItemRegex = /<layoutItems>[\s\S]*?<\/layoutItems>/g;
                        content = content.replace(layoutItemRegex, (match) => {
                            const fieldPattern = new RegExp(`<field>${this.escapeRegex(fieldName)}</field>`);
                            if (fieldPattern.test(match)) {
                                removed++;
                                return '';
                            }
                            return match;
                        });

                        // Also check for quickActionLayoutItems
                        const qaItemRegex = /<quickActionLayoutItems>[\s\S]*?<\/quickActionLayoutItems>/g;
                        content = content.replace(qaItemRegex, (match) => {
                            const fieldPattern = new RegExp(`<field>${this.escapeRegex(fieldName)}</field>`);
                            if (fieldPattern.test(match)) {
                                removed++;
                                return '';
                            }
                            return match;
                        });
                    }

                    // Clean up empty columns and extra whitespace
                    content = content.replace(/<quickActionLayoutColumns>\s*<\/quickActionLayoutColumns>/g, '');
                    content = content.replace(/<layoutColumns>\s*<\/layoutColumns>/g, '');
                    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

                    if (content !== originalContent) {
                        const config = vscode.workspace.getConfiguration('cleanforce');
                        if (config.get('createBackup')) {
                            await this.backupManager.createBackup(file.fsPath);
                        }
                        fs.writeFileSync(file.fsPath, content);
                        totalRemoved += removed;
                        filesModified++;
                        modifiedFiles.push(file.fsPath);
                    }
                } catch (error) {
                    console.error(`Error processing Quick Action ${file.fsPath}:`, error);
                }
            }

            // Record in history
            if (totalRemoved > 0) {
                this.historyManager.addEntry({
                    type: OperationType.REMOVE_FIELD_REFERENCES,
                    timestamp: new Date(),
                    details: {
                        object: objectName,
                        fields: fields,
                        filesModified: modifiedFiles,
                        totalRemoved,
                        metadataType: 'QuickAction'
                    }
                });
            }

            vscode.window.showInformationMessage(
                `✅ CleanForce: Removed ${totalRemoved} Quick Action reference(s) from ${filesModified} file(s)`
            );
        });
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
