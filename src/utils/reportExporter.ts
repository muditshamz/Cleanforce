import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryEntry } from './historyManager';

/**
 * Report Exporter - Export cleanup reports
 */
export class ReportExporter {
    async export(history: HistoryEntry[]): Promise<void> {
        const format = await vscode.window.showQuickPick([
            { label: '📄 Markdown', value: 'md' },
            { label: '📊 CSV', value: 'csv' },
            { label: '📋 JSON', value: 'json' },
            { label: '📑 HTML', value: 'html' }
        ], {
            placeHolder: 'Select export format'
        });

        if (!format) return;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `cleanforce-report-${timestamp}.${format.value}`;
        const filePath = path.join(workspaceFolder.uri.fsPath, fileName);

        let content = '';

        switch (format.value) {
            case 'md':
                content = this.generateMarkdown(history);
                break;
            case 'csv':
                content = this.generateCSV(history);
                break;
            case 'json':
                content = JSON.stringify(history, null, 2);
                break;
            case 'html':
                content = this.generateHTML(history);
                break;
        }

        fs.writeFileSync(filePath, content);

        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);

        vscode.window.showInformationMessage(`✅ Report exported to ${fileName}`);
    }

    private generateMarkdown(history: HistoryEntry[]): string {
        let md = '# CleanForce Report\n\n';
        md += `Generated: ${new Date().toLocaleString()}\n\n`;
        md += `Total Operations: ${history.length}\n\n`;
        md += '---\n\n';
        md += '## Operation History\n\n';

        for (const entry of history) {
            md += `### ${entry.type}\n`;
            md += `- **Date:** ${entry.timestamp.toLocaleString()}\n`;
            if (entry.details.object) {
                md += `- **Object:** ${entry.details.object}\n`;
            }
            if (entry.details.totalRemoved) {
                md += `- **Items Removed:** ${entry.details.totalRemoved}\n`;
            }
            if (entry.details.fields) {
                md += `- **Fields:** ${entry.details.fields.length}\n`;
            }
            md += '\n';
        }

        return md;
    }

    private generateCSV(history: HistoryEntry[]): string {
        let csv = 'Type,Date,Object,Items Removed,Fields Count\n';

        for (const entry of history) {
            csv += `"${entry.type}","${entry.timestamp.toISOString()}","${entry.details.object || ''}","${entry.details.totalRemoved || 0}","${entry.details.fields?.length || 0}"\n`;
        }

        return csv;
    }

    private generateHTML(history: HistoryEntry[]): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>CleanForce Report</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
        h1 { color: #00A1E0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: #00A1E0; color: white; }
        tr:nth-child(even) { background: #f9f9f9; }
    </style>
</head>
<body>
    <h1>🧹⚡ CleanForce Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <p>Total Operations: ${history.length}</p>
    <table>
        <tr>
            <th>Type</th>
            <th>Date</th>
            <th>Object</th>
            <th>Items Removed</th>
        </tr>
        ${history.map(e => `
        <tr>
            <td>${e.type}</td>
            <td>${e.timestamp.toLocaleString()}</td>
            <td>${e.details.object || '-'}</td>
            <td>${e.details.totalRemoved || 0}</td>
        </tr>
        `).join('')}
    </table>
</body>
</html>`;
    }
}

/**
 * Field List Importer - Import fields from CSV/Excel
 */
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
