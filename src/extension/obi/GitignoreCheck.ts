import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { with_gitignore_entries } from './ProjectGitignore';
import { DirTool } from '../utilities/DirTool';
import { logger } from '../utilities/Logger';


const DONT_ASK_KEY = 'obi.gitignore.dont_ask';


/** New project (Initialize): .gitignore with the recommended entries, unless the folder has one */
export function write_initial_gitignore(workspace: string): void {
  const file = path.join(workspace, '.gitignore');
  if (!fs.existsSync(file))
    DirTool.write_atomic(file, with_gitignore_entries(''));
}


/** true/false from `git check-ignore`; undefined without git repository (or git) */
function is_ignored_by_git(workspace: string, file: string): Promise<boolean | undefined> {
  return new Promise(resolve => {
    execFile('git', ['check-ignore', '-q', '--', file], { cwd: workspace }, error => {
      if (!error)
        return resolve(true);
      resolve((error as { code?: unknown }).code === 1 ? false : undefined);
    });
  });
}


/** Existing git project: offers once to add the missing recommended entries (existing lines stay) */
export async function offer_gitignore_entries(context: vscode.ExtensionContext, workspace: string): Promise<void> {
  if (context.workspaceState.get<boolean>(DONT_ASK_KEY))
    return;
  if (await is_ignored_by_git(workspace, '.obi/log/combined.log') !== false)
    return;

  const add = vscode.l10n.t('Add entries');
  const later = vscode.l10n.t('Not now');
  const never = vscode.l10n.t("Don't ask again");
  const answer = await vscode.window.showInformationMessage(
    vscode.l10n.t('Some OBI files with personal settings or build output are not ignored by git. Add the recommended entries to .gitignore?'),
    add, later, never);

  if (answer === add) {
    const file = path.join(workspace, '.gitignore');
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    DirTool.write_atomic(file, with_gitignore_entries(current));
    logger.info('Recommended OBI entries added to .gitignore');
  }
  if (answer === add || answer === never)
    await context.workspaceState.update(DONT_ASK_KEY, true);
}
