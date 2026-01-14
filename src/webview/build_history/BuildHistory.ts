import * as vscode from 'vscode';
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri } from "../../utilities/getUri";
import { getNonce } from "../../utilities/getNonce";
import { DirTool } from '../../utilities/DirTool';
import * as path from 'path';
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






export class BuildHistory {

  public static currentPanel: BuildHistory | undefined;
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
    this._panel.onDidDispose(this.dispose, this, this._disposables);

    panel.webview.onDidReceiveMessage(
      (message: any) => {
        const command: string|undefined = message.command;

        switch (command) {
          case "show_build_summary":
            OBICommands.show_build_summary(message.file);
            return;

          case "delete_item":
            OBICommands.delete_compile_list_item(message.level, message.source);
            BuildHistory.update();
            return;

          case "delete_level":
            OBICommands.delete_compile_list_level(message.level);
            BuildHistory.update();
            return;
        }
      }
    );

    BuildHistory.currentPanel = new BuildHistory(panel, extensionUri);
  }


  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    BuildHistory.currentPanel = undefined;

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