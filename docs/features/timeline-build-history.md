# Build history in the Timeline view

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased; tested with 1.90.0 and 1.145.0, manual checks open) | VS Code 1.145: Timeline API is stable (`@types/vscode` 1.145.0) | [build-history-retention.md](build-history-retention.md), [multi-root-workspace.md](multi-root-workspace.md) (phase 1) |

Related: [done/build-history.md](done/build-history.md) (source view of the history tree), [compile-diagnostics.md](compile-diagnostics.md).


# Current situation

* To see when a source was last built and whether that build worked, the user has to switch the *Build history* tree to the source view or set a source filter ([BuildHistoryProvider.ts:245-317](../../src/webview/build_history/BuildHistoryProvider.ts#L245-L317)). The editor itself shows nothing.
* The Timeline view in the Explorer already shows the git commits and local saves of the active file. OBI builds are not part of it, so you can't see "commit → build failed → fix → build OK" in one place.
* Each build is in `.obi/build-history/<timestamp>/compile-list.json` ([OBICommands.ts:328-338](../../src/extension/obi/OBICommands.ts#L328-L338)). For every source it holds `source`, `hash` (MD5 of the transferred content), `status` and `cmds[]` with each command's `status` ([Source.ts:35-51](../../src/shared/Source.ts#L35-L51)). Source contents are **not** stored.
* The minimum VS Code version is 1.90 (`engines.vscode`, CI job with 1.90.0). The Timeline API is stable from 1.145. Before that it was a proposed API with another shape: `registerTimelineProvider(scheme, provider)`, `TimelineItem.detail`, paging via `limit: { timestamp }`.


# Stable API (1.145)

The parts this spec uses, taken from `@types/vscode` 1.145.0:

```ts
workspace.registerTimelineProvider(id: string, label: string, scheme: string | readonly string[], provider: TimelineProvider): Disposable
workspace.registerWorkspaceTimelineProvider(id: string, label: string, provider: WorkspaceTimelineProvider): Disposable

interface TimelineProvider          { onDidChangeTimeline?: Event<Uri | Uri[] | undefined>; provideTimeline(uri, options, token): ProviderResult<Timeline> }
interface WorkspaceTimelineProvider { onDidChangeWorkspaceTimeline?: Event<void>;           provideWorkspaceTimeline(options, token): ProviderResult<Timeline> }
interface Timeline        { items: readonly TimelineItem[] /* newest first */; cursor?: string }
interface TimelineOptions { cursor?: string; limit?: number; triggerKind: TimelineTriggerKind /* Invoke = 1, Automatic = 2 */ }
class TimelineItem        { timestamp; label?; id?; iconPath?; description?; tooltip?; command?; resourceUri?; contextValue?; accessibilityInformation? }
```

* A file provider and a workspace provider from the same extension may use the **same id**. They then show as one source in the Timeline filter.
* Item ids must be unique across all items of the provider.
* Commands in `timeline/item/context` get `(item, uri | undefined, providerId, selectedItems | undefined)`; `when` uses `timelineItem == <contextValue>`. `timeline/title` commands get the uri, or `undefined` for the workspace timeline (context key `timelineForWorkspace`).
* `resourceUri` makes two items comparable. Leave it `undefined` when the item isn't a version of the file.


# New feature

## 1. Keep 1.90 as minimum, enable the Timeline from 1.145

Don't raise `engines.vscode` to 1.145 just for this. Users on 1.90–1.144 (enterprise installs) would lose the whole extension for an extra view. Instead:

* `@types/vscode` stays at the `engines` version (`vsce` refuses newer types). New file `src/webview/timeline/TimelineApi.ts` declares the subset above as local interfaces (`ObiTimelineItem`, `ObiTimelineProvider`, …) and has one function:

  ```ts
  /** The stable Timeline API, or undefined before VS Code 1.145 (there it is a proposed API and access throws). */
  export function timeline_api(): TimelineApi | undefined
  ```

  It checks `vscode.version >= 1.145.0` first (version compare as a pure function in `src/shared`, unit-tested; `-insider` suffix allowed). Only then does it read `workspace.registerTimelineProvider`, `workspace.registerWorkspaceTimelineProvider` and `TimelineItem`, inside `try`/`catch`. It returns `undefined` if any of them is not a function. The cast goes through `unknown` into the local interfaces, so no `any`.
* Below 1.145: log once on `debug` ("Timeline: needs VS Code 1.145, not registered") and do nothing else. No message to the user.
* When `engines.vscode` is raised to ≥ 1.145 one day ([vscode-engine-bump.md](vscode-engine-bump.md)), drop `TimelineApi.ts` and use `vscode.*` directly. Put that note into `TimelineApi.ts`.

## 2. Build index (pure, unit-tested)

New module `src/webview/build_history/HistoryIndex.ts` without `vscode` import (like [HistoryRetention.ts](../../src/webview/build_history/HistoryRetention.ts)):

```ts
export interface BuildEntry {
  dir: string;                              // history folder name
  time: Date;                               // parse_history_dir(dir)
  sources: Map<string, SourceResult>;       // key: source as in compile-list.json, e.g. 'prouzalib/qrpglesrc/x.rpgle'
  total: number; failed: number;            // like summarize_build (StatusText.ts)
}
export interface SourceResult { status: 'success' | 'failed' | 'not-run' | 'ignored'; hash?: string; cmds: { status: string }[] }

export function read_build(dir: string, compile_list: unknown): BuildEntry | undefined   // undefined: no timestamp or unreadable
export function builds_for_source(index: readonly BuildEntry[], source: string): BuildEntry[]          // newest first
export function builds_below_folder(index: readonly BuildEntry[], folder: string): BuildEntry[]        // folder relative to the source dir, '' = all
export function page<T>(items: readonly T[], cursor: string | undefined, limit: number | undefined): { items: T[]; cursor?: string }
```

* Source status: `ignored` if the source has `ignore`; `success` if every non-ignored command has status `success`; `not-run` if all the commands that didn't succeed are still `new`. That happens when the build stopped before reaching them. Otherwise `failed`. Use the same rule as `summarize_build` ([StatusText.ts:31-44](../../src/extension/utilities/StatusText.ts#L31-L44)), so the status bar and the Timeline never disagree. Move the shared check into one function.
* `read_build` checks the shape itself (`compile_list.compiles[].sources[]`, strings only). A broken file must not break the timeline (see [bugfix/missing-files-break-views.md](../bugfix/missing-files-break-views.md)).
* `page`: the cursor is the index of the next item as a string. `limit` `undefined` means all. An invalid cursor starts from the top.
* `BuildHistoryProvider.get_sources_from_build` ([BuildHistoryProvider.ts:218-239](../../src/webview/build_history/BuildHistoryProvider.ts#L218-L239)) uses the same index afterwards. Today the tree parses every `compile-list.json` again for each node.

The index is built in `src/webview/build_history/BuildIndex.ts`: list the history folders and read each `compile-list.json`, cached per folder by the file's mtime and size (pattern of `CachedFiles`). After a build, only the new folder is read. The cache is dropped by `reset()`, which is called from the existing build-history entry in `FILE_CALLBACKS` ([file_callbacks.ts:25](../../src/file_callbacks.ts#L25)).

## 3. File timeline

`src/webview/timeline/BuildTimeline.ts`, registered as

```ts
api.registerTimelineProvider('obi.builds', vscode.l10n.t('OBI builds'), 'file', provider)
```

* `provideTimeline(uri)`: convert `uri` into a source path relative to the local source dir (`DirTool.get_local_source_dir()`, same check as `inside` in BuildSummary). Outside the OBI folder (multi-root: `Workspace`, not `workspaceFolders[0]`) or outside the source dir → `undefined`.
  * File → `builds_for_source`; folder (e.g. `src/prouzalib/qrpglesrc`) → `builds_below_folder`, one item per build.
  * Respect `options.limit` / `options.cursor` via `page`. Respect `token`: stop between reading compile lists.
* **Item of a file** (one build of this source):

  | Field | Value |
  |---|---|
  | `label` | `Build OK` / `Build failed` / `Not built (build stopped)` / `Ignored` (l10n) |
  | `timestamp` | build time (folder timestamp) |
  | `id` | `<dir>:<source>` |
  | `iconPath` | `ThemeIcon('pass', testing.iconPassed)` / `error` / `circle-slash` / `debug-step-over` |
  | `description` | `3/3 commands` or `failed at 2/3`; `· current version` if the stored `hash` equals the MD5 of the file now (`md5_file`, only for the requested file, not on every item of a folder) |
  | `tooltip` | `MarkdownString`: date/time, status per command (command text shortened to 80 characters, escaped), other sources of the same build (count) |
  | `command` | `obi.open_build_summary` with `<history>/<dir>/compile-list.json`, as in the history tree ([BuildHistoryProvider.ts:674-678](../../src/webview/build_history/BuildHistoryProvider.ts#L674-L678)) |
  | `contextValue` | `obi.build.source` |
  | `resourceUri` | `undefined`: the history has no copy of the source, so items can't be compared |

* **Item of a folder**: label `Build OK` / `Build failed`, description `5 sources in this folder · 1 failed`, `id` `<dir>:<folder>`, `contextValue` `obi.build`.
* `onDidChangeTimeline`: fire `undefined` after the index was reset (new build, deleted builds, retention). It's debounced already by `FILE_CALLBACKS`.

## 4. Workspace timeline

Same id, so the filter shows one entry "OBI builds":

```ts
api.registerWorkspaceTimelineProvider('obi.builds', vscode.l10n.t('OBI builds'), provider)
```

One item per build: label `Build OK` / `Build failed (2 of 14)`, description `14 sources`, `id` = `<dir>`, `contextValue` `obi.build`, same command and tooltip (list of the first 20 sources with status, then "… and n more"). Only the history of the OBI folder, also in multi-root workspaces.

## 5. Actions

New commands. Register them with `register_command`, add them to `package.json` with `%key%` titles, and hide them from the command palette (`commandPalette` `when: false`). They get the timeline arguments, never a free path:

| Command | Menu `timeline/item/context`, `when` | Does |
|---|---|---|
| `obi.timeline.show-compile-messages` | `timelineItem == obi.build.source` | Loads this build's compile messages for the source into the Problems view: `CompileDiagnostics.load_source(source, CompileDiagnostics.evfevent_root(<history dir>))`. Info message if the build has none. |
| `obi.timeline.reveal-in-history` | `timelineItem =~ /^obi\.build/` | `BuildHistoryProvider.reveal_build(dir)` |
| `obi.timeline.delete-build` | `timelineItem =~ /^obi\.build/ && !listMultiSelection` | Same confirmation and deletion as `obi.build-history.delete-item`; move that code into a shared `BuildHistoryProvider.delete_build(dir)`. |

* The commands look up the build by the item `id` in the index. They never take paths from the item. Ids that aren't in the index are ignored and logged on `warn`. Check that the folder is inside `.obi/build-history` (`RemotePathGuard`/`inside`) before deleting.
* `timeline/title`: `obi.build-history.update` (refresh) with `when: timelineForWorkspace || resourceScheme == file`. Use the existing command; the Timeline refreshes through `onDidChangeTimeline`.
* Joblogs and spool files stay in the build summary, which is opened by the item command. `LogOutputProvider.showOutput` reads the currently displayed compile list ([LogOutputProvider.ts:32](../../src/webview/show_changes/LogOutputProvider.ts#L32)), so a direct "Show joblog" action would need that changed first. Not part of this spec.

## 6. Registration and lifecycle

* Register in `ProjectState` together with the other project features. This way it works without a window reload once a project is initialised. Unregister (dispose) when the OBI project disappears. Push the disposables to `context.subscriptions`.
* Workspace trust: only register in trusted workspaces. Reading the history is harmless, but keep the same rule as the rest of the extension ([workspace-trust.md](workspace-trust.md)).
* No `onView:timeline` activation event: the extension already activates on `workspaceContains:.obi/etc/app-config.toml`, and without a project there is nothing to show.
* No new setting. Users can hide the provider in the Timeline view's filter menu ("OBI builds"), and VS Code remembers that.


# Not in scope

* Comparing a file with "the version of build X": would need a copy of every built source in the history. That would grow the history a lot ([build-history-retention.md](build-history-retention.md)). If wanted later: store only the hash, look up the matching git commit, and set `resourceUri` to its `git:` uri.
* Copybooks: a copybook appears in the timeline only when it is in the compile list itself. Showing the builds of the sources that include it needs the dependency list (`dependency.json`). That could be phase 2 once this spec is done.
* Remote builds without download (`obi.get-remote-build-results` not run): only what is in `.obi/build-history`.


## Result

* Files: [TimelineApi.ts](../../src/webview/timeline/TimelineApi.ts), [BuildTimeline.ts](../../src/webview/timeline/BuildTimeline.ts) (both providers in one class, plus the item commands), [HistoryIndex.ts](../../src/webview/build_history/HistoryIndex.ts) and [BuildIndex.ts](../../src/webview/build_history/BuildIndex.ts) (no `vscode` import), [BuildStatus.ts](../../src/shared/BuildStatus.ts) (status rule shared with `summarize_build`), [Version.ts](../../src/shared/Version.ts). Everything is in `src/webview/` next to the history tree, not in `src/extension/timeline/`.
* Deviations:
  * `BuildIndex` checks mtime and size itself, so no `reset()` on change. `BuildIndex.changed()` (called from `FILE_CALLBACKS`) only tells the Timeline to request its items again. Builds that were deleted are dropped from the cache on the next `list()`.
  * No `timeline/title` entry: the Timeline view has its own refresh button.
  * Not unregistered when the project disappears: `ProjectState` registers the project features once and never removes them (as for all other views). Without a project the provider returns `undefined`.
  * No extra trust check: the extension is disabled in Restricted Mode (`capabilities.untrustedWorkspaces.supported: false`).
  * `obi.build-history.delete-item` uses the same `BuildHistoryProvider.delete_build(dir)` and only accepts history folder names. Its confirmation text now comes from the folder name (`Delete build 2026-11-06 06:28:08?`), not from the tree item's label.
  * Source view of the history tree: builds whose folder name is no timestamp no longer add their sources to the root level. Those builds weren't shown below the source anyway.
* Integration tests call the provider directly with the real `vscode.TimelineItem`. VS Code has no API to read the Timeline view itself, so the registration is only covered by the activation of the extension in the test run.
* Manual checks open: Timeline view with git and OBI builds, the filter, the context actions, the folder timeline.


# Tests

* **Unit** (`src/test/unit`, plain Node):
  * version compare: `1.90.0` < `1.145.0`, `1.145.0`, `1.145.0-insider`, `1.200.1` ≥.
  * `read_build`: valid list; missing `compiles`; non-string `source`; folder name without timestamp → `undefined`.
  * status rule: all `success`; one `failed`; `new` after a failed command → `not-run`; `ignore`; same result as `summarize_build` for a fixture build.
  * `builds_for_source` / `builds_below_folder`: newest first; folder prefix must match whole segments (`qrpglesrc` doesn't match `qrpglesrc2`).
  * `page`: limit 2 with cursor; last page without cursor; invalid cursor; `limit` `undefined`.
* **Integration** (`src/test/suite`, skip with `this.skip()` if `timeline_api()` is `undefined`, so the 1.90 CI job stays green and the stable job runs them):
  * two builds in the temp project's history → `provideTimeline(<source uri>)` returns 2 items, newest first, correct status and ids; workspace timeline returns 2 items.
  * new history folder → `onDidChangeTimeline` fires once (after the `FILE_CALLBACKS` debounce).
  * file outside the source dir → `undefined`.
* **1.90 job:** activation without errors, nothing registered, one `debug` log line.
* **Manual:** Timeline view in the Explorer shows git and OBI builds mixed by time; the filter hides "OBI builds"; clicking an item opens the build summary; context actions; folder timeline.


### Definition of done
* On VS Code ≥ 1.145, the Timeline view shows the OBI builds of the active source, of folders and of the workspace, with status, and updates after each build and deletion
* On 1.90–1.144 the extension works as before (CI job with 1.90.0 green); `engines.vscode` and `@types/vscode` unchanged
* Item actions: compile messages, reveal in build history, delete (with confirmation)
* History tree uses the shared index; `check:repo` passes (commands, l10n in `bundle.l10n*.json` and `package.nls*.json`, no new import cycle)
* User docs in `asserts/docs` (build history page: "Timeline" section with the 1.145 requirement); CHANGELOG entry under `[Unreleased]`
