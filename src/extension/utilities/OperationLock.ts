import * as vscode from 'vscode';


/**
 * One lock for all operations that touch .obi/tmp, the compile-list or the remote project folder
 * (build, show changes, transfer, remote checks, build summary edits).
 * Only user-facing entry points take the lock; their internal implementations don't, so nested calls work.
 */
export class OperationLock {

  private static current: string | undefined = undefined;
  private static cancellation: vscode.CancellationTokenSource | undefined = undefined;
  /** Never cancelled (CancellationToken.None needs a newer VS Code API) */
  private static readonly idle = new vscode.CancellationTokenSource();
  private static readonly _on_did_change = new vscode.EventEmitter<string | undefined>();
  /** Fires with the label of the running operation, or undefined when idle. */
  public static readonly on_did_change = OperationLock._on_did_change.event;


  public static get running(): string | undefined {
    return OperationLock.current;
  }


  /** Token of the running operation, cancelled by cancel(); never cancelled while idle */
  public static get token(): vscode.CancellationToken {
    return (OperationLock.cancellation ?? OperationLock.idle).token;
  }


  /** Cancel button of the OBI Build view and of progress notifications */
  public static cancel(): void {
    OperationLock.cancellation?.cancel();
  }


  /** Runs fn exclusively. If another operation is running, informs the user and returns undefined. */
  public static async run<T>(label: string, fn: (token: vscode.CancellationToken) => Promise<T>): Promise<T | undefined> {

    if (OperationLock.current) {
      vscode.window.showWarningMessage(vscode.l10n.t('OBI is busy: {0}. Please wait until it has finished.', OperationLock.current));
      return undefined;
    }

    const cancellation = new vscode.CancellationTokenSource();
    OperationLock.cancellation = cancellation;
    OperationLock.set(label);
    try {
      return await fn(cancellation.token);
    }
    finally {
      OperationLock.cancellation = undefined;
      cancellation.dispose();
      OperationLock.set(undefined);
    }
  }


  private static set(label: string | undefined): void {
    OperationLock.current = label;
    vscode.commands.executeCommand('setContext', 'obi.busy', label !== undefined);
    OperationLock._on_did_change.fire(label);
  }
}
