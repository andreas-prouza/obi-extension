import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import path from 'path';
import { Constants } from '../../Constants';
import { OBITools } from '../../utilities/OBITools';
import { AppConfig } from '../controller/AppConfig';
import { Workspace } from '../../utilities/Workspace';
import * as source from '../../obi/Source';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');






export class SourceList {

  public static currentPanel: SourceList | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];


  /**
   * The ComponentGalleryPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: WebviewPanel, extensionUri: Uri) {
    this._panel = panel;

    // Set an event listener to listen for when the panel is disposed (i.e. when the user closes
    // the panel or when the panel is closed programmatically)
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

  }


  /**
   * Renders the current webview panel if it exists otherwise a new webview panel
   * will be created and displayed.
   *
   * @param extensionUri The URI of the directory containing the extension.
   */
  public static async render(extensionUri: Uri, workspaceUri: Uri, source_list_path: string) {
    if (SourceList.currentPanel) {
      // If the webview panel already exists reveal it
      SourceList.currentPanel._panel.reveal(ViewColumn.One);
      return;
    }

    const config = AppConfig.get_app_confg();
    const source_dir = path.join(Workspace.get_workspace(), config.general['source-dir'] || 'src');

    const sources = await DirTool.get_all_files_in_dir2(
      source_dir,
      '.',
      config.general['supported-object-types'] || ['pgm', 'file', 'srvpgm']
    );
    
    const source_filters: source.IQualifiedSource[] = DirTool.get_json(path.join(workspaceUri.fsPath, Constants.SOURCE_LIST_FOLDER_NAME, source_list_path));

    const filtered_sources = SourceList.get_filtered_sources(sources, source_filters);
    const filtered_sources_extended = SourceList.get_extended_source_infos(filtered_sources);

    //for (let index = 0; index < source_filters.length; index++) {
    //  source_filters[index]['path'] = DirTool.get_encoded_source_URI(workspaceUri, path.join(source_filters[index]['path']);
    //}

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(extensionUri);

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render('source_list/index.html', 
      {
        global_stuff: OBITools.get_global_stuff(panel.webview, extensionUri),
        main_java_script: getUri(panel.webview, extensionUri, ["out", "webview.js"]),
        source_list: filtered_sources_extended,
        source_list_file : source_list_path
        //filex: encodeURIComponent(JSON.stringify(fileUri)),
        //object_list: this.get_object_list(workspaceUri),
        //compile_list: this.get_compile_list(workspaceUri)
      }
    );
    panel.webview.html = html;
    //panel.webview.html = index_html.html;

    panel.webview.onDidReceiveMessage(
      (message: any) => {
        const command = message.command;
        const text = message.text;

        switch (command) {
          case "hello":
            vscode.window.showInformationMessage(text);
            return;
        }
      }
    );

    SourceList.currentPanel = new SourceList(panel, extensionUri);
  
  }



  private static get_extended_source_infos(sources: source.IQualifiedSource[]|undefined): source.IQualifiedSource[] | undefined {

    if (!sources)
      return;

    let new_list: source.IQualifiedSource[] = [];

    const config: AppConfig = AppConfig.get_app_confg();
    const source_infos: source.IQualifiedSource[] = DirTool.get_json(path.join(Workspace.get_workspace(), config.general['source-infos'] || '.obi/etc/source-infos.json'));

    for (let source_info of source_infos) {

      for (const source of sources) {
        
        if (source['source-member'] == source_info['source-member'] && source['source-file'] == source_info['source-file'] && source['source-lib'] == source_info['source-lib']) {
          source_info.description = source_info.description;
          new_list.push(source_info);
          break;
        }
      }
    }

    return new_list;
  }




  private static get_filtered_sources(sources: string[]|undefined, source_filters: source.IQualifiedSource[]): source.IQualifiedSource[] | undefined {

    if (!sources)
      return;

    let filtered_sources: source.IQualifiedSource[] = [];

    for (let source of sources) {
      
      source = source.replaceAll('\\', '/');
      const source_arr: string[] = source.split('/').reverse();
      const src_mbr = source_arr[0];
      const src_file = source_arr[1];
      const src_lib = source_arr[2];

      for (const source_filter of source_filters) {
        
        const re_lib = new RegExp(source_filter['source-lib']);
        const re_file = new RegExp(source_filter['source-file']);
        const re_mbr = new RegExp(source_filter['source-member']);

        if (src_lib.match(re_lib) && src_file.match(re_file) && src_mbr.match(re_mbr))
          filtered_sources.push({"source-lib": src_lib, "source-file": src_file, "source-member": src_mbr});
      }
    }

    return filtered_sources;
  }



  private static createNewPanel(extensionUri : Uri) {
    return window.createWebviewPanel(
      'source_list', // Identifies the type of the webview. Used internally
      'Source list', // Title of the panel displayed to the user
      // The editor column the panel should be displayed in
      ViewColumn.One,
      // Extra panel configurations
      {
        // Enable JavaScript in the webview
        enableScripts: true,
        enableCommandUris: true,
        // Restrict the webview to only load resources from the `out` directory
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "asserts")
        ],
      }
    );
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    SourceList.currentPanel = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();

    // Dispose of all disposables (i.e. commands) associated with the current webview panel
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

}