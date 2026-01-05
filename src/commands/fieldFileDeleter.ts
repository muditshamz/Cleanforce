import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';

export class FieldFileDeleter {
    constructor(
        private historyManager: HistoryManager,
        private backupManager: BackupManager
    ) {}

    async execute(): Promise<void> {
        const objectName = await vscode.window.showInputBox({
            prompt: 'Enter the Object API Name',
            placeHolder: 'Case, Account, Custom_Object__c'
        });

        if (!objectName) return;

        const fieldsInput = await vscode.window.showInputBox({
            prompt: 'Enter field API names to delete (comma separated)',
            placeHolder: 'Field1__c, Field2__c, Field3__c'
        });

        if (!fieldsInput) return;

        const fields = fieldsInput.split(',').map(f => f.trim()).filter(f => f);
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const fieldFolders = await vscode.workspace.findFiles(
            `**/objects/${objectName}/fields/*.field-meta.xml`,
            '**/node_modules/**',
            1
        );

        if (fieldFolders.length === 0) {
            vscode.window.showErrorMessage(`Could not find fields folder for ${objectName}`);
            return;
        }

        const fieldsFolder = path.dirname(fieldFolders[0].fsPath);
        const filesToDelete: string[] = [];
        const filesNotFound: string[] = [];

        for (const field of fields) {
            // Sanitize field name to prevent path traversal
            const sanitizedField = field.replace(/[^a-zA-Z0-9_]/g, '');
            if (sanitizedField !== field) {
                vscode.window.showWarningMessage(`Field name "${field}" contains invalid characters, skipping`);
                continue;
            }
            const filePath = path.join(fieldsFolder, `${sanitizedField}.field-meta.xml`);
            if (fs.existsSync(filePath)) {
                filesToDelete.push(filePath);
            } else {
                filesNotFound.push(field);
            }
        }

        if (filesToDelete.length === 0) {
            vscode.window.showErrorMessage('No field files found to delete');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete ${filesToDelete.length} field file(s)?${filesNotFound.length > 0 ? ` (${filesNotFound.length} not found)` : ''}`,
            { modal: true },
            'Yes, Delete'
        );

        if (confirm !== 'Yes, Delete') return;

        const config = vscode.workspace.getConfiguration('cleanforce');
        let deleted = 0;

        for (const filePath of filesToDelete) {
            try {
                if (config.get('createBackup')) {
                    await this.backupManager.createBackup(filePath);
                }
                fs.unlinkSync(filePath);
                deleted++;
            } catch (err) {
                console.error(`Failed to delete ${filePath}:`, err);
            }
        }

        this.historyManager.addEntry({
            type: OperationType.DELETE_FIELD_FILES,
            timestamp: new Date(),
            details: {
                object: objectName,
                fields: fields,
                filesDeleted: filesToDelete,
                totalRemoved: deleted
            }
        });

        vscode.window.showInformationMessage(`✅ CleanForce: Deleted ${deleted} field file(s)`);
    }
}
