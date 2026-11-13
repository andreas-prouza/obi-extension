import * as vscode from 'vscode';
import { DeploymentState, StateChange, get_deployment, is_final, show_details_url, state_changes, watch_state } from '../../shared/IReleaser';
import { get_error_message } from '../../shared/Errors';
import { logger } from '../../extension/utilities/Logger';


/** The i-Releaser tokens of the secret storage (DeploymentConfig; not imported, which would be an import cycle) */
export interface TokenStore {
  get_auth_token(url: string): Promise<string | undefined>;
  is_token_key(key: string): boolean;
}

/** Why a deployment is watched: the build summary shows it, it was started in this window, or it is expanded in the deployments view */
export type WatchReason = 'summary' | 'started' | 'view';

/** What is known of a watched deployment */
export interface WatchedDeployment {
  state?: DeploymentState;
  /** Last error; the state stays the last one read */
  error?: string;
  checked?: Date;
}

interface Watch {
  base: string;
  id: string;
  reasons: Set<WatchReason>;
  controller: AbortController;
  info: WatchedDeployment;
  waiting_for_token?: boolean;
}


const READ_TIMEOUT_MS = 60_000;


/**
 * Follows deployments of i-Releaser (get_meta_file_json, then the events of watch_state) while there is a reason,
 * and reports finished and failed stages. The token is read from the secret storage for the URL of the deployment.
 */
export class DeploymentWatcher {

  private static readonly watches = new Map<string, Watch>();
  private static tokens: TokenStore | undefined;
  private static readonly emitter = new vscode.EventEmitter<{ base: string; id: string }>();
  /** A watched deployment was read or failed to be read */
  public static readonly on_changed = DeploymentWatcher.emitter.event;

  /** Waits before the next try: after 1, 2, … failures; then the last one. Changed by the tests. */
  public static retry_ms = [2_000, 5_000, 15_000, 30_000, 60_000];


  private static key(base: string, id: number | string): string {
    return `${base}|${id}`;
  }


  /** What is known of a deployment; undefined if it isn't watched */
  public static info(base: string, id: number | string): WatchedDeployment | undefined {
    return DeploymentWatcher.watches.get(DeploymentWatcher.key(base, id))?.info;
  }


  /** Watches the deployment for `reason` (nothing if it is already watched for it) */
  public static watch(base: string, id: number | string, reason: WatchReason): void {

    const key = DeploymentWatcher.key(base, id);
    const existing = DeploymentWatcher.watches.get(key);
    if (existing) {
      existing.reasons.add(reason);
      return;
    }
    // The URL comes from the workspace, and the token is sent there
    if (!vscode.workspace.isTrusted)
      return;

    const watch: Watch = { base, id: String(id), reasons: new Set([reason]), controller: new AbortController(), info: {} };
    DeploymentWatcher.watches.set(key, watch);
    logger.info(`i-Releaser: watch deployment ${watch.id} of ${base} (${reason})`);
    DeploymentWatcher.run(watch)
      .catch((e: unknown) => logger.warn(`i-Releaser: watching deployment ${watch.id} failed: ${get_error_message(e)}`))
      .finally(() => DeploymentWatcher.end(watch));
  }


  /** The build summary shows this deployment, or none: the deployment shown before is no longer watched for it */
  public static show(deployment: { base: string; id: number | string } | undefined): void {
    const key = deployment ? DeploymentWatcher.key(deployment.base, deployment.id) : undefined;
    for (const [other_key, watch] of [...DeploymentWatcher.watches]) {
      if (other_key !== key)
        DeploymentWatcher.release(watch, 'summary');
    }
    if (deployment)
      DeploymentWatcher.watch(deployment.base, deployment.id, 'summary');
  }


  /** The deployment is no longer watched for `reason` (it stays watched for the other reasons) */
  public static unwatch(base: string, id: number | string, reason: WatchReason): void {
    const watch = DeploymentWatcher.watches.get(DeploymentWatcher.key(base, id));
    if (watch)
      DeploymentWatcher.release(watch, reason);
  }


  /** Stops all watches (window closed, tests) */
  public static stop_all(): void {
    for (const watch of [...DeploymentWatcher.watches.values()])
      DeploymentWatcher.end(watch);
  }


  /** A token was stored or deleted: watches that had none start again */
  public static token_stored(): void {
    for (const watch of [...DeploymentWatcher.watches.values()]) {
      if (!watch.waiting_for_token)
        continue;
      const reasons = [...watch.reasons];
      DeploymentWatcher.end(watch);
      for (const reason of reasons)
        DeploymentWatcher.watch(watch.base, watch.id, reason);
    }
  }


  /** `tokens`: the token stored for a URL, and whether a key of the secret storage holds one (DeploymentConfig) */
  public static register(context: vscode.ExtensionContext, tokens: TokenStore): void {
    DeploymentWatcher.tokens = tokens;
    context.subscriptions.push(
      context.secrets.onDidChange(e => {
        if (tokens.is_token_key(e.key))
          DeploymentWatcher.token_stored();
      }),
      { dispose: () => DeploymentWatcher.stop_all() }
    );
  }


