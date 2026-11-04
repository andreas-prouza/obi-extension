import * as path from 'path';
import * as vscode from 'vscode';
import { BuildSummary } from './webview/show_changes/BuildSummary';
import { OBIController } from './webview/controller/OBIController';
import { SourceListItem, SourceListProvider } from './webview/source_list/SourceListProvider';
import { OBICommands } from './extension/obi/OBICommands';
import { Welcome } from './webview/controller/Welcome';
import { OBITools } from './extension/utilities/OBITools';
import { OBIConfiguration } from './webview/controller/OBIConfiguration';
import { SSH_Tasks } from './extension/utilities/SSH_Tasks';
import { AppConfig } from './extension/config/AppConfig';
import { ConfigInvalid } from './webview/controller/ConfigInvalid';
import { logger } from './extension/utilities/Logger';
import { SourceInfos } from './webview/source_list/SourceInfos';
import { Workspace } from './extension/utilities/Workspace';
import { OBISourceConfiguration } from './webview/controller/OBISourceConfiguration';
import { DirTool } from './extension/utilities/DirTool';
import { I_Releaser } from './webview/deployment/I_Releaser';
import { DeploymentConfig } from './webview/deployment/DeploymentConfig';
import { OBISourceDependency } from './webview/controller/OBISourceDependency';
import { LocalSourceList } from './extension/utilities/LocalSourceList';
import { QuickSettings } from './webview/quick_settings/QuickSettings';
import { BuildHistoryProvider } from './webview/build_history/BuildHistoryProvider';
import { sourceQuickSearch } from './source-quick-search';
import { CompileDiagnostics } from './extension/source/CompileDiagnostics';
import { StatusBar } from './extension/StatusBar';
import { offer_gitignore_entries } from './extension/obi/GitignoreCheck';
import { HealthyWatchdog } from './extension/utilities/HealthyWatchdog';
import { Constants } from './shared/Constants';
import { SystemCmdExecution } from './extension/utilities/SystemCmdExecution';
import { register_command } from './extension/utilities/Registration';
import { HostKeyStore } from './extension/utilities/HostKeyStore';
import { BuildOutput } from './extension/utilities/BuildOutput';
import { add_log_files, register_output_channel, set_secret_values } from './extension/utilities/Logger';
import { secret_values } from './shared/Redact';
import { OPEN_CONFIGURATION, show_error } from './extension/utilities/Notify';
import { remove_secrets_from_history } from './extension/obi/HistorySecrets';
import { ProjectState } from './extension/ProjectState';
import { BackendUpdate } from './extension/obi/BackendUpdate';
import { FILE_CALLBACKS } from './file_callbacks';


export function activate(context: vscode.ExtensionContext) {

	register_output_channel(context);

	logger.info('Congratulations, your extension "obi" is now active!');

	logger.info('Start app');

	logger.info(`vscode.env.remoteName: ${vscode.env.remoteName}`);
	logger.info(`vscode.env.uriScheme: ${vscode.env.uriScheme}`);
	logger.info(`vscode.env.appHost: ${vscode.env.appHost}`);

	SSH_Tasks.context = context;
	OBITools.ext_context = context;

	// Older versions kept the selected config tab in the OS keychain; it's in workspaceState now
	context.secrets.delete('obi|config|panel');
	context.secrets.delete('obi|config|panel_tab');



	// Host keys are stored globally, so this works in every window
	register_command(context, 'obi.ssh.forget-host-key', () => HostKeyStore.forget(context.globalState));
	BuildOutput.register(context);
	// Also without a project: this creates it
	register_command(context, 'obi.initialize-folder', () => OBITools.initialize_folder());

	const obi_welcome_provider = new Welcome(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(Welcome.viewType, obi_welcome_provider)
	);

	// Sets obi.contains_obi_project / obi.valid-config, and registers and starts the rest when a project is found
	// and its configuration is valid; config changes and Initialize update it without reloading the window
	ProjectState.init(context, { on_project_found: register_project_features, on_valid: start_project_services });
	ProjectState.update().catch((e: unknown) => show_error(vscode.l10n.t('OBI could not be started'), e));
}



