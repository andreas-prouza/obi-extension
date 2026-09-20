import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirTool } from '../../extension/utilities/DirTool';
import { Constants } from '../../shared/Constants';
import { logger } from '../../extension/utilities/Logger';
import * as source from '../../shared/Source';
import { Workspace } from '../../extension/utilities/Workspace';
import { AppConfig } from '../../shared/AppConfig';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';


interface IBuildHistorys {
  [element: string]: Promise<source.IQualifiedSource[] | undefined>
}

export class BuildHistoryProvider implements vscode.TreeDataProvider<BuildHistoryItem> {

  private static _instance: BuildHistoryProvider;
  private static _treeView: vscode.TreeView<BuildHistoryItem> | undefined;
  private workspaceRoot: string = '';
  private view_mode: 'date' | 'source' = 'date';
  private source_filter: Set<string> | undefined;
  private _onDidChangeTreeData: vscode.EventEmitter<BuildHistoryItem | undefined | null | void> = new vscode.EventEmitter<BuildHistoryItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BuildHistoryItem | undefined | null | void> = this._onDidChangeTreeData.event;


  constructor(workspaceRoot: string | undefined) {
    if (workspaceRoot !== undefined)
      this.workspaceRoot = workspaceRoot
    BuildHistoryProvider._instance = this;
  }


  public static escaped_date2date(escaped_date: string): Date {
    const parsableDir = escaped_date.replace(/\./g, ":");
    const normalized = parsableDir.replace(" ", "T")
      .replace("_", "T")
      .replace(/:(\d+)$/, ".$1")
      .substring(0, 23);
    return new Date(normalized);
  }

  public static date2escaped_date(date: string): string {
    return date.replace(/:/g, ".").replace(" ", "_");
  }


  getTreeItem(element: BuildHistoryItem): vscode.TreeItem {
    return element;
  }


  getParent(element: BuildHistoryItem): vscode.ProviderResult<BuildHistoryItem> {
    if (element.contextValue === 'buildHistoryBuild' && element.dateLabel) {
      return new BuildHistoryItem(element.dateLabel, vscode.TreeItemCollapsibleState.Collapsed, '', 'date');
    }
    return undefined;
  }



