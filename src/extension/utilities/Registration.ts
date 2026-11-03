import * as vscode from 'vscode';


/**
 * Registers a command that is disposed together with the extension.
 * Use this instead of `vscode.commands.registerCommand`.
 */
export function register_command<A extends unknown[]>(context: vscode.ExtensionContext, id: string, handler: (...args: A) => unknown): void {
  context.subscriptions.push(vscode.commands.registerCommand(id, handler));
}
