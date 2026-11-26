import * as vscode from 'vscode';
import { SSH_Tasks } from './SSH_Tasks';
import { logger } from './Logger';
import { show_error } from './Notify';
import { Constants } from '../../shared/Constants';
import { UserCancelledError, get_error_message } from '../../shared/Errors';
import { RemoteFacts, connection_check_script, parse_facts, path_has_open_source_packages, python_version_number, python_version_ok, remote_backend_constants, remote_python } from '../../shared/ConnectionCheck';


export type CheckState = 'ok' | 'warning' | 'error';

export interface CheckResult {
  state: CheckState;
  text: string;
}


/**
 * Test connection (configuration page, command obi.test-connection): connects with the saved configuration of the
 * active profile (asking for missing host, user, password and an unknown host key, as before a build) and checks the
 * IBM i side without changing anything. A cancelled prompt throws UserCancelledError.
 */
export async function test_connection(): Promise<CheckResult[]> {

  try {
    await SSH_Tasks.connect();
  }
  catch (e: unknown) {
    if (e instanceof UserCancelledError)
      throw e;
    return [{ state: 'error', text: vscode.l10n.t('Connection failed: {0}', get_error_message(e)) }];
  }

  const results: CheckResult[] = [{ state: 'ok', text: vscode.l10n.t('Connected to {0}, host key verified', SSH_Tasks.connection_label() ?? '') }];
  // An incomplete configuration: the connection result stays, the missing setting is the next one
  let base_dir: string;
  let obi_dir: string;
  try {
    base_dir = await SSH_Tasks.get_remote_base_dir();
    obi_dir = await SSH_Tasks.get_remote_obi_dir();
  }
  catch (e: unknown) {
    if (e instanceof UserCancelledError)
      throw e;
    results.push({ state: 'error', text: get_error_message(e) });
    return results;
  }
  const result = await SSH_Tasks.run_command(connection_check_script(base_dir, obi_dir));
  logger.info(`Test connection: exit code ${result.code}`);
  logger.debug(`Test connection: ${result.stdout}`);
  results.push(...evaluate(parse_facts(result.stdout), base_dir, obi_dir));
  return results;
}


function evaluate(facts: RemoteFacts, base_dir: string, obi_dir: string): CheckResult[] {
  const results: CheckResult[] = [];
  const home = facts.home ?? '$HOME';

  if (!facts.home_exists)
    results.push({ state: 'error', text: vscode.l10n.t("The home directory {0} doesn't exist. OBI offers to create it before the next build.", home) });
  else if (!facts.bashrc)
    results.push({ state: 'warning', text: vscode.l10n.t('{0} is missing. OBI offers to create it (with the PATH to /QOpenSys/pkgs/bin) before the next build.', `${home}/.bashrc`) });
  else if (!path_has_open_source_packages(facts.path))
    results.push({ state: 'warning', text: vscode.l10n.t('/QOpenSys/pkgs/bin is not in the PATH. Add it in {0}.', `${home}/.bashrc`) });
  else
    results.push({ state: 'ok', text: vscode.l10n.t('Home directory {0} with .bashrc and /QOpenSys/pkgs/bin in the PATH', home) });

  results.push(facts.base_dir_exists
    ? { state: 'ok', text: vscode.l10n.t('Project folder {0}', base_dir) }
    : { state: 'warning', text: vscode.l10n.t("The project folder {0} doesn't exist yet. It is created with the first transfer.", base_dir) });

  const version = python_version_number(facts.python_version);
  if (!facts.python_exists)
    results.push({ state: 'error', text: vscode.l10n.t('No OBI backend in {0}: {1} is missing. Check remote-obi-dir and the setup of OBI on the IBM i.', obi_dir, remote_python(obi_dir)) });
  else if (!version || !python_version_ok(version))
    results.push({ state: 'error', text: vscode.l10n.t('The Python of the OBI backend is too old or doesn\'t start ({0}). It needs 3.12 or newer.', facts.python_version ?? '') });
  else
    results.push({ state: 'ok', text: vscode.l10n.t('Python {0} of the OBI backend', version) });

  if (facts.python_exists) {
    if (facts.backend_version === undefined)
      results.push({ state: 'warning', text: vscode.l10n.t('The version of the OBI backend is unknown: no OBI_BACKEND_VERSION in {0}.', remote_backend_constants(obi_dir)) });
    else if (facts.backend_version < Constants.OBI_BACKEND_VERSION)
      results.push({ state: 'error', text: vscode.l10n.t('The OBI backend has version {0}, this extension needs {1} or newer. Update it with git pull in {2}, or turn on obi.backend.autoUpdateRemote.', facts.backend_version, Constants.OBI_BACKEND_VERSION, obi_dir) });
    else
      results.push({ state: 'ok', text: vscode.l10n.t('OBI backend version {0} in {1}', facts.backend_version, obi_dir) });
  }
  return results;
}


/** Overall state: the worst of the results */
export function overall_state(results: CheckResult[]): CheckState {
  return results.some(result => result.state === 'error') ? 'error' : results.some(result => result.state === 'warning') ? 'warning' : 'ok';
}


/** Command obi.test-connection: the test with a progress notification, the results in a modal dialog */
export async function show_connection_test(): Promise<void> {
  let results: CheckResult[];
  try {
    results = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Testing the connection…') }, () => test_connection());
  }
  catch (e: unknown) {
    if (!(e instanceof UserCancelledError))
      show_error(vscode.l10n.t('Test connection failed'), e);
    return;
  }
  const marks: Record<CheckState, string> = { ok: '✓', warning: '⚠', error: '✗' };
  const detail = results.map(result => `${marks[result.state]} ${result.text}`).join('\n');
  const state = overall_state(results);
  if (state === 'error')
    vscode.window.showErrorMessage(vscode.l10n.t('Test connection: there are problems'), { modal: true, detail });
  else if (state === 'warning')
    vscode.window.showWarningMessage(vscode.l10n.t('Test connection: OK, with notes'), { modal: true, detail });
  else
    vscode.window.showInformationMessage(vscode.l10n.t('Test connection: OK'), { modal: true, detail });
}
