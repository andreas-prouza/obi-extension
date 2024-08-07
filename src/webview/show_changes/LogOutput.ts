import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import { Constants } from '../../Constants';
import { OBITools } from '../../utilities/OBITools';
import path from 'path';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');



export class LogOutput {

  public static currentPanel: LogOutput | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];


  /**
   * The ComponentGalleryPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: WebviewPanel) {
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
  public static render(workspaceUri: Uri, log_type: string, level: number, source: string, cmd_index: number) {
    if (LogOutput.currentPanel) {
      // If the webview panel already exists reveal it
      LogOutput.currentPanel.dispose();
      //LogOutput.currentPanel._panel.reveal(ViewColumn.One);
      //return;
    }

    const config = OBITools.get_obi_app_config();

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(log_type);

    const log_content = LogOutput.get_log_content(workspaceUri, log_type, level, source, cmd_index);

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render('show_changes/show_log.html', 
      {
        log_type: log_type,
        source: source,
        content: log_content
      }
    );
    panel.webview.html = html;

    LogOutput.currentPanel = new LogOutput(panel);
  
  }



  private static createNewPanel(log_type: string) {
    return window.createWebviewPanel(
      'show_log', // Identifies the type of the webview. Used internally
      log_type, // Title of the panel displayed to the user
      // The editor column the panel should be displayed in
      ViewColumn.One,
      // Extra panel configurations
      {
      }
    );
  }





  private static get_log_content(workspaceUri: Uri, log_type: string, level: number, source: string, cmd_index: number): string {

    console.log("Read compile list");
    const fs = require("fs"); 
    
    const config = OBITools.get_obi_app_config();
    let compile_list = fs.readFileSync(path.join(workspaceUri.fsPath, config['general']['compile-list']));
    // Converting to JSON 
    compile_list = JSON.parse(compile_list);

    for (const level_item of compile_list) {

      const i_level = level_item['level'];
      const i_sources = level_item['sources'];

      if (level != i_level)
        continue;

      for (let i_source of i_sources) {

        if (i_source['source'] != source)
          continue;

        return i_source['cmds'][cmd_index][log_type];

      }
      
    }

    return ''
  }
  

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    LogOutput.currentPanel = undefined;

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