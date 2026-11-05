# Logs out of `compile-list.json`

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | draft | Analysis 2026-11-05: long waits after builds because of large `compile-list.json` | OBI backend (`../obi`), [ssh-transfer-optimization.md](ssh-transfer-optimization.md), [compile-list-size.md](compile-list-size.md), [processing-service.md](processing-service.md) |


# Current situation

* **Logs are stored inline.** `run_cmds.py` (`run_build_object_list` → `cmd_item.update(result)`) puts `stdout` (spool), `stderr` and `joblog` of every command into the compile list. `OBICommands.get_remote_build_output` downloads the whole `compile-list.json` first, with `SSH_Tasks.getRemoteFile`. The extension only needs the logs when the user opens one (`LogOutput.get_log_content`).
* **The file is rewritten after every command.** `run_cmds.py` calls `files.writeJson(target_tree, save_update_2_json_file)` when a command starts and again when it finishes, under `write_lock`, with `indent=2` (`files.writeJson`). The file grows during the build, so the total write work grows quadratically, and commands running in parallel wait on the lock.
* **Reruns upload old logs again.** `OBITools.update_compile_list` resets only `ignore` and `status` (`force_rebuild`). `OBICommands.transfer_build_list` then uploads the file including the logs of the last build, or of the history entry being rebuilt.
* **SSH compression is off.** `SSH_Tasks.build_connect_config` sets no `algorithms`. ssh2 1.17 lists `none` first in its default compression list, so compression is never negotiated.
* **Separate log files are half built.** `results.save_outputs_in_files` writes `<build-output-dir>/<lib>/<member>/command-<n>.{cmd,splf,joblog,error}`, but the call is commented out in `main.py` (`get_results`). `compiled-object-list.md` (`results.create_result_doc`) still links to these files, so the links point nowhere. `ResultDownload.result_download_plan` already plans the per-source output folders; the existence check in `SSH_Tasks.download_build_results` filters them out today.
* **The processing service repeats the pattern.** In [processing-service.md](processing-service.md), the `cmd_finished` event carries `stdout`, `stderr` and `joblog`, so `watch` would transfer the logs a third time.
* `IReleaser.deployment_data` already removes `joblog`, `stdout` and `stderr` from a copy of the compile list (for i-Releaser's 64 KB limit).


# New feature

## 0. Measure

Before and after, on a real project, run next to `compile-list.json`. It prints the file size in bytes, the log characters, the gzipped size in bytes, and the number of commands:

```sh
python3 -c "import json,gzip,sys;d=open(sys.argv[1],'rb').read();j=json.loads(d);c=[c for lv in j['compiles'] for s in lv['sources'] for c in s['cmds']];l=sum(len(x.get(k) or '') for x in c for k in ('stdout','stderr','joblog'));print(len(d),l,len(gzip.compress(d)),len(c))" compile-list.json
```

Record the numbers and the whole `Build timings` line of the same build in the PR. The line is in the *OBI* output channel, e.g. `Build timings: upload sources 0:05 · build list 0:02 · remote run 2:31 · download results 0:40 · total 3:18`. The phases that matter here:

* `download results` (`get_remote_build_output`): downloading `compile-list.json` and the other result files, and writing the build history. This is where step 1 (compression) shows.
* `remote run`: includes the backend's rewrites of the compile list. This is where step 2 shows.

## 1. Quick fixes (extension only)

1. **SSH compression:** in `SSH_Tasks.build_connect_config`, add `algorithms: { compress: ['zlib@openssh.com', 'zlib', 'none'] }`. Make it a connection setting `ssh-compression` (default `true`), because on a fast LAN it costs CPU for little gain. Like `ssh-agent`, it is a `[connection]` key of the app config (`ConfigConnection`, checkbox on the config page, l10n, `configuration.md`), not a VS Code setting. No new npm package: ssh2 compresses with Node's `zlib`.
2. **No logs in uploads:** move the loop from `IReleaser.deployment_data` into a shared, vscode-free `strip_cmd_logs(compile_list)` in `src/shared`. Use it in `deployment_data`, and on the file uploaded by `transfer_build_list`. Upload a stripped copy, not the local file, so the local build summary keeps its logs until the next build.

## 2. Logs as separate files (backend + extension)

**Backend (`../obi`):**
* After each command, write its logs straight away to `<build-output-dir>/<lib>/<member>/command-<n>.{splf,joblog,error}`, using the same paths as `save_outputs_in_files` (numbered from 1).
* In the compile list, keep only `status`, `updated`, `exit-code` and, per log, its size (e.g. `"log-sizes": {"stdout": 12345, "joblog": 2345, "stderr": 0}`). Drop `stdout`, `stderr` and `joblog`.
* Write the compile list without `indent=2`.
* Remove the commented-out `save_outputs_in_files` call once per-command writing is in place.
* Mark the new format so the extension can tell them apart, e.g. `"log-format": 2` at the top level of the compile list.
* Processing service: `cmd_finished` sends the log sizes, not the logs.

**Extension:**
* `LogOutput.get_log_content` reads `source_output_dir(...)/command-<cmd_index + 1>.<ext>` (`ResultDownload.source_output_dir`; note the 1-based file numbers vs. the 0-based `cmd_index`). It falls back to the inline fields, so old history entries and old backends keep working.
* `write_build_history` copies the log files of this build into the history folder, because the next build of the same source overwrites them on the IBM i and in the local `build-output`. `LogOutput` reads them from there for history entries.
* The build summary shows a log link only if its size is > 0.

## 3. Open decision: when to download the logs

* **A. Right after the build (all):** same bytes as today, but compressed (step 1) and in parallel over one SFTP channel (`download_build_results` already does this). History entries are always complete.
* **B. Failed sources right away, the rest when clicked:** fewest bytes. Logs of successful compiles are fetched on demand with `SSH_Tasks.getRemoteFile`. Catch: once a later build has overwritten them on the IBM i, they can't be fetched for an older history entry (show "no longer available on the IBM i").


# Tests

* Unit: `strip_cmd_logs` removes `stdout`, `stderr` and `joblog` from every command and leaves everything else unchanged (`deployment_data` tests still pass).
* Unit: `ssh_compression` / `ssh_algorithms` (`SshAuth`): on unless `false`, `zlib@openssh.com` first. Integration: `build_connect_config` has these `algorithms` with compression, none without.
* Unit: the log path for source `lib/qrpglesrc/a.pgm`, `cmd_index` 0 is `<build-output-dir>/lib/a.pgm/command-1.joblog`.
* Integration: `LogOutput` shows the log from the file (new format) and from the inline field (old history entry).
* Integration: a new history entry contains the log files of its build.
* Backend (`../obi-unit-tests`): after a run, the compile list contains no log fields and the `command-<n>.*` files exist with the command output.
* Manual: build durations before/after on a real IBM i with 1, 20 and 200 sources, with the numbers from step 0.


### Definition of done
* Numbers from step 0 recorded before and after
* SSH compression available and documented; uploads contain no logs
* Backend writes logs per command into files; compile list without logs and without indentation
* Links in `compiled-object-list.md` work again
* Old history entries still show their logs
* Decision on step 3 recorded
* CHANGELOG entries in both repositories
