import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Constants } from '../../shared/Constants';
import { inside } from '../../shared/messages/MessageGuard';
import { logger } from '../../extension/utilities/Logger';
import { Workspace } from '../../extension/utilities/Workspace';
import { DirTool } from '../../extension/utilities/DirTool';
import { register_command } from '../../extension/utilities/Registration';
import { md5_file } from '../../extension/obi/compile_list/modules/source_hashes';
import { CompileDiagnostics } from '../../extension/source/CompileDiagnostics';
import { BuildHistoryProvider } from '../build_history/BuildHistoryProvider';
import { BuildIndex } from '../build_history/BuildIndex';
import { BuildEntry, FolderBuild, SourceResult, builds_below_folder, builds_for_source, item_id, page, parse_item_id } from '../build_history/HistoryIndex';
import { local_date_label } from '../build_history/HistoryTimestamp';
import { ObiTimeline, ObiTimelineItem, ObiTimelineOptions, ObiTimelineProvider, ObiWorkspaceTimelineProvider, TIMELINE_MIN_VERSION, TimelineApi, timeline_api } from './TimelineApi';


/** Provider id: passed to the item commands and used by the Timeline filter ("OBI builds") */
export const TIMELINE_ID = 'obi.builds';
const CMD_SHOWN = 80;
const SOURCES_SHOWN = 20;


type Target = { kind: 'file' | 'folder'; path: string; fs_path: string };


/**
 * The builds of the build history in the Timeline view: for a source, for a folder of sources and for the workspace.
 * Only on VS Code 1.145 or newer (stable Timeline API, see TimelineApi.ts).
 */
export class BuildTimeline implements ObiTimelineProvider, ObiWorkspaceTimelineProvider {

  private readonly file_changed = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  private readonly workspace_changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTimeline = this.file_changed.event;
  readonly onDidChangeWorkspaceTimeline = this.workspace_changed.event;


  constructor(private readonly api: Pick<TimelineApi, 'create_item'>) {}


  /** All timelines are requested again (new build, deleted builds) */
  public changed(): void {
    this.file_changed.fire(undefined);
    this.workspace_changed.fire();
  }


  public dispose(): void {
    this.file_changed.dispose();
    this.workspace_changed.dispose();
  }


  async provideTimeline(uri: vscode.Uri, options: ObiTimelineOptions, token: vscode.CancellationToken): Promise<ObiTimeline | undefined> {
    const target = BuildTimeline.target(uri);
    const root = BuildTimeline.history_root();
    if (!target || !root)
      return undefined;

    const index = BuildIndex.list(root, token);
    if (token.isCancellationRequested)
      return undefined;

    if (target.kind === 'folder') {
      const builds = page(builds_below_folder(index, target.path), options.cursor, options.limit);
      return { items: builds.items.map(build => this.folder_item(build, target.path)), cursor: builds.cursor };
    }

    const builds = page(builds_for_source(index, target.path), options.cursor, options.limit);
    const current_hash = builds.items.some(entry => entry.sources.get(target.path)?.hash)
      ? await md5_file(target.fs_path).catch(() => undefined)
      : undefined;
    if (token.isCancellationRequested)
      return undefined;
    return { items: builds.items.map(entry => this.source_item(entry, target.path, current_hash)), cursor: builds.cursor };
  }


  async provideWorkspaceTimeline(options: ObiTimelineOptions, token: vscode.CancellationToken): Promise<ObiTimeline | undefined> {
    const root = BuildTimeline.history_root();
    if (!root)
      return undefined;
    const index = BuildIndex.list(root, token);
    if (token.isCancellationRequested)
      return undefined;
    const builds = page(index, options.cursor, options.limit);
    return { items: builds.items.map(entry => this.build_item(entry)), cursor: builds.cursor };
  }


  /** .obi/build-history of the OBI folder; undefined without OBI project */
  private static history_root(): string | undefined {
    try {
      return path.join(Workspace.get_workspace(), Constants.BUILD_HISTORY_DIR);
    }
    catch {
      return undefined;
    }
  }


  /** The source or source folder of `uri`; undefined outside the source dir or without (valid) project */
  private static target(uri: vscode.Uri): Target | undefined {
    if (uri.scheme !== 'file')
      return undefined;
    let source_dir: string;
    try {
      source_dir = DirTool.get_local_source_dir();
    }
    catch {
      return undefined;
    }

    const is_dir = (() => {
      try {
        return fs.statSync(uri.fsPath).isDirectory();
      }
      catch {
        return false;   // deleted source: its builds are still shown
      }
    })();

    if (path.resolve(uri.fsPath) === path.resolve(source_dir))
      return { kind: 'folder', path: '', fs_path: uri.fsPath };
    const rel = DirTool.to_obi_source(uri.fsPath);
    if (!rel)
      return undefined;
    return { kind: is_dir ? 'folder' : 'file', path: rel, fs_path: uri.fsPath };
  }


