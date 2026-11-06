import * as vscode from 'vscode';
import {NodeSSH, Config} from 'node-ssh';
import type { SFTPWrapper } from 'ssh2';
import { UserCancelledError, TransferError, TransferResult, HostKeyError, get_error_message } from '../../shared/Errors';
import { Workspace } from './Workspace';
import * as path from 'path';
import { AppConfig } from '../config/AppConfig';
import { Constants } from '../../shared/Constants';
import { logger } from './Logger';
import { sh_quote } from '../../shared/ShellQuote';
import { check_remote_delete_target } from './RemotePathGuard';
import { is_transfer_excluded } from './TransferExcludes';
import { local_source_root } from './SourcePath';
import { HostKeyCheck, HostKeyStore } from './HostKeyStore';
import { LineSplitter, parse_obi_pid } from './OutputLines';
import * as fs from 'fs';
import { OPEN_CONFIGURATION, show_error } from './Notify';
import { auth_methods, classify_login_error, compression_reporter, expand_local_path, ssh_agent, ssh_algorithms, ssh_compression, ssh_port } from './SshAuth';
import { DirTool } from './DirTool';
import * as os from 'os';
import { DownloadPlan, run_limited, ssh_concurrency } from '../obi/ResultDownload';



/** Options of SSH_Tasks.execute_streaming */
export interface StreamOptions {
  /** Every output line, as soon as it arrives */
  on_line?: (line: string, stream: 'stdout' | 'stderr') => void;
  token?: vscode.CancellationToken;
  /** The command prints OBI_PID:<pid> first (get_remote_obi_cmd); on cancel this process is stopped with SIGTERM */
  report_pid?: boolean;
}


interface FileTransfer {
  local: string,
  remote: string
}


/** Login data for one connection attempt (see build_connect_config) */
export interface ConnectOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  /** Already expanded (~, $HOME, %USERPROFILE%) */
  private_key_path?: string;
  passphrase?: string;
  /** SSH_AUTH_SOCK or 'pageant' */
  agent?: string;
  /** Offer zlib compression (ssh-compression) */
  compression?: boolean;
}




export class SSH_Tasks {

  private static ssh = new NodeSSH();
  public static context: vscode.ExtensionContext;

  private static ssh_user: string | undefined = undefined;
  private static host: string | undefined = undefined;
  private static port: number = Constants.SSH_PORT;
  /** Target and compression of the open connection */
  private static connected: { host: string; port: number; username: string; compression: boolean } | undefined = undefined;
  private static connectionPromise: Promise<boolean> | undefined = undefined;
  private static remote_home: string | undefined = undefined;


  public static async get_ssh_user(): Promise<string> {
    if (SSH_Tasks.ssh_user)
      return SSH_Tasks.ssh_user;

    const user = await vscode.window.showInputBox({ title: vscode.l10n.t('Enter your user for {0}', SSH_Tasks.host ?? ''), placeHolder: "usrprf", ignoreFocusOut: true });
    if (!user)
      throw new UserCancelledError('Cancelled by user: no user provided');
    SSH_Tasks.ssh_user = user;
    SSH_Tasks.offer_save_to_profile('ssh-user', user);
    return user;
  }


  /** A prompted host or user: offer to write it into the user config of the active profile (doesn't wait) */
  private static offer_save_to_profile(key: 'remote-host' | 'ssh-user', value: string): void {
    const save = vscode.l10n.t('Save to profile');
    vscode.window.showInformationMessage(vscode.l10n.t('Save \'{0}\' as {1} in your user configuration?', value, key), save).then(answer => {
      if (answer !== save)
        return;
      try {
        const file = path.join(Workspace.get_workspace(), AppConfig.get_current_profile_app_config_file());
        const user_config = DirTool.read_toml_strict<Record<string, Record<string, unknown>>>(file) ?? {};
        user_config.connection = { ...(user_config.connection ?? {}), [key]: value };
        DirTool.update_toml(file, user_config);
      }
      catch (e: unknown) {
        show_error(vscode.l10n.t('Saving the user configuration failed'), e);
      }
    });
  }




  /**
   * Wraps a command so it runs in bash on the IBM i.
   * All values interpolated into `cmd` must already be resolved (see get_finalized_remote_path) and quoted with sh_quote.
   */
  public static get_finalized_command(cmd: string): string {
    return `bash -c ${sh_quote(cmd)}`;
  }


