import * as vscode from 'vscode';
import { BuildSummary } from './webview/show_changes/BuildSummary';
import { OBIController } from './webview/controller/OBIController';
import { SourceListProvider } from './webview/controller/SourceListProvider';
import { OBICommands } from './obi/OBICommands';
import { Welcome } from './webview/controller/Welcome';
import { OBITools } from './utilities/OBITools';
import { OBIConfiguration } from './webview/controller/OBIConfiguration';
import path from 'path';
import { DirTool } from './utilities/DirTool';


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

	OBITools.ext_context = context;

	//const fileUri = vscode.Uri.file('/home/andreas/projekte/opensource/extensions/obi/README.md');
	//vscode.commands.executeCommand('vscode.open', fileUri);

	console.log(`OBITools.is_native(): ${OBITools.is_native()}`);
	const contains_obi_project: boolean = OBITools.contains_obi_project();
	const run_native: boolean = OBITools.is_native();
	vscode.commands.executeCommand('setContext', 'obi.contains_obi_project', contains_obi_project);
	vscode.commands.executeCommand('setContext', 'obi.run_native', run_native);

	const obi_welcome_provider = new Welcome(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(Welcome.viewType, obi_welcome_provider)
	);


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
		vscode.commands.registerCommand('obi.open_build_summary', () => {
			// Only available with workspaces
			BuildSummary.render(context.extensionUri, ws_uri);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.transfer-all', () => {
			// Only available with workspaces
			OBITools.transfer_all();
		})
	);

	const obi_controller_provider = new OBIController(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(OBIController.viewType, obi_controller_provider)
	);


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

