import * as vscode from 'vscode';
import { ConfigFileError, UserCancelledError, get_error_details, get_error_message } from '../../shared/Errors';
import { logger, show_log } from './Logger';


export interface NotifyAction {
  title: string;
  run: () => unknown;
}


const MAX_LENGTH = 300;

/** Errors already shown to the user: the same error thrown further up isn't shown again */
const shown = new WeakSet<object>();


/** Action that opens the OBI configuration page */
export const OPEN_CONFIGURATION: NotifyAction = {
  get title() { return vscode.l10n.t('Open configuration'); },
  run: () => vscode.commands.executeCommand('obi.controller.config')
};


/**
 * Logs the error with its stack and shows one message `<message>: <cause>` with the actions and "Show log".
 * Shows nothing for UserCancelledError or an error that was already shown. Doesn't wait for the user.
 */
export function show_error(message: string, error?: unknown, actions: NotifyAction[] = []): void {

  if (error instanceof UserCancelledError)
    return;
  if (typeof error === 'object' && error !== null) {
    if (shown.has(error))
      return;
    shown.add(error);
  }

  const full = error === undefined ? message : `${message}: ${get_error_message(error)}`;
  logger.error(error === undefined ? full : `${message}: ${get_error_details(error)}`);

  const all: NotifyAction[] = [...actions];
  if (error instanceof ConfigFileError) {
    all.unshift({
      title: vscode.l10n.t('Open file'),
      run: () => {
        const position = new vscode.Position(Math.max((error.line ?? 1) - 1, 0), Math.max((error.column ?? 1) - 1, 0));
        return vscode.window.showTextDocument(vscode.Uri.file(error.file), { selection: new vscode.Range(position, position) });
      }
    });
  }
  all.push({ title: vscode.l10n.t('Show log'), run: show_log });

  const text = full.length > MAX_LENGTH ? `${full.slice(0, MAX_LENGTH - 1)}…` : full;
  vscode.window.showErrorMessage(text, ...all.map(action => action.title)).then(choice => {
    all.find(action => action.title === choice)?.run();
  });
}


/** Question in warning style (not red). Returns the chosen option, or undefined if cancelled. */
export async function ask<T extends string>(question: string, options: readonly T[], modal: boolean = true, detail?: string): Promise<T | undefined> {
  return vscode.window.showWarningMessage(question, { modal, detail }, ...options);
}
