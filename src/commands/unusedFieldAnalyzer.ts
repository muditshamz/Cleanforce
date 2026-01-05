import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class UnusedFieldAnalyzer {
    async execute(): Promise<void> {
        const objectName = await vscode.window.showInputBox({
            prompt: 'Enter the Object API Name to analyze',
            placeHolder: 'Case, Account, Custom_Object__c'
        });

        if (!objectName) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Analyzing field usage...',
            cancellable: false
        }, async () => {
            const fieldFiles = await vscode.workspace.findFiles(
                `**/objects/${objectName}/fields/*.field-meta.xml`,
                '**/node_modules/**'
            );

            const allFields = fieldFiles.map(f => path.basename(f.fsPath, '.field-meta.xml'));
            const usedFields = new Set<string>();

            const codeFiles = await vscode.workspace.findFiles(
                '**/*.{cls,trigger,js,cmp,html,flow-meta.xml,layout-meta.xml}',
                '**/node_modules/**'
            );

            for (const file of codeFiles) {
                const content = fs.readFileSync(file.fsPath, 'utf-8');
                for (const field of allFields) {
                    if (content.includes(field)) {
                        usedFields.add(field);
                    }
                }
            }

            const unusedFields = allFields.filter(f => !usedFields.has(f));

            const outputChannel = vscode.window.createOutputChannel('CleanForce Analysis');
            outputChannel.clear();
            outputChannel.appendLine('═'.repeat(60));
            outputChannel.appendLine('CLEANFORCE - UNUSED FIELD ANALYSIS');
            outputChannel.appendLine('═'.repeat(60));
            outputChannel.appendLine('');
            outputChannel.appendLine(`Object: ${objectName}`);
            outputChannel.appendLine(`Total fields: ${allFields.length}`);
            outputChannel.appendLine(`Used fields: ${usedFields.size}`);
            outputChannel.appendLine(`Potentially unused: ${unusedFields.length}`);
            outputChannel.appendLine('');

            if (unusedFields.length > 0) {
                outputChannel.appendLine('⚠️ POTENTIALLY UNUSED FIELDS:');
                outputChannel.appendLine('');
                for (const field of unusedFields) {
                    outputChannel.appendLine(`   • ${field}`);
                }
                outputChannel.appendLine('');
                outputChannel.appendLine('Note: These fields may still be used in:');
                outputChannel.appendLine('  - Reports and Dashboards');
                outputChannel.appendLine('  - Validation Rules');
                outputChannel.appendLine('  - Formula Fields');
                outputChannel.appendLine('  - External integrations');
            } else {
                outputChannel.appendLine('✅ All fields appear to be in use!');
            }

            outputChannel.appendLine('');
            outputChannel.appendLine('═'.repeat(60));
            outputChannel.show();

            if (unusedFields.length > 0) {
                vscode.window.showInformationMessage(
                    `Found ${unusedFields.length} potentially unused field(s)`,
                    'Remove References',
                    'View Details'
                ).then(selection => {
                    if (selection === 'Remove References') {
                        vscode.commands.executeCommand('cleanforce.removeFields');
                    }
                });
            }
        });
    }
}
