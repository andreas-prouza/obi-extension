# Faster SSH transfers

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased, phase 1 without step 3) | [performance.md P8](../improvements/performance.md#p8--ssh-transfers-move-whole-directories-file-by-file) | [bugfix/partial-transfer-failures.md](../bugfix/partial-transfer-failures.md), [bugfix/remote-command-quoting.md](../bugfix/remote-command-quoting.md) |

Also fixes [bugs.md #12](../bugs.md#12--ssh-concurrency-is-ignored). Takes [open-tasks.md](../open-tasks.md) into account: "Transfer all" is going to be removed, so the whole-workspace upload is not optimized here.


# Current situation

Per build ([OBICommands.ts:33-119](../../src/extension/obi/OBICommands.ts#L33-L119)):
1. `transferSources` uploads 4 config files plus the changed sources ([SSH_Tasks.ts:307-352](../../src/extension/utilities/SSH_Tasks.ts#L307-L352)). The config files are uploaded on every build, even if unchanged.
2. `transfer_build_list` uploads `compile-list.json` and the whole local `.obi/tmp` folder.
3. After the run, `get_remote_build_output` downloads the **complete** remote `.obi/build-output`, `.obi/tmp` and `.obi/log` folders, three directory downloads in parallel ([OBICommands.ts:213-219](../../src/extension/obi/OBICommands.ts#L213-L219)). Over time `.obi/log` and `.obi/tmp` on the IBM i can contain much more than the current build.
4. `ssh-concurrency` from the config is never passed into `ConfigConnection`, so the default of 5 is always used ([AppConfig.ts:366-373](../../src/extension/config/AppConfig.ts#L366-L373), bugs.md #12).

There are no timing measurements per phase, so it's unclear which phase dominates for typical projects.


# New feature

## Phase 1: measure and remove waste

1. **Timing:** log the duration of each phase of `run_build_process` at `info` (`upload sources`, `generate/transfer build list`, `remote run`, `download results`) plus total, number of files and bytes. Show the total in the final notification ("Build finished in 2:41 min").
2. **Concurrency:** pass `ssh-concurrency` through `ConfigConnection` (fix bugs.md #12), clamp it to 1–32, and document it in [configuration.md](../../asserts/docs/configuration.md#connection).
3. **Config uploads only when changed:** keep a per-connection map `remote path → md5 of the uploaded content`. Skip the upload if the hash is unchanged since the last upload in this connection. Reset the map on reconnect.
4. **Download only what belongs to this build:**
   * `compile-list.json` (first, see [partial-transfer-failures.md](../bugfix/partial-transfer-failures.md));
   * all other files in `.obi/build-output` (small: object list, markdown summary);
   * `.obi/tmp/evfevent/<source>` for each source in the compile-list (evfevent path from `evfevent-output-dir`, see [bugs.md #16](../bugs.md#16--compile-diagnostics-ignore-evfevent-output-dir));
   * `.obi/log/main.log` (or the files the Python OBI writes for this run).

   Clarify with the Python OBI which other files under `.obi/tmp` the build summary needs, and list them in [building.md](../../asserts/docs/building.md).

## Phase 2: archive transfer (only if phase 1 shows transfers dominate)

* Download: run `tar -cf - <paths>` on the IBM i via an exec channel and extract the stream locally (npm package `tar`, check the [package criteria](../architecture.md#npm)). One channel instead of hundreds of SFTP requests. Check that PASE `tar` handles the file names (CCSID) correctly.
* Upload of many sources (first build after "minimum transfer"): same in reverse (`tar -xf -` on the IBM i).
* Keep the SFTP path as fallback if `tar` is not available on the IBM i (`command -v tar`).


## Result

* Python OBI (checked in `module/results.py`, `run_cmds.py`, `main.py`): it writes the command outputs of each source into `<build-output-dir>/<lib>/<member>/command-<n>.{cmd,splf,joblog,error}` (only for commands that ran), `status.json`, the object list and `compiled-object-list.md` into `.obi/build-output`, debug trees into `.obi/tmp`, and its log into `.obi/log`, which the remote command clears before each run. The extension itself reads only `compile-list.json`, the object lists in `.obi/tmp` and the EVFEVENT files; the per-source outputs are downloaded for the links in `compiled-object-list.md`.
* Step 1: phase timings in the log (`Build timings: …`), total in the OBI Build output and a notification. File counts are logged per download; bytes are not measured.
* Step 3 (skip unchanged config uploads) **not done**: the remote copy can change outside this connection (another workstation with the same project folder, *Transfer all*, manual edits), and validating it (an SFTP `stat` per file) costs about as much as uploading these few small files, which already go in parallel with the sources.
* Step 4: [ResultDownload.ts](../../src/extension/obi/ResultDownload.ts) (pure) builds the plan; `SSH_Tasks.download_build_results` checks the optional paths with one command and downloads everything over one SFTP channel. Paths from the downloaded compile list are validated (no `..`, no absolute paths). Verified against a local OpenSSH server: stale outputs of other sources are not downloaded. Found on the way: node-ssh's `getDirectory` fails if the local folder doesn't exist; `getRemoteDir` creates it.
* Also: the build list upload sends only the files directly in `.obi/tmp`.
* Phase 2 (tar): decision open until the timings of real builds are known.
* Manual check open: build durations on a real IBM i before/after (1, 20, 200 sources).


# Tests

* Unit test: unchanged config → second `transferSources` within the same connection doesn't call `putFiles` for config files (stubbed NodeSSH).
* Unit test: the list of files to download for a compile-list with sources `a`, `b` contains exactly the expected paths.
* Manual: compare build durations before/after on a real IBM i with 1, 20 and 200 changed sources. Record the numbers in the PR.


### Definition of done
* Phase timings in the log and the total in the notification
* `ssh-concurrency` works (bugs.md #12 removed) and is documented
* Config files are uploaded only when changed; result download is limited to the current build
* Decision on phase 2 recorded, based on the measurements
* CHANGELOG entry
