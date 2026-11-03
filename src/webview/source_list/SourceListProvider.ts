import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DirTool } from '../../extension/utilities/DirTool';
import { SourceList } from './SourceList';
import { Constants } from '../../shared/Constants';
import { logger } from '../../extension/utilities/Logger';
import * as source from '../../shared/Source';
import { AppConfig, SourceConfigList } from '../../extension/config/AppConfig';
import { Workspace } from '../../extension/utilities/Workspace';
import { SourceListConfig } from './SourceListConfig';
import { OBITools } from '../../extension/utilities/OBITools';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';
import { DependencyList } from '../../extension/obi/Dependency';
import { register_command } from '../../extension/utilities/Registration';


export class SourceListProvider implements vscode.TreeDataProvider<SourceListItem> {

  public static source_list_provider: SourceListProvider;
  private workspaceRoot: string = '';
  private _onDidChangeTreeData: vscode.EventEmitter<SourceListItem | undefined | null | void> = new vscode.EventEmitter<SourceListItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SourceListItem | undefined | null | void> = this._onDidChangeTreeData.event;
  /** Tree items by key (see item_key), for getParent and revealing the active editor; rebuilt on root refresh */
  private items = new Map<string, SourceListItem>();
  /** First member item per 'lib/file/member' */
  private member_items = new Map<string, SourceListItem>();


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



  async getChildren(element?: SourceListItem): Promise<SourceListItem[]> {
    if (!this.workspaceRoot) {
      return [];
    }

    if (element) {
      return this.get_child_elements(element);
    }

    this.items.clear();
    this.member_items.clear();
    const source_list_path = path.join(this.workspaceRoot, Constants.SOURCE_FILTER_FOLDER_NAME);
    if (!DirTool.dir_exists(source_list_path)) {
      return [];
    }

    let child = [];

    const source_list = DirTool.list_dir(source_list_path);
    for (let index = 0; index < source_list.length; index++) {
      const element = source_list[index];

      const file = path.join(this.workspaceRoot, Constants.SOURCE_FILTER_FOLDER_NAME, element);

      if (!DirTool.is_file(file))
        continue;

      // The filter is evaluated when the node is expanded (get_child_elements)
      const new_child = new SourceListItem(
        element.replaceAll('.json', ''),
        '',
        vscode.TreeItemCollapsibleState.Collapsed,
        element,
        'source-list'
      )

      this.add_item(new_child);
      child.push(new_child);
    }

    return child;

  }


