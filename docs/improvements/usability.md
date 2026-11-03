# Usability improvements

Findings from a code review of v1.3.3 (2026-10-22). Covers feedback during long operations, error handling, onboarding, localisation and consistency with VS Code conventions.

Severity: 🔴 high · 🟠 medium · 🟡 low. See [README.md](README.md) for how this list is maintained.

Already tracked elsewhere: missing confirmations ([bugs.md #2–#5](../bugs.md#security--data-loss)), commands visible in the Command Palette that don't work ([bugs.md #9–#10](../bugs.md#broken-features)), misleading regex hint ([bugs.md #26](../bugs.md#26--misleading-hint-in-source-filter-configuration)).


## U1. 🟠 No live feedback while the build runs on the IBM i
* **Where:** [OBICommands.ts:47-118](../../src/extension/obi/OBICommands.ts#L47-L118), [OBICommands.ts:194-202](../../src/extension/obi/OBICommands.ts#L194-L202), [SSH_Tasks.ts:146-162](../../src/extension/utilities/SSH_Tasks.ts#L146-L162)
* **Current:** during "Run build on IBM i" the notification shows a static text until the whole remote run is finished, which can take minutes. Remote stdout/stderr is only written to the log afterwards. The progress bar never advances (`increment` is never reported).
* **Proposal:**
  * Stream output via node-ssh `execCommand(cmd, { onStdout, onStderr })` into the "OBI" output channel or a pseudoterminal, with a "Show output" button on the notification.
  * Report progress per source ("12 of 40: prouzalib/qrpglesrc/foo.rpgle.pgm"), e.g. by parsing OBI's output or polling the remote `compile-list.json`.


## U2. 🟠 Long-running operations cannot be cancelled
* **Where:** all `withProgress` calls, e.g. [OBICommands.ts:47-50](../../src/extension/obi/OBICommands.ts#L47-L50), [SSH_Tasks.ts:395-398](../../src/extension/utilities/SSH_Tasks.ts#L395-L398), [OBITools.ts:349-352](../../src/extension/utilities/OBITools.ts#L349-L352); cancel handler [OBIController.ts:237-241](../../src/webview/controller/OBIController.ts#L237-L241)
* **Current:** none of the progress notifications is `cancellable` (the only occurrence sets it to `false`). The cancel button in the OBI view only kills **local** processes and the local hash calculation. Remote builds and transfers keep running.
* **Proposal:** use `cancellable: true` and pass the `CancellationToken` down. On cancel, close the SSH exec channel (or send `SIGINT` via the channel) and stop pending SFTP transfers. Show "Build cancelled" instead of an error.


## U3. 🟠 Pressing Escape in an input box shows an error
* **Where:** 9 places that `throw new Error('Canceled by user…')`, e.g. [SourceListProvider.ts:197-198](../../src/webview/source_list/SourceListProvider.ts#L197-L198), [SourceListProvider.ts:329-331](../../src/webview/source_list/SourceListProvider.ts#L329-L331), [OBIController.ts:286-287](../../src/webview/controller/OBIController.ts#L286-L287), [SSH_Tasks.ts:32-33](../../src/extension/utilities/SSH_Tasks.ts#L32-L33)
* **Current:** the command handlers don't catch these errors, so VS Code reports a failed command for a normal cancel.
  For "Change description", clearing the field (to remove a description) is also treated as a cancel ([SourceListProvider.ts:329](../../src/webview/source_list/SourceListProvider.ts#L329)).
* **Proposal:** return quietly when `showInputBox` / `showQuickPick` returns `undefined`. Distinguish `''` (clear) from `undefined` (cancel).


## U4. 🟠 Config changes reload the whole window
* **Where:** 6 `workbench.action.reloadWindow` calls, e.g. [OBIConfiguration.ts:475-476](../../src/webview/controller/OBIConfiguration.ts#L475-L476), [OBITools.ts:1081-1099](../../src/extension/utilities/OBITools.ts#L1081-L1099), [OBITools.ts:458-461](../../src/extension/utilities/OBITools.ts#L458-L461)
* **Current:** completing the config, editing a config file while it's invalid, or initializing a folder reloads VS Code. Terminals restart, debug sessions end, and unsaved webview edits are lost.
* **Proposal:** register all providers and commands once at activation. Control visibility only through the `obi.contains_obi_project` / `obi.valid-config` context keys, and re-initialize in place when the config becomes valid.


## U5. 🟠 Error messages lack the cause and next steps; questions look like errors
* **Where:** 56 `showErrorMessage` calls, e.g. [OBITools.ts:982-985](../../src/extension/utilities/OBITools.ts#L982-L985), [OBITools.ts:330-331](../../src/extension/utilities/OBITools.ts#L330-L331); questions shown as errors in [OBITools.ts:227](../../src/extension/utilities/OBITools.ts#L227), [OBITools.ts:261](../../src/extension/utilities/OBITools.ts#L261), [OBITools.ts:384](../../src/extension/utilities/OBITools.ts#L384), [OBITools.ts:397](../../src/extension/utilities/OBITools.ts#L397), [OBITools.ts:1005](../../src/extension/utilities/OBITools.ts#L1005)
* **Current:**
  * Messages like "Error occured during transfer to remote" hide the actual cause, which is only in the log.
  * No message offers a way to open the log or the configuration.
  * Yes/No questions ("Do you want to transfer all?") use the red error style.
* **Proposal:**
  * Add one helper `show_error(message, error)` that includes the cause and offers *Show log* (`outputChannel.show()`) and, where relevant, *Open configuration*.
  * Use `showWarningMessage` / `showInformationMessage` for questions.
  * Fix typos while at it ("occured", "korrekt", "transfered", "Dependend", "Transer").


## U6. 🟠 SSH authentication options are limited
* **Where:** [SSH_Tasks.ts:83-135](../../src/extension/utilities/SSH_Tasks.ts#L83-L135)
* **Current:**
  * A password typed into the prompt is not offered for saving, so it must be entered again after every restart unless set in the config page.
  * Encrypted private keys (passphrase) are not supported.
  * `ssh-agent` is not used.
  * The SSH port cannot be configured (always 22).
  * `~` in the key path isn't expanded ([bugs.md #23](../bugs.md#23--ssh-key-placeholder-uses--which-is-not-supported)).
* **Proposal:**
  * After a successful password login, ask "Save password for this profile?" and store it in `SecretStorage`.
  * Prompt for a key passphrase and store it in `SecretStorage`.
  * Support `agent: process.env.SSH_AUTH_SOCK` (Pageant on Windows).
  * Add an `ssh-port` setting.
  * Expand `~` locally.


## U7. 🟠 No status bar item
* **Where:** no `createStatusBarItem` anywhere in [src/](../../src/)
* **Current:** the active profile, connection state and the result of the last build are only visible inside the OBI side bar.
* **Proposal:** add one status bar item, e.g. `$(server) prod-profile · $(check) last build 10:42`. Show a spinner while running. Clicking it opens the build summary, or a quick pick to switch profile, run a build or open the log.


## U8. 🟠 Compile errors only reach the Problems view for the active editor
* **Where:** [compile-diagnostics.ts:59-112](../../src/extension/source/compile-diagnostics.ts#L59-L112), [BuildSummary.ts:115-124](../../src/webview/show_changes/BuildSummary.ts#L115-L124)
* **Current:**
  * Diagnostics are created only when a source is opened from the build summary, and they are attached to whatever editor is active.
  * The file location of each marker is ignored, so copybook errors are shown in the main source (matches [ToDo.md](../../ToDo.md)).
  * The range is always columns 0–100.
* **Proposal:**
  * After every build, parse all evfevent files of the built sources and set diagnostics per referenced file. Map the event file's location to the workspace path, including copybooks.
  * Use the record's real column range.
  * Clear diagnostics of sources that now compile successfully.
  * This makes failed builds navigable via the Problems view (F8).


## U9. 🟡 Build history grows forever
* **Where:** [OBICommands.ts:228-232](../../src/extension/obi/OBICommands.ts#L228-L232), [BuildHistoryProvider.ts](../../src/webview/build_history/BuildHistoryProvider.ts)
* **Current:** each build copies `compile-list.json` and the whole `.obi/tmp` into `.obi/build-history/<timestamp>`. There is no retention and no "delete all".
* **Proposal:** add a setting "keep last N builds / N days" (applied after each build), a "Delete all history" action and the history size in the view title or tooltip.


## U10. 🟡 Webviews lose position, scroll and expanded state
* **Where:** [BuildSummary.ts:76-79](../../src/webview/show_changes/BuildSummary.ts#L76-L79), [BuildSummary.ts:420](../../src/webview/show_changes/BuildSummary.ts#L420)
* **Current:** the build summary is disposed and recreated on every render, so a panel moved to another editor group jumps back to column one. Every update resets scroll position and opened `<details>`.
* **Proposal:** reuse and `reveal()` the panel, update through messages, and keep UI state with `vscode.setState()` / `getState()` (see [performance.md P11](performance.md#p11--webviews-are-fully-re-rendered-for-every-change)).


## U11. 🟡 Localisation is incomplete
* **Where:** [package.nls.json](../../package.nls.json), [package.nls.de.json](../../package.nls.de.json), [package.nls.en.json](../../package.nls.en.json), [package.json](../../package.json)
* **Current:**
  * The base file has 218 keys, `en` 149 and `de` 152. 68 keys have no German text.
  * 11 command titles (all build-history commands, `obi.source-quick-search`, `obi.clearDiagnostics`, …) and 2 view names ("OBI Build", "Build history") are hard-coded English.
  * Runtime messages in TypeScript are English only.
  * Missing keys are written into the installed extension at runtime ([bugs.md #27](../bugs.md#27--localetext-writes-into-the-installed-extension)).
* **Proposal:**
  * Use `%key%` for all contributions and complete `de`.
  * Add a check (test or CI script) that fails on keys missing in a language file.
  * Use the `vscode.l10n` API for strings in TypeScript (needs the engine bump, [maintainability.md M9](maintainability.md#m9--outdated-vs-code-engine)).


## U12. 🟡 No settings, walkthrough or keybindings
* **Where:** [package.json](../../package.json) (no `contributes.configuration`, `walkthroughs`, `keybindings`)
* **Current:** behaviour like log level, history retention or confirmations can't be adjusted. New users have to find [getting-started.md](../../asserts/docs/getting-started.md) themselves.
* **Proposal:**
  * Add `contributes.configuration` for extension-level preferences (log level, history retention, status bar, streaming output).
  * Add a walkthrough: initialize → connection → first "Show changes" → first build.
  * Add default keybindings for *Run single build* and *Show single changes* (editor scope, `when` = supported file).


## U13. 🟡 Use native VS Code icons
* **Where:** [SourceListProvider.ts:633-660](../../src/webview/source_list/SourceListProvider.ts#L633-L660), [asserts/img/](../../asserts/img/)
* **Current:** tree items use copies of codicon SVGs (`edit.svg`, `error.svg`) from `asserts/img/{dark,light}`. These copies don't follow the icon theme or colour. `asserts/img` contains 1,014 SVGs (6.8 MB including `light_old`) of which only these 2 are referenced.
* **Proposal:** use `new vscode.ThemeIcon('edit')` / `new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'))`, as required by [architecture.md → GUI](../architecture.md#gui), and delete `asserts/img/{dark,light,light_old}`.


## U14. 🟡 JSON files have no schema
* **Where:** `.obi/etc/dependency.json`, `.obi/etc/source-infos.json`, `.obi/source-list/*.json`, `compile-list.json`
* **Current:** hand-editing these files gets no completion or validation. Mistakes show up later as "Error in json file".
* **Proposal:** ship JSON schemas and register them via `contributes.jsonValidation`. The `compile-list.json` schema can also serve as the contract with the Python OBI ([maintainability.md M12](maintainability.md#m12--compile-list-logic-exists-twice-typescript-and-python)).


## U15. 🟡 Multi-root workspaces only use the first folder
* **Where:** 15 uses of `workspaceFolders[0]`, e.g. [Workspace.ts:39-57](../../src/extension/utilities/Workspace.ts#L39-L57), [extension.ts:33-40](../../src/extension.ts#L33-L40)
* **Current:** if the OBI project isn't the first folder of a multi-root workspace, the extension acts as if there were no project.
* **Proposal:** short term, detect the OBI project among all folders (or warn). Long term, keep the workspace folder in one place (`Workspace`) so it can become selectable.
