# Change-based config cache

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased) | [performance.md P5](../improvements/performance.md#p5--config-cache-is-time-based-2-s-instead-of-change-based) | [bugfix/config-overwrite-on-parse-error.md](../bugfix/config-overwrite-on-parse-error.md) |

Related: [file-watcher-debounce.md](file-watcher-debounce.md).


# Current situation

* `AppConfig.get_app_config()` ([AppConfig.ts:350-392](../../src/extension/config/AppConfig.ts#L350-L392)) reuses the cached config for **2 seconds**, then reads and parses `app-config.toml` and the current user config again. It is called almost everywhere, including inside recursions (e.g. `dependency.ts`).
* `get_source_configs()`, `Workspace.get_workspace_settings()` and `ExtendedSourceProcessingList` aren't cached at all; every call reads the file.
* The watcher callback that should reset the cache for user configs is keyed `.user-app-config` ([ConstantsCallback.ts:22-24](../../src/file_callbacks.ts#L22-L24)). `check_dir_change_callback` compares it with the workspace-relative path `.obi/etc/.user-app-config….toml` as a directory prefix, so it never matches. Only the 2-second TTL makes user-config edits visible.


# New feature

## 1. Validate by file stamp

A small helper `CachedFile<T>`:

```ts
export class CachedFile<T> {
  private stamp: string | undefined;       // `${mtimeMs}:${size}` or 'missing'
  private value: T | undefined;

  constructor(private readonly file: () => string, private readonly load: (file: string) => T) {}

  get(): T {
    const f = this.file();
    const s = stamp_of(f);                 // fs.statSync, 'missing' if ENOENT
    if (s !== this.stamp) { this.value = this.load(f); this.stamp = s; }
    return this.value as T;
  }

  reset(): void { this.stamp = undefined; }
}
```

A `stat` costs microseconds, so `get_app_config()` stays cheap even when called in loops. The stamp also catches changes made outside VS Code (git checkout, other editors) that a watcher might miss, e.g. on network drives.

## 2. Use it for

| Cache | File(s) |
|---|---|
| `AppConfig` (merged) | `app-config.toml` + current profile's user config (the stamp combines both; the file name depends on the profile) |
| `get_source_configs()` | `source-config.toml` |
| `Workspace.get_workspace_settings()` | `workspace-settings.json` |
| ESP config (project + user) | the two ESP files |

* Remove the 2-second TTL (`_last_loading_time`).
* Parse errors: the cache stores the error and rethrows it until the stamp changes, so a broken file is reported once per change, not per call.

## 3. Watcher callbacks

* Replace the directory-prefix matching in `HealthyWatchdog.check_dir_change_callback` with glob patterns (`minimatch`), e.g. `.obi/etc/.user-app-config*.toml`, `.obi/etc/app-config.toml`, `.obi/etc/source-config.toml`.
* The callbacks only trigger UI refreshes (views, config panel). Cache correctness no longer depends on them.

## 4. Read-only results

The returned config objects are shared. Mark the getters' return types as `Readonly<…>` where practical, and deep-freeze them in tests to find code that mutates them. Code that needs a modifiable copy (e.g. `OBIConfiguration.save_config`) reads the raw file itself, as it does today.


## Result

* `CachedFiles` ([CachedFiles.ts](../../src/shared/CachedFiles.ts)) with the stamp `mtimeMs:size:ino` (the inode catches atomic writes with the same size and time).
* Glob matching uses `minimatch` (already a dependency) instead of an own matcher.
* `get_project_app_config` / `get_user_app_config` stay uncached: the config page edits these raw objects. The ESP config is cached as raw data and copied for each `ExtendedSourceProcessingList`, because those objects are edited and saved.
* The integration tests run with `OBI_FREEZE_CONFIG=1`: cached values are deep-frozen, so code that modifies them fails. Only a test modified the shared config; the profile switch and the source rename now copy before writing.


# Tests

* Unit test: two `get()` calls without file change → `load` called once; after writing the file → called again.
* Unit test: changing the active profile (different user config file) → reload.
* Unit test: a parse error is thrown again on the next `get()` without reloading; after fixing the file it loads.


### Definition of done
* No time-based cache; all config reads validated by file stamp
* Source config, workspace settings and ESP config cached the same way
* Watcher callback for user configs fixed (glob matching)
* Unit tests pass; CHANGELOG entry
