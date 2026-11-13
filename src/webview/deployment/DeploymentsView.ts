import * as vscode from 'vscode';
import * as path from 'path';
import { Constants } from '../../shared/Constants';
import { get_error_message } from '../../shared/Errors';
import { DeploymentState, StageState, StepState, get_deployment, get_workflow_definitions, show_details_url, shorten } from '../../shared/IReleaser';
import { ActionLog, DeploymentSummary, StageOption, cancel_deployment, deployment_projects, failed_step, get_action_log, is_final_status, list_deployments, run_stage, stage_options } from '../../shared/IReleaserDeployments';
import { logger } from '../../extension/utilities/Logger';
import { register_command } from '../../extension/utilities/Registration';
import { require_trust } from '../../extension/utilities/Trust';
import { show_error } from '../../extension/utilities/Notify';
import { Workspace } from '../../extension/utilities/Workspace';
import { BuildIndex } from '../build_history/BuildIndex';
import { local_date_label } from '../build_history/HistoryTimestamp';
import { DeploymentConfig } from './DeploymentConfig';
import { DeploymentWatcher } from './DeploymentWatcher';


export const VIEW_ID = 'obi.deployment';
export const LOG_SCHEME = 'obi-i-releaser';
const CONTEXT_KEY = 'obi.i-releaser-configured';
const PAGE_SIZE = 20;
/** Deployments watched for the view at the same time */
const MAX_WATCHED = 5;
const REQUEST_TIMEOUT_MS = 60_000;
const STALE_MS = 60_000;


interface LocalBuild { dir: string; time: Date }

type Node =
  | { kind: 'project'; key: string; project: string }
  | { kind: 'deployment'; key: string; project: string; summary: DeploymentSummary }
  | { kind: 'stage'; key: string; deployment: DeploymentNode; stage: StageState }
  | { kind: 'step'; key: string; deployment: DeploymentNode; stage: StageState; step: StepState }
  | { kind: 'more'; key: string; project: string }
  | { kind: 'info'; key: string; text: string; icon: string; command?: vscode.Command };

type DeploymentNode = Extract<Node, { kind: 'deployment' }>;
type StageNode = Extract<Node, { kind: 'stage' }>;
type StepNode = Extract<Node, { kind: 'step' }>;

/** What a log document shows besides the log: known while the window lives */
interface LogContext { deployment: string; stage: string; step: StepState }


function status_icon(status: string): vscode.ThemeIcon {
  switch (status) {
    case 'finished': return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    case 'failed': return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    case 'canceled': return new vscode.ThemeIcon('circle-slash');
    case 'in process':
    case 'in preperation':
    case 'prepare': return new vscode.ThemeIcon('sync~spin');
    case 'ready': return new vscode.ThemeIcon('play-circle');
    default: return new vscode.ThemeIcon('circle-outline');
  }
}


/**
 * The deployments of the project in i-Releaser, with their stages and steps (tree view obi.deployment),
 * and the actions on them: run a stage, cancel a deployment, show the log of a step.
 */
export class DeploymentsView implements vscode.TreeDataProvider<Node>, vscode.TextDocumentContentProvider {

  private static instance: DeploymentsView | undefined;

  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  /** Nodes of the last getChildren calls: commands only accept these */
  private nodes = new Map<string, Node>();
  private base: string | undefined;
  private projects: string[] | undefined;
  private deployments = new Map<string, DeploymentSummary[]>();
  private shown = new Map<string, number>();
  private details = new Map<string, DeploymentState>();
  private local_builds = new Map<string, LocalBuild>();
  private watched: string[] = [];
  private busy = new Set<string>();
  private log_contexts = new Map<string, LogContext>();
  /** New deployments the lists were read again for */
  private reloaded_for = new Set<string>();
  private loaded = 0;


  public static get_instance(): DeploymentsView | undefined {
    return DeploymentsView.instance;
  }


  // ---------------------------------------------------------------- data

  /** Everything is read again */
  public refresh(): void {
    this.projects = undefined;
    this.deployments.clear();
    this.details.clear();
    this.nodes.clear();
    this.changed.fire(undefined);
  }


