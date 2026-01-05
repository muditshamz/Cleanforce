import * as vscode from 'vscode';

export class DependencyAnalyzer {
    async showDependencyGraph(): Promise<void> {
        vscode.window.showInformationMessage(
            'CleanForce: Dependency Graph visualization coming soon! Use "Scan for References" for now.',
            'Scan References'
        ).then(selection => {
            if (selection === 'Scan References') {
                vscode.commands.executeCommand('cleanforce.scanForReferences');
            }
        });
    }
}
