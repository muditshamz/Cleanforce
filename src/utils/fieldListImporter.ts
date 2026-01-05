import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class FieldListImporter {
    async importFromFile(): Promise<string[]> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Field Lists': ['csv', 'txt', 'xlsx', 'xls'],
                'All Files': ['*']
            },
            title: 'Select file containing field names'
        });

        if (!fileUri || fileUri.length === 0) return [];

        const filePath = fileUri[0].fsPath;
        const ext = path.extname(filePath).toLowerCase();

        try {
            if (ext === '.csv' || ext === '.txt') {
                const content = fs.readFileSync(filePath, 'utf-8');
                const fields = content
                    .split(/[,\n\r]+/)
                    .map(f => f.trim().replace(/["']/g, ''))
                    .filter(f => f.length > 0 && !f.toLowerCase().includes('field'));

                vscode.window.showInformationMessage(`Imported ${fields.length} field(s) from file`);
                return fields;
            } else {
                vscode.window.showWarningMessage('Excel import requires additional setup. Please use CSV format.');
                return [];
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error reading file: ${error}`);
            return [];
        }
    }
}
