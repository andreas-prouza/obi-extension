# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project: OBI extension

VS Code extension that builds IBM i objects from sources kept locally (and in git): it detects changed sources, resolves everything that depends on them, generates the build commands in order and runs them on IBM i via SSH. Joblogs, spool files and compile errors come back into VS Code.

- Rules and guidelines: [docs/architecture.md](docs/architecture.md). Security comes before features; npm packages need a GitHub repo, several forks and ≥ 200 stars (ask if none qualifies; checked packages and exceptions in [Reviewed packages](docs/architecture.md#reviewed-packages)).
- Contributor summary: [CONTRIBUTING.md](CONTRIBUTING.md)
- Related repositories: `../obi` (Python backend that runs the builds on IBM i), its tests in `../obi-unit-tests`


## Commands

```sh
npm ci
npm run compile          # esbuild bundles + vendor libs to out/vendor
npm run watch
npm run typecheck
npm run lint:ci          # fails above the warning baseline in package.json
npm run check:repo       # project rules, see Conventions
npm run test:unit        # vscode-free modules (src/test/unit) in plain Node
xvfb-run -a npm test     # all tests in a real VS Code (src/test/suite), against a temp copy of test-resources/appconfig
npm run package:vsix
```

* Single unit test: `npm run compile-tests && npx mocha --ui tdd out-test/test/unit/DictTools.test.js --grep "set_paths"`
* The integration runner ([src/test/suite/index.ts](src/test/suite/index.ts)) has no filter: use `.only` temporarily.
* `VSCODE_TEST_VERSION=<version> npm test` reuses a build cached in `.vscode-test` (default: download latest stable). CI also runs the minimum version 1.90.0.
* Intended change of the generated build list: `OBI_UPDATE_GOLDEN=1 npm test`, then check the diff of `test-resources/golden/compile-list.json`.


## Architecture

* **Layers**: `src/shared/` is pure code and imports nothing from `extension/` or `webview/`; `src/extension/` is the logic (config, SSH, build, files); `src/webview/` the panels and tree views; [extension.ts](src/extension.ts) and [file_callbacks.ts](src/file_callbacks.ts) only wire them together. `check:repo` counts import cycles against a baseline (`MODULES_IN_CYCLES`) that may only go down. Logic without a `vscode` import can be unit-tested, so put it there.
* **Bundles** ([esbuild.js](esbuild.js)): `out/extension.js` (Node, CJS) and one ESM page script per `src/webview/**/javascript/*.ts`. Page scripts run inside the webview; `src/webview/tools/javascript` holds what they share.
* **Webview pages**: Nunjucks templates in `asserts/templates` (`render_template`, autoescape), `@vscode/webview-ui-toolkit` components, strict CSP via `tools/csp.html` (nonce, no inline scripts or `on…=` handlers). Every message from a page is validated against the tables in `src/shared/messages` (`parse_message`, `MessageGuard`); page scripts send them with `typed_post`.
* **OBI project** in the workspace folder (`Workspace`, not `workspaceFolders[0]`): `.obi/etc/app-config.toml` (project, committed), `.obi/etc/.user-app-config[-<profile>].toml` (user, local; active profile in `workspace-settings.json`), `source-config.toml`, extended source processing (ESP) configs, `dependency.json`, … The template for *Initialize* is `obi-media/`.
* **Config**: `AppConfig.get_app_config()` is the user config merged over the project config (`DictTools.override_dict`: `undefined`, `null`, `''`, `[]` don't override; `false` and `0` do). It is cached per file stamp (`CachedFiles`) and shared, so never modify it; the integration tests deep-freeze it (`OBI_FREEZE_CONFIG`). To edit a file, read `get_project_app_config` / `get_user_app_config`. The backend merges the same two files itself (`dict_merge` in `../obi/module/dict_tools.py`): keep both merge rules the same.
* **Build flow** ([OBICommands.ts](src/extension/obi/OBICommands.ts)):
  1. *Show changes* creates the build list (`compile-list.json`) with the local Python OBI if `local-obi-dir` has a venv, otherwise with the TypeScript port in `src/extension/obi/compile_list` (its `modules/` mirror the Python modules).
  2. *Run build* transfers config and sources via SSH (`SSH_Tasks`, `TransferExcludes`; the user config goes up with mode 600). The build list comes from the local OBI, or the backend creates it on IBM i (`create`). Then the backend runs the commands.
  3. Results are downloaded: status, joblogs, spool files, compile errors (→ Problems view, `CompileDiagnostics`) and the build history in `.obi/build-history`.
* **Reacting to changes**: `HealthyWatchdog` with `FILE_CALLBACKS` resets caches and refreshes views when project files change. `ProjectState` sets the context keys `obi.contains_obi_project` / `obi.valid-config` and registers features without a window reload.


## Conventions

- TypeScript strict mode, no new `any`.
- Command IDs use the prefix `obi.` (e.g. `obi.show_changes`). Register with `register_command`, never `vscode.commands.registerCommand`.
- Every new command/setting must be added to `package.json`, with `%key%` texts in `package.nls.json` and `package.nls.de.json`.
- Texts shown to users go through `vscode.l10n.t` (templates: `global_stuff.get_text`) and need entries in `l10n/bundle.l10n.json` and `l10n/bundle.l10n.de.json`.
- Values for the remote shell are quoted with `sh_quote` (`src/shared/ShellQuote.ts`). No secrets in logs or files; log with `logger`, not `console.log`.
- `check:repo` enforces the command registration, `logger`, `Workspace`, CSP include in page templates, the l10n entries, pinned dependency ranges and the import-cycle baseline.
- Saving from the config pages rewrites the whole TOML file (comments are lost).
- Documentation: user docs in `asserts/docs`, every user-visible change in [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]`, specs in `docs/features` / `docs/bugfix` with status `draft`, `ready` or `finished`.
