# Status bar item

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished | [usability.md U7](../improvements/usability.md#u7--no-status-bar-item) | [bugfix/operation-lock.md](../bugfix/operation-lock.md) |

Settings naming: [settings-walkthrough-keybindings.md](settings-walkthrough-keybindings.md).


# Current situation

There is no status bar item (`createStatusBarItem` isn't used). The active profile, the running operation and the result of the last build are only visible inside the OBI side bar or the build summary.


# New feature

## Item

One item, left-aligned, visible when `obi.contains_obi_project` is true:

| State | Text | Tooltip (Markdown) |
|---|---|---|
| idle, no build yet | `$(server-environment) prod` | profile, `user@host`, remote folder |
| idle, last build ok | `$(server-environment) prod  $(check) 10:42` | + "Last build 10:42: 12 sources, all successful" |
| idle, last build failed | `$(server-environment) prod  $(error) 2 failed` | + "Last build 10:42: 2 of 12 sources failed" |
| running | `$(sync~spin) Run build…` | + the operation label and elapsed time |
| cancelled (5 s) | `$(circle-slash) Cancelled` | – |

* The profile is the alias from `workspace-settings.json` (`default` if empty).
* "Last build" is computed from the live compile-list after a build (`is_compile_list_completed`, number of sources with a failed command), and stored in `workspaceState` so it survives a restart.
* Updated on `OperationLock.on_did_change`, profile change, and after builds.

## Click: quick pick

Command `obi.status-bar.menu` (add to `package.json`, hide it from the Command Palette via `menus.commandPalette` with `"when": "false"`):

* `$(run-all) Run build (all changes)`
* `$(run) Run build for current source` (only if the active editor has a supported source)
* `$(loaded-scripts-view-icon) Show changes`
* `$(output) Open build summary`
* `$(person) Switch profile…` → quick pick of `AppConfig.get_profile_app_config_list()`
* `$(debug-stop) Cancel running operation` (only while running, see [remote-build-output-and-cancel.md](remote-build-output-and-cancel.md))
* `$(list-flat) Show build output` / `$(output) Show log`

## Setting

`obi.statusBar.enabled` (boolean, default `true`). Add to `contributes.configuration` and `package.nls*.json`.


## Implementation

* New file `src/extension/StatusBar.ts` with `init(context)`, called from `activate()`. Disposables go to `context.subscriptions`.
* Icons are codicons (`$(…)`), as required by [architecture.md → GUI](../architecture.md#gui).


# Tests

* Unit test: text/tooltip for each state (pure function `render_status(state) → { text, tooltip }`).
* Manual: switch profile from the quick pick → OBI Build view and status bar show the new profile; run a failing build → `$(error) n failed`.


### Definition of done
* Status bar item shows profile, running operation and last build result
* Quick pick with the listed actions; profile switch works
* `obi.status-bar.menu` and `obi.statusBar.enabled` in `package.json` and localized
* CHANGELOG entry
