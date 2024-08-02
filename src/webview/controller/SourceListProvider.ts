import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirTool } from '../../utilities/DirTool';
import { SourceList } from '../source_list/SourceList';



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
        this.get_child_elements(element)
      );
    } 
    
    const source_list_path = path.join(this.workspaceRoot, 'source-list');
    if (!DirTool.pathExists(source_list_path)) {
      vscode.window.showInformationMessage('Workspace has no folder "source-list"');
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
        vscode.TreeItemCollapsibleState.Collapsed,
        element,
        'source-list'
      ))
    }

    return Promise.resolve(child);

  }


  get_child_elements(element: SourceListItem): any {

    const sl = DirTool.get_json(path.join(this.workspaceRoot, 'source-list', element.source_list));
    let content_list: {}[] = [];
    let item: SourceListItem;
    let level: string = 'source-list';
    let results: SourceListItem[] = [];
    let description: string|undefined = undefined;
    let tmp_items: string[] = [];

    let collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    if (element.list_level == 'source-list') {
      level = 'source-lib';
    }
    if (element.list_level == 'source-lib') {
      level = 'source-file';
      collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
    if (element.list_level == 'source-file') {
      level = 'source-member';
      collapsibleState = vscode.TreeItemCollapsibleState.None;
    }

    content_list = SourceListProvider.get_values_by_key(sl, level);
    
    // Read each source list entry
    for (let index = 0; index < sl.length; index++) {

      if (tmp_items.indexOf(sl[index][level]) >= 0)
        continue;

      if (element.src_lib && element.src_lib != sl[index]['source-lib'] ||
          element.src_file && element.src_file != sl[index]['source-file'])
        continue;

      if (level == 'source-member') {
        description = sl[index]['description'] || undefined;
      }

      item = new SourceListItem(sl[index][level], description, collapsibleState, element.source_list, level, sl[index]['source-lib'], sl[index]['source-file'], sl[index]['source-member'], sl[index]['path'])

      tmp_items.push(sl[index][level]);  
      results.push(item);
    }
    return results;

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

    // create
    const tree = vscode.window.createTreeView('obi.source-lists', options);
    
    vscode.commands.registerCommand('obi.source-lists.update', () => {
        this.refresh();
    });

    vscode.commands.registerCommand('obi.source-lists.show-view', async (item: SourceListItem)  => {
        vscode.window.showInformationMessage(`show-view: ${item.label}`);
        if (!vscode.workspace.workspaceFolders)
          return;
        SourceList.render(context.extensionUri, vscode.workspace.workspaceFolders[0].uri, item.label)
    });


    // setup: events
    tree.onDidChangeSelection(e => {
        console.log(`onDidChangeSelection: ${e}`); // breakpoint here for debug
        if (e.selection.length == 0)
          return;
        console.log(e); // breakpoint here for debug
      });
    tree.onDidCollapseElement(e => {
        console.log(`Collapse: ${e}`); // breakpoint here for debug
    });
    tree.onDidChangeVisibility(e => {
        console.log(`ChangeVisibility: ${e}`); // breakpoint here for debug
    });
    tree.onDidExpandElement(e => {
        console.log(`Expand: ${e}`); // breakpoint here for debug
    });


    // subscribe
    context.subscriptions.push(tree);
  }

  private static get_values_by_key(source_list:[], key:string): {}[] {

    let result: {}[] = [];

    for (let i = 0; i < source_list.length; i++) {
      const element = source_list[i];
      result.push({key: element[key]});
    }

    return result;
  }

}



class SourceListItem extends vscode.TreeItem {
  
  public readonly label: string;
  public readonly collapsibleState: vscode.TreeItemCollapsibleState;
  public readonly source_list: string;
  public readonly file_path: string | undefined;
  public readonly src_lib: string | undefined;
  public readonly src_file: string | undefined;
  public readonly src_member: string | undefined;
  public readonly list_level: string;
  //public readonly contextValue?: string | undefined;

  constructor(
    label: string,
    description: string | undefined,
    collapsibleState: vscode.TreeItemCollapsibleState,
    source_list: string,
    list_level: string,
    src_lib?: string |undefined,
    src_file?: string |undefined,
    src_member?: string |undefined,
    file_path?: string | undefined
  ) {
    super(label, collapsibleState);
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.tooltip = source_list;
    
    if (src_lib && list_level == 'source-lib')
      this.tooltip = `${source_list}: ${src_lib}`;
    if (src_file && list_level == 'source-file')
      this.tooltip = `${source_list}: ${src_lib}/${src_file}`;
    if (description && list_level == 'source-member')
      this.tooltip = `${source_list}: ${src_lib}/${src_file}(${src_member}) - ${description}`;

    this.description = description;
    this.source_list = source_list;
    this.list_level = list_level;
    let member_path = '';
    let icon = 'edit.svg';

    this.contextValue = list_level;

    this.src_lib = src_lib;
    this.src_file = src_file;
    this.src_member = src_member;

    let ws = ''
    if (vscode.workspace.workspaceFolders) {
      ws = vscode.workspace.workspaceFolders[0].uri.fsPath
    }
    
    if (['source-member', 'source_list'].indexOf(list_level) == -1)
      return;

    if (file_path) {
      member_path = path.join(ws, 'src', file_path);
      if (!DirTool.pathExists(member_path))
        icon = 'error.svg';
    }

    this.iconPath = {
      light: path.join(__filename, '..', '..', '..', '..', 'asserts', 'img', 'light', icon),
      dark: path.join(__filename, '..', '..', '..', '..', 'asserts', 'img', 'dark', icon)
    };
    
    if (list_level != 'source-member')
      return;
    
    this.command = {
      command: 'vscode.open', 
      title: 'Open source member', 
      arguments: [{
        scheme: 'file',
        path: member_path,
        authority: ''
      }]
    }
  }

}