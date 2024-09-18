import * as vscode from 'vscode';
import { BuildSummary } from './webview/show_changes/BuildSummary';
import { OBIController } from './webview/controller/OBIController';
import { SourceListProvider } from './webview/controller/SourceListProvider';
import { OBICommands } from './obi/OBICommands';
import { Welcome } from './webview/controller/Welcome';
import { OBITools } from './utilities/OBITools';
import { OBIConfiguration } from './webview/controller/OBIConfiguration';
import { SSH_Tasks } from './utilities/SSH_Tasks';
import { AppConfig } from './webview/controller/AppConfig';
import { ConfigInvalid } from './webview/controller/ConfigInvalid';
import { logger } from './utilities/Logger';
import { SourceInfos } from './webview/source_list/SourceInfos';
import { LocaleText } from './utilities/LocaleText';

const nunjucks = require('nunjucks');


export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "obi" is now active!');
	const rootPath =
	vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
	? vscode.workspace.workspaceFolders[0].uri.fsPath
	: undefined;
	const ws_uri =
	vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
	? vscode.workspace.workspaceFolders[0].uri
	: undefined;

	logger.info('Start app');
	
	SSH_Tasks.context = context;
	OBITools.ext_context = context;
	
	// Add support for multi language
	LocaleText.init(vscode.env.language, context);


	//const fileUri = vscode.Uri.file('/home/andreas/projekte/opensource/extensions/obi/README.md');
	//vscode.commands.executeCommand('vscode.open', fileUri);

	const contains_obi_project: boolean = OBITools.contains_obi_project();
	vscode.commands.executeCommand('setContext', 'obi.contains_obi_project', contains_obi_project);
	
	const obi_welcome_provider = new Welcome(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(Welcome.viewType, obi_welcome_provider)
	);
	
	if (!contains_obi_project)
		return;
	

	const obi_config_invalid_provider = new ConfigInvalid(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ConfigInvalid.viewType, obi_config_invalid_provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.controller.config', ()  => {
			OBIConfiguration.render(context, context.extensionUri)
		})
	)

	const config = AppConfig.get_app_confg();
	vscode.commands.executeCommand('setContext', 'obi.valid-config', !config.attributes_missing());

	if (config.attributes_missing())
		return;


	context.subscriptions.push(
		vscode.commands.registerCommand('obi.get-remote-source-list', () => {
			// Only available with workspaces
			OBICommands.get_remote_source_list();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.check-remote-sources', () => {
			// Only available with workspaces
			OBITools.check_remote_sources().then((success)=> {
				if (success)
					vscode.window.showInformationMessage('Remote source check succeeded');
				else
					vscode.window.showWarningMessage('Remote source check failed');
			});
		})
	);

	const run_native: boolean = OBITools.is_native();
	vscode.commands.executeCommand('setContext', 'obi.run_native', run_native);
	
	//SSH_Tasks.connect();


	context.subscriptions.push(
		vscode.commands.registerCommand('obi.reset-compiled-object-list', () => {
			// Only available with workspaces
			OBICommands.reset_compiled_object_list();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.get-remote-compiled-object-list', () => {
			// Only available with workspaces
			OBICommands.get_remote_compiled_object_list();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.show_changes', () => {
			// Only available with workspaces
			OBICommands.show_changes(context);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.run_build', () => {
			// Only available with workspaces
			OBICommands.run_build(context);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.open_build_summary', () => {
			// Only available with workspaces
			BuildSummary.render(context.extensionUri, ws_uri);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.transfer-all', () => {
			// Only available with workspaces
			OBITools.transfer_all(false);
		})
	);

	const obi_controller_provider = new OBIController(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(OBIController.viewType, obi_controller_provider)
	);


	new SourceListProvider(rootPath).register(context);
	/*
	vscode.window.registerTreeDataProvider(
		'obi.source-filter',
		new SourceListProvider(rootPath)
	);
	vscode.window.createTreeView('obi.source-filter', {
		treeDataProvider: new SourceListProvider(rootPath)
	});
	*/

	if (config.general['check-remote-source-on-startup'] && config.general['check-remote-source-on-startup'] === true) {
		OBITools.check_remote_sources().then((success)=> {
			if (success)
				vscode.window.showInformationMessage('Remote source check succeeded');
			else
				vscode.window.showWarningMessage('Remote source check failed');
		});
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.source-filter.maintain-source-infos', () => {
			// Only available with workspaces
			SourceInfos.render(context);
		})
	);
}

