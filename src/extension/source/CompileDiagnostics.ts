import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CompileMessage, map_location, parse_evfevent } from './evfevent';
import { AppConfig } from '../config/AppConfig';
import { Constants } from '../../shared/Constants';
import { DirTool } from '../utilities/DirTool';
import { Workspace } from '../utilities/Workspace';
import { logger } from '../utilities/Logger';
import { get_error_message } from '../../shared/Errors';


interface CompileListSource {
  source: string;
  status?: string;
}


/** Compile messages of built sources in the Problems view, in the file they belong to (also copybooks) */
export class CompileDiagnostics {

  private static collection: vscode.DiagnosticCollection | undefined;
  /** Files that got diagnostics from a source's last build, so the next build of that source replaces them */
  private static readonly by_source = new Map<string, vscode.Uri[]>();


  public static init(context: vscode.ExtensionContext): void {
    CompileDiagnostics.collection = vscode.languages.createDiagnosticCollection('obi-compiler');
    context.subscriptions.push(CompileDiagnostics.collection, {
      dispose: () => {
        CompileDiagnostics.collection = undefined;
        CompileDiagnostics.by_source.clear();
      }
    });
  }


  private static get_collection(): vscode.DiagnosticCollection {
    // Tests and early calls: create it on demand
    CompileDiagnostics.collection ??= vscode.languages.createDiagnosticCollection('obi-compiler');
    return CompileDiagnostics.collection;
  }


  /**
   * Folder with the EVFEVENT files of a build (setting evfevent-output-dir). `build_folder`: a build-history folder,
   * which contains a copy of .obi/tmp; undefined for the current build. Undefined if the history has no events.
   */
  public static evfevent_root(build_folder?: string): string | undefined {
    const ws = Workspace.get_workspace();
    const dir = AppConfig.get_app_config().general['evfevent-output-dir'] || Constants.EVFEVENT_OUTPUT_PATH;
    if (!build_folder)
      return path.resolve(ws, dir);

    const below_tmp = path.relative(Constants.OBI_TMP_DIR, dir);
    if (below_tmp.startsWith('..') || path.isAbsolute(below_tmp))
      return undefined;   // not part of the build history
    return path.resolve(ws, build_folder, below_tmp);
  }


  /** Replaces the diagnostics of all sources of a compile list with the messages found in `evfevent_root` */
  public static load_for_compile_list(compile_list: { compiles?: { sources?: CompileListSource[] }[] } | undefined, evfevent_root: string | undefined): void {
    if (!compile_list || !evfevent_root)
      return;
    for (const level of compile_list.compiles ?? []) {
      for (const source of level.sources ?? []) {
        if (typeof source?.source === 'string')
          CompileDiagnostics.load_source(source.source, evfevent_root, source.status === 'success');
      }
    }
  }


  /** Messages of one source; without EVFEVENT file, a successful build removes its old messages */
  public static load_source(source: string, evfevent_root: string, built_successfully: boolean = false): void {

    const evfevent_file = path.join(evfevent_root, source);
    let content: string | undefined;
    try {
      content = fs.readFileSync(evfevent_file, 'utf8');
    }
    catch {
      content = undefined;
    }

    if (content === undefined) {
      if (built_successfully)
        CompileDiagnostics.set_for_source(source, new Map());
      return;
    }

    try {
      CompileDiagnostics.set_for_source(source, CompileDiagnostics.to_diagnostics(source, parse_evfevent(content)));
    }
    catch (e: unknown) {
      logger.error(`Compile messages of ${source} could not be read (${evfevent_file}): ${get_error_message(e)}`);
    }
  }


  public static clear(): void {
    CompileDiagnostics.collection?.clear();
    CompileDiagnostics.by_source.clear();
  }


  private static set_for_source(source: string, diagnostics: Map<string, vscode.Diagnostic[]>): void {
    const collection = CompileDiagnostics.get_collection();
    for (const uri of CompileDiagnostics.by_source.get(source) ?? [])
      collection.delete(uri);

    const uris: vscode.Uri[] = [];
    for (const [file, list] of diagnostics) {
      const uri = vscode.Uri.file(file);
      collection.set(uri, list);
      uris.push(uri);
    }
    CompileDiagnostics.by_source.set(source, uris);
  }


  /** Diagnostics per local file. Messages of files outside the project go to the source itself (line 1). */
  private static to_diagnostics(source: string, messages: CompileMessage[]): Map<string, vscode.Diagnostic[]> {
    const source_root = DirTool.get_local_source_dir();
    const main_file = path.join(source_root, source);
    const result = new Map<string, vscode.Diagnostic[]>();
    const exists = (file: string) => DirTool.file_exists(file);

    for (const message of messages) {
      const file = map_location(message.location, source_root, exists);
      const outside = file === undefined;

      const start = outside ? 0 : Math.max(message.start_line - 1, 0);
      const end = outside ? 0 : Math.max(message.end_line - 1, start);
      const whole_line = outside || message.token_start <= 0;
      const range = new vscode.Range(start, whole_line ? 0 : message.token_start - 1, end, whole_line ? Number.MAX_SAFE_INTEGER : message.token_end);

      const text = !outside ? message.text
        : message.start_line > 0 ? vscode.l10n.t('{0} (in {1}, line {2})', message.text, message.location, message.start_line)
        : vscode.l10n.t('{0} (in {1})', message.text, message.location);
      const diagnostic = new vscode.Diagnostic(range, text,
        message.severity < 10 ? vscode.DiagnosticSeverity.Information : message.severity < 20 ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);
      diagnostic.code = message.msgid;
      diagnostic.source = 'IBM i compiler';

      const target = file ?? main_file;
      const list = result.get(target);
      if (list)
        list.push(diagnostic);
      else
        result.set(target, [diagnostic]);
    }
    return result;
  }
}
