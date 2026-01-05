import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';

export class LayoutCleaner {
    private historyManager: HistoryManager;
    private backupManager: BackupManager;

    constructor(historyManager: HistoryManager, backupManager: BackupManager) {
        this.historyManager = historyManager;
        this.backupManager = backupManager;
    }

    /**
     * Main execute function - cleanup layouts
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
                `Remove ${fields.length} field(s) from ${objectName} layouts?`,
                'Yes', 'No'
            );

            if (confirm !== 'Yes') return;

            await this.processLayouts(objectName, fields);

        } catch (error) {
            vscode.window.showErrorMessage(`CleanForce Error: ${error}`);
        }
    }

    /**
     * Process Layout files with improved regex patterns
     */
    private async processLayouts(objectName: string, fields: string[]): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Cleaning Page Layouts...',
            cancellable: true
        }, async (progress, token) => {
            // Find layouts for the specified object
            const allLayouts = await vscode.workspace.findFiles('**/*.layout-meta.xml', '**/node_modules/**');
            const objectLayouts = allLayouts.filter(f => 
                path.basename(f.fsPath).toLowerCase().startsWith(objectName.toLowerCase() + '-') ||
                path.basename(f.fsPath).toLowerCase() === objectName.toLowerCase() + '.layout-meta.xml'
            );

            // If no object-specific layouts found, search all
            const layoutsToProcess = objectLayouts.length > 0 ? objectLayouts : allLayouts;

            let totalRemoved = 0;
            let filesModified = 0;
            const modifiedFiles: string[] = [];

            for (const file of layoutsToProcess) {
                if (token.isCancellationRequested) break;

                progress.report({ message: `Processing ${path.basename(file.fsPath)}...` });

                try {
                    let content = fs.readFileSync(file.fsPath, 'utf-8');
                    const originalContent = content;
                    let removed = 0;

                    for (const fieldName of fields) {
                        // PRECISE pattern: Match only layoutItems block that contains EXACTLY this field
                        // Use a function-based replace to check each match individually
                        const layoutItemRegex = /<layoutItems>[\s\S]*?<\/layoutItems>/g;
                        
                        const newContent = content.replace(layoutItemRegex, (match) => {
                            // Check if this specific layoutItems block contains our field
                            const fieldPattern = new RegExp(`<field>${this.escapeRegex(fieldName)}</field>`);
                            if (fieldPattern.test(match)) {
                                removed++;
                                return ''; // Remove this block
                            }
                            return match; // Keep this block
                        });
                        
                        content = newContent;
                    }

                    // Clean up extra whitespace/newlines left behind
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
                    console.error(`Error processing layout ${file.fsPath}:`, error);
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
                        metadataType: 'Layout'
                    }
                });
            }

            vscode.window.showInformationMessage(
                `✅ CleanForce: Removed ${totalRemoved} layout reference(s) from ${filesModified} file(s)`
            );
        });
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