  /** deployment.toml changed: context key, and the view is read again */
  public async config_changed(): Promise<void> {
    await DeploymentsView.update_context();
    this.refresh();
  }


  public static async update_context(): Promise<void> {
    let configured = false;
    try {
      configured = DeploymentConfig.i_releaser_url() !== undefined;
    }
    catch (e: unknown) {
      logger.warn(`${Constants.DEPLOYMENT_CONFIG_FILE}: ${get_error_message(e)}`);
    }
    await vscode.commands.executeCommand('setContext', CONTEXT_KEY, configured);
  }


  /** A request with a 60 s timeout, cancelled with `token` */
  private async with_timeout<T>(fn: (signal: AbortSignal) => Promise<T>, token?: vscode.CancellationToken): Promise<T> {
    const controller = new AbortController();
    let timed_out = false;
    const timer = setTimeout(() => { timed_out = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    const subscription = token?.onCancellationRequested(() => controller.abort());
    try {
      return await fn(controller.signal);
    }
    catch (e: unknown) {
      if (timed_out)
        throw new Error(vscode.l10n.t('No answer within 60 seconds'), { cause: e });
      throw e;
    }
    finally {
      clearTimeout(timer);
      subscription?.dispose();
    }
  }


  /** URL and token; undefined with an info node to show instead */
  private async connection(): Promise<{ base: string; token: string } | Node> {
    if (!vscode.workspace.isTrusted)
      return this.info(vscode.l10n.t('i-Releaser is only used in a trusted workspace.'), 'workspace-untrusted');
    let base: string | undefined;
    try {
      base = DeploymentConfig.i_releaser_url();
    }
    catch (e: unknown) {
      return this.info(get_error_message(e), 'error');
    }
    const configure: vscode.Command = { command: 'obi.deployment.maintain', title: vscode.l10n.t('Open deployment config') };
    if (!base)
      return this.info(vscode.l10n.t('No i-Releaser URL in {0}.', Constants.DEPLOYMENT_CONFIG_FILE), 'gear', configure);
    if (base !== this.base) {
      this.base = base;
      this.projects = undefined;
      this.deployments.clear();
      this.details.clear();
    }
    const token = await DeploymentConfig.get_auth_token(base);
    if (!token)
      return this.info(vscode.l10n.t('No i-Releaser token is stored for {0}.', base), 'key', configure);
    return { base, token };
  }


  private info(text: string, icon: string, command?: vscode.Command): Node {
    return this.remember({ kind: 'info', key: `info|${text}`, text, icon, command });
  }


  private remember<T extends Node>(node: T): T {
    this.nodes.set(node.key, node);
    return node;
  }


  /** Deployments started for a build of the local history, by deployment id */
  private read_local_builds(): void {
    this.local_builds.clear();
    let root: string;
    try {
      root = path.join(Workspace.get_workspace(), Constants.BUILD_HISTORY_DIR);
    }
    catch {
      return;
    }
    for (const entry of BuildIndex.list(root)) {
      if (entry.deployment && !this.local_builds.has(entry.deployment))
        this.local_builds.set(entry.deployment, { dir: entry.dir, time: entry.time });
    }
  }


  /** Current state: what the watcher knows, else what was read for the view */
  private state_of(id: number | string): DeploymentState | undefined {
    return (this.base ? DeploymentWatcher.info(this.base, id)?.state : undefined) ?? this.details.get(String(id));
  }

  private status_of(node: DeploymentNode): string {
    return this.state_of(node.summary.id)?.status ?? node.summary.status;
  }


  // ---------------------------------------------------------------- tree

  async getChildren(node?: Node): Promise<Node[]> {
    try {
      if (!node)
        return await this.root();
      switch (node.kind) {
        case 'project': return await this.deployments_of(node.project);
        case 'deployment': return await this.stages_of(node);
        case 'stage': return node.stage.steps.map(step => this.remember({ kind: 'step', key: `${node.key}|t|${step.id}`, deployment: node.deployment, stage: node.stage, step }));
        default: return [];
      }
    }
    catch (e: unknown) {
      logger.warn(`i-Releaser view: ${get_error_message(e)}`);
      return [this.info(get_error_message(e), 'error')];
    }
  }


  private async root(): Promise<Node[]> {
    this.nodes.clear();
    const connection = await this.connection();
    if ('kind' in connection)
      return [connection];
    this.loaded = Date.now();
    this.read_local_builds();

    if (!this.projects) {
      const definitions = await this.with_timeout(signal => get_workflow_definitions(connection.base, connection.token, signal));
      this.projects = deployment_projects(definitions, DeploymentConfig.get_deployment_config()['i-releaser']);
    }
    if (this.projects.length === 0)
      return [this.info(vscode.l10n.t('i-Releaser has no projects for this token.'), 'info')];
    if (this.projects.length === 1)
      return this.deployments_of(this.projects[0]);
    return this.projects.map(project => this.remember({ kind: 'project', key: `p|${project}`, project }));
  }


  private async deployments_of(project: string): Promise<Node[]> {
    const connection = await this.connection();
    if ('kind' in connection)
      return [connection];
    let list = this.deployments.get(project);
    if (!list) {
      list = await this.with_timeout(signal => list_deployments(connection.base, connection.token, project, signal));
      this.deployments.set(project, list);
    }
    if (list.length === 0)
      return [this.info(vscode.l10n.t('No deployments'), 'info')];
    const shown = this.shown.get(project) ?? PAGE_SIZE;
    const nodes: Node[] = list.slice(0, shown).map(summary => this.remember({ kind: 'deployment', key: `d|${summary.id}`, project, summary }));
    if (list.length > shown)
      nodes.push(this.remember({ kind: 'more', key: `m|${project}`, project }));
    return nodes;
  }


  private async stages_of(node: DeploymentNode): Promise<Node[]> {
    let state = this.state_of(node.summary.id);
    if (!state) {
      const connection = await this.connection();
      if ('kind' in connection)
        return [connection];
      state = await this.with_timeout(signal => get_deployment(connection.base, connection.token, node.summary.id, signal));
      this.details.set(String(node.summary.id), state);
    }
    return state.stages.map(stage => this.remember({ kind: 'stage', key: `${node.key}|s|${stage.id}`, deployment: node, stage }));
  }


  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case 'info': {
        const item = new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
        item.id = node.key;
        item.iconPath = new vscode.ThemeIcon(node.icon);
        item.command = node.command;
        item.tooltip = node.text;
        return item;
      }
      case 'more': {
        const item = new vscode.TreeItem(vscode.l10n.t('Show more…'), vscode.TreeItemCollapsibleState.None);
        item.id = node.key;
        item.command = { command: 'obi.deployment.show-more', title: vscode.l10n.t('Show more…'), arguments: [node] };
        return item;
      }
      case 'project': {
        const item = new vscode.TreeItem(node.project, vscode.TreeItemCollapsibleState.Expanded);
        item.id = node.key;
        item.iconPath = new vscode.ThemeIcon('project');
        item.contextValue = 'obi.ir.project';
        return item;
      }
      case 'deployment': return this.deployment_item(node);
      case 'stage': return this.stage_item(node);
      case 'step': return this.step_item(node);
    }
  }


