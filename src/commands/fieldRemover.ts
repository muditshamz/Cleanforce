import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager, OperationType } from '../utils/historyManager';
import { BackupManager } from '../utils/backupManager';
import { sanitizeApiName, sanitizeFieldReference, isPathWithinWorkspace, escapeRegex } from '../utils/security';

export interface FieldReference {
    field: string;
    file: string;
    line?: number;
    type: 'fieldPermission' | 'layoutItem' | 'reportColumn' | 'flowReference' | 'apexReference';
}

export class FieldRemover {
    private historyManager: HistoryManager;
    private backupManager: BackupManager;
    private fieldsToRemove: string[] = [];
    private objectName: string = '';

    constructor(historyManager: HistoryManager, backupManager: BackupManager) {
        this.historyManager = historyManager;
        this.backupManager = backupManager;
    }

    /**
     * Main execute function - remove fields from all metadata files
     */
    async execute(): Promise<void> {
        try {
            // Step 1: Get object name
            const objName = await this.getObjectName();
            if (!objName) return;
            
            // Validate object name
            const sanitizedObjName = sanitizeApiName(objName);
            if (!sanitizedObjName) {
                vscode.window.showErrorMessage('Invalid object name. Use only letters, numbers, and underscores.');
                return;
            }
            this.objectName = sanitizedObjName;

            // Step 2: Get fields to remove (multiple input methods)
            const fields = await this.getFieldsToRemove();
            if (!fields || fields.length === 0) return;
            
            // Validate and sanitize all field names
            const validFields: string[] = [];
            for (const f of fields) {
                const fieldName = f.replace(`${this.objectName}.`, '');
                const sanitized = sanitizeApiName(fieldName);
                if (sanitized) {
                    validFields.push(`${this.objectName}.${sanitized}`);
                } else {
                    vscode.window.showWarningMessage(`Skipping invalid field name: ${f}`);
                }
            }
            
            if (validFields.length === 0) {
                vscode.window.showErrorMessage('No valid field names provided');
                return;
            }
            
            this.fieldsToRemove = validFields;

            // Step 3: Show preview and confirm
            const confirmed = await this.showPreviewAndConfirm();
            if (!confirmed) return;

            // Step 4: Process files
            await this.processAllFiles();

        } catch (error) {
            vscode.window.showErrorMessage(`CleanForce Error: ${error}`);
        }
    }

