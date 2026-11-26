# Layers: src/extension imports nothing from src/webview

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Refactoring | 🟡 | finished (check-repo.js rule, tested with deliberate violations; integration test BuildViews.test.ts) | [improvements v2.2.3 D3](../improvements/v2.2.3/README.md) | [module-structure.md](module-structure.md) |


# Current situation

* `OBICommands` imported `BuildSummary`, `OBIController` and `BuildHistoryProvider` from `src/webview`, and `PackageLastBuilds` imported `HistoryTimestamp`. Together with `OBITools` this made one cycle of 10 modules across both layers (15 modules in cycles in total).
* `src/shared` didn't import from the other layers, but nothing checked it.


# Change

* `HistoryTimestamp` (pure) moved to [src/shared/HistoryTimestamp.ts](../../src/shared/HistoryTimestamp.ts).
* [BuildViews.ts](../../src/extension/obi/BuildViews.ts): what the build commands need from the views (run finished, last build, build summary: show, update, current results, shown build list; build history: retention, reveal). `extension.ts` registers it with `OBICommands.register_views`. Until then (tests use their own copy of the modules) nothing is shown; the shown build list falls back to `compile-list`.
* Further edges of the cycle `OBITools` – `OBICommands` – `StatusBar` – `ProjectState` – `createBuildList`:
  * `OBITools` imported `OBICommands` without using it.
  * `StatusBar.init(context, cancel_running)`: the cancel function is passed in by `extension.ts`.
  * `OBITools.initialize_folder` waits for the copy and returns whether it worked; the command in `extension.ts` updates `ProjectState`. Before, it returned before the files were copied.
  * Source hashing (`retrieve`, `cancel`) is in [CurrentSourceHashes.ts](../../src/extension/utilities/CurrentSourceHashes.ts); `OBITools` keeps both names as delegates, `createBuildList` uses the new module.
* [check-repo.js](../../scripts/check-repo.js) `check_layers`: `src/shared` imports nothing from `src/extension` or `src/webview`, and `vscode` only as `import type`; `src/extension` imports nothing from `src/webview`.

Result: 8 modules in cycles (`MODULES_IN_CYCLES` 15 → 8), none across layers. Left: `AppConfig` – `DirTool` – `Workspace` (3), `BuildSummary` – `LogOutput` – `LogOutputProvider` (3), `SourceListConfig` – `SourceListProvider` (2). Lint warnings 226 → 224.


# Tests

* [BuildViews.test.ts](../../src/test/suite/BuildViews.test.ts): with registered views, *Preview build* for the current source without an open source ends in `run_finished('show_changes')`; without views nothing fails.
* `check_layers`: run with an import of `src/webview` in `src/extension` and a runtime import of `vscode` in `src/shared`; both are reported.
* All existing tests unchanged (`StatusBar.init` gets a cancel function in its test).


# Definition of done

* [x] Change, rule and tests
* [x] CLAUDE.md (Layers, check:repo), architecture.md
* [x] Entry D3 removed from the improvement list