  /**
   * Resolves a remote path locally: ${workspaceFolderBasename}, $USER and a leading ~ (home directory of the SSH user).
   * The result is meant to be quoted with sh_quote, so the remote shell doesn't expand anything.
   */
  public static async get_finalized_remote_path(path_string: string): Promise<string> {
    let result = path_string.replaceAll('${workspaceFolderBasename}', path.basename(Workspace.get_workspace() || 'workspace'));

    if (/\$USER\b/.test(result))
      result = result.replace(/\$USER\b/g, await SSH_Tasks.get_ssh_user());

    if (/^~(?=\/|$)/.test(result))
      result = result.replace(/^~(?=\/|$)/, await SSH_Tasks.get_remote_home());

    return result;
  }


  /** Forgets values cached for the current connection. */
  public static reset_connection_state(): void {
    SSH_Tasks.remote_home = undefined;
  }


  /** Closes the SSH connection (on deactivate) */
  public static disconnect(): void {
    if (SSH_Tasks.ssh.isConnected())
      SSH_Tasks.ssh.dispose();
    SSH_Tasks.reset_connection_state();
  }


  /** Home directory of the SSH user on the IBM i ($HOME, from the user profile's HOMEDIR). Cached per connection. */
  public static async get_remote_home(): Promise<string> {
    if (SSH_Tasks.remote_home)
      return SSH_Tasks.remote_home;

    await SSH_Tasks.connect();
    const result = await SSH_Tasks.ssh.execCommand('printf %s "$HOME"');
    const home = result.code === 0 ? result.stdout.trim() : '';
    SSH_Tasks.remote_home = home.startsWith('/') ? home : `/home/${await SSH_Tasks.get_ssh_user()}`;
    logger.debug(`Remote home directory: ${SSH_Tasks.remote_home}`);

    return SSH_Tasks.remote_home;
  }


  /** Resolved `general.remote-base-dir` (may be relative to the SSH login directory). */
  public static async get_remote_base_dir(): Promise<string> {
    const remote_base_dir = AppConfig.get_app_config().general['remote-base-dir'];
    if (!remote_base_dir)
      throw new Error(vscode.l10n.t('Config attribute \'{0}\' is missing', 'general.remote-base-dir'));
    return SSH_Tasks.get_finalized_remote_path(remote_base_dir);
  }


  /** Resolved `general.remote-obi-dir`. */
  public static async get_remote_obi_dir(): Promise<string> {
    const remote_obi_dir = AppConfig.get_app_config().general['remote-obi-dir'];
    if (!remote_obi_dir)
      throw new Error(vscode.l10n.t('Config attribute \'{0}\' is missing', 'general.remote-obi-dir'));
    return SSH_Tasks.get_finalized_remote_path(remote_obi_dir);
  }



  /**
   * Options for NodeSSH.connect (separate function, so they can be tested). Methods are tried in the order agent, key, password.
   * `host_verifier` gets the raw host key and returns whether it is trusted.
   */
  public static build_connect_config(options: ConnectOptions, host_verifier: (key: Buffer) => boolean): Config {
    const algorithms = ssh_algorithms(options.compression === true);
    return {
      ...(algorithms ? { algorithms } : {}),
      // Logs the compression the server agreed to; ssh2's other debug output is dropped
      debug: compression_reporter(summary => logger.info(`SSH compression: ${summary}`)),
      host: options.host,
      port: options.port,
      username: options.username,
      password: options.password,
      privateKeyPath: options.private_key_path,
      passphrase: options.passphrase,
      agent: options.agent,
      authHandler: auth_methods({ agent: options.agent, private_key: !!options.private_key_path, password: options.password !== undefined }),
      hostVerifier: host_verifier,
      keepaliveInterval: Constants.SSH_KEEPALIVE_INTERVAL_MS,   // milliseconds
      keepaliveCountMax: Constants.SSH_KEEPALIVE_COUNT_MAX,
      readyTimeout: Constants.SSH_READY_TIMEOUT_MS
    };
  }



  /**
   * Connects and verifies the host key. An unknown key is rejected in the handshake and the user is asked
   * afterwards, so the dialog can't run into the handshake timeout; after trusting, it connects again.
   */
  private static async connect_verified(options: ConnectOptions): Promise<void> {

    const state = SSH_Tasks.context.globalState;
    const checks: HostKeyCheck[] = [];
    const host = options.host;
    const config = SSH_Tasks.build_connect_config(options, (key: Buffer) => {
      const check = HostKeyStore.check(state, host, options.port, key);
      checks.push(check);
      return check.decision === 'trusted';
    });

    for (let attempt = 1; ; attempt++) {
      checks.length = 0;
      try {
        await SSH_Tasks.ssh.connect(config);
        SSH_Tasks.connected = { host: options.host, port: options.port, username: options.username, compression: options.compression === true };
        return;
      }
      catch (e: unknown) {
        const check = checks.pop();
        if (check?.decision === 'mismatch') {
          await HostKeyStore.show_mismatch(check);
          throw new HostKeyError(host);
        }
        if (check?.decision === 'unknown' && attempt === 1) {
          await HostKeyStore.confirm_and_store(state, check);   // UserCancelledError if not trusted
          continue;
        }
        throw e;
      }
    }
  }



