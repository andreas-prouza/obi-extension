# Settings, walkthrough and keybindings

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased) | [usability.md U12](../improvements/usability.md#u12--no-settings-walkthrough-or-keybindings) | – |

This spec defines the **naming and registration** of all new VS Code settings. The behaviour behind each setting is specified in the linked feature spec.


# Current situation

`package.json` has no `contributes.configuration`, `contributes.walkthroughs` or `contributes.keybindings`. Project configuration lives in the OBI TOML files, but there is no place for **personal editor preferences** (logging, history retention, notifications). New users have to find [getting-started.md](../../asserts/docs/getting-started.md) themselves.


# New feature

## 1. Settings

Rules:
* Prefix `obi.`, then area and camelCase name: `obi.<area>.<name>`.
* Only editor/UX preferences go here. Anything the Python OBI or the team needs stays in the TOML config.
* Every setting is added to `contributes.configuration` with a `%key%` description in `package.nls.json` / `package.nls.de.json` ([CLAUDE.md](../../CLAUDE.md) rule).
* One reader: `src/extension/utilities/ExtensionSettings.ts` with typed getters (`ExtensionSettings.build_history_max_builds(): number`, …) and an `on_did_change` event based on `workspace.onDidChangeConfiguration`.

| Setting | Type / default | Scope | Spec |
|---|---|---|---|
| `obi.log.writeFiles` | boolean / `true` | window | [log-level-and-rotation.md](log-level-and-rotation.md) |
| `obi.log.maxFileSizeMB` | number / `5` | window | [log-level-and-rotation.md](log-level-and-rotation.md) |
| `obi.build.revealOutput` | `"onStart"` \| `"onError"` \| `"never"` / `"onError"` | window | [remote-build-output-and-cancel.md](remote-build-output-and-cancel.md) |
| `obi.build.confirmRun` | boolean / `true` | resource | this spec: the "n sources will be built. Proceed?" dialog ([OBICommands.ts:68-78](../../src/extension/obi/OBICommands.ts#L68-L78)) can be turned off |
| `obi.statusBar.enabled` | boolean / `true` | window | [status-bar.md](status-bar.md) |
| `obi.buildHistory.maxBuilds` | number / `100` | resource | [build-history-retention.md](build-history-retention.md) |
| `obi.buildHistory.maxAgeDays` | number / `0` | resource | [build-history-retention.md](build-history-retention.md) |

## 2. Walkthrough

`contributes.walkthroughs` with id `obi.getting-started` ("Get started with OBI"):

| Step | Completion event | Button |
|---|---|---|
| Initialize an OBI project | `onContext:obi.contains_obi_project` | `obi.initialize-folder` (new command, today only reachable from the Welcome view) |
| Configure the connection | `onContext:obi.valid-config` | `obi.controller.config` |
| Show the changes | `onCommand:obi.show_changes` | `obi.show_changes` |
| Run the first build | `onCommand:obi.run_build` | `obi.run_build` |
| Read more | – | link to the docs |

* Step texts as Markdown in `asserts/walkthrough/*.md`, short, reusing [getting-started.md](../../asserts/docs/getting-started.md).
* Add the new command `obi.initialize-folder` to `package.json`, and use it from the Welcome view too.

## 3. Keybindings

| Command | Key (Win/Linux · macOS) | `when` |
|---|---|---|
| `obi.run_single_build` | `ctrl+alt+shift+b` · `cmd+alt+shift+b` | `editorTextFocus && obi.contains_obi_project && obi.valid-config && resourceExtname =~ /^\.(pgm|srvpgm|module|file)$/` |
| `obi.show_single_changes` | `ctrl+alt+shift+c` · `cmd+alt+shift+c` | same |

Check for conflicts with *Developer: Inspect Key Bindings* / the default keybindings of current VS Code before shipping, and change the keys if needed.


## Result

* Settings are read through [ExtensionSettings.ts](../../src/extension/utilities/ExtensionSettings.ts). `build_history_limit_configured` covers the question of [build-history-retention.md](build-history-retention.md).
* Keys checked against the default keybindings of VS Code 1.138: `ctrl+shift+alt+b` is free. `ctrl+shift+alt+c` is `copyRelativeFilePath`, but only with `!editorFocus`, and ours needs `editorTextFocus`, so they don't collide.
* Walkthrough steps 2–4 use `when` clauses: their commands only exist once a project is there.
* Manual checks open: the walkthrough under *Help → Get Started* and its completed steps; the keys on macOS and Windows.


# Tests

* Unit test: `ExtensionSettings` getters return the defaults when nothing is configured.
* `scripts/check-l10n.js` ([localisation.md](localisation.md)) covers the setting descriptions.
* Manual: the walkthrough appears under *Help → Get Started*, and its steps complete as expected.


### Definition of done
* All settings from the table are contributed, localized and read through `ExtensionSettings`
* `obi.build.confirmRun` implemented
* Walkthrough with the steps above; `obi.initialize-folder` command added
* Keybindings without conflicts with VS Code defaults
* CHANGELOG entry
