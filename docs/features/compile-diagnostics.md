# Compile errors in the Problems view for all built sources

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (fixtures from IBM/ibmi-eventf-parser; not yet checked with events of a real OBI build) | [usability.md U8](../improvements/usability.md#u8--compile-errors-only-reach-the-problems-view-for-the-active-editor) | [bugfix/remote-home-directory.md](../bugfix/remote-home-directory.md) (remote path mapping) |

Also fixes [bugs.md #16](../bugs.md#16--compile-diagnostics-ignore-evfevent-output-dir) and the copybook item in [ToDo.md](../../ToDo.md) ("Fehler in Copybook bei eventf berücksichtigen").


# Current situation

[compile-diagnostics.ts](../../src/extension/source/compile-diagnostics.ts):
* `show_diagnostic_infos(evfevent_file)` is only called when a source is opened from the build summary ([BuildSummary.ts:115-124](../../src/webview/show_changes/BuildSummary.ts#L115-L124)).
* It attaches **all** markers to the **active editor** ([compile-diagnostics.ts:67-71](../../src/extension/source/compile-diagnostics.ts#L67-L71)) and ignores the marker's `fileLocation`. Errors in copybooks are shown at the same line number in the main source.
* The range is always columns 0–100 of `getStmtLine()`. The record also provides `getStartErrLine()`, `getEndErrLine()`, `getTokenStart()` and `getTokenEnd()`.
* The evfevent path is hard-coded to `<.obi/tmp or history>/evfevent/<source>`; `evfevent-output-dir` is ignored (bugs.md #16).
* The diagnostic collection is never disposed.


# New feature

## 1. Load diagnostics after each build

New module `src/extension/source/CompileDiagnostics.ts`:

```ts
export class CompileDiagnostics {
  static init(context: vscode.ExtensionContext): void            // creates and registers the collection 'obi-compiler'
  /** Replaces the diagnostics of all sources in the compile-list with the evfevent results found in evfevent_root. */
  static load_for_compile_list(compile_list: CompileList, evfevent_root: string): Promise<void>
  static clear(): void
}
```

* Call `load_for_compile_list` at the end of a build (after `get_remote_build_output`) and when a build-history entry is opened in the build summary (with that entry's folder).
* `evfevent_root`: the folder of the configured `evfevent-output-dir` relative to the downloaded build folder (live: `.obi/tmp/evfevent`, history: `<history>/evfevent`).
* For every source in the compile-list:
  * evfevent file exists → parse and set diagnostics;
  * no evfevent file and the source built successfully → delete existing diagnostics for its files.

## 2. Map markers to files

The `fileLocation` of a marker comes from the FILEID record:
* IFS path below the resolved remote base dir (`<remote-base-dir>/src/lib/qrpglesrc/x.rpgleinc`) → strip the prefix → workspace file. Copybooks get their own diagnostics.
* Path relative to the project (`src/…`) → workspace file.
* Anything else (QSYS member, system include) → attach to the main source at line 1 with `relatedInformation` "in <fileLocation>:<line>".

## 3. Ranges and details

* Lines: `getStartErrLine()` … `getEndErrLine()` (1-based → 0-based); columns `getTokenStart()` … `getTokenEnd()`, or the whole line if they are 0.
* Severity: as today (`< 10` information, `< 20` warning, else error).
* `diagnostic.code = msgid`, `diagnostic.source = 'IBM i compiler'`.

## 4. Existing entry points

* *Open source* from the build summary only opens the file. The diagnostics are already there.
* `obi.clearDiagnostics` calls `CompileDiagnostics.clear()`.


## Follow-up (2026-11-07): keep the Problems view up to date

Reported: after a build, the messages of the open sources were not updated, and opening a source of the build list later showed nothing.

* The messages only live in memory. After a window reload or restart they were gone, and nothing loaded them again. Now `CompileDiagnostics.init` listens to `onDidOpenTextDocument` (and handles the editors that are already open). The first source opened after the start loads the whole current build list (`compile-list`, live `evfevent-output-dir`), so copybooks get their messages too. After that, an opened source of the *shown* build is read again. The shown build is the one that was loaded last: the live build after a build, or a history build opened in the build summary.
* Old messages were only removed when the source succeeded (`status == 'success'`). Now they are removed whenever the source's commands ran (`compiled_in_build`: status `success`/`failed`, or a non-ignored command that isn't `new`). Example: a failed `CHGATR` before the compile. Sources the build didn't reach keep the messages of their last compile.
* `init` created a second `obi-compiler` collection if one had been created on demand before (`get_collection`). The first one's messages stayed forever. Now `init` reuses it.
* *Clear diagnostics* stays in effect when sources are opened, until the next build or build summary.
* `load_for_compile_list` logs `Compile messages: n sources of the build list, m with messages (<folder>)`. If a real build still shows nothing, this line tells whether the EVFEVENT files arrived.
* Not changed: a stale EVFEVENT file on the IBM i (the source's compile didn't run this time) is still downloaded and shown as that source's last compile result.
* Tests: [CompileDiagnostics.test.ts](../../src/test/suite/CompileDiagnostics.test.ts) (failed before the compile, not reached, opening after a start, opening again after the events changed, Clear).


# Tests

* Unit tests with evfevent fixtures (put sample files into `test-resources/evfevent/`): a main-source error, a copybook error, a QSYS include, and an error with token columns.
* Unit test: a source that previously had diagnostics and now built successfully → diagnostics removed.


### Definition of done
* After every build, the Problems view contains the compile messages of all built sources, in the right files (incl. copybooks)
* Correct line and column ranges
* `evfevent-output-dir` respected (bugs.md #16 removed)
* Collection registered in `context.subscriptions`
* Copybook item removed from ToDo.md; CHANGELOG entry
