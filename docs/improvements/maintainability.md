# Maintainability, tooling and packaging improvements

Findings from a code review of v1.3.3 (2026-10-22): tests, build, CI, dependencies, package size and code structure.

Severity: 🔴 high · 🟠 medium · 🟡 low. See [README.md](README.md) for how this list is maintained.

Already tracked elsewhere and not repeated here:
* Strict TypeScript / `any` → [features/strict-typescript.md](../features/strict-typescript.md)
* `catch (e: any)` → [features/typed-error-handling.md](../features/typed-error-handling.md)
* Large multi-responsibility files → [features/split-god-object-files.md](../features/split-god-object-files.md)
* Missing tests for dependencies, merging, paths and SSH → [features/test-coverage.md](../features/test-coverage.md)
* `console.log` → [features/replace-console-log-with-logger.md](../features/replace-console-log-with-logger.md)
* Command ID prefix → [features/command-id-naming-convention.md](../features/command-id-naming-convention.md)


## M1. 🔴 `npm test` cannot run
* **Where:** [package.json](../../package.json) (`pretest`, `test`, `test:fast`), [src/test/](../../src/test/)
* **Current:**
  * `pretest` runs `tsc -p ./`, which fails with **19 errors**:
    * 15 because `mocha` and `@types/mocha` are not installed (`suite`, `test`, `setup` unknown);
    * 4 real ones: [OBIConfiguration.ts:244](../../src/webview/controller/OBIConfiguration.ts#L244) and [show_changes.ts:84-87](../../src/webview/show_changes/javascript/show_changes.ts#L84-L87).
  * `npm run lint` fails with **453 errors**: 189 `no-explicit-any`, 86 `prefer-const`, 84 `no-unused-vars`, 26 `no-require-imports`, 24 `no-case-declarations`, …
  * `test:fast` also runs `compile-tests` and stops at the same `tsc` errors. No test runs.
  * `chai` and `sinon` are installed but unused.
  * Two runner configs exist: [.vscode-test.mjs](../../.vscode-test.mjs) for `@vscode/test-cli`, which is not installed, and [runTest.ts](../../src/test/runTest.ts) for `@vscode/test-electron`.
* **Proposal:**
  * Add `mocha` + `@types/mocha` and fix the 4 compile errors.
  * Keep only one runner.
  * Let `pretest` run only the type check. Make lint a separate CI step that starts with the current error count as a baseline (or downgrades `no-explicit-any` to a warning until [strict-typescript.md](../features/strict-typescript.md) is done).


## M2. 🟠 Compiling the tests overwrites the extension bundle
* **Where:** [tsconfig.json](../../tsconfig.json), [esbuild.js:15-23](../../esbuild.js#L15-L23)
* **Current:** esbuild writes the bundled `out/extension.js`. `tsc -p ./` (`compile-tests`, `watch-tests`) uses `outDir: out` and `rootDir: src`, so it replaces `out/extension.js` with the unbundled tsc output. After running tests, F5 runs different code than the release package.
* **Proposal:** add a `tsconfig.test.json` with its own `outDir` (e.g. `out-test`), and use `tsc --noEmit` for plain type checking.


## M3. 🟠 No continuous integration
* **Where:** no `.github/workflows`
* **Current:** typecheck, lint, tests and packaging only happen on a developer machine. The [CHANGELOG](../../CHANGELOG.md) shows repeated Windows-only fixes (0.3.33, 0.4.19, 0.4.20, 1.2.22, …).
* **Proposal:** add a GitHub Actions workflow on Linux + Windows that runs `npm ci`, the type check, lint, the tests (xvfb on Linux), `npm audit --omit=dev` and `vsce ls` with a file-count or size threshold (see M4).


## M4. 🟠 The VSIX would contain about 5,500 files / 20 MB
* **Where:** [.vscodeignore](../../.vscodeignore), [package.json](../../package.json) (`copy-assets`, `copy-obi-media`), [esbuild.js:22](../../esbuild.js#L22)
* **Current:** `vsce ls` on the current working tree lists 5,527 files (~20 MB uncompressed, maps already excluded):
  * 2,236 files in `out/asserts`: a copy made by `npm run compile`. It isn't used, because templates and webview resources are loaded from `asserts/`. Likewise `out/obi-media`.
  * 1,041 files in `asserts/img`, of which 2 are used (see [usability.md U13](usability.md#u13--use-native-vs-code-icons)).
  * The full Bootstrap distribution (RTL, ESM and unminified variants).
  * Production `node_modules`, including the webview toolkit's dependencies (`@microsoft/fast-*`, `react`), although webview code is bundled, plus the unused packages from M5.
  * `test-workspace-active/`, `docs/` and `example.js`.
* **Proposal:**
  * Exclude `out/asserts/**`, `out/obi-media/**`, `test-*/**`, `docs/**`, `example.*` and unused Bootstrap files in `.vscodeignore`, and drop the copy scripts if nothing needs them.
  * Evaluate bundling `ssh2` (keep only the optional native `cpu-features` external) so the extension can be packaged with `--no-dependencies`.


## M5. 🟠 Unused, undeclared and deprecated dependencies
* **Where:** [package.json](../../package.json)
* **Current:**
  * **Unused:** `@emnapi/core`, `@emnapi/runtime`, `@tybys/wasm-util`, `@vscode/codicons` (codicons are vendored in `asserts/codicons`), `hasha` (only in commented code, [DirTool.ts:468-489](../../src/extension/utilities/DirTool.ts#L468-L489)), `chai`, `sinon`.
  * **Undeclared:** `minimatch` (imported in [app_config_tools.ts:2](../../src/extension/obi/compile_list/modules/app_config_tools.ts#L2), only present as a dev-only transitive dependency) and `mocha`.
  * **Deprecated:** `@vscode/webview-ui-toolkit` 1.4.0 (archived upstream).
  * **Duplicate purpose:** Choices *and* Tom Select are used on the same page ([maintain-source-dependency.html:146-212](../../asserts/templates/source_list/maintain-source-dependency.html#L146-L212)). jQuery is only needed for bootstrap-table.
* **Proposal:**
  * Remove the unused packages and declare the undeclared ones.
  * Pick one select widget.
  * Plan the toolkit replacement. Any candidate must be checked against the [package criteria](../architecture.md#npm) (GitHub repo, several forks, ≥ 200 stars); if none qualifies, plain HTML styled with VS Code CSS variables is an option.


## M6. 🟠 Dead and leftover code
* **Where:**
  * [example.ts](../../example.ts), `example.js`, `example.js.map`;
  * unused helpers in [OBITools.ts:958-965](../../src/extension/utilities/OBITools.ts#L958-L965) (`parallel`) and [DirTool.ts](../../src/extension/utilities/DirTool.ts) (`get_all_files_in_dir`, `get_shell_config`, `get_file_changed_date`);
  * commented-out blocks in [source-quick-search.ts:19-71](../../src/source-quick-search.ts#L19-L71) and [dependency.ts:175-191](../../src/extension/obi/compile_list/modules/dependency.ts#L175-L191);
  * `Constants.REMOTE_OBI_PYTHON_PATH` (unused, while the path is hard-coded in [OBICommands.ts:514](../../src/extension/obi/OBICommands.ts#L514) and [OBITools.ts:292](../../src/extension/utilities/OBITools.ts#L292));
  * duplicated path constants in [obi_constants.ts](../../src/extension/obi/compile_list/modules/obi_constants.ts) vs. [Constants.ts](../../src/shared/Constants.ts);
  * `asserts/img/light_old`;
  * the disabled Quick settings, Deployment and i-Releaser views (`when: false` / `1==2`), which are still registered and bundled.
* **Proposal:** delete it. Git history keeps it. Disabled features can live on a branch, or behind a real setting once they are planned again.


## M7. 🟡 Module structure: global static state and circular imports
* **Where:** e.g. [Workspace.ts:6](../../src/extension/utilities/Workspace.ts#L6) (utility imports a webview), [AppConfig.ts:2](../../src/extension/config/AppConfig.ts#L2) ↔ [OBITools.ts:8](../../src/extension/utilities/OBITools.ts#L8), `SSH_Tasks.context`, `OBITools.ext_context`, `BuildSummary` statics
* **Current:**
  * Almost all logic lives in classes with only static members that hold mutable global state.
  * `shared/` imports from `extension/` and `webview/`, and utilities call UI code (`Workspace.change_profile` → `OBIConfiguration.update()`).
  * Naming mixes `snake_case` and `camelCase` (`get_app_config` vs. `getBuildOrder`).
  * The folder `asserts` is presumably meant to be `assets`.
* **Proposal:**
  * Define a dependency direction (`shared` ← `extension` ← `webview`).
  * Replace UI calls from utilities with events (`vscode.EventEmitter`, e.g. `onDidChangeProfile`).
  * Document one naming convention in [CLAUDE.md](../../CLAUDE.md).
  * Pairs with [split-god-object-files.md](../features/split-god-object-files.md).


## M8. 🟡 Hard-coded list of removable command parameters
* **Where:** [build_cmds.ts:132-151](../../src/extension/obi/compile_list/modules/build_cmds.ts#L132-L151)
* **Current:** unresolved `$(VAR)` placeholders are only removed for 8 hard-coded keywords (and `INCDIR()` is listed twice). Any other optional parameter stays in the command as `KEYWORD($(VAR))` and fails on the IBM i.
* **Proposal:** keep an explicit list of *optional* keywords (removing every unresolved `KEYWORD($(VAR))` generically would also drop mandatory parameters such as `PGM()` or `SRCSTMF()`). Build one case-insensitive regex from that list, and warn about every placeholder that is still unresolved afterwards.


## M9. 🟡 Outdated VS Code engine
* **Where:** [package.json](../../package.json) (`engines.vscode: ^1.66.0`, `@types/vscode: ^1.66.0`)
* **Current:** the minimum version is from early 2022. It blocks implicit activation events and `vscode.l10n` (1.73/1.74), `LogOutputChannel` (1.74) and newer webview, tree and quick-pick APIs.
* **Proposal:** raise the minimum, e.g. to 1.85+, and note it in the CHANGELOG.


## M10. 🟡 Webview code is wired via 13 near-identical esbuild configs
* **Where:** [esbuild.js:25-136](../../esbuild.js#L25-L136)
* **Current:** each webview script needs a new copy-pasted config block plus an entry in `configs`.
* **Proposal:** use one config with an `entryPoints` map (and `splitting`, see [performance.md P10](performance.md#p10--webview-bundles-duplicate-the-ui-toolkit-nunjucks-is-reconfigured-on-every-render)), generated from `src/webview/**/javascript/*.ts`.


## M11. 🟡 Webview message protocol is untyped
* **Where:** all `onDidReceiveMessage` handlers and `vscode.postMessage` calls, e.g. [OBIConfiguration.ts:162-395](../../src/webview/controller/OBIConfiguration.ts#L162-L395), [config.ts](../../src/webview/controller/javascript/config.ts)
* **Current:** message names and fields are free-form strings on both sides. Typos fail silently, and refactoring is risky.
* **Proposal:** define a discriminated union per panel in `src/shared/` (e.g. `type ConfigMessage = { command: 'user_save', data: … } | …`) and use it on both sides. This is also the basis for input validation ([security.md S7](security.md#s7--webview-messages-are-trusted-without-validation)).


## M12. 🟡 Compile-list logic exists twice (TypeScript and Python)
* **Where:** [src/extension/obi/compile_list/](../../src/extension/obi/compile_list/) and the Python OBI project (`-a create`, `-a add_source`)
* **Current:** the TypeScript port and the Python OBI both generate `compile-list.json`. They already diverge: ESP condition names ([bugs.md #7](../bugs.md#7--extended-source-processing-rules-created-by-the-ui-never-match)), and git info is only added by TypeScript ([OBICommands.ts:410-414](../../src/extension/obi/OBICommands.ts#L410-L414)).
* **Proposal:**
  * Define `compile-list.json` and the config files as JSON Schema in one place (see [usability.md U14](usability.md#u14--json-files-have-no-schema)).
  * Add shared fixtures (input project → expected compile-list) that both implementations must pass.


## M13. 🟡 Repository hygiene
* **Where:** repository root
* **Current:** [ToDo.md](../../ToDo.md) and [bugs2.md](../bugs2.md) hold loose German notes next to the structured [bugs.md](../bugs.md) and [features/](../features/). There is no `CONTRIBUTING.md` (how to build, test and package, release steps, CHANGELOG rule from [architecture.md](../architecture.md#updates)).
* **Proposal:** move the open items into `bugs.md` / `features/`, delete the loose files, and add a short `CONTRIBUTING.md`.
