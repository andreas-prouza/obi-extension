import * as vscode from 'vscode';
import { OBITools } from '../../extension/utilities/OBITools';
import { LogOutput } from './LogOutput';
import { Workspace } from '../../extension/utilities/Workspace';

/*
https://medium.com/@andy.neale/nunjucks-a-javascript-template-engine-7731d23eb8cc
https://mozilla.github.io/nunjucks/api.html
https://www.11ty.dev/docs/languages/nunjucks/
*/
const nunjucks = require('nunjucks');



export class LogOutputProvider implements vscode.FileSystemProvider {

  private _documents = new Map<string, string>();
  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._onDidChangeFile.event;
  public static readonly scheme = 'logoutput';
  private static _instance: LogOutputProvider | null = null;


  public static getInstance(): LogOutputProvider {
    if (!LogOutputProvider._instance) {
      LogOutputProvider._instance = new LogOutputProvider();
      OBITools.ext_context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider(LogOutputProvider.scheme, LogOutputProvider._instance, {
          isReadonly: true
        })
      );
    }
    return LogOutputProvider._instance!;
  }

  public static async showOutput(log_type: string, level: number, source: any, cmd_index: any) {

    const content = LogOutput.get_log_content(Workspace.get_workspace_uri(), log_type, level, source, cmd_index);

    const log_type_mapping = {
      'joblog': 'QPJOBLOG',
      'stdout': 'Spool',
      'stderr': 'Error'
    };

    log_type = log_type_mapping[log_type] || log_type;

    const uri = vscode.Uri.parse(`${LogOutputProvider.scheme}:/${source}/${log_type}`);
    const provider = LogOutputProvider.getInstance();
    // Update the provider's internal map
    provider.setDocument(uri, content);

    // Open and show
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
      preview: false,
      preserveFocus: true
    });
  }


  // Helper to add/update content
  setDocument(uri: vscode.Uri, content: string) {
    this._documents.set(uri.path, content);
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const content = this._documents.get(uri.path) || '';
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: Buffer.from(content).byteLength,
      permissions: vscode.FilePermission.Readonly
    };
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const content = this._documents.get(uri.path);
    if (content === undefined) throw vscode.FileSystemError.FileNotFound();
    return Buffer.from(content);
  }

  // Standard Boilerplate (Required by interface)
  watch(_uri: vscode.Uri): vscode.Disposable { return new vscode.Disposable(() => { }); }
  readDirectory(): [string, vscode.FileType][] { return []; }
  createDirectory(): void { }
  writeFile(): void { throw new Error('Read-only'); }
  delete(): void { throw new Error('Read-only'); }
  rename(): void { throw new Error('Read-only'); }
}