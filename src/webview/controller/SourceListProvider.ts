import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirTool } from '../../utilities/DirTool';
import { SourceList } from '../source_list/SourceList';
import { Constants } from '../../Constants';
import { logger } from '../../utilities/Logger';
import * as source from '../../obi/Source';
import { AppConfig } from './AppConfig';
import { Workspace } from '../../utilities/Workspace';
import { SourceListConfig } from '../source_list/SourceListConfig';
import { OBITools } from '../../utilities/OBITools';


interface ISourceLists {
  [element: string]: Promise<source.IQualifiedSource[] | undefined>
}

export class SourceListProvider implements vscode.TreeDataProvider<SourceListItem> {

  public static source_list_provider: SourceListProvider;
  private workspaceRoot: string = '';
  private _onDidChangeTreeData: vscode.EventEmitter<SourceListItem | undefined | null | void> = new vscode.EventEmitter<SourceListItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SourceListItem | undefined | null | void> = this._onDidChangeTreeData.event;
  public static source_lists: ISourceLists = {};


  constructor(workspaceRoot: string | undefined) {
    if (workspaceRoot !== undefined)
      this.workspaceRoot = workspaceRoot
    SourceListProvider.source_list_provider = this;
  }



  getTreeItem(element: SourceListItem): vscode.TreeItem {
    return element;
  }



  getChildren(element?: SourceListItem): Thenable<SourceListItem[]> {
    if (!this.workspaceRoot) {
      return Promise.resolve([]);
    }

    if (element) {
      return this.get_child_elements(element);
    }

    const source_list_path = path.join(this.workspaceRoot, Constants.SOURCE_FILTER_FOLDER_NAME);
    if (!DirTool.dir_exists(source_list_path)) {
      return Promise.resolve([]);
    }

    let child = [];

    const source_list = DirTool.list_dir(source_list_path);
    for (let index = 0; index < source_list.length; index++) {
      const element = source_list[index];

      const file = path.join(this.workspaceRoot, Constants.SOURCE_FILTER_FOLDER_NAME, element);

      if (!DirTool.is_file(file))
        continue;

      //OBITools.get_filtered_sources_with_details(element).then((result) => {
      //  SourceListProvider.source_lists[element] = result;
      //});
      SourceListProvider.source_lists[element] = OBITools.get_filtered_sources_with_details(element);

      child.push(new SourceListItem(
        element.replaceAll('.json', ''),
        '',
        vscode.TreeItemCollapsibleState.Collapsed,
        element,
        'source-list'
      ))
    }

    return Promise.resolve(child);

  }


  async get_child_elements(element: SourceListItem): Promise<any> {

    let content_list: {}[] = [];
    let item: SourceListItem;
    let level: string = 'source-list';
    let results: SourceListItem[] = [];
    let description: string | undefined = undefined;
    let lib: string | undefined;
    let file: string | undefined;
    let member: string | undefined;
    let path: string | undefined;

    let collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    const sources: source.IQualifiedSource[] | undefined = await SourceListProvider.source_lists[element['source_list']];

    if (element.list_level == 'source-list') {
      level = 'source-lib';
    }
    if (element.list_level == 'source-lib') {
      level = 'source-file';
      lib = element.label;
      collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
    if (element.list_level == 'source-file') {
      level = 'source-member';
      lib = element.src_lib;
      file = element.label;
      collapsibleState = vscode.TreeItemCollapsibleState.None;
    }

    content_list = SourceListProvider.get_values_by_key(sources, level, lib, file);

    // Read each source list entry
    for (const entry of content_list) {

      if (level == 'source-member') {
        description = entry['description'] || undefined;
        member = entry[level];
      }

      item = new SourceListItem(entry[level], description, collapsibleState, element.source_list, level, lib, file, member)

      results.push(item);
    }
    return results;

  }



  refresh(): void {
    this._onDidChangeTreeData.fire();
  }



  async add_new_source_filter(): Promise<string|undefined> {

    const source_list: string | undefined = await vscode.window.showInputBox({ title: `Name of source filter`, placeHolder: "source filter name", validateInput(value) {
      if (value.replace(/[\/|\\:*?"<>]/g, " ") != value)
        return "Not allowed characters: \\, /, |, :, *, ?, \", <, >";
      return null;
    },});
    if (!source_list)
      throw new Error('Canceled by user. No source filter name provided');


    const data: source.IQualifiedSource[] = [{ "source-lib": '.*', "source-file": '.*', 'source-member': '.*' }];

    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, `${source_list}.json`), JSON.stringify(data, undefined, 2));

    return `${source_list}.json`;
  }



  public register(context: vscode.ExtensionContext): any {
    // setup
    const options = {
      treeDataProvider: this,
      showCollapseAll: true
    };

    // build
    vscode.window.registerTreeDataProvider('obi.source-filter', this);

    // create
    const tree = vscode.window.createTreeView('obi.source-filter', options);

    vscode.commands.registerCommand('obi.source-filter.update', () => {
      this.refresh();
    });

    vscode.commands.registerCommand('obi.source-filter.add', () => {
      this.add_new_source_filter().then((source_list: string|undefined) => {
        this.refresh();
        if (source_list)
          SourceListConfig.render(context, source_list);
      });
    });

    vscode.commands.registerCommand('obi.source-filter.show-view', async (item: SourceListItem) => {
      SourceList.render(context.extensionUri, Workspace.get_workspace_uri(), item.source_list);
    });

    vscode.commands.registerCommand('obi.source-filter.edit-config', async (item: SourceListItem) => {
      SourceListConfig.render(context, item.source_list);
    });

    vscode.commands.registerCommand('obi.source-filter.delete-config', async (item: SourceListItem) => {

      if (SourceListConfig.currentPanel && SourceListConfig.source_list_file == item.source_list)
        SourceListConfig.currentPanel.dispose();
      fs.rmSync(path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, item.source_list));
      this.refresh();
    });


    // setup: events
    tree.onDidChangeSelection(e => {
      logger.info(`onDidChangeSelection: ${e}`); // breakpoint here for debug
      if (e.selection.length == 0)
        return;
      logger.info(e); // breakpoint here for debug
    });
    tree.onDidCollapseElement(e => {
      logger.info(`Collapse: ${e}`); // breakpoint here for debug
    });
    tree.onDidChangeVisibility(e => {
      logger.info(`ChangeVisibility: ${e}`); // breakpoint here for debug
    });
    tree.onDidExpandElement(e => {
      logger.info(`Expand: ${e}`); // breakpoint here for debug
    });


    // subscribe
    context.subscriptions.push(tree);
  }



  private static get_values_by_key(source_list: source.IQualifiedSource[], key: string, lib?: string, file?: string): {}[] {

    let result: {}[] = [];
    let item: {} = {};

    for (let i = 0; i < source_list.length; i++) {
      const element = source_list[i];
      const value = element[key];
      item = {};
      item[key] = value;
      if (result.some(e => e[key] === value) || lib && lib != element['source-lib'] || file && file != element['source-file'])
        continue;

      if (key == 'source-member')
        item['description'] = element.description;

      item[key] = element[key];
      result.push(item);
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
    src_lib?: string | undefined,
    src_file?: string | undefined,
    src_member?: string | undefined
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

    if (list_level == 'source-member') {
      member_path = path.join(AppConfig.get_app_confg().general['source-dir']||'src', this.src_lib || '', this.src_file || '', this.src_member || '');
      if (!DirTool.file_exists(path.join(ws, member_path)))
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
      arguments: [
        DirTool.get_file_URI(member_path)
      ]
    }
  }

}