import * as vscode from 'vscode';
import { DirTool } from './DirTool';
import * as path from 'path';
import { getUri } from './getUri';
import { getNonce } from './getNonce';
import { Constants } from '../../shared/Constants';

import { AppConfig } from '../config/AppConfig';
import { SSH_Tasks } from './SSH_Tasks';
import * as source from '../../shared/Source';
import { Workspace } from './Workspace';
import * as fs from 'fs';
import { logger } from './Logger';
import { OBICommands } from '../../extension/obi/OBICommands';
import { template_text } from './TemplateTexts';
import { OperationLock } from './OperationLock';
import { createBuildList } from '../../extension/obi/compile_list/createBuildList';
import { compare_hashes, compute_source_hashes } from '../../extension/obi/compile_list/modules/source_hashes';
import { Dependencies, DependencyList } from '../obi/Dependency';
import { GitInfo } from './GitInfo';
import { is_home_like_remote_base_dir } from './RemotePathGuard';
import { migrate_project, replace_with_shipped } from '../obi/ProjectMigration';
import { write_initial_gitignore } from '../obi/GitignoreCheck';
import { UserCancelledError, get_error_message } from '../../shared/Errors';
import { show_error } from './Notify';
import { ProjectState } from '../ProjectState';



export class OBITools {

  public static ext_context?: vscode.ExtensionContext;


  private static _dependency_list: { ['source']: string[] }|undefined = undefined;
  private static _last_loading_time: number = 0;

  /** Set by the cancel button of the OBI Build view; checked between files while hashing */
  private static hashing_cancelled: boolean = false;




  public static cancel_source_hashing(): void {
    OBITools.hashing_cancelled = true;
  }



  /**
   * Self check of the extension
   */
  /** Checks local-obi-dir and shows what is wrong; returns the message ('' if everything is fine) */
  public static check_local_obi(): string {

    const config = AppConfig.get_app_config();
    let error_messages: string = '';

    if (config.general['local-obi-dir'] && !DirTool.dir_exists(config.general['local-obi-dir']))
      error_messages = vscode.l10n.t('Config error: local OBI location \'{0}\' does not exist', config.general['local-obi-dir']);

    if (config.general['local-obi-dir'] && DirTool.dir_exists(config.general['local-obi-dir']) && !OBITools.get_local_obi_python_path())
      error_messages = vscode.l10n.t('Local OBI error: the virtual environment is missing in \'{0}\'. Have you run the setup script?', config.general['local-obi-dir']);

    if (error_messages.length > 0)
      vscode.window.showErrorMessage(error_messages);

    return error_messages;
  }



