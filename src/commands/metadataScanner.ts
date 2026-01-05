import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ScanResult {
    field: string;
    file: string;
    relativePath: string;
    type: string;
    count: number;
}

export class MetadataScanner {
    
    /**
     * Scan for field references across the project
     */
    async scanForFieldReferences(): Promise<ScanResult[]> {
        const objectName = await this.getObjectName();
        if (!objectName) return [];

        const fieldsInput = await vscode.window.showInputBox({
            prompt: 'Enter field API names to scan for (comma separated, or leave empty to scan all)',
            placeHolder: 'Field1__c, Field2__c (or leave empty for all)'
        });

        let fieldsToScan: string[] = [];
        
        if (fieldsInput && fieldsInput.trim()) {
            fieldsToScan = fieldsInput
                .split(/[,\n]+/)
                .map(f => `${objectName}.${f.trim().replace(`${objectName}.`, '')}`)
                .filter(f => f.length > objectName.length + 1);
        } else {
            // Scan for all fields of the object
            fieldsToScan = await this.getAllFieldsForObject(objectName);
        }

        if (fieldsToScan.length === 0) {
            vscode.window.showWarningMessage('No fields to scan');
            return [];
        }

        return await this.performScan(objectName, fieldsToScan);
    }

    /**
     * Scan for specific fields
     */
    async scanForSpecificFields(objectName: string, fields: string[]): Promise<ScanResult[]> {
        const fieldsToScan = fields.map(f => `${objectName}.${f.replace(`${objectName}.`, '')}`);
        return await this.performScan(objectName, fieldsToScan);
    }

    /**
     * Get all fields for an object from the project
     */
    private async getAllFieldsForObject(objectName: string): Promise<string[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return [];

        const fieldFiles = await vscode.workspace.findFiles(
            `**/objects/${objectName}/fields/*.field-meta.xml`,
            '**/node_modules/**'
        );

        return fieldFiles.map(f => {
            const fieldName = path.basename(f.fsPath, '.field-meta.xml');
            return `${objectName}.${fieldName}`;
        });
    }

