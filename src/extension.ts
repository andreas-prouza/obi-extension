import * as vscode from 'vscode';
import { BuildSummary } from './webview/show_changes/BuildSummary';
import { OBIController } from './webview/controller/OBIController';
import { SourceListProvider } from './webview/controller/SourceListProvider';
import { DirTool } from './utilities/DirTool';
import { OBICommands } from './obi/OBICommands';
import { Welcome } from './webview/Welcome';
import { OBITools } from './utilities/OBITools';
import { Constants } from './Constants';
import path from 'path';



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

	const obi_controller_provider = new OBIController(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(OBIController.viewType, obi_controller_provider)
	);

	const obi_welcome_provider = new Welcome(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(Welcome.viewType, obi_welcome_provider)
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
}