  private static is_connection_valid(): boolean {
    const config = AppConfig.get_app_config();
    const connected = SSH_Tasks.connected;
    return this.ssh.isConnected() && connected?.username === config.connection['ssh-user'] && connected?.host === config.connection['remote-host']
      && connected?.port === ssh_port(config.connection['ssh-port'])
      && connected?.compression === ssh_compression(config.connection['ssh-compression']);
  }



  public static async connect(callback?: Function) {

    const config = AppConfig.get_app_config();;

    if (this.is_connection_valid()) {
      if (callback) return await callback();
      return;
    }

    // If a connection is ALREADY in progress, wait for that one
    if (this.connectionPromise) {
      logger.info("Connection already in progress, awaiting existing attempt...");
      await this.connectionPromise;
      if (callback) return await callback();
      return;
    }

    // No connection in progress? Create a new one and store the promise
    this.connectionPromise = (async () => {
      try {
        const config = AppConfig.get_app_config();
        SSH_Tasks.host = config.connection['remote-host'];
        SSH_Tasks.ssh_user = config.connection['ssh-user'];
        SSH_Tasks.port = ssh_port(config.connection['ssh-port']);
        const ssh_key = config.connection['ssh-key'] ? expand_local_path(config.connection['ssh-key'], process.env, os.homedir()) : undefined;
        const agent = ssh_agent(config.connection['ssh-agent'], process.platform, process.env);
        if (config.connection['ssh-agent'] && !agent)
          logger.warn('ssh-agent = true, but no agent is running (SSH_AUTH_SOCK is not set)');
        const compression = ssh_compression(config.connection['ssh-compression']);

        if (!SSH_Tasks.host || SSH_Tasks.host.length == 0) {
          SSH_Tasks.host = await vscode.window.showInputBox({ title: vscode.l10n.t('Enter an IBM i hostname/IP'), placeHolder: "my-ibm-i", ignoreFocusOut: true });
          if (! SSH_Tasks.host)
            throw new UserCancelledError('Cancelled by user: no host provided');
          SSH_Tasks.offer_save_to_profile('remote-host', SSH_Tasks.host);
        }

        await SSH_Tasks.get_ssh_user();
        const current_profile = Workspace.get_current_profile() || 'default';
        const secret_key = `obi|${current_profile}|${SSH_Tasks.host}|${SSH_Tasks.ssh_user}`;

        let pwd: string | undefined = await SSH_Tasks.context.secrets.get(secret_key);
        let password_prompted = false;
        if (! pwd && !ssh_key && !agent) {
          pwd = await vscode.window.showInputBox({ title: vscode.l10n.t('Enter your password for {0}', `${SSH_Tasks.ssh_user}@${SSH_Tasks.host}`), placeHolder: vscode.l10n.t('password'), password: true, ignoreFocusOut: true });
          if (! pwd)
            throw new UserCancelledError('Cancelled by user: no password provided');
          password_prompted = true;
        }
        let passphrase: string | undefined = ssh_key ? await SSH_Tasks.context.secrets.get(`${secret_key}|passphrase`) : undefined;
        let passphrase_prompted = false;

        if (this.is_connection_valid())
          return;

        // An encrypted key needs its passphrase: ask (again, if the stored one is wrong)
        for (let attempt = 1; ; attempt++) {
          try {
            await SSH_Tasks.connect_verified({ host: SSH_Tasks.host, port: SSH_Tasks.port, username: SSH_Tasks.ssh_user ?? '', password: pwd, private_key_path: ssh_key, passphrase, agent, compression });
            break;
          }
          catch (e: unknown) {
            const kind = classify_login_error(e).kind;
            if (!ssh_key || attempt > 3 || (kind !== 'passphrase-missing' && kind !== 'passphrase-wrong'))
              throw e;
            if (kind === 'passphrase-wrong' && !passphrase_prompted)
              await SSH_Tasks.context.secrets.delete(`${secret_key}|passphrase`);
            passphrase = await vscode.window.showInputBox({
              title: kind === 'passphrase-wrong' ? vscode.l10n.t('Wrong passphrase for {0}. Enter it again', ssh_key) : vscode.l10n.t('Enter the passphrase of the SSH key {0}', ssh_key),
              password: true, ignoreFocusOut: true });
            if (!passphrase)
              throw new UserCancelledError('Cancelled by user: no passphrase provided');
            passphrase_prompted = true;
          }
        }
        SSH_Tasks.reset_connection_state();   // new connection, maybe another user

        if (password_prompted && pwd)
          SSH_Tasks.offer_save_secret(secret_key, pwd, 'password', current_profile);
        if (passphrase_prompted && passphrase)
          SSH_Tasks.offer_save_secret(`${secret_key}|passphrase`, passphrase, 'passphrase', current_profile);
        vscode.window.showInformationMessage(vscode.l10n.t('Connected to {0}', SSH_Tasks.host));
        logger.info(`Connected to ${SSH_Tasks.host} (compression ${compression ? 'offered' : 'off'})`);

        if (callback) {
          const result = await callback();
          return result;
        }
      } catch (reason: unknown) {
        // A changed host key was already shown as a modal warning. Shown once: callers that show the same error skip it.
        if (!(reason instanceof HostKeyError))
          SSH_Tasks.show_connect_error(reason);
        throw reason; // Bubble up
      } finally {
        // IMPORTANT: Clear the gatekeeper when done (success or fail)
        this.connectionPromise = undefined;
      }
    })();

    await this.connectionPromise;

    if (callback) {
      return await callback();
    }
  }



