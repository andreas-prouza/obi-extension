# Run build fails with "Error: Failure" when sources go into new folders

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished | User report with 2.0.0 (Run build, 84 sources, Windows client) | – |


# Current situation

*Run build* stopped in the phase *upload sources* with nothing but `Build failed: Error: Failure`; the stack trace ends in ssh2's SFTP status handler.

`SSH_Tasks.transferSources` (also `transfer_files`, `upload_project_files`) uploads with node-ssh `putFiles` and `ssh-concurrency` (default 5) parallel uploads over one SFTP channel. For a missing folder, each `putFile` gets *No such file* and calls node-ssh `mkdir`: `stat` the folder, then `mkdir` it. Parallel uploads into the same new folder send their `stat` requests before any `mkdir`, so all of them send a `mkdir`. The first succeeds; OpenSSH's sftp-server answers the others with EEXIST, which SFTP v3 has no code for: status 4, text `Failure`. node-ssh retries only on *No such file*, so `putFiles` rejects.

It happens whenever two files of a batch go into a folder that doesn't exist on the IBM i yet, e.g. the first build after new libraries or source files were added, or into a project folder that only contains `src`.

Reproduced against a local OpenSSH sshd: 18 files into 3 new folders, concurrency 5 → `Error: Failure` (code 4) on every run.

`putDirectory` (*Transfer project*) is not affected: it creates all folders first, shortest path first, and the server handles the requests in order (also checked against the local sshd with a missing target folder).


# Fix

* `mkdir_parents_commands(remote_files)` in [ShellQuote.ts](../../src/shared/ShellQuote.ts): `mkdir -p --` commands for the folders of the files, each folder once, only the deepest ones (`-p` creates the parents), quoted with `sh_quote`, 200 folders per command.
* `SSH_Tasks.put_files` runs these commands, then `putFiles`. All three callers use it. One extra round trip per upload; if a command fails, nothing is uploaded and the error contains the stderr of `mkdir` (*Creating the remote folders failed: …*).


# Tests

* Unit ([ShellQuote.test.ts](../../src/test/unit/ShellQuote.test.ts)): folders once and only the deepest; backslashes, files without a folder, quoting, chunks; the commands create the folders in `sh` (path with space and quote).
* Integration ([Transfer.test.ts](../../src/test/suite/Transfer.test.ts)): `transferSources` sends one `mkdir -p` with the source and `.obi/etc` folders before `putFiles`; a failed `mkdir` rejects with its stderr and uploads nothing.
* Manually against a local OpenSSH sshd: 81 files into 4 new folders at concurrency 32 succeed.


### Definition of done
* Uploads into new folders work at any `ssh-concurrency`
* CHANGELOG entry
