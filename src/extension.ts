import * as vscode from 'vscode';
import { CleanForceExplorerProvider } from './providers/explorerProvider';
import { QuickActionsProvider } from './providers/quickActionsProvider';
import { HistoryProvider } from './providers/historyProvider';
import { ProblemsProvider } from './providers/problemsProvider';
import { DashboardPanel } from './webview/dashboardPanel';
import { FieldRemover } from './commands/fieldRemover';
import { MetadataScanner } from './commands/metadataScanner';
import { DestructiveChangesGenerator } from './commands/destructiveChangesGenerator';
import { FieldFileDeleter } from './commands/fieldFileDeleter';
import { ProfileCleaner } from './commands/profileCleaner';
import { PermissionSetCleaner } from './commands/permissionSetCleaner';
import { UnusedFieldAnalyzer } from './commands/unusedFieldAnalyzer';
import { DependencyAnalyzer } from './commands/dependencyAnalyzer';
import { MetadataValidator } from './commands/metadataValidator';
import { BulkOperations } from './commands/bulkOperations';
import { LayoutCleaner } from './commands/layoutCleaner';
import { FlexiPageCleaner } from './commands/flexiPageCleaner';
import { RecordTypeCleaner } from './commands/recordTypeCleaner';
import { ListViewCleaner } from './commands/listViewCleaner';
import { QuickActionCleaner } from './commands/quickActionCleaner';
import { ReportTypeCleaner } from './commands/reportTypeCleaner';
import { HistoryManager } from './utils/historyManager';
import { BackupManager } from './utils/backupManager';
import { ReportExporter } from './utils/reportExporter';
import { FieldListImporter } from './utils/fieldListImporter';

