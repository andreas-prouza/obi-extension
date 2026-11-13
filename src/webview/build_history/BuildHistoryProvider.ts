import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirTool } from '../../extension/utilities/DirTool';
import { Constants } from '../../shared/Constants';
import { logger } from '../../extension/utilities/Logger';
import * as source from '../../shared/Source';
import { Workspace } from '../../extension/utilities/Workspace';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';
import { history_dir_name, local_date_label, parse_history_dir } from './HistoryTimestamp';
import { register_command } from '../../extension/utilities/Registration';
import { folder_size, format_size, select_expired } from './HistoryRetention';
import { ExtensionSettings } from '../../extension/utilities/ExtensionSettings';
import { BuildIndex } from './BuildIndex';
import { inside } from '../../shared/messages/MessageGuard';


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


  private static warned_dirs: Set<string> = new Set();
  /** Workspace state: the answer to the one-time question before the first automatic deletion */
  private static retention_state: vscode.Memento | undefined;
  private static retention_question_open = false;
  private size_generation = 0;

  /** Date of a history folder; undefined (logged once) if the folder name is not a timestamp. */
  public static parse_dir(dir: string): Date | undefined {
    const date = parse_history_dir(dir);
    if (!date && !BuildHistoryProvider.warned_dirs.has(dir)) {
      BuildHistoryProvider.warned_dirs.add(dir);
      logger.warn(`Build history: folder name is not a timestamp, ignored: ${dir}`);
    }
    return date;
  }

  public static date2escaped_date(date: string): string {
    return history_dir_name(date);
  }


  /** Tree item of one build. */
  private static build_item(dir: string, dirPath: string, date: Date): BuildHistoryItem {
    const item = new BuildHistoryItem(date.toLocaleTimeString(), vscode.TreeItemCollapsibleState.Collapsed, dirPath, 'build', dir, local_date_label(date));
    item.build_time = date;
    const deployment = BuildIndex.read(dirPath)?.deployment;
    if (deployment)
      item.description = vscode.l10n.t('i-Releaser {0}', deployment);
    return item;
  }

  /** Newest build first (by time, not by the locale-formatted label). */
  private static newest_first(a: BuildHistoryItem, b: BuildHistoryItem): number {
    return (b.build_time?.getTime() ?? 0) - (a.build_time?.getTime() ?? 0);
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
              const date = BuildHistoryProvider.parse_dir(dir);
              if (date && local_date_label(date) === element.label)
                return BuildHistoryProvider.build_item(dir, dirPath, date);
            }
            return null;
          })
          .filter((item): item is BuildHistoryItem => item !== null)
          .sort(BuildHistoryProvider.newest_first);

        return Promise.resolve(historyItems);
      }
        
      // List effected sources of a build
      if (element.contextValue === 'buildHistoryBuild') {
        
        const compileListPath = path.join(element.file_path, 'compile-list.json');
        if (!fs.existsSync(compileListPath))
          return Promise.resolve([]);

        const compileList = DirTool.get_json(compileListPath, false);
        if (!compileList || typeof compileList !== 'object')
          return Promise.resolve([new BuildHistoryItem('compile-list.json could not be read', vscode.TreeItemCollapsibleState.None, compileListPath, 'warning')]);

        const sources: BuildHistoryItem[] = [];
        for (const compile of Array.isArray(compileList.compiles) ? compileList.compiles : []) {
          for (const src of Array.isArray(compile?.sources) ? compile.sources : []) {

            if (typeof src?.source !== 'string')
              continue;

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
              title: vscode.l10n.t('Open source'),
              arguments: [DirTool.get_file_URI(path.join(DirTool.get_local_source_dir_relative(), src.source))]
            };
            sources.push(item);
          }
        }
        return Promise.resolve(sources);
      }
      return Promise.resolve([]);
    }

    // Top-level items (date groups)
    const dateGroups = new Set<string>();

    build_history_dirs.forEach(dir => {
      const dirPath = path.join(build_history_path, dir);
      if (DirTool.dir_exists(dirPath) && this.matches_filter(dirPath)) {
        // The dir name is the timestamp
        const date = BuildHistoryProvider.parse_dir(dir);
        if (date)
          dateGroups.add(local_date_label(date));
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
    // Shared with the Timeline: each compile-list.json is read once per change, not for every tree node
    return new Set(BuildIndex.read(dirPath)?.sources.keys() ?? []);
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
          const date = BuildHistoryProvider.parse_dir(dir);
          if (!date || local_date_label(date) !== element.label) {
            return null;
          }
          return BuildHistoryProvider.build_item(dir, dirPath, date);
        })
        .filter((item): item is BuildHistoryItem => item !== null)
        .sort(BuildHistoryProvider.newest_first);
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
        const date = BuildHistoryProvider.parse_dir(dir);
        if (date)
          dates.add(local_date_label(date));
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
    this.update_size();
  }


  /** "87 builds · 412 MB" next to the view title, computed in the background */
  private update_size(): void {
    const tree = BuildHistoryProvider._treeView;
    if (!tree || !this.workspaceRoot)
      return;

    const generation = ++this.size_generation;
    const root = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
    const builds = DirTool.dir_exists(root) ? DirTool.list_dir(root).filter(dir => DirTool.dir_exists(path.join(root, dir))).length : 0;
    folder_size(root)
      .then(bytes => {
        // Only the result of the latest refresh
        if (generation === this.size_generation)
          tree.description = builds === 0 ? undefined : builds === 1 ? vscode.l10n.t('1 build · {0}', format_size(bytes)) : vscode.l10n.t('{0} builds · {1}', builds, format_size(bytes));
      })
      .catch((e: unknown) => logger.debug(`Build history size: ${e}`));
  }


  public static init_retention(state: vscode.Memento): void {
    BuildHistoryProvider.retention_state = state;
  }


  /**
   * Deletes the builds beyond obi.buildHistory.maxBuilds and older than obi.buildHistory.maxAgeDays,
   * never `keep` (the build just written) and never folders without timestamp. Returns the number of deleted builds.
   */
  public static async apply_retention(keep?: string): Promise<number> {
    const root = path.join(Workspace.get_workspace(), Constants.BUILD_HISTORY_DIR);
    if (!DirTool.dir_exists(root))
      return 0;

    const max_builds = ExtensionSettings.build_history_max_builds();
    const entries = DirTool.list_dir(root)
      .filter(dir => DirTool.dir_exists(path.join(root, dir)))
      .map(dir => ({ dir, date: parse_history_dir(dir) }));
    const expired = select_expired(entries, { max_builds, max_age_days: ExtensionSettings.build_history_max_age_days() }, new Date(), keep);

    if (expired.length === 0 || !(await BuildHistoryProvider.retention_allowed(expired.length, max_builds)))
      return 0;

    for (const dir of expired)
      await fs.promises.rm(path.join(root, dir), { recursive: true, force: true });
    logger.info(`Build history: ${expired.length} old builds deleted: ${expired.join(', ')}`);
    BuildHistoryProvider._instance?.refresh();
    return expired.length;
  }


  /** Existing history is only deleted automatically if the user set a limit or agreed once in this workspace */
  private static async retention_allowed(count: number, max_builds: number): Promise<boolean> {
    if (ExtensionSettings.build_history_limit_configured())
      return true;

    const state = BuildHistoryProvider.retention_state;
    const decision = state?.get<'delete' | 'keep'>('obi.buildHistory.retention');
    if (decision || !state || BuildHistoryProvider.retention_question_open)
      return decision === 'delete';

    BuildHistoryProvider.retention_question_open = true;
    try {
      const delete_text = vscode.l10n.t('Delete old builds');
      const keep_text = vscode.l10n.t('Keep all');
      const answer = await vscode.window.showInformationMessage(
        vscode.l10n.t('The build history contains {0} builds more than the newest {1} (setting obi.buildHistory.maxBuilds). Delete them now and keep the history limited after each build?', count, max_builds),
        delete_text, keep_text);
      // Dismissed: ask again next time
      if (answer === delete_text || answer === keep_text)
        await state.update('obi.buildHistory.retention', answer === delete_text ? 'delete' : 'keep');
      return answer === delete_text;
    }
    finally {
      BuildHistoryProvider.retention_question_open = false;
    }
  }


  /**
   * Deletes one build after a modal confirmation (history tree and Timeline). `dir` is the history folder name;
   * anything else (a path, a folder that isn't a build) is refused. True if deleted.
   */
  public async delete_build(dir: string): Promise<boolean> {
    const root = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
    const dir_path = path.basename(dir) === dir ? inside(root, dir) : undefined;
    const date = BuildHistoryProvider.parse_dir(dir);
    if (!this.workspaceRoot || !dir_path || !date || !DirTool.dir_exists(dir_path)) {
      logger.warn(`Build history: '${dir}' is no build, not deleted`);
      return false;
    }

    if (!(await BuildHistoryProvider.confirm_delete(vscode.l10n.t('Delete build {0} {1}?', local_date_label(date), date.toLocaleTimeString()))))
      return false;
    await fs.promises.rm(dir_path, { recursive: true, force: true });
    this.refresh();
    return true;
  }


  /** Modal question; true if confirmed */
  private static async confirm_delete(question: string): Promise<boolean> {
    const delete_text = vscode.l10n.t('Delete');
    return await vscode.window.showWarningMessage(question, { modal: true }, delete_text) === delete_text;
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
      vscode.window.showInformationMessage(vscode.l10n.t('No build history found.'));
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
      vscode.window.showInformationMessage(vscode.l10n.t('No sources found in the build history.'));
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

    const date = BuildHistoryProvider.parse_dir(historyDirName);
    if (!date)
      return;
    const dateLabel = local_date_label(date);

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
    context.subscriptions.push(tree, this._onDidChangeTreeData);
    this.update_size();

    vscode.commands.executeCommand('setContext', 'obi.build-history.view-mode', this.view_mode);
    vscode.commands.executeCommand('setContext', 'obi.build-history.filter-active', false);

    register_command(context, 'obi.build-history.switch-to-source-view', () => {
      this.set_view_mode('source');
    });

    register_command(context, 'obi.build-history.switch-to-date-view', () => {
      this.set_view_mode('date');
    });

    register_command(context, 'obi.build-history.search', () => {
      this.search();
    });

    register_command(context, 'obi.build-history.update', () => {
      this.refresh();
    });

    register_command(context, 'obi.build-history.delete-item', async (item: BuildHistoryItem) => {
      if (item?.dirName)
        await this.delete_build(item.dirName);
    });

    register_command(context, 'obi.build-history.delete-date', async (item: BuildHistoryItem) => {
      const build_history_path = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
      if (item && item.date && DirTool.dir_exists(build_history_path)) {
        // Same local date as the tree labels (before: UTC date, so builds around midnight were missed)
        const dirs = DirTool.list_dir(build_history_path).filter(dir => {
          const date = DirTool.dir_exists(path.join(build_history_path, dir)) ? BuildHistoryProvider.parse_dir(dir) : undefined;
          return date !== undefined && local_date_label(date) === item.date;
        });
        if (dirs.length === 0 || !(await BuildHistoryProvider.confirm_delete(dirs.length === 1 ? vscode.l10n.t('Delete the build of {0}?', item.date) : vscode.l10n.t('Delete {0} builds of {1}?', dirs.length, item.date))))
          return;
        for (const dir of dirs)
          fs.rmSync(path.join(build_history_path, dir), { recursive: true, force: true });
        this.refresh();
      }
    });

    register_command(context, 'obi.build-history.delete-all', async () => {
      const build_history_path = path.join(this.workspaceRoot, Constants.BUILD_HISTORY_DIR);
      const dirs = DirTool.dir_exists(build_history_path) ? DirTool.list_dir(build_history_path).filter(dir => DirTool.dir_exists(path.join(build_history_path, dir))) : [];
      if (dirs.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('No build history found.'));
        return;
      }
      const bytes = await folder_size(build_history_path);
      const question = dirs.length === 1 ? vscode.l10n.t('Delete the build history (1 build, {0})?', format_size(bytes)) : vscode.l10n.t('Delete all {0} builds ({1})?', dirs.length, format_size(bytes));
      if (!(await BuildHistoryProvider.confirm_delete(question)))
        return;
      for (const dir of dirs)
        await fs.promises.rm(path.join(build_history_path, dir), { recursive: true, force: true });
      this.refresh();
    });
  }



}



export class BuildHistoryItem extends vscode.TreeItem {

  public readonly file_path: string;
  public build_time?: Date;
  public readonly date?: string;
  public readonly dirName?: string;
  public readonly dateLabel?: string;
  public readonly sourceFilter?: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    file_path: string,
    type: 'date' | 'build' | 'source' | 'source-root' | 'date-by-source' | 'warning',
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
        title: vscode.l10n.t('Open build summary'),
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
    } else if (type === 'warning') {
      this.tooltip = label;
      this.contextValue = 'buildHistoryWarning';
      this.iconPath = new vscode.ThemeIcon('warning');
    } else { // source
      this.tooltip = source_description ? `Source: ${label} (${source_description})` : `Source: ${label}`;
      this.contextValue = 'buildHistorySource';
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.description = source_description;
    }
  }

}