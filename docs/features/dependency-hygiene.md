# Dependency hygiene

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | ready (finished except step 4: the toolkit replacement is evaluated and documented, the migration is still open) | [security.md S15](../improvements/security.md#s15--vendored-front-end-libraries-are-outside-dependency-auditing), [maintainability.md M5](../improvements/maintainability.md#m5--unused-undeclared-and-deprecated-dependencies) | [bugfix/test-setup.md](../bugfix/test-setup.md) |

Related: [pin-dependency-versions.md](pin-dependency-versions.md) (`"latest"` versions), [vsix-package-size.md](vsix-package-size.md). Every new or replacement package must meet the [package criteria](../architecture.md#npm); if none does, ask before continuing.


# Current situation

## npm dependencies ([package.json](../../package.json))

| Package | Finding |
|---|---|
| `@emnapi/core`, `@emnapi/runtime`, `@tybys/wasm-util` | not imported anywhere |
| `@vscode/codicons` | not imported; a copy lives in `asserts/codicons` |
| `hasha` | only used in commented-out code ([DirTool.ts:468-489](../../src/extension/utilities/DirTool.ts#L468-L489)) |
| `minimatch` | imported in production code ([app_config_tools.ts:2](../../src/extension/obi/compile_list/modules/app_config_tools.ts#L2)) but not declared; only present as a dev-only transitive dependency (`package-lock.json`: `dev: true`) |
| `@vscode/webview-ui-toolkit` 1.4.0 | deprecated upstream (archived) |
| `chai` (dev) | unused |
| `deepmerge` | used in [config.ts](../../src/webview/controller/javascript/config.ts) only |
| `wildcard-match`, `winston`, `winston-transport`, `@typescript-eslint/*` | `"latest"`, see [pin-dependency-versions.md](pin-dependency-versions.md) |

## Vendored front-end files (not seen by `npm audit` / Dependabot)

| File(s) | Version | Used |
|---|---|---|
| `asserts/js/jquery.min.js` | 3.7.1 | yes (bootstrap-table) |
| `asserts/bootstrap/**` | Bootstrap 5.3.3 (full dist incl. RTL, ESM, unminified, maps) | `bootstrap.min.css`, `bootstrap.bundle.min.js` |
| `asserts/bootstrap/js/bootstrap-table*.js`, `css/bootstrap-table.min.css` | 1.23.2 | yes |
| `asserts/bootstrap/font/bootstrap-icons*` | – | linked in 6 templates, but no `bi-*` class is used anywhere |
| `asserts/js/tom-select.complete.min.js`, `css/tom-select.min.css` | 2.4.3 | yes |
| `asserts/js/choices.min.js`, `css/choices*.css` | 11.1.0 | loaded, but its only initialisation is commented out |
| `asserts/codicons/*` | unknown | yes |
| `asserts/js/alertBox.js` | – | empty file (0 bytes) |


# New feature

## 1. Remove what isn't used

* npm: `@emnapi/core`, `@emnapi/runtime`, `@tybys/wasm-util`, `hasha`, `chai`.
* Vendored: Choices (`choices.min.js`, `choices.min.css`, `choices-dark-overrides.css`), bootstrap-icons (remove the `<link>` from the 6 templates), `asserts/js/alertBox.js`.

## 2. Declare what is used

* Add `minimatch` to `dependencies` (current major, pinned range).
* `mocha` / `@types/mocha` are added by [test-setup.md](../bugfix/test-setup.md).

## 3. Front-end libraries from npm

* Add `jquery`, `bootstrap`, `bootstrap-table`, `tom-select` and `@vscode/codicons` as `dependencies` (exact versions as today, so behaviour doesn't change).
* New build step (in [esbuild.js](../../esbuild.js) or a small `scripts/copy-vendor.js`) that copies **only the used files** from `node_modules` to `out/vendor/…`.
* Templates load them from `{{ global_stuff['vendor_uri'] }}/…`. Delete the copies from `asserts/js`, `asserts/css`, `asserts/bootstrap` and `asserts/codicons`.
* Result: Dependabot and `npm audit` cover these libraries, and updates are a `package.json` change.

## 4. Replace the deprecated webview toolkit

* Inventory the toolkit components in use: `vscode-button`, `vscode-text-field`, `vscode-checkbox`, `vscode-dropdown` / `vscode-option`, `vscode-panels` / `vscode-panel-tab` / `vscode-panel-view`, `vscode-divider`, `vscode-text-area`, `vscode-data-grid` (imported in `main.ts`).
* Evaluate replacements against the package criteria (GitHub repo, several forks, ≥ 200 stars), e.g. `@vscode-elements/elements`. Write the result (stars/forks at evaluation time) into [architecture.md → Reviewed packages](../architecture.md#reviewed-packages).
  **Result (2026-10-23):** `@vscode-elements/elements` meets the criteria and has all components in use (button, text field, checkbox, dropdown/option, tabs/panels, divider, text area; `vscode-data-grid` is only registered in `main.ts`). The migration touches all templates and webview scripts. It is a task of its own, done panel by panel, with a check of every page in the UI.
* If no candidate meets the criteria: **ask** before continuing. The fallback is plain HTML elements styled with the VS Code theme CSS variables (`--vscode-button-background`, …).
* Migrate panel by panel; keep the element ids so the scripts stay unchanged as far as possible.

## 5. Keep it clean

* `npm audit --omit=dev --audit-level=high` in CI ([continuous-integration.md](continuous-integration.md)).
* `.github/dependabot.yml` for `npm` and `github-actions`, weekly.
* Optional: [`depcheck`](https://github.com/depcheck/depcheck) (if it meets the criteria) in CI to detect unused or undeclared packages.


# Tests

* After each step: `npm ci && npm run compile && npm test`, and open every webview (no 404 for scripts/styles in the webview devtools network tab).


### Definition of done
* No unused npm packages; every imported package is declared
* No vendored front-end library outside `node_modules`; only used files are copied into the package
* Choices and bootstrap-icons removed
* Toolkit replacement evaluated against the criteria (and documented), or the question to the maintainer is recorded
* `npm audit` and Dependabot active
* CHANGELOG entry
