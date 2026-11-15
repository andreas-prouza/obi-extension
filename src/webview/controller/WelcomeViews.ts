import * as vscode from 'vscode';


/** Shown without an OBI project: open a folder, or initialize the project */
export const WELCOME_VIEW = 'obi-welcome';
/** Shown while the configuration misses required values */
export const CONFIG_INVALID_VIEW = 'obi-config-invalid';


/** Never has items: VS Code then shows the welcome content of the view (viewsWelcome in package.json) */
const EMPTY: vscode.TreeDataProvider<never> = {
  getChildren: () => [],
  getTreeItem: item => item,
};


/** A view that only shows its welcome content: its text and buttons are in package.json and package.nls*.json */
export function register_welcome_view(context: vscode.ExtensionContext, view_id: string): void {
  context.subscriptions.push(vscode.window.createTreeView(view_id, { treeDataProvider: EMPTY }));
}