  private deployment_item(node: DeploymentNode): vscode.TreeItem {
    const summary = node.summary;
    const status = this.status_of(node);
    const build = this.local_builds.get(String(summary.id));
    const label = summary.workflow ? `${summary.version ?? summary.id} · ${summary.workflow}` : String(summary.version ?? summary.id);
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = node.key;
    item.iconPath = status_icon(status);
    const build_label = build ? `${local_date_label(build.time)} ${build.time.toLocaleTimeString()}` : undefined;
    item.description = build_label ? `${status} · ${vscode.l10n.t('build {0}', build_label)}` : status;
    item.contextValue = ['obi.ir.deployment', is_final_status(status) ? '' : '.open', build ? '.build' : ''].join('');

    const lines = [
      vscode.l10n.t('i-Releaser deployment {0}', String(summary.id)),
      `${vscode.l10n.t('Workflow')}: ${summary.workflow ?? '-'}`,
      `${vscode.l10n.t('Version')}: ${summary.version ?? '-'}`,
      `${vscode.l10n.t('Status')}: ${status}`,
    ];
    if (summary.create_time)
      lines.push(`${vscode.l10n.t('Created')}: ${summary.create_time}`);
    if (summary.update_time)
      lines.push(`${vscode.l10n.t('Updated')}: ${summary.update_time}`);
    if (summary.commit)
      lines.push(`${vscode.l10n.t('Commit')}: ${summary.commit}`);
    if (build_label)
      lines.push(vscode.l10n.t('build {0}', build_label));
    item.tooltip = lines.join('\n');
    return item;
  }


