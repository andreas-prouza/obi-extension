# Builds with the OBI processing service

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | draft | OBI backend: processing service (2026-11-04), decision: status view in the extension instead of a Web GUI | OBI backend version 4 (`../obi/docs/processing-service.md`), tested on an IBM i |

Related: [remote-build-output-and-cancel.md](remote-build-output-and-cancel.md) (OBI Build output, cancel), [status-bar.md](status-bar.md), [compile-diagnostics.md](compile-diagnostics.md), [backend-auto-update.md](backend-auto-update.md).


# Current situation

* *Run build* runs `main.py -a run` on the IBM i through `SSH_Tasks.execute_streaming` ([OBICommands.ts `execute_remote_build`](../../src/extension/obi/OBICommands.ts)). The build is bound to that SSH session.
* If the session ends (network, VS Code closed or reloaded, laptop goes to sleep), the extension loses the build: no progress, no download of the results, no way to reconnect. The build may be stopped with the session.
* Progress is the elapsed time and the last output line. Per-source progress was left as follow-up in [remote-build-output-and-cancel.md §3](remote-build-output-and-cancel.md#3-per-source-progress-needs-the-python-obi), because the backend had no machine-readable progress.
* Compile messages (Problems view), joblogs and spool output only arrive after the whole build.
* Cancel sends `kill -TERM <pid>` to the Python process. Commands that are still running are not stopped reliably, and nothing is downloaded after a cancel.
* Before each remote action, `get_remote_obi_cmd` deletes `log/*` and `.obi/log/*` in the remote project folder.


# The backend (OBI version 4)

The processing service runs the build independent of the SSH session. One service per IBM i user; `submit` starts it if needed. Full documentation: `../obi/docs/processing-service.md` and `../obi/docs/cli.md#processing-service`.

| Action | Result on `stdout` | Exit code |
|---|---|---|
| `submit [-c <dir>]` | `{"status": "ok", "job": {...}, "service": "running" \| "started" \| "not running", "warning"?: "..."}`, or `{"status": "error", "message": "..."}` | 0 |
| `watch -j <id> [--since <seq>]` | One event per line, until the event `ended`. Returns at once for an ended job | 0; error (e.g. unknown job): 1 with `{"status": "error", ...}` |
| `jobs` | `{"status": "ok", "jobs": [...]}`: the last 50 jobs of the project, the newest first | 0; error: 1 |
| `cancel -j <id>` | `{"status": "ok", "job": {...}}` | 0 |

* Older backends reject the actions with exit code 2 and `invalid choice` on `stderr` (argparse).
* `-j` must be a job of the project `-p`.
* All output is ASCII (special characters escaped), one JSON object per line.

**Job**: `id`, `project`, `compile_list`, `status` (`queued`, `running`, `finished`, `failed`, `cancelled`), `build_status` (`success` / `failed`, only for `finished`), `error`, `progress`, `queued` / `started` / `ended` (timestamps), `pid`, `heartbeat`, `cancel_requested`.
`failed` means OBI couldn't do its job (error, process died). A build with failed sources is `finished` with `build_status: "failed"`.

**Events**: `seq` (1, 2, … without gaps), `time`, `type`, and per type:

| Type | Content |
|---|---|
| `queued` | `position` |
| `started` | `progress` (totals) |
| `level_started` | `level`, `sources` |
| `source_started` | `level`, `source` |
| `cmd_started` | `level`, `source`, `cmd_index`, `cmd` |
| `cmd_finished` | as `cmd_started`, plus `status`, `updated`, `exit-code`, `stdout`, `stderr`, `joblog`, `progress` |
| `source_finished` | `level`, `source`, `status`, `hash`, `progress` |
| `ended` | `status`, `build_status`, `error`, `progress`. Always the last event |

`progress`: `{"sources", "sources_done", "sources_failed", "cmds", "cmds_done"}`. It only counts what the job builds; `*_done` include the failed ones.

**Cancel**: a queued job is removed. A running job: running commands are stopped, no further source starts, the summary is written, the job ends as `cancelled`. After 30 seconds (service setting) the service kills it.


# New feature

## 1. Setting and compatibility

* New setting `obi.build.processingService` (boolean, default `true`): "Build with the OBI processing service on the IBM i. The build keeps running when the connection ends." Off: builds run in the SSH session as before. `ExtensionSettings.build_processing_service()`.
* **Old backend**: the first service action of a session (`jobs`, see §2) ends with exit code 2 and `invalid choice` → build as before with `run`. Once per session an information: "Update the OBI backend on the IBM i (version 4) to keep builds running when the connection ends", action *Update* (`BackendUpdate.update_now`).
* **Service can't be started** (`submit` returns `"service": "not running"`): `cancel` the queued job, then build with `run`. Warning once per session with the `warning` text of the backend (it names the log folder).

## 2. Run build with the service

`run_build_process` keeps its phases. Changes:

1. **Before the upload** of the sources (after `check_remote`): `jobs`. If a job of this project is `queued` or `running` (e.g. from another VS Code window or after a reload), nothing is uploaded. Message: "A build is already running on the IBM i for this project (job {0}, {1} of {2} sources)" with *Follow* and *Cancel build*. Uploading would change sources and the build list of the running job.
2. **Remote run**: `submit` instead of `run`, with `-c` like `run`. Delete `log/*` and `.obi/log/*` before it, as today. This is only safe because step 1 found no running job of the project. The other service actions never delete anything: `.obi/log` holds the joblogs of the running commands.
3. **Follow** the job (§3) until `ended`, under the existing `OperationLock` ("Run build"), with the progress notification.
4. **After `ended`**: `get_remote_build_output()` as today (build list, results, build history, `object-builds.json`, Problems view, status bar). Then:

| `ended` | Messages |
|---|---|
| `finished`, `build_status: success` | As today: "Build finished in {0} min" |
| `finished`, `build_status: failed` | As today for a build with failed sources (status bar, build summary) |
| `cancelled` | `BuildOutput.finished('cancelled')`, `StatusBar.show_cancelled()`, no error message |
| `failed` | Error "The build on the IBM i failed: {error}" with *Show output*; results are downloaded anyway (partial) |

`OBICommands.do_rerun_build`, `run_build` and `run_single_build` all go through `run_build_process`, so they get the service without own changes.

## 3. Following a job (`JobFollower`)

* Remote command (built in `ServiceCommands`, see §10):
  ```
  cd '<remote-base-dir>' || exit 1; echo "OBI_PID:$$"; exec '<python>' -X utf8 '<main.py>' -a watch -p . -j <id> --since <seq>
  ```
  `report_pid`: stopping the follow kills only the `watch` process, never the build.
* Each line of `stdout` is parsed and validated (§9). Events with `seq <= last_seq` are ignored, so a reconnect never shows something twice. Unknown types only move `last_seq`.
* The events update a `JobState` (§10), which feeds the output, the progress, the status bar and the Jobs view.
* **State for reconnecting** in `workspaceState`, key per workspace folder (multi-root): `{ job_id, connection: "user@host:port", remote_base_dir, started, last_seq, sources }`. It's saved at `submit`, then at most every 2 seconds, and removed after the results of `ended` have been downloaded.

### Output "OBI Build"

A pure formatter turns events into lines. `cmd` is cut to 200 characters, `stderr` to 50 lines:

```
Queued as job 17 (position 1)
Build started: 12 sources, 30 commands
--- Level 1: 5 sources ---
▶ mylib/qrpglesrc/order.rpgle.pgm · command 1: cl -v "CRTBNDRPG PGM(mylib/order) ..."
✔ mylib/qrpglesrc/order.rpgle.pgm · command 1
✖ mylib/qrpglesrc/date.sqlrpgle.srvpgm · command 2 · exit code 1
    CPF5D12: ...
■ mylib/qrpglesrc/date.sqlrpgle.srvpgm failed (4 of 12)
```

The raw events go to the log at debug level only, because they contain whole joblogs.

### Progress notification and status bar

| Situation | Message |
|---|---|
| `queued` | "Waiting in the queue (position {0})" |
| Running | "{0} of {1} sources · {2}" (last `source_started`), plus ", {3} failed" if any. `increment` = 100 / `sources` per `source_finished` |
| After a cancel | "Cancelling the build …" |
| Reconnecting | "Connection lost. Reconnecting ({0}) …" |

Status bar while following: `$(sync~spin) OBI 12/40 · 2:31`; failed sources in the tooltip. `StatusText.render_status` gets an optional `progress`.

### Problems view per source

On `source_finished` (any status): download the single file `<evfevent-output-dir>/<source>` (if it exists), then `CompileDiagnostics.load_source(source, evfevent_root, status === 'success')`.
* At most 2 downloads at the same time, outside the event loop (a slow download must not delay the events)
* A failed download is only logged
* `source` is checked with `is_valid_source_path` first, as in `result_download_plan`
* The download after `ended` replaces everything as today

### Connection lost

`watch` ends without `ended` and the follow wasn't stopped by the extension (`execute_streaming` rejects, or ends with code `null`):
* Reconnect (`SSH_Tasks.reset_connection_state`, `connect`), then `watch --since <last_seq>`. Waits between the attempts: 2, 4, 8, 16, 30, 30, … seconds, for at most 10 minutes. The progress notification shows the attempt.
* After 10 minutes: stop following, release the `OperationLock`, keep the state. Warning "Lost the connection to the build. It keeps running on the IBM i." with *Reconnect* (= follow, §5).
* With the SSH keepalive (60 s × 3) a dead connection is noticed after about 3 minutes. That's acceptable: nothing is lost, the build runs on.

## 4. Cancel

* The cancel buttons (progress notification, OBI Build view, status bar menu) cancel the `OperationLock` token as today. While following a job, that runs `cancel -j <id>` once and **keeps following** until `ended`, so the results up to the cancel are downloaded and the build summary shows them.
* A second cancel while cancelling stops only the following: "The build is still being stopped on the IBM i. See the Jobs view." The state is kept.
* If `cancel` fails (e.g. no connection): error message, keep following / reconnecting. The Jobs view can cancel later.
* Without the service (setting off, old backend), cancel stays as it is.

## 5. Reconnect after a restart

* In `start_project_services`: if the folder has a saved job, show a notification without connecting SSH (no unexpected password prompt): "A build on the IBM i was still running when VS Code was closed (job {0}, started {1})." with *Follow* and *Later*.
* *Follow*, and the Jobs view's *Follow*: connect, `jobs`:
  * `queued` / `running` → follow (§3) under the `OperationLock` with the progress notification
  * ended → download the results and show the messages of §2.4. Only if it's the newest job of the build list; otherwise just remove the state
  * not in the list (deleted after `keep-jobs-days`) → remove the state, information "The build is no longer known on the IBM i"
* If the saved connection (`user@host:port`, `remote-base-dir`) isn't the one of the current configuration (profile changed), it's ignored and removed.

## 6. Jobs view

New tree view `obi.jobs` ("Builds on IBM i" / "Builds auf IBM i") in the `obi-bar` container, after the build history; `when`: `obi.contains_obi_project`. In `src/webview/jobs/JobsProvider.ts`.

**Items**: the jobs of `jobs`.

| Status | Icon (`ThemeIcon`) | Description |
|---|---|---|
| `queued` | `clock` | "queued" |
| `running` | `sync~spin` | "12/40" (+ " · 1 failed") |
| `finished` + `success` | `pass` | "success · 10:05" |
| `finished` + `failed` | `error` | "3 failed · 10:05" |
| `failed` | `error` | "error · 10:05" |
| `cancelled` | `circle-slash` | "cancelled · 10:05" |

* Label `#17`, the followed job with " (following)"
* Tooltip as plain text: build list, queued / started / ended, `error`. No `MarkdownString` with values from the IBM i
* **Children** (sources): for the followed job live from its `JobState`. For an ended job, loaded on expand with one `watch -j <id>` (returns at once) and cached. A running job that isn't followed has no children
  * Source item: label = source, description "level 2 · 2/3 commands", icon by status (`sync~spin`, `pass`, `error`, `circle-outline` for not started)
  * Click → read-only document `obi-job:/17/<source>` (`TextDocumentContentProvider`, plain text): per command `cmd`, `status`, `exit-code`, `stdout`, `stderr`, `joblog`. Updated while the job runs
* **Commands** (all in `package.json`, `register_command`, en/de):

| Command | Where | Does |
|---|---|---|
| `obi.jobs.refresh` | view title | `jobs` |
| `obi.jobs.follow` | `queued` / `running`, not followed | §5 |
| `obi.jobs.cancel` | `queued` / `running` | `cancel -j`, then refresh. Asks first |
| `obi.jobs.get-results` | newest job of the build list, ended | like `obi.get-remote-build-results` |

* **Refresh** when the view becomes visible (only if SSH is already connected), after `submit`, `cancel`, `ended`, and by the button. No timer.
* Not connected: one item "Not connected. Refresh to connect" (command `obi.jobs.refresh`).
* Backend older than 4: one item "Needs OBI backend version 4 on the IBM i" with the *Update* command.
* Children of the followed job update at most every 500 ms (`onDidChangeTreeData`).

## 7. Other operations while a job runs

* *Get build results* (`obi.get-remote-build-results`): if `jobs` shows a running job of the project, ask "A build is still running. Download its current state anyway?"
* Everything else runs under the `OperationLock` while the job is followed, as today. Without following (after a lost connection or a second cancel), step 1 of §2 protects the next build.

## 8. Remote `create`

Unchanged: without `local-obi-dir`, `create` still runs in the SSH session before `submit`. Making it a job needs the backend first.

## 9. Security

* Job id: `Number.isSafeInteger(id) && id > 0`; `seq`: `Number.isSafeInteger(seq) && seq >= 0`. Checked before they go into a command. Paths with `sh_quote` as today.
* Every line from the IBM i is untrusted:
  * `JSON.parse` in `try`
  * Then a type guard in `src/shared` (`parse_job_event`, `parse_jobs_result`, `parse_submit_result`): required fields with their types; unknown fields are dropped
  * A line that isn't valid is logged (debug) and skipped
* `source` from an event is only used for paths and URIs after `is_valid_source_path`. The document URI encodes it (`vscode.Uri.from` with an encoded path), never by string concatenation.
* Values from the IBM i are only shown as plain text: tree labels, descriptions, tooltips, the read-only document. No HTML, no `MarkdownString`.
* No new npm package.

## 10. Code

| File | Content | `vscode` |
|---|---|---|
| `src/shared/ProcessingJob.ts` | Types `Job`, `JobEvent`, `JobProgress`; `parse_job_event`, `parse_jobs_result`, `parse_submit_result`; `is_old_backend(code, stderr)` | no |
| `src/extension/obi/processing/ServiceCommands.ts` | Remote commands `submit`, `watch`, `jobs`, `cancel` (quoting, id checks, no `rm` except before `submit`) | no |
| `src/extension/obi/processing/JobState.ts` | Applies events: `last_seq`, progress, sources with their commands, ended | no |
| `src/extension/obi/processing/EventFormatter.ts` | Output lines and progress messages | no |
| `src/extension/obi/processing/ProcessingService.ts` | `submit`, `jobs`, `cancel` over SSH; old backend detection | yes |
| `src/extension/obi/processing/JobFollower.ts` | Follow, reconnect, cancel, saved state, end of the job | yes |
| `src/webview/jobs/JobsProvider.ts` | Jobs view, `obi-job:` documents | yes |

Changes:
* `OBICommands.run_build_process` / `execute_remote_build`: branch for the service
* `SSH_Tasks.execute_capture(cmd)`: returns `{ code, stdout, stderr }` without throwing on an exit code
* `StatusText` / `StatusBar`: progress
* `extension.ts`: register the view and the document provider; reconnect check in `start_project_services`
* `package.json`, `package.nls*.json`, `l10n/bundle.l10n*.json`
* `ResultDownload.ts`: the comment on `.obi/log` (cleared only before `submit` / `run`)

The modules without `vscode` must not create new import cycles (`check:repo`).


# Tests

**Unit** (`src/test/unit`):
* `parse_job_event`:
  * valid events of every type
  * unknown type (kept with its `seq`)
  * missing or invalid `seq`
  * wrong field types
  * `source` with `../`
* `parse_submit_result` / `parse_jobs_result`: ok, error, `not running` with `warning`
* `is_old_backend`: exit code 2 with `invalid choice: 'jobs'` → true; other errors → false
* `ServiceCommands`:
  * quoting of paths with blanks and `'`
  * ids `1.5`, `-1`, `"1;rm -rf ~"` are rejected
  * `watch` has `report_pid` and `--since`
  * only `submit` deletes `.obi/log`
* `JobState`:
  * a full event sequence gives the right progress and per-source commands
  * repeated `seq` is ignored
  * events after `ended` are ignored
  * parallel sources interleaved
* `EventFormatter`: lines of the example above, cut `cmd` and `stderr`
* Reconnect delays: 2, 4, 8, 16, 30, 30 …, stop after 10 minutes

**Integration** (`src/test/suite`, stubbed SSH as in the existing build tests):
* `submit` → `watch` lines → `ended` → results downloaded, history written, Problems view loaded per source during the build
* Stream ends after `seq` 7 → reconnect → `watch --since 7`; no line twice in the output
* Cancel → `cancel -j 17`, following goes on, `ended` `cancelled` → results downloaded, "Build cancelled", no error
* Second cancel → stops following, state kept
* Old backend (`jobs` → exit 2) → build with `run`, hint once per session
* `submit` → `not running` → `cancel` and build with `run`
* Running job of the project → nothing uploaded, *Follow* offered
* Saved state at start → notification; *Follow* on a running job → follows; on an ended job → downloads
* Jobs view: items and icons from a `jobs` result; children of an ended job from `watch`; not connected → placeholder
* Setting off → `run` as before

**Manual on an IBM i**:
* Close VS Code during a build and open it again
* Turn off the network or put the laptop to sleep during a build
* Cancel during a long compile
* Two VS Code windows on the same project
* Backend 3 on the IBM i
* A build of more than 30 minutes


# Non-goals

* "Run in background" while VS Code stays open (stop following, keep working). Needs a guard against remote changes of the project while its job runs; §2 step 1 is the start.
* Jobs of other projects, or all jobs of the user (the backend has no `jobs --all` yet)
* Refreshing the Jobs view by timer
* `create` and `add_source` as jobs (backend first)
* A Web GUI. This view replaces it for the developer's own builds


### Definition of done
* Builds use the service when the setting is on and the backend is version 4; otherwise `run` as before
* A build survives a lost connection and a restart of VS Code; following continues without lost or repeated output
* Per-source progress in the notification and the status bar; compile messages per source in the Problems view during the build
* Cancel stops the build on the IBM i and downloads the results up to the cancel
* Jobs view with status, progress, sources and the command output of each source
* Setting, commands and view in `package.json`, all texts in English and German
* User documentation (`asserts/docs/building.md`, `asserts/docs/configuration.md`) and CHANGELOG
* Tested on an IBM i (manual tests above)