  async get_child_elements(element: SourceListItem): Promise<any> {

    let content_list: any[] = [];
    let item: SourceListItem;
    let level: 'source-lib' | 'source-file' | 'source-member' = 'source-lib';
    const results: SourceListItem[] = [];
    let description: string | undefined = undefined;
    let lib: string | undefined;
    let file: string | undefined;
    let member: string | undefined;

    let collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    const sources: source.IQualifiedSource[] = await LocalSourceList.get_filtered_sources_with_details(element.source_list) ?? [];

    let label: string = '';
    if (!(typeof element.label === 'string')) {
      label = element.label?.label || '';
    }
    else {
      label = element.label;
    }

    if (element.list_level == 'source-list') {
      level = 'source-lib';
    }
    if (element.list_level == 'source-lib') {
      level = 'source-file';
      lib = label;
      collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
    if (element.list_level == 'source-file') {
      level = 'source-member';
      lib = element.src_lib;
      file = label;
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
      this.add_item(item);
      results.push(item);
    }
    return results;

  }


  /** filter|level|lib|file|member; the label is the value of its own level */
  private static item_key(source_list: string, level: string, lib?: string, file?: string, member?: string): string {
    return [source_list, level, lib ?? '', file ?? '', member ?? ''].join('|');
  }


  private static key_of(item: SourceListItem): string {
    const label = typeof item.label === 'string' ? item.label : item.label?.label ?? '';
    switch (item.list_level) {
      case 'source-lib': return SourceListProvider.item_key(item.source_list, item.list_level, label);
      case 'source-file': return SourceListProvider.item_key(item.source_list, item.list_level, item.src_lib, label);
      case 'source-member': return SourceListProvider.item_key(item.source_list, item.list_level, item.src_lib, item.src_file, label);
      default: return SourceListProvider.item_key(item.source_list, item.list_level);
    }
  }


  private add_item(item: SourceListItem): void {
    this.items.set(SourceListProvider.key_of(item), item);
    const member = `${item.src_lib}/${item.src_file}/${item.src_member}`;
    if (item.list_level === 'source-member' && !this.member_items.has(member))
      this.member_items.set(member, item);
  }


  getParent(element: SourceListItem): vscode.ProviderResult<SourceListItem> {
    switch (element.list_level) {
      case 'source-lib': return this.items.get(SourceListProvider.item_key(element.source_list, 'source-list'));
      case 'source-file': return this.items.get(SourceListProvider.item_key(element.source_list, 'source-lib', element.src_lib));
      case 'source-member': return this.items.get(SourceListProvider.item_key(element.source_list, 'source-file', element.src_lib, element.src_file));
      default: return undefined;
    }
  }


  refresh(): void {
    this._onDidChangeTreeData.fire();
  }



  public static get_instance(): SourceListProvider {  
    return SourceListProvider.source_list_provider;
  }


  async add_new_source_filter(): Promise<string|undefined> {

    const source_list: string | undefined = await vscode.window.showInputBox({ title: vscode.l10n.t('Name of source filter'), placeHolder: vscode.l10n.t('source filter name'), validateInput(value) {
      if (value.replace(/[\/|\\:*?"<>]/g, " ") != value)
        return vscode.l10n.t('Not allowed characters: {0}', '\\, /, |, :, *, ?, ", <, >');
      return null;
    },});
    if (!source_list)
      return undefined;   // cancelled


    const data: source.IQualifiedSource[] = [{ "source-lib": '*', "source-file": '*', 'source-member': '*', "use-regex": false, "show-empty-folders": true }];

    DirTool.write_file(path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, `${source_list}.json`), JSON.stringify(data, undefined, 2));

    return `${source_list}.json`;
  }


  // obi.source-filter.add-source-file
  async add_new_source_file(item: SourceListItem): Promise<string|undefined> {

    const app_config = AppConfig.get_app_config();

    const source_file_folder: string | undefined = await vscode.window.showInputBox({ title: vscode.l10n.t('Name of source folder for {0}', item.src_lib ?? ''), placeHolder: "qrpglesrc", validateInput(value) {
      if (value.replace(/[\/|\\:*?"<>]/g, " ") != value)
        return vscode.l10n.t('Not allowed characters: {0}', '\\, /, |, :, *, ?, ", <, >');
      return null;
    },});
    if (!source_file_folder || !item.label)
      return undefined;   // cancelled

    let label: string = '';
    if (!(typeof item.label === 'string')) {
      label = item.label?.label || '';
    }
    else {
      label = item.label;
    }

    const new_folder = path.join(DirTool.get_local_source_dir(), label, source_file_folder);

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
      { title: vscode.l10n.t('Name of source member for {0}', `${item.src_lib}/${item.label}`),
        placeHolder: vscode.l10n.t('source member name'),
        validateInput(value) {
          if (value.replace(/[\/|\\:*?"<>]/g, " ") != value)
            return vscode.l10n.t('Not allowed characters: {0}', '\\, /, |, :, *, ?, ", <, >');
          const ext = path.extname(value).replace('.', '').toLowerCase();
          if (app_config.general['supported-object-types'] && !app_config.general['supported-object-types'].includes(ext)) {
            return vscode.l10n.t('Extension ".{0}" is not supported (supported: {1})', ext, app_config.general['supported-object-types'].join(', '));
          }
          return null;
        },
      });
    if (!source_member || !item.src_lib)
      return undefined;   // cancelled

    let label: string = '';
    if (!(typeof item.label === 'string')) {
      label = item.label?.label || '';
    }
    else {
      label = item.label;
    }

    const new_file = path.join(DirTool.get_local_source_dir(), item.src_lib, label, source_member);
    DirTool.write_file(new_file, '');
    vscode.window.showTextDocument(vscode.Uri.file(new_file));

    return source_member;
  }



  // obi.source-filter.add-source-file
  async change_source_description(item: SourceListItem | vscode.Uri): Promise<void> {

    const config: AppConfig = AppConfig.get_app_config();
    let lib: string = '';
    let file: string = '';
    let member: string = '';
    let source_path: string = '';
    let description: string|undefined = '';

    if (item instanceof SourceListItem) {
      if (!item.member_path_obi || !item.src_member) {
        throw new Error(vscode.l10n.t('Source member information missing'));
      }
      source_path = item.member_path_obi;
      member = item.src_member;
      description = typeof item.description === 'string' ? item.description : '';
    }

    if (item instanceof vscode.Uri) {
      logger.debug(`Changing source description for URI: ${item.fsPath}`);
      
      const obi_source = DirTool.to_obi_source(item.fsPath);
      if (!obi_source) {
        throw new Error(DirTool.not_in_source_dir_message(item.fsPath));
      }

      const match = obi_source.match(/^([^\/]+)\/([^\/]+)\/(.+)$/);
      if (!match) {
        throw new Error(vscode.l10n.t('Source path {0} is not valid', source_path));
      }
      lib = match[1];
      file = match[2];
      source_path = `${lib}/${file}`;
      member = match[3];
      logger.debug(`Changing description for source member: lib='${lib}', file='${file}', member='${member}'`);

      const source_infos: source.ISourceInfos = await LocalSourceList.get_source_info_list();
      if (source_infos[`${source_path}/${member}`]) {
        description = typeof source_infos[`${source_path}/${member}`].description === 'string' ? source_infos[`${source_path}/${member}`].description : '';
      }
    }

    const new_description: string | undefined = await vscode.window.showInputBox({ 
      title: vscode.l10n.t('Description of source member {0}', `${source_path}/${member}`),
      placeHolder: vscode.l10n.t('Source description'),
      value: description,
    });
    if (new_description === undefined) {
      return;   // cancelled; an empty input removes the description
    }

    await LocalSourceList.update_source_infos(source_path, member, new_description);

    return;
  }


  // obi.source-filter.add-source-file
  async rename_source_member(item: SourceListItem): Promise<void> {
    
    const app_config = AppConfig.get_app_config();

    if (!item.member_path || !item.src_member) {
      throw new Error(vscode.l10n.t('Source member information missing'));
    }

    const new_name: string | undefined = await vscode.window.showInputBox({ 
      title: vscode.l10n.t('Rename source member {0}', item.src_member),
      value: item.src_member,
      validateInput(value) {
          if (value.replace(/[\/|\\:*?"<>]/g, " ") != value)
            return vscode.l10n.t('Not allowed characters: {0}', '\\, /, |, :, *, ?, ", <, >');
          const ext = path.extname(value).replace('.', '').toLowerCase();
          if (app_config.general['supported-object-types'] && !app_config.general['supported-object-types'].includes(ext)) {
            return vscode.l10n.t('Extension ".{0}" is not supported (supported: {1})', ext, app_config.general['supported-object-types'].join(', '));
          }
          return null;
        },
    });
    if (!new_name || new_name === item.src_member) {
      return;   // cancelled or unchanged
    }

    // Rename the source member file
    const from_path = path.join(Workspace.get_workspace(), item.member_path, item.src_member);
    const to_path = path.join(Workspace.get_workspace(),item.member_path, new_name)
    
    fs.renameSync(from_path, to_path);

    const old_source = `${item.member_path_obi}/${item.src_member}`;
    const new_source = `${item.member_path_obi}/${new_name}`;
    await SourceListProvider.sync_renamed_source_member(old_source, new_source);

    return;
  }


  public static async sync_renamed_source_member(old_source: string, new_source: string): Promise<void> {

    const old_source_normalized = old_source.replace(/\\/g, '/').replace(/^\/+/, '');
    const new_source_normalized = new_source.replace(/\\/g, '/').replace(/^\/+/, '');

    if (!old_source_normalized || !new_source_normalized || old_source_normalized === new_source_normalized) {
      return;
    }

    // Rename source-specific configuration key in source-config.toml if present.
    const cached: SourceConfigList | undefined = AppConfig.get_source_configs();
    if (cached && cached[old_source_normalized]) {
      const source_configs: SourceConfigList = { ...cached };
      source_configs[new_source_normalized] = source_configs[old_source_normalized];
      delete source_configs[old_source_normalized];
      DirTool.update_toml(path.join(Workspace.get_workspace(), Constants.OBI_SOURCE_CONFIG_FILE), source_configs);
    }

    // Keep dependency.json in sync with source rename.
    await DependencyList.rename_source(old_source_normalized, new_source_normalized);

    // Keep object-list.json (compiled-object-list) in sync with source rename.
    OBITools.rename_source_in_object_list(old_source_normalized, new_source_normalized);

    // Update source-infos entry.
    const source_infos: source.ISourceInfos = await LocalSourceList.get_source_info_list();
    if (source_infos[old_source_normalized]) {
      const description: string = typeof source_infos[old_source_normalized].description === 'string' ? source_infos[old_source_normalized].description : '';
      const old_parts = old_source_normalized.split('/');
      const new_parts = new_source_normalized.split('/');
      const old_member = old_parts.pop();
      const new_member = new_parts.pop();
      const old_member_path_obi = old_parts.join('/');
      const new_member_path_obi = new_parts.join('/');

      if (old_member && new_member) {
        LocalSourceList.update_source_infos(old_member_path_obi, old_member, undefined);
        LocalSourceList.update_source_infos(new_member_path_obi, new_member, description);
      }
    }
  }


  // obi.source-filter.add-source-file
  async delete_source_member(item: SourceListItem | vscode.Uri): Promise<void> {

    let from_path: string;

    if (item instanceof SourceListItem) {
      if (!item.member_path || !item.src_member) {
        throw new Error(vscode.l10n.t('Source member information missing'));
      }
      from_path = path.join(Workspace.get_workspace(), item.member_path, item.src_member);
    }
    else {
      from_path = item.fsPath;
    }
    
    fs.unlinkSync(from_path);

    return;
  }



  public register(context: vscode.ExtensionContext): any {
    // setup
    const options = {
      treeDataProvider: this,
      showCollapseAll: true
    };

    // create (createTreeView registers the data provider as well)
    const tree = vscode.window.createTreeView('obi.source-filter', options);
    context.subscriptions.push(tree, this._onDidChangeTreeData);

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        const filePath = DirTool.to_obi_source(editor.document.uri.fsPath);
        if (!filePath)
          return;

        const source_arr: string[] = filePath.split('/').reverse();
        const src_mbr = source_arr[0];
        const src_file = source_arr[1];
        const src_lib = source_arr[2];

        const item = this.member_items.get(`${src_lib}/${src_file}/${src_mbr}`);

        if (item) {
          tree.reveal(item, { select: true, focus: false, expand: true });
        }
      }
    }));

    register_command(context, 'obi.source-filter.update', () => {
      this.refresh();
    });

    register_command(context, 'obi.source-filter.add', () => {
      this.add_new_source_filter().then((source_list: string|undefined) => {
        this.refresh();
        if (source_list)
          SourceListConfig.render(context, source_list);
      });
    });
    
    register_command(context, 'obi.source-filter.show-view', async (item: SourceListItem) => {
      SourceList.render(context.extensionUri, Workspace.get_workspace_uri(), item.source_list);
    });
    
    register_command(context, 'obi.source-filter.edit-config', async (item: SourceListItem) => {
      SourceListConfig.render(context, item.source_list);
    });
    
    register_command(context, 'obi.source-filter.delete-config', async (item: SourceListItem) => {
      if (!item?.source_list)
        return;
      const delete_text = vscode.l10n.t('Delete');
      const name = item.source_list.replace(/\.json$/, '');
      if (await vscode.window.showWarningMessage(vscode.l10n.t('Delete the source filter \'{0}\'?', name), { modal: true }, delete_text) !== delete_text)
        return;

      if (SourceListConfig.currentPanel && SourceListConfig.source_list_file == item.source_list)
        SourceListConfig.currentPanel.dispose();
      fs.rmSync(path.join(Workspace.get_workspace(), Constants.SOURCE_FILTER_FOLDER_NAME, item.source_list));
      this.refresh();
    });
    
    register_command(context, 'obi.source-filter.add-source-member', async (item: SourceListItem) => {
      const source_member = await this.add_new_source_member(item);
      this.refresh();
      //Why ??? if (source_member)
      //  SourceListConfig.render(context, source_member);
    });

    register_command(context, 'obi.source-filter.add-source-file', async (item: SourceListItem) => {
      const source_file = await this.add_new_source_file(item);
      this.refresh();
    });

    
    register_command(context, 'obi.source-filter.change-source-description', async (item: SourceListItem | vscode.Uri) => {
      try {
        await this.change_source_description(item);
      }
      catch (e) {
        DirTool.show_save_error(e);
      }
      this.refresh();
    });

    register_command(context, 'obi.source-filter.rename-source-member', async (item: SourceListItem) => {
      try {
        await this.rename_source_member(item);
      }
      catch (e) {
        DirTool.show_save_error(e);
      }
      this.refresh();
    });
    
    register_command(context, 'obi.source-filter.delete-source-member', async (item: SourceListItem) => {
      await this.delete_source_member(item);
      this.refresh();
    });
    
    


  }



  private static get_values_by_key(source_list: source.IQualifiedSource[], key: 'source-lib' | 'source-file' | 'source-member', lib?: string, file?: string): any[] {

    let result: any[] = [];
    let item: any = {};
    const seen = new Set<unknown>();

    for (let i = 0; i < source_list.length; i++) {
      const element = source_list[i];
      const value = element[key];
      item = {};
      item[key] = value;
      // No item for the missing levels of an empty folder
      if (!value || seen.has(value) || lib && lib != element['source-lib'] || file && file != element['source-file'])
        continue;
      seen.add(value);

      if (key == 'source-member')
        item['description'] = element.description;

      item[key] = element[key];
      result.push(item);
    }

    return result;
  }

}



export class SourceListItem extends vscode.TreeItem {

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
    let missing = false;

    this.contextValue = list_level;

    this.src_lib = src_lib;
    this.src_file = src_file;
    this.src_member = src_member;

    const ws = Workspace.find_workspace_uri()?.fsPath ?? '';

    if (['source-member', 'source-list'].indexOf(list_level) == -1)
      return;

    if (list_level == 'source-member') {
      this.member_path_obi = `${this.src_lib || ''}/${this.src_file || ''}`;
      this.member_path = path.join(DirTool.get_local_source_dir_relative(), this.member_path_obi);
      member_file_path = path.join(this.member_path, this.src_member || '');
      missing = !DirTool.file_exists(path.join(ws, member_file_path));
    }

    // Native icons (product icon theme and theme colours)
    if (list_level == 'source-list')
      this.iconPath = new vscode.ThemeIcon('filter');
    else if (missing) {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
      this.tooltip = `${this.tooltip ?? ''} — ${vscode.l10n.t('File not found')}`;
    }
    else
      this.iconPath = new vscode.ThemeIcon('file-code');

    if (list_level != 'source-member')
      return;

    this.contextValue = 'obi-source';

    this.command = {
      command: 'vscode.open',
      title: vscode.l10n.t('Open source member'),
      arguments: [
        DirTool.get_file_URI(member_file_path)
      ]
    }
  }

}