  public static self_check() {
    if (!vscode.workspace.workspaceFolders || !OBITools.ext_context) {
      vscode.window.showErrorMessage(vscode.l10n.t('No workspace is opened!'));
      return;
    }

    const ws = Workspace.get_workspace();
    const ext_ws = path.join(OBITools.ext_context.asAbsolutePath('.'), 'obi-media');
    const config: AppConfig = AppConfig.get_app_config();

    if (config.general['local-base-dir'] == '/')
      throw Error("Root for 'local-base-dir' is not allowed!");

    if (config.general['remote-base-dir'] == '/')
      throw Error("Root for 'remote-base-dir' is not allowed!");

    if (config.general['remote-base-dir'] && is_home_like_remote_base_dir(config.general['remote-base-dir']))
      throw Error(`'remote-base-dir' must not be the home directory of the SSH user ('${config.general['remote-base-dir']}'). Use a sub folder, e.g. '~/${path.basename(ws)}'.`);

    if (config.general['local-obi-dir'] == '/')
      throw Error("Root for 'local-obi-dir' is not allowed!");

    if (config.general['remote-obi-dir'] == '/')
      throw Error("Root for 'remote-obi-dir' is not allowed!");


    if (!DirTool.dir_exists(path.join(ws, '.obi', 'log'))) {
      fs.mkdirSync(path.join(ws, '.obi', 'log'), { recursive: true });
    }
    if (!DirTool.dir_exists(path.join(ws, Constants.SOURCE_FILTER_FOLDER_NAME))) {
      fs.mkdirSync(path.join(ws, Constants.SOURCE_FILTER_FOLDER_NAME), { recursive: true });
    }
    if (!DirTool.dir_exists(path.join(ws, '.obi', 'tmp'))) {
      fs.mkdirSync(path.join(ws, '.obi', 'tmp'), { recursive: true });
    }
    // All three files are JSON objects (source → …)
    if (!DirTool.file_exists(path.join(ws, config.general['source-infos'] || 'source-infos.json'))) {
      DirTool.write_file(path.join(ws, config.general['source-infos'] || 'source-infos.json'), '{}');
    }
    if (!DirTool.file_exists(path.join(ws, config.general['dependency-list'] || 'dependency.json'))) {
      DirTool.write_file(path.join(ws, config.general['dependency-list'] || 'dependency.json'), '{}');
    }
    if (!DirTool.file_exists(path.join(ws, config.general['compiled-object-list'] || 'object-build.json'))) {
      DirTool.write_file(path.join(ws, config.general['compiled-object-list'] || 'object-build.json'), '{}');
    }

    if (!DirTool.dir_exists(path.join(ws, Constants.SOURCE_FILTER_FOLDER_NAME))) {
      fs.mkdirSync(path.join(ws, Constants.SOURCE_FILTER_FOLDER_NAME), { recursive: true });
      fs.copyFileSync(path.join(ext_ws, Constants.SOURCE_FILTER_FOLDER_NAME, 'All sources.json'), path.join(ws, Constants.SOURCE_FILTER_FOLDER_NAME, 'All sources.json'));
    }

    if (!DirTool.file_exists(path.join(ws, '.obi', 'etc', 'logger_config.py'))) {
      fs.copyFileSync(path.join(ext_ws, '.obi', 'etc', 'logger_config.py'), path.join(ws, '.obi', 'etc', 'logger_config.py'));
    }

    if (!DirTool.file_exists(path.join(ws, '.obi', 'etc', 'constants.py'))) {
      fs.copyFileSync(path.join(ext_ws, '.obi', 'etc', 'constants.py'), path.join(ws, '.obi', 'etc', 'constants.py'));
    }

    OBITools.check_local_obi();

    DependencyList.get_dependencies().then(dependency_list => {;
      if (!dependency_list || Object.keys(dependency_list).length === 0) {
        vscode.window.showWarningMessage(vscode.l10n.t('Missing source dependencies'));
      }
    });


  }



  /**
   * Brings the project files to the current schema (once per project, the version is stored in the project).
   * Missing settings are added, nothing is overwritten; differing OBI Python config files are only replaced on request.
   */
  public static migrate_project_files(context: vscode.ExtensionContext): void {

    const ws = Workspace.get_workspace();
    const media_dir = path.join(context.extensionPath, 'obi-media');
    const result = migrate_project(ws, media_dir);

    if (result.from_version == result.to_version)
      return;

    logger.info(`Project migrated from schema ${result.from_version} to ${result.to_version}: ${result.changed_files.join(', ')}`);
    AppConfig.reset();

    if (result.changed_files.length > 0)
      vscode.window.showInformationMessage(vscode.l10n.t('OBI updated project files to schema version {0}: {1}. Please review and commit them.', result.to_version, result.changed_files.join(', ')));

    for (const file of result.differing_files) {
      const replace = vscode.l10n.t('Replace (keep backup)');
      vscode.window.showInformationMessage(
        vscode.l10n.t('{0} differs from the version shipped with this OBI extension. Replace it with the shipped version?', file),
        replace, vscode.l10n.t('Keep')).then(choice => {
          if (choice !== replace)
            return;
          const backup = replace_with_shipped(ws, media_dir, file);
          vscode.window.showInformationMessage(vscode.l10n.t('{0} replaced. Backup: {1}', file, backup));
        });
    }
  }



  public static without_local_obi(): boolean {
    return OBITools.get_local_obi_python_path() == undefined;
  }



  public static get_local_obi_python_path(): string | undefined {

    const config = AppConfig.get_app_config();

    if (!config.general['local-obi-dir'])
      return undefined;

    let venv_bin = path.join('venv', 'bin', 'python');
    if (process.platform == 'win32')
      venv_bin = path.join('venv', 'Scripts', 'python.exe');

    const local_obi_python: string = path.join(config.general['local-obi-dir'], venv_bin);

    logger.info(`Check OBI path ${local_obi_python}: ${DirTool.file_exists(local_obi_python)}`);
    if (!DirTool.file_exists(local_obi_python))
      return undefined;

    return local_obi_python;
  }




