import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HostKeyDecision, StoredHostKey, check_known_hosts, decide, fingerprint, key_algorithm } from './HostKey';
import { UserCancelledError } from '../../shared/Errors';
import { logger } from './Logger';


const STATE_PREFIX = 'obi|hostkey|';


/** Result of checking the key a host presented in the SSH handshake */
export interface HostKeyCheck {
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  decision: HostKeyDecision;
  /** Where the known key comes from */
  known_from?: 'stored' | 'known_hosts';
  /** Fingerprint stored for the host (only for 'stored') */
  stored_fingerprint?: string;
}


/** Trusted SSH host keys, stored globally (the same IBM i is used from many projects) */
export class HostKeyStore {

  /** OpenSSH known_hosts of the user; keys found there are trusted without asking */
  public static known_hosts_file: string = path.join(os.homedir(), '.ssh', 'known_hosts');


  private static state_key(host: string, port: number): string {
    return `${STATE_PREFIX}${host.toLowerCase()}:${port}`;
  }


  public static get(state: vscode.Memento, host: string, port: number): StoredHostKey | undefined {
    return state.get<StoredHostKey>(HostKeyStore.state_key(host, port));
  }


  /** Synchronous, because it runs inside the SSH handshake */
  public static check(state: vscode.Memento, host: string, port: number, key: Buffer): HostKeyCheck {
    const result: HostKeyCheck = { host, port, algorithm: key_algorithm(key), fingerprint: fingerprint(key), decision: 'unknown' };

    const stored = HostKeyStore.get(state, host, port);
    if (stored) {
      return { ...result, decision: decide(stored.fingerprint, result.fingerprint), known_from: 'stored', stored_fingerprint: stored.fingerprint };
    }

    let known_hosts: string | undefined;
    try {
      known_hosts = fs.readFileSync(HostKeyStore.known_hosts_file, 'utf8');
    }
    catch {
      known_hosts = undefined;   // no known_hosts file
    }
    if (known_hosts !== undefined) {
      const decision = check_known_hosts(known_hosts, host, port, key);
      if (decision !== 'unknown')
        return { ...result, decision, known_from: 'known_hosts' };
    }

    return result;
  }


  /** Asks whether to trust an unknown host key and stores it. Throws UserCancelledError if not trusted. */
  public static async confirm_and_store(state: vscode.Memento, check: HostKeyCheck): Promise<void> {
    const trust = vscode.l10n.t('Trust and connect');
    const answer = await vscode.window.showWarningMessage(
      vscode.l10n.t('The authenticity of host {0} (port {1}) can\'t be established.', check.host, check.port),
      {
        modal: true,
        detail: vscode.l10n.t('{0} key fingerprint:\n{1}\n\nCompare it with the fingerprint of the SSH host key on the IBM i (ssh-keygen -lf <host key>.pub) before you trust it.', check.algorithm, check.fingerprint)
      },
      trust
    );
    if (answer !== trust)
      throw new UserCancelledError(`Host key of ${check.host} not trusted`);

    const value: StoredHostKey = { algorithm: check.algorithm, fingerprint: check.fingerprint, first_seen: new Date().toISOString() };
    await state.update(HostKeyStore.state_key(check.host, check.port), value);
    logger.info(`Trusted host key of ${check.host}:${check.port}: ${check.algorithm} ${check.fingerprint}`);
  }


  public static async show_mismatch(check: HostKeyCheck): Promise<void> {
    const known = check.known_from === 'known_hosts'
      ? vscode.l10n.t('Known ({0}): a different {1} key', HostKeyStore.known_hosts_file, check.algorithm)
      : vscode.l10n.t('Stored: {0}', check.stored_fingerprint ?? '');
    const remedy = check.known_from === 'known_hosts'
      ? vscode.l10n.t('If the change is expected, remove the old entry from {0} (ssh-keygen -R {1}).', HostKeyStore.known_hosts_file, check.host)
      : vscode.l10n.t('If the change is expected, run "OBI: Forget stored SSH host key" and connect again.');

    logger.error(`Host key of ${check.host}:${check.port} has changed. Received ${check.algorithm} ${check.fingerprint}`);
    await vscode.window.showErrorMessage(
      vscode.l10n.t('Host key of {0} has changed!', check.host),
      {
        modal: true,
        detail: vscode.l10n.t('Someone could be intercepting the connection, or the host key was replaced.\n\n{0}\nReceived: {1}\n\n{2}', known, check.fingerprint, remedy)
      }
    );
  }


  /** Command obi.ssh.forget-host-key */
  public static async forget(state: vscode.Memento): Promise<void> {
    const items = state.keys()
      .filter(key => key.startsWith(STATE_PREFIX))
      .map(key => ({ key, value: state.get<StoredHostKey>(key) }))
      .filter((entry): entry is { key: string; value: StoredHostKey } => entry.value !== undefined)
      .map(entry => ({
        label: entry.key.substring(STATE_PREFIX.length),
        description: `${entry.value.algorithm} ${entry.value.fingerprint}`,
        detail: vscode.l10n.t('Trusted since {0}', new Date(entry.value.first_seen).toLocaleString()),
        key: entry.key
      }));

    if (items.length === 0) {
      vscode.window.showInformationMessage(vscode.l10n.t('No SSH host keys are stored'));
      return;
    }

    const selected = await vscode.window.showQuickPick(items, { title: vscode.l10n.t('Forget stored SSH host key') });
    if (!selected)
      return;

    const forget = vscode.l10n.t('Forget');
    const answer = await vscode.window.showWarningMessage(
      vscode.l10n.t('Forget the host key of {0}?', selected.label),
      { modal: true, detail: vscode.l10n.t('The next connection asks again whether to trust the host.') },
      forget
    );
    if (answer !== forget)
      return;

    await state.update(selected.key, undefined);
    logger.info(`Forgot host key of ${selected.label}`);
  }
}
