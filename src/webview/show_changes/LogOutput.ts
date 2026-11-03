
import { Disposable, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { Constants } from '../../shared/Constants';
import { BuildSummary } from './BuildSummary';
import { render_template } from '../Templates';




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
    // The new panel opens where the old one was (the user may have moved it to another editor group)
    const column = LogOutput.currentPanel?._panel.viewColumn;
    LogOutput.currentPanel?.dispose();

    const panel = this.createNewPanel(log_type, column);

    const log_content = LogOutput.get_log_content(workspaceUri, log_type, level, source, cmd_index);

    const html = render_template('show_changes/show_log.html', 
      {
        log_type: log_type,
        source: source,
        content: log_content
      }
    );
    panel.webview.html = html;

    LogOutput.currentPanel = new LogOutput(panel);
  
  }



  private static createNewPanel(log_type: string, column: ViewColumn = ViewColumn.One) {
    return window.createWebviewPanel(
      'show_log', // Identifies the type of the webview. Used internally
      log_type, // Title of the panel displayed to the user
      // The editor column the panel should be displayed in
      column,
      // Extra panel configurations
      {
        enableFindWidget: true,
        retainContextWhenHidden: true
      }
    );
  }





  /** Log of one command from the current compile-list; '' if the list, level, source or command doesn't exist */
  public static get_log_content(workspaceUri: Uri, log_type: string, level: number, source: string, cmd_index: number): string {

    const compile_list = BuildSummary.get_compile_list();
    if (!compile_list || !Array.isArray(compile_list['compiles']))
      return '';

    for (const level_item of compile_list['compiles']) {

      if (level != level_item?.['level'] || !Array.isArray(level_item['sources']))
        continue;

      for (const i_source of level_item['sources']) {

        if (i_source?.['source'] != source)
          continue;

        const cmds = i_source['cmds'];
        const content = Array.isArray(cmds) ? cmds[cmd_index]?.[log_type] : undefined;
        return typeof content === 'string' ? content : '';
      }
    }

    return '';
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