/** Commands, views and listeners of an OBI project; once per window, as soon as a project is found */
function register_project_features(context: vscode.ExtensionContext): void {

	const rootPath = Workspace.get_workspace();
	const ws_uri = Workspace.get_workspace_uri();

	add_log_files(rootPath);
	offer_gitignore_entries(context, rootPath).catch(e => logger.warn(`.gitignore check failed: ${e}`));
	// Older versions stored the build config with secret* variables in the history (bugs.md #1)
	if (!context.workspaceState.get<boolean>('obi.history.secrets_removed')) {
		const cleaned = remove_secrets_from_history(path.join(rootPath, Constants.BUILD_HISTORY_DIR));
		logger.info(`Secret variables removed from ${cleaned} build history entries`);
		context.workspaceState.update('obi.history.secrets_removed', true);
	}
	set_secret_values(() => secret_values(AppConfig.get_app_config().global?.variables));

	const obi_config_invalid_provider = new ConfigInvalid(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ConfigInvalid.viewType, obi_config_invalid_provider)
	);

	register_command(context, 'obi.controller.config', () => {
		OBIConfiguration.render(context, context.extensionUri)
	})
	context.subscriptions.push(Workspace.on_did_change_profile(() => OBIConfiguration.update()));

	try {
		OBITools.migrate_project_files(context);
	}
	catch (e: unknown) {
		show_error(vscode.l10n.t('OBI could not update the project files'), e);
	}

	register_command(context, 'obi.source-quick-search', () => {
		sourceQuickSearch();
	});

	register_command(context, 'obi.open.file', async () => {
		const source_list = await LocalSourceList.get_source_list();
		if (source_list) {
			const source = await vscode.window.showQuickPick(source_list);
			if (source) {
				// The list contains OBI source names (relative to the source folder)
				vscode.commands.executeCommand('vscode.open', DirTool.get_file_URI(path.join(DirTool.get_local_source_dir_relative(), source)));
			}
		}
	});

	// Create new source list provider
	const source_list_provider = new SourceListProvider(rootPath);
	source_list_provider.register(context);

	//--------------------------------------------------------
	// i-Releaser
	//--------------------------------------------------------
	const i_releaser = new I_Releaser(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(I_Releaser.viewType, i_releaser)
	);

	// URL and token of i-Releaser, for "Start i-Releaser workflow" in the build summary
	register_command(context, 'obi.deployment.maintain', () => DeploymentConfig.render(context));
	register_command(context, 'obi.deployment.open-web-app', () => DeploymentConfig.open_web_app());
	// Icons in the OBI Build view only for projects with an i-Releaser URL
	DeploymentConfig.update_context();


	//--------------------------------------------------------
	// Controller OBI
	//--------------------------------------------------------
	register_command(context, 'obi.copy-profile-config', () => {
		OBIController.copy_current_profile()
	});



	register_command(context, 'obi.reset-compiled-object-list', () => {
		// Only available with workspaces
		OBICommands.reset_compiled_object_list();
	});

	register_command(context, 'obi.get-remote-build-results', () => {
		// Only available with workspaces
		OBICommands.get_remote_build_results();
	});

	register_command(context, 'obi.controller.dependency-list', () => {
		vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(ws_uri, Constants.DEPENDENCY_LIST));
	});

	register_command(context, 'obi.show_changes', () => {
		// Only available with workspaces
		OBICommands.show_changes(context);
	});

	register_command(context, 'obi.show_single_changes', () => {
		// Only available with workspaces
		OBICommands.show_single_changes(context);
	});

	register_command(context, 'obi.run_build', () => {
		// Only available with workspaces
		OBICommands.run_build(context);
	});

	register_command(context, 'obi.run_single_build', () => {
		// Only available with workspaces
		OBICommands.run_single_build(context);
	});

	register_command(context, 'obi.add-source-to-build-summary', () => {
		// Only available with workspaces
		BuildSummary.add_sources(context.extensionUri, ws_uri);
	});

	register_command(context, 'obi.open_build_summary', (summary_file_path?: string) => {
		// Only available with workspaces
		if (summary_file_path) {
			if (path.isAbsolute(summary_file_path))
				summary_file_path = DirTool.to_workspace_relative(summary_file_path) ?? summary_file_path;
			if (DirTool.file_exists(path.join(Workspace.get_workspace(), summary_file_path))) {
				summary_file_path = path.dirname(summary_file_path);
			}
		}
		BuildSummary.render(context.extensionUri, ws_uri, summary_file_path);
	});

	register_command(context, 'obi.transfer-all', () => {
		// Only available with workspaces
		OBITools.transfer_project_folder(false);
	});

	const obi_controller_provider = new OBIController(context.extensionUri);
	context.subscriptions.push(
		// Keep the page (e.g. the busy indicator) while the view is hidden
		vscode.window.registerWebviewViewProvider(OBIController.viewType, obi_controller_provider, {
			webviewOptions: { retainContextWhenHidden: true }
		})
	);

	const quick_settings = new QuickSettings(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(QuickSettings.viewType, quick_settings)
	);

	// Register Build History Tree View
	const buildHistoryProvider = new BuildHistoryProvider(rootPath);
	buildHistoryProvider.register(context);
	BuildHistoryProvider.init_retention(context.workspaceState);

	register_command(context, 'obi.source-filter.maintain-source-infos', () => {
		// Only available with workspaces
		SourceInfos.render(context, true);
	});

	register_command(context, 'obi.source-filter.view-source-infos', () => {
		// Only available with workspaces
		SourceInfos.render(context, false);
	});


	register_command(context, 'obi.source.edit-compile-config', async (item: SourceListItem | vscode.Uri) => {

		if (item instanceof SourceListItem)
			OBISourceConfiguration.render(context, context.extensionUri, `${item.src_lib}/${item.src_file}/${item.src_member}`);

		if (item instanceof vscode.Uri) {

			const source_path = DirTool.to_obi_source(item.fsPath);
			if (!source_path) {
				vscode.window.showErrorMessage(DirTool.not_in_source_dir_message(item.fsPath));
				return;
			}
			if (!DirTool.file_exists(item.fsPath)) {
				vscode.window.showErrorMessage(vscode.l10n.t('Source {0} not found in the OBI project', source_path));
				return;
			}

			OBISourceConfiguration.render(context, context.extensionUri, source_path);
		}

	});


	register_command(context, 'obi.source.maintain-source-dependency', async (item: SourceListItem | vscode.Uri) => {

		if (item instanceof SourceListItem)
			OBISourceDependency.render(context, context.extensionUri, `${item.src_lib}/${item.src_file}/${item.src_member}`);

		if (item instanceof vscode.Uri) {

			const source_path = DirTool.to_obi_source(item.fsPath);
			if (!source_path) {
				vscode.window.showErrorMessage(DirTool.not_in_source_dir_message(item.fsPath));
				return;
			}
			if (!DirTool.file_exists(item.fsPath)) {
				vscode.window.showErrorMessage(vscode.l10n.t('Source {0} not found in the OBI project', source_path));
				return;
			}

			OBISourceDependency.render(context, context.extensionUri, source_path);
		}

	});

	register_command(context, 'obi.clearDiagnostics', () => {
		CompileDiagnostics.clear();
		vscode.window.setStatusBarMessage(vscode.l10n.t('Diagnostics cleared'), 3000);
	});


	// Watch for file renames in the workspace
	const renameListener = vscode.workspace.onDidRenameFiles(async event => {
		const app_config = AppConfig.get_app_config();

		for (const renamedFile of event.files) {
			const old_source = DirTool.to_obi_source(renamedFile.oldUri.fsPath);
			const new_source = DirTool.to_obi_source(renamedFile.newUri.fsPath);

			if (!old_source || !new_source) {
				continue;
			}

			const old_ext = path.extname(old_source).replace('.', '').toLowerCase();
			const new_ext = path.extname(new_source).replace('.', '').toLowerCase();

			if (!app_config.general['supported-object-types'].includes(old_ext) || !app_config.general['supported-object-types'].includes(new_ext)) {
				continue;
			}

			try {
				await SourceListProvider.sync_renamed_source_member(old_source, new_source);
			}
			catch (e) {
				DirTool.show_save_error(e);
			}
		}

		SourceListProvider.get_instance().refresh();
	});

    context.subscriptions.push(renameListener);
}



/** Watchers, compile messages, status bar, source list and history clean-up; once the configuration is valid */
function start_project_services(context: vscode.ExtensionContext): void {
	HealthyWatchdog.set_healthy_watchdog(context, FILE_CALLBACKS);
	CompileDiagnostics.init(context);
	StatusBar.init(context);
	BuildHistoryProvider.apply_retention().catch((e: unknown) => logger.warn(`Build history retention failed: ${e}`));
	LocalSourceList.load_source_list();
	// Setting obi.backend.autoUpdateLocal: git pull of the local OBI backend, once per session
	BackendUpdate.update_local_on_start(OBITools.get_local_obi_dir()).catch((e: unknown) => logger.warn(`Updating the local OBI backend failed: ${e}`));
}



export function deactivate(): void {
	// Local OBI processes run in their own process group and would outlive a window reload
	SystemCmdExecution.abort_all();
	SSH_Tasks.disconnect();
}

