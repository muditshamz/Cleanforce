import * as vscode from 'vscode';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    public static readonly viewType = 'cleanforceDashboard';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            DashboardPanel.viewType,
            'CleanForce Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'removeFields':
                        vscode.commands.executeCommand('cleanforce.removeFields');
                        return;
                    case 'scanFields':
                        vscode.commands.executeCommand('cleanforce.scanForReferences');
                        return;
                    case 'generateDestructive':
                        vscode.commands.executeCommand('cleanforce.generateDestructiveChanges');
                        return;
                    case 'quickClean':
                        vscode.commands.executeCommand('cleanforce.quickClean');
                        return;
                    case 'cleanupProfiles':
                        vscode.commands.executeCommand('cleanforce.cleanupProfiles');
                        return;
                    case 'cleanupPermissionSets':
                        vscode.commands.executeCommand('cleanforce.cleanupPermissionSets');
                        return;
                    case 'cleanupLayouts':
                        vscode.commands.executeCommand('cleanforce.cleanupLayouts');
                        return;
                    case 'cleanupFlexiPages':
                        vscode.commands.executeCommand('cleanforce.cleanupFlexiPages');
                        return;
                    case 'cleanupRecordTypes':
                        vscode.commands.executeCommand('cleanforce.cleanupRecordTypes');
                        return;
                    case 'cleanupListViews':
                        vscode.commands.executeCommand('cleanforce.cleanupListViews');
                        return;
                    case 'cleanupQuickActions':
                        vscode.commands.executeCommand('cleanforce.cleanupQuickActions');
                        return;
                    case 'cleanupReportTypes':
                        vscode.commands.executeCommand('cleanforce.cleanupReportTypes');
                        return;
                    case 'analyzeUnused':
                        vscode.commands.executeCommand('cleanforce.analyzeUnusedFields');
                        return;
                    case 'validateMetadata':
                        vscode.commands.executeCommand('cleanforce.validateMetadata');
                        return;
                    case 'viewHistory':
                        vscode.commands.executeCommand('cleanforce.viewHistory');
                        return;
                    case 'undoLast':
                        vscode.commands.executeCommand('cleanforce.undoLastOperation');
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        const nonce = this._getNonce();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>CleanForce Dashboard</title>
    <style>
        :root {
            --primary-color: #00A1E0;
            --primary-hover: #0088c7;
            --danger-color: #ff6b6b;
            --warning-color: #ffd93d;
            --success-color: #6bcb77;
            --bg-color: var(--vscode-editor-background);
            --card-bg: var(--vscode-editorWidget-background);
            --text-color: var(--vscode-editor-foreground);
            --border-color: var(--vscode-widget-border);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            background-color: var(--bg-color);
            color: var(--text-color);
            padding: 20px;
            line-height: 1.6;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border-color);
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #00A1E0, #00d4aa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .header p {
            opacity: 0.8;
            font-size: 1.1em;
        }

        .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }

        .stat-card .number {
            font-size: 2em;
            font-weight: bold;
            color: var(--primary-color);
        }

        .stat-card .label {
            font-size: 0.9em;
            opacity: 0.7;
        }

        .section {
            margin-bottom: 30px;
        }

        .section h2 {
            font-size: 1.3em;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .section h2::before {
            content: '';
            width: 4px;
            height: 20px;
            background: var(--primary-color);
            border-radius: 2px;
        }

        .actions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 15px;
        }

        .action-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: flex-start;
            gap: 15px;
        }

        .action-card:hover {
            border-color: var(--primary-color);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 161, 224, 0.15);
        }

        .action-card .icon {
            font-size: 2em;
            min-width: 50px;
            text-align: center;
        }

        .action-card .content h3 {
            font-size: 1.1em;
            margin-bottom: 5px;
        }

        .action-card .content p {
            font-size: 0.85em;
            opacity: 0.7;
        }

        .action-card.primary {
            background: linear-gradient(135deg, #00A1E0, #0088c7);
            border-color: transparent;
            color: white;
        }

        .action-card.primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0, 161, 224, 0.4);
        }

        .action-card.danger {
            border-left: 3px solid var(--danger-color);
        }

        .action-card.warning {
            border-left: 3px solid var(--warning-color);
        }

        .action-card.success {
            border-left: 3px solid var(--success-color);
        }

        .quick-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 30px;
        }

        .quick-btn {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            color: var(--text-color);
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9em;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .quick-btn:hover {
            border-color: var(--primary-color);
            background: var(--primary-color);
            color: white;
        }

        .footer {
            text-align: center;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
            opacity: 0.6;
            font-size: 0.85em;
        }

        .keyboard-shortcut {
            background: var(--vscode-button-secondaryBackground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.8em;
            margin-left: 5px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧹⚡ CleanForce</h1>
        <p>The Ultimate Salesforce Metadata Cleanup Tool</p>
    </div>

    <div class="quick-actions">
        <button class="quick-btn" onclick="sendCommand('quickClean')">
            ⚡ Quick Clean
            <span class="keyboard-shortcut">Ctrl+Shift+Q</span>
        </button>
        <button class="quick-btn" onclick="sendCommand('undoLast')">
            ↩️ Undo Last
        </button>
        <button class="quick-btn" onclick="sendCommand('viewHistory')">
            📜 View History
        </button>
        <button class="quick-btn" onclick="sendCommand('validateMetadata')">
            ✅ Validate
        </button>
    </div>

    <div class="section">
        <h2>Field Operations</h2>
        <div class="actions-grid">
            <div class="action-card primary" onclick="sendCommand('removeFields')">
                <div class="icon">🗑️</div>
                <div class="content">
                    <h3>Remove Field References (All)</h3>
                    <p>Remove from Profiles, Permission Sets, Layouts, Record Types, FlexiPages & more</p>
                </div>
            </div>
            <div class="action-card" onclick="sendCommand('scanFields')">
                <div class="icon">🔍</div>
                <div class="content">
                    <h3>Scan for References</h3>
                    <p>Find all files containing references to specific fields</p>
                </div>
            </div>
            <div class="action-card danger" onclick="sendCommand('generateDestructive')">
                <div class="icon">📄</div>
                <div class="content">
                    <h3>Generate Destructive Changes</h3>
                    <p>Create deployment-ready destructive changes XML</p>
                </div>
            </div>
            <div class="action-card" onclick="sendCommand('analyzeUnused')">
                <div class="icon">📊</div>
                <div class="content">
                    <h3>Analyze Unused Fields</h3>
                    <p>Find potentially unused fields in your org</p>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Targeted Cleanup</h2>
        <div class="actions-grid">
            <div class="action-card" onclick="sendCommand('cleanupLayouts')">
                <div class="icon">📐</div>
                <div class="content">
                    <h3>Cleanup Page Layouts</h3>
                    <p>Remove field references from Page Layouts</p>
                </div>
            </div>
            <div class="action-card" onclick="sendCommand('cleanupFlexiPages')">
                <div class="icon">⚡</div>
                <div class="content">
                    <h3>Cleanup Lightning Pages</h3>
                    <p>Remove field references from FlexiPages</p>
                </div>
            </div>
            <div class="action-card" onclick="sendCommand('cleanupRecordTypes')">
                <div class="icon">📋</div>
                <div class="content">
                    <h3>Cleanup Record Types</h3>
                    <p>Remove picklist value references from Record Types</p>
                </div>
            </div>
            <div class="action-card" onclick="sendCommand('cleanupListViews')">
                <div class="icon">📃</div>
                <div class="content">
                    <h3>Cleanup List Views</h3>
                    <p>Remove field columns and filters from List Views</p>
                </div>
            </div>
            <div class="action-card" onclick="sendCommand('cleanupQuickActions')">
                <div class="icon">🚀</div>
                <div class="content">
                    <h3>Cleanup Quick Actions</h3>
                    <p>Remove field references from Quick Actions</p>
                </div>
            </div>
            <div class="action-card" onclick="sendCommand('cleanupReportTypes')">
                <div class="icon">📊</div>
                <div class="content">
                    <h3>Cleanup Report Types</h3>
                    <p>Remove field columns from Report Types</p>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Profile & Permission Cleanup</h2>
        <div class="actions-grid">
            <div class="action-card success" onclick="sendCommand('cleanupProfiles')">
                <div class="icon">👤</div>
                <div class="content">
                    <h3>Cleanup Profiles</h3>
                    <p>Remove invalid or orphaned references from profiles</p>
                </div>
            </div>
            <div class="action-card success" onclick="sendCommand('cleanupPermissionSets')">
                <div class="icon">🛡️</div>
                <div class="content">
                    <h3>Cleanup Permission Sets</h3>
                    <p>Remove invalid or orphaned references from permission sets</p>
                </div>
            </div>
            <div class="action-card warning" onclick="sendCommand('validateMetadata')">
                <div class="icon">✅</div>
                <div class="content">
                    <h3>Validate Metadata</h3>
                    <p>Check metadata integrity and find potential issues</p>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
        <p>CleanForce v1.0.0 • Made with ❤️ for the Salesforce Community</p>
        <p>Press <span class="keyboard-shortcut">Ctrl+Shift+C</span> to open this dashboard anytime</p>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        function sendCommand(command) {
            vscode.postMessage({ command: command });
        }
    </script>
</body>
</html>`;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