  /** Clear messages for the common login errors */
  private static show_connect_error(reason: unknown): void {
    const target = `${SSH_Tasks.ssh_user ?? ''}@${SSH_Tasks.host ?? ''}`;
    const error = classify_login_error(reason);
    if (error.kind === 'authentication')
      show_error(vscode.l10n.t('Login to {0} failed (check user, password or key)', target), reason, [OPEN_CONFIGURATION]);
    else if (error.kind === 'unreachable')
      show_error(vscode.l10n.t('Can\'t reach {0}:{1}', SSH_Tasks.host ?? '', SSH_Tasks.port), reason, [OPEN_CONFIGURATION]);
    else
      show_error(vscode.l10n.t('Connection to {0} failed', SSH_Tasks.host ?? ''), reason);
  }


  /** After a login with a prompted password or passphrase: offer to keep it in the OS keychain (doesn't wait) */
  private static offer_save_secret(secret_key: string, value: string, kind: 'password' | 'passphrase', profile: string): void {
    const never_key = `obi.ssh.never-save-${kind}|${profile}`;
    if (SSH_Tasks.context.workspaceState.get<boolean>(never_key))
      return;

    const save = vscode.l10n.t('Save');
    const not_now = vscode.l10n.t('Not now');
    const never = vscode.l10n.t('Never for this profile');
    const question = kind === 'password'
      ? vscode.l10n.t('Save the password for profile {0} in the OS keychain?', profile)
      : vscode.l10n.t('Save the passphrase of the SSH key for profile {0} in the OS keychain?', profile);
    vscode.window.showInformationMessage(question, save, not_now, never).then(async answer => {
      if (answer === save)
        await SSH_Tasks.context.secrets.store(secret_key, value);
      else if (answer === never)
        await SSH_Tasks.context.workspaceState.update(never_key, true);
    });
  }



  public static async executeCommand(cmd: string, again?: boolean) {

    await this.connect();
    cmd = this.get_finalized_command(cmd);

    logger.debug(`Execute: ${cmd}`);
    const result = await SSH_Tasks.ssh.execCommand(cmd);
    
    logger.info(`CODE: ${result.code}`);
    logger.debug(`STDOUT: ${result.stdout}`);
    if (result.stderr.length > 0)
      logger.warn(`STDERR: ${result.stderr}`);

    if (result.code != 0)
      throw Error(result.stderr);

  }



