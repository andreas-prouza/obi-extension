import * as vscode from 'vscode';
import * as path from 'path';
import { BuildPackageStore, PackageEntry } from '../../extension/obi/BuildPackageStore';
import { DirTool } from '../../extension/utilities/DirTool';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';
import { AppConfig } from '../../extension/config/AppConfig';
import { logger } from '../../extension/utilities/Logger';
import { has_extension } from '../../extension/obi/compile_list/modules/source_hashes';
import { ISourceInfos } from '../../shared/Source';
import { SOURCES_MIME_TYPE, invalid_source_names, package_matches, parse_dragged_sources } from '../../shared/BuildPackage';
import { get_error_message } from '../../shared/Errors';
import { LastBuildStatus, PackageLastBuild, PackageLastBuilds } from '../../extension/obi/PackageLastBuilds';


export const BUILD_PACKAGES_VIEW = 'obi.build-packages';
/** Workspace state: archived packages are shown */
const SHOW_ARCHIVED_KEY = 'obi.build-packages.show-archived';


/** Last build of a package on this computer, and whether its build summary is still in the build history */
export interface ItemLastBuild {
  build: PackageLastBuild;
  summary_exists: boolean;
}

const STATUS_SYMBOL: Record<LastBuildStatus, string> = { success: '✓', failed: '✗', incomplete: '○' };
const STATUS_COLOR: Record<LastBuildStatus, string> = { success: 'testing.iconPassed', failed: 'testing.iconFailed', incomplete: 'testing.iconQueued' };


/** "✓ 19.11.26, 10:31" and the sentence for the tooltip */
export function last_build_texts(build: PackageLastBuild): { short: string; sentence: string } {
  const time = new Date(build.timestamp);
  const when = isNaN(time.getTime()) ? build.timestamp : time.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  const sentence = build.status === 'success' ? vscode.l10n.t('Last build {0}: all {1} sources built', when, build.total)
    : build.status === 'failed' ? vscode.l10n.t('Last build {0}: {1} of {2} sources failed', when, build.failed, build.total)
      : vscode.l10n.t('Last build {0}: {1} of {2} sources not built (cancelled)', when, build.not_run, build.total);
  return { short: `${STATUS_SYMBOL[build.status]} ${when}`, sentence };
}


/** A build package (docs/features/build-packages.md); a file that can't be read is shown with its error */
export class BuildPackageItem extends vscode.TreeItem {

  constructor(public readonly entry: PackageEntry, public readonly last?: ItemLastBuild) {
    const sources = entry.pkg?.sources.length ?? 0;
    super(entry.name, sources > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.id = `package:${entry.name}`;

    if (!entry.pkg) {
      this.contextValue = 'obi-build-package-invalid';
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('list.errorForeground'));
      this.description = vscode.l10n.t('invalid file');
      this.tooltip = entry.error;
      return;
    }

    const archived = entry.pkg.archived === true;
    this.contextValue = archived ? 'obi-build-package-archived' : 'obi-build-package';
    this.iconPath = archived ? new vscode.ThemeIcon('archive')
      : new vscode.ThemeIcon('package', last ? new vscode.ThemeColor(STATUS_COLOR[last.build.status]) : undefined);
    const count = sources === 1 ? vscode.l10n.t('1 source') : vscode.l10n.t('{0} sources', sources);
    const texts = last ? last_build_texts(last.build) : undefined;
    const parts = [...(archived ? [vscode.l10n.t('archived')] : []), ...(entry.pkg.description ? [entry.pkg.description] : []), count];
    this.description = [...parts, ...(texts ? [texts.short] : [])].join(' · ');

    // The name and the description come from the (shared) file: text, not markdown. Only the own command is enabled.
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.isTrusted = { enabledCommands: ['obi.build-package.open-last-build'] };
    tooltip.appendText([entry.name, ...parts].join('\n'));
    if (last && texts) {
      tooltip.appendMarkdown('\n\n---\n\n');
      tooltip.appendText(texts.sentence);
      tooltip.appendMarkdown('  \n');
      if (last.summary_exists)
        tooltip.appendMarkdown(`[$(link-external) ${vscode.l10n.t('Open build summary')}](command:obi.build-package.open-last-build?${encodeURIComponent(JSON.stringify([entry.name]))})`);
      else
        tooltip.appendText(vscode.l10n.t('The build summary is no longer in the build history.'));
    }
    this.tooltip = tooltip;
  }

