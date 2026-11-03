# Improvement lists

Results of a full code review of the OBI extension at v1.3.3 (2026-10-22), covering `src/`, `asserts/templates/`, `package.json`, the build/test setup and the project template in `obi-media/`.

| List | Topic | 🔴 | 🟠 | 🟡 |
|---|---|---|---|---|
| [security.md](security.md) | Remote command execution, SSH, webviews, secrets, supply chain | 5 | 5 | 5 |
| [performance.md](performance.md) | Hashing, build-list generation, watchers, transfers, webviews | 2 | 6 | 6 |
| [usability.md](usability.md) | Feedback, cancellation, errors, onboarding, localisation, icons | – | 8 | 7 |
| [reliability.md](reliability.md) | Bugs and robustness issues not yet in [bugs.md](../bugs.md) | 2 | 7 | 7 |
| [maintainability.md](maintainability.md) | Tests, CI, packaging, dependencies, code structure | 1 | 5 | 7 |

Severity: 🔴 high (security hole, data loss, blocks development) · 🟠 medium (wrong or slow behaviour users notice) · 🟡 low (cleanup, polish)

Every entry has **Where** (clickable file/line links), **Current** (what the code does today) and **Proposal**. Line numbers refer to the state at the time of the review.


## Workflow

1. **Improvement** (this folder): short description with source links.
2. **Implementation spec**: [features/](../features/) for features and refactorings, [bugfix/](../bugfix/) for bugfixes. Each spec starts with a header table *Type · Severity · Status · Source · Depends on*, followed by *Current situation*, *New feature* / *Fix*, *Tests* and *Definition of done*.
3. **Status** in the spec header ([architecture.md](../architecture.md#features)): `draft` (not ready to implement, e.g. waiting for a decision) → `ready` → `finished`; a note in brackets says what is left or how it was verified. When finished, move the spec to `done/` in its folder, remove the improvement entry here, and update the [CHANGELOG](../../CHANGELOG.md) as required by [architecture.md](../architecture.md#updates).

[bugs.md](../bugs.md) lists behaviour that contradicts the user documentation. Several of those entries are fixed as part of a spec (see the table at the end).


## Implementation specs

### Security

| Id | Improvement | Spec |
|---|---|---|
| S1 | 🔴 SSH host key is never verified | [features/ssh-host-key-verification.md](../features/ssh-host-key-verification.md) |
| S2 | 🔴 Remote shell commands lose their quoting | [bugfix/remote-command-quoting.md](../bugfix/remote-command-quoting.md) |
| S3 | 🔴 Unquoted, weakly guarded `rm -rf` | [bugfix/remote-delete-guard.md](../bugfix/remote-delete-guard.md) |
| S4 | 🔴 Stored secrets in webview HTML | [bugfix/secrets-in-webview-html.md](../bugfix/secrets-in-webview-html.md) |
| S5 | 🔴 Stored XSS in the source description editor | [bugfix/source-description-xss.md](../bugfix/source-description-xss.md) |
| S6 | 🟠 No Content-Security-Policy | [features/webview-csp.md](../features/webview-csp.md) |
| S7 | 🟠 Webview messages not validated | [features/webview-message-protocol.md](../features/webview-message-protocol.md) |
| S8 | 🟠 Workspace template runs in the extension host | [features/workspace-trust.md](../features/workspace-trust.md) |
| S9 | 🟠 Sensitive files uploaded to the IBM i | [bugfix/sensitive-files-upload.md](../bugfix/sensitive-files-upload.md) |
| S10 | 🟠 No `.gitignore` in the template | [features/project-template-gitignore.md](../features/project-template-gitignore.md) |
| S11 | 🟡 Log files unbounded and verbose | [features/log-level-and-rotation.md](../features/log-level-and-rotation.md) |
| S12 | 🟡 Profile names allow path traversal | [bugfix/profile-name-validation.md](../bugfix/profile-name-validation.md) |
| S13 | 🟡 i-Releaser token in the URL | [bugfix/i-releaser-token-in-url.md](../bugfix/i-releaser-token-in-url.md) |
| S14 | 🟡 SecretStorage used for UI state | [bugfix/secret-storage-ui-state.md](../bugfix/secret-storage-ui-state.md) |
| S15 | 🟡 Vendored libraries outside auditing | [features/dependency-hygiene.md](../features/dependency-hygiene.md) |

### Performance

| Id | Improvement | Spec |
|---|---|---|
| P1 | 🔴 Source tree hashed twice | [features/source-hashing.md](../features/source-hashing.md) |
| P2 | 🔴 `source-config.toml` parsed ~5× per source | [features/build-list-config-caching.md](../features/build-list-config-caching.md) |
| P3 | 🟠 Dependency resolution quadratic or worse | [features/dependency-graph.md](../features/dependency-graph.md) |
| P4 | 🟠 Activates in every window | [features/activation-events.md](../features/activation-events.md) |
| P5 | 🟠 Time-based config cache | [features/config-cache-invalidation.md](../features/config-cache-invalidation.md) |
| P6 | 🟠 File watcher hashing and refresh storms | [features/file-watcher-debounce.md](../features/file-watcher-debounce.md) |
| P7 | 🟠 Source filter tree rescans `src/` | [features/source-filter-tree-performance.md](../features/source-filter-tree-performance.md) |
| P8 | 🟠 SSH transfers file by file | [features/ssh-transfer-optimization.md](../features/ssh-transfer-optimization.md) |
| P9 | 🟡 `compile-list.json` size | [features/compile-list-size.md](../features/compile-list-size.md) |
| P10 | 🟡 Duplicated webview bundles, Nunjucks reconfigured | [features/webview-bundling.md](../features/webview-bundling.md) |
| P11 | 🟡 Full webview re-render | [features/webview-state-updates.md](../features/webview-state-updates.md) |
| P12 | 🟡 Synchronous file I/O | split across [source-hashing.md](../features/source-hashing.md), [build-list-config-caching.md](../features/build-list-config-caching.md), [source-filter-tree-performance.md](../features/source-filter-tree-performance.md) |
| P13 | 🟡 Batched hashing, quadratic concatenation | [features/source-hashing.md](../features/source-hashing.md) |
| P14 | 🟡 SSH keepalive every 3.6 s | [bugfix/ssh-keepalive-interval.md](../bugfix/ssh-keepalive-interval.md) |

### Usability

| Id | Improvement | Spec |
|---|---|---|
| U1, U2 | 🟠 No live build output; no cancellation | [features/remote-build-output-and-cancel.md](../features/remote-build-output-and-cancel.md) |
| U3 | 🟠 Escape shows an error | [bugfix/input-cancel-shows-error.md](../bugfix/input-cancel-shows-error.md) |
| U4 | 🟠 Config changes reload the window | [features/reload-free-config-changes.md](../features/reload-free-config-changes.md) |
| U5 | 🟠 Error messages without cause/actions | [features/error-messages.md](../features/error-messages.md) |
| U6 | 🟠 Limited SSH authentication | [features/ssh-authentication-options.md](../features/ssh-authentication-options.md) |
| U7 | 🟠 No status bar item | [features/status-bar.md](../features/status-bar.md) |
| U8 | 🟠 Compile errors only for the active editor | [features/compile-diagnostics.md](../features/compile-diagnostics.md) |
| U9 | 🟡 Build history grows forever | [features/build-history-retention.md](../features/build-history-retention.md) |
| U10 | 🟡 Webviews lose position and state | [features/webview-state-updates.md](../features/webview-state-updates.md) |
| U11 | 🟡 Incomplete localisation | [features/localisation.md](../features/localisation.md) |
| U12 | 🟡 No settings, walkthrough, keybindings | [features/settings-walkthrough-keybindings.md](../features/settings-walkthrough-keybindings.md) |
| U13 | 🟡 Native icons | [features/native-tree-icons.md](../features/native-tree-icons.md) |
| U14 | 🟡 JSON files without schema | [features/json-schemas.md](../features/json-schemas.md) |
| U15 | 🟡 Multi-root workspaces | [features/multi-root-workspace.md](../features/multi-root-workspace.md) |

### Reliability

| Id | Improvement | Spec |
|---|---|---|
| R1 | 🔴 Migrations rewrite the config on fresh clones | [bugfix/config-migration-on-fresh-clone.md](../bugfix/config-migration-on-fresh-clone.md) |
| R2 | 🔴 TOML syntax error + UI save wipes the file | [bugfix/config-overwrite-on-parse-error.md](../bugfix/config-overwrite-on-parse-error.md) |
| R3 | 🟠 Swallowed write errors, non-atomic writes | [bugfix/swallowed-write-errors.md](../bugfix/swallowed-write-errors.md) |
| R4 | 🟠 UI save drops TOML comments | [features/toml-format-preserving-save.md](../features/toml-format-preserving-save.md) |
| R5 | 🟠 Self-referencing variable crashes | [bugfix/self-referencing-variable.md](../bugfix/self-referencing-variable.md) |
| R6 | 🟠 Operation guards race | [bugfix/operation-lock.md](../bugfix/operation-lock.md) |
| R7 | 🟠 `SystemCmdExecution` exit/cancel handling | [bugfix/system-cmd-exit-handling.md](../bugfix/system-cmd-exit-handling.md) |
| R8 | 🟠 Partial transfer failures unnoticed | [bugfix/partial-transfer-failures.md](../bugfix/partial-transfer-failures.md) |
| R9 | 🟠 Build history timestamps | [bugfix/build-history-timestamps.md](../bugfix/build-history-timestamps.md) |
| R10 | 🟡 OBI Build view state / listeners | [bugfix/controller-view-retain-context.md](../bugfix/controller-view-retain-context.md) |
| R11 | 🟡 Windows source paths | [bugfix/windows-source-path.md](../bugfix/windows-source-path.md) |
| R12 | 🟡 Remote-workspace file URIs | [bugfix/remote-workspace-uris.md](../bugfix/remote-workspace-uris.md) |
| R13 | 🟡 "Old sources" never detected | [bugfix/old-sources-cleanup.md](../bugfix/old-sources-cleanup.md) |
| R14 | 🟡 No `deactivate`, unregistered disposables | [bugfix/disposables-and-deactivate.md](../bugfix/disposables-and-deactivate.md) |
| R15 | 🟡 Missing/broken files break views | [bugfix/missing-files-break-views.md](../bugfix/missing-files-break-views.md) |
| R16 | 🟡 Remote home assumed `/home/<user>` | [bugfix/remote-home-directory.md](../bugfix/remote-home-directory.md) |

### Maintainability

| Id | Improvement | Spec |
|---|---|---|
| M1, M2 | 🔴 `npm test` can't run; tests overwrite the bundle | [bugfix/test-setup.md](../bugfix/test-setup.md) |
| M3 | 🟠 No CI | [features/continuous-integration.md](../features/continuous-integration.md) |
| M4 | 🟠 VSIX size | [features/vsix-package-size.md](../features/vsix-package-size.md) |
| M5 | 🟠 Unused/undeclared/deprecated dependencies | [features/dependency-hygiene.md](../features/dependency-hygiene.md) |
| M6 | 🟠 Dead code | [features/remove-dead-code.md](../features/remove-dead-code.md) |
| M7 | 🟡 Module structure | [features/module-structure.md](../features/module-structure.md) |
| M8 | 🟡 Hard-coded removable parameters | [bugfix/unresolved-cmd-parameters.md](../bugfix/unresolved-cmd-parameters.md) |
| M9 | 🟡 Outdated VS Code engine | [features/vscode-engine-bump.md](../features/vscode-engine-bump.md) |
| M10 | 🟡 13 esbuild configs | [features/webview-bundling.md](../features/webview-bundling.md) |
| M11 | 🟡 Untyped message protocol | [features/webview-message-protocol.md](../features/webview-message-protocol.md) |
| M12 | 🟡 Compile-list logic twice (TS/Python) | [features/json-schemas.md](../features/json-schemas.md) |
| M13 | 🟡 Repository hygiene | [features/repository-hygiene.md](../features/repository-hygiene.md) |

### bugs.md entries fixed by a spec

| bugs.md | Spec |
|---|---|
| [#1](../bugs.md#1--secret-variables-are-stored-in-plain-text-in-the-build-history) secrets in history | [compile-list-size.md](../features/compile-list-size.md) |
| [#3](../bugs.md#3--delete-source-filter-and-delete-build-history-date-have-no-confirmation) (history part), [#6](../bugs.md#6--build-history-delete-single-build-button-never-shows) | [build-history-retention.md](../features/build-history-retention.md) |
| [#4](../bugs.md#4--transfer-all-deletes-the-remote-project-folder) | [remote-delete-guard.md](../bugfix/remote-delete-guard.md) |
| [#9](../bugs.md#9--contributed-commands-that-are-not-registered) (test) | [disposables-and-deactivate.md](../bugfix/disposables-and-deactivate.md) |
| [#12](../bugs.md#12--ssh-concurrency-is-ignored) | [ssh-transfer-optimization.md](../features/ssh-transfer-optimization.md) |
| [#13](../bugs.md#13--missing-mandatory-config-only-warns) | [reload-free-config-changes.md](../features/reload-free-config-changes.md) |
| [#15](../bugs.md#15--empty-sources-are-always-shown-as-changed) | [source-hashing.md](../features/source-hashing.md) |
| [#16](../bugs.md#16--compile-diagnostics-ignore-evfevent-output-dir) | [compile-diagnostics.md](../features/compile-diagnostics.md) |
| [#17](../bugs.md#17--build-history-delete-by-date-may-miss-builds-around-midnight) | [build-history-timestamps.md](../bugfix/build-history-timestamps.md) |
| [#19](../bugs.md#19--inverted-check-in-replace_env_variables) | [remote-home-directory.md](../bugfix/remote-home-directory.md) |
| [#23](../bugs.md#23--ssh-key-placeholder-uses--which-is-not-supported) | [ssh-authentication-options.md](../features/ssh-authentication-options.md) |
| [#24](../bugs.md#24--dead-configuration-keys) | [remove-dead-code.md](../features/remove-dead-code.md) |
| [#27](../bugs.md#27--localetext-writes-into-the-installed-extension) | [localisation.md](../features/localisation.md) |


## Suggested order

0. **Foundation:** [test-setup.md](../bugfix/test-setup.md), then [continuous-integration.md](../features/continuous-integration.md). This is the safety net for everything below.
1. **Secure the remote side:** [remote-home-directory.md](../bugfix/remote-home-directory.md) → [remote-command-quoting.md](../bugfix/remote-command-quoting.md) → [remote-delete-guard.md](../bugfix/remote-delete-guard.md); [ssh-host-key-verification.md](../features/ssh-host-key-verification.md). Do this together with [command-injection-hardening.md](../features/command-injection-hardening.md).
2. **Secure the webviews:** [secrets-in-webview-html.md](../bugfix/secrets-in-webview-html.md), [source-description-xss.md](../bugfix/source-description-xss.md) → [webview-csp.md](../features/webview-csp.md), [webview-message-protocol.md](../features/webview-message-protocol.md).
3. **Protect the config files:** [config-overwrite-on-parse-error.md](../bugfix/config-overwrite-on-parse-error.md) + [swallowed-write-errors.md](../bugfix/swallowed-write-errors.md) → [config-migration-on-fresh-clone.md](../bugfix/config-migration-on-fresh-clone.md).
4. **Robust operations:** [operation-lock.md](../bugfix/operation-lock.md), [input-cancel-shows-error.md](../bugfix/input-cancel-shows-error.md), [system-cmd-exit-handling.md](../bugfix/system-cmd-exit-handling.md), [error-messages.md](../features/error-messages.md).
5. **Speed up "Show changes":** [source-hashing.md](../features/source-hashing.md), [build-list-config-caching.md](../features/build-list-config-caching.md), [dependency-graph.md](../features/dependency-graph.md).
6. **Build feedback:** [remote-build-output-and-cancel.md](../features/remote-build-output-and-cancel.md), [compile-diagnostics.md](../features/compile-diagnostics.md), [status-bar.md](../features/status-bar.md).
7. **Platform update and packaging:** [vscode-engine-bump.md](../features/vscode-engine-bump.md) → [activation-events.md](../features/activation-events.md), [localisation.md](../features/localisation.md), [log-level-and-rotation.md](../features/log-level-and-rotation.md); [dependency-hygiene.md](../features/dependency-hygiene.md), [vsix-package-size.md](../features/vsix-package-size.md).

Steps 1–3 are independent of each other. The remaining specs can be picked up in any order; their *Depends on* column lists the prerequisites.


## Method and limits

* Static review of the code. No profiling and no tests against a real IBM i.
* Verified locally:
  * the quoting behaviour in [S2](security.md#s2--remote-shell-commands-lose-their-quoting) (reproduced with `bash`);
  * the history timestamp parsing in [R9](reliability.md#r9--build-history-timestamps-are-parsed-inconsistently) (Node);
  * the `tsc` and ESLint error counts in [M1](maintainability.md#m1--npm-test-cannot-run);
  * the VSIX file list in [M4](maintainability.md#m4--the-vsix-would-contain-about-5500-files--20-mb) (`vsce ls` on the working tree at review time).
* No npm network audit was run. Please run `npm audit` as part of [continuous-integration.md](../features/continuous-integration.md).