  /**
   * Runs a remote command and passes its output on line by line. Cancelling the token stops the remote process
   * (with report_pid) and closes the channel; the call then rejects with UserCancelledError.
   */
  public static async execute_streaming(cmd: string, options: StreamOptions = {}): Promise<void> {

    if (options.token?.isCancellationRequested)
      throw new UserCancelledError('Cancelled by user');

    await this.connect();
    const finalized = this.get_finalized_command(cmd);
    logger.debug(`Execute: ${finalized}`);

    const encoding = AppConfig.get_app_config().general['console-output-encoding'] || 'utf-8';
    const decoder = (): TextDecoder => {
      try { return new TextDecoder(encoding); }
      catch { return new TextDecoder('utf-8'); }   // unknown encoding name
    };
    const streams = {
      stdout: { decoder: decoder(), lines: new LineSplitter() },
      stderr: { decoder: decoder(), lines: new LineSplitter() },
    };

    let pid: number | undefined;
    let cancelled = false;
    let channel: { close(): void } | undefined;

    const stop = async (): Promise<void> => {
      if (pid !== undefined) {
        const kill = await SSH_Tasks.ssh.execCommand(`kill -TERM ${pid}`);
        logger.info(`Stopped remote process ${pid} (code ${kill.code})`);
      }
      channel?.close();
    };

    const emit = (line: string, stream: 'stdout' | 'stderr'): void => {
      if (options.report_pid && pid === undefined && stream === 'stdout') {
        const reported = parse_obi_pid(line);
        if (reported !== undefined) {
          pid = reported;
          if (cancelled)
            stop().catch(e => logger.warn(`Stopping the remote process failed: ${get_error_message(e)}`));
          return;
        }
      }
      logger.debug(`${stream}: ${line}`);
      options.on_line?.(line, stream);
    };

    const receive = (stream: 'stdout' | 'stderr', chunk: Buffer, final: boolean = false): void => {
      const { decoder, lines } = streams[stream];
      const text = decoder.decode(chunk, { stream: !final });
      lines.push(text).forEach(line => emit(line, stream));
      if (final)
        lines.flush().forEach(line => emit(line, stream));
    };

    const subscription = options.token?.onCancellationRequested(() => {
      cancelled = true;
      stop().catch(e => logger.warn(`Stopping the remote process failed: ${get_error_message(e)}`));
    });

    try {
      const result = await SSH_Tasks.ssh.execCommand(finalized, {
        onStdout: chunk => receive('stdout', chunk),
        onStderr: chunk => receive('stderr', chunk),
        onChannel: client_channel => { channel = client_channel; },
      });
      receive('stdout', Buffer.alloc(0), true);
      receive('stderr', Buffer.alloc(0), true);

      logger.info(`CODE: ${result.code}`);
      if (cancelled)
        throw new UserCancelledError('Cancelled by user');
      if (result.code != 0)
        throw new Error(result.stderr || `Remote command ended with exit code ${result.code}`);
    }
    finally {
      subscription?.dispose();
    }
  }



  public static async getRemoteFile(local: string, remote: string, again?: boolean): Promise<void> {

    await this.connect();

    remote = await SSH_Tasks.get_finalized_remote_path(remote);
    logger.info(`Get remote file. LOCAL: ${local}, REMOTE: ${remote}`);
    await SSH_Tasks.ssh.getFile(local, remote);
  }



  /** ssh-concurrency of the configuration: parallel SFTP transfers (1–32) */
  private static concurrency(): number {
    return ssh_concurrency(AppConfig.get_app_config().connection['ssh-concurrency']);
  }



  /**
   * Downloads a remote directory (`recursive: false`: only its files). Failed files are returned (and logged), not thrown.
   * `sftp`: an open SFTP channel to use instead of a new one.
   */
  public static async getRemoteDir(local: string, remote: string, options: { recursive?: boolean; sftp?: SFTPWrapper } = {}): Promise<TransferResult> {

    await this.connect();

    const failed: TransferResult['failed'] = [];
    let transferred = 0;

    remote = await SSH_Tasks.get_finalized_remote_path(remote);
    // getDirectory fails if the local folder doesn't exist (e.g. the output folder of a source built for the first time)
    fs.mkdirSync(local, { recursive: true });

    const ok = await SSH_Tasks.ssh.getDirectory(local, remote,
      { recursive: options.recursive ?? true,
        sftp: options.sftp,
        concurrency: SSH_Tasks.concurrency(),
        validate: function(itemPath) {
          const baseName = path.basename(itemPath)
          return baseName !== '.git' && // Don't send git directory
                 baseName !== '.vscode' &&
                 baseName !== '.theia' &&
                 baseName !== '.project' &&
                 baseName !== '.gitignore'
        },
        tick: function(localPath, remotePath, error) { // Remember transfer status
          if (error) {
            failed.push({ path: remotePath, error: String(error) });
            logger.error(`Transfer error: ${error}; Local: ${localPath}, Remote: ${remotePath}`);
          } else {
            transferred++;
          }
        }
      });

    // getDirectory can report failure without a failed file (e.g. the directory itself)
    if (!ok && failed.length == 0)
      failed.push({ path: remote, error: 'Download failed' });

    if (failed.length > 0)
      logger.error(`Failed to download ${failed.length} file(s) from ${remote}`);
    logger.debug(`Downloaded ${transferred} file(s) from ${remote}`);
    return { transferred, failed };
  }



