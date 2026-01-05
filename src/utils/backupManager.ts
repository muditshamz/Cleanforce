import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class BackupManager {
    private backupFolder: string = '.cleanforce/backups';

    /**
     * Create a backup of a file
     */
    async createBackup(filePath: string): Promise<string | undefined> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return undefined;

            const config = vscode.workspace.getConfiguration('cleanforce');
            this.backupFolder = config.get<string>('backupLocation') || '.cleanforce/backups';

            // Create backup folder structure
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const relativePath = vscode.workspace.asRelativePath(filePath);
            const backupDir = path.join(workspaceFolder.uri.fsPath, this.backupFolder, timestamp);
            const backupPath = path.join(backupDir, relativePath);

            // Create directory structure
            const backupFileDir = path.dirname(backupPath);
            if (!fs.existsSync(backupFileDir)) {
                fs.mkdirSync(backupFileDir, { recursive: true });
            }

            // Copy file
            fs.copyFileSync(filePath, backupPath);

            // Store backup mapping
            this.storeBackupMapping(filePath, backupPath);

            return backupPath;
        } catch (error) {
            console.error(`Error creating backup for ${filePath}:`, error);
            return undefined;
        }
    }

    /**
     * Restore a file from backup
     */
    async restoreBackup(originalPath: string): Promise<boolean> {
        try {
            const backupPath = this.getBackupPath(originalPath);
            
            if (!backupPath || !fs.existsSync(backupPath)) {
                console.error(`No backup found for ${originalPath}`);
                return false;
            }

            fs.copyFileSync(backupPath, originalPath);
            return true;
        } catch (error) {
            console.error(`Error restoring backup for ${originalPath}:`, error);
            return false;
        }
    }

    /**
     * Store backup mapping in a JSON file
     */
    private storeBackupMapping(originalPath: string, backupPath: string): void {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return;

            const mappingFile = path.join(
                workspaceFolder.uri.fsPath,
                this.backupFolder,
                'backup-mapping.json'
            );

            let mappings: Record<string, string> = {};

            if (fs.existsSync(mappingFile)) {
                const content = fs.readFileSync(mappingFile, 'utf-8');
                mappings = JSON.parse(content);
            }

            mappings[originalPath] = backupPath;

            const mappingDir = path.dirname(mappingFile);
            if (!fs.existsSync(mappingDir)) {
                fs.mkdirSync(mappingDir, { recursive: true });
            }

            fs.writeFileSync(mappingFile, JSON.stringify(mappings, null, 2));
        } catch (error) {
            console.error('Error storing backup mapping:', error);
        }
    }

    /**
     * Get backup path for a file
     */
    private getBackupPath(originalPath: string): string | undefined {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return undefined;

            const mappingFile = path.join(
                workspaceFolder.uri.fsPath,
                this.backupFolder,
                'backup-mapping.json'
            );

            if (!fs.existsSync(mappingFile)) return undefined;

            const content = fs.readFileSync(mappingFile, 'utf-8');
            const mappings: Record<string, string> = JSON.parse(content);

            return mappings[originalPath];
        } catch (error) {
            console.error('Error getting backup path:', error);
            return undefined;
        }
    }

    /**
     * List all backups
     */
    listBackups(): { date: string; files: string[] }[] {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return [];

            const backupDir = path.join(workspaceFolder.uri.fsPath, this.backupFolder);
            
            if (!fs.existsSync(backupDir)) return [];

            const entries = fs.readdirSync(backupDir, { withFileTypes: true });
            const backups: { date: string; files: string[] }[] = [];

            for (const entry of entries) {
                if (entry.isDirectory() && entry.name !== 'backup-mapping.json') {
                    const dirPath = path.join(backupDir, entry.name);
                    const files = this.getFilesRecursively(dirPath);
                    
                    backups.push({
                        date: entry.name,
                        files: files.map(f => path.relative(dirPath, f))
                    });
                }
            }

            return backups.sort((a, b) => b.date.localeCompare(a.date));
        } catch (error) {
            console.error('Error listing backups:', error);
            return [];
        }
    }

    /**
     * Get files recursively from a directory
     */
    private getFilesRecursively(dir: string): string[] {
        const files: string[] = [];

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                files.push(...this.getFilesRecursively(fullPath));
            } else {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Clean old backups (keep only last N)
     */
    async cleanOldBackups(keepCount: number = 10): Promise<number> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return 0;

            const backupDir = path.join(workspaceFolder.uri.fsPath, this.backupFolder);
            
            if (!fs.existsSync(backupDir)) return 0;

            const entries = fs.readdirSync(backupDir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .sort((a, b) => b.name.localeCompare(a.name));

            let deletedCount = 0;

            for (let i = keepCount; i < entries.length; i++) {
                const dirPath = path.join(backupDir, entries[i].name);
                fs.rmSync(dirPath, { recursive: true, force: true });
                deletedCount++;
            }

            return deletedCount;
        } catch (error) {
            console.error('Error cleaning old backups:', error);
            return 0;
        }
    }

    /**
     * Get total backup size
     */
    getBackupSize(): string {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return '0 B';

            const backupDir = path.join(workspaceFolder.uri.fsPath, this.backupFolder);
            
            if (!fs.existsSync(backupDir)) return '0 B';

            const size = this.getDirectorySize(backupDir);
            return this.formatBytes(size);
        } catch (error) {
            return '0 B';
        }
    }

    /**
     * Get directory size recursively
     */
    private getDirectorySize(dir: string): number {
        let size = 0;

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                size += this.getDirectorySize(fullPath);
            } else {
                size += fs.statSync(fullPath).size;
            }
        }

        return size;
    }

    /**
     * Format bytes to human readable
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
