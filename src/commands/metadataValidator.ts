import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ValidationProblem {
    type: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    suggestion?: string;
}

export class MetadataValidator {
    async validate(): Promise<ValidationProblem[]> {
        const problems: ValidationProblem[] = [];

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Validating metadata...',
            cancellable: false
        }, async () => {
            // Check for empty permission sets
            const psFiles = await vscode.workspace.findFiles(
                '**/*.permissionset-meta.xml',
                '**/node_modules/**'
            );

            for (const file of psFiles) {
                const content = fs.readFileSync(file.fsPath, 'utf-8');
                
                if (content.includes('<field></field>')) {
                    problems.push({
                        type: 'error',
                        message: `Empty field reference in ${path.basename(file.fsPath)}`,
                        file: file.fsPath,
                        suggestion: 'Remove the empty field permission block'
                    });
                }
            }

            // Check for profiles with potential issues
            const profileFiles = await vscode.workspace.findFiles(
                '**/*.profile-meta.xml',
                '**/node_modules/**'
            );

            for (const file of profileFiles) {
                const stats = fs.statSync(file.fsPath);
                if (stats.size > 1000000) {
                    problems.push({
                        type: 'warning',
                        message: `Large profile file: ${path.basename(file.fsPath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
                        file: file.fsPath,
                        suggestion: 'Consider migrating permissions to Permission Sets'
                    });
                }
            }

            // Check for orphaned field files
            const fieldFiles = await vscode.workspace.findFiles(
                '**/objects/*/fields/*.field-meta.xml',
                '**/node_modules/**'
            );

            for (const file of fieldFiles.slice(0, 100)) {
                try {
                    const content = fs.readFileSync(file.fsPath, 'utf-8');
                    if (!content.includes('<CustomField')) {
                        problems.push({
                            type: 'error',
                            message: `Invalid field file: ${path.basename(file.fsPath)}`,
                            file: file.fsPath,
                            suggestion: 'Check if the field file has valid XML structure'
                        });
                    }
                } catch (err) {
                    problems.push({
                        type: 'error',
                        message: `Cannot read field file: ${path.basename(file.fsPath)}`,
                        file: file.fsPath
                    });
                }
            }
        });

        if (problems.length === 0) {
            vscode.window.showInformationMessage('✅ CleanForce: No issues found in metadata!');
        } else {
            vscode.window.showWarningMessage(
                `CleanForce: Found ${problems.length} potential issue(s)`,
                'View Issues'
            ).then(selection => {
                if (selection === 'View Issues') {
                    vscode.commands.executeCommand('cleanforceProblems.focus');
                }
            });
        }

        return problems;
    }
}