  private stage_item(node: StageNode): vscode.TreeItem {
    const stage = node.stage;
    const item = new vscode.TreeItem(stage.name, stage.steps.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = node.key;
    item.iconPath = status_icon(stage.status);
    item.description = stage.status;

    const run_stages = DeploymentConfig.get_deployment_config()['i-releaser']['run-stages'];
    const options = stage_options(this.status_of(node.deployment), stage, run_stages);
    const context = ['obi.ir.stage'];
    if (options.length === 1)
      context.push('.run');
    if (options.length === 2)
      context.push('.retry');
    if (failed_step(stage))
      context.push('.failedlog');
    item.contextValue = context.join('');

    const lines = [`${stage.name}: ${stage.status}`];
    const would_run = stage_options(this.status_of(node.deployment), stage, undefined);
    if (would_run.length > 0 && options.length === 0)
      lines.push(vscode.l10n.t('Not in run-stages of {0}: run it in i-Releaser.', Constants.DEPLOYMENT_CONFIG_FILE));
    item.tooltip = lines.join('\n');
    return item;
  }


  private step_item(node: StepNode): vscode.TreeItem {
    const step = node.step;
    const item = new vscode.TreeItem(step.label, vscode.TreeItemCollapsibleState.None);
    item.id = node.key;
    item.iconPath = status_icon(step.status);
    item.description = step.cmd !== '' && step.cmd !== step.label ? `${step.status} · ${shorten(step.cmd, 40)}` : step.status;
    item.tooltip = step.cmd !== '' ? `${step.label}: ${step.status}\n\n${step.cmd}` : `${step.label}: ${step.status}`;
    item.contextValue = step.last_run !== undefined ? 'obi.ir.step.log' : 'obi.ir.step';
    if (step.last_run !== undefined)
      item.command = { command: 'obi.deployment.show-log', title: vscode.l10n.t('Show log'), arguments: [node] };
    return item;
  }


  /** A node of this tree, as the commands get it; undefined (logged) for anything else */
  private node_of<K extends Node['kind']>(value: unknown, kind: K): Extract<Node, { kind: K }> | undefined {
    const key = typeof value === 'object' && value !== null ? (value as { key?: unknown }).key : undefined;
    const node = typeof key === 'string' ? this.nodes.get(key) : undefined;
    if (!node || node !== value || node.kind !== kind) {
      logger.warn(`i-Releaser view: command without ${kind} item`);
      return undefined;
    }
    return node as Extract<Node, { kind: K }>;
  }


  // ---------------------------------------------------------------- live updates

  /** Expanded deployment that isn't final: watched (at most MAX_WATCHED) */
  private expanded(node: Node): void {
    if (node.kind !== 'deployment' || !this.base || is_final_status(this.status_of(node)))
      return;
    const id = String(node.summary.id);
    this.watched = this.watched.filter(other => other !== id);
    this.watched.push(id);
    DeploymentWatcher.watch(this.base, id, 'view');
    while (this.watched.length > MAX_WATCHED) {
      const oldest = this.watched.shift();
      if (oldest)
        DeploymentWatcher.unwatch(this.base, oldest, 'view');
    }
  }


  private collapsed(node: Node): void {
    if (node.kind !== 'deployment' || !this.base)
      return;
    const id = String(node.summary.id);
    this.watched = this.watched.filter(other => other !== id);
    DeploymentWatcher.unwatch(this.base, id, 'view');
  }


  private watcher_changed(base: string, id: string): void {
    if (base !== this.base)
      return;
    const node = this.nodes.get(`d|${id}`);
    if (node) {
      this.changed.fire(node);
      return;
    }
    // A deployment started after the list was read (build summary, custom template): read the lists again, once per id
    if (this.is_newer_than_lists(id)) {
      this.reloaded_for.add(id);
      logger.info(`i-Releaser view: deployment ${id} is new, reading the deployments again`);
      this.deployments.clear();
      this.changed.fire(undefined);
    }
  }


  /** Newer than every deployment of the lists read so far (ids of i-Releaser count up) */
  private is_newer_than_lists(id: string): boolean {
    if (this.reloaded_for.has(id) || this.deployments.size === 0 || !/^\d+$/.test(id))
      return false;
    const ids = [...this.deployments.values()].flat().map(summary => Number(summary.id)).filter(Number.isFinite);
    return ids.length === 0 || Number(id) > Math.max(...ids);
  }


  // ---------------------------------------------------------------- actions

  private async open_in_browser(value: unknown): Promise<void> {
    const node = this.node_of(value, 'deployment');
    if (node && this.base)
      await vscode.env.openExternal(vscode.Uri.parse(show_details_url(this.base, node.summary.id)));
  }


  private async open_build_summary(value: unknown): Promise<void> {
    const node = this.node_of(value, 'deployment');
    const build = node ? this.local_builds.get(String(node.summary.id)) : undefined;
    if (!build) {
      logger.warn('i-Releaser view: no local build for this deployment');
      return;
    }
    await vscode.commands.executeCommand('obi.open_build_summary', path.join(Constants.BUILD_HISTORY_DIR, build.dir, 'compile-list.json'));
  }


  private show_more(value: unknown): void {
    const node = this.node_of(value, 'more');
    if (!node)
      return;
    this.shown.set(node.project, (this.shown.get(node.project) ?? PAGE_SIZE) + PAGE_SIZE);
    const parent = this.nodes.get(`p|${node.project}`);
    this.changed.fire(parent);
  }


  /** Runs `fn` once per key at a time, in a trusted workspace, with the connection of the view */
  private async action(key: string, title: string, fn: (connection: { base: string; token: string }) => Promise<void>): Promise<void> {
    if (!require_trust(title))
      return;
    if (this.busy.has(key)) {
      logger.info(`i-Releaser view: ${title} is already running`);
      return;
    }
    const connection = await this.connection();
    if ('kind' in connection) {
      vscode.window.showErrorMessage(connection.kind === 'info' ? connection.text : title);
      return;
    }
    this.busy.add(key);
    try {
      await fn(connection);
    }
    catch (e: unknown) {
      show_error(vscode.l10n.t('{0} failed', title), e);
    }
    finally {
      this.busy.delete(key);
    }
  }


  private deployment_name(node: DeploymentNode): string {
    const summary = node.summary;
    const details = [summary.workflow, summary.version !== undefined ? vscode.l10n.t('version {0}', String(summary.version)) : undefined].filter(Boolean).join(', ');
    return details ? `${summary.id} (${details})` : String(summary.id);
  }


  public async run_stage(value: unknown, option: StageOption): Promise<void> {
    const node = this.node_of(value, 'stage');
    if (!node)
      return;
    const run_stages = DeploymentConfig.get_deployment_config()['i-releaser']['run-stages'];
    const options = stage_options(this.status_of(node.deployment), node.stage, run_stages);
    if (!options.includes(option)) {
      logger.warn(`i-Releaser view: stage ${node.stage.name} (${node.stage.status}) can't be run with ${option} from VS Code`);
      vscode.window.showWarningMessage(vscode.l10n.t('Stage {0} can\'t be run from VS Code now.', node.stage.name));
      return;
    }

    const title = vscode.l10n.t('Run stage {0}', node.stage.name);
    await this.action(node.key, title, async connection => {
      const question = option === 'run_all'
        ? vscode.l10n.t('Run all steps of stage {0} of deployment {1} again?', node.stage.name, this.deployment_name(node.deployment))
        : node.stage.status === 'failed'
          ? vscode.l10n.t('Continue stage {0} of deployment {1}?', node.stage.name, this.deployment_name(node.deployment))
          : vscode.l10n.t('Run stage {0} of deployment {1}?', node.stage.name, this.deployment_name(node.deployment));
      const confirm = vscode.l10n.t('Run stage');
      const choice = await vscode.window.showWarningMessage(question, { modal: true, detail: `i-Releaser: ${connection.base}` }, confirm);
      if (choice !== confirm)
        return;

      const id = node.deployment.summary.id;
      logger.info(`i-Releaser: run stage ${node.stage.id} (${node.stage.name}) of deployment ${id} with ${option}`);
      const answer = await vscode.window.withProgress({ location: { viewId: VIEW_ID }, title: title },
        () => this.with_timeout(signal => run_stage(connection.base, connection.token, id, node.stage.id, option, signal)));

      if (answer.service_running === false)
        vscode.window.showWarningMessage(vscode.l10n.t('Stage {0} waits in the queue: the processing service of i-Releaser isn\'t running.', node.stage.name));
      else
        vscode.window.showInformationMessage(vscode.l10n.t('Stage {0} of deployment {1} started.', node.stage.name, String(id)));

      this.details.delete(String(id));
      DeploymentWatcher.watch(connection.base, id, 'started');
      this.changed.fire(node.deployment);
    });
  }


  public async cancel(value: unknown): Promise<void> {
    const node = this.node_of(value, 'deployment');
    if (!node)
      return;
    if (is_final_status(this.status_of(node))) {
      logger.warn(`i-Releaser view: deployment ${node.summary.id} is already ${this.status_of(node)}`);
      return;
    }
    const title = vscode.l10n.t('Cancel deployment {0}', String(node.summary.id));
    await this.action(node.key, title, async connection => {
      const confirm = vscode.l10n.t('Cancel deployment');
      const choice = await vscode.window.showWarningMessage(vscode.l10n.t('Cancel deployment {0}?', this.deployment_name(node)),
        { modal: true, detail: `${vscode.l10n.t('A stage that is already running is not stopped.')}\ni-Releaser: ${connection.base}` }, confirm);
      if (choice !== confirm)
        return;

      const id = node.summary.id;
      logger.info(`i-Releaser: cancel deployment ${id}`);
      await vscode.window.withProgress({ location: { viewId: VIEW_ID }, title: title }, async () => {
        await this.with_timeout(signal => cancel_deployment(connection.base, connection.token, id, signal));
        const state = await this.with_timeout(signal => get_deployment(connection.base, connection.token, id, signal));
        this.details.set(String(id), state);
      });
      vscode.window.showInformationMessage(vscode.l10n.t('Deployment {0} canceled.', String(id)));
      this.changed.fire(node);
    });
  }


  public async show_log(value: unknown): Promise<void> {
    const node = this.node_of(value, 'step');
    if (node)
      await this.open_log(node.deployment, node.stage, node.step);
  }


  public async show_failed_log(value: unknown): Promise<void> {
    const node = this.node_of(value, 'stage');
    const step = node ? failed_step(node.stage) : undefined;
    if (node && step)
      await this.open_log(node.deployment, node.stage, step);
  }


  private async open_log(deployment: DeploymentNode, stage: StageState, step: StepState): Promise<void> {
    if (step.last_run === undefined || !/^\d+$/.test(String(step.last_run))) {
      logger.warn(`i-Releaser view: step ${step.id} has no run`);
      return;
    }
    if (!require_trust(vscode.l10n.t('Show log')))
      return;
    const run = String(step.last_run);
    this.log_contexts.set(run, { deployment: String(deployment.summary.id), stage: stage.name, step });
    const name = `${deployment.summary.id} ${stage.name} ${step.label}`.replace(/[\\/:*?"<>|\r\n]+/g, '_');
    const uri = vscode.Uri.from({ scheme: LOG_SCHEME, path: `/run/${run}/${shorten(name, 80)}.log` });
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true });
  }


  /** Log document (obi-i-releaser:/run/<run id>/<name>.log): get_action_log of the URL of deployment.toml */
  async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
    const match = /^\/run\/(\d+)\//.exec(uri.path);
    if (!match) {
      logger.warn(`i-Releaser log: invalid document ${uri.toString()}`);
      return vscode.l10n.t('Invalid i-Releaser log document.');
    }
    const run = match[1];
    const connection = await this.connection();
    if ('kind' in connection)
      return connection.kind === 'info' ? connection.text : '';

    let log: ActionLog | undefined;
    try {
      log = await this.with_timeout(signal => get_action_log(connection.base, connection.token, run, signal), token);
    }
    catch (e: unknown) {
      if (token.isCancellationRequested)
        return '';
      return vscode.l10n.t('The log could not be read: {0}', get_error_message(e));
    }
    if (!log)
      return vscode.l10n.t('i-Releaser has no log for run {0}.', run);
    return DeploymentsView.format_log(log, run, this.log_contexts.get(run));
  }


