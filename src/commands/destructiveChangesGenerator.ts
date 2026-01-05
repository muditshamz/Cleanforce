import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface DestructiveItem {
    type: string;
    members: string[];
}

export class DestructiveChangesGenerator {
    
    /**
     * Generate destructive changes XML files
     */
    async execute(): Promise<void> {
        try {
            // Show options for what to generate
            const option = await vscode.window.showQuickPick([
                { label: '$(trash) Custom Fields', description: 'Generate destructive changes for custom fields', value: 'CustomField' },
                { label: '$(code) Apex Classes', description: 'Generate destructive changes for Apex classes', value: 'ApexClass' },
                { label: '$(zap) Apex Triggers', description: 'Generate destructive changes for Apex triggers', value: 'ApexTrigger' },
                { label: '$(git-merge) Flows', description: 'Generate destructive changes for Flows', value: 'Flow' },
                { label: '$(layout) Page Layouts', description: 'Generate destructive changes for page layouts', value: 'Layout' },
                { label: '$(database) Custom Objects', description: 'Generate destructive changes for custom objects', value: 'CustomObject' },
                { label: '$(file-code) Validation Rules', description: 'Generate destructive changes for validation rules', value: 'ValidationRule' },
                { label: '$(mail) Email Templates', description: 'Generate destructive changes for email templates', value: 'EmailTemplate' },
                { label: '$(list-unordered) Multiple Types...', description: 'Select multiple metadata types', value: 'multiple' }
            ], {
                placeHolder: 'What type of metadata do you want to delete?',
                title: 'CleanForce: Generate Destructive Changes'
            });

            if (!option) return;

            let items: DestructiveItem[] = [];

            if (option.value === 'multiple') {
                items = await this.getMultipleTypes();
            } else if (option.value === 'CustomField') {
                items = await this.getCustomFields();
            } else {
                items = await this.getSingleType(option.value, option.label.replace(/\$\([^)]+\)\s*/, ''));
            }

            if (items.length === 0 || items.every(i => i.members.length === 0)) {
                vscode.window.showWarningMessage('No items specified for destructive changes');
                return;
            }

            // Generate and save files
            await this.generateFiles(items);

        } catch (error) {
            vscode.window.showErrorMessage(`CleanForce Error: ${error}`);
        }
    }

    /**
     * Get custom fields to delete
     */
    private async getCustomFields(): Promise<DestructiveItem[]> {
        const objectName = await vscode.window.showInputBox({
            prompt: 'Enter the Object API Name',
            placeHolder: 'Case, Account, Custom_Object__c'
        });

        if (!objectName) return [];

        // Option to select from project or type manually
        const inputMethod = await vscode.window.showQuickPick([
            { label: '$(edit) Type Field Names', description: 'Enter field names manually' },
            { label: '$(search) Select from Project', description: 'Browse fields in your project' },
            { label: '$(file) Import from File', description: 'Import from CSV/TXT file' }
        ], {
            placeHolder: 'How do you want to specify fields?'
        });

        if (!inputMethod) return [];

        let fields: string[] = [];

        if (inputMethod.label.includes('Type')) {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter field API names (comma separated)',
                placeHolder: 'Field1__c, Field2__c, Field3__c'
            });
            if (input) {
                fields = input.split(',').map(f => f.trim()).filter(f => f);
            }
        } else if (inputMethod.label.includes('Select')) {
            fields = await this.selectFieldsFromProject(objectName);
        } else if (inputMethod.label.includes('Import')) {
            fields = await this.importFieldsFromFile();
        }

        if (fields.length === 0) return [];

        // Format as Object.Field
        const members = fields.map(f => {
            if (f.includes('.')) return f;
            return `${objectName}.${f}`;
        });

        return [{ type: 'CustomField', members }];
    }

    /**
     * Select fields from project
     */
    private async selectFieldsFromProject(objectName: string): Promise<string[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return [];

        const fieldFiles = await vscode.workspace.findFiles(
            `**/objects/${objectName}/fields/*.field-meta.xml`,
            '**/node_modules/**'
        );

        if (fieldFiles.length === 0) {
            vscode.window.showWarningMessage(`No fields found for ${objectName}`);
            return [];
        }

        const items = fieldFiles.map(f => ({
            label: path.basename(f.fsPath, '.field-meta.xml'),
            picked: false
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Select fields to delete',
            title: `Select Fields from ${objectName}`
        });

        return selected?.map(s => s.label) || [];
    }

    /**
     * Import fields from file
     */
    private async importFieldsFromFile(): Promise<string[]> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'Field Lists': ['csv', 'txt'] }
        });

        if (!fileUri || fileUri.length === 0) return [];

        try {
            const content = fs.readFileSync(fileUri[0].fsPath, 'utf-8');
            return content
                .split(/[,\n\r]+/)
                .map(f => f.trim().replace(/["']/g, ''))
                .filter(f => f && !f.toLowerCase().includes('field'));
        } catch (error) {
            vscode.window.showErrorMessage(`Error reading file: ${error}`);
            return [];
        }
    }

    /**
     * Get single metadata type
     */
    private async getSingleType(metadataType: string, displayName: string): Promise<DestructiveItem[]> {
        const input = await vscode.window.showInputBox({
            prompt: `Enter ${displayName} API names (comma separated)`,
            placeHolder: 'Name1, Name2, Name3'
        });

        if (!input) return [];

        const members = input.split(',').map(m => m.trim()).filter(m => m);
        return [{ type: metadataType, members }];
    }

    /**
     * Get multiple metadata types
     */
    private async getMultipleTypes(): Promise<DestructiveItem[]> {
        const items: DestructiveItem[] = [];

        const types = await vscode.window.showQuickPick([
            { label: 'CustomField', picked: false },
            { label: 'ApexClass', picked: false },
            { label: 'ApexTrigger', picked: false },
            { label: 'Flow', picked: false },
            { label: 'Layout', picked: false },
            { label: 'CustomObject', picked: false },
            { label: 'ValidationRule', picked: false },
            { label: 'WorkflowRule', picked: false },
            { label: 'EmailTemplate', picked: false },
            { label: 'Report', picked: false },
            { label: 'Dashboard', picked: false }
        ], {
            canPickMany: true,
            placeHolder: 'Select metadata types to include'
        });

        if (!types || types.length === 0) return [];

        for (const type of types) {
            const input = await vscode.window.showInputBox({
                prompt: `Enter ${type.label} API names (comma separated)`,
                placeHolder: 'Name1, Name2, Name3'
            });

            if (input) {
                const members = input.split(',').map(m => m.trim()).filter(m => m);
                if (members.length > 0) {
                    items.push({ type: type.label, members });
                }
            }
        }

        return items;
    }

    /**
     * Generate the XML files
     */
    private async generateFiles(items: DestructiveItem[]): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        // Ask for deployment type
        const deployType = await vscode.window.showQuickPick([
            { label: 'Post-Destructive', description: 'Delete after deployment (recommended)', value: 'post' },
            { label: 'Pre-Destructive', description: 'Delete before deployment', value: 'pre' }
        ], {
            placeHolder: 'When should the deletion happen?'
        });

        if (!deployType) return;

        const config = vscode.workspace.getConfiguration('cleanforce');
        const apiVersion = config.get<string>('apiVersion') || '59.0';

        // Generate XML content
        const destructiveXml = this.generateDestructiveXml(items, apiVersion);
        const packageXml = this.generatePackageXml(apiVersion);

        // Create folder
        const folderName = deployType.value === 'post' ? 'destructive-post' : 'destructive-pre';
        const fileName = deployType.value === 'post' ? 'destructiveChangesPost.xml' : 'destructiveChangesPre.xml';
        
        const folderPath = path.join(workspaceFolder.uri.fsPath, folderName);
        
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        // Write files
        const destructivePath = path.join(folderPath, fileName);
        const packagePath = path.join(folderPath, 'package.xml');

        fs.writeFileSync(destructivePath, destructiveXml);
        fs.writeFileSync(packagePath, packageXml);

        // Open the file
        const doc = await vscode.workspace.openTextDocument(destructivePath);
        await vscode.window.showTextDocument(doc);

        // Count total members
        const totalMembers = items.reduce((sum, item) => sum + item.members.length, 0);

        // Show success message with deploy command
        const selection = await vscode.window.showInformationMessage(
            `✅ Created destructive changes for ${totalMembers} item(s) in '${folderName}' folder`,
            'Copy Deploy Command',
            'Open Terminal'
        );

        const deployParam = deployType.value === 'post' ? '--post-destructive-changes' : '--pre-destructive-changes';
        const deployCommand = `sf project deploy start --manifest ${folderName}/package.xml ${deployParam} ${folderName}/${fileName} -o YOUR_ORG_ALIAS`;

        if (selection === 'Copy Deploy Command') {
            await vscode.env.clipboard.writeText(deployCommand);
            vscode.window.showInformationMessage('Deploy command copied to clipboard!');
        } else if (selection === 'Open Terminal') {
            const terminal = vscode.window.createTerminal('CleanForce Deploy');
            terminal.show();
            terminal.sendText(`# Run this command to deploy destructive changes:`);
            terminal.sendText(`# ${deployCommand}`);
        }
    }

    /**
     * Generate destructive changes XML
     */
    private generateDestructiveXml(items: DestructiveItem[], apiVersion: string): string {
        let typesXml = '';

        for (const item of items) {
            const membersXml = item.members
                .map(m => `        <members>${m}</members>`)
                .join('\n');

            typesXml += `    <types>\n${membersXml}\n        <name>${item.type}</name>\n    </types>\n`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${typesXml}    <version>${apiVersion}</version>
</Package>`;
    }

    /**
     * Generate empty package XML
     */
    private generatePackageXml(apiVersion: string): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <version>${apiVersion}</version>
</Package>`;
    }
}
