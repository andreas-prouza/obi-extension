# Safe remote delete ("Transfer all", remote source clean-up)

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🔴 | finished (unit/integration tests; not yet run against an IBM i) | [security.md S3](../improvements/security.md#s3--unquoted-weakly-guarded-rm--rf-on-the-ibm-i) | [remote-command-quoting.md](remote-command-quoting.md), [remote-home-directory.md](remote-home-directory.md) |

Also fixes the dialog wording of [bugs.md #4](../bugs.md#4--transfer-all-deletes-the-remote-project-folder).

[open-tasks.md](../open-tasks.md) plans to remove "Transfer all" and always use the minimum transfer. The minimum transfer (`transfer_minimum_now`, [OBITools.ts:1049-1062](../../src/extension/utilities/OBITools.ts#L1049-L1062)) also starts with `cleanup_directory()`, so this fix is needed either way. Once "Transfer all" is gone, the first dialog in step 3 shrinks to the delete confirmation.


# Current situation

`SSH_Tasks.cleanup_directory()` ([SSH_Tasks.ts:269-303](../../src/extension/utilities/SSH_Tasks.ts#L269-L303)):
* rejects `remote-base-dir` only if it is shorter than 4 characters;
* asks "Process with remote folder: '<path>'?" without saying that the folder is deleted;
* runs `… && cd && … && rm -rf ${remote_base_dir}` **unquoted**. The `pwd` length check tests the current directory, not the target.

`get_finalized_remote_path` turns `~` into `/home/<user>`, so `remote-base-dir = "~"` passes every check and deletes the user's home directory, including `.ssh`.

`delete_sources()` ([SSH_Tasks.ts:243-264](../../src/extension/utilities/SSH_Tasks.ts#L243-L264)) runs one unquoted `rm ${file_path}` per file in parallel and ignores the exit codes.

`OBITools.self_check()` ([OBITools.ts:60-70](../../src/extension/utilities/OBITools.ts#L60-L70)) only rejects the exact value `/`.


# Fix

## 1. Pure validation function

New function in `src/extension/utilities/RemotePathGuard.ts`:

```ts
const DENY_EXACT = ['/', '/home', '/tmp', '/var', '/etc', '/usr', '/bin', '/dev', '/QOpenSys', '/QOpenSys/pkgs'];
const DENY_PREFIX = ['/QSYS.LIB', '/QIBM', '/QDLS', '/QFileSvr.400', '/QOPT', '/QNTC'];

/** Returns an error text if `abs_path` must not be deleted recursively, otherwise undefined. */
export function check_remote_delete_target(abs_path: string, remote_home: string): string | undefined
```

Rules (case-insensitive for the `/Q…` file systems):
* `abs_path` must be absolute and normalised (no `..`, no trailing `/`).
* It must not be in `DENY_EXACT` and must not start with an entry of `DENY_PREFIX`.
* It must not be equal to `remote_home` or an ancestor of it.
* It must have at least 2 path segments (`/apps/proj` is OK, `/apps` is not).

## 2. Resolve the target on the IBM i

In `cleanup_directory`:
1. `const target = await SSH_Tasks.get_remote_base_dir()` (resolved, see [remote-command-quoting.md](remote-command-quoting.md)).
2. Run `cd -- ${sh_quote(target)} 2>/dev/null && pwd -P` (relative paths are resolved against the login directory, as they are today).
   * Exit code ≠ 0 → the folder doesn't exist. Nothing to delete; continue with the transfer (it creates the folder).
3. Run `check_remote_delete_target(abs, remote_home)`. If it returns an error → `showErrorMessage` with the text and abort.
4. Marker check: `test -f ${sh_quote(abs + '/' + Constants.OBI_APP_CONFIG_FILE)}`. If the marker is missing, show a second modal: "'<abs>' on <host> does not contain an OBI project (.obi/etc/app-config.toml). Delete it anyway?" Only an explicit button continues.

## 3. Clear confirmation dialog

Replace the current dialog with one modal warning:

> **Delete remote folder?**
> All files in `<abs>` on `<host>` will be deleted and the project will be uploaded again.

Buttons: `Delete and transfer` / (Cancel). The first dialog in `process_transfer_project_folder` ([OBITools.ts:1004-1025](../../src/extension/utilities/OBITools.ts#L1004-L1025)) should also say that the remote folder is replaced. If the user cancels, return silently (see [input-cancel-shows-error.md](input-cancel-shows-error.md)).

## 4. Delete command

```ts
const cmd = SSH_Tasks.get_finalized_command(`rm -rf -- ${sh_quote(abs)}`);
```

No `cd` gymnastics. Check `result.code` and show stderr on failure.

## 5. `delete_sources`

* Validate each entry with `assert_valid_source_path`.
* Build one command `rm -f -- 'a' 'b' …` (chunked by about 100 files) instead of N parallel exec channels.
* Check exit codes and return the list of files that could not be deleted.

## 6. Local check

Extend `OBITools.self_check()` to reject `remote-base-dir` values `~`, `~/`, `$HOME`, `/home`, `/home/$USER` early with a clear message (same wording as step 1).


# Tests

* Unit tests for `check_remote_delete_target`:
  * rejected: `/`, `/home`, `/home/user` (= home), `/home` with home `/home/user`, `/QSYS.LIB/X.LIB`, `/qsys.lib/x.lib`, `/QOpenSys`, `/apps`;
  * accepted: `/home/user/proj`, `/apps/proj`, `/home/user/a/b`.
* Unit test: the command built for `abs = "/home/u/my proj"` is `rm -rf -- '/home/u/my proj'`.


### Definition of done
* `cleanup_directory` resolves the absolute target remotely, validates it with `check_remote_delete_target`, checks for the OBI marker and shows the new dialog with host and absolute path
* `rm -rf` is only executed with a quoted, validated absolute path
* `delete_sources` quotes, validates and checks exit codes
* `self_check` rejects home-directory values for `remote-base-dir`
* Unit tests pass
* [building.md](../../asserts/docs/building.md) / [ssh.md](../../asserts/docs/ssh.md) describe that "Transfer all" replaces the remote folder
* Remove [bugs.md #4](../bugs.md#4--transfer-all-deletes-the-remote-project-folder); CHANGELOG entry