  private static format_log(log: ActionLog, run: string, context: LogContext | undefined): string {
    const lines: string[] = [];
    if (context) {
      lines.push(`${vscode.l10n.t('i-Releaser deployment {0}', context.deployment)} · ${vscode.l10n.t('stage {0}', context.stage)} · ${context.step.label}`);
      if (context.step.cmd)
        lines.push(`${vscode.l10n.t('Command')}: ${context.step.cmd}`);
    }
    lines.push(`${vscode.l10n.t('Run')}: ${run} · ${vscode.l10n.t('Status')}: ${log.status ?? '-'}${log.create_time ? ` · ${log.create_time}` : ''}`);
    lines.push('', '--- stdout ---', log.stdout.trimEnd(), '', '--- stderr ---', log.stderr.trimEnd(), '');
    return lines.join('\n');
  }


  // ---------------------------------------------------------------- registration

  public static register(context: vscode.ExtensionContext): DeploymentsView {

    const view = new DeploymentsView();
    DeploymentsView.instance = view;
    const tree = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: view, showCollapseAll: true });
    context.subscriptions.push(
      tree,
      view.changed,
      tree.onDidExpandElement(e => view.expanded(e.element)),
      tree.onDidCollapseElement(e => view.collapsed(e.element)),
      tree.onDidChangeVisibility(e => {
        if (e.visible && view.loaded > 0 && Date.now() - view.loaded > STALE_MS)
          view.refresh();
      }),
      DeploymentWatcher.on_changed(changed => view.watcher_changed(changed.base, changed.id)),
      context.secrets.onDidChange(e => {
        if (DeploymentConfig.is_token_key(e.key))
          view.refresh();
      }),
      vscode.workspace.registerTextDocumentContentProvider(LOG_SCHEME, view),
    );

    register_command(context, 'obi.deployment.refresh', () => view.refresh());
    register_command(context, 'obi.deployment.open-in-browser', (node: unknown) => view.open_in_browser(node));
    register_command(context, 'obi.deployment.open-build-summary', (node: unknown) => view.open_build_summary(node));
    register_command(context, 'obi.deployment.show-more', (node: unknown) => view.show_more(node));
    register_command(context, 'obi.deployment.run-stage', (node: unknown) => view.run_stage(node, 'continue'));
    register_command(context, 'obi.deployment.continue-stage', (node: unknown) => view.run_stage(node, 'continue'));
    register_command(context, 'obi.deployment.rerun-stage', (node: unknown) => view.run_stage(node, 'run_all'));
    register_command(context, 'obi.deployment.cancel', (node: unknown) => view.cancel(node));
    register_command(context, 'obi.deployment.show-log', (node: unknown) => view.show_log(node));
    register_command(context, 'obi.deployment.show-failed-log', (node: unknown) => view.show_failed_log(node));

    DeploymentsView.update_context().catch((e: unknown) => logger.warn(`i-Releaser view: ${get_error_message(e)}`));
    return view;
  }
}
