# Multi-root workspaces

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (phase 1, Unreleased) | [usability.md U15](../improvements/usability.md#u15--multi-root-workspaces-only-use-the-first-folder) | [reload-free-config-changes.md](reload-free-config-changes.md) (phase 2) |


# Current situation

* 15 places use `vscode.workspace.workspaceFolders[0]` directly, e.g. [extension.ts:33-40](../../src/extension.ts#L33-L40), [Workspace.ts:39-57](../../src/extension/utilities/Workspace.ts#L39-L57), [Logger.ts:12-13](../../src/extension/utilities/Logger.ts#L12-L13), [OBIController.ts:121-124](../../src/webview/controller/OBIController.ts#L121-L124), [SourceListProvider.ts:641-644](../../src/webview/source_list/SourceListProvider.ts#L641-L644), and several `onReceiveMessage` handlers.
* If the OBI project is not the first folder of a multi-root workspace, the extension acts as if there were no project at all.


# New feature

## Phase 1: find the OBI folder

* `Workspace.get_obi_folder(): vscode.WorkspaceFolder | undefined` returns the first workspace folder containing `.obi/etc/app-config.toml`. `get_workspace()` / `get_workspace_uri()` use it.
* Replace all direct `workspaceFolders[0]` accesses with `Workspace` calls (grep must find none outside `Workspace.ts`).
* If more than one folder contains an OBI project, show once: "Several OBI projects found. OBI works with '<name>'. Working with several projects at the same time is not supported yet."
* Listen to `workspace.onDidChangeWorkspaceFolders` and re-run the project state update ([reload-free-config-changes.md](reload-free-config-changes.md)).
* `activation-events.md`: `workspaceContains` already matches any folder of a multi-root workspace.

## Phase 2 (optional): switch the active project

* Command `obi.select-project` (quick pick of OBI folders). The choice is stored in `workspaceState`.
* Switching re-initialises all services for the other folder: config caches, watchers, trees, SSH connection (different host/user). That needs the in-place re-initialisation from [reload-free-config-changes.md](reload-free-config-changes.md).


## Result

* [ObiFolder.ts](../../src/extension/utilities/ObiFolder.ts) picks the folder (a small module, so `Logger` and `ExtensionSettings` don't depend on `Workspace`); `Workspace` offers it to the rest of the code. `check-repo` refuses `workspaceFolders[0]` anywhere else.
* The config watcher of [ProjectState.ts](../../src/extension/ProjectState.ts) covers all folders, and `onDidChangeWorkspaceFolders` updates the state.
* Verified in a real VS Code: a `.code-workspace` with an empty folder first and the OBI project second; all pages open normally.
* Phase 2 (`obi.select-project`, switching between projects): **not done**, follow-up.


# Tests

* Integration test with a `.code-workspace` file containing a non-OBI folder first and the OBI test project second → OBI views show the project.
* Grep check in CI: `workspaceFolders\[0\]` only in `Workspace.ts`.


### Definition of done
* OBI works when the project isn't the first folder
* No direct `workspaceFolders[0]` outside `Workspace.ts`
* Info message for several OBI folders
* Phase 2 decided (implemented or recorded as follow-up)
* CHANGELOG entry
