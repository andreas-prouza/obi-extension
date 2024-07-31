import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirTool } from '../../utilities/DirTool';

export class SourceListProvider implements vscode.TreeDataProvider<SourceListItem> {
  private workspaceRoot: string = '';
  private _onDidChangeTreeData: vscode.EventEmitter<SourceListItem | undefined | null | void> = new vscode.EventEmitter<SourceListItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SourceListItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(workspaceRoot: string | undefined) {
    if (workspaceRoot !== undefined)
      this.workspaceRoot = workspaceRoot
  }

  getTreeItem(element: SourceListItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SourceListItem): Thenable<SourceListItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No dependency in empty workspace');
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve(
        []
      );
    } 
    
    const source_list_path = path.join(this.workspaceRoot, 'source-list');
    if (!DirTool.pathExists(source_list_path)) {
      vscode.window.showInformationMessage('Workspace has no package.json');
      return Promise.resolve([]);
    }

    let child = [];

    const source_list = DirTool.get_dir_list(source_list_path);
    for (let index = 0; index < source_list.length; index++) {
      const element = source_list[index];

      if (!DirTool.is_file(path.join(this.workspaceRoot, 'source-list', element)))
        continue;

      child.push(new SourceListItem(
        element,
        '',
        vscode.TreeItemCollapsibleState.None
      ))
    }

    return Promise.resolve(child);

  }


  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public register(context: vscode.ExtensionContext): any {
    // setup
    const options = {
        treeDataProvider: this,
        showCollapseAll: true
    };

    // build
    vscode.window.registerTreeDataProvider('obi.source-lists', this);
    vscode.commands.registerCommand('Update-TreeView', () => {
        this.refresh();
    });

    // create
    const tree = vscode.window.createTreeView('obi.source-lists', options);
    
    // setup: events
    tree.onDidChangeSelection(e => {
        if (e.selection.length == 0)
          return;
        console.log(e); // breakpoint here for debug
        vscode.window.showInformationMessage(`Show ${e.selection[0].label}`);
      });
    tree.onDidCollapseElement(e => {
        console.log(e); // breakpoint here for debug
    });
    tree.onDidChangeVisibility(e => {
        console.log(e); // breakpoint here for debug
    });
    tree.onDidExpandElement(e => {
        console.log(e); // breakpoint here for debug
    });

    // subscribe
    context.subscriptions.push(tree);
  }

}


class SourceListItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    private version: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label}-${this.version}`;
    this.description = this.version;
  }

  iconPath = {
    light: path.join(__filename, '..', '..', '..', '..', 'asserts', 'img', 'light', 'edit.svg'),
    dark: path.join(__filename, '..', '..', '..', '..', 'asserts', 'img', 'dark', 'edit.svg')
  };
}