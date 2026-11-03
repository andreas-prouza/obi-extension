# Log level, log rotation and log content

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (rotation checked by configuration only, not with > 5 MB of logs) | [security.md S11](../improvements/security.md#s11--log-files-are-unbounded-and-verbose) | [vscode-engine-bump.md](vscode-engine-bump.md) (`LogOutputChannel`) |

Implement together with [replace-console-log-with-logger.md](replace-console-log-with-logger.md). Settings naming: [settings-walkthrough-keybindings.md](settings-walkthrough-keybindings.md).


# Current situation

[Logger.ts](../../src/extension/utilities/Logger.ts):
* The level is hard-coded to `debug`.
* Three transports: `Console` (extension host console), a custom transport to the "OBI" output channel, and, if the workspace is an OBI project, `.obi/log/error.log` + `.obi/log/combined.log`. The file transports have **no size limit and no rotation**.
* The logger is created at import time, using `workspaceFolders[0]` from the moment of import.

Content:
* every remote command and its full stdout at `info` ([SSH_Tasks.ts:151-157](../../src/extension/utilities/SSH_Tasks.ts#L151-L157));
* on JSON parse errors, the complete file content ([DirTool.ts:227](../../src/extension/utilities/DirTool.ts#L227));
* `JSON.stringify(item)` of tree items at `debug` ([SourceListProvider.ts:292](../../src/webview/source_list/SourceListProvider.ts#L292));
* tree expand/collapse/visibility events at `info` ([SourceListProvider.ts:536-550](../../src/webview/source_list/SourceListProvider.ts#L536-L550)).


# New feature

## 1. VS Code log channel and level

* Create the output channel with `vscode.window.createOutputChannel('OBI', { log: true })` (a `LogOutputChannel`). Users can then change the level with *Developer: Set Log Level… → OBI*, the same way as for built-in extensions.
* The winston transport to the channel maps levels to `channel.trace/debug/info/warn/error`.
* The winston logger level follows `channel.logLevel` and is updated on `channel.onDidChangeLogLevel`. Default: VS Code's default (`info`).
* Remove the `Console` transport.

## 2. Log files

* Setting `obi.log.writeFiles` (boolean, default `true`) and `obi.log.maxFileSizeMB` (number, default `5`).
* winston `File` transports with `maxsize: maxFileSizeMB * 1024 * 1024`, `maxFiles: 3`, `tailable: true`.
* Add the file transports in `activate()` (or `init(context)`), using `Workspace.get_workspace()`, not at import time.

## 3. Content rules

* Remote commands: `debug`. stdout of remote commands: `debug`. stderr: `warn`. The exit code stays `info`.
* Never log file contents. On parse errors, log file, line and column only (see [bugfix/config-overwrite-on-parse-error.md](../bugfix/config-overwrite-on-parse-error.md)).
* Remove the tree event logging and the `JSON.stringify(item)` debug line.
* Never log values from `SecretStorage`, or `secret*` variables. Add a small `redact(text)` helper that replaces the values of `secret*` variables from the current config with `***`, and apply it in the winston format.

## 4. Settings

Add `obi.log.writeFiles` and `obi.log.maxFileSizeMB` to `contributes.configuration` and the `package.nls*.json` files.


# Tests

* Unit test: `redact('pwd=abc')` with a config variable `secretPwd = "abc"` → `pwd=***`.
* Manual: set the OBI log level to *Trace* / *Error* and check the output channel; write > 5 MB of logs and check rotation (`combined1.log`, …).


### Definition of done
* Log level is user-controllable via the VS Code log level; default `info`
* Log files are size-limited and rotated; can be disabled
* No file contents, secrets or UI event noise in the logs
* Settings in `package.json` and localized
* CHANGELOG entry