  /** The paths (relative to `base`) that exist on the IBM i; one command per 200 paths */
  public static async existing_remote_paths(base: string, paths: string[]): Promise<Set<string>> {

    const existing = new Set<string>();
    if (paths.length === 0)
      return existing;

    await this.connect();
    base = await SSH_Tasks.get_finalized_remote_path(base);

    for (let i = 0; i < paths.length; i += 200) {
      const chunk = paths.slice(i, i + 200);
      const wanted = new Set(chunk);
      const cmd = SSH_Tasks.get_finalized_command(
        `cd ${sh_quote(base)} || exit 1; for p in ${chunk.map(sh_quote).join(' ')}; do [ -e "$p" ] && printf '%s\\n' "$p"; done; true`);
      const result = await SSH_Tasks.ssh.execCommand(cmd);
      if (result.code !== 0)
        throw new Error(`Checking the build results on the IBM i failed: ${result.stderr}`);
      for (const line of result.stdout.split('\n')) {
        if (wanted.has(line.trim()))
          existing.add(line.trim());
      }
    }
    return existing;
  }



  /**
   * Downloads the results of a build (see result_download_plan) over one SFTP channel.
   * Failed files are returned (and logged), not thrown.
   */
  public static async download_build_results(plan: DownloadPlan): Promise<TransferResult[]> {

    await this.connect();

    const ws = Workspace.get_workspace();
    const remote_base = await SSH_Tasks.get_remote_base_dir();
    const local = (relative: string) => path.join(ws, ...relative.split('/'));
    const remote = (relative: string) => `${remote_base}/${relative}`;

    // Outputs and compile messages exist only for some sources: check all at once instead of failing per file
    const existing = await SSH_Tasks.existing_remote_paths(remote_base, [...plan.optional.dirs, ...plan.optional.files]);
    const optional_dirs = plan.optional.dirs.filter(dir => existing.has(dir));
    const optional_files = plan.optional.files.filter(file => existing.has(file));
    logger.info(`Download build results: ${plan.flat_dirs.length + plan.dirs.length + optional_dirs.length} folders, ${optional_files.length} compile message files`);

    const sftp = await SSH_Tasks.ssh.requestSFTP();
    try {
      const results = await Promise.all([
        ...plan.flat_dirs.map(dir => SSH_Tasks.getRemoteDir(local(dir), remote(dir), { recursive: false, sftp })),
        ...plan.dirs.map(dir => SSH_Tasks.getRemoteDir(local(dir), remote(dir), { sftp }))
      ]);
      results.push(...await run_limited(optional_dirs, SSH_Tasks.concurrency(), dir => SSH_Tasks.getRemoteDir(local(dir), remote(dir), { sftp })));

      const files: TransferResult = { transferred: 0, failed: [] };
      await run_limited(optional_files, SSH_Tasks.concurrency(), async file => {
        try {
          fs.mkdirSync(path.dirname(local(file)), { recursive: true });
          await SSH_Tasks.ssh.getFile(local(file), remote(file), sftp);
          files.transferred++;
        }
        catch (e: unknown) {
          files.failed.push({ path: remote(file), error: get_error_message(e) });
          logger.error(`Transfer error: ${get_error_message(e)}; Remote: ${remote(file)}`);
        }
      });
      results.push(files);
      return results;
    }
    finally {
      sftp.end();
    }
  }



  public static async check_remote_paths(files: string[], again?: boolean): Promise<boolean> {

    await this.connect();

    const checks: string[] = [];
    for (const file of files) {
      const file_final = await SSH_Tasks.get_finalized_remote_path(file);
      checks.push(`test -e ${sh_quote(file_final)}`);
    }

    const cmd = SSH_Tasks.get_finalized_command(checks.join(' && '));
    logger.info(`Check path: ${cmd}`);
    const result = await SSH_Tasks.ssh.execCommand(cmd);

    logger.info(`CODE: ${result.code}`);
    logger.debug(`STDOUT: ${result.stdout}`);
    if (result.stderr.length > 0)
      logger.warn(`STDERR: ${result.stderr}`);

    return result.code == 0;
  }