  public get name(): string {
    return this.entry.name;
  }
}


/** A source of a build package */
export class BuildPackageSourceItem extends vscode.TreeItem {

  constructor(public readonly package_name: string, public readonly source: string, source_description: string | undefined, exists: boolean) {
    const parts = source.split('/');
    super(parts.pop() ?? source, vscode.TreeItemCollapsibleState.None);
    this.id = `package:${package_name}:${source}`;
    this.contextValue = 'obi-build-package-source';

    const folder = parts.join('/');
    this.description = source_description ? `${folder} · ${source_description}` : folder;
    this.tooltip = source_description ? `${source}\n${source_description}` : source;

    const uri = DirTool.get_file_URI(path.join(DirTool.get_local_source_dir_relative(), source));
    if (exists) {
      // File icon of the theme and git decorations
      this.resourceUri = uri;
      this.command = { command: 'vscode.open', title: vscode.l10n.t('Open source member'), arguments: [uri] };
    }
    else {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
      this.tooltip = `${this.tooltip} — ${vscode.l10n.t('File not found')}`;
    }
  }
}


export type BuildPackageTreeItem = BuildPackageItem | BuildPackageSourceItem;


/** OBI sources of dropped file URIs (Explorer, editor tabs): files in the source folder with a supported type */
export function sources_of_uri_list(uri_list: string): string[] {
  const types = AppConfig.get_app_config().general['supported-object-types'] || [];
  const sources = uri_list.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => {
      try {
        return DirTool.to_obi_source(vscode.Uri.parse(line, true).fsPath);
      }
      catch {
        return undefined;
      }
    })
    .filter((source): source is string => source !== undefined && has_extension(source, types));
  const invalid = new Set(invalid_source_names(sources));
  return [...new Set(sources.filter(source => !invalid.has(source)))];
}


/**
 * Drag and drop: sources from the Source filters view, the Explorer or another package onto a package (or onto one of
 * its sources). Sources of a package can be dragged to another package.
 */
export class BuildPackagesDragAndDrop implements vscode.TreeDragAndDropController<BuildPackageTreeItem> {

  readonly dropMimeTypes = [SOURCES_MIME_TYPE, 'text/uri-list'];
  readonly dragMimeTypes = [SOURCES_MIME_TYPE];

  constructor(private readonly provider: BuildPackagesProvider) { }


  handleDrag(items: readonly BuildPackageTreeItem[], data: vscode.DataTransfer): void {
    const sources = items.filter((item): item is BuildPackageSourceItem => item instanceof BuildPackageSourceItem).map(item => item.source);
    if (sources.length > 0)
      data.set(SOURCES_MIME_TYPE, new vscode.DataTransferItem(JSON.stringify(sources)));
  }


  async handleDrop(target: BuildPackageTreeItem | undefined, data: vscode.DataTransfer): Promise<void> {
    const name = target instanceof BuildPackageSourceItem ? target.package_name : target?.entry.pkg ? target.name : undefined;
    if (!name) {
      vscode.window.showInformationMessage(vscode.l10n.t('Drop the sources on a build package.'));
      return;
    }

    const obi_sources = data.get(SOURCES_MIME_TYPE);
    const uri_list = data.get('text/uri-list');
    const sources = obi_sources
      ? parse_dragged_sources(await obi_sources.asString())
      : uri_list ? sources_of_uri_list(await uri_list.asString()) : [];
    if (sources.length === 0) {
      vscode.window.showWarningMessage(vscode.l10n.t('Only sources of the source folder with a supported type can be added to a build package.'));
      return;
    }

    try {
      const added = this.provider.store().add_sources(name, sources);
      logger.info(`Build package ${name}: added by drag and drop ${added.join(', ') || 'nothing'}`);
      if (added.length > 0)
        vscode.window.showInformationMessage(vscode.l10n.t('Added {0} source(s) to build package {1}.', added.length, name));
    }
    catch (e: unknown) {
      vscode.window.showErrorMessage(`${vscode.l10n.t('Build package: the action failed')}: ${get_error_message(e)}`);
    }
    finally {
      this.provider.refresh();
    }
  }
}


/** View "Build packages": package → sources. The commands are in BuildPackageCommands. */
export class BuildPackagesProvider implements vscode.TreeDataProvider<BuildPackageTreeItem> {