    /**
     * Perform the actual scan
     */
    private async performScan(objectName: string, fieldsToScan: string[]): Promise<ScanResult[]> {
        const results: ScanResult[] = [];
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return results;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Scanning for field references...',
            cancellable: true
        }, async (progress, token) => {
            // Define file patterns and their types
            const scanPatterns = [
                { pattern: '**/*.permissionset-meta.xml', type: 'Permission Set' },
                { pattern: '**/*.profile-meta.xml', type: 'Profile' },
                { pattern: '**/*.layout-meta.xml', type: 'Layout' },
                { pattern: '**/*.flexipage-meta.xml', type: 'Lightning Page' },
                { pattern: '**/*.flow-meta.xml', type: 'Flow' },
                { pattern: '**/*.report-meta.xml', type: 'Report' },
                { pattern: '**/*.dashboard-meta.xml', type: 'Dashboard' },
                { pattern: '**/*.cls', type: 'Apex Class' },
                { pattern: '**/*.trigger', type: 'Apex Trigger' },
                { pattern: '**/*.js', type: 'JavaScript' },
                { pattern: '**/*.cmp', type: 'Aura Component' },
                { pattern: '**/*.html', type: 'LWC HTML' }
            ];

            const fieldCounts = new Map<string, Map<string, { count: number; type: string; file: string }>>();

            for (const { pattern, type } of scanPatterns) {
                if (token.isCancellationRequested) break;

                progress.report({ message: `Scanning ${type}s...` });

                const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');

                for (const file of files) {
                    if (token.isCancellationRequested) break;

                    try {
                        const content = fs.readFileSync(file.fsPath, 'utf-8');
                        
                        for (const field of fieldsToScan) {
                            const fieldName = field.split('.')[1]; // Get just the field name
                            
                            // Check for both full reference and just field name
                            const fullMatches = (content.match(new RegExp(this.escapeRegex(field), 'g')) || []).length;
                            const shortMatches = (content.match(new RegExp(this.escapeRegex(fieldName), 'g')) || []).length;
                            
                            const totalMatches = Math.max(fullMatches, shortMatches);
                            
                            if (totalMatches > 0) {
                                if (!fieldCounts.has(field)) {
                                    fieldCounts.set(field, new Map());
                                }
                                fieldCounts.get(field)!.set(file.fsPath, {
                                    count: totalMatches,
                                    type,
                                    file: file.fsPath
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`Error reading ${file.fsPath}:`, error);
                    }
                }
            }

            // Convert to results array
            for (const [field, files] of fieldCounts) {
                for (const [filePath, data] of files) {
                    results.push({
                        field,
                        file: filePath,
                        relativePath: vscode.workspace.asRelativePath(filePath),
                        type: data.type,
                        count: data.count
                    });
                }
            }
        });

        // Display results
        this.displayResults(objectName, fieldsToScan, results);

        return results;
    }

    /**
     * Display scan results
     */
    private displayResults(objectName: string, fieldsScanned: string[], results: ScanResult[]): void {
        const outputChannel = vscode.window.createOutputChannel('CleanForce Scan Results');
        outputChannel.clear();

        outputChannel.appendLine('═'.repeat(70));
        outputChannel.appendLine('   CLEANFORCE - FIELD REFERENCE SCAN RESULTS');
        outputChannel.appendLine('═'.repeat(70));
        outputChannel.appendLine('');
        outputChannel.appendLine(`📦 Object: ${objectName}`);
        outputChannel.appendLine(`🔍 Fields scanned: ${fieldsScanned.length}`);
        outputChannel.appendLine(`📄 Total references found: ${results.length}`);
        outputChannel.appendLine('');
        outputChannel.appendLine('─'.repeat(70));

        if (results.length === 0) {
            outputChannel.appendLine('');
            outputChannel.appendLine('✅ No references found! Fields are safe to delete.');
            outputChannel.appendLine('');
        } else {
            // Group by field
            const byField = new Map<string, ScanResult[]>();
            for (const result of results) {
                const group = byField.get(result.field) || [];
                group.push(result);
                byField.set(result.field, group);
            }

            // Group by type for summary
            const byType = new Map<string, number>();
            for (const result of results) {
                byType.set(result.type, (byType.get(result.type) || 0) + result.count);
            }

            outputChannel.appendLine('');
            outputChannel.appendLine('📊 SUMMARY BY TYPE:');
            outputChannel.appendLine('');
            for (const [type, count] of byType) {
                outputChannel.appendLine(`   ${type}: ${count} reference(s)`);
            }

            outputChannel.appendLine('');
            outputChannel.appendLine('─'.repeat(70));
            outputChannel.appendLine('');
            outputChannel.appendLine('📋 DETAILED RESULTS:');
            outputChannel.appendLine('');

            for (const [field, refs] of byField) {
                const totalRefs = refs.reduce((sum, r) => sum + r.count, 0);
                outputChannel.appendLine(`🏷️  ${field} (${totalRefs} total reference(s))`);
                outputChannel.appendLine('');

                // Group refs by type
                const refsByType = new Map<string, ScanResult[]>();
                for (const ref of refs) {
                    const group = refsByType.get(ref.type) || [];
                    group.push(ref);
                    refsByType.set(ref.type, group);
                }

                for (const [type, typeRefs] of refsByType) {
                    outputChannel.appendLine(`   📁 ${type}:`);
                    for (const ref of typeRefs) {
                        outputChannel.appendLine(`      • ${ref.relativePath} (${ref.count})`);
                    }
                }
                outputChannel.appendLine('');
            }

            // Fields with no references
            const fieldsWithRefs = new Set(results.map(r => r.field));
            const fieldsWithoutRefs = fieldsScanned.filter(f => !fieldsWithRefs.has(f));

            if (fieldsWithoutRefs.length > 0) {
                outputChannel.appendLine('─'.repeat(70));
                outputChannel.appendLine('');
                outputChannel.appendLine('✅ FIELDS WITH NO REFERENCES (safe to delete):');
                outputChannel.appendLine('');
                for (const field of fieldsWithoutRefs) {
                    outputChannel.appendLine(`   • ${field}`);
                }
                outputChannel.appendLine('');
            }
        }

        outputChannel.appendLine('═'.repeat(70));
        outputChannel.appendLine('');
        outputChannel.appendLine('💡 TIP: Use "CleanForce: Remove Field References" to remove these references');
        outputChannel.appendLine('');

        outputChannel.show();

        // Show summary notification
        if (results.length > 0) {
            vscode.window.showInformationMessage(
                `CleanForce: Found ${results.length} reference(s) for ${new Set(results.map(r => r.field)).size} field(s)`,
                'Remove All',
                'View Details'
            ).then(selection => {
                if (selection === 'Remove All') {
                    vscode.commands.executeCommand('cleanforce.removeFields');
                } else if (selection === 'View Details') {
                    outputChannel.show();
                }
            });
        } else {
            vscode.window.showInformationMessage('CleanForce: No field references found!');
        }
    }

    /**
     * Get object name from user
     */
    private async getObjectName(): Promise<string | undefined> {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter the Object API Name to scan',
            placeHolder: 'Case, Account, Custom_Object__c'
        });
        return input?.trim();
    }

    /**
     * Escape special regex characters
     */
    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