  private new_item(label: string, entry: BuildEntry, id: string, context_value: string): ObiTimelineItem {
    const item = this.api.create_item(label, entry.time.getTime());
    item.id = id;
    item.contextValue = context_value;
    item.command = {
      command: 'obi.open_build_summary',
      title: vscode.l10n.t('Open build summary'),
      arguments: [path.join(Constants.BUILD_HISTORY_DIR, entry.dir, 'compile-list.json')],
    };
    return item;
  }


  private source_item(entry: BuildEntry, source: string, current_hash: string | undefined): ObiTimelineItem {
    const result: SourceResult = entry.sources.get(source) ?? { status: 'failed', cmds: [] };
    const item = this.new_item(BuildTimeline.status_label(result), entry, item_id(entry.dir, source), 'obi.build.source');

    item.iconPath = BuildTimeline.status_icon(result.status);
    const details = [BuildTimeline.cmd_summary(result)];
    if (current_hash && result.hash === current_hash)
      details.push(vscode.l10n.t('current version'));
    item.description = details.filter(text => text !== '').join(' · ');

    const tooltip = BuildTimeline.tooltip_head(item.label ?? '', entry);
    for (const cmd of result.cmds) {
      tooltip.appendMarkdown(`\n\n${cmd.status === 'success' ? '$(pass)' : cmd.status === 'new' ? '$(circle-outline)' : '$(error)'} `);
      tooltip.appendText(cmd.cmd.length > CMD_SHOWN ? `${cmd.cmd.slice(0, CMD_SHOWN)}…` : cmd.cmd);
    }
    const others = entry.sources.size - 1;
    if (others > 0)
      tooltip.appendText(`\n\n${others === 1 ? vscode.l10n.t('1 other source in this build') : vscode.l10n.t('{0} other sources in this build', others)}`);
    item.tooltip = tooltip;
    item.accessibilityInformation = { label: `${item.label}, ${local_date_label(entry.time)} ${entry.time.toLocaleTimeString()}, ${item.description}` };
    return item;
  }


  private folder_item(build: FolderBuild, folder: string): ObiTimelineItem {
    const item = this.new_item(BuildTimeline.build_label(build.failed, build.total), build.entry, item_id(build.entry.dir, folder), 'obi.build');
    item.iconPath = BuildTimeline.status_icon(build.failed > 0 ? 'failed' : 'success');
    item.description = build.total === 1 ? vscode.l10n.t('1 source in this folder') : vscode.l10n.t('{0} sources in this folder', build.total);
    item.tooltip = BuildTimeline.sources_tooltip(item.label ?? '', build.entry, source => folder === '' || source.startsWith(`${folder}/`));
    return item;
  }


  private build_item(entry: BuildEntry): ObiTimelineItem {
    const item = this.new_item(BuildTimeline.build_label(entry.failed, entry.total), entry, item_id(entry.dir), 'obi.build');
    item.iconPath = BuildTimeline.status_icon(entry.failed > 0 ? 'failed' : 'success');
    item.description = entry.total === 1 ? vscode.l10n.t('1 source') : vscode.l10n.t('{0} sources', entry.total);
    item.tooltip = BuildTimeline.sources_tooltip(item.label ?? '', entry, () => true);
    return item;
  }


  private static status_label(result: SourceResult): string {
    switch (result.status) {
      case 'success': return vscode.l10n.t('Build OK');
      case 'not-run': return vscode.l10n.t('Not built (build stopped)');
      case 'ignored': return vscode.l10n.t('Ignored');
      default: return vscode.l10n.t('Build failed');
    }
  }


  private static build_label(failed: number, total: number): string {
    return failed > 0 ? vscode.l10n.t('Build failed ({0} of {1})', failed, total) : vscode.l10n.t('Build OK');
  }


  private static status_icon(status: SourceResult['status']): vscode.ThemeIcon {
    switch (status) {
      case 'success': return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
      case 'not-run': return new vscode.ThemeIcon('circle-slash');
      case 'ignored': return new vscode.ThemeIcon('debug-step-over');
      default: return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    }
  }


  /** "3 commands", "failed at command 2 of 3", "1 of 3 commands run" */
  private static cmd_summary(result: SourceResult): string {
    const total = result.cmds.length;
    if (result.status === 'ignored' || total === 0)
      return '';
    if (result.status === 'success')
      return total === 1 ? vscode.l10n.t('1 command') : vscode.l10n.t('{0} commands', total);
    if (result.status === 'not-run')
      return vscode.l10n.t('{0} of {1} commands run', result.cmds.filter(cmd => cmd.status === 'success').length, total);
    const at = result.cmds.findIndex(cmd => cmd.status !== 'success' && cmd.status !== 'new');
    return vscode.l10n.t('failed at command {0} of {1}', at + 1, total);
  }


