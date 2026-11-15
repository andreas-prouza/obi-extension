# Welcome views with VS Code's welcome content

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟢 | finished (Unreleased; checked in VS Code 1.114 with screenshots of all three cases) | User request 2026-11-15: UI refresh, step 2 | [ui-refresh-build-pages.md](ui-refresh-build-pages.md) |


# Current situation

* `obi-welcome` (no project) and `obi-config-invalid` (`obi.valid-config` false) were webview views: a heading, text and toolkit buttons separated by many `<br/>`, with their own page scripts, templates and message tables (`Welcome.ts`, `ConfigInvalid.ts`, `welcome.ts`, `config_invalid.ts`, `StartMessages.ts`).
* The "invalid" view said *Please finish configuration first*. But `obi.valid-config` is false only when `OBITools.self_check` fails: a configuration file can't be read, or a path isn't allowed (root folder, the SSH user's home as `remote-base-dir`). Missing values only give a warning and open the configuration; the normal views stay.


# Feature

* Both are tree views without items (`WelcomeViews.ts`, `register_welcome_view`). VS Code then shows their `viewsWelcome` content from `package.json`, with the texts in `package.nls*.json`:
  * `obi-welcome`, `workspaceFolderCount == 0`: what OBI does, **Open Folder** (`vscode.openFolder`), **Open Recent**, links to the walkthrough (`workbench.action.openWalkthrough`) and *Getting started*.
  * `obi-welcome`, a folder is open: *This folder has no OBI project yet*, **Initialize OBI Project**, what Initialize does (existing files are kept), walkthrough and *Getting started*, and *Reload the window* for a project added another way.
  * `obi-config-invalid`: why OBI can't use the configuration (file not readable, path not allowed; the error message says which), **Open Configuration**, that OBI checks again on save, *reload the window*.
* The view title actions of `obi-config-invalid` (reset compiled object list, dependency list, configuration) stay.
* Removed: the two webview views with their templates, page scripts and `StartMessages.ts`.
* Screenshots in the docs replaced with ones of the new layouts, taken in VS Code at 2x (`welcome3.png`, `controller-1.png`, `build-summary.png`).


# Tests

* **Unit** (`ViewsWelcome.test.ts`): both views are tree views with welcome content; every `command:` link of the texts, in every language, runs a command of `package.json` or a listed command of VS Code; the walkthrough link names this extension and its walkthrough.
* **Manual, in VS Code 1.114** (screenshots under Xvfb): no folder, folder without a project, configuration with `remote-base-dir = "/"`, valid project.
