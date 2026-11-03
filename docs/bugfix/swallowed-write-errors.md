# Write errors are swallowed and writes are not atomic

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟠 | finished (excluding `*.tmp` from watchers/transfer is left to file-watcher-debounce / sensitive-files-upload) | [reliability.md R3](../improvements/reliability.md#r3--write-errors-are-swallowed-and-writes-are-not-atomic) | – |

Implement together with [config-overwrite-on-parse-error.md](config-overwrite-on-parse-error.md) (same functions in `DirTool`). Uses `show_error` from [features/error-messages.md](../features/error-messages.md) if available.


# Current situation

* `DirTool.write_json` ([DirTool.ts:247-265](../../src/extension/utilities/DirTool.ts#L247-L265)), `write_toml` ([DirTool.ts:341-361](../../src/extension/utilities/DirTool.ts#L341-L361)) and `write_file` ([DirTool.ts:365-383](../../src/extension/utilities/DirTool.ts#L365-L383)) catch every error and only log it, partly with misleading texts ("Parsing toml content…", "Writing JSON to file 2"). Callers can't know that nothing was written.
* `OBIConfiguration.save_config` shows "Configuration saved" **before** writing ([OBIConfiguration.ts:419](../../src/webview/controller/OBIConfiguration.ts#L419)). `OBISourceConfiguration.save_config` shows its message after a write that may have failed.
* `fs.writeFileSync` truncates the target first. If VS Code or the machine crashes during the write, or the disk is full, the file is left empty or partial. Readers then hit the parse-error path ([config-overwrite-on-parse-error.md](config-overwrite-on-parse-error.md)).


# Fix

## 1. Atomic write helper

```ts
/** Writes via a temp file + rename so readers never see a partial file. Throws on failure. */
public static write_atomic(file: string, content: string): void {
  file = DirTool.resolve_env_in_path(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) {
      // Windows: target briefly locked by a watcher / virus scanner
      if (attempt < 3 && is_errno(e, ['EPERM', 'EBUSY', 'EACCES'])) { sleep_sync(50); continue; }
      fs.rmSync(tmp, { force: true });
      throw e;
    }
  }
}
```

(`sleep_sync` can be `Atomics.wait` on a small `SharedArrayBuffer`. If the async variant is preferred, add `write_atomic_async` with `fs.promises` and await it where callers are already async.)

## 2. Make the write functions throw

* `write_json`, `write_toml`, `write_file` call `write_atomic` and **don't catch**. Remove the misleading log texts, and log the target at `debug` level.
* Temp files `*.tmp` next to config files must be ignored by the file watchers ([HealthyWatchdog.ts](../../src/extension/utilities/HealthyWatchdog.ts)) and by the transfer ([sensitive-files-upload.md](sensitive-files-upload.md) exclude list).

## 3. Handle errors at the boundary

Callers that are triggered by the UI catch and report the error once:
* every webview `onReceiveMessage` handler: wrap the `switch` in `try/catch` → `show_error('Saving failed', e)` (or `showErrorMessage(message)` until the helper exists);
* tree commands in `SourceListProvider` / `BuildHistoryProvider`;
* build flow: `OBITools.write_compile_list` is already called inside `try` blocks in `rerun_build` / `show_changes`. Check that the message is meaningful there.

## 4. Success messages after the write

* `OBIConfiguration.save_config`: move `showInformationMessage('Configuration saved')` after `write_toml`, or better, post `finished_saving_config` to the webview (the handler already exists in [config.ts](../../src/webview/controller/javascript/config.ts)) and show the in-page alert instead of a notification.
* `OBISourceConfiguration.save_config`: same.


# Tests

* Unit test: `write_atomic` on a read-only directory throws, and the original file is unchanged.
* Unit test: after `write_atomic`, no `*.tmp` file remains.
* Unit test: `OBIConfiguration.save_config` with a stubbed failing `write_toml` does not show "Configuration saved".


### Definition of done
* All config/JSON writes are atomic and throw on failure
* UI entry points show one meaningful error; nothing reports success after a failed write
* Watchers and transfer ignore `*.tmp`
* Unit tests pass; CHANGELOG entry
