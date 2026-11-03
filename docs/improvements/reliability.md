# Reliability improvements

Correctness and robustness problems found during the code review of v1.3.3 (2026-10-22) that are **not** yet in [bugs.md](../bugs.md). Each entry has an implementation spec in [docs/bugfix/](../bugfix/) (see the [index](README.md#implementation-specs)).

Severity: 🔴 high · 🟠 medium · 🟡 low. See [README.md](README.md) for how this list is maintained.


## R1. 🔴 Migrations run again on every fresh clone and rewrite the project config
* **Where:** [OBITools.ts:56-57](../../src/extension/utilities/OBITools.ts#L56-L57), [OBITools.ts:107-140](../../src/extension/utilities/OBITools.ts#L107-L140)
* **Current:**
  * The "previous version" comes from `workspaceState`, which is per machine. After a fresh clone, on a second PC or after clearing state, it is `undefined` → `0`, so **every** migration runs.
  * The `<= 2.2.1` step rewrites `app-config.toml` through `smol-toml`. All comments and formatting are lost.
  * It also resets `compiled-object-list`, `remote-source-list`, `source-list` and `dependency-list` to the code defaults. The shipped template uses `source-list = ".obi/etc/source-list-local.json"`, the default is `.obi/etc/source-list.json`, so the value changes.
  * `constants.py` and `logger_config.py` are overwritten.
  * This modifies a committed file just by opening the project.
* **Proposal:**
  * Store a config schema version in the project and migrate only when it is lower.
  * Make migrations non-destructive, show what changed, and back up the file before writing.


## R2. 🔴 A TOML syntax error plus one save in the UI wipes the config file
* **Where:** [DirTool.ts:315-338](../../src/extension/utilities/DirTool.ts#L315-L338), [AppConfig.ts:457-474](../../src/extension/config/AppConfig.ts#L457-L474), [OBISourceConfiguration.ts:208-266](../../src/webview/controller/OBISourceConfiguration.ts#L208-L266), [OBIConfiguration.ts:399-412](../../src/webview/controller/OBIConfiguration.ts#L399-L412), [OBIConfiguration.ts:424-472](../../src/webview/controller/OBIConfiguration.ts#L424-L472)
* **Current:**
  * `get_toml` returns `undefined` on a parse error and only logs it. Callers treat this like "file is empty" (`get_source_configs() || {}`, `new AppConfig(undefined, …)`) and write their result back.
  * After one typo in a hand-edited `source-config.toml`, the next save from the source config page replaces the whole file with that one source. The same happens to user configs and the project config.
  * `OBISourceConfiguration` also builds objects with literal keys: `{source_name : source_config}` and `{key: value}` create entries named `source_name` / `key` when the file is missing or unreadable.
* **Proposal:**
  * Distinguish "file missing" from "file unreadable".
  * Refuse to write a file that could not be parsed, and show the parse error with line and column.
  * Use computed keys.


## R3. 🟠 Write errors are swallowed, and writes are not atomic
* **Where:** [DirTool.ts:247-265](../../src/extension/utilities/DirTool.ts#L247-L265), [DirTool.ts:341-361](../../src/extension/utilities/DirTool.ts#L341-L361), [DirTool.ts:365-383](../../src/extension/utilities/DirTool.ts#L365-L383), [OBIConfiguration.ts:419](../../src/webview/controller/OBIConfiguration.ts#L419)
* **Current:**
  * `write_json`, `write_toml` and `write_file` catch every error and only log it. Callers can't react.
  * The config page shows "Configuration saved" **before** writing.
  * `writeFileSync` truncates first, so a crash during the write leaves an empty or partial JSON/TOML file.
* **Proposal:**
  * Let write errors propagate.
  * Write atomically (write `file.tmp`, then `rename`).
  * Show the success message only after the write succeeded.


## R4. 🟠 Saving through the UI drops comments in TOML files
* **Where:** [DirTool.ts:341-361](../../src/extension/utilities/DirTool.ts#L341-L361), used for `app-config.toml`, user configs, `source-config.toml` and the ESP config
* **Current:** the TOML is parsed and re-serialized, so hand-written comments (the template contains several) and ordering disappear on the first save from the config page.
* **Proposal:** at minimum, say so in the config UI and in [configuration.md](../../asserts/docs/configuration.md). Better: update only the touched keys in the original text. A format-preserving TOML library must meet the [package criteria](../architecture.md#npm).


## R5. 🟠 A self-referencing variable crashes build-list generation
* **Where:** [build_cmds.ts:117-130](../../src/extension/obi/compile_list/modules/build_cmds.ts#L117-L130)
* **Current:**
  * `replaceCmdParameters` recurses whenever a replacement changed the command, with no depth limit.
  * A variable such as `A = "x $(A)"`, or two variables referencing each other, causes infinite recursion and a stack overflow.
  * Keys are put into a `RegExp` unescaped (`global.cmds.x` contains `.`).
* **Proposal:** iterate with a maximum depth and fail with an error naming the variable. Use one regex for all keys.


## R6. 🟠 Operation guards race and don't cover each other
* **Where:** [OBICommands.ts:296-354](../../src/extension/obi/OBICommands.ts#L296-L354), [OBITools.ts:28-29](../../src/extension/utilities/OBITools.ts#L28-L29)
* **Current:**
  * `run_build` checks `run_build_status` but sets it only later in `rerun_build`.
  * Separate flags exist for build, show changes, remote source list, reset object list, remote check and transfer-all. These can run at the same time against the same SSH connection and the same `.obi/tmp` (which `generate_source_change_lists` deletes).
* **Proposal:** use one operation lock for everything that touches `.obi/tmp`, the compile-list or the remote folder. Disable the corresponding buttons while it is held.


## R7. 🟠 `SystemCmdExecution` resolves after rejecting; cancel detection is dead code
* **Where:** [SystemCmdExecution.ts:38-47](../../src/extension/utilities/SystemCmdExecution.ts#L38-L47), [OBICommands.ts:149-153](../../src/extension/obi/OBICommands.ts#L149-L153), [OBIController.ts:82-85](../../src/webview/controller/OBIController.ts#L82-L85)
* **Current:**
  * On a non-zero exit code the promise is rejected, then the handler continues, logs "System command succeeded" and calls `resolve()`.
  * Callers check `error.signal === 'SIGTERM'`, but the rejected `Error` has no `signal`, so cancelling shows a generic failure.
  * With `shell: true`, `kill()` only stops the shell, and the Python child keeps running.
  * Entries in `processes` are never removed.
* **Proposal:** `return` after `reject`, attach `code` and `signal` to the error, kill the whole process tree, and delete the map entry on exit.


## R8. 🟠 Partial transfer failures go unnoticed
* **Where:** [SSH_Tasks.ts:177-211](../../src/extension/utilities/SSH_Tasks.ts#L177-L211), [SSH_Tasks.ts:412-415](../../src/extension/utilities/SSH_Tasks.ts#L412-L415), [SSH_Tasks.ts:255-263](../../src/extension/utilities/SSH_Tasks.ts#L255-L263)
* **Current:**
  * `getRemoteDir` collects failed files but neither throws nor returns them, so the build summary can show stale results.
  * The `transfer_dir` error text is inverted (`${successful.length} of ${failed.length} failed`).
  * `delete_sources` ignores exit codes.
* **Proposal:** return a `{ ok, failed[] }` result, show a summary with the failed paths, and treat an incomplete result download as a failed build retrieval.


## R9. 🟠 Build history timestamps are parsed inconsistently
* **Where:** [BuildHistoryProvider.ts:35-46](../../src/webview/build_history/BuildHistoryProvider.ts#L35-L46), [BuildHistoryProvider.ts:85-118](../../src/webview/build_history/BuildHistoryProvider.ts#L85-L118), [BuildHistoryProvider.ts:170-183](../../src/webview/build_history/BuildHistoryProvider.ts#L170-L183), [BuildHistoryProvider.ts:521-540](../../src/webview/build_history/BuildHistoryProvider.ts#L521-L540), [dependency.ts:59](../../src/extension/obi/compile_list/modules/dependency.ts#L59)
* **Current:**
  * Folder names are derived from the compile-list `timestamp`. The TypeScript build list writes `new Date().toISOString()` (ending in `Z`). `escaped_date2date('2026-10-22T12.05.01.123Z')` returns **Invalid Date** (verified with Node), because the `:ms` → `.ms` regex requires digits at the end.
  * Such builds are skipped in the date view ("Invalid date format"). Expanding a date runs the same conversion in a `map` without `try`, so one such folder can make the whole date node fail.
  * For timestamps without a zone, labels use the local date, but *delete by date* uses the UTC date ([bugs.md #17](../bugs.md#17--build-history-delete-by-date-may-miss-builds-around-midnight)).
  * Times are sorted with `localeCompare` on `toLocaleTimeString()`, which is wrong in 12-hour locales.
* **Proposal:** one parser that keeps the zone designator, one function for the local date label, and sorting by `Date`.


## R10. 🟡 OBI Build view: `retainContextWhenHidden` has no effect; re-resolving adds message listeners
* **Where:** [OBIController.ts:177](../../src/webview/controller/OBIController.ts#L177), [extension.ts:254-257](../../src/extension.ts#L254-L257), [OBIController.ts:45-55](../../src/webview/controller/OBIController.ts#L45-L55), [OBIController.ts:206-260](../../src/webview/controller/OBIController.ts#L206-L260)
* **Current:**
  * `(webviewView as any).retainContextWhenHidden = true` sets a property VS Code doesn't read. The option belongs in `registerWebviewViewProvider(…, { webviewOptions: { retainContextWhenHidden: true } })`. As a result, the view is rebuilt each time it becomes visible again, and the "running" indicator of an active build is lost.
  * Separately, `resolveWebviewView` adds `onDidReceiveMessage` every time it runs on the same view. `OBIController.update()` and the `refresh` message do exactly that. Neither has a caller in the UI today, but enabling either would make each later click be handled several times.
* **Proposal:** pass the option at registration, and send the current running state to the view after it resolves. Register the message listener once per webview and keep it separate from rendering.


## R11. 🟡 Windows paths: only the first backslash is converted
* **Where:** [extension.ts:301-304](../../src/extension.ts#L301-L304) (vs. [extension.ts:326-329](../../src/extension.ts#L326-L329)), [OBICommands.ts:261-264](../../src/extension/obi/OBICommands.ts#L261-L264), [OBITools.ts:1065-1077](../../src/extension/utilities/OBITools.ts#L1065-L1077)
* **Current:**
  * *Edit compile config* from the explorer uses `replace('\\', '/')`, which converts only the first backslash. The source key becomes `lib/file\member` and doesn't match `source-config.toml`.
  * Workspace and source-dir prefixes are removed with `string.replace`, which replaces the first match anywhere and is case-sensitive about drive letters.
* **Proposal:** add one helper based on `path.relative` + separator normalisation, and use it everywhere. Test it with POSIX and Windows input.


## R12. 🟡 Remote-workspace file URIs are built by hand
* **Where:** [DirTool.ts:269-293](../../src/extension/utilities/DirTool.ts#L269-L293)
* **Current:** in remote windows the URI is assembled as `{ scheme: 'vscode-remote', authority: <config or vscode.env.remoteName> }`. `remoteName` is only the kind of remote (`ssh-remote`, `wsl`, `dev-container`), not the authority (`ssh-remote+myhost`), so links fail unless `cloud-ws-ssh-remote-host` is configured.
* **Proposal:** use `vscode.Uri.joinPath(workspaceFolder.uri, file)`, which already carries the correct scheme and authority.


## R13. 🟡 "Old sources" clean-up can never trigger
* **Where:** [OBITools.ts:817-865](../../src/extension/utilities/OBITools.ts#L817-L865), [OBITools.ts:396-407](../../src/extension/utilities/OBITools.ts#L396-L407)
* **Current:** `compare_source_change` always returns an empty `old-sources` list, so the "delete not needed sources on remote" branch is unreachable. It would also show "Sources transfered" after deleting.
* **Proposal:** compute remote keys that are missing locally, or remove the branch. Fix the message.


## R14. 🟡 Missing `deactivate`, and many disposables are never registered
* **Where:** [extension.ts](../../src/extension.ts), [SourceListProvider.ts:443-556](../../src/webview/source_list/SourceListProvider.ts#L443-L556), [BuildHistoryProvider.ts:484-558](../../src/webview/build_history/BuildHistoryProvider.ts#L484-L558), [OBITools.ts:1081-1099](../../src/extension/utilities/OBITools.ts#L1081-L1099), [compile-diagnostics.ts:63-65](../../src/extension/source/compile-diagnostics.ts#L63-L65)
* **Current:**
  * There is no `deactivate()`, so the SSH connection is never closed.
  * 38 `registerCommand` results, the `onDidChangeActiveTextEditor` listener, the config file watchers and the diagnostic collection are not added to `context.subscriptions`.
  * The source filter tree is registered twice (`registerTreeDataProvider` + `createTreeView`).
* **Proposal:** export `deactivate()` that closes the connection, and push every disposable to `context.subscriptions` via a small helper.


## R15. 🟡 Missing or broken files break whole views
* **Where:** [BuildHistoryProvider.ts:126-131](../../src/webview/build_history/BuildHistoryProvider.ts#L126-L131), [BuildSummary.ts:462-475](../../src/webview/show_changes/BuildSummary.ts#L462-L475), [BuildSummary.ts:400](../../src/webview/show_changes/BuildSummary.ts#L400), [LogOutput.ts:109-136](../../src/webview/show_changes/LogOutput.ts#L109-L136)
* **Current:**
  * Expanding a build in the history parses `compile-list.json` without `try`. A truncated file (e.g. after R3) makes the node fail.
  * `BuildSummary.get_object_list` parses the changed/dependent lists without `try`.
  * `generate_html` reads `compile_list['config']` even when there is no compile-list, so the build summary can't render at all in that case, although the template handles a missing list.
  * `LogOutput.get_log_content` iterates `compile_list['compiles']` without a check.
* **Proposal:** use `DirTool.get_json(…, false)`, check for `undefined`, and show an empty state or a warning icon instead of failing.


## R16. 🟡 Remote home directory is assumed to be `/home/<user>`
* **Where:** [SSH_Tasks.ts:48-54](../../src/extension/utilities/SSH_Tasks.ts#L48-L54), [OBITools.ts:215-283](../../src/extension/utilities/OBITools.ts#L215-L283)
* **Current:**
  * Every `~` in a remote path (not only a leading one) is replaced with `/home/<user>`.
  * The setup checks create `/home/$USER` and `.bashrc` there. On IBM i the home directory comes from the user profile (`HOMEDIR`) and may differ.
* **Proposal:** replace only a leading `~/`, and resolve the real home once per connection (`echo "$HOME"`).