// Global instances
let historyManager: HistoryManager;
let backupManager: BackupManager;
let explorerProvider: CleanForceExplorerProvider;
let quickActionsProvider: QuickActionsProvider;
let historyProvider: HistoryProvider;
let problemsProvider: ProblemsProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('🧹⚡ CleanForce is now active!');

    // Initialize managers
    historyManager = new HistoryManager(context);
    backupManager = new BackupManager();

    // Initialize tree view providers
    explorerProvider = new CleanForceExplorerProvider();
    quickActionsProvider = new QuickActionsProvider();
    historyProvider = new HistoryProvider(historyManager);
    problemsProvider = new ProblemsProvider();

    // Register tree views
    vscode.window.registerTreeDataProvider('cleanforceExplorer', explorerProvider);
    vscode.window.registerTreeDataProvider('cleanforceQuickActions', quickActionsProvider);
    vscode.window.registerTreeDataProvider('cleanforceHistory', historyProvider);
    vscode.window.registerTreeDataProvider('cleanforceProblems', problemsProvider);

    // Register all commands
    const commands = [
        // Dashboard
        vscode.commands.registerCommand('cleanforce.openDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri);
        }),

        // Core Field Operations
        vscode.commands.registerCommand('cleanforce.removeFields', async () => {
            const remover = new FieldRemover(historyManager, backupManager);
            await remover.execute();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.removeFieldsFromFile', async (uri?: vscode.Uri) => {
            const remover = new FieldRemover(historyManager, backupManager);
            await remover.executeOnFile(uri);
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.scanForReferences', async () => {
            const scanner = new MetadataScanner();
            await scanner.scanForFieldReferences();
        }),

        vscode.commands.registerCommand('cleanforce.deleteFieldFiles', async () => {
            const deleter = new FieldFileDeleter(historyManager, backupManager);
            await deleter.execute();
            refreshAllViews();
        }),

        // Destructive Changes
        vscode.commands.registerCommand('cleanforce.generateDestructiveChanges', async () => {
            const generator = new DestructiveChangesGenerator();
            await generator.execute();
        }),

        // Cleanup Commands
        vscode.commands.registerCommand('cleanforce.cleanupProfiles', async () => {
            const cleaner = new ProfileCleaner(historyManager, backupManager);
            await cleaner.execute();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.cleanupPermissionSets', async () => {
            const cleaner = new PermissionSetCleaner(historyManager, backupManager);
            await cleaner.execute();
            refreshAllViews();
        }),

        // Analysis Commands
        vscode.commands.registerCommand('cleanforce.analyzeUnusedFields', async () => {
            const analyzer = new UnusedFieldAnalyzer();
            await analyzer.execute();
        }),

        vscode.commands.registerCommand('cleanforce.dependencyGraph', async () => {
            const analyzer = new DependencyAnalyzer();
            await analyzer.showDependencyGraph();
        }),

        vscode.commands.registerCommand('cleanforce.validateMetadata', async () => {
            const validator = new MetadataValidator();
            const problems = await validator.validate();
            problemsProvider.updateProblems(problems);
        }),

        // Bulk Operations
        vscode.commands.registerCommand('cleanforce.bulkFieldOperations', async () => {
            const bulk = new BulkOperations(historyManager, backupManager);
            await bulk.execute();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.quickClean', async () => {
            const bulk = new BulkOperations(historyManager, backupManager);
            await bulk.quickClean();
            refreshAllViews();
        }),

        // Remove other metadata types
        vscode.commands.registerCommand('cleanforce.removeApexReferences', async () => {
            const remover = new FieldRemover(historyManager, backupManager);
            await remover.removeApexReferences();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.removeObjectReferences', async () => {
            const remover = new FieldRemover(historyManager, backupManager);
            await remover.removeObjectReferences();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.removeFlowReferences', async () => {
            const remover = new FieldRemover(historyManager, backupManager);
            await remover.removeFlowReferences();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.removeLayoutReferences', async () => {
            const remover = new FieldRemover(historyManager, backupManager);
            await remover.removeLayoutReferences();
            refreshAllViews();
        }),

        // New targeted cleanup commands
        vscode.commands.registerCommand('cleanforce.cleanupLayouts', async () => {
            const cleaner = new LayoutCleaner(historyManager, backupManager);
            await cleaner.execute();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.cleanupFlexiPages', async () => {
            const cleaner = new FlexiPageCleaner(historyManager, backupManager);
            await cleaner.execute();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.cleanupRecordTypes', async () => {
            const cleaner = new RecordTypeCleaner(historyManager, backupManager);
            await cleaner.execute();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.cleanupListViews', async () => {
            const cleaner = new ListViewCleaner(historyManager, backupManager);
            await cleaner.execute();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.cleanupQuickActions', async () => {
            const cleaner = new QuickActionCleaner(historyManager, backupManager);
            await cleaner.execute();
            refreshAllViews();
        }),

        vscode.commands.registerCommand('cleanforce.cleanupReportTypes', async () => {
            const cleaner = new ReportTypeCleaner(historyManager, backupManager);
            await cleaner.execute();
            refreshAllViews();
        }),

        // Import/Export
        vscode.commands.registerCommand('cleanforce.importFieldList', async () => {
            const importer = new FieldListImporter();
            await importer.importFromFile();
        }),

        vscode.commands.registerCommand('cleanforce.exportReport', async () => {
            const exporter = new ReportExporter();
            await exporter.export(historyManager.getHistory());
        }),

        // History & Undo
        vscode.commands.registerCommand('cleanforce.undoLastOperation', async () => {
            await historyManager.undoLast(backupManager);
            refreshAllViews();
            vscode.window.showInformationMessage('CleanForce: Last operation undone');
        }),

        vscode.commands.registerCommand('cleanforce.viewHistory', () => {
            historyProvider.refresh();
            vscode.commands.executeCommand('cleanforceHistory.focus');
        }),

        // Refresh
        vscode.commands.registerCommand('cleanforce.refreshExplorer', () => {
            refreshAllViews();
        }),

        // Compare (placeholder for future)
        vscode.commands.registerCommand('cleanforce.compareMetadata', async () => {
            vscode.window.showInformationMessage('CleanForce: Metadata comparison coming soon!');
        }),

        // Schedule (placeholder for future)
        vscode.commands.registerCommand('cleanforce.scheduleCleanup', async () => {
            vscode.window.showInformationMessage('CleanForce: Scheduled cleanup coming soon!');
        }),
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));

    // Auto-scan on startup if enabled
    const config = vscode.workspace.getConfiguration('cleanforce');
    if (config.get('autoScan')) {
        setTimeout(async () => {
            const validator = new MetadataValidator();
            const problems = await validator.validate();
            problemsProvider.updateProblems(problems);
            
            if (problems.length > 0) {
                vscode.window.showInformationMessage(
                    `CleanForce found ${problems.length} potential issue(s) in your metadata`,
                    'View Issues'
                ).then(selection => {
                    if (selection === 'View Issues') {
                        vscode.commands.executeCommand('cleanforceProblems.focus');
                    }
                });
            }
        }, 3000);
    }

    // Status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(sparkle) CleanForce';
    statusBarItem.tooltip = 'Open CleanForce Dashboard';
    statusBarItem.command = 'cleanforce.openDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Show welcome message on first install
    const hasShownWelcome = context.globalState.get('cleanforce.welcomeShown');
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'Welcome to CleanForce! 🧹⚡ Ready to clean your Salesforce metadata?',
            'Open Dashboard',
            'Get Started'
        ).then(selection => {
            if (selection === 'Open Dashboard') {
                DashboardPanel.createOrShow(context.extensionUri);
            } else if (selection === 'Get Started') {
                vscode.commands.executeCommand('workbench.action.openWalkthrough', 'cleanforce.cleanforce#cleanforce.welcome');
            }
        });
        context.globalState.update('cleanforce.welcomeShown', true);
    }
}

function refreshAllViews() {
    explorerProvider.refresh();
    quickActionsProvider.refresh();
    historyProvider.refresh();
    problemsProvider.refresh();
}

export function deactivate() {
    console.log('CleanForce deactivated');
}