  private static tooltip_head(label: string, entry: BuildEntry): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString('', true);
    tooltip.appendMarkdown('**');
    tooltip.appendText(label);
    tooltip.appendMarkdown('** · ');
    tooltip.appendText(`${local_date_label(entry.time)} ${entry.time.toLocaleTimeString()}`);
    return tooltip;
  }


  private static sources_tooltip(label: string, entry: BuildEntry, filter: (source: string) => boolean): vscode.MarkdownString {
    const tooltip = BuildTimeline.tooltip_head(label, entry);
    const sources = [...entry.sources].filter(([source]) => filter(source));
    for (const [source, result] of sources.slice(0, SOURCES_SHOWN)) {
      const icon = result.status === 'success' ? '$(pass)' : result.status === 'ignored' ? '$(debug-step-over)' : result.status === 'not-run' ? '$(circle-slash)' : '$(error)';
      tooltip.appendMarkdown(`\n\n${icon} `);
      tooltip.appendText(source);
    }
    if (sources.length > SOURCES_SHOWN)
      tooltip.appendText(`\n\n${vscode.l10n.t('… and {0} more', sources.length - SOURCES_SHOWN)}`);
    return tooltip;
  }


  /** The build of a timeline item that this provider created; undefined (logged) for anything else */
  private static item_build(item: unknown): { entry: BuildEntry; path?: string } | undefined {
    const id = typeof item === 'object' && item !== null ? (item as { id?: unknown }).id : undefined;
    const root = BuildTimeline.history_root();
    if (typeof id !== 'string' || !root) {
      logger.warn('Timeline: command without OBI build item');
      return undefined;
    }
    const { dir, path: path_in_build } = parse_item_id(id);
    const dir_path = path.basename(dir) === dir ? inside(root, dir) : undefined;
    const entry = dir_path ? BuildIndex.read(dir_path) : undefined;
    if (!entry) {
      logger.warn(`Timeline: build '${dir}' not found in the build history`);
      return undefined;
    }
    return { entry, path: path_in_build };
  }


  private static async show_compile_messages(item: unknown): Promise<void> {
    const build = BuildTimeline.item_build(item);
    const source = build?.path;
    const result = source !== undefined ? build?.entry.sources.get(source) : undefined;
    if (!build || source === undefined || !result) {
      logger.warn('Timeline: compile messages requested for an item without source');
      return;
    }

    const root = CompileDiagnostics.evfevent_root(path.join(Constants.BUILD_HISTORY_DIR, build.entry.dir));
    const file = root ? inside(root, source) : undefined;
    if (!root || !file || !DirTool.file_exists(file)) {
      vscode.window.showInformationMessage(vscode.l10n.t('The build of {0} has no compile messages for {1}.', `${local_date_label(build.entry.time)} ${build.entry.time.toLocaleTimeString()}`, source));
      return;
    }
    CompileDiagnostics.load_source(source, root, result.status === 'success');
    await vscode.commands.executeCommand('workbench.actions.view.problems');
  }


  /**
   * Registers the commands of the timeline items and, on VS Code 1.145 or newer, the providers.
   * The returned instance is undefined on older versions.
   */
  public static register(context: vscode.ExtensionContext, api: TimelineApi | undefined = timeline_api()): BuildTimeline | undefined {

    register_command(context, 'obi.timeline.show-compile-messages', (item: unknown) => BuildTimeline.show_compile_messages(item));

    register_command(context, 'obi.timeline.reveal-in-history', async (item: unknown) => {
      const build = BuildTimeline.item_build(item);
      if (build)
        await BuildHistoryProvider.reveal_build(build.entry.dir);
    });

    register_command(context, 'obi.timeline.delete-build', async (item: unknown) => {
      const build = BuildTimeline.item_build(item);
      if (build)
        await BuildHistoryProvider.get_instance().delete_build(build.entry.dir);
    });

    if (!api) {
      logger.debug(`Timeline: needs VS Code ${TIMELINE_MIN_VERSION} (this is ${vscode.version}), not registered`);
      return undefined;
    }

    const timeline = new BuildTimeline(api);
    const label = vscode.l10n.t('OBI builds');
    context.subscriptions.push(
      timeline,
      api.registerTimelineProvider(TIMELINE_ID, label, 'file', timeline),
      api.registerWorkspaceTimelineProvider(TIMELINE_ID, label, timeline),
      BuildIndex.on_changed(() => timeline.changed()),
    );
    logger.info('Timeline: OBI builds registered');
    return timeline;
  }
}
