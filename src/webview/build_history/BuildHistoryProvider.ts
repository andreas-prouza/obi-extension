import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirTool } from '../../utilities/DirTool';
import { Constants } from '../../Constants';
import { logger } from '../../utilities/Logger';
import * as source from '../../obi/Source';
import { Workspace } from '../../utilities/Workspace';


interface IBuildHistorys {
  [element: string]: Promise<source.IQualifiedSource[] | undefined>
}

export class BuildHistoryProvider implements vscode.TreeDataProvider<BuildHistoryItem> {

  private workspaceRoot: string = '';
  private _onDidChangeTreeData: vscode.EventEmitter<BuildHistoryItem | undefined | null | void> = new vscode.EventEmitter<BuildHistoryItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BuildHistoryItem | undefined | null | void> = this._onDidChangeTreeData.event;


  constructor(workspaceRoot: string | undefined) {
    if (workspaceRoot !== undefined)
      this.workspaceRoot = workspaceRoot
  }



  getTreeItem(element: BuildHistoryItem): vscode.TreeItem {
    return element;
  }



  getChildren(element?: BuildHistoryItem): Thenable<BuildHistoryItem[]> {
    if (!this.workspaceRoot) {
      return Promise.resolve([]);
    }

    const build_history_path = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
    if (!DirTool.dir_exists(build_history_path)) {
      return Promise.resolve([]);
    }

    if (element) {
      // Children of a date group
      const build_history_files = DirTool.list_dir(build_history_path);
      const historyItems = build_history_files
        .map(file => {
          const filePath = path.join(build_history_path, file);
          if (DirTool.is_file(filePath)) {
            const stats = fs.statSync(filePath);
            const fileDate = stats.mtime.toISOString().split('T')[0];
            if (fileDate === element.label) {
              return new BuildHistoryItem(
                stats.mtime.toLocaleTimeString(),
                vscode.TreeItemCollapsibleState.None,
                filePath,
                'file',
                file
              );
            }
          }
          return null;
        })
        .filter((item): item is BuildHistoryItem => item !== null)
        .sort((a, b) => b.label.localeCompare(a.label));

      return Promise.resolve(historyItems);
    }

    // Top-level items (date groups)
    const build_history_files = DirTool.list_dir(build_history_path);
    const dateGroups = new Set<string>();

    build_history_files.forEach(file => {
      const filePath = path.join(build_history_path, file);
      if (DirTool.is_file(filePath)) {
        const stats = fs.statSync(filePath);
        dateGroups.add(stats.mtime.toISOString().split('T')[0]);
      }
    });

    const sortedDates = Array.from(dateGroups).sort((a, b) => b.localeCompare(a));

    const historyItems = sortedDates.map(date => {
      return new BuildHistoryItem(
        date,
        vscode.TreeItemCollapsibleState.Collapsed,
        '',
        'date'
      );
    });

    return Promise.resolve(historyItems);
  }


  async get_child_elements(element: BuildHistoryItem): Promise<any> {
    return Promise.resolve([]);
  }


  refresh(): void {
    this._onDidChangeTreeData.fire();
  }



  public register(context: vscode.ExtensionContext): any {
    // setup
    const options = {
      treeDataProvider: this,
      showCollapseAll: true
    };

    // build
    vscode.window.registerTreeDataProvider('obi.build-history', this);

    // create
    const tree = vscode.window.createTreeView('obi.build-history', options);

    vscode.commands.registerCommand('obi.build-history.update', () => {
      this.refresh();
    });

    vscode.commands.registerCommand('obi.build-history.delete-item', (item: BuildHistoryItem) => {
      if (item && item.file_path && DirTool.file_exists(item.file_path)) {
        fs.unlinkSync(item.file_path);
        this.refresh();
      }
    });

    vscode.commands.registerCommand('obi.build-history.delete-date', (item: BuildHistoryItem) => {
      const build_history_path = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
      if (item && item.date && DirTool.dir_exists(build_history_path)) {
        const build_history_files = DirTool.list_dir(build_history_path);
        build_history_files.forEach(file => {
          const filePath = path.join(build_history_path, file);
          if (DirTool.is_file(filePath)) {
            const stats = fs.statSync(filePath);
            const fileDate = stats.mtime.toISOString().split('T')[0];
            if (fileDate === item.date) {
              fs.unlinkSync(filePath);
            }
          }
        });
        this.refresh();
      }
    });

    // subscribe
    context.subscriptions.push(tree);

    const buildHistoryPath = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR, '**/*');
    const watcher = vscode.workspace.createFileSystemWatcher(buildHistoryPath);

    watcher.onDidCreate(() => this.refresh());
    watcher.onDidChange(() => this.refresh());
    watcher.onDidDelete(() => this.refresh());

    context.subscriptions.push(watcher);
  }



}



export class BuildHistoryItem extends vscode.TreeItem {

  public readonly label: string;
  public readonly collapsibleState: vscode.TreeItemCollapsibleState;
  public readonly file_path: string;
  public readonly date?: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    file_path: string,
    type: 'date' | 'file',
    fileName?: string
  ) {
    super(label, collapsibleState);
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.file_path = file_path;

    if (type === 'date') {
      this.tooltip = `Builds from ${label}`;
      this.contextValue = 'buildHistoryDate';
      this.iconPath = new vscode.ThemeIcon('calendar');
      this.date = label;
    } else {
      this.tooltip = `Build history: ${fileName}`;
      this.contextValue = 'buildHistoryFile';

      this.command = {
        command: 'obi.open_build_summary',
        title: 'Open Build Summary',
        arguments: [this.file_path]
      };

      this.iconPath = new vscode.ThemeIcon('file-text');
    }
  }

}