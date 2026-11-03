import * as vscode from 'vscode';


/**
 * Code from the workspace (local OBI, custom build summary template, git pull in local-obi-dir) only runs in a
 * trusted workspace. The extension is disabled in Restricted Mode (package.json capabilities); this guards
 * the places explicitly in case that changes.
 */
export function require_trust(action: string, trusted: boolean = vscode.workspace.isTrusted): boolean {
  if (trusted)
    return true;

  const manage = vscode.l10n.t('Manage Workspace Trust');
  vscode.window.showWarningMessage(vscode.l10n.t('{0} is disabled because this workspace is not trusted.', action), manage)
    .then(choice => {
      if (choice === manage)
        vscode.commands.executeCommand('workbench.trust.manage');
    });
  return false;
}
