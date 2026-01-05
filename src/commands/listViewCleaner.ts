import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';

export class ListViewCleaner {
    private historyManager: HistoryManager;
    private backupManager: BackupManager;

    constructor(historyManager: HistoryManager, backupManager: BackupManager) {
        this.historyManager = historyManager;
        this.backupManager = backupManager;
    }

    /**
     * Main execute function - cleanup List Views
     */
    async execute(): Promise<void> {
        try {
            // Step 1: Get object name
            const objectName = await vscode.window.showInputBox({
                prompt: 'Enter the Object API Name (e.g., Account, Contact, Custom_Object__c)',
                placeHolder: 'Account',
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
                prompt: 'Enter field API names to remove from List Views (comma-separated)',
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
                `Remove ${fields.length} field(s) from ${objectName} List Views?`,
                'Yes', 'No'
            );

            if (confirm !== 'Yes') return;

            await this.processListViews(objectName, fields);

        } catch (error) {
            vscode.window.showErrorMessage(`CleanForce Error: ${error}`);
        }
    }

    /**
     * Process ListView files - ONLY for the specified object with PRECISE matching
     */
    private async processListViews(objectName: string, fields: string[]): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Cleaning List Views...',
            cancellable: true
        }, async (progress, token) => {
            // Find list views ONLY for the specified object
            const lvPattern = `**/objects/${objectName}/listViews/*.listView-meta.xml`;
            const files = await vscode.workspace.findFiles(lvPattern, '**/node_modules/**');

            if (files.length === 0) {
                vscode.window.showWarningMessage(`No List Views found for object: ${objectName}`);
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
                        // Remove columns containing the field - simple exact match
                        const columnPattern = new RegExp(
                            `\\s*<columns>${this.escapeRegex(fieldName)}</columns>`,
                            'g'
                        );
                        let matches = content.match(columnPattern);
                        if (matches) {
                            removed += matches.length;
                            content = content.replace(columnPattern, '');
                        }

                        // Remove filter references - use function-based replace for precision
                        const filterRegex = /<filters>[\s\S]*?<\/filters>/g;
                        content = content.replace(filterRegex, (match) => {
                            const fieldPattern = new RegExp(`<field>${this.escapeRegex(fieldName)}</field>`);
                            if (fieldPattern.test(match)) {
                                removed++;
                                return ''; // Remove this filter block
                            }
                            return match; // Keep this block
                        });
                    }

                    // Clean up multiple newlines
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
                    console.error(`Error processing ListView ${file.fsPath}:`, error);
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
                        metadataType: 'ListView'
                    }
                });
            }

            vscode.window.showInformationMessage(
                `✅ CleanForce: Removed ${totalRemoved} ListView reference(s) from ${filesModified} file(s)`
            );
        });
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
