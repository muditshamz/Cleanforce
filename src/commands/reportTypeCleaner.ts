import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';

export class ReportTypeCleaner {
    private historyManager: HistoryManager;
    private backupManager: BackupManager;

    constructor(historyManager: HistoryManager, backupManager: BackupManager) {
        this.historyManager = historyManager;
        this.backupManager = backupManager;
    }

    /**
     * Main execute function - cleanup Report Types
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
                `Remove ${fields.length} field(s) from Report Types related to ${objectName}?`,
                'Yes', 'No'
            );

            if (confirm !== 'Yes') return;

            await this.processReportTypes(objectName, fields);

        } catch (error) {
            vscode.window.showErrorMessage(`CleanForce Error: ${error}`);
        }
    }

    /**
     * Process Report Type files
     */
    private async processReportTypes(objectName: string, fields: string[]): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Cleaning Report Types...',
            cancellable: true
        }, async (progress, token) => {
            // Report Types are in reportTypes folder
            const files = await vscode.workspace.findFiles('**/reportTypes/*.reportType-meta.xml', '**/node_modules/**');

            if (files.length === 0) {
                vscode.window.showWarningMessage('No Report Types found in workspace');
                return;
            }

            let totalRemoved = 0;
            let filesModified = 0;
            const modifiedFiles: string[] = [];
            let filesScanned = 0;

            for (const file of files) {
                if (token.isCancellationRequested) break;

                progress.report({ message: `Processing ${path.basename(file.fsPath)}...` });

                try {
                    let content = fs.readFileSync(file.fsPath, 'utf-8');
                    const originalContent = content;
                    let removed = 0;

                    // Check if this report type is related to our object
                    const isRelatedToObject = content.includes(`<baseObject>${objectName}</baseObject>`) ||
                        content.includes(`>${objectName}<`) ||
                        content.includes(`${objectName}.`) ||
                        content.toLowerCase().includes(objectName.toLowerCase());

                    if (!isRelatedToObject) continue;
                    filesScanned++;

                    for (const fieldName of fields) {
                        const fullFieldRef = `${objectName}.${fieldName}`;

                        // Report Types have <columns> with <field> elements
                        const columnRegex = /<columns>[\s\S]*?<\/columns>/g;
                        content = content.replace(columnRegex, (match) => {
                            const fieldPattern = new RegExp(`<field>${this.escapeRegex(fieldName)}</field>`);
                            const fullFieldPattern = new RegExp(`<field>${this.escapeRegex(fullFieldRef)}</field>`);
                            if (fieldPattern.test(match) || fullFieldPattern.test(match)) {
                                removed++;
                                return '';
                            }
                            return match;
                        });
                    }

                    // Clean up empty sections and extra whitespace
                    content = content.replace(/<sections>\s*<masterLabel>[^<]*<\/masterLabel>\s*<\/sections>/g, '');
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
                    console.error(`Error processing Report Type ${file.fsPath}:`, error);
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
                        metadataType: 'ReportType'
                    }
                });
            }

            vscode.window.showInformationMessage(
                `✅ CleanForce: Removed ${totalRemoved} Report Type column(s) from ${filesModified} file(s) (${filesScanned} related report types scanned)`
            );
        });
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
