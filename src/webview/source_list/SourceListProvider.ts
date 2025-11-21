import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirTool } from '../../utilities/DirTool';
import { SourceList } from './SourceList';
import { Constants } from '../../Constants';
import { logger } from '../../utilities/Logger';
import * as source from '../../obi/Source';
import { AppConfig } from '../controller/AppConfig';
import { Workspace } from '../../utilities/Workspace';
import { SourceListConfig } from './SourceListConfig';
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
  private items: SourceListItem[] = [];


  constructor(workspaceRoot: string | undefined) {
    if (workspaceRoot !== undefined)
      this.workspaceRoot = workspaceRoot
    SourceListProvider.source_list_provider = this;
  }



  getTreeItem(element: SourceListItem): vscode.TreeItem {

    if (element.list_level != 'source-member')
      return element;

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

      const new_child = new SourceListItem(
        element.replaceAll('.json', ''),
        '',
        vscode.TreeItemCollapsibleState.Collapsed,
        element,
        'source-list'
      )

      this.items.push(new_child);
      child.push(new_child);
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
        if (entry['source-member'] == '') {
          continue;
        }
        description = entry['description'] || undefined;
        member = entry[level];
      }

      item = new SourceListItem(entry[level], description, collapsibleState, element.source_list, level, lib, file, member)
      this.items.push(item);
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


    const data: source.IQualifiedSource[] = [{ "source-lib": '*', "source-file": '*', 'source-member': '*', "use-regex": false, "show-empty-folders": true }];

    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, `${source_list}.json`), JSON.stringify(data, undefined, 2));

    return `${source_list}.json`;
  }


  // obi.source-filter.add-source-file
  async add_new_source_file(item: SourceListItem): Promise<string|undefined> {

    const app_config = AppConfig.get_app_config();

    const source_file_folder: string | undefined = await vscode.window.showInputBox({ title: `Name of source folder for ${item.src_lib}`, placeHolder: "qrpglesrc", validateInput(value) {
      if (value.replace(/[\/|\\:*?"<>]/g, " ") != value)
        return "Not allowed characters: \\, /, |, :, *, ?, \", <, >";
      return null;
    },});
    if (!source_file_folder || !item.label)
      throw new Error('Canceled by user. No source folder name provided');

    const src_folder = app_config.general['source-dir']||'src';
    const new_folder = path.join(Workspace.get_workspace(), src_folder, item.label, source_file_folder);

    // Create the new directory if it doesn't exist
    if (!DirTool.dir_exists(new_folder)) {
      fs.mkdirSync(new_folder, { recursive: true });
    }
    return source_file_folder;

  }



  // obi.source-filter.add-source-member
  async add_new_source_member(item: SourceListItem): Promise<string|undefined> {

    const app_config = AppConfig.get_app_config();

    const source_member: string | undefined = await vscode.window.showInputBox(
      { title: `Name of source member for ${item.src_lib}/${item.label}`, 
        placeHolder: "source member name", 
        validateInput(value) {
          if (value.replace(/[\/|\\:*?"<>]/g, " ") != value)
            return "Not allowed characters: \\, /, |, :, *, ?, \", <, >";
          const ext = path.extname(value).replace('.', '').toLowerCase();
          if (app_config.general['supported-object-types'] && !app_config.general['supported-object-types'].includes(ext)) {
            return `Extension ".${ext}" is not supported (supported: ${app_config.general['supported-object-types'].join(', ')})`;
          }
          return null;
        },
      });
    if (!source_member || !item.src_lib)
      throw new Error('Canceled by user. No source member name provided');

    const src_folder = app_config.general['source-dir']||'src';
    const new_file = path.join(Workspace.get_workspace(), src_folder, item.src_lib, item.label, source_member);
    DirTool.write_file(new_file, '');
    vscode.window.showTextDocument(vscode.Uri.file(new_file));

    return source_member;
  }



  // obi.source-filter.add-source-file
  async change_source_description(item: SourceListItem | vscode.Uri): Promise<void> {

    const config: AppConfig = AppConfig.get_app_config();
    let lib: String = '';
    let file: String = '';
    let member: String = '';
    let source_path: string = '';
    let description: string = '';

    const src_dir: string = config.general['source-dir'] || 'src';

    logger.debug(`Changing source description for item: ${JSON.stringify(item, null, 2)}`);

    if (item instanceof SourceListItem) {
      if (!item.member_path_obi || !item.src_member) {
        throw new Error('Source member information missing');
      }
      source_path = item.member_path_obi;
      member = item.src_member;
      description = typeof item.description === 'string' ? item.description : '';
    }

    if (item instanceof vscode.Uri) {
      logger.debug(`Changing source description for URI: ${item.fsPath}`);
      
      source_path = OBITools.convert_local_filepath_2_obi_filepath(item.fsPath, true);

      const match = source_path.match(/^([^\/]+)\/([^\/]+)\/(.+)$/);
      if (!match) {
        throw new Error(`Source path ${source_path} is not valid`);
      }
      lib = match[1];
      file = match[2];
      source_path = `${lib}/${file}`;
      member = match[3];
      logger.debug(`Changing description for source member: lib='${lib}', file='${file}', member='${member}'`);

      const source_infos: source.ISourceInfos = await OBITools.get_source_infos();
      if (source_infos[`${source_path}/${member}`]) {
        description = typeof source_infos[`${source_path}/${member}`].description === 'string' ? source_infos[`${source_path}/${member}`].description : '';
      }
    }

    const new_description: string | undefined = await vscode.window.showInputBox({ 
      title: `Description of source member for ${source_path}/${member}`, 
      placeHolder: "Source description", 
      value: description,
    });
    if (!new_description) {
      throw new Error('Canceled by user. No source description provided');
    }

    OBITools.update_source_infos(source_path, member, new_description);

    return;
  }


  // obi.source-filter.add-source-file
  async rename_source_member(item: SourceListItem | vscode.Uri): Promise<void> {
    
    const app_config = AppConfig.get_app_config();

    if (item instanceof SourceListItem) {
      if (!item.src_lib || !item.src_file || !item.src_member) {
        throw new Error('Source member information missing');
      }
    }

    const new_name: string | undefined = await vscode.window.showInputBox({ 
      title: `Rename source member for ${item.src_member}`,
      value: item.src_member,
      validateInput(value) {
          if (value.replace(/[\/|\\:*?"<>]/g, " ") != value)
            return "Not allowed characters: \\, /, |, :, *, ?, \", <, >";
          const ext = path.extname(value).replace('.', '').toLowerCase();
          if (app_config.general['supported-object-types'] && !app_config.general['supported-object-types'].includes(ext)) {
            return `Extension ".${ext}" is not supported (supported: ${app_config.general['supported-object-types'].join(', ')})`;
          }
          return null;
        },
    });
    if (!new_name) {
      throw new Error('Canceled by user. No source name provided');
    }

    const from_path = path.join(Workspace.get_workspace(), item.member_path, item.src_member);
    const to_path = path.join(Workspace.get_workspace(),item.member_path, new_name)
    fs.renameSync(from_path, to_path);

    const source_infos: source.ISourceInfos = await OBITools.get_source_infos();
    if (source_infos[`${item.member_path_obi}/${item.src_member}`]) {
        const description: string = typeof source_infos[`${item.member_path_obi}/${item.src_member}`].description === 'string' ? source_infos[`${item.member_path_obi}/${item.src_member}`].description : '';
        OBITools.update_source_infos(item.member_path_obi, new_name, description);
    }

    return;
  }


  // obi.source-filter.add-source-file
  async delete_source_member(item: SourceListItem | vscode.Uri): Promise<void> {
    
    const app_config = AppConfig.get_app_config();

    if (item instanceof SourceListItem) {
      if (!item.src_lib || !item.src_file || !item.src_member) {
        throw new Error('Source member information missing');
      }
    }

    const from_path = path.join(Workspace.get_workspace(), item.member_path, item.src_member);
    fs.unlinkSync(from_path);

    return;
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
    
    vscode.commands.registerCommand('obi.source-filter.add-source-member', async (item: SourceListItem) => {
      const source_member = await this.add_new_source_member(item);
      this.refresh();
      //Why ??? if (source_member)
      //  SourceListConfig.render(context, source_member);
    });

    vscode.commands.registerCommand('obi.source-filter.add-source-file', async (item: SourceListItem) => {
      const source_file = await this.add_new_source_file(item);
      this.refresh();
    });

    
    vscode.commands.registerCommand('obi.source-filter.change-source-description', async (item: SourceListItem | vscode.Uri) => {
      await this.change_source_description(item);
      this.refresh();
    });
    
    vscode.commands.registerCommand('obi.source-filter.rename-source-member', async (item: SourceListItem) => {
      await this.rename_source_member(item);
      this.refresh();
    });
    
    vscode.commands.registerCommand('obi.source-filter.delete-source-member', async (item: SourceListItem) => {
      await this.delete_source_member(item);
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



export class SourceListItem extends vscode.TreeItem {

  public readonly label: string;
  public readonly collapsibleState: vscode.TreeItemCollapsibleState;
  public readonly source_list: string;
  public readonly file_path: string | undefined;
  public readonly src_lib: string | undefined;
  public readonly src_file: string | undefined;
  public readonly src_member: string | undefined;
  public readonly list_level: string;
  public readonly member_path: string | undefined;
  public readonly member_path_obi: string | undefined;
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

    switch (list_level) {
      case 'source-lib':
      this.tooltip = `${source_list}: ${label}`;
      break;
      case 'source-file':
      this.tooltip = `${source_list}: ${src_lib}/${label}`;
      break;
      case 'source-member':
      this.tooltip = `${source_list}: ${src_lib}/${src_file}(${src_member})`;
      break;
    }

    if (typeof description !== 'undefined' && description?.length > 0)
      this.tooltip += ` - ${description}`;

    this.description = description;
    this.source_list = source_list;
    this.list_level = list_level;
    let member_file_path = '';
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
      this.member_path_obi = OBITools.convert_local_filepath_2_obi_filepath(path.join(this.src_lib || '', this.src_file || ''));
      this.member_path = path.join(AppConfig.get_app_config().general['source-dir']||'src', this.member_path_obi);
      member_file_path = path.join(this.member_path, this.src_member || '');
      if (!DirTool.file_exists(path.join(ws, member_file_path)))
        icon = 'error.svg';
    }

    this.iconPath = {
      light: path.join(__filename, '..', '..', '..', '..', 'asserts', 'img', 'light', icon),
      dark: path.join(__filename, '..', '..', '..', '..', 'asserts', 'img', 'dark', icon)
    };

    if (list_level != 'source-member')
      return;

    this.contextValue = 'obi-source';

    this.command = {
      command: 'vscode.open',
      title: 'Open source member',
      arguments: [
        DirTool.get_file_URI(member_file_path)
      ]
    }
  }

}