  public static async get_remote_obi_python_path(): Promise<string | undefined> {

    const config = AppConfig.get_app_config();

    if (!config.general['remote-obi-dir'])
      return undefined;

    return `${await SSH_Tasks.get_remote_obi_dir()}/${Constants.REMOTE_OBI_PYTHON_PATH}`;
  }




  public static async check_remote(): Promise<boolean> {

    if (! await OBITools.check_remote_basics()) {
      vscode.window.showWarningMessage(vscode.l10n.t('Missing OBI project on remote system.'));
      // Without a successful transfer the build can't run on the IBM i
      return await OBITools.do_transfer_project_folder(false);
    }

    return true;
  }




  public static async check_remote_pase(): Promise<boolean> {

    let check: boolean;

    check = await OBITools.check_remote_home_dir();
    if (!check)
      return false;

    const bashrc = `${await SSH_Tasks.get_remote_home()}/.bashrc`;
    check = await SSH_Tasks.check_remote_paths([bashrc]);
    if (check)
      return true;

    const create = vscode.l10n.t('Create');
    const answer = await vscode.window.showWarningMessage(vscode.l10n.t('Missing {0}. Create it with the PATH to the open source packages (/QOpenSys/pkgs/bin)?', bashrc), { modal: true }, create);
    if (answer === create) {
      try {
        await SSH_Tasks.executeCommand(`echo 'export PATH="/QOpenSys/pkgs/bin:$PATH"' >> "$HOME/.bashrc"`);
      }
      catch (e: unknown) {
        show_error(vscode.l10n.t('Creating {0} failed', bashrc), e);
        return false;
      }
      vscode.window.showInformationMessage(vscode.l10n.t('{0} created.', bashrc));
      return true;
    }

    return false;

  }




  public static async check_remote_home_dir(): Promise<boolean> {

    let check: boolean;

    const home = await SSH_Tasks.get_remote_home();
    check = await SSH_Tasks.check_remote_paths([home]);
    if (check)
      return true;

    const create = vscode.l10n.t('Create');
    const answer = await vscode.window.showWarningMessage(vscode.l10n.t('Missing home directory {0}. Create it?', home), { modal: true }, create);
    if (answer === create) {
      try {
        await SSH_Tasks.executeCommand(`mkdir -p "$HOME/.ssh" && chmod 755 "$HOME" && chmod 700 "$HOME/.ssh" && echo 'export PATH="/QOpenSys/pkgs/bin:$PATH"' >> "$HOME/.bashrc"`);
      }
      catch (e: unknown) {
        if (!get_error_message(e).includes('No such file or directory')) {
          show_error(vscode.l10n.t('Creating the home directory failed'), e);
          return false;
        }
        logger.warn(get_error_message(e));
      }
      vscode.window.showInformationMessage(vscode.l10n.t('Home directory created.'));
      return true;
    }

    return false;
  }



  public static async check_remote_basics(): Promise<boolean> {

    const config = AppConfig.get_app_config();
    const remote_base_dir: string | undefined = config.general['remote-base-dir'];
    const remote_obi_dir: string | undefined = config.general['remote-obi-dir'];
    const remote_obi_python: string = `${config.general['remote-obi-dir']}/${Constants.REMOTE_OBI_PYTHON_PATH}`;

    let check: boolean;

    if (!remote_base_dir || !remote_obi_dir)
      throw Error(`Missing 'remote_base_dir' or 'remote_obi_dir'`);

    if (!config.general['source-dir'])
      return false;

    check = await SSH_Tasks.check_remote_paths([
      `${remote_base_dir}/${config.general['source-dir']}`,
      `${remote_base_dir}/${Constants.OBI_APP_CONFIG_FILE}`,
      remote_obi_python
    ]);
    if (!check)
      return false;

    return true;

  }



  public static contains_obi_project(): boolean {

    return Workspace.get_obi_folders().length > 0;
  }