  private static instance: BuildPackagesProvider | undefined;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<BuildPackageTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private tree: vscode.TreeView<BuildPackageTreeItem> | undefined;
  private state: vscode.Memento | undefined;
  /** Text filter (name, description, source); '' = all */
  private filter = '';
  private show_archived = false;


  constructor(private readonly ws: string) {
    BuildPackagesProvider.instance = this;
  }


  public static get_instance(): BuildPackagesProvider | undefined {
    return BuildPackagesProvider.instance;
  }


  public store(): BuildPackageStore {
    return new BuildPackageStore(this.ws);
  }


  public register(context: vscode.ExtensionContext): void {
    this.state = context.workspaceState;
    this.show_archived = context.workspaceState.get<boolean>(SHOW_ARCHIVED_KEY, false);
    this.tree = vscode.window.createTreeView(BUILD_PACKAGES_VIEW, {
      treeDataProvider: this, canSelectMany: true, showCollapseAll: true, dragAndDropController: new BuildPackagesDragAndDrop(this)
    });
    context.subscriptions.push(this.tree, this._onDidChangeTreeData);
    this.update_context();
  }


  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }


  public get_filter(): string {
    return this.filter;
  }


  public set_filter(filter: string): void {
    this.filter = filter.trim();
    this.update_context();
    this.refresh();
  }


  public is_showing_archived(): boolean {
    return this.show_archived;
  }


  public set_show_archived(show: boolean): void {
    this.show_archived = show;
    this.state?.update(SHOW_ARCHIVED_KEY, show);
    this.update_context();
    this.refresh();
  }


  private update_context(): void {
    vscode.commands.executeCommand('setContext', 'obi.build-packages.filtered', this.filter !== '');
    vscode.commands.executeCommand('setContext', 'obi.build-packages.show-archived', this.show_archived);
    if (this.tree)
      this.tree.message = this.filter ? vscode.l10n.t('Filter: "{0}"', this.filter) : undefined;
  }


  /** Selected items of the view (for commands on several sources) */
  public selection(): readonly BuildPackageTreeItem[] {
    return this.tree?.selection ?? [];
  }


  /** Shows a package in the view, e.g. after it was created */
  public async reveal(name: string): Promise<void> {
    if (!this.tree?.visible)
      return;
    const entry = this.store().list().find(item => item.name === name);
    if (entry)
      await this.tree.reveal(new BuildPackageItem(entry), { select: true, focus: false, expand: true });
  }


  /** Packages shown at the top level: filtered by text; archived ones only if shown. Invalid files always. */
  public visible_packages(): { shown: PackageEntry[]; hidden_archived: number } {
    let hidden_archived = 0;
    const shown = this.store().list().filter(entry => {
      if (!entry.pkg)
        return true;
      if (!package_matches(entry.pkg, this.filter))
        return false;
      if (entry.pkg.archived && !this.show_archived) {
        hidden_archived++;
        return false;
      }
      return true;
    });
    return { shown, hidden_archived };
  }


  getTreeItem(element: BuildPackageTreeItem): vscode.TreeItem {
    return element;
  }


  getParent(element: BuildPackageTreeItem): BuildPackageTreeItem | undefined {
    if (element instanceof BuildPackageItem)
      return undefined;
    const entry = this.store().list().find(item => item.name === element.package_name);
    return entry ? new BuildPackageItem(entry) : undefined;
  }


  async getChildren(element?: BuildPackageTreeItem): Promise<BuildPackageTreeItem[]> {

    if (!element) {
      const { shown, hidden_archived } = this.visible_packages();
      if (this.tree)
        this.tree.description = hidden_archived > 0 ? vscode.l10n.t('{0} archived hidden', hidden_archived) : undefined;
      const last_builds = new PackageLastBuilds(this.ws);
      const all = last_builds.all();
      return shown.map(entry => {
        const build = all[entry.name];
        return new BuildPackageItem(entry, build ? { build, summary_exists: last_builds.summary_exists(build) } : undefined);
      });
    }

    if (!(element instanceof BuildPackageItem) || !element.entry.pkg)
      return [];

    const infos: ISourceInfos = await LocalSourceList.get_source_info_list();
    const source_dir = DirTool.get_local_source_dir();
    return element.entry.pkg.sources.map(source => new BuildPackageSourceItem(
      element.name, source, infos[source]?.description || undefined, DirTool.file_exists(path.join(source_dir, source))));
  }
}