  /**
   * Deletes the remote project folder (before a transfer of the project).
   * The folder is resolved on the IBM i and checked by check_remote_delete_target before anything is deleted.
   */
  public static async cleanup_directory(): Promise<boolean> {

    await this.connect();

    const target: string = await SSH_Tasks.get_remote_base_dir();

    // Resolve the absolute, physical path on the IBM i (relative paths are relative to the login directory)
    const resolved = await SSH_Tasks.ssh.execCommand(SSH_Tasks.get_finalized_command(`cd -- ${sh_quote(target)} 2>/dev/null && pwd -P`));
    if (resolved.code != 0) {
      logger.info(`Remote folder '${target}' doesn't exist yet. Nothing to delete.`);
      return true;
    }
    const abs_path: string = resolved.stdout.trim();

    const reason = check_remote_delete_target(abs_path, await SSH_Tasks.get_remote_home());
    if (reason) {
      const message = vscode.l10n.t('The remote folder was not deleted: {0}. Please check \'remote-base-dir\' in the OBI configuration.', reason);
      logger.error(message);
      vscode.window.showErrorMessage(message);
      return false;
    }

    const marker = await SSH_Tasks.ssh.execCommand(SSH_Tasks.get_finalized_command(`test -f ${sh_quote(`${abs_path}/${Constants.OBI_APP_CONFIG_FILE}`)}`));
    if (marker.code != 0) {
      const delete_anyway = vscode.l10n.t('Delete anyway');
      const answer = await vscode.window.showWarningMessage(
        vscode.l10n.t('\'{0}\' on {1} does not contain an OBI project ({2}). Delete it anyway?', abs_path, SSH_Tasks.host ?? '', Constants.OBI_APP_CONFIG_FILE),
        { modal: true }, delete_anyway);
      if (answer !== delete_anyway)
        throw new UserCancelledError('Transfer cancelled by user');
    }

    const confirm = vscode.l10n.t('Delete and transfer');
    const answer = await vscode.window.showWarningMessage(
      vscode.l10n.t('Delete remote folder?'),
      { modal: true, detail: vscode.l10n.t('All files in \'{0}\' on {1} will be deleted and the project will be uploaded again.', abs_path, SSH_Tasks.host ?? '') },
      confirm);
    if (answer !== confirm)
      throw new UserCancelledError('Transfer cancelled by user');

    const cmd = SSH_Tasks.get_finalized_command(`rm -rf -- ${sh_quote(abs_path)}`);
    logger.debug(`Execute cmd: ${cmd}`);
    const result = await SSH_Tasks.ssh.execCommand(cmd);

    logger.info(`CODE: ${result.code}`);
    if (result.stderr.length > 0) {
      show_error(vscode.l10n.t('Deleting the remote folder failed'), result.stderr);
    }

    logger.info(`Finished cleanup: ${result.code == 0}`);
    return result.code == 0;
  }



