import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import path from 'path';
import { Constants } from '../../Constants';
import { OBITools } from '../../utilities/OBITools';

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
  public static render(extensionUri: Uri, workspaceUri: Uri, source_list_path: string) {
    if (SourceList.currentPanel) {
      // If the webview panel already exists reveal it
      SourceList.currentPanel._panel.reveal(ViewColumn.One);
      return;
    }

    const sl = DirTool.get_json(path.join(workspaceUri.fsPath, Constants.SOURCE_LIST_FOLDER_NAME, source_list_path));

    for (let index = 0; index < sl.length; index++) {
      sl[index]['path'] = DirTool.get_encoded_source_URI(workspaceUri, sl[index]['path']);
    }

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(extensionUri);

    nunjucks.configure(Constants.HTML_TEMPLATE_DIR);
    const html = nunjucks.render('source_list/index.html', 
      {
        global_stuff: OBITools.get_global_stuff(panel.webview, extensionUri),
        source_list: sl,
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