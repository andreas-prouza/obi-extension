import * as vscode from 'vscode';
import { BuildSummary } from './webview/show_changes/BuildSummary';
import { OBIController } from './webview/controller/OBIController';
import { SourceListProvider } from './webview/controller/SourceListProvider';
import { DirTool } from './utilities/DirTool';



export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "obi" is now active!');


	//const fileUri = vscode.Uri.file('/home/andreas/projekte/opensource/extensions/obi/README.md');
	//vscode.commands.executeCommand('vscode.open', fileUri);
	if (vscode.workspace.workspaceFolders == undefined) {
		vscode.window.showErrorMessage('No workspace');
		return;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.helloWorld', () => {
			vscode.window.showInformationMessage('Hello World from obi 2!');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('obi.show_changes', () => {
			// Only available with workspaces
			if (vscode.workspace.workspaceFolders == undefined) {
				vscode.window.showErrorMessage('No workspace');
				return;
			}
			BuildSummary.render(context.extensionUri, vscode.workspace.workspaceFolders[0].uri)
		})
	);

	const obi_controller_provider = new OBIController(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(OBIController.viewType, obi_controller_provider)
	);


	const files = DirTool.get_dir_list('/home/andreas/projekte/tests/test/test-build-obi/source-list');
	console.log('Files: ');
	console.log(files);

	const rootPath =
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: undefined;
		
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

