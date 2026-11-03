import * as vscode from 'vscode';
import { AppConfig } from './config/AppConfig';
import { Workspace } from './utilities/Workspace';
import { OperationLock } from './utilities/OperationLock';
import { DirTool } from './utilities/DirTool';
import { register_command } from './utilities/Registration';
import { show_log } from './utilities/Logger';
import { LastBuild, StatusState, render_status, summarize_build } from './utilities/StatusText';
import { OBICommands } from './obi/OBICommands';
import { ExtensionSettings } from './utilities/ExtensionSettings';


interface MenuItem extends vscode.QuickPickItem {
  run: () => unknown;
}


/** Status bar item: profile, running operation and result of the last build; click → menu */
export class StatusBar {

  private static readonly LAST_BUILD_KEY = 'obi.status.last_build';
  private static readonly CANCELLED_MS = 5000;

  private static item: vscode.StatusBarItem | undefined;
  private static context: vscode.ExtensionContext | undefined;
  private static running_since: number | undefined;
  private static timer: ReturnType<typeof setInterval> | undefined;
  private static cancelled_until = 0;


  public static init(context: vscode.ExtensionContext): void {
    StatusBar.context = context;
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    item.command = 'obi.status-bar.menu';
    item.name = 'OBI';
    StatusBar.item = item;

    context.subscriptions.push(
      item,
      OperationLock.on_did_change(() => StatusBar.on_operation()),
      Workspace.on_did_change_profile(() => StatusBar.update()),
      ExtensionSettings.on_did_change(() => StatusBar.update()),
      { dispose: () => { StatusBar.stop_timer(); StatusBar.item = undefined; } }
    );
    register_command(context, 'obi.status-bar.menu', () => StatusBar.menu());
    StatusBar.update();
  }


  /** After a build: remembered for the next start */
  public static build_finished(compile_list: Parameters<typeof summarize_build>[0]): void {
    StatusBar.context?.workspaceState.update(StatusBar.LAST_BUILD_KEY, summarize_build(compile_list));
    StatusBar.update();
  }


  public static show_cancelled(): void {
    StatusBar.cancelled_until = Date.now() + StatusBar.CANCELLED_MS;
    StatusBar.update();
    setTimeout(() => StatusBar.update(), StatusBar.CANCELLED_MS + 50);
  }


  private static on_operation(): void {
    if (OperationLock.running) {
      StatusBar.running_since ??= Date.now();
      StatusBar.timer ??= setInterval(() => StatusBar.update(), 1000);
    }
    else {
      StatusBar.running_since = undefined;
      StatusBar.stop_timer();
    }
    StatusBar.update();
  }


  private static stop_timer(): void {
    if (StatusBar.timer)
      clearInterval(StatusBar.timer);
    StatusBar.timer = undefined;
  }


  public static update(): void {
    const item = StatusBar.item;
    if (!item)
      return;
    if (!ExtensionSettings.status_bar_enabled()) {
      item.hide();
      return;
    }

    const config = AppConfig.get_app_config();
    const user = config.connection['ssh-user'];
    const host = config.connection['remote-host'];
    const state: StatusState = {
      profile: Workspace.get_current_profile() || 'default',
      connection: host ? (user ? `${user}@${host}` : host) : undefined,
      remote_dir: config.general['remote-base-dir'],
      running: OperationLock.running ? { label: OperationLock.running, elapsed_ms: Date.now() - (StatusBar.running_since ?? Date.now()) } : undefined,
      cancelled: Date.now() < StatusBar.cancelled_until,
      last_build: StatusBar.context?.workspaceState.get<LastBuild>(StatusBar.LAST_BUILD_KEY),
    };

    const { text, tooltip } = render_status(state);
    item.text = text;
    item.tooltip = new vscode.MarkdownString(tooltip, true);
    item.show();
  }


  /** True if the active editor shows a source OBI can build */
  private static active_source(): boolean {
    const file = vscode.window.activeTextEditor?.document.uri.fsPath;
    const source = file ? DirTool.to_obi_source(file) : undefined;
    return source !== undefined && (AppConfig.get_app_config().general['supported-object-types'] ?? []).includes(source.split('.').pop() ?? '');
  }


  private static async menu(): Promise<void> {
    const command = (id: string) => () => vscode.commands.executeCommand(id);
    const items: MenuItem[] = [{ label: `$(run-all) ${vscode.l10n.t('Run build (all changes)')}`, run: command('obi.run_build') }];
    if (StatusBar.active_source())
      items.push({ label: `$(run) ${vscode.l10n.t('Run build for the current source')}`, run: command('obi.run_single_build') });
    items.push(
      { label: `$(loaded-scripts-view-icon) ${vscode.l10n.t('Show changes')}`, run: command('obi.show_changes') },
      { label: `$(output) ${vscode.l10n.t('Open build summary')}`, run: command('obi.open_build_summary') },
      { label: `$(person) ${vscode.l10n.t('Switch profile…')}`, run: () => StatusBar.switch_profile() },
    );
    if (OperationLock.running)
      items.push({ label: `$(debug-stop) ${vscode.l10n.t('Cancel running operation')}`, description: OperationLock.running, run: () => OBICommands.cancel_running() });
    items.push(
      { label: `$(list-flat) ${vscode.l10n.t('Show build output')}`, run: command('obi.build.show-output') },
      { label: `$(output) ${vscode.l10n.t('Show log')}`, run: show_log },
    );

    const choice = await vscode.window.showQuickPick(items, { title: 'OBI' });
    await choice?.run();
  }


  private static async switch_profile(): Promise<void> {
    const current = Workspace.get_current_profile() || '';
    const profiles = AppConfig.get_profile_app_config_list().map(profile => ({
      label: profile.alias || 'default',
      description: profile.alias === current ? vscode.l10n.t('{0} (active)', profile.description) : profile.description,
      alias: profile.alias,
    }));
    const choice = await vscode.window.showQuickPick(profiles, { title: vscode.l10n.t('Switch OBI profile') });
    if (choice && choice.alias !== current)
      Workspace.change_profile(choice.alias);
  }
}
