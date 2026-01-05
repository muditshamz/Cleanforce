import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';

export class RecordTypeCleaner {
    private historyManager: HistoryManager;
    private backupManager: BackupManager;

    constructor(historyManager: HistoryManager, backupManager: BackupManager) {
        this.historyManager = historyManager;
        this.backupManager = backupManager;
    }

    /**
     * Main execute function - cleanup Record Types
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

            // Step 2: Get fields to remove (picklist fields)
            const fieldsInput = await vscode.window.showInputBox({
                prompt: 'Enter picklist field API names to remove from Record Types (comma-separated)',
                placeHolder: 'Status__c, Type__c, Category__c',
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
                `Remove ${fields.length} picklist field(s) from ${objectName} Record Types?`,
                'Yes', 'No'
            );

            if (confirm !== 'Yes') return;

            await this.processRecordTypes(objectName, fields);

        } catch (error) {
            vscode.window.showErrorMessage(`CleanForce Error: ${error}`);
        }
    }

    /**
     * Process RecordType files - ONLY for the specified object
     */
    private async processRecordTypes(objectName: string, fields: string[]): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Cleaning Record Types...',
            cancellable: true
        }, async (progress, token) => {
            // Find record types ONLY for the specified object
            const rtPattern = `**/objects/${objectName}/recordTypes/*.recordType-meta.xml`;
            const files = await vscode.workspace.findFiles(rtPattern, '**/node_modules/**');

            if (files.length === 0) {
                vscode.window.showWarningMessage(`No Record Types found for object: ${objectName}`);
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
                        // PRECISE pattern: Match only picklistValues block that contains EXACTLY this field
                        // Use a function-based replace to check each match individually
                        const picklistRegex = /<picklistValues>[\s\S]*?<\/picklistValues>/g;
                        
                        const newContent = content.replace(picklistRegex, (match) => {
                            // Check if this specific picklistValues block contains our field
                            const fieldPattern = new RegExp(`<picklist>${this.escapeRegex(fieldName)}</picklist>`);
                            if (fieldPattern.test(match)) {
                                removed++;
                                return ''; // Remove this block
                            }
                            return match; // Keep this block
                        });
                        
                        content = newContent;
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
                    console.error(`Error processing RecordType ${file.fsPath}:`, error);
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
                        metadataType: 'RecordType'
                    }
                });
            }

            vscode.window.showInformationMessage(
                `✅ CleanForce: Removed ${totalRemoved} RecordType picklist reference(s) from ${filesModified} file(s)`
            );
        });
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
