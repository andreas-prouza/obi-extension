# Live build output and cancellation

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (tested with stubbed SSH; per-source progress needs an agreed output line from the Python OBI → follow-up; uploads stop between phases, not between files) | [usability.md U1](../improvements/usability.md#u1--no-live-feedback-while-the-build-runs-on-the-ibm-i), [U2](../improvements/usability.md#u2--long-running-operations-cannot-be-cancelled) | [bugfix/operation-lock.md](../bugfix/operation-lock.md), [bugfix/system-cmd-exit-handling.md](../bugfix/system-cmd-exit-handling.md), [bugfix/input-cancel-shows-error.md](../bugfix/input-cancel-shows-error.md), [bugfix/remote-command-quoting.md](../bugfix/remote-command-quoting.md) |

Settings naming: [settings-walkthrough-keybindings.md](settings-walkthrough-keybindings.md).


# Current situation

* `run_build_process` ([OBICommands.ts:33-119](../../src/extension/obi/OBICommands.ts#L33-L119)) shows one notification whose text changes per phase. During "Run build on IBM i", nothing changes for minutes; progress `increment` is never reported.
* `SSH_Tasks.executeCommand` ([SSH_Tasks.ts:146-162](../../src/extension/utilities/SSH_Tasks.ts#L146-L162)) waits for the whole remote command and logs stdout/stderr only at the end.
* No `withProgress` is `cancellable`. The cancel button in the OBI Build view ([OBIController.ts:237-241](../../src/webview/controller/OBIController.ts#L237-L241)) only stops local processes (`show_changes`, `run_build` ids) and the local hash calculation. A remote build or transfer can't be stopped from VS Code.


# New feature

## 1. Output channel for builds

* New output channel **"OBI Build"** (plain `OutputChannel`, not the log channel). It shows the raw output of local OBI runs and remote commands, each run starting with a header line (`=== Run build · 2026-10-22 14:05:01 · 12 sources ===`).
* Setting `obi.build.revealOutput`: `"onStart"` | `"onError"` (default) | `"never"`.
* The progress notification gets a `Show output` action after the first output line. VS Code notifications can't have buttons while in progress, so: show the channel via the status bar item ([status-bar.md](status-bar.md)), and add a command `obi.build.show-output` (in `package.json`).

## 2. Streaming

* `SSH_Tasks.executeCommand(cmd, options?: { on_stdout?: (line: string) => void; on_stderr?: (line: string) => void; token?: vscode.CancellationToken })`, using node-ssh `execCommand(cmd, { onStdout, onStderr, onChannel })`.
* Split chunks into lines (keep a remainder buffer for partial lines). Decode with the configured `console-output-encoding` (default UTF-8).
* `SystemCmdExecution.run_system_cmd` gets the same `on_stdout` / `on_stderr` options.
* The progress message shows the elapsed time and the last output line (truncated to 80 characters), updated at most every 500 ms.

## 3. Per-source progress (needs the Python OBI)

If the Python OBI prints a machine-readable line per command, e.g. `OBI-PROGRESS 12/40 prouzalib/qrpglesrc/foo.rpgle.pgm`, the extension reports `increment` and shows "12 of 40: foo.rpgle.pgm". Agree on the format with the Python OBI first; until then, step 2 is the fallback.

## 4. Cancellation

* All long-running `withProgress` calls (run build, show changes, transfer, remote source check, get build results) use `cancellable: true` and pass the token down.
* **Local:** on cancel → `SystemCmdExecution.abort_system_cmd(id)` (kills the process tree).
* **Remote:** the remote run is started as
  ```
  cd '<base>' || exit 1; rm …; echo "OBI_PID:$$"; exec '<python>' -X utf8 '<main.py>' -a run -p .
  ```
  (`exec` keeps the pid). The extension reads the pid from the first stdout line. On cancel it runs `kill -TERM <pid>` in a second exec channel and then closes the first one. The Python OBI stops after the currently running IBM i command; document that a running compile job is not interrupted.
* **Transfers:** check the token between files (SFTP) / between phases, and stop before the next phase.
* Cancelled operations end with `UserCancelledError`: no error message, status bar shows "Build cancelled" for a few seconds, and `compile-list.json` keeps the statuses written so far.
* The cancel button in the OBI Build view cancels the token of the running operation (through `OperationLock`, which keeps a `CancellationTokenSource` per operation).


# Tests

* Unit test: line splitting with chunks `"a\nb"`, `"c\n"` → lines `a`, `bc`.
* Unit test: pid parsing from `OBI_PID:12345\n…`.
* Unit test (stubbed SSH): cancelling the token runs `kill -TERM 12345` and the operation rejects with `UserCancelledError`.
* Manual on an IBM i: start a build with several sources, watch the output, cancel; check that no further sources are compiled and that the build summary shows the state up to the cancel.


### Definition of done
* "OBI Build" output channel with live output for local and remote runs; reveal behaviour configurable
* Progress shows elapsed time and the latest output line
* All long-running operations are cancellable (local processes, remote run, transfers)
* `obi.build.revealOutput` and `obi.build.show-output` in `package.json` and localized
* Per-source progress agreed with the Python OBI (or recorded as follow-up)
* CHANGELOG entry