  public static async transferSources(source_list: string[], again?: boolean) {

    await this.connect();
    
    const config = AppConfig.get_app_config();
    if (!config.general['remote-base-dir'] || !config.general['local-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' or 'config.general.local-base-dir' missing`);
    
    const source_dir: string = config.general['source-dir'] ?? 'src';
    const local_source_dir: string = local_source_root(Workspace.get_workspace(), config.general['local-base-dir'], source_dir);
    let remote_base_dir: string = await SSH_Tasks.get_finalized_remote_path(config.general['remote-base-dir']);
    let remote_source_dir: string = `${remote_base_dir}/${source_dir}`;
    
    // The user config (may contain secret* variables) is uploaded separately, readable only by the user
    let transfer_list: FileTransfer[] = [
      {
        local: path.join(Workspace.get_workspace(), Constants.OBI_APP_CONFIG_FILE),
        remote: `${remote_base_dir}/${Constants.OBI_APP_CONFIG_FILE}`,
      },
      {
        local: path.join(Workspace.get_workspace(), '.obi', 'etc', 'constants.py'),
        remote: `${remote_base_dir}/.obi/etc/constants.py`,
      },
      {
        local: path.join(Workspace.get_workspace(), '.obi', 'etc', 'logger_config.py'),
        remote: `${remote_base_dir}/.obi/etc/logger_config.py`,
      }
    ];

    source_list.map((source: string) => {

      transfer_list.push({
        local: path.join(local_source_dir, source),
        remote: `${remote_source_dir}/${source}`,
      })
    });

    logger.info(`Transfer files: ${source_list}`);

    await SSH_Tasks.ssh.putFiles(transfer_list, {concurrency: SSH_Tasks.concurrency() });
    await SSH_Tasks.upload_user_config();

    vscode.window.showInformationMessage(source_list.length === 1 ? vscode.l10n.t('1 source transferred') : vscode.l10n.t('{0} sources transferred', source_list.length));
  }



  /**
   * Uploads the active profile's user config as .obi/etc/.user-app-config.toml with mode 600.
   * It may contain secret* variables; other users on the IBM i must not read it.
   */
  public static async upload_user_config(): Promise<void> {

    await this.connect();

    const local = path.join(Workspace.get_workspace(), AppConfig.get_current_profile_app_config_file());
    if (!fs.existsSync(local))
      return;

    const remote = `${await SSH_Tasks.get_remote_base_dir()}/${Constants.OBI_APP_CONFIG_USER_FILE}`;
    await SSH_Tasks.ssh.putFile(local, remote, undefined, { mode: 0o600 });

    // An existing file keeps its mode on some servers: set it explicitly
    const result = await SSH_Tasks.ssh.execCommand(SSH_Tasks.get_finalized_command(`chmod 600 -- ${sh_quote(remote)}`));
    if (result.code != 0)
      logger.warn(`chmod 600 of ${remote} failed: ${result.stderr}`);
  }




  public static async transfer_files(file_list: string[], again?: boolean) {

    await this.connect();
    
    const config = AppConfig.get_app_config();
    if (!config.general['remote-base-dir'] || !config.general['local-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' missing`);
    const local_base_dir: string = path.join(Workspace.get_workspace(), config.general['local-base-dir']);
    let remote_base_dir: string = await SSH_Tasks.get_finalized_remote_path(config.general['remote-base-dir']);

    logger.info(`Transfer: ${file_list}`);

    let transfer_list: FileTransfer[] = [];

    file_list.map((file: string) => {
      transfer_list.push({
        local: path.join(local_base_dir, file),
        remote: `${remote_base_dir}/${file}`,
      })
    });

    await SSH_Tasks.ssh.putFiles(transfer_list, {concurrency: SSH_Tasks.concurrency() });
  }



  /** Uploads files of the project folder (paths relative to the workspace) to the same place in the remote project folder */
  public static async upload_project_files(files: string[]): Promise<void> {

    await this.connect();

    const remote_base = await SSH_Tasks.get_remote_base_dir();
    const transfer_list: FileTransfer[] = files.map(file => ({
      local: path.join(Workspace.get_workspace(), file),
      remote: `${remote_base}/${file.replace(/\\/g, '/')}`
    }));
    logger.info(`Upload: ${files.join(', ')}`);
    await SSH_Tasks.ssh.putFiles(transfer_list, { concurrency: SSH_Tasks.concurrency() });
  }



  /** Writes `content` to a file of the remote project folder (path relative to remote-base-dir); creates missing folders */
  public static async upload_content(relative: string, content: string): Promise<void> {

    await this.connect();

    const remote = `${await SSH_Tasks.get_remote_base_dir()}/${relative.replace(/\\/g, '/')}`;
    logger.info(`Upload: ${remote}`);
    const write = (sftp: SFTPWrapper) => new Promise<void>((resolve, reject) =>
      sftp.writeFile(remote, content, error => error ? reject(error) : resolve()));

    const sftp = await SSH_Tasks.ssh.requestSFTP();
    try {
      try {
        await write(sftp);
      }
      catch (e: unknown) {
        if (get_error_message(e) !== 'No such file')
          throw e;
        await SSH_Tasks.ssh.mkdir(path.posix.dirname(remote), 'sftp', sftp);
        await write(sftp);
      }
    }
    finally {
      sftp.end();
    }
  }




  public static async transfer_dir(local_dir: string, remote_dir: string, again?: boolean) {

    // With Compression!!!!
    // https://stackoverflow.com/questions/15641243/need-to-zip-an-entire-directory-using-node-js

    await this.connect();

    remote_dir = await SSH_Tasks.get_finalized_remote_path(remote_dir);

    let final_message: string = "";

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Transfer project'),
    }, 
    async progress => {
      progress.report({
        message: vscode.l10n.t('Start transfer')
      });

      var startTime = performance.now();

      //##############################
      // SSH transfer folder
      //##############################
      const result = await SSH_Tasks.ssh_put_dir(local_dir, remote_dir);
      if (result.failed.length > 0) {
        throw new TransferError(result, remote_dir);
      }

      var endTime = performance.now();

      final_message = vscode.l10n.t('Transfer finished in {0} seconds', ((endTime - startTime)/1000).toFixed(2));
    });

    vscode.window.showInformationMessage(final_message);
    logger.info(final_message);

  }
  

  private static async ssh_put_dir(local_dir: string, remote_dir: string): Promise<TransferResult> {

    await this.connect();

    remote_dir = await SSH_Tasks.get_finalized_remote_path(remote_dir);

    logger.debug(`Send directory. Local: ${local_dir}, remote: ${remote_dir}`);

    const failed: TransferResult['failed'] = [];
    let transferred = 0;

    const ok: boolean = await SSH_Tasks.ssh.putDirectory(local_dir, remote_dir, {
      recursive: true,
      concurrency: SSH_Tasks.concurrency(),
      // Personal and generated files are never uploaded (see TransferExcludes.ts)
      validate: (itemPath: string) => !is_transfer_excluded(Workspace.get_workspace(), local_dir, itemPath),
      tick: function(localPath, remotePath, error) { // Remember transfer status
        if (error) {
          failed.push({ path: localPath, error: String(error) });
          logger.error(`Transfer error: ${error}; Local: ${localPath}, Remote: ${remotePath}`);
        } else {
          transferred++;
        }
      }
      });

    if (!ok && failed.length == 0)
      failed.push({ path: local_dir, error: 'Upload failed' });

    logger.debug(`Uploaded ${transferred} file(s) to ${remote_dir}`);
    return { transferred, failed };
  }

}