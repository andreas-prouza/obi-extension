import * as vscode from 'vscode';
import { BranchBuild } from './BranchBuild';
import { BuildPackageStore } from './BuildPackageStore';
import { SSH_Tasks } from '../utilities/SSH_Tasks';
import { Workspace } from '../utilities/Workspace';
import { OperationLock } from '../utilities/OperationLock';
import { logger } from '../utilities/Logger';
import { show_error } from '../utilities/Notify';
import { detect_base_branch, is_merged_into, list_branches } from '../utilities/GitChanges';
import { BranchLib, TicketLibs, TicketState, branch_for_text, group_by_ticket, parse_branch_libs_output, ticket_state } from '../../shared/BranchBuild';
import { suggest_package_name } from '../../shared/BuildPackage';
import { sh_quote } from '../../shared/ShellQuote';


interface TicketItem extends vscode.QuickPickItem {
  group: TicketLibs;
  branch?: string;
}


/** `main.py -a branch_libs …` of the OBI on IBM i, in the remote project folder (its configuration decides) */
async function run_branch_libs(argument: string): Promise<ReturnType<typeof parse_branch_libs_output>> {
  const base_dir = await SSH_Tasks.get_remote_base_dir();
  const obi_dir = await SSH_Tasks.get_remote_obi_dir();
  const cmd = `cd ${sh_quote(base_dir)} || exit 1; ${sh_quote(`${obi_dir}/venv/bin/python`)} -X utf8 ${sh_quote(`${obi_dir}/main.py`)} -a branch_libs -p . ${sh_quote(argument)}`;
  const result = await SSH_Tasks.run_command(cmd);
  logger.info(`branch_libs ${argument.split('=')[0]}: exit code ${result.code}`);
  if (result.stderr)
    logger.debug(`branch_libs stderr: ${result.stderr}`);
  const parsed = parse_branch_libs_output(result.stdout);
  if (!parsed)
    throw new Error(vscode.l10n.t('The OBI on IBM i gave no answer for the branch libraries: {0}', (result.stderr || result.stdout).trim().slice(0, 300)));
  if (parsed.status !== 'ok')
    throw new Error(parsed.message ?? parsed.status);
  return parsed;
}


function state_text(state: TicketState): string {
  switch (state) {
    case 'active': return vscode.l10n.t('active');
    case 'merged': return vscode.l10n.t('merged');
    case 'orphaned': return vscode.l10n.t('no branch');
    case 'unknown': return vscode.l10n.t('branch unknown');
  }
}


/**
 * OBI: Branch libraries (spec 4.6): lists the branch libraries on IBM i by ticket, with the state of its branch,
 * and deletes the picked ones after a confirmation. Merged tickets and tickets without a branch are preselected.
 * `main_branch`: [i-releaser] main-branch of deployment.toml (empty: the base branch of the repository, else main).
 */
export async function manage_branch_libraries(main_branch: string): Promise<void> {
  if (!BranchBuild.is_active()) {
    vscode.window.showInformationMessage(vscode.l10n.t('Branch build is not configured ([branch-build] in the OBI configuration).'));
    return;
  }
  try {
    await OperationLock.run('Branch libraries', () => do_manage(main_branch));
  }
  catch (e: unknown) {
    show_error(vscode.l10n.t('Branch libraries'), e);
  }
}


async function do_manage(main_branch_setting: string): Promise<void> {
  const ws = Workspace.get_workspace();
  const main_branch = main_branch_setting.trim() || detect_base_branch(ws)?.replace(/^origin\//, '') || 'main';

  const items = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Reading the branch libraries on IBM i…') }, async () => {
    await BranchBuild.ensure_remote_backend();
    const libs: BranchLib[] = (await run_branch_libs('--list'))?.libs ?? [];
    const branches = list_branches(ws);
    return group_by_ticket(libs).map((group): TicketItem => {
      const branch = branches ? branch_for_text(group.text, branches.local, branches.remote) : undefined;
      const local = branch !== undefined && !!branches?.local.includes(branch);
      const facts = branch && branches
        ? { local, remote: branches.remote.includes(`origin/${branch}`), upstream_gone: branches.gone.includes(branch), merged: is_merged_into(ws, branch, main_branch, local) }
        : undefined;
      const state = branches ? ticket_state(group.text, branch, facts) : 'unknown';
      return {
        label: branch ?? vscode.l10n.t('Ticket {0}', group.ticket),
        description: state_text(state),
        detail: [group.libs.map(lib => lib.name).join(', '), group.last_used ? vscode.l10n.t('last used {0}', group.last_used) : ''].filter(part => part !== '').join(' · '),
        picked: state === 'merged' || state === 'orphaned',
        group,
        branch,
      };
    });
  });

  if (items.length === 0) {
    vscode.window.showInformationMessage(vscode.l10n.t('There are no branch libraries on IBM i.'));
    return;
  }

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: vscode.l10n.t('Branch libraries on IBM i'),
    placeHolder: vscode.l10n.t('Tickets whose libraries are deleted (merged into {0} and without a branch are preselected)', main_branch),
  });
  if (!picked || picked.length === 0)
    return;

  const names = picked.flatMap(item => item.group.libs.map(lib => lib.name));
  const delete_button = vscode.l10n.t('Delete');
  const answer = await vscode.window.showWarningMessage(
    vscode.l10n.t('Delete {0} branch libraries on IBM i?', names.length),
    { modal: true, detail: `${names.join(', ')}\n\n${vscode.l10n.t('Deleting a library can\'t be undone. The next build of the ticket creates it again, empty.')}` },
    delete_button);
  if (answer !== delete_button)
    return;

  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Deleting branch libraries…') },
    () => run_branch_libs(`--delete=${names.join(',')}`));
  const deleted = result?.deleted ?? [];
  const failed = result?.failed ?? [];
  logger.info(`Branch libraries deleted: ${deleted.join(', ') || '-'}; failed: ${JSON.stringify(failed)}`);
  if (failed.length > 0)
    vscode.window.showErrorMessage(vscode.l10n.t('{0} branch libraries deleted, {1} not: {2}', deleted.length, failed.length, failed.map(f => `${f.name} (${f.message})`).join('; ')));
  else
    vscode.window.showInformationMessage(vscode.l10n.t('{0} branch libraries deleted.', deleted.length));

  offer_archive(picked, new Set(deleted));
}


/** After the libraries of a ticket are gone: offer to archive the build packages named after its branch */
function offer_archive(picked: TicketItem[], deleted: Set<string>): void {
  const store = new BuildPackageStore(Workspace.get_workspace());
  const existing = store.names();
  const packages = picked
    .filter(item => item.group.libs.every(lib => deleted.has(lib.name)))
    .map(item => suggest_package_name(item.branch))
    .map(name => existing.find(found => found.toLowerCase() === name?.toLowerCase()))
    .filter((name): name is string => name !== undefined && !store.get(name).archived);
  if (packages.length === 0)
    return;
  const archive = vscode.l10n.t('Archive');
  vscode.window.showInformationMessage(vscode.l10n.t('Archive the build packages of these tickets? {0}', packages.join(', ')), archive).then(answer => {
    if (answer !== archive)
      return;
    for (const name of packages)
      store.set_archived(name, true);
    vscode.commands.executeCommand('obi.build-package.refresh');
  });
}
