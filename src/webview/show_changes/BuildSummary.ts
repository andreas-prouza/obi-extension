import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { DirTool } from '../../utilities/DirTool';
import { Constants } from '../../Constants';
import { OBITools } from '../../utilities/OBITools';
import path from 'path';
import { LogOutput } from './LogOutput';
import { AppConfig } from '../controller/AppConfig';
import { Workspace } from '../../utilities/Workspace';
import { logger } from '../../utilities/Logger';
import { OBICommands } from '../../obi/OBICommands';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');


interface Compile_list {
  level: string,
  source_list: [
    {
      source: string,
    }
  ]
}


export class BuildSummary {

  public static currentPanel: BuildSummary | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private static _extensionUri: Uri;


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
  public static render(extensionUri: Uri, workspaceUri: Uri|undefined) {

    logger.info('Render BuildSummary');
    BuildSummary._extensionUri = extensionUri;

    if (BuildSummary.currentPanel) {
      // If the webview panel already exists reveal it
      BuildSummary.currentPanel._panel.reveal(ViewColumn.One);
      return;
    }


    if (!workspaceUri){
      vscode.window.showErrorMessage("No workspace opened");
      return
    }

    const config = AppConfig.get_app_confg();

    // If a webview panel does not already exist create and show a new one
    const panel = BuildSummary.createNewPanel(extensionUri);

    panel.webview.html = BuildSummary.generate_html(extensionUri, panel.webview);
    //panel.webview.html = index_html.html;

    panel.webview.onDidReceiveMessage(
      (message: any) => {
        const command: string|undefined = message.command;

        switch (command) {
          case "hello":
            vscode.window.showInformationMessage(message.text);
            return;

          case "show_log":
            LogOutput.render(workspaceUri, message.type, message.level, message.source, message.cmd_index);
            return;

          case "run_build":
            OBICommands.rerun_build();
        }
      }
    );

    BuildSummary.currentPanel = new BuildSummary(panel, extensionUri);
  
  }



  private static generate_html(extensionUri: Uri, webview: Webview): string {

    const ws: Uri = Workspace.get_workspace_uri();
    const config = AppConfig.get_app_confg();

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);

    let compile_list: {}|undefined = OBITools.get_compile_list(ws);
    for (let level_item of (compile_list['compiles'] as any) ) {
      for (let source of level_item['sources']) {
        source['file'] = DirTool.get_encoded_file_URI(path.join(config.general['source-dir'], source['source']));
      }
    }


    const html = nunjucks.render('show_changes/index.html', 
      {
        global_stuff: OBITools.get_global_stuff(webview, extensionUri),
        main_java_script: getUri(webview, extensionUri, ["out", "show_changes.js"]),
        //filex: encodeURIComponent(JSON.stringify(fileUri)),
        object_list: BuildSummary.get_object_list(ws),
        compile_list: compile_list,
        compile_file: DirTool.get_encoded_file_URI(config.general['compile-list']),
        log_file: DirTool.get_encoded_file_URI(Constants.OBI_LOG_FILE),
        run_build: !OBITools.is_compile_list_completed(ws)
      }
    );

    return html;

  }




  public static async update(): Promise<void> {

    const panel = BuildSummary.currentPanel;
    
    if (!panel)
      return;

    panel._panel.webview.html = BuildSummary.generate_html(BuildSummary._extensionUri, BuildSummary.currentPanel?._panel.webview);
    
  }



  private static get_object_list(workspaceUri: Uri): {}|undefined {

    const changed_object_list = path.join(Workspace.get_workspace(), Constants.CHANGED_OBJECT_LIST);
    const dependend_object_list = path.join(Workspace.get_workspace(), Constants.DEPENDEND_OBJECT_LIST);

    if (!DirTool.file_exists(changed_object_list) || !DirTool.file_exists(dependend_object_list)) {
      logger.info(`${changed_object_list}: ${DirTool.file_exists(changed_object_list)}`);
      logger.info(`${dependend_object_list}: ${DirTool.file_exists(dependend_object_list)}`);
      return undefined;
    }
      
    const fs = require("fs");
    let compile_list = fs.readFileSync(changed_object_list);
    // Converting to JSON 
    compile_list = JSON.parse(compile_list);

    let dependend_sources = fs.readFileSync(dependend_object_list);
    // Converting to JSON 
    dependend_sources = JSON.parse(dependend_sources);

    for (let index = 0; index < compile_list['new-objects'].length; index++) {
      compile_list['new-objects'][index] = {source: compile_list['new-objects'][index], file: DirTool.get_encoded_source_URI(workspaceUri, compile_list['new-objects'][index])};
    }
    for (let index = 0; index < compile_list['changed-sources'].length; index++) {
      compile_list['changed-sources'][index] = {source: compile_list['changed-sources'][index], file: DirTool.get_encoded_source_URI(workspaceUri, compile_list['changed-sources'][index])};
    }
    for (let index = 0; index < dependend_sources.length; index++) {
      dependend_sources[index] = {source: dependend_sources[index], file: DirTool.get_encoded_source_URI(workspaceUri, dependend_sources[index])};
    }

    logger.info(`compile_list['new-objects']: ${compile_list['new-objects'].length}`);
    logger.info(`compile_list['changed-sources']: ${compile_list['changed-sources'].length}`);

    return {
      new_sources : compile_list['new-objects'], 
      changed_sources: compile_list['changed-sources'], 
      dependend_sources: dependend_sources
    }
  }




  private static createNewPanel(extensionUri : Uri) {
    return window.createWebviewPanel(
      'show_changes', // Identifies the type of the webview. Used internally
      'Show changes', // Title of the panel displayed to the user
      // The editor column the panel should be displayed in
      ViewColumn.One,
      // Extra panel configurations
      {
        // Enable JavaScript in the webview
        enableScripts: true,
        enableCommandUris: true,
        enableFindWidget: true,
        // Restrict the webview to only load resources from the `out` directory
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out"),
          vscode.Uri.joinPath(extensionUri, "asserts")
        ],
        retainContextWhenHidden: true
      }
    );
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    BuildSummary.currentPanel = undefined;

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