# Focused, debounced file watchers

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Feature | 🟠 | finished (Unreleased) | [performance.md P6](../improvements/performance.md#p6--the-obi-file-watcher-hashes-every-changed-file-and-triggers-refresh-storms) | [config-cache-invalidation.md](config-cache-invalidation.md) (glob callbacks) |


# Current situation

[HealthyWatchdog.ts](../../src/extension/utilities/HealthyWatchdog.ts):
* One watcher for `{.obi/etc,.obi/source-list,.obi/build-output,.obi/build-history,.obi/tmp}/**/*` (create, change, delete).
* Every event on a file triggers an MD5 hash of that file ([lines 92-99](../../src/extension/utilities/HealthyWatchdog.ts#L92-L99)). That includes every file a build writes into `.obi/tmp` and `.obi/build-output`, and every file copied into `.obi/build-history/<ts>` after each build. The `file_hashes` map grows without limit.
* Each event under `.obi/build-history` refreshes the history tree, so one build can cause dozens of refreshes.
* The source watcher ([lines 116-131](../../src/extension/utilities/HealthyWatchdog.ts#L116-L131)) reloads the complete source list on every create/delete under `src/`. A branch switch touching 1,000 files causes repeated full rescans (only coalesced while one scan is running).
* `console.log` on every event.

The hash check exists to suppress no-op changes, e.g. `workspace-settings.json` being rewritten with the same content by `Workspace.change_profile`, which would otherwise loop through the callback.


# New feature

## 1. Watch only what has a callback

| Pattern | Events | Action |
|---|---|---|
| `.obi/etc/*.{toml,json}` | create, change, delete | config callbacks (glob table from [config-cache-invalidation.md](config-cache-invalidation.md)) |
| `.obi/source-list/*.json` | create, change, delete | source filter tree refresh |
| `.obi/build-history/*` (folders, depth 1) | create, delete | build history refresh |
| `{.obi/etc,.obi/source-list,.obi/build-output,.obi/build-history,.obi/tmp}` (the folders themselves) | delete | recreate folder (as today) |
| `<source-dir>/**/*` | create, delete | reload source list |

No watcher on `.obi/tmp/**` or `.obi/build-output/**` content.

## 2. Debounce per action

```ts
export function debounce(fn: () => void, ms: number): () => void
```

* Config callbacks: 200 ms. History refresh: 500 ms. Source list reload: 500 ms (trailing).
* One debounced function per action key, so a burst of events results in one call.

## 3. No-op detection without hashing everything

* Keep a content hash only for files in `.obi/etc` smaller than 1 MB, in a map limited to those files.
* Fix the loop at its source as well: `Workspace.change_profile` writes `workspace-settings.json` only if the profile actually changes.

## 4. Logging

Replace the `console.log` calls with `logger.debug` (see [replace-console-log-with-logger.md](replace-console-log-with-logger.md)).


## Result

* Watched: `.obi/etc/*.{toml,json}`, `.obi/source-list/**`, `.obi/build-history/{*,*/compile-list.json}`, the OBI folders themselves (delete) and the source folder (create/delete). The callback table is [ConstantsCallback.ts](../../src/file_callbacks.ts).
* A folder that is created with content (e.g. a new build in the history) is reported by VS Code as one event for the folder, without events for its files.
* `workspace-settings.json`: besides not rewriting an unchanged profile, the callback only switches the profile if the file names another profile than the last switch (`Workspace.apply_profile_from_settings`).
* The OBI folders themselves are also watched for creation: the first build of a project creates `.obi/build-history` together with its first build, reported as one event for `.obi/build-history`.
* The manual check (`git checkout` with many source changes) is open.


# Tests

* Unit test for `debounce`: 10 calls within 100 ms → 1 execution.
* Integration test: copy 50 files into `.obi/build-history/<new>` → history refresh callback runs once (spy).
* Manual: `git checkout` of a branch with many source changes → source list reloads once after the checkout.


### Definition of done
* Watchers cover only files with callbacks; build output and tmp are not watched
* All callbacks are debounced
* Hashing limited to small config files; no unbounded map
* `change_profile` doesn't rewrite unchanged settings
* CHANGELOG entry
