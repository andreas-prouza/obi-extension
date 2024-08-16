import * as vscode from 'vscode';
import { BuildSummary } from './webview/show_changes/BuildSummary';
import { OBIController } from './webview/controller/OBIController';
import { SourceListProvider } from './webview/controller/SourceListProvider';
import { OBICommands } from './obi/OBICommands';
import { Welcome } from './webview/Welcome';
import { OBITools } from './utilities/OBITools';
import path from 'path';
import * as fs from 'fs';
import { OBIConfiguration } from './webview/controller/OBIConfiguration';
import { AppConfig } from './webview/controller/AppConfig';
import { SSH_Tasks } from './utilities/SSH_Tasks';


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

	//const fileUri = vscode.Uri.file('/home/andreas/projekte/opensource/extensions/obi/README.md');
	//vscode.commands.executeCommand('vscode.open', fileUri);

	vscode.commands.executeCommand('setContext', 'obi.contains_obi_project', OBITools.contains_obi_project());

	//SSH_Tasks.connect();

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.helloWorld', () => {
			vscode.window.showInformationMessage('Hello World from obi 2!');
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
		vscode.commands.registerCommand('obi.run_build_native', () => {
			if (ws_uri)
				OBITools.retrieve_source_hashes(ws_uri.fsPath, (results:[])=>{
					
					// Get all sources which are new or have changed
					const last_source_hashes = OBITools.get_source_hash_list_file(ws_uri.fsPath);
					
					if (!last_source_hashes)
						return;

					let changed_sources = [];

					for (const result_item of results) {

						const item = Object.entries(result_item)[0];
						const k_source = item[0];
						const v_hash = item[1];
						let source_changed = true;

						if (k_source in last_source_hashes) {

							if (last_source_hashes[k_source]['hash'] == v_hash) {
								source_changed = false;
								continue;
							}
						}
						
						if (source_changed)
							changed_sources.push(result_item);
					}
					console.log(`After source hashes ... Run build ${results.length}`);
					console.log(`Changed sources ${changed_sources.length}`);
					//SSH_Tasks.executeCommand();
				});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.open_build_summary', () => {
			// Only available with workspaces
			BuildSummary.render(context.extensionUri, ws_uri);
		})
	);

	const obi_controller_provider = new OBIController(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(OBIController.viewType, obi_controller_provider)
	);

	const obi_welcome_provider = new Welcome(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(Welcome.viewType, obi_welcome_provider)
	);

	if (rootPath) {
		const config = AppConfig.get_app_confg()['app_config'];
		const compile_list_file_path: string = path.join(rootPath, config['general']['compile-list']);
		// if compile-script changed, refresh the view
		fs.watchFile(compile_list_file_path, {interval: 1000}, function (event, filename) {
			OBIController.update_build_summary_timestamp();
		});
	}


	new SourceListProvider(rootPath).register(context);
	/*
	vscode.window.registerTreeDataProvider(
		'obi.source-lists',
		new SourceListProvider(rootPath)
	);
	vscode.window.createTreeView('obi.source-lists', {
		treeDataProvider: new SourceListProvider(rootPath)
	});
	*/
	context.subscriptions.push(
		vscode.commands.registerCommand('obi.controller.config', ()  => {
			if (!vscode.workspace.workspaceFolders)
				return;
			OBIConfiguration.render(context.extensionUri, vscode.workspace.workspaceFolders[0].uri)
		})
	)

}

