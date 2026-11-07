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
  ignore?: unknown;
  cmds?: unknown;
}

type CompileListLike = { compiles?: { sources?: CompileListSource[] }[] };

/** The build whose messages are shown: opened sources of it get their messages (again) */
interface ShownBuild {
  /** Source → its commands ran in that build */
  sources: Map<string, boolean>;
  evfevent_root: string;
}


/** The commands of the source ran in this build: its old messages are outdated, also if there are no new ones */
export function compiled_in_build(source: CompileListSource): boolean {
  if (source.ignore)
    return false;
  if (source.status === 'success' || source.status === 'failed')
    return true;
  return Array.isArray(source.cmds) && source.cmds.some(cmd =>
    typeof cmd === 'object' && cmd !== null && !(cmd as { ignore?: unknown }).ignore && typeof (cmd as { status?: unknown }).status === 'string' && (cmd as { status: string }).status !== 'new');
}


/** Compile messages of built sources in the Problems view, in the file they belong to (also copybooks) */
export class CompileDiagnostics {

  private static collection: vscode.DiagnosticCollection | undefined;
  /** Files that got diagnostics from a source's last build, so the next build of that source replaces them */
  private static readonly by_source = new Map<string, vscode.Uri[]>();
  /** undefined: nothing loaded since the start (the messages only live in memory, e.g. after a window reload) */
  private static shown: ShownBuild | undefined;


  public static init(context: vscode.ExtensionContext): void {
    // A collection created on demand before (get_collection) is kept: a second one would show its messages forever
    const collection = CompileDiagnostics.get_collection();
    context.subscriptions.push(
      collection,
      { dispose: () => {
        CompileDiagnostics.collection = undefined;
        CompileDiagnostics.by_source.clear();
        CompileDiagnostics.shown = undefined;
      } },
      vscode.workspace.onDidOpenTextDocument(document => CompileDiagnostics.document_opened(document)),
    );
    // Editors restored with the window
    for (const document of vscode.workspace.textDocuments)
      CompileDiagnostics.document_opened(document);
  }


  /**
   * A source was opened: if it's in the shown build (after start: the current build list), its messages are read again.
   * The first time after the start, the whole current build list is loaded, so copybooks get their messages too.
   */
  public static document_opened(document: vscode.TextDocument): void {
    if (document.uri.scheme !== 'file')
      return;
    try {
      const source = DirTool.to_obi_source(document.uri.fsPath);
      if (!source)
        return;

      const shown = CompileDiagnostics.shown;
      if (!shown) {
        const compile_list = DirTool.get_json(path.join(Workspace.get_workspace(), AppConfig.get_app_config().general['compile-list']), false);
        CompileDiagnostics.load_for_compile_list(compile_list, CompileDiagnostics.evfevent_root());
        return;
      }
      if (shown.sources.has(source))
        CompileDiagnostics.load_source(source, shown.evfevent_root, shown.sources.get(source));
    }
    catch (e: unknown) {
      // no (valid) project: nothing to show
      logger.debug(`Compile messages of ${document.uri.fsPath} not loaded: ${get_error_message(e)}`);
    }
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


  /**
   * Replaces the diagnostics of all sources of a compile list with the messages found in `evfevent_root`.
   * This build is then the shown one: sources opened later get its messages.
   */
  public static load_for_compile_list(compile_list: CompileListLike | undefined, evfevent_root: string | undefined): void {
    if (!evfevent_root || typeof compile_list !== 'object' || compile_list === null || !Array.isArray(compile_list.compiles))
      return;

    const sources = new Map<string, boolean>();
    let with_messages = 0;
    for (const level of compile_list.compiles) {
      for (const source of Array.isArray(level?.sources) ? level.sources : []) {
        if (typeof source?.source !== 'string')
          continue;
        const compiled = compiled_in_build(source);
        sources.set(source.source, compiled);
        if (CompileDiagnostics.load_source(source.source, evfevent_root, compiled))
          with_messages++;
      }
    }
    CompileDiagnostics.shown = { sources, evfevent_root };
    logger.info(`Compile messages: ${sources.size} sources of the build list, ${with_messages} with messages (${evfevent_root})`);
  }


  /**
   * Messages of one source. Without EVFEVENT file, a build that ran its commands removes its old messages
   * (they don't belong to this build). True if an EVFEVENT file was read.
   */
  public static load_source(source: string, evfevent_root: string, built_successfully: boolean = false): boolean {

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
      return false;
    }

    try {
      CompileDiagnostics.set_for_source(source, CompileDiagnostics.to_diagnostics(source, parse_evfevent(content)));
      return true;
    }
    catch (e: unknown) {
      logger.error(`Compile messages of ${source} could not be read (${evfevent_file}): ${get_error_message(e)}`);
      return false;
    }
  }


  /** Removes all messages; opening a source doesn't bring them back until the next build or build summary */
  public static clear(): void {
    CompileDiagnostics.collection?.clear();
    CompileDiagnostics.by_source.clear();
    CompileDiagnostics.shown = { sources: new Map(), evfevent_root: '' };
  }


  /** Tests: as after the start of the extension (nothing loaded yet) */
  public static reset(): void {
    CompileDiagnostics.collection?.clear();
    CompileDiagnostics.by_source.clear();
    CompileDiagnostics.shown = undefined;
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
