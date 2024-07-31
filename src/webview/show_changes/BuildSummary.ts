import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');




export class BuildSummary {

  public static currentPanel: BuildSummary | undefined;
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
  public static render(extensionUri: Uri, workspaceUri: Uri) {
    if (BuildSummary.currentPanel) {
      // If the webview panel already exists reveal it
      BuildSummary.currentPanel._panel.reveal(ViewColumn.One);
      return;
    }

    // If a webview panel does not already exist create and show a new one
    const panel = this.createNewPanel(extensionUri);


    nunjucks.configure(`${__dirname}/../../../asserts`);
    const html = nunjucks.render('show_changes/index.html', 
      {
        global_stuff: this.get_global_stuff(panel.webview, extensionUri),
        //filex: encodeURIComponent(JSON.stringify(fileUri)),
        object_list: this.get_object_list(workspaceUri),
        compile_list: this.get_compile_list(workspaceUri)
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

    BuildSummary.currentPanel = new BuildSummary(panel, extensionUri);
  
  }



  private static get_object_list(workspaceUri: Uri) {

    console.log("Read compile list");
    const fs = require("fs"); 
    
    let compile_list = fs.readFileSync(`${workspaceUri.path}/tmp/changed-object-list.json`);
    // Converting to JSON 
    compile_list = JSON.parse(compile_list);

    let dependend_sources = fs.readFileSync(`${workspaceUri.path}/tmp/dependend-object-list.json`);
    // Converting to JSON 
    dependend_sources = JSON.parse(dependend_sources);

    for (let index = 0; index < compile_list['new-objects'].length; index++) {
      compile_list['new-objects'][index] = {source: compile_list['new-objects'][index], file: this.get_encoded_URI(workspaceUri, compile_list['new-objects'][index])};
    }
    for (let index = 0; index < compile_list['changed-sources'].length; index++) {
      compile_list['changed-sources'][index] = {source: compile_list['changed-sources'][index], file: this.get_encoded_URI(workspaceUri, compile_list['changed-sources'][index])};
    }
    for (let index = 0; index < dependend_sources.length; index++) {
      dependend_sources[index] = {source: dependend_sources[index], file: BuildSummary.get_encoded_URI(workspaceUri, dependend_sources[index])};
    }

    return {
      new_sources : compile_list['new-objects'], 
      changed_sources: compile_list['changed-sources'], 
      dependend_sources: dependend_sources
    }
  }



  private static get_compile_list(workspaceUri: Uri) {

    console.log("Read compile list");
    const fs = require("fs"); 
    
    let compile_list = fs.readFileSync(`${workspaceUri.path}/build-output/compile-list.json`);
    // Converting to JSON 
    compile_list = JSON.parse(compile_list);

    return compile_list
  }


  private static get_encoded_URI(workspaceUri: Uri, file: string) : string {
    const fileUri = {
      scheme: 'file',
      path: `${workspaceUri.path}/src/${file}`,
      authority: ''
    };
    return encodeURIComponent(JSON.stringify(fileUri))
  }



  private static get_global_stuff(webview : Webview, extensionUri: Uri) {

    const styleUri = getUri(webview, extensionUri, ["asserts/css", "style.css"]);
    const logo_src_path = vscode.Uri.joinPath(extensionUri, 'asserts/show_changes/img', 'obi-logo.png');
    const logo_line_left = vscode.Uri.joinPath(extensionUri, 'asserts/show_changes/img', 'logo-line-left.png');
    const logo_line_middle = vscode.Uri.joinPath(extensionUri, 'asserts/show_changes/img', 'logo-line-middle.png');
    const logo_path = vscode.Uri.joinPath(extensionUri, 'asserts/show_changes/img', 'logo.png');

    const logo_uri = webview.asWebviewUri(logo_path);
    const logo_line_left_uri = webview.asWebviewUri(logo_line_left);
    const logo_line_middle_uri = webview.asWebviewUri(logo_line_middle);
    const webviewUri = getUri(webview, extensionUri, ["out", "webview.js"]); // VSCode styling
    const nonce = getNonce();

    return {
      styleUri: styleUri,
      logo: logo_uri,
      logo_line_left: logo_line_left_uri,
      logo_line_middle: logo_line_middle_uri,
      webviewUri: webviewUri,
      nonce: nonce,
      current_date: new Date().toLocaleString()
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