# Switch project folder (several OBI projects in a multi-root workspace)

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (integration tests in MultiRoot.test.ts; the reload itself is stubbed there) | [improvements v2.2.3 F2](../improvements/v2.2.3/README.md) | [layer-imports.md](layer-imports.md) |


# Current situation

With more than one OBI project in a multi-root workspace, OBI used the first one and said once that several projects aren't supported. Working with another one meant opening it in a window of its own.


# New feature

* Command `obi.switch-project-folder` (*OBI: Switch project folder*): in the Command Palette with an OBI project and more than one workspace folder, in the status bar menu with more than one OBI project, and as a button of the message about several projects.
* [ProjectFolderSwitch.ts](../../src/extension/utilities/ProjectFolderSwitch.ts): a quick pick of the OBI projects (the current one marked), a modal confirmation, then the URI goes to `workspaceState` (`obi.project-folder`) and the window is reloaded. Refused while an operation runs (`OperationLock`).
* `ObiFolder.current_folder()` uses the chosen folder if there are several OBI projects and it is one of them; otherwise the first project, as before. `restore_project_folder` sets it first thing in `activate`.
* The message about several projects names the folder actually used and offers the switch.

**Decision (2026-11-26): reload instead of switching in place.** The folder is captured at activation by log files, three tree providers, the file watchers, caches, the SSH connection and open panels; following a switch in all of them would be a large refactor with the risk of leftovers from the previous project. After the reload, every part starts with the new project.


# Tests

Integration ([MultiRoot.test.ts](../../src/test/suite/MultiRoot.test.ts)):

* The chosen folder is used; an unknown choice gives the first project; with one folder the choice is ignored.
* Switch: the current folder is marked, the choice is stored and the window reload is requested; a cancelled confirmation stores nothing; while an operation runs it is refused.


# Definition of done

* [x] Feature and tests
* [x] configuration.md, CHANGELOG
* [x] Entry F2 removed from the improvement list