    /**
     * Execute on a specific file
     */
    async executeOnFile(uri?: vscode.Uri): Promise<void> {
        try {
            const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (!fileUri) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }

            const objName = await this.getObjectName();
            if (!objName) return;
            this.objectName = objName;

            const fields = await this.getFieldsToRemove();
            if (!fields || fields.length === 0) return;
            this.fieldsToRemove = fields.map(f => `${this.objectName}.${f.replace(`${this.objectName}.`, '')}`);

            const result = await this.processFile(fileUri.fsPath);
            
            if (result.removed > 0) {
                vscode.window.showInformationMessage(
                    `CleanForce: Removed ${result.removed} field permission(s) from ${path.basename(fileUri.fsPath)}`
                );
            } else {
                vscode.window.showInformationMessage('No matching field references found in this file');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`CleanForce Error: ${error}`);
        }
    }

    /**
     * Remove Apex class/trigger references
     */
    async removeApexReferences(): Promise<void> {
        const apexNames = await vscode.window.showInputBox({
            prompt: 'Enter Apex class/trigger names to remove (comma separated)',
            placeHolder: 'MyClass, MyTrigger, AnotherClass'
        });

        if (!apexNames) return;

        const names = apexNames.split(',').map(n => n.trim()).filter(n => n);
        await this.removeMetadataReferences(names, 'classAccesses', 'apexClass');
        await this.removeMetadataReferences(names, 'apexPageAccesses', 'apexPage');
    }

    /**
     * Remove Object references
     */
    async removeObjectReferences(): Promise<void> {
        const objectNames = await vscode.window.showInputBox({
            prompt: 'Enter Object API names to remove (comma separated)',
            placeHolder: 'Custom_Object__c, Another_Object__c'
        });

        if (!objectNames) return;

        const names = objectNames.split(',').map(n => n.trim()).filter(n => n);
        await this.removeMetadataReferences(names, 'objectPermissions', 'object');
        await this.removeMetadataReferences(names, 'tabSettings', 'tab');
    }

    /**
     * Remove Flow references
     */
    async removeFlowReferences(): Promise<void> {
        const flowNames = await vscode.window.showInputBox({
            prompt: 'Enter Flow API names to remove (comma separated)',
            placeHolder: 'My_Flow, Another_Flow'
        });

        if (!flowNames) return;

        const names = flowNames.split(',').map(n => n.trim()).filter(n => n);
        await this.removeMetadataReferences(names, 'flowAccesses', 'flow');
    }

    /**
     * Remove Layout item references
     */
    async removeLayoutReferences(): Promise<void> {
        const objName = await this.getObjectName();
        if (!objName) return;

        const fieldNames = await vscode.window.showInputBox({
            prompt: 'Enter field names to remove from layouts (comma separated)',
            placeHolder: 'Field1__c, Field2__c'
        });

        if (!fieldNames) return;

        const fields = fieldNames.split(',').map(f => f.trim()).filter(f => f);
        await this.removeLayoutItems(objName, fields);
    }

    /**
     * Get object name from user
     */
    private async getObjectName(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('cleanforce');
        const defaultObject = config.get<string>('defaultObject') || '';

        // Quick pick with common objects + custom input
        const commonObjects = [
            { label: 'Case', description: 'Standard Case object' },
            { label: 'Account', description: 'Standard Account object' },
            { label: 'Contact', description: 'Standard Contact object' },
            { label: 'Opportunity', description: 'Standard Opportunity object' },
            { label: 'Lead', description: 'Standard Lead object' },
            { label: '$(edit) Custom Object...', description: 'Enter a custom object name' }
        ];

        if (defaultObject) {
            commonObjects.unshift({ label: defaultObject, description: '(Default)' });
        }

        const selected = await vscode.window.showQuickPick(commonObjects, {
            placeHolder: 'Select or enter the Object API Name',
            title: 'CleanForce: Select Object'
        });

        if (!selected) return undefined;

        if (selected.label.includes('Custom Object')) {
            return await vscode.window.showInputBox({
                prompt: 'Enter the Custom Object API Name',
                placeHolder: 'Custom_Object__c'
            });
        }

        return selected.label;
    }

    /**
     * Get fields to remove with multiple input options
     */
    private async getFieldsToRemove(): Promise<string[] | undefined> {
        const inputMethod = await vscode.window.showQuickPick([
            { label: '$(edit) Type Field Names', description: 'Enter field names manually' },
            { label: '$(file) Import from File', description: 'Import from CSV, TXT, or Excel' },
            { label: '$(clippy) Paste from Clipboard', description: 'Paste field names from clipboard' },
            { label: '$(search) Select from Project', description: 'Browse fields in your project' }
        ], {
            placeHolder: 'How do you want to specify fields?',
            title: 'CleanForce: Select Input Method'
        });

        if (!inputMethod) return undefined;

        switch (inputMethod.label) {
            case '$(edit) Type Field Names':
                return await this.getFieldsFromInput();
            case '$(file) Import from File':
                return await this.getFieldsFromFile();
            case '$(clippy) Paste from Clipboard':
                return await this.getFieldsFromClipboard();
            case '$(search) Select from Project':
                return await this.getFieldsFromProject();
            default:
                return undefined;
        }
    }

    /**
     * Get fields from manual input
     */
    private async getFieldsFromInput(): Promise<string[] | undefined> {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter field API names (comma, newline, or space separated)',
            placeHolder: 'Field1__c, Field2__c, Field3__c',
            validateInput: (value) => {
                if (!value.trim()) return 'Please enter at least one field name';
                return null;
            }
        });

        if (!input) return undefined;

        return input
            .split(/[,\n\s]+/)
            .map(f => f.trim())
            .filter(f => f.length > 0);
    }

    /**
     * Get fields from file (CSV, TXT, Excel)
     */
    private async getFieldsFromFile(): Promise<string[] | undefined> {
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

        if (!fileUri || fileUri.length === 0) return undefined;

        const filePath = fileUri[0].fsPath;
        const ext = path.extname(filePath).toLowerCase();

        try {
            if (ext === '.csv' || ext === '.txt') {
                const content = fs.readFileSync(filePath, 'utf-8');
                return content
                    .split(/[,\n\r]+/)
                    .map(f => f.trim().replace(/["']/g, ''))
                    .filter(f => f.length > 0 && !f.toLowerCase().includes('field'));
            } else if (ext === '.xlsx' || ext === '.xls') {
                // Excel handling would require xlsx package
                vscode.window.showWarningMessage('Excel import requires the xlsx package. Using CSV/TXT is recommended.');
                return undefined;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error reading file: ${error}`);
        }

        return undefined;
    }

    /**
     * Get fields from clipboard
     */
    private async getFieldsFromClipboard(): Promise<string[] | undefined> {
        const clipboardText = await vscode.env.clipboard.readText();
        
        if (!clipboardText.trim()) {
            vscode.window.showWarningMessage('Clipboard is empty');
            return undefined;
        }

        const fields = clipboardText
            .split(/[,\n\r\s]+/)
            .map(f => f.trim().replace(/["']/g, ''))
            .filter(f => f.length > 0 && f.endsWith('__c'));

        if (fields.length === 0) {
            vscode.window.showWarningMessage('No valid field names found in clipboard');
            return undefined;
        }

        vscode.window.showInformationMessage(`Found ${fields.length} field(s) in clipboard`);
        return fields;
    }

    /**
     * Get fields from project (browse existing fields)
     */
    private async getFieldsFromProject(): Promise<string[] | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return undefined;
        }

        // Find all field files for the object
        const fieldFiles = await vscode.workspace.findFiles(
            `**/objects/${this.objectName}/fields/*.field-meta.xml`,
            '**/node_modules/**'
        );

        if (fieldFiles.length === 0) {
            vscode.window.showWarningMessage(`No fields found for ${this.objectName}`);
            return await this.getFieldsFromInput();
        }

        const fieldItems = fieldFiles.map(f => ({
            label: path.basename(f.fsPath, '.field-meta.xml'),
            picked: false
        }));

        const selected = await vscode.window.showQuickPick(fieldItems, {
            canPickMany: true,
            placeHolder: 'Select fields to remove',
            title: `CleanForce: Select Fields from ${this.objectName}`
        });

        if (!selected || selected.length === 0) return undefined;

        return selected.map(s => s.label);
    }

    /**
     * Show preview and get confirmation
     */
    private async showPreviewAndConfirm(): Promise<boolean> {
        // Scan for references first
        const references = await this.scanForReferences();

        if (references.length === 0) {
            vscode.window.showInformationMessage('No references found for the specified fields');
            return false;
        }

        // Group by file
        const fileGroups = new Map<string, FieldReference[]>();
        for (const ref of references) {
            const group = fileGroups.get(ref.file) || [];
            group.push(ref);
            fileGroups.set(ref.file, group);
        }

        // Show preview in output channel
        const outputChannel = vscode.window.createOutputChannel('CleanForce Preview');
        outputChannel.clear();
        outputChannel.appendLine('═'.repeat(60));
        outputChannel.appendLine('CLEANFORCE - REMOVAL PREVIEW');
        outputChannel.appendLine('═'.repeat(60));
        outputChannel.appendLine(`Object: ${this.objectName}`);
        outputChannel.appendLine(`Fields to remove: ${this.fieldsToRemove.length}`);
        outputChannel.appendLine(`Total references found: ${references.length}`);
        outputChannel.appendLine(`Files affected: ${fileGroups.size}`);
        outputChannel.appendLine('');

        for (const [file, refs] of fileGroups) {
            const relativePath = vscode.workspace.asRelativePath(file);
            outputChannel.appendLine(`📄 ${relativePath} (${refs.length} reference(s))`);
            for (const ref of refs.slice(0, 5)) {
                outputChannel.appendLine(`   - ${ref.field}`);
            }
            if (refs.length > 5) {
                outputChannel.appendLine(`   ... and ${refs.length - 5} more`);
            }
            outputChannel.appendLine('');
        }

        outputChannel.appendLine('═'.repeat(60));
        outputChannel.show();

        // Ask for confirmation
        const confirm = await vscode.window.showWarningMessage(
            `Remove ${references.length} reference(s) from ${fileGroups.size} file(s)?`,
            { modal: true },
            'Yes, Remove All',
            'Cancel'
        );

        return confirm === 'Yes, Remove All';
    }

    /**
     * Scan for all references to the fields
     */
    private async scanForReferences(): Promise<FieldReference[]> {
        const references: FieldReference[] = [];
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) return references;

        const files = await vscode.workspace.findFiles(
            '**/*.{permissionset-meta.xml,profile-meta.xml,layout-meta.xml}',
            '**/node_modules/**'
        );

        for (const file of files) {
            try {
                const content = fs.readFileSync(file.fsPath, 'utf-8');
                
                for (const field of this.fieldsToRemove) {
                    if (content.includes(field)) {
                        references.push({
                            field,
                            file: file.fsPath,
                            type: 'fieldPermission'
                        });
                    }
                }
            } catch (error) {
                console.error(`Error reading ${file.fsPath}:`, error);
            }
        }

        return references;
    }

    /**
     * Process all metadata files - Profiles, Permission Sets, Layouts, Record Types, and more
     */
    private async processAllFiles(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CleanForce: Removing field references from ALL metadata...',
            cancellable: true
        }, async (progress, token) => {
            let totalRemoved = 0;
            let filesModified = 0;
            const modifiedFiles: string[] = [];
            const results: { type: string; count: number; files: number }[] = [];

            // 1. Process Permission Sets
            progress.report({ message: 'Processing Permission Sets...' });
            const psResult = await this.processPermissionSetsAndProfiles(
                '**/*.permissionset-meta.xml',
                token
            );
            if (psResult) {
                totalRemoved += psResult.removed;
                filesModified += psResult.filesModified;
                modifiedFiles.push(...psResult.files);
                results.push({ type: 'Permission Sets', count: psResult.removed, files: psResult.filesModified });
            }

            if (token.isCancellationRequested) return;

            // 1b. Process Muting Permission Sets
            progress.report({ message: 'Processing Muting Permission Sets...' });
            const mpsResult = await this.processPermissionSetsAndProfiles(
                '**/*.mutingpermissionset-meta.xml',
                token
            );
            if (mpsResult) {
                totalRemoved += mpsResult.removed;
                filesModified += mpsResult.filesModified;
                modifiedFiles.push(...mpsResult.files);
                results.push({ type: 'Muting Permission Sets', count: mpsResult.removed, files: mpsResult.filesModified });
            }

            if (token.isCancellationRequested) return;

            // 2. Process Profiles
            progress.report({ message: 'Processing Profiles...' });
            const profileResult = await this.processPermissionSetsAndProfiles(
                '**/*.profile-meta.xml',
                token
            );
            if (profileResult) {
                totalRemoved += profileResult.removed;
                filesModified += profileResult.filesModified;
                modifiedFiles.push(...profileResult.files);
                results.push({ type: 'Profiles', count: profileResult.removed, files: profileResult.filesModified });
            }

            if (token.isCancellationRequested) return;

            // 3. Process Layouts
            progress.report({ message: 'Processing Layouts...' });
            const layoutResult = await this.processLayouts(token);
            if (layoutResult) {
                totalRemoved += layoutResult.removed;
                filesModified += layoutResult.filesModified;
                modifiedFiles.push(...layoutResult.files);
                results.push({ type: 'Layouts', count: layoutResult.removed, files: layoutResult.filesModified });
            }

            if (token.isCancellationRequested) return;

            // 4. Process Record Types
            progress.report({ message: 'Processing Record Types...' });
            const rtResult = await this.processRecordTypes(token);
            if (rtResult) {
                totalRemoved += rtResult.removed;
                filesModified += rtResult.filesModified;
                modifiedFiles.push(...rtResult.files);
                results.push({ type: 'Record Types', count: rtResult.removed, files: rtResult.filesModified });
            }

            if (token.isCancellationRequested) return;

            // 5. Process Compact Layouts
            progress.report({ message: 'Processing Compact Layouts...' });
            const compactResult = await this.processCompactLayouts(token);
            if (compactResult) {
                totalRemoved += compactResult.removed;
                filesModified += compactResult.filesModified;
                modifiedFiles.push(...compactResult.files);
                results.push({ type: 'Compact Layouts', count: compactResult.removed, files: compactResult.filesModified });
            }

            if (token.isCancellationRequested) return;

            // 6. Process List Views
            progress.report({ message: 'Processing List Views...' });
            const lvResult = await this.processListViews(token);
            if (lvResult) {
                totalRemoved += lvResult.removed;
                filesModified += lvResult.filesModified;
                modifiedFiles.push(...lvResult.files);
                results.push({ type: 'List Views', count: lvResult.removed, files: lvResult.filesModified });
            }

            if (token.isCancellationRequested) return;

            // 7. Process Quick Actions
            progress.report({ message: 'Processing Quick Actions...' });
            const qaResult = await this.processQuickActions(token);
            if (qaResult) {
                totalRemoved += qaResult.removed;
                filesModified += qaResult.filesModified;
                modifiedFiles.push(...qaResult.files);
                results.push({ type: 'Quick Actions', count: qaResult.removed, files: qaResult.filesModified });
            }

            if (token.isCancellationRequested) return;

            // 8. Process Report Types
            progress.report({ message: 'Processing Report Types...' });
            const rtypeResult = await this.processReportTypes(token);
            if (rtypeResult) {
                totalRemoved += rtypeResult.removed;
                filesModified += rtypeResult.filesModified;
                modifiedFiles.push(...rtypeResult.files);
                results.push({ type: 'Report Types', count: rtypeResult.removed, files: rtypeResult.filesModified });
            }

            if (token.isCancellationRequested) return;

            // 9. Scan Flows for references (WARN ONLY - no auto-removal)
            progress.report({ message: 'Scanning Flows for references...' });
            const flowReferences = await this.scanFlowReferences(token);

            // Record in history
            if (totalRemoved > 0) {
                this.historyManager.addEntry({
                    type: OperationType.REMOVE_FIELD_REFERENCES,
                    timestamp: new Date(),
                    details: {
                        object: this.objectName,
                        fields: this.fieldsToRemove,
                        filesModified: modifiedFiles,
                        totalRemoved
                    }
                });
            }

            // Show detailed results
            const resultSummary = results
                .filter(r => r.count > 0)
                .map(r => `${r.type}: ${r.count}`)
                .join(', ');

            // Build message with flow warning if applicable
            let message = `✅ CleanForce: Removed ${totalRemoved} reference(s) from ${filesModified} file(s)`;
            if (resultSummary) {
                message += `\n(${resultSummary})`;
            }
            if (flowReferences.length > 0) {
                message += `\n⚠️ ${flowReferences.length} Flow reference(s) found - manual review required!`;
            }

            vscode.window.showInformationMessage(message, flowReferences.length > 0 ? 'View Details' : undefined as any)
                .then(selection => {
                    if (selection === 'View Details') {
                        // Output channel is already shown below
                    }
                });

            // Show detailed output
            if (totalRemoved > 0 || flowReferences.length > 0) {
                const outputChannel = vscode.window.createOutputChannel('CleanForce');
                outputChannel.clear();
                outputChannel.appendLine('═'.repeat(60));
                outputChannel.appendLine('CLEANFORCE - FIELD REFERENCE REMOVAL COMPLETE');
                outputChannel.appendLine('═'.repeat(60));
                outputChannel.appendLine('');
                outputChannel.appendLine(`Object: ${this.objectName}`);
                outputChannel.appendLine(`Fields: ${this.fieldsToRemove.map(f => f.split('.')[1]).join(', ')}`);
                outputChannel.appendLine('');
                outputChannel.appendLine('RESULTS BY TYPE:');
                for (const r of results) {
                    if (r.count > 0) {
                        outputChannel.appendLine(`  • ${r.type}: ${r.count} references from ${r.files} file(s)`);
                    }
                }
                outputChannel.appendLine('');
                outputChannel.appendLine(`TOTAL: ${totalRemoved} references removed from ${filesModified} files`);
                
                // Show Flow warnings if any
                if (flowReferences.length > 0) {
                    outputChannel.appendLine('');
                    outputChannel.appendLine('═'.repeat(60));
                    outputChannel.appendLine('⚠️  FLOW REFERENCES FOUND - MANUAL REVIEW REQUIRED');
                    outputChannel.appendLine('═'.repeat(60));
                    outputChannel.appendLine('');
                    outputChannel.appendLine('The following Flows contain references to the fields you\'re removing.');
                    outputChannel.appendLine('These CANNOT be auto-removed as they may break business logic.');
                    outputChannel.appendLine('');
                    
                    // Group by flow
                    const byFlow: { [key: string]: { field: string; context: string; line: number; elementType: string }[] } = {};
                    for (const ref of flowReferences) {
                        if (!byFlow[ref.flowName]) {
                            byFlow[ref.flowName] = [];
                        }
                        byFlow[ref.flowName].push({ field: ref.field, context: ref.context, line: ref.line, elementType: ref.elementType });
                    }
                    
                    for (const [flowName, refs] of Object.entries(byFlow)) {
                        outputChannel.appendLine(`📋 ${flowName}`);
                        outputChannel.appendLine(`   Path: ${refs[0].context}`);
                        outputChannel.appendLine(`   References found: ${refs.length}`);
                        outputChannel.appendLine('');
                        
                        // Group by element type for better readability
                        const byType: { [key: string]: { field: string; line: number }[] } = {};
                        for (const ref of refs) {
                            if (!byType[ref.elementType]) {
                                byType[ref.elementType] = [];
                            }
                            byType[ref.elementType].push({ field: ref.field, line: ref.line });
                        }
                        
                        for (const [elementType, typeRefs] of Object.entries(byType)) {
                            outputChannel.appendLine(`   🔹 ${elementType}:`);
                            for (const ref of typeRefs) {
                                outputChannel.appendLine(`      ├─ ${ref.field} (Line ${ref.line})`);
                            }
                        }
                        outputChannel.appendLine('');
                    }
                    
                    outputChannel.appendLine('─'.repeat(60));
                    outputChannel.appendLine('RECOMMENDED ACTIONS:');
                    outputChannel.appendLine('─'.repeat(60));
                    outputChannel.appendLine('1. Open each Flow in Flow Builder');
                    outputChannel.appendLine('2. Use Ctrl+F / Cmd+F to search for the field name');
                    outputChannel.appendLine('3. Check each element type listed above');
                    outputChannel.appendLine('4. Update or remove the field usage');
                    outputChannel.appendLine('5. Save and activate the Flow');
                    outputChannel.appendLine('');
                    outputChannel.appendLine('TIP: The element types shown above help you identify');
                    outputChannel.appendLine('     which Flow elements to look for in Flow Builder.');
                    outputChannel.appendLine('');
                }
                
                outputChannel.appendLine('═'.repeat(60));
                outputChannel.show();
            }
        });
    }

    /**
     * Process Permission Sets and Profiles
     */
    private async processPermissionSetsAndProfiles(
        pattern: string,
        token: vscode.CancellationToken
    ): Promise<{ removed: number; filesModified: number; files: string[] } | null> {
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
        let totalRemoved = 0;
        let filesModified = 0;
        const modifiedFiles: string[] = [];

        for (const file of files) {
            if (token.isCancellationRequested) return null;

            const result = await this.processFile(file.fsPath);
            if (result.removed > 0) {
                totalRemoved += result.removed;
                filesModified++;
                modifiedFiles.push(file.fsPath);
            }
        }

        return { removed: totalRemoved, filesModified, files: modifiedFiles };
    }

    /**
     * Process Layout files - PRECISE matching only
     */
    private async processLayouts(
        token: vscode.CancellationToken
    ): Promise<{ removed: number; filesModified: number; files: string[] }> {
        // Only process layouts for the current object
        const layoutPattern = `**/objects/${this.objectName}/layouts/*.layout-meta.xml`;
        const files = await vscode.workspace.findFiles(layoutPattern, '**/node_modules/**');
        
        // Also check old-style layout naming
        const oldStyleFiles = await vscode.workspace.findFiles(`**/${this.objectName}-*.layout-meta.xml`, '**/node_modules/**');
        const allFiles = [...files, ...oldStyleFiles];
        
        let totalRemoved = 0;
        let filesModified = 0;
        const modifiedFiles: string[] = [];

        for (const file of allFiles) {
            if (token.isCancellationRequested) break;

            try {
                let content = fs.readFileSync(file.fsPath, 'utf-8');
                const originalContent = content;
                let removed = 0;

                for (const field of this.fieldsToRemove) {
                    const fieldName = field.split('.')[1]; // Get just the field name
                    
                    // PRECISE pattern: Use function-based replace to check each block individually
                    const layoutItemRegex = /<layoutItems>[\s\S]*?<\/layoutItems>/g;
                    
                    content = content.replace(layoutItemRegex, (match) => {
                        // Check if this specific layoutItems block contains our field
                        const fieldPattern = new RegExp(`<field>${escapeRegex(fieldName)}</field>`);
                        if (fieldPattern.test(match)) {
                            removed++;
                            return ''; // Remove this block
                        }
                        return match; // Keep this block
                    });
                }

                // Clean up extra whitespace
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

        return { removed: totalRemoved, filesModified, files: modifiedFiles };
    }

    /**
     * Process Record Type files - ONLY for the specified object with PRECISE matching
     */
    private async processRecordTypes(
        token: vscode.CancellationToken
    ): Promise<{ removed: number; filesModified: number; files: string[] }> {
        // Only process record types for the current object
        const rtPattern = `**/objects/${this.objectName}/recordTypes/*.recordType-meta.xml`;
        const files = await vscode.workspace.findFiles(rtPattern, '**/node_modules/**');
        
        let totalRemoved = 0;
        let filesModified = 0;
        const modifiedFiles: string[] = [];

        for (const file of files) {
            if (token.isCancellationRequested) break;

            try {
                let content = fs.readFileSync(file.fsPath, 'utf-8');
                const originalContent = content;
                let removed = 0;

                for (const field of this.fieldsToRemove) {
                    const fieldName = field.split('.')[1]; // Get just the field name

                    // PRECISE pattern: Use function-based replace to check each block individually
                    const picklistRegex = /<picklistValues>[\s\S]*?<\/picklistValues>/g;
                    
                    content = content.replace(picklistRegex, (match) => {
                        // Check if this specific picklistValues block contains our field
                        const fieldPattern = new RegExp(`<picklist>${escapeRegex(fieldName)}</picklist>`);
                        if (fieldPattern.test(match)) {
                            removed++;
                            return ''; // Remove this block
                        }
                        return match; // Keep this block
                    });
                }

                // Clean up extra whitespace
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
                console.error(`Error processing record type ${file.fsPath}:`, error);
            }
        }

        return { removed: totalRemoved, filesModified, files: modifiedFiles };
    }

    /**
     * Process Compact Layout files - ONLY for the specified object
     */
    private async processCompactLayouts(
        token: vscode.CancellationToken
    ): Promise<{ removed: number; filesModified: number; files: string[] }> {
        // Only process compact layouts for the current object
        const clPattern = `**/objects/${this.objectName}/compactLayouts/*.compactLayout-meta.xml`;
        const files = await vscode.workspace.findFiles(clPattern, '**/node_modules/**');
        
        let totalRemoved = 0;
        let filesModified = 0;
        const modifiedFiles: string[] = [];

        for (const file of files) {
            if (token.isCancellationRequested) break;

            try {
                let content = fs.readFileSync(file.fsPath, 'utf-8');
                const originalContent = content;
                let removed = 0;

                for (const field of this.fieldsToRemove) {
                    const fieldName = field.split('.')[1];

                    // Remove fields from compact layouts - simple exact match
                    const fieldPattern = new RegExp(
                        `\\s*<fields>${escapeRegex(fieldName)}</fields>`,
                        'g'
                    );
                    const matches = content.match(fieldPattern);
                    if (matches) {
                        removed += matches.length;
                        content = content.replace(fieldPattern, '');
                    }
                }

                // Clean up extra whitespace
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
                console.error(`Error processing compact layout ${file.fsPath}:`, error);
            }
        }

        return { removed: totalRemoved, filesModified, files: modifiedFiles };
    }

    /**
     * Process List View files - ONLY for the specified object with PRECISE matching
     */
    private async processListViews(
        token: vscode.CancellationToken
    ): Promise<{ removed: number; filesModified: number; files: string[] }> {
        // Only process list views for the current object
        const lvPattern = `**/objects/${this.objectName}/listViews/*.listView-meta.xml`;
        const files = await vscode.workspace.findFiles(lvPattern, '**/node_modules/**');
        
        let totalRemoved = 0;
        let filesModified = 0;
        const modifiedFiles: string[] = [];

        for (const file of files) {
            if (token.isCancellationRequested) break;

            try {
                let content = fs.readFileSync(file.fsPath, 'utf-8');
                const originalContent = content;
                let removed = 0;

                for (const field of this.fieldsToRemove) {
                    const fieldName = field.split('.')[1];

                    // Remove columns containing the field - simple exact match
                    const columnPattern = new RegExp(
                        `\\s*<columns>${escapeRegex(fieldName)}</columns>`,
                        'g'
                    );
                    let matches = content.match(columnPattern);
                    if (matches) {
                        removed += matches.length;
                        content = content.replace(columnPattern, '');
                    }

                    // Remove filter references - use function-based replace for precision
                    const filterRegex = /<filters>[\s\S]*?<\/filters>/g;
                    content = content.replace(filterRegex, (match) => {
                        const fieldPattern = new RegExp(`<field>${escapeRegex(fieldName)}</field>`);
                        if (fieldPattern.test(match)) {
                            removed++;
                            return ''; // Remove this filter block
                        }
                        return match; // Keep this block
                    });
                }

                // Clean up extra whitespace
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
                console.error(`Error processing list view ${file.fsPath}:`, error);
            }
        }

        return { removed: totalRemoved, filesModified, files: modifiedFiles };
    }

    /**
     * Process Quick Action files - ONLY for the specified object
     */
    private async processQuickActions(
        token: vscode.CancellationToken
    ): Promise<{ removed: number; filesModified: number; files: string[] }> {
        // Quick Actions can be in objects folder or standalone
        const qaPattern1 = `**/objects/${this.objectName}/quickActions/*.quickAction-meta.xml`;
        const qaPattern2 = `**/${this.objectName}.*.quickAction-meta.xml`;
        
        const files1 = await vscode.workspace.findFiles(qaPattern1, '**/node_modules/**');
        const files2 = await vscode.workspace.findFiles(qaPattern2, '**/node_modules/**');
        
        // Combine and deduplicate
        const fileSet = new Set<string>();
        [...files1, ...files2].forEach(f => fileSet.add(f.fsPath));
        const files = Array.from(fileSet).map(f => vscode.Uri.file(f));
        
        let totalRemoved = 0;
        let filesModified = 0;
        const modifiedFiles: string[] = [];

        for (const file of files) {
            if (token.isCancellationRequested) break;

            try {
                let content = fs.readFileSync(file.fsPath, 'utf-8');
                const originalContent = content;
                let removed = 0;

                for (const field of this.fieldsToRemove) {
                    const fieldName = field.split('.')[1];

                    // Quick Actions have layout sections with layoutItems
                    // Use function-based replace for precision
                    const layoutItemRegex = /<layoutItems>[\s\S]*?<\/layoutItems>/g;
                    content = content.replace(layoutItemRegex, (match) => {
                        const fieldPattern = new RegExp(`<field>${escapeRegex(fieldName)}</field>`);
                        if (fieldPattern.test(match)) {
                            removed++;
                            return '';
                        }
                        return match;
                    });

                    // Also check for quickActionLayoutColumns containing the field
                    const columnRegex = /<quickActionLayoutColumns>[\s\S]*?<\/quickActionLayoutColumns>/g;
                    content = content.replace(columnRegex, (match) => {
                        const fieldPattern = new RegExp(`<field>${escapeRegex(fieldName)}</field>`);
                        if (fieldPattern.test(match)) {
                            // Don't remove the whole column, just the layoutItem inside
                            const itemPattern = new RegExp(
                                `<quickActionLayoutItems>[\\s\\S]*?<field>${escapeRegex(fieldName)}</field>[\\s\\S]*?</quickActionLayoutItems>`,
                                'g'
                            );
                            const newMatch = match.replace(itemPattern, () => {
                                removed++;
                                return '';
                            });
                            return newMatch;
                        }
                        return match;
                    });
                }

                // Clean up empty columns and extra whitespace
                content = content.replace(/<quickActionLayoutColumns>\s*<\/quickActionLayoutColumns>/g, '');
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
                console.error(`Error processing quick action ${file.fsPath}:`, error);
            }
        }

        return { removed: totalRemoved, filesModified, files: modifiedFiles };
    }

    /**
     * Process Report Type files - searches for field references in report type layouts
     */
    private async processReportTypes(
        token: vscode.CancellationToken
    ): Promise<{ removed: number; filesModified: number; files: string[] }> {
        // Report Types are in reportTypes folder
        const files = await vscode.workspace.findFiles('**/reportTypes/*.reportType-meta.xml', '**/node_modules/**');
        
        let totalRemoved = 0;
        let filesModified = 0;
        const modifiedFiles: string[] = [];

        for (const file of files) {
            if (token.isCancellationRequested) break;

            try {
                let content = fs.readFileSync(file.fsPath, 'utf-8');
                const originalContent = content;
                let removed = 0;

                // Check if this report type is related to our object
                // Report types reference objects in <baseObject> or in section names
                const isRelatedToObject = content.includes(`<baseObject>${this.objectName}</baseObject>`) ||
                    content.includes(`>${this.objectName}<`) ||
                    content.includes(`${this.objectName}.`);

                if (!isRelatedToObject) continue;

                for (const field of this.fieldsToRemove) {
                    const fieldName = field.split('.')[1];
                    const fullFieldRef = `${this.objectName}.${fieldName}`;

                    // Report Types have <columns> with <field> elements
                    const columnRegex = /<columns>[\s\S]*?<\/columns>/g;
                    content = content.replace(columnRegex, (match) => {
                        // Check for both short and full field references
                        const fieldPattern = new RegExp(`<field>${escapeRegex(fieldName)}</field>`);
                        const fullFieldPattern = new RegExp(`<field>${escapeRegex(fullFieldRef)}</field>`);
                        if (fieldPattern.test(match) || fullFieldPattern.test(match)) {
                            removed++;
                            return '';
                        }
                        return match;
                    });

                    // Also check for sections containing the field
                    const sectionRegex = /<sections>[\s\S]*?<\/sections>/g;
                    content = content.replace(sectionRegex, (match) => {
                        // Only modify columns within the section, not the whole section
                        const colPattern = new RegExp(
                            `<columns>[\\s\\S]*?<field>${escapeRegex(fieldName)}</field>[\\s\\S]*?</columns>`,
                            'g'
                        );
                        const fullColPattern = new RegExp(
                            `<columns>[\\s\\S]*?<field>${escapeRegex(fullFieldRef)}</field>[\\s\\S]*?</columns>`,
                            'g'
                        );
                        
                        let newMatch = match;
                        const matches1 = match.match(colPattern);
                        const matches2 = match.match(fullColPattern);
                        
                        if (matches1) {
                            newMatch = newMatch.replace(colPattern, '');
                            removed += matches1.length;
                        }
                        if (matches2) {
                            newMatch = newMatch.replace(fullColPattern, '');
                            removed += matches2.length;
                        }
                        
                        return newMatch;
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
                console.error(`Error processing report type ${file.fsPath}:`, error);
            }
        }

        return { removed: totalRemoved, filesModified, files: modifiedFiles };
    }

    /**
     * Scan Flow files for field references (WARN ONLY - no auto-removal)
     * Deep analysis of all Flow XML elements where fields can be referenced
     * Returns list of flows containing field references for manual review
     */
    private async scanFlowReferences(
        token: vscode.CancellationToken
    ): Promise<{ flowName: string; field: string; context: string; line: number; elementType: string }[]> {
        const files = await vscode.workspace.findFiles('**/*.flow-meta.xml', '**/node_modules/**');
        const references: { flowName: string; field: string; context: string; line: number; elementType: string }[] = [];

        for (const file of files) {
            if (token.isCancellationRequested) break;

            try {
                const content = fs.readFileSync(file.fsPath, 'utf-8');
                const lines = content.split('\n');
                const flowName = path.basename(file.fsPath).replace('.flow-meta.xml', '');

                for (const field of this.fieldsToRemove) {
                    const fieldName = field.split('.')[1];
                    const objectName = this.objectName;
                    
                    // Comprehensive patterns for field references in Flows
                    const patterns: { regex: RegExp; elementType: string }[] = [
                        // 1. Direct field element: <field>FieldName</field>
                        { regex: new RegExp(`<field>${escapeRegex(fieldName)}</field>`, 'g'), elementType: 'Field Reference' },
                        
                        // 2. Field in filters: <filters><field>FieldName</field>
                        { regex: new RegExp(`<filters>[\\s\\S]*?<field>${escapeRegex(fieldName)}</field>`, 'g'), elementType: 'Filter Condition' },
                        
                        // 3. inputAssignments: <inputAssignments><field>FieldName</field>
                        { regex: new RegExp(`<inputAssignments>[\\s\\S]*?<field>${escapeRegex(fieldName)}</field>`, 'g'), elementType: 'Input Assignment' },
                        
                        // 4. outputAssignments: <outputAssignments>...<field>FieldName</field>
                        { regex: new RegExp(`<outputAssignments>[\\s\\S]*?<field>${escapeRegex(fieldName)}</field>`, 'g'), elementType: 'Output Assignment' },
                        
                        // 5. Record field reference in elementReference: Object.Field or $Record.Field
                        { regex: new RegExp(`<elementReference>[^<]*\\.${escapeRegex(fieldName)}</elementReference>`, 'g'), elementType: 'Element Reference' },
                        
                        // 6. Formula references: {!Object.Field} or {!$Record.Field} or {!varName.Field}
                        { regex: new RegExp(`\\{![^}]*\\.${escapeRegex(fieldName)}[^}]*\\}`, 'g'), elementType: 'Formula/Merge Field' },
                        
                        // 7. stringValue with field reference
                        { regex: new RegExp(`<stringValue>[^<]*${escapeRegex(fieldName)}[^<]*</stringValue>`, 'g'), elementType: 'String Value' },
                        
                        // 8. value element with field reference
                        { regex: new RegExp(`<value>[^<]*\\.${escapeRegex(fieldName)}</value>`, 'g'), elementType: 'Value Reference' },
                        
                        // 9. assignToReference with field: varName.FieldName
                        { regex: new RegExp(`<assignToReference>[^<]*\\.${escapeRegex(fieldName)}</assignToReference>`, 'g'), elementType: 'Assignment Target' },
                        
                        // 10. processMetadataValues field reference
                        { regex: new RegExp(`<processMetadataValues>[\\s\\S]*?${escapeRegex(fieldName)}[\\s\\S]*?</processMetadataValues>`, 'g'), elementType: 'Process Metadata' },
                        
                        // 11. fieldName element (used in decisions, waits)
                        { regex: new RegExp(`<fieldName>${escapeRegex(fieldName)}</fieldName>`, 'g'), elementType: 'Field Name Reference' },
                        
                        // 12. leftValue/rightValue with field
                        { regex: new RegExp(`<leftValue>[^<]*\\.${escapeRegex(fieldName)}</leftValue>`, 'g'), elementType: 'Condition Left Value' },
                        { regex: new RegExp(`<rightValue>[^<]*\\.${escapeRegex(fieldName)}</rightValue>`, 'g'), elementType: 'Condition Right Value' },
                        
                        // 13. defaultValue with field reference
                        { regex: new RegExp(`<defaultValue>[^<]*\\.${escapeRegex(fieldName)}</defaultValue>`, 'g'), elementType: 'Default Value' },
                        
                        // 14. Screen field references
                        { regex: new RegExp(`<fieldName>${escapeRegex(objectName)}\\.${escapeRegex(fieldName)}</fieldName>`, 'g'), elementType: 'Screen Field' },
                        
                        // 15. Object.Field format
                        { regex: new RegExp(`>${escapeRegex(objectName)}\\.${escapeRegex(fieldName)}<`, 'g'), elementType: 'Object.Field Reference' },
                        
                        // 16. $Record.Field format (record-triggered flows)
                        { regex: new RegExp(`\\$Record\\.${escapeRegex(fieldName)}`, 'g'), elementType: '$Record Reference' },
                        
                        // 17. $Record__Prior.Field format (before-save flows)
                        { regex: new RegExp(`\\$Record__Prior\\.${escapeRegex(fieldName)}`, 'g'), elementType: '$Record__Prior Reference' },
                        
                        // 18. scheduledPaths field references
                        { regex: new RegExp(`<recordField>${escapeRegex(fieldName)}</recordField>`, 'g'), elementType: 'Scheduled Path' },
                        
                        // 19. sortField in Get Records
                        { regex: new RegExp(`<sortField>${escapeRegex(fieldName)}</sortField>`, 'g'), elementType: 'Sort Field' },
                        
                        // 20. queriedFields in Get Records
                        { regex: new RegExp(`<queriedFields>${escapeRegex(fieldName)}</queriedFields>`, 'g'), elementType: 'Queried Field' },
                        
                        // 21. Entry conditions / start conditions
                        { regex: new RegExp(`<triggerConditions>[\\s\\S]*?<field>${escapeRegex(fieldName)}</field>`, 'g'), elementType: 'Trigger Condition' },
                        
                        // 22. Text templates with field merge
                        { regex: new RegExp(`<textTemplates>[\\s\\S]*?\\{![^}]*\\.${escapeRegex(fieldName)}[^}]*\\}`, 'g'), elementType: 'Text Template' },
                        
                        // 23. Choice references
                        { regex: new RegExp(`<choiceReferences>[^<]*${escapeRegex(fieldName)}[^<]*</choiceReferences>`, 'g'), elementType: 'Choice Reference' },
                        
                        // 24. dataType with objectFieldReference
                        { regex: new RegExp(`<objectFieldReference>[^<]*\\.${escapeRegex(fieldName)}</objectFieldReference>`, 'g'), elementType: 'Object Field Reference' },
                        
                        // 25. expression with field
                        { regex: new RegExp(`<expression>[^<]*\\.${escapeRegex(fieldName)}[^<]*</expression>`, 'g'), elementType: 'Expression' },
                    ];

                    // Find line numbers for each match
                    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                        const line = lines[lineNum];
                        
                        for (const { regex, elementType } of patterns) {
                            // Reset regex lastIndex for each line
                            regex.lastIndex = 0;
                            
                            if (regex.test(line)) {
                                // Avoid duplicates for same field/line/element
                                const exists = references.some(r => 
                                    r.flowName === flowName && 
                                    r.field === fieldName && 
                                    r.line === lineNum + 1 &&
                                    r.elementType === elementType
                                );
                                
                                if (!exists) {
                                    references.push({
                                        flowName,
                                        field: fieldName,
                                        context: file.fsPath,
                                        line: lineNum + 1,
                                        elementType
                                    });
                                }
                            }
                        }
                        
                        // Also check for multi-line patterns by checking if line contains the field
                        // This catches cases where the field appears in complex nested structures
                        if (line.includes(fieldName)) {
                            // Determine context by checking surrounding XML
                            let elementType = 'Unknown';
                            
                            // Look backwards to find containing element
                            for (let i = lineNum; i >= Math.max(0, lineNum - 10); i--) {
                                const prevLine = lines[i];
                                if (prevLine.includes('<recordCreates')) { elementType = 'Create Records'; break; }
                                if (prevLine.includes('<recordUpdates')) { elementType = 'Update Records'; break; }
                                if (prevLine.includes('<recordLookups')) { elementType = 'Get Records'; break; }
                                if (prevLine.includes('<recordDeletes')) { elementType = 'Delete Records'; break; }
                                if (prevLine.includes('<assignments')) { elementType = 'Assignment'; break; }
                                if (prevLine.includes('<decisions')) { elementType = 'Decision'; break; }
                                if (prevLine.includes('<loops')) { elementType = 'Loop'; break; }
                                if (prevLine.includes('<screens')) { elementType = 'Screen'; break; }
                                if (prevLine.includes('<formulas')) { elementType = 'Formula'; break; }
                                if (prevLine.includes('<start')) { elementType = 'Start Element'; break; }
                                if (prevLine.includes('<waits')) { elementType = 'Wait'; break; }
                                if (prevLine.includes('<subflows')) { elementType = 'Subflow'; break; }
                                if (prevLine.includes('<actionCalls')) { elementType = 'Action Call'; break; }
                                if (prevLine.includes('<collectionProcessors')) { elementType = 'Collection Processor'; break; }
                            }
                            
                            // Only add if not already found by regex patterns
                            const exists = references.some(r => 
                                r.flowName === flowName && 
                                r.field === fieldName && 
                                r.line === lineNum + 1
                            );
                            
                            if (!exists && elementType !== 'Unknown') {
                                references.push({
                                    flowName,
                                    field: fieldName,
                                    context: file.fsPath,
                                    line: lineNum + 1,
                                    elementType
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error scanning flow ${file.fsPath}:`, error);
            }
        }

        return references;
    }

    /**
     * Process a single file
     */
    private async processFile(filePath: string): Promise<{ removed: number }> {
        try {
            let content = fs.readFileSync(filePath, 'utf-8');
            const originalContent = content;
            let removed = 0;

            // Check if file contains any of our fields
            const hasFields = this.fieldsToRemove.some(f => content.includes(f));
            if (!hasFields) {
                return { removed: 0 };
            }

            // Create backup if enabled
            const config = vscode.workspace.getConfiguration('cleanforce');
            if (config.get('createBackup')) {
                await this.backupManager.createBackup(filePath);
            }

            // Remove field permissions
            for (const field of this.fieldsToRemove) {
                // Pattern for fieldPermissions block (handles various formats)
                const patterns = [
                    // Standard format: editable, field, readable
                    new RegExp(
                        `\\s*<fieldPermissions>\\s*<editable>(?:true|false)</editable>\\s*<field>${escapeRegex(field)}</field>\\s*<readable>(?:true|false)</readable>\\s*</fieldPermissions>`,
                        'g'
                    ),
                    // Alternative: field first
                    new RegExp(
                        `\\s*<fieldPermissions>\\s*<field>${escapeRegex(field)}</field>\\s*<editable>(?:true|false)</editable>\\s*<readable>(?:true|false)</readable>\\s*</fieldPermissions>`,
                        'g'
                    ),
                    // Alternative: readable first
                    new RegExp(
                        `\\s*<fieldPermissions>\\s*<readable>(?:true|false)</readable>\\s*<editable>(?:true|false)</editable>\\s*<field>${escapeRegex(field)}</field>\\s*</fieldPermissions>`,
                        'g'
                    ),
                    new RegExp(
                        `\\s*<fieldPermissions>\\s*<readable>(?:true|false)</readable>\\s*<field>${escapeRegex(field)}</field>\\s*<editable>(?:true|false)</editable>\\s*</fieldPermissions>`,
                        'g'
                    )
                ];

                for (const pattern of patterns) {
                    const matches = content.match(pattern);
                    if (matches) {
                        removed += matches.length;
                        content = content.replace(pattern, '');
                    }
                }
            }

            if (content !== originalContent) {
                fs.writeFileSync(filePath, content);
            }

            return { removed };
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error);
            return { removed: 0 };
        }
    }

    /**
     * Remove generic metadata references
     */
    private async removeMetadataReferences(
        names: string[],
        parentTag: string,
        childTag: string
    ): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `CleanForce: Removing ${parentTag} references...`,
            cancellable: false
        }, async (progress) => {
            const files = await vscode.workspace.findFiles(
                '**/*.{permissionset-meta.xml,profile-meta.xml}',
                '**/node_modules/**'
            );

            let totalRemoved = 0;
            let filesModified = 0;

            for (const file of files) {
                let content = fs.readFileSync(file.fsPath, 'utf-8');
                const originalContent = content;
                let removed = 0;

                for (const name of names) {
                    const pattern = new RegExp(
                        `\\s*<${parentTag}>[\\s\\S]*?<${childTag}>${escapeRegex(name)}</${childTag}>[\\s\\S]*?</${parentTag}>`,
                        'g'
                    );
                    const matches = content.match(pattern);
                    if (matches) {
                        removed += matches.length;
                        content = content.replace(pattern, '');
                    }
                }

                if (content !== originalContent) {
                    const config = vscode.workspace.getConfiguration('cleanforce');
                    if (config.get('createBackup')) {
                        await this.backupManager.createBackup(file.fsPath);
                    }
                    fs.writeFileSync(file.fsPath, content);
                    totalRemoved += removed;
                    filesModified++;
                }
            }

            vscode.window.showInformationMessage(
                `✅ CleanForce: Removed ${totalRemoved} ${parentTag} reference(s) from ${filesModified} file(s)`
            );
        });
    }

    /**
     * Remove layout items
     */
    private async removeLayoutItems(objectName: string, fields: string[]): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const layoutFiles = await vscode.workspace.findFiles(
            `**/${objectName}-*.layout-meta.xml`,
            '**/node_modules/**'
        );

        if (layoutFiles.length === 0) {
            vscode.window.showWarningMessage(`No layouts found for ${objectName}`);
            return;
        }

        let totalRemoved = 0;
        let filesModified = 0;

        for (const file of layoutFiles) {
            let content = fs.readFileSync(file.fsPath, 'utf-8');
            const originalContent = content;
            let removed = 0;

            for (const field of fields) {
                const pattern = new RegExp(
                    `\\s*<layoutItems>[\\s\\S]*?<field>${escapeRegex(field)}</field>[\\s\\S]*?</layoutItems>`,
                    'g'
                );
                const matches = content.match(pattern);
                if (matches) {
                    removed += matches.length;
                    content = content.replace(pattern, '');
                }
            }

            if (content !== originalContent) {
                fs.writeFileSync(file.fsPath, content);
                totalRemoved += removed;
                filesModified++;
            }
        }

        vscode.window.showInformationMessage(
            `✅ CleanForce: Removed ${totalRemoved} layout item(s) from ${filesModified} layout(s)`
        );
    }

}
