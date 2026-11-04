# Update the OBI backend automatically

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟡 | finished (Unreleased; local update tested with real repositories, the remote script with bash and git locally, not yet on an IBM i) | [open-tasks.md](../open-tasks.md) (2026-11-04) | – |

Also fixes: the *Update* button after a run of an older backend only pulled the local backend, although a build always runs the backend on the IBM i. Without `local-obi-dir` it ran `git pull` in an empty working folder.


# Current situation

* The OBI backend is a git checkout: `git clone`, then `setup*.sh` / `setup.bat` creates `venv` and installs `requirements.txt`. It exists on the IBM i (`remote-obi-dir`, runs every build) and optionally locally (`local-obi-dir`, creates the build list).
* Updating means `git pull` by hand in both places.
* After a run, `OBIController.check_obi_response` reads `.obi/build-output/status.json`. If its `version` is lower than `Constants.OBI_BACKEND_VERSION`, it offers *Update*, which ran `git pull` in `local-obi-dir` only. `status.json` is written by the backend that ran last: the local one (*Show changes*) or the one on the IBM i (build).


# New feature

## Settings (`package.json`, scope `machine`)

| Setting | Default | Effect |
|---|---|---|
| `obi.backend.autoUpdateLocal` | `false` | `git pull` in `local-obi-dir` once per session, when the project services start (`start_project_services`) |
| `obi.backend.autoUpdateRemote` | `false` | `git pull` in `remote-obi-dir`, once per session and IBM i (`user@host:port:dir`), before the first remote OBI command (`create` or `run`) |

Scope `machine`: an update of a shared installation is a personal decision, so a committed `.vscode/settings.json` can't turn it on.

## Pull ([GitPull.ts](../../src/shared/GitPull.ts), [BackendUpdate.ts](../../src/extension/obi/BackendUpdate.ts))

* `git pull --ff-only --no-rebase` with `GIT_TERMINAL_PROMPT=0`: never a merge commit or rebase, never waits for input. `--no-rebase` because git before 2.34 rebases with `pull.rebase = true` in spite of `--ff-only`.
* Only a folder with `.git` is updated; otherwise a warning says it is not a git repository.
* `git rev-parse HEAD` before and after; if it changed, `git diff --name-only` tells whether `requirements.txt` changed. Then the message asks to run the setup script again. Installing packages automatically is not done (it runs more code from the network, and the setup differs per platform).
* Local: without a shell (`SystemCmdExecution`, new option `env`), under the `OperationLock` (label *Updating the OBI backend*), so no local OBI runs while files change. Cancel works like for other operations.
* IBM i: one bash script (`remote_pull_script`, folder quoted with `sh_quote`, `/QOpenSys/pkgs/bin` on the `PATH`) through `SSH_Tasks.execute_streaming`; the result comes from a marker line `OBI-PULL <old> <new>` followed by the changed files. Output goes to **OBI Build**. A failure is shown and the build goes on; a cancel stops the build. Each IBM i is tried once per session, also after a failure.
* Messages: updated / updated with new requirements / not a git repository / failed; *up to date* only for the *Update* button.

## *Update* button

`BackendUpdate.update_now`: the local backend (if `local-obi-dir` is set) and the one on the IBM i, under the `OperationLock`, with a message for every result.


# Tests

* Unit ([GitPull.test.ts](../../src/test/unit/GitPull.test.ts)): result and output parsing, quoting; the remote script with bash and real repositories (up to date, updated with new requirements, `pull.rebase = true` with own commits, no repository, missing folder). Skipped on Windows.
* Integration ([BackendUpdate.test.ts](../../src/test/suite/BackendUpdate.test.ts)): `pull_local` up to date / updated / own commits / no `.git`; `update_local_on_start` only with the setting and once per session. `SystemCmdExecution` passes `env`.
* Manual: IBM i with and without internet access, shared `remote-obi-dir` without write access.


### Definition of done
* Both settings in `package.json` with English and German texts
* Local update on start, remote update once per session and IBM i
* *Update* button updates both backends
* User documentation ([configuration.md](../../asserts/docs/configuration.md#updating-the-obi-backend)) and CHANGELOG
