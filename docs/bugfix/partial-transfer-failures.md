# Partial transfer failures go unnoticed

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished (upload errors of `putFiles` are passed on unchanged) | [reliability.md R8](../improvements/reliability.md#r8--partial-transfer-failures-go-unnoticed) | – |

Remote deletes (`delete_sources`) are handled in [remote-delete-guard.md](remote-delete-guard.md).


# Current situation

* `SSH_Tasks.getRemoteDir` ([SSH_Tasks.ts:177-211](../../src/extension/utilities/SSH_Tasks.ts#L177-L211)) collects failed files in `failed[]` via the `tick` callback, logs them and returns `void`. node-ssh's `getDirectory` resolves `false` when items failed, but that return value is ignored as well.
* `get_remote_build_output` ([OBICommands.ts:206-248](../../src/extension/obi/OBICommands.ts#L206-L248)) therefore continues after a partial download. It copies `.obi/tmp` into the build history and updates `object-builds.json` from whatever `compile-list.json` is on disk, which may be the **old** one if its download failed.
* `transfer_dir` ([SSH_Tasks.ts:412-415](../../src/extension/utilities/SSH_Tasks.ts#L412-L415)) throws `${successful.length} of ${failed.length} failed`. The numbers are swapped, and the failed paths are not shown.


# Fix

## 1. Result type

```ts
export interface TransferResult {
  transferred: number;
  failed: { path: string; error: string }[];
}
```

* `getRemoteDir(local, remote): Promise<TransferResult>`: also treat a `false` return of `getDirectory` as failure if `failed` is empty (add the directory itself).
* `ssh_put_dir` / `transfer_dir`: same type. `transfer_dir` throws a `TransferError` (subclass of `Error` with `result: TransferResult`) when `failed.length > 0`, with the message `"<n> of <total> files could not be transferred to <remote_dir>"`, listing up to 10 paths.

## 2. Build result download

In `get_remote_build_output`:
1. Download `compile-list.json` **first and on its own** (`getRemoteFile`). If that fails → throw `"Build results could not be downloaded: <error>"`. In that case, don't create a history entry and don't update `object-builds.json`.
2. Download the other directories (`build-output`, `.obi/tmp`, `.obi/log`) and merge their `TransferResult`s.
3. If some of them failed: continue, but show a warning:
   > Build finished, but 3 result files could not be downloaded (joblogs/evfevent may be missing). [Show log]

## 3. Uploads

`transferSources` / `transfer_files` use `putFiles`, which rejects on the first error. Wrap the error so the message names the file (`"Upload of <local> failed: <reason>"`).


# Tests

Unit tests with a stubbed `NodeSSH` (sinon):
* `getDirectory` calls `tick` with one error → `TransferResult.failed.length === 1`.
* `get_remote_build_output` when `getRemoteFile(compile-list.json)` rejects → throws, `write_compile_list` and `write_json(object-builds)` are not called.
* `transfer_dir` with 2 failed of 10 → error message "2 of 10 files…".


### Definition of done
* All directory transfers return or throw a `TransferResult`; failed paths are visible to the user
* A failed `compile-list.json` download never updates history or `object-builds.json`
* Error message numbers are correct
* Unit tests pass; CHANGELOG entry
