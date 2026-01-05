import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';

interface VisibilityWarning {
    file: string;
    field: string;
    type: 'visibilityRule' | 'filterCondition' | 'componentFilter';
    context: string;
}

export class FlexiPageCleaner {
    private historyManager: HistoryManager;
    private backupManager: BackupManager;

    constructor(historyManager: HistoryManager, backupManager: BackupManager) {
        this.historyManager = historyManager;
        this.backupManager = backupManager;
    }

    /**
     * Main execute function - cleanup FlexiPages (Lightning Pages)
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
                `Remove ${fields.length} field(s) from FlexiPages/Lightning Pages (layout fields only)?`,
                'Yes', 'No'
            );

            if (confirm !== 'Yes') return;

            await this.processFlexiPages(objectName, fields);

        } catch (error) {
            vscode.window.showErrorMessage(`CleanForce Error: ${error}`);
        }
    }

    /**
     * Process FlexiPage files - with visibility rule detection
     */
    private async processFlexiPages(objectName: string, fields: string[]): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Scanning Lightning Pages...',
            cancellable: true
        }, async (progress, token) => {
            const files = await vscode.workspace.findFiles('**/*.flexipage-meta.xml', '**/node_modules/**');

            let totalRemoved = 0;
            let filesModified = 0;
            const modifiedFiles: string[] = [];
            const visibilityWarnings: VisibilityWarning[] = [];
            const skippedFiles: string[] = [];

            for (const file of files) {
                if (token.isCancellationRequested) break;

                progress.report({ message: `Processing ${path.basename(file.fsPath)}...` });

                try {
                    let content = fs.readFileSync(file.fsPath, 'utf-8');
                    const originalContent = content;
                    let removed = 0;

                    for (const fieldName of fields) {
                        const fullFieldRef = `${objectName}.${fieldName}`;
                        let hasVisibilityRuleReference = false;

                        // FIRST: Check for visibility rules / filter conditions
                        // These should NOT be auto-removed - warn user instead
                        const visibilityPatterns = [
                            /<visibilityRule>[\s\S]*?<\/visibilityRule>/gi,
                            /<componentInstanceProperties>[\s\S]*?<n>visibilityRule<\/name>[\s\S]*?<\/componentInstanceProperties>/gi,
                            /<filterCriteria>[\s\S]*?<\/filterCriteria>/gi,
                            /<criteria>[\s\S]*?<\/criteria>/gi,
                        ];

                        for (const pattern of visibilityPatterns) {
                            const matches = content.match(pattern);
                            if (matches) {
                                for (const match of matches) {
                                    if (match.includes(fieldName) || match.includes(fullFieldRef)) {
                                        hasVisibilityRuleReference = true;
                                        visibilityWarnings.push({
                                            file: path.basename(file.fsPath),
                                            field: fieldName,
                                            type: match.includes('visibilityRule') ? 'visibilityRule' : 
                                                  match.includes('filterCriteria') ? 'filterCondition' : 'componentFilter',
                                            context: this.extractContext(match, fieldName)
                                        });
                                    }
                                }
                            }
                        }

                        // If this file has visibility rules referencing our field, skip removal for this field
                        if (hasVisibilityRuleReference) {
                            if (!skippedFiles.includes(file.fsPath)) {
                                skippedFiles.push(file.fsPath);
                            }
                            continue;
                        }

                        // SAFE TO REMOVE: Only layout field references (not in visibility rules)
                        
                        // Pattern 1: itemInstances containing fieldInstance with our field
                        // Handles:
                        // <itemInstances>
                        //     <fieldInstance>
                        //         <fieldItem>Record.Field__c</fieldItem>
                        //     </fieldInstance>
                        // </itemInstances>
                        const itemInstancesRegex = /<itemInstances>[\s\S]*?<\/itemInstances>/g;
                        content = content.replace(itemInstancesRegex, (match) => {
                            const recordFieldPattern = new RegExp(`<fieldItem>Record\\.${this.escapeRegex(fieldName)}</fieldItem>`);
                            const shortFieldPattern = new RegExp(`<fieldItem>${this.escapeRegex(fieldName)}</fieldItem>`);
                            const fullFieldPattern = new RegExp(`<fieldItem>${this.escapeRegex(fullFieldRef)}</fieldItem>`);
                            
                            if (recordFieldPattern.test(match) || shortFieldPattern.test(match) || fullFieldPattern.test(match)) {
                                removed++;
                                return '';
                            }
                            return match;
                        });

                        // Pattern 2: Standalone fieldInstance blocks
                        const fieldInstanceRegex = /<fieldInstance>[\s\S]*?<\/fieldInstance>/g;
                        content = content.replace(fieldInstanceRegex, (match) => {
                            const recordFieldPattern = new RegExp(`<fieldItem>Record\\.${this.escapeRegex(fieldName)}</fieldItem>`);
                            const shortFieldPattern = new RegExp(`<fieldItem>${this.escapeRegex(fieldName)}</fieldItem>`);
                            const fullFieldPattern = new RegExp(`<fieldItem>${this.escapeRegex(fullFieldRef)}</fieldItem>`);
                            
                            if (recordFieldPattern.test(match) || shortFieldPattern.test(match) || fullFieldPattern.test(match)) {
                                removed++;
                                return '';
                            }
                            return match;
                        });

                        // Pattern 3: componentInstanceProperties with fieldName value
                        const propRegex = /<componentInstanceProperties>[\s\S]*?<\/componentInstanceProperties>/g;
                        content = content.replace(propRegex, (match) => {
                            // Skip visibility-related properties
                            if (match.includes('<n>visibilityRule</n>') || 
                                match.includes('<n>criteria</n>') ||
                                match.includes('<n>filter</n>')) {
                                return match;
                            }
                            
                            const fieldNameProp = new RegExp(`<n>fieldName</n>[\\s\\S]*?<value>${this.escapeRegex(fieldName)}</value>`);
                            const fullFieldNameProp = new RegExp(`<n>fieldName</n>[\\s\\S]*?<value>${this.escapeRegex(fullFieldRef)}</value>`);
                            const recordFieldProp = new RegExp(`<n>fieldName</n>[\\s\\S]*?<value>Record\\.${this.escapeRegex(fieldName)}</value>`);
                            
                            if (fieldNameProp.test(match) || fullFieldNameProp.test(match) || recordFieldProp.test(match)) {
                                removed++;
                                return '';
                            }
                            return match;
                        });
                    }

                    // Clean up empty containers
                    content = content.replace(/<itemInstances>\s*<\/itemInstances>/g, '');
                    content = content.replace(/<fieldInstances>\s*<\/fieldInstances>/g, '');
                    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

                    if (content !== originalContent && removed > 0) {
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
                    console.error(`Error processing FlexiPage ${file.fsPath}:`, error);
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
                        metadataType: 'FlexiPage',
                        skippedDueToVisibilityRules: skippedFiles
                    }
                });
            }

            // Show results
            if (visibilityWarnings.length > 0) {
                this.showVisibilityWarnings(visibilityWarnings, skippedFiles);
                
                vscode.window.showWarningMessage(
                    `⚠️ CleanForce: Removed ${totalRemoved} layout field(s). ${visibilityWarnings.length} visibility rule reference(s) found - manual review required!`,
                    'View Details'
                ).then(selection => {
                    if (selection === 'View Details') {
                        vscode.commands.executeCommand('cleanforce.outputChannel.focus');
                    }
                });
            } else {
                vscode.window.showInformationMessage(
                    `✅ CleanForce: Removed ${totalRemoved} FlexiPage layout reference(s) from ${filesModified} file(s)`
                );
            }
        });
    }

    /**
     * Extract context around the field reference for display
     */
    private extractContext(match: string, fieldName: string): string {
        const lines = match.split('\n');
        for (const line of lines) {
            if (line.includes(fieldName)) {
                return line.trim().substring(0, 100) + (line.length > 100 ? '...' : '');
            }
        }
        return match.substring(0, 80) + '...';
    }

    /**
     * Show visibility warnings in output channel
     */
    private showVisibilityWarnings(warnings: VisibilityWarning[], skippedFiles: string[]): void {
        const outputChannel = vscode.window.createOutputChannel('CleanForce');
        outputChannel.clear();
        outputChannel.appendLine('═'.repeat(70));
        outputChannel.appendLine('⚠️  CLEANFORCE - VISIBILITY RULE WARNINGS');
        outputChannel.appendLine('═'.repeat(70));
        outputChannel.appendLine('');
        outputChannel.appendLine('The following fields are used in VISIBILITY RULES or FILTER CONDITIONS.');
        outputChannel.appendLine('These were NOT automatically removed to prevent breaking your Lightning Pages.');
        outputChannel.appendLine('');
        outputChannel.appendLine('⚡ WHY THIS MATTERS:');
        outputChannel.appendLine('   Removing fields from visibility rules can cause:');
        outputChannel.appendLine('   - Components to always show/hide incorrectly');
        outputChannel.appendLine('   - Filter conditions to fail silently');
        outputChannel.appendLine('   - Lightning page errors at runtime');
        outputChannel.appendLine('');
        outputChannel.appendLine('─'.repeat(70));
        outputChannel.appendLine('FIELDS REQUIRING MANUAL REVIEW:');
        outputChannel.appendLine('─'.repeat(70));
        outputChannel.appendLine('');

        // Group by file
        const byFile: { [key: string]: VisibilityWarning[] } = {};
        for (const warning of warnings) {
            if (!byFile[warning.file]) {
                byFile[warning.file] = [];
            }
            byFile[warning.file].push(warning);
        }

        for (const [file, fileWarnings] of Object.entries(byFile)) {
            outputChannel.appendLine(`📄 ${file}`);
            for (const warning of fileWarnings) {
                const typeLabel = warning.type === 'visibilityRule' ? '👁️ Visibility Rule' :
                                  warning.type === 'filterCondition' ? '🔍 Filter Condition' : '⚙️ Component Filter';
                outputChannel.appendLine(`   ${typeLabel}: ${warning.field}`);
                outputChannel.appendLine(`      Context: ${warning.context}`);
            }
            outputChannel.appendLine('');
        }

        outputChannel.appendLine('─'.repeat(70));
        outputChannel.appendLine('RECOMMENDED ACTIONS:');
        outputChannel.appendLine('─'.repeat(70));
        outputChannel.appendLine('');
        outputChannel.appendLine('1. Open each Lightning Page in Lightning App Builder');
        outputChannel.appendLine('2. Find components using these fields in visibility rules');
        outputChannel.appendLine('3. Update or remove the visibility conditions manually');
        outputChannel.appendLine('4. Save and activate the page');
        outputChannel.appendLine('');
        outputChannel.appendLine('═'.repeat(70));
        
        outputChannel.show();
    }

    private escapeRegex(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
