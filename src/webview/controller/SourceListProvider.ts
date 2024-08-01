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
        element
      ))
    }

    return Promise.resolve(child);

  }


  get_child_elements(element: SourceListItem): any {

    const sl = DirTool.get_json(path.join(this.workspaceRoot, 'source-list', element.source_list));
    let result = [];
    let split_index = 0;
    let found_entry = false;
    const lib = 0;
    const source_file = 1;
    const member = 2;

    if (element.source_member == undefined)
      split_index = member;

    if (element.source_file == undefined)
      split_index = source_file;

    if (element.lib == undefined)
      split_index = lib;

    // Read each source list entry
    for (let index = 0; index < sl.length; index++) {
      const source_split = sl[index]['source'].split('/');

      found_entry = false;

      // Check if label already exist
      for (let i2 = 0; i2 < result.length; i2++){
        if (result[i2].label == source_split[split_index]) {
          found_entry = true;
          break;
        }
      }
      if (found_entry)
        continue;
      
      if (split_index == source_file && element.lib != source_split[lib])
        continue;
      
      if (split_index == member && (element.lib != source_split[lib] || element.source_file != source_split[source_file]))
        continue;

      let source_item = undefined;

      switch (split_index) {
        
        case lib: // Libs
          source_item = new SourceListItem(source_split[split_index], undefined, vscode.TreeItemCollapsibleState.Collapsed, element.source_list, source_split[split_index])
          break;

        case source_file: // Source files
          source_item = new SourceListItem(source_split[split_index], undefined, vscode.TreeItemCollapsibleState.Collapsed, element.source_list, element.lib, source_split[split_index])
          break;
        
          case member: // Member
          source_item = new SourceListItem(source_split[split_index], sl[index].description || undefined, vscode.TreeItemCollapsibleState.None, element.source_list, element.lib, element.source_file, source_split[split_index])
          break;

          default:
            source_item = new SourceListItem('Unknown', '', vscode.TreeItemCollapsibleState.None, element.source_list);
      }

      result.push(source_item);
    }
    return result;

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
    vscode.commands.registerCommand('obi.source-lists.update', () => {
        this.refresh();
    });

    // create
    const tree = vscode.window.createTreeView('obi.source-lists', options);
    
    // setup: events
    tree.onDidChangeSelection(e => {
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

}



class SourceListItem extends vscode.TreeItem {
  
  public readonly label: string;
  public readonly collapsibleState: vscode.TreeItemCollapsibleState;
  public readonly source_list: string;
  public readonly path: string | undefined;
  public readonly lib: string | undefined;
  public readonly source_file: string | undefined;
  public readonly source_member: string | undefined;
  //public readonly contextValue?: string | undefined;

  constructor(
    label: string,
    description: string | undefined,
    collapsibleState: vscode.TreeItemCollapsibleState,
    source_list: string,
    lib?: string | undefined,
    source_file?: string | undefined,
    source_member?: string | undefined
  ) {
    super(label, collapsibleState);
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.tooltip = `${label}-${description}`;
    this.description = description;
    this.source_list = source_list;
    this.lib = lib;
    this.source_file = source_file;
    this.source_member = source_member;
    let member_path = '';
    let icon = 'edit.svg';

    this.contextValue = 'source_list';

    if (this.lib)
      this.contextValue = 'lib'
    
    if (this.source_file)
      this.contextValue = 'source_file'

    if (this.source_member) {
      this.contextValue = 'source_member';

      let ws = ''
      if (vscode.workspace.workspaceFolders) {
        ws = vscode.workspace.workspaceFolders[0].uri.fsPath
      }
      
      member_path = path.join(ws, 'src', this.lib || '', this.source_file || '', this.source_member)
      if (!DirTool.pathExists(member_path))
        icon = 'error.svg';
        
      this.command = {
        command: 'vscode.open', 
        title: 'Open source member', 
        arguments: [{
          scheme: 'file',
          path: member_path,
          authority: ''
        }]
      }

      this.iconPath = {
        light: path.join(__filename, '..', '..', '..', '..', 'asserts', 'img', 'light', icon),
        dark: path.join(__filename, '..', '..', '..', '..', 'asserts', 'img', 'dark', icon)
      };
    }

  }

}