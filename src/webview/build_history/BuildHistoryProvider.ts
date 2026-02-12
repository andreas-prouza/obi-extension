import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirTool } from '../../utilities/DirTool';
import { Constants } from '../../Constants';
import { logger } from '../../utilities/Logger';
import * as source from '../../obi/Source';
import { Workspace } from '../../utilities/Workspace';
import { AppConfig } from '../controller/AppConfig';


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

    const config = AppConfig.get_app_config();

    if (element) {
      if (element.contextValue === 'buildHistoryDate') {
        // Children of a date group: these are the timestamped build folders
        const build_history_dirs = DirTool.list_dir(build_history_path);
        const historyItems = build_history_dirs
          .map(dir => {
            const dirPath = path.join(build_history_path, dir);
            if (DirTool.dir_exists(dirPath)) {
              const parsableDir = dir.replace("_", " ").replace(/\./g, ':');
              const normalized = parsableDir.replace(" ", "T")
                .replace(/:(\d+)$/, ".$1")
                .substring(0, 23);
              const dirDate = new Date(normalized).toISOString().split('T')[0];
              if (dirDate === element.label) {
                return new BuildHistoryItem(
                  new Date(normalized).toLocaleTimeString(),
                  vscode.TreeItemCollapsibleState.Collapsed,
                  dirPath,
                  'build',
                  dir
                );
              }
            }
            return null;
          })
          .filter((item): item is BuildHistoryItem => item !== null)
          .sort((a, b) => b.label.localeCompare(a.label));

        return Promise.resolve(historyItems);
      } else if (element.contextValue === 'buildHistoryBuild') {
        const compileListPath = path.join(element.file_path, 'compile-list.json');
        if (fs.existsSync(compileListPath)) {
          const compileList = JSON.parse(fs.readFileSync(compileListPath, 'utf-8'));
          const sources: BuildHistoryItem[] = [];
          if (compileList.compiles) {
            for (const compile of compileList.compiles) {
              if (compile.sources) {
                for (const src of compile.sources) {
                  const item = new BuildHistoryItem(
                    src.source,
                    vscode.TreeItemCollapsibleState.None,
                    '',
                    'source'
                  );
                  item.command = {
                    command: 'vscode.open',
                    title: 'Open Source',
                    arguments: [vscode.Uri.joinPath(Workspace.get_workspace_uri(), config.general['source-dir'], src.source)]
                  };
                  sources.push(item);
                }
              }
            }
          }
          return Promise.resolve(sources);
        }
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }

    // Top-level items (date groups)
    const build_history_dirs = DirTool.list_dir(build_history_path);
    const dateGroups = new Set<string>();

    build_history_dirs.forEach(dir => {
      const dirPath = path.join(build_history_path, dir);
      if (DirTool.dir_exists(dirPath)) {
        // The dir name is the timestamp
        try {
          const parsableDir = dir.replace("_", " ").replace(/\./g, ':');
          const normalized = parsableDir.replace(" ", "T")
                            .replace(/:(\d+)$/, ".$1")
                            .substring(0, 23);
          const date = new Date(normalized);
          dateGroups.add(date.toISOString().split('T')[0]);
        } catch (e) {
          logger.error(`Invalid date format for build history directory: ${dir}`);
        }
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
      if (item && item.file_path && DirTool.dir_exists(item.file_path)) {
        fs.rmSync(item.file_path, { recursive: true, force: true });
        this.refresh();
      }
    });

    vscode.commands.registerCommand('obi.build-history.delete-date', (item: BuildHistoryItem) => {
      const build_history_path = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
      if (item && item.date && DirTool.dir_exists(build_history_path)) {
        const build_history_dirs = DirTool.list_dir(build_history_path);
        build_history_dirs.forEach(dir => {
          const dirPath = path.join(build_history_path, dir);
          if (DirTool.dir_exists(dirPath)) {
            try {
              const parsableDir = dir.replace("_", " ").replace(/\./g, ':');
              const dirDate = new Date(parsableDir).toISOString().split('T')[0];
              if (dirDate === item.date) {
                fs.rmSync(dirPath, { recursive: true, force: true });
              }
            } catch (e) {
              logger.error(`Invalid date format for build history directory: ${dir}`);
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
    type: 'date' | 'build' | 'source',
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
    } else if (type === 'build') {
      this.tooltip = `Build history: ${fileName}`;
      this.contextValue = 'buildHistoryBuild';

      this.command = {
        command: 'obi.open_build_summary',
        title: 'Open Build Summary',
        arguments: [path.join(this.file_path, 'compile-list.json')]
      };

      this.iconPath = new vscode.ThemeIcon('file-text');
    } else { // source
      this.tooltip = `Source: ${label}`;
      this.contextValue = 'buildHistorySource';
      this.iconPath = new vscode.ThemeIcon('file-code');
    }
  }

}