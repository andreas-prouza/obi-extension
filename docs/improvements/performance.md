# Performance improvements

Findings from a code review of v1.3.3 (2026-10-22). No timings were measured. The findings come from reading the code paths: what is repeated, what is synchronous, what grows with the number of sources.

Severity: 🔴 high · 🟠 medium · 🟡 low. See [README.md](README.md) for how this list is maintained.


## P1. 🔴 The source tree is hashed twice per "Show changes", once synchronously
* **Where:** [OBITools.ts:786-813](../../src/extension/utilities/OBITools.ts#L786-L813), [OBITools.ts:898-953](../../src/extension/utilities/OBITools.ts#L898-L953), [createBuildList.ts:32-38](../../src/extension/obi/compile_list/createBuildList.ts#L32-L38), [files.ts:6-31](../../src/extension/obi/compile_list/modules/files.ts#L6-L31)
* **Current:**
  * `generate_source_change_lists` first computes an MD5 of every source (async, `retrieve_current_source_hashes`).
  * Then `createBuildList` → `getFiles` walks the tree again and hashes every file a second time with `readdirSync` / `statSync` / `readFileSync`. This blocks the extension host, and with it all other extensions.
  * The dependents computed by `get_dependend_sources` are written to a file and then recomputed by `getBuildOrder`.
* **Proposal:**
  * Compute the hash list once and pass it into `createBuildList`.
  * Make the walk async.
  * Add a hash cache keyed by `(path, size, mtimeMs)` (persisted in `.obi/tmp` or `workspaceState`) so unchanged files aren't read at all.
  * Use the same hash function everywhere (fixes [bugs.md #15](../bugs.md#15--empty-sources-are-always-shown-as-changed)).


## P2. 🔴 `source-config.toml` is parsed about 5× per source and the full config is cloned on every lookup
* **Where:** [properties.ts:9-49](../../src/extension/obi/compile_list/modules/properties.ts#L9-L49), [build_cmds.ts:9-71](../../src/extension/obi/compile_list/modules/build_cmds.ts#L9-L71), [app_config_tools.ts:55](../../src/extension/obi/compile_list/modules/app_config_tools.ts#L55), [toml_tools.ts:2-24](../../src/extension/obi/compile_list/modules/toml_tools.ts#L2-L24)
* **Current:**
  * `getSourceProperties` reads and parses `source-config.toml` from disk on every call. Per source it is called from `getObjectList`, `getExtendedSteps`, `getSourceBuildCmds` (which also parses the file itself) and again for `sourceItem.variables`.
  * `getTableElement` runs `structuredClone()` on the **whole** config before every lookup: 5× per `getSourceProperties`, plus once per step and per `%word%` in `resolveCmdId`.
  * Cost grows with sources × config size.
* **Proposal:**
  * Load `source-config.toml`, the ESP config and the app config once per build-list run and pass them down.
  * Compute the properties of each source once (`Map<source, props>`).
  * Let `getTableElement` walk without cloning and clone only the returned leaf where mutation is needed.


## P3. 🟠 Dependency resolution scales quadratically or worse
* **Where:** [dependency.ts:82-163](../../src/extension/obi/compile_list/modules/dependency.ts#L82-L163), [dependency.ts:223-259](../../src/extension/obi/compile_list/modules/dependency.ts#L223-L259), [dict_tools.ts:2-23](../../src/extension/obi/compile_list/modules/dict_tools.ts#L2-L23), [OBITools.ts:749-782](../../src/extension/utilities/OBITools.ts#L749-L782)
* **Current:**
  * Finding the dependents of one object scans the whole `dependency.json` (`for obj in dict` + `includes`), recursively, with an `existsSync` per hit and an `AppConfig.get_app_config()` per recursion.
  * The result is a tree, not a DAG, so shared dependencies (diamonds) are expanded repeatedly.
  * `getTargetsByLevel` merges with `deepListMerge`, which runs `structuredClone` per child.
  * Cycle detection is a heuristic (">50 visits").
  * `OBITools.get_dependend_sources` repeats the same work with nested loops.
* **Proposal:**
  * Build a reverse adjacency map once (`Map<source, Set<dependent>>`) and collect dependents with BFS.
  * Compute build levels with a topological sort (Kahn / longest path), O(V+E).
  * Detect cycles exactly and report the cycle path in the error.
  * Cover it with tests first ([test-coverage.md](../features/test-coverage.md)).


## P4. 🟠 The extension activates in every VS Code window
* **Where:** [package.json:31-33](../../package.json#L31-L33), [Logger.ts:9](../../src/extension/utilities/Logger.ts#L9), [Logger.ts:55-58](../../src/extension/utilities/Logger.ts#L55-L58)
* **Current:**
  * `activationEvents: ["onStartupFinished"]` loads the ~525 KB bundle, winston and an "OBI" output channel in every window, also without an OBI project.
  * The logger is created as a side effect of the import.
* **Proposal:**
  * Use `workspaceContains:.obi/etc/app-config.toml`. The welcome view still activates the extension through implicit view activation, which needs `engines.vscode >= 1.74` (see [maintainability.md M9](maintainability.md#m9--outdated-vs-code-engine)).
  * Create the logger lazily.


## P5. 🟠 Config cache is time-based (2 s) instead of change-based
* **Where:** [AppConfig.ts:350-392](../../src/extension/config/AppConfig.ts#L350-L392), [ConstantsCallback.ts:22-24](../../src/file_callbacks.ts#L22-L24)
* **Current:**
  * `get_app_config()` is called almost everywhere, including inside recursions. Two seconds after the last load it reads and parses both TOML files again.
  * The watcher callback meant to reset the cache for the user config is keyed `.user-app-config`, but `check_dir_change_callback` compares against `.obi/etc/.user-app-config*.toml`, so it never matches.
* **Proposal:** cache until a file watcher invalidates it, and fix the callback key (`.obi/etc/.user-app-config`, prefix match).


## P6. 🟠 The `.obi` file watcher hashes every changed file and triggers refresh storms
* **Where:** [HealthyWatchdog.ts:19-65](../../src/extension/utilities/HealthyWatchdog.ts#L19-L65), [HealthyWatchdog.ts:88-112](../../src/extension/utilities/HealthyWatchdog.ts#L88-L112), [HealthyWatchdog.ts:116-131](../../src/extension/utilities/HealthyWatchdog.ts#L116-L131)
* **Current:**
  * Every create or change under `.obi/etc`, `.obi/source-list`, `.obi/build-output`, `.obi/build-history` and `.obi/tmp` is MD5-hashed. That includes every file copied into the build history after each build.
  * The hash map grows without limit.
  * Each event can refresh the build history tree.
  * Every file created or deleted under `src/` reloads the whole source list. A branch switch that touches 1,000 files causes a series of full rescans.
* **Proposal:**
  * Debounce (~300 ms) and coalesce per callback.
  * Watch only the files that have callbacks (`etc/*.toml`, `etc/*.json`, `source-list/*.json`).
  * Skip hashing for `build-history`, `build-output` and `tmp`.


## P7. 🟠 The source filter tree rescans `src/` for every filter on every refresh
* **Where:** [SourceListProvider.ts:58-94](../../src/webview/source_list/SourceListProvider.ts#L58-L94), [SourceListProvider.ts:560-581](../../src/webview/source_list/SourceListProvider.ts#L560-L581), [LocalSourceList.ts:111-138](../../src/extension/utilities/LocalSourceList.ts#L111-L138), [LocalSourceList.ts:202-256](../../src/extension/utilities/LocalSourceList.ts#L202-L256), [LocalSourceList.ts:44](../../src/extension/utilities/LocalSourceList.ts#L44)
* **Current:**
  * Every root refresh runs a full directory walk per filter file.
  * Every `load_source_list()` fires `obi.source-filter.update`, which refreshes the tree.
  * RegExp and wildcard matchers are compiled per source × filter.
  * `get_values_by_key` deduplicates with `result.some()`, which is O(n²).
  * `load_source_infos` runs `existsSync` per entry.
* **Proposal:**
  * Reuse the cached `LocalSourceList`.
  * Compile matchers once per filter.
  * Use `Set` / `Map` for deduplication.
  * Evaluate a filter only when its node is expanded.


## P8. 🟠 SSH transfers move whole directories file by file
* **Where:** [OBICommands.ts:206-248](../../src/extension/obi/OBICommands.ts#L206-L248), [SSH_Tasks.ts:384-425](../../src/extension/utilities/SSH_Tasks.ts#L384-L425), [SSH_Tasks.ts:320-337](../../src/extension/utilities/SSH_Tasks.ts#L320-L337)
* **Current:**
  * After every build, `.obi/build-output`, `.obi/tmp` and `.obi/log` are downloaded completely, three directories in parallel.
  * "Transfer all" uploads file by file over SFTP. The code comment at [SSH_Tasks.ts:386-387](../../src/extension/utilities/SSH_Tasks.ts#L386-L387) already suggests compression.
  * The 4 config files are re-uploaded on every build.
  * `ssh-concurrency` from the config is ignored ([bugs.md #12](../bugs.md#12--ssh-concurrency-is-ignored)).
* **Proposal:**
  * For full transfers, stream a `tar czf -` archive over one exec channel.
  * After a build, download only what the compile-list references (evfevent files of built sources, logs, `compile-list.json`).
  * Upload config files only when their hash changed.


## P9. 🟡 `compile-list.json` grows with sources × config size
* **Where:** [build_cmds.ts:16](../../src/extension/obi/compile_list/modules/build_cmds.ts#L16), [properties.ts:33](../../src/extension/obi/compile_list/modules/properties.ts#L33), [OBICommands.ts:226](../../src/extension/obi/OBICommands.ts#L226)
* **Current:**
  * Each source entry stores the full `variables` dict: general config, all language settings and all `global.cmds` prefixed.
  * After the build, the whole merged config is added as well.
  * The file is transferred, parsed several times, rendered and copied into the history on every build.
* **Proposal:** store only source-specific or overridden variables, and reference the config snapshot once (without secrets, see [bugs.md #1](../bugs.md#1--secret-variables-are-stored-in-plain-text-in-the-build-history)).


## P10. 🟡 Webview bundles duplicate the UI toolkit; Nunjucks is reconfigured on every render
* **Where:** [esbuild.js:25-136](../../esbuild.js#L25-L136), e.g. [OBIController.ts:190](../../src/webview/controller/OBIController.ts#L190), [BuildSummary.ts:368](../../src/webview/show_changes/BuildSummary.ts#L368)
* **Current:**
  * 13 separate webview bundles of ~180 KB each, most of it the same `@vscode/webview-ui-toolkit` code.
  * Most providers call `nunjucks.configure()` on every render. That creates a new environment each time and loses the template cache.
* **Proposal:**
  * Use a single esbuild config with `splitting: true`, `format: "esm"` and `outdir` (shared chunk), or load the toolkit once as a separate script.
  * Create one Nunjucks environment at module level and reuse it (two are needed: with and without the custom template path, see [security.md S8](security.md#s8--workspace-provided-nunjucks-template-runs-in-the-extension-host)).


## P11. 🟡 Webviews are fully re-rendered for every change
* **Where:** [BuildSummary.ts:76-79](../../src/webview/show_changes/BuildSummary.ts#L76-L79), [BuildSummary.ts:413-422](../../src/webview/show_changes/BuildSummary.ts#L413-L422), [OBIConfiguration.ts:149-158](../../src/webview/controller/OBIConfiguration.ts#L149-L158), [OBIController.ts:45-55](../../src/webview/controller/OBIController.ts#L45-L55)
* **Current:**
  * `render()` disposes the build summary panel and creates a new one.
  * `update()` replaces `webview.html` (re-parse, re-run all scripts). The config panel does this after almost every edit.
  * The OBI Build view is rebuilt every time it becomes visible ([reliability.md R10](reliability.md#r10--obi-build-view-retaincontextwhenhidden-has-no-effect-re-resolving-adds-message-listeners)).
* **Proposal:**
  * Keep the panel (`reveal()`) and send state updates via `postMessage`, letting the page patch the DOM.
  * Register message listeners once.
  * This also fixes UI state loss ([usability.md U10](usability.md#u10--webviews-lose-position-scroll-and-expanded-state)).


## P12. 🟡 Synchronous file I/O in hot paths
* **Where:** 49 `readFileSync` / `writeFileSync` / `statSync` / `existsSync` / `readdirSync` / `execFileSync` calls under [src/](../../src/), e.g. [DirTool.ts](../../src/extension/utilities/DirTool.ts), [files.ts](../../src/extension/obi/compile_list/modules/files.ts), [GitInfo.ts:86-87](../../src/extension/utilities/GitInfo.ts#L86-L87)
* **Current:** loops over all sources use synchronous I/O on the extension host thread. `GitInfo` may spawn `git` synchronously on every compile-list write.
* **Proposal:** use `fs.promises` or `vscode.workspace.fs` in loops and anything per-source. Cache git info per build run.


## P13. 🟡 Batched hashing blocks on the slowest file, and arrays are concatenated quadratically
* **Where:** [OBITools.ts:919-948](../../src/extension/utilities/OBITools.ts#L919-L948), [DirTool.ts:91-95](../../src/extension/utilities/DirTool.ts#L91-L95), [DirTool.ts:144-148](../../src/extension/utilities/DirTool.ts#L144-L148)
* **Current:**
  * Hashing starts `max-threads + 1` jobs and waits for the whole batch before starting the next one.
  * Results are collected with `arr = [...arr, ...new]`, which is O(n²) for large trees.
* **Proposal:** use a small worker-pool helper with fixed concurrency (start the next job when one finishes) and collect results with `push()`.


## P14. 🟡 SSH keepalive every 3.6 seconds
* **Where:** [SSH_Tasks.ts:114](../../src/extension/utilities/SSH_Tasks.ts#L114)
* **Current:** `keepaliveInterval: 3600`. ssh2 interprets this in **milliseconds**.
* **Proposal:** use a deliberate value (e.g. `60_000`) and set `readyTimeout` explicitly.