  private static release(watch: Watch, reason: WatchReason): void {
    watch.reasons.delete(reason);
    if (watch.reasons.size === 0)
      DeploymentWatcher.end(watch);
  }


  private static end(watch: Watch): void {
    watch.controller.abort();
    const key = DeploymentWatcher.key(watch.base, watch.id);
    if (DeploymentWatcher.watches.get(key) === watch) {
      DeploymentWatcher.watches.delete(key);
      logger.info(`i-Releaser: deployment ${watch.id} of ${watch.base} no longer watched`);
    }
  }


  private static changed(watch: Watch): void {
    DeploymentWatcher.emitter.fire({ base: watch.base, id: watch.id });
  }


  private static async run(watch: Watch): Promise<void> {

    const signal = watch.controller.signal;
    const token = await DeploymentWatcher.tokens?.get_auth_token(watch.base);
    if (!token) {
      watch.info.error = vscode.l10n.t('No i-Releaser token is stored for {0}.', watch.base);
      watch.waiting_for_token = true;
      DeploymentWatcher.changed(watch);
      // Stays while the summary shows it, with the hint; token_stored() starts it again
      watch.reasons.delete('started');
      if (watch.reasons.size > 0)
        await DeploymentWatcher.until_aborted(signal);
      return;
    }

    let failures = 0;
    while (!signal.aborted) {
      try {
        if (await DeploymentWatcher.read(watch, token)) {
          failures = 0;
          await watch_state(watch.base, token, watch.id, async () => {
            const open = await DeploymentWatcher.read(watch, token);
            failures = 0;
            return open;
          }, signal);
        }
      }
      catch (e: unknown) {
        if (signal.aborted)
          return;
        failures++;
        watch.info = { ...watch.info, error: get_error_message(e) };
        logger.warn(`i-Releaser: deployment ${watch.id}: ${watch.info.error}`);
        DeploymentWatcher.changed(watch);
      }

      if (watch.info.state && is_final(watch.info.state)) {
        // Shown as it is: nothing changes any more
        watch.reasons.delete('started');
        if (watch.reasons.size === 0)
          return;
        await DeploymentWatcher.until_aborted(signal);
        return;
      }
      const retry = DeploymentWatcher.retry_ms;
      await DeploymentWatcher.sleep(retry[Math.min(Math.max(failures - 1, 0), retry.length - 1)], signal);
    }
  }


  /** Reads the deployment and reports changes; false if it is finished or canceled */
  private static async read(watch: Watch, token: string): Promise<boolean> {

    const controller = new AbortController();
    const abort = () => controller.abort();
    watch.controller.signal.addEventListener('abort', abort);
    const timer = setTimeout(abort, READ_TIMEOUT_MS);
    let state: DeploymentState;
    try {
      state = await get_deployment(watch.base, token, watch.id, controller.signal);
    }
    catch (e: unknown) {
      if (controller.signal.aborted && !watch.controller.signal.aborted)
        throw new Error(vscode.l10n.t('No answer within 60 seconds'), { cause: e });
      throw e;
    }
    finally {
      clearTimeout(timer);
      watch.controller.signal.removeEventListener('abort', abort);
    }

    const before = watch.info.state;
    watch.info = { state: state, checked: new Date() };
    if (before)
      DeploymentWatcher.notify(watch, state, state_changes(before, state));
    DeploymentWatcher.changed(watch);
    return !is_final(state);
  }


  private static notify(watch: Watch, state: DeploymentState, changes: StateChange[]): void {
    const open = vscode.l10n.t('Open');
    const id = String(state.id);
    for (const change of changes) {
      let shown: Thenable<string | undefined>;
      switch (change.kind) {
        case 'stage-finished':
          shown = vscode.window.showInformationMessage(vscode.l10n.t('i-Releaser deployment {0}: stage {1} finished.', id, change.stage ?? ''), open);
          break;
        case 'stage-failed':
          shown = vscode.window.showErrorMessage(vscode.l10n.t('i-Releaser deployment {0}: stage {1} failed.', id, change.stage ?? ''), open);
          break;
        case 'canceled':
          shown = vscode.window.showWarningMessage(vscode.l10n.t('i-Releaser deployment {0} was canceled.', id), open);
          break;
      }
      logger.info(`i-Releaser: deployment ${id}: ${change.kind} ${change.stage ?? ''}`);
      shown.then(choice => {
        if (choice === open)
          vscode.env.openExternal(vscode.Uri.parse(show_details_url(watch.base, state.id)));
      });
    }
  }


  private static sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done);
      if (signal.aborted)
        done();
    });
  }


  private static until_aborted(signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      if (signal.aborted)
        return resolve();
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  }
}