  async getChildren(element?: BuildHistoryItem): Promise<BuildHistoryItem[]> {
    if (!this.workspaceRoot) {
      return [];
    }

    const build_history_path = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
    if (!DirTool.dir_exists(build_history_path)) {
      return [];
    }

    const config = AppConfig.get_app_config();
    const build_history_dirs = DirTool.list_dir(build_history_path);
    const source_info_list = await LocalSourceList.get_source_info_list();

    if (this.view_mode === 'source') {
      return this.get_source_view_children(element, build_history_path, build_history_dirs, source_info_list);
    }

    if (element) {
      
      // List folders for a Date
      if (element.contextValue === 'buildHistoryDate') {
        
        // Children of a date group: these are the timestamped build folders
        // Convert back timestamp folder names to a valid timestamp format
        const historyItems = build_history_dirs
          .map(dir => {
            
            const dirPath = path.join(build_history_path, dir);
            
            if (DirTool.dir_exists(dirPath) && this.matches_filter(dirPath)) {
              const date: Date = BuildHistoryProvider.escaped_date2date(dir);
              const tzOffset = date.getTimezoneOffset() * 60000;
              const dirDate = new Date(date.getTime() - tzOffset).toISOString().split('T')[0];

              if (dirDate === element.label) {
                return new BuildHistoryItem(
                  date.toLocaleTimeString(),
                  vscode.TreeItemCollapsibleState.Collapsed,
                  dirPath,
                  'build',
                  dir,
                  dirDate
                );
              }
            }
            return null;
          })
          .filter((item): item is BuildHistoryItem => item !== null)
          .sort((a, b) => {
            // Extract the string value from either a string or a TreeItemLabel object
            const labelA = typeof a.label === 'string' ? a.label : (a.label?.label ?? '');
            const labelB = typeof b.label === 'string' ? b.label : (b.label?.label ?? '');

            return labelB.localeCompare(labelA);
          });

        return Promise.resolve(historyItems);
      }
        
      // List effected sources of a build
      if (element.contextValue === 'buildHistoryBuild') {
        
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
                    'source',
                    undefined,
                    undefined,
                    undefined,
                    (source_info_list[src.source] || {}).description
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
    const dateGroups = new Set<string>();

    build_history_dirs.forEach(dir => {
      const dirPath = path.join(build_history_path, dir);
      if (DirTool.dir_exists(dirPath) && this.matches_filter(dirPath)) {
        // The dir name is the timestamp
        try {
          const date: Date = BuildHistoryProvider.escaped_date2date(dir);
          const tzOffset = date.getTimezoneOffset() * 60000;
          
          dateGroups.add(new Date(date.getTime() - tzOffset).toISOString().split('T')[0]);
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


  /**
   * True when no source filter is active, or the build at dirPath contains at least one filtered source.
   */
  private matches_filter(dirPath: string): boolean {
    if (!this.source_filter || this.source_filter.size === 0) {
      return true;
    }
    const sources = BuildHistoryProvider.get_sources_from_build(dirPath);
    for (const source of this.source_filter) {
      if (sources.has(source)) {
        return true;
      }
    }
    return false;
  }


  /**
   * Reads the distinct source names referenced by a single build-history folder's compile-list.json.
   */
  private static get_sources_from_build(dirPath: string): Set<string> {
    const sources = new Set<string>();
    const compileListPath = path.join(dirPath, 'compile-list.json');

    if (!fs.existsSync(compileListPath)) {
      return sources;
    }

    try {
      const compileList = JSON.parse(fs.readFileSync(compileListPath, 'utf-8'));
      for (const compile of compileList.compiles || []) {
        for (const src of compile.sources || []) {
          if (src.source) {
            sources.add(src.source);
          }
        }
      }
    } catch (e) {
      logger.error(`Failed to parse compile-list.json in ${dirPath}: ${e}`);
    }
    return sources;
  }


  /**
   * Builds the source-based tree: source -> build date -> build time.
   */
  private get_source_view_children(
    element: BuildHistoryItem | undefined,
    build_history_path: string,
    build_history_dirs: string[],
    source_info_list: source.ISourceInfos
  ): BuildHistoryItem[] {

    // Level 2: builds on that date containing this source
    if (element?.contextValue === 'buildHistoryDateBySource' && element.sourceFilter) {
      const source_filter = element.sourceFilter;
      return build_history_dirs
        .map(dir => {
          const dirPath = path.join(build_history_path, dir);
          if (!DirTool.dir_exists(dirPath) || !BuildHistoryProvider.get_sources_from_build(dirPath).has(source_filter)) {
            return null;
          }
          const date = BuildHistoryProvider.escaped_date2date(dir);
          const tzOffset = date.getTimezoneOffset() * 60000;
          const dirDate = new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
          if (dirDate !== element.label) {
            return null;
          }
          return new BuildHistoryItem(date.toLocaleTimeString(), vscode.TreeItemCollapsibleState.Collapsed, dirPath, 'build', dir, dirDate);
        })
        .filter((item): item is BuildHistoryItem => item !== null)
        .sort((a, b) => {
          const labelA = typeof a.label === 'string' ? a.label : (a.label?.label ?? '');
          const labelB = typeof b.label === 'string' ? b.label : (b.label?.label ?? '');
          return labelB.localeCompare(labelA);
        });
    }

    // Level 1: distinct build dates that contain this source
    if (element?.contextValue === 'buildHistorySourceRoot' && element.sourceFilter) {
      const source_filter = element.sourceFilter;
      const dates = new Set<string>();
      for (const dir of build_history_dirs) {
        const dirPath = path.join(build_history_path, dir);
        if (!DirTool.dir_exists(dirPath) || !BuildHistoryProvider.get_sources_from_build(dirPath).has(source_filter)) {
          continue;
        }
        try {
          const date = BuildHistoryProvider.escaped_date2date(dir);
          const tzOffset = date.getTimezoneOffset() * 60000;
          dates.add(new Date(date.getTime() - tzOffset).toISOString().split('T')[0]);
        } catch (e) {
          logger.error(`Invalid date format for build history directory: ${dir}`);
        }
      }
      return Array.from(dates)
        .sort((a, b) => b.localeCompare(a))
        .map(date => new BuildHistoryItem(date, vscode.TreeItemCollapsibleState.Collapsed, '', 'date-by-source', undefined, undefined, source_filter));
    }

    // Root level: distinct sources across all builds
    if (!element) {
      const sources = new Set<string>();
      for (const dir of build_history_dirs) {
        const dirPath = path.join(build_history_path, dir);
        if (!DirTool.dir_exists(dirPath)) {
          continue;
        }
        for (const src of BuildHistoryProvider.get_sources_from_build(dirPath)) {
          sources.add(src);
        }
      }
      return Array.from(sources)
        .filter(source => !this.source_filter || this.source_filter.size === 0 || this.source_filter.has(source))
        .sort()
        .map(source => new BuildHistoryItem(
          source,
          vscode.TreeItemCollapsibleState.Collapsed,
          '',
          'source-root',
          undefined,
          undefined,
          undefined,
          (source_info_list[source] || {}).description
        ));
    }

    return [];
  }


  async get_child_elements(element: BuildHistoryItem): Promise<any> {
    return Promise.resolve([]);
  }


  async refresh(): Promise<void> {
    this._onDidChangeTreeData.fire();
  }


  public static get_instance(): BuildHistoryProvider {
    if (!BuildHistoryProvider._instance) {
      throw new Error('BuildHistoryProvider instance not initialized');
    }
    return BuildHistoryProvider._instance;
  }


  /**
   * Switches the tree between date-based and source-based layout and refreshes.
   */
  private async set_view_mode(mode: 'date' | 'source'): Promise<void> {
    if (this.view_mode === mode) {
      return;
    }
    this.view_mode = mode;
    await vscode.commands.executeCommand('setContext', 'obi.build-history.view-mode', mode);
    await this.refresh();
  }


  /**
   * Applies (or clears) the source filter, independent of the active view mode.
   */
  private async set_source_filter(sources: string[]): Promise<void> {
    this.source_filter = sources.length > 0 ? new Set(sources) : undefined;

    if (BuildHistoryProvider._treeView) {
      BuildHistoryProvider._treeView.message = this.source_filter
        ? `Filtered by source: ${Array.from(this.source_filter).join(', ')}`
        : undefined;
    }

    await vscode.commands.executeCommand('setContext', 'obi.build-history.filter-active', !!this.source_filter);
    await this.refresh();
  }


  /**
   * Shows a multi-select QuickPick of all sources found in the build history and applies it as a filter.
   */
  private async search(): Promise<void> {
    const build_history_path = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
    if (!DirTool.dir_exists(build_history_path)) {
      vscode.window.showInformationMessage('No build history found.');
      return;
    }

    const all_sources = new Set<string>();
    for (const dir of DirTool.list_dir(build_history_path)) {
      const dirPath = path.join(build_history_path, dir);
      if (!DirTool.dir_exists(dirPath)) {
        continue;
      }
      for (const src of BuildHistoryProvider.get_sources_from_build(dirPath)) {
        all_sources.add(src);
      }
    }

    if (all_sources.size === 0) {
      vscode.window.showInformationMessage('No sources found in build history.');
      return;
    }

    const source_info_list = await LocalSourceList.get_source_info_list();

    const quick_pick = vscode.window.createQuickPick();
    quick_pick.placeholder = 'Select sources to filter the build history...';
    quick_pick.canSelectMany = true;
    quick_pick.matchOnDescription = true;
    quick_pick.items = Array.from(all_sources).sort().map(source => ({
      label: source,
      description: (source_info_list[source] || {}).description || ''
    }));
    quick_pick.selectedItems = quick_pick.items.filter(item => this.source_filter?.has(item.label));

    const selected_sources: string[] | undefined = await new Promise((resolve) => {
      quick_pick.onDidAccept(() => {
        resolve(quick_pick.selectedItems.map(item => item.label));
        quick_pick.hide();
      });
      quick_pick.onDidHide(() => {
        resolve(undefined);
        quick_pick.dispose();
      });
      quick_pick.show();
    });

    if (selected_sources === undefined) {
      return;
    }

    await this.set_source_filter(selected_sources);
  }


  /**
   * Selects and reveals the tree item for the given build-history folder (e.g. after a rebuild).
   */
  public static async reveal_build(historyDirName: string): Promise<void> {

    const instance = BuildHistoryProvider._instance;
    if (!instance || !BuildHistoryProvider._treeView) {
      logger.warn(`reveal_build('${historyDirName}'): no provider instance or tree view registered yet`);
      return;
    }

    // reveal() is only wired up for the date-based hierarchy
    await instance.set_view_mode('date');

    const date = BuildHistoryProvider.escaped_date2date(historyDirName);
    const tzOffset = date.getTimezoneOffset() * 60000;
    const dateLabel = new Date(date.getTime() - tzOffset).toISOString().split('T')[0];

    // force the provider's internal model in sync with disk before looking the new node up
    await instance.refresh();

    // reveal() must be given the exact instances getChildren produces, a look-alike object won't match
    const dateItems = await instance.getChildren();
    const dateItem = dateItems.find(item => item.date === dateLabel);
    if (!dateItem) {
      logger.warn(`reveal_build('${historyDirName}'): no date group found for '${dateLabel}' (have: ${dateItems.map(i => i.date).join(', ')})`);
      return;
    }

    const buildItems = await instance.getChildren(dateItem);
    const buildItem = buildItems.find(item => item.dirName === historyDirName);
    if (!buildItem) {
      logger.warn(`reveal_build('${historyDirName}'): no build item found under '${dateLabel}' (have: ${buildItems.map(i => i.dirName).join(', ')})`);
      return;
    }

    try {
      await BuildHistoryProvider._treeView.reveal(buildItem, { select: true, focus: false, expand: true });
    } catch (e) {
      logger.error(`Failed to reveal build history item '${historyDirName}': ${e}`);
    }
  }


  public register(context: vscode.ExtensionContext): any {
    // setup
    const options = {
      treeDataProvider: this,
      showCollapseAll: true
    };

    // create (registerTreeDataProvider is not needed in addition to createTreeView for the same view id)
    const tree = vscode.window.createTreeView('obi.build-history', options);
    BuildHistoryProvider._treeView = tree;

    vscode.commands.executeCommand('setContext', 'obi.build-history.view-mode', this.view_mode);
    vscode.commands.executeCommand('setContext', 'obi.build-history.filter-active', false);

    vscode.commands.registerCommand('obi.build-history.switch-to-source-view', () => {
      this.set_view_mode('source');
    });

    vscode.commands.registerCommand('obi.build-history.switch-to-date-view', () => {
      this.set_view_mode('date');
    });

    vscode.commands.registerCommand('obi.build-history.search', () => {
      this.search();
    });

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
              const dirDate = BuildHistoryProvider.escaped_date2date(dir).toISOString().split('T')[0];
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

//    const buildHistoryPath = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR, '**/*');
  /*  const buildHistoryRootPath = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
    DirTool.dir_exists(buildHistoryRootPath) || fs.mkdirSync(buildHistoryRootPath);
    const watcherRootPath = vscode.workspace.createFileSystemWatcher(buildHistoryRootPath);
    const watcher = vscode.workspace.createFileSystemWatcher(buildHistoryPath);

    watcher.onDidCreate(() => this.refresh());
    watcher.onDidChange(() => this.refresh());
    watcher.onDidDelete(() => this.refresh());

    watcherRootPath.onDidCreate(() => this.refresh());
    watcherRootPath.onDidChange(() => this.refresh());
    watcherRootPath.onDidDelete(() => this.refresh());

    context.subscriptions.push(watcher, watcherRootPath, tree);
    */
  }



}



export class BuildHistoryItem extends vscode.TreeItem {

  public readonly file_path: string;
  public readonly date?: string;
  public readonly dirName?: string;
  public readonly dateLabel?: string;
  public readonly sourceFilter?: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    file_path: string,
    type: 'date' | 'build' | 'source' | 'source-root' | 'date-by-source',
    fileName?: string,
    dateLabel?: string,
    sourceFilter?: string,
    source_description?: string
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
      this.id = `date-${label}`;
    } else if (type === 'build') {
      this.tooltip = `Build history: ${fileName}`;
      this.contextValue = 'buildHistoryBuild';
      this.dirName = fileName;
      this.dateLabel = dateLabel;
      this.id = `build-${fileName}`;

      this.command = {
        command: 'obi.open_build_summary',
        title: 'Open Build Summary',
        arguments: [path.join(this.file_path, 'compile-list.json')]
      };

      this.iconPath = new vscode.ThemeIcon('file-text');
    } else if (type === 'source-root') {
      this.tooltip = `Builds containing ${label}`;
      this.contextValue = 'buildHistorySourceRoot';
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.sourceFilter = label;
      this.id = `source-root-${label}`;
      this.description = source_description;
    } else if (type === 'date-by-source') {
      this.tooltip = `Builds from ${label} containing ${sourceFilter}`;
      this.contextValue = 'buildHistoryDateBySource';
      this.iconPath = new vscode.ThemeIcon('calendar');
      this.date = label;
      this.sourceFilter = sourceFilter;
      this.id = `date-by-source-${sourceFilter}-${label}`;
    } else { // source
      this.tooltip = source_description ? `Source: ${label} (${source_description})` : `Source: ${label}`;
      this.contextValue = 'buildHistorySource';
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.description = source_description;
    }
  }

}