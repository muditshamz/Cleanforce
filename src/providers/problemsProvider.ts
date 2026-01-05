import * as vscode from 'vscode';

export interface Problem {
    type: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    field?: string;
    suggestion?: string;
}

export class ProblemsProvider implements vscode.TreeDataProvider<ProblemItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProblemItem | undefined | null | void> = new vscode.EventEmitter<ProblemItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ProblemItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private problems: Problem[] = [];

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    updateProblems(problems: Problem[]): void {
        this.problems = problems;
        this.refresh();
    }

    getTreeItem(element: ProblemItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ProblemItem): Promise<ProblemItem[]> {
        if (element) {
            return [];
        }

        if (this.problems.length === 0) {
            return [new ProblemItem('No issues found ✅', 'info', 'Your metadata looks clean!')];
        }

        // Group by type
        const errors = this.problems.filter(p => p.type === 'error');
        const warnings = this.problems.filter(p => p.type === 'warning');
        const infos = this.problems.filter(p => p.type === 'info');

        const items: ProblemItem[] = [];

        if (errors.length > 0) {
            items.push(new ProblemItem(`Errors (${errors.length})`, 'error', '', vscode.TreeItemCollapsibleState.Expanded));
            errors.forEach(e => items.push(new ProblemItem(e.message, 'error', e.suggestion || '', vscode.TreeItemCollapsibleState.None, e.file)));
        }

        if (warnings.length > 0) {
            items.push(new ProblemItem(`Warnings (${warnings.length})`, 'warning', '', vscode.TreeItemCollapsibleState.Expanded));
            warnings.forEach(w => items.push(new ProblemItem(w.message, 'warning', w.suggestion || '', vscode.TreeItemCollapsibleState.None, w.file)));
        }

        if (infos.length > 0) {
            items.push(new ProblemItem(`Info (${infos.length})`, 'info', '', vscode.TreeItemCollapsibleState.Collapsed));
            infos.forEach(i => items.push(new ProblemItem(i.message, 'info', i.suggestion || '', vscode.TreeItemCollapsibleState.None, i.file)));
        }

        return items;
    }
}

export class ProblemItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly problemType: 'error' | 'warning' | 'info',
        public readonly detail: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly filePath?: string
    ) {
        super(label, collapsibleState);

        this.tooltip = detail || label;
        this.description = detail;

        // Set icon based on type
        switch (problemType) {
            case 'error':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                break;
            case 'warning':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
                break;
        }

        if (filePath) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(filePath)]
            };
        }
    }
}
