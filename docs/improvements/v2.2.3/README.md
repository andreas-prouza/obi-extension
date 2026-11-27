# Improvement list (v2.2.3)

Open points from a review at v2.2.3 (2026-11-26), checked against the code and the backend (`../obi`). Only points worth a spec are listed; items already tracked in [docs/features/](../../features/) are left out.

Severity: 🔴 high (data loss, broken core feature) · 🟠 medium (wrong behaviour, high-value gap) · 🟡 low (cleanup, polish). See [../README.md#workflow](../README.md#workflow) for how items become specs.

Suggested order: the features and process items; D1 after a release with the deprecation note. Done: R1 (deleting a profile, [bugfix/profile-delete.md](../../bugfix/profile-delete.md)), R2 (ESP conditions, [bugfix/esp-conditions.md](../../bugfix/esp-conditions.md)), R3 (SSH host and user, [bugfix/ssh-session-user.md](../../bugfix/ssh-session-user.md)), R4 (delete source, [bugfix/source-delete.md](../../bugfix/source-delete.md)), R5 (command output, [bugfix/system-cmd-close.md](../../bugfix/system-cmd-close.md)), R6 (self_check, [bugfix/self-check-files.md](../../bugfix/self-check-files.md)), R7 (folder watchdog, [bugfix/watchdog-recreate-folders.md](../../bugfix/watchdog-recreate-folders.md)), R8 (source variables, [bugfix/source-variables-port.md](../../bugfix/source-variables-port.md)), D2 (deployment card updates, [features/build-summary-card-updates.md](../../features/build-summary-card-updates.md)), D3 (layers, [features/layer-imports.md](../../features/layer-imports.md)), D4 (manifest and dead code, [features/manifest-cleanup.md](../../features/manifest-cleanup.md)), F1 test connection ([features/test-connection.md](../../features/test-connection.md)), F2 (switch project folder, [features/switch-project-folder.md](../../features/switch-project-folder.md)).


## Bugs

All bug items (R1–R8) are done; see the list above.


## Design and performance

### D1. 🟡 Remove `@vscode/webview-ui-toolkit` (last step)
* **Where:** [custom_toolkit.ts](../../../src/webview/show_changes/javascript/custom_toolkit.ts), `BuildSummary.custom_template`, [package.json](../../../package.json), [features/dependency-hygiene.md](../../features/dependency-hygiene.md#4-replace-the-deprecated-webview-toolkit)
* **Current:** Done in Unreleased: the toolkit is only loaded for a custom build summary template that uses its components (`show_changes.js` 382 KB → 7.9 KB), and those components are documented as deprecated. The package is still a dependency for them.
* **Proposal:** After a release with the deprecation note, remove the package and `custom_toolkit.ts`, and say so in the CHANGELOG.

## Features

### F1. 🟡 `~/.ssh/config` and jump hosts
* **Where:** [SSH_Tasks.ts](../../../src/extension/utilities/SSH_Tasks.ts), [SshAuth.ts](../../../src/extension/utilities/SshAuth.ts)
* **Current:** *Test connection* is done ([features/test-connection.md](../../features/test-connection.md)). Host aliases, `IdentityFile` and `ProxyJump` of `~/.ssh/config` are not used: everything has to be in the user configuration.
* **Proposal:** Evaluate resolving `~/.ssh/config` (alias, port, user, key) and tunnelling through a `ProxyJump` host, for an IBM i that is only reachable through a jump host.

### F3. 🟡 Build summary: filter and compare builds
* **Where:** [show_changes.ts](../../../src/webview/show_changes/javascript/show_changes.ts), [BuildHistoryProvider.ts](../../../src/webview/build_history/BuildHistoryProvider.ts)
* **Current:** Large build lists can only be scrolled. Two builds of the history can't be compared. (Rebuilding only the failed sources needs nothing new: *Run build* skips commands with status `success`.)
* **Proposal:** Text filter and status filter (failed / to build / built) above the build list; *Compare with…* in the build history (diff of the two build lists).


## Process

### PR1. 🟠 Release workflow
* **Where:** [.github/workflows/](../../../.github/workflows/)
* **Current:** Packaging and publishing are manual.
* **Proposal:** A workflow on tags `v*.*.*`: check tag = `package.json` version and a `CHANGELOG.md` section, run CI, build the VSIX, attach it to a GitHub release, optionally publish to the Marketplace and Open VSX.

### PR2. 🟡 Spec lifecycle doesn't match the workflow
* **Where:** [../README.md#workflow](../README.md#workflow), [docs/features/](../../features/), [docs/bugfix/](../../bugfix/), [bugs.md](../../bugs.md)
* **Current:** The workflow says finished specs move to `done/`; 50 of 63 specs in `docs/features/` and 28 of 30 in `docs/bugfix/` are finished and still there. `bugs.md` mixes fixed and open entries.
* **Proposal:** Either move finished specs to `done/` or drop the rule and rely on the status. Separate open and fixed bugs.