  public static async initialize_folder(): Promise<void> {

    if (!vscode.workspace.workspaceFolders || !OBITools.ext_context) {
      vscode.window.showErrorMessage(vscode.l10n.t('No workspace is opened!'));
      return;
    }

    const ws = Workspace.get_workspace();
    const template_ws = path.join(OBITools.ext_context.asAbsolutePath('.'), 'obi-media');

    let copies: Promise<void>[] = [];

    const tmpDirs = await fs.promises.readdir(template_ws, { withFileTypes: true });
    for (const dirent of tmpDirs) {
      const srcDir = path.join(template_ws, dirent.name);
      const destDir = path.join(ws, dirent.name);
      copies.push(fs.promises.cp(srcDir, destDir, {
        recursive: true,
        force: false,         // don't overwrite existing files
        errorOnExist: false,  // don't throw if file exists
      }));
    }

    Promise.all(copies).then(async () => {
      write_initial_gitignore(ws);
      vscode.window.showInformationMessage(vscode.l10n.t('{0} files copied', copies.length));
      // The OBI views and commands appear without reloading the window
      await ProjectState.update();
    })
      .catch((reason: unknown) => {
        show_error(vscode.l10n.t('Copying the project template failed'), reason);
      });

  }



  public static get_global_stuff(webview: vscode.Webview, extensionUri: vscode.Uri) {

    let result: any = {};
    const styleUri = getUri(webview, extensionUri, ["asserts/css", "style.css"]);

    const asserts_uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'asserts'));
    // Front-end libraries, copied from node_modules by scripts/copy-vendor.js
    const vendor_uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'vendor'));
    const nonce = getNonce();

    let theme_mode = 'light';
    if (vscode.window.activeColorTheme.kind == vscode.ColorThemeKind.Dark)
      theme_mode = 'dark';

    result = {
      asserts_uri: asserts_uri,
      vendor_uri: vendor_uri,
      styleUri: styleUri,
      nonce: nonce,
      csp_source: webview.cspSource,
      current_date: new Date().toLocaleString(),
      theme_mode: theme_mode,
      get_text: (v: string) => {
        return template_text(v);
      },
      locale: vscode.env.language,
    }

    if (!OBITools.contains_obi_project()) {
      return result;
    }

    const ws: string = Workspace.get_workspace();
    const current_profile = AppConfig.get_current_profile_app_config_name();
    const ws_settings = Workspace.get_workspace_settings();

    return {
      ...result,
      current_profile: current_profile,
      workspace_settings: ws_settings
    }
  }




  /** Writes a compile-list object to disk, refreshing its `git` branch/commit info first. */
  public static write_compile_list(file_path: string, compile_list: Record<string, unknown>): void {
    GitInfo.attach_git_info(compile_list, Workspace.get_workspace());
    DirTool.write_json(file_path, compile_list);
  }


  public static update_compile_list(ignore_sources: string[], ignore_sources_cmd: Record<string, string[]>, compileListFileName?: string): void {
    let compile_list: any = OBITools.get_compile_list(Workspace.get_workspace_uri(), compileListFileName) || {};

    const default_path = path.join(Workspace.get_workspace(), AppConfig.get_app_config().general['compile-list']);
    const current_path = compileListFileName ? path.join(Workspace.get_workspace(), compileListFileName) : default_path;
    // Rebuilding a build-history snapshot: its commands are already 'success', force them back to
    // 'new' so the rebuild actually re-executes them instead of being filtered out as already done.
    const force_rebuild = current_path !== default_path;

    for (const level_item of compile_list['compiles']) {
      for (const source of level_item['sources']) {
        source['ignore'] = false;
        if (ignore_sources.includes(source['source'])) {
          source['ignore'] = true;
        }
        if (force_rebuild) {
          delete source['status'];
        }
        for (const cmd of source['cmds']) {
          cmd['ignore'] = false;
          if (ignore_sources_cmd[source['source']] && ignore_sources_cmd[source['source']]?.includes(cmd['cmd'])) {
            cmd['ignore'] = true;
          }
          if (force_rebuild) {
            cmd['status'] = 'new';
          }
        }
      }
    }

    OBITools.write_compile_list(current_path, compile_list);

    // The build pipeline always reads/transfers the default compile-list path, even when the user
    // currently has a build-history compile-list.json opened in the webview.
    if (current_path !== default_path) {
      OBITools.write_compile_list(default_path, compile_list);
    }

  }



  public static get_compile_list(workspaceUri: vscode.Uri, compileListFileName: string|undefined=undefined): any | undefined {

    if (AppConfig.attributes_missing())
      return undefined;
    
    const config = AppConfig.get_app_config();

    if (!compileListFileName) {
      if (!config.general['compile-list']) {
        vscode.window.showErrorMessage(vscode.l10n.t('OBI config is invalid'));
        throw Error('OBI config is invalid');
      }
    }

    const file_path: string = compileListFileName ? path.join(workspaceUri.fsPath, compileListFileName) : path.join(workspaceUri.fsPath, config.general['compile-list']);

    // Converting to JSON 
    const compile_list = DirTool.get_json(file_path);

    if (typeof compile_list != 'object' || compile_list == null || (compile_list instanceof Array) || (compile_list instanceof Date))
      return undefined;

    if (!compile_list['compiles'] || !compile_list['timestamp'])
      return undefined;

    return compile_list
  }




  public static get_sources_info_from_compile_list(): source.SourceCompileList[] {

    let sources: source.SourceCompileList[] = [];

    const compile_list: any | undefined = OBITools.get_compile_list(Workspace.get_workspace_uri());

    if (!compile_list || !('compiles' in compile_list))
      return sources;

    for (const level_item of (compile_list['compiles'] as any)) {
      for (const source of level_item['sources']) {
        sources.push(source);
      }
    }

    return sources;
  }



  public static get_sources_2_build_from_compile_list(skip_ignored: boolean=false): string[] {

    let sources: string[] = [];
    let need_2_build: boolean = false;

    const compile_list: any | undefined = OBITools.get_compile_list(Workspace.get_workspace_uri());

    if (!compile_list || !('compiles' in compile_list))
      return sources;

    for (const level_item of (compile_list['compiles'] as any)) {
      
      for (const source of level_item['sources']) {
        
        if (skip_ignored && source['ignore'])
          continue;

        need_2_build = false;
        for (const cmd of source['cmds']) {
          if (cmd['status'] != 'success') {
            need_2_build = true;
            break;
          }
        }
        if (need_2_build)
          sources.push(source['source']);
      }
    }

    return sources;
  }




  public static is_compile_list_completed(compile_list: any): boolean {

     if (!compile_list || !('compiles' in compile_list))
      return false;

    for (const level_item of (compile_list['compiles'] as any)) {
      for (const source of level_item['sources']) {
        if (source['ignore'])
          continue;
        for (const cmd of source['cmds']) {
          if (cmd['status'] != 'success' && !cmd['ignore'])
            return false;
        }
      }
    }

    return true;
  }




  public static get_source_hash_list(workspace: string): source.ISource | undefined {

    const config = AppConfig.get_app_config();
    if (!config.general['compiled-object-list'])
      return undefined

    const file: string = path.join(workspace, config.general['compiled-object-list'])

    return DirTool.get_json(file)

  }


  public static rename_source_in_object_list(old_source: string, new_source: string): void {

    if (old_source === new_source) {
      return;
    }

    const config = AppConfig.get_app_config();
    if (!config.general['compiled-object-list']) {
      return;
    }

    const file: string = path.join(Workspace.get_workspace(), config.general['compiled-object-list']);
    const source_hash_list: source.ISource = DirTool.read_json_strict<source.ISource>(file) || {};

    if (!(old_source in source_hash_list)) {
      return;
    }

    if (!(new_source in source_hash_list)) {
      source_hash_list[new_source] = source_hash_list[old_source];
    }
    delete source_hash_list[old_source];

    DirTool.update_json(file, source_hash_list);
  }



  /** Sources that are new or changed since the last successful build */
  public static async get_changed_sources(): Promise<source.ISourceList> {
    const hashes = await OBITools.retrieve_current_source_hashes();
    return { ...compare_hashes(hashes, OBITools.get_source_hash_list(Workspace.get_workspace()) || {}), 'old-sources': [] };
  }



  public static async generate_source_change_lists(source?: string): Promise<string[]> {
    const ws = Workspace.get_workspace();

    DirTool.clean_dir(path.join(ws, '.obi', 'tmp'));
    DirTool.clean_dir(path.join(ws, '.obi', 'build-output'));

    logger.info('Get changed sources');
    let changed_sources: source.ISourceList = {
      "new-objects": [],
      "changed-sources": [source || ''],
      "old-sources": []
    }
    if (!source)
      changed_sources = await OBITools.get_changed_sources();

    // Dependents come from the build order (computed once)
    const build = await createBuildList(source, source ? undefined : changed_sources);
    const dependend_sources: string[] = build.dependents;

    logger.info('Clean dir');
    DirTool.clean_dir(path.join(Workspace.get_workspace(), '.obi', 'tmp'));
    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.CHANGED_OBJECT_LIST), JSON.stringify(changed_sources, undefined, 2));
    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.DEPENDEND_OBJECT_LIST), JSON.stringify(dependend_sources, undefined, 2));

    return [...changed_sources['changed-sources'], ...changed_sources['new-objects'], ...dependend_sources];
  }



  /**
   * MD5 of every source ('/'-separated path relative to the source folder → hash). Unchanged files are taken
   * from the cache (.obi/cache/source-hashes.json); use_cache = false hashes every file.
   */
  public static async retrieve_current_source_hashes(use_cache: boolean = true): Promise<Record<string, string>> {

    const config = AppConfig.get_app_config();
    const started = performance.now();
    OBITools.hashing_cancelled = false;

    const hashes = await compute_source_hashes(DirTool.get_local_source_dir(), config.general['supported-object-types'] || ['pgm', 'file', 'srvpgm'], {
      concurrency: config.general['max-threads'] || 20,
      cache_file: path.join(Workspace.get_workspace(), Constants.SOURCE_HASH_CACHE_FILE),
      use_cache: use_cache,
      is_cancelled: () => OBITools.hashing_cancelled || OperationLock.token.isCancellationRequested
    });

    logger.info(`${Object.keys(hashes).length} source hashes in ${((performance.now() - started) / 1000).toFixed(2)} seconds`);
    return hashes;
  }



  /** Transfers the project to the IBM i (after confirmation). Returns true if the transfer was done successfully. */
  public static async transfer_project_folder(silent: boolean | undefined): Promise<boolean> {
    return (await OperationLock.run('Transfer', () => OBITools.do_transfer_project_folder(silent))) ?? false;
  }



  /** Without lock: also used during a build (check_remote). */
  public static async do_transfer_project_folder(silent: boolean | undefined): Promise<boolean> {

    try {
      return await OBITools.process_transfer_project_folder(silent);
    }
    catch (e: unknown) {
      show_error(vscode.l10n.t('Transfer to the IBM i failed'), e);
      return false;
    }
  }



  public static async process_transfer_project_folder(silent: boolean | undefined): Promise<boolean> {

    const config = AppConfig.get_app_config();

    if (!config.general['remote-base-dir'])
      throw Error(`Config attribute 'config.general.remote_base_dir' missing`);

    const local_dir: string = Workspace.get_workspace();
    const remote_dir: string = config.general['remote-base-dir'];

    if (!silent) {
      const minimum = vscode.l10n.t('Only minimum');
      const all = vscode.l10n.t('Transfer all');
      const answer = await vscode.window.showWarningMessage(
        vscode.l10n.t('Transfer the project to the IBM i?'),
        { modal: true, detail: vscode.l10n.t('The remote folder \'{0}\' will be deleted and uploaded again.\n\n"{1}" uploads the configuration only, "{2}" the whole project (this can take several minutes).', remote_dir, minimum, all) },
        minimum, all);

      switch (answer) {

        case undefined:
          throw new UserCancelledError('Transfer cancelled by user');

        case minimum:
          //Transfer minimum setup;
          await OBITools.transfer_minimum_now(local_dir, remote_dir);
          return true;

        case all:
          await OBITools.transfer_all_now(local_dir, remote_dir);
          return true;
      }
    }

    return false;
  }




  private static async transfer_all_now(local_dir: string, remote_dir: string) {
    vscode.window.showInformationMessage(vscode.l10n.t('Start transfer'));

    // cleanup_directory shows the reason itself
    if (!await SSH_Tasks.cleanup_directory())
      throw Error('Cleanup of remote directory failed!');

    logger.info(`Transfer local dir ${local_dir} to ${remote_dir}`);
    await SSH_Tasks.transfer_dir(local_dir, remote_dir);
  }



  private static async transfer_minimum_now(local_dir: string, remote_dir: string) {
    vscode.window.showInformationMessage(vscode.l10n.t('Start transfer'));

    // cleanup_directory shows the reason itself
    if (!await SSH_Tasks.cleanup_directory())
      throw Error('Cleanup of remote directory failed!');

    logger.info(`Transfer local dir ${local_dir}/.obi to ${remote_dir}/.obi`);
    await SSH_Tasks.transfer_dir(`${local_dir}/.obi/etc`, `${remote_dir}/.obi/etc`);
    await SSH_Tasks.transfer_dir(`${local_dir}/${Constants.BUILD_OUTPUT_DIR}`, `${remote_dir}/${Constants.BUILD_OUTPUT_DIR}`);
  }


}